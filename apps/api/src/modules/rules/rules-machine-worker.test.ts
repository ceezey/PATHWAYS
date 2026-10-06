import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { MachineInvocation } from './rules-machine-boundary'
import {
  type Lease,
  type RulesMachineSql,
  RulesMachineWorker,
  RulesSqlFailure,
  type Snapshot,
} from './rules-machine-worker'

const lease: Lease = {
  jobId: '10000000-0000-4000-8000-000000000001',
  leaseNonce: 'a'.repeat(64),
  leaseExpiresAt: '2026-09-27T00:00:00.000Z',
}
const snapshot: Snapshot = {
  snapshotId: '20000000-0000-4000-8000-000000000001',
  digest: 'b'.repeat(64),
  requiredGeneration: '1',
  sourceWatermark: '0',
  calendarVersion: '1',
  asOf: '2026-09-27T00:00:00.000Z',
  reportingDate: '2026-09-27',
  zone: 'Asia/Manila',
}
function fixture(purpose: 'DRAIN' | 'SWEEP' = 'DRAIN') {
  let remaining = 25000
  const invocation: MachineInvocation = {
    purpose,
    origin: 'SYSTEM',
    actorId: null,
    enteredAt: 0,
    deadlineAt: 25000,
    remainingMs: () => remaining,
    assertRemaining: () => {
      if (remaining <= 0) throw Error('expired')
    },
  }
  const sql = {
    calendar: vi.fn(async () => {}),
    claim: vi.fn<RulesMachineSql['claim']>().mockResolvedValue(null),
    capture: vi.fn(async () => snapshot),
    commit: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    sweep: vi.fn(async () => {}),
  }
  return {
    invocation,
    sql,
    worker: new RulesMachineWorker(sql),
    time: (value: number) => {
      remaining = value
    },
  }
}
describe('bounded machine orchestration', () => {
  it('projects only fixed acknowledgement and never includes capability or snapshot metadata', async () => {
    const f = fixture()
    f.sql.claim.mockResolvedValueOnce(lease)
    expect(await f.worker.drain(f.invocation)).toEqual({ state: 'ACKNOWLEDGED' })
    expect(f.sql.capture).toHaveBeenCalledWith(f.invocation, lease)
    expect(f.sql.commit).toHaveBeenCalledWith(f.invocation, lease, snapshot)
    expect(f.sql.release).not.toHaveBeenCalled()
  })
  it('caps all claim attempts at20 and stops before claims with less15seconds', async () => {
    const f = fixture()
    f.sql.claim.mockResolvedValue(lease)
    await f.worker.drain(f.invocation)
    expect(f.sql.claim).toHaveBeenCalledTimes(20)
    const short = fixture()
    short.time(14999)
    await short.worker.drain(short.invocation)
    expect(short.sql.claim).not.toHaveBeenCalled()
  })
  it.each(['STALE', 'CANCELLED'] as const)(
    'releases only certified %s rollback with fixed reason',
    async (kind) => {
      const f = fixture()
      f.sql.claim.mockResolvedValueOnce(lease)
      f.sql.capture.mockRejectedValueOnce(new RulesSqlFailure(kind))
      await f.worker.drain(f.invocation)
      expect(f.sql.release).toHaveBeenCalledWith(
        f.invocation,
        lease,
        kind === 'STALE' ? 'STALE' : 'OPERATIONAL',
      )
      expect(f.sql.commit).not.toHaveBeenCalled()
    },
  )
  it('never releases denied or uncertain capture capabilities', async () => {
    for (const kind of ['DENIED', 'UNCERTAIN'] as const) {
      const f = fixture()
      f.sql.claim.mockResolvedValueOnce(lease)
      f.sql.capture.mockRejectedValueOnce(new RulesSqlFailure(kind))
      await f.worker.drain(f.invocation)
      expect(f.sql.release).not.toHaveBeenCalled()
      expect(f.sql.claim).toHaveBeenCalledTimes(1)
    }
  })
  it('recovers uncertain commit once through identical capability, never private ack helper or release', async () => {
    const f = fixture()
    f.sql.claim.mockResolvedValueOnce(lease)
    f.sql.commit.mockRejectedValueOnce(new RulesSqlFailure('UNCERTAIN'))
    await f.worker.drain(f.invocation)
    expect(f.sql.commit).toHaveBeenCalledTimes(2)
    expect(f.sql.commit.mock.calls[0]).toEqual(f.sql.commit.mock.calls[1])
    expect(f.sql.release).not.toHaveBeenCalled()
  })
  it('defers unresolved commit without new claim/release or unbounded retry', async () => {
    const f = fixture()
    f.sql.claim.mockResolvedValue(lease)
    f.sql.commit.mockRejectedValue(new RulesSqlFailure('UNCERTAIN'))
    await f.worker.drain(f.invocation)
    expect(f.sql.commit).toHaveBeenCalledTimes(2)
    expect(f.sql.claim).toHaveBeenCalledTimes(1)
    expect(f.sql.release).not.toHaveBeenCalled()
  })
  it('sweeps exactly once via dedicated purpose with fixed acknowledgement and no drain operations', async () => {
    const f = fixture('SWEEP')
    expect(await f.worker.sweep(f.invocation)).toEqual({ state: 'ACKNOWLEDGED' })
    expect(f.sql.sweep).toHaveBeenCalledTimes(1)
    expect(f.sql.claim).not.toHaveBeenCalled()
    await expect(f.worker.drain(f.invocation)).rejects.toThrow(
      'Rule processing is temporarily unavailable.',
    )
  })
  it('sanitizes expired/failing requests and does not run work after calendar failure', async () => {
    const f = fixture()
    f.sql.calendar.mockRejectedValue(Error('secret url'))
    await expect(f.worker.drain(f.invocation)).rejects.toThrow(
      'Rule processing is temporarily unavailable.',
    )
    expect(f.sql.claim).not.toHaveBeenCalled()
    const expired = fixture()
    expired.time(0)
    await expect(expired.worker.drain(expired.invocation)).rejects.toThrow(
      'Rule processing is temporarily unavailable.',
    )
  })
})
describe('machine fault logging', () => {
  const secret = 'postgresql://user:pw@host/db SELECT secret'
  it.each([
    ['DRAIN', 'calendar', new RulesSqlFailure('DENIED', 'P2010:42501')],
    ['SWEEP', 'sweep', Object.assign(Error(secret), { code: 'P2028', meta: { code: '40001' } })],
  ] as const)(
    '%s logs only allowlisted fields and keeps the same 503',
    async (purpose, method, error) => {
      const f = fixture(purpose)
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
      f.sql[method].mockRejectedValueOnce(error)
      const run = purpose === 'DRAIN' ? f.worker.drain(f.invocation) : f.worker.sweep(f.invocation)
      const thrown = await run.catch((e) => e)
      expect(thrown).toBeInstanceOf(ServiceUnavailableException)
      expect(thrown.getResponse()).toMatchObject({
        message: 'Rule processing is temporarily unavailable.',
      })
      expect(warn).toHaveBeenCalledTimes(1)
      const logged = warn.mock.calls[0]?.[0]
      expect(logged).toEqual(
        purpose === 'DRAIN'
          ? {
              event: 'PATHWAYS_RULES_MACHINE_FAILED',
              purpose,
              kind: 'DENIED',
              cause: 'P2010:42501',
            }
          : { event: 'PATHWAYS_RULES_MACHINE_FAILED', purpose, cause: 'P2028:40001' },
      )
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
      warn.mockRestore()
    },
  )
})
