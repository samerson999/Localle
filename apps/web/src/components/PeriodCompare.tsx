// Seletor de período com comparação ("1 jan–17 out" vs "1 jan–17 out 2025"), no lugar dos <select> de período.
import { DAY } from '@localle/shared/utils';
import { PeriodButton } from './story';
import { Input, Pills } from './ui';

export type CompareMode = 'anterior' | 'ano_anterior' | 'nenhum' | 'custom';
export interface PeriodValue { preset: string; from: string; to: string; mode: CompareMode; bFrom?: string; bTo?: string }
export interface Preset { key: string; label: string; range: () => [number, number] }

const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const start = (d: string) => new Date(d + 'T00:00').getTime();
const end = (d: string) => new Date(d + 'T23:59:59').getTime();
const shiftYear = (t: number, n: number) => { const d = new Date(t); d.setFullYear(d.getFullYear() + n); return d.getTime(); };

// presets padrão das telas de BI (períodos em andamento vão até hoje)
export const BI_PRESETS: Preset[] = [
  { key: 'mes', label: 'Este mês', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1).getTime(), Date.now()]; } },
  { key: 'mes_passado', label: 'Mês passado', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1).getTime(), new Date(n.getFullYear(), n.getMonth(), 1).getTime() - 1]; } },
  { key: '90d', label: 'Últimos 90 dias', range: () => [start(iso(Date.now() - 89 * DAY)), Date.now()] },
  { key: 'ano', label: 'Este ano', range: () => [new Date(new Date().getFullYear(), 0, 1).getTime(), Date.now()] },
  { key: '12m', label: 'Últimos 12 meses', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 11, 1).getTime(), Date.now()]; } },
];

export function presetValue(p: Preset, mode: CompareMode = 'anterior'): PeriodValue { const [a, b] = p.range(); return { preset: p.key, from: iso(a), to: iso(b), mode }; }

// Faixas A e B em ms. Período em andamento é comparado só até o mesmo ponto (ex.: 1 jan–17 out × 1 jan–17 out).
export function periodRanges(v: PeriodValue): { a: [number, number]; b: [number, number] | null } {
  const a: [number, number] = [start(v.from), Math.min(end(v.to), Date.now())];
  if (v.mode === 'nenhum') return { a, b: null };
  if (v.mode === 'custom') return { a, b: v.bFrom && v.bTo ? [start(v.bFrom), end(v.bTo)] : null };
  if (v.mode === 'ano_anterior') return { a, b: [shiftYear(a[0], -1), shiftYear(a[1], -1)] };
  const span = a[1] - a[0];
  return { a, b: [a[0] - span - 1000, a[0] - 1000] };
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rangeText(r: [number, number], withYear = false) {
  const a = new Date(r[0]), b = new Date(r[1]);
  const y = withYear || a.getFullYear() !== new Date().getFullYear() || a.getFullYear() !== b.getFullYear();
  const left = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${a.getDate()}` : `${a.getDate()} ${MES[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ''}`;
  return `${left}–${b.getDate()} ${MES[b.getMonth()]}${y ? ` ${b.getFullYear()}` : ''}`;
}

export function PeriodCompare({ value, onChange, presets = BI_PRESETS, modes = ['anterior', 'ano_anterior', 'nenhum', 'custom'] }: { value: PeriodValue; onChange: (v: PeriodValue) => void; presets?: Preset[]; modes?: CompareMode[] }) {
  const { a, b } = periodRanges(value);
  const MODE_LABEL: Record<CompareMode, string> = { anterior: 'Período anterior', ano_anterior: 'Mesmo período do ano anterior', nenhum: 'Não comparar', custom: 'Outro período' };
  return (
    <PeriodButton label={rangeText(a)} compare={b ? rangeText(b) : undefined}>
      {() => (
        <div className="flex flex-col gap-4 w-[320px] max-w-[80vw]">
          <div>
            <p className="text-caption text-ink-2 mb-2">Período</p>
            <Pills value={value.preset} options={[...presets.map((p) => ({ key: p.key, label: p.label })), { key: 'custom', label: 'Personalizado' }]}
              onChange={(k) => { const p = presets.find((x) => x.key === k); onChange(p ? { ...presetValue(p, value.mode), bFrom: value.bFrom, bTo: value.bTo } : { ...value, preset: 'custom' }); }} />
            {value.preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-stack">
                <Input type="date" aria-label="De" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
                <Input type="date" aria-label="Até" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <p className="text-caption text-ink-2 mb-2">Comparar com</p>
            <Pills value={value.mode} options={modes.map((m) => ({ key: m, label: MODE_LABEL[m] }))} onChange={(k) => onChange({ ...value, mode: k as CompareMode })} />
            {value.mode === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-stack">
                <Input type="date" aria-label="Comparar de" value={value.bFrom || ''} onChange={(e) => onChange({ ...value, bFrom: e.target.value })} />
                <Input type="date" aria-label="Comparar até" value={value.bTo || ''} onChange={(e) => onChange({ ...value, bTo: e.target.value })} />
              </div>
            )}
            {b && value.mode !== 'custom' && a[1] >= Date.now() - DAY && <p className="text-caption text-ink-2 mt-2">Período em andamento: a comparação vai até o mesmo ponto.</p>}
          </div>
        </div>
      )}
    </PeriodButton>
  );
}
