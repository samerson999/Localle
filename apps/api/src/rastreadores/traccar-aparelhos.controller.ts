import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { TraccarAparelhosService } from './traccar-aparelhos.service';

/** Lista de aparelhos do Traccar (fonte dos modelos): inventário técnico da Locale — rota exclusiva de superadmin. */
@Controller('superadmin/traccar-aparelhos')
@UseGuards(SuperadminGuard)
export class TraccarAparelhosController {
  constructor(private readonly service: TraccarAparelhosService) {}

  @Get()
  resumo() {
    return this.service.resumo();
  }

  /** Busca única do cadastro: modelos em uso + aparelhos da lista, com a situação do protocolo no Traccar. */
  @Get('busca')
  buscar(@Query('q') q?: string) {
    return this.service.buscar(typeof q === 'string' ? q : '');
  }

  @Post('atualizar')
  atualizar(@CurrentUserId() superadminId: string) {
    return this.service.atualizar(superadminId);
  }

  /** Modelo que o aparelho escolhido vira no cadastro, sem gravar (quem grava é o cadastro do rastreador). */
  @Get(':id/previa')
  previa(@Param('id', ParseIntPipe) id: number) {
    return this.service.previa(id);
  }
}
