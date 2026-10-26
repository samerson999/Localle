import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import { signAuthToken } from './jwt';
import { Public } from './public.decorator';
import { SenhaService } from './senha.service';

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url

function parseToken(v: unknown): string {
  if (typeof v !== 'string' || !TOKEN.test(v)) throw new BadRequestException('Link de redefinição inválido ou expirado');
  return v;
}

function parseSenha(v: unknown, campo: string): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new BadRequestException(`"${campo}" precisa ter de 8 a 200 caracteres`);
  return v;
}

/**
 * Rotas públicas de propósito (`.claude/rules/security.md` item 2): login, "esqueci minha senha" e a
 * redefinição pelo link — quem chega aqui não tem token; a credencial do reset é o token de uso único do
 * e-mail. Rate limit por IP continua sendo débito do item 6 da mesma regra (o limite por conta está no service).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly senha: SenhaService,
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

  @Get('redefinir-senha/:token')
  @Public()
  consultarRedefinicao(@Param('token') token: string) {
    return this.senha.consultar(parseToken(token));
  }

  @Post('redefinir-senha/:token')
  @Public()
  redefinir(@Param('token') token: string, @Body() body: { password?: unknown }) {
    return this.senha.redefinir(parseToken(token), parseSenha(body?.password, 'password'));
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
   * novo. Só chega aqui token válido de usuário ainda ativo (AuthGuard) — é isso que impede um usuário
   * desativado de se manter conectado renovando.
   */
  @Post('renovar')
  renovar(@Req() req: { auth: { userId: string; clientId: string | null; role: 'admin' | 'gestor' | 'operador' | 'superadmin' } }) {
    const a = req.auth;
    const accessToken =
      a.role === 'superadmin' ? signAuthToken({ sub: a.userId, role: 'superadmin' }) : signAuthToken({ sub: a.userId, clientId: a.clientId!, role: a.role });
    return { accessToken };
  }
}
