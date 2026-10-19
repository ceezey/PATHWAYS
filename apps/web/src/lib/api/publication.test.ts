import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { publicationClient } from './publication'

const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const otherId = '79000000-0000-4000-8000-000000000005'
const requestId = '79000000-0000-4000-8000-000000000006'
const updatedAt = '2026-09-27T00:00:00.000Z'
const snapshot = {
  id: projectId,
  title: 'Fictional project',
  code: 'SYNTHETIC-1',
  approvedSummary: 'A fictional approved project summary.',
  area: null,
  sector: null,
  startDate: null,
  endDate: null,
}
const publication = {
  revision: 1,
  state: 'FOR_REVIEW',
  summary: 'A fictional approved project summary.',
  snapshot,
  submittedById: userId,
  approvedById: null,
  publishedById: null,
  updatedAt,
}
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

type Operation = 'submit' | 'approve' | 'publish' | 'withdraw'
const receipt = { revision: 2, state: 'APPROVED', updatedAt }
const operations: readonly Operation[] = ['submit', 'approve', 'publish', 'withdraw']
const edit = (replacement: object) => ({ ...publication, ...replacement })
const editSnapshot = (replacement: object) => edit({ snapshot: { ...snapshot, ...replacement } })

describe('publicationClient publication read', () => {
  const client = publicationClient
  it('requests the project publication and returns the parsed row or null', async () => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json(publication))
    await expect(client.get(projectId, controller.signal)).resolves.toEqual(publication)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}/publication`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.signal).toBe(controller.signal)
    fetcher.mockResolvedValueOnce(json(null))
    await expect(client.get(projectId)).resolves.toBeNull()
  })
  it('refuses a malformed project id before any request', () => {
    expect(() => client.get('../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('accepts the largest allowed field lengths', async () => {
    const body = editSnapshot({
      title: 'a'.repeat(300),
      code: 'b'.repeat(100),
      approvedSummary: 'c'.repeat(4000),
      area: 'd'.repeat(500),
      sector: 'e'.repeat(300),
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    fetcher.mockResolvedValueOnce(json({ ...body, summary: 'f'.repeat(4000) }))
    await expect(client.get(projectId)).resolves.toMatchObject({ snapshot: body.snapshot })
  })
  it.each([
    ['another project snapshot', editSnapshot({ id: otherId })],
    ['an empty title', editSnapshot({ title: '' })],
    ['a title over 300 characters', editSnapshot({ title: 'a'.repeat(301) })],
    ['a code over 100 characters', editSnapshot({ code: 'b'.repeat(101) })],
    ['an empty approved summary', editSnapshot({ approvedSummary: '' })],
    [
      'an approved summary over 4000 characters',
      editSnapshot({ approvedSummary: 'c'.repeat(4001) }),
    ],
    ['an area over 500 characters', editSnapshot({ area: 'd'.repeat(501) })],
    ['a sector over 300 characters', editSnapshot({ sector: 'e'.repeat(301) })],
    ['a numeric area', editSnapshot({ area: 1 })],
    ['a non-uuid snapshot id', editSnapshot({ id: 'not-an-id' })],
    ['a snapshot publication timestamp', editSnapshot({ publishedAt: updatedAt })],
    ['a private snapshot field', editSnapshot({ privateNotes: 'synthetic private data' })],
    ['a beneficiary snapshot field', editSnapshot({ beneficiaries: 12 })],
    ['an expense snapshot field', editSnapshot({ expenseAmount: '10' })],
    ['a missing snapshot field', edit({ snapshot: { ...snapshot, sector: undefined } })],
    ['revision zero', edit({ revision: 0 })],
    ['a fractional revision', edit({ revision: 1.5 })],
    ['an unknown state', edit({ state: 'DRAFT' })],
    ['an empty summary', edit({ summary: '' })],
    ['a summary over 4000 characters', edit({ summary: 'f'.repeat(4001) })],
    ['a non-uuid submitter', edit({ submittedById: 'not-an-id' })],
    ['a missing approver', edit({ approvedById: undefined })],
    ['a timestamp without an offset', edit({ updatedAt: '2026-09-27T00:00:00' })],
    ['an unknown top-level key', edit({ extra: 'x' })],
  ])('rejects %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.get(projectId)).rejects.toThrow('could not be validated')
  })
})

describe('publicationClient publication transition', () => {
  const client = publicationClient
  it.each(operations)('%s posts the body unchanged and returns the receipt', async (operation) => {
    const controller = new AbortController()
    const body = {
      clientRequestId: requestId,
      expectedRevision: 1,
      summary: 'A fictional summary.',
    }
    fetcher.mockResolvedValueOnce(json(receipt))
    await expect(client.transition(projectId, operation, body, controller.signal)).resolves.toEqual(
      receipt,
    )
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/publication/${operation}`,
    )
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify(body))
    expect(init?.signal).toBe(controller.signal)
  })
  it('refuses a malformed project id before any request', () => {
    expect(() =>
      client.transition('../other', 'submit', { clientRequestId: requestId, expectedRevision: 1 }),
    ).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['an unknown key', { ...receipt, summary: 'x' }],
    ['an unknown state', { ...receipt, state: 'DRAFT' }],
    ['a zero revision', { ...receipt, revision: 0 }],
    ['a missing timestamp', { revision: 2, state: 'APPROVED' }],
  ])('rejects a receipt with %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(
      client.transition(projectId, 'approve', { clientRequestId: requestId, expectedRevision: 1 }),
    ).rejects.toThrow('could not be validated')
  })
})

describe('publicationClient request and strict response boundaries', () => {
  it('accepts only the allowlisted publication snapshot for the requested project', async () => {
    fetcher.mockResolvedValueOnce(json(publication))
    await expect(publicationClient.get(projectId)).resolves.toEqual(publication)
    fetcher.mockResolvedValueOnce(
      json({ ...publication, snapshot: { ...publication.snapshot, id: otherId } }),
    )
    await expect(publicationClient.get(projectId)).rejects.toThrow('could not be validated')
  })
  it.each(['privateNotes', 'beneficiaries', 'expenseAmount'])(
    'rejects private snapshot field %s',
    async (key) => {
      fetcher.mockResolvedValueOnce(
        json({
          ...publication,
          snapshot: { ...publication.snapshot, [key]: 'synthetic private data' },
        }),
      )
      await expect(publicationClient.get(projectId)).rejects.toThrow('could not be validated')
    },
  )
})
