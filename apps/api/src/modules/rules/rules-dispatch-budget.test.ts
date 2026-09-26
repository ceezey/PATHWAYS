// Pure policy units. Synthetic invocation is NOT Auth evidence.
import { describe, expect, it } from 'vitest'
import {
  RulesBudgetUnavailable,
  type RulesPhase,
  canStartMachineWork,
  rulesPhaseBudget,
} from './rules-dispatch-budget'
import { machineAcknowledgement } from './rules-machine-acknowledgement'
import type { MachineInvocation } from './rules-machine-boundary'
const fixture = (purpose: 'DRAIN' | 'SWEEP' = 'DRAIN') => {
  let left = 25_000
  const invocation: MachineInvocation = {
    purpose,
    origin: 'SYSTEM',
    actorId: null,
    enteredAt: 100,
    deadlineAt: 25_100,
    remainingMs: () => left,
    assertRemaining: () => {
      if (left <= 0) throw new RulesBudgetUnavailable()
    },
  }
  return {
    invocation,
    setRemaining: (value: number) => {
      left = value
    },
  }
}
describe('pure machine invocation phase policies', () => {
  it.each([
    ['ACQUIRE', 1000],
    ['CLAIM', 1000],
    ['CAPTURE', 5000],
    ['COMPUTE', 2000],
    ['COMMIT', 3000],
    ['RELEASE', 1000],
    ['RESPONSE', 2000],
  ] as const)('bounds %s while preserving the original invocation deadline', (phase, cap) => {
    const f = fixture()
    expect(rulesPhaseBudget(f.invocation, phase)).toBe(cap)
    expect(f.invocation.deadlineAt).toBe(25_100)
  })
  it('preserves response reserve and reduces a phase to the remaining usable budget', () => {
    const f = fixture()
    f.setRemaining(3500)
    expect(rulesPhaseBudget(f.invocation, 'CAPTURE')).toBe(1500)
    f.setRemaining(2000)
    expect(() => rulesPhaseBudget(f.invocation, 'COMMIT')).toThrow(RulesBudgetUnavailable)
    expect(rulesPhaseBudget(f.invocation, 'RESPONSE')).toBe(2000)
    f.setRemaining(500)
    expect(rulesPhaseBudget(f.invocation, 'RESPONSE')).toBe(500)
  })
  it('refuses a new claim near the deadline rather than resetting its budget', () => {
    const f = fixture()
    f.setRemaining(15000)
    expect(canStartMachineWork(f.invocation, 'DRAIN', 19)).toBe(true)
    f.setRemaining(14999)
    expect(canStartMachineWork(f.invocation, 'DRAIN', 19)).toBe(false)
    expect(() => rulesPhaseBudget(f.invocation, 'CLAIM')).toThrow(RulesBudgetUnavailable)
  })
  it('bounds distinct drain and sweep server-owned work counters', () => {
    const d = fixture()
    const s = fixture('SWEEP')
    expect(canStartMachineWork(d.invocation, 'DRAIN', 19)).toBe(true)
    expect(canStartMachineWork(d.invocation, 'DRAIN', 20)).toBe(false)
    expect(canStartMachineWork(s.invocation, 'SWEEP', 99)).toBe(true)
    expect(canStartMachineWork(s.invocation, 'SWEEP', 100)).toBe(false)
    expect(() => canStartMachineWork(d.invocation, 'SWEEP', 0)).toThrow(RulesBudgetUnavailable)
    expect(() => canStartMachineWork(d.invocation, 'DRAIN', -1)).toThrow(RulesBudgetUnavailable)
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 25001, 0.5])(
    'rejects an invalid remaining duration %s',
    (value) => {
      const f = fixture()
      f.setRemaining(value)
      expect(() => rulesPhaseBudget(f.invocation, 'CAPTURE')).toThrow(RulesBudgetUnavailable)
    },
  )
  it('preserves the response reserve at the SWEEP 2000/2001 admission boundary', () => {
    const f = fixture('SWEEP')
    f.setRemaining(2000)
    expect(canStartMachineWork(f.invocation, 'SWEEP', 99)).toBe(false)
    expect(() => rulesPhaseBudget(f.invocation, 'ACQUIRE')).toThrow(RulesBudgetUnavailable)
    f.setRemaining(2001)
    expect(canStartMachineWork(f.invocation, 'SWEEP', 99)).toBe(true)
    expect(rulesPhaseBudget(f.invocation, 'ACQUIRE')).toBe(1)
  })
  it.each(['INVALID', '__proto__', 'constructor'])('rejects noncanonical phase %s', (phase) => {
    expect(() => rulesPhaseBudget(fixture().invocation, phase as RulesPhase)).toThrow(
      RulesBudgetUnavailable,
    )
  })
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid server attempt counter %s',
    (attempted) => {
      const d = fixture()
      const s = fixture('SWEEP')
      expect(() => canStartMachineWork(d.invocation, 'DRAIN', attempted)).toThrow(
        RulesBudgetUnavailable,
      )
      expect(() => canStartMachineWork(s.invocation, 'SWEEP', attempted)).toThrow(
        RulesBudgetUnavailable,
      )
    },
  )
  it('acknowledges invocation without resource counts, IDs, notes or completion claims', () => {
    const value = machineAcknowledgement()
    expect(Object.keys(value)).toEqual(['state'])
    expect(value).toEqual({ state: 'ACKNOWLEDGED' })
    expect(Object.isFrozen(value)).toBe(true)
  })
})
