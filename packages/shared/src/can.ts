// Telemetria CAN: leitura dos arquivos exportados do rastreador e cálculo do relatório.
// Regras aprendidas com a planilha de referência (OVOS TAMAGO, dez/2023):
//   ODO em metros · HRMT em minutos de motor · TFL (consumo total) em décimos de litro · NFL = nível %
//   TENG = temperatura do motor (°C) · APOS = pedal (%) · GEAR = marcha (N = neutro) · TRBP = turbo
//   VPWR = tensão ×10 com sufixo de checksum (ex.: "281]42" = 28,1 V) · lat/long inteiros sem ponto decimal.
// No Supabase o mesmo cálculo é feito por fn_can_report.

export interface CanSample { plate: string; ts: number; lat: number | null; lng: number | null; odo: number | null; hrmt: number | null; speed: number | null; rpm: number | null; tfl: number | null; fuelPct: number | null; oil: number | null; temp: number | null; park: number | null; pedal: number | null; gear: string | null; turbo: number | null; volt: number | null }
export interface CanEvent { plate: string; ts: number; lat: number | null; lng: number | null; code: string; value: number | null }

export const CAN_EVENT_LABELS: Record<string, string> = {
  ACP: 'Aceleração brusca', ACN: 'Frenagem brusca', VMX_IN: 'Velocidade máxima excedida', VMX_OUT: 'Velocidade normalizada',
  VCH_IN: 'Velocidade máx. com chuva excedida', VCH_OUT: 'Velocidade com chuva normalizada', RPX_IN: 'Excesso de RPM', RPX_OUT: 'RPM normalizado',
  OCS_IN: 'Início de motor ocioso', OCS_OUT: 'Fim de motor ocioso', BGL_IN: 'Início de banguela', BGL_OUT: 'Fim de banguela',
};
// código do evento do rastreador → evento do ranking da plataforma
export const CAN_EVENT_TO_RANK: Record<string, string> = { ACP: 'aceleracao_brusca', ACN: 'frenagem_brusca', VMX_IN: 'excesso_velocidade', VCH_IN: 'excesso_velocidade', RPX_IN: 'rpm_excessivo', OCS_IN: 'ociosidade', BGL_IN: 'banguela' };

export interface CanSettings { speedLimit: number; idleRpmMax: number; greenMax: number; yellowMax: number; coastMinSpeed: number; kickdownPedal: number; hotTemp: number; idleEpisodeMin: number; debounceSec: number }
export const DEFAULT_CAN_SETTINGS: CanSettings = { speedLimit: 80, idleRpmMax: 900, greenMax: 1600, yellowMax: 2100, coastMinSpeed: 20, kickdownPedal: 90, hotTemp: 100, idleEpisodeMin: 5, debounceSec: 5 };

// ---------- leitura ----------
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^data ras (vei|eve) /, '').trim();
const COLS: Record<keyof Omit<CanSample, 'gear'> | 'gear', string[]> = {
  plate: ['placa', 'veiculo'], ts: ['data gps'], lat: ['latitude'], lng: ['longitude'], odo: ['odometro'], hrmt: ['horimetro', 'hrmt'], speed: ['velocidade'], rpm: ['rpm'],
  tfl: ['comsumo total', 'consumo total', 'combustivel total'], fuelPct: ['combustivel %'], oil: ['pressao do oleo'], temp: ['temperatura do motor', 'temperatura do oleo'],
  park: ['freio estacionario', 'freio de estacionamento'], pedal: ['pedal do acelerador', 'posicao do pedal de acelerador'], gear: ['marcha atual'], turbo: ['pressao do tubo', 'pressao no turbo'], volt: ['voltagem'],
};
export function mapHeader(header: any[]) {
  const h = header.map(norm);
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) { const i = h.findIndex((x) => names.includes(x)); if (i >= 0) idx[k] = i; }
  return idx;
}
const stripPrefix = (v: any) => (typeof v === 'string' ? v.replace(/^\s*[A-Za-z]*h?:/, '').trim() : v);
function toNum(v: any): number | null {
  if (v == null || v === '' || v === '-') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = stripPrefix(v).split(']')[0].replace(',', '.');
  const n = Number(s);
  return s !== '' && isFinite(n) ? n : null;
}
function toTs(v: any): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v > 1e11 ? v : Math.round((v - 25569) * 86400000 + new Date().getTimezoneOffset() * 60000); // serial do Excel
  const m = String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
  const t = new Date(String(v).replace(' ', 'T')).getTime();
  return isNaN(t) ? null : t;
}
// coordenada exportada sem ponto decimal: escolhe onde vai a vírgula pela faixa plausível e pela continuidade
function fixCoord(v: number | null, kind: 'lat' | 'lng', prev: number | null): number | null {
  if (v == null) return null;
  if (Math.abs(v) <= (kind === 'lat' ? 90 : 180)) return v;
  const sign = v < 0 ? -1 : 1; const digits = String(Math.abs(Math.round(v)));
  const cands = [1, 2, 3].map((k) => sign * Number(digits.slice(0, k) + '.' + digits.slice(k))).filter((x) => Math.abs(x) <= (kind === 'lat' ? 90 : 180));
  if (prev != null) return cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0] ?? null;
  const pref = cands.filter((x) => (kind === 'lat' ? Math.abs(x) <= 34 : Math.abs(x) >= 28 && Math.abs(x) <= 74));
  return (pref.length ? pref[pref.length - 1] : cands[cands.length - 1]) ?? null;
}

export function parseSamples(rows: any[][]): { samples: CanSample[]; columns: string[]; skipped: number } {
  const idx = mapHeader(rows[0] || []);
  if (idx.plate == null || idx.ts == null) throw new Error('Não encontrei as colunas de placa e data GPS. Use o arquivo de dados do rastreador (com Placa, Data GPS, Odômetro, RPM…).');
  const out: CanSample[] = []; let skipped = 0;
  const prev: Record<string, { lat: number | null; lng: number | null }> = {};
  const g = (r: any[], k: string) => (idx[k] == null ? null : r[idx[k]]);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const plate = String(g(r, 'plate') || '').trim(); const ts = toTs(g(r, 'ts'));
    if (!plate || ts == null) { skipped++; continue; }
    const p = (prev[plate] ||= { lat: null, lng: null });
    const lat = fixCoord(toNum(g(r, 'lat')), 'lat', p.lat), lng = fixCoord(toNum(g(r, 'lng')), 'lng', p.lng);
    if (lat != null) p.lat = lat; if (lng != null) p.lng = lng;
    const rawV = g(r, 'volt'); let volt = toNum(rawV);
    if (volt != null && (/VPWR/i.test(String(rawV)) || volt > 60)) volt = volt / 10;
    const gr = stripPrefix(g(r, 'gear')); const gearS = gr == null || gr === '' || gr === '-' ? null : String(gr).toUpperCase();
    const gear = gearS === 'N' ? 'N' : gearS && /^\d{1,2}$/.test(gearS) && +gearS <= 20 ? gearS : null;
    out.push({ plate, ts, lat, lng, odo: toNum(g(r, 'odo')), hrmt: toNum(g(r, 'hrmt')), speed: toNum(g(r, 'speed')), rpm: toNum(g(r, 'rpm')), tfl: toNum(g(r, 'tfl')), fuelPct: toNum(g(r, 'fuelPct')), oil: toNum(g(r, 'oil')), temp: toNum(g(r, 'temp')), park: toNum(g(r, 'park')), pedal: toNum(g(r, 'pedal')), gear, turbo: toNum(g(r, 'turbo')), volt });
  }
  out.sort((a, b) => (a.plate === b.plate ? a.ts - b.ts : a.plate.localeCompare(b.plate)));
  return { samples: out, columns: Object.keys(idx), skipped };
}

export function parseEvents(rows: any[][]): CanEvent[] {
  const h = (rows[0] || []).map(norm);
  const ip = h.findIndex((x) => ['placa', 'veiculo'].includes(x)), it = h.indexOf('data gps'), ic = h.indexOf('evento'), iv = h.indexOf('valores');
  const ila = h.indexOf('latitude'), ilo = h.indexOf('longitude');
  if (ip < 0 || it < 0 || ic < 0) throw new Error('Arquivo de eventos sem as colunas Placa, Data GPS e Evento (sigla).');
  const out: CanEvent[] = [];
  for (const r of rows.slice(1)) { const ts = toTs(r[it]); const code = String(r[ic] || '').trim(); if (!ts || !code) continue; out.push({ plate: String(r[ip]).trim(), ts, code, value: toNum(r[iv]), lat: fixCoord(toNum(r[ila]), 'lat', null), lng: fixCoord(toNum(r[ilo]), 'lng', null) }); }
  return out.sort((a, b) => a.ts - b.ts);
}

// ---------- cálculo ----------
export interface CanDay { day: string; km: number; liters: number; engineH: number; idleH: number; idleL: number; movingH: number; events: number }
export interface CanVehicle {
  plate: string; from: number; to: number; samples: number; km: number; liters: number; kmL: number | null; lph: number | null;
  engineH: number; engineHByHrmt: number; idleH: number; idleL: number; idlePct: number | null; movingH: number; avgSpeed: number | null; maxSpeed: number;
  overH: number; overKm: number; overEpisodes: number; coastH: number; coastKm: number; kickdownH: number; parkMovingEpisodes: number;
  rpmBands: { lenta: number; verde: number; amarela: number; vermelha: number }; maxTemp: number | null; hotH: number; maxTurbo: number | null; minVolt: number | null;
  idleEpisodes: number; days: CanDay[]; events: Record<string, number>; eventsPer100: number | null; quality: { gaps: number; gapH: number; badOdo: number; invalid: Record<string, number>; noReading: string[] };
}
export interface CanReport { from: number; to: number; settings: CanSettings; vehicles: CanVehicle[]; events: CanEvent[] }

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function computeReport(samples: CanSample[], events: CanEvent[], from: number, to: number, cfg: CanSettings = DEFAULT_CAN_SETTINGS, plates?: string[]): CanReport {
  const byPlate: Record<string, CanSample[]> = {};
  for (const s of samples) if (s.ts >= from && s.ts <= to && (!plates || plates.includes(s.plate))) (byPlate[s.plate] ||= []).push(s);
  // eventos do rastreador sem repetição: mesma sigla dentro de debounceSec conta uma vez
  const evs: CanEvent[] = []; const lastEv: Record<string, number> = {};
  for (const e of events) { if (e.ts < from || e.ts > to || (plates && !plates.includes(e.plate))) continue; const k = e.plate + e.code; const prev = lastEv[k]; lastEv[k] = e.ts; if (prev != null && e.ts - prev < cfg.debounceSec * 1000) continue; evs.push(e); } // repetição = mesma sigla a menos de debounceSec da anterior
  const vehicles: CanVehicle[] = [];
  for (const [plate, arr] of Object.entries(byPlate)) {
    const v: CanVehicle = { plate, from: arr[0].ts, to: arr[arr.length - 1].ts, samples: arr.length, km: 0, liters: 0, kmL: null, lph: null, engineH: 0, engineHByHrmt: 0, idleH: 0, idleL: 0, idlePct: null, movingH: 0, avgSpeed: null, maxSpeed: 0, overH: 0, overKm: 0, overEpisodes: 0, coastH: 0, coastKm: 0, kickdownH: 0, parkMovingEpisodes: 0, rpmBands: { lenta: 0, verde: 0, amarela: 0, vermelha: 0 }, maxTemp: null, hotH: 0, maxTurbo: null, minVolt: null, idleEpisodes: 0, days: [], events: {}, eventsPer100: null, quality: { gaps: 0, gapH: 0, badOdo: 0, invalid: {}, noReading: [] } };
    const days: Record<string, CanDay> = {};
    const fields: (keyof CanSample)[] = ['odo', 'hrmt', 'speed', 'rpm', 'tfl', 'fuelPct', 'oil', 'temp', 'park', 'pedal', 'gear', 'turbo', 'volt'];
    for (const f of fields) { const vals = arr.map((s) => s[f]).filter((x) => x != null); v.quality.invalid[f] = 1 - vals.length / arr.length; if (vals.length && new Set(vals).size === 1 && ['oil', 'turbo', 'temp', 'fuelPct'].includes(f as string)) v.quality.noReading.push(f as string); }
    let overRun = 0, parkMov = false, idleRun = 0;
    let lo: number | null = null, loT = 0, lf: number | null = null, lfT = 0, lh: number | null = null, lhT = 0;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i], n = arr[i + 1];
      const gap = n ? (n.ts - s.ts) / 1000 : 0;
      const dt = gap > 0 && gap <= 120 ? gap : 0;
      if (gap > 600) { v.quality.gaps++; v.quality.gapH += gap / 3600; }
      const d = (days[dayKey(s.ts)] ||= { day: dayKey(s.ts), km: 0, liters: 0, engineH: 0, idleH: 0, idleL: 0, movingH: 0, events: 0 });
      // totalizadores (odômetro, consumo, horímetro): diferença para a última leitura válida;
      // saltos impossíveis são descartados e não viram referência (mesma regra do fn_can_report)
      let dKm = 0, dL = 0;
      if (s.odo != null) { if (lo == null) { lo = s.odo; loT = s.ts; } else { const dd = s.odo - lo, el = Math.max(1, (s.ts - loT) / 1000); if (dd >= 0 && dd <= Math.max(200, el * 45)) { dKm = dd / 1000; lo = s.odo; loT = s.ts; } else v.quality.badOdo++; } }
      if (s.tfl != null) { if (lf == null) { lf = s.tfl; lfT = s.ts; } else { const dd = s.tfl - lf, el = Math.max(1, (s.ts - lfT) / 1000); if (dd >= 0 && dd <= Math.max(10, (el / 60) * 15)) { dL = dd / 10; lf = s.tfl; lfT = s.ts; } } }
      if (s.hrmt != null) { if (lh == null) { lh = s.hrmt; lhT = s.ts; } else { const dd = s.hrmt - lh, el = Math.max(1, (s.ts - lhT) / 1000); if (dd >= 0 && dd <= Math.max(5, (el / 60) * 2)) { v.engineHByHrmt += dd / 60; lh = s.hrmt; lhT = s.ts; } } }
      v.km += dKm; v.liters += dL; d.km += dKm; d.liters += dL;
      const on = (s.rpm ?? 0) > 300, sp = s.speed ?? 0;
      const idle = on && sp === 0;
      if (on) { v.engineH += dt / 3600; d.engineH += dt / 3600; const r = s.rpm!; const b = r <= cfg.idleRpmMax ? 'lenta' : r <= cfg.greenMax ? 'verde' : r <= cfg.yellowMax ? 'amarela' : 'vermelha'; v.rpmBands[b] += dt / 3600; }
      if (idle) { v.idleH += dt / 3600; d.idleH += dt / 3600; v.idleL += dL; d.idleL += dL; idleRun += dt; } else { if (idleRun >= cfg.idleEpisodeMin * 60) v.idleEpisodes++; idleRun = 0; }
      if (sp > 0) { v.movingH += dt / 3600; d.movingH += dt / 3600; }
      v.maxSpeed = Math.max(v.maxSpeed, sp);
      if (sp > cfg.speedLimit) { v.overH += dt / 3600; v.overKm += dKm; if (overRun < 10 && overRun + dt >= 10) v.overEpisodes++; overRun += dt; } else overRun = 0; // episódio = 10 s ou mais acima do limite
      if (s.gear === 'N' && sp >= cfg.coastMinSpeed) { v.coastH += dt / 3600; v.coastKm += dKm; }
      if ((s.pedal ?? 0) >= cfg.kickdownPedal) v.kickdownH += dt / 3600;
      if (s.park === 1 && sp > 5) { if (!parkMov) v.parkMovingEpisodes++; parkMov = true; } else parkMov = false;
      if (s.temp != null && !v.quality.noReading.includes('temp')) { v.maxTemp = Math.max(v.maxTemp ?? -99, s.temp); if (s.temp > cfg.hotTemp) v.hotH += dt / 3600; }
      if (s.turbo != null) v.maxTurbo = Math.max(v.maxTurbo ?? 0, s.turbo);
      if (s.volt != null && on && s.volt > 5) v.minVolt = Math.min(v.minVolt ?? 99, s.volt);
    }
    if (idleRun >= cfg.idleEpisodeMin * 60) v.idleEpisodes++;
    v.kmL = v.liters > 0 ? v.km / v.liters : null;
    v.lph = v.engineH > 0 ? v.liters / v.engineH : null;
    v.idlePct = v.engineH > 0 ? v.idleH / v.engineH : null;
    v.avgSpeed = v.movingH > 0 ? v.km / v.movingH : null;
    for (const e of evs.filter((x) => x.plate === plate)) { v.events[e.code] = (v.events[e.code] || 0) + 1; const dd = days[dayKey(e.ts)]; if (dd) dd.events++; }
    const evCount = Object.entries(v.events).filter(([c]) => !c.endsWith('_OUT')).reduce((a, [, n]) => a + n, 0);
    v.eventsPer100 = v.km > 0 ? (evCount / v.km) * 100 : null;
    v.days = Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
    vehicles.push(v);
  }
  return { from, to, settings: cfg, vehicles: vehicles.sort((a, b) => a.plate.localeCompare(b.plate)), events: evs };
}

// leitor de CSV simples (aspas, vírgula ou ponto e vírgula)
export function parseCsv(text: string): string[][] {
  const first = text.slice(0, text.indexOf('\n'));
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
