import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { parseMulta } from './multas.controller';
import { MultasRepository } from './multas.repository';
import { MultasService } from './multas.service';

const DIA = 86_400_000;

describe('multas — lançamento, indicação de condutor, risco de CNH e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new MultasRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new MultasService(repo, settings);
  const agora = new Date('2026-10-26T12:00:00Z');
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let motoristaA: string;
  let motoristaB: string;

  const base = (extra: Record<string, unknown> = {}) =>
    parseMulta(
      {
        auto: 'R123456789',
        orgao: 'DETRAN-PE',
        assetId: assetA,
        ts: '2026-10-01T10:00:00Z',
        local: 'BR-101 km 78',
        codigo: '746-30',
        descricao: 'Velocidade superior à máxima em mais de 20% até 50%',
        gravidade: 'Grave',
        pontos: 5,
        valor: 195.23,
        notificadoEm: '2026-10-10',
        vencimento: '2026-11-10',
        ...extra,
      },
      agora,
    );

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-mul-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-mul-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'MUL1A22') returning id", [clientA])).rows[0].id;
    motoristaA = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome, ear) values ($1, 'Anderson', false) returning id", [clientA])).rows[0].id;
    motoristaB = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome) values ($1, 'Outro') returning id", [clientB])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('valida o lançamento como o front (auto, datas, notificação, vencimento)', () => {
    expect(() => base({ auto: 'ab' })).toThrow(/auto/);
    expect(() => base({ ts: '2027-01-01T00:00:00Z' })).toThrow(/futuro/);
    expect(() => base({ notificadoEm: '2026-09-01' })).toThrow(/anterior à infração/);
    expect(() => base({ vencimento: '2026-10-01' })).toThrow(/anterior à notificação/);
    expect(() => base({ gravidade: 'Enorme' })).toThrow(/gravidade/);
    expect(base().auto).toBe('R123456789');
  });

  it('cria só com ativo/motorista do cliente; auto + órgão únicos por cliente', async () => {
    expect(await repo.criar(clientB, base())).toBe('ativo_invalido');
    expect(await repo.criar(clientA, base({ motoristaId: motoristaB }))).toBe('motorista_invalido');
    const m = await repo.criar(clientA, base());
    expect(m).toMatchObject({ auto: 'R123456789', status: 'aberta', notificado_em: '2026-10-10', vencimento: '2026-11-10' });
    await expect(repo.criar(clientA, base())).rejects.toMatchObject({ code: '23505' });
    expect(await repo.buscar(clientB, (m as { id: string }).id)).toBeNull();
    expect(await repo.listar(clientB, new Date(0), agora, null)).toEqual([]);
  });

  it('indicação pendente: prazo = notificação + 30 dias; estado aviso/crítica/vencida pelo Setup', async () => {
    let [p] = await service.indicacoesPendentes(clientA, new Date('2026-10-26T12:00:00Z'));
    expect(p).toMatchObject({ auto: 'R123456789', notificacaoEstimada: false, estado: 'no_prazo' });
    expect(p.prazoEm.slice(0, 10)).toBe('2026-11-09');
    [p] = await service.indicacoesPendentes(clientA, new Date('2026-11-04T12:00:00Z'));
    expect(p.estado).toBe('aviso');
    [p] = await service.indicacoesPendentes(clientA, new Date('2026-11-08T12:00:00Z'));
    expect(p.estado).toBe('critica');
    [p] = await service.indicacoesPendentes(clientA, new Date('2026-11-20T12:00:00Z'));
    expect(p.estado).toBe('vencida');

    expect(await repo.indicar(clientA, p.id, motoristaB)).toBe('motorista_invalido');
    expect(await repo.indicar(clientB, p.id, motoristaA)).toBe('motorista_invalido'); // motorista A não é do cliente B
    const indicada = await repo.indicar(clientA, p.id, motoristaA);
    expect(indicada).toMatchObject({ status: 'condutor_indicado', motorista_id: motoristaA });
    expect(await service.indicacoesPendentes(clientA, agora)).toEqual([]);
  });

  it('risco de CNH: pontos em 12 meses contra o limite pelas gravíssimas e pelo EAR', async () => {
    const extra = async (auto: string, gravidade: string, pontos: number, mesesAtras: number) =>
      repo.criar(clientA, base({ auto, gravidade, pontos, ts: new Date(agora.getTime() - mesesAtras * 30 * DIA).toISOString(), notificadoEm: null, vencimento: '2027-01-01', motoristaId: motoristaA }));
    await extra('G00000001', 'Gravíssima', 7, 1);
    await extra('G00000002', 'Gravíssima', 7, 2);
    await extra('V00000003', 'Média', 4, 20); // fora da janela de 12 meses
    let [r] = await service.riscoCnh(clientA, agora);
    expect(r).toMatchObject({ motoristaId: motoristaA, pontos: 19, gravissimas: 2, limite: 20, risco: true });
    await pool.query('update motoristas set ear = true where id = $1', [motoristaA]);
    [r] = await service.riscoCnh(clientA, agora);
    expect(r).toMatchObject({ limite: 40, usoPct: 48, risco: false });
    await settings.set(clientA, 'multas.cnh_risco_pct', 40);
    [r] = await service.riscoCnh(clientA, agora);
    expect(r.risco).toBe(true);
    expect((await service.riscoCnh(clientB, agora)).map((x) => x.pontos)).toEqual([0]);
  });
});
