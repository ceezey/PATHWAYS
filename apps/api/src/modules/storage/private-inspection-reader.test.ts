import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PrivateInspectionReadError,
  createPrivateInspectionReader,
} from './private-inspection-reader'

const nativeFetch = globalThis.fetch
// Test-local dependency override only. Never opens a real connection.
const createSyntheticPrivateInspectionReader = (
  configuration: Parameters<typeof createPrivateInspectionReader>[0],
  dependencies: { fetch: typeof fetch; now: () => number },
) => {
  if (dependencies.fetch === nativeFetch) throw new PrivateInspectionReadError()
  vi.stubGlobal('fetch', dependencies.fetch)
  vi.spyOn(performance, 'now').mockImplementation(dependencies.now)
  return createPrivateInspectionReader(configuration)
}
const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  evidenceId: '00000000-0000-4000-8000-000000000003',
}
const config = {
  serviceOrigin: 'https://service.invalid',
  serviceRoleKey: 'synthetic-only-key',
  evidenceBucket: 'pathways-private',
}
const bytes = Buffer.from('synthetic proof')
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const input = (signal = new AbortController().signal) => ({
  ...ids,
  bucket: config.evidenceBucket,
  objectKey: `organizations/${ids.organizationId}/projects/${ids.projectId}/evidence/${ids.evidenceId}/proof.webp`,
  expectedBytes: bytes.length,
  expectedSha256: hash(bytes),
  signal,
  deadlineMonotonicMs: 30_000,
})
const bucket = (extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ id: config.evidenceBucket, public: false, ...extra }))
const stream = (chunks: Uint8Array[], cancel = vi.fn()) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
    cancel,
  })
const transport = (responses: Array<Response | Error>) =>
  vi.fn(async (_url: string, _options?: RequestInit) => {
    const response = responses.shift()
    if (response instanceof Error) throw response
    if (!response) throw new Error('Unexpected synthetic request')
    return response
  })
const reader = (fetchMock: ReturnType<typeof transport>, now = () => 0) =>
  createSyntheticPrivateInspectionReader(config, { fetch: fetchMock as typeof fetch, now })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('proposed bounded private storage companion (synthetic fetch only)', () => {
  it('requires private metadata before and after counted chunked verified bytes', async () => {
    const mock = transport([
      bucket(),
      new Response(stream([bytes.subarray(0, 4), bytes.subarray(4)])),
      bucket(),
    ])
    await expect(reader(mock)(input())).resolves.toEqual(bytes)
    expect(mock).toHaveBeenCalledTimes(3)
    expect(mock.mock.calls[0][0]).toBe('https://service.invalid/storage/v1/bucket/pathways-private')
    const calls = mock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[1][0]).toBe(
      `https://service.invalid/storage/v1/object/pathways-private/${input().objectKey}`,
    )
    for (const [, options] of calls) {
      expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })
      expect(options.headers).toMatchObject({
        apikey: 'synthetic-only-key',
        Authorization: 'Bearer synthetic-only-key',
      })
      expect(options.signal?.aborted).toBe(true) // Cleanup after successful full private recheck.
      expect(options.signal).toBe(calls[0][1].signal)
    }
  })

  it.each([
    { expectedBytes: 0 },
    { expectedBytes: 10 * 1024 * 1024 + 1 },
    { expectedBytes: 1.1 },
    { expectedSha256: '' },
    { expectedSha256: 'g'.repeat(64) },
    { bucket: 'other' },
    { organizationId: ids.projectId },
    { objectKey: '../proof.pdf' },
    { objectKey: input().objectKey.replace('/proof.webp', '/nested/proof.webp') },
    { objectKey: input().objectKey.replace('proof.webp', '..') },
    { objectKey: input().objectKey.replace('proof.webp', 'proof\\name.pdf') },
    { objectKey: input().objectKey.replace('proof.webp', 'proof\u0000.pdf') },
    { deadlineMonotonicMs: 0 },
    { deadlineMonotonicMs: Number.NaN },
  ])('rejects invalid internal context without any request: %j', async (changes) => {
    const mock = transport([])
    await expect(reader(mock)({ ...input(), ...changes })).rejects.toBeInstanceOf(
      PrivateInspectionReadError,
    )
    expect(mock).not.toHaveBeenCalled()
  })

  it.each(['\n', '\r', '\r\n'])(
    'rejects trailing line terminators before any fetch: %j',
    async (ending) => {
      const mock = transport([])
      await expect(
        reader(mock)({ ...input(), expectedSha256: hash(bytes) + ending }),
      ).rejects.toBeInstanceOf(PrivateInspectionReadError)
      await expect(
        reader(mock)({ ...input(), organizationId: ids.organizationId + ending }),
      ).rejects.toBeInstanceOf(PrivateInspectionReadError)
      await expect(
        reader(mock)({ ...input(), projectId: ids.projectId + ending }),
      ).rejects.toBeInstanceOf(PrivateInspectionReadError)
      await expect(
        reader(mock)({ ...input(), evidenceId: ids.evidenceId + ending }),
      ).rejects.toBeInstanceOf(PrivateInspectionReadError)
      expect(mock).not.toHaveBeenCalled()
    },
  )

  it('snapshots configuration and context primitives before awaits', async () => {
    const mutableConfig = { ...config }
    const mutableInput = input()
    const responses = [bucket(), new Response(bytes), bucket()]
    const mock = vi.fn(async (_url: string, _options: RequestInit) => {
      mutableInput.bucket = 'changed'
      mutableInput.objectKey = 'outside/private/secret'
      mutableInput.expectedBytes = 20 * 1024 * 1024
      mutableInput.expectedSha256 = 'f'.repeat(64)
      mutableInput.organizationId = ids.projectId
      mutableInput.projectId = ids.evidenceId
      mutableInput.evidenceId = ids.organizationId
      mutableInput.signal = new AbortController().signal
      mutableInput.deadlineMonotonicMs = 0
      mutableConfig.serviceOrigin = 'http://remote.invalid'
      mutableConfig.evidenceBucket = 'other'
      mutableConfig.serviceRoleKey = 'changed-token'
      const response = responses.shift()
      if (!response) throw new Error('Unexpected synthetic request')
      return response
    })
    const bounded = createSyntheticPrivateInspectionReader(mutableConfig, {
      fetch: mock as typeof fetch,
      now: () => 0,
    })
    await expect(bounded(mutableInput)).resolves.toEqual(bytes)
    expect(mock.mock.calls[1][0]).toContain(input().objectKey)
    expect(mock.mock.calls[2][0]).toBe('https://service.invalid/storage/v1/bucket/pathways-private')
    for (const [, options] of mock.mock.calls) {
      expect(options.headers).toMatchObject({ apikey: 'synthetic-only-key' })
      expect(options.signal).toBe(mock.mock.calls[0][1].signal)
    }
  })

  it('reads mutable getters exactly once before validation and I/O', async () => {
    const counts = new Map<string, number>()
    const getterObject = <T extends object>(source: T): T => {
      const result = {} as T
      for (const key of Object.keys(source) as Array<keyof T>) {
        Object.defineProperty(result, key, {
          get() {
            const name = String(key)
            const count = (counts.get(name) ?? 0) + 1
            counts.set(name, count)
            if (count > 1) throw new Error('Repeated sensitive getter')
            return source[key]
          },
        })
      }
      return result
    }
    const mock = transport([bucket(), new Response(bytes), bucket()])
    const bounded = createSyntheticPrivateInspectionReader(getterObject(config), {
      fetch: mock as typeof fetch,
      now: () => 0,
    })
    await expect(bounded(getterObject(input()))).resolves.toEqual(bytes)
    expect([...counts.values()].every((count) => count === 1)).toBe(true)
  })

  it('sanitizes throwing context getters before any request', async () => {
    const mock = transport([])
    const context = input()
    Object.defineProperty(context, 'expectedBytes', {
      get() {
        throw new Error('Private object value and key')
      },
    })
    await expect(reader(mock)(context)).rejects.toMatchObject({
      name: 'PrivateInspectionReadError',
      message: 'Private inspection storage is unavailable.',
    })
    expect(mock).not.toHaveBeenCalled()
  })

  it.each([
    'http://127.0.0.1:7777',
    'https://service.invalid/path',
    'https://service.invalid/..',
    'https://user:password@service.invalid',
    'https://service.invalid/?q=x',
    'https://service.invalid/#fragment',
  ])(
    'production rejects unsupported/ambiguous configured origins before native fetch: %s',
    (origin) => {
      const mock = vi.fn()
      vi.stubGlobal('fetch', mock)
      expect(() => createPrivateInspectionReader({ ...config, serviceOrigin: origin })).toThrow(
        PrivateInspectionReadError,
      )
      expect(mock).not.toHaveBeenCalled()
    },
  )

  it('test-local injection rejects native fetch and production rejects HTTP origins', () => {
    expect(() =>
      createSyntheticPrivateInspectionReader(config, { fetch: globalThis.fetch, now: () => 0 }),
    ).toThrow(PrivateInspectionReadError)
    expect(() =>
      createSyntheticPrivateInspectionReader(
        { ...config, serviceOrigin: 'http://remote.invalid' },
        { fetch: transport([]) as typeof fetch, now: () => 0 },
      ),
    ).toThrow(PrivateInspectionReadError)
  })

  it.each([
    bucket({ public: true }),
    bucket({ public: 'false' }),
    bucket({ id: 'other' }),
    new Response('not json'),
    new Response('[]'),
  ])('denies invalid/public initial metadata before object read', async (metadata) => {
    const mock = transport([metadata])
    await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('denies bucket made public after object transfer and releases no result', async () => {
    const mock = transport([bucket(), new Response(bytes), bucket({ public: true })])
    await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it.each([
    new Response(stream([Buffer.alloc(16 * 1024 + 1)])),
    new Response('{}', { headers: { 'content-length': String(16 * 1024 + 1) } }),
    new Response('{}', { headers: { 'content-length': 'broken' } }),
  ])(
    'bounds counted metadata and advertised metadata size before object request',
    async (metadata) => {
      const mock = transport([metadata])
      await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
      expect(mock).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    new Response(stream([bytes, Buffer.from('overflow')])),
    new Response(bytes.subarray(0, bytes.length - 1)),
    new Response(Buffer.alloc(bytes.length, 1)),
    new Response(bytes, { headers: { 'content-length': String(bytes.length + 1) } }),
    new Response(bytes, { headers: { 'content-length': '-1' } }),
  ])(
    'denies overflow, short body, digest mismatch or invalid advertised length',
    async (object) => {
      const mock = transport([bucket(), object])
      await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
      expect(mock).toHaveBeenCalledTimes(2)
    },
  )

  it('counts bytes independently when Content-Length falsely advertises fewer bytes', async () => {
    const mock = transport([
      bucket(),
      new Response(stream([bytes, Buffer.from('extra')]), { headers: { 'content-length': '1' } }),
    ])
    await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
  })

  it('does not buffer provider error bodies and sanitizes a private exception', async () => {
    const secret = new Error('provider URL key notes sensitive internal bytes')
    const mock = transport([secret])
    const error = await reader(mock)(input()).catch((value) => value)
    expect(error).toBeInstanceOf(PrivateInspectionReadError)
    expect(error.message).toBe('Private inspection storage is unavailable.')
    expect(error.cause).toBeUndefined()
    expect(String(error)).not.toContain('provider URL')
  })

  it('rejects HTTP redirects without consuming response bytes', async () => {
    const cancel = vi.fn()
    const object = new Response(new ReadableStream({ cancel }), {
      status: 302,
      headers: { location: 'https://private.invalid' },
    })
    const mock = transport([bucket(), object])
    await expect(reader(mock)(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('already aborted disconnect denies all storage', async () => {
    const disconnected = new AbortController()
    disconnected.abort()
    const mock = transport([])
    await expect(reader(mock)(input(disconnected.signal))).rejects.toBeInstanceOf(
      PrivateInspectionReadError,
    )
    expect(mock).not.toHaveBeenCalled()
  })

  it('disconnect cancels a pending counted object stream and never performs final metadata', async () => {
    const disconnected = new AbortController()
    const cancel = vi.fn()
    const stalled = new Response(new ReadableStream<Uint8Array>({ cancel }))
    const mock = transport([bucket(), stalled])
    const pending = reader(mock)(input(disconnected.signal))
    const rejected = expect(pending).rejects.toBeInstanceOf(PrivateInspectionReadError)
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2))
    disconnected.abort()
    await rejected
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(mock).toHaveBeenCalledTimes(2)
    expect((mock.mock.calls as unknown as Array<[string, RequestInit]>)[1][1].signal?.aborted).toBe(
      true,
    )
  })

  it('one ten-second timer includes a stalled initial connection, passes AbortSignal and disposes late response', async () => {
    vi.useFakeTimers()
    let resolve: ((value: Response) => void) | undefined
    const mock = vi.fn(
      (_url: string, _options: RequestInit) =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const pending = createSyntheticPrivateInspectionReader(config, {
      fetch: mock as typeof fetch,
      now: () => 0,
    })(input())
    const rejected = expect(pending).rejects.toBeInstanceOf(PrivateInspectionReadError)
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(mock.mock.calls[0][1].signal?.aborted).toBe(true)
    const cancel = vi.fn()
    resolve?.(new Response(new ReadableStream({ cancel })))
    await Promise.resolve()
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('all stages share monotonic deadline, so late post-body metadata is denied', async () => {
    let now = 0
    const mock = transport([bucket(), new Response(bytes), bucket()])
    const transportWithClock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const response = await (mock as unknown as typeof fetch)(...args)
      now += 3_500
      return response
    })
    const bounded = createSyntheticPrivateInspectionReader(config, {
      fetch: transportWithClock as typeof fetch,
      now: () => now,
    })
    await expect(bounded(input())).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(mock).toHaveBeenCalledTimes(3)
    expect(transportWithClock.mock.calls[0][1]?.signal).toBe(
      transportWithClock.mock.calls[2][1]?.signal,
    )
  })

  it('caller remaining deadline can shorten the ten-second storage timer', async () => {
    vi.useFakeTimers()
    const mock = vi.fn(() => new Promise<Response>(() => undefined))
    const bounded = createSyntheticPrivateInspectionReader(config, {
      fetch: mock as typeof fetch,
      now: () => 0,
    })
    const pending = bounded({ ...input(), deadlineMonotonicMs: 50 })
    const rejected = expect(pending).rejects.toBeInstanceOf(PrivateInspectionReadError)
    await vi.advanceTimersByTimeAsync(50)
    await rejected
    expect((mock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].signal?.aborted).toBe(
      true,
    )
  })
})
