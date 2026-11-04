import { describe, expect, it } from 'vitest'

import { beneficiaryMediaContentTypes } from '../beneficiaries/beneficiary-media-requests'
import {
  publicMediaContentTypes,
  publicMediaListResponse,
  publicMediaRejectRequest,
  reservePublicMediaRequest,
} from './public-media'

const file = {
  fileName: 'visit.jpg',
  contentType: 'image/jpeg',
  byteSize: 1000,
  sha256: 'a'.repeat(64),
}
const item = {
  id: '30000000-0000-4000-8000-000000000003',
  type: 'PHOTO',
  contentType: 'image/jpeg',
  fileName: 'visit.jpg',
  source: 'UPLOAD',
  status: 'PENDING',
  publicStatus: 'FOR_REVIEW',
  submittedById: '40000000-0000-4000-8000-000000000004',
  publicSubmittedById: '40000000-0000-4000-8000-000000000004',
  rejectionReason: null,
  pickable: false,
}

describe('public media contracts', () => {
  it('re-exports the beneficiary media content types', () => {
    expect(publicMediaContentTypes).toBe(beneficiaryMediaContentTypes)
  })

  it.each([
    ['one file', [file], true],
    [
      'ten files',
      Array.from({ length: 10 }, (_, i) => ({ ...file, sha256: `${i}`.repeat(64) })),
      true,
    ],
    ['no files', [], false],
    ['eleven files', Array.from({ length: 11 }, () => file), false],
    ['a pdf', [{ ...file, contentType: 'application/pdf' }], false],
  ])('reserves %s: %s', (_name, files, ok) => {
    expect(reservePublicMediaRequest.safeParse({ files }).success).toBe(ok)
  })

  it('rejects an unknown reservation key', () => {
    expect(reservePublicMediaRequest.safeParse({ files: [file], note: 'x' }).success).toBe(false)
  })

  it.each([
    ['a trimmed reason', { reason: '  Faces are visible  ' }, true],
    ['an empty reason', { reason: '   ' }, false],
    ['2000 characters', { reason: 'r'.repeat(2000) }, true],
    ['2001 characters', { reason: 'r'.repeat(2001) }, false],
    ['an extra key', { reason: 'ok', extra: 1 }, false],
  ])('parses %s', (_name, body, ok) => {
    expect(publicMediaRejectRequest.safeParse(body).success).toBe(ok)
  })

  it('trims the reason', () => {
    expect(publicMediaRejectRequest.parse({ reason: '  Wrong site ' })).toEqual({
      reason: 'Wrong site',
    })
  })

  it('accepts up to 500 list items and no more', () => {
    expect(publicMediaListResponse.safeParse({ items: Array(500).fill(item) }).success).toBe(true)
    expect(publicMediaListResponse.safeParse({ items: Array(501).fill(item) }).success).toBe(false)
  })

  it('rejects an unknown source or public status', () => {
    expect(
      publicMediaListResponse.safeParse({ items: [{ ...item, source: 'EXPENSE' }] }).success,
    ).toBe(false)
    expect(
      publicMediaListResponse.safeParse({ items: [{ ...item, publicStatus: 'PUBLISHED' }] })
        .success,
    ).toBe(false)
  })
})
