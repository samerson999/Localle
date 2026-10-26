import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { ClientsRepository } from './clients.repository';
import type { CreateClientDto } from './dto/create-client.dto';

/**
 * Exclusivo do superadmin (Locale): cadastro de cliente é ação administrativa da plataforma, não do
 * próprio cliente. Fecha a lacuna que ficou pendente em 23/10/2026 (esta rota existia sem guard algum).
 */
@Controller('clients')
@UseGuards(SuperadminGuard)
export class ClientsController {
  constructor(private readonly repo: ClientsRepository) {}

  @Get()
  findAll() {
    return this.repo.findAllResumo();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const client = await this.repo.findById(id);
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.repo.create({ name: dto.name, revendaId: dto.revendaId });
  }

  @Patch(':id')
  async rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: { name?: unknown }) {
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    if (name.length === 0 || name.length > 200) throw new BadRequestException('"name" precisa ter de 1 a 200 caracteres');
    const client = await this.repo.rename(id, name);
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }
}
