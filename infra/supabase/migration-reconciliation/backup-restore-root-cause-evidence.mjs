import fs from 'node:fs'
import path from 'node:path'
import { assertPriorLocalRetryEvidence } from './backup-restore-local-evidence.mjs'
import { assertV2Evidence } from './backup-restore-root-cause.mjs'
import { requireCheck } from './config.mjs'

export const rootCauseRetryAuthorization = 'PATHWAYS_DEV_LOCAL_ROOT_CAUSE_RETRY_V3'
export const rootCauseRetryClaimName = 'local-retry-root-cause-v3.claim.json'
export const rootCauseRetryJournalName = 'local-retry-root-cause-v3.json'

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
  'local-baseline-verification',
  'local-default-acl-supplement',
  'local-controlled-verification',
  'complete',
  'local-stop',
  'local-cleanup',
  'evidence-update',
])
const failureCodes = new Set([
  'ROOT_CAUSE_COMPARISON',
  'ROOT_CAUSE_BASELINE_DRIFT',
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
  'ROOT_CAUSE_RETRY_FAILURE',
  'ARCHIVE_SCOPE',
  'SOURCE_CHECKSUM',
  'BACKUP_RESTORE_SOURCE',
  'ROOT_CAUSE_RETRY_SOURCE',
])

function pathEntryExists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export function sanitizeRootCauseDiagnostics(value) {
  requireCheck(value?.version === 3, 'ROOT_CAUSE_EVIDENCE_OUTPUT')
  const booleans = [
    'baselineReproduced',
    'sourceMajor17',
    'targetMajor18',
    'targetDefaultTimezoneUtc',
    'supplementApplied',
    'supplementRollbackPrepared',
    'catalogPassAfterSupplement',
    'rowCountsPass',
    'utcHashesPass',
    'timezoneCauseConfirmed',
    'crossMajorSerializationExcluded',
  ]
  const output = { version: 3 }
  for (const name of booleans) {
    requireCheck(typeof value[name] === 'boolean', 'ROOT_CAUSE_EVIDENCE_OUTPUT')
    output[name] = value[name]
  }
  const counts = [
    'baselineCatalogMissing',
    'baselineAclMissing',
    'baselineHashChanged',
    'controlledCatalogMissing',
    'controlledHashChanged',
  ]
  for (const name of counts) {
    requireCheck(
      Number.isSafeInteger(value[name]) && value[name] >= 0 && value[name] <= 10_000,
      'ROOT_CAUSE_EVIDENCE_OUTPUT',
    )
    output[name] = value[name]
  }
  requireCheck(
    (!output.baselineReproduced ||
      (output.baselineCatalogMissing === 2 &&
        output.baselineAclMissing === 2 &&
        output.baselineHashChanged === 6)) &&
      (!output.timezoneCauseConfirmed ||
        (output.baselineReproduced &&
          output.sourceMajor17 &&
          output.targetMajor18 &&
          !output.targetDefaultTimezoneUtc &&
          output.supplementApplied &&
          output.catalogPassAfterSupplement &&
          output.rowCountsPass &&
          output.utcHashesPass &&
          output.controlledCatalogMissing === 0 &&
          output.controlledHashChanged === 0 &&
          output.crossMajorSerializationExcluded)),
    'ROOT_CAUSE_EVIDENCE_OUTPUT',
  )
  return output
}

export function claimRootCauseAttempt(
  evidencePath,
  originalBytes,
  validators = {
    original: assertPriorLocalRetryEvidence,
    v2: assertV2Evidence,
  },
) {
  const directory = fs.realpathSync(path.dirname(evidencePath))
  requireCheck(
    typeof validators?.original === 'function' && typeof validators?.v2 === 'function',
    'ROOT_CAUSE_EVIDENCE_VALIDATOR',
  )
  requireCheck(
    path.basename(evidencePath) === 'evidence.json' && !fs.lstatSync(evidencePath).isSymbolicLink(),
    'ROOT_CAUSE_EVIDENCE_PATH',
  )
  requireCheck(fs.readFileSync(evidencePath).equals(originalBytes), 'EVIDENCE_CHANGED')
  validators.original(JSON.parse(originalBytes.toString('utf8')))
  validators.v2(directory)
  const claimPath = path.join(directory, rootCauseRetryClaimName)
  const journalPath = path.join(directory, rootCauseRetryJournalName)
  requireCheck(
    !pathEntryExists(claimPath) && !pathEntryExists(journalPath),
    'ROOT_CAUSE_RETRY_CONSUMED',
  )
  let claimHandle
  try {
    claimHandle = fs.openSync(claimPath, 'wx', 0o600)
    fs.writeFileSync(claimHandle, JSON.stringify({ version: 3, consumed: true, priorVersion: 2 }))
    fs.fsyncSync(claimHandle)
  } catch {
    throw new Error('ROOT_CAUSE_RETRY_CONSUMED')
  } finally {
    if (claimHandle !== undefined) fs.closeSync(claimHandle)
  }
  requireCheck(fs.readFileSync(evidencePath).equals(originalBytes), 'EVIDENCE_CHANGED')
  validators.v2(directory)

  const startedUtc = new Date().toISOString()
  const checkpoints = []
  let latestDiagnostics = null
  let sequence = 0
  return {
    startedUtc,
    record({ status, stage, failureCode, diagnostics, localRestoreStopped, localRestoreRemoved }) {
      requireCheck(
        ['RUNNING', 'PASS', 'FAILED'].includes(status) &&
          stages.has(stage) &&
          typeof localRestoreStopped === 'boolean' &&
          typeof localRestoreRemoved === 'boolean',
        'ROOT_CAUSE_EVIDENCE_OUTPUT',
      )
      if (diagnostics) latestDiagnostics = sanitizeRootCauseDiagnostics(diagnostics)
      requireCheck(
        checkpoints.at(-1)?.status !== 'PASS' && checkpoints.at(-1)?.status !== 'FAILED',
        'ROOT_CAUSE_EVIDENCE_FINALIZED',
      )
      requireCheck(
        status !== 'PASS' ||
          (stage === 'complete' &&
            failureCode === null &&
            latestDiagnostics?.timezoneCauseConfirmed === true &&
            localRestoreStopped &&
            localRestoreRemoved),
        'ROOT_CAUSE_EVIDENCE_OUTPUT',
      )
      const checkpoint = {
        status,
        stage,
        failureCode:
          failureCode === null
            ? null
            : failureCodes.has(failureCode)
              ? failureCode
              : 'ROOT_CAUSE_RETRY_FAILURE',
        utc: new Date().toISOString(),
        localRestoreStopped,
        localRestoreRemoved,
        diagnostics: latestDiagnostics,
      }
      const next = [...checkpoints, checkpoint]
      requireCheck(next.length <= 32, 'ROOT_CAUSE_EVIDENCE_OUTPUT')
      const document = {
        version: 3,
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
      let journalHandle
      let temporaryOwned = false
      try {
        requireCheck(
          !pathEntryExists(journalPath) || !fs.lstatSync(journalPath).isSymbolicLink(),
          'ROOT_CAUSE_EVIDENCE_PATH',
        )
        journalHandle = fs.openSync(temporary, 'wx', 0o600)
        temporaryOwned = true
        fs.writeFileSync(journalHandle, JSON.stringify(document, null, 2))
        fs.fsyncSync(journalHandle)
        fs.closeSync(journalHandle)
        journalHandle = undefined
        fs.renameSync(temporary, journalPath)
        checkpoints.push(checkpoint)
      } catch {
        throw new Error('EVIDENCE_UPDATE_FAILED')
      } finally {
        if (journalHandle !== undefined) fs.closeSync(journalHandle)
        if (temporaryOwned && fs.existsSync(temporary)) fs.unlinkSync(temporary)
      }
    },
  }
}
