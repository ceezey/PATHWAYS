# S7b Analytics and Dashboards (api and shared) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboards and analytics api one module per concern and the shared `monitoring` folder its place in the CR 3.4 layout, with no change to any route, permission, status code, message, response body, stored value or exported name.

**Architecture:** S7b is the api and shared half of the analytics and dashboards work of S7 (S7a, the rules slice, is applied below it; S7c, the web half, follows). Nothing is rewritten by hand: `git mv` moves whole files (`move-files.mjs` rewrites the specifiers), `split-declarations.mjs` and `extract-methods.mjs` cut declarations out of one file into new ones, and `same-lines.mjs` proves that every declaration line (or, for the role overview service, every token) of the old files sits in a new file (`lost 0`). Where a shape moves, a test that pins the old behavior is written and run first: the route table, the module wiring, the three export headers, the role overview row caps and orders, the stored project status error text. The slice has eight tasks after the baseline: kernel adoption (Task 1), the `analytics` module (Task 2), the descriptive analytics split (Task 3), the role overview split (Task 4), the shared folder layout (Task 5), the stored project status copies (Task 6), records (Task 7) and the release gates (Task 8, which also holds the S7c outline).

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS, Prisma, Zod, Next 15.5.14 (production build only for the route comparison), Vitest 3.2, Biome 1.9.4.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.2, 3.4, 3.5, 3.7 and 9 including the S7a disposition and its "Deferred to S7b" line) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04 service splits, MOD-11 zod helper and status copies, MOD-17 layout and naming).

## Rulings

Controller rulings for S7b. Each was checked on the S7a tip; Task 0 recounts them. Ruling 1 of the S7 plan (split S7 by domain) and its ruling 17 (hand-offs land in S7b) are the origin of this plan.

1. **S7b and S7c.** The S7 plan outlined twelve S7b tasks in two parts; written out, part 1 alone is nine tasks (Task 0 to Task 8) and part 2 is the web work, so the plan splits along the line the S7 plan named: S7b (this plan, api and shared) and S7c (web, outline at the end of Task 8, written as its own plan from the S7b tip). Task 7 changes the CR 3.7 row to name both. Cost if wrong: a plan merge.
2. **No behavior change, and the route table is pinned first.** `dashboards.routes.test.ts` (Task 1 Step 1) reads the Nest metadata of the five controllers and pins 11 routes with method, path, permission and `Cache-Control`, the 403 (`ForbiddenException`, message `Application profile is required.`) for a request without identity, the service call of each handler (identity first, the other arguments in order) and the registration of both modules in `AppModule`; Task 1 Step 1b pins the insights 404 text and lookup. They run on the unchanged code, so they are characterizations, and every later task keeps them green. Cost if wrong: none (a failing pin is a defect found).
3. **`requestIdentity`, `Tx` and `requireScopedProject` are adopted where the text is the same.** The five controllers use `requestIdentity`; the 13 production `Prisma.TransactionClient` annotations become `Tx`; the insights project lookup becomes `requireScopedProject` (same `findFirst`, same select, same 404 `Project unavailable.`, the id already lowercased by its zod schema). The SADDD lookups keep their own 404 `Monitoring scope unavailable.` and `sadddReleasable` keeps returning false, so those stay inline. Cost if wrong: a one-line revert per call site.
4. **Shared: dissolve `monitoring/`, rename nothing.** The 15 files move by `git mv` to `contracts/dashboards`, `contracts/analytics`, `contracts/projects` and `metrics` (CR 3.4); the barrel exports the same 302 names (compared by script before and after); `metric-fields.ts` and the new `metric-round.ts` stay out of the barrel (S3 ruling 3). The 558-line `descriptive-analytics.ts` splits verbatim into three files, the three private field schemas that equal `metric-fields.ts` line for line are replaced by imports of it, and the 799-line views test splits by concern keeping all 35 titles. The web app bundles the compiled shared package, so the extra files add module wrappers to the routes that load it (about 1 kB, 2 kB on a few routes; Task 8 stops at more than 3 kB and wants Middleware at `M0`). Cost if wrong: a re-move or a bundle review.
5. **One `AnalyticsModule`.** The analytics controller, service and helpers and the insights module join in `modules/analytics`, importing `DashboardsModule` (which exports `DashboardsService`). `dashboards.dto.ts`, a zod parse helper, becomes `dashboards.helpers.ts` (CR 3.2: no `*.dto.ts`) and receives `suppressSmallCount` and `SMALL_CELL_THRESHOLD`, so `evaluations` and `projects` import a pure helper instead of the descriptive analytics file. The module pair `dashboards <-> reports` of `import-boundary.test.ts` and the import loop through `dashboards` disappear, and `report-artifact.ts` stays in reports (S6 ruling 2). `analytics.module.test.ts` resolves the module through Nest's testing module with a mocker that records every token: only the global `PrismaService` may reach it. Cost if wrong: a module move.
6. **The api descriptive analytics file splits by concern.** `descriptive-analytics.ts` (435 lines) becomes `descriptive-analytics.helpers.ts`, `timeline-analytics.helpers.ts` and `analytics-export.helpers.ts`; `exportFormats`, `parseExportFormat` and `exportArtifact` leave `analytics.service.ts` (515 to 454 lines) for the export file; the logger declaration is copied so both files log with the context `AnalyticsService`. The three identical export header literals become one constant only after `analytics-export.helpers.test.ts` pins each table's header. Cost if wrong: none.
7. **Role overview readers are functions.** The eight private methods that never use `this` become exported functions taking `tx` (S1 ruling 7; `project-budget.service.ts` is the model), four in `role-overview-work.service.ts` and four in `role-overview-queues.service.ts`; the class keeps `alerts` and `read` (159 lines). `role-overview.rows.test.ts` pins the model, `take` and `orderBy` of each role's queries first, and `same-lines --tokens` proves the move at token level. The two constants the readers share (`rows`, `day`) move to `role-overview.helpers.ts`. Cost if wrong: a re-inline.
8. **One stored project status list.** The four runtime copies (`role-overview.ts`, `rule-contract.ts`, `rule-metrics.ts` twice) use `z.enum(storedProjectStatuses)` and the api timeline builder uses `StoredProjectStatus`. A test pins the list and, per copy, that all five codes are accepted and `ARCHIVED` fails with the same error text (zod prints options in list order), so the switch is proven equal. Cost if wrong: a revert of five edits.
9. **Characterization first, tests keep every row.** Each new pin (routes and service calls, module registration, insights lookup, module wiring, headers, row caps, status, barrel, SAD routing) is also mutated once (one moved line changed) and must fail, then the line is restored; the split and rewritten tests keep every title and assertion (`test-titles.mjs` prints `lost 0`). The `sadddReleasable` constant stays inline and unpinned (ruling 3); the move scripts cover it. Cost if wrong: none (behavior is unchanged either way).
10. **No pull request, no plan-copy removal, local-only checks pending.** The developer asked for one pull request into `dev` after every slice is implemented, so S7b gets none of its own: the branch `claude/modularization-s7b-9ept8o` stays stacked on `claude/modularization-s7a-9ept8o`, and the final pull request CI replay is the gate for the database replay that cannot run in the cloud container. The seeds, dev servers, e2e runs and the browser smoke are recorded as "pending local run". The `docs/superpowers/plans` copies of earlier slices stay, and so does this plan's copy (it holds the S7c outline); the controller removes executed copies after the final merge. Cost if wrong: none.
11. **SAD routing follows the move.** The determinism checker's glob `packages/shared/src/monitoring/**/*.ts` would match nothing after Task 5, so the role would silently stop reviewing these files; Task 5 Step 6 changes it to the new folders and adds a test. No other path routing changes (api modules and shared contracts already route to the privacy and determinism roles). Cost if wrong: one glob.
12. **Not done in S7b (recorded in CR section 9):** the web work (S7c); `analytics.service.test.ts` (1514 lines after Task 2, one 326 line harness shared by its three describes; the api has no test fixtures folder, and the api tests of other modules above 600 lines wait for the same convention); `c8-runtime.local.test.ts` keeps its name and folder because it tests `DashboardsService` and `infra/supabase/phase6` scripts name its path; the CR 3.6 renames (decided not done); `dashboards.service.ts` and `analytics.service.ts` stay as the services that own their queries (the analytics service is 454 lines, under the 500 flag); the SADDD queries.

## Interfaces assumed from earlier sub-projects

- S7a: the rules module, `rules.routes.test.ts` (the pattern of Task 1), the SAD surface rule feature list, and the S7a markers Task 0 checks.
- S6: the pair list `['dashboards <-> reports']` in `apps/api/src/common/import-boundary.test.ts` and `modules/reports/report-artifact.ts` staying in reports.
- S3: `metric-fields.ts` (`date`, `uuid`, `decimal`) outside the barrel, `metricCellSchema`, the dashboard and SADDD remainder of `metric-contract.ts`.
- S1: `requestIdentity`, `requireScopedProject` and `Tx` in `apps/api/src/common`, `storedProjectStatuses` and `StoredProjectStatus` in `contracts/projects/project-requests.ts`, the projects layout (`contracts/projects`).
- S4 to S6: the S5, S6 and S4 api effects on the dashboards counts (Task 0 recounts them).

## Produces (names later plans consume)

- `apps/api/src/modules/analytics/` (`AnalyticsModule`, `AnalyticsController`, `AnalyticsService`, `AnalyticsInsightsController`, `AnalyticsInsightsService`, `analytics-export.helpers.ts`, `descriptive-analytics.helpers.ts`, `timeline-analytics.helpers.ts`, `analytics-insights.helpers.ts`) and `modules/dashboards/dashboards.helpers.ts` (`parseDashboardQuery`, `parseSadddQuery`, `suppressSmallCount`, `SMALL_CELL_THRESHOLD`).
- `role-overview-work.service.ts` and `role-overview-queues.service.ts` (eight exported readers) and `role-overview.helpers.ts`.
- `packages/shared/src/{metrics,contracts/dashboards,contracts/analytics,contracts/projects}` as listed in Task 5; no `monitoring/` folder; the same barrel names.
- `.tmp/s7b/{move-files,split-declarations,extract-methods,split-test-file,test-titles,same-lines,replace-exact,trim-imports,cycles}.mjs` (S7c reuses `move-files`, `split-declarations`, `same-lines` and `replace-exact`).
- After S7b, `git ls-files 'apps/api/src/*.dto.ts'` lists the five DTO files the S8 plan expects and only `authorized-data.controller.ts` and `users.controller.ts` hold `Application profile is required.'`.

## Global Constraints

- Behavior-preserving: no route, permission, status code, message, cache header, response body, audit row or exported shared name changes. Production code stays free of new dependencies.
- Direction (CR 3.1): `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; the web app imports only `@pathways/shared`, so no web file changes in this slice.
- Every moved line is checked with `.tmp/s7b/same-lines.mjs` (`lost 0`) before the plan relies on it; a script that finds a count or a hash it was not written for stops, and the implementer reports NEEDS_CONTEXT instead of adapting.
- Kebab-case file names that describe purpose (CR 3.5: `.helpers.ts`, `<name>.service.test.ts`, test files split as `<file>.<concern>.test.ts`); comments are one sentence, no emojis; docs prose has no em dashes and no double hyphens (fenced code is exempt); no customer personal data or credentials in any fixture.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s7b/trim-imports.mjs <files>` after moving and `pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals`: it may list only the two api baseline lines (`prisma/hosted-realistic-seed.ts` and `participants.service.ts`).
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after each and before every commit. Never run `pnpm build`, `pnpm --filter @pathways/api build` or `prisma generate`: they run `prisma generate`, which writes into the shared `node_modules`; the api build is `pnpm --filter @pathways/api exec nest build`.
- Run `.tmp/s7b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first and saves the route table); a build takes about three minutes, so give the command a ten minute timeout. A foreground command in this environment may be cut at two minutes: run long suites in the background and poll.
- Vitest runs from `apps/api` through `pnpm --filter`, so a file filter is the path below `apps/api`.
- Write the scripts and the JSON edit lists with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions. One-off scripts live in `.tmp/s7b/` (gitignored) and are never committed; a mutation run restores its file before the next step.
- Work in the repository root on `claude/modularization-s7b-9ept8o`, stacked on `claude/modularization-s7a-9ept8o` (S3b, S4a, S5a, S6a, S4b, S4c, S5b, S6b, S5c, S6c and S7a below it); no new worktree. All paths are relative to the repository root. Only the controller pushes branches. This slice opens no pull request and merges nothing into `dev`: it ships as part 3 of 3 stacked pull requests that the controller opens after the last slice, and no plan copy is removed in it.
- Commit with `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m` and the trailers on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Each bash block is run on its own and keeps no shell variables from the block before: a block that uses `$A`, `$C`, `$D` or `$F` sets it first.
- Known timing flakes of the full test run: the `ZodPipe` 5 s test, `beneficiary-detail-loader.test.tsx` and `imports.service.test.ts`; rerun the file alone, and rerun any run that ends without its summary line (a killed vitest process prints none).

## Review Focus

1. Every moved line is the same line: `same-lines` prints `lost 0` for Tasks 2, 3 and 5 and the token count for Task 4 (`same tokens: 3361`). The lines the splits add are listed in each task; read those lists, not the moved bodies.
2. Routes, permissions and messages (rulings 2 and 3): the route test passes unchanged at every commit, and the one inline lookup that became `requireScopedProject` is the insights one.
3. Module wiring (ruling 5): the wiring test fails when `imports: [DashboardsModule]` is removed, and `import loops: 0` after Task 2.
4. Pins before moves (ruling 9): the route and service call test, the insights lookup test, the header test, the row cap test, the status test and the barrel test are written against the old code in the step before the change, and each fails under its mutation; the wiring test and the SAD routing test fail under theirs.
5. Shared surface (ruling 4): the barrel exports the same names (`same exports`), `index.test.ts` pins one name of every moved module and the absence of the field schemas and the rounding helper, the titles lost 0, and `metric-fields.ts` and `metric-round.ts` are not in the barrel.
6. SAD routing (ruling 11): the determinism glob lists the five new locations and the test routes one file of each plus one project contract that must not match.
7. The records say what was and was not proven (ruling 10): the database replay, seeds, e2e and browser smoke are pending a local run or the final pull request.

## Risks

- The figures in this plan are those of a replay on the S7a tip (S4c, S5b, S5c and S6c are below it): shared 719, api 2617 passed, web 2290 tests, Middleware 103 kB (102 kB in another clone). Task 0 writes the real baselines to `.tmp/s7b/baseline.txt` as `B_api`, `B_shared` and `M0`; a different count is a different baseline, and the deltas of each task are the check.
- `move-files.mjs` rewrites relative and alias specifiers by exact text; a file that imports a moved module by a form the script does not know fails typecheck in Task 2 or Task 5, and the fix is one more entry in the JSON map.
- The Nest wiring test depends on the module's providers and imports; a later slice that adds a provider to `AnalyticsModule` outside `PrismaService` must import the module that provides it, which is what the test asks for.

## File map

- Api: `apps/api/src/modules/dashboards` (19 files before) loses `analytics.*`, `descriptive-analytics.*` and `dashboards.dto.ts` and gains `dashboards.helpers.ts`, `dashboards.routes.test.ts`, `role-overview-work.service.ts`, `role-overview-queues.service.ts`, `role-overview.helpers.ts` and `role-overview.rows.test.ts`; `apps/api/src/modules/analytics-insights` is merged into the new `apps/api/src/modules/analytics`.
- Shared: `packages/shared/src/monitoring` (15 files) is replaced by `metrics` (5 files), `contracts/dashboards`, `contracts/analytics`, `contracts/projects` (new files) and the barrel `index.ts` is re-ordered.
- Scripts and docs: `scripts/sad/check.ts`, `scripts/sad/check.test.ts`, `docs/sad-pathways.md`, the change record, audit, QAD, deferred features, SDD, index and activity log.

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s7b-analytics-dashboards.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s7b/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `cycles.mjs`, `replace-exact.mjs`, `trim-imports.mjs`, `same-lines.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S7a and the slices below it, and record the base**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s7b
git rev-parse HEAD > .tmp/s7b/base-sha
for b in s7a s6c s5c s6b s5b; do
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
echo "S6c record: $(grep -c '^S6c applied' $CR)"
echo "S7a record: $(grep -c '^S7a applied' $CR)"
test -f apps/web/src/lib/api/rules.ts && test -f apps/web/src/features/rules/index.ts && echo "S7a present"
test -f apps/api/src/modules/rules/rules.routes.test.ts && echo "S7a routes test present"
test -f apps/api/src/common/authz/request-identity.ts && test -f apps/api/src/common/authz/scoped-project.ts && test -f apps/api/src/common/prisma/transaction.ts && echo "S1 kernel present"
grep -q "export const storedProjectStatuses" packages/shared/src/contracts/projects/project-requests.ts && echo "S1 status list present"
test -f packages/shared/src/monitoring/metric-fields.ts && test -d packages/shared/src/contracts/indicators && echo "S3 shared layout present"
test -d apps/api/src/modules/print-pdf && echo "S6a present"
test -f packages/shared/src/rbac/report-kind-grants.ts && test -f apps/web/src/features/projects/budget/budget.reads.ts && test -f apps/web/src/features/projects/evaluation/hooks/use-evaluation-workspace.ts && echo "S6c present"
grep -c "'dashboards <-> reports'" apps/api/src/common/import-boundary.test.ts
test -f apps/api/src/modules/dashboards/dashboards.dto.ts && test -d apps/api/src/modules/analytics-insights && test -d packages/shared/src/monitoring && echo "S7b not started"
test -f docs/handoff/modularization-s7b-analytics-dashboards.md && echo "handoff copy present"
ls docs/superpowers/plans/
```

Expected: `git status --short` prints nothing. Then the branch name, one line per stacked branch, the three record counts, the marker lines, the cycle line (`1`, the one `dashboards <-> reports` entry of the S6 pair list), `S7b not started`, the handoff line and the plan listing:

```
claude/modularization-s7b-9ept8o
s7a branch is an ancestor of HEAD
s6c branch is an ancestor of HEAD
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S5c record: 1
S6c record: 1
S7a record: 1
S7a present
S7a routes test present
S1 kernel present
S1 status list present
S3 shared layout present
S6a present
S6c present
1
S7b not started
handoff copy present
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
```

A branch other than `claude/modularization-s7b-9ept8o`, a line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a record count of `0`, a missing marker line, a cycle count other than `1`, a missing `S7b not started` or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/` refs, so the check works with either. `.tmp/s7b/base-sha` is the head the branch has when Task 0 starts (the S7a tip, any docs-only commits after it and the controller commit that stages this plan), so it is the base of the SAD check in Task 8; never compare it with a fixed hash, and do not anchor any check on a hash or a line number of the activity log. Dependencies are already installed in the cloud container; do not run pnpm install. Write down the listed modularization plans; an executed plan that is still listed is reported, not removed here.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `.tmp/s7b/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s7b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s7b/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s7b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s7b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s7b/routes-$1.txt
grep Middleware .tmp/s7b/routes-$1.txt
```

`.tmp/s7b/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s7b/compare-routes.mjs`:

```js
// Prints the routes whose First Load JS differs between two saved next build route tables.
import { readFileSync } from 'node:fs'

const [before, after] = process.argv.slice(2)
const row = /^[\u250c\u251c\u2514] [\u0192\u25cb] (\S+)\s+\S+ \S+\s+([\d.]+) kB$/
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

`.tmp/s7b/cycles.mjs` prints the api module pairs that import each other and every loop of modules:

Create `.tmp/s7b/cycles.mjs`:

```js
// Prints the api module pairs that import each other and every group of modules that import one another in a loop.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const modules = path.resolve('apps/api/src/modules')
const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
const moduleOf = (file) => {
  const relative = path.relative(modules, file)
  return relative.startsWith('..') || !relative.includes(path.sep) ? null : relative.split(path.sep)[0]
}
const graph = new Map()
for (const file of walk(modules)) {
  const from = moduleOf(file)
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(pattern)) {
    if (!spec.startsWith('.')) continue
    const to = moduleOf(path.resolve(path.dirname(file), spec))
    if (to && to !== from) graph.set(from, (graph.get(from) ?? new Set()).add(to))
  }
}
// Strongly connected components by Tarjan's algorithm.
let counter = 0
const index = new Map()
const low = new Map()
const stack = []
const on = new Set()
const groups = []
function visit(node) {
  index.set(node, counter)
  low.set(node, counter++)
  stack.push(node)
  on.add(node)
  for (const next of graph.get(node) ?? []) {
    if (!index.has(next)) {
      visit(next)
      low.set(node, Math.min(low.get(node), low.get(next)))
    } else if (on.has(next)) low.set(node, Math.min(low.get(node), index.get(next)))
  }
  if (low.get(node) === index.get(node)) {
    const group = []
    let member
    do {
      member = stack.pop()
      on.delete(member)
      group.push(member)
    } while (member !== node)
    if (group.length > 1) groups.push(group.sort())
  }
}
for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node)
console.log(`import loops: ${groups.length}`)
for (const group of groups.sort()) console.log(group.join(' '))
```

`.tmp/s7b/replace-exact.mjs` applies a list of exact text replacements and fails unless each one matches the stated number of times:

Create `.tmp/s7b/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s7b/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s7b/trim-imports.mjs` removes imported names the file no longer uses, ignoring comments and quoted strings (Biome 1.9 does not flag unused imports):

Create `.tmp/s7b/trim-imports.mjs`:

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

`.tmp/s7b/same-lines.mjs` proves a move: it fails unless the listed files hold the same declaration lines (or, with `--tokens`, the same tokens) as at `HEAD`:

Create `.tmp/s7b/same-lines.mjs`:

```js
// Fails unless the listed files hold the same declaration lines as at HEAD, ignoring import statements, order, blank lines, indentation and the keywords export, private, async and function.
// With --tokens it compares the token multisets instead, ignoring comments, line breaks, commas and semicolons (for methods turned into functions and re-wrapped signatures).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2).filter((arg) => arg !== '--tokens')
const byToken = process.argv.includes('--tokens')
const renames = args.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = args.filter((arg) => !arg.includes('='))
const start = /^(?:describe\(|\/\/|\/\*\*|@|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|private\s)/
const keywords = /^(?:(?:export|private|async|function)\s+)+/

// Declaration lines after the import block, with renames applied and the leading keywords dropped.
const imports = /^import\s+(?:type\s+)?(?:[^'";]*?\s*from\s*)?'[^']+'\n?/gm
const tokenPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|[\w$]+|\S/g
const tokens = (text) =>
  renames
    .reduce((out, [from, to]) => out.replace(new RegExp(`\\b${from}\\b`, 'g'), to), text.replace(imports, ''))
    .match(tokenPattern)
    ?.filter((token) => !/^(?:\/\*|\/\/)/.test(token) && !/^(?:export|private|async|function|[,;])$/.test(token)) ?? []
const body = (text) => {
  if (byToken) return tokens(text)
  const lines = text.replace(imports, '').split('\n')
  const first = lines.findIndex((line) => start.test(line))
  return (first < 0 ? [] : lines.slice(first))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => renames.reduce((out, [from, to]) => out.replace(new RegExp(`\\b${from}\\b`, 'g'), to), line))
    .map((line) => line.replace(keywords, ''))
}
const head = (file) => {
  try {
    return execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(files.flatMap((file) => body(head(file))))
const after = count(files.flatMap((file) => (existsSync(file) ? body(readFileSync(file, 'utf8')) : [])))
const problems = []
for (const [line, n] of before)
  if ((after.get(line) ?? 0) !== n) problems.push(`before ${n}x, after ${after.get(line) ?? 0}x: ${line}`)
for (const [line, n] of after) if (!before.has(line)) problems.push(`after only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same ${byToken ? 'tokens' : 'lines'}: ${[...before.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s7b/build-routes.sh
pnpm --filter @pathways/shared build 2>&1 | tail -1
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s7b/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s7b/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s7b/m0
cat .tmp/s7b/m0
```

Expected: the summaries of the S7a tip, to write down as the baselines (`B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, `M0`); every later Expected is a delta from them, and the figures your run prints win over the ones below. Typecheck prints `Done` for the five projects. The counts depend on which slices sit below S7b on the branch (S4c, S5b, S5c and S6c carry tests too), so a different count is a different baseline, not a failure. `docs:check` ends with its baseline of 6 failures and 1 warning (the command exits 1). `Middleware` is `M0` (103 kB in this container, 102 kB in another clone of the same code: it varies by 1 kB between builds) and the last command prints it:

```
$ tsc -p tsconfig.build.json
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
apps/api test:  Test Files  154 passed | 10 skipped (164)
apps/api test:       Tests  2617 passed | 21 skipped (2638)
apps/web test:  Test Files  249 passed (249)
apps/web test:       Tests  2290 passed (2290)
      Tests  57 passed (57)

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      103 kB
103
```

Write the figures down with the Write tool as `.tmp/s7b/baseline.txt` (one line each: `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`), because later bash blocks keep no shell variables and every later count is `B_` plus a delta. The baseline build can take ten minutes; if it exits non-zero, copy `apps/web/.env.example` to `apps/web/.env.local` and retry.

```bash
A=apps/api/src/modules
S=packages/shared/src
git ls-files $A/dashboards | wc -l
git ls-files $A/dashboards | xargs cat | wc -l
git ls-files $A/analytics-insights | wc -l
git ls-files $A/analytics-insights | xargs cat | wc -l
git ls-files $S/monitoring | wc -l
git ls-files $S/monitoring | xargs cat | wc -l
wc -l $A/dashboards/{analytics.service,dashboards.service,role-overview.service,descriptive-analytics}.ts $A/analytics-insights/analytics-insights.service.ts $S/monitoring/descriptive-analytics.ts $S/monitoring/descriptive-analytics-views.test.ts
git ls-files 'apps/api/src/*.dto.ts'
git grep -l "Application profile is required\.'" -- apps/api/src ':!*.test.ts'
git grep -c "Prisma.TransactionClient" -- $A/dashboards $A/analytics-insights ':!*.test.ts'
git grep -n "'PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'" -- packages apps/api/src ':!*.test.ts' | cut -c1-100
git grep -n "'dashboards <-> reports'" -- apps/api/src
node .tmp/s7b/cycles.mjs
git grep -l "suppressSmallCount\|SMALL_CELL_THRESHOLD" -- apps/api/src
git grep -c "monitoring/" -- $S ':!'$S'/index.ts' | grep -v "^$S/monitoring/"
git grep -n "src/monitoring" -- scripts docs/sad-pathways.md | cut -c1-110
git grep -c "c8-runtime.local" -- infra scripts apps/api | head
git hash-object $A/dashboards/dashboards.service.ts $A/dashboards/analytics.service.ts $A/dashboards/descriptive-analytics.ts $A/dashboards/role-overview.service.ts $A/dashboards/dashboards.dto.ts $A/analytics-insights/analytics-insights.service.ts $S/monitoring/descriptive-analytics.ts $S/monitoring/metric-contract.ts | cut -c1-8
```

Expected: the counts the plan rests on (a different number means a file changed since planning: stop and report NEEDS_CONTEXT). In order: 19 files and 4752 lines in `modules/dashboards`, 5 and 756 in `modules/analytics-insights`, 15 and 2911 in `monitoring/`, the line counts of the six large files, the six DTO files, the seven controllers that hold the identity message (S8 expects only two of them to keep it), the 13 `Prisma.TransactionClient` annotations (9, 3 and 1), the five stored status copies (the fifth is the type-only union in the api timeline builder), the one `dashboards <-> reports` pair, `import loops: 1` with its loop, the four files that use the small-cell helpers, the 6 shared files outside `monitoring/` that import it, the two places that name `src/monitoring` (`check.ts` line 80, `docs/sad-pathways.md` line 40), the two infra scripts that name `c8-runtime.local` (so it keeps its name), and the hashes of the eight files (the hashes depend on the base tree and are informational):

```
19
4752
5
756
15
2911
   515 apps/api/src/modules/dashboards/analytics.service.ts
   270 apps/api/src/modules/dashboards/dashboards.service.ts
   545 apps/api/src/modules/dashboards/role-overview.service.ts
   435 apps/api/src/modules/dashboards/descriptive-analytics.ts
   285 apps/api/src/modules/analytics-insights/analytics-insights.service.ts
   558 packages/shared/src/monitoring/descriptive-analytics.ts
   797 packages/shared/src/monitoring/descriptive-analytics-views.test.ts
  3405 total
apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts
apps/api/src/modules/auth/signin-lockout.dto.ts
apps/api/src/modules/dashboards/dashboards.dto.ts
apps/api/src/modules/profile/profile.dto.ts
apps/api/src/modules/public/public.dto.ts
apps/api/src/modules/users/users.dto.ts
apps/api/src/common/authz/request-identity.ts
apps/api/src/modules/analytics-insights/analytics-insights.controller.ts
apps/api/src/modules/auth/authorized-data.controller.ts
apps/api/src/modules/dashboards/action-counts.controller.ts
apps/api/src/modules/dashboards/analytics.controller.ts
apps/api/src/modules/dashboards/dashboards.controller.ts
apps/api/src/modules/dashboards/role-overview.controller.ts
apps/api/src/modules/users/users.controller.ts
apps/api/src/modules/analytics-insights/analytics-insights.service.ts:1
apps/api/src/modules/dashboards/analytics.service.ts:9
apps/api/src/modules/dashboards/dashboards.service.ts:3
packages/shared/src/monitoring/role-overview.ts:23:    status: z.enum(['PLANNED', 'ONGOING', 'COMPLE
packages/shared/src/rules/rule-contract.ts:249:      projectStatus: z.enum(['PLANNED', 'ONGOING', 'C
packages/shared/src/rules/rule-metrics.ts:188:    projectStatus: z.enum(['PLANNED', 'ONGOING', 'COMP
packages/shared/src/rules/rule-metrics.ts:416:  projectStatus: z.enum(['PLANNED', 'ONGOING', 'COMPLE
apps/api/src/common/import-boundary.test.ts:162:      'dashboards <-> reports',
import loops: 1
dashboards evaluations projects reports
apps/api/src/modules/dashboards/analytics.service.test.ts
apps/api/src/modules/dashboards/descriptive-analytics.ts
apps/api/src/modules/evaluations/evaluation-metrics.service.ts
apps/api/src/modules/projects/project-overview-metrics.service.ts
packages/shared/src/contracts/activities/activity-extension-response.ts:1
packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts:1
packages/shared/src/contracts/indicators/indicator-requests.ts:3
packages/shared/src/contracts/indicators/indicator-responses.ts:3
packages/shared/src/rules/rule-contract.ts:1
packages/shared/src/rules/rule-metrics.ts:2
docs/sad-pathways.md:40:| rule-engine-determinism-checker | `packages/shared/src/monitoring/**/*.ts`, `package
scripts/sad/check.ts:80:      'packages/shared/src/monitoring/**/*.ts',
infra/supabase/phase6/Invoke-RuntimeVitest.ps1:1
infra/supabase/phase6/Replay-Local.ps1:1
991ddbd8
497a3f1d
b3d2a304
f0d599aa
3381d4a7
9020b5c5
86bb0f8c
b91a628a
```

- [ ] **Step 4: Add the plan and commit**

Copy this plan to `docs/superpowers/plans` and add its row after the S7 plan row of section 1.6 of `docs/index.md`. The handoff copy and its index row stay, and so do the `docs/superpowers/plans` copies of earlier slices: the controller removes executed plan copies after the final merge (ruling 10), not this slice.

```bash
D=$(date +%F)
cp docs/handoff/modularization-s7b-analytics-dashboards.md docs/superpowers/plans/$D-modularization-s7b-analytics-dashboards.md
ROW="| [S7b analytics and dashboards api plan](superpowers/plans/$D-modularization-s7b-analytics-dashboards.md) | $D-modularization-s7b-analytics-dashboards.md | $D | S7b of the codebase modularization: analytics module, role overview and descriptive analytics splits, shared monitoring folder dissolved, stored project status list; S7c outline | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s7-analytics-rules" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: add the S7b analytics and dashboards api plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -4
```

Expected: one index row added after the S7 row, the same 6 baseline docs failures and 1 warning (pnpm adds its exit line), and a commit of two files (the plan copy and the index) with its stat. `YYYY-MM-DD` is the day Task 0 runs and `<n>` is the line count of this plan (one more in the total, for the index row):

```
+| [S7b analytics and dashboards api plan](superpowers/plans/YYYY-MM-DD-modularization-s7b-analytics-dashboards.md) | YYYY-MM-DD-modularizat

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S7b analytics and dashboards api plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/YYYY-MM-DD-modularization-s7b-analytics-dashboards.md

 docs/index.md                                      |    1 +
 ...-modularization-s7b-analytics-dashboards.md | <n> ++++++++++++++++++++
 2 files changed, <n> insertions(+)
```

---

### Task 1: Route table and kernel adoption

**Files:**
- Create: `apps/api/src/modules/dashboards/dashboards.routes.test.ts`
- Create (gitignored): `.tmp/s7b/task1-edits.json`
- Modify: `apps/api/src/modules/dashboards/{dashboards,analytics,action-counts,role-overview}.controller.ts`, `apps/api/src/modules/dashboards/{analytics,dashboards}.service.ts`, `apps/api/src/modules/analytics-insights/analytics-insights.{controller,service}.ts`

This task changes no route, permission, status code or message (rulings 2 and 3). The route test is written and run against the unchanged controllers first, so it pins what must stay.

- [ ] **Step 1: Pin the 11 routes, the registration of both modules, the 403 without identity and the service call of each handler**

`dashboards.routes.test.ts` reads the Nest metadata of the controllers that `DashboardsModule` and `AnalyticsInsightsModule` register (the pattern of `rules.routes.test.ts`) and pins four things. First, one sorted line per route with method, full path, permission and `Cache-Control` header. Second, that `AppModule` imports both modules, because nothing else pins that the routes are registered at all (the module move of Task 2 rewrites that import). Third, one call per handler without an attached identity, which must throw `ForbiddenException` with the message `Application profile is required.` (a bare `Error` with the same message would change the status code, so both are asserted); a Proxy stands in for the service, so a handler that reached it would return `service reached` instead of throwing. Fourth, one call per handler with an identity, a query and a response object, which must reach the service method of the same name with the identity first and the other arguments in order (a swapped pair of arguments or a handler wired to the wrong method fails it). Create the file with the Write tool:

Create `apps/api/src/modules/dashboards/dashboards.routes.test.ts`:

```ts
import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { AppModule } from '../../app.module'
import { AnalyticsInsightsModule } from '../analytics-insights/analytics-insights.module'
import { DashboardsModule } from './dashboards.module'

type Handler = (request: object, ...args: unknown[]) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => [
  ...Reflect.getMetadata('controllers', DashboardsModule),
  ...Reflect.getMetadata('controllers', AnalyticsInsightsModule),
]
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor')

// One sorted line per route: method, full path, permission and Cache-Control header.
function routeTable(): string[] {
  return controllers()
    .flatMap((controller) => {
      const base = Reflect.getMetadata(PATH_METADATA, controller)
      return handlers(controller).map((name) => {
        const handler = (controller.prototype as Record<string, Handler>)[name]
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)]
        const route = Reflect.getMetadata(PATH_METADATA, handler)
        const headers: Array<{ name: string; value: string }> =
          Reflect.getMetadata(HEADERS_METADATA, handler) ?? []
        const cache = headers.find((header) => header.name === 'Cache-Control')?.value
        const path = route === '/' ? `/${base}` : `/${base}/${route}`
        return `${method} ${path} ${Reflect.getMetadata(PERMISSION_KEY, handler)} ${cache}`
      })
    })
    .sort()
}

describe('dashboards and analytics routes', () => {
  it('registers every route with its permission and no-store header', () => {
    expect(routeTable()).toEqual([
      'GET /analytics/descriptive analytics.descriptive.read private, no-store',
      'GET /analytics/descriptive/export analytics.export private, no-store',
      'GET /analytics/descriptive/export/preview analytics.export private, no-store',
      'GET /analytics/insights/budget analytics.descriptive.read private, no-store',
      'GET /analytics/insights/indicator-trends analytics.descriptive.read private, no-store',
      'GET /analytics/insights/participation analytics.descriptive.read private, no-store',
      'GET /dashboards/action-counts projects.read private, no-store',
      'GET /dashboards/home projects.read private, no-store',
      'GET /dashboards/monitoring monitoring.read private, no-store',
      'GET /dashboards/role-overview projects.read private, no-store',
      'GET /dashboards/saddd analytics.saddd.read private, no-store',
    ])
  })

  it('registers the dashboards and insights modules in the application module', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', AppModule)
    expect(imports).toContain(DashboardsModule)
    expect(imports).toContain(AnalyticsInsightsModule)
  })

  it('answers 403 on every route when no application identity is attached', async () => {
    const service = new Proxy({}, { get: () => () => 'service reached' })
    const calls = controllers().flatMap((controller) => {
      const instance = new controller(service)
      return handlers(controller).map(
        (name) => () => Promise.resolve().then(() => instance[name]({ headers: {} })),
      )
    })
    expect(calls).toHaveLength(11)
    for (const call of calls) {
      await expect(call()).rejects.toThrow(ForbiddenException)
      await expect(call()).rejects.toThrow('Application profile is required.')
    }
  })

  it('calls the service method of each handler with the identity first and the other arguments in order', async () => {
    const user = { id: 'identity' }
    const res = { setHeader: () => undefined }
    const called: string[] = []
    for (const controller of controllers()) {
      const service = new Proxy(
        {},
        {
          get:
            (_target, method: string) =>
            (...args: unknown[]) => {
              called.push(
                `${controller.name}.${method}(${args.map((arg) => (arg === user ? 'user' : arg)).join(', ')})`,
              )
              return { contentType: 'text/csv', fileName: 'export.csv', bytes: new Uint8Array() }
            },
        },
      )
      const instance = new controller(service)
      for (const name of handlers(controller)) await instance[name]({ user }, 'query', res)
    }
    expect(called.sort()).toEqual([
      'ActionCountsController.read(user)',
      'AnalyticsController.descriptive(user, query)',
      'AnalyticsController.export(user, query)',
      'AnalyticsController.exportPreview(user, query)',
      'AnalyticsInsightsController.budget(user, query)',
      'AnalyticsInsightsController.indicatorTrends(user, query)',
      'AnalyticsInsightsController.participation(user, query)',
      'DashboardsController.home(user, query)',
      'DashboardsController.monitoring(user, query)',
      'DashboardsController.saddd(user, query)',
      'RoleOverviewController.read(user)',
    ])
  })
})
```

```bash
pnpm exec biome check --write apps/api/src/modules/dashboards/dashboards.routes.test.ts | tail -1
pnpm --filter @pathways/api exec vitest run src/modules/dashboards/dashboards.routes.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |✓|×"
```

Expected: Biome finds nothing to fix, and all four cases pass against the unchanged controllers (the route table of 11 routes, the module registration, the 403 on every handler and the service call of every handler):

```
Checked 1 file in <ms>. No fixes applied.
 ✓ src/modules/dashboards/dashboards.routes.test.ts (4 tests) <ms>
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] **Step 1b: Pin the insights project lookup**

`analytics-insights.test.ts` asserts only that an out-of-scope project answers `NotFoundException`, not the text `Project unavailable.` that Step 2 will take from `requireScopedProject`, and no case sends the project id in capitals or looks at the `findFirst` arguments. `.tmp/s7b/task1-pins.json` adds the message to the 404 case and one case for the lookup (the id the zod schema lowercases, the single call and the id-only select). Create it with the Write tool:

Create `.tmp/s7b/task1-pins.json`:

```json
[
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.test.ts",
  "    const { service, tx } = harness()\n    await expect(\n      service.indicatorTrends(actor('MONITORING_AND_EVALUATION_OFFICER'), { projectId: projectB }),\n    ).rejects.toBeInstanceOf(NotFoundException)\n    expect(tx.auditLog.create).not.toHaveBeenCalled()\n  })\n",
  "    const { service, tx } = harness()\n    const call = service.indicatorTrends(actor('MONITORING_AND_EVALUATION_OFFICER'), {\n      projectId: projectB,\n    })\n    await expect(call).rejects.toBeInstanceOf(NotFoundException)\n    await expect(call).rejects.toThrow('Project unavailable.')\n    expect(tx.auditLog.create).not.toHaveBeenCalled()\n  })\n\n  it('looks the project up once by its lowercase id, selecting only the id', async () => {\n    const { service, tx } = harness()\n    await service.participation(actor('MONITORING_AND_EVALUATION_OFFICER'), {\n      projectId: projectA.toUpperCase(),\n    })\n    expect(tx.project.findFirst).toHaveBeenCalledTimes(1)\n    expect(tx.project.findFirst).toHaveBeenCalledWith({\n      where: { AND: [expect.anything(), { id: projectA }] },\n      select: { id: true },\n    })\n  })\n",
  1
 ]
]
```

The mutation changes the 404 text of the insights service, which the unchanged code throws inline, and must fail the 404 case only:

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task1-pins.json
F=apps/api/src/modules/analytics-insights/analytics-insights.service.ts
pnpm exec biome check --write apps/api/src/modules/analytics-insights/analytics-insights.test.ts | tail -1
pnpm --filter @pathways/api exec vitest run src/modules/analytics-insights 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
cp $F .tmp/s7b/ais.bak
sed -i "s/new NotFoundException('Project unavailable.')/new NotFoundException('Project missing.')/" $F
grep -c "Project missing" $F
pnpm --filter @pathways/api exec vitest run src/modules/analytics-insights 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/ais.bak $F
git status --short | cut -c1-100
```

Expected: one replacement, the insights suite passes with its new case, the mutated text fails the 404 case and nothing else, and the service is restored (only the test file differs, next to the route test):

```
1 replacements in 1 files
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  20 passed (20)
1
   × AnalyticsInsightsService > returns 404 for an out-of-scope project and writes no audit row <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 19 passed (20)
 M apps/api/src/modules/analytics-insights/analytics-insights.test.ts
?? apps/api/src/modules/dashboards/dashboards.routes.test.ts
```

- [ ] **Step 2: Adopt `requestIdentity`, `Tx` and `requireScopedProject`**

`.tmp/s7b/task1-edits.json` lists 26 exact replacements (the list form `[file, from, to, count]` that `replace-exact.mjs` applies, failing on any other count). Per file: the three controllers with a private `identity` function drop it and call `requestIdentity`; the two with an inline check (`action-counts`, `role-overview`) call `requestIdentity` in place of it; the 13 `Prisma.TransactionClient` annotations (9, 3 and 1) become `Tx`; the insights project lookup becomes `requireScopedProject(tx, actor, query.projectId)`. Create the file with the Write tool:

Create `.tmp/s7b/task1-edits.json`:

```json
[
 [
  "apps/api/src/modules/dashboards/dashboards.controller.ts",
  "import { Controller, ForbiddenException, Get, Header, Inject, Query, Req } from '@nestjs/common'",
  "import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common'",
  1
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.controller.ts",
  "function identity(request: AuthenticatedRequest) {\n  if (!request.user) throw new ForbiddenException('Application profile is required.')\n  return request.user\n}\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.controller.ts",
  "identity(request)",
  "requestIdentity(request)",
  3
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.controller.ts",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
  1
 ],
 [
  "apps/api/src/modules/dashboards/analytics.controller.ts",
  "  ForbiddenException,\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/dashboards/analytics.controller.ts",
  "function identity(request: AuthenticatedRequest) {\n  if (!request.user) throw new ForbiddenException('Application profile is required.')\n  return request.user\n}\n\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/dashboards/analytics.controller.ts",
  "identity(request)",
  "requestIdentity(request)",
  3
 ],
 [
  "apps/api/src/modules/dashboards/analytics.controller.ts",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
  1
 ],
 [
  "apps/api/src/modules/dashboards/action-counts.controller.ts",
  "import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'",
  "import { Controller, Get, Header, Inject, Req } from '@nestjs/common'",
  1
 ],
 [
  "apps/api/src/modules/dashboards/action-counts.controller.ts",
  "    if (!request.user) throw new ForbiddenException('Application profile is required.')\n    return this.service.read(request.user)",
  "    return this.service.read(requestIdentity(request))",
  1
 ],
 [
  "apps/api/src/modules/dashboards/action-counts.controller.ts",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
  1
 ],
 [
  "apps/api/src/modules/dashboards/role-overview.controller.ts",
  "import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'",
  "import { Controller, Get, Header, Inject, Req } from '@nestjs/common'",
  1
 ],
 [
  "apps/api/src/modules/dashboards/role-overview.controller.ts",
  "    if (!request.user) throw new ForbiddenException('Application profile is required.')\n    return this.service.read(request.user)",
  "    return this.service.read(requestIdentity(request))",
  1
 ],
 [
  "apps/api/src/modules/dashboards/role-overview.controller.ts",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.controller.ts",
  "import { Controller, ForbiddenException, Get, Header, Inject, Query, Req } from '@nestjs/common'",
  "import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common'",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.controller.ts",
  "function identity(request: AuthenticatedRequest) {\n  if (!request.user) throw new ForbiddenException('Application profile is required.')\n  return request.user\n}\n\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.controller.ts",
  "identity(request)",
  "requestIdentity(request)",
  3
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.controller.ts",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
  1
 ],
 [
  "apps/api/src/modules/dashboards/analytics.service.ts",
  "Prisma.TransactionClient",
  "Tx",
  9
 ],
 [
  "apps/api/src/modules/dashboards/analytics.service.ts",
  "import { requireScopedProjectRow } from '../../common/authz/scoped-project'\n",
  "import { requireScopedProjectRow } from '../../common/authz/scoped-project'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.service.ts",
  "Prisma.TransactionClient",
  "Tx",
  3
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.service.ts",
  "import { projectScope } from '../../common/authz/project-scope'\n",
  "import { projectScope } from '../../common/authz/project-scope'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.service.ts",
  "Prisma.TransactionClient",
  "Tx",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.service.ts",
  "import type { Prisma } from '@prisma/client'\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.service.ts",
  "import { projectScope } from '../../common/authz/project-scope'\n",
  "import { requireScopedProject } from '../../common/authz/scoped-project'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/analytics-insights/analytics-insights.service.ts",
  "          const project = await tx.project.findFirst({\n            where: { AND: [projectScope(actor), { id: query.projectId }] },\n            select: { id: true },\n          })\n          if (!project) throw new NotFoundException('Project unavailable.')\n",
  "          await requireScopedProject(tx, actor, query.projectId)\n",
  1
 ]
]
```

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task1-edits.json
D=apps/api/src/modules/dashboards; I=apps/api/src/modules/analytics-insights
node .tmp/s7b/trim-imports.mjs $D/*.ts $I/*.ts | grep -v "removed nothing"
pnpm exec biome check --write $D $I | tail -1
git grep -n "Prisma.TransactionClient\|function identity\|Application profile is required" -- $D $I ':!*.test.ts'
git grep -n "requireScopedProject\|Project unavailable\|Monitoring scope unavailable" -- $D $I ':!*.test.ts' | cut -c1-110
pnpm --filter @pathways/api exec vitest run src/modules/dashboards src/modules/analytics-insights src/common 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
```

Expected: 26 replacements in 8 files, Biome fixes 4 files, the first grep prints nothing, the second lists the insights call, the two `requireScopedProjectRow` calls of the analytics service and the two inline SADDD lookups of the dashboards service, the 251 tests of the three folders pass (2 skipped), and the two baseline unused-locals lines remain:

```
26 replacements in 8 files
Checked 25 files in <ms>. Fixed 4 files.
apps/api/src/modules/analytics-insights/analytics-insights.service.ts:23:import { requireScopedProject } from 
apps/api/src/modules/analytics-insights/analytics-insights.service.ts:88:          await requireScopedProject(
apps/api/src/modules/dashboards/analytics.service.ts:28:import { requireScopedProjectRow } from '../../common/
apps/api/src/modules/dashboards/analytics.service.ts:263:    const project = await requireScopedProjectRow(tx,
apps/api/src/modules/dashboards/analytics.service.ts:300:    const project = await requireScopedProjectRow(tx,
apps/api/src/modules/dashboards/dashboards.service.ts:66:      throw new NotFoundException('Monitoring scope u
apps/api/src/modules/dashboards/dashboards.service.ts:186:        throw new NotFoundException('Monitoring scop
 Test Files  21 passed | 2 skipped (23)
      Tests  251 passed | 2 skipped (253)
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
```

The insights lookup is behavior-identical (ruling 3): `requireScopedProject` runs the same `findFirst` over `projectScope(actor)` and the id with `select: { id: true }` and throws `NotFoundException('Project unavailable.')`; it lowercases the id and the insights zod schema already lowercases it, and the zod `uuid()` accepts only ids the helper's pattern accepts. The first grep prints nothing; the second lists the new `requireScopedProject` call and the lookups that stay inline, the SADDD lookups of `dashboards.service.ts` and `analytics.service.ts` with their own 404 `Monitoring scope unavailable.`, and `sadddReleasable`, which keeps returning false (outline). The two `--noUnusedLocals` lines are the api baseline (`hosted-realistic-seed.ts` and `participants.service.ts`).

- [ ] **Step 3: Prove the route tests fail when a controller loses its identity check or swaps its arguments, then commit**

The first mutation replaces the `requestIdentity` call of the role overview controller with the unchecked user and must fail the 403 case; the second swaps the arguments of the SADDD handler and must fail the service call case:

```bash
F=apps/api/src/modules/dashboards/role-overview.controller.ts
cp $F .tmp/s7b/ro.bak
sed -i "s/return this.service.read(requestIdentity(request))/return this.service.read(request.user as never)/" $F
grep -n "service.read" $F
pnpm --filter @pathways/api exec vitest run src/modules/dashboards/dashboards.routes.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/ro.bak $F
F=apps/api/src/modules/dashboards/dashboards.controller.ts
cp $F .tmp/s7b/dc.bak
sed -i "s/this.service.saddd(requestIdentity(request), query)/this.service.saddd(query, requestIdentity(request))/" $F
grep -n "service.saddd" $F
pnpm --filter @pathways/api exec vitest run src/modules/dashboards/dashboards.routes.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/dc.bak $F
git status --short | cut -c1-90
```

Expected: the first mutated handler line and one failing test (the 403 case) out of four, the second mutated line and one failing test (the service call case) out of four, and a working tree that holds only the task edits (both controllers are restored):

```
15:    return this.service.read(request.user as never)
   × dashboards and analytics routes > answers 403 on every route when no application identity is attached <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 3 passed (4)
25:    return this.service.saddd(query, requestIdentity(request))
   × dashboards and analytics routes > calls the service method of each handler with the identity first and the other arguments in order <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 3 passed (4)
 M apps/api/src/modules/analytics-insights/analytics-insights.controller.ts
 M apps/api/src/modules/analytics-insights/analytics-insights.service.ts
 M apps/api/src/modules/analytics-insights/analytics-insights.test.ts
 M apps/api/src/modules/dashboards/action-counts.controller.ts
 M apps/api/src/modules/dashboards/analytics.controller.ts
 M apps/api/src/modules/dashboards/analytics.service.ts
 M apps/api/src/modules/dashboards/dashboards.controller.ts
 M apps/api/src/modules/dashboards/dashboards.service.ts
 M apps/api/src/modules/dashboards/role-overview.controller.ts
?? apps/api/src/modules/dashboards/dashboards.routes.test.ts
```

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/api test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): use requestIdentity, Tx and requireScopedProject in the dashboards and analytics modules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -14
```

Expected: typecheck `Done` for the five projects, lint clean, api `B_api` plus 5 tests (4 route cases and the insights lookup case), and a commit of 10 files (the route test and 9 edited files):

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1489 files in <ms>. No fixes applied.
 Test Files  155 passed | 10 skipped (165)
      Tests  2622 passed | 21 skipped (2643)
[<branch> <sha>] refactor(api): use requestIdentity, Tx and requireScopedProject in the dashboards and analytics modules
 10 files changed, 169 insertions(+), 89 deletions(-)
 create mode 100644 apps/api/src/modules/dashboards/dashboards.routes.test.ts
<sha> refactor(api): use requestIdentity, Tx and requireScopedProject in the dashboards and analytics modules

 .../analytics-insights.controller.ts               |  14 +--
 .../analytics-insights.service.ts                  |  16 +--
 .../analytics-insights/analytics-insights.test.ts  |  20 +++-
 .../modules/dashboards/action-counts.controller.ts |   6 +-
 .../src/modules/dashboards/analytics.controller.ts |  24 +----
 .../src/modules/dashboards/analytics.service.ts    |  31 ++----
 .../modules/dashboards/dashboards.controller.ts    |  13 +--
 .../modules/dashboards/dashboards.routes.test.ts   | 113 +++++++++++++++++++++
 .../src/modules/dashboards/dashboards.service.ts   |  15 +--
 .../modules/dashboards/role-overview.controller.ts |   6 +-
 10 files changed, 169 insertions(+), 89 deletions(-)
```

---

### Task 2: `modules/analytics` and the S6 module pair

**Files:**
- Create (gitignored): `.tmp/s7b/move-files.mjs`, `split-declarations.mjs`, `dashboards-helpers-move.json`, `small-count-move.json`, `analytics-move.json`, `task2-edits.json`
- Create: `apps/api/src/modules/analytics/analytics.module.test.ts`
- Rename: `modules/dashboards/dashboards.dto.ts` to `dashboards.helpers.ts`; the analytics controller, service, descriptive analytics file and their tests from `modules/dashboards` to `modules/analytics`; the five `modules/analytics-insights` files into `modules/analytics`
- Modify: `modules/analytics/analytics.module.ts` (the moved insights module), `modules/dashboards/dashboards.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/import-boundary.test.ts`, `apps/api/src/modules/dashboards/dashboards.routes.test.ts`, the importers of the moved files

- [ ] **Step 1: Turn the DTO file into `dashboards.helpers.ts` and give it the small-cell helpers**

`dashboards.dto.ts` holds two zod parse helpers and no class-validator DTO (CR 3.2: no `*.dto.ts`), so it is renamed and joined by `SMALL_CELL_THRESHOLD` and `suppressSmallCount` from `descriptive-analytics.ts` (pure, no injection). `evaluations/evaluation-metrics.service.ts` and `projects/project-overview-metrics.service.ts` import them from there today; they import the helpers file afterwards, which removes the evaluations and projects edges into the file that moves next. Two scripts do the work, both created with the Write tool. `move-files.mjs` runs `git mv` and rewrites every import, re-export, dynamic import and `vi.mock` specifier the moves change (alias form `@app/` included); `split-declarations.mjs` moves named top-level declarations verbatim between api or shared files, merges and prunes the imports of the files it touches, repoints importers of the moved names, and exports a name only when a sibling that stays behind uses it:

Create `.tmp/s7b/move-files.mjs`:

```js
// Moves files with git mv and rewrites every import, re-export, dynamic import and vi.mock specifier that the moves change.
// Usage: node move-files.mjs <source root> <alias prefix or -> <map file> <scan root>...  (the map is {"old/path.ts": "new/path.ts"} relative to the source root)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [rootArg, aliasArg, mapFile, ...scanRoots] = process.argv.slice(2)
const root = path.resolve(rootArg)
const alias = aliasArg === '-' ? null : aliasArg
const files = JSON.parse(readFileSync(mapFile, 'utf8'))
const strip = (file) => file.replace(/\.tsx?$/, '')
const moves = new Map(Object.entries(files).map(([from, to]) => [strip(path.join(root, from)), strip(path.join(root, to))]))
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'dist'].includes(entry.name) ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// The absolute module path a specifier names, or null for a package.
const target = (file, spec) => {
  if (spec.startsWith('.')) return path.resolve(path.dirname(file), spec)
  if (alias && spec.startsWith(alias)) return path.join(root, spec.slice(alias.length))
  return null
}

let total = 0
for (const file of scanRoots.flatMap((scan) => walk(path.resolve(scan)))) {
  const moved = moves.get(strip(file))
  const importer = moved ? `${moved}${path.extname(file)}` : file
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const module = target(file, spec)
    if (module === null) return whole
    const next = moves.get(module) ?? module
    if (next === module && !moved) return whole
    let replacement
    if (spec.startsWith('.')) {
      const relative = path.relative(path.dirname(importer), next).split(path.sep).join('/')
      replacement = relative.startsWith('.') ? relative : `./${relative}`
    } else replacement = alias + path.relative(root, next).split(path.sep).join('/')
    if (replacement === spec) return whole
    count++
    return `${lead}${quote}${replacement}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${path.relative(process.cwd(), file)}: ${count}`)
}
for (const [from, to] of Object.entries(files)) {
  const destination = path.join(root, to)
  if (existsSync(destination)) throw new Error(`${to} already exists`)
  mkdirSync(path.dirname(destination), { recursive: true })
  execFileSync('git', ['mv', path.join(root, from), destination])
}
console.log(`total: ${total}; moved: ${Object.keys(files).length}`)
```

Create `.tmp/s7b/split-declarations.mjs`:

```js
// Moves named top-level declarations verbatim between api or shared modules and rewrites every import the moves affect.
// Usage: node split-declarations.mjs <source root> <plan file>  (plan entries are {"from", "to", "names", "copy"?} with paths relative to the root; a copy leaves the declaration in its source)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [rootArg, planFile] = process.argv.slice(2)
const root = path.resolve(rootArg)
const moves = JSON.parse(readFileSync(planFile, 'utf8'))
const declaration =
  /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|@|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/
const leading = /^(?:\/\/|\/\*\*| \*|@)/
const importPattern = /^import\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'\n?/gm
const mockPattern = /vi\.(?:mock|doMock)\(\s*'([^']+)'/g

const strip = (file) => file.replace(/\.tsx?$/, '')
const rel = (file) => path.relative(root, file).split(path.sep).join('/')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'dist'].includes(entry.name) ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// A local module is written ~/<root-relative path>; a package keeps its specifier.
const resolve = (file, spec) =>
  spec.startsWith('.')
    ? `~/${rel(path.resolve(path.dirname(path.join(root, file)), spec))}`
    : spec.startsWith('@app/')
      ? `~/${spec.slice(5)}`
      : spec
const specifier = (file, module) => {
  if (!module.startsWith('~/')) return module
  const relative = path.posix.relative(path.posix.dirname(file), module.slice(2))
  return relative.startsWith('.') ? relative : `./${relative}`
}
const items = (typeOnly, list) =>
  list
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (typeOnly && !item.startsWith('type ') ? `type ${item}` : item))
const local = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)
const imported = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]

// Splits a file into its import statements and top-level declaration chunks.
function parse(file) {
  const full = path.join(root, file)
  const lines = existsSync(full) ? readFileSync(full, 'utf8').split('\n') : []
  let index = lines.findIndex((line) => starts.test(line))
  if (index < 0) index = lines.length
  const head = `${lines.slice(0, index).join('\n')}\n`
  const imports = [...head.matchAll(importPattern)].map(([, typeOnly, clause, spec]) => ({
    module: resolve(file, spec),
    fallback: clause.replace(/\{[^}]*\}/, '').replace(/,\s*$/, '').trim() || null,
    items: items(typeOnly, /\{([^}]*)\}/.exec(clause)?.[1] ?? ''),
  }))
  const rest = head.replace(importPattern, '').trim()
  if (rest) throw new Error(`${file}: unexpected header text ${rest.slice(0, 60)}`)
  const chunks = []
  let pending = []
  for (; index < lines.length; index++) {
    const line = lines[index]
    const name = declaration.exec(line)?.[1]
    if (name) {
      chunks.push({ name, origin: file, lines: [...pending, line] })
      pending = []
    } else if (line === '' || leading.test(line)) pending.push(line)
    else {
      chunks.at(-1).lines.push(...pending, line)
      pending = []
    }
  }
  return { imports, chunks, created: !existsSync(full) }
}

// Code of a chunk with comments dropped and quoted strings blanked, so names inside them do not count.
const code = (chunk) =>
  chunk.lines
    .filter((line) => !/^\s*(?:\/\/|\/\*\*|\*)/.test(line))
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
const uses = (text, name) => new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\b`).test(text)
const copy = (imports) => imports.map((entry) => ({ ...entry, items: [...entry.items] }))

// Load every source and target, then move chunks in plan order.
const files = new Map()
const load = (file) => {
  if (!files.has(file)) files.set(file, parse(file))
  return files.get(file)
}
const declared = new Map()
const owner = new Map()
for (const { from, to, names, copy: keep } of moves) {
  const source = load(from)
  const target = load(to)
  if (!declared.has(from)) declared.set(from, new Set(source.chunks.map((chunk) => chunk.name)))
  for (const name of names) {
    const chunk = source.chunks.find((item) => item.name === name)
    if (!chunk) throw new Error(`${from} does not declare ${name}`)
    if (keep) target.chunks.push({ ...chunk, lines: [...chunk.lines] })
    else {
      source.chunks.splice(source.chunks.indexOf(chunk), 1)
      target.chunks.push(chunk)
      owner.set(`~/${strip(from)}#${name}`, `~/${strip(to)}`)
    }
  }
  target.imports.push(...copy(source.imports))
}

// A chunk now apart from a former sibling it uses imports that sibling, which becomes exported.
for (const [file, data] of files)
  for (const chunk of data.chunks)
    for (const name of declared.get(chunk.origin) ?? []) {
      if (name === chunk.name || !uses(code(chunk), name)) continue
      if (data.chunks.some((item) => item.name === name && item.origin === chunk.origin)) continue
      const [home, holder] = [...files].find(([, other]) =>
        other.chunks.some((item) => item.name === name && item.origin === chunk.origin),
      )
      if (home === file) continue
      const sibling = holder.chunks.find((item) => item.name === name && item.origin === chunk.origin)
      const at = sibling.lines.findIndex((line) => declaration.test(line))
      const typeOnly = /^(?:export\s+)?(?:type|interface)\s/.test(sibling.lines[at])
      if (!sibling.lines[at].startsWith('export ')) {
        sibling.lines[at] = `export ${sibling.lines[at]}`
        console.log(`${home}: now exports ${name}`)
      }
      data.imports.push({ module: `~/${strip(home)}`, fallback: null, items: [typeOnly ? `type ${name}` : name] })
    }

// The module that now declares an imported name.
const repoint = (module, item) => owner.get(`${module}#${imported(item)}`) ?? module

// Merged, repointed and pruned import statements for one file.
function render(file, imports, body) {
  const self = `~/${strip(file)}`
  const merged = new Map()
  const slot = (module) => {
    if (!merged.has(module)) merged.set(module, { fallback: null, items: [] })
    return merged.get(module)
  }
  for (const entry of imports) {
    for (const item of entry.items) {
      const module = repoint(entry.module, item)
      if (module === self) continue
      const list = slot(module).items
      if (!list.some((existing) => local(existing) === local(item))) list.push(item)
    }
    if (entry.fallback && entry.module !== self) slot(entry.module).fallback = entry.fallback
  }
  const lines = []
  for (const [module, { fallback, items: list }] of merged) {
    const kept = list.filter((item) => uses(body, local(item)))
    const keepFallback = fallback && uses(body, fallback.replace(/^\*\s+as\s+/, ''))
    if (!kept.length && !keepFallback) continue
    const allTypes = !keepFallback && kept.every((item) => item.startsWith('type '))
    const named = kept.length
      ? `{ ${kept.map((item) => (allTypes ? item.slice(5) : item)).join(', ')} }`
      : ''
    const clause = [keepFallback ? fallback : '', named].filter(Boolean).join(', ')
    lines.push(`import ${allTypes ? 'type ' : ''}${clause} from '${specifier(file, module)}'`)
  }
  return lines
}

for (const [file, data] of files) {
  if (data.chunks.length === 0) {
    execFileSync('git', ['rm', '-q', path.join(root, file)])
    console.log(`${file}: deleted`)
    continue
  }
  const header = render(file, data.imports, data.chunks.map(code).join('\n'))
  const body = data.chunks.flatMap((chunk) => chunk.lines).join('\n')
  const text = [...header, '', body.replace(/^\n+/, '').replace(/\n*$/, '\n')].join('\n')
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), text)
  console.log(`${file}: ${data.chunks.length} declarations`)
}

// Every other file under the root that imported a moved name now imports it from the module that declares it.
const sources = new Set([...owner.keys()].map((key) => key.split('#')[0]))
let repointed = 0
for (const full of walk(root)) {
  const file = rel(full)
  if (files.has(file)) continue
  const text = readFileSync(full, 'utf8')
  for (const [, spec] of text.matchAll(mockPattern))
    if (sources.has(resolve(file, spec))) throw new Error(`${file} mocks ${spec}; split that mock by hand`)
  let changed = false
  const next = text.replace(importPattern, (whole, typeOnly, clause, spec) => {
    const module = resolve(file, spec)
    const named = /\{([^}]*)\}/.exec(clause)?.[1]
    if (!named || !sources.has(module)) return whole
    const list = items(null, named)
    if (list.every((item) => repoint(module, item) === module)) return whole
    changed = true
    const fallback = clause.replace(/\{[^}]*\}/, '').replace(/,\s*$/, '').trim()
    const groups = new Map(fallback ? [[module, []]] : [])
    for (const item of list) {
      const target = repoint(module, item)
      groups.set(target, [...(groups.get(target) ?? []), item])
    }
    return [...groups]
      .map(([target, group]) => {
        const lead = target === module && fallback ? fallback : ''
        const clauseText = [lead, group.length ? `{ ${group.join(', ')} }` : ''].filter(Boolean).join(', ')
        return `import ${typeOnly ?? ''}${clauseText} from '${specifier(file, target)}'\n`
      })
      .join('')
  })
  if (!changed) continue
  writeFileSync(full, next)
  repointed++
  console.log(`${file}: repointed`)
}
console.log(`moved: ${owner.size}; repointed files: ${repointed}`)
```

The two plans:

Create `.tmp/s7b/dashboards-helpers-move.json`:

```json
{
  "modules/dashboards/dashboards.dto.ts": "modules/dashboards/dashboards.helpers.ts"
}
```

Create `.tmp/s7b/small-count-move.json`:

```json
[
  {
    "from": "modules/dashboards/descriptive-analytics.ts",
    "to": "modules/dashboards/dashboards.helpers.ts",
    "names": ["SMALL_CELL_THRESHOLD", "suppressSmallCount"]
  }
]
```

```bash
node .tmp/s7b/move-files.mjs apps/api/src @app/ .tmp/s7b/dashboards-helpers-move.json apps/api/src apps/api/prisma
node .tmp/s7b/split-declarations.mjs apps/api/src .tmp/s7b/small-count-move.json
git status --short | cut -c1-100
git grep -n "suppressSmallCount\|SMALL_CELL_THRESHOLD" -- apps/api/src ':!*.test.ts' | grep "import\|from" | cut -c1-140
```

Expected: the move reports 4 declarations in `dashboards.helpers.ts` (the two parsers and the two small-cell exports) and 3 repointed importers, the status lists the changes, and the grep lists the three importers on the new path:

```
apps/api/src/modules/dashboards/dashboards.service.ts: 1
total: 1; moved: 1
modules/dashboards/descriptive-analytics.ts: 20 declarations
modules/dashboards/dashboards.helpers.ts: 4 declarations
modules/dashboards/analytics.service.test.ts: repointed
modules/evaluations/evaluation-metrics.service.ts: repointed
modules/projects/project-overview-metrics.service.ts: repointed
moved: 2; repointed files: 3
 M apps/api/src/modules/dashboards/analytics.service.test.ts
RM apps/api/src/modules/dashboards/dashboards.dto.ts -> apps/api/src/modules/dashboards/dashboards.h
 M apps/api/src/modules/dashboards/dashboards.service.ts
 M apps/api/src/modules/dashboards/descriptive-analytics.ts
 M apps/api/src/modules/evaluations/evaluation-metrics.service.ts
 M apps/api/src/modules/projects/project-overview-metrics.service.ts
apps/api/src/modules/dashboards/descriptive-analytics.ts:3:import { suppressSmallCount } from './dashboards.helpers'
apps/api/src/modules/evaluations/evaluation-metrics.service.ts:5:import { suppressSmallCount } from '../dashboards/dashboards.helpers'
apps/api/src/modules/projects/project-overview-metrics.service.ts:22:import { suppressSmallCount } from '../dashboards/dashboards.helpers'
```

- [ ] **Step 2: Move the analytics files and merge the insights module**

`AnalyticsController`, `AnalyticsService`, `descriptive-analytics.ts` and their tests leave `modules/dashboards`; the five `analytics-insights` files join them, so one `AnalyticsModule` in `modules/analytics` holds both controllers and both services (ruling 5). `insights-math.ts` becomes `analytics-insights.helpers.ts` and the insights test `analytics-insights.service.test.ts`, which follow the `<name>.service.test.ts` convention. Create the map:

Create `.tmp/s7b/analytics-move.json`:

```json
{
  "modules/dashboards/analytics.controller.ts": "modules/analytics/analytics.controller.ts",
  "modules/dashboards/analytics.service.ts": "modules/analytics/analytics.service.ts",
  "modules/dashboards/analytics.service.test.ts": "modules/analytics/analytics.service.test.ts",
  "modules/dashboards/descriptive-analytics.ts": "modules/analytics/descriptive-analytics.ts",
  "modules/dashboards/descriptive-analytics.test.ts": "modules/analytics/descriptive-analytics.test.ts",
  "modules/analytics-insights/analytics-insights.controller.ts": "modules/analytics/analytics-insights.controller.ts",
  "modules/analytics-insights/analytics-insights.service.ts": "modules/analytics/analytics-insights.service.ts",
  "modules/analytics-insights/analytics-insights.test.ts": "modules/analytics/analytics-insights.service.test.ts",
  "modules/analytics-insights/insights-math.ts": "modules/analytics/analytics-insights.helpers.ts",
  "modules/analytics-insights/analytics-insights.module.ts": "modules/analytics/analytics.module.ts"
}
```

```bash
node .tmp/s7b/move-files.mjs apps/api/src @app/ .tmp/s7b/analytics-move.json apps/api/src apps/api/prisma
rmdir apps/api/src/modules/analytics-insights
ls apps/api/src/modules/analytics-insights 2>&1 | head -2
git status --short | grep -v "^R" | cut -c1-100
```

Expected: 10 specifier rewrites in 8 files and 10 files moved (the old insights folder is removed once empty), and the working tree lists the importers that changed:

```
apps/api/src/app.module.ts: 1
apps/api/src/modules/analytics-insights/analytics-insights.service.ts: 1
apps/api/src/modules/analytics-insights/analytics-insights.test.ts: 1
apps/api/src/modules/dashboards/analytics.service.test.ts: 2
apps/api/src/modules/dashboards/analytics.service.ts: 1
apps/api/src/modules/dashboards/dashboards.module.ts: 2
apps/api/src/modules/dashboards/dashboards.routes.test.ts: 1
apps/api/src/modules/dashboards/descriptive-analytics.ts: 1
total: 10; moved: 10
ls: cannot access 'apps/api/src/modules/analytics-insights': No such file or directory
 M apps/api/src/app.module.ts
 M apps/api/src/modules/dashboards/dashboards.module.ts
 M apps/api/src/modules/dashboards/dashboards.routes.test.ts
 M apps/api/src/modules/dashboards/dashboards.service.ts
 M apps/api/src/modules/evaluations/evaluation-metrics.service.ts
 M apps/api/src/modules/projects/project-overview-metrics.service.ts
```

The two module files below replace the moved insights module and the dashboards module. `AnalyticsModule` imports `DashboardsModule` (which already exports `DashboardsService`, the only provider `AnalyticsService` takes from it); `DashboardsModule` drops the two analytics providers and the analytics controller:

Create `apps/api/src/modules/analytics/analytics.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsInsightsController } from './analytics-insights.controller'
import { AnalyticsInsightsService } from './analytics-insights.service'
import { AnalyticsService } from './analytics.service'

@Module({
  imports: [DashboardsModule],
  controllers: [AnalyticsController, AnalyticsInsightsController],
  providers: [AnalyticsService, AnalyticsInsightsService],
})
export class AnalyticsModule {}
```

Create `apps/api/src/modules/dashboards/dashboards.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { IndicatorsModule } from '../indicators/indicators.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ActionCountsController } from './action-counts.controller'
import { ActionCountsService } from './action-counts.service'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'
import { RoleOverviewController } from './role-overview.controller'
import { RoleOverviewService } from './role-overview.service'

@Module({
  imports: [IndicatorsModule, RulesHumanModule],
  controllers: [DashboardsController, ActionCountsController, RoleOverviewController],
  providers: [DashboardsService, ActionCountsService, RoleOverviewService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
```

`.tmp/s7b/task2-edits.json` lists the remaining exact replacements: `app.module.ts` lists `AnalyticsModule` in place of `AnalyticsInsightsModule` (2 places), the route test imports it (3 places), and the recorded module pair in `import-boundary.test.ts` becomes an empty list with its comment removed:

Create `.tmp/s7b/task2-edits.json`:

```json
[
 [
  "apps/api/src/app.module.ts",
  "AnalyticsInsightsModule",
  "AnalyticsModule",
  2
 ],
 [
  "apps/api/src/modules/dashboards/dashboards.routes.test.ts",
  "AnalyticsInsightsModule",
  "AnalyticsModule",
  3
 ],
 [
  "apps/api/src/common/import-boundary.test.ts",
  "  it('allows only the recorded pair of modules that import each other', () => {",
  "  it('allows no pair of modules that import each other', () => {",
  1
 ],
 [
  "apps/api/src/common/import-boundary.test.ts",
  "    // The generic report artifact writer is shared with the analytics export; this pair is recorded for S7.\n    expect(mutualModulePairs(files, (file) => readFileSync(file, 'utf8'))).toEqual([\n      'dashboards <-> reports',\n    ])",
  "    expect(mutualModulePairs(files, (file) => readFileSync(file, 'utf8'))).toEqual([])",
  1
 ]
]
```

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task2-edits.json
grep -n "AnalyticsModule" apps/api/src/app.module.ts apps/api/src/modules/dashboards/dashboards.routes.test.ts
```

Expected: 4 replacements in 3 files and the new module and importer lines:

```
4 replacements in 3 files
apps/api/src/app.module.ts:13:import { AnalyticsModule } from './modules/analytics/analytics.module'
apps/api/src/app.module.ts:189:    AnalyticsModule,
apps/api/src/modules/dashboards/dashboards.routes.test.ts:8:import { AnalyticsModule } from '../analytics/analytics.module'
apps/api/src/modules/dashboards/dashboards.routes.test.ts:16:  ...Reflect.getMetadata('controllers', AnalyticsModule),
apps/api/src/modules/dashboards/dashboards.routes.test.ts:60:    expect(imports).toContain(AnalyticsModule)
```

- [ ] **Step 3: Format, prove the move by script, and check the module wiring**

Biome formats every added, modified or renamed file; `cycles.mjs` must show the import loop `dashboards evaluations projects reports` gone; `trim-imports.mjs` and `--noUnusedLocals` show no import left behind; `same-lines.mjs` compares the declaration lines (imports ignored) of every file before and after:

```bash
git add -A apps/api
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR -- '*.ts') 2>&1 | tail -2
node .tmp/s7b/cycles.mjs
node .tmp/s7b/trim-imports.mjs apps/api/src/modules/analytics/*.ts apps/api/src/modules/dashboards/*.ts | grep -v "removed nothing"
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
D=apps/api/src/modules/dashboards; I=apps/api/src/modules/analytics-insights; A=apps/api/src/modules/analytics
node .tmp/s7b/same-lines.mjs $D/analytics.controller.ts $D/analytics.service.ts $D/analytics.service.test.ts $D/descriptive-analytics.ts $D/descriptive-analytics.test.ts $D/dashboards.dto.ts $D/dashboards.helpers.ts $I/analytics-insights.controller.ts $I/analytics-insights.service.ts $I/analytics-insights.test.ts $I/insights-math.ts $A/analytics.controller.ts $A/analytics.service.ts $A/analytics.service.test.ts $A/descriptive-analytics.ts $A/descriptive-analytics.test.ts $A/analytics-insights.controller.ts $A/analytics-insights.service.ts $A/analytics-insights.service.test.ts $A/analytics-insights.helpers.ts
echo "rc=$?"
```

Expected: Biome fixes 8 files, `import loops: 0`, the two baseline unused-locals lines, and `same-lines` finds no lost line (the module files are excluded because they are rewritten on purpose):

```
Checked 18 files in <ms>. Fixed 8 files.
import loops: 0
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
same lines: 3021
rc=0
```

`import-boundary.test.ts` now passes with an empty pair list, which is what ruling 5 predicts: with analytics out of `modules/dashboards`, that module imports only `indicators` and `rules`, so `report-artifact.ts` can stay in reports (S6 ruling 2). The cycle line goes from the `dashboards evaluations projects reports` loop of Task 0 to `import loops: 0`.

The wiring test resolves the module through Nest's testing module with a mocker that records every token it is asked for; only the global `PrismaService` may reach it, so `DashboardsService` and every provider behind it must come from the module's own imports. Create it with the Write tool:

Create `apps/api/src/modules/analytics/analytics.module.test.ts`:

```ts
import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { DashboardsService } from '../dashboards/dashboards.service'
import { AnalyticsInsightsService } from './analytics-insights.service'
import { AnalyticsModule } from './analytics.module'
import { AnalyticsService } from './analytics.service'

describe('AnalyticsModule', () => {
  it('resolves both services from its own imports, leaving only the global PrismaService to the mocker', async () => {
    const mocked: string[] = []
    const moduleRef = await Test.createTestingModule({ imports: [AnalyticsModule] })
      .useMocker((token) => {
        mocked.push(typeof token === 'function' ? token.name : String(token))
        return {}
      })
      .compile()
    expect(moduleRef.get(AnalyticsService)).toBeInstanceOf(AnalyticsService)
    expect(moduleRef.get(AnalyticsInsightsService)).toBeInstanceOf(AnalyticsInsightsService)
    expect(moduleRef.get(DashboardsService, { strict: false })).toBeInstanceOf(DashboardsService)
    expect([...new Set(mocked)]).toEqual(['PrismaService'])
  })
})
```

```bash
A=apps/api/src/modules/analytics
pnpm exec biome check --write $A/analytics.module.test.ts | tail -1
pnpm --filter @pathways/api exec vitest run ${A#apps/api/}/analytics.module.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp $A/analytics.module.ts .tmp/s7b/am.bak
python3 - <<'EOF'
p = 'apps/api/src/modules/analytics/analytics.module.ts'
t = open(p).read().replace('  imports: [DashboardsModule],\n', '')
open(p, 'w').write(t)
EOF
pnpm --filter @pathways/api exec vitest run ${A#apps/api/}/analytics.module.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×|AssertionError"
cp .tmp/s7b/am.bak $A/analytics.module.ts
cp apps/api/src/app.module.ts .tmp/s7b/app.bak
sed -i '/^    AnalyticsModule,$/d' apps/api/src/app.module.ts
pnpm --filter @pathways/api exec vitest run src/modules/dashboards/dashboards.routes.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/app.bak apps/api/src/app.module.ts
git status --short | grep -v "^R" | cut -c1-100
```

Expected: the wiring case passes; without `imports: [DashboardsModule]` it fails with `expected {} to be an instance of DashboardsService`; with `AnalyticsModule` deleted from the imports of `app.module.ts` the registration case of the route test fails (one of four); both files are restored and the working tree holds only the staged task:

```
Checked 1 file in <ms>. No fixes applied.
      Tests  1 passed (1)
   × AnalyticsModule > resolves both services from its own imports, leaving only the global PrismaService to the mocker <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected {} to be an instance of DashboardsService
      Tests  1 failed (1)
   × dashboards and analytics routes > registers the dashboards and insights modules in the application module <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 3 passed (4)
M  apps/api/src/app.module.ts
M  apps/api/src/common/import-boundary.test.ts
D  apps/api/src/modules/analytics-insights/analytics-insights.module.ts
AM apps/api/src/modules/analytics/analytics.module.ts
M  apps/api/src/modules/dashboards/dashboards.module.ts
M  apps/api/src/modules/dashboards/dashboards.routes.test.ts
M  apps/api/src/modules/dashboards/dashboards.service.ts
M  apps/api/src/modules/evaluations/evaluation-metrics.service.ts
MM apps/api/src/modules/projects/project-overview-metrics.service.ts
?? apps/api/src/modules/analytics/analytics.module.test.ts
```

- [ ] **Step 4: Full checks and commit**

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/api test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): move analytics into modules/analytics and the dashboards helpers out of the dto file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -4
```

Expected: typecheck `Done`, lint clean, api `B_api` plus 6 tests, and a commit of 20 files (10 renames, the module and its test created, the old insights module deleted):

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1490 files in <ms>. No fixes applied.
 Test Files  156 passed | 10 skipped (166)
      Tests  2623 passed | 21 skipped (2644)
[<branch> <sha>] refactor(api): move analytics into modules/analytics and the dashboards helpers out of the dto file
 20 files changed, 76 insertions(+), 47 deletions(-)
 delete mode 100644 apps/api/src/modules/analytics-insights/analytics-insights.module.ts
 rename apps/api/src/modules/{analytics-insights => analytics}/analytics-insights.controller.ts (100%)
 rename apps/api/src/modules/{analytics-insights/insights-math.ts => analytics/analytics-insights.helpers.ts} (100%)
 rename apps/api/src/modules/{analytics-insights/analytics-insights.test.ts => analytics/analytics-insights.service.test.ts} (99%)
 rename apps/api/src/modules/{analytics-insights => analytics}/analytics-insights.service.ts (98%)
 rename apps/api/src/modules/{dashboards => analytics}/analytics.controller.ts (100%)
 create mode 100644 apps/api/src/modules/analytics/analytics.module.test.ts
 create mode 100644 apps/api/src/modules/analytics/analytics.module.ts
 rename apps/api/src/modules/{dashboards => analytics}/analytics.service.test.ts (99%)
 rename apps/api/src/modules/{dashboards => analytics}/analytics.service.ts (99%)
 rename apps/api/src/modules/{dashboards => analytics}/descriptive-analytics.test.ts (100%)
 rename apps/api/src/modules/{dashboards => analytics}/descriptive-analytics.ts (97%)
 rename apps/api/src/modules/dashboards/{dashboards.dto.ts => dashboards.helpers.ts} (65%)
 .../src/modules/dashboards/dashboards.service.ts   |  2 +-
 .../evaluations/evaluation-metrics.service.ts      |  2 +-
 .../projects/project-overview-metrics.service.ts   |  2 +-
 20 files changed, 76 insertions(+), 47 deletions(-)
```

---

### Task 3: `descriptive-analytics` split (F2 deferral)

**Files:**
- Create (gitignored): `.tmp/s7b/analytics-split.json`, `.tmp/s7b/task3-edits.json`
- Create: `apps/api/src/modules/analytics/{descriptive-analytics,timeline-analytics,analytics-export}.helpers.ts`, `apps/api/src/modules/analytics/analytics-export.helpers.test.ts`
- Rename: `apps/api/src/modules/analytics/descriptive-analytics.test.ts` to `timeline-analytics.helpers.test.ts`
- Delete: `apps/api/src/modules/analytics/descriptive-analytics.ts`
- Modify: `apps/api/src/modules/analytics/analytics.service.ts`, `analytics.service.test.ts`

- [ ] **Step 1: Split the file and the export code verbatim**

`descriptive-analytics.ts` (435 lines) holds three concerns, so it splits into `descriptive-analytics.helpers.ts` (the counts, distributions and indicator summaries builder), `timeline-analytics.helpers.ts` (the timeline aggregate schema and builder) and `analytics-export.helpers.ts` (the CSV and export table builders). `exportFormats`, `parseExportFormat` and `exportArtifact` leave `analytics.service.ts` for the export file too, so the service falls from 515 to 454 lines (ruling 6). `exportArtifact` logs a render fault with the module logger, and the service logs other events with it, so the declaration is copied (`copy` in the plan entry, a copy keeps the source declaration) and each file keeps its own `new Logger('AnalyticsService')`: the context name stays `AnalyticsService` and neither file imports the other for it. Create the plan with the Write tool:

Create `.tmp/s7b/analytics-split.json`:

```json
[
  {
    "from": "modules/analytics/descriptive-analytics.ts",
    "to": "modules/analytics/descriptive-analytics.helpers.ts",
    "names": ["Bucket", "Distribution", "visible", "formatDescriptiveDecimal", "distribution", "indicatorSummaries", "buildDescriptiveAnalytics"]
  },
  {
    "from": "modules/analytics/descriptive-analytics.ts",
    "to": "modules/analytics/timeline-analytics.helpers.ts",
    "names": ["withReason", "daysBetween", "timelineAggregateSchema", "TimelineAggregate", "buildTimelineAnalytics"]
  },
  {
    "from": "modules/analytics/descriptive-analytics.ts",
    "to": "modules/analytics/analytics-export.helpers.ts",
    "names": ["csvField", "AnalyticsTable", "analyticsTableCsv", "descriptiveAnalyticsTable", "SurveyMetricField", "surveyAnalyticsTable", "TimelineMetricField", "timelineAnalyticsTable"]
  },
  {
    "from": "modules/analytics/analytics.service.ts",
    "to": "modules/analytics/analytics-export.helpers.ts",
    "names": ["logger"],
    "copy": true
  },
  {
    "from": "modules/analytics/analytics.service.ts",
    "to": "modules/analytics/analytics-export.helpers.ts",
    "names": ["exportFormats", "ExportFormat", "parseExportFormat", "exportArtifact"]
  }
]
```

```bash
node .tmp/s7b/split-declarations.mjs apps/api/src .tmp/s7b/analytics-split.json
A=apps/api/src/modules/analytics
git add -A apps/api
pnpm exec biome check --write $A | tail -1
wc -l $A/*.helpers.ts $A/analytics.service.ts
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
node .tmp/s7b/same-lines.mjs $A/descriptive-analytics.ts $A/descriptive-analytics.helpers.ts $A/timeline-analytics.helpers.ts $A/analytics-export.helpers.ts $A/analytics.service.ts
echo "rc=$?"
pnpm --filter @pathways/api exec vitest run src/modules/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
```

Expected: the split prints the moved declarations (7, 5 and 13 in the three helpers, 5 left in the service), the sizes (the export file 183 lines, the service 454), the two baseline lines, and `same-lines` lists exactly the copied logger (`rc=1` because the list is not empty):

```
modules/analytics/analytics-export.helpers.ts: now exports parseExportFormat
modules/analytics/analytics-export.helpers.ts: now exports exportArtifact
modules/analytics/descriptive-analytics.ts: deleted
modules/analytics/descriptive-analytics.helpers.ts: 7 declarations
modules/analytics/timeline-analytics.helpers.ts: 5 declarations
modules/analytics/analytics-export.helpers.ts: 13 declarations
modules/analytics/analytics.service.ts: 5 declarations
modules/analytics/analytics.service.test.ts: repointed
modules/analytics/descriptive-analytics.test.ts: repointed
moved: 24; repointed files: 2
Checked 13 files in <ms>. Fixed 5 files.
  183 apps/api/src/modules/analytics/analytics-export.helpers.ts
   95 apps/api/src/modules/analytics/analytics-insights.helpers.ts
  168 apps/api/src/modules/analytics/descriptive-analytics.helpers.ts
  129 apps/api/src/modules/analytics/timeline-analytics.helpers.ts
  454 apps/api/src/modules/analytics/analytics.service.ts
 1029 total
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
before 1x, after 2x: const logger = new Logger('AnalyticsService')
rc=1
 Test Files  4 passed (4)
      Tests  88 passed (88)
```

`same-lines` lists exactly one line: the logger declaration, now present in the service and in the export file (`before 1x, after 2x`); every other declaration line of the old file and of the service is accounted for. The two `--noUnusedLocals` lines are the api baseline.

- [ ] **Step 2: Rename the timeline test and pin the three export headers**

`descriptive-analytics.test.ts` tests only `buildTimelineAnalytics`, so it follows its code (CR 3.5, a test is named for its subject). The three export tables (`descriptiveAnalyticsTable`, `surveyAnalyticsTable`, `timelineAnalyticsTable`) each write the same seven-column header literal; no test pins a table header alone (the CSV cases in `analytics.service.test.ts` read rows), so the new test pins each header, and one survey row, before the literals are merged. Create it with the Write tool:

Create `apps/api/src/modules/analytics/analytics-export.helpers.test.ts`:

```ts
import type { DescriptiveAnalytics, SurveyAnalytics, TimelineAnalytics } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  descriptiveAnalyticsTable,
  surveyAnalyticsTable,
  timelineAnalyticsTable,
} from './analytics-export.helpers'

const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
const cell = { state: 'MISSING', value: null, reason: 'NO_DATA' }
const group = {
  key: 'OVERALL',
  label: 'All',
  pairs: cell,
  meanPre: cell,
  meanPost: cell,
  meanChange: cell,
  improved: cell,
  same: cell,
  declined: cell,
}

describe('analytics export tables', () => {
  it('starts the descriptive, survey and timeline tables with the same seven-column header', () => {
    const descriptive = { counts: [], distributions: [], indicatorSummaries: [] }
    const survey = { overall: group, byActivity: [] }
    const timeline = Object.fromEntries(
      [
        'elapsedPercent',
        'remainingDays',
        'overdueDays',
        'activityCompletionPercent',
        'activityOverdueCount',
        'milestoneOnTimePercent',
      ].map((field) => [field, cell]),
    )
    expect(descriptiveAnalyticsTable(descriptive as unknown as DescriptiveAnalytics)).toEqual([
      header,
    ])
    expect(surveyAnalyticsTable(survey as unknown as SurveyAnalytics)[0]).toEqual(header)
    expect(timelineAnalyticsTable(timeline as unknown as TimelineAnalytics)[0]).toEqual(header)
  })

  it('writes one survey row per metric under the header', () => {
    const survey = surveyAnalyticsTable({
      overall: group,
      byActivity: [],
    } as unknown as SurveyAnalytics)
    expect(survey).toHaveLength(8)
    expect(survey[1]).toEqual([
      'SURVEY',
      'OVERALL',
      'All - Paired assessments',
      'MISSING',
      null,
      null,
      'NO_DATA',
    ])
  })
})
```

```bash
A=apps/api/src/modules/analytics
git mv $A/descriptive-analytics.test.ts $A/timeline-analytics.helpers.test.ts
pnpm exec biome check --write $A/analytics-export.helpers.test.ts | tail -1
pnpm --filter @pathways/api exec vitest run ${A#apps/api/}/analytics-export.helpers.test.ts ${A#apps/api/}/timeline-analytics.helpers.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
```

Expected: the header test passes with the unchanged code (2 cases), next to the 8 rows of the timeline test, 10 tests in 2 files:

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  2 passed (2)
      Tests  10 passed (10)
```

- [ ] **Step 3: Merge the three header literals and prove the pin**

`.tmp/s7b/task3-edits.json` declares `analyticsTableHeader` once after the `AnalyticsTable` type and makes each table copy it (`[...analyticsTableHeader]`, because the rows are mutable arrays):

Create `.tmp/s7b/task3-edits.json`:

```json
[
 [
  "apps/api/src/modules/analytics/analytics-export.helpers.ts",
  "export type AnalyticsTable = Array<Array<string | number | null>>\n",
  "export type AnalyticsTable = Array<Array<string | number | null>>\n\nconst analyticsTableHeader = ['section', 'key', 'label', 'state', 'value', 'share', 'reason'] as const\n",
  1
 ],
 [
  "apps/api/src/modules/analytics/analytics-export.helpers.ts",
  "  const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']\n",
  "  const header = [...analyticsTableHeader]\n",
  3
 ]
]
```

```bash
A=apps/api/src/modules/analytics
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task3-edits.json
pnpm exec biome check --write $A | tail -1
grep -c "analyticsTableHeader" $A/analytics-export.helpers.ts
pnpm --filter @pathways/api exec vitest run src/modules/analytics 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
cp $A/analytics-export.helpers.ts .tmp/s7b/aeh.bak
sed -i "0,/'share'/s//'part'/" $A/analytics-export.helpers.ts
pnpm --filter @pathways/api exec vitest run ${A#apps/api/}/analytics-export.helpers.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/aeh.bak $A/analytics-export.helpers.ts
git status --short | grep -v "^[RAMD] " | cut -c1-100
```

Expected: 2 replacements in 1 file, the constant used 4 times, the 90 tests of the analytics folder pass, and with one header word changed the header case fails and the other passes (the file is restored):

```
2 replacements in 1 files
Checked 14 files in <ms>. Fixed 1 file.
4
 Test Files  5 passed (5)
      Tests  90 passed (90)
   × analytics export tables > starts the descriptive, survey and timeline tables with the same seven-column header <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 1 passed (2)
AM apps/api/src/modules/analytics/analytics-export.helpers.ts
MM apps/api/src/modules/analytics/analytics.service.test.ts
MM apps/api/src/modules/analytics/analytics.service.ts
AM apps/api/src/modules/analytics/descriptive-analytics.helpers.ts
AM apps/api/src/modules/analytics/timeline-analytics.helpers.ts
?? apps/api/src/modules/analytics/analytics-export.helpers.test.ts
```

- [ ] **Step 4: Full checks and commit**

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/api test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): split the descriptive analytics file and share the export table header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -4
```

Expected: typecheck `Done`, lint clean, api `B_api` plus 8 tests, and a commit of 8 files:

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1493 files in <ms>. No fixes applied.
 Test Files  157 passed | 10 skipped (167)
      Tests  2625 passed | 21 skipped (2646)
[<branch> <sha>] refactor(api): split the descriptive analytics file and share the export table header
 8 files changed, 558 insertions(+), 486 deletions(-)
 create mode 100644 apps/api/src/modules/analytics/analytics-export.helpers.test.ts
 create mode 100644 apps/api/src/modules/analytics/analytics-export.helpers.ts
 create mode 100644 apps/api/src/modules/analytics/descriptive-analytics.helpers.ts
 delete mode 100644 apps/api/src/modules/analytics/descriptive-analytics.ts
 rename apps/api/src/modules/analytics/{descriptive-analytics.test.ts => timeline-analytics.helpers.test.ts} (97%)
 create mode 100644 apps/api/src/modules/analytics/timeline-analytics.helpers.ts
 .../src/modules/analytics/descriptive-analytics.ts | 425 ---------------------
 ....test.ts => timeline-analytics.helpers.test.ts} |   2 +-
 .../analytics/timeline-analytics.helpers.ts        | 129 +++++++
 8 files changed, 558 insertions(+), 486 deletions(-)
```

---

### Task 4: `role-overview.service.ts`

**Files:**
- Create (gitignored): `.tmp/s7b/extract-methods.mjs`, `role-overview-extract.json`, `task4-edits.json`
- Create: `apps/api/src/modules/dashboards/role-overview.rows.test.ts`, `role-overview.helpers.ts`, `role-overview-work.service.ts`, `role-overview-queues.service.ts`
- Modify: `apps/api/src/modules/dashboards/role-overview.service.ts`

`role-overview.service.ts` (545 lines) has eight private methods that read inside the authorized transaction and never use `this` (`projects`, `myActivities`, `flaggedProof`, `submissions`, `proofQueue`, `approvalQueue`, `myExtensions`, `extensionQueue`). They become exported functions taking `tx` (S1 ruling 7; `project-budget.service.ts` is the model of a `.service.ts` file that holds such functions), four in each of two files; the class keeps `alerts`, which calls the rules service, and `read` (ruling 7).

- [ ] **Step 1: Pin the row caps and orderings of every reader**

`role-overview.service.test.ts` pins where-clauses and the shape of the sections but no `take` or `orderBy`. The new test runs the service for the three roles that reach every reader and compares, per role, the model, `take` and `orderBy` of every `findMany` call, so a reader that loses its cap or its order after the move fails it. Create it with the Write tool:

Create `apps/api/src/modules/dashboards/role-overview.rows.test.ts`:

```ts
import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleOverviewService } from './role-overview.service'

vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const user = '30000000-0000-4000-8000-000000000001'

function actor(role: keyof typeof rolePermissions) {
  return {
    id: user,
    aal: 'aal2',
    userId: user,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [project],
  } as ApplicationIdentity
}

function setup() {
  const tx = {
    project: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: project,
          code: 'P-1',
          title: 'Project',
          status: 'ONGOING',
          program: { name: 'Prog' },
          userProjectAssignment_project: [{ user: { fullName: 'Pat Manager' } }],
        },
      ]),
    },
    projectActivity: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    activityUpdate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    budgetExpenseEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    dataImportBatch: { count: vi.fn().mockResolvedValue(2) },
    activityExtensionRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const rules = {
    listAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listEscalatedAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  }
  const service = new RoleOverviewService(
    {} as PrismaService,
    rules as unknown as RulesHumanService,
  )
  return { tx, rules, service }
}

const byTitle = [{ title: 'asc' }, { id: 'asc' }]
const byId = { id: 'asc' }
const caps = {
  PROJECT_OFFICER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityUpdate', 50, [{ reviewedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'desc' }, byId]],
  ],
  MONITORING_AND_EVALUATION_OFFICER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'asc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'asc' }, byId]],
  ],
  PROJECT_MANAGER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityUpdate', 50, [{ reviewedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ submittedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ verifiedAt: 'asc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'desc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'asc' }, byId]],
  ],
} as const

describe('RoleOverviewService row caps', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(Object.keys(caps) as Array<keyof typeof caps>)(
    'sends the same model, take and orderBy to every reader for %s',
    async (role) => {
      const { tx, service } = setup()
      await service.read(actor(role))
      const sent = Object.entries(tx).flatMap(([model, delegate]) =>
        ('findMany' in delegate ? delegate.findMany.mock.calls : []).map(([arg]) => [
          model,
          arg.take,
          arg.orderBy,
        ]),
      )
      expect(sent).toEqual(caps[role])
    },
  )
})
```

```bash
D=apps/api/src/modules/dashboards
pnpm exec biome check --write $D/role-overview.rows.test.ts | tail -1
pnpm --filter @pathways/api exec vitest run ${D#apps/api/}/role-overview.rows.test.ts ${D#apps/api/}/role-overview.service.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
```

Expected: the row cap test and the existing service test pass against the unchanged service (3 and 19 cases):

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

- [ ] **Step 2: Extract the readers**

`rows` and `day` are module constants of the service that both new files need, and the class needs neither afterwards, so they move to a small helpers file (the one place that declares them). Create it, the extractor, and the plan with the Write tool. The extractor cuts each named method (its leading comments, signature and body) out of the class, refuses a method that uses `this`, dedents it two spaces, makes it `export async function` in the target file under the header given in the plan, and rewrites `this.<name>(` calls in the class:

Create `apps/api/src/modules/dashboards/role-overview.helpers.ts`:

```ts
/** Rows every role overview list shows. */
export const rows = 5

/** Calendar day of a date, or null. */
export const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)
```

Create `.tmp/s7b/extract-methods.mjs`:

```js
// Turns private class methods that never use `this` into exported functions in new files and rewrites their calls in the class.
// Usage: node extract-methods.mjs <plan file>  (plan: {"source", "targets": {"<file>": {"header": [...], "methods": [...]}}})
import { readFileSync, writeFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let lines = readFileSync(plan.source, 'utf8').split('\n')

// The line range of one method: its leading comments, signature and closing brace (two-space indent).
function range(name) {
  const open = new RegExp(`^  (?:private )?(?:async )?${name}\\(`)
  const at = lines.findIndex((line) => open.test(line))
  if (at < 0) throw new Error(`no method ${name}`)
  let first = at
  while (/^  (?:\/\*\*| \*|\/\/)/.test(lines[first - 1])) first--
  let last = at
  while (lines[last] !== '  }') last++
  return { first, last, at }
}

const calls = []
for (const [file, { header, methods }] of Object.entries(plan.targets)) {
  const blocks = []
  for (const name of methods) {
    const { first, last, at } = range(name)
    const block = lines.slice(first, last + 1)
    if (block.some((line) => line.includes('this.'))) throw new Error(`${name} uses this`)
    const text = block.map((line) => line.replace(/^ {2}/, ''))
    text[at - first] = text[at - first].replace(/^(?:private )?(?:async )?/, 'export async function ')
    blocks.push(text.join('\n'))
    lines.splice(first, last - first + 1 + (lines[last + 1] === '' ? 1 : 0))
    calls.push(name)
  }
  writeFileSync(file, `${header.join('\n')}\n\n${blocks.join('\n\n')}\n`)
  console.log(`${file}: ${methods.length} functions`)
}
let text = lines.join('\n')
for (const name of calls) text = text.replace(new RegExp(`this\\.${name}\\(`, 'g'), `${name}(`)
writeFileSync(plan.source, text)
console.log(`${plan.source}: ${calls.length} calls rewritten`)
```

Create `.tmp/s7b/role-overview-extract.json`:

```json
{
  "source": "apps/api/src/modules/dashboards/role-overview.service.ts",
  "targets": {
    "apps/api/src/modules/dashboards/role-overview-work.service.ts": {
      "header": [
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { projectScope } from '../../common/authz/project-scope'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { day, rows } from './role-overview.helpers'"
      ],
      "methods": ["projects", "myActivities", "flaggedProof", "submissions"]
    },
    "apps/api/src/modules/dashboards/role-overview-queues.service.ts": {
      "header": [
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import { projectScope } from '../../common/authz/project-scope'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { day, rows } from './role-overview.helpers'"
      ],
      "methods": ["proofQueue", "approvalQueue", "myExtensions", "extensionQueue"]
    }
  }
}
```

`.tmp/s7b/task4-edits.json` removes the two constants from the service and imports the eight functions:

Create `.tmp/s7b/task4-edits.json`:

```json
[
 [
  "apps/api/src/modules/dashboards/role-overview.service.ts",
  "const rows = 5\nconst day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)\n\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/dashboards/role-overview.service.ts",
  "import { RulesHumanService } from '../rules/rules-human.service'\n",
  "import { RulesHumanService } from '../rules/rules-human.service'\nimport {\n  approvalQueue,\n  extensionQueue,\n  myExtensions,\n  proofQueue,\n} from './role-overview-queues.service'\nimport { flaggedProof, myActivities, projects, submissions } from './role-overview-work.service'\n",
  1
 ]
]
```

```bash
D=apps/api/src/modules/dashboards
node .tmp/s7b/extract-methods.mjs .tmp/s7b/role-overview-extract.json
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task4-edits.json
node .tmp/s7b/trim-imports.mjs $D/role-overview*.ts | grep -v "removed nothing"
pnpm exec biome check --write $D | tail -1
wc -l $D/role-overview*.ts
pnpm --filter @pathways/api exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
N="this.projects=projects this.myActivities=myActivities this.flaggedProof=flaggedProof this.submissions=submissions this.proofQueue=proofQueue this.approvalQueue=approvalQueue this.myExtensions=myExtensions this.extensionQueue=extensionQueue"
node .tmp/s7b/same-lines.mjs --tokens $N $D/role-overview.service.ts $D/role-overview-work.service.ts $D/role-overview-queues.service.ts $D/role-overview.helpers.ts
echo "rc=$?"
pnpm --filter @pathways/api exec vitest run src/modules/dashboards 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
```

Expected: the extractor reports 4 functions per file and 8 rewritten calls, 2 replacements, Biome fixes 1 file, the sizes (service 159, work 217, queues 184, helpers 5), the two baseline lines, and the token proof finds the same 3361 tokens (`rc=0`), then the 36 tests of the folder pass:

```
apps/api/src/modules/dashboards/role-overview-work.service.ts: 4 functions
apps/api/src/modules/dashboards/role-overview-queues.service.ts: 4 functions
apps/api/src/modules/dashboards/role-overview.service.ts: 8 calls rewritten
2 replacements in 1 files
apps/api/src/modules/dashboards/role-overview.service.ts: removed Tx
Checked 19 files in <ms>. Fixed 1 file.
  184 apps/api/src/modules/dashboards/role-overview-queues.service.ts
  217 apps/api/src/modules/dashboards/role-overview-work.service.ts
   27 apps/api/src/modules/dashboards/role-overview.controller.test.ts
   17 apps/api/src/modules/dashboards/role-overview.controller.ts
    5 apps/api/src/modules/dashboards/role-overview.helpers.ts
  124 apps/api/src/modules/dashboards/role-overview.rows.test.ts
  433 apps/api/src/modules/dashboards/role-overview.service.test.ts
  159 apps/api/src/modules/dashboards/role-overview.service.ts
 1166 total
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
same tokens: 3361
rc=0
 Test Files  6 passed | 2 skipped (8)
      Tests  36 passed | 2 skipped (38)
```

`same-lines.mjs --tokens` compares the multiset of tokens of the old service with the four new files after the eight `this.<name>` to `<name>` renames: comments, line breaks, trailing commas, imports and the keywords `export`, `private`, `async` and `function` are ignored, so a re-wrapped signature does not count, and any added, lost or changed token fails. The line mode cannot be used here, because Biome re-wraps the `extensionQueue` signature once it carries `export async function`.

- [ ] **Step 3: Prove the row pin fails when a cap is lost**

Raising the first `take: rows` of the queues file by one must fail the case of the role that reaches that reader (the proof queue):

```bash
D=apps/api/src/modules/dashboards
F=$D/role-overview-queues.service.ts
cp $F .tmp/s7b/roq.bak
sed -i "0,/take: rows,/s//take: rows + 1,/" $F
grep -n "take: rows + 1" $F
pnpm --filter @pathways/api exec vitest run ${D#apps/api/}/role-overview.rows.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | cut -c1-120
cp .tmp/s7b/roq.bak $F
cmp .tmp/s7b/roq.bak $F && echo restored
```

Expected: the mutated line, one failing case out of three (the role that reaches the proof queue) and the file restored:

```
30:      take: rows + 1,
   × RoleOverviewService row caps > sends the same model, take and orderBy to every reader for MONITORING_AND_EVALUATIO
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 2 passed (3)
restored
```

- [ ] **Step 4: Full checks and commit**

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm --filter @pathways/api test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): move the role overview readers into functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -6
```

Expected: typecheck `Done`, lint clean, api `B_api` plus 11 tests in all, and a commit of 5 files:

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1497 files in <ms>. No fixes applied.
 Test Files  158 passed | 10 skipped (168)
      Tests  2628 passed | 21 skipped (2649)
[<branch> <sha>] refactor(api): move the role overview readers into functions
 5 files changed, 546 insertions(+), 402 deletions(-)
 create mode 100644 apps/api/src/modules/dashboards/role-overview-queues.service.ts
 create mode 100644 apps/api/src/modules/dashboards/role-overview-work.service.ts
 create mode 100644 apps/api/src/modules/dashboards/role-overview.helpers.ts
 create mode 100644 apps/api/src/modules/dashboards/role-overview.rows.test.ts
 .../dashboards/role-overview-queues.service.ts     | 184 +++++++++
 .../dashboards/role-overview-work.service.ts       | 217 +++++++++++
 .../modules/dashboards/role-overview.helpers.ts    |   5 +
 .../modules/dashboards/role-overview.rows.test.ts  | 124 ++++++
 .../modules/dashboards/role-overview.service.ts    | 418 +--------------------
 5 files changed, 546 insertions(+), 402 deletions(-)
```

---

### Task 5: Shared folder layout

**Files:**
- Create (gitignored): `.tmp/s7b/split-test-file.mjs`, `test-titles.mjs`, `shared-layout.json`, `shared-split.json`, `task5-edits.json`, `task5-barrel.json`, `views-split.json`, `task5-sad.json`, `exports-before.txt`, `exports-after.txt`, `views-before.json`, `views-after.json`
- Move (git mv, 15 files): `packages/shared/src/monitoring/*` into `contracts/dashboards`, `contracts/analytics`, `contracts/projects` and `metrics`
- Create: `packages/shared/src/contracts/analytics/{survey-analytics,timeline-analytics}.ts`, `survey-analytics.test.ts`, `survey-analytics.aggregates.test.ts`, `timeline-analytics.test.ts`, `packages/shared/src/metrics/metric-round.ts`
- Delete: `packages/shared/src/contracts/analytics/descriptive-analytics-views.test.ts` (split)
- Modify: `packages/shared/src/index.ts`, the shared files that import the moved ones, `scripts/sad/check.ts`, `scripts/sad/check.test.ts`, `docs/sad-pathways.md`

`monitoring/` has no place in CR 3.4, which lists `contracts/<domain>/` and `metrics/`. Every name stays (the barrel is the public surface) and nothing is renamed (ruling 4); the files move by `git mv` and the 558-line `descriptive-analytics.ts` splits verbatim (ruling 4).

- [ ] **Step 1: Save the public surface and the test titles before anything moves**

The barrel must export exactly the same names afterwards, and the 797-line views test must keep every title when it is split. Two scripts, created with the Write tool, compare titles (`test-titles.mjs`, which takes the package in `PKG`, default `web`) and cut a test file by line ranges (`split-test-file.mjs`, Step 5):

Create `.tmp/s7b/test-titles.mjs`:

```js
// Runs the given test files of one package (PKG, default web) and writes the sorted titles of their tests (it.each rows included) to a JSON file, or compares two such files.
// Usage: [PKG=shared] test-titles.mjs save <out.json> <test file>...   |   test-titles.mjs compare <before.json> <after.json> [--allow <title>...]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, a, b, ...rest] = process.argv.slice(2)
const pkg = process.env.PKG ?? 'web'
const dir = pkg === 'web' || pkg === 'api' ? 'apps' : 'packages'
const count = (titles) => titles.reduce((map, title) => map.set(title, (map.get(title) ?? 0) + 1), new Map())

if (mode === 'save') {
  const files = [b, ...rest].filter(Boolean).map((file) => file.replace(new RegExp(`^${dir}/${pkg}/`), ''))
  const out = `${a}.raw`
  try {
    execFileSync('pnpm', ['--filter', `@pathways/${pkg}`, 'exec', 'vitest', 'run', ...files, '--reporter=json', `--outputFile=${process.cwd()}/${out}`], { stdio: 'ignore' })
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

Create `.tmp/s7b/split-test-file.mjs`:

```js
// Cuts a test file into new files by 1-based inclusive line ranges, each starting with the source's import header, then removes the source.
// Usage: node split-test-file.mjs <plan file>  (plan: {"source", "header": [from, to], "targets": {"<file>": [[from, to], ...]}})
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const lines = readFileSync(plan.source, 'utf8').split('\n')
const cut = ([from, to]) => lines.slice(from - 1, to)
const used = new Set()
for (const [file, ranges] of Object.entries(plan.targets)) {
  const body = ranges.flatMap(cut)
  for (const [from, to] of ranges) for (let n = from; n <= to; n++) used.add(n)
  writeFileSync(file, `${[...cut(plan.header), ...body].join('\n')}\n`)
  console.log(`${file}: ${body.length} lines`)
}
const left = lines.map((line, i) => [i + 1, line]).filter(([n, line]) => n > plan.header[1] && !used.has(n) && line.trim() !== '')
if (left.length) throw new Error(`lines not placed: ${left.map(([n]) => n).join(', ')}`)
execFileSync('git', ['rm', '-q', '-f', plan.source])
```

`exports-before.txt` compares every name of the barrel, but only while this plan runs. `packages/shared/src/index.test.ts` is the test that stays: it pins one name of each module that moves or is split (the metric math and cell, the dashboard contracts, the descriptive, survey, timeline and insights analytics, the overview metrics and the project map) and that the field schemas `date`, `uuid` and `decimal` and the rounding helper `round1` are not part of the barrel (ruling 4: `metric-fields.ts` and `metric-round.ts` stay out of it). It runs against the unchanged code first. Create it with the Write tool:

Create `packages/shared/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as shared from './index'

describe('shared barrel', () => {
  it('exports a name of every metric, dashboard, analytics and project contract module', () => {
    const names = [
      'numericKinds',
      'metricCellSchema',
      'dashboardQuerySchema',
      'dashboardActionCountsSchema',
      'roleOverviewSchema',
      'DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION',
      'computeSurveyAnalytics',
      'timelineAnalyticsSchema',
      'analyticsInsightsQuerySchema',
      'projectOverviewMetricsSchema',
      'projectMapSchema',
    ]
    for (const name of names) expect(shared, name).toHaveProperty(name)
  })

  it('keeps the field schemas and the rounding helper out of the barrel', () => {
    for (const name of ['date', 'uuid', 'decimal', 'round1'])
      expect(shared).not.toHaveProperty(name)
  })
})
```

```bash
pnpm exec biome check --write packages/shared/src/index.test.ts | tail -1
pnpm --filter @pathways/shared exec vitest run src/index.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
pnpm --filter @pathways/shared build 2>&1 | tail -1
node -e "console.log(Object.keys(require('./packages/shared/dist/index.js')).sort().join('\n'))" > .tmp/s7b/exports-before.txt
wc -l < .tmp/s7b/exports-before.txt
PKG=shared node .tmp/s7b/test-titles.mjs save .tmp/s7b/views-before.json packages/shared/src/monitoring/descriptive-analytics-views.test.ts
git ls-files packages/shared/src/monitoring | wc -l
```

Expected: Biome finds nothing to fix and the barrel test passes (2 cases), the shared build prints its `tsc` line, the barrel exports the number of names that is written down as `exports-before.txt`, the title list holds the 35 tests of the one views test, and `monitoring/` tracks 15 files:

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  2 passed (2)
$ tsc -p tsconfig.build.json
302
files 1, tests 35, failed 0
15
```

- [ ] **Step 2: Move the files and rewrite the imports**

The map (15 files: the dashboard and SADDD remainder of `metric-contract.ts`, `action-counts.ts` and `role-overview.ts` with its test go to `contracts/dashboards`; `analytics-insights.ts` and `descriptive-analytics.ts` with their tests to `contracts/analytics`; `overview-metrics.ts` with its test and `project-map.ts` to `contracts/projects` (S1 ruling 6); `metric-math.ts`, `metric-cell.ts` and `metric-fields.ts` to `metrics`, and `metric-contract.test.ts` with them, because its cases are the metric math, cell and indicator contract cases that S3 left there). `metric-fields.ts` stays out of the barrel (S3 ruling 3). `move-files.mjs` is the one of Task 2 (alias form `-`: the shared package uses relative imports) and rewrites the relative imports that S3 and S4 left in `contracts/activities`, `contracts/beneficiaries`, `contracts/indicators` and `rules`, and the barrel:

Create `.tmp/s7b/shared-layout.json`:

```json
{
  "monitoring/metric-math.ts": "metrics/metric-math.ts",
  "monitoring/metric-cell.ts": "metrics/metric-cell.ts",
  "monitoring/metric-fields.ts": "metrics/metric-fields.ts",
  "monitoring/metric-contract.test.ts": "metrics/metric-contract.test.ts",
  "monitoring/metric-contract.ts": "contracts/dashboards/metric-contract.ts",
  "monitoring/action-counts.ts": "contracts/dashboards/action-counts.ts",
  "monitoring/role-overview.ts": "contracts/dashboards/role-overview.ts",
  "monitoring/role-overview.test.ts": "contracts/dashboards/role-overview.test.ts",
  "monitoring/analytics-insights.ts": "contracts/analytics/analytics-insights.ts",
  "monitoring/analytics-insights.test.ts": "contracts/analytics/analytics-insights.test.ts",
  "monitoring/descriptive-analytics.ts": "contracts/analytics/descriptive-analytics.ts",
  "monitoring/descriptive-analytics-views.test.ts": "contracts/analytics/descriptive-analytics-views.test.ts",
  "monitoring/overview-metrics.ts": "contracts/projects/overview-metrics.ts",
  "monitoring/overview-metrics.test.ts": "contracts/projects/overview-metrics.test.ts",
  "monitoring/project-map.ts": "contracts/projects/project-map.ts"
}
```

```bash
node .tmp/s7b/move-files.mjs packages/shared/src - .tmp/s7b/shared-layout.json packages/shared/src
rmdir packages/shared/src/monitoring
ls packages/shared/src/monitoring 2>&1 | head -1
pnpm exec biome check --write packages/shared/src 2>&1 | tail -1
pnpm --filter @pathways/shared typecheck 2>&1 | tail -1
pnpm --filter @pathways/shared test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
sed -n 9,17p packages/shared/src/index.ts
```

Expected: the mover rewrites 33 specifiers and moves 15 files, `monitoring/` is gone (the empty folder is removed, `rmdir` fails if a file is left), Biome fixes 4 files, shared typecheck is clean, the shared suite still passes (the 719 tests of the baseline plus the 2 of the barrel test, in 43 files), and the barrel lines 9 to 17 name the new paths (the order is fixed in Step 4):

```
packages/shared/src/contracts/activities/activity-extension-response.ts: 1
packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts: 1
packages/shared/src/contracts/indicators/indicator-requests.ts: 3
packages/shared/src/contracts/indicators/indicator-responses.ts: 3
packages/shared/src/index.ts: 9
packages/shared/src/monitoring/action-counts.ts: 1
packages/shared/src/monitoring/analytics-insights.ts: 1
packages/shared/src/monitoring/descriptive-analytics.ts: 2
packages/shared/src/monitoring/metric-contract.test.ts: 1
packages/shared/src/monitoring/metric-contract.ts: 4
packages/shared/src/monitoring/overview-metrics.ts: 2
packages/shared/src/monitoring/project-map.ts: 1
packages/shared/src/monitoring/role-overview.ts: 1
packages/shared/src/rules/rule-contract.ts: 1
packages/shared/src/rules/rule-metrics.ts: 2
total: 33; moved: 15
ls: cannot access 'packages/shared/src/monitoring': No such file or directory
Checked 97 files in <ms>. Fixed 4 files.
$ tsc -p tsconfig.json --noEmit
 Test Files  43 passed (43)
      Tests  721 passed (721)
export * from './metrics/metric-math'
export * from './metrics/metric-cell'
export * from './contracts/dashboards/metric-contract'
export * from './contracts/analytics/descriptive-analytics'
export * from './contracts/analytics/analytics-insights'
export * from './contracts/projects/overview-metrics'
export * from './contracts/projects/project-map'
export * from './contracts/dashboards/action-counts'
export * from './contracts/dashboards/role-overview'
```

- [ ] **Step 3: Split `descriptive-analytics.ts` and use the shared field schemas**

The file holds three concerns: the descriptive query and response (about lines 1 to 95), the survey calculator (about 96 to 486) and the timeline view (about 487 to 558). The plan moves 27 declarations to `survey-analytics.ts`, 9 to `timeline-analytics.ts` and the shared rounding helper `round1` (used by both) to `metrics/metric-round.ts`, which stays out of the barrel as `metric-fields.ts` does, so the barrel gains no name. The file also declares private `date`, `uuid` and `decimal` field schemas whose text equals `metric-fields.ts` line for line (the `same-lines` check below lists exactly those six lines as removed); the split would export two of them from the first file, so `task5-edits.json` deletes them and imports the three from `metrics/metric-fields` instead:

Create `.tmp/s7b/shared-split.json`:

```json
[
 {
  "from": "contracts/analytics/descriptive-analytics.ts",
  "to": "metrics/metric-round.ts",
  "names": [
   "round1"
  ]
 },
 {
  "from": "contracts/analytics/descriptive-analytics.ts",
  "to": "contracts/analytics/survey-analytics.ts",
  "names": [
   "SURVEY_SMALL_CELL_THRESHOLD",
   "suppressSmallSurveyCount",
   "SURVEY_ANALYTICS_CONTRACT_VERSION",
   "surveyGroupSchema",
   "SurveyGroup",
   "surveyAnalyticsSchema",
   "SurveyAnalytics",
   "surveyAggregateGroupSchema",
   "SurveyAggregateGroup",
   "surveyAggregateSchema",
   "SurveyAggregate",
   "SurveyAssessmentRow",
   "NormalizedRow",
   "Pair",
   "pushTo",
   "byLatest",
   "pairAssessments",
   "surveyAggregateFromRows",
   "suppressedSurveyGroup",
   "missingSurveyGroup",
   "GroupTotals",
   "emptyTotals",
   "addTotals",
   "clearsThresholdOrZero",
   "buildSurveyGroup",
   "computeSurveyAnalyticsFromAggregates",
   "computeSurveyAnalytics"
  ]
 },
 {
  "from": "contracts/analytics/descriptive-analytics.ts",
  "to": "contracts/analytics/timeline-analytics.ts",
  "names": [
   "TIMELINE_ANALYTICS_CONTRACT_VERSION",
   "timelineAnalyticsSchema",
   "TimelineAnalytics",
   "TimelineMilestoneRow",
   "milestoneCountsSchema",
   "MilestoneCounts",
   "milestoneOnTimeFromCounts",
   "milestoneCountsFromRows",
   "milestoneOnTimeCell"
  ]
 }
]
```

Create `.tmp/s7b/task5-edits.json`:

```json
[
 [
  "packages/shared/src/contracts/analytics/descriptive-analytics.ts",
  "export const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')\nexport const uuid = z\n  .string()\n  .uuid()\n  .transform((value) => value.toLowerCase())\nconst decimal = z.string().regex(/^-?(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,4})?$/)\n\n",
  "",
  1
 ],
 [
  "packages/shared/src/contracts/analytics/descriptive-analytics.ts",
  "import { isCalendarDate } from '../../metrics/metric-math'\n",
  "import { date, decimal, uuid } from '../../metrics/metric-fields'\n",
  1
 ],
 [
  "packages/shared/src/contracts/analytics/survey-analytics.ts",
  "import { date, uuid } from './descriptive-analytics'\n",
  "import { date, uuid } from '../../metrics/metric-fields'\n",
  1
 ],
 [
  "packages/shared/src/contracts/analytics/timeline-analytics.ts",
  "import { date, uuid } from './descriptive-analytics'\n",
  "import { date, uuid } from '../../metrics/metric-fields'\n",
  1
 ]
]
```

```bash
C=packages/shared/src/contracts/analytics
node .tmp/s7b/split-declarations.mjs packages/shared/src .tmp/s7b/shared-split.json
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task5-edits.json
node .tmp/s7b/trim-imports.mjs $C/*.ts | grep -v "removed nothing"
pnpm exec biome check --write packages/shared/src | tail -1
wc -l $C/*analytics.ts packages/shared/src/metrics/metric-round.ts
git grep -n "export const date\|export const uuid\|export function round1" -- packages/shared/src | cut -c1-110
node .tmp/s7b/same-lines.mjs packages/shared/src/monitoring/descriptive-analytics.ts $C/descriptive-analytics.ts $C/survey-analytics.ts $C/timeline-analytics.ts packages/shared/src/metrics/metric-round.ts
echo "rc=$?"
```

Expected: the splitter exports `date`, `uuid` and `round1` for the cut, moves 15, 1, 27 and 9 declarations to the four files, and repoints the views test; the edit list makes 4 replacements in 3 files; the sizes are 87, 389, 78 and 6 lines; the grep lists no `date`, `uuid` or `round1` export outside `metric-fields.ts` and the two unrelated names; and `same-lines` lists the six private field schema lines (`rc=1` because the list is not empty):

```
contracts/analytics/descriptive-analytics.ts: now exports date
contracts/analytics/descriptive-analytics.ts: now exports uuid
metrics/metric-round.ts: now exports round1
contracts/analytics/descriptive-analytics.ts: 15 declarations
metrics/metric-round.ts: 1 declarations
contracts/analytics/survey-analytics.ts: 27 declarations
contracts/analytics/timeline-analytics.ts: 9 declarations
contracts/analytics/descriptive-analytics-views.test.ts: repointed
moved: 37; repointed files: 1
4 replacements in 3 files
Checked 100 files in <ms>. Fixed 4 files.
   87 packages/shared/src/contracts/analytics/descriptive-analytics.ts
  389 packages/shared/src/contracts/analytics/survey-analytics.ts
   78 packages/shared/src/contracts/analytics/timeline-analytics.ts
    6 packages/shared/src/metrics/metric-round.ts
  560 total
packages/shared/src/contracts/common/field-schemas.ts:50:export const uuidString = z.string().regex(uuidPatter
packages/shared/src/metrics/metric-fields.ts:5:export const date = z
packages/shared/src/metrics/metric-fields.ts:9:export const uuid = z
packages/shared/src/rules/rule-contract.ts:26:export const uuidSchema = z
before 1x, after 0x: const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
before 1x, after 0x: const uuid = z
before 1x, after 0x: .string()
before 1x, after 0x: .uuid()
before 1x, after 0x: .transform((value) => value.toLowerCase())
before 1x, after 0x: const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/)
rc=1
```

`same-lines` lists the six lines of the three private field schemas, and nothing else: every other declaration line of the 558-line file now sits in one of the four files. (The two names `date` and `uuid` are exported only by `metrics/metric-fields.ts`, which is outside the barrel.)

- [ ] **Step 4: Update the barrel and prove the public surface unchanged**

`task5-barrel.json` moves the seven moved contract lines (which `move-files.mjs` rewrote in place between the metrics lines and `rbac`) to the end of the contracts block and adds the two new files:

Create `.tmp/s7b/task5-barrel.json`:

```json
[
 [
  "packages/shared/src/index.ts",
  "export * from './contracts/dashboards/metric-contract'\nexport * from './contracts/analytics/descriptive-analytics'\nexport * from './contracts/analytics/analytics-insights'\nexport * from './contracts/projects/overview-metrics'\nexport * from './contracts/projects/project-map'\nexport * from './contracts/dashboards/action-counts'\nexport * from './contracts/dashboards/role-overview'\n",
  "",
  1
 ],
 [
  "packages/shared/src/index.ts",
  "export * from './contracts/reports/report-requests'\n",
  "export * from './contracts/reports/report-requests'\nexport * from './contracts/dashboards/metric-contract'\nexport * from './contracts/dashboards/action-counts'\nexport * from './contracts/dashboards/role-overview'\nexport * from './contracts/analytics/descriptive-analytics'\nexport * from './contracts/analytics/survey-analytics'\nexport * from './contracts/analytics/timeline-analytics'\nexport * from './contracts/analytics/analytics-insights'\nexport * from './contracts/projects/overview-metrics'\nexport * from './contracts/projects/project-map'\n",
  1
 ]
]
```

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task5-barrel.json
sed -n 9,10p packages/shared/src/index.ts
grep -nE "contracts/(dashboards|analytics)/|projects/(overview-metrics|project-map)'" packages/shared/src/index.ts
pnpm --filter @pathways/shared typecheck 2>&1 | tail -1
pnpm --filter @pathways/shared build 2>&1 | tail -1
node -e "console.log(Object.keys(require('./packages/shared/dist/index.js')).sort().join('\n'))" > .tmp/s7b/exports-after.txt
wc -l < .tmp/s7b/exports-after.txt
diff .tmp/s7b/exports-before.txt .tmp/s7b/exports-after.txt && echo "same exports"
cp packages/shared/src/index.ts .tmp/s7b/index.bak
echo "export * from './metrics/metric-round'" >> packages/shared/src/index.ts
pnpm --filter @pathways/shared exec vitest run src/index.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
cp .tmp/s7b/index.bak packages/shared/src/index.ts
cmp .tmp/s7b/index.bak packages/shared/src/index.ts && echo restored
```

Expected: 2 replacements, the first two barrel lines, then the numbered barrel lines of the moved contracts in their new order, shared typecheck and build clean, 302 exports and `same exports`; with `metric-round` added to the barrel the second case of the barrel test fails and the file is restored:

```
2 replacements in 1 files
export * from './metrics/metric-math'
export * from './metrics/metric-cell'
47:export * from './contracts/dashboards/metric-contract'
48:export * from './contracts/dashboards/action-counts'
49:export * from './contracts/dashboards/role-overview'
50:export * from './contracts/analytics/descriptive-analytics'
51:export * from './contracts/analytics/survey-analytics'
52:export * from './contracts/analytics/timeline-analytics'
53:export * from './contracts/analytics/analytics-insights'
54:export * from './contracts/projects/overview-metrics'
55:export * from './contracts/projects/project-map'
$ tsc -p tsconfig.json --noEmit
$ tsc -p tsconfig.build.json
302
same exports
   × shared barrel > keeps the field schemas and the rounding helper out of the barrel <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 1 passed (2)
restored
```

- [ ] **Step 5: Split the 799-line views test by concern**

`descriptive-analytics-views.test.ts` (799 lines after Biome) tests three subjects, so it splits into `survey-analytics.test.ts` (the row calculator, with the fixtures), `survey-analytics.aggregates.test.ts` (the trusted aggregates; it needs `projectId`, `generatedAt` and `compute`, so those three are copied) and `timeline-analytics.test.ts` (the two milestone describes). `split-test-file.mjs` writes each target as the import header (lines 1 to 14) plus the listed line ranges, refuses to run when a non-blank line is not placed, and removes the source:

Create `.tmp/s7b/views-split.json`:

```json
{
  "source": "packages/shared/src/contracts/analytics/descriptive-analytics-views.test.ts",
  "header": [1, 14],
  "targets": {
    "packages/shared/src/contracts/analytics/survey-analytics.test.ts": [[15, 493]],
    "packages/shared/src/contracts/analytics/survey-analytics.aggregates.test.ts": [[15, 17], [33, 42], [535, 772]],
    "packages/shared/src/contracts/analytics/timeline-analytics.test.ts": [[494, 534], [773, 799]]
  }
}
```

```bash
C=packages/shared/src/contracts/analytics
wc -l < $C/descriptive-analytics-views.test.ts
node .tmp/s7b/split-test-file.mjs .tmp/s7b/views-split.json
node .tmp/s7b/trim-imports.mjs $C/*.test.ts | grep -v "removed nothing"
pnpm exec biome check --write $C | tail -1
wc -l $C/*.test.ts
PKG=shared node .tmp/s7b/test-titles.mjs save .tmp/s7b/views-after.json $C/survey-analytics.test.ts $C/survey-analytics.aggregates.test.ts $C/timeline-analytics.test.ts
node .tmp/s7b/test-titles.mjs compare .tmp/s7b/views-before.json .tmp/s7b/views-after.json
node .tmp/s7b/same-lines.mjs packages/shared/src/monitoring/descriptive-analytics-views.test.ts $C/survey-analytics.test.ts $C/survey-analytics.aggregates.test.ts $C/timeline-analytics.test.ts
echo "rc=$?"
```

Expected: the views test is 799 lines; the splitter writes three files (479, 251 and 68 lines before Biome) and lists the names it removed from each header; Biome fixes 2 files; the final sizes are 485, 258 and 75 lines (the insights test beside them is unchanged); the titles are 35 before and 35 after with 0 lost and 0 added; and `same-lines` lists only the copies in the aggregates file (`rc=1`):

```
799
packages/shared/src/contracts/analytics/survey-analytics.test.ts: 479 lines
packages/shared/src/contracts/analytics/survey-analytics.aggregates.test.ts: 251 lines
packages/shared/src/contracts/analytics/timeline-analytics.test.ts: 68 lines
packages/shared/src/contracts/analytics/survey-analytics.aggregates.test.ts: removed SURVEY_SMALL_CELL_THRESHOLD, TimelineMilestoneRow, milestoneCountsFromRows, milestoneOnTimeCell, milestoneOnTimeFromCounts
packages/shared/src/contracts/analytics/survey-analytics.test.ts: removed computeSurveyAnalyticsFromAggregates, surveyAggregateFromRows, TimelineMilestoneRow, milestoneCountsFromRows, milestoneOnTimeCell, milestoneOnTimeFromCounts
packages/shared/src/contracts/analytics/timeline-analytics.test.ts: removed SURVEY_SMALL_CELL_THRESHOLD, SurveyAssessmentRow, computeSurveyAnalytics, computeSurveyAnalyticsFromAggregates, surveyAggregateFromRows
Checked 8 files in <ms>. Fixed 2 files.
  119 packages/shared/src/contracts/analytics/analytics-insights.test.ts
  258 packages/shared/src/contracts/analytics/survey-analytics.aggregates.test.ts
  485 packages/shared/src/contracts/analytics/survey-analytics.test.ts
   75 packages/shared/src/contracts/analytics/timeline-analytics.test.ts
  937 total
files 3, tests 35, failed 0
before 35, after 35, lost 0, added 0
before 1x, after 2x: const projectId = '20000000-0000-4000-8000-00000000000a'
before 1x, after 2x: const generatedAt = '2026-09-29T00:00:00.000Z'
before 25x, after 26x: }
before 1x, after 2x: compute(rows: SurveyAssessmentRow[]) {
before 1x, after 2x: return computeSurveyAnalytics({
before 3x, after 4x: projectId,
before 3x, after 4x: periodStart: '2026-01-01',
before 3x, after 4x: periodEnd: '2026-12-31',
before 3x, after 4x: generatedAt,
before 1x, after 2x: rows,
before 59x, after 60x: })
rc=1
```

The title comparison prints `lost 0, added 0` (35 tests before and after). `same-lines` lists only the copies in the aggregates file: `projectId`, `generatedAt`, the `compute` helper and its argument lines (`before 1x, after 2x`), plus the closing lines those helpers add.

- [ ] **Step 6: Route the moved contracts to the determinism checker**

The checker's glob `packages/shared/src/monitoring/**/*.ts` matches nothing now, so the role would silently stop reviewing these files (the pinned list is in `docs/sad-pathways.md` line 40 too). The glob becomes `metrics/**`, `contracts/analytics/**`, `contracts/dashboards/**` and the two project files that came from `monitoring/`; a test routes one file of each and one project contract that must not match:

Create `.tmp/s7b/task5-sad.json`:

```json
[
 [
  "scripts/sad/check.ts",
  "      'packages/shared/src/monitoring/**/*.ts',\n",
  "      'packages/shared/src/metrics/**/*.ts',\n      'packages/shared/src/contracts/analytics/**/*.ts',\n      'packages/shared/src/contracts/dashboards/**/*.ts',\n      'packages/shared/src/contracts/projects/overview-metrics.ts',\n      'packages/shared/src/contracts/projects/project-map.ts',\n",
  1
 ],
 [
  "docs/sad-pathways.md",
  "`packages/shared/src/monitoring/**/*.ts`, `packages/shared/src/rules/**`",
  "`packages/shared/src/metrics/**/*.ts`, `packages/shared/src/contracts/analytics/**/*.ts`, `packages/shared/src/contracts/dashboards/**/*.ts`, `packages/shared/src/contracts/projects/overview-metrics.ts`, `packages/shared/src/contracts/projects/project-map.ts`, `packages/shared/src/rules/**`",
  1
 ],
 [
  "scripts/sad/check.test.ts",
  "  it('routes indicator contracts to the determinism checker and the privacy guardian', () => {\n",
  "  it('routes metric, dashboard and analytics contracts to the determinism checker', () => {\n    const files = [\n      'packages/shared/src/contracts/analytics/survey-analytics.ts',\n      'packages/shared/src/contracts/dashboards/role-overview.ts',\n      'packages/shared/src/contracts/projects/overview-metrics.ts',\n      'packages/shared/src/contracts/projects/project-map.ts',\n      'packages/shared/src/metrics/metric-math.ts',\n    ]\n    const other = 'packages/shared/src/contracts/projects/project-requests.ts'\n    const routed = routing([...files, other].map((file) => change(file, 'new', 'old')))\n    expect(routed['rule-engine-determinism-checker']).toEqual(files)\n  })\n  it('routes indicator contracts to the determinism checker and the privacy guardian', () => {\n",
  1
 ]
]
```

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task5-sad.json
pnpm exec biome check --write scripts/sad | tail -1
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+|FAIL"
pnpm sad:typecheck 2>&1 | tail -1
git grep -n "src/monitoring" -- scripts docs/sad-pathways.md | cut -c1-100
cp scripts/sad/check.ts .tmp/s7b/check.bak
sed -i "/contracts\/dashboards\/\*\*/d" scripts/sad/check.ts
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+|×"
cp .tmp/s7b/check.bak scripts/sad/check.ts
cmp .tmp/s7b/check.bak scripts/sad/check.ts && echo restored
```

Expected: 3 replacements in 3 files, Biome finds nothing to fix, the SAD suite runs 58 tests (57 before and the new routing test), its typecheck is clean, and no `src/monitoring` path is left in `scripts` or `docs/sad-pathways.md`; with the `contracts/dashboards` glob deleted from the checker the routing test fails (one of 58) and the checker is restored:

```
3 replacements in 3 files
Checked 4 files in <ms>. No fixes applied.
      Tests  58 passed (58)
$ tsc -p scripts/sad/tsconfig.json
   × routing and digest > routes metric, dashboard and analytics contracts to the determinism checker <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 57 passed (58)
restored
```

- [ ] **Step 7: Full checks and commit**

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A packages scripts docs/sad-pathways.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(shared): dissolve the monitoring folder into contracts and metrics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -4
```

Expected: typecheck `Done`, lint clean, shared 721 tests in 45 files (the barrel test adds 1 file and 2 tests, and the 3 new files hold the same 35 views tests that one file held), api and web unchanged by this task, and a commit of 31 files (the moves, the splits, the barrel test and the checker routing):

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1503 files in <ms>. No fixes applied.
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  45 passed (45)
packages/shared test:       Tests  721 passed (721)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  158 passed | 10 skipped (168)
apps/api test:       Tests  2628 passed | 21 skipped (2649)
apps/web test:  Test Files  249 passed (249)
apps/web test:       Tests  2290 passed (2290)
[<branch> <sha>] refactor(shared): dissolve the monitoring folder into contracts and metrics
 31 files changed, 586 insertions(+), 519 deletions(-)
 rename packages/shared/src/{monitoring => contracts/analytics}/analytics-insights.test.ts (100%)
 rename packages/shared/src/{monitoring => contracts/analytics}/analytics-insights.ts (98%)
 create mode 100644 packages/shared/src/contracts/analytics/descriptive-analytics.ts
 create mode 100644 packages/shared/src/contracts/analytics/survey-analytics.aggregates.test.ts
 rename packages/shared/src/{monitoring/descriptive-analytics-views.test.ts => contracts/analytics/survey-analytics.test.ts} (64%)
 rename packages/shared/src/{monitoring/descriptive-analytics.ts => contracts/analytics/survey-analytics.ts} (68%)
 create mode 100644 packages/shared/src/contracts/analytics/timeline-analytics.test.ts
 create mode 100644 packages/shared/src/contracts/analytics/timeline-analytics.ts
 rename packages/shared/src/{monitoring => contracts/dashboards}/action-counts.ts (94%)
 rename packages/shared/src/{monitoring => contracts/dashboards}/metric-contract.ts (91%)
 rename packages/shared/src/{monitoring => contracts/dashboards}/role-overview.test.ts (100%)
 rename packages/shared/src/{monitoring => contracts/dashboards}/role-overview.ts (98%)
 rename packages/shared/src/{monitoring => contracts/projects}/overview-metrics.test.ts (100%)
 rename packages/shared/src/{monitoring => contracts/projects}/overview-metrics.ts (98%)
 rename packages/shared/src/{monitoring => contracts/projects}/project-map.ts (96%)
 create mode 100644 packages/shared/src/index.test.ts
 rename packages/shared/src/{monitoring => metrics}/metric-cell.ts (100%)
 rename packages/shared/src/{monitoring => metrics}/metric-contract.test.ts (99%)
 rename packages/shared/src/{monitoring => metrics}/metric-fields.ts (100%)
 rename packages/shared/src/{monitoring => metrics}/metric-math.ts (100%)
 create mode 100644 packages/shared/src/metrics/metric-round.ts
 packages/shared/src/rules/rule-metrics.ts          |   4 +-
 scripts/sad/check.test.ts                          |  12 +
 scripts/sad/check.ts                               |   6 +-
 31 files changed, 586 insertions(+), 519 deletions(-)
```

---

### Task 6: Stored project status copies

**Files:**
- Create (gitignored): `.tmp/s7b/task6-edits.json`
- Create: `packages/shared/src/contracts/projects/stored-project-status.test.ts`
- Modify: `packages/shared/src/contracts/dashboards/role-overview.ts`, `packages/shared/src/rules/rule-contract.ts`, `packages/shared/src/rules/rule-metrics.ts` (two places), `apps/api/src/modules/analytics/timeline-analytics.helpers.ts` and its test

S1 left `storedProjectStatuses` and `StoredProjectStatus` in `contracts/projects/project-requests.ts` and the five other copies of the same five codes to S7 (ruling 8). Four are runtime copies inside zod schemas (`role-overview.ts`, `rule-contract.ts`, `rule-metrics.ts` twice); the fifth is a type-only union in the api timeline builder.

- [ ] **Step 1: Pin each schema's accepted values and its enum error text**

A schema built from the shared list reports the same error text as one with an inline list (zod prints the options in order), but only a test says so. `stored-project-status.test.ts` pins the list itself, then, for each runtime copy, that all five codes are accepted and that `ARCHIVED` fails with `Invalid enum value. Expected 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED', received 'ARCHIVED'`. The role overview schema is exercised through `roleOverviewSchema`, the calculation union of `rule-contract.ts` through `metricObservationSchema` (an observation built by `timelineObservation`, with its calculation changed), `rule-metrics.ts` line 188 through `timelineObservation` and line 416 through `budgetObservation`. Create it with the Write tool:

Create `packages/shared/src/contracts/projects/stored-project-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { metricObservationSchema } from '../../rules/rule-contract'
import { budgetObservation, timelineObservation } from '../../rules/rule-metrics'
import { ROLE_OVERVIEW_CONTRACT_VERSION, roleOverviewSchema } from '../dashboards/role-overview'
import { storedProjectStatuses } from './project-requests'

const statuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']
const enumError = `Invalid enum value. Expected ${statuses.map((s) => `'${s}'`).join(' | ')}, received 'ARCHIVED'`
const scope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '20000000-0000-4000-8000-000000000002',
}
const context = { scope, conditionId: 'A', asOf: '2026-09-26T00:00:00.000Z', revision: '1' }

// First issue message of a schema or calculator that throws, or null when it accepts.
function rejection(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return (error as { issues: Array<{ message: string }> }).issues[0].message
  }
}

const overview = (status: string) =>
  roleOverviewSchema.parse({
    contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
    businessDate: '2026-10-04',
    projects: [
      {
        id: scope.projectId,
        code: 'P-1',
        title: 'Project',
        status,
        programName: null,
        managerName: null,
      },
    ],
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
  })

const timeline = (projectStatus: string) =>
  timelineObservation({
    ...context,
    metric: 'PROJECT_REMAINING_DAYS',
    reportingDate: '2026-09-26',
    startDate: '2026-09-20',
    endDate: '2026-09-30',
    projectStatus,
    projectArchived: false,
  })

const budget = (projectStatus: string) =>
  budgetObservation({
    ...context,
    projectStatus,
    projectArchived: false,
    recordCount: 2,
    currencyCount: 1,
    plannedTotal: '200',
    approvedExpenseTotal: '50',
  })

const calculation = (projectStatus: string) =>
  metricObservationSchema.parse({
    ...timeline('ONGOING'),
    calculation: { ...timeline('ONGOING').calculation, projectStatus },
  })

describe('stored project status copies', () => {
  it('shares one list of five codes', () => {
    expect(storedProjectStatuses).toEqual(statuses)
  })

  it.each(statuses)(
    'accepts %s in the role overview, rule calculations and aggregates',
    (status) => {
      expect(overview(status).projects[0].status).toBe(status)
      expect(timeline(status).source?.kind).toBe('PROJECT')
      expect(rejection(() => calculation(status))).toBeNull()
      expect(rejection(() => budget(status))).toBeNull()
    },
  )

  it.each([
    ['role overview', overview],
    ['timeline observation', timeline],
    ['rule calculation', calculation],
    ['aggregate observation', budget],
  ] as const)('rejects an unknown status in the %s with the enum message', (_name, run) => {
    expect(rejection(() => run('ARCHIVED'))).toBe(enumError)
  })
})
```

```bash
pnpm exec biome check --write packages/shared/src/contracts/projects/stored-project-status.test.ts | tail -1
pnpm --filter @pathways/shared exec vitest run src/contracts/projects/stored-project-status.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |×"
```

Expected: the pin passes on the unchanged code: 10 tests in the one file (the list, the accepted codes and the enum error text of each copy):

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

- [ ] **Step 2: Switch the five copies**

`task6-edits.json` replaces each inline list with `storedProjectStatuses` (and the api type union with `StoredProjectStatus`) and adds the imports; Biome sorts them:

Create `.tmp/s7b/task6-edits.json`:

```json
[
 [
  "packages/shared/src/contracts/dashboards/role-overview.ts",
  "z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'])",
  "z.enum(storedProjectStatuses)",
  1
 ],
 [
  "packages/shared/src/contracts/dashboards/role-overview.ts",
  "import { isCalendarDate } from '../../metrics/metric-math'\n",
  "import { isCalendarDate } from '../../metrics/metric-math'\nimport { storedProjectStatuses } from '../projects/project-requests'\n",
  1
 ],
 [
  "packages/shared/src/rules/rule-contract.ts",
  "z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'])",
  "z.enum(storedProjectStatuses)",
  1
 ],
 [
  "packages/shared/src/rules/rule-contract.ts",
  "import { z } from 'zod'\n",
  "import { z } from 'zod'\nimport { storedProjectStatuses } from '../contracts/projects/project-requests'\n",
  1
 ],
 [
  "packages/shared/src/rules/rule-metrics.ts",
  "z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'])",
  "z.enum(storedProjectStatuses)",
  2
 ],
 [
  "packages/shared/src/rules/rule-metrics.ts",
  "import { z } from 'zod'\n",
  "import { z } from 'zod'\nimport { storedProjectStatuses } from '../contracts/projects/project-requests'\n",
  1
 ],
 [
  "apps/api/src/modules/analytics/timeline-analytics.helpers.ts",
  "status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'",
  "status: StoredProjectStatus",
  1
 ],
 [
  "apps/api/src/modules/analytics/timeline-analytics.helpers.ts",
  "import {\n  type MetricCell,\n",
  "import {\n  type MetricCell,\n  type StoredProjectStatus,\n",
  1
 ],
 [
  "apps/api/src/modules/analytics/timeline-analytics.helpers.test.ts",
  "status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED',",
  "status: StoredProjectStatus,",
  1
 ],
 [
  "apps/api/src/modules/analytics/timeline-analytics.helpers.test.ts",
  "import { describe, expect, it } from 'vitest'\n",
  "import type { StoredProjectStatus } from '@pathways/shared'\nimport { describe, expect, it } from 'vitest'\n",
  1
 ]
]
```

```bash
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task6-edits.json
pnpm exec biome check --write packages/shared/src apps/api/src/modules/analytics | tail -1
git grep -n "'PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'" -- packages apps/api/src ':!*.test.ts'
pnpm --filter @pathways/shared typecheck 2>&1 | tail -1
pnpm --filter @pathways/shared test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
node .tmp/s7b/cycles.mjs
```

Expected: 10 replacements in 5 files, Biome finds nothing to fix, the grep prints nothing, shared typecheck is clean, the shared suite is 731 tests in 46 files, and `import loops: 0`:

```
10 replacements in 5 files
Checked 117 files in <ms>. No fixes applied.
$ tsc -p tsconfig.json --noEmit
 Test Files  46 passed (46)
      Tests  731 passed (731)
import loops: 0
```

The grep prints nothing (the one remaining definition is the multi-line list in `project-requests.ts`). The pin test passes unchanged and the shared suite gains its 10 tests.

- [ ] **Step 3: Prove the pin catches a change of the list, then commit**

Adding a sixth code to the shared list must fail the list test and the four rejection cases (each schema now accepts `ARCHIVED`):

```bash
F=packages/shared/src/contracts/projects/project-requests.ts
cp $F .tmp/s7b/pr.bak
sed -i "0,/  'CANCELLED',/s//  'CANCELLED',\n  'ARCHIVED',/" $F
pnpm --filter @pathways/shared exec vitest run src/contracts/projects/stored-project-status.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | cut -c1-120
cp .tmp/s7b/pr.bak $F
git status --short | cut -c1-100
```

Expected: with a sixth code in the list five tests fail (the list test and the four rejection cases), and only the task files differ from the commit afterwards (the list file is restored):

```
   × stored project status copies > shares one list of five codes <ms>
   × stored project status copies > rejects an unknown status in the role overview with the enum message <ms>
   × stored project status copies > rejects an unknown status in the timeline observation with the enum message <ms>
   × stored project status copies > rejects an unknown status in the rule calculation with the enum message <ms>
   × stored project status copies > rejects an unknown status in the aggregate observation with the enum message <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
      Tests  5 failed | 5 passed (10)
 M apps/api/src/modules/analytics/timeline-analytics.helpers.test.ts
 M apps/api/src/modules/analytics/timeline-analytics.helpers.ts
 M packages/shared/src/contracts/dashboards/role-overview.ts
 M packages/shared/src/rules/rule-contract.ts
 M packages/shared/src/rules/rule-metrics.ts
?? packages/shared/src/contracts/projects/stored-project-status.test.ts
```

```bash
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
pnpm lint 2>&1 | tail -1
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A packages apps/api
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(shared): use the stored project status list in the five union copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format="%h %s" HEAD | tail -4
```

Expected: typecheck `Done`, lint clean, shared 731 tests in 46 files, api and web unchanged, and a commit of 6 files:

```
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Checked 1504 files in <ms>. No fixes applied.
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
[<branch> <sha>] refactor(shared): use the stored project status list in the five union copies
 6 files changed, 113 insertions(+), 6 deletions(-)
 create mode 100644 packages/shared/src/contracts/projects/stored-project-status.test.ts
 .../projects/stored-project-status.test.ts         | 102 +++++++++++++++++++++
 packages/shared/src/rules/rule-contract.ts         |   3 +-
 packages/shared/src/rules/rule-metrics.ts          |   5 +-
 6 files changed, 113 insertions(+), 6 deletions(-)
```

---

### Task 7: Records

**Files:**
- Create (gitignored): `.tmp/s7b/task7-edits.json`, `activity-s7b.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.7 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11, MOD-17 rows), `docs/qad-pathways.md` (the rows that name moved test files), `docs/deferred-features.md` (rows 27 to 31 and 68), `docs/sdd-pathways.md` (line 473), `docs/index.md` (CR row), `docs/activity-log.md`

The SAD routing change of this slice (the determinism checker glob and `docs/sad-pathways.md` line 40) was made in Task 5 with the code it follows.

- [ ] **Step 1: Amend the change record, the living docs and the index**

`.tmp/s7b/task7-edits.json` holds two exact replacements in the change record: the S7 row of the section 3.7 roadmap (S7b and S7c replace the single S7b, ruling 1) and the S7b applied paragraph of section 9 after the S7a "Deferred to S7b" line; `@DATE@` is replaced by the day Task 7 runs. Create it with the Write tool:

Create `.tmp/s7b/task7-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "split into S7a (rules) and S7b (analytics and dashboards) |",
  "split into S7a (rules), S7b (analytics and dashboards api and shared) and S7c (analytics and dashboards web) |",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "the `dashboards <-> reports` module pair, `analytics-dashboard.tsx`, `DashboardSeverity` and the analytics and dashboard indexes.",
  "the `dashboards <-> reports` module pair, `analytics-dashboard.tsx`, `DashboardSeverity` and the analytics and dashboard indexes.\n\nS7b applied @DATE@ on the S7b slice branch:\n- Api: the five dashboards and analytics controllers use `requestIdentity`; 13 `Prisma.TransactionClient` annotations became `Tx`; the insights project lookup uses `requireScopedProject`; `dashboards.routes.test.ts` pins 11 routes, the 403 without identity (`ForbiddenException` and its message), the service call of each handler and the registration of both modules in `AppModule`; the insights test pins the 404 text and the lookup; `analytics.module.test.ts` pins that the module resolves from its own imports.\n- Module: the analytics controller, service and helpers and the insights module became one `AnalyticsModule` in `modules/analytics`; `dashboards.dto.ts` became `dashboards.helpers.ts` with the small-cell helpers; the module pair list of `import-boundary.test.ts` is empty and the import loop `dashboards evaluations projects reports` is gone.\n- Split: `descriptive-analytics.ts` became three helpers files (`same lines`, one logger copy) and `analytics.service.ts` went from 515 to 454 lines; the three export header literals became one constant after `analytics-export.helpers.test.ts` pinned them; `role-overview.service.ts` went from 545 to 159 lines, its eight readers are functions in `role-overview-work.service.ts` and `role-overview-queues.service.ts` after `role-overview.rows.test.ts` pinned their caps and orderings (`same tokens: 3361`).\n- Shared: `monitoring/` is gone: contracts in `contracts/dashboards`, `contracts/analytics` (the 558-line `descriptive-analytics.ts` and its 799-line test split by concern, no title lost), `contracts/projects` and `metrics`; the barrel exports the same 302 names and `index.test.ts` pins a name of every moved module and that the field schemas and the rounding helper stay out of it; the five stored project status copies use `storedProjectStatuses` after `stored-project-status.test.ts` pinned each accepted value and error text; the determinism checker routing follows and a test routes one file of each new location.\n- Tests: api gained 4 files and 11 tests, shared 4 files and 12 tests and sad 1 test; every pin written before a change failed under one mutation of the moved line (routes, service calls, module registration, insights lookup, headers, row caps, status, barrel, SAD routing, module wiring).\n- Decisions: S7b and S7c split along the api and web line (ruling 1); `metric-contract.ts` keeps its name and the section 3.6 renames are not done (rulings 4 and 12); `c8-runtime.local.test.ts` keeps its name because the replay scripts name it (ruling 12); `analytics.service.test.ts` (1514 lines, one shared harness) is not split, with the other api tests above 600 lines (ruling 12).\n\nDeferred to S7c: the web analytics and dashboards work (`lib/api/analytics.ts` and `lib/api/dashboards.ts`, the `features/analytics` and `features/dashboard` layouts and indexes, `analytics-dashboard.tsx`, `role-dashboard.tsx`, `DashboardSeverity`).",
  1
 ]
]
```

The path edits follow the moves of Tasks 2, 3 and 5. Rows that cited the deleted `descriptive-analytics-views.test.ts` now cite the files that hold their cases (the survey cases, the aggregate cases and the timeline cases); the others are one-to-one renames. The audit rows MOD-04 (service splits), MOD-11 (zod helper and validation styles) and MOD-17 (layout and naming) each gain a clause:

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g" .tmp/s7b/task7-edits.json
node .tmp/s7b/replace-exact.mjs .tmp/s7b/task7-edits.json
N=packages/shared/src/contracts/analytics
V=packages/shared/src/monitoring/descriptive-analytics-views.test.ts
SURVEY="\`$N/survey-analytics.test.ts\`"
AGG="\`$N/survey-analytics.aggregates.test.ts\`"
TIME="\`$N/timeline-analytics.test.ts\`"
sed -i \
  -e "/^| QAD-T12 /s#\`$V\`#$SURVEY; $AGG; $TIME#" \
  -e "/^| QAD-T14 /s#\`$V\`#$SURVEY; $AGG#" \
  -e "/^| QAD-T15 /s#\`$V\`#$TIME#" \
  -e "/^| QAD-T17 /s#\`$V\`#$SURVEY#" \
  -e "/^| QAD-T27 /s#\`$V\`#$SURVEY#" \
  -e "/^| QAD-T28 /s#\`$V\`#$SURVEY; $AGG#" \
  -e "/^| QAD-T29 /s#\`$V\`#$TIME#" \
  -e 's#packages/shared/src/monitoring/metric-contract\.test\.ts#packages/shared/src/metrics/metric-contract.test.ts#g' \
  -e 's#packages/shared/src/monitoring/overview-metrics\.test\.ts#packages/shared/src/contracts/projects/overview-metrics.test.ts#g' \
  -e 's#apps/api/src/modules/dashboards/analytics\.service\.test\.ts#apps/api/src/modules/analytics/analytics.service.test.ts#g' \
  -e 's#apps/api/src/modules/analytics-insights/analytics-insights\.test\.ts#apps/api/src/modules/analytics/analytics-insights.service.test.ts#g' \
  docs/qad-pathways.md
sed -i \
  -e 's#apps/api/src/modules/analytics-insights/insights-math\.ts#apps/api/src/modules/analytics/analytics-insights.helpers.ts#g' \
  -e 's#apps/api/src/modules/dashboards/analytics\.service\.ts#apps/api/src/modules/analytics/analytics.service.ts#g' \
  -e 's#apps/api/src/modules/analytics-insights`#apps/api/src/modules/analytics`#g' \
  -e 's#packages/shared/src/monitoring/analytics-insights\.ts#packages/shared/src/contracts/analytics/analytics-insights.ts#g' \
  docs/deferred-features.md
sed -i 's#packages/shared/src/monitoring/analytics-insights\.ts#packages/shared/src/contracts/analytics/analytics-insights.ts#g' docs/sdd-pathways.md
sed -i -e '/^| MOD-04 /s/\. |$/; analytics, dashboards and role overview services split by S7b. |/' \
  -e '/^| MOD-11 /s/\. |$/; the dashboards zod helper renamed and the stored project status copies shared by S7b. |/' \
  -e '/^| MOD-17 /s/\. |$/; the shared monitoring folder dissolved and the dashboards and analytics api laid out by S7b. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
sed -i '/^| \[cr-pathways-codebase-modularization\]/s/ and S7a applied, S7b next/, S7a and S7b applied, S7c next/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
git grep -nE "src/monitoring|modules/analytics-insights|modules/dashboards/(analytics|descriptive|dashboards\.dto)|insights-math|dashboards\.dto" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' | cut -c1-110
```

Expected: the change record takes 2 replacements, the diffstat lists the six documents, the three audit clauses and the index status print (the middle of the status depends on the earlier slices), and the last grep prints nothing:

```
2 replacements in 1 files
 .../audit-pathways-codebase-modularity-20261009.md |  6 +-
 docs/cr-pathways-codebase-modularization.md        | 12 +++-
 docs/deferred-features.md                          | 12 ++--
 docs/index.md                                      |  2 +-
 docs/qad-pathways.md                               | 70 +++++++++++-----------
 docs/sdd-pathways.md                               |  2 +-
 6 files changed, 57 insertions(+), 47 deletions(-)
alytics, dashboards and role overview services split by S7b. |
 renamed and the stored project status copies shared by S7b. |
solved and the dashboards and analytics api laid out by S7b. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a and S7b applied, S7c next |
```

The edits replace the two change record texts (2 replacements in 1 file), the QAD, deferred feature and SDD paths, and the three audit rows; the index status ends `S6c, S7a and S7b applied, S7c next` (S7a wrote `S6c and S7a applied, S7b next`; if the sed does not match, edit the row by hand to say that S7b is applied and S7c is next). The last command lists nothing: every path the living docs name follows the moves (the historical documents, the audit rows and the change records keep the names they were written with).

- [ ] **Step 2: Activity log**

`.tmp/s7b/activity-s7b.md` is the S7b section of the activity log, with the commit hashes of Tasks 1 to 6 as `@H1@` to `@H6@`:

Create `.tmp/s7b/activity-s7b.md`:

```md

## @DATE@ Modularization S7b analytics and dashboards api and shared (S7b slice branch)
- Task 1 (@H1@): `dashboards.routes.test.ts` pins 11 routes, the 403, the service call of each handler and the module registration and the insights test pins its 404 text and lookup; the five controllers use `requestIdentity`, 13 `Prisma.TransactionClient` annotations became `Tx` and the insights project lookup uses `requireScopedProject`; api +5 tests.
- Task 2 (@H2@): `AnalyticsController`, `AnalyticsService`, the descriptive analytics file, the insights module and their tests moved into one `AnalyticsModule` in `modules/analytics`, `dashboards.dto.ts` became `dashboards.helpers.ts` with the small-cell helpers, the module pair list is empty (import loops 1 to 0) and `analytics.module.test.ts` pins the module wiring; api +1 test.
- Task 3 (@H3@): `descriptive-analytics.ts` split into three helpers files and the export code left `analytics.service.ts` (515 to 454 lines), the three header literals became one constant after a header test; api +2 tests.
- Task 4 (@H4@): the eight role overview readers became functions in `role-overview-work.service.ts` and `role-overview-queues.service.ts` after a row cap and order test, `role-overview.service.ts` 545 to 159 lines; api +3 tests.
- Task 5 (@H5@): the shared `monitoring` folder dissolved into `contracts/dashboards`, `contracts/analytics`, `contracts/projects` and `metrics`, `descriptive-analytics.ts` and its test split by concern (no title lost), the barrel exports the same 302 names, the determinism checker routing follows and `index.test.ts` pins the barrel; shared +2 tests, sad +1 test.
- Task 6 (@H6@): the five stored project status copies use `storedProjectStatuses` after a test pinned each accepted value and error text; shared +10 tests.
- Task 7: the change record, audit, QAD, SDD and deferred features rows follow the new paths and the S7b disposition is recorded.
- Decisions: the S7b decisions are recorded in the change record section 9; the plan stays until S7c is planned because it holds the S7c outline.
- Deferred to S7c: the web analytics and dashboards work. Not split: `analytics.service.test.ts` (1514 lines after Task 2), with the other api tests above 600 lines.
```

```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^refactor(api): use requestIdentity, Tx and requireScopedProject')
H2=$(git log -1 --format=%h --grep='^refactor(api): move analytics into modules/analytics')
H3=$(git log -1 --format=%h --grep='^refactor(api): split the descriptive analytics file')
H4=$(git log -1 --format=%h --grep='^refactor(api): move the role overview readers')
H5=$(git log -1 --format=%h --grep='^refactor(shared): dissolve the monitoring folder')
H6=$(git log -1 --format=%h --grep='^refactor(shared): use the stored project status list')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4@/$H4/" -e "s/@H5@/$H5/" -e "s/@H6@/$H6/" .tmp/s7b/activity-s7b.md
grep -c "@H[0-9]@\|@DATE@" .tmp/s7b/activity-s7b.md
cat .tmp/s7b/activity-s7b.md >> docs/activity-log.md
tail -11 docs/activity-log.md | cut -c1-90
```

Expected: no placeholder is left (`0`) and the log ends with the S7b section, each task with the hash of its commit (`YYYY-MM-DD` is the day Task 7 runs and `<sha>` the short hash of the commit):

```
0

## YYYY-MM-DD Modularization S7b analytics and dashboards api and shared (S7b slice branch
- Task 1 (<sha>): `dashboards.routes.test.ts` pins 11 routes, the 403, the service call 
- Task 2 (<sha>): `AnalyticsController`, `AnalyticsService`, the descriptive analytics f
- Task 3 (<sha>): `descriptive-analytics.ts` split into three helpers files and the expo
- Task 4 (<sha>): the eight role overview readers became functions in `role-overview-wor
- Task 5 (<sha>): the shared `monitoring` folder dissolved into `contracts/dashboards`, 
- Task 6 (<sha>): the five stored project status copies use `storedProjectStatuses` afte
- Task 7: the change record, audit, QAD, SDD and deferred features rows follow the new pat
- Decisions: the S7b decisions are recorded in the change record section 9; the plan stays
- Deferred to S7c: the web analytics and dashboards work. Not split: `analytics.service.te
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record modularization S7b

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 7 files (the six documents and the log):

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1504 files in <ms>. No fixes applied.
[<branch> <sha>] docs: record modularization S7b
 7 files changed, 68 insertions(+), 47 deletions(-)
```

---

### Task 8: Full release gates

This slice opens no pull request: it is stacked below the next slice, the controller pushes the branches, and the one pull request into `dev` that follows the last slice of the series carries the DB replay and the other CI gates (ruling 10). The gates below run on the slice branch and are recorded in the activity log.

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 | tail -1
pnpm typecheck 2>&1 | grep -E "Done|error" | sort
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api exec nest build > .tmp/s7b/api-build.log 2>&1; echo "api build exit $?"
.tmp/s7b/build-routes.sh gates
node .tmp/s7b/compare-routes.mjs .tmp/s7b/routes-baseline.txt .tmp/s7b/routes-gates.txt | tee .tmp/s7b/compare-gates.txt
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```

Expected: Biome clean, the typecheck and test summaries, the api build exit code, the web build exit code with the Middleware line against `M0`, the route comparison and the docs check:

```
Checked 1504 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
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
api build exit 0
exit 0
ƒ Middleware                                                      103 kB
/alerts: 293 kB -> 294 kB (+1.0)
/alerts/repository: 313 kB -> 314 kB (+1.0)
/analytics: 655 kB -> 656 kB (+1.0)
/dashboard: 667 kB -> 668 kB (+1.0)
/projects/[projectId]: 310 kB -> 311 kB (+1.0)
/projects/[projectId]/activities: 336 kB -> 337 kB (+1.0)
/projects/[projectId]/activities/[activityId]: 336 kB -> 337 kB (+1.0)
/projects/[projectId]/budget: 314 kB -> 316 kB (+2.0)
/projects/[projectId]/edit: 296 kB -> 297 kB (+1.0)
/projects/[projectId]/evidence: 314 kB -> 316 kB (+2.0)
/projects/[projectId]/indicators: 283 kB -> 284 kB (+1.0)
/projects/[projectId]/monitor-evaluate: 314 kB -> 316 kB (+2.0)
/projects/new: 296 kB -> 297 kB (+1.0)
/recommendations/[recommendationId]: 293 kB -> 294 kB (+1.0)
/settings/users: 286 kB -> 287 kB (+1.0)
/transparency: 260 kB -> 261 kB (+1.0)
routes 72, different 16

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```

The typecheck and test lines are the Task 0 baselines with the deltas of this slice: config, imports, web and sad (plus 1 for the SAD routing test) follow from `baseline.txt`; api gains 4 test files and 11 tests (`dashboards.routes.test.ts` 4, the insights case 1, `analytics.module.test.ts` 1, `analytics-export.helpers.test.ts` 2, `role-overview.rows.test.ts` 3); shared gains 4 test files and 12 tests (`index.test.ts` 2, `stored-project-status.test.ts` 10, and the views test that became three files); web is unchanged. The `ZodPipe` 5 s test, `beneficiary-detail-loader.test.tsx` and `imports.service.test.ts` (the duplicate metadata keys case failed once in a full run of the replay and passed alone) are known timing flakes: rerun them alone if one fails, and rerun any run that ends without its summary line (a killed vitest process prints none). The route comparison is against the Task 0 build: this slice changes no web source, but the web app bundles the compiled `@pathways/shared` and the split adds three shared modules, each with its own module wrapper, so routes that load the shared bundle grow by 1 kB and a few by 2 kB (the replay printed 16 of 72 routes bigger, 13 by 1.0 and three by 2.0, which is two chunks each rounding up). A route may print 1 kB more or less from one build to the next at the printed precision: stop when a route is more than 3 kB bigger, is new or is removed, and Middleware must equal `M0` within 1 kB. `docs:check` ends with the baseline failures and warning.

- [ ] **Step 2: Handoff checks for S8 and the old paths**

S8 expects, after S7b, exactly its five DTO files and two controllers that repeat the identity check (S8 plan, Task 0 Step 2). Task 0 printed six DTO files (with `dashboards.dto.ts`) and the five dashboards and analytics controllers beside the two S8 ones:

```bash
git ls-files 'apps/api/src/*.dto.ts'
git grep -l "Application profile is required\.'" -- apps/api/src ':!*.test.ts'
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/analytics apps/api/src/modules/dashboards ':!*.test.ts' | wc -l
test -d apps/api/src/modules/analytics-insights && echo "old insights folder present"
test -d packages/shared/src/monitoring && echo "old monitoring folder present"
git grep -n "analytics-insights.module\|AnalyticsInsightsModule\|dashboards/descriptive-analytics\|monitoring/" -- apps packages scripts ':!apps/web/src/app' ':!apps/web/src/lib' ':!apps/web/src/features' | cut -c1-120
node .tmp/s7b/cycles.mjs
git grep -c "'dashboards <-> reports'" -- apps/api/src | wc -l
```

Expected: the five S8 DTO files, the two S8 controllers (and the helper that holds the message), no `Prisma.TransactionClient` in the two modules (`0`), no old insights folder, no removed specifier outside the web app, `import loops: 0` and no pair string (`0`).:

```
apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts
apps/api/src/modules/auth/signin-lockout.dto.ts
apps/api/src/modules/profile/profile.dto.ts
apps/api/src/modules/public/public.dto.ts
apps/api/src/modules/users/users.dto.ts
apps/api/src/common/authz/request-identity.ts
apps/api/src/modules/auth/authorized-data.controller.ts
apps/api/src/modules/users/users.controller.ts
0
import loops: 0
0
```

The DTO list is the five S8 files (`beneficiary-step-up-pin`, `signin-lockout`, `profile`, `public` and `users`), the identity grep lists `authorized-data.controller.ts` and `users.controller.ts` plus `request-identity.ts` (the helper itself), and no production `Prisma.TransactionClient` is left in the two modules (the count is `0`). The old folders are gone, the grep for removed specifiers prints nothing outside the web app (the web app mentions `monitoring/` only in route paths and client URLs), there are no import loops, and the module pair list string is gone.

- [ ] **Step 3: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S7b changes no migration and no SQL, so the CI replay of the final pull request of the series (expect 171 PASS, 0 FAIL) is the gate when the replay cannot run here; record which one ran. (After W1 the folder is `replay/`; S7b runs before W1.)

Expected: the user is root, `pwsh` and PostgreSQL 18 exist, `supabase` is missing, Docker exists, the historical migration integrity check passes and the replay fails at once because `initdb` refuses to run as root, so the replay is recorded as pending (CI of the final pull request):

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

- [ ] **Step 4: Local stack, compiled API boot, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, `pnpm dev:local` boot and the route curls, both Playwright configs and the browser smoke) as pending local run in the activity log gate line and list it for the developer; do not skip Steps 1, 2 or 5. Stop anything on ports 3000 and 4000 first, then:

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
for p in dashboards/home dashboards/monitoring dashboards/saddd dashboards/action-counts dashboards/role-overview analytics/descriptive analytics/descriptive/export analytics/descriptive/export/preview analytics/insights/participation analytics/insights/indicator-trends analytics/insights/budget; do curl -s -o /dev/null -w "$p %{http_code}\n" http://127.0.0.1:4000/api/$p; done
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; each of the 11 paths answers 401 (registered and guarded), never 404; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate (it is the check that the compiled `AnalyticsModule` and `DashboardsModule` resolve, beside `analytics.module.test.ts`); auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev (this slice changes no web code, so the smoke only has to show that the api answers the same): open `/dashboard` as each role you can sign in as (the role overview sections, the action counts, the monitoring figures and the SADDD panel), open `/analytics` and each of its views (KPI, participation, survey, timeline) and each export format (CSV, XLSX, XLS, PDF) and the export preview, and open the three insights views (participation, indicator trends, budget).

- [ ] **Step 5: SAD review**

```bash
mkdir -p .tmp/sad/s7b
pnpm sad:check --base "$(cat .tmp/s7b/base-sha)" --head HEAD --output .tmp/sad/s7b/manifest.json > .tmp/sad/s7b/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s7b/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0 and the manifest lists the roles with the number of paths each reviews (the counts move by a few with the base):

```
exit 0
organization-isolation-checker 16
beneficiary-privacy-guardian 27
rule-engine-determinism-checker 23
restraint-guardian 2
design-qa-agent 87
```

`.tmp/sad/s7b/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. The roles are the ones the globs of `docs/sad-pathways.md` give for this diff: `design-qa-agent` for every changed source file, `restraint-guardian` for `scripts/sad`, `organization-isolation-checker` for the `.service.ts` and `.helpers.ts` files and `packages/shared/src/rbac` untouched, `beneficiary-privacy-guardian` for the five controllers and the shared contracts, and `rule-engine-determinism-checker` for the moved metric, dashboard and analytics contracts; the counts move by a few paths if the branch holds other slices, because the base is the Task 0 head.

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`). A role above 60 paths goes out in packets of at most 60: `design-qa-agent` needs two (the second takes the paths after the sixtieth), and any other role whose count prints above 60 needs the same. Transcribe each reply into `.tmp/sad/s7b/reply-<role>.txt` (one file per role, the packets' lines joined), copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s7b/assemble.mjs`, run `node .tmp/sad/s7b/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s7b/base-sha)" --head HEAD --reviews .tmp/sad/s7b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. A planning copy without subagents cannot dispatch the roles, so the sign-off is then pending for the cloud run.

- [ ] **Step 6: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The replay bullet, to adapt with your own numbers (every figure from the Step 1 output):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 731 in 46 files, imports 94, api 2628 passed and 21 skipped in 158 files, web 249 files and 2290 tests, sad 58; docs check 6 failures and 1 warning (baseline); api build and production web build exit 0 with Middleware at M0 (103 kB in this container); against the Task 0 build 16 of 72 routes are bigger, 13 by 1 kB and three by 2 kB (the three new shared modules), none beyond the 3 kB stop; local DB replay (initdb refuses root), seeds, e2e and browser smoke pending local run; SAD manifest of 16, 27, 23, 2 and 87 paths with sign-off pending; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record modularization S7b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one commit with one changed file:

```
[<branch> <sha>] docs: record modularization S7b release gate results
 1 file changed, 1 insertion(+)
```

- [ ] **Step 7: Keep the plan for S7c**

The plan holds the S7c outline, so its `docs/superpowers/plans` copy stays, and so does the S7 plan copy that holds the S7a plan: the controller removes executed plan copies after the final merge (ruling 10). In `docs/index.md` section 1.6, change the status of this plan's `superpowers/plans` row only (not the `handoff/` row) to `S7b executed; holds the S7c outline`:

```bash
sed -i '/(superpowers\/plans\/.*modularization-s7b-analytics-dashboards/s/| In progress |$/| S7b executed; holds the S7c outline |/' docs/index.md
git diff --stat docs/index.md | cat
grep -c "S7b executed; holds the S7c outline" docs/index.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: mark S7b executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the index row changes (1 line), exactly one row carries the new status (`1`), docs check has its baseline, and a commit of one file:

```
 docs/index.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
1

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: mark S7b executed in the plan index
 1 file changed, 1 insertion(+), 1 deletion(-)
```

---

## S7c outline (analytics and dashboards web, its own slice branch)

To be written as its own plan from the S7b tip; that plan's Task 0 saves a route table of a clean build before any web edit (as every web slice does) and its records task names S7c in CR 3.7 (S7b already does). It holds about seven tasks; branch `refactor/s7c-analytics-web` is assigned by the environment, SAD evidence goes to `.tmp/sad/s7c/`. The S7 plan's outline numbers (Tasks 6 to 12) are the source; the changes S7a and S7b made to them are:

- **Interfaces from S7a and S7b:** `lib/api/rules.ts` and `features/rules` (S7a; analytics and rules no longer import each other, so `features/analytics` holds no rules file); the shared contracts the web reads sit in `contracts/analytics`, `contracts/dashboards` and `contracts/projects` and are still imported only through `@pathways/shared` (S7b changes no web import); `analytics.service.ts` and `analytics-insights` answer the same routes (S7b changes no route).
- **Task 1, `lib/api/analytics.ts` and `lib/api/dashboards.ts`:** move `getMonitoringDashboard`, `getDashboardActionCounts`, `getRoleOverview`, `getSadddDashboard`, `getDescriptiveAnalytics`, `getSurveyAnalytics`, `getTimelineAnalytics`, the export and export preview methods and `getDashboard(role)` out of `pathways-client.ts`, plus the insights fetchers in `features/analytics/use-analytics-insights.ts`; every `pathways-client` mock factory that stubs one of them splits into a `@/lib/api/...` mock in the same commit, counted before and after (S7a Review Focus 1); characterization tests run against the old and the new client first (S6b Task 2 pattern).
- **Task 2, `features/analytics` layout:** `components/`, `hooks/`, `analytics.reads.ts`, `analytics.utils.ts`, `analytics.copy.ts` with `move-files.mjs` and `split-declarations.mjs` (S7b creates both in `.tmp/s7b/`; the web version of `split-declarations.mjs` takes the alias form of S7a); the project map card stays in analytics (S1 kept its UI here).
- **Task 3, `analytics-dashboard.tsx` (1745 lines, MOD-06):** first move the private panels verbatim (`SurveyAnalyticsPanel`, `TimelineAnalyticsPanel`, `DescriptiveStatisticsTable`, `ChartPanel`, `UnavailableChart`) to `components/` and the constants (`analysisViews`, `visualizationTypes`, survey messages, `exportFormats`) to `analytics.copy.ts`; then extract the reads and state of the 1207-line `AnalyticsDashboard` into hooks, with characterization tests over `analytics-dashboard.test.tsx` (1691 lines, split by concern above 600) before any line moves.
- **Task 4, `features/dashboard`:** `role-dashboard.tsx` (693 lines) split the same way; its imports of `activity-detail-panel`, `activity-proof-dialog`, `project-utils` and `use-project-reads` go through the projects index (MOD-15); S7c may share the three `projects.read` list keys only where fetcher, permission and freshness match.
- **Task 5, surfaces and duplicates:** `features/analytics/index.ts` and `features/dashboard/index.ts`; add `'analytics'` and `'dashboard'` to `indexedFeatures` and `'@/features/analytics'` and `'@/features/dashboard'` to `optimizePackageImports` in `apps/web/next.config.ts`; the `/analytics` and `/dashboard` pages, `pinned-charts.tsx` (5 analytics imports) and `features/projects/indicators/components/project-indicators-workspace.tsx` (`use-monitoring-read`, left by S3) import through the indexes, with route First Load JS compared to the Task 0 build as in S7a Task 6. MOD-16: analytics and dashboard read keys used twice; `DashboardSeverity` in `types/pathways.ts` (F4b deferral); `statusTone` in `executive-dashboard.tsx` kept per vocabulary (F4b ruling 3).
- **Task 6, records** and **Task 7, gates** as S7b Tasks 7 and 8, with the smoke of `/dashboard` for each role, `/analytics` (every view and every export format), the pinned charts, the SADDD panel and the project map. The S7c plan updates the CR 3.7 row's "next" status and the S8 plan's Task 0 text only if S8a is to wait for S7c (it need not: S8a touches the api controllers that S7b already finished, and S8b recounts the web figures in its own Task 0).
