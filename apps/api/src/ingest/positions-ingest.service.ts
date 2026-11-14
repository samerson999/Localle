import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Alerta, Telemetria } from '@localle/shared/realtime';
import { alertaDoAlarme } from '../alertas/alarmes-aparelho';
import { inserirAlerta } from '../alertas/alertas.repository';
import { avaliarAlertasPlataforma } from '../alertas/alertas-plataforma';
import { detectarCercas } from '../cercas/cerca-detector';
import { FUSO_PADRAO } from '../regras/avaliar-regra';
import { avaliarRegras } from '../regras/motor-regras';
import { atualizarSinaisMotor } from '../telemetria/instalacao-sinais.repository';
import { acompanharAtributos, chavesLidas, type DatasPorChave } from '../telemetria/atributos-vistos';
import { lerTelemetria, lerTelemetriaComIdade, mapeamentoDaLinha } from '../telemetria/leitura';
import { mapeamentoSinaisDaLinha, ROTULO_SINAL } from '../telemetria/sinais-motor';
import { resolverInstalacaoVigente } from './instalacao-vigente';
import type { NormalizedPosition } from './traccar-position.mapper';

export type IngestResult =
  | { status: 'deduped' }
  /** Recusada na admissão (admissao-posicao.ts): formato inválido — não é retentada, é logada. */
  | { status: 'recusada'; motivo: string }
  | { status: 'rastreador_desconhecido' }
  | {
      status: 'gravada';
      posicaoId: string;
      /** Pacote de status que repetia a última posição gravada: `posicaoId` é a original, nenhuma linha nova em `posicoes`. */
      posicaoCopiada: boolean;
      rastreadorId: string;
      clientId: string | null;
      assetId: string | null;
      /** `true` quando esta posição passou a ser a `ultima_posicao` do rastreador (válida e mais recente). */
      atualizouUltimaPosicao: boolean;
      eventos: EventoGravado[];
      /** Alertas criados nesta transação (para o worker publicar em tempo real). */
      alertas: Alerta[];
      /** Lida dos últimos atributos conhecidos do rastreador (não só desta posição), com o mapeamento do modelo. */
      telemetria: Telemetria;
    };

export interface EventoGravado {
  id: string;
  tipo: string;
  ts: Date;
  attributes?: Record<string, unknown>;
  /** Decidido pelo backend (ex.: cerca com alerta ligado); ausente = o evento não pede alerta próprio. */
  alerta?: { titulo: string; prioridade: 'alta' | 'media' | 'baixa'; exigeTratamento?: boolean } | null;
}

/**
 * Implementa o algoritmo de docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.3: reserva a identidade da
 * posição em `ingest_posicoes_recebidas` (on conflict do nothing), grava a posição, e só então marca a
 * reserva como resolvida — o commit acontece depois desse segundo update, nunca antes. Roda numa única
 * transação por posição (volume baixo por chamada: um worker da fila processa uma posição por job).
 */
// "04/11 às 12:00" no fuso da operação (o mesmo das regras), para o texto do alerta
const DIA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PADRAO, day: '2-digit', month: '2-digit' });
const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PADRAO, hour: '2-digit', minute: '2-digit' });
const desdeTexto = (d: Date) => `${DIA.format(d)} às ${HORA.format(d)}`;

@Injectable()
export class PositionsIngestService {
  private readonly logger = new Logger(PositionsIngestService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ingest(recebida: NormalizedPosition): Promise<IngestResult> {
    // Hora não confiável (relógio do aparelho adiantado, admissao-posicao.ts): a posição vai para o histórico com o fixTime e
    // o valid originais, mas tudo que decide o estado atual (dono no instante, sinais, eventos) usa a hora do Traccar e
    // trata a posição como sem fix — mapa, cercas e regras não andam, e nenhuma data futura entra em ultima_posicao.
    const position = recebida.horaConfiavel === false ? { ...recebida, fixTime: recebida.serverTime, valid: false } : recebida;
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const rastreador = await client.query<{
        id: string; protocolo: string | null; modelo_protocolo: string | null; modelo: string | null;
        atributo_tensao: string | null; sinal_max: number | null; atributo_bloqueio: string | null;
        suporte_can: string | null; sinais_motor: string[] | null; atributo_rpm: string | null; atributo_odometro: string | null;
        atributo_combustivel: string | null; atributo_horimetro: string | null; modelo_atualizado_em: Date | null;
      }>(
        `select r.id, r.protocolo, m.protocolo as modelo_protocolo, r.modelo, m.atributo_tensao, m.sinal_max, m.atributo_bloqueio,
                m.suporte_can, m.sinais_motor, m.atributo_rpm, m.atributo_odometro, m.atributo_combustivel, m.atributo_horimetro,
                m.atualizado_em as modelo_atualizado_em
           from rastreadores r left join rastreador_modelos m on m.id = r.modelo_id
          where r.traccar_device_id = $1`,
        [position.traccarDeviceId],
      );
      if (rastreador.rowCount === 0) {
        await client.query('rollback');
        return { status: 'rastreador_desconhecido' };
      }
      const rastreadorId = rastreador.rows[0].id;
      if (recebida.horaConfiavel === false) {
        this.logger.warn(
          `rastreador_id=${rastreadorId} traccar_position_id=${recebida.traccarPositionId} fixTime ${recebida.fixTime.toISOString()} à frente do serverTime ${recebida.serverTime.toISOString()} (relógio do aparelho): gravada no histórico, sem mover o mapa`,
        );
      }
      // O protocolo é o que o Traccar usou para decodificar (definido pela porta em que o aparelho conecta),
      // não digitado no cadastro: o Traccar não expõe lista de protocolos pela API. Só grava quando muda.
      if (position.protocol && position.protocol !== rastreador.rows[0].protocolo) {
        await client.query('update rastreadores set protocolo = $2, atualizado_em = now() where id = $1', [rastreadorId, position.protocol]);
        this.logger.log(`rastreador_id=${rastreadorId} protocolo detectado: ${rastreador.rows[0].protocolo ?? '(vazio)'} → ${position.protocol}`);
        // decisão de 28/10/2026: protocolo diferente do modelo grava e avisa (a tela de Rastreadores marca a divergência)
        const esperado = rastreador.rows[0].modelo_protocolo;
        if (esperado && esperado !== position.protocol) {
          this.logger.warn(
            `rastreador_id=${rastreadorId} protocolo ${position.protocol} diferente do modelo ${rastreador.rows[0].modelo} (${esperado}): aparelho na porta de outro protocolo ou modelo cadastrado errado`,
          );
        }
      }

      const reserva = await client.query(
        `insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id)
         values ($1, $2) on conflict (rastreador_id, traccar_position_id) do nothing
         returning rastreador_id`,
        [rastreadorId, position.traccarPositionId],
      );
      if (reserva.rowCount === 0) {
        await client.query('rollback');
        return { status: 'deduped' };
      }

      const vigente = await resolverInstalacaoVigente(client, rastreadorId, position.fixTime);
      const clientId = vigente.clientId;
      // Backup (14/11/2026): comunica e guarda histórico com o cliente, mas não fala pelo ativo — a posição dele não vai
      // para o histórico do ativo, não move o mapa e não roda cercas, regras, sinais nem alertas. O vínculo com o ativo
      // fica só em `rastreador_comunicacao`/`ultima_posicao` (por rastreador), que a ficha lê.
      const backup = vigente.papel === 'backup';
      const assetId = backup ? null : vigente.assetId;
      const instalacaoId = backup ? null : vigente.instalacaoId;

      // Pacote de status/heartbeat sem GPS novo: o Traccar repete nele a última posição (mesma hora e mesmo lugar). O VL100
      // manda um a cada ~10 s — na HML (12/11/2026) chegaram a 10 mil cópias de uma posição num dia, e o histórico do dia
      // (limite de 10 mil pontos) perdia o fim do percurso. A cópia não vira linha nova em `posicoes`; os atributos dela
      // (ignição, sinal, alimentação, alarmes) seguem como qualquer pacote, presos à posição original.
      const copia = await this.posicaoCopiada(client, rastreadorId, recebida);
      let posicaoId: string;
      if (copia) {
        posicaoId = copia;
        this.logger.debug(`rastreador_id=${rastreadorId} traccar_position_id=${recebida.traccarPositionId} repete a posição ${copia} (pacote de status): não gravada de novo`);
      } else {
        const inserted = await client.query<{ id: string }>(
          `insert into posicoes
            (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom,
             speed_kmh, course, altitude, odometer_m, ignition, attributes)
           values ($1, $2, $3, $4, $5, $6, $7, st_setsrid(st_makepoint($8, $9), 4326), $10, $11, $12, $13, $14, $15)
           returning id`,
          [
            rastreadorId,
            position.traccarPositionId,
            clientId,
            assetId,
            recebida.fixTime,
            position.serverTime,
            recebida.valid,
            position.longitude,
            position.latitude,
            position.speedKmh,
            position.course,
            position.altitude,
            position.odometerM,
            position.ignition,
            position.attributes,
          ],
        );
        posicaoId = inserted.rows[0].id;
      }

      await client.query(
        `update ingest_posicoes_recebidas set posicao_id = $1
         where rastreador_id = $2 and traccar_position_id = $3`,
        [posicaoId, rastreadorId, position.traccarPositionId],
      );

      const mapeamento = mapeamentoDaLinha(rastreador.rows[0]);
      const mapeamentoSinais = mapeamentoSinaisDaLinha(rastreador.rows[0]);
      const comunicacao = await this.atualizarComunicacao(client, rastreadorId, vigente.assetId, clientId, position, chavesLidas(mapeamento, mapeamentoSinais));
      const telemetria = lerTelemetriaComIdade(comunicacao.ultimosAtributos, comunicacao.vistosEm, mapeamento);
      // mudança de formato que passaria despercebida (decoder do Traccar, firmware, configuração do aparelho)
      if (comunicacao.novos.length) {
        this.logger.log(
          `rastreador_id=${rastreadorId} protocolo=${position.protocol ?? '?'} atributos novos: ${comunicacao.novos.join(', ')} (decoder do Traccar, firmware ou configuração do aparelho mudou?)`,
        );
      }
      for (const p of comunicacao.pararam) {
        this.logger.warn(
          `rastreador_id=${rastreadorId} protocolo=${position.protocol ?? '?'} atributo ${p.chave}, lido pela plataforma como ${p.leitura}, não chega desde ${p.desde} com o aparelho transmitindo: a tela mostra o último valor antigo; confira o mapeamento do modelo`,
        );
      }

      // sinais de motor: só instalado (aparelho em bancada não tem CAN) e sempre pelos atributos DESTA posição
      const alertasSinais: Alerta[] = [];
      if (clientId && instalacaoId) {
        const transicoes = await atualizarSinaisMotor(client, {
          clientId,
          instalacaoId,
          rastreadorId,
          attributes: position.attributes,
          ctx: { fixTime: position.fixTime, serverTime: position.serverTime, gpsValido: position.valid, velocidadeKmh: position.speedKmh },
          mapeamento: mapeamentoSinais,
          mapeamentoVersao: rastreador.rows[0].modelo_atualizado_em,
        });
        for (const t of transicoes) {
          const msg = `rastreador_id=${rastreadorId} instalacao_id=${instalacaoId} sinal ${t.sinal}: ${t.de ?? '(novo)'} → ${t.para} (${t.motivo})`;
          if (t.para === 'nao_recebido' || t.para === 'fora_do_esperado') this.logger.warn(msg);
          else this.logger.log(msg);
        }
        // alerta para o gestor só quando o dado CHEGAVA e parou com o veículo em movimento; "nunca chegou" é problema
        // de instalação e fica no diagnóstico do admin (docs/PESQUISA-REDE-CAN.md § 4.3)
        const pararam = transicoes.filter((t) => t.para === 'nao_recebido' && t.ultimaLeituraEm);
        if (pararam.length) {
          const desde = new Date(Math.min(...pararam.map((t) => t.ultimaLeituraEm!.getTime())));
          const sinal = await inserirAlerta(client, {
              clientId,
              assetId,
              eventoId: null,
              origem: 'aparelho',
              tipo: 'sinais_painel_pararam',
              titulo: 'Dados do painel pararam de chegar',
              detalhe: `${pararam.map((t) => ROTULO_SINAL[t.sinal]).join(', ')}: sem leitura desde ${desdeTexto(desde)}, com o veículo em movimento`,
              prioridade: 'media',
              ts: copia ? position.serverTime : position.fixTime,
            });
          if (sinal) alertasSinais.push(sinal);
        }
      }
      const atualizouUltimaPosicao = position.valid
        ? await this.atualizarUltimaPosicao(client, rastreadorId, vigente.assetId, clientId, posicaoId, position)
        : false;
      const eventos: EventoGravado[] = await this.gravarAlarmes(client, rastreadorId, assetId, clientId, posicaoId, position, !!copia);
      // corte pelo estado: muitos aparelhos (o teltonika da HML, por exemplo) não mandam o alarme `powerCut`, e o corte
      // ficaria só no ícone. Só a virada ligada → cortada conta: aparelho que já nasce cortado é bancada, não furto.
      const alimentacaoAntes = lerTelemetria(comunicacao.atributosAntes, mapeamento).alimentacaoExterna;
      if (alimentacaoAntes === true && telemetria.alimentacaoExterna === false && !position.alarms.includes('powerCut')) {
        const pelaTensao = telemetria.tensaoV !== null;
        this.logger.warn(
          `rastreador_id=${rastreadorId} asset_id=${assetId ?? '-'} alimentação externa cortada (${pelaTensao ? `tensão ${telemetria.tensaoV} V` : 'charge=false'}) sem alarme powerCut do aparelho`,
        );
        eventos.push(await this.gravarEvento(client, rastreadorId, assetId, clientId, posicaoId, position, !!copia, 'powerCut', { detectadoPor: pelaTensao ? 'tensao' : 'charge' }));
      }
      // Backup: alarme do próprio aparelho (violação, corte de alimentação) vira alerta para o gestor, preso ao ativo
      // em que ele está; o evento fica fora da linha do tempo do ativo. Cercas, regras e alertas por estado não rodam.
      if (backup) {
        const alertasBackup: Alerta[] = [];
        if (clientId) {
          for (const e of eventos) {
            if (!e.alerta) continue;
            const alerta = await inserirAlerta(client, {
              clientId,
              assetId: vigente.assetId,
              eventoId: e.id,
              origem: 'aparelho',
              tipo: e.tipo,
              titulo: `Backup: ${e.alerta.titulo}`,
              detalhe: null,
              prioridade: e.alerta.prioridade,
              exigeTratamento: e.alerta.exigeTratamento,
              ts: e.ts,
            });
            if (alerta) alertasBackup.push(alerta);
          }
        }
        await client.query('commit');
        this.logger.debug(`rastreador_id=${rastreadorId} instalacao_id=${vigente.instalacaoId} posição do backup gravada (não move o ativo)`);
        return {
          status: 'gravada', posicaoId, posicaoCopiada: !!copia, rastreadorId, clientId, assetId: null,
          atualizouUltimaPosicao: false, eventos, alertas: alertasBackup, telemetria,
        };
      }
      // cópia da última posição: mesmo lugar, nada entra nem sai de cerca
      if (position.valid && clientId && assetId && !copia) {
        eventos.push(
          ...(await detectarCercas(client, {
            clientId,
            assetId,
            rastreadorId,
            posicaoId,
            fixTime: position.fixTime,
            longitude: position.longitude,
            latitude: position.latitude,
          })),
        );
      }

      // regras só sobre a posição mais nova do ativo: posição atrasada avaliaria estado velho
      if (atualizouUltimaPosicao && clientId && assetId) {
        eventos.push(...(await avaliarRegras(client, { clientId, assetId, rastreadorId, posicaoId, position, alimentacaoExterna: telemetria.alimentacaoExterna })));
      }

      const alertas: Alerta[] = [...alertasSinais];
      if (clientId) {
        for (const e of eventos) {
          if (!e.alerta) continue;
          const alerta = await inserirAlerta(client, {
              clientId,
              assetId,
              eventoId: e.id,
              origem: e.tipo === 'regra' ? 'regra' : e.tipo.startsWith('cerca_') ? 'cerca' : 'aparelho',
              tipo: e.tipo,
              titulo: e.alerta.titulo,
              // regra: mesma informação que a simulação mostrava ("placa · velocidade"; a placa o front junta)
              detalhe: e.tipo === 'regra' && position.speedKmh !== null ? `${Math.round(position.speedKmh)} km/h` : null,
              prioridade: e.alerta.prioridade,
              exigeTratamento: e.alerta.exigeTratamento,
              ts: e.ts,
            });
          if (alerta) alertas.push(alerta);
        }
        // alertas da plataforma por condição sobre o estado (Console › Tipos de alerta): só sobre a posição mais nova
        if (atualizouUltimaPosicao && assetId) {
          alertas.push(
            ...(await avaliarAlertasPlataforma(client, { clientId, assetId, position, attributes: comunicacao.ultimosAtributos ?? {}, telemetria })),
          );
        }
      }

      await client.query('commit');
      return { status: 'gravada', posicaoId, posicaoCopiada: !!copia, rastreadorId, clientId, assetId, atualizouUltimaPosicao, eventos, alertas, telemetria };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Último pacote, último valor de cada atributo e quando cada um chegou (src/telemetria/atributos-vistos.ts). Lê a linha
   * com `for update` para calcular as datas por chave sem corrida com outro worker do mesmo rastreador.
   */
  private async atualizarComunicacao(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    position: NormalizedPosition,
    lidas: Map<string, string>,
  ) {
    const antes = await client.query<{ atributos_vistos_em: DatasPorChave; atributos_ausentes_desde: DatasPorChave; atributos_em: Date | null; ultimos_atributos: Record<string, unknown> }>(
      'select atributos_vistos_em, atributos_ausentes_desde, atributos_em, ultimos_atributos from rastreador_comunicacao where rastreador_id = $1 for update',
      [rastreadorId],
    );
    const a = antes.rows[0];
    const acompanhamento = acompanharAtributos(
      a ? { vistosEm: a.atributos_vistos_em, ausentesDesde: a.atributos_ausentes_desde, atributosEm: a.atributos_em } : null,
      Object.keys(position.attributes),
      position.serverTime,
      lidas,
    );
    const { rows } = await client.query<{ ultimos_atributos: Record<string, unknown> }>(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em, ultimos_atributos, atributos_em,
                                          atributos_vistos_em, atributos_ausentes_desde)
       values ($1, $2, $3, least($7::timestamptz, now()), case when $4 then $5::timestamptz else null end, $6::jsonb, $7, $8::jsonb, $9::jsonb)
       on conflict (rastreador_id) do update set
         -- hora em que o Traccar recebeu o pacote (server_time), não a hora do processamento: posição atrasada
         -- (recuperada pela conciliação, reenvio do Traccar, buffer do aparelho) não faz um aparelho calado parecer
         -- "transmitindo agora" nem devolve o vínculo a um cliente/ativo anterior
         asset_id = case when excluded.ultimo_pacote_em >= coalesce(rastreador_comunicacao.ultimo_pacote_em, '-infinity')
           then excluded.asset_id else rastreador_comunicacao.asset_id end,
         client_id = case when excluded.ultimo_pacote_em >= coalesce(rastreador_comunicacao.ultimo_pacote_em, '-infinity')
           then excluded.client_id else rastreador_comunicacao.client_id end,
         ultimo_pacote_em = greatest(excluded.ultimo_pacote_em, rastreador_comunicacao.ultimo_pacote_em),
         -- greatest ignora null e não deixa pacote atrasado (fix_time antigo) regredir o valor
         ultima_posicao_valida_em = greatest(excluded.ultima_posicao_valida_em, rastreador_comunicacao.ultima_posicao_valida_em),
         -- último valor conhecido de cada atributo (aparelho que manda cada dado num pacote): o pacote mais novo
         -- sobrescreve; o atrasado/reenviado só preenche chave que ainda não existia
         ultimos_atributos = case when excluded.atributos_em >= coalesce(rastreador_comunicacao.atributos_em, '-infinity')
           then rastreador_comunicacao.ultimos_atributos || excluded.ultimos_atributos
           else excluded.ultimos_atributos || rastreador_comunicacao.ultimos_atributos end,
         atributos_em = greatest(excluded.atributos_em, rastreador_comunicacao.atributos_em),
         -- calculados acima sobre a linha travada (já tratam pacote atrasado)
         atributos_vistos_em = excluded.atributos_vistos_em,
         atributos_ausentes_desde = excluded.atributos_ausentes_desde,
         atualizado_em = now()
       returning ultimos_atributos`,
      [
        rastreadorId, assetId, clientId, position.valid, position.fixTime, JSON.stringify(position.attributes), position.serverTime,
        JSON.stringify(acompanhamento.vistosEm), JSON.stringify(acompanhamento.ausentesDesde),
      ],
    );
    return { ultimosAtributos: rows[0].ultimos_atributos, atributosAntes: a?.ultimos_atributos ?? null, ...acompanhamento };
  }

  /**
   * Id da última posição gravada do rastreador quando o pacote a repete: mesma hora do aparelho e mesmo ponto. Compara com
   * `ultima_posicao` (uma linha por rastreador, sem varrer `posicoes`); cópia de posição mais antiga que a última é rara e
   * fica gravada como antes. Vale com ou sem GPS válido no pacote — o Traccar copia o último lugar nos dois casos.
   */
  private async posicaoCopiada(client: PoolClient, rastreadorId: string, p: NormalizedPosition): Promise<string | null> {
    const { rows } = await client.query<{ posicao_id: string }>(
      `select posicao_id from ultima_posicao
        where rastreador_id = $1 and fix_time = $2 and st_equals(geom, st_setsrid(st_makepoint($3, $4), 4326))`,
      [rastreadorId, p.fixTime, p.longitude, p.latitude],
    );
    return rows[0]?.posicao_id ?? null;
  }

  private async atualizarUltimaPosicao(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    posicaoId: string,
    position: NormalizedPosition,
  ): Promise<boolean> {
    const { rowCount } = await client.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
       values ($1, $2, $3, $4, $5, st_setsrid(st_makepoint($6, $7), 4326), $8, $9)
       on conflict (rastreador_id) do update set
         asset_id = excluded.asset_id, client_id = excluded.client_id,
         posicao_id = excluded.posicao_id, fix_time = excluded.fix_time,
         geom = excluded.geom, speed_kmh = excluded.speed_kmh, ignition = excluded.ignition,
         atualizado_em = now()
       where excluded.fix_time > ultima_posicao.fix_time`,
      [rastreadorId, assetId, clientId, posicaoId, position.fixTime, position.longitude, position.latitude, position.speedKmh, position.ignition],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Alarme do aparelho chega dentro da posição (`attributes.alarm`), então o dedup da posição (reserva em
   * `ingest_posicoes_recebidas`, mesma transação) já impede evento duplicado — `traccar_event_id` fica
   * null. `ingest_eventos_recebidos` continua reservado para quando o Forwarding de eventos do Traccar
   * (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1) for ligado.
   */
  private async gravarAlarmes(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    posicaoId: string,
    position: NormalizedPosition,
    copia: boolean,
  ): Promise<EventoGravado[]> {
    const eventos: EventoGravado[] = [];
    for (const alarme of position.alarms) eventos.push(await this.gravarEvento(client, rastreadorId, assetId, clientId, posicaoId, position, copia, alarme));
    return eventos;
  }

  /**
   * Hora do evento: a do GPS quando o pacote traz posição nova (inclusive a atrasada, guardada no aparelho); num pacote de
   * status (`copia`) a posição é a última repetida pelo Traccar, de horas ou dias antes — aí vale a hora em que o pacote
   * chegou ao Traccar, e `posicaoEm` guarda a hora da posição para o evento achar o ponto no mapa (MonitoringRepository.eventos).
   */
  private async gravarEvento(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    posicaoId: string,
    position: NormalizedPosition,
    copia: boolean,
    tipo: string,
    extra: Record<string, unknown> = {},
  ): Promise<EventoGravado> {
    const ts = copia ? position.serverTime : position.fixTime;
    const { rows } = await client.query<{ id: string }>(
      `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, posicao_id, attributes)
       values ($1, $2, $3, 'aparelho', $4, $5, $6, $7)
       returning id`,
      [rastreadorId, clientId, assetId, tipo, ts, posicaoId, {
        traccarPositionId: position.traccarPositionId, ...(copia ? { posicaoEm: position.fixTime.toISOString() } : {}), ...extra,
      }],
    );
    return { id: rows[0].id, tipo, ts, alerta: await alertaDoAlarme(client, tipo) };
  }
}
