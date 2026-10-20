// Pure policy only. This neither authenticates nor cancels DB work.
import type { MachineInvocation } from './rules-machine-boundary'

export type RulesPhase =
  | 'ACQUIRE'
  | 'CLAIM'
  | 'CAPTURE'
  | 'COMPUTE'
  | 'COMMIT'
  | 'RELEASE'
  | 'RESPONSE'
const caps: Readonly<Record<RulesPhase, number>> = Object.freeze({
  ACQUIRE: 1000,
  CLAIM: 1000,
  CAPTURE: 5000,
  COMPUTE: 2000,
  COMMIT: 3000,
  RELEASE: 1000,
  RESPONSE: 2000,
})
const MAX_DRAIN_PROJECTS = 20
const MAX_SWEEP_ANCHORS = 100
export class RulesBudgetUnavailable extends Error {
  constructor() {
    super('Rule processing is unavailable.')
    this.name = 'RulesBudgetUnavailable'
  }
}
const remaining = (invocation: MachineInvocation) => {
  invocation.assertRemaining()
  const value = invocation.remainingMs()
  if (!Number.isInteger(value) || value <= 0 || value > 25_000) throw new RulesBudgetUnavailable()
  return value
}
// Caller obtains invocation through requireMachineInvocation, never request JSON.
// Returned duration must be enforced by the actual reviewed transport/DB phase.
export function rulesPhaseBudget(invocation: MachineInvocation, phase: RulesPhase): number {
  if (!Object.hasOwn(caps, phase)) throw new RulesBudgetUnavailable()
  const value = remaining(invocation)
  if (phase === 'CLAIM' && value < 15_000) throw new RulesBudgetUnavailable()
  const available = value - (phase === 'RESPONSE' ? 0 : 2000)
  if (available <= 0) throw new RulesBudgetUnavailable()
  return Math.min(caps[phase], available)
}
// Every attempt, including failures and retries, consumes the server-owned cap.
// Counters are not authorization inputs and never come from request JSON.
export function canStartMachineWork(
  invocation: MachineInvocation,
  purpose: 'DRAIN' | 'SWEEP',
  attempted: number,
): boolean {
  if (purpose !== invocation.purpose || !Number.isInteger(attempted) || attempted < 0)
    throw new RulesBudgetUnavailable()
  const maximum =
    purpose === 'DRAIN' ? MAX_DRAIN_PROJECTS : purpose === 'SWEEP' ? MAX_SWEEP_ANCHORS : 0
  const value = remaining(invocation)
  return (purpose === 'DRAIN' ? value >= 15_000 : value > 2000) && attempted < maximum
}
