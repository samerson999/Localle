import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ConvitesService } from './convites.service';

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url

function parseToken(v: unknown): string {
  if (typeof v !== 'string' || !TOKEN.test(v)) throw new BadRequestException('Convite inválido ou expirado');
  return v;
}

/**
 * Rotas públicas de propósito (justificativa exigida por `.claude/rules/security.md` item 2): quem abre o
 * convite ainda não tem senha nem token — a credencial é o próprio token de uso único do e-mail.
 */
@Controller('auth/convites')
export class ConvitesController {
  constructor(private readonly convites: ConvitesService) {}

  @Get(':token')
  @Public()
  consultar(@Param('token') token: string) {
    return this.convites.consultar(parseToken(token));
  }

  @Post(':token/aceitar')
  @Public()
  aceitar(@Param('token') token: string, @Body() body: { password?: unknown }) {
    const password = body?.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      throw new BadRequestException('"password" precisa ter de 8 a 200 caracteres');
    }
    return this.convites.aceitar(parseToken(token), password);
  }
}
