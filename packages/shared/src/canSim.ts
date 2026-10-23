// Telemetria CAN gerada pela simulação (como os outros módulos), com histórico para comparar períodos.
// Mesmo formato das amostras importadas (CanSample/CanEvent). O arquivo de exemplo fica só para testar a importação.
import { CanSample, CanEvent } from './can';
import { DAY, HOUR, MIN } from './utils';

// gerador pseudoaleatório com semente: o mesmo veículo gera sempre o mesmo histórico
function rng(seed: number) { let x = seed || 1; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); }

export function genCanHistory(assets: any[], vehicles: Record<string, any>, days = 60, now = Date.now()) {
  const samples: CanSample[] = []; const events: CanEvent[] = [];
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  for (const a of assets) {
    const r = rng([...a.id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
    const plate = (a.plate || a.name).replace(/\W/g, '').toUpperCase();
    const heavy = /6x2|6x4|FH|R\s?4/i.test(a.model || '');
    const baseKmL = heavy ? 2.4 : 4.2; // rendimento típico
    const v = vehicles[a.id];
    // mesmas unidades do arquivo do rastreador: ODO em metros, HRMT em minutos, TFL em décimos de litro
    // anda para trás a partir do odômetro e horímetro atuais
    let odo = ((v?.odometer || 100000) - days * 230) * 1000, hrmt = ((v?.hourmeter || 8000) - days * 9.5) * 60, tfl = 1500000 + r() * 500000;
    const pos: [number, number] = v?.pos ? [...v.pos] as any : [-8.1, -34.92];
    // rastreador continua mandando posição com o motor desligado (a cada 9 min), sem virar falha de transmissão
    const beat = (from: number, to: number) => { for (let s = from; s < Math.min(to, now); s += 9 * MIN) (lastTs = s), samples.push({ plate, ts: Math.round(s), lat: +pos[0].toFixed(5), lng: +pos[1].toFixed(5), odo: Math.round(odo), hrmt: Math.round(hrmt), speed: 0, rpm: 0, tfl: Math.round(tfl), fuelPct: Math.round(30 + r() * 60), oil: 0, temp: Math.round(35 + r() * 20), park: 1, pedal: 0, gear: 'N', turbo: 0, volt: +(25.4 + r() * 0.6).toFixed(1) }); };
    let lastEnd = day0.getTime() - (days + 1) * DAY, lastTs = 0;
    const first = samples.length;
    for (let d = days; d >= 0; d--) {
      const day = day0.getTime() - d * DAY, wd = new Date(day).getDay();
      if (wd === 0 || (wd === 6 && r() < 0.6)) continue; // domingo parado; sábado às vezes
      // a frota melhora um pouco nas últimas semanas (história para a comparação de período)
      const gain = d < days / 2 ? 1.04 : 1;
      const idleBias = d < days / 2 ? 0.8 : 1;
      let t = day + (5.5 + r() * 1.5) * HOUR;
      const end = day + (16 + r() * 2.5) * HOUR;
      beat(lastEnd, t); // noite parada
      let lastIdleStart = 0;
      while (t < end && t < now) {
        // blocos de 10–50 min: rodando, parado ligado ou desligado (almoço, descarga)
        const kind = r() < 0.62 ? 'mov' : r() < 0.55 * idleBias ? 'ocioso' : 'off';
        const len = (10 + r() * 40) * MIN;
        const over = kind === 'mov' && r() < 0.12;
        if (kind === 'ocioso') lastIdleStart = t;
        if (kind === 'off') { beat(t, Math.min(t + len, end)); t += len; continue; }
        for (let s = t; s < Math.min(t + len, end, now); s += 2 * MIN) {
          const coast = kind === 'mov' && r() < 0.025 * idleBias; // banguela: neutro em movimento
          const speed = kind === 'mov' ? (over ? 84 + r() * 14 : 35 + r() * 40) : 0;
          const rpm = coast ? 650 + r() * 150 : kind === 'mov' ? (r() < 0.06 ? 2150 + r() * 300 : r() < 0.25 ? 1650 + r() * 400 : 1150 + r() * 450) : 650 + r() * 200;
          const dtH = lastTs ? Math.min(s - lastTs, 2 * MIN) / HOUR : 0; lastTs = s; // totalizadores avançam pelo tempo real desde a última amostra
          const lph = coast ? 1.5 : kind === 'mov' ? (speed / (baseKmL * gain * (0.92 + r() * 0.16))) : 2.2 + r() * 0.8;
          odo += speed * dtH * 1000; hrmt += dtH * 60; tfl += lph * dtH * 10;
          pos[0] += (r() - 0.5) * 0.004; pos[1] += (r() - 0.5) * 0.004;
          samples.push({ plate, ts: Math.round(s), lat: +pos[0].toFixed(5), lng: +pos[1].toFixed(5), odo: Math.round(odo), hrmt: Math.round(hrmt), speed: Math.round(speed), rpm: Math.round(rpm), tfl: Math.round(tfl), fuelPct: Math.round(30 + r() * 60), oil: +(kind === 'mov' ? 3.5 + r() * 1.5 : 1.8 + r() * 0.6).toFixed(1), temp: Math.round(84 + r() * 12), park: kind === 'mov' ? 0 : 1, pedal: kind === 'mov' && !coast ? Math.round(20 + r() * (over ? 75 : 55)) : 0, gear: kind === 'mov' && !coast ? String(6 + Math.floor(r() * 6)) : 'N', turbo: kind === 'mov' ? Math.round(100 + r() * 80) : 0, volt: +(27 + r() * 1.2).toFixed(1) });
          if (kind === 'mov') {
            if (r() < 0.03) events.push({ plate, ts: Math.round(s), lat: pos[0], lng: pos[1], code: 'ACP', value: Math.round(speed) });
            if (r() < 0.05) events.push({ plate, ts: Math.round(s), lat: pos[0], lng: pos[1], code: 'ACN', value: Math.round(speed) });
            if (over && r() < 0.15) events.push({ plate, ts: Math.round(s), lat: pos[0], lng: pos[1], code: 'VMX_IN', value: Math.round(speed) });
            if (coast) events.push({ plate, ts: Math.round(s), lat: pos[0], lng: pos[1], code: 'BGL_IN', value: 73 });
          }
          if (kind === 'ocioso' && s - lastIdleStart >= 5 * MIN && s - lastIdleStart < 7 * MIN) events.push({ plate, ts: Math.round(s), lat: pos[0], lng: pos[1], code: 'OCS_IN', value: null });
        }
        t += len;
      }
      lastEnd = Math.min(t, end);
    }
    beat(lastEnd, now);
    // encaixa o histórico no odômetro e no horímetro atuais do veículo
    if (v?.odometer || v?.hourmeter) { const dOdo = v.odometer ? v.odometer * 1000 - odo : 0, dH = v.hourmeter ? v.hourmeter * 60 - hrmt : 0; for (let i = first; i < samples.length; i++) { samples[i].odo = Math.round(samples[i].odo! + dOdo); samples[i].hrmt = Math.round(samples[i].hrmt! + dH); } }
  }
  samples.sort((x, y) => (x.plate === y.plate ? x.ts - y.ts : x.plate.localeCompare(y.plate)));
  events.sort((x, y) => x.ts - y.ts);
  return { samples, events };
}
