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

import { beneficiaryMediaClient } from './beneficiary-media'

const projectId = '79600000-0000-4000-8000-000000000001'
const beneficiaryId = '79600000-0000-4000-8000-000000000002'
const mediaId = '79600000-0000-4000-8000-000000000003'
const path = `/beneficiaries/projects/${projectId}/${beneficiaryId}/media`
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}

describe('beneficiaryMediaClient beneficiary media requests', () => {
  beforeEach(() => {
    request.requestFoundation.mockReset()
    request.requestFoundationResponse.mockReset()
  })

  it('lists the media and refuses an answer that is not a list', async () => {
    request.requestFoundation.mockResolvedValue([{ id: mediaId }])
    await expect(
      beneficiaryMediaClient.listBeneficiaryMedia(projectId, beneficiaryId),
    ).resolves.toEqual([{ id: mediaId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(path)
    request.requestFoundation.mockResolvedValue({})
    await expect(
      beneficiaryMediaClient.listBeneficiaryMedia(projectId, beneficiaryId),
    ).rejects.toThrow('Invalid beneficiary media response.')
  })

  it('reads the limits and refuses a negative or missing number', async () => {
    const limits = { maxFiles: 10, maxFileBytes: 5_242_880, contentTypes: ['image/jpeg'] }
    request.requestFoundation.mockResolvedValue(limits)
    await expect(
      beneficiaryMediaClient.getBeneficiaryMediaLimits(projectId, beneficiaryId),
    ).resolves.toEqual(limits)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/limits`)
    for (const bad of [{ ...limits, maxFiles: -1 }, { maxFileBytes: 1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(
        beneficiaryMediaClient.getBeneficiaryMediaLimits(projectId, beneficiaryId),
      ).rejects.toThrow('Invalid beneficiary media limits response.')
    }
  })

  it('reserves the files and returns the reserved list or refuses an answer without one', async () => {
    const reserved = [{ mediaId, ...file, uploadUrl: null }]
    request.requestFoundation.mockResolvedValue({ files: reserved })
    const input = { files: [file], note: 'Workshop' }
    await expect(
      beneficiaryMediaClient.reserveBeneficiaryMedia(projectId, beneficiaryId, input),
    ).resolves.toEqual(reserved)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/reservations`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    request.requestFoundation.mockResolvedValue({})
    await expect(
      beneficiaryMediaClient.reserveBeneficiaryMedia(projectId, beneficiaryId, input),
    ).rejects.toThrow('Invalid beneficiary media reservation response.')
  })

  it('finalizes by an encoded id and downloads the content as a blob', async () => {
    request.requestFoundation.mockResolvedValue(undefined)
    await beneficiaryMediaClient.finalizeBeneficiaryMedia(projectId, beneficiaryId, 'a b')
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/a%20b/finalize`, {
      method: 'POST',
    })
    const blob = new Blob(['bytes'])
    request.requestFoundationResponse.mockResolvedValue({ blob: async () => blob })
    await expect(
      beneficiaryMediaClient.getBeneficiaryMediaBlob(projectId, beneficiaryId, mediaId),
    ).resolves.toBe(blob)
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(`${path}/${mediaId}/content`)
  })
})
