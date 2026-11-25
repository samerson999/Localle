import { ApiExcludeController } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { ApiChavesMestrasRepository } from './chaves-mestras/api-chaves-mestras.repository';
import { ApiPublicaMestra } from './auth/api-publica.decorator';

/** Só chave mestra: os clientes que ela pode consultar pelo caminho `clientes/:clientId/...`. Fora do Swagger. */
// rota interna ou só da chave mestra: fora do Swagger da API pública (decisão 23/11)
@ApiExcludeController()
@Controller('v1')
export class ClientesController {
  constructor(private readonly mestras: ApiChavesMestrasRepository) {}

  @Get('clientes')
  @ApiPublicaMestra()
  async listar() {
    return { dados: await this.mestras.listarClientes(), proximoCursor: null };
  }
}
