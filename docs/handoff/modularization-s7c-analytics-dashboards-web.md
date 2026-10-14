# S7c Analytics and Dashboards Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard and analytics web reads their own client modules, lay out `features/analytics` as `components/`, `hooks/` and a public `index.ts`, and cut the 1745-line `analytics-dashboard.tsx` (one 1206-line function, MOD-06) and its 1691-line test into panels, copy, helpers, five read hooks and four sections, with characterization tests written before any code moves and no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S7c is the first of two web slices for analytics and dashboards (S7a: rules, S7b: api and shared). The eight dashboard and analytics members of `pathwaysClient` become `dashboardsClient` and `analyticsClient` in `lib/api`, written for the executor and run through the same test tables as the code they replace before that code goes (Task 1); the callers, the mocks and the insights client follow by script with exact counts (Task 2). The folder is laid out with one `git mv` map, one specifier rewrite and one index in a single commit, and the build is measured before and after (Task 3). The component is then cut in four commits, each proven by `same-lines.mjs` (`lost 0`) and by the dashboard tests: the 67-case test is split by concern around one fixture module first (Task 4), the private panels, the copy, the helpers and the alert count leave the file (Task 5), the SADDD, descriptive, survey and timeline reads and the export move into five hooks called at the original effect positions (Task 6), and four sections of the markup become components (Task 7). Behavior that only an old-versus-new comparison pinned gets a concrete assertion before the old code goes, and every new test is mutated once and must fail. The slice stops at ten tasks (Tasks 0 to 9); the rest of the work is outlined as S7d at the end of this plan (ruling 1).

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, React Testing Library.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 and 9, including the S7b disposition and its "Deferred to S7c" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05 for the clients, MOD-06 for the oversized component, MOD-15 and MOD-17 for the surface and names), and the S7c outline at the end of `docs/handoff/modularization-s7b-analytics-dashboards.md`, which this plan replaces (rulings 1, 2, 5, 6 and 10 say where it differs).

## Rulings

Controller rulings for S7c. Each was checked in a replay from the S7b tip with S4c, S5b, S5c and S6c below it; Task 0 recounts them.

1. **Ten tasks, then S7d.** The outline had seven tasks and put the `features/dashboard` split, the dashboard index and the read keys in the same slice. Written out, the analytics half alone is Tasks 0 to 9, so the plan splits where the work does: S7c (this plan) ends with the analytics component cut and the records and gates; the `features/dashboard` layout, the `role-dashboard.tsx` split, the dashboard index and the remainder of the analytics shell (filter bar, analysis panel, scope state) are the S7d outline at the end of this plan. Task 8 names both in CR 3.7. Cost if wrong: a plan merge.
2. **The clients are copies written as object literals.** `dashboardsClient` (`getDashboardActionCounts`, `getRoleOverview`, `getMonitoringDashboard`, `getSadddDashboard`, `getDashboard`) in `lib/api/dashboards.ts` and `analyticsClient` (`getDescriptiveAnalytics`, `getSurveyAnalytics`, `getTimelineAnalytics`, with `descriptiveAnalyticsSearch` and `getAnalyticsExportPreview` as module exports) in `lib/api/analytics.ts` keep the paths, the query strings, the forced survey view, the strict response schemas and the foundation request of the members they replace (`requestFoundation` of `lib/api/core/request.ts`). The monitoring query helper and the export preview schema become private to their files. The insights client already is its own module (`lib/services/analytics-insights-client.ts`, outline Task 1 said "the insights fetchers"); it only moves to `lib/api/analytics-insights.ts` with its test, which is written now. Cost if wrong: a file name.
3. **Characterization before removal: both clients run the same cases.** Task 1 writes `dashboards.test.ts` (21 cases) and `analytics.test.ts` (15) as `describe.each` tables over `pathwaysClient` and the new client with the real foundation fetch and header path (a stubbed `fetch`, the cookie, a mocked environment), passing against the code being replaced before it goes, and `analytics-insights-client.test.ts` (12) against the insights client before it moves. A mutation of each path, the program filter, the forced survey view, the export bound, the view parameter, the period end and the parse of the home response fails a case. Task 2 drops the old rows and keeps the new ones. Cost if wrong: none.
4. **Three old cases are deleted, not moved.** The dashboard read without a session, the SADDD cross-filter refusal and the vanished session were cases of `pathways-client.test.ts` and `pathways-client.monitoring.test.ts` (the latter is deleted whole). Each is already a row of `dashboards.test.ts` in Task 1, so Task 2 removes the old copy; `test-titles.mjs compare` prints `lost 0` over the 134 titles of the seven test files that change, because the same titles exist in the new files. Cost if wrong: none.
5. **Layout and names.** 23 files move by `layout-map.json` (the map prints in Task 3): 14 files into `components/`, `use-analytics-insights.ts` and `use-project-map.ts` into `hooks/`, and `use-monitoring-read.ts` to `src/hooks/` (ruling 6); the four helper files that no folder names get the CR 3.5 `.utils` suffix (`aggregate-chart-options`, `analytics-location`, `analytics-reporting-periods`, `kpi-rows`). Test files follow the file they test. The folder is far below 30 files, so there are no subfolders. The project map card stays in analytics (S1 kept its UI here). Cost if wrong: a file name.
6. **`use-monitoring-read` leaves the feature for `src/hooks/`.** The outline said `project-indicators-workspace.tsx` imports it through the analytics index. `features/analytics` already imports `features/projects` (the map card, the survey panel and the helpers), so an index import from the projects feature would make the two features import each other. A shared hook belongs in `src/hooks/` with `use-authorized-read`; the workspace, its two tests and the e2e spec change one specifier. Cost if wrong: a specifier.
7. **The test is split first, and the split is proven line by line.** `analytics-dashboard.test.tsx` (1691 lines at the S7b tip and 1693 when this task starts, 67 cases, one 233-line mock header and one `beforeEach`) becomes `test/fixtures/analytics-dashboard-fixtures.tsx` (mocks, builders, the two default setups) and six tests of 106 to 416 lines. Every case body is copied by line range (`cut.mjs` with a pinned hash), `same-lines.mjs` says `lost 0` before Biome formats, `test-titles.mjs compare` says `lost 0` over the 67 titles, and `count-it.mjs` gives 60 `it` blocks and 258 assertions before and after. The unchanged cases then run against the unsplit component, which is the guarantee Tasks 5 to 7 rely on. Cost if wrong: none.
8. **Panels, copy, helpers and reads move verbatim; a helper test is added.** `ChartPanel`, `SurveyAnalyticsPanel`, `TimelineAnalyticsPanel` and `DescriptiveStatisticsTable` become components; the constants go to `analytics.copy.ts`, the pure helpers to `analytics.utils.ts` and `countOpenAlerts` to `analytics.reads.ts` (the cards test imports it from there). `analytics.utils.test.ts` (11 tests) is written against the helpers and mutated. The four moved panels, the three copy lists and the alert request were pinned only by the old-versus-new comparison (a mutation survey of the six moved files left 109 of 161 mutants alive), so Step 4b adds `analytics-panels.test.tsx` (25 tests), `analytics.copy.test.ts` (3) and one assertion of the cards test, and mutates them. Two contract-test paths follow the moved text. Cost if wrong: a file name.
9. **Five hooks are called at the original effect positions; the monitoring effect stays.** `useSadddDashboard`, `useDescriptiveAnalytics`, `useSurveyAnalytics`, `useTimelineAnalytics` and `useAnalyticsExport` return the names the component already used (`saddd`, `sadddError`, `exporting`, ...), and each is called where its state and effect were declared, so the order of effects, the dependency lists and the aborts do not change. The monitoring effect stays in the component because the project data effect also writes `monitoring`. The hooks are written with `'use client'`. Before the move two component cases pin the SADDD and descriptive Retry buttons, a new `use-analytics-export.test.ts` pins the export guards, and the pre-move and post-move mutation runs list their survivors: four reset calls of `handleProjectChange` that the effects repeat in the same commit are recorded as equivalent. Cost if wrong: a re-inline.
10. **Four sections are extracted; the filter bar and the analysis panel are S7d.** `SadddAnalysisPanel` (7 props), `DescriptiveStatisticsPanel` (5), `OpenAlertsPanel` (6) and `AnalyticsSummaryCards` (13) have few inputs and no state, so they move by line range with props named after the identifiers the markup uses. Nine new cases (`analytics-dashboard.summary.test.tsx`) pin the card values and the two empty states of the descriptive panel against the unsplit component first, because the existing tests did not reach eight of the props. The filter bar and the main analysis panel read about 25 names each; they need the scope state grouped first (a hook for the project, period and view state), which is a behavior-sensitive move and is the first task of S7d. The shell stays above 500 lines until then and the records say so. Cost if wrong: a later split.
11. **No new SAD routing.** `scripts/sad/check.ts` already routes `apps/web/src/lib/api/**/*.ts` to `beneficiary-privacy-guardian` and `apps/web/src/**` to `design-qa-agent`, so the new clients and the moved and split files are covered. Cost if wrong: one glob.
12. **No pull request, no plan-copy removal, local-only checks pending.** The developer asked for one pull request into `dev` after every slice is implemented, so S7c gets none of its own: the branch `claude/modularization-s7c-9ept8o` stays stacked on `claude/modularization-s7b-9ept8o`. The seeds, dev servers, e2e runs and the browser smoke are recorded as "pending local run" (Task 9). The `docs/superpowers/plans` copies of earlier slices stay, and so does this plan's copy (it holds the S7d outline); the controller removes executed copies after the final merge. Cost if wrong: none.
13. **Not done in S7c (recorded in the change record section 9):** the `features/dashboard` work (S7d); the filter bar, analysis panel and scope state of the analytics shell (S7d); the project map card stays whole; `use-analytics-insights.ts` and `participation-breakdown-panel.tsx` are untouched apart from their folder; MOD-16 read keys (S7d); and the `lib/services/*` files that no slice owns stay for W1. Cost if wrong: a later split.
14. **Cross-plan.** S4c, S5b, S5c and S6c are below S7b on the branch, and the replay of this plan ran on top of them: `pathways-client.ts` is 330 lines (not 639) and its test 1350 (not 1348) because the earlier slices took their members out, 47 files name `lib/services/pathways-client` and 36 mock factories stub it, `indexedFeatures` already lists `collection`, and `collection-workspace.tsx` has moved, so the `--noUnusedLocals` baseline names `use-collection-state.ts`; Task 0 recounts, every hash that a cut plan pins is printed first so a mismatch stops the task with the value to compare, and the components of other features that mock `pathways-client` are counted by `mock-scan.mjs` before and after Task 2. Cost if wrong: a later Task 0 stops on a count.

## Interfaces assumed from earlier sub-projects

- S7b: the api routes, permissions and response bodies of dashboards and analytics are unchanged, and the shared contracts the web reads sit in `contracts/analytics`, `contracts/dashboards` and `contracts/projects`, imported only through `@pathways/shared`; the CR section 9 paragraph "S7b applied" with its "Deferred to S7c" line.
- S7a: `lib/api/rules.ts` and `features/rules` with its index (analytics and rules no longer import each other); `rules` in `indexedFeatures` and `optimizePackageImports`.
- S6b: `ownedJsonRead` in `lib/api/core/owned-json-read.ts`, the `describe.each` client test pattern; S4b and S3: `lib/api/beneficiaries.ts` and `lib/api/indicators.ts` as models of a client file and of mocks that name `@/lib/api/*`; F4b: `requestFoundation` in `lib/api/core/request.ts`, `PathwaysClientError`, `useAuthorizedRead` and `lib/format/*`.
- S1b: `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`; S2b and S8b method: the `.schema.ts` and `.utils.ts` suffixes and the cut-plan method (`cut.mjs` with a pinned hash, `same-lines.mjs`).

## Produces (names later plans consume)

- `dashboardsClient` (`lib/api/dashboards.ts`), `analyticsClient`, `descriptiveAnalyticsSearch` and `getAnalyticsExportPreview` (`lib/api/analytics.ts`), the insights client in `lib/api/analytics-insights.ts`; `pathwaysClient` no longer has the eight members, its private monitoring helper or the two analytics exports.
- `features/analytics/{components,hooks}` with `analytics.copy.ts`, `analytics.utils.ts`, `analytics.reads.ts`, the four `.utils` helpers and an `index.ts` exporting `AnalyticsDashboard`, `IndicatorProgressChart`, `InsightStatus`, `RestrictedInsight`, `ParticipationBreakdownPanel`, `InsightsSelection`, `canReadInsight`, `useParticipationBreakdown`, `activeIndicators` and `progressRows`; `analytics` is in `indexedFeatures` and in `optimizePackageImports`.
- Hooks `useSadddDashboard`, `useDescriptiveAnalytics`, `useSurveyAnalytics`, `useTimelineAnalytics`, `useAnalyticsExport` and components `SadddAnalysisPanel`, `DescriptiveStatisticsPanel`, `OpenAlertsPanel`, `AnalyticsSummaryCards` (S7d starts from these).
- `useMonitoringRead` in `apps/web/src/hooks/use-monitoring-read.ts`; test fixture `analytics-dashboard-fixtures.tsx` in `apps/web/src/test/fixtures/`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or export changes. The only removals are the moved duplicates (the old client members, their old test rows and three old cases that the new tables pin). Production code stays free of new dependencies; `apps/api` and `packages/shared` are not changed by this slice.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; once Task 3 lands every file outside `features/analytics` imports the feature only through its index, and a non-test fixture imports a feature through its index too (the direction test exempts only tests and the feature itself).
- File moves use `git mv` (the move script does it) and are committed apart from the cuts; the cut files are checked with `.tmp/s7c/same-lines.mjs` (`lost 0`) before Biome formats them, and every cut plan pins the hash of its source (`cut.mjs` writes nothing when the hash differs: stop and report NEEDS_CONTEXT with the printed hash unless the file was changed by a slice below this one, in which case recount the cut ranges against the new file before continuing).
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the new tests use the fictional ids `79300000-...`, `79400000-...` and `79500000-...`, the token `synthetic-test-token` and the fictional names already in the existing tests.
- Characterization tests run against the old and the new client before a client moves; before old code goes, every behavior pinned only by an old-versus-new comparison gets a concrete assertion; every move is proven by script (`lost 0`); a split or rewritten test keeps every row and assertion; every new test is mutated once and must fail.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s7c/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`, where S5b moved the first). `trim-imports` counts a name in a regex literal or a property key as used, so a cut plan may carry a `drop=` list for the rest.
- Every analytics component and hook file starts with `'use client'`: `cut.mjs` drops the line from `@imports` and writes nothing in its place, so the cut plans write it by hand, and the production build is the check that catches a missing one.
- Vitest refuses `export const x = vi.hoisted(...)`: a fixture exports its hoisted objects through one `export { ... }` statement. A mocked module's binding is not handed on by a re-export, so the fixture re-binds it by a constant (`import { rulesHumanClient as rules } ...; export const rulesHumanClient = rules`). A `vi.mock` call inside an imported fixture is registered before the later imports of the test file, which is why every test imports the fixture first.
- Mock factories name modules by the specifier the code under test imports; after Task 2 no factory stubs a moved member on `pathwaysClient` and a factory left with nothing keeps an empty `pathwaysClient: {}` so the real client is never loaded.
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason. Biome sorts `@/lib` before `@/test`.
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit. Never run `pnpm build` at the root, `pnpm --filter @pathways/api build` or `prisma generate`: they run `prisma generate`, which writes into the shared `node_modules`; this slice builds only the web app, through `.tmp/s7c/build-routes.sh`, and the api build would be `pnpm --filter @pathways/api exec nest build`.
- Run `.tmp/s7c/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to five minutes, so give the command a ten minute timeout. Bash blocks share no shell state: every block sets the variables it uses.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s7c/` (gitignored) and are never committed; logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` when run from there, and relative to the repository root when run through `pnpm --filter @pathways/web exec vitest run`.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- Known timing flakes of the full test runs on a loaded machine: the `ZodPipe` 5 s test, `beneficiary-detail-loader.test.tsx`, timeouts of `collection-workspace` tests, `imports.service.test.ts` (the duplicate metadata keys case) and one case of `pnpm sad:test`; rerun the file alone before treating a failure as real, and rerun any run that ends without its summary line (a killed vitest process prints none). If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the figures Task 0 marks as depending on the slices below (recount those and carry on with the recounted values).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run (`YYYY-MM-DD` is the day Task 0 runs); every other figure is the replay and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared` and `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Work in the repository root on `claude/modularization-s7c-9ept8o`, stacked on `claude/modularization-s7b-9ept8o` (S3b, S4a, S5a, S6a, S4b, S4c, S5b, S6b, S5c, S6c, S7a and S7b below it); no new worktree and no new branch. All paths are relative to the repository root. Only the controller pushes branches, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence.
- Commit with `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m` and the trailers on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Each bash block is run on its own and keeps no shell variables from the block before: a block that uses `$D`, `$F`, `$C` or `$NEW` sets it first.
- This slice opens no pull request, merges nothing into `dev` and removes no plan copy: it ships as part 3 of 3 stacked pull requests into `dev` that the controller opens after the last slice, which carry the replay and the other CI gates, so Task 9 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 9).

## Review Focus

1. Every moved client member must send the same request: path, encoded ids, abort signal, query string and method, and must refuse the same inputs before any request. Task 1 pins all of it on the old and the new client, and the strict response schemas are checked by rows that pass against both.
2. A test stub left on a removed `pathwaysClient` member would hand a component `undefined` at run time. Task 2 scans every factory, compares every test title (`lost 0`) and runs the whole web suite.
3. The component cuts must be verbatim moves: `same-lines.mjs` says `lost 0` for the component (1745 lines), the added lines are only signatures, props and calls, and behavior that the old tests did not pin is pinned by tests written against the unsplit code (Tasks 4 and 6), by tests of the moved panels, copy lists and alert request (Task 5 Step 4b) and by mutation runs.
4. The hooks must not reorder effects: each is called at the position of the state it replaced, keeps its dependency list and its abort, and the Retry, reset and export-guard cases pin the wiring. The recorded survivors (four reset calls) are equivalent because the effects clear the same state in the same commit.
5. The component is a client component tree: every file that uses state or an effect carries `'use client'`, and the production build of Task 3 and the gates of Task 9 are the check.
6. A route bundle must not grow when files move, and a route page that imports the analytics index must not load a barrel. Task 3 compares a freshly measured table and Task 9 compares against all three tables (a route may print 1 kB more or less from one build to the next at the printed precision; the replay printed `/analytics` 1 kB bigger after Task 7).
7. Outside `features/analytics` no file may import a leaf of it; `import-direction.test.ts` and `git grep` in Task 3 check it, and `features/projects` and `features/analytics` must not import each other through the index in a cycle (ruling 6).

## File map

| Path | Role after S7c |
|---|---|
| `apps/web/src/lib/api/dashboards.ts`, `analytics.ts`, `analytics-insights.ts` and their tests | the clients (new in Task 1; the insights client moves in Task 2; tests keep only the new client after Task 2) |
| `apps/web/src/lib/services/pathways-client.ts` and its test | the eight members, the monitoring helper and the two analytics exports removed (Task 2) |
| `apps/web/src/lib/services/pathways-client.monitoring.test.ts` | deleted (Task 2) |
| `apps/web/src/features/analytics/` | `components/`, `hooks/`, `analytics.{copy,utils,reads}.ts`, four `.utils` helpers, `index.ts` (Tasks 3 to 7) |
| `apps/web/src/features/analytics/components/analytics-dashboard.tsx` | the shell, from 1745 lines to the figure Task 7 prints (Tasks 5 to 7) |
| `apps/web/src/features/analytics/hooks/` | `use-saddd-dashboard`, `use-descriptive-analytics`, `use-survey-analytics`, `use-timeline-analytics`, `use-analytics-export`, `use-analytics-insights`, `use-project-map` and the tests of the five new hooks (Task 6) |
| `apps/web/src/hooks/use-monitoring-read.ts` | moved out of the feature (Task 3) |
| `apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx` | the shared mocks and builders of the six dashboard tests (Task 4) |
| `apps/web/src/features/analytics/components/` four section components, `analytics-dashboard.summary.test.tsx` | `saddd-analysis-panel`, `descriptive-statistics-panel`, `open-alerts-panel`, `analytics-summary-cards` and the pins written before them (Task 7) |
| `apps/web/src/features/dashboard/*`, `apps/web/src/app/**/page.tsx` | import the analytics index where they used leaf paths (Task 3) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`, `apps/web/e2e/monitoring-read.spec.ts`, `features/ui-copy-cleanup.contract.test.ts` | follow the layout (Tasks 3, 5 and 7) |
| `docs/` change record, audit, QAD, deferred features, index, activity log | records (Task 8) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s7c-analytics-dashboards-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s7c/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `count-it.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `cut.mjs`, `mock-scan.mjs`, `test-titles.mjs`, `move-modules.mjs`, `index-imports.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S7b and the slices below it, and record the base**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s7c/files .tmp/s7c/out .tmp/s7c/before
git rev-parse HEAD > .tmp/s7c/base-sha
for b in s7b s7a s6c s5c s6b s5b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S6c record: $(grep -c '^S6c applied' $CR)"
echo "S7a record: $(grep -c '^S7a applied' $CR)"
echo "S7b record: $(grep -c '^S7b applied' $CR)"
test -f apps/api/src/modules/analytics/analytics.module.ts && test ! -d packages/shared/src/monitoring && test -d packages/shared/src/contracts/dashboards && test -d packages/shared/src/contracts/analytics && echo "S7b api and shared present"
test -f apps/web/src/lib/api/rules.ts && test -f apps/web/src/features/rules/index.ts && echo "S7a web present"
test -f apps/web/src/lib/api/core/owned-json-read.ts && test -f apps/web/src/lib/api/reports.ts && echo "S6b present"
test -f apps/web/src/lib/api/beneficiaries.ts && test -f apps/web/src/lib/api/indicators.ts && test -f apps/web/src/lib/api/core/request.ts && echo "S4b, S3 and F4b present"
test ! -f apps/web/src/lib/api/dashboards.ts && test ! -f apps/web/src/lib/api/analytics.ts && echo "S7c not started"
test -f docs/handoff/modularization-s7c-analytics-dashboards-web.md && echo "handoff copy present"
grep -c "indexedFeatures" apps/web/src/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
```


Expected:

```text
claude/modularization-s7c-9ept8o
s7b branch is an ancestor of HEAD
s7a branch is an ancestor of HEAD
s6c branch is an ancestor of HEAD
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S6c record: 1
S7a record: 1
S7b record: 1
S7b api and shared present
S7a web present
S6b present
S4b, S3 and F4b present
S7c not started
handoff copy present
3
1
2026-10-13-modularization-s3b-indicators-web.md
2026-10-13-modularization-s4-beneficiaries.md
2026-10-13-modularization-s4b-beneficiaries-web.md
2026-10-13-modularization-s4c-beneficiaries-components.md
2026-10-13-modularization-s5-collection.md
2026-10-13-modularization-s5b-collection-web.md
2026-10-13-modularization-s5c-collection-components.md
2026-10-13-modularization-s6-finance-reports.md
2026-10-13-modularization-s6b-finance-reports-web.md
2026-10-14-modularization-s6c-finance-reports-components.md
2026-10-14-modularization-s7-analytics-rules.md
2026-10-14-modularization-s7b-analytics-dashboards.md
```


`git status --short` prints nothing and the branch is `claude/modularization-s7c-9ept8o`. Then one ancestor line for each stacked branch (S7b, S7a, S6c, S5c, S6b, S5b), the three record counts, the marker lines (the last two say that S7c has not started and that the controller staged this plan), the two counts of the earlier web slices and the plan listing. A different branch, a line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a record count of `0`, a missing marker line, a missing `S7c not started` or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/` refs, so the check works with either. `.tmp/s7c/base-sha` is the head the branch has when Task 0 starts (the S7b tip, any docs-only commits after it and the controller commit that stages this plan), so it is the base of the SAD check in Task 9; never compare it with a fixed hash, and do not anchor any check on a hash or a line number of the activity log. Dependencies are already installed in the cloud container; do not run pnpm install. Write down the listed modularization plans; an executed plan that is still listed is reported, not removed here.

- [ ] **Step 2: Create the helper scripts**

Create each file with the Write tool exactly as printed. They live in `.tmp/s7c/`, which is gitignored, and are never committed. `build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s7c/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s7c/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s7c/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s7c/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s7c/routes-$1.txt
grep Middleware .tmp/s7c/routes-$1.txt
```


`compare-routes.mjs` compares two route tables (route, size and First Load JS):

Create `.tmp/s7c/compare-routes.mjs`:

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


`replace-exact.mjs` applies a JSON list of `[file, from, to, count]` replacements and writes nothing unless every count matches:

Create `.tmp/s7c/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s7c/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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


`count-it.mjs` counts `it`, `describe` and `expect` calls in test files:

Create `.tmp/s7c/count-it.mjs`:

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


`trim-imports.mjs` removes the imported names a file no longer uses (Biome 1.9 does not):

Create `.tmp/s7c/trim-imports.mjs`:

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


`same-lines.mjs` proves a move: it fails when a declaration line of the original is missing from the new files, and `--list` prints the lines the new files add (trailing commas do not count, so an object literal method equals a class method):

Create `.tmp/s7c/same-lines.mjs`:

```js
// Fails when a line of the original is lost; counts the lines the new files add (signatures, props, calls) and lists them with --list.
// Usage: same-lines.mjs <original> [--also <file>]... <new file>... [From=To | From ==> To]... [--list]; an --also file is part of the original (a module that already existed and received lines), and ' ==> ' splits a rename whose text holds '='.
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
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => (arg.includes(' ==> ') ? arg.split(' ==> ') : arg.split('=')))
const files = rest.filter((arg) => !arg.includes('='))
// Index of the first line after the leading import block (blank lines, the test environment comment, 'use client', single and multi-line imports and re-exports).
const bodyStart = (lines) => {
  let open = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (open) open = !/^\}\s*from\s/.test(line)
    else if (/^(?:import|export)\s+(?:type\s+)?\{\s*$/.test(line)) open = true
    else if (!/^(?:import\b|export\s.*\sfrom\s|\/[*\/]\s*@vitest|\s*$|'use client')/.test(line)) return i
  }
  return lines.length
}

// Declaration lines after the import block, trimmed, with renames undone, export keywords and trailing commas dropped.
const body = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(bodyStart(lines))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, '').replace(/,$/, ''))
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


`cut.mjs` builds files from verbatim line ranges of one source file and stops when the source hash is not the one the plan was written for:

Create `.tmp/s7c/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s7c/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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


`mock-scan.mjs` lists the test mock factories and the files that name a module and members:

Create `.tmp/s7c/mock-scan.mjs`:

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


`test-titles.mjs` runs test files and saves or compares their sorted test titles (every `it.each` row included):

Create `.tmp/s7c/test-titles.mjs`:

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


`move-modules.mjs` runs `git mv` for a JSON move map and rewrites every specifier, `vi.mock` path and contract-test path that named a moved module:

Create `.tmp/s7c/move-modules.mjs`:

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
  // A type argument such as typeof import('./x') sits in the lead of a vi call, so the lead is rewritten the same way.
  const rewrite = (source) =>
    source.replace(pattern, (whole, lead, quote, spec) => {
      const module = target(oldFile, spec)
      const inner = lead.includes('import(') ? rewrite(lead) : lead
      if (module === null) return `${inner}${quote}${spec}${quote}`
      const moved = forward.get(module) ?? module
      if (moved === module && oldFile === newFile) return `${inner}${quote}${spec}${quote}`
      const next = specifier(newFile, spec, moved)
      if (next === spec) return `${inner}${quote}${spec}${quote}`
      count++
      return `${inner}${quote}${next}${quote}`
    })
  const text = rewrite(readFileSync(file, 'utf8'))
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


`index-imports.mjs` points the app route imports of a feature's leaf modules at its `index.ts`:

Create `.tmp/s7c/index-imports.mjs`:

```js
// Points app route imports of an indexed feature's leaf modules at the feature index, merging the imports of one feature in a file into one statement.
// Usage: node .tmp/s7c/index-imports.mjs <feature>... ; every app file is checked, and a default import of a leaf stops the run.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const features = process.argv.slice(2)
const app = path.resolve('apps/web/src/app')

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

let files = 0
let statements = 0
for (const file of walk(app)) {
  let text = readFileSync(file, 'utf8')
  let changed = false
  for (const feature of features) {
    const leaf = new RegExp(`^import (type )?\\{([^}]*)\\} from '@/features/${feature}/[^']+'\\n`, 'gm')
    const found = [...text.matchAll(leaf)]
    if (!found.length) continue
    if (found.some((match) => match[1])) throw new Error(`${file}: type-only leaf import of ${feature}`)
    const names = found.flatMap((match) => match[2].split(',').map((name) => name.trim()).filter(Boolean))
    let first = true
    text = text.replace(leaf, () => {
      if (!first) return ''
      first = false
      return `import { ${names.join(', ')} } from '@/features/${feature}'\n`
    })
    statements += found.length
    changed = true
  }
  if (!changed) continue
  files++
  writeFileSync(file, text)
}
console.log(`${statements} leaf imports in ${files} app files now name a feature index`)
```


- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s7c/build-routes.sh
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm typecheck > .tmp/s7c/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s7c/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s7c/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s7c/m0
cat .tmp/s7c/m0
```


Expected:

```text
shared built
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  46 passed (46)
packages/shared test:       Tests  731 passed (731)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  158 passed | 10 skipped (168)
apps/api test:       Tests  2628 passed | 21 skipped (2649)
apps/web test:  Test Files  249 passed (249)
apps/web test:       Tests  2290 passed (2290)
      Tests  58 passed (58)

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      103 kB
103
```


The test lines are the baselines the later tasks state their deltas against (`B_config`, `B_shared`, `B_imports`, `B_api`, `B_sad`, `B_web`): config 19, shared 731 in 46 files, imports 94, api 2628 passed and 21 skipped in 158 files, sad 58 and web 249 files and 2290 tests, with S4c, S5b, S5c and S6c below this slice. They depend on the slices below this one, so recount them and carry on with the recounted values: the figures your run prints win over the ones here, and every later Expected line is stated for this baseline, so read its delta from `B_web` and not its absolute value. The `docs:check` tail is the baseline of 6 failures and 1 warning, which is not a stop: the failures are in files this slice does not touch. The build prints `exit 0` and the Middleware line, and `m0` holds its size in kB (`M0`, 103 in the replay, 102 in another clone of the same code: it varies by 1 kB between builds). The `sad:test` run can print one failed test when the machine is heavily loaded; rerun `pnpm sad:test` alone. Write the figures down with the Write tool as `.tmp/s7c/baseline.txt` (one line each: `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`), because later bash blocks keep no shell variables and every later count is `B_` plus a delta. The baseline build can take ten minutes; if it exits non-zero, copy `apps/web/.env.example` to `apps/web/.env.local` and retry.

```bash
F=apps/web/src
for d in analytics dashboard; do git ls-files $F/features/$d | wc -l; done
wc -l $F/features/analytics/analytics-dashboard.tsx $F/features/analytics/analytics-dashboard.test.tsx $F/features/dashboard/role-dashboard.tsx $F/lib/services/pathways-client.ts $F/lib/services/pathways-client.test.ts $F/lib/services/pathways-client.monitoring.test.ts $F/lib/services/analytics-insights-client.ts
grep -c "useState" $F/features/analytics/analytics-dashboard.tsx
M='getMonitoringDashboard|getDashboardActionCounts|getRoleOverview|getSadddDashboard|getDescriptiveAnalytics|getSurveyAnalytics|getTimelineAnalytics|getDashboard\b'
git grep -lE "pathwaysClient\s*\.($M)" -- $F ':!'$F'/lib/services/pathways-client*'
git grep -lE "(getAnalyticsExportPreview|descriptiveAnalyticsSearch)" -- $F ':!'$F'/lib/services/pathways-client.ts'
git grep -l "lib/services/pathways-client" -- $F | wc -l
node .tmp/s7c/mock-scan.mjs lib/services/pathways-client xx | tail -1
git grep -l "lib/services/analytics-insights-client" -- $F
git grep -n "use-monitoring-read" -- apps | cut -c1-130
git grep -nE "features/(analytics|dashboard)(/|')" -- $F/app $F/features ':!'$F'/features/analytics' ':!'$F'/features/dashboard' | grep -v "ui-copy-cleanup\|use-monitoring-read" | cut -c1-130
git hash-object $F/lib/services/pathways-client.ts $F/lib/services/pathways-client.test.ts $F/lib/services/pathways-client.monitoring.test.ts $F/features/analytics/analytics-dashboard.tsx $F/features/analytics/analytics-dashboard.test.tsx $F/features/ui-copy-cleanup.contract.test.ts $F/import-direction.test.ts | cut -c1-8
```


Expected:

```text
23
27
  1745 apps/web/src/features/analytics/analytics-dashboard.tsx
  1691 apps/web/src/features/analytics/analytics-dashboard.test.tsx
   693 apps/web/src/features/dashboard/role-dashboard.tsx
   330 apps/web/src/lib/services/pathways-client.ts
  1350 apps/web/src/lib/services/pathways-client.test.ts
    45 apps/web/src/lib/services/pathways-client.monitoring.test.ts
    37 apps/web/src/lib/services/analytics-insights-client.ts
  5891 total
38
apps/web/src/features/dashboard/action-kpi-row.tsx
apps/web/src/features/dashboard/pinned-charts.tsx
apps/web/src/features/dashboard/role-overview/role-overview.tsx
apps/web/src/features/dashboard/role-overview/use-role-overview.ts
apps/web/src/features/analytics/analytics-dashboard.test.tsx
apps/web/src/features/analytics/analytics-dashboard.tsx
47
factories 36, naming 0
apps/web/src/features/analytics/use-analytics-insights.ts
apps/web/e2e/monitoring-read.spec.ts:17:        import { useMonitoringRead } from '../src/features/analytics/use-monitoring-read';
apps/web/src/features/projects/indicators/components/project-indicators-workspace.reload.test.tsx:58:vi.mock('@/features/analytics
apps/web/src/features/projects/indicators/components/project-indicators-workspace.test.tsx:37:vi.mock('@/features/analytics/use-mo
apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx:19:import { useMonitoringRead } from '@/feat
apps/web/src/app/(dashboard)/analytics/page.tsx:3:import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'
apps/web/src/app/(dashboard)/dashboard/page.tsx:3:import { RoleDashboard } from '@/features/dashboard/role-dashboard'
dfa2fafd
fb98d299
6804a219
3985de0e
aaac2f1e
95878c12
aa509726
```


`features/analytics` holds 23 tracked files and `features/dashboard` 27. The first `wc` block is the size of what the slice cuts: the component of 1745 lines (38 `useState` calls), its test of 1691 lines, `role-dashboard.tsx` of 693 lines (S7d), `pathways-client.ts` of 330 lines, its test of 1350 lines, the monitoring test of 45 lines and the insights client of 37 lines. The first call list holds the four dashboard files that call the moved members on one line (`role-dashboard.tsx` and the component chain the call on the next line, which `count-calls.mjs` of Task 2 finds), and the second the two analytics files that name the export preview or the search helper. 47 files name `lib/services/pathways-client` and 36 mock factories stub it. One file names the insights client, four name `use-monitoring-read` (the e2e spec, the indicators workspace and its two tests) and two app pages import a leaf of the two features (the dashboard page stays until S7d). The seven hashes are those of the client, its test, the monitoring test, the component, its test, the copy contract test and the direction test: every cut plan below pins the hash of the file it cuts, so a slice below this one that changed a file shows here first.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s7c-analytics-dashboards-web.md docs/superpowers/plans/$(date +%F)-modularization-s7c-analytics-dashboards-web.md`. The handoff copy and its index row stay, and so do the `docs/superpowers/plans` copies of the S7 and S7b plans and their index rows: they are removed only after the developer has merged the series (ruling 12).

In `docs/index.md` section 1.6, add one row after the S7b plan row; the block finds the last line that names the S7b plan copy, so a second matching line does not get the row twice:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s7c-analytics-dashboards-web.md docs/superpowers/plans/$D-modularization-s7c-analytics-dashboards-web.md
ROW="| [S7c analytics and dashboards web plan](superpowers/plans/$D-modularization-s7c-analytics-dashboards-web.md) | $D-modularization-s7c-analytics-dashboards-web.md | $D | S7c of the codebase modularization: dashboards and analytics clients, features/analytics layout and surface, analytics dashboard test and component splits; S7d outline | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s7b-analytics-dashboards" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: add the S7c analytics and dashboards web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text
+| [S7c analytics and dashboards web plan](superpowers/plans/YYYY-MM-DD-modularization-s7c-analytics-dashboards-web.md) | YYYY-MM-DD-modular

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
<sha> docs: add the S7c analytics and dashboards web plan
<sha> handoff: stage the S7c plan
```


One index row is added after the S7b row, `docs:check` keeps the 6 baseline failures and 1 warning (pnpm adds its exit line), and the log shows the new commit above the controller's staging commit. `YYYY-MM-DD` is the day Task 0 runs.

---

### Task 1: The dashboards and analytics clients, with tests that run against the old and the new client

**Files:**
- Create: `apps/web/src/lib/api/dashboards.ts`, `apps/web/src/lib/api/analytics.ts`, `apps/web/src/lib/api/dashboards.test.ts`, `apps/web/src/lib/api/analytics.test.ts`, `apps/web/src/lib/services/analytics-insights-client.test.ts`
- Create (gitignored): `.tmp/s7c/client-blocks.mjs`, `old-members.mjs`, `mutate-clients.sh`, `files/moved-original.ts`

Nothing is removed or switched yet: `pathways-client.ts` still holds the old members, so the tests below run the same cases against both clients (ruling 3). `dashboardsClient` (`getDashboardActionCounts`, `getRoleOverview`, `getMonitoringDashboard`, `getSadddDashboard`, `getDashboard`) and `analyticsClient` (`getDescriptiveAnalytics`, `getSurveyAnalytics`, `getTimelineAnalytics`, with `descriptiveAnalyticsSearch` and `getAnalyticsExportPreview` as module exports) are the members of `pathways-client.ts` written as object literal methods, with the monitoring query helper and the export preview schema private to their files. They go through `requestFoundation` of `lib/api/core/request.ts`, as the old members do. The insights client already is its own module; its test is written now and runs against `lib/services/analytics-insights-client.ts` before Task 2 moves the file.

- [ ] **Step 1: Create the clients and their tests**

Create each file with the Write tool exactly as printed. The tests use the real foundation fetch and header path (a stubbed `fetch`, the `pathways-context` cookie, a mocked environment and browser session), the fictional ids `79300000-...`, `79400000-...` and `79500000-...`, and the token `synthetic-test-token`; each `describe.each` table runs the same cases against `pathwaysClient` (the code being replaced) and the new client:

Create `apps/web/src/lib/api/dashboards.ts`:

```ts
import {
  type DashboardActionCounts,
  type DashboardQuery,
  type MonitoringDashboard,
  type RoleOverview,
  type SadddDashboard,
  type SadddQuery,
  dashboardActionCountsSchema,
  dashboardQuerySchema,
  formatMetricCell,
  monitoringDashboardSchema,
  roleOverviewSchema,
  sadddDashboardSchema,
  sadddQuerySchema,
} from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'
import type { RoleDashboardViewModel } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

/** Fixed filter allowlist; no role, organization, demographic, formula or field selectors. */
function monitoringQuery(input: DashboardQuery): string {
  const query = dashboardQuerySchema.parse(input)
  const search = new URLSearchParams()

  const allowedKeys = ['projectId', 'programId', 'periodStart', 'periodEnd'] as const

  for (const key of allowedKeys) {
    const value = query[key]

    if (typeof value === 'string') {
      search.set(key, value)
    }
  }

  return search.size ? `?${search.toString()}` : ''
}

export const dashboardsClient = {
  async getDashboardActionCounts(): Promise<DashboardActionCounts> {
    return dashboardActionCountsSchema.parse(await requestFoundation('/dashboards/action-counts'))
  },

  async getRoleOverview(): Promise<RoleOverview> {
    return roleOverviewSchema.parse(await requestFoundation('/dashboards/role-overview'))
  },

  async getMonitoringDashboard(query: DashboardQuery = {}): Promise<MonitoringDashboard> {
    return monitoringDashboardSchema.parse(
      await requestFoundation(`/dashboards/monitoring${monitoringQuery(query)}`),
    )
  },

  async getSadddDashboard(query: SadddQuery): Promise<SadddDashboard> {
    const { projectId } = sadddQuerySchema.parse(query)
    return sadddDashboardSchema.parse(
      await requestFoundation(`/dashboards/saddd?projectId=${encodeURIComponent(projectId)}`),
    )
  },

  async getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel> {
    // Role changes labels only. Authority and all values come from the current authenticated API request.
    const result: MonitoringDashboard = monitoringDashboardSchema.parse(
      await requestFoundation('/dashboards/home'),
    )

    return {
      role,
      greetingName: role,
      heading: 'Project monitoring overview',
      summary: `${result.periodStart} to ${result.periodEnd}; ${result.businessTimeZone}. Current operational states; no automated success rating.`,
      primaryAction: {
        id: 'monitoring',
        label: 'Open monitoring',
        kind: 'navigate',
        href: '/analytics',
      },
      metrics: [
        {
          id: 'projects',
          label: 'Authorized projects',
          value: String(result.scopeProjectCount),
          helperText: 'Server-derived current project scope.',
        },
        {
          id: 'participation',
          label: 'Participation records',
          value: formatMetricCell(result.participationRecords),
          helperText: 'Committed records, not a count of people.',
        },
        {
          id: 'attending',
          label: 'Distinct attending individuals',
          value: formatMetricCell(result.attendingIndividuals),
          helperText: 'Present/completed attendance; deduplicated across projects.',
        },
        {
          id: 'enrolled',
          label: 'Enrolled individuals',
          value: formatMetricCell(result.enrolledIndividuals),
          helperText: 'Enrollment overlaps this period; privacy suppression applies.',
        },
      ],
      sections: [
        {
          id: 'projects',
          title: 'Authorized project workspaces',
          emptyText: 'No projects are currently in your authorized scope.',
          items: result.projects.map((project) => ({
            id: project.id,
            title: project.title,
            description: project.code,
            href: `/projects/${project.id}`,
          })),
        },
      ],
    }
  },
}
```


Create `apps/web/src/lib/api/analytics.ts`:

```ts
import {
  type DescriptiveAnalytics,
  type DescriptiveAnalyticsQuery,
  type SurveyAnalytics,
  type TimelineAnalytics,
  descriptiveAnalyticsQuerySchema,
  descriptiveAnalyticsSchema,
  surveyAnalyticsSchema,
  timelineAnalyticsSchema,
} from '@pathways/shared'
import { z } from 'zod'

import { requestFoundation } from '@/lib/api/core/request'

export const analyticsClient = {
  async getDescriptiveAnalytics(query: DescriptiveAnalyticsQuery): Promise<DescriptiveAnalytics> {
    return descriptiveAnalyticsSchema.parse(
      await requestFoundation(`/analytics/descriptive${descriptiveAnalyticsSearch(query)}`),
    )
  },

  async getSurveyAnalytics(query: DescriptiveAnalyticsQuery): Promise<SurveyAnalytics> {
    return surveyAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'survey' })}`,
      ),
    )
  },

  async getTimelineAnalytics(query: DescriptiveAnalyticsQuery): Promise<TimelineAnalytics> {
    return timelineAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'timeline' })}`,
      ),
    )
  },
}

/** Validated query string shared by the descriptive read and its CSV export. */
export function descriptiveAnalyticsSearch(query: DescriptiveAnalyticsQuery): string {
  const parsed = descriptiveAnalyticsQuerySchema.parse(query)
  const params = new URLSearchParams({ projectId: parsed.projectId })
  if (parsed.periodStart && parsed.periodEnd) {
    params.set('periodStart', parsed.periodStart)
    params.set('periodEnd', parsed.periodEnd)
  }
  if (parsed.view) params.set('view', parsed.view)
  return `?${params.toString()}`
}

const analyticsExportPreviewSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  totalRows: z.number().int().nonnegative(),
})

/** First rows of the aggregate table a descriptive export would contain, with suppression applied. */
export async function getAnalyticsExportPreview(query: DescriptiveAnalyticsQuery) {
  return analyticsExportPreviewSchema.parse(
    await requestFoundation(
      `/analytics/descriptive/export/preview${descriptiveAnalyticsSearch(query)}`,
    ),
  )
}
```


Create `apps/web/src/lib/api/dashboards.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { dashboardsClient } from './dashboards'

const authUserId = '79300000-0000-4000-8000-000000000001'
const organizationId = '79300000-0000-4000-8000-000000000002'
const userId = '79300000-0000-4000-8000-000000000003'
const projectId = '79300000-0000-4000-8000-000000000004'
const programId = '79300000-0000-4000-8000-000000000005'
const base = 'http://127.0.0.1:4000/api'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
const missing = { state: 'MISSING', value: null, reason: 'MISSING' }
const actionCounts = {
  contractVersion: 'dashboard.action-counts.v1',
  businessDate: '2026-10-04',
  pendingApprovals: 2,
  activeAlerts: { count: 1, capped: false },
  overdueActivities: { count: 3, mostOverdue: { code: 'ACT-1', daysLate: 4 } },
  forReview: null,
}
const roleOverview = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: null,
  myExtensions: null,
  extensionQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
}
const monitoring = {
  contractVersion: 'p06.v1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  businessTimeZone: 'Asia/Manila',
  generatedAt: '2026-10-01T00:00:00.000Z',
  refresh: 'READ_TIME_NO_CACHE',
  projects: [{ id: projectId, code: 'SYN-1', title: 'Fictional project' }],
  scopeProjectCount: 1,
  activities: [],
  milestones: [],
  participationRecords: cell('12'),
  attendingIndividuals: cell('8'),
  enrolledBeneficiaryRecords: missing,
  enrolledIndividuals: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
  indicators: [],
  indicatorNote: 'Fictional note.',
}
const saddd = {
  contractVersion: 'p06.v1',
  periodStart: null,
  periodEnd: null,
  businessTimeZone: 'Asia/Manila',
  generatedAt: '2026-10-01T00:00:00.000Z',
  refresh: 'READ_TIME_NO_CACHE',
  releaseState: 'RELEASED',
  population: 'DISTINCT_INDIVIDUALS_WITH_OVERLAPPING_ENROLLMENT',
  demographicBasis: 'CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT',
  privacy: {
    threshold: 5,
    complementarySuppression: true,
    policy: 'FIXED_CLOSED_PROJECT_PERIOD_V1',
    crossFilters: 'PROJECT_ONLY_NO_CROSS_FILTERS',
  },
  total: cell('9'),
  sex: [{ key: 'FEMALE', label: 'Female', metric: cell('6') }],
  age: [],
  disability: [],
  completeness: [],
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path.
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

// The same cases run against the member still on pathwaysClient and against its copy in dashboardsClient.
const clients: readonly (readonly [string, typeof dashboardsClient])[] = [
  ['pathwaysClient', pathwaysClient],
  ['dashboardsClient', dashboardsClient],
]

describe.each(clients)('%s dashboard reads', (_name, client) => {
  it('reads the action counts from their route and parses them', async () => {
    fetcher.mockResolvedValueOnce(json(actionCounts))
    await expect(client.getDashboardActionCounts()).resolves.toEqual(actionCounts)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`${base}/dashboards/action-counts`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.body).toBeUndefined()
  })

  it('reads the role overview from its route and parses it', async () => {
    fetcher.mockResolvedValueOnce(json(roleOverview))
    await expect(client.getRoleOverview()).resolves.toEqual(roleOverview)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/role-overview`)
  })

  it.each([
    ['action counts', (c: typeof client) => c.getDashboardActionCounts(), actionCounts],
    ['role overview', (c: typeof client) => c.getRoleOverview(), roleOverview],
    ['monitoring', (c: typeof client) => c.getMonitoringDashboard(), monitoring],
    ['SADDD', (c: typeof client) => c.getSadddDashboard({ projectId }), saddd],
  ])('rejects a %s response with an unknown key', async (_label, call, response) => {
    fetcher.mockResolvedValueOnce(json({ ...response, extra: 'x' }))
    await expect(call(client)).rejects.toThrow()
  })

  it.each([
    ['no query', undefined, ''],
    ['an empty query', {}, ''],
    ['a project', { projectId }, `?projectId=${projectId}`],
    [
      'a project and a period',
      { projectId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      `?projectId=${projectId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
    ],
    [
      'a program and a period',
      { programId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      `?programId=${programId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
    ],
  ])('sends the monitoring read with %s', async (_label, query, search) => {
    fetcher.mockResolvedValueOnce(json(monitoring))
    await expect(client.getMonitoringDashboard(query)).resolves.toEqual(monitoring)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/monitoring${search}`)
  })

  it.each([
    ['a project and a program', { projectId, programId }],
    ['a period start without its end', { periodStart: '2026-09-01' }],
    ['a reversed period', { periodStart: '2026-09-30', periodEnd: '2026-09-01' }],
    ['a role selector', { role: 'Project Officer' }],
    ['a malformed project id', { projectId: 'not-a-uuid' }],
  ])('refuses a monitoring query with %s before any request', async (_label, query) => {
    await expect(client.getMonitoringDashboard(query as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the SADDD read for exactly one project', async () => {
    fetcher.mockResolvedValueOnce(json(saddd))
    await expect(client.getSadddDashboard({ projectId })).resolves.toEqual(saddd)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/saddd?projectId=${projectId}`)
  })

  it('rejects an unapproved SADDD cross-filter before fetching', async () => {
    await expect(client.getSadddDashboard({ projectId, sex: 'FEMALE' } as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when the current session disappears', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.getMonitoringDashboard()).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects dashboard reads without a session', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.getDashboard('Program Manager')).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('builds the role dashboard view model from the home read', async () => {
    fetcher.mockResolvedValueOnce(json(monitoring))
    await expect(client.getDashboard('Program Manager')).resolves.toEqual({
      role: 'Program Manager',
      greetingName: 'Program Manager',
      heading: 'Project monitoring overview',
      summary:
        '2026-09-01 to 2026-09-30; Asia/Manila. Current operational states; no automated success rating.',
      primaryAction: {
        id: 'monitoring',
        label: 'Open monitoring',
        kind: 'navigate',
        href: '/analytics',
      },
      metrics: [
        {
          id: 'projects',
          label: 'Authorized projects',
          value: '1',
          helperText: 'Server-derived current project scope.',
        },
        {
          id: 'participation',
          label: 'Participation records',
          value: '12',
          helperText: 'Committed records, not a count of people.',
        },
        {
          id: 'attending',
          label: 'Distinct attending individuals',
          value: '8',
          helperText: 'Present/completed attendance; deduplicated across projects.',
        },
        {
          id: 'enrolled',
          label: 'Enrolled individuals',
          value: 'Suppressed',
          helperText: 'Enrollment overlaps this period; privacy suppression applies.',
        },
      ],
      sections: [
        {
          id: 'projects',
          title: 'Authorized project workspaces',
          emptyText: 'No projects are currently in your authorized scope.',
          items: [
            {
              id: projectId,
              title: 'Fictional project',
              description: 'SYN-1',
              href: `/projects/${projectId}`,
            },
          ],
        },
      ],
    })
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/home`)
    fetcher.mockResolvedValueOnce(json({ ...monitoring, extra: 'x' }))
    await expect(client.getDashboard('Program Manager')).rejects.toThrow()
  })
})
```


Create `apps/web/src/lib/api/analytics.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import {
  getAnalyticsExportPreview as oldPreview,
  descriptiveAnalyticsSearch as oldSearch,
  pathwaysClient,
} from '@/lib/services/pathways-client'
import {
  analyticsClient,
  getAnalyticsExportPreview as newPreview,
  descriptiveAnalyticsSearch as newSearch,
} from './analytics'

const authUserId = '79400000-0000-4000-8000-000000000001'
const organizationId = '79400000-0000-4000-8000-000000000002'
const userId = '79400000-0000-4000-8000-000000000003'
const projectId = '79400000-0000-4000-8000-000000000004'
const base = 'http://127.0.0.1:4000/api'
const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
const periodSearch = `&periodStart=${period.periodStart}&periodEnd=${period.periodEnd}`
const generatedAt = '2026-10-01T00:00:00.000Z'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
const group = (key: string, label: string) => ({
  key,
  label,
  pairs: cell('10'),
  meanPre: cell('50.0'),
  meanPost: cell('60.0'),
  meanChange: cell('10.0'),
  improved: cell('7'),
  same: cell('2'),
  declined: cell('1'),
})
const descriptive = {
  contractVersion: 'analytics.descriptive.v1',
  projectId,
  generatedAt,
  monitoringPeriod: { ...period, businessTimeZone: 'Asia/Manila' },
  sadddPeriod: { periodStart: null, periodEnd: null },
  sadddReleaseState: 'RELEASED',
  privacy: {
    threshold: 5,
    complementarySuppression: true,
    source: 'P06_SADDD_RELEASE',
    beneficiaryRows: false,
  },
  counts: [{ key: 'ACTIVITIES', label: 'Activities', metric: cell('4') }],
  distributions: [],
  indicatorSummaries: [],
}
const survey = {
  contractVersion: 'analytics.descriptive.survey.v1',
  projectId,
  generatedAt,
  period,
  excludedRecords: 1,
  overall: group('overall', 'All activities'),
  byActivity: [group('activity-a', 'Activity A')],
}
const timeline = {
  contractVersion: 'analytics.descriptive.timeline.v1',
  projectId,
  generatedAt,
  reportingDate: '2026-09-27',
  elapsedPercent: cell('40.0'),
  remainingDays: cell('30'),
  overdueDays: { state: 'ZERO', value: '0', reason: null },
  activityCompletionPercent: cell('50.0'),
  activityOverdueCount: { state: 'ZERO', value: '0', reason: null },
  milestoneOnTimePercent: { state: 'MISSING', value: null, reason: 'NO_COMPLETED_MILESTONES' },
}
const exportPreview = {
  title: 'Descriptive counts',
  columns: ['Measure', 'Count'],
  rows: [['Activities', '4']],
  totalRows: 1,
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path.
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

// The same cases run against the members still on pathwaysClient and against their copies in analyticsClient.
const clients = [
  [
    'pathwaysClient',
    {
      getDescriptiveAnalytics: (query) => pathwaysClient.getDescriptiveAnalytics(query),
      getSurveyAnalytics: (query) => pathwaysClient.getSurveyAnalytics(query),
      getTimelineAnalytics: (query) => pathwaysClient.getTimelineAnalytics(query),
      descriptiveAnalyticsSearch: oldSearch,
      getAnalyticsExportPreview: oldPreview,
    },
  ],
  [
    'analyticsClient',
    {
      getDescriptiveAnalytics: (query) => analyticsClient.getDescriptiveAnalytics(query),
      getSurveyAnalytics: (query) => analyticsClient.getSurveyAnalytics(query),
      getTimelineAnalytics: (query) => analyticsClient.getTimelineAnalytics(query),
      descriptiveAnalyticsSearch: newSearch,
      getAnalyticsExportPreview: newPreview,
    },
  ],
] as const satisfies readonly (readonly [
  string,
  typeof analyticsClient & {
    descriptiveAnalyticsSearch: typeof newSearch
    getAnalyticsExportPreview: typeof newPreview
  },
])[]

describe.each(clients)('%s analytics reads', (_name, client) => {
  it.each([
    ['a project', { projectId }, `?projectId=${projectId}`],
    ['a project and a period', { projectId, ...period }, `?projectId=${projectId}${periodSearch}`],
    ['a view', { projectId, view: 'kpi' as const }, `?projectId=${projectId}&view=kpi`],
    [
      'a period and a view',
      { projectId, ...period, view: 'participation' as const },
      `?projectId=${projectId}${periodSearch}&view=participation`,
    ],
  ])('sends the descriptive read with %s', async (_label, query, search) => {
    fetcher.mockResolvedValueOnce(json(descriptive))
    await expect(client.getDescriptiveAnalytics(query)).resolves.toEqual(descriptive)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`${base}/analytics/descriptive${search}`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(client.descriptiveAnalyticsSearch(query)).toBe(search)
  })

  it('forces the survey view, whatever view the caller names', async () => {
    fetcher.mockResolvedValueOnce(json(survey))
    await expect(
      client.getSurveyAnalytics({ projectId, ...period, view: 'timeline' }),
    ).resolves.toEqual(survey)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive?projectId=${projectId}${periodSearch}&view=survey`,
    )
  })

  it('forces the timeline view and sends no period', async () => {
    fetcher.mockResolvedValueOnce(json(timeline))
    await expect(client.getTimelineAnalytics({ projectId })).resolves.toEqual(timeline)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive?projectId=${projectId}&view=timeline`,
    )
  })

  it.each([
    ['descriptive', (c: typeof client) => c.getDescriptiveAnalytics({ projectId }), descriptive],
    ['survey', (c: typeof client) => c.getSurveyAnalytics({ projectId, ...period }), survey],
    ['timeline', (c: typeof client) => c.getTimelineAnalytics({ projectId }), timeline],
  ])('rejects a %s response with an unknown key', async (_label, call, response) => {
    fetcher.mockResolvedValueOnce(json({ ...response, extra: 'x' }))
    await expect(call(client)).rejects.toThrow()
  })

  it.each([
    ['a period start without its end', { projectId, periodStart: period.periodStart }],
    ['a malformed project id', { projectId: 'not-a-uuid' }],
    ['a view outside the catalog', { projectId, view: 'other' }],
    ['an unknown key', { projectId, role: 'Project Officer' }],
  ])('refuses a query with %s before any request', async (_label, query) => {
    await expect(client.getDescriptiveAnalytics(query as never)).rejects.toThrow()
    expect(() => client.descriptiveAnalyticsSearch(query as never)).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reads the export preview from its route with the same query string', async () => {
    fetcher.mockResolvedValueOnce(json(exportPreview))
    await expect(client.getAnalyticsExportPreview({ projectId, ...period })).resolves.toEqual(
      exportPreview,
    )
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive/export/preview?projectId=${projectId}${periodSearch}`,
    )
  })

  it('drops an unknown key of the export preview and refuses a negative row total', async () => {
    fetcher.mockResolvedValueOnce(json({ ...exportPreview, extra: 'x' }))
    await expect(client.getAnalyticsExportPreview({ projectId })).resolves.toEqual(exportPreview)
    fetcher.mockResolvedValueOnce(json({ ...exportPreview, totalRows: -1 }))
    await expect(client.getAnalyticsExportPreview({ projectId })).rejects.toThrow()
  })
})
```


Create `apps/web/src/lib/services/analytics-insights-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { analyticsInsightsClient } from './analytics-insights-client'

const authUserId = '79500000-0000-4000-8000-000000000001'
const organizationId = '79500000-0000-4000-8000-000000000002'
const userId = '79500000-0000-4000-8000-000000000003'
const projectId = '79500000-0000-4000-8000-000000000004'
const activityId = '79500000-0000-4000-8000-000000000005'
const base = 'http://127.0.0.1:4000/api/analytics/insights'
const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
const periodSearch = `&periodStart=${period.periodStart}&periodEnd=${period.periodEnd}`
const participation = {
  projectId,
  total: 12,
  totalSuppressed: false,
  byActivity: [{ activityId, activityName: 'Fictional activity', count: 12, suppressed: false }],
  byMonth: [{ month: '2026-09', count: 12, suppressed: false }],
  byAttendanceStatus: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'].map(
    (status) => ({ status, count: null, suppressed: true }),
  ),
}
const trends = {
  projectId,
  indicators: [
    {
      indicatorId: activityId,
      name: 'Fictional indicator',
      unit: '%',
      target: 100,
      points: [{ periodStart: '2026-09-01', periodEnd: '2026-09-30', value: 40 }],
    },
  ],
}
const budget = {
  projectId,
  currencies: [
    { currency: 'PHP', planned: 1000, approved: 400, pending: 100, utilizationPercent: 40 },
  ],
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path.
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

type Call = (
  query: Parameters<typeof analyticsInsightsClient.budget>[0],
  signal?: AbortSignal,
) => unknown
const reads: readonly (readonly [string, Call, string, unknown])[] = [
  ['participation', analyticsInsightsClient.participation, 'participation', participation],
  ['indicatorTrends', analyticsInsightsClient.indicatorTrends, 'indicator-trends', trends],
  ['budget', analyticsInsightsClient.budget, 'budget', budget],
]

describe('analyticsInsightsClient', () => {
  it.each(reads)(
    '%s sends one project read and parses the response',
    async (_name, call, route, response) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call({ projectId }, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`${base}/${route}?projectId=${projectId}`)
      expect(init?.method ?? 'GET').toBe('GET')
      expect(init?.signal).toBe(controller.signal)
    },
  )

  it.each(reads)(
    '%s adds a complete period and lowercases the project id',
    async (_name, call, route, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await call({ projectId: projectId.toUpperCase(), ...period })
      expect(String(fetcher.mock.calls[0][0])).toBe(
        `${base}/${route}?projectId=${projectId}${periodSearch}`,
      )
    },
  )

  it.each(reads)(
    '%s rejects a response with an unknown key',
    async (_name, call, _route, response) => {
      fetcher.mockResolvedValueOnce(json({ ...(response as object), extra: 'x' }))
      await expect(call({ projectId })).rejects.toThrow()
    },
  )

  it.each(reads)('%s refuses an incomplete period before any request', async (_name, call) => {
    await expect(call({ projectId, periodStart: period.periodStart })).rejects.toThrow()
    await expect(call({ projectId: 'not-a-uuid' })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
```


- [ ] **Step 2: Format and run the tests against both clients**

```bash
D=apps/web/src/lib
git add -N apps/web/src
pnpm exec biome check --write $D/api/dashboards.ts $D/api/analytics.ts $D/api/dashboards.test.ts $D/api/analytics.test.ts $D/services/analytics-insights-client.test.ts 2>&1 | tail -2
pnpm --filter @pathways/web exec vitest run src/lib/api/dashboards.test.ts src/lib/api/analytics.test.ts src/lib/services/analytics-insights-client.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests|Test Files|FAIL|Error|✓"
```


Expected:

```text
Checked 5 files in <ms>. No fixes applied.
 ✓ src/lib/api/analytics.test.ts (30 tests) <ms>
 ✓ src/lib/api/dashboards.test.ts (42 tests) <ms>
 ✓ src/lib/services/analytics-insights-client.test.ts (12 tests) <ms>
 Test Files  3 passed (3)
      Tests  84 passed (84)
```


The 84 runs are 21 dashboard cases and 15 analytics cases for both clients (42 and 30) and 12 insights cases. Biome fixes nothing because the files are printed as it formats them. The three file lines can come in a different order.

- [ ] **Step 3: Prove the tests catch a change of the new clients**

`.tmp/s7c/mutate-clients.sh` changes one thing at a time in the new clients and in the insights client (the SADDD, home and action count paths, the parse of the home response, the program filter, the forced survey view, the export total bound, the view parameter and the period end), runs the matching test file and restores the file:

Create `.tmp/s7c/mutate-clients.sh`:

```bash
D=apps/web/src/lib/api
V=apps/web/src/lib/services
run() { (cd apps/web && timeout 300 pnpm exec vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/lib/(api|services)/##' | cut -c1-110); }
mutate() {
  # Usage: mutate <label> <file> <sed expression> <test file>; changes one thing, runs the test file and restores the file.
  cp "$2" .tmp/s7c/files/mutant.bak
  sed -i "$3" "$2"
  if cmp -s "$2" .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run "$4"
  cp .tmp/s7c/files/mutant.bak "$2"
}
cp $D/dashboards.ts .tmp/s7c/files/dashboards.orig
cp $D/analytics.ts .tmp/s7c/files/analytics.orig
cp $V/analytics-insights-client.ts .tmp/s7c/files/insights.orig
echo "unmutated"; run src/lib/api/dashboards.test.ts src/lib/api/analytics.test.ts src/lib/services/analytics-insights-client.test.ts
mutate "saddd path changed" $D/dashboards.ts 's#/dashboards/saddd?#/dashboards/sadd?#' src/lib/api/dashboards.test.ts
mutate "program filter dropped" $D/dashboards.ts "s/'projectId', 'programId', /'projectId', /" src/lib/api/dashboards.test.ts
mutate "home path changed" $D/dashboards.ts 's#/dashboards/home#/dashboards/homes#' src/lib/api/dashboards.test.ts
mutate "home response not parsed" $D/dashboards.ts '/const result: MonitoringDashboard = monitoringDashboardSchema.parse(/s/monitoringDashboardSchema.parse(/(/' src/lib/api/dashboards.test.ts
mutate "action counts path changed" $D/dashboards.ts 's#/dashboards/action-counts#/dashboards/action-count#' src/lib/api/dashboards.test.ts
mutate "survey view forced to timeline" $D/analytics.ts "s/view: 'survey'/view: 'timeline'/" src/lib/api/analytics.test.ts
mutate "export total may be negative" $D/analytics.ts 's/z.number().int().nonnegative()/z.number().int()/' src/lib/api/analytics.test.ts
mutate "view parameter dropped" $D/analytics.ts "s/  if (parsed.view) params.set('view', parsed.view)//" src/lib/api/analytics.test.ts
mutate "period end dropped" $D/analytics.ts "s/    params.set('periodEnd', parsed.periodEnd)//" src/lib/api/analytics.test.ts
mutate "insights path changed" $V/analytics-insights-client.ts 's#/analytics/insights/#/analytics/insight/#' src/lib/services/analytics-insights-client.test.ts
mutate "trends name changed" $V/analytics-insights-client.ts "s/'indicator-trends'/'indicator-trend'/" src/lib/services/analytics-insights-client.test.ts
mutate "insights period end dropped" $V/analytics-insights-client.ts "s/    params.set('periodEnd', parsed.periodEnd)//" src/lib/services/analytics-insights-client.test.ts
cmp .tmp/s7c/files/dashboards.orig $D/dashboards.ts && cmp .tmp/s7c/files/analytics.orig $D/analytics.ts && cmp .tmp/s7c/files/insights.orig $V/analytics-insights-client.ts && echo "all three files restored"
```


```bash
bash .tmp/s7c/mutate-clients.sh
```


Expected:

```text
unmutated
      Tests  84 passed (84)
 Test Files  3 passed (3)
saddd path changed
      Tests  1 failed | 41 passed (42)
dashboards.test.ts > dashboardsClient dashboard reads > sends the SADDD read for exactly one project
 Test Files  1 failed (1)
program filter dropped
      Tests  1 failed | 41 passed (42)
dashboards.test.ts > dashboardsClient dashboard reads > sends the monitoring read with a program and a period
 Test Files  1 failed (1)
home path changed
      Tests  1 failed | 41 passed (42)
dashboards.test.ts > dashboardsClient dashboard reads > builds the role dashboard view model from the home rea
 Test Files  1 failed (1)
home response not parsed
      Tests  1 failed | 41 passed (42)
dashboards.test.ts > dashboardsClient dashboard reads > builds the role dashboard view model from the home rea
 Test Files  1 failed (1)
action counts path changed
      Tests  1 failed | 41 passed (42)
dashboards.test.ts > dashboardsClient dashboard reads > reads the action counts from their route and parses th
 Test Files  1 failed (1)
survey view forced to timeline
      Tests  1 failed | 29 passed (30)
analytics.test.ts > analyticsClient analytics reads > forces the survey view, whatever view the caller names
 Test Files  1 failed (1)
export total may be negative
      Tests  1 failed | 29 passed (30)
analytics.test.ts > analyticsClient analytics reads > drops an unknown key of the export preview and refuses a
 Test Files  1 failed (1)
view parameter dropped
      Tests  4 failed | 26 passed (30)
analytics.test.ts > analyticsClient analytics reads > forces the survey view, whatever view the caller names
analytics.test.ts > analyticsClient analytics reads > forces the timeline view and sends no period
analytics.test.ts > analyticsClient analytics reads > sends the descriptive read with a period and a view
analytics.test.ts > analyticsClient analytics reads > sends the descriptive read with a view
 Test Files  1 failed (1)
period end dropped
      Tests  4 failed | 26 passed (30)
analytics.test.ts > analyticsClient analytics reads > forces the survey view, whatever view the caller names
analytics.test.ts > analyticsClient analytics reads > reads the export preview from its route with the same qu
analytics.test.ts > analyticsClient analytics reads > sends the descriptive read with a period and a view
analytics.test.ts > analyticsClient analytics reads > sends the descriptive read with a project and a period
 Test Files  1 failed (1)
insights path changed
      Tests  6 failed | 6 passed (12)
analytics-insights-client.test.ts > analyticsInsightsClient > budget adds a complete period and lowercases the
analytics-insights-client.test.ts > analyticsInsightsClient > budget sends one project read and parses the res
analytics-insights-client.test.ts > analyticsInsightsClient > indicatorTrends adds a complete period and lower
analytics-insights-client.test.ts > analyticsInsightsClient > indicatorTrends sends one project read and parse
analytics-insights-client.test.ts > analyticsInsightsClient > participation adds a complete period and lowerca
analytics-insights-client.test.ts > analyticsInsightsClient > participation sends one project read and parses 
 Test Files  1 failed (1)
trends name changed
      Tests  2 failed | 10 passed (12)
analytics-insights-client.test.ts > analyticsInsightsClient > indicatorTrends adds a complete period and lower
analytics-insights-client.test.ts > analyticsInsightsClient > indicatorTrends sends one project read and parse
 Test Files  1 failed (1)
insights period end dropped
      Tests  3 failed | 9 passed (12)
analytics-insights-client.test.ts > analyticsInsightsClient > budget adds a complete period and lowercases the
analytics-insights-client.test.ts > analyticsInsightsClient > indicatorTrends adds a complete period and lower
analytics-insights-client.test.ts > analyticsInsightsClient > participation adds a complete period and lowerca
 Test Files  1 failed (1)
all three files restored
```


Every mutation fails at least one case, and the last line says the three files were restored byte for byte. The old client is covered by the same rows: they pass against `pathwaysClient` in Step 2 before anything moves.

- [ ] **Step 4: Compare the new clients with the members they copy**

`client-blocks.mjs` names the eight moved methods in their two client groups and finds a method in the class and in the interface of `pathways-client.ts` (Task 2 reuses it); `old-members.mjs` prints the old members as they stand (the class methods inside one object literal, the monitoring query helper and the two analytics exports):

Create `.tmp/s7c/client-blocks.mjs`:

```js
// Shared names for the dashboards and analytics client move: the methods, the client groups and the helpers that locate class methods and interface members in pathways-client.ts.
export const clientFile = 'apps/web/src/lib/services/pathways-client.ts'

export const groups = [
  {
    client: 'dashboardsClient',
    module: '@/lib/api/dashboards',
    methods: [
      'getDashboardActionCounts',
      'getRoleOverview',
      'getMonitoringDashboard',
      'getSadddDashboard',
      'getDashboard',
    ],
  },
  {
    client: 'analyticsClient',
    module: '@/lib/api/analytics',
    methods: ['getDescriptiveAnalytics', 'getSurveyAnalytics', 'getTimelineAnalytics'],
  },
]
export const allMethods = groups.flatMap((group) => group.methods)

// The block of leading comment lines directly above a declaration start.
function withComments(text, start) {
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    if (!text.slice(previous + 1, start - 1).startsWith('  //')) return start
    start = previous + 1
  }
}

// The class method block: leading comment lines, the declaration and its closing brace line.
export function methodBlock(text, name) {
  const at = text.indexOf(`\n  async ${name}(`)
  if (at < 0) throw new Error(`missing method ${name}`)
  const close = text.indexOf('\n  }\n', at)
  if (close < 0) throw new Error(`unterminated method ${name}`)
  return text.slice(withComments(text, at + 1), close + 5)
}

// The interface member block: from `  name(` to the line before the next member, comment or closing brace.
export function memberBlock(text, name) {
  const at = text.indexOf(`\n  ${name}(`)
  if (at < 0) throw new Error(`missing member ${name}`)
  const next = /\n(?:  [A-Za-z]+\(|  \/\/|\})/g
  next.lastIndex = at + name.length + 3
  const end = next.exec(text)
  if (!end) throw new Error(`unterminated member ${name}`)
  return text.slice(withComments(text, at + 1), end.index + 1)
}
```


Create `.tmp/s7c/old-members.mjs`:

```js
// Prints, in one object literal named members, the dashboard and analytics members of pathways-client.ts as they stand: the class methods, the monitoring query helper and the two analytics exports.
import { readFileSync } from 'node:fs'

import { allMethods, clientFile, methodBlock } from './client-blocks.mjs'

const text = readFileSync(process.argv[2] ?? clientFile, 'utf8')
const between = (from, to) => {
  const start = text.indexOf(from)
  return text.slice(start, text.indexOf(to, start))
}
const parts = ['const members = {', ...allMethods.map((name) => methodBlock(text, name)), '}\n']
parts.push(`${between('/** Fixed filter allowlist;', '\n}\n')}\n}\n`)
parts.push(between('/** Validated query string shared by the descriptive read', 'export const pathwaysClient'))
process.stdout.write(parts.join('\n'))
```


```bash
node .tmp/s7c/old-members.mjs > .tmp/s7c/files/moved-original.ts
wc -l < .tmp/s7c/files/moved-original.ts
node .tmp/s7c/same-lines.mjs .tmp/s7c/files/moved-original.ts apps/web/src/lib/api/dashboards.ts apps/web/src/lib/api/analytics.ts dashboardsClient=members analyticsClient=members --list
```


Expected:

```text
151
1x }
1x const members = {
original lines 133, lost 0, added 2
```


The first line is the length of the old members. `lost 0`: every declaration line of the old members is in the two new files. The two added lines are the second object literal and its closing brace (the old members were one class, the new ones are two objects).

- [ ] **Step 5: Check and commit**

```bash
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
(cd apps/web && timeout 600 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "feat(web): add the dashboards and analytics clients with tests that run against the old and the new client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -5
```


Expected:

```text
Checked 5 files in <ms>. No fixes applied.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1509 files in <ms>. No fixes applied.
 Test Files  252 passed (252)
      Tests  2374 passed (2374)
 apps/web/src/lib/api/analytics.ts                  |  65 ++++++
 apps/web/src/lib/api/dashboards.test.ts            | 256 +++++++++++++++++++++
 apps/web/src/lib/api/dashboards.ts                 | 119 ++++++++++
 .../lib/services/analytics-insights-client.test.ts | 119 ++++++++++
 5 files changed, 770 insertions(+)
```


Biome is clean, the typecheck prints its line, and `--noUnusedLocals` lists only the two lines that exist at the baseline (`forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`, where S5b moved the first). Web is `B_web` plus 3 files and 84 tests: 252 files and 2374 tests.

---

### Task 2: Move the callers and mocks to the new clients, move the insights client, remove the old members

**Files:**
- Modify: `apps/web/src/features/analytics/analytics-dashboard.tsx`, the dashboard files `action-kpi-row.tsx`, `pinned-charts.tsx`, `role-dashboard.tsx`, `role-overview/role-overview.tsx` and `role-overview/use-role-overview.ts`, the four tests that mock the client (`analytics-dashboard.test.tsx`, `role-dashboard-authorization.test.ts`, `pinned-charts.test.tsx`, `role-overview/role-overview.test.tsx`), `apps/web/src/lib/services/pathways-client.ts` and `pathways-client.test.ts`, `apps/web/src/lib/api/dashboards.test.ts` and `analytics.test.ts`
- Move: `lib/services/analytics-insights-client.ts` and its test to `lib/api/analytics-insights.ts` and `analytics-insights.test.ts`
- Delete: `apps/web/src/lib/services/pathways-client.monitoring.test.ts`
- Create (gitignored): `.tmp/s7c/count-calls.mjs`, `move-client-calls.mjs`, `remove-client-methods.mjs`, `task2-edits.json`, `task2-moves.json`, `titles-before.json`, `titles-after.json`, `before/`

The eight members of `pathwaysClient` have no other reader than the files listed here, so they leave in one commit: each call is rewritten to its client by script with exact counts, the mocks are edited by an exact replacement list, the insights client moves with `git mv`, and the old members, their private helper and the two analytics exports are deleted from `pathways-client.ts`. The two tables of Task 1 keep only the new client, and the three cases of the old test files that pinned the same behavior (the dashboard read without a session, the SADDD cross-filter refusal and the vanished session) are already rows of `dashboards.test.ts`, so they are deleted from the old files in this commit (ruling 4).

- [ ] **Step 1: Keep the originals, count the calls and save the test titles**

`count-calls.mjs` counts the `pathwaysClient.<moved method>` calls (a chained call on the next line included) in production and test files and lists other mentions of a moved name:

Create `.tmp/s7c/count-calls.mjs`:

```js
// Counts pathwaysClient.<moved method> calls (chained calls on the next line included) in production and test files, and lists other mentions of a moved name (the old client and the new client files are skipped).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { allMethods } from './client-blocks.mjs'

const web = path.resolve('apps/web/src')
const call = new RegExp(`\\bpathwaysClient\\s*\\.(${allMethods.join('|')})\\b`, 'g')
const mention = new RegExp(`\\b(${allMethods.join('|')})\\b`, 'g')

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const totals = { production: { calls: 0, files: 0 }, test: { calls: 0, files: 0 } }
const other = []
for (const file of walk(web)) {
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/')
  if (rel.endsWith('lib/services/pathways-client.ts') || /lib\/api\/(dashboards|analytics)(\.test)?\.ts$/.test(rel)) continue
  const text = readFileSync(file, 'utf8')
  const calls = [...text.matchAll(call)].length
  const mentions = [...text.matchAll(mention)].length
  const kind = /\.test\.tsx?$/.test(rel) ? 'test' : 'production'
  if (calls) {
    totals[kind].calls += calls
    totals[kind].files++
    if (process.argv.includes('--list')) console.log(`${kind} ${rel}: ${calls}`)
  }
  if (mentions > calls) other.push(`${kind} ${rel}: ${mentions - calls}`)
}
console.log(`production calls ${totals.production.calls} in ${totals.production.files} files`)
console.log(`test calls ${totals.test.calls} in ${totals.test.files} files`)
console.log(`other mentions in ${other.length} files`)
if (process.argv.includes('--list')) for (const line of other) console.log(line)
```


```bash
F=apps/web/src
git hash-object $F/lib/services/pathways-client.ts $F/lib/services/pathways-client.test.ts $F/lib/services/pathways-client.monitoring.test.ts | cut -c1-8
cp $F/lib/services/pathways-client.ts $F/lib/services/pathways-client.test.ts $F/lib/services/pathways-client.monitoring.test.ts .tmp/s7c/before/
node .tmp/s7c/count-calls.mjs --list
node .tmp/s7c/test-titles.mjs save .tmp/s7c/titles-before.json $F/lib/services/pathways-client.test.ts $F/lib/services/pathways-client.monitoring.test.ts $F/features/analytics/analytics-dashboard.test.tsx $F/features/dashboard/role-dashboard-authorization.test.ts $F/features/dashboard/pinned-charts.test.tsx $F/features/dashboard/role-overview/role-overview.test.tsx $F/lib/services/analytics-insights-client.test.ts 2>&1 | tail -2
```


Expected:

```text
dfa2fafd
fb98d299
6804a219
production apps/web/src/features/analytics/analytics-dashboard.tsx: 5
production apps/web/src/features/dashboard/action-kpi-row.tsx: 1
production apps/web/src/features/dashboard/pinned-charts.tsx: 2
production apps/web/src/features/dashboard/role-dashboard.tsx: 2
production apps/web/src/features/dashboard/role-overview/role-overview.tsx: 1
production apps/web/src/features/dashboard/role-overview/use-role-overview.ts: 1
test apps/web/src/lib/services/pathways-client.monitoring.test.ts: 2
test apps/web/src/lib/services/pathways-client.test.ts: 1
production calls 12 in 6 files
test calls 3 in 2 files
other mentions in 2 files
test apps/web/src/features/analytics/analytics-dashboard.test.tsx: 118
test apps/web/src/features/dashboard/role-dashboard-authorization.test.ts: 6
files 7, tests 134, failed 0
```


The first three lines are the hashes of the client, its test and the monitoring test (the client and its test change when a slice below this one, S5b for example, removed members from them; nothing pins them, because the edits below count text). The 12 production calls are in six files of `features/analytics` and `features/dashboard`; the three test calls are the monitoring test (2) and the dashboard case of the client test (1), which this task deletes; the other mentions are the hoisted mock objects of the dashboard and authorization tests, which hand the members over as `api.<method>`. The titles file holds the 134 tests of the seven test files that Step 4 compares.

- [ ] **Step 2: Create the edit plan and the scripts**

`task2-edits.json` holds the exact replacements: the analytics import of the dashboard component, the five mock factories (a factory left with nothing keeps an empty `pathwaysClient` so the real client is never loaded, and each test gets a mock of the new module it needs), the two tables that now keep only the new client, and the dashboard case of the old client test:

Create `.tmp/s7c/task2-edits.json`:

```json
[
 [
  "apps/web/src/lib/api/analytics.test.ts",
  "import {\n  getAnalyticsExportPreview as oldPreview,\n  descriptiveAnalyticsSearch as oldSearch,\n  pathwaysClient,\n} from '@/lib/services/pathways-client'\nimport {\n  analyticsClient,\n  getAnalyticsExportPreview as newPreview,\n  descriptiveAnalyticsSearch as newSearch,\n} from './analytics'\n\n",
  "import {\n  analyticsClient,\n  descriptiveAnalyticsSearch,\n  getAnalyticsExportPreview,\n} from './analytics'\n\n",
  1
 ],
 [
  "apps/web/src/lib/api/analytics.test.ts",
  "// The same cases run against the members still on pathwaysClient and against their copies in analyticsClient.\nconst clients = [\n  [\n    'pathwaysClient',\n    {\n      getDescriptiveAnalytics: (query) => pathwaysClient.getDescriptiveAnalytics(query),\n      getSurveyAnalytics: (query) => pathwaysClient.getSurveyAnalytics(query),\n      getTimelineAnalytics: (query) => pathwaysClient.getTimelineAnalytics(query),\n      descriptiveAnalyticsSearch: oldSearch,\n      getAnalyticsExportPreview: oldPreview,\n    },\n  ],\n  [\n    'analyticsClient',\n    {\n      getDescriptiveAnalytics: (query) => analyticsClient.getDescriptiveAnalytics(query),\n      getSurveyAnalytics: (query) => analyticsClient.getSurveyAnalytics(query),\n      getTimelineAnalytics: (query) => analyticsClient.getTimelineAnalytics(query),\n      descriptiveAnalyticsSearch: newSearch,\n      getAnalyticsExportPreview: newPreview,\n    },\n  ],\n] as const satisfies readonly (readonly [\n  string,\n  typeof analyticsClient & {\n    descriptiveAnalyticsSearch: typeof newSearch\n    getAnalyticsExportPreview: typeof newPreview\n  },\n])[]\n\ndescribe.each(clients)('%s analytics reads', (_name, client) => {",
  "const client = { ...analyticsClient, descriptiveAnalyticsSearch, getAnalyticsExportPreview }\n\ndescribe('analyticsClient analytics reads', () => {",
  1
 ],
 [
  "apps/web/src/lib/api/dashboards.test.ts",
  "import { pathwaysClient } from '@/lib/services/pathways-client'\n",
  "",
  1
 ],
 [
  "apps/web/src/lib/api/dashboards.test.ts",
  "// The same cases run against the member still on pathwaysClient and against its copy in dashboardsClient.\nconst clients: readonly (readonly [string, typeof dashboardsClient])[] = [\n  ['pathwaysClient', pathwaysClient],\n  ['dashboardsClient', dashboardsClient],\n]\n\ndescribe.each(clients)('%s dashboard reads', (_name, client) => {",
  "const client = dashboardsClient\n\ndescribe('dashboardsClient dashboard reads', () => {",
  1
 ],
 [
  "apps/web/src/features/analytics/analytics-dashboard.tsx",
  "import {\n  descriptiveAnalyticsSearch,\n  getAnalyticsExportPreview,\n  pathwaysClient,\n} from '@/lib/services/pathways-client'\n",
  "import {\n  descriptiveAnalyticsSearch,\n  getAnalyticsExportPreview,\n} from '@/lib/api/analytics'\nimport { pathwaysClient } from '@/lib/services/pathways-client'\n",
  1
 ],
 [
  "apps/web/src/features/analytics/analytics-dashboard.test.tsx",
  "vi.mock('@/lib/services/pathways-client', () => ({\n  pathwaysClient: api,\n  getAnalyticsExportPreview: previewExport,",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))\nvi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))\nvi.mock('@/lib/api/analytics', () => ({\n  analyticsClient: api,\n  getAnalyticsExportPreview: previewExport,",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-dashboard-authorization.test.ts",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))\nvi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))",
  1
 ],
 [
  "apps/web/src/features/dashboard/pinned-charts.test.tsx",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))\nvi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: {} }))\nvi.mock('@/lib/api/analytics', () => ({ analyticsClient: {} }))",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.test.tsx",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))",
  "vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))\nvi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: {} }))",
  1
 ],
 [
  "apps/web/src/lib/services/pathways-client.test.ts",
  "  it('rejects dashboard reads without a session', async () => {\n    await expect(pathwaysClient.getDashboard('Program Manager')).rejects.toMatchObject({\n      code: 'unauthorized',\n    })\n  })\n\n",
  "",
  1
 ]
]
```


`task2-moves.json` is the move map of the insights client:

Create `.tmp/s7c/task2-moves.json`:

```json
{
 "lib/services/analytics-insights-client.ts": "lib/api/analytics-insights.ts",
 "lib/services/analytics-insights-client.test.ts": "lib/api/analytics-insights.test.ts"
}
```


`move-client-calls.mjs` rewrites each `pathwaysClient.<moved method>` call to the client that owns it and adds the import (or trims `pathwaysClient` from the import when nothing else uses it); it skips the two new client modules and their tests, and prints each file with its call count:

Create `.tmp/s7c/move-client-calls.mjs`:

```js
// Rewrites pathwaysClient.<moved method> calls to the dashboards or analytics client and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups } from './client-blocks.mjs'

const skip = new Set([
  'lib/services/pathways-client.ts',
  'lib/api/dashboards.ts',
  'lib/api/dashboards.test.ts',
  'lib/api/analytics.ts',
  'lib/api/analytics.test.ts',
])
const web = path.resolve('apps/web/src')
const decl =
  /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(?:@\/lib\/services\/pathways-client|\.\/pathways-client)'\n/

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
  if (skip.has(rel)) continue
  let text = readFileSync(file, 'utf8')
  const used = []
  let count = 0
  for (const group of groups) {
    const call = new RegExp(`\\bpathwaysClient(\\s*)\\.(${group.methods.join('|')})\\b`, 'g')
    text = text.replace(call, (_whole, space, method) => {
      count++
      if (!used.includes(group)) used.push(group)
      return `${group.client}${space}.${method}`
    })
  }
  if (!count) continue
  const match = decl.exec(text)
  if (!match || !/\bpathwaysClient\b/.test(match[1])) {
    console.log(`${rel}: manual (no pathwaysClient import), ${count} calls`)
    continue
  }
  const rest = text.replace(match[0], '')
  const stillUsed = /\bpathwaysClient\b(?!\s*:)/.test(rest)
  let replacement = match[0]
  if (!stillUsed) {
    const names = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && name !== 'pathwaysClient')
    replacement = names.length ? match[0].replace(/\{[^}]*\}/, `{ ${names.join(', ')} }`) : ''
  }
  let imports = ''
  for (const group of used) {
    // A file that already imports the module gets the name added to that statement.
    const existing = new RegExp(`import \\{([^}]*)\\} from '${group.module}'\\n`).exec(text)
    if (existing) {
      const names = existing[1].split(',').map((name) => name.trim()).filter(Boolean)
      text = text.replace(existing[0], `import { ${[...names, group.client].join(', ')} } from '${group.module}'\n`)
    } else imports += `import { ${group.client} } from '${group.module}'\n`
  }
  text = text.replace(match[0], imports + replacement)
  writeFileSync(file, text)
  files++
  calls += count
  console.log(`${rel}: ${count}`)
}
console.log(`files ${files}, calls ${calls}`)
```


`remove-client-methods.mjs` deletes the eight methods from the `PathwaysClient` interface and the class, then the monitoring query helper and the two analytics exports:

Create `.tmp/s7c/remove-client-methods.mjs`:

```js
// Removes the moved methods from the PathwaysClient interface and the class, then the monitoring query helper and the two analytics exports.
import { readFileSync, writeFileSync } from 'node:fs'

import { allMethods, clientFile, memberBlock, methodBlock } from './client-blocks.mjs'

let text = readFileSync(clientFile, 'utf8')
for (const name of allMethods) {
  for (const block of [memberBlock(text, name), methodBlock(text, name)]) text = text.replace(block, '')
}
// The analytics exports sit between the class and the exported client instance.
const exportsAt = text.indexOf('/** Validated query string shared by the descriptive read')
text = text.slice(0, exportsAt) + text.slice(text.indexOf('export const pathwaysClient'))
// The monitoring query helper is the last block of the file.
const helperAt = text.indexOf('/** Fixed filter allowlist;')
if (text.indexOf('\n}\n', helperAt) + 3 !== text.length) throw new Error('the monitoring query helper is not the last block')
text = text.slice(0, helperAt).replace(/\n+$/, '\n')
writeFileSync(clientFile, text)
console.log(`removed ${allMethods.length} methods from the interface and the class, the monitoring query helper and the analytics exports`)
```


- [ ] **Step 3: Apply the plans**

```bash
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task2-edits.json
node .tmp/s7c/move-modules.mjs .tmp/s7c/task2-moves.json
git rm -q apps/web/src/lib/services/pathways-client.monitoring.test.ts
node .tmp/s7c/move-client-calls.mjs
node .tmp/s7c/count-calls.mjs
node .tmp/s7c/remove-client-methods.mjs
node .tmp/s7c/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts | awk -F', ' '{print NF " names removed"}'
git grep -n "analytics-insights-client" -- apps packages scripts | wc -l
```


Expected:

```text
10 replacements in 8 files
features/analytics/use-analytics-insights: 1
lib/api/analytics-insights.test: 1
moved 2 files, rewrote 2 specifiers and 0 contract paths
features/analytics/analytics-dashboard.tsx: 5
features/dashboard/action-kpi-row.tsx: 1
features/dashboard/pinned-charts.tsx: 2
features/dashboard/role-dashboard.tsx: 2
features/dashboard/role-overview/role-overview.tsx: 1
features/dashboard/role-overview/use-role-overview.ts: 1
files 6, calls 12
production calls 0 in 0 files
test calls 0 in 0 files
other mentions in 8 files
removed 8 methods from the interface and the class, the monitoring query helper and the analytics exports
23 names removed
0
```


`replace-exact` stops before writing when a count differs (10 replacements in 8 files). The move script moves the insights client and its test and rewrites two specifiers (the hook and the moved test). The call script prints each file it changes with its call count (12 calls in six files, as counted in Step 1), and the second `count-calls` run reports no call left. `trim-imports` removes the type and schema names that only the moved members used from the imports of `pathways-client.ts`. The last count says that no file names the old insights module.

- [ ] **Step 4: Tidy imports, prove the moved lines and the kept cases**

```bash
A=apps/web/src/lib/api
node .tmp/s7c/old-members.mjs .tmp/s7c/before/pathways-client.ts > .tmp/s7c/files/moved-original.ts
node .tmp/s7c/same-lines.mjs .tmp/s7c/files/moved-original.ts $A/dashboards.ts $A/analytics.ts dashboardsClient=members analyticsClient=members --list
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD apps/web/src) 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
F=apps/web/src
node .tmp/s7c/test-titles.mjs save .tmp/s7c/titles-after.json $F/lib/services/pathways-client.test.ts $F/features/analytics/analytics-dashboard.test.tsx $F/features/dashboard/role-dashboard-authorization.test.ts $F/features/dashboard/pinned-charts.test.tsx $F/features/dashboard/role-overview/role-overview.test.tsx $A/analytics-insights.test.ts $A/dashboards.test.ts $A/analytics.test.ts 2>&1 | tail -2
node .tmp/s7c/test-titles.mjs compare .tmp/s7c/titles-before.json .tmp/s7c/titles-after.json
node .tmp/s7c/mock-scan.mjs lib/services/pathways-client xx | tail -1
node .tmp/s7c/mock-scan.mjs lib/api/dashboards xx | tail -1
node .tmp/s7c/mock-scan.mjs lib/api/analytics xx | tail -1
git grep -nE "getMonitoringDashboard|getDashboardActionCounts|getRoleOverview|getSadddDashboard|getDescriptiveAnalytics|getSurveyAnalytics|getTimelineAnalytics|getAnalyticsExportPreview|descriptiveAnalyticsSearch" -- apps/web/src/lib/services | wc -l
```


Expected:

```text
1x }
1x const members = {
original lines 133, lost 0, added 2
Checked 17 files in <ms>. Fixed 7 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
files 8, tests 167, failed 0
before 134, after 167, lost 0, added 33
factories 36, naming 0
factories 4, naming 0
factories 2, naming 0
0
```


The `same-lines` proof reads the original that Step 1 kept: `lost 0`, every declaration line of the old members (133 lines) is in the two new files, and the two added lines are the second object literal and its closing brace. Biome rewrites 7 files (it sorts the new imports) and the typecheck is clean with the two baseline lines. The titles compare says `lost 0`: the 134 titles before are all in the 167 after, and the 33 added are the 21 dashboard and 15 analytics cases less the three titles that the old test files already held. The mock counts: 36 factories still name `pathways-client` (each keeps an empty client where nothing is left), four name `lib/api/dashboards` and two name `lib/api/analytics`. The last count is 0: no file under `lib/services` names a moved member.

- [ ] **Step 5: Run the whole web suite and commit**

```bash
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git status --short | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the dashboard and analytics callers and mocks to their clients and remove the old members

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
 Test Files  251 passed (251)
      Tests  2335 passed (2335)
$ pnpm exec biome check .
Checked 1508 files in <ms>. No fixes applied.
2
<n> files changed, 41 insertions(+), 307 deletions(-)
```


Web is 251 files and 2335 tests: `B_web` plus 2 files (the three new test files less the deleted monitoring test) and 45 more tests (the 84 new runs, less the 36 rows that ran the old client, the two deleted monitoring cases and the deleted dashboard case). The `grep -c` line counts the two renames git detects (the insights client and its test).

---

### Task 3: Lay out `features/analytics`, give it a public index and point its importers at it

**Files:**
- Move (`git mv`, 23 files): the files listed in `layout-map.json` below
- Create: `apps/web/src/features/analytics/index.ts`
- Modify: the imports of the moved files and of their importers (by `move-modules.mjs`), the `/analytics` route file (by `index-imports.mjs`), `apps/web/src/features/dashboard/pinned-charts.tsx`, `apps/web/e2e/monitoring-read.spec.ts`, `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`, `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (by `move-modules.mjs`)
- Create (gitignored): `.tmp/s7c/layout-map.json`, `task3-edits.json`, `routes-prelayout.txt`, `routes-layout.txt`

The move is one commit that renames files and rewrites specifiers, and nothing else: the test split and the component splits come after it, in their own commits, so a reviewer can compare renames and edits separately.

- [ ] **Step 1: Measure the build before the layout move**

Tasks 1 and 2 already changed what the shared chunks hold, so the route sizes of the Task 0 build are not the reference for the move. Build now and compare with the Task 0 table:

```bash
.tmp/s7c/build-routes.sh prelayout
git checkout -- apps/web/next-env.d.ts
node .tmp/s7c/compare-routes.mjs .tmp/s7c/routes-baseline.txt .tmp/s7c/routes-prelayout.txt
```


Expected:

```text
exit 0
ƒ Middleware                                                      103 kB
/collection/import: 435 kB -> 436 kB (+1.0)
/indicators/library: 280 kB -> 281 kB (+1.0)
/projects/[projectId]: 311 kB -> 305 kB (-6.0)
/projects/[projectId]/activities: 337 kB -> 333 kB (-4.0)
/projects/[projectId]/activities/[activityId]: 337 kB -> 333 kB (-4.0)
/projects/[projectId]/edit: 297 kB -> 291 kB (-6.0)
/projects/[projectId]/indicators: 284 kB -> 280 kB (-4.0)
/projects/new: 297 kB -> 291 kB (-6.0)
/settings/users: 287 kB -> 281 kB (-6.0)
routes 72, different 9
```


The build exits 0 and prints Middleware at `M0` (103 kB in the dry run). The compare line counts 72 routes, 9 of which differ from the Task 0 table: none is more than 1 kB bigger (`/collection/import` and `/indicators/library`, +1) and the other seven are 4 to 6 kB smaller, because the eight moved members and the insights client left the shared chunks of Tasks 1 and 2. That is the reference for the move: after the layout move the table must show no difference, and no route may be more than 1 kB bigger than the Task 0 table.

- [ ] **Step 2: Create the move map, the edits and the index**

`layout-map.json` lists every move (paths are relative to `apps/web/src`). Test files follow the file they test. `use-monitoring-read.ts` leaves the feature for `hooks/` (ruling 6). The four helper files that no folder names get the CR 3.5 `.utils` suffix (`aggregate-chart-options`, `analytics-location`, `analytics-reporting-periods`, `kpi-rows`):

Create `.tmp/s7c/layout-map.json`:

```json
{
 "features/analytics/analytics-charts.tsx": "features/analytics/components/analytics-charts.tsx",
 "features/analytics/analytics-charts.test.tsx": "features/analytics/components/analytics-charts.test.tsx",
 "features/analytics/analytics-coverage-map.tsx": "features/analytics/components/analytics-coverage-map.tsx",
 "features/analytics/analytics-coverage-map.test.tsx": "features/analytics/components/analytics-coverage-map.test.tsx",
 "features/analytics/analytics-dashboard.tsx": "features/analytics/components/analytics-dashboard.tsx",
 "features/analytics/analytics-dashboard.test.tsx": "features/analytics/components/analytics-dashboard.test.tsx",
 "features/analytics/analytics-export-preview.tsx": "features/analytics/components/analytics-export-preview.tsx",
 "features/analytics/analytics-insights-components.test.tsx": "features/analytics/components/analytics-insights-components.test.tsx",
 "features/analytics/budget-summary-card.tsx": "features/analytics/components/budget-summary-card.tsx",
 "features/analytics/indicator-trend-chart.tsx": "features/analytics/components/indicator-trend-chart.tsx",
 "features/analytics/insight-status.tsx": "features/analytics/components/insight-status.tsx",
 "features/analytics/participation-breakdown-panel.tsx": "features/analytics/components/participation-breakdown-panel.tsx",
 "features/analytics/project-coverage-map-panel.tsx": "features/analytics/components/project-coverage-map-panel.tsx",
 "features/analytics/project-map-card.tsx": "features/analytics/components/project-map-card.tsx",
 "features/analytics/use-analytics-insights.ts": "features/analytics/hooks/use-analytics-insights.ts",
 "features/analytics/use-project-map.ts": "features/analytics/hooks/use-project-map.ts",
 "features/analytics/use-monitoring-read.ts": "hooks/use-monitoring-read.ts",
 "features/analytics/aggregate-chart-options.ts": "features/analytics/aggregate-chart-options.utils.ts",
 "features/analytics/analytics-location-utils.ts": "features/analytics/analytics-location.utils.ts",
 "features/analytics/analytics-location-utils.test.ts": "features/analytics/analytics-location.utils.test.ts",
 "features/analytics/analytics-reporting-periods.ts": "features/analytics/analytics-reporting-periods.utils.ts",
 "features/analytics/analytics-reporting-periods.test.ts": "features/analytics/analytics-reporting-periods.utils.test.ts",
 "features/analytics/kpi-rows.ts": "features/analytics/kpi-rows.utils.ts"
}
```


`task3-edits.json` holds the exact replacements that no move rewrites: the five leaf imports of `pinned-charts.tsx` become one import of the index (it is applied after the move, so it names the new leaf paths), the e2e spec names the monitoring hook by relative path, and the two lists gain `analytics` first (so an edit by a slice below this one that appends a name does not collide with it; the direction list is matched by its opening line because Biome keeps it on several lines). Two more edits add `existsSync` to the imports of the direction test and a case that compares `indexedFeatures` with the features that own an `index.ts`: that case is the pin of the registration, and Step 4b proves it:

Create `.tmp/s7c/task3-edits.json`:

```json
[
 [
  "apps/web/src/features/dashboard/pinned-charts.tsx",
  "import { IndicatorProgressChart } from '@/features/analytics/components/analytics-charts'\nimport { InsightStatus, RestrictedInsight } from '@/features/analytics/components/insight-status'\nimport { activeIndicators, progressRows } from '@/features/analytics/kpi-rows.utils'\nimport { ParticipationBreakdownPanel } from '@/features/analytics/components/participation-breakdown-panel'\nimport {\n  type InsightsSelection,\n  canReadInsight,\n  useParticipationBreakdown,\n} from '@/features/analytics/hooks/use-analytics-insights'\n",
  "import {\n  IndicatorProgressChart,\n  type InsightsSelection,\n  InsightStatus,\n  ParticipationBreakdownPanel,\n  RestrictedInsight,\n  activeIndicators,\n  canReadInsight,\n  progressRows,\n  useParticipationBreakdown,\n} from '@/features/analytics'\n",
  1
 ],
 [
  "apps/web/src/import-direction.test.ts",
  "const indexedFeatures: readonly string[] = [\n  'projects',",
  "const indexedFeatures: readonly string[] = [\n  'analytics',\n  'projects',",
  1
 ],
 [
  "apps/web/src/import-direction.test.ts",
  "import { readFileSync, readdirSync } from 'node:fs'\n",
  "import { existsSync, readFileSync, readdirSync } from 'node:fs'\n",
  1
 ],
 [
  "apps/web/src/import-direction.test.ts",
  "  it('has Next optimize the barrel of each indexed feature so route bundles keep their size', () => {\n",
  "  it('lists every feature that has an index.ts as indexed', () => {\n    const features = path.join(src, 'features')\n    const withIndex = readdirSync(features).filter((name) =>\n      existsSync(path.join(features, name, 'index.ts')),\n    )\n    expect([...indexedFeatures].sort()).toEqual(withIndex.sort())\n  })\n\n  it('has Next optimize the barrel of each indexed feature so route bundles keep their size', () => {\n",
  1
 ],
 [
  "apps/web/next.config.ts",
  "optimizePackageImports: [\n        '@/features/projects',",
  "optimizePackageImports: [\n        '@/features/analytics',\n        '@/features/projects',",
  1
 ],
 [
  "apps/web/e2e/monitoring-read.spec.ts",
  "'../src/features/analytics/use-monitoring-read'",
  "'../src/hooks/use-monitoring-read'",
  1
 ]
]
```


The index lists the nine names and one type that files outside the feature use, by their leaf paths:

Create `apps/web/src/features/analytics/index.ts`:

```ts
// Public surface of the analytics feature for files outside it.
export { AnalyticsDashboard } from './components/analytics-dashboard'
export { IndicatorProgressChart } from './components/analytics-charts'
export { InsightStatus, RestrictedInsight } from './components/insight-status'
export { ParticipationBreakdownPanel } from './components/participation-breakdown-panel'
export {
  type InsightsSelection,
  canReadInsight,
  useParticipationBreakdown,
} from './hooks/use-analytics-insights'
export { activeIndicators, progressRows } from './kpi-rows.utils'
```


- [ ] **Step 3: Move, rewrite and register the indexed feature**

```bash
node .tmp/s7c/move-modules.mjs .tmp/s7c/layout-map.json > .tmp/s7c/out/t3-move.txt
tail -1 .tmp/s7c/out/t3-move.txt
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task3-edits.json
node .tmp/s7c/index-imports.mjs analytics
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
git diff HEAD -- apps/web/next.config.ts apps/web/src/import-direction.test.ts | grep "^[+-]" | grep -v "^+++\|^---"
```


Expected:

```text
moved 23 files, rewrote 24 specifiers and 7 contract paths
6 replacements in 4 files
1 leaf imports in 1 app files now name a feature index
Checked 34 files in <ms>. Fixed 4 files.
+        '@/features/analytics',
-import { readFileSync, readdirSync } from 'node:fs'
+import { existsSync, readFileSync, readdirSync } from 'node:fs'
+  'analytics',
+  it('lists every feature that has an index.ts as indexed', () => {
+    const features = path.join(src, 'features')
+    const withIndex = readdirSync(features).filter((name) =>
+      existsSync(path.join(features, name, 'index.ts')),
+    )
+    expect([...indexedFeatures].sort()).toEqual(withIndex.sort())
+  })
+
```


The script reports 23 moves with 24 specifiers and 7 contract paths rewritten (the contract paths are the strings of `ui-copy-cleanup.contract.test.ts` that read source files). The edit file applies 6 replacements in 4 files and `index-imports` changes the one app import that named a leaf (the `/analytics` route page). Biome fixes the import order of 4 of the 34 files. The diff prints the two list entries (`analytics` first in `indexedFeatures` of the direction test and in `optimizePackageImports` of `next.config.ts`), the added `existsSync` import and the new registration case.

- [ ] **Step 4: Check the move**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git grep -nE "features/analytics/" -- apps/web/src ':!apps/web/src/features/analytics' | cut -c1-150
git grep -n "use-monitoring-read" -- apps | cut -c1-130
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1509 files in <ms>. No fixes applied.
apps/web/src/features/dashboard/pinned-charts.test.tsx:24:vi.mock('@/features/analytics/hooks/use-analytics-insights', () => ({
apps/web/src/features/dashboard/pinned-charts.test.tsx:29:vi.mock('@/features/analytics/components/analytics-charts', () => ({
apps/web/src/features/ui-copy-cleanup.contract.test.ts:9:    'features/analytics/components/analytics-dashboard.tsx',
apps/web/src/features/ui-copy-cleanup.contract.test.ts:49:      'features/analytics/components/analytics-dashboard.tsx',
apps/web/src/features/ui-copy-cleanup.contract.test.ts:52:    ['features/analytics/components/analytics-dashboard.tsx', ': monitoringReadable'],
apps/web/src/features/ui-copy-cleanup.contract.test.ts:53:    ['features/analytics/components/analytics-dashboard.tsx', "row.mean ?? 'None yet'"],
apps/web/src/features/ui-copy-cleanup.contract.test.ts:83:    expect(source('features/analytics/components/analytics-dashboard.tsx')).not.toContain(
apps/web/src/features/ui-copy-cleanup.contract.test.ts:89:    const analytics = source('features/analytics/components/analytics-dashboard.tsx')
apps/web/src/features/ui-copy-cleanup.contract.test.ts:129:    expect(source('features/analytics/components/analytics-coverage-map.tsx')).toContain(
apps/web/e2e/monitoring-read.spec.ts:17:        import { useMonitoringRead } from '../src/hooks/use-monitoring-read';
apps/web/src/features/projects/indicators/components/project-indicators-workspace.reload.test.tsx:58:vi.mock('@/hooks/use-monitori
apps/web/src/features/projects/indicators/components/project-indicators-workspace.test.tsx:37:vi.mock('@/hooks/use-monitoring-read
apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx:21:import { useMonitoringRead } from '@/hook
 Test Files  251 passed (251)
      Tests  2336 passed (2336)
```


The typecheck is clean, `--noUnusedLocals` lists only the two baseline lines and Biome is clean. The first `git grep` lists the nine places outside the feature that still name a leaf by a path string and none that imports one: two `vi.mock` strings of `pinned-charts.test.tsx` (a mock names the module that the index re-exports from) and seven source paths of the copy contract test. The second lists the four places that name `use-monitoring-read` (the workspace, its two tests and the e2e spec, all at `src/hooks`). Web is 251 files and 2336 tests: Task 2 plus the one registration case of Step 3, and no file.

- [ ] **Step 4b: Prove the registration of `analytics`**

The direction test would still pass if `analytics` were missing from `indexedFeatures` (it would only check less) or from `optimizePackageImports`, so the new case compares the list with the features that own an `index.ts`, and the existing case compares `next.config.ts` with the list. Each entry is deleted once and the test must fail:

```bash
T=apps/web/src/import-direction.test.ts
N=apps/web/next.config.ts
run() { (cd apps/web && pnpm exec vitest run src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | cut -c1-150); }
cp $T .tmp/s7c/files/direction.bak
cp $N .tmp/s7c/files/next-config.bak
echo "unmutated"; run
echo "analytics left out of indexedFeatures"
sed -i "/^  'analytics',$/d" $T
run
cp .tmp/s7c/files/direction.bak $T
echo "analytics left out of optimizePackageImports"
sed -i "/^        '@\/features\/analytics',$/d" $N
run
cp .tmp/s7c/files/next-config.bak $N
cmp .tmp/s7c/files/direction.bak $T && cmp .tmp/s7c/files/next-config.bak $N && echo "both files restored"
```


Expected:

```text
unmutated
 Test Files  1 passed (1)
      Tests  6 passed (6)
analytics left out of indexedFeatures
 FAIL  src/import-direction.test.ts > feature public surfaces > lists every feature that has an index.ts as indexed
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
analytics left out of optimizePackageImports
 FAIL  src/import-direction.test.ts > feature public surfaces > has Next optimize the barrel of each indexed feature so route bundles keep their size
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
both files restored
```


The unmutated run passes. Without `analytics` in the list the new case fails (the list no longer equals the features that own an index), without it in the Next config the existing optimize case fails, and the last line says both files were restored byte for byte.

- [ ] **Step 5: Compare the route sizes and commit**

```bash
.tmp/s7c/build-routes.sh layout
git checkout -- apps/web/next-env.d.ts
node .tmp/s7c/compare-routes.mjs .tmp/s7c/routes-prelayout.txt .tmp/s7c/routes-layout.txt
node .tmp/s7c/compare-routes.mjs .tmp/s7c/routes-baseline.txt .tmp/s7c/routes-layout.txt | tail -1
git add -A apps
git status --short | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): give analytics a feature layout and a public index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
exit 0
ƒ Middleware                                                      103 kB
routes 72, different 0
routes 72, different 9
23
 34 files changed, 64 insertions(+), 41 deletions(-)
```


The build exits 0 with Middleware at `M0`. The first compare says `different 0`: no route changed across the layout move. The second compares with the Task 0 table and repeats the 9 routes of Step 1 (none more than 1 kB bigger). Git detects 23 renames, and the commit changes 34 files (23 renames and 11 edited files).

---

### Task 4: Split `analytics-dashboard.test.tsx` by concern

**Files:**
- Create: `apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx`, and in `apps/web/src/features/analytics/components/` the tests `analytics-dashboard.export.test.tsx`, `analytics-dashboard.cards.test.tsx`, `analytics-dashboard.survey.test.tsx`, `analytics-dashboard.survey-access.test.tsx`, `analytics-dashboard.timeline.test.tsx`
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.test.tsx` (cut down to the request and permission cases)
- Create (gitignored): `.tmp/s7c/task4-cut.json`, `task4-edits.json`, `titles-before-split.json`, `titles-after-split.json`

`analytics-dashboard.test.tsx` has 1693 lines and 67 cases that share one mock header of 233 lines and one `beforeEach`. It is the characterization suite for the component splits of Tasks 5 to 7, so it is split first and the split is proven line by line (ruling 7). The mock registrations, the hoisted state objects, the builders and the two default setups move to one fixture module that every file imports before the component (an import is evaluated in order, so its `vi.mock` calls are registered before the component loads). Every case body is copied verbatim by line range. The unchanged tests then run against the unsplit component before any of it moves, which is the guarantee Tasks 5 to 7 rely on.

- [ ] **Step 1: Keep the original and the test titles**

```bash
F=apps/web/src/features/analytics/components
git hash-object $F/analytics-dashboard.test.tsx | cut -c1-8
cp $F/analytics-dashboard.test.tsx .tmp/s7c/before/analytics-dashboard.test.tsx
node .tmp/s7c/count-it.mjs $F/analytics-dashboard.test.tsx | tail -1
node .tmp/s7c/test-titles.mjs save .tmp/s7c/titles-before-split.json $F/analytics-dashboard.test.tsx 2>&1 | tail -2
```


Expected:

```text
48f724e5
total: it 60, describe 7, expect 258
files 1, tests 67, failed 0
```


The hash is the one the cut plan pins (`cut.mjs` writes nothing when it differs: recount the line ranges against the new file before carrying on). The original holds 60 `it` blocks (67 cases, because three `it.each` tables add rows), 7 `describe` blocks and 258 assertions; the titles file holds the 67 case titles.

- [ ] **Step 2: Create the cut plan and the edits**

`task4-cut.json` builds the fixture module (hoisted objects, the mock registrations, the builders, `loadMapsDashboard`, and the two default setups as functions) and the six test files from line ranges of the original; each test file opens with the imports it uses, the outer `describe` with the shared `beforeEach` and `afterEach`, and for the survey files the inner `describe` with its `beforeEach`. The survey cases are split three ways: rendering and period cases (`survey`), role access cases (`survey-access`) and the timeline cases (`timeline`). `task4-edits.json` rewrites the relative specifiers of the fixture to the alias form. Two of them cannot keep the leaf path, because `import-direction.test.ts` lets only tests (and the feature itself) import a feature by a leaf path: the type query of the hooks mock becomes `Record<string, unknown>` and the maps loader imports the dashboard through `@/features/analytics`:

Create `.tmp/s7c/task4-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.test.tsx",
 "hash": "48f724e5",
 "files": {
  "apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx": [
   "import { screen } from '@testing-library/react'",
   "import { vi } from 'vitest'",
   "",
   "import { rulesHumanClient as rules } from '@/lib/api/rules'",
   "",
   [10, 49],
   "export { alertHook, api, coverageMap, currentAccess, download, insights, previewExport, toastError }",
   "export const rulesHumanClient = rules",
   "",
   [51, 168],
   "",
   [170, 220],
   "",
   [222, 233],
   "",
   "export const resetAnalyticsMocks = () => {",
   [237, 285],
   "}",
   "",
   "export const surveyDefaults = () => {",
   [1056, 1083],
   "}",
   "",
   [1086, 1102]
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { api, coverageMap, currentAccess, indicator, insights, kpiCard, loadMapsDashboard, monitoring, project, resetAnalyticsMocks, available, missing } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   [294, 677],
   "",
   [916, 925],
   "})"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.export.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { api, currentAccess, download, previewExport, project, resetAnalyticsMocks, toastError } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   [678, 914],
   "})"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { alertHook, api, currentAccess, indicator, monitoring, project, resetAnalyticsMocks, rulesHumanClient, suppressed } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard, countOpenAlerts } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   [927, 1022],
   "",
   [1024, 1052],
   "})"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.survey.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { api, indicator, project, resetAnalyticsMocks, suppressed, surveyDefaults, surveyGroup, available, missing, zero } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   "  describe('F9 survey and timeline analytics views', () => {",
   "    beforeEach(() => {",
   "      surveyDefaults()",
   "    })",
   "",
   [1104, 1308],
   "",
   [1458, 1501],
   "",
   [1516, 1611],
   "  })",
   "})"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.survey-access.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { api, currentAccess, indicator, monitoring, resetAnalyticsMocks, surveyDefaults, surveyGroup } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   "  describe('F9 survey and timeline analytics views', () => {",
   "    beforeEach(() => {",
   "      surveyDefaults()",
   "    })",
   "",
   [1310, 1456],
   "",
   [1503, 1514],
   "  })",
   "})"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.timeline.test.tsx": [
   "/* @vitest-environment jsdom */",
   "",
   "import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'",
   "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'",
   "",
   "import { api, project, resetAnalyticsMocks, surveyDefaults, available, missing, zero } from '@/test/fixtures/analytics-dashboard-fixtures'",
   "",
   "import { AnalyticsDashboard } from './analytics-dashboard'",
   "",
   "describe('Analytics dashboard request dependencies', () => {",
   "  beforeEach(() => {",
   "    resetAnalyticsMocks()",
   "  })",
   "",
   "  afterEach(() => {",
   [289, 291],
   "  })",
   "",
   "  describe('F9 survey and timeline analytics views', () => {",
   "    beforeEach(() => {",
   "      surveyDefaults()",
   "    })",
   "",
   [1613, 1691],
   "  })",
   "})"
  ]
 }
}
```


Create `.tmp/s7c/task4-edits.json`:

```json
[
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "importOriginal<typeof import('../hooks/use-analytics-insights')>()", "importOriginal<Record<string, unknown>>()", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "'../hooks/use-analytics-insights'", "'@/features/analytics/hooks/use-analytics-insights'", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "'./analytics-charts'", "'@/features/analytics/components/analytics-charts'", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "'./analytics-coverage-map'", "'@/features/analytics/components/analytics-coverage-map'", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "await import('./analytics-dashboard')", "await import('@/features/analytics')", 1]
]
```


- [ ] **Step 3: Apply the plan**

```bash
F=apps/web/src/features/analytics/components
X=apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx
node .tmp/s7c/cut.mjs .tmp/s7c/task4-cut.json
sed -i -E "s/^ *const (available|idle|indicator|kpiCard|loadMapsDashboard|missing|monitoring|project|suppressed|surveyGroup|zero) /export const \1 /" $X
grep -c "^export const" $X
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task4-edits.json
node .tmp/s7c/trim-imports.mjs $X $F/analytics-dashboard.test.tsx $F/analytics-dashboard.export.test.tsx $F/analytics-dashboard.cards.test.tsx $F/analytics-dashboard.survey.test.tsx $F/analytics-dashboard.survey-access.test.tsx $F/analytics-dashboard.timeline.test.tsx | cut -c1-150
wc -l $X $F/analytics-dashboard*.test.tsx
```


Expected:

```text
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx: 332 lines
apps/web/src/features/analytics/components/analytics-dashboard.test.tsx: 416 lines
apps/web/src/features/analytics/components/analytics-dashboard.export.test.tsx: 258 lines
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx: 147 lines
apps/web/src/features/analytics/components/analytics-dashboard.survey.test.tsx: 374 lines
apps/web/src/features/analytics/components/analytics-dashboard.survey-access.test.tsx: 187 lines
apps/web/src/features/analytics/components/analytics-dashboard.timeline.test.tsx: 106 lines
14
5 replacements in 1 files
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx: removed nothing
apps/web/src/features/analytics/components/analytics-dashboard.test.tsx: removed available, missing
apps/web/src/features/analytics/components/analytics-dashboard.export.test.tsx: removed project
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx: removed project, suppressed
apps/web/src/features/analytics/components/analytics-dashboard.survey.test.tsx: removed project
apps/web/src/features/analytics/components/analytics-dashboard.survey-access.test.tsx: removed indicator, monitoring
apps/web/src/features/analytics/components/analytics-dashboard.timeline.test.tsx: removed project
  332 apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx
  147 apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx
  258 apps/web/src/features/analytics/components/analytics-dashboard.export.test.tsx
  187 apps/web/src/features/analytics/components/analytics-dashboard.survey-access.test.tsx
  374 apps/web/src/features/analytics/components/analytics-dashboard.survey.test.tsx
  416 apps/web/src/features/analytics/components/analytics-dashboard.test.tsx
  106 apps/web/src/features/analytics/components/analytics-dashboard.timeline.test.tsx
 1820 total
```


The cut writes the seven files with their line counts: the fixture of 332 lines and six tests of 147 to 416 lines, all below the 600 line limit for tests (the original had 1693). The count of `export const` lines in the fixture is 14 (the builders, `idle`, the default setups and the survey constants; the hoisted objects are exported in one `export { ... }` statement because Vitest refuses `export const x = vi.hoisted(...)`, and `rulesHumanClient` is re-bound by a constant because Vitest does not hand a mocked module's binding on through a re-export). The four relative specifiers of the fixture are rewritten to the alias form. `trim-imports` removes the names a header listed but its file does not use.

- [ ] **Step 4: Prove the split**

`same-lines.mjs` reads the saved original and says which declaration lines of it are not in the seven new files (the alias forms of the four fixture specifiers are mapped back to the relative ones); it runs before Biome formats the files. Then Biome formats them, the six test files run, `test-titles.mjs` compares the case titles and `count-it.mjs` the numbers of cases and assertions:

```bash
F=apps/web/src/features/analytics/components
X=apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx
node .tmp/s7c/same-lines.mjs .tmp/s7c/before/analytics-dashboard.test.tsx $X $F/analytics-dashboard*.test.tsx "@/features/analytics/hooks/=../hooks/" "@/features/analytics/components/=./" "importOriginal<Record<string, unknown>>=importOriginal<typeof import('../hooks/use-analytics-insights')>" "import('@/features/analytics')=import('./analytics-dashboard')" --list
git add -N apps/web/src
pnpm exec biome check --write $X $F/analytics-dashboard*.test.tsx 2>&1 | tail -2
(cd apps/web && pnpm exec vitest run src/features/analytics/components/analytics-dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]|FAIL|Error")
node .tmp/s7c/test-titles.mjs save .tmp/s7c/titles-after-split.json $F/analytics-dashboard.test.tsx $F/analytics-dashboard.export.test.tsx $F/analytics-dashboard.cards.test.tsx $F/analytics-dashboard.survey.test.tsx $F/analytics-dashboard.survey-access.test.tsx $F/analytics-dashboard.timeline.test.tsx 2>&1 | tail -2
node .tmp/s7c/test-titles.mjs compare .tmp/s7c/titles-before-split.json .tmp/s7c/titles-after-split.json
node .tmp/s7c/count-it.mjs .tmp/s7c/before/analytics-dashboard.test.tsx | tail -1
node .tmp/s7c/count-it.mjs $F/analytics-dashboard.test.tsx $F/analytics-dashboard.export.test.tsx $F/analytics-dashboard.cards.test.tsx $F/analytics-dashboard.survey.test.tsx $F/analytics-dashboard.survey-access.test.tsx $F/analytics-dashboard.timeline.test.tsx | tail -1
```


Expected:

```text
2x }
1x { alertHook, api, coverageMap, currentAccess, download, insights, previewExport, toastError }
1x const rulesHumanClient = rules
19x })
1x const resetAnalyticsMocks = () => {
1x const surveyDefaults = () => {
5x describe('Analytics dashboard request dependencies', () => {
7x beforeEach(() => {
6x resetAnalyticsMocks()
5x afterEach(() => {
5x cleanup()
5x vi.clearAllMocks()
5x vi.useRealTimers()
2x describe('F9 survey and timeline analytics views', () => {
3x surveyDefaults()
original lines 1549, lost 0, added 68
Checked 7 files in <ms>. Fixed 7 files.
 Test Files  6 passed (6)
      Tests  67 passed (67)
files 6, tests 67, failed 0
before 67, after 67, lost 0, added 0
total: it 60, describe 7, expect 258
total: it 60, describe 14, expect 258
```


`same-lines` says `lost 0` over the 1549 declaration lines of the original, so every line of every case body, helper and mock is in one of the seven files; the added lines are the headers: the outer `describe`, the `beforeEach` and `afterEach` shells, the two default setups as functions, the survey `describe` shell and the one export statement. Biome formats the seven files. The six test files run alone first: 67 tests pass. The titles compare says `lost 0` over the 67 titles before and after (`added 0`), and `count-it` reports 60 `it` blocks and 258 assertions both before and after (the 14 `describe` blocks are the 7 of the original plus a shell in each new file).

- [ ] **Step 5: Check, run the whole web suite and commit**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): split the analytics dashboard test by concern around one fixture module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1515 files in <ms>. No fixes applied.
 Test Files  256 passed (256)
      Tests  2336 passed (2336)
<n> files changed, 1468 insertions(+), 1282 deletions(-)
```


The typecheck is clean and `--noUnusedLocals` lists only the two baseline lines. Web is 256 files and 2336 tests: the 251 files of Task 3 plus the five new test files (the original stays as the first of the six; the fixture is not a test file), and the same 67 cases, so the test count does not change. Seven files change in the commit (the fixture and the six tests).

---

### Task 5: Move the private panels, the copy, the helpers and the alert count out of `analytics-dashboard.tsx`

**Files:**
- Create: `apps/web/src/features/analytics/analytics.copy.ts`, `analytics.utils.ts`, `analytics.reads.ts`, `analytics.utils.test.ts`, `analytics.copy.test.ts`, and in `components/` the files `chart-panel.tsx`, `survey-analytics-panel.tsx`, `timeline-analytics-panel.tsx`, `descriptive-statistics-table.tsx` and `analytics-panels.test.tsx`
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.tsx` (rebuilt from its own line ranges), `analytics-dashboard.cards.test.tsx`, `apps/web/src/features/ui-copy-cleanup.contract.test.ts`
- Create (gitignored): `.tmp/s7c/task5-cut.json`, `task5-edits.json`, `task5b-edits.json`, `mutate-utils.sh`, `mutate-panels.sh`, `before/analytics-dashboard.tsx`

The component file has its panels, constants and helpers around a 1206 line function. They move first, verbatim, so the later hook extraction (Task 6) and section extraction (Task 7) read a function and nothing else. The constants (`analysisViews`, `visualizationTypes`, the survey messages, `exportFormats`, the two labels) go to `analytics.copy.ts`; the pure helpers (`businessDateInManila`, `surveyErrorKindFor`, `analyticsCellValue`, `surveyGroupRows`, `formatShare`) to `analytics.utils.ts`; `countOpenAlerts` with its two constants to `analytics.reads.ts`; the five private components to four files of `components/`. Each declaration gets `export` and nothing else, and `cut.mjs` writes the files from line ranges of the component, so no body line is typed again.

- [ ] **Step 1: Keep the original**

```bash
F=apps/web/src/features/analytics/components
git hash-object $F/analytics-dashboard.tsx | cut -c1-8
wc -l < $F/analytics-dashboard.tsx
cp $F/analytics-dashboard.tsx .tmp/s7c/before/analytics-dashboard.tsx
git grep -n "countOpenAlerts" -- apps | cut -c1-120
git grep -nE "features/analytics/components/analytics-dashboard|from '\./analytics-dashboard'" -- apps/web/src ':!apps/web/src/features/analytics/components/*.test.tsx' | cut -c1-120
```


Expected:

```text
63032fd4
1746
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx:16:import { AnalyticsDashboard, countOpenA
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx:126:  describe('countOpenAlerts', () => {
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx:139:      await expect(countOpenAlerts('pr
apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx:149:      const result = await countOpenAl
apps/web/src/features/analytics/components/analytics-dashboard.tsx:153:export const countOpenAlerts = async (projectId: 
apps/web/src/features/analytics/components/analytics-dashboard.tsx:251:    (signal) => countOpenAlerts(projectId, signal
apps/web/src/features/ui-copy-cleanup.contract.test.ts:9:    'features/analytics/components/analytics-dashboard.tsx',
apps/web/src/features/ui-copy-cleanup.contract.test.ts:49:      'features/analytics/components/analytics-dashboard.tsx',
apps/web/src/features/ui-copy-cleanup.contract.test.ts:52:    ['features/analytics/components/analytics-dashboard.tsx', 
apps/web/src/features/ui-copy-cleanup.contract.test.ts:53:    ['features/analytics/components/analytics-dashboard.tsx', 
apps/web/src/features/ui-copy-cleanup.contract.test.ts:83:    expect(source('features/analytics/components/analytics-das
apps/web/src/features/ui-copy-cleanup.contract.test.ts:89:    const analytics = source('features/analytics/components/an
```


The hash and the length (1746 lines, one more than the S7b tip because Task 2 added the dashboards import) are the ones the cut plan pins. `countOpenAlerts` is defined and called in the component and read by the cards test (6 lines), and the copy contract test names the component file in 6 places, of which the "None yet" mean cell and the import line move with the text (Step 2).

- [ ] **Step 2: Create the cut plan, the edits and the helper test**

`task5-cut.json` lists, for each of the eight files, the literal header lines (`'use client'` for components and hooks, then the source's own import block, then the new imports of the neighbours) and the line ranges of the source. A declaration line that needs `export` is a literal line, the same text with `export ` in front; `same-lines` reads it back without the keyword. The component is rebuilt from its own lines 178 to 1383 with the seven new imports:

Create `.tmp/s7c/task5-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "63032fd4",
 "files": {
  "apps/web/src/features/analytics/analytics.copy.ts": [
   "@imports",
   "",
   "export const analysisViews = [",
   [104, 108],
   "export const visualizationTypes = [",
   [110, 114],
   "export type AnalysisView = (typeof analysisViews)[number]['value']",
   "export type VisualizationType = (typeof visualizationTypes)[number]['value']",
   "",
   "export type SurveyErrorKind = 'restricted' | 'period' | 'retry'",
   "export const SURVEY_RESTRICTED_MESSAGE = 'Survey improvement is restricted for your role.'",
   "export const SURVEY_PERIOD_MESSAGE = 'This reporting period cannot be used for survey results.'",
   "export const SURVEY_CLOSED_PERIOD_MESSAGE =",
   [133, 133],
   "export const SURVEY_FROZEN_CAPTION =",
   [135, 135],
   "",
   "export const exportFormats = ['CSV', 'XLS', 'XLSX', 'PDF'] as const",
   "export type ExportFormat = (typeof exportFormats)[number]",
   "",
   "export const activityFallbackLabel = 'Activity (name unavailable)'",
   "",
   "export const sectionLabels: Record<DescriptiveAnalytics['distributions'][number]['section'], string> = {",
   [1659, 1664]
  ],
  "apps/web/src/features/analytics/analytics.utils.ts": [
   "@imports",
   "import { activityFallbackLabel, type SurveyErrorKind } from './analytics.copy'",
   "",
   "export const businessDateInManila = (date = new Date()) => {",
   [119, 127],
   "",
   [137, 137],
   "export const surveyErrorKindFor = (caught: unknown): SurveyErrorKind => {",
   [139, 144],
   "",
   [1401, 1405],
   "export const analyticsCellValue = (cell: MetricCell, kind: 'percent' | 'pp' | 'count' = 'count') =>",
   [1407, 1407],
   "",
   [1411, 1415],
   "export const surveyGroupRows = (",
   [1417, 1425],
   "",
   "export const formatShare = (share: string | null) =>",
   [1667, 1667]
  ],
  "apps/web/src/features/analytics/analytics.reads.ts": [
   "@imports",
   "",
   [146, 147],
   "",
   [149, 153],
   [154, 173]
  ],
  "apps/web/src/features/analytics/components/chart-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   "export const ChartPanel = ({",
   [1386, 1399],
   "",
   [1739, 1739],
   "export const UnavailableChart = ({",
   [1741, 1746]
  ],
  "apps/web/src/features/analytics/components/survey-analytics-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { SURVEY_FROZEN_CAPTION, SURVEY_PERIOD_MESSAGE, type SurveyErrorKind } from '../analytics.copy'",
   "import { analyticsCellValue, surveyGroupRows } from '../analytics.utils'",
   "import { UnavailableChart } from './chart-panel'",
   "",
   [1427, 1431],
   "export const SurveyAnalyticsPanel = ({",
   [1433, 1567]
  ],
  "apps/web/src/features/analytics/components/timeline-analytics-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { analyticsCellValue } from '../analytics.utils'",
   "import { UnavailableChart } from './chart-panel'",
   "",
   [1569, 1569],
   "export const TimelineAnalyticsPanel = ({",
   [1571, 1656]
  ],
  "apps/web/src/features/analytics/components/descriptive-statistics-table.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { sectionLabels } from '../analytics.copy'",
   "import { formatShare } from '../analytics.utils'",
   "",
   "export const DescriptiveStatisticsTable = ({ data }: { data: DescriptiveAnalytics }) => (",
   [1670, 1737]
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE, analysisViews, exportFormats, visualizationTypes, type AnalysisView, type ExportFormat, type SurveyErrorKind, type VisualizationType } from '../analytics.copy'",
   "import { businessDateInManila, surveyErrorKindFor } from '../analytics.utils'",
   "import { countOpenAlerts } from '../analytics.reads'",
   "import { ChartPanel, UnavailableChart } from './chart-panel'",
   "import { DescriptiveStatisticsTable } from './descriptive-statistics-table'",
   "import { SurveyAnalyticsPanel } from './survey-analytics-panel'",
   "import { TimelineAnalyticsPanel } from './timeline-analytics-panel'",
   "",
   [178, 1383]
  ]
 }
}
```


`task5-edits.json` holds the three replacements the move needs outside the component: the cards test reads `countOpenAlerts` from `analytics.reads`, and the copy contract test follows the two strings that moved (the "None yet" mean cell, and the import line, which is now two imports in two files):

Create `.tmp/s7c/task5-edits.json`:

```json
[
 ["apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx", "import { AnalyticsDashboard, countOpenAlerts } from './analytics-dashboard'", "import { countOpenAlerts } from '../analytics.reads'\nimport { AnalyticsDashboard } from './analytics-dashboard'", 1],
 ["apps/web/src/features/ui-copy-cleanup.contract.test.ts", "['features/analytics/components/analytics-dashboard.tsx', \"row.mean ?? 'None yet'\"]", "['features/analytics/components/descriptive-statistics-table.tsx', \"row.mean ?? 'None yet'\"]", 1],
 ["apps/web/src/features/ui-copy-cleanup.contract.test.ts", "    expect(analytics).toContain(\n      \"import { metricUnavailableLabel, overviewMetricLabel } from '@/features/projects'\",\n    )\n", "    expect(source('features/analytics/components/survey-analytics-panel.tsx')).toContain(\n      \"import { metricUnavailableLabel } from '@/features/projects'\",\n    )\n    expect(source('features/analytics/analytics.utils.ts')).toContain(\n      \"import { overviewMetricLabel } from '@/features/projects'\",\n    )\n", 1]
]
```


The helper test pins the five helpers with concrete values (the Manila date at the day boundary, the error kinds, the unit of a cell, the activity labels, the share format), because before this task only the component tests reached them:

Create `apps/web/src/features/analytics/analytics.utils.test.ts`:

```ts
import { type SurveyAnalytics, type SurveyGroup, missingMetric, numericMetric } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import type { ActivitySummary } from '@/types/pathways'

import { activityFallbackLabel } from './analytics.copy'
import {
  analyticsCellValue,
  businessDateInManila,
  formatShare,
  surveyErrorKindFor,
  surveyGroupRows,
} from './analytics.utils'

const group = (key: string) => ({ key }) as SurveyGroup
const activity = (id: string, title: string) => ({ id, title }) as ActivitySummary

describe('analytics dashboard helpers', () => {
  it('reads the business date in Manila, not in UTC', () => {
    expect(businessDateInManila(new Date('2026-03-31T15:59:00Z'))).toBe('2026-03-31')
    expect(businessDateInManila(new Date('2026-03-31T16:00:00Z'))).toBe('2026-04-01')
  })

  it.each([
    [{ status: 403 }, 'restricted'],
    [{ status: 400 }, 'period'],
    [{ status: 500 }, 'retry'],
    [{ status: '403' }, 'retry'],
    [new Error('offline'), 'retry'],
    [null, 'retry'],
    ['403', 'retry'],
  ])('classifies the survey error %j as %s', (caught, kind) => {
    expect(surveyErrorKindFor(caught)).toBe(kind)
  })

  it('shows a real zero with its unit and unavailable cells as readable copy', () => {
    expect(analyticsCellValue(numericMetric('0'))).toBe('0')
    expect(analyticsCellValue(numericMetric('62'), 'percent')).toBe('62%')
    expect(analyticsCellValue(numericMetric('22'), 'pp')).toBe('22pp')
    expect(analyticsCellValue(numericMetric('1200'))).toBe('1,200')
    expect(analyticsCellValue(missingMetric('NO_PAIRED_ASSESSMENTS'), 'percent')).not.toMatch(/%$/)
    expect(analyticsCellValue({ state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' })).toBe(
      'Suppressed (fewer than 5)',
    )
  })

  it('maps activity keys to titles and keeps the cohort row first', () => {
    const data = {
      overall: group('OVERALL'),
      byActivity: [group('a-1'), group('gone')],
    } as unknown as SurveyAnalytics
    const rows = surveyGroupRows(data, [activity('a-1', 'Soil workshop')])
    expect(rows.map((row) => [row.key, row.label])).toEqual([
      ['OVERALL', 'All activities (cohort change)'],
      ['a-1', 'Soil workshop'],
      ['gone', activityFallbackLabel],
    ])
    expect(activityFallbackLabel).toBe('Activity (name unavailable)')
  })

  it('formats a share as a one-decimal percent and withholds a null share', () => {
    expect(formatShare('0.256')).toBe('25.6%')
    expect(formatShare('1')).toBe('100.0%')
    expect(formatShare(null)).toBe('Withheld')
  })
})
```


- [ ] **Step 3: Apply the plan and prove the move**

`same-lines` runs before Biome formats the files and before the imports are trimmed away from its view (it reads only the lines after the import block):

```bash
F=apps/web/src/features/analytics
node .tmp/s7c/cut.mjs .tmp/s7c/task5-cut.json
NEW="$F/analytics.copy.ts $F/analytics.utils.ts $F/analytics.reads.ts $F/components/chart-panel.tsx $F/components/survey-analytics-panel.tsx $F/components/timeline-analytics-panel.tsx $F/components/descriptive-statistics-table.tsx"
node .tmp/s7c/trim-imports.mjs $NEW $F/components/analytics-dashboard.tsx | awk -F': removed ' '{n=split($2,a,", "); sub(".*/","",$1); print $1 ": " n " names removed"}'
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task5-edits.json
node .tmp/s7c/same-lines.mjs .tmp/s7c/before/analytics-dashboard.tsx $NEW $F/components/analytics-dashboard.tsx --list
git add -N apps/web/src
pnpm exec biome check --write $NEW $F/components/analytics-dashboard.tsx $F/analytics.utils.test.ts $F/components/analytics-dashboard.cards.test.tsx apps/web/src/features/ui-copy-cleanup.contract.test.ts 2>&1 | tail -2
wc -l $NEW $F/components/analytics-dashboard.tsx | sed "s#$F/##"
```


Expected:

```text
apps/web/src/features/analytics/analytics.copy.ts: 135 lines
apps/web/src/features/analytics/analytics.utils.ts: 147 lines
apps/web/src/features/analytics/analytics.reads.ts: 128 lines
apps/web/src/features/analytics/components/chart-panel.tsx: 126 lines
apps/web/src/features/analytics/components/survey-analytics-panel.tsx: 246 lines
apps/web/src/features/analytics/components/timeline-analytics-panel.tsx: 192 lines
apps/web/src/features/analytics/components/descriptive-statistics-table.tsx: 173 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 1315 lines
analytics.copy.ts: 84 names removed
analytics.utils.ts: 80 names removed
analytics.reads.ts: 84 names removed
chart-panel.tsx: 83 names removed
survey-analytics-panel.tsx: 75 names removed
timeline-analytics-panel.tsx: 78 names removed
descriptive-statistics-table.tsx: 83 names removed
analytics-dashboard.tsx: 6 names removed
3 replacements in 2 files

original lines 1611, lost 0, added 0
Checked 11 files in <ms>. Fixed 9 files.
   40 analytics.copy.ts
   52 analytics.utils.ts
   30 analytics.reads.ts
   30 components/chart-panel.tsx
  160 components/survey-analytics-panel.tsx
   99 components/timeline-analytics-panel.tsx
   76 components/descriptive-statistics-table.tsx
 1321 components/analytics-dashboard.tsx
 1808 total
```


The cut writes eight files from line ranges. `trim-imports` removes from each file the names of the shared import block that it does not use (the first three files are not components, so the whole icon, React and UI list goes). The edit file applies 3 replacements in 2 files. `same-lines` says `lost 0` over the 1611 declaration lines of the original and `added 0`: the `export` keywords are literal lines that it reads without the keyword. Biome formats 9 of the 11 files. The new files are 30 to 246 lines and the component is 1321 lines; its hash is the one the next task pins.

- [ ] **Step 4: Run the tests and prove the helper test**

The helper test, the component tests of Task 4 (unchanged apart from the one import) and the copy contract run against the moved code. Then each helper is changed once and the helper test must fail:

```bash
(cd apps/web && pnpm exec vitest run src/features/analytics src/features/ui-copy-cleanup.contract.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
 Test Files  13 passed (13)
      Tests  129 passed (129)
```


The helper test, the six dashboard test files, the other tests of the feature and the copy contract pass: 13 files and 129 tests.

Create `.tmp/s7c/mutate-utils.sh`:

```bash
U=apps/web/src/features/analytics
T=src/features/analytics/analytics.utils.test.ts
run() { (cd apps/web && timeout 300 pnpm exec vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]" | sort -u); }
mutate() {
  # Usage: mutate <label> <file> <sed expression>; changes one thing, runs the helper test and restores the file.
  cp "$2" .tmp/s7c/files/mutant.bak
  sed -i "$3" "$2"
  if cmp -s "$2" .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run $T
  cp .tmp/s7c/files/mutant.bak "$2"
}
cp $U/analytics.utils.ts .tmp/s7c/files/utils.orig
cp $U/analytics.copy.ts .tmp/s7c/files/copy.orig
echo "unmutated"; run $T
mutate "business date in UTC" $U/analytics.utils.ts "s/timeZone: 'Asia\/Manila'/timeZone: 'UTC'/"
mutate "403 no longer restricted" $U/analytics.utils.ts 's/status === 403 ?/status === 401 ?/'
mutate "400 no longer a period error" $U/analytics.utils.ts "s/status === 400 ? 'period'/status === 401 ? 'period'/"
mutate "count cells shown as percent" $U/analytics.utils.ts "s/kind: 'percent' | 'pp' | 'count' = 'count'/kind: 'percent' | 'pp' | 'count' = 'percent'/"
mutate "group label lookup uses the title" $U/analytics.utils.ts 's/activity.id === group.key/activity.id !== group.key/'
mutate "missing activity label blank" $U/analytics.utils.ts 's/?? activityFallbackLabel/?? ""/'
mutate "share scaled by ten" $U/analytics.utils.ts 's/Number(share) \* 100/Number(share) * 10/'
mutate "null share shown as zero" $U/analytics.utils.ts "s/'Withheld'/'0.0%'/"
mutate "fallback label text changed" $U/analytics.copy.ts "s/Activity (name unavailable)/Activity/"
cmp .tmp/s7c/files/utils.orig $U/analytics.utils.ts && cmp .tmp/s7c/files/copy.orig $U/analytics.copy.ts && echo "both files restored"
```


```bash
bash .tmp/s7c/mutate-utils.sh
```


Expected:

```text
unmutated
      Tests  11 passed (11)
 Test Files  1 passed (1)
business date in UTC
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
403 no longer restricted
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
400 no longer a period error
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
count cells shown as percent
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
group label lookup uses the title
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
missing activity label blank
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
share scaled by ten
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
null share shown as zero
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
fallback label text changed
      Tests  1 failed | 10 passed (11)
 Test Files  1 failed (1)
both files restored
```


The unmutated run passes (11 tests). Each of the nine mutations (the business date in UTC, a 403 no longer restricted, a 400 no longer a period error, a count cell shown as a percent, the group label lookup, a missing activity label, the share scaled by ten, a null share shown as zero, the fallback label text) fails exactly one case, and the last line says both files were restored byte for byte.

- [ ] **Step 4b: Pin the four moved panels, the copy constants and the alert count request**

The old-versus-new comparison was the only guard of what moved in Step 3. A mutation survey of the six moved files (each label, tooltip, tone, unit, column and condition changed once, 161 mutants, run against the 105 tests of the feature) left 109 alive: the dashboard tests reach the timeline and survey panels only through whole-dashboard renders that never read a card tooltip, a tone or a unit, nothing reads the three tables of `DescriptiveStatisticsTable`, the default title of `UnavailableChart`, the labels of the analysis views, the visualization types and the five descriptive sections, or the status list and the page size that `countOpenAlerts` sends. `analytics-panels.test.tsx` (25 tests) renders each panel with props: the cards (label, tooltip, value, tone class), the tables row by row, every loading, error and empty state and the Retry button; `analytics.copy.test.ts` (3 tests) pins the three lists of copy; one added assertion of the cards test pins the three statuses and the page size. The tests are written against the moved files, so they also pass against the old code (the same lines), and the mutation run below shows that each fails when a line of the moved code changes.

Create `apps/web/src/features/analytics/components/analytics-panels.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivitySummary } from '@/types/pathways'
import type { DescriptiveAnalytics, SurveyAnalytics, TimelineAnalytics } from '@pathways/shared'

import { SURVEY_FROZEN_CAPTION, SURVEY_PERIOD_MESSAGE } from '../analytics.copy'
import { ChartPanel, UnavailableChart } from './chart-panel'
import { DescriptiveStatisticsTable } from './descriptive-statistics-table'
import { SurveyAnalyticsPanel } from './survey-analytics-panel'
import { TimelineAnalyticsPanel } from './timeline-analytics-panel'

vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

const uuid = '11111111-1111-4111-8111-111111111111'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
const gap = (state: 'MISSING' | 'SUPPRESSED' | 'NOT_APPLICABLE', reason: string | null = null) =>
  ({ state, value: null, reason }) as const
const zero = { state: 'ZERO', value: '0', reason: null } as const

afterEach(cleanup)

/** Hovers the card so its tooltip opens, then reads the tooltip, the value and the tone class. */
const readCard = (label: string) => {
  const root = screen.getByText(label).closest('.relative') as HTMLElement
  fireEvent.mouseEnter(within(root).getByRole('button'))
  return {
    tip: within(root).getByRole('tooltip').textContent,
    value: root.querySelector('p.tabular-nums')?.textContent,
    tone: /bg-(\w+)-subtle/.exec(root.querySelector('div.h-10')?.className ?? '')?.[1],
  }
}

const readRows = (name: string) =>
  Array.from(screen.getByRole('table', { name }).querySelectorAll('tr'), (tr) =>
    Array.from(tr.children, (node) => node.textContent),
  )

describe('chart panel', () => {
  it('shows the title, the description only when given, and the default unavailable title', () => {
    const { rerender } = render(
      <ChartPanel description="Scoped to the project." title="Cohort">
        body
      </ChartPanel>,
    )
    expect(screen.getByRole('heading', { name: 'Cohort' })).toBeTruthy()
    expect(screen.getByText('Scoped to the project.')).toBeTruthy()
    rerender(<ChartPanel title="Cohort">body</ChartPanel>)
    expect(screen.queryByText('Scoped to the project.')).toBeNull()
    rerender(<UnavailableChart description="Not in this role." />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    rerender(<UnavailableChart description="Nothing recorded." title="None yet" />)
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(screen.queryByText('Data unavailable')).toBeNull()
  })
})

describe('descriptive statistics table', () => {
  const data: DescriptiveAnalytics = {
    contractVersion: 'analytics.descriptive.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    monitoringPeriod: {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      businessTimeZone: 'UTC',
    },
    sadddPeriod: { periodStart: null, periodEnd: null },
    sadddReleaseState: 'RELEASED',
    privacy: {
      threshold: 5,
      complementarySuppression: true,
      source: 'P06_SADDD_RELEASE',
      beneficiaryRows: false,
    },
    counts: [
      { key: 'a', label: 'Activities', metric: cell('4') },
      { key: 'm', label: 'Milestones', metric: gap('SUPPRESSED', 'SMALL_CELL') },
    ],
    distributions: [
      { section: 'SADDD_SEX', key: 'f', label: 'Female', metric: cell('6'), share: '0.6' },
      { section: 'ACTIVITY_STATE', key: 'd', label: 'Completed', metric: cell('2'), share: null },
    ],
    indicatorSummaries: [
      {
        unitLabel: 'people',
        numericKind: 'COUNT',
        indicatorCount: 5,
        reportedCount: 3,
        mean: '12.5',
        minimum: '2',
        maximum: '30',
      },
      {
        unitLabel: null,
        numericKind: null,
        indicatorCount: 1,
        reportedCount: 0,
        mean: null,
        minimum: null,
        maximum: null,
      },
    ],
  }

  it('lists the counts, the distributions with their share and the indicator means', () => {
    render(<DescriptiveStatisticsTable data={data} />)
    expect(readRows('Descriptive counts')).toEqual([
      ['Measure', 'Count'],
      ['Activities', '4'],
      ['Milestones', 'Suppressed'],
    ])
    expect(readRows('Distributions')).toEqual([
      ['Dimension', 'Category', 'Count', 'Share'],
      ['Sex', 'Female', '6', '60.0%'],
      ['Activity state', 'Completed', '2', 'Withheld'],
    ])
    expect(readRows('Indicator means by unit')).toEqual([
      ['Unit', 'Reported', 'Mean', 'Minimum', 'Maximum'],
      ['people', '3/5', '12.5', '2', '30'],
      ['No unit', '0/1', 'None yet', 'None yet', 'None yet'],
    ])
  })

  it('omits the indicator table when no indicator was summarised', () => {
    render(<DescriptiveStatisticsTable data={{ ...data, indicatorSummaries: [] }} />)
    expect(screen.queryByRole('table', { name: 'Indicator means by unit' })).toBeNull()
    expect(screen.getByRole('table', { name: 'Distributions' })).toBeTruthy()
  })
})

describe('timeline analytics panel', () => {
  const data: TimelineAnalytics = {
    contractVersion: 'analytics.descriptive.timeline.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    reportingDate: '2026-09-27',
    elapsedPercent: cell('50'),
    remainingDays: cell('30'),
    overdueDays: cell('3'),
    activityCompletionPercent: cell('75'),
    activityOverdueCount: cell('2'),
    milestoneOnTimePercent: cell('80'),
  }
  const props = { error: '', loading: false, onRetry: vi.fn() }

  it.each([
    [
      'Elapsed',
      'Share of the project period elapsed as of the reporting date; 100% once completed.',
      '50%',
      'info',
    ],
    [
      'Remaining days',
      "Calendar days remaining before the project's recorded end date; 0 once completed.",
      '30',
      'info',
    ],
    [
      'Overdue days',
      "Calendar days past the project's recorded end date; once completed, how late its last activity finished.",
      '3',
      'warning',
    ],
    ['Activity completion', 'Share of in-scope activities marked Completed.', '75%', 'success'],
    [
      'Overdue activities',
      'In-scope activities past their planned end date and not yet Completed.',
      '2',
      'warning',
    ],
    [
      'Milestone on-time',
      'Completed milestones finished on or before their target date.',
      '80%',
      'success',
    ],
  ])('shows the %s card with its tooltip, value and tone', (label, tip, value, tone) => {
    render(<TimelineAnalyticsPanel {...props} data={data} />)
    expect(readCard(label)).toEqual({ tip, value, tone })
  })

  it('keeps the two overdue cards neutral for zero and for an unavailable count', () => {
    render(
      <TimelineAnalyticsPanel
        {...props}
        data={{ ...data, overdueDays: zero, activityOverdueCount: gap('MISSING', 'NO_ACTIVITIES') }}
      />,
    )
    expect(readCard('Overdue days')).toMatchObject({ value: '0', tone: 'info' })
    expect(readCard('Overdue activities').tone).toBe('info')
  })

  it('shows the loading, error and unavailable states', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<TimelineAnalyticsPanel {...props} data={null} loading />)
    expect(screen.getByText('Loading timeline analytics')).toBeTruthy()
    expect(screen.getByText('Loading scoped activity and milestone data.')).toBeTruthy()
    rerender(
      <TimelineAnalyticsPanel {...props} data={null} error="Server said no." onRetry={onRetry} />,
    )
    expect(screen.getByText('Timeline analytics could not be loaded')).toBeTruthy()
    expect(screen.getByText('Server said no.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<TimelineAnalyticsPanel {...props} data={null} />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Timeline adherence is not available for this selection.')).toBeTruthy()
  })
})

describe('survey analytics panel', () => {
  const group = (key: string, over: Partial<SurveyAnalytics['overall']> = {}) => ({
    key,
    label: key,
    pairs: cell('12'),
    meanPre: cell('40'),
    meanPost: cell('62'),
    meanChange: cell('22'),
    improved: cell('8'),
    same: cell('3'),
    declined: cell('1'),
    ...over,
  })
  const data: SurveyAnalytics = {
    contractVersion: 'analytics.descriptive.survey.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    excludedRecords: 0,
    overall: group('OVERALL'),
    byActivity: [
      group('act-1', {
        pairs: cell('6'),
        meanPre: cell('30'),
        meanPost: cell('45'),
        meanChange: cell('15'),
        improved: cell('4'),
        same: cell('1'),
        declined: cell('1'),
      }),
      group('gone', {
        pairs: cell('5'),
        meanPre: cell('20'),
        meanPost: cell('25'),
        meanChange: gap('MISSING', 'NO_MEASUREMENT'),
        improved: cell('2'),
        same: cell('2'),
        declined: cell('1'),
      }),
    ],
  }
  const activities = [{ id: 'act-1', title: 'Training day' }] as ActivitySummary[]
  const props: ComponentProps<typeof SurveyAnalyticsPanel> = {
    activities,
    data,
    error: '',
    errorKind: 'retry',
    frozen: false,
    loading: false,
    noUsablePeriod: false,
    onRetry: vi.fn(),
    periodsReadable: true,
    showChart: false,
  }
  const chartCaption = 'Cohort change (all activities) values'

  it.each([
    [
      'Paired assessments',
      'Enrollments with both a PRE_TEST and a POST_TEST in this period.',
      '12',
      'info',
    ],
    ['Mean pre-test', 'Cohort mean normalized pre-test score (0-100).', '40%', 'info'],
    ['Mean post-test', 'Cohort mean normalized post-test score (0-100).', '62%', 'info'],
    [
      'Mean cohort change',
      'Cohort-level change in mean normalized score. Never an individual verdict.',
      '22pp',
      'success',
    ],
  ])('shows the %s card with its tooltip, value and tone', (label, tip, value, tone) => {
    render(<SurveyAnalyticsPanel {...props} />)
    expect(readCard(label)).toEqual({ tip, value, tone })
  })

  it.each([
    [cell('-5.5'), '-5.5pp', 'warning'],
    [cell('0.5'), '0.5pp', 'success'],
    [gap('MISSING', 'NO_MEASUREMENT'), 'None yet', 'info'],
  ])('colours the cohort change %# by its sign', (meanChange, value, tone) => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        data={{ ...data, overall: group('OVERALL', { meanChange }) }}
      />,
    )
    expect(readCard('Mean cohort change')).toMatchObject({ value, tone })
  })

  it('lists the cohort and each activity group with a readable name and the right unit', () => {
    render(<SurveyAnalyticsPanel {...props} />)
    expect(readRows('Survey improvement by group')).toEqual([
      ['Group', 'Pairs', 'Mean pre', 'Mean post', 'Mean change', 'Improved', 'Same', 'Declined'],
      ['All activities (cohort change)', '12', '40%', '62%', '22pp', '8', '3', '1'],
      ['Training day', '6', '30%', '45%', '15pp', '4', '1', '1'],
      ['Activity (name unavailable)', '5', '20%', '25%', 'None yet', '2', '2', '1'],
    ])
  })

  it('shows the frozen caption and the chart only when asked', () => {
    const { rerender } = render(<SurveyAnalyticsPanel {...props} />)
    expect(screen.queryByText(SURVEY_FROZEN_CAPTION)).toBeNull()
    expect(screen.queryByText(chartCaption)).toBeNull()
    rerender(<SurveyAnalyticsPanel {...props} frozen showChart />)
    expect(screen.getByText(SURVEY_FROZEN_CAPTION)).toBeTruthy()
    expect(screen.getByText(chartCaption)).toBeTruthy()
  })

  it('replaces the chart with the suppression note for a suppressed cohort', () => {
    const overall = group('OVERALL', { pairs: gap('SUPPRESSED', 'SMALL_CELL') })
    render(<SurveyAnalyticsPanel {...props} data={{ ...data, overall }} showChart />)
    expect(screen.getByText('Suppressed (fewer than 5)', { selector: 'p.text-sm' })).toBeTruthy()
    expect(screen.queryByText(chartCaption)).toBeNull()
  })

  it('replaces the chart with the unavailable reason when the cohort has no pairs', () => {
    const overall = group('OVERALL', {
      pairs: zero,
      meanPre: gap('NOT_APPLICABLE'),
      meanPost: gap('NOT_APPLICABLE'),
      meanChange: gap('NOT_APPLICABLE'),
    })
    render(<SurveyAnalyticsPanel {...props} data={{ ...data, overall }} showChart />)
    expect(screen.getByText('None yet', { selector: 'p.text-base' })).toBeTruthy()
    expect(screen.getAllByText('Not applicable').length).toBeGreaterThan(3)
    expect(screen.queryByText(chartCaption)).toBeNull()
  })

  it('shows the loading state and the retryable error', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<SurveyAnalyticsPanel {...props} data={null} loading />)
    expect(screen.getByText('Loading survey analytics')).toBeTruthy()
    expect(screen.getByText('Loading scoped paired assessment data.')).toBeTruthy()
    rerender(
      <SurveyAnalyticsPanel {...props} data={null} error="Network down." onRetry={onRetry} />,
    )
    expect(screen.getByText('Survey analytics could not be loaded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a final error without Retry', () => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        data={null}
        error="Restricted for your role."
        errorKind="restricted"
      />,
    )
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Restricted for your role.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('explains an empty panel by period usability and by role', () => {
    const { rerender } = render(<SurveyAnalyticsPanel {...props} data={null} noUsablePeriod />)
    expect(screen.getByText(SURVEY_PERIOD_MESSAGE)).toBeTruthy()
    rerender(<SurveyAnalyticsPanel {...props} data={null} />)
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(
      screen.getByText('No active Indicator reporting period is available for this project.'),
    ).toBeTruthy()
    rerender(<SurveyAnalyticsPanel {...props} data={null} periodsReadable={false} />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(
      screen.getByText('Indicator reporting periods are not available for this role.'),
    ).toBeTruthy()
  })
})
```


Create `apps/web/src/features/analytics/analytics.copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { analysisViews, sectionLabels, visualizationTypes } from './analytics.copy'

describe('analytics copy', () => {
  it('names the four analysis views by value and label', () => {
    expect(analysisViews.map(({ value, label }) => [value, label])).toEqual([
      ['kpi', 'KPI / indicator performance'],
      ['participation', 'Participation patterns'],
      ['survey', 'Survey improvement'],
      ['timeline', 'Project / activity timeline adherence'],
    ])
  })

  it('names the four visualization types by value and label', () => {
    expect(visualizationTypes.map(({ value, label }) => [value, label])).toEqual([
      ['bar', 'Bar chart'],
      ['line', 'Line chart'],
      ['table', 'Table'],
      ['map', 'Map'],
    ])
  })

  it('labels the five descriptive sections', () => {
    expect(sectionLabels).toEqual({
      ACTIVITY_STATE: 'Activity state',
      MILESTONE_STATE: 'Milestone state',
      SADDD_SEX: 'Sex',
      SADDD_AGE: 'Age band',
      SADDD_DISABILITY: 'Disability',
    })
  })
})
```


Create `.tmp/s7c/task5b-edits.json`:

```json
[
 [
  "apps/web/src/features/analytics/components/analytics-dashboard.cards.test.tsx",
  "      expect(list).toHaveBeenCalledWith(\n        expect.objectContaining({ status: 'NEW', cursor: 'c1', projectId: 'project-a' }),\n        undefined,\n      )\n",
  "      expect(list).toHaveBeenCalledWith(\n        expect.objectContaining({ status: 'NEW', cursor: 'c1', projectId: 'project-a' }),\n        undefined,\n      )\n      expect(\n        list.mock.calls.map(([query]) => [query?.status, query?.limit, query?.cursor]),\n      ).toEqual([\n        ['NEW', '100', undefined],\n        ['NEW', '100', 'c1'],\n        ['REVIEWED', '100', undefined],\n        ['ACTIONED', '100', undefined],\n      ])\n",
  1
 ]
]
```


```bash
F=apps/web/src/features/analytics
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task5b-edits.json
git add -N apps/web/src
pnpm exec biome check --write $F/components/analytics-panels.test.tsx $F/analytics.copy.test.ts $F/components/analytics-dashboard.cards.test.tsx 2>&1 | tail -1
node .tmp/s7c/count-it.mjs $F/components/analytics-panels.test.tsx | tail -1
(cd apps/web && pnpm exec vitest run src/features/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
1 replacements in 1 files
Checked 3 files in <ms>. No fixes applied.
total: it 15, describe 4, expect 45
 Test Files  14 passed (14)
      Tests  133 passed (133)
```


The edit file applies 1 replacement. Biome changes nothing (the files are printed as it formats them). The panels test holds 15 `it` blocks (25 tests, because three are `it.each` tables). The feature folder passes: 14 files and 133 tests, the 12 files and 105 tests of the folder before plus the two new files and their 28 tests.

Create `.tmp/s7c/mutate-panels.sh`:

```bash
U=apps/web/src/features/analytics
C=$U/components
T="src/features/analytics/components/analytics-panels.test.tsx src/features/analytics/analytics.copy.test.ts src/features/analytics/components/analytics-dashboard.cards.test.tsx"
run() { (cd apps/web && timeout 300 pnpm exec vitest run $T 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]" | sort -u); }
mutate() {
  # Usage: mutate <label> <file> <sed expression>; changes one thing, runs the three test files and restores the file.
  cp "$2" .tmp/s7c/files/mutant.bak
  sed -i "$3" "$2"
  if cmp -s "$2" .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run
  cp .tmp/s7c/files/mutant.bak "$2"
}
for f in chart-panel descriptive-statistics-table timeline-analytics-panel survey-analytics-panel; do cp $C/$f.tsx .tmp/s7c/files/$f.orig; done
cp $U/analytics.copy.ts .tmp/s7c/files/copy-panels.orig
cp $U/analytics.reads.ts .tmp/s7c/files/reads.orig
echo "unmutated"; run
mutate "default unavailable title changed" $C/chart-panel.tsx "s/title = 'Data unavailable'/title = 'Unavailable'/"
mutate "counts caption changed" $C/descriptive-statistics-table.tsx 's/Descriptive counts/Counts/'
mutate "share header changed" $C/descriptive-statistics-table.tsx 's#>Share</th>#>Percent</th>#'
mutate "section label dropped" $C/descriptive-statistics-table.tsx 's/sectionLabels\[row.section\]/row.section/'
mutate "share dropped" $C/descriptive-statistics-table.tsx 's/formatShare(row.share)/formatShare(null)/'
mutate "no unit text blank" $C/descriptive-statistics-table.tsx "s/?? 'No unit'/?? ''/"
mutate "reported ratio swapped" $C/descriptive-statistics-table.tsx 's#{row.reportedCount}/{row.indicatorCount}#{row.indicatorCount}/{row.reportedCount}#'
mutate "mean shows the minimum" $C/descriptive-statistics-table.tsx 's/row.mean ??/row.minimum ??/'
mutate "indicator table always shown" $C/descriptive-statistics-table.tsx 's/data.indicatorSummaries.length ? (/true ? (/'
mutate "timeline tooltip changed" $C/timeline-analytics-panel.tsx 's/Share of in-scope activities marked Completed\./Share of activities./'
mutate "timeline label changed" $C/timeline-analytics-panel.tsx 's/label="Overdue days"/label="Overdue"/'
mutate "elapsed tone changed" $C/timeline-analytics-panel.tsx '/label="Elapsed"/{n;s/tone="info"/tone="success"/}'
mutate "completion tone changed" $C/timeline-analytics-panel.tsx '/label="Activity completion"/{n;s/tone="success"/tone="info"/}'
mutate "overdue days sign flipped" $C/timeline-analytics-panel.tsx 's/Number(data.overdueDays.value) > 0/Number(data.overdueDays.value) < 0/'
mutate "overdue activities sign flipped" $C/timeline-analytics-panel.tsx 's/Number(data.activityOverdueCount.value) > 0/Number(data.activityOverdueCount.value) < 0/'
mutate "timeline loading title changed" $C/timeline-analytics-panel.tsx 's/title="Loading timeline analytics"/title="Loading"/'
mutate "timeline unavailable text changed" $C/timeline-analytics-panel.tsx 's/Timeline adherence is not available for this selection\./Not available./'
mutate "survey tooltip changed" $C/survey-analytics-panel.tsx 's/Cohort mean normalized pre-test score (0-100)\./Cohort mean pre-test./'
mutate "pre-test unit dropped" $C/survey-analytics-panel.tsx "s/analyticsCellValue(overall.meanPre, 'percent')/analyticsCellValue(overall.meanPre)/"
mutate "change unit changed" $C/survey-analytics-panel.tsx "s/analyticsCellValue(overall.meanChange, 'pp')/analyticsCellValue(overall.meanChange, 'percent')/"
mutate "change sign flipped" $C/survey-analytics-panel.tsx 's/Number(overall.meanChange.value) < 0/Number(overall.meanChange.value) > 0/'
mutate "missing change tone flipped" $C/survey-analytics-panel.tsx 's/overall.meanChange.value === null/overall.meanChange.value !== null/'
mutate "no pairs test changed" $C/survey-analytics-panel.tsx "s/overall.pairs.value === '0'/overall.pairs.value === '1'/"
mutate "suppressed note changed" $C/survey-analytics-panel.tsx 's/Suppressed (fewer than 5)/Suppressed/'
mutate "improved column shows same" $C/survey-analytics-panel.tsx 's/analyticsCellValue(row.improved)/analyticsCellValue(row.same)/'
mutate "pre header changed" $C/survey-analytics-panel.tsx 's#>Mean pre</th>#>Pre</th>#'
mutate "none yet title dropped" $C/survey-analytics-panel.tsx "s/title={periodsReadable ? 'None yet' : undefined}/title={undefined}/"
mutate "no period text changed" $C/survey-analytics-panel.tsx 's/No active Indicator reporting period is available for this project\./No period./'
mutate "frozen caption inverted" $C/survey-analytics-panel.tsx 's/{frozen ? /{!frozen ? /'
mutate "cohort chart title changed" $C/survey-analytics-panel.tsx 's/title="Cohort change (all activities)"/title="Cohort"/'
mutate "participation view label changed" $U/analytics.copy.ts 's/Participation patterns/Participation/'
mutate "line chart label changed" $U/analytics.copy.ts "s/label: 'Line chart'/label: 'Lines'/"
mutate "milestone section label changed" $U/analytics.copy.ts "s/MILESTONE_STATE: 'Milestone state'/MILESTONE_STATE: 'Milestones'/"
mutate "third alert status dropped" $U/analytics.reads.ts "s/'NEW', 'REVIEWED', 'ACTIONED'/'NEW', 'REVIEWED', 'NEW'/"
mutate "alert page size changed" $U/analytics.reads.ts "s/limit: '100'/limit: '50'/"
for f in chart-panel descriptive-statistics-table timeline-analytics-panel survey-analytics-panel; do cmp .tmp/s7c/files/$f.orig $C/$f.tsx || echo "NOT RESTORED: $f"; done
cmp .tmp/s7c/files/copy-panels.orig $U/analytics.copy.ts && cmp .tmp/s7c/files/reads.orig $U/analytics.reads.ts && echo "all six files restored"
```


```bash
bash .tmp/s7c/mutate-panels.sh
```


Expected:

```text
unmutated
      Tests  40 passed (40)
 Test Files  3 passed (3)
default unavailable title changed
      Tests  4 failed | 36 passed (40)
 Test Files  1 failed | 2 passed (3)
counts caption changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
share header changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
section label dropped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
share dropped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
no unit text blank
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
reported ratio swapped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
mean shows the minimum
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
indicator table always shown
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
timeline tooltip changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
timeline label changed
      Tests  2 failed | 38 passed (40)
 Test Files  1 failed | 2 passed (3)
elapsed tone changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
completion tone changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
overdue days sign flipped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
overdue activities sign flipped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
timeline loading title changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
timeline unavailable text changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
survey tooltip changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
pre-test unit dropped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
change unit changed
      Tests  3 failed | 37 passed (40)
 Test Files  1 failed | 2 passed (3)
change sign flipped
      Tests  3 failed | 37 passed (40)
 Test Files  1 failed | 2 passed (3)
missing change tone flipped
      Tests  4 failed | 36 passed (40)
 Test Files  1 failed | 2 passed (3)
no pairs test changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
suppressed note changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
improved column shows same
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
pre header changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
none yet title dropped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
no period text changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
frozen caption inverted
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
cohort chart title changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
participation view label changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
line chart label changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
milestone section label changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
third alert status dropped
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
alert page size changed
      Tests  1 failed | 39 passed (40)
 Test Files  1 failed | 2 passed (3)
all six files restored
```


The unmutated run passes. Each of the 35 mutations (one label, tooltip, tone, unit, column, condition, copy entry or request value of the moved files) fails at least one test, and the last line says the six files were restored byte for byte. The same survey over the 109 survivors, run against these tests, leaves two: the strings `'distributions'` and `'section'` in the type `DescriptiveAnalytics['distributions'][number]['section']` of `sectionLabels`, which no test can see and the typecheck rejects.

- [ ] **Step 5: Check, run the whole web suite and commit**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the analytics dashboard panels, copy, helpers and alert count out of the component file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1525 files in <ms>. No fixes applied.
 Test Files  259 passed (259)
      Tests  2375 passed (2375)
 13 files changed, 1011 insertions(+), 447 deletions(-)
```


The typecheck is clean with the two baseline lines, Biome is clean over 1525 files, and web is 259 files and 2375 tests: Task 4 plus the helper test (11 tests), the panels test (25) and the copy test (3). The commit changes 13 files: the eight new files (the helper test among them), the two tests of Step 4b, the component, the cards test and the copy contract.

---

### Task 6: Move the SADDD, descriptive, survey and timeline reads and the export into five hooks

**Files:**
- Create: `apps/web/src/features/analytics/hooks/use-saddd-dashboard.ts`, `use-descriptive-analytics.ts`, `use-survey-analytics.ts`, `use-timeline-analytics.ts`, `use-analytics-export.ts` and the tests `use-saddd-dashboard.test.ts`, `use-descriptive-analytics.test.ts`, `use-survey-analytics.test.ts`, `use-timeline-analytics.test.ts`, `use-analytics-export.test.ts`
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.tsx` (rebuilt from its own line ranges), `analytics-dashboard.test.tsx` (two retry cases), `apps/web/src/features/analytics/analytics-reporting-periods.utils.ts` (`export` on one interface)
- Create (gitignored): `.tmp/s7c/task6-tests.json`, `task6-cut.json`, `task6-edits.json`, `mutate-dashboard-before.sh`, `mutate-dashboard-after.sh`, `mutate-hooks.sh`, `before/analytics-dashboard-t6.tsx`

The function `AnalyticsDashboard` holds the state, the request effect and the retry of five reads. Each read becomes a hook that takes what its effect reads and returns the state names the markup already uses, plus a `retry` and a `reset` function. The state lines and the effect body are copied by line range, so the request, its guards, its messages and its dependency list do not change. The hooks are called at the place where the effects stood, so the effects run in the same order as before: the periods effect, the SADDD hook, the monitoring effect (which stays in the component because the project data effect also writes `monitoring`), then the descriptive, survey and timeline hooks and the export hook. `monitoring`, `activities`, `projects` and the period state stay in the component because several effects write them.

- [ ] **Step 1: Pin the retry wiring before anything moves**

Two buttons had no test: the Retry of the SADDD panel and of the descriptive statistics panel. `task6-tests.json` adds one case for each to `analytics-dashboard.test.tsx` (a failed read, a click on Retry, a second read), and `mutate-dashboard-before.sh` changes the wiring of each Retry and of the export dialog Cancel in the unchanged component, then runs the six dashboard test files:

Create `.tmp/s7c/task6-tests.json`:

```json
[
 ["apps/web/src/features/analytics/components/analytics-dashboard.test.tsx", "      screen.queryByText('Project / activity timeline adherence', { selector: 'option' }),\n    ).toBeNull()\n  })\n})\n", "      screen.queryByText('Project / activity timeline adherence', { selector: 'option' }),\n    ).toBeNull()\n  })\n\n  it('retries the SADDD read from its error panel', async () => {\n    api.getProjectsForRole.mockResolvedValue([\n      project('project-dated', 'Dated project', '2025-08-01', '2025-09-30'),\n    ])\n    api.getProjectIndicators.mockResolvedValue([\n      indicator('project-dated', 'D-SEP', '2025-09-01', '2025-09-30'),\n    ])\n    api.getSadddDashboard.mockRejectedValueOnce(new Error('Monitoring verification is unavailable.'))\n\n    render(<AnalyticsDashboard />)\n\n    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))\n\n    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalledTimes(2))\n    await screen.findByTestId('saddd-chart')\n    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()\n  })\n\n  it('retries the descriptive statistics read from its error panel', async () => {\n    currentAccess.profile.permissions = [\n      ...currentAccess.profile.permissions,\n      'analytics.descriptive.read',\n    ]\n    api.getDescriptiveAnalytics.mockRejectedValueOnce(\n      new Error('Descriptive statistics are unavailable.'),\n    )\n\n    render(<AnalyticsDashboard />)\n\n    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))\n\n    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2))\n  })\n})\n", 1]
]
```


Create `.tmp/s7c/mutate-dashboard-before.sh`:

```bash
C=apps/web/src/features/analytics/components/analytics-dashboard.tsx
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/features/analytics/components/analytics-dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +Tests +[0-9]" | sort -u); }
mutate() {
  # Usage: mutate <label> <sed expression>; changes the component once, runs its tests and restores it.
  cp $C .tmp/s7c/files/mutant.bak
  sed -i "$2" $C
  if cmp -s $C .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run
  cp .tmp/s7c/files/mutant.bak $C
}
cp $C .tmp/s7c/files/dashboard.orig
echo "unmutated"; run
mutate "survey retry does nothing" 's/onRetry={() => setSurveyLoadAttempt((value) => value + 1)}/onRetry={() => undefined}/'
mutate "timeline retry does nothing" 's/onRetry={() => setTimelineLoadAttempt((value) => value + 1)}/onRetry={() => undefined}/'
mutate "descriptive retry does nothing" 's/onRetry={() => setDescriptiveLoadAttempt((value) => value + 1)}/onRetry={() => undefined}/'
mutate "saddd retry does nothing" 's/() => setSadddLoadAttempt((value) => value + 1)/() => undefined/'
mutate "export cancel does nothing" 's/onCancel={() => setExportPreview(null)}/onCancel={() => undefined}/'
echo "reset lines of handleProjectChange (the effects clear the same states in the same commit)"
for state in 'setSaddd(null)' 'setDescriptive(null)' 'setSurvey(null)' 'setTimeline(null)'; do
  mutate "handler no longer calls $state" "/const handleProjectChange/,/^  }/{/^    ${state}$/d}"
done
cmp .tmp/s7c/files/dashboard.orig $C && echo "component restored"
```


```bash
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task6-tests.json
git add -N apps/web/src
pnpm exec biome check --write apps/web/src/features/analytics/components/analytics-dashboard.test.tsx 2>&1 | tail -1
bash .tmp/s7c/mutate-dashboard-before.sh
```


Expected:

```text
1 replacements in 1 files
Checked 1 file in <ms>. Fixed 1 file.
unmutated
      Tests  69 passed (69)
survey retry does nothing
      Tests  1 failed | 68 passed (69)
timeline retry does nothing
      Tests  1 failed | 68 passed (69)
descriptive retry does nothing
      Tests  1 failed | 68 passed (69)
saddd retry does nothing
      Tests  1 failed | 68 passed (69)
export cancel does nothing
      Tests  1 failed | 68 passed (69)
reset lines of handleProjectChange (the effects clear the same states in the same commit)
handler no longer calls setSaddd(null)
      Tests  69 passed (69)
handler no longer calls setDescriptive(null)
      Tests  69 passed (69)
handler no longer calls setSurvey(null)
      Tests  69 passed (69)
handler no longer calls setTimeline(null)
      Tests  69 passed (69)
component restored
```


The edit adds two cases to the dashboard test (69 cases). The unmutated component passes them. Each of the five wirings (the Retry of the survey, the timeline, the descriptive statistics and the SADDD panel, and the Cancel of the export dialog) fails exactly one case. The four reset lines of `handleProjectChange` survive, and that is correct: the effects of the same component clear the same state in the same commit when the project id changes, so removing the line changes nothing a user or a test can see. They are recorded as equivalent mutations (ruling 9) and the reset functions are pinned in the hook tests of Step 3.

- [ ] **Step 2: Commit the two cases**

```bash
(cd apps/web && pnpm exec vitest run src/features/analytics/components 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
pnpm lint 2>&1 | tail -1
git add apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the SADDD and descriptive statistics Retry buttons of the analytics dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
 Test Files  10 passed (10)
      Tests  111 passed (111)
Checked 1525 files in <ms>. No fixes applied.
 1 file changed, 36 insertions(+)
```


The ten test files of the components folder pass (111 tests), lint is clean over 1525 files, and the commit adds 36 lines to one file.

- [ ] **Step 3: Create the cut plan, the edits and the hook tests**

`task6-cut.json` builds the five hook files and the component from line ranges of the component (the plan pins its hash, so a change of the file stops it): a hook file is the `'use client'` line, the source's import block (trimmed below), the signature with the typed parameters, the state lines, the effect lines and the returned names. The component loses the state lines and the effects and gets the five calls in their places. `task6-edits.json` holds the ten exact replacements that follow: the reset calls of `handleProjectChange`, the retry and cancel calls of the markup, and the `export` of the period interface that the hook signatures name, and the path of the one component type the export hook names:

Create `.tmp/s7c/task6-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "758a2788",
 "files": {
  "apps/web/src/features/analytics/hooks/use-descriptive-analytics.ts": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "",
   "export const useDescriptiveAnalytics = ({",
   "  canReadDescriptive,",
   "  projectId,",
   "  selectedPeriod,",
   "}: {",
   "  canReadDescriptive: boolean",
   "  projectId: string",
   "  selectedPeriod: AnalyticsReportingPeriod | undefined",
   "}) => {",
   [138, 141],
   "",
   [419, 452],
   "",
   "  return {",
   "    descriptive,",
   "    descriptiveError,",
   "    descriptiveLoading,",
   "    resetDescriptive: () => {",
   "      setDescriptive(null)",
   "      setDescriptiveError('')",
   "    },",
   "    retryDescriptive: () => setDescriptiveLoadAttempt((value) => value + 1),",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/hooks/use-survey-analytics.ts": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "",
   "export const useSurveyAnalytics = ({",
   "  analysisView,",
   "  projectId,",
   "  surveyFrozenOnly,",
   "  surveyPeriod,",
   "  surveyUnavailable,",
   "}: {",
   "  analysisView: AnalysisView",
   "  projectId: string",
   "  surveyFrozenOnly: boolean",
   "  surveyPeriod: AnalyticsReportingPeriod | undefined",
   "  surveyUnavailable: boolean",
   "}) => {",
   [171, 177],
   "",
   [454, 507],
   "",
   "  return {",
   "    resetSurvey: () => {",
   "      setSurvey(null)",
   "      setSurveyError('')",
   "      setSurveyErrorKind('retry')",
   "    },",
   "    retrySurvey: () => setSurveyLoadAttempt((value) => value + 1),",
   "    survey,",
   "    surveyError,",
   "    surveyErrorKind,",
   "    surveyLoading,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/hooks/use-timeline-analytics.ts": [
   "'use client'",
   "",
   "@imports",
   "",
   "export const useTimelineAnalytics = ({",
   "  analysisView,",
   "  canReadSurveyTimeline,",
   "  projectId,",
   "}: {",
   "  analysisView: AnalysisView",
   "  canReadSurveyTimeline: boolean",
   "  projectId: string",
   "}) => {",
   [178, 181],
   "",
   [509, 539],
   "",
   "  return {",
   "    resetTimeline: () => {",
   "      setTimeline(null)",
   "      setTimelineError('')",
   "    },",
   "    retryTimeline: () => setTimelineLoadAttempt((value) => value + 1),",
   "    timeline,",
   "    timelineError,",
   "    timelineLoading,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/hooks/use-saddd-dashboard.ts": [
   "'use client'",
   "",
   "@imports",
   "",
   "export const useSadddDashboard = ({",
   "  projectId,",
   "  selectedProject,",
   "  sadddEligible,",
   "}: {",
   "  projectId: string",
   "  selectedProject: ProjectSummary | undefined",
   "  sadddEligible: boolean",
   "}) => {",
   [157, 157],
   [162, 162],
   [166, 166],
   [170, 170],
   "",
   [350, 382],
   "",
   "  return {",
   "    resetSaddd: () => {",
   "      setSaddd(null)",
   "      setSadddLoading(false)",
   "      setSadddError('')",
   "    },",
   "    retrySaddd: () => setSadddLoadAttempt((value) => value + 1),",
   "    saddd,",
   "    sadddError,",
   "    sadddLoading,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/hooks/use-analytics-export.ts": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "",
   "export const useAnalyticsExport = ({",
   "  analysisView,",
   "  canExportAnalytics,",
   "  projectId,",
   "  selectedPeriod,",
   "  surveyPeriod,",
   "  surveyUnavailable,",
   "}: {",
   "  analysisView: AnalysisView",
   "  canExportAnalytics: boolean",
   "  projectId: string",
   "  selectedPeriod: AnalyticsReportingPeriod | undefined",
   "  surveyPeriod: AnalyticsReportingPeriod | undefined",
   "  surveyUnavailable: boolean",
   "}) => {",
   [142, 148],
   "",
   [541, 581],
   "",
   "  return {",
   "    closeExportPreview: () => setExportPreview(null),",
   "    downloadExport,",
   "    exportPreview,",
   "    exporting,",
   "    previewExport,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useAnalyticsExport } from '../hooks/use-analytics-export'",
   "import { useDescriptiveAnalytics } from '../hooks/use-descriptive-analytics'",
   "import { useSadddDashboard } from '../hooks/use-saddd-dashboard'",
   "import { useSurveyAnalytics } from '../hooks/use-survey-analytics'",
   "import { useTimelineAnalytics } from '../hooks/use-timeline-analytics'",
   "",
   [116, 137],
   [149, 156],
   [158, 161],
   [163, 165],
   [167, 169],
   [182, 349],
   "  const { resetSaddd, retrySaddd, saddd, sadddError, sadddLoading } = useSadddDashboard({",
   "    projectId,",
   "    sadddEligible,",
   "    selectedProject,",
   "  })",
   [383, 418],
   "  const { descriptive, descriptiveError, descriptiveLoading, resetDescriptive, retryDescriptive } =",
   "    useDescriptiveAnalytics({ canReadDescriptive, projectId, selectedPeriod })",
   [453, 453],
   "  const { resetSurvey, retrySurvey, survey, surveyError, surveyErrorKind, surveyLoading } =",
   "    useSurveyAnalytics({ analysisView, projectId, surveyFrozenOnly, surveyPeriod, surveyUnavailable })",
   [508, 508],
   "  const { resetTimeline, retryTimeline, timeline, timelineError, timelineLoading } =",
   "    useTimelineAnalytics({ analysisView, canReadSurveyTimeline, projectId })",
   [540, 540],
   "  const { closeExportPreview, downloadExport, exportPreview, exporting, previewExport } =",
   "    useAnalyticsExport({",
   "      analysisView,",
   "      canExportAnalytics,",
   "      projectId,",
   "      selectedPeriod,",
   "      surveyPeriod,",
   "      surveyUnavailable,",
   "    })",
   [582, 1321]
  ]
 }
}
```


Create `.tmp/s7c/task6-edits.json`:

```json
[
 ["apps/web/src/features/analytics/analytics-reporting-periods.utils.ts", "\ninterface AnalyticsReportingPeriod {", "\nexport interface AnalyticsReportingPeriod {", 1],
 ["apps/web/src/features/analytics/hooks/use-analytics-export.ts", "from './analytics-export-preview'", "from '../components/analytics-export-preview'", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    setSaddd(null)\n    setDescriptive(null)\n    setDescriptiveError('')\n    setSurvey(null)\n    setSurveyError('')\n    setSurveyErrorKind('retry')\n    setTimeline(null)\n    setTimelineError('')\n", "    resetSaddd()\n    resetDescriptive()\n    resetSurvey()\n    resetTimeline()\n", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    setSadddLoading(false)\n", "", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    setSadddError('')\n", "", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "onRetry={() => setSurveyLoadAttempt((value) => value + 1)}", "onRetry={retrySurvey}", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "onRetry={() => setTimelineLoadAttempt((value) => value + 1)}", "onRetry={retryTimeline}", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "onRetry={() => setDescriptiveLoadAttempt((value) => value + 1)}", "onRetry={retryDescriptive}", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "() => setSadddLoadAttempt((value) => value + 1)", "retrySaddd", 1],
 ["apps/web/src/features/analytics/components/analytics-dashboard.tsx", "onCancel={() => setExportPreview(null)}", "onCancel={closeExportPreview}", 1]
]
```


The five hooks get a test each. The four read hooks are pinned on the request (arguments and guards), the failure message, the retry and the reset; the export hook on the preview request per view, the file name and path, the guards that the markup hides (permission, project, period, unavailable survey, a second click) and the download. These are behaviors that only the component tests reached before, and some of them (the guards, the reset calls) not at all:

Create `apps/web/src/features/analytics/hooks/use-descriptive-analytics.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DescriptiveAnalytics } from '@pathways/shared'

import { useDescriptiveAnalytics } from './use-descriptive-analytics'

const api = vi.hoisted(() => ({ getDescriptiveAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { counts: [] } as unknown as DescriptiveAnalytics
const selectedPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const params = { canReadDescriptive: true, projectId: 'project-a', selectedPeriod }

describe('useDescriptiveAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the selected period of the project', async () => {
    api.getDescriptiveAnalytics.mockResolvedValue(loaded)
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    expect(api.getDescriptiveAnalytics).toHaveBeenCalledWith({
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
    expect(result.current.descriptiveLoading).toBe(false)
  })

  it('does not read without the permission or without a period', () => {
    const denied = { ...params, canReadDescriptive: false }
    const noPeriod = { ...params, selectedPeriod: undefined }
    renderHook(() => useDescriptiveAnalytics(denied))
    renderHook(() => useDescriptiveAnalytics(noPeriod))
    expect(api.getDescriptiveAnalytics).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getDescriptiveAnalytics.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptiveError).toBe('Down.'))
    act(() => result.current.retryDescriptive())
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    expect(result.current.descriptiveError).toBe('')
    expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2)
  })

  it('names a failure that carries no message', async () => {
    api.getDescriptiveAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() =>
      expect(result.current.descriptiveError).toBe('Descriptive statistics are unavailable.'),
    )
  })

  it('clears the result and the failure on reset', async () => {
    api.getDescriptiveAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    act(() => result.current.resetDescriptive())
    expect(result.current.descriptive).toBeNull()
    act(() => result.current.retryDescriptive())
    await waitFor(() => expect(result.current.descriptiveError).toBe('Down.'))
    act(() => result.current.resetDescriptive())
    expect(result.current.descriptiveError).toBe('')
  })
})
```


Create `apps/web/src/features/analytics/hooks/use-survey-analytics.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SurveyAnalytics } from '@pathways/shared'

import { useSurveyAnalytics } from './use-survey-analytics'

const api = vi.hoisted(() => ({ getSurveyAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { overall: {} } as unknown as SurveyAnalytics
const surveyPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const params = {
  analysisView: 'survey' as 'kpi' | 'survey',
  projectId: 'project-a',
  surveyFrozenOnly: false,
  surveyPeriod,
  surveyUnavailable: false,
}
const refused = (status: number) => Object.assign(new Error('Refused.'), { status })

describe('useSurveyAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the survey period on the survey view only', async () => {
    api.getSurveyAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = renderHook((props) => useSurveyAnalytics(props), {
      initialProps: { ...params, analysisView: 'kpi' as 'kpi' | 'survey' },
    })
    expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
    rerender({ ...params, analysisView: 'survey' })
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
  })

  it('does not read when the survey is unavailable to the role', () => {
    renderHook(() => useSurveyAnalytics({ ...params, surveyUnavailable: true }))
    expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
  })

  it.each([
    [403, false, 'restricted', 'Survey improvement is restricted for your role.'],
    [400, false, 'period', 'This reporting period cannot be used for survey results.'],
    [
      400,
      true,
      'period',
      'Survey results for your role are released after the reporting period closes. Choose a closed period.',
    ],
  ])('maps a %i refusal (frozen only %s) to the %s kind', async (status, frozen, kind, message) => {
    api.getSurveyAnalytics.mockRejectedValue(refused(status))
    const { result } = renderHook(() => useSurveyAnalytics({ ...params, surveyFrozenOnly: frozen }))
    await waitFor(() => expect(result.current.surveyErrorKind).toBe(kind))
    expect(result.current.surveyError).toBe(message)
  })

  it('keeps the server message of a retryable failure and reads again on retry', async () => {
    api.getSurveyAnalytics.mockRejectedValueOnce(refused(503)).mockResolvedValue(loaded)
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() => expect(result.current.surveyError).toBe('Refused.'))
    expect(result.current.surveyErrorKind).toBe('retry')
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    expect(result.current.surveyError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getSurveyAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() =>
      expect(result.current.surveyError).toBe('Survey analytics could not be loaded.'),
    )
  })

  it('clears the result, the failure and the error kind on reset', async () => {
    api.getSurveyAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(refused(403))
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    act(() => result.current.resetSurvey())
    expect(result.current.survey).toBeNull()
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.surveyErrorKind).toBe('restricted'))
    act(() => result.current.resetSurvey())
    expect(result.current.surveyError).toBe('')
    expect(result.current.surveyErrorKind).toBe('retry')
  })
})
```


Create `apps/web/src/features/analytics/hooks/use-timeline-analytics.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TimelineAnalytics } from '@pathways/shared'

import { useTimelineAnalytics } from './use-timeline-analytics'

const api = vi.hoisted(() => ({ getTimelineAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { elapsedPercent: null } as unknown as TimelineAnalytics
const params = { analysisView: 'timeline' as const, canReadSurveyTimeline: true, projectId: 'project-a' }

describe('useTimelineAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the project on the timeline view only', async () => {
    api.getTimelineAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = renderHook((props) => useTimelineAnalytics(props), {
      initialProps: { ...params, analysisView: 'kpi' as 'kpi' | 'timeline' },
    })
    expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
    rerender({ ...params, analysisView: 'timeline' })
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    expect(api.getTimelineAnalytics).toHaveBeenCalledWith({ projectId: 'project-a' })
  })

  it('does not read without the survey and timeline permissions', () => {
    renderHook(() => useTimelineAnalytics({ ...params, canReadSurveyTimeline: false }))
    expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getTimelineAnalytics.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() => expect(result.current.timelineError).toBe('Down.'))
    act(() => result.current.retryTimeline())
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    expect(result.current.timelineError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getTimelineAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() =>
      expect(result.current.timelineError).toBe('Timeline analytics could not be loaded.'),
    )
  })

  it('clears the result and the failure on reset', async () => {
    api.getTimelineAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    act(() => result.current.resetTimeline())
    expect(result.current.timeline).toBeNull()
    act(() => result.current.retryTimeline())
    await waitFor(() => expect(result.current.timelineError).toBe('Down.'))
    act(() => result.current.resetTimeline())
    expect(result.current.timelineError).toBe('')
  })
})
```


Create `apps/web/src/features/analytics/hooks/use-saddd-dashboard.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSummary } from '@/types/pathways'
import type { SadddDashboard } from '@pathways/shared'

import { useSadddDashboard } from './use-saddd-dashboard'

const api = vi.hoisted(() => ({ getSadddDashboard: vi.fn() }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))

const loaded = { sex: [] } as unknown as SadddDashboard
const selectedProject = { id: 'project-a' } as ProjectSummary
const params = { projectId: 'project-a', selectedProject, sadddEligible: true }

describe('useSadddDashboard', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the project when the role and the project dates allow it', async () => {
    api.getSadddDashboard.mockResolvedValue(loaded)
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    expect(api.getSadddDashboard).toHaveBeenCalledWith({ projectId: 'project-a' })
    expect(result.current.sadddLoading).toBe(false)
  })

  it('does not read when the project is not eligible or not selected', () => {
    renderHook(() => useSadddDashboard({ ...params, sadddEligible: false }))
    renderHook(() => useSadddDashboard({ ...params, selectedProject: undefined }))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getSadddDashboard.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.sadddError).toBe('Down.'))
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    expect(result.current.sadddError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getSadddDashboard.mockRejectedValue('offline')
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.sadddError).toBe('SADDD analysis is unavailable.'))
  })

  it('clears the result, the failure and the loading flag on reset', async () => {
    api.getSadddDashboard.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    act(() => result.current.resetSaddd())
    expect(result.current.saddd).toBeNull()
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.sadddError).toBe('Down.'))
    act(() => result.current.resetSaddd())
    expect(result.current.sadddError).toBe('')
    api.getSadddDashboard.mockReturnValue(new Promise(() => {}))
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.sadddLoading).toBe(true))
    act(() => result.current.resetSaddd())
    expect(result.current.sadddLoading).toBe(false)
  })
})
```


Create `apps/web/src/features/analytics/hooks/use-analytics-export.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AnalysisView } from '../analytics.copy'
import { useAnalyticsExport } from './use-analytics-export'

const api = vi.hoisted(() => ({ preview: vi.fn(), download: vi.fn(), toastError: vi.fn() }))
vi.mock('@/constants/feature-flags', () => ({ ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true }))
vi.mock('@/lib/api/analytics', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAnalyticsExportPreview: api.preview,
}))
vi.mock('@/lib/services/core-feature-client', () => ({ downloadCoreArtifact: api.download }))
vi.mock('sonner', () => ({ toast: { error: api.toastError } }))

const projectId = '79300000-0000-4000-8000-000000000001'
const selectedPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const surveyPeriod = { value: 's', label: 'Third quarter', start: '2026-07-01', end: '2026-09-30' }
const params = {
  analysisView: 'kpi' as AnalysisView,
  canExportAnalytics: true,
  projectId,
  selectedPeriod,
  surveyPeriod,
  surveyUnavailable: false,
}
const rows = { title: 'Rows', columns: [], rows: [], totalRows: 0 }

describe('useAnalyticsExport', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('previews the shared period and names the file after the project', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({
      projectId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
    expect(result.current.exportPreview).toEqual({
      format: 'CSV',
      data: rows,
      path: `/analytics/descriptive/export?projectId=${projectId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
      fileName: `descriptive-analytics-${projectId}.csv`,
    })
    expect(result.current.exporting).toBe(false)
  })

  it('adds the format parameter for a spreadsheet', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('XLSX'))
    expect(result.current.exportPreview?.path).toMatch(/&format=XLSX$/)
    expect(result.current.exportPreview?.fileName).toBe(`descriptive-analytics-${projectId}.xlsx`)
  })

  it('uses the survey period and view on the survey view', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport({ ...params, analysisView: 'survey' }))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({
      projectId,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      view: 'survey',
    })
    expect(result.current.exportPreview?.fileName).toBe(`survey-analytics-${projectId}.csv`)
  })

  it('sends no period on the timeline view', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() =>
      useAnalyticsExport({ ...params, analysisView: 'timeline', selectedPeriod: undefined }),
    )
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({ projectId, view: 'timeline' })
  })

  it.each([
    ['without the permission', { canExportAnalytics: false }],
    ['without a project', { projectId: '' }],
    ['without a period', { selectedPeriod: undefined }],
    ['on an unavailable survey', { analysisView: 'survey' as const, surveyUnavailable: true }],
  ])('previews nothing %s', async (_name, change) => {
    const { result } = renderHook(() => useAnalyticsExport({ ...params, ...change }))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).not.toHaveBeenCalled()
    expect(result.current.exportPreview).toBeNull()
  })

  it('ignores a second preview while one is running', async () => {
    api.preview.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAnalyticsExport(params))
    act(() => {
      void result.current.previewExport('CSV')
    })
    await waitFor(() => expect(result.current.exporting).toBe(true))
    await act(() => result.current.previewExport('PDF'))
    expect(api.preview).toHaveBeenCalledTimes(1)
  })

  it('downloads the previewed file and closes the preview', async () => {
    api.preview.mockResolvedValue(rows)
    api.download.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('PDF'))
    const { path, fileName } = result.current.exportPreview ?? { path: '', fileName: '' }
    await act(() => result.current.downloadExport())
    expect(api.download).toHaveBeenCalledWith(path, fileName)
    expect(result.current.exportPreview).toBeNull()
  })

  it('keeps the preview open and reports a failed download', async () => {
    api.preview.mockResolvedValue(rows)
    api.download.mockRejectedValue(new Error('Download refused.'))
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    await act(() => result.current.downloadExport())
    expect(api.toastError).toHaveBeenCalledWith('Download refused.')
    expect(result.current.exportPreview).not.toBeNull()
    expect(result.current.exporting).toBe(false)
  })

  it('reports the server reason of a failed preview or a generic line', async () => {
    api.preview.mockRejectedValueOnce(new Error('Verification is unavailable.')).mockRejectedValue('x')
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    expect(api.toastError).toHaveBeenLastCalledWith('Verification is unavailable.')
    await act(() => result.current.previewExport('CSV'))
    expect(api.toastError).toHaveBeenLastCalledWith('Aggregate export unavailable.')
    expect(result.current.exportPreview).toBeNull()
  })

  it('closes the preview', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    act(() => result.current.closeExportPreview())
    expect(result.current.exportPreview).toBeNull()
  })
})
```


- [ ] **Step 4: Apply the plan and prove the move**

```bash
F=apps/web/src/features/analytics
H=$F/hooks
C=$F/components/analytics-dashboard.tsx
git hash-object $C | cut -c1-8
cp $C .tmp/s7c/before/analytics-dashboard-t6.tsx
node .tmp/s7c/cut.mjs .tmp/s7c/task6-cut.json
NEW="$H/use-saddd-dashboard.ts $H/use-descriptive-analytics.ts $H/use-survey-analytics.ts $H/use-timeline-analytics.ts $H/use-analytics-export.ts"
node .tmp/s7c/trim-imports.mjs $NEW $C | awk -F': removed ' '{n=split($2,a,", "); sub(".*/","",$1); print $1 ": " n " names removed"}'
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task6-edits.json
node .tmp/s7c/same-lines.mjs .tmp/s7c/before/analytics-dashboard-t6.tsx $NEW $C "onRetry={retrySurvey} ==> onRetry={() => setSurveyLoadAttempt((value) => value + 1)}" "onRetry={retryTimeline} ==> onRetry={() => setTimelineLoadAttempt((value) => value + 1)}" "onRetry={retryDescriptive} ==> onRetry={() => setDescriptiveLoadAttempt((value) => value + 1)}" "retrySaddd : undefined ==> () => setSadddLoadAttempt((value) => value + 1) : undefined" "onCancel={closeExportPreview} ==> onCancel={() => setExportPreview(null)}" --list
git add -N apps/web/src
pnpm exec biome check --write $NEW $C $F/analytics-reporting-periods.utils.ts $H/*.test.ts 2>&1 | tail -2
wc -l $NEW $C | sed "s#$F/##"
```


Expected:

```text
758a2788
apps/web/src/features/analytics/hooks/use-descriptive-analytics.ts: 176 lines
apps/web/src/features/analytics/hooks/use-survey-analytics.ts: 205 lines
apps/web/src/features/analytics/hooks/use-timeline-analytics.ts: 172 lines
apps/web/src/features/analytics/hooks/use-saddd-dashboard.ts: 175 lines
apps/web/src/features/analytics/hooks/use-analytics-export.ts: 189 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 1127 lines
use-saddd-dashboard.ts: 92 names removed
use-descriptive-analytics.ts: 93 names removed
use-survey-analytics.ts: 87 names removed
use-timeline-analytics.ts: 92 names removed
use-analytics-export.ts: 88 names removed
analytics-dashboard.tsx: 13 names removed
10 replacements in 3 files
1x const useSadddDashboard = ({
7x projectId
2x selectedProject
2x sadddEligible
5x }: {
5x projectId: string
1x selectedProject: ProjectSummary | undefined
1x sadddEligible: boolean
5x }) => {
14x }
2x })
5x return {
1x resetSaddd: () => {
1x retrySaddd: () => setSadddLoadAttempt((value) => value + 1)
1x saddd
1x sadddError
1x sadddLoading
1x const useDescriptiveAnalytics = ({
1x canReadDescriptive
3x selectedPeriod
1x canReadDescriptive: boolean
2x selectedPeriod: AnalyticsReportingPeriod | undefined
1x descriptive
1x descriptiveError
1x descriptiveLoading
1x resetDescriptive: () => {
1x retryDescriptive: () => setDescriptiveLoadAttempt((value) => value + 1)
1x const useSurveyAnalytics = ({
4x analysisView
1x surveyFrozenOnly
3x surveyPeriod
3x surveyUnavailable
3x analysisView: AnalysisView
1x surveyFrozenOnly: boolean
2x surveyPeriod: AnalyticsReportingPeriod | undefined
2x surveyUnavailable: boolean
1x resetSurvey: () => {
1x retrySurvey: () => setSurveyLoadAttempt((value) => value + 1)
1x survey
1x surveyError
1x surveyErrorKind
1x surveyLoading
1x const useTimelineAnalytics = ({
1x canReadSurveyTimeline
1x canReadSurveyTimeline: boolean
1x resetTimeline: () => {
1x retryTimeline: () => setTimelineLoadAttempt((value) => value + 1)
1x timeline
1x timelineError
1x timelineLoading
1x const useAnalyticsExport = ({
2x canExportAnalytics
1x canExportAnalytics: boolean
1x closeExportPreview: () => setExportPreview(null)
1x downloadExport
1x exportPreview
1x exporting
1x previewExport
1x const { resetSaddd, retrySaddd, saddd, sadddError, sadddLoading } = useSadddDashboard({
1x const { descriptive, descriptiveError, descriptiveLoading, resetDescriptive, retryDescriptive } =
1x useDescriptiveAnalytics({ canReadDescriptive, projectId, selectedPeriod })
1x const { resetSurvey, retrySurvey, survey, surveyError, surveyErrorKind, surveyLoading } =
1x useSurveyAnalytics({ analysisView, projectId, surveyFrozenOnly, surveyPeriod, surveyUnavailable })
1x const { resetTimeline, retryTimeline, timeline, timelineError, timelineLoading } =
1x useTimelineAnalytics({ analysisView, canReadSurveyTimeline, projectId })
1x const { closeExportPreview, downloadExport, exportPreview, exporting, previewExport } =
1x useAnalyticsExport({
1x resetSaddd()
1x resetDescriptive()
1x resetSurvey()
1x resetTimeline()
original lines 1190, lost 0, added 124
Checked 12 files in <ms>. Fixed 8 files.
   68 hooks/use-saddd-dashboard.ts
   69 hooks/use-descriptive-analytics.ts
  106 hooks/use-survey-analytics.ts
   66 hooks/use-timeline-analytics.ts
   86 hooks/use-analytics-export.ts
 1109 components/analytics-dashboard.tsx
 1504 total
```


The hash is the one Task 5 printed. The five hook files are 66 to 106 lines and the component is 1109 lines. `trim-imports` removes the unused names of the shared import block, and the edit file applies 10 replacements in 3 files. `same-lines` says `lost 0` over the 1190 declaration lines of the component. The five rename arguments map the retry and cancel props back to the inline calls they replace, and the added lines are the five signatures with their parameter types, the returned names, the five calls and the four reset calls of `handleProjectChange`. Biome formats 8 of the 12 files.

- [ ] **Step 5: Typecheck and run the tests**

The five hook tests and the six dashboard test files (67 cases plus the two Retry cases) run against the hooks:

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
(cd apps/web && pnpm exec vitest run src/features/analytics src/features/ui-copy-cleanup.contract.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL |Error")
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  20 passed (20)
      Tests  195 passed (195)
```


The typecheck is clean with the two baseline lines. The analytics tests pass: 18 files and 167 tests (the 69 dashboard cases, the 36 hook cases and the other tests of the feature).

- [ ] **Step 6: Prove the new tests and the wiring**

`mutate-hooks.sh` changes each hook once (a guard, an argument, the retry, each line of the reset, a message, the file name, the download) and runs the five hook tests; `mutate-dashboard-after.sh` changes the wiring of the component (the Retry and Cancel props, and the reset calls of `handleProjectChange`) and runs the dashboard tests:

Create `.tmp/s7c/mutate-hooks.sh`:

```bash
H=apps/web/src/features/analytics/hooks
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/features/analytics/hooks 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +Tests +[0-9]" | sort -u); }
mutate() {
  # Usage: mutate <label> <hook file> <sed expression>; changes the hook once, runs the four hook tests and restores the file.
  cp "$H/$2" .tmp/s7c/files/mutant.bak
  sed -i "$3" "$H/$2"
  if cmp -s "$H/$2" .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run
  cp .tmp/s7c/files/mutant.bak "$H/$2"
}
mkdir -p .tmp/s7c/files/hooks-orig && cp $H/use-*.ts .tmp/s7c/files/hooks-orig/
echo "unmutated"; run
D=use-descriptive-analytics.ts
mutate "descriptive reads without the permission" $D 's/ || !canReadDescriptive) {/) {/'
mutate "descriptive period end dropped" $D '/periodEnd: selectedPeriod.end,/d'
mutate "descriptive retry does nothing" $D 's/setDescriptiveLoadAttempt((value) => value + 1)/setDescriptiveLoadAttempt((value) => value)/'
mutate "descriptive reset keeps the result" $D '/resetDescriptive: () => {/,/},/{/setDescriptive(null)/d}'
mutate "descriptive reset keeps the failure" $D '/resetDescriptive: () => {/,/},/{/setDescriptiveError/d}'
mutate "descriptive fallback message changed" $D 's/Descriptive statistics are unavailable\./Unavailable./'
S=use-survey-analytics.ts
mutate "survey reads on every view" $S "s/ || analysisView !== 'survey'//"
mutate "survey reads when unavailable" $S 's/ || surveyUnavailable//'
mutate "a 403 maps to the period kind" $S "s/kind === 'restricted'/kind === 'period'/"
mutate "frozen roles get the open period copy" $S 's/^\( *\)? surveyFrozenOnly$/\1? !surveyFrozenOnly/'
mutate "survey retry does nothing" $S 's/setSurveyLoadAttempt((value) => value + 1)/setSurveyLoadAttempt((value) => value)/'
mutate "survey reset keeps the result" $S '/resetSurvey: () => {/,/},/{/setSurvey(null)/d}'
mutate "survey reset keeps the error kind" $S "/resetSurvey: () => {/,/},/{/setSurveyErrorKind/d}"
mutate "survey fallback message changed" $S 's/Survey analytics could not be loaded\./Unavailable./'
T=use-timeline-analytics.ts
mutate "timeline reads without the permission" $T 's/ || !canReadSurveyTimeline//'
mutate "timeline reads on every view" $T "s/ || analysisView !== 'timeline'//"
mutate "timeline retry does nothing" $T 's/setTimelineLoadAttempt((value) => value + 1)/setTimelineLoadAttempt((value) => value)/'
mutate "timeline reset keeps the result" $T '/resetTimeline: () => {/,/},/{/setTimeline(null)/d}'
mutate "timeline reset keeps the failure" $T '/resetTimeline: () => {/,/},/{/setTimelineError/d}'
mutate "timeline fallback message changed" $T 's/Timeline analytics could not be loaded\./Unavailable./'
A=use-saddd-dashboard.ts
mutate "saddd reads when not eligible" $A 's/if (!sadddEligible) {/if (sadddEligible) {/'
mutate "saddd reads without a project" $A 's/if (!projectId || !selectedProject) {/if (!projectId) {/'
mutate "saddd retry does nothing" $A 's/setSadddLoadAttempt((value) => value + 1)/setSadddLoadAttempt((value) => value)/'
mutate "saddd reset keeps the result" $A '/resetSaddd: () => {/,/},/{/setSaddd(null)/d}'
mutate "saddd reset keeps the loading flag" $A '/resetSaddd: () => {/,/},/{/setSadddLoading/d}'
mutate "saddd reset keeps the failure" $A '/resetSaddd: () => {/,/},/{/setSadddError/d}'
mutate "saddd fallback message changed" $A 's/SADDD analysis is unavailable\./Unavailable./'
X=use-analytics-export.ts
mutate "export ignores the permission" $X 's/ || !canExportAnalytics//'
mutate "export may start twice" $X 's/ || exporting)$/)/'
mutate "survey export ignores an unavailable survey" $X '/if (view === .survey. && surveyUnavailable) return/d'
mutate "export may run without a period" $X '/if (view !== .timeline. && !exportPeriod) return/d'
mutate "survey export uses the shared period" $X "s/const exportPeriod = view === 'survey' ? surveyPeriod : selectedPeriod/const exportPeriod = selectedPeriod/"
mutate "export file name loses the view" $X "s/\${view ?? 'descriptive'}-analytics-/analytics-/"
mutate "csv gets a format parameter" $X "s/format === 'CSV' ? ''/format !== 'CSV' ? ''/"
mutate "download swaps path and name" $X 's/exportPreview.path, exportPreview.fileName/exportPreview.fileName, exportPreview.path/'
mutate "download leaves the preview open" $X '/await downloadCoreArtifact/{n;d}'
mutate "cancel closes nothing" $X 's/closeExportPreview: () => setExportPreview(null)/closeExportPreview: () => undefined/'
mutate "export failure message changed" $X "s/Aggregate export unavailable\./Unavailable./"
for f in use-saddd-dashboard use-descriptive-analytics use-survey-analytics use-timeline-analytics use-analytics-export; do cmp .tmp/s7c/files/hooks-orig/$f.ts $H/$f.ts || echo "NOT RESTORED $f"; done
echo "hooks restored"
```


Create `.tmp/s7c/mutate-dashboard-after.sh`:

```bash
C=apps/web/src/features/analytics/components/analytics-dashboard.tsx
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/features/analytics/components/analytics-dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +Tests +[0-9]" | sort -u); }
mutate() {
  # Usage: mutate <label> <file> <sed expression>; changes the file once, runs the dashboard tests and restores it.
  cp "$2" .tmp/s7c/files/mutant.bak
  sed -i "$3" "$2"
  if cmp -s "$2" .tmp/s7c/files/mutant.bak; then echo "NOT CHANGED: $1"; return; fi
  echo "$1"; run
  cp .tmp/s7c/files/mutant.bak "$2"
}
cp $C .tmp/s7c/files/dashboard.orig
echo "unmutated"; run
mutate "survey retry does nothing" $C 's/onRetry={retrySurvey}/onRetry={() => undefined}/'
mutate "timeline retry does nothing" $C 's/onRetry={retryTimeline}/onRetry={() => undefined}/'
mutate "descriptive retry does nothing" $C 's/onRetry={retryDescriptive}/onRetry={() => undefined}/'
mutate "saddd retry does nothing" $C 's/retrySaddd : undefined/(() => undefined) : undefined/'
mutate "export cancel does nothing" $C 's/onCancel={closeExportPreview}/onCancel={() => undefined}/'
echo "reset calls of handleProjectChange (the effects clear the same states in the same commit)"
for call in resetSaddd resetDescriptive resetSurvey resetTimeline; do
  mutate "handler no longer calls $call" $C "/^    $call()\$/d"
done
cmp .tmp/s7c/files/dashboard.orig $C && echo "component restored"
```


```bash
bash .tmp/s7c/mutate-hooks.sh
```


Expected:

```text
unmutated
      Tests  36 passed (36)
descriptive reads without the permission
      Tests  1 failed | 35 passed (36)
descriptive period end dropped
      Tests  1 failed | 35 passed (36)
descriptive retry does nothing
      Tests  2 failed | 34 passed (36)
descriptive reset keeps the result
      Tests  1 failed | 35 passed (36)
descriptive reset keeps the failure
      Tests  1 failed | 35 passed (36)
descriptive fallback message changed
      Tests  1 failed | 35 passed (36)
survey reads on every view
      Tests  1 failed | 35 passed (36)
survey reads when unavailable
      Tests  1 failed | 35 passed (36)
a 403 maps to the period kind
      Tests  3 failed | 33 passed (36)
frozen roles get the open period copy
      Tests  2 failed | 34 passed (36)
survey retry does nothing
      Tests  2 failed | 34 passed (36)
survey reset keeps the result
      Tests  1 failed | 35 passed (36)
survey reset keeps the error kind
      Tests  1 failed | 35 passed (36)
survey fallback message changed
      Tests  1 failed | 35 passed (36)
timeline reads without the permission
      Tests  1 failed | 35 passed (36)
timeline reads on every view
      Tests  1 failed | 35 passed (36)
timeline retry does nothing
      Tests  2 failed | 34 passed (36)
timeline reset keeps the result
      Tests  1 failed | 35 passed (36)
timeline reset keeps the failure
      Tests  1 failed | 35 passed (36)
timeline fallback message changed
      Tests  1 failed | 35 passed (36)
saddd reads when not eligible
      Tests  5 failed | 31 passed (36)
saddd reads without a project
      Tests  1 failed | 35 passed (36)
saddd retry does nothing
      Tests  2 failed | 34 passed (36)
saddd reset keeps the result
      Tests  1 failed | 35 passed (36)
saddd reset keeps the loading flag
      Tests  1 failed | 35 passed (36)
saddd reset keeps the failure
      Tests  1 failed | 35 passed (36)
saddd fallback message changed
      Tests  1 failed | 35 passed (36)
export ignores the permission
      Tests  1 failed | 35 passed (36)
export may start twice
      Tests  5 failed | 31 passed (36)
survey export ignores an unavailable survey
      Tests  1 failed | 35 passed (36)
export may run without a period
      Tests  1 failed | 35 passed (36)
survey export uses the shared period
      Tests  1 failed | 35 passed (36)
export file name loses the view
      Tests  3 failed | 33 passed (36)
csv gets a format parameter
      Tests  2 failed | 34 passed (36)
download swaps path and name
      Tests  1 failed | 35 passed (36)
download leaves the preview open
      Tests  1 failed | 35 passed (36)
cancel closes nothing
      Tests  1 failed | 35 passed (36)
export failure message changed
      Tests  1 failed | 35 passed (36)
hooks restored
```


The unmutated run passes (36 tests). Each of the 38 mutations of the hooks (the permission and project guards, a period end, each retry, each line of every reset, each fallback message, the file name, the csv format parameter, the download and the preview) fails at least one case, and the last line says the hook files were restored.

```bash
bash .tmp/s7c/mutate-dashboard-after.sh
```


Expected:

```text
unmutated
      Tests  69 passed (69)
survey retry does nothing
      Tests  1 failed | 68 passed (69)
timeline retry does nothing
      Tests  1 failed | 68 passed (69)
descriptive retry does nothing
      Tests  1 failed | 68 passed (69)
saddd retry does nothing
      Tests  1 failed | 68 passed (69)
export cancel does nothing
      Tests  1 failed | 68 passed (69)
reset calls of handleProjectChange (the effects clear the same states in the same commit)
handler no longer calls resetSaddd
      Tests  69 passed (69)
handler no longer calls resetDescriptive
      Tests  69 passed (69)
handler no longer calls resetSurvey
      Tests  69 passed (69)
handler no longer calls resetTimeline
      Tests  69 passed (69)
component restored
```


The unmutated run passes (69 cases). The five wiring mutations each fail exactly one case. The four reset-call mutations of `handleProjectChange` survive for the reason given in Step 1: the hook effects clear the same state when the project id changes, in the same commit, so the calls are equivalent to the lines the effects already run; the lines stay because they are the original behavior, and each reset function is pinned in its hook test (Step 6, first run). The last line says the component was restored.

- [ ] **Step 7: Check, run the whole web suite and commit**

```bash
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the analytics dashboard reads and export into five hooks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1535 files in <ms>. No fixes applied.
 Test Files  264 passed (264)
      Tests  2413 passed (2413)
<n> files changed, 893 insertions(+), 254 deletions(-)
```


Biome is clean over 1535 files, and web is 264 files and 2413 tests: Task 5 plus the five hook tests (36 tests) and the two Retry cases committed in Step 2. The commit changes 12 files (five hooks, five hook tests, the component and the period helper).

---

### Task 7: Move the SADDD, descriptive, alerts and summary sections out of the dashboard markup

**Files:**
- Create: `apps/web/src/features/analytics/components/analytics-dashboard.summary.test.tsx` (Step 1), then `saddd-analysis-panel.tsx`, `descriptive-statistics-panel.tsx`, `open-alerts-panel.tsx` and `analytics-summary-cards.tsx`
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.tsx` (rebuilt from its own line ranges), `apps/web/src/features/analytics/analytics.reads.ts` (one exported type), `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (one path)
- Create (gitignored): `.tmp/s7c/task7-cut.json`, `task7-edits.json`, `mutate-sections.mjs`, `before/analytics-dashboard-t7.tsx`

After Task 6 the function still holds about 590 lines of markup. Four sections of it have few inputs and no state of their own, so each becomes a component that takes the names the markup already uses as props: the SADDD panel (7 props), the descriptive statistics panel (5), the open alerts panel (6) and the summary cards (13). The markup is copied by line range, so every class, label, condition and message stays; the three constants that only the summary cards read (`openAlertCount`, the budget currency values and `completedActivities`) move with them. The filter bar and the analysis panel stay in the shell: they read about 25 names each, so they need the scope state of the dashboard to be grouped first, which is the first task of the S7d outline.

- [ ] **Step 1: Pin the summary cards and the empty descriptive statistics panel before anything moves**

The prop mutations of Step 4 would leave eight props that no existing test reaches: the existing cards test reads the alerts card through a join of every node with the same label (the panel text hides a wrong card value), and nothing asserts the values of the activity, KPI and budget cards or the two empty states of the descriptive statistics panel. `analytics-dashboard.summary.test.tsx` adds nine cases against the unsplit component: the completed activities count, the card hidden without `activities.read`, the KPI average, the budget card on a failed read, the failed alerts read in the tooltip, the open alert count as the card value (two rows), and the empty descriptive panel for a role that reads periods and for one that cannot:

Create `apps/web/src/features/analytics/components/analytics-dashboard.summary.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  alertHook,
  api,
  currentAccess,
  indicator,
  insights,
  monitoring,
  project,
  resetAnalyticsMocks,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const activity = (id: string, status: string) => ({
  id,
  projectId: 'project-a',
  code: id,
  title: `Activity ${id}`,
  status,
})

const released = (id: string, value: string) => ({
  ...indicator('project-a', id, '2026-09-01', '2026-09-30'),
  progress: { state: 'AVAILABLE', value, reason: null },
})

describe('Analytics dashboard summary cards and descriptive statistics empty state', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // The card comes first in the page; a panel with the same title follows it.
  const card = (label: string) => screen.getAllByText(label)[0].parentElement?.parentElement
  const withPermissions = (...extra: string[]) => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...extra]
  }

  it('counts the completed activities in the Activity completion card', async () => {
    api.getActivities.mockResolvedValue([
      activity('A-1', 'Completed'),
      activity('A-2', 'Not Started'),
      activity('A-3', 'Completed'),
    ])
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('Activity completion')?.textContent).toContain('2/3'))
  })

  it('hides the Activity completion card and panel without activities.read', async () => {
    currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
      (permission) => permission !== 'activities.read',
    )
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByText('Activity completion')).toBeNull()
  })

  it('shows the average of the released indicator progress in the KPI card', async () => {
    api.getMonitoringDashboard.mockResolvedValue({
      ...monitoring,
      indicators: [released('A-SEP', '40'), released('A-AUG', '61')],
    })
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('KPI achievement')?.textContent).toContain('51%'))
  })

  it('shows Unavailable in the Budget utilization card when the budget read fails', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    withPermissions('analytics.descriptive.read', 'budgets.read', 'expenses.read')
    insights.budget = { data: undefined, isError: true, isPending: false, refetch: vi.fn() }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('Budget utilization')?.textContent).toContain('Unavailable'))
  })

  it('names the failed read in the tooltip of the alerts card', async () => {
    withPermissions('alerts.read')
    alertHook.result = { data: undefined, isError: true, refetch: vi.fn() }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(card('Rule-Based Alerts')?.textContent).toBe('Rule-Based AlertsUnavailable')
    const info = screen.getAllByRole('button', {
      name: 'More information about Rule-Based Alerts',
    })[0]
    fireEvent.focus(info)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Open alerts could not be loaded. Use Retry in the Rule-Based Alerts panel.',
    )
  })

  it.each([
    [{ count: 7, capped: false }, '7'],
    [{ count: 1000, capped: true }, '1000+'],
  ])('shows the open alert count %j as the value of the alerts card', async (data, value) => {
    withPermissions('alerts.read')
    alertHook.result = { data, isError: false }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(card('Rule-Based Alerts')?.textContent).toBe(`Rule-Based Alerts${value}`)
  })

  describe('descriptive statistics panel without a result', () => {
    const panel = () => {
      const section = screen
        .getByRole('heading', { name: 'Descriptive statistics' })
        .closest('section')
      if (!section) throw new Error('descriptive statistics panel missing')
      return within(section)
    }

    it('says there is no active reporting period when the role reads periods and none exists', async () => {
      withPermissions('analytics.descriptive.read')
      api.getProjectsForRole.mockResolvedValue([project('project-empty', 'Empty', null, null)])
      api.getProjectIndicators.mockResolvedValue([])
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
      await waitFor(() =>
        expect(
          panel().getByText('No active Indicator reporting period is available for this project.'),
        ).toBeTruthy(),
      )
      expect(panel().getByText('None yet')).toBeTruthy()
    })

    it('says the periods are not available for a role that cannot read indicators', async () => {
      currentAccess.profile.permissions = [
        'projects.read',
        'activities.read',
        'monitoring.read',
        'analytics.read',
        'analytics.descriptive.read',
      ]
      render(<AnalyticsDashboard />)
      await waitFor(() =>
        expect(
          panel().getByText('Indicator reporting periods are not available for this role.'),
        ).toBeTruthy(),
      )
      expect(panel().getByText('Data unavailable')).toBeTruthy()
    })
  })
})
```


```bash
F=apps/web/src/features/analytics/components
git add -N apps/web/src
pnpm exec biome check --write $F/analytics-dashboard.summary.test.tsx 2>&1 | tail -1
node .tmp/s7c/count-it.mjs $F/analytics-dashboard.summary.test.tsx | tail -1
(cd apps/web && pnpm exec vitest run src/features/analytics/components 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
pnpm lint 2>&1 | tail -1
git add apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the summary cards and the empty descriptive statistics panel of the analytics dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
Checked 1 file in <ms>. No fixes applied.
total: it 8, describe 2, expect 15
 Test Files  11 passed (11)
      Tests  120 passed (120)
Checked 1536 files in <ms>. No fixes applied.
 1 file changed, 152 insertions(+)
```


Biome changes nothing (the file is printed as it formats), and the file holds 8 `it` blocks (9 cases, because one is an `it.each`) with 15 assertions. The components folder passes: 11 files and 120 tests, so the nine cases pass on the unsplit component. Lint is clean over 1536 files and the commit adds one file of 152 lines. Step 4 shows that each case fails when a prop of a section is wrong.

- [ ] **Step 2: Create the cut plan and the edits**

`task7-cut.json` pins the hash of the component and lists, for each of the four files, the header lines (`'use client'`, the source's import block, the neighbours), the typed props and the line range of the markup; the shell is rebuilt from the ranges around the four sections with one call each. `task7-edits.json` adds the `OpenAlertCount` type that two of the components name and points the copy contract test at the file that now holds `: monitoringReadable`:

Create `.tmp/s7c/task7-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "792f06e3",
 "files": {
  "apps/web/src/features/analytics/components/saddd-analysis-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { SadddDashboard } from '@pathways/shared'",
   "",
   "export const SadddAnalysisPanel = ({",
   "  retrySaddd,",
   "  saddd,",
   "  sadddEligible,",
   "  sadddError,",
   "  sadddLoading,",
   "  sadddNotice,",
   "  sadddOngoing,",
   "}: {",
   "  retrySaddd: () => void",
   "  saddd: SadddDashboard | null",
   "  sadddEligible: boolean",
   "  sadddError: string",
   "  sadddLoading: boolean",
   "  sadddNotice: { title: string; description: string } | null",
   "  sadddOngoing: boolean",
   "}) => (",
   [956, 1020],
   ")"
  ],
  "apps/web/src/features/analytics/components/descriptive-statistics-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { DescriptiveAnalytics } from '@pathways/shared'",
   "",
   "export const DescriptiveStatisticsPanel = ({",
   "  descriptive,",
   "  descriptiveError,",
   "  descriptiveLoading,",
   "  periodsReadable,",
   "  retryDescriptive,",
   "}: {",
   "  descriptive: DescriptiveAnalytics | null",
   "  descriptiveError: string",
   "  descriptiveLoading: boolean",
   "  periodsReadable: boolean",
   "  retryDescriptive: () => void",
   "}) => (",
   [1023, 1054],
   ")"
  ],
  "apps/web/src/features/analytics/components/open-alerts-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { OpenAlertCount } from '../analytics.reads'",
   "",
   "export const OpenAlertsPanel = ({",
   "  alertRead,",
   "  alertsFailed,",
   "  alertsLoading,",
   "  canReadAlerts,",
   "  openAlertText,",
   "  openAlerts,",
   "}: {",
   "  alertRead: { refetch: () => unknown }",
   "  alertsFailed: boolean",
   "  alertsLoading: boolean",
   "  canReadAlerts: boolean",
   "  openAlertText: string",
   "  openAlerts: OpenAlertCount | null",
   "}) => (",
   [1074, 1101],
   ")"
  ],
  "apps/web/src/features/analytics/components/analytics-summary-cards.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { OpenAlertCount } from '../analytics.reads'",
   "",
   "export const AnalyticsSummaryCards = ({",
   "  activities,",
   "  alertsFailed,",
   "  alertsLoading,",
   "  averageKpi,",
   "  budgetRead,",
   "  canReadActivities,",
   "  canReadAlerts,",
   "  canReadBudgetUtilization,",
   "  canReadIndicators,",
   "  monitoring,",
   "  monitoringReadable,",
   "  openAlertText,",
   "  openAlerts,",
   "}: {",
   "  activities: readonly ActivitySummary[]",
   "  alertsFailed: boolean",
   "  alertsLoading: boolean",
   "  averageKpi: number | null",
   "  budgetRead: ReturnType<typeof useBudgetSummary>",
   "  canReadActivities: boolean",
   "  canReadAlerts: boolean",
   "  canReadBudgetUtilization: boolean",
   "  canReadIndicators: boolean",
   "  monitoring: MonitoringDashboard | null",
   "  monitoringReadable: boolean",
   "  openAlertText: string",
   "  openAlerts: OpenAlertCount | null",
   "}) => {",
   [156, 156],
   [217, 219],
   [481, 483],
   "",
   "  return (",
   [820, 922],
   "  )",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { SadddAnalysisPanel } from './saddd-analysis-panel'",
   "import { DescriptiveStatisticsPanel } from './descriptive-statistics-panel'",
   "import { OpenAlertsPanel } from './open-alerts-panel'",
   "import { AnalyticsSummaryCards } from './analytics-summary-cards'",
   "",
   [105, 155],
   [157, 216],
   [220, 480],
   [484, 819],
   "          <AnalyticsSummaryCards",
   "            activities={activities}",
   "            alertsFailed={alertsFailed}",
   "            alertsLoading={alertsLoading}",
   "            averageKpi={averageKpi}",
   "            budgetRead={budgetRead}",
   "            canReadActivities={canReadActivities}",
   "            canReadAlerts={canReadAlerts}",
   "            canReadBudgetUtilization={canReadBudgetUtilization}",
   "            canReadIndicators={canReadIndicators}",
   "            monitoring={monitoring}",
   "            monitoringReadable={monitoringReadable}",
   "            openAlertText={openAlertText}",
   "            openAlerts={openAlerts}",
   "          />",
   [923, 955],
   "              <SadddAnalysisPanel",
   "                retrySaddd={retrySaddd}",
   "                saddd={saddd}",
   "                sadddEligible={sadddEligible}",
   "                sadddError={sadddError}",
   "                sadddLoading={sadddLoading}",
   "                sadddNotice={sadddNotice}",
   "                sadddOngoing={sadddOngoing}",
   "              />",
   [1021, 1022],
   "              <DescriptiveStatisticsPanel",
   "                descriptive={descriptive}",
   "                descriptiveError={descriptiveError}",
   "                descriptiveLoading={descriptiveLoading}",
   "                periodsReadable={periodsReadable}",
   "                retryDescriptive={retryDescriptive}",
   "              />",
   [1055, 1073],
   "                <OpenAlertsPanel",
   "                  alertRead={alertRead}",
   "                  alertsFailed={alertsFailed}",
   "                  alertsLoading={alertsLoading}",
   "                  canReadAlerts={canReadAlerts}",
   "                  openAlertText={openAlertText}",
   "                  openAlerts={openAlerts}",
   "                />",
   [1102, 1109]
  ]
 }
}
```


Create `.tmp/s7c/task7-edits.json`:

```json
[
 ["apps/web/src/features/analytics/analytics.reads.ts", "  return { count, capped }\n}\n", "  return { count, capped }\n}\n\nexport type OpenAlertCount = Awaited<ReturnType<typeof countOpenAlerts>>\n", 1],
 ["apps/web/src/features/ui-copy-cleanup.contract.test.ts", "['features/analytics/components/analytics-dashboard.tsx', ': monitoringReadable']", "['features/analytics/components/analytics-summary-cards.tsx', ': monitoringReadable']", 1]
]
```


- [ ] **Step 3: Apply the plan and prove the move**

```bash
F=apps/web/src/features/analytics
C=$F/components/analytics-dashboard.tsx
git hash-object $C | cut -c1-8
wc -l < $C
cp $C .tmp/s7c/before/analytics-dashboard-t7.tsx
node .tmp/s7c/cut.mjs .tmp/s7c/task7-cut.json
NEW="$F/components/saddd-analysis-panel.tsx $F/components/descriptive-statistics-panel.tsx $F/components/open-alerts-panel.tsx $F/components/analytics-summary-cards.tsx"
node .tmp/s7c/trim-imports.mjs $NEW $C | awk -F': removed ' '{n=split($2,a,", "); sub(".*/","",$1); print $1 ": " n " names removed"}'
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task7-edits.json
node .tmp/s7c/same-lines.mjs .tmp/s7c/before/analytics-dashboard-t7.tsx $NEW $C --list
git add -N apps/web/src
pnpm exec biome check --write $NEW $C $F/analytics.reads.ts apps/web/src/features/ui-copy-cleanup.contract.test.ts 2>&1 | tail -2
wc -l $NEW $C | sed "s#$F/##"
```


Expected:

```text
792f06e3
1109
apps/web/src/features/analytics/components/saddd-analysis-panel.tsx: 188 lines
apps/web/src/features/analytics/components/descriptive-statistics-panel.tsx: 151 lines
apps/web/src/features/analytics/components/open-alerts-panel.tsx: 149 lines
apps/web/src/features/analytics/components/analytics-summary-cards.tsx: 248 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 917 lines
saddd-analysis-panel.tsx: 79 names removed
descriptive-statistics-panel.tsx: 83 names removed
open-alerts-panel.tsx: 85 names removed
analytics-summary-cards.tsx: 77 names removed
analytics-dashboard.tsx: 12 names removed
2 replacements in 2 files
1x const SadddAnalysisPanel = ({
1x retrySaddd
1x saddd
1x sadddEligible
1x sadddError
1x sadddLoading
1x sadddNotice
1x sadddOngoing
4x }: {
1x retrySaddd: () => void
1x saddd: SadddDashboard | null
1x sadddEligible: boolean
1x sadddError: string
1x sadddLoading: boolean
1x sadddNotice: { title: string; description: string } | null
1x sadddOngoing: boolean
3x }) => (
4x />
4x )
1x const DescriptiveStatisticsPanel = ({
1x descriptive
1x descriptiveError
1x descriptiveLoading
1x periodsReadable
1x retryDescriptive
1x descriptive: DescriptiveAnalytics | null
1x descriptiveError: string
1x descriptiveLoading: boolean
1x periodsReadable: boolean
1x retryDescriptive: () => void
1x }
1x const OpenAlertsPanel = ({
1x alertRead
2x alertsFailed
2x alertsLoading
2x canReadAlerts
2x openAlertText
2x openAlerts
1x alertRead: { refetch: () => unknown }
2x alertsFailed: boolean
2x alertsLoading: boolean
2x canReadAlerts: boolean
2x openAlertText: string
2x openAlerts: OpenAlertCount | null
1x const AnalyticsSummaryCards = ({
1x activities
1x averageKpi
1x budgetRead
1x canReadActivities
1x canReadBudgetUtilization
1x canReadIndicators
1x monitoring
1x monitoringReadable
1x activities: readonly ActivitySummary[]
1x averageKpi: number | null
1x budgetRead: ReturnType<typeof useBudgetSummary>
1x canReadActivities: boolean
1x canReadBudgetUtilization: boolean
1x canReadIndicators: boolean
1x monitoring: MonitoringDashboard | null
1x monitoringReadable: boolean
1x }) => {
1x return (
1x activities={activities}
1x periodsReadable={periodsReadable}
1x <AnalyticsSummaryCards
2x alertsFailed={alertsFailed}
2x alertsLoading={alertsLoading}
1x averageKpi={averageKpi}
1x budgetRead={budgetRead}
1x canReadActivities={canReadActivities}
2x canReadAlerts={canReadAlerts}
1x canReadBudgetUtilization={canReadBudgetUtilization}
1x canReadIndicators={canReadIndicators}
1x monitoring={monitoring}
1x monitoringReadable={monitoringReadable}
2x openAlertText={openAlertText}
2x openAlerts={openAlerts}
1x <SadddAnalysisPanel
1x retrySaddd={retrySaddd}
1x saddd={saddd}
1x sadddEligible={sadddEligible}
1x sadddError={sadddError}
1x sadddLoading={sadddLoading}
1x sadddNotice={sadddNotice}
1x sadddOngoing={sadddOngoing}
1x <DescriptiveStatisticsPanel
1x descriptive={descriptive}
1x descriptiveError={descriptiveError}
1x descriptiveLoading={descriptiveLoading}
1x retryDescriptive={retryDescriptive}
1x <OpenAlertsPanel
1x alertRead={alertRead}
original lines 990, lost 0, added 119
Checked 7 files in <ms>. Fixed 5 files.
   93 components/saddd-analysis-panel.tsx
   56 components/descriptive-statistics-panel.tsx
   52 components/open-alerts-panel.tsx
  154 components/analytics-summary-cards.tsx
  898 components/analytics-dashboard.tsx
 1253 total
```


The first two lines are the hash and the length that the cut plan pins. The four new files are written at 149 to 248 lines and the shell at 917 lines; `trim-imports` removes the names each file does not use; the edit file applies 2 replacements in 2 files. `same-lines` says `lost 0` over the 990 declaration lines of the component, and the added lines are the four signatures with their typed props (each destructured name is counted twice, once in the pattern and once in the type) and the four calls with their props. Biome formats 5 of the 7 files; the new files are 52 to 154 lines and the shell is 898 lines.

- [ ] **Step 4: Typecheck, run the tests and prove the wiring**

The dashboard tests and the copy contract run against the sections. `mutate-sections.mjs` then replaces each prop that the shell hands to a section with a wrong value (a negated flag, an empty string, `null`, a no-op function), one at a time, runs the dashboard tests and restores the shell; every mutation must fail at least one test:

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
(cd apps/web && pnpm exec vitest run src/features/analytics src/features/ui-copy-cleanup.contract.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL |Error")
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  21 passed (21)
      Tests  204 passed (204)
```


The typecheck is clean with the two baseline lines, and the analytics tests pass: 19 files and 176 tests (the 167 of Task 6 and the nine pins).

Create `.tmp/s7c/mutate-sections.mjs`:

```js
// Replaces one prop of one extracted section in the dashboard shell with a wrong value, runs the dashboard tests and restores the shell.
// Usage: node .tmp/s7c/mutate-sections.mjs; every line it prints names the prop and the test result of the mutated shell.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const shell = 'apps/web/src/features/analytics/components/analytics-dashboard.tsx'
const original = readFileSync(shell, 'utf8')
const wrong = {
  SadddAnalysisPanel: {
    retrySaddd: '() => undefined',
    saddd: 'null',
    sadddEligible: '!sadddEligible',
    sadddError: "''",
    sadddLoading: '!sadddLoading',
    sadddNotice: 'null',
    sadddOngoing: '!sadddOngoing',
  },
  DescriptiveStatisticsPanel: {
    descriptive: 'null',
    descriptiveError: "''",
    descriptiveLoading: '!descriptiveLoading',
    periodsReadable: '!periodsReadable',
    retryDescriptive: '() => undefined',
  },
  OpenAlertsPanel: {
    alertRead: '{ refetch: () => undefined }',
    alertsFailed: '!alertsFailed',
    alertsLoading: '!alertsLoading',
    canReadAlerts: '!canReadAlerts',
    openAlertText: "''",
    openAlerts: 'null',
  },
  AnalyticsSummaryCards: {
    activities: '[]',
    alertsFailed: '!alertsFailed',
    alertsLoading: '!alertsLoading',
    averageKpi: 'null',
    budgetRead: '{ ...budgetRead, isError: !budgetRead.isError }',
    canReadActivities: '!canReadActivities',
    canReadAlerts: '!canReadAlerts',
    canReadBudgetUtilization: '!canReadBudgetUtilization',
    canReadIndicators: '!canReadIndicators',
    monitoring: 'null',
    monitoringReadable: '!monitoringReadable',
    openAlertText: "''",
    openAlerts: 'null',
  },
}
const run = () => {
  try {
    const out = execSync('pnpm exec vitest run src/features/analytics/components/analytics-dashboard 2>&1', { cwd: 'apps/web', encoding: 'utf8', timeout: 300000 })
    return out.replace(/\x1b\[[0-9;]*m/g, '').match(/^ +Tests +.*$/m)?.[0].trim()
  } catch (error) {
    return String(error.stdout).replace(/\x1b\[[0-9;]*m/g, '').match(/^ +Tests +.*$/m)?.[0].trim() ?? 'run failed'
  }
}
console.log(`unmutated: ${run()}`)
const lines = original.split('\n')
for (const [component, props] of Object.entries(wrong)) {
  const start = lines.findIndex((line) => line.trim() === `<${component}`)
  if (start < 0) throw new Error(`${component} is not used in the shell`)
  for (const [prop, value] of Object.entries(props)) {
    const index = lines.findIndex((line, i) => i > start && line.trim() === `${prop}={${prop}}`)
    if (index < 0) throw new Error(`${component} has no ${prop} prop`)
    const mutated = [...lines]
    mutated[index] = mutated[index].replace(`{${prop}}`, `{${value}}`)
    writeFileSync(shell, mutated.join('\n'))
    console.log(`${component} ${prop} -> ${value}: ${run()}`)
  }
}
writeFileSync(shell, original)
console.log(readFileSync(shell, 'utf8') === original ? 'shell restored' : 'NOT RESTORED')
```


```bash
node .tmp/s7c/mutate-sections.mjs
```


Expected:

```text
unmutated: Tests  78 passed (78)
SadddAnalysisPanel retrySaddd -> () => undefined: Tests  1 failed | 77 passed (78)
SadddAnalysisPanel saddd -> null: Tests  2 failed | 76 passed (78)
SadddAnalysisPanel sadddEligible -> !sadddEligible: Tests  1 failed | 77 passed (78)
SadddAnalysisPanel sadddError -> '': Tests  2 failed | 76 passed (78)
SadddAnalysisPanel sadddLoading -> !sadddLoading: Tests  6 failed | 72 passed (78)
SadddAnalysisPanel sadddNotice -> null: Tests  3 failed | 75 passed (78)
SadddAnalysisPanel sadddOngoing -> !sadddOngoing: Tests  1 failed | 77 passed (78)
DescriptiveStatisticsPanel descriptive -> null: Tests  2 failed | 76 passed (78)
DescriptiveStatisticsPanel descriptiveError -> '': Tests  1 failed | 77 passed (78)
DescriptiveStatisticsPanel descriptiveLoading -> !descriptiveLoading: Tests  4 failed | 74 passed (78)
DescriptiveStatisticsPanel periodsReadable -> !periodsReadable: Tests  2 failed | 76 passed (78)
DescriptiveStatisticsPanel retryDescriptive -> () => undefined: Tests  1 failed | 77 passed (78)
OpenAlertsPanel alertRead -> { refetch: () => undefined }: Tests  1 failed | 77 passed (78)
OpenAlertsPanel alertsFailed -> !alertsFailed: Tests  4 failed | 74 passed (78)
OpenAlertsPanel alertsLoading -> !alertsLoading: Tests  5 failed | 73 passed (78)
OpenAlertsPanel canReadAlerts -> !canReadAlerts: Tests  5 failed | 73 passed (78)
OpenAlertsPanel openAlertText -> '': Tests  3 failed | 75 passed (78)
OpenAlertsPanel openAlerts -> null: Tests  3 failed | 75 passed (78)
AnalyticsSummaryCards activities -> []: Tests  1 failed | 77 passed (78)
AnalyticsSummaryCards alertsFailed -> !alertsFailed: Tests  3 failed | 75 passed (78)
AnalyticsSummaryCards alertsLoading -> !alertsLoading: Tests  4 failed | 74 passed (78)
AnalyticsSummaryCards averageKpi -> null: Tests  1 failed | 77 passed (78)
AnalyticsSummaryCards budgetRead -> { ...budgetRead, isError: !budgetRead.isError }: Tests  1 failed | 77 passed (78)
AnalyticsSummaryCards canReadActivities -> !canReadActivities: Tests  2 failed | 76 passed (78)
AnalyticsSummaryCards canReadAlerts -> !canReadAlerts: Tests  6 failed | 72 passed (78)
AnalyticsSummaryCards canReadBudgetUtilization -> !canReadBudgetUtilization: Tests  2 failed | 76 passed (78)
AnalyticsSummaryCards canReadIndicators -> !canReadIndicators: Tests  6 failed | 72 passed (78)
AnalyticsSummaryCards monitoring -> null: Tests  2 failed | 76 passed (78)
AnalyticsSummaryCards monitoringReadable -> !monitoringReadable: Tests  1 failed | 77 passed (78)
AnalyticsSummaryCards openAlertText -> '': Tests  2 failed | 76 passed (78)
AnalyticsSummaryCards openAlerts -> null: Tests  2 failed | 76 passed (78)
shell restored
```


The unmutated run passes (78 cases, the dashboard test files with the nine pins). Each of the 31 mutations (7 props of the SADDD panel, 5 of the descriptive statistics panel, 6 of the alerts panel and 13 of the summary cards) fails at least one case, and the last line says the shell was restored.

- [ ] **Step 5: Check, run the whole web suite and commit**

```bash
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the SADDD, descriptive statistics, alerts and summary sections out of the analytics dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1540 files in <ms>. No fixes applied.
 Test Files  265 passed (265)
      Tests  2422 passed (2422)
<n> files changed, 404 insertions(+), 258 deletions(-)
```


Biome is clean over 1540 files, and web is 265 files and 2422 tests: Task 6 plus the summary test file (9 tests). The commit changes 7 files (the four sections, the shell, `analytics.reads.ts` and the copy contract test). The shell is 898 lines, still above the 500 line flag; ruling 10 and the S7d outline say why and what follows.

---

### Task 8: Records

**Files:**
- Create (gitignored): `.tmp/s7c/task8-edits.json`, `.tmp/s7c/activity-s7c.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.7 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-17 rows), `docs/qad-pathways.md` (QAD-T18, QAD-T35, QAD-T63, QAD-T64), `docs/deferred-features.md` (rows 20, 23, 24, 26, 27, 28, 30 and 86), `docs/index.md` (CR row and plan row), `docs/activity-log.md`

No SAD routing change is needed (ruling 11): `scripts/sad/check.ts` already routes `apps/web/src/lib/api/**/*.ts` to `beneficiary-privacy-guardian` and `apps/web/src/**` to `design-qa-agent`.

- [ ] **Step 1: Amend the change record, the living docs and the index**

`task8-edits.json` holds the exact replacements: the layout paragraph of section 3.3, the S7 row of the roadmap (section 3.7), the S7c applied paragraph of section 9 after the "Deferred to S7c" line of S7b (with the new "Deferred to S7d" line), and the paths of the QAD and deferred feature rows that name moved files (the QAD rows follow the test file that now holds their case). `@DATE@` is replaced by the day Task 8 runs and `@SHELL@` by the line count of the dashboard component:

Create `.tmp/s7c/task8-edits.json`:

```json
[
 ["docs/cr-pathways-codebase-modularization.md", "### 3.4 Shared package layout (`packages/shared/src/`)\n", "`features/analytics` follows the layout with `components/`, `hooks/`, `analytics.copy.ts`, `analytics.reads.ts`, `analytics.utils.ts`, the `.utils` suffix on its four pure helper files (`aggregate-chart-options`, `analytics-location`, `analytics-reporting-periods`, `kpi-rows`) and an `index.ts`; `use-monitoring-read.ts` sits in `src/hooks/` because the analytics and projects features both read it and a feature-to-feature import would be a cycle; a test that mocks many modules of one feature keeps its mock registrations in one `test/fixtures` module that each test file imports before the component (amended @DATE@ for S7c).\n\n### 3.4 Shared package layout (`packages/shared/src/`)\n", 1],
 ["docs/cr-pathways-codebase-modularization.md", "S7c (analytics and dashboards web) |", "S7c (analytics web) and S7d (dashboards web and the analytics shell) |", 1],
 ["docs/cr-pathways-codebase-modularization.md", "Deferred to S7c: the web analytics and dashboards work (`lib/api/analytics.ts` and `lib/api/dashboards.ts`, the `features/analytics` and `features/dashboard` layouts and indexes, `analytics-dashboard.tsx`, `role-dashboard.tsx`, `DashboardSeverity`).", "Deferred to S7c: the web analytics and dashboards work (`lib/api/analytics.ts` and `lib/api/dashboards.ts`, the `features/analytics` and `features/dashboard` layouts and indexes, `analytics-dashboard.tsx`, `role-dashboard.tsx`, `DashboardSeverity`).\n\nS7c applied @DATE@ on the S7c slice branch:\n- Clients: `lib/api/dashboards.ts` holds `dashboardsClient` (action counts, role overview, monitoring, SADDD and the home dashboard) and `lib/api/analytics.ts` holds `analyticsClient` (descriptive, survey, timeline) with `descriptiveAnalyticsSearch` and `getAnalyticsExportPreview`; the insights client moved to `lib/api/analytics-insights.ts`. The 84 characterization runs passed against the old and the new members before the 12 production calls in 6 files and 5 mock factories followed, the old members went, and `same lines` printed `lost 0` over their 133 lines.\n- Layout: 23 files of `features/analytics` moved into `components/`, `hooks/` and the `.utils` names, `use-monitoring-read.ts` moved to `src/hooks/`, `index.ts` exports ten names, the `/analytics` page and `pinned-charts.tsx` import it, and `indexedFeatures` and `optimizePackageImports` list `analytics` (a case of the direction test compares the list with the features that own an `index.ts`); the move changed no route (`routes 72, different 0`).\n- Tests: `analytics-dashboard.test.tsx` (1691 lines, 67 cases) became a 332 line fixture module and six files of 106 to 416 lines with every title and every line kept (`lost 0`, 60 `it` blocks and 258 assertions before and after).\n- Component: `analytics-dashboard.tsx` (1745 lines) gave its constants to `analytics.copy.ts`, five helpers to `analytics.utils.ts`, the open alert count to `analytics.reads.ts`, five private components to four files, five reads and the export to five hooks, and four markup sections to components; the shell is @SHELL@ lines. Each step is a verbatim cut (`lost 0`), the retry buttons, the guards the markup hides and the values of the summary cards were pinned first, the moved panels, copy lists and alert request were pinned after their cut (a survey of 161 mutants had left 109 alive), and 137 mutations of the new clients, helpers, panels, copy lists, registration, hooks, wiring and section props each fail a test (the four reset calls of `handleProjectChange` are the recorded equivalents).\n- Decisions: the dashboard feature is S7d (ruling 1); the component tests are split before the component (ruling 7); the hooks run at the places where the effects stood (ruling 9); the filter bar and the analysis panel stay in the shell until their scope state is grouped (ruling 10).\n\nDeferred to S7d: `features/dashboard` (layout, index, `role-dashboard.tsx`, `DashboardSeverity`) and the rest of the analytics shell (the filter bar, the analysis panel and the scope state).", 1],
 ["docs/qad-pathways.md", "UC-F9-1 | `apps/web/src/features/analytics/analytics-dashboard.test.tsx` |", "UC-F9-1 | `apps/web/src/features/analytics/components/analytics-dashboard.survey.test.tsx` |", 1],
 ["docs/qad-pathways.md", "f9-survey-period-release-runtime.sql`; `apps/web/src/features/analytics/analytics-dashboard.test.tsx`", "f9-survey-period-release-runtime.sql`; `apps/web/src/features/analytics/components/analytics-dashboard.survey-access.test.tsx`", 1],
 ["docs/qad-pathways.md", "apps/web/src/features/analytics/analytics-insights-components.test.tsx", "apps/web/src/features/analytics/components/analytics-insights-components.test.tsx", 1],
 ["docs/qad-pathways.md", "apps/web/src/features/analytics/analytics-reporting-periods.test.ts", "apps/web/src/features/analytics/analytics-reporting-periods.utils.test.ts", 1],
 ["docs/deferred-features.md", "apps/web/src/features/analytics/analytics-dashboard.tsx", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", 5],
 ["docs/deferred-features.md", "apps/web/src/features/analytics/participation-breakdown-panel.tsx", "apps/web/src/features/analytics/components/participation-breakdown-panel.tsx", 1],
 ["docs/deferred-features.md", "apps/web/src/features/analytics/budget-summary-card.tsx", "apps/web/src/features/analytics/components/budget-summary-card.tsx", 1],
 ["docs/deferred-features.md", "apps/web/src/features/analytics/indicator-trend-chart.tsx", "apps/web/src/features/analytics/components/indicator-trend-chart.tsx", 1],
 ["docs/deferred-features.md", "apps/web/src/features/analytics/project-coverage-map-panel.tsx", "apps/web/src/features/analytics/components/project-coverage-map-panel.tsx", 1]
]
```


```bash
D=$(date +%F)
F=apps/web/src/features/analytics
sed -i "s/@DATE@/$D/g; s/@SHELL@/$(wc -l < $F/components/analytics-dashboard.tsx)/g" .tmp/s7c/task8-edits.json
node .tmp/s7c/replace-exact.mjs .tmp/s7c/task8-edits.json
sed -i -e '/^| MOD-05 /s/\. |$/; the dashboards and analytics clients by S7c. |/' \
  -e '/^| MOD-06 /s/\. |$/; the analytics dashboard split into panels, hooks and sections by S7c (the shell stays above 500 lines for S7d). |/' \
  -e '/^| MOD-15 /s/\. |$/; the analytics index by S7c. |/' \
  -e '/^| MOD-17 /s/\. |$/; analytics laid out by S7c. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
sed -i '/^| \[cr-pathways-codebase-modularization\]/s/ and S7b applied, S7c next/, S7b and S7c applied, S7d next/' docs/index.md
sed -i '/(superpowers\/plans\/.*modularization-s7c-analytics-dashboards-web/s/| In progress |$/| S7c executed; holds the S7d outline |/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
grep -c "S7c executed; holds the S7d outline" docs/index.md
git grep -nE "features/analytics/[a-z0-9-]*\.(tsx|ts)|analytics-insights-client|pathways-client\.monitoring" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' | cut -c1-150
```


Expected:

```text
12 replacements in 3 files
 docs/audit-pathways-codebase-modularity-20261009.md |  8 ++++----
 docs/cr-pathways-codebase-modularization.md         | 13 ++++++++++++-
 docs/deferred-features.md                           | 16 ++++++++--------
 docs/index.md                                       |  4 ++--
 docs/qad-pathways.md                                |  8 ++++----
<n> files changed, 30 insertions(+), 19 deletions(-)
shared` by S6c; the dashboards and analytics clients by S7c. |
d sections by S7c (the shell stays above 500 lines for S7d). |
 by S7a (features/rules, index); the analytics index by S7c. |
nd analytics api laid out by S7b; analytics laid out by S7c. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b and S7c applied, S7d next |
1
docs/deferred-features.md:20:| Prototype info notices | Removed | 2026-09-29 | Production mode: the blue explanatory callouts left over from the proto
```


`replace-exact` applies 12 replacements in 3 files (the layout paragraph, the roadmap row and the S7c paragraph of the change record; four paths of the QAD; five file names in the eight deferred feature rows that mention them) and writes nothing unless every count matches. The stat lists five files, the two others being the audit rows and the index. The four audit lines are the new clauses of MOD-05, MOD-06, MOD-15 and MOD-17, the index row now lists S7c among the applied slices and leaves S7d next, and the plan row count is 1. The last `git grep` leaves one line: row 20 of the deferred features is a history row whose other paths name files that earlier slices moved, and it is not changed here.

- [ ] **Step 2: Activity log**

`.tmp/s7c/activity-s7c.md` is the S7c section of the activity log, with the commit hashes of Tasks 1 to 7 as `@H1@` to `@H7@` (`@H6A@` and `@H7A@` are the test commits before the splits of Tasks 6 and 7):

Create `.tmp/s7c/activity-s7c.md`:

```md

## @DATE@ Modularization S7c analytics web (S7c slice branch)
- Task 1 (@H1@): `dashboardsClient` and `analyticsClient` added to `lib/api` with `dashboards.test.ts` (42 runs), `analytics.test.ts` (30) and `analytics-insights-client.test.ts` (12), which ran the same cases against the old members and the new clients; 12 mutations of the new clients each fail a case, and the proof lists 2 added lines (the second object literal); web gained 3 files and 84 tests.
- Task 2 (@H2@): 12 production calls in 6 files and 5 mock factories switched to the new clients, the insights client moved to `lib/api/analytics-insights.ts`, the eight old members, the monitoring query helper, the two analytics exports and `pathways-client.monitoring.test.ts` were deleted, and the old rows of the characterization tables were dropped; all 134 test titles of the seven touched test files are among the 167 after (`lost 0`).
- Task 3 (@H3@): 23 files of `features/analytics` moved into `components/`, `hooks/` and `.utils` names (the import specifiers and 7 contract test paths rewritten), `use-monitoring-read.ts` moved to `src/hooks/`, `index.ts` added, the `/analytics` page, `pinned-charts.tsx` and the e2e spec updated, and `indexedFeatures` and `optimizePackageImports` list `analytics`; the move changed no route (`routes 72, different 0`) and Middleware stayed at @M0@ kB; a case of the direction test compares `indexedFeatures` with the features that own an `index.ts`, and deleting `analytics` from the list or from the Next config fails a test.
- Task 4 (@H4@): `analytics-dashboard.test.tsx` (1691 lines) became a fixture module and six test files by line ranges (`same lines: 1549, lost 0`), all 67 titles and 258 assertions kept.
- Task 5 (@H5@): the constants, five helpers, the alert count and five private components left `analytics-dashboard.tsx` for `analytics.copy.ts`, `analytics.utils.ts`, `analytics.reads.ts` and four component files (`same lines: 1611, lost 0`); `analytics.utils.test.ts` pins the five helpers and nine mutations each fail a case; `analytics-panels.test.tsx` (25 tests), `analytics.copy.test.ts` (3) and one assertion of the cards test pin the six moved files (a survey of 161 mutants had left 109 alive) and 35 mutations each fail a test.
- Task 6 (@H6A@, @H6@): two Retry cases pinned the SADDD and descriptive panels, then the SADDD, descriptive, survey and timeline reads and the export became five hooks called at the places where the effects stood (`same lines: 1190, lost 0`); five hook test files pin the requests, guards, messages, retries and resets, and 38 mutations of the hooks and 5 of the wiring each fail a case (the four reset calls of `handleProjectChange` are the known survivors: the effects clear the same states in the same commit).
- Task 7 (@H7A@, @H7@): nine cases pinned the summary card values and the empty descriptive statistics panel, then the SADDD panel, the descriptive statistics panel, the open alerts panel and the summary cards left the markup for four components; the shell is @SHELL@ lines, and the 31 prop mutations each fail a test.
- Task 8: the change record, audit, QAD and deferred feature rows follow the new paths and the S7c disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and `apps/web/src/**` already route to the beneficiary privacy guardian and the design QA agent.
- Decisions: the S7c decisions are in the change record section 9; the S7b plan copy and this plan stay until the series is merged, then they are retired in a separate change.
- Deferred to S7d: `features/dashboard` and the rest of the analytics shell (the filter bar, the analysis panel and the scope state); the `lib/services/*` files that no slice owns stay for W1.
```


```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^feat(web): add the dashboards and analytics clients')
H2=$(git log -1 --format=%h --grep='^refactor(web): move the dashboard and analytics callers')
H3=$(git log -1 --format=%h --grep='^refactor(web): give analytics a feature layout')
H4=$(git log -1 --format=%h --grep='^test(web): split the analytics dashboard test')
H5=$(git log -1 --format=%h --grep='^refactor(web): move the analytics dashboard panels')
H6A=$(git log -1 --format=%h --grep='^test(web): pin the SADDD and descriptive')
H6=$(git log -1 --format=%h --grep='^refactor(web): move the analytics dashboard reads')
H7A=$(git log -1 --format=%h --grep='^test(web): pin the summary cards')
H7=$(git log -1 --format=%h --grep='^refactor(web): move the SADDD, descriptive statistics')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4@/$H4/" -e "s/@H5@/$H5/" -e "s/@H6A@/$H6A/" -e "s/@H6@/$H6/" -e "s/@H7A@/$H7A/" -e "s/@H7@/$H7/" -e "s/@M0@/$(cat .tmp/s7c/m0)/" -e "s/@SHELL@/$(wc -l < apps/web/src/features/analytics/components/analytics-dashboard.tsx)/" .tmp/s7c/activity-s7c.md
grep -c "@[A-Z0-9]*@" .tmp/s7c/activity-s7c.md
cat .tmp/s7c/activity-s7c.md >> docs/activity-log.md
tail -11 docs/activity-log.md | cut -c1-90
```


Expected:

```text
0
## YYYY-MM-DD Modularization S7c analytics web (S7c slice branch)
- Task 1 (<sha>): `dashboardsClient` and `analyticsClient` added to `lib/api` with `dash
- Task 2 (<sha>): 12 production calls in 6 files and 5 mock factories switched to the ne
- Task 3 (<sha>): 23 files of `features/analytics` moved into `components/`, `hooks/` an
- Task 4 (<sha>): `analytics-dashboard.test.tsx` (1691 lines) became a fixture module an
- Task 5 (<sha>): the constants, five helpers, the alert count and five private componen
- Task 6 (<sha>, <sha>): two Retry cases pinned the SADDD and descriptive panels, then
- Task 7 (<sha>, <sha>): nine cases pinned the summary card values and the empty descr
- Task 8: the change record, audit, QAD and deferred feature rows follow the new paths and
- Decisions: the S7c decisions are in the change record section 9; the S7b plan copy and t
- Deferred to S7d: `features/dashboard` and the rest of the analytics shell (the filter ba
```


The placeholder count is 0 (every `@...@` of the section is replaced), and the tail prints the section: one line per task with its commit hashes, the decisions line and the S7d deferral.

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S7c

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1540 files in <ms>. No fixes applied.
<sha> docs: record modularization S7c
<sha> refactor(web): move the SADDD, descriptive statistics, alerts and summary sections out of the analytics dashboard
```


`docs:check` keeps the 6 baseline failures and 1 warning.

---

### Task 9: Full release gates

This slice opens no pull request: it is stacked below the end of the series, and the one pull request into `dev` that follows the last slice carries the DB replay and the other CI gates (its replay is the replay gate of this slice). The gates below run on the slice branch and are recorded in the activity log.

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s7c/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s7c/build-routes.sh gates
for t in baseline prelayout layout; do node .tmp/s7c/compare-routes.mjs .tmp/s7c/routes-$t.txt .tmp/s7c/routes-gates.txt | grep -E "\(\+|^routes"; done
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```


Expected:

```text
$ pnpm exec biome check .
Checked 1540 files in <ms>. No fixes applied.
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  46 passed (46)
packages/shared test:       Tests  731 passed (731)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  158 passed | 10 skipped (168)
apps/api test:       Tests  2628 passed | 21 skipped (2649)
apps/web test:  Test Files  265 passed (265)
apps/web test:       Tests  2422 passed (2422)
      Tests  58 passed (58)
exit 0
ƒ Middleware                                                      103 kB
/analytics: 656 kB -> 657 kB (+1.0)
/collection/import: 435 kB -> 436 kB (+1.0)
/indicators/library: 280 kB -> 281 kB (+1.0)
routes 72, different 10
/analytics: 656 kB -> 657 kB (+1.0)
routes 72, different 1
/analytics: 656 kB -> 657 kB (+1.0)
routes 72, different 1

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```


Biome is clean over 1540 files and the typecheck is clean. The test lines equal the Task 0 baselines except web, which is `B_web` plus the 16 files and 132 tests of Tasks 1 to 7: 265 files and 2422 tests (config 19, shared 731, imports 94, api 2628 passed and 21 skipped, sad 58). The build exits 0 with Middleware at `M0`. The first compare prints the routes that grew against the Task 0 table (`/analytics`, `/collection/import` and `/indicators/library`, 1 kB each, inside the bound) and says that 10 of 72 routes differ in all (the 7 others are smaller); the next two compares say that only `/analytics` differs from the pre-layout build and from the layout build, by 1 kB at the printed precision, so the component and test commits of Tasks 4 to 7 left every other bundle as it was. `docs:check` keeps the 6 baseline failures and 1 warning.

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```


Expected:

```text
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


The dry run printed `0` for the user id (root), `pwsh` present, PostgreSQL 18 present (`clusterdb` is the first file of the folder), `supabase` missing and the Docker command present. The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root: the first line is `HISTORICAL_MIGRATION_INTEGRITY=PASS`, then `initdb: error: cannot be run as root` and `PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.` S7c changes no migration, so when the replay cannot run here the CI replay of the final pull request of the series is the gate; record which one ran.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, the `pnpm dev:local` boot and the route curls, both Playwright configs and the browser smoke) as pending local run in the activity log gate line and list it for the developer; do not skip Steps 1, 2 or 4. The e2e spec that imports the monitoring hook by relative path (`apps/web/e2e/monitoring-read.spec.ts`) is part of that run. Stop anything on ports 3000 and 4000 first, then:

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev: open `/analytics` and switch every analysis view (KPI, participation, survey, timeline) and every visualization (bar, line, table; the map only when `MAPS_UI_ENABLED` is on), change the project and the reporting period and see the panels reload without a stale frame; export the aggregates in each of CSV, XLS, XLSX and PDF from the preview dialog (cancel one, download one) as a role with `analytics.export`; see the SADDD panel, its Retry after a forced failure, the descriptive statistics panel and the open alerts panel as roles that may read them; sign in as a Program Manager and see the survey views limited to closed periods; open `/dashboard` for each role and see the home cards and the pinned charts; open a project's indicators page and see the monitoring read still work (`use-monitoring-read` moved to `src/hooks/`).

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s7c
pnpm sad:check --base "$(cat .tmp/s7c/base-sha)" --head HEAD --output .tmp/sad/s7c/manifest.json > .tmp/sad/s7c/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s7c/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```


Expected:

```text
exit 0
beneficiary-privacy-guardian 10
design-qa-agent 102
```


`.tmp/sad/s7c/check.out` holds the `tsx scripts/sad/check.ts` line and `{ "subagent_evaluations": [] }`. The counts are the dry run (the dry run base is the Task 0 head, so the paths of the slices below are not counted); they move by a few paths if the branch holds other slices. The slice changes only web files: the new and changed clients and their tests under `lib/api` and `lib/services` route to `beneficiary-privacy-guardian` (10), and every web source file the slice touched, with the e2e spec and the config, to `design-qa-agent` (102).

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s7c/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s7c/assemble.mjs`, run `node .tmp/sad/s7c/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s7c/base-sha)" --head HEAD --reviews .tmp/sad/s7c/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The dry run could not dispatch the roles (no subagents in the planning copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The dry-run bullet, to adapt with your own numbers (the web figures must equal the Task 0 baseline plus the delta of Tasks 1 to 7, the others the Task 0 baselines):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 731, imports 94, api 2628 passed and 21 skipped, web 265 files and 2422 tests, sad 58; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware at M0 (103 kB in this container), 10 of 72 routes differ from the Task 0 build (7 smaller, `/analytics`, `/collection/import` and `/indicators/library` 1 kB bigger, none beyond the 1 kB bound) and only `/analytics` (1 kB) differs from the layout build; local DB replay could not run as root (initdb refuses), so the CI replay of the final pull request of the series is the gate; seeds, dev servers, the compiled API probes, e2e and the browser smoke pending local run; SAD manifest design-qa-agent 102 paths and beneficiary-privacy-guardian 10, role dispatch pending the cloud run; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S7c release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -3
```


Expected:

```text
<sha> docs: record modularization S7c release gate results
<sha> docs: record modularization S7c
<sha> refactor(web): move the SADDD, descriptive statistics, alerts and summary sections out of the analytics dashboard
```


- [ ] **Step 6: What happens after the merge (not part of this slice)**

S7c is followed by S7d (outline below) and then S8 as the roadmap lists them. This plan is not edited, committed to or removed inside the slice. After the developer has merged the series into `dev`, the executed plan copies are retired in a separate documentation change: remove `docs/superpowers/plans/*-modularization-s7-analytics-rules.md`, `*-modularization-s7b-analytics-dashboards.md` and `*-modularization-s7c-analytics-dashboards-web.md` and only their index rows (the `docs/handoff` copies and their rows stay), then run `pnpm docs:check` and expect the 6 baseline failures. The S7d plan is written from the S7c tip (it reads the outline below).

---


## S7d outline (dashboard feature and the analytics shell remainder, its own slice branch)

To be written as its own plan from the S7c tip; that plan's Task 0 saves a route table of a clean build before any web edit and its records task names S7d in CR 3.7 (S7c already does). It holds about seven tasks; the branch is assigned by the environment and SAD evidence goes to `.tmp/sad/s7d/`. The S7b outline's Tasks 4 and 5 and the part of its Task 3 that S7c left are the source; the changes S7c made to them are:

- **Interfaces from S7c:** `lib/api/dashboards.ts` and `lib/api/analytics.ts` (the callers of `features/dashboard` already use them); `features/analytics/index.ts` and the `analytics` entries of `indexedFeatures` and `optimizePackageImports` (S7d adds `dashboard` next to them); the hooks `useSadddDashboard`, `useDescriptiveAnalytics`, `useSurveyAnalytics`, `useTimelineAnalytics`, `useAnalyticsExport` and the components `SadddAnalysisPanel`, `DescriptiveStatisticsPanel`, `OpenAlertsPanel` and `AnalyticsSummaryCards`; `analytics-dashboard-fixtures.tsx` with its seven tests (the six of the split and `analytics-dashboard.summary.test.tsx`) as the characterization suite of the shell (they pass at every S7c commit, so S7d starts from a pinned shell).
- **Task 1, scope state of the analytics shell:** the shell still holds the project, period, view and access state (about 25 names read by the filter bar and by the analysis panel). Group them in `hooks/use-analytics-scope.ts` and `analytics.reads.ts` access flags (`canReadDescriptive`, `canReadSurveyTimeline`, `canExportAnalytics`, `surveyUnavailable`), called at the original positions, with a pinning test per flag and a mutation run as in S7c Task 6; the monitoring effect moves with the project data effect that also writes `monitoring`.
- **Task 2, filter bar and analysis panel:** `AnalyticsFilterBar` and `AnalyticsAnalysisPanel` by line range once the scope hook returns the names the markup uses; `analytics-dashboard.tsx` drops under the 500 line flag, `same-lines.mjs` says `lost 0` over the S7c shell and `mutate-sections.mjs` is extended to the new props.
- **Task 3, `features/dashboard` layout:** `components/`, `hooks/`, `dashboard.reads.ts`, `dashboard.utils.ts`, `dashboard.copy.ts` and `index.ts` with `move-modules.mjs` and `index-imports.mjs` (the S7c versions); the `role-overview/` subfolder (18 files) keeps its name; `indexedFeatures` and `optimizePackageImports` gain `dashboard`; the `/dashboard` page and `pinned-charts.tsx` import through the indexes, with route First Load JS compared to the Task 0 build as in S7c Task 3.
- **Task 4, `role-dashboard.tsx` (693 lines, MOD-06):** characterization tests first (the authorization test pins only the permission table), then the monitoring and action count reads move into hooks and the role sections into components, the same way as S7c Tasks 6 and 7; its import of the projects feature already goes through the index (`ActivityDetailPanel` and `ActivityProofDialog` from `@/features/projects`; the S6 slices did it), so no import change is left there.
- **Task 5, MOD-16 and duplicates:** analytics and dashboard read keys used twice (share the three `projects.read` list keys only where fetcher, permission and freshness match); `DashboardSeverity` in `types/pathways.ts` (F4b deferral); `statusTone` in `executive-dashboard.tsx` kept per vocabulary (F4b ruling 3).
- **Task 6, records** and **Task 7, gates** as S7c Tasks 8 and 9, with the smoke of `/dashboard` for each role, `/analytics` (every view and every export format), the pinned charts, the SADDD panel and the project map. The S7d plan updates the CR 3.7 row's "next" status; the S8 plans need no change (S8b recounts the web figures in its own Task 0).
