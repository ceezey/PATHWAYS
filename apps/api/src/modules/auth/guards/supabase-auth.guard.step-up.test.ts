import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../../common/authz/application-identity'
import { DEVELOPER_AUTH_UUID } from '../developer-bootstrap-identity'

import {
  auditCreate,
  beneficiaryHandler,
  detailPath,
  get,
  organizationId,
  prisma,
  profile,
  profiles,
  projectFindFirst,
  queryRaw,
  sessionId,
  tokens,
  unassignedProjectId,
  unpermittedPath,
  useBoundaryApp,
  userId,
  verifiedSession,
} from './supabase-auth.guard.harness'

useBoundaryApp()

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

  it('reports step-up freshness from signed claims, PIN grant and PIN state, and requires verified MFA', async () => {
    const verifiedAt = now() - 30
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(verifiedAt))
    queryRaw.mockResolvedValue([{ pinState: 'NONE', grantExpiresAt: null }])
    const fresh = await get('/auth/step-up/status', headers)
    expect(fresh.status).toBe(200)
    expect(fresh.cacheControl).toBe('private, no-store')
    expect(fresh.body).toEqual({
      fresh: true,
      expiresAt: new Date((verifiedAt + 900) * 1000).toISOString(),
      windowSeconds: 900,
      method: 'TOTP',
      pinState: 'NONE',
    })
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    queryRaw.mockResolvedValue([{ pinState: 'LOCKED', grantExpiresAt: null }])
    expect((await get('/auth/step-up/status', headers)).body).toEqual({
      fresh: false,
      expiresAt: null,
      windowSeconds: 900,
      method: null,
      pinState: 'LOCKED',
    })
    const grant = new Date(Date.now() + 600_000)
    queryRaw.mockResolvedValue([{ pinState: 'SET', grantExpiresAt: grant }])
    expect((await get('/auth/step-up/status', headers)).body).toMatchObject({
      fresh: true,
      expiresAt: grant.toISOString(),
      method: 'PIN',
      pinState: 'SET',
    })
    // The session is the verified claim, rechecked for liveness in the same transaction.
    expect(prisma.withVerifiedContext.mock.calls.at(-1)?.[0]).toMatchObject({ sessionId })
    expect(queryRaw.mock.calls.at(-1)?.slice(1)).toEqual([sessionId])
    expect(Object.keys((await get('/auth/step-up/status', headers)).body)).not.toContain(
      'failedAttempts',
    )
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal1'))
    expect((await get('/auth/step-up/status', headers)).status).toBe(403)
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
