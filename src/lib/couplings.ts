// Engates: histórico de COMPOSIÇÕES. Cada registro é o cavalo com 1 a 3 implementos, em ordem, de início a fim.
// Trocar qualquer peça fecha a composição vigente e abre outra, então o histórico guarda sempre a composição inteira.
// A quilometragem do implemento sem rastreador próprio é a soma do que cada cavalo rodou com ele na composição.
import { uid } from './utils';

export interface Coupling { id: string; tractorId: string; items: string[]; from: number; to?: number; kmFrom: number; kmTo?: number }
export type TrailerType = 'semirreboque' | 'dolly' | 'reboque';
export const TRAILER_TYPE: Record<TrailerType, string> = { semirreboque: 'Semirreboque', dolly: 'Dolly', reboque: 'Reboque' };
export const MAX_ITEMS = 3;

const typeOf = (s: any, id: string): TrailerType => s.assets.find((a: any) => a.id === id)?.trailerType || 'semirreboque';

// dados salvos no formato antigo (uma carreta por registro) viram composição de um implemento
export const migrateCouplings = (list: any[]): Coupling[] => (list || []).map((c: any) => (c.items ? c : { id: c.id, tractorId: c.tractorId, items: [c.trailerId], from: c.from, to: c.to, kmFrom: c.kmFrom, kmTo: c.kmTo }));

export const couplingsOf = (s: any, trailerId: string): Coupling[] => (s.couplings || []).filter((c: Coupling) => c.items.includes(trailerId)).sort((a: Coupling, b: Coupling) => b.from - a.from);
export const currentCoupling = (s: any, trailerId: string): Coupling | undefined => (s.couplings || []).find((c: Coupling) => c.items.includes(trailerId) && !c.to);
export const compositionOf = (s: any, tractorId: string): Coupling | undefined => (s.couplings || []).find((c: Coupling) => c.tractorId === tractorId && !c.to);
export const tractorHistory = (s: any, tractorId: string): Coupling[] => (s.couplings || []).filter((c: Coupling) => c.tractorId === tractorId).sort((a: Coupling, b: Coupling) => b.from - a.from);

// nome da composição pela ordem dos implementos
export function compositionName(s: any, items: string[]) {
  const t = items.map((id) => typeOf(s, id)).join('+');
  return ({ semirreboque: 'Carreta simples', reboque: 'Reboque', 'semirreboque+semirreboque': 'Bitrem', 'semirreboque+dolly+semirreboque': 'Rodotrem', 'semirreboque+semirreboque+semirreboque': 'Tritrem', 'semirreboque+reboque': 'Romeu e Julieta' } as Record<string, string>)[t] || 'Composição';
}

// valida a ordem: o dolly só existe entre dois semirreboques; nada repetido; no máximo 3
export function compositionError(s: any, tractorId: string, items: string[]) {
  if (!items.length) return 'Escolha ao menos um implemento.';
  if (items.length > MAX_ITEMS) return `Um cavalo puxa no máximo ${MAX_ITEMS} implementos.`;
  if (new Set(items).size !== items.length) return 'O mesmo implemento aparece duas vezes.';
  const ty = items.map((id) => typeOf(s, id));
  if (ty[0] !== 'semirreboque') return 'O primeiro implemento, preso à quinta roda do cavalo, precisa ser um semirreboque.';
  for (let i = 0; i < ty.length; i++) if (ty[i] === 'dolly' && (i === ty.length - 1 || ty[i + 1] !== 'semirreboque')) return 'O dolly precisa ficar entre dois semirreboques (rodotrem).';
  for (const id of items) {
    const other = currentCoupling(s, id);
    if (other && other.tractorId !== tractorId) return `${s.assets.find((a: any) => a.id === id)?.name} está engatado em ${s.assets.find((a: any) => a.id === other.tractorId)?.name}. Desengate lá antes.`;
  }
  return '';
}

// km do cavalo para o engate (rastreador ou lançamentos, conforme a origem do cavalo)
export function trailerKm(s: any, trailerId: string, tractorKm: (id: string) => number) {
  const a = s.assets.find((x: any) => x.id === trailerId);
  return (a?.kmBase || 0) + couplingsOf(s, trailerId).reduce((sum, c) => sum + Math.max(0, (c.kmTo ?? tractorKm(c.tractorId)) - c.kmFrom), 0);
}

// fecha a composição vigente do cavalo e abre a nova (lista vazia = desengatar tudo)
export function setComposition(s: any, tractorId: string, items: string[], km: number, now = Date.now()): { list: Coupling[] } | { error: string } {
  if (items.length) { const err = compositionError(s, tractorId, items); if (err) return { error: err }; }
  const cur = compositionOf(s, tractorId);
  if (cur && cur.items.join() === items.join()) return { error: 'A composição não mudou.' };
  const list = (s.couplings || []).map((c: Coupling) => (c.id === cur?.id ? { ...c, to: now, kmTo: km } : c));
  return { list: items.length ? [...list, { id: uid('eg'), tractorId, items, from: now, kmFrom: km }] : list };
}
