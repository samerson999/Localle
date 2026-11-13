import type { Alerta } from '@localle/shared/realtime';
import type { PoolClient } from 'pg';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { regraAtende, type Condicao } from '../regras/avaliar-regra';
import { COLUNAS_ALERTA, inserirAlerta, toAlerta } from './alertas.repository';

/** Desfecho gravado quando o alerta fecha sozinho porque a condição deixou de valer. */
export const MOTIVO_NORMALIZADO = 'Normalizado';

interface TipoCondicao {
  chave: string;
  nome: string;
  prioridade: Alerta['prioridade'];
  condicoes: Condicao[];
  duracao_min: number;
  encerra_sozinho: boolean;
  repetir_min: number;
  padrao: boolean;
  ligado: boolean | null;
  /** Ajuste do cliente no tipo padrão: limite (valor da 1ª condição) e duração; null = o da plataforma. */
  valor_cliente: string | null;
  duracao_cliente: number | null;
}

interface Estado {
  chave: string;
  desde: Date;
  alerta_id: string | null;
  ultimo_disparo: Date | null;
}

const MIN = 60_000;

/**
 * Alertas da plataforma por condição sobre o estado do rastreador (Console da Locale › Tipos de alerta, migration
 * 1794310000000). Roda na transação da ingestão, só para a posição mais nova do ativo (posição atrasada avaliaria
 * estado velho). Por tipo × ativo, `alerta_tipo_estado` guarda desde quando a condição vale e o alerta aberto por ela:
 *  - vale há `duracao_min` (medido no horário das posições) e passou `repetir_min` do último disparo → nasce o alerta;
 *  - enquanto continua valendo, não repete (mesmo que alguém encerre: só volta a disparar depois de normalizar);
 *  - deixou de valer → o estado some e, com `encerra_sozinho`, o alerta ainda aberto fecha como "Normalizado".
 * A duração só é conferida quando chega posição: aparelho calado não completa o tempo (o "sem posição" cobre isso).
 * `attributes` = últimos valores conhecidos de cada atributo (aparelho que manda cada dado num pacote não oscila).
 * Devolve os alertas criados e os fechados, para a publicação em tempo real.
 */
export async function avaliarAlertasPlataforma(
  client: PoolClient,
  p: {
    clientId: string;
    assetId: string;
    position: NormalizedPosition;
    attributes: Record<string, unknown>;
    telemetria: { tensaoV: number | null; satelites: number | null; sinalGsm: number | null; bloqueado: boolean | null; alimentacaoExterna: boolean | null };
  },
): Promise<Alerta[]> {
  const { rows: tipos } = await client.query<TipoCondicao>(
    `select t.chave, t.nome, t.prioridade, t.condicoes, t.duracao_min, t.encerra_sozinho, t.repetir_min, t.padrao,
            c.ligado, c.valor::text as valor_cliente, c.duracao_min as duracao_cliente
       from alerta_tipos t
       left join alerta_tipos_cliente c on c.client_id = $1 and c.chave = t.chave
      where t.disparo = 'condicao' and t.gera_alerta`,
    [p.clientId],
  );
  // tipo padrão: o cliente ajusta o limite e a duração para a operação dele (Setup › Alertas da plataforma)
  for (const t of tipos) {
    if (!t.padrao) continue;
    if (t.valor_cliente !== null && t.condicoes[0]) t.condicoes = [{ ...t.condicoes[0], value: t.valor_cliente }, ...t.condicoes.slice(1)];
    if (t.duracao_cliente !== null) t.duracao_min = t.duracao_cliente;
  }
  const { rows: estados } = await client.query<Estado>(
    'select chave, desde, alerta_id, ultimo_disparo from alerta_tipo_estado where asset_id = $1 for update',
    [p.assetId],
  );
  if (tipos.length === 0 && estados.length === 0) return [];

  const ctx = {
    fixTime: p.position.fixTime,
    speedKmh: p.position.speedKmh,
    ignition: p.position.ignition,
    tiposCercaDentro: [],
    alarms: p.position.alarms,
    attributes: p.attributes,
    alimentacaoExterna: p.telemetria.alimentacaoExterna,
    telemetria: p.telemetria,
  };
  const agora = p.position.fixTime.getTime();
  const porChave = new Map(estados.map((e) => [e.chave, e]));
  const saida: Alerta[] = [];

  for (const t of tipos) {
    const est = porChave.get(t.chave);
    porChave.delete(t.chave);
    // cliente desligou no Setup dele: não acompanha (e não deixa estado velho disparar quando religar)
    const atende = t.ligado !== false && regraAtende(t.condicoes, ctx);
    if (!atende) {
      if (est) saida.push(...(await normalizar(client, p.clientId, p.assetId, t.chave, est, t.encerra_sozinho)));
      continue;
    }
    const desde = est?.desde ?? p.position.fixTime;
    if (!est) {
      await client.query(
        'insert into alerta_tipo_estado (chave, asset_id, client_id, desde) values ($1, $2, $3, $4)',
        [t.chave, p.assetId, p.clientId, desde],
      );
    }
    const jaAberto = !!est?.alerta_id;
    const durou = agora - desde.getTime() >= t.duracao_min * MIN;
    const intervalo = !est?.ultimo_disparo || agora - est.ultimo_disparo.getTime() >= t.repetir_min * MIN;
    if (jaAberto || !durou || !intervalo) continue;

    const alerta = await inserirAlerta(client, {
      clientId: p.clientId,
      assetId: p.assetId,
      eventoId: null,
      origem: 'aparelho',
      tipo: t.chave,
      titulo: t.nome,
      detalhe: t.duracao_min > 0 ? `Há mais de ${t.duracao_min} min` : null,
      prioridade: t.prioridade,
      ts: p.position.fixTime,
    });
    if (!alerta) continue;
    await client.query(
      'update alerta_tipo_estado set alerta_id = $3, ultimo_disparo = $4 where chave = $1 and asset_id = $2',
      [t.chave, p.assetId, alerta.id, p.position.fixTime],
    );
    saida.push(alerta);
  }

  // tipo excluído/desligado na plataforma com estado sobrando: normaliza também
  for (const est of porChave.values()) saida.push(...(await normalizar(client, p.clientId, p.assetId, est.chave, est, true)));
  return saida;
}

async function normalizar(client: PoolClient, clientId: string, assetId: string, chave: string, est: Estado, encerra: boolean): Promise<Alerta[]> {
  await client.query('delete from alerta_tipo_estado where chave = $1 and asset_id = $2', [chave, assetId]);
  if (!encerra || !est.alerta_id) return [];
  const { rows } = await client.query(
    `update alertas set tratado_em = now(), tratamento_motivo = $3, lido_em = coalesce(lido_em, now())
      where client_id = $1 and id = $2 and tratado_em is null
      returning ${COLUNAS_ALERTA}, null::text as tratado_por_email`,
    [clientId, est.alerta_id, MOTIVO_NORMALIZADO],
  );
  return rows.map(toAlerta);
}
