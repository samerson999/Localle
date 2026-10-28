import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseAtualizarModelo, parseCriarModelo } from './dto/parse-rastreador-modelo';
import { RastreadorModelosService } from './rastreador-modelos.service';

/** Catálogo de modelos de rastreador: inventário técnico da Locale — rota exclusiva de superadmin. */
@Controller('superadmin/rastreador-modelos')
@UseGuards(SuperadminGuard)
export class RastreadorModelosController {
  constructor(private readonly service: RastreadorModelosService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    return this.service.criar(superadminId, parseCriarModelo(body));
  }

  @Patch(':id')
  atualizar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.service.atualizar(superadminId, id, parseAtualizarModelo(body));
  }
}
