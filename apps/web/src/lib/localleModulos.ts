import { apelidoDe, assetIdFor, backendIdOf, nomeDoAtivo } from './localleMap';
import { CATALOGO_VAZIO, marcaModeloDoAtivo, type CatalogoAtivos } from './catalogoAtivos';

// Mapeadores puros API ↔ formato do store para os módulos que saíram do navegador (motoristas, grupos,
// jornada, multas, combustível, manutenção, checklist, ranking, viagens). Sem rede, sem store — testados em
// localleModulos.test.ts. Ids de ativo: API `uuid` ↔ store `lc_<uuid>` (como em localleMap.ts); os demais
// ids são os do backend, sem prefixo. Datas: API ISO/`YYYY-MM-DD` ↔ store epoch ms / `YYYY-MM-DD`.

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : undefined);
const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
const asset = (id: string | null | undefined) => (id ? assetIdFor(id) : '');
const assetBody = (id: string | null | undefined) => (id ? backendIdOf(id) : null);
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const dia = (d: string | null | undefined) => (d ? Date.parse(d + 'T12:00:00') : undefined);
const diaBody = (t: number | string | null | undefined) => (t === null || t === undefined || t === '' ? null : typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date(t).toISOString().slice(0, 10));

// ---------- motoristas ----------
export function motoristaToDriver(m: any) {
  return {
    id: m.id, name: m.nome, cnh: m.cnh || '', cnhCat: m.cnh_categoria || '', cnhDue: m.cnh_validade || '', toxDue: m.toxicologico_validade || '',
    phone: m.telefone || '', regime: m.regime, ear: !!m.ear, active: !m.desativado_em, cpf: m.dados?.cpf || '', registration: m.dados?.registration || '',
    idCode: m.codigo_identificacao || '',
  };
}
export function driverToMotoristaBody(d: any) {
  return {
    nome: String(d.name || '').trim(), cnh: d.cnh || null, cnhCategoria: d.cnhCat || null, cnhValidade: d.cnhDue || null, toxicologicoValidade: d.toxDue || null,
    telefone: d.phone || null, regime: d.regime || 'cargas', ear: !!d.ear, codigoIdentificacao: String(d.idCode || '').trim() || null,
    dados: { ...(d.cpf ? { cpf: d.cpf } : {}), ...(d.registration ? { registration: d.registration } : {}) },
  };
}

/**
 * Vínculo motorista × veículo da API (`GET /motoristas/vinculos`) no formato de `s.driverLinks` (lib/driverLinks.ts).
 * `driverId` vazio = cartão lido pelo rastreador que ainda não está cadastrado; `code` guarda o código para a tela mostrar.
 */
export function vinculoToLink(v: any) {
  return {
    id: v.id, assetId: asset(v.asset_id), driverId: v.motorista_id || '', start: Date.parse(v.inicio), end: v.fim ? Date.parse(v.fim) : null,
    source: v.origem, code: v.codigo || '', endedBy: v.encerrado_por || null,
  };
}
/** Os vínculos do rastreador vêm só da API; os de escala/app continuam os do navegador até terem API. */
export function mesclarVinculos(locais: any[] | undefined, daApi: any[]) {
  return [...(locais || []).filter((l) => l.source !== 'rastreador'), ...daApi.map(vinculoToLink)];
}
/**
 * Vínculo do cartão aberto ou encerrado pela ingestão (tempo real, kind `motorista`) aplicado ao histórico do store.
 * `abriu` com um id já conhecido é o cartão cadastrado com o vínculo aberto: troca só o motorista. `encerrou` de um
 * vínculo que a tela não carregou não tem o que fechar.
 */
export function aplicarVinculoTempoReal(links: any[], m: { acao: 'abriu' | 'encerrou'; vinculoId: string; assetId: string; motoristaId: string | null; codigo: string; ts: string; encerradoPor?: string }) {
  const atual = links.find((l) => l.id === m.vinculoId);
  if (m.acao === 'encerrou') return atual ? links.map((l) => (l.id === m.vinculoId ? { ...l, end: Date.parse(m.ts), endedBy: m.encerradoPor || null } : l)) : links;
  const link = { ...(atual || { id: m.vinculoId, assetId: asset(m.assetId), start: Date.parse(m.ts), end: null, source: 'rastreador', endedBy: null }), driverId: m.motoristaId || '', code: m.codigo };
  return atual ? links.map((l) => (l.id === m.vinculoId ? link : l)) : [...links, link];
}

// ---------- grupos de ativos ----------
export function grupoToGroup(g: any) {
  return { id: g.id, name: g.name, assetIds: (g.assetIds || []).map(assetIdFor) };
}
/** `groupIds` dos ativos reais a partir dos grupos (o backend guarda o vínculo no grupo, a tela no ativo). */
export function groupIdsByAsset(groups: { id: string; assetIds: string[] }[]) {
  const out: Record<string, string[]> = {};
  for (const g of groups) for (const a of g.assetIds) (out[a] ||= []).push(g.id);
  return out;
}

// ---------- jornada ----------
export function marcacaoToMark(m: any) {
  return { id: m.id, driverId: m.motorista_id, assetId: asset(m.asset_id), ts: Date.parse(m.ts), type: m.tipo, source: m.origem };
}
export function markToMarcacaoBody(m: any) {
  return { motoristaId: m.driverId, assetId: assetBody(m.assetId), ts: new Date(m.ts).toISOString(), tipo: m.type, origem: m.source || 'manual' };
}

// ---------- multas ----------
export function multaToFine(m: any) {
  return {
    id: m.id, auto: m.auto, org: m.orgao, assetId: asset(m.asset_id), driverId: m.motorista_id || '', ts: Date.parse(m.ts), place: m.local,
    code: m.codigo, description: m.descricao, severity: m.gravidade, points: Number(m.pontos), value: Number(m.valor),
    notifiedAt: dia(m.notificado_em), dueDate: dia(m.vencimento), status: m.status, indicatedAt: ms(m.indicado_em), source: m.origem, ...(m.dados || {}),
  };
}
export function fineToMultaBody(f: any) {
  const { id: _id, assetId, driverId, org, ts, place, code, description, severity, points, value, notifiedAt, dueDate, status, auto, source: _s, indicatedAt: _i, estimatedNotice: _e, ...resto } = f;
  const dados: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(resto)) if (typeof v === 'string' || typeof v === 'number') dados[k] = v;
  return {
    auto: String(auto || '').trim().toUpperCase(), orgao: org || '', assetId: assetBody(assetId), motoristaId: driverId || null,
    ts: new Date(ts).toISOString(), local: place, codigo: code, descricao: description, gravidade: severity, pontos: Number(points), valor: Number(value),
    notificadoEm: diaBody(notifiedAt), vencimento: diaBody(dueDate), status: status || 'aberta', dados,
  };
}

// ---------- combustível ----------
export function abastecimentoToFueling(a: any) {
  return {
    id: a.id, assetId: asset(a.asset_id), driverId: a.motorista_id || '', ts: Date.parse(a.ts), odometer: Number(a.odometro), liters: Number(a.litros), total: Number(a.total),
    pricePerL: a.preco_litro === null ? undefined : Number(a.preco_litro), fuel: a.combustivel, station: a.posto || '', stationCnpj: a.posto_cnpj || '',
    kmTracker: a.km_rastreador === null ? undefined : Number(a.km_rastreador), nf: a.nf || undefined, photos: [], divergencias: a.divergencias || [],
  };
}
export function fuelingToAbastecimentoBody(f: any) {
  const nf = f.nf ? { litros: num(f.nf.liters), total: num(f.nf.total), data: f.nf.date ? diaBody(f.nf.date) : null, cnpj: f.nf.cnpj || null, chave: f.nf.chave || f.nf.key || null } : null;
  return {
    assetId: assetBody(f.assetId), motoristaId: f.driverId || null, ts: new Date(f.ts).toISOString(), odometro: Number(f.odometer), litros: Number(f.liters), total: Number(f.total),
    precoLitro: num(f.pricePerL), combustivel: f.fuel || 'Diesel S10', posto: f.station || null, postoCnpj: f.stationCnpj || null, kmRastreador: num(f.kmTracker), nf,
  };
}

// ---------- manutenção ----------
export function planoToPlan(p: any) {
  return {
    id: p.id, name: p.nome, service: p.servico, items: p.itens, trigger: p.gatilho, kmInterval: p.km_intervalo, daysInterval: p.dias_intervalo,
    advanceKm: p.antecedencia_km, advanceDays: p.antecedencia_dias, critDays: p.critico_dias, critKm: p.critico_km, active: p.ativo, assetIds: (p.asset_ids || []).map(assetIdFor),
  };
}
export function planToPlanoBody(p: any) {
  const n = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
  return {
    nome: p.name, servico: p.service, itens: p.items || '', gatilho: p.trigger, kmIntervalo: n(p.kmInterval) ?? 0, diasIntervalo: n(p.daysInterval) ?? 0,
    antecedenciaKm: n(p.advanceKm) ?? 0, antecedenciaDias: n(p.advanceDays) ?? 0, criticoDias: n(p.critDays), criticoKm: n(p.critKm), ativo: p.active !== false,
    assetIds: (p.assetIds || []).map(backendIdOf),
  };
}
const OS_STATUS_API: Record<string, string> = { execucao: 'em_execucao' };
const OS_STATUS_FRONT: Record<string, string> = { em_execucao: 'execucao' };
export function osToWorkOrder(o: any) {
  const d = o.dados || {};
  return {
    id: o.id, num: Number(o.numero), type: o.tipo, assetId: asset(o.asset_id), planId: o.plano_id || undefined, title: o.titulo, description: o.descricao || '',
    services: o.servicos || [], status: OS_STATUS_FRONT[o.status] || o.status, unplanned: !!o.nao_planejada, openedAt: Date.parse(o.aberta_em),
    shopInAt: ms(o.entrada_oficina_em), releasedAt: ms(o.liberada_em), odometerAt: o.odometro === null ? 0 : Number(o.odometro), cost: Number(o.custo), supplier: o.fornecedor || '',
    quotes: [], evidences: [], comments: [], items: [], nf: { chave: '', numero: '', valor: 0, erp: 'nenhum' }, ...d,
  };
}
export function workOrderToOsBody(w: any) {
  const { id: _id, num: _n, type, assetId, planId, title, description, services, status, unplanned, openedAt, shopInAt, releasedAt, odometerAt, cost, supplier, ...dados } = w;
  return {
    assetId: assetBody(assetId), planoId: planId || null, tipo: type, titulo: title || '(sem título)', descricao: description || null, servicos: services || [],
    status: OS_STATUS_API[status] || status || 'aberta', naoPlanejada: !!unplanned, abertaEm: iso(openedAt) || new Date().toISOString(),
    entradaOficinaEm: iso(shopInAt), liberadaEm: iso(releasedAt), odometro: num(odometerAt), custo: Number(cost) || 0, fornecedor: supplier || null, dados,
  };
}

// ---------- checklist ----------
export function modeloToTemplate(m: any) {
  return { id: m.id, name: m.nome, active: m.ativo, schedule: m.agenda, targets: m.alvos, questions: m.perguntas };
}
export function templateToModeloBody(t: any) {
  return { nome: t.name, ativo: t.active !== false, agenda: t.schedule, alvos: t.targets || { groupIds: [], personIds: t.driverIds || [] }, perguntas: t.questions || [] };
}
export function respostaToResponse(r: any) {
  const personId = r.motorista_id || r.respondente || '';
  return { id: r.id, templateId: r.modelo_id, driverId: r.motorista_id || '', personId, assetId: asset(r.asset_id), startedAt: Date.parse(r.iniciado_em), finishedAt: Date.parse(r.finalizado_em), answers: r.respostas, flagged: r.nao_conformidades };
}
/** `personId` é motorista (uuid) ou outra pessoa (texto livre): só motorista vira `motoristaId`. */
export function responseToRespostaBody(r: any, motoristaIds: Set<string>) {
  const motorista = r.personId && motoristaIds.has(r.personId) ? r.personId : null;
  return { modeloId: r.templateId, motoristaId: motorista, assetId: assetBody(r.assetId), respondente: motorista ? null : r.personId || null, iniciadoEm: new Date(r.startedAt).toISOString(), finalizadoEm: new Date(r.finishedAt || Date.now()).toISOString(), respostas: r.answers };
}

// ---------- ranking ----------
export function eventoRankingToEvent(e: any) {
  return { id: e.id, ts: Date.parse(e.ts), assetId: asset(e.asset_id), driverId: e.motorista_id, type: e.tipo, value: e.valor === null ? null : Number(e.valor), source: e.origem, pos: undefined };
}
export function eventToEventoRankingBody(e: any) {
  return { motoristaId: e.driverId, assetId: assetBody(e.assetId), ts: new Date(e.ts || Date.now()).toISOString(), tipo: e.type, valor: num(e.value), origem: e.source || 'manual' };
}
/** Matriz efetiva da API → `rankCfg` que `localTypes` (packages/shared) já sabe mesclar com o catálogo. */
export function tiposToRankCfg(tipos: any[], limit: number, limitPeriod: string) {
  return {
    limit, limitPeriod,
    types: Object.fromEntries(tipos.filter((t) => !t.custom).map((t) => [t.code, { weight: t.weight, tiers: t.tiers, active: t.active, label: t.label }])),
    custom: tipos.filter((t) => t.custom).map((t) => ({ code: t.code, label: t.label, weight: t.weight, tiers: t.tiers, active: t.active, category: t.category || 'empresa' })),
  };
}
export function tipoToMatrizBody(t: any) {
  return { label: t.label, categoria: t.category || null, peso: t.weight, faixas: t.tiers || [], ativo: t.active !== false, custom: !!t.custom };
}

// ---------- viagens ----------
export function matrizToMatrix(m: any) {
  return { id: m.id, name: m.nome, assetId: asset(m.asset_id), driverId: m.motorista_id || '', days: m.dias, stops: m.paradas, sleep: m.dorme || {}, active: m.ativa, createdAt: ms(m.created_at) || Date.now() };
}
export function matrixToMatrizBody(m: any) {
  return { nome: m.name, assetId: assetBody(m.assetId), motoristaId: m.driverId || null, dias: m.days, paradas: (m.stops || []).map((s: any) => ({ fenceId: s.fenceId, time: s.time })), dorme: m.sleep || {}, ativa: m.active !== false };
}
export function viagemToTrip(v: any) {
  const d = v.dados || {};
  return {
    id: v.id, type: v.tipo, name: v.nome || '', assetId: asset(v.asset_id), driverId: v.motorista_id || '', matrixId: v.matriz_id || undefined,
    originFenceId: v.origem_cerca_id || '', loadFenceId: v.carga_cerca_id || '', unloadFenceId: v.descarga_cerca_id || '', destFenceId: v.destino_cerca_id || '', cargo: v.carga || '',
    status: v.status, startedAt: ms(v.iniciada_em), loadedAt: ms(v.carregada_em), unloadedAt: ms(v.descarregada_em), endedAt: ms(v.encerrada_em), startSource: v.origem_inicio || undefined,
    stops: [], visited: [], ...d,
  };
}
export function tripToViagemBody(t: any) {
  return {
    tipo: t.type || 'externo', nome: t.name || null, assetId: assetBody(t.assetId), motoristaId: t.driverId || null, matrizId: t.matrixId || null,
    origemCercaId: t.originFenceId || null, cargaCercaId: t.loadFenceId || null, descargaCercaId: t.unloadFenceId || null, destinoCercaId: t.destFenceId || null, carga: t.cargo || null,
  };
}

// ---------- ficha do ativo (assets.dados) ----------
// O que do cadastro do ativo vai para a API. Fica de fora: id/placa/ícone/motorista (colunas próprias), grupos
// (vínculo no grupo), operação (`operacao_id`), rastreador (instalação), foto e arquivo dos documentos (sem
// armazenamento de arquivo na API ainda: continuam no navegador).
export const FICHA_CAMPOS = ['kind', 'category', 'tipo', 'name', 'brand', 'model', 'year', 'serial', 'chassi', 'renavam', 'uf', 'specs', 'customFields', 'meter', 'kmSource', 'kmOffset', 'initialKm',
  'fuelGoal', 'fuelBudget', 'journeySource', 'trailerType', 'tireLayout', 'can', 'active', 'lifecycle', 'documents', 'odometerCheckDone', 'installation', 'kmCalculated'] as const;

export function fichaDoAtivo(a: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FICHA_CAMPOS) if (a[k] !== undefined) out[k] = a[k];
  // `name` na ficha guarda o apelido digitado (é o que ativoDaApi lê de volta), não o nome de exibição com a placa
  if (a.apelido !== undefined) out.name = a.apelido;
  if (Array.isArray(a.documents)) out.documents = a.documents.map(({ file: _f, ...d }: any) => d);
  return out;
}
/** Tem algo do cadastro além do que a API já sabe (para migrar o que estava só no navegador). */
export const temFicha = (a: any) => !!(a && (a.brand || a.model || a.serial || a.apelido || (a.name && a.name !== a.plate) || Object.keys(a.specs || {}).length || (a.customFields || []).length
  || (a.documents || []).length || +a.fuelGoal || +a.fuelBudget || a.lifecycle || (a.kind && a.kind !== 'veiculo')));

const ATIVO_PADRAO = { kind: 'veiculo', meter: 'km', kmSource: 'rastreador', kmOffset: 0, customFields: [], active: true, photo: '', journeySource: 'teclado', fuelBudget: 0, fuelGoal: 0, specs: {}, groupIds: [], documents: [] };
const SITUACAO_DA_API: Record<string, string> = { vendido: 'vendido', baixado: 'baixa' };

/**
 * Linha de GET /assets → ativo do store. A ficha da API vale quando existe; sem ficha (ativo que nunca foi salvo
 * com ela), fica o que o navegador tinha. O arquivo dos documentos só existe no navegador e é mantido pelo id.
 * A situação vendido/baixado é a da API (status); o histórico e a anotação vêm da ficha.
 */
const pick = (o: Record<string, unknown> | null, ks: string[]) => (o ? Object.fromEntries(ks.map((k) => [k, o[k]])) : {});

export function ativoDaApi(row: any, prev: any, catalogo: CatalogoAtivos = CATALOGO_VAZIO) {
  const dados = row.dados && Object.keys(row.dados).length ? row.dados : null;
  const base = { ...ATIVO_PADRAO, name: row.rotulo ?? row.plate, ...prev, ...(dados || {}) };
  if (dados && Array.isArray(dados.documents)) {
    const arquivo = new Map<string, any>((prev?.documents || []).filter((d: any) => d.file).map((d: any) => [d.id, d]));
    base.documents = dados.documents.map((d: any) => (arquivo.has(d.id) ? { ...d, file: arquivo.get(d.id).file } : d));
  }
  const fora = SITUACAO_DA_API[row.status];
  const atual = base.lifecycle?.status || 'ativo';
  const lifecycle = fora
    ? (atual === fora ? base.lifecycle : { status: fora, at: Date.parse(row.status_desde), note: '', history: base.lifecycle?.history || [] })
    : (atual === 'vendido' || atual === 'baixa' ? { status: 'ativo', at: Date.parse(row.status_desde), note: '', history: base.lifecycle?.history || [] } : base.lifecycle);
  // ficha da API: o `name` dela é o apelido digitado; sem ficha, o apelido que o navegador já tinha
  const apelido = dados ? apelidoDe(dados.name, row.plate, row.rotulo, row.identificador) : prev?.apelido ?? apelidoDe(prev?.name, prev?.plate, prev?.serial, row.plate, row.rotulo, row.identificador);
  return {
    ...base, id: assetIdFor(row.id), plate: row.plate || '', serial: row.identificador || '', icon: row.icone ?? base.icon ?? '',
    apelido, name: nomeDoAtivo(row.plate, apelido, row.rotulo ?? row.identificador),
    // modelo da lista: marca e modelo vêm dela (renomear corrige em todos os ativos); sem modelo, fica o texto da ficha
    modeloId: row.modelo_id || '', ...pick(marcaModeloDoAtivo(row.modelo_id, catalogo), ['brand', 'model']),
    operationId: row.operacao_id || (dados ? '' : prev?.operationId || ''),
    ...(lifecycle ? { lifecycle } : {}),
  };
}

// ---------- operações ----------
export function operacaoToOperation(o: any) {
  return { id: o.id, name: o.nome, metaKml: o.metaKml };
}

// ---------- pneus ----------
// A API guarda o estado do pneu e as movimentações (apps/api/src/pneus); a tela e `tireStats`/`movesOf`
// (packages/shared/src/pneus.ts) leem vidas, montagens e medições. As três saem das movimentações em ordem:
// compra/recapagem abrem vida, montagem/rodízio/retirada abrem e fecham montagem, medição registra sulco.
const STATUS_PNEU_FRONT: Record<string, string> = { descartado: 'sucata' };
export function pneuDaApi(p: any, movimentos: any[]) {
  const lives: any[] = [];
  const mounts: any[] = [];
  const measurements: any[] = [];
  const recapSent: number[] = [];
  let scrap: { scrapDate: number; scrapReason: string } | null = null;
  const fecha = (ts: number, km: number | null) => { const m = mounts.find((x) => !x.to); if (m) Object.assign(m, { to: ts, kmTo: km ?? undefined }); };
  for (const m of movimentos) {
    const ts = Date.parse(m.ts);
    const km = num(m.km_veiculo);
    const d = m.dados || {};
    switch (m.tipo) {
      case 'compra': lives.push({ n: 1, kind: 'novo', date: ts, cost: Number(m.custo ?? 0), supplier: d.fornecedor || '', tread: Number(m.sulco_mm) }); break;
      case 'recapagem': lives.push({ n: lives.length + 1, kind: 'recapagem', date: ts, cost: Number(m.custo ?? 0), supplier: d.fornecedor || '', band: d.banda || '', tread: Number(m.sulco_mm) }); break;
      case 'montagem': mounts.push({ id: m.id, assetId: asset(m.asset_id), position: m.posicao, life: lives.length, from: ts, kmFrom: km ?? 0 }); break;
      // rodízio = fecha a montagem e abre outra no mesmo veículo logo em seguida (é como `movesOf` reconhece)
      case 'rodizio': fecha(ts, km); mounts.push({ id: m.id, assetId: asset(m.asset_id), position: m.posicao, life: lives.length, from: ts + 1, kmFrom: km ?? 0 }); break;
      case 'retirada': fecha(ts, km); break;
      case 'medicao': measurements.push({ id: m.id, ts, km, mm: Number(m.sulco_mm), life: lives.length, source: d.fonte || 'manual' }); break;
      case 'envio_recapagem': recapSent.push(ts); break;
      case 'descarte': scrap = { scrapDate: ts, scrapReason: m.obs || '' }; break;
    }
  }
  // pneu sem a compra no histórico (não deveria acontecer): a vida 1 sai do próprio cadastro
  if (!lives.length) lives.push({ n: 1, kind: 'novo', date: Date.parse(p.created_at), cost: Number(p.custo_total), supplier: '', tread: Number(p.sulco_inicial_mm) });
  const status = STATUS_PNEU_FRONT[p.status] || p.status;
  const dados = p.dados || {};
  return {
    id: p.id, fireNumber: p.numero_fogo, brand: p.marca || '', model: p.modelo || '', size: p.medida || '', dot: dados.dot ? String(dados.dot) : '',
    recappable: p.vidas_max > 1, maxLives: p.vidas_max, purchaseDate: lives[0].date, supplier: lives[0].supplier,
    status, assetId: p.asset_id ? asset(p.asset_id) : undefined, position: p.posicao || undefined,
    location: status === 'estoque' ? dados.local || 'Almoxarifado' : status === 'recapagem' ? 'Recapadora' : '',
    lives, mounts, measurements, recapSent, ...(scrap || {}),
  };
}
/** Cadastro da tela (`TireRepo.create`) no corpo de `POST /pneus`; fornecedor da compra vai na movimentação. */
export function pneuNovoBody(f: any) {
  const dados: Record<string, string> = {};
  if (f.dot) dados.dot = String(f.dot);
  if (f.location) dados.local = String(f.location);
  return {
    numeroFogo: String(f.fire).toUpperCase(), marca: f.brand || null, modelo: f.model || null, medida: f.size || null,
    vidasMax: f.recappable ? f.maxLives : 1, sulcoInicialMm: f.tread, custo: f.cost, dados,
    // data de compra de hoje vira meio-dia: não pode ficar depois da montagem feita em seguida
    ts: iso(f.purchasedAt ? Math.min(f.purchasedAt, Date.now()) : null) ?? undefined, dadosCompra: f.supplier ? { fornecedor: String(f.supplier) } : {},
  };
}
