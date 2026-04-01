import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'

import { RolesGuard } from '@app/common/guards/roles.guard'
import { SupabaseAuthGuard } from '@app/common/guards/supabase-auth.guard'
import { SentryInterceptor } from '@app/common/interceptors/sentry.interceptor'
import { AuditModule } from '@app/modules/audit/audit.module'
import { AuthModule } from '@app/modules/auth/auth.module'
import { DashboardsModule } from '@app/modules/dashboards/dashboards.module'
import { HealthModule } from '@app/modules/health/health.module'
import { ImportsModule } from '@app/modules/imports/imports.module'
import { MetadataModule } from '@app/modules/metadata/metadata.module'
import { ParticipantsModule } from '@app/modules/participants/participants.module'
import { ProgramsModule } from '@app/modules/programs/programs.module'
import { ProjectsModule } from '@app/modules/projects/projects.module'
import { ReportsModule } from '@app/modules/reports/reports.module'
import { StorageModule } from '@app/modules/storage/storage.module'
import { UsersModule } from '@app/modules/users/users.module'
import { PrismaModule } from '@app/prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: ['req.headers.authorization'],
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                },
              },
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ParticipantsModule,
    ProgramsModule,
    ProjectsModule,
    MetadataModule,
    ImportsModule,
    DashboardsModule,
    ReportsModule,
    AuditModule,
    StorageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
})
export class AppModule {}
