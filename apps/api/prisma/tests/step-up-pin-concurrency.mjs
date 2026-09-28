import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

// cr-pathways-beneficiary-step-up-pin (0037): parallel wrong PINs cannot exceed the lockout
// bound, and verification waits on the PIN row lock. Loopback disposable database only; load
// step-up-pin-concurrency-fixture.sql first. Never point this at a hosted or shared database.
// The Phase 6 replay (Verify-Forward.ps1) runs this against its trust-auth cluster on 55448.
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
const owner = new PrismaClient({ datasources: { db: { url: url('prisma', ownerPassword, 2) } } })
const runtime = new PrismaClient({
  datasources: { db: { url: url('pathways_runtime', runtimePassword, 16) } },
})
const org = '78000000-0000-4000-8000-000000000001'
const user = '78000000-0000-4000-8000-000000000031'
const subject = '78000000-0000-4000-8000-000000000011'
const session = '78000000-0000-4000-8000-0000000000a1'

async function verify(tx, pin) {
  await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${subject}, true),
    set_config('request.jwt.claims', '', true), set_config('app.organization_id', ${org}, true),
    set_config('app.user_id', ${user}, true)`
  const [row] =
    await tx.$queryRaw`SELECT outcome FROM pathways.step_up_pin_verify(${pin}::text, ${session}::uuid)`
  return row.outcome
}
const pinRow = async () =>
  (
    await owner.$queryRaw`SELECT failed_attempts AS "failedAttempts", locked_at IS NOT NULL AS locked
      FROM pathways.user_step_up_pins WHERE organization_id=${org}::uuid AND user_id=${user}::uuid`
  )[0]

try {
  const initial = await pinRow()
  assert.deepEqual(initial, { failedAttempts: 0, locked: false }, 'Fresh fixture required.')

  // 1. A verification waits while another transaction holds the PIN row lock.
  let release
  let announce
  const released = new Promise((resolve) => {
    release = resolve
  })
  const locked = new Promise((resolve) => {
    announce = resolve
  })
  const holder = owner.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pathways.user_step_up_pins
        WHERE organization_id=${org}::uuid AND user_id=${user}::uuid FOR UPDATE`
      announce()
      await released
    },
    { timeout: 15000 },
  )
  await locked
  let waiterPid
  const waiter = runtime.$transaction(
    async (tx) => {
      waiterPid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid
      return verify(tx, '736150')
    },
    { timeout: 15000 },
  )
  let blocked = false
  try {
    for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
      if (waiterPid !== undefined) {
        const [row] =
          await runtime.$queryRaw`SELECT cardinality(pg_blocking_pids(${waiterPid}::integer)) > 0 AS blocked`
        blocked = row.blocked
      }
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25))
    }
  } finally {
    release()
  }
  await holder
  assert.equal(blocked, true, 'Verification must wait on the PIN row lock.')
  assert.equal(await waiter, 'INCORRECT')
  assert.deepEqual(await pinRow(), { failedAttempts: 1, locked: false })

  // 2. Twelve parallel wrong attempts: exactly four more failures, then locked.
  const outcomes = await Promise.all(
    Array.from({ length: 12 }, () =>
      runtime.$transaction((tx) => verify(tx, '736150'), { timeout: 15000 }),
    ),
  )
  const count = (value) => outcomes.filter((outcome) => outcome === value).length
  assert.equal(count('INCORRECT'), 3, JSON.stringify(outcomes))
  assert.equal(count('LOCKED'), 9, JSON.stringify(outcomes))
  assert.deepEqual(await pinRow(), { failedAttempts: 5, locked: true })

  // 3. The correct PIN is not compared once locked.
  assert.equal(await runtime.$transaction((tx) => verify(tx, '482915')), 'LOCKED')
  const [audit] = await owner.$queryRaw`SELECT
      count(*) FILTER (WHERE action='BENEFICIARY_STEP_UP_PIN_FAILED' AND changes->>'outcome'='INCORRECT')::int AS incorrect,
      count(*) FILTER (WHERE action='BENEFICIARY_STEP_UP_PIN_LOCKED')::int AS lockouts,
      count(*) FILTER (WHERE changes::text ~ '(482915|736150|\\$2a\\$)')::int AS leaked
    FROM pathways.audit_logs WHERE organization_id=${org}::uuid AND actor_user_id=${user}::uuid`
  assert.deepEqual(audit, { incorrect: 5, lockouts: 1, leaked: 0 })
  console.log('STEP_UP_PIN_CONCURRENCY=PASS')
} finally {
  await Promise.allSettled([owner.$disconnect(), runtime.$disconnect()])
}
