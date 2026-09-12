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
  backupRestorePort,
  backupTableCount,
  compareCatalogSections,
  compareDataSnapshots,
  validateBackupRestoreArguments,
  validateProtectedPaths,
  verifyBackupRestoreSources,
} from './backup-restore-config.mjs'
import {
  assertLedger,
  cleanEnvironment,
  pgBin,
  requireCheck,
  root,
  verifySources,
} from './config.mjs'
import { correctionReview } from './correction-runner.mjs'
import { assertSnapshot } from './runner.mjs'

const currentFile = fileURLToPath(import.meta.url)
const catalogInventory = fs.readFileSync(path.join(backupRestoreDirectory, 'inventory.sql'), 'utf8')
const dataInventory = fs.readFileSync(
  path.join(backupRestoreDirectory, 'backup-data-inventory.sql'),
  'utf8',
)

function execute(file, args, env, input, allowedStatuses = [0], timeout = 180_000) {
  const starting = file.endsWith('pg_ctl.exe') && args.includes('start')
  const execution = spawnSync(file, args, {
    env,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: starting ? 'ignore' : 'pipe',
    timeout,
    maxBuffer: 24 * 1024 * 1024,
  })
  requireCheck(
    !execution.error && allowedStatuses.includes(execution.status),
    'BACKUP_RESTORE_CHILD',
  )
  return { status: execution.status, stdout: execution.stdout?.trim() ?? '' }
}

function parseLastJson(output, code) {
  try {
    return JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')
  } catch {
    throw new Error(code)
  }
}

function assertCorrectionPreflight(result) {
  requireCheck(
    result?.status === 'PASS' &&
      result?.mode === '--check-dev' &&
      result?.state === 'READY_TO_CORRECT' &&
      result?.canonicalObjects === correctionReview.canonicalObjectCount &&
      result?.canonicalSha256 === correctionReview.canonicalVectorSha256 &&
      result?.hostedLedgerPrefix === 1 &&
      result?.hostedWrites === 0,
    'CORRECTION_PREFLIGHT',
  )
}

function parseDataSnapshot(output) {
  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .sort((left, right) => left.key.localeCompare(right.key, 'en'))
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

function assertTaskTemp(directory) {
  const actual = fs.realpathSync(directory)
  const expectedParent = fs.realpathSync(path.join(root, '.tmp'))
  requireCheck(
    path.dirname(actual).toLowerCase() === expectedParent.toLowerCase() &&
      /^pathways-backup-restore-[A-Za-z0-9]+$/.test(path.basename(actual)),
    'LOCAL_EVIDENCE_PATH',
  )
  return actual
}

export async function run(args) {
  let mode = 'rejected'
  let stage = 'authorization'
  let localDirectory
  let localStarted = false
  let localStopped = false
  let localRemoved = false
  let metadata
  let evidencePath
  let backupId
  let backupUtc
  let restoreUtc
  let passed = false
  /** @type {Record<string, unknown>} */
  let result = {
    status: 'FAILED',
    action: 'backup-restore-rehearsal',
    stage,
    hostedWrites: 0,
    correctionApplied: false,
    rollbackApplied: false,
  }
  const environment = cleanEnvironment()
  const command = (name, commandArgs, input, allowed = [0], timeout = 180_000) =>
    execute(path.join(pgBin, `${name}.exe`), commandArgs, environment, input, allowed, timeout)
  const sql = (query, database = backupRestoreDatabase, allowed = [0]) =>
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
        String(backupRestorePort),
        '-U',
        'postgres',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      query,
      allowed,
    ).stdout

  try {
    mode = validateBackupRestoreArguments(args)
    verifySources()
    verifyBackupRestoreSources()

    stage = 'correction-readonly-preflight'
    const preflight = parseLastJson(
      execute(
        process.execPath,
        [path.join(backupRestoreDirectory, 'correction-runner.mjs'), '--check-dev'],
        environment,
        undefined,
        [0],
        240_000,
      ).stdout,
      'CORRECTION_PREFLIGHT_OUTPUT',
    )
    assertCorrectionPreflight(preflight)

    stage = 'protected-backup'
    const backup = parseLastJson(
      execute(
        path.join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          path.join(backupRestoreDirectory, 'Backup-Dev.ps1'),
          '-Authorization',
          'PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY',
        ],
        environment,
        undefined,
        [0],
        600_000,
      ).stdout,
      'BACKUP_OUTPUT',
    )
    requireCheck(
      backup.status === 'PASS' &&
        backup.action === 'backup' &&
        backup.archiveSha256Recorded === true &&
        backup.archiveValidated === true &&
        backup.hostedWrites === 0,
      'BACKUP_RESULT',
    )
    backupId = backup.backupId
    backupUtc = backup.backupUtc
    const protectedPaths = validateProtectedPaths(backup.archive, backup.evidence)
    evidencePath = protectedPaths.evidence
    metadata = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
    assertBackupMetadata(metadata)
    requireCheck(
      (await hashFile(protectedPaths.archive)) === metadata.archiveSha256,
      'ARCHIVE_SHA256',
    )
    assertSnapshot(metadata.catalogBefore, 1, 'postgres')
    requireCheck(metadata.catalogBefore.runtimeSafe === true, 'HOSTED_RUNTIME_BOUNDARY')

    stage = 'local-preflight'
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener
        .once('error', reject)
        .listen(backupRestorePort, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))
    localDirectory = fs.mkdtempSync(path.join(root, '.tmp/pathways-backup-restore-'))
    const localData = path.join(localDirectory, 'data')

    stage = 'local-initdb'
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
    stage = 'local-start'
    localStarted = true
    command('pg_ctl', [
      '-D',
      localData,
      '-l',
      path.join(localDirectory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${backupRestorePort}`,
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
      String(backupRestorePort),
      '-U',
      'postgres',
      backupRestoreDatabase,
    ])

    stage = 'local-provider-bootstrap'
    sql(
      fs.readFileSync(
        path.join(backupRestoreDirectory, 'backup-restore-local-bootstrap.sql'),
        'utf8',
      ),
    )

    const restore = (section) =>
      command(
        'pg_restore',
        [
          '--exit-on-error',
          '--single-transaction',
          `--section=${section}`,
          '-h',
          '127.0.0.1',
          '-p',
          String(backupRestorePort),
          '-U',
          'postgres',
          '-d',
          backupRestoreDatabase,
          protectedPaths.archive,
        ],
        undefined,
        [0],
        240_000,
      )

    stage = 'local-archive-list'
    const archiveList = command('pg_restore', ['--list', protectedPaths.archive]).stdout
    if (/ SCHEMA - public /.test(archiveList)) {
      sql('DROP SCHEMA public RESTRICT;')
    }

    stage = 'local-restore-pre-data'
    restore('pre-data')
    stage = 'local-restore-data'
    restore('data')
    stage = 'local-auth-bootstrap'
    sql(
      fs.readFileSync(
        path.join(backupRestoreDirectory, 'backup-restore-auth-bootstrap.sql'),
        'utf8',
      ),
    )
    stage = 'local-restore-post-data'
    restore('post-data')

    stage = 'local-verification'
    const localCatalog = JSON.parse(
      sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;
${catalogInventory}
ROLLBACK;`),
    )
    assertSnapshot(localCatalog, 1, backupRestoreDatabase)
    requireCheck(localCatalog.runtimeSafe === true, 'LOCAL_RUNTIME_BOUNDARY')
    assertLedger(localCatalog.ledger, 1)
    const localDataSnapshot = parseDataSnapshot(sql(dataInventory))
    const catalog = compareCatalogSections(metadata.catalogBefore.objects, localCatalog.objects)
    const data = compareDataSnapshots(metadata.dataBefore, localDataSnapshot)
    requireCheck(
      catalog.full &&
        catalog.ownership &&
        catalog.acl &&
        catalog.rls &&
        catalog.policies &&
        catalog.triggers &&
        data.all &&
        localCatalog.pgcryptoPresent === metadata.catalogBefore.pgcryptoPresent &&
        JSON.stringify(localCatalog.ledger) === JSON.stringify(metadata.catalogBefore.ledger),
      'RESTORE_COMPARISON',
    )
    verifySources()
    verifyBackupRestoreSources()
    restoreUtc = new Date().toISOString()
    passed = true
    result = {
      status: 'PASS',
      action: 'backup-restore-rehearsal',
      target: 'PATHWAYS-dev',
      backupAvailable: true,
      backupId,
      backupUtc,
      archiveSha256Recorded: true,
      archiveValidated: true,
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
      hostedWrites: 0,
      correctionApplied: false,
      rollbackApplied: false,
      localRestoreStopped: false,
      localRestoreRemoved: false,
      evidenceRecorded: true,
    }
  } catch {
    result = {
      status: 'FAILED',
      action: 'backup-restore-rehearsal',
      mode,
      stage,
      backupId,
      backupUtc,
      hostedWrites: 0,
      correctionApplied: false,
      rollbackApplied: false,
      localRestoreStopped: false,
      localRestoreRemoved: false,
      evidenceRecorded: Boolean(evidencePath),
    }
  } finally {
    if (localStarted && localDirectory) {
      try {
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
        localStopped = true
      } catch {
        result = { ...result, status: 'FAILED', stage: 'local-stop' }
      }
    }
    if (localDirectory && (!localStarted || localStopped)) {
      try {
        const actual = assertTaskTemp(localDirectory)
        fs.rmSync(actual, { recursive: true, force: false })
        localRemoved = !fs.existsSync(actual)
      } catch {
        result = { ...result, status: 'FAILED', stage: 'local-cleanup' }
      }
    }
    result.localRestoreStopped = localStarted ? localStopped : true
    result.localRestoreRemoved = localDirectory ? localRemoved : true
    if (passed && (!localStopped || !localRemoved)) result.status = 'FAILED'
    if (metadata && evidencePath) {
      try {
        metadata.restore = {
          status: result.status,
          stage: result.stage ?? (result.status === 'PASS' ? 'complete' : 'unknown'),
          completedUtc: restoreUtc ?? null,
          targetLoopbackOnly: true,
          schemaComparison: result.schemaComparison ?? 'FAILED',
          dataComparison: result.dataComparison ?? 'FAILED',
          migrationLedgerComparison: result.migrationLedgerComparison ?? 'FAILED',
          ownershipComparison: result.ownershipComparison ?? 'FAILED',
          aclComparison: result.aclComparison ?? 'FAILED',
          rlsComparison: result.rlsComparison ?? 'FAILED',
          policyComparison: result.policyComparison ?? 'FAILED',
          triggerComparison: result.triggerComparison ?? 'FAILED',
          requiredExtensionComparison: result.requiredExtensionComparison ?? 'FAILED',
          localRestoreStopped: result.localRestoreStopped,
          localRestoreRemoved: result.localRestoreRemoved,
        }
        fs.writeFileSync(evidencePath, JSON.stringify(metadata, null, 2))
      } catch {
        result = { ...result, status: 'FAILED', stage: 'evidence-update' }
      }
    }
  }
  console.log(JSON.stringify(result))
  return result.status === 'PASS' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = await run(process.argv.slice(2))
}

export const backupRestoreReview = Object.freeze({
  backupRestoreDatabase,
  backupRestorePort,
  backupTableCount,
})
