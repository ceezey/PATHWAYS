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

  it('accepts a null note and keeps it null', () => {
    expect(reserveBeneficiaryMediaRequest.parse({ files: [file], note: null }).note).toBeNull()
  })

  it.each([
    [{ byteSize: 1 }, true],
    [{ byteSize: 104_857_600 }, true],
    [{ byteSize: 0 }, false],
    [{ byteSize: 104_857_601 }, false],
    [{ byteSize: 1.5 }, false],
    [{ byteSize: '1024' }, false],
    [{ sha256: 'a'.repeat(63) }, false],
    [{ sha256: 'A'.repeat(64) }, false],
    [{ sha256: null }, false],
    [{ fileName: 'x'.repeat(128) }, true],
    [{ fileName: 'x'.repeat(129) }, false],
    [{ fileName: '' }, false],
    [{ fileName: 1 }, false],
  ])('checks the file patch %j (accepted: %s)', (patch, ok) => {
    expect(
      reserveBeneficiaryMediaRequest.safeParse({ files: [{ ...file, ...patch }] }).success,
    ).toBe(ok)
  })

  it.each([
    [{ note: 'x'.repeat(500) }, true],
    [{ note: '' }, true],
    [{ note: 'x'.repeat(501) }, false],
    [{ note: 5 }, false],
  ])('checks the note %j (accepted: %s)', (extra, ok) => {
    expect(reserveBeneficiaryMediaRequest.safeParse({ files: [file], ...extra }).success).toBe(ok)
  })

  it('rejects an unknown key on a file and on the body', () => {
    expect(
      reserveBeneficiaryMediaRequest.safeParse({ files: [{ ...file, extra: true }] }).success,
    ).toBe(false)
    expect(reserveBeneficiaryMediaRequest.safeParse({ files: [file], extra: true }).success).toBe(
      false,
    )
  })
})
