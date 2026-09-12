import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareObjects, requireCheck, sha256 } from './config.mjs'

export const backupRestoreDirectory = path.dirname(fileURLToPath(import.meta.url))
export const backupRestorePort = 55452
export const backupRestoreDatabase = 'pathways_phase4_backup_restore'
export const backupRoot = path.resolve('C:/PATHWAYS-backups')
export const backupTableCount = 55
export const backupRestoreFiles = Object.freeze({
  'backup-data-inventory.sql': 'b81f646914ab23384667243daae354d8366e454af0104df5926717d6c87f3712',
  'backup-restore-local-bootstrap.sql':
    '75aecc0643c18fee9dc8677282ba588cfc25adc1d05bb48e600a1208ef8dc403',
  'backup-restore-auth-bootstrap.sql':
    'e95fb9ac7c695778db7c280af10d01633507fa8815cfade286626d8e21a85889',
  'Backup-Dev.ps1': 'e39b05a0a84fcbdc65ba2080b2126d24be3e0c55eb072672968643131dbf179a',
})

export function verifyBackupRestoreSources() {
  for (const [name, expected] of Object.entries(backupRestoreFiles)) {
    requireCheck(
      sha256(fs.readFileSync(path.join(backupRestoreDirectory, name))) === expected,
      'BACKUP_RESTORE_SOURCE',
    )
  }
}

export function validateBackupRestoreArguments(args) {
  requireCheck(
    JSON.stringify(args) ===
      JSON.stringify(['--run-dev', '--authorization=PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY']),
    'BACKUP_RESTORE_MODE',
  )
  return '--run-dev'
}

function validateDataRows(rows) {
  requireCheck(Array.isArray(rows) && rows.length === backupTableCount, 'DATA_SHAPE')
  const keys = new Set()
  for (const row of rows) {
    requireCheck(
      row &&
        typeof row.key === 'string' &&
        /^(public|pathways)\.[A-Za-z0-9_]+$/.test(row.key) &&
        Number.isSafeInteger(Number(row.rows)) &&
        Number(row.rows) >= 0 &&
        /^[a-f0-9]{64}$/.test(row.sha256),
      'DATA_SHAPE',
    )
    keys.add(row.key)
  }
  requireCheck(keys.size === backupTableCount, 'DATA_SHAPE')
}

export function assertBackupMetadata(metadata) {
  requireCheck(
    metadata?.version === 1 &&
      metadata?.target === 'PATHWAYS-dev' &&
      metadata?.projectRef === 'pdqwsknbzkdtiwjjibqt' &&
      metadata?.hostedWrites === 0 &&
      typeof metadata?.backupCompletedUtc === 'string' &&
      Number.isFinite(Date.parse(metadata.backupCompletedUtc)) &&
      /^[a-f0-9]{64}$/.test(metadata?.archiveSha256) &&
      Number(metadata?.archiveBytes) > 0 &&
      /^[a-f0-9]{64}$/.test(metadata?.archiveListSha256) &&
      metadata?.tableDataEntries === backupTableCount,
    'BACKUP_METADATA',
  )
  validateDataRows(metadata.dataBefore)
  validateDataRows(metadata.dataAfter)
  requireCheck(
    JSON.stringify(metadata.catalogBefore) === JSON.stringify(metadata.catalogAfter) &&
      JSON.stringify(metadata.dataBefore) === JSON.stringify(metadata.dataAfter),
    'HOSTED_CONCURRENT_DRIFT',
  )
}

export function validateProtectedPaths(archive, evidence) {
  const actualArchive = fs.realpathSync(archive)
  const actualEvidence = fs.realpathSync(evidence)
  const actualDirectory = fs.realpathSync(path.dirname(actualArchive))
  requireCheck(
    path.dirname(actualDirectory).toLowerCase() === fs.realpathSync(backupRoot).toLowerCase() &&
      /^PATHWAYS-dev-pre-correction-\d{8}-\d{6}$/.test(path.basename(actualDirectory)) &&
      path.dirname(actualEvidence).toLowerCase() === actualDirectory.toLowerCase() &&
      path.basename(actualArchive) === 'application.dump' &&
      path.basename(actualEvidence) === 'evidence.json' &&
      !fs.lstatSync(actualArchive).isSymbolicLink() &&
      !fs.lstatSync(actualEvidence).isSymbolicLink(),
    'PROTECTED_PATH',
  )
  return { archive: actualArchive, evidence: actualEvidence }
}

export function compareDataSnapshots(expected, actual) {
  validateDataRows(expected)
  validateDataRows(actual)
  const expectedMap = new Map(expected.map((row) => [row.key, row]))
  const actualMap = new Map(actual.map((row) => [row.key, row]))
  let counts = true
  let hashes = true
  for (const [key, row] of expectedMap) {
    const observed = actualMap.get(key)
    if (!observed || Number(observed.rows) !== Number(row.rows)) counts = false
    if (!observed || observed.sha256 !== row.sha256) hashes = false
  }
  return { counts, hashes, all: counts && hashes }
}

function sectionMatches(expected, actual, predicate) {
  return compareObjects(expected.filter(predicate), actual.filter(predicate)).length === 0
}

export function compareCatalogSections(expected, actual) {
  const full = compareObjects(expected, actual).length === 0
  const aclKey = (row) =>
    row.key.includes('-acl:') ||
    row.key.startsWith('default-acl:') ||
    row.key.startsWith('schema:') ||
    row.key.startsWith('enum:')
  const ownerKey = (row) =>
    row.key.endsWith(':properties') ||
    (row.key.startsWith('function:') && !row.key.startsWith('function-acl:')) ||
    row.key.startsWith('enum:') ||
    row.key.startsWith('schema:')
  return {
    full,
    ownership: sectionMatches(expected, actual, ownerKey),
    acl: sectionMatches(expected, actual, aclKey),
    rls: sectionMatches(expected, actual, (row) => row.key.startsWith('rls:')),
    policies: sectionMatches(expected, actual, (row) => row.key.startsWith('policy:')),
    triggers: sectionMatches(expected, actual, (row) => row.key.startsWith('trigger:')),
  }
}
