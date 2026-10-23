import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
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
    return this.repo.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const client = await this.repo.findById(id);
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.repo.create({ name: dto.name, revendaId: dto.revendaId });
  }
}
