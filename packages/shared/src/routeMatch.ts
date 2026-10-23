// Ajusta um percurso bruto (posições de GPS) às ruas via map-matching (OSRM, sobre dados OpenStreetMap), para o
// replay não cortar curvas e rotatórias com uma linha reta entre dois pontos distantes do rastreador.
// Qualquer falha (sem rede, servidor fora, poucos pontos, gps ruim) devolve null — quem chama cai de volta na
// posição bruta do rastreador, sem quebrar o replay.
const OSRM = 'https://router.project-osrm.org/match/v1/driving/';
const CHUNK = 100; // limite prático de pontos por chamada ao servidor público de demonstração do OSRM
const RADIUS_M = 30; // tolerância ao redor de cada ponto: cobre a imprecisão comum de GPS embarcado

type Pt = [number, number, number, number, number]; // [ts, lat, lng, velocidade, ignição] — formato do histórico

async function matchChunk(chunk: Pt[]): Promise<([number, number] | null)[]> {
  const coords = chunk.map((p) => `${p[2]},${p[1]}`).join(';');
  const radiuses = chunk.map(() => RADIUS_M).join(';');
  const timestamps = chunk.map((p) => Math.round(p[0] / 1000)).join(';');
  const url = `${OSRM}${coords}?geometries=geojson&overview=false&radiuses=${radiuses}&timestamps=${timestamps}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data.code !== 'Ok') throw new Error(data.message || data.code);
  return (data.tracepoints || []).map((t: any) => (t ? ([t.location[1], t.location[0]] as [number, number]) : null));
}

// Processa em lotes (o servidor público não aceita percursos longos demais numa chamada só), sobrepondo 1 ponto
// entre lotes para o matching não perder o contexto de direção na emenda.
export async function matchToRoads(pts: Pt[]): Promise<([number, number] | null)[] | null> {
  if (pts.length < 2) return null;
  try {
    const out: ([number, number] | null)[] = [];
    let i = 0;
    while (i < pts.length) {
      const end = Math.min(i + CHUNK, pts.length);
      const chunk = pts.slice(i, end);
      if (out.length && chunk.length < 2) break; // o último ponto já veio do lote anterior
      const snapped = await matchChunk(chunk);
      out.push(...(out.length ? snapped.slice(1) : snapped));
      if (end >= pts.length) break;
      i = end - 1;
    }
    return out;
  } catch {
    return null;
  }
}
