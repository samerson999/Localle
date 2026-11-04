import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { isPgError, PG_FOREIGN_KEY_VIOLATION, UNIQUE, violouUnique } from '../db/pg-errors';
import type { Queryable } from '../db/queryable';
import type { Telemetria } from '@localle/shared/realtime';
import { nomeDoModelo } from '@localle/shared/rastreadorModelos';
import { TraccarClient } from '../ingest/traccar-client';
import { lerTelemetriaComIdade, mapeamentoDaLinha } from '../telemetria/leitura';
import type { SinalMotor, StatusSinal, SuporteCan } from '../telemetria/sinais-motor';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';
import { type EstadoRastreadorRow, type ModeloDados, RastreadorModelosRepository } from './rastreador-modelos.repository';

/**
 * O que o Traccar diz sobre o modelo agora (decisão de 03/11/2026): versão do servidor, se o protocolo do modelo está
 * ativo e em qual porta, e quais comandos ele sabe codificar. `protocolo` null = o Traccar não informa (versão sem
 * /api/protocols, anterior à 6.17); `comandos` null = nenhum aparelho do modelo conectou ainda pelo protocolo certo
 * (o Traccar só responde os comandos de um device, não de um protocolo).
 */
export interface FichaTraccar {
  traccar: { configurado: boolean; versao: string | null; erro: string | null };
  protocolo: { ativo: boolean; porta: number | null; transporte: string | null } | null;
  comandos: { tipos: string[]; imei: string } | null;
}

/**
 * Diagnóstico de um rastreador (checklist da tela, decisão de 03/11/2026): o que a plataforma e o Traccar sabem dele
 * agora. As conclusões (o que está ok e o que fazer) ficam na tela; aqui só os fatos. `online` null = não consultado
 * (sem Traccar ou sem device); `comandos` = deste aparelho, só depois da primeira posição (antes o Traccar não sabe
 * o protocolo dele e responde só `custom`).
 */
export interface DiagnosticoRastreador {
  imei: string;
  status: string;
  modeloId: string | null;
  protocoloDetectado: string | null;
  traccarDeviceId: string | null;
  online: boolean | null;
  ultimoPacoteEm: Date | null;
  atributos: Record<string, unknown>;
  atributosEm: Date | null;
  /** Quando cada atributo chegou pela última vez (ISO): valor antigo continua em `atributos`, com a idade aqui. */
  atributosVistosEm: Record<string, string>;
  /** Lida dos atributos com o mapeamento do modelo (a mesma leitura do monitoramento); campo null = não lido. */
  telemetria: Telemetria;
  /** Última posição válida (com fix de GPS); null = nenhuma ainda. */
  ultimaPosicao: UltimaPosicao | null;
  ficha: FichaTraccar | null;
  comandos: string[] | null;
  /** Sinais de motor / CAN: o que o modelo promete e o estado de cada sinal na instalação vigente. */
  sinaisMotor: SinaisMotorDiagnostico;
}

export interface SinaisMotorDiagnostico {
  suporteCan: SuporteCan;
  /** Sinais que o modelo promete (catálogo). */
  esperados: SinalMotor[];
  /** Um por sinal já avaliado na instalação vigente; sinal ausente da lista = ainda não verificado. */
  sinais: {
    sinal: SinalMotor;
    status: StatusSinal;
    motivo: string;
    ultimoValor: number | null;
    ultimaLeituraEm: Date | null;
    ultimoRecebimentoEm: Date | null;
    atributo: string | null;
    avaliadoAte: Date;
  }[];
}

export interface UltimaPosicao { em: Date; latitude: number; longitude: number; velocidadeKmh: number | null; ignicao: boolean | null }

/**
 * Uma linha da aba Transmissão (Console › Rastreadores): o que o rastreador está mandando, sem consultar o Traccar
 * (a lista inteira atualiza a cada poucos segundos; status do device no Traccar só no diagnóstico de um rastreador).
 */
export interface TransmissaoRastreador {
  id: string;
  imei: string;
  modeloId: string | null;
  modelo: string | null;
  modeloProtocolo: string | null;
  modeloPorta: number | null;
  protocoloDetectado: string | null;
  traccarDeviceId: string | null;
  cliente: string | null;
  placa: string | null;
  ultimoPacoteEm: Date | null;
  ultimaPosicaoValidaEm: Date | null;
  pacotesUltimaHora: number;
  ultimaPosicao: UltimaPosicao | null;
  atributos: Record<string, unknown>;
  atributosEm: Date | null;
  /** Quando cada atributo chegou pela última vez (ISO): valor antigo continua em `atributos`, com a idade aqui. */
  atributosVistosEm: Record<string, string>;
  telemetria: Telemetria;
}

const ultimaPosicaoDaLinha = (r: EstadoRastreadorRow): UltimaPosicao | null =>
  r.posicao_em && r.latitude !== null && r.longitude !== null
    ? { em: r.posicao_em, latitude: r.latitude, longitude: r.longitude, velocidadeKmh: r.velocidade_kmh, ignicao: r.ignicao }
    : null;

/** Catálogo de modelos (docs na migration 1793110000000): só superadmin; toda alteração vai para a auditoria. */
@Injectable()
export class RastreadorModelosService {
  private readonly logger = new Logger(RastreadorModelosService.name);

  constructor(
    private readonly repo: RastreadorModelosRepository,
    private readonly audit: AuditLogRepository,
    private readonly traccar: TraccarClient,
  ) {}

  listar() {
    return this.repo.listar();
  }

  async atributosRecebidos(id: string) {
    if (!(await this.repo.findById(id))) throw new NotFoundException('Modelo não encontrado');
    return this.repo.atributosRecebidos(id);
  }

  async fichaTraccar(id: string): Promise<FichaTraccar> {
    const modelo = await this.repo.findById(id);
    if (!modelo) throw new NotFoundException('Modelo não encontrado');
    const vazia: FichaTraccar = { traccar: { configurado: false, versao: null, erro: null }, protocolo: null, comandos: null };
    const config = this.traccar.config();
    if (!config) return vazia;
    let versao: string | null;
    try {
      versao = await this.traccar.serverVersion(config);
    } catch (err) {
      this.logger.error(`Ficha do modelo ${id}: Traccar não respondeu (/api/server): ${(err as Error).message}`);
      return { ...vazia, traccar: { configurado: true, versao: null, erro: 'O Traccar não respondeu. Tente de novo em instantes.' } };
    }
    const ref = await this.repo.aparelhoDeReferencia(id);
    const [protocolos, tipos] = await Promise.all([
      this.traccar.protocols(config).catch((err) => {
        this.logger.warn(`Ficha do modelo ${id}: /api/protocols falhou: ${(err as Error).message}`);
        return null;
      }),
      ref
        ? this.traccar.commandTypes(config, Number(ref.traccar_device_id)).catch((err) => {
            this.logger.warn(`Ficha do modelo ${id}: comandos do traccar_device_id ${ref.traccar_device_id} falharam: ${(err as Error).message}`);
            return null;
          })
        : null,
    ]);
    const p = protocolos?.find((x) => x.protocolo === modelo.protocolo);
    return {
      traccar: { configurado: true, versao, erro: null },
      protocolo: protocolos ? { ativo: !!p && p.transporte !== 'DISABLED', porta: p?.porta ?? null, transporte: p?.transporte ?? null } : null,
      comandos: ref && tipos ? { tipos, imei: ref.imei } : null,
    };
  }

  async diagnostico(rastreadorId: string): Promise<DiagnosticoRastreador> {
    const r = await this.repo.estadoDoRastreador(rastreadorId);
    if (!r) throw new NotFoundException('Rastreador não encontrado');
    const ficha = r.modelo_id ? await this.fichaTraccar(r.modelo_id) : null;
    const [modelo, sinais] = await Promise.all([r.modelo_id ? this.repo.findById(r.modelo_id) : null, this.repo.sinaisDaInstalacaoVigente(rastreadorId)]);
    const config = this.traccar.config();
    // ficha com erro = Traccar fora: não insiste nas outras consultas
    const consultar = !!config && !!r.traccar_device_id && !ficha?.traccar.erro;
    const deviceId = Number(r.traccar_device_id);
    const [status, comandos] = consultar
      ? await Promise.all([
          this.traccar.deviceStatus(config!, deviceId).catch((err) => {
            this.logger.warn(`Diagnóstico do rastreador ${rastreadorId}: status do traccar_device_id ${deviceId} falhou: ${(err as Error).message}`);
            return null;
          }),
          r.protocolo
            ? this.traccar.commandTypes(config!, deviceId).catch((err) => {
                this.logger.warn(`Diagnóstico do rastreador ${rastreadorId}: comandos do traccar_device_id ${deviceId} falharam: ${(err as Error).message}`);
                return null;
              })
            : null,
        ])
      : [null, null];
    return {
      imei: r.imei,
      status: r.status,
      modeloId: r.modelo_id,
      protocoloDetectado: r.protocolo,
      traccarDeviceId: r.traccar_device_id,
      online: status === null ? null : status === 'online',
      ultimoPacoteEm: r.ultimo_pacote_em,
      atributos: r.ultimos_atributos ?? {},
      atributosEm: r.atributos_em,
      atributosVistosEm: r.atributos_vistos_em ?? {},
      telemetria: lerTelemetriaComIdade(r.ultimos_atributos, r.atributos_vistos_em, mapeamentoDaLinha(r)),
      ultimaPosicao: ultimaPosicaoDaLinha(r),
      ficha,
      comandos,
      sinaisMotor: {
        suporteCan: modelo?.suporte_can ?? 'nao_informado',
        esperados: modelo?.sinais_motor ?? [],
        sinais: sinais.map((s) => ({
          sinal: s.sinal,
          status: s.status,
          motivo: s.motivo,
          ultimoValor: s.ultimo_valor,
          ultimaLeituraEm: s.ultima_leitura_em,
          ultimoRecebimentoEm: s.ultimo_recebimento_em,
          atributo: s.atributo_origem,
          avaliadoAte: s.avaliado_ate,
        })),
      },
    };
  }

  async transmissao(): Promise<TransmissaoRastreador[]> {
    const rows = await this.repo.transmissao();
    return rows.map((r) => ({
      id: r.id,
      imei: r.imei,
      modeloId: r.modelo_id,
      modelo: r.modelo_nome ? nomeDoModelo({ fabricante: r.modelo_fabricante ?? r.modelo_nome, nome: r.modelo_nome }) : null,
      modeloProtocolo: r.modelo_protocolo,
      modeloPorta: r.modelo_porta,
      protocoloDetectado: r.protocolo,
      traccarDeviceId: r.traccar_device_id,
      cliente: r.client_name,
      placa: r.asset_plate,
      ultimoPacoteEm: r.ultimo_pacote_em,
      ultimaPosicaoValidaEm: r.ultima_posicao_valida_em,
      pacotesUltimaHora: r.pacotes_1h,
      ultimaPosicao: ultimaPosicaoDaLinha(r),
      atributos: r.ultimos_atributos ?? {},
      atributosEm: r.atributos_em,
      atributosVistosEm: r.atributos_vistos_em ?? {},
      telemetria: lerTelemetriaComIdade(r.ultimos_atributos, r.atributos_vistos_em, mapeamentoDaLinha(r)),
    }));
  }

  /** `executor`: transação de quem chamou (cadastro do rastreador cria o modelo junto, e desfaz junto se falhar). */
  async criar(superadminId: string, d: ModeloDados, executor?: Queryable): Promise<RastreadorModeloEntity> {
    let criado: RastreadorModeloEntity;
    try {
      criado = await this.repo.criar(d, executor);
    } catch (err) {
      if (violouUnique(err, UNIQUE.modeloRastreador)) throw new ConflictException(`Já existe o modelo ${d.fabricante} ${d.nome}`);
      throw err;
    }
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.criar', target: criado.id, after: d }, executor);
    this.logger.log(`Modelo de rastreador ${criado.fabricante} ${criado.nome} criado (${criado.protocolo}:${criado.porta}) por ${superadminId}`);
    return criado;
  }

  /**
   * Excluir do catálogo: só modelo que nenhum rastreador usa, nem desativado. Usado, o caminho é desativar. Escolher de
   * novo o aparelho na lista do Traccar recria o modelo (com o mapeamento da telemetria vazio).
   */
  async excluir(superadminId: string, id: string): Promise<void> {
    const modelo = await this.repo.findById(id);
    if (!modelo) throw new NotFoundException('Modelo não encontrado');
    const usados = await this.repo.totalDeRastreadores(id);
    if (usados > 0) {
      throw new ConflictException(`O modelo ${nomeDoModelo(modelo)} é de ${usados} rastreador${usados > 1 ? 'es' : ''} (contando desativados). Use Desativar.`);
    }
    try {
      await this.repo.excluir(id);
    } catch (err) {
      // rastreador cadastrado com o modelo entre a contagem e o delete (`on delete restrict`)
      if (isPgError(err, PG_FOREIGN_KEY_VIOLATION)) throw new ConflictException(`O modelo ${nomeDoModelo(modelo)} acabou de ganhar um rastreador. Use Desativar.`);
      throw err;
    }
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.excluir', target: id, before: modelo });
    this.logger.log(`Modelo de rastreador ${nomeDoModelo(modelo)} excluído do catálogo por ${superadminId}`);
  }

  async atualizar(superadminId: string, id: string, d: Partial<ModeloDados & { ativo: boolean }>): Promise<RastreadorModeloEntity> {
    const antes = await this.repo.findById(id);
    if (!antes) throw new NotFoundException('Modelo não encontrado');
    let depois: RastreadorModeloEntity | null;
    try {
      depois = await this.repo.atualizar(id, d);
    } catch (err) {
      if (violouUnique(err, UNIQUE.modeloRastreador)) throw new ConflictException('Já existe outro modelo com esse fabricante e nome');
      throw err;
    }
    const campos = Object.keys(d) as (keyof typeof d)[];
    await this.audit.record({
      actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.atualizar', target: id,
      before: Object.fromEntries(campos.map((k) => [k, (antes as any)[k]])), after: d,
    });
    return depois!;
  }
}
