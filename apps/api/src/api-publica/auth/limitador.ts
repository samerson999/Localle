import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';
import { REDIS_CONNECTION } from '../../queue/redis.provider';
import type { TipoChave } from '../chaves/chave';

/** Limites por chave (docs/PLANO-API-PUBLICA.md § 5 e § 3.6). */
export const LIMITES: Record<TipoChave, { porMinuto: number; porDia: number }> = {
  cliente: { porMinuto: 60, porDia: 20_000 },
  mestra: { porMinuto: 300, porDia: 100_000 },
};

export interface ResultadoLimite {
  permitido: boolean;
  limite: number;
  restante: number;
  /** Segundos até a janela que estourou (ou a do minuto) reiniciar. */
  reinicioEm: number;
}

/**
 * Janela fixa por minuto e por dia (UTC) num contador do Redis — o mesmo Redis da fila e do realtime, então vale com
 * mais de uma instância da API. A requisição recusada também conta (quem insiste acima do limite não ganha janela).
 */
@Injectable()
export class LimitadorDeTaxa {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: IORedis) {}

  async consumir(tipo: TipoChave, chaveId: string, agora = new Date()): Promise<ResultadoLimite> {
    const { porMinuto, porDia } = LIMITES[tipo];
    const seg = Math.floor(agora.getTime() / 1000);
    const minuto = Math.floor(seg / 60);
    const dia = agora.toISOString().slice(0, 10);
    const kMin = `api:lim:${chaveId}:m:${minuto}`;
    const kDia = `api:lim:${chaveId}:d:${dia}`;
    const r = await this.redis.multi().incr(kMin).expire(kMin, 120).incr(kDia).expire(kDia, 2 * 86_400).exec();
    const usadosMin = Number(r?.[0]?.[1] ?? 0);
    const usadosDia = Number(r?.[2]?.[1] ?? 0);
    const fimMinuto = (minuto + 1) * 60 - seg;
    if (usadosDia > porDia) {
      const fimDia = Math.ceil((Date.parse(`${dia}T00:00:00Z`) + 86_400_000 - agora.getTime()) / 1000);
      return { permitido: false, limite: porDia, restante: 0, reinicioEm: fimDia };
    }
    if (usadosMin > porMinuto) return { permitido: false, limite: porMinuto, restante: 0, reinicioEm: fimMinuto };
    return { permitido: true, limite: porMinuto, restante: porMinuto - usadosMin, reinicioEm: fimMinuto };
  }
}
