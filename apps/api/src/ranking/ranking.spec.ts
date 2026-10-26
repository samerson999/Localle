import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JornadaRepository } from '../jornada/jornada.repository';
import { JornadaService } from '../jornada/jornada.service';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { parseEvento, parseMatriz } from './ranking.controller';
import { RankingRepository } from './ranking.repository';
import { RankingService } from './ranking.service';

const H = 3600_000;

describe('ranking — matriz efetiva, pontos com faixas, jornada, limite do Setup e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new RankingRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const jornada = new JornadaRepository(pool);
  const service = new RankingService(repo, jornada, new JornadaService(jornada, settings), settings);
  const de = new Date('2026-10-01T00:00:00Z');
  const ate = new Date('2026-10-31T00:00:00Z');
  const agora = new Date('2026-10-26T12:00:00Z');
  let clientA: string;
  let clientB: string;
  let m1: string;
  let m2: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-rank-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-rank-b-${randomUUID()}`])).rows[0].id;
    m1 = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome) values ($1, 'Anderson') returning id", [clientA])).rows[0].id;
    m2 = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome) values ($1, 'Carla') returning id", [clientA])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('matriz efetiva: catálogo + override do cliente (peso, faixas, ativo) + tipo próprio; outro cliente não vê o override', async () => {
    expect((await service.tipos(clientA)).find((t) => t.code === 'excesso_velocidade')).toMatchObject({ weight: 3, tiers: [{ min: 90, weight: 5 }, { min: 100, weight: 10 }] });
    expect((await service.tipos(clientA)).some((t) => t.category === 'videotelemetria')).toBe(false);
    await repo.salvarMatriz(clientA, parseMatriz('excesso_velocidade', { peso: 4, faixas: [{ min: 95, weight: 8 }] }));
    await repo.salvarMatriz(clientA, parseMatriz('fora_horario', { ativo: false }));
    await repo.salvarMatriz(clientA, parseMatriz('porta_aberta', { label: 'Porta do baú aberta', peso: 2, custom: true }));
    expect(() => parseMatriz('Código Ruim', {})).toThrow(/codigo/);
    const tipos = await service.tipos(clientA);
    expect(tipos.find((t) => t.code === 'excesso_velocidade')).toMatchObject({ weight: 4, tiers: [{ min: 95, weight: 8 }] });
    expect(tipos.find((t) => t.code === 'fora_horario')!.active).toBe(false);
    expect(tipos.find((t) => t.code === 'porta_aberta')).toMatchObject({ label: 'Porta do baú aberta', weight: 2, custom: true, category: 'empresa' });
    expect((await service.tipos(clientB)).find((t) => t.code === 'excesso_velocidade')!.weight).toBe(3);
  });

  it('pontos: peso base, faixa por valor, tipo inativo não conta, violação de jornada entra; limite escala pelo período', async () => {
    const ev = (motoristaId: string, tipo: string, valor: number | null, dia: number) => repo.criarEvento(clientA, parseEvento({ motoristaId, tipo, valor, ts: new Date(de.getTime() + dia * 24 * H).toISOString() }));
    await ev(m1, 'excesso_velocidade', 85, 2); // 4 (peso)
    await ev(m1, 'excesso_velocidade', 98, 3); // 8 (faixa 95)
    await ev(m1, 'frenagem_brusca', null, 4); // 3
    await ev(m1, 'fora_horario', null, 5); // inativo: 0
    await ev(m1, 'porta_aberta', null, 6); // 2
    await ev(m2, 'ociosidade', 25, 7); // 4 (faixa 20)
    expect(await repo.criarEvento(clientB, parseEvento({ motoristaId: m1, tipo: 'ociosidade', ts: agora.toISOString() }))).toBeNull();

    // jornada de m2 com direção contínua acima do limite → 1 violação (4 pontos)
    const dia = Date.parse('2026-10-10T00:00:00-03:00');
    const marca = (h: number, tipo: string) => jornada.criar(clientA, { motoristaId: m2, assetId: null, ts: new Date(dia + h * H), tipo: tipo as never, origem: 'app', criadoPor: null });
    await marca(6, 'inicio_jornada'); await marca(6.1, 'inicio_direcao'); await marca(12.5, 'fim_direcao'); await marca(13, 'fim_jornada');

    const r = await service.calcular(clientA, de, ate, agora);
    expect(r).toMatchObject({ limit: 100, limit_period: 'mes', days: 25.5 }); // até "agora" (26/10 12h), não até 31/10
    expect(r.limit_scaled).toBe(85);
    const a = r.drivers.find((d) => d.person_id === m1)!;
    const c = r.drivers.find((d) => d.person_id === m2)!;
    expect(a).toMatchObject({ points: 17, events: 4, attention: false });
    expect(c.points).toBe(12); // 4 (ociosidade na faixa 20) + 2 violações de jornada × 4 (pausa e refeição)
    expect(c.by_code.find((b) => b.code === 'violacao_jornada')!.qty).toBe(2);
    expect(c.by_code.map((b) => b.code).sort()).toEqual(['ociosidade', 'violacao_jornada']);
    expect(r.drivers[0].person_id).toBe(m2); // menos pontos primeiro

    await settings.set(clientA, 'ranking.limite_pontos', 10);
    await settings.set(clientA, 'ranking.periodo_limite', 'semana');
    const r2 = await service.calcular(clientA, de, ate, agora);
    expect(r2.limit_scaled).toBe(36.4);
    expect(r2.drivers.find((d) => d.person_id === m1)!.attention).toBe(false);
    await settings.set(clientA, 'ranking.limite_pontos', 1);
    expect((await service.calcular(clientA, de, ate, agora)).drivers.find((d) => d.person_id === m1)!.attention).toBe(true);
    expect((await service.calcular(clientB, de, ate, agora)).drivers).toEqual([]);
  });
});
