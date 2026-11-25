import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { ChecklistRepository } from '../checklist/checklist.repository';
import { AbastecimentosRepository } from '../combustivel/abastecimentos.repository';
import { CombustivelService } from '../combustivel/combustivel.service';
import { JornadaRepository } from '../jornada/jornada.repository';
import { JornadaService } from '../jornada/jornada.service';
import { ManutencaoRepository } from '../manutencao/manutencao.repository';
import { ManutencaoService } from '../manutencao/manutencao.service';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { MotoristaVinculosRepository } from '../motoristas/motorista-vinculos.repository';
import { MotoristasRepository } from '../motoristas/motoristas.repository';
import { MultasRepository } from '../multas/multas.repository';
import { MultasService } from '../multas/multas.service';
import { PneusRepository } from '../pneus/pneus.repository';
import { PneusService } from '../pneus/pneus.service';
import { RankingRepository } from '../ranking/ranking.repository';
import { RankingService } from '../ranking/ranking.service';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { ViagensRepository } from '../viagens/viagens.repository';
import { EmpresaRepository } from '../empresa/empresa.repository';
import { GruposRepository } from '../grupos/grupos.repository';
import { OperacoesRepository } from '../operacoes/operacoes.repository';
import { RastreadorVinculosRepository } from '../rastreadores/rastreador-vinculos.repository';
import { FrotaReportsRepository } from '../reports/frota-reports.repository';
import { FrotaReportsService } from '../reports/frota-reports.service';
import { ReportsRepository } from '../reports/reports.repository';
import { CustosController } from './custos/custos.controller';
import { FrotaController } from './frota/frota.controller';
import { RelatoriosController } from './relatorios/relatorios.controller';
import { MotoristasPublicoController } from './motoristas/motoristas.controller';
import { OperacaoController } from './operacao/operacao.controller';
import { TelemetriaController } from './telemetria/telemetria.controller';
import { VeiculosController } from './veiculos/veiculos.controller';

/**
 * Filtros e paginação da API pública que as fases 1–3 não cobrem: `incluirInativos` (veículos e motoristas) e o
 * cursor de cada série temporal percorrido até o fim, sem repetir, sem pular e sem trazer o outro cliente.
 * Contra o Postgres local.
 */
describe('API pública — inativos e paginação das séries', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const assets = new AssetsRepository(pool);
  const abast = new AbastecimentosRepository(pool);
  const multas = new MultasRepository(pool);
  const manut = new ManutencaoRepository(pool);
  const pneus = new PneusRepository(pool);
  const jornadaRepo = new JornadaRepository(pool);
  const jornadaService = new JornadaService(jornadaRepo, settings);
  const rankingRepo = new RankingRepository(pool);
  const veiculos = new VeiculosController(assets);
  const motoristas = new MotoristasPublicoController(new MotoristasRepository(pool), new MotoristaVinculosRepository(pool), settings);
  const telemetria = new TelemetriaController(new MonitoringRepository(pool), settings, assets);
  const operacao = new OperacaoController(new ViagensRepository(pool), jornadaRepo, jornadaService, rankingRepo, new RankingService(rankingRepo, jornadaRepo, jornadaService, settings));
  const frota = new FrotaController(new EmpresaRepository(pool), new GruposRepository(pool), new OperacoesRepository(pool), new RastreadorVinculosRepository(pool), assets);
  const relatorios = new RelatoriosController(new ReportsRepository(pool), new FrotaReportsService(new FrotaReportsRepository(pool)), new MonitoringRepository(pool), settings, assets);
  const custos = new CustosController(
    abast, new CombustivelService(abast, settings), multas, new MultasService(multas, settings), manut, new ManutencaoService(manut, settings),
    new ChecklistRepository(pool), pneus, new PneusService(pneus, settings),
  );

  const agora = Date.now();
  const DE = new Date(agora - 10 * 86_400_000).toISOString();
  const ATE = new Date(agora + 86_400_000).toISOString();
  /** 5 instantes distintos e 2 repetidos (empate no tempo, desempate pelo id). */
  const instantes = [2, 3, 3, 4, 5].map((d) => new Date(agora - d * 86_400_000).toISOString());
  const N = instantes.length;

  interface Dados { client: string; veiculo: string; vendido: string; baixado: string; motorista: string; desativado: string; rastreador: string; pneu: string }
  const A = {} as Dados;
  const B = {} as Dados;
  const rastreadores: string[] = [];
  const esperado: Record<string, string[]> = {};

  const id = async (sql: string, params: unknown[]) => (await pool.query<{ id: string }>(sql + ' returning id', params)).rows[0].id;

  async function semear(d: Dados, nome: string, quantos: number) {
    d.client = await id('insert into clients (name) values ($1)', [`${nome}-${randomUUID()}`]);
    d.veiculo = await id('insert into assets (client_id, plate) values ($1, $2)', [d.client, nome.toUpperCase() + '4D56']);
    d.vendido = await id("insert into assets (client_id, plate, status) values ($1, $2, 'vendido')", [d.client, nome.toUpperCase() + '4D57']);
    d.baixado = await id("insert into assets (client_id, plate, status) values ($1, $2, 'baixado')", [d.client, nome.toUpperCase() + '4D58']);
    d.motorista = await id('insert into motoristas (client_id, nome) values ($1, $2)', [d.client, `Mot ${nome}`]);
    d.desativado = await id('insert into motoristas (client_id, nome, desativado_em) values ($1, $2, now())', [d.client, `Ex ${nome}`]);
    d.rastreador = await id('insert into rastreadores (imei) values ($1)', [randomUUID().replace(/-/g, '').slice(0, 15)]);
    rastreadores.push(d.rastreador);
    await pool.query("insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, $4, 'teste')", [d.client, d.rastreador, d.veiculo, DE]);
    d.pneu = await id('insert into pneus (client_id, numero_fogo, sulco_inicial_mm, sulco_atual_mm) values ($1, $2, 16, 8)', [d.client, `F-${nome}`]);
    const ids: Record<string, string[]> = { abastecimentos: [], multas: [], ordens: [], movimentos: [], viagens: [], marcacoes: [], ranking: [], eventos: [] };
    for (const [i, ts] of instantes.slice(0, quantos).entries()) {
      ids.abastecimentos.push(await id("insert into abastecimentos (client_id, asset_id, motorista_id, ts, odometro, litros, total, combustivel) values ($1, $2, $3, $4, 1000, 50, 300, 'Diesel S10')", [d.client, d.veiculo, d.motorista, ts]));
      ids.multas.push(await id("insert into multas (client_id, auto, orgao, asset_id, motorista_id, ts, local, codigo, descricao, gravidade, pontos, valor, vencimento, status) values ($1, $2, 'DETRAN', $3, $4, $5, 'BR-101', '7455', 'Excesso', 'Grave', 5, 100, '2027-01-01', 'aberta')", [d.client, randomUUID().slice(0, 8), d.veiculo, d.motorista, ts]));
      ids.ordens.push(await id("insert into ordens_servico (client_id, asset_id, tipo, titulo, aberta_em) values ($1, $2, 'corretiva', 'Freio', $3)", [d.client, d.veiculo, ts]));
      ids.movimentos.push(await id("insert into pneu_movimentos (client_id, pneu_id, tipo, ts) values ($1, $2, 'medicao', $3)", [d.client, d.pneu, ts]));
      ids.viagens.push(await id("insert into viagens (client_id, tipo, asset_id, motorista_id, status, iniciada_em) values ($1, 'externo', $2, $3, 'em_andamento', $4)", [d.client, d.veiculo, d.motorista, ts]));
      ids.marcacoes.push(await id("insert into jornada_marcacoes (client_id, motorista_id, ts, tipo, origem) values ($1, $2, $3, $4, 'app')", [d.client, d.motorista, ts, i % 2 ? 'fim_jornada' : 'inicio_jornada']));
      ids.ranking.push(await id("insert into ranking_eventos (client_id, motorista_id, ts, tipo, valor, origem) values ($1, $2, $3, 'excesso_velocidade', 90, 'regra')", [d.client, d.motorista, ts]));
      ids.eventos.push(await id("insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts) values ($1, $2, $3, 'aparelho', 'ignitionOn', $4)", [d.rastreador, d.client, d.veiculo, ts]));
    }
    await pool.query('update clients set empresa = $2 where id = $1', [d.client, JSON.stringify({ razaoSocial: `Empresa ${nome}`, cnpj: null, endereco: null })]);
    // 6 posições a 60 km/h há meia hora, andando para leste: entram no uso de hoje (uso_5min em tempo real)
    await pool.query(
      `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh, ignition)
       select $1, n, $2, $3, now() - interval '30 minutes' + n * interval '1 minute', now(), true,
              st_setsrid(st_makepoint(-34.88 + n * 0.009, -8.05), 4326), 60, true from generate_series(0, 5) n`,
      [d.rastreador, d.client, d.veiculo],
    );
    return ids;
  }

  beforeAll(async () => {
    Object.assign(esperado, await semear(A, 'aaa', N));
    await semear(B, 'bbb', 2);
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from eventos where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from instalacoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from clients where id = any($1)', [[A.client, B.client]]);
    await pool.query('delete from rastreadores where id = any($1)', [rastreadores]);
    await pool.end();
  });

  it('veículos: vendidos e baixados só com incluirInativos=true; o veículo inativo continua acessível pelo id', async () => {
    const ids = async (inativos?: string) => (await veiculos.listar(A.client, undefined, undefined, inativos)).dados.map((v) => v.id).sort();
    expect(await ids()).toEqual([A.veiculo]);
    expect(await ids('false')).toEqual([A.veiculo]);
    expect(await ids('true')).toEqual([A.veiculo, A.vendido, A.baixado].sort());
    expect((await veiculos.buscar(A.client, A.vendido)).id).toBe(A.vendido);
    const todos = (await veiculos.listar(A.client, '1', undefined, 'true'));
    expect(todos.dados).toHaveLength(1);
    expect(todos.proximoCursor).not.toBeNull();
  });

  it('motoristas: desativados só com incluirInativos=true, e nunca os do outro cliente', async () => {
    const ids = async (inativos?: string) => (await motoristas.listar(A.client, inativos)).dados.map((m) => m.id).sort();
    expect(await ids()).toEqual([A.motorista]);
    expect(await ids('true')).toEqual([A.motorista, A.desativado].sort());
  });

  type Pagina = { dados: { id?: string }[]; proximoCursor: string | null };
  const series: [string, (cursor?: string) => Promise<Pagina>][] = [
    ['abastecimentos', (c) => custos.listarAbastecimentos(A.client, DE, ATE, undefined, '2', c)],
    ['multas', (c) => custos.listarMultas(A.client, DE, ATE, undefined, undefined, '2', c)],
    ['ordens', (c) => custos.ordens(A.client, DE, ATE, undefined, undefined, '2', c)],
    ['movimentos', (c) => custos.movimentos(A.client, DE, ATE, undefined, '2', c)],
    ['viagens', (c) => operacao.listarViagens(A.client, DE, ATE, undefined, undefined, '2', c)],
    ['marcacoes', (c) => operacao.marcacoes(A.client, DE, ATE, undefined, '2', c)],
    ['ranking', (c) => operacao.eventosRanking(A.client, DE, ATE, undefined, '2', c)],
    ['eventos', (c) => telemetria.eventos(A.client, DE, ATE, undefined, undefined, '2', c)],
  ];

  it.each(series)('%s: o cursor percorre tudo, com empate no instante, sem repetir, pular nem trazer o outro cliente', async (nome, pagina) => {
    const vistos: string[] = [];
    let cursor: string | undefined;
    let paginas = 0;
    do {
      const p = await pagina(cursor);
      expect(p.dados.length).toBeLessThanOrEqual(2);
      vistos.push(...p.dados.map((x) => x.id!));
      cursor = p.proximoCursor ?? undefined;
      paginas++;
    } while (cursor && paginas < 10);
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.sort()).toEqual([...esperado[nome]].sort());
    expect(paginas).toBe(Math.ceil(N / 2));
  });

  it('empresa e uso diário só do cliente consultado', async () => {
    expect((await frota.buscarEmpresa(A.client)).razaoSocial).toBe('Empresa aaa');
    expect((await frota.buscarEmpresa(B.client)).razaoSocial).toBe('Empresa bbb');
    const uso = await relatorios.uso(A.client);
    expect([...new Set(uso.dados.map((u) => u.veiculoId))]).toEqual([A.veiculo]);
    expect(uso.dados.reduce((s, u) => s + u.distanciaKm, 0)).toBeGreaterThan(4);
    await expect(relatorios.uso(A.client, '31')).rejects.toThrow();
  });
});
