import type { Alerta } from '@localle/shared/realtime';

/**
 * Alerta de rastreador sem mandar posição (decisão de 11/11/2026): um alerta por queda, que sobe de nível
 * com o tempo — 4 h baixo, 12 h médio, 24 h crítico. Independe do status "Sem sinal" do mapa, que segue o
 * limite do Setup (`monitoramento.sem_sinal_h`). Conta desde a última posição válida, então "fala mas sem
 * GPS" também alerta.
 */
export const TIPO_SEM_POSICAO = 'sem_posicao';

const NIVEIS: { horas: number; prioridade: Alerta['prioridade'] }[] = [
  { horas: 24, prioridade: 'alta' },
  { horas: 12, prioridade: 'media' },
  { horas: 4, prioridade: 'baixa' },
];

export const SEM_POSICAO_MIN_H = 4;

export function nivelSemPosicao(ultimaPosicao: Date, agora: Date): Alerta['prioridade'] | null {
  const horas = (agora.getTime() - ultimaPosicao.getTime()) / 3600_000;
  return NIVEIS.find((n) => horas >= n.horas)?.prioridade ?? null;
}

export function tituloSemPosicao(prioridade: Alerta['prioridade']): string {
  const h = prioridade === 'alta' ? 24 : prioridade === 'media' ? 12 : 4;
  return `Rastreador há mais de ${h} h sem enviar posição`;
}

/**
 * Backup (rastreador ou tag) sem comunicar (14/11/2026): aviso baixo e único por queda, sem subir de nível — o ativo
 * segue rastreado pelo principal. Conta do último pacote (não da última posição): tag costuma mandar posição de horas
 * em horas, mas sem nenhum pacote em 24 h ela provavelmente está sem bateria ou foi arrancada.
 */
export const TIPO_BACKUP_SEM_SINAL = 'backup_sem_sinal';
export const BACKUP_SEM_SINAL_H = 24;
export const TITULO_BACKUP_SEM_SINAL = `Backup há mais de ${BACKUP_SEM_SINAL_H} h sem comunicar`;
