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

  it('convida gestor: nasce sem senha, convite aberto, auditado; com SMTP o código não volta na resposta', async () => {
    const r = await service(comEmail).convidarMembro(clientA, adminA, { email: email(), role: 'gestor' });
    expect(r.user).toMatchObject({ client_id: clientA, role: 'gestor', password_hash: null });
    expect(r).toMatchObject({ conviteEnviado: true, codigo: null });
    expect(enviados.at(-1)?.text).toMatch(/cadastrado como gestor de teste-convite-membro-a-/);
    expect(enviados.at(-1)?.text).toMatch(/código de primeiro acesso é:\s+\d{6}/);
    expect(enviados.at(-1)?.text).toContain(`/#/primeiro-acesso?email=${encodeURIComponent(r.user.email)}`);

    const { rows: cv } = await pool.query('select 1 from convites where user_id = $1 and usado_em is null and revogado_em is null', [r.user.id]);
    expect(cv).toHaveLength(1);
    const { rows: au } = await pool.query("select actor_id from audit_log where action = 'user.create' and target = $1", [r.user.id]);
    expect(au).toEqual([{ actor_id: adminA }]);
  });

  it('sem SMTP devolve o código; aceitar o convite define a senha e o login passa a funcionar', async () => {
    const mail = email();
    const r = await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'operador' });
    expect(r.conviteEnviado).toBe(false);
    expect(r.codigo).toMatch(/^\d{6}$/);

    await expect(auth.login(mail, 'qualquer-senha')).rejects.toThrow(); // sem senha ainda
    expect(await convitesSemEmail.verificar(mail, r.codigo!)).toMatchObject({ email: mail });
    await convitesSemEmail.aceitar(mail, r.codigo!, 'senha-do-operador-123');
    await expect(auth.login(mail, 'senha-do-operador-123')).resolves.toHaveProperty('accessToken');
  });

  it('código de outro usuário não serve; 5 erros revogam o convite, mesmo que depois venha o código certo', async () => {
    const mailA = email();
    const mailB = email();
    const a = await service(semEmail).convidarMembro(clientA, adminA, { email: mailA, role: 'gestor' });
    const b = await service(semEmail).convidarMembro(clientA, adminA, { email: mailB, role: 'gestor' });
    if (a.codigo !== b.codigo) await expect(convitesSemEmail.verificar(mailA, b.codigo!)).rejects.toThrow(/inválido ou expirado/);

    const errado = a.codigo === '000000' ? '111111' : '000000';
    await pool.query('update convites set tentativas = 0 where user_id = $1', [a.user.id]);
    for (let i = 0; i < 5; i++) await expect(convitesSemEmail.verificar(mailA, errado)).rejects.toThrow(/inválido ou expirado/);
    const { rows: [cv] } = await pool.query('select tentativas, revogado_em from convites where user_id = $1', [a.user.id]);
    expect(cv.tentativas).toBe(5);
    expect(cv.revogado_em).not.toBeNull();
    await expect(convitesSemEmail.aceitar(mailA, a.codigo!, 'senha-correta-123')).rejects.toThrow(/inválido ou expirado/);
    await expect(auth.login(mailA, 'senha-correta-123')).rejects.toThrow();
  });

  it('recusa convidar admin e e-mail já cadastrado', async () => {
    await expect(service(semEmail).convidarMembro(clientA, adminA, { email: email(), role: 'admin' as never })).rejects.toThrow(/Papel inválido/);
    const mail = email();
    await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' });
    await expect(service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' })).rejects.toThrow(/Já existe/);
  });

  it('reenviar: só do próprio cliente, só pendente; o código anterior deixa de valer', async () => {
    const mail = email();
    const r = await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' });

    await expect(service(semEmail).reenviarConvite(clientB, adminA, r.user.id)).rejects.toThrow(/não encontrado/);
    await expect(service(semEmail).reenviarConvite(clientA, adminA, adminA)).rejects.toThrow(/Locale/);

    const novo = await service(semEmail).reenviarConvite(clientA, adminA, r.user.id);
    if (novo.codigo !== r.codigo) await expect(convitesSemEmail.verificar(mail, r.codigo!)).rejects.toThrow(/inválido/);

    await convitesSemEmail.aceitar(mail, novo.codigo!, 'senha-definida-123');
    await expect(service(semEmail).reenviarConvite(clientA, adminA, r.user.id)).rejects.toThrow(/já definiu a senha/);
  });

  it('convite vencido não abre nem define senha; convite já usado não vale de novo', async () => {
    const mail = email();
    const r = await service(semEmail).convidarMembro(clientA, adminA, { email: mail, role: 'gestor' });
    await pool.query("update convites set expira_em = now() - interval '1 minute' where user_id = $1", [r.user.id]);

    await expect(convitesSemEmail.verificar(mail, r.codigo!)).rejects.toThrow(/inválido ou expirado/);
    await expect(convitesSemEmail.aceitar(mail, r.codigo!, 'senha-fora-do-prazo-1')).rejects.toThrow(/inválido ou expirado/);
    await expect(auth.login(mail, 'senha-fora-do-prazo-1')).rejects.toThrow();

    const novo = (await service(semEmail).reenviarConvite(clientA, adminA, r.user.id)).codigo!;
    await convitesSemEmail.aceitar(mail, novo, 'senha-dentro-do-prazo-1');
    await expect(convitesSemEmail.aceitar(mail, novo, 'outra-senha-qualquer-1')).rejects.toThrow(/inválido ou expirado/);
    await expect(auth.login(mail, 'senha-dentro-do-prazo-1')).resolves.toHaveProperty('accessToken');
  });
});
