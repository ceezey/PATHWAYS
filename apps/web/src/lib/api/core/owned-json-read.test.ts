import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { delayedBody } from '@/test/fixtures/delayed-body'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { auditClient } from '@/lib/api/audit'

const authUserId = '78000000-0000-4000-8000-000000000001'
const organizationId = '78000000-0000-4000-8000-000000000002'
const userId = '78000000-0000-4000-8000-000000000003'
const projectId = '78000000-0000-4000-8000-000000000004'
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch/header path and Core stream/Zod boundary.
const fetcher = vi.fn<typeof fetch>()
const click = vi.fn()
const remove = vi.fn()
const append = vi.fn()
let link: { href: string; download: string; click: typeof click; remove: typeof remove }
beforeEach(() => {
  vi.clearAllMocks()
  link = { href: '', download: '', click, remove }
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    createElement: vi.fn(() => link),
    body: { append },
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Owned JSON read boundaries', () => {
  it('honors an already aborted read signal before dispatch', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(auditClient.list(undefined, controller.signal)).rejects.toThrow(
      'Current workspace access',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refuses reads without a workspace cookie before dispatch', async () => {
    document.cookie = ''
    await expect(auditClient.list()).rejects.toThrow('Current workspace access')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('cancels a JSON response arriving after ownership invalidation before reading its body', async () => {
    const response = json({ projectId, evaluations: [], criteria: [] })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    let finish: (value: Response) => void = () => {}
    fetcher.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const rejection = expect(auditClient.list()).rejects.toThrow(
      'Response ownership or format changed',
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    clearSensitiveDraftStorage()
    finish(response)
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('cancels an unexpected JSON response MIME before body parsing', async () => {
    const response = new Response('synthetic unexpected content', {
      headers: { 'Content-Type': 'text/html' },
    })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    fetcher.mockResolvedValueOnce(response)
    await expect(auditClient.list()).rejects.toThrow('Response ownership or format changed')
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('drops a body that completes after logout and return to the same cookie owner', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(auditClient.list()).rejects.toThrow('Response unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    clearSensitiveDraftStorage()
    delayed.send(
      new TextEncoder().encode(JSON.stringify({ projectId, evaluations: [], criteria: [] })),
    )
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('cancels an oversized JSON body before parsing or accepting it', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(auditClient.list()).rejects.toThrow('Response unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    delayed.send(new Uint8Array(2_000_001))
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
})
