import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertBackupMetadata,
  backupRestoreDatabase,
  backupRestoreDirectory,
  backupRoot,
  backupTableCount,
  validateProtectedPaths,
  verifyBackupRestoreSources,
} from './backup-restore-config.mjs'
import { collectRestoreDiagnostics } from './backup-restore-local-diagnostics.mjs'
import {
  assertPriorLocalRetryEvidence,
  claimDiagnosticAttempt,
  diagnosticAuthorization,
} from './backup-restore-local-evidence.mjs'
import { cleanEnvironment, pgBin, requireCheck, root, sha256, verifySources } from './config.mjs'
import { assertSnapshot } from './runner.mjs'

export { assertPriorLocalRetryEvidence } from './backup-restore-local-evidence.mjs'

const currentFile = fileURLToPath(import.meta.url)
const authorizedBackupId = 'PATHWAYS-dev-pre-correction-20260908-205627'
const localRetryPort = 55453
const localRetryBootstrapFile = path.join(
  backupRestoreDirectory,
  'backup-restore-local-retry-bootstrap.sql',
)
const localRetryBootstrapSha256 = '2dac6ddb187f7fc37c730335fd085166821259edf6d9f6efcb5707292f398fc6'
const localRetrySourceSha256 = Object.freeze({
  'backup-restore-local-diagnostics.mjs':
    '36b5aa7f1c2df5c9273a33ce0617bfd28f7a360ef0127de6708d840bab5eaad6',
  'backup-restore-local-evidence.mjs':
    'fa4c2d470db96d8ea3192a226060402636013113859da1abfc6e96458ea6d349',
})
const catalogInventory = fs.readFileSync(path.join(backupRestoreDirectory, 'inventory.sql'), 'utf8')
const dataInventory = fs.readFileSync(
  path.join(backupRestoreDirectory, 'backup-data-inventory.sql'),
  'utf8',
)

export function validateLocalRetryArguments(args) {
  requireCheck(
    JSON.stringify(args) ===
      JSON.stringify([
        '--restore-existing',
        `--backup-id=${authorizedBackupId}`,
        `--authorization=${diagnosticAuthorization}`,
      ]),
    'LOCAL_RETRY_MODE',
  )
  return '--restore-existing'
}

export function classifyLocalChildError(stderr) {
  const value = String(stderr ?? '')
  if (/role ".+" does not exist/i.test(value)) return 'MISSING_SYNTHETIC_ROLE'
  if (/schema ".+" already exists/i.test(value)) return 'SCHEMA_CONFLICT'
  if (/(function|relation|type) ".+" does not exist/i.test(value)) {
    return 'MISSING_LOCAL_DEPENDENCY'
  }
  if (/permission denied/i.test(value)) return 'LOCAL_PERMISSION'
  if (/multiple primary keys/i.test(value)) return 'CONSTRAINT_CONFLICT'
  if (/could not connect|connection refused/i.test(value)) return 'LOCAL_CONNECTION'
  return 'LOCAL_CHILD_FAILED'
}

export function verifyLocalRetrySources() {
  requireCheck(
    sha256(fs.readFileSync(localRetryBootstrapFile)) === localRetryBootstrapSha256,
    'LOCAL_RETRY_SOURCE',
  )
  for (const [name, expected] of Object.entries(localRetrySourceSha256)) {
    requireCheck(
      sha256(fs.readFileSync(path.join(backupRestoreDirectory, name))) === expected,
      'LOCAL_RETRY_SOURCE',
    )
  }
}

class LocalChildError extends Error {
  constructor(code) {
    super(code)
    this.name = 'LocalChildError'
  }
}

function execute(file, args, environment, input, timeout = 240_000) {
  const starting = file.endsWith('pg_ctl.exe') && args.includes('start')
  const execution = spawnSync(file, args, {
    env: environment,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: starting ? 'ignore' : 'pipe',
    timeout,
    maxBuffer: 24 * 1024 * 1024,
  })
  if (execution.error || execution.status !== 0) {
    throw new LocalChildError(classifyLocalChildError(execution.stderr))
  }
  return execution.stdout?.trim() ?? ''
}

function parseDataSnapshot(output) {
  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  requireCheck(rows.length === backupTableCount, 'LOCAL_DATA_SHAPE')
  return rows
}

async function hashFile(file) {
  const digest = createHash('sha256')
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(file)
    input.on('data', (chunk) => digest.update(chunk))
    input.on('error', reject)
    input.on('end', resolve)
  })
  return digest.digest('hex')
}

function assertLocalRetryDirectory(directory) {
  const actual = fs.realpathSync(directory)
  const parent = fs.realpathSync(path.join(root, '.tmp'))
  requireCheck(
    path.dirname(actual).toLowerCase() === parent.toLowerCase() &&
      !fs.lstatSync(directory).isSymbolicLink() &&
      /^pathways-local-restore-retry-[A-Za-z0-9]+$/.test(path.basename(actual)),
    'LOCAL_RETRY_PATH',
  )
  return actual
}

export function cleanupLocalRetry(directory, started, stop) {
  if (!directory) return { stopped: !started, removed: !started, failureCode: null }
  let actual
  try {
    actual = assertLocalRetryDirectory(directory)
  } catch {
    return { stopped: false, removed: false, failureCode: 'LOCAL_CLEANUP_FAILED' }
  }
  if (started) {
    try {
      stop()
    } catch {
      return { stopped: false, removed: false, failureCode: 'LOCAL_STOP_FAILED' }
    }
  }
  try {
    fs.rmSync(actual, { recursive: true, force: false })
    return { stopped: true, removed: !fs.existsSync(actual), failureCode: null }
  } catch {
    return { stopped: true, removed: false, failureCode: 'LOCAL_CLEANUP_FAILED' }
  }
}

export async function run(args) {
  let mode = 'rejected'
  let stage = 'authorization'
  let failureCode = null
  let localDirectory
  let localStarted = false
  let localStopped = false
  let localRemoved = false
  let evidencePath
  let metadata
  let journal
  let evidenceRecorded = false
  let finalEvidenceRecorded = false
  let diagnostics = null
  let comparisonFailureStage = null
  let retryStartedUtc
  let restoreUtc
  /** @type {Record<string, unknown>} */
  let result = {
    status: 'FAILED',
    action: 'local-only-restore-retry',
    stage,
    hostedConnections: 0,
    hostedWrites: 0,
    correctionApplied: false,
    rollbackApplied: false,
  }
  const environment = cleanEnvironment()
  const command = (name, commandArgs, input, timeout = 240_000) =>
    execute(path.join(pgBin, `${name}.exe`), commandArgs, environment, input, timeout)
  const sql = (query) =>
    command(
      'psql',
      [
        '-X',
        '-w',
        '-q',
        '-A',
        '-t',
        '-h',
        '127.0.0.1',
        '-p',
        String(localRetryPort),
        '-U',
        'postgres',
        '-d',
        backupRestoreDatabase,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      query,
    )

  const record = (status) => {
    if (!journal) return
    journal.record({
      status,
      stage,
      failureCode,
      diagnostics,
      localRestoreStopped: localStopped,
      localRestoreRemoved: localRemoved,
    })
    evidenceRecorded = true
  }

  const setStage = (next) => {
    stage = next
    record('RUNNING')
  }

  try {
    mode = validateLocalRetryArguments(args)
    verifySources()
    verifyBackupRestoreSources()
    verifyLocalRetrySources()

    setStage('protected-evidence')
    const protectedDirectory = path.join(backupRoot, authorizedBackupId)
    const protectedPaths = validateProtectedPaths(
      path.join(protectedDirectory, 'application.dump'),
      path.join(protectedDirectory, 'evidence.json'),
    )
    evidencePath = protectedPaths.evidence
    const originalEvidenceBytes = fs.readFileSync(evidencePath)
    metadata = JSON.parse(originalEvidenceBytes.toString('utf8'))
    assertBackupMetadata(metadata)
    assertPriorLocalRetryEvidence(metadata)
    requireCheck(
      metadata.restore?.status === 'FAILED' && metadata.restore?.completedUtc === null,
      'LOCAL_RETRY_STATE',
    )
    requireCheck(
      (await hashFile(protectedPaths.archive)) === metadata.archiveSha256,
      'ARCHIVE_SHA256',
    )
    assertSnapshot(metadata.catalogBefore, 1, 'postgres')
    requireCheck(metadata.catalogBefore.runtimeSafe === true, 'HOSTED_EVIDENCE_BOUNDARY')
    setStage('local-port-preflight')
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener.once('error', reject).listen(localRetryPort, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))

    stage = 'attempt-claim'
    journal = claimDiagnosticAttempt(evidencePath, originalEvidenceBytes)
    retryStartedUtc = journal.startedUtc

    setStage('local-initdb')
    localDirectory = fs.mkdtempSync(path.join(root, '.tmp/pathways-local-restore-retry-'))
    const localData = path.join(localDirectory, 'data')
    command('initdb', [
      '-D',
      localData,
      '-U',
      'postgres',
      '-A',
      'trust',
      '--encoding=UTF8',
      '--locale=C',
    ])

    setStage('local-start')
    localStarted = true
    command('pg_ctl', [
      '-D',
      localData,
      '-l',
      path.join(localDirectory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${localRetryPort}`,
      '-w',
      '-t',
      '15',
      'start',
    ])
    command('createdb', [
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      String(localRetryPort),
      '-U',
      'postgres',
      backupRestoreDatabase,
    ])

    setStage('local-provider-bootstrap')
    sql(
      fs.readFileSync(
        path.join(backupRestoreDirectory, 'backup-restore-local-bootstrap.sql'),
        'utf8',
      ),
    )
    setStage('local-retry-role-bootstrap')
    sql(fs.readFileSync(localRetryBootstrapFile, 'utf8'))

    const restore = (section) =>
      command('pg_restore', [
        '--exit-on-error',
        '--single-transaction',
        `--section=${section}`,
        '-h',
        '127.0.0.1',
        '-p',
        String(localRetryPort),
        '-U',
        'postgres',
        '-d',
        backupRestoreDatabase,
        protectedPaths.archive,
      ])

    setStage('local-archive-list')
    const archiveList = command('pg_restore', ['--list', protectedPaths.archive])
    requireCheck(
      (archiveList.match(/ TABLE DATA (public|pathways) /g) ?? []).length === backupTableCount &&
        !/ TABLE DATA (auth|storage) /.test(archiveList),
      'ARCHIVE_SCOPE',
    )
    if (/ SCHEMA - public /.test(archiveList)) sql('DROP SCHEMA public RESTRICT;')

    setStage('local-restore-pre-data')
    restore('pre-data')
    setStage('local-restore-data')
    restore('data')
    setStage('local-auth-bootstrap')
    sql(
      fs.readFileSync(
        path.join(backupRestoreDirectory, 'backup-restore-auth-bootstrap.sql'),
        'utf8',
      ),
    )
    setStage('local-restore-post-data')
    restore('post-data')

    setStage('local-verification')
    diagnostics = collectRestoreDiagnostics(
      metadata.catalogBefore,
      metadata.dataBefore,
      () =>
        JSON.parse(
          sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;
${catalogInventory}
ROLLBACK;`),
        ),
      () => parseDataSnapshot(sql(dataInventory)),
      metadata.archiveSha256,
    )
    if (!diagnostics.allPassed) comparisonFailureStage = 'local-verification'
    // Flush every result before throwing and before deleting the disposable DB.
    record('RUNNING')
    requireCheck(diagnostics.allPassed, 'RESTORE_COMPARISON')
    verifySources()
    verifyBackupRestoreSources()
    verifyLocalRetrySources()
    restoreUtc = new Date().toISOString()
    stage = 'complete'
    result = {
      status: 'PASS',
      action: 'local-only-restore-retry',
      backupId: authorizedBackupId,
      backupUtc: metadata.backupCompletedUtc,
      restoreUtc,
      restoreTargetLoopbackOnly: true,
      schemaComparison: 'PASS',
      dataComparison: 'PASS',
      rowCountComparison: 'PASS',
      rowHashComparison: 'PASS',
      migrationLedgerComparison: 'PASS',
      ownershipComparison: 'PASS',
      aclComparison: 'PASS',
      rlsComparison: 'PASS',
      policyComparison: 'PASS',
      triggerComparison: 'PASS',
      requiredExtensionComparison: 'PASS',
      hostedConnections: 0,
      hostedWrites: 0,
      correctionApplied: false,
      rollbackApplied: false,
      localRestoreStopped: false,
      localRestoreRemoved: false,
      evidenceRecorded: true,
    }
  } catch (error) {
    failureCode =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : 'LOCAL_RETRY_FAILURE'
    result = {
      status: 'FAILED',
      action: 'local-only-restore-retry',
      mode,
      stage,
      failureCode,
      backupId: authorizedBackupId,
      hostedConnections: 0,
      hostedWrites: 0,
      correctionApplied: false,
      rollbackApplied: false,
      localRestoreStopped: false,
      localRestoreRemoved: false,
      evidenceRecorded,
    }
  } finally {
    const cleanup = cleanupLocalRetry(localDirectory, localStarted, () => {
      command('pg_ctl', [
        '-D',
        path.join(localDirectory, 'data'),
        '-m',
        'fast',
        '-w',
        '-t',
        '15',
        'stop',
      ])
    })
    localStopped = cleanup.stopped
    localRemoved = cleanup.removed
    if (cleanup.failureCode) {
      result = {
        ...result,
        status: 'FAILED',
        stage: cleanup.failureCode === 'LOCAL_STOP_FAILED' ? 'local-stop' : 'local-cleanup',
        failureCode: cleanup.failureCode,
      }
    }
    result.localRestoreStopped = localStarted ? localStopped : true
    result.localRestoreRemoved = localDirectory ? localRemoved : true
    if (result.status === 'PASS' && (!localStopped || !localRemoved)) {
      result.status = 'FAILED'
    }
    stage = String(result.stage ?? stage)
    failureCode = result.failureCode ?? failureCode
    try {
      record(result.status)
      finalEvidenceRecorded = Boolean(journal)
    } catch {
      result = {
        ...result,
        status: 'FAILED',
        stage: 'evidence-update',
        failureCode: 'EVIDENCE_UPDATE_FAILED',
      }
    }
  }
  result.evidenceRecorded = evidenceRecorded
  result.finalEvidenceRecorded = finalEvidenceRecorded
  result.startedUtc = retryStartedUtc ?? null
  result.comparisonFailureStage = comparisonFailureStage
  result.diagnostics = diagnostics
  console.log(JSON.stringify(result))
  return result.status === 'PASS' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = await run(process.argv.slice(2))
}

export const localRetryReview = Object.freeze({
  authorizedBackupId,
  localRetryPort,
  localRetryBootstrapSha256,
})
