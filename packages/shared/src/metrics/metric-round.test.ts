import { describe, expect, it } from 'vitest'
import { round1 } from './metric-round'

describe('round1', () => {
  it('rounds positive values half up to one decimal and trims a zero fraction', () => {
    expect(round1(1.25)).toBe('1.3')
    expect(round1(2.5)).toBe('2.5')
    expect(round1(0.04)).toBe('0')
    expect(round1(100)).toBe('100')
  })

  it('rounds negative values half away from zero and keeps the sign', () => {
    expect(round1(-1.25)).toBe('-1.3')
    expect(round1(-0.05)).toBe('-0.1')
    expect(round1(-2.5)).toBe('-2.5')
    expect(round1(-100)).toBe('-100')
  })

  it('never returns a negative zero', () => {
    expect(round1(-0.04)).toBe('0')
    expect(round1(-1e-9)).toBe('0')
    expect(round1(-0)).toBe('0')
  })
})
