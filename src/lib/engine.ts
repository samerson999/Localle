import { haversine, inFence, uid, startOfDay, MIN } from './utils';
import { dayKey, emptyStat, isLoaded, TRIP_PARAMS, noTripPriority, type DayStat } from './trips';

export interface Route { points: [number, number][]; stops: Record<number, number>; min: number; max: number }

// Rotas simuladas no Grande Recife / Suape
export const ROUTES: Record<string, Route> = {
  A: { min: 40, max: 92, points: [[-8.1015, -34.9390], [-8.1150, -34.9480], [-8.1300, -34.9550], [-8.1450, -34.9600], [-8.1700, -34.9500], [-8.2010, -34.9190], [-8.1800, -34.9140], [-8.1500, -34.9050], [-8.1187, -34.9048], [-8.1100, -34.9250]], stops: { 0: 25, 3: 12, 5: 35, 8: 15 } },
  B: { min: 25, max: 62, points: [[-8.1187, -34.9048], [-8.1300, -34.8990], [-8.1450, -34.9000], [-8.1550, -34.9060], [-8.1380, -34.9100], [-8.1220, -34.9120]], stops: { 0: 10, 2: 8, 4: 12 } },
  C: { min: 30, max: 88, points: [[-8.0089, -34.8553], [-7.9900, -34.8500], [-7.9400, -34.8700], [-7.9600, -34.8900], [-8.0200, -34.8800], [-8.0450, -34.8800], [-8.0300, -34.8650]], stops: { 0: 20, 2: 15, 5: 18 } },
  D: { min: 30, max: 75, points: [[-8.0630, -34.8810], [-8.0500, -34.9100], [-8.0270, -34.9800], [-8.0450, -34.9500], [-8.0700, -34.9200], [-8.1015, -34.9390], [-8.0850, -34.9050]], stops: { 2: 20, 5: 30 } },
  E: { min: 4, max: 14, points: [[-8.3940, -34.9600], [-8.3960, -34.9580], [-8.3980, -34.9610], [-8.3950, -34.9630]], stops: { 1: 30, 3: 40 } },
};

// Abaixo disso a bateria interna do rastreador é considerada baixa (mesmo limiar usado no painel do veículo).
export const BATTERY_LOW_V = 11.5;

export interface VState {
  assetId: string; route?: string; pos: [number, number]; seg: number; speed: number; target: number; heading: number;
  ignition: boolean; blocked: boolean; noSignal: boolean; stopLeft: number; odometer: number; hourmeter: number;
  battery: number; gps: number; gsm: number; temp?: number; door?: 'Fechada' | 'Aberta'; seatbelt?: boolean;
  lastUpdate: number; inside: string[]; lastEvt?: number; moving?: boolean; can?: boolean; idleSec?: number; rpm?: number; idleTail?: number; live?: boolean;
}

const bearing = (a: [number, number], b: [number, number]) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

export function stepVehicle(v: VState, dt: number, now: number) {
  const events: any[] = [];
  if (v.noSignal || v.live) return { v, events }; // veículo real: posição vem da API
  const r = v.route ? ROUTES[v.route] : null;
  const n: VState = { ...v };
  n.lastUpdate = now;
  n.gps = Math.max(5, Math.min(18, n.gps + Math.round(Math.random() * 2 - 1)));
  if (n.ignition) n.hourmeter += dt / 3600;
  if (!r || n.blocked) {
    n.speed = Math.max(0, n.speed - 20 * dt); if (n.blocked && n.speed === 0) n.ignition = false;
    n.moving = n.speed > 3; return { v: n, events };
  }
  if (n.stopLeft > 0) {
    n.stopLeft -= dt; n.speed = 0; n.moving = false;
    if (n.stopLeft > (n.idleTail ?? 240)) n.ignition = false; else n.ignition = true;
    n.rpm = n.ignition ? 650 + Math.random() * 80 : 0;
    n.idleSec = n.ignition ? (n.idleSec || 0) + dt : 0;
    if (n.ignition && n.idleSec >= 10 * 60 && n.stopLeft <= 0) events.push({ type: 'ociosidade', value: Math.round(n.idleSec / 60), source: n.can ? 'can' : 'rastreador' });
    if (n.temp !== undefined && n.door) n.door = n.stopLeft > 60 && Math.random() < 0.3 ? 'Aberta' : 'Fechada';
    if (n.stopLeft <= 0) { n.target = r.min + Math.random() * (r.max - r.min); if (n.door) n.door = 'Fechada'; }
    n.battery = n.ignition ? 13.8 + Math.random() * 0.4 : 12.4 + Math.random() * 0.2;
    if (n.battery > 20 || v.battery > 20) n.battery = n.ignition ? 27.6 : 25.1;
    return { v: n, events };
  }
  n.ignition = true;
  n.idleSec = 0;
  n.speed += Math.max(-18, Math.min(6, n.target - n.speed)) * Math.min(1, dt / 2);
  if (n.speed < 0) n.speed = 0;
  let dist = (n.speed / 3.6) * dt;
  let guard = 0;
  while (dist > 0 && guard++ < 10) {
    const tgt = r.points[n.seg];
    const d = haversine(n.pos, tgt);
    n.heading = bearing(n.pos, tgt);
    if (d <= dist) {
      n.pos = tgt; dist -= d; n.odometer += d / 1000;
      const stopMin = r.stops[n.seg];
      n.seg = (n.seg + 1) % r.points.length;
      n.target = r.min + Math.random() * (r.max - r.min);
      if (Math.random() < 0.18) n.target = 84 + Math.random() * 14;
      if (stopMin) { n.stopLeft = stopMin * 60 * (0.7 + Math.random() * 0.6); n.idleTail = Math.random() < 0.25 ? 600 + Math.random() * 900 : 60 + Math.random() * 240; n.speed = 0; break; }
    } else {
      const f = dist / d;
      n.pos = [n.pos[0] + (tgt[0] - n.pos[0]) * f, n.pos[1] + (tgt[1] - n.pos[1]) * f];
      n.odometer += dist / 1000; dist = 0;
    }
  }
  n.moving = n.speed > 3;
  n.battery = v.battery > 20 ? 27.4 + Math.random() * 0.6 : 13.9 + Math.random() * 0.4;
  if (n.temp !== undefined) n.temp = Math.max(-21, Math.min(-12, n.temp + (Math.random() - 0.5) * 0.6));
  n.rpm = Math.round(900 + n.speed * 18 + Math.random() * 300);
  const canEvt = !n.lastEvt || now - n.lastEvt > 2 * MIN;
  if (n.can && canEvt && n.speed > 55 && Math.random() < 0.00008 * dt) { const hi = Math.random() < 0.6; events.push(hi ? { type: 'rpm_excessivo', value: 2600 + Math.round(Math.random() * 600), source: 'can' } : { type: 'banguela', value: Math.round(n.speed), source: 'can' }); n.lastEvt = now; }
  if (canEvt && n.speed > 80) { events.push({ type: 'excesso_velocidade', value: Math.round(n.speed) }); n.lastEvt = now; }
  else if (canEvt && Math.random() < 0.00012 * dt) { const t = ['frenagem_brusca', 'aceleracao_brusca', 'curva_brusca'][Math.floor(Math.random() * 3)]; events.push({ type: t, value: Math.round(n.speed) }); n.lastEvt = now; }
  return { v: n, events };
}

// Cercas: quais o veículo está dentro agora, e em quais entrou/saiu desde a posição anterior.
// Único lugar que decide entrada/saída de cerca — usado tanto pela simulação (processTick) quanto pelos veículos
// reais (rastreioApi.ts), para as duas fontes gerarem o mesmo alerta e viagem de pátio.
export function fenceCrossing(pos: [number, number], prevInside: string[], fences: any[]) {
  const inside = fences.filter((f: any) => inFence(pos, f)).map((f: any) => f.id);
  const entered = inside.filter((x: string) => !prevInside.includes(x));
  const left = prevInside.filter((x: string) => !inside.includes(x));
  return { inside, entered, left };
}

// Alertas de entrada/saída de cerca para quem está configurado para alertar (cerca.alertIn/alertOut).
export function fenceAlerts(assetId: string, assetName: string, entered: string[], left: string[], fences: any[], now: number) {
  const alerts: any[] = [];
  for (const fid of entered) { const f = fences.find((x: any) => x.id === fid); if (f?.alertIn) alerts.push({ id: uid('al'), ts: now, assetId, title: `Entrada em ${f.name}`, detail: `${assetName} entrou na cerca (${f.type})`, priority: fencePriority(f), read: false }); }
  for (const fid of left) { const f = fences.find((x: any) => x.id === fid); if (f?.alertOut) alerts.push({ id: uid('al'), ts: now, assetId, title: `Saída de ${f.name}`, detail: `${assetName} saiu da cerca (${f.type})`, priority: fencePriority(f), read: false }); }
  return alerts;
}

// Avalia uma regra de alerta para um veículo
export function evalRule(rule: any, v: VState, fences: any[], now: number) {
  const d = new Date(now);
  const hhmm = d.getHours() * 60 + d.getMinutes();
  const toMin = (s: string) => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const insideTypes = fences.filter((f) => v.inside.includes(f.id)).map((f) => f.type);
  return rule.conditions.every((c: any) => {
    const val = c.value;
    switch (c.field) {
      case 'velocidade': return c.op === '>' ? v.speed > +val : v.speed < +val;
      case 'ignicao': return (val === 'Ligada') === v.ignition;
      case 'horario': return c.op === 'depois de' ? hhmm >= toMin(val) : hhmm < toMin(val);
      case 'dia_semana': return (val === 'Fim de semana') === (d.getDay() === 0 || d.getDay() === 6);
      case 'dentro_cerca': return insideTypes.includes(val);
      case 'fora_cerca': return !insideTypes.includes(val);
      case 'bateria': return c.op === '<' ? v.battery < +val : v.battery > +val;
      case 'temperatura': return v.temp !== undefined && (c.op === '>' ? v.temp > +val : v.temp < +val);
      case 'porta': return v.door === val;
      case 'bloqueio': return (val === 'Ativo') === v.blocked;
      case 'panico': return (val === 'Acionado') === !!(v as any).panic;
      case 'alimentacao': return (val === 'Desconectada') === !!(v as any).powerCut;
      default: return false;
    }
  });
}

export const RULE_FIELDS: Record<string, { label: string; ops: string[]; values?: string[]; unit?: string; src: string }> = {
  velocidade: { label: 'Velocidade (km/h)', ops: ['>', '<'], src: 'Rastreador' },
  ignicao: { label: 'Ignição', ops: ['='], values: ['Ligada', 'Desligada'], src: 'Rastreador' },
  bateria: { label: 'Tensão da bateria (V)', ops: ['<', '>'], src: 'Rastreador' },
  temperatura: { label: 'Temperatura do baú (°C)', ops: ['>', '<'], src: 'Sensor' },
  porta: { label: 'Porta do baú', ops: ['='], values: ['Aberta', 'Fechada'], src: 'Sensor' },
  bloqueio: { label: 'Bloqueio', ops: ['='], values: ['Ativo', 'Livre'], src: 'Rastreador' },
  panico: { label: 'Botão de pânico', ops: ['='], values: ['Acionado'], src: 'Rastreador' },
  alimentacao: { label: 'Alimentação do rastreador', ops: ['='], values: ['Desconectada', 'Conectada'], src: 'Rastreador' },
  horario: { label: 'Horário', ops: ['depois de', 'antes de'], src: 'Regra da empresa' },
  dia_semana: { label: 'Dia', ops: ['='], values: ['Fim de semana', 'Dia útil'], src: 'Regra da empresa' },
  dentro_cerca: { label: 'Dentro de cerca do tipo', ops: ['='], src: 'Cercas' },
  fora_cerca: { label: 'Fora de cerca do tipo', ops: ['='], src: 'Cercas' },
};

// Processa um passo da simulação para todo o estado (usado ao vivo e na geração do histórico inicial)
export function processTick(s: any, now: number, dt: number) {
  const vehicles: Record<string, VState> = { ...s.vehicles };
  const history = { ...s.history };
  const events = [...s.events];
  const alerts = [...s.alerts];
  const trips = s.trips.map((t: any) => ({ ...t }));
  let tripsDirty = false; // só devolve um array novo de viagens (e re-renderiza quem as lê) quando alguma mudou
  const journey = [...s.journey];
  const ruleHits = { ...(s.ruleHits || {}) };
  let hitsDirty = false;
  // marcações de hoje por motorista, montadas uma vez por passo (antes: um filtro sobre 8.000 marcações por veículo)
  const dayStart0 = startOfDay(now);
  const todayMarks: Record<string, any[]> = {};
  for (const m of journey) if (m.ts >= dayStart0) (todayMarks[m.driverId] ||= []).push(m);
  const pushMark = (m: any) => { journey.push(m); (todayMarks[m.driverId] ||= []).push(m); };
  // indicadores de viagem do dia e visitas às cercas (base do cumprimento da matriz recorrente)
  const dk = dayKey(now);
  const tripStats = { ...(s.tripStats || {}) }; const todayStats: Record<string, DayStat> = (tripStats[dk] = { ...(tripStats[dk] || {}) });
  let fenceVisits: any[] | null = null;
  const assetsById: Record<string, any> = Object.fromEntries(s.assets.map((a: any) => [a.id, a]));
  for (const id of Object.keys(vehicles)) {
    const prev = vehicles[id];
    const asset = assetsById[id];
    if (!asset || prev.noSignal) continue;
    const { v, events: evs } = stepVehicle(prev, dt, now);
    // cercas
    const { inside, entered, left } = fenceCrossing(v.pos, prev.inside, s.fences);
    v.inside = inside;
    vehicles[id] = v;
    const driverId = asset.driverId;
    if (entered.length) { fenceVisits ||= [...(s.fenceVisits || [])]; for (const fid of entered) fenceVisits.push({ a: id, f: fid, ts: now }); }
    if (v.moving && !v.live) {
      const km = Math.max(0, v.odometer - prev.odometer);
      const st = (todayStats[id] = { ...(todayStats[id] || emptyStat()) });
      const active = trips.find((t: any) => t.assetId === id && t.status === 'em_andamento');
      st.mv += dt;
      if (!active) { st.nt += dt; st.kmNt += km; }
      else if (active.type === 'externo') { if (isLoaded(active)) st.kmLoaded += km; else st.kmEmpty += km; }
      else st.kmTrip += km;
      // terminou uma viagem externa e segue rodando sem viagem: sinaliza ao monitoramento uma vez
      if (!active) {
        const last = trips.filter((t: any) => t.assetId === id && t.type === 'externo' && t.status === 'concluida').sort((p: any, q: any) => q.endedAt - p.endedAt)[0];
        if (last && !last.noTripAlerted && now - last.endedAt > TRIP_PARAMS.noTripAlertMin * MIN && now - last.endedAt < 12 * 3600000) {
          last.noTripAlerted = true; tripsDirty = true;
          alerts.push({ id: uid('al'), ts: now, assetId: id, title: 'Rodando sem viagem', detail: `${asset.name} concluiu "${last.name || 'viagem'}" e segue rodando sem viagem atribuída`, priority: noTripPriority(), read: false });
        }
      }
    }
    for (const e of evs) events.push({ id: uid('ev'), ts: now, assetId: id, driverId, pos: v.pos, ...e });
    // histórico
    const h = history[id] ? history[id].slice(-1999) : [];
    const last = h[h.length - 1];
    if (!v.live && (!last || v.moving || now - last[0] > 60000)) { h.push([now, +v.pos[0].toFixed(6), +v.pos[1].toFixed(6), Math.round(v.speed), v.ignition ? 1 : 0]); history[id] = h; }
    // alertas de cerca
    alerts.push(...fenceAlerts(id, asset.name, entered, left, s.fences, now));
    // viagens
    for (const fid of left) {
      const f = s.fences.find((x: any) => x.id === fid);
      if (f?.startsTrip && s.tripConfig.patioTrigger === 'rastreador' && !trips.some((t: any) => t.assetId === id && t.status === 'em_andamento'))
        (tripsDirty = true), trips.push({ id: uid('tr'), type: 'patio', assetId: id, driverId, originFenceId: fid, status: 'em_andamento', startedAt: now, startSource: 'rastreador', stops: [], visited: [] });
      if (f?.startsTrip && s.tripConfig.patioTrigger === 'porteiro')
        alerts.push({ id: uid('al'), ts: now, assetId: id, title: 'Saída sem registro da portaria', detail: `${asset.name} saiu de ${f.name}; aguardando registro do porteiro`, priority: 'baixa', read: false });
      for (const t of trips) if (t.assetId === id && t.status === 'aguardando' && t.originFenceId === fid && (!t.plannedStart || now >= t.plannedStart - 2 * 3600000)) { t.status = 'em_andamento'; t.startedAt = now; t.startSource = 'rastreador'; tripsDirty = true; }
    }
    for (const fid of entered) {
      for (const t of trips) {
        if (t.assetId !== id || t.status !== 'em_andamento') continue;
        tripsDirty = true;
        if (t.stops?.includes(fid) && !t.visited?.includes(fid)) t.visited = [...(t.visited || []), fid];
        if (t.loadFenceId === fid && !t.loadedAt) t.loadedAt = now;
        if (t.unloadFenceId === fid && t.loadedAt && !t.unloadedAt) t.unloadedAt = now;
        const f = s.fences.find((x: any) => x.id === fid);
        // viagem externa só termina no destino depois da descarga (quando há etapa de descarga)
        if ((t.type === 'patio' && f?.endsTrip) || (t.type !== 'patio' && t.destFenceId === fid && (!t.unloadFenceId || t.unloadedAt))) { t.status = 'concluida'; t.endedAt = now; t.endFenceId = fid; }
      }
    }
    // jornada (marcações automáticas como se viessem do teclado embarcado)
    if (driverId && asset.journeySource !== 'app' && !v.live) { // veículo real: jornada só por marcação real
      const today = todayMarks[driverId] || [];
      const lastMark = today[today.length - 1];
      if (v.moving && (!lastMark || lastMark.type === 'fim_jornada')) {
        if (!lastMark) pushMark({ id: uid('jm'), driverId, assetId: id, ts: now, type: 'inicio_jornada', source: 'teclado' });
        pushMark({ id: uid('jm'), driverId, assetId: id, ts: now + 1, type: 'inicio_direcao', source: 'teclado' });
      } else if (lastMark) {
        if (v.moving && lastMark.type === 'fim_direcao') pushMark({ id: uid('jm'), driverId, assetId: id, ts: now, type: 'inicio_direcao', source: 'teclado' });
        if (!v.moving && prev.moving && lastMark.type === 'inicio_direcao' && v.stopLeft > 5 * 60) pushMark({ id: uid('jm'), driverId, assetId: id, ts: now, type: 'fim_direcao', source: 'teclado' });
      }
    }
    // regras
    for (const rule of s.rules) {
      if (!rule.active) continue;
      if (rule.groupId && !asset.groupIds?.includes(rule.groupId)) continue;
      const key = rule.id + ':' + id;
      if (evalRule(rule, v, s.fences, now)) {
        if (!ruleHits[key] || now - ruleHits[key] > 15 * MIN) {
          ruleHits[key] = now; hitsDirty = true;
          alerts.push({ id: uid('al'), ts: now, assetId: id, ruleId: rule.id, title: rule.name, detail: `${asset.name} · ${Math.round(v.speed)} km/h`, priority: rule.priority, read: false });
          if (rule.actions?.ranking) events.push({ id: uid('ev'), ts: now, assetId: id, driverId, pos: v.pos, type: 'fora_horario', value: Math.round(v.speed), ruleId: rule.id });
          if (rule.actions?.bloqueio) vehicles[id] = { ...vehicles[id], blocked: true };
        }
      }
    }
  }
  // listas sem novidade mantêm a mesma referência: seletores e useMemo de quem as lê não disparam a cada passo
  const same = (cur: any[], prev: any[], max: number) => (cur.length === prev.length ? prev : cur.slice(-max));
  return { vehicles, history, events: same(events, s.events, 6000), alerts: same(alerts, s.alerts, 500), trips: tripsDirty ? trips : s.trips, journey: same(journey, s.journey, 8000), ruleHits: hitsDirty ? ruleHits : s.ruleHits || ruleHits, tripStats, ...(fenceVisits ? { fenceVisits: fenceVisits.slice(-20000) } : {}) };
}

// prioridade do alerta de cerca: configurada na cerca pelo cliente; sem configuração, área de risco é alta
export const fencePriority = (f: any): string => f?.alertPriority || (f?.type === 'Área de risco' ? 'alta' : 'media');
