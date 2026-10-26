import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { Public } from '../auth/public.decorator';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import type { UserEntity } from '../users/user.entity';
import { parseConvidado, parseLimite, parseNovoCliente } from './dto/parse-superadmin-input';
import type { SuperadminLoginDto } from './dto/superadmin-login.dto';
import { SuperadminAuthService } from './superadmin-auth.service';
import { SuperadminClientsService } from './superadmin-clients.service';
import { SuperadminRepository } from './superadmin.repository';

const safeUser = (user: UserEntity) => ({ id: user.id, email: user.email, role: user.role, clientId: user.client_id });

@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly auth: SuperadminAuthService,
    private readonly clients: SuperadminClientsService,
    private readonly superadmins: SuperadminRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  @Post('login')
  @Public()
  login(@Body() dto: SuperadminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Corpo: `{ name, revendaId?, admin?: { email } }` — com `admin`, cliente e admin (convidado) nascem juntos. */
  @Post('clients')
  @UseGuards(SuperadminGuard)
  async createClient(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    const { client, admin, conviteEnviado } = await this.clients.createClient(superadminId, parseNovoCliente(body));
    return { client, admin: admin ? safeUser(admin) : null, conviteEnviado };
  }

  // `clientId` explícito no path — nunca inferido de token, porque o token de superadmin não tem um
  // (requisito: toda operação de superadmin sobre um cliente usa contexto explícito e auditável).
  @Post('clients/:clientId/admin-users')
  @UseGuards(SuperadminGuard)
  async createInitialAdmin(
    @CurrentUserId() superadminId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: unknown,
  ) {
    const { user, conviteEnviado } = await this.clients.createInitialAdmin(superadminId, clientId, parseConvidado(body));
    return { ...safeUser(user), conviteEnviado };
  }

  @Post('clients/:clientId/admin-users/:userId/convite')
  @UseGuards(SuperadminGuard)
  reenviarConvite(
    @CurrentUserId() superadminId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clients.reenviarConvite(superadminId, clientId, userId);
  }

  @Get('equipe')
  @UseGuards(SuperadminGuard)
  equipe() {
    return this.superadmins.findAll();
  }

  @Get('auditoria')
  @UseGuards(SuperadminGuard)
  auditoria(@Query('limit') limit?: string) {
    return this.audit.findRecent(parseLimite(limit, 100, 500));
  }
}
