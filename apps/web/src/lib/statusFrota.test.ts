import { describe, expect, it } from 'vitest';
import { applyComunicacao, toVehicle, type CurrentRow } from './localleMap';
import { contarStatusFrota, ignicaoAtual, vehicleStatus } from './store';

const row = (o: Partial<CurrentRow> = {}): CurrentRow => ({
  assetId: 'a1', plate: 'ABC1D23', fixTime: new Date(Date.now() - 60_000).toISOString(), longitude: -34.9, latitude: -8.05,
  speedKmh: '0', ignition: true, rastreadorId: 'r1', ultimoPacoteEm: new Date(Date.now() - 30_000).toISOString(), comunicacao: 'online', ...o,
});
const v = (o: Partial<CurrentRow> = {}) => toVehicle(row(o), undefined);

// AUD-02 (AUDITORIA_KPIS_TELEMETRIA.md): o tile "Sem sinal" somava os desligados — veículo estacionado de motor
// desligado, comunicando normalmente, aparecia como sem sinal.
describe('contarStatusFrota (tiles do Monitoramento)', () => {
  it('veículo online, parado e desligado conta como Desligado, nunca como Sem sinal', () => {
    expect(vehicleStatus(v({ ignition: false })).key).toBe('des');
    expect(contarStatusFrota([v({ ignition: false })])).toEqual({ mov: 0, par: 0, des: 1, pnd: 0, sem: 0 });
  });

  it('separa os cinco status e a soma é o total da frota', () => {
    const frota = [
      v({ speedKmh: '50' }),                    // em movimento
      v({ ignition: true }),                    // parado ligado
      v({ ignition: false }),                   // desligado
      v({ ignition: null }),                    // parado, sem ignição informada
      v({ comunicacao: 'sem_sinal' }),          // sem sinal
      v({ comunicacao: 'sem_gps', speedKmh: '50' }), // comunica sem fix: sem sinal, não em movimento
      undefined,                                // ainda sem posição
    ];
    const c = contarStatusFrota(frota);
    expect(c).toEqual({ mov: 1, par: 1, des: 1, pnd: 1, sem: 3 });
    expect(c.mov + c.par + c.des + c.pnd + c.sem).toBe(frota.length);
  });

  it('frota vazia zera todos os tiles', () => {
    expect(contarStatusFrota([])).toEqual({ mov: 0, par: 0, des: 0, pnd: 0, sem: 0 });
  });
});

// 12/11/2026: o status vinha da última posição válida sem olhar a idade — aparelho que perdeu o GPS andando ficava
// "Em movimento" até o limite de sem sinal (48 h).
describe('posição recente (10 min) para afirmar movimento ou ignição ligada', () => {
  const min = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  it('andando ou ligado com posição de mais de 10 min vira Sem posição recente, no tile Sem sinal', () => {
    expect(vehicleStatus(v({ fixTime: min(11), speedKmh: '60' }))).toEqual({ key: 'sem', label: 'Sem posição recente' });
    expect(vehicleStatus(v({ fixTime: min(11), ignition: true }))).toEqual({ key: 'sem', label: 'Sem posição recente' });
  });

  it('até 10 min o status continua o da posição', () => {
    expect(vehicleStatus(v({ fixTime: min(9), speedKmh: '60' })).key).toBe('mov');
    expect(vehicleStatus(v({ fixTime: min(9), ignition: true })).key).toBe('par');
  });

  it('desligado ou parado sem ignição continua igual com posição antiga (aparelho estacionado reporta menos)', () => {
    expect(vehicleStatus(v({ fixTime: min(120), ignition: false })).key).toBe('des');
    expect(vehicleStatus(v({ fixTime: min(120), ignition: null })).key).toBe('pnd');
  });

  it('a hora de referência pode ser passada (as telas re-renderizam com o relógio)', () => {
    const andando = v({ speedKmh: '60' }); // posição de 1 min atrás
    expect(vehicleStatus(andando, Date.now()).key).toBe('mov');
    expect(vehicleStatus(andando, Date.now() + 10 * 60_000).key).toBe('sem');
  });
});

// AUD-03: o status de comunicação era lido só no login, e o front aplicava 6 h fixas sobre o fixTime.
describe('status de comunicação vindo do backend', () => {
  const horas = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

  it('veículo que parou de transmitir em movimento vira Sem sinal na próxima carga da frota', () => {
    const andando = v({ speedKmh: '60' });
    expect(vehicleStatus(andando).key).toBe('mov');
    const recarga = toVehicle(row({ speedKmh: '60', comunicacao: 'sem_sinal' }), andando);
    expect(vehicleStatus(recarga).key).toBe('sem');
  });

  it('o limite do cliente vale, não as 6 h fixas: posição de 7 h que o backend considera online não é Sem sinal', () => {
    // cliente com monitoramento.sem_sinal_h = 12: o backend responde online
    expect(vehicleStatus(v({ fixTime: horas(7), ignition: false })).key).toBe('des');
  });

  it('carga periódica mais velha que a posição do tempo real não volta o veículo no mapa', () => {
    const tempoReal = { ...v(), pos: [-8.1, -34.9], lastUpdate: Date.now() };
    expect(toVehicle(row({ fixTime: horas(0.01) }), tempoReal)).toBe(tempoReal);
  });

  it('veículo da integração antiga (sem comunicacao do backend) mantém o corte de 6 h', () => {
    expect(vehicleStatus({ noSignal: false, lastUpdate: Date.now() - 7 * 3600_000, moving: false }).key).toBe('sem');
  });
});

// Recálculo periódico do backend entregue pelo stream (kind 'comunicacao'), no lugar da releitura da frota por aba.
describe('applyComunicacao', () => {
  const item = (comunicacao: CurrentRow['comunicacao'], fixTime: string | null) => ({ assetId: 'a1', comunicacao, fixTime });

  it('aparelho que calou: o recálculo do backend vira o veículo para Sem sinal sem posição nova', () => {
    const andando = v({ speedKmh: '60' });
    const depois = applyComunicacao(andando, item('sem_sinal', new Date(andando.lastUpdate).toISOString()));
    expect(vehicleStatus(depois).key).toBe('sem');
  });

  it('item calculado antes de uma posição que o tempo real já entregou é ignorado', () => {
    const tempoReal = { ...v(), lastUpdate: Date.now() };
    expect(applyComunicacao(tempoReal, item('sem_sinal', new Date(Date.now() - 60_000).toISOString()))).toBeNull();
  });

  it('nada muda quando o status é o mesmo, ou quando o ativo ainda não tem veículo na tela', () => {
    expect(applyComunicacao(v(), item('online', null))).toBeNull();
    expect(applyComunicacao(undefined, item('sem_sinal', null))).toBeNull();
  });
});

describe('rótulos de dado ausente', () => {
  it('rastreador sem ignição: Parado, nunca Desligado (decisão de 12/11, substitui a de 31/10); a ignição segue null', () => {
    const semIgnicao = v({ ignition: null });
    expect(semIgnicao.ignition).toBeNull();
    expect(vehicleStatus(semIgnicao)).toEqual({ key: 'pnd', label: 'Parado' });
  });

  it('aparelho que fala sem GPS válido conta em Sem sinal com rótulo Sem GPS', () => {
    expect(vehicleStatus(v({ comunicacao: 'sem_gps' }))).toEqual({ key: 'sem', label: 'Sem GPS' });
    expect(vehicleStatus(v({ comunicacao: 'sem_sinal' }))).toEqual({ key: 'sem', label: 'Sem sinal' });
  });

  it('rastreador que ainda não mandou posição conta em Sem sinal com rótulo próprio', () => {
    expect(vehicleStatus(undefined)).toEqual({ key: 'sem', label: 'Aguardando 1ª posição' });
  });
});

// 12/11/2026: pacote sem GPS não atualiza a posição, mas traz a ignição — o motor desligado na garagem seguia "ligado".
describe('ignição do último pacote (com ou sem GPS)', () => {
  const depois = (s: number, base: number) => new Date(base + s * 1000).toISOString();

  it('pacote mais novo que a posição dizendo desligado: Desligado, mesmo com a última posição andando', () => {
    const andando = v({ speedKmh: '60' });
    const veio = applyComunicacao(andando, { assetId: 'a1', comunicacao: 'online', fixTime: new Date(andando.lastUpdate).toISOString(), ignicao: false, ignicaoEm: depois(90, andando.lastUpdate) });
    expect(ignicaoAtual(veio)).toBe(false);
    expect(vehicleStatus(veio).key).toBe('des');
  });

  it('pacote do mesmo instante da posição (até 1 min) não passa por cima da ignição da posição', () => {
    const ligado = v({ ignition: true });
    const veio = applyComunicacao(ligado, { assetId: 'a1', comunicacao: 'online', fixTime: new Date(ligado.lastUpdate).toISOString(), ignicao: false, ignicaoEm: depois(30, ligado.lastUpdate) });
    expect(ignicaoAtual(veio)).toBe(true);
    expect(vehicleStatus(veio).key).toBe('par');
  });

  it('recálculo sem mudança de comunicação nem de ignição não mexe no veículo', () => {
    const p = v();
    expect(applyComunicacao(p, { assetId: 'a1', comunicacao: 'online', fixTime: null, ignicao: null, ignicaoEm: null })).toBeNull();
  });

  it('carga da frota traz a ignição do último pacote na telemetria', () => {
    const fix = Date.now() - 20 * 60_000;
    const veiculo = toVehicle(row({ fixTime: new Date(fix).toISOString(), speedKmh: '50', ignition: true,
      telemetria: { tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: null, ignicao: false,
        lidaEm: { tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: null, ignicao: depois(300, fix) } } }), undefined);
    expect(vehicleStatus(veiculo)).toEqual({ key: 'des', label: 'Desligado' });
  });
});
