# Defense Seed Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long hosted devV2 service reseed with a local service seed that is dumped and restored onto devV2 in one transaction with triggers skipped and dates shifted to the restore day.

**Architecture:** A node-builtins-only CLI `scripts/db/defense-snapshot.mjs` (`mirror`, `dump`, `restore`, `storage`) drives `psql` and `pg_dump` inside the local container `supabase_db_pathways`, so no local Postgres client is needed; hosted URLs reach the container by environment variable, never argv. Pure helpers (wipe parsing, dump parsing, SQL generation, day math, guards, storage copy) live in small `scripts/db/defense-snapshot-*.mjs` modules with `node --test` suites. The restore SQL reuses `hosted-defense-demo-wipe.sql` verbatim up to its revoke block, then loads every table through a temporary staging table where the day shift happens, so no real table is ever updated in place.

**Tech Stack:** Node 22 ESM (`node:child_process`, `node:fs`, global `fetch`), `node:test`, PostgreSQL 17 `psql`/`pg_dump` inside Docker, Supabase Storage REST API, Biome.

**Spec:** `docs/superpowers/specs/2026-10-06-defense-seed-snapshot-design.md`

## Decisions resolved against the code (read before any task)

- **Restore role is `postgres`, not `DIRECT_URL`.** `DIRECT_URL` is `prisma` (`assertSeedTarget`), which is not superuser and not the supautils privileged role, so it cannot `SET session_replication_role` (local check: `supautils.privileged_role_allowed_configs` lists `session_replication_role` for `postgres` only). The wipe file also refuses anyone but `postgres`. Restore therefore reads a new env key `HOSTED_ADMIN_URL` (same name and meaning as `scripts/db/hosted-target.mjs`), validated by the existing `assertHostedPgUrl` with role `postgres`. Mirror still reads over `DIRECT_URL` as `prisma` (verified locally: `prisma` reads `system_users`, `organizations`, `roles`; none has FORCE RLS).
- **RLS and privileges:** local `postgres` is `rolbypassrls = t`, `rolsuper = f`. Table owners are `prisma` (58 tables), `rules_store_owner` (28), `report_projection_owner` (1); `postgres` inherits only `prisma`. The wipe head already grants temporary INHERIT membership in every owner `postgres` lacks and revokes it in its tail, so the load runs inside that window: no `SET ROLE`, no `ALTER TABLE`. FORCE RLS does not apply to BYPASSRLS roles.
- **Triggers:** 140 user triggers, none `ENABLE ALWAYS` or `ENABLE REPLICA`, no rewrite rules, so `SET LOCAL session_replication_role = replica` skips all of them and the FK triggers. It is set after the wipe TRUNCATE (the wipe keeps its reviewed behaviour) and reset to `origin` before the revoke.
- **Date shift through staging tables.** Three unique indexes contain date columns (`beneficiary_activity_participations_attendance_key`, `p06_measurements_root_key`, `survey_period_releases_pkey`), so an in-place `UPDATE` can collide row by row; a two-step offset is ruled out by the `period_start <= '2100-12-31'` CHECKs. Each table is copied into `pg_temp.snapshot_N (LIKE real)`, shifted there, then inserted. There are no generated, identity or serial columns today; date columns are read from `pg_attribute` with `attgenerated = ''` so a future generated column is skipped.
- **pg_dump output:** 17.6 emits `\restrict`/`\unrestrict`, `SET ...;` lines and `SELECT pg_catalog.set_config('search_path', '', false);` before `COPY schema.table (cols) FROM stdin;` blocks ending in `\.`. The parser keeps only COPY blocks, drops that preamble and rejects any other statement. `pg_dump` runs as `postgres` locally (verified it can read the rules tables).
- **Seed day** is the Manila day of `min(pathways.audit_logs.occurred_at)` (the wipe empties audit logs, so the first row is the seed start); `dumpedAt` (dump time) bounds every seeded timestamp for the future-timestamp warning.
- **Mirror copies the whole `system_users` row** minus `contact_number`, `last_login_at` and `role_id` (role re-joined locally by code), because `full_name` and `invited_at` are NOT NULL and names render in reports. The organization row is copied whole. Local `auth.users` rows get the devV2 auth ids with empty password and empty token columns (GoTrue scans those as strings); the seed never signs in (`asUser` sets `request.jwt.claim.sub`), so local sign-in for mirrored accounts is simply off until `pnpm db:local:reset`.
- **Mirror order (FKs):** run the wipe file locally, then in one transaction delete `user_step_up_pins` (RESTRICT FK to `system_users`), `system_users`, `organizations`, `auth.users` (cascades identities, sessions, factors), then insert organization, auth users, staff. Only trigger on `system_users` is BEFORE UPDATE, so nothing fires.
- **Storage:** every local object sits under `organizations/<orgId>/` in `pathways-private` and all 75 are referenced by `evidence_media`, `reports` or `data_import_batches` (bucket plus key columns, never storage ids). The manifest lists `storage.objects` under that prefix; copy uses plain `fetch` (supabase-js is an `apps/api` dependency, not resolvable from `scripts/db`). Upload drops media type parameters because the hosted bucket allow list has `text/csv` but not `text/csv; charset=utf-8`.
- **Libpq URLs:** Prisma URLs may carry `pgbouncer`, `connection_limit` or `schema`; psql rejects unknown URI parameters, so only `sslmode` is kept.
- **Docker reachability:** the container resolves the Supabase pooler; the devV2 direct host is IPv6-only, so the runbook asks for session pooler URLs.
- **Migration guard:** the manifest records the latest local migration; the restore aborts if devV2's latest finished migration differs (`IS DISTINCT FROM`, so an unreadable ledger also aborts).
- **`storage` is its own subcommand** and also runs at the end of `restore` (unless `--skip-storage`), so a failed upload is retried without touching the database.
- **Rehearsal shape:** `--verify` always compares against the real Manila today, so a shifted restore cannot pass it. The rehearsal restores with `--today` three days ahead and checks every project date and the audit range moved by exactly 3 days, then restores again at delta 0 and runs `--verify`.

## Global Constraints

- Worktree `C:/PATHWAYS/.worktrees/defense-seed-snapshot` on branch `feature/defense-seed-snapshot` from `dev`; merge into local `dev` only after the final review; push `origin dev` only when the developer says.
- Node >= 22; no new dependencies; `scripts/db/defense-snapshot*.mjs` import node built-ins and sibling `scripts/db/*.mjs` only.
- Tests run with `node --test <files>` (same runner as `scripts/db/defense-demo-wipe.test.mjs`).
- Biome style: single quotes, no semicolons, 2-space indent, width 100, trailing commas; run `pnpm exec biome check scripts/db` before each commit and apply `pnpm exec biome format --write <files>` if it reports formatting only.
- Comments: one line, one sentence, no emojis. Markdown files use kebab-case names. Docs use no em-dashes and keep every `--flag` inside backticks (`pnpm docs:check` voice rule).
- Never `ALTER TABLE ... DISABLE TRIGGER` or `DISABLE ROW LEVEL SECURITY`; triggers are skipped only by `SET LOCAL session_replication_role = replica` inside the restore transaction.
- Kept tables (`organizations`, `roles`, `permissions`, `role_permissions`, `system_users`, `user_step_up_pins`, `signin_lockouts`, rules `source_operation_catalog`, `calendar_configuration`, `sweep_cursor`) are never dumped or truncated; `storage.objects` is never dumped.
- No migrations, no `apps/api` source edits.
- Implementers never run any hosted command, never create, read or print `.tmp/defense-seed.env` or `.tmp/defense-identities.json`; local work uses `--test-local` and an identities fixture.
- Never write a tracked line matching `(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_JWT_SECRET|DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)=<value>` (CI secret grep; `.test.mjs` files are not exempt); tests use object literals.
- Keep each new `.mjs` file under about 200 lines.
- Task 6 resets the shared local Supabase stack and takes about 30 minutes: confirm with the controller before running it.

## Review Focus

- Restore runs earlier in the clock day than the dump was taken (for example dump at 21:00, restore at 08:00 two days later): the shifted last-hour timestamps land after now; the tool must warn before restoring (Task 2 test `restoreWarnings flags timestamps that land after now`).
- Non-zero day delta on tables with unique keys over dates (daily attendance, measurement periods): the restore must not fail with a duplicate key mid-shift; shifting happens only in `pg_temp` staging tables (Task 3 test `stagedLoadSql stages, shifts and inserts without updating real tables`).
- Generated CSV reports stored locally as `text/csv; charset=utf-8`: the hosted bucket must still accept them (Task 4 test `copyObjects downloads with the source key and upserts with the target key` expects `content-type: text/csv`).
- devV2 staff changed after `mirror` (a user invited, removed or relinked): the restore must abort and leave devV2 untouched (Task 3 test `identityCheckSql compares ids, auth links and organization without emails`; Task 6 tampered-identities rollback).
- Local stack at a different migration than devV2, or a Prisma-style URL with `pgbouncer=true`: the restore must abort before COMMIT, and psql must accept the URL (Task 3 test `migrationCheckSql uses IS DISTINCT FROM and rejects odd names`; Task 2 test `libpqUrl keeps only sslmode`).

## File Structure

| File | Responsibility |
|---|---|
| `scripts/db/defense-snapshot-parse.mjs` | Pure parsers: wipe table list, wipe split point, pg_dump COPY blocks, count comparison |
| `scripts/db/defense-snapshot-dates.mjs` | Manila day, day delta, restore warnings |
| `scripts/db/defense-snapshot-target.mjs` | `HOSTED_ADMIN_URL` guard, identities file shape, libpq URL cleanup |
| `scripts/db/defense-snapshot-sql.mjs` | Pure SQL builders: mirror read/write, dump queries, restore transaction |
| `scripts/db/defense-snapshot-storage.mjs` | Storage REST copy with injected `fetch` |
| `scripts/db/defense-snapshot-io.mjs` | Side effects: docker `psql`/`pg_dump`, `.tmp` files |
| `scripts/db/defense-snapshot.mjs` | CLI: `mirror`, `dump`, `restore`, `storage` |
| `scripts/db/defense-snapshot-*.test.mjs` | One `node:test` suite per pure module plus a CLI argument suite |
| `scripts/db/hosted-seed-target.mjs` | Export `assertHostedPgUrl` (one keyword) |
| `scripts/db/defense-demo-wipe.test.mjs` | Use `parseWipeTables` instead of its own copy |
| `docs/cr-pathways-defense-seed-snapshot.md`, `docs/runbook-defense-demo.md`, `docs/handoff-defense-demo-seed.md`, `docs/index.md`, `docs/activity-log.md` | Docs |

---

### Task 1: Worktree and snapshot parsers

**Files:**
- Create: `scripts/db/defense-snapshot-parse.mjs`
- Create: `scripts/db/defense-snapshot-parse.test.mjs`
- Modify: `scripts/db/defense-demo-wipe.test.mjs:26-31` (use `parseWipeTables`)

**Interfaces:**
- Consumes: `infra/supabase/phase6/hosted-defense-demo-wipe.sql` (unchanged).
- Produces:
  - `parseWipeTables(wipeSql: string): string[]` (`'schema.table'`, file order; throws on anything but one TRUNCATE or a name needing quotes)
  - `splitWipe(wipeSql: string): { head: string, tail: string }` (cut at `-- Drop exactly the temporary memberships added above.`; `head + tail === wipeSql`)
  - `parseDump(text: string): { blocks: Array<{ schema: string, table: string, columns: string, rows: string[] }> }`
  - `countsOf(blocks): Array<{ name: string, rows: number }>`
  - `compareCounts(expected, actual): string[]` (empty when equal)
  - `assertSameTables(tables: string[], blocks): void`

- [ ] **Step 1: Create the worktree**

```bash
git -C C:/PATHWAYS worktree add .worktrees/defense-seed-snapshot -b feature/defense-seed-snapshot dev
cd C:/PATHWAYS/.worktrees/defense-seed-snapshot
pnpm install --frozen-lockfile
```
Expected: install finishes without lockfile changes (Biome and Vitest now run in the worktree).

- [ ] **Step 2: Write the failing test** `scripts/db/defense-snapshot-parse.test.mjs`

```js
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
  assert.throws(() => parseDump("SELECT pg_catalog.setval('s', 1, true);\n"), /Unexpected statement/)
})

test('parseDump rejects a truncated COPY block and CRLF input', () => {
  assert.throws(() => parseDump('COPY pathways.projects (id) FROM stdin;\na1\n'), /ends inside COPY/)
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test scripts/db/defense-snapshot-parse.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `defense-snapshot-parse.mjs`.

- [ ] **Step 4: Write the implementation** `scripts/db/defense-snapshot-parse.mjs`

```js
// Pure parsers for the defense snapshot: wipe table list, wipe split point and pg_dump COPY blocks.
const REVOKE_MARKER = '-- Drop exactly the temporary memberships added above.'
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/
const COPY_HEADER = /^COPY ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) \((.+)\) FROM stdin;$/
const PREAMBLE = [
  /^$/,
  /^--/,
  /^SET [a-z_]+ = .+;$/,
  /^SELECT pg_catalog\.set_config\(.+\);$/,
  /^\\(?:restrict|unrestrict) \S+$/,
]

/** Tables truncated by the wipe file, as schema.table in file order. */
export function parseWipeTables(wipeSql) {
  const code = wipeSql.replace(/--.*$/gm, '')
  const statements = code.match(/\bTRUNCATE\s+TABLE\b[^;]*;/gi) ?? []
  if (statements.length !== 1)
    throw new Error('Wipe file must have exactly one TRUNCATE TABLE statement.')
  const tables = statements[0]
    .replace(/^TRUNCATE\s+TABLE/i, '')
    .replace(/RESTART\s+IDENTITY\s*;$/i, '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  for (const name of tables)
    if (!TABLE_NAME.test(name)) throw new Error(`Unexpected table name in wipe file: ${name}`)
  return tables
}

/** Splits the wipe file before its revoke so the restore loads data inside the same transaction. */
export function splitWipe(wipeSql) {
  const at = wipeSql.indexOf(REVOKE_MARKER)
  if (at < 0 || wipeSql.indexOf(REVOKE_MARKER, at + 1) >= 0)
    throw new Error('Wipe file layout changed: the revoke marker must appear exactly once.')
  const head = wipeSql.slice(0, at)
  const tail = wipeSql.slice(at)
  const shapeOk =
    /^BEGIN;$/m.test(head) &&
    !/^COMMIT;$/m.test(head) &&
    /\bREVOKE\b/.test(tail) &&
    /COMMIT;\s*$/.test(tail)
  if (!shapeOk)
    throw new Error('Wipe file layout changed: expected BEGIN before and REVOKE plus COMMIT after.')
  return { head, tail }
}

/** Parses pg_dump data-only output into COPY blocks, rejecting any statement but session settings. */
export function parseDump(text) {
  if (text.includes('\r\n')) throw new Error('Dump has CRLF line endings; run dump again.')
  const blocks = []
  let block = null
  for (const line of text.split('\n')) {
    if (block) {
      if (line === '\\.') {
        blocks.push(block)
        block = null
      } else block.rows.push(line)
      continue
    }
    const header = COPY_HEADER.exec(line)
    if (header) {
      block = { schema: header[1], table: header[2], columns: header[3], rows: [] }
      continue
    }
    if (!PREAMBLE.some((pattern) => pattern.test(line)))
      throw new Error(`Unexpected statement in dump: ${line.slice(0, 80)}`)
  }
  if (block) throw new Error(`Dump ends inside COPY for ${block.schema}.${block.table}.`)
  return { blocks }
}

/** Row count per dumped table. */
export const countsOf = (blocks) =>
  blocks.map((block) => ({ name: `${block.schema}.${block.table}`, rows: block.rows.length }))

/** Lists every table whose count differs between two count lists. */
export function compareCounts(expected, actual) {
  const found = new Map(actual.map((entry) => [entry.name, entry.rows]))
  const problems = expected
    .filter((entry) => found.get(entry.name) !== entry.rows)
    .map((entry) => `${entry.name}: expected ${entry.rows}, found ${found.get(entry.name) ?? 'none'}`)
  const known = new Set(expected.map((entry) => entry.name))
  for (const entry of actual) if (!known.has(entry.name)) problems.push(`${entry.name}: not in manifest`)
  return problems
}

/** Refuses a dump that does not cover exactly the wipe table list. */
export function assertSameTables(tables, blocks) {
  const dumped = blocks.map((block) => `${block.schema}.${block.table}`).sort()
  if (dumped.join(',') !== [...tables].sort().join(','))
    throw new Error('Dumped tables differ from the wipe list; dump again from the current wipe file.')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/db/defense-snapshot-parse.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 6: Make the wipe test use the shared parser**

In `scripts/db/defense-demo-wipe.test.mjs`, add the import after the `node:url` import:

```js
import { parseWipeTables } from './defense-snapshot-parse.mjs'
```

and replace the block

```js
const truncated = (statements[0] ?? '')
  .replace(/^TRUNCATE\s+TABLE/i, '')
  .replace(/RESTART\s+IDENTITY\s*;$/i, '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)
```

with

```js
const truncated = parseWipeTables(sql)
```

Keep `code` and `statements`; the first test still uses them.

- [ ] **Step 7: Run both suites and Biome**

Run: `node --test scripts/db/defense-snapshot-parse.test.mjs scripts/db/defense-demo-wipe.test.mjs && pnpm exec biome check scripts/db`
Expected: PASS, 13 tests; Biome reports no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/db/defense-snapshot-parse.mjs scripts/db/defense-snapshot-parse.test.mjs scripts/db/defense-demo-wipe.test.mjs
git commit -m "Add defense snapshot wipe and dump parsers"
```

---

### Task 2: Day math and target guards

**Files:**
- Create: `scripts/db/defense-snapshot-dates.mjs`, `scripts/db/defense-snapshot-dates.test.mjs`
- Create: `scripts/db/defense-snapshot-target.mjs`, `scripts/db/defense-snapshot-target.test.mjs`
- Modify: `scripts/db/hosted-seed-target.mjs:99` (`function assertHostedPgUrl` becomes `export function assertHostedPgUrl`)

**Interfaces:**
- Consumes: `assertHostedPgUrl(url: URL, label: string, expectedRole: string): void` from `hosted-seed-target.mjs` (throws on any host other than `db.klbtoqdalmcsfjqophty.supabase.co` with that role, or a `*.pooler.supabase.com` host with username `<role>.klbtoqdalmcsfjqophty`).
- Produces:
  - `manilaDay(now?: Date): string` (`YYYY-MM-DD`)
  - `dayDelta(seedDay: string, restoreDay: string): number` (non-negative integer; throws on invalid days or backwards)
  - `restoreWarnings({ seedDay, restoreDay, dumpedAt, now? }): string[]`
  - `assertRestoreTarget(env: Record<string,string>): string` (returns the raw `HOSTED_ADMIN_URL`)
  - `assertIdentities(identities): identities` (shape `{ organization: { id, ... }, users: Array<{ id, auth_user_id, organization_id, role_code, email, ... }> }`)
  - `libpqUrl(raw: string): string` (keeps only `sslmode`)

- [ ] **Step 1: Write the failing tests**

`scripts/db/defense-snapshot-dates.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { dayDelta, manilaDay, restoreWarnings } from './defense-snapshot-dates.mjs'

test('manilaDay uses the Asia/Manila calendar', () => {
  assert.equal(manilaDay(new Date('2026-10-05T16:30:00Z')), '2026-10-06')
  assert.equal(manilaDay(new Date('2026-10-05T15:59:00Z')), '2026-10-05')
})

test('dayDelta counts whole days, across months', () => {
  assert.equal(dayDelta('2026-10-06', '2026-10-06'), 0)
  assert.equal(dayDelta('2026-10-06', '2026-10-09'), 3)
  assert.equal(dayDelta('2026-09-29', '2026-10-02'), 3)
})

test('dayDelta refuses backwards shifts and invalid days', () => {
  assert.throws(() => dayDelta('2026-10-06', '2026-10-05'), /before seed day/)
  assert.throws(() => dayDelta('2026-02-30', '2026-10-05'), /Invalid day/)
  assert.throws(() => dayDelta('6 Oct', '2026-10-05'), /Invalid day/)
})

test('restoreWarnings flags timestamps that land after now', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-10-06',
    restoreDay: '2026-10-08',
    dumpedAt: '2026-10-06T12:00:00Z',
    now: new Date('2026-10-08T01:00:00Z'),
  })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /2026-10-08T12:00:00\.000Z, after now/)
})

test('restoreWarnings is quiet when the restore runs later in the day', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-10-06',
    restoreDay: '2026-10-08',
    dumpedAt: '2026-10-06T01:00:00Z',
    now: new Date('2026-10-08T03:00:00Z'),
  })
  assert.deepEqual(warnings, [])
})

test('restoreWarnings flags a month change', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-09-29',
    restoreDay: '2026-10-02',
    dumpedAt: '2026-09-29T01:00:00Z',
    now: new Date('2026-10-02T03:00:00Z'),
  })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /different months/)
})
```

`scripts/db/defense-snapshot-target.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { assertIdentities, assertRestoreTarget, libpqUrl } from './defense-snapshot-target.mjs'

const ref = 'klbtoqdalmcsfjqophty'
const pooler = `postgresql://postgres.${ref}:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
const direct = `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`
const org = '11111111-1111-4111-8111-111111111111'
const identities = () => ({
  organization: { id: org, code: 'PIP' },
  users: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      auth_user_id: '33333333-3333-4333-8333-333333333333',
      organization_id: org,
      role_code: 'SYSTEM_ADMINISTRATOR',
      email: 'admin@pathways.example',
    },
  ],
})

test('assertRestoreTarget accepts postgres on the devV2 pooler or direct host', () => {
  assert.equal(assertRestoreTarget({ HOSTED_ADMIN_URL: pooler }), pooler)
  assert.equal(assertRestoreTarget({ HOSTED_ADMIN_URL: direct }), direct)
})

test('assertRestoreTarget refuses missing, invalid, other-role, other-project and loopback URLs', () => {
  assert.throws(() => assertRestoreTarget({}), /HOSTED_ADMIN_URL/)
  assert.throws(() => assertRestoreTarget({ HOSTED_ADMIN_URL: 'not a url' }), /not a valid URL/)
  assert.throws(
    () => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler.replace('postgres.', 'prisma.') }),
    /username/,
  )
  assert.throws(
    () => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler.replaceAll(ref, 'a'.repeat(20)) }),
    /username/,
  )
  assert.throws(
    () =>
      assertRestoreTarget({ HOSTED_ADMIN_URL: 'postgresql://postgres:pw@127.0.0.1:54322/postgres' }),
    /host must be/,
  )
})

test('libpqUrl keeps only sslmode', () => {
  assert.equal(
    libpqUrl(`${pooler}?pgbouncer=true&connection_limit=1&schema=public&sslmode=require`),
    `${pooler}?sslmode=require`,
  )
  assert.equal(libpqUrl(pooler), pooler)
})

test('assertIdentities accepts a mirrored identities file, with or without an auth link', () => {
  assert.doesNotThrow(() => assertIdentities(identities()))
  const unlinked = identities()
  unlinked.users[0].auth_user_id = null
  assert.doesNotThrow(() => assertIdentities(unlinked))
})

test('assertIdentities rejects bad rows without echoing emails', () => {
  const bad = identities()
  bad.users[0].organization_id = '44444444-4444-4444-8444-444444444444'
  assert.throws(
    () => assertIdentities(bad),
    (error) => /user 0 is invalid/.test(error.message) && !error.message.includes('@'),
  )
  assert.throws(() => assertIdentities({ ...identities(), users: [] }), /no users/)
  assert.throws(() => assertIdentities({ users: [] }), /organization id/)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test scripts/db/defense-snapshot-dates.test.mjs scripts/db/defense-snapshot-target.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Export the existing URL guard**

In `scripts/db/hosted-seed-target.mjs` line 99 change `function assertHostedPgUrl(url, label, expectedRole) {` to `export function assertHostedPgUrl(url, label, expectedRole) {`. No other change.

- [ ] **Step 4: Write** `scripts/db/defense-snapshot-dates.mjs`

```js
// Day arithmetic for the defense snapshot: Manila calendar days, the restore shift and its warnings.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** The Asia/Manila calendar day of an instant, as YYYY-MM-DD. */
export const manilaDay = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)

function dayMs(day) {
  const ms = ISO_DAY.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day)
    throw new Error(`Invalid day ${day}; expected YYYY-MM-DD.`)
  return ms
}

/** Whole days from the seed day to the restore day; never negative. */
export function dayDelta(seedDay, restoreDay) {
  const delta = (dayMs(restoreDay) - dayMs(seedDay)) / DAY_MS
  if (delta < 0)
    throw new Error(
      `Restore day ${restoreDay} is before seed day ${seedDay}; refusing to shift dates backwards.`,
    )
  return delta
}

/** Non-fatal restore warnings: a month change and shifted timestamps that land after now. */
export function restoreWarnings({ seedDay, restoreDay, dumpedAt, now = new Date() }) {
  const warnings = []
  if (seedDay.slice(0, 7) !== restoreDay.slice(0, 7))
    warnings.push(
      'Seed and restore fall in different months; month-relative demo data (imports this month) may not read as seeded.',
    )
  const latest = Date.parse(dumpedAt) + dayDelta(seedDay, restoreDay) * DAY_MS
  if (latest > now.getTime())
    warnings.push(
      `Shifted timestamps reach ${new Date(latest).toISOString()}, after now; restore later in the day or seed earlier.`,
    )
  return warnings
}
```

- [ ] **Step 5: Write** `scripts/db/defense-snapshot-target.mjs`

```js
// Restore target and identities guards for the defense snapshot; validates input and connects to nothing.
import { assertHostedPgUrl } from './hosted-seed-target.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns HOSTED_ADMIN_URL once it is the postgres role on PATHWAYS-devV2. */
export function assertRestoreTarget(env) {
  const raw = env.HOSTED_ADMIN_URL
  if (!raw) throw new Error('HOSTED_ADMIN_URL (role postgres on PATHWAYS-devV2) is required.')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('HOSTED_ADMIN_URL is not a valid URL.')
  }
  assertHostedPgUrl(url, 'HOSTED_ADMIN_URL', 'postgres')
  return raw
}

/** Drops Prisma-only query parameters that psql rejects, keeping sslmode. */
export function libpqUrl(raw) {
  const url = new URL(raw)
  for (const key of [...url.searchParams.keys()])
    if (key !== 'sslmode') url.searchParams.delete(key)
  return url.toString()
}

/** Checks the identities file shape without echoing any email or name. */
export function assertIdentities(identities) {
  const organizationId = identities?.organization?.id
  if (!UUID.test(String(organizationId))) throw new Error('Identities file has no valid organization id.')
  const users = identities.users
  if (!Array.isArray(users) || users.length === 0) throw new Error('Identities file has no users.')
  for (const [index, user] of users.entries()) {
    const authOk = user.auth_user_id === null || UUID.test(String(user.auth_user_id))
    const valid =
      UUID.test(String(user.id)) &&
      authOk &&
      user.organization_id === organizationId &&
      Boolean(user.role_code) &&
      Boolean(user.email)
    if (!valid) throw new Error(`Identities file user ${index} is invalid.`)
  }
  return identities
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test scripts/db/defense-snapshot-dates.test.mjs scripts/db/defense-snapshot-target.test.mjs && pnpm --filter @pathways/api exec vitest run prisma/hosted-seed-target.test.ts && pnpm exec biome check scripts/db`
Expected: PASS, 11 node tests; the existing Vitest guard suite still passes; Biome clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/db/defense-snapshot-dates.mjs scripts/db/defense-snapshot-dates.test.mjs scripts/db/defense-snapshot-target.mjs scripts/db/defense-snapshot-target.test.mjs scripts/db/hosted-seed-target.mjs
git commit -m "Add defense snapshot day math and restore target guards"
```

---

### Task 3: SQL builders

**Files:**
- Create: `scripts/db/defense-snapshot-sql.mjs`
- Create: `scripts/db/defense-snapshot-sql.test.mjs`

**Interfaces:**
- Consumes: `splitWipe` from Task 1.
- Produces (all return SQL text):
  - `quoteIdent(name: string): string`, `dollarQuote(text: string): string`
  - `mirrorReadSql(): string` (one row, one JSON value `{ organization, users }`)
  - `mirrorWriteSql({ organization, users }): string` (one transaction, prints the staff count)
  - `seedInfoSql(): string` (JSON `{ seedDay: 'YYYY-MM-DD' | null, migration: string }`)
  - `dateColumnsSql(tables: string[]): string` (JSON `{ 'schema.table': [{ name, type: 'date' | 'timestamp' }] }`)
  - `storageObjectsSql(organizationId: string): string` (JSON array `[{ bucket, name, contentType }]`)
  - `migrationCheckSql(migration: string)`, `identityCheckSql(users)`, `shiftSql(table, columns, delta)`, `stagedLoadSql(blocks, dateColumns, delta)`, `rowCountCheckSql(tables)`
  - `buildRestoreSql({ wipeSql, migration, users, blocks, dateColumns, tables, delta }): string`

- [ ] **Step 1: Write the failing test** `scripts/db/defense-snapshot-sql.test.mjs`

```js
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
  assert.match(sql, /^BEGIN;/)
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
  assert.match(migrationCheckSql('0063_rules_scope_memo'), /IS DISTINCT FROM '0063_rules_scope_memo'/)
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
  assert.throws(() => rowCountCheckSql([{ name: "pathways.x'y", rows: 1 }]), /Invalid manifest entry/)
  assert.throws(() => rowCountCheckSql([{ name: 'pathways.x', rows: -1 }]), /Invalid manifest entry/)
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
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.equal(sql.match(/^BEGIN;$/gm).length, 1)
  assert.equal(sql.match(/^COMMIT;$/gm).length, 1)
  assert.doesNotMatch(sql, /DISABLE (ROW LEVEL SECURITY|TRIGGER)/i)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/db/defense-snapshot-sql.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write** `scripts/db/defense-snapshot-sql.mjs`

```js
// Pure SQL builders for the defense snapshot: identity mirror, dump queries and the one-transaction restore.
import { splitWipe } from './defense-snapshot-parse.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/
const MIGRATION = /^\d{4}_[a-z0-9_]+$/
const TAG = '$snapshot_json$'

export const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`

/** Dollar-quotes text as a SQL literal, refusing text that contains the quote tag. */
export function dollarQuote(text) {
  if (text.includes(TAG)) throw new Error('Value contains the SQL quote tag.')
  return `${TAG}${text}${TAG}`
}

function tableArray(tables) {
  for (const name of tables) if (!TABLE_NAME.test(name)) throw new Error(`Unexpected table name: ${name}`)
  return `ARRAY[${tables.map((name) => `'${name}'`).join(', ')}]::text[]`
}

/** Reads the one organization and every staff row with its role code, minus contact and sign-in data. */
export const mirrorReadSql = () => `SELECT jsonb_build_object(
  'organization', (SELECT to_jsonb(o) FROM pathways.organizations o),
  'users', (SELECT jsonb_agg((to_jsonb(u) - 'contact_number' - 'last_login_at' - 'role_id')
      || jsonb_build_object('role_code', r.code) ORDER BY u.id)
    FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id));`

/** Replaces the local organization, staff rows and auth users with the mirrored identities. */
export function mirrorWriteSql({ organization, users }) {
  const org = dollarQuote(JSON.stringify(organization))
  const list = dollarQuote(JSON.stringify(users))
  return `BEGIN;
DELETE FROM pathways.user_step_up_pins;
DELETE FROM pathways.system_users;
DELETE FROM pathways.organizations;
DELETE FROM auth.users;
INSERT INTO pathways.organizations
SELECT (jsonb_populate_record(NULL::pathways.organizations, ${org}::jsonb)).*;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', (u->>'auth_user_id')::uuid, 'authenticated',
  'authenticated', u->>'email', '', now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
FROM jsonb_array_elements(${list}::jsonb) u WHERE u->>'auth_user_id' IS NOT NULL;
INSERT INTO pathways.system_users
SELECT (jsonb_populate_record(NULL::pathways.system_users, u || jsonb_build_object('role_id', r.id))).*
FROM jsonb_array_elements(${list}::jsonb) u JOIN pathways.roles r ON r.code = u->>'role_code';
DO $mirror$
BEGIN
  IF (SELECT count(*) FROM pathways.system_users) <> ${users.length} THEN
    RAISE EXCEPTION 'Mirror wrote a different number of users; check role codes';
  END IF;
END $mirror$;
COMMIT;
SELECT count(*) FROM pathways.system_users;`
}

/** Seed day from the first seeded audit row, plus the latest applied migration. */
export const seedInfoSql = () => `SELECT jsonb_build_object(
  'seedDay', (min(occurred_at) AT TIME ZONE 'Asia/Manila')::date,
  'migration', (SELECT max(migration_name) FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL))
FROM pathways.audit_logs;`

/** Date and timestamp columns of the given tables, skipping generated columns. */
export const dateColumnsSql = (tables) => `SELECT coalesce(jsonb_object_agg(t, cols), '{}'::jsonb) FROM (
  SELECT n.nspname || '.' || c.relname AS t,
    jsonb_agg(jsonb_build_object('name', a.attname, 'type',
      CASE WHEN a.atttypid = 'date'::regtype THEN 'date' ELSE 'timestamp' END) ORDER BY a.attnum) AS cols
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.atttypid IN ('date'::regtype, 'timestamp'::regtype, 'timestamptz'::regtype)
    AND n.nspname || '.' || c.relname = ANY (${tableArray(tables)})
  GROUP BY 1) s;`

/** Storage objects under the organization prefix, which every seeded object key uses. */
export function storageObjectsSql(organizationId) {
  if (!UUID.test(String(organizationId))) throw new Error('Organization id must be a UUID.')
  return `SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name,
  'contentType', metadata->>'mimetype') ORDER BY bucket_id, name), '[]'::jsonb)
FROM storage.objects WHERE name LIKE 'organizations/${organizationId}/%';`
}

/** Aborts unless the target's latest applied migration equals the snapshot's. */
export function migrationCheckSql(migration) {
  if (!MIGRATION.test(String(migration))) throw new Error('Manifest migration name is invalid.')
  return `DO $migration$
BEGIN
  IF (SELECT max(migration_name) FROM public._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) IS DISTINCT FROM '${migration}' THEN
    RAISE EXCEPTION 'Target migration differs from the snapshot (${migration})';
  END IF;
END $migration$;`
}

/** Aborts unless the target staff rows are exactly the mirrored ids, auth links and organization. */
export function identityCheckSql(users) {
  const expected = dollarQuote(
    JSON.stringify(
      users.map(({ id, auth_user_id, organization_id }) => ({ id, auth_user_id, organization_id })),
    ),
  )
  return `DO $identity$
DECLARE expected jsonb := ${expected}::jsonb;
BEGIN
  IF (SELECT count(*) FROM pathways.system_users) <> jsonb_array_length(expected) OR EXISTS (
    SELECT FROM jsonb_to_recordset(expected) AS e(id uuid, auth_user_id uuid, organization_id uuid)
    WHERE NOT EXISTS (SELECT FROM pathways.system_users u WHERE u.id = e.id
      AND u.auth_user_id IS NOT DISTINCT FROM e.auth_user_id AND u.organization_id = e.organization_id)) THEN
    RAISE EXCEPTION 'Target staff identities differ from the identities file; rerun mirror and the local seed';
  END IF;
END $identity$;`
}

/** Adds the day delta to every date and timestamp column of one staging table. */
export function shiftSql(table, columns, delta) {
  if (!Number.isInteger(delta) || delta < 0)
    throw new Error('Day delta must be a non-negative integer.')
  if (delta === 0 || columns.length === 0) return ''
  const sets = columns.map(({ name, type }) => {
    const column = quoteIdent(name)
    return type === 'date'
      ? `${column} = ${column} + ${delta}`
      : `${column} = ${column} + make_interval(days => ${delta})`
  })
  return `UPDATE ${table} SET ${sets.join(', ')};`
}

/** Loads each COPY block into a staging table, shifts it there, then inserts it into the real table. */
export function stagedLoadSql(blocks, dateColumns, delta) {
  return blocks
    .map((block, index) => {
      const target = `${block.schema}.${block.table}`
      const stage = `pg_temp.snapshot_${index}`
      const shift = shiftSql(stage, dateColumns[target] ?? [], delta)
      return [
        `CREATE TEMP TABLE snapshot_${index} (LIKE ${target}) ON COMMIT DROP;`,
        `COPY ${stage} (${block.columns}) FROM stdin;`,
        ...block.rows,
        '\\.',
        ...(shift ? [shift] : []),
        `INSERT INTO ${target} (${block.columns}) SELECT ${block.columns} FROM ${stage};`,
      ].join('\n')
    })
    .join('\n')
}

/** Aborts unless every table holds exactly the manifest row count. */
export function rowCountCheckSql(tables) {
  if (tables.length === 0) throw new Error('Manifest lists no tables.')
  const values = tables.map(({ name, rows }) => {
    if (!TABLE_NAME.test(name) || !Number.isInteger(rows) || rows < 0)
      throw new Error(`Invalid manifest entry for ${name}.`)
    const [schema, table] = name.split('.')
    return `('${schema}', '${table}', ${rows})`
  })
  return `DO $counts$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES ${values.join(', ')}) AS v(s, t, expected) LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.s, r.t) INTO n;
    IF n <> r.expected THEN
      RAISE EXCEPTION 'Restored % rows into %.%, expected %', n, r.s, r.t, r.expected;
    END IF;
  END LOOP;
END $counts$;`
}

/** The whole restore: wipe head, checks, replica-role staged load, counts, wipe revoke and COMMIT. */
export function buildRestoreSql({ wipeSql, migration, users, blocks, dateColumns, tables, delta }) {
  const { head, tail } = splitWipe(wipeSql)
  return [
    "SET client_encoding = 'UTF8';",
    head,
    'SET LOCAL statement_timeout = 0;',
    migrationCheckSql(migration),
    identityCheckSql(users),
    'SET LOCAL session_replication_role = replica;',
    stagedLoadSql(blocks, dateColumns, delta),
    rowCountCheckSql(tables),
    'SET LOCAL session_replication_role = origin;',
    tail,
  ].join('\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/db/defense-snapshot-sql.test.mjs && pnpm exec biome check scripts/db`
Expected: PASS, 13 tests; Biome clean. If the file exceeds about 200 lines after formatting, move `mirrorReadSql`, `mirrorWriteSql`, `seedInfoSql`, `dateColumnsSql` and `storageObjectsSql` into `scripts/db/defense-snapshot-sql-local.mjs` (same exports, same test file importing from both).

- [ ] **Step 5: Commit**

```bash
git add scripts/db/defense-snapshot-sql.mjs scripts/db/defense-snapshot-sql.test.mjs
git commit -m "Add defense snapshot mirror, dump and restore SQL builders"
```

---

### Task 4: Storage copy

**Files:**
- Create: `scripts/db/defense-snapshot-storage.mjs`
- Create: `scripts/db/defense-snapshot-storage.test.mjs`

**Interfaces:**
- Consumes: manifest storage entries `{ bucket: string, name: string, contentType: string | null }` (Task 3 `storageObjectsSql`).
- Produces:
  - `objectUrl(baseUrl: string, bucket: string, name: string): string`
  - `uploadContentType(contentType?: string | null): string`
  - `copyObjects(objects, source: { url, key }, target: { url, key }, { fetchImpl?, log? }?): Promise<number>`

- [ ] **Step 1: Write the failing test** `scripts/db/defense-snapshot-storage.test.mjs`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { copyObjects, objectUrl, uploadContentType } from './defense-snapshot-storage.mjs'

function fakeFetch(responses) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    const next = responses.shift()
    return {
      ok: next.status < 300,
      status: next.status,
      arrayBuffer: async () => Uint8Array.from(Buffer.from(next.body ?? '')).buffer,
      text: async () => next.body ?? '',
    }
  }
  return { calls, impl }
}

const object = {
  bucket: 'pathways-private',
  name: 'organizations/o/r.csv',
  contentType: 'text/csv; charset=utf-8',
}
const source = { url: 'http://127.0.0.1:54321', key: 'local-key' }
const target = { url: 'https://example.supabase.co/', key: 'hosted-key' }
const quiet = () => {}

test('objectUrl encodes each path segment and trims the base slash', () => {
  assert.equal(
    objectUrl('https://example.supabase.co/', 'pathways-private', 'organizations/a b/c#1.png'),
    'https://example.supabase.co/storage/v1/object/pathways-private/organizations/a%20b/c%231.png',
  )
})

test('uploadContentType strips media type parameters', () => {
  assert.equal(uploadContentType('text/csv; charset=utf-8'), 'text/csv')
  assert.equal(uploadContentType('application/pdf'), 'application/pdf')
  assert.equal(uploadContentType(null), 'application/octet-stream')
})

test('copyObjects downloads with the source key and upserts with the target key', async () => {
  const { calls, impl } = fakeFetch([{ status: 200, body: 'a,b' }, { status: 200 }])
  const copied = await copyObjects([object], source, target, { fetchImpl: impl, log: quiet })
  assert.equal(copied, 1)
  assert.equal(
    calls[0].url,
    'http://127.0.0.1:54321/storage/v1/object/pathways-private/organizations/o/r.csv',
  )
  assert.equal(calls[0].init.headers.apikey, 'local-key')
  assert.equal(calls[1].init.method, 'POST')
  assert.equal(calls[1].init.headers.authorization, 'Bearer hosted-key')
  assert.equal(calls[1].init.headers['x-upsert'], 'true')
  assert.equal(calls[1].init.headers['content-type'], 'text/csv')
  assert.equal(Buffer.from(calls[1].init.body).toString(), 'a,b')
})

test('copyObjects stops on the first failed upload with its status and reason', async () => {
  const { impl } = fakeFetch([{ status: 200, body: 'x' }, { status: 400, body: 'mime type not supported' }])
  await assert.rejects(
    copyObjects([object, object], source, target, { fetchImpl: impl, log: quiet }),
    /Upload failed \(400\).*mime type not supported/,
  )
})

test('copyObjects refuses to run without both keys', async () => {
  await assert.rejects(
    copyObjects([object], source, { url: target.url, key: '' }, { fetchImpl: fakeFetch([]).impl }),
    /service role keys/,
  )
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/db/defense-snapshot-storage.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write** `scripts/db/defense-snapshot-storage.mjs`

```js
// Copies snapshot storage objects between Supabase Storage APIs with service role keys; upsert only.
const authHeaders = (key) => ({ apikey: key, authorization: `Bearer ${key}` })

/** Storage REST URL for one object, encoding each path segment. */
export function objectUrl(baseUrl, bucket, name) {
  const key = name.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`
}

/** Drops media type parameters because hosted bucket allow lists name bare types such as text/csv. */
export const uploadContentType = (contentType) =>
  (contentType || 'application/octet-stream').split(';')[0].trim()

/** Downloads each object from the source and upserts it into the same bucket and path on the target. */
export async function copyObjects(
  objects,
  source,
  target,
  { fetchImpl = fetch, log = console.info } = {},
) {
  if (!source.key || !target.key)
    throw new Error('Storage copy needs service role keys for source and target.')
  for (const object of objects) {
    const label = `${object.bucket}/${object.name}`
    const download = await fetchImpl(objectUrl(source.url, object.bucket, object.name), {
      headers: authHeaders(source.key),
    })
    if (!download.ok) throw new Error(`Download failed (${download.status}) for ${label}.`)
    const body = Buffer.from(await download.arrayBuffer())
    const upload = await fetchImpl(objectUrl(target.url, object.bucket, object.name), {
      method: 'POST',
      headers: {
        ...authHeaders(target.key),
        'content-type': uploadContentType(object.contentType),
        'x-upsert': 'true',
      },
      body,
    })
    if (!upload.ok) {
      const reason = (await upload.text()).slice(0, 200)
      throw new Error(`Upload failed (${upload.status}) for ${label}: ${reason}`)
    }
  }
  log(`Copied ${objects.length} storage object(s).`)
  return objects.length
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/db/defense-snapshot-storage.test.mjs && pnpm exec biome check scripts/db`
Expected: PASS, 5 tests; Biome clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/db/defense-snapshot-storage.mjs scripts/db/defense-snapshot-storage.test.mjs
git commit -m "Add defense snapshot storage copy"
```

---

### Task 5: Container IO and the CLI

**Files:**
- Create: `scripts/db/defense-snapshot-io.mjs`
- Create: `scripts/db/defense-snapshot.mjs`
- Create: `scripts/db/defense-snapshot-cli.test.mjs`

**Interfaces:**
- Consumes: everything produced by Tasks 1 to 4; `assertSeedTarget`, `loadEnvFile`, `resolveEnvFilePath`, `ALLOWED_PROJECT_REF` from `hosted-seed-target.mjs`; `localDatabase`, `localSupabase()` from `local-target.mjs`.
- Produces:
  - `assertLocalContainer(): void`, `psqlLocal(sql, { capture? }): string`, `psqlUrl(url, sql, { capture? }): string`, `dumpLocal(tables): string`, `readJson(file)`, `writeText(file, text)`, `writeJson(file, value)`
  - CLI `node scripts/db/defense-snapshot.mjs mirror|dump|restore|storage`; files `.tmp/defense-identities.json`, `.tmp/defense-snapshot/data.sql`, `.tmp/defense-snapshot/manifest.json` with manifest shape `{ version: 1, seedDay, migration, dumpedAt, organizationId, tables: [{ name, rows }], dateColumns, storage: [{ bucket, name, contentType }] }`.
  - Exit codes: 0 success, 1 any error (message on stderr), 2 unknown command.

- [ ] **Step 1: Write the failing CLI test** `scripts/db/defense-snapshot-cli.test.mjs`

These cases fail before any docker or network call, so they run anywhere.

```js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const cli = (...args) =>
  spawnSync(process.execPath, [path.join(root, 'scripts/db/defense-snapshot.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  })

test('an unknown command prints usage and exits 2', () => {
  for (const command of ['bogus', 'toString']) {
    const run = cli(command)
    assert.equal(run.status, 2)
    assert.match(run.stderr, /Usage: node scripts\/db\/defense-snapshot\.mjs mirror\|dump\|restore\|storage/)
  }
})

test('restore needs exactly one target', () => {
  assert.match(cli('restore').stderr, /exactly one of --env-file or --test-local/)
  const both = cli('restore', '--test-local', '--env-file', '.tmp/x.env')
  assert.equal(both.status, 1)
  assert.match(both.stderr, /exactly one of --env-file or --test-local/)
})

test('restore refuses --today on a hosted target', () => {
  const run = cli('restore', '--env-file', '.tmp/x.env', '--today', '2026-10-09')
  assert.equal(run.status, 1)
  assert.match(run.stderr, /--today is only allowed with --test-local/)
})

test('restore refuses an env file inside the repo outside .tmp', () => {
  assert.match(cli('restore', '--env-file', 'package.json').stderr, /must be under \.tmp/)
})

test('mirror needs exactly one identity source', () => {
  assert.match(cli('mirror').stderr, /exactly one of --env-file or --identities/)
  assert.match(
    cli('mirror', '--env-file', '.tmp/x.env', '--identities', 'x.json').stderr,
    /exactly one of --env-file or --identities/,
  )
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/db/defense-snapshot-cli.test.mjs`
Expected: FAIL (status 1 with "Cannot find module" instead of the expected messages).

- [ ] **Step 3: Write** `scripts/db/defense-snapshot-io.mjs`

```js
// Side effects for defense-snapshot.mjs: psql and pg_dump inside the local container, and .tmp files.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { localDatabase } from './local-target.mjs'

const PSQL_FLAGS = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At']

function docker(args, { input, capture = true, env = {} } = {}) {
  const output = execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
  })
  return output ?? ''
}

/** Refuses to run unless the fixed local container publishes the fixed local port. */
export function assertLocalContainer() {
  const published = docker(['port', localDatabase.container, '5432/tcp'])
  if (!published.split(/\r?\n/).some((line) => line.trim().endsWith(`:${localDatabase.port}`)))
    throw new Error(
      `${localDatabase.container} is not published on ${localDatabase.port}. Run pnpm db:local:start.`,
    )
}

/** Runs SQL on the local stack as postgres. */
export const psqlLocal = (sql, options = {}) =>
  docker(
    ['exec', '-i', localDatabase.container, 'psql', ...PSQL_FLAGS, '-U', 'postgres', '-d', 'postgres'],
    { input: sql, ...options },
  )

/** Runs SQL against a URL with the container's psql; the URL travels by environment, never argv. */
export const psqlUrl = (url, sql, options = {}) =>
  docker(
    [
      'exec',
      '-i',
      '-e',
      'PATHWAYS_SNAPSHOT_PGURL',
      localDatabase.container,
      'sh',
      '-c',
      `exec psql "$PATHWAYS_SNAPSHOT_PGURL" ${PSQL_FLAGS.join(' ')}`,
    ],
    { input: sql, env: { PATHWAYS_SNAPSHOT_PGURL: url }, ...options },
  )

/** Data-only dump of exactly the given tables from the local stack. */
export const dumpLocal = (tables) =>
  docker([
    'exec',
    localDatabase.container,
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '--data-only',
    '--no-owner',
    '--no-privileges',
    '--strict-names',
    '--encoding=UTF8',
    ...tables.map((table) => `--table=${table}`),
  ])

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** Writes a private file, creating its directory. */
export function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, { mode: 0o600 })
}

export const writeJson = (file, value) => writeText(file, `${JSON.stringify(value, null, 2)}\n`)
```

- [ ] **Step 4: Write** `scripts/db/defense-snapshot.mjs`

```js
// Defense demo snapshot: mirror devV2 identities locally, dump the local seed, restore it onto devV2.
// Hosted runs belong to the developer; implementers use --test-local and an identities fixture only.
//
// Usage:
//   node scripts/db/defense-snapshot.mjs mirror (--env-file <path> | --identities <file>)
//   node scripts/db/defense-snapshot.mjs dump [--identities <file>]
//   node scripts/db/defense-snapshot.mjs restore (--env-file <path> | --test-local) [--identities <file>]
//     [--today YYYY-MM-DD, test-local only] [--skip-storage]
//   node scripts/db/defense-snapshot.mjs storage (--env-file <path> | --test-local)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { dayDelta, manilaDay, restoreWarnings } from './defense-snapshot-dates.mjs'
import {
  assertLocalContainer,
  dumpLocal,
  psqlLocal,
  psqlUrl,
  readJson,
  writeJson,
  writeText,
} from './defense-snapshot-io.mjs'
import {
  assertSameTables,
  compareCounts,
  countsOf,
  parseDump,
  parseWipeTables,
} from './defense-snapshot-parse.mjs'
import {
  buildRestoreSql,
  dateColumnsSql,
  mirrorReadSql,
  mirrorWriteSql,
  seedInfoSql,
  storageObjectsSql,
} from './defense-snapshot-sql.mjs'
import { copyObjects } from './defense-snapshot-storage.mjs'
import { assertIdentities, assertRestoreTarget, libpqUrl } from './defense-snapshot-target.mjs'
import {
  ALLOWED_PROJECT_REF,
  assertSeedTarget,
  loadEnvFile,
  resolveEnvFilePath,
} from './hosted-seed-target.mjs'
import { localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const files = {
  identities: path.join(root, '.tmp', 'defense-identities.json'),
  data: path.join(root, '.tmp', 'defense-snapshot', 'data.sql'),
  manifest: path.join(root, '.tmp', 'defense-snapshot', 'manifest.json'),
  wipe: path.join(root, 'infra', 'supabase', 'phase6', 'hosted-defense-demo-wipe.sql'),
}

function parseArgs(argv) {
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  return {
    command: argv[0],
    envFile: value('--env-file'),
    identities: value('--identities'),
    today: value('--today'),
    testLocal: argv.includes('--test-local'),
    skipStorage: argv.includes('--skip-storage'),
  }
}

function hostedEnv(envFile) {
  const env = loadEnvFile(resolveEnvFilePath(envFile))
  assertSeedTarget(env, { testLocal: false })
  return env
}

const readIdentities = (file) => assertIdentities(readJson(file ?? files.identities))

function localStorageApi() {
  const local = localSupabase()
  return { url: local.apiUrl, key: local.serviceRoleKey }
}

function restoreTarget(args) {
  if (args.testLocal === Boolean(args.envFile))
    throw new Error('Pass exactly one of --env-file or --test-local.')
  if (args.today && !args.testLocal) throw new Error('--today is only allowed with --test-local.')
  if (args.testLocal) {
    assertLocalContainer()
    return {
      label: 'the local stack',
      verify: 'node scripts/db/defense-demo.mjs --test-local --verify',
      run: (sql) => psqlLocal(sql, { capture: false }),
      storage: localStorageApi(),
    }
  }
  const env = hostedEnv(args.envFile)
  const url = libpqUrl(assertRestoreTarget(env))
  assertLocalContainer()
  return {
    label: `hosted project ${ALLOWED_PROJECT_REF} (PATHWAYS-devV2)`,
    verify: `node scripts/db/defense-demo.mjs --env-file ${args.envFile} --verify`,
    run: (sql) => psqlUrl(url, sql, { capture: false }),
    storage: { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY },
  }
}

async function mirror(args) {
  if (Boolean(args.envFile) === Boolean(args.identities))
    throw new Error('mirror needs exactly one of --env-file or --identities.')
  const env = args.envFile ? hostedEnv(args.envFile) : null
  assertLocalContainer()
  const identities = env
    ? {
        projectRef: ALLOWED_PROJECT_REF,
        capturedAt: new Date().toISOString(),
        ...JSON.parse(psqlUrl(libpqUrl(env.DIRECT_URL), mirrorReadSql()).trim()),
      }
    : readJson(args.identities)
  assertIdentities(identities)
  if (env) writeJson(files.identities, identities)
  psqlLocal(readFileSync(files.wipe, 'utf8'))
  const count = psqlLocal(mirrorWriteSql(identities)).trim()
  console.info(
    `Mirrored 1 organization and ${count} staff accounts into the local stack; their local sign-in stays off until pnpm db:local:reset.`,
  )
}

async function dump(args) {
  assertLocalContainer()
  const organizationId = readIdentities(args.identities).organization.id
  if (psqlLocal('SELECT id FROM pathways.organizations;').trim() !== organizationId)
    throw new Error('The local organization is not the mirrored one; run mirror, then pnpm db:defense:local.')
  const tables = parseWipeTables(readFileSync(files.wipe, 'utf8'))
  const seed = JSON.parse(psqlLocal(seedInfoSql()).trim())
  if (!seed.seedDay) throw new Error('No seeded audit rows; run pnpm db:defense:local first.')
  const dateColumns = JSON.parse(psqlLocal(dateColumnsSql(tables)).trim())
  const storage = JSON.parse(psqlLocal(storageObjectsSql(organizationId)).trim())
  const text = dumpLocal(tables)
  const { blocks } = parseDump(text)
  assertSameTables(tables, blocks)
  const counts = countsOf(blocks)
  writeText(files.data, text)
  writeJson(files.manifest, {
    version: 1,
    seedDay: seed.seedDay,
    migration: seed.migration,
    dumpedAt: new Date().toISOString(),
    organizationId,
    tables: counts,
    dateColumns,
    storage,
  })
  const rows = counts.reduce((sum, entry) => sum + entry.rows, 0)
  console.info(
    `Dumped ${counts.length} tables (${rows} rows) and ${storage.length} storage objects; seed day ${seed.seedDay}, migration ${seed.migration}.`,
  )
}

async function copyStorage(manifest, target) {
  try {
    await copyObjects(manifest.storage, localStorageApi(), target.storage)
  } catch (error) {
    console.error('Storage copy failed; rerun the storage command with the same target flags.')
    throw error
  }
}

async function restore(args) {
  const target = restoreTarget(args)
  const manifest = readJson(files.manifest)
  const identities = readIdentities(args.identities)
  if (identities.organization.id !== manifest.organizationId)
    throw new Error('The snapshot organization differs from the identities file.')
  const wipeSql = readFileSync(files.wipe, 'utf8')
  const { blocks } = parseDump(readFileSync(files.data, 'utf8'))
  assertSameTables(parseWipeTables(wipeSql), blocks)
  const mismatches = compareCounts(manifest.tables, countsOf(blocks))
  if (mismatches.length) throw new Error(`data.sql does not match manifest.json: ${mismatches.join('; ')}`)
  const restoreDay = args.today ?? manilaDay()
  const delta = dayDelta(manifest.seedDay, restoreDay)
  const warnings = restoreWarnings({ seedDay: manifest.seedDay, restoreDay, dumpedAt: manifest.dumpedAt })
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  console.info('Keep the GitHub variable RULES_DISPATCH_ENABLED=false until --verify passes.')
  console.info(`Restoring ${blocks.length} tables onto ${target.label}; dates shift by ${delta} day(s).`)
  target.run(
    buildRestoreSql({
      wipeSql,
      migration: manifest.migration,
      users: identities.users,
      blocks,
      dateColumns: manifest.dateColumns,
      tables: manifest.tables,
      delta,
    }),
  )
  console.info('Database restore committed.')
  if (!args.skipStorage) await copyStorage(manifest, target)
  console.info(`Next: ${target.verify}`)
}

async function storage(args) {
  const target = restoreTarget(args)
  await copyStorage(readJson(files.manifest), target)
}

const commands = { mirror, dump, restore, storage }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!Object.hasOwn(commands, args.command ?? '')) {
    console.error('Usage: node scripts/db/defense-snapshot.mjs mirror|dump|restore|storage [options]')
    process.exit(2)
  }
  await commands[args.command](args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
```

- [ ] **Step 5: Run the CLI test and every snapshot suite**

Run: `node --test scripts/db/defense-snapshot-cli.test.mjs scripts/db/defense-snapshot-parse.test.mjs scripts/db/defense-snapshot-dates.test.mjs scripts/db/defense-snapshot-target.test.mjs scripts/db/defense-snapshot-sql.test.mjs scripts/db/defense-snapshot-storage.test.mjs scripts/db/defense-demo-wipe.test.mjs && pnpm exec biome check scripts/db`
Expected: PASS, 5 CLI tests plus the earlier suites; Biome clean. If `defense-snapshot.mjs` exceeds about 200 lines after formatting, move `mirror` and `dump` into `scripts/db/defense-snapshot-local.mjs` exporting `mirror(args, files)` and `dump(args, files)`.

- [ ] **Step 6: Commit**

```bash
git add scripts/db/defense-snapshot-io.mjs scripts/db/defense-snapshot.mjs scripts/db/defense-snapshot-cli.test.mjs
git commit -m "Add defense snapshot CLI with mirror, dump, restore and storage"
```

---

### Task 6: Local rehearsal

Confirm with the controller first: this resets the shared local stack and runs the 18-minute defense seed. Run from Git Bash in the worktree. Append the key output lines of each step to `.tmp/defense-snapshot/rehearsal.txt` (counts, seed day, delta, verify summary; no emails) for Task 7. If any step fails, use superpowers:systematic-debugging, add a failing unit test in the owning module, fix, rerun from the failing step.

**Files:**
- Modify only if the rehearsal exposes a bug: the owning `scripts/db/defense-snapshot-*.mjs` and its test.

**Interfaces:**
- Consumes: the CLI from Task 5.
- Produces: `.tmp/defense-snapshot/rehearsal.txt` (local evidence for the CR).

Run Steps 4 to 10 within one Manila calendar day; the delta-0 restore in Step 10 assumes the restore day equals the seed day.

- [ ] **Step 1: Generate the Prisma client and reset**

```bash
cd C:/PATHWAYS/.worktrees/defense-seed-snapshot
pnpm --filter @pathways/api exec prisma generate --config prisma.generate.config.ts
pnpm db:local:reset
```
Expected: reset ends with "Local synthetic seed complete: 7 accounts".

- [ ] **Step 2: Build an identities fixture with new ids**

```bash
mkdir -p .tmp/defense-snapshot
docker exec -i supabase_db_pathways psql -X -q -At -U postgres -d postgres > .tmp/defense-identities-fixture.json <<'SQL'
WITH org AS MATERIALIZED (SELECT to_jsonb(o) AS row, gen_random_uuid() AS new_id FROM pathways.organizations o)
SELECT jsonb_build_object(
  'projectRef', 'local-fixture',
  'capturedAt', now(),
  'organization', (SELECT row || jsonb_build_object('id', new_id) FROM org),
  'users', (SELECT jsonb_agg((to_jsonb(u) - 'contact_number' - 'last_login_at' - 'role_id')
      || jsonb_build_object('id', gen_random_uuid(), 'auth_user_id', gen_random_uuid(),
        'organization_id', (SELECT new_id FROM org), 'role_code', r.code))
    FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id));
SQL
node -e "const j=require('./.tmp/defense-identities-fixture.json');console.log(j.users.length, 'fixture users')"
```
Expected: `7 fixture users`.

- [ ] **Step 3: Mirror the fixture (exercises the replace path against existing local rows)**

Run: `node scripts/db/defense-snapshot.mjs mirror --identities .tmp/defense-identities-fixture.json`
Expected: `Mirrored 1 organization and 7 staff accounts into the local stack; ...`

- [ ] **Step 4: Seed and verify locally**

Run: `pnpm db:defense:local && node scripts/db/defense-demo.mjs --test-local --verify`
Expected: the seed ends with no failed stages; the verify table shows no `ok: false` row.

- [ ] **Step 5: Capture a date baseline**

```bash
cat > .tmp/defense-snapshot/dates.sql <<'SQL'
SELECT code, start_date::text, end_date::text FROM pathways.projects
UNION ALL
SELECT '~audit', (min(occurred_at) AT TIME ZONE 'UTC')::date::text, (max(occurred_at) AT TIME ZONE 'UTC')::date::text
FROM pathways.audit_logs
ORDER BY 1;
SQL
docker exec -i supabase_db_pathways psql -X -q -At -U postgres -d postgres < .tmp/defense-snapshot/dates.sql > .tmp/defense-snapshot/before.txt
cat .tmp/defense-snapshot/before.txt
```
Expected: 6 project rows plus one `~audit` row.

- [ ] **Step 6: Dump**

Run: `node scripts/db/defense-snapshot.mjs dump --identities .tmp/defense-identities-fixture.json`
Expected: `Dumped 77 tables (<n> rows) and <m> storage objects; seed day <today in Manila>, migration 0063_rules_scope_memo.` (or the latest directory in `apps/api/prisma/migrations`), with `<m>` around 75.

- [ ] **Step 7: Wipe and restore three days ahead**

```bash
docker exec -i supabase_db_pathways psql -v ON_ERROR_STOP=1 -X -q -U postgres -d postgres < infra/supabase/phase6/hosted-defense-demo-wipe.sql > /dev/null
PLUS3=$(node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date(Date.now()+3*864e5)))")
node scripts/db/defense-snapshot.mjs restore --test-local --identities .tmp/defense-identities-fixture.json --today "$PLUS3"
```
Expected: a warning that shifted timestamps reach a time after now (and a month warning if the 3 days cross a month), `dates shift by 3 day(s)`, the wipe KEEP/WIPE report, `Database restore committed.`, `Copied <m> storage object(s).`

- [ ] **Step 8: Check the shift**

```bash
docker exec -i supabase_db_pathways psql -X -q -At -U postgres -d postgres < .tmp/defense-snapshot/dates.sql > .tmp/defense-snapshot/after.txt
node - <<'JS'
const fs = require('node:fs')
const read = (f) => fs.readFileSync(`.tmp/defense-snapshot/${f}`, 'utf8').trim().split('\n')
const plus = (d) => (d ? new Date(Date.parse(`${d}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10) : d)
const before = read('before.txt')
const after = read('after.txt')
const bad = before.filter((line, i) => {
  const [code, a, b] = line.split('|')
  return after[i] !== [code, plus(a), plus(b)].join('|')
})
console.log(bad.length || before.length !== after.length ? `FAIL ${bad.join(' ; ')}` : `OK ${before.length} rows shifted by 3 days`)
JS
```
Expected: `OK 7 rows shifted by 3 days`.

- [ ] **Step 9: Prove an identity mismatch rolls back**

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('.tmp/defense-identities-fixture.json','utf8'));j.users[0].id=require('crypto').randomUUID();fs.writeFileSync('.tmp/defense-identities-tampered.json',JSON.stringify(j))"
node scripts/db/defense-snapshot.mjs restore --test-local --identities .tmp/defense-identities-tampered.json --skip-storage; echo "exit $?"
docker exec -i supabase_db_pathways psql -X -q -At -U postgres -d postgres < .tmp/defense-snapshot/dates.sql | diff - .tmp/defense-snapshot/after.txt && echo "unchanged"
```
Expected: psql `ERROR:  Target staff identities differ from the identities file`, `exit 1`, then `unchanged` (the shifted data is still there, so the TRUNCATE rolled back).

- [ ] **Step 10: Restore at delta 0, rerun storage alone, and verify**

```bash
docker exec -i supabase_db_pathways psql -v ON_ERROR_STOP=1 -X -q -U postgres -d postgres < infra/supabase/phase6/hosted-defense-demo-wipe.sql > /dev/null
node scripts/db/defense-snapshot.mjs restore --test-local --identities .tmp/defense-identities-fixture.json
node scripts/db/defense-snapshot.mjs storage --test-local
node scripts/db/defense-demo.mjs --test-local --verify
```
Expected: `dates shift by 0 day(s)`, no future-timestamp warning, `Database restore committed.`, two `Copied <m> storage object(s).` lines, and a verify table with no `ok: false` row (same checks as Step 4).

- [ ] **Step 11: Record the privilege outcome**

Append to `.tmp/defense-snapshot/rehearsal.txt`: "Restore ran as postgres (BYPASSRLS, non-superuser) with the wipe's temporary INHERIT memberships; INSERT into prisma, report_projection_owner and rules_store_owner tables succeeded without SET ROLE." If any owner group failed instead, stop and report to the controller; do not add `SET ROLE` without a spec update.

- [ ] **Step 12: Return the local stack to normal accounts**

Run: `pnpm db:local:reset`
Expected: "Local synthetic seed complete: 7 accounts (7 new)".

- [ ] **Step 13: Commit any fixes**

If Steps 2 to 10 needed code fixes, commit them with their tests:

```bash
git add scripts/db/defense-snapshot-*.mjs
git commit -m "Fix defense snapshot issues found in the local rehearsal"
```

---

### Task 7: Docs

**Files:**
- Create: `docs/cr-pathways-defense-seed-snapshot.md`
- Modify: `docs/runbook-defense-demo.md` (sections 2 and 3, new section 8)
- Modify: `docs/handoff-defense-demo-seed.md` (Constraints, first bullet)
- Modify: `docs/index.md` (section 1.6 table end, section 2 Change Log first row)
- Modify: `docs/activity-log.md` (append a section)

**Interfaces:**
- Consumes: `.tmp/defense-snapshot/rehearsal.txt` from Task 6 (counts, delta checks, verify result).
- Produces: documentation only.

- [ ] **Step 1: Write** `docs/cr-pathways-defense-seed-snapshot.md`

Fill `<rehearsal>` with one sentence from `rehearsal.txt` (tables, rows, objects, "+3 day shift exact on 7 rows, tampered identities rolled back, delta 0 restore then `--verify` clean").

```markdown
# Change Record: Defense Seed Snapshot Restore

**ID:** `cr-pathways-defense-seed-snapshot`  
**Date:** 2026-10-06  
**Status:** Approved (developer, 2026-10-06); local rehearsal passed; hosted restore pending (developer)

## 1. Trigger

The hosted devV2 reseed (`runbook-defense-demo.md` section 4) drives every service over the network for a long time and pauses twice for manual rules drains. Developer decision 2026-10-06 (`docs/superpowers/specs/2026-10-06-defense-seed-snapshot-design.md`): seed locally through the real services once and restore that data onto devV2.

## 2. Current Contract

`handoff-defense-demo-seed.md` forbids disabling triggers. The hosted reseed is the wipe file plus `defense-demo.mjs` against devV2; nothing copies data between databases.

## 3. Proposed Change

- `scripts/db/defense-snapshot.mjs` with `mirror`, `dump`, `restore` and `storage`, helpers in `scripts/db/defense-snapshot-*.mjs`, node built-ins only; `psql` and `pg_dump` run inside the local container `supabase_db_pathways`, and hosted URLs reach it by environment variable.
- `mirror` reads the devV2 organization and `system_users` (minus contact number and last sign-in) with role codes over `DIRECT_URL` into `.tmp/defense-identities.json`, runs the wipe locally and replaces the local organization, staff rows and auth users with those ids. No passwords or TOTP secrets are read.
- `dump` takes a data-only `pg_dump` of exactly the tables `hosted-defense-demo-wipe.sql` truncates, plus a manifest: seed day (Manila day of the first seeded audit row), latest migration, row counts, date and timestamp columns, and storage objects under the organization prefix.
- `restore` runs one transaction on devV2 as `postgres` (`HOSTED_ADMIN_URL`, since `prisma` cannot set `session_replication_role`): the wipe file up to its revoke, a migration check, an identity check, `SET LOCAL session_replication_role = replica`, each table copied into a temporary staging table, shifted there by (Manila restore day minus seed day) and inserted, a row-count check against the manifest, the wipe's revoke and COMMIT. Storage objects are then upserted to the same bucket and path with the service role key, media type parameters dropped.
- Exception to the handoff rule "never disable triggers": triggers are skipped only inside this restore transaction. The local seed keeps every trigger. RLS is never disabled: `postgres` has BYPASSRLS and the wipe's temporary INHERIT memberships give it owner privileges on `prisma`, `report_projection_owner` and `rules_store_owner` tables.

## 4. Impact

### Product
None at runtime; the restored rows are what the services produced locally.

### Data / Migration
No migration. Kept tables (organization, roles, permissions, role permissions, staff, step-up PINs, sign-in lockouts, rules catalogs) and `storage.objects` are never dumped or truncated. Dates inside JSON payloads (audit details, report snapshots, rule evaluation payloads) are not shifted. Alerts restore as captured; the hourly sweep may re-evaluate them. Old storage objects stay in place, as with the wipe.

### Authorization / Privacy
The restore URL must be `postgres` on the devV2 direct or pooler host. The identities file holds staff emails and names and stays under `.tmp/`; the tool prints counts only.

### API
None.

### UI
None.

### Tests
`scripts/db/defense-snapshot-parse.test.mjs`, `-dates`, `-target`, `-sql`, `-storage` and `-cli` suites (`node --test`), the shared parser in `defense-demo-wipe.test.mjs`, and the local rehearsal: <rehearsal>.

### Documentation
`runbook-defense-demo.md` section 8, `handoff-defense-demo-seed.md` constraints, `index.md`, `activity-log.md`.

## 5. Alternatives Considered

- Keep only the hosted service reseed (restraint option): correct but slow, with manual drains; it stays as the fallback (runbook section 4).
- Bulk SQL inserts: bypass the services that make the data realistic.
- Shift dates in place: three unique indexes contain dates (daily attendance, measurement periods, survey period releases), so rows can collide mid-statement, and a two-step offset breaks the `2100-12-31` period CHECK. Staging tables avoid both.
- `ALTER TABLE ... DISABLE TRIGGER` or `DISABLE ROW LEVEL SECURITY`: an aborted run could leave tables unprotected.

## 6. Migration / Rollback

Any error before COMMIT rolls back the whole database restore. After a bad commit, restore again from a good snapshot or fall back to runbook section 4. A failed storage copy is retried with the `storage` command.

## 7. Verification

- `node --test scripts/db/defense-snapshot-*.test.mjs scripts/db/defense-demo-wipe.test.mjs`
- Local rehearsal: <rehearsal>
- Hosted (developer): `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` with no failures.

## 8. Approval

Developer, 2026-10-06 (spec approved).

## 9. Disposition

Applied locally on `feature/defense-seed-snapshot`; hosted restore pending (developer).
```

- [ ] **Step 2: Update** `docs/runbook-defense-demo.md`

In the section 2 table, add after the `defense-demo.mjs` row:

```markdown
| `scripts/db/defense-snapshot.mjs` | Snapshot mirror, dump, restore and storage copy (section 8) |
```

In section 3, add after the `DIRECT_URL` bullet:

```markdown
- For the snapshot restore only (section 8): `HOSTED_ADMIN_URL` as `postgres`. Use session pooler hosts (user `<role>.klbtoqdalmcsfjqophty`) for it and for `DIRECT_URL`: the tool connects from the Docker container, which may not reach the IPv6-only direct host
```

Append at the end of the file:

```markdown
## 8. Snapshot restore (fast path)

Seeds locally through the real services once, then restores that data onto devV2 in one transaction with triggers skipped (`cr-pathways-defense-seed-snapshot`). It replaces steps 2 to 5 of section 4; step 7 still applies. Needs Docker with the local stack at the same migration as devV2.

1. `pnpm db:local:reset`
2. `node scripts/db/defense-snapshot.mjs mirror --env-file .tmp/defense-seed.env`: copies the devV2 organization, staff rows and auth user ids into the local stack and writes `.tmp/defense-identities.json`. Local sign-in for these accounts stays off until the next reset.
3. `pnpm db:defense:local`, then `node scripts/db/defense-demo.mjs --test-local --verify` with no failures.
4. `node scripts/db/defense-snapshot.mjs dump`: writes `.tmp/defense-snapshot/data.sql` and `manifest.json`.
5. Set GitHub variable `RULES_DISPATCH_ENABLED=false`. Optionally take a `pg_dump` backup.
6. `node scripts/db/defense-snapshot.mjs restore --env-file .tmp/defense-seed.env`: wipe, migration and identity checks, load with triggers skipped, date shift by (Manila restore day minus seed day), row-count check, commit, then the storage copy. Any database error rolls everything back. If only the storage copy fails, run the same command with `storage` instead of `restore`.
7. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` with no failures, then section 4 step 7.
8. `pnpm db:local:reset` to get the normal local accounts back.

Restore later in the clock day than the dump, or shifted timestamps from the last seed hours land after now (the tool warns). Seed and restore in the same month, since the import backdate is month-relative. Dates inside JSON payloads are not shifted.

Local rehearsal without hosted access: build an identities fixture with new ids from the local stack, then `mirror --identities <fixture>`, seed, `dump --identities <fixture>`, run the wipe and `restore --test-local --identities <fixture>`; `--today` (local only) simulates a later restore day.
```

- [ ] **Step 3: Update** `docs/handoff-defense-demo-seed.md`

Replace

```markdown
- No migrations, no API service edits unless a genuine product bug (report it instead), never disable triggers.
```

with

```markdown
- No migrations, no API service edits unless a genuine product bug (report it instead). Never disable triggers in the seed; the one exception is the snapshot restore step, which skips them with `SET LOCAL session_replication_role = replica` inside a single transaction (`cr-pathways-defense-seed-snapshot`).
```

- [ ] **Step 4: Update** `docs/index.md`

Append to the end of the section 1.6 table:

```markdown
| [Defense seed snapshot design](superpowers/specs/2026-10-06-defense-seed-snapshot-design.md) | 2026-10-06-defense-seed-snapshot-design.md | 2026-10-06 | Local service seed with mirrored devV2 identities, restored onto devV2 in one transaction with triggers skipped and dates shifted | Approved |
| [Defense seed snapshot plan](superpowers/plans/2026-10-06-defense-seed-snapshot.md) | 2026-10-06-defense-seed-snapshot.md | 2026-10-06 | Parsers, SQL builders, storage copy, CLI, local rehearsal and docs for the snapshot restore | Executed on feature branch; hosted restore pending |
```

Insert as the first row of the section 2 Change Log table (directly under `|---|---|---|---|`):

```markdown
| [cr-pathways-defense-seed-snapshot](cr-pathways-defense-seed-snapshot.md) | 2026-10-06 | Defense demo snapshot restore: local service seed with mirrored devV2 identities, data-only dump of the wipe tables, one-transaction restore on devV2 with triggers skipped (replica role), staged day shift and storage upsert; no migration | Approved; local rehearsal passed, hosted restore pending |
```

- [ ] **Step 5: Append to** `docs/activity-log.md`

```markdown

## 2026-10-06 Defense seed snapshot
- `scripts/db/defense-snapshot.mjs` (mirror, dump, restore, storage) restores a locally seeded defense workspace onto devV2 in one transaction: wipe up to its revoke, migration and identity checks, `session_replication_role = replica`, staged load with the day shift, row-count check, commit, then a storage upsert (cr-pathways-defense-seed-snapshot).
- Restore runs as `postgres` (`HOSTED_ADMIN_URL`) because `prisma` cannot set `session_replication_role`; RLS is bypassed by BYPASSRLS plus the wipe's temporary owner memberships, never disabled.
- Local rehearsal: <rehearsal>. Hosted restore pending (developer).
```

- [ ] **Step 6: Check the docs**

Run: `pnpm docs:check`
Expected: no FAIL lines for the touched files (every `--flag` in prose sits in backticks; no em-dashes).

- [ ] **Step 7: Commit**

```bash
git add docs/cr-pathways-defense-seed-snapshot.md docs/runbook-defense-demo.md docs/handoff-defense-demo-seed.md docs/index.md docs/activity-log.md
git commit -m "Document the defense seed snapshot restore"
```

---

## Developer checklist: hosted run (not an implementer task)

1. Local stack at the devV2 migration (`0063_rules_scope_memo` today): `pnpm db:local:reset`.
2. In `.tmp/defense-seed.env` add `HOSTED_ADMIN_URL` (role `postgres`, session pooler user `postgres.klbtoqdalmcsfjqophty`); make `DIRECT_URL` a session pooler URL too if the direct host is unreachable from Docker.
3. `node scripts/db/defense-snapshot.mjs mirror --env-file .tmp/defense-seed.env`
4. `pnpm db:defense:local`, then `node scripts/db/defense-demo.mjs --test-local --verify` (no failures).
5. `node scripts/db/defense-snapshot.mjs dump` (note the dump time; restore later in the clock day).
6. GitHub variable `RULES_DISPATCH_ENABLED=false`; optional `pg_dump` backup of devV2.
7. `node scripts/db/defense-snapshot.mjs restore --env-file .tmp/defense-seed.env`
8. `node scripts/db/defense-demo.mjs --env-file .tmp/defense-seed.env --verify` (no failures); if storage failed, `node scripts/db/defense-snapshot.mjs storage --env-file .tmp/defense-seed.env` first.
9. Re-enable dispatch if the scheduler is active; sign in once per role with TOTP; no Program Manager survey or SADDD view before step 8 passes.
10. `pnpm db:local:reset`; update the CR status to Applied with the hosted `--verify` result.

## Spec coverage

| Spec item | Task |
|---|---|
| Mirror identities (devV2 read, local write) | 3 (SQL), 5 (CLI), 6 (rehearsal) |
| Dump limited to wipe tables, manifest with seed day and storage list | 1, 3, 5 |
| One-transaction restore, replica role, wipe TRUNCATE, row-count postcondition | 1 (split), 3, 5, 6 |
| Date shift on date/timestamp columns, generated columns skipped, kept tables untouched | 3, 6 |
| Storage copy with upsert, storage schema never dumped | 4, 5, 6 |
| Guards: env-file rules, devV2-only restore, identity abort, dispatch reminder | 2, 3, 5 |
| Unit tests for parsing, shift SQL, guards | 1 to 5 |
| Local rehearsal with non-zero delta and `--verify` | 6 (two passes, see Decisions) |
| CR, runbook, handoff, activity log | 7 |
