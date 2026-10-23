// Escalonamento dos alertas de manutenção por e-mail (modo sem banco: a fila é simulada, nada é enviado).
// Destinatários por nível: Alerta, Crítico e "Crítico sem ação" (crítico há X horas sem a OS andar).
// Lê os níveis de insights.maintNeeds, que usa a mesma regra de crítico da tela (maint.critAfter).
// NO PRODUTO REAL isto roda no backend e uma função lê a fila e envia pelo provedor de e-mail.
import { maintNeeds } from './insights';
import { planStatus } from './maint';
import { HOUR, uid } from './utils';

export type EscLevel = 'alerta' | 'crit' | 'sem_acao';
export const ESC_LEVELS: Record<EscLevel, string> = { alerta: 'Alerta', crit: 'Crítico', sem_acao: 'Crítico sem ação' };
export interface Recipient { id: string; level: EscLevel; name: string; role?: string; email: string; waitHours: number }
export interface OutMail { id: string; ts: number; level: EscLevel; to: string; email: string; ref: string; title: string; detail: string; assetId: string; status: 'na_fila' }
interface LogEntry { level: 'alerta' | 'crit'; since: number; wo?: string; sent: Partial<Record<EscLevel, number>> }

// exemplo da reunião: o gestor recebe primeiro; sem ação, o dono
export const DEFAULT_RECIPIENTS: Recipient[] = [
  { id: 'rc1', level: 'alerta', name: 'Davi Souza', role: 'Gestor de frota', email: 'davi.gestor@exemplo.com.br', waitHours: 0 },
  { id: 'rc2', level: 'crit', name: 'Davi Souza', role: 'Gestor de frota', email: 'davi.gestor@exemplo.com.br', waitHours: 0 },
  { id: 'rc3', level: 'sem_acao', name: 'Paulo Lima', role: 'Dono da empresa', email: 'paulo.dono@exemplo.com.br', waitHours: 48 },
];

// Compara os níveis atuais com o registro anterior e põe na fila os e-mails devidos.
// Devolve null quando nada mudou (evita regravar o estado a cada minuto).
export function runEscalation(s: any, now = Date.now()): { escLog: Record<string, LogEntry>; outbox: OutMail[] } | null {
  const prev: Record<string, LogEntry> = s.escLog || {};
  const recipients: Recipient[] = s.maintRecipients || [];
  const woStatus = (id?: string) => (id ? s.workOrders.find((w: any) => w.id === id)?.status : undefined);
  const log: Record<string, LogEntry> = {};
  const mails: OutMail[] = [];
  let changed = false;
  const send = (lv: EscLevel, n: any, e: LogEntry) => {
    const to = recipients.filter((r) => r.level === lv);
    for (const r of to) mails.push({ id: uid('em'), ts: now, level: lv, to: r.name, email: r.email, ref: n.id, title: `[${ESC_LEVELS[lv]}] ${n.title}`, detail: n.context, assetId: n.assetId, status: 'na_fila' });
    e.sent[lv] = now; changed = true;
  };
  for (const n of maintNeeds(s, planStatus, now)) {
    if (n.soon) continue; // só "próxima do vencimento": ainda é Pendente, não escala
    const old = prev[n.id];
    const e: LogEntry = old && old.level === n.level ? { ...old, sent: { ...old.sent } } : { level: n.level, since: n.level === 'crit' && n.since ? Math.min(n.since, now) : now, wo: n.level === 'crit' ? woStatus(n.woId) : undefined, sent: { ...(old?.sent || {}) } };
    if (!old || old.level !== n.level) changed = true;
    log[n.id] = e;
    if (n.level === 'alerta' && !e.sent.alerta) send('alerta', n, e);
    if (n.level === 'crit') {
      if (!e.sent.crit) send('crit', n, e);
      // "sem ação": a OS não mudou de etapa desde que ficou crítica (ou nem existe)
      const acted = e.wo !== undefined && woStatus(n.woId) !== e.wo;
      for (const r of recipients.filter((x) => x.level === 'sem_acao'))
        if (!acted && !e.sent.sem_acao && now - e.since >= (r.waitHours || 0) * HOUR) { send('sem_acao', n, e); break; }
    }
  }
  if (Object.keys(prev).some((k) => !log[k])) changed = true; // itens resolvidos saem do registro
  if (!changed) return null;
  return { escLog: log, outbox: [...mails, ...(s.outbox || [])].slice(0, 300) };
}
