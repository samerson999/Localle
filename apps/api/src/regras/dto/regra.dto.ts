import { BadRequestException } from '@nestjs/common';
import { CAMPOS, type CampoRegra, type Condicao } from '../avaliar-regra';

export interface Acoes {
  painel: boolean;
  email: boolean;
  whatsapp: boolean;
  motorista: boolean;
  bloqueio: boolean;
  ranking: boolean;
}

export interface RegraInput {
  nome: string;
  ativa: boolean;
  prioridade: 'alta' | 'media' | 'baixa';
  condicoes: Condicao[];
  acoes: Acoes;
}

const ACOES: (keyof Acoes)[] = ['painel', 'email', 'whatsapp', 'motorista', 'bloqueio', 'ranking'];
const MAX_CONDICOES = 10;

function erro(msg: string): never {
  throw new BadRequestException(msg);
}

function condicao(v: unknown, i: number): Condicao {
  const c = (v ?? {}) as Record<string, unknown>;
  // hasOwn: "constructor"/"__proto__" não podem resolver para o protótipo do catálogo
  const campo = typeof c.field === 'string' && Object.hasOwn(CAMPOS, c.field) ? CAMPOS[c.field as CampoRegra] : undefined;
  if (!campo) erro(`condicoes[${i}].field inválido`);
  if (typeof c.op !== 'string' || !campo.ops.includes(c.op)) erro(`condicoes[${i}].op precisa ser um de: ${campo.ops.join(', ')}`);
  if (typeof c.value !== 'string' || c.value.length === 0 || c.value.length > 40) erro(`condicoes[${i}].value inválido`);
  if (campo.values && !campo.values.includes(c.value)) erro(`condicoes[${i}].value precisa ser um de: ${campo.values.join(', ')}`);
  // decimal simples: Number(" ") = 0 e Number("0x10") = 16 passariam e criariam uma regra que ninguém pediu
  if (campo.numerico && !/^-?\d+(\.\d+)?$/.test(c.value)) erro(`condicoes[${i}].value precisa ser número`);
  if (campo.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.value)) erro(`condicoes[${i}].value precisa ser HH:MM`);
  return { field: c.field as CampoRegra, op: c.op, value: c.value };
}

/** Sem class-validator no projeto: validação explícita — o motor confia na forma gravada. */
export function parseRegra(body: unknown): RegraInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
  if (!nome || nome.length > 120) erro('"nome" precisa ter de 1 a 120 caracteres');
  if (!['alta', 'media', 'baixa'].includes(b.prioridade as string)) erro('"prioridade" precisa ser alta, media ou baixa');
  if (!Array.isArray(b.condicoes) || b.condicoes.length === 0 || b.condicoes.length > MAX_CONDICOES) {
    erro(`"condicoes" precisa ter de 1 a ${MAX_CONDICOES} itens`);
  }
  const a = (b.acoes ?? {}) as Record<string, unknown>;
  const acoes = Object.fromEntries(ACOES.map((k) => [k, a[k] === true])) as unknown as Acoes;
  return {
    nome,
    ativa: b.ativa === undefined ? true : b.ativa === true,
    prioridade: b.prioridade as RegraInput['prioridade'],
    condicoes: b.condicoes.map(condicao),
    acoes,
  };
}
