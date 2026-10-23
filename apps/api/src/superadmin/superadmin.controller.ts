import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import type { CreateClientDto } from '../clients/dto/create-client.dto';
import type { CreateInitialAdminDto } from './dto/create-initial-admin.dto';
import type { SuperadminLoginDto } from './dto/superadmin-login.dto';
import { SuperadminAuthService } from './superadmin-auth.service';
import { SuperadminClientsService } from './superadmin-clients.service';

@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly auth: SuperadminAuthService,
    private readonly clients: SuperadminClientsService,
  ) {}

  @Post('login')
  @Public()
  login(@Body() dto: SuperadminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('clients')
  @UseGuards(SuperadminGuard)
  createClient(@CurrentUserId() superadminId: string, @Body() dto: CreateClientDto) {
    return this.clients.createClient(superadminId, { name: dto.name, revendaId: dto.revendaId });
  }

  // `clientId` explícito no path — nunca inferido de token, porque o token de superadmin não tem um
  // (requisito: toda operação de superadmin sobre um cliente usa contexto explícito e auditável).
  @Post('clients/:clientId/admin-users')
  @UseGuards(SuperadminGuard)
  async createInitialAdmin(
    @CurrentUserId() superadminId: string,
    @Param('clientId') clientId: string,
    @Body() dto: CreateInitialAdminDto,
  ) {
    const user = await this.clients.createInitialAdmin(superadminId, clientId, dto);
    return { id: user.id, email: user.email, role: user.role, clientId: user.client_id };
  }
}
