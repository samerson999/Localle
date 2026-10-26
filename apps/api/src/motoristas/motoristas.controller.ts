import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { booleano, dataOpcional, dicionario, opcao, texto, textoOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SettingsService } from '../settings/settings.service';
import { type MotoristaInput, type MotoristaRow, MotoristasRepository, type Regime } from './motoristas.repository';

const CATEGORIAS = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
const REGIMES: Regime[] = ['cargas', 'passageiros'];
export type EstadoVencimento = 'vencido' | 'critico' | 'atencao' | 'ok' | 'sem_data';

export function parseMotorista(body: unknown): MotoristaInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const cnh = textoOpcional(b.cnh, 'cnh', 20);
  if (cnh && !/^\d{9,11}$/.test(cnh)) throw new BadRequestException('"cnh" precisa ter de 9 a 11 dígitos');
  return {
    nome: texto(b.nome, 'nome', 120),
    cnh,
    cnhCategoria: b.cnhCategoria === undefined || b.cnhCategoria === null || b.cnhCategoria === '' ? null : opcao(b.cnhCategoria, 'cnhCategoria', CATEGORIAS),
    cnhValidade: dataOpcional(b.cnhValidade, 'cnhValidade'),
    toxicologicoValidade: dataOpcional(b.toxicologicoValidade, 'toxicologicoValidade'),
    telefone: textoOpcional(b.telefone, 'telefone', 30),
    regime: opcao(b.regime, 'regime', REGIMES, 'cargas'),
    ear: booleano(b.ear, 'ear'),
    dados: dicionario(b.dados, 'dados'),
  };
}

/** Estado de um vencimento (CNH, toxicológico) pelos dias de atenção/crítico do Setup (§ 3.15). */
export function estadoVencimento(validade: string | null, atencaoDias: number, criticoDias: number, hoje = new Date()): EstadoVencimento {
  if (!validade) return 'sem_data';
  const dias = Math.floor((Date.parse(validade + 'T12:00:00Z') - hoje.getTime()) / 86_400_000);
  if (dias < 0) return 'vencido';
  if (dias <= criticoDias) return 'critico';
  if (dias <= atencaoDias) return 'atencao';
  return 'ok';
}

/** Ler motoristas é parte de ver ativos; alterar exige `motoristas.editar`. */
@Controller('motoristas')
@UseGuards(PermissionsGuard)
export class MotoristasController {
  constructor(
    private readonly repo: MotoristasRepository,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @RequirePermission('ativos.ver')
  listar(@ClientId() clientId: string, @Query('incluirInativos') incluirInativos?: string) {
    return this.repo.listar(clientId, incluirInativos === 'true');
  }

  /** CNH e toxicológico vencidos/vencendo (entrada do "Precisa de você"). Toxicológico só vale para C, D e E. */
  @Get('vencimentos')
  @RequirePermission('ativos.ver')
  async vencimentos(@ClientId() clientId: string) {
    const [atencao, critico, motoristas] = await Promise.all([
      this.settings.resolve(clientId, 'motoristas.cnh_atencao_dias'),
      this.settings.resolve(clientId, 'motoristas.cnh_critico_dias'),
      this.repo.listar(clientId, false),
    ]);
    const exigeTox = (m: MotoristaRow) => !!m.cnh_categoria && /[CDE]/.test(m.cnh_categoria);
    return motoristas
      .map((m) => ({
        id: m.id,
        nome: m.nome,
        cnh: { validade: m.cnh_validade, estado: estadoVencimento(m.cnh_validade, atencao, critico) },
        toxicologico: exigeTox(m) ? { validade: m.toxicologico_validade, estado: estadoVencimento(m.toxicologico_validade, atencao, critico) } : null,
      }))
      .filter((x) => x.cnh.estado !== 'ok' || (x.toxicologico && x.toxicologico.estado !== 'ok'));
  }

  @Get(':id')
  @RequirePermission('ativos.ver')
  async buscar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.repo.buscar(clientId, id);
    if (!m) throw new NotFoundException('Motorista não encontrado');
    return m;
  }

  @Post()
  @RequirePermission('motoristas.editar')
  async criar(@ClientId() clientId: string, @Body() body: unknown) {
    try {
      return await this.repo.criar(clientId, parseMotorista(body));
    } catch (err) {
      if (violouUnique(err, UNIQUE.motoristaCnh)) throw new ConflictException('Já existe um motorista ativo com essa CNH');
      throw err;
    }
  }

  @Patch(':id')
  @RequirePermission('motoristas.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    let m: MotoristaRow | null;
    try {
      m = await this.repo.atualizar(clientId, id, parseMotorista(body));
    } catch (err) {
      if (violouUnique(err, UNIQUE.motoristaCnh)) throw new ConflictException('Já existe um motorista ativo com essa CNH');
      throw err;
    }
    if (!m) throw new NotFoundException('Motorista não encontrado');
    return m;
  }

  @Post(':id/desativar')
  @RequirePermission('motoristas.editar')
  async desativar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.repo.setDesativado(clientId, id, true);
    if (!m) throw new NotFoundException('Motorista não encontrado');
    return m;
  }

  @Post(':id/reativar')
  @RequirePermission('motoristas.editar')
  async reativar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.repo.setDesativado(clientId, id, false);
    if (!m) throw new NotFoundException('Motorista não encontrado');
    return m;
  }
}
