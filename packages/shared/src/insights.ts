// Leituras dos dados em linguagem humana: frases-resumo e ações dos gráficos de BI.
// NO PRODUTO REAL estas regras vão para o backend (junto dos indicadores, como fn_maintenance_kpis),
// para que todas as telas e relatórios usem exatamente os mesmos números e as mesmas frases.
import { isOut, hadTracker, operatedIn, opHours } from './assetStatus';
import { DAY, HOUR, brl, num, sum } from './utils';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dd = (t: number) => new Date(t).getDate();
const mm = (t: number) => MES[new Date(t).getMonth()];

// "1–27 set" ou "18 ago–16 set"
export function rangeLabel(from: number, to: number) {
  return mm(from) === mm(to) ? `${dd(from)}–${dd(to)} ${mm(to)}` : `${dd(from)} ${mm(from)}–${dd(to)} ${mm(to)}`;
}
export const listPt = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

// fração em palavras: 0,66 → "dois terços"
export function fractionWords(x: number) {
  if (x >= 0.95) return 'quase tudo';
  if (x >= 0.72) return 'três quartos';
  if (x >= 0.6) return 'dois terços';
  if (x >= 0.45) return 'metade';
  if (x >= 0.3) return 'um terço';
  if (x >= 0.22) return 'um quarto';
  return `${num(x * 100)}%`;
}

// ---------------------------------------------------------------- disponibilidade da frota
export const CAUSES: Record<string, string> = { espera: 'Espera de orçamento ou peça', pane: 'Corretivas por pane', corretiva: 'Corretivas programadas', preventiva: 'Preventivas na oficina' };
const causeOf = (w: any) => (['aberta', 'orcamento', 'aprovada'].includes(w.status) ? 'espera' : w.type === 'corretiva' ? (w.unplanned ? 'pane' : 'corretiva') : 'preventiva');

// Disponibilidade = 1 − horas paradas na oficina ÷ (veículos × horas do período); mesmo critério de maintKpis.
export function availability(s: any, from: number, to: number) {
  const now = Date.now(); const t = Math.min(to, now);
  // mesma base do BI (maintKpis): veículos com rastreador
  const veh = s.assets.filter((a: any) => a.kind === 'veiculo' && hadTracker(s, a) && operatedIn(a, from));
  const ids = veh.map((a: any) => a.id);
  const capH = veh.reduce((m: number, a: any) => m + opHours(a, from, t), 0); // vendido conta até sair da frota
  const byCause: Record<string, number> = {}; const byAsset: Record<string, number> = {};
  const orders: any[] = [];
  for (const w of s.workOrders) {
    if (!ids.includes(w.assetId) || w.status === 'cancelada' || !w.shopInAt || w.shopInAt >= t || (w.releasedAt || now) <= from) continue;
    const h = Math.max(0, (Math.min(w.releasedAt || now, t) - Math.max(w.shopInAt, from)) / HOUR);
    const c = causeOf(w);
    byCause[c] = (byCause[c] || 0) + h; byAsset[w.assetId] = (byAsset[w.assetId] || 0) + h;
    orders.push({ ...w, cause: c, hours: h });
  }
  const down = sum(Object.values(byCause));
  return {
    value: capH > 0 ? 1 - down / capH : null, downHours: down, capHours: capH, vehicles: ids.length, orders,
    causes: Object.keys(CAUSES).map((k) => ({ key: k, label: CAUSES[k], hours: byCause[k] || 0, pts: capH > 0 ? ((byCause[k] || 0) / capH) * 100 : 0 })).filter((c) => c.hours > 0).sort((a, b) => b.hours - a.hours),
    failures: orders.filter((w) => w.cause === 'pane').length,
    mttr: (() => { const r = orders.filter((w) => w.type === 'corretiva' && w.releasedAt); return r.length ? sum(r.map((w) => (w.releasedAt - w.shopInAt) / HOUR)) / r.length : null; })(),
    costCorr: sum(s.workOrders.filter((w: any) => ids.includes(w.assetId) && w.type === 'corretiva' && w.status === 'concluida' && w.releasedAt >= from && w.releasedAt <= t).map((w: any) => w.cost || 0)),
  };
}

export function availabilityWeeks(s: any, n = 12, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const to = now - (n - 1 - i) * 7 * DAY, from = to - 7 * DAY;
    return { label: `${dd(from + DAY)}/${String(new Date(from + DAY).getMonth() + 1).padStart(2, '0')}`, from, to, value: availability(s, from, to).value ?? 0 };
  });
}

export function availabilitySentence(cur: number | null, prev: number | null, goal: number) {
  if (cur == null) return 'Ainda não há horas suficientes no período para calcular a disponibilidade.';
  const gap = (cur - goal) * 100;
  const vs = prev == null ? '' : cur >= prev ? `, ${num(Math.abs(cur - prev) * 100, 1)} p.p. melhor que o período anterior` : `, ${num(Math.abs(cur - prev) * 100, 1)} p.p. pior que o período anterior`;
  return gap >= 0 ? `A frota ficou ${num(gap, 1)} p.p. acima da meta de ${num(goal * 100, 0)}%${vs}.` : `A frota ficou ${num(-gap, 1)} p.p. abaixo da meta de ${num(goal * 100, 0)}%${vs}.`;
}

export function waterfallSentence(causes: { label: string; pts: number }[]) {
  const total = sum(causes.map((c) => c.pts));
  if (!total) return 'Nenhuma hora parada na oficina no período.';
  const top = causes.slice(0, causes.length > 2 && causes[0].pts / total < 0.6 ? 2 : 1);
  const share = sum(top.map((c) => c.pts)) / total;
  return `${cap(listPt(top.map((c, i) => (i ? lower(c.label) : c.label))))} ${top.length > 1 ? 'explicam' : 'explica'} ${fractionWords(share)} do tempo parado.`;
}

export function weeksSentence(weeks: { value: number }[], goal: number) {
  const below = weeks.filter((w) => w.value < goal).length;
  const cur = weeks[weeks.length - 1]?.value ?? 0;
  const head = below === 0 ? `Todas as últimas ${weeks.length} semanas ficaram na meta` : below === 1 ? `1 das últimas ${weeks.length} semanas ficou abaixo da meta` : `${below} das últimas ${weeks.length} semanas ficaram abaixo da meta`;
  return `${head}; a semana atual está em ${num(cur * 100, 1)}%.`;
}

// ---------------------------------------------------------------- eventos de condução
export const EVENT_LABEL: Record<string, string> = { excesso_velocidade: 'Excesso de velocidade', frenagem_brusca: 'Frenagem brusca', aceleracao_brusca: 'Aceleração brusca', curva_brusca: 'Curva brusca', rpm_excessivo: 'RPM excessivo', ociosidade: 'Ociosidade', banguela: 'Banguela' };
const evLabel = (t: string) => EVENT_LABEL[t] || cap(t.replace(/_/g, ' '));

export function eventMatrix(s: any, from: number, to: number) {
  const ev = (s.events || []).filter((e: any) => e.ts >= from && e.ts <= to);
  const opOf = (aid: string) => s.assets.find((a: any) => a.id === aid)?.operationId;
  const types = Object.entries(ev.reduce((m: any, e: any) => ((m[e.type] = (m[e.type] || 0) + 1), m), {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  const rows = s.operations.map((op: any) => {
    const mine = ev.filter((e: any) => opOf(e.assetId) === op.id);
    return { key: op.id, label: op.name, cells: types.map((t) => mine.filter((e: any) => e.type === t).length), total: mine.length };
  }).filter((r: any) => r.total > 0).sort((a: any, b: any) => b.total - a.total);
  return { cols: types.map((t) => ({ key: t, label: evLabel(t) })), rows, total: ev.length };
}

export function heatSentence(m: ReturnType<typeof eventMatrix>) {
  let best = { r: -1, c: -1, v: 0 };
  m.rows.forEach((r: any, i: number) => r.cells.forEach((v: number, j: number) => { if (v > best.v) best = { r: i, c: j, v }; }));
  if (best.r < 0) return 'Nenhum evento de condução no período.';
  const row = m.rows[best.r], col = m.cols[best.c];
  return `${col.label} em ${row.label} responde por ${fractionWords(best.v / m.total)} de todos os eventos.`;
}

export function eventDays(s: any, from: number, to: number, type?: string) {
  const span = Math.round((to - from) / DAY);
  const count = (a: number) => Array.from({ length: span }, (_, i) => (s.events || []).filter((e: any) => (!type || e.type === type) && e.ts >= a + i * DAY && e.ts < a + (i + 1) * DAY).length);
  return { cur: count(from), prev: count(from - span * DAY), from };
}

export function dotSentence(d: { cur: number[]; prev: number[]; from: number }, what: string) {
  const a = sum(d.cur), b = sum(d.prev);
  if (!a && !b) return `Nenhum registro de ${what} nos dois períodos.`;
  const peak = d.cur.indexOf(Math.max(...d.cur));
  const delta = b ? (a - b) / b : null;
  const trend = delta == null ? `${a} registros no período` : Math.abs(delta) < 0.05 ? `${a} registros, praticamente o mesmo que antes` : `${a} registros, ${num(Math.abs(delta) * 100)}% ${delta > 0 ? 'a mais' : 'a menos'} que o período anterior`;
  return `${cap(what)}: ${trend}; o pico foi em ${dd(d.from + peak * DAY)} de ${MES_LONGO[new Date(d.from + peak * DAY).getMonth()]}.`;
}

// ---------------------------------------------------------------- estimado × realizado
// Combustível: orçamento mensal do veículo (estimado) × gasto no mês (realizado)
export function fuelBudgetItems(s: any, from: number, to: number) {
  return s.assets.filter((a: any) => a.fuelBudget > 0 && operatedIn(a, from)).map((a: any) => ({
    key: a.id, label: a.name, sub: `${a.brand} ${a.model}`,
    est: +a.fuelBudget, real: sum(s.fuelings.filter((f: any) => f.assetId === a.id && f.ts >= from && f.ts <= to).map((f: any) => f.total || 0)),
  })).sort((x: any, y: any) => y.real - y.est - (x.real - x.est));
}
export function estSentence(items: { est: number; real: number }[]) {
  const over = items.filter((i) => i.real > i.est);
  if (!over.length) return `Os ${items.length} itens ficaram dentro do estimado.`;
  return `${over.length} de ${items.length} ${items.length === 1 ? 'item passou' : 'itens passaram'} do estimado, somando ${brl(sum(over.map((i) => i.real - i.est)))} a mais.`;
}

// ---------------------------------------------------------------- padrões encontrados
export interface Pattern { label: string; value: string; unit?: string; cause: string; action: { label: string; to: string } }
export function findPatterns(s: any, now = Date.now()): Pattern[] {
  const out: Pattern[] = [];
  const name = (id: string) => s.assets.find((a: any) => a.id === id)?.name || id;
  const corr = s.workOrders.filter((w: any) => w.type === 'corretiva' && w.unplanned && (w.openedAt || w.shopInAt) >= now - 365 * DAY);
  const byTitle = Object.values(corr.reduce((m: any, w: any) => { (m[w.title] ||= { title: w.title, list: [] as any[] }).list.push(w); return m; }, {})) as any[];
  const rec = byTitle.sort((a, b) => b.list.length - a.list.length)[0];
  if (rec && rec.list.length >= 2) {
    const assets = [...new Set(rec.list.map((w: any) => name(w.assetId)))] as string[];
    out.push({ label: 'Falha que se repete', value: String(rec.list.length), unit: 'ocorrências', cause: `${rec.title} em ${assets.length === 1 ? assets[0] : `${assets.length} veículos`} nos últimos 12 meses.`, action: { label: 'Revisar OS', to: '/manutencao' } });
  }
  const done = s.workOrders.filter((w: any) => w.type === 'corretiva' && w.status === 'concluida' && w.releasedAt >= now - 365 * DAY);
  const total = sum(done.map((w: any) => w.cost || 0));
  if (total > 0) {
    const by = Object.entries(done.reduce((m: any, w: any) => ((m[w.assetId] = (m[w.assetId] || 0) + (w.cost || 0)), m), {})).sort((a: any, b: any) => b[1] - a[1]);
    const [aid, v] = by[0] as [string, number];
    const nVeh = s.assets.filter((a: any) => a.kind === 'veiculo' && !isOut(a)).length;
    out.push({ label: 'Custo concentrado', value: num((v / total) * 100), unit: '%', cause: `do custo corretivo do ano está em ${name(aid)}, um de ${nVeh} veículos da frota.`, action: { label: 'Abrir ativo', to: '/ativos' } });
  }
  const sp = (s.events || []).filter((e: any) => e.type === 'excesso_velocidade' && e.ts >= now - 30 * DAY);
  if (sp.length >= 5) {
    const hours = Array.from({ length: 24 }, (_, h) => sp.filter((e: any) => new Date(e.ts).getHours() === h).length);
    let best = 0, at = 0;
    for (let h = 0; h < 24; h++) { const w = hours[h] + hours[(h + 1) % 24]; if (w > best) { best = w; at = h; } }
    out.push({ label: 'Horário de risco', value: num((best / sp.length) * 100), unit: '%', cause: `dos excessos de velocidade dos últimos 30 dias acontecem entre ${at}h e ${(at + 2) % 24}h.`, action: { label: 'Ver ranking', to: '/ranking' } });
  }
  return out;
}

// ---------------------------------------------------------------- manutenção: precisa de você (OS em Crítico e Alerta)
export interface MaintNeed { id: string; level: 'crit' | 'alerta'; title: string; context: string; assetId: string; woId?: string; since?: number; soon?: boolean } // soon: só próxima do vencimento (Pendente)
export function maintNeeds(s: any, planStatus: (s: any, p: any, a: string) => any, now = Date.now()): MaintNeed[] {
  const out: MaintNeed[] = [];
  for (const p of s.plans) for (const aid of p.assetIds) {
    if (isOut(s.assets.find((a: any) => a.id === aid))) continue; // vendido/baixado sai das pendências
    const st = planStatus(s, p, aid);
    const name = st.asset?.name || aid;
    // nível vem de maint.planStatus (prazo de crítico do Setup ou do plano)
    // gatilho "ambos" (km e tempo): mostra só o lado que venceu, ou, se nenhum venceu, só o mais perto de vencer
    // (proporcional ao próprio limiar de alerta do plano — km e dias não são comparáveis em valor absoluto)
    const kmTxt = st.leftKm !== null ? `${st.leftKm < 0 ? 'passou ' : 'faltam '}${num(Math.abs(st.leftKm))} ${st.hours ? 'h' : 'km'}` : null;
    const daysTxt = st.leftDays !== null ? `${st.leftDays < 0 ? `vencida há ${-st.leftDays}` : `faltam ${st.leftDays}`} dias` : null;
    let left: string;
    if (kmTxt && daysTxt) {
      const kmOver = st.leftKm < 0, daysOver = st.leftDays < 0;
      if (kmOver || daysOver) left = kmOver ? kmTxt : daysTxt; // os dois vencidos ao mesmo tempo: km tem prioridade (raro)
      else { const kmRatio = p.advanceKm > 0 ? st.leftKm / p.advanceKm : Infinity; const daysRatio = p.advanceDays > 0 ? st.leftDays / p.advanceDays : Infinity; left = kmRatio <= daysRatio ? kmTxt : daysTxt; }
    } else left = kmTxt || daysTxt || '';
    if (st.level === 'crit') out.push({ id: p.id + aid, level: 'crit', title: `${p.name} · ${name}`, context: `${st.open ? `OS #${st.open.num} aberta` : 'Sem OS aberta'} · ${left}`, assetId: aid, woId: st.open?.id, since: st.critSince });
    else if (st.level === 'alerta' || st.status === 'proxima') out.push({ id: p.id + aid, level: 'alerta', soon: st.level !== 'alerta', title: `${p.name} · ${name}`, context: `${st.open ? `OS #${st.open.num} aberta` : st.status === 'proxima' ? 'Próxima do vencimento' : 'Vencida'} · ${left}`, assetId: aid, woId: st.open?.id });
  }
  // OS paradas aguardando orçamento ou aprovação há mais de 24 h
  for (const w of s.workOrders) {
    if (!['aberta', 'orcamento', 'aprovada'].includes(w.status) || !w.shopInAt || now - w.shopInAt < 24 * HOUR) continue;
    const name = s.assets.find((a: any) => a.id === w.assetId)?.name || '';
    out.push({ id: 'w' + w.id, level: now - w.shopInAt > 48 * HOUR ? 'crit' : 'alerta', title: `OS #${w.num} · ${w.title}`, context: `${name} parado há ${num((now - w.shopInAt) / HOUR)} h · ${w.status === 'aprovada' ? 'aprovada, aguardando execução' : w.winnerId ? 'aguardando aprovação' : 'aguardando escolha do orçamento'}`, assetId: w.assetId, woId: w.id, since: w.shopInAt });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1));
}

// ---------------------------------------------------------------- linha do tempo de uma OS
// gatilho → OS criada → oficina → autorizada → executada, com o tempo de cada etapa.
// Rosa = custou (pane, espera longa); azul = no plano.
export function orderTimeline(w: any) {
  const dur = (a: number, b: number) => { const h = (b - a) / HOUR; return h < 1 ? `${num(h * 60)} min` : h < 48 ? `${num(h)} h` : `${num(h / 24)} dias`; };
  const raw: { tone: 'plan' | 'cost'; ts: number; title: string; detail: string }[] = [];
  if (w.openedAt) raw.push({ tone: w.unplanned ? 'cost' : 'plan', ts: w.openedAt, title: w.unplanned ? 'Pane relatada · OS criada' : w.auto ? 'Gatilho do plano · OS criada' : 'OS criada', detail: w.title });
  if (w.shopInAt) raw.push({ tone: w.unplanned ? 'cost' : 'plan', ts: w.shopInAt, title: 'Entrou na oficina', detail: w.supplier || '' });
  if (w.approvedAt) raw.push({ tone: w.shopInAt && w.approvedAt - w.shopInAt > 24 * HOUR ? 'cost' : 'plan', ts: w.approvedAt, title: 'Serviço autorizado', detail: [w.approvedBy, w.supplier].filter(Boolean).join(' · ') });
  if (w.releasedAt) raw.push({ tone: w.unplanned || (w.shopInAt && w.releasedAt - w.shopInAt > 48 * HOUR) ? 'cost' : 'plan', ts: w.releasedAt, title: 'Executada e liberada', detail: w.shopInAt ? `${dur(w.shopInAt, w.releasedAt)} parado na oficina` : '' });
  raw.sort((a, b) => a.ts - b.ts);
  return raw.map((x, i) => ({ ...x, detail: [x.detail, i > 0 && x.ts - raw[i - 1].ts >= 60000 ? `+${dur(raw[i - 1].ts, x.ts)} desde a etapa anterior` : ''].filter(Boolean).join(' · ') }));
}

// Resultado da OS: estimado (orçamento vencedor ou soma dos itens) × realizado (custo final)
export function orderResult(w: any) {
  const items = (w.items || []).filter((i: any) => i.est != null || i.real != null);
  const winner = (w.quotes || []).find((q: any) => q.id === w.winnerId);
  const est = items.length && items.every((i: any) => i.est != null) ? sum(items.map((i: any) => i.est)) : winner?.value ?? null;
  const real = w.status === 'concluida' ? (w.cost || (items.length ? sum(items.map((i: any) => i.real || 0)) : null)) : null;
  const down = w.shopInAt ? ((w.releasedAt || Date.now()) - w.shopInAt) / HOUR : null;
  return { est, real, over: est != null && real != null ? real - est : null, down };
}