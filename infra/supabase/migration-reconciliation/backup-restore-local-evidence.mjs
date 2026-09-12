import fs from 'node:fs'
import path from 'node:path'
import { sanitizeDiagnostics } from './backup-restore-local-diagnostics.mjs'
import { requireCheck, sha256 } from './config.mjs'

export const diagnosticAuthorization = 'PATHWAYS_DEV_LOCAL_COMPARISON_DIAGNOSTIC_RETRY_V2'
export const diagnosticJournalName = 'local-retry-comparison-v2.json'
export const diagnosticClaimName = 'local-retry-comparison-v2.claim.json'
export const priorDiagnosticJournalName = 'local-retry-comparison-v1.json'
export const priorDiagnosticClaimName = 'local-retry-comparison-v1.claim.json'
export const priorDiagnosticDigests = Object.freeze({
  claimSha256: '2306a14e801c8d13e5dbc681a6b8fabd309183582e01377d7c0ff6f7feb93d47',
  journalSha256: '3aa1c2d4229da005a9b1a81394e592d78bce3288d3617324fc7af04d7494366e',
})

const priorChecks = Object.freeze({
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

export function assertPriorLocalRetryEvidence(metadata) {
  const prior = metadata?.localRetry
  requireCheck(
    prior?.status === 'FAILED' &&
      prior.stage === 'local-verification' &&
      prior.failureCode === 'RESTORE_COMPARISON' &&
      prior.startedUtc === '2026-09-09T06:15:55.585Z' &&
      prior.completedUtc === null &&
      prior.port === 55453 &&
      prior.targetLoopbackOnly === true &&
      prior.hostedConnections === 0 &&
      prior.hostedWrites === 0 &&
      prior.localRestoreStopped === true &&
      prior.localRestoreRemoved === true,
    'LOCAL_RETRY_PRIOR_STATE',
  )
}

function regularEvidenceFile(directory, name) {
  const file = path.join(directory, name)
  requireCheck(
    fs.existsSync(file) &&
      !fs.lstatSync(file).isSymbolicLink() &&
      fs.lstatSync(file).isFile() &&
      path.dirname(fs.realpathSync(file)).toLowerCase() === directory.toLowerCase(),
    'V1_EVIDENCE_PATH',
  )
  return file
}

function pathEntryExists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export function assertPriorDiagnosticEvidence(directory, expectedDigests = priorDiagnosticDigests) {
  const actualDirectory = fs.realpathSync(directory)
  requireCheck(
    /^[a-f0-9]{64}$/.test(expectedDigests?.claimSha256) &&
      /^[a-f0-9]{64}$/.test(expectedDigests?.journalSha256),
    'V1_EVIDENCE_DIGEST',
  )
  const claimBytes = fs.readFileSync(regularEvidenceFile(actualDirectory, priorDiagnosticClaimName))
  const journalBytes = fs.readFileSync(
    regularEvidenceFile(actualDirectory, priorDiagnosticJournalName),
  )
  requireCheck(
    sha256(claimBytes) === expectedDigests.claimSha256 &&
      sha256(journalBytes) === expectedDigests.journalSha256,
    'V1_EVIDENCE_CHANGED',
  )
  const claim = JSON.parse(claimBytes.toString('utf8'))
  const journal = JSON.parse(journalBytes.toString('utf8'))
  requireCheck(
    JSON.stringify(claim) === JSON.stringify({ version: 1, consumed: true }) &&
      journal?.version === 1 &&
      journal.status === 'FAILED' &&
      journal.stage === 'local-verification' &&
      journal.failureCode === 'RESTORE_COMPARISON' &&
      journal.startedUtc === '2026-09-09T07:48:35.989Z' &&
      journal.completedUtc === '2026-09-09T07:48:42.414Z' &&
      journal.targetLoopbackOnly === true &&
      journal.hostedConnections === 0 &&
      journal.hostedWrites === 0 &&
      journal.localRestoreStopped === true &&
      journal.localRestoreRemoved === true &&
      journal.diagnostics?.version === 1 &&
      journal.diagnostics.allPassed === false &&
      Array.isArray(journal.checkpoints) &&
      journal.checkpoints.length === 12 &&
      journal.checkpoints.at(-1)?.status === 'FAILED' &&
      journal.checkpoints.at(-1)?.stage === 'local-verification' &&
      journal.checkpoints.at(-1)?.failureCode === 'RESTORE_COMPARISON',
    'V1_EVIDENCE_STATE',
  )
  for (const [name, expected] of Object.entries(priorChecks)) {
    const item = journal.diagnostics.checks?.[name]
    requireCheck(
      JSON.stringify([item?.evaluated, item?.pass, item?.missing, item?.extra, item?.changed]) ===
        JSON.stringify(expected),
      'V1_EVIDENCE_STATE',
    )
  }
  requireCheck(
    Object.keys(journal.diagnostics.checks).length === Object.keys(priorChecks).length,
    'V1_EVIDENCE_STATE',
  )
}

const stages = new Set([
  'local-initdb',
  'local-start',
  'local-provider-bootstrap',
  'local-retry-role-bootstrap',
  'local-archive-list',
  'local-restore-pre-data',
  'local-restore-data',
  'local-auth-bootstrap',
  'local-restore-post-data',
  'local-verification',
  'complete',
  'local-stop',
  'local-cleanup',
  'evidence-update',
])
const failureCodes = new Set([
  'RESTORE_COMPARISON',
  'LOCAL_STOP_FAILED',
  'LOCAL_CLEANUP_FAILED',
  'EVIDENCE_UPDATE_FAILED',
  'MISSING_SYNTHETIC_ROLE',
  'SCHEMA_CONFLICT',
  'MISSING_LOCAL_DEPENDENCY',
  'LOCAL_PERMISSION',
  'CONSTRAINT_CONFLICT',
  'LOCAL_CONNECTION',
  'LOCAL_CHILD_FAILED',
  'LOCAL_RETRY_FAILURE',
  'ARCHIVE_SCOPE',
  'SOURCE_CHECKSUM',
  'BACKUP_RESTORE_SOURCE',
  'LOCAL_RETRY_SOURCE',
])

// Original/V1 evidence stays immutable. A permanent exclusive V2 claim consumes
// this diagnostic revision, including crashes and unchanged comparison failures.
export function claimDiagnosticAttempt(
  evidencePath,
  originalBytes,
  expectedPriorDigests = priorDiagnosticDigests,
) {
  const directory = fs.realpathSync(path.dirname(evidencePath))
  requireCheck(
    path.basename(evidencePath) === 'evidence.json' && !fs.lstatSync(evidencePath).isSymbolicLink(),
    'EVIDENCE_PATH',
  )
  requireCheck(fs.readFileSync(evidencePath).equals(originalBytes), 'EVIDENCE_CHANGED')
  assertPriorLocalRetryEvidence(JSON.parse(originalBytes.toString('utf8')))
  assertPriorDiagnosticEvidence(directory, expectedPriorDigests)
  const journalPath = path.join(directory, diagnosticJournalName)
  const claimPath = path.join(directory, diagnosticClaimName)
  requireCheck(!pathEntryExists(journalPath), 'LOCAL_RETRY_CONSUMED')
  let descriptor
  try {
    descriptor = fs.openSync(claimPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, JSON.stringify({ version: 2, consumed: true, priorVersion: 1 }))
    fs.fsyncSync(descriptor)
  } catch {
    throw new Error('LOCAL_RETRY_CONSUMED')
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
  // No deletion of the claim on failure. Recheck every prior source after acquiring it.
  requireCheck(fs.readFileSync(evidencePath).equals(originalBytes), 'EVIDENCE_CHANGED')
  assertPriorDiagnosticEvidence(directory, expectedPriorDigests)
  const startedUtc = new Date().toISOString()
  const checkpoints = []
  let latestDiagnostics = null
  let sequence = 0
  return {
    startedUtc,
    record({ status, stage, failureCode, localRestoreStopped, localRestoreRemoved, diagnostics }) {
      requireCheck(
        ['RUNNING', 'PASS', 'FAILED'].includes(status) && stages.has(stage),
        'EVIDENCE_OUTPUT',
      )
      if (diagnostics) latestDiagnostics = sanitizeDiagnostics(diagnostics)
      requireCheck(
        typeof localRestoreStopped === 'boolean' && typeof localRestoreRemoved === 'boolean',
        'EVIDENCE_OUTPUT',
      )
      requireCheck(
        checkpoints.at(-1)?.status !== 'PASS' && checkpoints.at(-1)?.status !== 'FAILED',
        'EVIDENCE_FINALIZED',
      )
      requireCheck(
        status !== 'PASS' ||
          (stage === 'complete' &&
            failureCode === null &&
            latestDiagnostics?.allPassed === true &&
            localRestoreStopped &&
            localRestoreRemoved),
        'EVIDENCE_OUTPUT',
      )
      const checkpoint = {
        status,
        stage,
        failureCode:
          failureCode === null
            ? null
            : failureCodes.has(failureCode)
              ? failureCode
              : 'LOCAL_RETRY_FAILURE',
        utc: new Date().toISOString(),
        localRestoreStopped,
        localRestoreRemoved,
        diagnostics: latestDiagnostics,
      }
      const next = [...checkpoints, checkpoint]
      requireCheck(next.length <= 32, 'EVIDENCE_LIMIT')
      const document = {
        version: 2,
        status,
        stage,
        failureCode: checkpoint.failureCode,
        startedUtc,
        completedUtc: status === 'RUNNING' ? null : checkpoint.utc,
        targetLoopbackOnly: true,
        hostedConnections: 0,
        hostedWrites: 0,
        localRestoreStopped,
        localRestoreRemoved,
        diagnostics: latestDiagnostics,
        checkpoints: next,
      }
      const temporary = `${journalPath}.${++sequence}.tmp`
      let handle
      let temporaryOwned = false
      try {
        requireCheck(
          !pathEntryExists(journalPath) || !fs.lstatSync(journalPath).isSymbolicLink(),
          'EVIDENCE_PATH',
        )
        handle = fs.openSync(temporary, 'wx', 0o600)
        temporaryOwned = true
        fs.writeFileSync(handle, JSON.stringify(document, null, 2))
        fs.fsyncSync(handle)
        fs.closeSync(handle)
        handle = undefined
        fs.renameSync(temporary, journalPath)
        checkpoints.push(checkpoint)
      } catch {
        throw new Error('EVIDENCE_UPDATE_FAILED')
      } finally {
        if (handle !== undefined) fs.closeSync(handle)
        if (temporaryOwned && fs.existsSync(temporary)) fs.unlinkSync(temporary)
      }
    },
  }
}
