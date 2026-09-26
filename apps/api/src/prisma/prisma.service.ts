import { performance } from 'node:perf_hooks'
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { type Prisma, PrismaClient } from '@prisma/client'

/** Internal backend context only. The caller must first verify the Auth subject.
 * Authorized operations recheck current permissions and active assignments in this context.
 */
export interface VerifiedDatabaseContext {
  authSubject: string
  organizationId: string
  userId: string
  /** Server-verified Supabase session claim. When present, liveness is checked
   * in this same transaction before PATHWAYS profile resolution.
   */
  sessionId?: string
}

export interface VerifiedTransactionOptions {
  timeoutMs?: number
  onTiming?: (timing: VerifiedTransactionTiming) => void
}

export interface VerifiedTransactionTiming {
  acquisitionMs: number
  contextMs: number
  workMs: number
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_VERIFIED_TRANSACTION_TIMEOUT_MS = 10_000
const MIN_VERIFIED_TRANSACTION_TIMEOUT_MS = 1_000
const MAX_VERIFIED_TRANSACTION_TIMEOUT_MS = 30_000
const MAX_REPORTED_STAGE_MS = 30_000

const boundedStageDuration = (startedAt: number) =>
  Math.min(MAX_REPORTED_STAGE_MS, Math.max(0, Math.round(performance.now() - startedAt)))

export class InactiveVerifiedSessionError extends Error {
  constructor() {
    super('The verified authentication session is no longer active.')
    this.name = 'InactiveVerifiedSessionError'
  }
}

export class InvalidVerifiedSessionResultError extends Error {
  constructor() {
    super('The verified authentication session result is invalid.')
    this.name = 'InvalidVerifiedSessionResultError'
  }
}

function verifiedTransactionTimeout(options?: VerifiedTransactionOptions) {
  const timeout = options?.timeoutMs ?? DEFAULT_VERIFIED_TRANSACTION_TIMEOUT_MS
  if (
    !Number.isInteger(timeout) ||
    timeout < MIN_VERIFIED_TRANSACTION_TIMEOUT_MS ||
    timeout > MAX_VERIFIED_TRANSACTION_TIMEOUT_MS
  ) {
    throw new Error('Verified transaction timeout must be an integer from 1000 through 30000 ms.')
  }
  return timeout
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL is required to initialize Prisma.')
    }

    let initializationStage = 'connection'
    try {
      await this.$connect()
      initializationStage = 'role-query'
      const [security] = await this.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_user = 'pathways_runtime'
          AND session_user = 'pathways_runtime'
          AND NOT r.rolsuper AND NOT r.rolbypassrls
          AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
          AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
          AND NOT has_database_privilege(current_user, current_database(), 'TEMPORARY')
          AND NOT has_schema_privilege(current_user, 'pathways', 'CREATE')
          AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member = r.oid)
          AND NOT EXISTS (
            SELECT FROM pg_shdepend
            WHERE refclassid = 'pg_authid'::regclass AND refobjid = r.oid AND deptype = 'o'
          )
          AS safe
        FROM pg_roles r WHERE r.rolname = current_user
      `
      initializationStage = 'role-check'
      if (!security?.safe) {
        throw new Error('Unsafe runtime database role.')
      }
    } catch (error) {
      await this.$disconnect().catch(() => undefined)
      const failure =
        typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
      const candidateCode = failure.errorCode ?? failure.code
      const code =
        typeof candidateCode === 'string' && /^P\d{4}$/.test(candidateCode)
          ? candidateCode
          : typeof failure.message === 'string' && failure.message.includes('Query Engine')
            ? 'ENGINE_UNAVAILABLE'
            : 'UNKNOWN'
      throw new Error(
        `Prisma runtime initialization failed. Verify the dedicated runtime credential, database availability, and least-privilege role checks. (stage=${initializationStage}; code=${code})`,
      )
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  async withVerifiedContext<T>(
    context: VerifiedDatabaseContext,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
    options?: VerifiedTransactionOptions,
  ): Promise<T> {
    if (![context.authSubject, context.organizationId, context.userId].every((v) => uuid.test(v))) {
      throw new Error('Database context requires three UUID identifiers.')
    }
    if (context.sessionId !== undefined && !uuid.test(context.sessionId)) {
      throw new Error('Database context requires a valid session UUID when supplied.')
    }
    const timeout = verifiedTransactionTimeout(options)
    const transactionStartedAt = performance.now()
    const timing: VerifiedTransactionTiming = { acquisitionMs: 0, contextMs: 0, workMs: 0 }
    let transactionEntered = false
    let timingReported = false
    const reportTiming = () => {
      if (timingReported) return
      timingReported = true
      try {
        options?.onTiming?.({ ...timing })
      } catch {
        // Development diagnostics must not change authorization behavior.
      }
    }
    try {
      return await this.$transaction(
        async (transaction) => {
          transactionEntered = true
          timing.acquisitionMs = boundedStageDuration(transactionStartedAt)
          const contextStartedAt = performance.now()
          try {
            if (context.sessionId) {
              // One round trip establishes transaction-local context, verifies
              // the current session, then resolves the linked organization. The
              // CASE dependency prevents profile-context evaluation for a
              // removed session; MATERIALIZED preserves the required ordering.
              const rows = await transaction.$queryRaw<
                Array<{ live: boolean; organizationId: string | null }>
              >`
                WITH configured AS MATERIALIZED (
                  SELECT set_config('request.jwt.claim.sub', ${context.authSubject}, true),
                    set_config('request.jwt.claims', '', true),
                    set_config('app.organization_id', ${context.organizationId}, true),
                    set_config('app.user_id', ${context.userId}, true)
                ), live_session AS MATERIALIZED (
                  SELECT pathways.runtime_auth_session_live(
                    ${context.authSubject}::uuid,
                    ${context.sessionId}::uuid
                  ) AS live
                  FROM configured
                )
                SELECT live,
                  CASE WHEN live
                    THEN pathways.runtime_context_organization()::text
                    ELSE NULL
                  END AS "organizationId"
                FROM live_session
              `
              if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.live !== 'boolean') {
                throw new InvalidVerifiedSessionResultError()
              }
              if (!rows[0].live) throw new InactiveVerifiedSessionError()
              if (rows[0].organizationId?.toLowerCase() !== context.organizationId.toLowerCase()) {
                throw new Error('Database context is not linked to an active application identity.')
              }
            } else {
              const [resolved] = await transaction.$queryRaw<
                Array<{ organizationId: string | null }>
              >`
                WITH configured AS MATERIALIZED (
                  SELECT set_config('request.jwt.claim.sub', ${context.authSubject}, true),
                    set_config('request.jwt.claims', '', true),
                    set_config('app.organization_id', ${context.organizationId}, true),
                    set_config('app.user_id', ${context.userId}, true)
                )
                SELECT pathways.runtime_context_organization()::text AS "organizationId"
                FROM configured
              `
              if (
                resolved?.organizationId?.toLowerCase() !== context.organizationId.toLowerCase()
              ) {
                throw new Error('Database context is not linked to an active application identity.')
              }
            }
          } finally {
            timing.contextMs = boundedStageDuration(contextStartedAt)
          }
          const workStartedAt = performance.now()
          try {
            return await work(transaction)
          } finally {
            timing.workMs = boundedStageDuration(workStartedAt)
          }
        },
        {
          // A protected page can overlap its server and browser checks on the
          // bounded development pool. Keep queue/work time bounded without
          // Prisma's 2s/5s defaults turning valid remote profile reads into P2028.
          maxWait: 5_000,
          timeout,
        },
      )
    } finally {
      if (!transactionEntered) {
        timing.acquisitionMs = boundedStageDuration(transactionStartedAt)
      }
      reportTiming()
    }
  }

  async discoverWorkspace(authSubject: string) {
    if (!uuid.test(authSubject)) throw new Error('Workspace discovery requires a verified UUID.')
    return this.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
        SELECT set_config('request.jwt.claim.sub', ${authSubject.toLowerCase()}, true),
          set_config('request.jwt.claims', '', true),
          set_config('app.organization_id', '', true),
          set_config('app.user_id', '', true)
      `
        return transaction.$queryRaw<Array<{ userId: string; organizationId: string }>>`
        SELECT user_id::text AS "userId", organization_id::text AS "organizationId"
        FROM pathways.p1_workspace_for_auth()
      `
      },
      { maxWait: 5_000, timeout: 10_000 },
    )
  }
}
