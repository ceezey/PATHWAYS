import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  assertBackupMetadata,
  backupRestoreDirectory,
  backupRestoreFiles,
  backupTableCount,
  compareCatalogSections,
  compareDataSnapshots,
  validateBackupRestoreArguments,
  verifyBackupRestoreSources,
} from './backup-restore-config.mjs'
import { cleanEnvironment } from './config.mjs'

const read = (name) => fs.readFileSync(path.join(backupRestoreDirectory, name), 'utf8')
const dataRows = () =>
  Array.from({ length: backupTableCount }, (_, index) => ({
    key: `pathways.table_${index}`,
    rows: index,
    sha256: index.toString(16).padStart(64, '0'),
  }))

test('reviewed backup/restore sources retain exact fingerprints', () => {
  verifyBackupRestoreSources()
  assert.equal(Object.keys(backupRestoreFiles).length, 4)
})

test('only the exact rehearsal authorization is accepted', () => {
  assert.equal(
    validateBackupRestoreArguments([
      '--run-dev',
      '--authorization=PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY',
    ]),
    '--run-dev',
  )
  for (const args of [
    [],
    ['--run-dev'],
    ['--apply-dev'],
    ['--run-dev', '--authorization=wrong'],
    ['--authorization=PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY', '--run-dev'],
  ]) {
    assert.throws(() => validateBackupRestoreArguments(args), {
      message: 'BACKUP_RESTORE_MODE',
    })
  }
})

test('backup metadata requires stable hosted snapshots and private digest evidence', () => {
  const rows = dataRows()
  const metadata = {
    version: 1,
    target: 'PATHWAYS-dev',
    projectRef: 'pdqwsknbzkdtiwjjibqt',
    hostedWrites: 0,
    backupCompletedUtc: '2026-09-09T00:00:00.000Z',
    archiveSha256: 'a'.repeat(64),
    archiveBytes: 1,
    archiveListSha256: 'b'.repeat(64),
    tableDataEntries: backupTableCount,
    catalogBefore: { stable: true },
    catalogAfter: { stable: true },
    dataBefore: rows,
    dataAfter: structuredClone(rows),
  }
  assert.doesNotThrow(() => assertBackupMetadata(metadata))
  for (const changed of [
    { hostedWrites: 1 },
    { target: 'production' },
    { archiveSha256: 'invalid' },
    { tableDataEntries: backupTableCount - 1 },
    { dataAfter: rows.slice(1) },
    { catalogAfter: { stable: false } },
  ]) {
    assert.throws(() => assertBackupMetadata({ ...metadata, ...changed }))
  }
})

test('data comparison separates count and deterministic hash failures', () => {
  const expected = dataRows()
  assert.deepEqual(compareDataSnapshots(expected, structuredClone(expected)), {
    counts: true,
    hashes: true,
    all: true,
  })
  const countDrift = structuredClone(expected)
  countDrift[0].rows += 1
  assert.deepEqual(compareDataSnapshots(expected, countDrift), {
    counts: false,
    hashes: true,
    all: false,
  })
  const hashDrift = structuredClone(expected)
  hashDrift[0].sha256 = 'f'.repeat(64)
  assert.deepEqual(compareDataSnapshots(expected, hashDrift), {
    counts: true,
    hashes: false,
    all: false,
  })
})

test('catalog comparison reports ownership, ACL, RLS, policy and trigger sections', () => {
  const fingerprint = 'a'.repeat(64)
  const expected = [
    { key: 'relation:pathways.test:properties', fingerprint },
    { key: 'table-acl:pathways.test', fingerprint },
    { key: 'rls:pathways.test', fingerprint },
    { key: 'policy:pathways.test.read', fingerprint },
    { key: 'trigger:pathways.test.guard', fingerprint },
  ]
  assert.deepEqual(compareCatalogSections(expected, structuredClone(expected)), {
    full: true,
    ownership: true,
    acl: true,
    rls: true,
    policies: true,
    triggers: true,
  })
  const changed = structuredClone(expected)
  changed[4].fingerprint = 'b'.repeat(64)
  const result = compareCatalogSections(expected, changed)
  assert.equal(result.full, false)
  assert.equal(result.triggers, false)
  assert.equal(result.acl, true)
})

test('hosted helper hardcodes read-only PATHWAYS-dev custom-format backup', () => {
  const source = read('Backup-Dev.ps1')
  assert.match(source, /PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY/)
  assert.match(source, /postgres\.pdqwsknbzkdtiwjjibqt/)
  assert.match(source, /aws-1-ap-southeast-2\.pooler\.supabase\.com/)
  assert.match(source, /default_transaction_read_only=on/)
  assert.match(source, /'-Fc', '-Z6', '--serializable-deferrable', '--no-password'/)
  assert.match(source, /'--schema=public', '--schema=pathways'/)
  assert.match(source, /EnvironmentVariables\.Clear\(\)/)
  assert.match(source, /Set-BackupProtectedAcl/)
  assert.doesNotMatch(
    source,
    /--apply-dev|--rollback-dev|Write-DevCorrection|migrate\s+(deploy|dev|reset|resolve)|db push/i,
  )
  assert.doesNotMatch(source, /Write-Output.*backup(Error|Credential|ArchiveSha256)/i)
})

test('row fingerprint query is bounded, read-only and returns hashes rather than rows', () => {
  const sql = read('backup-data-inventory.sql')
  assert.match(sql, /^--[\s\S]*BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/)
  assert.match(sql, /statement_timeout = '120s'/)
  assert.match(sql, /sha256\(convert_to/)
  assert.match(sql, /ROLLBACK;\s*$/)
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/i)
})

test('local bootstraps reject every non-disposable target and copy no Auth attributes', () => {
  const roles = read('backup-restore-local-bootstrap.sql')
  const auth = read('backup-restore-auth-bootstrap.sql')
  for (const source of [roles, auth]) {
    assert.match(source, /current_database\(\) <> 'pathways_phase4_backup_restore'/)
    assert.match(source, /inet_server_addr\(\) IS DISTINCT FROM '127\.0\.0\.1'/)
  }
  assert.match(auth, /SELECT DISTINCT auth_user_id/)
  assert.match(auth, /CREATE TABLE auth\.users \(id uuid PRIMARY KEY\)/)
  assert.doesNotMatch(
    auth,
    /\b(email|encrypted_password|raw_user_meta_data|raw_app_meta_data|refresh_token)\b/i,
  )
})

test('runner contains no hosted correction, rollback, migration or environment-file path', () => {
  const source = read('backup-restore-runner.mjs')
  assert.match(source, /correction-runner\.mjs'\), '--check-dev'/)
  assert.match(source, /restoreTargetLoopbackOnly: true/)
  assert.match(source, /localRestoreRemoved/)
  assert.match(source, /stage: result\.stage/)
  assert.doesNotMatch(
    source,
    /--apply-dev|--rollback-dev|Write-DevCorrection|migrate['"]\s*,?['"]?(deploy|dev|reset|resolve)|db push|\.env/i,
  )
})

test('CLI rejects incomplete invocation before reading a credential or opening a port', () => {
  for (const args of [[], ['--run-dev'], ['--apply-dev']]) {
    const execution = spawnSync(
      process.execPath,
      [path.join(backupRestoreDirectory, 'backup-restore-runner.mjs'), ...args],
      { encoding: 'utf8', env: cleanEnvironment(), windowsHide: true },
    )
    assert.equal(execution.status, 1)
    const result = JSON.parse(execution.stdout)
    assert.equal(result.status, 'FAILED')
    assert.equal(result.stage, 'authorization')
    assert.equal(result.hostedWrites, 0)
    assert.equal(execution.stderr, '')
  }
})
