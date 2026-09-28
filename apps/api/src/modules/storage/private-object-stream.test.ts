import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PrivateInspectionReadError,
  createPrivateObjectStreamer,
  createPrivateUploadVerifier,
  matchesEvidenceSignature,
} from './private-inspection-reader'

// Synthetic transports only; no request leaves the process.
const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  evidenceId: '00000000-0000-4000-8000-000000000003',
}
const config = {
  serviceOrigin: 'https://service.invalid',
  serviceRoleKey: 'synthetic-only-key',
  evidenceBucket: 'pathways-private',
  maxBytes: 50 * 1024 * 1024,
  storageDeadlineMs: 60_000,
}
const key = (extension: string) =>
  `organizations/${ids.organizationId}/projects/${ids.projectId}/evidence/${ids.evidenceId}/proof${extension}`
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const bucket = () => new Response(JSON.stringify({ id: config.evidenceBucket, public: false }))
type Call = [string, RequestInit]

const ascii = (text: string) => Buffer.from(text, 'latin1')
const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), ascii(`ftyp${brand}`), Buffer.alloc(12)])
const webm = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81,
  0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
])
const samples: Array<[string, string, Buffer]> = [
  ['image/jpeg', '.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])],
  ['image/png', '.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
  ['image/webp', '.webp', Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WEBPVP8 ')])],
  ['application/pdf', '.pdf', ascii('%PDF-1.7\n%synthetic')],
  ['video/mp4', '.mp4', Buffer.concat([ftyp('isom'), Buffer.alloc(40)])],
  ['video/quicktime', '.mov', Buffer.concat([ftyp('qt  '), Buffer.alloc(40)])],
  ['video/webm', '.webm', Buffer.concat([webm, Buffer.alloc(40)])],
]

/** HEAD, range and full reads answered from one in-memory synthetic object. */
function objectTransport(object: Buffer, overrides: { headLength?: string; status?: number } = {}) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/storage/v1/bucket/')) return bucket()
    if (init?.method === 'HEAD')
      return new Response(null, {
        status: overrides.status ?? 200,
        headers: { 'content-length': overrides.headLength ?? String(object.length) },
      })
    const range = (init?.headers as Record<string, string>).Range
    if (range) {
      const end = Number(/^bytes=0-(\d+)$/.exec(range)?.[1])
      return new Response(object.subarray(0, end + 1), { status: 206 })
    }
    return new Response(object)
  })
}
const verification = (object: Buffer, contentType: string, extension: string, extra = {}) => ({
  ...ids,
  bucket: config.evidenceBucket,
  objectKey: key(extension),
  expectedBytes: object.length,
  expectedSha256: hash(object),
  contentType,
  signal: new AbortController().signal,
  deadlineMonotonicMs: performance.now() + 60_000,
  ...extra,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('finalize verification of a directly uploaded private object', () => {
  it.each(samples)('verifies %s by size, leading bytes and streamed digest', async (type, ext, bytes) => {
    const transport = objectTransport(bytes)
    vi.stubGlobal('fetch', transport)
    await expect(createPrivateUploadVerifier(config)(verification(bytes, type, ext))).resolves.toBe(
      'VERIFIED',
    )
    const calls = transport.mock.calls as unknown as Call[]
    expect(calls.map(([, init]) => init.method)).toEqual(['GET', 'HEAD', 'GET', 'GET', 'GET'])
    const objectUrl = `https://service.invalid/storage/v1/object/pathways-private/${key(ext)}`
    expect(calls.slice(1, 4).every(([url]) => url === objectUrl)).toBe(true)
    expect((calls[2][1].headers as Record<string, string>).Range).toBe(
      `bytes=0-${Math.min(64, bytes.length) - 1}`,
    )
    for (const [, init] of calls) expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' })
  })

  it('rejects a spoofed type (declared MP4, actually HTML) before hashing the object', async () => {
    const html = ascii('<!DOCTYPE html><html><body>synthetic</body></html>')
    const transport = objectTransport(html)
    vi.stubGlobal('fetch', transport)
    await expect(
      createPrivateUploadVerifier(config)(verification(html, 'video/mp4', '.mp4')),
    ).resolves.toBe('TYPE_MISMATCH')
    expect(transport).toHaveBeenCalledTimes(3)
  })

  it('reports a stored size mismatch from HEAD without reading the body', async () => {
    const bytes = samples[3][2]
    const transport = objectTransport(bytes, { headLength: String(bytes.length + 1) })
    vi.stubGlobal('fetch', transport)
    await expect(
      createPrivateUploadVerifier(config)(verification(bytes, 'application/pdf', '.pdf')),
    ).resolves.toBe('SIZE_MISMATCH')
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('reports a body longer than declared as a size mismatch, counted independently of HEAD', async () => {
    const bytes = samples[3][2]
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== 'HEAD' && !url.includes('/bucket/') && !(init?.headers as Record<string, string>).Range)
        return new Response(Buffer.concat([bytes, ascii('extra')]))
      return objectTransport(bytes)(url, init)
    })
    vi.stubGlobal('fetch', transport)
    await expect(
      createPrivateUploadVerifier(config)(verification(bytes, 'application/pdf', '.pdf')),
    ).resolves.toBe('SIZE_MISMATCH')
  })

  it('reports a digest mismatch', async () => {
    const bytes = samples[3][2]
    vi.stubGlobal('fetch', objectTransport(bytes))
    await expect(
      createPrivateUploadVerifier(config)(
        verification(bytes, 'application/pdf', '.pdf', { expectedSha256: 'f'.repeat(64) }),
      ),
    ).resolves.toBe('DIGEST_MISMATCH')
  })

  it.each([400, 404])('reports a missing object (HEAD %i) as missing', async (status) => {
    const bytes = samples[0][2]
    vi.stubGlobal('fetch', objectTransport(bytes, { status }))
    await expect(
      createPrivateUploadVerifier(config)(verification(bytes, 'image/jpeg', '.jpg')),
    ).resolves.toBe('OBJECT_MISSING')
  })

  it('treats a provider failure as unavailable, never as a verdict', async () => {
    const bytes = samples[0][2]
    vi.stubGlobal('fetch', objectTransport(bytes, { status: 500 }))
    await expect(
      createPrivateUploadVerifier(config)(verification(bytes, 'image/jpeg', '.jpg')),
    ).rejects.toBeInstanceOf(PrivateInspectionReadError)
  })

  it('rejects a declared size over the configured bound or a foreign key before any request', async () => {
    const transport = objectTransport(samples[0][2])
    vi.stubGlobal('fetch', transport)
    const verify = createPrivateUploadVerifier({ ...config, maxBytes: 1024 * 1024 })
    await expect(
      verify(verification(samples[0][2], 'image/jpeg', '.jpg', { expectedBytes: 1024 * 1024 + 1 })),
    ).rejects.toBeInstanceOf(PrivateInspectionReadError)
    await expect(
      verify(
        verification(samples[0][2], 'image/jpeg', '.jpg', {
          objectKey: key('.jpg').replace(ids.evidenceId, '00000000-0000-4000-8000-000000000009'),
        }),
      ),
    ).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects configuration above the 100 MiB ceiling or 60 s storage deadline', () => {
    expect(() => createPrivateUploadVerifier({ ...config, maxBytes: 104_857_601 })).toThrow(
      PrivateInspectionReadError,
    )
    expect(() => createPrivateUploadVerifier({ ...config, storageDeadlineMs: 60_001 })).toThrow(
      PrivateInspectionReadError,
    )
  })

  it('matches only allow-listed signatures', () => {
    expect(matchesEvidenceSignature('video/mp4', Buffer.concat([ftyp('XXXX'), Buffer.alloc(8)]))).toBe(false)
    expect(matchesEvidenceSignature('video/webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88]))).toBe(false)
    expect(matchesEvidenceSignature('image/gif', ascii('GIF89a'))).toBe(false)
    expect(matchesEvidenceSignature('image/png', ascii('%PDF-1.7'))).toBe(false)
  })
})

describe('streamed inspection of a large private object', () => {
  const chunkSize = 64 * 1024
  const totalBytes = 40 * 1024 * 1024
  const chunkAt = (index: number) => {
    const chunk = Buffer.alloc(chunkSize, index % 251)
    if (index === 0) ftyp('isom').copy(chunk)
    return chunk
  }
  const expected = (() => {
    const digest = createHash('sha256')
    for (let index = 0; index < totalBytes / chunkSize; index++) digest.update(chunkAt(index))
    return digest.digest('hex')
  })()
  /** Lazily generated 40 MB MP4 body; `produced` tracks bytes handed to the reader. */
  const lazyObject = (meter: { produced: number }, corruptLast = false) => {
    let index = 0
    const count = totalBytes / chunkSize
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= count) return controller.close()
        const chunk = chunkAt(index)
        if (corruptLast && index === count - 1) chunk[0] ^= 0xff
        index++
        meter.produced += chunk.length
        controller.enqueue(chunk)
      },
    })
  }
  const context = () => ({
    ...ids,
    bucket: config.evidenceBucket,
    objectKey: key('.mp4'),
    expectedBytes: totalBytes,
    expectedSha256: expected,
    signal: new AbortController().signal,
    deadlineMonotonicMs: performance.now() + 60_000,
  })

  it('verifies and releases a 40 MB MP4 in bounded chunks without buffering the object', async () => {
    const meter = { produced: 0 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/bucket/') ? bucket() : new Response(lazyObject(meter)),
      ),
    )
    const allocations: number[] = []
    const alloc = Buffer.alloc
    vi.spyOn(Buffer, 'alloc').mockImplementation((size, ...rest) => {
      allocations.push(size)
      return alloc(size, ...(rest as []))
    })
    const streamer = createPrivateObjectStreamer(config)
    await streamer.verify(context())
    expect(meter.produced).toBe(totalBytes)
    meter.produced = 0
    const released = await streamer.release(context())
    const digest = createHash('sha256')
    let consumed = 0
    let maxInFlight = 0
    let chunks = 0
    for await (const chunk of released) {
      consumed += (chunk as Buffer).length
      chunks++
      digest.update(chunk as Buffer)
      maxInFlight = Math.max(maxInFlight, meter.produced - consumed)
    }
    expect(consumed).toBe(totalBytes)
    expect(digest.digest('hex')).toBe(expected)
    expect(chunks).toBeGreaterThan(100)
    // Never more than a few chunks between storage and the client: no whole-object buffer.
    expect(maxInFlight).toBeLessThanOrEqual(1024 * 1024)
    expect(Math.max(0, ...allocations.filter((size) => size > chunkSize))).toBeLessThan(
      1024 * 1024,
    )
  }, 30_000)

  it('withholds the final chunk and errors when the released object no longer verifies', async () => {
    const meter = { produced: 0 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/bucket/') ? bucket() : new Response(lazyObject(meter, true)),
      ),
    )
    const released = await createPrivateObjectStreamer(config).release(context())
    let consumed = 0
    await expect(
      (async () => {
        for await (const chunk of released) consumed += (chunk as Buffer).length
      })(),
    ).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(consumed).toBe(totalBytes - chunkSize)
  }, 30_000)

  it('verification pass rejects a digest mismatch and retains nothing', async () => {
    const meter = { produced: 0 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/bucket/') ? bucket() : new Response(lazyObject(meter, true)),
      ),
    )
    await expect(createPrivateObjectStreamer(config).verify(context())).rejects.toBeInstanceOf(
      PrivateInspectionReadError,
    )
  }, 30_000)

  it('stops reading storage when the client disconnects', async () => {
    const meter = { produced: 0 }
    const disconnected = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/bucket/') ? bucket() : new Response(lazyObject(meter)),
      ),
    )
    const released = await createPrivateObjectStreamer(config).release({
      ...context(),
      signal: disconnected.signal,
    })
    let consumed = 0
    await expect(
      (async () => {
        for await (const chunk of released) {
          consumed += (chunk as Buffer).length
          if (consumed >= 4 * chunkSize) disconnected.abort()
        }
      })(),
    ).rejects.toBeInstanceOf(PrivateInspectionReadError)
    expect(meter.produced).toBeLessThan(totalBytes / 4)
  }, 30_000)
})
