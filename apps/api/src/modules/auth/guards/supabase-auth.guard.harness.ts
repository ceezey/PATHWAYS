import 'reflect-metadata'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  Req,
  ValidationPipe,
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { RulesMachineBoundary } from '../../rules/rules-machine-boundary'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../../common/authz/application-identity'
import { reportAuthorizedOperationTiming } from '../../../common/authz/authorized-operation-timing'
import { RequireBeneficiaryStepUp } from '../../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../../common/decorators/permission.decorator'
import { Public } from '../../../common/decorators/public.decorator'
import {
  PrismaService,
  type VerifiedDatabaseContext,
  type VerifiedTransactionTiming,
} from '../../../prisma/prisma.service'
import { ApplicationProfileService } from '../application-profile.service'
import { AuthController } from '../auth.controller'
import { AuthService } from '../auth.service'
import { BeneficiaryStepUpPinService } from '../beneficiary-step-up-pin.service'
import { BeneficiaryStepUpService } from '../beneficiary-step-up.service'
import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from '../developer-bootstrap-identity'
import { RouteAccessController } from '../route-access.controller'
import { RouteAccessService } from '../route-access.service'
import { SignInLockoutService } from '../signin-lockout.service'
import { TokenAuthService, type VerifiedAuthSession } from '../token-auth.service'
import { WorkspaceResolutionService } from '../workspace-resolution.service'
import { SupabaseAuthGuard } from './supabase-auth.guard'

export const beneficiaryHandler = vi.fn()
const assignedProjectId = '60000000-0000-4000-8000-000000000006'
export const unassignedProjectId = '60000000-0000-4000-8000-000000000007'
export const detailPath = `/boundary-test/projects/${assignedProjectId}/beneficiary-detail`
export const unpermittedPath = `/boundary-test/projects/${assignedProjectId}/beneficiary-detail-unpermitted`

// Actual local HTTP routing, reflection and guard execution; only the Auth
// provider and database-facing profile service are mocked. No app startup,
// Prisma initialization, credential files, or external requests are involved.
@Controller('boundary-test')
export class BoundaryTestController {
  @Get('reviewed')
  @RequirePermission('projects.read')
  reviewed() {
    return { allowed: true }
  }

  @Get('operation-timing')
  @RequirePermission('projects.read')
  operationTiming(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    reportAuthorizedOperationTiming(request.user, {
      acquisitionMs: 7,
      contextMs: 8,
      profileMs: 9,
      featureMs: 10,
      totalMs: 11,
    })
    return { allowed: true }
  }

  @Get('projects/:projectId/beneficiary-detail')
  @RequirePermission('projects.read')
  @RequireBeneficiaryStepUp()
  beneficiaryDetail() {
    beneficiaryHandler()
    return { detail: true }
  }

  @Get('projects/:projectId/beneficiary-detail-unpermitted')
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  beneficiaryDetailUnpermitted() {
    beneficiaryHandler()
    return { detail: true }
  }

  @Get('beneficiary-aggregate')
  @RequirePermission('beneficiaries.aggregates.read')
  beneficiaryAggregate() {
    return { aggregate: true }
  }

  @Get('business')
  business() {
    return { forbiddenBusinessData: true }
  }

  @Get('health')
  @Public()
  health() {
    return { healthy: true }
  }
}

export const organizationId = '30000000-0000-4000-8000-000000000003'
export const userId = '40000000-0000-4000-8000-000000000004'
export const sessionId = '50000000-0000-4000-8000-000000000005'
export const profile: ApplicationIdentity = {
  id: DEVELOPER_AUTH_UUID,
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Local fixture developer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
}
export const verifiedSession = (
  aal: 'aal1' | 'aal2' = 'aal2',
  id = DEVELOPER_AUTH_UUID,
  mfaVerifiedAt?: number,
): VerifiedAuthSession => ({
  identity: { id, aal, ...(mfaVerifiedAt === undefined ? {} : { mfaVerifiedAt }) },
  sessionId,
  stageTimings: { claimsMs: 2, currentUserMs: 3 },
})
export const tokens = {
  verifyCurrent: vi.fn<(token: string) => Promise<VerifiedAuthSession>>(),
  assertSessionLive: vi.fn<(verified: VerifiedAuthSession) => Promise<void>>(),
}
export const profiles = { resolve: vi.fn(), resolveWithSession: vi.fn() }
export const auditCreate = vi.fn()
export const projectFindFirst = vi.fn()
// Tagged-template $queryRaw: records the SQL text and bound values for the 0037 functions.
export const queryRaw = vi.fn(
  async (_strings: TemplateStringsArray, ..._values: unknown[]): Promise<unknown[]> => [],
)
export const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?')
export const prisma = {
  discoverWorkspace: vi.fn(),
  withVerifiedContext: vi.fn(
    async (_context: VerifiedDatabaseContext, work: (tx: unknown) => Promise<unknown>) =>
      work({
        auditLog: { create: auditCreate },
        project: { findFirst: projectFindFirst },
        $queryRaw: queryRaw,
      }),
  ),
}
export const routeChecks = { check: vi.fn() }
let app: INestApplication
let port: number

export const send = (
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) =>
  new Promise<{ status: number; body: Record<string, unknown>; raw: string }>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...headers,
          ...(payload === undefined
            ? {}
            : {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(payload)),
              }),
        },
      },
      (response) => {
        let data = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode ?? 0, body: JSON.parse(data), raw: data })
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    request.on('error', reject)
    request.end(payload)
  })

export const get = (path: string, headers: Record<string, string> = {}) =>
  new Promise<{
    status: number
    body: Record<string, unknown>
    cacheControl?: string
    serverTiming?: string
  }>((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (response) => {
        let data = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          try {
            const serverTiming = response.headers['server-timing']
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(data),
              cacheControl: response.headers['cache-control'],
              serverTiming: Array.isArray(serverTiming) ? serverTiming.join(', ') : serverTiming,
            })
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    request.on('error', reject)
    request.end()
  })
export function useBoundaryApp() {
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, BoundaryTestController, RouteAccessController],
      providers: [
        {
          provide: RulesMachineBoundary,
          inject: [Reflector],
          useFactory: (reflector: Reflector) =>
            new RulesMachineBoundary(
              reflector,
              () => ({ enabled: false, drainToken: '', sweepToken: '' }),
              [],
            ),
        },
        { provide: TokenAuthService, useValue: tokens },
        { provide: ApplicationProfileService, useValue: profiles },
        { provide: PrismaService, useValue: prisma },
        { provide: RouteAccessService, useValue: routeChecks },
        WorkspaceResolutionService,
        BeneficiaryStepUpService,
        BeneficiaryStepUpPinService,
        SignInLockoutService,
        { provide: AuthService, useValue: { getStatus: () => ({ authenticated: true }) } },
        { provide: APP_GUARD, useClass: SupabaseAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication({ logger: false })
    // Same global validation as main.ts, so body-shape abuse is exercised end to end.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: false,
      }),
    )
    await app.listen(0, '127.0.0.1')
    port = (app.getHttpServer().address() as AddressInfo).port
  })

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SUPABASE_URL', DEVELOPER_SUPABASE_URL)
    vi.stubEnv('PATHWAYS_DEVELOPER_WORKSPACE_RESOLUTION_ENABLED', 'true')
    vi.stubEnv(
      'PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES',
      JSON.stringify([{ authUserId: DEVELOPER_AUTH_UUID, userId, organizationId }]),
    )
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', '')
    tokens.verifyCurrent.mockReset().mockResolvedValue(verifiedSession('aal1'))
    tokens.assertSessionLive.mockReset().mockResolvedValue(undefined)
    profiles.resolve.mockReset().mockResolvedValue(profile)
    profiles.resolveWithSession
      .mockReset()
      .mockImplementation(
        async (
          _authSubject: string,
          _sessionId: string,
          _organizationId: string,
          _userId: string,
          onTiming?: (timing: VerifiedTransactionTiming) => void,
        ) => {
          onTiming?.({ acquisitionMs: 4, contextMs: 5, workMs: 6 })
          return profile
        },
      )
    prisma.discoverWorkspace.mockReset().mockResolvedValue([{ organizationId, userId }])
    auditCreate.mockReset().mockResolvedValue({})
    queryRaw
      .mockReset()
      .mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join('?').includes('step_up_pin_status')
          ? [{ pinState: 'NONE', grantExpiresAt: null }]
          : [],
      )
    prisma.withVerifiedContext.mockClear()
    ;(
      app?.get(BeneficiaryStepUpPinService) as unknown as { attempts?: Map<string, unknown> }
    )?.attempts?.clear()
    projectFindFirst
      .mockReset()
      .mockResolvedValue({ id: assignedProjectId })
    // Per-instance audit dedupe must not carry between tests, or "no audit" is vacuous.
    ;(
      app?.get(BeneficiaryStepUpService) as unknown as { recorded?: Set<string> }
    )?.recorded?.clear()
    beneficiaryHandler.mockReset()
    routeChecks.check.mockReset().mockResolvedValue({
      route: 'dashboard',
      authorization: 'database-verified',
      beneficiaryAccess: 'records-or-none',
    })
  })

  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => app?.close())
}
