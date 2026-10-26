import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { LinksService } from './links.service';

const HORA = 3600_000;
/** Mesmas opções da tela (SHARE_DURATIONS): 1 h, 4 h, 12 h, 24 h, 3 dias. */
const DURACOES = [1, 4, 12, 24, 72].map((h) => h * HORA);

@Controller('links-localizacao')
@UseGuards(PermissionsGuard)
@RequirePermission('localizacao.compartilhar')
export class LinksController {
  constructor(private readonly service: LinksService) {}

  @Post()
  criar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: { assetId?: unknown; duracaoMs?: unknown; destinatario?: unknown }) {
    const assetId = parseUuid('assetId', body?.assetId);
    if (!DURACOES.includes(body?.duracaoMs as number)) throw new BadRequestException('"duracaoMs" precisa ser 1 h, 4 h, 12 h, 24 h ou 3 dias');
    const destinatario = typeof body?.destinatario === 'string' && body.destinatario.trim() ? body.destinatario.trim().slice(0, 120) : null;
    return this.service.criar(clientId, userId, assetId, body.duracaoMs as number, destinatario);
  }

  @Get()
  listar(@ClientId() clientId: string, @Query('assetId') assetId?: string) {
    return this.service.listar(clientId, parseUuid('assetId', assetId));
  }

  @Post(':id/revogar')
  @HttpCode(204)
  revogar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revogar(clientId, id);
  }
}

/**
 * Rota pública (sem login), de propósito: é a página de quem recebeu o link. A credencial é o próprio
 * token (256 bits aleatórios, guardado só como hash); a resposta traz apenas placa e posição atual.
 */
@Controller('publico/localizacao')
@Public()
export class LinksPublicoController {
  constructor(private readonly service: LinksService) {}

  @Get(':token')
  abrir(@Param('token') token: string, @Query('abertura') abertura?: string) {
    if (typeof token !== 'string' || token.length > 100) throw new BadRequestException();
    return this.service.abrir(token, abertura === '1');
  }
}
