// Teste de carga do mapa ao vivo (só demonstração): `#/monitoramento?carga=2000` acrescenta N veículos sintéticos
// à lista e ao mapa, espalhados pela Grande Recife, andando a cada 2 s como o rastreador real (20–30 s, acelerado).
// Não grava nada na store: serve para medir rolagem, zoom e atualização com 600–2.000 veículos (PRODUCT.md › Mapa em escala).
import { useEffect, useMemo, useState } from 'react';

type Synth = { id: string; lat: number; lng: number; heading: number; speed: number; moving: boolean; ignition: boolean };

const rand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export function useSyntheticFleet(n: number) {
  const base = useMemo<Synth[]>(() => {
    const r = rand(42);
    return Array.from({ length: n }, (_, i) => {
      const moving = r() < 0.55, ignition = moving || r() < 0.4;
      return { id: `carga-${i}`, lat: -8.05 - r() * 0.32, lng: -34.86 - r() * 0.28, heading: r() * 360, speed: moving ? 20 + r() * 70 : 0, moving, ignition };
    });
  }, [n]);
  const [fleet, setFleet] = useState(base);
  useEffect(() => {
    setFleet(base);
    if (!n) return;
    const t = setInterval(() => setFleet((cur) => cur.map((v) => {
      if (!v.moving) return v;
      const d = (v.speed / 3600) * 2 * 30 / 111; // ~30x acelerado, em graus
      const h = v.heading + (Math.random() - 0.5) * 20;
      return { ...v, heading: (h + 360) % 360, lat: v.lat + Math.cos((h * Math.PI) / 180) * d, lng: v.lng + Math.sin((h * Math.PI) / 180) * d };
    })), 2000);
    return () => clearInterval(t);
  }, [base, n]);
  return useMemo(() => fleet.map((v, i) => ({
    a: { id: v.id, name: `CRG${String(i).padStart(4, '0')}`, plate: `CRG${String(i).padStart(4, '0')}`, brand: 'Teste', model: 'de carga', category: 'caminhao', tracker: { imei: '000' }, groupIds: [] },
    v: { pos: [v.lat, v.lng] as [number, number], heading: v.heading, speed: v.speed, moving: v.moving, ignition: v.ignition, noSignal: false, lastUpdate: Date.now() },
  })), [fleet]);
}
