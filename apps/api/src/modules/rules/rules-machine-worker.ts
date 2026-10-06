import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { faultCause } from '../../prisma/transaction-diagnostic'
import { canStartMachineWork, rulesPhaseBudget } from './rules-dispatch-budget'
import { machineAcknowledgement } from './rules-machine-acknowledgement'
import type { MachineInvocation } from './rules-machine-boundary'

export const RULES_MACHINE_SQL = Symbol('RULES_MACHINE_SQL')
export type Lease = Readonly<{ jobId: string; leaseNonce: string; leaseExpiresAt: string }>
export type Snapshot = Readonly<{
  snapshotId: string
  digest: string
  requiredGeneration: string
  sourceWatermark: string
  calendarVersion: string
  asOf: string
  reportingDate: string
  zone: 'Asia/Manila'
}>
export interface RulesMachineSql {
  calendar(invocation: MachineInvocation): Promise<void>
  claim(invocation: MachineInvocation): Promise<Lease | null>
  capture(invocation: MachineInvocation, lease: Lease): Promise<Snapshot>
  commit(invocation: MachineInvocation, lease: Lease, snapshot: Snapshot): Promise<void>
  release(
    invocation: MachineInvocation,
    lease: Lease,
    reason: 'STALE' | 'OPERATIONAL',
  ): Promise<void>
  sweep(invocation: MachineInvocation): Promise<void>
}
export class RulesSqlFailure extends Error {
  constructor(
    readonly kind: 'STALE' | 'CANCELLED' | 'DENIED' | 'UNCERTAIN',
    /** Allowlisted fault label for server logs only. */
    readonly diagnostic = '',
  ) {
    super('Rule processing is unavailable.')
  }
}
const logger = new Logger('RulesMachineWorker')
const unavailable = () =>
  new ServiceUnavailableException('Rule processing is temporarily unavailable.')

/** One allowlisted warning per failed machine run; never messages, SQL or row data. */
function fault(purpose: 'DRAIN' | 'SWEEP', error: unknown) {
  const failure = error instanceof RulesSqlFailure ? error : undefined
  logger.warn({
    event: 'PATHWAYS_RULES_MACHINE_FAILED',
    purpose,
    ...(failure && { kind: failure.kind }),
    cause: failure?.diagnostic || faultCause(error),
  })
  return unavailable()
}

@Injectable()
export class RulesMachineWorker {
  constructor(@Inject(RULES_MACHINE_SQL) private readonly sql: RulesMachineSql) {}

  async drain(invocation: MachineInvocation) {
    if (invocation.purpose !== 'DRAIN') throw unavailable()
    try {
      await this.sql.calendar(invocation)
      for (let attempted = 0; canStartMachineWork(invocation, 'DRAIN', attempted); attempted++) {
        const lease = await this.sql.claim(invocation)
        if (!lease) break
        let committing = false
        let snapshot: Snapshot | undefined
        try {
          snapshot = await this.sql.capture(invocation, lease)
          committing = true
          await this.sql.commit(invocation, lease, snapshot)
        } catch (error) {
          // SQLSTATE40001/57014 certify rollback; 42501 never authorizes release.
          // Unknown commit completion is recovered only with the identical opaque
          // capability through the idempotent commit routine's private ack lookup.
          if (
            error instanceof RulesSqlFailure &&
            (error.kind === 'STALE' || error.kind === 'CANCELLED')
          ) {
            await this.sql.release(
              invocation,
              lease,
              error.kind === 'STALE' ? 'STALE' : 'OPERATIONAL',
            )
            continue
          }
          if (
            committing &&
            snapshot &&
            error instanceof RulesSqlFailure &&
            error.kind === 'UNCERTAIN'
          ) {
            try {
              if (rulesPhaseBudget(invocation, 'COMMIT') < 3000) break
              await this.sql.commit(invocation, lease, snapshot)
              continue
            } catch {
              break
            }
          }
          // No blind release for an unknown outcome or a withdrawn capability.
          break
        }
      }
      rulesPhaseBudget(invocation, 'RESPONSE')
      return machineAcknowledgement()
    } catch (error) {
      throw fault('DRAIN', error)
    }
  }

  async sweep(invocation: MachineInvocation) {
    if (invocation.purpose !== 'SWEEP') throw unavailable()
    try {
      await this.sql.calendar(invocation)
      // One SQL call persists its cursor and visits at most 100 anchors.
      await this.sql.sweep(invocation)
      rulesPhaseBudget(invocation, 'RESPONSE')
      return machineAcknowledgement()
    } catch (error) {
      throw fault('SWEEP', error)
    }
  }
}
