import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import type { Telemetria } from '@localle/shared/realtime';
import { TraccarClient } from '../ingest/traccar-client';
import { lerTelemetria, mapeamentoDaLinha } from '../telemetria/leitura';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';
import { type ModeloDados, RastreadorModelosRepository } from './rastreador-modelos.repository';

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
  /** Lida dos atributos com o mapeamento do modelo (a mesma leitura do monitoramento); campo null = não lido. */
  telemetria: Telemetria;
  ficha: FichaTraccar | null;
  comandos: string[] | null;
}

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
      telemetria: lerTelemetria(r.ultimos_atributos, mapeamentoDaLinha(r)),
      ficha,
      comandos,
    };
  }

  async criar(superadminId: string, d: ModeloDados): Promise<RastreadorModeloEntity> {
    let criado: RastreadorModeloEntity;
    try {
      criado = await this.repo.criar(d);
    } catch (err) {
      if (violouUnique(err, UNIQUE.modeloRastreador)) throw new ConflictException(`Já existe o modelo ${d.fabricante} ${d.nome}`);
      throw err;
    }
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.criar', target: criado.id, after: d });
    this.logger.log(`Modelo de rastreador ${criado.fabricante} ${criado.nome} criado (${criado.protocolo}:${criado.porta}) por ${superadminId}`);
    return criado;
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
