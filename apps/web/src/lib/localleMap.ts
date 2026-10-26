import type { Alerta, RealtimePosicao } from '@localle/shared/realtime';

// Funções puras da integração com o backend (localleApi.ts): sem store, sem rede — testáveis em Node.

export const assetIdFor = (backendAssetId: string) => 'lc_' + backendAssetId;
export const backendIdOf = (assetId: string) => assetId.replace(/^lc_/, '');

// ---------- mapeamento API → store (puro, testado em localleMap.test.ts) ----------
export interface CurrentRow {
  assetId: string; plate: string; fixTime: string | null; longitude: number | null; latitude: number | null;
  speedKmh: number | string | null; ignition: boolean | null; rastreadorId: string | null; ultimoPacoteEm: string | null;
  comunicacao: 'sem_rastreador' | 'aguardando' | 'online' | 'sem_gps' | 'sem_sinal';
}

export function toAsset(row: CurrentRow, prev: any, liveGroupId: string) {
  return {
    kind: 'veiculo', meter: 'km', kmSource: 'rastreador', kmOffset: 0, customFields: [], active: true, photo: '', journeySource: 'teclado', fuelBudget: 0, fuelGoal: 0, specs: {},
    ...prev,
    id: assetIdFor(row.assetId),
    name: row.plate,
    plate: row.plate,
    groupIds: prev?.groupIds?.length ? prev.groupIds : [liveGroupId],
    tracker: row.rastreadorId ? { ...prev?.tracker, id: row.rastreadorId, linkedAt: prev?.tracker?.linkedAt || Date.now(), live: true, source: 'localle' } : undefined,
  };
}

/** `null` quando o ativo ainda não tem posição ("aguardando primeira posição") — não entra no mapa. */
export function toVehicle(row: CurrentRow, prev: any) {
  if (row.fixTime === null || row.latitude === null || row.longitude === null) return null;
  const speed = Math.round(Number(row.speedKmh) || 0);
  return {
    route: undefined, seg: 0, target: 0, stopLeft: 0, inside: [], heading: 0, odometer: 0, hourmeter: 0, battery: 12.6, gps: 0, gsm: 0, blocked: false,
    ...prev,
    assetId: assetIdFor(row.assetId), live: true,
    pos: [Number(row.latitude), Number(row.longitude)] as [number, number], speed, moving: speed > 3,
    ignition: row.ignition === true,
    lastUpdate: Date.parse(row.fixTime),
    noSignal: row.comunicacao === 'sem_sinal' || row.comunicacao === 'sem_gps',
  };
}

export function applyPosicao(v: any, p: RealtimePosicao) {
  const lastUpdate = Date.parse(p.fixTime);
  if (v && v.lastUpdate >= lastUpdate) return null; // fora de ordem: o que está na tela é mais novo
  const speed = Math.round(p.speedKmh ?? 0);
  return { ...v, assetId: assetIdFor(p.assetId), live: true, pos: [p.lat, p.lon] as [number, number], speed, moving: speed > 3, ignition: p.ignition === true, lastUpdate, noSignal: false };
}

/**
 * Leitor incremental de text/event-stream: recebe pedaços do corpo e devolve os `data:` completos.
 * Linha de comentário/ping e eventos sem `data` são ignorados; `data:` em várias linhas é juntado com "\n".
 */
export function createSseParser() {
  let buf = '';
  return (chunk: string): string[] => {
    buf += chunk.replace(/\r\n/g, '\n');
    const out: string[] = [];
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const lines = block.split('\n');
      if (lines.some((l) => l === 'event: ping')) continue;
      const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, ''));
      if (data.length && data.join('') !== '') out.push(data.join('\n'));
    }
    return out;
  };
}

// ---------- cercas: API (apps/api/src/cercas) ↔ formato que as telas e o mapa já usam ----------
export interface CercaApi {
  id: string; nome: string; tipo: string; forma: 'circulo' | 'poligono';
  centro: [number, number] | null; raioM: number | null; pontos: [number, number][] | null;
  alertaEntrada: boolean; alertaSaida: boolean; prioridadeAlerta: 'alta' | 'media' | 'baixa' | null;
  iniciaViagem: boolean; encerraViagem: boolean; velocidadeLimiteKmh: number | null; permanenciaMaxMin: number | null;
}

export function cercaToFence(c: CercaApi) {
  return {
    id: c.id, name: c.nome, type: c.tipo,
    shape: c.forma === 'circulo' ? 'circle' : 'polygon',
    ...(c.forma === 'circulo' ? { center: c.centro, radius: c.raioM } : { points: c.pontos }),
    alertIn: c.alertaEntrada, alertOut: c.alertaSaida,
    ...(c.prioridadeAlerta ? { alertPriority: c.prioridadeAlerta } : {}),
    startsTrip: c.iniciaViagem, endsTrip: c.encerraViagem,
    speedLimit: c.velocidadeLimiteKmh ?? 0, maxStayMin: c.permanenciaMaxMin ?? 0,
  };
}

/** Corpo de POST/PUT /cercas a partir do formulário da tela (campos vazios/0 viram "sem limite"). */
export function fenceToCercaBody(f: any) {
  const circulo = f.shape === 'circle';
  const opcional = (v: any) => (v === '' || v === null || v === undefined || +v === 0 ? null : +v);
  return {
    nome: String(f.name || '').trim(), tipo: f.type, forma: circulo ? 'circulo' : 'poligono',
    centro: circulo ? f.center : null, raioM: circulo ? +f.radius : null, pontos: circulo ? null : f.points,
    alertaEntrada: !!f.alertIn, alertaSaida: !!f.alertOut, prioridadeAlerta: f.alertPriority || null,
    iniciaViagem: !!f.startsTrip, encerraViagem: !!f.endsTrip,
    velocidadeLimiteKmh: opcional(f.speedLimit), permanenciaMaxMin: opcional(f.maxStayMin) === null ? null : Math.round(+f.maxStayMin),
  };
}

// ---------- alertas: API (apps/api/src/alertas) → formato do store (sino, Precisa de você, Alertas) ----------
export const alertIdFor = (alertaId: string) => 'al:lc:' + alertaId;
export const alertaIdOf = (alertId: string) => (alertId.startsWith('al:lc:') ? alertId.slice(6) : null);

export function alertaToAlert(a: Alerta, plate?: string) {
  return {
    id: alertIdFor(a.id), ts: Date.parse(a.ts),
    assetId: a.assetId ? assetIdFor(a.assetId) : undefined,
    title: a.titulo, detail: a.detalhe || plate || '', priority: a.prioridade,
    read: a.lidoEm !== null, source: a.origem === 'aparelho' ? 'rastreador' : a.origem,
    ...(a.tratadoEm ? { resolvedAt: Date.parse(a.tratadoEm), resolvedBy: a.tratadoPor || '', resolvedReason: a.motivo || '', resolvedNote: a.obs || '' } : {}),
  };
}

// ---------- regras de alerta: API (apps/api/src/regras) ↔ formato da tela Alertas › Regras ----------
export interface RegraApi {
  id: string; nome: string; ativa: boolean; prioridade: 'alta' | 'media' | 'baixa';
  condicoes: { field: string; op: string; value: string }[];
  acoes: Record<string, boolean>; disparos30d: number;
}

export function regraToRule(r: RegraApi) {
  return { id: r.id, name: r.nome, active: r.ativa, priority: r.prioridade, conditions: r.condicoes, actions: r.acoes, disparos30d: r.disparos30d };
}

/** Escopo por grupo ainda não existe no backend: a regra vale para a frota toda (groupId não é enviado). */
export function ruleToRegraBody(r: any) {
  return {
    nome: String(r.name || '').trim(), ativa: r.active !== false, prioridade: r.priority,
    condicoes: (r.conditions || []).map((c: any) => ({ field: c.field, op: c.op, value: String(c.value) })),
    acoes: r.actions || {},
  };
}

// ---------- eventos do período (GET /monitoring/events) → marcadores do Replay ----------
// Tipos do aparelho/backend que têm equivalente no catálogo do produto (EVENT_TYPES) usam a chave de lá;
// os demais levam rótulo próprio. Eventos sem posição (sem lat/lon) ficam fora do mapa.
const TIPO_PRODUTO: Record<string, string> = {
  hardBraking: 'frenagem_brusca', hardAcceleration: 'aceleracao_brusca', hardCornering: 'curva_brusca',
};
const ROTULO: Record<string, string> = {
  sos: 'Pânico (SOS)', powerCut: 'Alimentação cortada', tamper: 'Violação do rastreador', jamming: 'Jammer detectado',
  accident: 'Possível colisão', lowBattery: 'Bateria baixa', lowPower: 'Tensão baixa', fault: 'Falha no rastreador',
  door: 'Porta aberta', ignitionOn: 'Ignição ligada', ignitionOff: 'Ignição desligada',
  deviceMoving: 'Começou a andar', deviceStopped: 'Parou',
};

export interface EventoApi {
  id: string; tipo: string; ts: string; latitude: number | null; longitude: number | null;
  speedKmh: number | string | null; attributes: Record<string, any> | null;
}

export function eventoToReplay(e: EventoApi) {
  if (e.latitude === null || e.longitude === null) return null;
  const at = e.attributes || {};
  const label =
    e.tipo === 'cerca_entrada' ? `Entrada em ${at.nome}` :
    e.tipo === 'cerca_saida' ? `Saída de ${at.nome}` :
    e.tipo === 'regra' ? `Regra: ${at.nome}` :
    ROTULO[e.tipo] || e.tipo;
  return {
    id: 'ev:lc:' + e.id, ts: Date.parse(e.ts),
    type: TIPO_PRODUTO[e.tipo] || (e.tipo === 'regra' && at.ranking ? 'fora_horario' : e.tipo),
    label, pos: [Number(e.latitude), Number(e.longitude)] as [number, number],
    value: e.speedKmh === null ? null : Math.round(Number(e.speedKmh)),
  };
}
