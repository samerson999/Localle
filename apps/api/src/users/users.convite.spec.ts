import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { AuthService } from '../auth/auth.service';
import { ClientsRepository } from '../clients/clients.repository';
import { ConvitesService } from '../convites/convites.service';
import type { MailService } from '../mail/mail.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Convite de membro da equipe do cliente (Gestor/Operador) pelo Admin: usuário nasce sem senha, define a
 * própria pelo link; sem SMTP o link volta para quem convidou. Postgres local real; só o envio de e-mail é
 * falso (um que entrega e um que falha), para cobrir os dois caminhos.
 */
describe('UsersService — convite de membro da equipe', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new UsersRepository(pool);
  const audit = new AuditLogRepository(pool);
  const enviados: { to: string; text: string }[] = [];
  const comEmail = { send: async (m: { to: string; text: string }) => (enviados.push(m), true) } as unknown as MailService;
  const semEmail = { send: async () => false } as unknown as MailService;
  const service = (mail: MailService) =>
    new UsersService(repo, audit, new ClientsRepository(pool), new ConvitesService(pool, mail, new ActiveUserRepository(pool), audit), pool);
  const convitesSemEmail = new ConvitesService(pool, semEmail, new ActiveUserRepository(pool), audit);
  const auth = new AuthService(repo, new ActiveUserRepository(pool));

  let clientA: string;
  let clientB: string;
  let adminA: string;
  const email = () => `membro-${randomUUID()}@teste.local`;

  beforeAll(async () => {
    const ins = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-convite-membro-${n}-${randomUUID()}`]);
    clientA = (await ins('a')).rows[0].id;
    clientB = (await ins('b')).rows[0].id;
    adminA = (await repo.create({ clientId: clientA, email: email(), passwordHash: 'x', role: 'admin' })).id;
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('convida gestor: nasce sem senha, convite aberto, auditado; com SMTP o link não volta na resposta', async () => {
    const r = await service(comEmail).convidarMembro(clientA, adminA, { email: email(), role: 'gestor' });
    expect(r.user).toMatchObject({ client_id: clientA, role: 'gestor', password_hash: null });
    expect(r).toMatchObject({ conviteEnviado: true, link: null });
    expect(enviados.at(-1)?.text).toMatch(/cadastrado como gestor de teste-convite-membro-a-/);

    const { rows: cv } = await pool.query('select 1 from convites where user_id = $1 and usado_em is null and revogado_em is null', [r.user.id]);
    expect(cv).toHaveLength(1);
    const { rows: au } = await pool.query("select actor_id from audit_log where action = 'user.create' and target = $1", [r.user.id]);
    expect(au).toEqual([{ actor_id: adminA }]);
  });

  it('sem SMTP devolve o link; aceitar o convite define a senha e o login passa a funcionar', async () => {
    const mail = email();
    const r = await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'operador' });
    expect(r.conviteEnviado).toBe(false);
    expect(r.link).toMatch(/#\/convite\/[A-Za-z0-9_-]{43}$/);

    await expect(auth.login(mail, 'qualquer-senha')).rejects.toThrow(); // sem senha ainda
    const token = r.link!.split('/').at(-1)!;
    await convitesSemEmail.aceitar(token, 'senha-do-operador-123');
    await expect(auth.login(mail, 'senha-do-operador-123')).resolves.toHaveProperty('accessToken');
  });

  it('recusa convidar admin e e-mail já cadastrado', async () => {
    await expect(service(semEmail).convidarMembro(clientA, adminA, { email: email(), role: 'admin' as never })).rejects.toThrow(/Papel inválido/);
    const mail = email();
    await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' });
    await expect(service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' })).rejects.toThrow(/Já existe/);
  });

  it('reenviar: só do próprio cliente, só pendente; o link anterior deixa de valer', async () => {
    const r = await service(semEmail).convidarMembro(clientA, adminA, { email: email(), role: 'gestor' });
    const antigo = r.link!.split('/').at(-1)!;

    await expect(service(semEmail).reenviarConvite(clientB, adminA, r.user.id)).rejects.toThrow(/não encontrado/);
    await expect(service(semEmail).reenviarConvite(clientA, adminA, adminA)).rejects.toThrow(/Locale/);

    const novo = await service(semEmail).reenviarConvite(clientA, adminA, r.user.id);
    expect(novo.link).not.toBe(r.link);
    await expect(convitesSemEmail.consultar(antigo)).rejects.toThrow(/inválido/);

    await convitesSemEmail.aceitar(novo.link!.split('/').at(-1)!, 'senha-definida-123');
    await expect(service(semEmail).reenviarConvite(clientA, adminA, r.user.id)).rejects.toThrow(/já definiu a senha/);
  });
});
