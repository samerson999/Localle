// Veículo em estado crítico: enquanto houver evento ativo ou sem tratamento.
//  - alerta de prioridade alta ainda não tratado (ler o alerta NÃO resolve; só "marcar como tratado");
//  - bloqueio/desbloqueio enviado e ainda não confirmado pelo rastreador.
// Alertas da API (id "al:lc:...") são tratados no backend (POST /alertas/:id/tratar), que registra quem tratou
// e quando e avisa os outros usuários; a marca local abaixo é só a atualização imediata da tela.
import { useMemo } from 'react';
import { toast } from '../components/ui';
import { tratarAlerta } from './localleApi';
import { useStore } from './store';

function tratarNaApi(alertIds: Iterable<string>, t: Treatment) {
  for (const id of alertIds) {
    tratarAlerta(id, t.reason, t.note?.trim()).catch((e) => toast('Não foi possível registrar o tratamento: ' + (e.message || e), { tone: 'crit' }));
  }
}

export interface CritReason { key: string; kind: 'alerta' | 'comando'; title: string; detail: string; since: number; alertIds?: string[]; cmdId?: string }

const BLOCK_KINDS = ['bloqueio', 'desbloqueio'];
// Parâmetro do setup do cliente "monitor.bloqueio_pendente_critico" (docs/PLANO-SETUP-ADMIN.md, 3.9). Até o Setup entrar, fica no padrão.
export const BLOCK_PENDING_IS_CRITICAL = true;

export function criticalMap(s: any): Map<string, CritReason[]> {
  const out = new Map<string, CritReason[]>();
  const add = (aid: string, r: CritReason) => out.set(aid, [...(out.get(aid) || []), r]);
  const groups: Record<string, any> = {};
  for (const a of s.alerts || []) {
    // "Rodando sem viagem" nunca é crítico, mesmo em dados antigos ou regra mal configurada
    if (a.priority !== 'alta' || a.resolvedAt || !a.assetId || a.title === 'Rodando sem viagem') continue;
    const k = `${a.assetId}|${a.title}`;
    (groups[k] ||= { aid: a.assetId, title: a.title, ids: [] as string[], since: a.ts, last: a.ts, detail: a.detail }).ids.push(a.id);
    groups[k].since = Math.min(groups[k].since, a.ts);
    if (a.ts >= groups[k].last) { groups[k].last = a.ts; groups[k].detail = a.detail; }
  }
  for (const g of Object.values(groups)) add(g.aid, { key: `al|${g.title}`, kind: 'alerta', title: g.title, detail: g.ids.length > 1 ? `${g.ids.length} ocorrências sem tratamento` : 'Sem tratamento', since: g.since, alertIds: g.ids });
  if (!BLOCK_PENDING_IS_CRITICAL) return out;
  const kindOf = (defId: string) => (s.commandDefs || []).find((d: any) => d.id === defId)?.kind;
  for (const c of s.commands || []) {
    if (!BLOCK_KINDS.includes(kindOf(c.defId))) continue;
    for (const aid of c.assetIds) {
      const st = c.status?.[aid];
      if (st === 'confirmado' || c.resolved?.[aid]) continue;
      add(aid, { key: `cmd|${c.id}`, kind: 'comando', title: `${c.name} pendente`, detail: st === 'pendente' ? 'Rastreador sem comunicação; o comando não foi confirmado' : 'Aguardando confirmação do rastreador', since: c.ts, cmdId: c.id });
    }
  }
  return out;
}

export function useCriticalMap() {
  const alerts = useStore((s) => s.alerts);
  const commands = useStore((s) => s.commands);
  const commandDefs = useStore((s) => s.commandDefs);
  return useMemo(() => criticalMap({ alerts, commands, commandDefs }), [alerts, commands, commandDefs]);
}

// Tratamento: motivo obrigatório (chips) e observação opcional; fica registrado com quem tratou e quando.
export const TREAT_REASONS = ['Contato com o motorista', 'Falso positivo', 'Acionada a central', 'Veículo recuperado', 'Outro'];
export interface Treatment { reason: string; note?: string }

export function resolveReasons(assetId: string, reasons: CritReason[], t: Treatment) {
  const st = useStore.getState();
  const by = st.session?.name || 'Operador', now = Date.now();
  const ids = new Set(reasons.flatMap((r) => r.alertIds || []));
  const cmds = new Set(reasons.map((r) => r.cmdId).filter(Boolean));
  const mark = { resolvedAt: now, resolvedBy: by, resolvedReason: t.reason, resolvedNote: t.note?.trim() || '' };
  st.patch((s: any) => ({
    alerts: s.alerts.map((a: any) => (ids.has(a.id) ? { ...a, read: true, ...mark } : a)),
    commands: s.commands.map((c: any) => (cmds.has(c.id) ? { ...c, resolved: { ...(c.resolved || {}), [assetId]: { at: now, by, reason: t.reason, note: mark.resolvedNote } } } : c)),
  }));
  tratarNaApi(ids, t);
}

export function resolveAlert(alertId: string, t: Treatment) {
  const st = useStore.getState();
  const by = st.session?.name || 'Operador';
  st.patch((s: any) => ({ alerts: s.alerts.map((a: any) => (a.id === alertId ? { ...a, read: true, resolvedAt: Date.now(), resolvedBy: by, resolvedReason: t.reason, resolvedNote: t.note?.trim() || '' } : a)) }));
  tratarNaApi([alertId], t);
}

// tratamentos recentes de um ativo (para mostrar motivo, quem e quando)
export function recentTreatments(s: any, assetId: string, since = Date.now() - 24 * 3600000) {
  const seen = new Set<string>();
  const out: { key: string; title: string; at: number; by: string; reason?: string; note?: string }[] = [];
  for (const a of [...(s.alerts || [])].reverse()) {
    if (a.assetId !== assetId || !a.resolvedAt || a.resolvedAt < since || a.resolvedBy === 'Central (simulação)') continue;
    const k = `${a.title}|${a.resolvedAt}`; if (seen.has(k)) continue; seen.add(k);
    out.push({ key: a.id, title: a.title, at: a.resolvedAt, by: a.resolvedBy, reason: a.resolvedReason, note: a.resolvedNote });
  }
  for (const c of s.commands || []) { const r = c.resolved?.[assetId]; if (r && r.at >= since) out.push({ key: c.id, title: `${c.name} pendente`, at: r.at, by: r.by, reason: r.reason, note: r.note }); }
  return out.sort((x, y) => y.at - x.at);
}