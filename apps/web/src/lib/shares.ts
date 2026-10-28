// Links temporários de localização (Monitoramento › painel do veículo › Compartilhar): s.shares = { token, assetId,
// to, createdAt, expiresAt, revokedAt?, by }. O link mostra só a posição atual do veículo, nada além.
import { useEffect, useState } from 'react';
import { useStore } from './store';
import { uid } from '@localle/shared/utils';

export const SHARE_DURATIONS: [number, string][] = [[3600e3, '1 hora'], [4 * 3600e3, '4 horas'], [12 * 3600e3, '12 horas'], [24 * 3600e3, '24 horas'], [72 * 3600e3, '3 dias']];

export const shareState = (x: any, now = Date.now()) => (x.revokedAt ? 'revogado' : now > x.expiresAt ? 'expirado' : 'ativo');
export const shareUrl = (token: string) => `${location.origin}${location.pathname}#/compartilhar/${token}`;

export function createShare(assetId: string, ms: number, to: string) {
  const s = useStore.getState();
  const sh = { token: uid('lk') + uid(), assetId, to: to.trim(), createdAt: Date.now(), expiresAt: Date.now() + ms, by: s.session?.name || s.session?.email || '' };
  s.patch((st: any) => ({ shares: [...(st.shares || []), sh] }));
  return sh;
}
export const revokeShare = (token: string) => useStore.getState().patch((st: any) => ({ shares: (st.shares || []).map((x: any) => (x.token === token ? { ...x, revokedAt: Date.now() } : x)) }));

// Aberturas do link: { token: [ts, ...] } numa chave própria do navegador, porque a página pública roda em outra aba
// e a aba do gestor regrava o estado inteiro a cada mudança (apagaria o registro). Só quem criou o link vê.
// NO PRODUTO REAL cada abertura é gravada no backend (data, hora e IP aproximado) quando o token é validado.
const OPENS = 'share-opens-v1';
const readOpens = (): Record<string, number[]> => { try { return JSON.parse(localStorage.getItem(OPENS) || '{}'); } catch { return {}; } };
const counted = new Set<string>(); // StrictMode roda o efeito duas vezes: uma abertura por carregamento
export function recordOpen(token: string) {
  if (counted.has(token)) return; counted.add(token);
  try { const o = readOpens(); o[token] = [...(o[token] || []), Date.now()]; localStorage.setItem(OPENS, JSON.stringify(o)); } catch { /* sem armazenamento */ }
}
export function useShareOpens() {
  const [o, setO] = useState(readOpens);
  useEffect(() => { const f = (e: StorageEvent) => { if (e.key === OPENS) setO(readOpens()); }; window.addEventListener('storage', f); return () => window.removeEventListener('storage', f); }, []);
  return o;
}
