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
  ): Promise<{ client: ClientEntity; admin: UserEntity | null; conviteEnviado: boolean; link: string | null }> {
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
    const entrega = result.admin ? await this.convites.entregar(result.admin.user.email, result.client.name, result.admin.token) : { conviteEnviado: false, link: null };
    this.logger.log(`cliente criado client_id=${result.client.id} por superadmin=${superadminId} admin_inicial=${result.admin?.user.id ?? 'nenhum'}`);
    return { client: result.client, admin: result.admin?.user ?? null, ...entrega };
  }

  async createInitialAdmin(superadminId: string, clientId: string, data: { email: string }): Promise<{ user: UserEntity; conviteEnviado: boolean; link: string | null }> {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundException('Cliente não encontrado');
    const { user, token } = await this.emailUnico(() =>
      withTransaction(this.pool, (tx) => this.insertAdmin(tx, superadminId, clientId, data.email)),
    );
    const entrega = await this.convites.entregar(user.email, client.name, token);
    this.logger.log(`admin inicial convidado user_id=${user.id} client_id=${clientId} por superadmin=${superadminId}`);
    return { user, ...entrega };
  }

  /** Novo link (o anterior deixa de valer). Só para quem ainda não definiu senha. */
  async reenviarConvite(superadminId: string, clientId: string, userId: string): Promise<{ conviteEnviado: boolean; link: string | null }> {
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
    return this.convites.entregar(user.email, client.name, token);
  }

  /**
   * Exclusão de vez, para cadastro errado ou cliente de teste. Com fatura ou pagamento lançado, recusa: o histórico
   * financeiro da Localle não pode sumir. Os rastreadores voltam para o estoque (instalações e vínculos saem em
   * cascata) e a telemetria do cliente é apagada — `posicoes`/`eventos`/`ultima_posicao` não têm FK para `clients`
   * (hypertables), por isso saem à mão; o resto (frota, usuários, alertas, contrato...) sai em cascata. Quem estiver
   * logado no cliente cai na próxima requisição (o AuthGuard confere se o usuário existe).
   */
  async excluirCliente(superadminId: string, clientId: string): Promise<void> {
    const { nome, resumo } = await withTransaction(this.pool, async (tx) => {
      const { rows: [client] } = await tx.query<ClientEntity>('select * from clients where id = $1 for update', [clientId]);
      if (!client) throw new NotFoundException('Cliente não encontrado');
      const { rows: [r] } = await tx.query<{ faturas: number; pagamentos: number; usuarios: number; veiculos: number; instalacoes: number; vinculos: number }>(
        `select (select count(*)::int from faturas where client_id = $1) as faturas,
                (select count(*)::int from pagamentos where client_id = $1) as pagamentos,
                (select count(*)::int from users where client_id = $1) as usuarios,
                (select count(*)::int from assets where client_id = $1) as veiculos,
                (select count(*)::int from instalacoes where client_id = $1 and desinstalado_em is null) as instalacoes,
                (select count(*)::int from rastreador_vinculos where client_id = $1 and desvinculado_em is null) as vinculos`,
        [clientId],
      );
      if (r.faturas || r.pagamentos) {
        const partes = [r.faturas && `${r.faturas} fatura${r.faturas > 1 ? 's' : ''}`, r.pagamentos && `${r.pagamentos} pagamento${r.pagamentos > 1 ? 's' : ''}`].filter(Boolean);
        throw new ConflictException(`O cliente ${client.name} já tem ${partes.join(' e ')}: o histórico financeiro não pode ser apagado.`);
      }
      const { rowCount: posicoes } = await tx.query('delete from posicoes where client_id = $1', [clientId]);
      const { rowCount: eventos } = await tx.query('delete from eventos where client_id = $1', [clientId]);
      await tx.query('delete from ultima_posicao where client_id = $1', [clientId]);
      // a saúde do aparelho continua com o rastreador, que volta ao estoque
      await tx.query('update rastreador_comunicacao set client_id = null, asset_id = null where client_id = $1', [clientId]);
      const resumo = { usuarios: r.usuarios, veiculos: r.veiculos, rastreadoresInstalados: r.instalacoes, rastreadoresVinculados: r.vinculos, posicoes, eventos };
      await tx.query('delete from clients where id = $1', [clientId]);
      // `client_id` do audit_log é `on delete set null`: o alvo guarda qual cliente foi
      await this.audit.record(
        { actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'client.excluir', target: clientId, before: { name: client.name, ...resumo } },
        tx,
      );
      return { nome: client.name, resumo };
    });
    this.logger.log(`cliente excluído client_id=${clientId} (${nome}) por superadmin=${superadminId}: ${JSON.stringify(resumo)}`);
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
