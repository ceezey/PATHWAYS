import { describe, expect, it } from 'vitest'

import { progressPercent } from './beneficiary-progress'

describe('progressPercent', () => {
  it('a person on one track who took every stage they could reads 100 percent', () => {
    expect(progressPercent({ reached: 3, path_length: 4, at_terminal: false })).toBe(100)
  })

  it('a stage short of the path is below 100 and the terminal stage is 100', () => {
    expect(progressPercent({ reached: 2, path_length: 4, at_terminal: false })).toBe(75)
    expect(progressPercent({ reached: 0, path_length: 4, at_terminal: true })).toBe(100)
  })
})
