import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('./pathways-client', () => ({
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
        'x-content-type-options': nosniff,
        'content-disposition': `attachment; filename="${name}"`,
      },
    }),
  )
const inspect = () => privateProofClient.inspect('p', context, id, new AbortController().signal)
beforeEach(() => request.mockReset())

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
})
