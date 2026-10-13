# S6 Finance and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the reports and report-pdf import cycle, give the finance, evaluation and report requests shared zod contracts, and split the three services by responsibility, with no change to any route, status code, response body, audit row, permission decision, transaction boundary, SQL statement or rendered screen, apart from the one 500 that becomes a 400 in ruling 4.

**Architecture:** S6 is split (ruling 1). This plan gives S6a (API and contracts) in full, nine tasks including baseline and gates, and S6b (web client and screens) as an outline at the end. S6a moves the report and receipt renderers to the modules that own them, so `print-pdf` keeps only the shared Chromium pipeline and a Vitest ratchet pins the remaining module pair. It then moves the zod request schemas verbatim into `packages/shared/src/contracts/{finance,evaluations,reports}` behind service-level characterization tests, and splits each service with one-off Node scripts that copy checked line ranges verbatim. The scripts live under `.tmp/s6a/` (gitignored, never committed) and are given in full. Every step was dry-run in sequence on 2026-10-12 on an archive copy of dev `675a0b58` (F4a merged; its code is identical to `a101ad7c`): every expected output quoted below matched, the copy typechecked (api, shared, web, `scripts/sad`), Biome passed, and the api (135 files, 2426 tests), shared (21 files, 221 tests) and sad (52 tests) suites passed.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, Prisma 6.19, zod 3.25.76, Vitest 3, Biome 1.9.4, Next 15.5.14, Playwright, puppeteer-core with @sparticuz/chromium.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S6, 4, 6, 7 and the F1 to F4b dispositions in section 9) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-08, MOD-11 and MOD-17 for S6a; MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for S6b).

## Rulings

Controller rulings for S6. Each was checked against `refactor/f4a-web-boundaries` `a101ad7c` and rechecked on dev `675a0b58`, which differs only in `docs/activity-log.md`. F4b and S1 to S5 land before S6; none of them is expected to touch the S6 api files, and Task 0 stops on any hash or count that differs.

1. **Split into S6a and S6b.** The S6 row covers four api modules, their contracts, the web client members in `core-feature-client.ts`, the reports feature, the budget module and the evaluation workspace; with baseline, records and gates that is about seventeen tasks. S6a (this plan, branch `refactor/s6a-finance-reports-api`) takes the api and the shared contracts; S6b (outline below, branch `refactor/s6b-finance-reports-web`) takes the web. Both names replace `refactor/s6-finance-reports`; SAD evidence goes to `.tmp/sad/s6a/` and `.tmp/sad/s6b/`.
2. **The cycle is removed by moving each document renderer to its owner.** `report-pdf/report-pdf.renderer.ts` imported `reports/report-artifact` (`REPORT_MAX_BYTES`, `validatedReportRows`) and `reports/report-project-status` (`ProjectSections`) while `reports` imported the renderer. `ReportPdfRenderer` and its test move to `modules/reports`, `ReceiptPdfRenderer` moves to `modules/finance`, and the folder, which then holds only the Chromium pipeline, becomes `modules/print-pdf` with `PrintPdfModule` providing and exporting `PrintPdfRenderer` once (one shared browser, as today). Moves use `git mv`; the module wiring is a second commit. The only other mutual pair, `dashboards <-> reports`, stays: `dashboards/analytics.service.ts` uses the generic artifact writer `reports/report-artifact.ts`, whose bundled font and coverage files are found by source path at runtime and copied by the `nest-cli.json` asset glob, so moving it changes the hosted bundle, which cannot be verified locally. A new case in `apps/api/src/common/import-boundary.test.ts` fails when two api modules import each other outside the recorded list `['dashboards <-> reports']`; S7 shrinks it. Longer cycles through `dashboards` (for example `dashboards -> reports -> evaluations -> dashboards`) are not pairs and stay for S7.
3. **Requests stay validated in the service, as in S3 ruling 6.** The three controllers pass `@Body() input: unknown` and `@Query() query: unknown` to services that parse with zod and answer `400 { statusCode: 400, message: '<fixed text>', error: 'Bad Request' }` with a string message (for example `Invalid budget record.`); `ZodPipe` would answer a `message` array. The seeds call the services directly (`finance.budgets` 2, `createBudget` 1, `expenses` 1, `review` 3, `signoff` 1, `submit` 1, `uploadReceipt` 1, `evaluations.createEvaluation` 2, `saveScores` 1, `reports.generate` 1), so a controller pipe would leave those paths unvalidated. No S6 module has a class-validator DTO (MOD-11's 13 modules do not include them; `reports.dto.ts` is a zod module), so there is no DTO parity test: a service-level characterization test per module is written first, commits green against the old schemas, and runs unchanged after the switch (apart from ruling 4). `reports.dto.ts` is deleted (CR 3.2: no `*.dto.ts`).
4. **The expense amount check no longer throws.** `amount: money.refine((value) => new Prisma.Decimal(value).greaterThan(0))` cannot move into `packages/shared`, which imports only `zod`. The shared contract uses `money.refine((value) => /[1-9]/.test(value))`: on every string the money regex `^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$` accepts, the amount is above zero exactly when some digit is 1 to 9. Zod 3 runs a refinement even after the regex failed, and `Prisma.Decimal` throws `[DecimalError] Invalid argument` on `'abc'`, `''` and `' 1'` (probed under Prisma 6.19.2), so those three bodies answered 500; they now answer 400 `Invalid expense submission.`. This is the only accepted difference; Task 2 pins the three rows before and after. The web sends the amount from a `type="number"` input with `min="0.01"` and refuses an empty value first, so no screen sends these strings.
5. **Contract names (CR 3.6).** `createBudgetRequest`, `replaceBudgetRequest`, `submitExpenseRequest`, `reviewExpenseRequest`, `uploadExpenseReceiptRequest`, `createEvaluationRequest`, `saveEvaluationScoresRequest`, `submitEvaluationRequest`, `returnEvaluationRequest`, `signOffEvaluationRequest`, `enrollmentAssessmentsQuery`, `reportPreviewQuery` and `generateReportRequest`, each with its `z.infer` type in PascalCase. None of these names, nor any new api export named below, exists at `a101ad7c` (Task 0 greps 0), so the barrel stays free of TS2308. Schemas move verbatim; only the amount refinement of ruling 4 changes.
6. **S1 field schemas are not used here.** S1 ruling 2 ports class-validator rules (`IsUUID` versions, ISO 8601 forms, `Length` counting). The S6 schemas were always zod `.uuid()`, `.datetime({ offset: true })` and regular expressions, so swapping in `uuidString` or `strictIsoDateString` would change what they accept.
7. **Split services are function modules named `.service.ts` that take the caller's `tx` (S1 ruling 7, CR 7 risk row).** Every extracted function is either a private method that already received `tx` or the body of an `withAuthorizedOperation` callback, moved verbatim; each public method keeps its `withAuthorizedOperation` calls, permissions, `RepeatableRead` options and order, and now returns the function's result from inside the same callback. Constructors do not change, so the seeds and the 11 test files that construct `FinanceService`, `EvaluationsService` or `ReportsService` need no edit, and every `vi.mock` keeps applying because the moved code imports the same module paths. `.tmp/s6a/move-lines.mjs` copies each range only after checking its first and last line, and the only text edits are listed replacements with exact counts.
8. **Files named for their purpose (CR 3.2, 3.5, MOD-17).** `evaluation-metrics.ts` becomes `evaluation-metrics.service.ts` (it holds `EvaluationMetricsService`) and its test follows; `report-sources-extra.ts` becomes `report-monitoring-evaluation-source.ts` once its kind policy moves to `reports.helpers.ts`; `report-pdf/` becomes `print-pdf/`. New files: `evaluations.helpers.ts` (pure: `classifyScoreCommentary`, criterion types, the no-data marker, `day`, the id rule), `evaluations.mapper.ts` (the existing top-level row mappers and selects), `evaluation-detail.service.ts`, `evaluation-scoring.service.ts`, `evaluation-assessments.service.ts`, `evaluation-review.service.ts`, `reports.helpers.ts`, `report-source.service.ts`, `report-generation.service.ts`, `finance.helpers.ts` and `expense-receipts.service.ts`. `reports` now imports the pure `evaluations.helpers.ts` instead of the metrics service file. Finance and reports keep their inline route maps and get no mapper, because no response contract exists yet; S6b decides response contracts with the web response schemas.
9. **Kernel adoption.** The `surveyForms`, `evaluationRounds` and `list` report routes replace their identical seven-line inline lookup with `requireScopedProject(tx, actor, projectId)`: the zod UUID regex and `UUID_PATTERN` accept the same strings, the 404 text is the same `Project unavailable.`, the kernel looks up the lowercased id (equal in the `uuid` column), and the later queries still use the id as sent; Task 5 pins all three before the change. `loadReportSource` keeps its inline lookup because the form and evaluation id checks sit between the project id check and the lookup, and `export` keeps its two because they answer `Report unavailable.`. The 9 `Prisma.TransactionClient` annotations in S6 production code become `Tx`.
10. **The missing-profile checks stay.** S1's `requestIdentity` answers `Application profile is required.`; the finance (1), reports (1) and evaluations (8) controller checks answer `Application profile required.`, like the publication controller that S8 ruling 13 keeps. A 403 text change is outside the CR 3.6 wording allowance, so they stay; a later Change Record may unify the wording.
11. **SAD routing gains api helpers.** `assertReportPermission`, `readableReportKinds`, `kindPermission` and `extraKindRequires` decide which report kinds a role may read; today they sit in `reports.service.ts`, which `apps/api/src/**/*.service.ts` routes to organization-isolation-checker. In `reports.helpers.ts` only `apps/api/src/**` (design-qa-agent) would match, so a later edit to the kind policy would skip the isolation review. Task 7 adds `apps/api/src/**/*.helpers.ts` to organization-isolation-checker (CR 3.2 helpers hold domain rules, and permission rules are among them), with a `scripts/sad/check.test.ts` case and the `docs/sad-pathways.md` row. Every other moved or new file stays under an existing glob: `apps/api/src/**/*.service.ts` (the function modules), `packages/shared/src/contracts/**/*.ts` (beneficiary-privacy-guardian, which also reviews the evaluation assessment move) and S1's `apps/api/src/**/*.mapper.ts`. No glob names `report-pdf`.
12. **Spec facts corrected by the baseline.** The modules `dashboards`, `evaluations`, `projects`, `report-pdf` and `reports` form one strongly connected group with two mutual pairs (`dashboards <-> reports`, `report-pdf <-> reports`); S6a removes the second. MOD-04 sizes are now `reports.service.ts` 873 (audit 877), `evaluations.service.ts` 809 (audit 846) and `finance.service.ts` 631. MOD-06's `reporting-workspace.tsx` (1132) is production-dead: only its own test imports it, the reports routes render `LiveReportingWorkspace`, and it is the only user of `survey-report-overview.tsx`, `survey-report-utils.ts` and `reportKindPermissions`; S6b deletes it. MOD-08's reports inline lookups (F3a left them to the slices) are handled by ruling 9.
13. Cross-plan: order with S3b and S2b: S3b runs first and has already deleted the `ProjectIndicator` alias, so `reporting-workspace.tsx` imports `IndicatorResponse` from `@pathways/shared`, calls `indicatorsClient.getProjectIndicators`, and `reporting-workspace.test.tsx` and `reporting-page.test.tsx` mock `@/lib/api/indicators`; S6b Task 1 deletes that chain from S3b's result regardless. S2b leaves the four activity expense files, which S6b claims for `features/projects/budget/` from S1b's layout. S6a imports `metricCellSchema` from the barrel, which S3 keeps; it never imports `monitoring/metric-cell` directly. The keep-in-service validation of ruling 3 is the S3 criterion recorded in the S1 plan. Cost if wrong: a merge conflict in a deleted file, or a stale `features/projects` path in the budget move.
14. Cross-plan (S1b): S1b leaves `features/projects/` with `components/`, `team/` and `index.ts` and no `hooks/`, and the print receipt route already imports through the feature index, so S6b repoints the index export line. S6b Task 0 recounts the pathways-client mock factories (42 after S1b, not 49). Cost if wrong: S6b looks for a `hooks/` folder or edits a route import that is already correct.
15. Cross-plan (S2b): the S6b repoints of the expense dialogs and the `finance-budgets` read follow S2b's layout (`activities/components/activity-detail-content.tsx`, `activities/hooks/use-activity-expenses.ts`), the budget module already imports `../activities/activities.utils` and `../activities/activities.reads`, and `features/projects/budget/` gets no `index.ts` (S2b measured a sub-index growing `/dashboard` by 23 kB; the feature index lists leaf paths). Cost if wrong: a stale import path in Task 5, or 23 kB on the dashboard route.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary, SQL statement or rendered screen changes. The only accepted difference is ruling 4.
- Direction (CR 3.1): `apps/api/src/common/**` never imports `apps/api/src/modules/**`; the api module pair ratchet, the web direction and the package boundary tests pass at every commit after Task 1.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits (CR 6). Line moves go through `.tmp/s6a/move-lines.mjs`, which copies ranges verbatim; a script error stops the step, never a hand edit.
- Split services take the caller's `tx`; none opens its own transaction (ruling 7).
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use: `pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/(evaluations|reports|finance|print-pdf)/"` must print nothing (Biome 1.9 does not flag unused imports and `tsconfig.base.json` has no `noUnusedLocals`).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- The line counts the scripts print are split lengths, one more than `wc -l` for a file that ends with a newline.
- One-off scripts live in `.tmp/s6a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s6a-finance-reports-api`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/web`; under `apps/api/prisma` only the import specifiers that `repoint.mjs` rewrites in `local-demo-seed.ts` and `defense-demo-seed.ts` change.

## Review Focus

1. An expense amount that `Prisma.Decimal` could not parse (`'abc'`, `''`, `' 1'`) must now answer 400 `Invalid expense submission.`, and every other amount must answer exactly as before: `'0'`, `'0.00'`, `'1e5'`, `'-1'` and the number `250` refused, `'0.01'` and `'250.00'` accepted with the same value reaching the SQL call. Task 2 pins both sets in `finance.validation.test.ts` and in the shared contract test.
2. The compiled API must boot with `PrintPdfRenderer` provided once and both document renderers resolvable, and a PDF report must still render or fall back to pdfkit. A Nest `can't resolve dependencies` error naming `ReportPdfRenderer` or `ReceiptPdfRenderer` fails the gate; `app-module-wiring.test.ts` (Task 1) fails on a second `PrintPdfRenderer` provider; Task 8 boots the compiled API, runs `scripts/check-pdf-renderer.ts` and generates a PDF report.
3. A report read route given a malformed, unscoped or upper-case project id must answer as before: 404 `Project unavailable.` without a lookup for a malformed id, 404 for an unscoped one, and reads with the id as sent for an upper-case one. Task 5 Step 1 pins all three routes before `requireScopedProject` replaces the inline lookup.
4. A rejected request must not start an authorized operation, and an accepted one must reach the database with the trimmed value. `finance.validation.test.ts`, `evaluations.validation.test.ts` and `reports.validation.test.ts` (Tasks 2 and 3) record the operations started and assert none for refused bodies.
5. The seeds must still build the demo data: both seed families construct `FinanceService`, `ReportsService` and `EvaluationsService` and import the renderer and metrics types from moved paths. Task 8 runs `pnpm db:local:demo` and `pnpm db:defense:local`; a module-resolution error fails the gate.

## Interfaces assumed from earlier slices

S6a needs nothing new from F4b or S1 to S5. It assumes they left these in place, and Task 0 verifies them by hash or grep:

- F3a and F3b kernel, unchanged: `type Tx` (`apps/api/src/common/prisma/transaction.ts`), `requireScopedProject(tx: Tx, actor: ApplicationIdentity, projectId: string): Promise<string>` (`common/authz/scoped-project.ts`), `projectScope(profile: ApplicationIdentity)` (`common/authz/project-scope.ts`), `writeAuditLog` (`common/audit/write-audit-log.ts`), `withAuthorizedOperation` (`common/authz/authorized-operation.ts`).
- S3a: `metricCellSchema` and `MonitoringDashboard` still exported from `@pathways/shared` under those names (S3 moves `metricCellSchema` to `packages/shared/src/monitoring/metric-cell.ts` and keeps the dashboard contract in `metric-contract.ts`); `IndicatorsService.readInTransaction(tx, actor, projectIds)` unchanged in `apps/api/src/modules/indicators/indicators.service.ts`. S3's codemod renames `MonitoringIndicator` to `IndicatorResponse` in `apps/api/src/modules/reports/report-project-status.ts`; S6a does not edit that file.
- S3a: the CR section 3.6 bullet that begins `- A domain whose services are also called by seeds or by other services keeps parsing its request in the service` (Task 7 extends it; if it is missing, Task 7 adds it).
- S1a: the constructors of `ProjectOverviewMetricsService` and `RulesHumanService` and `DashboardsService.monitoringInTransaction` unchanged (the reports deps object passes them through); S1's `apps/api/src/**/*.mapper.ts` glob in `scripts/sad/check.ts` (it routes the new `evaluations.mapper.ts`; without it the shared contracts still route the branch to beneficiary-privacy-guardian).
- S5: `apps/api/src/modules/metadata/form-definition-export.service.ts` and `form-definition-export.ts` still import `../reports/report-artifact`, which S6a does not move.

S6b consumes, from F4b (listed again in its outline): `apps/web/src/lib/format/{date,percent,plural,tone}.ts`, `apps/web/src/lib/api/core/request.ts` (`PathwaysClientError`, `requestFoundation`, `requestFoundationResponse`; `readContextCookie` is private there), `apps/web/src/lib/api/core/request-owner.ts` (`captureRequestOwner`), `apps/web/src/hooks/use-authorized-read.ts` (`useAuthorizedRead`) and the `apps/web/src/lib/api/**/*.ts` beneficiary-privacy-guardian route. Its other assumptions are listed in its outline.

## Audit findings covered

| Finding | S6 subject | Where |
|---|---|---|
| MOD-04 | `reports.service.ts` 873, `evaluations.service.ts` 809 (audit 877 and 846), `finance.service.ts` 631 | S6a Tasks 4, 5 and 6 |
| MOD-05 | finance, evaluation and report members of `core-feature-client.ts`, `getBeneficiaryAssessments` in `pathways-client.ts` | S6b Task 2 |
| MOD-06 | `reporting-workspace.tsx` 1132 (production-dead, ruling 12) | S6b Task 1 |
| MOD-08 | the inline project-scope lookups in reports that F3a left to the slices | S6a Task 5 (ruling 9) |
| MOD-11 | finance, evaluation and report request schemas, `reports.dto.ts` | S6a Tasks 2 and 3 (ruling 3) |
| MOD-15 | `features/reports` and the budget and evaluation folders without a public `index.ts` | S6b Task 5 |
| MOD-16 | the duplicated `finance-budgets` read key, `live-evaluation-workspace.tsx` `statusTone` | S6b Task 6 |
| MOD-17 | `report-pdf` holding two domain renderers, `report-sources-extra.ts`, `evaluation-metrics.ts`, `reports.dto.ts`, `budget-module` | S6a Tasks 1, 3, 4 and 5; S6b Task 5 |
| Section 9 deferrals | the 9 `Prisma.TransactionClient` annotations in S6 production code (F3a) | S6a Tasks 4 and 5 |

MOD-09 and MOD-13 for finance and reports were closed by F3a and F3b; MOD-B1 and MOD-B2 stay out of scope.

## Out of S6a (recorded for S6b and later sub-projects)

- Web client members, the reports feature, the budget module, the evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts (MOD-05, MOD-06, MOD-15, MOD-16, MOD-17 web parts): S6b, outlined at the end.
- The `dashboards <-> reports` pair and the longer cycles through `dashboards`: S7 (ruling 2).
- The 10 `Application profile required.` controller checks: a later Change Record (ruling 10).
- The literal `['PROGRAM_MANAGER', 'GRANT_MANAGER']` inside `assessmentDetailDeniedRoles` (moved verbatim to `evaluation-assessments.service.ts`) versus shared `aggregateOnlyRoles`: S8, with the other copies.
- A shared private-storage read helper for the four upload-then-inspect and read paths in finance and reports: not done; their env checks and 503 texts differ, so a helper would be a logic change.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s6-finance-reports.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains S5 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 -E "Merge refactor/s5[ab]?-"
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers"
ls docs/superpowers/plans | grep modularization
git checkout -b refactor/s6a-finance-reports-api
pnpm install --frozen-lockfile
mkdir -p .tmp/s6a
```

Expected: clean status, an S5 merge commit and the F4b merge commit printed, install succeeds. If either merge is missing, stop and report: S6a builds on the S5 tree. Write down the listed modularization plans; an executed plan that is still listed is reported, not removed here.

- [ ] **Step 2: Create the module pair script**

Create `.tmp/s6a/module-pairs.mjs`:

```js
// Prints each pair of api modules whose non-test files import each other.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const modules = path.resolve('apps/api/src/modules')
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
const moduleOf = (file) => {
  const relative = path.relative(modules, file)
  return relative.startsWith('..') || !relative.includes(path.sep) ? null : relative.split(path.sep)[0]
}
const edges = new Set()
for (const file of files(modules)) {
  const from = moduleOf(file)
  const text = readFileSync(file, 'utf8')
  for (const [, specifier] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g)) {
    const to = moduleOf(path.resolve(path.dirname(file), specifier))
    if (from && to && to !== from) edges.add(`${from}>${to}`)
  }
}
const pairs = [...edges]
  .map((edge) => edge.split('>'))
  .filter(([from, to]) => from < to && edges.has(`${to}>${from}`))
  .map(([from, to]) => `${from} <-> ${to}`)
  .sort()
console.log(pairs.join('\n') || 'no pairs')
```

- [ ] **Step 3: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git hash-object apps/api/src/modules/finance/finance.service.ts apps/api/src/modules/evaluations/evaluations.service.ts apps/api/src/modules/evaluations/evaluations.service.test.ts apps/api/src/modules/evaluations/evaluation-metrics.ts apps/api/src/modules/evaluations/evaluation-metrics.test.ts apps/api/src/modules/evaluations/evaluation-criteria-template.ts apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.service.test.ts apps/api/src/modules/reports/reports.dto.ts apps/api/src/modules/reports/report-sources-extra.ts apps/api/src/modules/reports/report-project-status-source.ts apps/api/src/modules/report-pdf/report-pdf.module.ts apps/api/src/modules/report-pdf/report-pdf.renderer.ts apps/api/src/modules/report-pdf/receipt-pdf.renderer.ts apps/api/src/modules/report-pdf/print-pdf.renderer.ts apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts
node .tmp/s6a/module-pairs.mjs
git grep -n "Prisma.TransactionClient" -- apps/api/src/modules/finance apps/api/src/modules/evaluations apps/api/src/modules/reports apps/api/src/modules/report-pdf | grep -v "\.test\.ts:" | wc -l
git grep -nwE "createBudgetRequest|replaceBudgetRequest|submitExpenseRequest|reviewExpenseRequest|uploadExpenseReceiptRequest|createEvaluationRequest|saveEvaluationScoresRequest|submitEvaluationRequest|returnEvaluationRequest|signOffEvaluationRequest|enrollmentAssessmentsQuery|reportPreviewQuery|generateReportRequest|PrintPdfModule|loadReportSource|ReportSourceDeps|reserveReport|finalizeReport|assertReportPermission|readableReportKinds|admitReceiptUpload|admitReceiptRead|readOfficialReceipt" -- apps packages | wc -l
grep -c "A domain whose services are also called by seeds" docs/cr-pathways-codebase-modularization.md
grep -c "'apps/api/src/\*\*/\*.helpers.ts'" scripts/sad/check.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts and file counts (config, shared, imports, api, web), the sad count and the docs check failure count. Later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`). The hashes print, in order:

```text
f209d501235cd966ce70048d1c37dbf7e48a093f
72230d4aa4b0f063ca63ab049c7c7dba5435c122
c9934537fae1e1a2c9b645cffdd00b050696f637
ecd66fc881708be598d0ef3aa0a2d132e11ffb9c
e38907cffdcc286b42ddbb16cd26c50b83c48208
c1267ea3f7743342b93e73586ae0e3f1b8b69285
2c4b04a578d897fffe7944846d66a39f17aecda1
aad40d1621110e4672e1f34724e73222e175297a
b77b3141bb1a78e40a2faaea19f8921944896988
b33b7b1002c95b3e59d41ba412e7345d31592987
9b5974acb0c83d9d3300a29d29427dee19221e2a
6cd3ea965af32a60f04ee680670efa59d3bab2f6
986d2fd64a524f953c3da074b07bf175f36637c0
d42f10634607a327cf1896fa2b147cc4abc5e43c
b48c425617c849604eaf68e569296e74121edf8c
064d0994b349963cbca12c033f8fd3939b836112
```

Then `dashboards <-> reports` and `report-pdf <-> reports` (two lines), then `9`, then `0`, then `1` (the S3a bullet; `0` is allowed and handled in Task 7), then `0` (no helpers glob yet; a `1` means an earlier slice added it, and Task 7 Step 1 then only adds the test case). If a hash or count differs, stop and report: the line ranges and replacement counts below were taken from these exact files. A third module pair is reported too, because the Task 1 ratchet records exactly one pair.

- [ ] **Step 4: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s6-finance-reports.md`.

In `docs/index.md` section 1.6, add as the last row of the table:

```markdown
| [S6 finance and reports plan](superpowers/plans/2026-10-12-modularization-s6-finance-reports.md) | 2026-10-12-modularization-s6-finance-reports.md | 2026-10-12 | S6 of the codebase modularization: S6a renderer cycle, finance, evaluation and report contracts and service splits; S6b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-12-modularization-s6-finance-reports.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S6 finance and reports plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 3 baseline.

---

### Task 1: Move the document renderers to their owners and keep only the print pipeline in print-pdf

**Files:**
- Move: `apps/api/src/modules/report-pdf/report-pdf.renderer.ts` -> `apps/api/src/modules/reports/report-pdf.renderer.ts`
- Move: `apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts` -> `apps/api/src/modules/reports/report-pdf.renderer.test.ts`
- Move: `apps/api/src/modules/report-pdf/receipt-pdf.renderer.ts` -> `apps/api/src/modules/finance/receipt-pdf.renderer.ts`
- Move: `apps/api/src/modules/report-pdf/print-pdf.renderer.ts` -> `apps/api/src/modules/print-pdf/print-pdf.renderer.ts`
- Move: `apps/api/src/modules/report-pdf/report-pdf.module.ts` -> `apps/api/src/modules/print-pdf/print-pdf.module.ts`
- Modify (specifiers only, 16 files listed in Step 2): finance and reports sources and tests, both seeds, `apps/api/scripts/check-pdf-renderer.ts`
- Modify: `apps/api/src/modules/print-pdf/print-pdf.module.ts`, `apps/api/src/modules/reports/reports.module.ts`, `apps/api/src/modules/finance/finance.module.ts` (commit 2)
- Test: `apps/api/src/common/import-boundary.test.ts` (module pair ratchet)

**Interfaces:**
- Produces: `PrintPdfModule` from `apps/api/src/modules/print-pdf/print-pdf.module.ts` (provides and exports `PrintPdfRenderer`); `PrintPdfRenderer.render(request: PrintPdfRequest): Promise<Buffer>` from `print-pdf/print-pdf.renderer.ts` (unchanged); `ReportPdfRenderer`, `ReportPdfError`, `PrintSnapshot` from `apps/api/src/modules/reports/report-pdf.renderer.ts`; `ReceiptPdfRenderer`, `ReceiptPdfError` from `apps/api/src/modules/finance/receipt-pdf.renderer.ts` (definitions unchanged). `ReportsModule` provides `ReportPdfRenderer`; `FinanceModule` provides `ReceiptPdfRenderer`.

- [ ] **Step 1: Create the repoint script and the move list**

Create `.tmp/s6a/repoint.mjs`:

```js
// Rewrites relative import specifiers after files moved; usage: node repoint.mjs <moves.json> <root...>.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [movesFile, ...roots] = process.argv.slice(2)
const moves = new Map(JSON.parse(readFileSync(movesFile, 'utf8')).map(([from, to]) => [path.resolve(from), path.resolve(to)]))
const origin = new Map([...moves].map(([from, to]) => [to, from]))
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : files(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
// The file a relative specifier names, tried as written, with .ts and as a folder index.
const target = (dir, specifier) => {
  const base = path.resolve(dir, specifier)
  return [`${base}.ts`, path.join(base, 'index.ts'), base].find((file) => moves.has(file) || existsSync(file)) ?? `${base}.ts`
}
let changed = 0
for (const file of roots.flatMap((root) => files(path.resolve(root)))) {
  const before = readFileSync(file, 'utf8')
  const oldDir = path.dirname(origin.get(file) ?? file)
  const after = before.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.mock\(\s*)'(\.{1,2}\/[^']+)'/g, (match, lead, specifier) => {
    const resolved = target(oldDir, specifier)
    const moved = moves.get(resolved) ?? resolved
    let next = path.relative(path.dirname(file), moved).split(path.sep).join('/').replace(/\.ts$/, '')
    if (!next.startsWith('.')) next = `./${next}`
    return next === specifier ? match : `${lead}'${next}'`
  })
  if (after !== before) {
    writeFileSync(file, after)
    changed++
    console.log(path.relative(process.cwd(), file).split(path.sep).join('/'))
  }
}
console.log(`${changed} files rewritten`)
```

Create `.tmp/s6a/pdf-moves.json`:

```json
[
  ["apps/api/src/modules/report-pdf/report-pdf.renderer.ts", "apps/api/src/modules/reports/report-pdf.renderer.ts"],
  ["apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts", "apps/api/src/modules/reports/report-pdf.renderer.test.ts"],
  ["apps/api/src/modules/report-pdf/receipt-pdf.renderer.ts", "apps/api/src/modules/finance/receipt-pdf.renderer.ts"],
  ["apps/api/src/modules/report-pdf/print-pdf.renderer.ts", "apps/api/src/modules/print-pdf/print-pdf.renderer.ts"],
  ["apps/api/src/modules/report-pdf/report-pdf.module.ts", "apps/api/src/modules/print-pdf/print-pdf.module.ts"]
]
```

- [ ] **Step 2: Move the files and repoint their importers**

```bash
M=apps/api/src/modules
mkdir -p $M/print-pdf
git mv $M/report-pdf/report-pdf.renderer.ts $M/reports/report-pdf.renderer.ts
git mv $M/report-pdf/report-pdf.renderer.test.ts $M/reports/report-pdf.renderer.test.ts
git mv $M/report-pdf/receipt-pdf.renderer.ts $M/finance/receipt-pdf.renderer.ts
git mv $M/report-pdf/print-pdf.renderer.ts $M/print-pdf/print-pdf.renderer.ts
git mv $M/report-pdf/report-pdf.module.ts $M/print-pdf/print-pdf.module.ts
rmdir $M/report-pdf 2>/dev/null; test ! -e $M/report-pdf && echo "report-pdf folder gone"
node .tmp/s6a/repoint.mjs .tmp/s6a/pdf-moves.json apps/api/src apps/api/prisma apps/api/scripts
```

Expected (dry run):

```text
report-pdf folder gone
apps/api/src/modules/finance/finance.boundary.test.ts
apps/api/src/modules/finance/finance.ledger.test.ts
apps/api/src/modules/finance/finance.module.ts
apps/api/src/modules/finance/finance.service.test.ts
apps/api/src/modules/finance/finance.service.ts
apps/api/src/modules/finance/receipt-pdf.renderer.ts
apps/api/src/modules/print-pdf/print-pdf.module.ts
apps/api/src/modules/reports/report-pdf.renderer.test.ts
apps/api/src/modules/reports/report-pdf.renderer.ts
apps/api/src/modules/reports/reports-runtime.local.test.ts
apps/api/src/modules/reports/reports.module.ts
apps/api/src/modules/reports/reports.service.test.ts
apps/api/src/modules/reports/reports.service.ts
apps/api/prisma/defense-demo-seed.ts
apps/api/prisma/local-demo-seed.ts
apps/api/scripts/check-pdf-renderer.ts
16 files rewritten
```

After this step `print-pdf.module.ts` still declares `ReportPdfModule` and provides all three renderers; that is intended for one commit and fixed in Step 5.

- [ ] **Step 3: Run the tests and commit the move**

```bash
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
git grep -n "report-pdf/" -- apps/api
pnpm --filter @pathways/api exec vitest run src/modules/finance src/modules/reports src/modules/print-pdf src/app-module-wiring.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move the report and receipt renderers to their modules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; tests, typecheck and lint pass; api count equals `B_api`.

- [ ] **Step 4: Write the failing module pair ratchet**

Append to `apps/api/src/common/import-boundary.test.ts`, after the last `describe` block and one blank line:

```ts
// The api module a file belongs to, or null outside src/modules.
function moduleOf(file: string): string | null {
  const relative = path.relative(modules, file)
  return relative.startsWith('..') || !relative.includes(path.sep)
    ? null
    : relative.split(path.sep)[0]
}

// Pairs of api modules whose non-test files import each other, as sorted "a <-> b" labels.
function mutualModulePairs(files: string[], read: (file: string) => string): string[] {
  const edges = new Set<string>()
  for (const file of files) {
    const from = moduleOf(file)
    for (const specifier of specifiers(read(file))) {
      if (!from || !specifier.startsWith('.')) continue
      const to = moduleOf(path.resolve(path.dirname(file), specifier))
      if (to && to !== from) edges.add(`${from}>${to}`)
    }
  }
  return [...edges]
    .map((edge) => edge.split('>'))
    .filter(([from, to]) => from < to && edges.has(`${to}>${from}`))
    .map(([from, to]) => `${from} <-> ${to}`)
    .sort()
}

describe('api module import pairs', () => {
  it('detects two modules that import each other', () => {
    const sources: Record<string, string> = {
      [path.join(modules, 'alpha', 'alpha.service.ts')]: "import { b } from '../beta/beta.service'",
      [path.join(modules, 'beta', 'beta.service.ts')]:
        "import { a } from '../alpha/alpha.helpers'\nimport { c } from '../gamma/gamma.service'",
      [path.join(modules, 'gamma', 'gamma.service.ts')]:
        "import { t } from '../../common/prisma/transaction'",
    }
    expect(mutualModulePairs(Object.keys(sources), (file) => sources[file])).toEqual([
      'alpha <-> beta',
    ])
  })

  it('allows only the recorded pair of modules that import each other', () => {
    const files = sourceFiles(modules)
    expect(files.length).toBeGreaterThan(100)
    // The generic report artifact writer is shared with the analytics export; this pair is recorded for S7.
    expect(mutualModulePairs(files, (file) => readFileSync(file, 'utf8'))).toEqual([
      'dashboards <-> reports',
    ])
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/import-boundary.test.ts`
Expected: FAIL on the new case `allows only the recorded pair of modules that import each other` only (the other cases of the file pass), with the received list `dashboards <-> reports`, `finance <-> print-pdf`, `print-pdf <-> reports` (the module still provides the moved renderers).

- [ ] **Step 5: Give print-pdf only the print pipeline**

Replace `apps/api/src/modules/print-pdf/print-pdf.module.ts` with:

```ts
import { Module } from '@nestjs/common'
import { PrintPdfRenderer } from './print-pdf.renderer'

@Module({
  providers: [PrintPdfRenderer],
  exports: [PrintPdfRenderer],
})
export class PrintPdfModule {}
```

Replace `apps/api/src/modules/reports/reports.module.ts` with:

```ts
import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { PrintPdfModule } from '../print-pdf/print-pdf.module'
import { ProjectsModule } from '../projects/projects.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule, ProjectsModule, PrintPdfModule, RulesHumanModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPdfRenderer],
})
export class ReportsModule {}
```

Replace `apps/api/src/modules/finance/finance.module.ts` with:

```ts
import { Module } from '@nestjs/common'
import { PrintPdfModule } from '../print-pdf/print-pdf.module'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { ReceiptPdfRenderer } from './receipt-pdf.renderer'
@Module({
  imports: [PrintPdfModule],
  controllers: [FinanceController],
  providers: [FinanceService, ReceiptPdfRenderer],
})
export class FinanceModule {}
```

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm exec biome check --write apps/api/src/common/import-boundary.test.ts apps/api/src/modules/print-pdf apps/api/src/modules/reports/reports.module.ts apps/api/src/modules/finance/finance.module.ts
pnpm --filter @pathways/api exec vitest run src/common src/app-module-wiring.test.ts src/modules/finance src/modules/reports
git grep -n "ReportPdfModule" -- apps
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/common/import-boundary.test.ts apps/api/src/modules/print-pdf apps/api/src/modules/reports/reports.module.ts apps/api/src/modules/finance/finance.module.ts
git commit -m "refactor(api): give print-pdf only the print pipeline and pin api module pairs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the whole boundary file passes, `app-module-wiring.test.ts` passes (no provider registered twice), the grep prints nothing; api = `B_api + 2`.

---

### Task 2: Finance request contracts

**Files:**
- Test: `apps/api/src/modules/finance/finance.validation.test.ts` (new, permanent)
- Create: `packages/shared/src/contracts/finance/finance-requests.ts`
- Test: `packages/shared/src/contracts/finance/finance-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Modify: `apps/api/src/modules/finance/finance.service.ts` (local schemas removed, contracts used)

**Interfaces:**
- Consumes: `ReceiptPdfRenderer` at `apps/api/src/modules/finance/receipt-pdf.renderer.ts` (Task 1).
- Produces, from `@pathways/shared`: `createBudgetRequest` / `CreateBudgetRequest` (`{ category: string; plannedBudget: string; activityId?: string | null; remarks?: string | null }`, strict), `replaceBudgetRequest` / `ReplaceBudgetRequest` (the same plus `expectedUpdatedAt: string`), `submitExpenseRequest` / `SubmitExpenseRequest` (`{ clientRequestId; budgetRecordId; description; amount; expenseDate }`, strict), `reviewExpenseRequest` / `ReviewExpenseRequest` (`{ expectedUpdatedAt; decision: 'VERIFY' | 'APPROVE' | 'REJECT'; stage: 'VERIFY' | 'APPROVE'; reason?: string }`, refined), `uploadExpenseReceiptRequest` / `UploadExpenseReceiptRequest` (`{ expectedUpdatedAt: string }`, strict).

- [ ] **Step 1: Write the finance validation characterization test**

Create `apps/api/src/modules/finance/finance.validation.test.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import { privateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import { FinanceService } from './finance.service'
import type { ReceiptPdfRenderer } from './receipt-pdf.renderer'

const state = vi.hoisted(() => ({ permissions: [] as string[], tx: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: (
    _db: unknown,
    identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    state.permissions.push(permission)
    return work(state.tx, identity)
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const budgetId = '20000000-0000-4000-8000-000000000002'
const org = '30000000-0000-4000-8000-000000000003'
const requestId = '40000000-0000-4000-8000-000000000004'
const updatedAt = '2026-09-27T00:00:00.000Z'
const actor: ApplicationIdentity = {
  id: org,
  aal: 'aal2',
  userId: org,
  organizationId: org,
  fullName: 'Fictional finance user',
  roles: ['PROJECT_MANAGER'],
  permissions: [],
  assignedProjectIds: [projectId],
}
const tx = {
  project: { findFirst: vi.fn() },
  projectBudgetRecord: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
}
const service = new FinanceService(
  {} as PrismaService,
  {} as StorageService,
  {} as ReceiptPdfRenderer,
  privateStorageFactories,
)
const budget = { category: 'Training', plannedBudget: '1000.00' }
const expense = {
  clientRequestId: requestId,
  budgetRecordId: budgetId,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-06-15',
}
const pdf = Buffer.from('%PDF-synthetic')

// Calls a service method and returns its 400 message, or null when the body passed validation.
async function rejection(call: () => unknown): Promise<string | null> {
  try {
    await call()
    return null
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    return null
  }
}

describe('finance request validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permissions = []
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectBudgetRecord.create.mockResolvedValue({
      id: budgetId,
      updatedAt: new Date(updatedAt),
    })
    tx.projectBudgetRecord.findFirst.mockResolvedValue({
      id: budgetId,
      updatedAt: new Date(updatedAt),
    })
    tx.projectBudgetRecord.updateMany.mockResolvedValue({ count: 1 })
    tx.$queryRaw.mockResolvedValue([{ value: { id: budgetId } }])
  })

  it('stores a trimmed budget line with its optional fields', async () => {
    await service.createBudget(actor, projectId, {
      category: '  Training  ',
      plannedBudget: '0',
      activityId: null,
      remarks: '  Venue  ',
    })
    expect(tx.projectBudgetRecord.create.mock.calls[0]?.[0].data).toMatchObject({
      category: 'Training',
      plannedBudget: '0',
      activityId: null,
      remarks: 'Venue',
    })
  })

  it.each([
    [{}],
    [{ ...budget, category: '   ' }],
    [{ ...budget, plannedBudget: '1000.001' }],
    [{ ...budget, plannedBudget: '01' }],
    [{ ...budget, plannedBudget: 1000 }],
    [{ ...budget, activityId: 'not-a-uuid' }],
    [{ ...budget, extra: true }],
    [{ ...budget, expectedUpdatedAt: updatedAt }],
  ])('refuses budget body %j with the fixed message', async (body) => {
    expect(await rejection(() => service.createBudget(actor, projectId, body))).toBe(
      'Invalid budget record.',
    )
    expect(state.permissions).toEqual([])
  })

  it('replaces a budget without storing the expected revision', async () => {
    await service.replaceBudget(actor, projectId, budgetId, {
      ...budget,
      expectedUpdatedAt: updatedAt,
    })
    expect(tx.projectBudgetRecord.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'expectedUpdatedAt',
    )
  })

  it.each([
    [budget],
    [{ ...budget, expectedUpdatedAt: '2026-09-27' }],
    [{ ...budget, expectedUpdatedAt: updatedAt, extra: 1 }],
  ])('refuses budget replacement %j with the fixed message', async (body) => {
    expect(await rejection(() => service.replaceBudget(actor, projectId, budgetId, body))).toBe(
      'Invalid budget replacement.',
    )
  })

  it('submits a trimmed expense with its values in order', async () => {
    await service.submit(actor, projectId, { ...expense, description: '  Venue  ' })
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      projectId,
      requestId,
      budgetId,
      'Venue',
      '250.00',
      '2026-06-15',
    ])
  })

  it.each([
    [{ ...expense, amount: '0' }],
    [{ ...expense, amount: '0.00' }],
    [{ ...expense, amount: '1e5' }],
    [{ ...expense, amount: '-1' }],
    [{ ...expense, amount: 250 }],
    [{ ...expense, expenseDate: '2026-02-30' }],
    [{ ...expense, expenseDate: '2026-6-15' }],
    [{ ...expense, description: '' }],
    [{ ...expense, clientRequestId: 'x' }],
    [{ ...expense, extra: true }],
  ])('refuses expense %j with the fixed message', async (body) => {
    expect(await rejection(() => service.submit(actor, projectId, body))).toBe(
      'Invalid expense submission.',
    )
  })

  // The Prisma.Decimal refinement throws on text it cannot parse, which the api answers with 500.
  it.each([['abc'], [''], [' 1']])('throws a decimal error for amount %j', (amount) => {
    expect(() => service.submit(actor, projectId, { ...expense, amount })).toThrow(
      '[DecimalError] Invalid argument',
    )
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'VERIFY' }, 'expenses.verify', 'VERIFY', null],
    [{ decision: 'APPROVE', stage: 'APPROVE' }, 'expenses.approve', 'APPROVE', null],
    [
      { decision: 'REJECT', stage: 'VERIFY', reason: ' Duplicate ' },
      'expenses.verify',
      'REJECT',
      'Duplicate',
    ],
  ])('reviews %j under the stage permission', async (body, permission, decision, reason) => {
    await service.review(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt, ...body })
    expect(state.permissions).toEqual([permission])
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      projectId,
      budgetId,
      new Date(updatedAt),
      decision,
      reason,
    ])
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'APPROVE' }],
    [{ decision: 'VERIFY', stage: 'VERIFY', reason: 'Not allowed' }],
    [{ decision: 'REJECT', stage: 'APPROVE' }],
    [{ decision: 'REJECT', stage: 'APPROVE', reason: '   ' }],
    [{ decision: 'SKIP', stage: 'VERIFY' }],
  ])('refuses review %j with the fixed message', async (body) => {
    expect(
      await rejection(() =>
        service.review(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt, ...body }),
      ),
    ).toBe('Invalid expense review.')
  })

  it('passes a receipt body that holds only the expected revision', async () => {
    const file = { buffer: pdf, size: pdf.length, mimetype: 'image/png' }
    expect(
      await rejection(() =>
        service.uploadReceipt(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt }, file),
      ),
    ).toBe('Receipt content does not match its supported format.')
  })

  it.each([
    [{}],
    [{ expectedUpdatedAt: 'yesterday' }],
    [{ expectedUpdatedAt: updatedAt, note: 'x' }],
  ])('refuses receipt body %j with the fixed message', async (body) => {
    const file = { buffer: pdf, size: pdf.length, mimetype: 'application/pdf' }
    expect(
      await rejection(() => service.uploadReceipt(actor, projectId, budgetId, body, file)),
    ).toBe('Invalid private receipt upload.')
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/finance/finance.validation.test.ts`
Expected: PASS, 39 tests, against the unchanged service (the three decimal rows throw, ruling 4).

- [ ] **Step 2: Commit the characterization**

```bash
pnpm exec biome check --write apps/api/src/modules/finance/finance.validation.test.ts
pnpm lint
git add apps/api/src/modules/finance/finance.validation.test.ts
git commit -m "test(api): characterize finance request validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: api = `B_api + 41`.

- [ ] **Step 3: Write the failing contract test**

Create `packages/shared/src/contracts/finance/finance-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  createBudgetRequest,
  replaceBudgetRequest,
  reviewExpenseRequest,
  submitExpenseRequest,
  uploadExpenseReceiptRequest,
} from './finance-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const revision = '2026-09-27T00:00:00.000Z'
const expense = {
  clientRequestId: uuid,
  budgetRecordId: uuid,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-06-15',
}

describe('finance request contracts', () => {
  it('trims a budget line and keeps a zero planned amount', () => {
    expect(
      createBudgetRequest.parse({ category: ' Training ', plannedBudget: '0', remarks: null }),
    ).toEqual({ category: 'Training', plannedBudget: '0', remarks: null })
  })

  it('needs the loaded revision only to replace a budget', () => {
    const line = { category: 'Training', plannedBudget: '10.50' }
    expect(createBudgetRequest.safeParse({ ...line, expectedUpdatedAt: revision }).success).toBe(
      false,
    )
    expect(replaceBudgetRequest.parse({ ...line, expectedUpdatedAt: revision })).toEqual({
      ...line,
      expectedUpdatedAt: revision,
    })
    expect(replaceBudgetRequest.safeParse(line).success).toBe(false)
  })

  it.each(['0', '0.00', '-1', '1e5', '1.234', 'abc', '', ' 1'])(
    'rejects the expense amount %j without throwing',
    (amount) => {
      expect(submitExpenseRequest.safeParse({ ...expense, amount }).success).toBe(false)
    },
  )

  it.each(['0.01', '1', '9999999999999999.99'])('accepts the expense amount %j', (amount) => {
    expect(submitExpenseRequest.safeParse({ ...expense, amount }).success).toBe(true)
  })

  it('rejects an impossible expense date', () => {
    expect(submitExpenseRequest.safeParse({ ...expense, expenseDate: '2026-02-30' }).success).toBe(
      false,
    )
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'VERIFY' }, true],
    [{ decision: 'REJECT', stage: 'APPROVE', reason: 'Duplicate' }, true],
    [{ decision: 'APPROVE', stage: 'VERIFY' }, false],
    [{ decision: 'APPROVE', stage: 'APPROVE', reason: 'No' }, false],
    [{ decision: 'REJECT', stage: 'VERIFY' }, false],
  ])('decides review %j as %s', (body, accepted) => {
    expect(reviewExpenseRequest.safeParse({ expectedUpdatedAt: revision, ...body }).success).toBe(
      accepted,
    )
  })

  it('accepts only the expected revision as receipt text fields', () => {
    expect(uploadExpenseReceiptRequest.safeParse({ expectedUpdatedAt: revision }).success).toBe(
      true,
    )
    expect(
      uploadExpenseReceiptRequest.safeParse({ expectedUpdatedAt: revision, file: 'x' }).success,
    ).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/finance`
Expected: FAIL, cannot resolve `./finance-requests`.

- [ ] **Step 4: Create the contract and export it**

Create `packages/shared/src/contracts/finance/finance-requests.ts`:

```ts
import { z } from 'zod'

const uuid = z.string().uuid()
const revision = z.string().datetime({ offset: true })
// A non-negative PHP amount sent as text, with at most two decimal places.
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)

// Body of POST projects/:projectId/finance/budgets.
export const createBudgetRequest = z
  .object({
    category: z.string().trim().min(1).max(200),
    plannedBudget: money,
    activityId: uuid.nullable().optional(),
    remarks: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
export type CreateBudgetRequest = z.infer<typeof createBudgetRequest>

// Body of PATCH projects/:projectId/finance/budgets/:budgetId.
export const replaceBudgetRequest = createBudgetRequest.extend({ expectedUpdatedAt: revision })
export type ReplaceBudgetRequest = z.infer<typeof replaceBudgetRequest>

// Body of POST projects/:projectId/finance/expenses; a money string is above zero when any digit is.
export const submitExpenseRequest = z
  .object({
    clientRequestId: uuid,
    budgetRecordId: uuid,
    description: z.string().trim().min(1).max(2000),
    amount: money.refine((value) => /[1-9]/.test(value)),
    expenseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          Number.isFinite(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value,
      ),
  })
  .strict()
export type SubmitExpenseRequest = z.infer<typeof submitExpenseRequest>

// Body of POST projects/:projectId/finance/expenses/:expenseId/review; only a rejection carries a reason.
export const reviewExpenseRequest = z
  .object({
    expectedUpdatedAt: revision,
    decision: z.enum(['VERIFY', 'APPROVE', 'REJECT']),
    stage: z.enum(['VERIFY', 'APPROVE']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) =>
    value.decision !== 'REJECT'
      ? value.decision === value.stage && value.reason === undefined
      : value.reason !== undefined,
  )
export type ReviewExpenseRequest = z.infer<typeof reviewExpenseRequest>

// Text fields of the multipart POST projects/:projectId/finance/expenses/:expenseId/receipt.
export const uploadExpenseReceiptRequest = z.object({ expectedUpdatedAt: revision }).strict()
export type UploadExpenseReceiptRequest = z.infer<typeof uploadExpenseReceiptRequest>
```

Append to `packages/shared/src/index.ts`, as its last line:

```ts
export * from './contracts/finance/finance-requests'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/finance
pnpm --filter @pathways/shared build
```

Expected: 20 tests pass; `packages/shared/dist/contracts/finance/finance-requests.js` exists.

- [ ] **Step 5: Switch the service to the contracts**

Create `.tmp/s6a/cut-blocks.mjs`:

```js
// Deletes line blocks from one file, then applies exact text replacements with expected counts.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, planFile] = process.argv.slice(2)
const { blocks = [], replacements = [] } = JSON.parse(readFileSync(planFile, 'utf8'))
let lines = readFileSync(file, 'utf8').split('\n')
for (const { first, prefix, last, count } of blocks) {
  // A block starts at an exact line, or at the only line that begins with the prefix.
  const starts = lines.flatMap((line, index) =>
    (first !== undefined ? line === first : line.startsWith(prefix)) ? [index] : [],
  )
  if (starts.length !== 1)
    throw new Error(`Expected one start line for ${first ?? prefix}, found ${starts.length}`)
  const start = starts[0]
  // A block ends at a line count or at the first exact last line after its start.
  const end = count !== undefined ? start + count - 1 : lines.indexOf(last, start)
  if (end < start || end >= lines.length) throw new Error(`Block end not found after ${lines[start]}`)
  // A blank line left behind by the cut goes with the block.
  const extra = lines[end + 1] === '' ? 1 : 0
  console.log(`cut ${end - start + 1} lines from ${lines[start].trim()}`)
  lines = [...lines.slice(0, start), ...lines.slice(end + 1 + extra)]
}
let text = lines.join('\n')
for (const [from, to, count] of replacements) {
  const found = text.split(from).length - 1
  if (found !== count) throw new Error(`Expected ${count} of ${JSON.stringify(from)}, found ${found}`)
  text = text.replaceAll(from, to)
}
writeFileSync(file, text)
console.log(`${file}: ${text.split('\n').length} lines`)
```

Create `.tmp/s6a/finance-contracts.json`:

```json
{
  "blocks": [{ "prefix": "const money = z.string()", "last": "  )" }],
  "replacements": [
    [
      "import { hasAtomicPermission } from '@pathways/shared'\nimport { Prisma } from '@prisma/client'\n",
      "import {\n  createBudgetRequest,\n  hasAtomicPermission,\n  replaceBudgetRequest,\n  reviewExpenseRequest,\n  submitExpenseRequest,\n  uploadExpenseReceiptRequest,\n} from '@pathways/shared'\n",
      1
    ],
    [
      "const parsed = budgetInput.safeParse(input)",
      "const parsed = createBudgetRequest.safeParse(input)",
      1
    ],
    [
      "const parsed = budgetInput\n      .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) })\n      .safeParse(input)",
      "const parsed = replaceBudgetRequest.safeParse(input)",
      1
    ],
    [
      "const parsed = expenseInput.safeParse(input)",
      "const parsed = submitExpenseRequest.safeParse(input)",
      1
    ],
    [
      "const parsed = reviewInput.safeParse(input)",
      "const parsed = reviewExpenseRequest.safeParse(input)",
      1
    ],
    [
      "const parsed = z\n      .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })\n      .strict()\n      .safeParse(input)",
      "const parsed = uploadExpenseReceiptRequest.safeParse(input)",
      1
    ]
  ]
}
```

Create `.tmp/s6a/finance-validation-flip.json` (ruling 4: the three rows now expect the fixed 400):

```json
{
  "replacements": [
    [
      "  // The Prisma.Decimal refinement throws on text it cannot parse, which the api answers with 500.\n  it.each([['abc'], [''], [' 1']])('throws a decimal error for amount %j', (amount) => {\n    expect(() => service.submit(actor, projectId, { ...expense, amount })).toThrow(\n      '[DecimalError] Invalid argument',\n    )\n  })\n",
      "  // These amounts made the old Prisma.Decimal refinement throw, which answered 500.\n  it.each([['abc'], [''], [' 1']])('refuses amount %j with the fixed message', async (amount) => {\n    expect(await rejection(() => service.submit(actor, projectId, { ...expense, amount }))).toBe(\n      'Invalid expense submission.',\n    )\n  })\n",
      1
    ]
  ]
}
```

```bash
node .tmp/s6a/cut-blocks.mjs apps/api/src/modules/finance/finance.service.ts .tmp/s6a/finance-contracts.json
node .tmp/s6a/cut-blocks.mjs apps/api/src/modules/finance/finance.validation.test.ts .tmp/s6a/finance-validation-flip.json
git grep -n "Prisma.Decimal\|budgetInput\|expenseInput\|reviewInput" -- apps/api/src/modules/finance/finance.service.ts
```

Expected (dry run):

```text
cut 38 lines from const money = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
apps/api/src/modules/finance/finance.service.ts: 594 lines
apps/api/src/modules/finance/finance.validation.test.ts: 231 lines
```

and the grep prints nothing.

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm exec biome check --write packages/shared/src/contracts/finance packages/shared/src/index.ts apps/api/src/modules/finance
pnpm --filter @pathways/api exec vitest run src/modules/finance
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/finance/"
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/finance packages/shared/src/index.ts apps/api/src/modules/finance
git commit -m "refactor(api): validate finance requests with the shared contracts

The expense amount check no longer throws on unparseable text, which answered 500 and now answers 400.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the finance suite passes (4 files, 71 tests in the dry run), the unused-import grep prints nothing; shared = `B_shared + 20`, api = `B_api + 41`.

---

### Task 3: Evaluation and report request contracts

**Files:**
- Test: `apps/api/src/modules/evaluations/evaluations.validation.test.ts`, `apps/api/src/modules/reports/reports.validation.test.ts` (new, permanent)
- Create: `packages/shared/src/contracts/evaluations/evaluation-requests.ts`, `packages/shared/src/contracts/reports/report-requests.ts`
- Test: `packages/shared/src/contracts/evaluations/evaluation-requests.test.ts`, `packages/shared/src/contracts/reports/report-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (two barrel lines)
- Modify: `apps/api/src/modules/evaluations/evaluations.service.ts`, `apps/api/src/modules/evaluations/evaluations.service.test.ts`, `apps/api/src/modules/reports/reports.service.ts`, `apps/api/src/modules/reports/reports.service.test.ts`
- Delete: `apps/api/src/modules/reports/reports.dto.ts`

**Interfaces:**
- Consumes: `cut-blocks.mjs` (Task 2); `ReportPdfRenderer` at `apps/api/src/modules/reports/report-pdf.renderer.ts` (Task 1).
- Produces, from `@pathways/shared`: `createEvaluationRequest` / `CreateEvaluationRequest`, `saveEvaluationScoresRequest` / `SaveEvaluationScoresRequest`, `submitEvaluationRequest` / `SubmitEvaluationRequest`, `returnEvaluationRequest` / `ReturnEvaluationRequest`, `signOffEvaluationRequest` / `SignOffEvaluationRequest`, `enrollmentAssessmentsQuery` / `EnrollmentAssessmentsQuery` (not strict, as before), `reportPreviewQuery` / `ReportPreviewQuery`, `generateReportRequest` / `GenerateReportRequest`.

- [ ] **Step 1: Write the evaluation and report validation characterization tests**

Create `apps/api/src/modules/evaluations/evaluations.validation.test.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsService } from './evaluations.service'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (_db: unknown, _identity: unknown, permission: string) => {
    state.permissions.push(permission)
    return 'accepted'
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const evaluationId = '20000000-0000-4000-8000-000000000002'
const revision = '2026-09-27T00:00:00.000Z'
const actor = { roles: ['PROJECT_MANAGER'], permissions: [] } as unknown as ApplicationIdentity
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)
const start = {
  clientRequestId: '30000000-0000-4000-8000-000000000003',
  title: 'Mid-term',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}

// Returns the 400 message of a service call, or 'accepted' when it reached the authorized operation.
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    return String(await call())
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    throw error
  }
}

describe('evaluation request validation', () => {
  beforeEach(() => {
    state.permissions = []
  })

  it.each([
    [start, 'accepted'],
    [{ ...start, periodLabel: ' Final ' }, 'accepted'],
    [{ ...start, periodEnd: '2026-01-01', periodStart: '2026-01-01' }, 'accepted'],
    [
      { ...start, periodEnd: '2025-12-31' },
      'Supply a title and a valid period for the evaluation.',
    ],
    [
      { ...start, periodStart: '2026-13-01' },
      'Supply a title and a valid period for the evaluation.',
    ],
    [{ ...start, title: '  ' }, 'Supply a title and a valid period for the evaluation.'],
    [{ ...start, periodLabel: '' }, 'Supply a title and a valid period for the evaluation.'],
    [{ ...start, extra: 1 }, 'Supply a title and a valid period for the evaluation.'],
  ])('starts %j as %s', async (body, expected) => {
    expect(await outcome(() => service.createEvaluation(actor, projectId, body))).toBe(expected)
  })

  it.each([
    [{ expectedUpdatedAt: revision }, 'accepted'],
    [{ expectedUpdatedAt: revision, commentary: '' }, 'accepted'],
    [{ expectedUpdatedAt: '2026-09-27' }, 'Supply the evaluation you last loaded.'],
    [{ expectedUpdatedAt: revision, scores: [] }, 'Supply the evaluation you last loaded.'],
  ])('saves scores for %j as %s', async (body, expected) => {
    expect(await outcome(() => service.saveScores(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it.each([
    [{ expectedUpdatedAt: revision }, 'accepted'],
    [{}, 'Supply the evaluation you last loaded.'],
    [{ expectedUpdatedAt: revision, commentary: 'x' }, 'Supply the evaluation you last loaded.'],
  ])('submits %j as %s', async (body, expected) => {
    expect(await outcome(() => service.submit(actor, projectId, evaluationId, body))).toBe(expected)
  })

  it.each([
    [{ expectedUpdatedAt: revision, reason: ' Recheck reach ' }, 'accepted'],
    [
      { expectedUpdatedAt: revision, reason: ' ' },
      'Supply a reason for returning this evaluation.',
    ],
    [{ expectedUpdatedAt: revision }, 'Supply a reason for returning this evaluation.'],
  ])('returns %j as %s', async (body, expected) => {
    expect(await outcome(() => service.returnToDraft(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it.each([
    [{ expectedUpdatedAt: revision, feedback: 'Approved' }, 'accepted'],
    [
      { expectedUpdatedAt: revision, feedback: '' },
      'Supply sign-off feedback for this evaluation.',
    ],
    [{ feedback: 'Approved' }, 'Supply sign-off feedback for this evaluation.'],
  ])('signs off %j as %s', async (body, expected) => {
    expect(await outcome(() => service.signoff(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it('refuses before any authorized operation starts', async () => {
    await outcome(() => service.createEvaluation(actor, projectId, {}))
    await outcome(() => service.saveScores(actor, projectId, evaluationId, {}))
    expect(state.permissions).toEqual([])
  })
})
```

Create `apps/api/src/modules/reports/reports.validation.test.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import type { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsService } from './reports.service'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (_db: unknown, _identity: unknown, permission: string) => {
    state.permissions.push(permission)
    throw new Error('accepted')
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const evaluationId = '30000000-0000-4000-8000-000000000003'
const actor = { roles: ['PROJECT_MANAGER'], permissions: [] } as unknown as ApplicationIdentity
const service = new ReportsService(
  {} as PrismaService,
  {} as StorageService,
  {} as DashboardsService,
  {} as ReportPdfRenderer,
  {} as ProjectOverviewMetricsService,
  {} as RulesHumanService,
  {} as PrivateStorageFactories,
)
const request = {
  clientRequestId: '40000000-0000-4000-8000-000000000004',
  name: 'Quarterly summary',
  kind: 'PROJECT_SUMMARY',
  format: 'CSV',
}

// Returns the 400 message of a service call, or 'accepted' when it reached the authorized operation.
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
    return 'returned'
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    return (error as Error).message
  }
}

describe('report request validation', () => {
  beforeEach(() => {
    state.permissions = []
  })

  it.each([
    [{ kind: 'PROJECT_SUMMARY' }, 'accepted'],
    [{ kind: 'SURVEY_FORM_RESULTS', formId }, 'accepted'],
    [{ kind: 'EVALUATION_REPORT', evaluationId }, 'accepted'],
    [{ kind: 'SURVEY_FORM_RESULTS' }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', formId }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', evaluationId }, 'Invalid report context.'],
    [{ kind: 'UNKNOWN' }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', format: 'CSV' }, 'Invalid report context.'],
  ])('previews %j as %s', async (query, expected) => {
    expect(await outcome(() => service.preview(actor, projectId, query))).toBe(expected)
  })

  it.each([
    [request, 'accepted'],
    [{ ...request, name: ' Padded name ' }, 'accepted'],
    [{ ...request, kind: 'SURVEY_FORM_RESULTS', formId }, 'accepted'],
    [{ ...request, format: 'DOCX' }, 'Invalid report request.'],
    [{ ...request, name: '   ' }, 'Invalid report request.'],
    [{ ...request, clientRequestId: 'x' }, 'Invalid report request.'],
    [{ ...request, evaluationId }, 'Invalid report request.'],
    [{ ...request, extra: true }, 'Invalid report request.'],
  ])('generates %j as %s', async (body, expected) => {
    expect(await outcome(() => service.generate(actor, projectId, body))).toBe(expected)
  })

  it('refuses a malformed project id before reading the body', async () => {
    expect(await outcome(() => service.generate(actor, 'not-a-uuid', {}))).toBe(
      'Project unavailable.',
    )
    expect(state.permissions).toEqual([])
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/evaluations/evaluations.validation.test.ts src/modules/reports/reports.validation.test.ts`
Expected: PASS, 22 and 17 tests, against the unchanged services.

- [ ] **Step 2: Commit the characterization**

```bash
pnpm exec biome check --write apps/api/src/modules/evaluations/evaluations.validation.test.ts apps/api/src/modules/reports/reports.validation.test.ts
pnpm lint
git add apps/api/src/modules/evaluations/evaluations.validation.test.ts apps/api/src/modules/reports/reports.validation.test.ts
git commit -m "test(api): characterize evaluation and report request validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: api = `B_api + 80`.

- [ ] **Step 3: Write the failing contract tests**

Create `packages/shared/src/contracts/evaluations/evaluation-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  createEvaluationRequest,
  enrollmentAssessmentsQuery,
  returnEvaluationRequest,
  saveEvaluationScoresRequest,
  signOffEvaluationRequest,
  submitEvaluationRequest,
} from './evaluation-requests'

const revision = '2026-09-27T00:00:00.000Z'
const start = {
  clientRequestId: '10000000-0000-4000-8000-000000000001',
  title: ' Mid-term ',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}

describe('evaluation request contracts', () => {
  it('trims the title and keeps the period', () => {
    expect(createEvaluationRequest.parse(start)).toEqual({ ...start, title: 'Mid-term' })
  })

  it('names the period end when it falls before the start', () => {
    const result = createEvaluationRequest.safeParse({ ...start, periodEnd: '2025-12-31' })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path)).toEqual([
      ['periodEnd'],
    ])
  })

  it.each(['2026-13-01', '2026-1-01', '01/01/2026'])('rejects the period start %j', (value) => {
    expect(createEvaluationRequest.safeParse({ ...start, periodStart: value }).success).toBe(false)
  })

  it('accepts only the loaded revision and optional commentary when saving scores', () => {
    expect(
      saveEvaluationScoresRequest.parse({ expectedUpdatedAt: revision, commentary: ' x ' }),
    ).toEqual({ expectedUpdatedAt: revision, commentary: 'x' })
    expect(
      submitEvaluationRequest.safeParse({ expectedUpdatedAt: revision, commentary: 'x' }).success,
    ).toBe(false)
  })

  it('requires a reason to return and feedback to sign off', () => {
    expect(
      returnEvaluationRequest.safeParse({ expectedUpdatedAt: revision, reason: ' ' }).success,
    ).toBe(false)
    expect(signOffEvaluationRequest.safeParse({ expectedUpdatedAt: revision }).success).toBe(false)
  })

  it('ignores other assessment query keys', () => {
    const enrollmentId = '20000000-0000-4000-8000-000000000002'
    expect(enrollmentAssessmentsQuery.parse({ enrollmentId, page: '2' })).toEqual({ enrollmentId })
  })
})
```

Create `packages/shared/src/contracts/reports/report-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { generateReportRequest, reportPreviewQuery } from './report-requests'

const formId = '10000000-0000-4000-8000-000000000001'
const evaluationId = '20000000-0000-4000-8000-000000000002'
const request = {
  clientRequestId: '30000000-0000-4000-8000-000000000003',
  name: ' Quarterly summary ',
  kind: 'PROJECT_SUMMARY',
  format: 'PDF',
}

describe('report request contracts', () => {
  it.each([
    [{ kind: 'SURVEY_FORM_RESULTS', formId }, true],
    [{ kind: 'EVALUATION_REPORT', evaluationId }, true],
    [{ kind: 'SURVEY_FORM_RESULTS' }, false],
    [{ kind: 'INDICATOR_SUMMARY', formId }, false],
    [{ kind: 'MONITORING_REPORT', evaluationId }, false],
  ])('decides preview %j as %s', (query, accepted) => {
    expect(reportPreviewQuery.safeParse(query).success).toBe(accepted)
  })

  it('keeps the survey refinement message', () => {
    const result = reportPreviewQuery.safeParse({ kind: 'SURVEY_FORM_RESULTS' })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      'Survey reports require a form; other reports do not accept one.',
    ])
  })

  it('trims the report name and refuses an unknown format', () => {
    expect(generateReportRequest.parse(request).name).toBe('Quarterly summary')
    expect(generateReportRequest.safeParse({ ...request, format: 'DOCX' }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/evaluations src/contracts/reports`
Expected: FAIL, cannot resolve `./evaluation-requests` and `./report-requests`.

- [ ] **Step 4: Create the contracts and export them**

Create `packages/shared/src/contracts/evaluations/evaluation-requests.ts`:

```ts
import { z } from 'zod'

const revision = z.string().datetime({ offset: true })
// A calendar date that also names a real UTC day.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf()))

// Body of POST projects/:projectId/evaluation/evaluations.
export const createEvaluationRequest = z
  .object({
    clientRequestId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    periodLabel: z.string().trim().min(1).max(80).optional(),
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'The period end cannot be before its start.',
    path: ['periodEnd'],
  })
export type CreateEvaluationRequest = z.infer<typeof createEvaluationRequest>

// Body of PATCH projects/:projectId/evaluation/evaluations/:evaluationId/scores.
export const saveEvaluationScoresRequest = z
  .object({
    expectedUpdatedAt: revision,
    commentary: z.string().trim().max(4000).optional(),
  })
  .strict()
export type SaveEvaluationScoresRequest = z.infer<typeof saveEvaluationScoresRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/submit.
export const submitEvaluationRequest = z.object({ expectedUpdatedAt: revision }).strict()
export type SubmitEvaluationRequest = z.infer<typeof submitEvaluationRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/return.
export const returnEvaluationRequest = z
  .object({
    expectedUpdatedAt: revision,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
export type ReturnEvaluationRequest = z.infer<typeof returnEvaluationRequest>

// Body of POST projects/:projectId/evaluation/evaluations/:evaluationId/signoff.
export const signOffEvaluationRequest = z
  .object({
    expectedUpdatedAt: revision,
    feedback: z.string().trim().min(1).max(2000),
  })
  .strict()
export type SignOffEvaluationRequest = z.infer<typeof signOffEvaluationRequest>

// Query of GET projects/:projectId/evaluation/assessments; other query keys are ignored.
export const enrollmentAssessmentsQuery = z.object({ enrollmentId: z.string().uuid() })
export type EnrollmentAssessmentsQuery = z.infer<typeof enrollmentAssessmentsQuery>
```

Create `packages/shared/src/contracts/reports/report-requests.ts`:

```ts
import { z } from 'zod'

import { reportKinds } from '../../constants/domain-codes'

const reportContext = z
  .object({
    kind: z.enum(reportKinds),
    formId: z.string().uuid().optional(),
    evaluationId: z.string().uuid().optional(),
  })
  .strict()
type Context = { kind: string; formId?: string; evaluationId?: string }
const validForm = (body: Context) => (body.kind === 'SURVEY_FORM_RESULTS') === Boolean(body.formId)
const validRound = (body: Context) => !body.evaluationId || body.kind === 'EVALUATION_REPORT'
const roundMessage = 'Only evaluation reports accept an evaluation round.'

// Query of GET projects/:projectId/reports/preview.
export const reportPreviewQuery = reportContext
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export type ReportPreviewQuery = z.infer<typeof reportPreviewQuery>

// Body of POST projects/:projectId/reports.
export const generateReportRequest = reportContext
  .extend({
    clientRequestId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    format: z.enum(['CSV', 'XLSX', 'XLS', 'PDF']),
  })
  .strict()
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export type GenerateReportRequest = z.infer<typeof generateReportRequest>
```

Append to `packages/shared/src/index.ts`, after the finance line:

```ts
export * from './contracts/evaluations/evaluation-requests'
export * from './contracts/reports/report-requests'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts
pnpm --filter @pathways/shared build
```

Expected: the two new files pass (8 and 7 tests).

- [ ] **Step 5: Switch the services and delete the reports DTO module**

Create `.tmp/s6a/evaluation-contracts.json`:

```json
{
  "blocks": [{ "prefix": "const dateOnly = z", "count": 38 }],
  "replacements": [
    [
      "import { hasAtomicPermission } from '@pathways/shared'\n",
      "import {\n  createEvaluationRequest,\n  enrollmentAssessmentsQuery,\n  hasAtomicPermission,\n  returnEvaluationRequest,\n  saveEvaluationScoresRequest,\n  signOffEvaluationRequest,\n  submitEvaluationRequest,\n} from '@pathways/shared'\n",
      1
    ],
    ["createEvaluationSchema.safeParse(input)", "createEvaluationRequest.safeParse(input)", 1],
    ["saveScoresSchema.safeParse(input)", "saveEvaluationScoresRequest.safeParse(input)", 1],
    ["submitEvaluationSchema.safeParse(input)", "submitEvaluationRequest.safeParse(input)", 1],
    ["returnEvaluationSchema.safeParse(input)", "returnEvaluationRequest.safeParse(input)", 1],
    ["signoffEvaluationSchema.safeParse(input)", "signOffEvaluationRequest.safeParse(input)", 1],
    [
      "z.object({ enrollmentId: z.string().uuid() }).safeParse(query)",
      "enrollmentAssessmentsQuery.safeParse(query)",
      1
    ]
  ]
}
```

Create `.tmp/s6a/evaluation-contracts-test.json`:

```json
{
  "replacements": [
    [
      "import { hasAtomicPermission } from '@pathways/shared'\n",
      "import { hasAtomicPermission, saveEvaluationScoresRequest } from '@pathways/shared'\n",
      1
    ],
    [
      "import { EvaluationsService, saveScoresSchema } from './evaluations.service'",
      "import { EvaluationsService } from './evaluations.service'",
      1
    ],
    ["saveScoresSchema.safeParse(", "saveEvaluationScoresRequest.safeParse(", 3]
  ]
}
```

Create `.tmp/s6a/report-contracts.json`:

```json
{
  "replacements": [
    [
      "import { type ReportKindCode, hasAtomicPermission, metricCellSchema } from '@pathways/shared'\n",
      "import {\n  type ReportKindCode,\n  generateReportRequest,\n  hasAtomicPermission,\n  metricCellSchema,\n  reportPreviewQuery,\n} from '@pathways/shared'\n",
      1
    ],
    ["import { reportInputSchema, reportQuerySchema } from './reports.dto'\n", "", 1],
    ["reportQuerySchema.safeParse(input)", "reportPreviewQuery.safeParse(input)", 1],
    ["reportInputSchema.safeParse(input)", "generateReportRequest.safeParse(input)", 1]
  ]
}
```

Create `.tmp/s6a/report-contracts-test.json`:

```json
{
  "replacements": [
    [
      "import { hasAtomicPermission } from '@pathways/shared'\n",
      "import { generateReportRequest, hasAtomicPermission, reportPreviewQuery } from '@pathways/shared'\n",
      1
    ],
    ["import { reportInputSchema, reportQuerySchema } from './reports.dto'\n", "", 1],
    ["reportQuerySchema.safeParse(", "reportPreviewQuery.safeParse(", 5],
    ["reportInputSchema.safeParse(", "generateReportRequest.safeParse(", 3]
  ]
}
```

```bash
E=apps/api/src/modules/evaluations
R=apps/api/src/modules/reports
node .tmp/s6a/cut-blocks.mjs $E/evaluations.service.ts .tmp/s6a/evaluation-contracts.json
node .tmp/s6a/cut-blocks.mjs $E/evaluations.service.test.ts .tmp/s6a/evaluation-contracts-test.json
node .tmp/s6a/cut-blocks.mjs $R/reports.service.ts .tmp/s6a/report-contracts.json
node .tmp/s6a/cut-blocks.mjs $R/reports.service.test.ts .tmp/s6a/report-contracts-test.json
git rm -q $R/reports.dto.ts
git grep -n "reports.dto\|saveScoresSchema\|reportInputSchema\|reportQuerySchema\|createEvaluationSchema" -- apps packages
```

Expected (dry run):

```text
cut 38 lines from const dateOnly = z
apps/api/src/modules/evaluations/evaluations.service.ts: 779 lines
apps/api/src/modules/evaluations/evaluations.service.test.ts: 86 lines
apps/api/src/modules/reports/reports.service.ts: 879 lines
apps/api/src/modules/reports/reports.service.test.ts: 822 lines
```

and the grep prints nothing.

- [ ] **Step 6: Run the tests and commit**

```bash
E=apps/api/src/modules/evaluations
R=apps/api/src/modules/reports
pnpm exec biome check --write packages/shared/src $E $R
pnpm --filter @pathways/api exec vitest run src/modules/evaluations src/modules/reports
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/(evaluations|reports)/"
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared/src $E $R
git commit -m "refactor(api): validate evaluation and report requests with the shared contracts

reports.dto.ts is removed; the services keep their fixed 400 messages.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the validation tests pass unchanged; the unused-import grep prints nothing; shared = `B_shared + 35`, api = `B_api + 80`.

---

### Task 4: Split the evaluations service

**Files:**
- Move: `apps/api/src/modules/evaluations/evaluation-metrics.ts` -> `evaluation-metrics.service.ts`, `evaluation-metrics.test.ts` -> `evaluation-metrics.service.test.ts` (commit 1, with 13 specifier rewrites)
- Create: `apps/api/src/modules/evaluations/evaluations.helpers.ts`, `evaluations.helpers.test.ts`, `evaluations.mapper.ts`, `evaluation-detail.service.ts`, `evaluation-scoring.service.ts`, `evaluation-assessments.service.ts`, `evaluation-review.service.ts`
- Modify: `apps/api/src/modules/evaluations/evaluations.service.ts` (809 lines at baseline, 337 after), `evaluation-metrics.service.ts`, `evaluation-metrics.service.test.ts`, `evaluation-criteria-template.ts`, `apps/api/src/modules/reports/report-sources-extra.ts` (one import)

**Interfaces:**
- Consumes: the evaluation contracts (Task 3); `repoint.mjs` (Task 1); `cut-blocks.mjs` (Task 2).
- Produces:
  - `evaluations.helpers.ts`: `criterionTypes`, `type CriterionType`, `noDataPrefix`, `classifyScoreCommentary(commentary: string | null, criterionType: string): { source: 'computed' | 'no_data' | 'manual'; evidence: string | null; reason: string | null; note: string | null }`, `projectIdSchema` (zod UUID), `day(value: Date): string`.
  - `evaluations.mapper.ts`: `evaluationDetailSelect`, `type EvaluationDetailRow`, `scoreDetailSelect`, `mapEvaluationDetail(row: EvaluationDetailRow, scores: ScoreDetailRow[])`.
  - `evaluation-detail.service.ts`: `requireEvaluation(tx: Tx, actor, projectId, evaluationId)`, `withScores(tx: Tx, actor, projectId, rows: EvaluationDetailRow[])`, `readDetail(tx: Tx, actor, projectId, evaluationId)`.
  - `evaluation-scoring.service.ts`: `scoreRound(metrics: EvaluationMetricsService, tx: Tx, actor, projectId, evaluationId, period: { start: Date; end: Date }): Promise<number>`.
  - `evaluation-assessments.service.ts`: `readAssessmentDetail(tx: Tx, actor, projectId, assessmentId)`, `listEnrollmentAssessments(tx: Tx, actor, projectId, query: unknown)`.
  - `evaluation-review.service.ts`: `returnEvaluation(tx: Tx, actor, projectId, evaluationId, body: ReturnEvaluationRequest)`, `signOffEvaluation(tx: Tx, actor, projectId, evaluationId, body: SignOffEvaluationRequest)`.
  - `EvaluationsService` keeps its constructor `(prisma: PrismaService, metrics: EvaluationMetricsService)` and every public method.

- [ ] **Step 1: Name the metrics service file after its class**

Create `.tmp/s6a/metrics-moves.json`:

```json
[
  ["apps/api/src/modules/evaluations/evaluation-metrics.ts", "apps/api/src/modules/evaluations/evaluation-metrics.service.ts"],
  ["apps/api/src/modules/evaluations/evaluation-metrics.test.ts", "apps/api/src/modules/evaluations/evaluation-metrics.service.test.ts"]
]
```

```bash
E=apps/api/src/modules/evaluations
git mv $E/evaluation-metrics.ts $E/evaluation-metrics.service.ts
git mv $E/evaluation-metrics.test.ts $E/evaluation-metrics.service.test.ts
node .tmp/s6a/repoint.mjs .tmp/s6a/metrics-moves.json apps/api/src apps/api/prisma apps/api/scripts
```

Expected (dry run):

```text
apps/api/src/modules/evaluations/evaluation-criteria-template.ts
apps/api/src/modules/evaluations/evaluation-metrics.service.test.ts
apps/api/src/modules/evaluations/evaluations.assessment-detail.test.ts
apps/api/src/modules/evaluations/evaluations.beneficiary-assessments.test.ts
apps/api/src/modules/evaluations/evaluations.local.test.ts
apps/api/src/modules/evaluations/evaluations.module.ts
apps/api/src/modules/evaluations/evaluations.service.test.ts
apps/api/src/modules/evaluations/evaluations.service.ts
apps/api/src/modules/evaluations/evaluations.validation.test.ts
apps/api/src/modules/evaluations/evaluations.write-path.test.ts
apps/api/src/modules/reports/report-sources-extra.ts
apps/api/prisma/defense-demo-seed.ts
apps/api/prisma/local-demo-seed.ts
13 files rewritten
```

```bash
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/evaluations src/modules/reports
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): name the evaluation metrics service file after its class

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api count unchanged.

- [ ] **Step 2: Create the line move script**

Create `.tmp/s6a/move-lines.mjs`:

```js
// Moves checked line ranges of one file into new or existing files verbatim, then applies exact replacements.
// Usage: node move-lines.mjs <plan.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const source = readFileSync(plan.source, 'utf8').split('\n')
const fail = (message) => {
  throw new Error(message)
}

// Each range is 1-based and inclusive; its first and last lines must match exactly.
const moves = plan.moves.map((move) => {
  const lines = source.slice(move.from - 1, move.to)
  if (lines[0] !== move.first) fail(`Line ${move.from} is ${JSON.stringify(lines[0])}`)
  if (lines.at(-1) !== move.last) fail(`Line ${move.to} is ${JSON.stringify(lines.at(-1))}`)
  const dedent = ' '.repeat(move.dedent ?? 0)
  // An inner move keeps the range's first and last lines in the source around its replacement.
  const body = (move.inner ? lines.slice(1, -1) : lines).map((line) => {
    if (line === '') return line
    if (!line.startsWith(dedent)) fail(`Line in ${move.from}-${move.to} has less than ${dedent.length} spaces`)
    return line.slice(dedent.length)
  })
  return { ...move, body: [...(move.before ?? []), ...body, ...(move.after ?? [])] }
})
const ordered = [...moves].sort((a, b) => a.from - b.from)
for (let i = 1; i < ordered.length; i++)
  if (ordered[i].from <= ordered[i - 1].to) fail(`Ranges ${ordered[i - 1].from} and ${ordered[i].from} overlap`)

// Targets get their header, then every range in plan order separated by one blank line.
const outputs = new Map()
for (const [file, { header = [], footer = [], append = false }] of Object.entries(plan.targets)) {
  const parts = moves.filter((move) => move.target === file).map((move) => move.body.join('\n'))
  if (!parts.length) fail(`No range targets ${file}`)
  if (!append && existsSync(file)) fail(`${file} already exists`)
  const start = append ? readFileSync(file, 'utf8').replace(/\n*$/, '\n') : header.length ? `${header.join('\n')}\n` : ''
  outputs.set(file, `${start}\n${parts.join('\n\n')}\n${footer.length ? `${footer.join('\n')}\n` : ''}`)
}

// The source loses each range, or has it replaced, and a blank line left after a removed range goes too.
let lines = [...source]
for (const move of [...ordered].reverse()) {
  const replace = move.replaceWith ?? []
  const extra = !replace.length && lines[move.to] === '' ? 1 : 0
  if (move.inner) lines.splice(move.from, move.to - move.from - 1, ...replace)
  else lines.splice(move.from - 1, move.to - move.from + 1 + extra, ...replace)
}
outputs.set(plan.source, lines.join('\n'))

for (const [file, list] of Object.entries(plan.replacements ?? {})) {
  let text = outputs.get(file) ?? fail(`${file} is not written by this plan`)
  for (const [from, to, count] of list) {
    const found = text.split(from).length - 1
    if (found !== count) fail(`${file}: expected ${count} of ${JSON.stringify(from)}, found ${found}`)
    text = text.replaceAll(from, to)
  }
  outputs.set(file, text)
}
for (const [file, text] of outputs) {
  writeFileSync(file, text)
  console.log(`${file}: ${text.split('\n').length} lines`)
}
```

- [ ] **Step 3: Create the move plans**

`.tmp/s6a/evaluation-helpers-from-metrics.json` moves the pure commentary rules out of the metrics service:

```json
{
  "source": "apps/api/src/modules/evaluations/evaluation-metrics.service.ts",
  "targets": {
    "apps/api/src/modules/evaluations/evaluations.helpers.ts": {
      "header": ["import { z } from 'zod'"]
    }
  },
  "moves": [
    {
      "from": 8,
      "to": 17,
      "first": "export const criterionTypes = [",
      "last": "export type CriterionType = (typeof criterionTypes)[number]",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.ts"
    },
    {
      "from": 22,
      "to": 22,
      "first": "const noDataPrefix = 'No data: '",
      "last": "const noDataPrefix = 'No data: '",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.ts",
      "before": ["// A criterion scored without data has commentary that starts with this marker."]
    },
    {
      "from": 48,
      "to": 68,
      "first": "const manualMarker = ' Manual score recorded: '",
      "last": "}",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.ts"
    }
  ],
  "replacements": {
    "apps/api/src/modules/evaluations/evaluation-metrics.service.ts": [
      [
        "import { IndicatorsService } from '../indicators/indicators.service'\n",
        "import { IndicatorsService } from '../indicators/indicators.service'\nimport { type CriterionType, noDataPrefix } from './evaluations.helpers'\n",
        1
      ],
      [
        "// A stored score is always a number; a criterion without data scores 0 and its commentary starts\n// with the marker below so the reason survives a refetch.\n",
        "// A stored score is always a number; a criterion without data scores 0 with a no-data commentary.\n",
        1
      ]
    ],
    "apps/api/src/modules/evaluations/evaluations.helpers.ts": [
      ["const noDataPrefix = 'No data: '", "export const noDataPrefix = 'No data: '", 1]
    ]
  }
}
```

`.tmp/s6a/evaluations-split.json` splits the service (line numbers are those of `evaluations.service.ts` after Task 3, 778 lines):

```json
{
  "source": "apps/api/src/modules/evaluations/evaluations.service.ts",
  "targets": {
    "apps/api/src/modules/evaluations/evaluations.helpers.ts": { "append": true },
    "apps/api/src/modules/evaluations/evaluations.mapper.ts": {
      "header": [
        "import type { Prisma } from '@prisma/client'",
        "import { z } from 'zod'",
        "import { classifyScoreCommentary, day } from './evaluations.helpers'"
      ]
    },
    "apps/api/src/modules/evaluations/evaluation-detail.service.ts": {
      "header": [
        "import { NotFoundException } from '@nestjs/common'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { projectIdSchema } from './evaluations.helpers'",
        "import {",
        "  type EvaluationDetailRow,",
        "  evaluationDetailSelect,",
        "  mapEvaluationDetail,",
        "  scoreDetailSelect,",
        "} from './evaluations.mapper'"
      ]
    },
    "apps/api/src/modules/evaluations/evaluation-scoring.service.ts": {
      "header": [
        "import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import type { EvaluationMetricsService } from './evaluation-metrics.service'",
        "import { day } from './evaluations.helpers'"
      ]
    },
    "apps/api/src/modules/evaluations/evaluation-assessments.service.ts": {
      "header": [
        "import { ForbiddenException, NotFoundException } from '@nestjs/common'",
        "import { enrollmentAssessmentsQuery, hasAtomicPermission } from '@pathways/shared'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { projectScope } from '../../common/authz/project-scope'",
        "import { requireScopedProject } from '../../common/authz/scoped-project'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { projectIdSchema } from './evaluations.helpers'"
      ]
    },
    "apps/api/src/modules/evaluations/evaluation-review.service.ts": {
      "header": [
        "import { ConflictException, ForbiddenException } from '@nestjs/common'",
        "import {",
        "  type ReturnEvaluationRequest,",
        "  type SignOffEvaluationRequest,",
        "  hasAtomicPermission,",
        "} from '@pathways/shared'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { requireScopedProject } from '../../common/authz/scoped-project'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { readDetail, requireEvaluation } from './evaluation-detail.service'"
      ]
    }
  },
  "moves": [
    {
      "from": 29,
      "to": 29,
      "first": "const projectIdSchema = z.string().uuid()",
      "last": "const projectIdSchema = z.string().uuid()",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.ts",
      "before": [
        "// Evaluation and assessment ids are checked with the same UUID rule as project ids."
      ]
    },
    {
      "from": 40,
      "to": 40,
      "first": "const day = (value: Date) => value.toISOString().slice(0, 10)",
      "last": "const day = (value: Date) => value.toISOString().slice(0, 10)",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.ts",
      "before": ["// The calendar date of a stored date-only value."]
    },
    {
      "from": 30,
      "to": 36,
      "first": "// Locked auth RFC: System Administrator is denied assessment/survey detail and",
      "last": "])",
      "target": "apps/api/src/modules/evaluations/evaluation-assessments.service.ts"
    },
    {
      "from": 263,
      "to": 332,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "inner": true,
      "dedent": 6,
      "target": "apps/api/src/modules/evaluations/evaluation-assessments.service.ts",
      "before": [
        "// Reads one assessment result, with its beneficiary only for a reader of beneficiary records.",
        "export async function readAssessmentDetail(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  assessmentId: string,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": ["        return readAssessmentDetail(tx, actor, projectId, assessmentId)"]
    },
    {
      "from": 341,
      "to": 397,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "inner": true,
      "dedent": 6,
      "target": "apps/api/src/modules/evaluations/evaluation-assessments.service.ts",
      "before": [
        "// Lists the assessment results of one enrollment in date order, at most 100.",
        "export async function listEnrollmentAssessments(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  query: unknown,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": ["        return listEnrollmentAssessments(tx, actor, projectId, query)"]
    },
    {
      "from": 37,
      "to": 39,
      "first": "const person = { select: { id: true, fullName: true } } as const",
      "last": "  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null",
      "target": "apps/api/src/modules/evaluations/evaluations.mapper.ts"
    },
    {
      "from": 43,
      "to": 54,
      "first": "// Allowlist for the stored criterion snapshot; numbers become strings and any other key is dropped.",
      "last": "})",
      "target": "apps/api/src/modules/evaluations/evaluations.mapper.ts"
    },
    {
      "from": 56,
      "to": 87,
      "first": "const evaluationDetailSelect = {",
      "last": "type ScoreDetailRow = Prisma.ProjectEvaluationScoreGetPayload<{ select: typeof scoreDetailSelect }>",
      "target": "apps/api/src/modules/evaluations/evaluations.mapper.ts"
    },
    {
      "from": 89,
      "to": 110,
      "first": "function mapEvaluationDetail(row: EvaluationDetailRow, scores: ScoreDetailRow[]) {",
      "last": "}",
      "target": "apps/api/src/modules/evaluations/evaluations.mapper.ts"
    },
    {
      "from": 112,
      "to": 135,
      "first": "function mapScore(score: ScoreDetailRow) {",
      "last": "}",
      "target": "apps/api/src/modules/evaluations/evaluations.mapper.ts"
    },
    {
      "from": 144,
      "to": 165,
      "first": "  private async requireEvaluation(",
      "last": "  }",
      "dedent": 2,
      "target": "apps/api/src/modules/evaluations/evaluation-detail.service.ts",
      "before": ["// Loads the workflow fields of one evaluation in the project, or answers 404."]
    },
    {
      "from": 167,
      "to": 191,
      "first": "  // Reads every given evaluation's scores in one query and groups them in memory.",
      "last": "  }",
      "dedent": 2,
      "target": "apps/api/src/modules/evaluations/evaluation-detail.service.ts"
    },
    {
      "from": 193,
      "to": 206,
      "first": "  private async readDetail(",
      "last": "  }",
      "dedent": 2,
      "target": "apps/api/src/modules/evaluations/evaluation-detail.service.ts",
      "before": ["// Reads one evaluation with its scores as the routes return it, or answers 404."]
    },
    {
      "from": 401,
      "to": 454,
      "first": "  // Computes and stores one score per published criterion from the project's own data; the",
      "last": "  }",
      "dedent": 2,
      "target": "apps/api/src/modules/evaluations/evaluation-scoring.service.ts"
    },
    {
      "from": 662,
      "to": 696,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "inner": true,
      "dedent": 6,
      "target": "apps/api/src/modules/evaluations/evaluation-review.service.ts",
      "before": [
        "// Reopens a submitted evaluation as a draft with its return reason; scores stay untouched.",
        "export async function returnEvaluation(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  evaluationId: string,",
        "  body: ReturnEvaluationRequest,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": [
        "        return returnEvaluation(tx, actor, projectId, evaluationId, parsed.data)"
      ]
    },
    {
      "from": 712,
      "to": 775,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "inner": true,
      "dedent": 6,
      "target": "apps/api/src/modules/evaluations/evaluation-review.service.ts",
      "before": [
        "// Reviews and signs off a submitted evaluation as two guarded transitions in one transaction.",
        "export async function signOffEvaluation(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  evaluationId: string,",
        "  body: SignOffEvaluationRequest,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": [
        "        return signOffEvaluation(tx, actor, projectId, evaluationId, parsed.data)"
      ]
    }
  ],
  "replacements": {
    "apps/api/src/modules/evaluations/evaluations.service.ts": [
      [
        "import {\n  BadRequestException,\n  ConflictException,\n  ForbiddenException,\n  Inject,\n  Injectable,\n  NotFoundException,\n} from '@nestjs/common'\nimport {\n  createEvaluationRequest,\n  enrollmentAssessmentsQuery,\n  hasAtomicPermission,\n",
        "import {\n  BadRequestException,\n  ConflictException,\n  Inject,\n  Injectable,\n} from '@nestjs/common'\nimport {\n  createEvaluationRequest,\n  hasAtomicPermission,\n",
        1
      ],
      ["import type { Prisma } from '@prisma/client'\nimport { z } from 'zod'\n", "", 1],
      ["import { projectScope } from '../../common/authz/project-scope'\n", "", 1],
      [
        "import { provisionCriteria } from './evaluation-criteria-template'\nimport { EvaluationMetricsService, classifyScoreCommentary } from './evaluation-metrics.service'\n",
        "import {\n  listEnrollmentAssessments,\n  readAssessmentDetail,\n} from './evaluation-assessments.service'\nimport { provisionCriteria } from './evaluation-criteria-template'\nimport { readDetail, requireEvaluation, withScores } from './evaluation-detail.service'\nimport { EvaluationMetricsService } from './evaluation-metrics.service'\nimport { returnEvaluation, signOffEvaluation } from './evaluation-review.service'\nimport { scoreRound } from './evaluation-scoring.service'\nimport { day } from './evaluations.helpers'\nimport { evaluationDetailSelect } from './evaluations.mapper'\n",
        1
      ],
      ["this.requireEvaluation(tx, ", "requireEvaluation(tx, ", 2],
      ["this.readDetail(tx, ", "readDetail(tx, ", 4],
      ["this.withScores(tx, ", "withScores(tx, ", 1],
      ["this.scoreRound(tx, ", "scoreRound(this.metrics, tx, ", 3],
      ["const maxEvaluations = 20\n@Injectable()", "const maxEvaluations = 20\n\n@Injectable()", 1]
    ],
    "apps/api/src/modules/evaluations/evaluations.helpers.ts": [
      [
        "const projectIdSchema = z.string().uuid()",
        "export const projectIdSchema = z.string().uuid()",
        1
      ],
      ["const day = (value: Date) =>", "export const day = (value: Date) =>", 1]
    ],
    "apps/api/src/modules/evaluations/evaluations.mapper.ts": [
      ["const evaluationDetailSelect = {", "export const evaluationDetailSelect = {", 1],
      ["type EvaluationDetailRow = ", "export type EvaluationDetailRow = ", 1],
      ["const scoreDetailSelect = {", "export const scoreDetailSelect = {", 1],
      ["function mapEvaluationDetail(", "export function mapEvaluationDetail(", 1]
    ],
    "apps/api/src/modules/evaluations/evaluation-detail.service.ts": [
      ["private async requireEvaluation(", "export async function requireEvaluation(", 1],
      ["private async withScores(", "export async function withScores(", 1],
      ["private async readDetail(", "export async function readDetail(", 1],
      ["  tx: Prisma.TransactionClient,", "  tx: Tx,", 3],
      ["this.withScores(tx, ", "withScores(tx, ", 1]
    ],
    "apps/api/src/modules/evaluations/evaluation-scoring.service.ts": [
      [
        "private async scoreRound(\n  tx: Prisma.TransactionClient,",
        "export async function scoreRound(\n  metrics: EvaluationMetricsService,\n  tx: Tx,",
        1
      ],
      ["this.metrics.computeMany(", "metrics.computeMany(", 1]
    ],
    "apps/api/src/modules/evaluations/evaluation-review.service.ts": [
      ["parsed.data.", "body.", 6],
      ["this.requireEvaluation(tx, ", "requireEvaluation(tx, ", 2],
      ["this.readDetail(tx, ", "readDetail(tx, ", 2]
    ]
  }
}
```

`.tmp/s6a/evaluation-helpers-test.json` moves the `classifyScoreCommentary` tests beside their source:

```json
{
  "source": "apps/api/src/modules/evaluations/evaluation-metrics.service.test.ts",
  "targets": {
    "apps/api/src/modules/evaluations/evaluations.helpers.test.ts": {
      "header": [
        "import { describe, expect, it } from 'vitest'",
        "import { classifyScoreCommentary } from './evaluations.helpers'"
      ]
    }
  },
  "moves": [
    {
      "from": 157,
      "to": 173,
      "first": "describe('classifyScoreCommentary', () => {",
      "last": "})",
      "target": "apps/api/src/modules/evaluations/evaluations.helpers.test.ts"
    }
  ],
  "replacements": {
    "apps/api/src/modules/evaluations/evaluation-metrics.service.test.ts": [
      [
        "import {\n  type CriterionType,\n  EvaluationMetricsService,\n  classifyScoreCommentary,\n} from './evaluation-metrics.service'\n",
        "import { EvaluationMetricsService } from './evaluation-metrics.service'\nimport type { CriterionType } from './evaluations.helpers'\n",
        1
      ]
    ]
  }
}
```

`.tmp/s6a/criterion-type-import.json`:

```json
{
  "replacements": [
    [
      "import type { CriterionType } from './evaluation-metrics.service'",
      "import type { CriterionType } from './evaluations.helpers'",
      1
    ]
  ]
}
```

`.tmp/s6a/commentary-import.json`:

```json
{
  "replacements": [
    [
      "import { classifyScoreCommentary } from '../evaluations/evaluation-metrics.service'",
      "import { classifyScoreCommentary } from '../evaluations/evaluations.helpers'",
      1
    ]
  ]
}
```

- [ ] **Step 4: Run the moves**

```bash
E=apps/api/src/modules/evaluations
node .tmp/s6a/move-lines.mjs .tmp/s6a/evaluation-helpers-from-metrics.json
node .tmp/s6a/move-lines.mjs .tmp/s6a/evaluations-split.json
node .tmp/s6a/move-lines.mjs .tmp/s6a/evaluation-helpers-test.json
node .tmp/s6a/cut-blocks.mjs $E/evaluation-criteria-template.ts .tmp/s6a/criterion-type-import.json
node .tmp/s6a/cut-blocks.mjs apps/api/src/modules/reports/report-sources-extra.ts .tmp/s6a/commentary-import.json
```

Expected (dry run):

```text
apps/api/src/modules/evaluations/evaluations.helpers.ts: 38 lines
apps/api/src/modules/evaluations/evaluation-metrics.service.ts: 221 lines
apps/api/src/modules/evaluations/evaluations.helpers.ts: 44 lines
apps/api/src/modules/evaluations/evaluations.mapper.ts: 102 lines
apps/api/src/modules/evaluations/evaluation-detail.service.ts: 77 lines
apps/api/src/modules/evaluations/evaluation-scoring.service.ts: 62 lines
apps/api/src/modules/evaluations/evaluation-assessments.service.ts: 157 lines
apps/api/src/modules/evaluations/evaluation-review.service.ts: 127 lines
apps/api/src/modules/evaluations/evaluations.service.ts: 343 lines
apps/api/src/modules/evaluations/evaluations.helpers.test.ts: 21 lines
apps/api/src/modules/evaluations/evaluation-metrics.service.test.ts: 153 lines
apps/api/src/modules/evaluations/evaluation-criteria-template.ts: 148 lines
apps/api/src/modules/reports/report-sources-extra.ts: 143 lines
```

Any error (a range whose first or last line differs, or a replacement count that differs) stops the step: the file is not the one these ranges were taken from.

- [ ] **Step 5: Run the tests and commit**

```bash
E=apps/api/src/modules/evaluations
git add -N $E
pnpm exec biome check --write $E apps/api/src/modules/reports
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/(evaluations|reports)/"
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/evaluations src/modules/reports
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
wc -l $E/*.ts | grep -v test
git checkout -- apps/web/next-env.d.ts
git add -A $E apps/api/src/modules/reports/report-sources-extra.ts
git commit -m "refactor(api): split the evaluations service by responsibility

Mapper, helpers, detail reads, scoring, assessments and review transitions move verbatim into
function modules that take the caller's transaction.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the unused-import grep prints nothing; the evaluations suite passes (8 files, 1 skipped local file); api count unchanged from Task 3 (the 5 `classifyScoreCommentary` tests moved, not added); `evaluations.service.ts` is 337 lines and every other evaluations source file is under 230.

---

### Task 5: Split the reports service and adopt the scope kernel

**Files:**
- Test: `apps/api/src/modules/reports/reports.scope.test.ts` (new, permanent)
- Move: `apps/api/src/modules/reports/report-sources-extra.ts` -> `report-monitoring-evaluation-source.ts` (2 specifier rewrites)
- Create: `apps/api/src/modules/reports/reports.helpers.ts`, `report-source.service.ts`, `report-generation.service.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (873 lines at baseline, 455 after), `report-monitoring-evaluation-source.ts`, `report-project-status-source.ts`

**Interfaces:**
- Consumes: the report contracts (Task 3), `classifyScoreCommentary` from `../evaluations/evaluations.helpers` (Task 4), `move-lines.mjs` (Task 4).
- Produces:
  - `reports.helpers.ts`: `kindPermission` (kind to permission map), `uuid` (zod UUID), `isExtraReportKind(kind: string): kind is 'MONITORING_REPORT' | 'EVALUATION_REPORT'`, `extraKindRequires`, `assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode): void`, `readableReportKinds(actor: ApplicationIdentity): ReportKindCode[]`.
  - `report-project-status-source.ts`: `type ReportSourceDeps = { overview: Pick<ProjectOverviewMetricsService, 'readInTransaction'>; dashboards: Pick<DashboardsService, 'monitoringInTransaction'>; rules: Pick<RulesHumanService, 'listAlertsInTransaction'> }` (was the local `Deps`).
  - `report-source.service.ts`: `type ReportSource` (was the local `Preview`), `loadReportSource(deps: ReportSourceDeps, tx: Tx, actor: ApplicationIdentity, requestedProjectId: string, kind: ReportKindCode, requestedFormId?: string, requestedEvaluationId?: string): Promise<ReportSource>`.
  - `report-generation.service.ts`: `type Artifact`, `artifactFields`, `reserveReport(deps, tx, actor, projectId, body: GenerateReportRequest, requestHash: string)`, `finalizeReport(deps, tx, actor, projectId, body, requestHash, prepare, key: string, sha: string, bytes: Buffer)`.
  - `ReportsService` keeps its seven-argument constructor and every public method; it gains the private `sourceDeps(): ReportSourceDeps`.

- [ ] **Step 1: Pin the project scope of the report read routes**

Create `apps/api/src/modules/reports/reports.scope.test.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import type { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsService } from './reports.service'

const state = vi.hoisted(() => ({ tx: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    identity: unknown,
    _permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => work(state.tx, identity),
}))

const projectId = 'abcdefab-0000-4000-8000-000000000001'
const upper = projectId.toUpperCase()
const actor: ApplicationIdentity = {
  id: projectId,
  aal: 'aal2',
  userId: projectId,
  organizationId: '40000000-0000-4000-8000-000000000004',
  fullName: 'Fictional report reader',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'reports.read',
    'reports.project.read',
    'assessments.read',
    'forms.read',
    'monitoring.read',
  ],
  assignedProjectIds: [projectId],
}
const tx = {
  project: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  report: { findMany: vi.fn() },
  projectEvaluation: { findMany: vi.fn() },
}
const service = new ReportsService(
  {} as PrismaService,
  {} as StorageService,
  {} as DashboardsService,
  {} as ReportPdfRenderer,
  {} as ProjectOverviewMetricsService,
  {} as RulesHumanService,
  {} as PrivateStorageFactories,
)
const reads = {
  surveyForms: (id: string) => service.surveyForms(actor, id),
  evaluationRounds: (id: string) => service.evaluationRounds(actor, id),
  list: (id: string) => service.list(actor, id),
}

describe('report read routes project scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([])
    tx.report.findMany.mockResolvedValue([])
    tx.projectEvaluation.findMany.mockResolvedValue([])
  })

  it.each(Object.entries(reads))(
    '%s answers 404 for a malformed id without a lookup',
    async (_name, read) => {
      await expect(read('not-a-uuid')).rejects.toThrow(
        new NotFoundException('Project unavailable.'),
      )
      expect(tx.project.findFirst).not.toHaveBeenCalled()
    },
  )

  it.each(Object.entries(reads))(
    '%s answers 404 for a project outside scope',
    async (_name, read) => {
      tx.project.findFirst.mockResolvedValue(null)
      await expect(read(projectId)).rejects.toThrow(new NotFoundException('Project unavailable.'))
    },
  )

  it('reads with the project id as the caller sent it', async () => {
    await reads.surveyForms(upper)
    await reads.evaluationRounds(upper)
    await reads.list(upper)
    expect(tx.$queryRaw.mock.calls[0]).toContain(upper)
    expect(tx.projectEvaluation.findMany.mock.calls[0]?.[0].where.projectId).toBe(upper)
    expect(tx.report.findMany.mock.calls[0]?.[0].where.projectId).toBe(upper)
  })
})
```

```bash
pnpm exec biome check --write apps/api/src/modules/reports/reports.scope.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/reports/reports.scope.test.ts
pnpm lint
git add apps/api/src/modules/reports/reports.scope.test.ts
git commit -m "test(api): pin the project scope of the report read routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS, 7 tests, against the inline lookups; api = `B_api + 87`.

- [ ] **Step 2: Name the monitoring and evaluation source file after its content**

Create `.tmp/s6a/report-source-moves.json`:

```json
[["apps/api/src/modules/reports/report-sources-extra.ts", "apps/api/src/modules/reports/report-monitoring-evaluation-source.ts"]]
```

```bash
R=apps/api/src/modules/reports
git mv $R/report-sources-extra.ts $R/report-monitoring-evaluation-source.ts
node .tmp/s6a/repoint.mjs .tmp/s6a/report-source-moves.json apps/api/src apps/api/prisma apps/api/scripts
pnpm exec biome check --write $R
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A $R
git commit -m "refactor(api): name the report monitoring and evaluation source after its content

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `apps/api/src/modules/reports/report-project-status-source.ts`, `apps/api/src/modules/reports/reports.service.ts`, `2 files rewritten`; Biome reorders the import in `reports.service.ts` without changing its line count (878 lines).

- [ ] **Step 3: Create the move plans**

`.tmp/s6a/reports-split.json` (line numbers are those of `reports.service.ts` after Step 2):

```json
{
  "source": "apps/api/src/modules/reports/reports.service.ts",
  "targets": {
    "apps/api/src/modules/reports/reports.helpers.ts": {
      "header": [
        "import { ForbiddenException } from '@nestjs/common'",
        "import { type ReportKindCode, hasAtomicPermission } from '@pathways/shared'",
        "import { z } from 'zod'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'"
      ]
    },
    "apps/api/src/modules/reports/report-source.service.ts": {
      "header": [
        "import {",
        "  BadRequestException,",
        "  ForbiddenException,",
        "  NotFoundException,",
        "  ServiceUnavailableException,",
        "} from '@nestjs/common'",
        "import { readApiEnv } from '@pathways/config'",
        "import { type ReportKindCode, hasAtomicPermission, metricCellSchema } from '@pathways/shared'",
        "import { z } from 'zod'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { projectScope } from '../../common/authz/project-scope'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import {",
        "  evaluationReportTable,",
        "  monitoringReportPeriod,",
        "  monitoringReportTable,",
        "} from './report-monitoring-evaluation-source'",
        "import { type ProjectSections, flattenSections } from './report-project-status'",
        "import { type ReportSourceDeps, projectStatusSource } from './report-project-status-source'",
        "import { assertReportPermission, uuid } from './reports.helpers'"
      ]
    },
    "apps/api/src/modules/reports/report-generation.service.ts": {
      "header": [
        "import { randomUUID } from 'node:crypto'",
        "import { ConflictException } from '@nestjs/common'",
        "import type { GenerateReportRequest, ReportKindCode } from '@pathways/shared'",
        "import { Prisma } from '@prisma/client'",
        "import { z } from 'zod'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import type { ReportFormat } from './report-artifact'",
        "import { sourceContent, sourceFingerprint } from './report-fingerprint'",
        "import type { ReportSourceDeps } from './report-project-status-source'",
        "import { loadReportSource } from './report-source.service'",
        "import { uuid } from './reports.helpers'"
      ]
    }
  },
  "moves": [
    {
      "from": 55,
      "to": 62,
      "first": "const kindPermission = {",
      "last": "} as const",
      "target": "apps/api/src/modules/reports/reports.helpers.ts"
    },
    {
      "from": 63,
      "to": 63,
      "first": "const uuid = z.string().uuid()",
      "last": "const uuid = z.string().uuid()",
      "target": "apps/api/src/modules/reports/reports.helpers.ts",
      "before": ["// Report, project, form and evaluation ids are checked with the zod UUID rule."]
    },
    {
      "from": 110,
      "to": 120,
      "first": "  private permissions(actor: ApplicationIdentity, kind: ReportKindCode) {",
      "last": "  }",
      "target": "apps/api/src/modules/reports/reports.helpers.ts",
      "dedent": 2,
      "before": [
        "// Refuses a report kind the actor may not read, including the extra grants some kinds need."
      ]
    },
    {
      "from": 501,
      "to": 515,
      "first": "      const allowed = (Object.keys(kindPermission) as ReportKindCode[]).filter(",
      "last": "      )",
      "target": "apps/api/src/modules/reports/reports.helpers.ts",
      "dedent": 4,
      "before": [
        "// Report kinds the actor may list, with the extra grants the beneficiary summary needs.",
        "export function readableReportKinds(actor: ApplicationIdentity) {"
      ],
      "after": ["  return allowed", "}"],
      "replaceWith": ["      const allowed = readableReportKinds(actor)"]
    },
    {
      "from": 65,
      "to": 68,
      "first": "const metricText = (input: unknown) => {",
      "last": "}",
      "target": "apps/api/src/modules/reports/report-source.service.ts"
    },
    {
      "from": 69,
      "to": 79,
      "first": "type Preview = {",
      "last": "}",
      "target": "apps/api/src/modules/reports/report-source.service.ts"
    },
    {
      "from": 121,
      "to": 382,
      "first": "  private async source(",
      "last": "  }",
      "target": "apps/api/src/modules/reports/report-source.service.ts",
      "dedent": 2,
      "before": [
        "// Builds one report kind's columns and rows for a project inside the caller's transaction."
      ]
    },
    {
      "from": 80,
      "to": 97,
      "first": "type Artifact = {",
      "last": "const artifactFields = Prisma.sql`id::text,project_id::text AS \"projectId\",form_id::text AS \"formId\",name,type::text,format::text,status::text,request_hash::text AS hash,source_fingerprint::text AS \"sourceFingerprint\",evaluation_id::text AS \"evaluationId\",artifact_byte_size AS bytes,bucket,object_key AS key,sha256::text AS sha,updated_at AS \"updatedAt\"`",
      "target": "apps/api/src/modules/reports/report-generation.service.ts"
    },
    {
      "from": 597,
      "to": 648,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "target": "apps/api/src/modules/reports/report-generation.service.ts",
      "inner": true,
      "dedent": 6,
      "before": [
        "// Reserves the report row for this request, or reuses the caller's earlier one.",
        "export async function reserveReport(",
        "  deps: ReportSourceDeps,",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  body: GenerateReportRequest,",
        "  requestHash: string,",
        ") {"
      ],
      "after": [
        "}",
        "",
        "// The reservation that finalization checks again.",
        "type ReservedReport = Awaited<ReturnType<typeof reserveReport>>"
      ],
      "replaceWith": [
        "        return reserveReport(this.sourceDeps(), tx, actor, projectId, body, requestHash)"
      ]
    },
    {
      "from": 723,
      "to": 756,
      "first": "        async (tx, actor) => {",
      "last": "        },",
      "target": "apps/api/src/modules/reports/report-generation.service.ts",
      "inner": true,
      "dedent": 8,
      "before": [
        "// Marks the stored artifact generated once its source reads the same again.",
        "export async function finalizeReport(",
        "  deps: ReportSourceDeps,",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  projectId: string,",
        "  body: GenerateReportRequest,",
        "  requestHash: string,",
        "  prepare: ReservedReport,",
        "  key: string,",
        "  sha: string,",
        "  bytes: Buffer,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": [
        "          return finalizeReport(",
        "            this.sourceDeps(),",
        "            tx,",
        "            actor,",
        "            projectId,",
        "            body,",
        "            requestHash,",
        "            prepare,",
        "            key,",
        "            sha,",
        "            bytes,",
        "          )"
      ]
    }
  ],
  "replacements": {
    "apps/api/src/modules/reports/reports.service.ts": [
      [
        "import { createHash, randomUUID } from 'node:crypto'\nimport { performance } from 'node:perf_hooks'\nimport {\n  BadRequestException,\n  ConflictException,\n  ForbiddenException,\n  Inject,\n  Injectable,\n  Logger,\n  NotFoundException,\n  ServiceUnavailableException,\n  UnprocessableEntityException,\n} from '@nestjs/common'\nimport { readApiEnv } from '@pathways/config'\nimport {\n  type ReportKindCode,\n  generateReportRequest,\n  hasAtomicPermission,\n  metricCellSchema,\n  reportPreviewQuery,\n} from '@pathways/shared'\nimport { Prisma } from '@prisma/client'\nimport { z } from 'zod'\nimport { writeAuditLog } from '../../common/audit/write-audit-log'\nimport type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport { withAuthorizedOperation } from '../../common/authz/authorized-operation'\nimport { projectScope } from '../../common/authz/project-scope'\nimport { PrismaService } from '../../prisma/prisma.service'\nimport { DashboardsService } from '../dashboards/dashboards.service'\nimport { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'\nimport { RulesHumanService } from '../rules/rules-human.service'\nimport {\n  PRIVATE_STORAGE_FACTORIES,\n  type PrivateStorageFactories,\n} from '../storage/private-storage-factories'\nimport { StorageService } from '../storage/storage.service'\nimport {\n  ReportArtifactInputError,\n  type ReportFormat,\n  createReportArtifact,\n  reportMime,\n} from './report-artifact'\nimport { sourceContent, sourceFingerprint } from './report-fingerprint'\nimport {\n  evaluationReportTable,\n  extraKindRequires,\n  isExtraReportKind,\n  monitoringReportPeriod,\n  monitoringReportTable,\n} from './report-monitoring-evaluation-source'\nimport { ReportPdfError, ReportPdfRenderer } from './report-pdf.renderer'\nimport { type ProjectSections, flattenSections } from './report-project-status'\nimport { projectStatusSource } from './report-project-status-source'\n",
        "import { createHash, randomUUID } from 'node:crypto'\nimport { performance } from 'node:perf_hooks'\nimport {\n  BadRequestException,\n  ConflictException,\n  ForbiddenException,\n  Inject,\n  Injectable,\n  Logger,\n  NotFoundException,\n  ServiceUnavailableException,\n  UnprocessableEntityException,\n} from '@nestjs/common'\nimport { readApiEnv } from '@pathways/config'\nimport { generateReportRequest, hasAtomicPermission, reportPreviewQuery } from '@pathways/shared'\nimport { Prisma } from '@prisma/client'\nimport { writeAuditLog } from '../../common/audit/write-audit-log'\nimport type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport { withAuthorizedOperation } from '../../common/authz/authorized-operation'\nimport { projectScope } from '../../common/authz/project-scope'\nimport type { Tx } from '../../common/prisma/transaction'\nimport { PrismaService } from '../../prisma/prisma.service'\nimport { DashboardsService } from '../dashboards/dashboards.service'\nimport { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'\nimport { RulesHumanService } from '../rules/rules-human.service'\nimport {\n  PRIVATE_STORAGE_FACTORIES,\n  type PrivateStorageFactories,\n} from '../storage/private-storage-factories'\nimport { StorageService } from '../storage/storage.service'\nimport { ReportArtifactInputError, createReportArtifact, reportMime } from './report-artifact'\nimport { sourceFingerprint } from './report-fingerprint'\nimport { type Artifact, artifactFields, finalizeReport, reserveReport } from './report-generation.service'\nimport { ReportPdfError, ReportPdfRenderer } from './report-pdf.renderer'\nimport type { ReportSourceDeps } from './report-project-status-source'\nimport { type ReportSource, loadReportSource } from './report-source.service'\nimport { assertReportPermission, kindPermission, readableReportKinds, uuid } from './reports.helpers'\n",
        1
      ],
      [
        "  ) {}\n  // A saved report is re-checked",
        "  ) {}\n  // The report source reads through these services in the caller's transaction.\n  private sourceDeps(): ReportSourceDeps {\n    return { overview: this.overview, dashboards: this.dashboards, rules: this.rules }\n  }\n  // A saved report is re-checked",
        1
      ],
      ["    tx: Prisma.TransactionClient,", "    tx: Tx,", 1],
      ["this.source(", "loadReportSource(this.sourceDeps(), ", 2],
      ["this.permissions(actor, ", "assertReportPermission(actor, ", 4],
      ["source: Preview)", "source: ReportSource)", 1]
    ],
    "apps/api/src/modules/reports/reports.helpers.ts": [
      ["const kindPermission = {", "export const kindPermission = {", 1],
      ["const uuid = z.string().uuid()", "export const uuid = z.string().uuid()", 1],
      [
        "private permissions(actor: ApplicationIdentity, kind: ReportKindCode) {",
        "export function assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode) {",
        1
      ]
    ],
    "apps/api/src/modules/reports/report-source.service.ts": [
      ["type Preview = {", "export type ReportSource = {", 1],
      [
        "private async source(\n  tx: Prisma.TransactionClient,",
        "export async function loadReportSource(\n  deps: ReportSourceDeps,\n  tx: Tx,",
        1
      ],
      ["): Promise<Preview> {", "): Promise<ReportSource> {", 1],
      ["const result: Preview = {", "const result: ReportSource = {", 1],
      ["this.permissions(actor, kind)", "assertReportPermission(actor, kind)", 1],
      ["{ overview: this.overview, dashboards: this.dashboards, rules: this.rules },", "deps,", 1],
      ["this.dashboards.monitoringInTransaction(", "deps.dashboards.monitoringInTransaction(", 1]
    ],
    "apps/api/src/modules/reports/report-generation.service.ts": [
      ["type Artifact = {", "export type Artifact = {", 1],
      ["const artifactFields = Prisma.sql", "export const artifactFields = Prisma.sql", 1],
      ["this.source(", "loadReportSource(deps, ", 2]
    ]
  }
}
```

`.tmp/s6a/report-kind-policy.json`:

```json
{
  "source": "apps/api/src/modules/reports/report-monitoring-evaluation-source.ts",
  "targets": { "apps/api/src/modules/reports/reports.helpers.ts": { "append": true } },
  "moves": [
    {
      "from": 8,
      "to": 15,
      "first": "type ExtraReportKind = 'MONITORING_REPORT' | 'EVALUATION_REPORT'",
      "last": "} as const",
      "target": "apps/api/src/modules/reports/reports.helpers.ts"
    }
  ],
  "replacements": {
    "apps/api/src/modules/reports/report-monitoring-evaluation-source.ts": [
      ["import type { Prisma } from '@prisma/client'\n", "", 1],
      [
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
        1
      ],
      ["  tx: Prisma.TransactionClient,", "  tx: Tx,", 1]
    ]
  }
}
```

`.tmp/s6a/report-source-deps.json`:

```json
{
  "replacements": [
    [
      "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
      "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
      1
    ],
    ["type Deps = {", "export type ReportSourceDeps = {", 1],
    ["  deps: Deps,", "  deps: ReportSourceDeps,", 1],
    ["tx: Prisma.TransactionClient", "tx: Tx", 2]
  ]
}
```

- [ ] **Step 4: Run the moves, test and commit**

```bash
R=apps/api/src/modules/reports
node .tmp/s6a/move-lines.mjs .tmp/s6a/reports-split.json
node .tmp/s6a/move-lines.mjs .tmp/s6a/report-kind-policy.json
node .tmp/s6a/cut-blocks.mjs $R/report-project-status-source.ts .tmp/s6a/report-source-deps.json
```

Expected (dry run):

```text
apps/api/src/modules/reports/reports.helpers.ts: 50 lines
apps/api/src/modules/reports/report-source.service.ts: 303 lines
apps/api/src/modules/reports/report-generation.service.ts: 144 lines
apps/api/src/modules/reports/reports.service.ts: 469 lines
apps/api/src/modules/reports/reports.helpers.ts: 59 lines
apps/api/src/modules/reports/report-monitoring-evaluation-source.ts: 134 lines
apps/api/src/modules/reports/report-project-status-source.ts: 249 lines
```

```bash
R=apps/api/src/modules/reports
git add -N $R
pnpm exec biome check --write $R
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/reports/"
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/reports src/modules/dashboards src/modules/metadata
git checkout -- apps/web/next-env.d.ts
git add -A $R
git commit -m "refactor(api): split report sources, generation steps and kind policy out of ReportsService

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the unused-import grep prints nothing; all pass; api count unchanged from Step 1.

- [ ] **Step 5: Use requireScopedProject in the report read routes**

Create `.tmp/s6a/report-scope.json`:

```json
{
  "replacements": [
    [
      "import { projectScope } from '../../common/authz/project-scope'\n",
      "import { projectScope } from '../../common/authz/project-scope'\nimport { requireScopedProject } from '../../common/authz/scoped-project'\n",
      1
    ],
    [
      "      if (\n        !uuid.safeParse(projectId).success ||\n        !(await tx.project.findFirst({\n          where: { AND: [projectScope(actor), { id: projectId }] },\n          select: { id: true },\n        }))\n      )\n        throw new NotFoundException('Project unavailable.')",
      "      await requireScopedProject(tx, actor, projectId)",
      3
    ]
  ]
}
```

```bash
R=apps/api/src/modules/reports
node .tmp/s6a/cut-blocks.mjs $R/reports.service.ts .tmp/s6a/report-scope.json
pnpm exec biome check --write $R
pnpm --filter @pathways/api exec vitest run src/modules/reports
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/finance apps/api/src/modules/evaluations apps/api/src/modules/reports apps/api/src/modules/print-pdf | grep -v "\.test\.ts:"
git checkout -- apps/web/next-env.d.ts
git add $R/reports.service.ts
git commit -m "refactor(api): use requireScopedProject in the report read routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `apps/api/src/modules/reports/reports.service.ts: 456 lines`; `reports.scope.test.ts` still passes 7 of 7 (ruling 9); the `Prisma.TransactionClient` grep prints nothing; api = `B_api + 87`.

---

### Task 6: Split the finance receipt reads and checks

**Files:**
- Create: `apps/api/src/modules/finance/finance.helpers.ts`, `apps/api/src/modules/finance/expense-receipts.service.ts`
- Modify: `apps/api/src/modules/finance/finance.service.ts` (631 lines at baseline, 439 after)

**Interfaces:**
- Consumes: `move-lines.mjs` (Task 4).
- Produces:
  - `finance.helpers.ts`: `uuid` (zod UUID), `personName` (Prisma select of `fullName`), `displayName(person: { fullName: string } | null): string | null`.
  - `expense-receipts.service.ts`: `admitReceiptUpload(tx: Tx, actor, canonicalProjectId: string, canonicalId: string, expectedUpdatedAt: string): Promise<{ organizationId: string; userId: string }>`, `readOfficialReceipt(tx: Tx, actor, canonicalProjectId, canonicalId)` (the receipt snapshot, audited), `admitReceiptRead(tx: Tx, actor, canonicalProjectId, canonicalId)`.
  - `FinanceService` keeps its constructor `(prisma, storage, receipts, storageFactories)` and every public method.

- [ ] **Step 1: Create the move plan**

`.tmp/s6a/finance-split.json` (line numbers are those of `finance.service.ts` after Task 2, 593 lines):

```json
{
  "source": "apps/api/src/modules/finance/finance.service.ts",
  "targets": {
    "apps/api/src/modules/finance/finance.helpers.ts": { "header": ["import { z } from 'zod'"] },
    "apps/api/src/modules/finance/expense-receipts.service.ts": {
      "header": [
        "import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'",
        "import { hasAtomicPermission } from '@pathways/shared'",
        "import { z } from 'zod'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { requireScopedProject } from '../../common/authz/scoped-project'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { displayName, personName, uuid } from './finance.helpers'"
      ]
    }
  },
  "moves": [
    {
      "from": 35,
      "to": 35,
      "first": "const uuid = z.string().uuid()",
      "last": "const uuid = z.string().uuid()",
      "target": "apps/api/src/modules/finance/finance.helpers.ts",
      "before": ["// Expense and budget ids are checked with the zod UUID rule."]
    },
    {
      "from": 36,
      "to": 39,
      "first": "// Reviewer identity for a read: the display name only, never the rest of the user record.",
      "last": "  person ? person.fullName.slice(0, 200) : null",
      "target": "apps/api/src/modules/finance/finance.helpers.ts"
    },
    {
      "from": 264,
      "to": 287,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "target": "apps/api/src/modules/finance/expense-receipts.service.ts",
      "inner": true,
      "dedent": 6,
      "before": [
        "// Confirms the expense is still the pending, receipt-free revision the uploader loaded.",
        "export async function admitReceiptUpload(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  canonicalProjectId: string,",
        "  canonicalId: string,",
        "  expectedUpdatedAt: string,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": [
        "        return admitReceiptUpload(",
        "          tx,",
        "          actor,",
        "          canonicalProjectId,",
        "          canonicalId,",
        "          parsed.data.expectedUpdatedAt,",
        "        )"
      ]
    },
    {
      "from": 362,
      "to": 459,
      "first": "      async (tx, actor) => {",
      "last": "      },",
      "target": "apps/api/src/modules/finance/expense-receipts.service.ts",
      "inner": true,
      "dedent": 6,
      "before": [
        "// Reads the allowlisted disbursement record fields and audits that the record was generated.",
        "export async function readOfficialReceipt(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  canonicalProjectId: string,",
        "  canonicalId: string,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": [
        "        return readOfficialReceipt(tx, actor, canonicalProjectId, canonicalId)"
      ]
    },
    {
      "from": 481,
      "to": 527,
      "first": "      withAuthorizedOperation(this.prisma, identity, 'expenses.read', async (tx, actor) => {",
      "last": "      })",
      "target": "apps/api/src/modules/finance/expense-receipts.service.ts",
      "inner": true,
      "dedent": 8,
      "before": [
        "// Admits a receipt download: current evidence grant, scoped project and a private, ready proof.",
        "export async function admitReceiptRead(",
        "  tx: Tx,",
        "  actor: ApplicationIdentity,",
        "  canonicalProjectId: string,",
        "  canonicalId: string,",
        ") {"
      ],
      "after": ["}"],
      "replaceWith": ["        return admitReceiptRead(tx, actor, canonicalProjectId, canonicalId)"]
    }
  ],
  "replacements": {
    "apps/api/src/modules/finance/finance.service.ts": [
      ["import { z } from 'zod'\n", "", 1],
      [
        "import { ReceiptPdfError, ReceiptPdfRenderer } from './receipt-pdf.renderer'\n",
        "import {\n  admitReceiptRead,\n  admitReceiptUpload,\n  readOfficialReceipt,\n} from './expense-receipts.service'\nimport { displayName, personName, uuid } from './finance.helpers'\nimport { ReceiptPdfError, ReceiptPdfRenderer } from './receipt-pdf.renderer'\n",
        1
      ]
    ],
    "apps/api/src/modules/finance/finance.helpers.ts": [
      ["const uuid = z.string().uuid()", "export const uuid = z.string().uuid()", 1],
      ["const personName = {", "export const personName = {", 1],
      ["const displayName = (", "export const displayName = (", 1]
    ],
    "apps/api/src/modules/finance/expense-receipts.service.ts": [
      ["Date.parse(parsed.data.expectedUpdatedAt)", "Date.parse(expectedUpdatedAt)", 1]
    ]
  }
}
```

- [ ] **Step 2: Run the moves, test and commit**

```bash
D=apps/api/src/modules/finance
node .tmp/s6a/move-lines.mjs .tmp/s6a/finance-split.json
```

Expected (dry run):

```text
apps/api/src/modules/finance/finance.helpers.ts: 10 lines
apps/api/src/modules/finance/expense-receipts.service.ts: 200 lines
apps/api/src/modules/finance/finance.service.ts: 440 lines
```

```bash
D=apps/api/src/modules/finance
git add -N $D
pnpm exec biome check --write $D
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep -E "modules/finance/"
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/finance
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A $D
git commit -m "refactor(api): move the finance receipt admission and record reads into expense-receipts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the unused-import grep prints nothing; the finance suite passes (4 files, 71 tests); api = `B_api + 87`.

---

### Task 7: Records

**Files:**
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-08, MOD-11, MOD-17 disposition cells)
- Modify: `docs/qad-pathways.md` (QAD-T119 evidence path), `docs/deferred-features.md` (two rows)
- Modify: `docs/index.md` (CR row status), `docs/activity-log.md`
- Modify: `scripts/sad/check.ts` (organization isolation globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:36`

- [ ] **Step 1: Route api helpers to the organization isolation checker (ruling 11)**

In `scripts/sad/check.test.ts`, directly before the test `routes web auth, rbac and middleware changes to the organization isolation checker`, add:

```ts
  it('routes api domain helpers to the organization isolation checker', () => {
    const files = [
      'apps/api/src/modules/finance/finance.helpers.ts',
      'apps/api/src/modules/reports/reports.helpers.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['organization-isolation-checker']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test only (the received list is empty).

In `scripts/sad/check.ts`, `organization-isolation-checker` globs, add directly after `'apps/api/src/**/*.service.ts',`:

```ts
      'apps/api/src/**/*.helpers.ts',
```

In `docs/sad-pathways.md` line 36, after `` `apps/api/src/**/*.service.ts` `` insert `` , `apps/api/src/**/*.helpers.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1` (52 in the dry run).

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.1, after the sentence ending `all three are Vitest tests for the same Biome limit (amended 2026-10-10 for F4a).`, add:

```text
The api test also fails when two api modules import each other outside a recorded list, which holds only `dashboards <-> reports` after S6a (amended for S6a).
```

Section 3.6: if the bullet starting `- A domain whose services are also called by seeds or by other services` exists (S3a), replace its ending `indicators do this (amended for S3a).` with `indicators, finance, evaluations and reports do this (amended for S3a and S6a).`; if it does not exist, add after the bullet starting `- Response schemas are types only`:

```markdown
- A domain whose services are also called by seeds or by other services keeps parsing its request in the service with the shared contract and its existing 400 body, and its controller passes the body through; finance, evaluations and reports do this (amended for S6a).
```

Section 3.7, replace the row `| S6 | Finance, evaluations, reports, report-pdf | Removes the reports and report-pdf cycle |` with:

```markdown
| S6a, S6b | Finance, evaluations, reports, report-pdf (S6a: shared contracts and API; S6b: web client and screens) | Removes the reports and report-pdf cycle |
```

Section 9, append:

```markdown
S6a applied on refactor/s6a-finance-reports-api:
- Cycle: `ReportPdfRenderer` and its test moved to `modules/reports`, `ReceiptPdfRenderer` to `modules/finance`, and `modules/report-pdf` became `modules/print-pdf`, whose `PrintPdfModule` provides only `PrintPdfRenderer`; `apps/api/src/common/import-boundary.test.ts` fails when two api modules import each other outside the recorded `dashboards <-> reports` pair.
- Contracts: `packages/shared/src/contracts/finance/finance-requests.ts`, `contracts/evaluations/evaluation-requests.ts` and `contracts/reports/report-requests.ts` hold the request schemas moved verbatim from the services and `reports.dto.ts` (deleted); the services keep parsing them with their fixed 400 messages, pinned by `finance.validation.test.ts`, `evaluations.validation.test.ts` and `reports.validation.test.ts`.
- Evaluations: `evaluations.service.ts` went from 809 to 337 lines; mapper, helpers, detail reads, scoring, assessments and review transitions moved verbatim into `evaluations.mapper.ts`, `evaluations.helpers.ts` and four function modules; `evaluation-metrics.ts` became `evaluation-metrics.service.ts`.
- Reports: `reports.service.ts` went from 873 to 455 lines; the report source, the reservation and finalization steps and the kind policy moved into `report-source.service.ts`, `report-generation.service.ts` and `reports.helpers.ts`; `report-sources-extra.ts` became `report-monitoring-evaluation-source.ts`; three read routes use `requireScopedProject`.
- Finance: `finance.service.ts` went from 631 to 439 lines; the receipt admission and record reads moved into `expense-receipts.service.ts`.
- Kernel: the 9 `Prisma.TransactionClient` annotations in the S6 modules became `Tx`.
- SAD: organization isolation routing covers `apps/api/src/**/*.helpers.ts`, because the report kind policy left `reports.service.ts`.
- Decisions: S6 split into S6a and S6b (ruling 1); the `dashboards <-> reports` pair stays because the shared artifact writer's bundled fonts are found by source path (ruling 2); requests stay validated in the service (ruling 3); the expense amount check no longer throws, so `'abc'`, `''` and `' 1'` answer 400 instead of 500, the only accepted difference (ruling 4); the S1 class-validator field schemas are not used (ruling 6); api helpers route to the isolation checker (ruling 11); the 10 `Application profile required.` controller checks keep their text (ruling 10); `reporting-workspace.tsx` is production-dead and goes in S6b (ruling 12).

Deferred to S6b: the web client members, reports feature, budget module, evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts. Left to S7: the `dashboards <-> reports` pair and the longer cycles through `dashboards`.
```

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: append to the disposition cell of MOD-04 `; reports, evaluations and finance split by S6a.`, of MOD-08 `; reports read routes use requireScopedProject (S6a).`, of MOD-11 `; finance, evaluation and report contracts by S6a.` and of MOD-17 `; S6a renamed evaluation-metrics, report-sources-extra and report-pdf and removed reports.dto.ts.`
- `docs/qad-pathways.md` QAD-T119: replace `` `apps/api/src/modules/report-pdf/report-pdf.renderer.test.ts` `` with `` `apps/api/src/modules/reports/report-pdf.renderer.test.ts` ``.
- `docs/deferred-features.md`: in the `Designed PDF on hosted` row replace `` `apps/api/src/modules/report-pdf` `` with `` `apps/api/src/modules/print-pdf` ``; in the `Indicator summary with an indicator lacking measurement mode or direction` row replace `` `apps/api/src/modules/reports/reports.service.ts` `` with `` `apps/api/src/modules/reports/report-source.service.ts` ``.

```bash
git grep -nE "modules/report-pdf|reports\.dto|report-sources-extra|evaluation-metrics(\.test)?\.ts" -- docs AGENTS.md README.md ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the grep prints nothing.

- `docs/index.md`: the modularization CR row status names S6a as applied and S6b next, keeping the earlier entries (for example `Approved; F1 to S5 applied, S6a applied, S6b next`, matching the current wording).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## Modularization S6a finance and reports api (refactor/s6a-finance-reports-api)
```

with one bullet per Task 1 to Task 6 stating what moved, split or was added, with its commit hashes and the shared and api test counts at the end of that task; a bullet with the accepted difference of ruling 4; a bullet saying the S6a decisions are recorded in the change record section 9 (the plan stays until S6b is planned, because it holds the S6b outline); and a bullet listing the S6b deferrals. Task 8 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S6a finance and reports api and route api helpers to the isolation checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/finance/finance-requests.js && test -f packages/shared/dist/contracts/evaluations/evaluation-requests.js && test -f packages/shared/dist/contracts/reports/report-requests.js && test -f apps/api/dist/apps/api/src/modules/print-pdf/print-pdf.module.js && test -f apps/api/dist/apps/api/src/modules/reports/report-pdf.renderer.js && test -f apps/api/dist/apps/api/src/modules/finance/receipt-pdf.renderer.js && test ! -e apps/api/dist/apps/api/src/modules/report-pdf && test ! -e apps/api/dist/apps/api/src/modules/reports/reports.dto.js && test -f apps/api/dist/apps/api/src/modules/reports/assets/NotoSans-Regular.ttf && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/s6a/web-build-gates.log 2>&1; echo "exit $?"
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass and `dist layout ok` (nest `deleteOutDir` removes the old `report-pdf` output; the font asset still ships). Versus Task 0: shared = `B_shared + 35` (3 new files), api = `B_api + 87` (5 new files: three validation tests, the scope test and `evaluations.helpers.test.ts`), sad = `B_sad + 1` (Task 7), web, config and imports unchanged; web build exit 0.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (the replay runs `evaluations.local.test.ts` and `reports-runtime.local.test.ts` against a disposable PostgreSQL).

- [ ] **Step 3: Seeds, compiled API boot, renderer check, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm db:defense:local
pnpm --filter @pathways/api exec tsx scripts/check-pdf-renderer.ts
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: both seeds finish without error (Review Focus 5); the renderer check writes a report PDF and a receipt PDF when Chrome or Edge is installed (off Linux it reports a missing browser otherwise, which is not a failure of this branch); `"status":"ok"`; a module-resolution error or a Nest `can't resolve dependencies` error naming `ReportPdfRenderer`, `ReceiptPdfRenderer` or `PrintPdfRenderer` in the `pnpm dev:local` output fails the gate (Review Focus 2); auth-navigation all pass; the main suite shows the same failures as the F1 to S5 gate runs (MFA Verify helper, password-login harness, workflows seed end date) and no new one. Browser smoke against the compiled API, each step as a demo user whose role allows it: as Project Manager open a project's Budget tab, add a budget line and replace it (`createBudgetRequest`, `replaceBudgetRequest`); as Project Officer submit an activity expense with a receipt (`submitExpenseRequest`, `admitReceiptUpload`), then verify, approve and sign it off as the reviewing roles (`reviewExpenseRequest`); download the receipt (`admitReceiptRead`) and the disbursement record PDF, or see the same 503 text as on dev when no browser is installed (`readOfficialReceipt`); as Monitoring and Evaluation Officer start an evaluation round, recompute it with a narrative and submit it, then as Project Manager return it with a reason, resubmit it and sign it off (scoring and review modules); open a beneficiary's assessments as Project Officer after the step-up PIN (`evaluation-assessments.service.ts`); on Reports, preview each kind the role allows, open the survey form and evaluation round lists, generate a CSV and a PDF report (designed PDF or the pdfkit fallback notice) and export both (`report-source.service.ts`, `report-generation.service.ts`); paste the reports URL of a project outside the role's scope and expect the same denial as on dev. Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s6a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker` and `beneficiary-privacy-guardian`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s6a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s6a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, replay exit code, seed results, renderer check, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S6a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s6a-finance-reports-api -m "Merge refactor/s6a-finance-reports-api into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S6b**

The plan holds the S6b outline, so it stays on dev. In `docs/index.md` section 1.6 change the S6 plan row status to `S6a executed; holds the S6b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S6a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S6b outline (finance and reports web, branch `refactor/s6b-finance-reports-web`)

To be written as its own plan from dev after S6a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `a101ad7c` (before F4b and S1 to S5) and must be recounted in S6b Task 0.

**Interfaces assumed from earlier slices (S6b):**
- F4b: `apps/web/src/lib/format/{date,percent,plural,tone}.ts` (including `formatCalendarDay`, `plural` and the `StatusTone` union), `apps/web/src/lib/api/core/request.ts` (`PathwaysClientError`, `requestFoundation`, `requestFoundationResponse`; `readContextCookie` is private there), `apps/web/src/lib/api/core/request-owner.ts` (`captureRequestOwner(signal?: AbortSignal | null): () => boolean`, already used by the `read()` and `fetchCoreArtifact` in `core-feature-client.ts`), `apps/web/src/hooks/use-authorized-read.ts` (`useAuthorizedRead`, `authorizedReadPolicy`, `SUMMARY_READ_STALE_MS`), `stickyTableHeadClass` from `apps/web/src/components/pathways/sticky-table-head.ts` (used by `live-evaluation-workspace.tsx`), and `apps/web/src/lib/api/**/*.ts` in the beneficiary-privacy-guardian globs.
- S4b: `getBeneficiaryAssessments` stays in `pathways-client.ts` for S6 (S4 outline Task 2 assigns it to evaluations).
- S1b: `features/projects/` has `components/`, `team/` and `index.ts`, no `hooks/`; budget, evaluation and the activity expense dialogs were left in place for S6 (S1 outline Task 3).
- S2: whether `activity-expense-dialog.tsx` and `activity-expense-review-dialog.tsx` moved with activities; S6b claims them for `features/projects/budget/` unless S2 already moved them (cross-plan check). After S2b they are imported by `activities/components/activity-detail-content.tsx` and typed in `activities/hooks/use-activity-expenses.ts`, and the budget module imports `../activities/activities.utils` and `../activities/activities.reads`.
- S3b: the web `ProjectIndicator` alias in `types/pathways.ts` is already deleted by S3b; the dead `reporting-workspace.tsx` imports `IndicatorResponse` from `@pathways/shared` and calls `indicatorsClient.getProjectIndicators`, so S6b's deletion starts from that result.
- S6a: the request contracts and their types from `@pathways/shared`.
- S8b expects `core-feature-client.ts` to keep `coreFeatureClient` (publication), `coreDataClient.audit` and the artifact download helpers after S6b (S8 plan, interfaces from S6).

**Tasks:**
- **Task 0, baseline:** recount everything below; confirm the F4b exports; record web Middleware.
- **Task 1, dead reporting workspace:** delete `features/reports/reporting-workspace.tsx` (1132) and its test (105), `survey-report-overview.tsx` (101), `survey-report-utils.ts` (104) and its test (259), and `reportKindPermissions` in `lib/rbac/policy.ts` (only the dead workspace imports it), plus any `pathwaysClient` method or web type that only the deleted files use (found by grep after deletion, as F1 did); `getProjectIndicators` has eight other users so no indicator client method becomes dead, and the `indicatorsClient` mock line of `reporting-page.test.tsx` goes only if the page no longer reaches the client. Update `ui-copy-cleanup.contract.test.ts` (two entries name the file). QAD-T18 cites `survey-report-utils.test.ts`: before deleting, check whether a live screen renders the PRD-F9 survey table; if none does, stop and ask the developer how QAD-T18 is evidenced, because the row would lose its only test.
- **Task 2, `lib/api/finance.ts`, `lib/api/evaluations.ts`, `lib/api/reports.ts`:** move the finance (9 methods), evaluation (6) and report (5) members of `coreDataClient` and their response schemas out of `core-feature-client.ts` (548 lines) as `financeClient`, `evaluationsClient` and `reportsClient` with the same signatures; request bodies typed from the S6a contracts (`CreateBudgetRequest`, `GenerateReportRequest` and the rest) instead of `unknown` or inline object types. The owned JSON `read()` and `post()` move to `lib/api/core/owned-json-read.ts` so both files use one copy. `coreDataClient` is referenced by 20 files (12 production) and mocked by 14 `vi.mock('@/lib/services/core-feature-client', ...)` factories; each factory that stubs a moved member gains a mock of the new module in the same commit, counted before and after. `lib/services/report-sections.ts` (103, 7 importers) moves to `lib/api/report-sections.ts`. The beneficiary assessment read (`pathwaysClient.getBeneficiaryAssessments`, used by `beneficiary-detail-loader.tsx`) moves to `lib/api/evaluations.ts` with its `vi.mock` stub in `beneficiary-detail-loader.test.tsx`.
- **Task 3, response contracts:** the web response schemas that mirror S6a routes (budget, expense, expense acknowledgement, report preview, report list, evaluation round, evaluation detail) move to `packages/shared/src/contracts/{finance,evaluations,reports}/*-responses.ts`; the web keeps parsing them at runtime (the `projectId` and `id` refinements stay in the web client), as S3 ruling 8 allows for responses already parsed before the modularization, and the api functions get the inferred return types where the shapes match exactly (a type mismatch is reported, not fixed by a cast).
- **Task 4, report kind grants:** `kinds` and `allowedKinds` in `live-reporting-workspace.tsx` restate the api `kindPermission`, `extraKindRequires` and `readableReportKinds`; move the grant table (permission and extra grants per kind, without labels) to `packages/shared/src/rbac/report-kind-grants.ts`, have the web and the api list route use it, and keep `assertReportPermission` on its own rules (it does not require the beneficiary aggregate grants, whose refusal has its own 403 text). A parity test runs both old functions and the shared one over every role in `rolePermissions` before either copy is removed. SAD: `packages/shared/src/rbac/**` already routes to organization-isolation-checker.
- **Task 5, feature folders:** `git mv` `features/projects/budget-module/*` (15 files) to `features/projects/budget/` with `components/`, `hooks/` and `print/`, the two activity expense dialogs and their tests to the same folder (see S2 above), and `live-evaluation-workspace.tsx` with its test to `features/projects/evaluation/`; repoint `app/print/receipts/[expenseId]/page.tsx`, the two budget and monitor-evaluate route pages, `activities/components/activity-detail-content.tsx`, `activities/hooks/use-activity-expenses.ts` (the type import) and `project-review-workspace.tsx` through `features/projects/index.ts` (the panel, `activity-detail-sections.tsx`, `activity-list-table.tsx` and the workspace no longer import the dialogs after S2b) (the print receipt page route already imports `PrintReceiptPage` through the feature index, so S6b repoints that index export line and edits no route import). `features/reports` gets `components/`, `hooks/`, `reports.utils.ts` (`reportFileName`) and `index.ts`.
- **Task 6, oversized components and read keys:** split `live-reporting-workspace.tsx` (549) and `live-evaluation-workspace.tsx` (533) by component and hook, verbatim, with characterization tests first where the existing tests do not render the moved part. `budget.reads.ts` holds the `finance-budgets` key now read in `use-budget-module.ts:20` and in `activities/hooks/use-activity-expenses.ts` (S2b moved it out of `project-activities-workspace.tsx:296`); `budget/` gets no sub-index; share it only if the fetcher, permission and freshness are identical (one key serves one cache entry), and record the comparison either way. `live-evaluation-workspace.tsx`'s `statusTone` is typed to F4b's `StatusTone`. The direct `principalHasAtomicPermission(profile, ...)` calls in these components stay (F4a left no local wrapper here; `budget-ledger.tsx` already uses `usePermission`).
- **Task 7, records:** CR section 9 S6b disposition, audit MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 (finance, evaluation and report parts), QAD and deferred-feature paths, index, activity log.
- **Task 8, gates and merge:** as S6a Task 8, with web Middleware measured and a smoke over the reports pages and print view, the budget tab and print receipt, the activity expense dialogs, the monitor and evaluate tab and the beneficiary assessments panel. After merge, remove this plan and its index row.
