import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { erro, instante, numero, opcao, textoOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { FORMATOS_RELATORIO, RelatoriosGeradosRepository, TIPOS_RELATORIO } from './relatorios-gerados.repository';

const LIMITE_HISTORICO = 50;

/** Histórico de relatórios exportados (tela Relatórios): visível para toda a empresa. */
@Controller('reports/historico')
@UseGuards(PermissionsGuard)
@RequirePermission('relatorios.ver')
export class RelatoriosGeradosController {
  private readonly logger = new Logger(RelatoriosGeradosController.name);

  constructor(private readonly repo: RelatoriosGeradosRepository) {}

  @Get()
  async listar(@ClientId() clientId: string) {
    const rows = await this.repo.recentes(clientId, LIMITE_HISTORICO);
    return rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      inicio: r.periodo_inicio,
      fim: r.periodo_fim,
      filtros: r.filtros,
      registros: r.registros,
      formato: r.formato,
      geradoEm: r.created_at,
      geradoPor: r.gerado_por,
    }));
  }

  /** O arquivo é gerado no navegador; aqui só fica o registro de que foi gerado. */
  @Post()
  async registrar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: Record<string, unknown>) {
    const b = body ?? {};
    const inicio = instante(b.inicio, 'inicio');
    const fim = instante(b.fim, 'fim');
    if (fim < inicio) erro('"fim" precisa ser depois de "inicio"');
    const r = await this.repo.registrar(clientId, userId, {
      tipo: opcao(b.tipo, 'tipo', TIPOS_RELATORIO),
      inicio,
      fim,
      filtros: textoOpcional(b.filtros, 'filtros', 500) ?? '',
      registros: numero(b.registros, 'registros', 0, 10_000_000, true),
      formato: opcao(b.formato, 'formato', FORMATOS_RELATORIO),
    });
    this.logger.log(`relatório ${r.tipo}/${r.formato} registrado (${r.registros} linhas) client=${clientId} id=${r.id}`);
    return { id: r.id };
  }
}
