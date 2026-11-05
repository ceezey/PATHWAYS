import 'reflect-metadata'

import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import { PublicMediaStreamService } from './public-media-stream.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const mediaId = '50000000-0000-4000-8000-000000000005'
const objectKey = `organizations/${organizationId}/projects/${projectId}/evidence/${mediaId}/clip.mp4`

const queryRaw = vi.fn()
const release = vi.fn()
const readRange = vi.fn()
const streamer = vi.fn(() => ({ release }))
const rangeReader = vi.fn(() => readRange)
const service = new PublicMediaStreamService(
  { $queryRaw: queryRaw } as unknown as PrismaService,
  {
    createPrivateObjectStreamer: streamer,
    createPrivateRangeReader: rangeReader,
  } as unknown as PrivateStorageFactories,
)

const live = (contentType: string, byteSize = 1000) => ({
  media: { bucket: 'pathways-private', objectKey, contentType, byteSize, sha256: 'a'.repeat(64) },
})

beforeEach(() => {
  vi.clearAllMocks()
  release.mockResolvedValue(Readable.from([Buffer.from('x')]))
  readRange.mockResolvedValue(Readable.from([Buffer.from('x')]))
})

describe('public media stream', () => {
  it('not live gives 404', async () => {
    queryRaw.mockResolvedValue([{ media: null }])
    await expect(service.open(projectId, mediaId, undefined)).rejects.toMatchObject({
      status: 404,
      message: 'Media unavailable.',
    })
  })

  it('a malformed id gives 404 without a query', async () => {
    await expect(service.open('nope', mediaId, undefined)).rejects.toMatchObject({ status: 404 })
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('a database error gives 503', async () => {
    queryRaw.mockRejectedValue(new Error('db down'))
    await expect(service.open(projectId, mediaId, undefined)).rejects.toMatchObject({
      status: 503,
    })
  })

  it('full image stream', async () => {
    queryRaw.mockResolvedValue([live('image/jpeg')])
    const result = await service.open(projectId, mediaId, undefined)
    expect(result).toMatchObject({ status: 200, contentType: 'image/jpeg', length: 1000 })
    expect(result.contentRange).toBeUndefined()
    expect(release).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        evidenceId: mediaId,
        expectedBytes: 1000,
      }),
    )
  })

  it('video range 0-1 gives 206 with Content-Range bytes 0-1/<size>', async () => {
    queryRaw.mockResolvedValue([live('video/mp4', 5000)])
    const result = await service.open(projectId, mediaId, 'bytes=0-1')
    expect(result).toMatchObject({
      status: 206,
      contentRange: 'bytes 0-1/5000',
      length: 2,
      contentType: 'video/mp4',
    })
    expect(readRange).toHaveBeenCalledWith({
      bucket: 'pathways-private',
      objectKey,
      start: 0,
      end: 1,
    })
    expect(release).not.toHaveBeenCalled()
  })

  it('an open-ended or oversized range is clamped to the last byte', async () => {
    queryRaw.mockResolvedValue([live('video/mp4', 5000)])
    expect(await service.open(projectId, mediaId, 'bytes=4000-')).toMatchObject({
      contentRange: 'bytes 4000-4999/5000',
    })
    expect(await service.open(projectId, mediaId, 'bytes=4000-9999')).toMatchObject({
      contentRange: 'bytes 4000-4999/5000',
    })
  })

  it('caps every range at 4 MiB so bytes=0- on a large video gives a 4 MiB 206', async () => {
    const size = 50 * 1024 * 1024
    const cap = 4 * 1024 * 1024
    queryRaw.mockResolvedValue([live('video/mp4', size)])
    expect(await service.open(projectId, mediaId, 'bytes=0-')).toMatchObject({
      status: 206,
      length: cap,
      contentRange: `bytes 0-${cap - 1}/${size}`,
    })
    expect(readRange).toHaveBeenLastCalledWith(expect.objectContaining({ start: 0, end: cap - 1 }))
    expect(await service.open(projectId, mediaId, `bytes=${size - 10}-`)).toMatchObject({
      length: 10,
      contentRange: `bytes ${size - 10}-${size - 1}/${size}`,
    })
    expect(await service.open(projectId, mediaId, 'bytes=100-199')).toMatchObject({
      length: 100,
      contentRange: `bytes 100-199/${size}`,
    })
  })

  it.each([
    ['bytes=5-1', 'video/mp4'],
    ['bytes=0-1,4-5', 'video/mp4'],
    ['bytes=5000-', 'video/mp4'],
    ['bytes=-5', 'video/mp4'],
    ['items=0-1', 'video/mp4'],
    ['bytes=0-1', 'image/jpeg'],
  ])('bad range gives 416: %s on %s', async (range, contentType) => {
    queryRaw.mockResolvedValue([live(contentType, 5000)])
    await expect(service.open(projectId, mediaId, range)).rejects.toMatchObject({ status: 416 })
    expect(readRange).not.toHaveBeenCalled()
  })

  it('a storage failure gives 503', async () => {
    queryRaw.mockResolvedValue([live('video/mp4', 5000)])
    readRange.mockRejectedValue(new Error('storage down'))
    await expect(service.open(projectId, mediaId, 'bytes=0-1')).rejects.toMatchObject({
      status: 503,
    })
  })

  it('each request re-reads p86_public_media', async () => {
    queryRaw.mockResolvedValue([live('image/jpeg')])
    await service.open(projectId, mediaId, undefined)
    await service.open(projectId, mediaId, undefined)
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
