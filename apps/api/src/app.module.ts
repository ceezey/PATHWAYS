import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'

import { RolesGuard } from './common/guards/roles.guard'
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard'
import { SentryInterceptor } from './common/interceptors/sentry.interceptor'
import { ActivitiesModule } from './modules/activities/activities.module'
import { AuditModule } from './modules/audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module'
import { DashboardsModule } from './modules/dashboards/dashboards.module'
import { HealthModule } from './modules/health/health.module'
import { ImportsModule } from './modules/imports/imports.module'
import { IndicatorsModule } from './modules/indicators/indicators.module'
import { MetadataModule } from './modules/metadata/metadata.module'
import { ParticipantsModule } from './modules/participants/participants.module'
import { ProgramsModule } from './modules/programs/programs.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { ReportsModule } from './modules/reports/reports.module'
import { StorageModule } from './modules/storage/storage.module'
import { UsersModule } from './modules/users/users.module'
import { PrismaModule } from './prisma/prisma.module'

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HTTP_METHOD_PATTERN = /^[A-Z]{1,16}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function serializeRequest(request: unknown) {
  const value = isRecord(request) ? request : {}

  return {
    id:
      typeof value.id === 'string' && REQUEST_ID_PATTERN.test(value.id) ? value.id : 'unavailable',
    method:
      typeof value.method === 'string' && HTTP_METHOD_PATTERN.test(value.method)
        ? value.method
        : 'UNKNOWN',
  }
}

function serializeResponse(response: unknown) {
  const value = isRecord(response) ? response : {}
  const statusCode = value.statusCode

  return {
    statusCode:
      typeof statusCode === 'number' &&
      Number.isInteger(statusCode) &&
      statusCode >= 100 &&
      statusCode <= 599
        ? statusCode
        : 0,
  }
}

export function createPathwaysPinoHttpOptions(environment = process.env.NODE_ENV) {
  return {
    level: environment === 'production' ? 'info' : 'debug',
    genReqId: (_request: IncomingMessage, response: ServerResponse) => {
      const requestId = randomUUID()
      response.setHeader('X-Request-Id', requestId)
      return requestId
    },
    quietReqLogger: true,
    quietResLogger: true,
    serializers: {
      req: serializeRequest,
      res: serializeResponse,
      err: () => ({}),
    },
    customReceivedObject: (request: IncomingMessage) => ({ req: request }),
    customReceivedMessage: () => 'request received',
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    redact: {
      paths: [
        'req.headers',
        'req.url',
        'req.query',
        'req.params',
        'req.body',
        'req.raw',
        'res.headers',
        'res.body',
        'err',
        'headers',
        'url',
        'query',
        'params',
        'body',
        'cookies',
        'cookie',
        'authorization',
        'token',
        'applicationId',
        'organizationId',
        'workspaceId',
        'projectId',
        'userId',
        'authUserId',
        'authSubject',
        '*.headers',
        '*.url',
        '*.query',
        '*.params',
        '*.body',
        '*.cookies',
        '*.cookie',
        '*.authorization',
        '*.token',
        '*.applicationId',
        '*.organizationId',
        '*.workspaceId',
        '*.projectId',
        '*.userId',
        '*.authUserId',
        '*.authSubject',
      ],
      remove: true,
    },
    transport:
      environment === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              colorize: true,
            },
          },
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: createPathwaysPinoHttpOptions(),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ActivitiesModule,
    BeneficiariesModule,
    UsersModule,
    ParticipantsModule,
    ProgramsModule,
    ProjectsModule,
    MetadataModule,
    ImportsModule,
    IndicatorsModule,
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
