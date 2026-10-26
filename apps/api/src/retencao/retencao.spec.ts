import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { RetencaoRepository } from './retencao.repository';
import { RetencaoService, subtrairMeses } from './retencao.service';

/**
 * Retenção por plano contra o Postgres real: cada cliente perde só o que passou do `historico_meses` do
 * SEU contrato; eventos ficam no mínimo 24 meses; cliente sem contrato não é tocado; e a compressão das
 * hypertables (migration 1792970000000) está configurada.
 */
describe('retenção por plano do cliente', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new RetencaoService(new RetencaoRepository(pool), settings);
  const agora = new Date('2026-10-26T12:00:00Z');

  let clienteCurto: string; // 3 meses
  let clienteLongo: string; // 12 meses
  let clienteSemContrato: string;
  const rastreadores: string[] = [];

  const novoCliente = async (historicoMeses: number | null) => {
    const id = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-ret-${randomUUID()}`])).rows[0].id;
    if (historicoMeses !== null) {
      const contrato = (await pool.query<{ id: string }>("insert into contratos (client_id, status) values ($1, 'ativo') returning id", [id])).rows[0].id;
      // duas versões: a mais recente é a que vale
      for (const meses of [120, historicoMeses]) {
        await pool.query(
          `insert into contrato_versoes (contrato_id, client_id, tipo_cobranca, historico_meses, dia_vencimento, criado_por, criado_em)
           values ($1, $2, 'mensalidade_fixa', $3, 10, $4, now() + ($5 || ' seconds')::interval)`,
          [contrato, id, meses, randomUUID(), meses === historicoMeses ? 1 : 0],
        );
      }
    }
    return id;
  };

  const semear = async (clientId: string, mesesAtras: number[]) => {
    const rastreadorId = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)])).rows[0].id;
    rastreadores.push(rastreadorId);
    for (const m of mesesAtras) {
      const t = subtrairMeses(agora, m);
      await pool.query(
        `insert into posicoes (rastreador_id, traccar_position_id, client_id, fix_time, server_time, valid, geom)
         values ($1, $2, $3, $4, $4, true, st_setsrid(st_makepoint(-34.88, -8.05), 4326))`,
        [rastreadorId, Math.floor(Math.random() * 1e9), clientId, t],
      );
      await pool.query(`insert into eventos (rastreador_id, client_id, origem, tipo, ts) values ($1, $2, 'aparelho', 'ignitionOn', $3)`, [rastreadorId, clientId, t]);
    }
    return rastreadorId;
  };

  const contar = async (tabela: 'posicoes' | 'eventos', clientId: string) =>
    (await pool.query<{ n: number }>(`select count(*)::int as n from ${tabela} where client_id = $1`, [clientId])).rows[0].n;

  beforeAll(async () => {
    clienteCurto = await novoCliente(3);
    clienteLongo = await novoCliente(12);
    clienteSemContrato = await novoCliente(null);
    await semear(clienteCurto, [1, 2, 4, 25]);
    await semear(clienteLongo, [1, 4, 11, 13, 25]);
    await semear(clienteSemContrato, [1, 36]);
  });

  afterAll(async () => {
    for (const r of rastreadores) {
      await pool.query('delete from eventos where rastreador_id = $1', [r]);
      await pool.query('delete from posicoes where rastreador_id = $1', [r]);
      await pool.query('delete from rastreadores where id = $1', [r]);
    }
    await pool.query('delete from clients where id in ($1, $2, $3)', [clienteCurto, clienteLongo, clienteSemContrato]);
    await pool.end();
  });

  it('apaga só o que venceu o prazo de cada cliente; eventos ficam pelo menos 24 meses', async () => {
    const r = await service.executar(agora);
    expect(r.clientes).toBeGreaterThanOrEqual(2);
    expect(await contar('posicoes', clienteCurto)).toBe(2); // 1 e 2 meses ficam; 4 e 25 saem
    expect(await contar('eventos', clienteCurto)).toBe(3); // só o de 25 meses sai (mínimo 24)
    expect(await contar('posicoes', clienteLongo)).toBe(3); // 1, 4, 11 ficam; 13 e 25 saem
    expect(await contar('eventos', clienteLongo)).toBe(4); // só o de 25 meses sai
  });

  it('cliente sem contrato não é tocado', async () => {
    expect(await contar('posicoes', clienteSemContrato)).toBe(2);
    expect(await contar('eventos', clienteSemContrato)).toBe(2);
  });

  it('os prazos da rotina são parâmetros do Setup só da Locale: o cliente não altera', async () => {
    await expect(settings.set(clienteCurto, 'retencao.eventos_minimo_meses', 1)).rejects.toMatchObject({ status: 403 });
    await expect(settings.restoreDefault(clienteCurto, 'retencao.eventos_minimo_meses')).rejects.toMatchObject({ status: 403 });
    expect((await settings.resolveAll(clienteCurto)).find((s) => s.key === 'retencao.eventos_minimo_meses')).toMatchObject({ value: 24, somenteLocale: true });
  });

  it('rodar de novo não apaga mais nada (idempotente)', async () => {
    const r = await service.executar(agora);
    expect(r.posicoes).toBe(0);
    expect(r.eventos).toBe(0);
  });

  it('compressão após 7 dias está configurada nas duas hypertables, segmentada por rastreador', async () => {
    const { rows } = await pool.query<{ hypertable_name: string; config: { compress_after: string } }>(
      `select hypertable_name, config from timescaledb_information.jobs where proc_name = 'policy_compression' and hypertable_name in ('posicoes', 'eventos') order by 1`,
    );
    expect(rows.map((r) => [r.hypertable_name, r.config.compress_after])).toEqual([
      ['eventos', '7 days'],
      ['posicoes', '7 days'],
    ]);
    const seg = await pool.query<{ hypertable_name: string; attname: string }>(
      `select hypertable_name, attname from timescaledb_information.compression_settings where segmentby_column_index is not null order by 1`,
    );
    expect(seg.rows).toEqual([
      { hypertable_name: 'eventos', attname: 'rastreador_id' },
      { hypertable_name: 'posicoes', attname: 'rastreador_id' },
    ]);
  });
});
