import { describe, expect, it } from 'vitest'

import {
  beneficiaryMediaItemResponse,
  beneficiaryMediaLimitsResponse,
  beneficiaryMediaReservationResponse,
} from './beneficiary-media-responses'

const uuid = '10000000-0000-4000-8000-000000000001'

describe('beneficiary media response contracts', () => {
  it('accepts a ready file, the limits and a reservation with a skipped upload url', () => {
    const item = {
      id: uuid,
      type: 'PHOTO',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      description: null,
      submittedAt: '2026-09-01T00:00:00.000Z',
      submittedBy: 'Fictional Officer',
      storageReady: true,
    }
    expect(beneficiaryMediaItemResponse.safeParse(item).success).toBe(true)
    const limits = { maxFiles: 10, maxFileBytes: 5_242_880, contentTypes: ['image/jpeg'] }
    expect(beneficiaryMediaLimitsResponse.safeParse(limits).success).toBe(true)
    const file = {
      mediaId: uuid,
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: 'a'.repeat(64),
      uploadUrl: null,
    }
    expect(beneficiaryMediaReservationResponse.safeParse({ files: [file] }).success).toBe(true)
  })

  it('rejects a file type outside the stored evidence types', () => {
    const item = { id: uuid, type: 'AUDIO' }
    expect(beneficiaryMediaItemResponse.safeParse(item).success).toBe(false)
  })
})
