import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { ClientsRepository } from '../clients/clients.repository';
import { ConvitesService } from '../convites/convites.service';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import type { UserEntity } from './user.entity';
import { UsersRepository } from './users.repository';

const CREATABLE_ROLES = ['gestor', 'operador'] as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly audit: AuditLogRepository,
    private readonly clients: ClientsRepository,
    private readonly convites: ConvitesService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  findTeam(clientId: string) {
    return this.repo.findManyByClient(clientId);
  }

  /**
   * O Admin convida Gestor/Operador para o próprio cliente — nunca outro Admin (isso só nasce pelo
   * superadmin, `src/superadmin/`, evitando que um Admin se multiplique sem controle da Locale). O usuário
   * nasce sem senha e define a própria pelo link de uso único (mesmo fluxo do admin inicial): quem convida
   * nunca conhece a senha. `clientId` vem de `@ClientId()` (JWT), nunca do corpo. Usuário + convite +
   * auditoria na mesma transação; o e-mail sai depois do commit.
   */
  async convidarMembro(clientId: string, actingAdminId: string, data: { email: string; role: 'gestor' | 'operador' }) {
    if (!CREATABLE_ROLES.includes(data.role)) {
      throw new BadRequestException('Papel inválido — só "gestor" ou "operador" podem ser convidados por aqui');
    }
    const cliente = await this.clients.findById(clientId);
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    let criado: { user: UserEntity; token: string };
    try {
      criado = await withTransaction(this.pool, async (client) => {
        const user = await this.repo.create({ clientId, email: data.email, passwordHash: null, role: data.role }, client);
        const token = await this.convites.emitir(client, { userId: user.id, clientId, criadoPor: actingAdminId });
        await this.audit.record(
          { actorType: 'user', actorId: actingAdminId, clientId, action: 'user.create', target: user.id, after: { email: user.email, role: user.role } },
          client,
        );
        return { user, token };
      });
    } catch (err) {
      if (violouUnique(err, UNIQUE.usuarioEmail)) throw new ConflictException('Já existe um usuário com este e-mail');
      throw err;
    }
    const entrega = await this.convites.entregar(criado.user.email, cliente.name, criado.token, criado.user.role);
    this.logger.log(`membro convidado user_id=${criado.user.id} client_id=${clientId} por user_id=${actingAdminId} email_enviado=${entrega.conviteEnviado}`);
    return { user: criado.user, ...entrega };
  }

  /** Novo link (o anterior deixa de valer). Só para Gestor/Operador que ainda não definiu a senha. */
  async reenviarConvite(clientId: string, actingAdminId: string, userId: string) {
    const cliente = await this.clients.findById(clientId);
    const user = cliente ? await this.repo.findOneByClient(clientId, userId) : null;
    if (!cliente || !user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'admin') throw new ForbiddenException('Convite de admin é reenviado pela Locale');
    if (user.password_hash) throw new BadRequestException('Usuário já definiu a senha — o convite não se aplica mais');
    if (user.desativado_em) throw new BadRequestException('Usuário desativado — reative antes de reenviar o convite');
    const token = await withTransaction(this.pool, async (client) => {
      const t = await this.convites.emitir(client, { userId, clientId, criadoPor: actingAdminId });
      await this.audit.record({ actorType: 'user', actorId: actingAdminId, clientId, action: 'user.reenviar_convite', target: userId }, client);
      return t;
    });
    return this.convites.entregar(user.email, cliente.name, token, user.role);
  }

  /**
   * Mesma política da criação: o Admin só desativa/reativa Gestor e Operador do próprio cliente — nunca a
   * si mesmo (ficaria sem admin) nem outro Admin (isso é da Locale). Mutação + auditoria na mesma transação.
   */
  async setAtivo(clientId: string, actingAdminId: string, userId: string, ativo: boolean) {
    if (userId === actingAdminId) throw new BadRequestException('Você não pode alterar o próprio acesso');
    return withTransaction(this.pool, async (client) => {
      const alvo = await this.repo.findOneByClient(clientId, userId, client);
      if (!alvo) throw new NotFoundException('Usuário não encontrado');
      if (alvo.role === 'admin') throw new ForbiddenException('Admin só é desativado pela Locale');
      if ((alvo.desativado_em === null) === ativo) return alvo;
      const atualizado = (await this.repo.setDesativadoEm(clientId, userId, ativo ? null : new Date(), client))!;
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingAdminId,
          clientId,
          action: ativo ? 'user.reativar' : 'user.desativar',
          target: userId,
          before: { ativo: !ativo },
          after: { ativo },
        },
        client,
      );
      return atualizado;
    });
  }
}
