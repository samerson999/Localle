import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { AssetsRepository } from '../../assets/assets.repository';
import { EmpresaRepository } from '../../empresa/empresa.repository';
import { GruposRepository } from '../../grupos/grupos.repository';
import { OperacoesRepository } from '../../operacoes/operacoes.repository';
import { RastreadorVinculosRepository } from '../../rastreadores/rastreador-vinculos.repository';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { paginaUnica } from '../comum/periodo';
import {
  EmpresaDto,
  GrupoDto,
  PaginaGrupos,
  PaginaOperacoes,
  PaginaRastreadores,
  paraGrupoDto,
  paraOperacaoDto,
  paraRastreadorDto,
} from './dto/frota.dto';

const naoEncontrado = (codigo: string, message: string) => new NotFoundException({ statusCode: 404, codigo, message });

/** Cadastros da frota (escopo `frota`). Mesmos dois caminhos de toda rota: o da chave e o `clientes/:clientId/...`. */
@Controller('v1')
export class FrotaController {
  constructor(
    private readonly empresa: EmpresaRepository,
    private readonly grupos: GruposRepository,
    private readonly operacoes: OperacoesRepository,
    private readonly rastreadores: RastreadorVinculosRepository,
    private readonly assets: AssetsRepository,
  ) {}

  /** Razão social, CNPJ e endereço do cliente. */
  @Get(['empresa', 'clientes/:clientId/empresa'])
  @ApiPublica('frota')
  async buscarEmpresa(@ClienteDaChave() clientId: string): Promise<EmpresaDto> {
    const e = await this.empresa.buscar(clientId);
    if (!e) throw naoEncontrado('cliente_nao_encontrado', 'Cliente não encontrado');
    return e;
  }

  /** Grupos de veículos, com os veículos de cada um. */
  @Get(['grupos', 'clientes/:clientId/grupos'])
  @ApiPublica('frota')
  async listarGrupos(@ClienteDaChave() clientId: string): Promise<PaginaGrupos> {
    return paginaUnica((await this.grupos.listar(clientId)).map(paraGrupoDto));
  }

  @Get(['grupos/:id', 'clientes/:clientId/grupos/:id'])
  @ApiPublica('frota')
  async buscarGrupo(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<GrupoDto> {
    const g = await this.grupos.buscar(clientId, id);
    if (!g) throw naoEncontrado('grupo_nao_encontrado', 'Grupo não encontrado');
    return paraGrupoDto(g);
  }

  /** Operações (centros de custo). */
  @Get(['operacoes', 'clientes/:clientId/operacoes'])
  @ApiPublica('frota')
  async listarOperacoes(@ClienteDaChave() clientId: string): Promise<PaginaOperacoes> {
    return paginaUnica((await this.operacoes.listar(clientId)).map(paraOperacaoDto));
  }

  /** Rastreadores e tags do cliente, instalados ou em estoque. */
  @Get(['rastreadores', 'clientes/:clientId/rastreadores'])
  @ApiPublica('frota')
  async listarRastreadores(@ClienteDaChave() clientId: string): Promise<PaginaRastreadores> {
    return paginaUnica((await this.rastreadores.doCliente(clientId)).map(paraRastreadorDto));
  }

  /** Rastreadores instalados agora no veículo (principal, backup, CAN). */
  @Get(['veiculos/:id/rastreadores', 'clientes/:clientId/veiculos/:id/rastreadores'])
  @ApiPublica('frota')
  async rastreadoresDoVeiculo(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<PaginaRastreadores> {
    if (!(await this.assets.findOne(clientId, { id }))) throw naoEncontrado('veiculo_nao_encontrado', 'Veículo não encontrado');
    const lista = await this.rastreadores.doCliente(clientId);
    return paginaUnica(lista.filter((r) => r.asset_id === id).map(paraRastreadorDto));
  }
}
