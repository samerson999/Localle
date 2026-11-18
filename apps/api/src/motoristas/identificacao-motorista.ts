import { normalizarCodigo } from '@localle/shared/cartaoMotorista';
import type { Queryable } from '../db/queryable';

/** Chave padrão do Traccar para o motorista identificado (iButton, RFID, cartão), usada por todos os decoders que o leem. */
export const ATRIBUTO_MOTORISTA_PADRAO = 'driverUniqueId';

export type LeituraMotorista =
  /** O pacote não traz a chave: o aparelho não informa motorista neste pacote, nada muda. */
  | { tipo: 'ausente' }
  /** Traz a chave sem cartão (0, vazio): o aparelho diz que ninguém está identificado. */
  | { tipo: 'sem_codigo' }
  | { tipo: 'codigo'; codigo: string };

/**
 * Código do motorista nos atributos que o Traccar decodificou, para qualquer protocolo: `driverUniqueId` por padrão, ou a
 * chave que o modelo do catálogo diz (`rastreador_modelos.atributo_motorista`).
 */
export function lerCodigoMotorista(attributes: Record<string, unknown> | null | undefined, atributo?: string | null): LeituraMotorista {
  const a = attributes ?? {};
  const chave = atributo || ATRIBUTO_MOTORISTA_PADRAO;
  if (!(chave in a) || a[chave] === null || a[chave] === undefined) return { tipo: 'ausente' };
  const codigo = normalizarCodigo(a[chave]);
  return codigo ? { tipo: 'codigo', codigo } : { tipo: 'sem_codigo' };
}

export type EncerradoPor = 'troca' | 'sem_codigo' | 'ignicao_desligada';

export interface MudancaVinculo {
  acao: 'abriu' | 'encerrou';
  vinculoId: string;
  assetId: string;
  /** Início do vínculo que abriu, ou fim do que encerrou. */
  ts: Date;
  codigo: string;
  motoristaId: string | null;
  encerradoPor?: EncerradoPor;
}

/**
 * Vínculo motorista × veículo de origem `rastreador` a partir do pacote mais novo do rastreador (quem chama garante que o
 * pacote não é atrasado). Regras, iguais para qualquer aparelho:
 * - código novo abre vínculo; código diferente do aberto encerra o aberto (`troca`) e abre outro;
 * - pacote com a chave vazia/zero encerra (`sem_codigo`) — o J-R10, por exemplo, zera a tag depois de desligar;
 * - ignição desligada encerra (`ignicao_desligada`) e não abre: o aparelho que guarda a tag depois de desligar (J-R10 no
 *   pacote do desligamento, Teltonika com "lembrar iButton") não deixa o motorista preso ao veículo parado;
 * - o mesmo motorista identificado em outro veículo encerra o vínculo dele no veículo anterior (`troca`).
 * Código ainda não cadastrado abre vínculo com `motorista_id` null; quando o gestor cadastra, o vínculo aberto é ligado
 * ao motorista no próximo pacote. O passado não é reatribuído.
 */
export async function registrarIdentificacao(
  executor: Queryable,
  ctx: {
    clientId: string;
    assetId: string;
    rastreadorId: string;
    attributes: Record<string, unknown>;
    ignicao: boolean | null;
    ts: Date;
    atributoMotorista: string | null;
  },
): Promise<MudancaVinculo[]> {
  const leitura = lerCodigoMotorista(ctx.attributes, ctx.atributoMotorista);
  const desligou = ctx.ignicao === false;
  if (leitura.tipo === 'ausente' && !desligou) return [];

  const { rows } = await executor.query<{ id: string; codigo: string; motorista_id: string | null; inicio: Date }>(
    `select id, codigo, motorista_id, inicio from motorista_vinculos
      where client_id = $1 and asset_id = $2 and origem = 'rastreador' and fim is null for update`,
    [ctx.clientId, ctx.assetId],
  );
  const aberto = rows[0] ?? null;
  // pacote de antes do vínculo aberto (relógio do aparelho voltou): não mexe no histórico
  if (aberto && ctx.ts < aberto.inicio) return [];

  const mudancas: MudancaVinculo[] = [];
  const encerrar = async (v: { id: string; codigo: string; motorista_id: string | null }, assetId: string, por: EncerradoPor) => {
    await executor.query('update motorista_vinculos set fim = $2, encerrado_por = $3 where id = $1 and client_id = $4', [v.id, ctx.ts, por, ctx.clientId]);
    mudancas.push({ acao: 'encerrou', vinculoId: v.id, assetId, ts: ctx.ts, codigo: v.codigo, motoristaId: v.motorista_id, encerradoPor: por });
  };

  if (desligou || leitura.tipo === 'sem_codigo') {
    if (aberto) await encerrar(aberto, ctx.assetId, desligou ? 'ignicao_desligada' : 'sem_codigo');
    return mudancas;
  }
  if (leitura.tipo !== 'codigo') return mudancas;

  const motoristaId = await motoristaDoCodigo(executor, ctx.clientId, leitura.codigo);
  if (aberto && aberto.codigo === leitura.codigo) {
    // cadastrado depois de lido: liga o vínculo aberto ao motorista
    if (!aberto.motorista_id && motoristaId) {
      await executor.query('update motorista_vinculos set motorista_id = $2 where id = $1 and client_id = $3', [aberto.id, motoristaId, ctx.clientId]);
      mudancas.push({ acao: 'abriu', vinculoId: aberto.id, assetId: ctx.assetId, ts: aberto.inicio, codigo: aberto.codigo, motoristaId });
    }
    return mudancas;
  }
  if (aberto) await encerrar(aberto, ctx.assetId, 'troca');
  if (motoristaId) {
    const outros = await executor.query<{ id: string; codigo: string; motorista_id: string; asset_id: string }>(
      `select id, codigo, motorista_id, asset_id from motorista_vinculos
        where client_id = $1 and motorista_id = $2 and origem = 'rastreador' and fim is null and asset_id <> $3 and inicio <= $4 for update`,
      [ctx.clientId, motoristaId, ctx.assetId, ctx.ts],
    );
    for (const o of outros.rows) await encerrar(o, o.asset_id, 'troca');
  }
  const novo = await executor.query<{ id: string }>(
    `insert into motorista_vinculos (client_id, asset_id, motorista_id, origem, codigo, rastreador_id, inicio)
     values ($1, $2, $3, 'rastreador', $4, $5, $6) returning id`,
    [ctx.clientId, ctx.assetId, motoristaId, leitura.codigo, ctx.rastreadorId, ctx.ts],
  );
  mudancas.push({ acao: 'abriu', vinculoId: novo.rows[0].id, assetId: ctx.assetId, ts: ctx.ts, codigo: leitura.codigo, motoristaId });
  return mudancas;
}

async function motoristaDoCodigo(executor: Queryable, clientId: string, codigo: string): Promise<string | null> {
  const { rows } = await executor.query<{ id: string }>(
    'select id from motoristas where client_id = $1 and codigo_identificacao_norm = $2 and desativado_em is null',
    [clientId, codigo],
  );
  return rows[0]?.id ?? null;
}
