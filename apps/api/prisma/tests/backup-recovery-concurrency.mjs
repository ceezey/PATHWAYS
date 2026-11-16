import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

// cr-pathways-backup-recovery (0091): one backup or restore per organization at a time, a held table lock makes restore
// fail fast, and a read committed restore removes a row committed while it waited for its locks. Loopback disposable
// database only; load backup-recovery-concurrency-fixture.sql first. Never point this at a hosted or shared database.
// The Phase 6 replay (Verify-Forward.ps1) runs this against its trust-auth cluster on the replay port.
const database = process.env.PHASE2_RACE_DATABASE
assert.match(database ?? '', /^pathways_phase[24]_[a-z0-9_]+$/)
const runtimePassword = process.env.PHASE2_RUNTIME_PASSWORD
const ownerPassword = process.env.PHASE2_OWNER_PASSWORD
assert.ok(runtimePassword && ownerPassword, 'Local role passwords are required.')
const url = (user, password, limit) => {
  const value = new URL('postgresql:' + '//127.0.0.1')
  value.port = process.env.PHASE2_LOCAL_PORT ?? '54322'
  value.username = user
  value.password = password
  value.pathname = `/${database}`
  value.searchParams.set('connection_limit', String(limit))
  return value.href
}
const owner = new PrismaClient({ datasources: { db: { url: url('prisma', ownerPassword, 3) } } })
const runtime = new PrismaClient({
  datasources: { db: { url: url('pathways_runtime', runtimePassword, 4) } },
})
const org = 'a9170000-0000-4000-8000-000000000001'
const subject = 'a9170000-0000-4000-8000-000000000011'
const user = 'a9170000-0000-4000-8000-000000000021'
const lateProgram = 'a9170000-0000-4000-8000-000000000052'
const readCommitted = { isolationLevel: 'ReadCommitted', timeout: 30000 }
const repeatableRead = { isolationLevel: 'RepeatableRead', timeout: 30000 }

async function claims(tx) {
  await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${subject}, true),
    set_config('request.jwt.claims', '', true), set_config('app.organization_id', ${org}, true),
    set_config('app.user_id', ${user}, true)`
}
async function capture(tx) {
  await claims(tx)
  return (await tx.$queryRaw`SELECT pathways.p91_capture_organization(${org}::uuid) AS point`)[0]
    .point
}
async function restore(tx, point) {
  await claims(tx)
  const snapshot = JSON.stringify(point)
  const counts = JSON.stringify(point.rowCounts)
  return (
    await tx.$queryRaw`SELECT pathways.p91_restore_organization(${org}::uuid, ${snapshot}::jsonb, ${counts}::jsonb) AS counts`
  )[0].counts
}
const pid = async (tx) => (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid
// The outcome of a call that may fail, with the SQLSTATE and message of a failure.
const settle = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({
      state: error.meta?.code ?? error.code,
      message: String(error.meta?.message ?? error.message),
    }),
  )
// A transaction that runs work, announces its result and stays open until released.
function hold(client, work, options) {
  let release
  let announce
  const released = new Promise((resolve) => {
    release = resolve
  })
  const announced = new Promise((resolve) => {
    announce = resolve
  })
  const done = client.$transaction(
    async (tx) => {
      const value = await work(tx)
      announce(value)
      await released
      return value
    },
    { timeout: 30000, ...options },
  )
  return { ready: Promise.race([announced, done]), release, done }
}
// True once the waiter is blocked by exactly the holder.
async function blockedBy(waiter, holder) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (waiter() !== undefined) {
      const [row] =
        await owner.$queryRaw`SELECT pg_blocking_pids(${waiter()}::integer) = ARRAY[${holder}::integer] AS blocked`
      if (row.blocked) return true
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}
const programs = async () =>
  (
    await owner.$queryRaw`SELECT count(*)::int AS n, count(*) FILTER (WHERE id=${lateProgram}::uuid)::int AS late
      FROM pathways.programs WHERE organization_id=${org}::uuid`
  )[0]

try {
  assert.deepEqual(await programs(), { n: 1, late: 0 }, 'Fresh fixture required.')
  const point = await runtime.$transaction((tx) => capture(tx), repeatableRead)
  assert.equal(point.rowCounts['pathways.programs'], 1)
  const { 'pathways.audit_logs': _audit, ...expected } = point.rowCounts

  // 1. While one restore holds its transaction open, a second restore and a capture are refused at once.
  const first = hold(runtime, (tx) => restore(tx, point), readCommitted)
  try {
    assert.deepEqual(await first.ready, expected)
    const second = await settle(runtime.$transaction((tx) => restore(tx, point), readCommitted))
    assert.deepEqual(second, { state: '55P03', message: second.message }, JSON.stringify(second))
    assert.match(second.message, /Backup or restore already running/)
    const busy = await settle(runtime.$transaction((tx) => capture(tx), repeatableRead))
    assert.deepEqual(busy, { state: '55P03', message: busy.message }, JSON.stringify(busy))
    assert.match(busy.message, /Backup or restore already running/)
  } finally {
    first.release()
  }
  assert.deepEqual(await first.done, expected)

  // 2. A table lock held elsewhere makes restore fail within its 5 s lock_timeout instead of waiting.
  const share = hold(owner, (tx) => tx.$executeRaw`LOCK TABLE pathways.projects IN SHARE MODE`)
  let elapsed
  let timedOut
  try {
    await share.ready
    const started = Date.now()
    timedOut = await settle(runtime.$transaction((tx) => restore(tx, point), readCommitted))
    elapsed = Date.now() - started
  } finally {
    share.release()
  }
  await share.done
  assert.deepEqual(
    timedOut,
    { state: '55P03', message: timedOut.message },
    JSON.stringify(timedOut),
  )
  assert.match(timedOut.message, /lock timeout/)
  assert.ok(elapsed >= 4000 && elapsed < 10000, `Restore waited ${elapsed} ms.`)

  // 3. A program committed while restore waits on a lock held by a third session is gone after the read committed restore.
  const holder = hold(owner, async (tx) => {
    await tx.$executeRaw`LOCK TABLE pathways.audit_logs IN ACCESS SHARE MODE`
    return pid(tx)
  })
  let waiterPid
  let waiting
  try {
    const holderPid = await holder.ready
    waiting = settle(
      runtime.$transaction(async (tx) => {
        waiterPid = await pid(tx)
        return restore(tx, point)
      }, readCommitted),
    )
    assert.equal(
      await blockedBy(() => waiterPid, holderPid),
      true,
      'Restore must wait on the held lock.',
    )
    await owner.$executeRaw`INSERT INTO pathways.programs(id,organization_id,code,name)
      VALUES (${lateProgram}::uuid, ${org}::uuid, 'P91-RACE-LATE', 'Synthetic program committed during the restore wait')`
    assert.deepEqual(await programs(), { n: 2, late: 1 })
    assert.equal(
      await blockedBy(() => waiterPid, holderPid),
      true,
      'Restore must still wait after the commit.',
    )
  } finally {
    holder.release()
  }
  await holder.done
  assert.deepEqual(await waiting, { value: expected })
  assert.deepEqual(await programs(), { n: 1, late: 0 })
  console.log('BACKUP_RECOVERY_CONCURRENCY=PASS')
} finally {
  await Promise.allSettled([owner.$disconnect(), runtime.$disconnect()])
}
