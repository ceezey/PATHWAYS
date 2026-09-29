import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { deriveExpectedRoles, postconditions, preflight, runHostedBuild } from './hosted-build.mjs'
import { BASELINE, MIGRATIONS_IN_ORDER } from './hosted-plan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const config = {
  ref: 'klbtoqdalmcsfjqophty',
  adminUrl: 'postgresql://postgres.klbtoqdalmcsfjqophty:pw@example/postgres',
  directUrl: 'postgresql://prisma.klbtoqdalmcsfjqophty:pw@example/postgres',
  prismaPassword: 'a'.repeat(24),
  runtimePassword: 'b'.repeat(24),
}

// Records every call the orchestrator makes without touching a network or a
// process. `responses` maps a query-matching predicate to canned rows.
function makeFakeIO({ ledgerRows = [] } = {}) {
  const calls = []
  let currentLedger = ledgerRows
  return {
    calls,
    setLedger(rows) {
      currentLedger = rows
    },
    psqlSql(url, sql, opts) {
      calls.push({ kind: 'psqlSql', url, sql, opts })
    },
    psqlFile(url, filePath, opts) {
      calls.push({ kind: 'psqlFile', url, filePath, opts })
      if (filePath.endsWith('hosted-rules-preprovision.sql')) {
        return 'Original prisma database CREATE: t\n'
      }
      return ''
    },
    psqlQuery(url, sql) {
      calls.push({ kind: 'psqlQuery', url, sql })
      if (sql.includes("nspname='pathways'") && sql.includes('pg_namespace')) return ['0']
      if (sql.includes("nspname='auth'")) return ['1']
      if (
        sql.includes("rolname='prisma'") &&
        sql.includes('pg_roles') &&
        sql.includes('count(*)') &&
        !sql.includes('pg_auth_members')
      ) {
        return ['0']
      }
      if (sql.includes('to_regclass')) return [currentLedger.length ? 't' : 'f']
      if (sql.includes('_prisma_migrations')) {
        return currentLedger.map(
          (r) => `${r.migration_name}|${r.finished_at ?? ''}|${r.rolled_back_at ?? ''}`,
        )
      }
      if (sql.includes('pg_roles WHERE rolname IN')) {
        return [String(deriveExpectedRoles().all.length)]
      }
      if (sql.includes('pg_auth_members')) return ['0']
      return ['0']
    },
    prismaMigrateDeploy(directUrl, stageDir) {
      calls.push({ kind: 'deploy', directUrl, stageDir })
    },
    prismaMigrateResolve(directUrl, stageDir, migration) {
      calls.push({ kind: 'resolve', directUrl, stageDir, migration })
    },
  }
}

test('preflight passes when the target looks empty', async () => {
  const io = makeFakeIO()
  await preflight(io, config)
})

test('preflight refuses a target where the pathways schema already exists', async () => {
  const io = makeFakeIO()
  const original = io.psqlQuery.bind(io)
  io.psqlQuery = (url, sql) => (sql.includes("nspname='pathways'") ? ['1'] : original(url, sql))
  await assert.rejects(() => preflight(io, config), /pathways schema already exists/)
})

test('preflight refuses a target missing auth.users', async () => {
  const io = makeFakeIO()
  const original = io.psqlQuery.bind(io)
  io.psqlQuery = (url, sql) => (sql.includes("nspname='auth'") ? ['0'] : original(url, sql))
  await assert.rejects(() => preflight(io, config), /auth\.users does not exist/)
})

test('preflight refuses a target where the prisma role already exists', async () => {
  const io = makeFakeIO()
  const original = io.psqlQuery.bind(io)
  io.psqlQuery = (url, sql) =>
    sql.includes("rolname='prisma'") && !sql.includes('pg_auth_members')
      ? ['1']
      : original(url, sql)
  await assert.rejects(() => preflight(io, config), /prisma role already exists/)
})

test('runHostedBuild executes the full plan in order against a fake IO and reaches postconditions', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  await runHostedBuild({ io, config })
  const kinds = io.calls.map((c) => c.kind)
  assert.ok(kinds.includes('psqlSql'))
  assert.ok(kinds.includes('resolve'))
  assert.equal(kinds.filter((k) => k === 'deploy').length, 7)
  assert.equal(kinds.filter((k) => k === 'psqlFile').length, 7) // 4 preprovision + 3 cleanup
})

test('runHostedBuild passes the captured original_prisma_database_create value to the rules cleanup', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  await runHostedBuild({ io, config })
  const rulesCleanupCall = io.calls.find(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-rules-cleanup.sql'),
  )
  assert.ok(rulesCleanupCall.opts.vars.includes('original_prisma_database_create=true'))
})

test('runHostedBuild still runs cleanup when the matching preprovision step fails', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const originalPsqlFile = io.psqlFile.bind(io)
  io.psqlFile = (url, filePath, opts) => {
    if (filePath.endsWith('hosted-core-preprovision.sql'))
      throw new Error('simulated preprovision failure')
    return originalPsqlFile(url, filePath, opts)
  }
  await assert.rejects(() => runHostedBuild({ io, config }), /simulated preprovision failure/)
  const ranCoreCleanup = io.calls.some(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-core-cleanup.sql'),
  )
  assert.ok(
    ranCoreCleanup,
    'cleanup must still run in a finally-equivalent path after a preprovision failure',
  )
})

test('runHostedBuild with resume starts after the already-applied migrations instead of from scratch', async () => {
  const io = makeFakeIO()
  const appliedPrefix = MIGRATIONS_IN_ORDER.slice(0, 5) // through 0030, before rules preprovision
  io.setLedger(
    appliedPrefix.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  // The fake IO does not simulate deploy calls appending to the ledger, so
  // postconditions at the end will fail; this test only cares that the
  // right steps ran in the right order, not that the whole plan "completes".
  await assert.rejects(() => runHostedBuild({ io, config, resume: true }))
  const ranCreateRole = io.calls.some(
    (c) => c.kind === 'psqlSql' && c.sql.includes('CREATE ROLE prisma'),
  )
  assert.ok(!ranCreateRole, 'resume must not recreate the prisma role')
  const ranBaselineApply = io.calls.some((c) => c.kind === 'psqlSql' && c.opts?.label === BASELINE)
  assert.ok(!ranBaselineApply, 'resume must not reapply the baseline')
  const ranRulesPreprovision = io.calls.some(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-rules-preprovision.sql'),
  )
  assert.ok(ranRulesPreprovision, 'resume must continue from the next unfinished step')
})

test('postconditions fails when the ledger is missing a migration', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.slice(0, 10).map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  await assert.rejects(() => postconditions(io, config), /Ledger postcondition failed/)
})

test('postconditions passes and prints role/permission/grant PASS lines when everything matches', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const expected = deriveExpectedRoles()
  const originalQuery = io.psqlQuery.bind(io)
  io.psqlQuery = (url, sql) => {
    if (sql.includes('pg_roles WHERE rolname IN')) return [String(expected.all.length)]
    return originalQuery(url, sql)
  }
  const logs = []
  const originalLog = console.log
  console.log = (msg) => logs.push(msg)
  try {
    await postconditions(io, config)
  } finally {
    console.log = originalLog
  }
  assert.ok(
    logs.some((l) => l.startsWith(`PASS: ledger has exactly ${MIGRATIONS_IN_ORDER.length}`)),
  )
  assert.ok(logs.some((l) => l.startsWith('PASS: no residual')))
  assert.ok(logs.some((l) => l.startsWith('PASS: role count matches')))
  assert.ok(logs.some((l) => l.startsWith('PASS: schema-level permission grants')))
})

test('deriveExpectedRoles pulls role names from the actual reviewed phase6 preprovision scripts', () => {
  const expected = deriveExpectedRoles()
  assert.ok(expected.rulesRoles.includes('rules_store_owner'))
  assert.ok(expected.rulesRoles.includes('pathways_rules_worker'))
  assert.equal(expected.rulesRoles.length, 16)
  assert.deepEqual(expected.coreRoles, [
    'public_projection_owner',
    'report_projection_owner',
    'finance_operation_owner',
  ])
  assert.ok(expected.all.includes('prisma'))
  assert.ok(expected.all.includes('pathways_runtime'))
  assert.equal(expected.all.length, expected.rulesRoles.length + expected.coreRoles.length + 2)
})
