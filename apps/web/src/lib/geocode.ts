// Endereço por extenso a partir da posição (geocodificação reversa). Usa o Nominatim (OpenStreetMap),
// respeitando o limite de 1 consulta por segundo, com cache por ponto arredondado (~11 m) guardado no navegador.
// NO PRODUTO REAL isto vai para o backend (serviço próprio ou contratado, com cache no banco): o front só recebe o texto.
import { useEffect, useState } from 'react';

const KEY = 'geo-cache-v1', MAX = 3000;
const cache: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
const save = () => { try { const k = Object.keys(cache); if (k.length > MAX) k.slice(0, k.length - MAX).forEach((x) => delete cache[x]); localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* sem armazenamento: só memória */ } };
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

// fila: uma consulta por vez, 1,1 s entre elas; pedidos repetidos do mesmo ponto compartilham a promessa
const pending = new Map<string, Promise<string>>();
let chain = Promise.resolve();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function format(j: any): string {
  const a = j?.address || {};
  const rua = a.road || a.pedestrian || a.highway || a.footway;
  const num = a.house_number;
  const bairro = a.suburb || a.neighbourhood || a.quarter;
  const cidade = a.city || a.town || a.village || a.municipality;
  const uf = (a['ISO3166-2-lvl4'] || '').replace('BR-', '');
  const head = rua ? (num ? `${rua}, ${num}` : rua) : bairro || j?.name;
  return [head, rua && bairro, [cidade, uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || j?.display_name || '';
}

export function reverseGeocode(lat: number, lng: number): Promise<string> {
  const k = keyOf(lat, lng);
  if (cache[k] != null) return Promise.resolve(cache[k]);
  if (pending.has(k)) return pending.get(k)!;
  const p = new Promise<string>((resolve) => {
    chain = chain.then(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`);
        const txt = r.ok ? format(await r.json()) : '';
        if (txt) { cache[k] = txt; save(); }
        resolve(txt);
      } catch { resolve(''); }
      pending.delete(k);
      await wait(1100);
    });
  });
  pending.set(k, p);
  return p;
}

// endereço de um ponto; vazio enquanto carrega ou se o serviço falhar (a tela mostra as coordenadas)
// geocodificação direta (endereço digitado -> coordenadas): usada no relatório "Passou por aqui" para
// posicionar o ponto a partir de um endereço, em vez de clicar no mapa ou digitar lat/long.
// NO PRODUTO REAL isto também é o backend quem resolve (mesmo serviço do reverso).
export async function searchAddress(query: string): Promise<[number, number] | null> {
  if (!query.trim()) return null;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&accept-language=pt-BR`);
    const j = await r.json();
    const hit = j?.[0];
    return hit ? [+hit.lat, +hit.lon] : null;
  } catch { return null; }
}

// endereço já resolvido (sem disparar nova consulta): usado para preencher relatórios com o que a tela já
// carregou, sem travar a exportação esperando a fila de 1 consulta/segundo em listas grandes
export function cachedAddress(lat: number, lng: number): string {
  return cache[keyOf(lat, lng)] || '';
}

// endereços de vários pontos, para relatórios exportados: usa o cache quando já tem (preenchido ao navegar
// pelas telas) e busca o restante respeitando a mesma fila/limite de 1 consulta por segundo. Indicado só para
// listas pequenas (eventos, paradas, entradas em cerca) — não para o histórico de posições inteiro.
export async function resolveAddresses(points: [number, number][]): Promise<string[]> {
  return Promise.all(points.map((p) => reverseGeocode(p[0], p[1])));
}

export function useAddress(pos?: [number, number] | null) {
  const k = pos ? keyOf(pos[0], pos[1]) : '';
  const [addr, setAddr] = useState(() => (k && cache[k]) || '');
  useEffect(() => {
    if (!pos) { setAddr(''); return; }
    setAddr(cache[k] || '');
    if (cache[k] != null) return;
    let live = true;
    // espera o ponto assentar: veículo em movimento não dispara uma consulta a cada atualização
    const t = setTimeout(() => reverseGeocode(pos[0], pos[1]).then((x) => live && setAddr(x)), 600);
    return () => { live = false; clearTimeout(t); };
  }, [k]);
  return addr;
}
