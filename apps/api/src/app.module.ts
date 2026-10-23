import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { PollerModule } from './ingest/poller.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PermissionsModule } from './permissions/permissions.module';
import { QueueModule } from './queue/queue.module';
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
    QueueModule,
    PollerModule,
    RastreadoresModule,
    ReportsModule,
    MonitoringModule,
    SettingsModule,
    PermissionsModule,
    SuperadminModule,
    UsersModule,
  ],
  controllers: [HealthController],
  // AuthGuard global (achado #1 da auditoria de 23/10/2026) — fail-closed por padrão, ver auth/auth.guard.ts.
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
