import type { Alerta } from '@localle/shared/realtime';
import { COLUNAS_ALERTA, inserirAlerta, toAlerta } from '../alertas/alertas.repository';
import type { Queryable } from '../db/queryable';
import { getDefinition } from '../settings/setting-definitions';

export const TIPO_SEM_IDENTIFICACAO = 'motorista_nao_identificado';
export const TITULO_SEM_IDENTIFICACAO = 'Veículo rodando sem identificação do motorista';
/** Desfecho gravado quando o aviso fecha sozinho porque o cartão foi lido na mesma viagem. */
export const MOTIVO_IDENTIFICADO = 'Motorista identificado';

/** Acima disto o veículo está andando; abaixo é manobra/pátio e não conta (decisão de 17/11/2026). */
export const VELOCIDADE_ANDANDO_KMH = 5;
/** Intervalo máximo entre dois pacotes que ainda conta como tempo andando (buraco de sinal não vira minutos rodados). */
const INTERVALO_MAX_S = 120;
/** Sem pacote por mais que isto com a ignição ligada, a viagem anterior é dada como encerrada (perdeu o desligamento). */
const VIAGEM_INTERROMPIDA_S = 30 * 60;

const EXIGIR = 'motoristas.exigir_identificacao';
const TOLERANCIA = 'motoristas.tolerancia_sem_identificacao_min';

interface Viagem {
  viagem_desde: Date;
  ultimo_ts: Date;
  andando_s: number;
  alerta_id: string | null;
}

/**
 * Aviso de veículo rodando sem cartão (migration 1794400000000), na transação da ingestão, só com o pacote mais novo do
 * principal e depois de `registrarIdentificacao` (que diz se há cartão lido nesta viagem). Regras:
 * - só avalia onde há leitor (o modelo aceita E a instalação tem o leitor marcado) e o gestor exige no Setup;
 * - ignição ligada abre a viagem; o tempo andando (> 5 km/h) sem cartão soma até a tolerância do Setup e aí nasce UM
 *   aviso por viagem (não exige tratamento);
 * - cartão lido na viagem fecha o aviso aberto sozinho, com a hora da leitura;
 * - ignição desligada encerra a viagem (o aviso, se ficou aberto, segue no "Precisa de você" para o gestor ver);
 * - aparelho sem ignição (null) não entra: não dá para saber onde a viagem começa.
 * Devolve os alertas criados ou fechados, para a publicação em tempo real.
 */
export async function avaliarSemIdentificacao(
  executor: Queryable,
  ctx: {
    clientId: string;
    assetId: string;
    instalacaoId: string;
    modeloAceitaLeitor: boolean;
    ignicao: boolean | null;
    velocidadeKmh: number | null;
    ts: Date;
  },
): Promise<Alerta[]> {
  if (ctx.ignicao === null) return [];
  if (ctx.ignicao === false) {
    await executor.query('delete from viagem_identificacao where client_id = $1 and asset_id = $2', [ctx.clientId, ctx.assetId]);
    return [];
  }
  if (!ctx.modeloAceitaLeitor || !(await leitorInstalado(executor, ctx.clientId, ctx.instalacaoId)) || !(await exige(executor, ctx.clientId))) {
    await executor.query('delete from viagem_identificacao where client_id = $1 and asset_id = $2', [ctx.clientId, ctx.assetId]);
    return [];
  }

  const { rows } = await executor.query<Viagem>(
    'select viagem_desde, ultimo_ts, andando_s, alerta_id from viagem_identificacao where client_id = $1 and asset_id = $2 for update',
    [ctx.clientId, ctx.assetId],
  );
  let viagem: Viagem | null = rows[0] ?? null;
  if (viagem && ctx.ts < viagem.ultimo_ts) return []; // pacote fora de ordem: não mexe
  if (viagem && (ctx.ts.getTime() - viagem.ultimo_ts.getTime()) / 1000 > VIAGEM_INTERROMPIDA_S) viagem = null;
  if (!viagem) {
    await executor.query(
      `insert into viagem_identificacao (asset_id, client_id, viagem_desde, ultimo_ts, andando_s, alerta_id) values ($1, $2, $3, $3, 0, null)
       on conflict (asset_id) do update set viagem_desde = excluded.viagem_desde, ultimo_ts = excluded.ultimo_ts, andando_s = 0, alerta_id = null`,
      [ctx.assetId, ctx.clientId, ctx.ts],
    );
    return [];
  }

  const saida: Alerta[] = [];
  if (await identificado(executor, ctx.clientId, ctx.assetId)) {
    if (viagem.alerta_id) {
      const { rows: fechados } = await executor.query(
        `update alertas set tratado_em = $3, tratamento_motivo = $4, lido_em = coalesce(lido_em, $3)
          where client_id = $1 and id = $2 and tratado_em is null
          returning ${COLUNAS_ALERTA}, null::text as tratado_por_email`,
        [ctx.clientId, viagem.alerta_id, ctx.ts, MOTIVO_IDENTIFICADO],
      );
      saida.push(...fechados.map(toAlerta));
    }
    // o aviso desta viagem continua registrado (alerta_id): tirar o cartão depois não gera outro (um por viagem); o tempo
    // sem cartão recomeça da leitura
    await executor.query('update viagem_identificacao set ultimo_ts = $3, andando_s = 0 where client_id = $1 and asset_id = $2', [ctx.clientId, ctx.assetId, ctx.ts]);
    return saida;
  }

  const delta = Math.min((ctx.ts.getTime() - viagem.ultimo_ts.getTime()) / 1000, INTERVALO_MAX_S);
  const andando = (ctx.velocidadeKmh ?? 0) > VELOCIDADE_ANDANDO_KMH;
  const andandoS = viagem.andando_s + (andando ? Math.round(delta) : 0);
  let alertaId = viagem.alerta_id;
  const toleranciaMin = await valor(executor, ctx.clientId, TOLERANCIA);
  if (!alertaId && andandoS >= toleranciaMin * 60) {
    const alerta = await inserirAlerta(executor, {
      clientId: ctx.clientId,
      assetId: ctx.assetId,
      eventoId: null,
      origem: 'aparelho',
      tipo: TIPO_SEM_IDENTIFICACAO,
      titulo: TITULO_SEM_IDENTIFICACAO,
      detalhe: `Andou ${Math.floor(andandoS / 60)} min sem passar o cartão`,
      prioridade: 'baixa',
      exigeTratamento: false,
      ts: ctx.ts,
    });
    if (alerta) {
      alertaId = alerta.id;
      saida.push(alerta);
    }
  }
  await executor.query(
    'update viagem_identificacao set ultimo_ts = $3, andando_s = $4, alerta_id = $5 where client_id = $1 and asset_id = $2',
    [ctx.clientId, ctx.assetId, ctx.ts, andandoS, alertaId],
  );
  return saida;
}

async function leitorInstalado(executor: Queryable, clientId: string, instalacaoId: string): Promise<boolean> {
  const { rows } = await executor.query<{ leitor_motorista: boolean }>(
    'select leitor_motorista from instalacoes where client_id = $1 and id = $2',
    [clientId, instalacaoId],
  );
  return rows[0]?.leitor_motorista === true;
}

const exige = async (executor: Queryable, clientId: string) => (await valor(executor, clientId, EXIGIR)) === 1;

/** Valor do Setup do cliente dentro da transação da ingestão; sem override, o padrão da plataforma. */
async function valor(executor: Queryable, clientId: string, chave: string): Promise<number> {
  const { rows } = await executor.query<{ value: unknown }>('select value from client_settings where client_id = $1 and key = $2', [clientId, chave]);
  const v = rows[0]?.value ?? getDefinition(chave)!.default;
  return Number(v);
}

/** Cartão lido e ainda vigente no veículo (vínculo aberto de origem rastreador, gravado por `registrarIdentificacao`). */
async function identificado(executor: Queryable, clientId: string, assetId: string): Promise<boolean> {
  const { rows } = await executor.query(
    `select 1 from motorista_vinculos where client_id = $1 and asset_id = $2 and origem = 'rastreador' and fim is null`,
    [clientId, assetId],
  );
  return rows.length > 0;
}
