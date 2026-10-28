import { describe, expect, it } from 'vitest';
import { eventoToReplay, regraToRule, ruleToRegraBody, alertaIdOf, alertaToAlert, applyPosicao, cercaToFence, createSseParser, fenceToCercaBody, toAsset, toVehicle, type CurrentRow } from './localleMap';

const row = (o: Partial<CurrentRow> = {}): CurrentRow => ({
  assetId: 'a1', plate: 'ABC1D23', fixTime: '2026-01-01T12:00:00.000Z', longitude: -34.88, latitude: -8.05,
  speedKmh: '42.6', ignition: true, rastreadorId: 'r1', ultimoPacoteEm: '2026-01-01T12:00:00.000Z', comunicacao: 'online', ...o,
});

describe('createSseParser', () => {
  it('junta pedaços quebrados no meio e devolve só eventos completos', () => {
    const parse = createSseParser();
    expect(parse('data: {"a"')).toEqual([]);
    expect(parse(':1}\n\ndata: {"b":2}\n')).toEqual(['{"a":1}']);
    expect(parse('\n')).toEqual(['{"b":2}']);
  });

  it('ignora ping e aceita CRLF e data em várias linhas', () => {
    const parse = createSseParser();
    expect(parse('event: ping\r\ndata: \r\n\r\ndata: x\r\ndata: y\r\n\r\n')).toEqual(['x\ny']);
  });
});

describe('toAsset / toVehicle', () => {
  it('ativo com rastreador vira veículo real com origem localle; sem rastreador, sem tracker', () => {
    expect(toAsset(row(), undefined, 'g').tracker).toMatchObject({ id: 'r1', live: true, source: 'localle' });
    expect(toAsset(row({ rastreadorId: null }), undefined, 'g').tracker).toBeUndefined();
    expect(toAsset(row(), { groupIds: ['x'] }, 'g').groupIds).toEqual(['x']);
  });

  it('sem posição ainda (aguardando) não vira veículo no mapa', () => {
    expect(toVehicle(row({ fixTime: null, latitude: null, longitude: null }), undefined)).toBeNull();
  });

  it('converte velocidade numérica vinda como texto e marca sem sinal/sem GPS', () => {
    const v = toVehicle(row(), undefined)!;
    expect(v).toMatchObject({ assetId: 'lc_a1', pos: [-8.05, -34.88], speed: 43, ignition: true, noSignal: false });
    expect(toVehicle(row({ comunicacao: 'sem_sinal' }), undefined)!.noSignal).toBe(true);
    expect(toVehicle(row({ comunicacao: 'sem_gps' }), undefined)!.noSignal).toBe(true);
  });
});

describe('applyPosicao', () => {
  const p = { kind: 'posicao' as const, assetId: 'a1', rastreadorId: 'r1', fixTime: '2026-01-01T12:00:05.000Z', lat: -8, lon: -34, speedKmh: 10.4, ignition: false };

  it('aplica posição mais nova e limpa "sem sinal"', () => {
    const v = applyPosicao({ lastUpdate: Date.parse('2026-01-01T12:00:00Z'), noSignal: true, odometer: 5 }, p)!;
    expect(v).toMatchObject({ pos: [-8, -34], speed: 10, ignition: false, noSignal: false, odometer: 5 });
  });

  it('descarta posição mais antiga ou igual à que já está na tela', () => {
    expect(applyPosicao({ lastUpdate: Date.parse('2026-01-01T12:00:05Z') }, p)).toBeNull();
  });
});

describe('cercas: API ↔ front', () => {
  it('ida e volta preserva círculo e polígono; 0/vazio vira "sem limite" (null)', () => {
    const circ = { id: 'c1', nome: 'Pátio', tipo: 'Pátio', forma: 'circulo' as const, centro: [-8, -34] as [number, number], raioM: 200, pontos: null, alertaEntrada: true, alertaSaida: false, prioridadeAlerta: null, iniciaViagem: true, encerraViagem: false, velocidadeLimiteKmh: null, permanenciaMaxMin: 30 };
    const f = cercaToFence(circ);
    expect(f).toMatchObject({ id: 'c1', shape: 'circle', center: [-8, -34], radius: 200, alertIn: true, startsTrip: true, speedLimit: 0, maxStayMin: 30 });
    expect(fenceToCercaBody(f)).toMatchObject({ forma: 'circulo', centro: [-8, -34], raioM: 200, pontos: null, velocidadeLimiteKmh: null, permanenciaMaxMin: 30 });

    const poly = { ...circ, forma: 'poligono' as const, centro: null, raioM: null, pontos: [[0, 0], [0, 1], [1, 1]] as [number, number][], prioridadeAlerta: 'alta' as const };
    const fp = cercaToFence(poly);
    expect(fp).toMatchObject({ shape: 'polygon', points: [[0, 0], [0, 1], [1, 1]], alertPriority: 'alta' });
    expect(fenceToCercaBody({ ...fp, speedLimit: '' })).toMatchObject({ forma: 'poligono', centro: null, raioM: null, prioridadeAlerta: 'alta', velocidadeLimiteKmh: null });
  });
});

describe('alertas: API → store', () => {
  const base = { id: 'x1', assetId: 'a1', origem: 'cerca' as const, tipo: 'cerca_entrada', titulo: 'Entrada em Pátio', detalhe: null, prioridade: 'alta' as const, ts: '2026-01-01T12:00:00.000Z', lidoEm: null, tratadoEm: null, tratadoPor: null, motivo: null, obs: null };

  it('aberto e não lido; detalhe cai para a placa', () => {
    expect(alertaToAlert(base, 'ABC1D23')).toEqual({ id: 'al:lc:x1', ts: Date.parse(base.ts), assetId: 'lc_a1', title: 'Entrada em Pátio', detail: 'ABC1D23', priority: 'alta', read: false, source: 'cerca' });
    expect(alertaIdOf('al:lc:x1')).toBe('x1');
    expect(alertaIdOf('al_local')).toBeNull();
  });

  it('tratado leva quem, quando, motivo e observação', () => {
    const t = alertaToAlert({ ...base, lidoEm: base.ts, tratadoEm: '2026-01-01T13:00:00.000Z', tratadoPor: 'g@x.com', motivo: 'Falso positivo', obs: 'ok' });
    expect(t).toMatchObject({ read: true, resolvedAt: Date.parse('2026-01-01T13:00:00.000Z'), resolvedBy: 'g@x.com', resolvedReason: 'Falso positivo', resolvedNote: 'ok' });
  });
});

describe('regras: API ↔ tela', () => {
  it('ida e volta; valor da condição sempre texto; groupId não vai para a API', () => {
    const api = { id: 'r1', nome: 'Após 22h', ativa: true, prioridade: 'media' as const, condicoes: [{ field: 'horario', op: 'depois de', value: '22:00' }], acoes: { painel: true }, disparos30d: 3 };
    const rule = regraToRule(api);
    expect(rule).toEqual({ id: 'r1', name: 'Após 22h', active: true, priority: 'media', conditions: api.condicoes, actions: { painel: true }, disparos30d: 3 });
    const body = ruleToRegraBody({ ...rule, groupId: 'g1', conditions: [{ field: 'velocidade', op: '>', value: 90 }] });
    expect(body).toEqual({ nome: 'Após 22h', ativa: true, prioridade: 'media', condicoes: [{ field: 'velocidade', op: '>', value: '90' }], acoes: { painel: true } });
  });
});

describe('eventos → Replay', () => {
  const base = { id: '7', ts: '2026-01-01T12:00:00.000Z', latitude: -8, longitude: -34, speedKmh: '61.4', attributes: null };
  it('mapeia para o catálogo do produto quando existe equivalente; senão usa rótulo próprio', () => {
    expect(eventoToReplay({ ...base, tipo: 'hardBraking' })).toMatchObject({ id: 'ev:lc:7', type: 'frenagem_brusca', pos: [-8, -34], value: 61 });
    expect(eventoToReplay({ ...base, tipo: 'sos' })).toMatchObject({ type: 'sos', label: 'Pânico (SOS)' });
    expect(eventoToReplay({ ...base, tipo: 'cerca_entrada', attributes: { nome: 'Pátio' } })?.label).toBe('Entrada em Pátio');
    expect(eventoToReplay({ ...base, tipo: 'regra', attributes: { nome: 'Após 22h', ranking: true } })).toMatchObject({ type: 'fora_horario', label: 'Regra: Após 22h' });
  });
  it('evento sem posição fica fora do mapa', () => {
    expect(eventoToReplay({ ...base, tipo: 'sos', latitude: null, longitude: null })).toBeNull();
  });
});
