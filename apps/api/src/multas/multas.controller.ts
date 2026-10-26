import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { dataOpcional, dicionario, erro, instante, numero, opcao, periodo, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { GRAVIDADES, type MultaInput, type MultaRow, MultasRepository, STATUS_MULTA } from './multas.repository';
import { MultasService } from './multas.service';

const DIA = 86_400_000;

export function parseMulta(body: unknown, agora = new Date()): MultaInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const auto = texto(b.auto, 'auto', 15, 6).toUpperCase();
  if (!/^[A-Z0-9]{6,15}$/.test(auto)) erro('"auto": só letras e números, de 6 a 15 caracteres');
  const ts = instante(b.ts, 'ts');
  if (ts.getTime() > agora.getTime()) erro('"ts": a infração não pode estar no futuro');
  if (agora.getTime() - ts.getTime() > 5 * 365 * DIA) erro('"ts": data com mais de 5 anos');
  const notificadoEm = dataOpcional(b.notificadoEm, 'notificadoEm');
  if (notificadoEm && Date.parse(notificadoEm + 'T12:00:00Z') < ts.getTime() - 12 * 3600_000) erro('"notificadoEm" não pode ser anterior à infração');
  const vencimento = dataOpcional(b.vencimento, 'vencimento');
  if (!vencimento) erro('"vencimento" é obrigatório');
  if (notificadoEm && vencimento < notificadoEm) erro('"vencimento" não pode ser anterior à notificação');
  return {
    auto,
    orgao: textoOpcional(b.orgao, 'orgao', 60) ?? '',
    assetId: uuid(b.assetId, 'assetId'),
    motoristaId: uuidOpcional(b.motoristaId, 'motoristaId'),
    ts,
    local: texto(b.local, 'local', 200),
    codigo: texto(b.codigo, 'codigo', 20),
    descricao: texto(b.descricao, 'descricao', 300),
    gravidade: opcao(b.gravidade, 'gravidade', GRAVIDADES),
    pontos: numero(b.pontos, 'pontos', 0, 7, true),
    valor: numero(b.valor, 'valor', 0, 1_000_000),
    notificadoEm,
    vencimento,
    status: opcao(b.status, 'status', STATUS_MULTA, 'aberta'),
    dados: dicionario(b.dados, 'dados'),
  };
}

function tratar(r: MultaRow | null | 'ativo_invalido' | 'motorista_invalido'): MultaRow {
  if (r === 'ativo_invalido') throw new BadRequestException('Ativo não encontrado');
  if (r === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado');
  if (!r) throw new NotFoundException('Multa não encontrada');
  return r;
}

@Controller('multas')
@UseGuards(PermissionsGuard)
export class MultasController {
  constructor(
    private readonly repo: MultasRepository,
    private readonly service: MultasService,
  ) {}

  @Get()
  listar(@ClientId() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string, @Query('motoristaId') motoristaId?: string) {
    const [inicio, fim] = periodo(de, ate, 365, 5 * 366);
    return this.repo.listar(clientId, inicio, fim, uuidOpcional(motoristaId, 'motoristaId'));
  }

  /** Indicações de condutor em aberto com o estado do prazo (entrada do "Precisa de você"). */
  @Get('indicacoes')
  indicacoes(@ClientId() clientId: string) {
    return this.service.indicacoesPendentes(clientId);
  }

  /** Pontos nos últimos 12 meses × limite legal/do Setup por motorista. */
  @Get('cnh-risco')
  cnhRisco(@ClientId() clientId: string) {
    return this.service.riscoCnh(clientId);
  }

  @Get(':id')
  async buscar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return tratar(await this.repo.buscar(clientId, id));
  }

  @Post()
  @RequirePermission('multas.editar')
  async criar(@ClientId() clientId: string, @Body() body: unknown) {
    try {
      return tratar(await this.repo.criar(clientId, parseMulta(body)));
    } catch (err) {
      if (violouUnique(err, UNIQUE.multaAutoOrgao)) throw new ConflictException('Já existe uma multa com este auto e este órgão');
      throw err;
    }
  }

  @Put(':id')
  @RequirePermission('multas.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    try {
      return tratar(await this.repo.atualizar(clientId, id, parseMulta(body)));
    } catch (err) {
      if (violouUnique(err, UNIQUE.multaAutoOrgao)) throw new ConflictException('Já existe uma multa com este auto e este órgão');
      throw err;
    }
  }

  @Post(':id/indicar')
  @RequirePermission('multas.editar')
  async indicar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { motoristaId?: unknown }) {
    return tratar(await this.repo.indicar(clientId, id, uuid(body?.motoristaId, 'motoristaId')));
  }
}
