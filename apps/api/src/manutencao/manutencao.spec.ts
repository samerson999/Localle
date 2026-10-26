import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { parseOs, parsePlano } from './manutencao.controller';
import { ManutencaoRepository, type PlanoRow } from './manutencao.repository';
import { ManutencaoService } from './manutencao.service';

const DIA = 86_400_000;

describe('manutenção — planos, OS, status do plano pelo Setup e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ManutencaoRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new ManutencaoService(repo, settings);
  const agora = new Date('2026-10-26T12:00:00Z');
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let assetB: string;
  let plano: PlanoRow;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-man-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-man-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'MAN1A22') returning id", [clientA])).rows[0].id;
    assetB = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'MAN1B22') returning id", [clientB])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('plano: validação do gatilho; ativo de outro cliente não entra no vínculo', async () => {
    expect(() => parsePlano({ nome: 'x', servico: 'oleo_motor', gatilho: 'km' })).toThrow(/kmIntervalo/);
    expect(() => parsePlano({ nome: 'x', servico: 'oleo_motor', gatilho: 'tempo' })).toThrow(/diasIntervalo/);
    plano = (await repo.salvarPlano(
      clientA,
      parsePlano({ nome: 'Troca de óleo', servico: 'oleo_motor', gatilho: 'ambos', kmIntervalo: 10000, diasIntervalo: 180, antecedenciaKm: 1000, antecedenciaDias: 15, assetIds: [assetA, assetB] }),
      null,
    ))!;
    expect(plano.asset_ids).toEqual([assetA]);
    expect(await repo.salvarPlano(clientB, parsePlano({ nome: 'y', servico: 'freios', gatilho: 'km', kmIntervalo: 1 }), plano.id)).toBeNull();
    expect(await repo.listarPlanos(clientB)).toEqual([]);
  });

  it('status: sem histórico → em dia → próxima → vencida → crítica (prazo do plano ou do Setup)', async () => {
    let st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st.status).toBe('sem_historico');

    const os = (b: Record<string, unknown>) => repo.salvarOs(clientA, parseOs({ assetId: assetA, tipo: 'preventiva', titulo: 'Óleo', servicos: ['oleo_motor'], planoId: plano.id, ...b }), null);
    expect(() => parseOs({ assetId: assetA, tipo: 'preventiva', titulo: 'x', status: 'concluida' })).toThrow(/liberadaEm/);
    await os({ status: 'concluida', liberadaEm: new Date(agora.getTime() - 100 * DIA).toISOString(), odometro: 100_000 });
    await pool.query("insert into abastecimentos (client_id, asset_id, ts, odometro, litros, total, combustivel) values ($1, $2, $3, 105000, 100, 600, 'Diesel')", [clientA, assetA, agora]);
    st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st).toMatchObject({ status: 'em_dia', kmAtual: 105_000, proximoKm: 110_000, restaKm: 5000, restaDias: 80, nivel: null });

    await pool.query('update abastecimentos set odometro = 109500 where client_id = $1', [clientA]);
    st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st.status).toBe('proxima');

    await pool.query('update abastecimentos set odometro = 110500 where client_id = $1', [clientA]);
    st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st).toMatchObject({ status: 'vencida', nivel: 'alerta' });

    await pool.query('update abastecimentos set odometro = 111500 where client_id = $1', [clientA]); // 1.500 km além: passa dos 1.000 do Setup
    st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st.nivel).toBe('crit');
    await settings.set(clientA, 'manutencao.critico_apos_km', 2000);
    st = await service.statusDoPlano(clientA, plano, assetA, agora);
    expect(st.nivel).toBe('alerta');
    const comPrazoProprio = (await repo.salvarPlano(clientA, parsePlano({ nome: 'Troca de óleo', servico: 'oleo_motor', gatilho: 'ambos', kmIntervalo: 10000, diasIntervalo: 180, criticoKm: 500, assetIds: [assetA] }), plano.id))!;
    st = await service.statusDoPlano(clientA, comPrazoProprio, assetA, agora);
    expect(st.nivel).toBe('crit');

    // corretiva do mesmo serviço recalcula o plano; OS aberta do plano vira os_aberta
    await os({ tipo: 'corretiva', titulo: 'Vazamento', naoPlanejada: true, status: 'concluida', liberadaEm: new Date(agora.getTime() - DIA).toISOString(), odometro: 111_400 });
    st = await service.statusDoPlano(clientA, comPrazoProprio, assetA, agora);
    expect(st).toMatchObject({ status: 'em_dia', recalculadaPorCorretiva: true, proximoKm: 121_400 });
    const aberta = await os({ status: 'aberta' });
    st = await service.statusDoPlano(clientA, comPrazoProprio, assetA, agora);
    expect(st).toMatchObject({ status: 'os_aberta', osAbertaId: (aberta as { id: string }).id });
    expect((await service.statusGeral(clientA, agora)).map((s) => s.status)).toEqual(['os_aberta']);
  });

  it('OS: vínculos do cliente; outro cliente não lê nem altera', async () => {
    expect(await repo.salvarOs(clientB, parseOs({ assetId: assetA, tipo: 'corretiva', titulo: 'x' }), null)).toBe('ativo_invalido');
    expect(await repo.salvarOs(clientA, parseOs({ assetId: assetA, tipo: 'corretiva', titulo: 'x', planoId: randomUUID() }), null)).toBe('plano_invalido');
    const [os] = await repo.listarOs(clientA, assetA, true);
    expect(await repo.buscarOs(clientB, os.id)).toBeNull();
    expect(await repo.salvarOs(clientB, parseOs({ assetId: assetB, tipo: 'corretiva', titulo: 'hack' }), os.id)).toBeNull();
    expect(await repo.listarOs(clientB, null, false)).toEqual([]);
    expect(Number(os.numero)).toBeGreaterThan(0);
  });
});
