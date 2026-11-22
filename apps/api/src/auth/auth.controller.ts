import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { ActiveUserRepository } from './active-user.repository';
import type { RequestAuth } from './auth.guard';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import { signAuthToken } from './jwt';
import { parseCodigoEmail, parseSenha } from './dto/parse-codigo';
import { Public } from './public.decorator';
import { SenhaService } from './senha.service';

/**
 * Rotas públicas de propósito (`.claude/rules/security.md` item 2): login, "esqueci minha senha" e a
 * redefinição pelo código — quem chega aqui não tem token; a credencial do reset é o código de uso único do
 * e-mail, com teto de tentativas. Rate limit por IP continua sendo débito do item 6 da mesma regra (o limite por conta está no service).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly senha: SenhaService,
    private readonly activeUsers: ActiveUserRepository,
    private readonly permissions: PermissionsService,
  ) {}

  @Post('login')
  @Public()
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Sempre 202, exista o e-mail ou não — a resposta não revela quem é cliente. */
  @Post('esqueci-senha')
  @Public()
  @HttpCode(202)
  async esqueci(@Body() body: { email?: unknown }): Promise<void> {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 200) throw new BadRequestException('"email" é obrigatório');
    await this.senha.esqueci(email);
  }

  @Post('redefinir-senha/verificar')
  @Public()
  @HttpCode(200)
  verificarRedefinicao(@Body() body: { email?: unknown; codigo?: unknown }) {
    const { email, codigo } = parseCodigoEmail(body);
    return this.senha.verificar(email, codigo);
  }

  @Post('redefinir-senha')
  @Public()
  @HttpCode(200)
  redefinir(@Body() body: { email?: unknown; codigo?: unknown; password?: unknown }) {
    const { email, codigo } = parseCodigoEmail(body);
    return this.senha.redefinir(email, codigo, parseSenha(body?.password, 'password'));
  }

  /**
   * Módulos e páginas que o contrato do cliente libera — o front monta menu e rotas com isto. `modules: null` =
   * sem contrato, tudo liberado. A API aplica os módulos por conta própria (ModuloGuard); isto é só para a tela.
   */
  @Get('acessos')
  async acessos(@Req() req: { auth: RequestAuth }) {
    if (!req.auth.clientId) throw new ForbiddenException('Rota de usuário de cliente');
    const [contrato, permissoes] = await Promise.all([
      this.activeUsers.acessosDoCliente(req.auth.clientId),
      this.permissions.permissoesDoUsuario(req.auth.clientId, req.auth.userId),
    ]);
    // permissões do perfil de quem está logado: o front esconde tela e botão; a API continua decidindo (PermissionsGuard)
    return { ...contrato, permissoes };
  }

  /** Logado: troca exige a senha atual. */
  @Post('senha')
  @HttpCode(204)
  async trocar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: { senhaAtual?: unknown; novaSenha?: unknown }) {
    const atual = typeof body?.senhaAtual === 'string' ? body.senhaAtual : '';
    const nova = parseSenha(body?.novaSenha, 'novaSenha');
    if (atual === nova) throw new BadRequestException('A nova senha precisa ser diferente da atual');
    await this.senha.trocar(clientId, userId, atual, nova);
  }

  /**
   * Token novo com as mesmas claims, para o front renovar antes das 8 h expirarem sem pedir a senha de
   * novo — base da sessão persistente (docs/PLANO-APK-TWA.md § 2-3). Só chega aqui token válido de
   * usuário ainda ativo e com a senha não trocada depois da emissão (AuthGuard). `sessionStart` é
   * preservado (nunca reiniciado): é o que dá um teto de verdade à sessão (`SESSAO_MAX_DIAS`, jwt.ts),
   * mesmo que o front renove indefinidamente antes de cada expiração de 8h.
   */
  @Post('renovar')
  renovar(@Req() req: { auth: RequestAuth }) {
    const a = req.auth;
    const accessToken =
      a.role === 'superadmin'
        ? signAuthToken({ sub: a.userId, role: 'superadmin', sessionStart: a.sessionStart })
        : signAuthToken({ sub: a.userId, clientId: a.clientId, role: a.role, sessionStart: a.sessionStart });
    return { accessToken };
  }
}
