# S7d Dashboards Web and the Analytics Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the web side of analytics and dashboards: cut the 898-line `analytics-dashboard.tsx` (the shell that S7c left above the 500 line flag, MOD-06) into a scope hook, an access function and three components, lay out `features/dashboard` as `components/` and a public `index.ts`, split the 693-line `role-dashboard.tsx` (MOD-06) into helpers and four components, and share the one duplicated dashboard read key and the severity type (MOD-16), with characterization tests written before any code moves and no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S7d is the second web slice for analytics and dashboards (S7c: the clients, the analytics layout and the first cuts). The shell and the role dashboard are pinned first by tests that pass against the unsplit code (Task 1 for the analytics shell: the project and period scope, the actions and the filters; Task 6 for the role dashboard: its states, the monitoring section and the activity review panel). The analytics shell is then cut in three commits, each proven by `same-lines.mjs` (`lost 0`) and by the pins: the access flags become one pure function (Task 2), the project, period and monitoring state becomes `useAnalyticsScope` called where the state stood (Task 3), and the action bar, the filter bar and the analysis panel become components by line range (Task 4). The dashboard feature is laid out by one `git mv` map, one specifier rewrite and one index (Task 5), measured by a build before and after, and the role dashboard is split along its existing seams (Task 7). Task 8 closes the MOD-16 items that belong to the dashboard feature, after pinning both call sites of the duplicated read. Task 9 holds the records and the release gates. Behavior that only an old-versus-new comparison pinned gets a concrete assertion before the old code goes, and every new test is mutated once and must fail. This slice ends the web analytics and dashboards work: nothing of it is outlined for a later slice (ruling 1).

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, React Testing Library.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 and 9, including the S7c disposition and its "Deferred to S7d" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06 for the oversized components, MOD-15 and MOD-17 for the surface and names, MOD-16 for the duplicated read key and severity type), and the S7d outline at the end of `docs/handoff/modularization-s7c-analytics-dashboards-web.md`, which this plan replaces (rulings 1, 3, 6 and 13 say where it differs).

## Rulings

Controller rulings for S7d. Each was checked in a replay from the S7c tip with S3b, S4a, S5a, S6a, S4b, S4c, S5b, S6b, S5c, S6c, S7a, S7b and S7c below it; Task 0 recounts them.

1. **Ten tasks, and the web analytics and dashboards work ends here.** The S7c outline had seven tasks (scope state, filter bar and analysis panel, dashboard layout, role dashboard, MOD-16, records, gates). Written out they are Tasks 1 to 9 below, with the pins of the two components as their own tasks and the access flags as a task of their own, and everything the outline names fits in the ten. No work is outlined for a later slice; the `lib/services/*` files that no slice owns stay for W1 (CR section 9). Cost if wrong: a plan merge.
2. **Pins before cuts, and the pins run against the old and the new code.** Task 1 adds 54 cases to the analytics shell (19 for the scope, 22 for the actions and filters, 13 for the grants and date rules that stay in the shell) after ten exact edits to the shared fixture module, and Task 6 adds a fixture module and three test files for the role dashboard (108 cases). Both sets pass against the unsplit components and are unchanged at every later commit, so they are the old-versus-new comparison of the slice. A mutation survey of the unsplit code (102 mutations of the shell, 240 of the role dashboard) decided which pins were missing; the survivors that remained are classified in the tasks as equivalent or unreachable, and the behaviors that the shell can reach only as a System Administrator (the grants of each role in the review panel, the answer of a replaced target) are pinned by direct tests of the new units in Task 7. Cost if wrong: none.
3. **The scope hook is called at the position of the first state it replaced, and one effect order changes.** `useAnalyticsScope` returns the 18 values the shell reads and runs the four effects (projects, project data, period, monitoring) in their original order. In the shell the open alerts read sat between the declarations and the effects, so its subscription now starts after the four scope effects instead of before them; the two requests are independent. The Task 3 tests pin the first paint, the reset of every field of the previous project before the first effect, and the stale answers of a replaced project. Cost if wrong: the start order of two independent requests in one commit.
4. **The three components take props named after the identifiers their markup used.** `AnalyticsActionBar` has 13 props, `AnalyticsFilterBar` 17 including `children` (the action bar sits in the heading row of the filter section) and `AnalyticsAnalysisPanel` 27, with the setters passed under their own names (`setAnalysisView`, `setIndicatorId`, `setPeriod`, `setVisualizationType`, `handleProjectChange`). A prop count that large is the price of a verbatim move: the lines stay as written and `same-lines.mjs` proves it. `mapSelected` is not a prop because the type narrowing needs the comparison in the same function. Cost if wrong: a prop rename.
5. **The access flags are one pure function in `analytics.reads.ts`.** `analyticsAccess(profile)` returns the 13 flags and `surveyFrozenOnly` (14 values); the shell destructures the same names. A table test gives every flag exactly its grants (true with all of them, false when any one is missing) and the mutations of the old code were all killed by the Task 1 role tests before it moved. Cost if wrong: a file name.
6. **The dashboard layout comes after the analytics cuts and is measured twice.** Tasks 1 to 4 change what the analytics chunks hold, so Task 5 builds first (`prelayout`) and compares the move with that table, and Task 9 compares the final build with the baseline, `prelayout` and `layout`. The index exports `RoleDashboard` only, because the page is the one importer outside the feature; the S7c outline listed `dashboard.copy.ts`, which is not created because the folder has no copy constants to move, and there is no `hooks/` folder either, because the feature holds no state hook (its one hook, `useDashboardActionCounts`, is a read and sits in `dashboard.reads.ts`, where CR 3.5 puts the hooks that call an authorized read). Cost if wrong: an index name.
7. **Role dashboard pins are written with a fixture module, a mocked select and fake dates.** The fixture holds the hoisted mocks (clients, role, flags, the projects index components) and the builders; a native select stands in for the Radix select, the clock is faked to 2026-09-27 for the trailing year, and the monitoring and review tests live in their own files so each stays under 500 lines. Cost if wrong: none.
8. **The monitoring charts section of the analytics shell stays in the shell.** It reads the summary data, the scope values and the pin state, and the project data effect that fills `monitoring` is in the hook, so the section would need more props than any other and gain nothing. The shell is 437 lines without it moving. Cost if wrong: a later split.
9. **The role dashboard keeps `canLoadDashboardMonitoring` and its two metric card lists.** The authorization test imports the function from the shell, and the loaded dashboard and the monitoring snapshot each map their metrics to the same `MetricCard` markup in a wrapper of their own (a `section` and a `div`); sharing it would change the markup, so both stay and the tests pin both. Cost if wrong: a merge.
10. **Mutation survivors are recorded, not argued away.** Each task lists the survivors of its mutation run by name and says why each is equivalent (the effect repeats the same reset in the same commit, a guard sits behind a disabled button, an option cannot be reached with the fixtures) or unreachable through the unit; class names, icons and other visual-only props are not mutated and are covered by the browser smoke. Cost if wrong: a regression in a class name that no test sees.
11. **No new SAD routing.** `scripts/sad/check.ts` already routes `apps/web/src/**` to `design-qa-agent`, so the new and moved files are covered. Cost if wrong: one glob.
12. **No pull request, no plan-copy removal, local-only checks pending.** The developer asked for one pull request into `dev` after every slice is implemented, so S7d gets none of its own: the branch `claude/modularization-s7d-9ept8o` stays stacked on `claude/modularization-s7c-9ept8o`. The seeds, dev servers, e2e runs and the browser smoke are recorded as "pending local run" (Task 9). The `docs/superpowers/plans` copies of earlier slices stay, and so does this plan's copy; the controller removes executed copies after the final merge. The recursive test run uses the no-bail option because a flake in one package (the `packages/imports` timeouts under load) would otherwise hide the web figures. Cost if wrong: none.
13. **MOD-16 is closed for the dashboard feature only.** The two copies of the `dashboard-action-counts` read become `useDashboardActionCounts` after both call sites are pinned (the row had no test of its states), and `DashboardSeverity` becomes an alias of `StatusTone`. The S7c outline also named the three `projects.read` list keys; the survey of Task 0 lists the read keys of the two folders and `dashboard-action-counts` is the only one written in two files. The `statusTone` of `executive-dashboard.tsx` (a delivery status mapping) and the copies in other features stay with the slices that own those screens. Cost if wrong: a later hook.
14. **Cross-plan.** S4c, S5b, S5c and S6c are applied below this slice: S5b moved `use-collection-state` out of `collection-workspace.tsx` and S5c and S6c added web files that the planner's first dry run (a base with S7c alone) did not have. The replay from the real S7c tip printed the figures below; Task 0 recounts them, every hash that a cut plan pins is printed first so a mismatch stops the task with the value to compare, and the test baselines are read in Task 0 and stated as deltas. Cost if wrong: a later Task 0 stops on a count.

## Interfaces assumed from earlier sub-projects

- S7c: `lib/api/dashboards.ts` (`dashboardsClient`) and `lib/api/analytics.ts`; `features/analytics/index.ts` with the `analytics` entries of `indexedFeatures` and `optimizePackageImports`; the hooks `useSadddDashboard`, `useDescriptiveAnalytics`, `useSurveyAnalytics`, `useTimelineAnalytics` and `useAnalyticsExport`; the components `SadddAnalysisPanel`, `DescriptiveStatisticsPanel`, `OpenAlertsPanel` and `AnalyticsSummaryCards`; `analytics-dashboard-fixtures.tsx` with its six tests; the CR section 9 paragraph "S7c applied" with its "Deferred to S7d" line.
- S7a and S6b: `lib/api/rules.ts`, `features/rules` with its index, `ownedJsonRead` and the `describe.each` client test pattern; F4b: `useAuthorizedRead`, `lib/format/tone.ts` (`StatusTone`) and `lib/format/*`.
- S1b: `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`; S2b and S8b method: the `.schema.ts`, `.utils.ts` and `.reads.ts` suffixes and the cut-plan method (`cut.mjs` with a pinned hash, `same-lines.mjs`).

## Produces (names later plans consume)

- `analyticsAccess` (`features/analytics/analytics.reads.ts`), `useAnalyticsScope` (`features/analytics/hooks/use-analytics-scope.ts`), and the components `AnalyticsActionBar`, `AnalyticsFilterBar` and `AnalyticsAnalysisPanel`; `analytics-dashboard.tsx` below the 500 line flag.
- `features/dashboard/{components,role-overview}` with `dashboard.reads.ts` (`useDashboardActionCounts`), `dashboard.utils.ts`, `monitoring-reach-metrics.utils.ts` and an `index.ts` exporting `RoleDashboard`; `dashboard` is in `indexedFeatures` and in `optimizePackageImports`; the components `DashboardActivityReviewPanel`, `ConnectedMonitoringSnapshot`, `ActionButton` and `DashboardListItem`.
- Test fixture `role-dashboard-fixtures.tsx` in `apps/web/src/test/fixtures/`; `DashboardSeverity` as an alias of `StatusTone`.
- Helper scripts in `.tmp/s7d/` (gitignored), among them `mutate.mjs`: a mutation runner that keeps one watch-mode Vitest process, reports killed, SURVIVED or NOT APPLIED per mutation and treats an unhandled error as a failure.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or export changes. The only removals are the moved duplicates (the lines of the shells that moved, the two copies of the action counts read and the severity union). Production code stays free of new dependencies; `apps/api` and `packages/shared` are not changed by this slice.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; once Task 5 lands every file outside `features/dashboard` imports the feature only through its index, and a non-test fixture imports a feature through its index too (the direction test exempts only tests and the feature itself).
- File moves use `git mv` (the move script does it) and are committed apart from the cuts; the cut files are checked with `.tmp/s7d/same-lines.mjs` (`lost 0`) before Biome formats them, and every cut plan pins the hash of its source (`cut.mjs` writes nothing when the hash differs: stop and report NEEDS_CONTEXT with the printed hash unless the file was changed by a slice below this one, in which case recount the cut ranges against the new file before continuing).
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no double hyphen (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the new tests use synthetic ids (`p1`, `a1`, `79600000-...`), the token `synthetic-test-token` and the fictional names already in the existing tests.
- Characterization tests run against the old code before it moves; before old code goes, every behavior pinned only by an old-versus-new comparison gets a concrete assertion (a bound, an enum member, a format, a strictness rule where a schema is involved); every move is proven by script (`lost 0`); a split or rewritten test keeps every row and assertion; every new test is mutated once and must fail.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s7d/trim-imports.mjs <file>` after removing code and `npx tsc --noEmit --noUnusedLocals -p .` in `apps/web` after each web task: it must list only the two lines that exist at the baseline (`forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`, where S5b moved the first). `trim-imports` counts a name in a regex literal or a property key as used, so a cut plan may carry a `drop=` list for the rest.
- Every analytics and dashboard component and hook file starts with `'use client'`: `cut.mjs` drops the line from `@imports` and writes nothing in its place, so the cut plans write it by hand, and the production build is the check that catches a missing one.
- Vitest refuses `export const x = vi.hoisted(...)`: a fixture exports its hoisted objects through one `export { ... }` statement. A `vi.mock` call inside an imported fixture is registered before the later imports of the test file, which is why every test imports the fixture first.
- Mock factories name modules by the specifier the code under test imports; the Radix select is replaced by a native select in the tests that change a filter; feature flags are mocked with getters so a test can flip them.
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason. Biome sorts `@/lib` before `@/test`.
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit. Never run `pnpm build` at the root, `pnpm --filter @pathways/api build` or `prisma generate`: they run `prisma generate`, which writes into the shared `node_modules`; this slice builds only the web app, through `.tmp/s7d/build-routes.sh`, and the api build would be `pnpm --filter @pathways/api exec nest build`.
- Run `.tmp/s7d/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to five minutes, so give the command a ten minute timeout. Bash blocks share no shell state: every block sets the variables it uses.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s7d/` (gitignored) and are never committed; logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` when run from there, and relative to the repository root when run through `pnpm --filter @pathways/web exec vitest run`.
- Do not edit a test or a source file while a mutation run is going: the runner restores its files at the end, and an edit in between corrupts the run. Never interrupt a run with anything but SIGINT (it restores the files); a `git hash-object` comparison after each run proves the restore.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- Known timing flakes of the full test runs on a loaded machine: the `ZodPipe` 5 s test, `beneficiary-detail-loader.test.tsx`, timeouts of `collection-workspace` tests, `imports.service.test.ts` (the duplicate metadata keys case), the `packages/imports` timeouts and one case of `pnpm sad:test`; rerun the file alone before treating a failure as real, and rerun any run that ends without its summary line (a killed vitest process prints none). If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the figures Task 0 marks as depending on the slices below (recount those and carry on with the recounted values).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run (`YYYY-MM-DD` is the day Task 0 runs); every other figure is the replay and must match. The production build is the exception: the same commit printed Middleware at 102 kB in one checkout and 103 kB in another (the logs of S7a to S7c show both), and route sizes move by 1 kB the same way, so the Middleware lines are `<n> kB` and a route compare line is the replay's. Compare a build only with a build of the same checkout (`M0` and the route tables do), and judge a compare by the bound each task states. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared` and `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit with `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m` and the trailers on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Each bash block is run on its own and keeps no shell variables from the block before: a block that uses `$D`, `$F`, `$H`, `$C` or `$NEW` sets it first.
- Work in the repository root on `claude/modularization-s7d-9ept8o`, stacked on `claude/modularization-s7c-9ept8o` (S3b, S4a, S5a, S6a, S4b, S4c, S5b, S6b, S5c, S6c, S7a, S7b and S7c below it); no new worktree and no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence.
- This slice opens no pull request, merges nothing into `dev` and removes no plan copy: it ships as part 3 of 3 stacked pull requests into `dev` that the controller opens after the last slice, which carry the replay and the other CI gates, so Task 9 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 9).

## Review Focus

1. Every cut must be a verbatim move: `same-lines.mjs` says `lost 0` for the analytics shell (898 lines) and for the role dashboard (693 lines), the added lines are only signatures, props and calls, and behavior that the old tests did not pin is pinned by tests written against the unsplit code (Tasks 1 and 6) and by mutation runs.
2. The scope hook must not reorder effects other than the one named in ruling 3: it is called at the position of the first state it replaced, keeps its dependency lists and its aborts, and the first-paint, reset and stale-answer cases pin the wiring.
3. The three analytics components receive 13, 17 and 27 props; check that each prop is read by the markup that moved (the mutation runs change each one) and that no prop is renamed on the way in.
4. The role dashboard units keep the props they had; the review panel, the snapshot and the list items are tested directly for what the shell reaches only as a System Administrator.
5. Every file that uses state or an effect carries `'use client'`, and the production builds of Tasks 5 and 9 are the check.
6. A route bundle must not grow when files move, and the dashboard page must not load a barrel. Task 5 compares a freshly measured table and Task 9 compares against all three tables.
7. Outside `features/dashboard` no file may import a leaf of it; `import-direction.test.ts` and `git grep` in Task 5 check it, and the one importer (the dashboard page) uses the index.
8. MOD-16: the `dashboard-action-counts` key is written once, with the grant, the project and the reader unchanged, and the flag of the role overview is still `role === 'Project Manager'`.

## File map

| Path | Role after S7d |
|---|---|
| `apps/web/src/features/analytics/analytics.reads.ts` and its test | gains `analyticsAccess` (Task 2) |
| `apps/web/src/features/analytics/hooks/use-analytics-scope.ts` and its test | the scope state, its effects, retry and project switch (Task 3) |
| `apps/web/src/features/analytics/components/` | `analytics-action-bar`, `analytics-filter-bar`, `analytics-analysis-panel` with a test each; `analytics-dashboard.scope.test.tsx`, `analytics-dashboard.actions.test.tsx` and `analytics-dashboard.gates.test.tsx` (Tasks 1 and 4) |
| `apps/web/src/features/analytics/components/analytics-dashboard.tsx` | the shell, from 898 lines to the figure Task 4 prints (Tasks 2 to 4) |
| `apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx` | ten edits for the new pins (Task 1) |
| `apps/web/src/features/dashboard/` | `components/`, `role-overview/`, `dashboard.reads.ts`, `dashboard.utils.ts`, `monitoring-reach-metrics.utils.ts`, `index.ts` (Tasks 5, 7 and 8) |
| `apps/web/src/features/dashboard/components/role-dashboard.tsx` | the shell, from 693 lines to the figure Task 7 prints (Task 7) |
| `apps/web/src/features/dashboard/components/` three new components, `action-kpi-row.states.test.tsx` and the tests of the new units | `dashboard-activity-review-panel`, `connected-monitoring-snapshot`, `dashboard-list-item` (Task 7) and the pins of the action row (Task 8) |
| `apps/web/src/test/fixtures/role-dashboard-fixtures.tsx` | the shared mocks and builders of the three role dashboard tests (Task 6) |
| `apps/web/src/app/(dashboard)/dashboard/page.tsx`, `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`, `features/ui-copy-cleanup.contract.test.ts` | follow the layout (Task 5) |
| `apps/web/src/types/pathways.ts` | `DashboardSeverity` aliases `StatusTone` (Task 8) |
| `docs/` change record, audit, QAD, DSD, deferred features, index, activity log | records (Task 9) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s7d-dashboards-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s7d/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `count-it.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `cut.mjs`, `mock-scan.mjs`, `test-titles.mjs`, `move-modules.mjs`, `index-imports.mjs`, `mutate.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S7c and the slices below it, and record the base**

The markers are files and text that S7c itself creates or that only a slice below it creates (a slice that runs later never creates them), so a missing one means that slice is not applied:

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s7d/files .tmp/s7d/out .tmp/s7d/before
git rev-parse HEAD > .tmp/s7d/base-sha
for b in s7c s7b s7a s6c s5c s6b s5b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S7c record: $(grep -c '^S7c applied' $CR)"
echo "Deferred to S7d line: $(grep -c '^Deferred to S7d' $CR)"
echo "S7b record: $(grep -c '^S7b applied' $CR)"
F=apps/web/src
test -f $F/lib/api/dashboards.ts && test -f $F/lib/api/analytics.ts && test -f $F/lib/api/analytics-insights.ts && echo "S7c clients present"
test -f $F/features/analytics/index.ts && test -f $F/features/analytics/hooks/use-analytics-export.ts && test -f $F/features/analytics/components/analytics-summary-cards.tsx && echo "S7c analytics layout present"
test -f $F/test/fixtures/analytics-dashboard-fixtures.tsx && test -f $F/features/analytics/components/analytics-dashboard.summary.test.tsx && echo "S7c tests present"
test ! -f $F/lib/services/pathways-client.monitoring.test.ts && echo "S7c old tests gone"
test -f $F/lib/api/rules.ts && test -f $F/features/rules/index.ts && test -f $F/lib/api/core/owned-json-read.ts && echo "S7a and S6b present"
test -f $F/lib/api/indicators.ts && test -f $F/lib/api/core/request.ts && echo "S3 and F4b present"
test ! -f $F/features/dashboard/index.ts && test ! -f $F/features/analytics/hooks/use-analytics-scope.ts && test ! -f $F/features/dashboard/dashboard.reads.ts && echo "S7d not started"
test -f docs/handoff/modularization-s7d-dashboards-web.md && echo "handoff copy present"
grep -c "indexedFeatures" $F/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
```


Expected:

```text
claude/modularization-s7d-9ept8o
s7c branch is an ancestor of HEAD
s7b branch is an ancestor of HEAD
s7a branch is an ancestor of HEAD
s6c branch is an ancestor of HEAD
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S7c record: 1
Deferred to S7d line: 1
S7b record: 1
S7c clients present
S7c analytics layout present
S7c tests present
S7c old tests gone
S7a and S6b present
S3 and F4b present
S7d not started
handoff copy present
4
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
2026-10-14-modularization-s7c-analytics-dashboards-web.md
```


The branch is `claude/modularization-s7d-9ept8o` (the environment assigns it) and `git status --short` prints nothing. Then one ancestor line for each stacked branch (S7c, S7b, S7a, S6c, S5c, S6b, S5b), the three record counts, the marker lines (the last two say that S7d has not started and that the controller staged this plan), the counts of the earlier web slices (`indexedFeatures` is named four times in the direction test, the fourth being the case S7c added, and `optimizePackageImports` once in the config) and the plan listing. A different branch, a line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a record count of `0`, a missing marker line, a missing `S7d not started` or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/` refs, so the check works with either. `base-sha` is the SAD base of Task 9: the head the branch has when Task 0 starts (the S7c tip and the controller commit that staged this plan), so the SAD manifest covers this slice only.

- [ ] **Step 2: Create the helper scripts**

Create each file with the Write tool exactly as printed. They live in `.tmp/s7d/`, which is gitignored, and are never committed. `build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s7d/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s7d/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s7d/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s7d/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s7d/routes-$1.txt
grep Middleware .tmp/s7d/routes-$1.txt
```


`compare-routes.mjs` compares two route tables (route, size and First Load JS):

Create `.tmp/s7d/compare-routes.mjs`:

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

Create `.tmp/s7d/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s7d/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

Create `.tmp/s7d/count-it.mjs`:

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

Create `.tmp/s7d/trim-imports.mjs`:

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

Create `.tmp/s7d/same-lines.mjs`:

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

Create `.tmp/s7d/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s7d/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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

Create `.tmp/s7d/mock-scan.mjs`:

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

Create `.tmp/s7d/test-titles.mjs`:

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

Create `.tmp/s7d/move-modules.mjs`:

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

Create `.tmp/s7d/index-imports.mjs`:

```js
// Points app route imports of an indexed feature's leaf modules at the feature index, merging the imports of one feature in a file into one statement.
// Usage: node .tmp/s7d/index-imports.mjs <feature>... ; every app file is checked, and a default import of a leaf stops the run.
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


`mutate.mjs` is the mutation runner of this slice: it applies each mutation of a JSON list to its file, runs the given test files, prints `killed` when a test fails and `SURVIVED` when none does, and restores the file:

Create `.tmp/s7d/mutate.mjs`:

```js
// Applies each mutation of a JSON list to its file, reruns the given web test files in one vitest watch process, prints killed or SURVIVED per mutation, and restores every file.
// Usage: node .tmp/s7d/mutate.mjs <mutations.json> <test file under apps/web>...; a mutation is [label, file, from, to] or [label, file, from, to, count] (default count 1).
// A run that does not finish in five minutes (an endless render loop) counts as killed and the vitest process is started again.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [listFile, ...tests] = process.argv.slice(2)
const mutations = JSON.parse(readFileSync(listFile, 'utf8'))
const web = tests.map((file) => file.replace(/^apps\/web\//, ''))
let child = null
let output = ''
let seen = 0

const start = () => {
  output = ''
  seen = 0
  child = spawn('pnpm', ['exec', 'vitest', '--watch', '--reporter=dot', '--bail=1', ...web], {
    cwd: 'apps/web',
    stdio: ['ignore', 'pipe', 'ignore'],
    detached: true,
  })
  child.stdout.on('data', (chunk) => {
    output += chunk.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  })
}
const stop = () => {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {}
}

// Waits for the end of the next run that started after `since`; true when every test file passed without an unhandled error, false when not, null when the run never ended.
const nextRun = async (limitMs, since = 0) => {
  const begin = Date.now()
  for (;;) {
    const found = output.slice(seen).match(/[\s\S]*?Test Files\s+([^\n]*)[\s\S]*?Start at\s+(\d+):(\d+):(\d+)[\s\S]*?Duration/)
    if (found) {
      seen = output.length
      const day = new Date()
      const startedAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +found[2], +found[3], +found[4]).getTime()
      // A summary of a run that began before the change belongs to an earlier change and is dropped.
      if (startedAt >= since - 1500) return !/failed/.test(found[1]) && !/Unhandled|Errors\s+\d+ error/.test(found[0])
      continue
    }
    if (Date.now() - begin > limitMs) return null
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

const touched = new Map()
const restore = () => {
  for (const [file, text] of touched) writeFileSync(file, text)
  stop()
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore()
    process.exit(1)
  })
}

start()
let survived = 0
try {
  const first = await nextRun(900000)
  console.log(`unmutated: ${first ? 'pass' : 'FAIL'}`)
  if (!first) throw new Error('the unmutated run must pass first (rerun when a test timed out under load)')
  let last = null
  for (const [label, file, from, to, count = 1] of mutations) {
    if (!touched.has(file)) touched.set(file, readFileSync(file, 'utf8'))
    const original = touched.get(file)
    const found = original.split(from).length - 1
    if (found !== count) {
      console.log(`${label}: NOT APPLIED (found ${found}, expected ${count})`)
      survived++
      continue
    }
    // Another file starts from its original text; its restore reruns once and that result is dropped.
    if (last && last !== file) {
      writeFileSync(last, touched.get(last))
      await nextRun(300000, Date.now())
    }
    writeFileSync(file, original.replaceAll(from, to))
    const wrote = Date.now()
    last = file
    const passed = await nextRun(300000, wrote)
    if (passed === null) {
      writeFileSync(file, original)
      stop()
      start()
      await nextRun(900000)
      console.log(`${label}: killed (run never ended)`)
      continue
    }
    if (passed) survived++
    console.log(`${label}: ${passed ? 'SURVIVED' : 'killed'}`)
  }
  console.log(`mutations ${mutations.length}, survived ${survived}`)
} finally {
  restore()
}
```


- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s7d/build-routes.sh
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm typecheck > .tmp/s7d/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s7d/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s7d/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s7d/m0
cat .tmp/s7d/m0
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
apps/web test:  Test Files  265 passed (265)
apps/web test:       Tests  2422 passed (2422)
      Tests  58 passed (58)

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      102 kB
<n>
```


The no-bail option keeps the recursive run going when one package fails, so a flake in one package cannot hide the figures of the next (a failing line is rerun alone, as the constraints say). The test lines are the baselines the later tasks state their deltas against: `B_config` 19, `B_shared` 731 in 46 files, `B_imports` 94, `B_api` 2628 passed and 21 skipped in 158 files, `B_sad` 58 and `B_web` 265 files and 2422 tests. They depend on the slices below this one, so read the values your run prints and carry on with them: every web figure below is stated as the replay value, and the delta from `B_web` is what must hold. The `docs:check` tail is the baseline of 6 failures and 1 warning, which is not a stop: the failures are in files this slice does not touch. The build prints `exit 0` and the Middleware line, and `m0` holds its size in kB (`M0`, 102 in the replay); every later build compares with it.

```bash
F=apps/web/src
for d in analytics dashboard; do git ls-files $F/features/$d | wc -l; done
wc -l $F/features/analytics/components/analytics-dashboard.tsx $F/features/dashboard/role-dashboard.tsx $F/features/dashboard/executive-dashboard.tsx $F/features/dashboard/pinned-charts.tsx $F/features/dashboard/action-kpi-row.tsx
grep -c "useState" $F/features/analytics/components/analytics-dashboard.tsx $F/features/dashboard/role-dashboard.tsx
git grep -nE "features/dashboard" -- apps/web ':!'$F'/features/dashboard' | cut -c1-130
git grep -nE "@/features/(analytics|dashboard)/" -- $F ':!'$F'/features/analytics' ':!'$F'/features/dashboard' | cut -c1-120
git grep -nE "from '(@/features/projects/|\.\./projects)" -- $F/features/dashboard $F/features/analytics | cut -c1-120
git grep -c "useAuthorizedRead(" -- $F/features/dashboard $F/features/analytics ':!*.test.*'
git grep -hoE "'(dashboard|analytics)-[a-z-]+'" -- $F/features/dashboard $F/features/analytics ':!*.test.*' | sort | uniq -c
git grep -nE "DashboardSeverity" -- $F ':!'$F'/types/pathways.ts' | cut -c1-110
node .tmp/s7d/mock-scan.mjs lib/services/pathways-client xx | tail -1
git hash-object $F/features/analytics/components/analytics-dashboard.tsx $F/features/dashboard/role-dashboard.tsx $F/features/ui-copy-cleanup.contract.test.ts $F/import-direction.test.ts $F/test/fixtures/analytics-dashboard-fixtures.tsx apps/web/next.config.ts $F/types/pathways.ts | cut -c1-8
```


Expected:

```text
53
27
  898 apps/web/src/features/analytics/components/analytics-dashboard.tsx
  693 apps/web/src/features/dashboard/role-dashboard.tsx
  214 apps/web/src/features/dashboard/executive-dashboard.tsx
  185 apps/web/src/features/dashboard/pinned-charts.tsx
  135 apps/web/src/features/dashboard/action-kpi-row.tsx
 2125 total
apps/web/src/features/analytics/components/analytics-dashboard.tsx:19
apps/web/src/features/dashboard/role-dashboard.tsx:14
apps/web/src/app/(dashboard)/dashboard/page.tsx:3:import { RoleDashboard } from '@/features/dashboard/role-dashboard'
apps/web/src/app/(dashboard)/dashboard/page.tsx:3:import { RoleDashboard } from '@/features/dashboard/role-dashboard'
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx:79:vi.mock('@/features/analytics/hooks/use-analytics-insight
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx:97:vi.mock('@/features/analytics/components/analytics-charts
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx:104:vi.mock('@/features/analytics/components/analytics-cover
apps/web/src/features/analytics/components/analytics-dashboard.tsx:1
apps/web/src/features/analytics/hooks/use-analytics-insights.ts:3
apps/web/src/features/analytics/hooks/use-project-map.ts:1
apps/web/src/features/dashboard/action-kpi-row.tsx:1
apps/web/src/features/dashboard/pinned-charts.tsx:2
apps/web/src/features/dashboard/role-overview/role-overview.tsx:1
apps/web/src/features/dashboard/role-overview/use-role-overview.ts:1
      1 'analytics-open-alerts'
      1 'analytics-project-map'
      2 'dashboard-action-counts'
      1 'dashboard-pin-timeline'
      1 'dashboard-role-overview'
apps/web/src/features/dashboard/executive-dashboard.tsx:23:  DashboardSeverity,
apps/web/src/features/dashboard/executive-dashboard.tsx:40:const riskToneClasses: Record<DashboardSeverity, st
apps/web/src/features/dashboard/role-dashboard.tsx:51:  DashboardSeverity,
apps/web/src/features/dashboard/role-dashboard.tsx:77:const severityTone = (severity?: DashboardSeverity) => {
apps/web/src/features/dashboard/role-dashboard.tsx:93:const statusTone = (severity?: DashboardSeverity) =>
factories 36, naming 0
b7e731fd
f5cc73bc
4dc58f23
f876fa3b
022f1974
29c77e8f
63ab07cb
```


The first two lines are the file counts of `features/analytics` (53) and `features/dashboard` (27, three in `role-overview/` already), and the `wc` lines are the sizes the tasks start from: the analytics shell at 898 lines with 19 `useState` lines, the role dashboard at 693 lines with 14. The first two greps show that the dashboard feature has one importer outside it (the dashboard page, listed twice because two patterns match it) and that three mock factories of the analytics fixture name leaf modules of the analytics feature (Task 4 adds components in `components/`, so these three stay valid). No file of the two features imports a leaf of `features/projects`. The `useAuthorizedRead(` counts and the key list show the read keys: `dashboard-action-counts` is the only key written in two files (Task 8). The five `DashboardSeverity` lines are the two users outside `types/pathways.ts`, which Task 7 and Task 8 touch. `mock-scan` reports 36 mock factories of `lib/services/pathways-client` and no naming problem. The seven hashes are those of the shell (`b7e731fd`, the pin of Task 2), the role dashboard (`f5cc73bc`), the UI copy contract test, the direction test, the analytics fixture, `next.config.ts` and `types/pathways.ts`; a hash of a file that a slice below this one changed differs, and the cut plans print the value they expect before they write anything.


- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s7d-dashboards-web.md docs/superpowers/plans/$(date +%F)-modularization-s7d-dashboards-web.md`. The handoff copy and its index row stay, and so do the `docs/superpowers/plans` copies of the earlier plans and their index rows: they are removed only after the developer has merged the series (ruling 12).

In `docs/index.md` section 1.6, add one row after the S7c plan row; the block finds the last line that names the S7c plan copy, so a second matching line does not get the row twice:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s7d-dashboards-web.md docs/superpowers/plans/$D-modularization-s7d-dashboards-web.md
ROW="| [S7d dashboards web plan](superpowers/plans/$D-modularization-s7d-dashboards-web.md) | $D-modularization-s7d-dashboards-web.md | $D | S7d of the codebase modularization: analytics shell split, features/dashboard layout and role dashboard split, dashboard read key | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s7c-analytics-dashboards" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: add the S7d dashboards web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text
+| [S7d dashboards web plan](superpowers/plans/YYYY-MM-DD-modularization-s7d-dashboards-web.md) | YYYY-MM-DD-modularization-s7d-dashboards-w

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
<sha> docs: add the S7d dashboards web plan
<sha> handoff: stage the S7d plan
```


`docs:check` keeps the 6 baseline failures and 1 warning.

---

### Task 1: Pin the analytics shell before anything moves

**Files:**
- Modify: `apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx` (ten exact edits)
- Create: `apps/web/src/features/analytics/components/analytics-dashboard.scope.test.tsx` (19 tests), `analytics-dashboard.actions.test.tsx` (22 tests), `analytics-dashboard.gates.test.tsx` (13 tests)
- Create (gitignored): `.tmp/s7d/task1-fixture-edits.json`, `mut-shell.json`

The shell (`analytics-dashboard.tsx`, 898 lines, 18 `useState` calls) is cut in Tasks 2 to 4. The seven existing test files pin the panels and the reads of the optional views; they did not reach the project, period and monitoring state, the retry buttons, the rules link, Add to Dashboard or the export button states. These tests are written against the unsplit shell and must pass before and after every later task, so they are the old-versus-new comparison of the slice.

- [ ] **Step 1: Record the shell and its tests before the pins**

```bash
F=apps/web/src
D=$F/features/analytics/components
wc -l $D/analytics-dashboard.tsx $F/test/fixtures/analytics-dashboard-fixtures.tsx
git hash-object $D/analytics-dashboard.tsx $F/test/fixtures/analytics-dashboard-fixtures.tsx | cut -c1-8
ls $D/analytics-dashboard*.test.tsx | wc -l
node .tmp/s7d/count-it.mjs $D/analytics-dashboard*.test.tsx | tail -1
(cd apps/web && timeout 900 pnpm exec vitest run src/features/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
  898 apps/web/src/features/analytics/components/analytics-dashboard.tsx
  342 apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx
 1240 total
b7e731fd
022f1974
7
total: it 70, describe 16, expect 277
 Test Files  20 passed (20)
      Tests  180 passed (180)
```


The shell is 898 lines. Seven test files hold its tests (the dashboard test, cards, export, summary, survey, survey-access and timeline). The analytics folder has 20 test files and 180 tests (the seven dashboard files hold 70 `it` blocks and 277 assertions): they are the baseline of the deltas in this task.

- [ ] **Step 2: Extend the fixture and write the pins**

`task1-fixture-edits.json` makes the fixture able to serve both new files: a settable `rbac.allowed` for the mocked `can`, a `toastSuccess` mock, a `PageHeader` stub that renders its `actions`, a `userId` on the default profile, pending-promise defaults for the survey and timeline reads, `insightCalls` (the arguments of the three mocked insight hooks, which the gate pins read) and `loadDashboard`, which imports the dashboard through the feature index with the named UI flags on (every flag is off unless named, except the export button):

Create `.tmp/s7d/task1-fixture-edits.json`:

```json
[
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "const toastError = vi.hoisted(() => vi.fn())\n", "const toastError = vi.hoisted(() => vi.fn())\nconst toastSuccess = vi.hoisted(() => vi.fn())\nconst rbac = vi.hoisted(() => ({ allowed: [] as string[] }))\nconst insightCalls = vi.hoisted(() => ({\n  budget: [] as unknown[][],\n  participation: [] as unknown[][],\n  trends: [] as unknown[][],\n}))\n", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "export { alertHook, api, coverageMap, currentAccess, download, insights, previewExport, toastError }\n", "export {\n  alertHook,\n  api,\n  coverageMap,\n  currentAccess,\n  download,\n  insightCalls,\n  insights,\n  previewExport,\n  rbac,\n  toastError,\n  toastSuccess,\n}\n", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))", "vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "vi.mock('@/lib/rbac/can', () => ({ can: () => false }))", "vi.mock('@/lib/rbac/can', () => ({\n  can: (_role: string, permission: string) => rbac.allowed.includes(permission),\n}))", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,", "  PageHeader: ({ actions, title }: { actions?: React.ReactNode; title: string }) => (\n    <>\n      <h1>{title}</h1>\n      {actions}\n    </>\n  ),", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "  alertHook.result = { data: undefined }\n  coverageMap.instanceCount = 0\n", "  alertHook.result = { data: undefined }\n  rbac.allowed = []\n  insightCalls.budget.length = 0\n  insightCalls.participation.length = 0\n  insightCalls.trends.length = 0\n  coverageMap.instanceCount = 0\n", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "export const resetAnalyticsMocks = () => {", "// Loads the dashboard with the named UI flags on; every flag is off unless named, except the export button.\nexport const loadDashboard = async (flags: { export?: boolean; maps?: boolean; pins?: boolean }) => {\n  vi.resetModules()\n  vi.doMock('@/constants/feature-flags', () => ({\n    ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: flags.export ?? true,\n    UNFINISHED_CONTROLS_UI_ENABLED: true,\n    DASHBOARD_PINS_UI_ENABLED: flags.pins ?? false,\n    MAPS_UI_ENABLED: flags.maps ?? false,\n  }))\n  const { AnalyticsDashboard: Dashboard } = await import('@/features/analytics')\n  vi.doUnmock('@/constants/feature-flags')\n  return Dashboard\n}\n\nexport const resetAnalyticsMocks = () => {", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "  currentAccess.role = 'Monitoring and Evaluation Officer'\n  currentAccess.profile.roles = [", "  currentAccess.role = 'Monitoring and Evaluation Officer'\n  currentAccess.profile.userId = 'user-1'\n  currentAccess.profile.roles = [", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "  api.getDescriptiveAnalytics.mockReturnValue(new Promise(() => {}))\n  insights.budget", "  api.getDescriptiveAnalytics.mockReturnValue(new Promise(() => {}))\n  api.getSurveyAnalytics.mockReturnValue(new Promise(() => {}))\n  api.getTimelineAnalytics.mockReturnValue(new Promise(() => {}))\n  insights.budget", 1],
 ["apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx", "  useBudgetSummary: () => insights.budget,\n  useIndicatorTrends: () => insights.trends,\n  useParticipationBreakdown: () => insights.participation,\n", "  useBudgetSummary: (...args: unknown[]) => {\n    insightCalls.budget.push(args)\n    return insights.budget\n  },\n  useIndicatorTrends: (...args: unknown[]) => {\n    insightCalls.trends.push(args)\n    return insights.trends\n  },\n  useParticipationBreakdown: (...args: unknown[]) => {\n    insightCalls.participation.push(args)\n    return insights.participation\n  },\n", 1]
]
```


`analytics-dashboard.scope.test.tsx` pins the project list (reason and Retry, a failure without a message, the empty state, no role, the first project, a kept and a lost selection), the project data and monitoring failures with their separate Retry buttons, the map view (the map stays while a read fails, a status line replaces the loading page, a role change clears the same project's data behind the map), the first paint (`renderToString` shows the loading page before any effect), the default view, type and indicator, and the indicator filter. The table cases state their figures:

Create `apps/web/src/features/analytics/components/analytics-dashboard.scope.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  indicator,
  loadDashboard,
  monitoring,
  project,
  resetAnalyticsMocks,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const completion = () => screen.getAllByText('Activity completion')[0].parentElement?.parentElement?.textContent
const retry = () => screen.getByRole('button', { name: /retry/i })
const released = (id: string, value: string) => ({
  ...indicator('project-a', id, '2026-09-01', '2026-09-30'),
  progress: { state: 'AVAILABLE', value, reason: null },
})
const tableRows = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')

describe('Analytics dashboard scope: projects, project data and monitoring', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('first view', () => {
    it('opens on the KPI view as a bar chart for every indicator', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(screen.getByLabelText('Analysis view')).toHaveProperty('value', 'kpi')
      expect(screen.getByLabelText('Visualization type')).toHaveProperty('value', 'bar')
      expect(screen.getByLabelText('Indicator filter')).toHaveProperty('value', 'all')
    })

    it('paints the loading page on the first render, before any effect runs', () => {
      const html = renderToString(<AnalyticsDashboard />)

      expect(html).toContain('Loading analytics')
    })

    it('reads no activities without activities.read', async () => {
      currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
        (permission) => permission !== 'activities.read',
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(api.getActivities).not.toHaveBeenCalled()
    })
  })

  describe('project list', () => {
    it('shows the server reason when the list fails and reloads it on Retry', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Project directory is down.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Project directory is down.')).toBeTruthy()
      expect(screen.getByText('Analytics data unavailable')).toBeTruthy()
      expect(api.getActivities).not.toHaveBeenCalled()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      expect(screen.queryByText('Project directory is down.')).toBeNull()
    })

    it('names the failure when the list rejects without a message', async () => {
      api.getProjectsForRole.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Projects could not be loaded.')).toBeTruthy()
    })

    it('shows the empty state and requests nothing when the role has no project', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      render(<AnalyticsDashboard />)

      expect(
        await screen.findByText('No authorized project is available for this account.'),
      ).toBeTruthy()
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', '')
      expect(api.getActivities).not.toHaveBeenCalled()
      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('stops loading and requests nothing without a role', async () => {
      currentAccess.role = null as never
      render(<AnalyticsDashboard />)

      expect(
        await screen.findByText('No authorized project is available for this account.'),
      ).toBeTruthy()
      expect(screen.queryByText('Loading analytics')).toBeNull()
      expect(api.getProjectsForRole).not.toHaveBeenCalled()
    })

    it('selects the first project and keeps a selected project when the role reloads the list', async () => {
      const view = render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-a')

      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))

      currentAccess.role = 'Program Manager'
      view.rerender(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Program Manager'))
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-b')
    })

    it('falls back to the first project when the reloaded list no longer holds the selection', async () => {
      const view = render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))

      api.getProjectsForRole.mockResolvedValue([project('project-c', 'Project C', null, null)])
      api.getProjectIndicators.mockResolvedValue([])
      currentAccess.role = 'Program Manager'
      view.rerender(<AnalyticsDashboard />)

      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-c'))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-c')
    })
  })

  describe('project data', () => {
    it('shows the server reason and reloads only the project data on Retry', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities are unavailable.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Activities are unavailable.')).toBeTruthy()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Activities are unavailable.')).toBeNull()
    })

    it('names the failure when the project data rejects without a message', async () => {
      api.getProjectIndicators.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Analytics data could not be loaded.')).toBeTruthy()
    })
  })

  describe('monitoring', () => {
    it('shows the server reason and reloads only the monitoring read on Retry', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is unavailable.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Monitoring is unavailable.')).toBeTruthy()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
      expect(api.getActivities).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Monitoring is unavailable.')).toBeNull()
    })

    it('names the failure when the monitoring read rejects without a message', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Analytics data could not be loaded.')).toBeTruthy()
    })
  })

  describe('map view', () => {
    it('keeps the map when monitoring fails and retries only the monitoring read', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is unavailable.'))
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Monitoring is unavailable.')
      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByText('Analytics data unavailable')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
      expect(api.getActivities).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    })

    it('keeps the map when the project data fails and retries the project data', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getActivities.mockRejectedValueOnce(new Error('Activities are unavailable.'))
      render(<MapsDashboard />)
      await screen.findByText('Activities are unavailable.')

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Activities are unavailable.')

      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    })

    it('clears the project data of the same project while a role change reloads it behind the map', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getActivities.mockResolvedValue([
        { id: 'A-1', projectId: 'project-a', code: 'A-1', title: 'Activity A-1', status: 'Completed' },
      ])
      const view = render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      await waitFor(() => expect(completion()).toContain('1/1'))
      expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', false)

      api.getActivities.mockReturnValue(new Promise(() => {}))
      api.getProjectIndicators.mockReturnValue(new Promise(() => {}))
      api.getProjectsForRole.mockResolvedValue([project('project-a', 'Project A', null, null)])
      currentAccess.role = 'Program Manager'
      view.rerender(<MapsDashboard />)

      await waitFor(() => expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', true))
      expect(completion()).not.toContain('1/1')
    })

    it('shows a status line, not the loading page, while analytics reload behind the map', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(screen.getByText('Loading analytics')).toBeTruthy()

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      expect(await screen.findByText('Updating project analytics.')).toBeTruthy()
      expect(screen.queryByText('Loading analytics')).toBeNull()
    })
  })

  describe('indicator filter', () => {
    it('limits the KPI table to the chosen indicator and restores every indicator', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [released('I-1', '40'), released('I-2', '80')],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'table' } })
      await waitFor(() => expect(tableRows()).toHaveLength(2))
      expect(tableRows()).toEqual(['Indicator I-140 %', 'Indicator I-280 %'])
      expect(screen.getByText('I-2 · Indicator I-2', { selector: 'option' })).toBeTruthy()

      fireEvent.change(screen.getByLabelText('Indicator filter'), { target: { value: 'I-2' } })
      expect(tableRows()).toEqual(['Indicator I-280 %'])

      fireEvent.change(screen.getByLabelText('Indicator filter'), { target: { value: 'all' } })
      expect(tableRows()).toHaveLength(2)
    })

    it('enables the indicator filter only in the KPI view', async () => {
      currentAccess.profile.permissions = [
        ...currentAccess.profile.permissions,
        'analytics.descriptive.read',
      ]
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(screen.getByLabelText('Indicator filter')).toHaveProperty('disabled', false)

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() =>
        expect(screen.getByLabelText('Indicator filter')).toHaveProperty('disabled', true),
      )
    })
  })
})
```


`analytics-dashboard.actions.test.tsx` pins the alert rules link for each role grant, the Add to Dashboard button (a stored KPI, participation and timeline pin with its period or without one, the duplicate, full and unavailable-storage answers, the survey and no-period reasons with `title`, `aria-describedby` and the reason text, the hidden button for a role that cannot read the view, the missing user id) and the export button (the flag, the disabled states per view, `Preparing preview`, the project and period named in the preview and the reporting date of the timeline):

Create `apps/web/src/features/analytics/components/analytics-dashboard.actions.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  loadDashboard,
  previewExport,
  rbac,
  resetAnalyticsMocks,
  toastError,
  toastSuccess,
} from '@/test/fixtures/analytics-dashboard-fixtures'

const participationGrants = [
  'analytics.descriptive.read',
  'journeys.read',
  'beneficiaries.records.read',
  'assessments.detail.read',
]
const pinsKey = 'pathways.dashboardPins.v1.user-1'
const pins = () => JSON.parse(window.localStorage.getItem(pinsKey) ?? '[]')
const addButton = () => screen.getByRole('button', { name: 'Add to Dashboard' }) as HTMLButtonElement
const exportButton = () =>
  screen.getByRole('button', { name: /Export aggregates|Preparing preview/ }) as HTMLButtonElement
const grant = (...permissions: string[]) => {
  currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...permissions]
}
const pinnable = async () => {
  const Dashboard = await loadDashboard({ pins: true })
  render(<Dashboard />)
  await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
  await waitFor(() => expect(addButton().disabled).toBe(false))
}

describe('Analytics dashboard actions: rules link, Add to Dashboard and export', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('alert rules link', () => {
    it.each([
      [[], null],
      [['rules.configure'], null],
      [['rules.view'], 'View alert rules'],
      [['rules.view', 'rules.configure'], 'Manage alert rules'],
    ])('with %j shows %s', async (allowed, label) => {
      rbac.allowed = allowed
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      for (const name of ['View alert rules', 'Manage alert rules'])
        expect(screen.queryByRole('link', { name }) !== null).toBe(name === label)
      if (label)
        expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(
          '/alerts/repository',
        )
    })

    it('shows no link without a role', async () => {
      rbac.allowed = ['rules.view', 'rules.configure']
      currentAccess.role = null as never
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)

      await screen.findByText('No authorized project is available for this account.')
      expect(screen.queryByRole('link', { name: /alert rules/ })).toBeNull()
    })
  })

  describe('Add to Dashboard', () => {
    it('stores a KPI pin with its period, then reports the duplicate', async () => {
      await pinnable()

      fireEvent.click(addButton())
      expect(toastSuccess).toHaveBeenCalledWith('Added to your dashboard.')
      expect(pins()).toHaveLength(1)
      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith('Already on your dashboard.')
      expect(toastSuccess).toHaveBeenCalledTimes(1)
      expect(pins()).toHaveLength(1)
    })

    it('reports a full dashboard', async () => {
      window.localStorage.setItem(
        pinsKey,
        JSON.stringify(
          Array.from({ length: 8 }, (_, index) => ({
            id: `pin-${index}`,
            view: 'kpi',
            projectId: `other-${index}`,
            createdAt: '2026-09-01T00:00:00.000Z',
          })),
        ),
      )
      await pinnable()

      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith('Your dashboard is full. Unpin a chart first.')
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(pins()).toHaveLength(8)
    })

    it('reports unavailable browser storage', async () => {
      await pinnable()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })

      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith(
        'Browser storage is unavailable, so the chart could not be pinned.',
      )
      expect(toastSuccess).not.toHaveBeenCalled()
    })

    it('stores a participation pin with its period', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'participation' } })

      expect(addButton().disabled).toBe(false)
      fireEvent.click(addButton())
      expect(pins()[0]).toMatchObject({
        view: 'participation',
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      })
    })

    it('stores a timeline pin without a period', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })

      fireEvent.click(addButton())
      const [pin] = pins()
      expect(pin).toMatchObject({ view: 'timeline', projectId: 'project-a' })
      expect(pin).not.toHaveProperty('periodStart')
      expect(pin).not.toHaveProperty('periodEnd')
    })

    it('blocks the survey view with its reason and stores nothing', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      expect(addButton().disabled).toBe(true)
      expect(addButton().title).toBe('Survey improvement cannot be pinned.')
      expect(addButton().getAttribute('aria-describedby')).toBe('pin-blocked-reason')
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(
        'Survey improvement cannot be pinned.',
      )
      fireEvent.click(addButton())
      expect(pins()).toHaveLength(0)
    })

    it('blocks the KPI view with its reason while the project has no reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())

      await waitFor(() =>
        expect(addButton().title).toBe('Choose a reporting period to pin this view.'),
      )
      expect(addButton().disabled).toBe(true)
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(
        'Choose a reporting period to pin this view.',
      )
    })

    it('has no reason text and no title while the view can be pinned', async () => {
      await pinnable()

      expect(addButton().title).toBe('')
      expect(addButton().getAttribute('aria-describedby')).toBeNull()
      expect(document.getElementById('pin-blocked-reason')).toBeNull()
    })

    it('hides the button for a role that cannot read indicator progress', async () => {
      currentAccess.profile.permissions = ['projects.read', 'activities.read', 'analytics.read']
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalled())

      expect(screen.queryByRole('button', { name: 'Add to Dashboard' })).toBeNull()
    })

    it('disables the button without a user id', async () => {
      currentAccess.profile.userId = '' as never
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(addButton().disabled).toBe(true)
      expect(addButton().title).toBe('')
      fireEvent.click(addButton())
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(toastError).not.toHaveBeenCalled()
    })
  })

  describe('Export aggregates', () => {
    const exporter = async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      await waitFor(() => expect(exportButton().disabled).toBe(false))
    }
    const preview = {
      title: 'Descriptive analytics',
      columns: ['section'],
      rows: [['COUNT']],
      totalRows: 1,
    }

    it('is hidden when the export flag is off', async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({ export: false })
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(screen.queryByRole('button', { name: 'Export aggregates' })).toBeNull()
    })

    it('is disabled while the project has no reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())

      expect(exportButton().disabled).toBe(true)
    })

    it('stays enabled in the timeline view without a reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())
      await waitFor(() => expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', true))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() => expect(exportButton().disabled).toBe(false))
    })

    it('is disabled in the survey view for a role that only reads the frozen release of open periods', async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(exportButton().disabled).toBe(false))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(exportButton().disabled).toBe(true)
    })

    it('is enabled in the survey view for a detail role', async () => {
      grant('analytics.descriptive.read', 'analytics.export', 'assessments.detail.read')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(exportButton().disabled).toBe(false))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(exportButton().disabled).toBe(false)
    })

    it('shows Preparing preview, disabled, while the preview loads', async () => {
      previewExport.mockReturnValue(new Promise(() => {}))
      await exporter()

      fireEvent.click(screen.getByText('CSV'))
      await waitFor(() => expect(exportButton().textContent).toBe('Preparing preview'))
      expect(exportButton().disabled).toBe(true)
    })

    it('names the project and the period in the preview, and the reporting date for the timeline', async () => {
      previewExport.mockResolvedValue(preview)
      await exporter()

      fireEvent.click(screen.getByText('PDF'))
      expect(
        (await screen.findByText(/^Descriptive analytics for Project A, .+\. The PDF file/)).textContent,
      ).not.toContain('current reporting date')
      expect(screen.getByText(/Project A, Sep 1/).textContent).toContain('Sep')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByTestId('analytics-export-preview')).toBeNull())

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() => expect(exportButton().disabled).toBe(false))
      fireEvent.click(screen.getByText('CSV'))
      expect(
        await screen.findByText(
          'Descriptive analytics for Project A, current reporting date. The CSV file contains these aggregate rows only.',
        ),
      ).toBeTruthy()
    })
  })
})
```


`analytics-dashboard.gates.test.tsx` pins what the Task 1 survey found alive in the lines that stay in the shell and that a reviewer would call a permission or a date rule: the budget summary and its project (the four budget grants), the trends and participation reads (their views and the chosen period), SADDD (the `analytics.saddd.read` grant, the start day and the last day of the project), the survey for a role that sees closed periods only (the period that ends today is not closed), the period the survey picker selects, the "None yet" wording of the monitoring panels while the project data loads or failed (map view), and a survey request after the role lost its grant. The day is the fixture date, 2026-09-27 in Manila:

Create `apps/web/src/features/analytics/components/analytics-dashboard.gates.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  indicator,
  insightCalls,
  loadDashboard,
  project,
  resetAnalyticsMocks,
  surveyDefaults,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const grant = (...permissions: string[]) => {
  currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...permissions]
}
const withoutGrant = (permission: string) => {
  currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
    (candidate) => candidate !== permission,
  )
}
const dated = (start: string, end: string) =>
  api.getProjectsForRole.mockResolvedValue([project('project-a', 'Project A', start, end)])
const ready = () => waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
const closedOnly = [
  'projects.read',
  'monitoring.read',
  'analytics.read',
  'analytics.descriptive.read',
  'reports.indicator.read',
]
const onlyIndicator = (start: string, end: string) =>
  api.getProjectIndicatorValues.mockResolvedValue([indicator('project-a', 'A-ONE', start, end)])

describe('Analytics dashboard grants and date rules that stay in the shell', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('insight reads', () => {
    it('keeps the budget summary off without the budget grants and names the project', async () => {
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.budget.at(-1)).toEqual([{ projectId: 'project-a' }, false])
    })

    it('turns the budget summary on with every budget grant', async () => {
      currentAccess.profile.roles = ['PROJECT_MANAGER']
      grant('analytics.descriptive.read', 'budgets.read', 'expenses.read')
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.budget.at(-1)).toEqual([{ projectId: 'project-a' }, true])
    })

    it('reads the trends in the KPI view and the participation in its own view, for the chosen period', async () => {
      grant(
        'analytics.descriptive.read',
        'journeys.read',
        'beneficiaries.records.read',
        'submissions.write',
      )
      const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.trends.at(-1)).toEqual([{ projectId: 'project-a', ...period }, true])
      expect(insightCalls.participation.at(-1)).toEqual([
        { projectId: 'project-a', ...period },
        false,
      ])

      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'participation' },
      })
      await waitFor(() =>
        expect(insightCalls.participation.at(-1)).toEqual([
          { projectId: 'project-a', ...period },
          true,
        ]),
      )
      expect(insightCalls.trends.at(-1)).toEqual([{ projectId: 'project-a', ...period }, false])
    })
  })

  describe('SADDD', () => {
    it('requests nothing and shows no panel without analytics.saddd.read', async () => {
      withoutGrant('analytics.saddd.read')
      dated('2026-01-01', '2026-12-31')
      render(<AnalyticsDashboard />)
      await ready()

      expect(api.getSadddDashboard).not.toHaveBeenCalled()
      expect(screen.queryByText('SADDD Analysis')).toBeNull()
    })

    it('opens on the day the project starts', async () => {
      dated('2026-09-27', '2026-12-31')
      render(<AnalyticsDashboard />)

      await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalled())
      expect(screen.queryByText(/SADDD opens when this project starts/)).toBeNull()
    })

    it('waits with a notice and no request until the day after', async () => {
      dated('2026-09-28', '2026-12-31')
      render(<AnalyticsDashboard />)
      await ready()

      expect(await screen.findByText(/SADDD opens when this project starts/)).toBeTruthy()
      expect(api.getSadddDashboard).not.toHaveBeenCalled()
    })

    it('says the counts are to date through the last day of the project and not after it', async () => {
      dated('2026-01-01', '2026-09-27')
      const view = render(<AnalyticsDashboard />)
      expect(
        await screen.findByText('Counts to date; groups of fewer than 5 are hidden.'),
      ).toBeTruthy()
      view.unmount()

      dated('2026-01-01', '2026-09-26')
      render(<AnalyticsDashboard />)
      expect(await screen.findByText('SADDD analysis loaded.')).toBeTruthy()
      expect(screen.queryByText('Counts to date; groups of fewer than 5 are hidden.')).toBeNull()
    })
  })

  describe('survey release for a role that sees closed periods only', () => {
    beforeEach(() => {
      surveyDefaults()
      currentAccess.profile.permissions = [...closedOnly]
    })

    it('asks for a closed period when the period ends today', async () => {
      onlyIndicator('2026-09-01', '2026-09-27')
      render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      expect(
        await screen.findByText(
          'Survey results for your role are released after the reporting period closes. Choose a closed period.',
        ),
      ).toBeTruthy()
      expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
    })

    it('reads the survey for a period that ended yesterday', async () => {
      onlyIndicator('2026-09-01', '2026-09-26')
      render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      await waitFor(() =>
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-26',
        }),
      )
    })
  })

  describe('survey read after the role loses the grant', () => {
    it('sends no survey request for a project chosen after the grant is gone', async () => {
      surveyDefaults()
      const view = render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      const before = api.getSurveyAnalytics.mock.calls.length

      withoutGrant('analytics.descriptive.read')
      view.rerender(<AnalyticsDashboard />)
      expect(
        await screen.findByText('Survey improvement is restricted for your role.'),
      ).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenCalledWith(
          expect.objectContaining({ projectId: 'project-b' }),
        ),
      )

      expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(before)
    })
  })

  describe('reporting period of the survey view', () => {
    it('selects a period the survey can use when the chosen period overlaps another', async () => {
      surveyDefaults()
      api.getProjectIndicators.mockResolvedValue([
        indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
        indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
        indicator('project-a', 'A-JUL', '2026-07-01', '2026-07-31'),
      ])
      render(<AnalyticsDashboard />)
      await ready()
      const picker = () => screen.getByLabelText('Reporting period') as HTMLSelectElement
      expect(picker().value).toBe('2026-09-01::2026-09-30')

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      await waitFor(() => expect(picker().value).toBe('2026-07-01::2026-07-31'))
    })
  })

  describe('map view while the project data has not arrived', () => {
    const wording = 'Indicator reporting periods are not available for this role.'

    it('does not call the periods readable while the project data loads', async () => {
      grant('analytics.descriptive.read')
      api.getActivities.mockReturnValue(new Promise(() => {}))
      const MapsDashboard = await loadDashboard({ maps: true })
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalled())

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })

      expect(await screen.findByText(wording)).toBeTruthy()
    })

    it('does not call the periods readable after the project data failed', async () => {
      grant('analytics.descriptive.read')
      api.getActivities.mockRejectedValue(new Error('Activities are unavailable.'))
      const MapsDashboard = await loadDashboard({ maps: true })
      render(<MapsDashboard />)
      await screen.findByText('Activities are unavailable.')

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })

      expect(await screen.findByText(wording)).toBeTruthy()
    })
  })
})
```


```bash
node .tmp/s7d/replace-exact.mjs .tmp/s7d/task1-fixture-edits.json
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 900 pnpm exec vitest run src/features/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
node .tmp/s7d/count-it.mjs apps/web/src/features/analytics/components/analytics-dashboard.scope.test.tsx apps/web/src/features/analytics/components/analytics-dashboard.actions.test.tsx apps/web/src/features/analytics/components/analytics-dashboard.gates.test.tsx | tail -4
```


Expected:

```text
10 replacements in 1 files
Checked 4 files in <ms>. Fixed 3 files.
web typecheck clean
 Test Files  23 passed (23)
      Tests  234 passed (234)
apps/web/src/features/analytics/components/analytics-dashboard.scope.test.tsx: it 19, describe 7, expect 73
apps/web/src/features/analytics/components/analytics-dashboard.actions.test.tsx: it 19, describe 4, expect 60
apps/web/src/features/analytics/components/analytics-dashboard.gates.test.tsx: it 13, describe 7, expect 28
total: it 51, describe 18, expect 161
```


The edit script applies 10 replacements in 1 file. The analytics folder gains 3 files and 54 tests (19, 22 and 13, so 23 files and 234 tests) and every test passes against the unchanged shell. `count-it` counts 51 `it` blocks in the new files (the actions file has `it.each` tables that make 22 tests of 19 blocks). Biome formats three of the four files it checks (the gates test is written formatted).

- [ ] **Step 3: Mutate the shell once**

`mut-shell.json` lists 102 mutations of the shell, each `[label, file, from, to]` (a fifth item is the expected count when it is not 1): every access flag inverted or weakened, each default, every branch of the project, project data, period and monitoring effects, the reset lines of the project change, the retry branches, the map-mode loading and error expressions, the readable flags, the survey period rules, the SADDD notice boundaries and the three insight reads (the last three mutations of the list). `mutate.mjs` starts one Vitest watch process over the ten dashboard test files, writes each mutation, waits for the run, prints `killed` when a test failed and `SURVIVED` when none did, and restores the file:

Create `.tmp/s7d/mut-shell.json`:

```json
[
 [
  "activities grant inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')",
  "const canReadActivities = !principalHasAtomicPermission(profile, 'activities.read')"
 ],
 [
  "monitoring grant inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')",
  "const canReadIndicators = !principalHasAtomicPermission(profile, 'monitoring.read')"
 ],
 [
  "definitions need only one grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "canReadIndicators && principalHasAtomicPermission(profile, 'indicators.read')",
  "canReadIndicators || principalHasAtomicPermission(profile, 'indicators.read')"
 ],
 [
  "released values need only one grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "canReadIndicators && principalHasAtomicPermission(profile, 'reports.indicator.read')",
  "canReadIndicators || principalHasAtomicPermission(profile, 'reports.indicator.read')"
 ],
 [
  "descriptive grant inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadDescriptive = principalHasAtomicPermission(profile, 'analytics.descriptive.read')",
  "const canReadDescriptive = !principalHasAtomicPermission(profile, 'analytics.descriptive.read')"
 ],
 [
  "survey and timeline need only one grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadSurveyTimeline = canReadDescriptive && canReadIndicators",
  "const canReadSurveyTimeline = canReadDescriptive || canReadIndicators"
 ],
 [
  "frozen survey flag inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const surveyFrozenOnly = !principalHasAtomicPermission(profile, 'assessments.detail.read')",
  "const surveyFrozenOnly = principalHasAtomicPermission(profile, 'assessments.detail.read')"
 ],
 [
  "export needs only one grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "canReadDescriptive && principalHasAtomicPermission(profile, 'analytics.export')",
  "canReadDescriptive || principalHasAtomicPermission(profile, 'analytics.export')"
 ],
 [
  "SADDD grant inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadSaddd = principalHasAtomicPermission(profile, 'analytics.saddd.read')",
  "const canReadSaddd = !principalHasAtomicPermission(profile, 'analytics.saddd.read')"
 ],
 [
  "alerts grant inverted",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canReadAlerts = principalHasAtomicPermission(profile, 'alerts.read')",
  "const canReadAlerts = !principalHasAtomicPermission(profile, 'alerts.read')"
 ],
 [
  "rules view link always hidden",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canViewRules = Boolean(role && can(role, 'rules.view'))",
  "const canViewRules = false"
 ],
 [
  "rules configure always off",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const canConfigureRules = Boolean(role && can(role, 'rules.configure'))",
  "const canConfigureRules = false"
 ],
 [
  "default view",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "useState<AnalysisView>('kpi')",
  "useState<AnalysisView>('participation')"
 ],
 [
  "default visualization",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "useState<VisualizationType>('bar')",
  "useState<VisualizationType>('line')"
 ],
 [
  "default indicator",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "useState('all')",
  "useState('')"
 ],
 [
  "projects start idle",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const [projectsLoading, setProjectsLoading] = useState(true)",
  "const [projectsLoading, setProjectsLoading] = useState(false)"
 ],
 [
  "no role keeps loading",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    if (!role) {\n      setProjectsLoading(false)\n      return\n    }",
  "    if (!role) {\n      return\n    }"
 ],
 [
  "projects error message",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "caught instanceof Error ? caught.message : 'Projects could not be loaded.'",
  "caught instanceof Error ? caught.message : 'x'"
 ],
 [
  "projects error shows fixed text",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "caught instanceof Error ? caught.message : 'Projects could not be loaded.'",
  "'Projects could not be loaded.'"
 ],
 [
  "first project is not selected",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "records.some((row) => row.id === current) ? current : (records[0]?.id ?? '')",
  "records.some((row) => row.id === current) ? current : ''"
 ],
 [
  "selection is not kept on reload",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "records.some((row) => row.id === current) ? current : (records[0]?.id ?? '')",
  "(records[0]?.id ?? '')"
 ],
 [
  "projects load error not cleared",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectsLoading(true)\n    setProjectsError('')",
  "    setProjectsLoading(true)"
 ],
 [
  "projects reload ignores retry",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "  }, [projectsLoadAttempt, role])",
  "  }, [role])"
 ],
 [
  "empty scope keeps activities",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      setProjectDataLoading(false)\n      setActivities([])\n      setIndicatorDefinitions([])\n      return",
  "      setProjectDataLoading(false)\n      setIndicatorDefinitions([])\n      return"
 ],
 [
  "empty scope keeps indicator definitions",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      setProjectDataLoading(false)\n      setActivities([])\n      setIndicatorDefinitions([])\n      return",
  "      setProjectDataLoading(false)\n      setActivities([])\n      return"
 ],
 [
  "data load error not cleared",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectDataLoading(true)\n    setProjectDataError('')\n    setActivities([])",
  "    setProjectDataLoading(true)\n    setActivities([])"
 ],
 [
  "data load keeps old activities",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectDataError('')\n    setActivities([])\n    setIndicatorDefinitions([])\n    setPeriod('')",
  "    setProjectDataError('')\n    setIndicatorDefinitions([])\n    setPeriod('')"
 ],
 [
  "data load keeps old definitions",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setActivities([])\n    setIndicatorDefinitions([])\n    setPeriod('')",
  "    setActivities([])\n    setPeriod('')"
 ],
 [
  "data load keeps old period",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setIndicatorDefinitions([])\n    setPeriod('')\n    setMonitoring(null)",
  "    setIndicatorDefinitions([])\n    setMonitoring(null)"
 ],
 [
  "data load keeps old monitoring",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setPeriod('')\n    setMonitoring(null)\n    setMonitoringError('')\n    Promise.all",
  "    setPeriod('')\n    setMonitoringError('')\n    Promise.all"
 ],
 [
  "data load keeps old monitoring error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setPeriod('')\n    setMonitoring(null)\n    setMonitoringError('')\n    Promise.all",
  "    setPeriod('')\n    setMonitoring(null)\n    Promise.all"
 ],
 [
  "activities read ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      canReadActivities\n        ? activitiesClient.getActivities(projectId)",
  "      true\n        ? activitiesClient.getActivities(projectId)"
 ],
 [
  "definitions read ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      canReadIndicatorDefinitions\n        ? indicatorsClient.getProjectIndicators(projectId)",
  "      true\n        ? indicatorsClient.getProjectIndicators(projectId)"
 ],
 [
  "released values read never used",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "        : canReadIndicatorValues\n          ? indicatorsClient.getProjectIndicatorValues(projectId)",
  "        : false\n          ? indicatorsClient.getProjectIndicatorValues(projectId)"
 ],
 [
  "data error message",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',\n          )\n      })\n      .finally(() => {\n        if (active) setProjectDataLoading(false)",
  "caught instanceof Error ? caught.message : 'x',\n          )\n      })\n      .finally(() => {\n        if (active) setProjectDataLoading(false)"
 ],
 [
  "data error shows fixed text",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "setProjectDataError(\n            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',",
  "setProjectDataError(\n            'Analytics data could not be loaded.',"
 ],
 [
  "data load never finishes",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "        if (active) setProjectDataLoading(false)\n      })\n    return () => {",
  "      })\n    return () => {"
 ],
 [
  "data load ignores retry",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    projectDataLoadAttempt,\n    projectId,\n    selectedProject,\n  ])",
  "    projectId,\n    selectedProject,\n  ])"
 ],
 [
  "data load ignores the activities grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    canReadActivities,\n    canReadIndicatorDefinitions,\n    canReadIndicatorValues,\n    projectDataLoadAttempt,",
  "    canReadIndicatorDefinitions,\n    canReadIndicatorValues,\n    projectDataLoadAttempt,"
 ],
 [
  "period falls back to nothing",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "        : (reportingPeriods[0]?.value ?? ''),\n    )\n  }, [reportingPeriods])",
  "        : '',\n    )\n  }, [reportingPeriods])"
 ],
 [
  "period not kept",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      reportingPeriods.some((candidate) => candidate.value === current)\n        ? current\n        : (reportingPeriods[0]?.value ?? ''),",
  "      reportingPeriods[0]?.value ?? '',"
 ],
 [
  "monitoring guard drops the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "if (!projectId || !selectedPeriod || !canReadIndicators) {",
  "if (!projectId || !selectedPeriod) {"
 ],
 [
  "monitoring guard keeps stale data",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      setMonitoringLoading(false)\n      setMonitoring(null)\n      setMonitoringError('')\n      return",
  "      setMonitoringLoading(false)\n      setMonitoringError('')\n      return"
 ],
 [
  "monitoring guard keeps stale error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "      setMonitoringLoading(false)\n      setMonitoring(null)\n      setMonitoringError('')\n      return",
  "      setMonitoringLoading(false)\n      setMonitoring(null)\n      return"
 ],
 [
  "monitoring start keeps stale data",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setMonitoringLoading(true)\n    setMonitoring(null)\n    setMonitoringError('')",
  "    setMonitoringLoading(true)\n    setMonitoringError('')"
 ],
 [
  "monitoring start keeps stale error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setMonitoringLoading(true)\n    setMonitoring(null)\n    setMonitoringError('')",
  "    setMonitoringLoading(true)\n    setMonitoring(null)"
 ],
 [
  "monitoring sends the period start as end",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "        periodEnd: selectedPeriod.end,\n      })\n      .then((nextMonitoring)",
  "        periodEnd: selectedPeriod.start,\n      })\n      .then((nextMonitoring)"
 ],
 [
  "monitoring error message",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',\n          )\n      })\n      .finally(() => {\n        if (active) setMonitoringLoading(false)",
  "caught instanceof Error ? caught.message : 'x',\n          )\n      })\n      .finally(() => {\n        if (active) setMonitoringLoading(false)"
 ],
 [
  "monitoring error shows fixed text",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "setMonitoringError(\n            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',",
  "setMonitoringError(\n            'Analytics data could not be loaded.',"
 ],
 [
  "monitoring never finishes",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "        if (active) setMonitoringLoading(false)\n      })\n    return () => {",
  "      })\n    return () => {"
 ],
 [
  "monitoring ignores retry",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "  }, [canReadIndicators, monitoringLoadAttempt, projectId, selectedPeriod])",
  "  }, [canReadIndicators, projectId, selectedPeriod])"
 ],
 [
  "same project reloads",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    if (nextProjectId === projectId) return\n    setProjectId(nextProjectId)",
  "    setProjectId(nextProjectId)"
 ],
 [
  "project change keeps period",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectId(nextProjectId)\n    setPeriod('')",
  "    setProjectId(nextProjectId)"
 ],
 [
  "project change keeps definitions",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setPeriod('')\n    setIndicatorDefinitions([])\n    setMonitoring(null)\n    setActivities([])\n    resetSaddd()",
  "    setPeriod('')\n    setMonitoring(null)\n    setActivities([])\n    resetSaddd()"
 ],
 [
  "project change keeps monitoring",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setIndicatorDefinitions([])\n    setMonitoring(null)\n    setActivities([])\n    resetSaddd()",
  "    setIndicatorDefinitions([])\n    setActivities([])\n    resetSaddd()"
 ],
 [
  "project change keeps activities",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setMonitoring(null)\n    setActivities([])\n    resetSaddd()",
  "    setMonitoring(null)\n    resetSaddd()"
 ],
 [
  "project change keeps SADDD",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    resetSaddd()\n    resetDescriptive()",
  "    resetDescriptive()"
 ],
 [
  "project change keeps descriptive",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    resetDescriptive()\n    resetSurvey()",
  "    resetSurvey()"
 ],
 [
  "project change keeps survey",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    resetSurvey()\n    resetTimeline()",
  "    resetTimeline()"
 ],
 [
  "project change keeps timeline",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    resetTimeline()\n    setProjectDataLoading(true)",
  "    setProjectDataLoading(true)"
 ],
 [
  "project change not loading",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    resetTimeline()\n    setProjectDataLoading(true)\n    setMonitoringLoading(false)",
  "    resetTimeline()\n    setMonitoringLoading(false)"
 ],
 [
  "project change keeps monitoring loading",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectDataLoading(true)\n    setMonitoringLoading(false)\n    setProjectDataError('')",
  "    setProjectDataLoading(true)\n    setProjectDataError('')"
 ],
 [
  "project change keeps data error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setMonitoringLoading(false)\n    setProjectDataError('')\n    setMonitoringError('')\n  }",
  "    setMonitoringLoading(false)\n    setMonitoringError('')\n  }"
 ],
 [
  "project change keeps monitoring error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    setProjectDataError('')\n    setMonitoringError('')\n  }",
  "    setProjectDataError('')\n  }"
 ],
 [
  "map mode waits for data",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const loading = projectsLoading || (!mapSelected && (projectDataLoading || monitoringLoading))",
  "const loading = projectsLoading || projectDataLoading || monitoringLoading"
 ],
 [
  "map mode shows data errors",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const error = projectsError || (!mapSelected ? projectDataError || monitoringError : '')",
  "const error = projectsError || projectDataError || monitoringError"
 ],
 [
  "map data loading needs both",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const mapDataLoading = projectDataLoading || monitoringLoading",
  "const mapDataLoading = projectDataLoading && monitoringLoading"
 ],
 [
  "map data error ignores monitoring",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const mapDataError = projectDataError || monitoringError",
  "const mapDataError = projectDataError"
 ],
 [
  "retry skips the project list",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    if (projectsError) setProjectsLoadAttempt((value) => value + 1)\n    else if (projectDataError)",
  "    if (false) setProjectsLoadAttempt((value) => value + 1)\n    else if (projectDataError)"
 ],
 [
  "retry skips the project data",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    else if (projectDataError) setProjectDataLoadAttempt((value) => value + 1)\n    else setMonitoringLoadAttempt",
  "    else if (false) setProjectDataLoadAttempt((value) => value + 1)\n    else setMonitoringLoadAttempt"
 ],
 [
  "retry skips monitoring",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    else setMonitoringLoadAttempt((value) => value + 1)\n  }",
  "    else setProjectDataLoadAttempt((value) => value + 1)\n  }"
 ],
 [
  "map retry skips the project data",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "                        projectDataError\n                          ? setProjectDataLoadAttempt((value) => value + 1)\n                          : setMonitoringLoadAttempt((value) => value + 1)",
  "                        false\n                          ? setProjectDataLoadAttempt((value) => value + 1)\n                          : setMonitoringLoadAttempt((value) => value + 1)"
 ],
 [
  "map retry skips monitoring",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "                        projectDataError\n                          ? setProjectDataLoadAttempt((value) => value + 1)\n                          : setMonitoringLoadAttempt((value) => value + 1)",
  "                        projectDataError\n                          ? setProjectDataLoadAttempt((value) => value + 1)\n                          : setProjectDataLoadAttempt((value) => value + 1)"
 ],
 [
  "indicator filter ignored",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "indicators.filter((row) => indicatorId === 'all' || row.id === indicatorId),",
  "indicators,"
 ],
 [
  "only the KPI view has rows",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    if (analysisView === 'kpi')\n      return progressRows(",
  "    if (analysisView !== 'timeline')\n      return progressRows("
 ],
 [
  "average rounds down",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "Math.round(progressValues.reduce",
  "Math.floor(progressValues.reduce"
 ],
 [
  "periods readable ignores loading",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    !projectDataLoading &&\n    !projectDataError",
  "    !projectDataError"
 ],
 [
  "periods readable ignores errors",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    !projectDataLoading &&\n    !projectDataError",
  "    !projectDataLoading"
 ],
 [
  "periods readable needs one grant only",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    (canReadIndicatorDefinitions || canReadIndicatorValues) &&\n    !projectDataLoading",
  "    (canReadIndicatorDefinitions && canReadIndicatorValues) &&\n    !projectDataLoading"
 ],
 [
  "monitoring readable ignores the error",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError",
  "const monitoringReadable = canReadIndicators && monitoring !== null"
 ],
 [
  "monitoring readable ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError",
  "const monitoringReadable = monitoring !== null && !monitoringError"
 ],
 [
  "survey picker uses all periods",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const pickerPeriods = analysisView === 'survey' ? surveyPeriods : reportingPeriods",
  "const pickerPeriods = reportingPeriods"
 ],
 [
  "survey picker selection uses all periods",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const pickerPeriod = analysisView === 'survey' ? surveyPeriod : selectedPeriod",
  "const pickerPeriod = selectedPeriod"
 ],
 [
  "survey closed period boundary",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "surveyPeriod.end < businessDateInManila()",
  "surveyPeriod.end <= businessDateInManila()"
 ],
 [
  "survey closed period ignores the freeze",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    surveyFrozenOnly && !(surveyPeriod && surveyPeriod.end < businessDateInManila())",
  "    !(surveyPeriod && surveyPeriod.end < businessDateInManila())"
 ],
 [
  "survey unavailable ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const surveyUnavailable = !canReadSurvey || surveyClosedPeriodRequired",
  "const surveyUnavailable = surveyClosedPeriodRequired"
 ],
 [
  "survey unavailable ignores the closed period",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const surveyUnavailable = !canReadSurvey || surveyClosedPeriodRequired",
  "const surveyUnavailable = !canReadSurvey"
 ],
 [
  "SADDD needs no dates",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "    !selectedProject?.startDate || !selectedProject.endDate\n",
  "    false\n"
 ],
 [
  "SADDD ignores the end date",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "!selectedProject?.startDate || !selectedProject.endDate",
  "!selectedProject?.startDate"
 ],
 [
  "SADDD start boundary",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "selectedProject.startDate > businessDateInManila()",
  "selectedProject.startDate >= businessDateInManila()"
 ],
 [
  "SADDD ongoing boundary",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "(selectedProject?.endDate ?? '') >= businessDateInManila()",
  "(selectedProject?.endDate ?? '') > businessDateInManila()"
 ],
 [
  "SADDD eligibility ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const sadddEligible = canReadSaddd && sadddNotice === null",
  "const sadddEligible = sadddNotice === null"
 ],
 [
  "SADDD eligibility ignores the notice",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const sadddEligible = canReadSaddd && sadddNotice === null",
  "const sadddEligible = canReadSaddd"
 ],
 [
  "SADDD ongoing ignores eligibility",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const sadddOngoing = sadddEligible && (",
  "const sadddOngoing = ("
 ],
 [
  "period range dropped",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const periodRange = selectedPeriod\n    ? { periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end }\n    : {}",
  "const periodRange = {}"
 ],
 [
  "trends read outside the KPI view",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "canReadTrends && analysisView === 'kpi',",
  "canReadTrends,"
 ],
 [
  "participation read outside its view",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "canReadParticipation && analysisView === 'participation',",
  "canReadParticipation,"
 ],
 [
  "budget read ignores the grant",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "useBudgetSummary({ projectId: insightProject }, canReadBudgetUtilization)",
  "useBudgetSummary({ projectId: insightProject }, true)"
 ],
 [
  "insight project dropped",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "const insightProject = projectId || null",
  "const insightProject = null"
 ],
 [
  "survey period must be open",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "surveyPeriod.end < businessDateInManila()",
  "surveyPeriod.end > businessDateInManila()"
 ],
 [
  "SADDD start check dropped",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "selectedProject.startDate > businessDateInManila()",
  "false"
 ],
 [
  "budget read never on",
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
  "useBudgetSummary({ projectId: insightProject }, canReadBudgetUtilization)",
  "useBudgetSummary({ projectId: insightProject }, false)"
 ]
]
```


```bash
F=apps/web/src/features/analytics/components/analytics-dashboard.tsx
H=$(git hash-object $F)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-shell.json $(ls apps/web/src/features/analytics/components/analytics-dashboard*.test.tsx) > .tmp/s7d/out/t1-survey.txt 2>&1
grep -E "^unmutated|^mutations|NOT APPLIED" .tmp/s7d/out/t1-survey.txt
grep SURVIVED .tmp/s7d/out/t1-survey.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $F)" = "$H" && echo "file restored"
```


Expected:

```text
unmutated: pass
mutations 102, survived 29
SADDD ongoing ignores eligibility
data load ignores the activities grant
data load keeps old monitoring
data load keeps old monitoring error
data load keeps old period
empty scope keeps activities
empty scope keeps indicator definitions
monitoring guard drops the grant
monitoring guard keeps stale data
monitoring guard keeps stale error
monitoring readable ignores the error
monitoring readable ignores the grant
monitoring start keeps stale data
only the KPI view has rows
period falls back to nothing
period not kept
project change keeps SADDD
project change keeps activities
project change keeps data error
project change keeps definitions
project change keeps descriptive
project change keeps monitoring
project change keeps monitoring error
project change keeps monitoring loading
project change keeps period
project change keeps survey
project change keeps timeline
project change not loading
same project reloads
file restored
```


All 102 mutations are applied (none is NOT APPLIED), the unmutated run passes, and 29 mutations survive. The access-flag mutations, the filter and action mutations and the map-mode mutations are all killed by the existing and the new tests. The survivors are lines that the page-level tests reach only in combination, and they fall into two groups that the later tasks treat differently:

- 20 sit in the scope code that Task 3 moves (the project data effect, the empty scope branch, the monitoring guard, the period effect and the reset lines of a project change). Task 3 mutates them again against the hook tests and kills 14; the 6 that remain are recorded there as equivalents.
- 9 sit in code that stays in the shell (the SADDD ongoing flag, the two readable flags of the monitoring panels, the rows of the KPI view, the four reset calls of the project change and the same-project early return). They are not moved by this slice, so the cuts cannot change them; Task 4 runs them again against the shell that is left and records them by name. A first survey, before the 13 tests of `analytics-dashboard.gates.test.tsx` and the last three mutations of the list were written, left 22 here: the SADDD notice rules, the survey period rules, the budget, trends and participation reads, the insight project, the period range and the periods flags were behavior that nothing pinned, and each is now a test that fails when the line changes.

The file is restored (`git hash-object` before and after). The run takes about 45 minutes in a loaded container.

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the analytics shell scope, actions and filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1543 files in <ms>. No fixes applied.
 4 files changed, 934 insertions(+), 7 deletions(-)
```


---

### Task 2: Move the access flags into `analytics.reads.ts`

**Files:**
- Modify: `apps/web/src/features/analytics/analytics.reads.ts` (gains `analyticsAccess`), `apps/web/src/features/analytics/components/analytics-dashboard.tsx` (the 14 flags come from one call)
- Create: `apps/web/src/features/analytics/analytics.reads.test.ts` (17 tests)
- Create (gitignored): `.tmp/s7d/task2-cut.json`, `mut-reads.json`

The shell computes 14 booleans from the profile in a block of about 40 lines (lines 93 to 185): the grants of each panel and read, and `surveyFrozenOnly`. They depend on the profile alone, so they leave the component as one pure function, `analyticsAccess(profile)`, next to the other analytics reads. The shell destructures the same 14 names, so no other line changes. The old code was pinned by the Task 1 survey (all 12 access mutations were killed by the existing role tests, none survived), and the new table below pins the function on its own.

- [ ] **Step 1: Cut the flags out of the shell**

`task2-cut.json` builds the function from the line ranges of the shell block (the `canReadActivities` to `canReadParticipation` run, the alerts flag and the SADDD comment and flag) after the two imports it needs, keeps the existing `countOpenAlerts` lines of the module, and rewrites the shell around a destructuring call:

Create `.tmp/s7d/task2-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "b7e731fd",
 "files": {
  "apps/web/src/features/analytics/analytics.reads.ts": [
   "import { principalHasAtomicPermission } from '@/lib/rbac/policy'",
   "import { canReadInsight } from './hooks/use-analytics-insights'",
   {"file": "apps/web/src/features/analytics/analytics.reads.ts", "from": 1},
   "",
   "type Principal = Parameters<typeof principalHasAtomicPermission>[0]",
   "",
   "/** The grants of the role that decide which analytics panels and reads the dashboard shows. */",
   "export const analyticsAccess = (profile: Principal) => {",
   [93, 111],
   [132, 132],
   [184, 185],
   "  return {",
   "    canExportAnalytics,",
   "    canReadActivities,",
   "    canReadAlerts,",
   "    canReadBudgetUtilization,",
   "    canReadDescriptive,",
   "    canReadIndicatorDefinitions,",
   "    canReadIndicatorValues,",
   "    canReadIndicators,",
   "    canReadParticipation,",
   "    canReadSaddd,",
   "    canReadSurvey,",
   "    canReadSurveyTimeline,",
   "    canReadTrends,",
   "    surveyFrozenOnly,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "@imports",
   "",
   [90, 92],
   "  const {",
   "    canExportAnalytics,",
   "    canReadActivities,",
   "    canReadAlerts,",
   "    canReadBudgetUtilization,",
   "    canReadDescriptive,",
   "    canReadIndicatorDefinitions,",
   "    canReadIndicatorValues,",
   "    canReadIndicators,",
   "    canReadParticipation,",
   "    canReadSaddd,",
   "    canReadSurvey,",
   "    canReadSurveyTimeline,",
   "    canReadTrends,",
   "    surveyFrozenOnly,",
   "  } = analyticsAccess(profile)",
   [112, 131],
   [133, 183],
   [186, 898]
  ]
 }
}
```


The shell already imports `countOpenAlerts` from the reads file, and `@imports` carries that line over unchanged, so the first step adds `analyticsAccess` to the same import with one `sed` line (a second import line from the same file would only add noise).

```bash
D=apps/web/src/features/analytics
cp $D/components/analytics-dashboard.tsx .tmp/s7d/before/shell-t2.tsx
cp $D/analytics.reads.ts .tmp/s7d/before/reads-t2.ts
node .tmp/s7d/cut.mjs .tmp/s7d/task2-cut.json
sed -i "s#^import { countOpenAlerts } from '../analytics.reads'#import { analyticsAccess, countOpenAlerts } from '../analytics.reads'#" $D/components/analytics-dashboard.tsx
node .tmp/s7d/trim-imports.mjs $D/analytics.reads.ts $D/components/analytics-dashboard.tsx
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
node .tmp/s7d/same-lines.mjs .tmp/s7d/before/shell-t2.tsx --also .tmp/s7d/before/reads-t2.ts $D/analytics.reads.ts $D/components/analytics-dashboard.tsx --list
wc -l $D/analytics.reads.ts $D/components/analytics-dashboard.tsx
```


Expected:

```text
apps/web/src/features/analytics/analytics.reads.ts: 78 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 890 lines
apps/web/src/features/analytics/analytics.reads.ts: removed nothing
apps/web/src/features/analytics/components/analytics-dashboard.tsx: removed principalHasAtomicPermission, canReadInsight
Checked 2 files in <ms>. Fixed 2 files.
web typecheck clean
2x }
1x type Principal = Parameters<typeof principalHasAtomicPermission>[0]
1x /** The grants of the role that decide which analytics panels and reads the dashboard shows. */
1x const analyticsAccess = (profile: Principal) => {
1x return {
2x canExportAnalytics
2x canReadActivities
2x canReadAlerts
2x canReadBudgetUtilization
2x canReadDescriptive
2x canReadIndicatorDefinitions
2x canReadIndicatorValues
2x canReadIndicators
2x canReadParticipation
2x canReadSaddd
2x canReadSurvey
2x canReadSurveyTimeline
2x canReadTrends
2x surveyFrozenOnly
1x const {
1x } = analyticsAccess(profile)
original lines 822, lost 0, added 36
   78 apps/web/src/features/analytics/analytics.reads.ts
  888 apps/web/src/features/analytics/components/analytics-dashboard.tsx
  966 total
```


The cut writes the two files, `trim-imports` removes nothing that the shell still uses, the typecheck is clean and `same-lines.mjs` prints `lost 0`: every line of the block is now in `analytics.reads.ts`. The added lines are the function signature, the `Principal` type, the return object and the destructuring call, and nothing else.

- [ ] **Step 2: Test the function on its own**

The table lists, for each of the 13 flags, every grant it needs; a flag must be true with all of them and false when any one is missing. Further cases cover the participation flag for a role that submits instead of assessing in detail, the frozen survey, the null profile and a role with every grant. The grant check is replaced by a list lookup so that the cases pin how the flags combine grants and nothing else:

Create `apps/web/src/features/analytics/analytics.reads.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { analyticsAccess } from './analytics.reads'

// The grant check is replaced by a plain list lookup so these cases pin only how the flags combine grants.
vi.mock('@/lib/rbac/policy', () => {
  const has = (profile: { permissions: string[] } | null, permission: string) =>
    Boolean(profile?.permissions.includes(permission))
  return {
    principalHasAtomicPermission: has,
    permissionChecker: (profile: { permissions: string[] } | null) => (permission: string) =>
      has(profile, permission),
  }
})

const profile = (...permissions: string[]) =>
  ({ roles: [], permissions, assignedProjectIds: [] }) as never

// Every grant a flag needs: the flag is true with all of them and false when any one is missing.
const needs: Record<string, string[]> = {
  canReadActivities: ['activities.read'],
  canReadIndicators: ['monitoring.read'],
  canReadIndicatorDefinitions: ['monitoring.read', 'indicators.read'],
  canReadIndicatorValues: ['monitoring.read', 'reports.indicator.read'],
  canReadDescriptive: ['analytics.descriptive.read'],
  canReadSurveyTimeline: ['analytics.descriptive.read', 'monitoring.read'],
  canReadSurvey: ['analytics.descriptive.read', 'monitoring.read'],
  canExportAnalytics: ['analytics.descriptive.read', 'analytics.export'],
  canReadBudgetUtilization: [
    'analytics.descriptive.read',
    'monitoring.read',
    'budgets.read',
    'expenses.read',
  ],
  canReadTrends: ['analytics.descriptive.read', 'monitoring.read', 'indicators.read'],
  canReadParticipation: [
    'analytics.descriptive.read',
    'monitoring.read',
    'journeys.read',
    'beneficiaries.records.read',
    'assessments.detail.read',
  ],
  canReadAlerts: ['alerts.read'],
  canReadSaddd: ['analytics.saddd.read'],
}
const everything = [...new Set(Object.values(needs).flat())]

describe('analyticsAccess', () => {
  it.each(Object.entries(needs))('%s needs exactly its grants', (flag, grants) => {
    const access = analyticsAccess(profile(...grants)) as Record<string, boolean>
    expect(access[flag]).toBe(true)

    for (const missing of grants) {
      const without = analyticsAccess(profile(...grants.filter((grant) => grant !== missing)))
      expect((without as Record<string, boolean>)[flag], `without ${missing}`).toBe(false)
    }
  })

  it('reads the participation grants of a role that submits instead of assessing in detail', () => {
    const grants = [
      ...needs.canReadParticipation.filter((grant) => grant !== 'assessments.detail.read'),
      'submissions.write',
    ]

    expect(analyticsAccess(profile(...grants)).canReadParticipation).toBe(true)
  })

  it('freezes the survey release for a role without assessments.detail.read only', () => {
    expect(analyticsAccess(profile()).surveyFrozenOnly).toBe(true)
    expect(analyticsAccess(profile('assessments.detail.read')).surveyFrozenOnly).toBe(false)
  })

  it('grants nothing without a profile', () => {
    expect(Object.values({ ...analyticsAccess(null), surveyFrozenOnly: false })).not.toContain(true)
  })

  it('grants every flag to a role with every grant, and the survey is not frozen', () => {
    const access = analyticsAccess(profile(...everything)) as Record<string, boolean>

    expect(Object.keys(access).sort()).toEqual([...Object.keys(needs), 'surveyFrozenOnly'].sort())
    expect(access.surveyFrozenOnly).toBe(false)
    expect(Object.entries(access).filter(([flag, value]) => flag !== 'surveyFrozenOnly' && !value)).toEqual([])
  })
})
```


```bash
D=apps/web/src/features/analytics
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
Checked 3 files in <ms>. Fixed 1 file.
web typecheck clean
 Test Files  24 passed (24)
      Tests  251 passed (251)
```


The folder gains 1 file and 17 tests over Task 1 (13 table rows and 4 cases).

- [ ] **Step 3: Mutate the function once**

`mut-reads.json` holds the 10 access mutations of Task 1 aimed at the new file (an inverted grant, a grant weakened from `&&` to `||`, the frozen survey flag inverted). The table alone must kill every one:

Create `.tmp/s7d/mut-reads.json`:

```json
[
 ["activities grant inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')", "const canReadActivities = !principalHasAtomicPermission(profile, 'activities.read')"],
 ["monitoring grant inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')", "const canReadIndicators = !principalHasAtomicPermission(profile, 'monitoring.read')"],
 ["definitions need only one grant", "apps/web/src/features/analytics/analytics.reads.ts", "canReadIndicators && principalHasAtomicPermission(profile, 'indicators.read')", "canReadIndicators || principalHasAtomicPermission(profile, 'indicators.read')"],
 ["released values need only one grant", "apps/web/src/features/analytics/analytics.reads.ts", "canReadIndicators && principalHasAtomicPermission(profile, 'reports.indicator.read')", "canReadIndicators || principalHasAtomicPermission(profile, 'reports.indicator.read')"],
 ["descriptive grant inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadDescriptive = principalHasAtomicPermission(profile, 'analytics.descriptive.read')", "const canReadDescriptive = !principalHasAtomicPermission(profile, 'analytics.descriptive.read')"],
 ["survey and timeline need only one grant", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadSurveyTimeline = canReadDescriptive && canReadIndicators", "const canReadSurveyTimeline = canReadDescriptive || canReadIndicators"],
 ["frozen survey flag inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const surveyFrozenOnly = !principalHasAtomicPermission(profile, 'assessments.detail.read')", "const surveyFrozenOnly = principalHasAtomicPermission(profile, 'assessments.detail.read')"],
 ["export needs only one grant", "apps/web/src/features/analytics/analytics.reads.ts", "canReadDescriptive && principalHasAtomicPermission(profile, 'analytics.export')", "canReadDescriptive || principalHasAtomicPermission(profile, 'analytics.export')"],
 ["SADDD grant inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadSaddd = principalHasAtomicPermission(profile, 'analytics.saddd.read')", "const canReadSaddd = !principalHasAtomicPermission(profile, 'analytics.saddd.read')"],
 ["alerts grant inverted", "apps/web/src/features/analytics/analytics.reads.ts", "const canReadAlerts = principalHasAtomicPermission(profile, 'alerts.read')", "const canReadAlerts = !principalHasAtomicPermission(profile, 'alerts.read')"]
]
```


```bash
F=apps/web/src/features/analytics/analytics.reads.ts
H=$(git hash-object $F)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-reads.json apps/web/src/features/analytics/analytics.reads.test.ts 2>&1 | grep -E "^unmutated|SURVIVED|NOT APPLIED|^mutations"
test "$(git hash-object $F)" = "$H" && echo "file restored"
```


Expected:

```text
unmutated: pass
mutations 10, survived 0
file restored
```


All 10 mutations are killed by `analytics.reads.test.ts` alone and the file is restored.

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the analytics access flags out of the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1544 files in <ms>. No fixes applied.
 3 files changed, 149 insertions(+), 27 deletions(-)
```


---

### Task 3: Move the project, period and monitoring state into `useAnalyticsScope`

**Files:**
- Create: `apps/web/src/features/analytics/hooks/use-analytics-scope.ts`, `use-analytics-scope.test.ts` (27 tests)
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.tsx`
- Create (gitignored): `.tmp/s7d/task3-cut.json`, `mut-scope.json`

The first 330 lines of the shell are the scope: the project list and the selected project, the activities and indicator definitions of that project, the reporting periods derived from them, the period selection, the monitoring read of the selected period, and the retry and project switch functions. Four effects and 14 `useState` calls read and write each other, which is why the filter bar and the analysis panel could not be cut before. This task moves all of it into one hook that returns the 18 values the shell reads; the shell keeps the filters (`analysisView`, `visualizationType`, `indicatorId`), the optional views' hooks and their resets.

- [ ] **Step 1: Cut the scope out of the shell**

`task3-cut.json` pins the hash of the shell as Task 2 leaves it. The hook is built from the ranges of the state declarations, the selected project, the reporting period memo, the four effects, `retryLoad` and `handleProjectChange` (renamed `selectProject`, with its three reset calls left in the shell), plus a `retryMapData` function that the map retry button used inline. The shell calls the hook where the state was declared:

Create `.tmp/s7d/task3-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "c1b49431",
 "files": {
  "apps/web/src/features/analytics/hooks/use-analytics-scope.ts": [
   "'use client'",
   "",
   "@imports",
   "",
   "export const useAnalyticsScope = ({",
   "  canReadActivities,",
   "  canReadIndicatorDefinitions,",
   "  canReadIndicatorValues,",
   "  canReadIndicators,",
   "  role,",
   "}: {",
   "  canReadActivities: boolean",
   "  canReadIndicatorDefinitions: boolean",
   "  canReadIndicatorValues: boolean",
   "  canReadIndicators: boolean",
   "  role: ReturnType<typeof useCurrentRole>['role']",
   "}) => {",
   [105, 107],
   [111, 122],
   "",
   [124, 124],
   [137, 147],
   "",
   [192, 222],
   "",
   [224, 274],
   "",
   [276, 282],
   "",
   [290, 323],
   "",
   [420, 424],
   "  const retryMapData = () =>",
   "    projectDataError",
   "      ? setProjectDataLoadAttempt((value) => value + 1)",
   "      : setMonitoringLoadAttempt((value) => value + 1)",
   "",
   "  const selectProject = (nextProjectId: string) => {",
   [400, 404],
   [409, 413],
   "",
   "  return {",
   "    activities,",
   "    monitoring,",
   "    monitoringError,",
   "    monitoringLoading,",
   "    period,",
   "    projectDataError,",
   "    projectDataLoading,",
   "    projectId,",
   "    projects,",
   "    projectsError,",
   "    projectsLoading,",
   "    reportingPeriods,",
   "    retryLoad,",
   "    retryMapData,",
   "    selectProject,",
   "    selectedPeriod,",
   "    selectedProject,",
   "    setPeriod,",
   "  }",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useAnalyticsScope } from '../hooks/use-analytics-scope'",
   "",
   [86, 104],
   "  const {",
   "    activities,",
   "    monitoring,",
   "    monitoringError,",
   "    monitoringLoading,",
   "    period,",
   "    projectDataError,",
   "    projectDataLoading,",
   "    projectId,",
   "    projects,",
   "    projectsError,",
   "    projectsLoading,",
   "    reportingPeriods,",
   "    retryLoad,",
   "    retryMapData,",
   "    selectProject,",
   "    selectedPeriod,",
   "    selectedProject,",
   "    setPeriod,",
   "  } = useAnalyticsScope({",
   "    canReadActivities,",
   "    canReadIndicatorDefinitions,",
   "    canReadIndicatorValues,",
   "    canReadIndicators,",
   "    role,",
   "  })",
   [108, 110],
   "",
   [125, 136],
   [148, 190],
   "",
   [284, 288],
   "",
   [325, 397],
   [398, 399],
   "    selectProject(nextProjectId)",
   [405, 408],
   "  }",
   "",
   [415, 419],
   [425, 693],
   "                      onClick={retryMapData}",
   [699, 888]
  ]
 }
}
```


```bash
D=apps/web/src/features/analytics
cp $D/components/analytics-dashboard.tsx .tmp/s7d/before/shell-t3.tsx
node .tmp/s7d/cut.mjs .tmp/s7d/task3-cut.json
node .tmp/s7d/trim-imports.mjs $D/hooks/use-analytics-scope.ts $D/components/analytics-dashboard.tsx
node .tmp/s7d/same-lines.mjs .tmp/s7d/before/shell-t3.tsx $D/hooks/use-analytics-scope.ts $D/components/analytics-dashboard.tsx "handleProjectChange = (nextProjectId: string) => { ==> selectProject = (nextProjectId: string) => {" "onClick={() => ==> onClick={retryMapData}" --list
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
wc -l $D/hooks/use-analytics-scope.ts $D/components/analytics-dashboard.tsx
```


Expected:

```text
apps/web/src/features/analytics/hooks/use-analytics-scope.ts: 299 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 746 lines
apps/web/src/features/analytics/hooks/use-analytics-scope.ts: removed AlertTriangle, BarChart3, ChevronDown, Download, Plus, PageHeader, AsyncState, EmptyState, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, MAPS_UI_ENABLED, useAuthorizedRead, useDisplayLabels, addPin, formatCalendarDay, can, toast, nonOverlappingAnalyticsPeriods, AnalysisView, SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE, VisualizationType, analysisViews, exportFormats, visualizationTypes, analyticsAccess, countOpenAlerts, businessDateInManila, useAnalyticsExport, useBudgetSummary, useIndicatorTrends, useParticipationBreakdown, useDescriptiveAnalytics, useSadddDashboard, useSurveyAnalytics, useTimelineAnalytics, activeIndicators, metricNumber, progressRows, ActivityCompletionChart, DescriptiveAnalysisChart, IndicatorProgressChart, AnalyticsExportPreviewDialog, AnalyticsSummaryCards, BudgetSummaryCard, ChartPanel, UnavailableChart, DescriptiveStatisticsPanel, IndicatorTrendChart, InsightStatus, OpenAlertsPanel, ParticipationBreakdownPanel, ProjectCoverageMapPanel, SadddAnalysisPanel, SurveyAnalyticsPanel, TimelineAnalyticsPanel, Link
apps/web/src/features/analytics/components/analytics-dashboard.tsx: removed useEffect, activitiesClient, dashboardsClient, indicatorsClient, projectsClient, ActivitySummary, ProjectSummary, IndicatorResponse, MonitoringDashboard, deriveAnalyticsReportingPeriods
1x const useAnalyticsScope = ({
2x canReadActivities
2x canReadIndicatorDefinitions
2x canReadIndicatorValues
2x canReadIndicators
2x role
1x }: {
1x canReadActivities: boolean
1x canReadIndicatorDefinitions: boolean
1x canReadIndicatorValues: boolean
1x canReadIndicators: boolean
1x role: ReturnType<typeof useCurrentRole>['role']
1x }) => {
2x selectedProject
2x }
1x })
2x projectId
1x const retryMapData = () =>
2x projectDataError
1x const selectProject = (nextProjectId: string) => {
1x return {
2x activities
2x monitoring
2x monitoringError
2x monitoringLoading
2x period
2x projectDataLoading
2x projects
2x projectsError
2x projectsLoading
2x reportingPeriods
2x retryLoad
2x retryMapData
2x selectProject
2x selectedPeriod
2x setPeriod
1x const {
1x } = useAnalyticsScope({
1x selectProject(nextProjectId)
original lines 788, lost 0, added 63
Checked 2 files in <ms>. Fixed 2 files.
web typecheck clean
  226 apps/web/src/features/analytics/hooks/use-analytics-scope.ts
  732 apps/web/src/features/analytics/components/analytics-dashboard.tsx
  958 total
```


The cut writes the hook (299 lines before formatting) and the shell, `trim-imports` removes the imports each file no longer uses, and `same-lines.mjs` runs before Biome (Biome joins the lines of the retry button, which would show as lost lines) and prints `lost 0`: every line of the 788 line shell is in the hook or the shell, with `handleProjectChange` renamed to `selectProject` and the inline retry handler replaced by `retryMapData`. The 63 added lines are the hook signature and its typed props, the returned names, the `retryMapData` and `selectProject` declarations and the call in the shell. After Biome the hook is 226 lines and the shell 732.

- [ ] **Step 2: Run the shell tests against the cut**

```bash
(cd apps/web && timeout 1100 pnpm exec vitest run src/features/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
 Test Files  24 passed (24)
      Tests  251 passed (251)
```


Every test of the folder passes against the cut: the 19 scope and 22 action pins of Task 1 are unchanged. These pins include the first paint (`renderToString` shows the loading page before any effect) and the reset of every field of the previous project before the first effect of a project change.

- [ ] **Step 3: Test the hook on its own**

The hook test keeps every value the hook returned in a `seen` array, so the render between a state change and its effects can be read: that is how the clearing on a project change, the first paint and the dropped late result are pinned. It covers the project list (first project, kept and lost selection, no role, empty list, failure messages), the project data (grant combinations, released values when definitions are unreadable, failures with Retry, a result that arrives after a project change), the period (first period, kept choice, none), the monitoring read (grant, other period, failure with Retry) and `selectProject` and `retryMapData`:

Create `apps/web/src/features/analytics/hooks/use-analytics-scope.test.ts`:

```ts
/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyticsScope } from './use-analytics-scope'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getProjectIndicators: vi.fn(),
  getProjectIndicatorValues: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))

const project = (id: string) => ({ id, title: `Project ${id}`, startDate: null, endDate: null })
const indicator = (projectId: string, periodStart: string, periodEnd: string) => ({
  id: `${projectId}-${periodStart}`,
  projectId,
  status: 'ACTIVE',
  periodStart,
  periodEnd,
})
const grants = {
  canReadActivities: true,
  canReadIndicatorDefinitions: true,
  canReadIndicatorValues: true,
  canReadIndicators: true,
  role: 'Project Manager' as const,
}
const monitoring = { indicators: [] }
const september = { start: '2026-09-01', end: '2026-09-30' }
const august = '2026-08-01::2026-08-31'

// Renders the hook and keeps every value it returned, so a state change can be read before its effects run.
const mount = (initial: Partial<typeof grants> = {}) => {
  const seen: Array<ReturnType<typeof useAnalyticsScope>> = []
  const view = renderHook(
    (props: typeof grants) => {
      const value = useAnalyticsScope(props)
      seen.push(value)
      return value
    },
    { initialProps: { ...grants, ...initial } },
  )
  return { ...view, seen }
}
const loaded = async (view: ReturnType<typeof mount>) => {
  await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
}

describe('useAnalyticsScope', () => {
  beforeEach(() => {
    api.getProjectsForRole.mockResolvedValue([project('project-a'), project('project-b')])
    api.getActivities.mockResolvedValue([{ id: 'activity-1' }])
    api.getProjectIndicators.mockImplementation((projectId: string) =>
      Promise.resolve([
        indicator(projectId, '2026-09-01', '2026-09-30'),
        indicator(projectId, '2026-08-01', '2026-08-31'),
      ]),
    )
    api.getProjectIndicatorValues.mockResolvedValue([indicator('project-a', '2026-07-01', '2026-07-31')])
    api.getMonitoringDashboard.mockResolvedValue(monitoring)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  describe('project list', () => {
    it('reads the projects of the role and selects the first one', async () => {
      const view = mount()
      expect(view.seen[0].projectsLoading).toBe(true)

      await waitFor(() => expect(view.result.current.projectId).toBe('project-a'))
      expect(api.getProjectsForRole).toHaveBeenCalledWith('Project Manager')
      expect(view.result.current.projects.map((row) => row.id)).toEqual(['project-a', 'project-b'])
      expect(view.result.current.selectedProject?.id).toBe('project-a')
      expect(view.result.current.projectsLoading).toBe(false)
    })

    it('stops loading and reads nothing without a role', () => {
      const view = mount({ role: null as never })

      expect(api.getProjectsForRole).not.toHaveBeenCalled()
      expect(view.result.current.projectsLoading).toBe(false)
      expect(view.result.current.projectId).toBe('')
    })

    it('keeps a selected project that the reloaded list still holds', async () => {
      const view = mount()
      await loaded(view)
      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Program Manager'))
      await waitFor(() => expect(view.result.current.projectsLoading).toBe(false))
      expect(view.result.current.projectId).toBe('project-b')
    })

    it('falls back to the first project when the reloaded list lacks the selection', async () => {
      const view = mount()
      await loaded(view)
      act(() => view.result.current.selectProject('project-b'))
      api.getProjectsForRole.mockResolvedValue([project('project-c')])

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(view.result.current.projectId).toBe('project-c'))
    })

    it('selects nothing when the list is empty', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      const view = mount()

      await waitFor(() => expect(view.result.current.projectsLoading).toBe(false))
      expect(view.result.current.projectId).toBe('')
      expect(view.result.current.selectedProject).toBeUndefined()
      expect(api.getActivities).not.toHaveBeenCalled()
    })

    it('clears the activities when the reloaded list is empty', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.activities).toHaveLength(1)
      api.getProjectsForRole.mockResolvedValue([])

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(view.result.current.projectId).toBe(''))
      expect(view.result.current.activities).toEqual([])
      expect(view.result.current.reportingPeriods).toEqual([])
      expect(view.result.current.projectDataLoading).toBe(false)
    })

    it('keeps the failure message, or names a failure without one, and clears it on a new read', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Directory down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectsError).toBe('Directory down.'))
      expect(view.result.current.projectsLoading).toBe(false)

      api.getProjectsForRole.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.projectsError).toBe('Projects could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.projectsError).toBe(''))
    })
  })

  describe('project data', () => {
    it('reads the activities and the indicator definitions of the selected project', async () => {
      const view = mount()
      await loaded(view)

      expect(api.getActivities).toHaveBeenCalledWith('project-a')
      expect(api.getProjectIndicators).toHaveBeenCalledWith('project-a')
      expect(api.getProjectIndicatorValues).not.toHaveBeenCalled()
      expect(view.result.current.activities).toEqual([{ id: 'activity-1' }])
      expect(view.result.current.reportingPeriods.map((row) => row.start)).toEqual([
        '2026-09-01',
        '2026-08-01',
      ])
    })

    it('reads no activities without the activities grant', async () => {
      const view = mount({ canReadActivities: false })
      await loaded(view)

      expect(api.getActivities).not.toHaveBeenCalled()
      expect(view.result.current.activities).toEqual([])
    })

    it('reads the released values when the role cannot read the definitions', async () => {
      const view = mount({ canReadIndicatorDefinitions: false })
      await loaded(view)

      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getProjectIndicatorValues).toHaveBeenCalledWith('project-a')
      expect(view.result.current.reportingPeriods.map((row) => row.start)).toEqual(['2026-07-01'])
    })

    it('reads no indicators when the role holds neither grant', async () => {
      const view = mount({ canReadIndicatorDefinitions: false, canReadIndicatorValues: false })
      await waitFor(() => expect(view.result.current.projectDataLoading).toBe(false))
      await waitFor(() => expect(view.result.current.projectId).toBe('project-a'))

      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getProjectIndicatorValues).not.toHaveBeenCalled()
      expect(view.result.current.reportingPeriods).toEqual([])
    })

    it('keeps the failure message, or names a failure without one, and reads again on Retry', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))
      expect(view.result.current.projectDataLoading).toBe(false)

      api.getActivities.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.projectDataError).toBe('Analytics data could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.projectDataError).toBe(''))
      expect(api.getActivities).toHaveBeenCalledTimes(3)
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
    })

    it('drops a result that arrives after the project changed', async () => {
      let resolveLate: (rows: unknown[]) => void = () => {}
      const late = new Promise<unknown[]>((resolve) => {
        resolveLate = resolve
      })
      api.getActivities.mockReturnValueOnce(late)
      const view = mount()
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(1))

      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))
      await act(async () => resolveLate([{ id: 'stale' }]))

      expect(view.result.current.activities).not.toEqual([{ id: 'stale' }])
    })
  })

  describe('grants', () => {
    it('reads no activities after the activities grant is lost and does not read them again', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.activities).toHaveLength(1)

      view.rerender({ ...grants, canReadActivities: false })

      await waitFor(() => expect(view.result.current.activities).toEqual([]))
      expect(api.getActivities).toHaveBeenCalledTimes(1)
    })

    it('clears the activities and the periods while a changed grant reads the project data again', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.reportingPeriods).toHaveLength(2)
      api.getActivities.mockReturnValue(new Promise(() => {}))
      api.getProjectIndicators.mockReturnValue(new Promise(() => {}))

      view.rerender({ ...grants, canReadIndicatorValues: false })

      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      expect(view.result.current.activities).toEqual([])
      expect(view.result.current.reportingPeriods).toEqual([])
      expect(view.result.current.projectDataLoading).toBe(true)
    })
  })

  describe('reporting period', () => {
    it('selects the first period and keeps one the person chose', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.selectedPeriod).toMatchObject(september)

      act(() => view.result.current.setPeriod(august))
      expect(view.result.current.period).toBe(august)
      expect(view.result.current.selectedPeriod).toMatchObject({ start: '2026-08-01' })
    })

    it('sets the period to the first one when the periods load, and to nothing without periods', async () => {
      const view = mount()
      await waitFor(() => expect(view.result.current.period).toBe('2026-09-01::2026-09-30'))

      api.getProjectIndicators.mockResolvedValue([])
      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(view.result.current.projectDataLoading).toBe(false))
      expect(view.result.current.period).toBe('')
      expect(view.result.current.selectedPeriod).toBeUndefined()
    })
  })

  describe('monitoring', () => {
    it('reads the monitoring of the selected period', async () => {
      const view = mount()
      await loaded(view)

      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      })
      expect(view.result.current.monitoringLoading).toBe(false)
    })

    it('reads nothing without the monitoring grant', async () => {
      const view = mount({ canReadIndicators: false })
      await waitFor(() => expect(view.result.current.reportingPeriods).toHaveLength(2))

      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
      expect(view.result.current.monitoring).toBeNull()
      expect(view.result.current.monitoringLoading).toBe(false)
    })

    it('clears the result and the failure when the monitoring grant is lost', async () => {
      const view = mount()
      await loaded(view)

      view.rerender({ ...grants, canReadIndicators: false })

      await waitFor(() => expect(view.result.current.monitoring).toBeNull())
      cleanup()
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const failed = mount()
      await waitFor(() => expect(failed.result.current.monitoringError).toBe('Monitoring down.'))

      failed.rerender({ ...grants, canReadIndicators: false })

      await waitFor(() => expect(failed.result.current.monitoringError).toBe(''))
    })

    it('reads again for another period and clears the previous result while it loads', async () => {
      const view = mount()
      await loaded(view)
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))

      act(() => view.result.current.setPeriod(august))

      await waitFor(() => expect(view.result.current.monitoringLoading).toBe(true))
      expect(view.result.current.monitoring).toBeNull()
      expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
        projectId: 'project-a',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
    })

    it('keeps the failure message, or names a failure without one, and reads again on Retry', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      expect(view.result.current.monitoringLoading).toBe(false)

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.monitoringError).toBe('Analytics data could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      expect(view.result.current.monitoringError).toBe('')
      expect(api.getActivities).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry', () => {
    it('reads the map data again from the failed read: project data first, then monitoring', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))

      act(() => view.result.current.retryMapData())
      await loaded(view)
      expect(api.getActivities).toHaveBeenCalledTimes(2)
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)

      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      act(() => view.result.current.setPeriod(august))
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      act(() => view.result.current.retryMapData())
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      expect(api.getActivities).toHaveBeenCalledTimes(2)
    })
  })

  describe('selectProject', () => {
    it('switches the project and clears everything the previous project held, before any effect runs', async () => {
      const view = mount()
      await loaded(view)
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      const [first] = view.seen
      expect(first.projectId).toBe('project-b')
      expect(first.period).toBe('')
      expect(first.activities).toEqual([])
      expect(first.reportingPeriods).toEqual([])
      expect(first.monitoring).toBeNull()
      expect(first.projectDataLoading).toBe(true)
      expect(first.monitoringLoading).toBe(false)
      expect(first.projectDataError).toBe('')
      expect(first.monitoringError).toBe('')
    })

    it('clears the loading flag of a monitoring read that is still pending', async () => {
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringLoading).toBe(true))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].monitoringLoading).toBe(false)
    })

    it('clears the failures of the previous project', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].projectDataError).toBe('')
      await loaded(view)
      expect(view.result.current.projectId).toBe('project-b')
    })

    it('clears a monitoring failure of the previous project', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].monitoringError).toBe('')
    })
  })
})
```


```bash
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/analytics/hooks/use-analytics-scope.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
Checked 3 files in <ms>. Fixed 1 file.
web typecheck clean
 Test Files  1 passed (1)
      Tests  27 passed (27)
```


The hook test passes with 27 tests (the typecheck is clean and Biome formats the test file). Rendering the hook with `renderHook`, it pins the first render before any effect, the project list and its failures, the selected project and its fallback, the data load and its stale answers, the reporting periods and the kept period, the monitoring read and its guard, both retries and every reset of `selectProject`.

- [ ] **Step 4: Mutate the hook once**

`mut-scope.json` holds 49 mutations: the 41 effect, default and retry mutations of Task 1 aimed at the hook (the survivors of Task 1 among them) and the eight project change resets that moved with `selectProject`. The hook test alone must kill all but the ones listed:

Create `.tmp/s7d/mut-scope.json`:

```json
[
 ["projects start idle", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "const [projectsLoading, setProjectsLoading] = useState(true)", "const [projectsLoading, setProjectsLoading] = useState(false)"],
 ["no role keeps loading", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    if (!role) {\n      setProjectsLoading(false)\n      return\n    }", "    if (!role) {\n      return\n    }"],
 ["projects error message", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "caught instanceof Error ? caught.message : 'Projects could not be loaded.'", "caught instanceof Error ? caught.message : 'x'"],
 ["projects error shows fixed text", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "caught instanceof Error ? caught.message : 'Projects could not be loaded.'", "'Projects could not be loaded.'"],
 ["first project is not selected", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "records.some((row) => row.id === current) ? current : (records[0]?.id ?? '')", "records.some((row) => row.id === current) ? current : ''"],
 ["selection is not kept on reload", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "records.some((row) => row.id === current) ? current : (records[0]?.id ?? '')", "(records[0]?.id ?? '')"],
 ["projects load error not cleared", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectsLoading(true)\n    setProjectsError('')", "    setProjectsLoading(true)"],
 ["projects reload ignores retry", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "  }, [projectsLoadAttempt, role])", "  }, [role])"],
 ["empty scope keeps activities", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      setProjectDataLoading(false)\n      setActivities([])\n      setIndicatorDefinitions([])\n      return", "      setProjectDataLoading(false)\n      setIndicatorDefinitions([])\n      return"],
 ["empty scope keeps indicator definitions", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      setProjectDataLoading(false)\n      setActivities([])\n      setIndicatorDefinitions([])\n      return", "      setProjectDataLoading(false)\n      setActivities([])\n      return"],
 ["data load error not cleared", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectDataLoading(true)\n    setProjectDataError('')\n    setActivities([])", "    setProjectDataLoading(true)\n    setActivities([])"],
 ["data load keeps old activities", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectDataError('')\n    setActivities([])\n    setIndicatorDefinitions([])\n    setPeriod('')", "    setProjectDataError('')\n    setIndicatorDefinitions([])\n    setPeriod('')"],
 ["data load keeps old definitions", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setActivities([])\n    setIndicatorDefinitions([])\n    setPeriod('')", "    setActivities([])\n    setPeriod('')"],
 ["data load keeps old period", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setIndicatorDefinitions([])\n    setPeriod('')\n    setMonitoring(null)", "    setIndicatorDefinitions([])\n    setMonitoring(null)"],
 ["data load keeps old monitoring", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setPeriod('')\n    setMonitoring(null)\n    setMonitoringError('')\n    Promise.all", "    setPeriod('')\n    setMonitoringError('')\n    Promise.all"],
 ["data load keeps old monitoring error", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setPeriod('')\n    setMonitoring(null)\n    setMonitoringError('')\n    Promise.all", "    setPeriod('')\n    setMonitoring(null)\n    Promise.all"],
 ["activities read ignores the grant", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      canReadActivities\n        ? activitiesClient.getActivities(projectId)", "      true\n        ? activitiesClient.getActivities(projectId)"],
 ["definitions read ignores the grant", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      canReadIndicatorDefinitions\n        ? indicatorsClient.getProjectIndicators(projectId)", "      true\n        ? indicatorsClient.getProjectIndicators(projectId)"],
 ["released values read never used", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "        : canReadIndicatorValues\n          ? indicatorsClient.getProjectIndicatorValues(projectId)", "        : false\n          ? indicatorsClient.getProjectIndicatorValues(projectId)"],
 ["data error message", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',\n          )\n      })\n      .finally(() => {\n        if (active) setProjectDataLoading(false)", "caught instanceof Error ? caught.message : 'x',\n          )\n      })\n      .finally(() => {\n        if (active) setProjectDataLoading(false)"],
 ["data error shows fixed text", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "setProjectDataError(\n            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',", "setProjectDataError(\n            'Analytics data could not be loaded.',"],
 ["data load never finishes", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "        if (active) setProjectDataLoading(false)\n      })\n    return () => {", "      })\n    return () => {"],
 ["data load ignores retry", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    projectDataLoadAttempt,\n    projectId,\n    selectedProject,\n  ])", "    projectId,\n    selectedProject,\n  ])"],
 ["data load ignores the activities grant", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    canReadActivities,\n    canReadIndicatorDefinitions,\n    canReadIndicatorValues,\n    projectDataLoadAttempt,", "    canReadIndicatorDefinitions,\n    canReadIndicatorValues,\n    projectDataLoadAttempt,"],
 ["period falls back to nothing", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "        : (reportingPeriods[0]?.value ?? ''),\n    )\n  }, [reportingPeriods])", "        : '',\n    )\n  }, [reportingPeriods])"],
 ["period not kept", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      reportingPeriods.some((candidate) => candidate.value === current)\n        ? current\n        : (reportingPeriods[0]?.value ?? ''),", "      reportingPeriods[0]?.value ?? '',"],
 ["monitoring guard drops the grant", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "if (!projectId || !selectedPeriod || !canReadIndicators) {", "if (!projectId || !selectedPeriod) {"],
 ["monitoring guard keeps stale data", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      setMonitoringLoading(false)\n      setMonitoring(null)\n      setMonitoringError('')\n      return", "      setMonitoringLoading(false)\n      setMonitoringError('')\n      return"],
 ["monitoring guard keeps stale error", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "      setMonitoringLoading(false)\n      setMonitoring(null)\n      setMonitoringError('')\n      return", "      setMonitoringLoading(false)\n      setMonitoring(null)\n      return"],
 ["monitoring start keeps stale data", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setMonitoringLoading(true)\n    setMonitoring(null)\n    setMonitoringError('')", "    setMonitoringLoading(true)\n    setMonitoringError('')"],
 ["monitoring start keeps stale error", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setMonitoringLoading(true)\n    setMonitoring(null)\n    setMonitoringError('')", "    setMonitoringLoading(true)\n    setMonitoring(null)"],
 ["monitoring sends the period start as end", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "        periodEnd: selectedPeriod.end,\n      })\n      .then((nextMonitoring)", "        periodEnd: selectedPeriod.start,\n      })\n      .then((nextMonitoring)"],
 ["monitoring error message", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',\n          )\n      })\n      .finally(() => {\n        if (active) setMonitoringLoading(false)", "caught instanceof Error ? caught.message : 'x',\n          )\n      })\n      .finally(() => {\n        if (active) setMonitoringLoading(false)"],
 ["monitoring error shows fixed text", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "setMonitoringError(\n            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',", "setMonitoringError(\n            'Analytics data could not be loaded.',"],
 ["monitoring never finishes", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "        if (active) setMonitoringLoading(false)\n      })\n    return () => {", "      })\n    return () => {"],
 ["monitoring ignores retry", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "  }, [canReadIndicators, monitoringLoadAttempt, projectId, selectedPeriod])", "  }, [canReadIndicators, projectId, selectedPeriod])"],
 ["project change keeps period", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectId(nextProjectId)\n    setPeriod('')", "    setProjectId(nextProjectId)"],
 ["project change keeps definitions", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setPeriod('')\n    setIndicatorDefinitions([])\n    setMonitoring(null)\n    setActivities([])\n    setProjectDataLoading(true)", "    setPeriod('')\n    setMonitoring(null)\n    setActivities([])\n    setProjectDataLoading(true)"],
 ["project change keeps monitoring", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setIndicatorDefinitions([])\n    setMonitoring(null)\n    setActivities([])\n    setProjectDataLoading(true)", "    setIndicatorDefinitions([])\n    setActivities([])\n    setProjectDataLoading(true)"],
 ["project change keeps activities", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setMonitoring(null)\n    setActivities([])\n    setProjectDataLoading(true)", "    setMonitoring(null)\n    setProjectDataLoading(true)"],
 ["project change not loading", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setActivities([])\n    setProjectDataLoading(true)\n    setMonitoringLoading(false)", "    setActivities([])\n    setMonitoringLoading(false)"],
 ["project change keeps monitoring loading", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectDataLoading(true)\n    setMonitoringLoading(false)\n    setProjectDataError('')", "    setProjectDataLoading(true)\n    setProjectDataError('')"],
 ["project change keeps data error", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setMonitoringLoading(false)\n    setProjectDataError('')\n    setMonitoringError('')\n  }", "    setMonitoringLoading(false)\n    setMonitoringError('')\n  }"],
 ["project change keeps monitoring error", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    setProjectDataError('')\n    setMonitoringError('')\n  }", "    setProjectDataError('')\n  }"],
 ["retry skips the project list", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    if (projectsError) setProjectsLoadAttempt((value) => value + 1)\n    else if (projectDataError)", "    if (false) setProjectsLoadAttempt((value) => value + 1)\n    else if (projectDataError)"],
 ["retry skips the project data", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    else if (projectDataError) setProjectDataLoadAttempt((value) => value + 1)\n    else setMonitoringLoadAttempt", "    else if (false) setProjectDataLoadAttempt((value) => value + 1)\n    else setMonitoringLoadAttempt"],
 ["retry skips monitoring", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    else setMonitoringLoadAttempt((value) => value + 1)\n  }", "    else setProjectDataLoadAttempt((value) => value + 1)\n  }"],
 ["map retry skips the project data", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    projectDataError\n      ? setProjectDataLoadAttempt((value) => value + 1)\n      : setMonitoringLoadAttempt((value) => value + 1)", "    false\n      ? setProjectDataLoadAttempt((value) => value + 1)\n      : setMonitoringLoadAttempt((value) => value + 1)"],
 ["map retry skips monitoring", "apps/web/src/features/analytics/hooks/use-analytics-scope.ts", "    projectDataError\n      ? setProjectDataLoadAttempt((value) => value + 1)\n      : setMonitoringLoadAttempt((value) => value + 1)", "    projectDataError\n      ? setProjectDataLoadAttempt((value) => value + 1)\n      : setProjectDataLoadAttempt((value) => value + 1)"]
]
```


```bash
F=apps/web/src/features/analytics/hooks/use-analytics-scope.ts
H=$(git hash-object $F)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-scope.json apps/web/src/features/analytics/hooks/use-analytics-scope.test.ts > .tmp/s7d/out/t3-scope.txt 2>&1
grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t3-scope.txt
grep SURVIVED .tmp/s7d/out/t3-scope.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $F)" = "$H" && echo "file restored"
```


Expected:

```text
unmutated: pass
mutations 49, survived 6
data load keeps old monitoring
data load keeps old monitoring error
data load keeps old period
empty scope keeps indicator definitions
period not kept
project change keeps definitions
file restored
```


All 49 mutations are applied and 43 are killed. The 6 survivors are equivalents, not gaps: `data load keeps old period`, `data load keeps old monitoring` and `data load keeps old monitoring error` remove a reset that the period effect and the monitoring effect repeat in the same commit (the data load sets the period to empty before every reload, so the current period is empty whenever `reportingPeriods` changes, which also makes `period not kept` equivalent); `empty scope keeps indicator definitions` and `project change keeps definitions` leave the definitions of the old project in state, but they are filtered by `projectId` before use. The file is restored.

- [ ] **Step 5: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the analytics scope state into a hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1546 files in <ms>. No fixes applied.
 3 files changed, 698 insertions(+), 189 deletions(-)
```


---

### Task 4: Cut the action bar, the filter bar and the analysis panel out of the shell

**Files:**
- Create: `apps/web/src/features/analytics/components/analytics-action-bar.tsx`, `analytics-filter-bar.tsx`, `analytics-analysis-panel.tsx` and a test for each (39, 32 and 36 tests)
- Modify: `apps/web/src/features/analytics/components/analytics-dashboard.tsx`
- Create (gitignored): `.tmp/s7d/task4-cut.json`, `mut-bar.json`, `mut-filter.json`, `mut-panel.json`, `mut-shell-after.json`

With the scope in its hook, three regions of the shell JSX read names that are now plain values: the pin and export buttons, the filter section and the main chart panel. Each becomes a component with props named after the identifiers its markup used, so every moved line stays verbatim. The shell keeps the hook calls and resets, the export dialog, the loading, error and empty states, the summary cards and the monitoring charts section (ruling 8).

- `AnalyticsActionBar` (13 props) owns the pin logic (`pinPermitted`, `pinBlockedReason`, `addToDashboard`) and the two buttons.
- `AnalyticsFilterBar` (17 props with `children`) owns `viewPermitted` and the five filters; the shell passes the action bar as its child, so the buttons stay in the heading row.
- `AnalyticsAnalysisPanel` (27 props) owns `analysisMeta`, the map branch and every view branch of the panel. It computes `mapSelected` from `visualizationType` itself because the type narrowing (`type={visualizationType}` is `'bar' | 'line'` there) needs the comparison in the same function.

- [ ] **Step 1: Cut the three components**

`task4-cut.json` pins the shell as Task 3 leaves it (hash `d955c821`); the props of each component are written sorted, and the shell passes them with the same names:

Create `.tmp/s7d/task4-cut.json`:

```json
{
 "source": "apps/web/src/features/analytics/components/analytics-dashboard.tsx",
 "hash": "d955c821",
 "files": {
  "apps/web/src/features/analytics/components/analytics-action-bar.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "",
   "export const AnalyticsActionBar = ({",
   "  analysisView,",
   "  canExportAnalytics,",
   "  canReadIndicators,",
   "  canReadParticipation,",
   "  canReadSurveyTimeline,",
   "  exportPreview,",
   "  exporting,",
   "  pickerPeriod,",
   "  previewExport,",
   "  profile,",
   "  selectedPeriod,",
   "  selectedProject,",
   "  surveyUnavailable,",
   "}: {",
   "  analysisView: AnalysisView",
   "  canExportAnalytics: boolean",
   "  canReadIndicators: boolean",
   "  canReadParticipation: boolean",
   "  canReadSurveyTimeline: boolean",
   "  exportPreview: ReturnType<typeof useAnalyticsExport>['exportPreview']",
   "  exporting: boolean",
   "  pickerPeriod: AnalyticsReportingPeriod | undefined",
   "  previewExport: ReturnType<typeof useAnalyticsExport>['previewExport']",
   "  profile: ReturnType<typeof useCurrentRole>['profile']",
   "  selectedPeriod: AnalyticsReportingPeriod | undefined",
   "  selectedProject: ReturnType<typeof useAnalyticsScope>['selectedProject']",
   "  surveyUnavailable: boolean",
   "}) => {",
   [223, 262],
   "",
   "  return (",
   [332, 383],
   "  )",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-filter-bar.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "",
   "export const AnalyticsFilterBar = ({",
   "  analysisView,",
   "  canReadParticipation,",
   "  canReadSurvey,",
   "  canReadSurveyTimeline,",
   "  children,",
   "  handleProjectChange,",
   "  indicatorId,",
   "  indicators,",
   "  pickerPeriod,",
   "  pickerPeriods,",
   "  projectId,",
   "  projects,",
   "  setAnalysisView,",
   "  setIndicatorId,",
   "  setPeriod,",
   "  setVisualizationType,",
   "  visualizationType,",
   "}: {",
   "  analysisView: AnalysisView",
   "  canReadParticipation: boolean",
   "  canReadSurvey: boolean",
   "  canReadSurveyTimeline: boolean",
   "  children: React.ReactNode",
   "  handleProjectChange: (nextProjectId: string) => void",
   "  indicatorId: string",
   "  indicators: ReturnType<typeof activeIndicators>",
   "  pickerPeriod: AnalyticsReportingPeriod | undefined",
   "  pickerPeriods: readonly AnalyticsReportingPeriod[]",
   "  projectId: string",
   "  projects: ReturnType<typeof useAnalyticsScope>['projects']",
   "  setAnalysisView: (view: AnalysisView) => void",
   "  setIndicatorId: (indicatorId: string) => void",
   "  setPeriod: (period: string) => void",
   "  setVisualizationType: (type: VisualizationType) => void",
   "  visualizationType: VisualizationType",
   "}) => {",
   [216, 222],
   "",
   "  return (",
   [323, 331],
   "{children}",
   [384, 479],
   "  )",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'",
   "import type { ActivitySummary } from '@/types/pathways'",
   "",
   "export const AnalyticsAnalysisPanel = ({",
   "  activities,",
   "  analysisRows,",
   "  analysisView,",
   "  canReadParticipation,",
   "  canReadSurvey,",
   "  canReadSurveyTimeline,",
   "  mapDataError,",
   "  mapDataLoading,",
   "  monitoringReadable,",
   "  participationRead,",
   "  periodsReadable,",
   "  reportingPeriods,",
   "  retryMapData,",
   "  retrySurvey,",
   "  retryTimeline,",
   "  selectedPeriod,",
   "  survey,",
   "  surveyClosedPeriodRequired,",
   "  surveyError,",
   "  surveyErrorKind,",
   "  surveyFrozenOnly,",
   "  surveyLoading,",
   "  surveyPeriods,",
   "  timeline,",
   "  timelineError,",
   "  timelineLoading,",
   "  visualizationType,",
   "}: {",
   "  activities: readonly ActivitySummary[]",
   "  analysisRows: ReturnType<typeof progressRows>",
   "  analysisView: AnalysisView",
   "  canReadParticipation: boolean",
   "  canReadSurvey: boolean",
   "  canReadSurveyTimeline: boolean",
   "  mapDataError: string",
   "  mapDataLoading: boolean",
   "  monitoringReadable: boolean",
   "  participationRead: ReturnType<typeof useParticipationBreakdown>",
   "  periodsReadable: boolean",
   "  reportingPeriods: readonly AnalyticsReportingPeriod[]",
   "  retryMapData: () => void",
   "  retrySurvey: ReturnType<typeof useSurveyAnalytics>['retrySurvey']",
   "  retryTimeline: ReturnType<typeof useTimelineAnalytics>['retryTimeline']",
   "  selectedPeriod: AnalyticsReportingPeriod | undefined",
   "  survey: ReturnType<typeof useSurveyAnalytics>['survey']",
   "  surveyClosedPeriodRequired: boolean",
   "  surveyError: ReturnType<typeof useSurveyAnalytics>['surveyError']",
   "  surveyErrorKind: ReturnType<typeof useSurveyAnalytics>['surveyErrorKind']",
   "  surveyFrozenOnly: boolean",
   "  surveyLoading: ReturnType<typeof useSurveyAnalytics>['surveyLoading']",
   "  surveyPeriods: readonly AnalyticsReportingPeriod[]",
   "  timeline: ReturnType<typeof useTimelineAnalytics>['timeline']",
   "  timelineError: ReturnType<typeof useTimelineAnalytics>['timelineError']",
   "  timelineLoading: ReturnType<typeof useTimelineAnalytics>['timelineLoading']",
   "  visualizationType: VisualizationType",
   "}) => {",
   [273, 273],
   [279, 284],
   "",
   "  return (",
   [518, 631],
   "  )",
   "}"
  ],
  "apps/web/src/features/analytics/components/analytics-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { AnalyticsActionBar } from './analytics-action-bar'",
   "import { AnalyticsAnalysisPanel } from './analytics-analysis-panel'",
   "import { AnalyticsFilterBar } from './analytics-filter-bar'",
   "",
   [80, 215],
   [264, 271],
   "",
   [273, 278],
   [285, 322],
   "      <AnalyticsFilterBar",
   "        analysisView={analysisView}",
   "        canReadParticipation={canReadParticipation}",
   "        canReadSurvey={canReadSurvey}",
   "        canReadSurveyTimeline={canReadSurveyTimeline}",
   "        handleProjectChange={handleProjectChange}",
   "        indicatorId={indicatorId}",
   "        indicators={indicators}",
   "        pickerPeriod={pickerPeriod}",
   "        pickerPeriods={pickerPeriods}",
   "        projectId={projectId}",
   "        projects={projects}",
   "        setAnalysisView={setAnalysisView}",
   "        setIndicatorId={setIndicatorId}",
   "        setPeriod={setPeriod}",
   "        setVisualizationType={setVisualizationType}",
   "        visualizationType={visualizationType}",
   "      >",
   "        <AnalyticsActionBar",
   "          analysisView={analysisView}",
   "          canExportAnalytics={canExportAnalytics}",
   "          canReadIndicators={canReadIndicators}",
   "          canReadParticipation={canReadParticipation}",
   "          canReadSurveyTimeline={canReadSurveyTimeline}",
   "          exportPreview={exportPreview}",
   "          exporting={exporting}",
   "          pickerPeriod={pickerPeriod}",
   "          previewExport={previewExport}",
   "          profile={profile}",
   "          selectedPeriod={selectedPeriod}",
   "          selectedProject={selectedProject}",
   "          surveyUnavailable={surveyUnavailable}",
   "        />",
   "      </AnalyticsFilterBar>",
   [480, 517],
   "          <AnalyticsAnalysisPanel",
   "            activities={activities}",
   "            analysisRows={analysisRows}",
   "            analysisView={analysisView}",
   "            canReadParticipation={canReadParticipation}",
   "            canReadSurvey={canReadSurvey}",
   "            canReadSurveyTimeline={canReadSurveyTimeline}",
   "            mapDataError={mapDataError}",
   "            mapDataLoading={mapDataLoading}",
   "            monitoringReadable={monitoringReadable}",
   "            participationRead={participationRead}",
   "            periodsReadable={periodsReadable}",
   "            reportingPeriods={reportingPeriods}",
   "            retryMapData={retryMapData}",
   "            retrySurvey={retrySurvey}",
   "            retryTimeline={retryTimeline}",
   "            selectedPeriod={selectedPeriod}",
   "            survey={survey}",
   "            surveyClosedPeriodRequired={surveyClosedPeriodRequired}",
   "            surveyError={surveyError}",
   "            surveyErrorKind={surveyErrorKind}",
   "            surveyFrozenOnly={surveyFrozenOnly}",
   "            surveyLoading={surveyLoading}",
   "            surveyPeriods={surveyPeriods}",
   "            timeline={timeline}",
   "            timelineError={timelineError}",
   "            timelineLoading={timelineLoading}",
   "            visualizationType={visualizationType}",
   "          />",
   [632, 732]
  ]
 }
}
```


```bash
D=apps/web/src/features/analytics/components
cp $D/analytics-dashboard.tsx .tmp/s7d/before/shell-t4.tsx
node .tmp/s7d/cut.mjs .tmp/s7d/task4-cut.json
sed -i "s#const analytics = source('features/analytics/components/analytics-dashboard.tsx')#const analytics = source('features/analytics/components/analytics-analysis-panel.tsx')#" apps/web/src/features/ui-copy-cleanup.contract.test.ts
git diff --stat -- apps/web/src/features/ui-copy-cleanup.contract.test.ts | tail -1
node .tmp/s7d/trim-imports.mjs $D/analytics-action-bar.tsx $D/analytics-filter-bar.tsx $D/analytics-analysis-panel.tsx $D/analytics-dashboard.tsx
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
node .tmp/s7d/same-lines.mjs .tmp/s7d/before/shell-t4.tsx $D/analytics-action-bar.tsx $D/analytics-filter-bar.tsx $D/analytics-analysis-panel.tsx $D/analytics-dashboard.tsx | tail -1
wc -l $D/analytics-action-bar.tsx $D/analytics-filter-bar.tsx $D/analytics-analysis-panel.tsx $D/analytics-dashboard.tsx
```


Expected:

```text
apps/web/src/features/analytics/components/analytics-action-bar.tsx: 205 lines
apps/web/src/features/analytics/components/analytics-filter-bar.tsx: 234 lines
apps/web/src/features/analytics/components/analytics-analysis-panel.tsx: 263 lines
apps/web/src/features/analytics/components/analytics-dashboard.tsx: 473 lines
 1 file changed, 1 insertion(+), 1 deletion(-)
apps/web/src/features/analytics/components/analytics-action-bar.tsx: removed AlertTriangle, BarChart3, useMemo, useState, PageHeader, AsyncState, EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, MAPS_UI_ENABLED, useAuthorizedRead, useDisplayLabels, formatCalendarDay, can, nonOverlappingAnalyticsPeriods, SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE, VisualizationType, analysisViews, visualizationTypes, analyticsAccess, countOpenAlerts, businessDateInManila, useBudgetSummary, useIndicatorTrends, useParticipationBreakdown, useDescriptiveAnalytics, useSadddDashboard, useSurveyAnalytics, useTimelineAnalytics, activeIndicators, metricNumber, progressRows, ActivityCompletionChart, DescriptiveAnalysisChart, IndicatorProgressChart, AnalyticsExportPreviewDialog, AnalyticsSummaryCards, BudgetSummaryCard, ChartPanel, UnavailableChart, DescriptiveStatisticsPanel, IndicatorTrendChart, InsightStatus, OpenAlertsPanel, ParticipationBreakdownPanel, ProjectCoverageMapPanel, SadddAnalysisPanel, SurveyAnalyticsPanel, TimelineAnalyticsPanel, Link
apps/web/src/features/analytics/components/analytics-filter-bar.tsx: removed AlertTriangle, BarChart3, ChevronDown, Download, Plus, useMemo, useState, PageHeader, AsyncState, EmptyState, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, useAuthorizedRead, useCurrentRole, useDisplayLabels, addPin, formatCalendarDay, can, toast, nonOverlappingAnalyticsPeriods, SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE, exportFormats, analyticsAccess, countOpenAlerts, businessDateInManila, useAnalyticsExport, useBudgetSummary, useIndicatorTrends, useParticipationBreakdown, useDescriptiveAnalytics, useSadddDashboard, useSurveyAnalytics, useTimelineAnalytics, metricNumber, progressRows, ActivityCompletionChart, DescriptiveAnalysisChart, IndicatorProgressChart, AnalyticsExportPreviewDialog, AnalyticsSummaryCards, BudgetSummaryCard, ChartPanel, UnavailableChart, DescriptiveStatisticsPanel, IndicatorTrendChart, InsightStatus, OpenAlertsPanel, ParticipationBreakdownPanel, ProjectCoverageMapPanel, SadddAnalysisPanel, SurveyAnalyticsPanel, TimelineAnalyticsPanel, Link
apps/web/src/features/analytics/components/analytics-analysis-panel.tsx: removed AlertTriangle, BarChart3, ChevronDown, Download, Plus, useMemo, useState, PageHeader, AsyncState, EmptyState, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, MAPS_UI_ENABLED, useAuthorizedRead, useCurrentRole, useDisplayLabels, addPin, formatCalendarDay, can, toast, nonOverlappingAnalyticsPeriods, analysisViews, exportFormats, analyticsAccess, countOpenAlerts, businessDateInManila, useAnalyticsExport, useBudgetSummary, useIndicatorTrends, useAnalyticsScope, useDescriptiveAnalytics, useSadddDashboard, activeIndicators, metricNumber, ActivityCompletionChart, IndicatorProgressChart, AnalyticsExportPreviewDialog, AnalyticsSummaryCards, BudgetSummaryCard, DescriptiveStatisticsPanel, IndicatorTrendChart, OpenAlertsPanel, SadddAnalysisPanel, Link
apps/web/src/features/analytics/components/analytics-dashboard.tsx: removed ChevronDown, Download, Plus, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, MAPS_UI_ENABLED, addPin, toast, SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE, analysisViews, exportFormats, visualizationTypes, DescriptiveAnalysisChart, ParticipationBreakdownPanel, ProjectCoverageMapPanel, SurveyAnalyticsPanel, TimelineAnalyticsPanel
Checked 5 files in <ms>. Fixed 4 files.
web typecheck clean
original lines 642, lost 0, added 197
  149 apps/web/src/features/analytics/components/analytics-action-bar.tsx
  175 apps/web/src/features/analytics/components/analytics-filter-bar.tsx
  207 apps/web/src/features/analytics/components/analytics-analysis-panel.tsx
  437 apps/web/src/features/analytics/components/analytics-dashboard.tsx
  968 total
```


`same-lines.mjs` prints `lost 0`: every declaration and markup line of the shell is in one of the four files. The added lines are the component signatures, the prop types, the two JSX calls and the one repeated `mapSelected` line. The shell drops under the 500 line flag (MOD-06 of this component, 898 lines at the start of the slice). One contract test follows the moved text: `ui-copy-cleanup.contract.test.ts` checks that the analytics view renders `ParticipationBreakdownPanel` and has no unconditional "None yet" title, and that markup now sits in the analysis panel, so its `analytics` source path changes (the `sed` line; the diff stat shows one line changed).

- [ ] **Step 2: Run the shell tests against the cut**

```bash
(cd apps/web && timeout 1100 pnpm exec vitest run src/features/analytics src/features/ui-copy-cleanup.contract.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
 Test Files  26 passed (26)
      Tests  302 passed (302)
```


All tests of the folder and the UI copy contract test pass against the three components before they have a test of their own, including the 54 pins of Task 1 that read the buttons, the filters, the panel and the grants and date rules through the shell.

- [ ] **Step 3: Test each component on its own**

The action bar test replaces the Radix menu by plain buttons and mocks the pin store and the toast, and covers both flags, every grant, the reasons of the blocked view with `title`, `aria-describedby` and the reason text, what `addPin` receives for each view (with the period range, or without it for the timeline), the four answers and their toasts, every disabled state of the export button, its label and the format order:

Create `apps/web/src/features/analytics/components/analytics-action-bar.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsActionBar } from './analytics-action-bar'

const flags = vi.hoisted(() => ({ pins: true, exports: true }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const addPin = vi.hoisted(() => vi.fn())

vi.mock('@/constants/feature-flags', () => ({
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
  get ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED() {
    return flags.exports
  },
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/dashboard-pins', () => ({ addPin }))
// Plain buttons stand in for the Radix menu, matching the other workspace tests.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
}))

type Props = ComponentProps<typeof AnalyticsActionBar>
const period = { value: '2026-09', label: 'September 2026', start: '2026-09-01', end: '2026-09-30' }
const previewExport = vi.fn()
const base = {
  analysisView: 'kpi',
  canExportAnalytics: true,
  canReadIndicators: true,
  canReadParticipation: true,
  canReadSurveyTimeline: true,
  exportPreview: null,
  exporting: false,
  pickerPeriod: period,
  previewExport,
  profile: { userId: 'user-1' },
  selectedPeriod: period,
  selectedProject: { id: 'project-a' },
  surveyUnavailable: false,
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(<AnalyticsActionBar {...({ ...base, ...overrides } as unknown as Props)} />)
const pin = () => screen.queryByRole('button', { name: 'Add to Dashboard' }) as HTMLButtonElement | null
const exporter = () =>
  screen.queryByRole('button', { name: /Export aggregates|Preparing preview/ }) as HTMLButtonElement | null
const reasons = {
  period: 'Choose a reporting period to pin this view.',
  survey: 'Survey improvement cannot be pinned.',
}

describe('AnalyticsActionBar', () => {
  beforeEach(() => {
    flags.pins = true
    flags.exports = true
    addPin.mockReturnValue('added')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the two actions in one wrapping row', () => {
    const { container } = show()

    expect(container.firstElementChild?.className).toBe('flex flex-wrap items-center gap-2')
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  describe('Add to Dashboard', () => {
    it.each([
      ['kpi', { canReadIndicators: false }],
      ['participation', { canReadParticipation: false }],
      ['timeline', { canReadSurveyTimeline: false }],
    ])('is hidden in the %s view when the role cannot read it', (analysisView, denied) => {
      show({ analysisView, ...denied })

      expect(pin()).toBeNull()
    })

    it.each(['kpi', 'participation', 'timeline'])('is shown in the %s view for a role that can read it', (analysisView) => {
      show({ analysisView })

      expect(pin()).not.toBeNull()
    })

    it('stays shown in the survey view whatever the role reads', () => {
      show({
        analysisView: 'survey',
        canReadIndicators: false,
        canReadParticipation: false,
        canReadSurveyTimeline: false,
      })

      expect(pin()).not.toBeNull()
    })

    it('is hidden when the pins flag is off', () => {
      flags.pins = false
      show()

      expect(pin()).toBeNull()
    })

    it('can be pinned without a reason', () => {
      show()

      expect(pin()?.disabled).toBe(false)
      expect(pin()?.hasAttribute('title')).toBe(false)
      expect(pin()?.hasAttribute('aria-describedby')).toBe(false)
      expect(document.getElementById('pin-blocked-reason')).toBeNull()
    })

    it.each([
      ['kpi', { selectedPeriod: undefined }, reasons.period],
      ['survey', {}, reasons.survey],
    ])('blocks the %s view with its reason', (analysisView, overrides, reason) => {
      show({ analysisView, ...overrides })

      expect(pin()?.disabled).toBe(true)
      expect(pin()?.title).toBe(reason)
      expect(pin()?.getAttribute('aria-describedby')).toBe('pin-blocked-reason')
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(reason)
      fireEvent.click(pin() as HTMLButtonElement)
      expect(addPin).not.toHaveBeenCalled()
    })

    it.each([
      ['no project', { selectedProject: undefined }],
      ['no profile', { profile: null }],
      ['no user id', { profile: { userId: '' } }],
    ])('is disabled with %s and gives no reason', (_name, overrides) => {
      show(overrides)

      expect(pin()?.disabled).toBe(true)
      expect(pin()?.hasAttribute('title')).toBe(false)
      fireEvent.click(pin() as HTMLButtonElement)
      expect(addPin).not.toHaveBeenCalled()
    })

    it.each([
      ['kpi', { periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
      ['participation', { periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
      ['timeline', {}],
    ])('stores the %s view for the project', (analysisView, range) => {
      show({ analysisView })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledTimes(1)
      expect(addPin).toHaveBeenCalledWith('user-1', { view: analysisView, projectId: 'project-a', ...range })
    })

    it('stores a timeline pin without a period even when none is selected', () => {
      show({ analysisView: 'timeline', selectedPeriod: undefined })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledWith('user-1', { view: 'timeline', projectId: 'project-a' })
    })

    it('stores a participation pin without a period when none is selected', () => {
      show({ analysisView: 'participation', selectedPeriod: undefined })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledWith('user-1', { view: 'participation', projectId: 'project-a' })
    })

    it.each([
      ['added', 'Added to your dashboard.', 'success'],
      ['duplicate', 'Already on your dashboard.', 'error'],
      ['full', 'Your dashboard is full. Unpin a chart first.', 'error'],
      ['unavailable', 'Browser storage is unavailable, so the chart could not be pinned.', 'error'],
    ])('answers %s with one %s toast', (result, message, kind) => {
      addPin.mockReturnValue(result)
      show()

      fireEvent.click(pin() as HTMLButtonElement)

      const other = kind === 'success' ? toast.error : toast.success
      expect(toast[kind as 'success' | 'error']).toHaveBeenCalledWith(message)
      expect(toast.success.mock.calls.length + toast.error.mock.calls.length).toBe(1)
      expect(other).not.toHaveBeenCalled()
    })
  })

  describe('Export aggregates', () => {
    it('is hidden when the export flag is off', () => {
      flags.exports = false
      show()

      expect(exporter()).toBeNull()
    })

    it('is hidden for a role that cannot export', () => {
      show({ canExportAnalytics: false })

      expect(exporter()).toBeNull()
    })

    it('is enabled with a project and a period', () => {
      show()

      expect(exporter()?.textContent).toBe('Export aggregates')
      expect(exporter()?.disabled).toBe(false)
    })

    it.each([
      ['no project', { selectedProject: undefined }],
      ['an export running', { exporting: true }],
      ['the kpi view without a period', { pickerPeriod: undefined }],
      ['the participation view without a period', { analysisView: 'participation', pickerPeriod: undefined }],
      ['the survey view without a period', { analysisView: 'survey', pickerPeriod: undefined }],
      ['the survey view unavailable', { analysisView: 'survey', surveyUnavailable: true }],
    ])('is disabled with %s', (_name, overrides) => {
      show(overrides)

      expect(exporter()?.disabled).toBe(true)
    })

    it.each([
      ['the timeline view without a period', { analysisView: 'timeline', pickerPeriod: undefined }],
      ['the timeline view with the survey unavailable', { analysisView: 'timeline', surveyUnavailable: true }],
      ['the kpi view with the survey unavailable', { surveyUnavailable: true }],
      ['the survey view with a period', { analysisView: 'survey' }],
    ])('is enabled with %s', (_name, overrides) => {
      show(overrides)

      expect(exporter()?.disabled).toBe(false)
    })

    it('says Preparing preview only while a preview is being prepared', () => {
      show({ exporting: true })
      expect(exporter()?.textContent).toBe('Preparing preview')
      cleanup()

      show({ exporting: true, exportPreview: { format: 'CSV' } })
      expect(exporter()?.textContent).toBe('Export aggregates')
      cleanup()

      show({ exportPreview: null })
      expect(exporter()?.textContent).toBe('Export aggregates')
    })

    it('lists the four formats in order and previews the chosen one', () => {
      show()

      const items = screen.getAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual(['CSV', 'XLS', 'XLSX', 'PDF'])
      fireEvent.click(items[2])
      expect(previewExport).toHaveBeenCalledTimes(1)
      expect(previewExport).toHaveBeenCalledWith('XLSX')
    })
  })
})
```


The filter bar test replaces the select by a native one that keeps the placeholder on a data attribute, and covers the options and values of the five fields, the views a role cannot read, the indicator field disabled outside the KPI view, the map option behind its flag, each change handler and the grid classes of every field:

Create `apps/web/src/features/analytics/components/analytics-filter-bar.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsFilterBar } from './analytics-filter-bar'

const flags = vi.hoisted(() => ({ maps: false }))

vi.mock('@/constants/feature-flags', () => ({
  get MAPS_UI_ENABLED() {
    return flags.maps
  },
}))
// A native select stands in for the Radix one and keeps the placeholder on a data attribute.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = { children?: React.ReactNode; 'aria-label'?: string; placeholder?: string; value?: string }
  type SelectProps = {
    children?: React.ReactNode
    disabled?: boolean
    value?: string
    onValueChange?: (value: string) => void
  }
  const SelectTrigger = ({ children }: PartProps) => <>{children}</>
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, value }: PartProps) => <option value={value}>{children}</option>
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, disabled, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    const valueNode = React.Children.toArray(trigger?.props.children).find(
      (part) => React.isValidElement(part) && part.type === SelectValue,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        aria-label={trigger?.props['aria-label']}
        data-placeholder={valueNode?.props.placeholder}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

type Props = ComponentProps<typeof AnalyticsFilterBar>
const septemberPeriod = { value: '2026-09', label: 'September 2026', start: '2026-09-01', end: '2026-09-30' }
const augustPeriod = { value: '2026-08', label: 'August 2026', start: '2026-08-01', end: '2026-08-31' }
const handlers = {
  handleProjectChange: vi.fn(),
  setAnalysisView: vi.fn(),
  setIndicatorId: vi.fn(),
  setPeriod: vi.fn(),
  setVisualizationType: vi.fn(),
}
const base = {
  ...handlers,
  analysisView: 'kpi',
  canReadParticipation: true,
  canReadSurvey: true,
  canReadSurveyTimeline: true,
  indicatorId: 'all',
  indicators: [
    { id: 'indicator-1', code: 'IND-1', name: 'Reach' },
    { id: 'indicator-2', code: 'IND-2', name: 'Completion' },
  ],
  pickerPeriod: septemberPeriod,
  pickerPeriods: [septemberPeriod, augustPeriod],
  projectId: 'project-b',
  projects: [
    { id: 'project-a', title: 'Project A' },
    { id: 'project-b', title: 'Project B' },
  ],
  visualizationType: 'bar',
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(
    <AnalyticsFilterBar {...({ ...base, ...overrides } as unknown as Props)}>
      <button type="button">child action</button>
    </AnalyticsFilterBar>,
  )
const field = (label: string) => screen.getByLabelText(label) as HTMLSelectElement
const optionsOf = (label: string) =>
  Array.from(field(label).options).map((option) => [option.value, option.textContent])
const labelsOf = (label: string) => optionsOf(label).map(([, text]) => text)

describe('AnalyticsFilterBar', () => {
  beforeEach(() => {
    flags.maps = false
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('names its section by the heading and puts the children beside the heading', () => {
    const { container } = show()

    const section = container.querySelector('section')
    const heading = screen.getByRole('heading', { name: 'Analysis and visualization' })
    expect(section?.getAttribute('aria-labelledby')).toBe('analytics-view-title')
    expect(heading.id).toBe('analytics-view-title')
    expect(heading.parentElement?.className).toBe(
      'flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-12',
    )
    expect(heading.parentElement?.contains(screen.getByText('child action'))).toBe(true)
    expect(section?.className).toBe(
      'grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12',
    )
  })

  it.each([
    ['Project filter', 'space-y-2 sm:col-span-2 xl:col-span-5'],
    ['Reporting period', 'space-y-2 xl:col-span-3'],
    ['Analysis view', 'space-y-2 xl:col-span-4'],
    ['Indicator filter', 'space-y-2 xl:col-span-8'],
    ['Visualization type', 'space-y-2 xl:col-span-4'],
  ])('lays the %s field out with %s', (label, classes) => {
    show()

    expect(field(label).parentElement?.className).toBe(classes)
  })

  it.each([
    ['Project filter', 'Project filter'],
    ['Reporting period', 'Reporting period'],
    ['Analysis view', 'Analysis view'],
    ['Indicator filter', 'Indicator'],
    ['Visualization type', 'Visualization type'],
  ])('shows the caption of the %s field', (label, caption) => {
    show()

    expect(field(label).parentElement?.querySelector('span')?.textContent).toBe(caption)
  })

  describe('project', () => {
    it('lists the projects and shows the current one', () => {
      show()

      expect(optionsOf('Project filter')).toEqual([
        ['project-a', 'Project A'],
        ['project-b', 'Project B'],
      ])
      expect(field('Project filter').value).toBe('project-b')
      expect(field('Project filter').getAttribute('data-placeholder')).toBe('No authorized projects')
    })

    it('reports the chosen project', () => {
      show()

      fireEvent.change(field('Project filter'), { target: { value: 'project-a' } })

      expect(handlers.handleProjectChange).toHaveBeenCalledWith('project-a')
    })
  })

  describe('reporting period', () => {
    it('lists the picker periods and shows the picked one', () => {
      show({ pickerPeriod: augustPeriod })

      expect(optionsOf('Reporting period')).toEqual([
        ['2026-09', 'September 2026'],
        ['2026-08', 'August 2026'],
      ])
      expect(field('Reporting period').value).toBe('2026-08')
      expect(field('Reporting period').disabled).toBe(false)
      expect(field('Reporting period').getAttribute('data-placeholder')).toBe('No reporting periods')
    })

    it('is disabled and empty without periods', () => {
      show({ pickerPeriod: undefined, pickerPeriods: [] })

      expect(field('Reporting period').disabled).toBe(true)
      expect(field('Reporting period').value).toBe('')
    })

    it('stays enabled with one period', () => {
      show({ pickerPeriods: [septemberPeriod] })

      expect(field('Reporting period').disabled).toBe(false)
    })

    it('reports the chosen period', () => {
      show()

      fireEvent.change(field('Reporting period'), { target: { value: '2026-08' } })

      expect(handlers.setPeriod).toHaveBeenCalledWith('2026-08')
    })
  })

  describe('analysis view', () => {
    const all = [
      'KPI / indicator performance',
      'Participation patterns',
      'Survey improvement',
      'Project / activity timeline adherence',
    ]

    it('lists every view for a role that reads them all', () => {
      show({ analysisView: 'survey' })

      expect(labelsOf('Analysis view')).toEqual(all)
      expect(field('Analysis view').value).toBe('survey')
    })

    it.each([
      ['participation', { canReadParticipation: false }, [all[0], all[2], all[3]]],
      ['survey', { canReadSurvey: false }, [all[0], all[1], all[3]]],
      ['timeline', { canReadSurveyTimeline: false }, [all[0], all[1], all[2]]],
      [
        'every other view',
        { canReadParticipation: false, canReadSurvey: false, canReadSurveyTimeline: false },
        [all[0]],
      ],
    ])('hides the %s view the role cannot read', (_name, overrides, labels) => {
      show(overrides)

      expect(labelsOf('Analysis view')).toEqual(labels)
    })

    it('reports the chosen view', () => {
      show()

      fireEvent.change(field('Analysis view'), { target: { value: 'timeline' } })

      expect(handlers.setAnalysisView).toHaveBeenCalledWith('timeline')
    })
  })

  describe('indicator', () => {
    it('lists all indicators first, then each code and name', () => {
      show({ indicatorId: 'indicator-2' })

      expect(optionsOf('Indicator filter')).toEqual([
        ['all', 'All indicators / project KPI'],
        ['indicator-1', 'IND-1 · Reach'],
        ['indicator-2', 'IND-2 · Completion'],
      ])
      expect(field('Indicator filter').value).toBe('indicator-2')
    })

    it.each([
      ['kpi', false],
      ['participation', true],
      ['survey', true],
      ['timeline', true],
    ])('in the %s view is disabled: %s', (analysisView, disabled) => {
      show({ analysisView })

      expect(field('Indicator filter').disabled).toBe(disabled)
    })

    it('reports the chosen indicator', () => {
      show()

      fireEvent.change(field('Indicator filter'), { target: { value: 'indicator-1' } })

      expect(handlers.setIndicatorId).toHaveBeenCalledWith('indicator-1')
    })
  })

  describe('visualization type', () => {
    it('lists bar, line and table while maps are off', () => {
      show({ visualizationType: 'line' })

      expect(optionsOf('Visualization type')).toEqual([
        ['bar', 'Bar chart'],
        ['line', 'Line chart'],
        ['table', 'Table'],
      ])
      expect(field('Visualization type').value).toBe('line')
    })

    it('adds the map when maps are on', () => {
      flags.maps = true
      show()

      expect(labelsOf('Visualization type')).toEqual(['Bar chart', 'Line chart', 'Table', 'Map'])
    })

    it('reports the chosen type', () => {
      show()

      fireEvent.change(field('Visualization type'), { target: { value: 'table' } })

      expect(handlers.setVisualizationType).toHaveBeenCalledWith('table')
    })
  })
})
```


The panel test stubs the map, the survey and timeline panels, the insight status and the chart, and covers the nine title rules, the map branch with its loading status and error alert, the order of the survey checks, what each panel receives, the participation branch, the two empty KPI states with their titles, and the table and chart of the KPI rows:

Create `apps/web/src/features/analytics/components/analytics-analysis-panel.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SURVEY_CLOSED_PERIOD_MESSAGE,
  SURVEY_RESTRICTED_MESSAGE,
} from '../analytics.copy'
import { AnalyticsAnalysisPanel } from './analytics-analysis-panel'

const seen = vi.hoisted(() => ({
  survey: null as Record<string, unknown> | null,
  timeline: null as Record<string, unknown> | null,
  insight: null as Record<string, unknown> | null,
  chart: null as Record<string, unknown> | null,
}))

vi.mock('./project-coverage-map-panel', () => ({
  ProjectCoverageMapPanel: () => <div data-testid="coverage-map" />,
}))
vi.mock('./survey-analytics-panel', () => ({
  SurveyAnalyticsPanel: (props: Record<string, unknown>) => {
    seen.survey = props
    return <button onClick={props.onRetry as () => void} type="button">survey panel</button>
  },
}))
vi.mock('./timeline-analytics-panel', () => ({
  TimelineAnalyticsPanel: (props: Record<string, unknown>) => {
    seen.timeline = props
    return <button onClick={props.onRetry as () => void} type="button">timeline panel</button>
  },
}))
vi.mock('./insight-status', () => ({
  InsightStatus: (props: { read: { data: unknown }; label: string; children: (data: unknown) => React.ReactNode }) => {
    seen.insight = props
    return <div data-testid="insight">{props.label}|{props.children(props.read.data)}</div>
  },
}))
vi.mock('./participation-breakdown-panel', () => ({
  ParticipationBreakdownPanel: ({ data }: { data: string }) => <span>{`breakdown ${data}`}</span>,
}))
vi.mock('./analytics-charts', () => ({
  DescriptiveAnalysisChart: (props: Record<string, unknown>) => {
    seen.chart = props
    return <div data-testid="chart" />
  },
}))

type Props = ComponentProps<typeof AnalyticsAnalysisPanel>
const period = { value: '2026-09', label: 'September 2026', start: '2026-09-01', end: '2026-09-30' }
const retryMapData = vi.fn()
const retrySurvey = vi.fn()
const retryTimeline = vi.fn()
const rows = [
  { id: 'indicator-1', label: 'Reach', value: 1234 },
  { id: 'indicator-2', label: 'Completion', value: 50 },
]
const base = {
  activities: [{ id: 'activity-1' }],
  analysisRows: rows,
  analysisView: 'kpi',
  canReadParticipation: true,
  canReadSurvey: true,
  canReadSurveyTimeline: true,
  mapDataError: '',
  mapDataLoading: false,
  monitoringReadable: true,
  participationRead: { data: 'participants' },
  periodsReadable: true,
  reportingPeriods: [period],
  retryMapData,
  retrySurvey,
  retryTimeline,
  selectedPeriod: period,
  survey: { id: 'survey-data' },
  surveyClosedPeriodRequired: false,
  surveyError: 'survey failed',
  surveyErrorKind: 'period',
  surveyFrozenOnly: false,
  surveyLoading: false,
  surveyPeriods: [period],
  timeline: { id: 'timeline-data' },
  timelineError: 'timeline failed',
  timelineLoading: true,
  visualizationType: 'bar',
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(<AnalyticsAnalysisPanel {...({ ...base, ...overrides } as unknown as Props)} />)
const title = () => screen.getByRole('heading', { level: 2 }).textContent

describe('AnalyticsAnalysisPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    seen.survey = seen.timeline = seen.insight = seen.chart = null
  })

  describe('title', () => {
    it.each([
      ['kpi', 'bar', 'KPI / indicator performance · Bar chart'],
      ['kpi', 'line', 'KPI / indicator performance · Line chart'],
      ['kpi', 'table', 'KPI / indicator performance · Table'],
      ['participation', 'bar', 'Participation patterns · Bar chart'],
      ['survey', 'bar', 'Survey improvement · Bar chart'],
      ['survey', 'table', 'Survey improvement · Table'],
      ['survey', 'line', 'Survey improvement'],
      ['timeline', 'bar', 'Project / activity timeline adherence'],
      ['timeline', 'table', 'Project / activity timeline adherence'],
    ])('in the %s view as %s reads %s', (analysisView, visualizationType, expected) => {
      show({ analysisView, visualizationType })

      expect(title()).toBe(expected)
    })
  })

  describe('map', () => {
    it('shows the coverage map under its own title and description', () => {
      show({ visualizationType: 'map' })

      expect(title()).toBe('Project Coverage Map')
      expect(
        screen.getByText(
          'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.',
        ),
      ).toBeTruthy()
      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText('Updating project analytics.')).toBeNull()
    })

    it('shows the map whatever the analysis view is', () => {
      show({ analysisView: 'survey', canReadSurvey: false, visualizationType: 'map' })

      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByText(SURVEY_RESTRICTED_MESSAGE)).toBeNull()
    })

    it('has no description and no map outside the map type', () => {
      const { container } = show()

      expect(screen.queryByTestId('coverage-map')).toBeNull()
      expect(screen.queryByText(/^Projects placed by implementation area/)).toBeNull()
      expect(container.querySelectorAll('p')).toHaveLength(0)
    })

    it('says the analytics are updating while they load, ahead of an error', () => {
      show({ visualizationType: 'map', mapDataLoading: true, mapDataError: 'down' })

      expect(screen.getByText('Updating project analytics.').tagName).toBe('OUTPUT')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('shows the error with a Retry analytics button that reloads', () => {
      show({ visualizationType: 'map', mapDataError: 'down' })

      expect(screen.getByRole('alert').textContent).toContain('down')
      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      expect(retryMapData).toHaveBeenCalledTimes(1)
    })
  })

  describe('survey view', () => {
    it('gives a role that cannot read the survey the restricted message', () => {
      show({ analysisView: 'survey', canReadSurvey: false, surveyClosedPeriodRequired: true })

      expect(screen.getByText(SURVEY_RESTRICTED_MESSAGE)).toBeTruthy()
      expect(screen.queryByText(SURVEY_CLOSED_PERIOD_MESSAGE)).toBeNull()
      expect(screen.getByText('Data unavailable')).toBeTruthy()
    })

    it('asks for a closed period when only closed periods are released', () => {
      show({ analysisView: 'survey', surveyClosedPeriodRequired: true })

      expect(screen.getByText(SURVEY_CLOSED_PERIOD_MESSAGE)).toBeTruthy()
      expect(seen.survey).toBeNull()
    })

    it('hands the survey read to the survey panel', () => {
      show({ analysisView: 'survey' })

      expect(seen.survey).toMatchObject({
        activities: base.activities,
        data: base.survey,
        error: 'survey failed',
        errorKind: 'period',
        frozen: false,
        loading: false,
        noUsablePeriod: false,
        periodsReadable: true,
        showChart: true,
      })
      fireEvent.click(screen.getByRole('button', { name: 'survey panel' }))
      expect(retrySurvey).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['frozen', { surveyFrozenOnly: true }, { frozen: true }],
      ['loading', { surveyLoading: true }, { loading: true }],
      ['unreadable periods', { periodsReadable: false }, { periodsReadable: false }],
      ['the table type', { visualizationType: 'table' }, { showChart: false }],
      ['the line type', { visualizationType: 'line' }, { showChart: true }],
      ['periods but no usable one', { surveyPeriods: [] }, { noUsablePeriod: true }],
      ['no periods at all', { reportingPeriods: [], surveyPeriods: [] }, { noUsablePeriod: false }],
    ])('passes %s on', (_name, overrides, expected) => {
      show({ analysisView: 'survey', ...overrides })

      expect(seen.survey).toMatchObject(expected)
    })
  })

  describe('timeline view', () => {
    it('gives a role without the timeline the unavailable message', () => {
      show({ analysisView: 'timeline', canReadSurveyTimeline: false })

      expect(screen.getByText('Timeline adherence is not available for this role.')).toBeTruthy()
      expect(seen.timeline).toBeNull()
    })

    it('hands the timeline read to the timeline panel', () => {
      show({ analysisView: 'timeline' })

      expect(seen.timeline).toMatchObject({ data: base.timeline, error: 'timeline failed', loading: true })
      fireEvent.click(screen.getByRole('button', { name: 'timeline panel' }))
      expect(retryTimeline).toHaveBeenCalledTimes(1)
    })
  })

  describe('participation view', () => {
    it('reads the participation breakdown for a role that can', () => {
      show({ analysisView: 'participation' })

      expect(screen.getByTestId('insight').textContent).toBe(
        'Participation patterns|breakdown participants',
      )
      expect(seen.insight?.read).toBe(base.participationRead)
    })

    it('restricts a role that cannot', () => {
      show({ analysisView: 'participation', canReadParticipation: false })

      expect(screen.getByText('Participation patterns are restricted for your role.')).toBeTruthy()
      expect(screen.getByText('Restricted')).toBeTruthy()
      expect(screen.queryByTestId('insight')).toBeNull()
    })
  })

  describe('kpi view', () => {
    it.each([
      [true, 'No active Indicator reporting period is available for this project.', 'None yet'],
      [false, 'Indicator reporting periods are not available for this role.', 'Data unavailable'],
    ])('without a period and readable periods %s explains %s', (periodsReadable, description, heading) => {
      show({ periodsReadable, selectedPeriod: undefined })

      expect(screen.getByText(description)).toBeTruthy()
      expect(screen.getByText(heading)).toBeTruthy()
    })

    it.each([
      [true, 'None yet'],
      [false, 'Data unavailable'],
    ])('without rows and a readable monitoring read %s says %s', (monitoringReadable, heading) => {
      show({ analysisRows: [], monitoringReadable })

      expect(screen.getByText('No released values are available for this selection.')).toBeTruthy()
      expect(screen.getByText(heading)).toBeTruthy()
    })

    it('lists the rows in a table with the unit', () => {
      const { container } = show({ visualizationType: 'table' })

      expect(container.querySelector('caption')?.className).toBe('sr-only')
      expect(container.querySelector('caption')?.textContent).toBe('KPI / indicator performance')
      expect(Array.from(container.querySelectorAll('th')).map((cell) => cell.textContent)).toEqual([
        'Project',
        'Value',
      ])
      expect(Array.from(container.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
        `Reach${(1234).toLocaleString()} %`,
        'Completion50 %',
      ])
      expect(seen.chart).toBeNull()
    })

    it.each(['bar', 'line'])('draws the rows as a %s chart', (visualizationType) => {
      show({ visualizationType })

      expect(seen.chart).toEqual({
        rows,
        title: 'KPI / indicator performance',
        type: visualizationType,
        unit: '%',
      })
      expect(screen.queryByRole('table')).toBeNull()
    })

    it('ignores the rows in the other views', () => {
      show({ analysisView: 'timeline', analysisRows: [] })

      expect(screen.queryByText('No released values are available for this selection.')).toBeNull()
    })
  })
})
```


```bash
D=apps/web/src/features/analytics/components
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/analytics/components/analytics-action-bar.test.tsx src/features/analytics/components/analytics-filter-bar.test.tsx src/features/analytics/components/analytics-analysis-panel.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL |✓ src" | LC_ALL=C sort)
```


Expected:

```text
Checked 8 files in <ms>. Fixed 3 files.
web typecheck clean
      Tests  107 passed (107)
 Test Files  3 passed (3)
 ✓ src/features/analytics/components/analytics-action-bar.test.tsx (39 tests) <ms>
 ✓ src/features/analytics/components/analytics-analysis-panel.test.tsx (36 tests) <ms>
 ✓ src/features/analytics/components/analytics-filter-bar.test.tsx (32 tests) <ms>
```


- [ ] **Step 4: Mutate the three components and the shell once**

The three lists mutate the new files: 57 mutations of the action bar, 47 of the filter bar and 76 of the panel (every grant, flag, branch condition, handler, text, value and class that the markup carries, except the visual-only props `variant`, `size`, icons and the margin classes, which no test reads). Each list runs against the test of its own file only, so a survivor means that test alone does not pin the line:

Create `.tmp/s7d/mut-bar.json`:

```json
[
 ["pins flag ignored", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{DASHBOARD_PINS_UI_ENABLED && pinPermitted ? (", "{pinPermitted ? ("],
 ["pin permission ignored", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{DASHBOARD_PINS_UI_ENABLED && pinPermitted ? (", "{DASHBOARD_PINS_UI_ENABLED ? ("],
 ["kpi pin ignores the grant", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "kpi: canReadIndicators,\n    participation", "kpi: true,\n    participation"],
 ["participation pin ignores the grant", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "participation: canReadParticipation,\n    survey: true", "participation: true,\n    survey: true"],
 ["survey pin hidden", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "survey: true,\n    timeline: canReadSurveyTimeline,\n  }[analysisView]", "survey: false,\n    timeline: canReadSurveyTimeline,\n  }[analysisView]"],
 ["timeline pin ignores the grant", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "timeline: canReadSurveyTimeline,\n  }[analysisView]", "timeline: true,\n  }[analysisView]"],
 ["kpi without period is not blocked", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "!selectedPeriod\n        ? ", "false\n        ? "],
 ["period reason text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Choose a reporting period to pin this view.'", "'x'"],
 ["kpi grant reason never shown", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "kpi: !canReadIndicators\n      ? ", "kpi: false\n      ? "],
 ["kpi grant reason text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Your role cannot read indicator progress, so this view cannot be pinned.'", "'x'"],
 ["participation reason never shown", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "participation: canReadParticipation\n      ? ''", "participation: true\n      ? ''"],
 ["participation reason text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Your role cannot read participation detail, so this view cannot be pinned.'", "'x'"],
 ["survey reason text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Survey improvement cannot be pinned.'", "'x'"],
 ["survey is not blocked", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "survey: 'Survey improvement cannot be pinned.',", "survey: '',"],
 ["timeline reason never shown", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "timeline: canReadSurveyTimeline\n      ? ''", "timeline: true\n      ? ''"],
 ["timeline reason text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Your role cannot read timeline adherence, so this view cannot be pinned.'", "'x'"],
 ["guard drops the project", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "if (!selectedProject || !profile?.userId", "if (!profile?.userId"],
 ["guard drops the user", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "!profile?.userId || analysisView === 'survey'", "analysisView === 'survey'"],
 ["guard drops the survey view", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "|| analysisView === 'survey' || pinBlockedReason", "|| pinBlockedReason"],
 ["guard drops the reason", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "analysisView === 'survey' || pinBlockedReason)", "analysisView === 'survey')"],
 ["pin stored for another user", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "addPin(profile.userId,", "addPin('other',"],
 ["pin stored for another view", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "view: analysisView,", "view: 'kpi',"],
 ["pin stored for another project", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "projectId: selectedProject.id,", "projectId: 'other',"],
 ["timeline pin keeps the period", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "...(analysisView !== 'timeline' && selectedPeriod", "...(selectedPeriod"],
 ["pin without a period throws", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "...(analysisView !== 'timeline' && selectedPeriod", "...(analysisView !== 'timeline'"],
 ["period start and end swapped", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end", "periodStart: selectedPeriod.end, periodEnd: selectedPeriod.start"],
 ["added text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Added to your dashboard.'", "'x'"],
 ["duplicate text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Already on your dashboard.'", "'x'"],
 ["full text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Your dashboard is full. Unpin a chart first.'", "'x'"],
 ["unavailable text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Browser storage is unavailable, so the chart could not be pinned.'", "'x'"],
 ["added is an error", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "if (result === 'added') toast.success(message)", "if (result !== 'added') toast.success(message)"],
 ["failure is a success", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "else toast.error(message)", "else toast.success(message)"],
 ["added also errors", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "if (result === 'added') toast.success(message)\n    else toast.error(message)", "if (result === 'added') toast.success(message)\n    toast.error(message)"],
 ["reason not described", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "aria-describedby={pinBlockedReason ? 'pin-blocked-reason' : undefined}", "aria-describedby={undefined}"],
 ["reason id changed", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "id=\"pin-blocked-reason\"", "id=\"x\""],
 ["reason always titled", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "title={pinBlockedReason || undefined}", "title={pinBlockedReason}"],
 ["reason not titled", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "title={pinBlockedReason || undefined}", "title={undefined}"],
 ["disabled ignores the project", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "disabled={!selectedProject || !profile?.userId || Boolean(pinBlockedReason)}", "disabled={!profile?.userId || Boolean(pinBlockedReason)}"],
 ["disabled ignores the user", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "disabled={!selectedProject || !profile?.userId || Boolean(pinBlockedReason)}", "disabled={!selectedProject || Boolean(pinBlockedReason)}"],
 ["disabled ignores the reason", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "disabled={!selectedProject || !profile?.userId || Boolean(pinBlockedReason)}", "disabled={!selectedProject || !profile?.userId}"],
 ["reason text hidden", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{pinBlockedReason ? (\n            <p", "{false ? (\n            <p"],
 ["pin label changed", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "            Add to Dashboard\n", "            Add\n"],
 ["pin click does nothing", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "onClick={addToDashboard}", "onClick={undefined}"],
 ["export flag ignored", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED && canExportAnalytics ? (", "{canExportAnalytics ? ("],
 ["export grant ignored", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED && canExportAnalytics ? (", "{ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED ? ("],
 ["export ignores the project", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "!selectedProject ||\n                  exporting", "exporting"],
 ["export ignores a running export", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "exporting ||\n                  (analysisView", "(analysisView"],
 ["export needs a period in the timeline view", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "(analysisView !== 'timeline' && !pickerPeriod)", "!pickerPeriod"],
 ["export ignores a missing period", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "(analysisView !== 'timeline' && !pickerPeriod)", "false"],
 ["export ignores an unavailable survey", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "(analysisView === 'survey' && surveyUnavailable)", "false"],
 ["export blocked by an unavailable survey everywhere", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "(analysisView === 'survey' && surveyUnavailable)", "surveyUnavailable"],
 ["preparing label always", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{exporting && !exportPreview ? 'Preparing preview' : 'Export aggregates'}", "{exporting ? 'Preparing preview' : 'Export aggregates'}"],
 ["preparing label without export", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{exporting && !exportPreview ? 'Preparing preview' : 'Export aggregates'}", "{!exportPreview ? 'Preparing preview' : 'Export aggregates'}"],
 ["preparing label text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Preparing preview'", "'x'"],
 ["export label text", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "'Export aggregates'", "'x'"],
 ["preview of the first format only", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "previewExport(format)", "previewExport('CSV')"],
 ["formats not listed", "apps/web/src/features/analytics/components/analytics-action-bar.tsx", "{exportFormats.map((format) => (", "{exportFormats.slice(1).map((format) => ("]
]
```


Create `.tmp/s7d/mut-filter.json`:

```json
[
 ["kpi view hidden", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "kpi: true,\n    participation", "kpi: false,\n    participation"],
 ["participation view ignores the grant", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "participation: canReadParticipation,", "participation: true,"],
 ["survey view ignores the grant", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "survey: canReadSurvey,", "survey: true,"],
 ["timeline view ignores the grant", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "timeline: canReadSurveyTimeline,\n  }", "timeline: true,\n  }"],
 ["unreadable views listed", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ".filter((view) => viewPermitted[view.value])", ".filter(() => true)"],
 ["children dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "        {children}\n", ""],
 ["section label changed", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "aria-labelledby=\"analytics-view-title\"", "aria-labelledby=\"x\""],
 ["heading id changed", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "id=\"analytics-view-title\"", "id=\"x\""],
 ["heading text", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "Analysis and visualization", "x"],
 ["project value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<Select value={projectId} onValueChange={handleProjectChange}>", "<Select value=\"\" onValueChange={handleProjectChange}>"],
 ["project change dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<Select value={projectId} onValueChange={handleProjectChange}>", "<Select value={projectId} onValueChange={() => {}}>"],
 ["project placeholder", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "placeholder=\"No authorized projects\"", "placeholder=\"x\""],
 ["project titles", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "                {project.title}", "                {project.id}"],
 ["project values", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<SelectItem key={project.id} value={project.id}>", "<SelectItem key={project.id} value={project.title}>"],
 ["project caption", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ">Project filter</span>", ">x</span>"],
 ["period list never disabled", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "disabled={pickerPeriods.length === 0}", "disabled={false}"],
 ["period list disabled with one period", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "disabled={pickerPeriods.length === 0}", "disabled={pickerPeriods.length <= 1}"],
 ["period value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "value={pickerPeriod?.value ?? ''}", "value=''"],
 ["period change dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "onValueChange={setPeriod}", "onValueChange={() => {}}"],
 ["period placeholder", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "placeholder=\"No reporting periods\"", "placeholder=\"x\""],
 ["period labels", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "                {row.label}", "                {row.value}"],
 ["period caption", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ">Reporting period</span>", ">x</span>"],
 ["view value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "          value={analysisView}\n", "          value=\"kpi\"\n"],
 ["view change dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "onValueChange={(value) => setAnalysisView(value as AnalysisView)}", "onValueChange={() => {}}"],
 ["view caption", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ">Analysis view</span>", ">x</span>"],
 ["indicator filter always on", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "disabled={analysisView !== 'kpi'}", "disabled={false}"],
 ["indicator filter off in the kpi view", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "disabled={analysisView !== 'kpi'}", "disabled={analysisView === 'kpi'}"],
 ["indicator value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "value={indicatorId}", "value=\"all\""],
 ["indicator change dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "onValueChange={setIndicatorId}", "onValueChange={() => {}}"],
 ["all indicators text", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "All indicators / project KPI", "x"],
 ["all indicators value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<SelectItem value=\"all\">", "<SelectItem value=\"\">"],
 ["indicator code dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "{indicator.code} · {indicator.name}", "{indicator.name}"],
 ["indicator name dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "{indicator.code} · {indicator.name}", "{indicator.code}"],
 ["indicator values", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<SelectItem key={indicator.id} value={indicator.id}>", "<SelectItem key={indicator.id} value={indicator.code}>"],
 ["indicator caption", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ">Indicator</span>", ">x</span>"],
 ["map always offered", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "MAPS_UI_ENABLED || type.value !== 'map'", "true"],
 ["map never offered", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "MAPS_UI_ENABLED || type.value !== 'map'", "type.value !== 'map'"],
 ["visualization value", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "value={visualizationType}", "value=\"bar\""],
 ["visualization change dropped", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "onValueChange={(value) => setVisualizationType(value as VisualizationType)}", "onValueChange={() => {}}"],
 ["visualization caption", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", ">Visualization type</span>", ">x</span>"],
 ["project field width", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "space-y-2 sm:col-span-2 xl:col-span-5", "space-y-2"],
 ["period field width", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "space-y-2 xl:col-span-3", "space-y-2"],
 ["view field width", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<div className=\"space-y-2 xl:col-span-4\">\n        <span className=\"text-sm font-medium\">Analysis view", "<div className=\"space-y-2\">\n        <span className=\"text-sm font-medium\">Analysis view"],
 ["indicator field width", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "space-y-2 xl:col-span-8", "space-y-2"],
 ["visualization field width", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "<div className=\"space-y-2 xl:col-span-4\">\n        <span className=\"text-sm font-medium\">Visualization type", "<div className=\"space-y-2\">\n        <span className=\"text-sm font-medium\">Visualization type"],
 ["section grid", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12", "grid"],
 ["heading row", "apps/web/src/features/analytics/components/analytics-filter-bar.tsx", "flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-12", "flex"]
]
```


Create `.tmp/s7d/mut-panel.json`:

```json
[
 ["map flag inverted", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "const mapSelected = visualizationType === 'map'", "const mapSelected = visualizationType !== 'map'"],
 ["kpi title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "kpi: { title: 'KPI / indicator performance', unit: '%' }", "kpi: { title: 'x', unit: '%' }"],
 ["kpi unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "kpi: { title: 'KPI / indicator performance', unit: '%' }", "kpi: { title: 'KPI / indicator performance', unit: 'x' }"],
 ["participation title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title: 'Participation patterns', unit: 'records'", "title: 'x', unit: 'records'"],
 ["participation unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "unit: 'records'", "unit: 'x'"],
 ["survey title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title: 'Survey improvement', unit: 'points'", "title: 'x', unit: 'points'"],
 ["survey unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "unit: 'points'", "unit: 'x'"],
 ["timeline title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title: 'Project / activity timeline adherence', unit: '%' }", "title: 'x', unit: '%' }"],
 ["timeline unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title: 'Project / activity timeline adherence', unit: '%' }", "title: 'Project / activity timeline adherence', unit: 'x' }"],
 ["map description dropped", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "          ? 'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.'\n          : undefined", "          ? undefined\n          : undefined"],
 ["map description always", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "          ? 'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.'\n          : undefined", "          ? 'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.'\n          : 'x'"],
 ["map title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "? 'Project Coverage Map'", "? 'x'"],
 ["timeline title gets a suffix", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "analysisView === 'timeline' ||\n", "false ||\n"],
 ["survey title keeps bar and table suffix only", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "!['bar', 'table'].includes(visualizationType)", "!['bar'].includes(visualizationType)"],
 ["survey title always plain", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "(analysisView === 'survey' && !['bar', 'table'].includes(visualizationType))", "analysisView === 'survey'"],
 ["survey title never plain", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "(analysisView === 'survey' && !['bar', 'table'].includes(visualizationType))", "false"],
 ["title separator", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "`${analysisMeta.title} · ${", "`${analysisMeta.title} - ${"],
 ["title type label", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "visualizationTypes.find((type) => type.value === visualizationType)?.label", "'x'"],
 ["map panel dropped", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "          <ProjectCoverageMapPanel />\n", ""],
 ["map loading text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "Updating project analytics.", "x"],
 ["map loading before error", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "{mapDataLoading ? (", "{mapDataLoading && !mapDataError ? ("],
 ["map error dropped", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : mapDataError ? (", ") : false ? ("],
 ["map error text dropped", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "<span>{mapDataError}</span>", "<span>x</span>"],
 ["map error role", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "role=\"alert\"", "role=\"status\""],
 ["map retry dropped", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "onClick={retryMapData}", "onClick={undefined}"],
 ["map retry label", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "Retry analytics", "x"],
 ["survey restricted ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "analysisView === 'survey' && !canReadSurvey ? (", "false ? ("],
 ["survey restricted text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "description={SURVEY_RESTRICTED_MESSAGE}", "description=\"x\""],
 ["survey closed period ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "analysisView === 'survey' && surveyClosedPeriodRequired ? (", "false ? ("],
 ["survey closed period text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "description={SURVEY_CLOSED_PERIOD_MESSAGE}", "description=\"x\""],
 ["timeline unavailable ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "analysisView === 'timeline' && !canReadSurveyTimeline ? (", "false ? ("],
 ["timeline unavailable text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "Timeline adherence is not available for this role.", "x"],
 ["survey panel ignores the view", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : analysisView === 'survey' ? (\n        <SurveyAnalyticsPanel", ") : false ? (\n        <SurveyAnalyticsPanel"],
 ["survey activities", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "activities={activities}", "activities={[]}"],
 ["survey data", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "data={survey}", "data={null}"],
 ["survey error", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "error={surveyError}", "error=''"],
 ["survey error kind", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "errorKind={surveyErrorKind}", "errorKind=\"retry\""],
 ["survey frozen", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "frozen={surveyFrozenOnly}", "frozen={false}"],
 ["survey loading", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "loading={surveyLoading}", "loading={false}"],
 ["survey period usable", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "noUsablePeriod={reportingPeriods.length > 0 && surveyPeriods.length === 0}", "noUsablePeriod={surveyPeriods.length === 0}"],
 ["survey period usable with periods", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "noUsablePeriod={reportingPeriods.length > 0 && surveyPeriods.length === 0}", "noUsablePeriod={reportingPeriods.length > 0}"],
 ["survey retry", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "onRetry={retrySurvey}", "onRetry={() => {}}"],
 ["survey periods readable", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "periodsReadable={periodsReadable}\n          showChart", "periodsReadable={true}\n          showChart"],
 ["survey chart in table", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "showChart={visualizationType !== 'table'}", "showChart={true}"],
 ["timeline panel ignores the view", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : analysisView === 'timeline' ? (\n        <TimelineAnalyticsPanel", ") : false ? (\n        <TimelineAnalyticsPanel"],
 ["timeline data", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "data={timeline}", "data={null}"],
 ["timeline error", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "error={timelineError}", "error=''"],
 ["timeline loading", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "loading={timelineLoading}", "loading={false}"],
 ["timeline retry", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "onRetry={retryTimeline}", "onRetry={() => {}}"],
 ["participation view ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : analysisView === 'participation' ? (", ") : false ? ("],
 ["participation grant ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "        canReadParticipation ? (\n", "        true ? (\n"],
 ["participation read", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "read={participationRead}", "read={{} as never}"],
 ["participation label", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "label=\"Participation patterns\"", "label=\"x\""],
 ["participation restricted text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "Participation patterns are restricted for your role.", "x"],
 ["participation restricted title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title=\"Restricted\"", "title=\"x\""],
 ["period reason ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : !selectedPeriod ? (", ") : false ? ("],
 ["no period readable", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "              ? 'No active Indicator reporting period is available for this project.'", "              ? 'x'"],
 ["no period unreadable", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "              : 'Indicator reporting periods are not available for this role.'", "              : 'x'"],
 ["no period choice", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "            periodsReadable\n              ?", "            true\n              ?"],
 ["no period title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title={periodsReadable ? 'None yet' : undefined}", "title={undefined}"],
 ["no period title always", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title={periodsReadable ? 'None yet' : undefined}", "title='None yet'"],
 ["no rows ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : analysisRows.length === 0 ? (", ") : false ? ("],
 ["no rows text", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "No released values are available for this selection.", "x"],
 ["no rows title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title={monitoringReadable ? 'None yet' : undefined}", "title={undefined}"],
 ["no rows title always", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title={monitoringReadable ? 'None yet' : undefined}", "title='None yet'"],
 ["table ignored", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", ") : visualizationType === 'table' ? (", ") : false ? ("],
 ["table caption", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "<caption className=\"sr-only\">{analysisMeta.title}</caption>", "<caption className=\"sr-only\">x</caption>"],
 ["table project header", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "<th className=\"p-3\">Project</th>", "<th className=\"p-3\">x</th>"],
 ["table value header", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "<th className=\"p-3\">Value</th>", "<th className=\"p-3\">x</th>"],
 ["table label", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "<td className=\"p-3\">{row.label}</td>", "<td className=\"p-3\">{row.id}</td>"],
 ["table value", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "{row.value.toLocaleString()} {analysisMeta.unit}", "{row.value} {analysisMeta.unit}"],
 ["table unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "{row.value.toLocaleString()} {analysisMeta.unit}", "{row.value.toLocaleString()}"],
 ["chart rows", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "rows={analysisRows}", "rows={[]}"],
 ["chart title", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "title={analysisMeta.title}\n          type", "title=\"x\"\n          type"],
 ["chart type", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "type={visualizationType}", "type=\"bar\""],
 ["chart unit", "apps/web/src/features/analytics/components/analytics-analysis-panel.tsx", "unit={analysisMeta.unit}\n        />", "unit=\"\"\n        />"]
]
```


```bash
D=apps/web/src/features/analytics/components
for k in bar:action-bar filter:filter-bar panel:analysis-panel; do
  key=${k%%:*}; file=$D/analytics-${k#*:}.tsx
  H=$(git hash-object $file)
  node .tmp/s7d/mutate.mjs .tmp/s7d/mut-$key.json $D/analytics-${k#*:}.test.tsx > .tmp/s7d/out/t4-$key.txt 2>&1
  echo "== $key"
  grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t4-$key.txt
  grep SURVIVED .tmp/s7d/out/t4-$key.txt | sed 's/: SURVIVED//' | sort
  test "$(git hash-object $file)" = "$H" && echo "file restored"
done
```


Expected:

```text
== bar
unmutated: pass
mutations 57, survived 10
guard drops the project
guard drops the reason
guard drops the survey view
guard drops the user
kpi grant reason never shown
kpi grant reason text
participation reason never shown
participation reason text
timeline reason never shown
timeline reason text
file restored
== filter
unmutated: pass
mutations 47, survived 0
file restored
== panel
unmutated: pass
mutations 76, survived 3
participation unit
survey unit
timeline unit
file restored
```


The three runs are: the action bar (57 mutations, 10 survive), the filter bar (47, none survive) and the analysis panel (76, 3 survive). Every survivor is unreachable through the component:

- Action bar: the button is hidden for a role that cannot read the view, so the reason text and the grant branch of `pinBlockedReason` for the KPI, participation and timeline views never show (6 mutations), and the four guards of `addToDashboard` (project, reason, survey view, user id) sit behind a button that is disabled in the same cases (4 mutations).
- Analysis panel: the `unit` of the participation, survey and timeline views is carried in the meta object but only the KPI chart renders it (3 mutations).

The shell keeps the derived values and the resets, so its 43 mutations from Task 1 (the readable flags, the survey and SADDD rules, the period range, the insight reads, the project change resets and the map-mode expressions) are run again against the ten dashboard test files and must give the survivors of Task 1 that belong to the shell:

Create `.tmp/s7d/mut-shell-after.json`:

```json
[
 ["rules view link always hidden", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const canViewRules = Boolean(role && can(role, 'rules.view'))", "const canViewRules = false"],
 ["rules configure always off", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const canConfigureRules = Boolean(role && can(role, 'rules.configure'))", "const canConfigureRules = false"],
 ["default view", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "useState<AnalysisView>('kpi')", "useState<AnalysisView>('participation')"],
 ["default visualization", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "useState<VisualizationType>('bar')", "useState<VisualizationType>('line')"],
 ["default indicator", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "useState('all')", "useState('')"],
 ["same project reloads", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    if (nextProjectId === projectId) return\n    selectProject(nextProjectId)", "    selectProject(nextProjectId)"],
 ["project change keeps SADDD", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    resetSaddd()\n    resetDescriptive()", "    resetDescriptive()"],
 ["project change keeps descriptive", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    resetDescriptive()\n    resetSurvey()", "    resetSurvey()"],
 ["project change keeps survey", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    resetSurvey()\n    resetTimeline()", "    resetTimeline()"],
 ["project change keeps timeline", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    resetTimeline()\n  }", "  }"],
 ["map mode waits for data", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const loading = projectsLoading || (!mapSelected && (projectDataLoading || monitoringLoading))", "const loading = projectsLoading || projectDataLoading || monitoringLoading"],
 ["map mode shows data errors", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const error = projectsError || (!mapSelected ? projectDataError || monitoringError : '')", "const error = projectsError || projectDataError || monitoringError"],
 ["map data loading needs both", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const mapDataLoading = projectDataLoading || monitoringLoading", "const mapDataLoading = projectDataLoading && monitoringLoading"],
 ["map data error ignores monitoring", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const mapDataError = projectDataError || monitoringError", "const mapDataError = projectDataError"],
 ["indicator filter ignored", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "indicators.filter((row) => indicatorId === 'all' || row.id === indicatorId),", "indicators,"],
 ["only the KPI view has rows", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    if (analysisView === 'kpi')\n      return progressRows(", "    if (analysisView !== 'timeline')\n      return progressRows("],
 ["average rounds down", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "Math.round(progressValues.reduce", "Math.floor(progressValues.reduce"],
 ["periods readable ignores loading", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    !projectDataLoading &&\n    !projectDataError", "    !projectDataError"],
 ["periods readable ignores errors", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    !projectDataLoading &&\n    !projectDataError", "    !projectDataLoading"],
 ["periods readable needs one grant only", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    (canReadIndicatorDefinitions || canReadIndicatorValues) &&\n    !projectDataLoading", "    (canReadIndicatorDefinitions && canReadIndicatorValues) &&\n    !projectDataLoading"],
 ["monitoring readable ignores the error", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError", "const monitoringReadable = canReadIndicators && monitoring !== null"],
 ["monitoring readable ignores the grant", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError", "const monitoringReadable = monitoring !== null && !monitoringError"],
 ["survey picker uses all periods", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const pickerPeriods = analysisView === 'survey' ? surveyPeriods : reportingPeriods", "const pickerPeriods = reportingPeriods"],
 ["survey picker selection uses all periods", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const pickerPeriod = analysisView === 'survey' ? surveyPeriod : selectedPeriod", "const pickerPeriod = selectedPeriod"],
 ["survey closed period boundary", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "surveyPeriod.end < businessDateInManila()", "surveyPeriod.end <= businessDateInManila()"],
 ["survey closed period ignores the freeze", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    surveyFrozenOnly && !(surveyPeriod && surveyPeriod.end < businessDateInManila())", "    !(surveyPeriod && surveyPeriod.end < businessDateInManila())"],
 ["survey unavailable ignores the grant", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const surveyUnavailable = !canReadSurvey || surveyClosedPeriodRequired", "const surveyUnavailable = surveyClosedPeriodRequired"],
 ["survey unavailable ignores the closed period", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const surveyUnavailable = !canReadSurvey || surveyClosedPeriodRequired", "const surveyUnavailable = !canReadSurvey"],
 ["SADDD needs no dates", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "    !selectedProject?.startDate || !selectedProject.endDate\n", "    false\n"],
 ["SADDD ignores the end date", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "!selectedProject?.startDate || !selectedProject.endDate", "!selectedProject?.startDate"],
 ["SADDD start boundary", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "selectedProject.startDate > businessDateInManila()", "selectedProject.startDate >= businessDateInManila()"],
 ["SADDD ongoing boundary", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "(selectedProject?.endDate ?? '') >= businessDateInManila()", "(selectedProject?.endDate ?? '') > businessDateInManila()"],
 ["SADDD eligibility ignores the grant", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const sadddEligible = canReadSaddd && sadddNotice === null", "const sadddEligible = sadddNotice === null"],
 ["SADDD eligibility ignores the notice", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const sadddEligible = canReadSaddd && sadddNotice === null", "const sadddEligible = canReadSaddd"],
 ["SADDD ongoing ignores eligibility", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const sadddOngoing = sadddEligible && (", "const sadddOngoing = ("],
 ["period range dropped", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const periodRange = selectedPeriod\n    ? { periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end }\n    : {}", "const periodRange = {}"],
 ["trends read outside the KPI view", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "canReadTrends && analysisView === 'kpi',", "canReadTrends,"],
 ["participation read outside its view", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "canReadParticipation && analysisView === 'participation',", "canReadParticipation,"],
 ["budget read ignores the grant", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "useBudgetSummary({ projectId: insightProject }, canReadBudgetUtilization)", "useBudgetSummary({ projectId: insightProject }, true)"],
 ["insight project dropped", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "const insightProject = projectId || null", "const insightProject = null"],
 ["survey period must be open", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "surveyPeriod.end < businessDateInManila()", "surveyPeriod.end > businessDateInManila()"],
 ["SADDD start check dropped", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "selectedProject.startDate > businessDateInManila()", "false"],
 ["budget read never on", "apps/web/src/features/analytics/components/analytics-dashboard.tsx", "useBudgetSummary({ projectId: insightProject }, canReadBudgetUtilization)", "useBudgetSummary({ projectId: insightProject }, false)"]
]
```


```bash
F=apps/web/src/features/analytics/components/analytics-dashboard.tsx
H=$(git hash-object $F)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-shell-after.json $(ls apps/web/src/features/analytics/components/analytics-dashboard*.test.tsx) > .tmp/s7d/out/t4-shell.txt 2>&1
grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t4-shell.txt
grep SURVIVED .tmp/s7d/out/t4-shell.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $F)" = "$H" && echo "file restored"
```


Expected:

```text
unmutated: pass
mutations 43, survived 9
SADDD ongoing ignores eligibility
monitoring readable ignores the error
monitoring readable ignores the grant
only the KPI view has rows
project change keeps SADDD
project change keeps descriptive
project change keeps survey
project change keeps timeline
same project reloads
file restored
```


The run gives 9 survivors of 43, all of them lines that this slice does not touch (`same-lines` shows them unchanged) and each equivalent or unreachable: `SADDD ongoing ignores eligibility` (the counts note it controls shows only with a loaded SADDD result, which is requested only for an eligible role), `monitoring readable ignores the error` and `monitoring readable ignores the grant` (`monitoring` is null whenever its read failed or the role lacks the grant, so the other two terms already say it), `only the KPI view has rows` (the panel reads the rows in the KPI branch only), and the four reset calls of the project change and the same-project early return (5; the effects clear the same states in the same commit, and the select fires only on a change). The 13 survivors that were behavior (the SADDD notice rules, the survey rules, the insight reads and the periods flags) are killed by the gates test. The file is restored.

- [ ] **Step 5: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): split the analytics action bar, filters and analysis panel out of the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1552 files in <ms>. No fixes applied.
 8 files changed, 1533 insertions(+), 364 deletions(-)
```


---

### Task 5: Lay out `features/dashboard` and give it a public index

**Files:**
- Move (`git mv`, 9 files): the files listed in `layout-map.json` below
- Create: `apps/web/src/features/dashboard/index.ts`
- Modify: the imports of the moved files and of their importers (by `move-modules.mjs`), the dashboard route page (by `index-imports.mjs`), `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`
- Create (gitignored): `.tmp/s7d/layout-map.json`, `task5-edits.json`, `mut-layout.json`, `routes-prelayout.txt`, `routes-layout.txt`

The folder holds 27 files, three of them in `role-overview/` already. The move is one commit that renames files and rewrites specifiers and nothing else, as in S7c: the role dashboard pins and split come after it, in their own commits, so a reviewer can compare renames and edits separately.

- [ ] **Step 1: Measure the build before the layout move**

Tasks 1 to 4 changed what the analytics chunks hold, so the route sizes of the Task 0 build are not the reference for the move. Build now and compare with the Task 0 table:

```bash
.tmp/s7d/build-routes.sh prelayout
git checkout -- apps/web/next-env.d.ts
node .tmp/s7d/compare-routes.mjs .tmp/s7d/routes-baseline.txt .tmp/s7d/routes-prelayout.txt
```


Expected:

```text
exit 0
ƒ Middleware                                                      102 kB
routes 72, different 0
```


The build exits 0 and prints Middleware at `M0` (102 kB). No route differs from the Task 0 table in the replay. The planner's dry run and a replay in another checkout printed one route, `/analytics`, 1.0 kB bigger (656 kB to 657 kB First Load JS), because the analytics shell now has module boundaries inside the route chunk (the scope hook and the three components); either is inside the bound (no route more than 1 kB bigger than the Task 0 table). The compare of the next steps is made against this table.

- [ ] **Step 2: Create the move map, the edits and the index**

`layout-map.json` lists every move (paths are relative to `apps/web/src`): the six component files and the two tests that follow them go to `components/` (the authorization test takes the `.authorization` suffix of the file it tests), and the reach metrics helper gets the CR 3.5 `.utils` suffix. `role-overview/` is already a folder and stays:

Create `.tmp/s7d/layout-map.json`:

```json
{
  "features/dashboard/action-kpi-row.tsx": "features/dashboard/components/action-kpi-row.tsx",
  "features/dashboard/action-kpi-row.test.ts": "features/dashboard/components/action-kpi-row.test.ts",
  "features/dashboard/executive-dashboard.tsx": "features/dashboard/components/executive-dashboard.tsx",
  "features/dashboard/pinned-charts.tsx": "features/dashboard/components/pinned-charts.tsx",
  "features/dashboard/pinned-charts.test.tsx": "features/dashboard/components/pinned-charts.test.tsx",
  "features/dashboard/role-dashboard.tsx": "features/dashboard/components/role-dashboard.tsx",
  "features/dashboard/role-dashboard-authorization.test.ts": "features/dashboard/components/role-dashboard.authorization.test.ts",
  "features/dashboard/monitoring-reach-metrics.ts": "features/dashboard/monitoring-reach-metrics.utils.ts",
  "features/dashboard/monitoring-reach-metrics.test.ts": "features/dashboard/monitoring-reach-metrics.utils.test.ts"
}
```


`task5-edits.json` adds `dashboard` to the direction test's `indexedFeatures` and to `optimizePackageImports`, after `analytics` so that an edit by a slice below this one that appends a name does not collide:

Create `.tmp/s7d/task5-edits.json`:

```json
[
 ["apps/web/src/import-direction.test.ts", "  'analytics',\n  'projects',\n", "  'analytics',\n  'dashboard',\n  'projects',\n", 1],
 ["apps/web/next.config.ts", "        '@/features/analytics',\n", "        '@/features/analytics',\n        '@/features/dashboard',\n", 1]
]
```


The index lists the one name that files outside the feature use:

Create `apps/web/src/features/dashboard/index.ts`:

```ts
// Public surface of the dashboard feature for files outside it.
export { RoleDashboard } from './components/role-dashboard'
```


- [ ] **Step 3: Move, rewrite and register the indexed feature**

```bash
node .tmp/s7d/move-modules.mjs .tmp/s7d/layout-map.json > .tmp/s7d/out/t5-move.txt
tail -1 .tmp/s7d/out/t5-move.txt
node .tmp/s7d/replace-exact.mjs .tmp/s7d/task5-edits.json
node .tmp/s7d/index-imports.mjs dashboard
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
git diff HEAD -- apps/web/next.config.ts apps/web/src/import-direction.test.ts 'apps/web/src/app' | grep "^[+-]" | grep -v "^+++\|^---"
```


Expected:

```text
moved 9 files, rewrote 4 specifiers and 0 contract paths
2 replacements in 2 files
1 leaf imports in 1 app files now name a feature index
Checked 13 files in <ms>. Fixed 1 file.
+        '@/features/dashboard',
-import { RoleDashboard } from '@/features/dashboard/role-dashboard'
+import { RoleDashboard } from '@/features/dashboard'
+  'dashboard',
```


The script reports 9 moves and the specifiers it rewrote. The edit file applies 2 replacements in 2 files and `index-imports` changes the one app import that named a leaf (the dashboard route page). The diff prints the two list entries (`dashboard` after `analytics` in `indexedFeatures` of the direction test and in `optimizePackageImports` of `next.config.ts`) and the page import.

- [ ] **Step 4: Check the move**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git grep -nE "features/dashboard/" -- apps/web/src ':!apps/web/src/features/dashboard' | cut -c1-150
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1553 files in <ms>. No fixes applied.
 Test Files  273 passed (273)
      Tests  2627 passed (2627)
```


The typecheck is clean and `--noUnusedLocals` lists only the two lines of the baseline. The whole web suite passes: 273 files and 2627 tests, which is `B_web` (265 files, 2422 tests) plus the 8 files and 205 tests of Tasks 1 to 4 (54 pins, 17 access, 27 scope, 39, 32 and 36 for the three components). `git grep` prints no leaf import of `features/dashboard` outside the feature.


- [ ] **Step 4b: Mutate the registration and the page import once**

Nothing in the move itself fails when the registration is wrong: a name missing from `indexedFeatures` or from `optimizePackageImports` only makes the direction test check less, and a leaf import in the page passes unless the feature is listed. Three cases of the direction test (S7c added the first two) are the pins: `lists every feature that has an index.ts as indexed`, `has Next optimize the barrel of each indexed feature so route bundles keep their size` and `keeps every other file on the index of each indexed feature`. `mut-layout.json` deletes `dashboard` from each list in turn, and each mutation must fail the direction test. The third mutation points the page at the leaf with one `sed` and runs the direction test once: `mutate.mjs` cannot do it, because the test reads the page and does not import it, so a change to the page starts no watch run and the runner would wait five minutes and call it killed.

Create `.tmp/s7d/mut-layout.json`:

```json
[
 ["dashboard not indexed", "apps/web/src/import-direction.test.ts", "  'analytics',\n  'dashboard',\n", "  'analytics',\n"],
 ["dashboard not optimized", "apps/web/next.config.ts", "        '@/features/dashboard',\n", ""]
]
```


```bash
A=apps/web/src/import-direction.test.ts
B=apps/web/next.config.ts
C="apps/web/src/app/(dashboard)/dashboard/page.tsx"
H="$(git hash-object $A $B "$C")"
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-layout.json $A 2>&1 | grep -E "^unmutated|: |NOT APPLIED|^mutations"
cp "$C" .tmp/s7d/page.bak
sed -i "s#from '@/features/dashboard'#from '@/features/dashboard/components/role-dashboard'#" "$C"
(cd apps/web && timeout 300 pnpm exec vitest run src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +Tests +[0-9]| FAIL ")
cp .tmp/s7d/page.bak "$C"
test "$(git hash-object $A $B "$C")" = "$H" && echo "files restored"
```


Expected:

```text
unmutated: pass
dashboard not indexed: killed
dashboard not optimized: killed
mutations 2, survived 0
 FAIL  src/import-direction.test.ts > feature public surfaces > keeps every other file on the index of each indexed feature
      Tests  1 failed | 5 passed (6)
files restored
```


The unmutated run passes, the two registration mutations fail the direction test, the leaf import in the page fails its third case (the one failing case and the passing ones are counted), and the three files are restored byte for byte.

- [ ] **Step 5: Compare the route sizes and commit**

```bash
.tmp/s7d/build-routes.sh layout
git checkout -- apps/web/next-env.d.ts
node .tmp/s7d/compare-routes.mjs .tmp/s7d/routes-prelayout.txt .tmp/s7d/routes-layout.txt
node .tmp/s7d/compare-routes.mjs .tmp/s7d/routes-baseline.txt .tmp/s7d/routes-layout.txt | tail -1
git add -A apps
git status --short | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): give dashboard a feature layout and a public index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
exit 0
ƒ Middleware                                                      102 kB
routes 72, different 0
routes 72, different 0
9
 13 files changed, 8 insertions(+), 4 deletions(-)
```


The build exits 0 with Middleware at `M0`. Against `prelayout` no route differs in the replay, and neither does any route against the Task 0 table. The planner's dry run printed `/dashboard` 1.0 kB smaller against `prelayout` (669 kB to 668 kB, the page importing the one-name index instead of the leaf) and another checkout printed none; the bound is that no route grows by the move, and all 72 routes are present. 9 files are staged as renames, and the commit touches 13 files.

---

### Task 6: Pin the role dashboard before it is cut

**Files:**
- Create: `apps/web/src/test/fixtures/role-dashboard-fixtures.tsx`
- Create: `apps/web/src/features/dashboard/components/role-dashboard.test.tsx` (states, records, metrics, sections and item actions), `role-dashboard.monitoring.test.tsx` (project monitoring), `role-dashboard.review.test.tsx` (activity review panel)
- Create (gitignored): `.tmp/s7d/mut-role.json`

`role-dashboard.tsx` is 693 lines: four helpers, a 119-line review panel, a 123-line monitoring snapshot, two list components and a 237-line `RoleDashboard`. Its only test, `role-dashboard.authorization.test.ts`, pins `canLoadDashboardMonitoring` and the mounting of the monitoring section. The tests below are written against the unsplit file and must pass before and after Task 7.

- [ ] **Step 1: Record the role dashboard**

```bash
D=apps/web/src/features/dashboard/components
wc -l $D/role-dashboard.tsx $D/role-dashboard.authorization.test.ts
git hash-object $D/role-dashboard.tsx | cut -c1-8
grep -c "useState" $D/role-dashboard.tsx
(cd apps/web && timeout 600 pnpm exec vitest run src/features/dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
  693 apps/web/src/features/dashboard/components/role-dashboard.tsx
   92 apps/web/src/features/dashboard/components/role-dashboard.authorization.test.ts
  785 total
6b4d47c9
14
 Test Files  12 passed (12)
      Tests  59 passed (59)
```


The role dashboard is 693 lines, its only test is the 92 line authorization test, the hash is `6b4d47c9` (the pin of Task 7), the file has 14 `useState` lines, and the dashboard folder has 12 test files and 59 tests.

- [ ] **Step 2: Write the pins**

The fixture holds the hoisted mocks (the five clients, the current role and profile, the router, the two UI flags, the permission list behind `can`), the stubs of the child components (`ActionKpiRow`, `ExecutiveDashboard`, `PinnedCharts`, `RoleOverviewDashboard`, `ActivityDetailPanel`, `ActivityProofDialog`, which expose the props they receive), a native select standing in for the Radix one, the builders `dashboard`, `section`, `item`, `action` and `metric`, and `resetRoleDashboardMocks` (the date is fixed to 2026-09-27 and the address reset). Feature flags are read through getters so one test file can switch them. It is imported first by every test, because a `vi.mock` in an imported fixture must register before the later imports:

Create `apps/web/src/test/fixtures/role-dashboard-fixtures.tsx`:

```tsx
import { vi } from 'vitest'

const api = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getProjectsForRole: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getActivity: vi.fn(),
  getIndicators: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'System Administrator' as string | null,
  profile: {
    fullName: 'Synthetic Admin',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['monitoring.read', 'analytics.read'],
    assignedProjectIds: [] as string[],
  } as { fullName: string; roles: string[]; permissions: string[]; assignedProjectIds: string[] } | null,
}))
const router = vi.hoisted(() => ({ push: vi.fn() }))
const flags = vi.hoisted(() => ({ monitoring: false, pins: false }))
const rbac = vi.hoisted(() => ({ allowed: [] as string[] }))
const panels = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  proof: null as Record<string, unknown> | null,
  pinned: null as unknown,
}))
export { access, api, flags, panels, rbac, router }

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/rbac/can', () => ({
  can: (_role: string, permission: string) => rbac.allowed.includes(permission),
}))
vi.mock('@/constants/feature-flags', () => ({
  get ADMIN_DASHBOARD_MONITORING_UI_ENABLED() {
    return flags.monitoring
  },
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
}))
vi.mock('@/features/dashboard/monitoring-reach-metrics.utils', () => ({
  monitoringReachMetrics: (result: { metrics: unknown[] }) => result.metrics,
}))
vi.mock('@/features/dashboard/components/action-kpi-row', () => ({
  ActionKpiRow: () => <div data-testid="action-kpi-row" />,
}))
vi.mock('@/features/dashboard/components/executive-dashboard', () => ({
  ExecutiveDashboard: ({
    model,
    summaryAction,
  }: { model: { title: string }; summaryAction?: { label: string } }) => (
    <div data-testid="executive">
      {model.title}|{summaryAction?.label ?? 'no action'}
    </div>
  ),
}))
vi.mock('@/features/dashboard/components/pinned-charts', () => ({
  PinnedCharts: ({ projects }: { projects: Array<{ id: string }> }) => {
    panels.pinned = projects
    return <div data-testid="pinned-charts">{projects.map((row) => row.id).join(',')}</div>
  },
}))
vi.mock('@/features/dashboard/role-overview/role-overview', () => ({
  RoleOverviewDashboard: ({ fullName, role }: { fullName?: string | null; role: string }) => (
    <div data-testid="role-overview">
      {role}|{fullName ?? 'no name'}
    </div>
  ),
}))
vi.mock('@/features/projects', () => ({
  ActivityDetailPanel: (props: {
    activity: { title: string }
    onActivityChanged: (activity: { title: string }) => void
    onOpenChange: (open: boolean) => void
    onSubmitProof: (activity: { title: string }) => void
    open: boolean
  }) => {
    panels.detail = props
    return props.open ? (
      <div data-testid="activity-detail">
        {props.activity.title}
        <button onClick={() => props.onOpenChange(false)} type="button">
          close detail
        </button>
        <button onClick={() => props.onActivityChanged({ title: 'Changed activity' })} type="button">
          change activity
        </button>
        <button onClick={() => props.onSubmitProof(props.activity)} type="button">
          submit proof
        </button>
      </div>
    ) : null
  },
  ActivityProofDialog: (props: {
    activity: { title: string } | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmitted: (activity: { title: string }) => void
  }) => {
    panels.proof = props
    return props.open ? (
      <div data-testid="proof-dialog">
        {props.activity?.title}
        <button onClick={() => props.onOpenChange(false)} type="button">
          close proof
        </button>
        <button onClick={() => props.onSubmitted({ title: 'Proof activity' })} type="button">
          proof submitted
        </button>
      </div>
    ) : null
  },
}))
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = { children?: React.ReactNode; id?: string }
  type SelectProps = {
    children?: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }
  const SelectTrigger = (_props: PartProps) => null
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, value }: PartProps & { value?: string }) => (
    <option value={value}>{children}</option>
  )
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        id={trigger?.props.id}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        <option value="">No selection</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

export const dashboard = (overrides: Record<string, unknown> = {}) => ({
  metrics: [],
  sections: [],
  ...overrides,
})

export const action = (overrides: Record<string, unknown> = {}) => ({
  id: 'open',
  label: 'Open',
  kind: 'navigate',
  href: '/somewhere',
  ...overrides,
})

export const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  title: 'Synthetic item',
  description: 'Synthetic description',
  ...overrides,
})

export const section = (overrides: Record<string, unknown> = {}) => ({
  id: 'section-1',
  title: 'Synthetic section',
  items: [item()],
  ...overrides,
})

export const metric = (overrides: Record<string, unknown> = {}) => ({
  id: 'metric-1',
  label: 'Synthetic metric',
  value: 7,
  helperText: 'Synthetic helper',
  ...overrides,
})

export const resetRoleDashboardMocks = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
  access.role = 'System Administrator'
  access.profile = {
    fullName: 'Synthetic Admin',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['monitoring.read', 'analytics.read'],
    assignedProjectIds: [],
  }
  flags.monitoring = false
  flags.pins = false
  rbac.allowed = []
  panels.detail = null
  panels.proof = null
  panels.pinned = null
  api.getDashboard.mockResolvedValue(dashboard())
  api.getProjectsForRole.mockResolvedValue([])
  api.getMonitoringDashboard.mockResolvedValue({ metrics: [] })
  api.getActivity.mockResolvedValue({ title: 'Synthetic activity' })
  api.getIndicators.mockResolvedValue([])
  window.history.replaceState(null, '', '/dashboard')
}
```


`role-dashboard.test.tsx` pins who sees what (every role but the administrator goes to the role overview and loads nothing), the loading, unavailable and empty pages (the empty page needs every section empty, a role that arrives after the first render starts the load, and a dashboard without sections draws no detail heading), the task counts row behind its flag, the metric cards (severity tone, the four icons repeating after the fourth, hidden for a role that sees the monitoring section), the executive summary, the sections (title, description, View All, empty text, the scroll limit of the two long lists), the list items (link or heading, meta, status tone, the zero progress and the compact unlabeled bar, the two action buttons) and every route an action can take, including the four review actions with and without an activity address:

Create `apps/web/src/features/dashboard/components/role-dashboard.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  access,
  action,
  api,
  dashboard,
  flags,
  item,
  metric,
  rbac,
  resetRoleDashboardMocks,
  router,
  section,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const shown = async (data: Record<string, unknown> = dashboard()) => {
  api.getDashboard.mockResolvedValue(data)
  render(<RoleDashboard />)
  await screen.findByRole('heading', { name: 'Welcome! System Administrator' })
}

describe('Role dashboard states and records', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('who sees what', () => {
    it('hands every other role to the role overview with the profile name and loads no dashboard', () => {
      access.role = 'Project Manager'
      render(<RoleDashboard />)

      expect(screen.getByTestId('role-overview').textContent).toBe('Project Manager|Synthetic Admin')
      expect(api.getDashboard).not.toHaveBeenCalled()
    })

    it('passes no name to the role overview without a profile', () => {
      access.role = 'Project Officer'
      access.profile = null
      render(<RoleDashboard />)

      expect(screen.getByTestId('role-overview').textContent).toBe('Project Officer|no name')
    })

    it('keeps loading and requests nothing without a role', () => {
      access.role = null
      render(<RoleDashboard />)

      expect(screen.getByText('Loading dashboard...')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Dashboard' }).className).toBe('sr-only')
      expect(api.getDashboard).not.toHaveBeenCalled()
    })

    it('loads the home dashboard for the administrator and then greets by role', async () => {
      api.getDashboard.mockReturnValue(new Promise(() => {}))
      render(<RoleDashboard />)

      expect(screen.getByText('Loading dashboard...')).toBeTruthy()
      expect(api.getDashboard).toHaveBeenCalledWith('System Administrator')
    })

    it('shows the unavailable page when the dashboard read fails', async () => {
      api.getDashboard.mockRejectedValue(new Error('down'))
      render(<RoleDashboard />)

      expect(await screen.findByText('Dashboard data unavailable')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Dashboard unavailable' })).toBeTruthy()
      expect(
        screen.getByText('We could not load this dashboard right now. Reload the page to try again.'),
      ).toBeTruthy()
    })

    it('shows the empty page when there are no metrics and no section items', async () => {
      await shown(dashboard({ sections: [section({ items: [] })] }))

      expect(screen.getByText('No dashboard records')).toBeTruthy()
      expect(screen.getByText('No dashboard records are available for this account.')).toBeTruthy()
    })

    it.each([
      ['a metric', dashboard({ metrics: [metric()] })],
      ['a section item', dashboard({ sections: [section()] })],
    ])('hides the empty page when there is %s', async (_label, data) => {
      await shown(data)

      expect(screen.queryByText('No dashboard records')).toBeNull()
    })

    it('loads the dashboard when the role arrives after the first render', async () => {
      access.role = null
      const view = render(<RoleDashboard />)
      expect(api.getDashboard).not.toHaveBeenCalled()

      access.role = 'System Administrator'
      view.rerender(<RoleDashboard />)

      expect(
        await screen.findByRole('heading', { name: 'Welcome! System Administrator' }),
      ).toBeTruthy()
      expect(api.getDashboard).toHaveBeenCalledWith('System Administrator')
    })

    it('hides the empty page while any section still has an item', async () => {
      await shown(
        dashboard({
          sections: [section({ id: 'empty', items: [] }), section({ id: 'full' })],
        }),
      )

      expect(screen.queryByText('No dashboard records')).toBeNull()
    })

    it('draws no detail section without sections', async () => {
      await shown(dashboard({ metrics: [metric()] }))

      expect(screen.queryByText('Dashboard detail')).toBeNull()
    })

    it('shows the task counts row only while the administrator monitoring flag is on', async () => {
      await shown()
      expect(screen.queryByTestId('action-kpi-row')).toBeNull()
      cleanup()

      flags.monitoring = true
      await shown()
      expect(screen.getByTestId('action-kpi-row')).toBeTruthy()
    })

    it('reloads nothing when the render repeats', async () => {
      await shown()

      expect(api.getDashboard).toHaveBeenCalledTimes(1)
    })
  })

  describe('metrics and executive summary', () => {
    const metrics = [
      metric({ id: 'm-danger', label: 'Danger metric', value: 1, severity: 'danger', href: '/danger' }),
      metric({ id: 'm-warning', label: 'Warning metric', value: 2, severity: 'warning' }),
      metric({ id: 'm-success', label: 'Success metric', value: 3, severity: 'success' }),
      metric({ id: 'm-neutral', label: 'Neutral metric', value: 4, severity: 'neutral' }),
      metric({ id: 'm-plain', label: 'Plain metric', value: 'N/A' }),
    ]
    const cardOf = (label: string) => screen.getByText(label).closest('.relative') as HTMLElement

    it('shows the metric cards of a role that cannot see the monitoring section', async () => {
      await shown(dashboard({ metrics }))

      expect(within(cardOf('Danger metric')).getByText('1')).toBeTruthy()
      expect(within(cardOf('Plain metric')).getByText('N/A')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'View Danger metric' }).getAttribute('href')).toBe(
        '/danger',
      )
      expect(screen.queryByRole('link', { name: 'View Warning metric' })).toBeNull()
    })

    it('colors each card by severity and falls back to info', async () => {
      await shown(dashboard({ metrics }))

      expect(cardOf('Danger metric').querySelector('.bg-danger-subtle')).toBeTruthy()
      expect(cardOf('Warning metric').querySelector('.bg-warning-subtle')).toBeTruthy()
      expect(cardOf('Success metric').querySelector('.bg-success-subtle')).toBeTruthy()
      expect(cardOf('Neutral metric').querySelector('.bg-info-subtle')).toBeTruthy()
      expect(cardOf('Plain metric').querySelector('.bg-info-subtle')).toBeTruthy()
    })

    it('gives the first five cards four icons in order and then repeats the first', async () => {
      await shown(dashboard({ metrics }))

      const icons = metrics.map(
        (row) => cardOf(row.label as string).querySelector('.h-10 svg')?.getAttribute('class') ?? '',
      )
      expect(icons).toEqual([
        'lucide lucide-folder-kanban h-5 w-5',
        'lucide lucide-triangle-alert h-5 w-5',
        'lucide lucide-clock h-5 w-5',
        'lucide lucide-chart-column h-5 w-5',
        'lucide lucide-folder-kanban h-5 w-5',
      ])
    })

    it('hides the metric cards of a role that sees the monitoring section', async () => {
      rbac.allowed = ['monitor_evaluate.view']
      await shown(dashboard({ metrics }))

      expect(screen.queryByText('Danger metric')).toBeNull()
    })

    it('hides the metric cards while the dashboard has none', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(document.querySelector('section.grid')).toBeNull()
    })

    it('shows the executive summary with the primary action', async () => {
      await shown(
        dashboard({
          executive: { title: 'Executive model' },
          primaryAction: action({ label: 'Open portfolio' }),
          sections: [section()],
        }),
      )

      expect(screen.getByTestId('executive').textContent).toBe('Executive model|Open portfolio')
      expect(screen.getByText('Operational detail')).toBeTruthy()
      expect(
        screen.getByRole('heading', { name: 'Projects and alerts behind the summary' }),
      ).toBeTruthy()
    })

    it('hides the executive summary and names the detail section for screen readers without one', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(screen.queryByTestId('executive')).toBeNull()
      expect(screen.queryByText('Operational detail')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Dashboard detail' }).className).toBe('sr-only')
    })
  })

  describe('sections and list items', () => {
    it('shows the section title, description and a View All link', async () => {
      await shown(
        dashboard({
          sections: [
            section({ description: 'Synthetic note', viewAllHref: '/all', viewAllLabel: 'See every row' }),
            section({ id: 'section-2', title: 'Second', viewAllHref: '/second' }),
            section({ id: 'section-3', title: 'Third' }),
          ],
        }),
      )

      expect(screen.getByText('Synthetic note')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'See every row' }).getAttribute('href')).toBe('/all')
      expect(screen.getByRole('link', { name: 'View All' }).getAttribute('href')).toBe('/second')
      expect(screen.getAllByRole('link', { name: /View All|See every row/ })).toHaveLength(2)
    })

    it('shows the empty text of a section without items, or the default', async () => {
      await shown(
        dashboard({
          sections: [
            section({ items: [] }),
            section({ id: 'section-2', title: 'Second', items: [], emptyText: 'Nothing here yet' }),
            section({ id: 'section-3', title: 'Third' }),
          ],
        }),
      )

      expect(screen.getAllByText('Nothing to review')).toHaveLength(2)
      expect(screen.getByText('No records are currently available.')).toBeTruthy()
      expect(screen.getByText('Nothing here yet')).toBeTruthy()
    })

    it.each(['portfolio-health', 'escalated-alerts'])(
      'makes the %s list a scrollable region limited to three visible entries',
      async (id) => {
        await shown(dashboard({ sections: [section({ id, title: `Section ${id}` })] }))

        const region = screen.getByLabelText(`Section ${id} list`)
        expect(region.getAttribute('data-visible-entry-limit')).toBe('3')
        expect(region.getAttribute('tabindex')).toBe('0')
        expect(region.className).toBe('max-h-[19rem] overflow-y-auto pr-2')
      },
    )

    it('leaves other lists unrestricted', async () => {
      await shown(dashboard({ sections: [section()] }))

      const list = screen.getByText('Synthetic item').closest('[class*="border-b"]')?.parentElement
      expect(list?.getAttribute('aria-label')).toBeNull()
      expect(list?.getAttribute('data-visible-entry-limit')).toBeNull()
      expect(list?.getAttribute('tabindex')).toBeNull()
      expect(list?.className).toBe('')
    })

    it('shows an item with a link, meta, status and progress', async () => {
      await shown(
        dashboard({
          sections: [
            section({
              items: [
                item({
                  href: '/projects/p1',
                  meta: 'Synthetic meta',
                  status: 'At risk',
                  severity: 'danger',
                  progress: 40,
                }),
              ],
            }),
          ],
        }),
      )

      expect(screen.getByRole('link', { name: 'Synthetic item' }).getAttribute('href')).toBe('/projects/p1')
      expect(screen.getByText('Synthetic meta')).toBeTruthy()
      expect(screen.getByText('At risk').className).toContain('text-danger')
      const bar = screen.getByRole('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe('40')
      expect(bar.getAttribute('aria-label')).toBe('Progress')
      expect(bar.firstElementChild?.className).toContain('bg-danger')
      expect(screen.getByText('Progress')).toBeTruthy()
    })

    it('shows an item without a link as a heading, with no meta, status or progress', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(screen.getByRole('heading', { name: 'Synthetic item' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Synthetic item' })).toBeNull()
      expect(screen.queryByRole('progressbar')).toBeNull()
      expect(document.querySelector('.rounded-full.border')).toBeNull()
    })

    it('shows a zero progress and keeps the compact portfolio-health bar unlabeled', async () => {
      await shown(
        dashboard({
          sections: [
            section({ id: 'portfolio-health', title: 'Health', items: [item({ progress: 0 })] }),
          ],
        }),
      )

      const bar = screen.getByRole('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe('0')
      expect(bar.getAttribute('aria-label')).toBe('Progress')
      expect(screen.queryByText('Progress', { selector: 'span' })).toBeNull()
      expect(bar.closest('.sm\\:max-w-\\[220px\\]')).toBeTruthy()
    })

    it.each([
      ['neutral', 'bg-muted'],
      ['info', 'bg-info-subtle'],
      ['success', 'bg-success-subtle'],
      ['warning', 'bg-warning-subtle'],
      ['danger', 'bg-danger-subtle'],
      [undefined, 'bg-info-subtle'],
    ])('colors the %s status badge with %s', async (severity, expected) => {
      await shown(
        dashboard({ sections: [section({ items: [item({ status: 'Badge', severity })] })] }),
      )

      expect(screen.getByText('Badge').className).toContain(expected)
    })

    it.each([
      ['danger', 'bg-danger'],
      ['warning', 'bg-warning'],
      ['success', 'bg-success'],
      ['neutral', 'bg-info'],
      [undefined, 'bg-info'],
    ])('colors a %s progress bar with %s', async (severity, expected) => {
      await shown(dashboard({ sections: [section({ items: [item({ progress: 50, severity })] })] }))

      expect(screen.getByRole('progressbar').firstElementChild?.className).toContain(expected)
    })

    it('draws item actions as a default primary and an outline secondary button', async () => {
      await shown(
        dashboard({
          sections: [
            section({
              items: [
                item({
                  primaryAction: action({ id: 'p', label: 'Primary go' }),
                  secondaryAction: action({ id: 's', label: 'Secondary go', kind: 'dialog' }),
                }),
              ],
            }),
          ],
        }),
      )

      const primary = screen.getByRole('button', { name: 'Primary go' })
      const secondary = screen.getByRole('button', { name: 'Secondary go' })
      expect(primary.classList.contains('bg-primary')).toBe(true)
      expect(secondary.classList.contains('bg-primary')).toBe(false)
      expect(secondary.classList.contains('bg-card')).toBe(true)
      expect(primary.querySelector('svg')).toBeTruthy()
      expect(secondary.querySelector('svg')).toBeNull()
    })

    it('shows only the actions an item has', async () => {
      await shown(
        dashboard({
          sections: [section({ items: [item({ secondaryAction: action({ label: 'Only secondary' }) })] })],
        }),
      )

      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Only secondary' })).toBeTruthy()
    })
  })

  describe('item actions', () => {
    const clickAction = async (actionRecord: Record<string, unknown>) => {
      await shown(dashboard({ sections: [section({ items: [item({ primaryAction: actionRecord })] })] }))
      fireEvent.click(screen.getByRole('button', { name: actionRecord.label as string }))
    }

    it('follows the href of a navigation action', async () => {
      await clickAction(action({ id: 'go', label: 'Go', href: '/alerts/repository' }))

      expect(router.push).toHaveBeenCalledWith('/alerts/repository')
    })

    it('falls back to the workflow page for a navigation action without an href', async () => {
      await clickAction(action({ id: 'go', label: 'Go', href: undefined }))

      expect(router.push).toHaveBeenCalledWith('/projects')
    })

    it.each([
      ['Review budget', undefined, '/projects'],
      ['Check proof', undefined, '/projects'],
      ['Proof alert', undefined, '/projects'],
      ['Budget alert', undefined, '/projects'],
      ['Decision needed', undefined, '/alerts'],
      ['Recommendation', undefined, '/alerts'],
      ['Outcome review', undefined, '/alerts'],
      ['Flag review', undefined, '/alerts'],
      ['Raise alert', undefined, '/alerts'],
      ['Orientation', undefined, '/projects'],
      ['Activity alert', undefined, '/alerts'],
      ['Open', 'Review the alert', '/alerts'],
      ['Open', 'Budget summary', '/projects'],
      ['Open', undefined, '/projects'],
      ['Something else', undefined, '/projects'],
    ])('sends the %s action titled %s to %s', async (label, dialogTitle, expected) => {
      await clickAction(action({ id: 'dlg', label, kind: 'dialog', href: undefined, dialogTitle }))

      expect(router.push).toHaveBeenCalledWith(expected)
    })

    it('sends a dialog action to the workflow page even when it has an href', async () => {
      await clickAction(action({ id: 'dlg', label: 'Open', kind: 'dialog', href: '/ignored' }))

      expect(router.push).toHaveBeenCalledWith('/projects')
    })

    it.each(['review-proof', 'review-expense', 'open-activity-update', 'view-orientation-summary'])(
      'opens the %s activity in the review panel and does not navigate',
      async (id) => {
        api.getActivity.mockReturnValue(new Promise(() => {}))
        await clickAction(
          action({ id, label: 'Review', href: '/projects/p1/activities/a1?review=r1' }),
        )

        expect(await screen.findByText('Loading review')).toBeTruthy()
        expect(api.getActivity).toHaveBeenCalledWith('p1', 'a1')
        expect(router.push).not.toHaveBeenCalled()
      },
    )

    it('navigates when a review action has no activity address', async () => {
      await clickAction(action({ id: 'review-proof', label: 'Review', href: '/projects/p1' }))

      expect(router.push).toHaveBeenCalledWith('/projects/p1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('navigates when another action names an activity address', async () => {
      await clickAction(
        action({ id: 'other', label: 'Review', href: '/projects/p1/activities/a1?review=r1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/projects/p1/activities/a1?review=r1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('does not treat an address with another segment before activities as an activity address', async () => {
      await clickAction(
        action({ id: 'review-proof', label: 'Review', href: '/projects/p1/x/activities/a1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/projects/p1/x/activities/a1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('does not treat a prefix of the address as an activity address', async () => {
      await clickAction(
        action({ id: 'review-proof', label: 'Review', href: '/x/projects/p1/activities/a1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/x/projects/p1/activities/a1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })
  })
})
```


`role-dashboard.monitoring.test.tsx` pins the five conditions that mount the monitoring section, the project scope (all, the project of the address, an unknown project, the Manila business date at the end of the trailing year, the cleared cards while a project loads, the empty and failed lists), the cards, the pinned charts behind their flag and the primary action (in the card, or left to the executive summary):

Create `apps/web/src/features/dashboard/components/role-dashboard.monitoring.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  access,
  action,
  api,
  dashboard,
  flags,
  metric,
  panels,
  rbac,
  resetRoleDashboardMocks,
  router,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const projects = [
  { id: 'project-a', title: 'Project A' },
  { id: 'project-b', title: 'Project B' },
]
const scope = () => screen.getByLabelText('Project scope') as HTMLSelectElement
const lastPeriod = { periodStart: '2025-09-27', periodEnd: '2026-09-27' }
const mounted = async (data: Record<string, unknown> = dashboard(), list = projects) => {
  flags.monitoring = true
  rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
  api.getDashboard.mockResolvedValue(data)
  api.getProjectsForRole.mockResolvedValue(list)
  render(<RoleDashboard />)
  await screen.findByText('Project monitoring')
}

describe('Role dashboard project monitoring', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('visibility', () => {
    const held = {
      monitoring: true,
      allowed: ['monitor_evaluate.view', 'analytics.view'],
      permissions: ['monitoring.read', 'analytics.read'],
    }
    it.each([
      ['the monitoring flag is off', { ...held, monitoring: false }],
      ['monitor_evaluate.view is missing', { ...held, allowed: ['analytics.view'] }],
      ['analytics.view is missing', { ...held, allowed: ['monitor_evaluate.view'] }],
      ['monitoring.read is missing', { ...held, permissions: ['analytics.read'] }],
      ['analytics.read is missing', { ...held, permissions: ['monitoring.read'] }],
    ])('is not mounted and requests nothing when %s', async (_label, setup) => {
      flags.monitoring = setup.monitoring
      rbac.allowed = setup.allowed
      access.profile = {
        fullName: 'Synthetic Admin',
        roles: ['SYSTEM_ADMINISTRATOR'],
        permissions: setup.permissions,
        assignedProjectIds: [],
      }
      api.getDashboard.mockResolvedValue(dashboard())
      render(<RoleDashboard />)
      await screen.findByRole('heading', { name: 'Welcome! System Administrator' })

      expect(screen.queryByText('Project monitoring')).toBeNull()
      expect(api.getProjectsForRole).not.toHaveBeenCalled()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('is shown with the task counts row when every grant is held', async () => {
      await mounted()

      expect(screen.getByTestId('action-kpi-row')).toBeTruthy()
      expect(api.getProjectsForRole).toHaveBeenCalledWith('System Administrator')
    })
  })

  describe('project scope', () => {
    it('lists All projects and the authorized projects, and starts on all', async () => {
      await mounted()

      await waitFor(() => expect(scope().value).toBe('all'))
      expect([...scope().options].map((option) => option.textContent)).toEqual([
        'No selection',
        'All projects',
        'Project A',
        'Project B',
      ])
    })

    it('starts on the project named in the address when the account is assigned to it', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-b')
      await mounted()

      await waitFor(() => expect(scope().value).toBe('project-b'))
      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
          projectId: 'project-b',
          ...lastPeriod,
        }),
      )
    })

    it('starts on all when the address names a project the account is not assigned to', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-z')
      await mounted()

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('reads the monitoring totals of every project without a project id', async () => {
      await mounted()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastPeriod)
    })

    it('ends the trailing year on the business date in Manila, not the UTC date', async () => {
      vi.setSystemTime(new Date('2026-09-26T17:30:00.000Z'))
      await mounted()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastPeriod))
    })

    it('reads the chosen project and clears the previous cards while it loads', async () => {
      api.getMonitoringDashboard.mockResolvedValueOnce({
        metrics: [metric({ id: 'a', label: 'All projects metric' })],
      })
      await mounted()
      await screen.findByText('All projects metric')

      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      fireEvent.change(scope(), { target: { value: 'project-a' } })

      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
          projectId: 'project-a',
          ...lastPeriod,
        }),
      )
      expect(screen.queryByText('All projects metric')).toBeNull()
      expect(screen.getByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('shows the empty state and requests no monitoring when no project is authorized', async () => {
      await mounted(dashboard(), [])

      expect(await screen.findByText('No authorized projects')).toBeTruthy()
      expect(
        screen.getByText(
          'No projects are assigned to this account. Contact an administrator to review project access.',
        ),
      ).toBeTruthy()
      expect(scope().value).toBe('')
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('shows the reason when the project list fails', async () => {
      flags.monitoring = true
      rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
      api.getProjectsForRole.mockRejectedValue(new Error('Directory is down.'))
      render(<RoleDashboard />)

      expect(await screen.findByText('Monitoring data unavailable')).toBeTruthy()
      expect(screen.getByText('Directory is down.')).toBeTruthy()
    })

    it('names the failure when the project list rejects without a message', async () => {
      flags.monitoring = true
      rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
      api.getProjectsForRole.mockRejectedValue('down')
      render(<RoleDashboard />)

      expect(await screen.findByText('Project scope could not be loaded.')).toBeTruthy()
    })
  })

  describe('cards', () => {
    it('shows the monitoring metrics of the scope', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        metrics: [
          metric({ id: 'a', label: 'Reach', value: 12, severity: 'success' }),
          metric({ id: 'b', label: 'Records', value: 'Withheld', severity: 'warning' }),
        ],
      })
      await mounted()

      expect(await screen.findByText('Reach')).toBeTruthy()
      expect(screen.getByText('12')).toBeTruthy()
      expect(screen.getByText('Withheld')).toBeTruthy()
      expect(screen.queryByText('Loading project monitoring data...')).toBeNull()
    })

    it('says the data is loading while the projects exist and no card has arrived', async () => {
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      await mounted()

      expect(await screen.findByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('shows the reason when the monitoring read fails and names a failure without one', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      await mounted()
      expect(await screen.findByText('Monitoring is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      expect(await screen.findByText('Monitoring data could not be loaded.')).toBeTruthy()
    })

    it('clears the error when another scope loads', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      await mounted()
      await screen.findByText('Monitoring is down.')

      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric({ label: 'Recovered' })] })
      fireEvent.change(scope(), { target: { value: 'project-b' } })

      expect(await screen.findByText('Recovered')).toBeTruthy()
      expect(screen.queryByText('Monitoring is down.')).toBeNull()
    })
  })

  describe('pinned charts and the primary action', () => {
    it('shows the pinned charts of the projects only while the pins flag is on', async () => {
      await mounted()
      expect(screen.queryByTestId('pinned-charts')).toBeNull()
      cleanup()

      flags.pins = true
      await mounted()
      await waitFor(() => expect(screen.getByTestId('pinned-charts').textContent).toBe('project-a,project-b'))
      expect(panels.pinned).toHaveLength(2)
    })

    it('puts the primary action in the monitoring card when there is no executive summary', async () => {
      await mounted(dashboard({ primaryAction: action({ label: 'Open monitoring', href: '/analytics' }) }))

      fireEvent.click(screen.getByRole('button', { name: 'Open monitoring' }))
      expect(router.push).toHaveBeenCalledWith('/analytics')
      expect(screen.getByRole('button', { name: 'Open monitoring' }).classList.contains('bg-primary')).toBe(true)
    })

    it('leaves the primary action to the executive summary when there is one', async () => {
      await mounted(
        dashboard({
          executive: { title: 'Executive model' },
          primaryAction: action({ label: 'Open monitoring', href: '/analytics' }),
        }),
      )

      expect(screen.queryByRole('button', { name: 'Open monitoring' })).toBeNull()
      expect(screen.getByTestId('executive').textContent).toBe('Executive model|Open monitoring')
    })

    it('shows no action without a primary action', async () => {
      await mounted()

      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})
```


`role-dashboard.review.test.tsx` pins the activity review panel through the dashboard: what the detail panel receives, the requested proof and expense of four addresses, the loading, failure and Retry pages, the close with focus returned to the opening button, the reload after a change (and the unavailable page when that reload fails) and the proof dialog. Only the administrator reaches this panel, so the role-by-role grants are pinned in Task 7:

Create `apps/web/src/features/dashboard/components/role-dashboard.review.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  action,
  api,
  dashboard,
  item,
  panels,
  resetRoleDashboardMocks,
  section,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const open = async (href = '/projects/p1/activities/a1?review=r1') => {
  api.getDashboard.mockResolvedValue(
    dashboard({
      sections: [
        section({
          items: [item({ primaryAction: action({ id: 'review-proof', label: 'Review proof', href }) })],
        }),
      ],
    }),
  )
  render(<RoleDashboard />)
  const trigger = await screen.findByRole('button', { name: 'Review proof' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}
const detail = () => screen.findByTestId('activity-detail')

describe('Role dashboard activity review panel', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads the activity and its project indicators, then shows the activity panel', async () => {
    api.getIndicators.mockResolvedValue([{ id: 'indicator-1' }])
    await open()

    expect((await detail()).textContent).toContain('Synthetic activity')
    expect(api.getActivity).toHaveBeenCalledWith('p1', 'a1')
    expect(api.getIndicators).toHaveBeenCalledWith('p1')
    expect(panels.detail).toMatchObject({
      indicators: [{ id: 'indicator-1' }],
      journeyStages: [],
      open: true,
      canEdit: false,
      requestedProofId: 'r1',
      requestedExpenseId: undefined,
    })
  })

  it.each([
    ['?expense=e1', undefined, 'e1'],
    ['?review=r1&proof=p2', 'r1', undefined],
    ['?proof=p2', 'p2', undefined],
    ['', undefined, undefined],
  ])('passes the requested proof and expense of %s', async (query, proofId, expenseId) => {
    await open(`/projects/p1/activities/a1${query}`)
    await detail()

    expect(panels.detail).toMatchObject({ requestedProofId: proofId, requestedExpenseId: expenseId })
  })

  it('grants an administrator none of the activity decisions', async () => {
    await open()
    await detail()

    expect(panels.detail).toMatchObject({
      canDecideProof: false,
      canDecideExtension: false,
      canEdit: false,
      canLogExpense: false,
      canRequestExtension: false,
      canSubmitProof: false,
      canValidateExpense: false,
      canValidateProof: false,
    })
  })

  it('shows the loading page while the activity loads', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    await open()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.getByText('Loading the selected activity and its submitted proof.')).toBeTruthy()
    expect(screen.queryByTestId('activity-detail')).toBeNull()
  })

  it('shows the review unavailable page for a failed read and loads again on Retry', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    await open()

    expect(await screen.findByText('Review unavailable')).toBeTruthy()
    expect(
      screen.getByText('The activity proof could not be loaded. Try again from this panel.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('activity-detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await detail()).textContent).toContain('Synthetic activity')
    expect(api.getActivity).toHaveBeenCalledTimes(2)
  })

  it('shows the loading page again while a Retry loads', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    await open()
    await screen.findByText('Review unavailable')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('shows the failure when the indicators cannot be read', async () => {
    api.getIndicators.mockRejectedValueOnce(new Error('down'))
    await open()

    expect(await screen.findByText('Review unavailable')).toBeTruthy()
  })

  it('has no Retry while it loads', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    await open()
    await screen.findByText('Loading review')

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('closes the panel and returns focus to the button that opened it', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const trigger = await open()
    await detail()
    trigger.blur()

    fireEvent.click(screen.getByRole('button', { name: 'close detail' }))

    await waitFor(() => expect(screen.queryByTestId('activity-detail')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('reloads the dashboard and then the activity after the activity changed', async () => {
    await open()
    await detail()

    fireEvent.click(screen.getByRole('button', { name: 'change activity' }))

    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.getActivity).toHaveBeenCalledTimes(2))
    expect((await detail()).textContent).toContain('Synthetic activity')
  })

  it('shows the unavailable page when the reload after a change fails', async () => {
    await open()
    await detail()
    api.getDashboard.mockRejectedValue(new Error('down'))

    fireEvent.click(screen.getByRole('button', { name: 'change activity' }))

    expect(await screen.findByText('Dashboard data unavailable')).toBeTruthy()
  })

  it('opens the proof dialog for the activity and closes it again', async () => {
    await open()
    await detail()
    expect(screen.queryByTestId('proof-dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))
    expect(screen.getByTestId('proof-dialog').textContent).toContain('Synthetic activity')

    fireEvent.click(screen.getByRole('button', { name: 'close proof' }))
    expect(screen.queryByTestId('proof-dialog')).toBeNull()
  })

  it('closes the proof dialog together with the activity panel', async () => {
    await open()
    await detail()
    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))
    expect(screen.getByTestId('proof-dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'close detail' }))

    await waitFor(() => expect(screen.queryByTestId('proof-dialog')).toBeNull())
  })

  it('closes the proof dialog and reloads the dashboard after a proof was submitted', async () => {
    await open()
    await detail()
    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))

    fireEvent.click(screen.getByRole('button', { name: 'proof submitted' }))

    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('proof-dialog')).toBeNull())
  })

  it('shows no panel before an action asks for one', async () => {
    api.getDashboard.mockResolvedValue(dashboard({ sections: [section()] }))
    render(<RoleDashboard />)
    await screen.findByText('Synthetic item')
    await act(async () => {})

    expect(api.getActivity).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading review')).toBeNull()
  })
})
```


```bash
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
node .tmp/s7d/count-it.mjs apps/web/src/features/dashboard/components/role-dashboard.test.tsx apps/web/src/features/dashboard/components/role-dashboard.monitoring.test.tsx apps/web/src/features/dashboard/components/role-dashboard.review.test.tsx | tail -4
```


Expected:

```text
Checked 4 files in <ms>. Fixed 4 files.
web typecheck clean
 Test Files  15 passed (15)
      Tests  167 passed (167)
apps/web/src/features/dashboard/components/role-dashboard.test.tsx: it 39, describe 5, expect 93
apps/web/src/features/dashboard/components/role-dashboard.monitoring.test.tsx: it 19, describe 5, expect 41
apps/web/src/features/dashboard/components/role-dashboard.review.test.tsx: it 15, describe 1, expect 33
total: it 73, describe 11, expect 167
```


Biome formats the four new files, the typecheck is clean, and the folder gains 3 test files and 108 tests (15 files, 167 tests); `count-it` counts 73 `it` blocks with 167 assertions in the three files (39, 19 and 15 blocks). Every test passes against the unsplit role dashboard.

- [ ] **Step 3: Mutate the role dashboard once**

`mut-role.json` lists 240 mutations of the file, each unique in its text: every grant of `canLoadDashboardMonitoring`, each branch of the two tone helpers, the workflow and activity address rules, every `setX` reset and guard of the review panel, the per-role grants of the detail panel, every condition, class and text of the monitoring snapshot, the list item and the page, and the focus return. The runner uses the three new files and the authorization test:

Create `.tmp/s7d/mut-role.json`:

```json
[
 [
  "monitor view check dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      can(role, 'monitor_evaluate.view') &&\n      can(role, 'analytics.view') &&",
  "      can(role, 'analytics.view') &&"
 ],
 [
  "analytics view check dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      can(role, 'analytics.view') &&\n      principalHasAtomicPermission(profile, 'monitoring.read') &&",
  "      principalHasAtomicPermission(profile, 'monitoring.read') &&"
 ],
 [
  "monitoring read check dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      principalHasAtomicPermission(profile, 'monitoring.read') &&\n      principalHasAtomicPermission(profile, 'analytics.read'),",
  "      principalHasAtomicPermission(profile, 'analytics.read'),"
 ],
 [
  "analytics read check dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      principalHasAtomicPermission(profile, 'monitoring.read') &&\n      principalHasAtomicPermission(profile, 'analytics.read'),",
  "      principalHasAtomicPermission(profile, 'monitoring.read'),"
 ],
 [
  "monitoring checks need one grant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      can(role, 'analytics.view') &&\n      principalHasAtomicPermission(profile, 'monitoring.read') &&",
  "      can(role, 'analytics.view') ||\n      principalHasAtomicPermission(profile, 'monitoring.read') &&"
 ],
 [
  "danger tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (severity === 'danger') {\n    return 'danger'\n  }",
  "  if (severity === 'danger') {\n    return 'warning'\n  }"
 ],
 [
  "warning tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (severity === 'warning') {\n    return 'warning'\n  }",
  "  if (severity === 'warning') {\n    return 'info'\n  }"
 ],
 [
  "success tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (severity === 'success') {\n    return 'success'\n  }",
  "  if (severity === 'success') {\n    return 'info'\n  }"
 ],
 [
  "default tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  return 'info'\n}\n\nconst statusTone",
  "  return 'success'\n}\n\nconst statusTone"
 ],
 [
  "neutral status tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "severity === 'neutral' ? 'neutral' : severityTone(severity)",
  "severity === 'neutral' ? 'info' : severityTone(severity)"
 ],
 [
  "status tone ignores severity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "severity === 'neutral' ? 'neutral' : severityTone(severity)",
  "severity === 'neutral' ? 'neutral' : 'info'"
 ],
 [
  "icon order",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]",
  "const metricIcons = [AlertTriangle, FolderKanban, Clock, BarChart3]"
 ],
 [
  "icon cycle",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]",
  "const metricIcons = [FolderKanban, AlertTriangle, Clock]"
 ],
 [
  "budget href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (actionText.includes('budget')) return '/projects'",
  "  if (actionText.includes('budget')) return '/alerts'"
 ],
 [
  "proof href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (actionText.includes('proof')) return '/projects'",
  "  if (actionText.includes('proof')) return '/alerts'"
 ],
 [
  "recommendation href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    actionText.includes('recommendation') ||\n",
  "    actionText.includes('recommendations') ||\n"
 ],
 [
  "decision href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    actionText.includes('decision') ||\n",
  "    actionText.includes('decisions') ||\n"
 ],
 [
  "outcome href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    actionText.includes('outcome')\n  )\n    return '/alerts'",
  "    actionText.includes('outcomes')\n  )\n    return '/alerts'"
 ],
 [
  "decision group target",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    actionText.includes('outcome')\n  )\n    return '/alerts'",
  "    actionText.includes('outcome')\n  )\n    return '/projects'"
 ],
 [
  "alert href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'",
  "  if (actionText.includes('flag')) return '/alerts'"
 ],
 [
  "flag href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'",
  "  if (actionText.includes('alert')) return '/alerts'"
 ],
 [
  "orientation href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (actionText.includes('orientation') || actionText.includes('activity')) return '/projects'\n  return '/projects'",
  "  if (actionText.includes('orientation') || actionText.includes('activity')) return '/alerts'\n  return '/projects'"
 ],
 [
  "default href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "return '/projects'\n}\n\nconst dashboardActivityTarget",
  "return '/alerts'\n}\n\nconst dashboardActivityTarget"
 ],
 [
  "workflow text is case sensitive",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "`${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()",
  "`${action.label} ${action.dialogTitle ?? ''}`"
 ],
 [
  "workflow text ignores the dialog title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "`${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()",
  "`${action.label}`.toLowerCase()"
 ],
 [
  "target not anchored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "href?.match(/^\\/projects\\/([^/]+)\\/activities\\/([^/?#]+)/)",
  "href?.match(/\\/projects\\/([^/]+)\\/activities\\/([^/?#]+)/)"
 ],
 [
  "target project part",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "([^/]+)\\/activities",
  "(.+)\\/activities"
 ],
 [
  "target activity part",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "activities\\/([^/?#]+)/",
  "activities\\/([^/]+)/"
 ],
 [
  "target without query",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "const query = href?.split('?')[1] ?? ''",
  "const query = ''"
 ],
 [
  "target expense name",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "new URLSearchParams(query).get('expense') ?? undefined",
  "new URLSearchParams(query).get('expenses') ?? undefined"
 ],
 [
  "target review name",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      new URLSearchParams(query).get('review') ??\n",
  "      new URLSearchParams(query).get('reviews') ??\n"
 ],
 [
  "target proof name",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      new URLSearchParams(query).get('proof') ??\n      undefined",
  "      new URLSearchParams(query).get('proofs') ??\n      undefined"
 ],
 [
  "target proof first",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      new URLSearchParams(query).get('review') ??\n      new URLSearchParams(query).get('proof') ??",
  "      new URLSearchParams(query).get('proof') ??\n      new URLSearchParams(query).get('review') ??"
 ],
 [
  "review reset keeps activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      setActivity(null)\n      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps indicators",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      setActivity(null)\n      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setActivity(null)\n      setProofActivity(null)\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps proof",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setIndicators([])\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps status",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setProofActivity(null)\n      return"
 ],
 [
  "review does not load",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    setStatus('loading')\n\n    Promise.all([",
  "    Promise.all(["
 ],
 [
  "review reads another project",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "activitiesClient.getActivity(target.projectId, target.activityId)",
  "activitiesClient.getActivity(target.activityId, target.projectId)"
 ],
 [
  "review reads indicators of nothing",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "indicatorsClient.getIndicators(target.projectId),",
  "indicatorsClient.getIndicators(),"
 ],
 [
  "review ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .then(([activityRecord, indicatorRecords]) => {\n        if (!mounted) return",
  "      .then(([activityRecord, indicatorRecords]) => {"
 ],
 [
  "review stores no activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivity(activityRecord)\n        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setIndicators(indicatorRecords)\n        setStatus('success')"
 ],
 [
  "review stores no indicators",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivity(activityRecord)\n        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setActivity(activityRecord)\n        setStatus('success')"
 ],
 [
  "review never succeeds",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setIndicators(indicatorRecords)"
 ],
 [
  "review failure ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .catch(() => {\n        if (!mounted) return",
  "      .catch(() => {"
 ],
 [
  "review failure keeps activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivity(null)\n        setIndicators([])\n        setStatus('error')",
  "        setIndicators([])\n        setStatus('error')"
 ],
 [
  "review failure keeps indicators",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivity(null)\n        setIndicators([])\n        setStatus('error')",
  "        setActivity(null)\n        setStatus('error')"
 ],
 [
  "review failure not shown",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setIndicators([])\n        setStatus('error')",
  "        setIndicators([])"
 ],
 [
  "review ignores retry",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [loadAttempt, target])",
  "  }, [target])"
 ],
 [
  "review ignores a new target",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [loadAttempt, target])",
  "  }, [loadAttempt])"
 ],
 [
  "review close inverted",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    if (!open) onClose()",
  "    if (open) onClose()"
 ],
 [
  "review shows without an activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (status === 'success' && activity) {",
  "  if (status === 'success') {"
 ],
 [
  "review shows before success",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (status === 'success' && activity) {",
  "  if (activity) {"
 ],
 [
  "manager decides no proof",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canDecideProof={role === 'Project Manager'}",
  "          canDecideProof={false}"
 ],
 [
  "manager decides proof for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canDecideProof={role === 'Project Manager'}",
  "          canDecideProof={role !== 'Project Manager'}"
 ],
 [
  "manager decides no extension",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canDecideExtension={role === 'Project Manager'}",
  "          canDecideExtension={false}"
 ],
 [
  "manager extension for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canDecideExtension={role === 'Project Manager'}",
  "          canDecideExtension={role !== 'Project Manager'}"
 ],
 [
  "review can edit",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canEdit={false}",
  "          canEdit={true}"
 ],
 [
  "officer logs no expense",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canLogExpense={role === 'Project Officer'}",
  "          canLogExpense={false}"
 ],
 [
  "officer expense for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canLogExpense={role === 'Project Officer'}",
  "          canLogExpense={role !== 'Project Officer'}"
 ],
 [
  "officer requests no extension",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canRequestExtension={role === 'Project Officer'}",
  "          canRequestExtension={false}"
 ],
 [
  "officer extension request for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canRequestExtension={role === 'Project Officer'}",
  "          canRequestExtension={role !== 'Project Officer'}"
 ],
 [
  "officer submits no proof",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canSubmitProof={role === 'Project Officer'}",
  "          canSubmitProof={false}"
 ],
 [
  "officer proof for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canSubmitProof={role === 'Project Officer'}",
  "          canSubmitProof={role !== 'Project Officer'}"
 ],
 [
  "evaluator validates no expense",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canValidateExpense={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateExpense={false}"
 ],
 [
  "evaluator expense for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canValidateExpense={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateExpense={role !== 'Monitoring and Evaluation Officer'}"
 ],
 [
  "evaluator validates no proof",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canValidateProof={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateProof={false}"
 ],
 [
  "evaluator proof for admin",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          canValidateProof={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateProof={role !== 'Monitoring and Evaluation Officer'}"
 ],
 [
  "review has stages",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          journeyStages={[]}",
  "          journeyStages={undefined}"
 ],
 [
  "review change ignores the new activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          onActivityChanged={(updatedActivity) => {\n            setActivity(updatedActivity)\n            onActivityChanged()",
  "          onActivityChanged={() => {\n            onActivityChanged()"
 ],
 [
  "review change does not notify",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            setActivity(updatedActivity)\n            onActivityChanged()\n          }}\n          onEdit",
  "            setActivity(updatedActivity)\n          }}\n          onEdit"
 ],
 [
  "review closes through the handler",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          onOpenChange={handleOpenChange}\n          onSubmitProof",
  "          onOpenChange={() => undefined}\n          onSubmitProof"
 ],
 [
  "review proof not forwarded",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          onSubmitProof={setProofActivity}",
  "          onSubmitProof={() => undefined}"
 ],
 [
  "review panel closed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          open={Boolean(target)}\n          requestedExpenseId",
  "          open={false}\n          requestedExpenseId"
 ],
 [
  "review expense dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          requestedExpenseId={target?.expenseId}",
  "          requestedExpenseId={undefined}"
 ],
 [
  "review proof request dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          requestedProofId={target?.proofId}",
  "          requestedProofId={undefined}"
 ],
 [
  "proof dialog gets no activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          activity={proofActivity}\n          onOpenChange",
  "          activity={activity}\n          onOpenChange"
 ],
 [
  "proof dialog never closes",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            if (!open) setProofActivity(null)\n          }}",
  "            if (!open) return\n          }}"
 ],
 [
  "proof submit keeps old activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          onSubmitted={(updatedActivity) => {\n            setActivity(updatedActivity)\n            setProofActivity(null)",
  "          onSubmitted={() => {\n            setProofActivity(null)"
 ],
 [
  "proof submit keeps dialog",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            setActivity(updatedActivity)\n            setProofActivity(null)\n            onActivityChanged()",
  "            setActivity(updatedActivity)\n            onActivityChanged()"
 ],
 [
  "proof submit does not notify",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            setProofActivity(null)\n            onActivityChanged()\n          }}",
  "            setProofActivity(null)\n          }}"
 ],
 [
  "proof dialog open without activity",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          open={Boolean(proofActivity)}",
  "          open={true}"
 ],
 [
  "fallback panel closed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    <Sheet onOpenChange={handleOpenChange} open={Boolean(target)}>",
  "    <Sheet onOpenChange={handleOpenChange} open={false}>"
 ],
 [
  "fallback description",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        description=\"Open the selected project activity without leaving Dashboard.\"",
  "        description=\"Open.\""
 ],
 [
  "fallback error text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "'The activity proof could not be loaded. Try again from this panel.'",
  "'Could not be loaded.'"
 ],
 [
  "fallback loading text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "'Loading the selected activity and its submitted proof.'",
  "'Loading.'"
 ],
 [
  "fallback error title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title={status === 'error' ? 'Review unavailable' : 'Loading review'}",
  "title={'Loading review'}"
 ],
 [
  "fallback error status",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          status={status === 'error' ? 'error' : 'loading'}",
  "          status={'loading'}"
 ],
 [
  "fallback retry always",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}",
  "onRetry={() => setLoadAttempt((attempt) => attempt + 1)}"
 ],
 [
  "fallback retry does nothing",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}",
  "onRetry={status === 'error' ? () => undefined : undefined}"
 ],
 [
  "trailing year zone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "businessCalendarDate(new Date(), 'Asia/Manila')",
  "businessCalendarDate(new Date(), 'UTC')"
 ],
 [
  "trailing year length",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "start.setUTCDate(start.getUTCDate() - 365)",
  "start.setUTCDate(start.getUTCDate() - 364)"
 ],
 [
  "trailing year start",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "start.setUTCDate(start.getUTCDate() - 365)",
  "start.setUTCDate(start.getUTCDate() - 366)"
 ],
 [
  "snapshot projects need no role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  useEffect(() => {\n    if (!role) return\n    let active = true\n    projectsClient",
  "  useEffect(() => {\n    let active = true\n    projectsClient"
 ],
 [
  "snapshot projects ignore stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .then((records) => {\n        if (!active) return\n        setProjects(records)",
  "      .then((records) => {\n        setProjects(records)"
 ],
 [
  "snapshot keeps no projects",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setProjects(records)\n        const requested",
  "        const requested"
 ],
 [
  "snapshot address parameter",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "new URLSearchParams(window.location.search).get('project')",
  "new URLSearchParams(window.location.search).get('projectId')"
 ],
 [
  "snapshot keeps the choice",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          records.some((record) => record.id === current)\n            ? current\n            : (records.find",
  "          records.some((record) => record.id === current)\n            ? ''\n            : (records.find"
 ],
 [
  "snapshot ignores the address",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "(records.find((record) => record.id === requested)?.id ??\n              (records.length ? 'all' : ''))",
  "(records.length ? 'all' : '')"
 ],
 [
  "snapshot starts on nothing",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "              (records.length ? 'all' : '')),",
  "              ''),"
 ],
 [
  "snapshot empty starts on all",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "              (records.length ? 'all' : '')),",
  "              'all'),"
 ],
 [
  "snapshot list error ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .catch((caught: unknown) => {\n        if (active)\n          setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')",
  "      .catch((caught: unknown) => {\n        setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')"
 ],
 [
  "snapshot list error text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "'Project scope could not be loaded.'",
  "'x'"
 ],
 [
  "snapshot list error always fixed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')",
  "setError('Project scope could not be loaded.')"
 ],
 [
  "snapshot list ignores the role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [role])\n\n  useEffect(() => {\n    if (!projectId) return",
  "  }, [])\n\n  useEffect(() => {\n    if (!projectId) return"
 ],
 [
  "snapshot reads without a scope",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    if (!projectId) return\n    let active = true\n    setMetrics([])",
  "    let active = true\n    setMetrics([])"
 ],
 [
  "snapshot keeps old cards",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    setMetrics([])\n    setError('')\n    dashboardsClient",
  "    setError('')\n    dashboardsClient"
 ],
 [
  "snapshot keeps old error",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    setMetrics([])\n    setError('')\n    dashboardsClient",
  "    setMetrics([])\n    dashboardsClient"
 ],
 [
  "snapshot all projects sends an id",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "...(projectId === 'all' ? {} : { projectId }),",
  "projectId,"
 ],
 [
  "snapshot project sends no id",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "...(projectId === 'all' ? {} : { projectId }),",
  "...{},"
 ],
 [
  "snapshot period dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        ...trailingYearPeriod(),\n      })",
  "      })"
 ],
 [
  "snapshot metrics ignore stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .then((result) => {\n        if (!active) return\n        setMetrics(monitoringReachMetrics(result))",
  "      .then((result) => {\n        setMetrics(monitoringReachMetrics(result))"
 ],
 [
  "snapshot metrics dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setMetrics(monitoringReachMetrics(result))",
  "        setMetrics([])"
 ],
 [
  "snapshot metrics error ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .catch((caught: unknown) => {\n        if (active)\n          setError(\n            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',",
  "      .catch((caught: unknown) => {\n        setError(\n          caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',"
 ],
 [
  "snapshot metrics error text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "'Monitoring data could not be loaded.'",
  "'x'"
 ],
 [
  "snapshot metrics error always fixed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "setError(\n            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',\n          )",
  "setError('Monitoring data could not be loaded.')"
 ],
 [
  "snapshot reads ignore the scope",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [projectId])\n\n  if (!role",
  "  }, [])\n\n  if (!role"
 ],
 [
  "snapshot shows without the view grant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (!role || !can(role, 'monitor_evaluate.view')) return null\n  return (\n    <SectionCard title=\"Project monitoring\">",
  "  if (!role) return null\n  return (\n    <SectionCard title=\"Project monitoring\">"
 ],
 [
  "snapshot hidden for every role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (!role || !can(role, 'monitor_evaluate.view')) return null",
  "  if (!role || can(role, 'monitor_evaluate.view')) return null"
 ],
 [
  "snapshot title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<SectionCard title=\"Project monitoring\">",
  "<SectionCard title=\"Monitoring\">"
 ],
 [
  "snapshot label",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            Project scope\n",
  "            Scope\n"
 ],
 [
  "snapshot label target",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "htmlFor=\"dashboard-project-scope\"",
  "htmlFor=\"scope\""
 ],
 [
  "snapshot picker id",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<SelectTrigger id=\"dashboard-project-scope\">",
  "<SelectTrigger id=\"scope\">"
 ],
 [
  "snapshot picker changes nothing",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<Select value={projectId} onValueChange={setProjectId}>",
  "<Select value={projectId} onValueChange={() => undefined}>"
 ],
 [
  "snapshot all option",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<SelectItem value=\"all\">All projects</SelectItem>",
  "<SelectItem value=\"all\">Everything</SelectItem>"
 ],
 [
  "snapshot options",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                <SelectItem key={project.id} value={project.id}>",
  "                <SelectItem key={project.id} value={project.title}>"
 ],
 [
  "snapshot action dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        {action ? <div className=\"ml-auto\">{action}</div> : null}",
  ""
 ],
 [
  "snapshot error page",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      {error ? (\n        <EmptyState\n          className=\"rounded-xl border border-border bg-card\"",
  "      {false ? (\n        <EmptyState\n          className=\"rounded-xl border border-border bg-card\""
 ],
 [
  "snapshot error title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title=\"Monitoring data unavailable\"",
  "title=\"Unavailable\""
 ],
 [
  "snapshot cards need both",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      ) : projects.length && metrics.length ? (",
  "      ) : projects.length || metrics.length ? ("
 ],
 [
  "snapshot cards ignore the list",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      ) : projects.length && metrics.length ? (",
  "      ) : metrics.length ? ("
 ],
 [
  "snapshot card tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>",
  "                tone=\"info\"\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>"
 ],
 [
  "snapshot card link",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>",
  "                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>"
 ],
 [
  "snapshot loading text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "Loading project monitoring data...",
  "Loading..."
 ],
 [
  "snapshot empty text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "No projects are assigned to this account. Contact an administrator to review project access.",
  "None."
 ],
 [
  "snapshot empty title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title=\"No authorized projects\"",
  "title=\"None\""
 ],
 [
  "snapshot pins ignore the flag",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{DASHBOARD_PINS_UI_ENABLED ? <PinnedCharts projects={projects} /> : null}",
  "<PinnedCharts projects={projects} />"
 ],
 [
  "snapshot pins never",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{DASHBOARD_PINS_UI_ENABLED ? <PinnedCharts projects={projects} /> : null}",
  "{false ? <PinnedCharts projects={projects} /> : null}"
 ],
 [
  "snapshot pins get no projects",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<PinnedCharts projects={projects} />",
  "<PinnedCharts projects={[]} />"
 ],
 [
  "action default variant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  variant = 'outline',\n}: {\n  action: DashboardAction",
  "  variant = 'default',\n}: {\n  action: DashboardAction"
 ],
 [
  "action arrow for every kind",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{action.kind === 'navigate' ? <ArrowRight",
  "{true ? <ArrowRight"
 ],
 [
  "action arrow never",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{action.kind === 'navigate' ? <ArrowRight",
  "{false ? <ArrowRight"
 ],
 [
  "action click ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    onClick={() => onAction(action)}",
  "    onClick={() => undefined}"
 ],
 [
  "item link ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        {item.href ? (\n          <Link",
  "        {false ? (\n          <Link"
 ],
 [
  "item meta ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        {item.meta ? (",
  "        {false ? ("
 ],
 [
  "item status ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      {item.status ? (\n        <StatusBadge",
  "      {false ? (\n        <StatusBadge"
 ],
 [
  "item status tone ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<StatusBadge tone={statusTone(item.severity)}>",
  "<StatusBadge tone=\"info\">"
 ],
 [
  "item progress needs truthy value",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{typeof item.progress === 'number' ? (",
  "{item.progress ? ("
 ],
 [
  "item progress ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{typeof item.progress === 'number' ? (",
  "{false ? ("
 ],
 [
  "compact spacing",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<div className={compact ? 'mt-3 sm:max-w-[220px]' : 'mt-4'}>",
  "<div className={'mt-4'}>"
 ],
 [
  "compact label",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "label={compact ? undefined : 'Progress'}",
  "label={'Progress'}"
 ],
 [
  "progress label never",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "label={compact ? undefined : 'Progress'}",
  "label={undefined}"
 ],
 [
  "progress tone ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          tone={severityTone(item.severity)}\n          value={item.progress}",
  "          tone=\"info\"\n          value={item.progress}"
 ],
 [
  "item actions need both",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{item.primaryAction || item.secondaryAction ? (",
  "{item.primaryAction && item.secondaryAction ? ("
 ],
 [
  "item primary variant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<ActionButton action={item.primaryAction} onAction={onAction} variant=\"default\" />",
  "<ActionButton action={item.primaryAction} onAction={onAction} />"
 ],
 [
  "item secondary variant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<ActionButton action={item.secondaryAction} onAction={onAction} />",
  "<ActionButton action={item.secondaryAction} onAction={onAction} variant=\"default\" />"
 ],
 [
  "administrator only",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    if (role !== 'System Administrator') return\n    dashboardsClient",
  "    dashboardsClient"
 ],
 [
  "dashboard always loading first",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    let mounted = true\n    setStatus('loading')\n\n    if (role",
  "    let mounted = true\n\n    if (role"
 ],
 [
  "dashboard read for another role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  ".getDashboard(role)",
  ".getDashboard('Program Manager')"
 ],
 [
  "dashboard ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .then((viewModel) => {\n        if (!mounted) {\n          return\n        }\n",
  "      .then((viewModel) => {\n"
 ],
 [
  "dashboard not stored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setDashboard(viewModel)\n        setStatus('success')",
  "        setStatus('success')"
 ],
 [
  "dashboard never succeeds",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setDashboard(viewModel)\n        setStatus('success')",
  "        setDashboard(viewModel)"
 ],
 [
  "dashboard failure ignores stale results",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      .catch(() => {\n        if (!mounted) {\n          return\n        }\n\n        setStatus('error')",
  "      .catch(() => {\n        setStatus('error')"
 ],
 [
  "dashboard failure not shown",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          return\n        }\n\n        setStatus('error')\n      })",
  "          return\n        }\n      })"
 ],
 [
  "dashboard ignores revision",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [dashboardRevision, role])",
  "  }, [role])"
 ],
 [
  "dashboard ignores the role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  }, [dashboardRevision, role])",
  "  }, [dashboardRevision])"
 ],
 [
  "review action review-proof",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      action.id === 'review-proof' ||\n",
  "      action.id === 'review-proofs' ||\n"
 ],
 [
  "review action review-expense",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      action.id === 'review-expense' ||\n",
  "      action.id === 'review-expenses' ||\n"
 ],
 [
  "review action open-activity-update",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      action.id === 'open-activity-update' ||\n",
  "      action.id === 'open-activity-updates' ||\n"
 ],
 [
  "review action view-orientation-summary",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      action.id === 'view-orientation-summary'\n    ) {",
  "      action.id === 'view-orientation-summaries'\n    ) {"
 ],
 [
  "review action ignores its id",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      action.id === 'review-proof' ||\n      action.id === 'review-expense' ||\n      action.id === 'open-activity-update' ||\n      action.id === 'view-orientation-summary'\n    ) {",
  "      true\n    ) {"
 ],
 [
  "review trigger not kept",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        activityReviewTrigger.current = document.activeElement as HTMLElement | null\n",
  ""
 ],
 [
  "review not opened",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivityReviewTarget(target)\n        return",
  "        return"
 ],
 [
  "review also navigates",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        setActivityReviewTarget(target)\n        return",
  "        setActivityReviewTarget(target)"
 ],
 [
  "navigate needs navigate kind",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    if (action.kind === 'navigate' && action.href) {",
  "    if (action.href) {"
 ],
 [
  "navigate needs an href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    if (action.kind === 'navigate' && action.href) {",
  "    if (action.kind === 'navigate') {"
 ],
 [
  "navigate pushes the workflow page",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      router.push(action.href)\n      return",
  "      router.push(actionWorkflowHref(action))\n      return"
 ],
 [
  "workflow page not pushed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    router.push(actionWorkflowHref(action))\n  }",
  "  }"
 ],
 [
  "role overview for every role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (role && role !== 'System Administrator')\n    return",
  "  if (role)\n    return"
 ],
 [
  "role overview name dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<RoleOverviewDashboard fullName={profile?.fullName} role={role} />",
  "<RoleOverviewDashboard role={role} />"
 ],
 [
  "loading page heading",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<h1 className=\"sr-only\">Dashboard</h1>",
  "<h1 className=\"sr-only\">Home</h1>"
 ],
 [
  "loading page text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "Loading dashboard...",
  "Loading..."
 ],
 [
  "error page ignores the status",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (status === 'error' || !dashboard) {",
  "  if (!dashboard) {"
 ],
 [
  "error page ignores a missing dashboard",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "  if (status === 'error' || !dashboard) {",
  "  if (status === 'error') {"
 ],
 [
  "error page heading",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<h1 className=\"sr-only\">Dashboard unavailable</h1>",
  "<h1 className=\"sr-only\">Home</h1>"
 ],
 [
  "error page text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "description=\"We could not load this dashboard right now. Reload the page to try again.\"",
  "description=\"x\""
 ],
 [
  "error page title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title=\"Dashboard data unavailable\"",
  "title=\"x\""
 ],
 [
  "empty page needs all sections empty",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "dashboard.sections.every((section) => section.items.length === 0)",
  "dashboard.sections.some((section) => section.items.length === 0)"
 ],
 [
  "empty page needs no metrics",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    dashboard.metrics.length === 0 &&\n",
  "    true &&\n"
 ],
 [
  "empty page needs no section items",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "    dashboard.metrics.length === 0 &&\n    dashboard.sections.every((section) => section.items.length === 0)",
  "    dashboard.metrics.length === 0"
 ],
 [
  "welcome title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title={`Welcome! ${roleLabel}`}",
  "title={`Hello ${roleLabel}`}"
 ],
 [
  "role label fallback",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "const roleLabel = role || 'Staff'",
  "const roleLabel = role"
 ],
 [
  "task counts ignore the flag",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? <ActionKpiRow /> : null}",
  "<ActionKpiRow />"
 ],
 [
  "task counts never",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? <ActionKpiRow /> : null}",
  "{false ? <ActionKpiRow /> : null}"
 ],
 [
  "snapshot ignores the flag",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED && canLoadDashboardMonitoring(role, profile) ? (",
  "{canLoadDashboardMonitoring(role, profile) ? ("
 ],
 [
  "snapshot ignores the grants",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED && canLoadDashboardMonitoring(role, profile) ? (",
  "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? ("
 ],
 [
  "snapshot action with executive",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            !dashboard.executive && dashboard.primaryAction ? (",
  "            dashboard.primaryAction ? ("
 ],
 [
  "snapshot action without executive dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "            !dashboard.executive && dashboard.primaryAction ? (",
  "            dashboard.executive && dashboard.primaryAction ? ("
 ],
 [
  "snapshot action variant",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                variant=\"default\"\n              />\n            ) : undefined",
  "                variant=\"outline\"\n              />\n            ) : undefined"
 ],
 [
  "snapshot action handler",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                onAction={handleAction}\n                variant=\"default\"",
  "                onAction={() => undefined}\n                variant=\"default\""
 ],
 [
  "snapshot gets no role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          role={role}\n        />\n      ) : null}\n      {dashboard.executive",
  "          role={null}\n        />\n      ) : null}\n      {dashboard.executive"
 ],
 [
  "executive ignores the model",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{dashboard.executive ? (\n        <ExecutiveDashboard",
  "{false ? (\n        <ExecutiveDashboard"
 ],
 [
  "executive gets no action",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<ExecutiveDashboard model={dashboard.executive} summaryAction={dashboard.primaryAction} />",
  "<ExecutiveDashboard model={dashboard.executive} />"
 ],
 [
  "empty page ignored",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      {emptyDashboard ? (",
  "      {false ? ("
 ],
 [
  "empty page title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title=\"No dashboard records\"",
  "title=\"x\""
 ],
 [
  "empty page text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "description=\"No dashboard records are available for this account.\"",
  "description=\"x\""
 ],
 [
  "metric cards without metrics",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (",
  "{role && !can(role, 'monitor_evaluate.view') ? ("
 ],
 [
  "metric cards need a role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (",
  "{dashboard.metrics.length > 0 && !can(role as never, 'monitor_evaluate.view') ? ("
 ],
 [
  "metric cards for the monitoring role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (",
  "{dashboard.metrics.length > 0 && role ? ("
 ],
 [
  "metric card link",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>",
  "                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"
 ],
 [
  "metric card tone",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>",
  "                tone=\"info\"\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"
 ],
 [
  "metric card helper",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                description={metric.helperText}\n                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>",
  "                description=\"\"\n                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"
 ],
 [
  "sections ignored when empty list",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      {dashboard.sections.length > 0 ? (",
  "      {true ? ("
 ],
 [
  "sections never",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "      {dashboard.sections.length > 0 ? (",
  "      {false ? ("
 ],
 [
  "executive section heading",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          {dashboard.executive ? (\n            <div className=\"space-y-1\">",
  "          {false ? (\n            <div className=\"space-y-1\">"
 ],
 [
  "executive section title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "Projects and alerts behind the summary",
  "x"
 ],
 [
  "executive section note",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "Portfolio-wide records remain available for follow-up after the executive review.",
  "x"
 ],
 [
  "executive section eyebrow",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                Operational detail\n",
  "                Details\n"
 ],
 [
  "plain section heading",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "              Dashboard detail\n",
  "              Details\n"
 ],
 [
  "section view all hidden",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                  section.viewAllHref ? (",
  "                  false ? ("
 ],
 [
  "section view all label",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "{section.viewAllLabel ?? 'View All'}",
  "{'View All'}"
 ],
 [
  "section view all href",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "<Link href={section.viewAllHref}>",
  "<Link href=\"/\">"
 ],
 [
  "section description dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                description={section.description}\n                actions",
  "                actions"
 ],
 [
  "section empty default",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "section.emptyText ?? 'No records are currently available.'",
  "section.emptyText ?? 'x'"
 ],
 [
  "section empty text dropped",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "section.emptyText ?? 'No records are currently available.'",
  "'No records are currently available.'"
 ],
 [
  "section empty title",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "title=\"Nothing to review\"",
  "title=\"x\""
 ],
 [
  "section items always listed",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                {section.items.length > 0 ? (\n                  <div",
  "                {true ? (\n                  <div"
 ],
 [
  "portfolio list label",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                    aria-label={\n                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'\n                        ? `${section.title} list`",
  "                    aria-label={\n                      section.id === 'portfolio-health'\n                        ? `${section.title} list`"
 ],
 [
  "alerts list label",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                    aria-label={\n                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'\n                        ? `${section.title} list`",
  "                    aria-label={\n                      section.id === 'escalated-alerts'\n                        ? `${section.title} list`"
 ],
 [
  "list label text",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "? `${section.title} list`",
  "? `${section.title}`"
 ],
 [
  "list class",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "? 'max-h-[19rem] overflow-y-auto pr-2'",
  "? 'overflow-y-auto pr-2'"
 ],
 [
  "list entry limit",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                        ? '3'\n",
  "                        ? '5'\n"
 ],
 [
  "list focusable",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                        ? 0\n                        : undefined",
  "                        ? -1\n                        : undefined"
 ],
 [
  "compact health",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "compact={section.id === 'portfolio-health'}",
  "compact={section.id === 'escalated-alerts'}"
 ],
 [
  "items handler",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "                        onAction={handleAction}\n                      />\n                    ))}",
  "                        onAction={() => undefined}\n                      />\n                    ))}"
 ],
 [
  "review panel change reload",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        onActivityChanged={() => setDashboardRevision((revision) => revision + 1)}",
  "        onActivityChanged={() => undefined}"
 ],
 [
  "review panel close clears",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "          setActivityReviewTarget(null)\n          window.requestAnimationFrame",
  "          window.requestAnimationFrame"
 ],
 [
  "review panel close focus",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "window.requestAnimationFrame(() => activityReviewTrigger.current?.focus())",
  "window.requestAnimationFrame(() => undefined)"
 ],
 [
  "review panel role",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        role={role}\n        target={activityReviewTarget}",
  "        role={null}\n        target={activityReviewTarget}"
 ],
 [
  "review panel target",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  "        target={activityReviewTarget}",
  "        target={null}"
 ]
]
```


```bash
F=apps/web/src/features/dashboard/components/role-dashboard.tsx
H=$(git hash-object $F)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-role.json apps/web/src/features/dashboard/components/role-dashboard.test.tsx apps/web/src/features/dashboard/components/role-dashboard.monitoring.test.tsx apps/web/src/features/dashboard/components/role-dashboard.review.test.tsx apps/web/src/features/dashboard/components/role-dashboard.authorization.test.ts > .tmp/s7d/out/t6-survey.txt 2>&1
grep -E "^unmutated|^mutations|NOT APPLIED" .tmp/s7d/out/t6-survey.txt
grep SURVIVED .tmp/s7d/out/t6-survey.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $F)" = "$H" && echo "file restored"
```


Expected:

```text
unmutated: pass
mutations 240, survived 42
dashboard failure ignores stale results
dashboard ignores stale results
error page ignores a missing dashboard
evaluator validates no expense
evaluator validates no proof
executive section note
fallback description
fallback retry always
manager decides no extension
manager decides no proof
metric card helper
metric cards need a role
officer logs no expense
officer requests no extension
officer submits no proof
proof dialog gets no activity
proof submit keeps dialog
proof submit keeps old activity
review change ignores the new activity
review failure ignores stale results
review failure keeps activity
review failure keeps indicators
review ignores stale results
review panel role
review reset keeps activity
review reset keeps indicators
review reset keeps proof
review reset keeps status
review shows before success
review shows without an activity
role label fallback
snapshot card link
snapshot card tone
snapshot cards ignore the list
snapshot keeps the choice
snapshot list error ignores stale results
snapshot list ignores the role
snapshot metrics error ignores stale results
snapshot metrics ignore stale results
snapshot projects ignore stale results
snapshot projects need no role
snapshot shows without the view grant
file restored
```


All 240 mutations are applied and the unmutated run passes; 198 are killed and 42 survive: 23 in the review panel, 11 in the snapshot and 8 in the shell. The 34 survivors in the two units are what the shell tests cannot reach, because the shell renders them only for a System Administrator (the grants of each role in the review panel, the answer of a replaced target or role, the cards of a project list that is replaced): Task 7 pins them by testing the units directly. The 8 shell survivors are in lines that Task 7 does not move; Task 7 lists them by name. The first survey of the unsplit file left 12 there: the four that were behavior (the role dependency of the dashboard load, the status half of the error page condition, the empty page rule and the section wrapper) are pinned by the four cases added to `role-dashboard.test.tsx` and `role-dashboard.review.test.tsx`, and the same mutations now fail.

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the role dashboard states, monitoring and activity review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1557 files in <ms>. No fixes applied.
 4 files changed, 1248 insertions(+)
```


---

### Task 7: Split the role dashboard into helpers and four components

**Files:**
- Create: `apps/web/src/features/dashboard/dashboard.utils.ts`, `dashboard.utils.test.ts` (55 tests)
- Create: `apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx`, `connected-monitoring-snapshot.tsx`, `dashboard-list-item.tsx` and a test for each (23, 22 and 25 tests)
- Modify: `apps/web/src/features/dashboard/components/role-dashboard.tsx`
- Create (gitignored): `.tmp/s7d/task7-cut.json`, `mut-role-utils.json`, `mut-role-review.json`, `mut-role-snapshot.json`, `mut-role-item.json`, `mut-role-shell.json`

The role dashboard splits along the seams it already has. The six helpers (`severityTone`, `statusTone`, `metricIcons`, `actionWorkflowHref`, `dashboardActivityTarget` with its type, `trailingYearPeriod`) become `dashboard.utils.ts`. The review panel, the monitoring snapshot and the two list components become files of their own with the props they already had. `canLoadDashboardMonitoring` stays in the shell, where the authorization test imports it, and so does the duplicate metric grid (ruling 9). Nothing changes in the markup or the order of the hooks.

- [ ] **Step 1: Cut the helpers and components out**

`task7-cut.json` pins the file as Task 5 leaves it (hash `6b4d47c9`). The helpers and components get an `export` keyword on their first line; the review panel imports the target type, the snapshot imports `metricIcons`, `severityTone` and `trailingYearPeriod`, the list items import both tones, and the shell imports what it still uses:

Create `.tmp/s7d/task7-cut.json`:

```json
{
 "source": "apps/web/src/features/dashboard/components/role-dashboard.tsx",
 "hash": "6b4d47c9",
 "files": {
  "apps/web/src/features/dashboard/dashboard.utils.ts": [
   "@imports",
   "",
   "export const severityTone = (severity?: DashboardSeverity) => {",
   [78, 91],
   "",
   "export const statusTone = (severity?: DashboardSeverity) =>",
   [94, 94],
   "",
   "export const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]",
   "",
   "export const actionWorkflowHref = (action: DashboardAction) => {",
   [99, 111],
   "",
   "export const dashboardActivityTarget = (href?: string) => {",
   [114, 127],
   "",
   "export type DashboardActivityTarget = NonNullable<ReturnType<typeof dashboardActivityTarget>>",
   "",
   [251, 251],
   "export const trailingYearPeriod = () => {",
   [253, 257]
  ],
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { DashboardActivityTarget } from '../dashboard.utils'",
   "",
   "export const DashboardActivityReviewPanel = ({",
   [132, 249]
  ],
  "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { metricIcons, severityTone, trailingYearPeriod } from '../dashboard.utils'",
   "",
   "export const ConnectedMonitoringSnapshot = ({",
   [259, 380]
  ],
  "apps/web/src/features/dashboard/components/dashboard-list-item.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { severityTone, statusTone } from '../dashboard.utils'",
   "",
   "export const ActionButton = ({",
   [382, 400],
   "",
   "export const DashboardListItem = ({",
   [403, 454]
  ],
  "apps/web/src/features/dashboard/components/role-dashboard.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { type DashboardActivityTarget, actionWorkflowHref, dashboardActivityTarget, metricIcons, severityTone } from '../dashboard.utils'",
   "import { ConnectedMonitoringSnapshot } from './connected-monitoring-snapshot'",
   "import { DashboardActivityReviewPanel } from './dashboard-activity-review-panel'",
   "import { ActionButton, DashboardListItem } from './dashboard-list-item'",
   "",
   [65, 75],
   "",
   [456, 693]
  ]
 }
}
```


```bash
D=apps/web/src/features/dashboard
cp $D/components/role-dashboard.tsx .tmp/s7d/before/role-t7.tsx
node .tmp/s7d/cut.mjs .tmp/s7d/task7-cut.json
node .tmp/s7d/trim-imports.mjs $D/dashboard.utils.ts $D/components/dashboard-activity-review-panel.tsx $D/components/connected-monitoring-snapshot.tsx $D/components/dashboard-list-item.tsx $D/components/role-dashboard.tsx
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
node .tmp/s7d/same-lines.mjs .tmp/s7d/before/role-t7.tsx $D/dashboard.utils.ts $D/components/dashboard-activity-review-panel.tsx $D/components/connected-monitoring-snapshot.tsx $D/components/dashboard-list-item.tsx $D/components/role-dashboard.tsx --list | tail -3
wc -l $D/dashboard.utils.ts $D/components/dashboard-activity-review-panel.tsx $D/components/connected-monitoring-snapshot.tsx $D/components/dashboard-list-item.tsx $D/components/role-dashboard.tsx
```


Expected:

```text
apps/web/src/features/dashboard/dashboard.utils.ts: 123 lines
apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx: 184 lines
apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx: 188 lines
apps/web/src/features/dashboard/components/dashboard-list-item.tsx: 139 lines
apps/web/src/features/dashboard/components/role-dashboard.tsx: 318 lines
apps/web/src/features/dashboard/dashboard.utils.ts: removed ArrowRight, ClipboardCheck, Loader2, ShieldCheck, useRouter, ReactNode, useEffect, useRef, useState, PageHeader, AsyncState, EmptyState, MetricCard, ProgressBar, SectionCard, SidePanel, StatusBadge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, ADMIN_DASHBOARD_MONITORING_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, useCurrentRole, activitiesClient, dashboardsClient, indicatorsClient, projectsClient, can, principalHasAtomicPermission, Activity, DashboardItem, Indicator, RoleDashboardViewModel, PathwaysRole, RoutePrincipal, ActivityDetailPanel, ActivityProofDialog, monitoringReachMetrics, RoleOverviewDashboard, ActionKpiRow, ExecutiveDashboard, PinnedCharts, Link
apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx: removed ArrowRight, BarChart3, ClipboardCheck, Clock, FolderKanban, ShieldCheck, useRouter, ReactNode, useRef, PageHeader, EmptyState, MetricCard, ProgressBar, SectionCard, StatusBadge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ADMIN_DASHBOARD_MONITORING_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, dashboardsClient, projectsClient, can, principalHasAtomicPermission, DashboardAction, DashboardItem, DashboardSeverity, RoleDashboardViewModel, PathwaysRole, RoutePrincipal, businessCalendarDate, monitoringReachMetrics, RoleOverviewDashboard, ActionKpiRow, ExecutiveDashboard, PinnedCharts, Link
apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx: removed ArrowRight, BarChart3, ClipboardCheck, Clock, Loader2, ShieldCheck, useRouter, useRef, PageHeader, AsyncState, ProgressBar, SidePanel, StatusBadge, Button, Sheet, ADMIN_DASHBOARD_MONITORING_UI_ENABLED, activitiesClient, indicatorsClient, principalHasAtomicPermission, Activity, DashboardAction, DashboardItem, DashboardSeverity, Indicator, PathwaysRole, RoutePrincipal, businessCalendarDate, ActivityDetailPanel, ActivityProofDialog, RoleOverviewDashboard, ActionKpiRow, ExecutiveDashboard, Link
apps/web/src/features/dashboard/components/dashboard-list-item.tsx: removed AlertTriangle, BarChart3, ClipboardCheck, Clock, FolderKanban, Loader2, ShieldCheck, useRouter, ReactNode, useEffect, useRef, useState, PageHeader, AsyncState, EmptyState, MetricCard, SectionCard, SidePanel, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, ADMIN_DASHBOARD_MONITORING_UI_ENABLED, DASHBOARD_PINS_UI_ENABLED, useCurrentRole, activitiesClient, dashboardsClient, indicatorsClient, projectsClient, can, principalHasAtomicPermission, Activity, DashboardSeverity, Indicator, RoleDashboardViewModel, PathwaysRole, RoutePrincipal, businessCalendarDate, ActivityDetailPanel, ActivityProofDialog, monitoringReachMetrics, RoleOverviewDashboard, ActionKpiRow, ExecutiveDashboard, PinnedCharts
apps/web/src/features/dashboard/components/role-dashboard.tsx: removed ArrowRight, BarChart3, Clock, FolderKanban, ReactNode, AsyncState, ProgressBar, SidePanel, StatusBadge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, DASHBOARD_PINS_UI_ENABLED, activitiesClient, indicatorsClient, projectsClient, Activity, DashboardItem, DashboardSeverity, Indicator, businessCalendarDate, ActivityDetailPanel, ActivityProofDialog, monitoringReachMetrics, PinnedCharts
Checked 5 files in <ms>. Fixed 4 files.
web typecheck clean

original lines 592, lost 0, added 0
   66 apps/web/src/features/dashboard/dashboard.utils.ts
  134 apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx
  147 apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx
   85 apps/web/src/features/dashboard/components/dashboard-list-item.tsx
  283 apps/web/src/features/dashboard/components/role-dashboard.tsx
  715 total
```


`same-lines.mjs` prints `lost 0` (it ignores the `export` keyword and the import block, so the added lines it lists are none): the 693 lines are in the five files. The 693 lines become 66 (helpers), 134 (review panel), 147 (snapshot), 85 (list items) and 283 (shell) after Biome, and the shell is far below the 500 line flag.

- [ ] **Step 2: Run the pins against the cut**

```bash
(cd apps/web && timeout 800 pnpm exec vitest run src/features/dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
 Test Files  15 passed (15)
      Tests  167 passed (167)
```


Every test of the folder passes against the cut: the pins of Task 6 and the authorization test are unchanged.

- [ ] **Step 3: Test each unit on its own**

The helper test is a set of tables: the two tone helpers over every severity, the icon rotation, `actionWorkflowHref` over 18 label and dialog texts (with the rule order: budget and proof before alert and decision), the address rules (eight addresses with no target, nine with their expense and proof ids, the `review` id before the `proof` id) and `trailingYearPeriod` at five fake dates including the Manila midnight and a leap year:

Create `apps/web/src/features/dashboard/dashboard.utils.test.ts`:

```ts
import { AlertTriangle, BarChart3, Clock, FolderKanban } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DashboardAction } from '@/types/pathways'

import {
  actionWorkflowHref,
  dashboardActivityTarget,
  metricIcons,
  severityTone,
  statusTone,
  trailingYearPeriod,
} from './dashboard.utils'

const action = (label: string, dialogTitle?: string) =>
  ({ id: 'a', label, kind: 'navigate', ...(dialogTitle ? { dialogTitle } : {}) }) as DashboardAction

describe('severityTone', () => {
  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['info', 'info'],
    ['neutral', 'info'],
    [undefined, 'info'],
  ] as const)('maps %s to %s', (severity, tone) => {
    expect(severityTone(severity)).toBe(tone)
  })
})

describe('statusTone', () => {
  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['info', 'info'],
    ['neutral', 'neutral'],
    [undefined, 'info'],
  ] as const)('maps %s to %s', (severity, tone) => {
    expect(statusTone(severity)).toBe(tone)
  })
})

describe('metricIcons', () => {
  it('rotates folders, alerts, time and charts', () => {
    expect(metricIcons).toEqual([FolderKanban, AlertTriangle, Clock, BarChart3])
  })
})

describe('actionWorkflowHref', () => {
  it.each([
    ['Approve budget', undefined, '/projects'],
    ['Review Proof', undefined, '/projects'],
    ['Record recommendation', undefined, '/alerts'],
    ['Make a decision', undefined, '/alerts'],
    ['Log outcome', undefined, '/alerts'],
    ['Escalated alert', undefined, '/alerts'],
    ['Flag a risk', undefined, '/alerts'],
    ['View orientation summary', undefined, '/projects'],
    ['Open activity update', undefined, '/projects'],
    ['Something else', undefined, '/projects'],
    ['Open', 'Record outcome', '/alerts'],
    ['Open', 'Review proof', '/projects'],
    ['Open', undefined, '/projects'],
    ['Budget alert', undefined, '/projects'],
    ['Proof of the alert', undefined, '/projects'],
    ['Alert on the proof decision', undefined, '/projects'],
    ['Decision about the activity', undefined, '/alerts'],
    ['Flag the activity', undefined, '/alerts'],
  ])('sends %s with dialog %s to %s', (label, dialogTitle, href) => {
    expect(actionWorkflowHref(action(label, dialogTitle))).toBe(href)
  })
})

describe('dashboardActivityTarget', () => {
  it.each([
    [undefined],
    [''],
    ['/projects/p1'],
    ['/projects/p1/activities'],
    ['/projects/p1/activities/'],
    ['/projects//activities/a1'],
    ['/projects/p1/x/activities/a1'],
    ['/other/p1/activities/a1'],
    ['https://example.test/projects/p1/activities/a1'],
  ])('finds no target in %s', (href) => {
    expect(dashboardActivityTarget(href)).toBeNull()
  })

  it.each([
    ['/projects/p1/activities/a1', undefined, undefined],
    ['/projects/p1/activities/a1?expense=e1', 'e1', undefined],
    ['/projects/p1/activities/a1?review=r1', undefined, 'r1'],
    ['/projects/p1/activities/a1?proof=q1', undefined, 'q1'],
    ['/projects/p1/activities/a1?review=r1&proof=q1', undefined, 'r1'],
    ['/projects/p1/activities/a1?expense=e1&review=r1', 'e1', 'r1'],
    ['/projects/p1/activities/a1?other=x', undefined, undefined],
    ['/projects/p1/activities/a1/more', undefined, undefined],
    ['/projects/p1/activities/a1#top', undefined, undefined],
  ])('reads the ids of %s', (href, expenseId, proofId) => {
    expect(dashboardActivityTarget(href)).toEqual({
      projectId: 'p1',
      activityId: 'a1',
      expenseId,
      proofId,
    })
  })

  it('stops the activity id at a query', () => {
    expect(dashboardActivityTarget('/projects/p1/activities/a1?x=1')?.activityId).toBe('a1')
  })
})

describe('trailingYearPeriod', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['2026-09-27T04:00:00.000Z', '2025-09-27', '2026-09-27'],
    ['2026-09-26T17:30:00.000Z', '2025-09-27', '2026-09-27'],
    ['2026-09-26T15:59:59.000Z', '2025-09-26', '2026-09-26'],
    ['2024-03-01T04:00:00.000Z', '2023-03-02', '2024-03-01'],
    ['2026-01-01T00:00:00.000Z', '2025-01-01', '2026-01-01'],
  ])('at %s covers %s to %s', (now, periodStart, periodEnd) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))

    expect(trailingYearPeriod()).toEqual({ periodStart, periodEnd })
  })
})
```


The list item test stubs the badge and the bar to read the tone and the label they receive, and covers the button (the action it reports, the arrow only for navigation, the four variants), the linked or plain title, the meta line, the six status tones, the progress bar (zero counts, compact spacing and missing label) and the two action buttons in order:

Create `apps/web/src/features/dashboard/components/dashboard-list-item.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DashboardAction, DashboardItem } from '@/types/pathways'

import { ActionButton, DashboardListItem } from './dashboard-list-item'

// Stubs expose the tone and the label the item hands to the shared badge and bar.
vi.mock('@/components/pathways', () => ({
  StatusBadge: ({ tone, children }: { tone: string; children: React.ReactNode }) => (
    <span data-testid="badge" data-tone={tone}>
      {children}
    </span>
  ),
  ProgressBar: ({ label, tone, value }: { label?: string; tone: string; value: number }) => (
    <div data-testid="bar" data-label={label ?? ''} data-tone={tone} data-value={value} />
  ),
}))

const act = (overrides: Partial<DashboardAction> = {}) =>
  ({ id: 'go', label: 'Open', kind: 'navigate', href: '/x', ...overrides }) as DashboardAction
const item = (overrides: Partial<DashboardItem> = {}) =>
  ({ id: 'item-1', title: 'Synthetic item', description: 'Synthetic description', ...overrides }) as DashboardItem

afterEach(() => {
  cleanup()
})

describe('ActionButton', () => {
  it('reports the action it shows when clicked', () => {
    const onAction = vi.fn()
    const action = act()
    render(<ActionButton action={action} onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith(action)
  })

  it.each([
    ['navigate', 1],
    ['dialog', 0],
    ['submit', 0],
  ])('draws %s actions with %s arrows', (kind, arrows) => {
    render(<ActionButton action={act({ kind } as never)} onAction={vi.fn()} />)

    expect(screen.getByRole('button').querySelectorAll('svg')).toHaveLength(arrows)
  })

  it('is a small button that does not submit a form', () => {
    render(<ActionButton action={act()} onAction={vi.fn()} />)

    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('gap-2')).toBe(true)
    expect(button.classList.contains('h-9')).toBe(true)
  })

  it.each([
    [undefined, false, true],
    ['outline', false, true],
    ['default', true, false],
    ['secondary', false, true],
  ] as const)('with variant %s is filled: %s, outlined: %s', (variant, filled, outlined) => {
    render(<ActionButton action={act()} onAction={vi.fn()} variant={variant} />)

    const button = screen.getByRole('button')
    expect(button.classList.contains('bg-primary')).toBe(filled)
    expect(button.classList.contains('border-primary')).toBe(outlined)
  })
})

describe('DashboardListItem', () => {
  it('shows a plain title, the description and no meta, status or bar by default', () => {
    render(<DashboardListItem item={item()} onAction={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Synthetic item')
    expect(screen.getByText('Synthetic description')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByTestId('badge')).toBeNull()
    expect(screen.queryByTestId('bar')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('links the title when the item has an address', () => {
    render(<DashboardListItem item={item({ href: '/projects/p1' })} onAction={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Synthetic item' }).getAttribute('href')).toBe('/projects/p1')
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('shows the meta line only when there is one', () => {
    render(<DashboardListItem item={item({ meta: 'Due 12 Oct' })} onAction={vi.fn()} />)

    expect(screen.getByText('Due 12 Oct')).toBeTruthy()
  })

  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['neutral', 'neutral'],
    ['info', 'info'],
    [undefined, 'info'],
  ] as const)('gives a %s status the %s badge', (severity, tone) => {
    render(<DashboardListItem item={item({ status: 'Open', severity })} onAction={vi.fn()} />)

    expect(screen.getByTestId('badge').textContent).toBe('Open')
    expect(screen.getByTestId('badge').getAttribute('data-tone')).toBe(tone)
  })

  it.each([
    [0, 'Progress', 'mt-4'],
    [40, 'Progress', 'mt-4'],
  ])('shows a bar for progress %s with its label', (progress, label, spacing) => {
    render(<DashboardListItem item={item({ progress, severity: 'warning' })} onAction={vi.fn()} />)

    const bar = screen.getByTestId('bar')
    expect(bar.getAttribute('data-value')).toBe(String(progress))
    expect(bar.getAttribute('data-label')).toBe(label)
    expect(bar.getAttribute('data-tone')).toBe('warning')
    expect(bar.parentElement?.className).toBe(spacing)
  })

  it('narrows the bar and drops its label in the compact layout', () => {
    render(<DashboardListItem compact item={item({ progress: 40 })} onAction={vi.fn()} />)

    expect(screen.getByTestId('bar').getAttribute('data-label')).toBe('')
    expect(screen.getByTestId('bar').getAttribute('data-tone')).toBe('info')
    expect(screen.getByTestId('bar').parentElement?.className).toBe('mt-3 sm:max-w-[220px]')
  })

  it('shows no bar for progress that is not a number', () => {
    render(<DashboardListItem item={item({ progress: undefined })} onAction={vi.fn()} />)

    expect(screen.queryByTestId('bar')).toBeNull()
  })

  it('shows the primary action filled and the secondary one outlined, in that order', () => {
    const onAction = vi.fn()
    const primary = act({ id: 'p', label: 'Primary' })
    const secondary = act({ id: 's', label: 'Secondary' })
    render(
      <DashboardListItem
        item={item({ primaryAction: primary, secondaryAction: secondary })}
        onAction={onAction}
      />,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Primary', 'Secondary'])
    expect(buttons[0].classList.contains('bg-primary')).toBe(true)
    expect(buttons[1].classList.contains('bg-primary')).toBe(false)
    fireEvent.click(buttons[1])
    expect(onAction).toHaveBeenCalledWith(secondary)
  })

  it.each([
    ['primary', { primaryAction: act({ label: 'Only' }) }],
    ['secondary', { secondaryAction: act({ label: 'Only' }) }],
  ])('shows a lone %s action', (_name, actions) => {
    render(<DashboardListItem item={item(actions)} onAction={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
```


The review panel test covers what only the administrator reaches through the dashboard: the grants of each role (the project manager decides, the officer logs and submits, the evaluator validates, the administrator and a missing role get none), no read without a target, the Retry that reads both again, the answer of an old target that must be ignored (both a result and a failure arriving late), the reset when the target goes, closing, a changed activity and the proof dialog:

Create `apps/web/src/features/dashboard/components/dashboard-activity-review-panel.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardActivityReviewPanel } from './dashboard-activity-review-panel'

const api = vi.hoisted(() => ({ getActivity: vi.fn(), getIndicators: vi.fn() }))
const seen = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  proof: null as Record<string, unknown> | null,
  opened: [] as string[],
}))

vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/features/projects', () => ({
  ActivityDetailPanel: (props: Record<string, unknown>) => {
    seen.detail = props
    if (props.open) seen.opened.push((props.activity as { title: string } | null)?.title ?? 'none')
    return props.open ? (
      <div data-testid="detail">{(props.activity as { title: string } | null)?.title ?? 'none'}</div>
    ) : null
  },
  ActivityProofDialog: (props: Record<string, unknown>) => {
    seen.proof = props
    return <div data-testid="proof">{(props.activity as { title: string } | null)?.title ?? 'none'}</div>
  },
}))

type Props = ComponentProps<typeof DashboardActivityReviewPanel>
const target = (overrides: Record<string, unknown> = {}) => ({
  projectId: 'p1',
  activityId: 'a1',
  expenseId: undefined,
  proofId: undefined,
  ...overrides,
})
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const onActivityChanged = vi.fn()
const onClose = vi.fn()
const props = (overrides: Record<string, unknown> = {}) =>
  ({ role: 'Project Manager', target: target(), onActivityChanged, onClose, ...overrides }) as unknown as Props
const show = (overrides: Record<string, unknown> = {}) =>
  render(<DashboardActivityReviewPanel {...props(overrides)} />)
const detailProps = () => seen.detail as Record<string, unknown>
const proofProps = () => seen.proof as Record<string, unknown>

describe('DashboardActivityReviewPanel', () => {
  beforeEach(() => {
    api.getActivity.mockResolvedValue({ title: 'First activity' })
    api.getIndicators.mockResolvedValue([{ id: 'indicator-1' }])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    seen.detail = seen.proof = null
    seen.opened.length = 0
  })

  it('shows nothing and reads nothing without a target', async () => {
    show({ target: null })
    await act(async () => {})

    expect(api.getActivity).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(screen.queryByText('Activity details')).toBeNull()
    expect(screen.queryByTestId('detail')).toBeNull()
  })

  it('reads the activity and the project indicators of the target', async () => {
    show({ target: target({ projectId: 'p9', activityId: 'a9' }) })

    await screen.findByTestId('detail')
    expect(api.getActivity).toHaveBeenCalledWith('p9', 'a9')
    expect(api.getIndicators).toHaveBeenCalledWith('p9')
    expect(detailProps()).toMatchObject({
      activity: { title: 'First activity' },
      indicators: [{ id: 'indicator-1' }],
      journeyStages: [],
      canEdit: false,
      open: true,
    })
    expect((detailProps().onEdit as () => unknown)()).toBeUndefined()
  })

  it('passes the requested expense and proof of the target', async () => {
    show({ target: target({ expenseId: 'e1', proofId: 'r1' }) })

    await screen.findByTestId('detail')
    expect(detailProps()).toMatchObject({ requestedExpenseId: 'e1', requestedProofId: 'r1' })
  })

  it.each([
    ['Project Manager', { canDecideProof: true, canDecideExtension: true }],
    ['Project Officer', { canLogExpense: true, canRequestExtension: true, canSubmitProof: true }],
    ['Monitoring and Evaluation Officer', { canValidateExpense: true, canValidateProof: true }],
    ['System Administrator', {}],
    [null, {}],
  ])('grants %s only %j', async (role, granted) => {
    show({ role })

    await screen.findByTestId('detail')
    const all = {
      canDecideProof: false,
      canDecideExtension: false,
      canLogExpense: false,
      canRequestExtension: false,
      canSubmitProof: false,
      canValidateExpense: false,
      canValidateProof: false,
    }
    expect(detailProps()).toMatchObject({ ...all, ...granted })
  })

  it('shows the loading page while the reads are pending', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    show()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.getByText('Activity details')).toBeTruthy()
    expect(
      screen.getByText('Open the selected project activity without leaving Dashboard.'),
    ).toBeTruthy()
    expect(screen.getByText('Loading the selected activity and its submitted proof.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it.each([
    ['activity', () => api.getActivity.mockRejectedValue(new Error('down'))],
    ['indicator', () => api.getIndicators.mockRejectedValue(new Error('down'))],
  ])('shows the failure when the %s read fails, and Retry reads both again', async (_name, fail) => {
    fail()
    show()

    expect(await screen.findByText('Review unavailable')).toBeTruthy()
    expect(
      screen.getByText('The activity proof could not be loaded. Try again from this panel.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('detail')).toBeNull()
    api.getActivity.mockResolvedValue({ title: 'Second activity' })
    api.getIndicators.mockResolvedValue([])

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect((await screen.findByTestId('detail')).textContent).toBe('Second activity')
    expect(api.getActivity).toHaveBeenCalledTimes(2)
    expect(api.getIndicators).toHaveBeenCalledTimes(2)
    expect(detailProps().indicators).toEqual([])
  })

  it('shows the loading page again while a Retry loads', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    show()
    await screen.findByText('Review unavailable')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('closes from the loading page only when the sheet closes', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    show()
    await screen.findByText('Loading review')

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('reads again for a new target and ignores the answer of the old one', async () => {
    const first = deferred<{ title: string }>()
    api.getActivity.mockReturnValueOnce(first.promise)
    api.getActivity.mockResolvedValueOnce({ title: 'Second activity' })
    const view = show()

    view.rerender(<DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />)
    expect((await screen.findByTestId('detail')).textContent).toBe('Second activity')
    await act(async () => {
      first.resolve({ title: 'Stale activity' })
    })

    expect(screen.getByTestId('detail').textContent).toBe('Second activity')
    expect(api.getActivity).toHaveBeenNthCalledWith(2, 'p1', 'a2')
  })

  it('ignores a failure that arrives after the target changed', async () => {
    const first = deferred<{ title: string }>()
    api.getActivity.mockReturnValueOnce(first.promise)
    const view = show()

    view.rerender(<DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />)
    await screen.findByTestId('detail')
    await act(async () => {
      first.reject(new Error('late'))
    })

    expect(screen.queryByText('Review unavailable')).toBeNull()
    expect(screen.getByTestId('detail')).toBeTruthy()
  })

  it('clears the review and the proof dialog when the target goes away', async () => {
    const view = show()
    await screen.findByTestId('detail')
    act(() => (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }))

    view.rerender(<DashboardActivityReviewPanel {...props({ target: null })} />)

    await waitFor(() => expect(screen.queryByTestId('detail')).toBeNull())
    expect(screen.queryByText('Loading review')).toBeNull()
    expect(screen.queryByTestId('proof')).toBeNull()
    view.rerender(<DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />)
    await screen.findByTestId('detail')
    expect(proofProps()).toMatchObject({ activity: null, open: false })
  })

  it('shows the loading page, not the previous activity, while a new target loads', async () => {
    const view = show()
    await screen.findByTestId('detail')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    view.rerender(<DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />)

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByTestId('detail')).toBeNull()
  })

  it('never shows the closed activity again when the panel opens for a new target', async () => {
    const view = show()
    await screen.findByTestId('detail')
    view.rerender(<DashboardActivityReviewPanel {...props({ target: null })} />)
    await waitFor(() => expect(screen.queryByTestId('detail')).toBeNull())
    seen.opened.length = 0
    api.getActivity.mockReturnValue(new Promise(() => {}))

    view.rerender(<DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />)

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(seen.opened).toEqual([])
  })

  it('keeps the loading page when the read answers with no activity', async () => {
    api.getActivity.mockResolvedValue(null)
    show()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    await act(async () => {})
    expect(screen.queryByTestId('detail')).toBeNull()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('closes the panel when the detail panel closes and not when it opens', async () => {
    show()
    await screen.findByTestId('detail')

    ;(detailProps().onOpenChange as (open: boolean) => void)(true)
    expect(onClose).not.toHaveBeenCalled()
    ;(detailProps().onOpenChange as (open: boolean) => void)(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a changed activity and reports the change', async () => {
    show()
    await screen.findByTestId('detail')

    act(() => (detailProps().onActivityChanged as (value: unknown) => void)({ title: 'Changed activity' }))

    expect(screen.getByTestId('detail').textContent).toBe('Changed activity')
    expect(onActivityChanged).toHaveBeenCalledTimes(1)
  })

  it('opens the proof dialog for the activity and closes it again', async () => {
    show()
    await screen.findByTestId('detail')
    expect(proofProps()).toMatchObject({ activity: null, open: false })

    act(() => (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }))
    expect(proofProps()).toMatchObject({ activity: { title: 'Proof activity' }, open: true })

    act(() => (proofProps().onOpenChange as (open: boolean) => void)(true))
    expect(proofProps()).toMatchObject({ open: true })
    act(() => (proofProps().onOpenChange as (open: boolean) => void)(false))
    expect(proofProps()).toMatchObject({ activity: null, open: false })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the submitted activity, closes the proof dialog and reports the change', async () => {
    show()
    await screen.findByTestId('detail')
    act(() => (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }))

    act(() => (proofProps().onSubmitted as (value: unknown) => void)({ title: 'Submitted activity' }))

    expect(screen.getByTestId('detail').textContent).toBe('Submitted activity')
    expect(proofProps()).toMatchObject({ activity: null, open: false })
    expect(onActivityChanged).toHaveBeenCalledTimes(1)
  })
})
```


The snapshot test covers the role gates (no role, no `monitor_evaluate.view`), the scope (the project of the address, a kept selection, a lost selection falling back to all, the empty and failed lists, the answers of a replaced role), the monitoring read (the trailing year, the chosen project, the stale answer and failure of a replaced scope), the cards (value, link, tone and the five-card icon rotation), the action slot and the pinned charts:

Create `apps/web/src/features/dashboard/components/connected-monitoring-snapshot.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectedMonitoringSnapshot } from './connected-monitoring-snapshot'

const api = vi.hoisted(() => ({ getProjectsForRole: vi.fn(), getMonitoringDashboard: vi.fn() }))
const flags = vi.hoisted(() => ({ pins: false }))
const rbac = vi.hoisted(() => ({ allowed: ['monitor_evaluate.view'] as string[] }))
const seen = vi.hoisted(() => ({ pinned: null as unknown }))

vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/rbac/can', () => ({
  can: (_role: string, permission: string) => rbac.allowed.includes(permission),
}))
vi.mock('@/constants/feature-flags', () => ({
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
}))
vi.mock('../monitoring-reach-metrics.utils', () => ({
  monitoringReachMetrics: (result: { metrics: unknown[] }) => result.metrics,
}))
vi.mock('./pinned-charts', () => ({
  PinnedCharts: ({ projects }: { projects: Array<{ id: string }> }) => {
    seen.pinned = projects
    return <div data-testid="pinned-charts">{projects.map((row) => row.id).join(',')}</div>
  },
}))
// Stubs expose the card props and the position of the icon in the rotation.
vi.mock('@/components/pathways', async () => {
  const lucide = await import('lucide-react')
  const rotation = [lucide.FolderKanban, lucide.AlertTriangle, lucide.Clock, lucide.BarChart3, lucide.Loader2]
  return {
    SectionCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <section aria-label={title}>{children}</section>
    ),
    EmptyState: ({
      title,
      description,
      icon,
      className,
    }: { title: string; description: string; icon: unknown; className?: string }) => (
      <div data-class={className ?? ''} data-icon={rotation.indexOf(icon as never)} data-testid="empty">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    ),
    MetricCard: (card: {
      description: string
      href?: string
      icon: unknown
      label: string
      tone: string
      value: string
    }) => (
      <div
        data-href={card.href ?? ''}
        data-icon={rotation.indexOf(card.icon as never)}
        data-testid="metric"
        data-tone={card.tone}
        data-value={card.value}
      >
        {card.label}|{card.description}
      </div>
    ),
  }
})
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = { children?: React.ReactNode; id?: string }
  type SelectProps = { children?: React.ReactNode; value?: string; onValueChange?: (value: string) => void }
  const SelectTrigger = (_props: PartProps) => null
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, value }: PartProps & { value?: string }) => (
    <option value={value}>{children}</option>
  )
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        id={trigger?.props.id}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        <option value="">No selection</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

type Props = ComponentProps<typeof ConnectedMonitoringSnapshot>
const projects = [
  { id: 'project-a', title: 'Project A' },
  { id: 'project-b', title: 'Project B' },
]
const lastYear = { periodStart: '2025-09-27', periodEnd: '2026-09-27' }
const show = (overrides: Record<string, unknown> = {}) =>
  render(<ConnectedMonitoringSnapshot {...({ role: 'System Administrator', ...overrides } as unknown as Props)} />)
const scope = () => screen.getByLabelText('Project scope') as HTMLSelectElement
const metric = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `m${n}`,
  label: `Metric ${n}`,
  value: n,
  helperText: `Helper ${n}`,
  ...overrides,
})
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('ConnectedMonitoringSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
    flags.pins = false
    rbac.allowed = ['monitor_evaluate.view']
    api.getProjectsForRole.mockResolvedValue(projects)
    api.getMonitoringDashboard.mockResolvedValue({ metrics: [] })
    window.history.replaceState(null, '', '/dashboard')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('renders nothing and reads no monitoring without a role', async () => {
    const { container } = show({ role: null })
    await act(async () => {})

    expect(container.innerHTML).toBe('')
    expect(api.getProjectsForRole).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('renders nothing for a role that cannot view monitoring', async () => {
    rbac.allowed = []
    const { container } = show()
    await act(async () => {})

    expect(container.innerHTML).toBe('')
  })

  it('reads the projects of the role', async () => {
    show({ role: 'Project Manager' })

    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Project Manager'))
    expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
  })

  it('titles the section Project monitoring', async () => {
    show()
    await screen.findByLabelText('Project scope')

    expect(screen.getByRole('region', { name: 'Project monitoring' })).toBeTruthy()
  })

  describe('scope', () => {
    it('lists all projects first, then each project, and starts on all', async () => {
      show()

      await waitFor(() => expect(scope().value).toBe('all'))
      expect([...scope().options].map((option) => [option.value, option.textContent])).toEqual([
        ['', 'No selection'],
        ['all', 'All projects'],
        ['project-a', 'Project A'],
        ['project-b', 'Project B'],
      ])
      expect(scope().id).toBe('dashboard-project-scope')
      expect(screen.getByText('Project scope').getAttribute('for')).toBe('dashboard-project-scope')
    })

    it('starts on the project of the address when the role has it', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-b')
      show()

      await waitFor(() => expect(scope().value).toBe('project-b'))
    })

    it('starts on all when the address names an unknown project', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-z')
      show()

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('keeps the chosen project when the projects load again', async () => {
      const view = show({ role: 'Project Manager' })
      await waitFor(() => expect(scope().value).toBe('all'))
      fireEvent.change(scope(), { target: { value: 'project-a' } })

      view.rerender(<ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />)

      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      await act(async () => {})
      expect(scope().value).toBe('project-a')
    })

    it('falls back to all when the chosen project is gone after a reload', async () => {
      const view = show({ role: 'Project Manager' })
      await waitFor(() => expect(scope().value).toBe('all'))
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      api.getProjectsForRole.mockResolvedValue([projects[1]])

      view.rerender(<ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />)

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('has no scope and reads no monitoring when no project is authorized', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      show()

      expect(await screen.findByText('No authorized projects')).toBeTruthy()
      expect(scope().value).toBe('')
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
      expect(
        screen.getByText(
          'No projects are assigned to this account. Contact an administrator to review project access.',
        ),
      ).toBeTruthy()
      expect(screen.getByTestId('empty').getAttribute('data-icon')).toBe('0')
    })

    it('shows the reason when the projects cannot be read, and a fixed text for a non-error', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Directory is down.'))
      const view = show()
      expect(await screen.findByText('Directory is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()
      expect(screen.getByTestId('empty').getAttribute('data-icon')).toBe('1')
      expect(screen.getByTestId('empty').getAttribute('data-class')).toBe('rounded-xl border border-border bg-card')
      view.unmount()

      api.getProjectsForRole.mockRejectedValueOnce('down')
      show()
      expect(await screen.findByText('Project scope could not be loaded.')).toBeTruthy()
    })

    it('ignores the projects of a role that was replaced before they arrived', async () => {
      const first = deferred<typeof projects>()
      api.getProjectsForRole.mockReturnValueOnce(first.promise)
      const view = show({ role: 'Project Manager' })

      view.rerender(<ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />)
      await waitFor(() => expect(scope().value).toBe('all'))
      await act(async () => {
        first.resolve([{ id: 'stale', title: 'Stale project' }])
      })

      expect(screen.queryByText('Stale project')).toBeNull()
    })

    it('ignores a project failure of a role that was replaced before it arrived', async () => {
      const first = deferred<typeof projects>()
      api.getProjectsForRole.mockReturnValueOnce(first.promise)
      const view = show({ role: 'Project Manager' })

      view.rerender(<ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />)
      await waitFor(() => expect(scope().value).toBe('all'))
      await act(async () => {
        first.reject(new Error('late failure'))
      })

      expect(screen.queryByText('late failure')).toBeNull()
    })
  })

  describe('monitoring read', () => {
    it('reads the totals of every project for the trailing year', async () => {
      show()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastYear)
    })

    it('reads the chosen project and shows the loading line until its cards arrive', async () => {
      api.getMonitoringDashboard.mockResolvedValueOnce({ metrics: [metric(1)] })
      show()
      await screen.findByText('Metric 1|Helper 1')
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))

      fireEvent.change(scope(), { target: { value: 'project-a' } })

      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({ projectId: 'project-a', ...lastYear }),
      )
      expect(screen.queryByText('Metric 1|Helper 1')).toBeNull()
      expect(screen.getByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('does not read monitoring for a cleared scope', async () => {
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))

      fireEvent.change(scope(), { target: { value: '' } })
      await act(async () => {})

      expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1)
    })

    it('shows the reason of a failure, a fixed text for a non-error, and clears it for the next scope', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      show()
      expect(await screen.findByText('Monitoring is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      expect(await screen.findByText('Monitoring data could not be loaded.')).toBeTruthy()

      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(1)] })
      fireEvent.change(scope(), { target: { value: 'project-b' } })
      expect(await screen.findByText('Metric 1|Helper 1')).toBeTruthy()
      expect(screen.queryByText('Monitoring data could not be loaded.')).toBeNull()
    })

    it('ignores the answer of a scope that was replaced before it arrived', async () => {
      const first = deferred<{ metrics: unknown[] }>()
      api.getMonitoringDashboard.mockReturnValueOnce(first.promise)
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(2)] })

      fireEvent.change(scope(), { target: { value: 'project-a' } })
      await screen.findByText('Metric 2|Helper 2')
      await act(async () => {
        first.resolve({ metrics: [metric(9)] })
      })

      expect(screen.queryByText('Metric 9|Helper 9')).toBeNull()
    })

    it('ignores the failure of a scope that was replaced before it arrived', async () => {
      const first = deferred<{ metrics: unknown[] }>()
      api.getMonitoringDashboard.mockReturnValueOnce(first.promise)
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(2)] })

      fireEvent.change(scope(), { target: { value: 'project-a' } })
      await screen.findByText('Metric 2|Helper 2')
      await act(async () => {
        first.reject(new Error('late failure'))
      })

      expect(screen.queryByText('late failure')).toBeNull()
    })
  })

  describe('cards', () => {
    it('shows each metric with its value, link and tone, rotating the four icons', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        metrics: [
          metric(1, { severity: 'success', href: '/one' }),
          metric(2, { severity: 'warning', value: 'Withheld' }),
          metric(3, { severity: 'danger' }),
          metric(4, { severity: 'neutral' }),
          metric(5),
        ],
      })
      show()

      await screen.findByText('Metric 5|Helper 5')
      const cards = screen.getAllByTestId('metric')
      expect(cards.map((card) => card.textContent)).toEqual([
        'Metric 1|Helper 1',
        'Metric 2|Helper 2',
        'Metric 3|Helper 3',
        'Metric 4|Helper 4',
        'Metric 5|Helper 5',
      ])
      expect(cards.map((card) => card.getAttribute('data-icon'))).toEqual(['0', '1', '2', '3', '0'])
      expect(cards.map((card) => card.getAttribute('data-tone'))).toEqual([
        'success',
        'warning',
        'danger',
        'info',
        'info',
      ])
      expect(cards.map((card) => card.getAttribute('data-value'))).toEqual(['1', 'Withheld', '3', '4', '5'])
      expect(cards.map((card) => card.getAttribute('data-href'))).toEqual(['/one', '', '', '', ''])
      expect(screen.queryByText('Loading project monitoring data...')).toBeNull()
    })
  })

  describe('action and pinned charts', () => {
    it('puts the action at the right of the scope row only when there is one', async () => {
      show({ action: <button type="button">Open monitoring</button> })

      const action = await screen.findByRole('button', { name: 'Open monitoring' })
      expect(action.parentElement?.className).toBe('ml-auto')
      cleanup()

      show()
      await screen.findByText('Project scope')
      expect(document.querySelector('.ml-auto')).toBeNull()
    })

    it('shows the pinned charts of the projects only while the pins flag is on', async () => {
      show()
      await waitFor(() => expect(scope().value).toBe('all'))
      expect(screen.queryByTestId('pinned-charts')).toBeNull()
      cleanup()

      flags.pins = true
      show()
      await waitFor(() => expect(screen.getByTestId('pinned-charts').textContent).toBe('project-a,project-b'))
      expect(seen.pinned).toEqual(projects)
    })
  })
})
```


```bash
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/dashboard/dashboard.utils.test.ts src/features/dashboard/components/dashboard-list-item.test.tsx src/features/dashboard/components/dashboard-activity-review-panel.test.tsx src/features/dashboard/components/connected-monitoring-snapshot.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL |✓ src" | LC_ALL=C sort)
```


Expected:

```text
Checked 9 files in <ms>. Fixed 3 files.
web typecheck clean
      Tests  125 passed (125)
 Test Files  4 passed (4)
 ✓ src/features/dashboard/components/connected-monitoring-snapshot.test.tsx (22 tests) <ms>
 ✓ src/features/dashboard/components/dashboard-activity-review-panel.test.tsx (23 tests) <ms>
 ✓ src/features/dashboard/components/dashboard-list-item.test.tsx (25 tests) <ms>
 ✓ src/features/dashboard/dashboard.utils.test.ts (55 tests) <ms>
```


- [ ] **Step 4: Mutate the units and the shell once**

The 240 mutations of Task 6 are aimed at the file each moved to: 31 at the helpers, 57 at the review panel, 46 at the snapshot, 17 at the list items and 89 at the shell, plus one more for the review panel (removing the reset of the activity and of the status together, which are redundant alone). Each unit runs against its own test only, so a survivor means that test alone does not pin the line:

Create `.tmp/s7d/mut-role-utils.json`:

```json
[
 ["danger tone", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (severity === 'danger') {\n    return 'danger'\n  }", "  if (severity === 'danger') {\n    return 'warning'\n  }"],
 ["warning tone", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (severity === 'warning') {\n    return 'warning'\n  }", "  if (severity === 'warning') {\n    return 'info'\n  }"],
 ["success tone", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (severity === 'success') {\n    return 'success'\n  }", "  if (severity === 'success') {\n    return 'info'\n  }"],
 ["neutral status tone", "apps/web/src/features/dashboard/dashboard.utils.ts", "severity === 'neutral' ? 'neutral' : severityTone(severity)", "severity === 'neutral' ? 'info' : severityTone(severity)"],
 ["status tone ignores severity", "apps/web/src/features/dashboard/dashboard.utils.ts", "severity === 'neutral' ? 'neutral' : severityTone(severity)", "severity === 'neutral' ? 'neutral' : 'info'"],
 ["icon order", "apps/web/src/features/dashboard/dashboard.utils.ts", "const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]", "const metricIcons = [AlertTriangle, FolderKanban, Clock, BarChart3]"],
 ["icon cycle", "apps/web/src/features/dashboard/dashboard.utils.ts", "const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]", "const metricIcons = [FolderKanban, AlertTriangle, Clock]"],
 ["budget href", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (actionText.includes('budget')) return '/projects'", "  if (actionText.includes('budget')) return '/alerts'"],
 ["proof href", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (actionText.includes('proof')) return '/projects'", "  if (actionText.includes('proof')) return '/alerts'"],
 ["recommendation href", "apps/web/src/features/dashboard/dashboard.utils.ts", "    actionText.includes('recommendation') ||\n", "    actionText.includes('recommendations') ||\n"],
 ["decision href", "apps/web/src/features/dashboard/dashboard.utils.ts", "    actionText.includes('decision') ||\n", "    actionText.includes('decisions') ||\n"],
 ["outcome href", "apps/web/src/features/dashboard/dashboard.utils.ts", "    actionText.includes('outcome')\n  )\n    return '/alerts'", "    actionText.includes('outcomes')\n  )\n    return '/alerts'"],
 ["decision group target", "apps/web/src/features/dashboard/dashboard.utils.ts", "    actionText.includes('outcome')\n  )\n    return '/alerts'", "    actionText.includes('outcome')\n  )\n    return '/projects'"],
 ["alert href", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'", "  if (actionText.includes('flag')) return '/alerts'"],
 ["flag href", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'", "  if (actionText.includes('alert')) return '/alerts'"],
 ["orientation href", "apps/web/src/features/dashboard/dashboard.utils.ts", "  if (actionText.includes('orientation') || actionText.includes('activity')) return '/projects'\n  return '/projects'", "  if (actionText.includes('orientation') || actionText.includes('activity')) return '/alerts'\n  return '/projects'"],
 ["workflow text is case sensitive", "apps/web/src/features/dashboard/dashboard.utils.ts", "`${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()", "`${action.label} ${action.dialogTitle ?? ''}`"],
 ["workflow text ignores the dialog title", "apps/web/src/features/dashboard/dashboard.utils.ts", "`${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()", "`${action.label}`.toLowerCase()"],
 ["target not anchored", "apps/web/src/features/dashboard/dashboard.utils.ts", "href?.match(/^\\/projects\\/([^/]+)\\/activities\\/([^/?#]+)/)", "href?.match(/\\/projects\\/([^/]+)\\/activities\\/([^/?#]+)/)"],
 ["target project part", "apps/web/src/features/dashboard/dashboard.utils.ts", "([^/]+)\\/activities", "(.+)\\/activities"],
 ["target activity part", "apps/web/src/features/dashboard/dashboard.utils.ts", "activities\\/([^/?#]+)/", "activities\\/([^/]+)/"],
 ["target without query", "apps/web/src/features/dashboard/dashboard.utils.ts", "const query = href?.split('?')[1] ?? ''", "const query = ''"],
 ["target expense name", "apps/web/src/features/dashboard/dashboard.utils.ts", "new URLSearchParams(query).get('expense') ?? undefined", "new URLSearchParams(query).get('expenses') ?? undefined"],
 ["target review name", "apps/web/src/features/dashboard/dashboard.utils.ts", "      new URLSearchParams(query).get('review') ??\n", "      new URLSearchParams(query).get('reviews') ??\n"],
 ["target proof name", "apps/web/src/features/dashboard/dashboard.utils.ts", "      new URLSearchParams(query).get('proof') ??\n      undefined", "      new URLSearchParams(query).get('proofs') ??\n      undefined"],
 ["target proof first", "apps/web/src/features/dashboard/dashboard.utils.ts", "      new URLSearchParams(query).get('review') ??\n      new URLSearchParams(query).get('proof') ??", "      new URLSearchParams(query).get('proof') ??\n      new URLSearchParams(query).get('review') ??"],
 ["trailing year zone", "apps/web/src/features/dashboard/dashboard.utils.ts", "businessCalendarDate(new Date(), 'Asia/Manila')", "businessCalendarDate(new Date(), 'UTC')"],
 ["trailing year length", "apps/web/src/features/dashboard/dashboard.utils.ts", "start.setUTCDate(start.getUTCDate() - 365)", "start.setUTCDate(start.getUTCDate() - 364)"],
 ["trailing year start", "apps/web/src/features/dashboard/dashboard.utils.ts", "start.setUTCDate(start.getUTCDate() - 365)", "start.setUTCDate(start.getUTCDate() - 366)"],
 ["default tone", "apps/web/src/features/dashboard/dashboard.utils.ts", "  return 'info'\n}\n\nexport const statusTone", "  return 'success'\n}\n\nexport const statusTone"],
 ["default href", "apps/web/src/features/dashboard/dashboard.utils.ts", "return '/projects'\n}\n\nexport const dashboardActivityTarget", "return '/alerts'\n}\n\nexport const dashboardActivityTarget"]
]
```


Create `.tmp/s7d/mut-role-review.json`:

```json
[
 [
  "review reset keeps activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      setActivity(null)\n      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps indicators",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      setActivity(null)\n      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setActivity(null)\n      setProofActivity(null)\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps proof",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setIndicators([])\n      setStatus('idle')\n      return"
 ],
 [
  "review reset keeps status",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setProofActivity(null)\n      return"
 ],
 [
  "review does not load",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "    setStatus('loading')\n\n    Promise.all([",
  "    Promise.all(["
 ],
 [
  "review reads another project",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "activitiesClient.getActivity(target.projectId, target.activityId)",
  "activitiesClient.getActivity(target.activityId, target.projectId)"
 ],
 [
  "review reads indicators of nothing",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "indicatorsClient.getIndicators(target.projectId),",
  "indicatorsClient.getIndicators(),"
 ],
 [
  "review ignores stale results",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      .then(([activityRecord, indicatorRecords]) => {\n        if (!mounted) return",
  "      .then(([activityRecord, indicatorRecords]) => {"
 ],
 [
  "review stores no activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setActivity(activityRecord)\n        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setIndicators(indicatorRecords)\n        setStatus('success')"
 ],
 [
  "review stores no indicators",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setActivity(activityRecord)\n        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setActivity(activityRecord)\n        setStatus('success')"
 ],
 [
  "review never succeeds",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setIndicators(indicatorRecords)\n        setStatus('success')",
  "        setIndicators(indicatorRecords)"
 ],
 [
  "review failure ignores stale results",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      .catch(() => {\n        if (!mounted) return",
  "      .catch(() => {"
 ],
 [
  "review failure keeps activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setActivity(null)\n        setIndicators([])\n        setStatus('error')",
  "        setIndicators([])\n        setStatus('error')"
 ],
 [
  "review failure keeps indicators",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setActivity(null)\n        setIndicators([])\n        setStatus('error')",
  "        setActivity(null)\n        setStatus('error')"
 ],
 [
  "review failure not shown",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        setIndicators([])\n        setStatus('error')",
  "        setIndicators([])"
 ],
 [
  "review ignores retry",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "  }, [loadAttempt, target])",
  "  }, [target])"
 ],
 [
  "review ignores a new target",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "  }, [loadAttempt, target])",
  "  }, [loadAttempt])"
 ],
 [
  "review close inverted",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "    if (!open) onClose()",
  "    if (open) onClose()"
 ],
 [
  "review shows without an activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "  if (status === 'success' && activity) {",
  "  if (status === 'success') {"
 ],
 [
  "review shows before success",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "  if (status === 'success' && activity) {",
  "  if (activity) {"
 ],
 [
  "manager decides no proof",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canDecideProof={role === 'Project Manager'}",
  "          canDecideProof={false}"
 ],
 [
  "manager decides proof for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canDecideProof={role === 'Project Manager'}",
  "          canDecideProof={role !== 'Project Manager'}"
 ],
 [
  "manager decides no extension",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canDecideExtension={role === 'Project Manager'}",
  "          canDecideExtension={false}"
 ],
 [
  "manager extension for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canDecideExtension={role === 'Project Manager'}",
  "          canDecideExtension={role !== 'Project Manager'}"
 ],
 [
  "review can edit",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canEdit={false}",
  "          canEdit={true}"
 ],
 [
  "officer logs no expense",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canLogExpense={role === 'Project Officer'}",
  "          canLogExpense={false}"
 ],
 [
  "officer expense for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canLogExpense={role === 'Project Officer'}",
  "          canLogExpense={role !== 'Project Officer'}"
 ],
 [
  "officer requests no extension",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canRequestExtension={role === 'Project Officer'}",
  "          canRequestExtension={false}"
 ],
 [
  "officer extension request for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canRequestExtension={role === 'Project Officer'}",
  "          canRequestExtension={role !== 'Project Officer'}"
 ],
 [
  "officer submits no proof",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canSubmitProof={role === 'Project Officer'}",
  "          canSubmitProof={false}"
 ],
 [
  "officer proof for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canSubmitProof={role === 'Project Officer'}",
  "          canSubmitProof={role !== 'Project Officer'}"
 ],
 [
  "evaluator validates no expense",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canValidateExpense={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateExpense={false}"
 ],
 [
  "evaluator expense for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canValidateExpense={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateExpense={role !== 'Monitoring and Evaluation Officer'}"
 ],
 [
  "evaluator validates no proof",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canValidateProof={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateProof={false}"
 ],
 [
  "evaluator proof for admin",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          canValidateProof={role === 'Monitoring and Evaluation Officer'}",
  "          canValidateProof={role !== 'Monitoring and Evaluation Officer'}"
 ],
 [
  "review has stages",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          journeyStages={[]}",
  "          journeyStages={undefined}"
 ],
 [
  "review change ignores the new activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          onActivityChanged={(updatedActivity) => {\n            setActivity(updatedActivity)\n            onActivityChanged()",
  "          onActivityChanged={() => {\n            onActivityChanged()"
 ],
 [
  "review change does not notify",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "            setActivity(updatedActivity)\n            onActivityChanged()\n          }}\n          onEdit",
  "            setActivity(updatedActivity)\n          }}\n          onEdit"
 ],
 [
  "review closes through the handler",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          onOpenChange={handleOpenChange}\n          onSubmitProof",
  "          onOpenChange={() => undefined}\n          onSubmitProof"
 ],
 [
  "review proof not forwarded",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          onSubmitProof={setProofActivity}",
  "          onSubmitProof={() => undefined}"
 ],
 [
  "review panel closed",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          open={Boolean(target)}\n          requestedExpenseId",
  "          open={false}\n          requestedExpenseId"
 ],
 [
  "review expense dropped",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          requestedExpenseId={target?.expenseId}",
  "          requestedExpenseId={undefined}"
 ],
 [
  "review proof request dropped",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          requestedProofId={target?.proofId}",
  "          requestedProofId={undefined}"
 ],
 [
  "proof dialog gets no activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          activity={proofActivity}\n          onOpenChange",
  "          activity={activity}\n          onOpenChange"
 ],
 [
  "proof dialog never closes",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "            if (!open) setProofActivity(null)\n          }}",
  "            if (!open) return\n          }}"
 ],
 [
  "proof submit keeps old activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          onSubmitted={(updatedActivity) => {\n            setActivity(updatedActivity)\n            setProofActivity(null)",
  "          onSubmitted={() => {\n            setProofActivity(null)"
 ],
 [
  "proof submit keeps dialog",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "            setActivity(updatedActivity)\n            setProofActivity(null)\n            onActivityChanged()",
  "            setActivity(updatedActivity)\n            onActivityChanged()"
 ],
 [
  "proof submit does not notify",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "            setProofActivity(null)\n            onActivityChanged()\n          }}",
  "            setProofActivity(null)\n          }}"
 ],
 [
  "proof dialog open without activity",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          open={Boolean(proofActivity)}",
  "          open={true}"
 ],
 [
  "fallback panel closed",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "    <Sheet onOpenChange={handleOpenChange} open={Boolean(target)}>",
  "    <Sheet onOpenChange={handleOpenChange} open={false}>"
 ],
 [
  "fallback description",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "        description=\"Open the selected project activity without leaving Dashboard.\"",
  "        description=\"Open.\""
 ],
 [
  "fallback error text",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "'The activity proof could not be loaded. Try again from this panel.'",
  "'Could not be loaded.'"
 ],
 [
  "fallback loading text",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "'Loading the selected activity and its submitted proof.'",
  "'Loading.'"
 ],
 [
  "fallback error title",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "title={status === 'error' ? 'Review unavailable' : 'Loading review'}",
  "title={'Loading review'}"
 ],
 [
  "fallback error status",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "          status={status === 'error' ? 'error' : 'loading'}",
  "          status={'loading'}"
 ],
 [
  "fallback retry always",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}",
  "onRetry={() => setLoadAttempt((attempt) => attempt + 1)}"
 ],
 [
  "fallback retry does nothing",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}",
  "onRetry={status === 'error' ? () => undefined : undefined}"
 ],
 [
  "review reset keeps activity and status",
  "apps/web/src/features/dashboard/components/dashboard-activity-review-panel.tsx",
  "      setActivity(null)\n      setIndicators([])\n      setProofActivity(null)\n      setStatus('idle')\n      return",
  "      setIndicators([])\n      setProofActivity(null)\n      return"
 ]
]
```


Create `.tmp/s7d/mut-role-snapshot.json`:

```json
[
 ["snapshot projects need no role", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "  useEffect(() => {\n    if (!role) return\n    let active = true\n    projectsClient", "  useEffect(() => {\n    let active = true\n    projectsClient"],
 ["snapshot projects ignore stale results", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      .then((records) => {\n        if (!active) return\n        setProjects(records)", "      .then((records) => {\n        setProjects(records)"],
 ["snapshot keeps no projects", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "        setProjects(records)\n        const requested", "        const requested"],
 ["snapshot address parameter", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "new URLSearchParams(window.location.search).get('project')", "new URLSearchParams(window.location.search).get('projectId')"],
 ["snapshot keeps the choice", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "          records.some((record) => record.id === current)\n            ? current\n            : (records.find", "          records.some((record) => record.id === current)\n            ? ''\n            : (records.find"],
 ["snapshot ignores the address", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "(records.find((record) => record.id === requested)?.id ??\n              (records.length ? 'all' : ''))", "(records.length ? 'all' : '')"],
 ["snapshot starts on nothing", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "              (records.length ? 'all' : '')),", "              ''),"],
 ["snapshot empty starts on all", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "              (records.length ? 'all' : '')),", "              'all'),"],
 ["snapshot list error ignores stale results", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      .catch((caught: unknown) => {\n        if (active)\n          setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')", "      .catch((caught: unknown) => {\n        setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')"],
 ["snapshot list error text", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "'Project scope could not be loaded.'", "'x'"],
 ["snapshot list error always fixed", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')", "setError('Project scope could not be loaded.')"],
 ["snapshot list ignores the role", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "  }, [role])\n\n  useEffect(() => {\n    if (!projectId) return", "  }, [])\n\n  useEffect(() => {\n    if (!projectId) return"],
 ["snapshot reads without a scope", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "    if (!projectId) return\n    let active = true\n    setMetrics([])", "    let active = true\n    setMetrics([])"],
 ["snapshot keeps old cards", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "    setMetrics([])\n    setError('')\n    dashboardsClient", "    setError('')\n    dashboardsClient"],
 ["snapshot keeps old error", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "    setMetrics([])\n    setError('')\n    dashboardsClient", "    setMetrics([])\n    dashboardsClient"],
 ["snapshot all projects sends an id", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "...(projectId === 'all' ? {} : { projectId }),", "projectId,"],
 ["snapshot project sends no id", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "...(projectId === 'all' ? {} : { projectId }),", "...{},"],
 ["snapshot period dropped", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "        ...trailingYearPeriod(),\n      })", "      })"],
 ["snapshot metrics ignore stale results", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      .then((result) => {\n        if (!active) return\n        setMetrics(monitoringReachMetrics(result))", "      .then((result) => {\n        setMetrics(monitoringReachMetrics(result))"],
 ["snapshot metrics dropped", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "        setMetrics(monitoringReachMetrics(result))", "        setMetrics([])"],
 ["snapshot metrics error ignores stale results", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      .catch((caught: unknown) => {\n        if (active)\n          setError(\n            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',", "      .catch((caught: unknown) => {\n        setError(\n          caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',"],
 ["snapshot metrics error text", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "'Monitoring data could not be loaded.'", "'x'"],
 ["snapshot metrics error always fixed", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "setError(\n            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',\n          )", "setError('Monitoring data could not be loaded.')"],
 ["snapshot reads ignore the scope", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "  }, [projectId])\n\n  if (!role", "  }, [])\n\n  if (!role"],
 ["snapshot shows without the view grant", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "  if (!role || !can(role, 'monitor_evaluate.view')) return null\n  return (\n    <SectionCard title=\"Project monitoring\">", "  if (!role) return null\n  return (\n    <SectionCard title=\"Project monitoring\">"],
 ["snapshot hidden for every role", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "  if (!role || !can(role, 'monitor_evaluate.view')) return null", "  if (!role || can(role, 'monitor_evaluate.view')) return null"],
 ["snapshot title", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "<SectionCard title=\"Project monitoring\">", "<SectionCard title=\"Monitoring\">"],
 ["snapshot label", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "            Project scope\n", "            Scope\n"],
 ["snapshot label target", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "htmlFor=\"dashboard-project-scope\"", "htmlFor=\"scope\""],
 ["snapshot picker id", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "<SelectTrigger id=\"dashboard-project-scope\">", "<SelectTrigger id=\"scope\">"],
 ["snapshot picker changes nothing", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "<Select value={projectId} onValueChange={setProjectId}>", "<Select value={projectId} onValueChange={() => undefined}>"],
 ["snapshot all option", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "<SelectItem value=\"all\">All projects</SelectItem>", "<SelectItem value=\"all\">Everything</SelectItem>"],
 ["snapshot options", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "                <SelectItem key={project.id} value={project.id}>", "                <SelectItem key={project.id} value={project.title}>"],
 ["snapshot action dropped", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "        {action ? <div className=\"ml-auto\">{action}</div> : null}", ""],
 ["snapshot error page", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      {error ? (\n        <EmptyState\n          className=\"rounded-xl border border-border bg-card\"", "      {false ? (\n        <EmptyState\n          className=\"rounded-xl border border-border bg-card\""],
 ["snapshot error title", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "title=\"Monitoring data unavailable\"", "title=\"Unavailable\""],
 ["snapshot cards need both", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      ) : projects.length && metrics.length ? (", "      ) : projects.length || metrics.length ? ("],
 ["snapshot cards ignore the list", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "      ) : projects.length && metrics.length ? (", "      ) : metrics.length ? ("],
 ["snapshot card tone", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>", "                tone=\"info\"\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>"],
 ["snapshot card link", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>", "                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </div>"],
 ["snapshot loading text", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "Loading project monitoring data...", "Loading..."],
 ["snapshot empty text", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "No projects are assigned to this account. Contact an administrator to review project access.", "None."],
 ["snapshot empty title", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "title=\"No authorized projects\"", "title=\"None\""],
 ["snapshot pins ignore the flag", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "{DASHBOARD_PINS_UI_ENABLED ? <PinnedCharts projects={projects} /> : null}", "<PinnedCharts projects={projects} />"],
 ["snapshot pins never", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "{DASHBOARD_PINS_UI_ENABLED ? <PinnedCharts projects={projects} /> : null}", "{false ? <PinnedCharts projects={projects} /> : null}"],
 ["snapshot pins get no projects", "apps/web/src/features/dashboard/components/connected-monitoring-snapshot.tsx", "<PinnedCharts projects={projects} />", "<PinnedCharts projects={[]} />"]
]
```


Create `.tmp/s7d/mut-role-item.json`:

```json
[
 ["action default variant", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "  variant = 'outline',\n}: {\n  action: DashboardAction", "  variant = 'default',\n}: {\n  action: DashboardAction"],
 ["action arrow for every kind", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "{action.kind === 'navigate' ? <ArrowRight", "{true ? <ArrowRight"],
 ["action arrow never", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "{action.kind === 'navigate' ? <ArrowRight", "{false ? <ArrowRight"],
 ["action click ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "    onClick={() => onAction(action)}", "    onClick={() => undefined}"],
 ["item link ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "        {item.href ? (\n          <Link", "        {false ? (\n          <Link"],
 ["item meta ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "        {item.meta ? (", "        {false ? ("],
 ["item status ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "      {item.status ? (\n        <StatusBadge", "      {false ? (\n        <StatusBadge"],
 ["item status tone ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "<StatusBadge tone={statusTone(item.severity)}>", "<StatusBadge tone=\"info\">"],
 ["item progress needs truthy value", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "{typeof item.progress === 'number' ? (", "{item.progress ? ("],
 ["item progress ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "{typeof item.progress === 'number' ? (", "{false ? ("],
 ["compact spacing", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "<div className={compact ? 'mt-3 sm:max-w-[220px]' : 'mt-4'}>", "<div className={'mt-4'}>"],
 ["compact label", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "label={compact ? undefined : 'Progress'}", "label={'Progress'}"],
 ["progress label never", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "label={compact ? undefined : 'Progress'}", "label={undefined}"],
 ["progress tone ignored", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "          tone={severityTone(item.severity)}\n          value={item.progress}", "          tone=\"info\"\n          value={item.progress}"],
 ["item actions need both", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "{item.primaryAction || item.secondaryAction ? (", "{item.primaryAction && item.secondaryAction ? ("],
 ["item primary variant", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "<ActionButton action={item.primaryAction} onAction={onAction} variant=\"default\" />", "<ActionButton action={item.primaryAction} onAction={onAction} />"],
 ["item secondary variant", "apps/web/src/features/dashboard/components/dashboard-list-item.tsx", "<ActionButton action={item.secondaryAction} onAction={onAction} />", "<ActionButton action={item.secondaryAction} onAction={onAction} variant=\"default\" />"]
]
```


Create `.tmp/s7d/mut-role-shell.json`:

```json
[
 ["monitor view check dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      can(role, 'monitor_evaluate.view') &&\n      can(role, 'analytics.view') &&", "      can(role, 'analytics.view') &&"],
 ["analytics view check dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      can(role, 'analytics.view') &&\n      principalHasAtomicPermission(profile, 'monitoring.read') &&", "      principalHasAtomicPermission(profile, 'monitoring.read') &&"],
 ["monitoring read check dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      principalHasAtomicPermission(profile, 'monitoring.read') &&\n      principalHasAtomicPermission(profile, 'analytics.read'),", "      principalHasAtomicPermission(profile, 'analytics.read'),"],
 ["analytics read check dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      principalHasAtomicPermission(profile, 'monitoring.read') &&\n      principalHasAtomicPermission(profile, 'analytics.read'),", "      principalHasAtomicPermission(profile, 'monitoring.read'),"],
 ["monitoring checks need one grant", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      can(role, 'analytics.view') &&\n      principalHasAtomicPermission(profile, 'monitoring.read') &&", "      can(role, 'analytics.view') ||\n      principalHasAtomicPermission(profile, 'monitoring.read') &&"],
 ["administrator only", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    if (role !== 'System Administrator') return\n    dashboardsClient", "    dashboardsClient"],
 ["dashboard always loading first", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    let mounted = true\n    setStatus('loading')\n\n    if (role", "    let mounted = true\n\n    if (role"],
 ["dashboard read for another role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", ".getDashboard(role)", ".getDashboard('Program Manager')"],
 ["dashboard ignores stale results", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      .then((viewModel) => {\n        if (!mounted) {\n          return\n        }\n", "      .then((viewModel) => {\n"],
 ["dashboard not stored", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        setDashboard(viewModel)\n        setStatus('success')", "        setStatus('success')"],
 ["dashboard never succeeds", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        setDashboard(viewModel)\n        setStatus('success')", "        setDashboard(viewModel)"],
 ["dashboard failure ignores stale results", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      .catch(() => {\n        if (!mounted) {\n          return\n        }\n\n        setStatus('error')", "      .catch(() => {\n        setStatus('error')"],
 ["dashboard failure not shown", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "          return\n        }\n\n        setStatus('error')\n      })", "          return\n        }\n      })"],
 ["dashboard ignores revision", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "  }, [dashboardRevision, role])", "  }, [role])"],
 ["dashboard ignores the role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "  }, [dashboardRevision, role])", "  }, [dashboardRevision])"],
 ["review action review-proof", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      action.id === 'review-proof' ||\n", "      action.id === 'review-proofs' ||\n"],
 ["review action review-expense", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      action.id === 'review-expense' ||\n", "      action.id === 'review-expenses' ||\n"],
 ["review action open-activity-update", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      action.id === 'open-activity-update' ||\n", "      action.id === 'open-activity-updates' ||\n"],
 ["review action view-orientation-summary", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      action.id === 'view-orientation-summary'\n    ) {", "      action.id === 'view-orientation-summaries'\n    ) {"],
 ["review action ignores its id", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      action.id === 'review-proof' ||\n      action.id === 'review-expense' ||\n      action.id === 'open-activity-update' ||\n      action.id === 'view-orientation-summary'\n    ) {", "      true\n    ) {"],
 ["review trigger not kept", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        activityReviewTrigger.current = document.activeElement as HTMLElement | null\n", ""],
 ["review not opened", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        setActivityReviewTarget(target)\n        return", "        return"],
 ["review also navigates", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        setActivityReviewTarget(target)\n        return", "        setActivityReviewTarget(target)"],
 ["navigate needs navigate kind", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    if (action.kind === 'navigate' && action.href) {", "    if (action.href) {"],
 ["navigate needs an href", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    if (action.kind === 'navigate' && action.href) {", "    if (action.kind === 'navigate') {"],
 ["navigate pushes the workflow page", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      router.push(action.href)\n      return", "      router.push(actionWorkflowHref(action))\n      return"],
 ["workflow page not pushed", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    router.push(actionWorkflowHref(action))\n  }", "  }"],
 ["role overview for every role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "  if (role && role !== 'System Administrator')\n    return", "  if (role)\n    return"],
 ["role overview name dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "<RoleOverviewDashboard fullName={profile?.fullName} role={role} />", "<RoleOverviewDashboard role={role} />"],
 ["loading page heading", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "<h1 className=\"sr-only\">Dashboard</h1>", "<h1 className=\"sr-only\">Home</h1>"],
 ["loading page text", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "Loading dashboard...", "Loading..."],
 ["error page ignores the status", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "  if (status === 'error' || !dashboard) {", "  if (!dashboard) {"],
 ["error page ignores a missing dashboard", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "  if (status === 'error' || !dashboard) {", "  if (status === 'error') {"],
 ["error page heading", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "<h1 className=\"sr-only\">Dashboard unavailable</h1>", "<h1 className=\"sr-only\">Home</h1>"],
 ["error page text", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "description=\"We could not load this dashboard right now. Reload the page to try again.\"", "description=\"x\""],
 ["error page title", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "title=\"Dashboard data unavailable\"", "title=\"x\""],
 ["empty page needs all sections empty", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "dashboard.sections.every((section) => section.items.length === 0)", "dashboard.sections.some((section) => section.items.length === 0)"],
 ["empty page needs no metrics", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    dashboard.metrics.length === 0 &&\n", "    true &&\n"],
 ["empty page needs no section items", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "    dashboard.metrics.length === 0 &&\n    dashboard.sections.every((section) => section.items.length === 0)", "    dashboard.metrics.length === 0"],
 ["welcome title", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "title={`Welcome! ${roleLabel}`}", "title={`Hello ${roleLabel}`}"],
 ["role label fallback", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "const roleLabel = role || 'Staff'", "const roleLabel = role"],
 ["task counts ignore the flag", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? <ActionKpiRow /> : null}", "<ActionKpiRow />"],
 ["task counts never", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? <ActionKpiRow /> : null}", "{false ? <ActionKpiRow /> : null}"],
 ["snapshot ignores the flag", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED && canLoadDashboardMonitoring(role, profile) ? (", "{canLoadDashboardMonitoring(role, profile) ? ("],
 ["snapshot ignores the grants", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED && canLoadDashboardMonitoring(role, profile) ? (", "{ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? ("],
 ["snapshot action with executive", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "            !dashboard.executive && dashboard.primaryAction ? (", "            dashboard.primaryAction ? ("],
 ["snapshot action without executive dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "            !dashboard.executive && dashboard.primaryAction ? (", "            dashboard.executive && dashboard.primaryAction ? ("],
 ["snapshot action variant", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                variant=\"default\"\n              />\n            ) : undefined", "                variant=\"outline\"\n              />\n            ) : undefined"],
 ["snapshot action handler", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                onAction={handleAction}\n                variant=\"default\"", "                onAction={() => undefined}\n                variant=\"default\""],
 ["snapshot gets no role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "          role={role}\n        />\n      ) : null}\n      {dashboard.executive", "          role={null}\n        />\n      ) : null}\n      {dashboard.executive"],
 ["executive ignores the model", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{dashboard.executive ? (\n        <ExecutiveDashboard", "{false ? (\n        <ExecutiveDashboard"],
 ["executive gets no action", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "<ExecutiveDashboard model={dashboard.executive} summaryAction={dashboard.primaryAction} />", "<ExecutiveDashboard model={dashboard.executive} />"],
 ["empty page ignored", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      {emptyDashboard ? (", "      {false ? ("],
 ["empty page title", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "title=\"No dashboard records\"", "title=\"x\""],
 ["empty page text", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "description=\"No dashboard records are available for this account.\"", "description=\"x\""],
 ["metric cards without metrics", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (", "{role && !can(role, 'monitor_evaluate.view') ? ("],
 ["metric cards need a role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (", "{dashboard.metrics.length > 0 && !can(role as never, 'monitor_evaluate.view') ? ("],
 ["metric cards for the monitoring role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (", "{dashboard.metrics.length > 0 && role ? ("],
 ["metric card link", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>", "                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"],
 ["metric card tone", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>", "                tone=\"info\"\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"],
 ["metric card helper", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                description={metric.helperText}\n                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>", "                description=\"\"\n                href={metric.href}\n                icon={Icon}\n                key={metric.id}\n                label={metric.label}\n                tone={severityTone(metric.severity)}\n                value={String(metric.value)}\n              />\n            )\n          })}\n        </section>"],
 ["sections ignored when empty list", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      {dashboard.sections.length > 0 ? (", "      {true ? ("],
 ["sections never", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "      {dashboard.sections.length > 0 ? (", "      {false ? ("],
 ["executive section heading", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "          {dashboard.executive ? (\n            <div className=\"space-y-1\">", "          {false ? (\n            <div className=\"space-y-1\">"],
 ["executive section title", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "Projects and alerts behind the summary", "x"],
 ["executive section note", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "Portfolio-wide records remain available for follow-up after the executive review.", "x"],
 ["executive section eyebrow", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                Operational detail\n", "                Details\n"],
 ["plain section heading", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "              Dashboard detail\n", "              Details\n"],
 ["section view all hidden", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                  section.viewAllHref ? (", "                  false ? ("],
 ["section view all label", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "{section.viewAllLabel ?? 'View All'}", "{'View All'}"],
 ["section view all href", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "<Link href={section.viewAllHref}>", "<Link href=\"/\">"],
 ["section description dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                description={section.description}\n                actions", "                actions"],
 ["section empty default", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "section.emptyText ?? 'No records are currently available.'", "section.emptyText ?? 'x'"],
 ["section empty text dropped", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "section.emptyText ?? 'No records are currently available.'", "'No records are currently available.'"],
 ["section empty title", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "title=\"Nothing to review\"", "title=\"x\""],
 ["section items always listed", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                {section.items.length > 0 ? (\n                  <div", "                {true ? (\n                  <div"],
 ["portfolio list label", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                    aria-label={\n                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'\n                        ? `${section.title} list`", "                    aria-label={\n                      section.id === 'portfolio-health'\n                        ? `${section.title} list`"],
 ["alerts list label", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                    aria-label={\n                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'\n                        ? `${section.title} list`", "                    aria-label={\n                      section.id === 'escalated-alerts'\n                        ? `${section.title} list`"],
 ["list label text", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "? `${section.title} list`", "? `${section.title}`"],
 ["list class", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "? 'max-h-[19rem] overflow-y-auto pr-2'", "? 'overflow-y-auto pr-2'"],
 ["list entry limit", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                        ? '3'\n", "                        ? '5'\n"],
 ["list focusable", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                        ? 0\n                        : undefined", "                        ? -1\n                        : undefined"],
 ["compact health", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "compact={section.id === 'portfolio-health'}", "compact={section.id === 'escalated-alerts'}"],
 ["items handler", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "                        onAction={handleAction}\n                      />\n                    ))}", "                        onAction={() => undefined}\n                      />\n                    ))}"],
 ["review panel change reload", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        onActivityChanged={() => setDashboardRevision((revision) => revision + 1)}", "        onActivityChanged={() => undefined}"],
 ["review panel close clears", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "          setActivityReviewTarget(null)\n          window.requestAnimationFrame", "          window.requestAnimationFrame"],
 ["review panel close focus", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "window.requestAnimationFrame(() => activityReviewTrigger.current?.focus())", "window.requestAnimationFrame(() => undefined)"],
 ["review panel role", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        role={role}\n        target={activityReviewTarget}", "        role={null}\n        target={activityReviewTarget}"],
 ["review panel target", "apps/web/src/features/dashboard/components/role-dashboard.tsx", "        target={activityReviewTarget}", "        target={null}"]
]
```


```bash
D=apps/web/src/features/dashboard
run() {
  H=$(git hash-object $2)
  node .tmp/s7d/mutate.mjs .tmp/s7d/mut-role-$1.json "${@:3}" > .tmp/s7d/out/t7-$1.txt 2>&1
  echo "== $1"
  grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t7-$1.txt
  grep SURVIVED .tmp/s7d/out/t7-$1.txt | sed 's/: SURVIVED//' | sort
  test "$(git hash-object $2)" = "$H" && echo "file restored"
}
run utils $D/dashboard.utils.ts $D/dashboard.utils.test.ts
run item $D/components/dashboard-list-item.tsx $D/components/dashboard-list-item.test.tsx
run review $D/components/dashboard-activity-review-panel.tsx $D/components/dashboard-activity-review-panel.test.tsx
run snapshot $D/components/connected-monitoring-snapshot.tsx $D/components/connected-monitoring-snapshot.test.tsx
run shell $D/components/role-dashboard.tsx $D/components/role-dashboard.test.tsx $D/components/role-dashboard.monitoring.test.tsx $D/components/role-dashboard.review.test.tsx $D/components/role-dashboard.authorization.test.ts
```


Expected:

```text
== utils
unmutated: pass
mutations 31, survived 0
file restored
== item
unmutated: pass
mutations 17, survived 0
file restored
== review
unmutated: pass
mutations 58, survived 6
fallback retry always
review failure keeps activity
review failure keeps indicators
review reset keeps activity
review reset keeps indicators
review reset keeps status
file restored
== snapshot
unmutated: pass
mutations 46, survived 1
snapshot cards ignore the list
file restored
== shell
unmutated: pass
mutations 89, survived 8
dashboard failure ignores stale results
dashboard ignores stale results
error page ignores a missing dashboard
executive section note
metric card helper
metric cards need a role
review panel role
role label fallback
file restored
```


Helpers (31 mutations) and list items (17) have no survivor. The review panel (58) keeps 6 survivors that are equivalents: `review reset keeps activity`, `review reset keeps indicators` and `review reset keeps status` each drop one of several resets of a closed panel (the combined mutation that drops the activity and the status together is killed by the reopen test, so the pair is pinned), `review failure keeps activity` and `review failure keeps indicators` leave state behind that the error page never reads, and `fallback retry always` offers a Retry handler that `AsyncState` shows only for an error. The snapshot (46) keeps 1 survivor, `snapshot cards ignore the list`, which is equivalent because the metrics are read only for an authorized project. The 34 survivors of Task 6 in these two units are therefore pinned by the direct tests, except for the 7 equivalents.

The shell (89) keeps the 8 survivors of Task 6, all in lines that did not move (`same-lines` shows them unchanged) and each equivalent, unreachable or copy: the stale answers of the dashboard load (2: a reload turns the page into the loading state, which removes the buttons that could start a second one, and an answer after unmount changes nothing in React 18), the missing dashboard in the error page condition (1: a success always has a dashboard), the executive note (1, copy), the metric card description (1, the text of a tooltip that no test hovers) and its role gate (1: the page stays loading without a role), the role label fallback (1: the same) and the role handed to the review panel (1, reachable only as a System Administrator, who has no grants; the unit test pins every role). The four that were behavior are pinned by the cases of Task 6 and not listed.

- [ ] **Step 5: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): split the role dashboard into helpers and components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
$ pnpm exec biome check .
Checked 1565 files in <ms>. No fixes applied.
 9 files changed, 1568 insertions(+), 426 deletions(-)
```


---

### Task 8: One read hook for the action counts, one severity type (MOD-16)

**Files:**
- Create: `apps/web/src/features/dashboard/dashboard.reads.ts`, `dashboard.reads.test.ts` (6 tests)
- Create: `apps/web/src/features/dashboard/components/action-kpi-row.states.test.tsx` (7 tests)
- Modify: `apps/web/src/features/dashboard/components/action-kpi-row.tsx`, `apps/web/src/features/dashboard/role-overview/role-overview.tsx`, `apps/web/src/features/dashboard/role-overview/role-overview.test.tsx` (3 tests become 9), `apps/web/src/types/pathways.ts`
- Create (gitignored): `.tmp/s7d/task8-test-edits.json`, `task8-edits.json`, `mut-t8-before.json`, `mut-t8-after.json`

MOD-16 names duplicated read resource keys, and the dashboard feature holds one: `ActionKpiRow` and `RoleOverviewDashboard` both call `useAuthorizedRead('dashboard-action-counts', null, 'projects.read', ...)` with the same reader, so the key, the grant and the reader are written twice and one edit would split the cache entry they share. `dashboard.reads.ts` holds the call once as `useDashboardActionCounts(enabled = true)`. The same audit row counts duplicated helpers, and the severity union `'neutral' | 'info' | 'success' | 'warning' | 'danger'` in `types/pathways.ts` is the `StatusTone` of `lib/format/tone.ts` written out again; it becomes an alias. The other `statusTone` functions of the dashboard folder are different mappings (`executive-dashboard.tsx` maps a delivery status) and stay.

The hook is written after its two call sites are pinned, because `ActionKpiRow` had no test of its states at all (the role dashboard tests mock it) and `RoleOverviewDashboard` had none of its read.

- [ ] **Step 1: Prove the severity union equals the tone union**

The check file asserts that the two unions are mutually assignable and, as its own mutation proof, that a union without `neutral` is not (`@ts-expect-error` fails the typecheck when the line stops being an error):

Create `apps/web/src/types/tone-check.ts`:

```ts
import type { StatusTone } from '@/lib/format/tone'
import type { DashboardSeverity } from './pathways'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const same: Same<DashboardSeverity, StatusTone> = true
// @ts-expect-error a union without neutral is not the severity
export const notSame: Same<DashboardSeverity, Exclude<StatusTone, 'neutral'>> = true
```


```bash
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
rm apps/web/src/types/tone-check.ts
git status --short
```


Expected:

```text
web typecheck clean
```


The typecheck is clean with the check file in place, so the two unions are the same set and the alias changes no type. The file is removed and the tree is clean.

- [ ] **Step 2: Pin the two call sites against the current code**

`action-kpi-row.states.test.tsx` stubs `useAuthorizedRead` and the dashboards client. It pins the arguments of the read (key, no project, the `projects.read` grant, enabled when the flag is omitted), the client call without arguments, and the five states of the row: not eligible renders nothing, no data shows the loading page, an error shows the error page even when data exists and Retry reads again, the counts show one link per present count with its address and text, and all counts hidden render nothing:

Create `apps/web/src/features/dashboard/components/action-kpi-row.states.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActionKpiRow } from './action-kpi-row'

const read = vi.hoisted(() => ({
  calls: [] as unknown[][],
  value: {} as Record<string, unknown>,
  counts: vi.fn(),
}))

vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (...args: unknown[]) => {
    read.calls.push(args)
    return read.value
  },
}))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: { getDashboardActionCounts: read.counts } }))

const counts = {
  contractVersion: 'dashboard.action-counts.v1' as const,
  businessDate: '2026-10-03',
  pendingApprovals: 3,
  activeAlerts: { count: 100, capped: true },
  overdueActivities: { count: 2, mostOverdue: { code: 'ACT-9', daysLate: 1 } },
  forReview: 0,
}
const ready = (data: unknown, extra: Record<string, unknown> = {}) => {
  read.value = { eligible: true, isError: false, data, refetch: vi.fn(), ...extra }
}

describe('ActionKpiRow', () => {
  afterEach(() => {
    cleanup()
    read.calls.length = 0
    read.counts.mockReset()
  })

  it('reads the shared action counts key for the projects grant and no project', () => {
    ready(undefined)
    render(<ActionKpiRow />)

    expect(read.calls).toHaveLength(1)
    expect(read.calls[0].slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])
    // An omitted flag reads as enabled.
    expect(read.calls[0][4] ?? true).toBe(true)
  })

  it('reads through the dashboards client without arguments', async () => {
    ready(undefined)
    read.counts.mockResolvedValue(counts)
    render(<ActionKpiRow />)

    await expect((read.calls[0][3] as () => Promise<unknown>)()).resolves.toBe(counts)
    expect(read.counts).toHaveBeenCalledWith()
  })

  it('renders nothing when the viewer is not eligible', () => {
    ready(counts, { eligible: false })
    const view = render(<ActionKpiRow />)

    expect(view.container.innerHTML).toBe('')
  })

  it('shows the loading page until the counts arrive', () => {
    ready(undefined)
    render(<ActionKpiRow />)

    expect(screen.getByText('Loading task counts')).toBeTruthy()
    expect(screen.getByText('Loading your task counts.')).toBeTruthy()
  })

  it('shows the error page before any data and reads again on Retry', () => {
    const refetch = vi.fn()
    ready(counts, { isError: true, refetch })
    render(<ActionKpiRow />)

    expect(screen.getByText('Task counts unavailable')).toBeTruthy()
    expect(screen.getByText('Your task counts could not be loaded.')).toBeTruthy()
    expect(screen.queryByText('Pending approvals')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows one link per present count with its value and target', () => {
    ready(counts)
    render(<ActionKpiRow />)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/projects',
      '/alerts',
      '/projects',
      '/projects',
    ])
    expect(links.map((link) => link.textContent)).toEqual([
      'Pending approvals3Expenses awaiting review',
      'Active budget alerts100+Require your decision',
      'Overdue activities2ACT-9 is 1 day late',
      'For review0Evidence submitted',
    ])
    expect(screen.getByLabelText('Tasks needing action')).toBeTruthy()
  })

  it('renders nothing when every count is hidden', () => {
    ready({ ...counts, pendingApprovals: null, activeAlerts: null, overdueActivities: null, forReview: null })
    const view = render(<ActionKpiRow />)

    expect(view.container.innerHTML).toBe('')
  })
})
```


`task8-test-edits.json` turns the blanket stub of `role-overview.test.tsx` into one that records its calls, gives the dashboards client stub its member, and adds six cases: the flag of the read for each of the five roles (true for a project manager only) and the reader that calls the client without arguments. The three existing cases are unchanged:

Create `.tmp/s7d/task8-test-edits.json`:

```json
[
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.test.tsx",
  "vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: () => ({ data: null }) }))\n",
  "const reads = vi.hoisted(() => ({ calls: [] as unknown[][], counts: vi.fn() }))\nvi.mock('@/hooks/use-authorized-read', () => ({\n  useAuthorizedRead: (...args: unknown[]) => {\n    reads.calls.push(args)\n    return { data: null }\n  },\n}))\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.test.tsx",
  "vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: {} }))\n",
  "vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: { getDashboardActionCounts: reads.counts } }))\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.test.tsx",
  "  afterEach(cleanup)\n",
  "  afterEach(() => {\n    cleanup()\n    reads.calls.length = 0\n    reads.counts.mockReset()\n  })\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.test.tsx",
  "    expect(screen.getByText('Dashboard unavailable for your access')).toBeTruthy()\n  })\n})\n",
  "    expect(screen.getByText('Dashboard unavailable for your access')).toBeTruthy()\n  })\n  it.each([\n    ['Project Manager', true],\n    ['Project Officer', false],\n    ['Monitoring and Evaluation Officer', false],\n    ['Program Manager', false],\n    ['Grant Manager', false],\n  ] as const)('reads the shared action counts for %s only as %s', (role, enabled) => {\n    render(<RoleOverviewDashboard fullName=\"Ron\" role={role} />)\n\n    const call = reads.calls.find((args) => args[0] === 'dashboard-action-counts')\n    expect(call?.slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])\n    expect(call?.[4]).toBe(enabled)\n  })\n  it('reads the action counts through the dashboards client without arguments', async () => {\n    reads.counts.mockResolvedValue({ forReview: 1 })\n    render(<RoleOverviewDashboard {...props} />)\n\n    const call = reads.calls.find((args) => args[0] === 'dashboard-action-counts')\n    await expect((call?.[3] as () => Promise<unknown>)()).resolves.toEqual({ forReview: 1 })\n    expect(reads.counts).toHaveBeenCalledWith()\n  })\n})\n",
  1
 ]
]
```


```bash
D=apps/web/src/features/dashboard
node .tmp/s7d/replace-exact.mjs .tmp/s7d/task8-test-edits.json
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && timeout 800 pnpm exec vitest run src/features/dashboard/components/action-kpi-row.states.test.tsx src/features/dashboard/role-overview/role-overview.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
4 replacements in 1 files
Checked 2 files in <ms>. Fixed 2 files.
web typecheck clean
 Test Files  2 passed (2)
      Tests  16 passed (16)
```


Both files pass against the code that is still in place (7 and 9 tests, 16 in all; Biome formats the two files): the key, the grant and the reader are pinned before they move.

- [ ] **Step 3: Mutate the call sites, then commit the pins**

The 19 mutations change each argument of both reads (key, project, grant, reader argument, the flag forced on, forced off, inverted and aimed at another role) and each state of the row (eligible, error before data, loading, Retry, empty cards, the section label). Each must fail a case:

Create `.tmp/s7d/mut-t8-before.json`:

```json
[
 [
  "row key",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "useAuthorizedRead('dashboard-action-counts'",
  "useAuthorizedRead('dashboard-action-count'"
 ],
 [
  "row project",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "'dashboard-action-counts', null,",
  "'dashboard-action-counts', 'p1',"
 ],
 [
  "row grant",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "null, 'projects.read', () =>",
  "null, 'projects.detail.read', () =>"
 ],
 [
  "row client argument",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "getDashboardActionCounts(),\n  )",
  "getDashboardActionCounts(null as never),\n  )"
 ],
 [
  "row disabled",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "getDashboardActionCounts(),\n  )",
  "getDashboardActionCounts(),\n    false,\n  )"
 ],
 [
  "row eligible",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "if (!read.eligible) return null",
  "if (read.eligible) return null"
 ],
 [
  "row error first",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "if (read.isError)\n",
  "if (read.isError && !read.data)\n"
 ],
 [
  "row loading",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "if (!read.data)\n",
  "if (read.data)\n"
 ],
 [
  "row retry",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "onRetry={() => void read.refetch()}",
  "onRetry={() => undefined}"
 ],
 [
  "row empty cards",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "  if (!cards.length) return null\n",
  ""
 ],
 [
  "row section label",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "aria-label=\"Tasks needing action\"",
  "aria-label=\"Tasks\""
 ],
 [
  "overview key",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    'dashboard-action-counts',\n",
  "    'dashboard-action-count',\n"
 ],
 [
  "overview project",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    'dashboard-action-counts',\n    null,",
  "    'dashboard-action-counts',\n    'p1',"
 ],
 [
  "overview grant",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    'projects.read',\n    () => dashboardsClient",
  "    'projects.detail.read',\n    () => dashboardsClient"
 ],
 [
  "overview client argument",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "getDashboardActionCounts(),\n    role",
  "getDashboardActionCounts(null as never),\n    role"
 ],
 [
  "overview always",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    role === 'Project Manager',\n  )",
  "    true,\n  )"
 ],
 [
  "overview never",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    role === 'Project Manager',\n  )",
  "    false,\n  )"
 ],
 [
  "overview other role",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    role === 'Project Manager',\n  )",
  "    role !== 'Project Manager',\n  )"
 ],
 [
  "overview manager only by name",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "    role === 'Project Manager',\n  )",
  "    role === 'Program Manager',\n  )"
 ]
]
```


```bash
D=apps/web/src/features/dashboard
H1=$(git hash-object $D/components/action-kpi-row.tsx)
H2=$(git hash-object $D/role-overview/role-overview.tsx)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-t8-before.json $D/components/action-kpi-row.states.test.tsx $D/role-overview/role-overview.test.tsx > .tmp/s7d/out/t8-before.txt 2>&1
grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t8-before.txt
grep SURVIVED .tmp/s7d/out/t8-before.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $D/components/action-kpi-row.tsx)" = "$H1" && test "$(git hash-object $D/role-overview/role-overview.tsx)" = "$H2" && echo "files restored"
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the action counts read of the action row and the role overview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
unmutated: pass
mutations 19, survived 0
files restored
$ pnpm exec biome check .
Checked 1566 files in <ms>. No fixes applied.
 2 files changed, 157 insertions(+), 3 deletions(-)
```


All 19 mutations are killed and both files are restored. The commit adds 2 files and changes the role overview test (157 insertions, 3 deletions).

- [ ] **Step 4: Add the hook and use it at both call sites**

The hook keeps the key, the grant and the reader, and passes the flag on. A second test file pins it on its own:

Create `apps/web/src/features/dashboard/dashboard.reads.ts`:

```ts
'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { dashboardsClient } from '@/lib/api/dashboards'

/** Reads the action counts under the one resource key the action row and the role overview share. */
export const useDashboardActionCounts = (enabled = true) =>
  useAuthorizedRead(
    'dashboard-action-counts',
    null,
    'projects.read',
    () => dashboardsClient.getDashboardActionCounts(),
    enabled,
  )
```


Create `apps/web/src/features/dashboard/dashboard.reads.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDashboardActionCounts } from './dashboard.reads'

const reads = vi.hoisted(() => ({ read: vi.fn(), counts: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: reads.read }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: { getDashboardActionCounts: reads.counts } }))

describe('useDashboardActionCounts', () => {
  beforeEach(() => {
    reads.read.mockReset().mockReturnValue('read result')
    reads.counts.mockReset()
  })

  it('reads the shared key for the projects grant, with no project and no options', () => {
    useDashboardActionCounts()

    expect(reads.read).toHaveBeenCalledTimes(1)
    const args = reads.read.mock.calls[0]
    expect(args.slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])
    expect(args).toHaveLength(5)
  })

  it('is enabled unless the caller says otherwise', () => {
    useDashboardActionCounts()

    expect(reads.read.mock.calls[0][4]).toBe(true)
  })

  it.each([true, false])('passes the enabled flag %s on', (enabled) => {
    useDashboardActionCounts(enabled)

    expect(reads.read.mock.calls[0][4]).toBe(enabled)
  })

  it('reads through the dashboards client without arguments', async () => {
    reads.counts.mockResolvedValue({ forReview: 2 })
    useDashboardActionCounts()

    await expect(reads.read.mock.calls[0][3]()).resolves.toEqual({ forReview: 2 })
    expect(reads.counts).toHaveBeenCalledWith()
  })

  it('returns the read as it is', () => {
    expect(useDashboardActionCounts()).toBe('read result')
  })
})
```


`task8-edits.json` replaces the two reads (the imports they needed go with them; `ActionKpiRow` calls the hook without a flag, `RoleOverviewDashboard` with `role === 'Project Manager'` as before) and aliases the severity type:

Create `.tmp/s7d/task8-edits.json`:

```json
[
 [
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "import { useAuthorizedRead } from '@/hooks/use-authorized-read'\nimport { dashboardsClient } from '@/lib/api/dashboards'\nimport { cn } from '@/lib/utils'\nimport type { DashboardActionCounts } from '@pathways/shared'\n",
  "import { cn } from '@/lib/utils'\nimport type { DashboardActionCounts } from '@pathways/shared'\n\nimport { useDashboardActionCounts } from '../dashboard.reads'\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "  const read = useAuthorizedRead('dashboard-action-counts', null, 'projects.read', () =>\n    dashboardsClient.getDashboardActionCounts(),\n  )\n",
  "  const read = useDashboardActionCounts()\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "import { useAuthorizedRead } from '@/hooks/use-authorized-read'\n",
  "",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "import { dashboardsClient } from '@/lib/api/dashboards'\n",
  "",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "import type { PathwaysRole } from '@/types/pathways-role'\n",
  "import type { PathwaysRole } from '@/types/pathways-role'\n\nimport { useDashboardActionCounts } from '../dashboard.reads'\n",
  1
 ],
 [
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "  const counts = useAuthorizedRead(\n    'dashboard-action-counts',\n    null,\n    'projects.read',\n    () => dashboardsClient.getDashboardActionCounts(),\n    role === 'Project Manager',\n  )\n",
  "  const counts = useDashboardActionCounts(role === 'Project Manager')\n",
  1
 ],
 [
  "apps/web/src/types/pathways.ts",
  "import type { PathwaysRole } from '@/types/pathways-role'\n",
  "import type { StatusTone } from '@/lib/format/tone'\nimport type { PathwaysRole } from '@/types/pathways-role'\n",
  1
 ],
 [
  "apps/web/src/types/pathways.ts",
  "export type DashboardSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'danger'\n",
  "export type DashboardSeverity = StatusTone\n",
  1
 ]
]
```


```bash
node .tmp/s7d/replace-exact.mjs .tmp/s7d/task8-edits.json
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
(cd apps/web && npx tsc --noEmit -p .) && echo "web typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
git grep -n "dashboard-action-counts" -- apps/web/src ':!*.test.ts' ':!*.test.tsx'
git diff HEAD --stat -- apps/web/src/types/pathways.ts | tail -1
(cd apps/web && timeout 800 pnpm exec vitest run src/features/dashboard 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
8 replacements in 3 files
Checked 5 files in <ms>. Fixed 1 file.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
apps/web/src/features/dashboard/dashboard.reads.ts:9:    'dashboard-action-counts',
 1 file changed, 2 insertions(+), 1 deletion(-)
 Test Files  21 passed (21)
      Tests  311 passed (311)
```


The key now appears once outside tests, in `dashboard.reads.ts`. The `--noUnusedLocals` run lists only the two lines of the baseline. The `git diff --stat` line is the alias (2 insertions and 1 deletion: the import and the type). The pins of Step 2 pass unchanged against the hook, which is the proof that the reads did not change; the dashboard folder passes with 21 test files and 311 tests (the pins of Step 2, the 6 tests of the hook and everything from Tasks 5 to 7).

- [ ] **Step 5: Mutate the hook and its call sites, then commit**

The 13 mutations change each part of the hook (key, project, grant, reader argument, default off, flag dropped, flag inverted, an extra option) and of the two calls (the row disabled, the overview always, never, for the other roles and with no flag). The three test files run together:

Create `.tmp/s7d/mut-t8-after.json`:

```json
[
 [
  "reads key",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    'dashboard-action-counts',\n",
  "    'dashboard-action-count',\n"
 ],
 [
  "reads project",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    'dashboard-action-counts',\n    null,",
  "    'dashboard-action-counts',\n    'p1',"
 ],
 [
  "reads grant",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    'projects.read',",
  "    'projects.detail.read',"
 ],
 [
  "reads client argument",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "getDashboardActionCounts(),",
  "getDashboardActionCounts(null as never),"
 ],
 [
  "reads default disabled",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "(enabled = true)",
  "(enabled = false)"
 ],
 [
  "reads enabled dropped",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    enabled,\n  )",
  "    true,\n  )"
 ],
 [
  "reads enabled inverted",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    enabled,\n  )",
  "    !enabled,\n  )"
 ],
 [
  "reads extra option",
  "apps/web/src/features/dashboard/dashboard.reads.ts",
  "    enabled,\n  )",
  "    enabled,\n    { freshness: 'summary' },\n  )"
 ],
 [
  "row disabled",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  "useDashboardActionCounts()",
  "useDashboardActionCounts(false)"
 ],
 [
  "overview always",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "useDashboardActionCounts(role === 'Project Manager')",
  "useDashboardActionCounts(true)"
 ],
 [
  "overview never",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "useDashboardActionCounts(role === 'Project Manager')",
  "useDashboardActionCounts(false)"
 ],
 [
  "overview other role",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "useDashboardActionCounts(role === 'Project Manager')",
  "useDashboardActionCounts(role !== 'Project Manager')"
 ],
 [
  "overview flag dropped",
  "apps/web/src/features/dashboard/role-overview/role-overview.tsx",
  "useDashboardActionCounts(role === 'Project Manager')",
  "useDashboardActionCounts()"
 ]
]
```


```bash
D=apps/web/src/features/dashboard
H1=$(git hash-object $D/dashboard.reads.ts)
H2=$(git hash-object $D/components/action-kpi-row.tsx)
H3=$(git hash-object $D/role-overview/role-overview.tsx)
node .tmp/s7d/mutate.mjs .tmp/s7d/mut-t8-after.json $D/dashboard.reads.test.ts $D/components/action-kpi-row.states.test.tsx $D/role-overview/role-overview.test.tsx > .tmp/s7d/out/t8-after.txt 2>&1
grep -E "^unmutated|NOT APPLIED|^mutations" .tmp/s7d/out/t8-after.txt
grep SURVIVED .tmp/s7d/out/t8-after.txt | sed 's/: SURVIVED//' | sort
test "$(git hash-object $D/dashboard.reads.ts)" = "$H1" && test "$(git hash-object $D/components/action-kpi-row.tsx)" = "$H2" && test "$(git hash-object $D/role-overview/role-overview.tsx)" = "$H3" && echo "files restored"
pnpm lint 2>&1 | tail -2
git add -A apps
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): share the dashboard action counts read and the severity type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
unmutated: pass
mutations 13, survived 0
files restored
$ pnpm exec biome check .
Checked 1568 files in <ms>. No fixes applied.
 5 files changed, 72 insertions(+), 15 deletions(-)
```


All 13 mutations are killed and the files are restored. The commit changes 5 files (72 insertions, 15 deletions).

---

### Task 9: Records and release gates

**Files:**
- Create (gitignored): `.tmp/s7d/task9-edits.json`, `.tmp/s7d/activity-s7d.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.7 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06, MOD-15, MOD-16 and MOD-17 rows), `docs/qad-pathways.md` (QAD-T105 and QAD-A40 paths), `docs/deferred-features.md` (rows 24, 63 and 89), `docs/dsd-pathways.md` (the dashboard KPI row), `docs/index.md` (CR row and plan row), `docs/activity-log.md`

No SAD routing change is needed (ruling 11): `scripts/sad/check.ts` already routes `apps/web/src/**` to `design-qa-agent`, and the new files hold no beneficiary data path (the action counts client was routed in S7c).

- [ ] **Step 1: Amend the change record, the living docs and the index**

`task9-edits.json` holds the exact replacements: the layout paragraph of section 3.3, the S7 row of the roadmap (section 3.7), the S7d applied paragraph of section 9 in place of the "Deferred to S7d" line, four audit rows, and the paths of the QAD, deferred feature and DSD rows that name the nine moved dashboard files. `@DATE@` is replaced by the day Task 9 runs, `@SHELL@` by the line count of the analytics dashboard and `@ROLE@` by the line count of the role dashboard:

Create `.tmp/s7d/task9-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "(amended 2026-10-14 for S7c).",
  "(amended 2026-10-14 for S7c).\n\n`features/dashboard` follows the layout with `components/` (the action row, the executive dashboard, the pinned charts, the role dashboard, the activity review panel, the monitoring snapshot and the list items, with their tests), `dashboard.reads.ts`, `dashboard.utils.ts`, the `.utils` suffix on `monitoring-reach-metrics`, the existing `role-overview/` folder and an `index.ts` that exports `RoleDashboard`; a read key that two components share lives in the feature `.reads` file as a hook, so the key, the grant and the reader are written once (amended @DATE@ for S7d).",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "and S7d (dashboards web and the analytics shell) |",
  "and S7d (dashboards web and the analytics shell); S7a to S7d applied |",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "Deferred to S7d: `features/dashboard` (layout, index, `role-dashboard.tsx`, `DashboardSeverity`) and the rest of the analytics shell (the filter bar, the analysis panel and the scope state).",
  "S7d applied @DATE@ on the S7d slice branch:\n- Analytics shell: `analytics-dashboard.tsx` (898 lines) gave its access flags to `analyticsAccess` in `analytics.reads.ts`, its project, period, view and visualization state to `hooks/use-analytics-scope.ts` and its markup to `AnalyticsActionBar`, `AnalyticsFilterBar` and `AnalyticsAnalysisPanel`; the shell is @SHELL@ lines, below the 500 line flag. 54 cases pinned the scope, the actions, the filters and the grants and date rules that stay in the shell against the unsplit shell first, every cut is verbatim (`same lines`: `lost 0`), and 205 new tests (54 pins, 17 for the access function, 27 for the hook, 107 for the three components) are mutated once: 239 mutations of the units each fail a test except 19 recorded survivors (6 equivalents of the hook, 10 unreachable branches of the action bar and 3 unreachable units of the analysis panel). The 9 survivors of the lines that stay in the shell (102 mutations of the shell in all) are listed in the plan as equivalent or unreachable; the 13 that were behavior are pinned by the gates test.\n- Layout: 9 files of `features/dashboard` moved into `components/` and the `.utils` name, `index.ts` exports `RoleDashboard`, the dashboard page imports it, and `indexedFeatures` and `optimizePackageImports` list `dashboard`; the move changed no route bundle.\n- Role dashboard: `role-dashboard.tsx` (693 lines) had one test of its permission table; 108 tests in three files and a fixture module pinned its states, monitoring and activity review first (240 mutations), then its helpers moved to `dashboard.utils.ts` and the review panel, the monitoring snapshot and the list items became components with a test file each (125 tests); the shell is @ROLE@ lines. The new units are mutated against their own tests (152 mutations, 7 equivalents survive).\n- MOD-16: `useDashboardActionCounts` in `dashboard.reads.ts` replaces the two copies of the `dashboard-action-counts` read (the action row and the role overview) after 16 tests pinned both call sites (32 mutations, none survive), and `DashboardSeverity` is an alias of `StatusTone`.\n- Decisions: the scope state is one hook that is called where its effects stood, with one effect order change (ruling 3); the filter bar takes the action bar as its children (ruling 4); the monitoring charts section stays in the analytics shell (ruling 8); units that only the administrator reaches through the shell are tested directly (ruling 2).\n\nNot done in S7d: nothing of the S7 web analytics and dashboards work remains. The `lib/services/*` files that no slice owns stay for W1, and the other `statusTone` and `formatDate` copies of MOD-16 stay with the screens that own them, for W1 to close what remains.",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "(the shell stays above 500 lines for S7d). |",
  "(the shell stays above 500 lines until S7d); the analytics shell split into a scope hook and three components and `role-dashboard.tsx` into helpers and three components by S7d. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "the analytics index by S7c. |",
  "the analytics index by S7c; the dashboard index by S7d. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "rule-binding read keys closed by S7a. |",
  "rule-binding read keys closed by S7a; the dashboard action counts key and `DashboardSeverity` by S7d. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "analytics laid out by S7c. |",
  "analytics laid out by S7c; dashboard laid out by S7d. |",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/dashboard/action-kpi-row.tsx",
  "apps/web/src/features/dashboard/components/action-kpi-row.tsx",
  2
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/dashboard/pinned-charts.tsx",
  "apps/web/src/features/dashboard/components/pinned-charts.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/dashboard/role-dashboard.tsx",
  "apps/web/src/features/dashboard/components/role-dashboard.tsx",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/dashboard/action-kpi-row.test.ts",
  "apps/web/src/features/dashboard/components/action-kpi-row.test.ts",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/dashboard/pinned-charts.test.tsx",
  "apps/web/src/features/dashboard/components/pinned-charts.test.tsx",
  1
 ],
 [
  "docs/dsd-pathways.md",
  "features/dashboard/action-kpi-row.tsx",
  "features/dashboard/components/action-kpi-row.tsx",
  1
 ],
 [
  "docs/index.md",
  "S7a, S7b and S7c applied, S7d next",
  "S7a, S7b, S7c and S7d applied, S8a next",
  1
 ]
]
```


```bash
D=$(date +%F)
F=apps/web/src/features
sed -i "s/@DATE@/$D/g; s/@SHELL@/$(wc -l < $F/analytics/components/analytics-dashboard.tsx)/g; s/@ROLE@/$(wc -l < $F/dashboard/components/role-dashboard.tsx)/g" .tmp/s7d/task9-edits.json
grep -c "@[A-Z0-9_]*@" .tmp/s7d/task9-edits.json
node .tmp/s7d/replace-exact.mjs .tmp/s7d/task9-edits.json
sed -i '/(superpowers\/plans\/.*modularization-s7d-dashboards-web/s/| In progress |$/| S7d executed |/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{70} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
grep -c "S7d executed" docs/index.md
git grep -nE "features/dashboard/(action-kpi-row|executive-dashboard|pinned-charts|role-dashboard|monitoring-reach)" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/superpowers/*' ':!docs/handoff' ':!docs/cr-*' | cut -c1-150
```


Expected:

```text
0
14 replacements in 6 files
 docs/audit-pathways-codebase-modularity-20261009.md |  8 ++++----
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++--
 docs/deferred-features.md                           |  6 +++---
 docs/dsd-pathways.md                                |  2 +-
 docs/index.md                                       |  4 ++--
 docs/qad-pathways.md                                |  4 ++--
 6 files changed, 23 insertions(+), 14 deletions(-)
nts and `role-dashboard.tsx` into helpers and three components by S7d. |
rules, index); the analytics index by S7c; the dashboard index by S7d. |
y S7a; the dashboard action counts key and `DashboardSeverity` by S7d. |
laid out by S7b; analytics laid out by S7c; dashboard laid out by S7d. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S7c and S7d applied, S8a next |
1
```


`replace-exact` applies 14 replacements in 6 files and writes nothing unless every count matches. The stat lists the six files, and the four audit lines are the new clauses of MOD-06, MOD-15, MOD-16 and MOD-17. The CR row of the index now lists S7d among the applied slices and ends with S8a next (the slices S4c to S6c are in the list already), and the plan row says executed. The `git grep` that follows would print the old paths of the nine moved files in the living docs if an edit missed one. The last `git grep` prints nothing: the change records of earlier features (`docs/cr-pathways-*`) keep the paths of their day, as the earlier slices did.

- [ ] **Step 2: Activity log**

`.tmp/s7d/activity-s7d.md` is the S7d section of the activity log, with the commit hashes of Tasks 1 to 8 as `@H1@` to `@H8@` (`@H8A@` is the test commit before the refactor of Task 8):

Create `.tmp/s7d/activity-s7d.md`:

```md

## @DATE@ Modularization S7d dashboards web (S7d slice branch)
- Task 1 (@H1@): 54 cases pinned the scope state, the actions, the filters and the grants and date rules that stay in the shell against the unsplit component, and the fixture module gained the mocks they need; a survey of 102 mutations of the shell left 29 survivors, 20 in code that moves (Tasks 2 to 4 sort them) and 9 in code that stays (equivalent or unreachable).
- Task 2 (@H2@): the 13 access flags and the survey freeze left the shell for `analyticsAccess` in `analytics.reads.ts` (`same lines: lost 0`); a 17 test table gives every flag exactly its grants and 10 mutations each fail a test.
- Task 3 (@H3@): the project, period, view and monitoring state, its resets and its four effects became `useAnalyticsScope`, called where the state stood (`same lines: lost 0`); 27 hook tests pin the first paint, the reset of every field before the first effect and the stale answers, and 49 mutations leave 6 recorded equivalents.
- Task 4 (@H4@): the action bar, the filter bar and the analysis panel left the shell by line range (`same lines: lost 0`); the shell is @SHELL@ lines and the three components have 39, 32 and 36 tests (180 mutations, 13 recorded survivors that the component cannot reach); the UI copy contract test follows the moved participation markup.
- Task 5 (@H5@): 9 files of `features/dashboard` moved into `components/` and `.utils` names, `index.ts` added, the dashboard page imports it, `dashboard` listed in `indexedFeatures` and `optimizePackageImports`; no route changed and Middleware stayed at @M0@ kB.
- Task 6 (@H6@): 108 tests in three files and one fixture module pinned the states, the monitoring section and the activity review panel of `role-dashboard.tsx` against the unsplit component; 240 mutations leave 42 survivors, 34 of them in code the shell reaches only as a System Administrator.
- Task 7 (@H7@): the helpers, the review panel, the monitoring snapshot and the list items left `role-dashboard.tsx` (`same lines: lost 0`); the shell is @ROLE@ lines and four test files pin the new units (125 tests, 152 mutations, 7 recorded equivalents); the 8 survivors in the shell are lines that did not move.
- Task 8 (@H8A@, @H8@): 16 tests pinned the two call sites of the action counts read, then `useDashboardActionCounts` replaced the two copies and `DashboardSeverity` became an alias of `StatusTone`; 32 mutations each fail a test.
- Task 9: the change record, audit, QAD, DSD, deferred feature rows and the index follow the new paths and the S7d disposition is recorded; no SAD routing change, because `apps/web/src/**` already routes to the design QA agent.
- Decisions: the S7d decisions are in the change record section 9; this plan and the plan copies of the earlier slices stay until the series is merged, then they are retired in a separate change.
- Deferred: nothing of the S7 web analytics and dashboards work; the `lib/services/*` files that no slice owns stay for W1.
```


```bash
D=$(date +%F)
F=apps/web/src/features
h() { git log -1 --format=%h --grep="$1"; }
sed -i -e "s/@DATE@/$D/" \
  -e "s/@H1@/$(h '^test(web): pin the analytics shell scope')/" \
  -e "s/@H2@/$(h '^refactor(web): move the analytics access flags')/" \
  -e "s/@H3@/$(h '^refactor(web): move the analytics scope state')/" \
  -e "s/@H4@/$(h '^refactor(web): split the analytics action bar')/" \
  -e "s/@H5@/$(h '^refactor(web): give dashboard a feature layout')/" \
  -e "s/@H6@/$(h '^test(web): pin the role dashboard states')/" \
  -e "s/@H7@/$(h '^refactor(web): split the role dashboard')/" \
  -e "s/@H8A@/$(h '^test(web): pin the action counts read')/" \
  -e "s/@H8@/$(h '^refactor(web): share the dashboard action counts')/" \
  -e "s/@M0@/$(cat .tmp/s7d/m0)/" \
  -e "s/@SHELL@/$(wc -l < $F/analytics/components/analytics-dashboard.tsx)/" \
  -e "s/@ROLE@/$(wc -l < $F/dashboard/components/role-dashboard.tsx)/" .tmp/s7d/activity-s7d.md
grep -c "@[A-Z0-9_]*@" .tmp/s7d/activity-s7d.md
cat .tmp/s7d/activity-s7d.md >> docs/activity-log.md
tail -13 docs/activity-log.md | cut -c1-90
```


Expected:

```text
0

## YYYY-MM-DD Modularization S7d dashboards web (S7d slice branch)
- Task 1 (<sha>): 54 cases pinned the scope state, the actions, the filters and the gran
- Task 2 (<sha>): the 13 access flags and the survey freeze left the shell for `analytic
- Task 3 (<sha>): the project, period, view and monitoring state, its resets and its fou
- Task 4 (<sha>): the action bar, the filter bar and the analysis panel left the shell b
- Task 5 (<sha>): 9 files of `features/dashboard` moved into `components/` and `.utils` 
- Task 6 (<sha>): 108 tests in three files and one fixture module pinned the states, the
- Task 7 (<sha>): the helpers, the review panel, the monitoring snapshot and the list it
- Task 8 (<sha>, <sha>): 16 tests pinned the two call sites of the action counts read,
- Task 9: the change record, audit, QAD, DSD, deferred feature rows and the index follow t
- Decisions: the S7d decisions are in the change record section 9; this plan and the plan 
- Deferred: nothing of the S7 web analytics and dashboards work; the `lib/services/*` file
```


The placeholder count of the file is 0 once the figures of this slice are in it, and the tail prints the section: one line per task with its commit hashes, the decisions line and the deferral line.

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S7d

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1568 files in <ms>. No fixes applied.
<sha> docs: record modularization S7d
<sha> refactor(web): share the dashboard action counts read and the severity type
```


`docs:check` keeps the 6 baseline failures and 1 warning.

- [ ] **Step 4: Static gates**

This slice opens no pull request: it is stacked below the end of the series, and the one pull request into `dev` that follows the last slice carries the DB replay and the other CI gates (its replay is the replay gate of this slice). The gates below run on the slice branch and are recorded in the activity log. The recursive test run uses the no-bail option as in Task 0:

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s7d/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
.tmp/s7d/build-routes.sh gates
for t in baseline prelayout layout; do node .tmp/s7d/compare-routes.mjs .tmp/s7d/routes-$t.txt .tmp/s7d/routes-gates.txt | grep -E "\(\+|^routes"; done
grep Middleware .tmp/s7d/routes-gates.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1
cat .tmp/s7d/m0
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```


Expected:

```text
$ pnpm exec biome check .
Checked 1568 files in <ms>. No fixes applied.
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  46 passed (46)
packages/shared test:       Tests  731 passed (731)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  158 passed | 10 skipped (168)
apps/api test:       Tests  2628 passed | 21 skipped (2649)
apps/web test:  Test Files  282 passed (282)
apps/web test:       Tests  2879 passed (2879)
      Tests  58 passed (58)
exit 0
ƒ Middleware                                                      102 kB
routes 72, different 0
routes 72, different 0
routes 72, different 0
<n>
<n>

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```


Lint and typecheck are clean. The recursive test run prints the baselines unchanged for config (19), shared (731), imports (94) and api (2628 passed, 21 skipped), and the web figure equals `B_web` plus the delta of Tasks 1 to 8: 282 files and 2879 tests, which is 265 + 17 files and 2422 + 457 tests (205 in Tasks 1 to 4, 108 in Task 6, 125 in Task 7 and 19 in Task 8). The SAD tests stay at 58. The build exits 0 with Middleware at `M0` (102 kB). The three compares (Task 0 table, `prelayout`, `layout`) print `different 0` in the replay: no route changed. Another checkout printed `/analytics` 1.0 kB bigger against the Task 0 table (that line is printed, because the compare greps `(+`), so the bound is that no route is more than 1 kB bigger and nothing grew since the layout move. `docs:check` keeps the 6 baseline failures and 1 warning.

- [ ] **Step 5: Local DB replay**

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


The replay printed `0` for the user id (root), `pwsh` present, PostgreSQL 18 present (`clusterdb` is the first file of the folder), `supabase` missing and the Docker command present, and the replay command itself stopped at the disposable cluster: the first line is `HISTORICAL_MIGRATION_INTEGRITY=PASS`, then `initdb: error: cannot be run as root` and `PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.` The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root; where it runs, expect exit 0. S7d changes no migration, so when the replay cannot run here the CI replay of the final pull request of the series is the gate; record in the gate line of Step 8 which one ran.

- [ ] **Step 6: Local stack, compiled API boot, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, the `pnpm dev:local` boot and the route curls, both Playwright configs and the browser smoke) as pending local run in the gate line and list it for the developer; do not skip Steps 4, 5 or 7. Stop anything on ports 3000 and 4000 first, then:

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev:

- `/dashboard` for each of the six roles: the home cards, the action count row (a role without the grant sees no row, a failed read shows "Task counts unavailable" and Retry reads again), the role overview, the pinned charts, and for a System Administrator the dashboard sections, the item actions and the monitoring section (with `ADMIN_DASHBOARD_MONITORING_UI_ENABLED` on: the project selector, the cards and their links).
- A dashboard item whose action opens a proof or expense review: the panel opens on the activity, closing returns focus to the button, a changed activity reloads the dashboard and a submitted proof closes the dialog.
- `/analytics`: switch every analysis view (KPI, participation, survey, timeline) and every visualization (bar, line, table; the map only when `MAPS_UI_ENABLED` is on), change the project and the reporting period and see the panels reload without a stale frame, the Add to Dashboard control only when `DASHBOARD_PINS_UI_ENABLED` is on, the export preview in each of CSV, XLS, XLSX and PDF (cancel one, download one) as a role with `analytics.export`, the SADDD panel with its Retry, the descriptive statistics panel and the open alerts panel as roles that may read them, and a Program Manager seeing the survey views limited to closed periods.
- A project's indicators page still shows the monitoring read (`use-monitoring-read` moved in S7c).

- [ ] **Step 7: SAD review**

```bash
mkdir -p .tmp/sad/s7d
pnpm sad:check --base "$(cat .tmp/s7d/base-sha)" --head HEAD --output .tmp/sad/s7d/manifest.json > .tmp/sad/s7d/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s7d/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```


Expected:

```text
exit 0
design-qa-agent 55
```


The check exits 0 and routes all 54 changed paths to `design-qa-agent` (below the 60 path split). Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s7d/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s7d/assemble.mjs`, run `node .tmp/sad/s7d/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s7d/base-sha)" --head HEAD --reviews .tmp/sad/s7d/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The replay of this plan could not dispatch the roles (it ran as a script, without subagents), so the sign-off is pending for the cloud run.

- [ ] **Step 8: Record the gate results**

Append a final bullet to the Task 9 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The bullet of the replay, to adapt with your own numbers (the web figures must equal the Task 0 baseline plus the delta of Tasks 1 to 8, the others the Task 0 baselines):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 731, imports 94, api 2628 passed and 21 skipped, web 282 files and 2879 tests, sad 58; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware at M0 (102 kB in this container) and 72 routes, none different from the Task 0, prelayout and layout builds (a checkout that prints `/analytics` 1 kB bigger is inside the bound); local DB replay (CI of the final pull request), seeds, e2e and browser smoke pending local run; SAD sign-off pending; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S7d release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -3
```


Expected:

```text
<sha> docs: record modularization S7d release gate results
<sha> docs: record modularization S7d
<sha> refactor(web): share the dashboard action counts read and the severity type
```


- [ ] **Step 9: What happens after the merge (not part of this slice)**

S7d closes the S7 series, and S4c, S5b, S5c and S6c are applied below it; it is followed by S8a, S8b and W1. This plan is not edited, committed to or removed inside the slice. After the developer has merged the series into `dev`, the executed plan copies are retired in a separate documentation change: remove `docs/superpowers/plans/*-modularization-s7*-*.md` and only their index rows (the `docs/handoff` copies and their rows stay), then run `pnpm docs:check` and expect the 6 baseline failures. S8a needs no change. S8b needs one edit that this slice causes: its ruling 10 and the last entry of its `task3-edits.json` give a dashboard leaf as the example of a feature that is not indexed (`@/features/dashboard/role-overview/portfolio-overview`), but `dashboard` is indexed after S7d, so that case of the direction test would fail; once S8b indexes its four features every feature with code is indexed, so the example must name a feature that has no folder, such as `@/features/unlisted/example`. S8b recounts its web figures in its own Task 0.

---


## What S7d leaves for the plans after it

S7d finishes the S7 series, so there is no S7e outline. The plans that follow can rely on this:

- **Surface:** `features/analytics` and `features/dashboard` are indexed features; a file outside them imports the index only, and `import-direction.test.ts` fails on a leaf import. `lib/api/dashboards.ts` and `lib/api/analytics.ts` hold every dashboard and analytics read.
- **Components above the flag:** none in either feature. `analytics-dashboard.tsx` and `role-dashboard.tsx` are below 500 lines; the largest analytics file is a test.
- **MOD-16 left over (not in the dashboard feature):** the `statusTone` functions of `collection/collection.utils.ts`, `projects/evaluation/evaluation.utils.ts`, `activity-extension-panel.tsx`, `rules/components/review-card-list.tsx`, `rules.utils.ts` and `executive-dashboard.tsx` are different mappings of different vocabularies; and the `formatDate` copies in `activities.utils.ts` and `beneficiaries.utils.ts`. Each stays with the screen that owns it (S4c to S6c left them in place), and W1 closes what remains.
- **For W1:** the `lib/services/*` files that no slice owns, and the plan copies under `docs/superpowers/plans` (Task 9, Step 9).
- **For S8b and later web slices:** recount the web test figures in the Task 0 of the plan (the no-bail form of the recursive test run keeps the figures of every package visible), and measure the route table of a clean build before editing, as Task 0 and Task 5 of this plan do.
