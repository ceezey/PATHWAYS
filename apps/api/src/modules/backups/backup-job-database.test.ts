import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  urls: [] as string[],
  options: [] as unknown[],
  queries: [] as unknown[],
  allowed: true as unknown,
  disconnected: 0,
}))
vi.mock('@prisma/client', async (original) => {
  const actual = await original<typeof import('@prisma/client')>()
  return {
    ...actual,
    PrismaClient: class {
      constructor(options: { datasources: { db: { url: string } } }) {
        state.urls.push(options.datasources.db.url)
      }
      async $transaction(work: (tx: unknown) => Promise<unknown>, options: unknown) {
        state.options.push(options)
        return work({
          $queryRaw: async (query: unknown) => {
            state.queries.push(query)
            return [{ allowed: state.allowed }]
          },
        })
      }
      async $disconnect() {
        state.disconnected++
      }
    },
  }
})
import { BackupJobDatabase } from './backup-job-database'

const configure = (url: string) => {
  vi.stubEnv('BACKUP_JOB_TOKEN', url ? 'b'.repeat(64) : '')
  vi.stubEnv('BACKUP_JOB_DATABASE_URL', url)
}

afterEach(() => {
  vi.unstubAllEnvs()
  state.urls = []
  state.options = []
  state.queries = []
  state.allowed = true
  state.disconnected = 0
})

describe('backup job database', () => {
  it('opens a job transaction with no user on the job login', async () => {
    configure('postgresql://pathways_backup_job@127.0.0.1/local')
    const database = new BackupJobDatabase()
    const work = vi.fn(async () => 'done')
    await expect(database.withBackupJobContext(work)).resolves.toBe('done')
    expect(work).toHaveBeenCalledOnce()
    expect(new URL(state.urls[0] ?? '').username).toBe('pathways_backup_job')
    expect(state.options).toEqual([{ maxWait: 5_000, timeout: 10_000 }])
    const first = (state.queries[0] as TemplateStringsArray).join('?')
    expect(first).toContain('session_user')
    expect(first).toContain('app.user_id')
    await database.onModuleDestroy()
    expect(state.disconnected).toBe(1)
  })

  it('refuses when the session is not the job login', async () => {
    configure('postgresql://pathways_backup_job@127.0.0.1/local')
    state.allowed = false
    const work = vi.fn()
    await expect(new BackupJobDatabase().withBackupJobContext(work)).rejects.toThrow(
      'Backup job context is unavailable.',
    )
    expect(work).not.toHaveBeenCalled()
  })

  it('refuses when BACKUP_JOB_DATABASE_URL is empty', async () => {
    configure('')
    const database = new BackupJobDatabase()
    expect(database.isConfigured()).toBe(false)
    await expect(database.withBackupJobContext(vi.fn())).rejects.toThrow(
      'Backup job database is not configured.',
    )
    expect(state.urls).toEqual([])
  })

  it('rejects a timeout above 120000 ms before opening a transaction', async () => {
    configure('postgresql://pathways_backup_job@127.0.0.1/local')
    await expect(
      new BackupJobDatabase().withBackupJobContext(vi.fn(), { timeoutMs: 120_001 }),
    ).rejects.toThrow('integer from 1000 through 120000 ms')
    expect(state.options).toEqual([])
  })
})
