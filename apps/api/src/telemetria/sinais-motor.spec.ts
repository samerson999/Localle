import { describe, expect, it } from 'vitest';
import {
  avaliarSinal, lerSinal, mapeamentoSinaisDaLinha, POSICOES_PARA_NAO_RECEBIDO, SEM_MAPEAMENTO_SINAIS,
  type ContextoPosicao, type EstadoSinal, type MapeamentoSinais,
} from './sinais-motor';

// Atributos reais do JR12 em bancada na HML (tc_positions, 03/11/2026): sem veículo, sem CAN; `vin` é tensão em mV.
const JR12_BANCADA = { sat: 16, rssi: 27, ignition: true, vin: 13356, battery: 3946, in1: true, canStatus: 0, hours: 508777869, motion: true };

const t = (min: number) => new Date(Date.UTC(2026, 10, 4, 12, min));
const ctx = (min: number, o: Partial<ContextoPosicao> = {}): ContextoPosicao => ({
  fixTime: t(min), serverTime: new Date(t(min).getTime() + 1000), gpsValido: true, velocidadeKmh: 40, ...o,
});
const COM_RPM: MapeamentoSinais = { ...SEM_MAPEAMENTO_SINAIS, suporteCan: 'nativo', sinaisMotor: ['rpm', 'odometro'] };

/** Aplica as posições em sequência, como a ingestão faz, e devolve o último estado gravado. */
function sequencia(
  sinal: 'rpm' | 'odometro' | 'combustivel',
  passos: { attrs: Record<string, unknown>; ctx: ContextoPosicao }[],
  m: MapeamentoSinais = COM_RPM,
  inicial: EstadoSinal | null = null,
) {
  let estado = inicial;
  for (const p of passos) {
    const novo = avaliarSinal(sinal, estado, lerSinal(p.attrs, sinal, m), p.ctx, m.sinaisMotor.includes(sinal));
    if (novo) estado = novo;
  }
  return estado;
}

describe('lerSinal', () => {
  it('lê a chave padrão do Traccar e distingue 0, ausente e inválido', () => {
    expect(lerSinal({ rpm: 0 }, 'rpm')).toEqual({ tipo: 'valida', atributo: 'rpm', valor: 0 });
    expect(lerSinal({ rpm: 1850 }, 'rpm')).toEqual({ tipo: 'valida', atributo: 'rpm', valor: 1850 });
    expect(lerSinal({}, 'rpm')).toEqual({ tipo: 'ausente', atributo: 'rpm' });
    expect(lerSinal({ rpm: null }, 'rpm')).toEqual({ tipo: 'ausente', atributo: 'rpm' });
    expect(lerSinal({ rpm: 65535 }, 'rpm')).toEqual({ tipo: 'invalida', atributo: 'rpm', bruto: '65535' });
    expect(lerSinal({ rpm: -1 }, 'rpm').tipo).toBe('invalida');
    expect(lerSinal({ rpm: '1850' }, 'rpm')).toEqual({ tipo: 'invalida', atributo: 'rpm', bruto: '"1850"' });
  });

  it('usa o atributo do modelo quando configurado (ex.: Teltonika manda parte como ioNN)', () => {
    const m: MapeamentoSinais = { ...COM_RPM, atributos: { ...COM_RPM.atributos, rpm: 'io85' } };
    expect(lerSinal({ io85: 2100, rpm: 9 }, 'rpm', m)).toEqual({ tipo: 'valida', atributo: 'io85', valor: 2100 });
  });

  it('odômetro padrão é o do painel (obdOdometer), não o hodômetro do aparelho; horímetro só com mapeamento', () => {
    expect(lerSinal({ odometer: 4115170 }, 'odometro')).toEqual({ tipo: 'ausente', atributo: 'obdOdometer' });
    expect(lerSinal({ hours: 508777869 }, 'horimetro')).toEqual({ tipo: 'sem_atributo' });
  });

  it('JR12 em bancada: nenhum atributo vira sinal de motor — `vin` (tensão) e `hours` (contado pela ignição) ficam de fora', () => {
    for (const s of ['rpm', 'odometro', 'combustivel'] as const) expect(lerSinal(JR12_BANCADA, s).tipo).toBe('ausente');
    expect(lerSinal(JR12_BANCADA, 'horimetro').tipo).toBe('sem_atributo');
  });

  it('mapeamento do catálogo: suporte desconhecido vira "não informado" e sinal desconhecido é ignorado', () => {
    const m = mapeamentoSinaisDaLinha({
      suporte_can: 'talvez', sinais_motor: ['rpm', 'pressao'], atributo_rpm: null, atributo_odometro: 'io87', atributo_combustivel: null, atributo_horimetro: null,
    });
    expect(m.suporteCan).toBe('nao_informado');
    expect(m.sinaisMotor).toEqual(['rpm']);
    expect(m.atributos.odometro).toBe('io87');
  });
});

describe('avaliarSinal — critérios de aceite do P0 (docs/PESQUISA-REDE-CAN.md § 6.4)', () => {
  it('1. RPM igual a zero é leitura válida', () => {
    const e = sequencia('rpm', [{ attrs: { rpm: 0, ignition: true }, ctx: ctx(0, { velocidadeKmh: 0 }) }]);
    expect(e).toMatchObject({ status: 'recebido', ultimoValor: 0, atributoOrigem: 'rpm' });
  });

  it('2. atributo ausente não reaproveita a leitura anterior como nova', () => {
    const e = sequencia('rpm', [
      { attrs: { rpm: 1850 }, ctx: ctx(0) },
      { attrs: {}, ctx: ctx(1) },
      { attrs: {}, ctx: ctx(2) },
    ]);
    // o último valor válido continua sendo o das 12:00; a contagem de posições sem o sinal anda
    expect(e).toMatchObject({ status: 'recebido', ultimoValor: 1850, ultimaLeituraEm: t(0), semSinalEmOperacao: 2, avaliadoAte: t(2) });
  });

  it('3. atributo presente com valor impossível vira "fora do esperado", sem perder a última leitura válida', () => {
    const e = sequencia('rpm', [
      { attrs: { rpm: 1850 }, ctx: ctx(0) },
      { attrs: { rpm: 65535 }, ctx: ctx(1) },
    ]);
    expect(e).toMatchObject({ status: 'fora_do_esperado', ultimoValor: 1850, ultimaLeituraEm: t(0), motivo: 'Valor fora do esperado em rpm: 65535' });
  });

  it('4. ignição ligada sem o veículo andar não gera "RPM não recebido"', () => {
    const parado = Array.from({ length: 50 }, (_, i) => ({ attrs: { ignition: true }, ctx: ctx(i, { velocidadeKmh: 0 }) }));
    expect(sequencia('rpm', parado)).toMatchObject({ status: 'aguardando', semSinalEmOperacao: 0 });
  });

  it('5. posição atrasada não sobrescreve medição mais recente nem reabre o estado', () => {
    const recente = sequencia('rpm', [{ attrs: { rpm: 2000 }, ctx: ctx(10) }])!;
    expect(avaliarSinal('rpm', recente, lerSinal({ rpm: 900 }, 'rpm'), ctx(5), true)).toBeNull();
    expect(avaliarSinal('rpm', recente, lerSinal({ rpm: 70000 }, 'rpm'), ctx(10), true)).toBeNull(); // mesmo instante
  });

  it('6. modelo sem ficha (sinal não prometido) não é cobrado pelo que nunca chegou', () => {
    const andando = Array.from({ length: 50 }, (_, i) => ({ attrs: {}, ctx: ctx(i) }));
    expect(sequencia('rpm', andando, SEM_MAPEAMENTO_SINAIS)).toBeNull();
    // mas o que chega é registrado, e parar de chegar depois é cobrado (há histórico)
    const e = sequencia('rpm', [{ attrs: { rpm: 1500 }, ctx: ctx(0) }, ...andando.map((p, i) => ({ ...p, ctx: ctx(i + 1) }))], SEM_MAPEAMENTO_SINAIS);
    expect(e).toMatchObject({ status: 'nao_recebido', ultimoValor: 1500 });
    expect(e!.motivo).toMatch(/^Parou de chegar/);
  });

  it('7. o `vin` do JR12 (tensão) nunca é lido como sinal, nem com o modelo prometendo os sinais', () => {
    const jr12: MapeamentoSinais = { ...SEM_MAPEAMENTO_SINAIS, suporteCan: 'nativo', sinaisMotor: ['rpm', 'odometro', 'combustivel'] };
    for (const s of ['rpm', 'odometro', 'combustivel'] as const) {
      const e = avaliarSinal(s, null, lerSinal(JR12_BANCADA, s, jr12), ctx(0, { velocidadeKmh: 0 }), true);
      expect(e).toMatchObject({ status: 'aguardando', ultimoValor: null });
    }
  });

  it('8. sem GPS (ou sem pacote) não é falha de CAN: ausência só conta com posição válida em movimento', () => {
    const semGps = Array.from({ length: 50 }, (_, i) => ({ attrs: {}, ctx: ctx(i, { gpsValido: false, velocidadeKmh: 60 }) }));
    expect(sequencia('rpm', semGps)).toMatchObject({ status: 'aguardando', semSinalEmOperacao: 0 });
    const semVelocidade = Array.from({ length: 50 }, (_, i) => ({ attrs: {}, ctx: ctx(i, { velocidadeKmh: null }) }));
    expect(sequencia('rpm', semVelocidade)).toMatchObject({ status: 'aguardando', semSinalEmOperacao: 0 });
  });
});

describe('avaliarSinal — "não recebido"', () => {
  it('sinal prometido que não chega em N posições em movimento vira "não recebido"; uma leitura válida volta a "recebido"', () => {
    const n = POSICOES_PARA_NAO_RECEBIDO.rpm;
    const andando = Array.from({ length: n }, (_, i) => ({ attrs: {}, ctx: ctx(i) }));
    expect(sequencia('rpm', andando.slice(0, n - 1))).toMatchObject({ status: 'aguardando', semSinalEmOperacao: n - 1 });
    const falhou = sequencia('rpm', andando)!;
    expect(falhou).toMatchObject({ status: 'nao_recebido', semSinalEmOperacao: n, atributoOrigem: 'rpm' });
    expect(falhou.motivo).toBe(`Não chegou em ${n} posições com o veículo em movimento (atributo rpm)`);
    expect(sequencia('rpm', [{ attrs: { rpm: 800 }, ctx: ctx(n) }], COM_RPM, falhou)).toMatchObject({ status: 'recebido', semSinalEmOperacao: 0 });
  });

  it('combustível tolera mais pacotes sem o nível que o RPM', () => {
    const m: MapeamentoSinais = { ...COM_RPM, sinaisMotor: ['combustivel'] };
    const andando = Array.from({ length: POSICOES_PARA_NAO_RECEBIDO.rpm }, (_, i) => ({ attrs: {}, ctx: ctx(i) }));
    expect(sequencia('combustivel', andando, m)).toMatchObject({ status: 'aguardando' });
  });

  it('sinal prometido sem atributo configurado fica aguardando a configuração, sem virar falha', () => {
    const m: MapeamentoSinais = { ...COM_RPM, sinaisMotor: ['horimetro'] };
    const andando = Array.from({ length: 50 }, (_, i) => ({ attrs: { hours: 1 }, ctx: ctx(i) }));
    let e: EstadoSinal | null = null;
    for (const p of andando) e = avaliarSinal('horimetro', e, lerSinal(p.attrs, 'horimetro', m), p.ctx, true) ?? e;
    expect(e).toMatchObject({ status: 'aguardando', motivo: expect.stringMatching(/configurar no catálogo/) });
  });
});
