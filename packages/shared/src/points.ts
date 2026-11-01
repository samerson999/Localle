/**
 * Posição compacta usada pelos cálculos de percurso/relatório: [ts (ms), lat, lng, km/h, ignição 0|1|null].
 * `null` = o rastreador não informa ignição — não é "desligada".
 */
export type Point = [number, number, number, number, number | null];
