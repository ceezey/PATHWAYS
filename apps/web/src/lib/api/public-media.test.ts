// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  requestFoundation: vi.fn(),
  requestFoundationResponse: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
  requestFoundationResponse: request.requestFoundationResponse,
}))

import { publicMediaClient } from './public-media'

const projectId = '79700000-0000-4000-8000-000000000001'
const mediaId = '79700000-0000-4000-8000-000000000003'
const path = `/projects/${projectId}/public-media`
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}
const item = {
  id: mediaId,
  type: 'PHOTO',
  contentType: 'image/jpeg',
  fileName: 'photo.jpg',
  source: 'UPLOAD',
  status: 'PENDING',
  publicStatus: 'FOR_REVIEW',
  submittedById: '79700000-0000-4000-8000-000000000004',
  publicSubmittedById: '79700000-0000-4000-8000-000000000004',
  rejectionReason: null,
  pickable: false,
}

describe('publicMediaClient staff media requests', () => {
  beforeEach(() => {
    request.requestFoundation.mockReset()
    request.requestFoundationResponse.mockReset()
  })

  it('lists the media with the abort signal and refuses an answer that is not a list', async () => {
    const signal = new AbortController().signal
    const body = { items: [item], beneficiaryMediaNeedsStepUp: true }
    request.requestFoundation.mockResolvedValue(body)
    await expect(publicMediaClient.list(projectId, signal)).resolves.toEqual(body)
    expect(request.requestFoundation).toHaveBeenCalledWith(path, { signal })
    request.requestFoundation.mockResolvedValue({ items: [item] })
    await expect(publicMediaClient.list(projectId)).rejects.toThrow(
      'Invalid public media response.',
    )
    request.requestFoundation.mockResolvedValue({
      items: [{ id: 1 }],
      beneficiaryMediaNeedsStepUp: false,
    })
    await expect(publicMediaClient.list(projectId)).rejects.toThrow(
      'Invalid public media response.',
    )
  })

  it('refuses a project id that is not a UUID before any request', async () => {
    await expect(publicMediaClient.list('../x')).rejects.toThrow()
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('reads the limits and refuses a negative or missing number', async () => {
    const limits = { maxFiles: 10, maxFileBytes: 5_242_880, contentTypes: ['image/jpeg'] }
    request.requestFoundation.mockResolvedValue(limits)
    await expect(publicMediaClient.limits(projectId)).resolves.toEqual(limits)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/limits`)
    for (const bad of [{ ...limits, maxFiles: -1 }, { maxFileBytes: 1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(publicMediaClient.limits(projectId)).rejects.toThrow(
        'Invalid public media limits response.',
      )
    }
  })

  it('reserves the files and returns the reserved list or refuses an answer without one', async () => {
    const reserved = [{ mediaId, ...file, uploadUrl: 'https://upload.example/x' }]
    request.requestFoundation.mockResolvedValue({ files: reserved })
    await expect(publicMediaClient.reserve(projectId, { files: [file] })).resolves.toEqual(reserved)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/reservations`, {
      method: 'POST',
      body: JSON.stringify({ files: [file] }),
    })
    request.requestFoundation.mockResolvedValue({})
    await expect(publicMediaClient.reserve(projectId, { files: [file] })).rejects.toThrow(
      'Invalid public media reservation response.',
    )
  })

  it.each(['finalize', 'submit', 'approve'] as const)('posts %s by an encoded id', async (step) => {
    request.requestFoundation.mockResolvedValue({})
    await publicMediaClient[step](projectId, 'a b')
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/a%20b/${step}`, {
      method: 'POST',
    })
  })

  it('rejects with the reason in the body', async () => {
    request.requestFoundation.mockResolvedValue({})
    await publicMediaClient.reject(projectId, mediaId, 'Shows a minor')
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/${mediaId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Shows a minor' }),
    })
  })

  it('downloads the content as a blob', async () => {
    const blob = new Blob(['bytes'])
    request.requestFoundationResponse.mockResolvedValue({ blob: async () => blob })
    const { signal } = new AbortController()
    await expect(publicMediaClient.contentBlob(projectId, mediaId, signal)).resolves.toBe(blob)
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(`${path}/${mediaId}/content`, {
      signal,
    })
  })
})
