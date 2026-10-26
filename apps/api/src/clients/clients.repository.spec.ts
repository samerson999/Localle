import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { ClientsRepository } from './clients.repository';

describe('ClientsRepository.rename', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ClientsRepository(pool);
  const criados: string[] = [];

  afterAll(async () => {
    await pool.query('delete from clients where id = any($1)', [criados]);
    await pool.end();
  });

  it('renomeia só o cliente alvo; id inexistente devolve null', async () => {
    const a = await repo.create({ name: `teste-rename-a-${randomUUID()}` });
    const b = await repo.create({ name: `teste-rename-b-${randomUUID()}` });
    criados.push(a.id, b.id);

    const renomeado = await repo.rename(a.id, 'Novo nome');
    expect(renomeado?.name).toBe('Novo nome');
    expect((await repo.findById(b.id))?.name).toBe(b.name);
    expect(await repo.rename(randomUUID(), 'x')).toBeNull();
  });
});
