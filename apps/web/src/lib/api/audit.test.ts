import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { auditClient } from './audit'

const authUserId = '79100000-0000-4000-8000-000000000001'
const organizationId = '79100000-0000-4000-8000-000000000002'
const userId = '79100000-0000-4000-8000-000000000003'
const projectId = '79100000-0000-4000-8000-000000000004'
const rowId = '79100000-0000-4000-8000-000000000005'
const row = {
  id: rowId,
  occurredAt: '2026-09-27T00:00:00.000Z',
  action: 'project.updated',
  entityType: 'Project',
  entityId: projectId,
  projectId,
  actorUserId: userId,
  actorName: 'Synthetic Staff',
}
const page = { rows: [row], nextCursor: null }
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
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
})

describe('auditClient audit read', () => {
  const client = auditClient
  it.each([
    ['without a cursor', undefined, '/audit'],
    ['with an encoded cursor', 'a b&c=d/e', `/audit?cursor=${encodeURIComponent('a b&c=d/e')}`],
  ])('requests the page %s and returns the parsed rows', async (_label, cursor, suffix) => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json(page))
    await expect(client.list(cursor, controller.signal)).resolves.toEqual(page)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`http://127.0.0.1:4000/api${suffix}`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.signal).toBe(controller.signal)
  })
  it('accepts a full page of 100 rows with null optional fields and a next cursor', async () => {
    const empty = { ...row, entityId: null, projectId: null, actorUserId: null, actorName: null }
    const body = { rows: Array.from({ length: 100 }, () => empty), nextCursor: 'next' }
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.list()).resolves.toEqual(body)
  })
  it.each([
    ['101 rows', { rows: Array.from({ length: 101 }, () => row), nextCursor: null }],
    ['an unknown page key', { ...page, total: 1 }],
    ['a missing next cursor', { rows: [row] }],
    ['a numeric next cursor', { rows: [row], nextCursor: 1 }],
    ['an unknown row key', { rows: [{ ...row, ipAddress: 'synthetic' }], nextCursor: null }],
    ['a non-uuid row id', { rows: [{ ...row, id: 'not-an-id' }], nextCursor: null }],
    ['a non-uuid project id', { rows: [{ ...row, projectId: 'not-an-id' }], nextCursor: null }],
    [
      'a timestamp without an offset',
      { rows: [{ ...row, occurredAt: '2026-09-27' }], nextCursor: null },
    ],
    ['a missing action', { rows: [{ ...row, action: undefined }], nextCursor: null }],
    ['a numeric actor name', { rows: [{ ...row, actorName: 1 }], nextCursor: null }],
  ])('rejects %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.list()).rejects.toThrow('could not be validated')
  })
})
