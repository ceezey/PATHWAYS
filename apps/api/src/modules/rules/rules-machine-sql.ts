import { performance } from 'node:perf_hooks'
import { Prisma, PrismaClient } from '@prisma/client'
import { faultCause } from '../../prisma/transaction-diagnostic'
import { type RulesPhase, rulesPhaseBudget } from './rules-dispatch-budget'
import type { MachineInvocation } from './rules-machine-boundary'
import {
  type Lease,
  type RulesMachineSql,
  RulesSqlFailure,
  type Snapshot,
} from './rules-machine-worker'

export type RulesDatabaseOptions = Readonly<{
  workerDatabaseUrl: string
  sweeperDatabaseUrl: string
}>
const invalid = () => new RulesSqlFailure('UNCERTAIN')
const decimal = /^(0|[1-9][0-9]*)$/
const positive = /^[1-9][0-9]*$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hex = /^[0-9a-f]{64}$/
const iso = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v
function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw invalid()
  return v as Record<string, unknown>
}
const text = (v: unknown, expression: RegExp): v is string =>
  typeof v === 'string' && v.length <= 100 && expression.test(v)
export function machineDatabaseUrl(
  value: string,
  role: 'pathways_rules_worker' | 'pathways_rules_sweeper',
) {
  try {
    const url = new URL(value)
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !new RegExp(`^${role}(?:\\.[a-z]{20})?$`).test(url.username) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw invalid()
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if (!local && (!url.password || url.searchParams.get('sslmode') !== 'require')) throw invalid()
    // Dedicated bounded pools. User HTTP bodies cannot supply or modify URLs.
    url.searchParams.set('connection_limit', '1')
    url.searchParams.set('connect_timeout', '1')
    url.searchParams.set('pool_timeout', '1')
    return url.toString()
  } catch {
    throw new Error('Dedicated rule database configuration is invalid.')
  }
}
function failure(error: unknown): RulesSqlFailure {
  const meta =
    error && typeof error === 'object' ? (error as { meta?: { code?: unknown } }).meta : undefined
  const code = meta?.code
  return new RulesSqlFailure(
    code === '40001'
      ? 'STALE'
      : code === '57014'
        ? 'CANCELLED'
        : code === '42501'
          ? 'DENIED'
          : 'UNCERTAIN',
    faultCause(error),
  )
}

/** Separate dedicated clients, no human context/SET ROLE/table reads. Each fixed
 * definer SQL entrypoint revalidates actual session login, role and capability. */
export class RulesMachineSqlClient implements RulesMachineSql {
  private closing = false
  private closePromise?: Promise<void>
  private assertOpen() {
    if (this.closing) throw invalid()
  }
  private worker?: PrismaClient
  private sweeper?: PrismaClient
  constructor(private readonly options: RulesDatabaseOptions) {
    machineDatabaseUrl(options.workerDatabaseUrl, 'pathways_rules_worker')
    machineDatabaseUrl(options.sweeperDatabaseUrl, 'pathways_rules_sweeper')
  }
  private client(purpose: 'DRAIN' | 'SWEEP') {
    this.assertOpen()
    if (purpose === 'DRAIN') {
      this.worker ??= new PrismaClient({
        datasources: {
          db: { url: machineDatabaseUrl(this.options.workerDatabaseUrl, 'pathways_rules_worker') },
        },
      })
      return this.worker
    }
    this.sweeper ??= new PrismaClient({
      datasources: {
        db: { url: machineDatabaseUrl(this.options.sweeperDatabaseUrl, 'pathways_rules_sweeper') },
      },
    })
    return this.sweeper
  }
  private async phase(invocation: MachineInvocation, phase: RulesPhase, query: Prisma.Sql) {
    this.assertOpen()
    const duration = rulesPhaseBudget(invocation, phase)
    const deadline = performance.now() + duration
    const checkPhase = () => {
      this.assertOpen()
      if (performance.now() >= deadline) throw invalid()
      invocation.assertRemaining()
    }
    try {
      const result = await this.client(invocation.purpose).$transaction(
        async (tx) => {
          checkPhase()
          const left = Math.max(1, Math.floor(deadline - performance.now()))
          const statement = Math.max(
            1,
            Math.min(phase === 'CAPTURE' ? 3000 : phase === 'COMMIT' ? 1000 : 500, left),
          )
          await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(statement)}, true), set_config('lock_timeout', ${String(Math.min(250, statement))}, true), set_config('idle_in_transaction_session_timeout', ${String(left)}, true)`
          checkPhase()
          const rows = await tx.$queryRaw<Array<{ result: unknown }>>(query)
          checkPhase()
          if (rows.length !== 1 || !Object.hasOwn(rows[0] ?? {}, 'result')) throw invalid()
          return rows[0]?.result
        },
        {
          // Only the drain snapshot capture needs RepeatableRead; sweep_rule_projects requires read committed.
          maxWait: Math.min(1000, duration),
          timeout: duration,
          isolationLevel:
            phase === 'CAPTURE' && invocation.purpose === 'DRAIN'
              ? Prisma.TransactionIsolationLevel.RepeatableRead
              : Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      )
      checkPhase()
      return result
    } catch (error) {
      throw error instanceof RulesSqlFailure ? error : failure(error)
    }
  }
  async calendar(i: MachineInvocation) {
    const v = object(
      await this.phase(
        i,
        'ACQUIRE',
        Prisma.sql`SELECT pathways_rules_internal.read_rule_calendar() AS result`,
      ),
      ['version', 'zone'],
    )
    if (!text(v.version, positive) || v.zone !== 'Asia/Manila') throw invalid()
  }
  async claim(i: MachineInvocation): Promise<Lease | null> {
    if (i.purpose !== 'DRAIN') throw invalid()
    const value = await this.phase(
      i,
      'CLAIM',
      Prisma.sql`SELECT pathways_rules_internal.claim_rule_project() AS result`,
    )
    if (value === null) return null
    const v = object(value, ['jobId', 'leaseNonce', 'leaseExpiresAt'])
    if (!text(v.jobId, uuid) || !text(v.leaseNonce, hex) || !iso(v.leaseExpiresAt)) throw invalid()
    return { jobId: v.jobId, leaseNonce: v.leaseNonce, leaseExpiresAt: v.leaseExpiresAt }
  }
  async capture(i: MachineInvocation, lease: Lease): Promise<Snapshot> {
    if (i.purpose !== 'DRAIN') throw invalid()
    const v = object(
      await this.phase(
        i,
        'CAPTURE',
        Prisma.sql`SELECT pathways_rules_internal.capture_rule_snapshot(${lease.jobId}::uuid, ${lease.leaseNonce}::text) AS result`,
      ),
      [
        'snapshotId',
        'digest',
        'requiredGeneration',
        'sourceWatermark',
        'calendarVersion',
        'asOf',
        'reportingDate',
        'zone',
      ],
    )
    if (
      !text(v.snapshotId, uuid) ||
      !text(v.digest, hex) ||
      !text(v.requiredGeneration, positive) ||
      !text(v.sourceWatermark, decimal) ||
      !text(v.calendarVersion, positive) ||
      !iso(v.asOf) ||
      !text(v.reportingDate, /^\d{4}-\d{2}-\d{2}$/) ||
      v.zone !== 'Asia/Manila'
    )
      throw invalid()
    return v as Snapshot
  }
  async commit(i: MachineInvocation, lease: Lease, snapshot: Snapshot) {
    if (i.purpose !== 'DRAIN') throw invalid()
    const v = object(
      await this.phase(
        i,
        'COMMIT',
        Prisma.sql`SELECT pathways_rules_internal.commit_rule_snapshot(${lease.jobId}::uuid, ${lease.leaseNonce}::text, ${snapshot.snapshotId}::uuid, ${Buffer.from(snapshot.digest, 'hex')}::bytea) AS result`,
      ),
      [
        'requiredGeneration',
        'sourceWatermark',
        'calendarVersion',
        'evaluationSequence',
        'committedAt',
      ],
    )
    if (
      v.requiredGeneration !== snapshot.requiredGeneration ||
      v.sourceWatermark !== snapshot.sourceWatermark ||
      v.calendarVersion !== snapshot.calendarVersion ||
      !text(v.evaluationSequence, positive) ||
      !iso(v.committedAt)
    )
      throw invalid()
  }
  async release(i: MachineInvocation, lease: Lease, reason: 'STALE' | 'OPERATIONAL') {
    if (i.purpose !== 'DRAIN' || !['STALE', 'OPERATIONAL'].includes(reason)) throw invalid()
    const v = object(
      await this.phase(
        i,
        'RELEASE',
        Prisma.sql`SELECT pathways_rules_internal.release_or_retry_rule_job(${lease.jobId}::uuid, ${lease.leaseNonce}::text, ${reason}::text) AS result`,
      ),
      ['released'],
    )
    if (typeof v.released !== 'boolean') throw invalid()
  }
  async sweep(i: MachineInvocation) {
    if (i.purpose !== 'SWEEP') throw invalid()
    const v = object(
      await this.phase(
        i,
        'CAPTURE',
        Prisma.sql`SELECT pathways_rules_internal.sweep_rule_projects() AS result`,
      ),
      ['processed', 'continued'],
    )
    if (
      !Number.isInteger(v.processed) ||
      Number(v.processed) < 0 ||
      Number(v.processed) > 100 ||
      typeof v.continued !== 'boolean'
    )
      throw invalid()
  }
  onModuleDestroy() {
    // Nest10 invokes destroy hooks before HTTP disposal. Seal admission now,
    // including absent/lazily created pools, and share one cleanup completion.
    this.closing = true
    this.closePromise ??= Promise.all([
      this.worker?.$disconnect(),
      this.sweeper?.$disconnect(),
    ]).then(() => {})
    return this.closePromise
  }
}
