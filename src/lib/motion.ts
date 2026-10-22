import { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Conta de 0 até o valor só na primeira carga (600 ms); depois acompanha o valor sem animar.
export function useCountUp(value: number | null | undefined, ms = 600) {
  const [v, setV] = useState(() => (reducedMotion() ? value ?? 0 : 0));
  const done = useRef(reducedMotion());
  useEffect(() => {
    if (value == null || !isFinite(value)) return;
    if (done.current) { setV(value); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(value * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(step); else done.current = true;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return value == null ? null : v;
}
