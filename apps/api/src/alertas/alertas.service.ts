import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Alerta } from '@localle/shared/realtime';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { RealtimeHub } from '../realtime/realtime.hub';
import { AlertasRepository } from './alertas.repository';

/**
 * Lido e tratamento são do cliente (não do usuário): quando alguém trata, o alerta sai do "Precisa de
 * você" de todo mundo — por isso cada mudança é publicada no canal do tenant. Tratar é auditado.
 */
@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private readonly repo: AlertasRepository,
    private readonly audit: AuditLogRepository,
    private readonly realtime: RealtimeHub,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  listar(clientId: string, desde: Date) {
    return this.repo.listar(clientId, desde);
  }

  async marcarLidos(clientId: string, ids: string[] | null): Promise<{ marcados: number }> {
    const atualizados = await this.repo.marcarLidos(clientId, ids);
    await this.publicar(clientId, atualizados);
    return { marcados: atualizados.length };
  }

  async tratar(clientId: string, userId: string, id: string, motivo: string, obs: string | null): Promise<Alerta> {
    const alerta = await withTransaction(this.pool, async (client) => {
      const r = await this.repo.tratar(clientId, id, userId, motivo, obs, client);
      if (r === null) throw new NotFoundException('Alerta não encontrado');
      if (r === 'ja_tratado') throw new ConflictException('Este alerta já foi tratado');
      await this.audit.record(
        { actorType: 'user', actorId: userId, clientId, action: 'alerta.tratar', target: id, after: { motivo, obs } },
        client,
      );
      return (await this.repo.buscar(clientId, id, client))!;
    });
    await this.publicar(clientId, [alerta]);
    return alerta;
  }

  private async publicar(clientId: string, alertas: Alerta[]) {
    try {
      for (const alerta of alertas) await this.realtime.publish(clientId, { kind: 'alerta', alerta });
    } catch (err) {
      // já gravado: os outros usuários veem na próxima carga de /alertas
      this.logger.warn(`Atualização de alerta não publicada (client_id ${clientId}): ${(err as Error).message}`);
    }
  }
}
