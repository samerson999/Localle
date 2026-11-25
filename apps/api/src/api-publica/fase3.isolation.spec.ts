import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChecklistRepository } from '../checklist/checklist.repository';
import { AbastecimentosRepository } from '../combustivel/abastecimentos.repository';
import { CombustivelService } from '../combustivel/combustivel.service';
import { ManutencaoRepository } from '../manutencao/manutencao.repository';
import { ManutencaoService } from '../manutencao/manutencao.service';
import { MultasRepository } from '../multas/multas.repository';
import { MultasService } from '../multas/multas.service';
import { PneusRepository } from '../pneus/pneus.repository';
import { PneusService } from '../pneus/pneus.service';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { CustosController } from './custos/custos.controller';

/**
 * Fase 3 da API pública (docs/PLANO-API-PUBLICA.md § 4.1): combustível, multas, manutenção, checklist e pneus só com
 * dado do cliente consultado. Contra o Postgres local.
 */
describe('API pública — fase 3 (isolamento e contrato)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const abast = new AbastecimentosRepository(pool);
  const multas = new MultasRepository(pool);
  const manut = new ManutencaoRepository(pool);
  const pneus = new PneusRepository(pool);
  const custos = new CustosController(
    abast, new CombustivelService(abast, settings), multas, new MultasService(multas, settings), manut, new ManutencaoService(manut, settings),
    new ChecklistRepository(pool), pneus, new PneusService(pneus, settings),
  );

  const agora = Date.now();
  const DE = new Date(agora - 10 * 86_400_000).toISOString();
  const ATE = new Date(agora + 86_400_000).toISOString();
  const ontem = new Date(agora - 86_400_000).toISOString();
  const periodo = [DE, ATE] as const;
  interface Dados { client: string; veiculo: string; motorista: string; abastecimento: string; multa: string; plano: string; os: string; modelo: string; checklist: string; pneu: string; movimento: string }
  const A = {} as Dados;
  const B = {} as Dados;

  const id = async (sql: string, params: unknown[]) => (await pool.query<{ id: string }>(sql + ' returning id', params)).rows[0].id;

  async function semear(d: Dados, nome: string) {
    d.client = await id('insert into clients (name) values ($1)', [`${nome}-${randomUUID()}`]);
    d.veiculo = await id('insert into assets (client_id, plate) values ($1, $2)', [d.client, nome.toUpperCase().slice(0, 3) + '3C45']);
    d.motorista = await id('insert into motoristas (client_id, nome) values ($1, $2)', [d.client, `Mot ${nome}`]);
    d.abastecimento = await id(
      "insert into abastecimentos (client_id, asset_id, motorista_id, ts, odometro, litros, total, combustivel, nf) values ($1, $2, $3, $4, 10000, 100, 600, 'Diesel S10', $5)",
      [d.client, d.veiculo, d.motorista, ontem, JSON.stringify({ litros: 80, total: 600, chave: 'NF123' })],
    );
    d.multa = await id(
      "insert into multas (client_id, auto, orgao, asset_id, motorista_id, ts, local, codigo, descricao, gravidade, pontos, valor, vencimento, status) values ($1, 'A1', 'DETRAN', $2, $3, $4, 'BR-101', '7455', 'Excesso', 'Grave', 5, 195.23, '2027-01-01', 'aberta')",
      [d.client, d.veiculo, d.motorista, ontem],
    );
    d.plano = await id("insert into manutencao_planos (client_id, nome, servico, gatilho, km_intervalo) values ($1, $2, 'Óleo', 'km', 10000)", [d.client, `Plano ${nome}`]);
    await pool.query('insert into manutencao_plano_ativos (client_id, plano_id, asset_id) values ($1, $2, $3)', [d.client, d.plano, d.veiculo]);
    d.os = await id("insert into ordens_servico (client_id, asset_id, tipo, titulo, aberta_em) values ($1, $2, 'corretiva', 'Freio', $3)", [d.client, d.veiculo, ontem]);
    d.modelo = await id(
      "insert into checklist_modelos (client_id, nome, agenda, perguntas) values ($1, $2, '{\"type\":\"diario\"}', $3)",
      [d.client, `Saída ${nome}`, JSON.stringify([{ id: 'p1', label: 'Pneus ok?', type: 'sim_nao', required: true }])],
    );
    d.checklist = await id(
      'insert into checklist_respostas (client_id, modelo_id, asset_id, iniciado_em, finalizado_em, respostas) values ($1, $2, $3, $4, $4, $5)',
      [d.client, d.modelo, d.veiculo, ontem, JSON.stringify({ p1: { value: 'nao', photo: 'data:image/png;base64,AAAA' } })],
    );
    d.pneu = await id("insert into pneus (client_id, numero_fogo, sulco_inicial_mm, sulco_atual_mm) values ($1, $2, 16, 2)", [d.client, `F-${nome}`]);
    d.movimento = await id("insert into pneu_movimentos (client_id, pneu_id, tipo, ts) values ($1, $2, 'medicao', $3)", [d.client, d.pneu, ontem]);
  }

  beforeAll(async () => {
    await semear(A, 'aaa');
    await semear(B, 'bbb');
  });

  afterAll(async () => {
    await pool.query('delete from clients where id = any($1)', [[A.client, B.client]]);
    await pool.end();
  });

  const ids = (p: { dados: { id?: string }[] }) => p.dados.map((x) => x.id);

  it('combustível: só do cliente, com a divergência da nota apontada', async () => {
    const p = await custos.listarAbastecimentos(A.client, ...periodo);
    expect(ids(p)).toEqual([A.abastecimento]);
    expect(p.dados[0]).toMatchObject({ litros: 100, chaveNotaFiscal: 'NF123' });
    expect(p.dados[0].divergencias.map((d) => d.tipo)).toContain('litros');
    expect((await custos.listarAbastecimentos(A.client, ...periodo, B.veiculo)).dados).toEqual([]);
  });

  it('multas, indicações e pontuação de CNH só do cliente', async () => {
    expect(ids(await custos.listarMultas(A.client, ...periodo))).toEqual([A.multa]);
    expect((await custos.listarMultas(A.client, ...periodo)).dados[0].valor).toBe(195.23);
    await expect(custos.buscarMulta(A.client, B.multa)).rejects.toThrow(NotFoundException);
    expect((await custos.indicacoes(A.client)).dados.map((i) => i.multaId)).toEqual([A.multa]);
    expect((await custos.pontuacaoCnh(A.client)).dados.map((r) => r.motoristaId)).toEqual([A.motorista]);
  });

  it('manutenção: planos, situação e ordens só do cliente', async () => {
    expect(ids(await custos.planos(A.client))).toEqual([A.plano]);
    expect((await custos.situacao(A.client)).dados.map((s) => s.veiculoId)).toEqual([A.veiculo]);
    expect(ids(await custos.ordens(A.client, ...periodo))).toEqual([A.os]);
    await expect(custos.buscarOrdem(A.client, B.os)).rejects.toThrow(NotFoundException);
  });

  it('checklist: modelos e respostas só do cliente; a foto não sai', async () => {
    expect(ids(await custos.modelos(A.client))).toEqual([A.modelo]);
    const r = await custos.listarChecklists(A.client, ...periodo);
    expect(ids(r)).toEqual([A.checklist]);
    expect(r.dados[0].respostas).toEqual([{ perguntaId: 'p1', valor: 'nao', temFoto: true }]);
    expect(JSON.stringify(r)).not.toContain('base64');
    await expect(custos.buscarChecklist(A.client, B.checklist)).rejects.toThrow(NotFoundException);
  });

  it('pneus e movimentos só do cliente, com o nível do sulco', async () => {
    const p = await custos.listarPneus(A.client);
    expect(ids(p)).toEqual([A.pneu]);
    expect(p.dados[0].nivelSulco).not.toBe('ok');
    await expect(custos.buscarPneu(A.client, B.pneu)).rejects.toThrow(NotFoundException);
    await expect(custos.movimentosDoPneu(A.client, B.pneu, ...periodo)).rejects.toThrow(NotFoundException);
    expect(ids(await custos.movimentos(A.client, ...periodo))).toEqual([A.movimento]);
    expect(ids(await custos.movimentosDoPneu(A.client, A.pneu, ...periodo))).toEqual([A.movimento]);
  });
});
