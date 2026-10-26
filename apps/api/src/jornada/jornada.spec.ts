import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { JornadaRepository } from './jornada.repository';
import { JornadaService } from './jornada.service';

const H = 3600_000;

/**
 * Marcações contra o Postgres real e espelho pelo motor compartilhado (`computeDays`): o espelho usa o
 * limite do Setup vigente na data do período, não o atual; isolamento por cliente nas duas pontas.
 */
describe('jornada — marcações e espelho de ponto', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new JornadaRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new JornadaService(repo, settings);
  let clientA: string;
  let clientB: string;
  let motorista: string;
  const dia = Date.parse('2026-10-20T00:00:00-03:00');

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-jor-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-jor-b-${randomUUID()}`])).rows[0].id;
    motorista = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome, regime) values ($1, 'Anderson', 'cargas') returning id", [clientA])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cria marcações só para motorista do cliente; repetida no mesmo instante é 23505', async () => {
    const marca = (h: number, tipo: string) =>
      repo.criar(clientA, { motoristaId: motorista, assetId: null, ts: new Date(dia + h * H), tipo: tipo as never, origem: 'teclado', criadoPor: null });
    expect(await marca(6, 'inicio_jornada')).toMatchObject({ tipo: 'inicio_jornada', origem: 'teclado' });
    await marca(6.05, 'inicio_direcao');
    await marca(12.5, 'fim_direcao'); // 6h25 dirigindo direto: acima das 5h30 da lei
    await marca(12.6, 'inicio_refeicao');
    await marca(13.6, 'fim_refeicao');
    await marca(13.7, 'inicio_direcao');
    await marca(16, 'fim_direcao');
    await marca(16.5, 'fim_jornada');
    await expect(marca(6, 'inicio_jornada')).rejects.toMatchObject({ code: '23505' });
    expect(await repo.criar(clientB, { motoristaId: motorista, assetId: null, ts: new Date(dia), tipo: 'inicio_jornada', origem: 'app', criadoPor: null })).toBeNull();
    expect(await repo.listar(clientA, motorista, new Date(dia), new Date(dia + 24 * H))).toHaveLength(8);
    expect(await repo.listar(clientB, motorista, new Date(dia), new Date(dia + 24 * H))).toEqual([]);
  });

  it('espelho aponta direção contínua acima do limite e usa o limite vigente na data', async () => {
    const e = await service.espelho(clientA, motorista, new Date(dia), new Date(dia + 24 * H), new Date(dia + 48 * H));
    expect(e.regime).toBe('cargas');
    expect(e.limites.contCargasH).toBe(5.5);
    expect(e.dias).toHaveLength(1);
    expect(e.dias[0].violations.map((v) => v.code)).toContain('pausa'); // código do motor para direção contínua acima do limite
    expect(e.dias[0].driving).toBeGreaterThan(8 * H);

    // cliente endurece para 4 h hoje: o espelho de um período anterior à mudança continua com 5,5 h
    await settings.set(clientA, 'jornada.direcao_continua_cargas_h', 4);
    const antigo = await service.espelho(clientA, motorista, new Date(dia), new Date(dia + 24 * H), new Date(dia + 48 * H));
    expect(antigo.limites.contCargasH).toBe(5.5);
    const atual = await service.espelho(clientA, motorista, new Date(dia), new Date(), new Date());
    expect(atual.limites.contCargasH).toBe(4);
    await expect(service.espelho(clientB, motorista, new Date(dia), new Date(dia + 24 * H))).rejects.toMatchObject({ status: 404 });
  });
});
