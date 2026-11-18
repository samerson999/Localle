/**
 * Aviso de veículo parado (18/11/2026, migration 1794410000000): sem se mover há mais de `monitoramento.parado_alerta_h`
 * horas (Setup do cliente) MAS comunicando — rastreador calado é o sem_posicao, não este. Parado conta da última
 * posição acima de 5 km/h (`ultima_posicao.movimento_em`), ou da instalação se o veículo nunca andou com ela.
 * Aviso baixo, um por parada, sem tratamento; fecha sozinho quando o veículo volta a andar.
 */
export const TIPO_VEICULO_PARADO = 'veiculo_parado';
export const PARADO_ALERTA_H = 'monitoramento.parado_alerta_h';
/** Último pacote mais antigo que isto: o rastreador está calado (sem_posicao), não dá para dizer que o veículo está parado. */
export const PARADO_COMUNICANDO_H = 4;

export function tituloVeiculoParado(horas: number): string {
  return `Veículo parado há mais de ${Number(horas.toFixed(1)).toLocaleString('pt-BR')} h`;
}
