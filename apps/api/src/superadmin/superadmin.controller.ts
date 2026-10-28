import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { Public } from '../auth/public.decorator';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import type { UserEntity } from '../users/user.entity';
import { parseConvidado, parseLimite, parseNovoCliente } from './dto/parse-superadmin-input';
import type { SuperadminLoginDto } from './dto/superadmin-login.dto';
import { SuperadminAuthService } from './superadmin-auth.service';
import { SuperadminClientsService } from './superadmin-clients.service';
import { SuperadminEquipeService } from './superadmin-equipe.service';
import { SuperadminRepository } from './superadmin.repository';

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url
function parseToken(v: unknown): string {
  if (typeof v !== 'string' || !TOKEN.test(v)) throw new BadRequestException('Convite inválido ou expirado');
  return v;
}
function parseSenha(v: unknown, campo: string): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new BadRequestException(`"${campo}" precisa ter de 8 a 200 caracteres`);
  return v;
}

const safeUser = (user: UserEntity) => ({ id: user.id, email: user.email, role: user.role, clientId: user.client_id });

@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly auth: SuperadminAuthService,
    private readonly clients: SuperadminClientsService,
    private readonly superadmins: SuperadminRepository,
    private readonly audit: AuditLogRepository,
    private readonly equipeLocalle: SuperadminEquipeService,
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
    const { client, admin, conviteEnviado, link } = await this.clients.createClient(superadminId, parseNovoCliente(body));
    return { client, admin: admin ? safeUser(admin) : null, conviteEnviado, link };
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
    const { user, conviteEnviado, link } = await this.clients.createInitialAdmin(superadminId, clientId, parseConvidado(body));
    return { ...safeUser(user), conviteEnviado, link };
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

  /** Corpo: `{ email }`. Sem SMTP, `link` volta para quem convidou repassar. */
  @Post('equipe')
  @UseGuards(SuperadminGuard)
  async convidarSuperadmin(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    const { superadmin, conviteEnviado, link } = await this.equipeLocalle.convidar(superadminId, parseConvidado(body).email);
    return { ...superadmin, conviteEnviado, link };
  }

  @Post('equipe/:id/convite')
  @UseGuards(SuperadminGuard)
  reenviarConviteSuperadmin(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipeLocalle.reenviar(superadminId, id);
  }

  @Post('equipe/:id/desativar')
  @UseGuards(SuperadminGuard)
  desativarSuperadmin(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipeLocalle.setAtivo(superadminId, id, false);
  }

  @Post('equipe/:id/reativar')
  @UseGuards(SuperadminGuard)
  reativarSuperadmin(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipeLocalle.setAtivo(superadminId, id, true);
  }

  /** Logado: troca a própria senha (exige a atual). */
  @Post('senha')
  @UseGuards(SuperadminGuard)
  @HttpCode(204)
  async trocarSenha(@CurrentUserId() superadminId: string, @Body() body: { senhaAtual?: unknown; novaSenha?: unknown }) {
    const atual = typeof body?.senhaAtual === 'string' ? body.senhaAtual : '';
    const nova = parseSenha(body?.novaSenha, 'novaSenha');
    if (atual === nova) throw new BadRequestException('A nova senha precisa ser diferente da atual');
    await this.equipeLocalle.trocarSenha(superadminId, atual, nova);
  }

  // Públicas de propósito (.claude/rules/security.md item 2): quem aceita o convite ainda não tem token; a
  // credencial é o token de uso único do link (só o hash fica no banco). Rate limit por IP segue como débito.
  @Get('convites/:token')
  @Public()
  consultarConvite(@Param('token') token: string) {
    return this.equipeLocalle.consultarConvite(parseToken(token));
  }

  @Post('convites/:token/aceitar')
  @Public()
  aceitarConvite(@Param('token') token: string, @Body() body: { password?: unknown }) {
    return this.equipeLocalle.aceitarConvite(parseToken(token), parseSenha(body?.password, 'password'));
  }

  @Get('auditoria')
  @UseGuards(SuperadminGuard)
  auditoria(@Query('limit') limit?: string) {
    return this.audit.findRecent(parseLimite(limit, 100, 500));
  }
}
