# Replay Harness Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local migration replays parallel-safe, fast for single runtime-SQL checks, free of stale pre-baseline modes, and able to detect schema drift.

**Architecture:** `infra/supabase/phase6/Replay-Local.ps1` stays the full release gate; it gains a free-port picker and an optional saved template cluster. A new `Invoke-RuntimeSql.ps1` copies that template and runs one SQL file in seconds. The three pre-baseline-only replay modes are retired under a Change Record. A read-only drift script compares migrations against `schema.prisma`.

**Tech Stack:** PowerShell 7, native PostgreSQL 18 binaries (`initdb`, `pg_ctl`, `psql`), Prisma CLI, Node 24 `.mjs` scripts, Vitest.

**Spec:** Developer decision 2026-10-01 in session (steps 1-4 of the replay recommendation); baseline facts in `docs/runbook-migration-baseline.md`, `docs/qad-pathways.md` (QAD-T79, QAD-R07, line 371).

**Precondition:** Start only after `docs/superpowers/plans/2026-10-01-core-gap-closure.md` Task 7 has merged into `dev`, because that plan edits `Replay-Local.ps1`.

## Global Constraints

- Follow `CLAUDE.md`: concise code, one-sentence one-line comments, no emojis, kebab-case markdown.
- Never stage `docs/ui-ux-pathways-reference/manage-budget/` or `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/`.
- Implementation subagents run on Sonnet; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git identity `ceezey`.
- No migration files, no hosted database, no push.
- Every replay and runtime run binds `127.0.0.1` only, under the repository `.tmp/`, with synthetic data only.
- `-MigrationBaseline` must keep printing every `=PASS` marker it prints today; no assertion may be removed except those exclusive to retired modes.
- `-MigrationBaseline` sets `$CsvRbacRealignment` and `$ProjectActivityCreationRepair` to true (lines 13-14), so blocks guarded by those switches stay.
- Retired switches: `-Phase4IndicatorPolicy`, `-RuleBasedAccessAlignment`, `-DashboardHomeProjectScope` only.

## Review Focus

1. Removing a retired switch from a shared `-or` condition must not drop a block that `-MigrationBaseline` reaches through `$ProjectActivityCreationRepair`; Task 2 diffs the baseline PASS-marker list before and after.
2. Two replays started at the same moment must pick different ports; Task 1 tests concurrent `Get-FreeLoopbackPort` calls.
3. A template built from older migrations must be refused once migrations change; Task 3 tests the hash mismatch.
4. A failing runtime SQL file must make `Invoke-RuntimeSql.ps1` exit non-zero and still delete its copied cluster; Task 3 tests both.
5. The drift script must exit non-zero on a real mismatch, not only print it; Task 4 tests with a temporary schema edit.

---

### Task 1: Parallel-safe ports

**Files:**
- Create: `infra/supabase/phase6/replay-port.ps1`
- Create: `infra/supabase/phase6/replay-port.Tests.ps1`
- Modify: `infra/supabase/phase6/Replay-Local.ps1:3-11` (add `[int]$Port = 0`), `:37` (port assignment), `:56-57` (remove fixed-port probe)
- Modify: `infra/supabase/phase6/Verify-Forward.ps1` (same change if it hardcodes a port; check with `Select-String -Path infra/supabase/phase6/*.ps1 -Pattern '554\d\d'`)

**Interfaces:**
- Produces: `Get-FreeLoopbackPort` returning `[int]`; `Replay-Local.ps1 -Port <int>` optional.

- [ ] **Step 1: Write the failing Pester test**

```powershell
BeforeAll { . "$PSScriptRoot/replay-port.ps1" }
Describe 'Get-FreeLoopbackPort' {
  It 'returns a bindable loopback port' {
    $port = Get-FreeLoopbackPort
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    { $listener.Start() } | Should -Not -Throw
    $listener.Stop()
  }
  It 'returns different ports while the first is held' {
    $first = Get-FreeLoopbackPort
    $hold = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $first)
    $hold.Start()
    try { Get-FreeLoopbackPort | Should -Not -Be $first } finally { $hold.Stop() }
  }
}
```

- [ ] **Step 2: Run to fail**

Run: `pwsh -NoProfile -Command "Invoke-Pester infra/supabase/phase6/replay-port.Tests.ps1 -Output Detailed"`
Expected: FAIL, `Get-FreeLoopbackPort` not recognized. If Pester is missing, run `Install-Module Pester -Scope CurrentUser -MinimumVersion 5.5 -Force` only after asking the developer.

- [ ] **Step 3: Implement**

```powershell
# Returns an unused loopback port chosen by the operating system.
function Get-FreeLoopbackPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}
```

In `Replay-Local.ps1` add `[int]$Port = 0` to `param(...)`, dot-source `replay-port.ps1` after `$ErrorActionPreference`, replace line 37 with `$phase6Port = if ($Port -gt 0) { $Port } else { Get-FreeLoopbackPort }`, and keep the existing probe at lines 56-57 so an explicit busy `-Port` still fails fast. Print `REPLAY_PORT=$phase6Port` once after the cluster is ready.

- [ ] **Step 4: Run to pass, then two replays at once**

Run the Pester file; expected PASS. Then start two `-MigrationBaseline` replays in separate terminals within a few seconds; expected both exit 0 with different `REPLAY_PORT` values.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/phase6/replay-port.ps1 infra/supabase/phase6/replay-port.Tests.ps1 infra/supabase/phase6/Replay-Local.ps1 infra/supabase/phase6/Verify-Forward.ps1
git commit -m "fix(replay): choose a free loopback port so replays can run in parallel"
```

---

### Task 2: Retire pre-baseline replay modes

**Files:**
- Create: `docs/cr-pathways-replay-harness-modernization.md` (from `docs/change-record-template.md`, status Approved by developer 2026-10-01)
- Modify: `infra/supabase/phase6/Replay-Local.ps1` (remove the three switches and branches exclusive to them)
- Modify: `docs/qad-pathways.md`, `docs/runbook-migration-baseline.md`, `docs/index.md`, `docs/activity-log.md`

**Interfaces:**
- Consumes: Task 1's `Replay-Local.ps1`.
- Produces: `Replay-Local.ps1` with switches `-ProjectActivityCreationRepair`, `-CsvRbacRealignment`, `-MigrationBaseline`, `-Port`, `-PostgresBin` (and `-SaveTemplate` after Task 3).

- [ ] **Step 1: Capture the baseline marker list before changing anything**

Run: `pwsh -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline | Select-String '=PASS' | Sort-Object | Set-Content .tmp/markers-before.txt`
Expected: exit 0.

- [ ] **Step 2: Write the Change Record**

Sections per template; the change: no hosted database traverses the pre-baseline 0021-0024 upgrade path because every target is built from `0000_pathways_baseline_through_0026`; the archived history and its integrity check (`scripts/migrations/history.py --extract`) remain; the three switches are removed; rollback is `git revert`.

- [ ] **Step 2b: Preserve the Phase 4 policy assertions**

`apps/api/prisma/tests/project-indicator-dashboard-runtime.sql` lines 172-206 run only inside `\if :{?PHASE4_INDICATOR_POLICY}`, which only `-Phase4IndicatorPolicy` sets (`Replay-Local.ps1:515-517`). Before removing that switch, set `\set PHASE4_INDICATOR_POLICY 1` for `-MigrationBaseline` too and run it; if the assertions pass on the current schema, keep them in the baseline path; if any fail because the 0021-era policy no longer applies, delete only those assertions and name each in the Change Record.

- [ ] **Step 2c: Record coverage the historical modes no longer run**

Since core-gap closure (dev after `0bfd5fe`), the block gated by `if (-not $CsvRbacRealignment -and -not ($Phase4IndicatorPolicy -or $RuleBasedAccessAlignment -or $DashboardHomeProjectScope -or $ProjectActivityCreationRepair))` skips the feature-read and c8 vitest suites in those four modes, and dashboard-home vitest runs only under `-MigrationBaseline`; list each skipped suite per mode in the Change Record. Also note that the current-schema suites seed with `session_replication_role = replica`, so write-path trigger coverage is not exercised there.

- [ ] **Step 3: Remove the switches**

Delete `$Phase4IndicatorPolicy`, `$RuleBasedAccessAlignment`, `$DashboardHomeProjectScope` from `param(...)`. For every condition that names them: if the condition also names `$ProjectActivityCreationRepair` or `$CsvRbacRealignment`, delete only the retired names from the `-or` list; if it names only retired switches, delete the whole branch, including the `elseif` count replacements at the postflight (`=22`, `=23`, `=24`). Keep every block reachable from `-MigrationBaseline`.

- [ ] **Step 4: Prove nothing reachable was lost**

Run Step 1's command again into `.tmp/markers-after.txt`, then `Compare-Object (Get-Content .tmp/markers-before.txt) (Get-Content .tmp/markers-after.txt)`.
Expected: no output, and replay exit 0. Then flip one assertion in `apps/api/prisma/tests/project-indicator-dashboard-runtime.sql`, confirm a non-zero exit, revert.

- [ ] **Step 5: Docs and commit**

Update QAD-T79/QAD-R07 wording and the runbook command list to the remaining switches; register the CR in `docs/index.md`; add an activity-log bullet.

```bash
git add infra/supabase/phase6/Replay-Local.ps1 docs/cr-pathways-replay-harness-modernization.md docs/qad-pathways.md docs/runbook-migration-baseline.md docs/index.md docs/activity-log.md
git commit -m "chore(replay): retire pre-baseline replay modes under change record"
```

---

### Task 3: Saved template and fast runtime-SQL runner

**Files:**
- Modify: `infra/supabase/phase6/Replay-Local.ps1` (add `[switch]$SaveTemplate`)
- Create: `infra/supabase/phase6/Invoke-RuntimeSql.ps1`
- Create: `infra/supabase/phase6/Invoke-RuntimeSql.Tests.ps1`
- Create: `infra/supabase/phase6/migrations-hash.ps1`
- Modify: `docs/runbook-local-dev.md`, `docs/qad-pathways.md` (line 371 command table)

**Interfaces:**
- Consumes: `Get-FreeLoopbackPort` (Task 1); `$phase6Data`, `$phase6Database`, `$phase6Tools` in `Replay-Local.ps1`.
- Produces: `.tmp/pathways-replay-template/` containing `data/` (stopped cluster) and `manifest.json` `{ "migrationsHash": "<sha256>", "database": "pathways_phase4_phase6_replay", "createdAt": "<iso>" }`; `Get-MigrationsHash` returning a lowercase hex string; `Invoke-RuntimeSql.ps1 -File <path> [-PostgresBin <dir>]`.

- [ ] **Step 1: Hash helper**

```powershell
# Returns one SHA-256 over every migration file path and content in sorted order.
function Get-MigrationsHash([string]$Root) {
  $dir = Join-Path $Root 'apps/api/prisma/migrations'
  $sha = [Security.Cryptography.SHA256]::Create()
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File | Sort-Object { $_.FullName.Substring($dir.Length).Replace('\','/') }
  foreach ($f in $files) {
    $name = [Text.Encoding]::UTF8.GetBytes($f.FullName.Substring($dir.Length).Replace('\','/'))
    [void]$sha.TransformBlock($name, 0, $name.Length, $null, 0)
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    [void]$sha.TransformBlock($bytes, 0, $bytes.Length, $null, 0)
  }
  [void]$sha.TransformFinalBlock(@(), 0, 0)
  return ([BitConverter]::ToString($sha.Hash) -replace '-','').ToLowerInvariant()
}
```

- [ ] **Step 2: Write the failing runner tests**

```powershell
BeforeAll {
  $root = (Resolve-Path "$PSScriptRoot/../../..").Path
  $runner = Join-Path $PSScriptRoot 'Invoke-RuntimeSql.ps1'
  $ok = Join-Path $root '.tmp/runtime-ok.sql'
  $bad = Join-Path $root '.tmp/runtime-bad.sql'
  Set-Content $ok 'SELECT 1;'
  Set-Content $bad "DO `$`$ BEGIN RAISE EXCEPTION 'expected failure'; END `$`$;"
}
Describe 'Invoke-RuntimeSql' {
  It 'passes a good file and cleans up' {
    pwsh -NoProfile -File $runner -File $ok | Out-Null
    $LASTEXITCODE | Should -Be 0
    (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-runtime-*').Count | Should -Be 0
  }
  It 'fails a bad file and still cleans up' {
    pwsh -NoProfile -File $runner -File $bad | Out-Null
    $LASTEXITCODE | Should -Not -Be 0
    (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-runtime-*').Count | Should -Be 0
  }
  It 'refuses a stale template' {
    $manifest = Join-Path $root '.tmp/pathways-replay-template/manifest.json'
    $saved = Get-Content $manifest -Raw
    try {
      ($saved | ConvertFrom-Json | ForEach-Object { $_.migrationsHash = 'stale'; $_ } | ConvertTo-Json) | Set-Content $manifest
      pwsh -NoProfile -File $runner -File $ok | Out-Null
      $LASTEXITCODE | Should -Not -Be 0
    } finally { Set-Content $manifest $saved -NoNewline }
  }
}
```

- [ ] **Step 3: Add `-SaveTemplate` to the replay**

At the success point (just before `$phase6Exit = 0`), when `$SaveTemplate` is set: stop the cluster with the existing `pg_ctl ... stop` call, set `$phase6Started = $false`, replace `.tmp/pathways-replay-template/data` with a copy of `$phase6Data` (`Copy-Item -Recurse`), remove `postmaster.pid` from the copy, and write `manifest.json` with `Get-MigrationsHash`. Print `REPLAY_TEMPLATE_SAVED=PASS`. The existing cleanup still deletes the run directory.

- [ ] **Step 4: Write the runner**

```powershell
param([Parameter(Mandatory)][string]$File, [string]$PostgresBin)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/replay-port.ps1"
. "$PSScriptRoot/migrations-hash.ps1"
$root = (Resolve-Path "$PSScriptRoot/../../..").Path
$template = Join-Path $root '.tmp/pathways-replay-template'
$manifest = Get-Content (Join-Path $template 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.migrationsHash -ne (Get-MigrationsHash $root)) { throw 'Template is stale; rerun Replay-Local.ps1 -MigrationBaseline -SaveTemplate.' }
if (-not $PostgresBin) { $PostgresBin = if ($env:OS -eq 'Windows_NT') { 'C:\Program Files\PostgreSQL\18\bin' } else { '/usr/lib/postgresql/18/bin' } }
$ext = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
$run = Join-Path $root ('.tmp/pathways-runtime-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $run 'data'
$port = Get-FreeLoopbackPort
$started = $false
$exit = 1
try {
  New-Item -ItemType Directory -Path $run | Out-Null
  Copy-Item -Recurse (Join-Path $template 'data') $data
  Add-Content (Join-Path $data 'postgresql.conf') "`nport=$port`n"
  & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -l (Join-Path $run 'postgres.log') -w -s start
  if ($LASTEXITCODE -ne 0) { throw 'Runtime cluster start failed.' }
  $started = $true
  & (Join-Path $PostgresBin "psql$ext") -X -w -q -h 127.0.0.1 -p $port -U postgres -d $manifest.database -v ON_ERROR_STOP=1 -f $File
  if ($LASTEXITCODE -ne 0) { throw "Runtime SQL failed: $File" }
  Write-Output 'RUNTIME_SQL=PASS'
  $exit = 0
} catch {
  Write-Output ('RUNTIME_SQL=FAILED; ' + $_.Exception.Message)
} finally {
  if ($started) { & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -m fast -w -s stop }
  if ((Split-Path $run -Leaf) -match '^pathways-runtime-[a-f0-9]{32}$') { Remove-Item -LiteralPath $run -Recurse -Force }
}
exit $exit
```

If a runtime SQL file's database-name guard rejects `pathways_phase4_phase6_replay`, run it inside the replay instead and list it in the runbook as replay-only.

- [ ] **Step 5: Build the template and run tests to pass**

Run: `pwsh -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate`, then the Pester file. Expected: all three tests PASS. Then time one real file: `Measure-Command { pwsh -File infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File apps/api/prisma/tests/finance-expense-runtime.sql }`; record the seconds.

- [ ] **Step 6: Docs and commit**

Runbook: the two-command workflow (save template once per migration change, run any runtime file fast) and that the full replay remains the merge gate. QAD line 371 table: add the runner command.

```bash
git add infra/supabase/phase6 docs/runbook-local-dev.md docs/qad-pathways.md
git commit -m "feat(replay): saved template cluster and fast single-file runtime SQL runner"
```

---

### Task 4: Schema drift check

**Files:**
- Create: `scripts/db/schema-drift.mjs`
- Create: `scripts/db/schema-drift.test.mjs`
- Modify: `package.json` (script `db:drift`), `docs/runbook-migration-baseline.md`, `docs/runbook-role-staging-build.md`

**Interfaces:**
- Consumes: Prisma CLI `migrate diff`; a disposable shadow database URL from `PATHWAYS_SHADOW_DATABASE_URL` (loopback only).
- Produces: `pnpm db:drift` exiting 0 on no drift, 2 on drift, 1 on error.

- [ ] **Step 1: Write the failing test**

```js
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { assertLoopback, classify } from './schema-drift.mjs'

test('refuses non-loopback shadow URLs', () => {
  assert.throws(() => assertLoopback('postgresql://u:p@db.example.com:5432/x'))
  assert.doesNotThrow(() => assertLoopback('postgresql://u:p@127.0.0.1:55001/x'))
})

test('maps prisma exit codes', () => {
  assert.equal(classify(0), 'clean')
  assert.equal(classify(2), 'drift')
  assert.equal(classify(1), 'error')
})
```

- [ ] **Step 2: Run to fail**

Run: `node --test scripts/db/schema-drift.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// Compares the migration chain with schema.prisma using a loopback shadow database.
import { spawnSync } from 'node:child_process'

export function assertLoopback(url) {
  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error('shadow database must be loopback')
}

export const classify = (code) => (code === 0 ? 'clean' : code === 2 ? 'drift' : 'error')

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('schema-drift.mjs')) {
  const shadow = process.env.PATHWAYS_SHADOW_DATABASE_URL
  if (!shadow) throw new Error('set PATHWAYS_SHADOW_DATABASE_URL to a disposable loopback database')
  assertLoopback(shadow)
  const r = spawnSync('pnpm', ['--filter', '@pathways/api', 'exec', 'prisma', 'migrate', 'diff',
    '--from-migrations', 'prisma/migrations', '--to-schema-datamodel', 'prisma/schema.prisma',
    '--shadow-database-url', shadow, '--exit-code'], { stdio: 'inherit', shell: process.platform === 'win32' })
  console.log(`SCHEMA_DRIFT=${classify(r.status).toUpperCase()}`)
  process.exit(r.status ?? 1)
}
```

Check the installed Prisma version's flag names with `pnpm --filter @pathways/api exec prisma migrate diff --help` and adjust the flags if they differ; if the baseline's raw SQL (roles, RLS, functions) makes `migrate diff` report non-model objects, add `--script` output to `.tmp/schema-drift.sql` and document which object classes Prisma ignores.

- [ ] **Step 4: Run to pass and prove it detects drift**

Run the unit test (PASS). Start a disposable cluster with `Get-FreeLoopbackPort` or reuse the template runner's cluster, then `pnpm db:drift`; expected `SCHEMA_DRIFT=CLEAN` or a documented list of known non-model differences. Add a temporary unused field to `schema.prisma`, rerun, expect exit 2 and `SCHEMA_DRIFT=DRIFT`, revert.

- [ ] **Step 5: Hosted comparison procedure (documentation only)**

Add to `docs/runbook-role-staging-build.md`: after a staging apply, the developer runs `pg_dump --schema-only --no-owner --no-privileges` against staging and against a fresh local replay template, then diffs the two files; any difference is drift and blocks marking Change Records Applied. The agent never connects to staging.

- [ ] **Step 6: Commit**

```bash
git add scripts/db/schema-drift.mjs scripts/db/schema-drift.test.mjs package.json docs/runbook-migration-baseline.md docs/runbook-role-staging-build.md
git commit -m "feat(db): schema drift check between migrations and Prisma schema"
```

---

## Execution Map

| Lane | Tasks | Mode |
|---|---|---|
| A | Task 1, then Task 2, then Task 3 | Sequence (all edit `Replay-Local.ps1`; Task 3 consumes Task 1's port helper) |
| B | Task 4 | Parallel with lane A |
| Final | Whole-branch review, merge into `dev`, ask before push | After A and B |
