import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { backupRestoreDatabase, backupTableCount } from './backup-restore-config.mjs'
import {
  collectRestoreDiagnostics,
  compareRestoreDiagnostics,
  comparisonNames,
  createIdentifierFingerprinter,
  diagnosticVersion,
  differenceLimit,
  evaluateChecks,
  identifierFingerprintLimit,
  sanitizeDiagnostics,
} from './backup-restore-local-diagnostics.mjs'
import {
  assertPriorDiagnosticEvidence,
  claimDiagnosticAttempt,
  diagnosticClaimName,
  diagnosticJournalName,
  priorDiagnosticClaimName,
  priorDiagnosticJournalName,
} from './backup-restore-local-evidence.mjs'
import { cleanupLocalRetry } from './backup-restore-local-retry.mjs'
import { migrations, root, sha256 } from './config.mjs'

const syntheticPrivate = 'private_fixture_do_not_emit'
const catalogDigest = 'a'.repeat(64)
const archiveDigest = '1'.repeat(64)
const fingerprintPattern = /^[a-f0-9]{64}$/

function catalog() {
  const keys = [
    'relation:pathways.example:properties',
    'table-acl:pathways.example',
    'rls:pathways.example',
    'policy:pathways.example.read',
    'trigger:pathways.example.guard',
  ]
  return {
    version: 1,
    readOnly: true,
    user: 'postgres',
    sessionUser: 'postgres',
    database: backupRestoreDatabase,
    serverVersion: 180000,
    ledgerLocations: ['public'],
    otherLedger: false,
    livenessAbsent: true,
    targetTables: 39,
    legacyTables: 15,
    pgcryptoPresent: true,
    runtimeSafe: true,
    ledger: [
      {
        name: migrations[0][0],
        checksum: migrations[0][1],
        finished: true,
        rolledBack: false,
        failureLog: false,
        steps: 1,
      },
    ],
    objects: [
      ...keys.map((key) => ({ key, fingerprint: catalogDigest })),
      ...Array.from({ length: 1000 }, (_, i) => ({
        key: `constraint:pathways.example.c${i}`,
        fingerprint: catalogDigest,
      })),
    ],
  }
}

const data = () =>
  Array.from({ length: backupTableCount }, (_, i) => ({
    key: `pathways.example${i}`,
    rows: i,
    sha256: catalogDigest,
  }))

const compare = (observed = catalog(), rows = data()) =>
  compareRestoreDiagnostics(catalog(), observed, data(), rows, archiveDigest)

const emptyGroups = () => ({
  fingerprints: { missing: [], extra: [], changed: [] },
  truncated: { missing: false, extra: false, changed: false },
})

test('keyed identifier fingerprints are deterministic, scope-separated and non-raw', () => {
  const fingerprint = createIdentifierFingerprinter(archiveDigest)
  const catalogToken = fingerprint('catalog', syntheticPrivate)
  assert.match(catalogToken, fingerprintPattern)
  assert.equal(catalogToken, fingerprint('catalog', syntheticPrivate))
  assert.notEqual(catalogToken, fingerprint('data', syntheticPrivate))
  assert.notEqual(catalogToken, sha256(syntheticPrivate))
  assert.notEqual(catalogToken, archiveDigest)
  assert.throws(() => createIdentifierFingerprinter('not-a-key'), /DIAGNOSTIC_KEY/)
  assert.throws(() => fingerprint('unknown', syntheticPrivate), /DIAGNOSTIC_IDENTIFIER/)
})

test('identical reviewed inventories pass every dimension with empty fingerprint sets', () => {
  const result = compare()
  assert.equal(result.version, diagnosticVersion)
  assert.equal(result.allPassed, true)
  assert.deepEqual(Object.keys(result.checks), comparisonNames)
  for (const item of Object.values(result.checks)) {
    assert.deepEqual(item, {
      evaluated: true,
      pass: true,
      missing: 0,
      extra: 0,
      changed: 0,
      ...emptyGroups(),
    })
  }
})

const changes = {
  schema: (c) => {
    c.objects[5].fingerprint = 'b'.repeat(64)
  },
  rowCount: (_, rows) => {
    rows[0].rows++
  },
  rowHash: (_, rows) => {
    rows[0].sha256 = 'b'.repeat(64)
  },
  migrationLedger: (c) => {
    c.ledger[0].steps++
  },
  ownership: (c) => {
    c.objects[0].fingerprint = 'b'.repeat(64)
  },
  acl: (c) => {
    c.objects[1].fingerprint = 'b'.repeat(64)
  },
  rls: (c) => {
    c.objects[2].fingerprint = 'b'.repeat(64)
  },
  policies: (c) => {
    c.objects[3].fingerprint = 'b'.repeat(64)
  },
  triggers: (c) => {
    c.objects[4].fingerprint = 'b'.repeat(64)
  },
  requiredExtensions: (c) => {
    c.pgcryptoPresent = false
  },
  catalogSafety: (c) => {
    c.runtimeSafe = false
  },
}

for (const [name, change] of Object.entries(changes)) {
  test(`detects ${name} failure with a bounded opaque identifier when evaluated`, () => {
    const observed = catalog()
    const rows = data()
    change(observed, rows)
    const result = compare(observed, rows)
    const item = result.checks[name]
    assert.equal(result.allPassed, false)
    assert.equal(item.pass, false)
    assert.equal(Object.keys(result.checks).length, comparisonNames.length)
    if (item.evaluated) {
      assert.equal(item.missing + item.extra + item.changed, 1)
      assert.equal(
        Object.values(item.fingerprints)
          .flat()
          .every((value) => fingerprintPattern.test(value)),
        true,
      )
    } else {
      assert.deepEqual(item, {
        evaluated: false,
        pass: false,
        missing: 0,
        extra: 0,
        changed: 0,
        ...emptyGroups(),
      })
    }
  })
}

test('same catalog entry has the same opaque token across schema and ACL subsets', () => {
  const observed = catalog()
  observed.objects.splice(1, 1)
  const result = compare(observed)
  assert.equal(result.checks.schema.missing, 1)
  assert.equal(result.checks.acl.missing, 1)
  assert.equal(
    result.checks.schema.fingerprints.missing[0],
    result.checks.acl.fingerprints.missing[0],
  )
})

test('all checks run after an earlier throw and raw error details are discarded', () => {
  const visited = []
  const baseline = compare().checks.schema
  const fingerprint = createIdentifierFingerprinter(archiveDigest)('catalog', syntheticPrivate)
  const failed = {
    ...baseline,
    pass: false,
    changed: 1,
    fingerprints: { ...baseline.fingerprints, changed: [fingerprint] },
  }
  const checks = Object.fromEntries(
    comparisonNames.map((name) => [
      name,
      () => {
        visited.push(name)
        if (name === 'schema') throw new Error(syntheticPrivate)
        return failed
      },
    ]),
  )
  const report = evaluateChecks(checks)
  assert.deepEqual(visited, comparisonNames)
  assert.equal(report.checks.schema.evaluated, false)
  assert.equal(report.checks.catalogSafety.evaluated, true)
  assert.doesNotMatch(JSON.stringify(report), new RegExp(syntheticPrivate))
})

test('failed catalog and data readers remain independent', () => {
  let dataRead = false
  const first = collectRestoreDiagnostics(
    catalog(),
    data(),
    () => {
      throw new Error(syntheticPrivate)
    },
    () => {
      dataRead = true
      return data()
    },
    archiveDigest,
  )
  assert.equal(dataRead, true)
  assert.equal(first.checks.rowHash.pass, true)
  assert.equal(first.checks.schema.evaluated, false)
  const second = collectRestoreDiagnostics(
    catalog(),
    data(),
    catalog,
    () => {
      throw new Error(syntheticPrivate)
    },
    archiveDigest,
  )
  assert.equal(second.checks.schema.pass, true)
  assert.equal(second.checks.rowCount.evaluated, false)
})

test('reports missing, extra and changed opaque identifiers without raw material', () => {
  const observed = catalog()
  observed.objects.pop()
  observed.objects.push({ key: `relation:${syntheticPrivate}`, fingerprint: catalogDigest })
  observed.objects[5].fingerprint = 'c'.repeat(64)
  const result = compare(observed)
  const item = result.checks.schema
  assert.deepEqual(
    { missing: item.missing, extra: item.extra, changed: item.changed },
    { missing: 1, extra: 1, changed: 1 },
  )
  assert.equal(Object.values(item.fingerprints).flat().length, 3)
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${syntheticPrivate}|${catalogDigest}|pathways\\.`),
  )
})

test('fingerprint lists are deterministically sorted and bounded with explicit truncation', () => {
  const observed = catalog()
  observed.objects.splice(5, identifierFingerprintLimit + 6)
  const item = compare(observed).checks.schema
  assert.equal(item.missing, identifierFingerprintLimit + 6)
  assert.equal(item.fingerprints.missing.length, identifierFingerprintLimit)
  assert.equal(item.truncated.missing, true)
  assert.deepEqual(item.fingerprints.missing, [...item.fingerprints.missing].sort())
})

test('sanitizer rejects malformed, duplicate, unsorted, inconsistent or excessive output', () => {
  const mutations = [
    (r) => {
      r.checks.schema.fingerprints.missing = [syntheticPrivate]
      r.checks.schema.missing = 1
    },
    (r) => {
      const token = createIdentifierFingerprinter(archiveDigest)('catalog', 'one')
      r.checks.schema.fingerprints.missing = [token, token]
      r.checks.schema.missing = 2
    },
    (r) => {
      const f = createIdentifierFingerprinter(archiveDigest)
      r.checks.schema.fingerprints.missing = [f('catalog', 'two'), f('catalog', 'one')]
      r.checks.schema.missing = 2
    },
    (r) => {
      r.checks.schema.missing = differenceLimit + 1
    },
    (r) => {
      r.checks.schema.missing = identifierFingerprintLimit + 1
      r.checks.schema.truncated.missing = false
    },
    (r) => {
      r.checks.schema.pass = true
      r.checks.schema.changed = 1
      r.checks.schema.fingerprints.changed = [
        createIdentifierFingerprinter(archiveDigest)('catalog', 'changed'),
      ]
    },
  ]
  for (const mutate of mutations) {
    const report = compare()
    mutate(report)
    assert.throws(() => sanitizeDiagnostics(report), /DIAGNOSTIC_OUTPUT/)
  }
  const polluted = compare()
  polluted.sql = syntheticPrivate
  polluted.checks.schema.raw = syntheticPrivate
  assert.doesNotMatch(JSON.stringify(sanitizeDiagnostics(polluted)), new RegExp(syntheticPrivate))
})

test('malformed source inputs cannot pass or suppress independent checks', () => {
  for (const mutate of [
    (c) => {
      c.objects = null
    },
    (c) => {
      c.objects.push(c.objects[0])
    },
    (c) => {
      c.objects[0].fingerprint = syntheticPrivate
    },
    (c) => {
      c.objects = Array(differenceLimit).fill(c.objects[0])
    },
    (c) => {
      c.ledger = []
    },
  ]) {
    const observed = catalog()
    mutate(observed)
    const report = compare(observed)
    assert.equal(report.allPassed, false)
    assert.equal(report.checks.rowCount.pass, true)
  }
})

const priorV1Diagnostics = {
  version: 1,
  allPassed: false,
  checks: Object.fromEntries(
    Object.entries({
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
    }).map(([name, [evaluated, pass, missing, extra, changed]]) => [
      name,
      { evaluated, pass, missing, extra, changed },
    ]),
  ),
}

function fixture(t) {
  const parent = path.join(root, '.tmp')
  fs.mkdirSync(parent, { recursive: true })
  const directory = fs.mkdtempSync(path.join(parent, 'pathways-diagnostic-evidence-'))
  t.after(() => {
    assert.equal(
      path.dirname(fs.realpathSync(directory)).toLowerCase(),
      fs.realpathSync(parent).toLowerCase(),
    )
    fs.rmSync(directory, { recursive: true, force: false })
  })
  const metadata = {
    originalPrivateField: syntheticPrivate,
    localRetry: {
      status: 'FAILED',
      stage: 'local-verification',
      failureCode: 'RESTORE_COMPARISON',
      startedUtc: '2026-09-09T06:15:55.585Z',
      completedUtc: null,
      port: 55453,
      targetLoopbackOnly: true,
      hostedConnections: 0,
      hostedWrites: 0,
      localRestoreStopped: true,
      localRestoreRemoved: true,
    },
  }
  const originalBytes = Buffer.from(JSON.stringify(metadata, null, 2))
  const evidencePath = path.join(directory, 'evidence.json')
  fs.writeFileSync(evidencePath, originalBytes)

  const claimBytes = Buffer.from(JSON.stringify({ version: 1, consumed: true }))
  const priorClaimPath = path.join(directory, priorDiagnosticClaimName)
  fs.writeFileSync(priorClaimPath, claimBytes)
  const checkpoints = Array.from({ length: 12 }, (_, index) => ({
    status: index === 11 ? 'FAILED' : 'RUNNING',
    stage: 'local-verification',
    failureCode: index === 11 ? 'RESTORE_COMPARISON' : null,
    utc: `2026-09-09T07:48:${String(31 + index).padStart(2, '0')}.000Z`,
    localRestoreStopped: index === 11,
    localRestoreRemoved: index === 11,
    diagnostics: index >= 10 ? priorV1Diagnostics : null,
  }))
  const priorJournal = {
    version: 1,
    status: 'FAILED',
    stage: 'local-verification',
    failureCode: 'RESTORE_COMPARISON',
    startedUtc: '2026-09-09T07:48:35.989Z',
    completedUtc: '2026-09-09T07:48:42.414Z',
    targetLoopbackOnly: true,
    hostedConnections: 0,
    hostedWrites: 0,
    localRestoreStopped: true,
    localRestoreRemoved: true,
    diagnostics: priorV1Diagnostics,
    checkpoints,
  }
  const journalBytes = Buffer.from(JSON.stringify(priorJournal, null, 2))
  const priorJournalPath = path.join(directory, priorDiagnosticJournalName)
  fs.writeFileSync(priorJournalPath, journalBytes)
  return {
    directory,
    evidencePath,
    originalBytes,
    metadata,
    priorClaimPath,
    priorJournalPath,
    priorDigests: {
      claimSha256: sha256(claimBytes),
      journalSha256: sha256(journalBytes),
    },
  }
}

const checkpoint = (diagnostics = compare()) => ({
  status: 'RUNNING',
  stage: 'local-verification',
  failureCode: null,
  localRestoreStopped: false,
  localRestoreRemoved: false,
  diagnostics,
})

test('V2 binds exact V1 claim/journal and never changes their bytes', (t) => {
  const f = fixture(t)
  assert.doesNotThrow(() => assertPriorDiagnosticEvidence(f.directory, f.priorDigests))
  const claimBefore = fs.readFileSync(f.priorClaimPath)
  const journalBefore = fs.readFileSync(f.priorJournalPath)
  claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests)
  assert.equal(fs.readFileSync(f.priorClaimPath).equals(claimBefore), true)
  assert.equal(fs.readFileSync(f.priorJournalPath).equals(journalBefore), true)
  assert.equal(fs.existsSync(path.join(f.directory, diagnosticClaimName)), true)
})

test('V1 byte drift or semantic drift is rejected before a V2 claim', (t) => {
  const f = fixture(t)
  fs.appendFileSync(f.priorJournalPath, ' ')
  assert.throws(
    () => claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests),
    /V1_EVIDENCE_CHANGED/,
  )
  assert.equal(fs.existsSync(path.join(f.directory, diagnosticClaimName)), false)

  const changed = JSON.parse(fs.readFileSync(f.priorJournalPath, 'utf8'))
  changed.diagnostics.checks.rowHash.changed = 5
  const changedBytes = Buffer.from(JSON.stringify(changed, null, 2))
  fs.writeFileSync(f.priorJournalPath, changedBytes)
  const changedDigests = { ...f.priorDigests, journalSha256: sha256(changedBytes) }
  assert.throws(
    () => claimDiagnosticAttempt(f.evidencePath, f.originalBytes, changedDigests),
    /V1_EVIDENCE_STATE/,
  )
  assert.equal(fs.existsSync(path.join(f.directory, diagnosticClaimName)), false)
})

test('V2 journal persists only sanitized tokens before failure and cleanup', (t) => {
  const f = fixture(t)
  const journal = claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests)
  const observed = catalog()
  observed.objects.splice(1, 1)
  const diagnostics = compare(observed)
  journal.record(checkpoint(diagnostics))
  journal.record({
    ...checkpoint(),
    diagnostics: null,
    status: 'FAILED',
    failureCode: 'RESTORE_COMPARISON',
    localRestoreStopped: true,
    localRestoreRemoved: true,
  })
  const saved = JSON.parse(fs.readFileSync(path.join(f.directory, diagnosticJournalName), 'utf8'))
  assert.equal(saved.version, 2)
  assert.deepEqual(saved.diagnostics, diagnostics)
  assert.equal(saved.localRestoreRemoved, true)
  assert.doesNotMatch(
    JSON.stringify(saved),
    new RegExp(`${syntheticPrivate}|${catalogDigest}|pathways\\.`),
  )
  assert.equal(fs.readFileSync(f.evidencePath).equals(f.originalBytes), true)
})

test('exclusive V2 claim rejects concurrent or repeated use', (t) => {
  const f = fixture(t)
  claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests)
  assert.throws(
    () => claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests),
    /LOCAL_RETRY_CONSUMED/,
  )
  const claim = JSON.parse(fs.readFileSync(path.join(f.directory, diagnosticClaimName), 'utf8'))
  assert.deepEqual(claim, { version: 2, consumed: true, priorVersion: 1 })
})

test('pre-existing V2 journal rejects the attempt before claim creation', (t) => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.directory, diagnosticJournalName), '{}')
  assert.throws(
    () => claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests),
    /LOCAL_RETRY_CONSUMED/,
  )
  assert.equal(fs.existsSync(path.join(f.directory, diagnosticClaimName)), false)
})

test('changed original evidence is rejected without changing V1 or creating V2', (t) => {
  const f = fixture(t)
  const changed = Buffer.from(JSON.stringify({ ...f.metadata, localRetry: { status: 'PASS' } }))
  fs.writeFileSync(f.evidencePath, changed)
  const priorClaimBefore = fs.readFileSync(f.priorClaimPath)
  const priorJournalBefore = fs.readFileSync(f.priorJournalPath)
  assert.throws(
    () => claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests),
    /EVIDENCE_CHANGED/,
  )
  assert.equal(fs.existsSync(path.join(f.directory, diagnosticClaimName)), false)
  assert.equal(fs.readFileSync(f.priorClaimPath).equals(priorClaimBefore), true)
  assert.equal(fs.readFileSync(f.priorJournalPath).equals(priorJournalBefore), true)
})

test('PASS needs complete diagnostics and cleanup; terminal evidence cannot be rewritten', (t) => {
  const f = fixture(t)
  const journal = claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests)
  const passing = {
    ...checkpoint(),
    status: 'PASS',
    stage: 'complete',
    localRestoreStopped: true,
    localRestoreRemoved: true,
  }
  for (const invalid of [
    { ...passing, diagnostics: null },
    { ...passing, localRestoreStopped: false },
    { ...passing, localRestoreRemoved: false },
    { ...passing, stage: 'local-verification' },
    { ...passing, failureCode: 'RESTORE_COMPARISON' },
    { ...passing, diagnostics: compare(undefined, []) },
  ])
    assert.throws(() => journal.record(invalid), /EVIDENCE_OUTPUT/)
  journal.record(passing)
  assert.throws(() => journal.record(checkpoint()), /EVIDENCE_FINALIZED/)
})

test('failed atomic V2 journal update retains the last checkpoint and both prior files', (t) => {
  const f = fixture(t)
  const journal = claimDiagnosticAttempt(f.evidencePath, f.originalBytes, f.priorDigests)
  journal.record(checkpoint())
  const journalPath = path.join(f.directory, diagnosticJournalName)
  const before = fs.readFileSync(journalPath)
  const priorClaimBefore = fs.readFileSync(f.priorClaimPath)
  const priorJournalBefore = fs.readFileSync(f.priorJournalPath)
  const mocked = t.mock.method(fs, 'renameSync', () => {
    throw new Error(syntheticPrivate)
  })
  assert.throws(
    () => journal.record({ ...checkpoint(), status: 'FAILED' }),
    /EVIDENCE_UPDATE_FAILED/,
  )
  mocked.mock.restore()
  assert.equal(fs.readFileSync(journalPath).equals(before), true)
  assert.equal(fs.readFileSync(f.priorClaimPath).equals(priorClaimBefore), true)
  assert.equal(fs.readFileSync(f.priorJournalPath).equals(priorJournalBefore), true)
  assert.equal(
    fs.readdirSync(f.directory).some((file) => file.endsWith('.tmp')),
    false,
  )
})

test('cleanup rejects unrelated paths, preserves uncertain state and removes only its own directory', (t) => {
  const f = fixture(t)
  const unrelated = cleanupLocalRetry(f.directory, true, () => {
    throw new Error('must not call')
  })
  assert.equal(unrelated.failureCode, 'LOCAL_CLEANUP_FAILED')
  const directory = fs.mkdtempSync(path.join(root, '.tmp/pathways-local-restore-retry-'))
  const failure = cleanupLocalRetry(directory, true, () => {
    throw new Error(syntheticPrivate)
  })
  assert.equal(failure.failureCode, 'LOCAL_STOP_FAILED')
  assert.equal(fs.existsSync(directory), true)
  assert.deepEqual(
    cleanupLocalRetry(directory, true, () => {}),
    {
      stopped: true,
      removed: true,
      failureCode: null,
    },
  )
  assert.equal(fs.existsSync(directory), false)
})
