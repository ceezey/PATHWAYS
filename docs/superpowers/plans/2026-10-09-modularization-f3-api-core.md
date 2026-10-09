# F3 API Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the API one kernel under `apps/api/src/common` (transaction type, business date, application identity, project scope, `requireScopedProject`, `writeAuditLog`) that never imports `modules/`, replacing the twelve private project-scope copies, the 66 hand-built audit writes and the four business-date copies, with no change to any route, status code, response body or audit row.

**Architecture:** F3 is split (ruling 1). This plan executes **F3a** in full on branch `refactor/f3a-api-core`; **F3b** (zod pipe and first contract, authorized-operation kernel, storage factory injection) is outlined at the end and gets its own plan after F3a merges. Each move is a `git mv` commit that carries only import-path changes; extraction of shared helpers follows in its own commit, test first. Mechanical rewrites use small one-off Node scripts under `.tmp/f3/` (gitignored, never committed) whose content is given in full in the task that uses them.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10, Prisma 6.19, zod 3.25, Vitest 3, Biome 1.9.4, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.2, 3.5, 3.6, 3.7 row F3, 6, 7, 9) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-08, MOD-09, MOD-10 api side, MOD-11, MOD-13 factory injection). Rulings below amend the spec where they differ.

## Rulings

Controller rulings for F3 (2026-10-09). Each was checked against the code at `refactor/f2-shared-core` `607ececa`.

1. **Split F3 into F3a and F3b.** F3a = `common/{prisma,time,authz,audit}`, `requireScopedProject`, `writeAuditLog`, guard move, import boundary test (MOD-08, MOD-09, MOD-10 api). F3b = `ZodPipe` plus the first contract (F2 ruling 2), contract naming convention, `"sideEffects": false`, `withAuthorizedOperation` into `common/authz`, storage factory injection and the object-provider wiring test (MOD-11, MOD-13, F1 deferral). Why: one branch would touch about 200 files across five independent concerns. Cost: two gate runs.
2. **Boundary enforced by a Vitest architecture test, not Biome.** Biome 1.9.4 `noRestrictedImports` accepts only exact specifiers (`options.paths`, verified in `node_modules/@biomejs/biome/configuration_schema.json`), so it cannot express "nothing under `common/` imports `modules/`". `apps/api/src/common/import-boundary.test.ts` fails on any non-test file under `common/` whose import resolves into `src/modules` or uses `@app/modules`. Test files under `common/` are exempt (they are integration fixtures; `common/network/machine-request-budget.test.ts` wires the real rules machine controller). CR 3.1 amended. Cost if wrong: replace with a Biome 2 `patterns` rule after an upgrade.
3. **Identity types move to `common/authz/application-identity.ts`.** `modules/auth/developer-access.ts` (`ApplicationIdentity`, `VerifiedAuthIdentity`, `AuthenticatedRequest`, `UUID_PATTERN`) is renamed for its purpose (MOD-17) by `git mv`; the two historical bootstrap constants `DEVELOPER_AUTH_UUID` and `DEVELOPER_SUPABASE_URL` move out to `modules/auth/developer-bootstrap-identity.ts` because they are not authorization kernel. `projectScope` moves from `modules/auth/authorized-data.service.ts` to `common/authz/project-scope.ts`.
4. **`requireScopedProject` replaces twelve copies, not eleven.** Eleven private methods are named `requireProject` (activities, authorized-data, beneficiaries, identity-review, analytics, evaluations, imports, indicators, metadata, participants, public; the audit list omits authorized-data) and finance has the same check as `private async project()`. All twelve answer 404 `Project unavailable.` and never 403. They differ only as follows, and each difference is behavior-neutral:
   - (a) `dashboards/analytics.service.ts` skips the UUID check and the lowercase. Its only input is `query.projectId` from `descriptiveAnalyticsQuerySchema`, which already validates `z.string().uuid()` and lowercases, so the added check never fires.
   - (b) evaluations, public and finance validate with zod `.uuid()` and query the raw id. zod 3.25.76 `.uuid()` uses `/^[0-9a-fA-F]{8}\b-...$/i`, the same acceptance as `UUID_PATTERN`; `Project.id` is `@db.Uuid`, so the case of the queried id does not change the match, and the returned id comes from the row.
   - (c) metadata returned the lowercased input instead of the row id; ids are stored lowercase, so the value is identical.
   - (d) Return shape: nine return the id (`requireScopedProject`); activities and beneficiaries return `{ id, startDate, endDate }` and analytics `{ id, status, archivedAt, startDate, endDate }` (`requireScopedProjectRow` with the same `select`, so the same columns are read); finance ignores the result.
   The other inline scope lookups (reports six, activities four, projects two, project-overview-metrics, beneficiary-media, form-definition-export, analytics export source, analytics-insights, private-proof-inspection, beneficiary-step-up, route-access) select other fields, use other messages or read several ids; they stay for their slices.
5. **`writeAuditLog` replaces 66 writes: 63 inline plus the 3 private `audit()` helpers.** The audit counted "66 inline plus three helpers"; the 66 already include the three helper bodies. The helper takes the caller's `tx`, spreads only the given columns (an omitted `changes` or `projectId` stays NULL, `changes: {}` stays `{}`), and returns the same `create` promise. The seed file `apps/api/prisma/local-demo-stage-evidence.ts` keeps its direct write (W1).
6. **The business date helper is `currentBusinessDate()`, not `businessDate()`.** `businessDate` is a local variable in six api files and would shadow an imported function. It replaces the four copies that map an invalid zone to 503 (`action-counts`, `role-overview`, dashboards `period`, `project-overview-metrics`). The hand-rolled `Intl` copy in `activities.service.ts` has no 503 mapping, so it becomes shared `businessCalendarDate(new Date(), this.env.BUSINESS_TIME_ZONE)` (same output, same error path). Direct `businessCalendarDate` calls without a 503 mapping (beneficiaries, analytics, rules) stay.
7. **`Tx` lives in `common/prisma/transaction.ts`** and replaces the 15 local `type Tx = Prisma.TransactionClient` aliases. The 47 direct `Prisma.TransactionClient` annotations in api production code (128 across apps/api including tests) are left for the slices. `apps/api/src/prisma` (PrismaService) stays where it is (audit non-finding).
8. **SAD routing:** `apps/api/src/common/authz/**/*.ts`, `apps/api/src/common/audit/**/*.ts` and `apps/api/src/modules/auth/guards/**/*.ts` route to organization-isolation-checker, because scope and audit code leaves `*.service.ts` files.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row (same columns, same values, same transaction) or permission decision changes; transaction boundaries are unchanged and every new helper takes the caller's `tx`.
- `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); Task 5 makes this a failing test.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits. A move commit carries only import-path changes plus the edits its task lists for that commit.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 does not flag unused imports and `tsconfig` has no `noUnusedLocals`); each task gives the check loop.
- One-off scripts live in `.tmp/f3/` (gitignored) and are never committed; `.tmp/` also holds gate logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/f3a-api-core`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, seeds under `apps/api/prisma` (except the import repoints listed) or review evidence.

## Review Focus

1. An audit row written without `changes` must keep `changes` NULL, and `changes: {}` must stay an empty object (finance, reports and milestone writes omit it; evaluations write `{}`). Task 4 Step 1 pins both in `write-audit-log.test.ts`.
2. Project ids arrive from URL params as untrusted strings: an uppercase UUID must match the same project, and an empty string, `constructor`, a UUID with a trailing space or an extra digit must answer 404 before any query. Task 3 Step 1 pins these in `scoped-project.test.ts`.
3. A project outside the actor's scope (other organization, archived, unassigned) must answer 404 `Project unavailable.`, never 403, so existence is not disclosed. Task 3 Step 1 pins the status and message.
4. A misconfigured `BUSINESS_TIME_ZONE` must still answer 503 `The configured business time zone is invalid.` on the dashboard, action-count, role-overview and project-overview reads. Task 1 Step 1 pins it on `currentBusinessDate`; the existing service tests cover the callers.
5. The boundary check must catch every import form a future edit could use: static, `import type`, side-effect, `export ... from`, dynamic `import()` and the `@app/modules` alias. Task 5 Step 1 pins the scanner on a fixture before it scans `common/`.

## Out of F3a (recorded for later sub-projects)

- F3b (outline at the end): `ZodPipe` and the first contract with its parity test (F2 ruling 2), contract naming convention for generic barrel names (F2 final review), `"sideEffects": false` in `packages/shared/package.json` (F2 final review), `withAuthorizedOperation`, its timing module and `readApplicationProfile` into `common/authz`, storage factory injection in activities, beneficiary-media, finance and reports, and the app-module-wiring test for `{ provide, useFactory }` providers (F1 deferral).
- Inline project-scope lookups listed in ruling 4: their slices (S1 to S7).
- The 47 direct `Prisma.TransactionClient` annotations in api production code (128 across apps/api including tests): their slices.
- `apps/api/prisma/local-demo-stage-evidence.ts` direct audit write: W1.

---

### Task 0: Branch setup and baseline

**Files:** none changed except the committed plan.

- [ ] **Step 1: Confirm local dev contains F2 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f2-shared-core into dev"
test -f packages/shared/src/rbac/role-catalog.ts && echo "F2 tree present"
git checkout -b refactor/f3a-api-core
pnpm install --frozen-lockfile
mkdir -p .tmp/f3
```

Expected: clean status, the F2 merge commit and `F2 tree present` printed, install succeeds. If either is missing, stop and report: F3a builds on the F2 tree.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git grep -n "auditLog\.create" -- apps/api/src ':!*.test.ts' | wc -l
git grep -n "private async requireProject(" -- apps/api/src | wc -l
git grep -n "^type Tx = Prisma.TransactionClient$" -- apps/api/src | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (shared, imports, config, api, web), the sad test count and the docs check failure count; the three greps print `66`, `11` and `15`. Later tasks compare against these numbers (`B_api` below is the api passing count).

- [ ] **Step 3: Commit the plan**

The controller has saved this plan as `docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md`.

```bash
git add docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md
git commit -m "docs: add the F3 api core plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Transaction type and current business date

**Files:**
- Create: `apps/api/src/common/prisma/transaction.ts`
- Create: `apps/api/src/common/time/business-date.ts`
- Create: `apps/api/src/common/time/business-date.test.ts`
- Modify (business date): `apps/api/src/modules/dashboards/action-counts.service.ts`, `apps/api/src/modules/dashboards/role-overview.service.ts`, `apps/api/src/modules/dashboards/dashboards.service.ts`, `apps/api/src/modules/projects/project-overview-metrics.service.ts`, `apps/api/src/modules/activities/activities.service.ts`
- Modify (`Tx` alias, 15 files, all under `apps/api/src/modules/`): `activities/activities.service.ts`, `activity-extensions/activity-extensions.service.ts`, `beneficiaries/beneficiaries.service.ts`, `beneficiaries/identity-review.service.ts`, `beneficiary-media/beneficiary-media.service.ts`, `dashboards/action-counts.service.ts`, `dashboards/role-overview.service.ts`, `evaluations/evaluation-criteria-template.ts`, `evaluations/evaluation-metrics.ts`, `imports/imports.service.ts`, `indicators/indicators.service.ts`, `metadata/form-definition-export.service.ts`, `metadata/metadata.service.ts`, `participants/participants.service.ts`, `projects/project-overview-metrics.service.ts`

**Interfaces:**
- Produces: `type Tx = Prisma.TransactionClient` from `apps/api/src/common/prisma/transaction.ts`; `currentBusinessDate(now?: Date): string` from `apps/api/src/common/time/business-date.ts`, throwing `ServiceUnavailableException('The configured business time zone is invalid.')` when the zone is unusable.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/time/business-date.test.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentBusinessDate } from './business-date'

describe('currentBusinessDate', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('returns the calendar date in the configured business time zone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T16:30:00.000Z'))
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Asia/Manila')
    expect(currentBusinessDate()).toBe('2026-10-09')
    vi.stubEnv('BUSINESS_TIME_ZONE', 'UTC')
    expect(currentBusinessDate()).toBe('2026-10-08')
  })

  it('answers 503 when the business time zone is unusable', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Not/AZone')
    expect(() => currentBusinessDate()).toThrow(
      new ServiceUnavailableException('The configured business time zone is invalid.'),
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/api exec vitest run src/common/time/business-date.test.ts`
Expected: FAIL, cannot resolve `./business-date`.

- [ ] **Step 3: Create the two kernel files**

Create `apps/api/src/common/time/business-date.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { businessCalendarDate } from '@pathways/shared'

// Today's YYYY-MM-DD in the configured business time zone; an unusable zone answers 503.
export function currentBusinessDate(now = new Date()): string {
  try {
    return businessCalendarDate(now, readApiEnv(process.env).BUSINESS_TIME_ZONE)
  } catch {
    throw new ServiceUnavailableException('The configured business time zone is invalid.')
  }
}
```

Create `apps/api/src/common/prisma/transaction.ts`:

```ts
import type { Prisma } from '@prisma/client'

// The interactive transaction client that authorized operations pass to their helpers.
export type Tx = Prisma.TransactionClient
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/time/business-date.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Create the import helper script**

Create `.tmp/f3/add-import.mjs`:

```js
// Inserts one import after each file's import block, with the specifier relative to that file.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [names, target, ...files] = process.argv.slice(2)
for (const file of files) {
  let specifier = path
    .relative(path.dirname(path.resolve(file)), path.resolve(target))
    .split(path.sep)
    .join('/')
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  const lines = readFileSync(file, 'utf8').split('\n')
  const code = lines.findIndex((line) =>
    /^(@|export |const |let |function |async function |class |type |interface |describe[(])/.test(line),
  )
  let last = -1
  for (let i = 0; i < (code < 0 ? lines.length : code); i++)
    if (/^(import .*['"]$|\} from ['"])/.test(lines[i])) last = i
  if (last < 0) throw new Error(`${file}: import block not found`)
  lines.splice(last + 1, 0, `import ${names} from '${specifier}'`)
  writeFileSync(file, lines.join('\n'))
  console.log(`${file}: import ${names} from '${specifier}'`)
}
```

Usage: `node .tmp/f3/add-import.mjs "<names>" <target path without extension> <files...>`.

- [ ] **Step 5: Replace the four 503 business-date copies**

Before editing, add one caller-level characterization test (Review Focus 4) to `apps/api/src/modules/dashboards/action-counts.service.test.ts`: make the environment the service reads return an invalid `BUSINESS_TIME_ZONE` (for example `'Not/AZone'`), following that file's existing env setup or `readApiEnv` mock pattern and restoring it afterwards, then assert that the read which computes the business date rejects with `ServiceUnavailableException` and the message `The configured business time zone is invalid.`. Run it: it must pass before the edits below and still pass after them. The api count target for this task rises by 1.


`apps/api/src/modules/dashboards/action-counts.service.ts`:
- Delete the whole `private businessDate() { ... }` method (7 lines, from `private businessDate() {` to its closing `  }`) and the blank line after it.
- Replace `const businessDate = this.businessDate()` with `const businessDate = currentBusinessDate()`.
- Remove `ServiceUnavailableException` from the `@nestjs/common` import, `businessCalendarDate` from the `@pathways/shared` import, and delete the line `import { readApiEnv } from '@pathways/config'` (each had no other use).

`apps/api/src/modules/dashboards/role-overview.service.ts`: the same three edits (delete `private businessDate()`, replace `this.businessDate()`, remove `ServiceUnavailableException`, `businessCalendarDate` and the `readApiEnv` import line).

`apps/api/src/modules/dashboards/dashboards.service.ts`, in `private period(query: DashboardQuery)` replace

```ts
    let today: string
    try {
      today = businessCalendarDate(new Date(), zone)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
```

with

```ts
    const today = currentBusinessDate()
```

Keep the `const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE` line above it (the return value uses `zone`). Remove `businessCalendarDate` from the `@pathways/shared` import; keep `ServiceUnavailableException` and `readApiEnv` (used elsewhere in the file).

`apps/api/src/modules/projects/project-overview-metrics.service.ts`, replace

```ts
    let businessDate: string
    try {
      businessDate = businessCalendarDate(new Date(), zone)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
```

with

```ts
    const businessDate = currentBusinessDate()
```

Keep the `const zone = ...` line (passed to `this.reached`). Remove `businessCalendarDate` from the `@pathways/shared` import; keep `ServiceUnavailableException` (line `Project overview contract is unavailable.`).

Add the import to the four files:

```bash
node .tmp/f3/add-import.mjs "{ currentBusinessDate }" apps/api/src/common/time/business-date \
  apps/api/src/modules/dashboards/action-counts.service.ts \
  apps/api/src/modules/dashboards/role-overview.service.ts \
  apps/api/src/modules/dashboards/dashboards.service.ts \
  apps/api/src/modules/projects/project-overview-metrics.service.ts
```

- [ ] **Step 6: Replace the activities Intl copy with the shared calendar date (ruling 6)**

In `apps/api/src/modules/activities/activities.service.ts`:
- Delete the whole `private businessDate(now = new Date()) { ... }` method (10 lines) and the blank line after it.
- Replace each of the three `this.businessDate()` calls with `businessCalendarDate(new Date(), this.env.BUSINESS_TIME_ZONE)`.
- Change `import { aggregateOnlyRoles, hasAtomicPermission } from '@pathways/shared'` to `import { aggregateOnlyRoles, businessCalendarDate, hasAtomicPermission } from '@pathways/shared'`.

```bash
git grep -n "this\.businessDate()\|private businessDate" -- apps/api/src
git grep -n "The configured business time zone is invalid" -- apps/api/src ':!*.test.ts'
```

Expected: the first prints nothing; the second prints only `apps/api/src/common/time/business-date.ts`.

- [ ] **Step 7: Replace the 15 local `Tx` aliases**

```bash
files=$(git grep -l "^type Tx = Prisma.TransactionClient$" -- apps/api/src)
echo "$files" | wc -l
node .tmp/f3/add-import.mjs "type { Tx }" apps/api/src/common/prisma/transaction $files
sed -i '/^type Tx = Prisma.TransactionClient$/d' $files
for f in $files; do [ "$(grep -cw Prisma "$f")" = 1 ] && echo "unused Prisma import: $f"; done
```

Expected: `15`; the loop prints exactly these five, whose only remaining `Prisma` is the import line: `beneficiaries/identity-review.service.ts`, `dashboards/action-counts.service.ts`, `dashboards/role-overview.service.ts`, `evaluations/evaluation-metrics.ts`, `projects/project-overview-metrics.service.ts`. Delete the `import type { Prisma } from '@prisma/client'` line in each of the five.

```bash
git grep -n "^type Tx = " -- apps/api/src ':!*.test.ts'
```

Expected: prints nothing.

- [ ] **Step 8: Verify**

```bash
git add -N apps/api/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AM HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; api passing count = `B_api + 2`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): add common Tx and currentBusinessDate and use them

Replaces 15 local Tx aliases and the four business-date copies that answer 503; activities uses the shared calendar date.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move the application identity and project scope into common/authz

**Files:**
- Move: `apps/api/src/modules/auth/developer-access.ts` -> `apps/api/src/common/authz/application-identity.ts`
- Create: `apps/api/src/modules/auth/developer-bootstrap-identity.ts`
- Create: `apps/api/src/common/authz/project-scope.ts`
- Modify: `apps/api/src/modules/auth/authorized-data.service.ts` (remove `projectScope`)
- Modify (import path only), 159 files that import `developer-access`: 100 with `'../auth/developer-access'`, 20 with `'./developer-access'`, 30 with `'@app/modules/auth/developer-access'`, 6 with `'../src/modules/auth/developer-access'` (under `apps/api/prisma`), 2 with `'../../modules/auth/developer-access'` (under `apps/api/src/common/guards`), 1 with `'./auth/developer-access'` (`apps/api/src/modules/core-foundation.test.ts`)
- Modify (bootstrap constants): `apps/api/prisma/authorization-bootstrap-runner.ts`, `apps/api/prisma/authorization-bootstrap.local.test.ts`, `apps/api/prisma/developer-bootstrap.ts`, `apps/api/src/common/guards/supabase-auth.guard.test.ts`, `apps/api/src/modules/auth/session-liveness.local.test.ts`, `apps/api/src/modules/auth/token-auth.service.test.ts`, `apps/api/src/modules/auth/workspace-resolution.service.test.ts`
- Modify (project scope import), 28 files: the 25 that import `{ projectScope }` from `'../auth/authorized-data.service'` and the 3 that import it from `'./authorized-data.service'` (`beneficiary-step-up.service.ts`, `route-access.service.ts`, `rule-based-access-alignment.test.ts` under `apps/api/src/modules/auth/`)

**Interfaces:**
- Produces: from `apps/api/src/common/authz/application-identity.ts`: `UUID_PATTERN`, `VerifiedAuthIdentity`, `ApplicationIdentity`, `AuthenticatedRequest` (unchanged definitions). From `apps/api/src/common/authz/project-scope.ts`: `projectScope(profile: ApplicationIdentity): Prisma.ProjectWhereInput` (unchanged). From `apps/api/src/modules/auth/developer-bootstrap-identity.ts`: `DEVELOPER_AUTH_UUID`, `DEVELOPER_SUPABASE_URL` (unchanged values).

- [ ] **Step 1: Confirm the importer counts and that nothing mocks these files**

```bash
git grep -l "developer-access'" -- apps | wc -l
git grep -ho "'[^']*developer-access'" -- apps | sort | uniq -c
git grep -n "import { projectScope } from '[./]*\(auth/\)*authorized-data.service'" -- apps | wc -l
git grep -n "mock(.*developer-access\|mock(.*authorized-data" -- apps
```

Expected: `159`; the six specifier counts listed under Files; `28`; the last command prints nothing.

- [ ] **Step 2: Move the identity file and repoint every importer**

```bash
mkdir -p apps/api/src/common/authz
git mv apps/api/src/modules/auth/developer-access.ts apps/api/src/common/authz/application-identity.ts
git grep -l "developer-access'" -- apps | xargs sed -i \
  -e "s#'\.\./auth/developer-access'#'../../common/authz/application-identity'#" \
  -e "s#'\./developer-access'#'../../common/authz/application-identity'#" \
  -e "s#'\.\./\.\./modules/auth/developer-access'#'../authz/application-identity'#" \
  -e "s#'\.\./src/modules/auth/developer-access'#'../src/common/authz/application-identity'#" \
  -e "s#'\./auth/developer-access'#'../common/authz/application-identity'#" \
  -e "s#'@app/modules/auth/developer-access'#'@app/common/authz/application-identity'#"
git grep -n "developer-access" -- apps
```

Expected: the last command prints nothing.

- [ ] **Step 3: Verify and commit the move**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move the application identity types to common/authz

developer-access.ts becomes common/authz/application-identity.ts; importers change path only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api count equals Task 1.

- [ ] **Step 4: Split out the developer bootstrap constants**

Create `apps/api/src/modules/auth/developer-bootstrap-identity.ts` with the constants and comment moved verbatim from `application-identity.ts`:

```ts
// Historical, separately reviewed bootstrap verification only. Runtime guards
// never compare a request identity to this value.
export const DEVELOPER_AUTH_UUID = '56ad4c1a-113f-401b-84e8-1d2135f174c1'
export const DEVELOPER_SUPABASE_URL = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'
```

In `apps/api/src/common/authz/application-identity.ts` delete those four lines and the blank line after them, so the file starts with `UUID_PATTERN`, a blank line, then `export interface VerifiedAuthIdentity`.

Repoint the seven users:

```bash
sed -i "s#import { DEVELOPER_AUTH_UUID } from '../src/common/authz/application-identity'#import { DEVELOPER_AUTH_UUID } from '../src/modules/auth/developer-bootstrap-identity'#" \
  apps/api/prisma/authorization-bootstrap-runner.ts apps/api/prisma/authorization-bootstrap.local.test.ts apps/api/prisma/developer-bootstrap.ts
sed -i "s#import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from '../../common/authz/application-identity'#import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from './developer-bootstrap-identity'#" \
  apps/api/src/modules/auth/session-liveness.local.test.ts apps/api/src/modules/auth/token-auth.service.test.ts
```

`apps/api/src/modules/auth/workspace-resolution.service.test.ts`: replace `import { type ApplicationIdentity, DEVELOPER_AUTH_UUID } from '../../common/authz/application-identity'` with the two lines

```ts
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { DEVELOPER_AUTH_UUID } from './developer-bootstrap-identity'
```

`apps/api/src/common/guards/supabase-auth.guard.test.ts`: in the multi-line import from `'../authz/application-identity'` delete the `DEVELOPER_AUTH_UUID,` and `DEVELOPER_SUPABASE_URL,` lines, and add directly below that statement:

```ts
import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from '../../modules/auth/developer-bootstrap-identity'
```

```bash
git grep -l "DEVELOPER_AUTH_UUID\|DEVELOPER_SUPABASE_URL" -- apps | xargs grep -L "developer-bootstrap-identity"
```

Expected: prints only `apps/api/src/modules/auth/developer-bootstrap-identity.ts` (every other user imports from it).

- [ ] **Step 5: Move projectScope**

Create `apps/api/src/common/authz/project-scope.ts`. Its body is the `projectScope` function and its doc comment cut verbatim from `apps/api/src/modules/auth/authorized-data.service.ts` (the block from `/** Organization predicates are always present` through the function's closing `}`):

```ts
import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from './application-identity'

/** Organization predicates are always present, even for administrators.
 * Portfolio scope is backed by managed programs or explicit active assignments,
 * never a browser-supplied project list or all organizations.
 */
export function projectScope(profile: ApplicationIdentity): Prisma.ProjectWhereInput {
  const base = { organizationId: profile.organizationId, archivedAt: null }
  if (profile.roles[0] === 'SYSTEM_ADMINISTRATOR') return base
  if (profile.roles[0] === 'PROGRAM_MANAGER') {
    return {
      ...base,
      OR: [
        { id: { in: profile.assignedProjectIds } },
        {
          program: {
            organizationId: profile.organizationId,
            managerUserId: profile.userId,
            archivedAt: null,
          },
        },
      ],
    }
  }
  // No grant-portfolio membership model exists. Explicit active assignments are
  // the conservative ceiling for Grant Manager until separately governed.
  return { ...base, id: { in: profile.assignedProjectIds } }
}
```

Before saving, diff the function text against the one in `authorized-data.service.ts`; they must be identical. Then delete the comment and function from `authorized-data.service.ts` and add there `import { projectScope } from '../../common/authz/project-scope'`.

```bash
git grep -l "import { projectScope } from '\.\./auth/authorized-data.service'" -- apps/api/src | xargs sed -i "s#import { projectScope } from '\.\./auth/authorized-data.service'#import { projectScope } from '../../common/authz/project-scope'#"
git grep -l "import { projectScope } from '\./authorized-data.service'" -- apps/api/src | xargs sed -i "s#import { projectScope } from '\./authorized-data.service'#import { projectScope } from '../../common/authz/project-scope'#"
git grep -n "projectScope.*authorized-data\|export function projectScope" -- apps
```

Expected: the last command prints only `apps/api/src/common/authz/project-scope.ts`.

- [ ] **Step 6: Verify and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move project scope to common/authz and split the developer bootstrap constants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api count equals Task 1.

---

### Task 3: One requireScopedProject for the twelve project-scope copies

**Files:**
- Create: `apps/api/src/common/authz/scoped-project.ts`
- Create: `apps/api/src/common/authz/scoped-project.test.ts`
- Modify (id callers): `apps/api/src/modules/auth/authorized-data.service.ts`, `apps/api/src/modules/beneficiaries/identity-review.service.ts`, `apps/api/src/modules/evaluations/evaluations.service.ts`, `apps/api/src/modules/imports/imports.service.ts`, `apps/api/src/modules/indicators/indicators.service.ts`, `apps/api/src/modules/metadata/metadata.service.ts`, `apps/api/src/modules/participants/participants.service.ts`, `apps/api/src/modules/public/public.service.ts`, `apps/api/src/modules/finance/finance.service.ts`
- Modify (row callers): `apps/api/src/modules/activities/activities.service.ts`, `apps/api/src/modules/beneficiaries/beneficiaries.service.ts`, `apps/api/src/modules/dashboards/analytics.service.ts`

**Interfaces:**
- Consumes: `Tx` (`common/prisma/transaction.ts`), `ApplicationIdentity`, `UUID_PATTERN` (`common/authz/application-identity.ts`), `projectScope` (`common/authz/project-scope.ts`).
- Produces: from `apps/api/src/common/authz/scoped-project.ts`:
  - `requireScopedProject(tx: Tx, actor: ApplicationIdentity, projectId: string): Promise<string>` returns the stored project id.
  - `requireScopedProjectRow<const S extends Prisma.ProjectSelect>(tx: Tx, actor: ApplicationIdentity, projectId: string, select: S): Promise<Prisma.ProjectGetPayload<{ select: S }>>`.
  - Both throw `NotFoundException('Project unavailable.')` for a non-UUID id (before any query) or a project outside `projectScope(actor)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/authz/scoped-project.test.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { Tx } from '../prisma/transaction'
import type { ApplicationIdentity } from './application-identity'
import { requireScopedProject, requireScopedProjectRow } from './scoped-project'

const org = '61000000-0000-4000-8000-000000000001'
const project = '61000000-0000-4000-8000-00000000000a'
const actor: ApplicationIdentity = {
  id: '61000000-0000-4000-8000-000000000002',
  aal: 'aal2',
  userId: '61000000-0000-4000-8000-000000000003',
  organizationId: org,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: [],
  assignedProjectIds: [project],
}
const scopedWhere = (id: string) => ({
  AND: [{ organizationId: org, archivedAt: null, id: { in: [project] } }, { id }],
})
const txReturning = (row: unknown) => {
  const findFirst = vi.fn().mockResolvedValue(row)
  return { tx: { project: { findFirst } } as unknown as Tx, findFirst }
}

describe('requireScopedProject', () => {
  it('returns the stored id of a project inside the actor scope', async () => {
    const { tx, findFirst } = txReturning({ id: project })
    await expect(requireScopedProject(tx, actor, project)).resolves.toBe(project)
    expect(findFirst).toHaveBeenCalledWith({ where: scopedWhere(project), select: { id: true } })
  })

  it('queries an uppercase id in lowercase', async () => {
    const { tx, findFirst } = txReturning({ id: project })
    await expect(requireScopedProject(tx, actor, project.toUpperCase())).resolves.toBe(project)
    expect(findFirst).toHaveBeenCalledWith({ where: scopedWhere(project), select: { id: true } })
  })

  it.each(['', 'not-a-uuid', 'constructor', `${project} `, `${project}0`])(
    'answers 404 for %j before any query',
    async (value) => {
      const { tx, findFirst } = txReturning({ id: project })
      await expect(requireScopedProject(tx, actor, value)).rejects.toThrow(
        new NotFoundException('Project unavailable.'),
      )
      expect(findFirst).not.toHaveBeenCalled()
    },
  )

  it('answers 404, never 403, for a project outside the actor scope', async () => {
    const { tx } = txReturning(null)
    const error = await requireScopedProject(tx, actor, project).catch((caught) => caught)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(error.getStatus()).toBe(404)
    expect(error.message).toBe('Project unavailable.')
  })
})

describe('requireScopedProjectRow', () => {
  it('reads exactly the requested project fields', async () => {
    const row = { id: project, startDate: null, endDate: null }
    const { tx, findFirst } = txReturning(row)
    await expect(
      requireScopedProjectRow(tx, actor, project, { id: true, startDate: true, endDate: true }),
    ).resolves.toBe(row)
    expect(findFirst).toHaveBeenCalledWith({
      where: scopedWhere(project),
      select: { id: true, startDate: true, endDate: true },
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/api exec vitest run src/common/authz/scoped-project.test.ts`
Expected: FAIL, cannot resolve `./scoped-project`.

- [ ] **Step 3: Write the helper**

Create `apps/api/src/common/authz/scoped-project.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import type { Tx } from '../prisma/transaction'
import { type ApplicationIdentity, UUID_PATTERN } from './application-identity'
import { projectScope } from './project-scope'

const PROJECT_UNAVAILABLE = 'Project unavailable.'

// Reads the selected fields of one project inside the actor's scope, or answers 404 without saying why.
export async function requireScopedProjectRow<const S extends Prisma.ProjectSelect>(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  select: S,
): Promise<Prisma.ProjectGetPayload<{ select: S }>> {
  if (!UUID_PATTERN.test(projectId)) throw new NotFoundException(PROJECT_UNAVAILABLE)
  const fields: Prisma.ProjectSelect = select
  const project: unknown = await tx.project.findFirst({
    where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
    select: fields,
  })
  if (!project) throw new NotFoundException(PROJECT_UNAVAILABLE)
  return project as Prisma.ProjectGetPayload<{ select: S }>
}

// Returns the stored id of one project inside the actor's scope, or answers 404 without saying why.
export async function requireScopedProject(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
): Promise<string> {
  return (await requireScopedProjectRow(tx, actor, projectId, { id: true })).id
}
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/authz/scoped-project.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 4: Confirm the twelve copies match ruling 4**

```bash
for f in activities/activities.service.ts auth/authorized-data.service.ts beneficiaries/beneficiaries.service.ts beneficiaries/identity-review.service.ts dashboards/analytics.service.ts evaluations/evaluations.service.ts imports/imports.service.ts indicators/indicators.service.ts metadata/metadata.service.ts participants/participants.service.ts public/public.service.ts; do
  echo "== $f"; grep -n -A16 "private async requireProject(" apps/api/src/modules/$f | sed '/^[0-9]*-  }$/q'
done
grep -n -A10 "private async project(" apps/api/src/modules/finance/finance.service.ts
```

Read every printed method. Each must: reject a bad id with `NotFoundException('Project unavailable.')` (or, for analytics, have no id check), query `tx.project.findFirst` with `AND: [projectScope(<actor>), { id: ... }]`, and throw `NotFoundException('Project unavailable.')` when nothing is found. Selects: `{ id: true, startDate: true, endDate: true }` in activities and beneficiaries; `{ id, status, archivedAt, startDate, endDate }` in analytics; `{ id: true }` elsewhere. If any method differs from this (another message, a 403, another select, extra checks), stop and report it to the controller: it needs its own ruling.

- [ ] **Step 5: Create the method removal script**

Create `.tmp/f3/remove-method.mjs`:

```js
// Deletes one private class method by name, with a one-line doc comment above it and one blank line after it.
import { readFileSync, writeFileSync } from 'node:fs'

const [name, ...files] = process.argv.slice(2)
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const signature = new RegExp(`^  private (async )?${name}[(]`)
  let start = lines.findIndex((line) => signature.test(line))
  if (start < 0) throw new Error(`${file}: private method ${name} not found`)
  const end = lines.findIndex((line, index) => index > start && line === '  }')
  if (/^  \/\*\*.*\*\/$/.test(lines[start - 1])) start--
  const count = end - start + 1 + (lines[end + 1] === '' ? 1 : 0)
  lines.splice(start, count)
  writeFileSync(file, lines.join('\n'))
  console.log(`${file}: removed ${name} (${count} lines)`)
}
```

If `.tmp/f3/add-import.mjs` is missing (Task 1 Step 4), create it with the content given there before continuing.

- [ ] **Step 6: Replace the eight id-returning copies and finance**

```bash
m=apps/api/src/modules
idfiles="$m/auth/authorized-data.service.ts $m/beneficiaries/identity-review.service.ts $m/evaluations/evaluations.service.ts $m/imports/imports.service.ts $m/indicators/indicators.service.ts $m/metadata/metadata.service.ts $m/participants/participants.service.ts $m/public/public.service.ts"
node .tmp/f3/remove-method.mjs requireProject $idfiles
sed -i 's/this\.requireProject(/requireScopedProject(/g' $idfiles
node .tmp/f3/remove-method.mjs project $m/finance/finance.service.ts
sed -i 's/await this\.project(tx, actor, /await requireScopedProject(tx, actor, /g' $m/finance/finance.service.ts
node .tmp/f3/add-import.mjs "{ requireScopedProject }" apps/api/src/common/authz/scoped-project $idfiles $m/finance/finance.service.ts
```

Expected: nine `removed` lines (eight `requireProject`, one `project` of 10 lines in finance) and nine `import` lines with specifier `'../../common/authz/scoped-project'`.

- [ ] **Step 7: Replace the three row-returning copies**

Remove the methods:

```bash
node .tmp/f3/remove-method.mjs requireProject apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/beneficiaries/beneficiaries.service.ts apps/api/src/modules/dashboards/analytics.service.ts
```

Expected: three `removed` lines (analytics includes its one-line doc comment).

Append to `apps/api/src/common/authz/scoped-project.ts` (one definition shared by activities and beneficiaries):

```ts

// Project fields that dated writes validate their dates against.
export const projectDateFields = { id: true, startDate: true, endDate: true } as const
```

In `apps/api/src/modules/dashboards/analytics.service.ts`, insert directly above the `@Injectable()` line:

```ts
// Project fields the survey and timeline views read after the scope check.
const timelineProjectFields = {
  id: true,
  status: true,
  archivedAt: true,
  startDate: true,
  endDate: true,
} as const

```

```bash
sed -i 's/this\.requireProject(tx, actor, projectId)/requireScopedProjectRow(tx, actor, projectId, projectDateFields)/g' apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/beneficiaries/beneficiaries.service.ts
sed -i 's/this\.requireProject(tx, actor, query\.projectId)/requireScopedProjectRow(tx, actor, query.projectId, timelineProjectFields)/g' apps/api/src/modules/dashboards/analytics.service.ts
node .tmp/f3/add-import.mjs "{ projectDateFields, requireScopedProjectRow }" apps/api/src/common/authz/scoped-project apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/beneficiaries/beneficiaries.service.ts
node .tmp/f3/add-import.mjs "{ requireScopedProjectRow }" apps/api/src/common/authz/scoped-project apps/api/src/modules/dashboards/analytics.service.ts
sed -i 's/\brequireProject\b/requireScopedProjectRow/g' apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/beneficiaries/beneficiaries.service.ts
git grep -n "requireProject\b\|this\.project(" -- apps/api/src ':!*.test.ts'
git grep -c "requireScopedProjectRow(tx" -- apps/api/src/modules
git grep -c "requireScopedProject(tx" -- apps/api/src/modules
```

The second `sed` only reaches prose: after the call rewrite, the remaining `requireProject` words in these two files are four comments (activities three, beneficiaries one) that name the old method. Expected: the first grep prints nothing. Row counts: activities 7, beneficiaries 8, analytics 2. Id counts: authorized-data 2, identity-review 2, evaluations 8, imports 4, indicators 7, metadata 5, participants 6, public 2, finance 13.

- [ ] **Step 8: Remove imports left without a use**

```bash
for f in apps/api/src/modules/{activities/activities,auth/authorized-data,beneficiaries/beneficiaries,beneficiaries/identity-review,dashboards/analytics,evaluations/evaluations,finance/finance,imports/imports,indicators/indicators,metadata/metadata,participants/participants,public/public}.service.ts; do
  for n in UUID_PATTERN projectScope NotFoundException projectIdSchema Prisma z uuid; do
    [ "$(grep -cw "$n" "$f")" = 1 ] && echo "$f: $n appears only once"
  done
done
```

For each printed pair, open the file: if that single occurrence is in an import statement (or is the unused `const projectIdSchema` / `const uuid` declaration), delete the name (and the whole statement if it becomes empty). Do not delete anything else. Run the loop again; expected: prints nothing, or only names whose single use is real code.

- [ ] **Step 9: Verify**

```bash
git add -N apps/api/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AM HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass with no edits to existing tests; api passing count = Task 2 count + 9. If an existing service test fails, do not change the test: report the failing assertion to the controller (it means a copy differed from ruling 4).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): one requireScopedProject for the twelve project-scope copies

Eleven private requireProject methods and the finance project check now call common/authz/scoped-project; each keeps its select and its 404.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One writeAuditLog for every audit row

**Files:**
- Create: `apps/api/src/common/audit/write-audit-log.ts`
- Create: `apps/api/src/common/audit/write-audit-log.test.ts`
- Modify (22 files, all under `apps/api/src/modules/`): `activities/activities.service.ts` (9 writes), `activities/private-proof-inspection.service.ts` (1), `activity-extensions/activity-extensions.service.ts` (helper), `analytics-insights/analytics-insights.service.ts` (1), `auth/beneficiary-step-up.service.ts` (1), `beneficiaries/beneficiaries.service.ts` (4), `beneficiaries/identity-review.service.ts` (1), `beneficiary-media/beneficiary-media.service.ts` (2), `dashboards/analytics.service.ts` (2), `evaluations/evaluation-criteria-template.ts` (1), `evaluations/evaluations.service.ts` (6), `finance/finance.service.ts` (5), `imports/imports.service.ts` (9), `indicators/indicator-library.service.ts` (helper), `indicators/indicators.service.ts` (helper), `metadata/form-definition-export.service.ts` (1), `metadata/metadata.service.ts` (8), `participants/participants.service.ts` (4), `programs/programs.service.ts` (1), `projects/projects.service.ts` (3), `reports/reports.service.ts` (2), `users/users.service.ts` (2)

**Interfaces:**
- Consumes: `Tx` (`common/prisma/transaction.ts`), `ApplicationIdentity` (`common/authz/application-identity.ts`).
- Produces: from `apps/api/src/common/audit/write-audit-log.ts`: `type AuditEntry = Pick<Prisma.AuditLogUncheckedCreateInput, 'projectId' | 'action' | 'entityType' | 'entityId' | 'changes'>` and `writeAuditLog(tx: Tx, actor: Pick<ApplicationIdentity, 'organizationId' | 'userId'>, entry: AuditEntry)`, returning the `tx.auditLog.create` promise.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/audit/write-audit-log.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import type { Tx } from '../prisma/transaction'
import { writeAuditLog } from './write-audit-log'

const actor = {
  organizationId: '62000000-0000-4000-8000-000000000001',
  userId: '62000000-0000-4000-8000-000000000002',
}
const txWithAudit = () => {
  const create = vi.fn().mockResolvedValue({ id: 'row' })
  return { tx: { auditLog: { create } } as unknown as Tx, create }
}

describe('writeAuditLog', () => {
  it('writes the actor organization and user with the entry in the given transaction', async () => {
    const { tx, create } = txWithAudit()
    await expect(
      writeAuditLog(tx, actor, {
        projectId: 'p',
        action: 'A',
        entityType: 'E',
        entityId: 'e',
        changes: { count: 1 },
      }),
    ).resolves.toEqual({ id: 'row' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId: 'p',
        action: 'A',
        entityType: 'E',
        entityId: 'e',
        changes: { count: 1 },
      },
    })
  })

  it('leaves omitted columns out so they stay null and keeps an empty changes object', async () => {
    const { tx, create } = txWithAudit()
    await writeAuditLog(tx, actor, { action: 'A', entityType: 'E' })
    expect(Object.keys(create.mock.calls[0][0].data).sort()).toEqual([
      'action',
      'actorUserId',
      'entityType',
      'organizationId',
    ])
    await writeAuditLog(tx, actor, { action: 'B', entityType: 'E', changes: {} })
    expect(create.mock.calls[1][0].data.changes).toEqual({})
  })

  it('copies no identity field other than the organization and user', async () => {
    const { tx, create } = txWithAudit()
    const identity = { ...actor, roles: ['SYSTEM_ADMINISTRATOR'], permissions: ['users.manage'] }
    await writeAuditLog(tx, identity, { action: 'A', entityType: 'E' })
    expect(create.mock.calls[0][0].data).not.toHaveProperty('roles')
    expect(create.mock.calls[0][0].data).not.toHaveProperty('permissions')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/api exec vitest run src/common/audit/write-audit-log.test.ts`
Expected: FAIL, cannot resolve `./write-audit-log`.

- [ ] **Step 3: Write the helper**

Create `apps/api/src/common/audit/write-audit-log.ts`:

```ts
import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../authz/application-identity'
import type { Tx } from '../prisma/transaction'

export type AuditEntry = Pick<
  Prisma.AuditLogUncheckedCreateInput,
  'projectId' | 'action' | 'entityType' | 'entityId' | 'changes'
>

// Writes one audit row for the actor inside the caller's transaction; omitted columns stay null.
export function writeAuditLog(
  tx: Tx,
  actor: Pick<ApplicationIdentity, 'organizationId' | 'userId'>,
  entry: AuditEntry,
) {
  return tx.auditLog.create({
    data: { organizationId: actor.organizationId, actorUserId: actor.userId, ...entry },
  })
}
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/audit/write-audit-log.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Rewrite every inline write with a codemod**

Create `.tmp/f3/audit-codemod.mjs`:

```js
// Rewrites tx.auditLog.create({ data: { organizationId: X.organizationId, actorUserId: X.userId, ... } }) to writeAuditLog(tx, X, { ... }).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const helper = path.resolve('apps/api/src/common/audit/write-audit-log')
let total = 0
for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8')
  const marker = /tx\.auditLog\.create\(\{\s*data:\s*\{/g
  let count = 0
  let match = marker.exec(src)
  while (match) {
    const start = match.index + match[0].length
    let index = start
    let depth = 1
    while (depth > 0) {
      if (index >= src.length) throw new Error(`${file}: unbalanced data object`)
      const char = src[index++]
      if (char === '{') depth++
      else if (char === '}') depth--
    }
    const body = src.slice(start, index - 1)
    const tail = /^\s*,?\s*\}\s*\)/.exec(src.slice(index))
    if (!tail) throw new Error(`${file}: unexpected text after the data object at ${match.index}`)
    const org = /\n(\s*)organizationId: (\w+)\.organizationId,/.exec(body)
    const actor = /\n(\s*)actorUserId: (\w+)\.userId,/.exec(body)
    if (!org || !actor || org[2] !== actor[2])
      throw new Error(`${file}: organizationId and actorUserId do not come from one actor at ${match.index}`)
    const rest = body.replace(org[0], '').replace(actor[0], '')
    const replacement = `writeAuditLog(tx, ${org[2]}, {${rest}})`
    src = src.slice(0, match.index) + replacement + src.slice(index + tail[0].length)
    marker.lastIndex = match.index + replacement.length
    count++
    match = marker.exec(src)
  }
  if (count === 0) continue
  let specifier = path.relative(path.dirname(path.resolve(file)), helper).split(path.sep).join('/')
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  const lines = src.split('\n')
  const code = lines.findIndex((line) =>
    /^(@|export |const |let |function |async function |class |type |interface )/.test(line),
  )
  let last = -1
  for (let i = 0; i < code; i++) if (/^(import .*['"]$|\} from ['"])/.test(lines[i])) last = i
  if (last < 0) throw new Error(`${file}: import block not found`)
  lines.splice(last + 1, 0, `import { writeAuditLog } from '${specifier}'`)
  writeFileSync(file, lines.join('\n'))
  console.log(`${file}: ${count}`)
  total += count
}
console.log(`total: ${total}`)
```

```bash
git grep -n "auditLog\.create" -- apps/api/src ':!*.test.ts' ':!apps/api/src/common/audit/*' | wc -l
node .tmp/f3/audit-codemod.mjs $(git grep -l "auditLog\.create" -- apps/api/src ':!*.test.ts' ':!apps/api/src/common/audit/*')
pnpm exec biome check --write $(git diff --name-only HEAD -- apps/api/src)
git grep -n "auditLog\.create" -- apps/api/src ':!*.test.ts'
```

Expected: `66`; the codemod prints the 22 files with the counts listed under Files (each helper file counts 1) and `total: 66`; the last grep prints only `apps/api/src/common/audit/write-audit-log.ts`. The codemod stops with an error rather than guess; if it throws, report the file and offset to the controller.

- [ ] **Step 5: Delete the three private audit helpers and call writeAuditLog directly**

If `.tmp/f3/remove-method.mjs` is missing (Task 3 Step 5), create it with the content given there.

```bash
node .tmp/f3/remove-method.mjs audit \
  apps/api/src/modules/activity-extensions/activity-extensions.service.ts \
  apps/api/src/modules/indicators/indicator-library.service.ts \
  apps/api/src/modules/indicators/indicators.service.ts
```

Expected: three `removed audit` lines. Then replace the nine call sites exactly (each `old` text is unique in its file).

`apps/api/src/modules/activity-extensions/activity-extensions.service.ts` (entity type `ActivityExtensionRequest`):

```ts
        await this.audit(
          tx,
          actor,
          activity.projectId,
          'ACTIVITY_EXTENSION_REQUESTED',
          created.id,
          {
            activityId: activity.id,
            from: currentEnd,
            to: input.requestedEndDate,
          },
        )
```

becomes

```ts
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_EXTENSION_REQUESTED',
          entityType: 'ActivityExtensionRequest',
          entityId: created.id,
          changes: { activityId: activity.id, from: currentEnd, to: input.requestedEndDate },
        })
```

```ts
      await this.audit(tx, actor, activity.projectId, `ACTIVITY_EXTENSION_${status}`, row.id, {
        activityId: activity.id,
      })
```

becomes

```ts
      await writeAuditLog(tx, actor, {
        projectId: activity.projectId,
        action: `ACTIVITY_EXTENSION_${status}`,
        entityType: 'ActivityExtensionRequest',
        entityId: row.id,
        changes: { activityId: activity.id },
      })
```

```ts
        await this.audit(
          tx,
          actor,
          activity.projectId,
          input.decision === 'APPROVE'
            ? 'ACTIVITY_EXTENSION_APPROVED'
            : 'ACTIVITY_EXTENSION_DECLINED',
          row.id,
          { activityId: activity.id, from: day(activity.plannedEndDate), to: requestedEnd },
        )
```

becomes

```ts
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action:
            input.decision === 'APPROVE' ? 'ACTIVITY_EXTENSION_APPROVED' : 'ACTIVITY_EXTENSION_DECLINED',
          entityType: 'ActivityExtensionRequest',
          entityId: row.id,
          changes: { activityId: activity.id, from: day(activity.plannedEndDate), to: requestedEnd },
        })
```

`apps/api/src/modules/indicators/indicator-library.service.ts` (entity type `IndicatorLibraryEntry`, no project):

```ts
          await this.audit(tx, actor, 'INDICATOR_LIBRARY_ENTRY_CREATED', row.id, {
            code: row.code,
          })
```

becomes

```ts
          await writeAuditLog(tx, actor, {
            action: 'INDICATOR_LIBRARY_ENTRY_CREATED',
            entityType: 'IndicatorLibraryEntry',
            entityId: row.id,
            changes: { code: row.code },
          })
```

```ts
        await this.audit(tx, actor, 'INDICATOR_LIBRARY_ENTRY_ARCHIVED', id, {})
```

becomes

```ts
        await writeAuditLog(tx, actor, {
          action: 'INDICATOR_LIBRARY_ENTRY_ARCHIVED',
          entityType: 'IndicatorLibraryEntry',
          entityId: id,
          changes: {},
        })
```

`apps/api/src/modules/indicators/indicators.service.ts` (entity type `ProjectIndicator`, project `id`):

```ts
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_CREATED', indicatorId, {
            mode: input.mode,
            numericKind: input.numericKind,
            recipe: input.binding?.recipe ?? null,
            contractVersion: P06_CONTRACT_VERSION,
          })
```

becomes

```ts
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_CREATED',
            entityType: 'ProjectIndicator',
            entityId: indicatorId,
            changes: {
              mode: input.mode,
              numericKind: input.numericKind,
              recipe: input.binding?.recipe ?? null,
              contractVersion: P06_CONTRACT_VERSION,
            },
          })
```

```ts
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_LABEL_UPDATED', selected, {
            revision: input.expectedRevision + 1,
          })
```

becomes

```ts
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_LABEL_UPDATED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { revision: input.expectedRevision + 1 },
          })
```

```ts
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_ARCHIVED', selected, {
            revision: input.expectedRevision + 1,
          })
```

becomes

```ts
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_ARCHIVED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { revision: input.expectedRevision + 1 },
          })
```

```ts
          await this.audit(
            tx,
            actor,
            id,
            input.correctsMeasurementId
              ? 'INDICATOR_MEASUREMENT_CORRECTED'
              : 'INDICATOR_MEASUREMENT_RECORDED',
            selected,
            { measurementId, correctsMeasurementId: input.correctsMeasurementId ?? null },
          )
```

becomes

```ts
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: input.correctsMeasurementId
              ? 'INDICATOR_MEASUREMENT_CORRECTED'
              : 'INDICATOR_MEASUREMENT_RECORDED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { measurementId, correctsMeasurementId: input.correctsMeasurementId ?? null },
          })
```

```bash
git grep -n "this\.audit(\|private audit(" -- apps/api/src
```

Expected: prints nothing.

- [ ] **Step 6: Remove imports left without a use and check the result**

```bash
for f in $(git diff --name-only HEAD -- apps/api/src/modules); do
  [ "$(grep -cw Prisma "$f")" = 1 ] && echo "unused Prisma import: $f"
done
git diff --stat HEAD -- apps/api/src/modules | tail -1
```

Delete the `Prisma` import in every printed file (its only use was in a removed helper or data literal). Then read `git diff HEAD -- apps/api/src/modules` once: every hunk must only swap `tx.auditLog.create({ data: { organizationId, actorUserId, ... } })` for `writeAuditLog(tx, <actor>, { ... })` with the same remaining keys and values, or be one of the ten helper call sites above, an import line, or a removed helper.

- [ ] **Step 7: Verify**

```bash
git add -N apps/api/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AM HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass with no edits to existing tests (the service tests that assert `tx.auditLog.create` calls now exercise `writeAuditLog`); api passing count = Task 3 count + 3.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): one writeAuditLog for every audit row

63 inline auditLog.create calls and three private audit helpers now call common/audit/write-audit-log with the caller's transaction; rows keep the same columns and values.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Move the auth guard to modules/auth/guards and enforce the common boundary

**Files:**
- Create: `apps/api/src/common/import-boundary.test.ts`
- Move: `apps/api/src/common/guards/supabase-auth.guard.ts` -> `apps/api/src/modules/auth/guards/supabase-auth.guard.ts`
- Move: `apps/api/src/common/guards/supabase-auth.guard.test.ts` -> `apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts`
- Move: `apps/api/src/common/guards/supabase-machine-boundary.test.ts` -> `apps/api/src/modules/auth/guards/supabase-machine-boundary.test.ts`
- Modify (import path only): `apps/api/src/app.module.ts`, `apps/api/src/modules/auth/session-liveness.local.test.ts`, `apps/api/src/modules/finance/finance.boundary.test.ts`

**Interfaces:**
- Consumes: nothing new. Produces: `SupabaseAuthGuard` at `apps/api/src/modules/auth/guards/supabase-auth.guard.ts` (class unchanged); a test that fails when a non-test file under `apps/api/src/common` imports `apps/api/src/modules`.

- [ ] **Step 1: Write the failing boundary test**

Create `apps/api/src/common/import-boundary.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const src = path.resolve(__dirname, '..')
const common = path.join(src, 'common')
const modules = path.join(src, 'modules')

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// True when a specifier written in `file` points into src/modules.
function reachesModules(file: string, specifier: string): boolean {
  if (specifier === '@app/modules' || specifier.startsWith('@app/modules/')) return true
  if (!specifier.startsWith('.')) return false
  const target = path.resolve(path.dirname(file), specifier)
  return target === modules || target.startsWith(`${modules}${path.sep}`)
}

// Non-test TypeScript files under a folder; tests under common are integration fixtures and exempt.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

describe('api common import boundary', () => {
  it('detects every import form that reaches modules', () => {
    const file = path.join(common, 'authz', 'example.ts')
    const source = [
      "import { a } from '../../modules/auth/a'",
      "import type { B } from '@app/modules/rules/b'",
      "import '../../modules/storage/c'",
      "export { d } from '../../modules/users/d'",
      "const e = await import('../../modules/reports/e')",
      "import { f } from '../prisma/transaction'",
      "import { g } from '@pathways/shared'",
    ].join('\n')
    expect(specifiers(source).filter((specifier) => reachesModules(file, specifier))).toEqual([
      '../../modules/auth/a',
      '@app/modules/rules/b',
      '../../modules/storage/c',
      '../../modules/users/d',
      '../../modules/reports/e',
    ])
  })

  it('keeps common free of imports from modules', () => {
    const files = sourceFiles(common)
    expect(files.length).toBeGreaterThan(5)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((specifier) => reachesModules(file, specifier))
        .map((specifier) => `${path.relative(src, file).split(path.sep).join('/')} -> ${specifier}`),
    )
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/api exec vitest run src/common/import-boundary.test.ts`
Expected: the first test PASSES; the second FAILS listing exactly five lines, all from `common/guards/supabase-auth.guard.ts`: `../../modules/rules/rules-machine-boundary`, `../../modules/auth/authorized-operation-timing`, `../../modules/auth/beneficiary-step-up.service`, `../../modules/auth/token-auth.service`, `../../modules/auth/workspace-resolution.service`. If any other file is listed, stop and report it.

- [ ] **Step 3: Move the guard and its two tests**

```bash
mkdir -p apps/api/src/modules/auth/guards
git mv apps/api/src/common/guards/supabase-auth.guard.ts apps/api/src/modules/auth/guards/supabase-auth.guard.ts
git mv apps/api/src/common/guards/supabase-auth.guard.test.ts apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
git mv apps/api/src/common/guards/supabase-machine-boundary.test.ts apps/api/src/modules/auth/guards/supabase-machine-boundary.test.ts
cd apps/api/src/modules/auth/guards
sed -i \
  -e "s#'\.\./\.\./modules/rules/#'../../rules/#g" \
  -e "s#'\.\./\.\./modules/auth/#'../#g" \
  -e "s#'\.\./\.\./prisma/#'../../../prisma/#g" \
  -e "s#'\.\./decorators/#'../../../common/decorators/#g" \
  -e "s#'\.\./network/#'../../../common/network/#g" \
  -e "s#'\.\./authz/#'../../../common/authz/#g" \
  supabase-auth.guard.ts supabase-auth.guard.test.ts supabase-machine-boundary.test.ts
grep -n "from '\.\|import('\." supabase-auth.guard.ts supabase-auth.guard.test.ts supabase-machine-boundary.test.ts
cd /c/PATHWAYS
sed -i "s#'\./common/guards/supabase-auth.guard'#'./modules/auth/guards/supabase-auth.guard'#" apps/api/src/app.module.ts
sed -i "s#'\.\./\.\./common/guards/supabase-auth.guard'#'./guards/supabase-auth.guard'#" apps/api/src/modules/auth/session-liveness.local.test.ts
sed -i "s#'\.\./\.\./common/guards/supabase-auth.guard'#'../auth/guards/supabase-auth.guard'#" apps/api/src/modules/finance/finance.boundary.test.ts
git grep -n "common/guards" -- apps
rmdir apps/api/src/common/guards 2>/dev/null; ls apps/api/src/common
```

Expected: every relative specifier printed from the three moved files resolves (check each by eye: `../../rules/...`, `../<auth file>`, `./supabase-auth.guard`, `../../../common/...`, `../../../prisma/...`); `git grep -n "common/guards"` prints nothing; `apps/api/src/common` lists `audit authz decorators import-boundary.test.ts interceptors network prisma sentry.ts time validation` and no `guards`.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pathways/api exec vitest run src/common/import-boundary.test.ts src/modules/auth/guards
pnpm exec biome check --write apps/api/src/common/import-boundary.test.ts apps/api/src/modules/auth/guards apps/api/src/app.module.ts apps/api/src/modules/auth/session-liveness.local.test.ts apps/api/src/modules/finance/finance.boundary.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: both boundary tests and the moved guard tests pass; typecheck and lint pass; api passing count = Task 4 count + 2.

- [ ] **Step 5: Commit the move, then the boundary test**

```bash
git add apps/api/src/modules/auth/guards apps/api/src/app.module.ts apps/api/src/modules/auth/session-liveness.local.test.ts apps/api/src/modules/finance/finance.boundary.test.ts
git status --short apps/api/src
git commit -m "refactor(api): move the Supabase auth guard to modules/auth/guards

The guard and its two tests change import paths only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add apps/api/src/common/import-boundary.test.ts
git commit -m "test(api): fail when common imports modules

Biome 1.9 restricted imports match exact specifiers only, so the boundary is a Vitest architecture test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: before the first commit, `git status --short apps/api/src` shows the three `R` renames, the three `M` importers and `?? apps/api/src/common/import-boundary.test.ts`; after the second commit the tree is clean.

---

### Task 6: Records, SAD routing and living doc paths

**Files:**
- Modify: `scripts/sad/check.ts:19-29`, `scripts/sad/check.test.ts:80-83`, `docs/sad-pathways.md:36`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.2, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-08, MOD-09, MOD-10 rows)
- Modify: `docs/index.md` (CR row status; section 1.6 plan row)
- Modify: `docs/qad-pathways.md:228`, `docs/scrutiny-pathways.md:25`
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route the api kernel and guard to the organization isolation checker (ruling 8)**

In `scripts/sad/check.test.ts`, directly after the test `routes shared rbac policy changes to the organization isolation checker`, add:

```ts
  it('routes api authz, audit and guard changes to the organization isolation checker', () => {
    const files = [
      'apps/api/src/common/audit/write-audit-log.ts',
      'apps/api/src/common/authz/scoped-project.ts',
      'apps/api/src/modules/auth/guards/supabase-auth.guard.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['organization-isolation-checker']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test.

In `scripts/sad/check.ts`, `organization-isolation-checker` globs, add directly after `'packages/shared/src/rbac/**/*.ts',`:

```ts
      'apps/api/src/common/authz/**/*.ts',
      'apps/api/src/common/audit/**/*.ts',
      'apps/api/src/modules/auth/guards/**/*.ts',
```

In `docs/sad-pathways.md` line 36, after `` `packages/shared/src/rbac/**/*.ts`, `` insert `` `apps/api/src/common/authz/**/*.ts`, `apps/api/src/common/audit/**/*.ts`, `apps/api/src/modules/auth/guards/**/*.ts`, ``.

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad count = baseline + 1.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.1, replace

```text
Enforced by Biome import restrictions. The API `supabase-auth.guard` moves to `modules/auth/guards/`.
```

with

```text
Enforced for the API by `apps/api/src/common/import-boundary.test.ts`, because Biome 1.9 `noRestrictedImports` matches exact specifiers only and cannot express a folder rule (amended 2026-10-09 for F3a). The API `supabase-auth.guard` lives in `modules/auth/guards/`.
```

Section 3.2, replace

```text
`common/` holds `authz/` (identity, project scope, `withAuthorizedOperation`, `requireScopedProject`), `audit/` (`writeAuditLog`), `validation/` (zod pipe), `time/` (`businessDate`) and `prisma/` (`Tx`).
```

with

```text
`common/` holds `authz/` (application identity, project scope, `requireScopedProject`, and from F3b `withAuthorizedOperation`), `audit/` (`writeAuditLog`), `validation/` (zod pipe, F3b), `time/` (`currentBusinessDate`) and `prisma/` (`Tx`).
```

Section 3.7, replace the F3 row with two rows:

```text
| F3a | API kernel | `common/{prisma,time,authz,audit}`, `Tx`, `currentBusinessDate`, application identity and project scope in `common/authz`, shared `requireScopedProject`, `writeAuditLog`, guard moved to `auth/guards`, import boundary test for `common` | MOD-08, 09, 10 |
| F3b | API validation and wiring | contract pattern with one example (moved from F2), zod pipe, contract naming convention, `withAuthorizedOperation` in `common/authz`, storage factory injection, wiring test for object providers | MOD-11, 13 |
```

Section 9: append

```markdown
F3a applied 2026-10-09 on refactor/f3a-api-core:
- Kernel: `common/prisma/transaction.ts` (`Tx`, replacing 15 local aliases) and `common/time/business-date.ts` (`currentBusinessDate`, replacing the four copies that answer 503; activities uses the shared calendar date).
- Authz: `developer-access.ts` became `common/authz/application-identity.ts` (159 importers repointed); the developer bootstrap constants moved to `modules/auth/developer-bootstrap-identity.ts`; `projectScope` moved to `common/authz/project-scope.ts`.
- Scope: `requireScopedProject` and `requireScopedProjectRow` in `common/authz/scoped-project.ts` replace eleven private `requireProject` methods and the finance project check; every copy kept its select and its 404.
- Audit: `writeAuditLog` in `common/audit/write-audit-log.ts` replaces 63 inline `auditLog.create` calls and three private `audit()` helpers, with the caller's transaction and the same columns.
- Boundary: `SupabaseAuthGuard` and its tests moved to `modules/auth/guards`; `common/import-boundary.test.ts` fails when a non-test file under `common` imports `modules`; SAD organization isolation routing covers `common/authz`, `common/audit` and `modules/auth/guards`.

Deferred to F3b: zod pipe and the first contract, contract naming convention, `"sideEffects": false` for `packages/shared`, `withAuthorizedOperation` in `common/authz`, storage factory injection, wiring test for object providers. Left for the slices: the inline project-scope lookups (reports, activities, projects, project overview, beneficiary media, form export, analytics export, analytics insights, private proof inspection, step-up, route access) and the 140 direct `Prisma.TransactionClient` annotations; the seed audit write in `apps/api/prisma/local-demo-stage-evidence.ts` to W1.
```

- [ ] **Step 3: Close the audit findings and update the index**

- Audit: append to the disposition cell of MOD-08 `; closed by F3a.`, of MOD-09 `; closed by F3a.`, and of MOD-10 `; api side closed by F3a, web side F4.`
- `docs/index.md`: CR row status becomes `Approved; F1, F2 and F3a applied, F3b next`; add as the last row of the section 1.6 table: `| [F3 api core plan](superpowers/plans/2026-10-09-modularization-f3-api-core.md) | 2026-10-09-modularization-f3-api-core.md | 2026-10-09 | F3a of the codebase modularization, F3b outline | Executed (F3a); remove after merge |`. If the F2 plan row is still present, leave it.

- [ ] **Step 4: Update living doc paths**

- `docs/qad-pathways.md:228`: `apps/api/src/common/guards/supabase-auth.guard.test.ts` becomes `apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts`.
- `docs/scrutiny-pathways.md:25`: `apps/api/src/common/guards/supabase-auth.guard.ts` becomes `apps/api/src/modules/auth/guards/supabase-auth.guard.ts`.

```bash
git grep -n "common/guards\|developer-access" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: prints nothing.

- [ ] **Step 5: Activity log**

Add to `docs/activity-log.md`:

```markdown
## 2026-10-09 Modularization F3a api kernel (refactor/f3a-api-core)
```

with one bullet per Task 1 to Task 5 stating what moved or was replaced and the api test count recorded at the end of that task, a bullet saying the F3a decisions are recorded in the change record section 9 (the plan file is removed after merge, so record rulings 2, 4, 5 and 6 there in one sentence each), and a bullet listing the F3b scope. Task 7 Step 5 appends the gate results.

- [ ] **Step 6: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization F3a and route the api kernel to the isolation checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check prints exactly 6 failures (the Task 0 baseline; the plan row this task adds clears the untracked-plan failure).

---

### Task 7: Full release gates and merge

- [ ] **Step 1: Static gates**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f apps/api/dist/apps/api/src/common/authz/scoped-project.js && test -f apps/api/dist/apps/api/src/common/audit/write-audit-log.js && test -f apps/api/dist/apps/api/src/modules/auth/guards/supabase-auth.guard.js && test ! -e apps/api/dist/apps/api/src/common/guards && echo "dist layout ok"
```

Expected: all pass and `dist layout ok`. Versus Task 0, api passing = `B_api + 16` (business date 2, scoped project 9, audit 3, boundary 2), sad = baseline + 1, every other package unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs `csv-rbac.local.test.ts`, `reports-runtime.local.test.ts` and the other local suites, which now import identity types from `common/authz`).

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution or Nest dependency error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 and F2 gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke as a Project Manager: sign in, open a project (activities list loads with overdue labels), create and edit a milestone, record activity progress, open beneficiaries and edit one profile field, open an import batch and validate it, open evaluations, open the analytics timeline view, open the dashboard (action counts and overview cards), open budgets. As a System Administrator: open user management, update one user's role and project list, open a public preview. Then confirm the audit rows in the local Supabase Studio SQL editor (http://127.0.0.1:54323): `select action, entity_type, project_id is null as no_project, changes is null as no_changes from pathways.audit_logs order by occurred_at desc limit 15` lists the smoke actions with the expected NULLs (`MILESTONE_CREATED` has `no_changes = true`; `USER_AUTHORIZATION_UPDATED` has `no_project = true`).

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f3a/manifest.json
```

Dispatch every role the manifest requires (expect `restraint-guardian`, `design-qa-agent`, `organization-isolation-checker`, `beneficiary-privacy-guardian`, `metadata-import-validator` and `rule-engine-determinism-checker`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f3a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f3a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 6 activity-log section with the gate results (per-package counts, replay exit code, e2e pass counts, audit row check, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F3a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/f3a-api-core -m "Merge refactor/f3a-api-core into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not push `origin dev` until the developer says so. Keep this plan file until the F3b plan is written from its outline; then remove it in the F3b plan's first commit (`git rm docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md`, drop its index row) as CR section 6 requires.

---

## F3b outline (separate plan after F3a merges)

Branch `refactor/f3b-api-validation` from dev after the F3a merge. Same Global Constraints. Six tasks plus baseline:

1. **ZodPipe.** `apps/api/src/common/validation/zod-pipe.ts` (`PipeTransform`; on failure `BadRequestException({ statusCode: 400, message: string[], error: 'Bad Request' })`, messages as `<path> <zod message>` or the message alone for root issues). The global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform) skips a parameter whose design type is `Object`, which is what a zod-inferred type alias emits, so the two pipes never both validate one body. Unit test pins the 400 shape, a non-object body, an unknown key and the transformed output.
2. **First contract with a parity test (F2 ruling 2).** Example: `ValidateImportDto` (`POST /projects/:projectId/imports/:batchId/validate`, `{ expectedMappingRevision: int >= 1 }`). Chosen because it has no string length (class-validator counts a surrogate pair as one character, zod counts UTF-16 units) and no ISO 8601 date (validator.js `isISO8601` is hard to mirror). Create `packages/shared/src/contracts/imports/import-requests.ts` exporting `validateImportRequest = z.object({ expectedMappingRevision: z.number().int().min(1) }).strict()` and `type ValidateImportRequest`; a temporary parity test runs the configured `ValidationPipe` with `ValidateImportDto` and `ZodPipe` with the schema over the same inputs (valid ints, 0, -1, 1.5, `'1'`, `null`, missing key, extra key, array body, empty object) and compares accept or reject and the 400 shape; then the route switches to `@Body(new ZodPipe(validateImportRequest))`, `ValidateImportDto` and the parity test are deleted, the service takes `ValidateImportRequest`, and `controller-dto-runtime-metadata.test.ts` drops `ValidateImportDto`. Web sends a number and does not read the message.
3. **Naming convention and `sideEffects` (F2 final review).** Convention: contract schemas are `<verb><Entity>Request` and `<entity>Response` with `PascalCase` inferred types (CR 3.6), every new barrel export is domain-prefixed, and the seven generic rules names (`uuidSchema`, `decimalSchema`, `operators`, `reviewSchema`, `pageSchema`, `emptyBodySchema`, `confirmOutcomeSchema`) are renamed with a `rule` prefix in S7; record it in CR 3.6. Add `"sideEffects": false` to `packages/shared/package.json` after confirming no module-level side effects (`git grep` for top-level calls and `setErrorMap` under `packages/shared/src`); the web resolves `@pathways/shared` to source through tsconfig paths and `transpilePackages`, and the nearest `package.json` still governs tree shaking, so record the `Middleware` size from `next build` against the F2 value and keep the flag only if the build passes and the size does not grow.
4. **Authorized operation kernel.** `git mv` `modules/auth/authorized-operation.ts` and `authorized-operation-timing.ts` into `common/authz/`, and move the `readApplicationProfile` function (not `ApplicationProfileService`) out of `application-profile.service.ts` into `common/authz/application-profile.ts`. 87 importers and about 55 `vi.mock('../auth/authorized-operation')` or `vi.mock('@app/modules/auth/authorized-operation')` paths must move with the import, or the mocks silently stop applying; the plan must count mocks before and after. The boundary test proves `common` stays clean.
5. **Storage factory injection (MOD-13).** `createPrivateInspectionReader`, `createPrivateUploadVerifier` and `createPrivateObjectStreamer` are called directly in `activities.service.ts`, `private-proof-inspection.service.ts`, `beneficiary-media.service.ts`, `finance.service.ts` and `reports.service.ts`. The global `StorageModule` provides and exports a `PRIVATE_STORAGE_FACTORIES` value provider holding the three functions; the five services inject it. Each factory call stays inside its existing `try` block (a factory configuration error still maps to 503). Constructor changes reach `new <Service>(` in 18 activities files, 5 finance, 4 reports, 1 private-proof-inspection and 1 beneficiary-media file, including three seeds under `apps/api/prisma`; tests that `vi.mock('../storage/private-inspection-reader')` pass the mocked module object.
6. **Wiring test for object providers (F1 deferral).** `app-module-wiring.test.ts` also records `{ provide, useClass | useValue | useFactory }` providers keyed by their token and fails when one token is registered in two modules.
7. Records (CR 3.6 and section 9, MOD-11 and MOD-13 closed, index, activity log, remove this plan) and full release gates.
