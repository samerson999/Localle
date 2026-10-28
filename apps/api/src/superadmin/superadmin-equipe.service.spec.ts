import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import type { MailService } from '../mail/mail.service';
import { SuperadminAuthService } from './superadmin-auth.service';
import { SuperadminEquipeService } from './superadmin-equipe.service';
import { SuperadminRepository } from './superadmin.repository';

/**
 * Equipe da Locale pelo painel, contra o Postgres local real: convite (com e sem SMTP), aceite, reenvio,
 * desativação (token já emitido deixa de valer — `isSuperadmin`), troca de senha. Só o e-mail é falso.
 */
describe('SuperadminEquipeService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new SuperadminRepository(pool);
  const audit = new AuditLogRepository(pool);
  const ativos = new ActiveUserRepository(pool);
  const login = new SuperadminAuthService(repo);
  const enviados: string[] = [];
  const comEmail = { send: async (m: { to: string }) => (enviados.push(m.to), true) } as unknown as MailService;
  const semEmail = { send: async () => false } as unknown as MailService;
  const service = (mail: MailService) => new SuperadminEquipeService(repo, mail, audit, pool);

  const criados: string[] = [];
  let eu: string;
  const email = () => `localle-${randomUUID()}@teste.local`;
  const tokenDo = (link: string | null) => link!.split('/').at(-1)!;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>('insert into superadmins (email, password_hash) values ($1, $2) returning id', [email(), await bcrypt.hash('senha-atual-123', 4)]);
    eu = rows[0].id;
    criados.push(eu);
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where actor_id = any($1::uuid[]) or target = any($2::text[])', [criados, criados]);
    await pool.query('delete from superadmins where id = any($1::uuid[])', [criados]);
    await pool.end();
  });

  async function convidar(mail = semEmail) {
    const r = await service(mail).convidar(eu, email());
    criados.push(r.superadmin.id);
    return r;
  }

  it('convida: nasce pendente, auditado; com SMTP o link não volta; e-mail repetido é 409', async () => {
    const r = await convidar(comEmail);
    expect(r.superadmin).toMatchObject({ pendente: true, desativado_em: null });
    expect(r).toMatchObject({ conviteEnviado: true, link: null });
    expect(enviados.at(-1)).toBe(r.superadmin.email);
    const { rows } = await pool.query("select actor_id from audit_log where action = 'superadmin.convidar' and target = $1", [r.superadmin.id]);
    expect(rows).toEqual([{ actor_id: eu }]);

    await expect(service(semEmail).convidar(eu, r.superadmin.email)).rejects.toThrow(/Já existe/);
  });

  it('sem SMTP devolve o link; aceitar define a senha, loga, e o link não serve de novo', async () => {
    const r = await convidar();
    expect(r.link).toMatch(/#\/convite-localle\/[A-Za-z0-9_-]{43}$/);
    await expect(login.login(r.superadmin.email, 'senha-nova-123')).rejects.toThrow();

    expect(await service(semEmail).consultarConvite(tokenDo(r.link))).toEqual({ email: r.superadmin.email });
    await expect(service(semEmail).aceitarConvite(tokenDo(r.link), 'senha-nova-123')).resolves.toHaveProperty('accessToken');
    await expect(login.login(r.superadmin.email, 'senha-nova-123')).resolves.toHaveProperty('accessToken');
    await expect(service(semEmail).consultarConvite(tokenDo(r.link))).rejects.toThrow(/inválido/);
    await expect(service(semEmail).reenviar(eu, r.superadmin.id)).rejects.toThrow(/já definiu a senha/);
  });

  it('reenviar revoga o link anterior', async () => {
    const r = await convidar();
    const novo = await service(semEmail).reenviar(eu, r.superadmin.id);
    expect(novo.link).not.toBe(r.link);
    await expect(service(semEmail).consultarConvite(tokenDo(r.link))).rejects.toThrow(/inválido/);
    await expect(service(semEmail).consultarConvite(tokenDo(novo.link))).resolves.toEqual({ email: r.superadmin.email });
  });

  it('desativar: não o próprio; o desativado perde o token já emitido e o login; reativar devolve', async () => {
    await expect(service(semEmail).setAtivo(eu, eu, false)).rejects.toThrow(/próprio acesso/);

    const r = await convidar();
    await service(semEmail).aceitarConvite(tokenDo(r.link), 'senha-do-colega-123');
    expect(await ativos.isSuperadmin(r.superadmin.id)).toBe(true);

    const desativado = await service(semEmail).setAtivo(eu, r.superadmin.id, false);
    expect(desativado.desativado_em).not.toBeNull();
    expect(await ativos.isSuperadmin(r.superadmin.id)).toBe(false);
    await expect(login.login(r.superadmin.email, 'senha-do-colega-123')).rejects.toThrow(/inválidos/);

    await service(semEmail).setAtivo(eu, r.superadmin.id, true);
    expect(await ativos.isSuperadmin(r.superadmin.id)).toBe(true);
    await expect(login.login(r.superadmin.email, 'senha-do-colega-123')).resolves.toHaveProperty('accessToken');
  });

  it('convite de quem foi desativado não pode ser aceito', async () => {
    const r = await convidar();
    await service(semEmail).setAtivo(eu, r.superadmin.id, false);
    await expect(service(semEmail).aceitarConvite(tokenDo(r.link), 'senha-qualquer-123')).rejects.toThrow(/inválido/);
  });

  it('trocar a própria senha exige a atual', async () => {
    await expect(service(semEmail).trocarSenha(eu, 'errada', 'outra-senha-123')).rejects.toThrow(/incorreta/);
    await service(semEmail).trocarSenha(eu, 'senha-atual-123', 'outra-senha-123');
    const { rows } = await pool.query<{ email: string }>('select email from superadmins where id = $1', [eu]);
    await expect(login.login(rows[0].email, 'outra-senha-123')).resolves.toHaveProperty('accessToken');
  });
});
