import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVELOPER_AUTH_UUID } from '../developer-bootstrap-identity'

import {
  auditCreate,
  get,
  organizationId,
  profile,
  profiles,
  tokens,
  totpHandler,
  totpPath,
  unpermittedPath,
  useBoundaryApp,
  userId,
  verifiedSession,
} from './supabase-auth.guard.harness'

useBoundaryApp(true)

describe('Refused access is recorded (cr-pathways-refusal-logging)', () => {
  const headers = {
    authorization: 'Bearer local-test-token',
    'x-pathways-user-id': userId,
    'x-pathways-organization-id': organizationId,
  }
  const warn = vi.spyOn(Logger.prototype, 'warn')

  beforeEach(() => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    warn.mockReset().mockImplementation(() => undefined)
    totpHandler.mockReset()
  })

  it('writes one row for a permission 403 with the route template and no ids', async () => {
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal2', DEVELOPER_AUTH_UUID, 1))
    const denied = await get(unpermittedPath, headers)
    expect(denied.status).toBe(403)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'AUTHZ_REFUSED',
        entityType: 'Route',
        entityId: 'GET /boundary-test/projects/:projectId/beneficiary-detail-unpermitted',
        changes: { method: 'GET', status: 403 },
      },
    })
  })

  it('carries the machine code of a step-up 403', async () => {
    profiles.resolveWithSession.mockResolvedValue({
      ...profile,
      permissions: ['projects.read', 'backups.restore'],
    })
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal2', DEVELOPER_AUTH_UUID))
    const denied = await get(totpPath, headers)
    expect(denied.status).toBe(403)
    expect(totpHandler).not.toHaveBeenCalled()
    expect(auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        entityId: 'GET /boundary-test/totp-step-up',
        changes: { method: 'GET', status: 403, code: 'STEP_UP_TOTP_REQUIRED' },
      },
    })
  })

  it('logs an anonymous 401 and writes no row', async () => {
    const denied = await get(totpPath, {})
    expect(denied.status).toBe(401)
    expect(auditCreate).not.toHaveBeenCalled()
    expect(warn.mock.calls).toEqual([
      [{ event: 'PATHWAYS_AUTH_REFUSED', status: 401, route: 'GET /boundary-test/totp-step-up' }],
    ])
  })
})
