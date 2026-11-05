import { describe, expect, it } from 'vitest';
import { acompanharAtributos, AUSENCIA_PARA_AVISO_MIN, chavesLidas, type EstadoAtributos } from './atributos-vistos';
import { lerTelemetriaComIdade, SEM_MAPEAMENTO } from './leitura';
import { SEM_MAPEAMENTO_SINAIS } from './sinais-motor';

const t = (min: number) => new Date(Date.UTC(2026, 10, 4, 12, 0) + min * 60_000);
const iso = (min: number) => t(min).toISOString();
// JR12 como está no catálogo da HML: tensão em `vin`, bloqueio em `out1`
const JR12 = chavesLidas({ atributoTensao: 'vin', sinalMax: 31, atributoBloqueio: 'out1' }, SEM_MAPEAMENTO_SINAIS);

/** Aplica os pacotes em ordem, como a ingestão, e junta os avisos. */
function pacotes(inicial: EstadoAtributos | null, lista: [min: number, chaves: string[]][], lidas = JR12) {
  let estado = inicial;
  const novos: string[][] = [];
  const pararam: { chave: string; leitura: string; desde: string }[][] = [];
  for (const [min, chaves] of lista) {
    const r = acompanharAtributos(estado, chaves, t(min), lidas);
    novos.push(r.novos);
    pararam.push(r.pararam);
    estado = { vistosEm: r.vistosEm, ausentesDesde: r.ausentesDesde, atributosEm: estado?.atributosEm && estado.atributosEm > t(min) ? estado.atributosEm : t(min) };
  }
  return { estado: estado!, novos, pararam };
}

describe('chavesLidas', () => {
  it('as chaves que a plataforma lê, com o mapeamento do modelo ou o padrão do Traccar', () => {
    expect(Object.fromEntries(JR12)).toEqual({ vin: 'tensão', sat: 'satélites', rssi: 'sinal GSM', out1: 'bloqueio', ignition: 'ignição', charge: 'alimentação externa', rpm: 'RPM', obdOdometer: 'odômetro do painel', fuelLevel: 'combustível' });
    expect(chavesLidas(SEM_MAPEAMENTO, SEM_MAPEAMENTO_SINAIS).get('power')).toBe('tensão');
  });
});

describe('acompanharAtributos', () => {
  it('registra quando cada chave chegou; chave ausente guarda a data antiga', () => {
    const { estado } = pacotes(null, [[0, ['vin', 'sat']], [1, ['sat']]]);
    expect(estado.vistosEm).toEqual({ vin: iso(0), sat: iso(1) });
    expect(estado.ausentesDesde).toEqual({ vin: iso(1) });
  });

  it('o caso do JR12 no Traccar 6.17: `power` aparece como novo e `vin` (lido como tensão) avisa uma vez após 60 min transmitindo', () => {
    const antes: EstadoAtributos = { vistosEm: { vin: iso(-1500), sat: iso(-1500), out1: iso(-1500) }, ausentesDesde: {}, atributosEm: t(-1500) };
    // volta depois de 25 h desligado, já sem `vin`/`out1` e com `power`
    const minutos = Array.from({ length: 62 }, (_, i) => i);
    const r = pacotes(antes, minutos.map((m) => [m, ['power', 'sat', 'index']]));
    expect(r.novos[0]).toEqual(['power', 'index']);
    expect(r.novos.slice(1).flat()).toEqual([]);
    // desligado não conta: a ausência começa no 1º pacote de volta (min 0) e o aviso sai no min 60, uma vez
    const avisos = r.pararam.flatMap((p, i) => p.map((x) => ({ ...x, min: minutos[i] })));
    expect(avisos.map((a) => [a.min, a.chave, a.leitura])).toEqual([[AUSENCIA_PARA_AVISO_MIN, 'vin', 'tensão'], [AUSENCIA_PARA_AVISO_MIN, 'out1', 'bloqueio']]);
    expect(avisos[0].desde).toBe(iso(0));
  });

  it('chave que falta em pacotes alternados (GT06 manda `adc1` num tipo de pacote e `rssi` em outro) não avisa', () => {
    const lista: [number, string[]][] = Array.from({ length: 120 }, (_, i) => [i, i % 2 ? ['rssi', 'sat'] : ['adc1', 'sat']]);
    const lidas = chavesLidas({ atributoTensao: 'adc1', sinalMax: 4, atributoBloqueio: null }, SEM_MAPEAMENTO_SINAIS);
    expect(pacotes({ vistosEm: { adc1: iso(-1), rssi: iso(-1), sat: iso(-1) }, ausentesDesde: {}, atributosEm: t(-1) }, lista, lidas).pararam.flat()).toEqual([]);
  });

  it('chave que a plataforma não lê pode faltar sem aviso; rastreador sem histórico não tem "novos"', () => {
    const r = pacotes(null, [[0, ['alarm', 'sat']], ...Array.from({ length: 90 }, (_, i): [number, string[]] => [i + 1, ['sat']])]);
    expect(r.novos.flat()).toEqual([]);
    expect(r.pararam.flat()).toEqual([]);
  });

  it('pacote atrasado só registra a chave naquele instante: não mexe na ausência nem avisa', () => {
    const atual: EstadoAtributos = { vistosEm: { vin: iso(0), sat: iso(10) }, ausentesDesde: { vin: iso(10) }, atributosEm: t(10) };
    const r = acompanharAtributos(atual, ['vin', 'novo'], t(5), JR12);
    expect(r).toEqual({ vistosEm: { vin: iso(5), sat: iso(10), novo: iso(5) }, ausentesDesde: { vin: iso(10) }, novos: [], pararam: [] });
  });
});

describe('lerTelemetriaComIdade', () => {
  it('cada leitura leva a data da sua chave; sem data = idade desconhecida', () => {
    const t1 = lerTelemetriaComIdade({ vin: 718, power: 14.08, rssi: 28 }, { vin: '2026-11-03T18:37:45.000Z', rssi: '2026-11-04T19:34:48.000Z' },
      { atributoTensao: 'vin', sinalMax: 31, atributoBloqueio: 'out1' });
    expect(t1).toEqual({
      tensaoV: 0.72, satelites: null, sinalGsm: 5, bloqueado: null, alimentacaoExterna: false,
      lidaEm: { tensaoV: '2026-11-03T18:37:45.000Z', satelites: null, sinalGsm: '2026-11-04T19:34:48.000Z', bloqueado: null, alimentacaoExterna: '2026-11-03T18:37:45.000Z' },
    });
  });
});
