// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: supabase.getSession } }),
}))

import { requestFoundationResponse } from './request'

describe('requestFoundationResponse ownership', () => {
  afterEach(() => {
    document.cookie = 'pathways-context=; Path=/; Max-Age=0'
  })

  it('refuses the request when the workspace cookie changes while the session loads', async () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    supabase.getSession.mockImplementation(async () => {
      document.cookie = 'pathways-context=owner-b; Path=/'
      return { data: { session: null }, error: null }
    })
    await expect(requestFoundationResponse('/synthetic')).rejects.toThrow(
      'Request ownership changed.',
    )
  })

  it('goes on to the session check when the workspace cookie is unchanged', async () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    supabase.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(requestFoundationResponse('/synthetic')).rejects.toThrow(
      'Current session unavailable.',
    )
  })
})
