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
import { compareRestoreDiagnostics } from './backup-restore-local-diagnostics.mjs'
import { assertPriorLocalRetryEvidence } from './backup-restore-local-evidence.mjs'
import {
  claimRootCauseAttempt,
  rootCauseRetryAuthorization,
  sanitizeRootCauseDiagnostics,
} from './backup-restore-root-cause-evidence.mjs'
import { assertV2Evidence, rootCauseBackupId } from './backup-restore-root-cause.mjs'
import { cleanEnvironment, pgBin, requireCheck, root, sha256, verifySources } from './config.mjs'
import { assertSnapshot } from './runner.mjs'

const currentFile = fileURLToPath(import.meta.url)
export const rootCauseRetryPort = 55453
const retryBootstrap = 'backup-restore-local-retry-bootstrap.sql'
const supplement = 'backup-restore-default-acl-supplement.sql'
const controlledInventory = 'backup-data-inventory-utc.sql'
const sourceFingerprints = Object.freeze({
  [retryBootstrap]: '2dac6ddb187f7fc37c730335fd085166821259edf6d9f6efcb5707292f398fc6',
  [supplement]: '5fa85670185c4b804cd3487c218e0b4f40e16148928d2de015fe37a50f6803ff',
  'backup-restore-default-acl-supplement-rollback.sql':
    'fb4c6bbdf021f41b15dee10cca38bb2980987547db56e6b17ade9a46f3a5a49d',
  [controlledInventory]: '9908e254b8ca2c7f291de778bbcee4e5189e1f9b32ff585692723fd61921016d',
  'backup-restore-root-cause.mjs':
    '889df9db188a7ac972ae35204956093cd6b911ee10eaa86156c040132593fec2',
  'backup-restore-root-cause-evidence.mjs':
    '7ab1f562f2114aa0b0fb8fc217747bc2572a8b0a32e98195766bd972aa5461c5',
})
const catalogInventory = fs.readFileSync(path.join(backupRestoreDirectory, 'inventory.sql'), 'utf8')
const legacyInventory = fs.readFileSync(
  path.join(backupRestoreDirectory, 'backup-data-inventory.sql'),
  'utf8',
)

export function validateRootCauseRetryArguments(args) {
  requireCheck(
    JSON.stringify(args) ===
      JSON.stringify([
        '--restore-existing',
        `--backup-id=${rootCauseBackupId}`,
        `--authorization=${rootCauseRetryAuthorization}`,
      ]),
    'ROOT_CAUSE_RETRY_MODE',
  )
  return '--restore-existing'
}

export function verifyRootCauseRetrySources() {
  for (const [name, expected] of Object.entries(sourceFingerprints)) {
    requireCheck(
      /^[a-f0-9]{64}$/.test(expected) &&
        sha256(fs.readFileSync(path.join(backupRestoreDirectory, name))) === expected,
      'ROOT_CAUSE_RETRY_SOURCE',
    )
  }
}

function classifyLocalChildError(stderr) {
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
  requireCheck(rows.length === backupTableCount, 'ROOT_CAUSE_LOCAL_DATA_SHAPE')
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

function assertLocalDirectory(directory) {
  const actual = fs.realpathSync(directory)
  const parent = fs.realpathSync(path.join(root, '.tmp'))
  requireCheck(
    path.dirname(actual).toLowerCase() === parent.toLowerCase() &&
      !fs.lstatSync(directory).isSymbolicLink() &&
      /^pathways-root-cause-retry-[A-Za-z0-9]+$/.test(path.basename(actual)),
    'ROOT_CAUSE_LOCAL_PATH',
  )
  return actual
}

export function cleanupRootCauseRetry(directory, started, stop) {
  if (!directory) return { stopped: !started, removed: !started, failureCode: null }
  let actual
  try {
    actual = assertLocalDirectory(directory)
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

const tuple = (item) => [item?.evaluated, item?.pass, item?.missing, item?.extra, item?.changed]
export function baselineReproduced(diagnostics, exactExpected) {
  const expected = {
    schema: [true, false, 2, 0, 0],
    rowCount: [true, true, 0, 0, 0],
    rowHash: [true, false, 0, 0, 6],
    migrationLedger: [true, true, 0, 0, 0],
    ownership: [true, true, 0, 0, 0],
    acl: [true, false, 2, 0, 0],
    rls: [true, true, 0, 0, 0],
    policies: [true, true, 0, 0, 0],
    triggers: [true, true, 0, 0, 0],
    requiredExtensions: [true, true, 0, 0, 0],
    catalogSafety: [true, true, 0, 0, 0],
  }
  const tuplesMatch = Object.entries(expected).every(
    ([name, value]) => JSON.stringify(tuple(diagnostics?.checks?.[name])) === JSON.stringify(value),
  )
  return (
    tuplesMatch &&
    (exactExpected === undefined || JSON.stringify(diagnostics) === JSON.stringify(exactExpected))
  )
}

export function buildRootCauseDiagnostics({
  baseline,
  controlled,
  sourceServerMajor,
  targetServerMajor,
  targetDefaultTimezoneUtc,
  supplementApplied,
  exactBaseline,
}) {
  const reproduced = baselineReproduced(baseline, exactBaseline)
  const catalogPass =
    controlled?.checks?.schema?.pass === true && controlled?.checks?.acl?.pass === true
  const rowCountsPass = controlled?.checks?.rowCount?.pass === true
  const utcHashesPass = controlled?.checks?.rowHash?.pass === true
  const timezoneConfirmed =
    reproduced &&
    !targetDefaultTimezoneUtc &&
    supplementApplied &&
    catalogPass &&
    rowCountsPass &&
    utcHashesPass &&
    controlled.allPassed === true
  return sanitizeRootCauseDiagnostics({
    version: 3,
    baselineReproduced: reproduced,
    sourceMajor17: sourceServerMajor === 17,
    targetMajor18: targetServerMajor === 18,
    targetDefaultTimezoneUtc,
    supplementApplied,
    supplementRollbackPrepared: true,
    catalogPassAfterSupplement: catalogPass,
    rowCountsPass,
    utcHashesPass,
    timezoneCauseConfirmed: timezoneConfirmed,
    crossMajorSerializationExcluded: timezoneConfirmed,
    baselineCatalogMissing: baseline?.checks?.schema?.missing ?? 0,
    baselineAclMissing: baseline?.checks?.acl?.missing ?? 0,
    baselineHashChanged: baseline?.checks?.rowHash?.changed ?? 0,
    controlledCatalogMissing:
      (controlled?.checks?.schema?.missing ?? 0) +
      (controlled?.checks?.schema?.extra ?? 0) +
      (controlled?.checks?.schema?.changed ?? 0),
    controlledHashChanged:
      (controlled?.checks?.rowHash?.missing ?? 0) +
      (controlled?.checks?.rowHash?.extra ?? 0) +
      (controlled?.checks?.rowHash?.changed ?? 0),
  })
}

export async function run(args) {
  let mode = 'rejected'
  let stage = 'authorization'
  let failureCode = null
  let localDirectory
  let localStarted = false
  let localStopped = false
  let localRemoved = false
  let journal
  let diagnostics = null
  let evidenceRecorded = false
  let finalEvidenceRecorded = false
  let startedUtc
  let supplementApplied = false
  let archiveRestoreExecuted = false
  let result = {
    status: 'FAILED',
    action: 'local-only-root-cause-retry',
    stage,
    hostedConnections: 0,
    hostedWrites: 0,
    archiveRestoreExecuted: false,
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
        String(rootCauseRetryPort),
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
    mode = validateRootCauseRetryArguments(args)
    verifySources()
    verifyBackupRestoreSources()
    verifyRootCauseRetrySources()
    const protectedDirectory = path.join(backupRoot, rootCauseBackupId)
    const protectedPaths = validateProtectedPaths(
      path.join(protectedDirectory, 'application.dump'),
      path.join(protectedDirectory, 'evidence.json'),
    )
    const originalEvidence = fs.readFileSync(protectedPaths.evidence)
    const metadata = JSON.parse(originalEvidence.toString('utf8'))
    assertBackupMetadata(metadata)
    assertPriorLocalRetryEvidence(metadata)
    assertSnapshot(metadata.catalogBefore, 1, 'postgres')
    const v2Journal = assertV2Evidence(protectedDirectory)
    requireCheck(
      (await hashFile(protectedPaths.archive)) === metadata.archiveSha256,
      'ARCHIVE_SHA256',
    )

    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener
        .once('error', reject)
        .listen(rootCauseRetryPort, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))
    stage = 'attempt-claim'
    journal = claimRootCauseAttempt(protectedPaths.evidence, originalEvidence)
    startedUtc = journal.startedUtc

    setStage('local-initdb')
    localDirectory = fs.mkdtempSync(path.join(root, '.tmp/pathways-root-cause-retry-'))
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
    command('pg_ctl', [
      '-D',
      localData,
      '-l',
      path.join(localDirectory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${rootCauseRetryPort}`,
      '-w',
      '-t',
      '15',
      'start',
    ])
    localStarted = true
    command('createdb', [
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      String(rootCauseRetryPort),
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
    sql(fs.readFileSync(path.join(backupRestoreDirectory, retryBootstrap), 'utf8'))

    const restore = (section) =>
      command('pg_restore', [
        '--exit-on-error',
        '--single-transaction',
        `--section=${section}`,
        '-h',
        '127.0.0.1',
        '-p',
        String(rootCauseRetryPort),
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
    archiveRestoreExecuted = true
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

    const readCatalog = () =>
      JSON.parse(
        sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;
${catalogInventory}
ROLLBACK;`),
      )
    setStage('local-baseline-verification')
    const baselineCatalog = readCatalog()
    const baselineData = parseDataSnapshot(sql(legacyInventory))
    const baseline = compareRestoreDiagnostics(
      metadata.catalogBefore,
      baselineCatalog,
      metadata.dataBefore,
      baselineData,
      metadata.archiveSha256,
    )
    requireCheck(baselineReproduced(baseline, v2Journal.diagnostics), 'ROOT_CAUSE_BASELINE_DRIFT')
    const targetDefaultTimezoneUtc =
      sql("SELECT current_setting('TimeZone') IN ('UTC','Etc/UTC','GMT');") === 't'

    setStage('local-default-acl-supplement')
    sql(fs.readFileSync(path.join(backupRestoreDirectory, supplement), 'utf8'))
    supplementApplied = true
    setStage('local-controlled-verification')
    const controlledCatalog = readCatalog()
    const controlledData = parseDataSnapshot(
      sql(fs.readFileSync(path.join(backupRestoreDirectory, controlledInventory), 'utf8')),
    )
    const controlled = compareRestoreDiagnostics(
      metadata.catalogBefore,
      controlledCatalog,
      metadata.dataBefore,
      controlledData,
      metadata.archiveSha256,
    )
    diagnostics = buildRootCauseDiagnostics({
      baseline,
      controlled,
      sourceServerMajor: Math.floor(Number(metadata.catalogBefore.serverVersion) / 10_000),
      targetServerMajor: Math.floor(Number(controlledCatalog.serverVersion) / 10_000),
      targetDefaultTimezoneUtc,
      supplementApplied,
      exactBaseline: v2Journal.diagnostics,
    })
    record('RUNNING')
    requireCheck(diagnostics.timezoneCauseConfirmed, 'ROOT_CAUSE_COMPARISON')
    verifySources()
    verifyBackupRestoreSources()
    verifyRootCauseRetrySources()
    stage = 'complete'
    result = {
      status: 'PASS',
      action: 'local-only-root-cause-retry',
      stage,
      hostedConnections: 0,
      hostedWrites: 0,
      archiveRestoreExecuted: true,
      correctionApplied: false,
      rollbackApplied: false,
      evidenceRecorded: true,
    }
  } catch (error) {
    failureCode =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : 'ROOT_CAUSE_RETRY_FAILURE'
    result = {
      status: 'FAILED',
      action: 'local-only-root-cause-retry',
      mode,
      stage,
      failureCode,
      hostedConnections: 0,
      hostedWrites: 0,
      archiveRestoreExecuted,
      correctionApplied: false,
      rollbackApplied: false,
      evidenceRecorded,
    }
  } finally {
    const cleanup = cleanupRootCauseRetry(localDirectory, localStarted, () => {
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
    if (result.status === 'PASS' && (!localStopped || !localRemoved)) result.status = 'FAILED'
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
  result.startedUtc = startedUtc ?? null
  result.diagnostics = diagnostics
  console.log(JSON.stringify(result))
  return result.status === 'PASS' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = await run(process.argv.slice(2))
}
