import { Injectable } from '@nestjs/common';
import type { Comando, ComandoStatus, ComandoTipo } from '@localle/shared/realtime';
import { BaseRepository } from '../db/base.repository';
import type { Queryable } from '../db/queryable';

export interface ComandoRow {
  id: string;
  client_id: string;
  asset_id: string;
  rastreador_id: string;
  tipo: ComandoTipo;
  status: ComandoStatus;
  motivo: string | null;
  solicitado_por: string;
  solicitado_por_email: string | null;
  solicitado_em: Date;
  enviado_em: Date | null;
  resolvido_em: Date | null;
  expira_em: Date;
  traccar_command_id: string | null;
  resultado: Record<string, unknown> | null;
}

export const PENDENTES: ComandoStatus[] = ['solicitado', 'enviado', 'aguardando'];

const SELECT = `
  select c.*, u.email as solicitado_por_email
  from comandos c left join users u on u.id = c.solicitado_por`;

export const toComando = (r: ComandoRow): Comando => ({
  id: r.id,
  assetId: r.asset_id,
  rastreadorId: r.rastreador_id,
  tipo: r.tipo,
  status: r.status,
  motivo: r.motivo,
  solicitadoPor: r.solicitado_por_email,
  solicitadoEm: r.solicitado_em.toISOString(),
  enviadoEm: r.enviado_em ? r.enviado_em.toISOString() : null,
  resolvidoEm: r.resolvido_em ? r.resolvido_em.toISOString() : null,
  expiraEm: r.expira_em.toISOString(),
  resultado: r.resultado,
});

/**
 * Rotas do gestor filtram por `client_id` (regra do BaseRepository). As leituras sem `client_id`
 * (`pendentesPorRastreador`, `ultimoResolvidoPorRastreador`) só servem ao retorno do Traccar
 * (`commandResult`), que chega identificado por device — o `client_id` sai do próprio comando.
 */
@Injectable()
export class ComandosRepository extends BaseRepository<ComandoRow> {
  protected readonly table = 'comandos';

  async listar(clientId: string, assetId: string | null, limite = 100): Promise<Comando[]> {
    const { rows } = await this.pool.query<ComandoRow>(
      `${SELECT} where c.client_id = $1 and ($2::uuid is null or c.asset_id = $2)
       order by c.solicitado_em desc limit $3`,
      [clientId, assetId, limite],
    );
    return rows.map(toComando);
  }

  async buscar(clientId: string, id: string, executor: Queryable = this.pool): Promise<ComandoRow | null> {
    const { rows } = await executor.query<ComandoRow>(`${SELECT} where c.client_id = $1 and c.id = $2`, [clientId, id]);
    return rows[0] ?? null;
  }

  /** Rastreador principal vigente agora para o ativo do cliente, com o device do Traccar (se provisionado). */
  async rastreadorVigente(clientId: string, assetId: string, executor: Queryable = this.pool) {
    const { rows } = await executor.query<{ rastreador_id: string; traccar_device_id: string | null }>(
      `select i.rastreador_id, r.traccar_device_id
       from instalacoes i join rastreadores r on r.id = i.rastreador_id
       where i.client_id = $1 and i.asset_id = $2 and i.papel = 'principal'
         and i.instalado_em <= now() and (i.desinstalado_em is null or i.desinstalado_em > now())
       order by i.instalado_em desc limit 1`,
      [clientId, assetId],
    );
    return rows[0] ?? null;
  }

  async posicaoAtual(clientId: string, assetId: string, executor: Queryable = this.pool) {
    const { rows } = await executor.query<{ fix_time: Date; speed_kmh: string | null }>(
      `select fix_time, speed_kmh from v_localizacao_atual where client_id = $1 and asset_id = $2 order by fix_time desc limit 1`,
      [clientId, assetId],
    );
    return rows[0] ?? null;
  }

  async pendentesPorRastreador(rastreadorId: string, tipos: ComandoTipo[], executor: Queryable = this.pool): Promise<ComandoRow[]> {
    const { rows } = await executor.query<ComandoRow>(
      `${SELECT} where c.rastreador_id = $1 and c.tipo = any($2) and c.status = any($3) order by c.solicitado_em desc`,
      [rastreadorId, tipos, PENDENTES],
    );
    return rows;
  }

  /**
   * Para a conciliação: rastreadores com comando já entregue ao Traccar e ainda sem resultado há mais de
   * `idadeMinSeg` (dá tempo de o Forwarding entregar primeiro), com o envio mais antigo de cada um.
   */
  async enviadosSemResultado(idadeMinSeg: number, executor: Queryable = this.pool) {
    const { rows } = await executor.query<{ rastreador_id: string; traccar_device_id: string; desde: Date }>(
      `select c.rastreador_id, r.traccar_device_id, min(c.enviado_em) as desde
       from comandos c join rastreadores r on r.id = c.rastreador_id
       where c.status = any($1) and c.enviado_em is not null and c.enviado_em < now() - make_interval(secs => $2)
         and r.traccar_device_id is not null
       group by c.rastreador_id, r.traccar_device_id`,
      [['enviado', 'aguardando'], idadeMinSeg],
    );
    return rows;
  }

  /** O `commandResult` (id do evento no Traccar) já foi registrado em algum comando do rastreador? */
  async resultadoRegistrado(rastreadorId: string, traccarEventId: number, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query(
      `select 1 from comandos where rastreador_id = $1 and resultado->>'traccarEventId' = $2 limit 1`,
      [rastreadorId, String(traccarEventId)],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Último comando do rastreador já resolvido (para registrar um `commandResult` tardio). */
  async ultimoResolvidoPorRastreador(rastreadorId: string, executor: Queryable = this.pool): Promise<ComandoRow | null> {
    const { rows } = await executor.query<ComandoRow>(
      `${SELECT} where c.rastreador_id = $1 and c.status <> all($2) and c.resolvido_em > now() - interval '24 hours'
       order by c.resolvido_em desc limit 1`,
      [rastreadorId, PENDENTES],
    );
    return rows[0] ?? null;
  }

  async criar(
    executor: Queryable,
    c: { clientId: string; assetId: string; rastreadorId: string; tipo: ComandoTipo; motivo: string | null; solicitadoPor: string; expiraEm: Date },
  ): Promise<ComandoRow> {
    const { rows } = await executor.query<{ id: string }>(
      `insert into comandos (client_id, asset_id, rastreador_id, tipo, motivo, solicitado_por, expira_em)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [c.clientId, c.assetId, c.rastreadorId, c.tipo, c.motivo, c.solicitadoPor, c.expiraEm],
    );
    return (await this.buscar(c.clientId, rows[0].id, executor))!;
  }

  /** Transição de estado; `somenteSe` evita sobrescrever um estado já final (ex.: resultado tardio após expirar). */
  async transicionar(
    id: string,
    para: ComandoStatus,
    extra: { traccarCommandId?: number | null; resultado?: Record<string, unknown> | null; enviado?: boolean; resolvido?: boolean },
    somenteSe: ComandoStatus[] = PENDENTES,
    executor: Queryable = this.pool,
  ): Promise<ComandoRow | null> {
    const { rows } = await executor.query<{ client_id: string }>(
      `update comandos set status = $2,
         traccar_command_id = coalesce($3, traccar_command_id),
         resultado = coalesce($4::jsonb, resultado),
         enviado_em = case when $5 then now() else enviado_em end,
         resolvido_em = case when $6 then now() else resolvido_em end
       where id = $1 and status = any($7) returning client_id`,
      [
        id,
        para,
        extra.traccarCommandId ?? null,
        extra.resultado === undefined || extra.resultado === null ? null : JSON.stringify(extra.resultado),
        extra.enviado === true,
        extra.resolvido === true,
        somenteSe,
      ],
    );
    return rows[0] ? this.buscar(rows[0].client_id, id, executor) : null;
  }

  /** Registra um resultado em comando já resolvido sem mudar o estado (execução tardia, § 4.6). */
  async anexarResultadoTardio(id: string, resultado: Record<string, unknown>, executor: Queryable = this.pool): Promise<void> {
    await executor.query(`update comandos set resultado = coalesce(resultado, '{}'::jsonb) || $2::jsonb where id = $1`, [
      id,
      JSON.stringify(resultado),
    ]);
  }

  async expirarVencidos(executor: Queryable = this.pool): Promise<ComandoRow[]> {
    const { rows } = await executor.query<{ id: string; client_id: string }>(
      `update comandos set status = 'expirado', resolvido_em = now(),
         resultado = coalesce(resultado, '{}'::jsonb) || '{"motivo":"sem commandResult dentro do prazo"}'::jsonb
       where status = any($1) and expira_em < now() returning id, client_id`,
      [PENDENTES],
    );
    const out: ComandoRow[] = [];
    for (const r of rows) out.push((await this.buscar(r.client_id, r.id, executor))!);
    return out;
  }
}
