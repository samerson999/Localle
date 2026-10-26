import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { AbastecimentosRepository } from './abastecimentos.repository';
import { parseAbastecimento } from './combustivel.controller';
import { CombustivelService } from './combustivel.service';

describe('combustível — abastecimentos, divergências pelo Setup e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new AbastecimentosRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new CombustivelService(repo, settings);
  let clientA: string;
  let clientB: string;
  let assetA: string;

  const base = (extra: Record<string, unknown> = {}) =>
    parseAbastecimento({ assetId: assetA, ts: '2026-10-10T08:00:00Z', odometro: 100_000, litros: 100, total: 605, precoLitro: 6.05, combustivel: 'Diesel S10', posto: 'Posto BR-101', postoCnpj: '11.111.111/0001-11', ...extra });

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-comb-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-comb-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'CMB1A22') returning id", [clientA])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('valida o corpo e os vínculos; outro cliente não lança no ativo alheio', async () => {
    expect(() => parseAbastecimento({ assetId: assetA, ts: 'x' })).toThrow(/ts/);
    expect(() => base({ litros: 0 })).toThrow(/litros/);
    expect(await repo.criar(clientB, base())).toBe('ativo_invalido');
    expect(await repo.criar(clientA, base({ motoristaId: randomUUID() }))).toBe('motorista_invalido');
    const a = await repo.criar(clientA, base());
    expect(a).toMatchObject({ combustivel: 'Diesel S10', nf: null });
    expect(await repo.listar(clientB, new Date(0), new Date(), null)).toEqual([]);
  });

  it('divergências: nota (litros/valor/data/posto), km do rastreador e salto de km, com tolerâncias do Setup', async () => {
    await repo.criar(
      clientA,
      base({
        ts: '2026-10-12T08:00:00Z',
        odometro: 100_600,
        kmRastreador: 100_500, // 100 km acima da tolerância padrão (50)
        nf: { litros: 104, total: 610, data: '2026-10-15', cnpj: '22.222.222/0001-22' },
      }),
    );
    let lista = await service.listar(clientA, new Date('2026-10-01'), new Date('2026-10-31'), assetA);
    expect(lista).toHaveLength(2);
    const [segundo, primeiro] = lista;
    expect(primeiro.divergencias).toEqual([]);
    expect(segundo.divergencias.map((d) => d.tipo).sort()).toEqual(['data', 'km', 'litros', 'posto', 'valor']);

    // tolerâncias mais frouxas no Setup: litros 5 %, valor R$ 10, data 7 dias, km 200, mesmo posto desligado
    await settings.set(clientA, 'combustivel.tol_litros_pct', 5);
    await settings.set(clientA, 'combustivel.tol_valor_rs', 10);
    await settings.set(clientA, 'combustivel.tol_data_dias', 7);
    await settings.set(clientA, 'combustivel.tol_km_rastreador', 200);
    await settings.set(clientA, 'combustivel.exigir_mesmo_posto', 0);
    lista = await service.listar(clientA, new Date('2026-10-01'), new Date('2026-10-31'), assetA);
    expect(lista[0].divergencias).toEqual([]);

    // salto de km: odômetro menor que o anterior, ou acima do salto suspeito
    await repo.criar(clientA, base({ ts: '2026-10-14T08:00:00Z', odometro: 99_000 }));
    await repo.criar(clientA, base({ ts: '2026-10-16T08:00:00Z', odometro: 120_000 }));
    lista = await service.listar(clientA, new Date('2026-10-01'), new Date('2026-10-31'), assetA);
    expect(lista[0].divergencias.map((d) => d.tipo)).toEqual(['salto_km']); // 99.000 → 120.000 em 2 dias
    expect(lista[1].divergencias.map((d) => d.tipo)).toEqual(['salto_km']); // 100.600 → 99.000
    const quarto = lista[0];
    expect(await repo.atualizar(clientB, quarto.id, base())).toBe('ativo_invalido');
    expect(await repo.delete(clientB, quarto.id)).toBe(false);
    expect(await repo.delete(clientA, quarto.id)).toBe(true);
  });
});
