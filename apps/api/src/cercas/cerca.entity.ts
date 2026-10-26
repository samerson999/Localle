export type FormaCerca = 'circulo' | 'poligono';
export type PrioridadeAlerta = 'alta' | 'media' | 'baixa';

/** Formato devolvido pela API (geometria já convertida para [lat, lon], como o front desenha). */
export interface Cerca {
  id: string;
  nome: string;
  tipo: string;
  forma: FormaCerca;
  centro: [number, number] | null;
  raioM: number | null;
  pontos: [number, number][] | null;
  alertaEntrada: boolean;
  alertaSaida: boolean;
  prioridadeAlerta: PrioridadeAlerta | null;
  iniciaViagem: boolean;
  encerraViagem: boolean;
  velocidadeLimiteKmh: number | null;
  permanenciaMaxMin: number | null;
}

export interface CercaInput {
  nome: string;
  tipo: string;
  forma: FormaCerca;
  centro: [number, number] | null;
  raioM: number | null;
  pontos: [number, number][] | null;
  alertaEntrada: boolean;
  alertaSaida: boolean;
  prioridadeAlerta: PrioridadeAlerta | null;
  iniciaViagem: boolean;
  encerraViagem: boolean;
  velocidadeLimiteKmh: number | null;
  permanenciaMaxMin: number | null;
}

/** Mesma regra de `fencePriority` (packages/shared/src/engine.ts), que o front usa na simulação. */
export function prioridadeDaCerca(c: { tipo: string; prioridadeAlerta: PrioridadeAlerta | null }): PrioridadeAlerta {
  return c.prioridadeAlerta ?? (c.tipo === 'Área de risco' ? 'alta' : 'media');
}
