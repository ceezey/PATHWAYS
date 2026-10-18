import { describe, expect, it } from 'vitest'

import { lastMonthIso, monthStartIso } from './defense-demo-stage-backdate'
import { followUpPeople, sessionSize } from './defense-demo-stage-participation'
import { gainCounts, meanGain, releasable, wshPairs } from './defense-demo-stage-survey'

describe('defense dataset helpers', () => {
  it('moves a date to the middle of the previous month', () => {
    expect(monthStartIso('2026-10-04')).toBe('2026-10-01')
    expect(lastMonthIso('2026-10-04')).toBe('2026-09-21')
    expect(lastMonthIso('2026-01-02')).toBe('2025-12-22')
  })

  it('keeps the WSH survey gain low with every released count safe', () => {
    expect(wshPairs).toHaveLength(8)
    expect(meanGain(wshPairs)).toBeLessThan(20)
    for (const count of Object.values(gainCounts(wshPairs))) expect(releasable(count)).toBe(true)
  })

  it('flags at least a quarter of the coaching session with neither side a small cell', () => {
    const flagged = followUpPeople.length
    expect(flagged / sessionSize).toBeGreaterThanOrEqual(0.25)
    expect(releasable(flagged)).toBe(true)
    expect(releasable(sessionSize - flagged)).toBe(true)
    expect(new Set(followUpPeople).size).toBe(flagged)
    for (const index of followUpPeople) expect(index).toBeLessThan(sessionSize)
  })
})
