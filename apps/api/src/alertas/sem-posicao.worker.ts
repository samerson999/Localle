import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Alerta } from '@localle/shared/realtime';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { reenfileirarNotificacao } from '../notificacoes/notificacao-fila.repository';
import { RealtimeHub } from '../realtime/realtime.hub';
import { inserirAlerta, toAlerta } from './alertas.repository';
import { nivelSemPosicao, SEM_POSICAO_MIN_H, TIPO_SEM_POSICAO, tituloSemPosicao } from './sem-posicao';

const TICK_MS = 60_000;
const RANK: Record<Alerta['prioridade'], number> = { baixa: 1, media: 2, alta: 3 };

interface Candidato {
  client_id: string;
  asset_id: string;
  ultima_posicao: Date;
  alerta_id: string | null;
  prioridade: Alerta['prioridade'] | null;
  tratado_em: Date | null;
}

/**
 * Rastreador sem mandar posição não gera pacote nenhum, então o alerta só nasce com o tempo: a cada minuto,
 * para todos os clientes (não só quem está com a tela aberta, como o ComunicacaoTicker), cria o alerta da queda
 * ou sobe o nível dele (sem-posicao.ts), notificando a cada nível. Alerta já tratado não sobe mais.
 * Mais de uma instância rodando ao mesmo tempo é seguro: índice único por queda e update condicionado ao nível.
 */
@Injectable()
export class SemPosicaoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SemPosicaoWorker.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly realtime: RealtimeHub,
  ) {}

  onModuleInit(): void {
    if (process.env.SEM_POSICAO_WORKER_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Público para o teste chamar sem timer. `clientId` restringe a volta a um cliente (teste). */
  async tick(agora = new Date(), clientId: string | null = null): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      let candidatos: Candidato[];
      try {
        candidatos = await this.candidatos(agora, clientId);
      } catch (err) {
        this.logger.error(`Rastreadores sem posição não verificados: ${(err as Error).message}`);
        return;
      }
      for (const c of candidatos) {
        try {
          await this.avaliar(c, agora);
        } catch (err) {
          this.logger.warn(`Alerta sem posição não atualizado (client_id ${c.client_id}, asset_id ${c.asset_id}): ${(err as Error).message}`);
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  /**
   * Rotina interna, sem rota de cliente: varre todos os clientes numa consulta só (como a fila de notificações);
   * cada escrita depois leva o `client_id` da própria linha. Posição anterior à instalação vigente é do ativo anterior.
   */
  private async candidatos(agora: Date, clientId: string | null): Promise<Candidato[]> {
    const { rows } = await this.pool.query<Candidato>(
      `select a.client_id, a.id as asset_id, rc.ultima_posicao_valida_em as ultima_posicao,
         al.id as alerta_id, al.prioridade, al.tratado_em
       from assets a
       join instalacoes i on i.asset_id = a.id and i.client_id = a.client_id and i.papel = 'principal' and i.desinstalado_em is null
       join rastreador_comunicacao rc on rc.rastreador_id = i.rastreador_id
       left join alertas al on al.asset_id = a.id and al.tipo = $3 and al.ts = rc.ultima_posicao_valida_em
       where a.status = 'ativo'
         and ($4::uuid is null or a.client_id = $4)
         and rc.ultima_posicao_valida_em >= i.instalado_em
         and rc.ultima_posicao_valida_em <= $1::timestamptz - make_interval(hours => $2)`,
      [agora, SEM_POSICAO_MIN_H, TIPO_SEM_POSICAO, clientId],
    );
    return rows;
  }

  private async avaliar(c: Candidato, agora: Date): Promise<void> {
    const nivel = nivelSemPosicao(c.ultima_posicao, agora);
    if (!nivel || c.tratado_em || (c.prioridade && RANK[c.prioridade] >= RANK[nivel])) return;

    const alerta = await withTransaction(this.pool, async (tx) => {
      if (!c.alerta_id) {
        const { rows } = await tx.query<{ id: string }>(
          `select id from alertas where asset_id = $1 and tipo = $2 and ts = $3`,
          [c.asset_id, TIPO_SEM_POSICAO, c.ultima_posicao],
        );
        if (rows.length === 0) {
          return inserirAlerta(tx, {
            clientId: c.client_id,
            assetId: c.asset_id,
            eventoId: null,
            origem: 'aparelho',
            tipo: TIPO_SEM_POSICAO,
            titulo: tituloSemPosicao(nivel),
            detalhe: null,
            prioridade: nivel,
            ts: c.ultima_posicao,
          });
        }
      }
      // subiu de nível: volta a "não lido" e notifica de novo; outra instância que chegou antes não repete
      const { rows } = await tx.query(
        `update alertas a set prioridade = $5, titulo = $6, lido_em = null
         from (select id from alertas where client_id = $1 and asset_id = $2 and tipo = $3 and ts = $4 and tratado_em is null
                 and array_position(array['baixa','media','alta'], prioridade) < array_position(array['baixa','media','alta'], $5::text)
               for update) alvo
         where a.id = alvo.id
         returning a.id, a.client_id, a.asset_id, a.origem, a.tipo, a.titulo, a.detalhe, a.prioridade, a.ts, a.lido_em,
           a.tratado_em, null::text as tratado_por_email, a.tratamento_motivo, a.tratamento_obs`,
        [c.client_id, c.asset_id, TIPO_SEM_POSICAO, c.ultima_posicao, nivel, tituloSemPosicao(nivel)],
      );
      if (rows.length === 0) return null;
      await reenfileirarNotificacao(tx, c.client_id, rows[0].id);
      return toAlerta(rows[0]);
    });
    if (!alerta) return;

    this.logger.log(`Alerta sem posição ${alerta.prioridade} (client_id ${c.client_id}, asset_id ${c.asset_id}, alerta ${alerta.id})`);
    try {
      await this.realtime.publish(c.client_id, { kind: 'alerta', alerta });
    } catch (err) {
      // já gravado: aparece na próxima carga de /alertas
      this.logger.warn(`Alerta sem posição não publicado (client_id ${c.client_id}, alerta ${alerta.id}): ${(err as Error).message}`);
    }
  }
}
