import { assetIdFor, backendIdOf } from './localleMap';

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
  };
}
export function driverToMotoristaBody(d: any) {
  return {
    nome: String(d.name || '').trim(), cnh: d.cnh || null, cnhCategoria: d.cnhCat || null, cnhValidade: d.cnhDue || null, toxicologicoValidade: d.toxDue || null,
    telefone: d.phone || null, regime: d.regime || 'cargas', ear: !!d.ear,
    dados: { ...(d.cpf ? { cpf: d.cpf } : {}), ...(d.registration ? { registration: d.registration } : {}) },
  };
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
