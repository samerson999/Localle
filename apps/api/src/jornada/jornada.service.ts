import { Injectable, NotFoundException } from '@nestjs/common';
import { computeDays, type DayCalc } from '@localle/shared/jornada';
import { SettingsService } from '../settings/settings.service';
import { JornadaRepository, type MarcacaoRow } from './jornada.repository';

/** Chaves do Setup → nomes que `jornadaLimits` (packages/shared) espera. */
const CFG: Record<string, string> = {
  baseH: 'jornada.base_diaria_h',
  maxExtra: 'jornada.extras_max_h',
  mealH: 'jornada.refeicao_min_h',
  interH: 'jornada.interjornada_min_h',
  weeklyH: 'jornada.descanso_semanal_min_h',
  contCargasH: 'jornada.direcao_continua_cargas_h',
  contPassageirosH: 'jornada.direcao_continua_passageiros_h',
};

export interface Espelho {
  motoristaId: string;
  regime: 'cargas' | 'passageiros';
  limites: Record<string, number>;
  dias: DayCalc[];
  marcacoes: MarcacaoRow[];
}

/**
 * Espelho de ponto: o cálculo é o mesmo do front (`computeDays`), com os limites do Setup **vigentes no fim
 * do período** (chaves `aplicacao: 'agora'`, lidas pelo histórico) — um espelho antigo não muda de
 * infrações porque o parâmetro mudou depois. A lei continua sendo piso dentro de `jornadaLimits`.
 */
@Injectable()
export class JornadaService {
  constructor(
    private readonly repo: JornadaRepository,
    private readonly settings: SettingsService,
  ) {}

  /** Limites do Setup vigentes na data, no formato de `jornadaLimits`. */
  async limitesEm(clientId: string, at: Date): Promise<Record<string, number>> {
    const limites: Record<string, number> = {};
    for (const [nome, key] of Object.entries(CFG)) limites[nome] = Number(await this.settings.resolveEm(clientId, key, at));
    return limites;
  }

  async espelho(clientId: string, motoristaId: string, de: Date, ate: Date, agora = new Date()): Promise<Espelho> {
    const regime = await this.repo.regimeDoMotorista(clientId, motoristaId);
    if (!regime) throw new NotFoundException('Motorista não encontrado');
    const limites = await this.limitesEm(clientId, ate);
    const marcacoes = await this.repo.listar(clientId, motoristaId, de, ate);
    const dias = computeDays(
      marcacoes.map((m) => ({ ts: m.ts.getTime(), type: m.tipo })),
      regime,
      limites,
      agora.getTime(),
    );
    return { motoristaId, regime, limites, dias, marcacoes };
  }
}
