import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivateInspectionReadError, createPrivateRangeReader } from './private-inspection-reader'

const config = {
  serviceOrigin: 'https://service.invalid',
  serviceRoleKey: 'synthetic-only-key',
  evidenceBucket: 'pathways-private',
}
const object = {
  bucket: 'pathways-private',
  objectKey: 'organizations/o/clip.mp4',
  start: 0,
  end: 3,
}
const respond = (body: string, status = 206, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers })
const read = async (stream: AsyncIterable<Buffer>) => {
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(part)
  return Buffer.concat(parts).toString()
}

afterEach(() => vi.unstubAllGlobals())

describe('createPrivateRangeReader', () => {
  it('requests the range with the service credentials and streams a 206 of the right length', async () => {
    const fetchMock = vi.fn(async () => respond('abcd'))
    vi.stubGlobal('fetch', fetchMock)
    const stream = await createPrivateRangeReader(config)(object)
    expect(await read(stream)).toBe('abcd')
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://service.invalid/storage/v1/object/authenticated/pathways-private/organizations/o/clip.mp4',
    )
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer synthetic-only-key',
      Range: 'bytes=0-3',
    })
  })

  it('rejects a 200 answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond('abcd', 200)),
    )
    await expect(createPrivateRangeReader(config)(object)).rejects.toThrow(
      PrivateInspectionReadError,
    )
  })

  it('rejects an advertised length that differs from the range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond('abcdef', 206, { 'content-length': '6' })),
    )
    await expect(createPrivateRangeReader(config)(object)).rejects.toThrow(
      PrivateInspectionReadError,
    )
  })

  it('errors the stream when the body is shorter than the range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond('ab')),
    )
    const stream = await createPrivateRangeReader(config)(object)
    await expect(read(stream)).rejects.toThrow(PrivateInspectionReadError)
  })

  it('rejects another bucket, an unsafe key and an inverted range without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const reader = createPrivateRangeReader(config)
    for (const bad of [
      { ...object, bucket: 'other' },
      { ...object, objectKey: 'organizations/../clip.mp4' },
      { ...object, start: 5, end: 1 },
    ])
      await expect(reader(bad)).rejects.toThrow(PrivateInspectionReadError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
