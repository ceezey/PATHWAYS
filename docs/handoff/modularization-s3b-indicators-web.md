# S3b Indicators Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the indicator web code its own client module, feature folder and read keys, cut the two oversized indicator components, and retire the web `ProjectIndicator` alias, with no change to any screen, request, response, permission decision or route bundle size.

**Architecture:** S3b is the web half of S3 (S3a, the contracts and api, is merged). The eight indicator methods of `pathways-client.ts` and the 26-line library client become `indicatorsClient` and `indicatorLibraryClient` in `lib/api/indicators.ts`; callers and test mocks follow by script with exact counts, after characterization tests that run against the old and the new code. The seven indicator files of `features/projects` move to `features/projects/indicators/`, the 952-line workspace and the 401-line library manager are split by declaration (proven line by line), the library and project indicator read keys move to `indicators.reads.ts`, and the web alias `ProjectIndicator` is replaced by `IndicatorResponse` from the shared package. Mechanical edits use one-off Node scripts under `.tmp/s3b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run on an exported copy of local dev `bf8ef5e6` with S3a Tasks 1 to 7 applied as its plan scripts them, and the whole sequence was then replayed from that baseline by one driver: lint, typecheck, the config, shared, imports, api, web and sad suites, the production build and the route comparisons pass, and the counts quoted below come from that replay.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.6, 3.7 and 9 including the S1b, S2b and S3a dispositions and the "Deferred to S3b" paragraph of S3a) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15 and MOD-16 for the indicator web modules).

## Rulings

Controller rulings for S3b. Each was checked on an exported copy of local dev `bf8ef5e6` after S3a; Task 0 recounts them.

1. **One plan, eight tasks (0 to 7), no S3b1/S3b2 split.** The client half (Tasks 1 and 2) and the layout, split and reads half (Tasks 3 to 5) each end green, so a reviewer can stop at the Task 2 or Task 4 boundary. Cost if wrong: executor fatigue; run Tasks 5 to 7 as S3b2.
2. **One client module with two objects, no `.schema` file.** `indicatorsClient` (8 methods) and `indicatorLibraryClient` (3 methods, merged from `lib/services/indicator-library-client.ts`, which is deleted) live in `lib/api/indicators.ts` with the same method names, parameters and results as before. The S2b `.schema.ts` files hold hand-written parsers; the indicator responses are parsed by the shared zod schemas (`indicatorResponse`, `indicatorListResponse`, `indicatorLibraryEntryResponse`, S3a ruling 8), so no parser moves. Cost if wrong: a rename.
3. **Inputs take the contract types and nothing is cast.** The three local aliases of `pathways-client.ts` (`CreateIndicatorInput`, `UpdateIndicatorInput`, `UseLibraryEntryDraft`) become `Omit<CreateIndicatorRequest, 'clientMutationId'>`, `Omit<UpdateIndicatorRequest, 'clientMutationId'>` and `Omit<CreateIndicatorFromLibraryRequest, 'clientMutationId'>` on the methods; results are `IndicatorResponse`. `recordIndicatorMeasurement` keeps its own ticket call (`sourceMutationTickets.execute` with `requestId`, `keyField: 'clientMeasurementId'`, `allowLegacy: true`) and so keeps throwing `SourceMutationRecoveryError` unwrapped, where the other four mutations go through `requestSourceMutation` and answer a `PathwaysClientError`; Task 1 pins both. The `indicators` branch of `recoverSourceMutation` stays in `pathways-client.ts` with its activity branches. Cost if wrong: restore from git.
4. **Characterization before removal: both clients run the same cases.** Task 1 writes `lib/api/indicators.test.ts` as `describe.each` tables over `pathwaysClient` and `indicatorsClient` (11 cases each) and over the old and new library client (2 cases each): 26 runs, proven against the code being replaced before it goes; Task 2 drops the old rows (13 runs remain). The cases pin paths, encoded ids, abort signals, the five request bodies with their generated request ids, the replay receipt coming back as the receipt, the refusal without a mutation context before any request, the measurement key field and legacy answer, and the strict response shape. Cost if wrong: none.
5. **Mocks are repointed by script, with exact counts.** 41 test files mock `@/lib/services/pathways-client` (the S2b record says 40; the dev baseline measures 41); 3 factories name an indicator method inline and the others pass a shared object. `split-client-mocks.mjs` gives every such test a `vi.mock('@/lib/api/indicators', ...)`: 7 shared-object factories get a second mock, 2 inline factories are split, and `rule-editor.test.tsx`, whose only key was the indicator method, keeps an empty `pathwaysClient: {}` factory so the real client is never loaded (S2b renamed such factories instead). The library manager test's mock of the deleted library client is repointed by `sed`. Cost if wrong: a component under test sees `undefined` for a method; the Task 2 scans (`factories 41, naming 0` and `factories 11, naming 0`) and the suite catch it.
6. **17 calls, not 18, and two read cases, not three.** The outline counted 18 call sites in 8 files; on dev there are 17 `pathwaysClient.<method>` calls in 8 files (the 18th text hit is a JSDoc mention in `projects.reads.ts`). `pathways-client.monitoring.test.ts` holds two indicator cases (the denied read and the goal-free contract), not three; they need the real request stack with a stubbed `fetch`, so they cannot join `indicators.test.ts` (which replaces `requestFoundation`) and move verbatim to `lib/api/indicators.read.test.ts`. Cost if wrong: none.
7. **Layout.** `features/projects/indicators/` holds `components/` (the six component files and three tests: `project-indicators-workspace`, `indicator-form`, `indicator-editor`, `indicator-library-manager`, `library-entry-form`, `use-from-library`), `indicators.copy.ts` (was `indicator-recipes.ts`), `indicators.utils.ts` and `indicators.reads.ts`. There is no `hooks/` folder (no hook is extracted) and no `indicators/index.ts`: the feature index lists `IndicatorLibraryManager` and `ProjectIndicatorsWorkspace` by their `./indicators/components/*` leaf paths, as S2b measured (a sub-index grows `/dashboard` by 23 kB). The two app pages already import both through `@/features/projects` since S1b, so no page changes. Cost if wrong: later slices repoint by path.
8. **Splits are verbatim except for exports and imports, proven line by line.** `split-module.mjs` (the S3a script, extended with an `@original` import header) cuts a file by declared name and `same-lines.mjs` must print `lost 0`. The workspace goes from 952 to 414 lines in Task 4 (408 once Task 5 moves its library read) beside `indicator-form.tsx` 255, `indicator-editor.tsx` 187, `indicators.utils.ts` 100 and `indicators.copy.ts` (11 to 50); the library manager goes from 401 to 208 (206) beside `library-entry-form.tsx` 202. `IndicatorForm` stays file-private beside the one exported `NewIndicator`, and `IndicatorEditor` and `NewEntry` are each their file's one export (CR 3.3); `text` and `optional` are exported from the utils because the editor shares them. The `CreateIndicatorDraftRequest as CreateIndicatorInput` alias becomes the contract name. The library manager has an import below its first declaration; Task 4 hoists it before the split so it is not cut with a declaration. No new characterization test is added: `project-indicators-workspace.test.tsx` and `.reload.test.tsx` render and drive the workspace, and the moved bodies are proven identical. Cost if wrong: review time.
9. **Reads: the library and project-indicator keys move; the binding choices read stays in the workspace.** `indicators.reads.ts` holds `useIndicatorLibraryRead(enabled?, options?)` (one `indicator-library` key; the page passes nothing, the use-from-library card passes `canCreate && canReadLibrary` and summary freshness) and `useProjectIndicatorsRead` (the `project-indicators` key and its hook leave `projects.reads.ts`; the only user is the activities workspace). A first draft also moved the `indicator-binding-choices` read, which needs `pathwaysClient` for the digital forms; the library page then loaded `pathways-client` and `/indicators/library` grew from 280 to 296 kB. The criterion is no route more than 2 kB bigger, so that read stays inline in the workspace (its route already loads both clients) and CR 3.3 records the rule. `activities.reads.ts` and `projects.reads.ts` keep their other keys. Cost if wrong: one cache entry or a route size.
10. **The alias goes: six importers, not seven.** The outline named `project-indicators-workspace.tsx` as a seventh `ProjectIndicator` importer; on dev it already imports `IndicatorResponse` from `@pathways/shared`. The six that remain (`analytics-dashboard.tsx`, `analytics-reporting-periods.ts`, `activity-detail-content.tsx`, `activity-detail-panel.tsx`, `activity-detail-sections.tsx`, `reporting-workspace.tsx`) import `IndicatorResponse` from `@pathways/shared` and `types/pathways.ts` drops the alias and its import. The `Indicator` view model (`id`, `projectId`, `code`, `label`) stays: no contract covers it (CR 3.6). `reporting-workspace.tsx` is production-dead and S6b deletes it; S3b only keeps it compiling. Cost if wrong: a rename.
11. **No new SAD routing.** The dry-run manifest needs `design-qa-agent` (49 files), `beneficiary-privacy-guardian` (6: the new `lib/api` files and tests, `pathways-client.ts` and its monitoring test, and the deleted library client) and `rule-engine-determinism-checker` (2: `rule-editor.tsx` and its test, whose fetcher and mock changed). `features/projects/indicators/**` needs design-qa only. Cost if wrong: one glob in `scripts/sad/check.ts`.
12. **Every production build starts from a clean `.next`** (S2b ruling 10) and route tables are compared with `compare-routes.mjs`: Task 3 Step 1 re-measures a baseline right before the layout move because Tasks 1 and 2 already moved eight routes (seven by 1 kB or less, `/alerts/repository` down 10 kB because the indicator parsers leave the shared client chunk); the pass criterion is no route more than 2 kB bigger than that baseline and Middleware at `M0` (102 kB). Cost if wrong: a misleading `Module not found` after a move.
13. **Not done in S3b (recorded in CR section 9):** `features/analytics/use-monitoring-read` stays an unindexed import of the workspace until S7 gives analytics an index (MOD-15); `indicator-trend-chart.tsx` stays with analytics (S7); the other read keys of analytics, rules board, collection and dashboard that call the indicator client keep their own keys (their slices); `recoverSourceMutation` keeps its indicator branch; the `indicator-binding-choices` read (ruling 9).
14. Cross-plan: the lines other plans must change are listed in the S3b summary (S5 collection mock note, S6 `reporting-workspace.tsx` wording, S7 fetcher and path wording, S8 importer note, `cross-plan-review.md`). Cost if wrong: a later Task 0 stops on a missing path or count.

## Interfaces assumed from earlier sub-projects

- S3a (from `@pathways/shared`): `CreateIndicatorRequest`, `CreateIndicatorDraftRequest`, `UpdateIndicatorRequest`, `CreateIndicatorFromLibraryRequest`, `RecordIndicatorMeasurementRequest`, `CreateIndicatorLibraryEntryRequest`, `IndicatorResponse`, `IndicatorLibraryEntryResponse`, `indicatorResponse`, `indicatorListResponse`, `indicatorLibraryEntryResponse`, `createIndicatorDraftRequest`, `createIndicatorLibraryEntryRequest`, `createIndicatorFromLibraryRequest`, `recordIndicatorMeasurementRequest` (under `packages/shared/src/contracts/indicators`).
- S1b: `requestSourceMutation<T>(path, method, body, context, parse)` in `apps/web/src/lib/api/core/source-mutation-request.ts`; `projectsClient`; `apps/web/src/features/projects/index.ts` with `components/`, `team/`, `projects.reads.ts`, `projects.utils.ts`; `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`; `experimental.optimizePackageImports: ['@/features/projects']` in `apps/web/next.config.ts`.
- S2b: `activitiesClient` in `lib/api/activities.ts`; the `features/projects/activities/{components,hooks}` layout; `project-activities-workspace.tsx` and the activity detail files import the alias `ProjectIndicator` and `useProjectIndicatorsRead` as of dev.
- F4b: `PathwaysClientError`, `requestFoundation` from `apps/web/src/lib/api/core/request.ts`; `useAuthorizedRead` from `apps/web/src/hooks/use-authorized-read.ts`; `stickyTableHeadClass`.

## Produces (names later plans consume)

- `indicatorsClient` in `apps/web/src/lib/api/indicators.ts`: `getProjectIndicators(projectId, signal?)`, `getProjectIndicatorValues(projectId, signal?)`, `createProjectIndicator(projectId, input, context?)`, `createProjectIndicatorFromLibrary(projectId, input, context?)`, `updateProjectIndicator(projectId, indicatorId, input, context?)`, `recordIndicatorMeasurement(projectId, indicatorId, input, context?)`, `archiveProjectIndicator(projectId, indicatorId, expectedRevision, context?)`, `getIndicators(projectId?, signal?)`; same parameters and results as the `PathwaysClient` methods they replace, with `IndicatorResponse` for `ProjectIndicator`.
- `indicatorLibraryClient` in the same file: `list()`, `create(input: CreateIndicatorLibraryEntryRequest)`, `archive(entryId)`.
- `useIndicatorLibraryRead(enabled?, options?)` and `useProjectIndicatorsRead(projectId, enabled?)` from `features/projects/indicators/indicators.reads.ts`; `recipeNames` and the recipe constants from `indicators.copy.ts`; `generateIndicatorCode`, `suggestIndicatorCode`, `indicatorInputFromForm`, `indicatorPeriod` from `indicators.utils.ts`.
- Feature: `features/projects/indicators/` as in ruling 7; `features/projects/index.ts` exports `IndicatorLibraryManager` and `ProjectIndicatorsWorkspace` from their `./indicators/components/*` leaf paths.
- No `ProjectIndicator` in `types/pathways.ts`; `Indicator` stays.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request or response shape changes. The only removals are the moved or aliased duplicates. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; every file outside `features/projects` imports it only through its index.
- File moves use `git mv` (the move script does it); the verbatim splits are checked with `.tmp/s3b/same-lines.mjs` (`lost 0`) before Biome formats the new files.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s3b/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each task: it must list only the two lines that exist on dev (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`). `trim-imports.mjs` does not see default imports and counts JSX text as a use, so Task 4 removes two leftovers by hand.
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- Run `.tmp/s3b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two minutes, so give the command a ten minute timeout.
- Mock factories name modules by the specifier the code under test imports; after Task 2 an indicator method is mocked on `@/lib/api/indicators`, never on `pathwaysClient`.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s3b/` (gitignored) and are never committed; build logs go there too.
- Expected test counts are cumulative from Task 0 and are stated at the end of each task.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s3b-indicators-web`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push. Do not touch `apps/api`, `packages/shared`, migrations, seeds, `.env` files or review evidence.

## Review Focus

1. A replayed create, update or archive must come back as the receipt and never run through the indicator parser, a call without a mutation context must refuse before any request, and a measurement must keep its own key field, accept a legacy bare indicator and throw the recovery error unwrapped. Task 1 pins all of it on every method, against the old and the new client.
2. A denied indicator read (403) must stay a rejection and never become an empty list, and a row with an unknown key must stay refused. `indicators.read.test.ts` carries the two moved cases with a stubbed `fetch`.
3. A test stub left on `pathwaysClient` would hand a component `undefined` at run time. Task 2 scans every factory (`factories 41, naming 0` and `factories 11, naming 0`) and runs the whole web suite.
4. A moved declaration must be byte-identical apart from its export keyword: `same-lines.mjs` prints `lost 0` for both splits (the only added line of the workspace split is the copy file comment), and the existing workspace tests run unchanged.
5. A route bundle must not grow when files move or a reads file is added, and a reads file that imports a client the route does not load grows it (Task 5 measured 16 kB on `/indicators/library`). Task 3 compares a freshly measured baseline, Tasks 4 and 5 compare again, and Task 7 compares against both baselines.

## File map

| Path | Role after S3b |
|---|---|
| `apps/web/src/lib/api/indicators.ts` | `indicatorsClient` and `indicatorLibraryClient` (new, Task 1) |
| `apps/web/src/lib/api/indicators.test.ts`, `indicators.read.test.ts` | request and fail-closed read tests (new, Tasks 1 and 2) |
| `apps/web/src/lib/services/pathways-client.ts` | loses 8 methods and 3 aliases (1521 to 1361 lines, Task 2) |
| `apps/web/src/lib/services/indicator-library-client.ts` | deleted (Task 2) |
| `apps/web/src/features/projects/indicators/` | components, copy, utils, reads (Tasks 3 to 5) |
| `apps/web/src/features/projects/projects.reads.ts` | loses the `project-indicators` read (Task 5) |
| `apps/web/src/types/pathways.ts` | loses the `ProjectIndicator` alias (Task 5) |

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s3b-indicators-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Delete: `docs/superpowers/plans/<date>-modularization-s3-indicators.md` (S3a is executed and its S3b outline is replaced by this plan)
- Modify: `docs/index.md` (section 1.6 plan rows)

- [ ] **Step 1: Confirm local dev contains S3a, and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/s3a-indicators-api into dev"
test "$(git log --oneline dev | grep -cE 'Merge refactor/s(1a|1b|2a|2b|3a)-')" -ge 5 && echo "S1 to S3a merged"
test -f packages/shared/src/contracts/indicators/indicator-responses.ts && test -f apps/web/src/lib/api/core/source-mutation-request.ts && test -f apps/web/src/lib/api/activities.ts && test -f apps/web/src/features/projects/index.ts && echo "S1b, S2b and S3a outputs present"
grep -c "indexedFeatures\|surfaceViolation" apps/web/src/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
git checkout -b refactor/s3b-indicators-web
pnpm install --frozen-lockfile
mkdir -p .tmp/s3b/before .tmp/s3b/files
```

Expected: clean status, the S3a merge commit, `S1 to S3a merged`, `S1b, S2b and S3a outputs present`, a count of at least `3` for the first grep and `1` for the second, `ls` lists the S3 plan (and this one once saved), install succeeds. If a merge commit or an output is missing, stop and report: S3b builds on S1b, S2b and S3a. If `ls` lists another S-plan, leave it.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool. `.tmp/s3b/build-routes.sh` (builds the web app from a clean `.next` and saves the route table):

Create `.tmp/s3b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s3b/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s3b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s3b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s3b/routes-$1.txt
grep Middleware .tmp/s3b/routes-$1.txt
```

`.tmp/s3b/compare-routes.mjs` (prints the routes whose First Load JS differs between two saved route tables):

Create `.tmp/s3b/compare-routes.mjs`:

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

`.tmp/s3b/mock-scan.mjs` (counts `vi.mock` factories for one web module and lists those whose factory text names a given export):

Create `.tmp/s3b/mock-scan.mjs`:

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

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s3b/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
.tmp/s3b/build-routes.sh baseline
F=apps/web/src
git hash-object $F/features/projects/projects.reads.ts $F/features/projects/index.ts $F/features/projects/indicator-recipes.ts $F/lib/api/core/source-mutation-request.ts $F/features/projects/activities/components/project-activities-workspace.tsx
wc -l $F/lib/services/pathways-client.ts $F/lib/services/indicator-library-client.ts $F/features/projects/project-indicators-workspace.tsx $F/features/projects/indicator-library-manager.tsx $F/features/projects/use-from-library.tsx $F/features/projects/indicator-recipes.ts $F/features/projects/project-indicators-workspace.test.tsx $F/features/projects/project-indicators-workspace.reload.test.tsx $F/features/projects/indicator-library-manager.test.tsx
M="getProjectIndicators|getProjectIndicatorValues|createProjectIndicator|createProjectIndicatorFromLibrary|updateProjectIndicator|recordIndicatorMeasurement|archiveProjectIndicator|getIndicators"
git grep -nE "pathwaysClient\s*\.($M)\b" -- apps/web/src | grep -v "\.test\." | wc -l
git grep -lE "pathwaysClient\s*\.($M)\b" -- apps/web/src | grep -v "\.test\." | wc -l
git grep -lE "\b($M)\b" -- apps/web/src | grep "\.test\." | wc -l
node .tmp/s3b/mock-scan.mjs lib/services/pathways-client getProjectIndicators getProjectIndicatorValues createProjectIndicator createProjectIndicatorFromLibrary updateProjectIndicator recordIndicatorMeasurement archiveProjectIndicator getIndicators
git grep -lw "ProjectIndicator" -- apps/web/src | grep -v "pathways-client.ts" | wc -l
git grep -n "indicator-library-client" -- apps/web/src | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing counts and the web `Test Files` and `Tests`: config 19, shared 281 (24 files), imports 91, api 2445 passed and 21 skipped, web 221 files and 1983 tests (`B_web`), sad 54 (`B_sad`); the docs check failure count (6 failures and 1 warning on the dry-run copy); the web build exit 0 and `Middleware` 102 kB (`M0`); `.tmp/s3b/routes-baseline.txt` holds 73 route rows. The five hashes print, in order: `d1c4fce6c953404d6bbdc9ceea111bb0ea4f5156`, `738d445d3b07d13bcb6cf51bec62e809ffd0d0ca`, `20c0e8c531fceba89b4fadc964aac8c5260c6246`, `060b6f0d7e7212e8a88f76da394a56a8422f10d5`, `9a2bf874a64b2b3f7857ca706dbc63a6fff20fab` (files S3a does not touch). The line counts print `1521`, `26`, `952`, `401`, `124`, `11`, `368`, `133`, `102` (the first four, the web files S3a's rename codemod rewrote, have hashes `6c9e7e5cc1bec767d1253f2a00d1227798229ce0` for the client, `8b7c8c9137029a8b6d04804cbb8d5d2fc1365d64` for the workspace and `69f6d8c5fe3cb6b330b0611158555e40fafa7dc1` for the manager in the dry run; a different hash with the same counts is only a formatting difference). The call counts print `17` (calls), `8` (files) and `11` (test files naming a method); the scan prints `factories 41, naming 3` and its three lines (`rule-editor.test.tsx:42`, `collection-workspace.test.tsx:68`, `project-activities-workspace.expenses.test.tsx:52`); the alias count prints `6` (the six importers of ruling 10) and the library client count `3`. If any hash or count differs, stop and report: the anchors, scripts and counts below were taken after S3a on `bf8ef5e6`.

- [ ] **Step 4: Replace the S3 plan with this one and commit**

The controller has saved this plan as `docs/superpowers/plans/<date>-modularization-s3b-indicators-web.md`.

In `docs/index.md` section 1.6, delete the S3 plan row and add as the last row of the table:

```markdown
| [S3b indicators web plan](superpowers/plans/<date>-modularization-s3b-indicators-web.md) | <date>-modularization-s3b-indicators-web.md | <date> | S3b of the codebase modularization: indicator and indicator library clients, indicators feature folder, workspace and library manager split, indicator read keys, web alias removed | In progress |
```

```bash
git rm docs/superpowers/plans/*-modularization-s3-indicators.md
git add docs/superpowers/plans docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S3b indicators web plan and retire the S3 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 3 baseline.

---

### Task 1: The indicator clients, with tests that run against the old and the new code

**Files:**
- Create (gitignored): `.tmp/s3b/indicator-blocks.mjs`, `same-lines.mjs`, `moved-original.mjs`
- Create: `apps/web/src/lib/api/indicators.ts`
- Test: `apps/web/src/lib/api/indicators.test.ts`

**Interfaces:**
- Consumes: `requestFoundation`, `PathwaysClientError` from `@/lib/api/core/request`; `requestSourceMutation` from `@/lib/api/core/source-mutation-request`; `SourceMutationContext`, `SourceMutationResult`, `sourceMutationTickets` from `@/lib/services/source-mutation`; the S3a contracts; the `Indicator` view model.
- Produces: `indicatorsClient` and `indicatorLibraryClient` with the methods listed under Produces. `pathwaysClient` keeps its own copies of every method until Task 2, so this task changes no caller.

- [ ] **Step 1: Create the scripts**

Create each file with the Write tool. `.tmp/s3b/indicator-blocks.mjs` (the method list, the client group and the anchors that locate class methods and interface members inside `pathways-client.ts`; Task 2 uses them too):

Create `.tmp/s3b/indicator-blocks.mjs`:

```js
// Shared names for the indicator client move: the methods, the client group and the anchors in pathways-client.ts.
export const clientFile = 'apps/web/src/lib/services/pathways-client.ts'

export const indicatorMethods = [
  'getProjectIndicators',
  'getProjectIndicatorValues',
  'createProjectIndicator',
  'createProjectIndicatorFromLibrary',
  'updateProjectIndicator',
  'recordIndicatorMeasurement',
  'archiveProjectIndicator',
  'getIndicators',
]
export const groups = [
  { client: 'indicatorsClient', module: '@/lib/api/indicators', methods: indicatorMethods },
]

// The class method block: leading comment lines, the declaration and its closing brace line.
export function methodBlock(text, name) {
  const at = text.indexOf(`\n  async ${name}(`)
  if (at < 0) throw new Error(`missing method ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    if (!text.slice(previous + 1, start - 1).startsWith('  //')) break
    start = previous + 1
  }
  const close = text.indexOf('\n  }\n', at)
  if (close < 0) throw new Error(`unterminated method ${name}`)
  return text.slice(start, close + 5)
}

// The interface member block: from `  name(` to the line before the next member, comment or closing brace.
export function memberBlock(text, name) {
  const at = text.indexOf(`\n  ${name}(`)
  if (at < 0) throw new Error(`missing member ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    if (!text.slice(previous + 1, start - 1).startsWith('  //')) break
    start = previous + 1
  }
  const next = /\n(?:  [A-Za-z]+\(|  \/\/|\})/g
  next.lastIndex = at + name.length + 3
  const end = next.exec(text)
  if (!end) throw new Error(`unterminated member ${name}`)
  return text.slice(start, end.index + 1)
}
```

`.tmp/s3b/same-lines.mjs` (fails when a line of the original is lost; counts the lines the new files add and lists them with `--list`):

Create `.tmp/s3b/same-lines.mjs`:

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

`.tmp/s3b/moved-original.mjs` (writes the text of the eight methods and of the library client methods to one file so `same-lines.mjs` can compare them with the new module; it must run before Task 2 deletes them):

Create `.tmp/s3b/moved-original.mjs`:

```js
// Writes the eight indicator methods of pathways-client.ts and the library client methods to one file so same-lines.mjs can compare them with lib/api/indicators.ts.
import { readFileSync, writeFileSync } from 'node:fs'

import { indicatorMethods as methods } from './indicator-blocks.mjs'

const [out] = process.argv.slice(2)

// The method block: leading comment lines, the declaration and its closing brace line, ending in a comma.
function methodBlock(text, name) {
  const at = text.indexOf(`\n  async ${name}(`)
  if (at < 0) throw new Error(`missing method ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    if (!text.slice(previous + 1, start - 1).startsWith('  //')) break
    start = previous + 1
  }
  const end = /\n {2}\},?\n/g
  end.lastIndex = at
  const close = end.exec(text)
  if (!close) throw new Error(`unterminated method ${name}`)
  return text.slice(start, close.index + close[0].length).replace(/,?\n$/, ',')
}

const client = readFileSync('apps/web/src/lib/services/pathways-client.ts', 'utf8')
const library = readFileSync('apps/web/src/lib/services/indicator-library-client.ts', 'utf8')
const parts = ['const indicatorsClient = {', ...methods.map((name) => methodBlock(client, name))]
parts.push('}', 'const indicatorLibraryClient = {', ...['list', 'create', 'archive'].map((name) => methodBlock(library, name)), '}')
writeFileSync(out, `${parts.join('\n')}\n`)
console.log(`blocks written: ${methods.length + 3}`)

```

- [ ] **Step 2: Create the client module and its test**

Create `apps/web/src/lib/api/indicators.ts` (the method bodies are the old ones; `this.getProjectIndicators` becomes `indicatorsClient.getProjectIndicators`, `sourceTickets` becomes `sourceMutationTickets`, and the inputs take the contract types):

Create `apps/web/src/lib/api/indicators.ts`:

```ts
import {
  type CreateIndicatorFromLibraryRequest,
  type CreateIndicatorLibraryEntryRequest,
  type CreateIndicatorRequest,
  type IndicatorLibraryEntryResponse,
  type IndicatorResponse,
  type RecordIndicatorMeasurementRequest,
  type UpdateIndicatorRequest,
  indicatorLibraryEntryResponse,
  indicatorListResponse,
  indicatorResponse,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import {
  type SourceMutationContext,
  type SourceMutationResult,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import type { Indicator } from '@/types/pathways'

export const indicatorsClient = {
  async getProjectIndicators(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorResponse[]> {
    return indicatorListResponse.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicators`, { signal }),
    )
  },

  // KPI values for monitoring.read and reports.indicator.read holders without indicators.read; definitions stay closed.
  async getProjectIndicatorValues(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorResponse[]> {
    return indicatorListResponse.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicator-values`, {
        signal,
      }),
    )
  },

  async createProjectIndicator(
    projectId: string,
    input: Omit<CreateIndicatorRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators`,
      'POST',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async createProjectIndicatorFromLibrary(
    projectId: string,
    input: Omit<CreateIndicatorFromLibraryRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/from-library`,
      'POST',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: Omit<UpdateIndicatorRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
      'PATCH',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: RecordIndicatorMeasurementRequest,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    if (!context?.isCurrent())
      throw new PathwaysClientError('Current measurement ownership is required.', 'unauthorized')
    const { clientMeasurementId, ...body } = input
    const path = `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/measurements`
    return sourceMutationTickets.execute(
      context,
      `POST:${path}`,
      body,
      (captured) =>
        requestFoundation(
          path,
          { method: 'POST', body: JSON.stringify(captured) },
          context.isCurrent,
        ),
      (value) => indicatorResponse.parse(value),
      { requestId: clientMeasurementId, keyField: 'clientMeasurementId', allowLegacy: true },
    )
  },

  async archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/archive`,
      'POST',
      { expectedRevision },
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async getIndicators(projectId?: string, signal?: AbortSignal): Promise<Indicator[]> {
    if (!projectId) {
      throw new PathwaysClientError('Project scope is required.', 'invalid')
    }

    return (await indicatorsClient.getProjectIndicators(projectId, signal)).map(
      ({ id, projectId: scope, code, name }) => ({
        id,
        projectId: scope,
        code,
        label: name,
      }),
    )
  },
}

export const indicatorLibraryClient = {
  async list(): Promise<IndicatorLibraryEntryResponse[]> {
    const rows = await requestFoundation('/indicator-library')
    return indicatorLibraryEntryResponse.array().parse(rows)
  },
  async create(input: CreateIndicatorLibraryEntryRequest): Promise<IndicatorLibraryEntryResponse> {
    return indicatorLibraryEntryResponse.parse(
      await requestFoundation('/indicator-library', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },
  async archive(entryId: string): Promise<void> {
    await requestFoundation(`/indicator-library/${encodeURIComponent(entryId)}/archive`, {
      method: 'POST',
    })
  },
}
```

Create `apps/web/src/lib/api/indicators.test.ts` (the same cases run against the `PathwaysClient` methods and the old library client until Task 2 removes them):

Create `apps/web/src/lib/api/indicators.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { indicatorLibraryClient as pathwaysLibraryClient } from '@/lib/services/indicator-library-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { SourceMutationRecoveryError, sourceMutationTickets } from '@/lib/services/source-mutation'
import { indicatorLibraryClient, indicatorsClient } from './indicators'

const projectId = '79300000-0000-4000-8000-000000000001'
const indicatorId = '79300000-0000-4000-8000-000000000002'
const requestKey = '79300000-0000-4000-8000-000000000003'
const entryId = '79300000-0000-4000-8000-000000000004'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const base = `/projects/${projectId}/indicators`

const indicator = {
  id: indicatorId,
  projectId,
  code: 'OWN_TARGET',
  name: 'Own target',
  description: null,
  unitLabel: 'count',
  dataSource: null,
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  baseline: '10',
  target: '30',
  current: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  progress: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
  revision: 1,
  status: 'ACTIVE',
  contractVersion: 'p06.v1',
}
const entry = {
  id: entryId,
  code: 'WORKSHOP_ATTENDEES',
  name: 'Workshop attendees',
  description: null,
  unitLabel: 'people',
  dataSource: 'Attendance sheet',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  recipe: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}
const measurement = {
  clientMeasurementId: requestKey,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  value: '12',
  source: 'Attendance sheet',
}

// Answers like the API: the receipt echoes the key field the client sent.
const acknowledge =
  (keyField: string, replayed: boolean) => async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as Record<string, string>
    const receipt = { requestId: sent[keyField], committed: true, replayed }
    return replayed ? receipt : { ...indicator, sourceAcknowledgement: receipt }
  }

// The same cases run against the PathwaysClient methods until Task 2 removes them.
const clients: Array<[string, typeof indicatorsClient]> = [
  ['pathwaysClient', pathwaysClient],
  ['indicatorsClient', indicatorsClient],
]
const libraries: Array<[string, typeof indicatorLibraryClient]> = [
  ['old library client', pathwaysLibraryClient],
  ['indicatorLibraryClient', indicatorLibraryClient],
]

describe.each(clients)('%s indicator requests', (_name, client) => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    request.requestFoundation.mockReset()
  })

  it('reads the definitions and the released values with encoded ids and the abort signal', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([indicator])
    await expect(client.getProjectIndicators('a/b c', signal)).resolves.toEqual([indicator])
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/projects/a%2Fb%20c/indicators', {
      signal,
    })
    await expect(client.getProjectIndicatorValues(projectId, signal)).resolves.toEqual([indicator])
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `/projects/${projectId}/indicator-values`,
      {
        signal,
      },
    )
  })

  it('refuses a row with an unknown key or a list of more than 100 rows', async () => {
    request.requestFoundation.mockResolvedValue([{ ...indicator, projectGoalComparison: null }])
    await expect(client.getProjectIndicators(projectId)).rejects.toThrow()
    request.requestFoundation.mockResolvedValue(Array.from({ length: 101 }, () => indicator))
    await expect(client.getProjectIndicatorValues(projectId)).rejects.toThrow()
  })

  it('projects the definitions to code and label and needs a project', async () => {
    request.requestFoundation.mockResolvedValue([indicator])
    await expect(client.getIndicators(projectId)).resolves.toEqual([
      { id: indicatorId, projectId, code: 'OWN_TARGET', label: 'Own target' },
    ])
    request.requestFoundation.mockReset()
    await expect(client.getIndicators()).rejects.toMatchObject({
      code: 'invalid',
      message: 'Project scope is required.',
    })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it.each([
    [
      'create',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.createProjectIndicator(projectId, { code: 'NEW_ONE' } as never, c),
      base,
      'POST',
      { code: 'NEW_ONE' },
    ],
    [
      'create from the library',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.createProjectIndicatorFromLibrary(
          projectId,
          { libraryEntryId: entryId } as never,
          c,
        ),
      `${base}/from-library`,
      'POST',
      { libraryEntryId: entryId },
    ],
    [
      'update',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.updateProjectIndicator(
          projectId,
          indicatorId,
          { name: 'Renamed', expectedRevision: 1 } as never,
          c,
        ),
      `${base}/${indicatorId}`,
      'PATCH',
      { name: 'Renamed', expectedRevision: 1 },
    ],
    [
      'archive',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.archiveProjectIndicator(projectId, indicatorId, 3, c),
      `${base}/${indicatorId}/archive`,
      'POST',
      { expectedRevision: 3 },
    ],
  ])(
    '%s sends its body with the request id and the ownership check',
    async (_label, run, path, method, body) => {
      request.requestFoundation.mockImplementation(acknowledge('clientMutationId', false))
      await expect(run(client, context)).resolves.toMatchObject({ id: indicatorId })
      const [sentPath, init, isCurrent] = request.requestFoundation.mock.calls[0]
      expect(sentPath).toBe(path)
      expect(init.method).toBe(method)
      expect(JSON.parse(init.body)).toEqual({
        ...body,
        clientMutationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
      expect(isCurrent).toBe(context.isCurrent)
    },
  )

  it('returns a replay receipt as the receipt and refuses a call without a context', async () => {
    request.requestFoundation.mockImplementation(acknowledge('clientMutationId', true))
    await expect(
      client.archiveProjectIndicator(projectId, indicatorId, 3, context),
    ).resolves.toEqual({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      committed: true,
      replayed: true,
    })
    request.requestFoundation.mockReset()
    await expect(client.archiveProjectIndicator(projectId, indicatorId, 3)).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('records a measurement under its own key field and the measurement path', async () => {
    request.requestFoundation.mockImplementation(acknowledge('clientMeasurementId', false))
    await expect(
      client.recordIndicatorMeasurement(projectId, 'x/y', measurement, context),
    ).resolves.toMatchObject({
      id: indicatorId,
    })
    const [path, init, isCurrent] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/x%2Fy/measurements`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(measurement)
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('accepts a legacy bare indicator for a measurement and refuses an invalid receipt', async () => {
    request.requestFoundation.mockResolvedValue(indicator)
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, context),
    ).resolves.toEqual(indicator)
    sourceMutationTickets.clear()
    request.requestFoundation.mockResolvedValue({
      ...indicator,
      sourceAcknowledgement: { requestId: 'other' },
    })
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, context),
    ).rejects.toBeInstanceOf(SourceMutationRecoveryError)
  })

  it('refuses a measurement without a current context before any request', async () => {
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Current measurement ownership is required.',
    })
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, {
        ...context,
        isCurrent: () => false,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })
})

describe.each(libraries)('%s', (_name, library) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the entries and refuses an unknown key', async () => {
    request.requestFoundation.mockResolvedValue([entry])
    await expect(library.list()).resolves.toEqual([entry])
    expect(request.requestFoundation).toHaveBeenCalledWith('/indicator-library')
    request.requestFoundation.mockResolvedValue([{ ...entry, extra: true }])
    await expect(library.list()).rejects.toThrow()
  })

  it('creates an entry with the given body and archives one with an encoded id', async () => {
    request.requestFoundation.mockResolvedValue(entry)
    const input = { code: 'WORKSHOP_ATTENDEES' } as never
    await expect(library.create(input)).resolves.toEqual(entry)
    expect(request.requestFoundation).toHaveBeenCalledWith('/indicator-library', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    request.requestFoundation.mockResolvedValue(undefined)
    await expect(library.archive('a/b')).resolves.toBeUndefined()
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/indicator-library/a%2Fb/archive', {
      method: 'POST',
    })
  })
})
```

- [ ] **Step 3: Prove the methods are the old ones and the cases hold on both clients**

```bash
node .tmp/s3b/moved-original.mjs .tmp/s3b/moved.ts
node .tmp/s3b/same-lines.mjs .tmp/s3b/moved.ts apps/web/src/lib/api/indicators.ts "IndicatorResponse=ProjectIndicator" "indicatorsClient.getProjectIndicators(=this.getProjectIndicators(" "sourceMutationTickets.execute=sourceTickets.execute" "Omit<CreateIndicatorRequest, 'clientMutationId'>=CreateIndicatorInput" "Omit<CreateIndicatorFromLibraryRequest, 'clientMutationId'>=UseLibraryEntryDraft" "Omit<UpdateIndicatorRequest, 'clientMutationId'>=UpdateIndicatorInput" --list
pnpm exec biome check --write apps/web/src/lib/api/indicators.ts apps/web/src/lib/api/indicators.test.ts
pnpm --filter @pathways/web exec vitest run src/lib/api/indicators.test.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm lint
```

Expected: `blocks written: 11`; the check prints one lost line, the one-line signature `async getProjectIndicators(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]> {`, and its four wrapped lines as added (`async getProjectIndicators(`, `projectId: string,`, `signal?: AbortSignal,`, `): Promise<ProjectIndicator[]> {`, because `IndicatorResponse` is two characters longer and Biome wraps it) and ends `original lines 128, lost 1, added 4` with exit 1 (nothing else may be lost or added); Biome leaves both files unchanged (`Fixed 0` or `No fixes applied`); the test run passes 26 tests (11 cases on each of the two clients, 2 on each library client), which proves the cases against the old code before it is removed; `tsc` lists only the two dev lines; lint passes.

- [ ] **Step 4: Run the web suite and commit**

```bash
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/api
git commit -m "feat(web): add the indicator clients with tests that run against the old and the new code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: web = 222 files, 2009 tests (`B_web` + 1 file and 26 tests).

---

### Task 2: Move the callers and mocks, and remove the old methods

**Files:**
- Create (gitignored): `.tmp/s3b/trim-imports.mjs`, `move-client-calls.mjs`, `split-client-mocks.mjs`, `remove-indicator-methods.mjs`, `finish-client-tests.mjs`, `trim-monitoring-test.mjs`
- Create: `apps/web/src/lib/api/indicators.read.test.ts`
- Modify: `apps/web/src/lib/services/pathways-client.ts`, `pathways-client.monitoring.test.ts`; the 8 production files that call an indicator method; 10 test files with a `pathways-client` mock factory; the library manager, the workspace and the library manager test (library client specifier); `apps/web/src/lib/api/indicators.test.ts`
- Delete: `apps/web/src/lib/services/indicator-library-client.ts`

**Interfaces:**
- Consumes: Task 1's clients.
- Produces: no indicator method on `pathwaysClient`; every caller and mock uses `indicatorsClient`; `indicatorLibraryClient` imported from `@/lib/api/indicators`; `pathwaysClient` keeps `recoverSourceMutation` (with its indicator branch).

- [ ] **Step 1: Create the scripts and the moved read test**

Create each file with the Write tool. `.tmp/s3b/trim-imports.mjs` (drops named imports that no longer appear in the file body and prints their names):

Create `.tmp/s3b/trim-imports.mjs`:

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

`.tmp/s3b/move-client-calls.mjs` (rewrites `pathwaysClient.<indicator method>` to `indicatorsClient`, adds or merges the import and drops `pathwaysClient` from the old import when nothing else uses it; it skips the monitoring test, which Step 5 handles):

Create `.tmp/s3b/move-client-calls.mjs`:

```js
// Rewrites pathwaysClient.<indicator method> calls to indicatorsClient and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups } from './indicator-blocks.mjs'

const skip = new Set([
  'lib/services/pathways-client.ts',
  'lib/services/pathways-client.monitoring.test.ts',
  'lib/api/indicators.ts',
  'lib/api/indicators.test.ts',
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

`.tmp/s3b/split-client-mocks.mjs` (gives every test that mocks `pathways-client` and names an indicator method a `vi.mock` of `@/lib/api/indicators`: a shared object gets a second mock, an inline object is split, and one left empty keeps `pathwaysClient: {}`):

Create `.tmp/s3b/split-client-mocks.mjs`:

```js
// Gives every test that mocks pathways-client a matching vi.mock of the new indicator client its factory serves.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups as clientGroups } from './indicator-blocks.mjs'

const groups = clientGroups.map((group) => ({ ...group, names: group.methods }))
const web = path.resolve('apps/web/src')
const call = /vi\.mock\(\s*(['"])@\/lib\/services\/pathways-client\1\s*,\s*/g
const mentions = (group, text) => new RegExp(`\\b(${group.names.join('|')})\\b`).test(text)
const mock = (group, value) => `vi.mock('${group.module}', () => ({ ${group.client}: ${value} }))`

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// Index just past the bracket that closes the one at start, skipping strings and comments.
function close(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (char === '/' && text[i + 1] === '/') i = text.indexOf('\n', i)
    else if (char === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1
    else if (char === "'" || char === '"' || char === '`') {
      for (i++; text[i] !== char; i++) if (text[i] === '\\') i++
    } else if ('({['.includes(char)) depth++
    else if (')}]'.includes(char) && --depth === 0) return i + 1
  }
  throw new Error('Unbalanced brackets.')
}

// Top-level comma-separated parts of an object literal body, raw.
function parts(body) {
  const result = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (char === '/' && body[i + 1] === '/') i = body.indexOf('\n', i)
    else if (char === '/' && body[i + 1] === '*') i = body.indexOf('*/', i) + 1
    else if (char === "'" || char === '"' || char === '`') {
      for (i++; body[i] !== char; i++) if (body[i] === '\\') i++
    } else if ('({['.includes(char)) depth++
    else if (')}]'.includes(char)) depth--
    else if (char === ',' && depth === 0) {
      result.push(body.slice(start, i))
      start = i + 1
    }
  }
  result.push(body.slice(start))
  return result.filter((part) => part.trim() !== '')
}

const key = (part) =>
  /^\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part)?.[1] ?? null

let changed = 0
for (const file of walk(web)) {
  let text = readFileSync(file, 'utf8')
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/')
  const edits = []
  for (const match of text.matchAll(call)) {
    const open = text.indexOf('(', match.index)
    const end = close(text, open)
    const factory = text.slice(match.index + match[0].length, end - 1)
    if (!groups.some((group) => mentions(group, text))) continue
    const line = text.slice(0, match.index).split('\n').length
    const arrow = /^(?:async\s*\(importOriginal\)|\(\))\s*=>\s*\(\{/.exec(factory)
    if (!arrow) {
      console.log(`${rel}:${line}: manual`)
      continue
    }
    const objectOpen = factory.indexOf('{', arrow.index)
    const outer = parts(factory.slice(objectOpen + 1, close(factory, objectOpen) - 1))
    const index = outer.findIndex((part) => key(part) === 'pathwaysClient')
    if (index < 0) {
      console.log(`${rel}:${line}: manual`)
      continue
    }
    const value = outer[index].slice(outer[index].indexOf(':') + 1).trim()
    if (/^[A-Za-z_$][\w$]*$/.test(value)) {
      const added = groups.filter((group) => mentions(group, text))
      edits.push({
        start: end,
        end,
        replacement: added.map((group) => `\n${mock(group, value)}`).join(''),
      })
      console.log(`${rel}:${line}: added ${added.map((group) => group.client).join(', ')} (object ${value})`)
    } else if (value.startsWith('{')) {
      const inner = parts(value.slice(1, close(value, 0) - 1))
      const taken = groups
        .map((group) => ({ group, take: inner.filter((part) => group.names.includes(key(part))) }))
        .filter((entry) => entry.take.length)
      if (!taken.length) continue
      const takenParts = new Set(taken.flatMap((entry) => entry.take))
      const keep = inner.filter((part) => !takenParts.has(part))
      const rest = outer.filter((_part, i) => i !== index)
      const kept = keep.length ? [`pathwaysClient: { ${keep.map((p) => p.trim()).join(', ')} }`, ...rest] : rest
      // A factory left with nothing keeps an empty pathwaysClient so the real client is never loaded.
      const original = `vi.mock(${match[1]}@/lib/services/pathways-client${match[1]}, () => ({ ${(kept.length ? kept : ['pathwaysClient: {}']).map((p) => p.trim()).join(', ')} }))\n`
      const added = taken
        .map((entry) => mock(entry.group, `{ ${entry.take.map((p) => p.trim()).join(', ')} }`))
        .join('\n')
      edits.push({ start: match.index, end, replacement: `${original}${added}` })
      console.log(
        `${rel}:${line}: ${keep.length ? 'split' : 'emptied'} (${taken.map((entry) => entry.take.map(key).join(', ')).join('; ')})`,
      )
    } else console.log(`${rel}:${line}: manual`)
  }
  if (!edits.length) continue
  for (const edit of edits.reverse())
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  writeFileSync(file, text)
  changed++
}
console.log(`files ${changed}`)
```

`.tmp/s3b/remove-indicator-methods.mjs` (deletes the interface members, class methods and the three local input aliases that moved):

Create `.tmp/s3b/remove-indicator-methods.mjs`:

```js
// Deletes the indicator interface members, class methods and local input aliases that now live in lib/api/indicators.ts.
import { readFileSync, writeFileSync } from 'node:fs'

import { clientFile, indicatorMethods, memberBlock, methodBlock } from './indicator-blocks.mjs'

let text = readFileSync(clientFile, 'utf8')
const before = text.split('\n').length

// Removes one exact text, throwing when it is missing.
const remove = (piece) => {
  if (!text.includes(piece)) throw new Error(`missing: ${piece.slice(0, 60)}`)
  text = text.replace(piece, '')
}

for (const name of indicatorMethods) remove(memberBlock(text, name))
for (const name of indicatorMethods) remove(methodBlock(text, name))
remove("type CreateIndicatorInput = Omit<ApiCreateIndicatorInput, 'clientMutationId'>\n")
remove("type UpdateIndicatorInput = Omit<ApiUpdateIndicatorInput, 'clientMutationId'>\n")
remove("type UseLibraryEntryDraft = Omit<CreateIndicatorFromLibraryRequest, 'clientMutationId'>\n")
writeFileSync(clientFile, text)
console.log(`pathways-client.ts: ${before} -> ${text.split('\n').length} lines`)
```

`.tmp/s3b/finish-client-tests.mjs` (turns the Task 1 test from a both-clients table into plain tests of the new clients):

Create `.tmp/s3b/finish-client-tests.mjs`:

```js
// Turns the Task 1 test from a both-clients table into plain tests of the new clients.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/lib/api/indicators.test.ts'
let text = readFileSync(file, 'utf8')

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 60)}`)
  text = text.replace(from, to)
}

replaceOnce(
  "import { indicatorLibraryClient as pathwaysLibraryClient } from '@/lib/services/indicator-library-client'\n",
  '',
)
replaceOnce("import { pathwaysClient } from '@/lib/services/pathways-client'\n", '')
const start = text.indexOf('// The same cases run against the PathwaysClient methods until Task 2 removes them.\n')
const end = text.indexOf("describe.each(clients)('%s indicator requests', (_name, client) => {\n")
if (start < 0 || end < 0) throw new Error('missing the table')
text = `${text.slice(0, start)}const client = indicatorsClient\nconst library = indicatorLibraryClient\n\n${text.slice(end)}`
replaceOnce("describe.each(clients)('%s indicator requests', (_name, client) => {\n", "describe('indicatorsClient indicator requests', () => {\n")
replaceOnce("describe.each(libraries)('%s', (_name, library) => {\n", "describe('indicatorLibraryClient', () => {\n")
writeFileSync(file, text)
console.log('indicators.test.ts now calls the new clients only')
```

`.tmp/s3b/trim-monitoring-test.mjs` (removes the two indicator cases from `pathways-client.monitoring.test.ts`):

Create `.tmp/s3b/trim-monitoring-test.mjs`:

```js
// Removes the two indicator cases from pathways-client.monitoring.test.ts after they moved to lib/api/indicators.read.test.ts.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/lib/services/pathways-client.monitoring.test.ts'
let text = readFileSync(file, 'utf8')
const deniedStart = text.indexOf("  it('does not replace a denied indicator read with a successful empty value'")
const deniedEnd = text.indexOf('})\n\ndescribe(', deniedStart)
const secondStart = text.indexOf("describe('goal-free indicator read contract'")
if (deniedStart < 0 || deniedEnd < 0 || secondStart < 0) throw new Error('indicator cases not found')
// The denied case follows a blank line; the second describe is the last block of the file.
text = `${text.slice(0, deniedStart).replace(/\n+$/, '\n')}${text.slice(deniedEnd, secondStart).replace(/\n+$/, '\n')}`
writeFileSync(file, text)
console.log(`${file}: ${text.split('\n').length - 1} lines`)
```

Create `apps/web/src/lib/api/indicators.read.test.ts` (the two moved cases, with the setup they share; `indicatorsClient` replaces `pathwaysClient`):

Create `apps/web/src/lib/api/indicators.read.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))
import { indicatorsClient } from './indicators'

const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const fetcher = vi.fn()

describe('P06 indicator client fail-closed request boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal('fetch', fetcher)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not replace a denied indicator read with a successful empty value', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(indicatorsClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('goal-free indicator read contract', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reads indicator-specific metrics without project comparisons and retains unavailable values', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    const indicator = {
      id: '79000000-0000-4000-8000-000000000005',
      projectId,
      code: 'OWN_TARGET',
      name: 'Own target',
      description: null,
      unitLabel: 'count',
      dataSource: null,
      mode: 'MANUAL',
      numericKind: 'COUNT',
      direction: 'HIGHER_IS_BETTER',
      displayPrecision: 0,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      baseline: '10',
      target: '30',
      current: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
      progress: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
      binding: null,
      measurementId: null,
      measuredAt: null,
      measurementSource: null,
      revision: 1,
      status: 'ACTIVE',
      contractVersion: 'p06.v1',
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([indicator]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              ...indicator,
              projectGoalComparison: { state: 'UNAVAILABLE', reason: 'NO_MEASUREMENT' },
            },
          ]),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const [read] = await indicatorsClient.getProjectIndicators(projectId)
    expect(read.current.value).toBeNull()
    expect(read.progress.value).toBeNull()
    expect(read.target).toBe('30')
    expect(read).not.toHaveProperty('projectGoalComparison')
    await expect(indicatorsClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['projectGoalComparison'] }),
      ]),
    })
  })
})
```

- [ ] **Step 2: Scan the mocks before the change**

```bash
N="getProjectIndicators getProjectIndicatorValues createProjectIndicator createProjectIndicatorFromLibrary updateProjectIndicator recordIndicatorMeasurement archiveProjectIndicator getIndicators"
node .tmp/s3b/mock-scan.mjs lib/services/pathways-client $N
```

Expected: the three lines of Task 0 and `factories 41, naming 3`.

- [ ] **Step 3: Repoint the library client specifier and the call sites**

```bash
sed -i "s#@/lib/services/indicator-library-client#@/lib/api/indicators#" apps/web/src/features/projects/project-indicators-workspace.tsx apps/web/src/features/projects/indicator-library-manager.tsx apps/web/src/features/projects/indicator-library-manager.test.tsx
node .tmp/s3b/move-client-calls.mjs
```

Expected: 8 lines, one per file, no `manual` line: `features/analytics/analytics-dashboard.tsx: 2`, `rule-editor.tsx: 1`, `features/collection/collection-workspace.tsx: 1`, `features/dashboard/role-dashboard.tsx: 1`, `features/projects/project-indicators-workspace.tsx: 9`, `features/projects/projects.reads.ts: 1`, `features/reports/reporting-workspace.tsx: 1`, `features/rules-board/rule-condition-rows.tsx: 1`, then `files 8, calls 17`.

- [ ] **Step 4: Repoint the mocks**

```bash
node .tmp/s3b/split-client-mocks.mjs
```

Expected: 10 lines and `files 10`: 7 `added indicatorsClient (object api)` (`analytics-dashboard.test.tsx`, `collection-workspace.extend-projects.test.tsx`, `project-activities-rbac.test.tsx`, `project-activities-workspace.test.tsx`, `project-indicators-workspace.reload.test.tsx`, `reporting-page.test.tsx`, `reporting-workspace.test.tsx`), 2 `split` (`collection-workspace.test.tsx`, `project-activities-workspace.expenses.test.tsx`), 1 `emptied` (`rule-editor.test.tsx`), and no `manual` line.

- [ ] **Step 5: Remove the old code, delete the old library client and move the read cases**

```bash
node .tmp/s3b/remove-indicator-methods.mjs
node .tmp/s3b/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts
node .tmp/s3b/finish-client-tests.mjs
git rm -q apps/web/src/lib/services/indicator-library-client.ts
node .tmp/s3b/trim-monitoring-test.mjs
```

Expected: `pathways-client.ts: 1522 -> 1380 lines`; the trim prints `removed SourceMutationResult, requestSourceMutation, Indicator, ProjectIndicator, ApiCreateIndicatorInput, ApiUpdateIndicatorInput, CreateIndicatorFromLibraryRequest, RecordIndicatorMeasurementRequest, indicatorListResponse, indicatorResponse`; `indicators.test.ts now calls the new clients only`; and `apps/web/src/lib/services/pathways-client.monitoring.test.ts: 45 lines`.

- [ ] **Step 6: Format and verify**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
N="getProjectIndicators getProjectIndicatorValues createProjectIndicator createProjectIndicatorFromLibrary updateProjectIndicator recordIndicatorMeasurement archiveProjectIndicator getIndicators"
node .tmp/s3b/mock-scan.mjs lib/services/pathways-client $N | tail -1
node .tmp/s3b/mock-scan.mjs lib/api/indicators | tail -1
git grep -nE "pathwaysClient\s*\.(getProjectIndicators|getProjectIndicatorValues|createProjectIndicator|updateProjectIndicator|recordIndicatorMeasurement|archiveProjectIndicator|getIndicators)\b" -- apps/web/src
wc -l apps/web/src/lib/services/pathways-client.ts
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
```

Expected: Biome fixes about 12 files (import order after the rewrite); `tsc` lists only the two dev lines; the scans print `factories 41, naming 0` and `factories 11, naming 0` (ten new mocks and the library manager test's repointed mock); the grep prints nothing; `pathways-client.ts` is 1361 lines (1521 before); web = Task 1 minus the 13 duplicated runs plus one new file (223 files, 1996 tests).

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): call the indicator clients and drop the indicator methods from pathways-client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move the indicator files into the feature layout

**Files:**
- Create (gitignored): `.tmp/s3b/move-modules.mjs`, `layout-map.json`
- Move: the seven indicator files of `apps/web/src/features/projects` (see the map)
- Modify: `apps/web/src/features/projects/index.ts` and the specifiers inside the moved files (by script)

**Interfaces:**
- Consumes: Task 2's tree.
- Produces: `features/projects/indicators/components/*` and `features/projects/indicators/indicators.copy.ts`; the feature index lists the two exports by leaf path.

- [ ] **Step 1: Re-measure the route baseline**

Tasks 1 and 2 already changed eight routes, so the layout move is compared with a baseline taken now.

```bash
.tmp/s3b/build-routes.sh pre-layout
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-baseline.txt .tmp/s3b/routes-pre-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: `exit 0`, `Middleware` 102 kB, and eight differing routes: `/alerts/repository: 322 kB -> 312 kB (-10.0)`, `/beneficiaries/duplicates` -1, `/collection/import` +1, `/projects/[projectId]` +1, `/projects/[projectId]/activities` +1, `/projects/[projectId]/edit` -1, `/projects/[projectId]/journey-stages` -1, `/projects/new` -1, then `routes 72, different 8`.

- [ ] **Step 2: Create the move script and map, and move**

Create each file with the Write tool. `.tmp/s3b/move-modules.mjs` (runs `git mv` for every entry of a web move map, then rewrites every import, re-export, dynamic import and `vi.mock` specifier that named a moved module or sits in a moved file, keeping the alias or relative form; it also rewrites quoted paths in the source-reading contract test):

Create `.tmp/s3b/move-modules.mjs`:

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

`.tmp/s3b/layout-map.json`:

Create `.tmp/s3b/layout-map.json`:

```json
{
  "features/projects/project-indicators-workspace.tsx": "features/projects/indicators/components/project-indicators-workspace.tsx",
  "features/projects/project-indicators-workspace.test.tsx": "features/projects/indicators/components/project-indicators-workspace.test.tsx",
  "features/projects/project-indicators-workspace.reload.test.tsx": "features/projects/indicators/components/project-indicators-workspace.reload.test.tsx",
  "features/projects/indicator-library-manager.tsx": "features/projects/indicators/components/indicator-library-manager.tsx",
  "features/projects/indicator-library-manager.test.tsx": "features/projects/indicators/components/indicator-library-manager.test.tsx",
  "features/projects/use-from-library.tsx": "features/projects/indicators/components/use-from-library.tsx",
  "features/projects/indicator-recipes.ts": "features/projects/indicators/indicators.copy.ts"
}
```

```bash
node .tmp/s3b/move-modules.mjs .tmp/s3b/layout-map.json
tail -3 apps/web/src/features/projects/index.ts
```

Expected: `features/projects/index: 2`, `features/projects/indicators/components/indicator-library-manager: 2`, `features/projects/indicators/components/project-indicators-workspace.reload.test: 1`, `features/projects/indicators/components/project-indicators-workspace: 4`, `features/projects/indicators/components/use-from-library: 1`, and `moved 7 files, rewrote 10 specifiers and 0 contract paths`; the index ends with the two `./indicators/components/*` export lines.

- [ ] **Step 3: Format, verify and compare the route bundles**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
pnpm typecheck && pnpm lint
.tmp/s3b/build-routes.sh layout
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-pre-layout.txt .tmp/s3b/routes-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: Biome fixes 1 file; `tsc` lists only the two dev lines; web 223 files, 1996 tests; `exit 0`, `Middleware` 102 kB and `routes 72, different 0`. A build that fails with a `Module not found` for an old indicator path ran on a stale cache (ruling 12).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): move the indicator files into features/projects/indicators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Split the indicator workspace and the library manager

**Files:**
- Create (gitignored): `.tmp/s3b/split-module.mjs`, `workspace-split.json`, `library-split.json`, `hoist-import.mjs`, `repoint-workspace-test.mjs`
- Create: `apps/web/src/features/projects/indicators/{indicators.utils.ts,components/indicator-form.tsx,components/indicator-editor.tsx,components/library-entry-form.tsx}`
- Modify: `indicators.copy.ts`, `components/project-indicators-workspace.tsx`, `components/indicator-library-manager.tsx`, `components/project-indicators-workspace.test.tsx`

**Interfaces:**
- Consumes: Task 3's layout.
- Produces: the sizes of ruling 8; `indicators.utils.ts` exports `text`, `optional`, `generateIndicatorCode`, `suggestIndicatorCode`, `indicatorInputFromForm`, `indicatorPeriod`; `indicators.copy.ts` exports `recipeNames`, `typeLabel`, `typeOptions`, `Recipe`, `enabledRecipes`, `enabledRecipeOptions`, `recipeContract`, `recipeTypes`, `recipeTargets`; `NewIndicator`, `IndicatorEditor` and `NewEntry` are exported from their files.

- [ ] **Step 1: Create the scripts**

Create each file with the Write tool. `.tmp/s3b/split-module.mjs` (splits a module's top-level declarations, verbatim and in order, into new files by declared name; the header line `@original` stands for the source's own import block):

Create `.tmp/s3b/split-module.mjs`:

```js
// Splits a module's top-level declarations, verbatim and in order, into new files by declared name; a header line '@original' stands for the source's own import block.
import { readFileSync, writeFileSync } from 'node:fs'

const [source, planFile] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const lines = readFileSync(source, 'utf8').split('\n')
const declaration = /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// The import block is everything before the first top-level declaration or comment.
let index = lines.findIndex((line) => starts.test(line))
const original = lines.slice(0, index).join('\n').replace(/\n+$/, '')
const chunks = []
let pending = []
for (; index < lines.length; index++) {
  const line = lines[index]
  const name = declaration.exec(line)?.[1]
  if (name) {
    chunks.push({ name, lines: [...pending, line] })
    pending = []
  } else if (line === '' || /^(?:\/\/|\/\*\*| \*)/.test(line)) pending.push(line)
  else {
    // Blank lines inside a declaration stay where they are.
    chunks.at(-1).lines.push(...pending, line)
    pending = []
  }
}
if (pending.some((line) => line !== '')) throw new Error('Trailing comment without a declaration.')

const owner = new Map()
for (const [file, { names }] of Object.entries(plan))
  for (const name of names) {
    if (owner.has(name)) throw new Error(`${name} is assigned twice.`)
    owner.set(name, file)
  }
const unassigned = chunks.filter((chunk) => !owner.has(chunk.name)).map((chunk) => chunk.name)
if (unassigned.length) throw new Error(`Unassigned declarations: ${unassigned.join(', ')}`)
const missing = [...owner.keys()].filter((name) => !chunks.some((chunk) => chunk.name === name))
if (missing.length) throw new Error(`Not declared in ${source}: ${missing.join(', ')}`)

for (const [file, { header }] of Object.entries(plan)) {
  const body = chunks
    .filter((chunk) => owner.get(chunk.name) === file)
    .flatMap((chunk) => chunk.lines)
  while (body[0] === '') body.shift()
  const head = header.map((line) => (line === '@original' ? original : line)).join('\n')
  writeFileSync(file, `${head}\n\n${body.join('\n').replace(/\n*$/, '\n')}`)
  console.log(`${file}: ${body.length} lines`)
}
```

`.tmp/s3b/workspace-split.json` (which declaration goes to which file):

Create `.tmp/s3b/workspace-split.json`:

```json
{
  "apps/web/src/features/projects/indicators/indicators.utils.ts": {
    "header": [
      "import type { DigitalFormDefinition } from '@/types/pathways'",
      "import { type CreateIndicatorDraftRequest, createIndicatorDraftRequest } from '@pathways/shared'"
    ],
    "names": [
      "text",
      "optional",
      "codeSkipWords",
      "generateIndicatorCode",
      "suggestIndicatorCode",
      "indicatorInputFromForm",
      "dayMs",
      "isoDay",
      "dayValue",
      "indicatorPeriod"
    ]
  },
  ".tmp/s3b/files/copy-part.ts": {
    "header": ["// Labels and constants for the indicator screens."],
    "names": [
      "typeLabel",
      "typeOptions",
      "Recipe",
      "enabledRecipes",
      "enabledRecipeOptions",
      "recipeContract",
      "recipeTypes",
      "recipeTargets"
    ]
  },
  "apps/web/src/features/projects/indicators/components/indicator-form.tsx": {
    "header": [
      "@original",
      "import {",
      "  type Recipe,",
      "  enabledRecipeOptions,",
      "  enabledRecipes,",
      "  recipeContract,",
      "  recipeTargets,",
      "  recipeTypes,",
      "  typeOptions,",
      "} from '../indicators.copy'",
      "import { generateIndicatorCode, indicatorInputFromForm } from '../indicators.utils'"
    ],
    "names": ["allActivities", "IndicatorForm", "NewIndicator"]
  },
  "apps/web/src/features/projects/indicators/components/indicator-editor.tsx": {
    "header": ["@original", "import { optional, text } from '../indicators.utils'"],
    "names": ["IndicatorEditor"]
  },
  "apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx": {
    "header": [
      "@original",
      "import { typeLabel } from '../indicators.copy'",
      "import { indicatorPeriod } from '../indicators.utils'",
      "import { IndicatorEditor } from './indicator-editor'",
      "import { NewIndicator } from './indicator-form'"
    ],
    "names": ["ProjectIndicatorsWorkspace"]
  }
}
```

`.tmp/s3b/library-split.json`:

Create `.tmp/s3b/library-split.json`:

```json
{
  "apps/web/src/features/projects/indicators/components/library-entry-form.tsx": {
    "header": ["@original"],
    "names": ["offeredRecipes", "field", "EntryForm", "NewEntry"]
  },
  "apps/web/src/features/projects/indicators/components/indicator-library-manager.tsx": {
    "header": ["@original", "import { NewEntry } from './library-entry-form'"],
    "names": ["IndicatorLibraryManager"]
  }
}
```

`.tmp/s3b/hoist-import.mjs` (the library manager has an import below its first declaration, which the split would cut with `offeredRecipes`; this moves it into the import block):

Create `.tmp/s3b/hoist-import.mjs`:

```js
// Moves the option-select import that sits below the first declaration of the library manager into its import block.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/features/projects/indicators/components/indicator-library-manager.tsx'
const text = readFileSync(file, 'utf8')
const line = "import { InlineNotice, OptionSelect } from '../../components/option-select'\n"
const anchor = "import { recipeNames } from '../indicators.copy'\n"
if (!text.includes(line) || !text.includes(anchor)) throw new Error('anchors not found')
writeFileSync(file, text.replace(line, '').replace(anchor, anchor + line))
console.log('hoisted the option-select import')
```

`.tmp/s3b/repoint-workspace-test.mjs` (the workspace test imports four helpers from the workspace file):

Create `.tmp/s3b/repoint-workspace-test.mjs`:

```js
// Points the workspace test at indicators.utils for the four helpers that moved out of the workspace file.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/features/projects/indicators/components/project-indicators-workspace.test.tsx'
const text = readFileSync(file, 'utf8')
const before = `import {
  ProjectIndicatorsWorkspace,
  generateIndicatorCode,
  indicatorInputFromForm,
  indicatorPeriod,
  suggestIndicatorCode,
} from './project-indicators-workspace'
`
const after = `import {
  generateIndicatorCode,
  indicatorInputFromForm,
  indicatorPeriod,
  suggestIndicatorCode,
} from '../indicators.utils'
import { ProjectIndicatorsWorkspace } from './project-indicators-workspace'
`
if (!text.includes(before)) throw new Error('import block not found')
writeFileSync(file, text.replace(before, after))
console.log('workspace test imports repointed')
```

- [ ] **Step 2: Split the workspace**

```bash
F=apps/web/src/features/projects/indicators
W=$F/components/project-indicators-workspace.tsx
git show HEAD:$W > .tmp/s3b/before/workspace.tsx
sed -i -e 's/type CreateIndicatorDraftRequest as CreateIndicatorInput/type CreateIndicatorDraftRequest/' -e 's/\bCreateIndicatorInput\b/CreateIndicatorDraftRequest/g' $W
node .tmp/s3b/split-module.mjs $W .tmp/s3b/workspace-split.json
sed -i -e 's/^const text = /export const text = /' -e 's/^const optional = /export const optional = /' $F/indicators.utils.ts
sed -i -e 's/^const typeLabel = /export const typeLabel = /' -e 's/^const typeOptions = /export const typeOptions = /' -e 's/^type Recipe = /export type Recipe = /' -e 's/^const enabledRecipes: /export const enabledRecipes: /' -e 's/^const enabledRecipeOptions = /export const enabledRecipeOptions = /' -e 's/^const recipeContract: /export const recipeContract: /' -e 's/^const recipeTypes: /export const recipeTypes: /' -e 's/^const recipeTargets: /export const recipeTargets: /' .tmp/s3b/files/copy-part.ts
sed -i 's/^function NewIndicator(/export function NewIndicator(/' $F/components/indicator-form.tsx
sed -i 's/^function IndicatorEditor(/export function IndicatorEditor(/' $F/components/indicator-editor.tsx
sed -i "s#^import type { metricRecipes } from '@pathways/shared'#import { indicatorTypes, type metricRecipes, type numericKinds } from '@pathways/shared'#" $F/indicators.copy.ts
printf '\n' >> $F/indicators.copy.ts
sed '1,2d' .tmp/s3b/files/copy-part.ts >> $F/indicators.copy.ts
grep -c "^export " $F/indicators.copy.ts
node .tmp/s3b/trim-imports.mjs $F/indicators.utils.ts $F/indicators.copy.ts $F/components/indicator-form.tsx $F/components/indicator-editor.tsx $W
node .tmp/s3b/same-lines.mjs .tmp/s3b/before/workspace.tsx $W $F/components/indicator-form.tsx $F/components/indicator-editor.tsx $F/indicators.utils.ts .tmp/s3b/files/copy-part.ts CreateIndicatorDraftRequest=CreateIndicatorInput --list
```

Expected: the split prints `indicators.utils.ts: 97 lines`, `.tmp/s3b/files/copy-part.ts: 32 lines`, `indicator-form.tsx: 230 lines`, `indicator-editor.tsx: 171 lines`, `project-indicators-workspace.tsx: 370 lines`; the export count is `9`; the trim prints `removed nothing` for the utils and the copy file and a long list for the three component files (the workspace's reads `removed OptionSelect, recipeNames, DialogTrigger, Input, Textarea, Activity, CreateIndicatorDraftRequest, RecordIndicatorMeasurementRequest, createIndicatorDraftRequest, indicatorTypes, metricRecipes, numericKinds, recordIndicatorMeasurementRequest, Loader2, Plus, FormEvent`); the check prints `1x // Labels and constants for the indicator screens.` and `original lines 884, lost 0, added 1`.

- [ ] **Step 3: Split the library manager**

```bash
F=apps/web/src/features/projects/indicators
M=$F/components/indicator-library-manager.tsx
node .tmp/s3b/hoist-import.mjs
cp $M .tmp/s3b/before/library-manager.tsx
node .tmp/s3b/split-module.mjs $M .tmp/s3b/library-split.json
sed -i 's/^function NewEntry(/export function NewEntry(/' $F/components/library-entry-form.tsx
node .tmp/s3b/trim-imports.mjs $F/components/library-entry-form.tsx $M
node .tmp/s3b/same-lines.mjs .tmp/s3b/before/library-manager.tsx $M $F/components/library-entry-form.tsx --list
```

Expected: `hoisted the option-select import`; `library-entry-form.tsx: 183 lines`, `indicator-library-manager.tsx: 179 lines`; the trim lists the unused names of each file; the check prints `original lines 359, lost 0, added 0`.

- [ ] **Step 4: Repoint the test, remove two leftovers, format and verify**

```bash
F=apps/web/src/features/projects/indicators/components
node .tmp/s3b/repoint-workspace-test.mjs
sed -i "s/^import { Loader2, Plus, Target } from 'lucide-react'/import { Loader2, Plus } from 'lucide-react'/" $F/indicator-form.tsx
sed -i "/^import Link from 'next\/link'$/d" $F/library-entry-form.tsx
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
wc -l apps/web/src/features/projects/indicators/*.ts $F/*.tsx
.tmp/s3b/build-routes.sh split
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-layout.txt .tmp/s3b/routes-split.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: Biome fixes 5 files; `tsc` lists only the two dev lines (without the two sed edits it also lists `Target` in `indicator-form.tsx` and `Link` in `library-entry-form.tsx`: `trim-imports.mjs` does not see a default import and counts the JSX text `Target`); web 223 files, 1996 tests; line counts: `indicators.copy.ts` 50, `indicators.utils.ts` 100, `indicator-editor.tsx` 187, `indicator-form.tsx` 255, `indicator-library-manager.tsx` 208 (its test 102), `library-entry-form.tsx` 202, `project-indicators-workspace.tsx` 414 (tests 368 and 134), `use-from-library.tsx` 124; `exit 0`, `Middleware` 102 kB and `routes 72, different 0`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): split the indicator workspace and the library manager by component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Indicator reads and the web alias

**Files:**
- Create (gitignored): `.tmp/s3b/move-indicator-reads.mjs`, `retire-project-indicator.mjs`
- Create: `apps/web/src/features/projects/indicators/indicators.reads.ts`, `indicators.reads.test.ts`
- Modify: `features/projects/projects.reads.ts`, `features/projects/activities/components/project-activities-workspace.tsx`, `features/projects/indicators/components/project-indicators-workspace.tsx`, `indicator-library-manager.tsx`; the six `ProjectIndicator` importers; `apps/web/src/types/pathways.ts`

**Interfaces:**
- Consumes: Task 4's files.
- Produces: `useIndicatorLibraryRead`, `useProjectIndicatorsRead`; no `ProjectIndicator` in the web; `IndicatorResponse` imported from `@pathways/shared` by its six former importers.

- [ ] **Step 1: Create the reads module, its test and the scripts**

Create each file with the Write tool. `apps/web/src/features/projects/indicators/indicators.reads.ts` (the library key with the enabled flag and freshness left to the call site, and the `project-indicators` key that was in `projects.reads.ts`):

Create `apps/web/src/features/projects/indicators/indicators.reads.ts`:

```ts
'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { indicatorLibraryClient, indicatorsClient } from '@/lib/api/indicators'

const summary = { freshness: 'summary' } as const

/** Stable resource keys, so the library page and the use-from-library card share one library read. */
const indicatorReadResources = {
  library: 'indicator-library',
  projectIndicators: 'project-indicators',
} as const

/** The library page reads live; the use-from-library card passes summary freshness and its own enabled flag. */
export const useIndicatorLibraryRead = (
  enabled = true,
  options: { freshness?: 'summary' | 'live' } = {},
) =>
  useAuthorizedRead(
    indicatorReadResources.library,
    null,
    'indicators.library.read',
    () => indicatorLibraryClient.list(),
    enabled,
    options,
  )

/** Full indicator rows; `getIndicators` is the same request projected to code and label. */
export const useProjectIndicatorsRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    indicatorReadResources.projectIndicators,
    projectId,
    'indicators.read',
    (signal) => indicatorsClient.getProjectIndicators(projectId, signal),
    enabled,
    summary,
  )
```

`apps/web/src/features/projects/indicators/indicators.reads.test.ts` (pins keys, permissions, enabled flags and freshness):

Create `apps/web/src/features/projects/indicators/indicators.reads.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const indicators = vi.hoisted(() => ({ getProjectIndicators: vi.fn() }))
const library = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: indicators,
  indicatorLibraryClient: library,
}))

import { useIndicatorLibraryRead, useProjectIndicatorsRead } from './indicators.reads'

const signal = new AbortController().signal

describe('indicator authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    indicators.getProjectIndicators.mockReset()
    library.list.mockReset()
  })

  it('reads the library under one key; the call site picks the enabled flag and freshness', () => {
    useIndicatorLibraryRead()
    useIndicatorLibraryRead(false, { freshness: 'summary' })
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['indicator-library', null, 'indicators.library.read'],
      ['indicator-library', null, 'indicators.library.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({})
    expect(read.mock.calls[1][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(library.list).toHaveBeenCalledOnce()
  })

  it('reads the project indicator rows under one shared key with summary freshness', () => {
    useProjectIndicatorsRead('project-1')
    useProjectIndicatorsRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['project-indicators', 'project-1', 'indicators.read'],
      ['project-indicators', 'project-2', 'indicators.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(indicators.getProjectIndicators).toHaveBeenCalledWith('project-1', signal)
  })
})
```

`.tmp/s3b/move-indicator-reads.mjs` (removes the project indicator read from `projects.reads.ts`, repoints the activities workspace, and replaces the two inline library reads with the hook):

Create `.tmp/s3b/move-indicator-reads.mjs`:

```js
// Moves the indicator read keys into indicators.reads.ts and points the three screens at the new hooks.
import { readFileSync, writeFileSync } from 'node:fs'

const web = 'apps/web/src/features/projects'

// Applies exact replacements and fails when a target text is missing.
const edit = (file, pairs) => {
  let text = readFileSync(file, 'utf8')
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`${file}: missing ${JSON.stringify(from.slice(0, 70))}`)
    text = text.replace(from, to)
  }
  writeFileSync(file, text)
  console.log(`${file}: ${pairs.length} edits`)
}

// Text from a start anchor up to and including an end anchor.
const slice = (file, start, end) => {
  const text = readFileSync(file, 'utf8')
  const from = text.indexOf(start)
  const to = text.indexOf(end, from)
  if (from < 0 || to < 0) throw new Error(`${file}: missing ${start.slice(0, 50)}`)
  return text.slice(from, to + end.length)
}

const reads = `${web}/projects.reads.ts`
edit(reads, [
  [slice(reads, '/** Full indicator rows;', 'summary,\n  )\n\n'), ''],
  ["  indicators: 'project-indicators',\n", ''],
  [' reuse one project read and each workspace loads indicators once.', ' reuse one project read.'],
])

edit(`${web}/activities/components/project-activities-workspace.tsx`, [
  [
    "import {\n  useProjectIndicatorsRead,\n  useProjectJourneyStagesRead,\n  useProjectRead,\n} from '../../projects.reads'\n",
    "import { useProjectIndicatorsRead } from '../../indicators/indicators.reads'\nimport { useProjectJourneyStagesRead, useProjectRead } from '../../projects.reads'\n",
  ],
])

const workspace = `${web}/indicators/components/project-indicators-workspace.tsx`
edit(workspace, [
  [
    slice(workspace, '  const libraryRead = useAuthorizedRead(', "    { freshness: 'summary' },\n  )\n"),
    "  const libraryRead = useIndicatorLibraryRead(canCreate && canReadLibrary, { freshness: 'summary' })\n",
  ],
  [
    "import { typeLabel } from '../indicators.copy'\n",
    "import { typeLabel } from '../indicators.copy'\nimport { useIndicatorLibraryRead } from '../indicators.reads'\n",
  ],
])

const manager = `${web}/indicators/components/indicator-library-manager.tsx`
edit(manager, [
  [
    "  const read = useAuthorizedRead('indicator-library', null, 'indicators.library.read', () =>\n    indicatorLibraryClient.list(),\n  )\n",
    '  const read = useIndicatorLibraryRead()\n',
  ],
  [
    "import { recipeNames } from '../indicators.copy'\n",
    "import { recipeNames } from '../indicators.copy'\nimport { useIndicatorLibraryRead } from '../indicators.reads'\n",
  ],
])

```

`.tmp/s3b/retire-project-indicator.mjs` (deletes the alias and its import, and points the six importers at `IndicatorResponse`):

Create `.tmp/s3b/retire-project-indicator.mjs`:

```js
// Deletes the web alias ProjectIndicator and points its importers at IndicatorResponse from the shared package.
import { readFileSync, writeFileSync } from 'node:fs'

const web = 'apps/web/src'
const importers = [
  'features/analytics/analytics-dashboard.tsx',
  'features/analytics/analytics-reporting-periods.ts',
  'features/projects/activities/components/activity-detail-content.tsx',
  'features/projects/activities/components/activity-detail-panel.tsx',
  'features/projects/activities/components/activity-detail-sections.tsx',
  'features/reports/reporting-workspace.tsx',
]
const typesImport = /import (?:type )?\{([^}]*)\} from '@\/types\/pathways'\n/
const sharedImport = /import (type )?\{([^}]*)\} from '@pathways\/shared'\n/

for (const rel of importers) {
  const file = `${web}/${rel}`
  let text = readFileSync(file, 'utf8')
  const match = typesImport.exec(text)
  if (!match || !/\bProjectIndicator\b/.test(match[1])) throw new Error(`${rel}: no ProjectIndicator import`)
  const names = match[1].split(',').map((name) => name.trim()).filter((name) => name && name !== 'ProjectIndicator')
  text = text.replace(match[0], `import type { ${names.join(', ')} } from '@/types/pathways'\n`)
  text = text.replace(/\bProjectIndicator\b/g, 'IndicatorResponse')
  const shared = sharedImport.exec(text)
  if (shared) {
    const list = shared[2].split(',').map((name) => name.trim()).filter(Boolean)
    const added = shared[1] ? 'IndicatorResponse' : 'type IndicatorResponse'
    text = text.replace(shared[0], `import ${shared[1] ?? ''}{ ${[...list, added].join(', ')} } from '@pathways/shared'\n`)
  } else {
    const line = "import type { IndicatorResponse } from '@pathways/shared'\n"
    text = text.replace(/import type \{[^}]*\} from '@\/types\/pathways'\n/, (whole) => whole + line)
  }
  writeFileSync(file, text)
  console.log(rel)
}

const types = `${web}/types/pathways.ts`
let text = readFileSync(types, 'utf8')
for (const piece of ['  IndicatorResponse as SharedProjectIndicator,\n', 'export type ProjectIndicator = SharedProjectIndicator\n']) {
  if (!text.includes(piece)) throw new Error(`types/pathways.ts: missing ${piece.trim()}`)
  text = text.replace(piece, '')
}
writeFileSync(types, text)
console.log(`importers ${importers.length}`)
```

- [ ] **Step 2: Move the reads and retire the alias**

```bash
F=apps/web/src/features/projects
node .tmp/s3b/move-indicator-reads.mjs
node .tmp/s3b/trim-imports.mjs $F/indicators/components/project-indicators-workspace.tsx $F/indicators/components/indicator-library-manager.tsx $F/projects.reads.ts
node .tmp/s3b/retire-project-indicator.mjs
git grep -nw "ProjectIndicator" -- apps/web/src
```

Expected: `projects.reads.ts: 3 edits`, `project-activities-workspace.tsx: 1 edits`, `project-indicators-workspace.tsx: 2 edits`, `indicator-library-manager.tsx: 2 edits`; the trim prints `removed indicatorLibraryClient` for the workspace, `removed useAuthorizedRead` for the manager and `removed indicatorsClient` for `projects.reads.ts`; the six importer lines and `importers 6`; the last grep prints nothing (the block ends with exit 1, which `git grep` returns when it finds no match).

- [ ] **Step 3: Format, verify and compare the route bundles**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests "
.tmp/s3b/build-routes.sh reads
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-pre-layout.txt .tmp/s3b/routes-reads.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: Biome fixes 3 files; `tsc` lists only the two dev lines; web 224 files, 1998 tests (`B_web` + 3 files and 15 tests); `exit 0`, `Middleware` 102 kB; against the Task 3 baseline `/indicators/library: 280 kB -> 281 kB (+1.0)`, `/projects` -1, `/projects/[projectId]` -1, `/projects/[projectId]/budget` -1, `/evidence` -1, `/monitor-evaluate` -1 and `routes 72, different 6`. A route more than 2 kB bigger: stop and report the figures (ruling 9 explains the first draft's 16 kB).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): add the indicator read hooks and retire the ProjectIndicator alias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Records

**Files:**
- Create (gitignored): `.tmp/s3b/doc-paths.mjs`, `doc-paths.json`
- Modify: living docs that name moved files (`docs/qad-pathways.md`, `docs/deferred-features.md`), `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16 rows), `docs/index.md` (CR row status), `docs/activity-log.md`

No SAD routing change is needed (ruling 11): the manifest of Task 7 shows the roles the changed paths already route to.

- [ ] **Step 1: Repoint the living docs that name moved files**

Create each file with the Write tool. `.tmp/s3b/doc-paths.mjs` (rewrites each moved path in the given docs and prints the count per doc):

Create `.tmp/s3b/doc-paths.mjs`:

```js
// Rewrites the current-path mentions of moved web files in the living docs and prints the count per doc.
import { readFileSync, writeFileSync } from 'node:fs'

const [mapFile, ...docs] = process.argv.slice(2)
const map = JSON.parse(readFileSync(mapFile, 'utf8'))
let total = 0
for (const doc of docs) {
  let text = readFileSync(doc, 'utf8')
  let count = 0
  for (const [from, to] of Object.entries(map)) {
    const parts = text.split(from)
    count += parts.length - 1
    text = parts.join(to)
  }
  if (!count) continue
  writeFileSync(doc, text)
  total += count
  console.log(`${doc}: ${count}`)
}
console.log(`total: ${total}`)
```

`.tmp/s3b/doc-paths.json`:

Create `.tmp/s3b/doc-paths.json`:

```json
{
  "apps/web/src/features/projects/project-indicators-workspace.reload.test.tsx": "apps/web/src/features/projects/indicators/components/project-indicators-workspace.reload.test.tsx",
  "apps/web/src/features/projects/project-indicators-workspace.test.tsx": "apps/web/src/features/projects/indicators/components/project-indicators-workspace.test.tsx",
  "apps/web/src/features/projects/project-indicators-workspace.tsx": "apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx",
  "apps/web/src/features/projects/indicator-library-manager.test.tsx": "apps/web/src/features/projects/indicators/components/indicator-library-manager.test.tsx",
  "apps/web/src/features/projects/use-from-library.tsx": "apps/web/src/features/projects/indicators/components/use-from-library.tsx"
}
```

```bash
git grep -nE "features/projects/(project-indicators-workspace|indicator-library-manager|use-from-library|indicator-recipes)|indicator-library-client" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*'
node .tmp/s3b/doc-paths.mjs .tmp/s3b/doc-paths.json docs/qad-pathways.md docs/deferred-features.md
```

Expected: the grep lists lines 65 and 88 of `docs/deferred-features.md` and lines 118, 158, 206 and 207 of `docs/qad-pathways.md`; the script prints `docs/qad-pathways.md: 5`, `docs/deferred-features.md: 3` and `total: 8`. The change records (`docs/cr-pathways-*.md`) and the activity log describe past states and keep their paths.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`, section 3.3, directly after the paragraph that ends `(amended 2026-10-12 for S2b).`, add:

```text
A feature's `<domain>.reads.ts` imports only the clients that every screen of its routes already loads, because the optimizer counts the import: the indicator library page grew 16 kB when its reads file also imported `pathways-client` (amended <date> for S3b).
```

Section 9, append (replace `<date>` with the merge date and the `<routes result>` and counts with the measured gate values):

```markdown
S3b applied <date> on refactor/s3b-indicators-web:
- Client: `lib/api/indicators.ts` holds `indicatorsClient` (8 methods) and `indicatorLibraryClient` (3, merged from `lib/services/indicator-library-client.ts`); 8 production files (17 calls), 10 mock factories and the library manager test follow, and `pathways-client.ts` went from 1521 to 1361 lines. Inputs take the S3a request types, the measurement keeps its own ticket call and unwrapped recovery error, and the characterization tests ran against the old and the new client before the old methods went.
- Layout: the seven indicator files moved to `features/projects/indicators/{components}` with `indicators.{copy,utils,reads}.ts`; the feature index lists `IndicatorLibraryManager` and `ProjectIndicatorsWorkspace` by leaf path (no sub-index, as in S2b); the two app pages already imported through the index.
- Components: the workspace went from 952 to 408 lines (form 255, editor 187, utils 100, copy 50) and the library manager from 401 to 206 (entry form 202); every split was proven line by line (`lost 0`).
- Reads and types: `indicators.reads.ts` holds the library read (one key, enabled flag and freshness left to the call site) and the project indicator read, with a test that pins keys, permissions and freshness; the binding choices read stays in the workspace because moving it made `/indicators/library` load `pathways-client` (280 to 296 kB); the web alias `ProjectIndicator` was replaced by `IndicatorResponse` in six files.
- Tests: the two indicator read cases of `pathways-client.monitoring.test.ts` moved to `lib/api/indicators.read.test.ts`; web 221 files and 1983 tests became 224 and 1998.
- Routes: Middleware stayed at 102 kB; <routes result>.
- Decisions: one plan of eight tasks (ruling 1); one client file with two objects and no parser file (ruling 2); both clients run the same cases (ruling 4); 17 calls and two read cases, not 18 and three (ruling 6); no hooks folder and no sub-index (ruling 7); the binding read stays inline (ruling 9); six alias importers (ruling 10); every production build starts from a clean `.next` (ruling 12).

Deferred: `features/analytics/use-monitoring-read` import of the workspace until S7 gives analytics an index; the read keys of analytics, rules board, collection and dashboard that call the indicator client (their slices); `recoverSourceMutation` keeps its indicator branch.
```

- [ ] **Step 3: Update the audit and the index**

```bash
A=docs/audit-pathways-codebase-modularity-20261009.md
sed -i -e 's#activities client by S2b\. |#activities client by S2b; indicator clients by S3b. |#' -e 's#activity components by S2b\. |#activity components by S2b; indicator components by S3b. |#' -e 's#through the projects index by S2b\. |#through the projects index by S2b; indicators folder and leaf exports through the projects index by S3b. |#' -e 's#activity read hooks and category labels by S2b\. |#activity read hooks and category labels by S2b; indicator read hooks and labels by S3b. |#' $A
grep -c "by S3b" $A
sed -i 's#S1a, S1b, S2a, S2b and S3a applied, S3b next#S1a, S1b, S2a, S2b, S3a and S3b applied, S4 next#' docs/index.md
grep -c "S3a and S3b applied, S4 next" docs/index.md
git grep -nE "features/projects/(project-indicators-workspace|indicator-library-manager|use-from-library|indicator-recipes)|indicator-library-client" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*'
```

Expected: `4` (one S3b mention in each of the MOD-05, MOD-06, MOD-15 and MOD-16 rows; `grep -c` counts lines), `1`, and the last grep prints nothing (no living doc names a moved path or the deleted library client; the block ends with exit 1, which `git grep` returns when it finds no match).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S3b indicators web (refactor/s3b-indicators-web)
```

with one bullet per Task 1 to Task 5: what moved or changed, its commit hash, and the test counts at the end of that task (web files and tests: 222 and 2009, 223 and 1996, 223 and 1996, 223 and 1996, 224 and 1998 at `bf8ef5e6` plus S3a); a bullet with the route measurements (Tasks 1 and 2 shrank `/alerts/repository` by 10 kB and moved seven routes by 1 kB or less, the layout and split moved none, the first draft of the reads file grew `/indicators/library` by 16 kB, the final reads change moved six routes by 1 kB or less); a bullet saying the S3b decisions are recorded in the change record section 9 because the plan file is removed after merge; and a bullet listing the deferrals above. Task 7 Step 6 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs
git commit -m "docs: record modularization S3b and repoint the moved indicator paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 7: Full release gates and merge

- [ ] **Step 1: Static gates, route bundles and middleware**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm sad:test
.tmp/s3b/build-routes.sh gates
git checkout -- apps/web/next-env.d.ts
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-pre-layout.txt .tmp/s3b/routes-gates.txt
node .tmp/s3b/compare-routes.mjs .tmp/s3b/routes-baseline.txt .tmp/s3b/routes-gates.txt | tail -1
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
```

Expected: all pass; versus Task 0: config 19, shared 281, imports 91, api 2445 passed and 21 skipped, sad 54 (all unchanged), web = `B_web` + 3 files and 15 tests (224 files, 1998 tests: 26 runs added in Task 1, 13 duplicated runs removed in Task 2 and 2 reads tests added); the build exits 0; `Middleware` equals `M0`; against the Task 3 baseline `routes 72, different 6` with none bigger than 1 kB; against the Task 0 baseline `routes 72, different 12`; `tsc` lists only the two dev lines (so the block ends with `tsc` exit code 2, which is expected). A route more than 2 kB bigger than in `routes-pre-layout.txt`: stop and report the figures.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (171 PASS, 0 FAIL at the latest gate). S3b changes no SQL; the replay is kept as the standing release gate.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; auth-navigation all pass; the main suite shows the same pass, fail and not-run split and the same failing tests as the latest gate run recorded in `docs/activity-log.md`. Browser smoke against `pnpm dev:local`, each step as a demo user whose role allows it, and every step must behave as on dev:

1. As the M&E Officer open an assigned project's Target Indicators tab (list, codes, values, progress bars), add a derived indicator through the dialog (name, type, target, recipe, source) and see it saved, open Manage on a manual indicator, edit its label, record a measurement and correct it with a reason, and archive an indicator after confirming.
2. Open `/indicators/library` as a Project Manager, add a library entry and archive it; confirm the Back link returns to the project.
3. As Program Manager open the analytics page and the dashboard KPI rows (released values, the `indicator-values` read), and as a Project Manager the dashboard widgets that list indicators.
4. Open the rules board indicator pickers and the rule editor's indicator list, the collection workspace indicator choices, the reports indicator summary page and a project's Activities tab (the indicator filter and the detail panel's indicator rows).

The barrel optimization exists only in the production build, so repeat items 1, 2 and 4 against it: stop the web dev server, run `pnpm dev:local -- --api-only`, export the `NEXT_PUBLIC_*` values that the `shared` block of `scripts/db/local-dev.mjs` builds (they are inlined at build time), then `rm -rf apps/web/.next`, `pnpm --filter @pathways/web build` and `pnpm --filter @pathways/web start`.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s3b/manifest.json
```

Expected roles at `bf8ef5e6` plus S3a (docs changes route nowhere): `design-qa-agent` (49 files), `beneficiary-privacy-guardian` (6 files: `lib/api/indicators.ts`, `indicators.test.ts`, `indicators.read.test.ts`, the edited `pathways-client.ts` and its monitoring test, and the deleted `lib/services/indicator-library-client.ts`) and `rule-engine-determinism-checker` (2 files: `rule-editor.tsx` and `rule-editor.test.tsx`). The manifest decides: dispatch every role it names, and any role it adds, with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s3b/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s3b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. If SAD blocks an import that only a comment or JSDoc mentions, remove the import.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 6 activity-log section with the gate results (per-package counts, Middleware size, both route comparisons, replay result, e2e pass counts, smoke result, SAD sign-off), complete the `<date>` and `<routes result>` of the change record section 9 block, then:

```bash
git add docs
git commit -m "docs: record modularization S3b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s3b-indicators-web -m "Merge refactor/s3b-indicators-web into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Remove the executed plan**

The decisions live in the change record section 9, so the plan goes with the merge. Delete `docs/superpowers/plans/<date>-modularization-s3b-indicators-web.md` and its row in `docs/index.md` section 1.6, then:

```bash
git rm docs/superpowers/plans/*-modularization-s3b-indicators-web.md
sed -i '/-modularization-s3b-indicators-web.md/d' docs/index.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed S3b plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.
