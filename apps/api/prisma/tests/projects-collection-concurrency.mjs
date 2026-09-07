import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

// Local synthetic fixtures only. Use a fresh disposable clone, never a hosted URL.
const database = process.env.PHASE2_RACE_DATABASE
assert.match(database ?? '', /^pathways_phase2_[a-z0-9_]+$/)
const url = new URL('postgresql:' + '//127.0.0.1')
url.port = process.env.PHASE2_LOCAL_PORT ?? '55439'
url.username = 'prisma'
url.pathname = `/${database}`
const options = { datasources: { db: { url: url.href } } }
const control = new PrismaClient(options)
const first = new PrismaClient(options)
const second = new PrismaClient(options)
const u = (number) => `'00000000-0000-4000-9000-${String(number).padStart(12, '0')}'`

async function race(label, firstSql, secondSql) {
  let releaseFirst
  let announceLock
  const release = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const locked = new Promise((resolve) => {
    announceLock = resolve
  })
  const holder = first.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(firstSql)
      announceLock()
      await release
    },
    { timeout: 15000 },
  )
  await Promise.race([locked, holder])
  const waiter = second
    .$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL application_name='phase2_constraint_waiter'")
        await tx.$executeRawUnsafe(secondSql)
      },
      { timeout: 15000 },
    )
    .then(
      () => ({ rejected: false }),
      (error) => ({ rejected: true, state: error.meta?.code }),
    )
  let waited = false
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [result] = await control.$queryRawUnsafe(
        "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='phase2_constraint_waiter' AND wait_event_type='Lock') AS blocked",
      )
      if (result.blocked) {
        waited = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
  } finally {
    releaseFirst()
  }
  await holder
  const outcome = await waiter
  assert.equal(waited, true, `${label}: must observe actual PostgreSQL lock contention`)
  assert.deepEqual(outcome, { rejected: true, state: '23514' }, label)
  console.log(`PASS: ${label}; waited for parent commit and rejected invalid child`)
}

try {
  const [identity] = await control.$queryRawUnsafe(
    'SELECT current_database() AS database, current_user AS role, host(inet_server_addr()) AS host',
  )
  assert.equal(identity.database, database)
  assert.equal(identity.role, 'prisma')
  assert.equal(identity.host, '127.0.0.1')
  await control.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO pathways.organizations(id,code,name) VALUES(${u(1)},'RACE_TEST','Synthetic race fixtures')`,
    )
    await tx.$executeRawUnsafe(
      `INSERT INTO pathways.roles(id,code,name) VALUES(${u(2)},'RACE_TEST','Synthetic local role')`,
    )
    for (const id of [3, 4]) {
      await tx.$executeRawUnsafe(
        `INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(${u(id)},${u(1)},${u(2)},'Synthetic user','race${id}@example.invalid','ACTIVE',now())`,
      )
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO pathways.projects(id,organization_id,code,title) VALUES(${u(10)},${u(1)},'RACE_TEST','Synthetic project')`,
    )
    await tx.$executeRawUnsafe(
      `INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name) VALUES(${u(20)},${u(1)},${u(10)},'RACE_TEST','Synthetic form')`,
    )
    await tx.$executeRawUnsafe(
      `INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,sequence_no) VALUES(${u(21)},${u(1)},${u(10)},${u(20)},'value','Value','TEXT',1)`,
    )
  })

  await race(
    'Concurrent profile suspension versus active assignment',
    `UPDATE pathways.system_users SET account_status='SUSPENDED',suspended_at=now() WHERE id=${u(3)}`,
    `INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(${u(1)},${u(10)},${u(3)},${u(4)})`,
  )
  await race(
    'Concurrent publication versus form field insertion',
    `UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id=${u(4)} WHERE id=${u(20)}`,
    `INSERT INTO pathways.form_fields(organization_id,project_id,form_id,code,label,data_type,sequence_no) VALUES(${u(1)},${u(10)},${u(20)},'late','Late unreviewed field','TEXT',2)`,
  )
  await control.$executeRawUnsafe(
    `INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,original_file_name,uploaded_by_id) VALUES(${u(30)},${u(1)},${u(10)},${u(20)},'synthetic.csv',${u(4)})`,
  )
  await control.$executeRawUnsafe(
    `INSERT INTO pathways.data_import_rows(id,organization_id,project_id,form_id,import_batch_id,row_number,raw_data) VALUES(${u(31)},${u(1)},${u(10)},${u(20)},${u(30)},1,'{}')`,
  )
  await race(
    'Concurrent invalid-row decision versus normalization',
    `UPDATE pathways.data_import_rows SET status='INVALID',validated_by_id=${u(4)},validated_at=now(),validation_errors='["invalid"]' WHERE id=${u(31)}`,
    `INSERT INTO pathways.form_submissions(organization_id,project_id,form_id,import_batch_id,import_row_id,submitted_by_id,source) VALUES(${u(1)},${u(10)},${u(20)},${u(30)},${u(31)},${u(4)},'IMPORTED_DATASET')`,
  )
  console.log('PHASE2_CONCURRENCY_ASSERTIONS_PASSED=3')
} catch (error) {
  // Never emit Prisma error objects: they can contain connection configuration.
  console.error('Phase 2 local concurrency verification failed.', {
    kind: error.name,
    code: error.code,
    sqlState: error.meta?.code,
    detail: error.name === 'AssertionError' ? error.message : undefined,
  })
  process.exitCode = 1
} finally {
  await Promise.all([control.$disconnect(), first.$disconnect(), second.$disconnect()])
}
