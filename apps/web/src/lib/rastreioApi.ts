import { useEffect } from 'react';
import { create } from 'zustand';
import { useStore } from './store';
import { erroHttp, fetchOuErro } from './apiErro';

// Integração com a plataforma de rastreamento real (API "user" v1.0).
// As chamadas passam pelo proxy do Vite (/api-rastreio), que anexa a chave do .env.
// Datas da API vêm em UTC no formato "AAAA-MM-DD HH:MM:SS".

const POLL_MS = 30000;
const LIVE_HISTORY = 120; // pontos por veículo real guardados no navegador (o replay busca na API)
export const LIVE_GROUP = { id: 'g_api', name: 'Frota real (rastreador)' };

export async function apiCall(cmd: string) {
  const r = await fetchOuErro('/api-rastreio?cmd=' + encodeURIComponent(cmd));
  if (!r.ok) throw erroHttp(r.status);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { throw new Error(txt.slice(0, 120) || 'Resposta vazia'); }
}

export const parseUTC = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
const toUTC = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const n = (x: any) => (x === undefined || x === null || x === '' ? undefined : +x);
export const assetIdFor = (imei: string) => 'rt_' + imei;

// O nome do objeto na plataforma vem como "PLACA|MOTORISTA"; o motorista vira cadastro para o ranking.
const driverIdFor = (name: string) => 'rd_' + name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const driverOf = (objName: string) => { const d = String(objName || '').split('|')[1]?.trim(); return d ? { id: driverIdFor(d), name: d } : null; };
const addDrivers = (drivers: any[], found: { id: string; name: string }[]) => {
  const have = new Set(drivers.map((d: any) => d.id));
  const novos = found.filter((d) => !have.has(d.id) && have.add(d.id)).map((d) => ({ ...d, cnh: '', cnhCat: '', phone: '', regime: 'cargas', live: true }));
  return novos.length ? [...drivers, ...novos] : drivers;
};

// Sensores variam por modelo: Teltonika usa ioNNN, os demais acc/ignition/power/adc1.
function sensors(p: any = {}) {
  const ign = p.acc ?? p.ignition ?? p.io239;
  const volt = n(p.power) ?? n(p.adc1) ?? (n(p.io66) !== undefined ? n(p.io66)! / 1000 : undefined);
  return {
    ignition: ign === '1' || ign === 'true' || ign === true,
    blocked: p.blocked === '1' || p.blocked === 'true' || p.io179 === '1',
    battery: volt && volt > 0 ? +volt.toFixed(1) : 12.6,
    gps: n(p.sat) ?? n(p.gpslev) ?? 0,
    gsm: Math.min(5, n(p.gsmlev) ?? n(p.rssi) ?? 0),
  };
}

function toAsset(o: any, prev: any) {
  const [label, driverName] = String(o.name || '').split('|');
  const [brand, ...model] = String(o.model || '').split('/');
  return {
    kind: 'veiculo', meter: 'km', kmSource: 'rastreador', kmOffset: 0, customFields: [], active: true, photo: '', journeySource: 'teclado', fuelBudget: 0, fuelGoal: 0, specs: {},
    ...prev,
    id: assetIdFor(o.imei),
    name: (o.plate_number || label || o.imei).trim(),
    plate: (o.plate_number || '').trim(),
    brand: prev?.brand || brand.trim(),
    model: prev?.model || model.join('/').trim() || brand.trim(),
    driverName: (driverName || '').trim(),
    // motorista vem da plataforma, a menos que o usuário tenha vinculado outro cadastro manualmente
    driverId: prev?.driverId && !prev.driverId.startsWith('rd_') ? prev.driverId : driverOf(o.name)?.id,
    groupIds: prev?.groupIds?.length ? prev.groupIds : [LIVE_GROUP.id],
    tracker: { imei: o.imei, model: o.device || o.protocol, iccid: o.sim_number || '', linkedAt: prev?.tracker?.linkedAt || Date.now(), live: true },
  };
}

function toVehicle(o: any, prev: any) {
  const speed = +o.speed || 0;
  return {
    route: undefined, seg: 0, target: 0, stopLeft: 0, noSignal: false, inside: [],
    ...prev,
    assetId: assetIdFor(o.imei), live: true,
    pos: [+o.lat, +o.lng] as [number, number], speed, heading: +o.angle || 0, moving: speed > 3,
    odometer: +o.odometer || 0, hourmeter: +o.engine_hours || 0,
    lastUpdate: parseUTC(o.dt_tracker) || Date.now(),
    ...sensors(o.params),
  };
}

interface SyncState { status: 'off' | 'ok' | 'erro'; ts: number; count: number; error: string }
export const useRastreio = create<SyncState>(() => ({ status: 'off', ts: 0, count: 0, error: '' }));

export async function syncObjects() {
  try {
    const objs: any[] = await apiCall('USER_GET_OBJECTS');
    if (!Array.isArray(objs)) throw new Error('Formato inesperado');
    useStore.getState().patch((s: any) => {
      const byId: Record<string, any> = Object.fromEntries(s.assets.map((a: any) => [a.id, a]));
      const assets = [...s.assets];
      const vehicles = { ...s.vehicles };
      const history = { ...s.history };
      for (const o of objs) {
        if (o.active !== 'true' || !+o.lat) continue;
        const id = assetIdFor(o.imei);
        const a = toAsset(o, byId[id]);
        if (byId[id]) assets[assets.findIndex((x: any) => x.id === id)] = a; else assets.push(a);
        const v = toVehicle(o, vehicles[id]);
        const h = history[id] || [];
        if (h[h.length - 1]?.[0] !== v.lastUpdate) history[id] = [...h, [v.lastUpdate, v.pos[0], v.pos[1], Math.round(v.speed), v.ignition ? 1 : 0]].slice(-LIVE_HISTORY);
        vehicles[id] = v;
      }
      const groups = s.groups.some((g: any) => g.id === LIVE_GROUP.id) ? s.groups : [...s.groups, LIVE_GROUP];
      const drivers = addDrivers(s.drivers, objs.map((o) => driverOf(o.name)).filter(Boolean) as any[]);
      return { assets, vehicles, history, groups, drivers };
    });
    useRastreio.setState({ status: 'ok', ts: Date.now(), count: objs.length, error: '' });
  } catch (e: any) {
    useRastreio.setState({ status: 'erro', ts: Date.now(), error: e.message || String(e) });
  }
}

// ---------- Eventos reais → Alertas e Ranking ----------
// OBJECT_GET_LAST_EVENTS: [tipo, descrição, imei, "PLACA|MOTORISTA", data UTC, lat, lng, altitude, ângulo, velocidade, params]
// Cada evento vira: ponto no ranking (rank), alerta no painel (alert) ou os dois. Ignição liga/desliga é ignorada (só ruído).
const EVENTS_POLL_MS = 2 * 60000;
const KEEP_DAYS = 30;
const DAY_MS = 86400000;
// Pânico e violação de alimentação não geram alerta aqui: viram um pulso em v.panic/v.powerCut e é a Regra
// (r7/r8, com suas próprias ações — bloqueio, WhatsApp etc.) que decide o alerta.
function classify(type: string, desc: string): { rank?: string; alert?: 'alta' | 'media' | 'baixa'; flag?: 'panic' | 'powerCut' } | null {
  if (/igni[cç][aã]o (ligada|desligada)/i.test(desc)) return null;
  if (type === 'overspeed') return { rank: 'excesso_velocidade', alert: 'alta' };
  if (type === 'engidle') return { rank: 'ociosidade' };
  if (type === 'sos' || /p[âa]nico/i.test(desc)) return { flag: 'panic' };
  if (/viola[cç][aã]o|jammer|bateria/i.test(desc)) return { flag: 'powerCut' };
  if (type === 'zone_in' || type === 'zone_out') return { alert: 'media' };
  return { alert: 'media' };
}

const FLAG_PULSE_MS = 3 * 60000; // tempo em que v.panic/v.powerCut ficam "acionados", dando folga para o tick (2 s) avaliar as Regras

export async function syncEvents() {
  const raw: any[] = await apiCall('OBJECT_GET_LAST_EVENTS');
  if (!Array.isArray(raw)) throw new Error('Formato inesperado de eventos');
  const toClear: { assetId: string; field: 'panic' | 'powerCut' }[] = [];
  useStore.getState().patch((s: any) => {
    const seen = new Set([...s.events, ...s.alerts].map((x: any) => x.id));
    const flagSeen = new Set<string>(s.flagEventsSeen || []);
    // primeira carga: o que já aconteceu entra como lido, para não lotar o sino de alertas (e não reabrir pulso de evento antigo)
    const backfill = !s.apiEventsBackfilled;
    const events: any[] = [], alerts: any[] = [];
    const found: { id: string; name: string }[] = [];
    const vehicles = { ...s.vehicles };
    const newFlagKeys: string[] = [];
    for (const e of raw) {
      const [type, desc, imei, objName, dt, lat, lng, , , speed] = e;
      const c = classify(type, desc);
      if (!c) continue;
      const key = `rt:${imei}:${dt}:${type}`;
      const ts = parseUTC(dt);
      const assetId = assetIdFor(imei);
      const drv = driverOf(objName);
      if (drv) found.push(drv);
      const pos = [+lat, +lng];
      if (c.rank && !seen.has(key)) events.push({ id: key, ts, assetId, driverId: drv?.id, pos, type: c.rank, value: c.rank === 'excesso_velocidade' ? Math.round(+speed) : null, source: 'rastreador', desc });
      if (c.alert && !seen.has('al:' + key)) alerts.push({ id: 'al:' + key, ts, assetId, title: desc, detail: `${String(objName).replace('|', ' · ')} · ${Math.round(+speed)} km/h`, priority: c.alert, read: backfill, source: 'rastreador' });
      if (c.flag && !backfill && !flagSeen.has(key) && vehicles[assetId]) {
        vehicles[assetId] = { ...vehicles[assetId], [c.flag]: true };
        newFlagKeys.push(key);
        if (!toClear.some((x) => x.assetId === assetId && x.field === c.flag)) toClear.push({ assetId, field: c.flag });
      }
    }
    const cut = Date.now() - KEEP_DAYS * DAY_MS;
    const keep = (x: any) => !String(x.id).includes('rt:') || x.ts >= cut;
    return {
      events: [...s.events.filter(keep), ...events].sort((a, b) => a.ts - b.ts),
      alerts: [...s.alerts.filter(keep), ...alerts].sort((a, b) => a.ts - b.ts),
      drivers: addDrivers(s.drivers, found),
      vehicles,
      flagEventsSeen: [...flagSeen, ...newFlagKeys].slice(-500),
      apiEventsBackfilled: true,
    };
  });
  for (const { assetId, field } of toClear) {
    setTimeout(() => useStore.getState().patch((s: any) => (s.vehicles[assetId] ? { vehicles: { ...s.vehicles, [assetId]: { ...s.vehicles[assetId], [field]: false } } } : {})), FLAG_PULSE_MS);
  }
}

// Percurso para o replay, no mesmo formato do histórico local: [ts, lat, lng, velocidade, ignição]
export async function fetchRoute(imei: string, from: number, to: number) {
  const r = await apiCall(`OBJECT_GET_ROUTE,${imei},${toUTC(from)},${toUTC(to)},5`);
  return (r?.route || []).map((p: any) => [parseUTC(p[0]), +p[1], +p[2], +p[5] || 0, sensors(p[6]).ignition ? 1 : 0]);
}

export const RASTREIO_ON = import.meta.env.VITE_RASTREIO_ON === 'true';

const CMD_POLL_MS = 5000;
const CMD_POLL_TRIES = 8; // ~40 s de espera por entrega ao rastreador antes de marcar "sem confirmação"

// Envia um comando a um veículo real (RELAY, BUZZER, comando livre...) pelo GPRS do próprio rastreador, e
// atualiza o status desse comando (já criado por sendCommand, em store.ts) com a resposta de verdade.
// Testado contra a API real (22/10/2026): OBJECT_GET_CMDS não devolve histórico de execução, e sim a FILA de
// comandos ainda não entregues ao rastreador — formato [["id","ascii","PAYLOAD"], ...]. O comando enviado
// aparece nessa fila enquanto o rastreador não abre sessão para recebê-lo, e some assim que é entregue.
// "Confirmado" aqui significa "entregue ao rastreador" (saiu da fila depois de ter aparecido nela) — a API não
// tem um canal de confirmação de execução de verdade (ex.: o relé realmente abriu). Para bloqueio/desbloqueio,
// o sinal mais forte disponível continua sendo a próxima posição do rastreador (USER_GET_OBJECTS) refletindo o
// efeito esperado (parado, sem ignição) — isso fica para quem revisar o painel do veículo, não é automático aqui.
export async function sendRealCommand(cmdId: string, assetId: string, imei: string, name: string, payload: string, kind: string) {
  const setStatus = (status: string) => useStore.getState().patch((s: any) => ({ commands: s.commands.map((c: any) => (c.id === cmdId ? { ...c, status: { ...c.status, [assetId]: status } } : c)) }));
  try {
    await apiCall(`OBJECT_CMD_GPRS,${imei},${name},ASCII,"${payload}"`); // apiCall já codifica a cmd inteira; codificar o nome aqui também quebraria nomes com espaço
  } catch {
    setStatus('pendente'); // nem chegou a sair: tratar igual a "sem comunicação com o rastreador"
    return;
  }
  const queued = (list: any[]) => list.some((c) => Array.isArray(c) && c[2] === payload);
  let sawQueued = false;
  for (let i = 0; i < CMD_POLL_TRIES; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 1500 : CMD_POLL_MS)); // 1ª checagem rápida: pega o comando ainda na fila antes de ser entregue
    try {
      const r = await apiCall(`OBJECT_GET_CMDS,${imei}`);
      const list: any[] = Array.isArray(r) ? r : [];
      if (queued(list)) { sawQueued = true; continue; } // ainda não entregue: espera mais
      if (!sawQueued) continue; // nunca visto na fila ainda — pode só não ter chegado a tempo da 1ª checagem; tenta de novo
      useStore.getState().patch((s: any) => {
        const v = s.vehicles[assetId];
        const vehicles = v && kind === 'bloqueio' ? { ...s.vehicles, [assetId]: { ...v, blocked: true } } : v && kind === 'desbloqueio' ? { ...s.vehicles, [assetId]: { ...v, blocked: false } } : s.vehicles;
        return { vehicles, commands: s.commands.map((c: any) => (c.id === cmdId ? { ...c, status: { ...c.status, [assetId]: 'confirmado' } } : c)) };
      });
      return;
    } catch { /* tenta de novo na próxima volta */ }
  }
  setStatus('pendente'); // nunca saiu da fila (ou nunca foi vista nela) dentro do prazo — não presumir sucesso
}

// Remove do navegador tudo que veio da API (veículos rt_, motoristas rd_, eventos/alertas rt:), sem tocar no que é local.
export function purgeApiData() {
  const fromApi = (id: any) => /^(rt_|rd_)/.test(String(id || ''));
  useStore.getState().patch((s: any) => {
    if (!s.assets.some((a: any) => fromApi(a.id)) && !s.events.some((e: any) => String(e.id).includes('rt:'))) return {};
    const drop = (rec: Record<string, any>) => Object.fromEntries(Object.entries(rec || {}).filter(([k]) => !fromApi(k)));
    return {
      assets: s.assets.filter((a: any) => !fromApi(a.id)),
      vehicles: drop(s.vehicles),
      history: drop(s.history),
      drivers: s.drivers.filter((d: any) => !fromApi(d.id)),
      groups: s.groups.filter((g: any) => g.id !== LIVE_GROUP.id),
      events: s.events.filter((e: any) => !String(e.id).includes('rt:') && !fromApi(e.assetId) && !fromApi(e.driverId)),
      alerts: s.alerts.filter((a: any) => !String(a.id).includes('rt:') && !fromApi(a.assetId)),
      apiEventsBackfilled: false,
      flagEventsSeen: [],
    };
  });
}

export function useRastreioSync() {
  useEffect(() => {
    if (!RASTREIO_ON) { purgeApiData(); return; }
    const evs = () => syncEvents().catch((e) => useRastreio.setState({ status: 'erro', error: 'Eventos: ' + (e.message || e) }));
    syncObjects().then(evs);
    const t = setInterval(syncObjects, POLL_MS);
    const te = setInterval(evs, EVENTS_POLL_MS);
    return () => { clearInterval(t); clearInterval(te); };
  }, []);
}
