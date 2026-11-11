import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { parseNomeMarca, parseNomeModelo, parseNovoModelo, parseTipo } from './catalogo-ativos.dto';
import { CatalogoAtivosRepository, type Repetido } from './catalogo-ativos.repository';

/** 409 com o item que já existe: a tela oferece usar esse em vez de criar outro com outra grafia. */
function semRepetido<T extends object>(r: T | Repetido, oque: string): T {
  if ('repetido' in r) throw new ConflictException({ message: `Já existe ${oque} com esse nome: ${r.repetido.nome}`, repetido: r.repetido });
  return r;
}

/**
 * Listas do cadastro de ativos (marca → modelo, tipos do cliente). Mesmo critério de operações e grupos: ver faz
 * parte de ver ativos; criar e renomear exige `ativos.editar` (decisão de 10/11/2026: quem edita ativos cria).
 * Sem remoção por enquanto: renomear cobre a correção de grafia, e apagar exigiria decidir o que fica nos ativos.
 */
@Controller('catalogo-ativos')
@UseGuards(PermissionsGuard)
export class CatalogoAtivosController {
  constructor(private readonly repo: CatalogoAtivosRepository) {}

  @Get()
  @RequirePermission('ativos.ver')
  listar(@ClientId() clientId: string) {
    return this.repo.listar(clientId);
  }

  @Post('marcas')
  @RequirePermission('ativos.editar')
  async criarMarca(@ClientId() clientId: string, @Body() body: { nome?: unknown }) {
    return semRepetido(await this.repo.criarMarca(clientId, parseNomeMarca(body)), 'uma marca');
  }

  @Put('marcas/:id')
  @RequirePermission('ativos.editar')
  async renomearMarca(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { nome?: unknown }) {
    const r = await this.repo.renomearMarca(clientId, id, parseNomeMarca(body));
    if (!r) throw new NotFoundException('Marca não encontrada');
    return semRepetido(r, 'uma marca');
  }

  @Post('modelos')
  @RequirePermission('ativos.editar')
  async criarModelo(@ClientId() clientId: string, @Body() body: { marcaId?: unknown; nome?: unknown }) {
    const { marcaId, nome } = parseNovoModelo(body);
    const r = await this.repo.criarModelo(clientId, marcaId, nome);
    if (r === 'marca_invalida') throw new BadRequestException('Marca não encontrada');
    return semRepetido(r, 'um modelo dessa marca');
  }

  @Put('modelos/:id')
  @RequirePermission('ativos.editar')
  async renomearModelo(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { nome?: unknown }) {
    const r = await this.repo.renomearModelo(clientId, id, parseNomeModelo(body));
    if (!r) throw new NotFoundException('Modelo não encontrado');
    return semRepetido(r, 'um modelo dessa marca');
  }

  @Post('tipos')
  @RequirePermission('ativos.editar')
  async criarTipo(@ClientId() clientId: string, @Body() body: Record<string, unknown>) {
    const r = await this.repo.criarTipo(clientId, parseTipo(body));
    if (r === 'padrao_repetido') throw new ConflictException('Esse tipo pronto já foi renomeado; edite o nome que já existe');
    return semRepetido(r, 'um tipo');
  }

  @Put('tipos/:id')
  @RequirePermission('ativos.editar')
  async atualizarTipo(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    const r = await this.repo.atualizarTipo(clientId, id, parseTipo(body));
    if (!r) throw new NotFoundException('Tipo não encontrado');
    if (r === 'padrao_repetido') throw new ConflictException('Esse tipo pronto já foi renomeado');
    return semRepetido(r, 'um tipo');
  }
}
