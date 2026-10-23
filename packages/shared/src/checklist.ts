// Checklist: regras compartilhadas (modo navegador) e fonte de dados local/Supabase.
import { DAY, startOfDay, toInputD } from './utils';

export const QTYPES: Record<string, string> = { sim_nao: 'Sim / não', nota: 'Nota', km: 'KM / odômetro', data: 'Data', datahora: 'Data e hora (carimbo automático)', texto: 'Texto livre', foto: 'Foto', multipla: 'Múltipla escolha' };
export const SCHED: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', ciclo: 'A cada ciclo', datas: 'Datas do calendário' };
export const ROLES: Record<string, string> = { motorista: 'Motorista', chefe_patio: 'Chefe de pátio', porteiro: 'Porteiro', mecanico: 'Mecânico', outro: 'Outro' };
export const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function people(s: any) {
  return [...s.drivers.map((d: any) => ({ id: d.id, name: d.name, role: 'motorista', cnhCat: d.cnhCat })), ...(s.staff || []).map((p: any) => ({ ...p }))];
}
export function groupMembers(s: any, g: any) {
  return people(s).filter((p: any) => (g.ruleCnh || []).includes(p.cnhCat) || (g.ruleRoles || []).includes(p.role) || (g.memberIds || []).includes(p.id)).map((p: any) => p.id);
}
export function targetsOf(t: any) { return t.targets || { groupIds: [], personIds: t.driverIds || [] }; }
export function respondents(s: any, t: any, groups: any[]) {
  const tg = targetsOf(t);
  const out = new Map<string, string | null>();
  for (const gid of tg.groupIds || []) { const g = groups.find((x: any) => x.id === gid); if (g) for (const pid of groupMembers(s, g)) if (!out.has(pid)) out.set(pid, gid); }
  for (const pid of tg.personIds || []) if (!out.has(pid)) out.set(pid, null);
  return out; // pessoa → grupo de origem
}
export const personOf = (r: any) => r.personId ?? r.driverId;

export function occurrences(t: any, from: number, to: number): [number, number][] {
  const out: [number, number][] = []; const sc = t.schedule;
  for (let d = startOfDay(from); d <= to; d += DAY) {
    const dt = new Date(d);
    let hit = false;
    if (sc.type === 'diario') hit = sc.sundays || dt.getDay() !== 0;
    if (sc.type === 'semanal') hit = dt.getDay() === (sc.weekday ?? 1);
    if (sc.type === 'mensal') hit = dt.getDate() === (sc.monthDay ?? 1);
    if (sc.type === 'ciclo') hit = d >= startOfDay(sc.startDate) && Math.round((d - startOfDay(sc.startDate)) / DAY) % (sc.cycleDays || 30) === 0;
    if (sc.type === 'datas') hit = (sc.dates || []).includes(toInputD(d));
    if (hit) out.push([d, 0]);
  }
  out.forEach((o, i) => (o[1] = sc.type === 'diario' ? o[0] + DAY : out[i + 1]?.[0] ?? o[0] + (sc.type === 'semanal' ? 7 : sc.type === 'mensal' ? 31 : sc.type === 'ciclo' ? sc.cycleDays : 7) * DAY));
  return out;
}

// respostas "não conforme": definidas pergunta a pergunta no modelo (sem dedução por regra fixa)
export const flagValuesOf = (q: any): string[] => q.flagValues ?? [];
export function isFlagged(q: any, v: any) {
  if (v == null || v === '') return false;
  if (flagValuesOf(q).includes(v)) return true;
  return q.type === 'nota' && q.flagBelow != null && +v <= q.flagBelow;
}

export interface ChecklistBi {
  expected: number; done: number; responses: number; avg_fill_s: number | null; assets_checked: number; assets_flagged: number;
  by_person: { person_id: string; name: string; role: string; expected: number; done: number; adherence: number | null; avg_fill_s: number | null }[];
  by_group: { group_id: string; name: string; expected: number; done: number; adherence: number | null }[];
  by_schedule: { schedule: string; expected: number; done: number; adherence: number | null }[];
  by_template: { template_id: string; name: string; schedule: string; expected: number; done: number; adherence: number | null; avg_fill_s: number | null }[];
  missing: { date: string; person: string; template: string }[];
  questions: { question_id: string; template: string; label: string; type: string; answers: number; flagged: number; flag_rate: number | null; avg: number | null; values: { value: string; qty: number }[] | null }[];
}

export function localBi(s: any, from: number, to: number): ChecklistBi {
  const t = Math.min(to, Date.now());
  const tpls = s.checklistTemplates.filter((x: any) => x.active);
  const groups = s.respondentGroups || [];
  const P = Object.fromEntries(people(s).map((p: any) => [p.id, p]));
  const exp: any[] = [];
  for (const tp of tpls) {
    const occ = occurrences(tp, from, t);
    const resp = s.checklistResponses.filter((r: any) => r.templateId === tp.id);
    for (const [pid, gid] of respondents(s, tp, groups)) for (const [a, b] of occ) {
      const r = resp.find((x: any) => personOf(x) === pid && x.finishedAt >= a && x.finishedAt < b);
      exp.push({ tp, pid, gid, a, r });
    }
  }
  const resp = s.checklistResponses.filter((r: any) => r.finishedAt >= from && r.finishedAt <= t && tpls.some((x: any) => x.id === r.templateId));
  const avg = (arr: any[]) => (arr.length ? Math.round(arr.reduce((x, r) => x + (r.finishedAt - r.startedAt) / 1000, 0) / arr.length) : null);
  const agg = (rows: any[]) => ({ expected: rows.length, done: rows.filter((x) => x.r).length, adherence: rows.length ? rows.filter((x) => x.r).length / rows.length : null });
  const by = (f: (x: any) => string) => exp.reduce((m: any, x) => ((m[f(x)] ||= []).push(x), m), {});
  const qs: any[] = [];
  for (const tp of tpls) for (const q of tp.questions.filter((q: any) => ['sim_nao', 'multipla', 'nota', 'foto', 'texto'].includes(q.type))) {
    const vals = resp.filter((r: any) => r.templateId === tp.id).map((r: any) => r.answers?.[q.id]).filter((a: any) => a && (a.value || a.photo));
    const counts: Record<string, number> = {};
    vals.forEach((a: any) => { if (['sim_nao', 'multipla', 'nota'].includes(q.type)) counts[a.value] = (counts[a.value] || 0) + 1; });
    const fl = vals.filter((a: any) => isFlagged(q, a.value)).length;
    const nums = vals.map((a: any) => +a.value).filter((x: number) => !isNaN(x));
    qs.push({ question_id: q.id, template: tp.name, label: q.label, type: q.type, answers: vals.length, flagged: fl, flag_rate: vals.length ? fl / vals.length : null, avg: q.type === 'nota' && nums.length ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : null, values: Object.keys(counts).length ? Object.entries(counts).map(([value, qty]) => ({ value, qty })).sort((a, b) => b.qty - a.qty) : null });
  }
  const flaggedAssets = new Set(resp.filter((r: any) => { const tp = tpls.find((x: any) => x.id === r.templateId); return tp?.questions.some((q: any) => isFlagged(q, r.answers?.[q.id]?.value)); }).map((r: any) => r.assetId).filter(Boolean));
  return {
    expected: exp.length, done: exp.filter((x) => x.r).length, responses: resp.length, avg_fill_s: avg(resp),
    assets_checked: new Set(resp.map((r: any) => r.assetId).filter(Boolean)).size, assets_flagged: flaggedAssets.size,
    by_person: Object.entries(by((x) => x.pid)).map(([pid, rows]: any) => ({ person_id: pid, name: P[pid]?.name || pid, role: P[pid]?.role || '', ...agg(rows), avg_fill_s: avg(resp.filter((r: any) => personOf(r) === pid)) })).sort((a, b) => (a.adherence ?? 0) - (b.adherence ?? 0)),
    by_group: Object.entries(by((x) => x.gid || '')).filter(([g]) => g).map(([gid, rows]: any) => ({ group_id: gid, name: groups.find((g: any) => g.id === gid)?.name || gid, ...agg(rows) })),
    by_schedule: Object.entries(by((x) => x.tp.schedule.type)).map(([sc, rows]: any) => ({ schedule: sc, ...agg(rows) })),
    by_template: Object.entries(by((x) => x.tp.id)).map(([id, rows]: any) => ({ template_id: id, name: rows[0].tp.name, schedule: rows[0].tp.schedule.type, ...agg(rows), avg_fill_s: avg(resp.filter((r: any) => r.templateId === id)) })),
    missing: exp.filter((x) => !x.r).sort((a, b) => b.a - a.a).slice(0, 200).map((x) => ({ date: new Date(x.a).toISOString(), person: P[x.pid]?.name || x.pid, template: x.tp.name })),
    questions: qs.sort((a, b) => (b.flag_rate ?? -1) - (a.flag_rate ?? -1)),
  };
}

// validação do envio no modo navegador (no Supabase quem valida é fn_submit_checklist)
export function validateLocal(tpl: any, ans: any) {
  for (const q of tpl.questions) {
    const a = ans[q.id];
    if (q.type === 'datahora') continue;
    if (q.required && q.type !== 'foto' && !a?.value) return `Responda: "${q.label}".`;
    if ((q.type === 'foto' || q.requirePhoto) && q.required && !a?.photo) return `Envie a foto de "${q.label}".`;
    if (q.type === 'nota' && a?.value && (+a.value < 1 || +a.value > (q.scaleMax || 5))) return `A nota de "${q.label}" vai de 1 a ${q.scaleMax || 5}.`;
  }
  return '';
}
