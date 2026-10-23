import { Field, Input, Select } from './ui';
import { Period, MESES_LONGO } from '@localle/shared/utils';
export default function PeriodPicker({ value, onChange, label = 'Período' }: { value: Period; onChange: (p: Period) => void; label?: string }) {
  const years = [2025, 2026];
  const idxOpts = value.kind === 'mes' ? MESES_LONGO.map((m, i) => ({ value: String(i), label: m })) : value.kind === 'trimestre' ? [0, 1, 2, 3].map((i) => ({ value: String(i), label: `${i + 1}º trimestre` })) : value.kind === 'semestre' ? [0, 1].map((i) => ({ value: String(i), label: `${i + 1}º semestre` })) : [];
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <Field label={label}><Select className="w-36" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as any, idx: 0, from: value.from || '2026-01-01', to: value.to || '2026-10-15' })} options={[{ value: 'mes', label: 'Mês' }, { value: 'trimestre', label: 'Trimestre' }, { value: 'semestre', label: 'Semestre' }, { value: 'ano', label: 'Ano' }, { value: 'custom', label: 'Personalizado' }]} /></Field>
      {value.kind === 'custom' ? (
        <>
          <Field label="De"><Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
          <Field label="Até"><Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
        </>
      ) : (
        <>
          {idxOpts.length > 0 && <Field label=" "><Select className="w-40" aria-label="Qual" value={String(value.idx)} onChange={(e) => onChange({ ...value, idx: +e.target.value })} options={idxOpts} /></Field>}
          <Field label=" "><Select className="w-24" aria-label="Ano" value={String(value.year)} onChange={(e) => onChange({ ...value, year: +e.target.value })} options={years.map(String)} /></Field>
        </>
      )}
    </div>
  );
}
