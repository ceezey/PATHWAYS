import { describe, expect, it } from 'vitest'
import { formatCappedPercent, overrunReason } from './percent'

describe('formatCappedPercent', () => {
  it('caps at 100% and keeps the overrun visible', () => {
    expect(formatCappedPercent(102)).toBe('100% (+2%)')
    expect(formatCappedPercent(112.34)).toBe('100% (+12.3%)')
    expect(formatCappedPercent('108.1100', 2)).toBe('100% (+8.11%)')
    expect(formatCappedPercent('87.5')).toBe('87.5%')
  })
  it('adds no note when the overrun rounds away', () => {
    expect(formatCappedPercent(100.04)).toBe('100%')
  })
})

describe('overrunReason', () => {
  it('states the actual figure, then the cause', () => {
    expect(overrunReason('108.11', 'schedule', 2)).toMatch(
      /^The computed value is 108\.11%, 8\.11% above the 100% shown\. The project has run past its scheduled end date\./,
    )
    expect(overrunReason(105)).toBe('The computed value is 105%, 5% above the 100% shown.')
  })
})

describe('percent rounding', () => {
  it('shows at most one decimal', () => {
    expect(formatCappedPercent('94.4444')).toBe('94.4%')
    expect(formatCappedPercent(94.4444)).toBe('94.4%')
    expect(formatCappedPercent('50.00')).toBe('50%')
  })
})
