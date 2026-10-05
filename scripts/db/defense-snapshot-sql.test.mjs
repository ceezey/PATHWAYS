import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRestoreSql,
  dateColumnsSql,
  dollarQuote,
  identityCheckSql,
  migrationCheckSql,
  mirrorReadSql,
  mirrorWriteSql,
  quoteIdent,
  rowCountCheckSql,
  shiftSql,
  stagedLoadSql,
  storageObjectsSql,
} from './defense-snapshot-sql.mjs'

const STOP = String.raw`\set ON_ERROR_STOP on
`
const ORG = '11111111-1111-4111-8111-111111111111'
const U1 = '22222222-2222-4222-8222-222222222222'
const A1 = '33333333-3333-4333-8333-333333333333'
const users = [
  {
    id: U1,
    auth_user_id: A1,
    organization_id: ORG,
    email: 'pm@pathways.example',
    role_code: 'PROJECT_MANAGER',
  },
]
const blocks = [
  {
    schema: 'pathways',
    table: 'projects',
    columns: 'id, code, start_date, created_at',
    rows: ['a1\tSSG\t2026-03-01\t2026-10-06 01:00:00+00'],
  },
  { schema: 'pathways_rules_internal', table: 'jobs', columns: 'id', rows: [] },
]
const dateColumns = {
  'pathways.projects': [
    { name: 'start_date', type: 'date' },
    { name: 'created_at', type: 'timestamp' },
  ],
}
const tables = [
  { name: 'pathways.projects', rows: 1 },
  { name: 'pathways_rules_internal.jobs', rows: 0 },
]
const wipe = [
  'BEGIN;',
  'TRUNCATE TABLE pathways.projects, pathways_rules_internal.jobs RESTART IDENTITY;',
  '-- Drop exactly the temporary memberships added above.',
  "DO $$ BEGIN EXECUTE 'REVOKE owner_role FROM postgres'; END $$;",
  'COMMIT;',
  '',
].join('\n')

test('quoteIdent and dollarQuote escape safely', () => {
  assert.equal(quoteIdent('a"b'), '"a""b"')
  assert.equal(dollarQuote('{"a":1}'), '$snapshot_json${"a":1}$snapshot_json$')
  assert.throws(() => dollarQuote('x $snapshot_json$ y'), /quote tag/)
})

test('mirrorReadSql drops contact number, last sign-in and role id', () => {
  assert.match(mirrorReadSql(), /- 'contact_number' - 'last_login_at' - 'role_id'/)
  assert.match(mirrorReadSql(), /'role_code', r\.code/)
})

test('mirrorWriteSql deletes children first and inserts parents first', () => {
  const sql = mirrorWriteSql({ organization: { id: ORG }, users })
  const at = (text) => sql.indexOf(text)
  assert.ok(sql.startsWith(STOP))
  assert.match(sql, /inet_server_addr\(\) IS NOT NULL THEN RAISE/)
  assert.match(sql, /\nBEGIN;\n/)
  assert.ok(at('DELETE FROM pathways.user_step_up_pins') < at('DELETE FROM pathways.system_users'))
  assert.ok(at('DELETE FROM pathways.system_users') < at('DELETE FROM pathways.organizations'))
  assert.ok(at('DELETE FROM pathways.organizations') < at('DELETE FROM auth.users'))
  assert.ok(at('INSERT INTO pathways.organizations') < at('INSERT INTO auth.users'))
  assert.ok(at('INSERT INTO auth.users') < at('INSERT INTO pathways.system_users'))
  assert.match(sql, /JOIN pathways\.roles r ON r\.code = u->>'role_code'/)
  assert.match(sql, /<> 1 THEN/)
  assert.match(sql, /COMMIT;\nSELECT count\(\*\) FROM pathways\.system_users;$/)
})

test('dateColumnsSql reads non-generated date columns of listed tables only', () => {
  const sql = dateColumnsSql(['pathways.projects'])
  assert.match(sql, /ARRAY\['pathways\.projects'\]::text\[\]/)
  assert.match(sql, /attgenerated = ''/)
  assert.throws(() => dateColumnsSql(["pathways.x'"]), /Unexpected table name/)
})

test('storageObjectsSql lists the organization prefix and rejects non-UUIDs', () => {
  assert.match(storageObjectsSql(ORG), new RegExp(`LIKE 'organizations/${ORG}/%'`))
  assert.throws(() => storageObjectsSql("x' OR true --"), /UUID/)
})

test('migrationCheckSql uses IS DISTINCT FROM and rejects odd names', () => {
  assert.match(
    migrationCheckSql('0063_rules_scope_memo'),
    /IS DISTINCT FROM '0063_rules_scope_memo'/,
  )
  assert.throws(() => migrationCheckSql("0063'; DROP TABLE x; --"), /migration name/)
  assert.throws(() => migrationCheckSql(undefined), /migration name/)
})

test('identityCheckSql compares ids, auth links and organization without emails', () => {
  const sql = identityCheckSql(users)
  assert.ok(sql.includes(U1) && sql.includes(A1) && sql.includes(ORG))
  assert.match(sql, /IS NOT DISTINCT FROM e\.auth_user_id/)
  assert.match(sql, /jsonb_array_length\(expected\)/)
  assert.ok(!sql.includes('@'))
})

test('shiftSql adds whole days to dates and day intervals to timestamps', () => {
  assert.equal(
    shiftSql('pg_temp.snapshot_0', dateColumns['pathways.projects'], 3),
    'UPDATE pg_temp.snapshot_0 SET "start_date" = "start_date" + 3, "created_at" = "created_at" + make_interval(days => 3);',
  )
})

test('shiftSql is empty at delta 0 or without columns and rejects bad deltas', () => {
  assert.equal(shiftSql('pg_temp.s', dateColumns['pathways.projects'], 0), '')
  assert.equal(shiftSql('pg_temp.s', [], 3), '')
  assert.throws(() => shiftSql('pg_temp.s', [], -1), /non-negative integer/)
  assert.throws(() => shiftSql('pg_temp.s', [], 1.5), /non-negative integer/)
})

test('stagedLoadSql stages, shifts and inserts without updating real tables', () => {
  const sql = stagedLoadSql(blocks, dateColumns, 3)
  assert.match(
    sql,
    /^CREATE TEMP TABLE snapshot_0 \(LIKE pathways\.projects\) ON COMMIT DROP;\nCOPY pg_temp\.snapshot_0 \(id, code, start_date, created_at\) FROM stdin;\na1\tSSG\t2026-03-01\t2026-10-06 01:00:00\+00\n\\\.\nUPDATE pg_temp\.snapshot_0 SET /,
  )
  assert.match(
    sql,
    /INSERT INTO pathways\.projects \(id, code, start_date, created_at\) SELECT id, code, start_date, created_at FROM pg_temp\.snapshot_0;/,
  )
  assert.doesNotMatch(sql, /UPDATE pathways/)
  assert.doesNotMatch(sql, /UPDATE pg_temp\.snapshot_1/)
})

test('stagedLoadSql keeps empty data rows and skips the shift at delta 0', () => {
  const sql = stagedLoadSql(
    [{ schema: 'pathways', table: 'notes', columns: 'note', rows: ['', 'x'] }],
    {},
    0,
  )
  assert.equal(
    sql,
    'CREATE TEMP TABLE snapshot_0 (LIKE pathways.notes) ON COMMIT DROP;\nCOPY pg_temp.snapshot_0 (note) FROM stdin;\n\nx\n\\.\nINSERT INTO pathways.notes (note) SELECT note FROM pg_temp.snapshot_0;',
  )
})

test('rowCountCheckSql lists every table and rejects bad manifest entries', () => {
  assert.match(
    rowCountCheckSql(tables),
    /\('pathways', 'projects', 1\), \('pathways_rules_internal', 'jobs', 0\)/,
  )
  assert.throws(
    () => rowCountCheckSql([{ name: "pathways.x'y", rows: 1 }]),
    /Invalid manifest entry/,
  )
  assert.throws(
    () => rowCountCheckSql([{ name: 'pathways.x', rows: -1 }]),
    /Invalid manifest entry/,
  )
  assert.throws(() => rowCountCheckSql([]), /no tables/)
})

test('buildRestoreSql keeps one transaction in the safe order', () => {
  const sql = buildRestoreSql({
    wipeSql: wipe,
    migration: '0063_rules_scope_memo',
    users,
    blocks,
    dateColumns,
    tables,
    delta: 2,
  })
  const order = [
    'BEGIN;',
    'TRUNCATE TABLE',
    '$migration$',
    '$identity$',
    'session_replication_role = replica',
    'COPY pg_temp.snapshot_0',
    'UPDATE pg_temp.snapshot_0',
    'INSERT INTO pathways.projects',
    '$counts$',
    'session_replication_role = origin',
    'REVOKE',
    'COMMIT;',
  ]
  const positions = order.map((text) => sql.indexOf(text))
  assert.ok(
    positions.every((position) => position >= 0),
    `missing: ${order.filter((_, i) => positions[i] < 0)}`,
  )
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
  )
  assert.equal(sql.match(/^BEGIN;$/gm).length, 1)
  assert.equal(sql.match(/^COMMIT;$/gm).length, 1)
  assert.doesNotMatch(sql, /DISABLE (ROW LEVEL SECURITY|TRIGGER)/i)
})

test('buildRestoreSql starts with ON_ERROR_STOP and refuses kept or unlisted tables', () => {
  const args = { wipeSql: wipe, migration: '0063_x', users, blocks, dateColumns, tables, delta: 0 }
  assert.ok(buildRestoreSql(args).startsWith(STOP))
  const kept = [
    ...blocks,
    { schema: 'pathways', table: 'user_step_up_pins', columns: 'id', rows: [] },
  ]
  assert.throws(() => buildRestoreSql({ ...args, blocks: kept }), /Dumped tables differ/)
})

test('stagedLoadSql rejects an injected column list', () => {
  const bad = [
    { schema: 'pathways', table: 'notes', columns: 'a) FROM stdin; DROP TABLE x; --', rows: [] },
  ]
  assert.throws(() => stagedLoadSql(bad, {}, 0), /Invalid column list/)
})
