import { describe, expect, it } from 'vitest';
import { firmwareDe, haQuanto, itensDoDiagnostico, semFixDeGps, situacaoTransmissao, sugerirMapeamento } from './diagnosticoRastreador';
import type { DiagnosticoRastreador } from './localleApi';

const agora = Date.parse('2026-11-04T12:00:00Z');
const modelo = { nome: 'JMAK JR12', protocolo: 'jmak', porta: 5259 };
const base: DiagnosticoRastreador = {
  imei: '868695060665955', status: 'ativo', modeloId: 'm1', protocoloDetectado: 'jmak', traccarDeviceId: '10', online: true,
  ultimoPacoteEm: '2026-11-04T11:55:00Z', atributos: { versionFw: 'JR12_V1.3' }, atributosEm: '2026-11-04T11:55:00Z',
  telemetria: { tensaoV: 12.5, satelites: 11, sinalGsm: 3, bloqueado: false },
  ultimaPosicao: { em: '2026-11-04T11:55:00Z', latitude: -3.731862, longitude: -38.526669, velocidadeKmh: 0, ignicao: false },
  ficha: { traccar: { configurado: true, versao: '6.17.0', erro: null }, protocolo: { ativo: true, porta: 5259, transporte: 'ALL' }, comandos: null },
  comandos: ['engineStop', 'engineResume', 'custom'],
};
const tom = (d: DiagnosticoRastreador, m = modelo) => Object.fromEntries(itensDoDiagnostico(d, m, agora).map((i) => [i.etapa, i.tom]));

describe('itensDoDiagnostico', () => {
  it('tudo certo: todas as etapas ok, firmware informado', () => {
    expect(tom(base)).toEqual({ Modelo: 'ok', Traccar: 'ok', 'Conexão': 'ok', GPS: 'ok', Protocolo: 'ok', Telemetria: 'ok', Comandos: 'ok', Firmware: 'info' });
    expect(itensDoDiagnostico(base, modelo, agora).at(-1)?.texto).toBe('firmware JR12_V1.3');
  });

  it('sem modelo: para no primeiro item', () => {
    expect(itensDoDiagnostico(base, null, agora)).toEqual([expect.objectContaining({ etapa: 'Modelo', tom: 'crit' })]);
  });

  it('nunca conectou: conexão crítica com o que conferir; protocolo e comandos aguardando', () => {
    const d = { ...base, online: false, ultimoPacoteEm: null, protocoloDetectado: null, atributosEm: null, atributos: {}, comandos: null };
    const itens = itensDoDiagnostico(d, modelo, agora);
    expect(tom(d)).toMatchObject({ 'Conexão': 'crit', Protocolo: 'info', Telemetria: 'info', Comandos: 'info' });
    expect(itens.find((i) => i.etapa === 'Conexão')?.texto).toMatch(/porta 5259/);
  });

  it('protocolo divergente, porta diferente no Traccar, sem bloqueio e telemetria parcial', () => {
    const d: DiagnosticoRastreador = {
      ...base, online: false, protocoloDetectado: 'huabao', comandos: ['custom'],
      telemetria: { tensaoV: null, satelites: 9, sinalGsm: 2, bloqueado: null },
      ficha: { ...base.ficha!, protocolo: { ativo: true, porta: 5015, transporte: 'TCP' } },
    };
    expect(tom(d)).toMatchObject({ Traccar: 'warn', 'Conexão': 'warn', Protocolo: 'crit', Telemetria: 'warn', Comandos: 'warn' });
    expect(itensDoDiagnostico(d, modelo, agora).find((i) => i.etapa === 'Telemetria')?.texto).toMatch(/Não lido: tensão, estado de bloqueio/);
  });

  it('Traccar fora do ar ou antigo', () => {
    expect(tom({ ...base, ficha: { ...base.ficha!, traccar: { configurado: true, versao: null, erro: 'O Traccar não respondeu.' } } }).Traccar).toBe('crit');
    expect(tom({ ...base, ficha: { ...base.ficha!, protocolo: null } }).Traccar).toBe('info');
    expect(tom({ ...base, ficha: { ...base.ficha!, protocolo: { ativo: false, porta: null, transporte: null } } }).Traccar).toBe('crit');
  });
});

describe('sugerirMapeamento', () => {
  const vazio = { atributo_tensao: null, sinal_max: null, atributo_bloqueio: null };

  it('JR12 real: tensão em vin (mV), sinal 0–31 e bloqueio em out1', () => {
    const a = { vin: 12507, battery: 3880, ignition: true, out1: false, rssi: 21, sat: 11 };
    expect(sugerirMapeamento(a, vazio).map((s) => [s.campo, s.valor])).toEqual([['atributoTensao', 'vin'], ['sinalMax', '31'], ['atributoBloqueio', 'out1']]);
  });

  it('chaves padrão do Traccar presentes ou modelo já mapeado: nada a sugerir', () => {
    expect(sugerirMapeamento({ power: 12.6, rssi: 4, blocked: false, adc1: 13 }, vazio)).toEqual([]);
    expect(sugerirMapeamento({ vin: 12507, rssi: 21, out1: false }, { atributo_tensao: 'vin', sinal_max: 31, atributo_bloqueio: 'out1' })).toEqual([]);
  });

  it('não sugere fora da faixa física nem nome que não é de tensão', () => {
    expect(sugerirMapeamento({ adc1: 0.4, temp1: 25, battery: 3.9 }, vazio)).toEqual([]);
  });
});

describe('firmwareDe', () => {
  it('lê versionFw/versionHw; ausente = null', () => {
    expect(firmwareDe({ versionFw: '1.2', versionHw: 3 })).toEqual({ fw: '1.2', hw: '3' });
    expect(firmwareDe({})).toEqual({ fw: null, hw: null });
  });
});

describe('GPS no diagnóstico', () => {
  const gps = (d: DiagnosticoRastreador) => itensDoDiagnostico(d, modelo, agora).find((i) => i.etapa === 'GPS');
  it('posição recente: ok com coordenadas', () => {
    expect(gps(base)).toMatchObject({ tom: 'ok', texto: 'Posição de há 5 min: -3.73186, -38.52667.' });
  });
  it('comunica sem posição nenhuma ou com posição velha: aviso', () => {
    expect(gps({ ...base, ultimaPosicao: null })?.tom).toBe('warn');
    expect(gps({ ...base, ultimaPosicao: { ...base.ultimaPosicao!, em: '2026-11-04T10:00:00Z' } })).toMatchObject({ tom: 'warn', texto: expect.stringMatching(/há 2 h/) });
  });
  it('nunca comunicou: sem etapa de GPS (a conexão já diz o que fazer)', () => {
    expect(gps({ ...base, ultimoPacoteEm: null, ultimaPosicao: null })).toBeUndefined();
  });
});

describe('situacaoTransmissao', () => {
  it('nunca, agora (até 10 min), recente (até 24 h) e parou', () => {
    expect(situacaoTransmissao(null, agora)).toBe('nunca');
    expect(situacaoTransmissao('2026-11-04T11:50:00Z', agora)).toBe('agora');
    expect(situacaoTransmissao('2026-11-04T11:49:00Z', agora)).toBe('recente');
    expect(situacaoTransmissao('2026-11-03T12:00:00Z', agora)).toBe('recente');
    expect(situacaoTransmissao('2026-11-03T11:59:00Z', agora)).toBe('parou');
  });
  it('sem fix de GPS: pacote sem posição, ou posição mais de 10 min antes do pacote', () => {
    expect(semFixDeGps(null, null)).toBe(false);
    expect(semFixDeGps('2026-11-04T11:55:00Z', null)).toBe(true);
    expect(semFixDeGps('2026-11-04T11:55:00Z', '2026-11-04T11:50:00Z')).toBe(false);
    expect(semFixDeGps('2026-11-04T11:55:00Z', '2026-11-04T11:40:00Z')).toBe(true);
  });
  it('haQuanto: abaixo de 1 min não vira "0 min"', () => {
    expect(haQuanto('2026-11-04T11:59:50Z', agora)).toBe('menos de 1 min');
  });
});
