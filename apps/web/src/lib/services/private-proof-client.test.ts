import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('./pathways-client', () => ({
  PathwaysClientError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message)
    }
  },
  requestFoundation: vi.fn(),
  requestFoundationResponse: request,
}))
import { privateProofClient } from './private-proof-client'

const iso = '2026-09-27T00:00:00.000Z'
const id = '50000000-0000-4000-8000-000000000005'
const context = {
  activityId: id,
  updateId: id,
  expectedActivityUpdatedAt: iso,
  expectedUpdateUpdatedAt: iso,
  proofs: [{ id, label: 'Activity proof' as const, expectedEvidenceUpdatedAt: iso }],
}
const respond = (type: string, name: string, nosniff = 'nosniff') =>
  request.mockResolvedValue(
    new Response('abc', {
      headers: {
        'content-type': type,
        'content-length': '3',
        'x-content-type-options': nosniff,
        'content-disposition': `attachment; filename="${name}"`,
      },
    }),
  )
const inspect = () => privateProofClient.inspect('p', context, id, new AbortController().signal)
beforeEach(() => request.mockReset())
const oversize = 10 * 1024 * 1024 + 1

describe('privateProofClient.inspect', () => {
  it.each([
    ['application/pdf', 'pdf'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['video/mp4', 'mp4'],
    ['video/quicktime', 'mov'],
    ['video/webm', 'webm'],
    ['application/octet-stream', 'bin'],
  ])('accepts %s as activity-proof.%s', async (type, ext) => {
    respond(type, `activity-proof.${ext}`)
    const file = await inspect()
    expect(file.fileName).toBe(`activity-proof.${ext}`)
    expect(file.blob.type).toBe(type)
  })
  it.each([
    ['text/html', 'activity-proof.html', 'nosniff'],
    ['image/svg+xml', 'activity-proof.svg', 'nosniff'],
    ['application/pdf', 'activity-proof.bin', 'nosniff'],
    ['application/pdf', 'activity-proof.pdf', ''],
  ])('rejects %s with %s and nosniff %s', async (type, name, nosniff) => {
    respond(type, name, nosniff)
    await expect(inspect()).rejects.toThrow('Private proof unavailable.')
  })
  it.each([String(oversize), 'abc', '0', ''])(
    'cancels the body without reading it for content-length %j',
    async (length) => {
      const cancel = vi.fn(async () => undefined)
      const blob = vi.fn()
      const headers = new Headers({
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'attachment; filename="activity-proof.pdf"',
      })
      if (length) headers.set('content-length', length)
      request.mockResolvedValue({ headers, body: { cancel }, blob })
      await expect(inspect()).rejects.toThrow('larger than 10 MiB')
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(blob).not.toHaveBeenCalled()
    },
  )
  it('rejects an oversize body even when content-length understates it', async () => {
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-length': '3',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'attachment; filename="activity-proof.pdf"',
    })
    request.mockResolvedValue({
      headers,
      body: { cancel: vi.fn() },
      blob: async () => ({ size: oversize, type: 'application/pdf' }),
    })
    await expect(inspect()).rejects.toThrow('larger than 10 MiB')
  })
})
