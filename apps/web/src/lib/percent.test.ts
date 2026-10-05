import { describe, expect, it } from 'vitest'
import { formatCappedPercent } from './percent'

describe('formatCappedPercent', () => {
  it('caps KPI progress at 100% without an overrun note', () => {
    expect(formatCappedPercent(102)).toBe('100%')
    expect(formatCappedPercent('87.5')).toBe('87.5%')
  })
  it('names a labelled overrun so budget and schedule overruns still alert', () => {
    expect(formatCappedPercent(112.34, 'over budget')).toBe('100% (12.3% over budget)')
  })
})
