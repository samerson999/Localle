import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { type MultaRow, MultasRepository } from './multas.repository';

const DIA = 86_400_000;
const JANELA_CNH_DIAS = 365;

export type EstadoIndicacao = 'feita' | 'vencida' | 'critica' | 'aviso' | 'no_prazo' | 'nao_se_aplica';

export interface IndicacaoPendente {
  id: string;
  auto: string;
  assetId: string;
  ts: string;
  notificadoEm: string | null;
  /** Estimado (notificação + 15 dias) quando a data da notificação não foi informada. */
  notificacaoEstimada: boolean;
  prazoEm: string;
  estado: EstadoIndicacao;
}

export interface RiscoCnh {
  motoristaId: string;
  nome: string;
  ear: boolean;
  pontos: number;
  gravissimas: number;
  limite: number;
  usoPct: number;
  risco: boolean;
}

/**
 * Mesmas regras de packages/shared/src/fines.ts (`indicationState`, `cnhRisk`), com os parâmetros vindos
 * do Setup em vez de `FINE_PARAMS`: prazo de indicação (piso legal 30 dias, CTB art. 257 §7º), dias de
 * aviso/crítico e limites de pontos (CTB art. 261, I e §5º).
 */
@Injectable()
export class MultasService {
  constructor(
    private readonly repo: MultasRepository,
    private readonly settings: SettingsService,
  ) {}

  async indicacoesPendentes(clientId: string, agora = new Date()): Promise<IndicacaoPendente[]> {
    const [prazoDias, avisoDias, criticoDias] = await Promise.all([
      this.settings.resolve(clientId, 'multas.indicacao_prazo_dias'),
      this.settings.resolve(clientId, 'multas.indicacao_aviso_dias'),
      this.settings.resolve(clientId, 'multas.indicacao_critico_dias'),
    ]);
    const abertas = (await this.repo.listar(clientId, new Date(agora.getTime() - 2 * JANELA_CNH_DIAS * DIA), agora, null)).filter(
      (m) => m.status === 'aberta' && !m.indicado_em,
    );
    return abertas.map((m) => {
      const notificado = m.notificado_em ? Date.parse(m.notificado_em + 'T12:00:00Z') : m.ts.getTime() + 15 * DIA;
      const prazo = notificado + prazoDias * DIA;
      const resta = prazo - agora.getTime();
      const estado: EstadoIndicacao = resta < 0 ? 'vencida' : resta <= criticoDias * DIA ? 'critica' : resta <= avisoDias * DIA ? 'aviso' : 'no_prazo';
      return {
        id: m.id,
        auto: m.auto,
        assetId: m.asset_id,
        ts: m.ts.toISOString(),
        notificadoEm: m.notificado_em,
        notificacaoEstimada: !m.notificado_em,
        prazoEm: new Date(prazo).toISOString(),
        estado,
      };
    });
  }

  async riscoCnh(clientId: string, agora = new Date()): Promise<RiscoCnh[]> {
    const [l2, l1, l0, lEar, riscoPct] = await Promise.all([
      this.settings.resolve(clientId, 'multas.cnh_limite_2_gravissimas'),
      this.settings.resolve(clientId, 'multas.cnh_limite_1_gravissima'),
      this.settings.resolve(clientId, 'multas.cnh_limite_sem_gravissima'),
      this.settings.resolve(clientId, 'multas.cnh_limite_ear'),
      this.settings.resolve(clientId, 'multas.cnh_risco_pct'),
    ]);
    const linhas = await this.repo.pontosPorMotorista(clientId, new Date(agora.getTime() - JANELA_CNH_DIAS * DIA));
    return linhas.map((r) => {
      const limite = r.ear ? lEar : r.gravissimas >= 2 ? l2 : r.gravissimas === 1 ? l1 : l0;
      const usoPct = Math.round((r.pontos / limite) * 100);
      return { motoristaId: r.motorista_id, nome: r.nome, ear: r.ear, pontos: r.pontos, gravissimas: r.gravissimas, limite, usoPct, risco: usoPct >= riscoPct };
    });
  }

  static temIndicacao(m: MultaRow): boolean {
    return !!m.indicado_em || m.status === 'condutor_indicado';
  }
}
