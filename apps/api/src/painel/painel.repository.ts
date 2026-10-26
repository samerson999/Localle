import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

/**
 * Agregados da plataforma inteira para o Console da Locale (Visão geral, Saúde). Cruza clientes de
 * propósito — rotas só de superadmin. Só leitura.
 */
@Injectable()
export class PainelRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async contratosVencendo(dias: number): Promise<{ clientId: string; clientName: string; fimEm: string }[]> {
    const { rows } = await this.pool.query(
      `select c.client_id, cl.name, to_char(c.fim_em, 'YYYY-MM-DD') as fim_em
         from contratos c join clients cl on cl.id = c.client_id
        where c.status <> 'cancelado' and c.fim_em between current_date and current_date + $1::int
        order by c.fim_em`,
      [dias],
    );
    return rows.map((r) => ({ clientId: r.client_id, clientName: r.name, fimEm: r.fim_em }));
  }

  /** Instalados agora sem pacote há mais de `horas` (ou que nunca comunicaram). */
  async semSinal(horas: number): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n
         from instalacoes i left join rastreador_comunicacao rc on rc.rastreador_id = i.rastreador_id
        where i.desinstalado_em is null
          and (rc.ultimo_pacote_em is null or rc.ultimo_pacote_em < now() - make_interval(hours => $1))`,
      [horas],
    );
    return rows[0].n;
  }

  /**
   * Equipamento a recolher: instalação ainda vigente em cliente com contrato cancelado. O cancelamento não
   * encerra a instalação sozinho (docs/PLANO-SETUP-ADMIN.md § 0, tela 5) — fica pendente até a retirada.
   */
  async aRecolher(): Promise<{ instalacaoId: string; imei: string; modelo: string | null; clientName: string; placa: string }[]> {
    const { rows } = await this.pool.query(
      `select i.id, r.imei, r.modelo, cl.name, a.plate
         from instalacoes i
         join contratos c on c.client_id = i.client_id and c.status = 'cancelado'
         join rastreadores r on r.id = i.rastreador_id
         join clients cl on cl.id = i.client_id
         join assets a on a.id = i.asset_id
        where i.desinstalado_em is null
        order by cl.name, a.plate`,
    );
    return rows.map((r) => ({ instalacaoId: r.id, imei: r.imei, modelo: r.modelo, clientName: r.name, placa: r.plate }));
  }

  async banco(): Promise<{ tamanhoBytes: number; posicoesBytes: number | null; posicoes24h: number }> {
    const { rows } = await this.pool.query(
      `select pg_database_size(current_database()) as total,
              (select count(*) from posicoes where fix_time > now() - interval '24 hours') as p24`,
    );
    // hypertable_size é do TimescaleDB; sem ele (ou sem permissão) a tela só não mostra a parte de posições
    let posicoesBytes: number | null = null;
    try {
      const h = await this.pool.query(`select hypertable_size('posicoes') as b`);
      posicoesBytes = Number(h.rows[0].b);
    } catch {
      posicoesBytes = null;
    }
    return { tamanhoBytes: Number(rows[0].total), posicoesBytes, posicoes24h: Number(rows[0].p24) };
  }

  async inbox(): Promise<{ pendentes: number; maisAntigaSeg: number | null; comErro24h: number }> {
    const { rows } = await this.pool.query(
      `select count(*) filter (where processado_em is null)::int as pendentes,
              extract(epoch from now() - min(recebido_em) filter (where processado_em is null)) as idade,
              count(*) filter (where erro is not null and recebido_em > now() - interval '24 hours')::int as erros
         from ingest_inbox`,
    );
    const r = rows[0];
    return { pendentes: r.pendentes, maisAntigaSeg: r.idade === null ? null : Math.round(Number(r.idade)), comErro24h: r.erros };
  }

  /** Comunicação dos rastreadores instalados: agora (≤ 10 min), recente (≤ 24 h), sem sinal. */
  async comunicacao(): Promise<{ instalados: number; agora: number; ate24h: number }> {
    const { rows } = await this.pool.query(
      `select count(*)::int as instalados,
              count(*) filter (where rc.ultimo_pacote_em > now() - interval '10 minutes')::int as agora,
              count(*) filter (where rc.ultimo_pacote_em > now() - interval '24 hours')::int as ate24h
         from instalacoes i left join rastreador_comunicacao rc on rc.rastreador_id = i.rastreador_id
        where i.desinstalado_em is null`,
    );
    return rows[0];
  }
}
