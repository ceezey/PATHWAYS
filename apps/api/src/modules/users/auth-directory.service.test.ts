import { BadGatewayException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthDirectoryService } from './auth-directory.service'

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUserById: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: provider.createClient }))

const authUserId = '72000000-0000-4000-8000-000000000001'

describe('AuthDirectoryService existing-identity boundary', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-synthetic-key')
    provider.createClient.mockReset().mockReturnValue({
      auth: { admin: { getUserById: provider.getUserById } },
    })
    provider.getUserById.mockReset().mockResolvedValue({
      data: {
        user: {
          id: authUserId,
          email: 'Existing.User@example.invalid',
          email_confirmed_at: '2026-09-13T00:00:00.000Z',
        },
      },
      error: null,
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('looks up only the exact verified Auth UUID and returns normalized directory data', async () => {
    await expect(
      new AuthDirectoryService().getExistingVerifiedIdentity(authUserId),
    ).resolves.toEqual({ id: authUserId, email: 'existing.user@example.invalid' })
    expect(provider.getUserById).toHaveBeenCalledExactlyOnceWith(authUserId)
    expect(provider.createClient.mock.calls[0]?.[0]).toBe('https://synthetic.supabase.co')
    expect(provider.createClient.mock.calls[0]?.[2]).toMatchObject({
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  })

  it.each(['not-a-uuid', '72000000-0000-4000-8000-000000000001?role=admin'])(
    'rejects malformed identity input before contacting Supabase (%s)',
    async (input) => {
      await expect(
        new AuthDirectoryService().getExistingVerifiedIdentity(input),
      ).rejects.toBeInstanceOf(BadGatewayException)
      expect(provider.createClient).not.toHaveBeenCalled()
    },
  )

  it.each([
    'http://synthetic.supabase.co',
    'https://user:secret@synthetic.supabase.co',
    'https://synthetic.supabase.co/auth/v1',
  ])(
    'rejects a non-origin or non-HTTPS Auth endpoint without exposing the service key',
    async (url) => {
      vi.stubEnv('SUPABASE_URL', url)
      await expect(
        new AuthDirectoryService().getExistingVerifiedIdentity(authUserId),
      ).rejects.toBeInstanceOf(BadGatewayException)
      expect(provider.createClient).not.toHaveBeenCalled()
    },
  )

  it('fails closed for an unconfirmed or mismatched provider identity', async () => {
    provider.getUserById.mockResolvedValue({
      data: { user: { id: '72000000-0000-4000-8000-000000000002', email: null } },
      error: null,
    })
    await expect(
      new AuthDirectoryService().getExistingVerifiedIdentity(authUserId),
    ).rejects.toMatchObject({
      message: 'The existing verified identity could not be confirmed.',
    })
  })
})
