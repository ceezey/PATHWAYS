import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fixture,
  inspectFixture,
  requireExecutionAuthority,
  verifyTarget,
} from './Prepare-P07W10Fixture.mjs'

const target = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co',
  DIRECT_URL:
    'postgresql://prisma.pdqwsknbzkdtiwjjibqt:synthetic@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres',
}

test('fixture identities are fixed and the target refuses production or another project', () => {
  assert.equal(fixture.organizationCode, 'P07_W10_ORG_B')
  assert.equal(verifyTarget(target).hostname, 'aws-1-ap-southeast-2.pooler.supabase.com')
  assert.throws(() => verifyTarget({ ...target, NODE_ENV: 'production' }))
  assert.throws(() => verifyTarget({ ...target, SUPABASE_URL: 'https://other.supabase.co' }))
  assert.throws(() =>
    verifyTarget({ ...target, DIRECT_URL: target.DIRECT_URL.replace('5432', '6543') }),
  )
})

test('apply requires exact approval, current backup reference and one Auth UUID', () => {
  const authorized = {
    P07_W10_MANAGED_APPROVAL: 'APPROVE PATHWAYS-dev P07_W10_MANAGED_V1 ONLY',
    P07_W10_BACKUP_REFERENCE: 'synthetic-current-backup-ref',
    P07_W10_AUTH_USER_ID: 'f5b3709a-4f66-4bdb-a6c3-f0ca4076e459',
  }
  assert.doesNotThrow(() => requireExecutionAuthority(authorized))
  assert.throws(() => requireExecutionAuthority({ ...authorized, P07_W10_MANAGED_APPROVAL: '' }))
  assert.throws(() => requireExecutionAuthority({ ...authorized, P07_W10_BACKUP_REFERENCE: '' }))
  assert.throws(() => requireExecutionAuthority({ ...authorized, P07_W10_AUTH_USER_ID: '' }))
})

function readOnlyTx(overrides = {}) {
  const row = {
    baseline_code: 'PLAN_PH',
    baseline_status: 'ACTIVE',
    organization_count: 1,
    organization_collision: 0,
    project_collision: 0,
    profile_collision: 0,
    activity_collision: 0,
    import_collision: 0,
    role_id: 'role-id',
    migration_checksum: fixture.migrationSha256,
    finished_migration_count: 20,
    bad_migration_count: 0,
    latest_migration: fixture.migrationName,
    runtime_bypass: false,
    ...overrides,
  }
  return { $queryRaw: async () => [row] }
}

test('read-only fixture inspection refuses existing IDs, bad ledger or BYPASSRLS', async () => {
  assert.equal(await inspectFixture(readOnlyTx()), 'role-id')
  await assert.rejects(inspectFixture(readOnlyTx({ organization_collision: 1 })))
  await assert.rejects(inspectFixture(readOnlyTx({ migration_checksum: null })))
  await assert.rejects(inspectFixture(readOnlyTx({ latest_migration: '0021_unreviewed' })))
  await assert.rejects(inspectFixture(readOnlyTx({ bad_migration_count: 1 })))
  await assert.rejects(inspectFixture(readOnlyTx({ runtime_bypass: true })))
})
