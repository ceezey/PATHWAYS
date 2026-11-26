import { afterEach, describe, expect, it, vi } from 'vitest'

const incoming = vi.hoisted(() => ({ realIp: null as string | null }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(incoming.realIp ? { 'x-real-ip': incoming.realIp } : {}),
}))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/', VISITOR_FORWARD_TOKEN: '' },
}))

import { webEnv } from '@/lib/env'

import { readPublicAnalytics, readPublicSnapshots } from './public'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: 'Synthetic sector',
  startDate: null,
  endDate: null,
  media: [],
  views: [],
  publishedAt: '2026-09-27T00:00:00.000Z',
}
const reply = (body: unknown, status = 200) => {
  const fetcher = vi.fn(
    async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  webEnv.VISITOR_FORWARD_TOKEN = ''
  incoming.realIp = null
})

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
    ['a missing media list', { media: undefined }],
    ['an unknown view', { views: ['budget'] }],
  ])('rejects %s', async (_label, change) => {
    reply([{ ...snapshot, ...change }])
    await expect(readPublicSnapshots()).rejects.toThrow()
  })
})

describe('public analytics client', () => {
  const body = { view: 'map', places: [] }

  it('reads one view anonymously from the exact analytics URL', async () => {
    const fetcher = reply(body)
    await expect(readPublicAnalytics(snapshot.id, 'map')).resolves.toEqual(body)
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/public/projects/${snapshot.id}/analytics/map`,
    )
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  })

  it('answers not found for a malformed id without calling the API', async () => {
    const fetcher = reply(body)
    await expect(readPublicAnalytics('not-a-uuid', 'map')).rejects.toThrow('PUBLIC_NOT_FOUND')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    [404, 'PUBLIC_NOT_FOUND'],
    [503, 'PUBLIC_UNAVAILABLE'],
  ])('maps status %s to %s', async (status, message) => {
    reply({}, status)
    await expect(readPublicAnalytics(snapshot.id, 'kpi')).rejects.toThrow(message)
  })

  it('refuses a body that is not the requested view', async () => {
    reply(body)
    await expect(readPublicAnalytics(snapshot.id, 'kpi')).rejects.toThrow()
  })
})

describe('public analytics visitor forwarding', () => {
  const token = 'f'.repeat(64)
  const sentHeaders = async () => {
    const fetcher = reply({ view: 'map', places: [] })
    await readPublicAnalytics(snapshot.id, 'map')
    return (fetcher.mock.calls[0]?.[1] as { headers?: Record<string, string> }).headers
  }

  it('sends the visitor address and token on Vercel when the token is set', async () => {
    vi.stubEnv('VERCEL', '1')
    webEnv.VISITOR_FORWARD_TOKEN = token
    incoming.realIp = '203.0.113.7'
    expect(await sentHeaders()).toEqual({
      'x-pathways-visitor-address': '203.0.113.7',
      'x-pathways-visitor-token': token,
    })
  })

  it.each([
    ['the token is empty', () => ({ vercel: '1', token: '', ip: '203.0.113.7' })],
    ['it is not on Vercel', () => ({ vercel: '', token, ip: '203.0.113.7' })],
    ['the visitor address is unknown', () => ({ vercel: '1', token, ip: null })],
    ['the visitor address is not an address', () => ({ vercel: '1', token, ip: 'evil, 1.1.1.1' })],
  ])('sends nothing extra when %s', async (_label, setup) => {
    const { vercel, token: configured, ip } = setup()
    vi.stubEnv('VERCEL', vercel)
    webEnv.VISITOR_FORWARD_TOKEN = configured
    incoming.realIp = ip
    expect(await sentHeaders()).toBeUndefined()
  })

  it('never sends the token with the snapshot reads', async () => {
    vi.stubEnv('VERCEL', '1')
    webEnv.VISITOR_FORWARD_TOKEN = token
    incoming.realIp = '203.0.113.7'
    const fetcher = reply([snapshot])
    await readPublicSnapshots()
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('headers')
  })
})
