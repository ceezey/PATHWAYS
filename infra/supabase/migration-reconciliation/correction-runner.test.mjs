import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { cleanEnvironment } from './config.mjs'
import {
  canonicalObjectCount,
  canonicalVectorSha256,
  classifyComparison,
  correctionFiles,
  directory,
  knownDifferences,
  parseComparison,
  targetDefinitionSha256,
  validateArguments,
  verifyCorrectionSources,
} from './correction-config.mjs'

const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8')

test('reviewed correction sources retain exact fingerprints', () => {
  verifyCorrectionSources()
  assert.equal(Object.keys(correctionFiles).length, 3)
  assert.equal(targetDefinitionSha256.length, 64)
})

test('only exact local, read-only, correction and rollback invocations are accepted', () => {
  assert.equal(validateArguments(['--local']), '--local')
  assert.equal(validateArguments(['--check-dev']), '--check-dev')
  assert.equal(
    validateArguments([
      '--apply-dev',
      '--authorization=PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY',
      '--backup-restore-confirmed',
      '--maintenance-confirmed',
    ]),
    '--apply-dev',
  )
  assert.equal(
    validateArguments([
      '--rollback-dev',
      '--authorization=PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY',
      '--recovery-authorized',
      '--maintenance-confirmed',
    ]),
    '--rollback-dev',
  )
  for (const args of [
    [],
    ['--apply-dev'],
    ['--rollback-dev'],
    ['--apply-dev', '--authorization=wrong'],
    [
      '--apply-dev',
      '--authorization=PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY',
      '--maintenance-confirmed',
      '--backup-restore-confirmed',
    ],
    ['--check-dev', '--url=synthetic'],
  ]) {
    assert.throws(() => validateArguments(args), { message: 'CORRECTION_MODE' })
  }
})

test('hosted comparison accepts only the reviewed canonical vector and ledger', () => {
  const base = {
    status: 'BLOCKED',
    hostedWrites: 0,
    localClusterStopped: true,
    canonicalObjects: canonicalObjectCount,
    canonicalSha256: canonicalVectorSha256,
    hostedLedgerPrefix: 1,
    baseliningAuthorized: false,
    differences: knownDifferences,
  }
  assert.equal(classifyComparison(parseComparison(JSON.stringify(base))), 'READY_TO_CORRECT')
  assert.equal(
    classifyComparison(
      parseComparison(JSON.stringify({ ...base, status: 'PASS', differences: [] })),
    ),
    'READY_TO_ROLLBACK',
  )
  assert.equal(
    classifyComparison(
      parseComparison(
        JSON.stringify({
          ...base,
          differences: [{ key: 'unknown:synthetic', kind: 'extra' }],
        }),
      ),
    ),
    'BLOCKED',
  )
  for (const mutation of [
    { hostedWrites: 1 },
    { localClusterStopped: false },
    { canonicalObjects: canonicalObjectCount - 1 },
    { canonicalSha256: '0'.repeat(64) },
    { hostedLedgerPrefix: 5 },
    { baseliningAuthorized: true },
  ]) {
    assert.throws(() => parseComparison(JSON.stringify({ ...base, ...mutation })))
  }
})

test('correction is one bounded transaction for only the exact function with RESTRICT', () => {
  const sql = read('correction.sql')
  assert.match(sql, /^--[\s\S]*\nBEGIN;/)
  assert.match(sql, /SET LOCAL statement_timeout = '15s'/)
  assert.match(sql, /SET LOCAL lock_timeout = '3s'/)
  assert.match(sql, /current_database\(\) <> 'postgres'/)
  assert.match(sql, /session_user <> 'postgres'/)
  assert.match(sql, /migration_name = '0001_init'/)
  assert.match(sql, new RegExp(targetDefinitionSha256))
  assert.match(sql, /actual_acl <> '\[\["prisma", "prisma", "EXECUTE", false\]\]'::jsonb/)
  assert.match(sql, /pg_trigger/)
  assert.match(sql, /pg_depend/)
  assert.match(sql, /DROP FUNCTION public\.pathways_prevent_audit_mutation\(\) RESTRICT;/)
  assert.doesNotMatch(sql, /\bCASCADE\b/i)
  assert.equal((sql.match(/\bDROP FUNCTION\b/gi) ?? []).length, 1)
  assert.match(sql, /COMMIT;\nSELECT 'PATHWAYS_AUDIT_FUNCTION_CORRECTION_COMMITTED';\s*$/)
})

test('rollback restores the exact reviewed body, owner and owner-only ACL', () => {
  const sql = read('correction-rollback.sql')
  assert.match(sql, /ROLLBACK_CONFLICT_REFUSED/)
  assert.match(
    sql,
    /CREATE FUNCTION public\.pathways_prevent_audit_mutation\(\)\nRETURNS trigger\nLANGUAGE plpgsql\nAS \$function\$\nBEGIN\n {2}RAISE EXCEPTION 'Audit records are immutable';\nEND;\n\$function\$;/,
  )
  assert.match(sql, /ALTER FUNCTION public\.pathways_prevent_audit_mutation\(\) OWNER TO prisma;/)
  assert.match(sql, /FROM PUBLIC;/)
  assert.match(sql, /FROM anon, authenticated, service_role, pathways_runtime;/)
  assert.match(sql, new RegExp(targetDefinitionSha256))
  assert.doesNotMatch(sql, /\bCASCADE\b/i)
  assert.match(sql, /COMMIT;\nSELECT 'PATHWAYS_AUDIT_FUNCTION_ROLLBACK_COMMITTED';\s*$/)
})

test('verification is catalog-only and intended for a read-only wrapper', () => {
  const sql = read('correction-verify.sql')
  assert.match(sql, /pg_get_functiondef/)
  assert.match(sql, /pg_trigger/)
  assert.match(sql, /pg_depend/)
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i)
  assert.doesNotMatch(sql, /\bFROM\s+(auth|storage|pathways)\./i)
})

test('protected writer hardcodes target, fingerprints, authorization and uncertain handling', () => {
  const source = read('Write-DevCorrection.ps1')
  assert.match(source, /postgres\.pdqwsknbzkdtiwjjibqt/)
  assert.match(source, /aws-1-ap-southeast-2\.pooler\.supabase\.com -p 5432/)
  assert.match(source, /PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY/)
  assert.match(source, /PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY/)
  assert.match(source, /BackupRestoreConfirmed/)
  assert.match(source, /MaintenanceConfirmed/)
  assert.match(source, /EnvironmentVariables\.Clear\(\)/)
  assert.match(source, /WaitForExit\(50000\)/)
  assert.match(source, /"status":"UNCERTAIN"/)
  assert.doesNotMatch(source, /\.Kill\(/)
  assert.doesNotMatch(source, /migrate|resolve|db push|Write-Output.*correctionError/i)
})

test('CLI rejects incomplete hosted write modes without starting comparison or a writer', () => {
  for (const args of [['--apply-dev'], ['--rollback-dev'], ['--check-dev', '--extra']]) {
    const result = spawnSync(
      process.execPath,
      [path.join(directory, 'correction-runner.mjs'), ...args],
      { encoding: 'utf8', env: cleanEnvironment(), windowsHide: true },
    )
    assert.equal(result.status, 1)
    assert.equal(JSON.parse(result.stdout).mode, 'rejected')
    assert.equal(result.stderr, '')
  }
})
