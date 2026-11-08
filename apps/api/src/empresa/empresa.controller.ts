import { Body, Controller, Get, NotFoundException, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { cnpjOpcional, textoOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { EmpresaRepository } from './empresa.repository';

/**
 * Empregador do espelho de ponto (razão social, CNPJ, endereço). Ler faz parte da jornada; alterar é
 * configuração da conta (`setup.configurar`) — identificação da empresa, nada financeiro/contratual.
 */
@Controller('empresa')
@UseGuards(PermissionsGuard)
export class EmpresaController {
  constructor(private readonly repo: EmpresaRepository) {}

  @Get()
  @RequirePermission('ativos.ver')
  async buscar(@ClientId() clientId: string) {
    const e = await this.repo.buscar(clientId);
    if (!e) throw new NotFoundException('Cliente não encontrado');
    return e;
  }

  @Put()
  @RequirePermission('setup.configurar')
  async salvar(@ClientId() clientId: string, @Body() body: { razaoSocial?: unknown; cnpj?: unknown; endereco?: unknown }) {
    const e = await this.repo.salvar(clientId, {
      razaoSocial: textoOpcional(body?.razaoSocial, 'razaoSocial', 160),
      cnpj: cnpjOpcional(body?.cnpj, 'cnpj'),
      endereco: textoOpcional(body?.endereco, 'endereco', 240),
    });
    if (!e) throw new NotFoundException('Cliente não encontrado');
    return e;
  }
}
