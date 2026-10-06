import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertSameTables,
  compareCounts,
  countsOf,
  parseDump,
  parseWipeTables,
  splitWipe,
} from './defense-snapshot-parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const realWipe = readFileSync(
  path.join(root, 'infra/supabase/phase6/hosted-defense-demo-wipe.sql'),
  'utf8',
)

const dump = [
  '--',
  '-- PostgreSQL database dump',
  '--',
  '',
  '\\restrict abc123',
  '',
  'SET statement_timeout = 0;',
  "SET client_encoding = 'UTF8';",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  'SET row_security = off;',
  '',
  'COPY pathways.projects (id, code, start_date) FROM stdin;',
  'a1\tSSG\t2026-03-01',
  'a2\tEHK\t2026-01-15',
  '\\.',
  '',
  'COPY pathways_rules_internal.jobs (id, pending_since) FROM stdin;',
  '\\.',
  '',
  '\\unrestrict abc123',
  '',
].join('\n')

test('parseWipeTables reads the real wipe list in file order', () => {
  const tables = parseWipeTables(realWipe)
  assert.equal(tables.length, 77)
  assert.equal(tables[0], 'pathways.activity_extension_requests')
  assert.equal(tables.at(-1), 'pathways_rules_internal.work_items')
  assert.ok(!tables.includes('pathways.system_users'))
  assert.equal(new Set(tables).size, tables.length)
})

test('parseWipeTables rejects a file without exactly one TRUNCATE', () => {
  assert.throws(() => parseWipeTables('BEGIN; COMMIT;'), /exactly one TRUNCATE/)
  assert.throws(
    () => parseWipeTables('TRUNCATE TABLE a.b; TRUNCATE TABLE c.d;'),
    /exactly one TRUNCATE/,
  )
})

test('parseWipeTables rejects a table name that needs quoting', () => {
  assert.throws(
    () => parseWipeTables('TRUNCATE TABLE pathways."Odd" RESTART IDENTITY;'),
    /Unexpected table name/,
  )
})

test('splitWipe cuts the real wipe before the membership revoke', () => {
  const { head, tail } = splitWipe(realWipe)
  assert.match(head, /^BEGIN;$/m)
  assert.match(head, /TRUNCATE TABLE/)
  assert.doesNotMatch(head, /^COMMIT;$/m)
  assert.match(tail, /REVOKE/)
  assert.match(tail, /COMMIT;\s*$/)
  assert.equal(head + tail, realWipe)
})

test('splitWipe refuses a wipe file without the revoke marker', () => {
  assert.throws(() => splitWipe('BEGIN;\nTRUNCATE TABLE a.b;\nCOMMIT;\n'), /layout changed/)
})

test('parseDump keeps COPY blocks and drops the session preamble', () => {
  const { blocks } = parseDump(dump)
  assert.deepEqual(
    blocks.map((b) => [b.schema, b.table, b.columns, b.rows.length]),
    [
      ['pathways', 'projects', 'id, code, start_date', 2],
      ['pathways_rules_internal', 'jobs', 'id, pending_since', 0],
    ],
  )
  assert.equal(blocks[0].rows[1], 'a2\tEHK\t2026-01-15')
})

test('parseDump rejects statements other than COPY and session settings', () => {
  assert.throws(
    () => parseDump(`${dump}ALTER TABLE pathways.projects DISABLE TRIGGER ALL;\n`),
    /Unexpected statement/,
  )
  assert.throws(
    () => parseDump("SELECT pg_catalog.setval('s', 1, true);\n"),
    /Unexpected statement/,
  )
})

test('parseDump rejects a truncated COPY block and CRLF input', () => {
  assert.throws(
    () => parseDump('COPY pathways.projects (id) FROM stdin;\na1\n'),
    /ends inside COPY/,
  )
  assert.throws(() => parseDump(dump.replaceAll('\n', '\r\n')), /CRLF/)
})

test('countsOf and compareCounts report every mismatch', () => {
  const counts = countsOf(parseDump(dump).blocks)
  assert.deepEqual(counts, [
    { name: 'pathways.projects', rows: 2 },
    { name: 'pathways_rules_internal.jobs', rows: 0 },
  ])
  assert.deepEqual(compareCounts(counts, counts), [])
  assert.deepEqual(
    compareCounts(
      [
        { name: 'pathways.projects', rows: 3 },
        { name: 'pathways.reports', rows: 1 },
      ],
      counts,
    ),
    [
      'pathways.projects: expected 3, found 2',
      'pathways.reports: expected 1, found none',
      'pathways_rules_internal.jobs: not in manifest',
    ],
  )
})

test('assertSameTables requires the dump to cover exactly the wipe list', () => {
  const { blocks } = parseDump(dump)
  assert.doesNotThrow(() =>
    assertSameTables(['pathways_rules_internal.jobs', 'pathways.projects'], blocks),
  )
  assert.throws(() => assertSameTables(['pathways.projects'], blocks), /differ from the wipe list/)
})
