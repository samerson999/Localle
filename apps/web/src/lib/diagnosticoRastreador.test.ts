import { describe, expect, it } from 'vitest';
import { firmwareDe, haQuanto, itensDoDiagnostico, itensDosSinaisMotor, leituraAntiga, semFixDeGps, situacaoTransmissao, sugerirMapeamento, valorDoSinal } from './diagnosticoRastreador';
import type { DiagnosticoRastreador, SinaisMotorDiagnostico } from './localleApi';

const agora = Date.parse('2026-11-04T12:00:00Z');
const modelo = { nome: 'JMAK JR12', protocolo: 'jmak', porta: 5259 };
const base: DiagnosticoRastreador = {
  imei: '868695060665955', status: 'ativo', modeloId: 'm1', protocoloDetectado: 'jmak', traccarDeviceId: '10', online: true,
  ultimoPacoteEm: '2026-11-04T11:55:00Z', atributos: { versionFw: 'JR12_V1.3' }, atributosEm: '2026-11-04T11:55:00Z', atributosVistosEm: {},
  telemetria: { tensaoV: 12.5, satelites: 11, sinalGsm: 3, bloqueado: false },
  ultimaPosicao: { em: '2026-11-04T11:55:00Z', latitude: -3.731862, longitude: -38.526669, velocidadeKmh: 0, ignicao: false },
  ficha: { traccar: { configurado: true, versao: '6.17.0', erro: null }, protocolo: { ativo: true, porta: 5259, transporte: 'ALL' }, comandos: null },
  comandos: ['engineStop', 'engineResume', 'custom'],
  sinaisMotor: { suporteCan: 'nao_informado', esperados: [], sinais: [] },
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

  it('alimentação: cortada vira item crítico com a tensão e a idade; sem tensão, o `charge` conta como lido', () => {
    const cortada = { ...base, telemetria: { ...base.telemetria, tensaoV: 0.7, alimentacaoExterna: false, lidaEm: { tensaoV: '2026-11-04T11:50:00Z', satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: '2026-11-04T11:50:00Z' } } };
    expect(tom(cortada)).toMatchObject({ Telemetria: 'ok', 'Alimentação': 'crit' });
    expect(itensDoDiagnostico(cortada, modelo, agora).find((i) => i.etapa === 'Alimentação')?.texto).toMatch(/^Alimentação externa cortada \(0.7 V no fio\), lida há 10 min/);

    const gt06 = { ...base, telemetria: { tensaoV: null, satelites: 15, sinalGsm: 5, bloqueado: false, alimentacaoExterna: true } };
    expect(tom(gt06)).toEqual(expect.not.objectContaining({ 'Alimentação': expect.anything() }));
    expect(itensDoDiagnostico(gt06, modelo, agora).find((i) => i.etapa === 'Telemetria')).toMatchObject({ tom: 'ok', texto: 'Lido: alimentação ligada, sinal 5/5, desbloqueado.' });
    expect(itensDoDiagnostico({ ...gt06, telemetria: { ...gt06.telemetria, alimentacaoExterna: false } }, modelo, agora).find((i) => i.etapa === 'Alimentação')?.texto).toMatch(/^Alimentação externa cortada: o aparelho/);
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

describe('itensDosSinaisMotor (dados do painel)', () => {
  const sinal = (o: Partial<SinaisMotorDiagnostico['sinais'][number]>): SinaisMotorDiagnostico['sinais'][number] => ({
    sinal: 'rpm', status: 'recebido', motivo: 'Recebido em rpm', ultimoValor: 1850, ultimaLeituraEm: '2026-11-04T11:58:00Z',
    ultimoRecebimentoEm: '2026-11-04T11:58:01Z', atributo: 'rpm', avaliadoAte: '2026-11-04T11:58:00Z', ...o,
  });

  it('modelo sem ficha e nada avaliado: nenhum item (nada é cobrado)', () => {
    expect(itensDosSinaisMotor({ suporteCan: 'nao_informado', esperados: [], sinais: [] }, agora)).toEqual([]);
  });

  it('sinal prometido sem avaliação é "não verificado"; avaliado sem ser prometido também aparece', () => {
    const itens = itensDosSinaisMotor({ suporteCan: 'nativo', esperados: ['rpm', 'combustivel'], sinais: [sinal({ sinal: 'odometro', ultimoValor: 40764145, atributo: 'obdOdometer' })] }, agora);
    expect(itens.map((i) => [i.etapa, i.tom])).toEqual([['RPM', 'info'], ['Odômetro do painel', 'ok'], ['Combustível', 'info']]);
    expect(itens[0].texto).toMatch(/^Não verificado/);
    expect(itens[1].texto).toBe('Recebido: 40.764,1 km há 2 min (obdOdometer).');
  });

  it('não recebido: dica conforme a capacidade do modelo e se o dado já chegava antes', () => {
    const nunca = sinal({ status: 'nao_recebido', motivo: 'Não chegou em 5 posições com o veículo em movimento (atributo rpm)', ultimoValor: null, ultimaLeituraEm: null });
    expect(itensDosSinaisMotor({ suporteCan: 'com_acessorio', esperados: ['rpm'], sinais: [nunca] }, agora)[0]).toMatchObject({ tom: 'crit', texto: expect.stringMatching(/adaptador CAN/) });
    expect(itensDosSinaisMotor({ suporteCan: 'nativo', esperados: ['rpm'], sinais: [nunca] }, agora)[0].texto).toMatch(/fio CAN no chicote/);
    const parou = sinal({ status: 'nao_recebido', motivo: 'Parou de chegar: 5 posições em movimento sem rpm' });
    expect(itensDosSinaisMotor({ suporteCan: 'nativo', esperados: ['rpm'], sinais: [parou] }, agora)[0].texto)
      .toBe('Parou de chegar: 5 posições em movimento sem rpm. Veja se o chicote ou o adaptador foi mexido (oficina) ou se outro aparelho entrou na rede CAN. Última leitura: 1.850 rpm há 2 min (rpm).');
  });

  it('fora do esperado e aguardando', () => {
    const fora = sinal({ status: 'fora_do_esperado', motivo: 'Valor fora do esperado em rpm: 65535' });
    expect(itensDosSinaisMotor({ suporteCan: 'nativo', esperados: ['rpm'], sinais: [fora] }, agora)[0]).toMatchObject({ tom: 'warn', texto: expect.stringMatching(/Última leitura válida: 1\.850 rpm/) });
    const aguardando = sinal({ status: 'aguardando', motivo: 'Aguardando o veículo em movimento para conferir', ultimoValor: null, ultimaLeituraEm: null });
    expect(itensDosSinaisMotor({ suporteCan: 'nativo', esperados: ['rpm'], sinais: [aguardando] }, agora)[0]).toEqual({ etapa: 'RPM', tom: 'info', texto: 'Aguardando o veículo em movimento para conferir.' });
  });

  it('unidades: combustível pelo atributo, horímetro do Traccar em ms', () => {
    expect(valorDoSinal('combustivel', 62.5, 'fuelLevel')).toBe('62,5%');
    expect(valorDoSinal('combustivel', 48, 'fuel')).toBe('48 L');
    expect(valorDoSinal('combustivel', 48, 'io89')).toBe('48');
    expect(valorDoSinal('horimetro', 7_200_000, 'hours')).toBe('2 h');
  });
});

describe('idade das leituras', () => {
  it('leitura antiga ganha a idade; recente ou sem data, não', () => {
    expect(leituraAntiga('2026-11-03T12:00:00Z', agora)).toBe('há 24 h');
    expect(leituraAntiga('2026-11-04T11:30:00Z', agora)).toBeNull();
    expect(leituraAntiga(null, agora)).toBeNull();
  });

  it('o caso do JR12: pacotes chegando, mas a tensão é do `vin` de ontem — o diagnóstico avisa em vez de dar ok', () => {
    const d: DiagnosticoRastreador = {
      ...base,
      telemetria: { tensaoV: 0.72, satelites: 0, sinalGsm: 5, bloqueado: false, lidaEm: { tensaoV: '2026-11-03T18:37:45Z', satelites: '2026-11-04T11:55:00Z', sinalGsm: '2026-11-04T11:55:00Z', bloqueado: '2026-11-03T18:37:45Z' } },
    };
    const item = itensDoDiagnostico(d, modelo, agora).find((i) => i.etapa === 'Telemetria')!;
    expect(item.tom).toBe('warn');
    expect(item.texto).toMatch(/^Valor antigo: tensão \(lido há 17 h\), estado de bloqueio \(lido há 17 h\)\. O aparelho continua mandando pacotes/);
    // tudo recente: segue ok
    expect(tom({ ...base, telemetria: { ...base.telemetria, lidaEm: { tensaoV: '2026-11-04T11:55:00Z', satelites: null, sinalGsm: '2026-11-04T11:55:00Z', bloqueado: null } } }).Telemetria).toBe('ok');
  });
});
