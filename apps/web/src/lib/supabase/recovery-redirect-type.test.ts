import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { recoveryRedirectType } from './recovery-server'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('recovery redirect type', () => {
  // The route mocks hide library changes, so this drives the real supabase-js PKCE storage and exchange.
  it('matches what supabase-js returns for a password recovery code exchange', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    }
    const user = { id: 'test-user', aud: 'authenticated', app_metadata: {}, user_metadata: {} }
    const fetchStub: typeof fetch = async (input) =>
      String(input).includes('/recover')
        ? json({})
        : json({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user,
          })
    const client = createClient('https://test-project.supabase.co', 'test-publishable-key', {
      auth: {
        storage,
        flowType: 'pkce',
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchStub },
    })

    await client.auth.resetPasswordForEmail('person@example.com', {
      redirectTo: 'https://staff.example.test/auth/recovery/callback',
    })
    const { data, error } = await client.auth.exchangeCodeForSession('test-code')

    expect(error).toBeNull()
    expect(data.redirectType).toBe(recoveryRedirectType)
  })
})
