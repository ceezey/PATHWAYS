import 'reflect-metadata'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApplicationProfileService } from '../../modules/auth/application-profile.service'
import { AuthController } from '../../modules/auth/auth.controller'
import { AuthService } from '../../modules/auth/auth.service'
import {
  type ApplicationIdentity,
  DEVELOPER_AUTH_UUID,
  DEVELOPER_SUPABASE_URL,
  type VerifiedAuthIdentity,
} from '../../modules/auth/developer-access'
import { RouteAccessController } from '../../modules/auth/route-access.controller'
import { RouteAccessService } from '../../modules/auth/route-access.service'
import { TokenAuthService } from '../../modules/auth/token-auth.service'
import { WorkspaceResolutionService } from '../../modules/auth/workspace-resolution.service'
import { RequirePermission } from '../decorators/permission.decorator'
import { Public } from '../decorators/public.decorator'
import { SupabaseAuthGuard } from './supabase-auth.guard'

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
const tokens = { verify: vi.fn<(token: string) => Promise<VerifiedAuthIdentity>>() }
const profiles = { resolve: vi.fn() }
const routeChecks = { check: vi.fn() }
let app: INestApplication
let port: number

const get = (path: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; body: Record<string, unknown>; cacheControl?: string }>(
    (resolve, reject) => {
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
              resolve({
                status: response.statusCode ?? 0,
                body: JSON.parse(data),
                cacheControl: response.headers['cache-control'],
              })
            } catch (error) {
              reject(error)
            }
          })
        },
      )
      request.on('error', reject)
      request.end()
    },
  )

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [AuthController, BoundaryTestController, RouteAccessController],
    providers: [
      { provide: TokenAuthService, useValue: tokens },
      { provide: ApplicationProfileService, useValue: profiles },
      { provide: RouteAccessService, useValue: routeChecks },
      WorkspaceResolutionService,
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
  tokens.verify.mockReset().mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal1' })
  profiles.resolve.mockReset().mockResolvedValue(profile)
  routeChecks.check.mockReset().mockResolvedValue({
    route: 'dashboard',
    presentation: 'prototype-only',
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
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    const permitted = await get(path, headers)
    expect(permitted.status).toBe(200)
    expect(permitted.cacheControl).toBe('private, no-store')
    expect(routeChecks.check).toHaveBeenCalledTimes(1)
    expect(
      (
        await get(path, {
          ...headers,
          'x-pathways-organization-id': '90000000-0000-4000-8000-000000000009',
        })
      ).status,
    ).toBe(403)
    profiles.resolve.mockRejectedValue(new ForbiddenException())
    expect((await get(path, headers)).status).toBe(403)
    expect(routeChecks.check).toHaveBeenCalledTimes(1)
    tokens.verify.mockRejectedValue(new UnauthorizedException())
    expect((await get(path, headers)).status).toBe(401)
  })
  it('discovers without selectors only after verified password/AAL2 and keeps responses private', async () => {
    expect((await get('/auth/workspaces')).status).toBe(401)
    expect(
      (await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })).status,
    ).toBe(403)
    expect(profiles.resolve).not.toHaveBeenCalled()
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    const result = await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({
      authUserId: DEVELOPER_AUTH_UUID,
      prototypeOnly: true,
      workspaces: [{ organizationId, userId, displayName: 'Development workspace' }],
    })
  })

  it('rejects caller-supplied subject/search/selectors without performing a database read', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    for (const [path, extra] of [
      ['/auth/workspaces?authUserId=forged', {}],
      ['/auth/workspaces?organizationId=forged', {}],
      ['/auth/workspaces', { 'x-pathways-organization-id': organizationId }],
    ] as const) {
      const result = await get(path, { authorization: 'Bearer local-test-token', ...extra })
      expect(result.status).toBe(400)
      expect(result.cacheControl).toBe('private, no-store')
    }
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it('revalidates each protected request and denies removed membership despite a prior success', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    const headers = {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    }
    expect((await get('/auth/me', headers)).status).toBe(200)
    profiles.resolve.mockRejectedValue(new ForbiddenException())
    const denied = await get('/auth/me', headers)
    expect(denied.status).toBe(403)
    expect(denied.cacheControl).toBe('private, no-store')
    expect(denied.body).not.toHaveProperty('user')
    expect(profiles.resolve).toHaveBeenCalledTimes(2)
  })

  it('returns unavailable rather than an empty workspace list for a database outage', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    profiles.resolve.mockRejectedValue(new Error('private-database-detail'))
    const result = await get('/auth/workspaces', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(503)
    expect(result.cacheControl).toBe('private, no-store')
    expect(JSON.stringify(result.body)).not.toMatch(/private-database-detail|workspaces/)
  })
  it('checks explicit atomic permission before a reviewed handler, without an admin bypass', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    expect(
      (
        await get('/boundary-test/reviewed', {
          authorization: 'Bearer local-test-token',
          'x-pathways-user-id': userId,
          'x-pathways-organization-id': organizationId,
        })
      ).status,
    ).toBe(200)
    profiles.resolve.mockResolvedValue({ ...profile, permissions: [] })
    expect(
      (
        await get('/boundary-test/reviewed', {
          authorization: 'Bearer local-test-token',
          'x-pathways-user-id': userId,
          'x-pathways-organization-id': organizationId,
        })
      ).status,
    ).toBe(403)
    profiles.resolve.mockResolvedValue({
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
    expect(tokens.verify).not.toHaveBeenCalled()
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it.each(['', 'Basic credentials', 'Bearer', 'Bearer one two', 'Bearer token\ttail'])(
    'rejects absent or malformed bearer headers before Auth/provider reads %#',
    async (authorization) => {
      const result = await get('/auth/mfa/status', authorization ? { authorization } : {})
      expect(result.status).toBe(401)
      expect(tokens.verify).not.toHaveBeenCalled()
      expect(profiles.resolve).not.toHaveBeenCalled()
    },
  )

  it('does not make MFA status public and sanitizes rejected-token responses', async () => {
    tokens.verify.mockRejectedValue(new UnauthorizedException('Invalid authentication.'))
    const result = await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(401)
    expect(JSON.stringify(result.body)).not.toContain('local-test-token')
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it('permits only minimal setup state for the selected aal1 identity', async () => {
    const result = await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({
      authUserId: DEVELOPER_AUTH_UUID,
      aal: 'aal1',
      enrollmentAllowed: true,
      applicationAccessEnabled: false,
    })
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it('rejects other authenticated identities even for MFA setup', async () => {
    tokens.verify.mockResolvedValue({
      id: '50000000-0000-4000-8000-000000000005',
      aal: 'aal2',
    })
    expect(
      (await get('/auth/mfa/status', { authorization: 'Bearer local-test-token' })).status,
    ).toBe(403)
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it.each(['/auth/me', '/auth/status', '/boundary-test/business'])(
    'rejects direct password-only access to %s before a database read',
    async (route) => {
      vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
      const result = await get(route, { authorization: 'Bearer local-test-token' })
      expect(result.status).toBe(403)
      expect(result.body.message).toContain('MFA verification is required')
      expect(profiles.resolve).not.toHaveBeenCalled()
    },
  )

  it.each(['', 'false', 'TRUE', '1', ' true '])(
    'keeps application access closed unless exactly enabled %#',
    async (setting) => {
      vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', setting)
      tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
      const result = await get('/auth/me', { authorization: 'Bearer local-test-token' })
      expect(result.status).toBe(403)
      expect(result.body.message).toContain('onboarding gate')
      expect(profiles.resolve).not.toHaveBeenCalled()
    },
  )

  it('rejects an unreviewed business handler despite enabled aal2 administrator access', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    const result = await get('/boundary-test/business', {
      authorization: 'Bearer local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })
    expect(result.status).toBe(403)
    expect(result.body).not.toHaveProperty('forbiddenBusinessData')
    expect(profiles.resolve).not.toHaveBeenCalled()
  })

  it('returns only the resolved database profile after enabled aal2 access and context checks', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    const result = await get('/auth/me', {
      authorization: 'bEaReR local-test-token',
      'x-pathways-organization-id': organizationId,
      'x-pathways-user-id': userId,
    })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('private, no-store')
    expect(result.body).toEqual({ user: profile })
    expect(profiles.resolve).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      organizationId,
      userId,
    )
    expect(JSON.stringify(result.body)).not.toContain('local-test-token')
  })

  it('propagates missing, cross-scope, or inactive profile denial without fallback metadata roles', async () => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    tokens.verify.mockResolvedValue({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
    profiles.resolve.mockRejectedValue(
      new ForbiddenException('Application context is unavailable.'),
    )
    const result = await get('/auth/me', {
      authorization: 'Bearer local-test-token',
      'x-pathways-user-id': userId,
      'x-pathways-organization-id': organizationId,
    })
    expect(result.status).toBe(403)
    expect(result.body).not.toHaveProperty('user')
    expect(profiles.resolve).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      organizationId,
      userId,
    )
  })
})
