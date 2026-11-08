import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { numeroOpcional, texto } from '../common/validar';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { OperacoesRepository } from './operacoes.repository';

const parseOperacao = (b: { nome?: unknown; metaKml?: unknown } | undefined) => ({
  nome: texto(b?.nome, 'nome', 80),
  metaKml: numeroOpcional(b?.metaKml, 'metaKml', 0.1, 100),
});
const NOME_REPETIDO = 'Já existe uma operação com esse nome';

/** Mesmo critério de grupos: ver faz parte de ver ativos; criar/alterar exige `ativos.editar`. */
@Controller('operacoes')
@UseGuards(PermissionsGuard)
export class OperacoesController {
  constructor(private readonly repo: OperacoesRepository) {}

  @Get()
  @RequirePermission('ativos.ver')
  listar(@ClientId() clientId: string) {
    return this.repo.listar(clientId);
  }

  @Post()
  @RequirePermission('ativos.editar')
  async criar(@ClientId() clientId: string, @Body() body: { nome?: unknown; metaKml?: unknown }) {
    try {
      return await this.repo.criar(clientId, parseOperacao(body));
    } catch (err) {
      if (violouUnique(err, UNIQUE.operacaoNome)) throw new ConflictException(NOME_REPETIDO);
      throw err;
    }
  }

  @Put(':id')
  @RequirePermission('ativos.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { nome?: unknown; metaKml?: unknown }) {
    let o;
    try {
      o = await this.repo.atualizar(clientId, id, parseOperacao(body));
    } catch (err) {
      if (violouUnique(err, UNIQUE.operacaoNome)) throw new ConflictException(NOME_REPETIDO);
      throw err;
    }
    if (!o) throw new NotFoundException('Operação não encontrada');
    return o;
  }

  /** Os ativos da operação ficam sem operação (`on delete set null`), não são apagados. */
  @Delete(':id')
  @RequirePermission('ativos.editar')
  @HttpCode(204)
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.delete(clientId, id))) throw new NotFoundException('Operação não encontrada');
  }
}
