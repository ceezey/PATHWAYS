import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertBackupMetadata,
  backupRestoreDirectory,
  backupRoot,
  validateProtectedPaths,
  verifyBackupRestoreSources,
} from './backup-restore-config.mjs'
import { createIdentifierFingerprinter } from './backup-restore-local-diagnostics.mjs'
import { assertPriorLocalRetryEvidence } from './backup-restore-local-evidence.mjs'
import { cleanEnvironment, pgBin, requireCheck, sha256, verifySources } from './config.mjs'
import { assertSnapshot } from './runner.mjs'

const currentFile = fileURLToPath(import.meta.url)
export const rootCauseVersion = 1
export const rootCauseAuthorization = 'PATHWAYS_DEV_LOCAL_ROOT_CAUSE_INSPECTION_V1'
export const rootCauseBackupId = 'PATHWAYS-dev-pre-correction-20260908-205627'
export const v2Evidence = Object.freeze({
  claim: 'local-retry-comparison-v2.claim.json',
  journal: 'local-retry-comparison-v2.json',
  claimSha256: '8ae9e0e541b5b1f78dfd58b509551220fb18db479a29a7e33d4cd31aa0979ebe',
  journalSha256: '997ca40b24ab7e37826fec29969ba57710289251b47389b313e261fc81af4873',
})

const expectedV2Checks = Object.freeze({
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
})

function regularFile(directory, name) {
  const file = path.join(directory, name)
  requireCheck(
    fs.existsSync(file) &&
      fs.lstatSync(file).isFile() &&
      !fs.lstatSync(file).isSymbolicLink() &&
      path.dirname(fs.realpathSync(file)).toLowerCase() === directory.toLowerCase(),
    'ROOT_CAUSE_EVIDENCE_PATH',
  )
  return file
}

export function assertV2Evidence(directory) {
  const actualDirectory = fs.realpathSync(directory)
  const claimBytes = fs.readFileSync(regularFile(actualDirectory, v2Evidence.claim))
  const journalBytes = fs.readFileSync(regularFile(actualDirectory, v2Evidence.journal))
  requireCheck(
    sha256(claimBytes) === v2Evidence.claimSha256 &&
      sha256(journalBytes) === v2Evidence.journalSha256,
    'V2_EVIDENCE_CHANGED',
  )
  const claim = JSON.parse(claimBytes.toString('utf8'))
  const journal = JSON.parse(journalBytes.toString('utf8'))
  requireCheck(
    JSON.stringify(claim) === JSON.stringify({ version: 2, consumed: true, priorVersion: 1 }) &&
      journal?.version === 2 &&
      journal.status === 'FAILED' &&
      journal.stage === 'local-verification' &&
      journal.failureCode === 'RESTORE_COMPARISON' &&
      journal.startedUtc === '2026-09-09T08:25:45.845Z' &&
      journal.completedUtc === '2026-09-09T08:25:52.196Z' &&
      journal.targetLoopbackOnly === true &&
      journal.hostedConnections === 0 &&
      journal.hostedWrites === 0 &&
      journal.localRestoreStopped === true &&
      journal.localRestoreRemoved === true &&
      journal.diagnostics?.version === 2 &&
      journal.diagnostics.allPassed === false &&
      Array.isArray(journal.checkpoints) &&
      journal.checkpoints.length === 12 &&
      journal.checkpoints.at(-1)?.status === 'FAILED' &&
      journal.checkpoints.at(-1)?.stage === 'local-verification' &&
      journal.checkpoints.at(-1)?.failureCode === 'RESTORE_COMPARISON',
    'V2_EVIDENCE_STATE',
  )
  for (const [name, expected] of Object.entries(expectedV2Checks)) {
    const item = journal.diagnostics.checks?.[name]
    requireCheck(
      JSON.stringify([item?.evaluated, item?.pass, item?.missing, item?.extra, item?.changed]) ===
        JSON.stringify(expected) &&
        ['missing', 'extra', 'changed'].every(
          (kind) =>
            Array.isArray(item.fingerprints?.[kind]) &&
            item.fingerprints[kind].length === item[kind] &&
            item.fingerprints[kind].every((value) => /^[a-f0-9]{64}$/.test(value)) &&
            item.truncated?.[kind] === false,
        ),
      'V2_EVIDENCE_STATE',
    )
  }
  requireCheck(
    Object.keys(journal.diagnostics.checks).length === Object.keys(expectedV2Checks).length,
    'V2_EVIDENCE_STATE',
  )
  return journal
}

function migrationSql() {
  const root = path.resolve(backupRestoreDirectory, '../../..')
  const directory = path.join(root, 'apps/api/prisma/migrations')
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tableBlock(source, key) {
  const separator = key.indexOf('.')
  const schema = key.slice(0, separator)
  const table = escapeRegExp(key.slice(separator + 1))
  const expression =
    schema === 'public'
      ? new RegExp(`CREATE TABLE "${table}" \\(\\s*([\\s\\S]*?)\\n\\);`)
      : new RegExp(`CREATE TABLE "${escapeRegExp(schema)}"\\."${table}" \\(\\s*([\\s\\S]*?)\\n\\);`)
  return source.match(expression)?.[1] ?? null
}

function changedRows(metadata, journal, fingerprinter) {
  const changed = new Set(journal.diagnostics.checks.rowHash.fingerprints.changed)
  const matches = metadata.dataBefore.filter((row) => changed.has(fingerprinter('data', row.key)))
  requireCheck(matches.length === changed.size, 'ROOT_CAUSE_TOKEN_RESOLUTION')
  return matches
}

function missingCatalogRows(metadata, journal, fingerprinter) {
  const missing = new Set(journal.diagnostics.checks.schema.fingerprints.missing)
  const matches = metadata.catalogBefore.objects.filter((row) =>
    missing.has(fingerprinter('catalog', row.key)),
  )
  requireCheck(matches.length === missing.size, 'ROOT_CAUSE_TOKEN_RESOLUTION')
  return matches
}

export function classifyRootCause(metadata, journal, archiveList, source) {
  assertBackupMetadata(metadata)
  requireCheck(typeof archiveList === 'string' && archiveList.length > 0, 'ROOT_CAUSE_ARCHIVE_TOC')
  requireCheck(typeof source === 'string' && source.length > 0, 'ROOT_CAUSE_SOURCE')
  const fingerprinter = createIdentifierFingerprinter(metadata.archiveSha256)
  const missingCatalog = missingCatalogRows(metadata, journal, fingerprinter)
  const changed = changedRows(metadata, journal, fingerprinter)
  const expectedDefaultAcl = metadata.catalogBefore.objects.filter((row) =>
    row.key.startsWith('default-acl:'),
  )
  const missingDefaultAcl = missingCatalog.filter((row) => row.key.startsWith('default-acl:'))
  const tocDefaultAcl = archiveList.split(/\r?\n/).filter((line) => line.includes(' DEFAULT ACL '))
  const nonEmpty = metadata.dataBefore.filter((row) => Number(row.rows) > 0)
  const applicationRows = changed.filter((row) => row.key.startsWith('pathways.'))
  const publicRows = changed.filter((row) => row.key.startsWith('public.'))
  const applicationBlocks = applicationRows.map((row) => tableBlock(source, row.key))
  const applicationOwnerTocEntries = tocDefaultAcl.filter((line) => /\bprisma\b/.test(line))

  requireCheck(
    expectedDefaultAcl.length === 2 &&
      missingCatalog.length === 2 &&
      missingDefaultAcl.length === 2 &&
      missingDefaultAcl.every((row) => row.key.includes(':global:')) &&
      applicationOwnerTocEntries.length === 0,
    'ROOT_CAUSE_DEFAULT_ACL_UNCERTAIN',
  )
  requireCheck(
    changed.length === 6 &&
      nonEmpty.length === 6 &&
      changed.every((row) => Number(row.rows) > 0) &&
      applicationRows.length === 5 &&
      publicRows.length === 1 &&
      publicRows[0].key.endsWith('._prisma_migrations') &&
      applicationBlocks.every(Boolean),
    'ROOT_CAUSE_DATA_SHAPE_UNCERTAIN',
  )

  const dataInventory = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-data-inventory.sql'),
    'utf8',
  )
  const restoreRunner = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-restore-local-retry.mjs'),
    'utf8',
  )
  const backupHelper = fs.readFileSync(path.join(backupRestoreDirectory, 'Backup-Dev.ps1'), 'utf8')
  requireCheck(
    dataInventory.includes('ORDER BY (to_jsonb(source_row)::text) COLLATE "C"') &&
      !/SET LOCAL timezone/i.test(dataInventory) &&
      backupHelper.includes("'--schema=public', '--schema=pathways'") &&
      !backupHelper.includes('--inserts') &&
      restoreRunner.indexOf("setStage('local-restore-data')") <
        restoreRunner.indexOf("setStage('local-restore-post-data')"),
    'ROOT_CAUSE_CONTRACT_DRIFT',
  )

  return Object.freeze({
    version: rootCauseVersion,
    status: 'BLOCKED',
    defaultAcl: Object.freeze({
      recorded: expectedDefaultAcl.length,
      missing: missingDefaultAcl.length,
      allDatabaseGlobal: true,
      archiveContainsApplicationOwnerEntry: false,
      schemaFilterOmissionConfirmed: true,
      syntheticProviderRoleCauseRejected: true,
      comparisonContractCorrect: true,
      remediation: 'REVIEWED_ARCHIVE_BOUND_SUPPLEMENT',
    }),
    rowHashes: Object.freeze({
      tableCount: metadata.dataBefore.length,
      nonEmptyTables: nonEmpty.length,
      changedTables: changed.length,
      unchangedNonEmptyTables: 0,
      applicationSchemaTables: applicationRows.length,
      publicSchemaTables: publicRows.length,
      publicEntryClass: 'MIGRATION_LEDGER',
      applicationDefinitionsLocated: applicationBlocks.filter(Boolean).length,
      allApplicationTablesHaveTimestamptz: applicationBlocks.every((block) =>
        /TIMESTAMPTZ|timestamp with time zone/i.test(block),
      ),
      anyApplicationTableHasGeneratedColumn: applicationBlocks.some((block) =>
        /GENERATED\s+ALWAYS/i.test(block),
      ),
      rowCountsEqual: journal.diagnostics.checks.rowCount.pass,
      fullRowJsonTextHash: true,
      cCollationOrdering: true,
      timezonePinned: false,
      sourceServerMajor: Math.floor(Number(metadata.catalogBefore.serverVersion) / 10_000),
      restoreServerMajor: 18,
      crossMajorSerializationExcluded: false,
      triggersLoadedAfterData: true,
      defaultValuesRecomputedDuringCopy: false,
      classification: 'DETERMINISTIC_HASH_CONTRACT_UNDERDETERMINED',
    }),
    hostedConnections: 0,
    hostedWrites: 0,
    archiveRestoreExecuted: false,
    protectedEvidenceModified: false,
  })
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

export async function inspectProtectedRootCause(args) {
  requireCheck(
    JSON.stringify(args) ===
      JSON.stringify([
        '--inspect-protected-metadata',
        `--backup-id=${rootCauseBackupId}`,
        `--authorization=${rootCauseAuthorization}`,
      ]),
    'ROOT_CAUSE_MODE',
  )
  verifySources()
  verifyBackupRestoreSources()
  const directory = path.join(backupRoot, rootCauseBackupId)
  const protectedPaths = validateProtectedPaths(
    path.join(directory, 'application.dump'),
    path.join(directory, 'evidence.json'),
  )
  const metadata = JSON.parse(fs.readFileSync(protectedPaths.evidence, 'utf8'))
  assertBackupMetadata(metadata)
  assertPriorLocalRetryEvidence(metadata)
  assertSnapshot(metadata.catalogBefore, 1, 'postgres')
  requireCheck(
    (await hashFile(protectedPaths.archive)) === metadata.archiveSha256,
    'ARCHIVE_SHA256',
  )
  const journal = assertV2Evidence(directory)
  const environment = cleanEnvironment()
  const archiveList = spawnSync(
    path.join(pgBin, 'pg_restore.exe'),
    ['--list', protectedPaths.archive],
    {
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  requireCheck(!archiveList.error && archiveList.status === 0, 'ROOT_CAUSE_ARCHIVE_TOC')
  return classifyRootCause(metadata, journal, archiveList.stdout, migrationSql())
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    console.log(JSON.stringify(await inspectProtectedRootCause(process.argv.slice(2))))
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'FAILED'
    console.log(
      JSON.stringify({
        version: rootCauseVersion,
        status: 'FAILED',
        failureCode: code,
        hostedConnections: 0,
        hostedWrites: 0,
        archiveRestoreExecuted: false,
        protectedEvidenceModified: false,
      }),
    )
    process.exitCode = 1
  }
}
