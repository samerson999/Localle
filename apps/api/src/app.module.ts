import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthGuardsModule } from './auth/auth-guards.module';
import { AlertasModule } from './alertas/alertas.module';
import { CercasModule } from './cercas/cercas.module';
import { RegrasModule } from './regras/regras.module';
import { LinksModule } from './links/links.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ContratosModule } from './contratos/contratos.module';
import { ConvitesModule } from './convites/convites.module';
import { PainelModule } from './painel/painel.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { PollerModule } from './ingest/poller.module';
import { IngestWebhookModule } from './ingest/webhook.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PermissionsModule } from './permissions/permissions.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RastreadoresModule } from './rastreadores/rastreadores.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { UsersModule } from './users/users.module';

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
