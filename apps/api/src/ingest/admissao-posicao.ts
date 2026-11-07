import { BadRequestException } from '@nestjs/common';
import { validarPosicaoForward } from './dto/traccar-forward.dto';
import { mapTraccarPosition, type NormalizedPosition } from './traccar-position.mapper';

/**
 * Quanto o fixTime (relógio do aparelho/GPS) pode estar à frente do serverTime (relógio do Traccar) e ainda ser
 * confiável. Mais que isto é relógio errado no aparelho, não atraso de rede.
 */
export const TOLERANCIA_RELOGIO_MS = 10 * 60_000;

export type Admissao = { ok: true; posicao: NormalizedPosition } | { ok: false; motivo: string };

/**
 * Porta única de uma posição do Traccar para a gravação, qualquer que seja a origem (Forwarding, conciliação, polling):
 * mesmo validador do endpoint de Forwarding (formato, faixa de datas, coordenadas), a normalização de unidades do mapper e
 * a decisão de quanto confiar na hora. Antes, o polling não passava por validação nenhuma, e a confiança na hora não
 * tinha dono — uma posição com relógio adiantado avançava `ultima_posicao` (só anda para frente) e o veículo ficava
 * congelado no mapa até aquela data.
 *
 * `horaConfiavel = false` não descarta a posição: ela vai para o histórico com o fixTime original, mas não move o estado
 * atual do veículo (mapa, cercas, regras) — ver PositionsIngestService.
 */
export function admitirPosicao(bruta: unknown): Admissao {
  try {
    const posicao = mapTraccarPosition(validarPosicaoForward({ position: bruta }));
    posicao.horaConfiavel = posicao.fixTime.getTime() <= posicao.serverTime.getTime() + TOLERANCIA_RELOGIO_MS;
    return { ok: true, posicao };
  } catch (err) {
    if (err instanceof BadRequestException) return { ok: false, motivo: err.message };
    throw err;
  }
}
