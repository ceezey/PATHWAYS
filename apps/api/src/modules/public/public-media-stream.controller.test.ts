import 'reflect-metadata'

import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { NotFoundException } from '@nestjs/common'
import { HEADERS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it, vi } from 'vitest'

import { PublicMediaStreamController } from './public-media-stream.controller'
import { type PublicMediaStreamService, RangeNotSatisfiable } from './public-media-stream.service'

const projectId = '20000000-0000-4000-8000-000000000002'
const mediaId = '50000000-0000-4000-8000-000000000005'

const open = vi.fn()
const controller = new PublicMediaStreamController({ open } as unknown as PublicMediaStreamService)
const mockResponse = () => {
  const headers: Record<string, string> = {}
  const response = {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
  }
  return { response: response as unknown as ServerResponse, headers, raw: response }
}
const result = (overrides = {}) => ({
  status: 200,
  body: Readable.from([Buffer.from('x')]),
  contentType: 'image/jpeg',
  length: 1,
  isVideo: false,
  contentRange: undefined,
  ...overrides,
})

describe('public media stream controller', () => {
  it('declares no-store, nosniff and cross-origin resource policy headers on the route', () => {
    const declared: Array<{ name: string; value: string }> = Reflect.getMetadata(
      HEADERS_METADATA,
      PublicMediaStreamController.prototype.get,
    )
    expect(declared).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'no-store' },
        { name: 'X-Content-Type-Options', value: 'nosniff' },
        { name: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ]),
    )
  })

  it('full image keeps status 200 and sets no range headers', async () => {
    open.mockResolvedValue(result())
    const { response, headers, raw } = mockResponse()
    const file = await controller.get(projectId, mediaId, undefined, response)
    expect(open).toHaveBeenLastCalledWith(projectId, mediaId, undefined)
    expect(raw.statusCode).toBe(200)
    expect(headers['Accept-Ranges']).toBeUndefined()
    expect(headers['Content-Range']).toBeUndefined()
    expect(file.getHeaders()).toMatchObject({ type: 'image/jpeg', length: 1 })
  })

  it('video range gives 206 with Content-Range and Accept-Ranges', async () => {
    open.mockResolvedValue(
      result({
        status: 206,
        contentType: 'video/mp4',
        length: 2,
        isVideo: true,
        contentRange: 'bytes 0-1/5000',
      }),
    )
    const { response, headers, raw } = mockResponse()
    const file = await controller.get(projectId, mediaId, 'bytes=0-1', response)
    expect(open).toHaveBeenLastCalledWith(projectId, mediaId, 'bytes=0-1')
    expect(raw.statusCode).toBe(206)
    expect(headers['Content-Range']).toBe('bytes 0-1/5000')
    expect(headers['Accept-Ranges']).toBe('bytes')
    expect(file.getHeaders()).toMatchObject({ type: 'video/mp4', length: 2 })
  })

  it('a 416 names the full size in Content-Range and rethrows', async () => {
    open.mockRejectedValue(new RangeNotSatisfiable(5000))
    const { response, headers } = mockResponse()
    await expect(controller.get(projectId, mediaId, 'bytes=abc', response)).rejects.toMatchObject({
      status: 416,
    })
    expect(headers['Content-Range']).toBe('bytes */5000')
  })

  it('other errors set no Content-Range', async () => {
    open.mockRejectedValue(new NotFoundException('Media unavailable.'))
    const { response, headers } = mockResponse()
    await expect(controller.get(projectId, mediaId, 'bytes=0-1', response)).rejects.toMatchObject({
      status: 404,
    })
    expect(headers['Content-Range']).toBeUndefined()
  })

  it('full video offers ranges at status 200', async () => {
    open.mockResolvedValue(result({ contentType: 'video/mp4', isVideo: true }))
    const { response, headers, raw } = mockResponse()
    await controller.get(projectId, mediaId, undefined, response)
    expect(raw.statusCode).toBe(200)
    expect(headers['Accept-Ranges']).toBe('bytes')
    expect(headers['Content-Range']).toBeUndefined()
  })
})
