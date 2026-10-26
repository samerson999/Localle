import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { AuthService } from '../auth/auth.service';
import { ClientsRepository } from '../clients/clients.repository';
import { ConvitesService, hashToken } from '../convites/convites.service';
import { MailService } from '../mail/mail.service';
import { UsersRepository } from '../users/users.repository';
import { SuperadminClientsService } from './superadmin-clients.service';

/**
 * Contra o Postgres local e o Mailpit (infra/mail): o que está sob teste é a atomicidade da transação, o
 * unique de `users.email` e o convite chegando de verdade por SMTP, com um link que funciona uma vez só.
 */
const MAILPIT = process.env.MAILPIT_API_URL || 'http://localhost:8025';

async function linkRecebido(email: string): Promise<string> {
  // o envio é síncrono no service (await do SMTP); o Mailpit indexa na hora — sem espera arbitrária
  const busca: any = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
  const id = busca.messages?.[0]?.ID;
  if (!id) throw new Error(`nenhum e-mail para ${email} no Mailpit`);
  const msg: any = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
  const m = /#\/convite\/([A-Za-z0-9_-]{43})/.exec(msg.Text);
  if (!m) throw new Error('e-mail sem link de convite');
  return m[1];
}

describe('SuperadminClientsService + convite de primeiro acesso', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const clientsRepo = new ClientsRepository(pool);
  const usersRepo = new UsersRepository(pool);
  const audit = new AuditLogRepository(pool);
  const activeUsers = new ActiveUserRepository(pool);
  const convites = new ConvitesService(pool, new MailService(), activeUsers, audit);
  const service = new SuperadminClientsService(clientsRepo, usersRepo, audit, convites, pool);
  const auth = new AuthService(usersRepo, activeUsers);
  const superadminId = randomUUID();
  const criados: string[] = [];
  const env = { ...process.env };

  beforeAll(() => {
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'Localle <nao-responda@localle.dev>';
    delete process.env.SMTP_USER;
  });

  afterAll(async () => {
    process.env = env;
    await pool.query('delete from audit_log where actor_id = $1 or client_id = any($2)', [superadminId, criados]);
    await pool.query('delete from clients where id = any($1)', [criados]);
    await pool.end();
  });

  const email = () => `teste-${randomUUID()}@exemplo.com`;
  const nome = () => `teste-superadmin-${randomUUID()}`;

  it('cria cliente e admin convidado (sem senha), audita e envia o convite por e-mail', async () => {
    const adminEmail = email();
    const { client, admin, conviteEnviado } = await service.createClient(superadminId, { name: nome(), admin: { email: adminEmail } });
    criados.push(client.id);
    expect(admin).toMatchObject({ client_id: client.id, role: 'admin', password_hash: null, email_confirmado_em: null });
    expect(conviteEnviado).toBe(true);

    const log = (await audit.findRecent(50)).filter((e) => e.actor_id === superadminId && e.client_id === client.id);
    expect(log.map((e) => e.action).sort()).toEqual(['client.create', 'user.create_initial_admin']);

    const token = await linkRecebido(adminEmail);
    const { rows } = await pool.query('select token_hash from convites where user_id = $1', [admin!.id]);
    expect(rows).toEqual([{ token_hash: hashToken(token) }]); // o banco só tem o hash
  });

  it('aceitar o convite define a senha, confirma o e-mail e loga; o link não serve de novo', async () => {
    const adminEmail = email();
    const { client, admin } = await service.createClient(superadminId, { name: nome(), admin: { email: adminEmail } });
    criados.push(client.id);
    const token = await linkRecebido(adminEmail);

    // antes do aceite, nenhuma senha funciona
    await expect(auth.login(adminEmail, 'qualquer-senha')).rejects.toMatchObject({ status: 401 });
    expect(await convites.consultar(token)).toEqual({ email: adminEmail, clientName: client.name });

    const { accessToken } = await convites.aceitar(token, 'minha-senha-forte');
    expect(accessToken).toBeTruthy();
    expect((await usersRepo.findOneByClient(client.id, admin!.id))?.email_confirmado_em).toBeInstanceOf(Date);
    expect((await auth.login(adminEmail, 'minha-senha-forte')).accessToken).toBeTruthy();

    await expect(convites.aceitar(token, 'outra-senha-forte')).rejects.toMatchObject({ status: 404 });
    await expect(convites.consultar(token)).rejects.toMatchObject({ status: 404 });
  });

  it('reenviar revoga o link anterior; convite expirado não vale; quem já tem senha não recebe convite', async () => {
    const adminEmail = email();
    const { client, admin } = await service.createClient(superadminId, { name: nome(), admin: { email: adminEmail } });
    criados.push(client.id);
    const primeiro = await linkRecebido(adminEmail);

    await service.reenviarConvite(superadminId, client.id, admin!.id);
    await expect(convites.consultar(primeiro)).rejects.toMatchObject({ status: 404 });
    const segundo = await linkRecebido(adminEmail);
    expect(segundo).not.toBe(primeiro);

    await pool.query("update convites set expira_em = now() - interval '1 minute' where token_hash = $1", [hashToken(segundo)]);
    await expect(convites.aceitar(segundo, 'minha-senha-forte')).rejects.toMatchObject({ status: 404 });

    await service.reenviarConvite(superadminId, client.id, admin!.id);
    await convites.aceitar(await linkRecebido(adminEmail), 'minha-senha-forte');
    await expect(service.reenviarConvite(superadminId, client.id, admin!.id)).rejects.toMatchObject({ status: 400 });
    // usuário de outro cliente: 404, nunca alcança
    await expect(service.reenviarConvite(superadminId, randomUUID(), admin!.id)).rejects.toMatchObject({ status: 404 });
  });

  it('cliente suspenso: login com a senha certa é 403 e token já emitido deixa de valer; reativado, volta', async () => {
    const adminEmail = email();
    const { client, admin } = await service.createClient(superadminId, { name: nome(), admin: { email: adminEmail } });
    criados.push(client.id);
    await convites.aceitar(await linkRecebido(adminEmail), 'minha-senha-forte');
    expect(await activeUsers.isActive(admin!.id)).toBe(true); // sem contrato (implantação) acessa

    const { rows: [c] } = await pool.query<{ id: string }>("insert into contratos (client_id, status) values ($1, 'suspenso') returning id", [client.id]);
    await expect(auth.login(adminEmail, 'minha-senha-forte')).rejects.toMatchObject({ status: 403 });
    await expect(auth.login(adminEmail, 'senha-errada')).rejects.toMatchObject({ status: 401 }); // não revela a suspensão
    expect(await activeUsers.isActive(admin!.id)).toBe(false);

    await pool.query("update contratos set status = 'ativo' where id = $1", [c.id]);
    expect(await activeUsers.isActive(admin!.id)).toBe(true);
    expect((await auth.login(adminEmail, 'minha-senha-forte')).accessToken).toBeTruthy();
  });

  // regressão (pentest 24/10/2026): senha/e-mail não-string faziam o bcrypt lançar → 500 num endpoint público
  it('login com corpo sem string é 401 genérico, não 500', async () => {
    for (const [e, p] of [['a@b.com', { b: 2 }], ['a@b.com', undefined], [{ a: 1 }, 'x'], [null, null]] as const) {
      await expect(auth.login(e, p)).rejects.toMatchObject({ status: 401 });
    }
  });

  it('e-mail de admin já usado: 409 e o cliente também não é criado', async () => {
    const repetido = email();
    const primeiro = await service.createClient(superadminId, { name: nome(), admin: { email: repetido } });
    criados.push(primeiro.client.id);
    const orfao = nome();
    await expect(service.createClient(superadminId, { name: orfao, admin: { email: repetido } })).rejects.toMatchObject({ status: 409 });
    expect((await clientsRepo.findAll()).some((c) => c.name === orfao)).toBe(false);
  });

  it('SMTP fora: usuário e convite ficam criados, conviteEnviado=false (reenviável)', async () => {
    process.env.SMTP_PORT = '1'; // nada escuta aqui
    try {
      const { client, admin, conviteEnviado } = await service.createClient(superadminId, { name: nome(), admin: { email: email() } });
      criados.push(client.id);
      expect(conviteEnviado).toBe(false);
      const { rows } = await pool.query('select 1 from convites where user_id = $1 and usado_em is null', [admin!.id]);
      expect(rows).toHaveLength(1);
    } finally {
      process.env.SMTP_PORT = '1025';
    }
  });

  it('sem admin, cria só o cliente; admin inicial em cliente inexistente é 404', async () => {
    const { client, admin } = await service.createClient(superadminId, { name: nome() });
    criados.push(client.id);
    expect(admin).toBeNull();
    await expect(service.createInitialAdmin(superadminId, randomUUID(), { email: email() })).rejects.toMatchObject({ status: 404 });
    const { user, conviteEnviado } = await service.createInitialAdmin(superadminId, client.id, { email: email() });
    expect(user.client_id).toBe(client.id);
    expect(conviteEnviado).toBe(true);
  });

  it('findAllResumo conta usuários ativos, veículos e rastreadores instalados por cliente', async () => {
    const { client } = await service.createClient(superadminId, { name: nome(), admin: { email: email() } });
    criados.push(client.id);
    const { client: vazio } = await service.createClient(superadminId, { name: nome() });
    criados.push(vazio.id);
    await pool.query('insert into assets (client_id, plate) values ($1, $2), ($1, $3)', [client.id, 'TST0001', 'TST0002']);
    await pool.query(
      `insert into users (client_id, email, password_hash, role, desativado_em) values ($1, $2, 'x', 'operador', now())`,
      [client.id, email()],
    );

    const resumo = await clientsRepo.findAllResumo();
    expect(resumo.find((c) => c.id === client.id)).toMatchObject({ usuarios_ativos: 0, convites_pendentes: 1, veiculos: 2, rastreadores_instalados: 0, contrato_status: null });
    expect(resumo.find((c) => c.id === vazio.id)).toMatchObject({ usuarios_ativos: 0, convites_pendentes: 0, veiculos: 0 });
  });
});
