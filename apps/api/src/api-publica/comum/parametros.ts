import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * Parâmetros de consulta da API pública, documentados num lugar só. O plugin do Swagger marca todo `@Query()` como
 * obrigatório; cada rota declara aqui quais exige (o mesmo que o código valida) e quais são filtros opcionais.
 */
const PARAMETROS = {
  de: { type: String, description: 'Início do período, ISO 8601 (ex.: 2026-11-01T00:00:00Z).', example: '2026-11-01T00:00:00Z' },
  ate: { type: String, description: 'Fim do período, ISO 8601.', example: '2026-11-07T23:59:59Z' },
  limite: { type: Number, description: 'Itens por página (padrão 100, máximo 500; posições: padrão 500, máximo 1.000).' },
  cursor: { type: String, description: 'O `proximoCursor` da página anterior, para buscar a seguinte.' },
  veiculoId: { type: String, description: 'Id do veículo (uuid).' },
  veiculoIds: { type: String, description: 'Até 50 ids de veículo separados por vírgula. Sem eles, a frota toda, com período de no máximo 7 dias.' },
  motoristaId: { type: String, description: 'Id do motorista (uuid).' },
  modeloId: { type: String, description: 'Id do modelo de checklist (uuid).' },
  cercaId: { type: String, description: 'Só as passagens por esta cerca (uuid).' },
  placa: { type: String, description: 'Filtra pela placa, com ou sem hífen.' },
  identificador: { type: String, description: 'Filtra pelo código interno do veículo.' },
  incluirInativos: { type: Boolean, description: '`true` inclui os vendidos/baixados (veículos) ou desativados (motoristas).' },
  abertos: { type: Boolean, description: '`true`: só as ocorrências ainda sem tratamento.' },
  abertas: { type: Boolean, description: '`true`: só as em aberto.' },
  tipo: { type: String, description: 'Filtra pelo tipo do evento (ex.: ignitionOn, alarm).' },
  velocidadeMin: { type: Number, description: 'Velocidade mínima do trecho, em km/h (padrão 0).' },
  latitude: { type: Number, description: 'Latitude do ponto.', example: -8.05 },
  longitude: { type: Number, description: 'Longitude do ponto.', example: -34.88 },
  raio: { type: Number, description: 'Raio em metros, de 10 a 5.000.', example: 300 },
  dias: { type: Number, description: 'Quantos dias antes de hoje (0 a 30; padrão 7).' },
} as const;

export type Parametro = keyof typeof PARAMETROS;

/** Documenta os parâmetros de consulta da rota: `obrigatorios` e `opcionais`, nessa ordem no Swagger. */
export function Parametros(obrigatorios: Parametro[], opcionais: Parametro[] = []) {
  const doc = (nome: Parametro, required: boolean) => ApiQuery({ name: nome, required, ...PARAMETROS[nome] });
  return applyDecorators(...obrigatorios.map((n) => doc(n, true)), ...opcionais.map((n) => doc(n, false)));
}

/** Atalhos dos conjuntos que se repetem. */
export const PERIODO: Parametro[] = ['de', 'ate'];
export const PAGINA: Parametro[] = ['limite', 'cursor'];
