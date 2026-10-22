// Telemetria CAN guardada no navegador (IndexedDB). No produto real o cálculo vai para o backend:
// fn_can_report e as tabelas can_* em docs/especificacao-sql/20261017210000_telemetria_can.sql.
import { create } from 'zustand';
import { CanSample, CanEvent, CanReport, CanSettings, DEFAULT_CAN_SETTINGS, computeReport, parseCsv, parseSamples, parseEvents } from './can';
import { idbGet, idbSet } from './idb';
import { useStore } from './store';
import { genCanHistory } from './canSim';

interface CanState { loaded: boolean; samples: CanSample[]; events: CanEvent[]; summary: { plates: string[]; from: number; to: number; samples: number; events: number } | null; progress: string; settings: CanSettings }
export const useCan = create<CanState>(() => ({ loaded: false, samples: [], events: [], summary: null, progress: '', settings: DEFAULT_CAN_SETTINGS }));

const summarize = (samples: CanSample[], events: CanEvent[]) => samples.length ? { plates: [...new Set(samples.map((s) => s.plate))].sort(), from: Math.min(...samples.map((s) => s.ts)), to: Math.max(...samples.map((s) => s.ts)), samples: samples.length, events: events.length } : null;

export async function loadCan() {
  // primeira vez: gera o histórico CAN da simulação (60 dias) para os veículos com CAN
  if (!(await idbGet<boolean>('can-sim-v3'))) { await seedSimulatedCan(); }
  const [samples = [], events = [], settings] = await Promise.all([idbGet<CanSample[]>('can-samples'), idbGet<CanEvent[]>('can-events'), idbGet<CanSettings>('can-settings')]);
  useCan.setState({ loaded: true, samples, events, summary: summarize(samples, events), settings: { ...DEFAULT_CAN_SETTINGS, ...(settings || {}) } });
}

// lê CSV ou uma aba de XLSX e devolve as linhas
export async function readRows(file: File, sheet?: string): Promise<{ rows: any[][]; sheets?: string[] }> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return { rows: parseCsv(await file.text()) };
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  if (!sheet) { const wb = XLSX.read(buf, { bookSheets: true }); if (wb.SheetNames.length > 1) return { rows: [], sheets: wb.SheetNames }; sheet = wb.SheetNames[0]; }
  const wb = XLSX.read(buf, { sheets: sheet, dense: true, cellDates: true });
  return { rows: XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null }) as any[][] };
}

export async function importRows(rows: any[][], _fileName: string) {
  const h = (rows[0] || []).map((x: any) => String(x || '').toLowerCase());
  const isEvents = h.some((x) => x.trim() === 'evento') && !h.some((x) => x.includes('rpm'));
  const st = useCan.getState();
  if (isEvents) {
    const evs = parseEvents(rows);
    const key = (e: CanEvent) => e.plate + e.ts + e.code; const seen = new Set(st.events.map(key));
    const all = [...st.events, ...evs.filter((e) => !seen.has(key(e)))].sort((a, b) => a.ts - b.ts);
    await idbSet('can-events', all); useCan.setState({ events: all, summary: summarize(st.samples, all) });
    return `${evs.length} eventos importados.`;
  }
  const { samples, skipped, columns } = parseSamples(rows);
  if (!columns.includes('rpm') && !columns.includes('odo')) throw new Error('O arquivo não tem colunas de telemetria CAN (odômetro, RPM, consumo…).');
  const plates = new Set(samples.map((s) => s.plate));
  const keep = st.samples.filter((s) => !plates.has(s.plate) || s.ts < samples[0].ts || s.ts > samples[samples.length - 1].ts);
  const all = [...keep, ...samples].sort((a, b) => (a.plate === b.plate ? a.ts - b.ts : a.plate.localeCompare(b.plate)));
  await idbSet('can-samples', all); useCan.setState({ samples: all, summary: summarize(all, st.events) });
  return `${samples.length.toLocaleString('pt-BR')} amostras de ${[...plates].join(', ')} importadas${skipped ? ` (${skipped} linhas sem placa ou data ignoradas)` : ''}.`;
}

export async function loadExample() {
  const files = ['telemetria-can-JAG-7E94.csv', 'telemetria-can-JBL-6C73.csv', 'eventos-can.csv'];
  const msgs: string[] = [];
  for (const f of files) { useCan.setState({ progress: `Lendo ${f}…` }); const t = await (await fetch(`/exemplos/${f}`)).text(); msgs.push(await importRows(parseCsv(t), f)); }
  useCan.setState({ progress: '' });
  return msgs.join(' ');
}

export async function clearCan() {
  await idbSet('can-samples', []); await idbSet('can-events', []);
  useCan.setState({ samples: [], events: [], summary: null });
}

export async function saveCanSettings(cfg: CanSettings) {
  useCan.setState({ settings: cfg });
  return idbSet('can-settings', cfg);
}

export async function canReport(from: number, to: number, plates: string[] | undefined, cfg: CanSettings): Promise<CanReport> {
  const st = useCan.getState();
  return computeReport(st.samples, st.events, from, to, cfg, plates);
}

// Dados CAN da simulação: substituem só as placas simuladas (arquivos importados de outras placas ficam)
export async function seedSimulatedCan() {
  const s = useStore.getState();
  const cars = s.assets.filter((a: any) => a.can && a.tracker);
  if (!cars.length) return 'Nenhum veículo da simulação lê CAN.';
  useCan.setState({ progress: 'Gerando 60 dias de telemetria da simulação…' });
  const { samples, events } = genCanHistory(cars, s.vehicles, 60);
  const plates = new Set(samples.map((x) => x.plate));
  const [old = [], oldEv = []] = await Promise.all([idbGet<CanSample[]>('can-samples'), idbGet<CanEvent[]>('can-events')]);
  const all = [...old.filter((x) => !plates.has(x.plate)), ...samples].sort((a, b) => (a.plate === b.plate ? a.ts - b.ts : a.plate.localeCompare(b.plate)));
  const allEv = [...oldEv.filter((x) => !plates.has(x.plate)), ...events].sort((a, b) => a.ts - b.ts);
  await Promise.all([idbSet('can-samples', all), idbSet('can-events', allEv), idbSet('can-sim-v3', true)]);
  useCan.setState({ samples: all, events: allEv, summary: summarize(all, allEv), progress: '' });
  return `${samples.length.toLocaleString('pt-BR')} amostras simuladas de ${[...plates].join(', ')}.`;
}
