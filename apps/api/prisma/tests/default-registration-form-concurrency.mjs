import assert from 'node:assert/strict'
import prismaClient from '@prisma/client'

// cr-pathways-default-registration-form (0040): parallel first calls from two registrars create
// exactly one tagged form, one audit row and one field set, and a later call returns the same form.
// Loopback disposable database only; load default-registration-form-concurrency-fixture.sql first.
// Never point this at a hosted or shared database.
const { PrismaClient } = prismaClient
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
  datasources: { db: { url: url('pathways_runtime', runtimePassword, 12) } },
})
const org = '7a000000-0000-4000-8000-000000000001'
const project = '7a000000-0000-4000-8000-000000000041'
const secondProject = '7a000000-0000-4000-8000-000000000042'
const actors = [
  { user: '7a000000-0000-4000-8000-000000000031', subject: '7a000000-0000-4000-8000-000000000011' },
  { user: '7a000000-0000-4000-8000-000000000032', subject: '7a000000-0000-4000-8000-000000000012' },
]

async function ensure(tx, actor, wanted = project) {
  await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${actor.subject}, true),
    set_config('request.jwt.claims', '', true), set_config('app.organization_id', ${org}, true),
    set_config('app.user_id', ${actor.user}, true)`
  const [row] = await tx.$queryRaw`SELECT provisioned_form::text AS "formId", outcome
    FROM pathways.ensure_default_registration_form(${wanted}::uuid)`
  return row
}
const state = async (wanted = project) =>
  (
    await owner.$queryRaw`SELECT
      (SELECT count(*)::int FROM pathways.digital_forms WHERE organization_id=${org}::uuid
        AND project_id=${wanted}::uuid AND system_template_key IS NOT NULL) AS forms,
      (SELECT count(*)::int FROM pathways.form_fields f JOIN pathways.digital_forms d ON d.id=f.form_id
        WHERE d.organization_id=${org}::uuid AND d.project_id=${wanted}::uuid AND d.system_template_key IS NOT NULL) AS fields,
      (SELECT count(*)::int FROM pathways.audit_logs WHERE organization_id=${org}::uuid
        AND project_id=${wanted}::uuid AND action='DEFAULT_REGISTRATION_FORM_PROVISIONED') AS audits`
  )[0]

try {
  assert.deepEqual(await state(), { forms: 0, fields: 0, audits: 0 }, 'Fresh fixture required.')
  assert.deepEqual(await state(secondProject), { forms: 0, fields: 0, audits: 0 })

  // 1. A provisioning call waits while another transaction holds the per-project lock.
  let release
  let announce
  const released = new Promise((resolve) => {
    release = resolve
  })
  const locked = new Promise((resolve) => {
    announce = resolve
  })
  const holder = runtime.$transaction(
    async (tx) => {
      const first = await ensure(tx, actors[0])
      announce(first)
      await released
      return first
    },
    { timeout: 15000 },
  )
  const first = await locked
  assert.equal(first.outcome, 'PROVISIONED')
  let waiterPid
  const waiter = runtime.$transaction(
    async (tx) => {
      waiterPid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid
      return ensure(tx, actors[1])
    },
    { timeout: 15000 },
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
  await holder
  assert.equal(blocked, true, 'A concurrent first call must wait on the per-project lock.')
  assert.deepEqual(await waiter, { formId: first.formId, outcome: 'EXISTING' })

  // 2. Ten parallel calls from both registrars all return the same single form.
  const outcomes = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      runtime.$transaction((tx) => ensure(tx, actors[index % 2]), { timeout: 15000 }),
    ),
  )
  assert.ok(
    outcomes.every((row) => row.formId === first.formId && row.outcome === 'EXISTING'),
    JSON.stringify(outcomes),
  )
  assert.deepEqual(await state(), { forms: 1, fields: 22, audits: 1 })

  // 3. Ten simultaneous first calls on an unprovisioned project: exactly one provisions.
  const racing = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      runtime.$transaction((tx) => ensure(tx, actors[index % 2], secondProject), {
        timeout: 15000,
      }),
    ),
  )
  const provisioned = racing.filter((row) => row.outcome === 'PROVISIONED')
  assert.equal(provisioned.length, 1, JSON.stringify(racing))
  assert.ok(
    racing.every((row) => row.formId === provisioned[0].formId),
    JSON.stringify(racing),
  )
  assert.deepEqual(await state(secondProject), { forms: 1, fields: 22, audits: 1 })
  console.log('DEFAULT_REGISTRATION_FORM_CONCURRENCY=PASS')
} finally {
  await Promise.allSettled([owner.$disconnect(), runtime.$disconnect()])
}
