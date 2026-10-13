import { describe, expect, it } from 'vitest'

import {
  MAX_BENEFICIARY_MEDIA_FILES,
  beneficiaryMediaContentTypes,
  reserveBeneficiaryMediaRequest,
} from './beneficiary-media-requests'

const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1,
  sha256: 'a'.repeat(64),
}

describe('beneficiary media request contract', () => {
  it('allows the activity evidence types except documents, up to ten files', () => {
    expect(beneficiaryMediaContentTypes).not.toContain('application/pdf')
    expect(beneficiaryMediaContentTypes).toContain('video/webm')
    expect(MAX_BENEFICIARY_MEDIA_FILES).toBe(10)
  })

  it.each([
    { files: [{ ...file, contentType: 'application/pdf' }] },
    { files: [{ ...file, fileName: 'a/b.jpg' }] },
    { files: Array.from({ length: 11 }, () => file) },
    { files: [file], note: 'x'.repeat(501) },
  ])('rejects %j', (body) => {
    expect(reserveBeneficiaryMediaRequest.safeParse(body).success).toBe(false)
  })

  it('accepts a backslash in a file name, as the DTO did', () => {
    const body = { files: [{ ...file, fileName: 'a\\b.jpg' }] }
    expect(reserveBeneficiaryMediaRequest.parse(body)).toEqual(body)
  })
})
