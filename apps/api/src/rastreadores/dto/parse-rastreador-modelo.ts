import { TIPOS_IDENTIFICADOR } from '@localle/shared/rastreadorModelos';
import { booleano, erro, numero, numeroOpcional, opcao, texto } from '../../common/validar';
import type { ModeloDados } from '../rastreador-modelos.repository';
import { SINAIS_MOTOR, type SinalMotor, SUPORTES_CAN } from '../../telemetria/sinais-motor';

const protocolo = (v: unknown) => {
  const p = texto(v, 'protocolo', 30, 2).toLowerCase();
  // nome do protocolo como o Traccar usa (gt06, teltonika, jt808…): é o que a ingestão compara com o detectado
  if (!/^[a-z0-9]+$/.test(p)) erro('"protocolo" é o nome usado pelo Traccar: só letras minúsculas e números (ex.: gt06, teltonika, huabao)');
  return p;
};

// nome de atributo como o Traccar grava (power, adc1, vin, out1…); vazio = chave padrão
const atributo = (v: unknown, campo: string) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(v.trim())) erro(`"${campo}" é o nome do atributo como o Traccar grava (ex.: adc1, vin, out1)`);
  return v.trim();
};

/** Mapeamento da telemetria: só os campos enviados (ausente = não mexe; vazio/null = volta ao padrão). */
function mapeamento(b: Record<string, unknown>): Partial<ModeloDados> {
  const out: Partial<ModeloDados> = {};
  if (b.atributoTensao !== undefined) out.atributo_tensao = atributo(b.atributoTensao, 'atributoTensao');
  if (b.sinalMax !== undefined) out.sinal_max = numeroOpcional(b.sinalMax, 'sinalMax', 1, 100, true);
  if (b.atributoBloqueio !== undefined) out.atributo_bloqueio = atributo(b.atributoBloqueio, 'atributoBloqueio');
  if (b.suporteCan !== undefined) out.suporte_can = opcao(b.suporteCan, 'suporteCan', SUPORTES_CAN);
  if (b.sinaisMotor !== undefined) out.sinais_motor = sinaisMotor(b.sinaisMotor);
  if (b.atributoRpm !== undefined) out.atributo_rpm = atributo(b.atributoRpm, 'atributoRpm');
  if (b.atributoOdometro !== undefined) out.atributo_odometro = atributo(b.atributoOdometro, 'atributoOdometro');
  if (b.atributoCombustivel !== undefined) out.atributo_combustivel = atributo(b.atributoCombustivel, 'atributoCombustivel');
  if (b.atributoHorimetro !== undefined) out.atributo_horimetro = atributo(b.atributoHorimetro, 'atributoHorimetro');
  return out;
}

// sinais que o modelo entrega: lista sem repetição, só os sinais conhecidos
function sinaisMotor(v: unknown): SinalMotor[] {
  if (!Array.isArray(v)) erro(`"sinaisMotor" é uma lista com: ${SINAIS_MOTOR.join(', ')}`);
  return [...new Set(v.map((s) => opcao(s, 'sinaisMotor', SINAIS_MOTOR)))];
}

export function parseCriarModelo(body: unknown): ModeloDados {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    fabricante: texto(b.fabricante, 'fabricante', 120),
    nome: texto(b.nome, 'nome', 120),
    protocolo: protocolo(b.protocolo),
    porta: numero(b.porta, 'porta', 1, 65535, true),
    tipo_identificador: opcao(b.tipoIdentificador, 'tipoIdentificador', TIPOS_IDENTIFICADOR),
    ...mapeamento(b),
  };
}

export function parseAtualizarModelo(body: unknown): Partial<ModeloDados & { ativo: boolean }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<ModeloDados & { ativo: boolean }> = {};
  if (b.fabricante !== undefined) out.fabricante = texto(b.fabricante, 'fabricante', 120);
  if (b.nome !== undefined) out.nome = texto(b.nome, 'nome', 120);
  if (b.protocolo !== undefined) out.protocolo = protocolo(b.protocolo);
  if (b.porta !== undefined) out.porta = numero(b.porta, 'porta', 1, 65535, true);
  if (b.tipoIdentificador !== undefined) out.tipo_identificador = opcao(b.tipoIdentificador, 'tipoIdentificador', TIPOS_IDENTIFICADOR);
  if (b.ativo !== undefined) out.ativo = booleano(b.ativo, 'ativo');
  Object.assign(out, mapeamento(b));
  if (!Object.keys(out).length) erro('Nada para atualizar');
  return out;
}
