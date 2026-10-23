// Acesso de suporte: revenda e Locale não veem a operação da frota do cliente por padrão. Para ver, "entram como
// cliente" informando o motivo; fica registrado quem acessou, quando e por quê.
// NO PRODUTO REAL o registro é gravado no backend e o cliente consulta o histórico dos acessos.
import { useStore } from './store';
import { uid } from '@localle/shared/utils';

// Parâmetro do Setup "suporte.exige_permissao_cliente" (docs/PLANO-SETUP-ADMIN.md 3.14): quando ligado, o acesso
// só abre se o cliente tiver liberado (revenda.supportConsent). Padrão: desligado.
export const SUPPORT_PARAMS = { requireConsent: false, minReason: 10 };

export const canSeeFleet = (session: any) => !!session && (session.role === 'gestor' || !!session.support);
export const isAdminRole = (session: any) => session?.role === 'revenda' || session?.role === 'locale';
export const homeOf = (session: any) => (session?.role === 'portaria' ? '/portaria' : canSeeFleet(session) ? '/monitoramento' : session?.role === 'locale' ? '/locale' : '/revenda');

export function supportBlock(s: any): string {
  if (SUPPORT_PARAMS.requireConsent && !s.revenda.supportConsent) return 'O cliente ainda não liberou o acesso de suporte. Peça a liberação ao gestor da frota.';
  return '';
}

export function startSupport(reason: string): string {
  const s = useStore.getState();
  const r = reason.trim();
  if (r.length < SUPPORT_PARAMS.minReason) return `Descreva o motivo com pelo menos ${SUPPORT_PARAMS.minReason} caracteres.`;
  const blocked = supportBlock(s); if (blocked) return blocked;
  const id = uid('sup'); const at = Date.now();
  s.patch((st: any) => ({
    supportLog: [{ id, at, by: st.session.name, role: st.session.role, client: st.revenda.clientName, reason: r }, ...(st.supportLog || [])],
    session: { ...st.session, support: { id, at, reason: r, client: st.revenda.clientName } },
  }));
  return '';
}

export function endSupport() {
  const s = useStore.getState();
  const sup = s.session?.support; if (!sup) return;
  s.patch((st: any) => ({
    supportLog: (st.supportLog || []).map((x: any) => (x.id === sup.id ? { ...x, endedAt: Date.now() } : x)),
    session: { ...st.session, support: undefined },
  }));
}
