import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { erro, numero, texto, textoOpcional } from '../common/validar';
import { type Despesa, type DespesaDados, DespesasRepository } from './despesas.repository';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function mes(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !MES.test(v)) erro(`"${campo}" precisa ser um mês no formato AAAA-MM`);
  return v;
}

/** Sem class-validator no projeto: validação explícita. Criar e alterar recebem o cadastro inteiro. */
export function parseDespesa(body: unknown): DespesaDados {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.tipo !== 'fixa' && b.tipo !== 'por_veiculo') erro('"tipo" precisa ser fixa ou por_veiculo');
  const inicioEm = mes(b.inicioEm, 'inicioEm');
  const fimEm = b.fimEm === undefined || b.fimEm === null || b.fimEm === '' ? null : mes(b.fimEm, 'fimEm');
  if (fimEm && fimEm < inicioEm) erro('"fimEm" não pode ser antes de "inicioEm"');
  return {
    nome: texto(b.nome, 'nome', 120),
    tipo: b.tipo,
    valor: Math.round(numero(b.valor, 'valor', 0, 10_000_000) * 100) / 100,
    inicioEm,
    fimEm,
    observacao: textoOpcional(b.observacao, 'observacao', 500),
  };
}

/** Toda alteração vai para a auditoria: muda a margem que o Console mostra. */
@Injectable()
export class DespesasService {
  private readonly logger = new Logger(DespesasService.name);

  constructor(
    private readonly repo: DespesasRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  listar() {
    return this.repo.listar();
  }

  async criar(superadminId: string, d: DespesaDados): Promise<Despesa> {
    const nova = await this.repo.criar(d);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'despesa.criar', target: nova.id, after: d });
    this.logger.log(`Despesa ${nova.id} (${d.tipo}, R$ ${d.valor}) criada por ${superadminId}`);
    return nova;
  }

  async atualizar(superadminId: string, id: string, d: DespesaDados): Promise<Despesa> {
    const antes = await this.repo.buscar(id);
    if (!antes) throw new NotFoundException('Despesa não encontrada');
    const depois = await this.repo.atualizar(id, d);
    if (!depois) throw new NotFoundException('Despesa não encontrada');
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'despesa.atualizar', target: id, before: antes, after: d });
    this.logger.log(`Despesa ${id} alterada por ${superadminId}`);
    return depois;
  }

  async excluir(superadminId: string, id: string): Promise<void> {
    const antes = await this.repo.buscar(id);
    if (!antes || !(await this.repo.excluir(id))) throw new NotFoundException('Despesa não encontrada');
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'despesa.excluir', target: id, before: antes });
    this.logger.log(`Despesa ${id} excluída por ${superadminId}`);
  }
}

@Controller('superadmin/despesas')
@UseGuards(SuperadminGuard)
export class DespesasController {
  constructor(private readonly despesas: DespesasService) {}

  @Get()
  listar() {
    return this.despesas.listar();
  }

  @Post()
  criar(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    return this.despesas.criar(superadminId, parseDespesa(body));
  }

  @Put(':id')
  atualizar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.despesas.atualizar(superadminId, id, parseDespesa(body));
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.despesas.excluir(superadminId, id);
  }
}
