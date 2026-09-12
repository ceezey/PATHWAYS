import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  assertState,
  dataInventoryFingerprint,
  deployAuthorization,
  directory,
  parseWriterResult,
  privateEvidenceRecord,
  publicEvidenceRecord,
  readRecoveryEvidence,
  recoveryAuthorization,
  requireCheck,
  rollbackAuthorization,
  root,
  stageMigrations,
  validateArguments,
  validateEvidence,
  validateStaging,
  verifySources,
} from './deployment-config.mjs'
import { checkStartup } from './startup-check.mjs'

function cleanEnvironment(input = process.env) {
  const result = {}
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    const actual = Object.keys(input).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    )
    if (actual) result[key] = input[actual]
  }
  return result
}

function execute(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    env: cleanEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 180_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    error: result.error,
  }
}

function readHosted() {
  const result = execute(
    path.join(
      process.env.SystemRoot ?? 'C:/Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(directory, 'Read-DevSessionLiveness.ps1'),
    ],
  )
  requireCheck(!result.error && result.status === 0, 'LIVENESS_READ')
  const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) ?? '')
  requireCheck(parsed?.status !== 'FAILED', 'LIVENESS_READ')
  return parsed
}

function writeEvidence(evidence, value, flag) {
  const file = path.join(evidence, 'result.json')
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, flag ? { flag } : undefined)
}

function invokeWriter(action, staged) {
  const authorization = action === 'Deploy' ? deployAuthorization : rollbackAuthorization
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(directory, 'Write-DevSessionLiveness.ps1'),
    '-Action',
    action,
  ]
  if (action === 'Deploy') args.push('-StagePath', staged)
  args.push('-Authorization', authorization)
  args.push(action === 'Deploy' ? '-BackupRestoreConfirmed' : '-RecoveryAuthorized')
  args.push('-MaintenanceConfirmed')
  const result = execute(
    path.join(
      process.env.SystemRoot ?? 'C:/Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    args,
    { timeout: 180_000 },
  )
  return { status: result.status, parsed: parseWriterResult(result.stdout) }
}

function runLocal() {
  const result = execute(
    process.execPath,
    [path.join(root, 'apps/api/prisma/tests/session-liveness-local.mjs')],
    {
      timeout: 240_000,
    },
  )
  requireCheck(!result.error && result.status === 0, 'LIVENESS_LOCAL')
  const match = result.stdout.match(/SESSION_LIVENESS_LOCAL=PASS; ASSERTIONS=(\d+)/)
  requireCheck(match, 'LIVENESS_LOCAL')
  return {
    status: 'PASS',
    mode: 'local',
    stage: 'complete',
    assertions: Number(match[1]),
    hostedConnections: 0,
    hostedWriteAttempts: 0,
    localCleanup: /DISPOSABLE_LOCAL_CLEANUP=PASS/.test(result.stdout),
  }
}

function runCheck() {
  const startup = checkStartup()
  if (startup.status !== 'PASS') return startupBlocked('check-dev', startup)
  const state = readHosted()
  try {
    assertState(state, 'pre')
  } catch {
    return {
      status: 'BLOCKED',
      mode: 'check-dev',
      stage: 'hosted-state',
      hostedConnections: 1,
      hostedWriteAttempts: 0,
      nextState: 'MAINTENANCE_OR_STATE_REVIEW_REQUIRED',
    }
  }
  return {
    status: 'PASS',
    mode: 'check-dev',
    stage: 'ready-to-deploy',
    canonicalObjects: 1193,
    dataTablesVerified: 54,
    hostedLedgerPrefix: 5,
    maintenanceReady: true,
    hostedConnections: 1,
    hostedWriteAttempts: 0,
    nextState: 'READY_TO_DEPLOY_0006',
  }
}

function startupBlocked(mode, startup) {
  return {
    status: 'BLOCKED',
    mode,
    stage: 'startup',
    startupFailure: startup.failure,
    localCleanup: startup.localCleanup,
    hostedConnections: 0,
    hostedWriteAttempts: 0,
  }
}

function runMutation(mode) {
  if (mode === 'apply-dev') {
    const startup = checkStartup()
    if (startup.status !== 'PASS') return startupBlocked(mode, startup)
  }
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  let hostedConnections = 0
  let hostedWriteAttempts = 0
  let stage = 'preflight'
  let initialLedgerPrefix
  let preflightDataFingerprint
  try {
    hostedConnections += 1
    const preflight = readHosted()
    const phase = mode === 'apply-dev' ? 'pre' : 'post'
    const initialData = assertState(preflight, phase)
    initialLedgerPrefix = phase === 'pre' ? 5 : 6
    preflightDataFingerprint = dataInventoryFingerprint(initialData)
    const staged = mode === 'apply-dev' ? stageMigrations(evidence) : ''
    writeEvidence(
      evidence,
      privateEvidenceRecord(
        {
          status: 'IN_PROGRESS',
          mode,
          stage,
          initialLedgerPrefix,
          canonicalObjects: 1193,
          dataTablesVerified: 54,
          hostedConnections,
          hostedWriteAttempts,
        },
        preflightDataFingerprint,
      ),
      'wx',
    )
    stage = mode === 'apply-dev' ? 'deploy' : 'rollback'
    const writer = invokeWriter(mode === 'apply-dev' ? 'Deploy' : 'Rollback', staged)
    if (writer.parsed.status !== 'FAILED') hostedWriteAttempts = 1
    if (writer.status !== 0 || writer.parsed.status !== 'PASS') {
      const summary = {
        status: writer.parsed.status === 'FAILED' ? 'FAILED' : 'UNCERTAIN',
        mode,
        stage,
        initialLedgerPrefix,
        canonicalObjects: 1193,
        dataTablesVerified: 54,
        hostedConnections,
        hostedWriteAttempts,
        recoveryRequired: writer.parsed.status !== 'FAILED',
        writerOutcome: writer.parsed.outcome,
        ...(Number.isInteger(writer.parsed.processId)
          ? { processId: writer.parsed.processId }
          : {}),
        ...(Number.isInteger(writer.parsed.childExitCode)
          ? { childExitCode: writer.parsed.childExitCode }
          : {}),
      }
      const record = privateEvidenceRecord(summary, preflightDataFingerprint)
      writeEvidence(evidence, record)
      return {
        ...publicEvidenceRecord(record),
        evidence: path.relative(root, evidence).replaceAll('\\', '/'),
      }
    }
    stage = 'postflight'
    hostedConnections += 1
    const observed = readHosted()
    assertState(observed, mode === 'apply-dev' ? 'post' : 'contained', initialData)
    const summary = {
      status: 'PASS',
      mode,
      stage: 'complete',
      initialLedgerPrefix,
      canonicalObjects: 1193,
      hostedConnections,
      hostedWriteAttempts,
      hostedLedgerPrefix: 6,
      dataTablesVerified: 54,
      dataInventoryEqual: true,
      writerOutcome: writer.parsed.outcome,
      nextState: mode === 'apply-dev' ? 'READY_FOR_API_RESTART' : 'CONTAINED_FORWARD_FIX_REQUIRED',
    }
    const record = privateEvidenceRecord(summary, preflightDataFingerprint)
    writeEvidence(evidence, record)
    return {
      ...publicEvidenceRecord(record),
      evidence: path.relative(root, evidence).replaceAll('\\', '/'),
    }
  } catch {
    const summary = {
      status: hostedWriteAttempts > 0 ? 'UNCERTAIN' : 'FAILED',
      mode,
      stage,
      ...(initialLedgerPrefix ? { initialLedgerPrefix } : {}),
      ...(initialLedgerPrefix ? { canonicalObjects: 1193, dataTablesVerified: 54 } : {}),
      hostedConnections,
      hostedWriteAttempts,
      recoveryRequired: hostedWriteAttempts > 0,
      ...(hostedWriteAttempts > 0 ? { writerOutcome: 'RUNNER_EXCEPTION_AFTER_WRITE' } : {}),
    }
    const record =
      preflightDataFingerprint === undefined
        ? summary
        : privateEvidenceRecord(summary, preflightDataFingerprint)
    try {
      writeEvidence(evidence, record)
    } catch {}
    return {
      ...(preflightDataFingerprint === undefined ? summary : publicEvidenceRecord(record)),
      evidence: path.relative(root, evidence).replaceAll('\\', '/'),
    }
  }
}

function runRecovery(relativePath) {
  const evidence = validateEvidence(relativePath)
  const recoveryEvidence = readRecoveryEvidence(evidence)
  if (recoveryEvidence.mode === 'apply-dev') validateStaging(path.join(evidence, 'migrations'))
  let state
  try {
    state = readHosted()
  } catch {
    return {
      status: 'FAILED',
      mode: 'recover-dev',
      stage: 'hosted-read',
      hostedConnections: 1,
      hostedWriteAttempts: 0,
    }
  }
  let classification = 'UNRESOLVED'
  let dataInventoryEqual = false
  try {
    dataInventoryEqual =
      dataInventoryFingerprint(state.data) === recoveryEvidence.preflightDataFingerprint
  } catch {}
  if (dataInventoryEqual) {
    try {
      assertState(state, 'pre')
      classification = 'NOT_APPLIED'
    } catch {
      try {
        assertState(state, 'post')
        classification = 'DEPLOYED'
      } catch {
        try {
          assertState(state, 'contained')
          classification = 'ROLLED_BACK_CONTAINMENT'
        } catch {}
      }
    }
  }
  return {
    status: classification === 'UNRESOLVED' ? 'BLOCKED' : 'PASS',
    mode: 'recover-dev',
    stage: 'complete',
    classification,
    dataInventoryEqual,
    hostedConnections: 1,
    hostedWriteAttempts: 0,
  }
}

let output
try {
  verifySources()
  const { mode, evidence } = validateArguments(process.argv.slice(2))
  if (mode === 'local') output = runLocal()
  else if (mode === 'check-dev') output = runCheck()
  else if (mode === 'recover-dev') output = runRecovery(evidence)
  else output = runMutation(mode)
} catch {
  output = {
    status: 'FAILED',
    stage: 'guard',
    hostedConnections: 0,
    hostedWriteAttempts: 0,
  }
}
console.log(JSON.stringify(output))
process.exitCode = output.status === 'PASS' ? 0 : 1
