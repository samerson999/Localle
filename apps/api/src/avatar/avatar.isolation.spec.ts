import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AvatarRepository } from './avatar.repository';

/**
 * Foto do avatar: só o dono lê e grava, com o `client_id` do JWT no filtro, e o banco recusa foto presa a um cliente
 * que não é o do usuário (FK composta) e conteúdo fora do formato (check). Postgres local real.
 */
describe('AvatarRepository — isolamento e regras do banco', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new AvatarRepository(pool);
  const png = (n: number) => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, n)]).toString('base64')}`;

  let clientA: string;
  let clientB: string;
  let userA: string;
  let userB: string;
  let superadmin: string;

  async function criarUsuario(clientId: string) {
    const { rows } = await pool.query<{ id: string }>(
      "insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id",
      [clientId, `avatar-${randomUUID()}@teste.local`],
    );
    return rows[0].id;
  }

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-avatar-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-avatar-b-${randomUUID()}`])).rows[0].id;
    userA = await criarUsuario(clientA);
    userB = await criarUsuario(clientB);
    superadmin = (await pool.query<{ id: string }>("insert into superadmins (email, password_hash) values ($1, 'x') returning id", [`avatar-sa-${randomUUID()}@teste.local`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]); // cascata: users e usuario_avatares
    await pool.query('delete from superadmins where id = $1', [superadmin]);
    await pool.end();
  });

  it('o dono grava, lê, troca e remove a própria foto', async () => {
    expect(await repo.doUsuario(clientA, userA)).toBeNull();
    await repo.salvarDoUsuario(clientA, userA, png(1));
    expect(await repo.doUsuario(clientA, userA)).toBe(png(1));
    await repo.salvarDoUsuario(clientA, userA, png(2));
    expect(await repo.doUsuario(clientA, userA)).toBe(png(2));
    await repo.removerDoUsuario(clientA, userA);
    expect(await repo.doUsuario(clientA, userA)).toBeNull();
  });

  it('com o client_id de outro cliente não lê, não remove e não grava a foto do usuário', async () => {
    await repo.salvarDoUsuario(clientA, userA, png(3));
    expect(await repo.doUsuario(clientB, userA)).toBeNull();
    await repo.removerDoUsuario(clientB, userA);
    expect(await repo.doUsuario(clientA, userA)).toBe(png(3));
    // a linha já existe: o upsert com outro client_id não pode trocar a foto (where do conflito)
    await repo.salvarDoUsuario(clientB, userA, png(4));
    expect(await repo.doUsuario(clientA, userA)).toBe(png(3));
  });

  it('o banco recusa foto presa a um cliente que não é o do usuário (FK composta)', async () => {
    await expect(repo.salvarDoUsuario(clientA, userB, png(5))).rejects.toThrow(/foreign key/);
    expect(await repo.doUsuario(clientB, userB)).toBeNull();
  });

  it('o banco recusa SVG e conteúdo fora do teto, mesmo sem passar pela API', async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    await expect(pool.query('insert into usuario_avatares (user_id, client_id, imagem) values ($1, $2, $3)', [userB, clientB, svg])).rejects.toThrow(/check/);
    const grande = `data:image/png;base64,${'A'.repeat(90_000)}`;
    await expect(pool.query('insert into usuario_avatares (user_id, client_id, imagem) values ($1, $2, $3)', [userB, clientB, grande])).rejects.toThrow(/check/);
  });

  it('a foto some junto com o usuário', async () => {
    const u = await criarUsuario(clientB);
    await repo.salvarDoUsuario(clientB, u, png(6));
    await pool.query('delete from users where id = $1', [u]);
    const { rowCount } = await pool.query('select 1 from usuario_avatares where user_id = $1', [u]);
    expect(rowCount).toBe(0);
  });

  it('equipe da Localle: grava, lê e remove a própria foto', async () => {
    await repo.salvarDoSuperadmin(superadmin, png(7));
    expect(await repo.doSuperadmin(superadmin)).toBe(png(7));
    await repo.removerDoSuperadmin(superadmin);
    expect(await repo.doSuperadmin(superadmin)).toBeNull();
  });
});
