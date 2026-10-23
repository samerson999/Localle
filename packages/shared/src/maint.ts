import { isOut } from './assetStatus';
import { assetKm } from './km';
import { DAY, uid } from './utils';

export const SERVICES: Record<string, string> = { oleo_motor: 'Troca de óleo do motor', freios: 'Sistema de freios', lubrificacao: 'Lubrificação', embreagem: 'Embreagem', pneus: 'Pneus', suspensao: 'Suspensão', eletrica: 'Elétrica', arrefecimento: 'Arrefecimento', outro: 'Outro' };
export const OS_STATUS: Record<string, { label: string; tone: string }> = {
  aberta: { label: 'Aberta', tone: 'blue' }, orcamento: { label: 'Em orçamento', tone: 'orange' }, aprovada: { label: 'Aprovada', tone: 'blue' },
  execucao: { label: 'Em execução', tone: 'orange' }, concluida: { label: 'Concluída', tone: 'green' }, cancelada: { label: 'Cancelada', tone: 'gray' },
};

// Prazo para uma preventiva vencida virar Crítica: parâmetros do Setup "manutencao.critico_apos_dias" e
// "manutencao.critico_apos_km" (camadas P R C, docs/PLANO-SETUP-ADMIN.md 3.4), com exceção por plano
// (plan.critDays / plan.critKm; vazio = herda). Único ponto desta regra no modo sem banco.
export const CRIT_DEFAULT = { days: 10, km: 1000 };
const inherit = (v: any, d: number) => (v === '' || v == null || isNaN(+v) ? d : +v);
export const critAfter = (plan: any) => ({ days: inherit(plan?.critDays, CRIT_DEFAULT.days), km: inherit(plan?.critKm, CRIT_DEFAULT.km) });

// Nível da preventiva: Alerta (passou do gatilho) → Crítico (passou do prazo de crítico, em dias ou km)
function planLevel(plan: any, leftKm: number | null, leftDays: number | null, nextDate: number | null) {
  const c = critAfter(plan);
  const critT = leftDays !== null && leftDays <= -c.days, critK = leftKm !== null && leftKm <= -c.km;
  const late = (leftKm !== null && leftKm <= 0) || (leftDays !== null && leftDays <= 0);
  return { level: critT || critK ? 'crit' : late ? 'alerta' : null, critSince: critT && nextDate ? nextDate + c.days * DAY : undefined } as { level: 'crit' | 'alerta' | null; critSince?: number };
}

export function planStatus(s: any, plan: any, assetId: string) {
  const asset = s.assets.find((a: any) => a.id === assetId);
  const hours = asset?.meter === 'horimetro';
  const cur = hours ? s.vehicles[assetId]?.hourmeter || 0 : assetKm(s, assetId);
  const done = s.workOrders.filter((w: any) => w.assetId === assetId && w.status === 'concluida' && w.services?.includes(plan.service)).sort((a: any, b: any) => (b.releasedAt || 0) - (a.releasedAt || 0));
  const last = done[0];
  const open = s.workOrders.find((w: any) => w.assetId === assetId && w.planId === plan.id && !['concluida', 'cancelada'].includes(w.status));
  const fu = s.fuelings.filter((f: any) => f.assetId === assetId && last && f.ts <= last.releasedAt);
  const lastKm = last?.odometerAt || (fu.length ? fu[fu.length - 1].odometer : 0);
  if (!last) return { asset, cur, hours, last, lastKm: 0, nextKm: null, nextDate: null, leftKm: null, leftDays: null, status: open ? 'os_aberta' : 'sem_historico', open, recalculated: false, level: null as 'crit' | 'alerta' | null, critSince: undefined as number | undefined };
  const useKm = plan.trigger !== 'tempo' && plan.kmInterval > 0;
  const useTime = plan.trigger !== 'km' && plan.daysInterval > 0;
  const nextKm = useKm ? lastKm + plan.kmInterval : null;
  const nextDate = useTime ? (last?.releasedAt || s.seededAt) + plan.daysInterval * DAY : null;
  const leftKm = nextKm !== null ? nextKm - cur : null;
  const leftDays = nextDate !== null ? Math.round((nextDate - Date.now()) / DAY) : null;
  const overdue = (leftKm !== null && leftKm <= 0) || (leftDays !== null && leftDays <= 0);
  const soon = (leftKm !== null && leftKm <= plan.advanceKm) || (leftDays !== null && leftDays <= plan.advanceDays);
  const status = open ? 'os_aberta' : overdue ? 'vencida' : soon ? 'proxima' : 'em_dia';
  return { asset, cur, hours, last, lastKm, nextKm, nextDate, leftKm, leftDays, status, open, recalculated: last?.type === 'corretiva', ...planLevel(plan, leftKm, leftDays, nextDate) };
}

export function generateDueOrders(s: any) {
  const add: any[] = [];
  let num = Math.max(1000, ...s.workOrders.map((w: any) => w.num || 0));
  for (const plan of s.plans) for (const aid of plan.assetIds) {
    if (isOut(s.assets.find((a: any) => a.id === aid))) continue; // vendido/baixado não gera OS
    const st = planStatus(s, plan, aid);
    if (st.status === 'vencida' || st.status === 'proxima') {
      add.push({ id: uid('os'), num: ++num, type: 'preventiva', assetId: aid, planId: plan.id, services: [plan.service], title: plan.name, description: `Gerada automaticamente pelo plano. Itens: ${plan.items}`, items: [...String(plan.items || '').split(/,| e /).map((x: string) => x.trim()).filter(Boolean), 'Mão de obra'].map((label: string, i: number) => ({ id: uid('it') + i, label: label.charAt(0).toUpperCase() + label.slice(1), est: null, real: null, done: false })), status: 'aberta', unplanned: false, openedAt: Date.now(), odometerAt: 0, quotes: [], evidences: [], comments: [], nf: { chave: '', numero: '', valor: 0, erp: 'nenhum' }, auto: true });
    }
  }
  return add;
}
