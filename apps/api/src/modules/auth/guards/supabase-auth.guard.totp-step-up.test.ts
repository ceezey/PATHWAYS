import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVELOPER_AUTH_UUID } from '../developer-bootstrap-identity'

import {
  get,
  organizationId,
  profile,
  profiles,
  queryRaw,
  sqlOf,
  tokens,
  totpHandler,
  totpPath,
  useBoundaryApp,
  userId,
  verifiedSession,
} from './supabase-auth.guard.harness'

useBoundaryApp()

describe('Authenticator step-up decorator (cr-pathways-backup-step-up)', () => {
  const headers = {
    authorization: 'Bearer local-test-token',
    'x-pathways-user-id': userId,
    'x-pathways-organization-id': organizationId,
  }
  const now = () => Math.floor(Date.now() / 1000)
  const stepUpSession = (mfaVerifiedAt?: number) =>
    verifiedSession('aal2', DEVELOPER_AUTH_UUID, mfaVerifiedAt)

  beforeEach(() => {
    vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
    totpHandler.mockReset()
    profiles.resolveWithSession.mockResolvedValue({
      ...profile,
      permissions: ['projects.read', 'backups.restore'],
    })
  })

  it('refuses a session with no authenticator timestamp', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession())
    const denied = await get(totpPath, headers)
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('STEP_UP_TOTP_REQUIRED')
    expect(totpHandler).not.toHaveBeenCalled()
  })

  it('refuses a stale timestamp even with a live PIN grant, and never looks up the grant', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    queryRaw.mockResolvedValue([
      { pinState: 'SET', grantExpiresAt: new Date(Date.now() + 600_000) },
    ])
    const denied = await get(totpPath, headers)
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('STEP_UP_TOTP_REQUIRED')
    expect(
      queryRaw.mock.calls.filter((call) => sqlOf(call).includes('step_up_pin_status')),
    ).toEqual([])
    expect(totpHandler).not.toHaveBeenCalled()
  })

  it('admits a fresh authenticator timestamp', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 60))
    expect((await get(totpPath, headers)).status).toBe(200)
    expect(totpHandler).toHaveBeenCalledOnce()
  })

  it('admits a timestamp at the edge of the 900 second window', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 899))
    expect((await get(totpPath, headers)).status).toBe(200)
    expect(totpHandler).toHaveBeenCalledOnce()
  })

  it('answers a user without the permission with the plain permission 403', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession())
    profiles.resolveWithSession.mockResolvedValue({ ...profile })
    const denied = await get(totpPath, headers)
    expect(denied.status).toBe(403)
    expect(denied.body.message).toBe('Required application permission is missing.')
    expect(denied.body.code).toBeUndefined()
    expect(totpHandler).not.toHaveBeenCalled()
  })
})
