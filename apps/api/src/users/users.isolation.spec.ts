import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ClientsRepository } from '../clients/clients.repository';
import { ConvitesService } from '../convites/convites.service';
import type { MailService } from '../mail/mail.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Desativação de usuário: isolamento entre clientes, política (nem a si mesmo, nem outro admin) e — o que
 * de fato importa para segurança — que o token JÁ EMITIDO deixa de funcionar, não só o próximo login.
 * Postgres local real; o AuthGuard roda de verdade, só o ExecutionContext do Nest é montado à mão.
 */
describe('UsersService.setAtivo + AuthGuard', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new UsersRepository(pool);
  const semEmail = { send: async () => false } as unknown as MailService;
  const convites = new ConvitesService(pool, semEmail, new ActiveUserRepository(pool), new AuditLogRepository(pool));
  const service = new UsersService(repo, new AuditLogRepository(pool), new ClientsRepository(pool), convites, pool);
  const auth = new AuthService(repo, new ActiveUserRepository(pool));
  const guard = new AuthGuard(new Reflector(), new ActiveUserRepository(pool));
  const senha = 'senha-teste-123';

  let clientA: string;
  let clientB: string;
  let adminA: string;
  let gestorA: string;
  let gestorAEmail: string;
  let adminB: string;

  async function criarUsuario(clientId: string, role: string) {
    const email = `u-${randomUUID()}@teste.local`;
    const bcrypt = await import('bcryptjs');
    const { rows } = await pool.query<{ id: string }>(
      'insert into users (client_id, email, password_hash, role) values ($1, $2, $3, $4) returning id',
      [clientId, email, await bcrypt.default.hash(senha, 4), role],
    );
    return { id: rows[0].id, email };
  }

  function contexto(token: string) {
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    return {
      request,
      ctx: {
        // rota sem @Public(): handler/classe reais, sem metadado — o Reflector exige objetos
        getHandler: () => function rotaProtegida() {},
        getClass: () => class Controlador {},
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-users-a-${randomUUID()}`]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-users-b-${randomUUID()}`]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;
    adminA = (await criarUsuario(clientA, 'admin')).id;
    const g = await criarUsuario(clientA, 'gestor');
    gestorA = g.id;
    gestorAEmail = g.email;
    adminB = (await criarUsuario(clientB, 'admin')).id;
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('token de superadmin removido deixa de valer na hora (não só quando expira)', async () => {
    const { signAuthToken } = await import('../auth/jwt');
    const sa = await pool.query<{ id: string }>(
      "insert into superadmins (email, password_hash) values ($1, 'x') returning id",
      [`sa-${randomUUID()}@teste.local`],
    );
    const token = signAuthToken({ sub: sa.rows[0].id, role: 'superadmin' });
    expect(await guard.canActivate(contexto(token).ctx)).toBe(true);
    await pool.query('delete from superadmins where id = $1', [sa.rows[0].id]);
    await expect(guard.canActivate(contexto(token).ctx)).rejects.toThrow('Token inválido ou expirado');
  });

  it('admin de outro cliente não alcança o usuário (404) e nada muda', async () => {
    await expect(service.setAtivo(clientB, adminB, gestorA, false)).rejects.toThrow('Usuário não encontrado');
    expect((await repo.findOneByClient(clientA, gestorA))?.desativado_em).toBeNull();
  });

  it('admin não desativa a si mesmo nem outro admin', async () => {
    await expect(service.setAtivo(clientA, adminA, adminA, false)).rejects.toThrow('próprio acesso');
    const outroAdmin = await criarUsuario(clientA, 'admin');
    await expect(service.setAtivo(clientA, adminA, outroAdmin.id, false)).rejects.toThrow('pela Locale');
  });

  it('desativar invalida o token já emitido e o login; reativar devolve o acesso; tudo auditado', async () => {
    const { accessToken } = await auth.login(gestorAEmail, senha);
    const antes = contexto(accessToken);
    expect(await guard.canActivate(antes.ctx)).toBe(true);
    expect(antes.request.auth).toMatchObject({ userId: gestorA, clientId: clientA });

    const desativado = await service.setAtivo(clientA, adminA, gestorA, false);
    expect(desativado.desativado_em).not.toBeNull();
    await expect(guard.canActivate(contexto(accessToken).ctx)).rejects.toThrow('Token inválido ou expirado');
    await expect(auth.login(gestorAEmail, senha)).rejects.toThrow('E-mail ou senha inválidos');

    // repetir a mesma operação é idempotente: não gera auditoria nova
    await service.setAtivo(clientA, adminA, gestorA, false);

    await service.setAtivo(clientA, adminA, gestorA, true);
    expect(await guard.canActivate(contexto(accessToken).ctx)).toBe(true);
    await expect(auth.login(gestorAEmail, senha)).resolves.toHaveProperty('accessToken');

    const { rows } = await pool.query(
      "select action from audit_log where client_id = $1 and target = $2 and action like 'user.%' order by id",
      [clientA, gestorA],
    );
    expect(rows.map((r) => r.action)).toEqual(['user.desativar', 'user.reativar']);
  });
});
