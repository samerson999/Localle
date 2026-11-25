import { Body, Controller, Post } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { EmailContaService } from './email-conta.service';

/** E-mail da própria conta, no primeiro acesso de quem nasceu por nome de usuário. Qualquer usuário logado, sobre si mesmo. */
@Controller('conta/email')
export class EmailContaController {
  constructor(private readonly service: EmailContaService) {}

  /** Corpo: `{ email }`. O código vai só por e-mail — nunca na resposta. */
  @Post()
  async pedir(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: { email?: unknown }) {
    const { enviado } = await this.service.pedir(clientId, userId, body?.email);
    return { enviado };
  }

  /** Corpo: `{ codigo }`. */
  @Post('confirmar')
  confirmar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: { codigo?: unknown }) {
    return this.service.confirmar(clientId, userId, body?.codigo);
  }
}
