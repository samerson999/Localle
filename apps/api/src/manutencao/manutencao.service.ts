import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ManutencaoRepository, type OsRow, type PlanoRow } from './manutencao.repository';

const DIA = 86_400_000;

export type StatusPlano = 'sem_historico' | 'os_aberta' | 'em_dia' | 'proxima' | 'vencida';
export type NivelPlano = 'crit' | 'alerta' | null;

export interface StatusPlanoAtivo {
  planoId: string;
  assetId: string;
  kmAtual: number;
  ultimaKm: number;
  ultimaEm: string | null;
  proximoKm: number | null;
  proximoEm: string | null;
  restaKm: number | null;
  restaDias: number | null;
  status: StatusPlano;
  nivel: NivelPlano;
  criticoDesde: string | null;
  osAbertaId: string | null;
  recalculadaPorCorretiva: boolean;
}

/**
 * Mesmo algoritmo de `planStatus` em packages/shared/src/maint.ts: o próximo vencimento conta a partir da
 * última OS concluída do serviço (uma corretiva do mesmo serviço recalcula o plano). Prazo de crítico: o
 * do plano; vazio herda `manutencao.critico_apos_dias|km` do Setup (decisão de 18/10/2026 do plano).
 */
@Injectable()
export class ManutencaoService {
  constructor(
    private readonly repo: ManutencaoRepository,
    private readonly settings: SettingsService,
  ) {}

  async statusDoPlano(clientId: string, plano: PlanoRow, assetId: string, agora = new Date()): Promise<StatusPlanoAtivo> {
    const [critDiasPadrao, critKmPadrao, kmAtual, ultima, aberta] = await Promise.all([
      this.settings.resolve(clientId, 'manutencao.critico_apos_dias'),
      this.settings.resolve(clientId, 'manutencao.critico_apos_km'),
      this.repo.kmAtual(clientId, assetId),
      this.repo.ultimaConcluida(clientId, assetId, plano.servico),
      this.repo.osAbertaDoPlano(clientId, assetId, plano.id),
    ]);
    const base = { planoId: plano.id, assetId, kmAtual, osAbertaId: aberta?.id ?? null, recalculadaPorCorretiva: ultima?.tipo === 'corretiva' };
    if (!ultima) {
      return { ...base, ultimaKm: 0, ultimaEm: null, proximoKm: null, proximoEm: null, restaKm: null, restaDias: null, status: aberta ? 'os_aberta' : 'sem_historico', nivel: null, criticoDesde: null };
    }
    const ultimaKm = ultima.odometro ? Number(ultima.odometro) : 0;
    const usaKm = plano.gatilho !== 'tempo' && plano.km_intervalo > 0;
    const usaTempo = plano.gatilho !== 'km' && plano.dias_intervalo > 0;
    const proximoKm = usaKm ? ultimaKm + plano.km_intervalo : null;
    const proximoEm = usaTempo ? ultima.liberada_em!.getTime() + plano.dias_intervalo * DIA : null;
    const restaKm = proximoKm !== null ? proximoKm - kmAtual : null;
    const restaDias = proximoEm !== null ? Math.round((proximoEm - agora.getTime()) / DIA) : null;
    const vencida = (restaKm !== null && restaKm <= 0) || (restaDias !== null && restaDias <= 0);
    const proxima = (restaKm !== null && restaKm <= plano.antecedencia_km) || (restaDias !== null && restaDias <= plano.antecedencia_dias);
    const critDias = plano.critico_dias ?? critDiasPadrao;
    const critKm = plano.critico_km ?? critKmPadrao;
    const critT = restaDias !== null && restaDias <= -critDias;
    const critK = restaKm !== null && restaKm <= -critKm;
    return {
      ...base,
      ultimaKm,
      ultimaEm: ultima.liberada_em!.toISOString(),
      proximoKm,
      proximoEm: proximoEm === null ? null : new Date(proximoEm).toISOString(),
      restaKm,
      restaDias,
      status: aberta ? 'os_aberta' : vencida ? 'vencida' : proxima ? 'proxima' : 'em_dia',
      nivel: critT || critK ? 'crit' : vencida ? 'alerta' : null,
      criticoDesde: critT && proximoEm !== null ? new Date(proximoEm + critDias * DIA).toISOString() : null,
    };
  }

  /** Status de todos os pares plano × ativo do cliente (tela de Manutenção e "Precisa de você"). */
  async statusGeral(clientId: string, agora = new Date()): Promise<StatusPlanoAtivo[]> {
    const planos = (await this.repo.listarPlanos(clientId)).filter((p) => p.ativo);
    const out: StatusPlanoAtivo[] = [];
    for (const p of planos) for (const assetId of p.asset_ids) out.push(await this.statusDoPlano(clientId, p, assetId, agora));
    return out;
  }

  static concluida(os: OsRow): boolean {
    return os.status === 'concluida';
  }
}
