import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelatoriosGeradosRepository } from './relatorios-gerados.repository';

describe('histórico de relatórios gerados — isolamento por cliente', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new RelatoriosGeradosRepository(pool);
  const base = { inicio: new Date('2026-11-01T00:00:00Z'), fim: new Date('2026-11-02T00:00:00Z'), filtros: 'Grupo: todos', registros: 12 };

  let clientA: string;
  let clientB: string;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    const novoCliente = async (s: string) => (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-relgerados-${s}-${randomUUID()}`])).rows[0].id;
    clientA = await novoCliente('a');
    clientB = await novoCliente('b');
    const novoUsuario = async (c: string) => (await pool.query<{ id: string }>(`insert into users (client_id, email, role) values ($1, $2, 'gestor') returning id`, [c, `rel-${randomUUID()}@teste.local`])).rows[0].id;
    userA = await novoUsuario(clientA);
    userB = await novoUsuario(clientB);
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('o dono registra e lista o próprio relatório, com o e-mail de quem gerou', async () => {
    const r = await repo.registrar(clientA, userA, { ...base, tipo: 'velocidade', formato: 'pdf' });
    expect(r.client_id).toBe(clientA);
    expect(r.user_id).toBe(userA);
    const lista = await repo.recentes(clientA, 50);
    expect(lista.map((x) => x.id)).toContain(r.id);
    expect(lista.find((x) => x.id === r.id)?.gerado_por).toMatch(/@teste\.local$/);
  });

  it('outro cliente não vê o histórico do primeiro', async () => {
    await repo.registrar(clientA, userA, { ...base, tipo: 'cercas', formato: 'xlsx' });
    const doB = await repo.recentes(clientB, 50);
    expect(doB).toHaveLength(0);
    expect(await repo.findMany(clientB)).toHaveLength(0);
  });

  it('outro cliente não altera nem apaga o registro do primeiro', async () => {
    const r = await repo.registrar(clientA, userA, { ...base, tipo: 'uso', formato: 'csv' });
    expect(await repo.update(clientB, r.id, { filtros: 'invadido' })).toBeNull();
    expect(await repo.delete(clientB, r.id)).toBe(false);
    expect((await repo.findOne(clientA, { id: r.id }))?.filtros).toBe(base.filtros);
  });

  it('usuário de outro cliente no token não fica gravado como autor (fica nulo)', async () => {
    const r = await repo.registrar(clientA, userB, { ...base, tipo: 'posicoes', formato: 'pdf' });
    expect(r.client_id).toBe(clientA);
    expect(r.user_id).toBeNull();
    expect((await repo.recentes(clientA, 50)).find((x) => x.id === r.id)?.gerado_por).toBeNull();
  });

  it('lista os mais recentes primeiro e respeita o limite', async () => {
    const lista = await repo.recentes(clientA, 2);
    expect(lista).toHaveLength(2);
    expect(lista[0].created_at.getTime()).toBeGreaterThanOrEqual(lista[1].created_at.getTime());
  });

  it('o banco recusa tipo, formato, período invertido e contagem negativa', async () => {
    const ins = (cols: Record<string, unknown>) => pool.query(
      `insert into relatorios_gerados (client_id, tipo, periodo_inicio, periodo_fim, registros, formato) values ($1, $2, $3, $4, $5, $6)`,
      [clientA, cols.tipo ?? 'uso', cols.inicio ?? base.inicio, cols.fim ?? base.fim, cols.registros ?? 1, cols.formato ?? 'pdf'],
    );
    await expect(ins({ tipo: 'outro' })).rejects.toThrow();
    await expect(ins({ formato: 'doc' })).rejects.toThrow();
    await expect(ins({ inicio: base.fim, fim: base.inicio })).rejects.toThrow();
    await expect(ins({ registros: -1 })).rejects.toThrow();
  });
});
