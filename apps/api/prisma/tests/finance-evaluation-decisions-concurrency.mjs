import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

// Local synthetic fixtures only. Use a fresh disposable clone, never a hosted URL.
const database = process.env.PHASE3_RACE_DATABASE
assert.match(database ?? '', /^pathways_phase3_[a-z0-9_]+$/)
const url = new URL('postgresql:' + '//127.0.0.1')
url.port = process.env.PHASE3_LOCAL_PORT ?? '55439'
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
        await tx.$executeRawUnsafe("SET LOCAL application_name='phase3_constraint_waiter'")
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
        "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='phase3_constraint_waiter' AND wait_event_type='Lock') AS blocked",
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
    const statements = [
      `INSERT INTO pathways.organizations(id,code,name) VALUES(${u(1)},'P3_RACE','Synthetic race fixtures')`,
      `INSERT INTO pathways.roles(id,code,name) VALUES(${u(2)},'P3_RACE','Synthetic local role')`,
      ...[3, 4, 5].map(
        (id) =>
          `INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(${u(id)},${u(1)},${u(2)},'Synthetic actor','p3race${id}@example.invalid','ACTIVE',now())`,
      ),
      `INSERT INTO pathways.projects(id,organization_id,code,title) VALUES(${u(10)},${u(1)},'P3_RACE','Synthetic project')`,
      `INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(${u(20)},${u(1)},${u(10)},'RACE',1,'KPI','Synthetic criterion',100,10,${u(3)}),(${u(21)},${u(1)},${u(10)},'RACE',2,'KPI','Criterion publication race',100,10,${u(3)})`,
      `UPDATE pathways.project_evaluation_criteria SET status='PUBLISHED',published_by_id=${u(4)},published_at=now() WHERE id=${u(20)}`,
      `INSERT INTO pathways.project_evaluations(id,organization_id,project_id,title,period_start,period_end,evaluated_by_id) VALUES(${u(30)},${u(1)},${u(10)},'Synthetic evaluation','2026-01-01','2026-09-01',${u(3)})`,
      `INSERT INTO pathways.project_evaluation_scores(id,organization_id,project_id,evaluation_id,criterion_id,score,maximum_score,weighted_score,criterion_snapshot) VALUES(${u(31)},${u(1)},${u(10)},${u(30)},${u(20)},8,10,80,'{}')`,
      `INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id) VALUES(${u(40)},${u(1)},'P3_RACE',1,'Synthetic rule','COMBINED_CONDITION','ALL',${u(3)})`,
      `INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(${u(41)},${u(1)},${u(40)},1,'OUTCOME_SCORE','LT',10)`,
      `INSERT INTO pathways.alert_rule_recommendations(id,organization_id,rule_id,title,text,type,created_by_id) VALUES(${u(42)},${u(1)},${u(40)},'Review','Human review only','REVIEW_PROMPT',${u(3)})`,
      `INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id) VALUES(${u(50)},${u(1)},${u(10)},'Synthetic','PHP',100,${u(3)}),(${u(51)},${u(1)},${u(10)},'Archival race','PHP',100,${u(3)})`,
      `INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(${u(60)},${u(1)},${u(10)},${u(50)},'Synthetic expense',25,current_date,${u(3)})`,
      `INSERT INTO pathways.evidence_media(id,organization_id,project_id,expense_id,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id) VALUES(${u(61)},${u(1)},${u(10)},${u(60)},'Synthetic receipt','pathways-private','organizations/'||${u(1)}::text||'/projects/'||${u(10)}::text||'/evidence/'||${u(61)}::text||'/receipt.pdf',repeat('c',64),10,'application/pdf',${u(3)})`,
      `UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=${u(4)},verified_at=now() WHERE id=${u(61)}`,
      `UPDATE pathways.budget_expense_entries SET receipt_evidence_id=${u(61)} WHERE id=${u(60)}`,
    ]
    for (const sql of statements) await tx.$executeRawUnsafe(sql)
  })
  await race(
    'Evaluation submission versus score edit',
    `UPDATE pathways.project_evaluations SET status='SUBMITTED',evaluated_at=now() WHERE id=${u(30)}`,
    `UPDATE pathways.project_evaluation_scores SET score=9 WHERE id=${u(31)}`,
  )
  await race(
    'Criterion publication versus definition edit',
    `UPDATE pathways.project_evaluation_criteria SET status='PUBLISHED',published_by_id=${u(4)},published_at=now() WHERE id=${u(21)}`,
    `UPDATE pathways.project_evaluation_criteria SET maximum_score=20 WHERE id=${u(21)}`,
  )
  await race(
    'Rule activation versus condition edit',
    `UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id=${u(4)},activated_at=now() WHERE id=${u(40)}`,
    `UPDATE pathways.alert_rule_conditions SET threshold=20 WHERE id=${u(41)}`,
  )
  await race(
    'Rule archival versus new evaluation',
    `UPDATE pathways.alert_rules SET status='ARCHIVED',archived_at=now() WHERE id=${u(40)}`,
    `INSERT INTO pathways.rule_based_alerts(organization_id,project_id,rule_id,title,message,severity,observed_values,evaluated_snapshot,evaluated_by_id) VALUES(${u(1)},${u(10)},${u(40)},'Late','Late','MEDIUM','{"OUTCOME_SCORE":1}','{}',${u(3)})`,
  )
  await race(
    'Receipt rejection versus expense verification',
    `UPDATE pathways.evidence_media SET status='REJECTED',rejected_by_id=${u(5)},rejected_at=now(),rejection_reason='Synthetic rejection' WHERE id=${u(61)}`,
    `UPDATE pathways.budget_expense_entries SET status='VERIFIED',verified_by_id=${u(4)},verified_at=now() WHERE id=${u(60)}`,
  )
  await race(
    'Budget archival versus new expense',
    `UPDATE pathways.project_budget_records SET archived_at=now() WHERE id=${u(51)}`,
    `INSERT INTO pathways.budget_expense_entries(organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(${u(1)},${u(10)},${u(51)},'Late expense',1,current_date,${u(3)})`,
  )
  console.log('PHASE3_CONCURRENCY_ASSERTIONS_PASSED=6')
} catch (error) {
  // Never emit Prisma error objects: they can contain connection configuration.
  console.error('Phase 3 local concurrency verification failed.', {
    kind: error.name,
    code: error.code,
    sqlState: error.meta?.code,
    detail: error.name === 'AssertionError' ? error.message : undefined,
  })
  process.exitCode = 1
} finally {
  await Promise.all([control.$disconnect(), first.$disconnect(), second.$disconnect()])
}
