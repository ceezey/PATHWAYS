# F2 Shared Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the authorization policy, one role catalog, the rules contract and metrics, and the constants both apps copy into `packages/shared`, so `apps/web` stops importing `apps/api` source and api and web stop carrying duplicate copies, with no behavior change beyond ruling 8.

**Architecture:** Everything new is exported through the `packages/shared/src/index.ts` barrel and imported as `@pathways/shared` (ruling 1). Each move is a `git mv` commit that carries only import-path changes and the minimal edits listed for it; logic edits (role catalog split, union of the rules copies, constant dedupe) follow in their own commits. Where two copies merge, a parity test runs the old web copy and the new shared module against the same inputs before the web copy is deleted.

**Tech Stack:** pnpm 11 workspace, TypeScript 5, zod 3.25, NestJS 10, Next.js 15 (Edge middleware), Vitest, Biome 1.9, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.4, 3.7 row F2, 7) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-01, MOD-02, MOD-03). Rulings below amend the spec where they differ.

## Rulings

Binding controller rulings, copied verbatim from the F2 rulings note (2026-10-09):

1. Barrel, not subpaths: export new shared code through packages/shared/src/index.ts; CR 3.4 amended. Why: no exports field, vitest string aliases break subpaths, built API resolves dist/index.js. Cost if wrong: switch to subpaths later with an exports map and regex aliases.
2. Contract pattern + example moves from F2 to F3 with the ZodPipe, so the first contract has a real consumer (an unused example would be dead code). Cost: none.
3. Calendar-date regex unification deferred to the slices: shared isCalendarDate is stricter (1900-2100, real dates), so swapping is not behavior-neutral. Cost: duplicated regex lingers until slices.
4. Keep pathwaysRoles UI order (SA last) as an ordered label list typed against roleNames; avatar-stack "And" label left (display change) and logged for S8. Cost: none.
5. Excluded from F2 (not identical across apps): parseAutomaticMappingReceipt, proofExtensions, exportFormats order, UI projectStatuses, 7 reverse-order severity enums.
6. Rules shared files under packages/shared/src/rules; scripts/sad/check.ts and docs/sad-pathways.md 3.1 rule-engine globs gain packages/shared/src/rules/**. Cost: SAD tooling change reviewed by restraint-guardian.
7. Strict rule metric cell schema renamed ruleMetricCellSchema to avoid the barrel collision with monitoring metricCellSchema.
8. Web timeline schema loses its two .default() calls by adopting the API version; only caller passes explicit values. Cost: a future caller omitting them gets a parse error instead of a default.
9. apps/api dev script builds workspace deps first so nest start never runs against stale packages/shared/dist.
10. ImportSummary moves to packages/imports (deferred from F1); metric-math exported directly from index; descriptive-analytics split deferred to S7.

## Global Constraints

- Behavior-preserving: no route, status code, response body, screen, label or permission change. The only accepted difference is ruling 8.
- New shared code is exported only through `packages/shared/src/index.ts` and imported as `@pathways/shared`; never `@pathways/shared/<subpath>`; no `exports` map is added to `packages/shared/package.json`.
- Inside `packages/shared` use relative imports only; shared code never imports `@pathways/shared` itself and never imports an app.
- Every exported name in the barrel is unique; `pnpm --filter @pathways/shared typecheck` fails with TS2308 on a collision, which is a stop-and-fix, never a rename of an existing export without a ruling.
- File moves use `git mv` and are committed separately from logic edits. A move commit carries only import-path changes plus the edits its task lists for that commit.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- After any change under `packages/shared`, run `pnpm --filter @pathways/shared build` before API typecheck, tests or build (the built API and Playwright resolve `packages/shared/dist`).
- `pnpm typecheck` and `next build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit.
- When an import is repointed to `@pathways/shared` in a file that already imports from `@pathways/shared`, merge the names into the existing statement (keep `import type` statements type-only, or use inline `type` modifiers).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/f2-shared-core`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files or review evidence; `.tmp/` is used only for gate and build logs.
- A web build counts only when it prints `web build exit=0`; the grep output alone proves nothing.
- After repointing imports in any task, run the Task 2 Step 3 duplicate-import detection loop and merge any second `@pathways/shared` statement into the first.

## Review Focus

1. Edge middleware now bundles the shared barrel (`middleware.ts` -> `lib/middleware.ts` -> `lib/rbac/route-access.ts` and `features/auth/auth-access.ts` -> `@pathways/shared`): `next build` must succeed and every protected route must still redirect or render as before. Task 2 Step 6 builds the web app, records the middleware size against the Task 0 baseline, and runs the intercepted role-routes Playwright suite.
2. The built API resolves `@pathways/shared` through the workspace symlink to `packages/shared/dist/index.js`, so a stale or incomplete `dist` fails only at runtime: Task 2 Step 6 and Task 4 Step 7 require the compiled modules and check the new exports; Task 1 makes `pnpm --filter @pathways/api dev` build workspace packages first.
3. Role names reach role lookups from untrusted strings (profile payloads, route checks); an inherited key such as `constructor` or `__proto__` must map to no role. Task 3 Step 1 pins this in `role-catalog.test.ts`.
4. A rule tester timeline input without `projectStatus` and `projectArchived` now fails instead of defaulting (ruling 8); every other input must compute the same observation. Task 5 Step 1 pins both in the parity test.
5. The PIN rule message is compared by value (`own-step-up-pin-form.tsx` checks `error.message`), and the shared PIN check now takes `unknown`; a non-string PIN must be rejected. Task 6 Step 1 pins the PIN rule in `beneficiary-step-up.test.ts` and the existing form tests cover the message.

## Out of F2 (recorded for later sub-projects)

- `apps/api/src/modules/auth/route-access.service.ts` (production) and `apps/api/src/modules/dashboards/dashboard-home-authorization-parity.test.ts` import `apps/web/src/lib/rbac/route-access.ts` by relative path (api to web). Not in the audit; proposed for F4 (`lib/rbac` split, route table into shared).
- `project-team-editor-dialog.tsx` `assignTargetRoles` and `project-team-selectors.tsx` `hideableTargets` map team fields to role codes; they are field tables, not role catalogs, and stay.
- Contract pattern and example (F3, ruling 2); calendar-date regex unification (slices, ruling 3); `descriptive-analytics` split (S7, ruling 10); avatar-stack "And" label (S8, ruling 4).

---

### Task 0: Branch setup and baseline

**Files:** none changed except the committed plan.

- [ ] **Step 1: Confirm local dev contains F1 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f1-dead-code into dev"
test -f apps/web/src/test/fixtures/fixture-roles.ts && echo "F1 tree present"
git checkout -b refactor/f2-shared-core
pnpm install --frozen-lockfile
```

Expected: clean status, the F1 merge commit (`5de68b0a` or later) and `F1 tree present` printed, install succeeds. If either is missing, stop and report: F2 builds on the F1 tree.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web build > .tmp/f2-web-build.log 2>&1; echo "web build exit=$?"
grep -iE "middleware|error" .tmp/f2-web-build.log
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing test count (shared, imports, config, api, web), the `Middleware` size line, and the docs check failure count. Later tasks compare against these numbers.

- [ ] **Step 3: Commit the plan**

The controller has saved this plan as `docs/superpowers/plans/2026-10-09-modularization-f2-shared-core.md`.

```bash
git add docs/superpowers/plans/2026-10-09-modularization-f2-shared-core.md
git commit -m "docs: add the F2 shared core plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Shared package hygiene and API dev freshness

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/monitoring/metric-contract.ts:10`
- Modify: `packages/shared/src/monitoring/metric-contract.test.ts:2-16`
- Modify: `packages/shared/src/types/common.ts` (remove `ImportSummary`)
- Modify: `packages/imports/src/mappers/summary.ts`
- Modify: `apps/api/package.json` (`dev`, `dev:watch`)

**Interfaces:**
- Produces: `metric-math` names (`scaledDecimal`, `decimalString`, `normalizeMetricDecimal`, `numericMetric`, `missingMetric`, `indicatorProgress`, `isCalendarDate`, `businessCalendarDate`, `validateMetricPeriod`, `numericKinds`, `NumericKind`, `MetricDirection`, `MetricState`, `MetricCell`) exported from the barrel by `./monitoring/metric-math` directly. `ImportSummary` exported from `@pathways/imports` (`packages/imports/src/mappers/summary.ts`), no longer from `@pathways/shared`.

- [ ] **Step 1: Export metric-math directly**

In `packages/shared/src/index.ts`, add this line directly above `export * from './monitoring/metric-contract'`:

```ts
export * from './monitoring/metric-math'
```

In `packages/shared/src/monitoring/metric-contract.ts`, delete line 10 (`export * from './metric-math'`).

In `packages/shared/src/monitoring/metric-contract.test.ts`, replace the import block (lines 2-16) with:

```ts
import {
  createIndicatorDraftSchema,
  createIndicatorSchema,
  dashboardQuerySchema,
  manualMeasurementSchema,
  metricCellSchema,
  monitoringIndicatorSchema,
  sadddAgeBands,
} from './metric-contract'
import {
  businessCalendarDate,
  indicatorProgress,
  isCalendarDate,
  normalizeMetricDecimal,
  numericMetric,
  validateMetricPeriod,
} from './metric-math'
```

- [ ] **Step 2: Move ImportSummary to packages/imports**

In `packages/shared/src/types/common.ts`, delete the `ImportSummary` interface (the last 8 lines, from `export interface ImportSummary {` to its closing `}`) and the blank line before it.

Replace the whole of `packages/imports/src/mappers/summary.ts` with:

```ts
export interface ImportSummary {
  fileName: string
  fileType: 'csv' | 'xlsx' | 'xls'
  totalRows: number
  totalColumns: number
  headers: string[]
  warnings: string[]
}

export const createFileSummary = (
  fileName: string,
  fileType: ImportSummary['fileType'],
  headers: string[],
  rows: Record<string, unknown>[],
  warnings: string[] = [],
): ImportSummary => ({
  fileName,
  fileType,
  headers,
  totalRows: rows.length,
  totalColumns: headers.length,
  warnings,
})
```

Confirm nothing else used it:

```bash
git grep -n "ImportSummary" -- apps packages
```

Expected: only `packages/imports/src/mappers/summary.ts`.

- [ ] **Step 3: Build workspace packages before the API dev server (ruling 9)**

In `apps/api/package.json` replace the two scripts with:

```json
    "dev": "pnpm --filter \"@pathways/api^...\" run build && node ../../infra/supabase/security-adapter/dev-local.mjs",
    "dev:watch": "pnpm --filter \"@pathways/api^...\" run build && node ../../infra/supabase/security-adapter/dev-local.mjs --watch",
```

The prefix is the same one the existing `build` script uses; it builds `@pathways/shared`, `@pathways/imports` and `@pathways/config` once at start.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @pathways/shared build
pnpm --filter @pathways/shared typecheck && pnpm --filter @pathways/shared test
pnpm --filter @pathways/imports typecheck && pnpm --filter @pathways/imports test
pnpm typecheck && pnpm lint
pnpm --filter "@pathways/api^..." run build
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; shared and imports test counts equal the Task 0 baseline.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src packages/imports/src/mappers/summary.ts apps/api/package.json
git commit -m "refactor(shared): export metric-math directly, move ImportSummary to imports, build deps before api dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move the authorization policy into packages/shared

**Files:**
- Move: `apps/api/src/modules/auth/authorization-policy.ts` -> `packages/shared/src/rbac/authorization-policy.ts`
- Move: `apps/api/src/modules/auth/authorization-policy.test.ts` -> `packages/shared/src/rbac/authorization-policy.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify (import path only), 77 files:
  - api prisma (4): `apps/api/prisma/authorization-bootstrap.local.test.ts`, `canonical-seed.ts`, `hosted-realistic-seed.ts`, `local-synthetic-seed.ts`
  - api production (28): `apps/api/src/common/decorators/permission.decorator.ts`, `apps/api/src/common/guards/supabase-auth.guard.ts`, `modules/activities/activities.service.ts`, `modules/activities/private-proof-inspection.service.ts`, `modules/activity-extensions/activity-extensions.service.ts`, `modules/analytics-insights/analytics-insights.service.ts`, `modules/auth/application-profile.service.ts`, `modules/auth/authorized-data.service.ts`, `modules/auth/authorized-operation.ts`, `modules/auth/workspace-resolution.service.ts`, `modules/beneficiaries/beneficiaries.service.ts`, `modules/beneficiaries/beneficiary-progress.ts`, `modules/beneficiary-media/beneficiary-media.service.ts`, `modules/dashboards/action-counts.service.ts`, `modules/dashboards/analytics.service.ts`, `modules/dashboards/dashboards.service.ts`, `modules/dashboards/role-overview.service.ts`, `modules/evaluations/evaluations.service.ts`, `modules/finance/finance.service.ts`, `modules/metadata/metadata.service.ts`, `modules/participants/participants.service.ts`, `modules/projects/project-overview-metrics.service.ts`, `modules/projects/projects.service.ts`, `modules/reports/report-project-status-source.ts`, `modules/reports/reports.service.ts`, `modules/rules/rules-human.service.ts`, `modules/users/users.dto.ts`, `modules/users/users.service.ts` (all under `apps/api/src/`)
  - api tests (37, under `apps/api/src/modules/`): `activities/activity-capabilities.test.ts` (static and dynamic import), `activities/evidence-list.access.test.ts`, `activity-extensions/activity-extensions.service.test.ts`, `analytics-insights/analytics-insights.test.ts`, `audit/audit.service.test.ts`, `auth/csv-rbac.local.test.ts`, `auth/csv-rbac.test.ts`, `auth/route-access.service.test.ts`, `auth/rule-based-access-alignment.test.ts`, `auth/workspace-resolution.service.test.ts`, `beneficiaries/beneficiaries.service.test.ts`, `beneficiaries/identity-review.service.test.ts`, `dashboards/action-counts.service.test.ts`, `dashboards/analytics.service.test.ts`, `dashboards/dashboard-home-authorization-parity.test.ts`, `dashboards/role-overview.controller.test.ts`, `dashboards/role-overview.service.test.ts`, `evaluations/evaluation-metrics.test.ts`, `evaluations/evaluations.assessment-detail.test.ts`, `evaluations/evaluations.beneficiary-assessments.test.ts`, `evaluations/evaluations.service.test.ts`, `evaluations/evaluations.write-path.test.ts`, `finance/finance.boundary.test.ts`, `finance/finance.ledger.test.ts`, `finance/finance.service.test.ts`, `imports/mapping-confirmation.service.test.ts`, `metadata/form-definition-export.service.test.ts`, `metadata/metadata.f5-gates.test.ts`, `metadata/metadata.generate.test.ts`, `metadata/metadata.service.test.ts`, `participants/journeys-access.test.ts`, `participants/participants.service.test.ts`, `projects/project-overview-metrics.service.test.ts`, `projects/projects.controller.test.ts`, `reports/reports-runtime.local.test.ts`, `reports/reports.service.test.ts`, `rules/rules-human-escalated.test.ts`
  - web (8): `apps/web/e2e/role-routes.spec.ts`, `apps/web/src/features/projects/project-activities-rbac.test.tsx`, `apps/web/src/features/projects/project-team-editor-dialog.tsx` (also the comment on line 28), `apps/web/src/features/projects/project-team-selectors.tsx`, `apps/web/src/lib/rbac/access-matrix.ts`, `apps/web/src/lib/rbac/route-access.ts`, `apps/web/src/lib/rbac/server-access.test.ts`, `apps/web/src/lib/rbac/ui-action-availability.ts`

**Interfaces:**
- Produces: from `@pathways/shared`: `roleNames`, `CanonicalRole`, `permissionCodes`, `AtomicPermission`, `rolePermissions`, `isCanonicalRole(role: string): role is CanonicalRole`, `hasAtomicPermission(role: string, granted: readonly string[], permission: string): boolean`, `aggregateOnlyRoles: readonly string[]`, `canAuthorizeRole(actor: CanonicalRole, target: CanonicalRole): boolean`, `canAssignRole(actor: CanonicalRole, target: CanonicalRole): boolean`. Names and signatures are unchanged by this task.

- [ ] **Step 1: Confirm the importer list and that nothing mocks the policy or the barrel**

```bash
git grep -l "authorization-policy'" -- apps | grep -v "authorization-policy.test.ts$" | wc -l
git grep -n "mock('@pathways/shared'\|mock(.*authorization-policy" -- apps packages
```

Expected: `77`; the second command prints nothing.

- [ ] **Step 2: Move the files and export them**

```bash
mkdir -p packages/shared/src/rbac
git mv apps/api/src/modules/auth/authorization-policy.ts packages/shared/src/rbac/authorization-policy.ts
git mv apps/api/src/modules/auth/authorization-policy.test.ts packages/shared/src/rbac/authorization-policy.test.ts
```

Append to `packages/shared/src/index.ts`:

```ts

export * from './rbac/authorization-policy'
```

- [ ] **Step 3: Repoint every importer**

```bash
git grep -l "authorization-policy'" -- apps | xargs sed -i "s#'[./@a-zA-Z-]*authorization-policy'#'@pathways/shared'#g"
git grep -n "authorization-policy'" -- apps
```

Expected: the second command prints nothing. `activity-capabilities.test.ts:31` now reads `await import('@pathways/shared')`.

These 18 files already imported from `@pathways/shared`; merge the new names into the existing statement in each: `activity-extensions/activity-extensions.service.test.ts`, `activity-extensions/activity-extensions.service.ts`, `analytics-insights/analytics-insights.service.ts`, `beneficiaries/beneficiaries.service.ts`, `dashboards/action-counts.service.test.ts`, `dashboards/action-counts.service.ts`, `dashboards/analytics.service.test.ts`, `dashboards/analytics.service.ts`, `dashboards/dashboards.service.ts`, `dashboards/role-overview.service.test.ts`, `dashboards/role-overview.service.ts`, `evaluations/evaluation-metrics.test.ts`, `metadata/metadata.service.ts`, `projects/project-overview-metrics.service.test.ts`, `projects/project-overview-metrics.service.ts`, `projects/projects.service.ts`, `reports/report-project-status-source.ts`, `reports/reports.service.ts` (all under `apps/api/src/modules/`). List any file that now has two statements from `@pathways/shared`:

```bash
for f in $(git diff --name-only --diff-filter=AM HEAD -- apps); do [ "$(grep -c "from '@pathways/shared'" "$f")" -gt 1 ] && echo "$f"; done
```

Expected after merging: prints nothing.

In `apps/web/src/features/projects/project-team-editor-dialog.tsx` line 28 replace `apps/api/src/modules/auth/authorization-policy.ts,` with `packages/shared/src/rbac/authorization-policy.ts,`.

- [ ] **Step 4: Format and check**

```bash
git add -N packages/shared/src apps/api/src apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/shared build
pnpm --filter @pathways/shared typecheck && pnpm typecheck && pnpm lint
```

Expected: all pass.

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @pathways/shared test && pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
```

Expected: pass. Shared count = baseline + the policy test's cases; api count = baseline minus the same number; web count unchanged.

- [ ] **Step 6: Production build, compiled API resolution and Edge middleware**

```bash
pnpm --filter @pathways/api build
(cd apps/api && node -e "const s=require('@pathways/shared'); const r=require('./dist/apps/web/src/lib/rbac/route-access.js'); if (!s.rolePermissions.SYSTEM_ADMINISTRATOR.length || typeof s.hasAtomicPermission !== 'function' || typeof r.matchRoute !== 'function') process.exit(1); console.log('dist ok')")
pnpm --filter @pathways/web build > .tmp/f2-web-build.log 2>&1; echo "web build exit=$?"
grep -iE "middleware|error" .tmp/f2-web-build.log
npx playwright test --config playwright.auth-navigation.config.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: `dist ok`; web build succeeds and prints the `Middleware` size (record it; report to the controller if it exceeds 1 MB or grew by more than 100 kB over Task 0); the intercepted mfa-access and role-routes Playwright suites pass (they need no running app).

- [ ] **Step 7: Commit**

```bash
git add -A apps packages/shared/src
git commit -m "refactor(shared): move the authorization policy to packages/shared/src/rbac

Web and api import it from @pathways/shared, so web no longer imports api source for the policy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One role catalog

**Files:**
- Create: `packages/shared/src/rbac/role-catalog.ts`
- Create: `packages/shared/src/rbac/role-catalog.test.ts`
- Modify: `packages/shared/src/rbac/authorization-policy.ts` (lines 5-13 and 451-453 move out)
- Modify: `packages/shared/src/rbac/authorization-policy.test.ts` (imports)
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/auth/auth-access.ts` (`canonicalRoles`)
- Modify: `apps/web/src/lib/services/pathways-client.ts` (`roleCodeByName`, lines 1760-1767)
- Modify: `apps/web/src/lib/rbac/access-matrix.ts` (`roleCodesByName`, lines 95-99)
- Modify: `apps/web/src/lib/rbac/route-access.ts` (`DisplayRole`, `roleKey`)
- Modify: `apps/web/src/lib/rbac/ui-action-availability.ts` (lines 65-67)
- Modify: `apps/web/src/types/pathways-role.ts`, `apps/web/src/types/pathways-role.test.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx:35,49`, `apps/web/src/features/dashboard/role-dashboard.tsx:52,457`, `apps/web/src/features/settings/user-management-workspace.tsx:58,496,620,763,842,901`, `apps/web/src/features/projects/project-team-selectors.tsx:52-59,116,130,138,141,258`
- Delete: `apps/web/src/test/fixtures/fixture-roles.ts`
- Modify: `apps/web/src/test/fixtures/fixture-types.ts:1,201`

**Interfaces:**
- Consumes: Task 2 policy in `packages/shared/src/rbac/authorization-policy.ts`.
- Produces: from `@pathways/shared`: `roleNames` (unchanged object), `CanonicalRole`, `RoleName = (typeof roleNames)[CanonicalRole]`, `roleCodeByName: Record<RoleName, CanonicalRole>`, `isCanonicalRole(role: string): role is CanonicalRole`, `roleCodeFor(name: string): CanonicalRole | undefined`. Web `PathwaysRole` becomes an alias of `RoleName`; `pathwaysRoles` keeps its order; `getPathwaysRoleDisplayName` is removed (it returned its argument).

- [ ] **Step 1: Write the failing catalog test**

Create `packages/shared/src/rbac/role-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  type CanonicalRole,
  type RoleName,
  isCanonicalRole,
  roleCodeByName,
  roleCodeFor,
  roleNames,
} from './role-catalog'

const entries = Object.entries(roleNames) as Array<[CanonicalRole, RoleName]>

describe('role catalog', () => {
  it('maps six role codes to six distinct names and back', () => {
    expect(entries).toHaveLength(6)
    expect(new Set(Object.values(roleNames)).size).toBe(6)
    for (const [code, name] of entries) {
      expect(roleCodeByName[name]).toBe(code)
      expect(roleCodeFor(name)).toBe(code)
      expect(isCanonicalRole(code)).toBe(true)
    }
  })

  it('finds no role for unknown, cased or inherited keys', () => {
    for (const value of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'Administrator', 'system administrator', 'SYSTEM_ADMINISTRATOR'])
      expect(roleCodeFor(value)).toBeUndefined()
    for (const value of ['constructor', '__proto__', 'ADMIN', 'System Administrator'])
      expect(isCanonicalRole(value)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/shared exec vitest run src/rbac/role-catalog.test.ts`
Expected: FAIL, cannot resolve `./role-catalog`.

- [ ] **Step 3: Create the catalog and slim the policy**

Create `packages/shared/src/rbac/role-catalog.ts`:

```ts
// The six canonical role codes and their display names, the one role catalog for api and web.
export const roleNames = {
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  GRANT_MANAGER: 'Grant Manager',
  PROJECT_MANAGER: 'Project Manager',
  MONITORING_AND_EVALUATION_OFFICER: 'Monitoring and Evaluation Officer',
  PROJECT_OFFICER: 'Project Officer',
} as const
export type CanonicalRole = keyof typeof roleNames
export type RoleName = (typeof roleNames)[CanonicalRole]

// Display name to role code, the inverse of roleNames.
export const roleCodeByName = Object.fromEntries(
  Object.entries(roleNames).map(([code, name]) => [name, code]),
) as Record<RoleName, CanonicalRole>

export function isCanonicalRole(role: string): role is CanonicalRole {
  return Object.hasOwn(roleNames, role)
}

// Role code for an untrusted display name, or undefined when the name is not a catalog role.
export function roleCodeFor(name: string): CanonicalRole | undefined {
  return Object.hasOwn(roleCodeByName, name) ? roleCodeByName[name as RoleName] : undefined
}
```

In `packages/shared/src/rbac/authorization-policy.ts`:
- Delete lines 5-13 (`export const roleNames = { ... } as const` and `export type CanonicalRole = keyof typeof roleNames`).
- Delete the `isCanonicalRole` function (3 lines plus the blank line after it).
- Directly below the opening `/** CSV RBAC contract ... */` comment add `import { type CanonicalRole, isCanonicalRole } from './role-catalog'`.

In `packages/shared/src/rbac/authorization-policy.test.ts` replace the import block with:

```ts
import {
  canAssignRole,
  canAuthorizeRole,
  hasAtomicPermission,
  permissionCodes,
  rolePermissions,
} from './authorization-policy'
import { type CanonicalRole, roleNames } from './role-catalog'
```

In `packages/shared/src/index.ts`, add `export * from './rbac/role-catalog'` directly above `export * from './rbac/authorization-policy'`.

- [ ] **Step 4: Run the shared tests**

```bash
pnpm --filter @pathways/shared typecheck && pnpm --filter @pathways/shared test && pnpm --filter @pathways/shared build
```

Expected: PASS; the two new cases are added to the shared count.

- [ ] **Step 5: Write the failing web role order test**

Replace the whole of `apps/web/src/types/pathways-role.test.ts` with:

```ts
import { roleNames } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from './pathways-role'

describe('PATHWAYS role display order', () => {
  it('lists every catalog role name exactly once', () => {
    expect([...pathwaysRoles].sort()).toEqual(Object.values(roleNames).sort())
  })

  it('keeps the UI order with System Administrator last', () => {
    expect(pathwaysRoles).toEqual([
      'Program Manager',
      'Grant Manager',
      'Project Manager',
      'Monitoring and Evaluation Officer',
      'Project Officer',
      'System Administrator',
    ])
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/types/pathways-role.test.ts`
Expected: PASS already (the list is unchanged); this test pins the order before the file is rewritten.

- [ ] **Step 6: Replace the web role maps**

Replace the whole of `apps/web/src/types/pathways-role.ts` with:

```ts
import type { RoleName } from '@pathways/shared'

// Role names in UI display order, System Administrator last; codes live in the shared role catalog.
export const pathwaysRoles = [
  'Program Manager',
  'Grant Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const satisfies readonly RoleName[]

export type PathwaysRole = RoleName
```

`apps/web/src/features/auth/auth-access.ts`:
- Delete the `canonicalRoles` constant (lines 7-14).
- Add `import { type CanonicalRole, roleNames } from '@pathways/shared'`.
- Replace `z.array(z.enum(Object.keys(canonicalRoles) as [keyof typeof canonicalRoles])).length(1)` with `z.array(z.enum(Object.keys(roleNames) as [CanonicalRole])).length(1)`.
- Replace `canonicalRoles[profile.roles[0]]` with `roleNames[profile.roles[0]]`.

`apps/web/src/lib/services/pathways-client.ts`:
- Delete the local `const roleCodeByName: Record<PathwaysRole, string> = { ... }` (lines 1760-1767).
- Add `roleCodeByName` to the existing `import { ... } from '@pathways/shared'` statement. The two `roleCodeByName[input.role]` call sites stay as they are.

`apps/web/src/lib/rbac/access-matrix.ts`:
- Delete `const roleCodesByName = Object.fromEntries(...) as Record<PathwaysRole, CanonicalRole>` (lines 96-99); keep `const entries = ...` on line 95.
- Replace both `roleCodesByName[name]` with `roleCodeByName[name]`.
- Add `roleCodeByName` to its `@pathways/shared` import.

`apps/web/src/lib/rbac/route-access.ts`:
- Delete `type DisplayRole = (typeof roleNames)[CanonicalRole]` and the two-line `const roleKey = (role: DisplayRole) => ...` helper.
- Replace every `DisplayRole` with `RoleName` (three signatures) and both `roleKey(role)` with `roleCodeFor(role)`.
- The `@pathways/shared` import becomes `{ type AtomicPermission, type RoleName, hasAtomicPermission, roleCodeFor, rolePermissions }` (drop `CanonicalRole` and `roleNames` if no other use remains; check with `grep -n "CanonicalRole\|roleNames" apps/web/src/lib/rbac/route-access.ts`).

`apps/web/src/lib/rbac/ui-action-availability.ts`:
- Replace the three-line `const roleCode = (Object.keys(roleNames) as CanonicalRole[]).find(...)` with `const roleCode = roleCodeFor(role)`.
- Add `roleCodeFor` to its `@pathways/shared` import and drop `roleNames` and `CanonicalRole` if no other use remains.

Remove the identity display-name helpers:
- `apps/web/src/components/layout/app-shell.tsx`: delete the `getPathwaysRoleDisplayName` import; replace `role ? getPathwaysRoleDisplayName(role) : 'Access pending'` with `role || 'Access pending'`.
- `apps/web/src/features/dashboard/role-dashboard.tsx`: import only `type PathwaysRole` from `@/types/pathways-role`; replace `role ? getPathwaysRoleDisplayName(role) : 'Staff'` with `role || 'Staff'`.
- `apps/web/src/features/settings/user-management-workspace.tsx`: import only `type PathwaysRole`; replace each `getPathwaysRoleDisplayName(X)` with `X` (five sites: `summary.role`, `user.role` twice, `role`, `editor.role`).
- `apps/web/src/features/projects/project-team-selectors.tsx`: delete the identity `roleLabels` map (lines 52-59) and replace each `roleLabels[role]` with `role` (five template strings).

Confirm none remain:

```bash
git grep -n "getPathwaysRoleDisplayName\|canonicalRoles\|roleCodesByName\|roleLabels\|DisplayRole\|roleKey(" -- apps
```

Expected: prints nothing.

Fixtures:

```bash
git rm apps/web/src/test/fixtures/fixture-roles.ts
```

In `apps/web/src/test/fixtures/fixture-types.ts` replace line 1 with `import type { PathwaysRole } from '@/types/pathways-role'` and `role: PrototypeRole` with `role: PathwaysRole`.

- [ ] **Step 7: Verify**

```bash
git add -N packages/shared/src apps/api/src apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
npx playwright test --config playwright.auth-navigation.config.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass. Web count = Task 2 web count (the role display test file keeps two cases). API count unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A apps packages/shared/src
git commit -m "refactor(shared): one role catalog for api and web

Web role code maps, the identity display-name maps and the fixture role list now use roleNames, roleCodeByName and roleCodeFor from @pathways/shared; pathwaysRoles keeps the UI order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Move the api rules contract and metrics into packages/shared

**Files:**
- Move: `apps/api/src/modules/rules/rule-contract.ts` -> `packages/shared/src/rules/rule-contract.ts`
- Move: `apps/api/src/modules/rules/rule-metrics.ts` -> `packages/shared/src/rules/rule-metrics.ts`
- Move: `apps/api/src/modules/rules/rule-metrics.test.ts` -> `packages/shared/src/rules/rule-metrics.test.ts`
- Move: `apps/api/src/modules/rules/rules-human-contract.ts` -> `packages/shared/src/rules/rules-human-contract.ts`
- Move: `apps/api/src/modules/rules/rules-human-contract.test.ts` -> `packages/shared/src/rules/rules-human-contract.test.ts`
- Move: `apps/web/src/features/analytics/rules-validation.test.ts` -> `packages/shared/src/rules/rule-contract.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/rules/alert-lifecycle.ts:1-13`, `apps/api/src/modules/rules/alert-lifecycle.test.ts:2-10`
- Modify (imports): `apps/api/src/modules/rules/rule-engine.ts`, `apps/api/src/modules/rules/rule-engine.test.ts`, `apps/api/src/modules/rules/rules-human-escalated.test.ts`, `apps/api/src/modules/rules/rules-human.service.ts`, `apps/api/src/modules/dashboards/descriptive-analytics.ts`, `apps/api/src/modules/dashboards/analytics.service.test.ts`, `apps/web/src/features/analytics/rule-timeline-contract.test.ts:2`

**Interfaces:**
- Produces: from `@pathways/shared`, everything the api `rule-contract.ts`, `rule-metrics.ts` and `rules-human-contract.ts` exported, unchanged except the rename `metricCellSchema` -> `ruleMetricCellSchema` (ruling 7), plus `alertStatuses` and `decisionOutcomes` now exported from `rules-human-contract.ts`. Key names: `RULE_CONTRACT_VERSION`, `MAX_CONDITIONS`, `ruleMetrics`, `RuleMetricKey`, `uuidSchema`, `decimalSchema`, `conditionIdSchema`, `operators`, `RuleCondition`, `RuleGroup`, `RuleNode`, `parseRuleTree(input: unknown): RuleNode`, `recommendationSchema`, `ruleDefinitionSchema`, `RuleDefinition`, `metricReasons`, `ruleMetricCellSchema`, `metricObservationSchema`, `MetricObservation`, `indicatorObservation`, `timelineObservation`, `activityObservation`, `activityAggregateCells`, `budgetObservation`, `beneficiaryFollowUpObservation`, `surveyImprovementObservation` (each `(input: unknown) => MetricObservation` except `activityAggregateCells`), `revisionSchema`, `createRuleSchema`, `draftRuleSchema`, `reviewSchema`, `pageSchema`, `escalatedAlertOutputSchema`.
- The web copies (`rules-validation.ts`, `rule-test-metrics.ts`, `rules-human-contract.ts` under `apps/web/src/features/analytics`) stay untouched in this task; Task 5 merges and deletes them.

- [ ] **Step 1: Confirm the importer list**

```bash
git grep -n "rule-contract'\|rule-metrics'\|rules-human-contract'\|alert-lifecycle'" -- apps packages
git grep -n "export \(const\|function\|type\) metricCellSchema" -- packages/shared/src
```

Expected: the importers listed under Files (plus the moved files' own imports and the web copies' imports of `./rules-validation`); the second command shows the monitoring `metricCellSchema` in `metric-contract.ts`, which is why the rules one is renamed.

- [ ] **Step 2: Move the files**

```bash
mkdir -p packages/shared/src/rules
git mv apps/api/src/modules/rules/rule-contract.ts packages/shared/src/rules/rule-contract.ts
git mv apps/api/src/modules/rules/rule-metrics.ts packages/shared/src/rules/rule-metrics.ts
git mv apps/api/src/modules/rules/rule-metrics.test.ts packages/shared/src/rules/rule-metrics.test.ts
git mv apps/api/src/modules/rules/rules-human-contract.ts packages/shared/src/rules/rules-human-contract.ts
git mv apps/api/src/modules/rules/rules-human-contract.test.ts packages/shared/src/rules/rules-human-contract.test.ts
git mv apps/web/src/features/analytics/rules-validation.test.ts packages/shared/src/rules/rule-contract.test.ts
```

Append to `packages/shared/src/index.ts`:

```ts

export * from './rules/rule-contract'
export * from './rules/rule-metrics'
export * from './rules/rules-human-contract'
```

- [ ] **Step 3: Make the moved files compile inside packages/shared**

`packages/shared/src/rules/rule-contract.ts`:
- Replace the `import { isCalendarDate, normalizeMetricDecimal, numericKinds, scaledDecimal } from '@pathways/shared'` block (lines 1-6) with `import { isCalendarDate, normalizeMetricDecimal, numericKinds, scaledDecimal } from '../monitoring/metric-math'`.
- Rename `export const metricCellSchema = z` to `export const ruleMetricCellSchema = z` and its one use `cell: metricCellSchema,` (inside `metricObservationSchema`) to `cell: ruleMetricCellSchema,`.

`packages/shared/src/rules/rule-metrics.ts`, replace the two import blocks (lines 1-21) with:

```ts
import { z } from 'zod'
import { metricCellSchema as sharedCellSchema } from '../monitoring/metric-contract'
import {
  decimalString,
  indicatorProgress,
  isCalendarDate,
  normalizeMetricDecimal,
  numericKinds,
  scaledDecimal,
  numericMetric as sharedNumericMetric,
} from '../monitoring/metric-math'
import {
  type MetricObservation,
  type RuleMetricKey,
  conditionIdSchema,
  decimalSchema,
  metricObservationSchema,
  metricReasons,
  ruleMetricCellSchema,
  uuidSchema,
} from './rule-contract'
```

and in `function numericMetric` replace `return metricCellSchema.parse(sharedNumericMetric(value))` with `return ruleMetricCellSchema.parse(sharedNumericMetric(value))`.

`packages/shared/src/rules/rules-human-contract.ts`, replace lines 1-11 (the `zod`, `./alert-lifecycle` and `./rule-contract` imports) with:

```ts
import { z } from 'zod'
import {
  decimalSchema,
  operators,
  parseRuleTree,
  recommendationSchema,
  ruleMetricCellSchema,
  ruleMetrics,
  uuidSchema,
} from './rule-contract'

export const alertStatuses = [
  'NEW',
  'REVIEWED',
  'ACTIONED',
  'RESOLVED',
  'DISMISSED',
  'AUTO_RESOLVED',
] as const
export const decisionOutcomes = ['ACCEPT', 'PARTIALLY_ACCEPT', 'DECLINE', 'ESCALATE'] as const
```

and replace its one `cell: metricCellSchema,` with `cell: ruleMetricCellSchema,`.

`packages/shared/src/rules/rule-contract.test.ts` (the former web test):

```bash
sed -i "s/\bmetricCellSchema\b/ruleMetricCellSchema/g; s#'./rules-validation'#'./rule-contract'#" packages/shared/src/rules/rule-contract.test.ts
```

`rule-metrics.test.ts` and `rules-human-contract.test.ts` keep their `./rule-metrics` and `./rules-human-contract` imports unchanged.

- [ ] **Step 4: Point alert-lifecycle at the shared lists**

In `apps/api/src/modules/rules/alert-lifecycle.ts` replace lines 1-13 (the `zod` import, the `alertStatuses` and `decisionOutcomes` constants and their two types) with:

```ts
import { alertStatuses, decisionOutcomes } from '@pathways/shared'
import { z } from 'zod'

type AlertStatus = (typeof alertStatuses)[number]
type DecisionOutcome = (typeof decisionOutcomes)[number]
```

In `apps/api/src/modules/rules/alert-lifecycle.test.ts` replace the import block (lines 2-10) with:

```ts
import { alertStatuses, decisionOutcomes } from '@pathways/shared'
import {
  applyEvaluation,
  applyHumanAction,
  canAutoResolveRecommendation,
  initialEpisodeCursor,
  supersedeEpisode,
} from './alert-lifecycle'
```

- [ ] **Step 5: Repoint the api importers and the one web test**

```bash
sed -i "s#'\./rule-contract'#'@pathways/shared'#; s#'\./rules-human-contract'#'@pathways/shared'#" apps/api/src/modules/rules/rule-engine.ts apps/api/src/modules/rules/rule-engine.test.ts apps/api/src/modules/rules/rules-human-escalated.test.ts apps/api/src/modules/rules/rules-human.service.ts
sed -i "s#'\.\./rules/rule-metrics'#'@pathways/shared'#" apps/api/src/modules/dashboards/descriptive-analytics.ts apps/api/src/modules/dashboards/analytics.service.test.ts
sed -i "s#'\.\./\.\./\.\./\.\./api/src/modules/rules/rule-contract'#'@pathways/shared'#" apps/web/src/features/analytics/rule-timeline-contract.test.ts
```

Then merge duplicate `@pathways/shared` statements:
- `rule-engine.ts`: fold `scaledDecimal` into the rules import (one statement).
- `rules-human-escalated.test.ts`: fold `escalatedAlertOutputSchema` into the existing `rolePermissions` import.
- `rules-human.service.ts`: fold `uuidSchema` into the existing `{ type AtomicPermission, hasAtomicPermission }` import; keep `import * as contracts from '@pathways/shared'` as its own statement (a namespace import cannot be merged).
- `descriptive-analytics.ts` and `analytics.service.test.ts`: fold `activityAggregateCells, timelineObservation` and `activityObservation` into their existing `@pathways/shared` imports.

```bash
git grep -n "rule-contract'\|rule-metrics'\|rules-human-contract'\|from './alert-lifecycle'" -- apps
```

Expected: only the web copies (`apps/web/src/features/analytics/rule-test-metrics.ts`, `rules-human-contract.ts` importing `./rules-validation`, and web components importing `@/features/analytics/rules-human-contract`) and `alert-lifecycle.test.ts`; no api file imports a moved path.

- [ ] **Step 6: Typecheck and test**

```bash
git add -N packages/shared/src apps/api/src apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/shared typecheck && pnpm --filter @pathways/shared build
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test && pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass. The moved api tests now pass against the shared files, which proves the api behavior moved unchanged. Shared count rises by the three moved test files; api and web drop by the same numbers; the total across packages equals Task 3.

- [ ] **Step 7: Production build and compiled API resolution**

```bash
pnpm --filter @pathways/api build
(cd apps/api && node -e "const s=require('@pathways/shared'); for (const n of ['parseRuleTree','timelineObservation','activityAggregateCells','createRuleSchema','ruleMetricCellSchema','alertStatuses']) if (s[n] === undefined) { console.error(n); process.exit(1) } console.log('dist ok')")
```

Expected: `dist ok`.

- [ ] **Step 8: Commit**

```bash
git add -A apps packages/shared/src
git commit -m "refactor(shared): move the rules contract and metrics to packages/shared/src/rules

The strict rule cell schema is ruleMetricCellSchema; alertStatuses and decisionOutcomes move with the human review contract.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Merge the web rules copies into shared, with a parity test

**Files:**
- Modify: `packages/shared/src/rules/rule-contract.ts` (export `conditionSchema`)
- Modify: `packages/shared/src/rules/rule-metrics.ts` (timeline doc comment)
- Modify: `packages/shared/src/rules/rules-human-contract.ts` (web-only exports)
- Create then delete: `apps/web/src/features/analytics/rules-shared-parity.test.ts`
- Move: `apps/web/src/features/analytics/rule-timeline-contract.test.ts` -> `apps/api/src/modules/rules/rule-timeline-contract.test.ts`
- Delete: `apps/web/src/features/analytics/rules-validation.ts`, `apps/web/src/features/analytics/rule-test-metrics.ts`, `apps/web/src/features/analytics/rules-human-contract.ts`
- Modify (imports), 20 web files: `apps/web/src/app/(dashboard)/recommendations/[recommendationId]/page.tsx`, and under `apps/web/src/features/analytics/`: `human-review-action.test.tsx`, `human-review-action.tsx`, `human-review-workspace.tsx`, `rule-condition-editor.tsx`, `rule-editor.test.tsx`, `rule-editor.tsx`, `rule-test-workspace.test.tsx`, `rule-test-workspace.tsx`; under `apps/web/src/features/rules-board/`: `review-card-list.test.tsx`, `review-card-list.tsx`, `rule-board-model.test.ts`, `rule-board-model.ts`, `rule-condition-rows.tsx`, `rule-drawer-shared.ts`, `rule-drawer.test.tsx`, `rule-drawer.tsx`, `rule-output-fields.tsx`, `rules-board.tsx`; and `apps/web/src/lib/services/rules-human-client.ts`

**Interfaces:**
- Consumes: Task 4 shared rules modules.
- Produces: shared rules modules become the union of both copies. Added names: `conditionSchema`, `activateRuleSchema`, `archiveRuleSchema`, `dryRunInputSchema`, `dryRunOutputSchema`, `DryEvidence`, `HumanAlert`, `HumanRecommendation`, `HumanRule`, `OutcomePreview`, `HumanNotification`, `DecisionOutcome`.

- [ ] **Step 1: Write the failing parity test**

Create `apps/web/src/features/analytics/rules-shared-parity.test.ts`:

```ts
import * as shared from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { ZodType } from 'zod'
import * as oldMetrics from './rule-test-metrics'
import * as oldHuman from './rules-human-contract'
import * as oldContract from './rules-validation'

// Temporary parity proof that the shared rules modules accept and reject what the web copies did.
type Exports = Record<string, unknown>
const sharedExports = shared as unknown as Exports
const outcome = (run: () => unknown) => {
  try {
    return { value: run() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
const schemasOf = (module: unknown) =>
  Object.entries(module as Exports).filter(
    (entry): entry is [string, ZodType] => entry[1] instanceof ZodType,
  )
const sharedName = (name: string) => (name === 'metricCellSchema' ? 'ruleMetricCellSchema' : name)

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const record = '30000000-0000-4000-8000-000000000003'
const rec = '40000000-0000-4000-8000-000000000004'
const op = '50000000-0000-4000-8000-000000000005'
const asOf = '2026-09-26T00:00:00.000Z'
const scope = { organizationId: org, projectId: project }
const context = { scope, conditionId: 'A', asOf }
const condition = (patch: Record<string, unknown> = {}) => ({
  kind: 'CONDITION',
  id: 'a',
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '0',
  ...patch,
})
const group = (children: unknown[], mode = 'AND') => ({ kind: 'GROUP', mode, children })
const nested = (depth: number): unknown => (depth === 0 ? condition() : group([nested(depth - 1)]))
const trees: unknown[] = [
  condition(),
  condition({ metric: 'INDICATOR_CURRENT_VALUE', indicatorId: record, threshold: '9007199254740.0001' }),
  condition({ sql: 'select private' }),
  condition({ indicatorId: record }),
  condition({ operator: 'BETWEEN', threshold: '1', thresholdMaximum: '5' }),
  condition({ operator: 'BETWEEN', threshold: '5', thresholdMaximum: '1' }),
  condition({ threshold: '1.5' }),
  condition({ metric: 'ACTIVITY_COMPLETION_PERCENT', threshold: '101' }),
  group([condition(), condition({ id: 'b' })]),
  group([condition(), condition({ id: 'b' })], 'OR'),
  group([condition(), condition()]),
  group([]),
  nested(3),
  nested(6),
  group(Array.from({ length: 33 }, (_, index) => condition({ id: `c${index}` }))),
  null,
  'CONDITION',
]
const cells: unknown[] = [
  { state: 'ZERO', value: '0', reason: null },
  { state: 'AVAILABLE', value: '15', reason: null },
  { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  { state: 'MISSING', value: '0', reason: 'NO_MEASUREMENT' },
  { state: 'SUPPRESSED', value: null, reason: 'SUPPRESSED' },
  { state: 'AVAILABLE', value: 'abc', reason: null },
  { state: 'AVAILABLE', value: '1', reason: null, extra: true },
]
const timelineInput = {
  ...context,
  metric: 'PROJECT_REMAINING_DAYS',
  reportingDate: '2026-09-26',
  revision: '1',
  startDate: '2026-09-20',
  endDate: '2026-09-30',
}
const planned = { projectStatus: 'PLANNED', projectArchived: false }
const observation = shared.timelineObservation({ ...timelineInput, ...planned })
const recommendation = { id: rec, title: 'Review schedule', text: 'Review schedule.' }
const content = {
  name: 'Entered schedule',
  severity: 'LOW',
  conditions: condition(),
  recommendations: [recommendation],
}
const definition = { ...scope, ruleId: record, version: 1, ...content }
const contractInputs: unknown[] = [
  ...trees,
  ...cells,
  observation,
  { ...observation, metric: 'UNKNOWN_METRIC' },
  { ...observation, cell: cells[3] },
  definition,
  { ...definition, recommendations: [] },
  { ...definition, recommendations: [recommendation, recommendation] },
  recommendation,
  record,
  'not-a-uuid',
  '12.5',
  '1e3',
  'A',
  'a b',
  42,
]
const review = { expectedRevision: '1', note: 'Private synthetic note', clientOperationId: op }
const humanInputs: unknown[] = [
  review,
  { ...review, expectedRevision: '0' },
  { ...review, note: ' ' },
  { ...review, actorId: op },
  { ...review, outcome: 'ACCEPT', recommendationId: rec, expectedRecommendationRevision: '1' },
  { ...review, outcome: 'DECLINE' },
  { ...review, action: 'RESOLVE' },
  { ...content, code: 'RULE_A', clientOperationId: op },
  { ...content, code: 'RULE_A', templateId: op, clientOperationId: op },
  { ...content, code: 'rule', clientOperationId: op },
  { ...content, expectedVersion: 1, clientOperationId: op },
  { expectedVersion: 1, clientOperationId: op },
  { expectedVersion: 1, clientOperationId: op, note: 'Archive it' },
  { expectedVersion: 0, clientOperationId: op },
  { rule: definition, asOf, observations: [] },
  { rule: definition, asOf, observations: [observation] },
  { rule: { ...definition, severity: 'URGENT' }, asOf, observations: [] },
  {
    contractVersion: 'f10.v1',
    rule: definition,
    asOf,
    result: 'UNAVAILABLE',
    evidence: { condition: condition(), observation: null, result: 'UNAVAILABLE', reason: 'NO_OBSERVATION' },
  },
  {
    contractVersion: 'f10.v1',
    rule: definition,
    asOf,
    result: 'TRUE',
    evidence: { kind: 'GROUP', mode: 'AND', result: 'TRUE', children: [] },
  },
  {},
  null,
]
const indicator = {
  ...scope,
  id: record,
  revision: '1',
  status: 'ACTIVE',
  mode: 'MANUAL',
  recipe: null,
  numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER',
  baseline: '10',
  target: '20',
  current: { state: 'AVAILABLE', value: '15', reason: null },
}
const activity = (id: string, status = 'IN_PROGRESS', plannedEndDate: string | null = '2026-09-25') => ({
  ...scope,
  id,
  revision: '1',
  status,
  archived: false,
  plannedEndDate,
})
const activityBase = { ...context, reportingDate: '2026-09-26', populationRevision: '1' }
const open = { ...context, projectStatus: 'ONGOING', projectArchived: false, revision: '1' }
const metricCases: Array<[string, unknown[]]> = [
  [
    'indicatorObservation',
    [
      { ...context, metric: 'INDICATOR_CURRENT_VALUE', indicator },
      { ...context, metric: 'INDICATOR_PROGRESS_PERCENT', indicator },
      { ...context, metric: 'INDICATOR_PROGRESS_PERCENT', indicator: { ...indicator, organizationId: project } },
      { ...context, metric: 'PROJECT_REMAINING_DAYS', indicator },
    ],
  ],
  [
    'timelineObservation',
    [
      { ...timelineInput, ...planned },
      { ...timelineInput, projectStatus: 'COMPLETED', projectArchived: false },
      { ...timelineInput, projectStatus: 'ONGOING', projectArchived: true },
      { ...timelineInput, ...planned, endDate: null },
      { ...timelineInput, ...planned, reportingDate: '2026-02-30' },
    ],
  ],
  [
    'activityObservation',
    [
      { ...activityBase, metric: 'ACTIVITY_COMPLETION_PERCENT', activities: [activity(record, 'COMPLETED'), activity(rec)] },
      { ...activityBase, metric: 'ACTIVITY_OVERDUE_COUNT', activities: [activity(record, 'IN_PROGRESS', null)] },
      { ...activityBase, metric: 'ACTIVITY_OVERDUE_DAYS', activityId: record, activities: [activity(record)] },
      { ...activityBase, metric: 'ACTIVITY_OVERDUE_DAYS', activities: [activity(record)] },
      { ...activityBase, metric: 'ACTIVITY_COMPLETION_PERCENT', activities: [activity(record), activity(record)] },
    ],
  ],
  [
    'budgetObservation',
    [
      { ...open, recordCount: 2, currencyCount: 1, plannedTotal: '200', approvedExpenseTotal: '50' },
      { ...open, recordCount: 2, currencyCount: 1, plannedTotal: '0', approvedExpenseTotal: '50' },
      { ...open, recordCount: 2, currencyCount: 2, plannedTotal: '200', approvedExpenseTotal: '50' },
      { ...open, recordCount: 2, currencyCount: 1, plannedTotal: '-1', approvedExpenseTotal: '50' },
    ],
  ],
  [
    'beneficiaryFollowUpObservation',
    [
      { ...open, population: 20, followUp: 10 },
      { ...open, population: 10, followUp: 3 },
      { ...open, population: 5, followUp: 6 },
    ],
  ],
  [
    'surveyImprovementObservation',
    [
      { ...open, pairCount: 6, differenceSum: '12.5' },
      { ...open, pairCount: 2, differenceSum: '4' },
      { ...open, pairCount: 0, differenceSum: '0' },
    ],
  ],
]

describe('shared rules modules keep the web copies behavior', () => {
  it('exports every name the web copies exported', () => {
    for (const name of [...Object.keys(oldContract), ...Object.keys(oldMetrics), ...Object.keys(oldHuman)])
      expect(sharedExports).toHaveProperty(sharedName(name))
  })

  it('keeps the rule constants identical', () => {
    for (const name of ['RULE_CONTRACT_VERSION', 'MAX_CONDITIONS', 'ruleMetrics', 'operators', 'metricReasons'])
      expect(sharedExports[name]).toEqual((oldContract as unknown as Exports)[name])
    expect(shared.decisionOutcomes).toEqual(oldHuman.decisionOutcomes)
  })

  it('parses rule trees identically and the corpus has both outcomes', () => {
    const results = trees.map((tree) => outcome(() => shared.parseRuleTree(tree)))
    for (const [index, tree] of trees.entries())
      expect(results[index]).toEqual(outcome(() => oldContract.parseRuleTree(tree)))
    expect(results.some((result) => 'value' in result)).toBe(true)
    expect(results.some((result) => 'error' in result)).toBe(true)
  })

  it.each(schemasOf(oldContract))('contract schema %s accepts and rejects identically', (name, schema) => {
    const next = sharedExports[sharedName(name)] as ZodType
    for (const input of contractInputs)
      expect(outcome(() => next.parse(input))).toEqual(outcome(() => schema.parse(input)))
  })

  it.each(schemasOf(oldHuman))('review schema %s accepts and rejects identically', (name, schema) => {
    const next = sharedExports[name] as ZodType
    for (const input of humanInputs)
      expect(outcome(() => next.parse(input))).toEqual(outcome(() => schema.parse(input)))
  })

  it.each(metricCases)('%s computes identical observations', (name, inputs) => {
    const next = sharedExports[name] as (input: unknown) => unknown
    const previous = (oldMetrics as unknown as Exports)[name] as (input: unknown) => unknown
    for (const input of inputs) expect(outcome(() => next(input))).toEqual(outcome(() => previous(input)))
  })

  it('differs only where ruling 8 drops the two timeline defaults', () => {
    expect(outcome(() => oldMetrics.timelineObservation(timelineInput))).toHaveProperty('value')
    expect(outcome(() => shared.timelineObservation(timelineInput))).toHaveProperty('error')
    expect(shared.timelineObservation({ ...timelineInput, ...planned })).toEqual(
      oldMetrics.timelineObservation(timelineInput),
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/web exec vitest run src/features/analytics/rules-shared-parity.test.ts`
Expected: FAIL. "exports every name" fails on `conditionSchema` or `activateRuleSchema`, and the review schema cases for `activateRuleSchema`, `archiveRuleSchema`, `dryRunInputSchema`, `dryRunOutputSchema` fail with `next` undefined.

- [ ] **Step 3: Add the web-only exports to the shared modules**

`packages/shared/src/rules/rule-contract.ts`: change `const conditionSchema: z.ZodType<RuleCondition> = z` to `export const conditionSchema: z.ZodType<RuleCondition> = z`.

`packages/shared/src/rules/rule-metrics.ts`: replace the doc comment above `export function timelineObservation` with:

```ts
/** reportingDate is the business calendar date at asOf: server-derived for evaluation, entered for browser rule tests. */
```

`packages/shared/src/rules/rules-human-contract.ts`:

1. Extend the `./rule-contract` import so it reads:

```ts
import {
  MAX_CONDITIONS,
  RULE_CONTRACT_VERSION,
  conditionSchema,
  decimalSchema,
  metricObservationSchema,
  operators,
  parseRuleTree,
  recommendationSchema,
  ruleDefinitionSchema,
  ruleMetricCellSchema,
  ruleMetrics,
  uuidSchema,
} from './rule-contract'
```

2. Directly after the `draftRuleSchema` declaration (it ends `.strict()` before `export const reviewSchema`), insert:

```ts
export const activateRuleSchema = z
  .object({ expectedVersion: version, clientOperationId: uuidSchema })
  .strict()
export const archiveRuleSchema = activateRuleSchema.extend({ note }).strict()
```

3. Append to the end of the file:

```ts

export type HumanAlert = z.infer<typeof alertOutputSchema>
export type HumanRecommendation = z.infer<typeof recommendationOutputSchema>
export type HumanRule = z.infer<typeof ruleOutputSchema>
export type OutcomePreview = z.infer<typeof previewOutputSchema>
export type HumanNotification = z.infer<typeof notificationOutputSchema>
export type DecisionOutcome = (typeof decisionOutcomes)[number]

export const dryRunInputSchema = z
  .object({
    rule: ruleDefinitionSchema,
    asOf: instant,
    observations: z.array(metricObservationSchema).max(MAX_CONDITIONS),
  })
  .strict()
const dryResult = z.enum(['TRUE', 'FALSE', 'UNAVAILABLE'])
export type DryEvidence =
  | {
      condition: z.infer<typeof conditionSchema>
      observation: z.infer<typeof metricObservationSchema> | null
      result: z.infer<typeof dryResult>
      reason: 'NO_OBSERVATION' | null
    }
  | {
      kind: 'GROUP'
      mode: 'AND' | 'OR'
      result: z.infer<typeof dryResult>
      children: DryEvidence[]
    }
const dryEvidenceSchema: z.ZodType<DryEvidence> = z.lazy(() =>
  z.union([
    z
      .object({
        condition: conditionSchema,
        observation: metricObservationSchema.nullable(),
        result: dryResult,
        reason: z.literal('NO_OBSERVATION').nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('GROUP'),
        mode: z.enum(['AND', 'OR']),
        result: dryResult,
        children: z.array(dryEvidenceSchema).max(MAX_CONDITIONS),
      })
      .strict(),
  ]),
)
function boundDryEvidence(input: unknown) {
  const pending = [{ node: input, depth: 0 }]
  let leaves = 0
  let nodes = 0
  const seen = new WeakSet<object>()
  while (pending.length) {
    const item = pending.pop()
    if (
      !item ||
      ++nodes > 160 ||
      !item.node ||
      typeof item.node !== 'object' ||
      Array.isArray(item.node) ||
      seen.has(item.node)
    )
      return false
    seen.add(item.node)
    const node = item.node as Record<string, unknown>
    if (node.kind === 'GROUP') {
      if (
        item.depth >= 4 ||
        !Array.isArray(node.children) ||
        !node.children.length ||
        node.children.length > 32
      )
        return false
      for (const child of node.children) pending.push({ node: child, depth: item.depth + 1 })
    } else if (++leaves > 32) return false
  }
  return true
}
const boundedDryEvidenceSchema = z.unknown().transform((input, ctx): DryEvidence => {
  if (!boundDryEvidence(input)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid bounded test evidence.' })
    return z.NEVER
  }
  const parsed = dryEvidenceSchema.safeParse(input)
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid test evidence.' })
    return z.NEVER
  }
  return parsed.data
})
export const dryRunOutputSchema = z
  .object({
    contractVersion: z.literal(RULE_CONTRACT_VERSION),
    rule: ruleDefinitionSchema,
    asOf: instant,
    result: dryResult,
    evidence: boundedDryEvidenceSchema,
  })
  .strict()
```

The block is the web file's lines 272-379 with its mid-file import moved to the top. `instant`, `version`, `note`, `alertOutputSchema`, `recommendationOutputSchema`, `ruleOutputSchema`, `previewOutputSchema` and `notificationOutputSchema` already exist in the shared file; confirm with `grep -n "^const instant\|^const version\|^const note\|alertOutputSchema =\|notificationOutputSchema =" packages/shared/src/rules/rules-human-contract.ts`.

- [ ] **Step 4: Run the parity test and the suites**

```bash
pnpm exec biome check --write packages/shared/src/rules apps/web/src/features/analytics/rules-shared-parity.test.ts
pnpm --filter @pathways/shared typecheck && pnpm --filter @pathways/shared build
pnpm --filter @pathways/web exec vitest run src/features/analytics/rules-shared-parity.test.ts
pnpm --filter @pathways/shared test && pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
```

Expected: parity test PASS (every case); all suites pass. If a parity case fails, stop: the copies differ somewhere not covered by rulings 7 and 8, and the controller decides.

- [ ] **Step 5: Commit the union and the parity proof**

```bash
git add packages/shared/src/rules apps/web/src/features/analytics/rules-shared-parity.test.ts
git commit -m "feat(shared): merge the web-only rules exports into packages/shared/src/rules

A parity test runs the web copies and the shared modules against the same accepted and rejected inputs; only ruling 8 (timeline defaults) differs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Move the timeline contract test to the api (move commit)**

```bash
git mv apps/web/src/features/analytics/rule-timeline-contract.test.ts apps/api/src/modules/rules/rule-timeline-contract.test.ts
```

Replace its import block (lines 1-5) with:

```ts
import {
  dryRunInputSchema,
  dryRunOutputSchema,
  timelineObservation,
} from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { evaluateRule } from './rule-engine'
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/rules/rule-timeline-contract.test.ts
git add -A apps/web/src/features/analytics apps/api/src/modules/rules
git commit -m "test(api): move the timeline evaluation contract test beside the rule engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Before committing, delete the `serverObservationSchema.safeParse` assertion (true by construction now that both sides are the shared schema), rename any describe or test title that says "browser and server" to describe the timeline evaluation contract, then run `pnpm exec biome check --write apps/api/src/modules/rules/rule-timeline-contract.test.ts` and `pnpm lint`.

Expected: 2 tests pass. This removes the last web test importing api source.

- [ ] **Step 7: Delete the web copies and repoint web**

```bash
git rm apps/web/src/features/analytics/rules-validation.ts apps/web/src/features/analytics/rule-test-metrics.ts apps/web/src/features/analytics/rules-human-contract.ts apps/web/src/features/analytics/rules-shared-parity.test.ts
git grep -l "rules-validation'\|rules-human-contract'\|rule-test-metrics'" -- apps/web | xargs sed -i "s#'@/features/analytics/rules-validation'#'@pathways/shared'#; s#'@/features/analytics/rules-human-contract'#'@pathways/shared'#; s#'\./rules-validation'#'@pathways/shared'#; s#'\./rules-human-contract'#'@pathways/shared'#; s#'\./rule-test-metrics'#'@pathways/shared'#"
git grep -n "rules-validation'\|rules-human-contract'\|rule-test-metrics'" -- apps packages
```

Expected: the last command prints nothing.

Merge duplicate `@pathways/shared` statements:
- `rule-editor.tsx`: its three statements (from the old `rules-human-contract` and two old `rules-validation` imports) become one, with `type` modifiers for `HumanRule`, `RuleCondition`, `RuleNode`.
- `rule-test-workspace.tsx`: fold the old `rules-human-contract`, `rules-validation` and `rule-test-metrics` names into its existing `@pathways/shared` import.
- `apps/api/src/modules/rules/alert-lifecycle.ts`: delete its local `type DecisionOutcome` (and `type AlertStatus` if shared now exports one) and import the shared type instead, so the barrel type is the only definition.
- `rule-drawer.tsx`, `rule-board-model.ts`, `rule-drawer-shared.ts`, `rule-condition-rows.tsx`: fold their two statements into one.
- `apps/web/src/lib/services/rules-human-client.ts`: keep `import * as contract from '@pathways/shared'` and `import { uuidSchema } from '@pathways/shared'` as two statements (a namespace import cannot be merged).

- [ ] **Step 8: Verify**

```bash
git add -N packages/shared/src apps/api/src apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test && pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
pnpm --filter @pathways/web build > .tmp/f2-web-build.log 2>&1; echo "web build exit=$?"
grep -iE "middleware|error" .tmp/f2-web-build.log
git grep -n "api/src/" -- apps/web/src
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; web count = Task 4 web count minus 2 (timeline test moved); `git grep` prints nothing (web source no longer imports api source).

- [ ] **Step 9: Commit**

```bash
git add -A apps
git commit -m "refactor(web): use the shared rules contract, metrics and review contract

The web copies are deleted after the parity test in the previous commit; the rule tester adopts the api timeline schema (ruling 8).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Shared constants copied by both apps

**Files:**
- Create: `packages/shared/src/rbac/beneficiary-step-up.ts`, `packages/shared/src/rbac/beneficiary-step-up.test.ts`
- Create: `packages/shared/src/constants/domain-codes.ts`
- Modify: `packages/shared/src/index.ts`
- Modify (api): `apps/api/src/modules/auth/beneficiary-step-up.ts`, `beneficiary-step-up.service.ts`, `beneficiary-step-up-pin.service.ts`, `beneficiary-step-up-pin.test.ts` (under `apps/api/src/modules/auth/`); `apps/api/src/modules/metadata/metadata.service.ts:39-45`, `apps/api/src/modules/metadata/metadata.service.test.ts:13`; `apps/api/src/modules/activities/activities.dto.ts:205-213`; `apps/api/src/modules/reports/reports.dto.ts`, `reports.service.ts`, `reports-runtime.local.test.ts`, `report-project-status.ts:53,130` (under `apps/api/src/modules/reports/`)
- Modify (web): `apps/web/src/lib/auth/beneficiary-step-up.ts`, `apps/web/src/lib/auth/beneficiary-step-up-events.ts:4`, `apps/web/src/components/layout/beneficiary-access-gate.tsx`, `apps/web/src/features/profile/own-step-up-pin-form.tsx`, `apps/web/src/lib/services/pathways-client.ts` (lines 106-109, 2353-2370), `apps/web/e2e/fixtures/role-routes.tsx:79,86`, `apps/web/src/features/collection/direct-form-entry-workspace.tsx:29-30,473`, `apps/web/src/types/pathways.ts:113-119`, `apps/web/src/features/projects/activity-explain-delay-dialog.tsx:20`, `apps/web/src/lib/services/core-feature-client.ts:131-138`, `apps/web/src/features/reports/live-reporting-workspace.tsx:27-33`

**Interfaces:**
- Produces from `@pathways/shared`: `STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'`, `STEP_UP_PIN_PATTERN: RegExp`, `STEP_UP_PIN_RULE_MESSAGE: string`, `StepUpPinState = 'NONE' | 'SET' | 'LOCKED'`, `isAcceptableStepUpPin(candidate: unknown): candidate is string`, `DIRECT_ENTRY_FORM_TYPES`, `overdueExplanationCategories`, `OverdueExplanationCategory`, `reportKinds`, `ReportKindCode`. Report status sorting uses the existing `alertSeverities`.

Excluded (ruling 5): `parseAutomaticMappingReceipt`, `proofExtensions`, export format order, UI project statuses, the reverse-order `LOW..CRITICAL` severity enums, and web `reports/preview/page.tsx` `reportKinds` (kebab-case UI kinds, not the api codes).

- [ ] **Step 1: Write the failing PIN rule test**

Create `packages/shared/src/rbac/beneficiary-step-up.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STEP_UP_PIN_RULE_MESSAGE, isAcceptableStepUpPin } from './beneficiary-step-up'

describe('beneficiary step-up PIN rule', () => {
  it('accepts 6 to 12 digits that are not repeated or simple runs', () => {
    for (const pin of ['135790', '204682', '918273645012']) expect(isAcceptableStepUpPin(pin)).toBe(true)
  })

  it('rejects runs, repeats, wrong lengths, non-digits and non-strings', () => {
    for (const pin of ['111111', '123456', '654321', '12345', '1234567890123', ' 135790', '13579a', 135790, null, undefined])
      expect(isAcceptableStepUpPin(pin)).toBe(false)
  })

  it('keeps the message both apps show', () => {
    expect(STEP_UP_PIN_RULE_MESSAGE).toBe(
      'Use 6 to 12 digits. Repeated digits and simple ascending or descending sequences are not accepted.',
    )
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/rbac/beneficiary-step-up.test.ts`
Expected: FAIL, cannot resolve `./beneficiary-step-up`.

- [ ] **Step 2: Create the shared step-up rule and domain codes**

Create `packages/shared/src/rbac/beneficiary-step-up.ts`:

```ts
// Step-up denial code the api returns and the web listens for (cr-pathways-beneficiary-step-up).
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'
// PIN rules mirror pathways.step_up_pin_acceptable in migration 0037 (cr-pathways-beneficiary-step-up-pin).
export const STEP_UP_PIN_PATTERN = /^[0-9]{6,12}$/
export const STEP_UP_PIN_RULE_MESSAGE =
  'Use 6 to 12 digits. Repeated digits and simple ascending or descending sequences are not accepted.'
export type StepUpPinState = 'NONE' | 'SET' | 'LOCKED'

/** 6-12 ASCII digits, rejecting all-identical digits and strictly ascending/descending runs. */
export function isAcceptableStepUpPin(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !STEP_UP_PIN_PATTERN.test(candidate)) return false
  const steps = [...candidate.slice(1)].map(
    (digit, index) => digit.charCodeAt(0) - candidate.charCodeAt(index),
  )
  return ![0, 1, -1].some((run) => steps.every((step) => step === run))
}
```

Create `packages/shared/src/constants/domain-codes.ts`:

```ts
// Form types that accept direct entry submissions (V4-C11).
export const DIRECT_ENTRY_FORM_TYPES = [
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'ACTIVITY_MONITORING',
] as const

// Categories a project team may record for an overdue activity.
export const overdueExplanationCategories = [
  'WEATHER',
  'SECURITY',
  'FUNDING',
  'COMMUNITY',
  'LOGISTICS',
  'OTHER',
] as const
export type OverdueExplanationCategory = (typeof overdueExplanationCategories)[number]

// Report kind codes the api accepts for preview and generation.
export const reportKinds = [
  'PROJECT_SUMMARY',
  'INDICATOR_SUMMARY',
  'BENEFICIARY_SUMMARY',
  'SURVEY_FORM_RESULTS',
  'MONITORING_REPORT',
  'EVALUATION_REPORT',
] as const
export type ReportKindCode = (typeof reportKinds)[number]
```

In `packages/shared/src/index.ts` add `export * from './constants/domain-codes'` below `export * from './constants/app'`, and `export * from './rbac/beneficiary-step-up'` below `export * from './rbac/authorization-policy'`.

```bash
pnpm --filter @pathways/shared typecheck && pnpm --filter @pathways/shared test && pnpm --filter @pathways/shared build
```

Expected: PASS, including the 3 new cases.

- [ ] **Step 3: Use the step-up rule in the api**

`apps/api/src/modules/auth/beneficiary-step-up.ts`:
- Delete `export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'`.
- Replace the three-line `// Approved PIN fallback ...` comment, `export const STEP_UP_PIN_PATTERN = ...` and `export type StepUpPinState = ...` with the single comment `// PIN fallback codes (cr-pathways-beneficiary-step-up-pin); the PIN rule itself lives in @pathways/shared.`, keeping `export type StepUpMethod` and `STEP_UP_PIN_CODES` below it.
- Delete `isAcceptableStepUpPin` and its doc comment.

`beneficiary-step-up.service.ts`: move `STEP_UP_REQUIRED_CODE` from the `./beneficiary-step-up` import to `import { STEP_UP_REQUIRED_CODE } from '@pathways/shared'`.

`beneficiary-step-up-pin.service.ts`:
- Remove `STEP_UP_PIN_PATTERN`, `type StepUpPinState`, `isAcceptableStepUpPin` from the `./beneficiary-step-up` import and add `import { STEP_UP_PIN_PATTERN, STEP_UP_PIN_RULE_MESSAGE, type StepUpPinState, isAcceptableStepUpPin } from '@pathways/shared'`.
- Delete the local `const PIN_RULE = ...` (2 lines) and replace its one use with `STEP_UP_PIN_RULE_MESSAGE`.

`beneficiary-step-up-pin.test.ts`: `import { isAcceptableStepUpPin } from '@pathways/shared'`.

- [ ] **Step 4: Use the step-up rule in the web**

`apps/web/src/lib/auth/beneficiary-step-up.ts`:
- Delete `export type StepUpPinState = 'NONE' | 'SET' | 'LOCKED'`, `export const PIN_RULE_MESSAGE = ...` (2 lines) and the local `isAcceptableStepUpPin` with its doc comment.
- Add `import { STEP_UP_PIN_RULE_MESSAGE, type StepUpPinState, isAcceptableStepUpPin } from '@pathways/shared'`.
- Replace its three `PIN_RULE_MESSAGE` uses with `STEP_UP_PIN_RULE_MESSAGE`.

`apps/web/src/components/layout/beneficiary-access-gate.tsx` and `apps/web/src/features/profile/own-step-up-pin-form.tsx`:
- Remove `PIN_RULE_MESSAGE`, `type StepUpPinState` and `isAcceptableStepUpPin` from the `@/lib/auth/beneficiary-step-up` import.
- Add `import { STEP_UP_PIN_RULE_MESSAGE, type StepUpPinState, isAcceptableStepUpPin } from '@pathways/shared'`.
- Replace every `PIN_RULE_MESSAGE` with `STEP_UP_PIN_RULE_MESSAGE` (gate: 2 uses; form: 3 uses including the `error.message ===` check).

`apps/web/src/lib/auth/beneficiary-step-up-events.ts`: delete `export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'`.
`apps/web/src/lib/services/pathways-client.ts`: remove `STEP_UP_REQUIRED_CODE` from the `@/lib/auth/beneficiary-step-up-events` import and add it to the multi-line `@pathways/shared` import that ends near line 102 (not the single-line one after it).
`apps/web/e2e/fixtures/role-routes.tsx`: delete `export const PIN_RULE_MESSAGE = 'PIN rule.'` and `export const isAcceptableStepUpPin = () => false` (no component reads them from the aliased module any more).

```bash
git grep -n "PIN_RULE_MESSAGE\b\|PIN_RULE\b\|'STEP_UP_REQUIRED'" -- apps
```

Expected: prints nothing outside test files that assert on the response code (`apps/api/src/modules/auth/*.test.ts` may contain `'STEP_UP_REQUIRED'` literals; leave them).

- [ ] **Step 5: Use the domain codes**

API:
- `metadata.service.ts`: delete the `// V4-C11 ...` comment and local `DIRECT_ENTRY_FORM_TYPES` (lines 39-45); add `DIRECT_ENTRY_FORM_TYPES` to its `@pathways/shared` import.
- `metadata.service.test.ts`: `import { MetadataService } from './metadata.service'` and add `DIRECT_ENTRY_FORM_TYPES` to its `@pathways/shared` import.
- `activities.dto.ts`: delete the local `overdueExplanationCategories` and `OverdueExplanationCategory` (lines 205-213); add `import { type OverdueExplanationCategory, overdueExplanationCategories } from '@pathways/shared'`.
- `reports.dto.ts`: delete the local `reportKinds` (lines 2-9) and `export type ReportKind = ...` (last line); add `import { reportKinds } from '@pathways/shared'`.
- `reports.service.ts`: drop `type ReportKind` from the `./reports.dto` import, add `type ReportKindCode` to its `@pathways/shared` import, then `sed -i 's/\bReportKind\b/ReportKindCode/g' apps/api/src/modules/reports/reports.service.ts` (`isExtraReportKind` is untouched because the match needs a word boundary).
- `reports-runtime.local.test.ts`: replace `import { type ReportKind, reportKinds } from './reports.dto'` with the names `type ReportKindCode, reportKinds` in its `@pathways/shared` import, and rename the one `ReportKind` use to `ReportKindCode`.
- `report-project-status.ts`: delete `const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']`; change the type import to `import { type MetricCell, type MonitoringIndicator, alertSeverities } from '@pathways/shared'`; in `topAlerts` replace `SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity)` with `severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)`, declaring once at module level `const severityOrder: readonly string[] = alertSeverities`.

Web:
- `direct-form-entry-workspace.tsx`: delete lines 29-30 (`// Mirrors the API ...` and the local constant); add `import { DIRECT_ENTRY_FORM_TYPES } from '@pathways/shared'`; replace `!DIRECT_ENTRY_FORM_TYPES.includes(form.formType)` with `!(DIRECT_ENTRY_FORM_TYPES as readonly string[]).includes(form.formType)`.
- `pathways-client.ts`: replace the local `const overdueExplanationCategories = new Set<string>([...] satisfies ...)` (lines 2353-2360) with `const knownOverdueCategories = new Set<string>(overdueExplanationCategories)`, change `!overdueExplanationCategories.has(row.category)` to `!knownOverdueCategories.has(row.category)`, and add `overdueExplanationCategories` to the multi-line `@pathways/shared` import that ends near line 102.
- `types/pathways.ts`: delete the local `OverdueExplanationCategory` union (lines 113-119) and add `type OverdueExplanationCategory` to the line-2 `@pathways/shared` type import.
- `activity-explain-delay-dialog.tsx`: `import type { Activity } from '@/types/pathways'` and `import type { OverdueExplanationCategory } from '@pathways/shared'`.
- `core-feature-client.ts`: replace the `const reportKind = z.enum([...])` literal list with `const reportKind = z.enum(reportKinds)` and add `import { reportKinds } from '@pathways/shared'`.
- `live-reporting-workspace.tsx`: delete the six-line `type Kind = | ...` union, add `import type { ReportKindCode } from '@pathways/shared'`, and replace every remaining `Kind` type reference in the file with `ReportKindCode` (no alias).

```bash
git grep -n "'WEATHER',\|'TRAINING_SURVEY',$\|'INDICATOR_SUMMARY',$\|const SEVERITY" -- apps/api/src apps/web/src | grep -v "\.test\."
```

Expected: prints nothing (only the shared file holds the lists).

- [ ] **Step 6: Verify**

```bash
git add -N packages/shared/src apps/api/src apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test && pnpm --filter @pathways/api test && pnpm --filter @pathways/web test
npx playwright test --config playwright.auth-navigation.config.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; shared count +3 over Task 5; api and web counts unchanged from Task 5.

- [ ] **Step 7: Commit**

```bash
git add -A apps packages/shared/src
git commit -m "refactor(shared): share the step-up PIN rule and the code lists both apps copied

Direct-entry form types, overdue explanation categories and report kind codes live in @pathways/shared; report status sorting uses alertSeverities.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Records, SAD routing and living doc paths

**Files:**
- Modify: `scripts/sad/check.ts:57-63`, `scripts/sad/check.test.ts:68-77`, `docs/sad-pathways.md:40`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.2, 3.4, 3.7, 7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-01, MOD-02, MOD-03 rows)
- Modify: `docs/index.md` (CR row status; section 1.6 plan row)
- Modify: `docs/activity-log.md`
- Modify: `docs/prd-pathways.md:1539`, `docs/qad-pathways.md:108,200,225`, `docs/runbook-rule-creation-test.md:7`, `docs/local-dev.md:11`

- [ ] **Step 1: Route shared rules to the determinism checker (ruling 6)**

In `scripts/sad/check.test.ts`, test `routes rules engine and rule editor changes to the determinism checker`, add a third change and expected path:

```ts
    const routed = routing([
      change('apps/api/src/modules/rules/rule-engine.ts', 'new', 'old'),
      change('apps/web/src/features/analytics/rule-editor.tsx', 'new', 'old'),
      change('packages/shared/src/rules/rule-contract.ts', 'new', 'old'),
    ])
    expect(routed['rule-engine-determinism-checker']).toEqual([
      'apps/api/src/modules/rules/rule-engine.ts',
      'apps/web/src/features/analytics/rule-editor.tsx',
      'packages/shared/src/rules/rule-contract.ts',
    ])
```

Run: `pnpm sad:test`
Expected: FAIL on the new path.

In `scripts/sad/check.ts`, `rule-engine-determinism-checker` globs, add `'packages/shared/src/rules/**',` directly after `'packages/shared/src/monitoring/**/*.ts',`.

In `docs/sad-pathways.md` line 40, after `` `packages/shared/src/monitoring/**/*.ts`, `` insert `` `packages/shared/src/rules/**`, ``.

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:
Section 3.2, replace

```text
No `*.dto.ts`; inputs come from `@pathways/shared/contracts/<domain>`.
```

with

```text
No `*.dto.ts`; inputs come from the contracts in `packages/shared/src/contracts/<domain>`, imported through `@pathways/shared`.
```

Section 3.4, replace the last sentence

```text
Imported by subpath, for example `@pathways/shared/contracts/projects`, through a package `exports` map.
```

with

```text
Everything is exported through the `packages/shared/src/index.ts` barrel and imported as `@pathways/shared`, with no subpath `exports` map, so exported names stay unique across folders (amended 2026-10-09 for F2: the built API resolves `dist/index.js` and the Vitest aliases match the package root only).
```

Section 3.7, F2 row Contents cell becomes

```text
`rbac/` (one role catalog, policy), `rules/` (contract, metrics), shared enums and constants, barrel exports verified by production build
```

and the F3 row Contents cell gains the prefix `contract pattern with one example (moved from F2), `.

Section 7 risk table: replace `Subpath imports fail in the built API` with `Shared barrel exports missing from the built API`.

Section 9: append

```markdown
F2 applied 2026-10-09 on refactor/f2-shared-core:
- RBAC: `authorization-policy.ts` and its test moved to `packages/shared/src/rbac`; every api and web importer, the Edge middleware chain and the role-routes e2e spec import `@pathways/shared`, and web source no longer imports api source.
- Roles: one catalog in `rbac/role-catalog.ts` (`roleNames`, `roleCodeByName`, `roleCodeFor`, `isCanonicalRole`); the web `canonicalRoles`, `roleCodeByName`, `roleCodesByName`, two identity label maps and the fixture role list were removed; `pathwaysRoles` keeps the UI order, typed against the catalog.
- Rules: `rule-contract`, `rule-metrics` and `rules-human-contract` live in `packages/shared/src/rules` as the union of the api and web copies; a parity test ran both against the same inputs before the web copies were deleted; the strict cell schema is `ruleMetricCellSchema`; the web rule tester adopts the api timeline schema without its two defaults; the timeline contract test moved beside the rule engine.
- Constants: the step-up denial code, PIN rule, PIN message and PIN check, direct-entry form types, overdue explanation categories and report kind codes are shared; report status sorting uses `alertSeverities`.
- Package: exports stay on the barrel (section 3.4 amended); `metric-math` is exported directly; `ImportSummary` moved to `packages/imports`; the api `dev` and `dev:watch` scripts build workspace packages first; SAD rule-engine routing covers `packages/shared/src/rules/**`.

Deferred: contract pattern and example (F3), calendar-date regex unification (slices), `descriptive-analytics` split (S7), avatar-stack "And" label (S8). Left open: `apps/api/src/modules/auth/route-access.service.ts` and one dashboards test import `apps/web/src/lib/rbac/route-access.ts` (api to web), proposed for F4.
```

- [ ] **Step 3: Close the audit findings and update the index**

- Audit: in the MOD-01, MOD-02 and MOD-03 rows append `; closed by F2.` to the disposition cell, after `(F2)`.
- `docs/index.md`: CR row status becomes `Approved; F1 and F2 applied, F3 next`; add as the last row of the section 1.6 table: `| [F2 shared core plan](superpowers/plans/2026-10-09-modularization-f2-shared-core.md) | 2026-10-09-modularization-f2-shared-core.md | 2026-10-09 | F2 of the codebase modularization | Executed; remove after merge |`.

- [ ] **Step 4: Update living doc paths**

- `docs/prd-pathways.md:1539`: `apps/api/src/modules/auth/authorization-policy.ts` becomes `packages/shared/src/rbac/authorization-policy.ts`.
- `docs/qad-pathways.md:108` and `:225`: `apps/api/src/modules/rules/rules-human-contract.test.ts` becomes `packages/shared/src/rules/rules-human-contract.test.ts`.
- `docs/qad-pathways.md:200`: `apps/api/src/modules/auth/authorization-policy.test.ts` becomes `packages/shared/src/rbac/authorization-policy.test.ts`.
- `docs/runbook-rule-creation-test.md:7`: `` `rules-validation.ts` `` becomes `` `packages/shared/src/rules/rule-contract.ts` ``.
- `docs/local-dev.md:11`: the API bullet becomes

```text
- API: http://localhost:4000/api (`nest start`; builds `packages/shared`, `packages/imports` and `packages/config` first, then builds once and keeps running, so code changes apply only after you restart `pnpm dev`). Use `pnpm --filter @pathways/api dev:watch` for automatic reloads.
```

```bash
git grep -n "modules/auth/authorization-policy\|modules/rules/rule-contract\|modules/rules/rules-human-contract\|features/analytics/rules-validation\|rule-test-metrics" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: prints nothing.

- [ ] **Step 5: Activity log**

Add to `docs/activity-log.md`:

```markdown
## 2026-10-09 Modularization F2 shared core (refactor/f2-shared-core)
```

with one bullet per Task 1 to Task 6 stating what moved or was removed and the package test counts recorded at the end of that task, and a final bullet naming the rulings note as the source of the ten F2 rulings. Task 8 Step 5 appends the gate results.

- [ ] **Step 6: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization F2 and route shared rules to the determinism checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check shows no failures beyond the Task 0 baseline count. (The checker is `scripts/docs/check.py`, run through `pnpm docs:check`; there is no `docs/check.py`.)

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass. Record per-package counts; versus Task 0 the totals differ only by the tests added on purpose (role catalog 2, PIN rule 3); tests that moved between packages net to zero.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs `csv-rbac.local.test.ts` and `reports-runtime.local.test.ts`, which now import the policy and report kinds from `@pathways/shared`).

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API (and workspace packages) and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error in the `pnpm dev:local` output fails the gate; Playwright pass counts match the F1 gate results (or dev's pass/fail set). Browser smoke: as a Project Manager, sign in, open the dashboard (role label shows), a project, the rules board, open a rule and run a rule test with entered dates (timeline metric), the alerts list, the reports preview kind selector and a direct form entry; trigger beneficiary step-up and enter `123456` to see the PIN rule message; as a System Administrator open user management and check role labels and the create-user role list.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f2/manifest.json
```

Dispatch every role the manifest requires (expect at least `restraint-guardian`, `design-qa-agent`, `rule-engine-determinism-checker`, `organization-isolation-checker`, `beneficiary-privacy-guardian` and `metadata-import-validator`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f2/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f2/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, middleware size, replay exit code, e2e pass counts, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F2 release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/f2-shared-core -m "Merge refactor/f2-shared-core into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not push `origin dev` until the developer says so. After merge, remove the executed plan in a follow-up commit (`git rm docs/superpowers/plans/2026-10-09-modularization-f2-shared-core.md`, drop its index row) as CR section 6 requires.
