import 'reflect-metadata'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesMachineBoundary } from '../../modules/rules/rules-machine-boundary'

import { ApplicationProfileService } from '../../modules/auth/application-profile.service'
import { AuthController } from '../../modules/auth/auth.controller'
import { AuthService } from '../../modules/auth/auth.service'
import { reportAuthorizedOperationTiming } from '../../modules/auth/authorized-operation-timing'
import { BeneficiaryStepUpService } from '../../modules/auth/beneficiary-step-up.service'
import {
  type ApplicationIdentity,
  type AuthenticatedRequest,
  DEVELOPER_AUTH_UUID,
  DEVELOPER_SUPABASE_URL,
} from '../../modules/auth/developer-access'
import { RouteAccessController } from '../../modules/auth/route-access.controller'
import { RouteAccessService } from '../../modules/auth/route-access.service'
import { TokenAuthService, type VerifiedAuthSession } from '../../modules/auth/token-auth.service'
import { WorkspaceResolutionService } from '../../modules/auth/workspace-resolution.service'
import { PrismaService, type VerifiedTransactionTiming } from '../../prisma/prisma.service'
import { RequireBeneficiaryStepUp } from '../decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../decorators/permission.decorator'
import { Public } from '../decorators/public.decorator'
import { SupabaseAuthGuard } from './supabase-auth.guard'

const beneficiaryHandler = vi.fn()
const assignedProjectId = '60000000-0000-4000-8000-000000000006'
const unassignedProjectId = '60000000-0000-4000-8000-000000000007'
const detailPath = `/boundary-test/projects/${assignedProjectId}/beneficiary-detail`
const unpermittedPath = `/boundary-test/projects/${assignedProjectId}/beneficiary-detail-unpermitted`

// Actual local HTTP routing, reflection and guard execution; only the Auth
// provider and database-facing profile service are mocked. No app startup,
// Prisma initialization, credential files, or external requests are involved.
@Controller('boundary-test')
class BoundaryTestController {
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

const organizationId = '30000000-0000-4000-8000-000000000003'
const userId = '40000000-0000-4000-8000-000000000004'
const sessionId = '50000000-0000-4000-8000-000000000005'
const profile: ApplicationIdentity = {
  id: DEVELOPER_AUTH_UUID,
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Local fixture developer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
}
const verifiedSession = (
  aal: 'aal1' | 'aal2' = 'aal2',
  id = DEVELOPER_AUTH_UUID,
  mfaVerifiedAt?: number,
): VerifiedAuthSession => ({
  identity: { id, aal, ...(mfaVerifiedAt === undefined ? {} : { mfaVerifiedAt }) },
  sessionId,
  stageTimings: { claimsMs: 2, currentUserMs: 3 },
})
const tokens = {
  verifyCurrent: vi.fn<(token: string) => Promise<VerifiedAuthSession>>(),
  assertSessionLive: vi.fn<(verified: VerifiedAuthSession) => Promise<void>>(),
}
const profiles = { resolve: vi.fn(), resolveWithSession: vi.fn() }
const auditCreate = vi.fn()
const projectFindFirst = vi.fn()
const prisma = {
  discoverWorkspace: vi.fn(),
  withVerifiedContext: vi.fn(async (_context: unknown, work: (tx: unknown) => Promise<unknown>) =>
    work({ auditLog: { create: auditCreate }, project: { findFirst: projectFindFirst } }),
  ),
}
const routeChecks = { check: vi.fn() }
let app: INestApplication
let port: number

const get = (path: string, headers: Record<string, string> = {}) =>
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
      { provide: AuthService, useValue: { getStatus: () => ({ authenticated: true }) } },
      { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
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
  projectFindFirst
    .mockReset()
    .mockResolvedValue({ id: assignedProjectId })
  // Per-instance audit dedupe must not carry between tests, or "no audit" is vacuous.
  ;(app?.get(BeneficiaryStepUpService) as unknown as { recorded?: Set<string> })?.recorded?.clear()
  beneficiaryHandler.mockReset()
  routeChecks.check.mockReset().mockResolvedValue({
    route: 'dashboard',
    authorization: 'database-verified',
    beneficiaryAccess: 'records-or-none',
  })
})

afterEach(() => vi.unstubAllEnvs())
afterAll(async () => app?.close())

describe('SupabaseAuthGuard local HTTP fail-closed boundary', () => {
  it('independently guards the route-check endpoint, including revocation and forged selection', async () => {
    const path = '/access/route-check?route=dashboard'
    const headers = {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    }
    expect((await get(path)).status).toBe(401)
    expect((await get(path, headers)).status).toBe(403)
    expect(routeChecks.check).not.toHaveBeenCalled()
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const permitted = await get(path, headers)
    expect(permitted.status).toBe(200)
    expect(permitted.cacheControl).toBe('private, no-store')
    expect(routeChecks.check).toHaveBeenCalledTimes(1)
    expect(profiles.resolveWithSession).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      sessionId,
      organizationId,
      userId,
      expect.any(Function),
      undefined,
    )
    expect(prisma.discoverWorkspace).not.toHaveBeenCalled()
    profiles.resolveWithSession.mockRejectedValueOnce(new ForbiddenException())
    expect(
      (
        await get(path, {
          ...headers,
          'x-pathways-organization-id': '90000000-0000-4000-8000-000000000009',
        })
      ).status,
    ).toBe(403)
    profiles.resolveWithSession.mockRejectedValue(new ForbiddenException())
    expect((await get(path, headers)).status).toBe(403)
    expect(routeChecks.check).toHaveBeenCalledTimes(1)
    tokens.verifyCurrent.mockRejectedValue(new UnauthorizedException())
    expect((await get(path, headers)).status).toBe(401)
  })
  it('discovers without selectors only after verified password/AAL2 and keeps responses private', async () => {
    expect((await get('/auth/workspaces')).status).toBe(401)
    expect(
      (await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })).status,
    ).toBe(403)
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({
      authUserId: DEVELOPER_AUTH_UUID,
      workspaces: [{ organizationId, userId, displayName: 'PATHWAYS workspace' }],
    })
  })

  it('rejects caller-supplied subject/search/selectors without performing a database read', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    for (const [path, extra] of [
      ['/auth/workspaces?authUserId=forged', {}],
      ['/auth/workspaces?organizationId=forged', {}],
      ['/auth/workspaces', { 'x-pathways-organization-id': organizationId }],
    ] as const) {
      const result = await get(path, { authorization: 'Bearer local-test-token', ...extra })
      expect(result.status).toBe(400)
      expect(result.cacheControl).toBe('private, no-store')
    }
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
  })

  it('revalidates each protected request and denies removed membership despite a prior success', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const headers = {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    }
    expect((await get('/auth/me', headers)).status).toBe(200)
    profiles.resolveWithSession.mockRejectedValue(new ForbiddenException())
    const denied = await get('/auth/me', headers)
    expect(denied.status).toBe(403)
    expect(denied.cacheControl).toBe('private, no-store')
    expect(denied.body).not.toHaveProperty('user')
    expect(profiles.resolveWithSession).toHaveBeenCalledTimes(2)
  })

  it('denies a removed Auth session on the next selected request without a standalone liveness call', async () => {
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    profiles.resolveWithSession.mockRejectedValueOnce(new UnauthorizedException())
    const result = await get('/auth/me', {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    })
    expect(result.status).toBe(401)
    expect(tokens.assertSessionLive).not.toHaveBeenCalled()
    expect(profiles.resolveWithSession).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      sessionId,
      organizationId,
      userId,
      expect.any(Function),
      undefined,
    )
  })

  it('returns unavailable rather than an empty workspace list for a database outage', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    profiles.resolve.mockRejectedValue(new Error('private-database-detail'))
    const result = await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(503)
    expect(result.cacheControl).toBe('private, no-store')
    expect(JSON.stringify(result.body)).not.toMatch(/private-database-detail|workspaces/)
  })
  it('checks explicit atomic permission before a reviewed handler, without an admin bypass', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    expect(
      (
        await get('/boundary-test/reviewed', {
          authorization: 'Bearer local-test-token',
          'x-pathways-user-id': userId,
          'x-pathways-organization-id': organizationId,
        })
      ).status,
    ).toBe(200)
    profiles.resolveWithSession.mockResolvedValue({ ...profile, permissions: [] })
    expect(
      (
        await get('/boundary-test/reviewed', {
          authorization: 'Bearer local-test-token',
          'x-pathways-user-id': userId,
          'x-pathways-organization-id': organizationId,
        })
      ).status,
    ).toBe(403)
    profiles.resolveWithSession.mockResolvedValue({
      ...profile,
      roles: ['UNREVIEWED'],
      permissions: ['projects.read'],
    })
    expect(
      (
        await get('/boundary-test/reviewed', {
          authorization: 'Bearer local-test-token',
          'x-pathways-user-id': userId,
          'x-pathways-organization-id': organizationId,
        })
      ).status,
    ).toBe(403)
  })
  it('keeps explicitly public health independent of Auth and business queries', async () => {
    expect((await get('/boundary-test/health')).status).toBe(200)
    expect(tokens.verifyCurrent).not.toHaveBeenCalled()
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
  })

  it.each(['', 'Basic credentials', 'Bearer', 'Bearer one two', 'Bearer token\ttail'])(
    'rejects absent or malformed bearer headers before Auth/provider reads %#',
    async (authorization) => {
      const result = await get('/auth/mfa/status', authorization ? { authorization } : {})
      expect(result.status).toBe(401)
      expect(tokens.verifyCurrent).not.toHaveBeenCalled()
      expect(profiles.resolveWithSession).not.toHaveBeenCalled()
    },
  )

  it('does not make MFA status public and sanitizes rejected-token responses', async () => {
    tokens.verifyCurrent.mockRejectedValue(new UnauthorizedException('Invalid authentication.'))
    const result = await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(401)
    expect(JSON.stringify(result.body)).not.toContain('local-test-token')
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
  })

  it('permits only minimal setup state for the selected aal1 identity', async () => {
    const result = await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({
      authUserId: DEVELOPER_AUTH_UUID,
      aal: 'aal1',
      enrollmentAllowed: true,
      applicationAccessEnabled: true,
    })
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
  })

  it('permits MFA setup for another verified non-anonymous identity', async () => {
    const otherId = '50000000-0000-4000-8000-000000000005'
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal2', otherId))
    const result = await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(200)
    expect(result.body.authUserId).toBe(otherId)
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
    expect(tokens.assertSessionLive).toHaveBeenCalledOnce()
  })

  it.each(['/auth/me', '/auth/status', '/boundary-test/business'])(
    'rejects direct password-only access to %s before a database read',
    async (route) => {
      vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
      const result = await get(route, { authorization: 'Bearer local-test-token' })
      expect(result.status).toBe(403)
      expect(result.body.message).toContain('MFA verification is required')
      expect(profiles.resolveWithSession).not.toHaveBeenCalled()
      expect(tokens.assertSessionLive).toHaveBeenCalled()
    },
  )

  it.each(['', 'false', 'TRUE', '1', ' true '])(
    'does not use the retired developer gate as runtime authority %#',
    async (setting) => {
      vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', setting)
      tokens.verifyCurrent.mockResolvedValue(verifiedSession())
      const result = await get('/auth/me', {
        authorization: 'Bearer local-test-token',
        'x-pathways-organization-id': organizationId,
        'x-pathways-user-id': userId,
      })
      expect(result.status).toBe(200)
      expect(profiles.resolveWithSession).toHaveBeenCalled()
    },
  )

  it('rejects an unreviewed business handler despite enabled aal2 administrator access', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/boundary-test/business', {
      authorization: 'Bearer local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })
    expect(result.status).toBe(403)
    expect(result.body).not.toHaveProperty('forbiddenBusinessData')
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
    expect(tokens.assertSessionLive).toHaveBeenCalledOnce()
  })

  it('returns only the resolved database profile after enabled aal2 access and context checks', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/auth/me', {
      authorization: 'bEaReR local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({ user: profile })
    expect(profiles.resolveWithSession).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      sessionId,
      organizationId,
      userId,
      expect.any(Function),
      undefined,
    )
    expect(tokens.assertSessionLive).not.toHaveBeenCalled()
    expect(result.serverTiming).toMatch(
      /^pathways_claims;dur=2, pathways_get_user;dur=3, pathways_db_acquire;dur=4, pathways_db_context;dur=5, pathways_db_profile;dur=6, pathways_session_profile;dur=\d+, pathways_auth_total;dur=\d+$/,
    )
    expect(JSON.stringify(result.body)).not.toContain('local-test-token')
  })

  it('does not expose diagnostic stage timing in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/auth/me', {
      authorization: 'Bearer local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })
    expect(result.status).toBe(200)
    expect(result.serverTiming).toBeUndefined()
  })

  it('appends fixed authorized-operation substages to a protected feature response', async () => {
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/boundary-test/operation-timing', {
      authorization: 'Bearer local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })

    expect(result.status).toBe(200)
    expect(result.serverTiming).toMatch(
      /pathways_op_acquire;dur=7, pathways_op_context;dur=8, pathways_op_profile;dur=9, pathways_op_feature;dur=10, pathways_op_total;dur=11$/,
    )
  })

  it('does not register authorized-operation timing in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    const result = await get('/boundary-test/operation-timing', {
      authorization: 'Bearer local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })

    expect(result.status).toBe(200)
    expect(result.serverTiming).toBeUndefined()
  })

  it('propagates missing, cross-scope, or inactive profile denial without fallback metadata roles', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verifyCurrent.mockResolvedValue(verifiedSession())
    profiles.resolveWithSession.mockRejectedValue(
      new ForbiddenException('Application context is unavailable.'),
    )
    const result = await get('/auth/me', {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    })
    expect(result.status).toBe(403)
    expect(result.body).not.toHaveProperty('user')
    expect(profiles.resolveWithSession).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      sessionId,
      organizationId,
      userId,
      expect.any(Function),
      undefined,
    )
  })
})

describe('Beneficiary step-up (cr-pathways-beneficiary-step-up)', () => {
  const headers = {
    authorization: 'Bearer local-test-token',
    'x-pathways-user-id': userId,
    'x-pathways-organization-id': organizationId,
  }
  const now = () => Math.floor(Date.now() / 1000)
  const auditActions = () =>
    auditCreate.mock.calls.map(([input]) => (input as { data: { action: string } }).data.action)
  const stepUpSession = (mfaVerifiedAt?: number) =>
    verifiedSession('aal2', DEVELOPER_AUTH_UUID, mfaVerifiedAt)

  beforeEach(() => vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true'))

  it('admits a fresh signed TOTP factor once audited, without re-auditing the same factor', async () => {
    const verifiedAt = now() - 60
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(verifiedAt))
    const first = await get(detailPath, headers)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ detail: true })
    expect(await get(detailPath, headers)).toMatchObject({ status: 200 })
    expect(auditActions()).toEqual(['BENEFICIARY_STEP_UP_ACCEPTED'])
    const audit = auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(audit.data).toMatchObject({
      organizationId,
      actorUserId: userId,
      entityType: 'BeneficiaryStepUp',
      changes: {
        operation: 'BoundaryTestController.beneficiaryDetail',
        factorVerifiedAt: new Date(verifiedAt * 1000).toISOString(),
        windowSeconds: 900,
      },
    })
    expect(JSON.stringify(audit)).not.toContain('local-test-token')
    expect(beneficiaryHandler).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['STALE', -901],
    ['MISSING', undefined],
    ['MISSING', 600],
  ] as const)(
    'denies a %s factor with STEP_UP_REQUIRED before the handler runs',
    async (reason, offset) => {
      tokens.verifyCurrent.mockResolvedValue(
        stepUpSession(offset === undefined ? undefined : now() + offset),
      )
      const denied = await get(detailPath, headers)
      expect(denied.status).toBe(403)
      expect(denied.body).toMatchObject({ statusCode: 403, code: 'STEP_UP_REQUIRED' })
      expect(Object.keys(denied.body).sort()).toEqual(['code', 'error', 'message', 'statusCode'])
      expect(beneficiaryHandler).not.toHaveBeenCalled()
      // Each case has a distinct factor/reason dedupe key, so exactly one denial is audited.
      expect(auditCreate).toHaveBeenCalledOnce()
      const data = (
        auditCreate.mock.calls[0]?.[0] as {
          data: { action: string; changes: { reason: string } }
        }
      ).data
      expect(data.action).toBe('BENEFICIARY_STEP_UP_REQUIRED')
      expect(data.changes.reason).toBe(reason)
    },
  )

  it('checks project assignment before step-up: an unassigned project with a stale factor gets the scope denial', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    projectFindFirst.mockResolvedValue(null)
    const denied = await get(
      `/boundary-test/projects/${unassignedProjectId}/beneficiary-detail`,
      headers,
    )
    expect(denied.status).toBe(404)
    expect(denied.body.code).toBeUndefined()
    expect(denied.body.message).toBe('Project unavailable.')
    expect(projectFindFirst).toHaveBeenCalledOnce()
    const where = JSON.stringify(projectFindFirst.mock.calls[0]?.[0])
    expect(where).toContain(unassignedProjectId)
    expect(where).toContain(organizationId)
    expect(beneficiaryHandler).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it.each(['not-a-uuid', 'undefined'])(
    'denies a malformed route project %s as unavailable without querying or auditing',
    async (projectId) => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 60))
      const denied = await get(`/boundary-test/projects/${projectId}/beneficiary-detail`, headers)
      expect(denied.status).toBe(404)
      expect(denied.body.code).toBeUndefined()
      expect(projectFindFirst).not.toHaveBeenCalled()
      expect(auditCreate).not.toHaveBeenCalled()
      expect(beneficiaryHandler).not.toHaveBeenCalled()
    },
  )

  it('fails closed with 503 when project scope cannot be verified', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 60))
    projectFindFirst.mockRejectedValue(new Error('synthetic scope outage'))
    const unavailable = await get(detailPath, headers)
    expect(unavailable.status).toBe(503)
    expect(JSON.stringify(unavailable.body)).not.toContain('synthetic scope outage')
    expect(auditCreate).not.toHaveBeenCalled()
    expect(beneficiaryHandler).not.toHaveBeenCalled()
  })

  it('checks permission before step-up so an unpermitted role never reaches the prompt', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    const denied = await get(unpermittedPath, headers)
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBeUndefined()
    expect(denied.body.message).toBe('Required application permission is missing.')
    expect(beneficiaryHandler).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
    'keeps aggregate-only %s outside step-up: aggregate admitted, detail denied on permission',
    async (role) => {
      const aggregateOnly: ApplicationIdentity = {
        ...profile,
        roles: [role],
        permissions: ['projects.read', 'beneficiaries.aggregates.read'],
      }
      profiles.resolveWithSession.mockImplementation(async () => aggregateOnly)
      for (const mfaVerifiedAt of [now() - 901, undefined]) {
        tokens.verifyCurrent.mockResolvedValue(stepUpSession(mfaVerifiedAt))
        const aggregate = await get('/boundary-test/beneficiary-aggregate', headers)
        expect(aggregate.status).toBe(200)
        expect(aggregate.body).toEqual({ aggregate: true })
        const detail = await get(unpermittedPath, headers)
        expect(detail.status).toBe(403)
        expect(detail.body.code).toBeUndefined()
        expect(detail.body.message).toBe('Required application permission is missing.')
      }
      expect(beneficiaryHandler).not.toHaveBeenCalled()
      expect(auditCreate).not.toHaveBeenCalled()
    },
  )

  it('still denies when the denial audit fails, and withholds access when acceptance cannot be audited', async () => {
    auditCreate.mockRejectedValue(new Error('synthetic audit outage'))
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 1_000))
    expect(await get(detailPath, headers)).toMatchObject({
      status: 403,
      body: { code: 'STEP_UP_REQUIRED' },
    })
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 5))
    const withheld = await get(detailPath, headers)
    expect(withheld.status).toBe(503)
    expect(JSON.stringify(withheld.body)).not.toContain('synthetic audit outage')
    expect(beneficiaryHandler).not.toHaveBeenCalled()
  })

  it('reports step-up freshness from signed claims only and requires verified MFA', async () => {
    const verifiedAt = now() - 30
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(verifiedAt))
    const fresh = await get('/auth/step-up/status', { authorization: 'Bearer local-test-token' })
    expect(fresh.status).toBe(200)
    expect(fresh.cacheControl).toBe('private, no-store')
    expect(fresh.body).toEqual({
      fresh: true,
      expiresAt: new Date((verifiedAt + 900) * 1000).toISOString(),
      windowSeconds: 900,
    })
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    expect((await get('/auth/step-up/status', { authorization: 'Bearer t' })).body).toEqual({
      fresh: false,
      expiresAt: null,
      windowSeconds: 900,
    })
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal1'))
    expect((await get('/auth/step-up/status', { authorization: 'Bearer t' })).status).toBe(403)
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
