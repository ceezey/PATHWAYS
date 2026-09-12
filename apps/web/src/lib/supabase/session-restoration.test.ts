import { describe, expect, it, vi } from 'vitest'

import { validateRestoredSession } from './session-restoration'

describe('restored session validation', () => {
  const session = {
    access_token: 'synthetic-access-token',
    user: { id: 'test-user' },
  }

  it('requires online user validation before restoring matching local session state', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: session.user }, error: null })
    const getSession = vi.fn().mockResolvedValue({ data: { session }, error: null })

    await expect(validateRestoredSession({ getSession, getUser } as never)).resolves.toBe(session)
    expect(getUser.mock.invocationCallOrder[0]).toBeLessThan(getSession.mock.invocationCallOrder[0])
  })

  it('fails closed for revoked, mismatched, and unavailable sessions', async () => {
    for (const auth of [
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 401 } }),
        getSession: vi.fn(),
      },
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { ...session, user: { id: 'user-b' } } },
          error: null,
        }),
      },
      {
        getUser: vi.fn().mockRejectedValue(new Error('private-network-detail')),
        getSession: vi.fn(),
      },
    ]) {
      await expect(validateRestoredSession(auth as never)).resolves.toBeNull()
    }
  })
})
