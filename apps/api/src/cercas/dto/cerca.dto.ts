import { BadRequestException } from '@nestjs/common';
import type { CercaInput, FormaCerca, PrioridadeAlerta } from '../cerca.entity';

const MAX_PONTOS = 500;
const PRIORIDADES: PrioridadeAlerta[] = ['alta', 'media', 'baixa'];

function erro(msg: string): never {
  throw new BadRequestException(msg);
}

function coordenada(v: unknown, campo: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) erro(`"${campo}" precisa ser [latitude, longitude]`);
  const [lat, lon] = v;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) {
    erro(`"${campo}" fora da faixa de latitude/longitude`);
  }
  return [lat, lon];
}

function texto(v: unknown, campo: string, max: number): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.trim().length > max) erro(`"${campo}" precisa ter de 1 a ${max} caracteres`);
  return v.trim();
}

function booleano(v: unknown, campo: string): boolean {
  if (v === undefined) return false;
  if (typeof v !== 'boolean') erro(`"${campo}" precisa ser true ou false`);
  return v;
}

function numeroOpcional(v: unknown, campo: string, min: number, max: number, inteiro = false): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) {
    erro(`"${campo}" precisa ser ${inteiro ? 'inteiro' : 'número'} entre ${min} e ${max}`);
  }
  return v;
}

/**
 * Sem class-validator no projeto: validação explícita, antes do repository. Polígono: de 3 a 500 vértices;
 * se o desenho se cruzar, quem recusa é a constraint `st_isvalid` do banco (vira 400 no repository).
 */
export function parseCerca(body: unknown): CercaInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const forma = b.forma as FormaCerca;
  if (forma !== 'circulo' && forma !== 'poligono') erro('"forma" precisa ser "circulo" ou "poligono"');

  let centro: [number, number] | null = null;
  let raioM: number | null = null;
  let pontos: [number, number][] | null = null;
  if (forma === 'circulo') {
    centro = coordenada(b.centro, 'centro');
    raioM = numeroOpcional(b.raioM, 'raioM', 10, 50_000);
    if (raioM === null) erro('"raioM" é obrigatório para círculo');
  } else {
    if (!Array.isArray(b.pontos) || b.pontos.length < 3 || b.pontos.length > MAX_PONTOS) {
      erro(`"pontos" precisa ter de 3 a ${MAX_PONTOS} vértices`);
    }
    pontos = b.pontos.map((p, i) => coordenada(p, `pontos[${i}]`));
  }

  const prioridade = b.prioridadeAlerta;
  if (prioridade !== undefined && prioridade !== null && !PRIORIDADES.includes(prioridade as PrioridadeAlerta)) {
    erro(`"prioridadeAlerta" precisa ser um de: ${PRIORIDADES.join(', ')}`);
  }

  return {
    nome: texto(b.nome, 'nome', 120),
    tipo: texto(b.tipo, 'tipo', 40),
    forma,
    centro,
    raioM,
    pontos,
    alertaEntrada: booleano(b.alertaEntrada, 'alertaEntrada'),
    alertaSaida: booleano(b.alertaSaida, 'alertaSaida'),
    prioridadeAlerta: (prioridade as PrioridadeAlerta | null | undefined) ?? null,
    iniciaViagem: booleano(b.iniciaViagem, 'iniciaViagem'),
    encerraViagem: booleano(b.encerraViagem, 'encerraViagem'),
    velocidadeLimiteKmh: numeroOpcional(b.velocidadeLimiteKmh, 'velocidadeLimiteKmh', 1, 200),
    permanenciaMaxMin: numeroOpcional(b.permanenciaMaxMin, 'permanenciaMaxMin', 1, 7 * 24 * 60, true),
  };
}
