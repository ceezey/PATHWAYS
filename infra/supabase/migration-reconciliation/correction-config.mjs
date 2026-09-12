import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireCheck, sha256 } from './config.mjs'

export const directory = path.dirname(fileURLToPath(import.meta.url))
export const correctionLocalPort = 55451
export const canonicalObjectCount = 1193
export const canonicalVectorSha256 =
  '36d404835e94e8fd4bf94afd4688d15b5292eba451ef237ae6229309cf989777'
export const targetDefinitionSha256 =
  'efbe62e1fdc7cacb75a44dea4c5d91892c9a4f1e98031582127e5089ddb8dd02'
export const knownDifferences = Object.freeze([
  Object.freeze({
    key: 'function-acl:public.pathways_prevent_audit_mutation()',
    kind: 'extra',
  }),
  Object.freeze({
    key: 'function:public.pathways_prevent_audit_mutation()',
    kind: 'extra',
  }),
])
export const correctionFiles = Object.freeze({
  'correction.sql': '46a5557e95671652851f254a78efcbfbd1b1ca241196ae45f4e1c57690842457',
  'correction-rollback.sql': '0a3c1c74eb80ece0283da2d2114b86323a8f0e0cc37b8e210630d868d1fc939d',
  'correction-verify.sql': '903aea3c3e99e38d4f4cd8291237d86c1fc7c2b5038670f01adb025905644651',
})

export function verifyCorrectionSources() {
  for (const [name, expected] of Object.entries(correctionFiles)) {
    requireCheck(
      sha256(fs.readFileSync(path.join(directory, name))) === expected,
      'CORRECTION_SOURCE',
    )
  }
}

export function parseComparison(stdout) {
  let result
  try {
    const lines = stdout.trim().split(/\r?\n/)
    result = JSON.parse(lines.at(-1) ?? '')
  } catch {
    throw new Error('COMPARISON_OUTPUT')
  }
  requireCheck(
    result?.hostedWrites === 0 &&
      result?.localClusterStopped === true &&
      result?.canonicalObjects === canonicalObjectCount &&
      result?.canonicalSha256 === canonicalVectorSha256 &&
      result?.hostedLedgerPrefix === 1 &&
      result?.baseliningAuthorized === false,
    'COMPARISON_BASELINE',
  )
  return result
}

export function classifyComparison(result) {
  if (
    result.status === 'PASS' &&
    Array.isArray(result.differences) &&
    result.differences.length === 0
  )
    return 'READY_TO_ROLLBACK'
  if (
    result.status === 'BLOCKED' &&
    JSON.stringify(result.differences) === JSON.stringify(knownDifferences)
  )
    return 'READY_TO_CORRECT'
  return 'BLOCKED'
}

export function validateArguments(args) {
  if (args.length === 1 && ['--local', '--check-dev'].includes(args[0])) return args[0]
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      '--apply-dev',
      '--authorization=PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY',
      '--backup-restore-confirmed',
      '--maintenance-confirmed',
    ])
  )
    return '--apply-dev'
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      '--rollback-dev',
      '--authorization=PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY',
      '--recovery-authorized',
      '--maintenance-confirmed',
    ])
  )
    return '--rollback-dev'
  throw new Error('CORRECTION_MODE')
}
