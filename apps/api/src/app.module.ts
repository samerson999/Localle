import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthGuardsModule } from './auth/auth-guards.module';
import { AlertasModule } from './alertas/alertas.module';
import { CercasModule } from './cercas/cercas.module';
import { ChecklistModule } from './checklist/checklist.module';
import { RegrasModule } from './regras/regras.module';
import { JornadaModule } from './jornada/jornada.module';
import { LinksModule } from './links/links.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ComandosModule } from './comandos/comandos.module';
import { CombustivelModule } from './combustivel/combustivel.module';
import { ContratosModule } from './contratos/contratos.module';
import { ConvitesModule } from './convites/convites.module';
import { MultasModule } from './multas/multas.module';
import { PainelModule } from './painel/painel.module';
import { DbModule } from './db/db.module';
import { GruposModule } from './grupos/grupos.module';
import { HealthController } from './health/health.controller';
import { PollerModule } from './ingest/poller.module';
import { IngestWebhookModule } from './ingest/webhook.module';
import { ManutencaoModule } from './manutencao/manutencao.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MotoristasModule } from './motoristas/motoristas.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PneusModule } from './pneus/pneus.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RankingModule } from './ranking/ranking.module';
import { RastreadoresModule } from './rastreadores/rastreadores.module';
import { ReportsModule } from './reports/reports.module';
import { RetencaoModule } from './retencao/retencao.module';
import { SettingsModule } from './settings/settings.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { UsersModule } from './users/users.module';
import { ViagensModule } from './viagens/viagens.module';

@Module({
  imports: [
    DbModule,
    AuditModule,
    ClientsModule,
    AssetsModule,
    AuthModule,
    AuthGuardsModule,
    QueueModule,
    PollerModule,
    IngestWebhookModule,
    RastreadoresModule,
    ReportsModule,
    MonitoringModule,
    CercasModule,
    AlertasModule,
    RegrasModule,
    LinksModule,
    ComandosModule,
    RetencaoModule,
    GruposModule,
    MotoristasModule,
    JornadaModule,
    MultasModule,
    CombustivelModule,
    ManutencaoModule,
    ChecklistModule,
    PneusModule,
    RankingModule,
    ViagensModule,
    RealtimeModule,
    SettingsModule,
    PermissionsModule,
    SuperadminModule,
    ContratosModule,
    ConvitesModule,
    PainelModule,
    UsersModule,
  ],
  controllers: [HealthController],
  // AuthGuard global (achado #1 da auditoria de 23/10/2026) — fail-closed por padrão, ver auth/auth.guard.ts.
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
