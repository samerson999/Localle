import { Injectable } from '@nestjs/common';
import { fencePassages } from '@localle/shared/fenceStats';
import { nearbyPasses } from '@localle/shared/nearbyStats';
import { routeStats } from '@localle/shared/routeStats';
import { speedLegs } from '@localle/shared/speedStats';
import { FrotaReportsRepository, type AtivoDoRelatorio } from './frota-reports.repository';

export interface Periodo {
  from: Date;
  to: Date;
}

/**
 * Relatórios de frota com dados reais: as MESMAS funções que o front usa na simulação
 * (packages/shared — os testes de lá são os casos de aceite), aplicadas aqui sobre as posições do banco,
 * um ativo por vez. Ativo sem resultado no período fica fora da resposta.
 */
@Injectable()
export class FrotaReportsService {
  constructor(private readonly repo: FrotaReportsRepository) {}

  velocidade(clientId: string, ids: string[] | null, p: Periodo, minSpeed: number) {
    return this.porAtivo(clientId, ids, async (a) => {
      const legs = speedLegs(await this.repo.pontos(clientId, a.id, p.from, p.to), minSpeed);
      return legs.length ? { legs } : null;
    });
  }

  percurso(clientId: string, ids: string[] | null, p: Periodo) {
    return this.porAtivo(clientId, ids, async (a) => {
      const pontos = await this.repo.pontos(clientId, a.id, p.from, p.to);
      return pontos.length ? { posicoes: pontos.length, stats: routeStats(pontos) } : null;
    });
  }

  async cercas(clientId: string, ids: string[] | null, p: Periodo, cercaId: string | null) {
    const cercas = await this.repo.cercas(clientId, cercaId);
    if (cercas.length === 0) return [];
    const fim = p.to.getTime();
    return this.porAtivo(clientId, ids, async (a) => {
      const pontos = await this.repo.pontos(clientId, a.id, p.from, p.to);
      const passagens = cercas.flatMap((c) => fencePassages(pontos, c, fim).map((x) => ({ ...x, fenceName: c.name, fenceType: c.type })));
      return passagens.length ? { passagens: passagens.sort((x, y) => y.enter - x.enter) } : null;
    });
  }

  passouPorAqui(clientId: string, ids: string[] | null, p: Periodo, centro: [number, number], raioM: number) {
    return this.porAtivo(clientId, ids, async (a) => {
      const passagens = nearbyPasses(await this.repo.pontosNoRaio(clientId, a.id, p.from, p.to, centro, raioM), centro, raioM);
      return passagens.length ? { passagens } : null;
    });
  }

  private async porAtivo<T extends object>(clientId: string, ids: string[] | null, fn: (a: AtivoDoRelatorio) => Promise<T | null>) {
    const saida: ({ assetId: string; plate: string } & T)[] = [];
    for (const a of await this.repo.ativos(clientId, ids)) {
      const r = await fn(a);
      if (r) saida.push({ assetId: a.id, plate: a.plate, ...r });
    }
    return saida;
  }
}
