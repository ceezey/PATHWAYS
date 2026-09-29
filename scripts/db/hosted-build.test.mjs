import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  deriveExpectedRoles,
  postconditions,
  preflight,
  resumePreflight,
  runHostedBuild,
} from './hosted-build.mjs'
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
// `schemaPresent`/`rolePresent` simulate a partial build for --resume tests, where the
// pathways schema and the prisma role are already there (unlike a fresh, empty target).
function makeFakeIO({ ledgerRows = [], schemaPresent = false, rolePresent = false } = {}) {
  const calls = []
  let currentLedger = ledgerRows
  let receipt = null
  return {
    calls,
    setLedger(rows) {
      currentLedger = rows
    },
    getReceipt() {
      return receipt
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
      if (sql.includes("nspname='pathways'") && sql.includes('pg_namespace'))
        return [schemaPresent ? '1' : '0']
      if (sql.includes("nspname='auth'")) return ['1']
      if (
        sql.includes("rolname='prisma'") &&
        sql.includes('pg_roles') &&
        sql.includes('count(*)') &&
        !sql.includes('pg_auth_members')
      ) {
        return [rolePresent ? '1' : '0']
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
    writeReceipt(captured) {
      calls.push({ kind: 'writeReceipt', captured })
      receipt = captured
    },
    readReceipt() {
      calls.push({ kind: 'readReceipt' })
      return receipt
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
  assert.equal(kinds.filter((k) => k === 'deploy').length, 9)
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
  const io = makeFakeIO({ schemaPresent: true, rolePresent: true })
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

test('runHostedBuild --resume refuses a target with the schema/role absent (nothing to resume)', async () => {
  const io = makeFakeIO({ schemaPresent: false, rolePresent: false })
  io.setLedger([])
  await assert.rejects(() => runHostedBuild({ io, config, resume: true }), /nothing to resume/)
})

test('resumePreflight passes when schema and role are present and the ledger is a clean prefix', async () => {
  const io = makeFakeIO({ schemaPresent: true, rolePresent: true })
  io.setLedger(
    MIGRATIONS_IN_ORDER.slice(0, 5).map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const appliedCount = await resumePreflight(io, config)
  assert.equal(appliedCount, 5)
})

test('resumePreflight refuses when the pathways schema is absent', async () => {
  const io = makeFakeIO({ schemaPresent: false, rolePresent: true })
  await assert.rejects(() => resumePreflight(io, config), /pathways schema does not exist/)
})

test('resumePreflight refuses when the prisma role is absent', async () => {
  const io = makeFakeIO({ schemaPresent: true, rolePresent: false })
  await assert.rejects(() => resumePreflight(io, config), /prisma role does not exist/)
})

test('runHostedBuild runs the rules cleanup and rethrows when the 0031 deploy fails', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const originalDeploy = io.prismaMigrateDeploy.bind(io)
  io.prismaMigrateDeploy = (directUrl, stageDir) => {
    // The fake stages every deploy step under the same directory; use the call count to
    // target specifically the deploy step that immediately follows rules preprovision
    // (the second deploy call overall: range(27,30), then range(31,31)).
    const deployCallsSoFar = io.calls.filter((c) => c.kind === 'deploy').length
    if (deployCallsSoFar === 1) throw new Error('simulated 0031 deploy failure')
    return originalDeploy(directUrl, stageDir)
  }
  await assert.rejects(() => runHostedBuild({ io, config }), /simulated 0031 deploy failure/)
  const ranRulesCleanup = io.calls.some(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-rules-cleanup.sql'),
  )
  assert.ok(ranRulesCleanup, 'the rules cleanup must run when the 0031 deploy fails')
})

test('runHostedBuild runs the core cleanup and rethrows when the 0034 deploy fails', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const originalDeploy = io.prismaMigrateDeploy.bind(io)
  io.prismaMigrateDeploy = (directUrl, stageDir) => {
    const deployCallsSoFar = io.calls.filter((c) => c.kind === 'deploy').length
    if (deployCallsSoFar === 3) throw new Error('simulated 0034 deploy failure')
    return originalDeploy(directUrl, stageDir)
  }
  await assert.rejects(() => runHostedBuild({ io, config }), /simulated 0034 deploy failure/)
  const ranCoreCleanup = io.calls.some(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-core-cleanup.sql'),
  )
  assert.ok(ranCoreCleanup, 'the core cleanup must run when the 0034 deploy fails')
})

test('runHostedBuild runs the activity-media cleanup and rethrows when the 0041 deploy fails', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  const originalDeploy = io.prismaMigrateDeploy.bind(io)
  io.prismaMigrateDeploy = (directUrl, stageDir) => {
    const deployCallsSoFar = io.calls.filter((c) => c.kind === 'deploy').length
    if (deployCallsSoFar === 6) throw new Error('simulated 0041 deploy failure')
    return originalDeploy(directUrl, stageDir)
  }
  await assert.rejects(() => runHostedBuild({ io, config }), /simulated 0041 deploy failure/)
  const ranActivityMediaCleanup = io.calls.some(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-activity-media-cleanup.sql'),
  )
  assert.ok(
    ranActivityMediaCleanup,
    'the activity-media cleanup must run when the 0041 deploy fails',
  )
})

test('runHostedBuild persists the captured original_prisma_database_create via a receipt', async () => {
  const io = makeFakeIO()
  io.setLedger(
    MIGRATIONS_IN_ORDER.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  await runHostedBuild({ io, config })
  assert.deepEqual(io.getReceipt(), { originalPrismaDatabaseCreate: true })
})

test('runHostedBuild --resume after 0031 recovers original_prisma_database_create from the receipt for the rules cleanup', async () => {
  const io = makeFakeIO({ schemaPresent: true, rolePresent: true })
  // Ledger stops right after 0031 (index 6 in MIGRATIONS_IN_ORDER), as if a prior run
  // crashed after that deploy but the receipt from its rules preprovision survived.
  const appliedPrefix = MIGRATIONS_IN_ORDER.slice(0, 6)
  io.setLedger(
    appliedPrefix.map((migration_name) => ({
      migration_name,
      finished_at: 'now',
      rolled_back_at: null,
    })),
  )
  io.writeReceipt({ originalPrismaDatabaseCreate: true })
  io.calls.length = 0 // ignore the writeReceipt call itself for the assertions below
  await assert.rejects(() => runHostedBuild({ io, config, resume: true }))
  const rulesCleanupCall = io.calls.find(
    (c) => c.kind === 'psqlFile' && c.filePath.endsWith('hosted-rules-cleanup.sql'),
  )
  assert.ok(rulesCleanupCall, 'resume must run the rules cleanup step next')
  assert.ok(rulesCleanupCall.opts.vars.includes('original_prisma_database_create=true'))
})

test('runHostedBuild fresh path (no --resume) works with an absent ledger', async () => {
  const io = makeFakeIO({ schemaPresent: false, rolePresent: false })
  io.setLedger([])
  // Postconditions will fail because the fake does not simulate the ledger growing as
  // deploys run; this test only cares that preflight and the full step sequence proceed
  // from an empty target without requiring --resume's schema/role-present checks.
  await assert.rejects(() => runHostedBuild({ io, config }), /Ledger postcondition failed/)
  const ranCreateRole = io.calls.some(
    (c) => c.kind === 'psqlSql' && c.sql.includes('CREATE ROLE prisma'),
  )
  assert.ok(ranCreateRole, 'a fresh run with an absent ledger must still create the prisma role')
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
