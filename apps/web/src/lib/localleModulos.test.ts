import { describe, expect, it } from 'vitest';
import {
  abastecimentoToFueling, driverToMotoristaBody, eventToEventoRankingBody, fineToMultaBody, fuelingToAbastecimentoBody, groupIdsByAsset, grupoToGroup,
  marcacaoToMark, markToMarcacaoBody, matrizToMatrix, matrixToMatrizBody, modeloToTemplate, motoristaToDriver, multaToFine, osToWorkOrder, planoToPlan, planToPlanoBody,
  responseToRespostaBody, respostaToResponse, tiposToRankCfg, tripToViagemBody, viagemToTrip, workOrderToOsBody,
} from './localleModulos';

const U = '11111111-1111-4111-8111-111111111111';

describe('motoristas e grupos', () => {
  it('motorista API ↔ driver do store (campos da tela, extras em dados)', () => {
    const d = motoristaToDriver({ id: 'm1', nome: 'Ana', cnh: '04512378901', cnh_categoria: 'E', cnh_validade: '2027-05-01', toxicologico_validade: null, telefone: null, regime: 'cargas', ear: true, desativado_em: null, dados: { cpf: '000' } });
    expect(d).toMatchObject({ id: 'm1', name: 'Ana', cnhCat: 'E', cnhDue: '2027-05-01', toxDue: '', phone: '', ear: true, active: true, cpf: '000' });
    expect(driverToMotoristaBody({ ...d, registration: 'R1' })).toEqual({ nome: 'Ana', cnh: '04512378901', cnhCategoria: 'E', cnhValidade: '2027-05-01', toxicologicoValidade: null, telefone: null, regime: 'cargas', ear: true, dados: { cpf: '000', registration: 'R1' } });
  });
  it('grupo traz os ativos com prefixo lc_; groupIdsByAsset inverte o vínculo', () => {
    const g = grupoToGroup({ id: 'g1', name: 'Pesados', assetIds: [U] });
    expect(g.assetIds).toEqual(['lc_' + U]);
    expect(groupIdsByAsset([g, { id: 'g2', assetIds: ['lc_' + U] }])).toEqual({ ['lc_' + U]: ['g1', 'g2'] });
  });
});

describe('jornada, multas e combustível', () => {
  it('marcação: ts em ms, tipo/origem renomeados; corpo volta em ISO com id de ativo do backend', () => {
    const m = marcacaoToMark({ id: 'j1', motorista_id: 'm1', asset_id: U, ts: '2026-10-20T09:00:00.000Z', tipo: 'inicio_jornada', origem: 'app' });
    expect(m).toEqual({ id: 'j1', driverId: 'm1', assetId: 'lc_' + U, ts: Date.parse('2026-10-20T09:00:00.000Z'), type: 'inicio_jornada', source: 'app' });
    expect(markToMarcacaoBody(m)).toEqual({ motoristaId: 'm1', assetId: U, ts: '2026-10-20T09:00:00.000Z', tipo: 'inicio_jornada', origem: 'app' });
  });
  it('multa: datas-dia viram meio-dia local no store e voltam como YYYY-MM-DD; extras vão para dados', () => {
    const f = multaToFine({ id: 'x', auto: 'R1', orgao: 'DETRAN', asset_id: U, motorista_id: null, ts: '2026-10-01T10:00:00.000Z', local: 'BR', codigo: '746-30', descricao: 'd', gravidade: 'Grave', pontos: 5, valor: '195.23', notificado_em: '2026-10-10', vencimento: '2026-11-10', status: 'aberta', indicado_em: null, origem: 'manual', dados: { operationId: 'op1' } });
    expect(f).toMatchObject({ assetId: 'lc_' + U, driverId: '', points: 5, value: 195.23, notifiedAt: Date.parse('2026-10-10T12:00:00'), operationId: 'op1' });
    const body = fineToMultaBody({ ...f, driverId: 'm1' });
    expect(body).toMatchObject({ auto: 'R1', orgao: 'DETRAN', assetId: U, motoristaId: 'm1', notificadoEm: '2026-10-10', vencimento: '2026-11-10', valor: 195.23, dados: { operationId: 'op1' } });
    expect(fineToMultaBody({ ...f, notifiedAt: undefined }).notificadoEm).toBeNull();
  });
  it('abastecimento: números da API (string) viram number; nota e km do rastreador opcionais', () => {
    const a = abastecimentoToFueling({ id: 'a', asset_id: U, motorista_id: 'm1', ts: '2026-10-10T08:00:00.000Z', odometro: '100000.0', litros: '100.00', total: '605.00', preco_litro: '6.050', combustivel: 'Diesel S10', posto: 'BR', posto_cnpj: null, km_rastreador: null, nf: null, divergencias: [{ tipo: 'km' }] });
    expect(a).toMatchObject({ odometer: 100000, liters: 100, total: 605, pricePerL: 6.05, kmTracker: undefined, nf: undefined, divergencias: [{ tipo: 'km' }] });
    expect(fuelingToAbastecimentoBody({ ...a, nf: { liters: 101, total: 610, date: '2026-10-11', cnpj: '1' } })).toMatchObject({ assetId: U, motoristaId: 'm1', odometro: 100000, nf: { litros: 101, total: 610, data: '2026-10-11', cnpj: '1', chave: null } });
  });
});

describe('manutenção e checklist', () => {
  it('plano e OS: status execucao ↔ em_execucao; extras da OS ficam em dados', () => {
    const p = planoToPlan({ id: 'p', nome: 'Óleo', servico: 'oleo_motor', itens: '', gatilho: 'ambos', km_intervalo: 10000, dias_intervalo: 180, antecedencia_km: 1000, antecedencia_dias: 15, critico_dias: null, critico_km: 500, ativo: true, asset_ids: [U] });
    expect(p.assetIds).toEqual(['lc_' + U]);
    expect(planToPlanoBody({ ...p, critDays: '' })).toMatchObject({ kmIntervalo: 10000, criticoDias: null, criticoKm: 500, assetIds: [U] });
    const w = osToWorkOrder({ id: 'o', numero: '1001', asset_id: U, plano_id: null, tipo: 'corretiva', titulo: 'Embreagem', descricao: null, servicos: ['embreagem'], status: 'em_execucao', nao_planejada: true, aberta_em: '2026-10-20T08:00:00.000Z', entrada_oficina_em: null, liberada_em: null, odometro: null, custo: '0.00', fornecedor: null, dados: { quotes: [{ id: 'q' }], winnerId: 'q' } });
    expect(w).toMatchObject({ num: 1001, status: 'execucao', odometerAt: 0, quotes: [{ id: 'q' }], winnerId: 'q', items: [] });
    expect(workOrderToOsBody(w)).toMatchObject({ assetId: U, status: 'em_execucao', naoPlanejada: true, dados: { quotes: [{ id: 'q' }], winnerId: 'q', items: [], evidences: [], comments: [] } });
  });
  it('modelo/resposta de checklist; só motorista conhecido vira motoristaId', () => {
    expect(modeloToTemplate({ id: 't', nome: 'Diário', ativo: true, agenda: { type: 'diario' }, alvos: { groupIds: [], personIds: [] }, perguntas: [] })).toEqual({ id: 't', name: 'Diário', active: true, schedule: { type: 'diario' }, targets: { groupIds: [], personIds: [] }, questions: [] });
    const r = respostaToResponse({ id: 'r', modelo_id: 't', motorista_id: 'm1', asset_id: U, respondente: null, iniciado_em: '2026-10-20T06:00:00.000Z', finalizado_em: '2026-10-20T06:05:00.000Z', respostas: { q1: { value: 1 } }, nao_conformidades: 2 });
    expect(r).toMatchObject({ templateId: 't', personId: 'm1', assetId: 'lc_' + U, flagged: 2 });
    expect(responseToRespostaBody(r, new Set(['m1']))).toMatchObject({ modeloId: 't', motoristaId: 'm1', respondente: null, assetId: U });
    expect(responseToRespostaBody({ ...r, personId: 'st1' }, new Set(['m1']))).toMatchObject({ motoristaId: null, respondente: 'st1' });
  });
});

describe('ranking e viagens', () => {
  it('matriz efetiva vira rankCfg; evento manual vira corpo da API', () => {
    const cfg = tiposToRankCfg([{ code: 'excesso_velocidade', label: 'x', weight: 4, tiers: [], active: true }, { code: 'porta', label: 'Porta', weight: 2, tiers: [], active: true, custom: true, category: 'empresa' }], 100, 'mes');
    expect(cfg.types.excesso_velocidade).toMatchObject({ weight: 4 });
    expect(cfg.custom).toEqual([{ code: 'porta', label: 'Porta', weight: 2, tiers: [], active: true, category: 'empresa' }]);
    expect(eventToEventoRankingBody({ driverId: 'm1', type: 'ociosidade', value: '25', assetId: 'lc_' + U, ts: 1 })).toEqual({ motoristaId: 'm1', assetId: U, ts: '1970-01-01T00:00:00.001Z', tipo: 'ociosidade', valor: 25, origem: 'manual' });
  });
  it('matriz de viagem e viagem: etapas em ms, cercas vazias viram null no corpo', () => {
    const m = matrizToMatrix({ id: 'm', nome: 'Entregas', asset_id: U, motorista_id: null, dias: [1, 2], paradas: [{ fenceId: 'f', time: '08:00' }], dorme: { 1: 'f' }, ativa: true, created_at: '2026-10-01T00:00:00.000Z' });
    expect(m).toMatchObject({ assetId: 'lc_' + U, driverId: '', days: [1, 2], sleep: { 1: 'f' } });
    expect(matrixToMatrizBody(m)).toMatchObject({ nome: 'Entregas', assetId: U, motoristaId: null, dias: [1, 2], paradas: [{ fenceId: 'f', time: '08:00' }] });
    const t = viagemToTrip({ id: 'v', tipo: 'externo', nome: 'Coleta', asset_id: U, motorista_id: 'm1', matriz_id: null, origem_cerca_id: 'f1', carga_cerca_id: null, descarga_cerca_id: null, destino_cerca_id: 'f1', carga: null, status: 'em_andamento', iniciada_em: '2026-10-20T08:00:00.000Z', carregada_em: null, descarregada_em: null, encerrada_em: null, origem_inicio: 'rastreador', dados: {} });
    expect(t).toMatchObject({ assetId: 'lc_' + U, loadFenceId: '', startedAt: Date.parse('2026-10-20T08:00:00.000Z'), loadedAt: undefined, startSource: 'rastreador', stops: [] });
    expect(tripToViagemBody(t)).toMatchObject({ tipo: 'externo', assetId: U, motoristaId: 'm1', origemCercaId: 'f1', cargaCercaId: null, destinoCercaId: 'f1', carga: null });
  });
});
