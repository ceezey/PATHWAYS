import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))
import { pathwaysClient } from './pathways-client'

const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const fetcher = vi.fn()

describe('P06 client fail-closed request boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal('fetch', fetcher)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects an unapproved SADDD cross-filter before fetching', async () => {
    await expect(
      pathwaysClient.getSadddDashboard({ projectId, sex: 'FEMALE' } as never),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when the current session disappears', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(pathwaysClient.getMonitoringDashboard()).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not replace a denied indicator read with a successful empty value', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(pathwaysClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
