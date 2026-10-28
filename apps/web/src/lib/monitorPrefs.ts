// Preferência de visão da tela cheia do Monitoramento (sprint 28/10/2026, melhoria 1): cards (visão vertical) e
// tabela, juntas ou separadas, guardadas por usuário. Fica no navegador (chave por e-mail): vale para o mesmo usuário
// no mesmo computador; ainda não há preferência de usuário no backend para acompanhar entre aparelhos.
export interface VisaoMonitor { cards: boolean; tabela: boolean }

export const VISAO_PADRAO: VisaoMonitor = { cards: true, tabela: false };
const chave = (email: string) => `monitor.visao.${email.toLowerCase()}`;

export function lerVisao(email: string | undefined): VisaoMonitor {
  if (!email) return VISAO_PADRAO;
  try {
    const v = JSON.parse(localStorage.getItem(chave(email)) || 'null');
    const out = { cards: v?.cards !== false, tabela: v?.tabela === true };
    // as duas desligadas deixaria só o mapa sem jeito de achar o veículo: volta para os cards
    return out.cards || out.tabela ? out : VISAO_PADRAO;
  } catch {
    return VISAO_PADRAO;
  }
}

export function salvarVisao(email: string | undefined, v: VisaoMonitor) {
  if (!email) return;
  try { localStorage.setItem(chave(email), JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}
