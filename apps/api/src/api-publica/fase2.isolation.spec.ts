import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { JornadaRepository } from '../jornada/jornada.repository';
import { JornadaService } from '../jornada/jornada.service';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { RankingRepository } from '../ranking/ranking.repository';
import { RankingService } from '../ranking/ranking.service';
import { FrotaReportsRepository } from '../reports/frota-reports.repository';
import { FrotaReportsService } from '../reports/frota-reports.service';
import { ReportsRepository } from '../reports/reports.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { ViagensRepository } from '../viagens/viagens.repository';
import { OperacaoController } from './operacao/operacao.controller';
import { RelatoriosController } from './relatorios/relatorios.controller';

/**
 * Fase 2 da API pública (docs/PLANO-API-PUBLICA.md § 4.1): relatórios, viagens, jornada e ranking só com dado do
 * cliente consultado. Contra o Postgres local.
 */
describe('API pública — fase 2 (isolamento e contrato)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const jornadaRepo = new JornadaRepository(pool);
  const jornadaService = new JornadaService(jornadaRepo, settings);
  const rankingRepo = new RankingRepository(pool);
  const relatorios = new RelatoriosController(new ReportsRepository(pool), new FrotaReportsService(new FrotaReportsRepository(pool)), new MonitoringRepository(pool), settings, new AssetsRepository(pool));
  const operacao = new OperacaoController(new ViagensRepository(pool), jornadaRepo, jornadaService, rankingRepo, new RankingService(rankingRepo, jornadaRepo, jornadaService, settings));

  const DE = '2026-01-01T00:00:00Z';
  const ATE = '2026-01-05T00:00:00Z';
  const periodo = [DE, ATE] as const;
  interface Dados { client: string; veiculo: string; rastreador: string; motorista: string; viagem: string; rota: string; marcacao: string; eventoRanking: string; cerca: string }
  const A = {} as Dados;
  const B = {} as Dados;
  const rastreadores: string[] = [];

  async function semear(d: Dados, nome: string) {
    d.client = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`${nome}-${randomUUID()}`])).rows[0].id;
    d.veiculo = (await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [d.client, nome.toUpperCase().slice(0, 3) + '2B34'])).rows[0].id;
    d.rastreador = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)])).rows[0].id;
    rastreadores.push(d.rastreador);
    await pool.query("insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2025-12-01T00:00:00Z', 'teste')", [d.client, d.rastreador, d.veiculo]);
    // 10 posições, 1 por minuto, andando para leste a 60 km/h, passando por (-8.05, -34.88)
    await pool.query(
      `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh, ignition)
       select $1, n, $2, $3, '2026-01-02T10:00:00Z'::timestamptz + n * interval '1 minute', now(), true,
              st_setsrid(st_makepoint(-34.88 + n * 0.009, -8.05), 4326), 60, true from generate_series(0, 9) n`,
      [d.rastreador, d.client, d.veiculo],
    );
    d.cerca = (await pool.query<{ id: string }>(
      "insert into cercas (client_id, nome, tipo, forma, centro, raio_m) values ($1, 'Origem', 'Base', 'circulo', st_setsrid(st_makepoint(-34.88, -8.05), 4326), 300) returning id",
      [d.client],
    )).rows[0].id;
    d.motorista = (await pool.query<{ id: string }>('insert into motoristas (client_id, nome) values ($1, $2) returning id', [d.client, `Mot ${nome}`])).rows[0].id;
    d.viagem = (await pool.query<{ id: string }>("insert into viagens (client_id, tipo, asset_id, motorista_id, status, iniciada_em) values ($1, 'externo', $2, $3, 'em_andamento', '2026-01-02T10:00:00Z') returning id", [d.client, d.veiculo, d.motorista])).rows[0].id;
    d.rota = (await pool.query<{ id: string }>('insert into viagem_matrizes (client_id, nome) values ($1, $2) returning id', [d.client, `Rota ${nome}`])).rows[0].id;
    d.marcacao = (await pool.query<{ id: string }>("insert into jornada_marcacoes (client_id, motorista_id, ts, tipo, origem) values ($1, $2, '2026-01-02T08:00:00Z', 'inicio_jornada', 'app') returning id", [d.client, d.motorista])).rows[0].id;
    await pool.query("insert into jornada_marcacoes (client_id, motorista_id, ts, tipo, origem) values ($1, $2, '2026-01-02T17:00:00Z', 'fim_jornada', 'app')", [d.client, d.motorista]);
    d.eventoRanking = (await pool.query<{ id: string }>("insert into ranking_eventos (client_id, motorista_id, ts, tipo, valor, origem) values ($1, $2, '2026-01-02T10:00:00Z', 'excesso_velocidade', 95, 'regra') returning id", [d.client, d.motorista])).rows[0].id;
  }

  beforeAll(async () => {
    await semear(A, 'aaa');
    await semear(B, 'bbb');
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from instalacoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from clients where id = any($1)', [[A.client, B.client]]);
    await pool.query('delete from rastreadores where id = any($1)', [rastreadores]);
    await pool.end();
  });

  it('relatórios por veículo: 404 no veículo de outro cliente, resultado no próprio', async () => {
    await expect(relatorios.quilometragem(A.client, B.veiculo, ...periodo)).rejects.toThrow(NotFoundException);
    await expect(relatorios.excessos(A.client, B.veiculo, ...periodo)).rejects.toThrow(NotFoundException);
    await expect(relatorios.paradas(A.client, B.veiculo, ...periodo)).rejects.toThrow(NotFoundException);
    await expect(relatorios.percurso(A.client, B.veiculo, ...periodo)).rejects.toThrow(NotFoundException);
    expect((await relatorios.quilometragem(A.client, A.veiculo, ...periodo)).veiculoId).toBe(A.veiculo);
    const p = await relatorios.percurso(A.client, A.veiculo, ...periodo);
    expect(p.posicoes).toBe(10);
    expect(p.distanciaKm).toBeGreaterThan(8);
    expect(p.emMovimentoMin).toBe(9);
  });

  it('relatórios da frota só trazem veículos do cliente, mesmo pedindo o id de outro', async () => {
    const v = await relatorios.velocidade(A.client, ...periodo, `${A.veiculo},${B.veiculo}`, '50');
    expect(v.dados.map((x) => x.veiculoId)).toEqual([A.veiculo]);
    expect(v.dados[0].trechos[0]).toMatchObject({ velocidadeMaxKmh: 60, localInicio: { latitude: -8.05 } });
    const toda = await relatorios.velocidade(A.client, ...periodo, undefined, '50');
    expect(toda.dados.map((x) => x.veiculoId)).toEqual([A.veiculo]);
    const c = await relatorios.cercas(A.client, ...periodo);
    expect(c.dados.map((x) => x.veiculoId)).toEqual([A.veiculo]);
    expect(c.dados[0].passagens[0].cercaId).toBe(A.cerca);
    const pp = await relatorios.passouPorAqui(A.client, '-8.05', '-34.88', '200', ...periodo);
    expect(pp.dados.map((x) => x.veiculoId)).toEqual([A.veiculo]);
  });

  it('relatórios da frota: limites de veículos e de período', async () => {
    const muitos = Array.from({ length: 51 }, () => randomUUID()).join(',');
    await expect(relatorios.velocidade(A.client, ...periodo, muitos)).rejects.toThrow(/50 veículos/);
    // frota toda: até 7 dias; com lista: até 31
    await expect(relatorios.velocidade(A.client, '2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z')).rejects.toThrow(/7 dias/);
    expect((await relatorios.velocidade(A.client, '2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z', A.veiculo)).dados).toHaveLength(1);
    await expect(relatorios.passouPorAqui(A.client, '-8.05', '-34.88', '99999', ...periodo)).rejects.toThrow(BadRequestException);
  });

  it('viagens e rotas só do cliente', async () => {
    const v = await operacao.listarViagens(A.client, ...periodo);
    expect(v.dados.map((x) => x.id)).toEqual([A.viagem]);
    expect(v.dados[0]).toMatchObject({ veiculoId: A.veiculo, situacao: 'em_andamento' });
    await expect(operacao.buscarViagem(A.client, B.viagem)).rejects.toThrow(NotFoundException);
    expect((await operacao.listarRotas(A.client)).dados.map((r) => r.id)).toEqual([A.rota]);
  });

  it('jornada: marcações e espelho só do cliente', async () => {
    const m = await operacao.marcacoes(A.client, ...periodo);
    expect(m.dados).toHaveLength(2);
    expect(m.dados.every((x) => x.motoristaId === A.motorista)).toBe(true);
    expect((await operacao.marcacoes(A.client, ...periodo, B.motorista)).dados).toEqual([]);
    await expect(operacao.espelho(A.client, B.motorista, ...periodo)).rejects.toThrow(NotFoundException);
    const e = await operacao.espelho(A.client, A.motorista, ...periodo);
    expect(e.dias[0]).toMatchObject({ dia: '2026-01-02', trabalhadoMin: 540 });
    expect(e.limites.jornadaBaseMin).toBeGreaterThanOrEqual(1);
  });

  it('ranking e eventos do ranking só do cliente', async () => {
    const r = await operacao.calcularRanking(A.client, ...periodo);
    expect(r.motoristas.map((x) => x.motoristaId)).toEqual([A.motorista]);
    const ev = await operacao.eventosRanking(A.client, ...periodo);
    expect(ev.dados.map((x) => x.id)).toEqual([A.eventoRanking]);
    expect(ev.dados[0].valor).toBe(95);
  });
});
