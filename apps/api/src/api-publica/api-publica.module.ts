import { Module } from '@nestjs/common';
import { AlertasRepository } from '../alertas/alertas.repository';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { CercasRepository } from '../cercas/cercas.repository';
import { ComandosRepository } from '../comandos/comandos.repository';
import { EmpresaRepository } from '../empresa/empresa.repository';
import { GruposRepository } from '../grupos/grupos.repository';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { MotoristaVinculosRepository } from '../motoristas/motorista-vinculos.repository';
import { MotoristasRepository } from '../motoristas/motoristas.repository';
import { OperacoesRepository } from '../operacoes/operacoes.repository';
import { RastreadorVinculosRepository } from '../rastreadores/rastreador-vinculos.repository';
import { RegrasRepository } from '../regras/regras.repository';
import { SettingsModule } from '../settings/settings.module';
import { JornadaRepository } from '../jornada/jornada.repository';
import { JornadaService } from '../jornada/jornada.service';
import { RankingRepository } from '../ranking/ranking.repository';
import { RankingService } from '../ranking/ranking.service';
import { FrotaReportsRepository } from '../reports/frota-reports.repository';
import { FrotaReportsService } from '../reports/frota-reports.service';
import { ReportsRepository } from '../reports/reports.repository';
import { ViagensRepository } from '../viagens/viagens.repository';
import { ChecklistRepository } from '../checklist/checklist.repository';
import { AbastecimentosRepository } from '../combustivel/abastecimentos.repository';
import { CombustivelService } from '../combustivel/combustivel.service';
import { ManutencaoRepository } from '../manutencao/manutencao.repository';
import { ManutencaoService } from '../manutencao/manutencao.service';
import { MultasRepository } from '../multas/multas.repository';
import { MultasService } from '../multas/multas.service';
import { PneusRepository } from '../pneus/pneus.repository';
import { PneusService } from '../pneus/pneus.service';
import { CustosController } from './custos/custos.controller';
import { OperacaoController } from './operacao/operacao.controller';
import { RelatoriosController } from './relatorios/relatorios.controller';
import { CercasPublicoController } from './cercas/cercas.controller';
import { FrotaController } from './frota/frota.controller';
import { MotoristasPublicoController } from './motoristas/motoristas.controller';
import { OcorrenciasController } from './ocorrencias/ocorrencias.controller';
import { TelemetriaController } from './telemetria/telemetria.controller';
import { ApiChaveGuard } from './auth/api-chave.guard';
import { CacheDeChaves } from './auth/cache-de-chaves';
import { LimitadorDeTaxa } from './auth/limitador';
import { ApiChavesController } from './chaves/api-chaves.controller';
import { ApiChavesRepository } from './chaves/api-chaves.repository';
import { ApiChavesService } from './chaves/api-chaves.service';
import { ApiChavesMestrasController } from './chaves-mestras/api-chaves-mestras.controller';
import { ApiChavesMestrasRepository } from './chaves-mestras/api-chaves-mestras.repository';
import { ApiChavesMestrasService } from './chaves-mestras/api-chaves-mestras.service';
import { ClientesController } from './clientes.controller';
import { VeiculosController } from './veiculos/veiculos.controller';

/** Controllers da API pública `/v1` — as que entram no Swagger (docs/PLANO-API-PUBLICA.md § 6). */
export const CONTROLLERS_V1 = [VeiculosController, FrotaController, MotoristasPublicoController, CercasPublicoController, TelemetriaController, OcorrenciasController, RelatoriosController, OperacaoController, CustosController];

/**
 * Repositories e services de domínio que as rotas `/v1` leem. Só dependem do pool (global) e do Setup, então entram
 * direto aqui, sem os módulos de domínio precisarem exportá-los — cada um continua filtrando por `client_id`.
 */
const LEITURA = [
  EmpresaRepository, GruposRepository, OperacoesRepository, RastreadorVinculosRepository, MotoristasRepository, MotoristaVinculosRepository,
  CercasRepository, RegrasRepository, MonitoringRepository, AlertasRepository, ComandosRepository,
  ReportsRepository, FrotaReportsRepository, FrotaReportsService, ViagensRepository, JornadaRepository, JornadaService, RankingRepository, RankingService,
  AbastecimentosRepository, CombustivelService, MultasRepository, MultasService, ManutencaoRepository, ManutencaoService, ChecklistRepository,
  PneusRepository, PneusService,
];

/**
 * API pública de consulta (docs/PLANO-API-PUBLICA.md). As rotas `/v1` chamam os repositories dos módulos de domínio;
 * a gestão das chaves (`/superadmin/api-chaves`, `/superadmin/api-chaves-mestras`) é rota interna, só do superadmin.
 */
@Module({
  imports: [AuthGuardsModule, AuditModule, MailModule, QueueModule, AssetsModule, SettingsModule],
  controllers: [...CONTROLLERS_V1, ClientesController, ApiChavesController, ApiChavesMestrasController],
  providers: [ApiChaveGuard, CacheDeChaves, LimitadorDeTaxa, ApiChavesRepository, ApiChavesService, ApiChavesMestrasRepository, ApiChavesMestrasService, ...LEITURA],
})
export class ApiPublicaModule {}
