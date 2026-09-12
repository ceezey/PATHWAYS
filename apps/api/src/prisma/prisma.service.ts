import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { type Prisma, PrismaClient } from '@prisma/client'

/** Internal backend context only. The caller must first verify the Auth subject.
 * Atomic permissions and project assignments remain the Phase 5 boundary.
 */
export interface VerifiedDatabaseContext {
  authSubject: string
  organizationId: string
  userId: string
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL is required to initialize Prisma.')
    }

    try {
      await this.$connect()
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
      if (!security?.safe) {
        throw new Error('Unsafe runtime database role.')
      }
    } catch {
      await this.$disconnect().catch(() => undefined)
      throw new Error(
        'Prisma runtime initialization failed. Verify the dedicated runtime credential, database availability, and least-privilege role checks.',
      )
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  async withVerifiedContext<T>(
    context: VerifiedDatabaseContext,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (![context.authSubject, context.organizationId, context.userId].every((v) => uuid.test(v))) {
      throw new Error('Database context requires three UUID identifiers.')
    }
    return this.$transaction(
      async (transaction) => {
        // Parameterized and transaction-local: no claims may leak through the pool.
        await transaction.$queryRaw`
        SELECT set_config('request.jwt.claim.sub', ${context.authSubject}, true),
          set_config('request.jwt.claims', '', true),
          set_config('app.organization_id', ${context.organizationId}, true),
          set_config('app.user_id', ${context.userId}, true)
      `
        const [resolved] = await transaction.$queryRaw<Array<{ organizationId: string | null }>>`
        SELECT pathways.runtime_context_organization()::text AS "organizationId"
      `
        if (resolved?.organizationId?.toLowerCase() !== context.organizationId.toLowerCase()) {
          throw new Error('Database context is not linked to an active application identity.')
        }
        return work(transaction)
      },
      {
        // A protected page can overlap its server and browser checks on the
        // bounded development pool. Keep queue/work time bounded without
        // Prisma's 2s/5s defaults turning valid remote profile reads into P2028.
        maxWait: 5_000,
        timeout: 10_000,
      },
    )
  }
}
