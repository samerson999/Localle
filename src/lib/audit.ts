// Registro de alterações dos cadastros (quem mudou o quê e quando): s.auditLog, mais recente primeiro.
// Gravado pela própria store em upsert/remove das coleções de AUDITED; ações que não passam por upsert
// (ciclo de vida, retirada de rastreador) chamam auditEntry direto. NO PRODUTO REAL isto é feito no backend,
// numa tabela só de inserção, e não pode ser apagado pelo cliente.
import { uid } from './utils';

export const AUDITED: Record<string, string> = { assets: 'Ativo', drivers: 'Motorista', groups: 'Grupo', operations: 'Operação', fences: 'Cerca', rules: 'Regra de alerta', commandDefs: 'Comando' };
// rótulos de exibição: inclui operações em lote de outros módulos, registradas explicitamente (auditEntry)
export const AUDIT_LABEL: Record<string, string> = { ...AUDITED, sistema: 'Sistema', commands: 'Comando enviado', alerts: 'Alertas', checklist: 'Checklist', events: 'Telemetria', tires: 'Pneus', discipline: 'Jornada', workOrders: 'Manutenção' };
const MAX = 2000;
// campos técnicos ou volumosos que não entram no diff
const SKIP = new Set(['photo', 'installPhoto', 'file', 'specs', 'customFields', 'documents', 'lifecycle', 'odometerCheckDone']);
const FIELD: Record<string, string> = { name: 'Nome', plate: 'Placa', brand: 'Marca', model: 'Modelo', year: 'Ano', groupIds: 'Grupos', operationId: 'Operação', driverId: 'Motorista', kmSource: 'Origem do km', kmOffset: 'Ajuste do odômetro', fuelGoal: 'Meta de consumo', fuelBudget: 'Teto de combustível', tracker: 'Rastreador', cnh: 'CNH', cnhCat: 'Categoria da CNH', cnhDue: 'Validade da CNH', toxDue: 'Exame toxicológico', phone: 'Telefone', cpf: 'CPF', active: 'Ativa', icon: 'Ícone no mapa', serial: 'Nº de série', category: 'Tipo' };
export const fieldLabel = (k: string) => FIELD[k] || k;

const show = (v: any) => (v == null || v === '' ? '—' : typeof v === 'object' ? (v.imei || JSON.stringify(v)) : String(v));
export function diff(before: any, after: any): { f: string; from: string; to: string }[] {
  const out: { f: string; from: string; to: string }[] = [];
  for (const k of Object.keys(after)) {
    if (k === 'id' || SKIP.has(k) || k.startsWith('_')) continue;
    const a = before?.[k], b = after[k];
    if (JSON.stringify(a ?? '') === JSON.stringify(b ?? '')) continue;
    out.push({ f: k, from: show(a), to: show(b) });
  }
  return out;
}
const docChanged = (before: any, after: any) => 'documents' in after && JSON.stringify((before?.documents || []).map((d: any) => [d.type, d.due, d.number])) !== JSON.stringify((after.documents || []).map((d: any) => [d.type, d.due, d.number]));

// devolve { __audit: [entrada] }: a store acrescenta no início do registro (applyAudit). Nunca devolve auditLog,
// então nenhuma ação consegue reescrever ou apagar o que já está registrado.
export function auditEntry(s: any, e: { coll: string; refId: string; label: string; action: 'criou' | 'alterou' | 'excluiu' | string; changes?: any[]; note?: string; count?: number }) {
  return { __audit: [{ id: uid('au'), ts: Date.now(), by: s.session?.name || 'Sistema', ...e }] };
}

// chamado pela store: devolve o pedaço de estado com a entrada nova, ou {} se nada relevante mudou
export function auditUpsert(s: any, c: string, before: any, it: any) {
  if (!AUDITED[c] || !s.session) return {}; // sem sessão = carga inicial / simulação
  const label = it.name || before?.name || it.plate || it.id;
  if (!before) return auditEntry(s, { coll: c, refId: it.id, label, action: 'criou' });
  const changes = diff(before, it);
  if (docChanged(before, it)) changes.push({ f: 'documents', from: '', to: 'documentos atualizados' });
  return changes.length ? auditEntry(s, { coll: c, refId: it.id, label, action: 'alterou', changes }) : {};
}
export function auditRemove(s: any, c: string, before: any) {
  if (!AUDITED[c] || !s.session || !before) return {};
  return auditEntry(s, { coll: c, refId: before.id, label: before.name || before.plate || before.id, action: 'excluiu' });
}

// usado pela store em toda escrita: ignora qualquer tentativa de trocar auditLog e só acrescenta entradas novas.
// Limite de MAX entradas existe só porque a simulação guarda tudo no navegador (localStorage); no produto real
// a tabela é só de inserção, sem limite e sem UPDATE/DELETE para o cliente.
export function applyAudit(s: any, partial: any) {
  if (!partial || typeof partial !== 'object') return partial;
  const { auditLog: _ignored, __audit, ...rest } = partial;
  return __audit?.length ? { ...rest, auditLog: [...__audit, ...(s.auditLog || [])].slice(0, MAX) } : rest;
}
