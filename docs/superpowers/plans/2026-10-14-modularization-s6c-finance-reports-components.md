# S6c Finance and Reports Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the finance, evaluation and report routes response contracts in `packages/shared`, give the report kind rules one shared grant table, split the two oversized workspaces (`live-reporting-workspace.tsx`, `live-evaluation-workspace.tsx`) into hooks and cards, and share the `finance-budgets` read, with no change to any screen, request, response, permission decision or cache entry, and with no route bundle more than 1 kB bigger.

**Architecture:** S6c is the last slice of S6 (S6a, the request contracts and the api splits, and S6b, the clients, the dead code and the feature layout, are applied below it). The response schemas that the web clients declared become `contracts/{finance,evaluations,reports}/*-responses.ts`, moved verbatim and proven by script; the api annotates its mappers and services with the inferred types (type only, so a renamed field fails its typecheck, shown by three renames) and the web keeps parsing the same schemas, narrowing with `.extend` where the api type is wider. The permission and extra grants each report kind needs, written out twice (the api list route and refusal, and the web menu), move to one table in `packages/shared/src/rbac`, with parity tests over every role and every subset of the relevant grants that run against the old code before the swap and stay afterwards. The two workspaces are cut by line range into hooks and cards (`cut.mjs`, with `same-lines.mjs` printing `lost 0` and listing the lines the split adds), after characterization rows that pass against the old code; the tests that move keep every row and assertion (`count-it.mjs` and a title comparison). The duplicated `finance-budgets` read becomes one hook after a comparison of the two calls. Mechanical edits use one-off Node scripts under `.tmp/s6c/` (gitignored, never committed) whose content is given in full. Every step below was replayed in order by one driver that executes the code blocks of this plan, on a copy of the S5c tip, and the counts quoted below come from that replay. S4c, S5b and S5c are applied in that base; they touch beneficiary and collection files this plan does not edit.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), NestJS api with Prisma, Vitest 3.2, Biome 1.9.4, zod 3.25.76.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.4, 3.6 and 9, including the S6b disposition and its "Deferred to S6c" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05 for the response contracts, MOD-06 for the two workspaces, MOD-16 for the read key and the grant table).

## Rulings

Controller rulings for S6c. Each was checked on the replay copy; Task 0 recounts them. Rulings 1 and 11 of the S6b plan (the split of S6b and S6c, and what S6c takes) are the origin of this plan.

1. **Nine tasks, no further split.** Tasks 0 to 8 (baseline, response contracts, web parse, report kind grants, reporting workspace, evaluation workspace, read key, records, gates) stay under the ten-task line, and each is bounded: the largest, Task 4, is three commits and the one split of the reporting workspace. No S6d outline follows. Cost if wrong: executor fatigue in a long plan.
2. **Response contracts are types in the api and parsed in the web.** CR section 3.6 says response schemas are types only, and that a response already parsed before the modularization stays parsed; the web clients parsed all of these responses with local schemas, so they keep parsing, now with the shared schemas, and the api only annotates (`satisfies`, return types), never parses. A renamed or dropped field then fails the api typecheck: Task 1 renames one field in each of the mapper, the finance rows and the report list and shows three errors. Names follow CR 3.6 (`budgetResponse`, `BudgetResponse`); the old web names are the `--rename` arguments of the proof. Cost if wrong: an api type that drifts from what the web accepts, which the added web rows and the shared tests pin.
3. **The web narrows with `.extend` where the api type is wider, and the shared schemas stay as wide as the api.** The stored currency is a three character string, so the web keeps `z.literal('PHP')`; the stored report type holds `OTHER`, which no route lists, so the web keeps the six kinds; the stored round status has five values, but the route lists signed-off and archived rounds only, so the web keeps those two. Each narrowing is a counted `--edit` argument of the move proof and has a test row (the currency row is an S6b row; Task 2 adds the stored report type `OTHER` and the round statuses `SUBMITTED` and `REVIEWED`, the two S6b left unpinned). `report-project-status.ts` is the one api file whose own type was wider than the shared one (`Figure.state` and the alert `severity` were `string`), so those two are narrowed to `MetricCell['state']` and `AlertSeverity`, type only, to let the preview `satisfies` hold without a cast. Cost if wrong: a wider response accepted by the web than before, which the three narrowing rows catch.
4. **Hand-written parsers stay.** The assessment parsers in `lib/api/evaluations.schema.ts` check bounds a schema does not express (S4b ruling), and `report-sections.ts` moves, not rewritten: `reportSectionsResponse` is the same schema (`schema-moved.mjs` prints `lost 0`) with its types renamed `ReportSectionsResponse` and `ReportStatusLevel`. Cost if wrong: none.
5. **One grant table, three parity tests, and `assertReportPermission` keeps its own rule.** `reportKindGrants` holds one row per kind (permission, extra grants) and `grantedReportKinds(role, granted)` lists the kinds a role may open, in `packages/shared/src/rbac/report-kind-grants.ts` (already routed to the organization isolation checker). The api list route and the web menu use it as it is. `assertReportPermission` reads the same row but exempts the beneficiary summary from its extra grants, because the beneficiary aggregate grants are refused by the report source with their own 403 text; a test pins that asymmetry. The shared test (128 grant subsets), the api test (256 subsets, six kinds, both helpers) and the web test (128 subsets) each carry the frozen old rule as an oracle and pass against the old code before the swap; they stay, so the table cannot drift. Cost if wrong: a role offered a kind the api refuses, or the reverse.
6. **Labels and the menu rule leave the component first.** `reportKindLabels` goes to `reports.copy.ts` and `allowedKinds` to `reports.utils.ts` (with their pure test groups, which never rendered the screen, moved by `cut.mjs` with every row and assertion; `count-it` and the title comparison show it) before the component is split, so the split moves only render code. Cost if wrong: a rename.
7. **The workspaces are cut, never retyped.** `cut.mjs` builds each new file from line ranges of the old file (hash-pinned) plus literal wrapper lines, and `same-lines.mjs` prints `lost 0` and lists every line the split added (156 for the reporting workspace, 149 for the evaluation one); those lines are the review surface. Cards take `{ context }` and `{ generation }` (or `{ workspace }`) as `Pick` of the hook result and destructure what they read, so a card that reads a value outside its `Pick` fails the typecheck and every moved line stays the same line. Conditions that wrapped a moved block (`kind === ... && (`, `createEvalOwner ? (`) stay inside a fragment in the card so that Biome cannot join them and the proof stays at `lost 0`; the DOM is the same. Cost if wrong: review time.
8. **Effect order changes in one place.** The reporting workspace is split into two hooks, so the effect that clears the survey and round choice when the project changes (it only sets those two states) now runs before the draft owners and the effect that clears the name and busy state (it only sets those two states). The two share no state, so the order within one commit changes nothing observable, and the owned retry tests (identity change, generation change, parent denial) pin the reset. The evaluation workspace keeps one hook, so its hook and effect order is the old one. Cost if wrong: an effect that fires in another order, which the render tests catch.
9. **Characterization before the split.** Four rows for the reporting workspace (fallback PDF warning, conflict message for another kind, download announcement and failure, evaluation conflict) and four for the evaluation workspace (unsaved narrative lock, failure message, one request while pending, period check) pass against the old code and stay. Task 4 adds six more reporting rows, one per report kind, that pin the permission each report read is made under (the test mock ignored it, so a wrong grant passed). The pending row of the evaluation workspace clicks twice inside one `act`, so it pins the `activeOperation.current` half of the guard `busy || activeOperation.current` in `run` (the second click sees the screen as it was before the first rendered); removing only `busy` changes nothing a test can see, because the ref is set in the same call as the state. Cost if wrong: a double submit in a race.
10. **`statusTone` is typed to `StatusTone`.** With `as const satisfies Record<EvaluationDetail['status'], StatusTone>` the object is unchanged, a status given a tone the badge does not render fails the typecheck (shown in Task 5), and `same-lines` is told that one closing line. Cost if wrong: none.
11. **The `finance-budgets` read is shared after a comparison.** `read-calls.mjs` lists the two production calls: same key, project, permission, fetcher and freshness, with only the `enabled` flag different. They share `useBudgetsRead(projectId, enabled = true)` in `budget/budget.reads.ts`, with a test of the key, permission, default and fetcher; `budget/` gets no sub-index. One key serves one cache entry, and no argument differs. The two call sites are shown by a command in Task 6 (no test renders the budget module, and the `enabled` argument of the activity call repeats the permission and scope check of `useAuthorizedRead`, so no test separates it from the default). Cost if wrong: a cache entry shared by reads that differ; none differ.
12. **Not done here.** No index is added for `features/projects/evaluation` (no file outside `features/projects` imports it). No plan copy is removed inside the slice (this overrides the S6b outline's Task 0 and Step 6 for S6c): the controller removes the executed copies after the final merge of the series. The direct `principalHasAtomicPermission(profile, ...)` calls of the evaluation hook stay (F4a left no local wrapper). Cost if wrong: one later edit.
13. **Cross-plan.** S4c (beneficiary components), S5b and S5c (collection web and components) are applied below this slice; S5c added `collection` to the indexed features of the direction test and to `optimizePackageImports`, which now list `projects`, `beneficiaries`, `reports` and `collection`. This plan edits no beneficiary or collection file, `next.config.ts` and the direction test's feature lists are untouched (Task 0 checks that `collection` is listed in both), and S8 reads none of the files edited here (S8 reads `core-feature-client.ts`, which this slice leaves alone). Counts that those slices change are recounted in Task 0. Cost if wrong: a later Task 0 stops on a count.
14. **Builds and gates.** Every production build starts from a clean `.next`; Task 8 compares the route table with the Task 0 baseline (no route more than 1 kB bigger, Middleware at `M0`, the value Task 0 measures). Seeds, dev servers, e2e and the browser smoke are recorded as pending local run, and the DB replay is the CI gate of the final pull request of the series. No new SAD routing: `packages/shared/src/rbac/**`, `*.service.ts`, `*.mapper.ts` and `*.helpers.ts` already route to the isolation checker, `packages/shared/src/contracts/**` and `apps/web/src/lib/api/**` to the beneficiary privacy guardian, and `apps/web/src/**` to the design QA agent. The replay measured four routes at +1 kB (at the printed precision), none more. Cost if wrong: one glob in `scripts/sad/check.ts`.
15. **Files above 300 lines stay.** `budget-ledger.tsx` (327 lines) and `activity-expense-dialog.tsx` (304), moved verbatim by S6b, are not edited here and stay above the 300 line target; splitting them is not one of the MOD-05, MOD-06 and MOD-16 items. Task 7 records them in the change record, as S4c did for its files, together with the guards no test pins. Cost if wrong: one more split slice.

## Interfaces assumed from earlier sub-projects

- S6a (from `@pathways/shared`): `CreateBudgetRequest`, `ReplaceBudgetRequest`, `SubmitExpenseRequest`, `ReviewExpenseRequest`, `CreateEvaluationRequest`, `SaveEvaluationScoresRequest`, `SubmitEvaluationRequest`, `ReturnEvaluationRequest`, `SignOffEvaluationRequest`, `GenerateReportRequest`, `reportKinds` and `ReportKindCode`; the api `reports.helpers.ts` with `assertReportPermission`, `readableReportKinds`, `kindPermission` and `uuid`; `contracts/{finance,evaluations,reports}/*-requests.ts` in the barrel.
- S6b: `financeClient`, `evaluationsClient`, `reportsClient` in `lib/api/{finance,evaluations,reports}.ts` and `lib/api/report-sections.ts` (deleted here); `lib/api/core/owned-json-read.ts`; `features/projects/budget/{components,hooks,print}` with `budget.utils.ts`; `features/projects/evaluation/components/live-evaluation-workspace.tsx` (531 lines, test 299); `features/reports/components/live-reporting-workspace.tsx` (542 lines, test 509) with `reports.utils.ts` (`reportFileName`) and `index.ts`; `reports` in `indexedFeatures` and `optimizePackageImports` (S5c added `collection` after it); `coreDataClient.audit`.
- F4b: `StatusTone` (`lib/format/tone`), `useAuthorizedRead`, `requestFoundation`; S3a and S2b: the `<domain>.reads.ts` convention (`activities.reads.ts`, `activities.reads.test.ts`) and `useProjectRead` in `features/projects/projects.reads.ts`; S3 ruling 8 on responses that stay parsed.

## Produces (names later plans consume)

- `@pathways/shared`: `budgetResponse`, `budgetWriteResponse`, `budgetReferenceResponse`, `expenseResponse`, `expenseAcknowledgementResponse`, `expenseSignoffResponse`, `evaluationCriterionResponse`, `evaluationScoreResponse`, `evaluationDetailResponse`, `evaluationsResponse`, `reportSectionsResponse`, `reportPreviewResponse`, `reportResponse`, `evaluationRoundResponse`, `surveyFormResponse`, `generateReportResponse` and their inferred types (`BudgetResponse`, `ReportSectionsResponse`, `ReportStatusLevel` and so on), `reportKindGrants`, `ReportKindGrant` and `grantedReportKinds`.
- Web: `features/reports/{reports.copy.ts (reportKindLabels), reports.utils.ts (reportFileName, allowedKinds), hooks/{use-report-context,use-report-generation}.ts, components/*}`; `features/projects/evaluation/{evaluation.utils.ts, hooks/use-evaluation-workspace.ts, components/*}`; `features/projects/budget/budget.reads.ts` (`useBudgetsRead`). `lib/api/report-sections.ts` and the exported `evaluationDetailSchema` no longer exist.
- Api: `reports.helpers.ts` exports `assertReportPermission`, `readableReportKinds` and `uuid` only (`kindPermission`, `isExtraReportKind` and `extraKindRequires` are gone).

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The api changes only types (annotations, two narrowed local types) and the report kind helpers, which the parity tests pin for every role. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit.
- Every move is checked by script: `schema-moved.mjs` (schemas, Task 2) and `same-lines.mjs` (code, Tasks 4 and 5) print `lost 0` before Biome reflows anything beyond what the plan names; `cut.mjs` stops on a source hash it was not written for.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the tests use the fictional ids and names already in the files.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s6c/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`features/collection/forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`); the commands strip the line and column, which move with every slice.
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit. The api and the web resolve `@pathways/shared` from its `dist`: run `pnpm --filter @pathways/shared build` after every change to `packages/shared` before a typecheck or test of the other packages (the steps below do).
- Run `.tmp/s6c/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to three minutes, so give the command a ten minute timeout.
- Vitest cannot reference imported bindings in `vi.mock` factories, so a split test keeps its own `vi.hoisted` state and `vi.mock` calls; the one test that stays a render test keeps its preamble.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s6c/` (gitignored) and are never committed; build logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` (or `apps/api`, `packages/shared`) when run from that folder.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`, or a web test file that is listed as `FAIL ... [ file ]` with no failed test when the machine is busy, as `journeys.test.ts` was once in the replay), rerun it alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the figures Task 0 marks as depending on the base (recount those and carry on with the recounted values).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the replay and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared`, `B_api` and `B_web` (and `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s6c-9ept8o`, stacked on `claude/modularization-s5c-9ept8o`); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence.
- This slice opens no pull request: one pull request into `dev` follows every slice of the series, and its CI (including the DB replay) is the gate for the whole stack, so Task 8 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 8).

## Review Focus

1. Every response schema must be the same schema it was: `schema-moved.mjs` prints `lost 0` with exactly three named narrowings, and each narrowing has a test row (Task 2). The strict unknown-key refusals of the S6b client tests pass unchanged against the shared schemas, and `response-rules.test.ts` pins every bound, enum member, format, nullable field and `.strict()` of the 15 response objects, so a loosened shared schema fails a shared test and not only a web one (Task 1).
2. The api annotations must be type-only: no schema value is imported into an api file, and a renamed response field fails the api typecheck (Task 1). The one api type change (`Figure.state`, alert `severity`) only narrows what the preview already built.
3. The grant table must not change what any role sees or is refused: three parity tests over every role and every subset ran against the old code before the swap and stay (Task 3). `assertReportPermission` still lets the beneficiary summary through to the report source for a role missing the aggregate grants, and says so in a test.
4. A moved line must be the same line: `same-lines` prints `lost 0` for the reporting workspace (480 declaration lines) and the evaluation workspace (496), and the 156 and 149 added lines are signatures, `Pick` types, destructurings, section tags and fragments (Tasks 4 and 5). The one effect that changes position is named in ruling 8.
5. A split test must keep every row and assertion: `count-it` and the title comparison print the same counts and `lost 0` (Task 4); the eight characterization rows and the six permission rows pass against the old code.
6. The shared read must not change a cache entry: the comparison of the two `finance-budgets` calls and the hook test (Task 6). No route bundle may grow by more than 1 kB: Task 8 compares against the Task 0 baseline.

## File map

| Path | Role after S6c |
|---|---|
| `packages/shared/src/contracts/{finance,evaluations,reports}/*-responses.ts` and tests, `contracts/common/response-rules.test.ts` | response contracts and the test that pins every rule of the 15 response objects (new, Task 1) |
| `packages/shared/src/rbac/report-kind-grants.ts` and test | the grant table and `grantedReportKinds` (new, Task 3) |
| `apps/api/src/modules/{finance,evaluations,reports}/*.ts` | typed returns (Task 1); `reports.helpers.ts` reads the table (Task 3) |
| `apps/web/src/lib/api/{finance,evaluations,reports}.ts` | parse the shared responses (Task 2); `report-sections.ts` deleted |
| `apps/web/src/features/reports/` | `reports.copy.ts`, `reports.utils.ts`, `hooks/`, `components/` (Task 4) |
| `apps/web/src/features/projects/evaluation/` | `evaluation.utils.ts`, `hooks/`, `components/` (Task 5) |
| `apps/web/src/features/projects/budget/budget.reads.ts` | the shared `finance-budgets` read (Task 6) |
| `docs/` change record, audit, QAD, deferred features, index, activity log | records (Task 7) |


---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s6c-finance-reports-components.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s6c/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `cut.mjs`, `same-lines.mjs`, `trim-imports.mjs`, `count-it.mjs`, `test-titles.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S5c, S6b and S6a, and record the base**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s6c/files .tmp/s6c/before .tmp/s6c/before-split .tmp/s6c/before-eval
git rev-parse HEAD > .tmp/s6c/base-sha
for b in s5c s6b s5b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S5c record: $(grep -c '^S5c applied' $CR)"
echo "S6b record: $(grep -c '^S6b applied' $CR)"
F=apps/web/src
test -f $F/lib/api/finance.ts && test -f $F/lib/api/evaluations.ts && test -f $F/lib/api/reports.ts && test -f $F/lib/api/report-sections.ts && echo "S6b clients present"
test -f $F/lib/api/core/owned-json-read.ts && echo "S6b owned read present"
test -f $F/features/reports/index.ts && test -f $F/features/reports/components/live-reporting-workspace.tsx && test -f $F/features/reports/reports.utils.ts && echo "S6b reports layout present"
test -f $F/features/projects/budget/hooks/use-budget-module.ts && test -f $F/features/projects/evaluation/components/live-evaluation-workspace.tsx && echo "S6b budget and evaluation layout present"
test ! -f $F/features/reports/reporting-workspace.tsx && echo "S6b dead chain gone"
grep -c "audit:" $F/lib/services/core-feature-client.ts
grep -c "'reports'" $F/import-direction.test.ts
test -f packages/shared/src/contracts/finance/finance-requests.ts && test -f packages/shared/src/contracts/evaluations/evaluation-requests.ts && test -f packages/shared/src/contracts/reports/report-requests.ts && echo "S6a contracts present"
test -d apps/api/src/modules/print-pdf && test -f apps/api/src/modules/reports/reports.helpers.ts && echo "S6a api layout present"
test -d $F/features/beneficiaries/registration/hooks && echo "S4c present"
test -f $F/features/collection/index.ts && echo "S5b present"
test -f $F/features/collection/forms/hooks/use-collection-state.ts && echo "S5c present"
echo "direction test lists collection: $(grep -c "'collection'" $F/import-direction.test.ts)"
echo "next.config lists collection: $(grep -c "@/features/collection" apps/web/next.config.ts)"
test -f docs/handoff/modularization-s6c-finance-reports-components.md && echo "handoff copy present"
```

Expected: `git status --short` prints nothing. Then the branch name, one line per stacked branch, the two record counts, the marker lines and the counts (`audit:` once in `core-feature-client.ts`, `'reports'` once in the indexed feature list of the direction test, `collection` once in the direction test and once in `optimizePackageImports`):

```
claude/modularization-s6c-9ept8o
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S5c record: 1
S6b record: 1
S6b clients present
S6b owned read present
S6b reports layout present
S6b budget and evaluation layout present
S6b dead chain gone
1
1
S6a contracts present
S6a api layout present
S4c present
S5b present
S5c present
direction test lists collection: 1
next.config lists collection: 1
handoff copy present
```

A line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a branch other than `claude/modularization-s6c-9ept8o`, a record count of `0`, a missing marker line (S6b, S6a, S4c, S5b or S5c) or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/` refs, so the check works with either. `.tmp/s6c/base-sha` is the head the branch has when Task 0 starts (the S5c tip, the docs-only commits that follow it on that branch, and the controller commit that stages this plan), so it is the base of every later comparison and of the SAD check; never compare it with a fixed hash. The replay printed exactly this block with the three branches present as refs.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `.tmp/s6c/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s6c/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s6c/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s6c/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s6c/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s6c/routes-$1.txt
grep Middleware .tmp/s6c/routes-$1.txt
```

`.tmp/s6c/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s6c/compare-routes.mjs`:

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

`.tmp/s6c/replace-exact.mjs` applies exact text replacements and fails unless each one matches the expected number of times, so every edit below is a counted, reviewable change:

Create `.tmp/s6c/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s6c/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s6c/cut.mjs` builds files from hash-pinned line ranges of one source file (Tasks 4 and 5):

Create `.tmp/s6c/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s6c/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
// An item is a literal line, a [from, to] range of source lines (1-based, inclusive), '@imports' for the source's import block without its use client line,
// or { file, from } for the lines of another existing file from a 1-based line on (read before anything is written).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const hash = execFileSync('git', ['hash-object', plan.source], { encoding: 'utf8' }).trim().slice(0, 8)
if (hash !== plan.hash) throw new Error(`${plan.source}: hash ${hash}, expected ${plan.hash}`)
const lines = readFileSync(plan.source, 'utf8').split('\n')
const first = lines.findIndex((line) => /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|type\s|interface\s)/.test(line))
const imports = lines
  .slice(0, first)
  .filter((line) => line !== "'use client'")
  .join('\n')
  .replace(/^\n+|\n+$/g, '')
  .split('\n')

const built = Object.entries(plan.files).map(([file, items]) => {
  const out = items.flatMap((item) => {
    if (item === '@imports') return imports
    if (typeof item === 'string') return [item]
    if (!Array.isArray(item)) return readFileSync(item.file, 'utf8').replace(/\n$/, '').split('\n').slice(item.from - 1)
    const [from, to] = item
    if (!(from >= 1 && to >= from && to < lines.length)) throw new Error(`${file}: bad range ${from}-${to}`)
    return lines.slice(from - 1, to)
  })
  return [file, `${out.join('\n').replace(/\n*$/, '')}\n`, out.length]
})
for (const [file, text, count] of built) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  console.log(`${file}: ${count} lines`)
}
```

`.tmp/s6c/same-lines.mjs` fails when a line of the original is missing from the new files and lists the lines the split added (Tasks 4 and 5):

Create `.tmp/s6c/same-lines.mjs`:

```js
// Fails when a line of the original is lost; counts the lines the new files add (signatures, props, calls) and lists them with --list.
// Usage: same-lines.mjs <original> [--also <file>]... <new file>... [From=To]... [--list]; an --also file is part of the original (a module that already existed and received lines).
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const list = args.includes('--list')
const originals = []
const rest = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') continue
  if (args[i] === '--also') originals.push(args[++i])
  else if (originals.length === 0) originals.push(args[i])
  else rest.push(args[i])
}
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = rest.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|describe[(.])/

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
const before = count(originals.flatMap(body))
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

`.tmp/s6c/trim-imports.mjs` drops imports that no longer appear in a file body, because Biome 1.9 does not flag unused imports:

Create `.tmp/s6c/trim-imports.mjs`:

```js
// Drops named and default imports that no longer appear in the file body, ignoring comments and quoted strings, and prints their names.
import { readFileSync, writeFileSync } from 'node:fs'

const namedImport = /import (type )?\{([^}]*)\} from ('[^']+')\n/g
const defaultImport = /import (type )?([A-Za-z_$][\w$]*) from ('[^']+')\n/g
const quoted = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g
for (const file of process.argv.slice(2)) {
  let text = readFileSync(file, 'utf8')
  const body = text.replace(namedImport, '').replace(defaultImport, '').replace(quoted, '')
  const removed = []
  const used = (local) => {
    const found = new RegExp(`\\b${local}\\b`).test(body)
    if (!found) removed.push(local)
    return found
  }
  text = text.replace(namedImport, (whole, typeOnly, names, from) => {
    const all = names.split(',').filter((name) => name.trim())
    const kept = all
      .map((name) => name.trim())
      .filter((name) => used(name.replace(/^type /, '').split(' as ').at(-1)))
    if (kept.length === all.length) return whole
    return kept.length ? `import ${typeOnly ?? ''}{ ${kept.join(', ')} } from ${from}\n` : ''
  })
  text = text.replace(defaultImport, (whole, _typeOnly, local) => (used(local) ? whole : ''))
  writeFileSync(file, text)
  console.log(`${file}: removed ${removed.join(', ') || 'nothing'}`)
}
```

`.tmp/s6c/count-it.mjs` counts the `it`, `describe` and `expect(` occurrences of test files, so a split can show that no row or assertion was lost:

Create `.tmp/s6c/count-it.mjs`:

```js
// Counts it, describe and expect( occurrences per test file and in total, so a split can show that no test row or assertion was lost.
import { readFileSync } from 'node:fs'

const row = /^\s*(?:it|test)(?:\.each)?[(`<]/
const group = /^\s*describe(?:\.each)?[(`<]/
const total = { it: 0, describe: 0, expect: 0 }
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const count = {
    it: lines.filter((line) => row.test(line)).length,
    describe: lines.filter((line) => group.test(line)).length,
    expect: text.split('expect(').length - 1,
  }
  for (const key of Object.keys(total)) total[key] += count[key]
  console.log(`${file}: it ${count.it}, describe ${count.describe}, expect ${count.expect}`)
}
console.log(`total: it ${total.it}, describe ${total.describe}, expect ${total.expect}`)
```

`.tmp/s6c/test-titles.mjs` saves the sorted titles of the tests a run executes and compares two saved lists:

Create `.tmp/s6c/test-titles.mjs`:

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

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s6c/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s6c/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s6c/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s6c/m0
cat .tmp/s6c/m0
```

Expected: the figures of the replay on the S5c tip. Write them down as the baselines (record your own where a slice below this one changed a count); every later Expected is a delta from them. The filtered lines are the typecheck `Done` lines, the test summaries, the docs check, the build exit code and the Middleware line:

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  675 passed (675)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  244 passed (244)
apps/web test:       Tests  2253 passed (2253)
      Tests  57 passed (57)
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
exit 0
ƒ Middleware                                                      <n> kB
<n>
```

The `sad:test` line is the one without a package prefix (`B_sad`). The test summaries use `grep -a`: a test log can hold a NUL byte, and plain `grep` then prints `binary file matches` in place of the summaries that follow it. `docs:check` ends with `6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific` and `[ELIFECYCLE] Command failed with exit code 1.`: those 6 failures are the baseline and stay at 6 until the end. `build-routes.sh` prints `exit 0` and the Middleware line (`M0`, written to `.tmp/s6c/m0`; the kB figure differs by one between containers). The package figures are `B_config`, `B_shared`, `B_imports`, `B_api` and `B_web`; they include whatever S4c, S5b and S5c added, so record your own.

```bash
F=apps/web/src
A=apps/api/src/modules
for f in $F/features/reports/components/live-reporting-workspace.tsx $F/features/reports/components/live-reporting-workspace.test.tsx $F/features/projects/evaluation/components/live-evaluation-workspace.tsx $F/features/projects/evaluation/components/live-evaluation-workspace.test.tsx $F/lib/api/finance.ts $F/lib/api/evaluations.ts $F/lib/api/reports.ts $F/lib/api/report-sections.ts $A/reports/reports.helpers.ts $A/reports/reports.service.ts; do echo "$(wc -l < $f) $f"; done
git grep -n "lib/api/report-sections" -- $F | wc -l
git grep -n "evaluationDetailSchema" -- $F | wc -l
git grep -n "kindPermission" -- apps/api/src | wc -l
git grep -n "'finance-budgets'" -- $F | wc -l
git grep -n "reportKindPermissions" -- $F | wc -l
for f in $F/lib/api/finance.ts $F/lib/api/evaluations.ts $F/lib/api/reports.ts $F/lib/api/report-sections.ts $F/features/reports/print/print-report-payload.ts $F/features/reports/print/print-report-sections.tsx $F/features/reports/print/print-report-sample.ts $F/features/reports/print/print-report-sections.test.tsx $F/features/reports/components/live-reporting-workspace.tsx $F/features/reports/components/live-reporting-workspace.test.tsx $F/features/reports/reports.utils.ts $F/features/reports/reports.utils.test.ts $F/features/projects/evaluation/components/live-evaluation-workspace.tsx $F/features/projects/evaluation/components/live-evaluation-workspace.test.tsx $F/features/projects/budget/hooks/use-budget-module.ts $F/features/projects/activities/hooks/use-activity-expenses.ts $A/finance/finance.service.ts $A/evaluations/evaluations.mapper.ts $A/evaluations/evaluations.service.ts $A/reports/reports.service.ts $A/reports/reports.helpers.ts $A/reports/report-project-status.ts; do echo "$(git hash-object $f | cut -c1-8) $f"; done
```

Expected: the counts and hashes the plan rests on (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT):

```
542 apps/web/src/features/reports/components/live-reporting-workspace.tsx
509 apps/web/src/features/reports/components/live-reporting-workspace.test.tsx
531 apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx
299 apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx
116 apps/web/src/lib/api/finance.ts
140 apps/web/src/lib/api/evaluations.ts
106 apps/web/src/lib/api/reports.ts
103 apps/web/src/lib/api/report-sections.ts
58 apps/api/src/modules/reports/reports.helpers.ts
455 apps/api/src/modules/reports/reports.service.ts
5
11
6
2
0
4561d102 apps/web/src/lib/api/finance.ts
f9fd2de5 apps/web/src/lib/api/evaluations.ts
2e8f4724 apps/web/src/lib/api/reports.ts
08da016a apps/web/src/lib/api/report-sections.ts
26105f21 apps/web/src/features/reports/print/print-report-payload.ts
98db6970 apps/web/src/features/reports/print/print-report-sections.tsx
703530bc apps/web/src/features/reports/print/print-report-sample.ts
26e97674 apps/web/src/features/reports/print/print-report-sections.test.tsx
f01e515b apps/web/src/features/reports/components/live-reporting-workspace.tsx
de9be96f apps/web/src/features/reports/components/live-reporting-workspace.test.tsx
a7ff887d apps/web/src/features/reports/reports.utils.ts
ebb1a90a apps/web/src/features/reports/reports.utils.test.ts
5b4e86d7 apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx
8a97c442 apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx
3f8b5b60 apps/web/src/features/projects/budget/hooks/use-budget-module.ts
ff407069 apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts
10fbd2f4 apps/api/src/modules/finance/finance.service.ts
edffb9a0 apps/api/src/modules/evaluations/evaluations.mapper.ts
6c0dffa7 apps/api/src/modules/evaluations/evaluations.service.ts
6d6fcffa apps/api/src/modules/reports/reports.service.ts
20871598 apps/api/src/modules/reports/reports.helpers.ts
e1557d53 apps/api/src/modules/reports/report-project-status.ts
```

The shared barrel and the two client test files that Task 2 and Task 3 edit by exact replacement are not hashed: the earlier slices and the S6b review changed them, and their replacements fail on their own count. In order: the line counts of ten files (the two reporting files 542 and 509 are the ones Task 4 splits and the two evaluation files 531 and 299 the ones Task 5 splits); the number of lines naming `lib/api/report-sections` in the web, of `evaluationDetailSchema`, of `kindPermission` in the api, of the `'finance-budgets'` resource key and of `reportKindPermissions` (none, deleted by S6b); then the hash prefixes of every file this plan edits with an exact replacement or cuts by line range. Every replacement fails on its own count if a file differs, so the hashes are the first place to look.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s6c-finance-reports-components.md docs/superpowers/plans/$(date +%F)-modularization-s6c-finance-reports-components.md`. The handoff copy and its index row stay, and no plan copy is removed in this slice (the controller removes the executed copies after the final merge of the series).

In `docs/index.md` section 1.6, add one row after the last S6b plan row (the row of the S6b plan copy, or of the S6 plan copy when no S6b row exists):

```bash
D=$(date +%F)
cp docs/handoff/modularization-s6c-finance-reports-components.md docs/superpowers/plans/$D-modularization-s6c-finance-reports-components.md
ROW="| [S6c finance and reports components plan](superpowers/plans/$D-modularization-s6c-finance-reports-components.md) | $D-modularization-s6c-finance-reports-components.md | $D | S6c of the codebase modularization: finance, evaluation and report response contracts, shared report kind grants, reporting and evaluation workspace splits, the finance-budgets read | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s[0-9a-z]*-finance-reports" docs/index.md | tail -1 | cut -d: -f1)
test -n "$LAST" || LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -m "docs: add the S6c finance and reports components plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one added row, the same 6 baseline docs failures and a commit of two files:

```
+| [S6c finance and reports components plan](superpowers/plans/<date>-modularization-s6c-finance-reports-components.md) | <date>-mod

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S6c finance and reports components plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/2026-10-13-modularization-s6c-finance-reports-components.md
```

The row line is cut at 140 characters by the command, and `<n>` is the length of this plan plus the row. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).


---

### Task 1: Response contracts in `packages/shared` and typed api returns

**Files:**
- Create: `packages/shared/src/contracts/finance/finance-responses.ts`, `contracts/evaluations/evaluation-responses.ts`, `contracts/reports/report-responses.ts`, a test beside each and `contracts/common/response-rules.test.ts` (every rule of the 15 response objects)
- Modify: `packages/shared/src/index.ts`; `apps/api/src/modules/finance/finance.service.ts`; `apps/api/src/modules/evaluations/evaluations.mapper.ts` and `evaluations.service.ts`; `apps/api/src/modules/reports/reports.service.ts` and `report-project-status.ts`
- Create (gitignored): `.tmp/s6c/task1-index.json`, `task1-edits.json`, `schema-moved.mjs`, `files/*.orig.ts`

The web response schemas of S6b (`budgetSchema`, `expenseSchema`, `expenseAck`, `reportPreviewSchema`, `reportSchema`, `evaluationRoundSchema`, `reportSectionsSchema`, `criterionSchema`, `criterionSnapshotSchema`, `evaluationScoreSchema`, `evaluationDetailSchema`, `evaluationSchema` and the inline receipt, reference, survey form and generate schemas) become shared contracts named `*Response`, with the types the api returns. This task adds the contracts and annotates the api returns with their types (type only, no runtime parse); Task 2 points the web at them. The web copy of `report-sections.ts` is deleted in Task 2, after its callers move.

- [ ] **Step 1: Save the originals and write the contracts**

The old schemas stay readable in `.tmp/s6c/files` for the proofs of Task 2:

```bash
for m in finance evaluations reports report-sections; do git show HEAD:apps/web/src/lib/api/$m.ts > .tmp/s6c/files/$m.orig.ts; done
wc -l .tmp/s6c/files/*.orig.ts | tail -5
```

Expected: the four originals are saved:

```
  140 .tmp/s6c/files/evaluations.orig.ts
  116 .tmp/s6c/files/finance.orig.ts
  103 .tmp/s6c/files/report-sections.orig.ts
  106 .tmp/s6c/files/reports.orig.ts
  465 total
```

Create each file with the Write tool exactly as printed. `finance-responses.ts` holds the budget, expense and receipt shapes; the stored currency is a plain string in the api type, so the web narrows it to `PHP` (Task 2):

Create `packages/shared/src/contracts/finance/finance-responses.ts`:

```ts
import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)

// Response shapes of the finance routes; the api only uses their types and the web parses them.

// One budget line; the stored currency is a three character string, so the web narrows it to PHP.
export const budgetResponse = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    category: z.string(),
    currency: z.string(),
    plannedBudget: decimal,
    remarks: z.string().nullable(),
    updatedAt: timestamp,
  })
  .strict()
export type BudgetResponse = z.infer<typeof budgetResponse>

// The receipt of a budget create or replace.
export const budgetWriteResponse = z.object({ id: uuid, updatedAt: timestamp }).strict()
export type BudgetWriteResponse = z.infer<typeof budgetWriteResponse>

// One budget line as the expense form lists it; the SQL function that builds it returns untyped JSON.
export const budgetReferenceResponse = z
  .object({ id: uuid, category: z.string(), activityId: uuid.nullable() })
  .strict()
export type BudgetReferenceResponse = z.infer<typeof budgetReferenceResponse>

// One expense with its reviewer names and sign-off.
export const expenseResponse = z
  .object({
    id: uuid,
    budgetRecordId: uuid,
    description: z.string(),
    amount: decimal,
    expenseDate: z.string(),
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    receiptEvidenceId: uuid.nullable(),
    submittedById: uuid,
    verifiedById: uuid.nullable(),
    approvedById: uuid.nullable(),
    updatedAt: timestamp,
    signedOffById: uuid.nullable(),
    signedOffAt: timestamp.nullable(),
    submittedByName: z.string().max(200).nullable(),
    verifiedByName: z.string().max(200).nullable(),
    approvedByName: z.string().max(200).nullable(),
    signedOffByName: z.string().max(200).nullable(),
  })
  .strict()
export type ExpenseResponse = z.infer<typeof expenseResponse>

// The receipt of an expense submit, review or receipt upload; a SQL function builds it as untyped JSON.
export const expenseAcknowledgementResponse = z
  .object({
    id: uuid,
    projectId: uuid,
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    updatedAt: timestamp,
    receiptEvidenceId: uuid.nullable(),
  })
  .strict()
export type ExpenseAcknowledgementResponse = z.infer<typeof expenseAcknowledgementResponse>

// The receipt of an expense sign-off.
export const expenseSignoffResponse = z
  .object({ expenseId: uuid, signedOffById: uuid, signedOffAt: timestamp })
  .strict()
export type ExpenseSignoffResponse = z.infer<typeof expenseSignoffResponse>
```

`evaluation-responses.ts` holds the criterion, score and round shapes of the evaluation routes:

Create `packages/shared/src/contracts/evaluations/evaluation-responses.ts`:

```ts
import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)

// Response shapes of the evaluation routes; the api only uses their types and the web parses them.

// One scoring criterion of the project.
export const evaluationCriterionResponse = z
  .object({
    id: uuid,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.enum([
      'KPI',
      'TIMELINE_COMPLIANCE',
      'BUDGET_EFFICIENCY',
      'BENEFICIARY_REACH',
      'INDICATOR_LINKAGE',
      'ASSESSMENT_GAIN',
      'OTHER',
    ]),
    version: z.number().int(),
    weightPercentage: decimal,
    maximumScore: decimal,
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    updatedAt: timestamp,
  })
  .strict()
export type EvaluationCriterionResponse = z.infer<typeof evaluationCriterionResponse>

const evaluationPersonSchema = z.object({ id: uuid, name: z.string() }).strict().nullable()

// The criterion as it stood when the round was scored.
const criterionSnapshotSchema = z
  .object({
    id: uuid,
    code: z.string(),
    version: z.number().int(),
    type: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    weight_percentage: z.string(),
    maximum_score: z.string(),
  })
  .strict()

// One criterion score of an evaluation round.
export const evaluationScoreResponse = z
  .object({
    criterionId: uuid,
    score: decimal,
    maximumScore: decimal,
    weightedScore: decimal,
    source: z.enum(['computed', 'no_data', 'manual']),
    evidence: z.string().nullable(),
    reason: z.string().nullable(),
    note: z.string().nullable(),
    criterion: criterionSnapshotSchema,
  })
  .strict()
export type EvaluationScoreResponse = z.infer<typeof evaluationScoreResponse>

// One evaluation round with its scores, as the read and every workflow route return it.
export const evaluationDetailResponse = z
  .object({
    id: uuid,
    title: z.string(),
    periodLabel: z.string().nullable(),
    periodStart: z.string(),
    periodEnd: z.string(),
    overallScore: decimal.nullable(),
    commentary: z.string().nullable(),
    returnReason: z.string().nullable(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),
    updatedAt: timestamp,
    evaluatedBy: evaluationPersonSchema,
    evaluatedAt: timestamp.nullable(),
    reviewedBy: evaluationPersonSchema,
    reviewedAt: timestamp.nullable(),
    reviewFeedback: z.string().nullable(),
    signedOffBy: evaluationPersonSchema,
    signedOffAt: timestamp.nullable(),
    scores: z.array(evaluationScoreResponse).max(100),
  })
  .strict()
export type EvaluationDetailResponse = z.infer<typeof evaluationDetailResponse>

// The criteria and rounds of one project.
export const evaluationsResponse = z
  .object({
    projectId: uuid,
    criteria: z.array(evaluationCriterionResponse).max(100),
    evaluations: z.array(evaluationDetailResponse).max(20),
    hasMore: z.boolean(),
  })
  .strict()
export type EvaluationsResponse = z.infer<typeof evaluationsResponse>
```

`report-responses.ts` holds `reportSectionsResponse` (moved verbatim from `lib/api/report-sections.ts`, with its two types renamed `ReportSectionsResponse` and `ReportStatusLevel`) and the preview, saved report, evaluation round, survey form and generation shapes. `reportResponse.type` is the stored type (the six kinds and `OTHER`, which no route lists) and `evaluationRoundResponse.status` is the stored round status; the web narrows both:

Create `packages/shared/src/contracts/reports/report-responses.ts`:

```ts
import { z } from 'zod'

import { reportKinds } from '../../constants/domain-codes'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const reportKind = z.enum(reportKinds)
const reportFormat = z.enum(['CSV', 'XLSX', 'XLS', 'PDF'])

// Response shapes of the report routes; the api only uses their types and the web parses them.

const text = z.string().max(2000)
const date = z.string().max(40).nullable()
const statusLevel = z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_AVAILABLE'])

/** Structured Project summary content; the flat columns and rows stay as the fallback copy. */
export const reportSectionsResponse = z
  .object({
    reportDate: z.string().max(40),
    information: z
      .object({
        code: text,
        title: text,
        status: text,
        sector: text,
        area: text,
        startDate: text,
        endDate: text,
        partners: text,
        manager: text.nullable(),
      })
      .strict(),
    overview: z
      .array(z.object({ area: text, status: statusLevel, comment: text }).strict())
      .max(10),
    keyFigures: z
      .array(
        z
          .object({
            label: text,
            state: z.enum(['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED']),
            value: text.nullable(),
            reason: text.nullable(),
            detail: text,
            percent: z.number().finite().min(-100000).max(100000).nullable(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    budget: z
      .array(
        z
          .object({
            line: text,
            currency: z.string().max(3),
            planned: text,
            approved: text,
            inReview: text,
            remaining: text,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    milestones: z
      .array(
        z
          .object({
            title: text,
            status: text,
            targetDate: date,
            completionDate: date,
            overdue: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    indicators: z
      .array(
        z
          .object({
            code: text,
            name: text,
            baseline: text.nullable(),
            target: text.nullable(),
            current: text,
            progress: text,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    alerts: z
      .array(
        z
          .object({
            title: text,
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
            explanation: text,
            evaluatedAt: z.string().max(40),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict()

export type ReportSectionsResponse = z.infer<typeof reportSectionsResponse>
export type ReportStatusLevel = ReportSectionsResponse['overview'][number]['status']

// The stored report type also holds OTHER, which no route lists, so the web narrows it to a report kind.
const reportTypes = [...reportKinds, 'OTHER'] as const

// A preview of one report kind for a project, with the structured sections of the project summary.
export const reportPreviewResponse = z
  .object({
    projectId: uuid,
    kind: reportKind,
    formId: uuid.nullable(),
    columns: z.array(z.string()).max(30),
    rows: z.array(z.array(z.string().max(2000)).max(30)).max(1000),
    sections: reportSectionsResponse.optional(),
    generatedAt: timestamp,
    unavailableReasons: z.array(z.string()).max(20),
  })
  .strict()
export type ReportPreviewResponse = z.infer<typeof reportPreviewResponse>

// One saved report of a project.
export const reportResponse = z
  .object({
    id: uuid,
    name: z.string(),
    type: z.enum(reportTypes),
    format: reportFormat.nullable(),
    status: z.enum(['DRAFT', 'GENERATED', 'ARCHIVED']),
    generatedAt: timestamp.nullable(),
    evaluation: z
      .object({ title: z.string(), periodStart: dateOnly, periodEnd: dateOnly })
      .strict()
      .nullable(),
  })
  .strict()
export type ReportResponse = z.infer<typeof reportResponse>

// A closed evaluation round a report can be generated from; the route lists signed-off and archived rounds only.
export const evaluationRoundResponse = z
  .object({
    id: uuid,
    title: z.string(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),
    periodStart: dateOnly,
    periodEnd: dateOnly,
    signedOffAt: timestamp.nullable(),
    overallScore: decimal.nullable(),
  })
  .strict()
export type EvaluationRoundResponse = z.infer<typeof evaluationRoundResponse>

// A published training survey a survey report can use.
export const surveyFormResponse = z
  .object({ id: uuid, name: z.string(), code: z.string(), version: z.number().int().positive() })
  .strict()
export type SurveyFormResponse = z.infer<typeof surveyFormResponse>

// The receipt of a report generation; pdfFallback says the designed PDF could not be rendered.
export const generateReportResponse = z
  .object({
    id: uuid,
    status: z.literal('GENERATED'),
    pdfFallback: z.literal(true).optional(),
  })
  .strict()
export type GenerateReportResponse = z.infer<typeof generateReportResponse>
```

The three contract tests pin one accepted body per shape and the refusals that matter (an unknown key, a status or kind outside the catalog, a decimal with a comma, a name over 200 characters, 21 evaluation rounds):

Create `packages/shared/src/contracts/finance/finance-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  budgetResponse,
  budgetWriteResponse,
  expenseAcknowledgementResponse,
  expenseResponse,
  expenseSignoffResponse,
} from './finance-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const budget = {
  id: uuid,
  activityId: null,
  category: 'Training',
  currency: 'PHP',
  plannedBudget: '1500.00',
  remarks: null,
  updatedAt: stamp,
}
const expense = {
  id: uuid,
  budgetRecordId: uuid,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-09-01',
  status: 'PENDING',
  receiptEvidenceId: null,
  submittedById: uuid,
  verifiedById: null,
  approvedById: null,
  updatedAt: stamp,
  signedOffById: null,
  signedOffAt: null,
  submittedByName: 'Fictional Officer',
  verifiedByName: null,
  approvedByName: null,
  signedOffByName: null,
}

describe('finance response contracts', () => {
  it('accepts a budget line and leaves the PHP check to the web client', () => {
    expect(budgetResponse.safeParse(budget).success).toBe(true)
    expect(budgetResponse.safeParse({ ...budget, currency: 'USD' }).success).toBe(true)
    expect(budgetResponse.safeParse({ ...budget, plannedBudget: '1,500' }).success).toBe(false)
    expect(budgetResponse.safeParse({ ...budget, extra: true }).success).toBe(false)
  })

  it('accepts an expense with its reviewer names and rejects a status outside the review states', () => {
    expect(expenseResponse.safeParse(expense).success).toBe(true)
    expect(expenseResponse.safeParse({ ...expense, status: 'PAID' }).success).toBe(false)
    expect(
      expenseResponse.safeParse({ ...expense, submittedByName: 'x'.repeat(201) }).success,
    ).toBe(false)
  })

  it('accepts the receipts of a budget write, an expense action and a sign-off', () => {
    expect(budgetWriteResponse.safeParse({ id: uuid, updatedAt: stamp }).success).toBe(true)
    const ack = { id: uuid, projectId: uuid, status: 'VERIFIED', updatedAt: stamp }
    expect(
      expenseAcknowledgementResponse.safeParse({ ...ack, receiptEvidenceId: null }).success,
    ).toBe(true)
    expect(expenseAcknowledgementResponse.safeParse(ack).success).toBe(false)
    const signoff = { expenseId: uuid, signedOffById: uuid, signedOffAt: stamp }
    expect(expenseSignoffResponse.safeParse(signoff).success).toBe(true)
    expect(expenseSignoffResponse.safeParse({ ...signoff, id: uuid }).success).toBe(false)
  })
})
```

Create `packages/shared/src/contracts/evaluations/evaluation-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { evaluationDetailResponse, evaluationsResponse } from './evaluation-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const score = {
  criterionId: uuid,
  score: '80',
  maximumScore: '100',
  weightedScore: '20',
  source: 'computed',
  evidence: 'From the indicators',
  reason: null,
  note: null,
  criterion: {
    id: uuid,
    code: 'RELEVANCE',
    version: 1,
    type: 'KPI',
    name: 'Relevance',
    description: null,
    weight_percentage: '25',
    maximum_score: '100',
  },
}
const detail = {
  id: uuid,
  title: 'Mid-term',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt: stamp,
  evaluatedBy: { id: uuid, name: 'Fictional Officer' },
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [score],
}

describe('evaluation response contracts', () => {
  it('accepts a round with a computed score and rejects an unknown status, source or key', () => {
    expect(evaluationDetailResponse.safeParse(detail).success).toBe(true)
    expect(evaluationDetailResponse.safeParse({ ...detail, status: 'OPEN' }).success).toBe(false)
    const guessed = { ...detail, scores: [{ ...score, source: 'guessed' }] }
    expect(evaluationDetailResponse.safeParse(guessed).success).toBe(false)
    expect(evaluationDetailResponse.safeParse({ ...detail, extra: 1 }).success).toBe(false)
  })

  it('accepts the criteria and rounds of a project and limits the rounds to 20', () => {
    const criterion = {
      id: uuid,
      code: 'RELEVANCE',
      name: 'Relevance',
      description: null,
      type: 'KPI',
      version: 1,
      weightPercentage: '25',
      maximumScore: '100',
      status: 'PUBLISHED',
      updatedAt: stamp,
    }
    const list = { projectId: uuid, criteria: [criterion], evaluations: [detail], hasMore: false }
    expect(evaluationsResponse.safeParse(list).success).toBe(true)
    const many = { ...list, evaluations: Array.from({ length: 21 }, () => detail) }
    expect(evaluationsResponse.safeParse(many).success).toBe(false)
  })
})
```

Create `packages/shared/src/contracts/reports/report-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  evaluationRoundResponse,
  generateReportResponse,
  reportPreviewResponse,
  reportResponse,
  surveyFormResponse,
} from './report-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'

describe('report response contracts', () => {
  it('accepts a preview with or without sections and rejects a kind outside the catalog', () => {
    const preview = {
      projectId: uuid,
      kind: 'PROJECT_SUMMARY',
      formId: null,
      columns: ['Title'],
      rows: [['Recorded project']],
      generatedAt: stamp,
      unavailableReasons: [],
    }
    expect(reportPreviewResponse.safeParse(preview).success).toBe(true)
    expect(reportPreviewResponse.safeParse({ ...preview, kind: 'OTHER' }).success).toBe(false)
    expect(reportPreviewResponse.safeParse({ ...preview, sections: {} }).success).toBe(false)
  })

  it('accepts a saved report of any stored type and leaves the kind check to the web client', () => {
    const report = {
      id: uuid,
      name: 'Summary',
      type: 'PROJECT_SUMMARY',
      format: 'PDF',
      status: 'GENERATED',
      generatedAt: stamp,
      evaluation: null,
    }
    expect(reportResponse.safeParse(report).success).toBe(true)
    expect(reportResponse.safeParse({ ...report, type: 'OTHER' }).success).toBe(true)
    expect(reportResponse.safeParse({ ...report, type: 'LEDGER' }).success).toBe(false)
  })

  it('accepts a round, a survey form and the generation receipt', () => {
    const round = {
      id: uuid,
      title: 'Mid-term',
      status: 'SIGNED_OFF',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      signedOffAt: stamp,
      overallScore: '71.08',
    }
    expect(evaluationRoundResponse.safeParse(round).success).toBe(true)
    expect(
      surveyFormResponse.safeParse({ id: uuid, name: 'Survey', code: 'S', version: 1 }).success,
    ).toBe(true)
    expect(generateReportResponse.safeParse({ id: uuid, status: 'GENERATED' }).success).toBe(true)
    const plain = { id: uuid, status: 'GENERATED', pdfFallback: true }
    expect(generateReportResponse.safeParse(plain).success).toBe(true)
    expect(generateReportResponse.safeParse({ ...plain, pdfFallback: false }).success).toBe(false)
  })
})
```

`response-rules.test.ts` pins every rule the three contract files state, one table row per response object (15 objects; the nested ones, such as the score, the person and the report sections, are reached through a `wrap`): the sample parses, an unknown key is refused (`.strict()`), a field accepts `null` only where it is nullable and may be missing only where it is optional, and then the formats (uuid, timestamp with an offset, decimal, date-only), every enum member and a stranger to them, the string and array bounds at the limit and one past it, the integer, positive and finite rules and the literals. Without it a loosened bound, a lost `.strict()` or a dropped enum member passes every shared test and is caught, if at all, by a web client test. A mutation run over every `.strict()`, bound, enum member, nullable, optional, format and literal of the three files (212 mutants) leaves one survivor, `.finite()` on a number that already has both bounds, which no input can tell apart from the bounds:

Create `packages/shared/src/contracts/common/response-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { reportKinds } from '../../constants/domain-codes'
import {
  evaluationCriterionResponse,
  evaluationDetailResponse,
  evaluationsResponse,
} from '../evaluations/evaluation-responses'
import {
  budgetReferenceResponse,
  budgetResponse,
  budgetWriteResponse,
  expenseAcknowledgementResponse,
  expenseResponse,
  expenseSignoffResponse,
} from '../finance/finance-responses'
import {
  evaluationRoundResponse,
  generateReportResponse,
  reportPreviewResponse,
  reportResponse,
  surveyFormResponse,
} from '../reports/report-responses'

const id = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const day = '2026-09-01'
const expenseStatuses = ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']
const evaluationStatuses = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']
const limits = (limit: number, ...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, limit]))

// What one response object must keep: required and nullable fields, formats, enum members and bounds.
type Rules = {
  schema: { safeParse: (value: unknown) => { success: boolean } }
  sample: Record<string, unknown>
  wrap?: (value: unknown) => unknown
  nullable?: string[]
  optional?: string[]
  uuids?: string[]
  times?: string[]
  decimals?: string[]
  dates?: string[]
  booleans?: string[]
  integers?: string[]
  positive?: string[]
  enums?: Record<string, readonly string[]>
  literals?: Record<string, [unknown, unknown]>
  max?: Record<string, number>
  arrays?: Record<string, number>
  numbers?: Record<string, [number, number]>
}

const pin = (name: string, rules: Rules) =>
  it(`pins every rule of ${name}`, () => {
    const { schema, sample, wrap = (value: unknown) => value } = rules
    const parses = (value: Record<string, unknown>) => schema.safeParse(wrap(value)).success
    const check = (key: string, value: unknown, expected: boolean) =>
      expect(parses({ ...sample, [key]: value }), `${name}.${key} = ${JSON.stringify(value)}`).toBe(
        expected,
      )
    expect(parses(sample), `${name} sample`).toBe(true)
    expect(parses({ ...sample, unknownKey: 1 }), `${name} unknown key`).toBe(false)
    for (const key of Object.keys(sample)) {
      check(key, null, rules.nullable?.includes(key) ?? false)
      const { [key]: _omitted, ...rest } = sample
      expect(parses(rest), `${name}.${key} absent`).toBe(rules.optional?.includes(key) ?? false)
    }
    for (const key of rules.uuids ?? []) check(key, 'not-a-uuid', false)
    for (const key of rules.times ?? []) {
      check(key, '2026-09-01T08:00:00+08:00', true)
      for (const bad of ['yesterday', day]) check(key, bad, false)
    }
    for (const key of rules.decimals ?? []) {
      for (const good of ['-5', '5', '0.50']) check(key, good, true)
      for (const bad of ['1e3', '1,5', '', '1.', '.5', ' 5']) check(key, bad, false)
    }
    for (const key of rules.dates ?? [])
      for (const bad of [stamp, '26-09-01', '2026-9-1']) check(key, bad, false)
    for (const key of rules.booleans ?? []) check(key, 'yes', false)
    for (const key of rules.integers ?? []) check(key, 1.5, false)
    for (const key of rules.positive ?? []) for (const bad of [0, -1]) check(key, bad, false)
    for (const [key, members] of Object.entries(rules.enums ?? {})) {
      for (const member of members) check(key, member, true)
      check(key, 'ZZ', false)
    }
    for (const [key, [good, bad]] of Object.entries(rules.literals ?? {})) {
      check(key, good, true)
      check(key, bad, false)
    }
    for (const [key, limit] of Object.entries(rules.max ?? {})) {
      check(key, 'x'.repeat(limit), true)
      check(key, 'x'.repeat(limit + 1), false)
    }
    for (const [key, limit] of Object.entries(rules.arrays ?? {})) {
      const item = (sample[key] as unknown[])[0]
      check(key, Array(limit).fill(item), true)
      check(key, Array(limit + 1).fill(item), false)
    }
    for (const [key, [low, high]] of Object.entries(rules.numbers ?? {})) {
      for (const good of [low, high]) check(key, good, true)
      for (const bad of [low - 1, high + 1, Number.POSITIVE_INFINITY, 'x']) check(key, bad, false)
    }
  })

describe('finance response rules', () => {
  pin('budgetResponse', {
    schema: budgetResponse,
    sample: {
      id,
      activityId: id,
      category: 'Training',
      currency: 'PHP',
      plannedBudget: '1500.00',
      remarks: 'Note',
      updatedAt: stamp,
    },
    nullable: ['activityId', 'remarks'],
    uuids: ['id', 'activityId'],
    times: ['updatedAt'],
    decimals: ['plannedBudget'],
  })
  pin('budgetWriteResponse', {
    schema: budgetWriteResponse,
    sample: { id, updatedAt: stamp },
    uuids: ['id'],
    times: ['updatedAt'],
  })
  pin('budgetReferenceResponse', {
    schema: budgetReferenceResponse,
    sample: { id, category: 'Training', activityId: id },
    nullable: ['activityId'],
    uuids: ['id', 'activityId'],
  })
  pin('expenseResponse', {
    schema: expenseResponse,
    sample: {
      id,
      budgetRecordId: id,
      description: 'Venue',
      amount: '250.00',
      expenseDate: day,
      status: 'PENDING',
      receiptEvidenceId: id,
      submittedById: id,
      verifiedById: id,
      approvedById: id,
      updatedAt: stamp,
      signedOffById: id,
      signedOffAt: stamp,
      submittedByName: 'Fictional Officer',
      verifiedByName: 'Fictional Verifier',
      approvedByName: 'Fictional Approver',
      signedOffByName: 'Fictional Signer',
    },
    nullable: [
      'receiptEvidenceId',
      'verifiedById',
      'approvedById',
      'signedOffById',
      'signedOffAt',
      'submittedByName',
      'verifiedByName',
      'approvedByName',
      'signedOffByName',
    ],
    uuids: [
      'id',
      'budgetRecordId',
      'receiptEvidenceId',
      'submittedById',
      'verifiedById',
      'approvedById',
      'signedOffById',
    ],
    times: ['updatedAt', 'signedOffAt'],
    decimals: ['amount'],
    enums: { status: expenseStatuses },
    max: limits(200, 'submittedByName', 'verifiedByName', 'approvedByName', 'signedOffByName'),
  })
  pin('expenseAcknowledgementResponse', {
    schema: expenseAcknowledgementResponse,
    sample: { id, projectId: id, status: 'VERIFIED', updatedAt: stamp, receiptEvidenceId: id },
    nullable: ['receiptEvidenceId'],
    uuids: ['id', 'projectId', 'receiptEvidenceId'],
    times: ['updatedAt'],
    enums: { status: expenseStatuses },
  })
  pin('expenseSignoffResponse', {
    schema: expenseSignoffResponse,
    sample: { expenseId: id, signedOffById: id, signedOffAt: stamp },
    uuids: ['expenseId', 'signedOffById'],
    times: ['signedOffAt'],
  })
})

describe('evaluation response rules', () => {
  const snapshot = {
    id,
    code: 'RELEVANCE',
    version: 1,
    type: 'KPI',
    name: 'Relevance',
    description: 'Note',
    weight_percentage: '25',
    maximum_score: '100',
  }
  const score = {
    criterionId: id,
    score: '80',
    maximumScore: '100',
    weightedScore: '20',
    source: 'computed',
    evidence: 'From the indicators',
    reason: 'Reason',
    note: 'Note',
    criterion: snapshot,
  }
  const person = { id, name: 'Fictional Officer' }
  const detail = {
    id,
    title: 'Mid-term',
    periodLabel: 'First half',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
    overallScore: '71.08',
    commentary: 'Notes',
    returnReason: 'Redo',
    status: 'DRAFT',
    updatedAt: stamp,
    evaluatedBy: person,
    evaluatedAt: stamp,
    reviewedBy: person,
    reviewedAt: stamp,
    reviewFeedback: 'Fine',
    signedOffBy: person,
    signedOffAt: stamp,
    scores: [score],
  }
  const criterion = {
    id,
    code: 'RELEVANCE',
    name: 'Relevance',
    description: 'Note',
    type: 'KPI',
    version: 1,
    weightPercentage: '25',
    maximumScore: '100',
    status: 'PUBLISHED',
    updatedAt: stamp,
  }
  pin('evaluationCriterionResponse', {
    schema: evaluationCriterionResponse,
    sample: criterion,
    nullable: ['description'],
    uuids: ['id'],
    times: ['updatedAt'],
    decimals: ['weightPercentage', 'maximumScore'],
    integers: ['version'],
    enums: {
      type: [
        'KPI',
        'TIMELINE_COMPLIANCE',
        'BUDGET_EFFICIENCY',
        'BENEFICIARY_REACH',
        'INDICATOR_LINKAGE',
        'ASSESSMENT_GAIN',
        'OTHER',
      ],
      status: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    },
  })
  pin('the criterion snapshot of a score', {
    schema: evaluationDetailResponse,
    sample: snapshot,
    wrap: (value) => ({ ...detail, scores: [{ ...score, criterion: value }] }),
    nullable: ['description'],
    uuids: ['id'],
    integers: ['version'],
  })
  pin('the score of an evaluation', {
    schema: evaluationDetailResponse,
    sample: score,
    wrap: (value) => ({ ...detail, scores: [value] }),
    nullable: ['evidence', 'reason', 'note'],
    uuids: ['criterionId'],
    decimals: ['score', 'maximumScore', 'weightedScore'],
    enums: { source: ['computed', 'no_data', 'manual'] },
  })
  pin('the person of an evaluation', {
    schema: evaluationDetailResponse,
    sample: person,
    wrap: (value) => ({ ...detail, evaluatedBy: value }),
    uuids: ['id'],
  })
  pin('evaluationDetailResponse', {
    schema: evaluationDetailResponse,
    sample: detail,
    nullable: [
      'periodLabel',
      'overallScore',
      'commentary',
      'returnReason',
      'evaluatedBy',
      'evaluatedAt',
      'reviewedBy',
      'reviewedAt',
      'reviewFeedback',
      'signedOffBy',
      'signedOffAt',
    ],
    uuids: ['id'],
    times: ['updatedAt', 'evaluatedAt', 'reviewedAt', 'signedOffAt'],
    decimals: ['overallScore'],
    enums: { status: evaluationStatuses },
    arrays: { scores: 100 },
  })
  pin('evaluationsResponse', {
    schema: evaluationsResponse,
    sample: { projectId: id, criteria: [criterion], evaluations: [detail], hasMore: true },
    uuids: ['projectId'],
    booleans: ['hasMore'],
    arrays: { criteria: 100, evaluations: 20 },
  })
})

describe('report response rules', () => {
  const sections = {
    reportDate: day,
    information: {
      code: 'P-1',
      title: 'Recorded project',
      status: 'ACTIVE',
      sector: 'Health',
      area: 'Region',
      startDate: day,
      endDate: day,
      partners: 'Partner',
      manager: 'Fictional Manager',
    },
    overview: [{ area: 'Schedule', status: 'ON_TRACK', comment: 'On plan' }],
    keyFigures: [
      {
        label: 'Beneficiaries',
        state: 'AVAILABLE',
        value: '10',
        reason: 'Counted',
        detail: 'Reached',
        percent: 50,
      },
    ],
    budget: [
      {
        line: 'Training',
        currency: 'PHP',
        planned: '100',
        approved: '50',
        inReview: '20',
        remaining: '30',
      },
    ],
    milestones: [
      { title: 'Kickoff', status: 'DONE', targetDate: day, completionDate: day, overdue: false },
    ],
    indicators: [
      {
        code: 'I-1',
        name: 'Households',
        baseline: '0',
        target: '10',
        current: '5',
        progress: '50%',
      },
    ],
    alerts: [{ title: 'Behind', severity: 'LOW', explanation: 'Slow', evaluatedAt: stamp }],
  }
  const preview = {
    projectId: id,
    kind: 'PROJECT_SUMMARY',
    formId: id,
    columns: ['Title'],
    rows: [['Recorded project']],
    sections,
    generatedAt: stamp,
    unavailableReasons: ['None'],
  }
  const report = {
    id,
    name: 'Summary',
    type: 'PROJECT_SUMMARY',
    format: 'PDF',
    status: 'GENERATED',
    generatedAt: stamp,
    evaluation: { title: 'Mid-term', periodStart: '2026-01-01', periodEnd: '2026-06-30' },
  }
  const inSections = (change: (value: unknown) => object) => (value: unknown) => ({
    ...preview,
    sections: { ...sections, ...change(value) },
  })

  pin('the sections of a preview', {
    schema: reportPreviewResponse,
    sample: sections,
    wrap: (value) => ({ ...preview, sections: value }),
    optional: ['keyFigures', 'budget', 'milestones', 'indicators', 'alerts'],
    max: { reportDate: 40 },
    arrays: {
      overview: 10,
      keyFigures: 10,
      budget: 50,
      milestones: 100,
      indicators: 50,
      alerts: 10,
    },
  })
  pin('the information of a preview', {
    schema: reportPreviewResponse,
    sample: sections.information,
    wrap: inSections((value) => ({ information: value })),
    nullable: ['manager'],
    max: limits(
      2000,
      'code',
      'title',
      'status',
      'sector',
      'area',
      'startDate',
      'endDate',
      'partners',
      'manager',
    ),
  })
  pin('an overview row', {
    schema: reportPreviewResponse,
    sample: sections.overview[0],
    wrap: inSections((value) => ({ overview: [value] })),
    enums: { status: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_AVAILABLE'] },
    max: limits(2000, 'area', 'comment'),
  })
  pin('a key figure', {
    schema: reportPreviewResponse,
    sample: sections.keyFigures[0],
    wrap: inSections((value) => ({ keyFigures: [value] })),
    nullable: ['value', 'reason', 'percent'],
    enums: { state: ['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED'] },
    max: limits(2000, 'label', 'value', 'reason', 'detail'),
    numbers: { percent: [-100000, 100000] },
  })
  pin('a budget row', {
    schema: reportPreviewResponse,
    sample: sections.budget[0],
    wrap: inSections((value) => ({ budget: [value] })),
    max: { ...limits(2000, 'line', 'planned', 'approved', 'inReview', 'remaining'), currency: 3 },
  })
  pin('a milestone', {
    schema: reportPreviewResponse,
    sample: sections.milestones[0],
    wrap: inSections((value) => ({ milestones: [value] })),
    nullable: ['targetDate', 'completionDate'],
    booleans: ['overdue'],
    max: { title: 2000, status: 2000, targetDate: 40, completionDate: 40 },
  })
  pin('an indicator row', {
    schema: reportPreviewResponse,
    sample: sections.indicators[0],
    wrap: inSections((value) => ({ indicators: [value] })),
    nullable: ['baseline', 'target'],
    max: limits(2000, 'code', 'name', 'baseline', 'target', 'current', 'progress'),
  })
  pin('an alert', {
    schema: reportPreviewResponse,
    sample: sections.alerts[0],
    wrap: inSections((value) => ({ alerts: [value] })),
    enums: { severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    max: { title: 2000, explanation: 2000, evaluatedAt: 40 },
  })
  pin('reportPreviewResponse', {
    schema: reportPreviewResponse,
    sample: preview,
    nullable: ['formId'],
    optional: ['sections'],
    uuids: ['projectId', 'formId'],
    times: ['generatedAt'],
    enums: { kind: reportKinds },
    arrays: { columns: 30, rows: 1000, unavailableReasons: 20 },
  })
  pin('reportResponse', {
    schema: reportResponse,
    sample: report,
    nullable: ['format', 'generatedAt', 'evaluation'],
    uuids: ['id'],
    times: ['generatedAt'],
    enums: {
      type: [...reportKinds, 'OTHER'],
      format: ['CSV', 'XLSX', 'XLS', 'PDF'],
      status: ['DRAFT', 'GENERATED', 'ARCHIVED'],
    },
  })
  pin('the evaluation of a saved report', {
    schema: reportResponse,
    sample: report.evaluation,
    wrap: (value) => ({ ...report, evaluation: value }),
    dates: ['periodStart', 'periodEnd'],
  })
  pin('evaluationRoundResponse', {
    schema: evaluationRoundResponse,
    sample: {
      id,
      title: 'Mid-term',
      status: 'SIGNED_OFF',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      signedOffAt: stamp,
      overallScore: '71.08',
    },
    nullable: ['signedOffAt', 'overallScore'],
    uuids: ['id'],
    times: ['signedOffAt'],
    dates: ['periodStart', 'periodEnd'],
    decimals: ['overallScore'],
    enums: { status: evaluationStatuses },
  })
  pin('surveyFormResponse', {
    schema: surveyFormResponse,
    sample: { id, name: 'Survey', code: 'S', version: 1 },
    uuids: ['id'],
    integers: ['version'],
    positive: ['version'],
  })
  pin('generateReportResponse', {
    schema: generateReportResponse,
    sample: { id, status: 'GENERATED', pdfFallback: true },
    optional: ['pdfFallback'],
    uuids: ['id'],
    literals: { status: ['GENERATED', 'DRAFT'], pdfFallback: [true, false] },
  })

  it('bounds the rows and the cells of a preview', () => {
    const parses = (rows: unknown) => reportPreviewResponse.safeParse({ ...preview, rows }).success
    expect(parses([Array(30).fill('x'.repeat(2000))])).toBe(true)
    expect(parses([Array(31).fill('x')])).toBe(false)
    expect(parses([['x'.repeat(2001)]])).toBe(false)
  })
})
```

The barrel exports the three files after the request contracts (names stay unique across the barrel, so a collision fails the typecheck):

Create `.tmp/s6c/task1-index.json`:

```json
[
  [
    "packages/shared/src/index.ts",
    "export * from './contracts/reports/report-requests'\n",
    "export * from './contracts/reports/report-requests'\nexport * from './contracts/finance/finance-responses'\nexport * from './contracts/evaluations/evaluation-responses'\nexport * from './contracts/reports/report-responses'\n",
    1
  ]
]
```

```bash
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task1-index.json
pnpm exec biome check --write packages/shared/src 2>&1 | tail -2
pnpm --filter @pathways/shared exec tsc -p tsconfig.json --noEmit && echo "shared typecheck clean"
(cd packages/shared && pnpm exec vitest run src/contracts/finance/finance-responses.test.ts src/contracts/evaluations/evaluation-responses.test.ts src/contracts/reports/report-responses.test.ts src/contracts/common/response-rules.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
git status --short
```

Expected: one replacement, Biome has nothing to fix, the shared package typechecks and the four files run 35 tests (the 8 of the three contract tests and the 27 of the rules test):

```
1 replacements in 1 files
Checked 94 files in <ms>. No fixes applied.
shared typecheck clean
 Test Files  4 passed (4)
      Tests  35 passed (35)
 M packages/shared/src/index.ts
?? packages/shared/src/contracts/common/response-rules.test.ts
?? packages/shared/src/contracts/evaluations/evaluation-responses.test.ts
?? packages/shared/src/contracts/evaluations/evaluation-responses.ts
?? packages/shared/src/contracts/finance/finance-responses.test.ts
?? packages/shared/src/contracts/finance/finance-responses.ts
?? packages/shared/src/contracts/reports/report-responses.test.ts
?? packages/shared/src/contracts/reports/report-responses.ts
```

- [ ] **Step 2: Type the api returns and show that the types bite**

`.tmp/s6c/task1-edits.json` holds 18 exact replacements in five api files, all type-only: each mapper or service return gets the inferred type (`satisfies` where the value is returned from a transaction or a literal, a return type where a function returns one shape). Two edits narrow existing api types, because the preview is the one place the api widened a shared type to `string`: `Figure.state` becomes `MetricCell['state']` and the alert `severity` becomes `AlertSeverity`. Nothing is cast, and nothing runs differently:

Create `.tmp/s6c/task1-edits.json`:

```json
[
  [
    "apps/api/src/modules/finance/finance.service.ts",
    "import {\n  createBudgetRequest,\n  hasAtomicPermission,",
    "import {\n  type BudgetResponse,\n  type BudgetWriteResponse,\n  type ExpenseResponse,\n  type ExpenseSignoffResponse,\n  createBudgetRequest,\n  hasAtomicPermission,",
    1
  ],
  [
    "apps/api/src/modules/finance/finance.service.ts",
    "      return rows.map((row) => ({\n        ...row,\n        plannedBudget: row.plannedBudget.toFixed(2),",
    "      return rows.map((row): BudgetResponse => ({\n        ...row,\n        plannedBudget: row.plannedBudget.toFixed(2),",
    1
  ],
  [
    "apps/api/src/modules/finance/finance.service.ts",
    "      return { id: row.id, updatedAt: row.updatedAt.toISOString() }\n",
    "      return { id: row.id, updatedAt: row.updatedAt.toISOString() } satisfies BudgetWriteResponse\n",
    2
  ],
  [
    "apps/api/src/modules/finance/finance.service.ts",
    "      return rows.map(({ submittedBy, verifiedBy, approvedBy, ...row }) => {",
    "      return rows.map(({ submittedBy, verifiedBy, approvedBy, ...row }): ExpenseResponse => {",
    1
  ],
  [
    "apps/api/src/modules/finance/finance.service.ts",
    "      return { ...row, signedOffAt: row.signedOffAt.toISOString() }\n",
    "      return { ...row, signedOffAt: row.signedOffAt.toISOString() } satisfies ExpenseSignoffResponse\n",
    1
  ],
  [
    "apps/api/src/modules/evaluations/evaluations.mapper.ts",
    "import type { Prisma } from '@prisma/client'\n",
    "import type { EvaluationDetailResponse } from '@pathways/shared'\nimport type { Prisma } from '@prisma/client'\n",
    1
  ],
  [
    "apps/api/src/modules/evaluations/evaluations.mapper.ts",
    "export function mapEvaluationDetail(row: EvaluationDetailRow, scores: ScoreDetailRow[]) {",
    "export function mapEvaluationDetail(\n  row: EvaluationDetailRow,\n  scores: ScoreDetailRow[],\n): EvaluationDetailResponse {",
    1
  ],
  [
    "apps/api/src/modules/evaluations/evaluations.service.ts",
    "import {\n  createEvaluationRequest,\n  hasAtomicPermission,",
    "import {\n  type EvaluationsResponse,\n  createEvaluationRequest,\n  hasAtomicPermission,",
    1
  ],
  [
    "apps/api/src/modules/evaluations/evaluations.service.ts",
    "        hasMore: evaluations.length > maxEvaluations,\n      }\n",
    "        hasMore: evaluations.length > maxEvaluations,\n      } satisfies EvaluationsResponse\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "import { generateReportRequest, hasAtomicPermission, reportPreviewQuery } from '@pathways/shared'\n",
    "import {\n  type EvaluationRoundResponse,\n  type GenerateReportResponse,\n  type ReportPreviewResponse,\n  type ReportResponse,\n  type SurveyFormResponse,\n  generateReportRequest,\n  hasAtomicPermission,\n  reportPreviewQuery,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "          unavailableReasons: source.unavailableReasons,\n        }\n      },\n      { isolationLevel: 'RepeatableRead' },",
    "          unavailableReasons: source.unavailableReasons,\n        } satisfies ReportPreviewResponse\n      },\n      { isolationLevel: 'RepeatableRead' },",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "      if (rows.length > 100) throw new BadRequestException('Select a smaller survey scope.')\n      return rows\n",
    "      if (rows.length > 100) throw new BadRequestException('Select a smaller survey scope.')\n      return rows satisfies SurveyFormResponse[]\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "      return rows.map((row) => ({\n        id: row.id,\n        title: row.title,\n        status: row.status,",
    "      return rows.map((row): EvaluationRoundResponse => ({\n        id: row.id,\n        title: row.title,\n        status: row.status,",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "      return rows.map(({ evaluation, ...row }) => ({",
    "      return rows.map(({ evaluation, ...row }): ReportResponse => ({",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "  async generate(identity: ApplicationIdentity, requestedProjectId: string, input: unknown) {",
    "  async generate(\n    identity: ApplicationIdentity,\n    requestedProjectId: string,\n    input: unknown,\n  ): Promise<GenerateReportResponse> {",
    1
  ],
  [
    "apps/api/src/modules/reports/report-project-status.ts",
    "import { type IndicatorResponse, type MetricCell, alertSeverities } from '@pathways/shared'",
    "import {\n  type AlertSeverity,\n  type IndicatorResponse,\n  type MetricCell,\n  alertSeverities,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/reports/report-project-status.ts",
    "  label: string\n  state: string\n",
    "  label: string\n  state: MetricCell['state']\n",
    1
  ],
  [
    "apps/api/src/modules/reports/report-project-status.ts",
    "  alerts?: Array<{ title: string; severity: string; explanation: string; evaluatedAt: string }>",
    "  alerts?: Array<{ title: string; severity: AlertSeverity; explanation: string; evaluatedAt: string }>",
    1
  ]
]
```

```bash
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task1-edits.json
pnpm exec biome check --write apps/api/src/modules/finance apps/api/src/modules/evaluations apps/api/src/modules/reports 2>&1 | tail -2
pnpm --filter @pathways/shared build > /dev/null 2>&1
pnpm --filter @pathways/api exec tsc --noEmit && echo "api typecheck clean"
git diff --stat -- apps/api | cat
```

Expected: 18 replacements, Biome clean, the api typechecks and five files changed:

```
18 replacements in 5 files
Checked 52 files in <ms>. Fixed 3 files.
api typecheck clean
 .../src/modules/evaluations/evaluations.mapper.ts  |  6 +-
 .../src/modules/evaluations/evaluations.service.ts |  3 +-
 apps/api/src/modules/finance/finance.service.ts    | 24 +++++---
 .../src/modules/reports/report-project-status.ts   | 16 +++++-
 apps/api/src/modules/reports/reports.service.ts    | 65 ++++++++++++++--------
 5 files changed, 76 insertions(+), 38 deletions(-)
```

The annotations must bite: rename one response field in each of the three services (the mapper, the finance rows and the report list), look at the typecheck, then restore:

```bash
A=apps/api/src/modules
cp $A/evaluations/evaluations.mapper.ts .tmp/s6c/files/mapper.bak
cp $A/finance/finance.service.ts .tmp/s6c/files/finance.bak
cp $A/reports/reports.service.ts .tmp/s6c/files/reports.bak
sed -i 's/^    periodLabel: row.periodLabel,$/    label: row.periodLabel,/' $A/evaluations/evaluations.mapper.ts
sed -i 's/^          submittedByName: displayName(submittedBy),$/          submitterName: displayName(submittedBy),/' $A/finance/finance.service.ts
sed -i 's/^          generatedAt: row.generatedAt?.toISOString() ?? null,$/          generated: row.generatedAt?.toISOString() ?? null,/' $A/reports/reports.service.ts
pnpm --filter @pathways/api exec tsc --noEmit 2>&1 | grep "error TS" | cut -c1-170
cp .tmp/s6c/files/mapper.bak $A/evaluations/evaluations.mapper.ts
cp .tmp/s6c/files/finance.bak $A/finance/finance.service.ts
cp .tmp/s6c/files/reports.bak $A/reports/reports.service.ts
pnpm --filter @pathways/api exec tsc --noEmit && echo "api typecheck clean again"
```

Expected: three errors, one per renamed field, and a clean typecheck after the restore:

```
src/modules/evaluations/evaluations.mapper.ts(63,5): error TS2353: Object literal may only specify known properties, and 'label' does not exist in type '{ status: "DRAFT"
src/modules/finance/finance.service.ts(186,11): error TS2561: Object literal may only specify known properties, but 'submitterName' does not exist in type '{ status: "PEN
src/modules/reports/reports.service.ts(197,11): error TS2561: Object literal may only specify known properties, but 'generated' does not exist in type '{ type: "OTHER" | 
api typecheck clean again
```

The api and its tests are untouched at run time: the annotations are erased by the compiler, and no api file imports a schema value from the new contracts (the imports are `type` imports). Run the three module suites:

```bash
cd apps/api && pnpm exec vitest run src/modules/finance src/modules/evaluations src/modules/reports 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "; cd ../..
git grep -n "from '@pathways/shared'" -- apps/api/src/modules/finance/finance.service.ts | head -2
```

Expected: the module suites pass:

```
 Test Files  20 passed | 2 skipped (22)
      Tests  285 passed | 10 skipped (295)
apps/api/src/modules/finance/finance.service.ts:25:} from '@pathways/shared'
```

- [ ] **Step 3: Commit**

```bash
pnpm lint 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add packages/shared apps/api
git commit -m "refactor: add the finance, evaluation and report response contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -14
```

Expected: lint is clean and the commit holds 12 files, three of them the new contracts and three their tests:

```
Checked 1449 files in <ms>. No fixes applied.
[<branch> <sha>] refactor: add the finance, evaluation and report response contracts
 13 files changed, 1184 insertions(+), 38 deletions(-)
 create mode 100644 packages/shared/src/contracts/common/response-rules.test.ts
 create mode 100644 packages/shared/src/contracts/evaluations/evaluation-responses.test.ts
 create mode 100644 packages/shared/src/contracts/evaluations/evaluation-responses.ts
 create mode 100644 packages/shared/src/contracts/finance/finance-responses.test.ts
 create mode 100644 packages/shared/src/contracts/finance/finance-responses.ts
 create mode 100644 packages/shared/src/contracts/reports/report-responses.test.ts
 create mode 100644 packages/shared/src/contracts/reports/report-responses.ts
 .../src/modules/evaluations/evaluations.mapper.ts  |   6 +-
 .../src/modules/evaluations/evaluations.service.ts |   3 +-
 apps/api/src/modules/finance/finance.service.ts    |  24 +-
 .../src/modules/reports/report-project-status.ts   |  16 +-
 apps/api/src/modules/reports/reports.service.ts    |  65 ++-
 .../src/contracts/common/response-rules.test.ts    | 545 +++++++++++++++++++++
 .../evaluations/evaluation-responses.test.ts       |  75 +++
 .../contracts/evaluations/evaluation-responses.ts  | 100 ++++
 .../contracts/finance/finance-responses.test.ts    |  69 +++
 .../src/contracts/finance/finance-responses.ts     |  73 +++
 .../src/contracts/reports/report-responses.test.ts |  64 +++
 .../src/contracts/reports/report-responses.ts      | 179 +++++++
 packages/shared/src/index.ts                       |   3 +
 13 files changed, 1184 insertions(+), 38 deletions(-)
```


---

### Task 2: The web parses the shared responses

**Files:**
- Modify: `apps/web/src/lib/api/finance.ts`, `evaluations.ts`, `reports.ts` and the test `reports.test.ts` (the S6b finance test already pins the currency); `features/reports/print/print-report-payload.ts`, `print-report-sections.tsx`, `print-report-sample.ts`, `print-report-sections.test.tsx`; `features/projects/evaluation/components/live-evaluation-workspace.tsx` and its test
- Delete: `apps/web/src/lib/api/report-sections.ts`
- Create (gitignored): `.tmp/s6c/task2-clients.json`, `task2-callers.json`, `task2-tests.json`, `schema-moved.mjs`

The clients keep parsing every response at runtime (S3 ruling 8 and CR section 3.6: a response that was parsed before the modularization stays parsed), now with the shared schemas. The three places where the api type is wider than what the web accepts keep their narrowing in the client with `.extend`, so the web refuses what it refused before: a budget line in a currency other than `PHP`, a saved report whose type is not one of the six kinds, and an evaluation round that is not signed off or archived. The projectId and id refinements stay in the client.

- [ ] **Step 1: Point the clients and their callers at the shared schemas**

`.tmp/s6c/task2-clients.json` holds 17 exact replacements in the three client files: the local schema declarations go, the imports of the shared schemas come in, and `budgetSchema`, `reportSchema` and `evaluationRoundSchema` become the `.extend` narrowings. `evaluationDetailSchema` is no longer exported by the evaluation client (its one importer, the workspace, takes the type from the shared package):

Create `.tmp/s6c/task2-clients.json`:

```json
[
  [
    "apps/web/src/lib/api/finance.ts",
    "import type {\n  CreateBudgetRequest,\n  ReplaceBudgetRequest,\n  ReviewExpenseRequest,\n  SubmitExpenseRequest,\n} from '@pathways/shared'\n",
    "import {\n  type CreateBudgetRequest,\n  type ReplaceBudgetRequest,\n  type ReviewExpenseRequest,\n  type SubmitExpenseRequest,\n  budgetReferenceResponse,\n  budgetResponse,\n  budgetWriteResponse,\n  expenseAcknowledgementResponse,\n  expenseResponse,\n  expenseSignoffResponse,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "const decimal = z.string().regex(/^-?\\d+(?:\\.\\d+)?$/)\nconst budgetSchema = z\n  .object({\n    id: uuid,\n    activityId: uuid.nullable(),\n    category: z.string(),\n    currency: z.literal('PHP'),\n    plannedBudget: decimal,\n    remarks: z.string().nullable(),\n    updatedAt: timestamp,\n  })\n  .strict()\nconst expenseSchema = z\n  .object({\n    id: uuid,\n    budgetRecordId: uuid,\n    description: z.string(),\n    amount: decimal,\n    expenseDate: z.string(),\n    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),\n    receiptEvidenceId: uuid.nullable(),\n    submittedById: uuid,\n    verifiedById: uuid.nullable(),\n    approvedById: uuid.nullable(),\n    updatedAt: timestamp,\n    signedOffById: uuid.nullable(),\n    signedOffAt: timestamp.nullable(),\n    submittedByName: z.string().max(200).nullable(),\n    verifiedByName: z.string().max(200).nullable(),\n    approvedByName: z.string().max(200).nullable(),\n    signedOffByName: z.string().max(200).nullable(),\n  })\n  .strict()\nconst expenseAck = z\n  .object({\n    id: uuid,\n    projectId: uuid,\n    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),\n    updatedAt: timestamp,\n    receiptEvidenceId: uuid.nullable(),\n  })\n  .strict()\n",
    "// The stored currency is a plain string, so the client keeps refusing every currency but PHP.\nconst budgetSchema = budgetResponse.extend({ currency: z.literal('PHP') })\n",
    1
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "z.object({ id: uuid, updatedAt: timestamp }).strict()",
    "budgetWriteResponse",
    2
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "z.array(expenseSchema)",
    "z.array(expenseResponse)",
    1
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "      z\n        .array(z.object({ id: uuid, category: z.string(), activityId: uuid.nullable() }).strict())\n        .max(100),\n",
    "      z.array(budgetReferenceResponse).max(100),\n",
    1
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "expenseAck.refine(",
    "expenseAcknowledgementResponse.refine(",
    3
  ],
  [
    "apps/web/src/lib/api/finance.ts",
    "      z\n        .object({ expenseId: uuid, signedOffById: uuid, signedOffAt: timestamp })\n        .strict()\n        .refine((row) => row.expenseId === expenseId),",
    "      expenseSignoffResponse.refine((row) => row.expenseId === expenseId),",
    1
  ],
  [
    "apps/web/src/lib/api/evaluations.ts",
    "import type {\n  CreateEvaluationRequest,\n  ReturnEvaluationRequest,\n  SaveEvaluationScoresRequest,\n  SignOffEvaluationRequest,\n  SubmitEvaluationRequest,\n} from '@pathways/shared'\n",
    "import {\n  type CreateEvaluationRequest,\n  type ReturnEvaluationRequest,\n  type SaveEvaluationScoresRequest,\n  type SignOffEvaluationRequest,\n  type SubmitEvaluationRequest,\n  evaluationDetailResponse,\n  evaluationsResponse,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/lib/api/evaluations.ts",
    "const timestamp = z.string().datetime({ offset: true })\nconst decimal = z.string().regex(/^-?\\d+(?:\\.\\d+)?$/)\nconst criterionSchema = z\n  .object({\n    id: uuid,\n    code: z.string(),\n    name: z.string(),\n    description: z.string().nullable(),\n    type: z.enum([\n      'KPI',\n      'TIMELINE_COMPLIANCE',\n      'BUDGET_EFFICIENCY',\n      'BENEFICIARY_REACH',\n      'INDICATOR_LINKAGE',\n      'ASSESSMENT_GAIN',\n      'OTHER',\n    ]),\n    version: z.number().int(),\n    weightPercentage: decimal,\n    maximumScore: decimal,\n    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),\n    updatedAt: timestamp,\n  })\n  .strict()\nconst evaluationPersonSchema = z.object({ id: uuid, name: z.string() }).strict().nullable()\nconst criterionSnapshotSchema = z\n  .object({\n    id: uuid,\n    code: z.string(),\n    version: z.number().int(),\n    type: z.string(),\n    name: z.string(),\n    description: z.string().nullable(),\n    weight_percentage: z.string(),\n    maximum_score: z.string(),\n  })\n  .strict()\nconst evaluationScoreSchema = z\n  .object({\n    criterionId: uuid,\n    score: decimal,\n    maximumScore: decimal,\n    weightedScore: decimal,\n    source: z.enum(['computed', 'no_data', 'manual']),\n    evidence: z.string().nullable(),\n    reason: z.string().nullable(),\n    note: z.string().nullable(),\n    criterion: criterionSnapshotSchema,\n  })\n  .strict()\nexport const evaluationDetailSchema = z\n  .object({\n    id: uuid,\n    title: z.string(),\n    periodLabel: z.string().nullable(),\n    periodStart: z.string(),\n    periodEnd: z.string(),\n    overallScore: decimal.nullable(),\n    commentary: z.string().nullable(),\n    returnReason: z.string().nullable(),\n    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),\n    updatedAt: timestamp,\n    evaluatedBy: evaluationPersonSchema,\n    evaluatedAt: timestamp.nullable(),\n    reviewedBy: evaluationPersonSchema,\n    reviewedAt: timestamp.nullable(),\n    reviewFeedback: z.string().nullable(),\n    signedOffBy: evaluationPersonSchema,\n    signedOffAt: timestamp.nullable(),\n    scores: z.array(evaluationScoreSchema).max(100),\n  })\n  .strict()\nconst evaluationSchema = z\n  .object({\n    projectId: uuid,\n    criteria: z.array(criterionSchema).max(100),\n    evaluations: z.array(evaluationDetailSchema).max(20),\n    hasMore: z.boolean(),\n  })\n  .strict()\n",
    "",
    1
  ],
  [
    "apps/web/src/lib/api/evaluations.ts",
    "evaluationSchema.refine(",
    "evaluationsResponse.refine(",
    1
  ],
  [
    "apps/web/src/lib/api/evaluations.ts",
    "evaluationDetailSchema",
    "evaluationDetailResponse",
    5
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "import { type GenerateReportRequest, reportKinds } from '@pathways/shared'\n",
    "import {\n  type GenerateReportRequest,\n  evaluationRoundResponse,\n  generateReportResponse,\n  reportKinds,\n  reportPreviewResponse,\n  reportResponse,\n  surveyFormResponse,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "import { reportSectionsSchema } from '@/lib/api/report-sections'\n",
    "",
    1
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "const timestamp = z.string().datetime({ offset: true })\nconst decimal = z.string().regex(/^-?\\d+(?:\\.\\d+)?$/)\nconst dateOnly = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)\nconst reportKind = z.enum(reportKinds)\nconst reportFormat = z.enum(['CSV', 'XLSX', 'XLS', 'PDF'])\nconst reportPreviewSchema = z\n  .object({\n    projectId: uuid,\n    kind: reportKind,\n    formId: uuid.nullable(),\n    columns: z.array(z.string()).max(30),\n    rows: z.array(z.array(z.string().max(2000)).max(30)).max(1000),\n    sections: reportSectionsSchema.optional(),\n    generatedAt: timestamp,\n    unavailableReasons: z.array(z.string()).max(20),\n  })\n  .strict()\nconst reportSchema = z\n  .object({\n    id: uuid,\n    name: z.string(),\n    type: reportKind,\n    format: reportFormat.nullable(),\n    status: z.enum(['DRAFT', 'GENERATED', 'ARCHIVED']),\n    generatedAt: timestamp.nullable(),\n    evaluation: z\n      .object({ title: z.string(), periodStart: dateOnly, periodEnd: dateOnly })\n      .strict()\n      .nullable(),\n  })\n  .strict()\nconst evaluationRoundSchema = z\n  .object({\n    id: uuid,\n    title: z.string(),\n    status: z.enum(['SIGNED_OFF', 'ARCHIVED']),\n    periodStart: dateOnly,\n    periodEnd: dateOnly,\n    signedOffAt: timestamp.nullable(),\n    overallScore: decimal.nullable(),\n  })\n  .strict()\n",
    "const reportKind = z.enum(reportKinds)\n// The stored report type also holds OTHER and the stored round status holds open states, so the client narrows both.\nconst reportSchema = reportResponse.extend({ type: reportKind })\nconst evaluationRoundSchema = evaluationRoundResponse.extend({\n  status: z.enum(['SIGNED_OFF', 'ARCHIVED']),\n})\n",
    1
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "      z\n        .array(\n          z\n            .object({\n              id: uuid,\n              name: z.string(),\n              code: z.string(),\n              version: z.number().int().positive(),\n            })\n            .strict(),\n        )\n        .max(100),\n",
    "      z.array(surveyFormResponse).max(100),\n",
    1
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "reportPreviewSchema.refine(",
    "reportPreviewResponse.refine(",
    1
  ],
  [
    "apps/web/src/lib/api/reports.ts",
    "      z\n        .object({\n          id: uuid,\n          status: z.literal('GENERATED'),\n          pdfFallback: z.literal(true).optional(),\n        })\n        .strict(),\n",
    "      generateReportResponse,\n",
    1
  ]
]
```

`.tmp/s6c/task2-callers.json` holds 17 replacements in six files: the print payload, sections, sample and sections test import `reportSectionsResponse`, `ReportSectionsResponse` and `ReportStatusLevel` from the shared package, and the evaluation workspace and its test use `EvaluationDetailResponse`:

Create `.tmp/s6c/task2-callers.json`:

```json
[
  [
    "apps/web/src/features/reports/print/print-report-payload.ts",
    "import { reportSectionsSchema } from '@/lib/api/report-sections'\n",
    "import { reportSectionsResponse } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-payload.ts",
    "reportSectionsSchema.optional()",
    "reportSectionsResponse.optional()",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.tsx",
    "StatusLevel",
    "ReportStatusLevel",
    4
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.tsx",
    "import type { ReportSections, ReportStatusLevel } from '@/lib/api/report-sections'\nimport { cn } from '@/lib/utils'\n",
    "import { cn } from '@/lib/utils'\nimport type { ReportSectionsResponse, ReportStatusLevel } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.tsx",
    "ReportSections[",
    "ReportSectionsResponse[",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.tsx",
    "sections: ReportSections }",
    "sections: ReportSectionsResponse }",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sample.ts",
    "import type { ReportSections } from '@/lib/api/report-sections'\nimport type { PrintReport } from './print-report-payload'\n",
    "import type { ReportSectionsResponse } from '@pathways/shared'\nimport type { PrintReport } from './print-report-payload'\n",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sample.ts",
    "const sections: ReportSections = {",
    "const sections: ReportSectionsResponse = {",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.test.tsx",
    "import { reportSectionsSchema } from '@/lib/api/report-sections'\nimport { cleanup, render, screen, within } from '@testing-library/react'\n",
    "import { reportSectionsResponse } from '@pathways/shared'\nimport { cleanup, render, screen, within } from '@testing-library/react'\n",
    1
  ],
  [
    "apps/web/src/features/reports/print/print-report-sections.test.tsx",
    "reportSectionsSchema.safeParse",
    "reportSectionsResponse.safeParse",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
    "import { type evaluationDetailSchema, evaluationsClient } from '@/lib/api/evaluations'\n",
    "import { evaluationsClient } from '@/lib/api/evaluations'\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
    "import { principalHasAtomicPermission } from '@/lib/rbac/policy'\n",
    "import { principalHasAtomicPermission } from '@/lib/rbac/policy'\nimport type { EvaluationDetailResponse } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
    "import type { z } from 'zod'\n",
    "",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
    "type EvaluationDetail = z.infer<typeof evaluationDetailSchema>\n",
    "type EvaluationDetail = EvaluationDetailResponse\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
    "import type { evaluationDetailSchema } from '@/lib/api/evaluations'\n/* @vitest-environment jsdom */\n",
    "/* @vitest-environment jsdom */\nimport type { EvaluationDetailResponse } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
    "import type { z } from 'zod'\n",
    "",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
    "type EvaluationDetail = z.infer<typeof evaluationDetailSchema>\n",
    "type EvaluationDetail = EvaluationDetailResponse\n",
    1
  ]
]
```

`.tmp/s6c/task2-tests.json` adds three rows to the table of refused responses of the reports client test: a saved report of type `OTHER`, a round that is submitted and a round that is reviewed (the S6b rows refuse a budget line in `USD` and a draft round, so the finance test is not edited):

Create `.tmp/s6c/task2-tests.json`:

```json
[
  [
    "apps/web/src/lib/api/reports.test.ts",
    "    [\n      'an evaluation round with a draft status',\n      (c, id) => c.evaluationRounds(id),\n      [{ ...round, status: 'DRAFT' }],\n    ],\n",
    "    [\n      'an evaluation round with a draft status',\n      (c, id) => c.evaluationRounds(id),\n      [{ ...round, status: 'DRAFT' }],\n    ],\n    [\n      'an evaluation round with a submitted status',\n      (c, id) => c.evaluationRounds(id),\n      [{ ...round, status: 'SUBMITTED' }],\n    ],\n    [\n      'an evaluation round with a reviewed status',\n      (c, id) => c.evaluationRounds(id),\n      [{ ...round, status: 'REVIEWED' }],\n    ],\n    [\n      'a saved report of a type outside the report kinds',\n      (c, id) => c.reports(id),\n      [{ ...report, type: 'OTHER' }],\n    ],\n",
    1
  ]
]
```

```bash
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task2-clients.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task2-callers.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task2-tests.json
git rm -q apps/web/src/lib/api/report-sections.ts
FILES=$(git diff --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$")
node .tmp/s6c/trim-imports.mjs $FILES | grep -v "removed nothing"
pnpm exec biome check --write $FILES 2>&1 | tail -2
pnpm --filter @pathways/shared build > /dev/null 2>&1
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
git checkout -- apps/web/next-env.d.ts
git status --short
```

Expected: 17, 17 and 1 replacements, no import left unused, Biome has nothing to fix, the web typechecks, `--noUnusedLocals` lists only the two baseline lines (`use-collection-state.ts` `indicators`, `types/pathways.ts` `SadddDashboard`) and the tree holds 10 modified files and the deletion of `report-sections.ts`:

```
17 replacements in 3 files
17 replacements in 6 files
1 replacements in 1 files
Checked 10 files in <ms>. Fixed 3 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
 M apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx
 M apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx
 M apps/web/src/features/reports/print/print-report-payload.ts
 M apps/web/src/features/reports/print/print-report-sample.ts
 M apps/web/src/features/reports/print/print-report-sections.test.tsx
 M apps/web/src/features/reports/print/print-report-sections.tsx
 M apps/web/src/lib/api/evaluations.ts
 M apps/web/src/lib/api/finance.ts
D  apps/web/src/lib/api/report-sections.ts
 M apps/web/src/lib/api/reports.test.ts
 M apps/web/src/lib/api/reports.ts
```

- [ ] **Step 2: Prove that every schema moved verbatim**

`.tmp/s6c/schema-moved.mjs` checks, declaration by declaration, that each top-level `const` of one file set occurs in the other, whitespace and trailing commas aside, with `--rename` for the new names and `--edit` for a deliberate change; the second half of the check looks for the old declarations in the new files and in the edited clients (`--also`):

Create `.tmp/s6c/schema-moved.mjs`:

```js
// Proves schema declarations moved verbatim: each declaration of one file set must occur, whitespace and trailing commas aside, in the other set.
// Usage: schema-moved.mjs --old <file>... --new <file>... [--also <file>...] [--rename new=old]... [--edit 'new text=>old text']... [--skip name]...
// An --edit names a deliberate change; --also files are searched for the old declarations but their own declarations are not checked; a skipped name is not checked.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const sets = { old: [], new: [], also: [] }
const renames = []
const edits = []
const skip = new Set()
let mode = ''
for (const arg of args) {
  if (arg === '--old' || arg === '--new' || arg === '--also' || arg === '--rename' || arg === '--edit' || arg === '--skip') mode = arg.slice(2)
  else if (mode === 'rename') renames.push(arg.split('='))
  else if (mode === 'edit') edits.push(arg.split('=>'))
  else if (mode === 'skip') skip.add(arg)
  else sets[mode].push(arg)
}

// Whitespace and a comma before a closing bracket do not change a schema.
const norm = (text) => text.replace(/\s+/g, '').replace(/,(?=[)}\]])/g, '')
const text = (files) => norm(files.map((file) => readFileSync(file, 'utf8')).join('\n'))
const start = /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(.*)$/

// Top-level const declarations as [name, text of the right side]; a declaration runs to the next top-level line.
const declarations = (files) =>
  files.flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n')
    const found = []
    for (let i = 0; i < lines.length; i++) {
      const match = start.exec(lines[i])
      if (!match || skip.has(match[1])) continue
      const body = [match[2]]
      while (i + 1 < lines.length && /^(?:\s|\)|\}|\])/.test(lines[i + 1])) body.push(lines[++i])
      found.push([match[1], body.join('\n')])
    }
    return found
  })

const check = (from, into, undo) => {
  const haystack = text(into)
  let missing = 0
  let edited = 0
  const found = declarations(from)
  for (const [name, body] of found) {
    let candidate = body
    for (const [a, b] of renames) candidate = undo ? candidate.replaceAll(b, a) : candidate.replaceAll(a, b)
    let changed = false
    for (const [after, before] of edits) {
      const [x, y] = undo ? [norm(before), norm(after)] : [norm(after), norm(before)]
      const swapped = norm(candidate).replaceAll(x, y)
      if (swapped !== norm(candidate)) changed = true
      candidate = swapped
    }
    if (changed) edited++
    if (haystack.includes(norm(candidate))) continue
    missing++
    console.log(`missing: ${name}`)
  }
  return { total: found.length, missing, edited }
}

const forward = check(sets.new, sets.old, false)
console.log(`new declarations found in the old code: ${forward.total - forward.missing} of ${forward.total} (${forward.edited} edited)`)
const reverse = check(sets.old, [...sets.new, ...sets.also], true)
console.log(`old declarations found in the new code: ${reverse.total - reverse.missing} of ${reverse.total}`)
console.log(`lost ${forward.missing + reverse.missing}`)
process.exitCode = forward.missing + reverse.missing ? 1 : 0
```

```bash
T=.tmp/s6c/files
node .tmp/s6c/schema-moved.mjs --old $T/finance.orig.ts --new packages/shared/src/contracts/finance/finance-responses.ts --also apps/web/src/lib/api/finance.ts --rename budgetResponse=budgetSchema --rename expenseResponse=expenseSchema --rename expenseAcknowledgementResponse=expenseAck --edit "currency: z.string()=>currency: z.literal('PHP')" --skip financeClient
node .tmp/s6c/schema-moved.mjs --old $T/evaluations.orig.ts --new packages/shared/src/contracts/evaluations/evaluation-responses.ts --also apps/web/src/lib/api/evaluations.ts --rename evaluationCriterionResponse=criterionSchema --rename evaluationScoreResponse=evaluationScoreSchema --rename evaluationDetailResponse=evaluationDetailSchema --rename evaluationsResponse=evaluationSchema --skip evaluationsClient
node .tmp/s6c/schema-moved.mjs --old $T/reports.orig.ts $T/report-sections.orig.ts --new packages/shared/src/contracts/reports/report-responses.ts --also apps/web/src/lib/api/reports.ts --rename reportPreviewResponse=reportPreviewSchema --rename reportResponse=reportSchema --rename evaluationRoundResponse=evaluationRoundSchema --rename reportSectionsResponse=reportSectionsSchema --edit "type: z.enum(reportTypes)=>type: reportKind" --edit "status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED'])=>status: z.enum(['SIGNED_OFF', 'ARCHIVED'])" --skip reportsClient reportTypes
```

Expected: every declaration is found on both sides, with the edited ones counted (the three narrowings: the currency, the report type and the round status) and `lost 0` three times:

```
new declarations found in the old code: 9 of 9 (1 edited)
old declarations found in the new code: 6 of 6
lost 0
new declarations found in the old code: 9 of 9 (0 edited)
old declarations found in the new code: 9 of 9
lost 0
new declarations found in the old code: 15 of 15 (2 edited)
old declarations found in the new code: 13 of 13
lost 0
```

The `--edit` arguments are the only differences the proof is told about, and they are the three narrowings of the ruling: the shared schemas are wider by exactly those fields, and the clients restore them with `.extend`. The one skipped constant, `reportTypes` (the six kinds plus `OTHER`), is new in the shared file and has no old counterpart. A declaration that moved with any other change would print `missing:`.

- [ ] **Step 3: Run the web tests and show that the strict schemas bite**

```bash
cd apps/web && pnpm exec vitest run src/lib/api src/features/reports src/features/projects/evaluation 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "; cd ../..
P=packages/shared/src/contracts/finance/finance-responses.ts
cp $P .tmp/s6c/files/m1.bak
node -e "
const fs = require('fs')
const t = fs.readFileSync('$P', 'utf8')
const from = '    updatedAt: timestamp,\n  })\n  .strict()\nexport type BudgetResponse'
if (!t.includes(from)) throw new Error('anchor missing')
fs.writeFileSync('$P', t.replace(from, '    updatedAt: timestamp,\n  })\nexport type BudgetResponse'))
"
pnpm --filter @pathways/shared build > /dev/null 2>&1
(cd apps/web && pnpm exec vitest run src/lib/api/finance.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+| FAIL ")
cp .tmp/s6c/files/m1.bak $P
pnpm --filter @pathways/shared build > /dev/null 2>&1
git status --short | wc -l
```

Expected: the client and component tests pass (the S6b request and response rows unchanged, plus the three new rows), and loosening the budget schema to accept unknown keys fails the S6b row that refuses one:

```
 Test Files  31 passed (31)
      Tests  445 passed (445)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/api/finance.test.ts > financeClient requests > budgets rejects a response with an unknown key
      Tests  1 failed | 66 passed (67)
11
```

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): parse the finance, evaluation and report responses with the shared contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -14
```

Expected: lint is clean and the commit holds 12 files, one of them the deletion of `report-sections.ts`:

```
Checked 1448 files in <ms>. No fixes applied.
[<branch> <sha>] refactor(web): parse the finance, evaluation and report responses with the shared contracts
 11 files changed, 87 insertions(+), 348 deletions(-)
 delete mode 100644 apps/web/src/lib/api/report-sections.ts
 .../components/live-evaluation-workspace.test.tsx  |   5 +-
 .../components/live-evaluation-workspace.tsx       |   6 +-
 .../features/reports/print/print-report-payload.ts |   4 +-
 .../features/reports/print/print-report-sample.ts  |   4 +-
 .../reports/print/print-report-sections.test.tsx   |   5 +-
 .../reports/print/print-report-sections.tsx        |  12 +--
 apps/web/src/lib/api/evaluations.ts                | 106 +++------------------
 apps/web/src/lib/api/finance.ts                    |  85 ++++-------------
 apps/web/src/lib/api/report-sections.ts            | 103 --------------------
 apps/web/src/lib/api/reports.test.ts               |  15 +++
 apps/web/src/lib/api/reports.ts                    |  90 ++++-------------
 11 files changed, 87 insertions(+), 348 deletions(-)
```


---

### Task 3: Shared report kind grants

**Files:**
- Create: `packages/shared/src/rbac/report-kind-grants.ts` and its test; `apps/api/src/modules/reports/reports.helpers.test.ts`
- Modify: `packages/shared/src/index.ts`; `apps/api/src/modules/reports/reports.helpers.ts`, `reports.service.ts` and `reports.service.test.ts`; `apps/web/src/features/reports/components/live-reporting-workspace.tsx` and its test
- Create (gitignored): `.tmp/s6c/task3-index.json`, `task3-web-parity.json`, `task3-service-test.json`, `task3-api-swap.json`, `task3-web-swap.json`

The api list route (`readableReportKinds`) and the web report menu (`allowedKinds`) each wrote out which permission and which extra grants a report kind needs. One table, `reportKindGrants`, now holds them and `grantedReportKinds(role, granted)` lists the kinds a role may open. `assertReportPermission` keeps its own rules: it does not require the beneficiary aggregate grants, whose refusal has its own 403 text in the report source, so it reads the same table but exempts that one kind from the extra grants. The parity tests come first, against the code as it stands, and stay afterwards.

- [ ] **Step 1: The table and the parity tests, passing against the old code**

Create each file with the Write tool exactly as printed. The table has one row per kind with its permission and the grants it also requires, in catalog order (survey results also requires `assessments.read`, and the monitoring and evaluation kinds `monitoring.read`):

Create `packages/shared/src/rbac/report-kind-grants.ts`:

```ts
import { type ReportKindCode, reportKinds } from '../constants/domain-codes'
import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'

export type ReportKindGrant = {
  permission: AtomicPermission
  requires: readonly AtomicPermission[]
}

// The grants each report kind needs: its own permission plus the extra grants the api also requires.
export const reportKindGrants: Record<ReportKindCode, ReportKindGrant> = {
  PROJECT_SUMMARY: { permission: 'reports.project.read', requires: [] },
  INDICATOR_SUMMARY: { permission: 'reports.indicator.read', requires: [] },
  BENEFICIARY_SUMMARY: {
    permission: 'reports.beneficiary.read',
    requires: ['analytics.saddd.read', 'beneficiaries.aggregates.read'],
  },
  SURVEY_FORM_RESULTS: { permission: 'reports.project.read', requires: ['assessments.read'] },
  MONITORING_REPORT: { permission: 'reports.indicator.read', requires: ['monitoring.read'] },
  EVALUATION_REPORT: { permission: 'reports.project.read', requires: ['monitoring.read'] },
}

// Report kinds a role may open: every kind whose permission and extra grants it holds, in catalog order.
export function grantedReportKinds(role: string, granted: readonly string[]): ReportKindCode[] {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return reportKinds.filter((kind) => {
    const { permission, requires } = reportKindGrants[kind]
    return has(permission) && requires.every(has)
  })
}
```

The shared test freezes the old rule as an oracle (`reference`) and compares `grantedReportKinds` with it for every role of `rolePermissions` and every one of the 128 subsets of the seven relevant grants, then pins the offered kinds of each of the six roles as a literal list, an unknown role and an empty grant list:

Create `packages/shared/src/rbac/report-kind-grants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { type ReportKindCode, reportKinds } from '../constants/domain-codes'
import { hasAtomicPermission, rolePermissions } from './authorization-policy'
import { grantedReportKinds, reportKindGrants } from './report-kind-grants'

// The rules the api list route and the web report menu each wrote out before the shared table.
const kindPermission = {
  PROJECT_SUMMARY: 'reports.project.read',
  INDICATOR_SUMMARY: 'reports.indicator.read',
  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',
  SURVEY_FORM_RESULTS: 'reports.project.read',
  MONITORING_REPORT: 'reports.indicator.read',
  EVALUATION_REPORT: 'reports.project.read',
} as const
const extraKindRequires = {
  MONITORING_REPORT: 'monitoring.read',
  EVALUATION_REPORT: 'monitoring.read',
}
const isExtraReportKind = (kind: string): kind is keyof typeof extraKindRequires =>
  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'
const reference = (role: string, granted: readonly string[]) => {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return (Object.keys(kindPermission) as ReportKindCode[]).filter(
    (kind) =>
      has(kindPermission[kind]) &&
      (kind !== 'BENEFICIARY_SUMMARY' ||
        (has('analytics.saddd.read') && has('beneficiaries.aggregates.read'))) &&
      (!isExtraReportKind(kind) || has(extraKindRequires[kind])) &&
      (kind !== 'SURVEY_FORM_RESULTS' || has('assessments.read')),
  )
}

const relevant = [
  'reports.project.read',
  'reports.indicator.read',
  'reports.beneficiary.read',
  'analytics.saddd.read',
  'beneficiaries.aggregates.read',
  'monitoring.read',
  'assessments.read',
]
const subsets = relevant
  .map((_, index) => index)
  .reduce<string[][]>(
    (all, index) => all.concat(all.map((subset) => [...subset, relevant[index] as string])),
    [[]],
  )

describe('report kind grants', () => {
  it('names a grant for every report kind in catalog order', () => {
    expect(Object.keys(reportKindGrants)).toEqual([...reportKinds])
  })

  it('offers each role the kinds it was offered before the table, for every subset of the grants', () => {
    expect(subsets).toHaveLength(128)
    for (const role of Object.keys(rolePermissions))
      for (const granted of subsets)
        expect(grantedReportKinds(role, granted), `${role} ${granted}`).toEqual(
          reference(role, granted),
        )
  })

  it.each([
    [
      'SYSTEM_ADMINISTRATOR',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    [
      'PROGRAM_MANAGER',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    [
      'GRANT_MANAGER',
      [
        'PROJECT_SUMMARY',
        'INDICATOR_SUMMARY',
        'SURVEY_FORM_RESULTS',
        'MONITORING_REPORT',
        'EVALUATION_REPORT',
      ],
    ],
    ['PROJECT_MANAGER', [...reportKinds]],
    ['MONITORING_AND_EVALUATION_OFFICER', [...reportKinds]],
    ['PROJECT_OFFICER', ['PROJECT_SUMMARY', 'INDICATOR_SUMMARY']],
  ])('offers %s every kind it holds the grants for', (role, kinds) => {
    const granted = rolePermissions[role as keyof typeof rolePermissions]
    expect(grantedReportKinds(role, granted)).toEqual(kinds)
  })

  it('offers nothing to an unknown role or to a role without grants', () => {
    expect(grantedReportKinds('UNKNOWN_ROLE', relevant)).toEqual([])
    expect(grantedReportKinds('PROJECT_MANAGER', [])).toEqual([])
  })
})
```

The api test freezes the rules of `reports.helpers.ts` as they are written now and compares both helpers with them for every role and every one of the 256 subsets of the eight relevant grants, six kinds each: `readableReportKinds` must list the same kinds and `assertReportPermission` must throw the same `ForbiddenException` in exactly the same cases. A third test pins the beneficiary asymmetry:

Create `apps/api/src/modules/reports/reports.helpers.test.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'
import {
  type ReportKindCode,
  hasAtomicPermission,
  reportKinds,
  rolePermissions,
} from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { assertReportPermission, readableReportKinds } from './reports.helpers'

// The rules of the report kind helpers as they were written before the shared grant table.
const kindPermission = {
  PROJECT_SUMMARY: 'reports.project.read',
  INDICATOR_SUMMARY: 'reports.indicator.read',
  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',
  SURVEY_FORM_RESULTS: 'reports.project.read',
  MONITORING_REPORT: 'reports.indicator.read',
  EVALUATION_REPORT: 'reports.project.read',
} as const
const extraKindRequires = {
  MONITORING_REPORT: 'monitoring.read',
  EVALUATION_REPORT: 'monitoring.read',
}
const isExtraReportKind = (kind: string): kind is keyof typeof extraKindRequires =>
  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'
const actorOf = (role: string, permissions: string[]) =>
  ({ roles: [role], permissions }) as unknown as ApplicationIdentity
const allowedBefore = (role: string, granted: string[], kind: ReportKindCode) => {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return (
    has('reports.read') &&
    has(kindPermission[kind]) &&
    !(isExtraReportKind(kind) && !has(extraKindRequires[kind])) &&
    !(kind === 'SURVEY_FORM_RESULTS' && !has('assessments.read'))
  )
}
const listedBefore = (role: string, granted: string[]) => {
  const has = (permission: string) => hasAtomicPermission(role, granted, permission)
  return (Object.keys(kindPermission) as ReportKindCode[]).filter(
    (kind) =>
      has(kindPermission[kind]) &&
      (kind !== 'BENEFICIARY_SUMMARY' ||
        (has('analytics.saddd.read') && has('beneficiaries.aggregates.read'))) &&
      (!isExtraReportKind(kind) || has(extraKindRequires[kind])) &&
      (kind !== 'SURVEY_FORM_RESULTS' || has('assessments.read')),
  )
}
const relevant = [
  'reports.read',
  'reports.project.read',
  'reports.indicator.read',
  'reports.beneficiary.read',
  'analytics.saddd.read',
  'beneficiaries.aggregates.read',
  'monitoring.read',
  'assessments.read',
]
const subsets = relevant
  .map((_, index) => index)
  .reduce<string[][]>(
    (all, index) => all.concat(all.map((subset) => [...subset, relevant[index] as string])),
    [[]],
  )
const roles = Object.keys(rolePermissions)

describe('report kind helpers', () => {
  it('lists the kinds each role could list before the shared table, for every subset of the grants', () => {
    expect(subsets).toHaveLength(256)
    for (const role of roles)
      for (const granted of subsets)
        expect(readableReportKinds(actorOf(role, granted)), `${role} ${granted}`).toEqual(
          listedBefore(role, granted),
        )
  })

  it('refuses a kind exactly where it was refused before the shared table, for every subset of the grants', () => {
    for (const role of roles)
      for (const granted of subsets)
        for (const kind of reportKinds) {
          const run = () => assertReportPermission(actorOf(role, granted), kind)
          if (allowedBefore(role, granted, kind))
            expect(run, `${role} ${kind} ${granted}`).not.toThrow()
          else
            expect(run, `${role} ${kind} ${granted}`).toThrow(
              new ForbiddenException('Current report permission required.'),
            )
        }
  })

  it('leaves the beneficiary aggregate grants to the beneficiary summary source and its own refusal', () => {
    const granted = ['reports.read', 'reports.beneficiary.read']
    expect(() =>
      assertReportPermission(actorOf('PROJECT_MANAGER', granted), 'BENEFICIARY_SUMMARY'),
    ).not.toThrow()
    expect(readableReportKinds(actorOf('PROJECT_MANAGER', granted))).toEqual([])
  })
})
```

`.tmp/s6c/task3-service-test.json` adds the one row that no test pinned for the export path: a stored report whose type no route lists (`OTHER`) is refused as unavailable before any source is read. The guard is `Object.hasOwn(kindPermission, row.type)` in the old code and `Object.hasOwn(reportKindGrants, row.type)` after the swap, and the row passes against both and fails without the guard:

Create `.tmp/s6c/task3-service-test.json`:

```json
[
  [
    "apps/api/src/modules/reports/reports.service.test.ts",
    "  it('returns sections with a flattened copy and sends them to the designed renderer', async () => {\n",
    "  it('refuses to export a report of a stored type that no route lists', async () => {\n    tx.$queryRaw.mockResolvedValue([\n      {\n        id,\n        projectId,\n        formId: null,\n        type: 'OTHER',\n        sourceFingerprint: 'a'.repeat(64),\n        status: 'GENERATED',\n      },\n    ])\n    await expect(service.export(actor, projectId, id)).rejects.toThrow('Report unavailable')\n    expect(state.read).not.toHaveBeenCalled()\n  })\n  it('returns sections with a flattened copy and sends them to the designed renderer', async () => {\n",
    1
  ]
]
```

`.tmp/s6c/task3-index.json` exports the table from the barrel and `.tmp/s6c/task3-web-parity.json` appends the web parity (the same 128 subsets against the menu rule the component wrote before, and the one-role rule) to the workspace test:

Create `.tmp/s6c/task3-index.json`:

```json
[
  [
    "packages/shared/src/index.ts",
    "export * from './rbac/route-policy'\n",
    "export * from './rbac/route-policy'\nexport * from './rbac/report-kind-grants'\n",
    1
  ]
]
```

Create `.tmp/s6c/task3-web-parity.json`:

```json
[
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "import { sampleProjectReport } from '../print/print-report-sample'\n",
    "import { principalHasAtomicPermission } from '@/lib/rbac/policy'\nimport { type AtomicPermission, type ReportKindCode, rolePermissions } from '@pathways/shared'\nimport { sampleProjectReport } from '../print/print-report-sample'\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    expect(screen.getByText('Round: Midterm (2026-01-01 to 2026-06-30)')).toBeTruthy()\n    state.savedEvaluation = null\n  })\n})\n",
    "    expect(screen.getByText('Round: Midterm (2026-01-01 to 2026-06-30)')).toBeTruthy()\n    state.savedEvaluation = null\n  })\n})\n\ndescribe('report kind menu before the shared table', () => {\n  // The menu rule as the component wrote it before the shared grant table.\n  const table: Record<ReportKindCode, { permission: AtomicPermission; requires?: AtomicPermission[] }> =\n    {\n      PROJECT_SUMMARY: { permission: 'reports.project.read' },\n      INDICATOR_SUMMARY: { permission: 'reports.indicator.read' },\n      BENEFICIARY_SUMMARY: {\n        permission: 'reports.beneficiary.read',\n        requires: ['analytics.saddd.read', 'beneficiaries.aggregates.read'],\n      },\n      SURVEY_FORM_RESULTS: { permission: 'reports.project.read' },\n      MONITORING_REPORT: { permission: 'reports.indicator.read', requires: ['monitoring.read'] },\n      EVALUATION_REPORT: { permission: 'reports.project.read', requires: ['monitoring.read'] },\n    }\n  type Principal = Parameters<typeof allowedKinds>[0]\n  const listedBefore = (principal: Principal) =>\n    (Object.keys(table) as ReportKindCode[]).filter(\n      (kind) =>\n        principalHasAtomicPermission(principal, table[kind].permission) &&\n        (table[kind].requires ?? []).every((grant) =>\n          principalHasAtomicPermission(principal, grant),\n        ) &&\n        (kind !== 'SURVEY_FORM_RESULTS' ||\n          principalHasAtomicPermission(principal, 'assessments.read')),\n    )\n  const relevant: AtomicPermission[] = [\n    'reports.project.read',\n    'reports.indicator.read',\n    'reports.beneficiary.read',\n    'analytics.saddd.read',\n    'beneficiaries.aggregates.read',\n    'monitoring.read',\n    'assessments.read',\n  ]\n  const subsets = relevant\n    .map((_, index) => index)\n    .reduce<AtomicPermission[][]>(\n      (all, index) => all.concat(all.map((subset) => [...subset, relevant[index] as AtomicPermission])),\n      [[]],\n    )\n  const principalOf = (roles: string[], permissions: string[]) =>\n    ({ userId: 'u', organizationId: 'org', roles, permissions, assignedProjectIds: [] }) as Principal\n\n  it('offers every role the kinds it was offered before, for every subset of the grants', () => {\n    expect(subsets).toHaveLength(128)\n    for (const role of Object.keys(rolePermissions))\n      for (const granted of subsets) {\n        const principal = principalOf([role], granted)\n        expect(allowedKinds(principal), `${role} ${granted}`).toEqual(listedBefore(principal))\n      }\n  })\n\n  it('offers nothing without a profile or with other than exactly one role', () => {\n    expect(allowedKinds(null)).toEqual([])\n    expect(allowedKinds(undefined)).toEqual([])\n    expect(allowedKinds(principalOf([], relevant))).toEqual([])\n    expect(allowedKinds(principalOf(['PROJECT_MANAGER', 'PROJECT_OFFICER'], relevant))).toEqual([])\n  })\n})\n",
    1
  ]
]
```

```bash
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task3-index.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task3-web-parity.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task3-service-test.json
pnpm exec biome check --write packages/shared/src apps/api/src/modules/reports apps/web/src/features/reports 2>&1 | tail -2
pnpm --filter @pathways/shared exec tsc -p tsconfig.json --noEmit && echo "shared typecheck clean"
pnpm --filter @pathways/shared build > /dev/null 2>&1
(cd packages/shared && pnpm exec vitest run src/rbac/report-kind-grants.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
(cd apps/api && pnpm exec vitest run src/modules/reports/reports.helpers.test.ts src/modules/reports/reports.service.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
(cd apps/web && pnpm exec vitest run src/features/reports/components/live-reporting-workspace.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
node -e "
const s = require('./packages/shared/dist/index.js')
for (const role of Object.keys(s.rolePermissions)) console.log(role, JSON.stringify(s.grantedReportKinds(role, s.rolePermissions[role])))
"
```

Expected: one replacement, two replacements and one replacement, Biome has nothing to fix, the shared package typechecks, the shared test runs 9 tests, the two api tests 42 (the 3 of the helper test and the 39 of the service test, one of them the new export row) and the web workspace test 26 (the 24 it ran before plus the two new rows; the api and web tests still run the old helpers), and the list of kinds each role is offered by its own grants is:

```
1 replacements in 1 files
2 replacements in 1 files
1 replacements in 1 files
Checked 134 files in <ms>. Fixed 1 file.
shared typecheck clean
 Test Files  1 passed (1)
      Tests  9 passed (9)
 Test Files  2 passed (2)
      Tests  42 passed (42)
 Test Files  1 passed (1)
      Tests  26 passed (26)
SYSTEM_ADMINISTRATOR ["PROJECT_SUMMARY","INDICATOR_SUMMARY","SURVEY_FORM_RESULTS","MONITORING_REPORT","EVALUATION_REPORT"]
PROJECT_OFFICER ["PROJECT_SUMMARY","INDICATOR_SUMMARY"]
MONITORING_AND_EVALUATION_OFFICER ["PROJECT_SUMMARY","INDICATOR_SUMMARY","BENEFICIARY_SUMMARY","SURVEY_FORM_RESULTS","MONITORING_REPORT","EVALUATION_REPORT"]
PROJECT_MANAGER ["PROJECT_SUMMARY","INDICATOR_SUMMARY","BENEFICIARY_SUMMARY","SURVEY_FORM_RESULTS","MONITORING_REPORT","EVALUATION_REPORT"]
PROGRAM_MANAGER ["PROJECT_SUMMARY","INDICATOR_SUMMARY","SURVEY_FORM_RESULTS","MONITORING_REPORT","EVALUATION_REPORT"]
GRANT_MANAGER ["PROJECT_SUMMARY","INDICATOR_SUMMARY","SURVEY_FORM_RESULTS","MONITORING_REPORT","EVALUATION_REPORT"]
```

The api and web tests pass against the unchanged helpers, which is what makes them parity tests: the table and the old code agree for every role and every subset. The last six lines are the per-role result and equal the literal table the shared test pins.

```bash
pnpm lint 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add packages/shared apps
git commit -m "refactor: add the shared report kind grants with parity tests over every role

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -8
```

Expected: lint is clean and the commit holds 5 files:

```
Checked 1451 files in <ms>. No fixes applied.
[<branch> <sha>] refactor: add the shared report kind grants with parity tests over every role
 6 files changed, 320 insertions(+)
 create mode 100644 apps/api/src/modules/reports/reports.helpers.test.ts
 create mode 100644 packages/shared/src/rbac/report-kind-grants.test.ts
 create mode 100644 packages/shared/src/rbac/report-kind-grants.ts
 .../src/modules/reports/reports.helpers.test.ts    |  98 +++++++++++++++++++
 .../src/modules/reports/reports.service.test.ts    |  14 +++
 .../components/live-reporting-workspace.test.tsx   |  71 ++++++++++++++
 packages/shared/src/index.ts                       |   1 +
 .../shared/src/rbac/report-kind-grants.test.ts     | 107 +++++++++++++++++++++
 packages/shared/src/rbac/report-kind-grants.ts     |  29 ++++++
 6 files changed, 320 insertions(+)
```

- [ ] **Step 2: Read the table in the api and the web**

`.tmp/s6c/task3-api-swap.json` holds 6 replacements in two api files: `reports.helpers.ts` loses `kindPermission`, `isExtraReportKind` and `extraKindRequires` (they are exported only for this file and `reports.service.ts`), `assertReportPermission` reads `reportKindGrants` and exempts the beneficiary summary from the extra grants, `readableReportKinds` becomes `grantedReportKinds`, and `reports.service.ts` checks the stored type with `Object.hasOwn(reportKindGrants, row.type)`:

Create `.tmp/s6c/task3-api-swap.json`:

```json
[
  [
    "apps/api/src/modules/reports/reports.helpers.ts",
    "import { type ReportKindCode, hasAtomicPermission } from '@pathways/shared'\n",
    "import {\n  type ReportKindCode,\n  grantedReportKinds,\n  hasAtomicPermission,\n  reportKindGrants,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.helpers.ts",
    "export const kindPermission = {\n  PROJECT_SUMMARY: 'reports.project.read',\n  INDICATOR_SUMMARY: 'reports.indicator.read',\n  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',\n  SURVEY_FORM_RESULTS: 'reports.project.read',\n  MONITORING_REPORT: 'reports.indicator.read',\n  EVALUATION_REPORT: 'reports.project.read',\n} as const\n\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.helpers.ts",
    "// Refuses a report kind the actor may not read, including the extra grants some kinds need.\nexport function assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode) {\n  if (\n    !hasAtomicPermission(actor.roles[0], actor.permissions, 'reports.read') ||\n    !hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) ||\n    (isExtraReportKind(kind) &&\n      !hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) ||\n    (kind === 'SURVEY_FORM_RESULTS' &&\n      !hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read'))\n  )\n    throw new ForbiddenException('Current report permission required.')\n}\n\n// Report kinds the actor may list, with the extra grants the beneficiary summary needs.\nexport function readableReportKinds(actor: ApplicationIdentity) {\n  const allowed = (Object.keys(kindPermission) as ReportKindCode[]).filter(\n    (kind) =>\n      hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) &&\n      (kind !== 'BENEFICIARY_SUMMARY' ||\n        (hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.saddd.read') &&\n          hasAtomicPermission(\n            actor.roles[0],\n            actor.permissions,\n            'beneficiaries.aggregates.read',\n          ))) &&\n      (!isExtraReportKind(kind) ||\n        hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) &&\n      (kind !== 'SURVEY_FORM_RESULTS' ||\n        hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read')),\n  )\n  return allowed\n}\n\ntype ExtraReportKind = 'MONITORING_REPORT' | 'EVALUATION_REPORT'\nexport const isExtraReportKind = (kind: string): kind is ExtraReportKind =>\n  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'\n// Both extra kinds read monitoring data, so they also need monitoring.read on top of the kind grant.\nexport const extraKindRequires = {\n  MONITORING_REPORT: 'monitoring.read',\n  EVALUATION_REPORT: 'monitoring.read',\n} as const\n",
    "// Refuses a report kind the actor may not read, including the extra grants some kinds need.\nexport function assertReportPermission(actor: ApplicationIdentity, kind: ReportKindCode) {\n  const { permission, requires } = reportKindGrants[kind]\n  const has = (grant: string) => hasAtomicPermission(actor.roles[0], actor.permissions, grant)\n  // The beneficiary aggregate grants are refused by the report source with its own message.\n  if (\n    !has('reports.read') ||\n    !has(permission) ||\n    (kind !== 'BENEFICIARY_SUMMARY' && !requires.every(has))\n  )\n    throw new ForbiddenException('Current report permission required.')\n}\n\n// Report kinds the actor may list, with the extra grants the beneficiary summary needs.\nexport const readableReportKinds = (actor: ApplicationIdentity) =>\n  grantedReportKinds(actor.roles[0], actor.permissions)\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "import {\n  assertReportPermission,\n  kindPermission,\n  readableReportKinds,\n  uuid,\n} from './reports.helpers'\n",
    "import { assertReportPermission, readableReportKinds, uuid } from './reports.helpers'\n",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "  hasAtomicPermission,\n  reportPreviewQuery,\n} from '@pathways/shared'",
    "  hasAtomicPermission,\n  reportKindGrants,\n  reportPreviewQuery,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/reports/reports.service.ts",
    "Object.hasOwn(kindPermission, row.type)",
    "Object.hasOwn(reportKindGrants, row.type)",
    1
  ]
]
```

`.tmp/s6c/task3-web-swap.json` holds 8 replacements in the workspace and its test: the local `kinds` table keeps only the labels (renamed `reportKindLabels`, typed `Record<ReportKindCode, string>`), `allowedKinds` returns `grantedReportKinds(role, permissions)` for a principal with exactly one role and nothing otherwise, and the permission arguments of the evaluation-round read and of the preview read come from `reportKindGrants`:

Create `.tmp/s6c/task3-web-swap.json`:

```json
[
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "import type { ReportKindCode } from '@pathways/shared'\n",
    "import { type ReportKindCode, grantedReportKinds, reportKindGrants } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "type AtomicPermission = Parameters<typeof principalHasAtomicPermission>[1]\ntype KindDefinition = { label: string; permission: AtomicPermission; requires?: AtomicPermission[] }\nexport const kinds: Record<ReportKindCode, KindDefinition> = {\n  PROJECT_SUMMARY: { label: 'Project summary', permission: 'reports.project.read' },\n  INDICATOR_SUMMARY: { label: 'Indicator summary', permission: 'reports.indicator.read' },\n  BENEFICIARY_SUMMARY: {\n    label: 'Beneficiary summary',\n    permission: 'reports.beneficiary.read',\n    requires: ['analytics.saddd.read', 'beneficiaries.aggregates.read'],\n  },\n  SURVEY_FORM_RESULTS: { label: 'Survey results', permission: 'reports.project.read' },\n  MONITORING_REPORT: {\n    label: 'Monitoring report',\n    permission: 'reports.indicator.read',\n    requires: ['monitoring.read'],\n  },\n  EVALUATION_REPORT: {\n    label: 'Evaluation report',\n    permission: 'reports.project.read',\n    requires: ['monitoring.read'],\n  },\n}\n\n/** Kinds the principal may open: the kind grant plus any extra grant the API also requires. */\nexport const allowedKinds = (profile: Principal) =>\n  (Object.keys(kinds) as ReportKindCode[]).filter(\n    (kind) =>\n      principalHasAtomicPermission(profile, kinds[kind].permission) &&\n      (kinds[kind].requires ?? []).every((grant) => principalHasAtomicPermission(profile, grant)) &&\n      (kind !== 'SURVEY_FORM_RESULTS' || principalHasAtomicPermission(profile, 'assessments.read')),\n  )\n",
    "export const reportKindLabels: Record<ReportKindCode, string> = {\n  PROJECT_SUMMARY: 'Project summary',\n  INDICATOR_SUMMARY: 'Indicator summary',\n  BENEFICIARY_SUMMARY: 'Beneficiary summary',\n  SURVEY_FORM_RESULTS: 'Survey results',\n  MONITORING_REPORT: 'Monitoring report',\n  EVALUATION_REPORT: 'Evaluation report',\n}\n\n/** Kinds the principal may open: the shared grants, for a principal with exactly one role. */\nexport const allowedKinds = (profile: Principal): ReportKindCode[] =>\n  profile?.roles.length === 1 ? grantedReportKinds(profile.roles[0], profile.permissions) : []\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "kinds.EVALUATION_REPORT.permission",
    "reportKindGrants.EVALUATION_REPORT.permission",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "    kinds[kind].permission,",
    "    reportKindGrants[kind].permission,",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "kinds[kind].label",
    "reportKindLabels[kind]",
    2
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "kinds[value].label",
    "reportKindLabels[value]",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "import { LiveReportingWorkspace, allowedKinds, kinds } from './live-reporting-workspace'",
    "import { LiveReportingWorkspace, allowedKinds, reportKindLabels } from './live-reporting-workspace'",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    expect(kinds.MONITORING_REPORT.label).toBe('Monitoring report')\n    expect(kinds.EVALUATION_REPORT.label).toBe('Evaluation report')\n",
    "    expect(reportKindLabels.MONITORING_REPORT).toBe('Monitoring report')\n    expect(reportKindLabels.EVALUATION_REPORT).toBe('Evaluation report')\n",
    1
  ]
]
```

```bash
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task3-api-swap.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task3-web-swap.json
FILES=$(git diff --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$")
node .tmp/s6c/trim-imports.mjs $FILES | grep -v "removed nothing"
pnpm exec biome check --write $FILES 2>&1 | tail -2
pnpm --filter @pathways/api exec tsc --noEmit && echo "api typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
git checkout -- apps/web/next-env.d.ts
git diff --stat | cat
```

Expected: 6 and 8 replacements, no import left unused, Biome has nothing to fix, both apps typecheck and `--noUnusedLocals` lists only the two baseline lines:

```
6 replacements in 2 files
8 replacements in 2 files
Checked 4 files in <ms>. No fixes applied.
api typecheck clean
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
 apps/api/src/modules/reports/reports.helpers.ts    | 57 ++++++----------------
 apps/api/src/modules/reports/reports.service.ts    | 10 ++--
 .../components/live-reporting-workspace.test.tsx   |  6 +--
 .../components/live-reporting-workspace.tsx        | 51 ++++++-------------
 4 files changed, 36 insertions(+), 88 deletions(-)
```

```bash
(cd apps/api && pnpm exec vitest run src/modules/reports src/modules/finance src/modules/evaluations 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
(cd apps/web && pnpm exec vitest run src/features/reports 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL ")
F=packages/shared/src/rbac/report-kind-grants.ts
cp $F .tmp/s6c/files/grants.bak
sed -i "s/MONITORING_REPORT: { permission: 'reports.indicator.read', requires: \['monitoring.read'\] }/MONITORING_REPORT: { permission: 'reports.indicator.read', requires: [] }/" $F
cmp -s $F .tmp/s6c/files/grants.bak && echo "NO CHANGE"
pnpm --filter @pathways/shared build > /dev/null 2>&1
(cd packages/shared && pnpm exec vitest run src/rbac/report-kind-grants.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+")
(cd apps/api && pnpm exec vitest run src/modules/reports/reports.helpers.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+")
(cd apps/web && pnpm exec vitest run src/features/reports/components/live-reporting-workspace.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+")
cp .tmp/s6c/files/grants.bak $F
pnpm --filter @pathways/shared build > /dev/null 2>&1
git status --short | wc -l
```

Expected: the api module suites and the web reports suite pass with the swapped code, and the one-grant mutation of the table (the monitoring report no longer requires `monitoring.read`) fails two rows in each of the shared test, the api helper test and the web workspace test, and is restored:

```
 Test Files  21 passed | 2 skipped (23)
      Tests  289 passed | 10 skipped (299)
 Test Files  6 passed (6)
      Tests  50 passed (50)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 7 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 1 passed (3)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 24 passed (26)
4
```

- [ ] **Step 3: Commit**

```bash
pnpm lint 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add -A apps
git commit -m "refactor: read the report kind rules from the shared grant table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -8
```

Expected: lint is clean and the commit holds 4 files:

```
Checked 1451 files in <ms>. No fixes applied.
[<branch> <sha>] refactor: read the report kind rules from the shared grant table
 4 files changed, 36 insertions(+), 88 deletions(-)
 apps/api/src/modules/reports/reports.helpers.ts    | 57 ++++++----------------
 apps/api/src/modules/reports/reports.service.ts    | 10 ++--
 .../components/live-reporting-workspace.test.tsx   |  6 +--
 .../components/live-reporting-workspace.tsx        | 51 ++++++-------------
 4 files changed, 36 insertions(+), 88 deletions(-)
```


---

### Task 4: Split the live reporting workspace and its test

**Files:**
- Create: `apps/web/src/features/reports/reports.copy.ts` and `reports.copy.test.ts`; `hooks/use-report-context.ts`, `hooks/use-report-generation.ts`; `components/survey-form-select.tsx`, `round-select.tsx`, `report-context-card.tsx`, `report-preview-card.tsx`, `saved-reports-card.tsx`
- Modify: `apps/web/src/features/reports/reports.utils.ts` and `reports.utils.test.ts`; `components/live-reporting-workspace.tsx` (542 lines to 33) and its test (509 lines to 28 tests in one file)
- Create (gitignored): `.tmp/s6c/task4-cut.json`, `task4-edits.json`, `task4-tests-cut.json`, `task4-chars.json`, `task4-split.json`, `before/`, `before-split/`

`live-reporting-workspace.tsx` holds the kind labels, the menu rule, a date formatter, the state and reads of one screen, the generate and download handlers and four cards of markup. Nothing is rewritten by hand: `cut.mjs` builds each new file from line ranges of the old file plus a few literal wrapper lines, after checking the old file's hash, and `same-lines.mjs` proves that every non-blank line of the old file now sits in a new file (`lost 0`) and lists the lines the split added (signatures, prop types, destructurings, calls). The public surface does not change: `LiveReportingWorkspace` stays at its path with its props, and `features/reports/index.ts` is untouched.

- [ ] **Step 1: Record the starting point**

```bash
R=apps/web/src/features/reports
cp $R/components/live-reporting-workspace.tsx $R/components/live-reporting-workspace.test.tsx $R/reports.utils.ts $R/reports.utils.test.ts .tmp/s6c/before/
node .tmp/s6c/count-it.mjs $R/components/live-reporting-workspace.test.tsx $R/reports.utils.test.ts
node .tmp/s6c/test-titles.mjs save .tmp/s6c/titles-reports-before.json $R/components/live-reporting-workspace.test.tsx $R/reports.utils.test.ts $R/components/reporting-page.test.tsx
git hash-object $R/components/live-reporting-workspace.tsx $R/components/live-reporting-workspace.test.tsx $R/reports.utils.ts $R/reports.utils.test.ts | cut -c1-8
```

Expected: the row, group and `expect(` counts of the two test files, the saved title list (three files, 30 tests) and the four hash prefixes the cut plans below are pinned to (`cut.mjs` stops on any other hash, which means a file changed since planning: stop and report NEEDS_CONTEXT):

```
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx: it 23, describe 5, expect 74
apps/web/src/features/reports/reports.utils.test.ts: it 1, describe 1, expect 1
total: it 24, describe 6, expect 75
files 3, tests 30, failed 0
d913e876
33b2a2b0
a7ff887d
ebb1a90a
```

- [ ] **Step 2: Move the labels and the menu rule, and their tests**

`reportKindLabels` (the display names) moves to `reports.copy.ts`, and `allowedKinds` (the menu rule, now one call to the shared table) with its `Principal` type to `reports.utils.ts`, beside `reportFileName`. Four of the five test groups of the workspace test never render the screen: the label row, `report kinds requiring monitoring.read` (2 tests), `beneficiary summary kind` (3) and the parity group of Task 3 (2) call `allowedKinds` or read `reportKindLabels` directly, so they move to `reports.copy.test.ts` and `reports.utils.test.ts` unchanged (the label row gets a `describe` wrapper). The render tests stay.

`.tmp/s6c/task4-cut.json` is the cut plan for the three production files (`reports.utils.ts` keeps its old lines through the `{ file, from }` item):

Create `.tmp/s6c/task4-cut.json`:

```json
{
 "source": "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
 "hash": "d913e876",
 "files": {
  "apps/web/src/features/reports/reports.copy.ts": [
   "import type { ReportKindCode } from '@pathways/shared'",
   "",
   [31, 38]
  ],
  "apps/web/src/features/reports/reports.utils.ts": [
   "import { principalHasAtomicPermission } from '@/lib/rbac/policy'",
   "import { type ReportKindCode, grantedReportKinds } from '@pathways/shared'",
   "",
   { "file": "apps/web/src/features/reports/reports.utils.ts", "from": 1 },
   "",
   [30, 30],
   "",
   [40, 42]
  ],
  "apps/web/src/features/reports/components/live-reporting-workspace.tsx": [
   "'use client'",
   "@imports",
   "import { reportKindLabels } from '../reports.copy'",
   "",
   [44, 523]
  ]
 }
}
```

`.tmp/s6c/task4-tests-cut.json` is the cut plan for the three test files (the workspace test keeps its imports, its preamble of 346 lines and its two render groups):

Create `.tmp/s6c/task4-tests-cut.json`:

```json
{
 "source": "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
 "hash": "33b2a2b0",
 "files": {
  "apps/web/src/features/reports/reports.copy.test.ts": [
   "import { describe, expect, it } from 'vitest'",
   "import { reportKindLabels } from './reports.copy'",
   "",
   "describe('report kind labels', () => {",
   [357, 360],
   "})"
  ],
  "apps/web/src/features/reports/reports.utils.test.ts": [
   "import { principalHasAtomicPermission } from '@/lib/rbac/policy'",
   "import { type AtomicPermission, type ReportKindCode, rolePermissions } from '@pathways/shared'",
   "import { describe, expect, it } from 'vitest'",
   "import { allowedKinds, reportFileName } from './reports.utils'",
   { "file": "apps/web/src/features/reports/reports.utils.test.ts", "from": 3 },
   "",
   [363, 418],
   "",
   [513, 580]
  ],
  "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx": [
   "@imports",
   "",
   [10, 355],
   "})",
   "",
   [420, 511]
  ]
 }
}
```

`.tmp/s6c/task4-edits.json` makes the workspace import `allowedKinds` from the utils:

Create `.tmp/s6c/task4-edits.json`:

```json
[
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
    "import { reportFileName } from '../reports.utils'",
    "import { allowedKinds, reportFileName } from '../reports.utils'",
    1
  ]
]
```

```bash
R=apps/web/src/features/reports
node .tmp/s6c/cut.mjs .tmp/s6c/task4-cut.json
node .tmp/s6c/cut.mjs .tmp/s6c/task4-tests-cut.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task4-edits.json
node .tmp/s6c/trim-imports.mjs $R/components/live-reporting-workspace.tsx $R/components/live-reporting-workspace.test.tsx $R/reports.utils.ts $R/reports.utils.test.ts $R/reports.copy.ts $R/reports.copy.test.ts | grep -v "removed nothing"
git add -N $R
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR -- $R) 2>&1 | tail -2
B=.tmp/s6c/before
node .tmp/s6c/same-lines.mjs $B/live-reporting-workspace.tsx --also $B/reports.utils.ts $R/components/live-reporting-workspace.tsx $R/reports.utils.ts $R/reports.copy.ts --list
node .tmp/s6c/same-lines.mjs $B/live-reporting-workspace.test.tsx --also $B/reports.utils.test.ts $R/components/live-reporting-workspace.test.tsx $R/reports.utils.test.ts $R/reports.copy.test.ts --list
node .tmp/s6c/count-it.mjs $R/components/live-reporting-workspace.test.tsx $R/reports.utils.test.ts $R/reports.copy.test.ts
```

Expected: the six files are built, the unused imports go, Biome formats the files it had to, the production proof prints `lost 0` with nothing added, the test proof prints `lost 0` with exactly the two lines of the new `describe` wrapper added, and the counts equal the starting counts (24 rows, 75 `expect(` calls) plus the one new `describe`:

```
apps/web/src/features/reports/reports.copy.ts: 10 lines
apps/web/src/features/reports/reports.utils.ts: 18 lines
apps/web/src/features/reports/components/live-reporting-workspace.tsx: 510 lines
apps/web/src/features/reports/reports.copy.test.ts: 9 lines
apps/web/src/features/reports/reports.utils.test.ts: 139 lines
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx: 449 lines
1 replacements in 1 files
apps/web/src/features/reports/components/live-reporting-workspace.tsx: removed grantedReportKinds
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx: removed principalHasAtomicPermission, AtomicPermission, ReportKindCode, rolePermissions, allowedKinds, reportKindLabels
Checked 6 files in <ms>. Fixed 2 files.

original lines 501, lost 0, added 0
1x })
1x describe('report kind labels', () => {
original lines 563, lost 0, added 2
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx: it 15, describe 2, expect 59
apps/web/src/features/reports/reports.utils.test.ts: it 8, describe 4, expect 14
apps/web/src/features/reports/reports.copy.test.ts: it 1, describe 1, expect 2
total: it 24, describe 7, expect 75
```

`same-lines` counts lines, so a moved line that Biome reflows would show as lost; none did. The workspace test went from 580 to 447 lines.

```bash
R=apps/web/src/features/reports
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
node .tmp/s6c/test-titles.mjs save .tmp/s6c/titles-reports-after.json $R/components/live-reporting-workspace.test.tsx $R/reports.utils.test.ts $R/reports.copy.test.ts $R/components/reporting-page.test.tsx
node .tmp/s6c/test-titles.mjs compare .tmp/s6c/titles-reports-before.json .tmp/s6c/titles-reports-after.json --list-added
cp $R/reports.utils.ts .tmp/s6c/files/utils.bak
cp $R/reports.copy.ts .tmp/s6c/files/copy.bak
sed -i 's/profile?.roles.length === 1/profile?.roles.length >= 1/' $R/reports.utils.ts
sed -i "s/EVALUATION_REPORT: 'Evaluation report'/EVALUATION_REPORT: 'Evaluation'/" $R/reports.copy.ts
pnpm --filter @pathways/web exec vitest run src/features/reports/reports.utils.test.ts src/features/reports/reports.copy.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Tests +[0-9]"
cp .tmp/s6c/files/utils.bak $R/reports.utils.ts
cp .tmp/s6c/files/copy.bak $R/reports.copy.ts
pnpm --filter @pathways/web exec vitest run src/features/reports 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
```

Expected: the typecheck is clean with only the two baseline `--noUnusedLocals` lines, the title comparison prints `lost 0` and no added title, the two mutations (the menu accepting a principal with several roles, a changed label) fail one test each, and the unmutated reports folder runs 7 files and 50 tests:

```
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
files 4, tests 30, failed 0
added:

before 30, after 30, lost 0, added 0
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/features/reports/reports.copy.test.ts > report kind labels > lists the monitoring and evaluation report kinds with their labels
 FAIL  src/features/reports/reports.utils.test.ts > report kind menu before the shared table > offers nothing without a profile or with other than exactly one role
      Tests  2 failed | 8 passed (10)
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/features/reports/reports.utils.test.ts src/features/reports/reports.copy.test.ts
 Test Files  7 passed (7)
      Tests  50 passed (50)
```

```bash
pnpm exec biome check apps/web/src/features/reports 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): move the report kind labels and menu rule out of the workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -8
git hash-object apps/web/src/features/reports/components/live-reporting-workspace.tsx apps/web/src/features/reports/components/live-reporting-workspace.test.tsx | cut -c1-8
```

Expected: Biome is clean, the commit holds 6 files (two created) and the two hash prefixes are the ones the next cut plan is pinned to:

```
Checked 17 files in <ms>. No fixes applied.
[<branch> <sha>] refactor(web): move the report kind labels and menu rule out of the workspace
 6 files changed, 161 insertions(+), 151 deletions(-)
 create mode 100644 apps/web/src/features/reports/reports.copy.test.ts
 create mode 100644 apps/web/src/features/reports/reports.copy.ts
 .../components/live-reporting-workspace.test.tsx   | 135 +--------------------
 .../components/live-reporting-workspace.tsx        |  19 +--
 apps/web/src/features/reports/reports.copy.test.ts |   9 ++
 apps/web/src/features/reports/reports.copy.ts      |  10 ++
 .../web/src/features/reports/reports.utils.test.ts | 130 +++++++++++++++++++-
 apps/web/src/features/reports/reports.utils.ts     |   9 ++
 6 files changed, 161 insertions(+), 151 deletions(-)
0d2ceb67
501dbb92
```

- [ ] **Step 3: Pin the generation and download messages and the read permissions before they move**

The existing tests render the whole screen, but no row reached four branches of the handlers that Step 4 moves: the fallback PDF warning, a conflict message for an evaluation report and for another kind, and the download status messages. `.tmp/s6c/task4-chars.json` adds the `warning` mock and four rows, three in the first group (fallback warning and announcement, a conflict for a project summary showing the server message, the download announcement and a blocked download) and one in the round group (a conflict for an evaluation report names the missing signed-off round). It also records the permission each `useAuthorizedRead` call is made under (the mock took `_permission` and ignored it, so a wrong grant passed every test) and adds a group of six rows, one per report kind, that check the permission of the preview read and of the three sibling reads: `reports.read` for the projects and the saved reports, `forms.read` for the survey forms and the round permission of the grant table. They run against the code as it stands:

Create `.tmp/s6c/task4-chars.json`:

```json
[
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "  success: vi.fn(),\n  error: vi.fn(),\n",
    "  success: vi.fn(),\n  warning: vi.fn(),\n  error: vi.fn(),\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    success: (...args: unknown[]) => state.success(...args),\n",
    "    success: (...args: unknown[]) => state.success(...args),\n    warning: (...args: unknown[]) => state.warning(...args),\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "  it('renders the status layout instead of the plain table when sections are present', () => {\n",
    "  it('warns and announces that a fallback PDF will not match the preview', async () => {\n    state.generate.mockResolvedValue({ id: 'report', status: 'GENERATED', pdfFallback: true })\n    render(<LiveReportingWorkspace initialKind=\"project-summary\" />)\n    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))\n    await waitFor(() => expect(state.warning).toHaveBeenCalledOnce())\n    expect(state.warning.mock.calls[0][0]).toMatch(/plain layout/)\n    expect(state.success).not.toHaveBeenCalled()\n    expect(state.refetch).toHaveBeenCalledOnce()\n    expect(screen.getByText(state.warning.mock.calls[0][0])).toBeTruthy()\n  })\n  it('shows the server message when generation is refused with a conflict', async () => {\n    state.generate.mockRejectedValue(Object.assign(Error('Report already exists'), { status: 409 }))\n    render(<LiveReportingWorkspace initialKind=\"project-summary\" />)\n    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))\n    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Report already exists'))\n    expect(screen.getByText('Report already exists')).toBeTruthy()\n  })\n  it('announces the download and reports a blocked download', async () => {\n    render(<LiveReportingWorkspace initialKind=\"project-summary\" />)\n    fireEvent.click(screen.getByRole('button', { name: 'Download' }))\n    expect(await screen.findByText('Report downloaded as PDF.')).toBeTruthy()\n    state.downloadArtifact.mockRejectedValue(Error('Download blocked'))\n    fireEvent.click(screen.getByRole('button', { name: 'Download' }))\n    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Download blocked'))\n    expect(screen.getByText('Download blocked')).toBeTruthy()\n  })\n  it('renders the status layout instead of the plain table when sections are present', () => {\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "  it('shows the round on a saved evaluation report', () => {\n",
    "  it('names the missing signed-off round when generation is refused with a conflict', async () => {\n    state.generate.mockRejectedValue(Object.assign(Error('Conflict'), { status: 409 }))\n    openEvaluation()\n    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))\n    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())\n    expect(state.error.mock.calls[0][0]).toMatch(/^No signed-off evaluation exists/)\n  })\n\n  it('shows the round on a saved evaluation report', () => {\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "  preview: vi.fn(),\n",
    "  preview: vi.fn(),\n  reads: [] as [string, unknown][],\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    _permission: unknown,\n",
    "    permission: unknown,\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    if (key.startsWith('report-preview')) void fetcher?.()\n",
    "    state.reads.push([key, permission])\n    if (key.startsWith('report-preview')) void fetcher?.()\n",
    1
  ],
  [
    "apps/web/src/features/reports/components/live-reporting-workspace.test.tsx",
    "    expect(screen.getByText('Round: Midterm (2026-01-01 to 2026-06-30)')).toBeTruthy()\n    state.savedEvaluation = null\n  })\n})\n",
    "    expect(screen.getByText('Round: Midterm (2026-01-01 to 2026-06-30)')).toBeTruthy()\n    state.savedEvaluation = null\n  })\n})\n\ndescribe('report read permissions', () => {\n  const grantOf = (key: string) =>\n    [...state.reads].reverse().find(([read]) => read.startsWith(key))?.[1]\n  beforeEach(() => {\n    vi.clearAllMocks()\n    state.native = true\n    state.reads = []\n    state.permissions = [\n      'reports.read',\n      'reports.project.read',\n      'reports.indicator.read',\n      'reports.beneficiary.read',\n      'analytics.saddd.read',\n      'beneficiaries.aggregates.read',\n      'monitoring.read',\n      'forms.read',\n      'assessments.read',\n    ]\n  })\n  afterEach(() => {\n    state.native = false\n    cleanup()\n  })\n\n  it.each([\n    ['Project summary', 'PROJECT_SUMMARY', 'reports.project.read'],\n    ['Indicator summary', 'INDICATOR_SUMMARY', 'reports.indicator.read'],\n    ['Beneficiary summary', 'BENEFICIARY_SUMMARY', 'reports.beneficiary.read'],\n    ['Survey results', 'SURVEY_FORM_RESULTS', 'reports.project.read'],\n    ['Monitoring report', 'MONITORING_REPORT', 'reports.indicator.read'],\n    ['Evaluation report', 'EVALUATION_REPORT', 'reports.project.read'],\n  ] as const)(\n    'reads the %s preview and its sibling resources under their own permissions',\n    (label, kind, permission) => {\n      render(<LiveReportingWorkspace initialKind=\"project-summary\" />)\n      const native = screen.getAllByRole('combobox')[1] as HTMLSelectElement\n      const value = Array.from(native.options).find((item) => item.text === label)?.value\n      fireEvent.change(native, { target: { value } })\n      expect(grantOf(`report-preview:${kind}:`)).toBe(permission)\n      expect(grantOf('report-projects')).toBe('reports.read')\n      expect(grantOf('report-survey-forms')).toBe('forms.read')\n      expect(grantOf('report-evaluation-rounds')).toBe('reports.project.read')\n      expect(grantOf('report-artifacts')).toBe('reports.read')\n    },\n  )\n})\n",
    1
  ]
]
```

```bash
R=apps/web/src/features/reports/components
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task4-chars.json
pnpm exec biome check --write $R/live-reporting-workspace.test.tsx 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/reports/components/live-reporting-workspace.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
git add -A apps/web
git commit -m "test(web): pin the report generation, conflict and download messages and the read permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object $R/live-reporting-workspace.tsx $R/live-reporting-workspace.test.tsx | cut -c1-8
```

Expected: 8 replacements, Biome clean, the workspace test passes with 28 tests (18 plus 4 plus 6) and the commit leaves the production file at the hash the split is pinned to:

```
8 replacements in 1 files
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  28 passed (28)
[<branch> <sha>] test(web): pin the report generation, conflict and download messages and the read permissions
 1 file changed, 86 insertions(+), 1 deletion(-)
0d2ceb67
f6195e90
```

- [ ] **Step 4: Split the workspace into hooks and cards**

The 510 line component becomes a 33 line screen, two hooks and five components, cut from the old file by line range. The hooks hold what the component computed: `useReportContext` the profile, the project, kind, survey and round selections, the five reads and the values derived from them (and the effect that clears the survey and round choice when the project changes), and `useReportGeneration` the two draft owners, the name, format, busy and status state, the owner reset effect and the two handlers. The cards keep their markup verbatim, take `{ context }` and `{ generation }` as `Pick` of the hook results (so a card that reads a value outside its `Pick` fails the typecheck) and destructure what they read, which is why every moved line stays the same line. `SurveyFormSelect` and `RoundSelect` keep their `kind === ... && (` lines inside a fragment instead of the parent wrapping them: Biome would join the wrapped form into one line and the proof would count three lost lines; the fragment renders the same DOM, because the condition decides what is rendered either way.

Effect order is the one thing the split changes: the effect that clears the survey and round choice (it only calls `setSelectedForm` and `setSelectedRound`) now runs in the first hook, before the two draft owners of the second hook and the effect that clears the name and busy state (it only calls `setName` and `setBusy`). The two effects share no state, the draft owners are read after both in the same render, and the owned retry tests below (identity change, generation change, parent denial) pin the name and busy reset.

`.tmp/s6c/task4-split.json` is the cut plan:

Create `.tmp/s6c/task4-split.json`:

```json
{
 "source": "apps/web/src/features/reports/components/live-reporting-workspace.tsx",
 "hash": "0d2ceb67",
 "files": {
  "apps/web/src/features/reports/hooks/use-report-context.ts": [
   "@imports",
   "",
   "export const useReportContext = (initialKind: ReportKind) => {",
   [42, 110],
   [141, 145],
   "  return {",
   "    profile,",
   "    kind,",
   "    allowed,",
   "    setKind,",
   "    projects,",
   "    currentProjects,",
   "    project,",
   "    id,",
   "    setSelection,",
   "    forms,",
   "    currentForms,",
   "    formId,",
   "    setSelectedForm,",
   "    rounds,",
   "    currentRounds,",
   "    round,",
   "    evaluationId,",
   "    setSelectedRound,",
   "    contextReady,",
   "    preview,",
   "    reports,",
   "    currentPreview,",
   "    currentReports,",
   "  }",
   "}",
   "",
   "export type ReportContext = ReturnType<typeof useReportContext>"
  ],
  "apps/web/src/features/reports/hooks/use-report-generation.ts": [
   "@imports",
   "import type { ReportContext } from './use-report-context'",
   "",
   "export const useReportGeneration = (",
   "  context: Pick<",
   "    ReportContext,",
   "    | 'profile'",
   "    | 'id'",
   "    | 'kind'",
   "    | 'formId'",
   "    | 'evaluationId'",
   "    | 'project'",
   "    | 'round'",
   "    | 'currentPreview'",
   "    | 'currentReports'",
   "    | 'reports'",
   "  >,",
   ") => {",
   "  const { profile, id, kind, formId, evaluationId, project, round, currentPreview, currentReports, reports } =",
   "    context",
   [111, 140],
   [146, 210],
   "  return { owner, currentName, setName, format, setFormat, busy, statusMessage, download, generate }",
   "}",
   "",
   "export type ReportGeneration = ReturnType<typeof useReportGeneration>"
  ],
  "apps/web/src/features/reports/components/survey-form-select.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { ReportContext } from '../hooks/use-report-context'",
   "",
   "export function SurveyFormSelect({",
   "  context,",
   "}: {",
   "  context: Pick<ReportContext, 'id' | 'kind' | 'forms' | 'currentForms' | 'formId' | 'setSelectedForm'>",
   "}) {",
   "  const { id, kind, forms, currentForms, formId, setSelectedForm } = context",
   "  return (",
   "    <>",
   [239, 274],
   "    </>",
   "  )",
   "}"
  ],
  "apps/web/src/features/reports/components/round-select.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { ReportContext } from '../hooks/use-report-context'",
   "",
   [31, 37],
   "",
   "export function RoundSelect({",
   "  context,",
   "}: {",
   "  context: Pick<",
   "    ReportContext,",
   "    'id' | 'kind' | 'rounds' | 'currentRounds' | 'evaluationId' | 'setSelectedRound'",
   "  >",
   "}) {",
   "  const { id, kind, rounds, currentRounds, evaluationId, setSelectedRound } = context",
   "  return (",
   "    <>",
   [310, 340],
   "    </>",
   "  )",
   "}"
  ],
  "apps/web/src/features/reports/components/report-context-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { ReportContext } from '../hooks/use-report-context'",
   "import type { ReportGeneration } from '../hooks/use-report-generation'",
   "import { RoundSelect } from './round-select'",
   "import { SurveyFormSelect } from './survey-form-select'",
   "",
   "export function ReportContextCard({",
   "  context,",
   "  generation,",
   "  previewOnly,",
   "}: {",
   "  context: Pick<",
   "    ReportContext,",
   "    | 'profile'",
   "    | 'projects'",
   "    | 'currentProjects'",
   "    | 'id'",
   "    | 'setSelection'",
   "    | 'kind'",
   "    | 'setKind'",
   "    | 'allowed'",
   "    | 'forms'",
   "    | 'currentForms'",
   "    | 'formId'",
   "    | 'setSelectedForm'",
   "    | 'rounds'",
   "    | 'currentRounds'",
   "    | 'evaluationId'",
   "    | 'setSelectedRound'",
   "    | 'preview'",
   "    | 'currentPreview'",
   "  >",
   "  generation: Pick<",
   "    ReportGeneration,",
   "    'owner' | 'currentName' | 'setName' | 'format' | 'setFormat' | 'busy' | 'generate'",
   "  >",
   "  previewOnly: boolean",
   "}) {",
   "  const { profile, projects, currentProjects, id, setSelection, kind, setKind, allowed } = context",
   "  const { preview, currentPreview } = context",
   "  const { owner, currentName, setName, format, setFormat, busy, generate } = generation",
   "  return (",
   [221, 238],
   "        <SurveyFormSelect context={context} />",
   [275, 309],
   "          <RoundSelect context={context} />",
   [341, 394],
   "  )",
   "}"
  ],
  "apps/web/src/features/reports/components/report-preview-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { ReportContext } from '../hooks/use-report-context'",
   "import type { ReportGeneration } from '../hooks/use-report-generation'",
   "",
   "export function ReportPreviewCard({",
   "  context,",
   "  generation,",
   "}: {",
   "  context: Pick<ReportContext, 'contextReady' | 'id' | 'kind' | 'preview' | 'currentPreview'>",
   "  generation: Pick<ReportGeneration, 'currentName'>",
   "}) {",
   "  const { contextReady, id, kind, preview, currentPreview } = context",
   "  const { currentName } = generation",
   "  return (",
   [395, 445],
   "  )",
   "}"
  ],
  "apps/web/src/features/reports/components/saved-reports-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { ReportContext } from '../hooks/use-report-context'",
   "import type { ReportGeneration } from '../hooks/use-report-generation'",
   "",
   "export function SavedReportsCard({",
   "  context,",
   "  generation,",
   "}: {",
   "  context: Pick<ReportContext, 'profile' | 'contextReady' | 'reports' | 'currentReports'>",
   "  generation: Pick<ReportGeneration, 'download'>",
   "}) {",
   "  const { profile, contextReady, reports, currentReports } = context",
   "  const { download } = generation",
   "  return (",
   [446, 507],
   "  )",
   "}"
  ],
  "apps/web/src/features/reports/components/live-reporting-workspace.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useReportContext } from '../hooks/use-report-context'",
   "import { useReportGeneration } from '../hooks/use-report-generation'",
   "import { ReportContextCard } from './report-context-card'",
   "import { ReportPreviewCard } from './report-preview-card'",
   "import { SavedReportsCard } from './saved-reports-card'",
   "",
   [38, 41],
   "  const context = useReportContext(initialKind)",
   "  const generation = useReportGeneration(context)",
   "  const { statusMessage } = generation",
   "  return (",
   "    <div className=\"space-y-6\">",
   [213, 220],
   "      <ReportContextCard context={context} generation={generation} previewOnly={previewOnly} />",
   "      <ReportPreviewCard context={context} generation={generation} />",
   "      <SavedReportsCard context={context} generation={generation} />",
   "    </div>",
   "  )",
   "}"
  ]
 }
}
```

```bash
R=apps/web/src/features/reports
cp $R/components/live-reporting-workspace.tsx .tmp/s6c/before-split/
node .tmp/s6c/cut.mjs .tmp/s6c/task4-split.json
NEW="$R/hooks/use-report-context.ts $R/hooks/use-report-generation.ts $R/components/survey-form-select.tsx $R/components/round-select.tsx $R/components/report-context-card.tsx $R/components/report-preview-card.tsx $R/components/saved-reports-card.tsx $R/components/live-reporting-workspace.tsx"
node .tmp/s6c/trim-imports.mjs $NEW | grep -c "removed"
git add -N $R
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR -- $R) 2>&1 | tail -2
node .tmp/s6c/same-lines.mjs .tmp/s6c/before-split/live-reporting-workspace.tsx $NEW --list > .tmp/s6c/added4.txt
tail -1 .tmp/s6c/added4.txt
grep -c "^[0-9]*x " .tmp/s6c/added4.txt
wc -l $NEW | tail -9
```

Expected: the eight files are built (`cut.mjs` creates the folders), the unused imports of every file go (one line per file), Biome formats six of them, `same-lines` prints `lost 0` and `added 156`, 100 distinct added lines are listed in `.tmp/s6c/added4.txt`, and the files have the sizes:

```
apps/web/src/features/reports/hooks/use-report-context.ts: 132 lines
apps/web/src/features/reports/hooks/use-report-generation.ts: 146 lines
apps/web/src/features/reports/components/survey-form-select.tsx: 79 lines
apps/web/src/features/reports/components/round-select.tsx: 85 lines
apps/web/src/features/reports/components/report-context-card.tsx: 182 lines
apps/web/src/features/reports/components/report-preview-card.tsx: 96 lines
apps/web/src/features/reports/components/saved-reports-card.tsx: 107 lines
apps/web/src/features/reports/components/live-reporting-workspace.tsx: 59 lines
8
Checked 8 files in <ms>. Fixed 6 files.
original lines 480, lost 0, added 156
100
  112 apps/web/src/features/reports/hooks/use-report-context.ts
  136 apps/web/src/features/reports/hooks/use-report-generation.ts
   63 apps/web/src/features/reports/components/survey-form-select.tsx
   65 apps/web/src/features/reports/components/round-select.tsx
  169 apps/web/src/features/reports/components/report-context-card.tsx
   71 apps/web/src/features/reports/components/report-preview-card.tsx
   83 apps/web/src/features/reports/components/saved-reports-card.tsx
   33 apps/web/src/features/reports/components/live-reporting-workspace.tsx
  732 total
```

`.tmp/s6c/added4.txt` lists the 156 added lines: the two hook signatures and their return lists, the `Pick` type lines, the destructurings, the `<Card context={context} generation={generation} />` calls and the fragment wrappers. Read it once; it is the whole review surface of this step apart from the effect move above.

```bash
R=apps/web/src/features/reports
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
pnpm --filter @pathways/web exec vitest run src/features/reports src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
mut() { f=$1; from=$2; to=$3; cp $f .tmp/s6c/files/m.bak; sed -i "s/$from/$to/" $f; cmp -s $f .tmp/s6c/files/m.bak && echo "NO CHANGE $f"; pnpm --filter @pathways/web exec vitest run src/features/reports/components 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]"; cp .tmp/s6c/files/m.bak $f; }
mut $R/hooks/use-report-generation.ts "=== 409 \&\& kind === 'EVALUATION_REPORT'" "=== 409 \&\& kind !== 'EVALUATION_REPORT'"
mut $R/hooks/use-report-generation.ts "if (captured.isCurrent()) setBusy(false)" "setBusy(true)"
mut $R/components/saved-reports-card.tsx "report.status !== 'GENERATED'" "report.status === 'GENERATED'"
mut $R/components/round-select.tsx "No signed-off evaluation round yet" "No round yet"
git status --short | wc -l
```

Expected: the typecheck is clean with only the two baseline lines, the reports folder and the direction test pass (8 files, 59 tests: the 54 of the folder and the 5 of the direction test), and each of four mutations (the conflict message branch, the busy reset, the download enable rule and the empty rounds note) fails at least one test and is restored, leaving the 8 new files and 1 modified file:

```
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  8 passed (8)
      Tests  65 passed (65)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 28 passed (30)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 28 passed (30)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 28 passed (30)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 29 passed (30)
8
```

```bash
pnpm exec biome check apps/web/src/features/reports 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): split the live reporting workspace into hooks and cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -10
```

Expected: Biome is clean and the commit holds 8 files, seven of them new:

```
Checked 24 files in <ms>. No fixes applied.
[<branch> <sha>] refactor(web): split the live reporting workspace into hooks and cards
 8 files changed, 711 insertions(+), 489 deletions(-)
 create mode 100644 apps/web/src/features/reports/components/report-context-card.tsx
 create mode 100644 apps/web/src/features/reports/components/report-preview-card.tsx
 create mode 100644 apps/web/src/features/reports/components/round-select.tsx
 create mode 100644 apps/web/src/features/reports/components/saved-reports-card.tsx
 create mode 100644 apps/web/src/features/reports/components/survey-form-select.tsx
 create mode 100644 apps/web/src/features/reports/hooks/use-report-context.ts
 create mode 100644 apps/web/src/features/reports/hooks/use-report-generation.ts
 .../components/live-reporting-workspace.tsx        | 501 +--------------------
 .../reports/components/report-context-card.tsx     | 169 +++++++
 .../reports/components/report-preview-card.tsx     |  71 +++
 .../features/reports/components/round-select.tsx   |  65 +++
 .../reports/components/saved-reports-card.tsx      |  83 ++++
 .../reports/components/survey-form-select.tsx      |  63 +++
 .../features/reports/hooks/use-report-context.ts   | 112 +++++
 .../reports/hooks/use-report-generation.ts         | 136 ++++++
 8 files changed, 711 insertions(+), 489 deletions(-)
```


---

### Task 5: Split the live evaluation workspace

**Files:**
- Create: `apps/web/src/features/projects/evaluation/evaluation.utils.ts`; `hooks/use-evaluation-workspace.ts`; `components/score-table.tsx`, `evaluation-card.tsx`, `evaluation-list-card.tsx`, `start-evaluation-card.tsx`, `review-card.tsx`, `evaluation-dialogs.tsx`
- Modify: `apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx` (531 lines to 42) and its test (299 lines, four rows added)
- Create (gitignored): `.tmp/s6c/task5-chars.json`, `task5-cut.json`, `task5-exports.json`, `before-eval/`

`live-evaluation-workspace.tsx` is a wrapper (`LiveEvaluationWorkspace`, which re-keys its content when the draft owner changes), a 358 line `EvaluationContent` (state, reads, five handlers and the markup of three cards and three dialogs), and the two helper components `ScoreTable` and `EvaluationCard`. The split follows Task 4: `cut.mjs` from line ranges, `same-lines.mjs` for `lost 0`, cards that take `{ workspace }` as a `Pick` of the hook result. Unlike the reporting workspace, all state and handlers live in one hook, called first and only, so the order of every hook and effect is the order the component had. The 11 existing tests render the whole screen and stay in one file (the file is under 500 lines after the new rows). The direct `principalHasAtomicPermission(profile, ...)` call stays in the hook (F4a left no local wrapper here).

- [ ] **Step 1: Pin the narrative lock, the failure message and the pending state**

The existing rows cover creating, recomputing, submitting, returning and signing off, the read-only roles and the score table. No row reached the unsaved narrative lock that the Submit button and its notice share, the toast of a failed handler, the single request while an operation is pending or the period check of the start form. `.tmp/s6c/task5-chars.json` adds four rows and the `act` import one of them needs, passing against the code as it stands (the pending row clicks twice inside one `act`, so the second click is refused by the `activeOperation` guard of `run` and not by the disabled button):

Create `.tmp/s6c/task5-chars.json`:

```json
[
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
    "import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'\n",
    "import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.test.tsx",
    "  it('shows the return reason and keeps it out of the narrative', () => {\n",
    "  it('keeps submit locked until the unsaved narrative is recomputed and saved', async () => {\n    state.evaluation = { ...openEvaluation }\n    state.saveScores.mockResolvedValue({ ...openEvaluation })\n    render(<LiveEvaluationWorkspace projectId={projectId} />)\n    const notice = 'Recompute to save the narrative before submitting.'\n    expect(screen.queryByText(notice)).toBeNull()\n    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Notes' } })\n    expect(screen.getByText(notice)).toBeTruthy()\n    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }))\n    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Scores recomputed.'))\n    expect(screen.queryByText(notice)).toBeNull()\n    expect(screen.getByRole('button', { name: 'Submit evaluation' }).hasAttribute('disabled')).toBe(\n      false,\n    )\n  })\n\n  it('shows the server message when a recompute fails and keeps the narrative unsaved', async () => {\n    state.evaluation = { ...openEvaluation }\n    state.saveScores.mockRejectedValue(Error('Scores are locked'))\n    render(<LiveEvaluationWorkspace projectId={projectId} />)\n    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Notes' } })\n    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }))\n    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Scores are locked'))\n    expect(state.success).not.toHaveBeenCalled()\n    expect(state.refetch).not.toHaveBeenCalled()\n    expect(screen.getByText('Recompute to save the narrative before submitting.')).toBeTruthy()\n  })\n\n  it('sends one request while an operation is pending', () => {\n    state.evaluation = { ...openEvaluation }\n    state.saveScores.mockReturnValue(new Promise(() => {}))\n    render(<LiveEvaluationWorkspace projectId={projectId} />)\n    const button = screen.getByRole('button', { name: 'Recompute' })\n    act(() => {\n      button.click()\n      button.click()\n    })\n    expect(state.saveScores).toHaveBeenCalledOnce()\n    expect(button.hasAttribute('disabled')).toBe(true)\n  })\n\n  it('refuses to start a round that ends before it begins', () => {\n    render(<LiveEvaluationWorkspace projectId={projectId} />)\n    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2025-12-31' } })\n    expect(screen.getByRole('button', { name: 'Start evaluation' }).hasAttribute('disabled')).toBe(\n      true,\n    )\n  })\n\n  it('shows the return reason and keeps it out of the narrative', () => {\n",
    1
  ]
]
```

```bash
E=apps/web/src/features/projects/evaluation/components
cp $E/live-evaluation-workspace.test.tsx .tmp/s6c/before-eval/
node .tmp/s6c/test-titles.mjs save .tmp/s6c/titles-eval-before.json $E/live-evaluation-workspace.test.tsx
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task5-chars.json
pnpm exec biome check --write $E/live-evaluation-workspace.test.tsx 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/projects/evaluation 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
git add -A apps/web
git commit -m "test(web): pin the evaluation workspace narrative lock, failure message and pending state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object $E/live-evaluation-workspace.tsx | cut -c1-8
```

Expected: the saved title list (one file, 11 tests), two replacements, Biome clean, the file runs 15 tests and the production file is at the hash the split is pinned to:

```
files 1, tests 11, failed 0
2 replacements in 1 files
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  15 passed (15)
[<branch> <sha>] test(web): pin the evaluation workspace narrative lock, failure message and pending state
 1 file changed, 50 insertions(+), 1 deletion(-)
a2dc7e35
```

- [ ] **Step 2: Split the workspace**

| New file | Source lines | Content |
|---|---|---|
| `evaluation.utils.ts` | 27 to 53 | the two types, `statusTone`, the open statuses, the criterion order, `orderOf`, `points`, `today`, `named`; seven declarations get `export` |
| `hooks/use-evaluation-workspace.ts` | 71 to 250 | profile, the read, the three draft owners, the form state, the two effects, `run` and the five handlers; returns 31 values |
| `components/live-evaluation-workspace.tsx` | 54 to 70, 252 to 258 | the wrapper, the `EvaluationContent` signature and the frame note, then the four section tags |
| `components/evaluation-list-card.tsx` | 259 to 288 | the evaluations card |
| `components/start-evaluation-card.tsx` | 289 to 329 | the start form, with its `createEvalOwner ? ( ... ) : null` condition kept inside a fragment |
| `components/review-card.tsx` | 330 to 380 | recompute, submit, return and sign off, condition kept inside a fragment |
| `components/evaluation-dialogs.tsx` | 381 to 425 | the three confirmation dialogs |
| `components/score-table.tsx`, `evaluation-card.tsx` | 430 to 501, 503 to 531 | the two helper components, exported |

`statusTone` is typed to F4b's `StatusTone` with `as const satisfies Record<EvaluationDetail['status'], StatusTone>`: the object stays the same and only its closing line changes, so a status given a tone `StatusBadge` does not render fails the typecheck (shown below). `.tmp/s6c/task5-cut.json` is the cut plan and `.tmp/s6c/task5-exports.json` the nine counted replacements that add `export` to the seven declarations and the `satisfies` clause:

Create `.tmp/s6c/task5-cut.json`:

```json
{
 "source": "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx",
 "hash": "a2dc7e35",
 "files": {
  "apps/web/src/features/projects/evaluation/evaluation.utils.ts": [
   "@imports",
   "import type { StatusTone } from '@/lib/format/tone'",
   "",
   [27, 53]
  ],
  "apps/web/src/features/projects/evaluation/hooks/use-evaluation-workspace.ts": [
   "@imports",
   "import { openStatuses, today } from '../evaluation.utils'",
   "",
   "export const useEvaluationWorkspace = (projectId: string) => {",
   [71, 250],
   "  return {",
   "    read,",
   "    current,",
   "    openEvaluation,",
   "    projectRead,",
   "    createEvalOwner,",
   "    scoreOwner,",
   "    reviewOwner,",
   "    canSignOff,",
   "    title,",
   "    evalForm,",
   "    setEdits,",
   "    narrative,",
   "    setNarrative,",
   "    unsaved,",
   "    setUnsaved,",
   "    returnReason,",
   "    setReturnReason,",
   "    signoffFeedback,",
   "    setSignoffFeedback,",
   "    submitOpen,",
   "    setSubmitOpen,",
   "    returnOpen,",
   "    setReturnOpen,",
   "    signoffOpen,",
   "    setSignoffOpen,",
   "    busy,",
   "    startEvaluation,",
   "    recompute,",
   "    submitEvaluation,",
   "    returnEvaluation,",
   "    signoff,",
   "  }",
   "}",
   "",
   "export type EvaluationWorkspace = ReturnType<typeof useEvaluationWorkspace>"
  ],
  "apps/web/src/features/projects/evaluation/components/score-table.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { type EvaluationDetail, orderOf, points } from '../evaluation.utils'",
   "",
   "export function ScoreTable({ evaluation }: { evaluation: EvaluationDetail }) {",
   [430, 501]
  ],
  "apps/web/src/features/projects/evaluation/components/evaluation-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { type EvaluationDetail, named, statusTone } from '../evaluation.utils'",
   "import { ScoreTable } from './score-table'",
   "",
   "export function EvaluationCard({ evaluation }: { evaluation: EvaluationDetail }) {",
   [503, 531]
  ],
  "apps/web/src/features/projects/evaluation/components/evaluation-list-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'",
   "import { EvaluationCard } from './evaluation-card'",
   "",
   "export function EvaluationListCard({ workspace }: { workspace: Pick<EvaluationWorkspace, 'read' | 'current'> }) {",
   "  const { read, current } = workspace",
   "  return (",
   [259, 288],
   "  )",
   "}"
  ],
  "apps/web/src/features/projects/evaluation/components/start-evaluation-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'",
   "",
   "export function StartEvaluationCard({ workspace }: { workspace: Pick<EvaluationWorkspace, 'createEvalOwner' | 'title' | 'evalForm' | 'setEdits' | 'busy' | 'projectRead' | 'startEvaluation'> }) {",
   "  const { createEvalOwner, title, evalForm, setEdits, busy, projectRead, startEvaluation } = workspace",
   "  return (",
   "    <>",
   [289, 329],
   "    </>",
   "  )",
   "}"
  ],
  "apps/web/src/features/projects/evaluation/components/review-card.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'",
   "",
   "export function ReviewCard({ workspace }: { workspace: Pick<EvaluationWorkspace, 'openEvaluation' | 'scoreOwner' | 'reviewOwner' | 'canSignOff' | 'narrative' | 'setNarrative' | 'unsaved' | 'setUnsaved' | 'busy' | 'recompute' | 'setSubmitOpen' | 'setReturnOpen' | 'setSignoffOpen'> }) {",
   "  const { openEvaluation, scoreOwner, reviewOwner, canSignOff, narrative, setNarrative, unsaved, setUnsaved, busy, recompute, setSubmitOpen, setReturnOpen, setSignoffOpen } = workspace",
   "  return (",
   "    <>",
   [330, 380],
   "    </>",
   "  )",
   "}"
  ],
  "apps/web/src/features/projects/evaluation/components/evaluation-dialogs.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'",
   "",
   "export function EvaluationDialogs({ workspace }: { workspace: Pick<EvaluationWorkspace, 'submitOpen' | 'setSubmitOpen' | 'returnOpen' | 'setReturnOpen' | 'returnReason' | 'setReturnReason' | 'signoffOpen' | 'setSignoffOpen' | 'signoffFeedback' | 'setSignoffFeedback' | 'submitEvaluation' | 'returnEvaluation' | 'signoff'> }) {",
   "  const { submitOpen, setSubmitOpen, returnOpen, setReturnOpen, returnReason, setReturnReason, signoffOpen, setSignoffOpen, signoffFeedback, setSignoffFeedback, submitEvaluation, returnEvaluation, signoff } = workspace",
   "  return (",
   "    <>",
   [381, 425],
   "    </>",
   "  )",
   "}"
  ],
  "apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useEvaluationWorkspace } from '../hooks/use-evaluation-workspace'",
   "import { EvaluationDialogs } from './evaluation-dialogs'",
   "import { EvaluationListCard } from './evaluation-list-card'",
   "import { ReviewCard } from './review-card'",
   "import { StartEvaluationCard } from './start-evaluation-card'",
   "",
   [54, 70],
   "  const workspace = useEvaluationWorkspace(projectId)",
   [252, 258],
   "      <EvaluationListCard workspace={workspace} />",
   "      <StartEvaluationCard workspace={workspace} />",
   "      <ReviewCard workspace={workspace} />",
   "      <EvaluationDialogs workspace={workspace} />",
   "    </div>",
   "  )",
   "}"
  ]
 }
}
```

Create `.tmp/s6c/task5-exports.json`:

```json
[
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\ntype EvaluationDetail =",
    "\nexport type EvaluationDetail =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\ntype SavedScore =",
    "\nexport type SavedScore =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst statusTone = {",
    "\nexport const statusTone = {",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "} as const\n",
    "} as const satisfies Record<EvaluationDetail['status'], StatusTone>\n",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst openStatuses =",
    "\nexport const openStatuses =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst orderOf =",
    "\nexport const orderOf =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst points =",
    "\nexport const points =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst today =",
    "\nexport const today =",
    1
  ],
  [
    "apps/web/src/features/projects/evaluation/evaluation.utils.ts",
    "\nconst named =",
    "\nexport const named =",
    1
  ]
]
```

```bash
E=apps/web/src/features/projects/evaluation
cp $E/components/live-evaluation-workspace.tsx .tmp/s6c/before-eval/
node .tmp/s6c/cut.mjs .tmp/s6c/task5-cut.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task5-exports.json
NEW="$E/evaluation.utils.ts $E/hooks/use-evaluation-workspace.ts $E/components/score-table.tsx $E/components/evaluation-card.tsx $E/components/evaluation-list-card.tsx $E/components/start-evaluation-card.tsx $E/components/review-card.tsx $E/components/evaluation-dialogs.tsx $E/components/live-evaluation-workspace.tsx"
node .tmp/s6c/trim-imports.mjs $NEW | grep -c "removed"
git add -N $E
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR -- $E) 2>&1 | tail -2
node .tmp/s6c/same-lines.mjs .tmp/s6c/before-eval/live-evaluation-workspace.tsx $NEW "} as const satisfies Record<EvaluationDetail['status'], StatusTone>=} as const" --list > .tmp/s6c/added5.txt
tail -1 .tmp/s6c/added5.txt
wc -l $NEW | tail -10
```

Expected: the nine files are built, nine replacements are counted, the unused imports of every file go, Biome formats five files, `same-lines` prints `lost 0` and `added 149` (the `satisfies` rename argument is the one deliberate change it is told about), and the files have the sizes:

```
apps/web/src/features/projects/evaluation/evaluation.utils.ts: 53 lines
apps/web/src/features/projects/evaluation/hooks/use-evaluation-workspace.ts: 243 lines
apps/web/src/features/projects/evaluation/components/score-table.tsx: 101 lines
apps/web/src/features/projects/evaluation/components/evaluation-card.tsx: 59 lines
apps/web/src/features/projects/evaluation/components/evaluation-list-card.tsx: 64 lines
apps/web/src/features/projects/evaluation/components/start-evaluation-card.tsx: 76 lines
apps/web/src/features/projects/evaluation/components/review-card.tsx: 86 lines
apps/web/src/features/projects/evaluation/components/evaluation-dialogs.tsx: 80 lines
apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx: 64 lines
9 replacements in 1 files
9
Checked 9 files in <ms>. Fixed 5 files.
original lines 496, lost 0, added 149
   30 apps/web/src/features/projects/evaluation/evaluation.utils.ts
  228 apps/web/src/features/projects/evaluation/hooks/use-evaluation-workspace.ts
   81 apps/web/src/features/projects/evaluation/components/score-table.tsx
   36 apps/web/src/features/projects/evaluation/components/evaluation-card.tsx
   43 apps/web/src/features/projects/evaluation/components/evaluation-list-card.tsx
   69 apps/web/src/features/projects/evaluation/components/start-evaluation-card.tsx
   99 apps/web/src/features/projects/evaluation/components/review-card.tsx
   91 apps/web/src/features/projects/evaluation/components/evaluation-dialogs.tsx
   42 apps/web/src/features/projects/evaluation/components/live-evaluation-workspace.tsx
  719 total
```

`.tmp/s6c/added5.txt` lists the added lines: the hook signature and its 31 return names, the `Pick` types, the destructurings, the section tags and the fragment wrappers.

```bash
E=apps/web/src/features/projects/evaluation
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
node .tmp/s6c/test-titles.mjs save .tmp/s6c/titles-eval-after.json $E/components/live-evaluation-workspace.test.tsx
node .tmp/s6c/test-titles.mjs compare .tmp/s6c/titles-eval-before.json .tmp/s6c/titles-eval-after.json
mut() { f=$1; from=$2; to=$3; cp $f .tmp/s6c/files/m.bak; sed -i "s/$from/$to/" $f; cmp -s $f .tmp/s6c/files/m.bak && echo "NO CHANGE $f"; pnpm --filter @pathways/web exec vitest run src/features/projects/evaluation 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]"; cp .tmp/s6c/files/m.bak $f; }
mut $E/hooks/use-evaluation-workspace.ts "commentary: narrative," "commentary: ''," 
mut $E/components/review-card.tsx "disabled={busy || unsaved}" "disabled={busy}"
mut $E/hooks/use-evaluation-workspace.ts " || activeOperation.current) return" ") return"
cp $E/evaluation.utils.ts .tmp/s6c/files/m.bak
sed -i "s/ARCHIVED: 'neutral'/ARCHIVED: 'muted'/" $E/evaluation.utils.ts
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | grep "error TS" | cut -c1-200
cp .tmp/s6c/files/m.bak $E/evaluation.utils.ts
pnpm --filter @pathways/web exec vitest run src/features/projects/evaluation 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
git status --short | wc -l
```

Expected: the typecheck is clean with only the two baseline lines, the title comparison prints `lost 0` against the 11 titles of the first step plus the four new ones, the three behavior mutations (the narrative sent to the save, the unsaved lock, the pending guard) fail one test each, the tone mutation fails the typecheck at the status table and at the badge that reads it, and the restored folder runs 15 tests:

```
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
files 1, tests 15, failed 0
before 11, after 15, lost 0, added 4
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
src/features/projects/evaluation/components/evaluation-card.tsx(18,22): error TS2322: Type '"info" | "success" | "neutral" | "muted"' is not assignable to type 'StatusTone | undefined'.
src/features/projects/evaluation/evaluation.utils.ts(12,3): error TS2322: Type '"muted"' is not assignable to type 'StatusTone'.
 Test Files  1 passed (1)
      Tests  15 passed (15)
9
```

The guard `busy || activeOperation.current` in the hook's `run` is moved verbatim (`lost 0`). The pending row pins its `activeOperation.current` half: the third mutation above removes it and fails that row. The `busy` half is redundant with it, since the ref is set in the same call as the state, so removing only `busy` is an equivalent change.

```bash
pnpm exec biome check apps/web/src/features/projects/evaluation 2>&1 | tail -1
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): split the live evaluation workspace into a hook and cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -12
```

Expected: Biome is clean and the commit holds 9 files, eight of them new:

```
Checked 10 files in <ms>. No fixes applied.
[<branch> <sha>] refactor(web): split the live evaluation workspace into a hook and cards
 9 files changed, 688 insertions(+), 500 deletions(-)
 create mode 100644 apps/web/src/features/projects/evaluation/components/evaluation-card.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/components/evaluation-dialogs.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/components/evaluation-list-card.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/components/review-card.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/components/score-table.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/components/start-evaluation-card.tsx
 create mode 100644 apps/web/src/features/projects/evaluation/evaluation.utils.ts
 create mode 100644 apps/web/src/features/projects/evaluation/hooks/use-evaluation-workspace.ts
 .../evaluation/components/evaluation-card.tsx      |  36 ++
 .../evaluation/components/evaluation-dialogs.tsx   |  91 ++++
 .../evaluation/components/evaluation-list-card.tsx |  43 ++
 .../components/live-evaluation-workspace.tsx       | 511 +--------------------
 .../projects/evaluation/components/review-card.tsx |  99 ++++
 .../projects/evaluation/components/score-table.tsx |  81 ++++
 .../components/start-evaluation-card.tsx           |  69 +++
 .../projects/evaluation/evaluation.utils.ts        |  30 ++
 .../evaluation/hooks/use-evaluation-workspace.ts   | 228 +++++++++
 9 files changed, 688 insertions(+), 500 deletions(-)
```


---

### Task 6: The shared `finance-budgets` read

**Files:**
- Create: `apps/web/src/features/projects/budget/budget.reads.ts` and `budget.reads.test.ts`
- Modify: `apps/web/src/features/projects/budget/hooks/use-budget-module.ts`; `apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts`
- Create (gitignored): `.tmp/s6c/read-calls.mjs`, `task6-edits.json`

The budget module and the activity expense panel both read the project's budget lines under the resource key `finance-budgets`. One key serves one cache entry, so the two calls may share a hook only if they cannot differ: same key, project, permission, fetcher and freshness. `.tmp/s6c/read-calls.mjs` lists every production `useAuthorizedRead` call of a key, splits its arguments and says whether they agree, with the `enabled` flag shown apart (a hook parameter, not part of the cache entry):

Create `.tmp/s6c/read-calls.mjs`:

```js
// Lists every production useAuthorizedRead call of one resource key and says whether the key, project, permission and read agree; the enabled flag and options are shown apart.
// Usage: node .tmp/s6c/read-calls.mjs <resource>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const resource = process.argv[2]
const files = execFileSync('git', ['grep', '-l', `'${resource}'`, '--', 'apps/web/src'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !/\.test\./.test(file))

// Splits an argument list at its top-level commas.
const split = (text) => {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++
    if (')]}'.includes(text[i])) depth--
    if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(from, i).trim())
      from = i + 1
    }
  }
  parts.push(text.slice(from).trim())
  return parts.filter(Boolean)
}

const calls = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const name = 'useAuthorizedRead('
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    let depth = 0
    let end = at + name.length - 1
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++
      if (text[end] === ')' && --depth === 0) break
    }
    const args = split(text.slice(at + name.length, end).replace(/\s+/g, ' '))
    if (args[0] === `'${resource}'`) calls.push({ file, args })
  }
}
for (const { file, args } of calls) console.log(`${file}: ${args.slice(0, 4).join(' | ')} | enabled ${args[4] ?? 'true'} | options ${args[5] ?? 'none'}`)
const same = new Set(calls.map(({ args }) => [args[0], args[1], args[2], args[3], args[5]].join('|'))).size === 1
console.log(`calls ${calls.length}, same key, project, permission, read and options: ${same ? 'yes' : 'no'}`)
```

- [ ] **Step 1: Compare the two reads**

```bash
node .tmp/s6c/read-calls.mjs finance-budgets
```

Expected: two calls that agree in everything but the enabled flag (the budget module always reads, the activity panel reads when the principal may read budget lines):

```
apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts: 'finance-budgets' | projectId | 'budgets.read' | (signal) => financeClient.budgets(projectId, signal) | enabled canReadBudgetLines | options none
apps/web/src/features/projects/budget/hooks/use-budget-module.ts: 'finance-budgets' | projectId | 'budgets.read' | (signal) => financeClient.budgets(projectId, signal) | enabled true | options none
calls 2, same key, project, permission, read and options: yes
```

The comparison is the record the plan asks for either way: the reads are identical, so they share one hook, `useBudgetsRead(projectId, enabled = true)`, in `budget.reads.ts` (the `.reads` suffix of CR 3.5; `budget/` gets no sub-index). The activities hook already imports a type from `../../budget/components`, so the import adds no new edge between the two folders.

- [ ] **Step 2: Add the hook and use it at both sites**

Create each file with the Write tool exactly as printed. The test pins the key, permission and project of the call, the `enabled` default and the fetcher, in the style of `activities.reads.test.ts`:

Create `apps/web/src/features/projects/budget/budget.reads.ts`:

```ts
'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { financeClient } from '@/lib/api/finance'

/** Budget lines of a project under one shared key, so the budget module and the activity expense panel use one cache entry. */
export const useBudgetsRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    'finance-budgets',
    projectId,
    'budgets.read',
    (signal) => financeClient.budgets(projectId, signal),
    enabled,
  )
```

Create `apps/web/src/features/projects/budget/budget.reads.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({ budgets: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/finance', () => ({ financeClient: client }))

import { useBudgetsRead } from './budget.reads'

const signal = new AbortController().signal

describe('budget authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    client.budgets.mockReset()
  })

  it('reads the budget lines under one shared key, enabled unless the caller says otherwise', () => {
    useBudgetsRead('project-1')
    useBudgetsRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['finance-budgets', 'project-1', 'budgets.read'],
      ['finance-budgets', 'project-2', 'budgets.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toBeUndefined()
    read.mock.calls[0][3](signal)
    expect(client.budgets).toHaveBeenCalledWith('project-1', signal)
  })
})
```

`.tmp/s6c/task6-edits.json` holds the four replacements that swap the two inline calls for the hook and add its import:

Create `.tmp/s6c/task6-edits.json`:

```json
[
  [
    "apps/web/src/features/projects/budget/hooks/use-budget-module.ts",
    "  const budgets = useAuthorizedRead('finance-budgets', projectId, 'budgets.read', (signal) =>\n    financeClient.budgets(projectId, signal),\n  )\n",
    "  const budgets = useBudgetsRead(projectId)\n",
    1
  ],
  [
    "apps/web/src/features/projects/budget/hooks/use-budget-module.ts",
    "import { useProjectOverviewMetricsRead } from '../../projects.reads'\n",
    "import { useProjectOverviewMetricsRead } from '../../projects.reads'\nimport { useBudgetsRead } from '../budget.reads'\n",
    1
  ],
  [
    "apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts",
    "  const budgetLinesRead = useAuthorizedRead(\n    'finance-budgets',\n    projectId,\n    'budgets.read',\n    (signal) => financeClient.budgets(projectId, signal),\n    canReadBudgetLines,\n  )\n",
    "  const budgetLinesRead = useBudgetsRead(projectId, canReadBudgetLines)\n",
    1
  ],
  [
    "apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts",
    "import type { ExpenseBudgetReference } from '../../budget/components/activity-expense-dialog'\n",
    "import { useBudgetsRead } from '../../budget/budget.reads'\nimport type { ExpenseBudgetReference } from '../../budget/components/activity-expense-dialog'\n",
    1
  ]
]
```

```bash
B=apps/web/src/features/projects/budget
A=apps/web/src/features/projects/activities
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task6-edits.json
git add -N $B
pnpm exec biome check --write $B $A 2>&1 | tail -2
node .tmp/s6c/read-calls.mjs finance-budgets
git grep -n "useBudgetsRead(" -- $A $B | grep -v "\.test\." | sed -E 's/:[0-9]+:/: /'
git diff --stat | cat
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | cut -c1-140
```

Expected: four replacements, Biome clean, one call left (in the hook, with the enabled flag now a parameter), the two lines that call `useBudgetsRead` outside the tests (no test renders the budget module, and the `enabled` argument of the activity call repeats the permission and scope check of `useAuthorizedRead`, so this listing is where the two arguments are pinned) and the diff of the two modified files plus the two new files, the typecheck is clean and only the two baseline lines remain:

```
4 replacements in 2 files
Checked 73 files in <ms>. No fixes applied.
apps/web/src/features/projects/budget/budget.reads.ts: 'finance-budgets' | projectId | 'budgets.read' | (signal) => financeClient.budgets(projectId, signal) | enabled enabled | options none
calls 1, same key, project, permission, read and options: yes
apps/web/src/features/projects/activities/hooks/use-activity-expenses.ts:   const budgetLinesRead = useBudgetsRead(projectId, canReadBudgetLines)
apps/web/src/features/projects/budget/hooks/use-budget-module.ts:   const budgets = useBudgetsRead(projectId)
 .../activities/hooks/use-activity-expenses.ts      |  9 ++-----
 .../features/projects/budget/budget.reads.test.ts  | 31 ++++++++++++++++++++++
 .../src/features/projects/budget/budget.reads.ts   | 14 ++++++++++
 .../projects/budget/hooks/use-budget-module.ts     |  5 ++--
 4 files changed, 49 insertions(+), 10 deletions(-)
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts: error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts: error TS6196: 'SadddDashboard' is declared but never used.
```

```bash
B=apps/web/src/features/projects/budget
pnpm --filter @pathways/web exec vitest run src/features/projects/budget src/features/projects/activities 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
cp $B/budget.reads.ts .tmp/s6c/files/m.bak
sed -i "s/'budgets.read'/'expenses.read'/" $B/budget.reads.ts
pnpm --filter @pathways/web exec vitest run src/features/projects/budget/budget.reads.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]"
cp .tmp/s6c/files/m.bak $B/budget.reads.ts
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): share the finance-budgets read between the budget module and the activity expenses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -6
```

Expected: the budget and activity suites pass (they mock `useAuthorizedRead` or the finance client, and both still see the same key, permission and fetcher), a changed permission fails the new test, and the commit holds 4 files:

```
 Test Files  24 passed (24)
      Tests  240 passed (240)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed (1)
[<branch> <sha>] refactor(web): share the finance-budgets read between the budget module and the activity expenses
 4 files changed, 49 insertions(+), 10 deletions(-)
 create mode 100644 apps/web/src/features/projects/budget/budget.reads.test.ts
 create mode 100644 apps/web/src/features/projects/budget/budget.reads.ts
 .../activities/hooks/use-activity-expenses.ts      |  9 ++-----
 .../features/projects/budget/budget.reads.test.ts  | 31 ++++++++++++++++++++++
 .../src/features/projects/budget/budget.reads.ts   | 14 ++++++++++
 .../projects/budget/hooks/use-budget-module.ts     |  5 ++--
 4 files changed, 49 insertions(+), 10 deletions(-)
```


---

### Task 7: Records

**Files:**
- Create (gitignored): `.tmp/s6c/task7-edits.json`, `activity-s6c.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.4, 3.6 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-16 rows), `docs/qad-pathways.md` (QAD-T121), `docs/deferred-features.md` (the evaluation workspace split row), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 14): `scripts/sad/check.ts` already routes `packages/shared/src/rbac/**`, `apps/api/src/**/*.service.ts`, `*.mapper.ts` and `*.helpers.ts`, `packages/shared/src/contracts/**` and `apps/web/src/**` to a role.

- [ ] **Step 1: Amend the change record, the living docs and the index**

Create the file with the Write tool, exactly as printed. `.tmp/s6c/task7-edits.json` holds the exact replacements (the layout paragraph in section 3.3, the rbac entry of section 3.4, the response bullet of section 3.6, the S6c applied paragraph of section 9 after the S6b "Deferred to S6c" paragraph, the QAD row and the deferred feature row); `@DATE@` is replaced by the day Task 7 runs and `@M0@` by the Middleware size of Task 0:

Create `.tmp/s6c/task7-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "### 3.4 Shared package layout (`packages/shared/src/`)\n",
  "`features/reports` and `features/projects/evaluation` hold `hooks/` (the report context and generation state, the evaluation workspace state) beside `components/`, one card or select per file, with `reports.copy.ts` for the kind labels and `evaluation.utils.ts` for the evaluation helpers; the `finance-budgets` read that the budget module and the activity expense panel share sits in `features/projects/budget/budget.reads.ts` (amended @DATE@ for S6c).\n\n### 3.4 Shared package layout (`packages/shared/src/`)\n",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "`rbac/` (role catalog, permissions, authorization policy)",
  "`rbac/` (role catalog, permissions, authorization policy, the report kind grant table)",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "- Web `lib/api/<domain>.ts` uses the inferred types;",
  "- The finance, evaluation and report responses (`contracts/{finance,evaluations,reports}/*-responses.ts`) follow the two rules above: the api annotates its mappers and services with the inferred types and never parses them, so a renamed field fails the api typecheck, and the web clients parse the same schemas, narrowing with `.extend` where the api type is wider (the budget currency to PHP, the report type to a report kind, the evaluation rounds to signed-off and archived; amended @DATE@ for S6c).\n- Web `lib/api/<domain>.ts` uses the inferred types;",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "the deferred web items named for S6b above are otherwise done.",
  "the deferred web items named for S6b above are otherwise done.\n\nS6c applied @DATE@ on the S6c slice branch:\n- Response contracts: `packages/shared/src/contracts/finance/finance-responses.ts`, `contracts/evaluations/evaluation-responses.ts` and `contracts/reports/report-responses.ts` hold the response schemas of the finance, evaluation and report routes, moved verbatim from the web clients and `lib/api/report-sections.ts` (`schema-moved.mjs` printed `lost 0` with three named narrowings); the api annotates its mappers and services with the inferred types (type only, nothing is parsed in the api, and a renamed field fails its typecheck), and the web clients parse the shared schemas, narrowing the budget currency to PHP, the report type to a report kind and the round status to signed-off or archived with `.extend`. `Figure.state` and the alert `severity` of `report-project-status.ts` are typed to the shared `MetricCell` state and `AlertSeverity`.\n- Response rules: `packages/shared/src/contracts/common/response-rules.test.ts` pins every `.strict()`, bound, enum member, nullable and optional field, format and literal of the 15 response objects (a mutation run over the three contract files left only `.finite()` on an already bounded number alive), and the reports client test refuses the stored report type `OTHER` and the round statuses `SUBMITTED` and `REVIEWED`.\n- Report kind grants: `packages/shared/src/rbac/report-kind-grants.ts` holds `reportKindGrants` and `grantedReportKinds`; the api list route, the api refusal and the web report menu read it, and `assertReportPermission` keeps its own rule for the beneficiary summary (the aggregate grants are refused by the report source with its own message). Parity tests over every role and every subset of the relevant grants (128 in shared and web, 256 in the api with six kinds each) passed against the old code before the swap and stay.\n- Workspaces: `live-reporting-workspace.tsx` went from 542 lines to a 33 line screen with two hooks, five components, `reports.copy.ts` (labels) and the menu rule in `reports.utils.ts`; `live-evaluation-workspace.tsx` went from 531 to 42 lines with one hook, six components and `evaluation.utils.ts` (`statusTone` typed to `StatusTone`). `same-lines` printed `lost 0` for both, eight characterization rows and six rows that pin the permission of each report read passed against the old code first, and the tests that moved kept every row and assertion (`count-it` and the title comparison).\n- Read key: `features/projects/budget/budget.reads.ts` holds `useBudgetsRead`, used by the budget module and the activity expense panel, whose two `finance-budgets` calls differed only in the enabled flag.\n- Tests: shared gained 5 files and 44 tests, api 1 file and 4 tests, web 2 files and 20 tests.\n- Routes: Middleware stayed at @M0@ kB in the cloud container and no route grew by more than 1 kB against the Task 0 build.\n- Decisions: the response contracts are types in the api and parsed in the web (ruling 2); the web narrows where the api type is wider (ruling 3); `assertReportPermission` keeps its own rule (ruling 5); the effect that clears the survey and round choice moves to the first reporting hook (ruling 8); the two `finance-budgets` calls were identical and share one hook (ruling 11). `budget-ledger.tsx` (327 lines) and `activity-expense-dialog.tsx` (304), moved verbatim by S6b, stay above the 300 line target (ruling 15); two guards no test pins stay unpinned: the `enabled` argument of the two `useBudgetsRead` calls (the budget module reads with the default, the activity panel with its flag, and `useAuthorizedRead` repeats the permission and scope check) and `.finite()` on the key figure percent (the bounds already refuse every value it refuses). No plan copy is removed in the slice (ruling 12).\n\nS6 is complete after S6c; the `dashboards <-> reports` import pair is left to S7.",
  1
 ],
 [
  "docs/qad-pathways.md",
  "| QAD-T120 | a renderer failure falls back to the pdfkit artifact and spreadsheet formats never launch Chromium | Sad | Reliability | PRD-F12 | G-F12-2, G-F12-4 | UC-F12-1 | `apps/api/src/modules/reports/reports.service.test.ts` |\n",
  "| QAD-T120 | a renderer failure falls back to the pdfkit artifact and spreadsheet formats never launch Chromium | Sad | Reliability | PRD-F12 | G-F12-2, G-F12-4 | UC-F12-1 | `apps/api/src/modules/reports/reports.service.test.ts` |\n| QAD-T121 | the report kind menu on the web and the report list and refusal checks in the api read one shared grant table, and every role is offered, listed and refused the same report kinds as before the table for every subset of the relevant grants | Happy | Security | PRD-F12 | G-F12-1 | UC-F12-1 | `packages/shared/src/rbac/report-kind-grants.test.ts`; `apps/api/src/modules/reports/reports.helpers.test.ts`; `apps/web/src/features/reports/reports.utils.test.ts` |\n",
  1
 ],
 [
  "docs/deferred-features.md",
  "| Split the evaluation workspace component | Deferred | Found 2026-10-06 | ",
  "| Split the evaluation workspace component | Resolved @DATE@ | Found 2026-10-06 | ",
  1
 ],
 [
  "docs/deferred-features.md",
  "| Extract a state hook and section components (start, scores, review). |",
  "| Done in the modularization S6c: `hooks/use-evaluation-workspace.ts` holds the state and handlers and `components/` one file per card, dialog set and score table. Was: extract a state hook and section components (start, scores, review). |",
  1
 ]
]
```

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g; s/@M0@/$(cat .tmp/s6c/m0)/g" .tmp/s6c/task7-edits.json
node .tmp/s6c/replace-exact.mjs .tmp/s6c/task7-edits.json
sed -i \
  -e '/^| MOD-05 /s/finance, evaluation and report clients by S6b\. |$/finance, evaluation and report clients by S6b, their response contracts in `packages\/shared` by S6c. |/' \
  -e '/^| MOD-06 /s/split in S6c\. |$/split by S6c. |/' \
  -e '/^| MOD-16 /s/the finance read key and the report kind grants left to S6c by S6b\. |$/the finance read key and the report kind grants by S6c. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
sed -i '/^| \[cr-pathways-codebase-modularization\]/s/S6a and S6b applied, S6c next/S6a, S6b and S6c applied, S7 next/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{70} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
grep -c "@DATE@\|@M0@" docs/cr-pathways-codebase-modularization.md docs/deferred-features.md || true
```

Expected: seven replacements in three docs files, five docs files changed in all, the three audit rows extended, the index status updated and no placeholder left:

```
7 replacements in 3 files
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 17 ++++++++++++++++-
 docs/deferred-features.md                           |  2 +-
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  1 +
 5 files changed, 22 insertions(+), 6 deletions(-)
 clients by S6b, their response contracts in `packages/shared` by S6c. |
ted by S6b, the live reporting and evaluation components split by S6c. |
ntract by S5c; the finance read key and the report kind grants by S6c. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b and S6c applied, S7 next |
docs/cr-pathways-codebase-modularization.md:0
docs/deferred-features.md:0
```

The index status line is the CR row; check that it now ends with `S6a, S6b and S6c applied, S7 next`. If an earlier slice changed the sentence so that the sed above does not match, edit the row by hand to say that S6c is applied and S7 is next; the grep prints the row either way. The last command prints `0` twice.

- [ ] **Step 2: Activity log**

`.tmp/s6c/activity-s6c.md` is the S6c section of the activity log, with the commit hashes of Tasks 1 to 6 as `@H1@` to `@H6@` (`@H3B@` is the grant swap, `@H4A@` to `@H4C@` the three reporting commits and `@H5A@`, `@H5B@` the two evaluation commits):

Create `.tmp/s6c/activity-s6c.md`:

```md
## @DATE@ Modularization S6c finance and reports components (S6c slice branch)
- Task 1 (@H1@): `packages/shared/src/contracts/{finance,evaluations,reports}/*-responses.ts` added with three test files and `contracts/common/response-rules.test.ts` (every rule of the 15 response objects), and the finance, evaluation and report mappers and services annotated with the inferred types (type only; `Figure.state` and the alert `severity` of `report-project-status.ts` narrowed to the shared types); three field renames fail the api typecheck.
- Task 2 (@H2@): the three web clients parse the shared schemas, narrowing the budget currency, the report type and the round status with `.extend`; `schema-moved.mjs` lost 0 for the three files; three rows added to the reports client test (a report of type `OTHER`, a submitted round and a reviewed round are refused); `lib/api/report-sections.ts` deleted and its six callers repointed.
- Task 3 (@H3@, @H3B@): `reportKindGrants` and `grantedReportKinds` in `packages/shared/src/rbac/report-kind-grants.ts` with parity tests over every role and every subset of the relevant grants (shared 128, api 256 with six kinds, web 128) that passed against the old code first; the api list route, the api refusal and the web menu then read the table, and a one-grant mutation fails all three suites; a row of the api service test refuses to export a report of a stored type that no route lists.
- Task 4 (@H4A@, @H4B@, @H4C@): the kind labels and the menu rule left `live-reporting-workspace.tsx` with their 8 test rows (`count-it` equal, titles lost 0), four characterization rows and six rows pinning the permission of each report read were added, and the 510 line workspace became a 33 line screen with `hooks/use-report-context.ts`, `hooks/use-report-generation.ts` and five components (`same-lines` lost 0, 156 added lines).
- Task 5 (@H5A@, @H5B@): four characterization rows were added to the evaluation workspace test and the 531 line workspace became a 42 line screen with `hooks/use-evaluation-workspace.ts`, six components and `evaluation.utils.ts` (`same-lines` lost 0, 149 added lines; `statusTone` typed to `StatusTone`).
- Task 6 (@H6@): `features/projects/budget/budget.reads.ts` holds `useBudgetsRead` for the two identical `finance-budgets` reads, with a test.
- Task 7: the change record (sections 3.3, 3.4, 3.6 and 9), the audit rows, QAD-T121, the deferred feature row and the index follow the S6c changes; no SAD routing change, because `packages/shared/src/rbac/**`, the api services, mappers and helpers, and `packages/shared/src/contracts/**` already route to the isolation checker and the beneficiary privacy guardian.
- Decisions: the S6c decisions are recorded in the change record section 9; no plan copy is removed in the slice, the controller removes the executed copies after the final merge of the series.
```

```bash
D=$(date +%F)
h() { git log -1 --format=%h --grep="$1"; }
sed -i -e "s/@DATE@/$D/" \
  -e "s/@H1@/$(h '^refactor: add the finance, evaluation and report response')/" \
  -e "s/@H2@/$(h '^refactor(web): parse the finance, evaluation and report responses')/" \
  -e "s/@H3@/$(h '^refactor: add the shared report kind grants')/" \
  -e "s/@H3B@/$(h '^refactor: read the report kind rules')/" \
  -e "s/@H4A@/$(h '^refactor(web): move the report kind labels')/" \
  -e "s/@H4B@/$(h '^test(web): pin the report generation')/" \
  -e "s/@H4C@/$(h '^refactor(web): split the live reporting workspace')/" \
  -e "s/@H5A@/$(h '^test(web): pin the evaluation workspace')/" \
  -e "s/@H5B@/$(h '^refactor(web): split the live evaluation workspace')/" \
  -e "s/@H6@/$(h '^refactor(web): share the finance-budgets read')/" \
  .tmp/s6c/activity-s6c.md
grep -c "@H[0-9A-C]*@\|@DATE@" .tmp/s6c/activity-s6c.md
cat .tmp/s6c/activity-s6c.md >> docs/activity-log.md
tail -9 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters):

```
0
## 2026-10-13 Modularization S6c finance and reports components (S6c slice branch)
- Task 1 (5115bf4): `packages/shared/src/contracts/{finance,evaluations,reports}/*-respons
- Task 2 (bee5c5b): the three web clients parse the shared schemas, narrowing the budget c
- Task 3 (c8bacc3, bc48566): `reportKindGrants` and `grantedReportKinds` in `packages/shar
- Task 4 (511502c, ae7a860, 7e9b4d5): the kind labels and the menu rule left `live-reporti
- Task 5 (80a279e, 7b4baaf): four characterization rows were added to the evaluation works
- Task 6 (3d0c066): `features/projects/budget/budget.reads.ts` holds `useBudgetsRead` for 
- Task 7: the change record (sections 3.3, 3.4, 3.6 and 9), the audit rows, QAD-T121, the 
- Decisions: the S6c decisions are recorded in the change record section 9; no plan copy i
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git commit -m "docs: record modularization S6c

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -8
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 6 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1470 files in <ms>. No fixes applied.
[<branch> <sha>] docs: record modularization S6c
 6 files changed, 31 insertions(+), 6 deletions(-)
 docs/activity-log.md                                |  9 +++++++++
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 17 ++++++++++++++++-
 docs/deferred-features.md                           |  2 +-
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  1 +
 6 files changed, 31 insertions(+), 6 deletions(-)
```


---

### Task 8: Full release gates

This slice opens no pull request: it is stacked below the next slice, and the final pull request of the series carries the DB replay and the other CI gates. The gates below run on the slice branch and are recorded in the activity log. No plan copy is removed here (ruling 12).

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 | tail -1
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s6c/build-routes.sh gates
cat .tmp/s6c/m0
node .tmp/s6c/compare-routes.mjs .tmp/s6c/routes-baseline.txt .tmp/s6c/routes-gates.txt | tail -6
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```

Expected: Biome clean, the typecheck and test summaries, the build exit code with the Middleware line against `M0`, the route comparison and the docs check:

```
Checked 1470 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  42 passed (42)
packages/shared test:       Tests  719 passed (719)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  153 passed | 10 skipped (163)
apps/api test:       Tests  2614 passed | 21 skipped (2635)
apps/web test:  Test Files  246 passed (246)
apps/web test:       Tests  2273 passed (2273)
      Tests  57 passed (57)
exit 0
ƒ Middleware                                                      <n> kB
<n>
/print/reports/[id]: 477 kB -> 478 kB (+1.0)
/projects/[projectId]/budget: 314 kB -> 315 kB (+1.0)
/projects/[projectId]/evidence: 314 kB -> 315 kB (+1.0)
/projects/[projectId]/monitor-evaluate: 314 kB -> 315 kB (+1.0)
routes 72, different 4

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```

The typecheck and test lines are the Task 0 baselines with these deltas: shared gains 5 files and 44 tests (the three response contract tests, the grant parity test and `response-rules.test.ts` with its 27 tests), api gains 1 file and 4 tests (`reports.helpers.test.ts` and the export row of `reports.service.test.ts`), web gains 2 files (`reports.copy.test.ts`, `budget.reads.test.ts`) and 20 tests (the three refusal rows of Task 2, the two parity rows of Task 3, the four reporting and four evaluation characterization rows, the six permission rows and the one budget read row; the moved rows of Task 4 change no count), and config, imports and sad equal `B_config`, `B_imports` and `B_sad`. The `ZodPipe` 5 s test and `beneficiary-detail-loader.test.tsx` are known timing flakes: rerun them alone if either fails. The route comparison is against the Task 0 build: four routes are 1 kB bigger at the printed precision (a route near a rounding edge can print as 0 or 1 kB bigger from one build to the next), none more, and Middleware equals `M0`. `docs:check` ends with the 6 baseline failures and 1 warning.

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S6c changes no migration, so the CI replay of the final pull request of the series (expect 171 PASS, 0 FAIL) is the gate when the replay cannot run here; record which one ran.

Expected: in a container that runs as root without the Supabase CLI the replay cannot start (where the user is not root and PostgreSQL 18 is present the script ends with `PHASE6_LOCAL_REPLAY=PASS`, which the replay did not see):

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; the Playwright results equal the earlier slices' gate runs (auth-navigation 27/27; the main suite fails only the same 9 tests as before: MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev:

- Open `/reports` as each role the demo seed has (project manager, M and E officer, finance officer, auditor, beneficiary-facing roles) and compare the report kind menu with dev: the kinds listed, their order and the disabled kinds must match (this is the check of the shared grant table, Task 3).
- Preview a report of each kind the role may read, generate one, download it, and open the print view of a report (`/print/reports/<id>`); open a saved report from the list and see the evaluation round select fill for the evaluation summary.
- Open a project's Budget tab, add and review an expense from the ledger, open the expense review drawer and the print receipt (`/print/receipts/<expenseId>`).
- Open a project's activities workspace, submit an expense with a receipt and review a pending one from the activity expense dialogs (the shared `finance-budgets` read of Task 6: both screens must show the same budget lines, and a role without budget line access sees no budget select).
- Open a project's monitor and evaluate tab, start an evaluation (an empty period must show the period message), score it, edit the narrative and see Submit disabled until it is saved, submit, return and sign it off, and recompute.
- Open the evidence tab and see the project's saved reports list.

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s6c
pnpm sad:check --base "$(cat .tmp/s6c/base-sha)" --head HEAD --output .tmp/sad/s6c/manifest.json > .tmp/sad/s6c/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s6c/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0, writes the manifest, and the roles and their path counts are (they move by a few paths if the branch holds other slices; none is above 60 here, so no role needs a split):

```
exit 0
organization-isolation-checker 6
beneficiary-privacy-guardian 13
design-qa-agent 54
```

`.tmp/sad/s6c/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; a role above 60 paths goes out in packets of at most 60, which none needs here), transcribe each reply into `.tmp/sad/s6c/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s6c/assemble.mjs`, run `node .tmp/sad/s6c/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s6c/base-sha)" --head HEAD --reviews .tmp/sad/s6c/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The replay could not dispatch the roles (no subagents in the replay copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results: per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice. The replay bullet, to adapt with your own numbers (every figure from the Step 1 output):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 719, imports 94, api 2614 passed and 21 skipped, web 246 files and 2273 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB; against the Task 0 build 4 routes are 1 kB bigger and none more; local DB replay (initdb refuses root), seeds, e2e and browser smoke pending local run; SAD manifest of 6, 13 and 54 paths with sign-off pending; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git commit -m "docs: record modularization S6c release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
```

Expected: one file, one line added:

```
[<branch> <sha>] docs: record modularization S6c release gate results
 1 file changed, 1 insertion(+)
 docs/activity-log.md | 1 +
 1 file changed, 1 insertion(+)
```

The series continues in the next slice: no plan copy is removed here, and after the developer merges the series the controller removes the executed plan copies in `docs/superpowers/plans` (and their index rows) with a sed that matches only those rows; the `docs/handoff` copies and rows stay.
