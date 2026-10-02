# Core Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six gaps left after the 2026-10-01 core-feature integration (dev 21022d5) before any staging apply.

**Architecture:** Four independent lanes run in parallel on their own branches cut from `dev`; one two-task lane runs in sequence because Task 4 consumes the lockout table Task 3 proves; Task 7 integrates everything into `dev` through one integration branch.

**Tech Stack:** NestJS API (`apps/api`), Next.js web (`apps/web`), Prisma migrations + raw SQL (`apps/api/prisma/migrations`), Supabase local stack, PowerShell replay harness (`infra/supabase/phase6/Replay-Local.ps1`), Vitest, Playwright, Biome.

**Spec:** `docs/audit-pathways-core-features-qa-20261001.md`, `docs/prd-pathways.md` (G-F1-10, G-F2-15, G-F2-18, G-F8-7, NFR-3), `docs/cr-pathways-signin-lockout.md`, `docs/cr-pathways-performance-scaling.md`, `docs/ui-ux-pathways-reference/pathways-color-foundations.md`.

## Global Constraints

- Follow `CLAUDE.md`: concise code, one-sentence one-line comments, no emojis, kebab-case markdown.
- Never stage `docs/ui-ux-pathways-reference/manage-budget/` or `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/`.
- Implementation subagents run on Sonnet; reviewers keep their defined models.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git identity `ceezey`.
- No push, no hosted database apply, no Supabase dashboard change by an agent; those are developer-gated.
- Only one new migration in this plan: `0052_signin_password_hook` (Task 4), predecessor `0051_indicator_library`.
- New QAD IDs are reserved per task to avoid collisions: Task 1 none, Task 2 `QAD-T84`, `QAD-T85`, Task 3 `QAD-T86`, Task 4 `QAD-A25`, Task 5 `QAD-T87` (and rewrite `QAD-T62`), Task 6 `QAD-T88`.
- Performance target is NFR-3: p95 under 800 ms for normal pages, imports excluded.
- Synthetic data only; never print secret-bearing URLs.
- Contrast colors in Task 6 use the recommended options and must be confirmed by the developer before Task 7 merges them.

## Review Focus

1. A replay mode silently skipping its test file instead of failing would hide regressions; Task 1 must prove the replay exits non-zero on a deliberately broken assertion.
2. Concurrent duplicate expense submits with the same request id must return one row, not two; Task 2 includes a two-session check through the existing concurrency script pattern.
3. A locked user who then enters the correct password must still be refused until the window expires; Task 3 tests this in the browser.
4. The password-verification hook must fail closed for a known locked email but must not lock or reveal unknown emails; Task 4 tests both.
5. Dashboard p95 measured on a warm cache only would overstate performance; Task 5 records cold first request and warm p95 separately.

---

## Execution Map

| Lane | Tasks | Mode | Branch |
|---|---|---|---|
| A | Task 1 replay failure | Parallel | `fix/indicator-policy-replay` |
| B | Task 2 finance runtime tests | Parallel | `test/finance-expense-runtime` |
| C | Task 3 then Task 4 | Sequence (Task 4 consumes Task 3's verified lockout path) | `feat/signin-lockout-hardening` |
| D | Task 5 dashboard load | Parallel | `perf/g-f8-7-dashboard-load` |
| E | Task 6 contrast tokens | Parallel | `fix/foundation-contrast` |
| Handoff | Developer enables the staging password-verification hook (Task 4 Step 8) | Developer | none |
| F | Task 7 integration | After A to E | `integrate/core-gap-closure` |

Lanes A, B and C all edit `infra/supabase/phase6/Replay-Local.ps1`; each adds its own switch block only, and Task 7 resolves the merge.

---

### Task 1: Indicator-policy replay failure

**Files:**
- Modify: `infra/supabase/phase6/Replay-Local.ps1:176-200` and `:477-495` (the `-Phase4IndicatorPolicy` path)
- Possibly modify: `apps/api/src/modules/activities/feature-read.local.test.ts`
- Test: the replay itself

**Interfaces:**
- Consumes: nothing.
- Produces: `Replay-Local.ps1 -Phase4IndicatorPolicy` exits 0 on `dev`.

Known facts: `-Phase4IndicatorPolicy` replays historical migrations from `$phase6History` (pre-baseline, up to `0021_project_manager_indicator_access`) and then runs `feature-read.local.test.ts`, which is written against the current schema. `projects.implementing_partners` is a column in the 0000 baseline and is superseded by `pathways.project_implementing_partners` in 0030. The failure `projects.implementing_partners does not exist` therefore most likely means the historical-mode database never has that column while the current test reads it.

- [ ] **Step 1: Reproduce**

Run: `pwsh -File infra/supabase/phase6/Replay-Local.ps1 -Phase4IndicatorPolicy 2>&1 | Tee-Object $env:TEMP\p4.log`
Expected: FAIL in `feature-read.local.test.ts` with `projects.implementing_partners does not exist`. Record the failing query and the test name.

- [ ] **Step 2: Locate the reader**

Run: `git grep -n "implementing_partners" -- apps/api/src apps/api/prisma/tests`
Identify which statement in `feature-read.local.test.ts` (or code it calls) reads the legacy column.

- [ ] **Step 3: Decide the fix using this rule**

If the test exercises current behavior, it does not belong in a historical replay: gate it out of historical modes by changing the condition at the `feature-read.local.test.ts` call to:

```powershell
  if (-not $CsvRbacRealignment -and -not ($Phase4IndicatorPolicy -or $RuleBasedAccessAlignment -or $DashboardHomeProjectScope)) {
```

If instead the historical mode is meant to reach the current schema, append the remaining migrations before the test, as the other modes do with `prisma migrate deploy --config $phase6Config` after copying `apps/api/prisma/migrations/*` into `$phase6Stage`. Choose the first option unless `git log -S"Phase4IndicatorPolicy" -- infra/supabase/phase6/Replay-Local.ps1` shows the mode was deliberately extended to current schema.

- [ ] **Step 4: Prove the replay fails when it should**

Temporarily change one assertion in `apps/api/prisma/tests/project-indicator-dashboard-runtime.sql` to compare against a wrong value, run the replay, and confirm a non-zero exit. Revert the change.

- [ ] **Step 5: Run all replay modes that share this block**

Run each: `-Phase4IndicatorPolicy`, `-RuleBasedAccessAlignment`, `-DashboardHomeProjectScope`, `-ProjectActivityCreationRepair`, `-MigrationBaseline`.
Expected: each exits 0 and prints its `=PASS` markers.

- [ ] **Step 6: Record and commit**

Append to `docs/activity-log.md`: date, root cause in one sentence, chosen fix, modes run.

```bash
git add infra/supabase/phase6/Replay-Local.ps1 apps/api/src/modules/activities/feature-read.local.test.ts docs/activity-log.md
git commit -m "fix(replay): run current-schema feature-read test only in current-schema modes"
```

---

### Task 2: Expense replay and once-per-expense sign-off runtime tests

**Files:**
- Create: `apps/api/prisma/tests/finance-expense-runtime.sql`
- Modify: `infra/supabase/phase6/Replay-Local.ps1` (run the new file in `-MigrationBaseline`)
- Modify: `docs/qad-pathways.md` (QAD-T45, QAD-T48 evidence; add QAD-T84, QAD-T85), `docs/prd-pathways.md` (G-F2-15, G-F2-18 cells)

**Interfaces:**
- Consumes: `pathways.p34_submit_expense(wanted_project uuid, request_id uuid, budget_id uuid, expense_description text, expense_amount numeric, on_date date) RETURNS jsonb` (0034 line 693); table `pathways.expense_signoffs` with `PRIMARY KEY(organization_id, project_id, expense_id)` and trigger `p34_guard_signoff`.
- Produces: `finance-expense-runtime.sql` printing `FINANCE_EXPENSE_RUNTIME=PASS`.

- [ ] **Step 1: Copy the fixture header**

Start the new file from the guard, `pg_temp.u`, `pg_temp.ok` and `pg_temp.reject` helpers at the top of `apps/api/prisma/tests/finance-evaluation-decisions.sql` (lines 1-40), then copy that file's organization, user, project, budget and role-grant fixture inserts. Adjust the database-name guard to the name the `-MigrationBaseline` replay uses (read it from `Replay-Local.ps1`).

- [ ] **Step 2: Write the failing replay assertions**

```sql
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(11)::text)::text, true);
CREATE TEMP TABLE first_submit AS
 SELECT pathways.p34_submit_expense(pg_temp.u(301), pg_temp.u(901), pg_temp.u(401), 'Venue', 1500.00, DATE '2026-09-30') AS r;
CREATE TEMP TABLE second_submit AS
 SELECT pathways.p34_submit_expense(pg_temp.u(301), pg_temp.u(901), pg_temp.u(401), 'Venue', 1500.00, DATE '2026-09-30') AS r;
SELECT pg_temp.ok((SELECT r->>'id' FROM first_submit) = (SELECT r->>'id' FROM second_submit), 'expense replay returns same id');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.budget_expense_entries WHERE project_id = pg_temp.u(301)) = 1, 'expense replay writes one row');
SELECT pg_temp.reject($q$SELECT pathways.p34_submit_expense('00000000-0000-4000-8000-000000000301'::uuid,'00000000-0000-4000-8000-000000000901'::uuid,'00000000-0000-4000-8000-000000000401'::uuid,'Venue',9999.00,DATE '2026-09-30')$q$, '23505', 'same request id with different input is rejected');
```

Match the claim-setting call to how `finance-evaluation-decisions.sql` establishes the actor; the `set_config` line above is the pattern to replace if it differs. Match the conflict SQLSTATE to what `p34_submit_expense` raises (read lines 693-720).

- [ ] **Step 3: Write the failing sign-off assertions**

Approve the expense through `pathways.p34_review_expense` exactly as `finance-evaluation-decisions.sql` does, then:

```sql
INSERT INTO pathways.expense_signoffs(organization_id, project_id, expense_id, signed_off_by_id)
 VALUES (pg_temp.u(1), pg_temp.u(301), ((SELECT r->>'id' FROM first_submit))::uuid, pg_temp.u(12));
SELECT pg_temp.reject($q$INSERT INTO pathways.expense_signoffs(organization_id,project_id,expense_id,signed_off_by_id) VALUES ('00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000301'::uuid,(SELECT (r->>'id')::uuid FROM first_submit),'00000000-0000-4000-8000-000000000012'::uuid)$q$, '23505', 'second sign-off rejected');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.expense_signoffs WHERE project_id = pg_temp.u(301)) = 1, 'one sign-off per expense');
RESET ROLE;
SELECT CASE WHEN count(*) = 5 THEN 'FINANCE_EXPENSE_RUNTIME=PASS' END FROM phase3_assertions;
ROLLBACK;
```

User `u(12)` must hold `expenses.signoff` in the fixture; if the guard trigger raises a different SQLSTATE before the key, use that code. Set the final `count(*) = N` to the number of `ok` and `reject` calls that record into `phase3_assertions` (check whether `pg_temp.reject` inserts a row).

- [ ] **Step 4: Wire into the replay and run it to see it fail**

Add after the existing runtime-SQL invocations in the `-MigrationBaseline` block, following the same `psql ... -v ON_ERROR_STOP=1 -f` call and `=PASS` check those lines use.
Run: `pwsh -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline`
Expected: first run surfaces any fixture mismatch; fix fixtures until the only failures are real.

- [ ] **Step 5: Run to pass**

Expected: `FINANCE_EXPENSE_RUNTIME=PASS` and replay exit 0.

- [ ] **Step 6: Concurrency check**

Extend `apps/api/prisma/tests/finance-evaluation-decisions-concurrency.mjs` with one case: two sessions call `p34_submit_expense` with the same request id simultaneously; assert one row. Run it the way its header comment documents.

- [ ] **Step 7: Docs and commit**

QAD-T45 and QAD-T48 evidence cite `finance-expense-runtime.sql`; add QAD-T84 (replay conflict, Sad) and QAD-T85 (duplicate sign-off, Abuse); update the PRD G-F2-15 and G-F2-18 cells.

```bash
git add apps/api/prisma/tests/finance-expense-runtime.sql apps/api/prisma/tests/finance-evaluation-decisions-concurrency.mjs infra/supabase/phase6/Replay-Local.ps1 docs/qad-pathways.md docs/prd-pathways.md
git commit -m "test(finance): runtime replay and once-per-expense sign-off checks"
```

---

### Task 3: Sign-in route end to end

**Files:**
- Create: `apps/web/e2e/signin-lockout.spec.ts`
- Modify: `apps/api/src/modules/auth/signin-lockout.service.ts` only if the run exposes a bug
- Modify: `docs/qad-pathways.md` (add QAD-T86), `docs/cr-pathways-signin-lockout.md` (verification section)

**Interfaces:**
- Consumes: `POST /auth/sign-in` returning `401` on bad credentials and `429 { code: "SIGN_IN_LOCKED" }` when locked; threshold 5 failures in 15 minutes, lock 15 minutes.
- Produces: proof that the API path works against the real local stack; the lockout constants Task 4 must reuse.

- [ ] **Step 1: Start the stack**

```bash
pnpm db:local:start
```
```bash
pnpm db:local:reset
```
```bash
pnpm dev:local
```

- [ ] **Step 2: Write the failing API probe**

```ts
import { expect, test } from '@playwright/test'

const api = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000'
const email = 'lockout-probe@example.test'

test('five failures lock and the correct password is still refused', async ({ request, page }) => {
  for (let i = 0; i < 5; i++) {
    const r = await request.post(`${api}/auth/sign-in`, { data: { email, password: 'wrong-password' } })
    expect(r.status()).toBe(401)
  }
  const locked = await request.post(`${api}/auth/sign-in`, { data: { email, password: 'wrong-password' } })
  expect(locked.status()).toBe(429)
  expect((await locked.json()).code).toBe('SIGN_IN_LOCKED')

  await page.goto('http://127.0.0.1:3000/staff/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill('wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/locked|too many/i)).toBeVisible()
})

test('unknown and known emails get the same failure response', async ({ request }) => {
  const a = await request.post(`${api}/auth/sign-in`, { data: { email: 'nobody@example.test', password: 'x' } })
  const b = await request.post(`${api}/auth/sign-in`, { data: { email: 'lockout-probe-2@example.test', password: 'x' } })
  expect(a.status()).toBe(b.status())
  expect(await a.text()).toBe(await b.text())
})
```

Create `lockout-probe@example.test` and `lockout-probe-2@example.test` as synthetic users in the local stack through the seed helper the reset uses (`apps/api/prisma/canonical-seed.ts` pattern); never use a seeded role account, so the demo accounts are not locked. Record any generated password only in `.tmp/local-seed/`.

- [ ] **Step 3: Run it**

Run: `pnpm --filter @pathways/web exec playwright test e2e/signin-lockout.spec.ts --config ../../playwright.config.ts`
Expected: if it fails, debug with superpowers:systematic-debugging; fix only the defect found and add a unit test for it in `signin-lockout.test.ts`.

- [ ] **Step 4: Expiry check**

Add a third test that sets the probe user's lockout row `locked_until` into the past through the local owner connection (as the runtime SQL tests do), then signs in with the correct password and expects `200`.

- [ ] **Step 5: Docs and commit**

Add QAD-T86 (end-to-end lockout on local stack); record the run in the CR verification section.

```bash
git add apps/web/e2e/signin-lockout.spec.ts docs/qad-pathways.md docs/cr-pathways-signin-lockout.md
git commit -m "test(auth): end-to-end sign-in lockout on the local stack"
```

---

### Task 4: Close the direct-Supabase lockout bypass

**Files:**
- Create: `apps/api/prisma/migrations/0052_signin_password_hook/migration.sql`
- Create: `apps/api/prisma/tests/signin-password-hook-runtime.sql`
- Modify: `supabase/config.toml` (`[auth.hook.password_verification_attempt]`)
- Modify: migration inventories exactly as the integration did for 0046-0051: `scripts/db/hosted-plan.mjs`, `scripts/db/hosted-plan.test.mjs`, `scripts/db/hosted-build*.mjs`, `apps/api/prisma/legacy-retirement.test.ts`, `infra/supabase/phase6/Verify-Forward.ps1`, `docs/runbook-role-staging-build.md`, `docs/sdd-pathways.md`
- Modify: `docs/cr-pathways-signin-lockout.md`, `docs/qad-pathways.md` (QAD-A25)

**Interfaces:**
- Consumes: the 0046 lockout table and its hashed-email key (read `0046_signin_lockout/migration.sql` for the exact table and column names), threshold and window constants confirmed by Task 3.
- Produces: `pathways.p52_password_verification_attempt(event jsonb) RETURNS jsonb`, executable only by `supabase_auth_admin`.

Supabase calls the password-verification-attempt hook after each password check with `{ user_id, valid }`; returning `{ "decision": "reject", "message": "...", "should_logout_user": false }` refuses the attempt. This is the supported way to enforce lockout on direct `grant_type=password` calls.

- [ ] **Step 1: Write the failing runtime test**

```sql
\set ON_ERROR_STOP on
BEGIN;
-- Reuse the guard and pg_temp.ok helper from finance-expense-runtime.sql lines 1-20.
INSERT INTO auth.users(id, email) VALUES ('00000000-0000-4000-8000-000000000501', 'hook-probe@example.test');
-- Lock the probe the same way the API does: insert the 0046 row with locked_until in the future.
SELECT pg_temp.ok(
 (pathways.p52_password_verification_attempt(json_build_object('user_id','00000000-0000-4000-8000-000000000501','valid',true)::jsonb)->>'decision') = 'reject',
 'locked user rejected even with valid password');
-- Clear the lock row and assert decision is continue.
SELECT pg_temp.ok(
 (pathways.p52_password_verification_attempt(json_build_object('user_id','00000000-0000-4000-8000-000000000501','valid',true)::jsonb)->>'decision') = 'continue',
 'unlocked valid password continues');
SELECT CASE WHEN count(*) = 2 THEN 'SIGNIN_PASSWORD_HOOK_RUNTIME=PASS' END FROM phase3_assertions;
ROLLBACK;
```

Write the lock-row insert and delete lines against the real 0046 column names.

- [ ] **Step 2: Write the migration**

```sql
-- Predecessor guard.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '0051_indicator_library' AND finished_at IS NOT NULL) THEN
  RAISE EXCEPTION '0052 requires 0051';
 END IF;
END $$;

-- Supabase password hook that enforces the API sign-in lockout on direct password grants.
CREATE FUNCTION pathways.p52_password_verification_attempt(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 wanted_email text;
 is_locked boolean;
BEGIN
 SELECT lower(u.email) INTO wanted_email FROM auth.users u WHERE u.id = (event->>'user_id')::uuid;
 SELECT EXISTS (
  SELECT 1 FROM pathways.signin_lockouts l
  WHERE l.identifier_hash = encode(extensions.digest(wanted_email, 'sha256'), 'hex')
    AND l.locked_until > now()
 ) INTO is_locked;
 IF is_locked THEN
  RETURN jsonb_build_object('decision', 'reject', 'message', 'Sign-in is temporarily locked.', 'should_logout_user', false);
 END IF;
 RETURN jsonb_build_object('decision', 'continue');
END $$;

REVOKE ALL ON FUNCTION pathways.p52_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA pathways TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION pathways.p52_password_verification_attempt(jsonb) TO supabase_auth_admin;
```

Replace `signin_lockouts`, `identifier_hash`, `locked_until` and the hash expression with the exact 0046 table, columns and hashing (match the API's normalization in `signin-lockout.service.ts`). The hook only reads; counting failures stays in the API so the two paths cannot double count. If the hosted role layout forbids `GRANT USAGE ON SCHEMA pathways TO supabase_auth_admin`, place the function in `public` with the same body and grants and note it in the CR.

- [ ] **Step 3: Enable locally**

```toml
[auth.hook.password_verification_attempt]
enabled = true
uri = "pg-functions://postgres/pathways/p52_password_verification_attempt"
```

- [ ] **Step 4: Run tests to pass**

Wire the runtime SQL into `-MigrationBaseline` like Task 2 Step 4, then run the replay. Expected: `SIGNIN_PASSWORD_HOOK_RUNTIME=PASS`.

- [ ] **Step 5: Bypass probe on the local stack**

Add to `apps/web/e2e/signin-lockout.spec.ts`: after locking the probe via the API, call Supabase directly `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with the correct password and the local anon key from the local stack status output; expect a non-2xx response. Expected: PASS after `pnpm db:local:stop`, `pnpm db:local:start`, `pnpm db:local:reset`.

- [ ] **Step 6: Inventories**

Add 0052 to every inventory listed under Files; update counts (ledger rows 27, plan steps per `hosted-plan.mjs` logic). Run: `pnpm --dir scripts/db test` and `pnpm --filter @pathways/api exec vitest run prisma/legacy-retirement.test.ts`. Expected: PASS.

- [ ] **Step 7: Docs and commit**

CR: replace the bypass caveat with the hook, list the staging step below; add QAD-A25 (direct password grant refused while locked).

```bash
git add apps/api/prisma/migrations/0052_signin_password_hook apps/api/prisma/tests/signin-password-hook-runtime.sql supabase/config.toml scripts/db apps/api/prisma/legacy-retirement.test.ts infra/supabase/phase6 apps/web/e2e/signin-lockout.spec.ts docs
git commit -m "feat(auth): enforce sign-in lockout on direct password grants via auth hook"
```

- [ ] **Step 8: Developer handoff (not an agent step)**

After 0052 is applied on `PATHWAYS-role-staging`, the developer enables it in the Supabase dashboard: Authentication, Hooks, Password Verification Attempt, Postgres function `pathways.p52_password_verification_attempt`. The agent writes these exact steps into the CR and stops.

---

### Task 5: G-F8-7 dashboard load verification

**Files:**
- Create: `scripts/perf/dashboard-load.mjs`
- Create: `apps/api/prisma/local-load-seed.ts`
- Modify: `package.json` (scripts `db:local:load-seed`, `perf:dashboards`)
- Modify: `docs/qad-pathways.md` (QAD-T62 result, add QAD-T87), `docs/prd-pathways.md` (G-F8-7), `docs/cr-pathways-performance-scaling.md` (step 1 measurement), `docs/deferred-features.md`

**Interfaces:**
- Consumes: `GET /dashboards/monitoring`, `GET /dashboards/saddd`, `GET /dashboards/home`; local stack and `local-demo-target.ts` loopback guard.
- Produces: recorded p95 per endpoint versus NFR-3 (800 ms).

- [ ] **Step 1: Define production scale**

Read `docs/prd-pathways.md` and `docs/val-pathways.md` for stated volumes. If none, use 20 projects, 10,000 beneficiaries, 50,000 journey events, 200 indicators with 12 readings each, and state the assumption in the QAD row.

- [ ] **Step 2: Write the load seed**

`apps/api/prisma/local-load-seed.ts` reuses the guard from `local-demo-target.ts` (refuse non-loopback) and inserts the volumes above on top of `db:local:demo` through set-based `INSERT ... SELECT generate_series(...)` on the owner connection; one-line comment states it is synthetic and local-only.

- [ ] **Step 3: Write the measurement script**

```js
// Measures dashboard endpoint latency against the local API only.
const base = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error('local API only')
const token = process.env.PATHWAYS_PERF_TOKEN
const runs = Number(process.env.PERF_RUNS ?? 50)
const paths = (process.env.PERF_PATHS ?? '/dashboards/home,/dashboards/monitoring,/dashboards/saddd').split(',')

const p = (xs, q) => xs.toSorted((a, b) => a - b)[Math.ceil(q * xs.length) - 1]
for (const path of paths) {
  const times = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    const r = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } })
    await r.arrayBuffer()
    if (!r.ok) throw new Error(`${path} ${r.status}`)
    times.push(performance.now() - t)
  }
  console.log(JSON.stringify({ path, cold: Math.round(times[0]), p50: Math.round(p(times, 0.5)), p95: Math.round(p(times, 0.95)), pass: p(times, 0.95) < 800 }))
}
```

Append the exact query string each endpoint needs (project id, dimension) to `PERF_PATHS`. Obtain `PATHWAYS_PERF_TOKEN` by signing in a seeded M&E Officer through `POST /auth/sign-in` inside the script run; never print it.

- [ ] **Step 4: Measure**

```bash
pnpm db:local:reset
```
```bash
pnpm db:local:demo
```
```bash
pnpm db:local:load-seed
```
```bash
pnpm perf:dashboards
```
Expected: one JSON line per endpoint.

- [ ] **Step 5: Fix only what misses**

For an endpoint with p95 at or above 800 ms, run `EXPLAIN (ANALYZE, BUFFERS)` on its SQL function on the local owner connection, add the missing index or rewrite in a new migration only after asking the developer (migrations are gated; stop and report the plan). Otherwise make no code change.

- [ ] **Step 6: Record and commit**

QAD-T62 becomes Happy with measured numbers, scale used, date, machine note; add QAD-T87 (cold-request latency recorded); G-F8-7 Met if all pass, otherwise stays Not met with the numbers.

```bash
git add scripts/perf apps/api/prisma/local-load-seed.ts package.json docs
git commit -m "perf(dashboards): local production-scale load measurement for G-F8-7"
```

---

### Task 6: Foundation contrast fixes

**Files:**
- Modify: `apps/web/src/app/globals.css:43` (`--muted-foreground`), `:49` (`--success-subtle`)
- Create: `apps/web/src/app/contrast.test.ts`
- Modify: `docs/ui-ux-pathways-reference/pathways-design-system-note.md` (deviation note), `docs/qad-pathways.md` (QAD-T88)

**Interfaces:**
- Consumes: token values from the foundations branch.
- Produces: muted `#5F6673`, success subtle `#DFF3E7`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const hsl = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`))
  if (!m) throw new Error(`missing --${name}`)
  return [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100] as const
}
const rgb = ([h, s, l]: readonly [number, number, number]) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
}
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(rgb(hsl(a))), lum(rgb(hsl(b)))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('foundation contrast', () => {
  it.each([
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['success', 'success-subtle'],
    ['foreground', 'background'],
  ])('%s on %s meets AA', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @pathways/web exec vitest run src/app/contrast.test.ts`
Expected: FAIL on `muted-foreground on background` (about 4.01) and `success on success-subtle` (about 4.40).

- [ ] **Step 3: Change the tokens**

```css
    --muted-foreground: 218.8 9.5% 41.2%;
    --success-subtle: 144.1 45.6% 91.4%;
```

- [ ] **Step 4: Run to pass**

Same command. Expected: PASS. Then run `pnpm --filter @pathways/web exec vitest run` and fix only snapshot or class expectations tied to these two tokens.

- [ ] **Step 5: Docs and commit**

Add a two-line deviation note (old value, new value, reason) to the design-system note; add QAD-T88.

```bash
git add apps/web/src/app/globals.css apps/web/src/app/contrast.test.ts docs/ui-ux-pathways-reference/pathways-design-system-note.md docs/qad-pathways.md
git commit -m "fix(ui): darken muted text and green success tint to meet WCAG AA"
```

---

### Task 7: Integration into dev

**Files:** merge-only plus conflict resolution.

**Interfaces:**
- Consumes: branches from Tasks 1-6.
- Produces: `dev` fast-forwarded locally; push only on developer approval.

- [ ] **Step 1: Branch**

```bash
git switch -c integrate/core-gap-closure dev
```

- [ ] **Step 2: Merge in order**

`fix/indicator-policy-replay`, `test/finance-expense-runtime`, `fix/foundation-contrast`, `perf/g-f8-7-dashboard-load`, `feat/signin-lockout-hardening`, each with `git merge --no-ff`. In `Replay-Local.ps1` keep every new block; in QAD keep every reserved ID.

- [ ] **Step 3: Full verification**

```bash
pnpm -r typecheck
```
```bash
pnpm biome check apps packages scripts docs
```
```bash
pnpm -r test
```
```bash
pwsh -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```
```bash
pwsh -File infra/supabase/phase6/Replay-Local.ps1 -Phase4IndicatorPolicy
```
Expected: all exit 0; replay prints `FINANCE_EXPENSE_RUNTIME=PASS`, `SIGNIN_PASSWORD_HOOK_RUNTIME=PASS`, `CSV_RBAC_UPGRADE_AND_FRESH_REPLAY=PASS`.

- [ ] **Step 4: Review**

Dispatch superpowers:requesting-code-review on `dev..integrate/core-gap-closure`; address findings with superpowers:receiving-code-review.

- [ ] **Step 5: Fast-forward and report**

```bash
git switch dev
```
```bash
git merge --ff-only integrate/core-gap-closure
```
Append the integration entry to `docs/activity-log.md`; report results verbatim; ask the developer before `git push origin dev` and before any staging apply of 0046-0052.
