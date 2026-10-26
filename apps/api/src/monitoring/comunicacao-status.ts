export type ComunicacaoStatus = 'sem_rastreador' | 'aguardando' | 'online' | 'sem_gps' | 'sem_sinal';

export interface ComunicacaoInput {
  temRastreador: boolean;
  ultimoPacoteEm: Date | null;
  ultimaPosicaoValidaEm: Date | null;
}

/**
 * Regra de produto "sem sinal" (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.3 e § 4.4): calculada pelo
 * backend sobre `rastreador_comunicacao` com o limite do cliente (`monitoramento.sem_sinal_h`), nunca pelo
 * `deviceOffline` do Traccar. `sem_gps` separa "o aparelho fala, mas sem fix" de "o aparelho calou" —
 * exatamente o motivo de `ultima_posicao` e `rastreador_comunicacao` serem tabelas separadas.
 */
export function statusComunicacao(input: ComunicacaoInput, semSinalH: number, agora: Date): ComunicacaoStatus {
  if (!input.temRastreador) return 'sem_rastreador';
  if (!input.ultimoPacoteEm) return 'aguardando';
  const limiteMs = semSinalH * 3600_000;
  if (agora.getTime() - input.ultimoPacoteEm.getTime() > limiteMs) return 'sem_sinal';
  if (!input.ultimaPosicaoValidaEm || agora.getTime() - input.ultimaPosicaoValidaEm.getTime() > limiteMs) {
    return 'sem_gps';
  }
  return 'online';
}
