import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlertasRepository } from '../alertas/alertas.repository';
import { AssetsRepository } from '../assets/assets.repository';
import { CercasRepository } from '../cercas/cercas.repository';
import { ComandosRepository } from '../comandos/comandos.repository';
import { EmpresaRepository } from '../empresa/empresa.repository';
import { GruposRepository } from '../grupos/grupos.repository';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { MotoristaVinculosRepository } from '../motoristas/motorista-vinculos.repository';
import { MotoristasRepository } from '../motoristas/motoristas.repository';
import { OperacoesRepository } from '../operacoes/operacoes.repository';
import { RastreadorVinculosRepository } from '../rastreadores/rastreador-vinculos.repository';
import { RegrasRepository } from '../regras/regras.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { CercasPublicoController } from './cercas/cercas.controller';
import { FrotaController } from './frota/frota.controller';
import { MotoristasPublicoController } from './motoristas/motoristas.controller';
import { OcorrenciasController } from './ocorrencias/ocorrencias.controller';
import { TelemetriaController } from './telemetria/telemetria.controller';

/**
 * Fase 1 da API pública (docs/PLANO-API-PUBLICA.md § 4.1): cada rota de frota, cercas, telemetria, alertas e comandos
 * só devolve dado do cliente consultado, e o dono vê o próprio. Contra o Postgres local. O cliente chega às controllers
 * já resolvido pelo `ApiChaveGuard` (testado em api-publica.isolation.spec.ts).
 */
describe('API pública — fase 1 (isolamento e contrato)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const assets = new AssetsRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const frota = new FrotaController(new EmpresaRepository(pool), new GruposRepository(pool), new OperacoesRepository(pool), new RastreadorVinculosRepository(pool), assets);
  const motoristas = new MotoristasPublicoController(new MotoristasRepository(pool), new MotoristaVinculosRepository(pool), settings);
  const cercas = new CercasPublicoController(new CercasRepository(pool), new RegrasRepository(pool));
  const telemetria = new TelemetriaController(new MonitoringRepository(pool), settings, assets);
  const ocorrencias = new OcorrenciasController(new AlertasRepository(pool), new ComandosRepository(pool));

  const DE = '2026-01-01T00:00:00Z';
  const ATE = '2026-01-05T00:00:00Z';
  interface Dados { client: string; veiculo: string; rastreador: string; grupo: string; operacao: string; motorista: string; cerca: string; regra: string; alerta: string; comando: string; vinculo: string }
  const A = {} as Dados;
  const B = {} as Dados;
  const rastreadores: string[] = [];

  async function semear(d: Dados, nome: string) {
    d.client = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`${nome}-${randomUUID()}`])).rows[0].id;
    const user = (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id", [d.client, `f1-${randomUUID()}@teste.local`])).rows[0].id;
    d.veiculo = (await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [d.client, nome.toUpperCase().slice(0, 3) + '1A23'])).rows[0].id;
    d.rastreador = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)])).rows[0].id;
    rastreadores.push(d.rastreador);
    await pool.query('insert into rastreador_vinculos (rastreador_id, client_id) values ($1, $2)', [d.rastreador, d.client]);
    await pool.query("insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2025-12-01T00:00:00Z', 'teste')", [d.client, d.rastreador, d.veiculo]);
    await pool.query(
      `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
       select $1, n, $2, $3, $4::timestamptz + n * interval '1 minute', $4::timestamptz + n * interval '1 minute', true,
              st_setsrid(st_makepoint(-34.88, -8.05), 4326), 30 from generate_series(1, 5) n`,
      [d.rastreador, d.client, d.veiculo, '2026-01-02T10:00:00Z'],
    );
    await pool.query("insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts) values ($1, $2, $3, 'aparelho', 'ignitionOn', '2026-01-02T10:00:00Z')", [d.rastreador, d.client, d.veiculo]);
    d.grupo = (await new GruposRepository(pool).criar(d.client, `G ${nome}`)).id;
    await pool.query('insert into asset_group_members (client_id, group_id, asset_id) values ($1, $2, $3)', [d.client, d.grupo, d.veiculo]);
    d.operacao = (await new OperacoesRepository(pool).criar(d.client, { nome: `Op ${nome}`, metaKml: 3.5 })).id;
    d.motorista = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome, cnh_validade, codigo_identificacao) values ($1, $2, '2026-01-01', 'ABC123') returning id", [d.client, `Mot ${nome}`])).rows[0].id;
    d.vinculo = (await pool.query<{ id: string }>("insert into motorista_vinculos (client_id, asset_id, motorista_id, origem, inicio, fim) values ($1, $2, $3, 'app', '2026-01-02T08:00:00Z', '2026-01-02T18:00:00Z') returning id", [d.client, d.veiculo, d.motorista])).rows[0].id;
    d.cerca = (await new CercasRepository(pool).criar(d.client, {
      nome: `Base ${nome}`, tipo: 'Base', forma: 'poligono', centro: null, raioM: null, pontos: [[-8.05, -34.88], [-8.06, -34.88], [-8.06, -34.89]],
      alertaEntrada: true, alertaSaida: false, prioridadeAlerta: null, iniciaViagem: false, encerraViagem: false, velocidadeLimiteKmh: null, permanenciaMaxMin: null,
    })).id;
    d.regra = (await new RegrasRepository(pool).criar(d.client, {
      nome: `Vel ${nome}`, ativa: true, prioridade: 'alta', condicoes: [{ field: 'velocidade', op: '>', value: '90' }],
      acoes: { painel: true, email: false, whatsapp: false, motorista: false, bloqueio: false, ranking: false, tratamento: true },
    })).id;
    d.alerta = (await pool.query<{ id: string }>("insert into alertas (client_id, asset_id, origem, tipo, titulo, prioridade, ts) values ($1, $2, 'regra', 'regra', 'Velocidade', 'alta', '2026-01-02T10:00:00Z') returning id", [d.client, d.veiculo])).rows[0].id;
    d.comando = (await pool.query<{ id: string }>("insert into comandos (client_id, asset_id, rastreador_id, tipo, solicitado_por, solicitado_em, expira_em) values ($1, $2, $3, 'engineStop', $4, '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z') returning id", [d.client, d.veiculo, d.rastreador, user])).rows[0].id;
  }

  beforeAll(async () => {
    await semear(A, 'aaa');
    await semear(B, 'bbb');
  });

  afterAll(async () => {
    await pool.query('delete from comandos where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from posicoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from eventos where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from instalacoes where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from rastreador_vinculos where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from clients where id = any($1)', [[A.client, B.client]]);
    await pool.query('delete from rastreadores where id = any($1)', [rastreadores]);
    await pool.end();
  });

  const ids = (p: { dados: { id?: string }[] }) => p.dados.map((x) => x.id);
  const periodo = [DE, ATE] as const;

  it('frota: grupos, operações e rastreadores só do cliente consultado', async () => {
    expect(ids(await frota.listarGrupos(A.client))).toEqual([A.grupo]);
    expect((await frota.listarGrupos(A.client)).dados[0].veiculoIds).toEqual([A.veiculo]);
    expect(ids(await frota.listarOperacoes(A.client))).toEqual([A.operacao]);
    expect(ids(await frota.listarRastreadores(A.client))).toEqual([A.rastreador]);
    expect(ids(await frota.rastreadoresDoVeiculo(A.client, A.veiculo))).toEqual([A.rastreador]);
    await expect(frota.buscarGrupo(A.client, B.grupo)).rejects.toThrow(NotFoundException);
    await expect(frota.rastreadoresDoVeiculo(A.client, B.veiculo)).rejects.toThrow(NotFoundException);
    expect((await frota.buscarGrupo(B.client, B.grupo)).nome).toBe('G bbb');
  });

  it('motoristas: lista, vencimentos e vínculos só do cliente; o código do cartão não sai', async () => {
    const lista = await motoristas.listar(A.client);
    expect(ids(lista)).toEqual([A.motorista]);
    expect(lista.dados[0]).toMatchObject({ temCartao: true });
    expect(JSON.stringify(lista)).not.toContain('ABC123');
    expect((await motoristas.vencimentos(A.client)).dados.map((v) => v.motoristaId)).toEqual([A.motorista]);
    expect(ids(await motoristas.listarVinculos(A.client, ...periodo))).toEqual([A.vinculo]);
    await expect(motoristas.buscar(A.client, B.motorista)).rejects.toThrow(NotFoundException);
    // vínculo de B filtrado pelo motorista de B, consultando como A: vazio
    expect((await motoristas.listarVinculos(A.client, ...periodo, undefined, B.motorista)).dados).toEqual([]);
  });

  it('cercas em GeoJSON (polígono fechado, [lon, lat]) e regras, só do cliente', async () => {
    const c = await cercas.listar(A.client);
    expect(ids(c)).toEqual([A.cerca]);
    const anel = (c.dados[0].geometry.coordinates as number[][][])[0];
    expect(anel[0]).toEqual([-34.88, -8.05]);
    expect(anel[anel.length - 1]).toEqual(anel[0]);
    await expect(cercas.buscar(A.client, B.cerca)).rejects.toThrow(NotFoundException);
    expect(ids(await cercas.listarRegras(A.client))).toEqual([A.regra]);
  });

  it('telemetria: últimas posições, histórico e eventos só do cliente', async () => {
    const ult = await telemetria.ultimas(A.client);
    expect(ult.dados.map((p) => p.veiculoId)).toEqual([A.veiculo]);
    const hist = await telemetria.historico(A.client, A.veiculo, ...periodo);
    expect(hist.dados).toHaveLength(5);
    await expect(telemetria.historico(A.client, B.veiculo, ...periodo)).rejects.toThrow(NotFoundException);
    const ev = await telemetria.eventos(A.client, ...periodo);
    expect(ev.dados.map((e) => e.veiculoId)).toEqual([A.veiculo]);
    expect((await telemetria.eventos(A.client, ...periodo, B.veiculo)).dados).toEqual([]);
  });

  it('histórico de posições pagina por cursor sem repetir nem pular', async () => {
    const p1 = await telemetria.historico(A.client, A.veiculo, ...periodo, '2');
    const p2 = await telemetria.historico(A.client, A.veiculo, ...periodo, '2', p1.proximoCursor!);
    const p3 = await telemetria.historico(A.client, A.veiculo, ...periodo, '2', p2.proximoCursor!);
    const todas = [...p1.dados, ...p2.dados, ...p3.dados].map((p) => p.dataHora);
    expect(todas).toHaveLength(5);
    expect(new Set(todas).size).toBe(5);
    expect(p3.proximoCursor).toBeNull();
  });

  it('alertas e comandos só do cliente', async () => {
    expect(ids(await ocorrencias.listar(A.client, ...periodo))).toEqual([A.alerta]);
    await expect(ocorrencias.buscar(A.client, B.alerta)).rejects.toThrow(NotFoundException);
    expect((await ocorrencias.buscar(B.client, B.alerta)).id).toBe(B.alerta);
    expect(ids(await ocorrencias.listarComandos(A.client, ...periodo))).toEqual([A.comando]);
  });

  it('alertas no mesmo milissegundo (microssegundos diferentes) não são pulados entre páginas', async () => {
    const c = A.client;
    const extras = [];
    for (const us of ['123100', '123200', '123300']) {
      extras.push((await pool.query<{ id: string }>(`insert into alertas (client_id, origem, tipo, titulo, prioridade, ts) values ($1, 'regra', 'regra', 'x', 'baixa', '2026-01-03T10:00:00.${us}Z') returning id`, [c])).rows[0].id);
    }
    const vistos: string[] = [];
    let cursor: string | undefined;
    do {
      const p = await ocorrencias.listar(c, ...periodo, undefined, undefined, '1', cursor);
      vistos.push(...p.dados.map((a) => a.id));
      cursor = p.proximoCursor ?? undefined;
    } while (cursor);
    expect(vistos).toHaveLength(4);
    expect(vistos).toEqual(expect.arrayContaining([...extras, A.alerta]));
  });

  it('período obrigatório, limitado e cursor adulterado: 400', async () => {
    await expect(telemetria.eventos(A.client)).rejects.toThrow(BadRequestException);
    await expect(telemetria.eventos(A.client, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')).rejects.toThrow(/31 dias/);
    await expect(telemetria.historico(A.client, A.veiculo, '2026-01-01T00:00:00Z', '2026-01-09T00:00:00Z')).rejects.toThrow(/7 dias/);
    const adulterado = Buffer.from(JSON.stringify({ k: 'não é data', id: randomUUID() })).toString('base64url');
    await expect(ocorrencias.listar(A.client, ...periodo, undefined, undefined, undefined, adulterado)).rejects.toThrow(BadRequestException);
    await expect(telemetria.eventos(A.client, ...periodo, 'não-é-uuid')).rejects.toThrow(BadRequestException);
  });
});
