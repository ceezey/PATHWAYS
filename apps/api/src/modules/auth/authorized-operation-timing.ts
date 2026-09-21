import type { ApplicationIdentity } from './developer-access'

const MAX_REPORTED_STAGE_MS = 30_000

export interface AuthorizedOperationTiming {
  acquisitionMs: number
  contextMs: number
  profileMs: number
  featureMs: number
  totalMs: number
}

type TimingSink = (timing: AuthorizedOperationTiming) => void

const sinks = new WeakMap<ApplicationIdentity, TimingSink>()

export const boundedOperationDuration = (durationMs: number) =>
  Math.min(MAX_REPORTED_STAGE_MS, Math.max(0, Math.round(durationMs)))

/** Registers one server-owned, same-request observer. It is never authorization state. */
export function registerAuthorizedOperationTiming(identity: ApplicationIdentity, sink: TimingSink) {
  sinks.set(identity, sink)
}

/** Reports at most once and never lets diagnostics change application behavior. */
export function reportAuthorizedOperationTiming(
  identity: ApplicationIdentity,
  timing: AuthorizedOperationTiming,
) {
  const sink = sinks.get(identity)
  if (!sink) return
  sinks.delete(identity)
  try {
    sink(timing)
  } catch {
    // Non-production timing diagnostics must remain observational only.
  }
}
