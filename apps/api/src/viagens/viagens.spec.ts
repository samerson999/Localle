import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseMatriz, parseViagem } from './viagens.controller';
import { type ViagemRow, ViagensRepository } from './viagens.repository';

describe('viagens — matrizes, viagens por etapas e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ViagensRepository(pool);
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let cercaA: string;
  let cercaA2: string;
  let cercaB: string;

  const cerca = async (clientId: string, nome: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into cercas (client_id, nome, tipo, forma, centro, raio_m) values ($1, $2, 'Cliente', 'circulo', st_setsrid(st_makepoint(-34.9, -8.1), 4326), 200) returning id`,
        [clientId, nome],
      )
    ).rows[0].id;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-via-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-via-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'VIA1A22') returning id", [clientA])).rows[0].id;
    cercaA = await cerca(clientA, 'Matriz');
    cercaA2 = await cerca(clientA, 'Cliente X');
    cercaB = await cerca(clientB, 'Alheia');
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('matriz: valida dias/paradas/dorme; cerca de outro cliente é recusada; isolamento', async () => {
    expect(() => parseMatriz({ nome: 'x', dias: [7], paradas: [] })).toThrow(/dias/);
    expect(() => parseMatriz({ nome: 'x', dias: [1], paradas: [{ fenceId: cercaA, time: '25:00' }] })).toThrow(/HH:MM/);
    const body = { nome: 'Entregas Recife', assetId: assetA, dias: [1, 2, 3, 3], paradas: [{ fenceId: cercaA2, time: '08:00' }, { fenceId: cercaA, time: '12:30' }], dorme: { 1: cercaA, 2: cercaA } };
    expect(await repo.salvarMatriz(clientA, parseMatriz({ ...body, dorme: { 1: cercaB } }), null)).toBe('cerca_invalida');
    const m = await repo.salvarMatriz(clientA, parseMatriz(body), null);
    expect(m).toMatchObject({ nome: 'Entregas Recife', dias: [1, 2, 3], paradas: [{ fenceId: cercaA2, time: '08:00' }, { fenceId: cercaA, time: '12:30' }] });
    expect(await repo.salvarMatriz(clientB, parseMatriz({ ...body, assetId: null, paradas: [{ fenceId: cercaB, time: '08:00' }], dorme: {} }), (m as { id: string }).id)).toBeNull();
    expect(await repo.listarMatrizes(clientB)).toEqual([]);
  });

  it('viagem externa: etapas em ordem; carga/descarga opcionais em par; outro cliente não avança nem cancela', async () => {
    expect(() => parseViagem({ tipo: 'externo', assetId: assetA })).toThrow(/origemCercaId/);
    expect(() => parseViagem({ tipo: 'externo', assetId: assetA, origemCercaId: cercaA, destinoCercaId: cercaA, cargaCercaId: cercaA2 })).toThrow(/juntas/);
    expect(await repo.criarViagem(clientA, parseViagem({ tipo: 'externo', assetId: assetA, origemCercaId: cercaA, destinoCercaId: cercaB }))).toBe('cerca_invalida');
    const v = (await repo.criarViagem(clientA, parseViagem({ tipo: 'externo', nome: 'Coleta', assetId: assetA, origemCercaId: cercaA, cargaCercaId: cercaA2, descargaCercaId: cercaA2, destinoCercaId: cercaA, carga: 'Cimento' }))) as ViagemRow;
    expect(v.status).toBe('aguardando');
    const t = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
    expect(await repo.avancarEtapa(clientA, v.id, 'carregada', t(8), null)).toBe('ordem');
    expect(await repo.avancarEtapa(clientB, v.id, 'iniciada', t(8), null)).toBeNull();
    expect(await repo.avancarEtapa(clientA, v.id, 'iniciada', t(8), 'rastreador')).toMatchObject({ status: 'em_andamento', origem_inicio: 'rastreador' });
    expect(await repo.avancarEtapa(clientA, v.id, 'encerrada', t(9), null)).toBe('ordem'); // tem carga pendente
    expect(await repo.avancarEtapa(clientA, v.id, 'carregada', t(9), null)).toMatchObject({ status: 'em_andamento' });
    expect(await repo.avancarEtapa(clientA, v.id, 'carregada', t(9), null)).toBe('ordem');
    await repo.avancarEtapa(clientA, v.id, 'descarregada', t(11), null);
    expect(await repo.cancelarViagem(clientB, v.id)).toBeNull();
    const fim = await repo.avancarEtapa(clientA, v.id, 'encerrada', t(13), null);
    expect(fim).toMatchObject({ status: 'concluida' });
    expect((fim as ViagemRow).encerrada_em!.toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(await repo.cancelarViagem(clientA, v.id)).toBeNull(); // concluída não cancela
    expect(await repo.listarViagens(clientA, assetA, true)).toEqual([]);
    expect(await repo.listarViagens(clientB, null, false)).toEqual([]);

    const patio = (await repo.criarViagem(clientA, parseViagem({ tipo: 'patio', assetId: assetA }))) as ViagemRow;
    await repo.avancarEtapa(clientA, patio.id, 'iniciada', t(14), 'portaria');
    expect(await repo.avancarEtapa(clientA, patio.id, 'carregada', t(15), null)).toBe('ordem'); // pátio não tem carga
    expect(await repo.avancarEtapa(clientA, patio.id, 'encerrada', t(16), null)).toMatchObject({ status: 'concluida' });
  });
});
