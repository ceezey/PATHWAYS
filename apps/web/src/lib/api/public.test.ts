import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/' },
}))

import { readPublicSnapshots } from './public'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: 'Synthetic sector',
  startDate: null,
  endDate: null,
  publishedAt: '2026-09-27T00:00:00.000Z',
}
const reply = (body: unknown, status = 200) => {
  const fetcher = vi.fn(
    async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('public snapshot client', () => {
  it('reads the list anonymously with a limit of 100 and no cookies, referrer or redirects', async () => {
    const fetcher = reply([snapshot])
    await expect(readPublicSnapshots()).resolves.toEqual([snapshot])
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:4000/api/public/projects?limit=100', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal),
    })
  })

  it('reads one project by id and returns it as a one item list', async () => {
    const fetcher = reply(snapshot)
    await expect(readPublicSnapshots(snapshot.id)).resolves.toEqual([snapshot])
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/public/projects/${snapshot.id}`,
    )
  })

  it('answers not found for a malformed id without calling the API', async () => {
    const fetcher = reply(snapshot)
    await expect(readPublicSnapshots('not-a-uuid')).rejects.toThrow('PUBLIC_NOT_FOUND')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a single project that carries a field outside the allowlist', async () => {
    reply({ ...snapshot, budget: 1 })
    await expect(readPublicSnapshots(snapshot.id)).rejects.toThrow()
  })

  it.each([
    [404, 'PUBLIC_NOT_FOUND'],
    [500, 'PUBLIC_UNAVAILABLE'],
    [403, 'PUBLIC_UNAVAILABLE'],
  ])('maps status %s to %s', async (status, message) => {
    reply({}, status)
    await expect(readPublicSnapshots()).rejects.toThrow(message)
  })

  it('accepts a body of exactly one million characters and refuses one more', async () => {
    const json = JSON.stringify([snapshot])
    const padded = (extra: number) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(json + ' '.repeat(1_000_000 - json.length + extra))),
      )
    padded(0)
    await expect(readPublicSnapshots()).resolves.toHaveLength(1)
    padded(1)
    await expect(readPublicSnapshots()).rejects.toThrow('PUBLIC_UNAVAILABLE')
  })

  it('refuses a body over one million characters and more than 100 projects', async () => {
    reply([{ ...snapshot, approvedSummary: 'a'.repeat(1_000_000) }])
    await expect(readPublicSnapshots()).rejects.toThrow('PUBLIC_UNAVAILABLE')
    reply(Array(101).fill(snapshot))
    await expect(readPublicSnapshots()).rejects.toThrow()
    reply(Array(100).fill(snapshot))
    await expect(readPublicSnapshots()).resolves.toHaveLength(100)
  })

  it('accepts the longest allowed area and sector and null for both', async () => {
    const longest = { ...snapshot, area: 'a'.repeat(500), sector: 'a'.repeat(300) }
    reply([longest, { ...snapshot, area: null, sector: null }])
    await expect(readPublicSnapshots()).resolves.toHaveLength(2)
  })

  it.each([
    ['an id that is not a UUID', { id: 'p1' }],
    ['an empty title', { title: '' }],
    ['a title over 300 characters', { title: 'a'.repeat(301) }],
    ['a code over 100 characters', { code: 'a'.repeat(101) }],
    ['an empty summary', { approvedSummary: '' }],
    ['a summary over 4000 characters', { approvedSummary: 'a'.repeat(4001) }],
    ['an area over 500 characters', { area: 'a'.repeat(501) }],
    ['a sector over 300 characters', { sector: 'a'.repeat(301) }],
    ['a publication date without a zone', { publishedAt: '2026-09-27T00:00:00' }],
    ['an unknown field', { budget: 1 }],
  ])('rejects %s', async (_label, change) => {
    reply([{ ...snapshot, ...change }])
    await expect(readPublicSnapshots()).rejects.toThrow()
  })
})
