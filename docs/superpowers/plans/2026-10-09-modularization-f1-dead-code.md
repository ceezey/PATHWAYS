# F1 Dead Code and Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete verified dead code, dead packages and historical infra, remove duplicate Nest providers, and move test-only web fixtures into `apps/web/src/test/fixtures`, with no behavior change.

**Architecture:** Every deletion below was verified as unreferenced on dev `8e9f1274` (git grep plus importer analysis across `apps`, `packages`, `scripts`, `infra`, `.github`, live docs). Each task deletes one coherent group, proves nothing breaks with typecheck and tests, and commits. The only new code is one API wiring test that pins "no provider registered in two modules".

**Tech Stack:** pnpm 11 workspace, NestJS 11, Next.js, Vitest, Biome 1.9, Playwright, PowerShell replay harness.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (section 3.7 row F1) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-12, MOD-13, MOD-14, MOD-18, MOD-19).

## Global Constraints

- Behavior-preserving: no route, status code, response body, screen or permission changes.
- Renamed files are named for the purpose of their code; no phase or ticket codes.
- Kebab-case file names; comments are one sentence, no emojis.
- Do not commit `.env` files, `.tmp/` content or review evidence.
- Do not touch `infra/supabase/legacy-retirement/deferred-retire-legacy-public-application-tables.sql` (SHA256 pinned by `apps/api/prisma/legacy-retirement.test.ts:122-123`) or any `infra/supabase/phase6/hosted-*-preprovision.sql` (content checked by `scripts/db/local-reset.mjs:113`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work only in the worktree `C:\PATHWAYS\.worktrees\refactor-f1-dead-code` on branch `refactor/f1-dead-code`. All paths below are relative to that worktree.

## Review Focus

1. The compiled API still boots after `RolesGuard` leaves the global guard list; Task 10 Step 3 starts it through `pnpm dev:local` and calls `/api/health`.
2. `pnpm install --frozen-lockfile` (what CI runs) still passes after `@pathways/ui` leaves the lockfile; Task 2 runs it.
3. The rules machine route still denies controllers and handlers carrying public, auth-boundary or permission metadata after `ROLES_KEY` leaves the check list; the existing `rules-machine-boundary.test.ts` cases for the three remaining keys stay and must pass in Task 3.
4. `pnpm --filter @pathways/api dev` (through `infra/supabase/security-adapter/dev-local.mjs`) and `pnpm db:local:reset` (through `infra/supabase/phase6/hosted-*.sql`) still work after the infra cleanup; Task 10 smoke runs both.
5. Reports, dashboards and the project map still resolve `RulesHumanService` and `ProjectOverviewMetricsService` after the provider dedupe; the new wiring test plus the Nest boot in Task 10 cover this.

## Out of F1 (recorded for later sub-projects)

- `apps/web/src/lib/services/source-mutation.ts` keeps the `files` ticket option and `proofSnapshot()`; their only production user goes with `submitActivityProof`, but they belong to the activities proof flow and are reviewed in S2.
- `apps/web/src/types/pathways.ts` keeps `ExpenseRecord`, `BudgetRecord`, `AlertRecord`, `ReportRecord`, `SurveyFormDefinition`, `SurveyAggregateResultSet` and `PublicProjectRecord`; production code still imports them.
- Infra Pester files (`infra/supabase/phase6/*.Tests.ps1`) and `infra/supabase/security-adapter/runtime-output.test.mjs` test kept scripts; W1 wires or retires them.
- `packages/shared/src/types/common.ts` `ImportSummary` moves to `packages/imports` in F2.

---

### Task 0: Worktree setup and baseline

**Files:** none changed.

- [ ] **Step 1: Install and copy local env files (never committed)**

```bash
cd /c/PATHWAYS/.worktrees/refactor-f1-dead-code
cp /c/PATHWAYS/.env .env
cp /c/PATHWAYS/apps/api/.env apps/api/.env
cp /c/PATHWAYS/apps/web/.env apps/web/.env
pnpm install --frozen-lockfile
git status --short
```

Expected: install succeeds; `git status --short` shows only `?? docs/superpowers/plans/2026-10-09-modularization-f1-dead-code.md` (env files are ignored).

- [ ] **Step 2: Record the baseline**

```bash
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+" 
```

Expected: typecheck clean; record each package's passing test count (dead-code removal on 2026-10-08 recorded shared 108, imports 91, config 19, api 2358, web 1969). Later tasks compare against these numbers; a count may only drop by the tests a task deletes on purpose.

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-10-09-modularization-f1-dead-code.md
git commit -m "docs: add the F1 dead code and hygiene plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Ignore rules and stale root files

**Files:**
- Modify: `.gitignore`
- Modify: `biome.json`
- Delete: `Dockerfile` (root only; `apps/api/Dockerfile` and `apps/web/Dockerfile` stay)
- Delete: `tsconfig.json` (root only; it extends the base with `"files": []` and builds nothing)
- Modify: `docs/rfc-pathways-aws-hosting-migration.md:50`

- [ ] **Step 1: Confirm nothing uses the root Dockerfile or root tsconfig.json**

```bash
git grep -n "NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE\|NEXT_PUBLIC_ENABLE_ROLE_PREVIEW" -- ':!Dockerfile'
git grep -nE "(^|[^/a-z.])tsconfig\.json" -- .github scripts package.json biome.json playwright*.ts
```

Expected: both print nothing. `infra/docker/docker-compose.yml` uses `apps/web/Dockerfile` and `apps/api/Dockerfile` only.

- [ ] **Step 2: Add ignore entries**

Append to `.gitignore`:

```
.worktrees/
.superpowers/
supabase/.temp/
supabase/.branches/
```

In `biome.json` replace the `files.ignore` array with:

```json
    "ignore": [
      "node_modules",
      ".next",
      ".next-dev",
      ".vercel",
      "dist",
      "coverage",
      ".pnpm-store",
      "playwright-report",
      "test-results",
      ".tmp",
      ".worktrees",
      ".superpowers",
      "supabase/.temp",
      "supabase/.branches"
    ]
```

- [ ] **Step 3: Delete the root files and fix the RFC reference**

```bash
git rm Dockerfile tsconfig.json
```

In `docs/rfc-pathways-aws-hosting-migration.md` line 50, replace `` `Dockerfile` `` with `` `apps/api/Dockerfile` ``.

- [ ] **Step 4: Verify**

```bash
pnpm lint && pnpm typecheck
```

Expected: both pass. Lint no longer reports anything under `.superpowers/`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore biome.json docs/rfc-pathways-aws-hosting-migration.md
git commit -m "chore: ignore local worktree and CLI state, drop the stale root Dockerfile and tsconfig

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Remove orphaned local Prisma copies (untracked, not committed)**

```bash
rm -rf /c/PATHWAYS/apps/api/.tmp
```

---

### Task 2: Remove `packages/ui`

**Files:**
- Delete: `packages/ui/` (whole folder)
- Modify: `apps/web/package.json` (remove `"@pathways/ui": "workspace:*",`)
- Modify: `apps/web/next.config.ts` (remove `'@pathways/ui',` from `transpilePackages`)
- Modify: `apps/web/vitest.config.ts:13` (remove the `'@pathways/ui'` alias line)
- Modify: `apps/web/tsconfig.json:23-24` and `tsconfig.base.json:23-24` (remove the two `@pathways/ui` path entries, and the trailing comma on the line before them)
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Confirm no source imports it**

```bash
git grep -n "@pathways/ui" -- ':!docs'
```

Expected: only the six wiring lines listed above (package.json, next.config.ts, vitest.config.ts, two tsconfig files with two lines each). No `.ts`/`.tsx` source import.

- [ ] **Step 2: Remove the wiring and the package**

```bash
git rm -r packages/ui
```

Edit the five files as listed. The `transpilePackages` array becomes:

```ts
    transpilePackages: ['@pathways/config', '@pathways/imports', '@pathways/shared'],
```

- [ ] **Step 3: Refresh the lockfile and prove CI install still works**

```bash
pnpm install
pnpm install --frozen-lockfile
git grep -n "@pathways/ui" -- ':!docs'
```

Expected: both installs succeed; the grep prints nothing.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm --filter @pathways/web test && pnpm --filter @pathways/web build
```

Expected: all pass; web test count equals the Task 0 baseline.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui apps/web/package.json apps/web/next.config.ts apps/web/vitest.config.ts apps/web/tsconfig.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: remove the unused @pathways/ui placeholder package

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the dead role-guard path and dead shared types

`@Roles(` has zero uses, so the global `RolesGuard` always returns true. `ROLES_KEY` is otherwise read only by the rules machine boundary, which denies routes carrying that metadata; with the decorator gone nothing can set it. Shared `AppRole`/`APP_ROLES` feed only this path. `healthStatusSchema`, `HealthStatusDto`, `PlaceholderModuleState` and `AppUserProfile` have no consumers.

**Files:**
- Delete: `apps/api/src/common/guards/roles.guard.ts`
- Delete: `apps/api/src/common/decorators/roles.decorator.ts`
- Modify: `apps/api/src/app.module.ts` (remove the `RolesGuard` import at line 10 and the `{ provide: APP_GUARD, useClass: RolesGuard }` entry at lines 204-207)
- Modify: `apps/api/src/modules/rules/rules-machine-boundary.ts` (remove the `ROLES_KEY` import at line 9; line 89 list becomes `[IS_PUBLIC_KEY, AUTH_BOUNDARY_KEY, PERMISSION_KEY]`)
- Modify: `apps/api/src/modules/rules/rules-machine-boundary.test.ts` (remove the `ROLES_KEY` import at line 11 and the `ROLES_KEY` entries at lines 231 and 292)
- Delete: `packages/shared/src/enums/app-role.ts`, `packages/shared/src/constants/roles.ts`, `packages/shared/src/constants/roles.test.ts`, `packages/shared/src/schemas/health.ts`
- Modify: `packages/shared/src/types/common.ts` (remove the `AppRole` import, `PlaceholderModuleState`, `AppUserProfile`)
- Modify: `packages/shared/src/index.ts` (remove the `constants/roles`, `enums/app-role` and `schemas/health` export lines)

- [ ] **Step 1: Confirm the references are exactly these**

```bash
git grep -n "ROLES_KEY\|RolesGuard\|roles.decorator\|AppRole\b\|APP_ROLES\|healthStatusSchema\|HealthStatusDto\|PlaceholderModuleState\|AppUserProfile" -- apps packages
```

Expected: hits only in the files listed above.

- [ ] **Step 2: Apply the deletions and edits**

```bash
git rm apps/api/src/common/guards/roles.guard.ts apps/api/src/common/decorators/roles.decorator.ts \
  packages/shared/src/enums/app-role.ts packages/shared/src/constants/roles.ts \
  packages/shared/src/constants/roles.test.ts packages/shared/src/schemas/health.ts
```

`packages/shared/src/types/common.ts` becomes:

```ts
export interface NavItem {
  href: string
  label: string
  description: string
}

export interface HealthStatus {
  status: 'ok'
  service: string
  timestamp: string
  version: string
}

export interface ImportSummary {
  fileName: string
  fileType: 'csv' | 'xlsx' | 'xls'
  totalRows: number
  totalColumns: number
  headers: string[]
  warnings: string[]
}
```

The two `it.each` lists in `rules-machine-boundary.test.ts` become `[IS_PUBLIC_KEY, AUTH_BOUNDARY_KEY, PERMISSION_KEY]` and `[IS_PUBLIC_KEY, AUTH_BOUNDARY_KEY, PERMISSION_KEY, 'class-purpose', 'unregistered'] as const`.

- [ ] **Step 3: Verify**

```bash
git grep -n "ROLES_KEY\|RolesGuard\|AppRole\b\|APP_ROLES" -- apps packages
pnpm typecheck
pnpm --filter @pathways/api exec vitest run src/modules/rules/rules-machine-boundary.test.ts
pnpm --filter @pathways/api test && pnpm --filter @pathways/shared test
```

Expected: grep prints nothing; typecheck clean; the boundary test passes (its case count drops by 2); api count equals baseline minus 2; shared count equals baseline minus the `roles.test.ts` cases.

- [ ] **Step 4: Commit**

```bash
git add -A apps/api/src packages/shared/src
git commit -m "refactor(api): remove the unused role guard, roles decorator and dead shared role and health types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One registration per Nest provider

`RulesHumanService` is provided by both `DashboardsModule` and `RulesHumanModule`; `ProjectOverviewMetricsService` by both `ProjectsModule` and `ProjectMapModule`. `StorageModule` is `@Global()` yet `ImportsModule` imports it.

**Files:**
- Create: `apps/api/src/app-module-wiring.test.ts`
- Modify: `apps/api/src/modules/rules/rules-human.module.ts`
- Modify: `apps/api/src/modules/dashboards/dashboards.module.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Modify: `apps/api/src/modules/project-map/project-map.module.ts`
- Modify: `apps/api/src/modules/imports/imports.module.ts`

**Interfaces:**
- Produces: `RulesHumanModule` exports `RulesHumanService`; `DashboardsModule` exports only `DashboardsService`; `ReportsModule` imports `RulesHumanModule`; `ProjectMapModule` imports `ProjectsModule` for `ProjectOverviewMetricsService`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/app-module-wiring.test.ts`:

```ts
import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'

type ModuleRef = { name: string }

// Walks static and dynamic module imports reachable from the root module.
function reachableModules(root: ModuleRef, seen = new Set<ModuleRef>()): Set<ModuleRef> {
  if (seen.has(root)) return seen
  seen.add(root)
  const imports: unknown[] = Reflect.getMetadata('imports', root) ?? []
  for (const entry of imports) {
    if (typeof entry === 'function') reachableModules(entry as ModuleRef, seen)
    else if (entry && typeof entry === 'object' && 'module' in entry)
      reachableModules((entry as { module: ModuleRef }).module, seen)
  }
  return seen
}

describe('application module wiring', () => {
  it('registers each provider class in exactly one module', () => {
    const owners = new Map<unknown, string[]>()
    for (const module of reachableModules(AppModule)) {
      const providers: unknown[] = Reflect.getMetadata('providers', module) ?? []
      for (const provider of providers) {
        if (typeof provider !== 'function') continue
        owners.set(provider, [...(owners.get(provider) ?? []), module.name])
      }
    }
    const duplicates = [...owners]
      .filter(([, modules]) => modules.length > 1)
      .map(([provider, modules]) => `${(provider as ModuleRef).name}: ${modules.join(', ')}`)
    expect(duplicates).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @pathways/api exec vitest run src/app-module-wiring.test.ts
```

Expected: FAIL listing `RulesHumanService: DashboardsModule, RulesHumanModule` and `ProjectOverviewMetricsService: ProjectsModule, ProjectMapModule` (module order may differ).

- [ ] **Step 3: Fix the module wiring**

`apps/api/src/modules/rules/rules-human.module.ts` adds `exports: [RulesHumanService],` after `providers`.

`apps/api/src/modules/dashboards/dashboards.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { IndicatorsModule } from '../indicators/indicators.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ActionCountsController } from './action-counts.controller'
import { ActionCountsService } from './action-counts.service'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'
import { RoleOverviewController } from './role-overview.controller'
import { RoleOverviewService } from './role-overview.service'
@Module({
  imports: [IndicatorsModule, RulesHumanModule],
  controllers: [
    DashboardsController,
    AnalyticsController,
    ActionCountsController,
    RoleOverviewController,
  ],
  providers: [DashboardsService, AnalyticsService, ActionCountsService, RoleOverviewService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
```

`apps/api/src/modules/reports/reports.module.ts` imports `RulesHumanModule` from `'../rules/rules-human.module'` and uses `imports: [DashboardsModule, ProjectsModule, ReportPdfModule, RulesHumanModule],`.

`apps/api/src/modules/project-map/project-map.module.ts`:

```ts
import { Module } from '@nestjs/common'

import { DashboardsModule } from '../dashboards/dashboards.module'
import { ProjectsModule } from '../projects/projects.module'
import { ProjectMapController } from './project-map.controller'
import { ProjectMapService } from './project-map.service'

@Module({
  imports: [DashboardsModule, ProjectsModule],
  controllers: [ProjectMapController],
  providers: [ProjectMapService],
})
export class ProjectMapModule {}
```

`apps/api/src/modules/imports/imports.module.ts`: remove the `StorageModule` import line and use `imports: [BeneficiariesModule, ParticipantsModule],`.

- [ ] **Step 4: Run the test and the suite**

```bash
pnpm --filter @pathways/api exec vitest run src/app-module-wiring.test.ts
pnpm --filter @pathways/api typecheck && pnpm --filter @pathways/api test
```

Expected: the wiring test PASSES; api count equals Task 3 count plus 1.

- [ ] **Step 5: Prove Nest resolves the graph**

```bash
pnpm --filter @pathways/api build
```

Expected: build succeeds. The boot check runs in Task 10 with the local stack.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app-module-wiring.test.ts apps/api/src/modules
git commit -m "refactor(api): register rules and project overview services once and drop the redundant storage import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Remove stub and uncalled web client methods

All lines refer to `apps/web/src/lib/services/pathways-client.ts` on dev `8e9f1274`; search by method name because lines shift as you delete.

**Files:**
- Modify: `apps/web/src/lib/services/pathways-client.ts`
- Modify: `apps/web/src/lib/services/pathways-client.test.ts`
- Modify: `apps/web/src/lib/services/pathways-client.c2-c4.test.ts`
- Delete: `apps/web/src/lib/services/mock-budget-client.test.ts`
- Modify: `apps/web/src/lib/services/public-projects.ts` (remove `readPublicProjects`)
- Modify: `apps/web/src/types/pathways.ts`

- [ ] **Step 1: Confirm no production caller for the 28 methods**

```bash
for m in getEvaluation getExpenses getRecommendationOutcomes getTransparencySections getBudgets getAlerts getAlertsForRole getAnalyticsLocations getRecommendations getRecommendationsForRole getRules getReports getSurveyForms getSurveyAggregateResults getAssessmentDetail updateProjectPeriod createMilestone getProjectIndicator archiveBeneficiary getBeneficiarySadddAggregatesForRole archiveDigitalForm validateDirectSubmission submitActivityProof getMilestones updateMilestone listDirectSubmissions getPublicProjects getPublicProject; do
  hits=$(git grep -lw "$m" -- apps/web/src apps/web/e2e | grep -v "pathways-client\(\.c2-c4\)\?\.test\.ts\|pathways-client\.ts\|mock-budget-client\.test\.ts\|lib/demo-state/")
  echo "$m: ${hits:-none}"
done
```

Expected: every line ends in `none`, except `getBudgets`, `getRules`, `getAlerts`, `getReports` and similar names may also match same-named functions in other clients (for example `coreDataClient.getBudgets` in `core-feature-client.ts`). For each such hit, open the file and confirm the call is not on `pathwaysClient`.

- [ ] **Step 2: Delete the methods from the interface and the class**

Remove each of the 28 methods from both the `PathwaysClient` interface and `BackendReadyPathwaysClient`:

- Stubs (14): `getEvaluation`, `getExpenses`, `getRecommendationOutcomes`, `getTransparencySections`, `getBudgets`, `getAlerts`, `getAlertsForRole`, `getAnalyticsLocations`, `getRecommendations`, `getRecommendationsForRole`, `getRules`, `getReports`, `getSurveyForms`, `getSurveyAggregateResults`.
- Uncalled (8): `getAssessmentDetail`, `updateProjectPeriod`, `createMilestone`, `getProjectIndicator`, `archiveBeneficiary`, `getBeneficiarySadddAggregatesForRole`, `archiveDigitalForm`, `validateDirectSubmission`.
- Test-only (6): `submitActivityProof`, `getMilestones`, `updateMilestone`, `listDirectSubmissions`, `getPublicProjects`, `getPublicProject`.

Then remove the helpers they leave dead:

- `backendNotConfigured` and the comment block directly below it that begins "List reads deliberately contain no records".
- `'not_configured'` from the `PathwaysClientError` code union.
- `parseAssessmentDetail` (keep `AssessmentDetail`, `assessmentTypes`, `isNullableString`, `parseAssessmentSummaries`).
- `dateOnly`, `parseMilestone`, `parseMilestones`.
- The `readPublicProjects` import.
- Reword the comment that says "retired multipart path above" (after `submitActivityProof`) to one sentence that no longer points at a removed method, for example `// Proof uploads use the reserve, signed upload and finalize routes below.`
- From the `@/types/pathways` import list remove: `AnalyticsLocationRecord`, `BeneficiarySadddAggregate`, `DirectFormSubmissionPage`, `EvaluationRecord`, `ProjectMilestone`, `RecommendationOutcomeRecord`, `RecommendationRecord`, `RuleDefinition`, `SaveMilestoneInput`, `SubmitActivityProofInput`, `SurveyAggregateFilters`, `TransparencySection`, `UpdateMilestoneInput`, plus any of `AlertRecord`, `BudgetRecord`, `ExpenseRecord`, `PublicProjectRecord`, `ReportRecord`, `SurveyAggregateResultSet`, `SurveyFormDefinition` that the file no longer uses (typecheck in Step 5 reports leftovers through Biome's unused-import rule).

In `apps/web/src/lib/services/public-projects.ts` delete the exported `readPublicProjects` function (line 87) and any private helper only it used.

- [ ] **Step 3: Update the tests that called removed methods**

- Delete `apps/web/src/lib/services/mock-budget-client.test.ts` (`git rm`).
- `pathways-client.test.ts`:
  - Delete the test `clears retained multipart note/files immediately through the existing logout lifecycle and never enables generic proof abandonment` (calls `submitActivityProof`).
  - Replace the test `does not fabricate collection records while remaining domain endpoints are unavailable` with:

```ts
  it('returns no beneficiary records for aggregate-only roles', async () => {
    await expect(pathwaysClient.getBeneficiaryRecordsForRole('Program Manager')).resolves.toEqual(
      [],
    )
  })
```

  - Rename the test `reports unfinished record reads as explicitly not configured` to `rejects dashboard reads without a session` and delete its `getPublicProject` assertion, keeping the `getDashboard` one.
  - In `uses the scoped paginated draft-list and persisted-submission routes`, rename it to `reads one persisted submission through the scoped route`, delete the first `mockResolvedValueOnce` (the paginated list response), the `listDirectSubmissions` call and the `fetcher.mock.calls[0]` expectation, and change the remaining expectation to `fetcher.mock.calls[0]`.
- `pathways-client.c2-c4.test.ts`: delete the tests `submits proof as multipart data without overriding the multipart boundary` and `parses persisted milestones and sends optimistic updates`.

- [ ] **Step 4: Remove the types that became dead in `apps/web/src/types/pathways.ts`**

Delete these exported types: `AnalyticsLocationRecord`, `AnalyticsLocationProjectSummary`, `EvaluationRecord`, `EvaluationWeight`, `EvaluationAnnotation`, `EvaluationHistoryEntry`, `RecommendationOutcomeRecord`, `TransparencySection`, `TransparencyApprovalState`, `SurveyAggregateFilters`, `ProjectMilestone`, `SaveMilestoneInput`, `UpdateMilestoneInput`, `BeneficiarySadddAggregate`, `DirectFormSubmissionPage`, `DirectFormSubmissionSummary`.

Keep `RecommendationRecord`, `RecommendationOutcome`, `RuleDefinition`, `RuleCategory`, `RuleOperator`, `RuleSeverity`, `RuleStatus` and `SubmitActivityProofInput` for now; Task 7 deletes the demo-state files that are their last users and removes them there.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @pathways/web typecheck && pnpm --filter @pathways/web lint && pnpm --filter @pathways/web test
grep -c "throw backendNotConfigured" apps/web/src/lib/services/pathways-client.ts
```

Expected: all pass; the grep prints `0`; web count equals baseline minus the deleted tests (mock-budget-client 1, pathways-client 1, c2-c4 2).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/lib/services apps/web/src/types/pathways.ts
git commit -m "refactor(web): remove stub and uncalled pathways client methods with their dead helpers and types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove unreferenced finance components

`live-finance-workspace.tsx` and `budget-editor-dialog.tsx` are imported only by their own tests; the project review screen uses `features/projects/budget-module/`.

**Files:**
- Delete: `apps/web/src/features/projects/live-finance-workspace.tsx`, `live-finance-workspace.test.tsx`, `budget-editor-dialog.tsx`, `budget-editor-dialog.test.tsx`

- [ ] **Step 1: Confirm**

```bash
git grep -ln "live-finance-workspace\|budget-editor-dialog\|LiveFinanceWorkspace\|BudgetEditorDialog" -- apps/web
```

Expected: only the four files above.

- [ ] **Step 2: Delete and verify**

```bash
git rm apps/web/src/features/projects/live-finance-workspace.tsx apps/web/src/features/projects/live-finance-workspace.test.tsx apps/web/src/features/projects/budget-editor-dialog.tsx apps/web/src/features/projects/budget-editor-dialog.test.tsx
pnpm --filter @pathways/web typecheck && pnpm --filter @pathways/web lint && pnpm --filter @pathways/web test
```

Expected: all pass; web count drops by exactly the cases in the two deleted tests.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(web): remove the unreferenced live finance workspace and budget editor dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Delete the demo state and move test fixtures

No production code imports `lib/demo-state` or `mocks`. Four live tests use five mock files, which depend on two type-only demo-state files.

| From | To |
|---|---|
| `apps/web/src/lib/demo-state/legacy-types.ts` | `apps/web/src/test/fixtures/fixture-types.ts` |
| `apps/web/src/lib/demo-state/legacy-prototype-role.ts` | `apps/web/src/test/fixtures/fixture-roles.ts` |
| `apps/web/src/mocks/pathways/activities.ts` | `apps/web/src/test/fixtures/activities.ts` |
| `apps/web/src/mocks/pathways/beneficiaries.ts` | `apps/web/src/test/fixtures/beneficiaries.ts` |
| `apps/web/src/mocks/pathways/projects.ts` | `apps/web/src/test/fixtures/projects.ts` |
| `apps/web/src/mocks/pathways/users.ts` | `apps/web/src/test/fixtures/users.ts` |
| `apps/web/src/mocks/pathways/real-api-fixtures.ts` | `apps/web/src/test/fixtures/api-view-fixtures.ts` |

**Files:**
- Move: the seven files above (`git mv`)
- Delete: every other file in `apps/web/src/lib/demo-state/` and `apps/web/src/mocks/`
- Modify: the four tests `apps/web/src/features/beneficiaries/beneficiary-directory.test.tsx`, `apps/web/src/features/beneficiaries/beneficiary-form.test.tsx`, `apps/web/src/features/projects/activity-utils.test.ts`, `apps/web/src/features/projects/project-team-selectors.test.ts`
- Modify: `apps/web/src/types/pathways.ts` (types whose last users were demo-state)
- Modify: `docs/e2e-legacy-spec-triage.md:5` (if it names `demo-state` as a live path)

- [ ] **Step 1: Confirm no production importer**

```bash
git grep -ln "@/lib/demo-state\|@/mocks/\|lib/demo-state/\|mocks/pathways" -- apps/web | grep -v "^apps/web/src/lib/demo-state/\|^apps/web/src/mocks/"
```

Expected: exactly the four test files listed above.

- [ ] **Step 2: Move the fixtures**

```bash
mkdir -p apps/web/src/test/fixtures
git mv apps/web/src/lib/demo-state/legacy-types.ts apps/web/src/test/fixtures/fixture-types.ts
git mv apps/web/src/lib/demo-state/legacy-prototype-role.ts apps/web/src/test/fixtures/fixture-roles.ts
git mv apps/web/src/mocks/pathways/activities.ts apps/web/src/test/fixtures/activities.ts
git mv apps/web/src/mocks/pathways/beneficiaries.ts apps/web/src/test/fixtures/beneficiaries.ts
git mv apps/web/src/mocks/pathways/projects.ts apps/web/src/test/fixtures/projects.ts
git mv apps/web/src/mocks/pathways/users.ts apps/web/src/test/fixtures/users.ts
git mv apps/web/src/mocks/pathways/real-api-fixtures.ts apps/web/src/test/fixtures/api-view-fixtures.ts
git rm -r apps/web/src/lib/demo-state apps/web/src/mocks
```

- [ ] **Step 3: Fix the imports**

- In the moved fixtures replace `'@/lib/demo-state/legacy-types'` with `'./fixture-types'`; in `fixture-types.ts` replace `'./legacy-prototype-role'` with `'./fixture-roles'`.
- In `api-view-fixtures.ts` change the first comment to `/** Test fixtures converted to current API view types. */`.
- In the four tests: `@/mocks/pathways/beneficiaries` becomes `@/test/fixtures/beneficiaries`, `@/mocks/pathways/projects` becomes `@/test/fixtures/projects`, `@/mocks/pathways/real-api-fixtures` becomes `@/test/fixtures/api-view-fixtures`.

- [ ] **Step 4: Prune unused fixture types**

```bash
cd apps/web/src/test/fixtures
for t in $(grep -oE "^export (type|interface) [A-Za-z]+" fixture-types.ts | awk '{print $3}'); do
  n=$(grep -lw "$t" *.ts | grep -v fixture-types.ts | wc -l)
  inner=$(grep -cw "$t" fixture-types.ts)
  [ "$n" = 0 ] && [ "$inner" = 1 ] && echo "unused: $t"
done
cd -
```

Delete every type printed as `unused`, then rerun the loop until it prints nothing (removing one type can free another). If `fixture-roles.ts` is then unreferenced, delete it too.

- [ ] **Step 5: Remove types whose last users were demo-state**

```bash
for t in RecommendationRecord RecommendationOutcome RuleDefinition RuleCategory RuleOperator RuleSeverity RuleStatus SubmitActivityProofInput; do
  echo "$t: $(git grep -lw "$t" -- apps/web/src | grep -v types/pathways.ts | tr '\n' ' ')"
done
```

Delete from `apps/web/src/types/pathways.ts` each type whose line shows no other file and that no remaining type in `pathways.ts` references.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @pathways/web typecheck && pnpm --filter @pathways/web lint && pnpm --filter @pathways/web test && pnpm --filter @pathways/web build
```

Expected: all pass; web count drops by exactly the cases in `store.test.ts`, `workflows.test.ts` and `dashboard-charts.test.ts`; the build output contains no `test/fixtures` chunk (Next bundles only imported files).

- [ ] **Step 7: Docs and commit**

If `docs/e2e-legacy-spec-triage.md:5` names `lib/demo-state` or `mocks` as a current path, change it to say the prototype demo state was removed on 2026-10-09 and fixtures live in `apps/web/src/test/fixtures`.

```bash
git add -A apps/web/src docs/e2e-legacy-spec-triage.md
git commit -m "refactor(web): delete the prototype demo state and move live test fixtures to test/fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Delete historical infra

Each path below was checked: no live script, CI job, app, package, kept infra file or live doc references it; any SHA256 pins inside them pin only other deleted files.

**Files:**
- Delete: `infra/supabase/phase5/`, `infra/supabase/phase7/`, `infra/supabase/pre-supporting/`, `infra/supabase/rule-based-access-alignment/`, `infra/supabase/session-liveness/`
- Delete: every file in `infra/supabase/migration-reconciliation/` except `baseline-data-inventory.sql`
- Delete: every file in `infra/supabase/security-adapter/` except `dev-local.mjs`, `Start-DevRuntime.ps1`, `Runtime-Output.ps1`, `runtime-launch.mjs`, `runtime-output.mjs`, `runtime-output.test.mjs`, `README.md`
- Delete: `infra/supabase/phase6/Test-LiveRuntimeDml.ps1`, `infra/supabase/phase6/hosted-role-profile-rehearsal.mjs`, `infra/supabase/phase6/hosted-role-profile.test.mjs`, `infra/supabase/phase6/partner-backfill-0039-dry-run.sql`
- Delete: `apps/api/prisma/tests/session-liveness-local.mjs` (its only caller was `session-liveness/deployment-runner.mjs`)
- Modify: `infra/supabase/phase6/README.md:40-41`, `infra/supabase/security-adapter/README.md`

- [ ] **Step 1: Re-confirm no live references**

```bash
for p in phase5 phase7 pre-supporting rule-based-access-alignment session-liveness/ session-liveness-local; do
  echo "$p: $(git grep -l "$p" -- . ':!infra/supabase/phase5' ':!infra/supabase/phase7' ':!infra/supabase/pre-supporting' ':!infra/supabase/rule-based-access-alignment' ':!infra/supabase/session-liveness' ':!infra/supabase/migration-reconciliation' ':!docs/audit-*' ':!docs/cr-*' ':!docs/activity-log.md' ':!docs/log-pathways.md' ':!docs/e2e-legacy-spec-triage.md' ':!docs/superpowers' | tr '\n' ' ')"
done
```

Expected: `phase5`, `phase7`, `pre-supporting`, `rule-based-access-alignment` print nothing; `session-liveness/` prints only `apps/api/prisma/tests/session-liveness-local.mjs` and `infra/supabase/phase6/README.md`; `session-liveness-local` prints nothing. (`docs/e2e-legacy-spec-triage.md` uses `phase5` and `phase7` as Playwright spec names, not infra paths.)

- [ ] **Step 2: Delete**

```bash
git rm -r -q infra/supabase/phase5 infra/supabase/phase7 infra/supabase/pre-supporting infra/supabase/rule-based-access-alignment infra/supabase/session-liveness
git ls-files infra/supabase/migration-reconciliation | grep -v '/baseline-data-inventory\.sql$' | xargs git rm -q
git ls-files infra/supabase/security-adapter | grep -vE '/(dev-local\.mjs|Start-DevRuntime\.ps1|Runtime-Output\.ps1|runtime-launch\.mjs|runtime-output\.mjs|runtime-output\.test\.mjs|README\.md)$' | xargs git rm -q
git rm -q infra/supabase/phase6/Test-LiveRuntimeDml.ps1 infra/supabase/phase6/hosted-role-profile-rehearsal.mjs infra/supabase/phase6/hosted-role-profile.test.mjs infra/supabase/phase6/partner-backfill-0039-dry-run.sql apps/api/prisma/tests/session-liveness-local.mjs
git ls-files infra/supabase/migration-reconciliation infra/supabase/security-adapter
```

Expected final listing: `migration-reconciliation/baseline-data-inventory.sql` and the seven kept `security-adapter` files.

- [ ] **Step 3: Fix the two READMEs**

- `infra/supabase/phase6/README.md` lines 40-41: replace the sentence pointing at `../session-liveness/README.md` with `Session liveness ships as migration-managed SQL; its historical deployment runner was removed on 2026-10-09 and remains in git history.`
- `infra/supabase/security-adapter/README.md`: remove every section, list item or command that names a deleted file (`Check-DevRuntime.ps1`, `Invoke-DevAdmin.ps1`, `Invoke-SecurityAdapterDeployment.ps1`, `Invoke-SecurityAdapterRecovery.ps1`, `Provision-DevRuntime.ps1`, `Recovery-Common.ps1`, `Test-RecoveryRuntime.ps1`, the `.sql` files, `migration-connection-check.mjs`, the contention and diagnostics tests, `profile-read.before.mjs`, `recovery-runtime-check.mjs`, `service-smoke.mjs`, `workspace-discovery-login*.mjs`, `tests/`). Keep the sections on `dev-local.mjs`, `Start-DevRuntime.ps1` and runtime output. Check `infra/environment.md:71` and `infra/supabase/HUMAN_SETUP.md:39` still describe text that exists in the README.

```bash
for f in $(git diff --cached --name-only --diff-filter=D | xargs -n1 basename); do
  grep -n "$f" infra/supabase/security-adapter/README.md infra/supabase/phase6/README.md infra/environment.md infra/supabase/HUMAN_SETUP.md
done
```

Expected: prints nothing.

- [ ] **Step 4: Verify the pins and the scripts that read infra**

```bash
pnpm --filter @pathways/api exec vitest run prisma/legacy-retirement.test.ts
pnpm --filter @pathways/api test
pnpm docs:check 2>&1 | tail -3
```

Expected: legacy-retirement test passes; api count unchanged from Task 4; docs check shows the same 6 pre-existing failures as dev and no new ones.

- [ ] **Step 5: Commit**

```bash
git add -A infra apps/api/prisma/tests
git commit -m "chore(infra): delete historical rollout, reconciliation and deployment runners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Records

**Files:**
- Modify: `docs/cr-pathways-codebase-modularization.md` (section 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-12, 13, 14, 18, 19 dispositions)
- Modify: `docs/index.md` (CR row status; register this plan under section 1.6)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Update the records**

- CR section 9: add `F1 applied 2026-10-09 on refactor/f1-dead-code: <one line per task group>; deferred to later sub-projects: source-mutation proof options (S2), ImportSummary move (F2), infra Pester and runtime-output tests (W1).`
- Audit: append ` Closed by F1.` to the disposition cell of MOD-12, MOD-13, MOD-14, MOD-18; for MOD-19 append ` Historical part closed by F1; rename in W1.`
- `docs/index.md`: CR row status becomes `Approved; F1 applied, F2 next`; add a section 1.6 row: `| [F1 dead code plan](superpowers/plans/2026-10-09-modularization-f1-dead-code.md) | superpowers/plans/2026-10-09-modularization-f1-dead-code.md | 2026-10-09 | F1 of the codebase modularization | Executed; remove after merge |`.
- `docs/activity-log.md`: add a `## 2026-10-09 Modularization F1 dead code and hygiene (refactor/f1-dead-code)` section with one bullet per task (what was removed, counts). Task 10 Step 5 appends the gate results.

- [ ] **Step 2: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
git add docs
git commit -m "docs: record modularization F1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: no failures beyond the 6 pre-existing ones.

---

### Task 10: Full release gates and merge

- [ ] **Step 1: Static gates**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all pass. Record per-package test counts; every difference from Task 0 must be explained by deleted tests (Tasks 3, 5, 6, 7) plus the new wiring test (Task 4).

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` starts the API through `infra/supabase/security-adapter/dev-local.mjs`, which runs `nest start` (compile, then run the compiled entry), so this also proves the kept security-adapter files work. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
```

Expected: `"status":"ok"`. A Nest dependency-resolution error in the `pnpm dev:local` output fails this gate. Then:

```bash
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: 66 and 27 tests pass (or the same pass/fail set as on dev; run dev first if a failure looks unrelated). Smoke in the browser as a Project Manager: dashboard loads with action counts and role overview, a project opens with its map and overview, a report generates, and the alerts page lists alerts (these touch the rewired dashboards, project-map, reports and rules modules).

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f1/manifest.json
```

Dispatch each role listed in the manifest's required roles (at least `restraint-guardian`, `design-qa-agent`, and `organization-isolation-checker` because `app.module.ts` guards and `rules-machine-boundary.ts` change) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f1/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f1/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Add a final bullet to the Task 9 activity-log section with the gate results (per-package test counts, replay exit code, e2e pass counts, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F1 release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
cd /c/PATHWAYS
git merge --no-ff refactor/f1-dead-code -m "Merge refactor/f1-dead-code into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not push `origin dev` until the developer says so. After merge, remove the executed plan in a follow-up commit (`git rm docs/superpowers/plans/2026-10-09-modularization-f1-dead-code.md`, drop its index row) as the CR section 6 requires.
