# S6b Finance and Reports Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the production-dead reporting workspace, give the finance, evaluation and report web code their own client modules and feature folders, and give `features/reports` a public index, with no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S6b is the web half of S6 that does not touch response contracts or component internals (S6a, the request contracts and the api splits, is applied below it). The dead `reporting-workspace.tsx` chain goes first, measured by an exports scan and a test title comparison. The 20 finance, evaluation and report members of `coreDataClient` and the beneficiary assessment read of `pathwaysClient` become `financeClient`, `evaluationsClient` and `reportsClient` in `lib/api`, generated from the code as it stands and proven line by line; callers and test mocks follow by script with exact counts, after characterization tests that run against the old and the new code. `features/projects/budget-module` (with the two activity expense dialogs), the evaluation workspace and the report screens move into `features/projects/budget`, `features/projects/evaluation` and `features/reports`, and `features/reports` gets an `index.ts`. The response contracts, the shared report kind grants and the two oversized workspaces are not done here: that is S6c (outline at the end), because together they would take the plan past twelve tasks. Mechanical edits use one-off Node scripts under `.tmp/s6b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run in order on an exported copy of the S6a tip with the S4b result applied, and the whole sequence was then replayed from that baseline by one driver that executes the code blocks of this plan: the replayed tree is identical to the dry-run tree, and the counts quoted below come from that replay. S4c and S5b were not part of the planner's dry-run base; the pre-flight scan replayed the whole sequence again on the real base, the S5b slice tip `0469ccb0` (stacked S3b, S4a, S5a, S6a, S4b, S4c, S5b), and the counts quoted below are that replay's.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5 and 9, including the S6a disposition and its "Deferred to S6b" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05 for the finance, evaluation and report clients, MOD-06 for the dead workspace, MOD-15 and MOD-17 for the layout; the other parts of MOD-06 and MOD-16 are left to S6c).

## Rulings

Controller rulings for S6b. Each was checked on the dry-run copy; Task 0 recounts them. Rulings 1 and 12 of the S6 plan (the split, and the dead workspace) are the origin of this plan.

1. **Split S6b and S6c.** The S6 outline had seven tasks for the web half (clients, response contracts, report kind grants, feature folders, oversized components, records, gates). The two shared-package tasks (response contracts for seven web schemas, a shared grant table with a parity test over every role) and the two component splits (`live-reporting-workspace.tsx` 542 lines, `live-evaluation-workspace.tsx` 531, plus their tests of 509 and 299) each need a design and a line-by-line proof, which would take the plan past twelve tasks. S6b (this plan, Tasks 0 to 6) takes the dead code, the clients, the callers and mocks, the layout and the records; S6c (outline at the end) takes the rest. Both names replace the outline's names; the environment assigns the branch. Cost if wrong: executor fatigue in one long plan.
2. **The dead reporting chain is deleted, and QAD-T18 follows the analytics test.** No production file imports `reporting-workspace.tsx`, `survey-report-overview.tsx` or `survey-report-utils.ts` (the exports scan `dead-exports.mjs` before and after shows what each deletion strands: `reportKindPermissions` and 11 report and survey types, which go in the same commit). QAD-T18 cited `survey-report-utils.test.ts`; the check the outline asks for found that a live screen renders the PRD-F9 survey table: `analytics-dashboard.test.tsx` has the cases "renders survey metric cards, chart and per-activity table, with activity titles instead of raw IDs", "labels survey mean pre/post in % and mean change in pp, never %" and "labels timeline percentages with % and leaves day and count cells unitless". The QAD row is repointed to that file in the same commit. The 18 tests that go with the deleted code are listed by the title comparison and recorded in the activity log. Cost if wrong: restore the files from git and keep the row on the old test.
3. **Request bodies are typed from the S6a contracts; nothing else about the members changes.** `financeClient` (9 members), `evaluationsClient` (6 members and `getBeneficiaryAssessments`) and `reportsClient` (5) are object literals in `lib/api/finance.ts`, `evaluations.ts` and `reports.ts` with the same names, parameters and results as the `coreDataClient` members they replace, except that `body: unknown` and the inline `generateReport` body become `CreateBudgetRequest`, `ReplaceBudgetRequest`, `SubmitExpenseRequest`, `ReviewExpenseRequest`, `CreateEvaluationRequest`, `SaveEvaluationScoresRequest`, `SubmitEvaluationRequest`, `ReturnEvaluationRequest`, `SignOffEvaluationRequest` and `GenerateReportRequest`. The generator (`build-clients.mjs`) cuts the blocks out of `core-feature-client.ts` and `pathways-client.ts` as they stand and swaps only those type names and the helper names; `same-lines.mjs` must print `lost 0` against the composed original. Cost if wrong: review time.
4. **The owned JSON read and post move to `lib/api/core/owned-json-read.ts`.** `read` becomes `ownedJsonRead`, `post` becomes `ownedJsonPost` and the project path helper becomes `projectPath`, so the three new clients and `core-feature-client.ts` (publication and audit) use one copy of the stream, owner, size and MIME checks. The cases that probe those checks (an aborted signal, a missing workspace cookie, ownership invalidation, an unexpected MIME, a body completed after logout, an oversized body) stay in `core-feature-client.test.ts` and run through `coreDataClient.audit`, which keeps using the shared read. Cost if wrong: one more copy of the read.
5. **The assessment read moves to `evaluationsClient`.** `getBeneficiaryAssessments`, `AssessmentDetail`, `AssessmentSummary`, `parseAssessmentSummaries`, `assessmentTypes` and `isNullableString` leave `pathways-client.ts`; the parsers go to `lib/api/evaluations.schema.ts`. `beneficiary-detail-loader.tsx` imports `AssessmentSummary` from there and calls `evaluationsClient`, and its test mocks `@/lib/api/evaluations`. Cost if wrong: a rename.
6. **`core-feature-client.ts` keeps `coreFeatureClient`, `coreDataClient.audit` and the artifact helpers.** S8 reads them there (S8 plan, interfaces from S6); the file shrinks from 529 to 173 lines. Cost if wrong: S8 repoints.
7. **Characterization before removal: both clients run the same cases.** Task 2 writes `finance.test.ts` (104 runs), `evaluations.test.ts` (102) and `reports.test.ts` (86) as `describe.each` tables over the old and the new client with the real foundation fetch: 146 cases, 292 runs, covering the request, the malformed record ids, the response identity checks and every response bound (row maxima, text maxima, enums, literals, decimals, timestamps, nullable fields, extra keys) that the line comparison alone pinned, passing against the code being replaced before it goes, and a mutation of a method and a path makes two of them fail. Task 3 splits the old `core-feature-client.test.ts` cases by client into those files, keeps every case (`test-titles.mjs compare` prints `lost 0` with the three renamed titles allowed: two survey preview titles carry the fixture project id, which moves from 780... to 782..., and one assessment title gained the words "with the signal") and drops the old rows. Cost if wrong: none.
8. **Layout.** `features/projects/budget/` holds `components/` (the five budget screens, the review drawer, the two activity expense dialogs and the ledger test), `hooks/` (`use-budget-module.ts`), `print/` (the five receipt files, unchanged) and `budget.utils.ts` (`budget-math.ts`, renamed by CR 3.5). `features/projects/evaluation/components/` holds the evaluation workspace and its test (a folder with one component follows the CR 3.3 rule that screens live in `components/`). `features/reports/` keeps `print/`, gets `components/` (the page and the live workspace) and `reports.utils.ts` (`reportFileName`, moved with its test), plus an `index.ts` that lists `ReportingPage`, the print payload, sample and view exports and `Band`, `Table` and `td`, which the budget print receipt reuses (a file outside an indexed feature may import only its index). `import-direction.test.ts` loses `reports` as its example of a non-indexed feature (the sample import now names `settings`). There is no `hooks/` folder in `reports` or `evaluation` (no hook is extracted until S6c) and no sub-index: the feature index lists leaf paths, as S2b measured. Cost if wrong: later slices repoint by path.
9. **Every production build starts from a clean `.next`** (S2b ruling 10) and route tables are compared with `compare-routes.mjs`: Task 4 Step 1 measures a baseline right before the layout move, because Tasks 1 to 3 already moved 21 routes by 1 to 5 kB (the dead code and the moved client members left shared chunks); the pass criterion is no route more than 1 kB bigger than that baseline, and Middleware at `M0` (103 kB in the cloud container, 102 kB in the planning and pre-flight containers). Cost if wrong: a misleading `Module not found` after a move.
10. **No new SAD routing.** `apps/web/src/lib/api/**/*.ts` and `lib/services/**/*.ts` already route to `beneficiary-privacy-guardian`; the feature folders need `design-qa-agent` only. Cost if wrong: one glob in `scripts/sad/check.ts`.
11. **Not done in S6b (recorded in CR section 9):** the response contracts for the web schemas, the shared report kind grants, the splits of the two workspaces and the `finance-budgets` read key (S6c); `replaceBudget` has no production caller (`budget-actions.tsx` has no replace action), but it is part of the S6a request contract and the api route, so the member moves and is kept, with its test. Cost if wrong: one dead client member.
12. **Cross-plan.** S4c splits beneficiary components and S5b moves the form and import members out of `pathways-client.ts` and leaves both indexed-feature lists as they are (`projects` and `beneficiaries`; `features/collection` has no `index.ts`); this plan edits `pathways-client.ts` only at `getBeneficiaryAssessments` and its helpers, `beneficiary-detail-loader.tsx` and its test only at the assessment call, the mock and the import, and the two indexed-feature lists only by appending a name. S8 reads no finance, evaluation or report client. Counts that S4c and S5b change are named in Task 0 and recounted there. Cost if wrong: a later Task 0 stops on a missing path or count.

## Interfaces assumed from earlier sub-projects

- S6a (from `@pathways/shared`): `CreateBudgetRequest`, `ReplaceBudgetRequest`, `SubmitExpenseRequest`, `ReviewExpenseRequest`, `CreateEvaluationRequest`, `SaveEvaluationScoresRequest`, `SubmitEvaluationRequest`, `ReturnEvaluationRequest`, `SignOffEvaluationRequest`, `GenerateReportRequest` and `reportKinds`; the api module `print-pdf`.
- S4b: `apps/web/src/lib/api/beneficiaries.ts` and `journeys.ts` (the model of a client file and of mocks that name `@/lib/api/*`), `beneficiaries` in `indexedFeatures` and in `optimizePackageImports`.
- S4c: the beneficiary component splits (`registration/hooks`, `profile/hooks`); S6b touches only `beneficiary-detail-loader.tsx` and its test.
- S5b: `lib/api/forms.ts`, `lib/api/imports.ts` and `features/collection/hooks` (S5b adds no `features/collection/index.ts` and no `collection` entry in `indexedFeatures`, so `reports` becomes the third indexed feature).
- S3b: `apps/web/src/lib/api/indicators.ts`; S2b: `activitiesClient`, `lib/api/core/guards.ts`, the `.schema.ts` convention, `features/projects/index.ts` and `experimental.optimizePackageImports`; S1b: `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`.
- F4b: `PathwaysClientError`, `requestFoundation`, `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts`; `captureRequestOwner`; `useAuthorizedRead`; `lib/format/*`.

## Produces (names later plans consume)

- `financeClient` (`lib/api/finance.ts`): `budgets`, `createBudget`, `replaceBudget`, `expenses`, `budgetReferences`, `submitExpense`, `reviewExpense`, `signoffExpense`, `uploadReceipt`, with the parameters the `coreDataClient` members had and request bodies typed from the S6a contracts.
- `evaluationsClient` (`lib/api/evaluations.ts`): `evaluation`, `createEvaluation`, `saveEvaluationScores`, `submitEvaluation`, `returnEvaluation`, `signoffEvaluation`, `getBeneficiaryAssessments`; `evaluationDetailSchema` is exported for the workspace type; `lib/api/evaluations.schema.ts` holds `AssessmentDetail`, `AssessmentSummary` and `parseAssessmentSummaries`.
- `reportsClient` (`lib/api/reports.ts`): `surveyForms`, `evaluationRounds`, `reportPreview`, `reports`, `generateReport`.
- `ownedJsonRead`, `ownedJsonPost`, `projectPath` (`lib/api/core/owned-json-read.ts`); `reportSectionsSchema` in `lib/api/report-sections.ts`.
- Feature: `features/projects/{budget,evaluation}`, `features/reports/{components,print}` with `reports.utils.ts` and `index.ts` exporting `ReportingPage`, `PrintReport`, `readPrintReport`, `sampleReport`, `sampleProjectReport`, `PrintReportView`, `Band`, `Table` and `td`; `features/projects/index.ts` still exports `PrintReceiptPage` (now from `./budget/print/print-receipt-page`).
- `coreDataClient` has the one member `audit`; `pathwaysClient` has no `getBeneficiaryAssessments`; `reporting-workspace.tsx`, `survey-report-overview.tsx`, `survey-report-utils.ts` and `reportKindPermissions` no longer exist.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The only removals are the moved duplicates and the production-dead chain of Task 1. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; every file outside `features/reports` imports it only through its index once Task 4 lands.
- File moves use `git mv` (the move script does it); the generated client modules are checked with `.tmp/s6b/same-lines.mjs` (`lost 0`) before Biome formats them.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the tests use the fictional ids and names already in the files.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s6b/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Run `.tmp/s6b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to three minutes, so give the command a ten minute timeout.
- Mock factories name modules by the specifier the code under test imports; after Task 3 a moved member is mocked on its `@/lib/api/*` module, never on `coreDataClient` or `pathwaysClient`.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s6b/` (gitignored) and are never committed; build logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` when run through `pnpm --filter @pathways/web exec vitest run`.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the route sizes and the Middleware row, which ruling 9 and `M0` judge (the route tables below are those of the pre-flight scan: compare the differences, not the absolute kB).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the pre-flight replay on the S5b tip and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared` and `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch `claude/modularization-s6b-9ept8o`, stacked on `claude/modularization-s5b-9ept8o` (Task 0 Step 1 proves the stacking); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence; `apps/api` and `packages/shared` are not changed by this slice.
- This slice opens no pull request and no merge into `dev`: the developer asked for one pull request into `dev` after every slice is implemented, and the CI replay of that final pull request is the gate for the database replay, so Task 6 records the local gates and stops. No plan copy is removed in this slice: the S6 plan copy and the other executed plan copies stay listed in `docs/superpowers/plans` until the controller removes them after the final merge. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 6).

## Review Focus

1. Every moved member must send the same request: path, encoded ids, abort signal, query string, body and method; and must refuse the same inputs before any request (a malformed project id, a report kind outside the catalog). Task 2 pins all of it on both the old and the new client, and the strict response schemas (an unknown key is refused) moved verbatim (`lost 0`).
2. The shared owned read must keep its checks (owner, size, MIME, abort, cancellation after logout): the six cases that probe it stay and now run through `coreDataClient.audit`. Task 3 compares every test title before and after.
3. A test stub left on `coreDataClient` or `pathwaysClient` would hand a component `undefined` at run time. Task 3 scans every factory and runs the whole web suite.
4. The deleted chain must have no importer, and QAD-T18 must still name a test that renders the survey table (Task 1).
5. A route bundle must not grow when files move, and `/reports`, the print pages and the budget tab must not load a barrel. Task 4 compares a freshly measured baseline and Task 6 compares against both baselines.
6. The loaders and workspaces must not move onto `useAuthorizedRead` or change their reads: no new read key, no changed caching (the `finance-budgets` key stays duplicated until S6c).

## File map

| Path | Role after S6b |
|---|---|
| `apps/web/src/features/reports/{reporting-workspace,survey-report-overview,survey-report-utils}.*` and their tests | deleted (Task 1) |
| `apps/web/src/lib/api/finance.ts`, `evaluations.ts`, `evaluations.schema.ts`, `reports.ts`, `core/owned-json-read.ts` | the clients and parsers (new, Task 2) |
| `apps/web/src/lib/api/{finance,evaluations,reports}.test.ts` | request and response tests (new, Tasks 2 and 3) |
| `apps/web/src/lib/api/report-sections.ts` | moved from `lib/services` (Task 3) |
| `apps/web/src/lib/services/core-feature-client.ts` | keeps publication, audit and artifacts (529 to 173 lines, Task 3) |
| `apps/web/src/lib/services/pathways-client.ts` | loses the assessment read and its helpers (Task 3) |
| `apps/web/src/features/projects/budget/`, `features/projects/evaluation/` | budget and evaluation screens (Task 4) |
| `apps/web/src/features/reports/` | `components/`, `print/`, `reports.utils.ts`, `index.ts` (Task 4) |
| `apps/web/src/app/(dashboard)/reports/**/page.tsx`, `app/print/reports/[id]/page.tsx` | import `@/features/reports` (Task 4) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts` | list `reports` as an indexed feature (Task 4) |
| `docs/` change record, audit, QAD, deferred features, index, activity log | records (Task 5) |


---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s6b-finance-reports-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s6b/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `mock-scan.mjs`, `client-blocks.mjs`, `count-calls.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S6a and the slices below it**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
test -f apps/web/src/lib/api/indicators.ts && echo "S3b present"
test -f apps/web/src/lib/api/beneficiaries.ts && test -f apps/web/src/lib/api/journeys.ts && echo "S4b present"
test -d apps/web/src/features/beneficiaries/registration/hooks && test -d apps/web/src/features/beneficiaries/profile/hooks && echo "S4c present"
test -f apps/web/src/lib/api/forms.ts && test -f apps/web/src/lib/api/imports.ts && test -d apps/web/src/features/collection/hooks && echo "S5b present"
test -d apps/api/src/modules/print-pdf && test ! -d apps/api/src/modules/report-pdf && echo "S6a present"
test -f packages/shared/src/contracts/finance/finance-requests.ts && test -f packages/shared/src/contracts/evaluations/evaluation-requests.ts && test -f packages/shared/src/contracts/reports/report-requests.ts && echo "S6a contracts present"
test -f apps/web/src/lib/api/activities.ts && test -f apps/web/src/lib/api/core/guards.ts && echo "S2b present"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/core/request-owner.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -d apps/web/src/lib/format && echo "F4b present"
test -f apps/web/src/features/projects/index.ts && echo "S1b present"
grep -c "indexedFeatures" apps/web/src/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
test -f docs/handoff/modularization-s6b-finance-reports-web.md && echo "handoff copy present"
mkdir -p .tmp/s6b/files
git rev-parse HEAD > .tmp/s6b/base-sha
git merge-base --is-ancestor claude/modularization-s5b-9ept8o HEAD && echo "stacked on claude/modularization-s5b-9ept8o"
```

Expected: `git status --short` prints nothing. Then the slice branch, the marker lines, the two counts, the plans listing (the executed plan copies stay listed until the controller removes them after the final merge; do not depend on them), the handoff copy and the stacking line (the S5b branch is an ancestor of the branch being worked on):

```
claude/modularization-s6b-9ept8o
S3b present
S4b present
S4c present
S5b present
S6a present
S6a contracts present
S2b present
F4b present
S1b present
3
1
2026-10-13-modularization-s3b-indicators-web.md
2026-10-13-modularization-s4-beneficiaries.md
2026-10-13-modularization-s4b-beneficiaries-web.md
2026-10-13-modularization-s4c-beneficiaries-components.md
2026-10-13-modularization-s5-collection.md
2026-10-13-modularization-s5b-collection-web.md
2026-10-13-modularization-s6-finance-reports.md
handoff copy present
stacked on claude/modularization-s5b-9ept8o
```

A missing marker line or a missing stacking line means the branch lacks a stacked slice: stop and report NEEDS_CONTEXT. `.tmp/s6b/base-sha` is the head the branch has when Task 0 starts (the S5b tip `0469ccb0`, or the controller commit that stages this plan on it), the base of every later comparison and of the SAD check.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `.tmp/s6b/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s6b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s6b/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s6b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s6b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s6b/routes-$1.txt
grep Middleware .tmp/s6b/routes-$1.txt
```

`.tmp/s6b/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s6b/compare-routes.mjs`:

```js
// Prints the routes whose First Load JS differs between two saved next build route tables.
import { readFileSync } from 'node:fs'

const [before, after] = process.argv.slice(2)
const row = /^[┌├└] [ƒ○] (\S+)\s+\S+ \S+\s+([\d.]+) kB$/
const table = (file) =>
  new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line) => {
        const match = row.exec(line.trim())
        return match ? [[match[1], Number(match[2])]] : []
      }),
  )
const was = table(before)
const now = table(after)
let different = 0
for (const [route, kb] of now) {
  const old = was.get(route)
  if (old === undefined) console.log(`${route}: new at ${kb} kB`)
  else if (old !== kb) {
    different++
    console.log(`${route}: ${old} kB -> ${kb} kB (${kb > old ? '+' : ''}${(kb - old).toFixed(1)})`)
  }
}
for (const route of was.keys()) if (!now.has(route)) console.log(`${route}: removed`)
console.log(`routes ${now.size}, different ${different}`)
```

`.tmp/s6b/mock-scan.mjs` counts `vi.mock` factories for one web module and lists those whose factory text names a given export:

Create `.tmp/s6b/mock-scan.mjs`:

```js
// Counts vi.mock factories for one web module and lists those whose factory text names any given export.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const [from, ...names] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const call = /vi\.(?:mock|doMock)\(\s*(['"])([^'"]+)\1/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(file), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

// The factory text from the opening parenthesis of the call to its matching close.
const factory = (text, start) => {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(start, i + 1)
  }
  return text.slice(start)
}

let total = 0
let naming = 0
for (const file of walk(web)) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(call)) {
    if (target(file, match[2]) !== from) continue
    total++
    const body = factory(text, text.indexOf('(', match.index))
    const hits = names.filter((name) => new RegExp(`\\b${name}\\b`).test(body))
    if (!hits.length) continue
    naming++
    const line = text.slice(0, match.index).split('\n').length
    console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}:${line} ${hits.join(', ')}`)
  }
}
console.log(`factories ${total}, naming ${naming}`)
```

`.tmp/s6b/client-blocks.mjs` names the 20 members, groups them by new client and finds their blocks in `core-feature-client.ts` and `pathways-client.ts` (Tasks 2 and 3 import it):

Create `.tmp/s6b/client-blocks.mjs`:

```js
// Shared names for the finance, evaluation and report client move: the member groups and the helpers that cut members and declarations out of core-feature-client.ts.
export const coreFile = 'apps/web/src/lib/services/core-feature-client.ts'
export const pathwaysFile = 'apps/web/src/lib/services/pathways-client.ts'

export const groups = [
  {
    client: 'financeClient',
    module: '@/lib/api/finance',
    members: [
      'budgets',
      'createBudget',
      'replaceBudget',
      'expenses',
      'budgetReferences',
      'submitExpense',
      'reviewExpense',
      'signoffExpense',
      'uploadReceipt',
    ],
  },
  {
    client: 'evaluationsClient',
    module: '@/lib/api/evaluations',
    members: [
      'evaluation',
      'createEvaluation',
      'saveEvaluationScores',
      'submitEvaluation',
      'returnEvaluation',
      'signoffEvaluation',
    ],
  },
  {
    client: 'reportsClient',
    module: '@/lib/api/reports',
    members: ['surveyForms', 'evaluationRounds', 'reportPreview', 'reports', 'generateReport'],
  },
]
export const allMembers = groups.flatMap((group) => group.members)

// Top-level declaration starts of core-feature-client.ts.
const topStart = /\n(?=(?:export )?(?:async function|const|type) |\/\*\*|export async function|export function)/g

// The top-level const: its leading comment lines and its text up to the next top-level declaration.
export function constBlock(text, name) {
  const at = text.search(new RegExp(`\\n(?:export )?const ${name}\\b`))
  if (at < 0) throw new Error(`missing declaration ${name}`)
  topStart.lastIndex = at + 2
  const end = topStart.exec(text)
  return text.slice(at + 1, end ? end.index + 1 : text.length)
}

// The top-level async function: from its signature to its closing brace line.
export function functionBlock(text, name) {
  const at = text.indexOf(`\nasync function ${name}`)
  if (at < 0) throw new Error(`missing function ${name}`)
  return text.slice(at + 1, text.indexOf('\n}\n', at) + 3)
}

// One coreDataClient member: from `  name:` to the line before the next member or the closing brace.
export function memberBlock(text, name) {
  const at = text.indexOf(`\n  ${name}: `)
  if (at < 0) throw new Error(`missing member ${name}`)
  const next = /\n(?:  [A-Za-z]+: |\})/g
  next.lastIndex = at + name.length + 4
  const end = next.exec(text)
  if (!end) throw new Error(`unterminated member ${name}`)
  return text.slice(at + 1, end.index + 1)
}

// The class method block of pathways-client.ts: the declaration and its closing brace line.
export function methodBlock(text, name) {
  const at = text.indexOf(`\n  async ${name}(`)
  if (at < 0) throw new Error(`missing method ${name}`)
  return text.slice(at + 1, text.indexOf('\n  }\n', at) + 5)
}

// The interface member block of pathways-client.ts: from `  name(` to the line before the next member.
export function interfaceBlock(text, name) {
  const at = text.indexOf(`\n  ${name}(`)
  if (at < 0) throw new Error(`missing member ${name}`)
  const next = /\n(?:  [A-Za-z]+\(|\})/g
  next.lastIndex = at + name.length + 3
  const end = next.exec(text)
  return text.slice(at + 1, end.index + 1)
}
```

`.tmp/s6b/count-calls.mjs` counts `coreDataClient.<moved member>` and `pathwaysClient.getBeneficiaryAssessments` calls in production and test files:

Create `.tmp/s6b/count-calls.mjs`:

```js
// Counts coreDataClient.<moved member> and pathwaysClient.getBeneficiaryAssessments calls in production and test files, and lists other mentions of a moved name.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { allMembers } from './client-blocks.mjs'

const web = path.resolve('apps/web/src')
const call = new RegExp(`\\b(?:coreDataClient|pathwaysClient)\\s*\\.(${[...allMembers, 'getBeneficiaryAssessments'].join('|')})\\b`, 'g')
const owned = new Set(['lib/services/core-feature-client.ts', 'lib/services/pathways-client.ts'])

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const totals = { production: { calls: 0, files: 0 }, test: { calls: 0, files: 0 } }
for (const file of walk(web)) {
  const rel = path.relative(web, file).split(path.sep).join('/')
  if (owned.has(rel)) continue
  const calls = [...readFileSync(file, 'utf8').matchAll(call)].length
  if (!calls) continue
  const kind = /\.test\.tsx?$/.test(rel) ? 'test' : 'production'
  totals[kind].calls += calls
  totals[kind].files++
  if (process.argv.includes('--list')) console.log(`${kind} ${rel}: ${calls}`)
}
console.log(`production calls ${totals.production.calls} in ${totals.production.files} files`)
console.log(`test calls ${totals.test.calls} in ${totals.test.files} files`)
```

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s6b/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s6b/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s6b/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s6b/m0
cat .tmp/s6b/m0
```

Expected: the figures of the pre-flight replay on the S5b tip. Write them down as the baselines; every later Expected is a delta from them. The typecheck lines come first (each package prints `Done`), then the test summaries, the docs check and the build lines:

```
Scope: 5 of 6 workspace projects
packages/config typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/config typecheck: Done
packages/shared typecheck: Done
packages/imports typecheck$ tsc -p tsconfig.json --noEmit
packages/imports typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/api typecheck$ tsc --noEmit
apps/web typecheck: Done
apps/api typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  675 passed (675)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  242 passed (242)
apps/web test:       Tests  2071 passed (2071)
      Tests  57 passed (57)
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      103 kB
103
$ tsc -p tsconfig.build.json
$ pnpm -r --if-present run typecheck
```

The `sad:test` line is the one without a package prefix (`B_sad`). `docs:check` ends with `6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific` and `[ELIFECYCLE] Command failed with exit code 1.`: those 6 failures are the baseline and stay at 6 until the end. `build-routes.sh` prints `exit 0` and the Middleware line (`M0`, written to `.tmp/s6b/m0`; 103 kB in the cloud container, 102 kB in the planning and pre-flight containers: the Middleware row of every later build must equal `M0`, whatever the number). pnpm may echo `$ tsc ...` lines between them. The package figures above are `B_config`, `B_shared`, `B_imports`, `B_api` and `B_web`; they are the S5b tip's own counts, so record yours; a different count means another slice sits below this one.

```bash
F=apps/web/src
git ls-files $F/features/reports | wc -l
git ls-files $F/features/projects/budget-module | wc -l
wc -l $F/lib/services/core-feature-client.ts $F/lib/services/pathways-client.ts $F/lib/services/core-feature-client.test.ts $F/lib/services/report-sections.ts $F/features/reports/reporting-workspace.tsx $F/features/reports/live-reporting-workspace.tsx $F/features/projects/live-evaluation-workspace.tsx
node .tmp/s6b/count-calls.mjs --list
M=$(node -e "import('./.tmp/s6b/client-blocks.mjs').then((m) => console.log(m.allMembers.join(' ')))")
echo $M | wc -w
node .tmp/s6b/mock-scan.mjs lib/services/core-feature-client $M
node .tmp/s6b/mock-scan.mjs lib/services/pathways-client getBeneficiaryAssessments
git grep -l "coreDataClient" -- $F | wc -l
git grep -n "report-sections" -- $F | wc -l
git grep -n "features/reports" -- $F | grep -v "^$F/features/reports/" | wc -l
git hash-object $F/lib/services/core-feature-client.ts $F/lib/services/core-feature-client.test.ts $F/lib/services/report-sections.ts $F/features/reports/reporting-workspace.tsx $F/features/reports/live-reporting-workspace.tsx $F/features/projects/live-evaluation-workspace.tsx $F/features/projects/budget-module/budget-math.ts $F/features/projects/budget-module/use-budget-module.ts $F/features/projects/activity-expense-dialog.tsx $F/lib/api/core/request.ts | cut -c1-8
```

Expected: the counts and hashes the plan rests on (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT):

```
18
15
   529 apps/web/src/lib/services/core-feature-client.ts
   407 apps/web/src/lib/services/pathways-client.ts
   627 apps/web/src/lib/services/core-feature-client.test.ts
   103 apps/web/src/lib/services/report-sections.ts
  1123 apps/web/src/features/reports/reporting-workspace.tsx
   549 apps/web/src/features/reports/live-reporting-workspace.tsx
   532 apps/web/src/features/projects/live-evaluation-workspace.tsx
  3870 total
production features/beneficiaries/profile/components/beneficiary-detail-loader.tsx: 2
production features/dashboard/role-overview/use-project-extras.ts: 1
production features/projects/activities/hooks/use-activity-expenses.ts: 3
production features/projects/activity-expense-dialog.tsx: 2
production features/projects/activity-expense-review-dialog.tsx: 1
production features/projects/budget-module/budget-actions.tsx: 5
production features/projects/budget-module/expense-review-drawer.tsx: 3
production features/projects/budget-module/use-budget-module.ts: 2
production features/projects/components/evidence-view.tsx: 1
production features/projects/components/project-review-workspace.tsx: 1
production features/projects/live-evaluation-workspace.tsx: 6
production features/reports/live-reporting-workspace.tsx: 5
test lib/services/core-feature-client.test.ts: 32
test lib/services/pathways-client.project-data.test.ts: 2
production calls 32 in 12 files
test calls 34 in 2 files
20
apps/web/src/features/projects/activities/components/project-activities-workspace.test.tsx:99 budgets, expenses, budgetReferences
apps/web/src/features/projects/activity-expense-dialog.test.tsx:25 submitExpense, uploadReceipt
apps/web/src/features/projects/activity-expense-review-dialog.test.tsx:23 reviewExpense
apps/web/src/features/projects/live-evaluation-workspace.test.tsx:61 createEvaluation, saveEvaluationScores, submitEvaluation, returnEvaluation, signoffEvaluation
apps/web/src/features/reports/live-reporting-workspace.test.tsx:53 reportPreview, generateReport
factories 19, naming 5
factories 52, naming 0
22
7
15
54cbb9b4
9839f568
08da016a
9628721d
4bfb8f1c
5f78dfeb
8c889288
cf61694c
5079a910
55c5485c
```

In order: 18 files in `features/reports` and 15 in `features/projects/budget-module`; the line counts (`core-feature-client.ts` 529 and `pathways-client.ts` 407); the call counts (32 production calls in 12 files, 34 test calls in 2 files) with the per-file list; the 20 moved members; the five `core-feature-client` factories that name a moved member (`factories 19, naming 5`) and none for `pathwaysClient` (`naming 0`; its factory count is 52); 22 files naming `coreDataClient`; 7 mentions of `report-sections`; 15 lines naming `features/reports` from outside it; the ten file hash prefixes.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s6b-finance-reports-web.md docs/superpowers/plans/$(date +%F)-modularization-s6b-finance-reports-web.md`. The handoff copy and its index row stay. No plan copy is removed here or anywhere in this slice: the S6 plan copy and its index row, and the S3b, S4, S4b, S4c, S5 and S5b copies, stay listed until the controller removes them after the final merge.

In `docs/index.md` section 1.6, add one row after the S6 plan row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s6b-finance-reports-web.md docs/superpowers/plans/$D-modularization-s6b-finance-reports-web.md
sed -i "/(superpowers\/plans\/[^)]*modularization-s6-finance-reports/a | [S6b finance and reports web plan](superpowers/plans/$D-modularization-s6b-finance-reports-web.md) | $D-modularization-s6b-finance-reports-web.md | $D | S6b of the codebase modularization: dead reporting workspace removed, finance, evaluation and report clients, budget, evaluation and reports feature layout; S6c outline | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -m "docs: add the S6b finance and reports web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one added row, the same 6 baseline docs failures and a commit of two files:

```
+| [S6b finance and reports web plan](superpowers/plans/<date>-modularization-s6b-finance-reports-web.md) | <date>-modularization-s6

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S6b finance and reports web plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/<date>-modularization-s6b-finance-reports-web.md
```

The row line is cut at 140 characters by the command, and `<n>` is the plan length plus one. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).


---

### Task 1: Delete the production-dead reporting workspace

**Files:**
- Create (gitignored): `.tmp/s6b/dead-exports.mjs`, `test-titles.mjs`, `cut-types.mjs`, `replace-exact.mjs`, `task1-edits.json`
- Delete: `apps/web/src/features/reports/reporting-workspace.tsx` and `.test.tsx`, `survey-report-overview.tsx` and `.test.tsx`, `survey-report-utils.ts` and `.test.ts`
- Modify: `apps/web/src/types/pathways.ts` (11 declarations), `apps/web/src/lib/rbac/policy.ts` (`reportKindPermissions`), `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (three entries), `docs/qad-pathways.md` (QAD-T18)

**Interfaces:**
- Consumes: the Task 0 tree.
- Produces: no `reporting-workspace`, `survey-report-overview` or `survey-report-utils` file, no `reportKindPermissions` and no unused report or survey type; QAD-T18 cites `analytics-dashboard.test.tsx`.

- [ ] **Step 1: Create the two scan scripts**

Create each file with the Write tool, exactly as printed. `.tmp/s6b/dead-exports.mjs` lists exported web names that no other file mentions and that their own file does not use again (it shows what a deletion strands):

Create `.tmp/s6b/dead-exports.mjs`:

```js
// Lists exported web names that no other file mentions and that their own file does not use again.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const web = path.resolve('apps/web/src')

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const files = walk(web).map((file) => ({
  rel: path.relative(web, file).split(path.sep).join('/'),
  text: readFileSync(file, 'utf8'),
}))
const declaration = /^export (?:default )?(?:async )?(?:const|let|function|class|type|interface|enum) ([A-Za-z_$][\w$]*)/gm
const dead = []
for (const file of files) {
  if (/\.test\.tsx?$/.test(file.rel) || file.rel.startsWith('app/') || file.rel.startsWith('test/')) continue
  for (const match of file.text.matchAll(declaration)) {
    const name = match[1]
    const pattern = `\\b${name.replace('$', '\\$')}\\b`
    const outside = files.some((other) => other !== file && new RegExp(pattern).test(other.text))
    const inside = (file.text.match(new RegExp(pattern, 'g')) ?? []).length > 1
    if (!outside && !inside) dead.push(`${file.rel} ${name}`)
  }
}
console.log(dead.sort().join('\n'))
console.log(`dead exports ${dead.length}`)
```

`.tmp/s6b/test-titles.mjs` runs test files and saves the sorted titles of their tests (`it.each` rows included), or compares two saved lists and prints every title that lost a row:

Create `.tmp/s6b/test-titles.mjs`:

```js
// Runs the given web test files and writes the sorted titles of their tests (it.each rows included) to a JSON file, or compares two such files.
// Usage: test-titles.mjs save <out.json> <test file>...   |   test-titles.mjs compare <before.json> <after.json> [--allow <title>...]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, a, b, ...rest] = process.argv.slice(2)
const count = (titles) => titles.reduce((map, title) => map.set(title, (map.get(title) ?? 0) + 1), new Map())

if (mode === 'save') {
  const files = [b, ...rest].filter(Boolean).map((file) => file.replace(/^apps\/web\//, ''))
  const out = `${a}.raw`
  try {
    execFileSync('pnpm', ['--filter', '@pathways/web', 'exec', 'vitest', 'run', ...files, '--reporter=json', `--outputFile=${process.cwd()}/${out}`], { stdio: 'ignore' })
  } catch {
    // A failing run still writes its report; the caller reads the failure count.
  }
  const report = JSON.parse(readFileSync(out, 'utf8'))
  const titles = report.testResults.flatMap((file) => file.assertionResults.map((test) => test.title)).sort()
  writeFileSync(a, JSON.stringify(titles, null, 1))
  console.log(`files ${report.testResults.length}, tests ${titles.length}, failed ${report.numFailedTests}`)
} else {
  const before = count(JSON.parse(readFileSync(a, 'utf8')))
  const after = count(JSON.parse(readFileSync(b, 'utf8')))
  const allow = new Set(rest.slice(rest.indexOf('--allow') + 1))
  const lost = []
  const added = []
  for (const [title, n] of before) if ((after.get(title) ?? 0) < n && !allow.has(title)) lost.push(`${title} (${n} -> ${after.get(title) ?? 0})`)
  for (const [title, n] of after) if (n > (before.get(title) ?? 0)) added.push(`${title} (${before.get(title) ?? 0} -> ${n})`)
  if (lost.length) console.log(`lost:\n${lost.join('\n')}`)
  if (process.argv.includes('--list-added')) console.log(`added:\n${added.join('\n')}`)
  console.log(`before ${[...before.values()].reduce((x, y) => x + y, 0)}, after ${[...after.values()].reduce((x, y) => x + y, 0)}, lost ${lost.length}, added ${added.length}`)
  process.exitCode = lost.length ? 1 : 0
}
```

- [ ] **Step 2: Scan and record the titles before the deletion**

Confirm first that nothing but the dead chain imports the three files, and that a live screen renders the survey table QAD-T18 describes:

```bash
F=apps/web/src
git grep -nE "/reporting-workspace'|/survey-report-overview'|/survey-report-utils'|reportKindPermissions" -- $F | grep -v "^$F/features/reports/\(reporting-workspace\|survey-report\)" | cut -c1-150
git grep -n "activity titles instead of raw IDs\|survey mean pre/post in % and mean change in pp\|timeline percentages with %" -- $F/features/analytics/analytics-dashboard.test.tsx | cut -c1-170
node .tmp/s6b/dead-exports.mjs > .tmp/s6b/dead-before.txt
cat .tmp/s6b/dead-before.txt
node .tmp/s6b/test-titles.mjs save .tmp/s6b/titles-dead.json $F/features/reports/reporting-workspace.test.tsx $F/features/reports/survey-report-overview.test.tsx $F/features/reports/survey-report-utils.test.ts $F/features/ui-copy-cleanup.contract.test.ts
```

Expected: the live-import scan, the analytics cases, the five dead exports that exist before the change (`ImportBatchStatus` and `ImportRowsPage` are S5b leftovers that this slice leaves alone), and the title count of the four test files:

```
apps/web/src/import-direction.test.ts:131:      "import { f } from '@/features/reports/reporting-workspace'",
apps/web/src/lib/rbac/policy.ts:13:export const reportKindPermissions = {
apps/web/src/features/analytics/analytics-dashboard.test.tsx:1102:    it('renders survey metric cards, chart and per-activity table, with activity titles instead of raw I
apps/web/src/features/analytics/analytics-dashboard.test.tsx:1149:    it('labels survey mean pre/post in % and mean change in pp, never %', async () => {
apps/web/src/features/analytics/analytics-dashboard.test.tsx:1189:    it('labels timeline percentages with % and leaves day and count cells unitless', async () => {
components/layout/protected-route.tsx FeatureDirectory
types/pathways.ts BeneficiaryMediaReservedFile
types/pathways.ts ExpenseRecord
types/pathways.ts ImportBatchStatus
types/pathways.ts ImportRowsPage
dead exports 5
files 4, tests 42, failed 0
```

The first command prints only the sample specifier string in `import-direction.test.ts` (a fixture for the import check, not an import) and the policy line that declares `reportKindPermissions`; no file imports a deleted module. The second prints the three analytics cases. A live import, or a missing analytics case, means the deletion is not safe: stop and report NEEDS_CONTEXT.

- [ ] **Step 3: Delete the files and the declarations they strand**

`.tmp/s6b/cut-types.mjs` removes named interface and type declarations from `types/pathways.ts`:

Create `.tmp/s6b/cut-types.mjs`:

```js
// Removes named interface and type declarations (exported or not) from apps/web/src/types/pathways.ts and prints the lines each cut.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/types/pathways.ts'
let text = readFileSync(file, 'utf8')
for (const name of process.argv.slice(2)) {
  const start = text.search(new RegExp(`^(?:export )?(?:interface|type) ${name}\\b`, 'm'))
  if (start < 0) throw new Error(`missing declaration ${name}`)
  const tail = text.slice(start)
  const end = /^(?:export )?interface /.test(tail) ? tail.indexOf('\n}\n') + 3 : tail.search(/\n\n|\n(?=(?:export )?(?:interface|type) )/) + 1
  const block = tail.slice(0, end)
  text = text.slice(0, start) + text.slice(start + end).replace(/^\n/, '')
  console.log(`${name}: ${block.split('\n').length - 1} lines`)
}
writeFileSync(file, text)
```

`.tmp/s6b/replace-exact.mjs` applies a list of exact text replacements and fails unless each one matches the stated number of times (Tasks 1, 3, 4 and 5 use it):

Create `.tmp/s6b/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s6b/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
import { readFileSync, writeFileSync } from 'node:fs'

const edits = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const texts = new Map()
for (const [file, from, to, count] of edits) {
  const text = texts.get(file) ?? readFileSync(file, 'utf8')
  const found = text.split(from).length - 1
  if (found !== count) throw new Error(`${file}: expected ${count} of ${JSON.stringify(from)}, found ${found}`)
  texts.set(file, text.replaceAll(from, to))
}
for (const [file, text] of texts) writeFileSync(file, text)
console.log(`${edits.length} replacements in ${texts.size} files`)
```

`.tmp/s6b/task1-edits.json` removes `reportKindPermissions` and the three contract entries that name the deleted workspace, and repoints QAD-T18:

Create `.tmp/s6b/task1-edits.json`:

```json
[
 [
  "apps/web/src/lib/rbac/policy.ts",
  "export const reportKindPermissions = {\n  'project-summary': 'reports.project_summary.view',\n  'indicator-summary': 'reports.indicator_summary.view',\n  'beneficiary-summary': 'reports.beneficiary_summary.view',\n  'survey-results': 'reports.view',\n} as const\n",
  "",
  1
 ],
 [
  "apps/web/src/features/ui-copy-cleanup.contract.test.ts",
  "  [\n    'features/reports/reporting-workspace.tsx',\n    'Build, preview, retain, and export project, indicator, beneficiary, and aggregate survey reports.',\n  ],\n",
  "",
  1
 ],
 [
  "apps/web/src/features/ui-copy-cleanup.contract.test.ts",
  "    ['features/reports/reporting-workspace.tsx', \"indicator.target ?? 'None yet'\"],\n",
  "",
  1
 ],
 [
  "docs/qad-pathways.md",
  "`apps/web/src/features/reports/survey-report-utils.test.ts`",
  "`apps/web/src/features/analytics/analytics-dashboard.test.tsx`",
  1
 ]
]
```

```bash
F=apps/web/src
git rm -q $F/features/reports/reporting-workspace.tsx $F/features/reports/reporting-workspace.test.tsx $F/features/reports/survey-report-overview.tsx $F/features/reports/survey-report-overview.test.tsx $F/features/reports/survey-report-utils.ts $F/features/reports/survey-report-utils.test.ts
node .tmp/s6b/dead-exports.mjs > .tmp/s6b/dead-after.txt
diff .tmp/s6b/dead-before.txt .tmp/s6b/dead-after.txt
node .tmp/s6b/cut-types.mjs ReportRecord ReportColumnConfig SurveyFormDefinition SurveyAggregateResultSet SurveyDemographicAggregate SurveyFormFieldDefinition SurveyQuestionAggregate SurveyCategoricalAggregate SurveyNumericAggregate SurveyFormFieldType SurveyAggregateCount
node .tmp/s6b/replace-exact.mjs .tmp/s6b/task1-edits.json
pnpm exec biome check --write $F/types/pathways.ts $F/lib/rbac/policy.ts $F/features/ui-copy-cleanup.contract.test.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
node .tmp/s6b/dead-exports.mjs | diff .tmp/s6b/dead-before.txt -
git checkout -- apps/web/next-env.d.ts
git add -N apps docs
git diff HEAD --stat | tail -4
```

Expected: the six files are removed, the first diff shows what they strand, the cuts and edits apply, and the second scan is empty:

```
1a2
> lib/rbac/policy.ts reportKindPermissions
6c7,11
< dead exports 5
---
> types/pathways.ts ReportColumnConfig
> types/pathways.ts ReportRecord
> types/pathways.ts SurveyAggregateResultSet
> types/pathways.ts SurveyFormDefinition
> dead exports 10
ReportRecord: 6 lines
ReportColumnConfig: 5 lines
SurveyFormDefinition: 11 lines
SurveyAggregateResultSet: 12 lines
SurveyDemographicAggregate: 4 lines
SurveyFormFieldDefinition: 10 lines
SurveyQuestionAggregate: 1 lines
SurveyCategoricalAggregate: 6 lines
SurveyNumericAggregate: 9 lines
SurveyFormFieldType: 1 lines
SurveyAggregateCount: 4 lines
4 replacements in 3 files
Checked 3 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 apps/web/src/lib/rbac/policy.ts                    |    6 -
 apps/web/src/types/pathways.ts                     |   80 --
 docs/qad-pathways.md                               |    2 +-
 10 files changed, 1 insertion(+), 1838 deletions(-)
```

The first diff shows what the six deletions strand (`reportKindPermissions` and four types; the other seven types are used only by those four). After the cuts and edits, the second `dead-exports` diff is empty, `--noUnusedLocals` lists only the two baseline lines, and the deletions total 1837 lines in nine files plus the one QAD line.

- [ ] **Step 4: Verify the suite and every deleted test title**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
node .tmp/s6b/test-titles.mjs save .tmp/s6b/titles-after1.json apps/web/src/features/ui-copy-cleanup.contract.test.ts
node .tmp/s6b/test-titles.mjs compare .tmp/s6b/titles-dead.json .tmp/s6b/titles-after1.json
```

Expected: the typecheck is clean, lint is clean, the suite is `B_web` minus 3 files and 18 tests, and the comparison lists exactly the 18 deleted titles:

```
web typecheck clean
Checked 1400 files in <ms>. No fixes applied.
 Test Files  239 passed (239)
      Tests  2053 passed (2053)
files 1, tests 24, failed 0
lost:
builds aggregate question rows without Beneficiary identity fields (1 -> 0)
derives internally connected filter options from form metadata and result sets (1 -> 0)
does not fetch Indicators for a Project Summary (1 -> 0)
keeps Grant Manager authorized without issuing its forbidden Indicator read (1 -> 0)
keeps aggregate counts and metadata relationships internally consistent (1 -> 0)
limits Grant Manager Survey/Form filters to visible project scope (1 -> 0)
limits Monitoring and Evaluation Officer Survey/Form filters to visible project scope (1 -> 0)
limits Program Manager Survey/Form filters to visible project scope (1 -> 0)
limits Project Manager Survey/Form filters to visible project scope (1 -> 0)
limits Project Officer Survey/Form filters to visible project scope (1 -> 0)
limits System Administrator Survey/Form filters to visible project scope (1 -> 0)
loads Indicators only for an authorized active Indicator Summary (1 -> 0)
removes the approved description from features/reports/reporting-workspace.tsx (1 -> 0)
returns an empty report when no aggregate result matches (1 -> 0)
selects and resolves the first connected aggregate result (1 -> 0)
shows the exact response date as a medium UTC calendar day (1 -> 0)
shows the project start and end dates as medium UTC calendar days (1 -> 0)
uses "None yet" for a genuinely empty value in features/reports/reporting-workspace.tsx (1 -> 0)
before 42, after 24, lost 18, added 0
```

The web suite loses three files and 18 tests (`B_web` minus 3 files and 18 tests). The 18 titles are exactly the tests of the deleted code: 4 of `reporting-workspace.test.tsx` (three Indicator read cases and the project dates case), 1 of `survey-report-overview.test.tsx` (the response date), 11 of `survey-report-utils.test.ts` (the filter, aggregate and empty-report cases) and 2 rows of the UI copy contract that name `reporting-workspace.tsx`. `compare` exits 1 because titles were lost on purpose; any title outside this list is a real loss: stop and report NEEDS_CONTEXT.

- [ ] **Step 5: Commit**

```bash
git add -A apps docs
git commit -m "refactor(web): delete the production-dead reporting workspace and its helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the commit holds the nine deleted or edited code files and the QAD line:

```
[<branch> <sha>] refactor(web): delete the production-dead reporting workspace and its helpers
 10 files changed, 1 insertion(+), 1838 deletions(-)
 delete mode 100644 apps/web/src/features/reports/reporting-workspace.test.tsx
 delete mode 100644 apps/web/src/features/reports/reporting-workspace.tsx
 delete mode 100644 apps/web/src/features/reports/survey-report-overview.test.tsx
 delete mode 100644 apps/web/src/features/reports/survey-report-overview.tsx
 delete mode 100644 apps/web/src/features/reports/survey-report-utils.test.ts
 delete mode 100644 apps/web/src/features/reports/survey-report-utils.ts
```


---

### Task 2: The three clients, with tests that run against the old and the new code

**Files:**
- Create (gitignored): `.tmp/s6b/build-clients.mjs`, `moved-original.mjs`, `same-lines.mjs`
- Create: `apps/web/src/lib/api/core/owned-json-read.ts`, `finance.ts`, `evaluations.ts`, `evaluations.schema.ts`, `reports.ts`
- Create: `apps/web/src/lib/api/finance.test.ts`, `evaluations.test.ts`, `reports.test.ts`

**Interfaces:**
- Consumes: the members still in `core-feature-client.ts` and `pathways-client.ts`, and the S6a request contracts from `@pathways/shared`.
- Produces: `financeClient`, `evaluationsClient`, `reportsClient`, `ownedJsonRead`, `ownedJsonPost`, `projectPath`, `parseAssessmentSummaries`; no caller uses them yet and the old members are untouched.

- [ ] **Step 1: Generate the client modules and prove no line was lost**

Create each file with the Write tool, exactly as printed. `.tmp/s6b/build-clients.mjs` cuts the member blocks, the schemas and the owned read out of the two client files as they stand and writes the five modules, swapping only the helper names (`read` to `ownedJsonRead`, `post` to `ownedJsonPost`, `path(id)` to `projectPath(id)`) and the request body types (ruling 3):

Create `.tmp/s6b/build-clients.mjs`:

```js
// Writes the lib/api finance, evaluation and report modules and the owned JSON read from the code still in core-feature-client.ts and pathways-client.ts, with the contract type names swapped in.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  constBlock,
  coreFile,
  functionBlock,
  groups,
  memberBlock,
  methodBlock,
  pathwaysFile,
} from './client-blocks.mjs'

const core = readFileSync(coreFile, 'utf8')
const pathways = readFileSync(pathwaysFile, 'utf8')

// Replaces every occurrence of each pair, throwing when a pair never matches.
function swap(text, pairs) {
  let result = text
  for (const [from, to] of pairs) {
    if (!result.includes(from)) throw new Error(`missing text: ${from.slice(0, 50)}`)
    result = result.replaceAll(from, to)
  }
  return result
}

const consts = (...names) => names.map((name) => constBlock(core, name).trimEnd()).join('\n')
const renames = [
  ['read(', 'ownedJsonRead('],
  ['post(', 'ownedJsonPost('],
  ['path(id)', 'projectPath(id)'],
]
const client = (name, members, pairs) =>
  `export const ${name} = {\n${swap(members.map((member) => memberBlock(core, member)).join(''), [...renames, ...pairs])}}\n`

// Owned JSON read and post, with the project path helper they share.
const read = swap(functionBlock(core, 'read'), [
  ['async function read<', 'export async function ownedJsonRead<'],
])
const post = swap(constBlock(core, 'post').trimEnd(), [
  ['const post =', 'export const ownedJsonPost ='],
  ['  read(', '  ownedJsonRead('],
])
writeFileSync(
  'apps/web/src/lib/api/core/owned-json-read.ts',
  `import { z } from 'zod'

import { PathwaysClientError, requestFoundationResponse } from './request'
import { captureRequestOwner } from './request-owner'

// Reads one JSON response under the owner, size and format checks of an owned request, then validates it.
${read}
const uuid = z.string().uuid()
// The project path of a request, refusing an id that is not a UUID before any request is made.
export const projectPath = (id: string) => \`/projects/\${uuid.parse(id)}\`
// Posts a JSON body through the owned read.
${post}
`,
)

const [finance, evaluations, reports] = groups
const financeBody = client(finance.client, finance.members, [
    ['createBudget: (id: string, body: unknown)', 'createBudget: (id: string, body: CreateBudgetRequest)'],
    [
      'replaceBudget: (id: string, budgetId: string, body: unknown)',
      'replaceBudget: (id: string, budgetId: string, body: ReplaceBudgetRequest)',
    ],
    ['submitExpense: (id: string, body: unknown)', 'submitExpense: (id: string, body: SubmitExpenseRequest)'],
    [
      'reviewExpense: (id: string, expenseId: string, body: unknown)',
      'reviewExpense: (id: string, expenseId: string, body: ReviewExpenseRequest)',
    ],
  ])
writeFileSync(
  'apps/web/src/lib/api/finance.ts',
  `import type {
  CreateBudgetRequest,
  ReplaceBudgetRequest,
  ReviewExpenseRequest,
  SubmitExpenseRequest,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

${consts('uuid', 'timestamp', 'decimal', 'budgetSchema', 'expenseSchema')}
${constBlock(core, 'expenseAck').trimEnd().replace('export const expenseAck', 'const expenseAck')}
${financeBody}`,
)

const assessmentMethod = methodBlock(pathways, 'getBeneficiaryAssessments').replace(/\n {2}\}\n$/, '\n  },\n')
const evaluationBody = client(evaluations.client, evaluations.members, [
  [
    'createEvaluation: (id: string, body: unknown)',
    'createEvaluation: (id: string, body: CreateEvaluationRequest)',
  ],
  [
    'saveEvaluationScores: (id: string, evaluationId: string, body: unknown)',
    'saveEvaluationScores: (id: string, evaluationId: string, body: SaveEvaluationScoresRequest)',
  ],
  [
    'submitEvaluation: (id: string, evaluationId: string, body: unknown)',
    'submitEvaluation: (id: string, evaluationId: string, body: SubmitEvaluationRequest)',
  ],
  [
    'returnEvaluation: (id: string, evaluationId: string, body: unknown)',
    'returnEvaluation: (id: string, evaluationId: string, body: ReturnEvaluationRequest)',
  ],
  [
    'signoffEvaluation: (id: string, evaluationId: string, body: unknown)',
    'signoffEvaluation: (id: string, evaluationId: string, body: SignOffEvaluationRequest)',
  ],
]).replace(/\}\n$/, `${assessmentMethod}}\n`)
writeFileSync(
  'apps/web/src/lib/api/evaluations.ts',
  `import type {
  CreateEvaluationRequest,
  ReturnEvaluationRequest,
  SaveEvaluationScoresRequest,
  SignOffEvaluationRequest,
  SubmitEvaluationRequest,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { requestFoundation } from '@/lib/api/core/request'
import { type AssessmentSummary, parseAssessmentSummaries } from './evaluations.schema'

${consts('uuid', 'timestamp', 'decimal', 'criterionSchema', 'evaluationPersonSchema', 'criterionSnapshotSchema', 'evaluationScoreSchema', 'evaluationDetailSchema', 'evaluationSchema')}
${evaluationBody}`,
)

const assessmentTop = [
  /export interface AssessmentDetail \{[\s\S]*?\n\}\n/.exec(pathways)?.[0],
  /const assessmentTypes = new Set\(\[[\s\S]*?\]\)\n/.exec(pathways)?.[0],
  /const isNullableString = [^\n]*\n/.exec(pathways)?.[0],
  /export type AssessmentSummary = Omit<[\s\S]*?\n\}\n/.exec(pathways)?.[0],
  /function parseAssessmentSummaries\([\s\S]*?\n\}\n/.exec(pathways)?.[0],
]
if (assessmentTop.some((block) => !block)) throw new Error('missing assessment declaration')
writeFileSync(
  'apps/web/src/lib/api/evaluations.schema.ts',
  `import { PathwaysClientError } from '@/lib/api/core/request'

${assessmentTop.join('\n').replace('function parseAssessmentSummaries', 'export function parseAssessmentSummaries')}`,
)

const inlineBody =
  'body: {\n      clientRequestId: string\n      name: string\n      kind: z.infer<typeof reportKind>\n      format: z.infer<typeof reportFormat>\n      formId?: string\n      evaluationId?: string\n    },'
writeFileSync(
  'apps/web/src/lib/api/reports.ts',
  `import { type GenerateReportRequest, reportKinds } from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { reportSectionsSchema } from '@/lib/services/report-sections'

${consts('uuid', 'timestamp', 'decimal', 'dateOnly', 'reportKind', 'reportFormat', 'reportPreviewSchema', 'reportSchema', 'evaluationRoundSchema')}
${client(reports.client, reports.members, [[inlineBody, 'body: GenerateReportRequest,']])}`,
)
console.log('wrote 5 modules')
```

`.tmp/s6b/moved-original.mjs` composes the original blocks (the same cuts, with only the body types swapped) into one reference file for the line comparison:

Create `.tmp/s6b/moved-original.mjs`:

```js
// Writes the moved members, schemas and helpers as they stand in core-feature-client.ts and pathways-client.ts to one file so same-lines.mjs can compare them with the new lib/api modules.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  constBlock,
  coreFile,
  functionBlock,
  groups,
  memberBlock,
  methodBlock,
  pathwaysFile,
} from './client-blocks.mjs'

const [out] = process.argv.slice(2)
const core = readFileSync(coreFile, 'utf8')
const pathways = readFileSync(pathwaysFile, 'utf8')

// The request body types that the move replaces by contract names are compared in their replaced form.
const bodyTypes = [
  ['createBudget: (id: string, body: unknown)', 'createBudget: (id: string, body: CreateBudgetRequest)'],
  [
    'replaceBudget: (id: string, budgetId: string, body: unknown)',
    'replaceBudget: (id: string, budgetId: string, body: ReplaceBudgetRequest)',
  ],
  ['submitExpense: (id: string, body: unknown)', 'submitExpense: (id: string, body: SubmitExpenseRequest)'],
  [
    'reviewExpense: (id: string, expenseId: string, body: unknown)',
    'reviewExpense: (id: string, expenseId: string, body: ReviewExpenseRequest)',
  ],
  [
    'createEvaluation: (id: string, body: unknown)',
    'createEvaluation: (id: string, body: CreateEvaluationRequest)',
  ],
  [
    'saveEvaluationScores: (id: string, evaluationId: string, body: unknown)',
    'saveEvaluationScores: (id: string, evaluationId: string, body: SaveEvaluationScoresRequest)',
  ],
  [
    'submitEvaluation: (id: string, evaluationId: string, body: unknown)',
    'submitEvaluation: (id: string, evaluationId: string, body: SubmitEvaluationRequest)',
  ],
  [
    'returnEvaluation: (id: string, evaluationId: string, body: unknown)',
    'returnEvaluation: (id: string, evaluationId: string, body: ReturnEvaluationRequest)',
  ],
  [
    'signoffEvaluation: (id: string, evaluationId: string, body: unknown)',
    'signoffEvaluation: (id: string, evaluationId: string, body: SignOffEvaluationRequest)',
  ],
  [
    'body: {\n      clientRequestId: string\n      name: string\n      kind: z.infer<typeof reportKind>\n      format: z.infer<typeof reportFormat>\n      formId?: string\n      evaluationId?: string\n    },',
    'body: GenerateReportRequest,',
  ],
]
const clients = groups.map(
  (group) =>
    `const ${group.client} = {\n${group.members.map((member) => memberBlock(core, member)).join('')}${
      group.client === 'evaluationsClient'
        ? methodBlock(pathways, 'getBeneficiaryAssessments').replace(/\n {2}\}\n$/, '\n  },\n')
        : ''
    }}\n`,
)
const consts = [
  'uuid',
  'timestamp',
  'decimal',
  'dateOnly',
  'budgetSchema',
  'expenseSchema',
  'expenseAck',
  'reportKind',
  'reportFormat',
  'reportPreviewSchema',
  'reportSchema',
  'evaluationRoundSchema',
  'criterionSchema',
  'evaluationPersonSchema',
  'criterionSnapshotSchema',
  'evaluationScoreSchema',
  'evaluationDetailSchema',
  'evaluationSchema',
  'post',
].map((name) => constBlock(core, name))
const read = functionBlock(core, 'read')
const path = constBlock(core, 'path')
const assessment = [
  /export interface AssessmentDetail \{[\s\S]*?\n\}\n/,
  /const assessmentTypes = new Set\(\[[\s\S]*?\]\)\n/,
  /const isNullableString = [^\n]*\n/,
  /export type AssessmentSummary = Omit<[\s\S]*?\n\}\n/,
  /function parseAssessmentSummaries\([\s\S]*?\n\}\n/,
].map((pattern) => pattern.exec(pathways)?.[0])
if (assessment.some((block) => !block)) throw new Error('missing assessment declaration')
const text = `${read}${path}${consts.join('')}${assessment.join('\n')}${clients.join('')}`
writeFileSync(out, bodyTypes.reduce((result, [from, to]) => result.replace(from, to), text))
console.log(`blocks written: ${groups.flatMap((group) => group.members).length + consts.length + 8}`)
```

`.tmp/s6b/same-lines.mjs` fails when a line of the original is lost and lists the lines the new files add:

Create `.tmp/s6b/same-lines.mjs`:

```js
// Fails when a line of the original is lost; counts the lines the new files add (signatures, props, calls) and lists them with --list.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const list = args.includes('--list')
const [original, ...rest] = args.filter((arg) => arg !== '--list')
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = rest.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// Declaration lines after the import block, trimmed, with renames undone and export keywords dropped.
const body = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(body(original))
const after = count(files.flatMap(body))
const lost = []
let added = 0
const addedLines = []
for (const [line, n] of before) if ((after.get(line) ?? 0) < n) lost.push(`${line} (${n} -> ${after.get(line) ?? 0})`)
for (const [line, n] of after) {
  const extra = n - (before.get(line) ?? 0)
  if (extra > 0) {
    added += extra
    addedLines.push(`${extra}x ${line}`)
  }
}
const total = [...before.values()].reduce((a, b) => a + b, 0)
if (lost.length) console.log(`lost lines:\n${lost.join('\n')}`)
if (list) console.log(addedLines.join('\n'))
console.log(`original lines ${total}, lost ${lost.length}, added ${added}`)
process.exitCode = lost.length ? 1 : 0
```

```bash
F=apps/web/src
node .tmp/s6b/test-titles.mjs save .tmp/s6b/titles-core-before.json $F/lib/services/core-feature-client.test.ts $F/lib/services/pathways-client.project-data.test.ts
node .tmp/s6b/build-clients.mjs
A=$F/lib/api
node .tmp/s6b/moved-original.mjs .tmp/s6b/files/moved-original.ts
node .tmp/s6b/same-lines.mjs .tmp/s6b/files/moved-original.ts $A/core/owned-json-read.ts $A/finance.ts $A/evaluations.ts $A/evaluations.schema.ts $A/reports.ts ownedJsonRead=read ownedJsonPost=post projectPath=path --list
pnpm exec biome check --write $A
wc -l $A/core/owned-json-read.ts $A/finance.ts $A/evaluations.ts $A/evaluations.schema.ts $A/reports.ts
```

Expected: the old titles are saved, the five modules are written, every original line is accounted for, and Biome has nothing left to report once it has formatted the five files (the `Checked` count is the `lib/api` file count):

```
files 2, tests 84, failed 0
wrote 5 modules
blocks written: 47
1x // Reads one JSON response under the owner, size and format checks of an owned request, then validates it.
3x const uuid = z.string().uuid()
1x // The project path of a request, refusing an id that is not a UUID before any request is made.
1x // Posts a JSON body through the owned read.
2x const timestamp = z.string().datetime({ offset: true })
2x const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
original lines 423, lost 0, added 10
Checked 44 files in <ms>. Fixed 2 files.
   54 apps/web/src/lib/api/core/owned-json-read.ts
  116 apps/web/src/lib/api/finance.ts
  140 apps/web/src/lib/api/evaluations.ts
   61 apps/web/src/lib/api/evaluations.schema.ts
  106 apps/web/src/lib/api/reports.ts
  477 total
```

`lost 0` is the pass condition: every line of the 20 members, the 14 schemas, the read, the post and the assessment parsers is in a new module. The added lines are the three comments written above the shared read helpers, and the schema constants (`uuid`, `timestamp`, `decimal`) that each of the three modules declares for its own schemas, as the original declared them once for all.

- [ ] **Step 2: Add the characterization tests**

Each test file defines its fictional fixtures, stubs `window`, `document`, `fetch` and the browser session so the real foundation fetch and the owned JSON read run, and runs the same cases against `coreDataClient` (or `pathwaysClient` for the assessment read) and the new client in a `describe.each`. The cases cover the path and encoded id, the method and body, the abort signal (only the reads pass it), a response with an unknown key (refused with `could not be validated`), a malformed project id (refused before any request) and, for reports, a report kind outside the catalog. They also pin what only the line comparison showed before: a malformed record id or time (refused before any request), every response bound of the schemas (row maxima, text maxima, enums, literals, decimals, timestamps, nullable fields and extra keys, one rejected and one accepted value each), the exact preview query, the identity checks (an acknowledgement, evaluation or preview that names another project, expense, evaluation, kind or form is refused), the optional report sections, and for the assessment read the encoded ids, the row bound and the keys it keeps. Each of these cases passes on the old and on the new code, and none may be dropped when Task 3 removes the old rows.

Create `apps/web/src/lib/api/finance.test.ts`:

```ts
import type {
  CreateBudgetRequest,
  ReplaceBudgetRequest,
  ReviewExpenseRequest,
  SubmitExpenseRequest,
} from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { coreDataClient } from '@/lib/services/core-feature-client'
import { financeClient } from './finance'

const authUserId = '78000000-0000-4000-8000-000000000001'
const organizationId = '78000000-0000-4000-8000-000000000002'
const userId = '78000000-0000-4000-8000-000000000003'
const projectId = '78000000-0000-4000-8000-000000000004'
const expenseId = '78000000-0000-4000-8000-000000000005'
const otherId = '78000000-0000-4000-8000-000000000006'
const budgetId = '78000000-0000-4000-8000-000000000009'
const updatedAt = '2026-09-27T00:00:00.000Z'
const acknowledgement = {
  id: expenseId,
  projectId,
  status: 'PENDING',
  updatedAt,
  receiptEvidenceId: null,
}
const budget = {
  id: budgetId,
  activityId: null,
  category: 'Training',
  currency: 'PHP',
  plannedBudget: '1000.00',
  remarks: null,
  updatedAt,
}
const expense = {
  id: expenseId,
  budgetRecordId: budgetId,
  description: 'Fictional delivery',
  amount: '125.00',
  expenseDate: '2026-09-01',
  status: 'PENDING',
  receiptEvidenceId: null,
  submittedById: userId,
  verifiedById: null,
  approvedById: null,
  updatedAt,
  signedOffById: null,
  signedOffAt: null,
  submittedByName: null,
  verifiedByName: null,
  approvedByName: null,
  signedOffByName: null,
}
const createBody: CreateBudgetRequest = { category: 'Training', plannedBudget: '1000.00' }
const replaceBody: ReplaceBudgetRequest = { ...createBody, expectedUpdatedAt: updatedAt }
const submitBody: SubmitExpenseRequest = {
  clientRequestId: otherId,
  budgetRecordId: budgetId,
  description: 'Fictional delivery',
  amount: '125.00',
  expenseDate: '2026-09-01',
}
const reviewBody: ReviewExpenseRequest = {
  expectedUpdatedAt: updatedAt,
  decision: 'VERIFY',
  stage: 'VERIFY',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The same cases run against the old coreDataClient and the new financeClient.
const clients = [
  ['coreDataClient', coreDataClient],
  ['financeClient', financeClient],
] as const
type Client = (typeof clients)[number][1]
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'budgets',
    (c, id, signal) => c.budgets(id, signal),
    '/finance/budgets',
    'GET',
    undefined,
    [budget],
    true,
  ],
  [
    'createBudget',
    (c, id) => c.createBudget(id, createBody),
    '/finance/budgets',
    'POST',
    JSON.stringify(createBody),
    { id: budgetId, updatedAt },
    false,
  ],
  [
    'replaceBudget',
    (c, id) => c.replaceBudget(id, budgetId, replaceBody),
    `/finance/budgets/${budgetId}`,
    'PATCH',
    JSON.stringify(replaceBody),
    { id: budgetId, updatedAt },
    false,
  ],
  [
    'expenses',
    (c, id, signal) => c.expenses(id, signal),
    '/finance/expenses',
    'GET',
    undefined,
    [expense],
    true,
  ],
  [
    'budgetReferences',
    (c, id, signal) => c.budgetReferences(id, signal),
    '/finance/expense-budget-references',
    'GET',
    undefined,
    [{ id: budgetId, category: 'Training', activityId: null }],
    true,
  ],
  [
    'submitExpense',
    (c, id) => c.submitExpense(id, submitBody),
    '/finance/expenses',
    'POST',
    JSON.stringify(submitBody),
    acknowledgement,
    false,
  ],
  [
    'reviewExpense',
    (c, id) => c.reviewExpense(id, expenseId, reviewBody),
    `/finance/expenses/${expenseId}/review`,
    'POST',
    JSON.stringify(reviewBody),
    acknowledgement,
    false,
  ],
  [
    'signoffExpense',
    (c, id) => c.signoffExpense(id, expenseId),
    `/finance/expenses/${expenseId}/signoff`,
    'POST',
    '{}',
    { expenseId, signedOffById: userId, signedOffAt: updatedAt },
    false,
  ],
  [
    'uploadReceipt',
    (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
    `/finance/expenses/${expenseId}/receipt`,
    'POST',
    expect.any(FormData),
    acknowledgement,
    false,
  ],
]

describe.each(clients)('%s requests', (_name, client) => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}${suffix}`)
      expect(init?.method ?? 'GET').toBe(method)
      expect(init?.body).toEqual(body)
      expect(init?.signal).toBe(readsSignal ? controller.signal : undefined)
    },
  )
  it.each(requests)(
    '%s rejects a response with an unknown key',
    async (_member, call, _suffix, _method, _body, response) => {
      fetcher.mockResolvedValueOnce(
        json(
          Array.isArray(response)
            ? response.map((row) => ({ ...row, extra: 'x' }))
            : { ...(response as object), extra: 'x' },
        ),
      )
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(client, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends a receipt as a multipart form without a JSON content type', async () => {
    fetcher.mockResolvedValueOnce(json(acknowledgement))
    await client.uploadReceipt(
      projectId,
      expenseId,
      updatedAt,
      new File(['synthetic'], 'receipt.pdf'),
    )
    const init = fetcher.mock.calls[0][1]
    const form = init?.body as FormData
    expect(form.get('expectedUpdatedAt')).toBe(updatedAt)
    expect((form.get('file') as File).name).toBe('receipt.pdf')
    expect(init?.headers).not.toHaveProperty('Content-Type')
  })
  it.each([
    ['replaceBudget', (c, id) => c.replaceBudget(id, 'not-a-uuid', replaceBody)],
    ['reviewExpense', (c, id) => c.reviewExpense(id, 'not-a-uuid', reviewBody)],
    ['signoffExpense', (c, id) => c.signoffExpense(id, 'not-a-uuid')],
    [
      'uploadReceipt',
      (c, id) =>
        c.uploadReceipt(id, 'not-a-uuid', updatedAt, new File(['synthetic'], 'receipt.pdf')),
    ],
    [
      'uploadReceipt time',
      (c, id) =>
        c.uploadReceipt(id, expenseId, 'yesterday', new File(['synthetic'], 'receipt.pdf')),
    ],
  ] as readonly (readonly [string, Call])[])(
    '%s refuses a malformed record id or time before any request',
    (_member, call) => {
      expect(() => call(client, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['more than 100 budgets', (c, id) => c.budgets(id), Array.from({ length: 101 }, () => budget)],
    [
      'more than 100 expenses',
      (c, id) => c.expenses(id),
      Array.from({ length: 101 }, () => expense),
    ],
    [
      'more than 100 budget references',
      (c, id) => c.budgetReferences(id),
      Array.from({ length: 101 }, () => ({ id: budgetId, category: 'Training', activityId: null })),
    ],
    [
      'a budget in a currency other than PHP',
      (c, id) => c.budgets(id),
      [{ ...budget, currency: 'USD' }],
    ],
    [
      'a planned budget that is not a decimal',
      (c, id) => c.budgets(id),
      [{ ...budget, plannedBudget: '1e3' }],
    ],
    [
      'an expense status outside the catalog',
      (c, id) => c.expenses(id),
      [{ ...expense, status: 'PAID' }],
    ],
    [
      'a person name over 200 characters',
      (c, id) => c.expenses(id),
      [{ ...expense, submittedByName: 'x'.repeat(201) }],
    ],
    [
      'an expense update time that is not a timestamp',
      (c, id) => c.expenses(id),
      [{ ...expense, updatedAt: 'yesterday' }],
    ],
    [
      'a budget create acknowledgement with a bad time',
      (c, id) => c.createBudget(id, createBody),
      { id: budgetId, updatedAt: 'yesterday' },
    ],
    [
      'an acknowledgement status outside the catalog',
      (c, id) => c.submitExpense(id, submitBody),
      { ...acknowledgement, status: 'PAID' },
    ],
    [
      'a receipt acknowledgement for another project',
      (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a submit acknowledgement for another project',
      (c, id) => c.submitExpense(id, submitBody),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a review acknowledgement for another project',
      (c, id) => c.reviewExpense(id, expenseId, reviewBody),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a review acknowledgement for another expense',
      (c, id) => c.reviewExpense(id, expenseId, reviewBody),
      { ...acknowledgement, id: otherId },
    ],
    [
      'a receipt acknowledgement for another expense',
      (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
      { ...acknowledgement, id: otherId },
    ],
    [
      'a sign-off for another expense',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId: otherId, signedOffById: userId, signedOffAt: updatedAt },
    ],
    [
      'a sign-off by a malformed person id',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId, signedOffById: 'someone', signedOffAt: updatedAt },
    ],
    [
      'a sign-off with a malformed time',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId, signedOffById: userId, signedOffAt: 'yesterday' },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'rejects %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it('accepts a rejected expense and exactly 100 budgets', async () => {
    const rejectedExpense = { ...expense, status: 'REJECTED' }
    fetcher.mockResolvedValueOnce(json([rejectedExpense]))
    await expect(client.expenses(projectId)).resolves.toEqual([rejectedExpense])
    fetcher.mockResolvedValueOnce(json(Array.from({ length: 100 }, () => budget)))
    await expect(client.budgets(projectId)).resolves.toHaveLength(100)
  })
})
```

Create `apps/web/src/lib/api/evaluations.test.ts`:

```ts
import type {
  CreateEvaluationRequest,
  ReturnEvaluationRequest,
  SaveEvaluationScoresRequest,
  SignOffEvaluationRequest,
  SubmitEvaluationRequest,
} from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { evaluationsClient } from './evaluations'

const authUserId = '78100000-0000-4000-8000-000000000001'
const organizationId = '78100000-0000-4000-8000-000000000002'
const userId = '78100000-0000-4000-8000-000000000003'
const projectId = '78100000-0000-4000-8000-000000000004'
const evaluationId = '78100000-0000-4000-8000-000000000008'
const otherId = '78100000-0000-4000-8000-000000000006'
const enrollmentId = '78100000-0000-4000-8000-000000000020'
const updatedAt = '2026-09-27T00:00:00.000Z'
const detail = {
  id: evaluationId,
  title: 'Mid-term',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt,
  evaluatedBy: null,
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [],
}
const createBody: CreateEvaluationRequest = {
  clientRequestId: otherId,
  title: 'Mid-term',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}
const scoresBody: SaveEvaluationScoresRequest = {
  expectedUpdatedAt: updatedAt,
  commentary: 'Fictional',
}
const submitBody: SubmitEvaluationRequest = { expectedUpdatedAt: updatedAt }
const returnBody: ReturnEvaluationRequest = { expectedUpdatedAt: updatedAt, reason: 'Fictional' }
const signoffBody: SignOffEvaluationRequest = {
  expectedUpdatedAt: updatedAt,
  feedback: 'Fictional',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The same cases run against the old coreDataClient and the new evaluationsClient.
const clients = [
  ['coreDataClient', coreDataClient],
  ['evaluationsClient', evaluationsClient],
] as const
type Client = (typeof clients)[number][1]
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'evaluation',
    (c, id, signal) => c.evaluation(id, signal),
    '/evaluation',
    'GET',
    undefined,
    { projectId, criteria: [], evaluations: [detail], hasMore: false },
    true,
  ],
  [
    'createEvaluation',
    (c, id) => c.createEvaluation(id, createBody),
    '/evaluation/evaluations',
    'POST',
    JSON.stringify(createBody),
    detail,
    false,
  ],
  [
    'saveEvaluationScores',
    (c, id) => c.saveEvaluationScores(id, evaluationId, scoresBody),
    `/evaluation/evaluations/${evaluationId}/scores`,
    'PATCH',
    JSON.stringify(scoresBody),
    detail,
    false,
  ],
  [
    'submitEvaluation',
    (c, id) => c.submitEvaluation(id, evaluationId, submitBody),
    `/evaluation/evaluations/${evaluationId}/submit`,
    'POST',
    JSON.stringify(submitBody),
    detail,
    false,
  ],
  [
    'returnEvaluation',
    (c, id) => c.returnEvaluation(id, evaluationId, returnBody),
    `/evaluation/evaluations/${evaluationId}/return`,
    'POST',
    JSON.stringify(returnBody),
    detail,
    false,
  ],
  [
    'signoffEvaluation',
    (c, id) => c.signoffEvaluation(id, evaluationId, signoffBody),
    `/evaluation/evaluations/${evaluationId}/signoff`,
    'POST',
    JSON.stringify(signoffBody),
    detail,
    false,
  ],
]

describe.each(clients)('%s requests', (_name, client) => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}${suffix}`)
      expect(init?.method ?? 'GET').toBe(method)
      expect(init?.body).toEqual(body)
      expect(init?.signal).toBe(readsSignal ? controller.signal : undefined)
    },
  )
  it.each(requests)(
    '%s rejects a response with an unknown key',
    async (_member, call, _suffix, _method, _body, response) => {
      fetcher.mockResolvedValueOnce(json({ ...(response as object), extra: 'x' }))
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(client, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['saveEvaluationScores', (c, id) => c.saveEvaluationScores(id, 'not-a-uuid', scoresBody)],
    ['submitEvaluation', (c, id) => c.submitEvaluation(id, 'not-a-uuid', submitBody)],
    ['returnEvaluation', (c, id) => c.returnEvaluation(id, 'not-a-uuid', returnBody)],
    ['signoffEvaluation', (c, id) => c.signoffEvaluation(id, 'not-a-uuid', signoffBody)],
  ] as readonly (readonly [string, Call])[])(
    '%s refuses a malformed evaluation id before any request',
    (_member, call) => {
      expect(() => call(client, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['saveEvaluationScores', (c, id) => c.saveEvaluationScores(id, evaluationId, scoresBody)],
    ['submitEvaluation', (c, id) => c.submitEvaluation(id, evaluationId, submitBody)],
    ['returnEvaluation', (c, id) => c.returnEvaluation(id, evaluationId, returnBody)],
    ['signoffEvaluation', (c, id) => c.signoffEvaluation(id, evaluationId, signoffBody)],
  ] as readonly (readonly [string, Call])[])(
    '%s rejects a response for another evaluation',
    async (_member, call) => {
      fetcher.mockResolvedValueOnce(json({ ...detail, id: otherId }))
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  const criterion = {
    id: otherId,
    code: 'REL',
    name: 'Relevance',
    description: null,
    type: 'OTHER',
    version: 1,
    weightPercentage: '60',
    maximumScore: '100',
    status: 'PUBLISHED',
    updatedAt,
  }
  const score = {
    criterionId: otherId,
    score: '50',
    maximumScore: '100',
    weightedScore: '30',
    source: 'manual',
    evidence: null,
    reason: null,
    note: null,
    criterion: {
      id: otherId,
      code: 'REL',
      version: 1,
      type: 'OTHER',
      name: 'Relevance',
      description: null,
      weight_percentage: '60',
      maximum_score: '100',
    },
  }
  const person = { id: userId, name: 'Fictional' }
  const populated = {
    projectId,
    criteria: [criterion],
    evaluations: [{ ...detail, scores: [score], evaluatedBy: person }],
    hasMore: false,
  }
  it('parses a populated evaluation read', async () => {
    fetcher.mockResolvedValueOnce(json(populated))
    await expect(client.evaluation(projectId)).resolves.toEqual(populated)
  })
  it.each([
    [
      'more than 20 evaluations',
      { ...populated, evaluations: Array.from({ length: 21 }, () => detail) },
    ],
    [
      'more than 100 criteria',
      { ...populated, criteria: Array.from({ length: 101 }, () => criterion) },
    ],
    [
      'more than 100 scores',
      {
        ...populated,
        evaluations: [{ ...detail, scores: Array.from({ length: 101 }, () => score) }],
      },
    ],
    [
      'a criterion type outside the catalog',
      { ...populated, criteria: [{ ...criterion, type: 'MADE_UP' }] },
    ],
    [
      'a criterion status outside the catalog',
      { ...populated, criteria: [{ ...criterion, status: 'MADE_UP' }] },
    ],
    [
      'a fractional criterion version',
      { ...populated, criteria: [{ ...criterion, version: 1.5 }] },
    ],
    [
      'a score source outside the catalog',
      { ...populated, evaluations: [{ ...detail, scores: [{ ...score, source: 'guess' }] }] },
    ],
    [
      'an evaluation status outside the catalog',
      { ...populated, evaluations: [{ ...detail, status: 'DONE' }] },
    ],
    [
      'a person reference with an extra key',
      { ...populated, evaluations: [{ ...detail, evaluatedBy: { ...person, email: 'x' } }] },
    ],
    ['a read for another project', { ...populated, projectId: otherId }],
    ['a response without hasMore', { projectId, criteria: [], evaluations: [] }],
  ])('rejects %s', async (_name, response) => {
    fetcher.mockResolvedValueOnce(json(response))
    await expect(client.evaluation(projectId)).rejects.toThrow('could not be validated')
  })
})

const assessment = {
  id: '78100000-0000-4000-8000-000000000021',
  type: 'PRE_TEST',
  activityId: null,
  stageId: null,
  score: '40',
  maximumScore: '50',
  assessmentDate: '2026-09-01',
  recordedAt: '2026-09-02T00:00:00.000Z',
}
const assessmentClients = [
  ['pathwaysClient', pathwaysClient],
  ['evaluationsClient', evaluationsClient],
] as const

describe.each(assessmentClients)('%s beneficiary assessment list read', (_name, client) => {
  it('requests the enrollment-scoped list with the signal and parses the rows', async () => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json([assessment]))
    await expect(
      client.getBeneficiaryAssessments(projectId, enrollmentId, controller.signal),
    ).resolves.toEqual([assessment])
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/evaluation/assessments?enrollmentId=${enrollmentId}`,
    )
    expect(init?.signal).toBe(controller.signal)
  })
  it('rejects a malformed row', async () => {
    fetcher.mockResolvedValueOnce(json([{ ...assessment, score: 40 }]))
    await expect(client.getBeneficiaryAssessments(projectId, enrollmentId)).rejects.toThrow(
      PathwaysClientError,
    )
  })
  it('encodes both ids in the request', async () => {
    fetcher.mockResolvedValueOnce(json([]))
    await client.getBeneficiaryAssessments('a/b c', 'd&e=f')
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'http://127.0.0.1:4000/api/projects/a%2Fb%20c/evaluation/assessments?enrollmentId=d%26e%3Df',
    )
  })
  it('keeps only the known keys of a row with a stage id', async () => {
    fetcher.mockResolvedValueOnce(json([{ ...assessment, stageId: otherId, extra: 'x' }]))
    await expect(client.getBeneficiaryAssessments(projectId, enrollmentId)).resolves.toEqual([
      { ...assessment, stageId: otherId },
    ])
  })
  it.each([
    ['more than 100 rows', Array.from({ length: 101 }, () => assessment)],
    ['a response that is not a list', { rows: [assessment] }],
    ['a numeric id', [{ ...assessment, id: 1 }]],
    ['a numeric activity id', [{ ...assessment, activityId: 1 }]],
    ['a numeric stage id', [{ ...assessment, stageId: 1 }]],
    ['a type outside the catalog', [{ ...assessment, type: 'EXAM' }]],
    ['a numeric maximum score', [{ ...assessment, maximumScore: 50 }]],
    ['a numeric assessment date', [{ ...assessment, assessmentDate: 20260901 }]],
    ['a numeric recorded time', [{ ...assessment, recordedAt: 1 }]],
  ])('rejects %s', async (_name, response) => {
    fetcher.mockResolvedValueOnce(json(response))
    await expect(client.getBeneficiaryAssessments(projectId, enrollmentId)).rejects.toThrow(
      PathwaysClientError,
    )
  })
})
```

Create `apps/web/src/lib/api/reports.test.ts`:

```ts
import type { GenerateReportRequest } from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { coreDataClient } from '@/lib/services/core-feature-client'
import { reportsClient } from './reports'

const authUserId = '78200000-0000-4000-8000-000000000001'
const organizationId = '78200000-0000-4000-8000-000000000002'
const userId = '78200000-0000-4000-8000-000000000003'
const projectId = '78200000-0000-4000-8000-000000000004'
const reportId = '78200000-0000-4000-8000-000000000005'
const otherId = '78200000-0000-4000-8000-000000000006'
const updatedAt = '2026-09-27T00:00:00.000Z'
const form = { id: otherId, name: 'Fictional form', code: 'SYNTHETIC-1', version: 1 }
const round = {
  id: otherId,
  title: 'Midterm',
  status: 'SIGNED_OFF',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  signedOffAt: null,
  overallScore: '82.5',
}
const summaryPreview = {
  projectId,
  kind: 'PROJECT_SUMMARY',
  formId: null,
  columns: ['Answer', 'Count'],
  rows: [['Recorded answer', 'Suppressed']],
  generatedAt: updatedAt,
  unavailableReasons: ['Small cells suppressed.'],
}
const report = {
  id: reportId,
  name: 'Fictional report',
  type: 'PROJECT_SUMMARY',
  format: 'CSV',
  status: 'GENERATED',
  generatedAt: updatedAt,
  evaluation: null,
}
const generateBody: GenerateReportRequest = {
  clientRequestId: otherId,
  name: 'Fictional report',
  kind: 'PROJECT_SUMMARY',
  format: 'CSV',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The same cases run against the old coreDataClient and the new reportsClient.
const clients = [
  ['coreDataClient', coreDataClient],
  ['reportsClient', reportsClient],
] as const
type Client = (typeof clients)[number][1]
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'surveyForms',
    (c, id, signal) => c.surveyForms(id, signal),
    '/reports/survey-forms',
    'GET',
    undefined,
    [form],
    true,
  ],
  [
    'evaluationRounds',
    (c, id, signal) => c.evaluationRounds(id, signal),
    '/reports/evaluation-rounds',
    'GET',
    undefined,
    [round],
    true,
  ],
  [
    'reportPreview',
    (c, id, signal) => c.reportPreview(id, 'PROJECT_SUMMARY', signal),
    '/reports/preview?kind=PROJECT_SUMMARY',
    'GET',
    undefined,
    summaryPreview,
    true,
  ],
  [
    'reports',
    (c, id, signal) => c.reports(id, signal),
    '/reports',
    'GET',
    undefined,
    [report],
    true,
  ],
  [
    'generateReport',
    (c, id) => c.generateReport(id, generateBody),
    '/reports',
    'POST',
    JSON.stringify(generateBody),
    { id: reportId, status: 'GENERATED' },
    false,
  ],
]

describe.each(clients)('%s requests', (_name, client) => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}${suffix}`)
      expect(init?.method ?? 'GET').toBe(method)
      expect(init?.body).toEqual(body)
      expect(init?.signal).toBe(readsSignal ? controller.signal : undefined)
    },
  )
  it.each(requests)(
    '%s rejects a response with an unknown key',
    async (_member, call, _suffix, _method, _body, response) => {
      fetcher.mockResolvedValueOnce(
        json(
          Array.isArray(response)
            ? response.map((row) => ({ ...row, extra: 'x' }))
            : { ...(response as object), extra: 'x' },
        ),
      )
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(client, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refuses a report kind outside the catalog before any request', () => {
    expect(() => client.reportPreview(projectId, 'OTHER' as 'PROJECT_SUMMARY')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['form', (c, id) => c.reportPreview(id, 'SURVEY_FORM_RESULTS', undefined, 'not-a-uuid')],
    [
      'evaluation',
      (c, id) => c.reportPreview(id, 'EVALUATION_REPORT', undefined, undefined, 'not-a-uuid'),
    ],
  ] as readonly (readonly [string, Call])[])(
    'refuses a malformed %s id before any request',
    (_name, call) => {
      expect(() => call(client, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('puts the form id before the evaluation id in the preview query', async () => {
    fetcher.mockResolvedValueOnce(
      json({ ...summaryPreview, kind: 'EVALUATION_REPORT', formId: otherId }),
    )
    await client.reportPreview(projectId, 'EVALUATION_REPORT', undefined, otherId, reportId)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/reports/preview?kind=EVALUATION_REPORT&formId=${otherId}&evaluationId=${reportId}`,
    )
  })
  const sections = {
    reportDate: '2026-09-27',
    information: {
      code: 'SYNTHETIC-1',
      title: 'Fictional',
      status: 'ACTIVE',
      sector: 'Education',
      area: 'Region',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      partners: 'None',
      manager: null,
    },
    overview: [],
  }
  const reportEvaluation = { title: 'Midterm', periodStart: '2026-01-01', periodEnd: '2026-06-30' }
  it.each([
    [
      'a preview with more than 30 columns',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, columns: Array.from({ length: 31 }, () => 'Column') },
    ],
    [
      'a preview with more than 1000 rows',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: Array.from({ length: 1001 }, () => ['Answer']) },
    ],
    [
      'a preview cell over 2000 characters',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: [['x'.repeat(2001)]] },
    ],
    [
      'a preview with more than 20 unavailable reasons',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, unavailableReasons: Array.from({ length: 21 }, () => 'Reason') },
    ],
    [
      'more than 100 survey forms',
      (c, id) => c.surveyForms(id),
      Array.from({ length: 101 }, () => form),
    ],
    ['a survey form version of 0', (c, id) => c.surveyForms(id), [{ ...form, version: 0 }]],
    [
      'more than 100 evaluation rounds',
      (c, id) => c.evaluationRounds(id),
      Array.from({ length: 101 }, () => round),
    ],
    ['more than 100 reports', (c, id) => c.reports(id), Array.from({ length: 101 }, () => report)],
    [
      'a report format outside the catalog',
      (c, id) => c.reports(id),
      [{ ...report, format: 'DOC' }],
    ],
    [
      'a report status outside the catalog',
      (c, id) => c.reports(id),
      [{ ...report, status: 'LOST' }],
    ],
    [
      'a report evaluation with an extra key',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: { ...reportEvaluation, extra: 'x' } }],
    ],
    [
      'a report evaluation with a malformed date',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: { ...reportEvaluation, periodStart: '2026' } }],
    ],
    [
      'a preview for another project',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, projectId: otherId },
    ],
    [
      'a preview of another kind',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, kind: 'EVALUATION_REPORT' },
    ],
    [
      'a preview for another form',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, formId: otherId },
    ],
    [
      'a preview without the requested form',
      (c, id) => c.reportPreview(id, 'SURVEY_FORM_RESULTS', undefined, otherId),
      { ...summaryPreview, kind: 'SURVEY_FORM_RESULTS' },
    ],
    [
      'a preview with sections that have an extra key',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, sections: { ...sections, extra: 1 } },
    ],
    [
      'an evaluation round with a draft status',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, status: 'DRAFT' }],
    ],
    [
      'a generated report with another status',
      (c, id) => c.generateReport(id, generateBody),
      { id: reportId, status: 'DRAFT' },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'rejects %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each([
    [
      'a report without a format, time or evaluation',
      (c, id) => c.reports(id),
      [{ ...report, format: null, generatedAt: null, evaluation: null }],
    ],
    [
      'a report with an evaluation',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: reportEvaluation }],
    ],
    [
      'an evaluation round without a score',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, overallScore: null }],
    ],
    [
      'a preview with sections',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, sections },
    ],
    [
      'a generated report with the PDF fallback flag',
      (c, id) => c.generateReport(id, generateBody),
      { id: reportId, status: 'GENERATED', pdfFallback: true },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'accepts %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId)).resolves.toEqual(response)
    },
  )
})
```

```bash
pnpm exec biome check --write apps/web/src/lib/api
pnpm --filter @pathways/web exec vitest run src/lib/api/finance.test.ts src/lib/api/evaluations.test.ts src/lib/api/reports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "✓|×|Test Files|Tests +[0-9]+"
```

Expected: Biome formats the test files, and the three files run 292 cases; the durations and the order of the three file lines vary:

```
Checked 47 files in <ms>. No fixes applied.
 ✓ src/lib/api/finance.test.ts (104 tests) <ms>
 ✓ src/lib/api/evaluations.test.ts (102 tests) <ms>
 ✓ src/lib/api/reports.test.ts (86 tests) <ms>
 Test Files  3 passed (3)
      Tests  292 passed (292)
```

Three test files and 292 runs pass: 104 for finance, 102 for evaluations and 86 for reports (52, 51 and 43 cases), each case once on the old and once on the new client. The durations vary.

- [ ] **Step 3: Prove the tests can fail**

Change a request method and a path in the new clients, run the finance and report tests, then restore both files:

```bash
A=apps/web/src/lib/api
cp $A/finance.ts .tmp/s6b/finance.bak
cp $A/reports.ts .tmp/s6b/reports.bak
sed -i "s/method: 'PATCH'/method: 'PUT'/" $A/finance.ts
sed -i "s#/reports/evaluation-rounds#/reports/evaluation-round#" $A/reports.ts
pnpm --filter @pathways/web exec vitest run src/lib/api/finance.test.ts src/lib/api/reports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]+"
cp .tmp/s6b/finance.bak $A/finance.ts
cp .tmp/s6b/reports.bak $A/reports.ts
git status --short
```

Expected: two cases fail with the request changed, the files are restored, and `git status` lists only the new files:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/api/finance.test.ts > financeClient requests > replaceBudget sends the request unchanged and returns the parsed response
 FAIL  src/lib/api/reports.test.ts > reportsClient requests > evaluationRounds sends the request unchanged and returns the parsed response
 Test Files  2 failed (2)
      Tests  2 failed | 188 passed (190)
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/lib/api/finance.test.ts src/lib/api/reports.test.ts
?? apps/web/src/lib/api/core/owned-json-read.ts
?? apps/web/src/lib/api/evaluations.schema.ts
?? apps/web/src/lib/api/evaluations.test.ts
?? apps/web/src/lib/api/evaluations.ts
?? apps/web/src/lib/api/finance.test.ts
?? apps/web/src/lib/api/finance.ts
?? apps/web/src/lib/api/reports.test.ts
?? apps/web/src/lib/api/reports.ts
```

The two failing cases are the `replaceBudget` and `evaluationRounds` request cases, once each on the new client; the old client is untouched, so its rows pass.

- [ ] **Step 4: Check and commit**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): add the finance, evaluation and report clients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the web typecheck is clean, `--noUnusedLocals` lists only the two baseline lines, the suite is `B_web` minus 3 files and 18 tests plus 3 files and 292 tests, and the commit holds 8 files:

```
web typecheck clean
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
Checked 1408 files in <ms>. No fixes applied.
 Test Files  242 passed (242)
      Tests  2345 passed (2345)
[<branch> <sha>] refactor(web): add the finance, evaluation and report clients
 8 files changed, 1097 insertions(+)
 create mode 100644 apps/web/src/lib/api/core/owned-json-read.ts
 create mode 100644 apps/web/src/lib/api/evaluations.schema.ts
 create mode 100644 apps/web/src/lib/api/evaluations.test.ts
 create mode 100644 apps/web/src/lib/api/evaluations.ts
 create mode 100644 apps/web/src/lib/api/finance.test.ts
 create mode 100644 apps/web/src/lib/api/finance.ts
 create mode 100644 apps/web/src/lib/api/reports.test.ts
 create mode 100644 apps/web/src/lib/api/reports.ts
```


---

### Task 3: Move the callers and mocks, remove the old members, split the old tests

**Files:**
- Create (gitignored): `.tmp/s6b/move-core-calls.mjs`, `remove-core-code.mjs`, `split-core-tests.mjs`, `task3-edits.json`, `task3-moves.json`
- Modify: `apps/web/src/lib/services/core-feature-client.ts`, `apps/web/src/lib/services/pathways-client.ts`; the 12 production files that call a moved member; `core-feature-client.test.ts`, `pathways-client.project-data.test.ts`; the 8 test files with a `core-feature-client` or `pathways-client` factory that names a moved member; `live-evaluation-workspace.tsx` and its test (the `evaluationDetailSchema` type import); the three Task 2 tests
- Move: `apps/web/src/lib/services/report-sections.ts` to `apps/web/src/lib/api/report-sections.ts`

**Interfaces:**
- Consumes: Task 2's clients.
- Produces: no finance, evaluation or report member on `coreDataClient`, no `getBeneficiaryAssessments` on `pathwaysClient`; every caller and mock uses the new clients; the three Task 2 tests are plain tests of the new clients.

- [ ] **Step 1: Count the callers and the mock factories**

```bash
node .tmp/s6b/count-calls.mjs --list
M=$(node -e "import('./.tmp/s6b/client-blocks.mjs').then((m) => console.log([...m.allMembers, 'getBeneficiaryAssessments'].join(' ')))")
echo $M | wc -w
node .tmp/s6b/mock-scan.mjs lib/services/core-feature-client $M
node .tmp/s6b/mock-scan.mjs lib/services/pathways-client getBeneficiaryAssessments
```

Expected: the counts of Task 0:

```
production features/beneficiaries/profile/components/beneficiary-detail-loader.tsx: 2
production features/dashboard/role-overview/use-project-extras.ts: 1
production features/projects/activities/hooks/use-activity-expenses.ts: 3
production features/projects/activity-expense-dialog.tsx: 2
production features/projects/activity-expense-review-dialog.tsx: 1
production features/projects/budget-module/budget-actions.tsx: 5
production features/projects/budget-module/expense-review-drawer.tsx: 3
production features/projects/budget-module/use-budget-module.ts: 2
production features/projects/components/evidence-view.tsx: 1
production features/projects/components/project-review-workspace.tsx: 1
production features/projects/live-evaluation-workspace.tsx: 6
production features/reports/live-reporting-workspace.tsx: 5
test lib/services/core-feature-client.test.ts: 32
test lib/services/pathways-client.project-data.test.ts: 2
production calls 32 in 12 files
test calls 34 in 2 files
21
apps/web/src/features/projects/activities/components/project-activities-workspace.test.tsx:99 budgets, expenses, budgetReferences
apps/web/src/features/projects/activity-expense-dialog.test.tsx:25 submitExpense, uploadReceipt
apps/web/src/features/projects/activity-expense-review-dialog.test.tsx:23 reviewExpense
apps/web/src/features/projects/live-evaluation-workspace.test.tsx:61 createEvaluation, saveEvaluationScores, submitEvaluation, returnEvaluation, signoffEvaluation
apps/web/src/features/reports/live-reporting-workspace.test.tsx:53 reportPreview, generateReport
factories 19, naming 5
factories 51, naming 0
```

The test calls are the old rows in the two old client tests (32 in `core-feature-client.test.ts` and 2 in `pathways-client.project-data.test.ts`); the Task 2 tests name the old clients only through the `describe.each` table, so they are not counted. The five factories that name a moved member are the ones Step 2 edits (the shared-object factories in `project-review-workspace.test.tsx` and `project-activities-workspace.expenses.test.tsx` pass the whole object and are edited too, so they appear as 7 `core-feature-client` factories to change). The `pathways-client` factory count (second `factories` line) is one lower than in Task 0 because Task 1 deleted a test that mocked it (51 against 52): `naming 0` is the part that must hold.

- [ ] **Step 2: Create the scripts and edits, then move the calls and remove the old members**

Create each file with the Write tool, exactly as printed. `.tmp/s6b/move-core-calls.mjs` rewrites `coreDataClient.<moved member>` and `pathwaysClient.getBeneficiaryAssessments` calls to the new client, adds or trims the imports and moves the `AssessmentSummary` type import (it skips the new `lib/api` files, the two client files and the two old client tests):

Create `.tmp/s6b/move-core-calls.mjs`:

```js
// Rewrites coreDataClient.<moved member> and pathwaysClient.getBeneficiaryAssessments to their new clients and fixes the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups } from './client-blocks.mjs'

const all = [
  ...groups.map((group) => ({ ...group, from: 'coreDataClient', source: '@/lib/services/core-feature-client' })),
  {
    client: 'evaluationsClient',
    module: '@/lib/api/evaluations',
    members: ['getBeneficiaryAssessments'],
    from: 'pathwaysClient',
    source: '@/lib/services/pathways-client',
  },
]
const skip = new Set([
  'lib/services/core-feature-client.ts',
  'lib/services/pathways-client.ts',
  'lib/services/core-feature-client.test.ts',
  'lib/services/pathways-client.project-data.test.ts',
])
const skipPrefix = ['lib/api/finance', 'lib/api/evaluations', 'lib/api/reports']
// Types that left pathways-client.ts for a new module, imported from the old one by name.
const movedTypes = [['AssessmentSummary', '@/lib/api/evaluations.schema']]
const oldImport = /import (type )?\{([^}]*)\} from '@\/lib\/services\/pathways-client'\n/
const web = path.resolve('apps/web/src')

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

let files = 0
let calls = 0
for (const file of walk(web)) {
  const rel = path.relative(web, file).split(path.sep).join('/')
  if (skip.has(rel) || skipPrefix.some((prefix) => rel.startsWith(prefix))) continue
  let text = readFileSync(file, 'utf8')
  const used = []
  let count = 0
  for (const group of all) {
    const call = new RegExp(`\\b${group.from}(\\s*)\\.(${group.members.join('|')})\\b`, 'g')
    text = text.replace(call, (_whole, space, member) => {
      count++
      if (!used.includes(group)) used.push(group)
      return `${group.client}${space}.${member}`
    })
  }
  for (const [name, module] of movedTypes) {
    const match = oldImport.exec(text)
    const names = (match?.[2] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
    const at = names.findIndex((entry) => entry.replace(/^type /, '') === name)
    if (at < 0) continue
    names.splice(at, 1)
    const rest = names.length ? `import ${match[1] ?? ''}{ ${names.join(', ')} } from '@/lib/services/pathways-client'\n` : ''
    text = text.replace(match[0], `import type { ${name} } from '${module}'\n${rest}`)
    count++
  }
  if (!count) continue
  for (const owner of [...new Set(used.map((group) => group.from))]) {
    const source = used.find((group) => group.from === owner).source
    const decl = new RegExp(`import (type )?\\{([^}]*)\\} from '${source}'\\n`)
    const match = decl.exec(text)
    if (!match || !new RegExp(`\\b${owner}\\b`).test(match[2])) {
      console.log(`${rel}: manual (no ${owner} import)`)
      continue
    }
    const rest = text.replace(match[0], '')
    const stillUsed = new RegExp(`\\b${owner}\\b(?!\\s*:)`).test(rest)
    const names = match[2]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && (stillUsed || name !== owner))
    const replacement = names.length ? `import ${match[1] ?? ''}{ ${names.join(', ')} } from '${source}'\n` : ''
    const added = used
      .filter((group) => group.from === owner)
      .map((group) => `import ${match[1] ?? ''}{ ${group.client} } from '${group.module}'\n`)
      .join('')
    text = text.replace(match[0], added + replacement)
  }
  writeFileSync(file, text)
  files++
  calls += count
  console.log(`${rel}: ${count}`)
}
console.log(`files ${files}, calls ${calls}`)
```

`.tmp/s6b/remove-core-code.mjs` cuts the 20 members, the 17 schemas and helpers and the read from `core-feature-client.ts` (renaming the remaining `read` calls to `ownedJsonRead` and `path(id)` to `projectPath(id)`), and the assessment members, helpers and old test from `pathways-client.ts` and its project-data test:

Create `.tmp/s6b/remove-core-code.mjs`:

```js
// Removes the moved members, schemas and helpers from core-feature-client.ts and pathways-client.ts and prints what each step cut.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  allMembers,
  constBlock,
  coreFile,
  functionBlock,
  interfaceBlock,
  memberBlock,
  methodBlock,
  pathwaysFile,
} from './client-blocks.mjs'

// Cuts one block from a text, throwing when it is missing, and prints its line count.
const cutFrom = (label, text, block) => {
  if (!text.includes(block)) throw new Error(`block not found: ${label}`)
  console.log(`${label}: ${block.split('\n').length - 1} lines`)
  return text.replace(block, '')
}

let core = readFileSync(coreFile, 'utf8')
for (const member of allMembers) core = cutFrom(`member ${member}`, core, memberBlock(core, member))
for (const name of [
  'decimal',
  'dateOnly',
  'budgetSchema',
  'expenseSchema',
  'expenseAck',
  'reportKind',
  'reportFormat',
  'reportPreviewSchema',
  'reportSchema',
  'evaluationRoundSchema',
  'post',
  'criterionSchema',
  'evaluationPersonSchema',
  'criterionSnapshotSchema',
  'evaluationScoreSchema',
  'evaluationDetailSchema',
  'evaluationSchema',
])
  core = cutFrom(`schema ${name}`, core, constBlock(core, name))
core = cutFrom('read', core, `${functionBlock(core, 'read')}`)
core = cutFrom('path', core, constBlock(core, 'path'))
core = cutFrom('report-sections import', core, "import { reportSectionsSchema } from './report-sections'\n")
core = cutFrom('reportKinds import', core, "import { reportKinds } from '@pathways/shared'\n")
const readCall = /(?<![.\w])read\(/g
const reads = core.match(readCall).length
const paths = core.split('path(id)').length - 1
core = core.replace(readCall, 'ownedJsonRead(').replaceAll('path(id)', 'projectPath(id)')
console.log(`renamed ${reads} reads and ${paths} project paths`)
core = core.replace(
  "import { captureRequestOwner } from '@/lib/api/core/request-owner'\n",
  "import { ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'\nimport { captureRequestOwner } from '@/lib/api/core/request-owner'\n",
)
writeFileSync(coreFile, core)

let pathways = readFileSync(pathwaysFile, 'utf8')
pathways = cutFrom('interface getBeneficiaryAssessments', pathways, interfaceBlock(pathways, 'getBeneficiaryAssessments'))
pathways = cutFrom('method getBeneficiaryAssessments', pathways, `${methodBlock(pathways, 'getBeneficiaryAssessments')}\n`)
for (const pattern of [
  /export interface AssessmentDetail \{[\s\S]*?\n\}\n\n/,
  /const assessmentTypes = new Set\(\[[\s\S]*?\]\)\n/,
  /const isNullableString = [^\n]*\n\n/,
  /export type AssessmentSummary = Omit<[\s\S]*?\n\}\n\n/,
  /function parseAssessmentSummaries\([\s\S]*?\n\}\n\n/,
]) {
  const block = pattern.exec(pathways)?.[0]
  if (!block) throw new Error(`block not found: ${pattern}`)
  pathways = cutFrom('assessment declaration', pathways, block)
}
writeFileSync(pathwaysFile, pathways)

// The old assessment read test goes: evaluations.test.ts runs the same cases on the new client.
const dataTest = 'apps/web/src/lib/services/pathways-client.project-data.test.ts'
const data = readFileSync(dataTest, 'utf8')
const describeBlock = /\ndescribe\('beneficiary assessment list read'[\s\S]*?\n\}\)\n/.exec(data)?.[0]
if (!describeBlock) throw new Error('block not found: assessment list read test')
writeFileSync(dataTest, cutFrom('assessment list read test', data, describeBlock))
```

`.tmp/s6b/split-core-tests.mjs` moves the finance, evaluation and report cases of `core-feature-client.test.ts` into the three Task 2 tests (each case keeps its body; only the client name and the request bodies change) and turns the Task 2 `describe.each` tables into plain tests of the new client. The six cases that probe the shared owned read stay and run through `coreDataClient.audit`:

Create `.tmp/s6b/split-core-tests.mjs`:

```js
// Turns the three old-and-new request tests into plain tests of the new clients and moves the finance, evaluation and report cases of core-feature-client.test.ts into them.
import { readFileSync, writeFileSync } from 'node:fs'

const oldFile = 'apps/web/src/lib/services/core-feature-client.test.ts'
const api = 'apps/web/src/lib/api'

// Cases that keep probing the shared owned read through the remaining coreDataClient.audit.
const staysByTitle = [
  'honors an already aborted read signal',
  'refuses reads and downloads without a workspace cookie',
  'cancels a JSON response arriving after ownership invalidation',
  'cancels an unexpected JSON response MIME',
  'drops a body that completes after logout',
  'cancels an oversized JSON body',
]
const targets = [
  {
    file: `${api}/finance.test.ts`,
    client: 'financeClient',
    old: "import { coreDataClient } from '@/lib/services/core-feature-client'\n",
    members: ['submitExpense', 'replaceBudget', 'reviewExpense', 'uploadReceipt', 'signoffExpense'],
    consts: [],
    edits: [
      ["const body = { clientRequestId: otherId, amount: '125.00', description: 'Fictional delivery' }", 'const body = submitBody', 1],
      ['coreDataClient.submitExpense(projectId, {})', 'financeClient.submitExpense(projectId, submitBody)', 1],
      ['coreDataClient.replaceBudget(projectId, expenseId, {})', 'financeClient.replaceBudget(projectId, expenseId, replaceBody)', 2],
      ['coreDataClient.reviewExpense(projectId, expenseId, {})', 'financeClient.reviewExpense(projectId, expenseId, reviewBody)', 1],
    ],
  },
  {
    file: `${api}/evaluations.test.ts`,
    client: 'evaluationsClient',
    old: "import { coreDataClient } from '@/lib/services/core-feature-client'\nimport { pathwaysClient } from '@/lib/services/pathways-client'\n",
    members: ['createEvaluation', 'saveEvaluationScores', 'submitEvaluation', 'returnEvaluation', 'signoffEvaluation', "coreDataClient.evaluation("],
    consts: [
      [
        "const otherId = '78100000-0000-4000-8000-000000000006'\n",
        "const otherId = '78100000-0000-4000-8000-000000000006'\nconst expenseId = '78100000-0000-4000-8000-000000000005'\n",
      ],
    ],
    edits: [
      ['(b: unknown) => coreDataClient.createEvaluation(projectId, b)', '(b: unknown) => evaluationsClient.createEvaluation(projectId, b as CreateEvaluationRequest)', 1],
      ['(b: unknown) => coreDataClient.saveEvaluationScores(projectId, evaluationId, b)', '(b: unknown) =>\n          evaluationsClient.saveEvaluationScores(projectId, evaluationId, b as SaveEvaluationScoresRequest)', 1],
      ['(b: unknown) => coreDataClient.submitEvaluation(projectId, evaluationId, b)', '(b: unknown) =>\n          evaluationsClient.submitEvaluation(projectId, evaluationId, b as SubmitEvaluationRequest)', 1],
      ['(b: unknown) => coreDataClient.returnEvaluation(projectId, evaluationId, b)', '(b: unknown) =>\n          evaluationsClient.returnEvaluation(projectId, evaluationId, b as ReturnEvaluationRequest)', 1],
      ['(b: unknown) => coreDataClient.signoffEvaluation(projectId, evaluationId, b)', '(b: unknown) =>\n          evaluationsClient.signoffEvaluation(projectId, evaluationId, b as SignOffEvaluationRequest)', 1],
    ],
  },
  {
    file: `${api}/reports.test.ts`,
    client: 'reportsClient',
    old: "import { coreDataClient } from '@/lib/services/core-feature-client'\n",
    members: ['reportPreview', 'evaluationRounds'],
    consts: [
      [
        "const otherId = '78200000-0000-4000-8000-000000000006'\n",
        "const otherId = '78200000-0000-4000-8000-000000000006'\nconst formId = '78200000-0000-4000-8000-000000000007'\n",
      ],
      [
        "const updatedAt = '2026-09-27T00:00:00.000Z'\n",
        "const updatedAt = '2026-09-27T00:00:00.000Z'\nconst preview = {\n  projectId,\n  kind: 'SURVEY_FORM_RESULTS',\n  formId,\n  columns: ['Answer', 'Count'],\n  rows: [['Recorded answer', 'Suppressed']],\n  generatedAt: updatedAt,\n  unavailableReasons: ['Small cells suppressed.'],\n}\n",
      ],
      [
        "import type { GenerateReportRequest } from '@pathways/shared'\n",
        "import { sampleProjectReport } from '@/features/reports/print/print-report-sample'\nimport type { GenerateReportRequest } from '@pathways/shared'\n",
      ],
    ],
    edits: [],
  },
]

// The 2-space blocks of the first describe in the old test file.
const old = readFileSync(oldFile, 'utf8')
const lines = old.split('\n')
const open = lines.findIndex((line) => line.startsWith("describe('Core client request and strict"))
const close = lines.findIndex((line, index) => index > open && line === '})')
const blocks = []
for (let i = open + 1; i < close; i++) {
  if (/^ {2}(?:it|it\.each|describe)\b/.test(lines[i])) blocks.push([i, i])
  else if (blocks.length && lines[i] !== '') blocks[blocks.length - 1][1] = i
}
const text = (range) => lines.slice(range[0], range[1] + 1).join('\n')

const moved = new Map(targets.map((target) => [target.client, []]))
const kept = []
for (const range of blocks) {
  const block = text(range)
  const target =
    block.includes('coreFeatureClient') || staysByTitle.some((title) => block.includes(`'${title}`))
      ? null
      : targets.find((entry) => entry.members.some((member) => block.includes(member))) ??
        (block.includes("coreDataClient.evaluation('../other')") ? targets[1] : undefined)
  if (target === undefined) throw new Error(`no home for the block at line ${range[0] + 1}`)
  if (target) moved.get(target.client).push(block)
  else kept.push(range)
}
for (const [client, list] of moved) console.log(`${client}: ${list.length} blocks`)
console.log(`kept: ${kept.length} blocks`)

// Replaces text in a string, throwing unless it matches the expected number of times.
const edit = (source, from, to, count, label) => {
  const found = source.split(from).length - 1
  if (found !== count) throw new Error(`${label}: expected ${count} of ${JSON.stringify(from)}, found ${found}`)
  return source.replaceAll(from, to)
}

for (const target of targets) {
  let source = readFileSync(target.file, 'utf8')
  source = edit(source, target.old, '', 1, target.file)
  source = source.replace(/\/\/ The same cases run against[^\n]*\nconst clients = \[[\s\S]*?\] as const\n/, '')
  source = source.replace(/type Client = \(typeof clients\)\[number\]\[1\]/, `type Client = typeof ${target.client}`)
  source = source.replace(/describe\.each\(clients\)\('%s requests', \(_name, client\) => \{/, `describe('${target.client} requests', () => {`)
  source = source.replace(/\/\/ The same cases[\s\S]*?(?=\ndescribe)/, '')
  source = source.replace(/const assessmentClients = \[[\s\S]*?\] as const\n\n/, '')
  source = source.replace(/describe\.each\(assessmentClients\)\('%s beneficiary assessment list read', \(_name, client\) => \{/, `describe('${target.client} beneficiary assessment list read', () => {`)
  source = source.replace(/\bclient(?=[,.])/g, target.client)
  for (const [anchor, insertion] of target.consts) source = edit(source, anchor, insertion, 1, target.file)
  let body = moved.get(target.client).join('\n')
  body = body.replaceAll('coreDataClient.', `${target.client}.`)
  for (const [from, to, count] of target.edits) body = edit(body, from.replace('coreDataClient.', `${target.client}.`), to, count, target.file)
  source = `${source.trimEnd()}\n\ndescribe('${target.client} response boundaries', () => {\n${body}\n})\n`
  writeFileSync(target.file, source)
}

// The old file keeps the publication, artifact and shared read cases; the shared read is probed through audit.
const drop = new Set()
for (const [start, end] of blocks) {
  if (!kept.some((range) => range[0] === start)) for (let i = start; i <= end; i++) drop.add(i)
}
let rest = lines
  .filter((_line, index) => !drop.has(index))
  .join('\n')
rest = edit(rest, 'coreDataClient.evaluation(projectId, controller.signal)', 'coreDataClient.audit(undefined, controller.signal)', 1, oldFile)
rest = edit(rest, 'coreDataClient.evaluation(projectId)', 'coreDataClient.audit()', 5, oldFile)
for (const [pattern, name] of [
  [/^import \{ sampleProjectReport \} from '@\/features\/reports\/print\/print-report-sample'\n/m, 'sample import'],
  [/^const expenseId = [^\n]*\n/m, 'expenseId'],
  [/^const formId = [^\n]*\n/m, 'formId'],
  [/^const acknowledgement = \{[\s\S]*?\n\}\n/m, 'acknowledgement'],
  [/^const preview = \{[\s\S]*?\n\}\n/m, 'preview'],
]) {
  if (!pattern.test(rest)) throw new Error(`missing ${name}`)
  rest = rest.replace(pattern, '')
}
writeFileSync(oldFile, rest)
console.log('split done')
```

`.tmp/s6b/trim-imports.mjs` drops named imports that no longer appear in a file body (Biome does not report unused imports):

Create `.tmp/s6b/trim-imports.mjs`:

```js
// Drops named imports that no longer appear in the file body, ignoring comments and quoted strings, and prints their names.
import { readFileSync, writeFileSync } from 'node:fs'

const importBlock = /import (type )?\{([^}]*)\} from ('[^']+')\n/g
const quoted = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g
for (const file of process.argv.slice(2)) {
  let text = readFileSync(file, 'utf8')
  const body = text.replace(importBlock, '').replace(quoted, '')
  const removed = []
  text = text.replace(importBlock, (whole, typeOnly, names, from) => {
    const kept = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => {
        const local = name.replace(/^type /, '').split(' as ').at(-1)
        const used = new RegExp(`\\b${local}\\b`).test(body)
        if (!used) removed.push(local)
        return used
      })
    if (kept.length === names.split(',').filter((name) => name.trim()).length) return whole
    return kept.length ? `import ${typeOnly ?? ''}{ ${kept.join(', ')} } from ${from}\n` : ''
  })
  writeFileSync(file, text)
  console.log(`${file}: removed ${removed.join(', ') || 'nothing'}`)
}
```

`.tmp/s6b/task3-edits.json` repoints the eight mock factories and the `evaluationDetailSchema` type imports:

Create `.tmp/s6b/task3-edits.json`:

```json
[
 [
  "apps/web/src/features/projects/activity-expense-dialog.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: { submitExpense: state.submitExpense, uploadReceipt: state.uploadReceipt },\n}))\n",
  "vi.mock('@/lib/api/finance', () => ({\n  financeClient: { submitExpense: state.submitExpense, uploadReceipt: state.uploadReceipt },\n}))\n",
  1
 ],
 [
  "apps/web/src/features/projects/activity-expense-review-dialog.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: { reviewExpense: state.reviewExpense },\n}))\n",
  "vi.mock('@/lib/api/finance', () => ({\n  financeClient: { reviewExpense: state.reviewExpense },\n}))\n",
  1
 ],
 [
  "apps/web/src/features/projects/live-evaluation-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: {\n",
  "vi.mock('@/lib/api/evaluations', () => ({\n  evaluationsClient: {\n",
  1
 ],
 [
  "apps/web/src/features/reports/live-reporting-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: {\n    generateReport: (...args: unknown[]) => state.generate(...args),\n    reportPreview: (...args: unknown[]) => state.preview(...args),\n  },\n  downloadCoreArtifact: (...args: unknown[]) => state.downloadArtifact(...args),\n}))\n",
  "vi.mock('@/lib/api/reports', () => ({\n  reportsClient: {\n    generateReport: (...args: unknown[]) => state.generate(...args),\n    reportPreview: (...args: unknown[]) => state.preview(...args),\n  },\n}))\nvi.mock('@/lib/services/core-feature-client', () => ({\n  downloadCoreArtifact: (...args: unknown[]) => state.downloadArtifact(...args),\n}))\n",
  1
 ],
 [
  "apps/web/src/features/projects/activities/components/project-activities-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: {\n",
  "vi.mock('@/lib/api/finance', () => ({\n  financeClient: {\n",
  1
 ],
 [
  "apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: core }))\n",
  "vi.mock('@/lib/api/finance', () => ({ financeClient: core }))\n",
  1
 ],
 [
  "apps/web/src/features/projects/components/project-review-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreDataClient: coreApi,\n  saveCoreArtifact: coreApi.save,\n}))\n",
  "vi.mock('@/lib/api/reports', () => ({ reportsClient: coreApi }))\nvi.mock('@/lib/services/core-feature-client', () => ({ saveCoreArtifact: coreApi.save }))\n",
  1
 ],
 [
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx",
  "vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: client }))\n",
  "vi.mock('@/lib/api/evaluations', () => ({ evaluationsClient: client }))\nvi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: client }))\n",
  1
 ],
 [
  "apps/web/src/features/projects/live-evaluation-workspace.tsx",
  "import { evaluationsClient } from '@/lib/api/evaluations'\n",
  "import { type evaluationDetailSchema, evaluationsClient } from '@/lib/api/evaluations'\n",
  1
 ],
 [
  "apps/web/src/features/projects/live-evaluation-workspace.tsx",
  "import type { evaluationDetailSchema } from '@/lib/services/core-feature-client'\n",
  "",
  1
 ],
 [
  "apps/web/src/features/projects/live-evaluation-workspace.test.tsx",
  "import type { evaluationDetailSchema } from '@/lib/services/core-feature-client'\n",
  "import type { evaluationDetailSchema } from '@/lib/api/evaluations'\n",
  1
 ]
]
```

```bash
node .tmp/s6b/move-core-calls.mjs
node .tmp/s6b/replace-exact.mjs .tmp/s6b/task3-edits.json
node .tmp/s6b/remove-core-code.mjs
node .tmp/s6b/split-core-tests.mjs
git add -N apps
FILES=$(git diff HEAD --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$")
echo "$FILES" | wc -l
node .tmp/s6b/trim-imports.mjs $FILES | grep -v "removed nothing"
pnpm exec biome check --write $FILES
pnpm exec biome check $FILES
wc -l apps/web/src/lib/services/core-feature-client.ts apps/web/src/lib/services/pathways-client.ts
```

Expected: the calls move, the mocks are repointed, the old members go and the tests are split:

```
features/beneficiaries/profile/components/beneficiary-detail-loader.tsx: 3
features/dashboard/role-overview/use-project-extras.ts: 1
features/projects/activities/hooks/use-activity-expenses.ts: 3
features/projects/activity-expense-dialog.tsx: 2
features/projects/activity-expense-review-dialog.tsx: 1
features/projects/budget-module/budget-actions.tsx: 5
features/projects/budget-module/expense-review-drawer.tsx: 3
features/projects/budget-module/use-budget-module.ts: 2
features/projects/components/evidence-view.tsx: 1
features/projects/components/project-review-workspace.tsx: 1
features/projects/live-evaluation-workspace.tsx: 6
features/reports/live-reporting-workspace.tsx: 5
files 12, calls 33
11 replacements in 9 files
member budgets: 2 lines
member createBudget: 6 lines
member replaceBudget: 6 lines
member expenses: 2 lines
member budgetReferences: 8 lines
member submitExpense: 6 lines
member reviewExpense: 6 lines
member signoffExpense: 9 lines
member uploadReceipt: 13 lines
member evaluation: 6 lines
member createEvaluation: 2 lines
member saveEvaluationScores: 6 lines
member submitEvaluation: 6 lines
member returnEvaluation: 6 lines
member signoffEvaluation: 6 lines
member surveyForms: 17 lines
member evaluationRounds: 4 lines
member reportPreview: 16 lines
member reports: 2 lines
member generateReport: 22 lines
schema decimal: 1 lines
schema dateOnly: 1 lines
schema budgetSchema: 11 lines
schema expenseSchema: 21 lines
schema expenseAck: 9 lines
schema reportKind: 1 lines
schema reportFormat: 1 lines
schema reportPreviewSchema: 12 lines
schema reportSchema: 14 lines
schema evaluationRoundSchema: 11 lines
schema post: 2 lines
schema criterionSchema: 22 lines
schema evaluationPersonSchema: 1 lines
schema criterionSnapshotSchema: 12 lines
schema evaluationScoreSchema: 13 lines
schema evaluationDetailSchema: 22 lines
schema evaluationSchema: 8 lines
read: 41 lines
path: 1 lines
report-sections import: 1 lines
reportKinds import: 1 lines
renamed 3 reads and 2 project paths
interface getBeneficiaryAssessments: 5 lines
method getBeneficiaryAssessments: 13 lines
assessment declaration: 13 lines
assessment declaration: 7 lines
assessment declaration: 2 lines
assessment declaration: 7 lines
assessment declaration: 30 lines
assessment list read test: 29 lines
financeClient: 7 blocks
evaluationsClient: 4 blocks
reportsClient: 6 blocks
kept: 8 blocks
split done
27
apps/web/src/lib/services/pathways-client.project-data.test.ts: removed pathwaysClient
Checked 27 files in <ms>. Fixed 11 files.
Checked 27 files in <ms>. No fixes applied.
  173 apps/web/src/lib/services/core-feature-client.ts
  330 apps/web/src/lib/services/pathways-client.ts
  503 total
```

`move-core-calls.mjs` prints one `<file>: <n>` line per rewritten file; every block is found by `remove-core-code.mjs` (20 members, 17 schemas and helpers, the read, the path, two imports, the assessment interface member and method, five declarations and the old test); `split-core-tests.mjs` finds a home for every block (finance 7, evaluations 4, reports 6, kept 8). `trim-imports.mjs` drops the `pathwaysClient` import of the project-data test, which only the removed test used. `core-feature-client.ts` ends at 173 lines; `pathways-client.ts` loses 77 lines (407 to 330).

- [ ] **Step 3: Check, scan and compare every test title**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
node .tmp/s6b/count-calls.mjs
M=$(node -e "import('./.tmp/s6b/client-blocks.mjs').then((m) => console.log([...m.allMembers, 'getBeneficiaryAssessments'].join(' ')))")
node .tmp/s6b/mock-scan.mjs lib/services/core-feature-client $M
node .tmp/s6b/mock-scan.mjs lib/services/pathways-client getBeneficiaryAssessments
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
F=apps/web/src
node .tmp/s6b/test-titles.mjs save .tmp/s6b/titles-core-after.json $F/lib/services/core-feature-client.test.ts $F/lib/services/pathways-client.project-data.test.ts $F/lib/api/finance.test.ts $F/lib/api/evaluations.test.ts $F/lib/api/reports.test.ts
node .tmp/s6b/test-titles.mjs compare .tmp/s6b/titles-core-before.json .tmp/s6b/titles-core-after.json --allow 'rejects a mismatched survey preview context: {"formId":"78000000-0000-4000-8000-000000000006"}' 'rejects a mismatched survey preview context: {"projectId":"78000000-0000-4000-8000-000000000006"}' 'requests the enrollment-scoped list and parses the rows'
echo "compare exit $?"
```

Expected: typecheck, scans, suite and title comparison:

```
web typecheck clean
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
production calls 0 in 0 files
test calls 0 in 0 files
factories 14, naming 0
factories 51, naming 0
 Test Files  242 passed (242)
      Tests  2197 passed (2197)
files 5, tests 228, failed 0
before 84, after 228, lost 0, added 147
compare exit 0
```

The typecheck is clean and `--noUnusedLocals` lists the two baseline lines. No call is left; the `core-feature-client` factories that name a moved member are gone (`naming 0`; the remaining 14 are the artifact, publication and audit mocks). The web suite is `B_web` plus 126 tests (the three client tests add 292 runs, the 146 old-client runs and the two assessment cases go, and the 18 tests of Task 1 are already out), in the same number of files as after Task 2. The comparison covers the five files that held the 84 old titles and now hold 228: `lost 0` because the three allowed titles were renamed, not dropped (two survey preview titles carry the fixture project id, now `782...`, and the assessment title gained "with the signal"); `added 147` is those three new spellings plus the 144 per-client cases (the 62 request cases of the old tables and the 82 record id, identity and response bound cases).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "refactor(web): move the finance, evaluation and report callers and remove the old methods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the commit holds the production callers, the mock edits, both client files and the tests:

```
[<branch> <sha>] refactor(web): move the finance, evaluation and report callers and remove the old methods
 27 files changed, 449 insertions(+), 932 deletions(-)
```

- [ ] **Step 5: Move the report sections schema next to the report client**

`report-sections.ts` is the schema of the report preview sections; after Task 3 only `lib/api/reports.ts` and the print files import it. `.tmp/s6b/task3-moves.json` holds the one move; `move-modules.mjs` runs `git mv`, then rewrites every import, re-export, dynamic import and `vi.mock` specifier that named a moved module or sits in a moved file (alias or relative form kept), and rewrites quoted paths in the source-reading contract test. Create each file with the Write tool, exactly as printed:

Create `.tmp/s6b/move-modules.mjs`:

```js
// Runs git mv for every entry of a web move map, then rewrites the specifiers that named a moved module or sit in a moved file.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const strip = (file) => file.replace(/\.tsx?$/, '')
const forward = new Map(
  Object.entries(JSON.parse(readFileSync(mapFile, 'utf8'))).map(([from, to]) => [strip(from), strip(to)]),
)
const reverse = new Map([...forward].map(([from, to]) => [to, from]))
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

for (const [from, to] of Object.entries(JSON.parse(readFileSync(mapFile, 'utf8')))) {
  mkdirSync(path.dirname(path.join(web, to)), { recursive: true })
  execFileSync('git', ['mv', path.join('apps/web/src', from), path.join('apps/web/src', to)])
}

// The web-relative module a specifier names from the old location of its file, or null for a package.
const target = (oldFile, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(path.join(web, oldFile)), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

// The specifier for a module from a file, keeping the form (alias or relative) the original used.
const specifier = (newFile, spec, module) => {
  if (spec.startsWith('@/')) return `@/${module}`
  const relative = path.relative(path.dirname(path.join(web, newFile)), path.join(web, module))
  const posix = relative.split(path.sep).join('/')
  return posix.startsWith('.') ? posix : `./${posix}`
}

let total = 0
for (const file of walk(web)) {
  const newFile = strip(path.relative(web, file).split(path.sep).join('/'))
  const oldFile = reverse.get(newFile) ?? newFile
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const module = target(oldFile, spec)
    if (module === null) return whole
    const moved = forward.get(module) ?? module
    if (moved === module && oldFile === newFile) return whole
    const next = specifier(newFile, spec, moved)
    if (next === spec) return whole
    count++
    return `${lead}${quote}${next}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${newFile}: ${count}`)
}
// Source-reading contract tests name files by quoted path, so those strings follow the move too.
const contract = path.join(web, 'features/ui-copy-cleanup.contract.test.ts')
let named = 0
let contractText = readFileSync(contract, 'utf8')
for (const [from, to] of Object.entries(JSON.parse(readFileSync(mapFile, 'utf8')))) {
  const quoted = `'${from}'`
  named += contractText.split(quoted).length - 1
  contractText = contractText.replaceAll(quoted, `'${to}'`)
}
writeFileSync(contract, contractText)
console.log(`moved ${forward.size} files, rewrote ${total} specifiers and ${named} contract paths`)
```

Create `.tmp/s6b/task3-moves.json`:

```json
{
 "lib/services/report-sections.ts": "lib/api/report-sections.ts"
}
```

```bash
node .tmp/s6b/move-modules.mjs .tmp/s6b/task3-moves.json
git status --short
pnpm exec biome check --write $(git diff HEAD --name-only --diff-filter=AMR | grep -E "\.tsx?$")
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec vitest run src/features/reports src/lib/api/reports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): move the report sections schema next to the report client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the schema file moves with `git mv`, five specifiers are rewritten, and the focused tests pass:

```
features/reports/print/print-report-payload: 1
features/reports/print/print-report-sample: 1
features/reports/print/print-report-sections.test: 1
features/reports/print/print-report-sections: 1
lib/api/reports: 1
moved 1 files, rewrote 5 specifiers and 0 contract paths
 M apps/web/src/features/reports/print/print-report-payload.ts
 M apps/web/src/features/reports/print/print-report-sample.ts
 M apps/web/src/features/reports/print/print-report-sections.test.tsx
 M apps/web/src/features/reports/print/print-report-sections.tsx
R  apps/web/src/lib/services/report-sections.ts -> apps/web/src/lib/api/report-sections.ts
 M apps/web/src/lib/api/reports.ts
Checked 6 files in <ms>. No fixes applied.
web typecheck clean
 Test Files  6 passed (6)
      Tests  101 passed (101)
[<branch> <sha>] refactor(web): move the report sections schema next to the report client
 6 files changed, 5 insertions(+), 5 deletions(-)
 rename apps/web/src/lib/{services => api}/report-sections.ts (100%)
```


---

### Task 4: Move the budget, evaluation and report files into the feature layout

**Files:**
- Create (gitignored): `.tmp/s6b/layout-map.json`, `task4-edits.json`
- Create: `apps/web/src/features/reports/index.ts`, `apps/web/src/features/reports/reports.utils.ts`, `apps/web/src/features/reports/reports.utils.test.ts`
- Move: the 25 files of the map (`features/projects/budget-module`, the four activity expense dialog files, the evaluation workspace and its test, and the four report component files)
- Modify: the specifiers inside and outside the moved files (by script), the six report pages, the print report page, `apps/web/src/features/reports/components/live-reporting-workspace.tsx` and its test, `apps/web/src/features/projects/budget/print/print-receipt-view.tsx`, `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`

**Interfaces:**
- Consumes: Task 3's tree and `move-modules.mjs`.
- Produces: `features/projects/budget/{components,hooks,print}` with `budget.utils.ts`, `features/projects/evaluation/components`, `features/reports/{components,print}` with `reports.utils.ts` and `index.ts`; `features/projects/budget-module` is gone.

- [ ] **Step 1: Re-measure the route baseline**

Tasks 1 to 3 already changed 21 routes, so the layout move is compared with a baseline taken now.

```bash
.tmp/s6b/build-routes.sh pre-layout
node .tmp/s6b/compare-routes.mjs .tmp/s6b/routes-baseline.txt .tmp/s6b/routes-pre-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: the build succeeds, and the routes that differ from the Task 0 baseline are:

```
exit 0
ƒ Middleware                                                      103 kB
/alerts: 293 kB -> 292 kB (-1.0)
/analytics: 657 kB -> 655 kB (-2.0)
/beneficiaries/[beneficiaryId]: 300 kB -> 295 kB (-5.0)
/collection: 426 kB -> 424 kB (-2.0)
/collection/forms: 426 kB -> 424 kB (-2.0)
/collection/forms/new: 426 kB -> 424 kB (-2.0)
/collection/import: 435 kB -> 432 kB (-3.0)
/collection/projects/[projectId]/forms/[formId]: 426 kB -> 424 kB (-2.0)
/dashboard: 668 kB -> 666 kB (-2.0)
/projects/[projectId]/activities: 338 kB -> 336 kB (-2.0)
/projects/[projectId]/activities/[activityId]: 338 kB -> 336 kB (-2.0)
/projects/[projectId]/budget: 313 kB -> 314 kB (+1.0)
/projects/[projectId]/edit: 297 kB -> 296 kB (-1.0)
/projects/[projectId]/evidence: 313 kB -> 314 kB (+1.0)
/projects/[projectId]/indicators: 283 kB -> 282 kB (-1.0)
/projects/[projectId]/monitor-evaluate: 313 kB -> 314 kB (+1.0)
/projects/new: 297 kB -> 296 kB (-1.0)
/recommendations/[recommendationId]: 293 kB -> 292 kB (-1.0)
/settings/audit: 269 kB -> 267 kB (-2.0)
/transparency: 263 kB -> 260 kB (-3.0)
/transparency/[projectId]/preview: 248 kB -> 246 kB (-2.0)
routes 72, different 21
```

The build takes about two minutes. Middleware must equal `M0` (`cat .tmp/s6b/m0`). The route sizes of Task 0 depend on what S4c and S5b changed below this slice, so the figures that decide the task are the differences against the Task 0 baseline: every difference is 1 to 5 kB (the dead code and the old client members left shared chunks), and three routes (`budget`, `evidence` and `monitor-evaluate`) are 1 kB bigger, none more.

- [ ] **Step 2: Move the files**

Create `.tmp/s6b/layout-map.json` with the Write tool, exactly as printed (`move-modules.mjs` of Task 3 runs `git mv` for every entry and rewrites the specifiers):

Create `.tmp/s6b/layout-map.json`:

```json
{
  "features/projects/budget-module/budget-math.ts": "features/projects/budget/budget.utils.ts",
  "features/projects/budget-module/budget-math.test.ts": "features/projects/budget/budget.utils.test.ts",
  "features/projects/budget-module/budget-actions.tsx": "features/projects/budget/components/budget-actions.tsx",
  "features/projects/budget-module/budget-ledger.tsx": "features/projects/budget/components/budget-ledger.tsx",
  "features/projects/budget-module/budget-ledger.test.tsx": "features/projects/budget/components/budget-ledger.test.tsx",
  "features/projects/budget-module/budget-module.tsx": "features/projects/budget/components/budget-module.tsx",
  "features/projects/budget-module/budget-overview.tsx": "features/projects/budget/components/budget-overview.tsx",
  "features/projects/budget-module/budget-transparency.tsx": "features/projects/budget/components/budget-transparency.tsx",
  "features/projects/budget-module/expense-review-drawer.tsx": "features/projects/budget/components/expense-review-drawer.tsx",
  "features/projects/activity-expense-dialog.tsx": "features/projects/budget/components/activity-expense-dialog.tsx",
  "features/projects/activity-expense-dialog.test.tsx": "features/projects/budget/components/activity-expense-dialog.test.tsx",
  "features/projects/activity-expense-review-dialog.tsx": "features/projects/budget/components/activity-expense-review-dialog.tsx",
  "features/projects/activity-expense-review-dialog.test.tsx": "features/projects/budget/components/activity-expense-review-dialog.test.tsx",
  "features/projects/budget-module/use-budget-module.ts": "features/projects/budget/hooks/use-budget-module.ts",
  "features/projects/budget-module/print/print-receipt-amount.ts": "features/projects/budget/print/print-receipt-amount.ts",
  "features/projects/budget-module/print/print-receipt-page.tsx": "features/projects/budget/print/print-receipt-page.tsx",
  "features/projects/budget-module/print/print-receipt-payload.ts": "features/projects/budget/print/print-receipt-payload.ts",
  "features/projects/budget-module/print/print-receipt-view.tsx": "features/projects/budget/print/print-receipt-view.tsx",
  "features/projects/budget-module/print/print-receipt.test.tsx": "features/projects/budget/print/print-receipt.test.tsx",
  "features/projects/live-evaluation-workspace.tsx": "features/projects/evaluation/components/live-evaluation-workspace.tsx",
  "features/projects/live-evaluation-workspace.test.tsx": "features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
  "features/reports/reporting-page.tsx": "features/reports/components/reporting-page.tsx",
  "features/reports/reporting-page.test.tsx": "features/reports/components/reporting-page.test.tsx",
  "features/reports/live-reporting-workspace.tsx": "features/reports/components/live-reporting-workspace.tsx",
  "features/reports/live-reporting-workspace.test.tsx": "features/reports/components/live-reporting-workspace.test.tsx"
}
```

```bash
node .tmp/s6b/move-modules.mjs .tmp/s6b/layout-map.json
rmdir apps/web/src/features/projects/budget-module/print apps/web/src/features/projects/budget-module
find apps/web/src/features/projects/budget apps/web/src/features/projects/evaluation apps/web/src/features/reports -type f | sort
```

Expected: the 25 files move, the specifiers are rewritten, and the new layout is:

```
app/(dashboard)/reports/beneficiary-summary/page: 1
app/(dashboard)/reports/indicator-summary/page: 1
app/(dashboard)/reports/page: 1
app/(dashboard)/reports/preview/page: 1
app/(dashboard)/reports/project-summary/page: 1
app/(dashboard)/reports/survey-results/page: 1
features/projects/activities/components/activity-detail-content.test: 2
features/projects/activities/components/activity-detail-content: 3
features/projects/activities/components/activity-detail-panel: 2
features/projects/activities/components/activity-detail-sections: 1
features/projects/activities/components/activity-list-table: 1
features/projects/activities/components/project-activities-rbac.test: 2
features/projects/activities/components/project-activities-workspace.expenses.test: 2
features/projects/activities/hooks/use-activity-expenses: 2
features/projects/budget/budget.utils.test: 1
features/projects/budget/components/activity-expense-dialog: 1
features/projects/budget/components/budget-actions: 1
features/projects/budget/components/budget-ledger.test: 1
features/projects/budget/components/budget-ledger: 3
features/projects/budget/components/budget-module: 1
features/projects/budget/components/budget-overview: 3
features/projects/budget/components/budget-transparency: 2
features/projects/budget/components/expense-review-drawer: 1
features/projects/budget/hooks/use-budget-module: 3
features/projects/components/project-review-workspace.test: 2
features/projects/components/project-review-workspace: 2
features/projects/evaluation/components/live-evaluation-workspace.test: 1
features/projects/evaluation/components/live-evaluation-workspace: 2
features/projects/index: 1
features/reports/components/live-reporting-workspace.test: 1
moved 25 files, rewrote 47 specifiers and 0 contract paths
apps/web/src/features/projects/budget/budget.utils.test.ts
apps/web/src/features/projects/budget/budget.utils.ts
apps/web/src/features/projects/budget/components/activity-expense-dialog.test.tsx
apps/web/src/features/projects/budget/components/activity-expense-dialog.tsx
apps/web/src/features/projects/budget/components/activity-expense-review-dialog.test.tsx
apps/web/src/features/projects/budget/components/activity-expense-review-dialog.tsx
apps/web/src/features/projects/budget/components/budget-actions.tsx
apps/web/src/features/projects/budget/components/budget-ledger.test.tsx
apps/web/src/features/projects/budget/components/budget-ledger.tsx
apps/web/src/features/projects/budget/components/budget-module.tsx
apps/web/src/features/projects/budget/components/budget-overview.tsx
apps/web/src/features/projects/budget/components/budget-transparency.tsx
apps/web/src/features/projects/budget/components/expense-review-drawer.tsx
apps/web/src/features/projects/budget/hooks/use-budget-module.ts
apps/web/src/features/projects/budget/print/print-receipt-amount.ts
apps/web/src/features/projects/budget/print/print-receipt-page.tsx
apps/web/src/features/projects/budget/print/print-receipt-payload.ts
apps/web/src/features/projects/budget/print/print-receipt-view.tsx
apps/web/src/features/projects/budget/print/print-receipt.test.tsx
apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx
apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx
apps/web/src/features/reports/components/live-reporting-workspace.tsx
apps/web/src/features/reports/components/reporting-page.test.tsx
apps/web/src/features/reports/components/reporting-page.tsx
apps/web/src/features/reports/print/print-report-chart.ts
apps/web/src/features/reports/print/print-report-payload.ts
apps/web/src/features/reports/print/print-report-preview-shape.test.tsx
apps/web/src/features/reports/print/print-report-sample.ts
apps/web/src/features/reports/print/print-report-sections.test.tsx
apps/web/src/features/reports/print/print-report-sections.tsx
apps/web/src/features/reports/print/print-report-view.tsx
apps/web/src/features/reports/print/print-report.test.tsx
```

25 files move; `move-modules.mjs` prints one `<file>: <n>` line per rewritten file, then the totals. `rmdir` removes the two empty `budget-module` folders (it prints nothing, and fails if either still holds a file); the `find` listing is the new layout.

- [ ] **Step 3: Add the reports index and utils, and point the pages, the print receipt, the direction test and the Next config at them**

Create the three reports files with the Write tool (the feature index lists its exports by leaf path, with no sub-index; `reportFileName` moves out of the live workspace with its two test rows):

Create `apps/web/src/features/reports/index.ts`:

```ts
// Public surface of the reports feature for files outside it.
export { ReportingPage } from './components/reporting-page'
export { type PrintReport, readPrintReport, sampleReport } from './print/print-report-payload'
export { sampleProjectReport } from './print/print-report-sample'
export { PrintReportView } from './print/print-report-view'
// Shared with the budget print receipt, which draws the same bands and tables.
export { Band, Table, td } from './print/print-report-sections'
```

Create `apps/web/src/features/reports/reports.utils.ts`:

```ts
/** Download name from the saved report name, stripped of characters file systems reject. */
export const reportFileName = (name: string, reportId: string, extension: string) => {
  const base = Array.from(name, (char) => (char < ' ' || '\\/:*?"<>|'.includes(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150)
  return `${base || `report-${reportId}`}.${extension}`
}
```

Create `apps/web/src/features/reports/reports.utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reportFileName } from './reports.utils'

describe('report file names', () => {
  it.each([
    ['Q3: North/South <draft>?', 'Q3 North South draft.pdf'],
    ['  ...  ', 'report-30000000-0000-4000-8000-000000000003.pdf'],
  ])('makes the report name %j a safe file name', (name, expected) => {
    expect(reportFileName(name, '30000000-0000-4000-8000-000000000003', 'pdf')).toBe(expected)
  })
})
```

`.tmp/s6b/task4-edits.json` points the six report pages, the print report page and the budget print receipt at the index, takes `reportFileName` and its test rows out of the live workspace and its test, and changes the one sample import of the direction test that named `reports` as a non-indexed feature:

Create `.tmp/s6b/task4-edits.json`:

```json
[
 [
  "apps/web/src/app/(dashboard)/reports/beneficiary-summary/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/(dashboard)/reports/indicator-summary/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/(dashboard)/reports/project-summary/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/(dashboard)/reports/preview/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/(dashboard)/reports/survey-results/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/(dashboard)/reports/page.tsx",
  "'@/features/reports/components/reporting-page'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/app/print/reports/[id]/page.tsx",
  "import {\n  type PrintReport,\n  readPrintReport,\n  sampleReport,\n} from '@/features/reports/print/print-report-payload'\nimport { sampleProjectReport } from '@/features/reports/print/print-report-sample'\nimport { PrintReportView } from '@/features/reports/print/print-report-view'\n",
  "import {\n  type PrintReport,\n  PrintReportView,\n  readPrintReport,\n  sampleProjectReport,\n  sampleReport,\n} from '@/features/reports'\n",
  1
 ],
 [
  "apps/web/src/features/projects/budget/print/print-receipt-view.tsx",
  "'@/features/reports/print/print-report-sections'",
  "'@/features/reports'",
  1
 ],
 [
  "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
  "/** Download name from the saved report name, stripped of characters file systems reject. */\nexport const reportFileName = (name: string, reportId: string, extension: string) => {\n  const base = Array.from(name, (char) => (char < ' ' || '\\\\/:*?\"<>|'.includes(char) ? ' ' : char))\n    .join('')\n    .replace(/\\s+/g, ' ')\n    .replace(/^[\\s.]+|[\\s.]+$/g, '')\n    .slice(0, 150)\n  return `${base || `report-${reportId}`}.${extension}`\n}\n",
  "",
  1
 ],
 [
  "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
  "import { useEffect",
  "import { reportFileName } from '../reports.utils'\nimport { useEffect",
  1
 ],
 [
  "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
  "  kinds,\n  reportFileName,\n} from",
  "  kinds,\n} from",
  1
 ],
 [
  "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
  "  it.each([\n    ['Q3: North/South <draft>?', 'Q3 North South draft.pdf'],\n    ['  ...  ', 'report-30000000-0000-4000-8000-000000000003.pdf'],\n  ])('makes the report name %j a safe file name', (name, expected) => {\n    expect(reportFileName(name, '30000000-0000-4000-8000-000000000003', 'pdf')).toBe(expected)\n  })\n",
  "",
  1
 ],
 [
  "apps/web/src/import-direction.test.ts",
  "'@/features/reports/reporting-workspace'",
  "'@/features/settings/audit-log-workspace'",
  1
 ]
]
```

```bash
node .tmp/s6b/replace-exact.mjs .tmp/s6b/task4-edits.json
sed -i "s/^\(const indexedFeatures: readonly string\[\] = \[.*\)\]$/\1, 'reports']/" apps/web/src/import-direction.test.ts
sed -i "s#\(optimizePackageImports: \[[^]]*\)\]#\1, '@/features/reports']#" apps/web/next.config.ts
grep -n "indexedFeatures: readonly" apps/web/src/import-direction.test.ts
grep -n "optimizePackageImports" apps/web/next.config.ts
git add -N apps
pnpm exec biome check --write apps/web/src apps/web/next.config.ts
git grep -n "features/reports" -- 'apps/web/src/app' | cut -d: -f1,3
git grep -n "features/reports" -- apps/web/src | grep -v "^apps/web/src/\(app\|features/reports\)/" | cut -d: -f1,3
```

Expected: thirteen replacements, the two list edits, and the imports of the feature from outside it go through the index:

```
13 replacements in 11 files
57:const indexedFeatures: readonly string[] = ['projects', 'beneficiaries', 'reports']
48:    experimental: { optimizePackageImports: ['@/features/projects', '@/features/beneficiaries', '@/features/reports'] },
Checked 743 files in <ms>. Fixed 9 files.
apps/web/src/app/(dashboard)/reports/beneficiary-summary/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/(dashboard)/reports/indicator-summary/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/(dashboard)/reports/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/(dashboard)/reports/preview/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/(dashboard)/reports/project-summary/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/(dashboard)/reports/survey-results/page.tsx:import { ReportingPage } from '@/features/reports'
apps/web/src/app/print/reports/[id]/page.tsx:} from '@/features/reports'
apps/web/src/features/projects/budget/print/print-receipt-view.tsx:import { Band, Table, td } from '@/features/reports'
apps/web/src/import-direction.test.ts:      "const e = await import('@/features/reports/e')",
apps/web/src/lib/api/reports.test.ts:import { sampleProjectReport } from '@/features/reports/print/print-report-sample'
```

The 13 replacements are the specifier edits in 11 files (the live workspace and its test, the six pages, the print page, the print receipt and the direction test, whose sample specifier named the deleted `reporting-workspace`). The last two commands list every use of the feature from outside it: the six pages, the print page and the budget print receipt import the index; the two remaining lines are a lib-layer sample specifier in `import-direction.test.ts` and the `sampleProjectReport` fixture import of `lib/api/reports.test.ts`, which a test may take from the feature's print folder (the direction test skips test files).

- [ ] **Step 4: Verify and compare the route bundles**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
.tmp/s6b/build-routes.sh layout
node .tmp/s6b/compare-routes.mjs .tmp/s6b/routes-pre-layout.txt .tmp/s6b/routes-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean, the two baseline `--noUnusedLocals` lines, lint clean, the web suite gains one file, and the layout build equals the pre-layout build except for a 1 kB difference on the dashboard:

```
web typecheck clean
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
Checked 1411 files in <ms>. No fixes applied.
 Test Files  243 passed (243)
      Tests  2197 passed (2197)
exit 0
ƒ Middleware                                                      103 kB
/dashboard: 666 kB -> 667 kB (+1.0)
routes 72, different 1
```

The web suite gains one file (`reports.utils.test.ts`) and no test: the two `reportFileName` rows moved. The dashboard route is 1 kB bigger than in the pre-layout build, which ruling 9 allows (the pass criterion is no route more than 1 kB bigger). A build that fails with a `Module not found` for an old path ran on a stale cache (ruling 9).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "refactor(web): lay out features/projects/budget and evaluation and features/reports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the commit holds 48 files: 25 renames, three created files and 20 modified files:

```
[<branch> <sha>] refactor(web): lay out features/projects/budget and evaluation and features/reports
 48 files changed, 100 insertions(+), 75 deletions(-)
 rename apps/web/src/features/projects/{budget-module/budget-math.test.ts => budget/budget.utils.test.ts} (99%)
 rename apps/web/src/features/projects/{budget-module/budget-math.ts => budget/budget.utils.ts} (100%)
 rename apps/web/src/features/projects/{ => budget/components}/activity-expense-dialog.test.tsx (100%)
 rename apps/web/src/features/projects/{ => budget/components}/activity-expense-dialog.tsx (99%)
 rename apps/web/src/features/projects/{ => budget/components}/activity-expense-review-dialog.test.tsx (100%)
 rename apps/web/src/features/projects/{ => budget/components}/activity-expense-review-dialog.tsx (100%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-actions.tsx (99%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-ledger.test.tsx (97%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-ledger.tsx (98%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-module.tsx (98%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-overview.tsx (97%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/budget-transparency.tsx (95%)
 rename apps/web/src/features/projects/{budget-module => budget/components}/expense-review-drawer.tsx (98%)
 rename apps/web/src/features/projects/{budget-module => budget/hooks}/use-budget-module.ts (93%)
 rename apps/web/src/features/projects/{budget-module => budget}/print/print-receipt-amount.ts (100%)
 rename apps/web/src/features/projects/{budget-module => budget}/print/print-receipt-page.tsx (100%)
 rename apps/web/src/features/projects/{budget-module => budget}/print/print-receipt-payload.ts (100%)
 rename apps/web/src/features/projects/{budget-module => budget}/print/print-receipt-view.tsx (98%)
 rename apps/web/src/features/projects/{budget-module => budget}/print/print-receipt.test.tsx (100%)
 rename apps/web/src/features/projects/{ => evaluation/components}/live-evaluation-workspace.test.tsx (99%)
 rename apps/web/src/features/projects/{ => evaluation/components}/live-evaluation-workspace.tsx (99%)
 rename apps/web/src/features/reports/{ => components}/live-reporting-workspace.test.tsx (97%)
 rename apps/web/src/features/reports/{ => components}/live-reporting-workspace.tsx (97%)
 rename apps/web/src/features/reports/{ => components}/reporting-page.test.tsx (100%)
 rename apps/web/src/features/reports/{ => components}/reporting-page.tsx (100%)
 create mode 100644 apps/web/src/features/reports/index.ts
 create mode 100644 apps/web/src/features/reports/reports.utils.test.ts
 create mode 100644 apps/web/src/features/reports/reports.utils.ts
```


---

### Task 5: Records

**Files:**
- Create (gitignored): `.tmp/s6b/task5-edits.json`, `activity-s6b.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16, MOD-17 rows), `docs/qad-pathways.md` (QAD-T89, QAD-T90; QAD-T18 changed in Task 1), `docs/deferred-features.md` (rows 53 to 57, 70 to 74, 90), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 10): `scripts/sad/check.ts` already routes `apps/web/src/lib/api/**/*.ts` and `apps/web/src/lib/services/**/*.ts` to `beneficiary-privacy-guardian`, and `apps/web/src/**` to `design-qa-agent`.

- [ ] **Step 1: Amend the change record, the living docs and the index**

Create each file with the Write tool, exactly as printed. `.tmp/s6b/task5-edits.json` holds the exact replacements (the layout paragraph in section 3.3, the S6b applied paragraph of section 9 after the S6a "Deferred to S6b" paragraph, the QAD and deferred feature paths); `@DATE@` is replaced by the day Task 5 runs and `@M0@` by the Middleware size of Task 0:

Create `.tmp/s6b/task5-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "### 3.4 Shared package layout (`packages/shared/src/`)\n",
  "A feature index may also export the print primitives another feature's print view reuses (`Band`, `Table` and `td` from `@/features/reports` for the budget print receipt). `features/projects/budget` holds the budget screens, the two activity expense dialogs and the print receipt as `components/`, `hooks/` and `print/` with `budget.utils.ts`, `features/projects/evaluation/components` holds the evaluation workspace, and `features/reports` keeps `components/`, `print/`, `reports.utils.ts` and an `index.ts` that lists its leaf exports (amended @DATE@ for S6b).\n\n### 3.4 Shared package layout (`packages/shared/src/`)\n",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "Deferred to S6b: the web client members, reports feature, budget module, evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts. Left to S7: the `dashboards <-> reports` pair and the longer cycles through `dashboards`.",
  "Deferred to S6b: the web client members, reports feature, budget module, evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts. Left to S7: the `dashboards <-> reports` pair and the longer cycles through `dashboards`.\n\nS6b applied @DATE@ on the S6b slice branch:\n- Dead code: `features/reports/reporting-workspace.tsx` (1123 lines), `survey-report-overview.tsx`, `survey-report-utils.ts`, their three tests, `reportKindPermissions` in `lib/rbac/policy.ts` and 11 report and survey types of `types/pathways.ts` were deleted, because no production file imported them (S6 ruling 12); the 18 tests of the deleted code are listed in the activity log, and QAD-T18 now cites `features/analytics/analytics-dashboard.test.tsx`, which renders the survey table with activity titles and the `%` and `pp` units.\n- Clients: `lib/api/finance.ts` holds `financeClient` (9 methods), `lib/api/evaluations.ts` holds `evaluationsClient` (6 methods and `getBeneficiaryAssessments`, with its parsers in `evaluations.schema.ts`) and `lib/api/reports.ts` holds `reportsClient` (5), with the owned JSON read and post in `lib/api/core/owned-json-read.ts`; request bodies are typed from the S6a contracts, the response schemas moved verbatim, and `lib/services/report-sections.ts` became `lib/api/report-sections.ts`. `core-feature-client.ts` keeps `coreFeatureClient` (publication), `coreDataClient.audit` and the artifact helpers (529 to 173 lines), and `pathways-client.ts` went from 407 to 330 lines.\n- Callers: 12 production files (32 calls) and 8 mock factories in 8 test files follow the new clients; the characterization tests ran against the old and the new clients before the old members went, and the core client tests were split by client with every case kept (the three titles that changed are named in the activity log).\n- Layout: the 15 files of `features/projects/budget-module` and the four activity expense dialog files became `features/projects/budget/{components,hooks,print}` with `budget.utils.ts` (was `budget-math.ts`), the evaluation workspace and its test became `features/projects/evaluation/components`, and `features/reports` got `components/`, `reports.utils.ts` (`reportFileName`) and an `index.ts` that the six report pages and the print report page import; `import-direction.test.ts` lists `reports` among the indexed features and `optimizePackageImports` names its barrel.\n- Tests: web 242 files and 2071 tests became 243 and 2197, shared and api unchanged.\n- Routes: Middleware stayed at @M0@ kB in the cloud container; the dead code and the old client members leaving the shared chunk moved 21 routes by 1 to 5 kB, and the layout move changed one by 1 kB.\n- Decisions: S6b split into S6b and S6c (ruling 1); the dead workspace chain is deleted and QAD-T18 follows the analytics test (ruling 2); `getBeneficiaryAssessments` moves to `evaluationsClient` (ruling 5); the evaluation workspace sits in `evaluation/components`, and `reports` exports the print primitives the budget receipt uses (ruling 8).\n\nDeferred to S6c: the response contracts for the finance, evaluation and report routes in `packages/shared`, the report kind grant table shared by the web and the api, the splits of `live-reporting-workspace.tsx` and `live-evaluation-workspace.tsx`, and the `finance-budgets` read key; the deferred web items named for S6b above are otherwise done.",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/projects/budget-module/budget-math.test.ts",
  "apps/web/src/features/projects/budget/budget.utils.test.ts",
  2
 ],
 [
  "docs/deferred-features.md",
  "`apps/web/src/features/projects/budget-module/` `budget-math.ts`",
  "`apps/web/src/features/projects/budget/` `budget.utils.ts`",
  1
 ],
 [
  "docs/deferred-features.md",
  "`apps/web/src/features/projects/budget-module/` `budget-overview.tsx`",
  "`apps/web/src/features/projects/budget/components/` `budget-overview.tsx`",
  1
 ],
 [
  "docs/deferred-features.md",
  "`apps/web/src/features/projects/budget-module/` `budget-transparency.tsx`",
  "`apps/web/src/features/projects/budget/components/` `budget-transparency.tsx`",
  1
 ],
 [
  "docs/deferred-features.md",
  "`apps/web/src/features/projects/budget-module/` `budget-ledger.tsx`",
  "`apps/web/src/features/projects/budget/components/` `budget-ledger.tsx`",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/projects/budget-module/budget-overview.tsx`; `apps/web/src/features/projects/budget-module/budget-math.ts`",
  "apps/web/src/features/projects/budget/components/budget-overview.tsx`; `apps/web/src/features/projects/budget/budget.utils.ts`",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/projects/live-evaluation-workspace.tsx",
  "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
  4
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/projects/live-evaluation-workspace.test.tsx",
  "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
  1
 ]
]
```

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g; s/@M0@/$(cat .tmp/s6b/m0)/g" .tmp/s6b/task5-edits.json
node .tmp/s6b/replace-exact.mjs .tmp/s6b/task5-edits.json
sed -i -e '/^| MOD-05 /s/\. |$/; finance, evaluation and report clients by S6b. |/' \
  -e '/^| MOD-06 /s/\. |$/; dead reporting workspace deleted by S6b, the live reporting and evaluation components split in S6c. |/' \
  -e '/^| MOD-15 /s/\. |$/; reports index and budget and evaluation folders by S6b. |/' \
  -e '/^| MOD-16 /s/\. |$/; the finance read key and the report kind grants left to S6c by S6b. |/' \
  -e '/^| MOD-17 /s/\. |$/; budget, evaluation and reports laid out by S6b. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
sed -i '/^| \[cr-pathways-codebase-modularization\]/{s/ and S6a applied/, S6a and S6b applied/;s/S6b next/S6c next/}' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
git grep -nE "budget-module|budget-math|features/projects/live-evaluation|reporting-workspace|survey-report-" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' | cut -c1-110
```

Expected: ten replacements in three docs files, the audit rows extended, the index status updated, and no living doc names an old path:

```
10 replacements in 3 files
 docs/audit-pathways-codebase-modularity-20261009.md | 10 +++++-----
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++++
 docs/deferred-features.md                           | 20 ++++++++++----------
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  4 ++--
 5 files changed, 31 insertions(+), 18 deletions(-)
ients by S5b; finance, evaluation and report clients by S6b. |
, the live reporting and evaluation components split in S6c. |
S4b; reports index and budget and evaluation folders by S6b. |
ance read key and the report kind grants left to S6c by S6b. |
Form by S4c; budget, evaluation and reports laid out by S6b. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S6a and S6b applied, S6c next |
```

Correct the `Routes:` sentence of the S6b paragraph (inserted by the first replacement) from the compare output of Task 4 Step 1 and Task 6 Step 1 if your container prints other sizes. The index status line is the CR row; its middle part depends on what S4c and S5b wrote there, so check only that it now ends with `S6a and S6b applied` (inside the applied list) and `S6c next`; if S4c or S5b changed the sentence so that the two seds above do not match, edit the row by hand to say that S6a and S6b are applied and S6c is next. The last command lists nothing: every path the living docs name follows the move (the historical documents, the audit rows and the change records keep the names they were written with).

- [ ] **Step 2: Activity log**

`.tmp/s6b/activity-s6b.md` is the S6b section of the activity log, with the commit hashes of Tasks 1 to 4 as `@H1@` to `@H4@` (`@H3B@` is the report sections move):

Create `.tmp/s6b/activity-s6b.md`:

```md

## @DATE@ Modularization S6b finance and reports web (claude/modularization-s6b-9ept8o)
- Task 1 (@H1@): the production-dead reporting workspace chain deleted (`reporting-workspace.tsx` 1123 lines, `survey-report-overview.tsx`, `survey-report-utils.ts` with their three tests, `reportKindPermissions`, 11 report and survey types of `types/pathways.ts`, three entries of the UI copy contract test); the 18 tests lost with it are 4 of `reporting-workspace.test.tsx`, 1 of `survey-report-overview.test.tsx`, 11 of `survey-report-utils.test.ts` and 2 rows of the UI copy contract; QAD-T18 now cites `analytics-dashboard.test.tsx`; web 242 files and 2071 tests became 239 and 2053.
- Task 2 (@H2@): `lib/api/finance.ts`, `evaluations.ts` with `evaluations.schema.ts`, `reports.ts` and `core/owned-json-read.ts` generated from the members still in `core-feature-client.ts` and `pathways-client.ts` (`same-lines` lost 0), and `finance.test.ts`, `evaluations.test.ts` and `reports.test.ts` pinned 146 cases against the old and the new client (292 runs, covering the record ids, the identity checks and every response bound; a request mutation fails 2); web 242 files and 2345 tests.
- Task 3 (@H3@, @H3B@): 12 production files (32 calls) and 8 mock factories in 8 test files switched to the new clients, the 20 members, their schemas and the assessment parsers left the old clients (`core-feature-client.ts` 529 to 173 lines, `pathways-client.ts` 407 to 330), the old rows of the characterization tests were dropped and the core client tests were split by client with every case kept (three titles changed: two survey preview context titles carry the fixture project id, and `requests the enrollment-scoped list and parses the rows` became `requests the enrollment-scoped list with the signal and parses the rows`); `report-sections.ts` moved to `lib/api`; web 242 files and 2197 tests.
- Task 4 (@H4@): the 15 files of `features/projects/budget-module` and the four activity expense dialog files moved into `features/projects/budget/{components,hooks,print}` with `budget.utils.ts`, the evaluation workspace and its test into `features/projects/evaluation/components`, the four report files into `features/reports/components`, `reportFileName` into `reports.utils.ts` with its test, `features/reports/index.ts` added, the six report pages and the print report page switched to it and `reports` added to `indexedFeatures` and `optimizePackageImports`; web 243 files and 2197 tests, routes within 1 kB.
- Task 5: the change record, audit, QAD and deferred features rows follow the new paths and the S6b disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and `lib/services/**/*.ts` already route to the beneficiary privacy guardian.
- Decisions: the S6b decisions are recorded in the change record section 9; the plan stays until S6c is planned because it holds the S6c outline.
- Deferred to S6c: the response contracts for the finance, evaluation and report routes, the report kind grant table, the splits of `live-reporting-workspace.tsx` and `live-evaluation-workspace.tsx` and the `finance-budgets` read key.
```

```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^refactor(web): delete the production-dead')
H2=$(git log -1 --format=%h --grep='^refactor(web): add the finance, evaluation')
H3=$(git log -1 --format=%h --grep='^refactor(web): move the finance, evaluation and report callers')
H3B=$(git log -1 --format=%h --grep='^refactor(web): move the report sections')
H4=$(git log -1 --format=%h --grep='^refactor(web): lay out features/projects/budget')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H3B@/$H3B/" -e "s/@H4@/$H4/" .tmp/s6b/activity-s6b.md
grep -c "@H[0-9B]*@\|@DATE@" .tmp/s6b/activity-s6b.md
cat .tmp/s6b/activity-s6b.md >> docs/activity-log.md
tail -9 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters):

```
0

## 2026-10-13 Modularization S6b finance and reports web (claude/modularization-s6b-9ept8o
- Task 1 (<sha>): the production-dead reporting workspace chain deleted (`reporting-work
- Task 2 (<sha>): `lib/api/finance.ts`, `evaluations.ts` with `evaluations.schema.ts`, `
- Task 3 (<sha>, <sha>): 12 production files (32 calls) and 8 mock factories in 8 test
- Task 4 (<sha>): the 15 files of `features/projects/budget-module` and the four activit
- Task 5: the change record, audit, QAD and deferred features rows follow the new paths an
- Decisions: the S6b decisions are recorded in the change record section 9; the plan stays
- Deferred to S6c: the response contracts for the finance, evaluation and report routes, t
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git commit -m "docs: record modularization S6b

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 6 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1411 files in <ms>. No fixes applied.
[<branch> <sha>] docs: record modularization S6b
 6 files changed, 40 insertions(+), 18 deletions(-)
```


---

### Task 6: Full release gates

This slice opens no pull request: it is stacked below the next slice, and the final pull request of the series carries the DB replay and the other CI gates. The gates below run on the slice branch and are recorded in the activity log.

- [ ] **Step 1: Static gates**

```bash
pnpm lint && pnpm typecheck
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s6b/build-routes.sh gates
node .tmp/s6b/compare-routes.mjs .tmp/s6b/routes-baseline.txt .tmp/s6b/routes-gates.txt | tail -3
node .tmp/s6b/compare-routes.mjs .tmp/s6b/routes-pre-layout.txt .tmp/s6b/routes-gates.txt | tail -2
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```

Expected: Biome clean, then the typecheck and test summaries, route comparisons and docs check:

```
Checked 1411 files in <ms>. No fixes applied.
Scope: 5 of 6 workspace projects
packages/config typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/config typecheck: Done
packages/shared typecheck: Done
packages/imports typecheck$ tsc -p tsconfig.json --noEmit
packages/imports typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/api typecheck$ tsc --noEmit
apps/api typecheck: Done
apps/web typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  675 passed (675)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  243 passed (243)
apps/web test:       Tests  2197 passed (2197)
      Tests  57 passed (57)
exit 0
ƒ Middleware                                                      103 kB
/transparency: 263 kB -> 260 kB (-3.0)
/transparency/[projectId]/preview: 248 kB -> 246 kB (-2.0)
routes 72, different 21
/dashboard: 666 kB -> 667 kB (+1.0)
routes 72, different 1

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
$ pnpm exec biome check .
$ pnpm -r --if-present run typecheck
```

Biome is clean, then the typecheck and test summaries are the baselines with the deltas of the Expected lines above: web is `B_web` plus 1 file and 126 tests, and config, shared, imports, api and sad equal `B_config`, `B_shared`, `B_imports`, `B_api` and `B_sad`. The first compare is against the Task 0 build (the figures depend on the slices below this one; none may be more than 1 kB bigger and Middleware must equal `M0`) and the second against the pre-layout build (one route, the dashboard, is 1 kB bigger). `docs:check` ends with the 6 baseline failures and 1 warning.

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S6b changes no migration, so the CI replay of the final pull request of the series (expect 171 PASS, 0 FAIL) is the gate when the replay cannot run here; record which one ran.

Expected: in the planning container (root, no Supabase CLI) the replay cannot start:

```
0
/usr/bin/pwsh
clusterdb
supabase missing
/usr/bin/docker
HISTORICAL_MIGRATION_INTEGRITY=PASS
initdb: error: cannot be run as root
initdb: hint: Please log in (using, e.g., "su") as the (unprivileged) user that will own the server process.
PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.
```

The migration integrity check passes; the cluster step fails because the user is root (`id -u` prints 0). Where the user is not root and PostgreSQL 18 is present, the script ends with `PHASE6_LOCAL_REPLAY=PASS` (not seen in the dry run). Record in the activity log which of the two ran.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, `pnpm dev:local` boot and the route curls, both Playwright configs and the browser smoke) as pending local run in the activity log gate line and list it for the developer; do not skip Steps 1, 2 or 4. Stop anything on ports 3000 and 4000 first, then:

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev: open `/reports` and each of its kind pages (project summary, indicator summary, beneficiary summary, survey results), preview a report, generate one and download it, and open the print view of a report (`/print/reports/<id>`); open a project's Budget tab, add and review an expense from the ledger, open the expense review drawer and open the print receipt (`/print/receipts/<expenseId>`); open a project's activities workspace and submit an expense with a receipt and review a pending one from the activity expense dialogs; open a project's monitor and evaluate tab, start an evaluation, score it, submit, return and sign it off; open a beneficiary record and see its assessments panel fill (and show the unavailable note for a role without the step-up grant); open the evidence tab and see the project's saved reports list; open the dashboard as a role that reads evaluations and see the evaluation counts.

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s6b
pnpm sad:check --base "$(cat .tmp/s6b/base-sha)" --head HEAD --output .tmp/sad/s6b/manifest.json > .tmp/sad/s6b/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s6b/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0, writes the manifest, and the roles and their path counts are:

```
exit 0
organization-isolation-checker 1
beneficiary-privacy-guardian 14
design-qa-agent 104
```

`.tmp/sad/s6b/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. The counts are the dry run; they move by a few paths if the branch holds other slices (they also include the paths of the slices below, since the base is the Task 0 head).

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s6b/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s6b/assemble.mjs`, run `node .tmp/sad/s6b/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s6b/base-sha)" --head HEAD --reviews .tmp/sad/s6b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The dry run could not dispatch the roles (no subagents in the planning copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 5 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The bullet below takes its date, head and Middleware size from the commands and is to be adapted with your own numbers (the package counts must equal the Task 0 baselines, except the web files and tests, which are the Task 0 baseline plus 1 file and 126 tests); it holds no backtick or backslash, so the unquoted heredoc is safe:

```bash
D=$(date +%F)
H=$(git rev-parse --short HEAD)
M0=$(grep Middleware .tmp/s6b/routes-baseline.txt | grep -oE '[0-9]+ kB' | head -1)
cat >> docs/activity-log.md <<LOG
- Gates ($D, cloud container, head $H): lint, typecheck and tests pass with config 19, shared 675, imports 94, api 2610 passed and 21 skipped, web 243 files and 2197 tests (292 characterization runs, 18 tests of the dead code gone), sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware $M0 and, against the Task 0 build, 21 of 72 routes 1 to 5 kB smaller or 1 kB bigger and, against the pre-layout build, the dashboard 1 kB bigger; SAD sign-off pending; replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: the developer asked for one pull request after every slice is implemented.
LOG
git add docs/activity-log.md
git commit -q -m "docs: record modularization S6b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -2
git log --oneline "$(cat .tmp/s6b/base-sha)"..HEAD | wc -l
git status --short | wc -l
```

Expected: one file, one line added, eight commits on the slice branch since the base (the plan commit, the five code commits of Tasks 1 to 4, the records and this one) and a clean tree:

```
 docs/activity-log.md | 1 +
 1 file changed, 1 insertion(+)
8
0
```

- [ ] **Step 6: Hand off, no pull request**

Do not push and do not open a pull request: the developer asked for one pull request into `dev` after every slice is implemented, so S6b stays on its branch stacked on the S5b branch and the controller pushes it at task-pair boundaries. This plan holds the S6c outline, so its `docs/superpowers/plans` and `docs/handoff` copies stay; no plan copy is removed in this slice, and the controller removes the executed copies (the S6 plan copy among them) after the final merge. Report the branch tip, the commit list (`git log --oneline "$(cat .tmp/s6b/base-sha)"..HEAD`), the Task 0 baselines and the Task 6 results, and name what stays pending: the database replay (CI), seeds, `pnpm dev:local`, e2e, the browser smoke and the SAD sign-off.

---

## S6c outline (response contracts, report kind grants, oversized workspaces and read keys, its own slice branch)

To be written as its own plan after S6b is applied; that plan's Task 0 adds its own plan copy to `docs/superpowers/plans` as S6b Task 0 did and removes none: the controller removes executed plan copies, this one included, after the final merge. Counts below were taken at the S6b tip of the dry run and must be recounted in S6c Task 0, together with the S4c and S5b results.

**Interfaces assumed from S6b:** `lib/api/finance.ts`, `evaluations.ts` (with `evaluations.schema.ts`), `reports.ts` and `report-sections.ts`; `features/projects/budget/{components,hooks,print}` with `budget.utils.ts`; `features/projects/evaluation/components/live-evaluation-workspace.tsx` (531 lines, test 299); `features/reports/components/live-reporting-workspace.tsx` (542 lines, test 509) and `reports.utils.ts`; `features/reports/index.ts`; `reports` in `indexedFeatures` and `optimizePackageImports`; S6a request contracts in `packages/shared`.

- **Task 0, baseline:** recount every number below; record web Middleware (`M0`) and the route table; confirm the S6b files exist and that `coreDataClient` has the one member `audit`.
- **Task 1, response contracts:** the web response schemas that mirror S6a routes move to `packages/shared/src/contracts/{finance,evaluations,reports}/*-responses.ts`: `budgetSchema`, `expenseSchema` and `expenseAck` (`lib/api/finance.ts`), `reportPreviewSchema`, `reportSchema` and `evaluationRoundSchema` (`lib/api/reports.ts`, with `reportSectionsSchema` from `lib/api/report-sections.ts`), and `criterionSchema`, `criterionSnapshotSchema`, `evaluationScoreSchema`, `evaluationDetailSchema` and `evaluationSchema` (`lib/api/evaluations.ts`). The web keeps parsing them at runtime (the `projectId` and `id` refinements stay in the web client), as S3 ruling 8 allows for responses already parsed before the modularization, and the api functions (`finance.service.ts`, `reports.service.ts`, `evaluations.mapper.ts` and the detail reads) get the inferred return types where the shapes match exactly; a mismatch is reported, not fixed by a cast. The strict unknown-key refusals pinned by the S6b client tests must keep passing against the shared schemas. The hand-written assessment parsers in `evaluations.schema.ts` stay (the S4b ruling on parsers that check bounds a schema does not express).
- **Task 2, report kind grants:** `kinds` and `allowedKinds` in `live-reporting-workspace.tsx` restate the api `kindPermission`, `extraKindRequires` and `readableReportKinds` in `apps/api/src/modules/reports/reports.helpers.ts`; move the grant table (permission and extra grants per kind, without labels) to `packages/shared/src/rbac/report-kind-grants.ts`, have the web and the api list route use it, and keep `assertReportPermission` on its own rules (it does not require the beneficiary aggregate grants, whose refusal has its own 403 text). A parity test runs both old functions and the shared one over every role in `rolePermissions` before either copy is removed. SAD: `packages/shared/src/rbac/**` already routes to organization-isolation-checker.
- **Task 3, `live-reporting-workspace.tsx` (542) and its test (509):** split by component and hook, verbatim, with characterization tests first where the existing tests do not render the moved part; `components/` holds one component per file, `hooks/` the report preview, report list and generate state; `reports.utils.ts` already holds `reportFileName`.
- **Task 4, `live-evaluation-workspace.tsx` (531) and its test (299):** split by component and hook the same way; `statusTone` (line 30) is typed to F4b's `StatusTone`; the direct `principalHasAtomicPermission(profile, ...)` calls stay (F4a left no local wrapper here; `budget-ledger.tsx` already uses `usePermission`). The deferred row "Split the evaluation workspace component" in `docs/deferred-features.md` becomes resolved.
- **Task 5, read keys:** `budget.reads.ts` holds the `finance-budgets` key now read in `budget/hooks/use-budget-module.ts` (line 21) and in `activities/hooks/use-activity-expenses.ts` (line 43); `budget/` gets no sub-index; share it only if the fetcher, permission and freshness are identical (one key serves one cache entry), and record the comparison either way.
- **Task 6, records:** CR section 9 S6c disposition, audit MOD-06 and MOD-16 (finance, evaluation and report parts), the deferred feature row, QAD paths, index, activity log.
- **Task 7, gates and merge:** as S6b Task 6, with web Middleware measured and the S6b smoke over the reports pages and print view, the budget tab and print receipt, the activity expense dialogs, the monitor and evaluate tab and the beneficiary assessments panel, plus the report kind menu for every role (the list of kinds a role sees must match dev). No plan copy is removed in that slice; the controller removes the executed copies after the final merge.
