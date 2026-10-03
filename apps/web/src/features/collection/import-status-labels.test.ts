import { describe, expect, it } from 'vitest'

import { enumLabel } from './import-status-labels'

describe('enumLabel', () => {
  it('sentence-cases known and unknown enum values', () => {
    expect(enumLabel('PARTIALLY_PROCESSED')).toBe('Partially processed')
    expect(enumLabel('RECOVERY_REQUIRED')).toBe('Recovery required')
    expect(enumLabel('rows')).toBe('Rows')
    expect(enumLabel('SOME_NEW_CODE')).toBe('Some new code')
    expect(enumLabel('')).toBe('')
  })
})
