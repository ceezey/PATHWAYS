import { createHmac } from 'node:crypto'
import { backupRestoreDatabase, backupTableCount } from './backup-restore-config.mjs'
import { assertLedger, requireCheck } from './config.mjs'
import { assertSnapshot } from './runner.mjs'

export const diagnosticVersion = 2
export const comparisonNames = Object.freeze([
  'schema',
  'rowCount',
  'rowHash',
  'migrationLedger',
  'ownership',
  'acl',
  'rls',
  'policies',
  'triggers',
  'requiredExtensions',
  'catalogSafety',
])
export const differenceLimit = 10_000
export const identifierFingerprintLimit = 64
const differenceKinds = Object.freeze(['missing', 'extra', 'changed'])
const identifierScopes = new Set(['catalog', 'data', 'ledger', 'extension'])
const owner = (key) =>
  key.endsWith(':properties') ||
  key.startsWith('function:') ||
  key.startsWith('enum:') ||
  key.startsWith('schema:')
const acl = (key) =>
  key.includes('-acl:') ||
  key.startsWith('default-acl:') ||
  key.startsWith('schema:') ||
  key.startsWith('enum:')

export function createIdentifierFingerprinter(archiveSha256) {
  requireCheck(/^[a-f0-9]{64}$/.test(archiveSha256), 'DIAGNOSTIC_KEY')
  const privateKey = createHmac('sha256', Buffer.from(archiveSha256, 'hex'))
    .update('PATHWAYS\0LOCAL_RESTORE_DIAGNOSTIC\0V2\0KEY')
    .digest()
  return (scope, identifier) => {
    requireCheck(
      identifierScopes.has(scope) &&
        typeof identifier === 'string' &&
        identifier.length > 0 &&
        identifier.length < 1000,
      'DIAGNOSTIC_IDENTIFIER',
    )
    return createHmac('sha256', privateKey)
      .update('PATHWAYS\0LOCAL_RESTORE_DIAGNOSTIC\0V2\0IDENTIFIER\0')
      .update(scope)
      .update('\0')
      .update(identifier)
      .digest('hex')
  }
}

function emptyFingerprintGroups() {
  return {
    fingerprints: { missing: [], extra: [], changed: [] },
    truncated: { missing: false, extra: false, changed: false },
  }
}

function outcomeFromKeys(fingerprinter, scope, keys = {}) {
  const groups = emptyFingerprintGroups()
  const counts = {}
  for (const kind of differenceKinds) {
    const identifiers = keys[kind] ?? []
    requireCheck(
      Array.isArray(identifiers) && identifiers.length <= differenceLimit,
      'DIAGNOSTIC_INPUT',
    )
    counts[kind] = identifiers.length
    const fingerprints = identifiers.map((key) => fingerprinter(scope, key)).sort()
    groups.fingerprints[kind] = fingerprints.slice(0, identifierFingerprintLimit)
    groups.truncated[kind] = fingerprints.length > identifierFingerprintLimit
  }
  return {
    evaluated: true,
    pass: Object.values(counts).every((count) => count === 0),
    ...counts,
    ...groups,
  }
}

function unevaluatedOutcome() {
  return {
    evaluated: false,
    pass: false,
    missing: 0,
    extra: 0,
    changed: 0,
    ...emptyFingerprintGroups(),
  }
}

function catalogRows(rows, select) {
  requireCheck(
    Array.isArray(rows) && rows.length > 0 && rows.length < differenceLimit,
    'DIAGNOSTIC_INPUT',
  )
  const map = new Map()
  const seen = new Set()
  for (const row of rows) {
    requireCheck(
      typeof row?.key === 'string' &&
        row.key.length < 1000 &&
        /^[a-f0-9]{64}$/.test(row.fingerprint) &&
        !seen.has(row.key),
      'DIAGNOSTIC_INPUT',
    )
    seen.add(row.key)
    if (select(row.key)) map.set(row.key, row.fingerprint)
  }
  return map
}

function dataRows(rows, field) {
  requireCheck(Array.isArray(rows) && rows.length === backupTableCount, 'DIAGNOSTIC_INPUT')
  const map = new Map()
  for (const row of rows) {
    requireCheck(
      typeof row?.key === 'string' &&
        /^(public|pathways)\.[A-Za-z0-9_]+$/.test(row.key) &&
        !map.has(row.key),
      'DIAGNOSTIC_INPUT',
    )
    if (field === 'rows') {
      requireCheck(
        (typeof row.rows === 'string' && /^\d+$/.test(row.rows)) || typeof row.rows === 'number',
        'DIAGNOSTIC_INPUT',
      )
      requireCheck(
        Number.isSafeInteger(Number(row.rows)) && Number(row.rows) >= 0,
        'DIAGNOSTIC_INPUT',
      )
      map.set(row.key, Number(row.rows))
    } else {
      requireCheck(/^[a-f0-9]{64}$/.test(row.sha256), 'DIAGNOSTIC_INPUT')
      map.set(row.key, row.sha256)
    }
  }
  return map
}

function compareMaps(expected, actual, fingerprinter, scope) {
  const keys = { missing: [], extra: [], changed: [] }
  for (const [key, value] of expected) {
    if (!actual.has(key)) keys.missing.push(key)
    else if (actual.get(key) !== value) keys.changed.push(key)
  }
  for (const key of actual.keys()) if (!expected.has(key)) keys.extra.push(key)
  return outcomeFromKeys(fingerprinter, scope, keys)
}

// Every callback runs, including after a FAIL or a thrown, potentially sensitive error.
export function evaluateChecks(checks) {
  const results = {}
  for (const name of comparisonNames) {
    try {
      results[name] = checks[name]()
    } catch {
      results[name] = unevaluatedOutcome()
    }
  }
  return sanitizeDiagnostics({ version: diagnosticVersion, checks: results })
}

export function compareRestoreDiagnostics(
  expectedCatalog,
  actualCatalog,
  expectedData,
  actualData,
  archiveSha256,
) {
  const fingerprinter = createIdentifierFingerprinter(archiveSha256)
  const catalog = (select) => () =>
    compareMaps(
      catalogRows(expectedCatalog?.objects, select),
      catalogRows(actualCatalog?.objects, select),
      fingerprinter,
      'catalog',
    )
  return evaluateChecks({
    schema: catalog(() => true),
    rowCount: () =>
      compareMaps(
        dataRows(expectedData, 'rows'),
        dataRows(actualData, 'rows'),
        fingerprinter,
        'data',
      ),
    rowHash: () =>
      compareMaps(
        dataRows(expectedData, 'sha256'),
        dataRows(actualData, 'sha256'),
        fingerprinter,
        'data',
      ),
    migrationLedger: () => {
      assertLedger(expectedCatalog?.ledger, 1)
      assertLedger(actualCatalog?.ledger, 1)
      const changed =
        JSON.stringify(expectedCatalog.ledger) === JSON.stringify(actualCatalog.ledger)
          ? []
          : [expectedCatalog.ledger[0].name]
      return outcomeFromKeys(fingerprinter, 'ledger', { changed })
    },
    ownership: catalog(owner),
    acl: catalog(acl),
    rls: catalog((key) => key.startsWith('rls:')),
    policies: catalog((key) => key.startsWith('policy:')),
    triggers: catalog((key) => key.startsWith('trigger:')),
    requiredExtensions: () => {
      requireCheck(
        expectedCatalog?.pgcryptoPresent === true &&
          typeof actualCatalog?.pgcryptoPresent === 'boolean',
        'DIAGNOSTIC_INPUT',
      )
      return outcomeFromKeys(fingerprinter, 'extension', {
        missing:
          expectedCatalog.pgcryptoPresent && !actualCatalog.pgcryptoPresent ? ['pgcrypto'] : [],
      })
    },
    catalogSafety: () => {
      assertSnapshot(actualCatalog, 1, backupRestoreDatabase)
      requireCheck(actualCatalog.runtimeSafe === true, 'DIAGNOSTIC_INPUT')
      return outcomeFromKeys(fingerprinter, 'catalog')
    },
  })
}

// Read failures must not skip the independent query or its comparisons.
export function collectRestoreDiagnostics(
  expectedCatalog,
  expectedData,
  readCatalog,
  readData,
  archiveSha256,
) {
  let actualCatalog
  let actualData
  try {
    actualCatalog = readCatalog()
  } catch {
    /* never forward raw SQL/provider errors */
  }
  try {
    actualData = readData()
  } catch {
    /* still evaluate every available comparison */
  }
  return compareRestoreDiagnostics(
    expectedCatalog,
    actualCatalog,
    expectedData,
    actualData,
    archiveSha256,
  )
}

export function sanitizeDiagnostics(report) {
  requireCheck(report?.version === diagnosticVersion, 'DIAGNOSTIC_OUTPUT')
  const checks = {}
  for (const name of comparisonNames) {
    const item = report.checks?.[name]
    requireCheck(
      typeof item?.evaluated === 'boolean' &&
        typeof item.pass === 'boolean' &&
        (!item.pass || item.evaluated),
      'DIAGNOSTIC_OUTPUT',
    )
    const counts = {}
    const fingerprints = {}
    const truncated = {}
    for (const kind of differenceKinds) {
      requireCheck(
        Number.isSafeInteger(item[kind]) && item[kind] >= 0 && item[kind] <= differenceLimit,
        'DIAGNOSTIC_OUTPUT',
      )
      counts[kind] = item[kind]
      const values = item.fingerprints?.[kind]
      requireCheck(
        Array.isArray(values) &&
          values.length <= identifierFingerprintLimit &&
          values.every((value) => /^[a-f0-9]{64}$/.test(value)) &&
          new Set(values).size === values.length &&
          JSON.stringify(values) === JSON.stringify([...values].sort()) &&
          typeof item.truncated?.[kind] === 'boolean' &&
          item.truncated[kind] === item[kind] > identifierFingerprintLimit &&
          values.length === Math.min(item[kind], identifierFingerprintLimit),
        'DIAGNOSTIC_OUTPUT',
      )
      fingerprints[kind] = [...values]
      truncated[kind] = item.truncated[kind]
    }
    requireCheck(
      !item.pass || Object.values(counts).every((count) => count === 0),
      'DIAGNOSTIC_OUTPUT',
    )
    requireCheck(
      item.evaluated ||
        (Object.values(counts).every((count) => count === 0) &&
          Object.values(fingerprints).every((values) => values.length === 0)),
      'DIAGNOSTIC_OUTPUT',
    )
    checks[name] = {
      evaluated: item.evaluated,
      pass: item.pass,
      ...counts,
      fingerprints,
      truncated,
    }
  }
  return {
    version: diagnosticVersion,
    allPassed: Object.values(checks).every((item) => item.evaluated && item.pass),
    checks,
  }
}
