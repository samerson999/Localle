import { Injectable, Logger } from '@nestjs/common';
import { fencePassages } from '@localle/shared/fenceStats';
import { nearbyPasses } from '@localle/shared/nearbyStats';
import { routeStats } from '@localle/shared/routeStats';
import { speedLegs } from '@localle/shared/speedStats';
import { FUSO_OPERACAO } from '../monitoring/fuso-operacao';
import { FrotaReportsRepository, type AtivoDoRelatorio, type VinculoDoRelatorio } from './frota-reports.repository';
import { diaNoFuso, RECUO_IGNICAO_MS, resumirDia, turnoDaJanela, type Turno } from './jornada-motorista';

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
  private readonly logger = new Logger(FrotaReportsService.name);

  constructor(private readonly repo: FrotaReportsRepository) {}

  /**
   * Relatório de motoristas: uma linha por motorista × veículo × dia (jornada-motorista.ts). Turno que entra pelo
   * período e passa do fim dele conta inteiro, até 1 dia depois — a linha é do dia em que o motorista ligou.
   */
  async motoristas(clientId: string, ids: string[] | null, motoristaIds: string[] | null, p: Periodo, agora = new Date()) {
    const vinculos = await this.repo.vinculosNoPeriodo(clientId, p.from, p.to, ids, motoristaIds);
    const placas = new Map((await this.repo.ativos(clientId, [...new Set(vinculos.map((v) => v.asset_id))])).map((a) => [a.id, a.plate]));
    const teto = Math.min(agora.getTime(), p.to.getTime() + 86_400_000);
    const porAtivo = new Map<string, VinculoDoRelatorio[]>();
    for (const v of vinculos) porAtivo.set(v.asset_id, [...(porAtivo.get(v.asset_id) ?? []), v]);

    const linhas = new Map<string, { v: VinculoDoRelatorio; dia: string; turnos: Turno[] }>();
    let semPosicao = 0;
    for (const [assetId, vs] of porAtivo) {
      const de = new Date(vs[0].inicio.getTime() - RECUO_IGNICAO_MS);
      const ate = new Date(Math.min(teto, Math.max(...vs.map((v) => (v.fim ?? agora).getTime()))));
      const pts = await this.repo.pontos(clientId, assetId, de, ate);
      for (const v of vs) {
        const t = turnoDaJanela(pts, { inicio: v.inicio.getTime(), fim: v.fim?.getTime() ?? null, piso: v.piso?.getTime() ?? -Infinity });
        if (!t) { semPosicao++; continue; }
        const dia = diaNoFuso(t.ligou, FUSO_OPERACAO);
        const chave = `${v.motorista_id ?? `codigo:${v.codigo}`}|${assetId}|${dia}`;
        const l = linhas.get(chave);
        if (l) l.turnos.push(t);
        else linhas.set(chave, { v, dia, turnos: [t] });
      }
    }
    if (semPosicao) this.logger.log(`relatório de motoristas client=${clientId}: ${semPosicao} de ${vinculos.length} vínculos sem posição com ignição`);

    return [...linhas.values()]
      .map(({ v, dia, turnos }) => ({
        motoristaId: v.motorista_id,
        motorista: v.motorista_nome,
        codigo: v.codigo,
        assetId: v.asset_id,
        plate: placas.get(v.asset_id) ?? '',
        dia,
        ...resumirDia(turnos),
      }))
      .sort((a, b) => b.dia.localeCompare(a.dia) || (a.motorista ?? '').localeCompare(b.motorista ?? '') || a.primeiraIgnicao - b.primeiraIgnicao);
  }

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
