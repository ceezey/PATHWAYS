import { describe, expect, it } from 'vitest'

import { compareHeaders } from './headers'

describe('compareHeaders', () => {
  it('identifies missing and extra headers', () => {
    const comparison = compareHeaders(['name', 'age'], ['name', 'gender'])

    expect(comparison.matches).toBe(false)
    expect(comparison.missing).toEqual(['age'])
    expect(comparison.extra).toEqual(['gender'])
  })
})
