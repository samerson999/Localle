import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { parseCodigoEmail, parseSenha } from '../auth/dto/parse-codigo';
import { Public } from '../auth/public.decorator';
import { ConvitesService } from './convites.service';

/**
 * Rotas públicas de propósito (justificativa exigida por `.claude/rules/security.md` item 2): quem chega com o
 * código ainda não tem senha nem token — a credencial é o próprio código de uso único do e-mail, com teto de
 * tentativas (src/auth/codigo.ts).
 */
@Controller('auth/convites')
export class ConvitesController {
  constructor(private readonly convites: ConvitesService) {}

  @Post('verificar')
  @Public()
  @HttpCode(200)
  verificar(@Body() body: { email?: unknown; codigo?: unknown }) {
    const { email, codigo } = parseCodigoEmail(body);
    return this.convites.verificar(email, codigo);
  }

  @Post('aceitar')
  @Public()
  @HttpCode(200)
  aceitar(@Body() body: { email?: unknown; codigo?: unknown; password?: unknown }) {
    const { email, codigo } = parseCodigoEmail(body);
    return this.convites.aceitar(email, codigo, parseSenha(body?.password, 'password'));
  }
}
