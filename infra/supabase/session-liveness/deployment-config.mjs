import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const directory = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(directory, '../../..')
export const deployAuthorization = 'PATHWAYS_DEV_SESSION_LIVENESS_0006_ONLY'
export const rollbackAuthorization = 'PATHWAYS_DEV_SESSION_LIVENESS_0006_ROLLBACK_ONLY'
export const recoveryAuthorization = 'PATHWAYS_DEV_SESSION_LIVENESS_0006_RECOVERY_READ_ONLY'
export const evidenceVersion = 2
export const canonicalObjectCount = 1193
export const canonicalVectorSha256 =
  '36d404835e94e8fd4bf94afd4688d15b5292eba451ef237ae6229309cf989777'
export const expectedDataTables = 54
export const preparedDirtyEntries = 116
export const migrationLockSha256 =
  '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48'
export const migrations = Object.freeze(
  [
    ['0001_init', '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab'],
    [
      '0002_pathways_foundation',
      'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2',
    ],
    [
      '0003_pathways_projects_collection',
      '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b',
    ],
    [
      '0004_pathways_finance_evaluation_decisions',
      '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b',
    ],
    [
      '0005_supabase_security_adapter',
      '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc',
    ],
    [
      '0006_auth_session_liveness',
      '8034f7910e09fae33c6f10d7bec434cf0bc65555e057aa2dd262d35a9b8ade00',
    ],
  ].map((entry) => Object.freeze(entry)),
)

const livenessObjectKeys = Object.freeze([
  'function:pathways.runtime_auth_session_live(p_subject uuid, p_session uuid)',
  'function-acl:pathways.runtime_auth_session_live(p_subject uuid, p_session uuid)',
])

export const sourceHashes = Object.freeze({
  'Invoke-LocalLivenessChild.ps1':
    '1eb5052be5b8dbaaa91d2330c3a089a33ae21210e18a4c1dc9a9eb3190f4377a',
  'writer-child.local.test.mjs': '9126179fb983bb83be745bba664a50acd91d1b40977db6a12b7e2076ed47256b',
  'Read-DevSessionLiveness.ps1': '0a1b07145b5c976b58bae70cc97a4d995fcebad20c7cf869ad5ccdc8a2330b47',
  'Write-DevSessionLiveness.ps1':
    '05ab5b0a245f5a52eeec87f9daddfb40e75148b3d92aba1c1b164959c66315e2',
  'prisma.deploy.config.ts': 'c8d6795869e4d4b67cd2f6a33a888a2703bfdab9d320b4770fde0d4510328d77',
  'startup-check.mjs': '04f78f71a8981f045a8ce2a03e22d0ea13931b6718a114209386f4f899c8ec44',
  'read-status.sql': '7daf4975a7b922a7c9f4bdcfb9811a5e67f1ad12905c2fbc2e46f2f3a9fab78d',
  'rollback.sql': '5a48e607995d85b83f15be3586bee143264656548c23b19569587d8005fd452d',
  'verify.sql': '1861f1031f3306b5ff72b985243bc447a6afeb8bf489acf918c756872e7d22bf',
})

export function requireCheck(condition, code) {
  if (!condition) throw new Error(code)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function verifySources() {
  requireCheck(root === 'C:\\PATHWAYS', 'LIVENESS_ROOT')
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  requireCheck(
    git(['rev-parse', '--show-toplevel']).replaceAll('\\', '/') === 'C:/PATHWAYS',
    'LIVENESS_GIT_ROOT',
  )
  requireCheck(git(['branch', '--show-current']) === 'Backend-DB', 'LIVENESS_GIT_BRANCH')
  requireCheck(
    git(['rev-parse', 'HEAD']) === 'faa75005ed3813e9ac5550dd0e4ee94ab7039306',
    'LIVENESS_GIT_HEAD',
  )
  const dirty = git(['status', '--porcelain=v1', '-uall'])
  requireCheck(
    (dirty ? dirty.split(/\r?\n/).length : 0) === preparedDirtyEntries,
    'LIVENESS_GIT_BASELINE',
  )
  for (const [name, expected] of migrations) {
    requireCheck(
      sha256(
        fs.readFileSync(path.join(root, 'apps/api/prisma/migrations', name, 'migration.sql')),
      ) === expected,
      'LIVENESS_MIGRATION_CHECKSUM',
    )
  }
  for (const [name, expected] of Object.entries(sourceHashes)) {
    requireCheck(/^[0-9a-f]{64}$/.test(expected), 'LIVENESS_SOURCE_UNPINNED')
    requireCheck(
      sha256(fs.readFileSync(path.join(directory, name))) === expected,
      'LIVENESS_SOURCE_CHECKSUM',
    )
  }
  const migrationDirectories = fs
    .readdirSync(path.join(root, 'apps/api/prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  requireCheck(
    JSON.stringify(migrationDirectories) === JSON.stringify(migrations.map(([name]) => name)),
    'LIVENESS_MIGRATION_HISTORY',
  )
}

export function validateArguments(argv) {
  if (argv.length === 1 && ['--local', '--check-dev'].includes(argv[0])) {
    return { mode: argv[0].slice(2) }
  }
  const apply = [
    '--apply-dev',
    `--authorization=${deployAuthorization}`,
    '--backup-restore-confirmed',
    '--maintenance-confirmed',
  ]
  if (JSON.stringify(argv) === JSON.stringify(apply)) return { mode: 'apply-dev' }
  const rollback = [
    '--rollback-dev',
    `--authorization=${rollbackAuthorization}`,
    '--recovery-authorized',
    '--maintenance-confirmed',
  ]
  if (JSON.stringify(argv) === JSON.stringify(rollback)) return { mode: 'rollback-dev' }
  if (
    argv.length === 3 &&
    argv[0] === '--recover-dev' &&
    /^--evidence=\.tmp\/pathways-session-liveness-[A-Za-z0-9]+$/.test(argv[1]) &&
    argv[2] === `--authorization=${recoveryAuthorization}`
  ) {
    return { mode: 'recover-dev', evidence: argv[1].slice('--evidence='.length) }
  }
  throw new Error('LIVENESS_ARGUMENTS')
}

export function validateEvidence(relativePath) {
  requireCheck(
    /^\.tmp\/pathways-session-liveness-[A-Za-z0-9]+$/.test(relativePath),
    'LIVENESS_EVIDENCE_PATH',
  )
  const resolved = fs.realpathSync(path.join(root, relativePath))
  requireCheck(
    path.dirname(resolved) === fs.realpathSync(path.join(root, '.tmp')) &&
      /^pathways-session-liveness-[A-Za-z0-9]+$/.test(path.basename(resolved)) &&
      !fs.lstatSync(resolved).isSymbolicLink(),
    'LIVENESS_EVIDENCE_PATH',
  )
  return resolved
}

export function stageMigrations(evidence) {
  const staged = path.join(evidence, 'migrations')
  fs.mkdirSync(staged)
  const source = path.join(root, 'apps/api/prisma/migrations')
  for (const [name] of migrations) {
    fs.cpSync(path.join(source, name), path.join(staged, name), { recursive: true })
  }
  fs.copyFileSync(
    path.join(source, 'migration_lock.toml'),
    path.join(staged, 'migration_lock.toml'),
  )
  validateStaging(staged)
  return staged
}

export function validateStaging(directoryPath) {
  const resolved = fs.realpathSync(directoryPath)
  const parent = fs.realpathSync(path.dirname(resolved))
  requireCheck(
    path.dirname(parent) === fs.realpathSync(path.join(root, '.tmp')) &&
      /^pathways-session-liveness-[A-Za-z0-9]+$/.test(path.basename(parent)) &&
      path.basename(resolved) === 'migrations' &&
      !fs.lstatSync(resolved).isSymbolicLink(),
    'LIVENESS_STAGING_PATH',
  )
  const expectedNames = [...migrations.map(([name]) => name), 'migration_lock.toml'].sort()
  requireCheck(
    JSON.stringify(fs.readdirSync(resolved).sort()) === JSON.stringify(expectedNames),
    'LIVENESS_STAGING_CONTENTS',
  )
  for (const [name, expected] of migrations) {
    const folder = path.join(resolved, name)
    const file = path.join(folder, 'migration.sql')
    requireCheck(
      !fs.lstatSync(folder).isSymbolicLink() &&
        !fs.lstatSync(file).isSymbolicLink() &&
        JSON.stringify(fs.readdirSync(folder)) === '["migration.sql"]' &&
        sha256(fs.readFileSync(file)) === expected,
      'LIVENESS_STAGING_CHECKSUM',
    )
  }
  requireCheck(
    sha256(fs.readFileSync(path.join(resolved, 'migration_lock.toml'))) === migrationLockSha256,
    'LIVENESS_STAGING_LOCK',
  )
  return resolved
}

function assertLedger(rows, expectedPrefix) {
  requireCheck(Array.isArray(rows) && rows.length === expectedPrefix, 'LIVENESS_LEDGER')
  for (let index = 0; index < expectedPrefix; index++) {
    const row = rows[index]
    const [name, checksum] = migrations[index]
    requireCheck(
      row.name === name &&
        row.checksum === checksum &&
        row.finished === true &&
        row.rolledBack === false &&
        row.failureLog === false &&
        Number.isInteger(row.steps) &&
        row.steps >= 0,
      'LIVENESS_LEDGER',
    )
  }
}

function vector(objects) {
  return sha256(JSON.stringify(objects))
}

function assertData(rows) {
  requireCheck(Array.isArray(rows) && rows.length === expectedDataTables, 'LIVENESS_DATA')
  const keys = new Set()
  for (const row of rows) {
    requireCheck(
      typeof row.key === 'string' &&
        /^(public|pathways)\..{1,63}$/u.test(row.key) &&
        row.key !== 'public._prisma_migrations' &&
        Number.isSafeInteger(Number(row.rows)) &&
        Number(row.rows) >= 0 &&
        /^[0-9a-f]{64}$/.test(row.sha256) &&
        !keys.has(row.key),
      'LIVENESS_DATA',
    )
    keys.add(row.key)
  }
}

export function dataInventoryFingerprint(rows) {
  assertData(rows)
  const normalized = rows
    .map((row) => ({ key: row.key, rows: Number(row.rows), sha256: row.sha256 }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
  return sha256(`PATHWAYS_SESSION_LIVENESS_DATA_INVENTORY_V1\0${JSON.stringify(normalized)}`)
}

export function privateEvidenceRecord(summary, preflightDataFingerprint) {
  requireCheck(
    summary && typeof summary === 'object' && /^[0-9a-f]{64}$/.test(preflightDataFingerprint),
    'LIVENESS_EVIDENCE_RECORD',
  )
  return {
    evidenceVersion,
    ...summary,
    preflightDataFingerprint,
  }
}

export function publicEvidenceRecord(record) {
  requireCheck(record && typeof record === 'object', 'LIVENESS_EVIDENCE_RECORD')
  const allowedKeys = new Set([
    'evidenceVersion',
    'status',
    'mode',
    'stage',
    'initialLedgerPrefix',
    'canonicalObjects',
    'dataTablesVerified',
    'hostedConnections',
    'hostedWriteAttempts',
    'recoveryRequired',
    'writerOutcome',
    'processId',
    'childExitCode',
    'hostedLedgerPrefix',
    'dataInventoryEqual',
    'nextState',
    'preflightDataFingerprint',
  ])
  requireCheck(
    Object.keys(record).every((key) => allowedKeys.has(key)),
    'LIVENESS_EVIDENCE_RECORD',
  )
  const { preflightDataFingerprint: omitted, ...result } = record
  void omitted
  return result
}

export function readRecoveryEvidence(evidence) {
  const resultPath = path.join(evidence, 'result.json')
  requireCheck(
    fs.existsSync(resultPath) &&
      !fs.lstatSync(resultPath).isSymbolicLink() &&
      fs.statSync(resultPath).size > 0 &&
      fs.statSync(resultPath).size <= 4096,
    'LIVENESS_RECOVERY_EVIDENCE',
  )
  let record
  try {
    record = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
  } catch {
    throw new Error('LIVENESS_RECOVERY_EVIDENCE')
  }
  const allowedKeys = new Set([
    'evidenceVersion',
    'status',
    'mode',
    'stage',
    'initialLedgerPrefix',
    'canonicalObjects',
    'dataTablesVerified',
    'hostedConnections',
    'hostedWriteAttempts',
    'recoveryRequired',
    'writerOutcome',
    'processId',
    'childExitCode',
    'preflightDataFingerprint',
  ])
  requireCheck(
    record?.evidenceVersion === evidenceVersion &&
      record.status === 'UNCERTAIN' &&
      ['apply-dev', 'rollback-dev'].includes(record.mode) &&
      record.stage === (record.mode === 'apply-dev' ? 'deploy' : 'rollback') &&
      record.initialLedgerPrefix === (record.mode === 'apply-dev' ? 5 : 6) &&
      record.canonicalObjects === canonicalObjectCount &&
      record.dataTablesVerified === expectedDataTables &&
      record.hostedConnections === 1 &&
      record.hostedWriteAttempts === 1 &&
      record.recoveryRequired === true &&
      [
        'CHILD_TIMEOUT',
        'CHILD_NONZERO_EXIT',
        'WRITER_EXCEPTION_AFTER_LAUNCH',
        'RUNNER_EXCEPTION_AFTER_WRITE',
      ].includes(record.writerOutcome) &&
      /^[0-9a-f]{64}$/.test(record.preflightDataFingerprint) &&
      Object.keys(record).every((key) => allowedKeys.has(key)) &&
      ((record.writerOutcome === 'CHILD_TIMEOUT' &&
        Number.isInteger(record.processId) &&
        record.processId > 0) ||
        (record.writerOutcome !== 'CHILD_TIMEOUT' && record.processId === undefined)) &&
      ((record.writerOutcome === 'CHILD_NONZERO_EXIT' &&
        Number.isInteger(record.childExitCode) &&
        record.childExitCode > 0 &&
        record.childExitCode <= 255) ||
        (record.writerOutcome !== 'CHILD_NONZERO_EXIT' && record.childExitCode === undefined)),
    'LIVENESS_RECOVERY_EVIDENCE',
  )
  return record
}

export function assertState(state, phase, expectedData) {
  requireCheck(['pre', 'post', 'contained'].includes(phase), 'LIVENESS_PHASE')
  const expectedPrefix = phase === 'pre' ? 5 : 6
  const catalog = state?.catalog
  requireCheck(
    catalog?.readOnly === true &&
      catalog.database === 'postgres' &&
      catalog.user === 'postgres' &&
      catalog.sessionUser === 'postgres' &&
      JSON.stringify(catalog.ledgerLocations) === '["public"]' &&
      catalog.otherLedger === false &&
      catalog.targetTables === 39 &&
      catalog.legacyTables === 15 &&
      catalog.pgcryptoPresent === true &&
      catalog.runtimeSafe === true &&
      state.maintenance?.kind === 'maintenance' &&
      Number(state.maintenance.matchingSessions) === 0 &&
      Number(state.maintenance.activeOrTransactional) === 0,
    'LIVENESS_HOSTED_STATE',
  )
  assertLedger(catalog.ledger, expectedPrefix)
  assertData(state.data)
  if (expectedData)
    requireCheck(
      JSON.stringify(state.data) === JSON.stringify(expectedData),
      'LIVENESS_DATA_CHANGED',
    )

  const objects = catalog.objects
  requireCheck(Array.isArray(objects), 'LIVENESS_OBJECTS')
  if (phase === 'post') {
    requireCheck(
      catalog.livenessAbsent === false &&
        state.liveness?.present === true &&
        state.liveness.providerCompatible === true &&
        state.liveness.valid === true &&
        Number(state.liveness.sameNameCount) === 1 &&
        state.liveness.runtimeDirectSessionSelect === false &&
        state.liveness.runtimeAuthUsage === false &&
        objects.length === canonicalObjectCount + 2,
      'LIVENESS_HELPER',
    )
    const retained = objects.filter((row) => !livenessObjectKeys.includes(row.key))
    requireCheck(
      retained.length === canonicalObjectCount &&
        livenessObjectKeys.every((key) => objects.some((row) => row.key === key)) &&
        vector(retained) === canonicalVectorSha256,
      'LIVENESS_OBJECTS',
    )
  } else {
    requireCheck(
      catalog.livenessAbsent === true &&
        state.liveness?.present === false &&
        state.liveness.providerCompatible === true &&
        state.liveness.valid === false &&
        Number(state.liveness.sameNameCount) === 0 &&
        objects.length === canonicalObjectCount &&
        vector(objects) === canonicalVectorSha256,
      'LIVENESS_HELPER',
    )
  }
  return state.data
}

export function parseWriterResult(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '')
  } catch {
    throw new Error('LIVENESS_WRITER_OUTPUT')
  }
  const keys = Object.keys(parsed)
  const allowedKeys = new Set([
    'status',
    'action',
    'outcome',
    'stage',
    'processId',
    'childExitCode',
  ])
  const outcomeMatchesStatus =
    (parsed.status === 'PASS' && parsed.outcome === 'CHILD_EXIT_ZERO') ||
    (parsed.status === 'FAILED' &&
      parsed.outcome === 'GUARD_REJECTED' &&
      parsed.stage === 'guard') ||
    (parsed.status === 'UNCERTAIN' &&
      ['CHILD_TIMEOUT', 'CHILD_NONZERO_EXIT', 'WRITER_EXCEPTION_AFTER_LAUNCH'].includes(
        parsed.outcome,
      ))
  requireCheck(
    ['PASS', 'FAILED', 'UNCERTAIN'].includes(parsed.status) &&
      ['Deploy', 'Rollback'].includes(parsed.action) &&
      [
        'CHILD_EXIT_ZERO',
        'GUARD_REJECTED',
        'CHILD_TIMEOUT',
        'CHILD_NONZERO_EXIT',
        'WRITER_EXCEPTION_AFTER_LAUNCH',
      ].includes(parsed.outcome) &&
      ((parsed.outcome === 'CHILD_TIMEOUT' &&
        Number.isInteger(parsed.processId) &&
        parsed.processId > 0) ||
        (parsed.outcome !== 'CHILD_TIMEOUT' && parsed.processId === undefined)) &&
      ((parsed.outcome === 'CHILD_NONZERO_EXIT' &&
        Number.isInteger(parsed.childExitCode) &&
        parsed.childExitCode > 0 &&
        parsed.childExitCode <= 255) ||
        (parsed.outcome !== 'CHILD_NONZERO_EXIT' && parsed.childExitCode === undefined)) &&
      keys.every((key) => allowedKeys.has(key)) &&
      outcomeMatchesStatus &&
      !/postgresql:|password|token|cookie|uuid/i.test(JSON.stringify(parsed)),
    'LIVENESS_WRITER_OUTPUT',
  )
  return parsed
}
