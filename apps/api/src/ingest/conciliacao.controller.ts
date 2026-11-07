import { Body, Controller, Get, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { validarReexecucao } from './dto/conciliacao.dto';
import { ConciliacaoService } from './conciliacao.service';

/** Conciliação com o Traccar (conciliacao.service.ts): operação de plataforma — rota exclusiva de superadmin. */
@Controller('superadmin/conciliacao')
@UseGuards(SuperadminGuard)
export class ConciliacaoController {
  private readonly logger = new Logger(ConciliacaoController.name);

  constructor(private readonly service: ConciliacaoService) {}

  /** Últimas voltas (contagens), recuperadas pendentes/com falha no inbox e os checkpoints mais atrasados. */
  @Get()
  situacao() {
    return this.service.situacao();
  }

  /** Confere de novo um rastreador num período, sem mexer no checkpoint (posição muito atrasada, incidente conhecido). */
  @Post('reexecutar')
  @HttpCode(200)
  reexecutar(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    const pedido = validarReexecucao(body);
    this.logger.log(
      `Conciliação manual pedida por superadmin ${superadminId}: ${pedido.rastreadorId ? `rastreador_id=${pedido.rastreadorId}` : `traccar_device_id=${pedido.traccarDeviceId}`} ${pedido.de.toISOString()} → ${pedido.ate.toISOString()}`,
    );
    return this.service.reexecutar(pedido, pedido.de, pedido.ate);
  }
}
