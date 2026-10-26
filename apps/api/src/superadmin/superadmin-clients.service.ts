import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ClientsRepository } from '../clients/clients.repository';
import type { ClientEntity } from '../clients/client.entity';
import { ConvitesService } from '../convites/convites.service';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import { withTransaction } from '../db/with-transaction';
import { UsersRepository } from '../users/users.repository';
import type { UserEntity } from '../users/user.entity';


/**
 * Ações de superadmin sobre um cliente — sempre com `client_id` explícito (nunca implícito de um token,
 * porque o token de superadmin não tem um) e sempre auditadas (requisito: "qualquer operação sobre um
 * cliente deve utilizar um contexto explícito e auditável"). Mutação + auditoria na mesma transação
 * (achado #4 da auditoria de 23/10/2026).
 *
 * Admin do cliente nasce sem senha, com convite por e-mail (decidido em 24/10/2026): a Locale nunca
 * conhece a senha; o próprio admin a define ao abrir o link, o que também confirma o e-mail.
 */
@Injectable()
export class SuperadminClientsService {
  private readonly logger = new Logger(SuperadminClientsService.name);

  constructor(
    private readonly clients: ClientsRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditLogRepository,
    private readonly convites: ConvitesService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * `admin` opcional: cliente e admin inicial nascem juntos, numa transação só — se o e-mail do admin já
   * existir, o cliente também não fica criado (sem cliente órfão sem acesso). O e-mail sai depois do commit.
   */
  async createClient(
    superadminId: string,
    data: { name: string; revendaId?: string; admin?: { email: string } },
  ): Promise<{ client: ClientEntity; admin: UserEntity | null; conviteEnviado: boolean }> {
    const result = await this.emailUnico(() =>
      withTransaction(this.pool, async (tx) => {
        const created = await this.clients.create({ name: data.name, revendaId: data.revendaId }, tx);
        await this.audit.record(
          { actorType: 'superadmin', actorId: superadminId, clientId: created.id, action: 'client.create', target: created.id, after: { name: created.name } },
          tx,
        );
        const admin = data.admin ? await this.insertAdmin(tx, superadminId, created.id, data.admin.email) : null;
        return { client: created, admin };
      }),
    );
    const conviteEnviado = result.admin ? await this.convites.enviar(result.admin.user.email, result.client.name, result.admin.token) : false;
    this.logger.log(`cliente criado client_id=${result.client.id} por superadmin=${superadminId} admin_inicial=${result.admin?.user.id ?? 'nenhum'}`);
    return { client: result.client, admin: result.admin?.user ?? null, conviteEnviado };
  }

  async createInitialAdmin(superadminId: string, clientId: string, data: { email: string }): Promise<{ user: UserEntity; conviteEnviado: boolean }> {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundException('Cliente não encontrado');
    const { user, token } = await this.emailUnico(() =>
      withTransaction(this.pool, (tx) => this.insertAdmin(tx, superadminId, clientId, data.email)),
    );
    const conviteEnviado = await this.convites.enviar(user.email, client.name, token);
    this.logger.log(`admin inicial convidado user_id=${user.id} client_id=${clientId} por superadmin=${superadminId}`);
    return { user, conviteEnviado };
  }

  /** Novo link (o anterior deixa de valer). Só para quem ainda não definiu senha. */
  async reenviarConvite(superadminId: string, clientId: string, userId: string): Promise<{ conviteEnviado: boolean }> {
    const client = await this.clients.findById(clientId);
    const user = client ? await this.users.findOneByClient(clientId, userId) : null;
    if (!client || !user) throw new NotFoundException('Usuário não encontrado');
    if (user.password_hash) throw new BadRequestException('Usuário já definiu a senha — o convite não se aplica mais');
    const token = await withTransaction(this.pool, async (tx) => {
      const t = await this.convites.emitir(tx, { userId, clientId, criadoPor: superadminId });
      await this.audit.record(
        { actorType: 'superadmin', actorId: superadminId, clientId, action: 'user.reenviar_convite', target: userId },
        tx,
      );
      return t;
    });
    return { conviteEnviado: await this.convites.enviar(user.email, client.name, token) };
  }

  private async insertAdmin(executor: Queryable, superadminId: string, clientId: string, email: string) {
    const user = await this.users.create({ clientId, email, passwordHash: null, role: 'admin' }, executor);
    const token = await this.convites.emitir(executor, { userId: user.id, clientId, criadoPor: superadminId });
    await this.audit.record(
      { actorType: 'superadmin', actorId: superadminId, clientId, action: 'user.create_initial_admin', target: user.id, after: { email: user.email, role: user.role } },
      executor,
    );
    return { user, token };
  }

  /** `users.email` é único na plataforma inteira: duplicado vira 409, não 500. */
  private async emailUnico<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (violouUnique(err, UNIQUE.usuarioEmail)) throw new ConflictException('E-mail já cadastrado');
      throw err;
    }
  }
}
