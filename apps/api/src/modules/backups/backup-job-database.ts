import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { type Prisma, PrismaClient } from '@prisma/client'
import { BACKUP_VERIFIED_TRANSACTION_TIMEOUT_MS } from '../../prisma/prisma.service'
import { machineDatabaseUrl } from '../rules/rules-machine-sql'

/** The daily backup job's own login (pathways_backup_job), which may only call the job functions and capture. */
@Injectable()
export class BackupJobDatabase implements OnModuleDestroy {
  private readonly url = readApiEnv(process.env).BACKUP_JOB_DATABASE_URL
  private client?: PrismaClient

  isConfigured(): boolean {
    return this.url !== ''
  }

  async withBackupJobContext<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeoutMs?: number; isolationLevel?: 'RepeatableRead' },
  ): Promise<T> {
    if (!this.isConfigured()) throw new Error('Backup job database is not configured.')
    const timeout = options?.timeoutMs ?? 10_000
    if (
      !Number.isInteger(timeout) ||
      timeout < 1_000 ||
      timeout > BACKUP_VERIFIED_TRANSACTION_TIMEOUT_MS
    )
      throw new Error(
        'Backup job transaction timeout must be an integer from 1000 through 120000 ms.',
      )
    this.client ??= new PrismaClient({
      datasources: { db: { url: machineDatabaseUrl(this.url, 'pathways_backup_job') } },
    })
    return this.client.$transaction(
      async (tx) => {
        const [context] = await tx.$queryRaw<{ allowed: unknown }[]>`SELECT
          set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true),
          set_config('app.user_id', '', true), set_config('app.organization_id', '', true),
          session_user = 'pathways_backup_job' AND current_user = 'pathways_backup_job' AS allowed`
        if (context?.allowed !== true) throw new Error('Backup job context is unavailable.')
        return work(tx)
      },
      {
        maxWait: 5_000,
        timeout,
        ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
      },
    )
  }

  async onModuleDestroy() {
    await this.client?.$disconnect()
  }
}
