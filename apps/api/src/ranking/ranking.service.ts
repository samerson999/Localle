import { Injectable } from '@nestjs/common';
import { EVENT_TYPES, FUTURE_CATEGORIES } from '@localle/shared/catalog';
import { computeDays } from '@localle/shared/jornada';
import { type EvType, pointsOf, type Ranking, type RankRow } from '@localle/shared/ranking';
import { JornadaRepository } from '../jornada/jornada.repository';
import { JornadaService } from '../jornada/jornada.service';
import { SettingsService } from '../settings/settings.service';
import { RankingRepository } from './ranking.repository';

const DIA = 86_400_000;

/**
 * Mesmo cálculo de `localRanking` (packages/shared/src/ranking.ts): matriz efetiva = catálogo em código +
 * overrides do cliente (`ranking_matriz`); pontos por evento com faixas (`pointsOf`); violações de jornada
 * viram um evento `violacao_jornada` por infração apurada; limite e período vêm do Setup `ranking.*`.
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly repo: RankingRepository,
    private readonly jornada: JornadaRepository,
    private readonly jornadaService: JornadaService,
    private readonly settings: SettingsService,
  ) {}

  async tipos(clientId: string): Promise<EvType[]> {
    const overrides = new Map((await this.repo.matriz(clientId)).map((m) => [m.codigo, m]));
    const base: EvType[] = Object.entries(EVENT_TYPES).map(([code, t]) => {
      const o = overrides.get(code);
      return {
        code,
        label: o?.label ?? t.label,
        category: t.category,
        weight: o?.peso !== null && o?.peso !== undefined ? Number(o.peso) : t.weight,
        tiers: o?.faixas ?? t.tiers ?? [],
        unit: t.unit,
        requiresCan: t.requiresCan,
        active: o ? o.ativo : true,
      };
    });
    const custom: EvType[] = [...overrides.values()]
      .filter((o) => o.custom && !(o.codigo in EVENT_TYPES))
      .map((o) => ({ code: o.codigo, label: o.label ?? o.codigo, category: o.categoria ?? 'empresa', weight: Number(o.peso ?? 0), tiers: o.faixas ?? [], active: o.ativo, custom: true }));
    return [...base, ...custom].filter((t) => !FUTURE_CATEGORIES.includes(t.category));
  }

  async calcular(clientId: string, de: Date, ate: Date, agora = new Date()): Promise<Ranking> {
    const fim = new Date(Math.min(ate.getTime(), agora.getTime()));
    const [tiposLista, limite, periodo, motoristas, eventos, km] = await Promise.all([
      this.tipos(clientId),
      this.settings.resolve(clientId, 'ranking.limite_pontos'),
      this.settings.resolveValor(clientId, 'ranking.periodo_limite'),
      this.repo.motoristas(clientId),
      this.repo.eventos(clientId, de, fim),
      this.repo.kmPorMotorista(clientId, de, fim),
    ]);
    const tipos = Object.fromEntries(tiposLista.filter((t) => t.active).map((t) => [t.code, t]));
    const dias = Math.max(1, (fim.getTime() - de.getTime()) / DIA);
    const pdias = periodo === 'semana' ? 7 : periodo === 'trimestre' ? 91 : 30;
    const limitScaled = Math.round(((limite * dias) / pdias) * 10) / 10;

    const drivers: RankRow[] = [];
    for (const m of motoristas) {
      const meus: { tipo: string; valor: number | null }[] = eventos.filter((e) => e.motorista_id === m.id).map((e) => ({ tipo: e.tipo, valor: e.valor === null ? null : Number(e.valor) }));
      if (tipos.violacao_jornada) {
        const marcacoes = await this.jornada.listar(clientId, m.id, de, fim);
        if (marcacoes.length > 0) {
          const limites = await this.jornadaService.limitesEm(clientId, fim);
          for (const d of computeDays(marcacoes.map((x) => ({ ts: x.ts.getTime(), type: x.tipo })), m.regime, limites, agora.getTime())) {
            for (const _v of d.violations) meus.push({ tipo: 'violacao_jornada', valor: null });
          }
        }
      }
      const by: Record<string, RankRow['by_code'][number]> = {};
      for (const e of meus) {
        const ty = tipos[e.tipo];
        if (!ty) continue;
        by[e.tipo] ||= { code: e.tipo, label: ty.label, category: ty.category, qty: 0, points: 0 };
        by[e.tipo].qty += 1;
        by[e.tipo].points += pointsOf(ty, e.valor);
      }
      const points = Object.values(by).reduce((s, b) => s + b.points, 0);
      const kmM = km.get(m.id) ?? 0;
      drivers.push({
        person_id: m.id,
        name: m.nome,
        points,
        events: Object.values(by).reduce((s, b) => s + b.qty, 0),
        km: kmM,
        points_per_100km: kmM > 0 ? Math.round((points / (kmM / 100)) * 100) / 100 : null,
        attention: points > limitScaled,
        by_code: Object.values(by).sort((a, b) => b.points - a.points),
      });
    }
    drivers.sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
    return { limit: limite, limit_period: String(periodo), limit_scaled: limitScaled, days: dias, drivers };
  }
}
