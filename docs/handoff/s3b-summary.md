# S3b summary (indicators web)

Plan: `docs/handoff/modularization-s3b-indicators-web.md` (the controller saves it as `docs/superpowers/plans/<date>-modularization-s3b-indicators-web.md`; Task 0 also deletes the S3 plan file and its index row, because S3a is executed and this plan replaces its S3b outline). Written against local dev `bf8ef5e6` with S3a Tasks 1 to 7 applied as its plan scripts them (not S3a's real output, which was not merged yet). Every step was dry-run on an exported copy; the whole scripted sequence was then replayed from the S3a-complete baseline by one driver that extracts each task's files from the plan text and runs its bash blocks, and `pnpm lint`, `pnpm typecheck`, all package suites, a production `pnpm build` and the route comparisons passed on the final tree.

## Branch and size

- Branch `refactor/s3b-indicators-web`, from local dev after S3a. Not split: eight tasks (0 baseline, 1 clients with old-and-new tests, 2 callers and mocks, 3 layout, 4 component splits, 5 reads and alias, 6 records, 7 gates and merge). Natural stops for a split, if wanted: after Task 2 (client half) or after Task 4, then run Tasks 5 to 7 as S3b2.
- Web only: no api, shared, seed, migration or SAD script change. The SAD manifest at the dry-run tip needs `design-qa-agent` (49 files), `beneficiary-privacy-guardian` (6: `lib/api/indicators.ts` and its two tests, the edited `pathways-client.ts` and its monitoring test, the deleted `indicator-library-client.ts`) and `rule-engine-determinism-checker` (2: `rule-editor.tsx` and its test). No routing edit is needed.
- Dry run (S3a applied, whole sequence replayed): `pnpm lint`, `pnpm typecheck`, `pnpm test` (config 19, shared 281, imports 91, api 2445 passed and 21 skipped, web 1998), `pnpm sad:test` (54) and `pnpm build` pass; Middleware 102 kB throughout; 72 compared routes, none more than 1 kB bigger than the Task 3 baseline at the end; 44 files changed in `apps` (11 added, 3 deleted, 25 modified, 5 renamed), all in `apps/web`.
- Test counts at the end of each task (baseline web 221 files and 1983 tests): web 222 and 2009 (Task 1), 223 and 1996 (Tasks 2, 3 and 4), 224 and 1998 (Tasks 5 and 7); 13 duplicated runs of the characterization table are removed in Task 2, two moved read cases keep their count in a new file, two reads tests are added in Task 5. Config 19, shared 281 (24 files), imports 91, api 2445 (21 skipped) and sad 54 are unchanged.
- Routes: Tasks 1 and 2 moved eight routes (`/alerts/repository` 322 to 312 kB because the indicator parsers leave the shared client chunk, seven others by 1 kB or less); the layout move and the splits moved none; Task 5 moved six routes by 1 kB (`/indicators/library` +1, five `/projects` routes -1). Against the Task 0 baseline `routes 72, different 12` at the gates. A first draft that also moved the binding choices read into `indicators.reads.ts` made `/indicators/library` load `pathways-client` and grew it from 280 to 296 kB; that read stays in the workspace.

## Produces (names later plans consume)

| Name | Path | Signature |
|---|---|---|
| `indicatorsClient` | `apps/web/src/lib/api/indicators.ts` | `getProjectIndicators(projectId, signal?)`, `getProjectIndicatorValues(projectId, signal?)`, `createProjectIndicator(projectId, input, context?)`, `createProjectIndicatorFromLibrary(projectId, input, context?)`, `updateProjectIndicator(projectId, indicatorId, input, context?)`, `recordIndicatorMeasurement(projectId, indicatorId, input, context?)`, `archiveProjectIndicator(projectId, indicatorId, expectedRevision, context?)`, `getIndicators(projectId?, signal?)`; results `IndicatorResponse` (was `ProjectIndicator`) and `Indicator` for `getIndicators`; inputs `Omit<CreateIndicatorRequest \| UpdateIndicatorRequest \| CreateIndicatorFromLibraryRequest, 'clientMutationId'>` and `RecordIndicatorMeasurementRequest` |
| `indicatorLibraryClient` | same file | `list()`, `create(input: CreateIndicatorLibraryEntryRequest)`, `archive(entryId)` (moved from `lib/services/indicator-library-client.ts`, deleted) |
| Reads | `features/projects/indicators/indicators.reads.ts` | `useIndicatorLibraryRead(enabled?, options?)` (key `indicator-library`), `useProjectIndicatorsRead(projectId, enabled?)` (key `project-indicators`, was in `projects.reads.ts`) |
| Copy and utils | `indicators.copy.ts`, `indicators.utils.ts` | `recipeNames`, `typeLabel`, `typeOptions`, `Recipe`, `enabledRecipes`, `enabledRecipeOptions`, `recipeContract`, `recipeTypes`, `recipeTargets`; `text`, `optional`, `generateIndicatorCode`, `suggestIndicatorCode`, `indicatorInputFromForm`, `indicatorPeriod` |
| Layout | `features/projects/indicators/components/` | `project-indicators-workspace`, `indicator-form` (`NewIndicator`), `indicator-editor`, `indicator-library-manager`, `library-entry-form` (`NewEntry`), `use-from-library`; no `hooks/` folder and no sub-index; `features/projects/index.ts` exports `IndicatorLibraryManager` and `ProjectIndicatorsWorkspace` by leaf path |
| Types | `types/pathways.ts` | `ProjectIndicator` alias removed (six importers use `IndicatorResponse` from `@pathways/shared`); `Indicator` view model stays |

## Consumes

S3a: the indicator request and response contracts and `indicatorResponse`, `indicatorListResponse`, `indicatorLibraryEntryResponse`. S1b: `requestSourceMutation`, the `features/projects` layout and index, `indexedFeatures`, `surfaceViolation`, the `optimizePackageImports` entry, `projects.reads.ts`. S2b: `activitiesClient`, the `activities/components` layout (the activities workspace is repointed to the moved read). F4b: `PathwaysClientError`, `requestFoundation`, `useAuthorizedRead`.

## Files touched

New: `lib/api/indicators.ts`, `indicators.test.ts` (26 runs, then 13), `indicators.read.test.ts` (the two moved read cases); in `features/projects/indicators/`: `indicators.{reads,utils}.ts`, `indicators.reads.test.ts`, `components/{indicator-form,indicator-editor,library-entry-form}.tsx`. Moved (git mv): 7 files (workspace with its two tests, library manager with its test, `use-from-library.tsx`, `indicator-recipes.ts` to `indicators.copy.ts`). Edited: `pathways-client.ts` (1521 to 1361 lines), `pathways-client.monitoring.test.ts`, `projects.reads.ts`, `features/projects/index.ts`, `project-activities-workspace.tsx`, `types/pathways.ts`, 8 production files that call an indicator method (17 calls), 6 alias importers (two overlap with the callers), 10 test files with a `pathways-client` mock factory, the workspace and library manager (workspace 952 to 414 lines, 408 after the reads change; manager 401 to 208, 206 after) and the workspace test imports. Deleted: `lib/services/indicator-library-client.ts`. Docs: CR sections 3.3 and 9, audit MOD-05, 06, 15, 16, `docs/index.md`, `docs/activity-log.md`, `docs/qad-pathways.md` (5 paths), `docs/deferred-features.md` (3 paths).

## Rulings and cost if wrong

1. One plan, eight tasks, no split. Cost: executor fatigue; split after Task 2 or Task 4.
2. One client file with two objects (`indicatorsClient`, `indicatorLibraryClient`) and no `.schema` file, because the responses are parsed by the shared zod schemas (S3a ruling 8). Cost: a rename.
3. Inputs take the S3a request types; `recordIndicatorMeasurement` keeps its own ticket call and unwrapped `SourceMutationRecoveryError`, pinned by tests. Cost: restore from git.
4. Both clients run the same characterization cases in Task 1 (26 runs) before the old methods go. Cost: none.
5. Mocks repointed by script with counts (`factories 41, naming 3` before; `41, 0` and `11, 0` after); a factory left empty keeps `pathwaysClient: {}` instead of being removed. Cost: an `undefined` method at run time, caught by the scan and the suite.
6. Outline figures corrected: 17 calls (not 18), two read cases (not three), six alias importers (not seven), app pages already import through the index. The two read cases move verbatim to `lib/api/indicators.read.test.ts` because they need the real request stack. Cost: none.
7. Layout `features/projects/indicators/{components}` with `indicators.{reads,utils,copy}.ts`; no sub-index (S2b measured +23 kB on `/dashboard`) and no empty `hooks/`. Cost: later slices repoint by path.
8. Splits are verbatim by declared name (`split-module.mjs`, the S3a script with an `@original` header), proven with `same-lines.mjs` (`lost 0`); `IndicatorForm` stays file-private beside `NewIndicator`; `text` and `optional` are exported from the utils. Cost: review time.
9. The binding choices read stays in the workspace (route evidence above); `indicators.reads.ts` holds the library and project-indicator keys only, and CR 3.3 records the rule that a reads file imports only clients its routes already load. Cost: one cache entry or a route size.
10. `ProjectIndicator` alias deleted; `reporting-workspace.tsx` (dead, S6b deletes it) is only repointed. Cost: a rename.
11. No new SAD routing. Cost: one glob.
12. Every production build runs after `rm -rf apps/web/.next` through `build-routes.sh`; the route baseline is re-measured before the layout move. Cost: a misleading `Module not found`.

## Risks

- Next's barrel optimization is sensitive to what a reads or index file imports: Task 5 compares routes and the 16 kB regression of the first draft is the proof. Task 7 compares against both baselines; the production-bundle smoke exercises the paths only the production build optimizes.
- Dry-run counts are for `bf8ef5e6` plus S3a replayed from its plan text; Task 0 stops on a hash or count difference. The hashes of the web files S3a's rename codemod rewrote are informational (the line counts are the anchors).
- `trim-imports.mjs` does not see default imports and counts JSX text as a use, so Task 4 removes two leftovers by `sed` (`Target`, `Link`); the plan says so.
- The smoke list (Task 7 Step 3) needs a human with demo users; it was not run in the dry run.
- Not done (recorded in CR section 9): the `use-monitoring-read` import of the workspace until S7 gives analytics an index; the read keys of analytics, rules board, collection and dashboard that call the indicator client (their slices); `recoverSourceMutation` keeps its indicator branch.

## Later-plan lines that need a cross-plan edit

- `modularization-s5-collection.md`: Task 1 mock splitting (line 4788) and ruling 21: after S3b `collection-workspace.test.tsx` also has a `vi.mock('@/lib/api/indicators', ...)` split off its `pathwaysClient` factory (`getIndicators`) and `collection-workspace.extend-projects.test.tsx` gets `indicatorsClient: api`; `collection-workspace.tsx` calls `indicatorsClient.getIndicators`; the `pathways-client` factory count is 41 on dev (the plan says 40) and stays 41 after S3b (`rule-editor.test.tsx` keeps an empty factory), so recount in Task 0.
- `modularization-s6-finance-reports.md`: ruling 13 and Interfaces line 3170: S3b already deleted the `ProjectIndicator` alias, so `reporting-workspace.tsx` imports `IndicatorResponse` from `@pathways/shared` and calls `indicatorsClient.getProjectIndicators`, and `reporting-workspace.test.tsx` and `reporting-page.test.tsx` mock `@/lib/api/indicators`; Task 1 (line 3176): `getProjectIndicators` has eight other users so no indicator client method becomes dead, and the `indicatorsClient` mock line of `reporting-page.test.tsx` goes only if the page no longer reaches the client.
- `modularization-s7-analytics-rules.md`: Task 10 outline (line 1862): the workspace is `features/projects/indicators/components/project-indicators-workspace.tsx`; Task 4 expected fetcher (line 1391): the first fetcher is `(signal) => indicatorsClient.getProjectIndicators(scopeProjectId ?? '', signal)` from `@/lib/api/indicators`, and `rule-editor.test.tsx` mocks that module (plus an empty `pathwaysClient` factory) instead of `pathwaysClient.getProjectIndicators`.
- `modularization-s8-public-users-auth.md`: none; `lib/api/indicators.ts` is one more importer of `lib/services/source-mutation.ts`, whose first line, last line and `uuid.test(` count S3b does not touch.
- `modularization-s4-beneficiaries.md`: none.
- `modularization-s3-indicators.md`: no edit; S3b Task 0 deletes it. Its S3b outline figures are superseded (17 calls, two read cases, six importers, binding read kept in the workspace, no page edits).
- `cross-plan-review.md`: check 8 ("`reporting-workspace.tsx`: S3b may edit, S6b deletes") is resolved as above; add an "S3b cross-plan edits" block with the S5, S6 and S7 lines.
- S3a plan (not S3b): Task 1 Step 3 says Biome leaves `indicators.validation.test.ts` unchanged, but it rewraps the `const steps = vi.hoisted(...)` line (over 100 columns, "Fixed 1 file"); the expected text should say Biome fixes one file.
