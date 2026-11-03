// Ritmo de gasto no mês contra um teto (card "Ritmo do mês" do BI de combustível).
// O ritmo ideal reparte o teto igualmente pelos dias do mês; a situação de cada dia compara o acumulado com ele.
export type PaceStatus = 'under' | 'approaching' | 'over' | 'exceeded';

export const PACE_LABEL: Record<PaceStatus, string> = { under: 'Dentro do ritmo', approaching: 'Pouco acima do ritmo', over: 'Acima do ritmo', exceeded: 'Passou do teto' };

/** acumulado até o dia × ideal do mesmo dia: até o ideal, dentro; até 20% acima, pouco acima; depois, acima; no teto ou além, passou */
export function paceStatus(spent: number, ideal: number, cap: number): PaceStatus {
  if (cap > 0 && spent >= cap) return 'exceeded';
  if (ideal <= 0 || spent <= ideal) return 'under';
  return (spent - ideal) / ideal <= 0.2 ? 'approaching' : 'over';
}

/** ideal acumulado no dia `day` (1 = primeiro dia do mês) */
export const idealAt = (cap: number, day: number, days: number) => (days > 0 ? (cap * day) / days : 0);

/** acumulado por dia do mês corrente, do dia 1 até hoje (horário local) */
export function monthPace(items: { ts: number; total?: number }[], now = Date.now()) {
  const d = new Date(now), year = d.getFullYear(), month = d.getMonth();
  const m0 = new Date(year, month, 1).getTime(), days = new Date(year, month + 1, 0).getDate(), today = d.getDate();
  const perDay = Array<number>(today).fill(0);
  for (const f of items) if (f.ts >= m0 && f.ts <= now) perDay[new Date(f.ts).getDate() - 1] += f.total || 0;
  let acc = 0;
  return { year, month, days, today, cum: perDay.map((v) => (acc += v)) };
}
