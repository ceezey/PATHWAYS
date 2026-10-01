import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// Expense submit race (0034, fixed by 0053): two concurrent p34_submit_expense calls with one
// request id must return one expense id and write one row. Loopback disposable database only; load
// finance-expense-concurrency-fixture.sql first. Never point this at a hosted or shared database.
// Run with PHASE2_RACE_DATABASE, PHASE2_LOCAL_PORT, PHASE2_RUNTIME_PASSWORD and PHASE2_OWNER_PASSWORD.
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
  datasources: { db: { url: url('pathways_runtime', runtimePassword, 6) } },
})
const org = '7c000000-0000-4000-8000-000000000001'
const user = '7c000000-0000-4000-8000-000000000101'
const subject = '7c000000-0000-4000-8000-000000000201'
const project = '7c000000-0000-4000-8000-000000000301'
const budget = '7c000000-0000-4000-8000-000000000501'

async function claims(tx) {
  await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${subject}, true),
    set_config('request.jwt.claims', '', true), set_config('app.organization_id', ${org}, true),
    set_config('app.user_id', ${user}, true)`
}
async function submit(tx, request, amount) {
  await claims(tx)
  const [row] = await tx.$queryRaw`SELECT pathways.p34_submit_expense(${project}::uuid, ${request}::uuid,
    ${budget}::uuid, 'Venue', ${amount}::numeric, DATE '2026-09-30') AS value`
  return row.value.id
}
async function rows(request) {
  return runtime.$transaction(async (tx) => {
    await claims(tx)
    const [row] = await tx.$queryRaw`SELECT count(*)::int AS n FROM pathways.budget_expense_entries
      WHERE client_request_id=${request}::uuid`
    return row.n
  })
}

// Session A inserts and holds its transaction open; session B starts only once A holds the key.
async function race(secondAmount) {
  const request = randomUUID()
  let release
  let announce
  const released = new Promise((resolve) => {
    release = resolve
  })
  const inserted = new Promise((resolve) => {
    announce = resolve
  })
  const first = runtime.$transaction(
    async (tx) => {
      const id = await submit(tx, request, '1500.00')
      announce(id)
      await released
      return id
    },
    { timeout: 15000 },
  )
  const firstId = await Promise.race([inserted, first])
  let waiterPid
  const second = runtime
    .$transaction(
      async (tx) => {
        waiterPid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid
        return submit(tx, request, secondAmount)
      },
      { timeout: 15000 },
    )
    .then(
      (id) => ({ id }),
      (error) => ({ state: error.meta?.code ?? error.code }),
    )
  let blocked = false
  try {
    for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
      if (waiterPid !== undefined) {
        const [row] =
          await owner.$queryRaw`SELECT cardinality(pg_blocking_pids(${waiterPid}::integer)) > 0 AS blocked`
        blocked = row.blocked
      }
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25))
    }
  } finally {
    release()
  }
  assert.equal(await first, firstId)
  assert.equal(blocked, true, 'The second submit must wait on the request-id unique key.')
  return { request, firstId, outcome: await second }
}

try {
  // 1. Same input: the waiter replays the committed expense instead of failing with 23505.
  const same = await race('1500.00')
  assert.deepEqual(same.outcome, { id: same.firstId }, JSON.stringify(same.outcome))
  assert.equal(await rows(same.request), 1)
  // 2. Different input under the same request id: conflict (22023) and still one row.
  const different = await race('9999.00')
  assert.deepEqual(different.outcome, { state: '22023' }, JSON.stringify(different.outcome))
  assert.equal(await rows(different.request), 1)
  console.log('FINANCE_EXPENSE_CONCURRENCY=PASS')
} finally {
  await Promise.allSettled([owner.$disconnect(), runtime.$disconnect()])
}
