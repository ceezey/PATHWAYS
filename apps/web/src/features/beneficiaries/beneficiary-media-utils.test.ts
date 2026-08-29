import { describe, expect, it } from 'vitest'

import {
  beneficiaryMediaReviewTone,
  beneficiaryMediaTypeFromMime,
  formatMediaDuration,
  formatMediaFileSize,
  isSupportedBeneficiaryMedia,
  parseMediaTags,
} from './beneficiary-media-utils'

describe('Beneficiary media proof helpers', () => {
  it('recognizes the supported photo and video formats', () => {
    expect(isSupportedBeneficiaryMedia('image/jpeg')).toBe(true)
    expect(isSupportedBeneficiaryMedia('image/png')).toBe(true)
    expect(isSupportedBeneficiaryMedia('video/mp4')).toBe(true)
    expect(isSupportedBeneficiaryMedia('application/pdf')).toBe(false)
    expect(beneficiaryMediaTypeFromMime('image/png')).toBe('Photo')
    expect(beneficiaryMediaTypeFromMime('video/mp4')).toBe('Video')
  })

  it('formats media metadata for non-technical review', () => {
    expect(formatMediaFileSize(2_460_000)).toBe('2.5 MB')
    expect(formatMediaFileSize(420_000)).toBe('420 KB')
    expect(formatMediaDuration(42)).toBe('0:42')
    expect(formatMediaDuration(125)).toBe('2:05')
  })

  it('normalizes optional tags and limits visible tag noise', () => {
    expect(parseMediaTags(' Skills session, Proof, Skills session, Follow-up ')).toEqual([
      'Skills session',
      'Proof',
      'Follow-up',
    ])
    expect(parseMediaTags('one,two,three,four,five,six,seven')).toHaveLength(6)
  })

  it('uses clear review tones', () => {
    expect(beneficiaryMediaReviewTone('Accepted')).toBe('success')
    expect(beneficiaryMediaReviewTone('For Review')).toBe('info')
    expect(beneficiaryMediaReviewTone('Needs Clarification')).toBe('warning')
  })
})
