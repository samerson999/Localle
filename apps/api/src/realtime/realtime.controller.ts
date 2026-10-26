import { Controller, Logger, MessageEvent, Query, Sse, UseGuards } from '@nestjs/common';
import { filter, from, interval, map, merge, Observable, share, switchMap, takeUntil } from 'rxjs';
import { ActiveUserRepository } from '../auth/active-user.repository';
import type { Role } from '../auth/jwt';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentRole, CurrentUserId } from '../clients/current-role.decorator';
import { parseDate } from '../common/parse-date';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { RealtimeStreamService } from './realtime-stream.service';

const HEARTBEAT_MS = 25_000;
const PERMISSAO = 'monitoramento.ver';

/**
 * SSE em vez do WebSocket descrito em docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2: o fluxo é só
 * API → front, não exige dependência nova e passa pelo mesmo `AuthGuard` global (Bearer no header — o
 * front lê com `fetch` + stream, não com `EventSource`, que não manda header). O protocolo de
 * conexão/reconexão da § 5.2 está inteiro em `RealtimeStreamService`.
 *
 * Revogação (§ 5.2): a conexão é longa e o guard só roda na abertura, então a cada heartbeat a API
 * reconfere se o usuário segue ativo e com a permissão — se não, encerra o stream.
 */
@Controller('monitoring')
@UseGuards(PermissionsGuard)
@RequirePermission(PERMISSAO)
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(
    private readonly stream: RealtimeStreamService,
    private readonly activeUsers: ActiveUserRepository,
    private readonly permissions: PermissionsService,
  ) {}

  @Sse('stream')
  open(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @CurrentRole() role: Role,
    @Query('since') since?: string,
  ): Observable<MessageEvent> {
    const sinceDate = since ? parseDate('since', since) : null;
    // mantém a conexão viva atrás de proxy (Coolify/Traefik corta conexão ociosa)
    const heartbeat = interval(HEARTBEAT_MS).pipe(share());
    const revogado = heartbeat.pipe(
      switchMap(() => from(this.aindaAutorizado(clientId, userId, role))),
      filter((autorizado) => !autorizado),
    );
    return merge(
      this.stream.open(clientId, sinceDate).pipe(map((data) => ({ data }))),
      heartbeat.pipe(map(() => ({ type: 'ping', data: '' }))),
    ).pipe(takeUntil(revogado));
  }

  private async aindaAutorizado(clientId: string, userId: string, role: Role): Promise<boolean> {
    try {
      return (await this.activeUsers.isActive(userId)) && (await this.permissions.isAllowed(clientId, role, PERMISSAO));
    } catch (err) {
      // falha transitória do banco não derruba o stream; a próxima volta confere de novo
      this.logger.warn(`Não foi possível reconferir acesso do stream (user ${userId}): ${(err as Error).message}`);
      return true;
    }
  }
}
