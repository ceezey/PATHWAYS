import { describe, expect, it } from 'vitest'

import { formatMediaFileSize } from './beneficiary-media-utils'

describe('Beneficiary media proof helpers', () => {
  it('formats media file sizes for non-technical review', () => {
    expect(formatMediaFileSize(2_460_000)).toBe('2.5 MB')
    expect(formatMediaFileSize(420_000)).toBe('420 KB')
  })
})
