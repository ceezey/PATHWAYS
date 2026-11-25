import 'reflect-metadata'
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVELOPER_AUTH_UUID } from '../developer-bootstrap-identity'

import {
  appSessions,
  get,
  organizationId,
  profiles,
  sessionId,
  tokens,
  useBoundaryApp,
  userId,
  verifiedSession,
} from './supabase-auth.guard.harness'

useBoundaryApp()

const routeCheck = '/access/route-check?route=dashboard'
const headers = {
  authorization: 'Bearer local-test-token',
  'x-pathways-user-id': userId,
  'x-pathways-organization-id': organizationId,
  'user-agent': 'Synthetic browser',
}
const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
  mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY

beforeEach(() => {
  vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
  tokens.verifyCurrent.mockResolvedValue(verifiedSession())
  appSessions.touch.mockReset().mockResolvedValue(undefined)
})

describe('SupabaseAuthGuard session activity', () => {
  it('records activity for the verified session after the token check and before the profile read', async () => {
    expect((await get(routeCheck, headers)).status).toBe(200)
    expect(appSessions.touch).toHaveBeenCalledExactlyOnceWith(
      DEVELOPER_AUTH_UUID,
      sessionId,
      'Synthetic browser',
    )
    expect(order(tokens.verifyCurrent)).toBeLessThan(order(appSessions.touch))
    expect(order(appSessions.touch)).toBeLessThan(order(profiles.resolveWithSession))
  })

  it('records activity before the separate liveness read of a pre-profile route', async () => {
    tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal1'))
    await get('/auth/mfa/status', headers)
    expect(appSessions.touch).toHaveBeenCalledTimes(1)
    expect(tokens.assertSessionLive).toHaveBeenCalledTimes(1)
    expect(order(appSessions.touch)).toBeLessThan(order(tokens.assertSessionLive))
  })

  it('answers 503 and stops before any liveness or profile read when activity cannot be recorded', async () => {
    appSessions.touch.mockRejectedValue(
      new ServiceUnavailableException('Session verification is temporarily unavailable.'),
    )
    expect((await get(routeCheck, headers)).status).toBe(503)
    expect(profiles.resolveWithSession).not.toHaveBeenCalled()
    expect(tokens.assertSessionLive).not.toHaveBeenCalled()
  })

  it('never records activity for a missing bearer or a token that fails verification', async () => {
    expect((await get(routeCheck)).status).toBe(401)
    tokens.verifyCurrent.mockRejectedValue(new UnauthorizedException())
    expect((await get(routeCheck, headers)).status).toBe(401)
    expect(appSessions.touch).not.toHaveBeenCalled()
  })
})
