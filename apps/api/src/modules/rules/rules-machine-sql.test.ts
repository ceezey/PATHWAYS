import { describe, expect, it, vi } from 'vitest'
import type { MachineInvocation } from './rules-machine-boundary'
const state = vi.hoisted(() => ({
  result: null as unknown,
  error: undefined as unknown,
  queries: [] as unknown[],
  options: [] as unknown[],
  created: 0,
  disconnected: 0,
  before: undefined as undefined | (() => Promise<void>),
  setup: undefined as undefined | (() => Promise<void>),
}))
vi.mock('@prisma/client', async (original) => {
  const actual = await original<typeof import('@prisma/client')>()
  return {
    ...actual,
    PrismaClient: class {
      constructor() {
        state.created++
      }
      async $transaction(work: (tx: unknown) => Promise<unknown>, options: unknown) {
        state.options.push(options)
        await state.before?.()
        return work({
          $queryRaw: async (query: unknown) => {
            state.queries.push(query)
            if (Array.isArray(query)) {
              await state.setup?.()
              return []
            }
            if (state.error) throw state.error
            return [{ result: state.result }]
          },
        })
      }
      async $disconnect() {
        state.disconnected++
      }
    },
  }
})
import { RulesMachineSqlClient, machineDatabaseUrl } from './rules-machine-sql'
import { RulesSqlFailure } from './rules-machine-worker'
const lease = {
  jobId: '10000000-0000-4000-8000-000000000001',
  leaseNonce: 'a'.repeat(64),
  leaseExpiresAt: '2026-09-27T00:00:00.000Z',
}
function fixture(purpose: 'DRAIN' | 'SWEEP' = 'DRAIN') {
  state.result = null
  state.error = undefined
  state.queries = []
  state.options = []
  state.created = 0
  state.disconnected = 0
  state.before = undefined
  state.setup = undefined
  const invocation: MachineInvocation = {
    purpose,
    origin: 'SYSTEM',
    actorId: null,
    enteredAt: 0,
    deadlineAt: 25000,
    remainingMs: () => 25000,
    assertRemaining: () => {},
  }
  const client = new RulesMachineSqlClient({
    workerDatabaseUrl: 'postgresql://pathways_rules_worker@127.0.0.1/local',
    sweeperDatabaseUrl: 'postgresql://pathways_rules_sweeper@127.0.0.1/local',
  })
  return { client, invocation }
}
describe('fixed dedicated machine SQL transport', () => {
  it('seals both unused pools synchronously before any later HTTP admission and shares cleanup', async () => {
    const f = fixture()
    const first = f.client.onModuleDestroy()
    expect(f.client.onModuleDestroy()).toBe(first)
    await first
    await expect(f.client.claim(f.invocation)).rejects.toBeInstanceOf(RulesSqlFailure)
    const sweep = { ...f.invocation, purpose: 'SWEEP' as const }
    await expect(f.client.sweep(sweep)).rejects.toBeInstanceOf(RulesSqlFailure)
    expect(state.created).toBe(0)
    expect(state.disconnected).toBe(0)
  })
  it('disconnects each instantiated purpose pool only once and never reopens', async () => {
    const f = fixture()
    state.result = { version: '1', zone: 'Asia/Manila' }
    await f.client.calendar(f.invocation)
    await f.client.calendar({ ...f.invocation, purpose: 'SWEEP' })
    await f.client.onModuleDestroy()
    await f.client.onModuleDestroy()
    expect(state.created).toBe(2)
    expect(state.disconnected).toBe(2)
    await expect(f.client.calendar(f.invocation)).rejects.toBeInstanceOf(RulesSqlFailure)
    expect(state.created).toBe(2)
  })
  it('stops an acquired transaction before querying when shutdown begins during SDK acquisition', async () => {
    const f = fixture()
    let resume: () => void = () => {
      throw Error('Deferred acquisition not initialized')
    }
    const gate = new Promise<void>((resolve) => {
      resume = resolve
    })
    state.before = () => gate
    const phase = f.client.claim(f.invocation)
    const failure = expect(phase).rejects.toBeInstanceOf(RulesSqlFailure)
    await f.client.onModuleDestroy()
    resume()
    await failure
    expect(state.queries).toEqual([])
    expect(state.created).toBe(1)
    expect(state.disconnected).toBe(1)
  })
  it('does not start work SQL after disconnect or shutdown while context timeout setup awaits', async () => {
    const f = fixture()
    let resume: () => void = () => {
      throw Error('Deferred setup not initialized')
    }
    let entered: () => void = () => {
      throw Error('Deferred notice not initialized')
    }
    const gate = new Promise<void>((resolve) => {
      resume = resolve
    })
    const notice = new Promise<void>((resolve) => {
      entered = resolve
    })
    state.setup = () => {
      entered()
      return gate
    }
    const phase = f.client.claim(f.invocation)
    const failure = expect(phase).rejects.toBeInstanceOf(RulesSqlFailure)
    await notice
    await f.client.onModuleDestroy()
    resume()
    await failure
    expect(state.queries).toHaveLength(1)
    expect(Array.isArray(state.queries[0])).toBe(true)
  })
  it('rejects human/owner credentials and insecure remote endpoints without echoing secrets', () => {
    expect(() =>
      machineDatabaseUrl('postgresql://postgres:secret@127.0.0.1/local', 'pathways_rules_worker'),
    ).toThrow('Dedicated rule database configuration is invalid.')
    expect(() =>
      machineDatabaseUrl(
        'postgresql://pathways_rules_worker:secret@remote.invalid/local',
        'pathways_rules_worker',
      ),
    ).toThrow('Dedicated rule database configuration is invalid.')
    const url = new URL(
      machineDatabaseUrl(
        'postgresql://pathways_rules_worker@127.0.0.1/local?connection_limit=99',
        'pathways_rules_worker',
      ),
    )
    expect(url.searchParams.get('connection_limit')).toBe('1')
    expect(url.searchParams.get('connect_timeout')).toBe('1')
  })
  it('accepts a pooler project-ref suffix on the exact role only', () => {
    const ref = 'abcdefghijklmnopqrst'
    const url = (user: string) =>
      `postgresql://${user}:secret@pool.example.invalid/local?sslmode=require`
    expect(
      machineDatabaseUrl(url(`pathways_rules_worker.${ref}`), 'pathways_rules_worker'),
    ).toContain(`pathways_rules_worker.${ref}`)
    for (const user of [
      `pathways_rules_sweeper.${ref}`,
      `pathways_rules_worker.${ref}1`,
      'pathways_rules_worker.abc',
    ])
      expect(() => machineDatabaseUrl(url(user), 'pathways_rules_worker')).toThrow(
        'Dedicated rule database configuration is invalid.',
      )
  })
  it('accepts only exact claim metadata and empty null, never an arbitrary scope or payload', async () => {
    const f = fixture()
    expect(await f.client.claim(f.invocation)).toBeNull()
    state.result = lease
    expect(await f.client.claim(f.invocation)).toEqual(lease)
    state.result = { ...lease, organizationId: 'guessed' }
    await expect(f.client.claim(f.invocation)).rejects.toBeInstanceOf(RulesSqlFailure)
    expect(state.options[0]).toMatchObject({
      maxWait: 1000,
      timeout: 1000,
      isolationLevel: 'ReadCommitted',
    })
  })
  it('captures under RepeatableRead and rejects metric payload extensions/invalid counters', async () => {
    const f = fixture()
    state.result = {
      snapshotId: lease.jobId,
      digest: 'b'.repeat(64),
      requiredGeneration: '1',
      sourceWatermark: '0',
      calendarVersion: '1',
      asOf: '2026-09-27T00:00:00.000Z',
      reportingDate: '2026-09-27',
      zone: 'Asia/Manila',
    }
    await f.client.capture(f.invocation, lease)
    expect(state.options[0]).toMatchObject({ timeout: 5000, isolationLevel: 'RepeatableRead' })
    state.result = { ...(state.result as object), metrics: { secret: 'value' } }
    await expect(f.client.capture(f.invocation, lease)).rejects.toBeInstanceOf(RulesSqlFailure)
  })
  it.each([
    ['40001', 'STALE'],
    ['57014', 'CANCELLED'],
    ['42501', 'DENIED'],
    ['unknown', 'UNCERTAIN'],
  ])('classifies exact SQLSTATE%s as%s', async (code, kind) => {
    const f = fixture()
    state.error = { meta: { code } }
    await expect(f.client.claim(f.invocation)).rejects.toMatchObject({ kind })
  })
  it('sweep uses its single fixed routine and rejects over100 before any success acknowledgement', async () => {
    const f = fixture('SWEEP')
    state.result = { processed: 100, continued: true }
    await f.client.sweep(f.invocation)
    state.result = { processed: 101, continued: true }
    await expect(f.client.sweep(f.invocation)).rejects.toBeInstanceOf(RulesSqlFailure)
    await expect(f.client.claim(f.invocation)).rejects.toBeInstanceOf(RulesSqlFailure)
    const query = state.queries.find((q) => !Array.isArray(q)) as { sql?: string }
    expect(query.sql).toContain('sweep_rule_projects()')
    expect(query.sql).not.toContain('committed_acknowledgement')
  })
  it('sweep runs ReadCommitted with the capture budget while drain capture stays RepeatableRead', async () => {
    const f = fixture('SWEEP')
    state.result = { processed: 0, continued: false }
    await f.client.sweep(f.invocation)
    expect(state.options[0]).toMatchObject({ timeout: 5000, isolationLevel: 'ReadCommitted' })
  })
  it('keeps the SQLSTATE and Prisma code on the failure for diagnostics only', async () => {
    const f = fixture()
    state.error = Object.assign(Error('secret text'), { code: 'P2010', meta: { code: '42501' } })
    const error = await f.client.claim(f.invocation).catch((e) => e)
    expect(error.diagnostic).toBe('P2010:42501')
    expect(error.message).toBe('Rule processing is unavailable.')
  })
})
