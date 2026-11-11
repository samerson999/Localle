import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActiveUserRepository } from './active-user.repository';

/**
 * Tolerância de relógio entre a API (`iat` do token) e o banco (`senha_alterada_em`). Regressão de 11/11/2026: no Docker
 * do Windows, sob carga, o banco chegou a 66 ms à frente da API, e um login feito logo depois de criar o usuário ou
 * trocar a senha, na virada do segundo, era recusado (users.isolation e senha.spec falhavam às vezes).
 * Os horários são fixados à mão a partir de um `iat`, sem depender do relógio de nenhum dos dois lados.
 */
describe('ActiveUserRepository — tolerância de relógio', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ActiveUserRepository(pool);
  const iat = 1_800_000_000; // segundo inteiro, como o JWT carrega

  let clientId: string;
  let userId: string;
  let superadminId: string;

  const senhaAlteradaEm = (tabela: 'users' | 'superadmins', id: string, segundosDepoisDoIat: number) =>
    pool.query(`update ${tabela} set senha_alterada_em = to_timestamp($2::float8) where id = $1`, [id, iat + segundosDepoisDoIat]);

  beforeAll(async () => {
    clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-relogio-${randomUUID()}`])).rows[0].id;
    userId = (
      await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id", [
        clientId,
        `relogio-${randomUUID()}@teste.local`,
      ])
    ).rows[0].id;
    superadminId = (await pool.query<{ id: string }>("insert into superadmins (email, password_hash) values ($1, 'x') returning id", [`relogio-sa-${randomUUID()}@teste.local`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.query('delete from superadmins where id = $1', [superadminId]);
    await pool.end();
  });

  it('token emitido em X,95 s com o banco 100 ms adiantado (troca gravada em X+1,05 s) continua valendo', async () => {
    await senhaAlteradaEm('users', userId, 1.05);
    expect(await repo.isActive(userId, iat)).toBe(true);
    await senhaAlteradaEm('superadmins', superadminId, 1.05);
    expect(await repo.isSuperadmin(superadminId, iat)).toBe(true);
  });

  it('a tolerância não passa de 1 s: troca 2 s depois do token derruba a sessão', async () => {
    await senhaAlteradaEm('users', userId, 2);
    expect(await repo.isActive(userId, iat)).toBe(false);
    await senhaAlteradaEm('superadmins', superadminId, 2);
    expect(await repo.isSuperadmin(superadminId, iat)).toBe(false);
  });

  it('token emitido depois da troca vale normalmente', async () => {
    await senhaAlteradaEm('users', userId, -60);
    expect(await repo.isActive(userId, iat)).toBe(true);
  });
});
