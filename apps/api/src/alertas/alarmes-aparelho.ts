import type { Alerta } from '@localle/shared/realtime';

/**
 * Quais alarmes do aparelho (catálogo do Traccar, `attributes.alarm`) viram alerta e com que prioridade.
 * Os de comportamento de direção (frenagem/aceleração/curva bruscas) ficam só como evento — são insumo
 * de ranking, não algo que alguém precise tratar um a um; virar alerta lotaria o sino.
 */
const ALARMES: Record<string, { titulo: string; prioridade: Alerta['prioridade'] }> = {
  sos: { titulo: 'Pânico (SOS) acionado', prioridade: 'alta' },
  powerCut: { titulo: 'Alimentação do rastreador cortada', prioridade: 'alta' },
  tamper: { titulo: 'Violação do rastreador', prioridade: 'alta' },
  jamming: { titulo: 'Bloqueador de sinal (jammer) detectado', prioridade: 'alta' },
  accident: { titulo: 'Possível colisão', prioridade: 'alta' },
  lowBattery: { titulo: 'Bateria do rastreador baixa', prioridade: 'media' },
  lowPower: { titulo: 'Tensão de alimentação baixa', prioridade: 'media' },
  fault: { titulo: 'Falha no rastreador', prioridade: 'media' },
  gpsAntennaCut: { titulo: 'Antena GPS desconectada', prioridade: 'media' },
  door: { titulo: 'Porta aberta', prioridade: 'baixa' },
};

export function alertaDoAlarme(alarme: string): { titulo: string; prioridade: Alerta['prioridade'] } | null {
  return ALARMES[alarme] ?? null;
}
