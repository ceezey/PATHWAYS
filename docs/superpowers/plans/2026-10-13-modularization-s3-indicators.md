# S3 Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the indicator domain its shared request and response contracts under `packages/shared/src/contracts/indicators` with section 3.6 names, delete `indicators.dto.ts`, split the indicator service by responsibility into reads and definitions, measurements, a mapper and helpers, adopt the S1 `requestIdentity` kernel helper in the three indicator controllers, and (in S3b) move the web indicator client and screens into their own modules, with no change to any route, status code, response body, audit row, permission decision, transaction boundary, SQL statement or rendered screen.

**Architecture:** S3 is split (ruling 1). This plan gives S3a in full (nine tasks including baseline and gates) and S3b as an outline at the end. S3a first pins the indicator 400 and 403 behavior with a characterization test, then moves the indicator schemas verbatim out of `monitoring/metric-contract.ts`, renames them with a string-literal-safe codemod, extracts the mapper and helpers verbatim, moves the measurement path into its own service and replaces the controllers' own identity checks with `requestIdentity`; the characterization test runs unchanged after every step. Mechanical rewrites use one-off Node scripts under `.tmp/s3/` (gitignored, never committed) whose content is given in full. Every script was dry-run in sequence on an export of `a101ad7c` (F4a complete), with S1's `request-identity.ts` added as S1 Task 7 writes it, checked after each task with `tsc --noEmit` for shared, api and web, Biome over the whole repo and the affected Vitest suites (the full api suite passed at the end); the expected outputs below come from that run.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, Prisma 6.19, zod 3.25.76, Vitest 3.2, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S3, 4, 6, 7 and the F1 to F4a dispositions in section 9, plus the F4b, S1 and S2 dispositions once they land) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-05, MOD-06, MOD-08, MOD-11, MOD-15, MOD-16 and MOD-17 for the indicator modules; MOD-B2 stays out of scope).

## Rulings

Controller rulings for S3. Each was checked against `a101ad7c` (refactor/f4a-web-boundaries, F4a complete). F4b, S1 and S2 land before S3; Task 0 recounts every figure below and stops on a difference.

1. **Split into S3a and S3b.** The S3 row holds contracts, API split, web client and feature components; with baseline, records and gates that is about sixteen tasks. S3a (this plan, branch `refactor/s3a-indicators-api`) takes the shared contracts and the API module. S3b (outline below, branch `refactor/s3b-indicators-web`) takes the web client module, the feature folder, the 951-line workspace split, the read keys and the web type aliases. Both names replace `refactor/s3-indicators`; SAD evidence goes to `.tmp/sad/s3a/` and `.tmp/sad/s3b/`.
2. **Indicator contracts move verbatim, with no import cycle.** `monitoring/metric-contract.ts` (392 lines) holds the indicator requests and responses and the dashboard and SADDD contracts, and `monitoringDashboardSchema` embeds the indicator list. Moving only the indicator schemas would make `contracts/indicators` and `metric-contract.ts` import each other, and zod schemas built at module load fail on a cycle. So the declarations split by name into five files: `monitoring/metric-fields.ts` (the private `date`, `decimal` and `uuid` field schemas, now exported for sibling modules), `monitoring/metric-cell.ts` (`P06_CONTRACT_VERSION`, `metricRecipes`, `MetricRecipe`, `metricCellSchema`, `formatMetricCell`), `contracts/indicators/indicator-requests.ts`, `contracts/indicators/indicator-responses.ts`, and `metric-contract.ts`, which keeps `sadddAgeBands` and the dashboard and SADDD contracts (S7). Four shared files that import `metricCellSchema` from `metric-contract` repoint to `metric-cell`.
3. **`metric-fields.ts` stays out of the barrel.** Its names are generic (`date`, `decimal`, `uuid`) and only shared modules use them; exporting them through `packages/shared/src/index.ts` would publish three vague names that later exports could collide with (TS2308). It is the one internal module; CR 3.4 records it.
4. **Section 3.6 names.** `createIndicatorSchema` to `createIndicatorRequest`, `createIndicatorDraftSchema` to `createIndicatorDraftRequest`, `updateIndicatorSchema` to `updateIndicatorRequest`, `archiveIndicatorSchema` to `archiveIndicatorRequest`, `manualMeasurementSchema` to `recordIndicatorMeasurementRequest`, `createLibraryEntrySchema` to `createIndicatorLibraryEntryRequest`, `useLibraryEntrySchema` to `createIndicatorFromLibraryRequest`, `libraryEntrySchema` to `indicatorLibraryEntryResponse`, `monitoringIndicatorSchema` to `indicatorResponse`, and each inferred type likewise (`CreateIndicatorInput` to `CreateIndicatorRequest`, `LibraryEntry` to `IndicatorLibraryEntryResponse`, and so on). `MonitoringIndicator` and `ProjectIndicator` are the same `z.infer` and both become `IndicatorResponse`; `monitoringIndicatorListSchema` and `projectIndicatorListSchema` are the same `z.array(monitoringIndicatorSchema).max(100)` and both become `indicatorListResponse`. The second declaration of each pair is deleted by an exact-line match, so a pair that is not identical stops Task 3. `ArchiveIndicatorRequest` is added because `IndicatorsService.archive` typed the same shape inline. None of the new names exists anywhere at `a101ad7c` (Task 0 rechecks after S1 and S2). `indicatorBindingSchema`, `indicatorTypes` and `libraryRecipes` keep their names: they are parts, not requests or responses.
5. **The rename never touches strings or web-local names.** The four audit writes keep `entityType: 'ProjectIndicator'`, so the codemod rewrites code segments only. It renames a name in a file only when the file declares it in `packages/shared/src` or imports it unaliased from any module except `@/types/pathways`; aliased imports rename only the imported side. The web aliases that shadow the old names (`ProjectIndicator` in `types/pathways.ts` with six importers, the local `CreateIndicatorInput` and `UpdateIndicatorInput` in `pathways-client.ts`, and the `CreateIndicatorDraftRequest as CreateIndicatorInput` alias in the workspace) stay until S3b deletes them.
6. **Indicator requests stay validated in the service, not by `ZodPipe`.** This departs from CR 3.6 `@Body(new ZodPipe(schema))`, which S1 applies to its former DTO routes. Indicators differ in three ways. The services are also entry points: three seed families call `create` and `measure` directly, and `IndicatorLibraryService.createProjectIndicator` passes a composed definition to `IndicatorsService.create`, which must reject a library entry whose direction conflicts with the project target; a controller pipe would leave those paths unvalidated or parse twice. The indicator 400 body is `{ message: 'Invalid indicator request.', issues: [{ field, message }] }` with at most five issues and no `statusCode`, and the web shows `body.message` when it is a string (`requestFoundationResponse`); `ZodPipe` answers `{ statusCode, message: string[], error }`, a different response body, which CR 4 forbids. Moving the parse would also retype 46 test and seed call sites for no behavior gain. `indicators.dto.ts` is still deleted (CR 3.2): its parser becomes `parseIndicatorRequest` in `indicators.helpers.ts`, and the archive route keeps parsing in its controller as today.
7. **Indicator contracts keep their own zod field rules.** S1 adds `packages/shared/src/contracts/common/field-schemas.ts`, which ports class-validator acceptance for former DTO routes. Indicators never had a DTO, and the S1 rules differ from theirs: `uuidString` accepts what `IsUUID()` accepts and keeps the case, while the indicator `uuid` is zod `.uuid()` with a lowercase transform that the stored ids depend on; `date` is the shared `isCalendarDate` refine. Swapping either would change accepted input or stored values, so `metric-fields.ts` keeps them. A later slice whose contract embeds an indicator field imports the indicator contract, not the field schemas.
8. **Indicator responses stay parsed at runtime.** CR 3.6 says response schemas are types only, but `withProgress` (to be `toIndicatorResponse`) parses each SQL row and answers 503 `Stored indicator contract is unavailable.` on drift, and the web parses indicator lists with the list schema; dropping either parse would change a status code or what the web accepts. S3a keeps both and only renames the schemas; S1 ruling 6 made the same call for the monitoring schemas. CR 3.6 records the exception.
9. **A characterization test comes first, and no DTO parity test applies.** Indicators never had a class-validator DTO (MOD-11's 13 modules do not include it; `indicators.dto.ts` is a zod helper). Task 1 pins, before anything moves, the exact 400 bodies, the five-issue cap, the root-path issue for forged keys, the composed library path, "no authorized operation before validation", the 403 `Application profile is required.` on all eleven indicator controller routes and the archive route's parse-before-identity order. It runs unchanged after Tasks 2 to 6.
10. **Mapper and helpers.** `indicators.mapper.ts` holds `releasedNulls`, `toIndicatorResponse` (was the private `withProgress`) and `toLibraryEntryResponse` (was `toEntry` in the library service). `indicators.helpers.ts` holds `parseIndicatorRequest` (was `parseIndicatorInput`), `monitoringSqlError`, `sameLibraryDefinition` (was `sameDefinition`) and, from Task 5, `indicatorIdOrNotFound` (was the private `indicatorId` method). Bodies move verbatim, checked by `same-body.mjs`. The helpers type-import `IndicatorLibraryEntry` from `@prisma/client` but make no client call, which is how CR 3.2 "no Prisma" is read. `dashboards.service.ts` and `analytics.service.ts` import `monitoringSqlError` from the helpers (import line only). The library service's one `Prisma.TransactionClient` becomes `Tx` (F3a left these to the slices).
11. **Measurements get their own service.** `IndicatorsService` is 574 lines (flagged above 500). `measure` (122 lines) moves verbatim to `IndicatorMeasurementsService`, which injects `IndicatorsService` and calls its now public `readOne(tx, ...)`. Reads and definition writes stay together (390 lines) because definitions and their reads share the SQL row shape; the library service still depends on `IndicatorsService.create`. The CR 7 risk row says split services take the caller's `tx` and open none of their own: `measure` was already a route entry point that opens its own authorized operation, so the transaction boundary is unchanged, and the only call across the split, `readOne`, runs in the caller's transaction. S1 ruling 7 made its split code exported functions because that code runs inside the caller's transaction; `measure` does not, so it stays an injectable class. Only `IndicatorsService` is exported from the module, as today.
12. **Seed and test call sites follow.** `.measure(` appears 18 times after Task 1: 5 in three seed files, 1 in the controller and 12 in three test files. Five seed files change, because `local-demo-seed.ts` and `defense-demo-seed.ts` build the services the stage files call. They construct `IndicatorMeasurementsService` beside `IndicatorsService` and change only the call target; `DemoContext.services` gains `indicatorMeasurements`. Under `apps/api/prisma` only these edits and Task 3's one rename file are allowed.
13. **`requestIdentity` replaces the controllers' identity checks.** S1 ruling 9 adds `requestIdentity(request)` to `common/authz/request-identity.ts` and leaves the other 20 controllers to their slices; three are indicator controllers (`indicators.controller.ts` and `indicator-library.controller.ts` each declare a module-level `identity` helper, `indicator-values.controller.ts` checks inline). Task 6 adopts it in all three with the same 403 text. The archive route still parses its body before it reads the identity, as Task 1 pins.
14. **Tests stay where they are.** `indicators.service.test.ts` (603 lines, 608 after Task 5, at the CR 3.5 threshold of about 600) stays one file: its fixtures and mocked transaction are shared, and one case covers the scope refusal for list, create, update and measure together. `metric-contract.test.ts` stays in `monitoring/` with repointed imports, because it also tests metric math and dashboard queries and three QAD rows cite its path.
15. **SAD routing:** moving the schemas out of `packages/shared/src/monitoring/**` would drop rule-engine-determinism-checker for them. `packages/shared/src/contracts/indicators/**/*.ts` is added to that role beside the existing beneficiary-privacy-guardian contracts glob. S1's `apps/api/src/**/*.mapper.ts` glob routes `indicators.mapper.ts` to the privacy guardian with no change here.
16. **Spec facts corrected by the baseline:** MOD-08's indicators `requireProject` copy was closed by F3a. MOD-04 does not list indicators, but the service is above the 500-line flag. MOD-B2 (`/indicators` missing from the middleware matcher) stays open as the audit says.
17. Cross-plan: service validation is the right call here and stays: S1, S2, S4, S5 and the S8 users and auth routes use `ZodPipe` because they replace class-validator DTOs, while S3, S6, S7 and the S8 publication routes keep service parsing for the reasons in ruling 6; the criterion is recorded in the S1 plan and in the CR 3.6 bullet Task 7 writes. Cost if wrong: a 400 body shape change on indicators, or two parses per request.
18. Cross-plan: S7b moves `metric-fields.ts` and `metric-cell.ts` to `packages/shared/src/metrics/` and S4 imports `sadddAgeBands` from `metric-contract.ts`; the relative imports in `contracts/indicators/*` and `contracts/beneficiaries/*` are repointed by S7b Task 5, not here. S3 runs before S4, so S4's `sadddAgeBands` import is correct at its time. Cost if wrong: a broken relative import after the S7b `git mv`, caught by typecheck.
19. Cross-plan (S1b): the two indicator app pages import `@/features/projects`, never `features/projects/indicators`, and `indicators/index.ts` is an internal sub-index re-exported by the feature index; the recovery and select components live under `components/`. Also recount the S3b pathways-client mock factories in Task 0 (42 after S1b, not 49). Cost if wrong: the surface rule test fails on the pages, or a mock split is miscounted.
20. Cross-plan (S2b): there is no `features/projects/indicators/index.ts`; the feature index lists the two indicator components by leaf path, which replaces the sub-index wording of ruling 19 (S2b measured a sub-index growing `/dashboard` from 673 to 696 kB). The activity files S3 touches live under `features/projects/activities/` (`activity-detail-content.tsx` is a new seventh `ProjectIndicator` importer, and `use-project-reads.ts` is `projects.reads.ts`). Cost if wrong: 23 kB on the dashboard route, or a Task 0 count that stops on a moved path.

## Global Constraints

- Behavior-preserving: no route, status code, response body (including the indicator 400 body), audit row, permission decision, transaction boundary, SQL text or rendered screen changes. Only module locations, export names, import specifiers, the measurement call target and the identity helper change.
- `apps/api/src/common/**` never imports `apps/api/src/modules/**`; web, package and api-to-web direction tests stay green at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- Moves and renames are committed separately from logic edits (CR 6); verbatim moves must pass `.tmp/s3/same-body.mjs` before Biome formats them.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise); `monitoring/metric-fields.ts` is the only module not in the barrel.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (`.tmp/s3/imports.mjs prune` does this; Biome 1.9 does not flag unused imports and `tsconfig.base.json` has no `noUnusedLocals`).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- One-off scripts live in `.tmp/s3/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s3a-indicators-api`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files or review evidence; under `apps/api/prisma` only the edits of Task 3 and Task 5 are allowed.

## Review Focus

1. A rejected indicator request must still answer 400 with exactly `{ message: 'Invalid indicator request.', issues }` (at most five `{ field, message }` entries, root issues with an empty field, no `statusCode`), because the web shows that message; an archive body must still be parsed before the identity check. Task 1 pins it for create, update, measure, archive, library create and from-library, and it reruns unchanged in Tasks 2 to 6.
2. A project indicator copied from a library entry whose direction conflicts with the project target must still be refused with that 400 body after the entry is read, because only `IndicatorsService.create` validates the composed definition. Task 1 pins it with one authorized read and no second operation.
3. The audit `entityType: 'ProjectIndicator'` strings must survive the type rename. Task 3 Step 4 greps for exactly four occurrences in `indicators.service.ts`, and the codemod skips string literals by construction.
4. An uppercase indicator id in the path must still be lowercased before SQL, and a non-UUID id must still answer 404 `Indicator unavailable.` on get, update, archive and measure after the private method becomes `indicatorIdOrNotFound`. Task 1 pins the 404 through the controller routes and Task 5 Step 1 pins both in `indicators.helpers.test.ts`.
5. The seeds must still record measurements and the compiled API must boot with the new provider. Task 8 runs `pnpm db:local:demo`, `pnpm db:defense:local` and the compiled API; a Nest `can't resolve dependencies` error naming `IndicatorMeasurementsService` fails the gate.

## Interfaces assumed from earlier slices

S3a assumes these, and Task 0 verifies them:

- S1 (S1a Task 7): `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`, throwing `ForbiddenException('Application profile is required.')` when `request.user` is missing. If Task 0 finds it missing, stop: S3a does not create kernel helpers.
- S1 (S1a Task 8): `apps/api/src/**/*.mapper.ts` in the beneficiary-privacy-guardian globs of `scripts/sad/check.ts`. If it is missing, Task 8 still works (the manifest simply lists fewer files for that role).
- F3a and F3b kernel, unchanged: `type Tx` (`common/prisma/transaction.ts`), `withAuthorizedOperation` (`common/authz/authorized-operation.ts`), `requireScopedProject` (`common/authz/scoped-project.ts`), `writeAuditLog` (`common/audit/write-audit-log.ts`), `UUID_PATTERN` (`common/authz/application-identity.ts`).
- `apps/api/src/modules/indicators/*` and `packages/shared/src/monitoring/metric-contract.ts` unchanged since `a101ad7c` (hashes in Task 0); S1 and S2 do not own them.
- The anchors `wire-measurements.mjs` edits in `apps/api/prisma/{local-demo-seed,defense-demo-seed,hosted-realistic-seed,local-demo-stage-people,defense-demo-stage-monitoring}.ts` and `apps/api/src/modules/rules/rules-source-domains.test.ts`; the script stops on the first missing anchor.
- The web still declares the alias `ProjectIndicator` in `apps/web/src/types/pathways.ts`; the codemod finds files by import, not by path, so web files that F4b, S1 or S2 edited or moved are still renamed.

S3a uses nothing from F4b; S3b's F4b and S1 assumptions are listed in its outline.

## Out of S3a (recorded for S3b and later sub-projects)

- Web: `lib/api/indicators.ts`, `features/projects/indicators/`, the workspace split, `indicators.reads.ts` and the web aliases (MOD-05 indicator part, MOD-06, MOD-15, MOD-16 read keys): S3b, outlined below.
- `metric-contract.ts` keeps the dashboard and SADDD contracts and its name; moving them to `contracts/dashboards` belongs to S7, which can import `date` and `uuid` from `monitoring/metric-fields.ts`.
- MOD-B2: separate security review, as the audit says.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s3-indicators.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F4b, S1 and S2, and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers into dev"
test "$(git log --oneline dev | grep -cE 'Merge refactor/s(1a|1b|2a|2b)-')" -ge 4 && echo "S1 and S2 merged"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/hooks/use-authorized-read.ts && echo "F4b tree present"
grep -n "export function requestIdentity(request: AuthenticatedRequest): ApplicationIdentity" apps/api/src/common/authz/request-identity.ts
git ls-files docs/superpowers/plans
git checkout -b refactor/s3a-indicators-api
pnpm install --frozen-lockfile
mkdir -p .tmp/s3 .tmp/s3/before .tmp/s3/files
```

Expected: clean status, the F4b merge commit, `S1 and S2 merged`, `F4b tree present`, the `requestIdentity` line, install succeeds. If a merge or the helper is missing, stop and report: S3 builds on F4b, S1 and S2. The plan list may still hold an S1 or S2 plan only if its index row says it holds an outline; any other executed plan is removed in Step 3.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git hash-object packages/shared/src/monitoring/metric-contract.ts apps/api/src/modules/indicators/indicators.service.ts apps/api/src/modules/indicators/indicator-library.service.ts apps/api/src/modules/indicators/indicators.dto.ts apps/api/src/modules/indicators/indicators.controller.ts apps/api/src/modules/indicators/indicators.module.ts
OLD="createIndicatorSchema|CreateIndicatorInput|createIndicatorDraftSchema|CreateIndicatorDraftInput|updateIndicatorSchema|UpdateIndicatorInput|archiveIndicatorSchema|manualMeasurementSchema|ManualMeasurementInput|createLibraryEntrySchema|CreateLibraryEntryInput|useLibraryEntrySchema|UseLibraryEntryInput|libraryEntrySchema|LibraryEntry|monitoringIndicatorSchema|MonitoringIndicator|ProjectIndicator|monitoringIndicatorListSchema|projectIndicatorListSchema"
git grep -lwE "$OLD" -- apps packages ':!apps/api/prisma/schema.prisma' ':!*.sql' | wc -l
NEW="createIndicatorRequest|CreateIndicatorRequest|createIndicatorDraftRequest|CreateIndicatorDraftRequest|updateIndicatorRequest|UpdateIndicatorRequest|archiveIndicatorRequest|ArchiveIndicatorRequest|recordIndicatorMeasurementRequest|RecordIndicatorMeasurementRequest|createIndicatorLibraryEntryRequest|CreateIndicatorLibraryEntryRequest|createIndicatorFromLibraryRequest|CreateIndicatorFromLibraryRequest|indicatorLibraryEntryResponse|IndicatorLibraryEntryResponse|indicatorResponse|IndicatorResponse|indicatorListResponse|IndicatorMeasurementsService|indicatorIdOrNotFound|toIndicatorResponse|toLibraryEntryResponse|parseIndicatorRequest|sameLibraryDefinition"
git grep -nwE "$NEW" -- apps packages | wc -l
git grep -nE "\.measure\(" -- apps | wc -l
git grep -n "monitoringSqlError" -- apps ':!apps/api/src/modules/indicators' | wc -l
git grep -nE "from '(\./|\.\./monitoring/|\./monitoring/)metric-contract'" -- packages/shared/src | wc -l
git grep -l "Application profile is required" -- apps/api/src/modules/indicators ':!*.test.ts' | wc -l
git grep -c "it(\|it.each(" -- apps/api/src/modules/indicators/indicators.service.test.ts apps/api/src/modules/indicators/indicator-library.service.test.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count and the docs check failure count (`B_shared`, `B_api`, `B_web`, `B_sad` below; at `a101ad7c` shared was 186 and sad 51, and S1 adds to both). The hashes print, in order, `5e59426040039a0cba5cdc3d79e862a06676dcd4`, `36f8a7d9998c9e03f3e71192557c9afdd0e4c1c8`, `276e46c6b4682c9055ab06c2e3f8d3302e532105`, `5d24a98b502e61d76d8114c1c93d51d0e6744463`, `2cdd983ad8a7efc8c2011e0c7291c52b01902fd3`, `b91d80410ce790da77a386e7d8affcacc671ccdf`; the counts print `20`, `0`, `15`, `5`, `6`, `3`, then `14` for the library test and `24` for the service test. If a hash or count differs, stop and report with `git diff a101ad7c -- <file>` for each changed file: the scripts below were dry-run against `a101ad7c`. The one allowed difference is a larger first count when F4b, S1 or S2 added a file that imports an old name; list those files in the report and continue.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/<date>-modularization-s3-indicators.md`. In `docs/index.md` section 1.6 add as the last row of the table (and delete the row and file of any executed slice plan Step 1 found, with `git rm`):

```markdown
| [S3 indicators plan](superpowers/plans/<date>-modularization-s3-indicators.md) | <date>-modularization-s3-indicators.md | <date> | S3 of the codebase modularization: S3a indicator contracts, API mapper, helpers, measurement service and request identity; S3b web outline | In progress |
```

```bash
git add docs/superpowers/plans docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S3 indicators plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Characterize the indicator 400 and 403 behavior

**Files:**
- Test: `apps/api/src/modules/indicators/indicators.validation.test.ts`

**Interfaces:**
- Consumes: `IndicatorsService.create/update/measure(identity, projectId, [indicatorId,] value: unknown)`, `IndicatorLibraryService.create(identity, value: unknown)`, `IndicatorLibraryService.createProjectIndicator(identity, projectId, value: unknown)`, the eleven routes of `IndicatorsController`, `IndicatorValuesController` and `IndicatorLibraryController`; constructors `new IndicatorsService(prisma)`, `new IndicatorLibraryService(prisma, indicators)`, `new IndicatorsController(service, library)`, `new IndicatorValuesController(service)`, `new IndicatorLibraryController(library)`.
- Produces: the pinned body `{ message: 'Invalid indicator request.', issues: Array<{ field: string; message: string }> }` (at most five), the 403 `Application profile is required.` on every indicator route, and the archive parse-before-identity order, which Tasks 2 to 6 must keep.

- [ ] **Step 1: Write the characterization test**

Create `apps/api/src/modules/indicators/indicators.validation.test.ts`:

```ts
import 'reflect-metadata'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '@app/common/authz/application-identity'
import type { PrismaService } from '@app/prisma/prisma.service'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndicatorLibraryController } from './indicator-library.controller'
import { IndicatorLibraryService } from './indicator-library.service'
import { IndicatorValuesController } from './indicator-values.controller'
import { IndicatorsController } from './indicators.controller'
import { IndicatorsService } from './indicators.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
const steps = vi.hoisted(() => ({ begin: vi.fn(), read: vi.fn(), bootstrap: vi.fn(), scoped: vi.fn() }))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@app/common/authz/scoped-project', () => ({ requireScopedProject: steps.scoped }))
vi.mock('@app/modules/rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  beginRuleSourceOperation: steps.begin,
  readRuleSourceAcknowledgement: steps.read,
  bootstrapRuleSourceProject: steps.bootstrap,
}))

const projectId = '79100000-0000-4000-8000-000000000001'
const indicatorId = '79100000-0000-4000-8000-000000000002'
const requestKey = '79100000-0000-4000-8000-000000000003'
const actor: ApplicationIdentity = {
  id: '79100000-0000-4000-8000-000000000004',
  aal: 'aal2',
  organizationId: '79100000-0000-4000-8000-000000000005',
  userId: '79100000-0000-4000-8000-000000000006',
  fullName: 'Synthetic M&E',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['indicators.create', 'indicators.update', 'indicators.archive'],
  assignedProjectIds: [projectId],
}
const definition = {
  clientMutationId: requestKey,
  code: 'SYNTHETIC_COUNT',
  name: 'Synthetic count',
  unitLabel: 'people',
  dataSource: 'Synthetic register',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  baseline: '0',
  target: '10',
}
const indicators = new IndicatorsService({} as PrismaService)
const library = new IndicatorLibraryService({} as PrismaService, indicators)
const controller = new IndicatorsController(indicators, library)
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }
const anonymous: AuthenticatedRequest = { headers: {} }
const issue = (field: string, message: string) => ({ field, message })

// The 400 body a rejected indicator request answers, or a failure when nothing threw it.
async function invalid(run: () => unknown) {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getStatus()).toBe(400)
    return (error as BadRequestException).getResponse()
  }
  throw new Error('Expected a BadRequestException.')
}

beforeEach(() => {
  boundary.run.mockReset()
  for (const step of Object.values(steps)) step.mockReset()
})

describe('indicator request validation', () => {
  it('answers the indicator 400 body with at most five issues for an empty definition', async () => {
    expect(await invalid(() => indicators.create(actor, projectId, {}))).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('code', 'Required'),
        issue('name', 'Required'),
        issue('unitLabel', 'Required'),
        issue('dataSource', 'Required'),
        issue('mode', 'Required'),
      ],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('names a forged key and a definition rule at the root path', async () => {
    expect(
      await invalid(() => indicators.create(actor, projectId, { ...definition, role: 'X' })),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', "Unrecognized key(s) in object: 'role'")],
    })
    expect(
      await invalid(() => indicators.create(actor, projectId, { ...definition, mode: 'DERIVED' })),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', 'Exactly derived indicators require a binding.')],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('rejects label, measurement and archive bodies before any authorized operation', async () => {
    expect(
      await invalid(() =>
        indicators.update(actor, projectId, indicatorId, {
          clientMutationId: requestKey,
          name: '',
          expectedRevision: 0,
        }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('name', 'String must contain at least 1 character(s)'),
        issue('expectedRevision', 'Number must be greater than or equal to 1'),
      ],
    })
    expect(
      await invalid(() =>
        indicators.measure(actor, projectId, indicatorId, {
          clientMeasurementId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          value: 'abc',
          source: 'Synthetic register',
        }),
      ),
    ).toEqual({ message: 'Invalid indicator request.', issues: [issue('value', 'Invalid')] })
    expect(
      await invalid(() =>
        controller.archive(signedIn, projectId, indicatorId, { expectedRevision: 1 }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('clientMutationId', 'Required')],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('rejects library entry and from-library bodies before any authorized operation', async () => {
    expect(await invalid(() => library.create(actor, { code: 'lowercase' }))).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('code', 'Invalid'),
        issue('name', 'Required'),
        issue('unitLabel', 'Required'),
        issue('dataSource', 'Required'),
        issue('mode', 'Required'),
      ],
    })
    expect(
      await invalid(() =>
        library.createProjectIndicator(actor, projectId, { libraryEntryId: 'x' }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('libraryEntryId', 'Invalid uuid'),
        issue('clientMutationId', 'Required'),
        issue('periodStart', 'Required'),
        issue('periodEnd', 'Required'),
        issue('baseline', 'Required'),
      ],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('validates the definition copied from a library entry with the project values', async () => {
    boundary.run.mockResolvedValueOnce([
      {
        code: 'FEWER_DROPOUTS',
        name: 'Fewer dropouts',
        description: null,
        unitLabel: 'learners',
        dataSource: 'Synthetic register',
        measurementMode: 'MANUAL',
        numericKind: 'COUNT',
        direction: 'LOWER_IS_BETTER',
        displayPrecision: 0,
        recipe: null,
      },
    ])
    expect(
      await invalid(() =>
        library.createProjectIndicator(actor, projectId, {
          libraryEntryId: indicatorId,
          clientMutationId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          baseline: '0',
          target: '10',
        }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', 'Target conflicts with the selected direction.')],
    })
    expect(boundary.run).toHaveBeenCalledTimes(1)
  })
})

describe('indicator request identity', () => {
  it('answers 403 on every indicator route reached without an application profile', () => {
    const calls = [
      () => controller.list(anonymous, projectId),
      () => controller.get(anonymous, projectId, indicatorId),
      () => controller.create(anonymous, projectId, definition),
      () => controller.createFromLibrary(anonymous, projectId, {}),
      () => controller.update(anonymous, projectId, indicatorId, {}),
      () => controller.measure(anonymous, projectId, indicatorId, {}),
      () => new IndicatorValuesController(indicators).list(anonymous, projectId),
      () => new IndicatorLibraryController(library).list(anonymous),
      () => new IndicatorLibraryController(library).create(anonymous, {}),
      () => new IndicatorLibraryController(library).archive(anonymous, indicatorId),
    ]
    for (const call of calls) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('parses the archive body before it checks the application profile', async () => {
    expect(await invalid(() => controller.archive(anonymous, projectId, indicatorId, {}))).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('clientMutationId', 'Required'), issue('expectedRevision', 'Required')],
    })
    const valid = { clientMutationId: requestKey, expectedRevision: 1 }
    expect(() => controller.archive(anonymous, projectId, indicatorId, valid)).toThrow(
      ForbiddenException,
    )
    expect(boundary.run).not.toHaveBeenCalled()
  })
})

describe('indicator id path parameter', () => {
  it('answers 404 Indicator unavailable. for a non-UUID id on get, update, archive and measure', async () => {
    boundary.run.mockImplementation((_prisma, _identity, _operation, run) => run({}, actor))
    steps.begin.mockResolvedValue({ kind: 'NEW' })
    steps.read.mockResolvedValue(null)
    steps.scoped.mockResolvedValue(projectId)
    const id = 'not-a-uuid'
    const calls = [
      () => controller.get(signedIn, projectId, id),
      () =>
        controller.update(signedIn, projectId, id, {
          clientMutationId: requestKey,
          name: 'Renamed',
          expectedRevision: 1,
        }),
      () =>
        controller.archive(signedIn, projectId, id, {
          clientMutationId: requestKey,
          expectedRevision: 1,
        }),
      () =>
        controller.measure(signedIn, projectId, id, {
          clientMeasurementId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          value: '5',
          source: 'Synthetic register',
        }),
    ]
    for (const call of calls) {
      const error = await call().catch((thrown: unknown) => thrown)
      expect(error).toBeInstanceOf(NotFoundException)
      expect((error as NotFoundException).message).toBe('Indicator unavailable.')
    }
  })
})
```

- [ ] **Step 2: Run it against the unchanged code**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.validation.test.ts`
Expected: PASS, 8 tests. This is a characterization test: a failure means the expectation does not describe today's behavior. Stop and report the failing case; do not edit the code to match.

- [ ] **Step 3: Commit**

```bash
pnpm exec biome check --write apps/api/src/modules/indicators/indicators.validation.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/indicators/indicators.validation.test.ts
git commit -m "test(api): pin the indicator 400 and 403 behavior before the indicator module moves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: Biome leaves the file unchanged (it is written in Biome's format); api = `B_api + 8`.

---

### Task 2: Move the indicator contracts into packages/shared/src/contracts/indicators

**Files:**
- Create: `packages/shared/src/monitoring/metric-fields.ts`, `packages/shared/src/monitoring/metric-cell.ts`, `packages/shared/src/contracts/indicators/indicator-requests.ts`, `packages/shared/src/contracts/indicators/indicator-responses.ts`
- Modify: `packages/shared/src/monitoring/metric-contract.ts` (keeps the dashboard and SADDD contracts)
- Modify: `packages/shared/src/index.ts` (three barrel lines)
- Modify (specifier only): `packages/shared/src/monitoring/descriptive-analytics.ts`, `overview-metrics.ts`, `project-map.ts`, `packages/shared/src/rules/rule-metrics.ts`
- Test: `packages/shared/src/monitoring/metric-contract.test.ts` (import block only)

**Interfaces:**
- Produces, from `@pathways/shared` (definitions and names unchanged in this task): `P06_CONTRACT_VERSION`, `metricRecipes`, `MetricRecipe`, `metricCellSchema`, `formatMetricCell(cell: MetricCell): string` (module `monitoring/metric-cell.ts`); every indicator schema and type of ruling 4 under its old name (modules `contracts/indicators/indicator-requests.ts` and `indicator-responses.ts`).
- Produces, internal to `packages/shared/src` (not in the barrel): `date`, `decimal`, `uuid` zod field schemas from `monitoring/metric-fields.ts`.

- [ ] **Step 1: Create the split and body check scripts**

Create `.tmp/s3/split-module.mjs` (the F4a script, unchanged):

```js
// Splits a module's top-level declarations, verbatim and in order, into new files by declared name.
import { readFileSync, writeFileSync } from 'node:fs'

const [source, planFile] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const lines = readFileSync(source, 'utf8').split('\n')
const declaration = /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// Skip the import block: everything before the first top-level declaration or comment.
let index = lines.findIndex((line) => starts.test(line))
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
  writeFileSync(file, `${header.join('\n')}\n\n${body.join('\n').replace(/\n*$/, '\n')}`)
  console.log(`${file}: ${body.length} lines`)
}
```

Create `.tmp/s3/same-body.mjs`:

```js
// Fails unless the files after the separator hold exactly the non-import lines of the files before it, ignoring order, blanks and export keywords.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const split = args.indexOf('--')
const renames = args.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = args.filter((arg) => arg !== '--' && !arg.includes('='))
const before = files.slice(0, split)
const after = files.slice(split)
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|@)/

// Declaration lines after each file's import block, with renames undone and export keywords dropped.
const body = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .filter((line) => line.trim() !== '')
    .map((line) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const old = count(before.flatMap(body))
const now = count(after.flatMap(body))
const problems = []
for (const [line, n] of old)
  if ((now.get(line) ?? 0) !== n) problems.push(`before ${n}x, after ${now.get(line) ?? 0}x: ${line}`)
for (const [line, n] of now) if (!old.has(line)) problems.push(`after only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same lines: ${[...old.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

Create `.tmp/s3/contracts-split.json`:

```json
{
  "packages/shared/src/monitoring/metric-fields.ts": {
    "header": ["import { z } from 'zod'", "import { isCalendarDate } from './metric-math'"],
    "names": ["date", "decimal", "uuid"]
  },
  "packages/shared/src/monitoring/metric-cell.ts": {
    "header": [
      "import { z } from 'zod'",
      "import { decimal } from './metric-fields'",
      "import type { MetricCell } from './metric-math'"
    ],
    "names": ["P06_CONTRACT_VERSION", "metricRecipes", "MetricRecipe", "metricCellSchema", "formatMetricCell"]
  },
  "packages/shared/src/contracts/indicators/indicator-requests.ts": {
    "header": [
      "import { z } from 'zod'",
      "import { type MetricRecipe, metricRecipes } from '../../monitoring/metric-cell'",
      "import { date, decimal, uuid } from '../../monitoring/metric-fields'",
      "import {",
      "  indicatorProgress,",
      "  normalizeMetricDecimal,",
      "  numericKinds,",
      "  validateMetricPeriod,",
      "} from '../../monitoring/metric-math'"
    ],
    "names": [
      "indicatorBindingSchema", "IndicatorBinding", "indicatorTypes", "definitionFields", "draftDefinitionSchema",
      "validateIndicatorDefinition", "createIndicatorDraftSchema", "CreateIndicatorDraftInput", "createIndicatorSchema",
      "CreateIndicatorInput", "libraryRecipes", "createLibraryEntrySchema", "CreateLibraryEntryInput",
      "useLibraryEntrySchema", "UseLibraryEntryInput", "updateIndicatorSchema", "UpdateIndicatorInput",
      "archiveIndicatorSchema", "manualMeasurementSchema", "ManualMeasurementInput"
    ]
  },
  "packages/shared/src/contracts/indicators/indicator-responses.ts": {
    "header": [
      "import { z } from 'zod'",
      "import { P06_CONTRACT_VERSION, metricCellSchema, metricRecipes } from '../../monitoring/metric-cell'",
      "import { date, decimal, uuid } from '../../monitoring/metric-fields'",
      "import { numericKinds } from '../../monitoring/metric-math'",
      "import { indicatorBindingSchema, indicatorTypes } from './indicator-requests'"
    ],
    "names": [
      "libraryEntrySchema", "LibraryEntry", "monitoringIndicatorSchema", "MonitoringIndicator",
      "monitoringIndicatorListSchema", "ProjectIndicator", "projectIndicatorListSchema"
    ]
  },
  "packages/shared/src/monitoring/metric-contract.ts": {
    "header": [
      "import { z } from 'zod'",
      "import { monitoringIndicatorListSchema } from '../contracts/indicators/indicator-responses'",
      "import { P06_CONTRACT_VERSION, metricCellSchema } from './metric-cell'",
      "import { date, uuid } from './metric-fields'",
      "import { validateMetricPeriod } from './metric-math'"
    ],
    "names": [
      "sadddAgeBands", "dashboardQuerySchema", "DashboardQuery", "sadddQuerySchema", "SadddQuery", "bucket",
      "contextFields", "sadddDashboardSchema", "SadddDashboard", "monitoringDashboardSchema", "MonitoringDashboard"
    ]
  }
}
```

- [ ] **Step 2: Split verbatim and check**

```bash
M=packages/shared/src/monitoring
C=packages/shared/src/contracts/indicators
git show HEAD:$M/metric-contract.ts > .tmp/s3/before/metric-contract.ts
mkdir -p $C
node .tmp/s3/split-module.mjs $M/metric-contract.ts .tmp/s3/contracts-split.json
sed -i -e 's/^const date = /export const date = /' -e 's/^const decimal = /export const decimal = /' -e 's/^const uuid = z$/export const uuid = z/' $M/metric-fields.ts
node .tmp/s3/same-body.mjs .tmp/s3/before/metric-contract.ts -- $M/metric-fields.ts $M/metric-cell.ts $C/indicator-requests.ts $C/indicator-responses.ts $M/metric-contract.ts
grep -c "^export const \(date\|decimal\|uuid\) = " $M/metric-fields.ts
```

Expected: five files written with `6`, `37`, `195`, `51` and `92` body lines; `same lines: 372` (exit 0); `3`. Any other output from `same-body.mjs`: stop, the split is not verbatim.

- [ ] **Step 3: Add the module comment, barrel lines, repoints and test imports**

```bash
M=packages/shared/src/monitoring
node -e "const fs=require('fs');const f='$M/metric-fields.ts';const t=fs.readFileSync(f,'utf8');const a=\"from './metric-math'\n\n\";if(!t.includes(a))throw new Error('anchor');fs.writeFileSync(f,t.replace(a,a+'// Field schemas for the metric and indicator contracts, kept out of the package barrel.\n'))"
sed -i "s#^export \* from './monitoring/metric-math'\$#&\nexport * from './monitoring/metric-cell'#" packages/shared/src/index.ts
sed -i "s#^export \* from './contracts/imports/import-requests'\$#&\nexport * from './contracts/indicators/indicator-requests'\nexport * from './contracts/indicators/indicator-responses'#" packages/shared/src/index.ts
sed -i "s#from './metric-contract'#from './metric-cell'#" $M/descriptive-analytics.ts $M/overview-metrics.ts $M/project-map.ts
sed -i "s#from '../monitoring/metric-contract'#from '../monitoring/metric-cell'#" packages/shared/src/rules/rule-metrics.ts
```

In `packages/shared/src/monitoring/metric-contract.test.ts`, replace the import block

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
```

with

```ts
import {
  createIndicatorDraftSchema,
  createIndicatorSchema,
  manualMeasurementSchema,
} from '../contracts/indicators/indicator-requests'
import { monitoringIndicatorSchema } from '../contracts/indicators/indicator-responses'
import { metricCellSchema } from './metric-cell'
import { dashboardQuerySchema, sadddAgeBands } from './metric-contract'
```

```bash
git grep -nE "from '(\./|\.\./monitoring/|\./monitoring/)metric-contract'" -- packages/shared/src
grep -n "metric-cell\|contracts/indicators" packages/shared/src/index.ts
```

Expected: the first grep prints two lines (the barrel and the test's dashboard import); the barrel shows `metric-cell` directly after `metric-math` and the two indicator contract lines directly after `import-requests`.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/shared exec vitest run
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/indicators src/modules/dashboards src/modules/reports
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared
git status --short packages/shared
git commit -m "refactor(shared): move the indicator contracts into contracts/indicators

Declarations move verbatim; the metric cell and field schemas get their own modules so the dashboard contract and the indicator contracts do not import each other.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared` (no test added); api = `B_api + 8`; the shared build writes `packages/shared/dist/contracts/indicators/indicator-requests.js` and `packages/shared/dist/monitoring/metric-cell.js`; typecheck (all packages, so the api and web barrel users) and lint pass; the api suites pass unchanged.

---

### Task 3: Rename the indicator contracts to request and response names

**Files:**
- Modify (declarations): `packages/shared/src/contracts/indicators/indicator-requests.ts`, `packages/shared/src/contracts/indicators/indicator-responses.ts`
- Modify (rename only, 14 files at `a101ad7c`): `packages/shared/src/monitoring/metric-contract.ts`, `packages/shared/src/monitoring/metric-contract.test.ts`, `apps/api/src/modules/indicators/{indicator-library.service,indicators.controller,indicators.dto,indicators.service}.ts`, `apps/api/src/modules/reports/report-project-status.ts`, `apps/api/prisma/defense-demo-stage-monitoring.ts`, `apps/web/src/features/projects/{indicator-library-manager,project-indicators-workspace,use-from-library}.tsx`, `apps/web/src/lib/services/{indicator-library-client,pathways-client}.ts`, `apps/web/src/types/pathways.ts`

**Interfaces:**
- Consumes: the Task 2 modules.
- Produces, from `@pathways/shared`: `createIndicatorRequest` / `CreateIndicatorRequest`, `createIndicatorDraftRequest` / `CreateIndicatorDraftRequest`, `updateIndicatorRequest` / `UpdateIndicatorRequest`, `archiveIndicatorRequest` / `ArchiveIndicatorRequest`, `recordIndicatorMeasurementRequest` / `RecordIndicatorMeasurementRequest`, `createIndicatorLibraryEntryRequest` / `CreateIndicatorLibraryEntryRequest`, `createIndicatorFromLibraryRequest` / `CreateIndicatorFromLibraryRequest` (module `contracts/indicators/indicator-requests.ts`); `indicatorLibraryEntryResponse` / `IndicatorLibraryEntryResponse`, `indicatorResponse` / `IndicatorResponse`, `indicatorListResponse` (module `contracts/indicators/indicator-responses.ts`). `IndicatorsService.archive(identity, projectId, indicatorId, input: ArchiveIndicatorRequest)`.

- [ ] **Step 1: Create the rename codemod and its name map**

Create `.tmp/s3/rename-contracts.mjs`:

```js
// Renames shared contract exports in code (never inside string literals) for files that declare or import them unaliased.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile, ...roots] = process.argv.slice(2)
const names = JSON.parse(readFileSync(mapFile, 'utf8'))
const shared = path.resolve('packages/shared/src')
const skipSources = new Set(['@/types/pathways'])
const importPattern = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g
const word = (name) => new RegExp(`\\b${name}\\b`, 'g')

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// Splits source into code and string-literal segments so strings stay untouched.
function segments(text) {
  const parts = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i)
      if (i < 0) break
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2)
      if (i < 0) break
      i++
      continue
    }
    if (ch !== "'" && ch !== '"' && ch !== '`') continue
    let j = i + 1
    while (j < text.length && text[j] !== ch && (ch === '`' || text[j] !== '\n'))
      j += text[j] === '\\' ? 2 : 1
    // A quote with no closing quote on its line is JSX text, such as an apostrophe.
    if (text[j] !== ch) continue
    parts.push({ code: true, text: text.slice(start, i) })
    parts.push({ code: false, text: text.slice(i, j + 1) })
    start = j + 1
    i = j
  }
  parts.push({ code: true, text: text.slice(start) })
  return parts
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  const text = readFileSync(file, 'utf8')
  const unaliased = new Set()
  for (const [, list, , source] of text.matchAll(importPattern)) {
    if (skipSources.has(source)) continue
    for (const item of list.split(',').map((part) => part.trim().replace(/^type\s+/, ''))) {
      if (names[item]) unaliased.add(item)
    }
  }
  if (file.startsWith(shared))
    for (const name of Object.keys(names))
      if (new RegExp(`export\\s+(?:const|type|function)\\s+${name}\\b`).test(text)) unaliased.add(name)
  // Aliased imports rename only the imported side.
  let next = text.replace(importPattern, (whole, list) => {
    const renamed = list.replace(/\b([A-Za-z_$][\w$]*)(\s+as\s+)/g, (item, name, as) =>
      names[name] ? `${names[name]}${as}` : item,
    )
    return whole.replace(list, renamed)
  })
  if (unaliased.size)
    next = segments(next)
      .map((part) =>
        part.code
          ? [...unaliased].reduce((code, name) => code.replace(word(name), names[name]), part.text)
          : part.text,
      )
      .join('')
  // A merged rename can leave one name twice in an import list.
  next = next.replace(importPattern, (whole, list) => {
    const items = list.split(',').map((part) => part.trim()).filter(Boolean)
    const unique = [...new Set(items)]
    return unique.length === items.length ? whole : whole.replace(list, ` ${unique.join(', ')} `)
  })
  if (next === text) continue
  writeFileSync(file, next)
  total++
  console.log(path.relative(process.cwd(), file).split(path.sep).join('/'))
}
console.log(`files: ${total}`)
```

Create `.tmp/s3/contract-names.json`:

```json
{
  "createIndicatorSchema": "createIndicatorRequest",
  "CreateIndicatorInput": "CreateIndicatorRequest",
  "createIndicatorDraftSchema": "createIndicatorDraftRequest",
  "CreateIndicatorDraftInput": "CreateIndicatorDraftRequest",
  "updateIndicatorSchema": "updateIndicatorRequest",
  "UpdateIndicatorInput": "UpdateIndicatorRequest",
  "archiveIndicatorSchema": "archiveIndicatorRequest",
  "manualMeasurementSchema": "recordIndicatorMeasurementRequest",
  "ManualMeasurementInput": "RecordIndicatorMeasurementRequest",
  "createLibraryEntrySchema": "createIndicatorLibraryEntryRequest",
  "CreateLibraryEntryInput": "CreateIndicatorLibraryEntryRequest",
  "useLibraryEntrySchema": "createIndicatorFromLibraryRequest",
  "UseLibraryEntryInput": "CreateIndicatorFromLibraryRequest",
  "libraryEntrySchema": "indicatorLibraryEntryResponse",
  "LibraryEntry": "IndicatorLibraryEntryResponse",
  "monitoringIndicatorSchema": "indicatorResponse",
  "MonitoringIndicator": "IndicatorResponse",
  "ProjectIndicator": "IndicatorResponse",
  "monitoringIndicatorListSchema": "indicatorListResponse",
  "projectIndicatorListSchema": "indicatorListResponse"
}
```

Create `.tmp/s3/imports.mjs` (Tasks 3, 4 and 5 use it):

```js
// Edits named imports: add names to a module's import, move names between modules, or prune names the file no longer uses.
import { readFileSync, writeFileSync } from 'node:fs'

const [command, file, ...rest] = process.argv.slice(2)
const pattern = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'\n/gm
let text = readFileSync(file, 'utf8')

// Named items of one statement, each carrying its own type marker.
const items = (typeOnly, list) =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item) => (typeOnly && !item.startsWith('type ') ? `type ${item}` : item))
const local = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)
const render = (list, module) =>
  list.length === 0
    ? ''
    : list.every((item) => item.startsWith('type '))
      ? `import type { ${list.map((item) => item.slice(5)).join(', ')} } from '${module}'\n`
      : `import { ${list.join(', ')} } from '${module}'\n`

// Adds names to a module's statement, or returns null when the file has none.
const addTo = (source, module, wanted) => {
  let found = false
  const next = source.replace(pattern, (whole, type, list, from) => {
    if (from !== module || found) return whole
    found = true
    const current = items(type, list)
    return render([...current, ...wanted.filter((name) => !current.includes(name))], module)
  })
  return found ? next : null
}

if (command === 'add') {
  const [module, ...names] = rest
  const wanted = names.map((name) => name.replace(/^type:/, 'type '))
  const next = addTo(text, module, wanted)
  if (next !== null) text = next
  else {
    const matches = [...text.matchAll(pattern)]
    const end = matches.length ? matches.at(-1).index + matches.at(-1)[0].length : 0
    text = text.slice(0, end) + render(wanted, module) + text.slice(end)
  }
} else if (command === 'move') {
  const [from, to, ...names] = rest
  const hasTarget = [...text.matchAll(pattern)].some((match) => match[3] === to)
  let moved = []
  text = text.replace(pattern, (whole, type, list, source) => {
    if (source !== from) return whole
    const current = items(type, list)
    moved = current.filter((item) => names.includes(local(item)))
    if (moved.length !== names.length) throw new Error(`${file}: ${from} lacks ${names.join(', ')}`)
    const kept = render(
      current.filter((item) => !moved.includes(item)),
      from,
    )
    return hasTarget ? kept : kept + render(moved, to)
  })
  if (!moved.length) throw new Error(`${file}: no import from ${from}`)
  if (hasTarget) text = addTo(text, to, moved)
} else if (command === 'prune') {
  const matches = [...text.matchAll(pattern)]
  const end = matches.length ? matches.at(-1).index + matches.at(-1)[0].length : 0
  const body = text.slice(end)
  // Quoted strings are blanked so a name inside a string literal does not count as a use.
  const code = body.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
  const used = (item) => new RegExp(`\\b${local(item).replace(/\$/g, '\\$')}\\b`).test(code)
  const removed = []
  text =
    text.slice(0, end).replace(pattern, (_whole, type, list, from) => {
      const all = items(type, list)
      removed.push(...all.filter((item) => !used(item)).map(local))
      return render(all.filter(used), from)
    }) + body
  console.log(`${file}: pruned ${removed.length ? removed.join(', ') : 'nothing'}`)
} else throw new Error(`Unknown command ${command}`)
writeFileSync(file, text)
```

- [ ] **Step 2: Merge the duplicate response declarations**

```bash
C=packages/shared/src/contracts/indicators
sed -i -e '/^export type ProjectIndicator = z.infer<typeof monitoringIndicatorSchema>$/d' -e '/^export const projectIndicatorListSchema = z.array(monitoringIndicatorSchema).max(100)$/d' $C/indicator-responses.ts
grep -c "ProjectIndicator\|projectIndicatorListSchema" $C/indicator-responses.ts
```

Expected: `0` (Biome left both declarations on one line each after Task 2; if the count is not `0`, delete the two declarations by hand).

- [ ] **Step 3: Run the codemod and add the archive type**

```bash
node .tmp/s3/rename-contracts.mjs .tmp/s3/contract-names.json packages/shared/src apps/api/src apps/api/prisma apps/web/src apps/web/e2e
```

Expected, in walk order: `packages/shared/src/contracts/indicators/indicator-requests.ts`, `indicator-responses.ts`, `packages/shared/src/monitoring/metric-contract.test.ts`, `metric-contract.ts`, `apps/api/src/modules/indicators/indicator-library.service.ts`, `indicators.controller.ts`, `indicators.dto.ts`, `indicators.service.ts`, `apps/api/src/modules/reports/report-project-status.ts`, `apps/api/prisma/defense-demo-stage-monitoring.ts`, `apps/web/src/features/projects/indicator-library-manager.tsx`, `project-indicators-workspace.tsx`, `use-from-library.tsx`, `apps/web/src/lib/services/indicator-library-client.ts`, `pathways-client.ts`, `apps/web/src/types/pathways.ts`, then `files: 16`. A web file listed under a different folder is fine when an earlier slice moved it, and an extra file is fine when Task 0 Step 2 listed it as added by F4b, S1 or S2.

Add the archive type and use it:

```bash
node - <<'EOF'
const fs = require('fs')
const edit = (file, from, to) => {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes(from)) throw new Error(`${file}: missing ${from}`)
  fs.writeFileSync(file, text.replace(from, to))
}
const declaration =
  'export const archiveIndicatorRequest = z\n  .object({ clientMutationId: uuid, expectedRevision: z.number().int().min(1) })\n  .strict()\n'
edit(
  'packages/shared/src/contracts/indicators/indicator-requests.ts',
  declaration,
  `${declaration}export type ArchiveIndicatorRequest = z.infer<typeof archiveIndicatorRequest>\n`,
)
edit(
  'apps/api/src/modules/indicators/indicators.service.ts',
  '    input: { clientMutationId: string; expectedRevision: number },',
  '    input: ArchiveIndicatorRequest,',
)
EOF
node .tmp/s3/imports.mjs add apps/api/src/modules/indicators/indicators.service.ts @pathways/shared type:ArchiveIndicatorRequest
```

- [ ] **Step 4: Check what is left of the old names**

```bash
git add -N packages/shared apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
OLD="createIndicatorSchema|CreateIndicatorInput|createIndicatorDraftSchema|CreateIndicatorDraftInput|updateIndicatorSchema|UpdateIndicatorInput|archiveIndicatorSchema|manualMeasurementSchema|ManualMeasurementInput|createLibraryEntrySchema|CreateLibraryEntryInput|useLibraryEntrySchema|UseLibraryEntryInput|libraryEntrySchema|LibraryEntry|monitoringIndicatorSchema|MonitoringIndicator|ProjectIndicator|monitoringIndicatorListSchema|projectIndicatorListSchema"
git grep -cwE "$OLD" -- apps packages ':!apps/api/prisma/schema.prisma' ':!*.sql'
git grep -n "entityType: 'ProjectIndicator'" -- apps/api/src/modules/indicators/indicators.service.ts | wc -l
```

Expected: exactly these ten files with these line counts (paths may differ where an earlier slice moved a web file): `apps/api/src/modules/indicators/indicators.service.ts:4` (the four audit strings), `apps/web/src/features/analytics/analytics-dashboard.tsx:3`, `analytics-reporting-periods.ts:2`, `apps/web/src/features/projects/activities/components/activity-detail-content.tsx:2`, `activity-detail-panel.tsx:2`, `activity-detail-sections.tsx:3` (the last two also under `activities/components/`), `project-indicators-workspace.tsx:3`, `apps/web/src/features/reports/reporting-workspace.tsx:2`, `apps/web/src/lib/services/pathways-client.ts:21`, `apps/web/src/types/pathways.ts:1`; then `4` (Review Focus 3). Every web line left is a web-local alias of ruling 5. An extra file is allowed only when Task 0 Step 2 listed it and every line left in it is a web-local alias. Any other file or count: stop and report.

- [ ] **Step 5: Run the tests and commit**

```bash
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared exec vitest run
pnpm --filter @pathways/api exec vitest run src/modules/indicators src/modules/dashboards src/modules/reports src/modules/rules/rules-source-domains.test.ts
pnpm --filter @pathways/web exec vitest run src/features/projects/project-indicators-workspace src/features/projects/indicator-library-manager src/lib/services/pathways-client src/features/analytics/analytics-dashboard.test.tsx
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared apps
git commit -m "refactor(shared): name the indicator contracts as requests and responses

MonitoringIndicator and ProjectIndicator merge into IndicatorResponse and the two identical list schemas into indicatorListResponse; ArchiveIndicatorRequest types the archive input. Audit entity strings and web-local aliases are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck and lint pass; all listed suites pass with unchanged counts.

---

### Task 4: Indicator mapper and helpers; delete indicators.dto.ts

**Files:**
- Create: `apps/api/src/modules/indicators/indicators.mapper.ts`, `apps/api/src/modules/indicators/indicators.helpers.ts`
- Test: `apps/api/src/modules/indicators/indicators.helpers.test.ts`
- Delete: `apps/api/src/modules/indicators/indicators.dto.ts`
- Modify: `apps/api/src/modules/indicators/indicators.service.ts`, `indicator-library.service.ts`, `indicators.controller.ts`
- Modify (import line only): `apps/api/src/modules/dashboards/dashboards.service.ts`, `apps/api/src/modules/dashboards/analytics.service.ts`

**Interfaces:**
- Consumes: the Task 3 contract names.
- Produces, from `apps/api/src/modules/indicators/indicators.helpers.ts`: `parseIndicatorRequest<T>(schema: z.ZodType<T>, input: unknown): T` (throws `BadRequestException` with the Task 1 body), `monitoringSqlError(error: unknown): never`, `sameLibraryDefinition(row: IndicatorLibraryEntry, input: CreateIndicatorLibraryEntryRequest): boolean`. From `indicators.mapper.ts`: `releasedNulls`, `toIndicatorResponse(row: Record<string, unknown>, failure: string): IndicatorResponse`, `toLibraryEntryResponse(row: IndicatorLibraryEntry): IndicatorLibraryEntryResponse`.

- [ ] **Step 1: Write the failing helpers test**

Create `apps/api/src/modules/indicators/indicators.helpers.test.ts`:

```ts
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { monitoringSqlError } from './indicators.helpers'

describe('monitoringSqlError', () => {
  it.each([
    [{ code: 'P2002' }, ConflictException],
    [{ code: 'P2010', meta: { code: '40001' } }, ConflictException],
    [{ code: 'P2010', meta: { code: '42501' } }, ForbiddenException],
    [{ code: 'P2028' }, ServiceUnavailableException],
    [{ code: 'P2010', meta: { code: '57014' } }, ServiceUnavailableException],
  ])('maps %j to its HTTP exception', (error, type) => {
    expect(() => monitoringSqlError(error)).toThrow(type)
  })

  it('rethrows any other error unchanged', () => {
    const error = new Error('Synthetic driver fault')
    expect(() => monitoringSqlError(error)).toThrow(error)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.helpers.test.ts`
Expected: FAIL, cannot find module `./indicators.helpers`.

- [ ] **Step 2: Create the two new modules and the declaration remover**

Create `.tmp/s3/files/indicators.mapper.ts`. Signatures stay on one line as in the source, so the body check matches; Biome wraps them in Step 5.

```ts
import { ServiceUnavailableException } from '@nestjs/common'
import {
  type IndicatorLibraryEntryResponse,
  type IndicatorResponse,
  type MetricRecipe,
  P06_CONTRACT_VERSION,
  indicatorProgress,
  indicatorResponse,
  missingMetric,
} from '@pathways/shared'
import type { IndicatorLibraryEntry } from '@prisma/client'

// Released rows carry no definition text, binding or measurement provenance.
export const releasedNulls = {
  description: null,
  dataSource: null,
  mode: null,
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
}

/** Parses one indicator row and adds its baseline-to-target progress. */
export function toIndicatorResponse(row: Record<string, unknown>, failure: string): IndicatorResponse {
  const parsed = indicatorResponse.safeParse({
    ...row,
    progress: missingMetric('NOT_YET_CALCULATED'),
    contractVersion: P06_CONTRACT_VERSION,
  })
  if (!parsed.success) throw new ServiceUnavailableException(failure)
  const indicator = parsed.data
  const progress = indicator.direction
    ? indicatorProgress(
        indicator.current,
        indicator.baseline,
        indicator.target,
        indicator.direction,
      )
    : missingMetric('LEGACY_REVIEW_REQUIRED')
  return { ...indicator, progress }
}

export function toLibraryEntryResponse(row: IndicatorLibraryEntry): IndicatorLibraryEntryResponse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unitLabel: row.unitLabel,
    dataSource: row.dataSource,
    mode: row.measurementMode as IndicatorLibraryEntryResponse['mode'],
    numericKind: row.numericKind as IndicatorLibraryEntryResponse['numericKind'],
    direction: row.direction as IndicatorLibraryEntryResponse['direction'],
    displayPrecision: row.displayPrecision,
    recipe: row.recipe as MetricRecipe | null,
    createdAt: row.createdAt.toISOString(),
  }
}
```

Create `.tmp/s3/files/indicators.helpers.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { CreateIndicatorLibraryEntryRequest } from '@pathways/shared'
import type { IndicatorLibraryEntry } from '@prisma/client'
import type { z } from 'zod'

/** Explicit parsing is intentional: type-only DTO imports do not provide runtime validation. */
export function parseIndicatorRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid indicator request.',
      issues: result.error.issues
        .slice(0, 5)
        .map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    })
  }
  return result.data
}

export function monitoringSqlError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
  const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
  if (
    code === 'P2002' ||
    code === 'P2034' ||
    ['23505', '23514', '40001', '40P01'].includes(String(sqlCode))
  ) {
    throw new ConflictException(
      'The indicator or measurement changed, conflicts, or violates its contract. Reload before retrying.',
    )
  }
  if (sqlCode === '42501') throw new ForbiddenException('Monitoring scope is unavailable.')
  if (code === 'P2028' || ['57014', '42P01', '42703', '42883', '22023'].includes(String(sqlCode))) {
    throw new ServiceUnavailableException(
      'Monitoring verification is unavailable or exceeded its query limit.',
    )
  }
  throw error
}

/** Same key with the same definition replays; the same key with another definition conflicts. */
export function sameLibraryDefinition(row: IndicatorLibraryEntry, input: CreateIndicatorLibraryEntryRequest) {
  return (
    row.code === input.code &&
    row.name === input.name &&
    row.description === (input.description ?? null) &&
    row.unitLabel === input.unitLabel &&
    row.dataSource === input.dataSource &&
    row.measurementMode === input.mode &&
    row.numericKind === input.numericKind &&
    row.direction === input.direction &&
    row.displayPrecision === input.displayPrecision &&
    row.recipe === (input.recipe ?? null)
  )
}
```

Create `.tmp/s3/remove-declarations.mjs`:

```js
// Removes named top-level declarations, with their leading comments, from one module and keeps everything else verbatim.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, ...names] = process.argv.slice(2)
const lines = readFileSync(file, 'utf8').split('\n')
const declaration = /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const leading = /^(?:\/\/|\/\*\*| \*|@)/

// Each top-level declaration owns its leading comment and decorator lines and every line up to the next one.
const owners = new Array(lines.length).fill(null)
let current = null
let pending = []
for (let index = 0; index < lines.length; index++) {
  const line = lines[index]
  const name = declaration.exec(line)?.[1]
  if (name) {
    current = name
    for (const at of pending) owners[at] = name
    pending = []
    owners[index] = name
  } else if (leading.test(line)) pending.push(index)
  else {
    for (const at of pending) owners[at] = current
    pending = []
    owners[index] = current
  }
}
const missing = names.filter((name) => !owners.includes(name))
if (missing.length) throw new Error(`Not declared in ${file}: ${missing.join(', ')}`)
const kept = lines.filter((_, index) => !names.includes(owners[index]))
writeFileSync(file, kept.join('\n'))
console.log(`${file}: removed ${lines.length - kept.length} lines`)
```

- [ ] **Step 3: Move the declarations and check the bodies**

```bash
D=apps/api/src/modules/indicators
B=.tmp/s3/before
for f in indicators.dto.ts indicators.service.ts indicator-library.service.ts indicators.controller.ts; do git show HEAD:$D/$f > $B/$f; done
sed '/^export {$/,/^}$/d' $B/indicators.dto.ts > $B/indicators.dto.body.ts
cp .tmp/s3/files/indicators.mapper.ts .tmp/s3/files/indicators.helpers.ts $D/
node .tmp/s3/remove-declarations.mjs $D/indicators.service.ts monitoringSqlError releasedNulls withProgress
node .tmp/s3/remove-declarations.mjs $D/indicator-library.service.ts toEntry sameDefinition
git rm -q $D/indicators.dto.ts
sed -i -e 's/\bwithProgress(/toIndicatorResponse(/g' -e 's/\bparseIndicatorInput\b/parseIndicatorRequest/g' $D/indicators.service.ts $D/indicators.controller.ts
sed -i -e 's/\btoEntry\b/toLibraryEntryResponse/g' -e 's/\bsameDefinition(/sameLibraryDefinition(/g' -e 's/\bparseIndicatorInput\b/parseIndicatorRequest/g' -e 's/tx: Prisma\.TransactionClient,/tx: Tx,/' $D/indicator-library.service.ts
node .tmp/s3/same-body.mjs $B/indicators.dto.body.ts $B/indicators.service.ts $B/indicator-library.service.ts $B/indicators.controller.ts -- $D/indicators.service.ts $D/indicator-library.service.ts $D/indicators.controller.ts $D/indicators.mapper.ts $D/indicators.helpers.ts toIndicatorResponse=withProgress toLibraryEntryResponse=toEntry sameLibraryDefinition=sameDefinition parseIndicatorRequest=parseIndicatorInput "tx: Tx,=tx: Prisma.TransactionClient,"
```

Expected: `removed 53 lines`, `removed 33 lines`, `same lines: 773` (exit 0). The dto's re-export block (`export { ... }`) is the only dto text not carried over; the check excludes it on purpose. Any other output: stop.

- [ ] **Step 4: Repoint the imports and reword the parser comment**

```bash
D=apps/api/src/modules/indicators
I="node .tmp/s3/imports.mjs"
$I move $D/indicators.service.ts ./indicators.dto @pathways/shared createIndicatorRequest recordIndicatorMeasurementRequest updateIndicatorRequest
$I move $D/indicators.service.ts ./indicators.dto ./indicators.helpers parseIndicatorRequest
$I add $D/indicators.service.ts ./indicators.helpers monitoringSqlError
$I add $D/indicators.service.ts ./indicators.mapper releasedNulls toIndicatorResponse
$I prune $D/indicators.service.ts
$I move $D/indicator-library.service.ts ./indicators.dto @pathways/shared createIndicatorFromLibraryRequest createIndicatorLibraryEntryRequest
$I move $D/indicator-library.service.ts ./indicators.dto ./indicators.helpers parseIndicatorRequest
$I move $D/indicator-library.service.ts ./indicators.service ./indicators.helpers monitoringSqlError
$I add $D/indicator-library.service.ts ./indicators.helpers sameLibraryDefinition
$I add $D/indicator-library.service.ts ./indicators.mapper toLibraryEntryResponse
$I add $D/indicator-library.service.ts ../../common/prisma/transaction type:Tx
$I prune $D/indicator-library.service.ts
$I move $D/indicators.controller.ts ./indicators.dto @pathways/shared archiveIndicatorRequest
$I move $D/indicators.controller.ts ./indicators.dto ./indicators.helpers parseIndicatorRequest
for f in dashboards analytics; do $I move apps/api/src/modules/dashboards/$f.service.ts ../indicators/indicators.service ../indicators/indicators.helpers monitoringSqlError; done
node -e "const fs=require('fs');const f='$D/indicators.helpers.ts';const a='/** Explicit parsing is intentional: type-only DTO imports do not provide runtime validation. */';const t=fs.readFileSync(f,'utf8');if(!t.includes(a))throw new Error('comment');fs.writeFileSync(f,t.replace(a,'/** Service-side parse, so seeds and the library copy path are validated like the routes. */'))"
git grep -n "indicators\.dto\|parseIndicatorInput\|withProgress\|sameDefinition\|toEntry\b" -- apps
```

Expected: the two prune lines print `pruned ForbiddenException, indicatorProgress, indicatorResponse, missingMetric` and `pruned CreateIndicatorLibraryEntryRequest, IndicatorLibraryEntryResponse, MetricRecipe, IndicatorLibraryEntry, Prisma`; the final grep prints nothing.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/indicators src/modules/dashboards src/modules/rules src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
wc -l apps/api/src/modules/indicators/indicators.service.ts
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move the indicator mapper and helpers out of the services

indicators.dto.ts is deleted; parseIndicatorRequest, monitoringSqlError and sameLibraryDefinition live in indicators.helpers.ts and the row mappers in indicators.mapper.ts, verbatim.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the helpers test and the Task 1 test pass; typecheck and lint pass; api = `B_api + 14`; `indicators.service.ts` is 522 lines.

---

### Task 5: Split the measurement service

**Files:**
- Create: `apps/api/src/modules/indicators/indicator-measurements.service.ts`
- Modify: `apps/api/src/modules/indicators/indicators.service.ts`, `indicators.helpers.ts`, `indicators.module.ts`, `indicators.controller.ts`
- Modify (seeds, call target only): `apps/api/prisma/local-demo-seed.ts`, `defense-demo-seed.ts`, `hosted-realistic-seed.ts`, `local-demo-stage-people.ts`, `defense-demo-stage-monitoring.ts`
- Modify (tests, call target only): `apps/api/src/modules/rules/rules-source-domains.test.ts`, `apps/api/src/modules/indicators/indicators.service.test.ts`, `apps/api/src/modules/indicators/indicators.validation.test.ts`
- Test: `apps/api/src/modules/indicators/indicators.helpers.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers and mapper.
- Produces: `class IndicatorMeasurementsService` with `constructor(prisma: PrismaService, indicators: IndicatorsService)` and `measure(identity: ApplicationIdentity, projectId: string, indicatorId: string, value: unknown)` (same result as before); `IndicatorsService.readOne(tx: Tx, actor: ApplicationIdentity, projectId: string, indicatorId: string): Promise<IndicatorResponse>` (now public); `indicatorIdOrNotFound(input: string): string` from `indicators.helpers.ts`; `IndicatorsController` constructor `(service, library, measurements)`; `DemoContext.services.indicatorMeasurements`.

- [ ] **Step 1: Write the failing id check test**

Append to `apps/api/src/modules/indicators/indicators.helpers.test.ts`:

```ts

describe('indicatorIdOrNotFound', () => {
  it('lowercases an uppercase indicator id', () => {
    expect(indicatorIdOrNotFound('77000000-0000-4000-8000-00000000000A')).toBe(
      '77000000-0000-4000-8000-00000000000a',
    )
  })

  it('answers 404 for a path segment that is not a UUID', () => {
    expect(() => indicatorIdOrNotFound('not-a-uuid')).toThrow(
      new NotFoundException('Indicator unavailable.'),
    )
  })
})
```

```bash
D=apps/api/src/modules/indicators
I="node .tmp/s3/imports.mjs"
$I add $D/indicators.helpers.test.ts @nestjs/common NotFoundException
$I add $D/indicators.helpers.test.ts ./indicators.helpers indicatorIdOrNotFound
pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.helpers.test.ts
```

Expected: FAIL, 2 tests, `indicatorIdOrNotFound is not a function`.

- [ ] **Step 2: Create the split and wiring scripts**

Create `.tmp/s3/split-measurements.mjs`:

```js
// Moves IndicatorsService.measure verbatim into IndicatorMeasurementsService and shares readOne and the id check.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/api/src/modules/indicators'
const source = `${dir}/indicators.service.ts`
const lines = readFileSync(source, 'utf8').replace(/\n+$/, '').split('\n')
const headerEnd = lines.findIndex((line) => /^(?:type |const |function |export |@|\/\/|\/\*\*)/.test(line))
const start = lines.indexOf('  async measure(')
const end = lines.length - 1
if (start < 0 || lines[end] !== '}' || lines[end - 1] !== '  }')
  throw new Error('measure is not the last method of IndicatorsService')
const idStart = lines.indexOf('  private indicatorId(input: string) {')
if (idStart < 0 || lines[idStart + 3] !== '  }' || lines[idStart + 4] !== '')
  throw new Error('the private indicatorId method changed')
if (!lines.includes('  private async readOne(')) throw new Error('readOne changed')

const shared = (line) =>
  line
    .replaceAll('this.indicatorId(', 'indicatorIdOrNotFound(')
    .replaceAll('this.readOne(', 'this.indicators.readOne(')
const measure = lines.slice(start, end).map(shared)
const kept = [...lines.slice(0, idStart), ...lines.slice(idStart + 5, start), '}']
while (kept.at(-2) === '') kept.splice(-2, 1)
const service = kept.map((line) =>
  line === '  private async readOne('
    ? "  /** Reads one indicator inside the caller's authorized transaction. */\n  async readOne("
    : line.replaceAll('this.indicatorId(', 'indicatorIdOrNotFound('),
)
writeFileSync(source, `${service.join('\n')}\n`)

// The new service starts from the full import block; prune-imports removes what it does not use.
const header = lines.slice(0, headerEnd).join('\n').replace(/\n+$/, '')
const body = [
  '',
  '// Records and corrects manual measurements for the indicator module.',
  '@Injectable()',
  'export class IndicatorMeasurementsService {',
  '  constructor(',
  '    @Inject(PrismaService) private readonly prisma: PrismaService,',
  '    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,',
  '  ) {}',
  '',
  ...measure,
  '}',
  '',
]
writeFileSync(`${dir}/indicator-measurements.service.ts`, `${header}\n${body.join('\n')}`)
console.log(`moved ${measure.length} lines; indicators.service.ts keeps ${service.length} lines`)
```

Create `.tmp/s3/wire-measurements.mjs`:

```js
// Wires IndicatorMeasurementsService into the module, the controller, the seeds and the tests that record measurements.
import { readFileSync, writeFileSync } from 'node:fs'

// Applies exact replacements and fails when a target text is missing.
const edit = (file, pairs) => {
  let text = readFileSync(file, 'utf8')
  for (const [from, to, all] of pairs) {
    if (!text.includes(from)) throw new Error(`${file}: missing ${JSON.stringify(from)}`)
    text = all ? text.replaceAll(from, to) : text.replace(from, to)
  }
  writeFileSync(file, text)
  console.log(`${file}: ${pairs.length} edits`)
}
const D = 'apps/api/src/modules/indicators'
const seedImport = (anchor) => [
  anchor,
  `import { IndicatorMeasurementsService } from '../src/modules/indicators/indicator-measurements.service'\n${anchor}`,
]
const indicatorsImport = "import { IndicatorsService } from '../src/modules/indicators/indicators.service'\n"

edit(`${D}/indicators.module.ts`, [
  [
    "import { IndicatorLibraryService } from './indicator-library.service'\n",
    "import { IndicatorLibraryService } from './indicator-library.service'\nimport { IndicatorMeasurementsService } from './indicator-measurements.service'\n",
  ],
  [
    'providers: [IndicatorsService, IndicatorLibraryService],',
    'providers: [IndicatorsService, IndicatorMeasurementsService, IndicatorLibraryService],',
  ],
])
edit(`${D}/indicators.controller.ts`, [
  [
    "import { IndicatorLibraryService } from './indicator-library.service'\n",
    "import { IndicatorLibraryService } from './indicator-library.service'\nimport { IndicatorMeasurementsService } from './indicator-measurements.service'\n",
  ],
  [
    '    @Inject(IndicatorLibraryService) private readonly library: IndicatorLibraryService,\n',
    '    @Inject(IndicatorLibraryService) private readonly library: IndicatorLibraryService,\n    @Inject(IndicatorMeasurementsService)\n    private readonly measurements: IndicatorMeasurementsService,\n',
  ],
  [
    'return this.service.measure(identity(request), projectId, indicatorId, body)',
    'return this.measurements.measure(identity(request), projectId, indicatorId, body)',
  ],
])
edit('apps/api/prisma/local-demo-seed.ts', [
  seedImport(indicatorsImport),
  [
    '    indicators: IndicatorsService\n',
    '    indicators: IndicatorsService\n    indicatorMeasurements: IndicatorMeasurementsService\n',
  ],
  [
    '    indicators,\n    library: new IndicatorLibraryService(runtime, indicators),',
    '    indicators,\n    indicatorMeasurements: new IndicatorMeasurementsService(runtime, indicators),\n    library: new IndicatorLibraryService(runtime, indicators),',
  ],
])
edit('apps/api/prisma/defense-demo-seed.ts', [
  seedImport(indicatorsImport),
  [
    '        indicators,\n        library: new IndicatorLibraryService(runtime, indicators),',
    '        indicators,\n        indicatorMeasurements: new IndicatorMeasurementsService(runtime, indicators),\n        library: new IndicatorLibraryService(runtime, indicators),',
  ],
])
edit('apps/api/prisma/hosted-realistic-seed.ts', [
  seedImport(indicatorsImport),
  [
    '  const indicatorsService = new IndicatorsService(runtime)\n',
    '  const indicatorsService = new IndicatorsService(runtime)\n  const indicatorMeasurementsService = new IndicatorMeasurementsService(runtime, indicatorsService)\n',
  ],
  ['indicatorsService.measure(', 'indicatorMeasurementsService.measure(', true],
])
for (const file of ['apps/api/prisma/local-demo-stage-people.ts', 'apps/api/prisma/defense-demo-stage-monitoring.ts'])
  edit(file, [['ctx.services.indicators.measure(', 'ctx.services.indicatorMeasurements.measure(', true]])
edit('apps/api/src/modules/rules/rules-source-domains.test.ts', [
  [
    "import { IndicatorsService } from '../indicators/indicators.service'\n",
    "import { IndicatorMeasurementsService } from '../indicators/indicator-measurements.service'\nimport { IndicatorsService } from '../indicators/indicators.service'\n",
  ],
  [
    'const indicators = new IndicatorsService({} as PrismaService)\n',
    'const indicators = new IndicatorsService({} as PrismaService)\nconst measurements = new IndicatorMeasurementsService({} as PrismaService, indicators)\n',
  ],
  ['await indicators.measure(', 'await measurements.measure(', true],
])
edit(`${D}/indicators.service.test.ts`, [
  [
    "import { IndicatorValuesController } from './indicator-values.controller'\n",
    "import { IndicatorMeasurementsService } from './indicator-measurements.service'\nimport { IndicatorValuesController } from './indicator-values.controller'\n",
  ],
  [
    '  const service = new IndicatorsService({} as PrismaService)\n',
    '  const service = new IndicatorsService({} as PrismaService)\n  const measurements = new IndicatorMeasurementsService({} as PrismaService, service)\n',
  ],
  ['service.measure(', 'measurements.measure(', true],
])
edit(`${D}/indicators.validation.test.ts`, [
  [
    "import { IndicatorLibraryService } from './indicator-library.service'\n",
    "import { IndicatorLibraryService } from './indicator-library.service'\nimport { IndicatorMeasurementsService } from './indicator-measurements.service'\n",
  ],
  [
    'const controller = new IndicatorsController(indicators, library)\n',
    'const measurements = new IndicatorMeasurementsService({} as PrismaService, indicators)\nconst controller = new IndicatorsController(indicators, library, measurements)\n',
  ],
  ['indicators.measure(', 'measurements.measure(', true],
])
```

- [ ] **Step 3: Split, add the id helper and repoint**

```bash
D=apps/api/src/modules/indicators
I="node .tmp/s3/imports.mjs"
node .tmp/s3/split-measurements.mjs
cat >> $D/indicators.helpers.ts <<'EOF'

// The lowercase indicator id, or 404 when the path segment is not a UUID.
export function indicatorIdOrNotFound(input: string) {
  if (!UUID_PATTERN.test(input)) throw new NotFoundException('Indicator unavailable.')
  return input.toLowerCase()
}
EOF
$I add $D/indicators.helpers.ts @nestjs/common NotFoundException
$I add $D/indicators.helpers.ts ../../common/authz/application-identity UUID_PATTERN
$I add $D/indicators.service.ts ./indicators.helpers indicatorIdOrNotFound
$I prune $D/indicators.service.ts
$I add $D/indicator-measurements.service.ts ./indicators.helpers indicatorIdOrNotFound
$I add $D/indicator-measurements.service.ts ./indicators.service IndicatorsService
$I prune $D/indicator-measurements.service.ts
node .tmp/s3/wire-measurements.mjs
git grep -nE "\.measure\(" -- apps | wc -l
git grep -n "this.indicatorId(\|private async readOne\|indicators\.measure(\|service\.measure(" -- apps
```

Expected: `moved 122 lines; indicators.service.ts keeps 395 lines`; the service prune prints `pruned createHash, RecordIndicatorMeasurementRequest, recordIndicatorMeasurementRequest, bootstrapRuleSourceProject, readRuleSourceAcknowledgement`; the measurement prune prints `pruned NotFoundException, readApiEnv, ArchiveIndicatorRequest, CreateIndicatorRequest, IndicatorResponse, P06_CONTRACT_VERSION, UpdateIndicatorRequest, createIndicatorRequest, updateIndicatorRequest, Prisma, UUID_PATTERN, Tx, releasedNulls, toIndicatorResponse`; `wire-measurements.mjs` prints ten files (2, 3, 3, 2, 3, 1, 1, 3, 3, 3 edits); `18`; the last grep prints nothing. A `missing` error from the wiring script means an earlier slice changed that anchor: stop and report it.

- [ ] **Step 4: Run the tests and commit**

```bash
D=apps/api/src/modules/indicators
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/indicators src/modules/rules src/modules/dashboards src/modules/projects src/modules/evaluations src/modules/reports src/app-module-wiring.test.ts prisma
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
wc -l $D/indicators.service.ts $D/indicator-measurements.service.ts $D/indicators.service.test.ts
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move indicator measurements into IndicatorMeasurementsService

measure moves verbatim and reads through IndicatorsService.readOne in the caller's transaction; seeds and tests change only the call target.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all listed suites pass, including the wiring test (one new class provider, registered once) and the Task 1 characterization test; typecheck covers the five seeds; api = `B_api + 16`; line counts `390`, `166`, `608`.

---

### Task 6: Use requestIdentity in the indicator controllers

**Files:**
- Modify: `apps/api/src/modules/indicators/indicators.controller.ts`, `apps/api/src/modules/indicators/indicator-library.controller.ts`, `apps/api/src/modules/indicators/indicator-values.controller.ts`
- Test: `apps/api/src/modules/indicators/indicators.validation.test.ts` (Task 1, unchanged)

**Interfaces:**
- Consumes: `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts` (S1).
- Produces: no new names; the two module-level `identity` helpers and the inline check are gone.

- [ ] **Step 1: Confirm the pins hold before the change**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.validation.test.ts src/common/authz/request-identity.test.ts`
Expected: PASS, 10 tests (8 from Task 1, 2 from S1). The `indicator request identity` cases are the characterization for this task (ruling 9).

- [ ] **Step 2: Create the codemod**

Create `.tmp/s3/use-request-identity.mjs`:

```js
// Replaces the indicator controllers' own application profile checks with the shared requestIdentity helper.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/api/src/modules/indicators'
const helper =
  /function identity\(request: AuthenticatedRequest\) \{\n {2}if \(!request\.user\) throw new ForbiddenException\('Application profile is required\.'\)\n {2}return request\.user\n\}\n\n?/
const identityImport =
  "import type { AuthenticatedRequest } from '../../common/authz/application-identity'\n"
const sharedImport = `${identityImport}import { requestIdentity } from '../../common/authz/request-identity'\n`

// Applies regex or exact replacements and fails when a target is missing.
const edit = (file, pairs) => {
  let text = readFileSync(file, 'utf8')
  for (const [from, to] of pairs) {
    const found = typeof from === 'string' ? text.includes(from) : from.test(text)
    if (!found) throw new Error(`${file}: missing ${from}`)
    text = text.replace(from, to)
  }
  writeFileSync(file, text)
  console.log(`${file}: ${(text.match(/requestIdentity\(request\)/g) ?? []).length} calls`)
}

for (const name of ['indicators.controller.ts', 'indicator-library.controller.ts'])
  edit(`${dir}/${name}`, [
    [helper, ''],
    [/\bidentity\(request\)/g, 'requestIdentity(request)'],
    ['  ForbiddenException,\n', ''],
    [identityImport, sharedImport],
  ])
edit(`${dir}/indicator-values.controller.ts`, [
  [
    "    if (!request.user) throw new ForbiddenException('Application profile is required.')\n    return this.service.listReleased(request.user, projectId)",
    '    return this.service.listReleased(requestIdentity(request), projectId)',
  ],
  ['Controller, ForbiddenException, Get,', 'Controller, Get,'],
  [identityImport, sharedImport],
])
```

- [ ] **Step 3: Run it and check**

```bash
node .tmp/s3/use-request-identity.mjs
pnpm exec biome check --write apps/api/src/modules/indicators/indicators.controller.ts apps/api/src/modules/indicators/indicator-library.controller.ts apps/api/src/modules/indicators/indicator-values.controller.ts
git grep -n "Application profile is required\|function identity\|ForbiddenException" -- apps/api/src/modules/indicators ':!*.test.ts' | grep -v indicators.helpers.ts
```

Expected: the script prints `indicators.controller.ts: 7 calls`, `indicator-library.controller.ts: 3 calls`, `indicator-values.controller.ts: 1 calls`; Biome collapses the two `@nestjs/common` imports onto one line each; the grep prints nothing (`indicators.helpers.ts` keeps its own `ForbiddenException` for the SQL scope error). A `missing` error means S1 or S2 changed one of these controllers: stop and report it.

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/modules/indicators src/common src/app-module-wiring.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git grep -lE "Application profile is required\.'" -- 'apps/api/src/**/*.controller.ts' | wc -l
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/indicators
git commit -m "refactor(api): use requestIdentity in the indicator controllers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including the Task 1 identity cases and the import boundary test; api = `B_api + 16`; the controller count is 3 lower than on dev (18 on dev, so 15 after the task).

---

### Task 7: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (rule-engine globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md` (rule-engine row)
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.4, 3.6, 3.7 row S3, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04 and MOD-11 rows)
- Modify: `docs/qad-pathways.md` (QAD-A35 row)
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route the indicator contracts to the determinism checker (ruling 15)**

In `scripts/sad/check.test.ts`, directly before the test `routes shared rbac policy changes to the organization isolation checker`, add:

```ts
  it('routes indicator contracts to the determinism checker and the privacy guardian', () => {
    const file = 'packages/shared/src/contracts/indicators/indicator-requests.ts'
    const routed = routing([change(file, 'new', 'old')])
    expect(routed['rule-engine-determinism-checker']).toEqual([file])
    expect(routed['beneficiary-privacy-guardian']).toEqual([file])
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test (no determinism route).

In `scripts/sad/check.ts`, `rule-engine-determinism-checker` globs, add directly after `'packages/shared/src/rules/**',`:

```ts
      'packages/shared/src/contracts/indicators/**/*.ts',
```

In `docs/sad-pathways.md`, in the `rule-engine-determinism-checker` row, replace `` `packages/shared/src/rules/**`, `apps/api/src/modules/indicators/**/*.ts` `` with `` `packages/shared/src/rules/**`, `packages/shared/src/contracts/indicators/**/*.ts`, `apps/api/src/modules/indicators/**/*.ts` `` (one occurrence, inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.4, append to the paragraph:

```text
`monitoring/metric-fields.ts` holds the field schemas the metric and indicator contracts share and is the one module kept out of the barrel, because its names are generic (amended for S3a).
```

Section 3.6, after the bullet starting `- Response schemas are types only`, add:

```markdown
- A domain whose services are also called by seeds or by other services keeps parsing its request in the service with the shared contract and its existing 400 body, and its controller passes the body through; indicators do this (amended for S3a).
- A response schema that was already parsed at runtime before the modularization stays parsed, because dropping the parse changes a status code or what the web accepts; the indicator response and list schemas are parsed by the api mapper and the web client (amended for S3a).
```

Section 3.7, replace the row `| S3 | Indicators, indicator library | Used by activities, rules and dashboards |` with:

```markdown
| S3a, S3b | Indicators, indicator library (S3a: shared contracts and API; S3b: web client and screens) | Used by activities, rules and dashboards |
```

Section 9, append (with today's date and the Task 1 to Task 6 counts):

```markdown
S3a applied <date> on refactor/s3a-indicators-api:
- Contracts: the indicator request and response schemas moved verbatim from `packages/shared/src/monitoring/metric-contract.ts` to `packages/shared/src/contracts/indicators/indicator-requests.ts` and `indicator-responses.ts`; the metric cell, contract version and recipes moved to `monitoring/metric-cell.ts` and the shared field schemas to `monitoring/metric-fields.ts`, so the dashboard contract and the indicator contracts do not import each other; `metric-contract.ts` keeps the dashboard and SADDD contracts.
- Names: `createIndicatorRequest`, `createIndicatorDraftRequest`, `updateIndicatorRequest`, `archiveIndicatorRequest`, `recordIndicatorMeasurementRequest`, `createIndicatorLibraryEntryRequest`, `createIndicatorFromLibraryRequest`, `indicatorLibraryEntryResponse`, `indicatorResponse` and `indicatorListResponse`, each with its inferred type; the identical `MonitoringIndicator` and `ProjectIndicator` became `IndicatorResponse` and the two identical list schemas `indicatorListResponse`; audit entity strings did not change.
- API: `indicators.dto.ts` deleted; `indicators.helpers.ts` (`parseIndicatorRequest`, `monitoringSqlError`, `sameLibraryDefinition`, `indicatorIdOrNotFound`) and `indicators.mapper.ts` (`releasedNulls`, `toIndicatorResponse`, `toLibraryEntryResponse`); `IndicatorMeasurementsService` holds `measure`; `IndicatorsService` went from 574 to 390 lines; five seed files and three tests changed only their measurement call target; the three indicator controllers use `requestIdentity`.
- Tests: a characterization test pinned the indicator 400 body for every write route and the library copy path, the 403 on all eleven indicator controller routes and the archive parse-before-identity order before anything moved.
- SAD: rule-engine determinism routing covers `packages/shared/src/contracts/indicators/**/*.ts`.
- Decisions: S3 split into S3a and S3b (ruling 1); the metric cell and field schemas got their own modules to avoid an import cycle (ruling 2); indicator requests stay validated in the service, not by `ZodPipe`, because seeds and the library copy path call the services and the indicator 400 body differs from the pipe's (ruling 6); the indicator contracts keep their own zod field rules rather than the S1 class-validator ports (ruling 7); the indicator response schemas stay parsed at runtime (ruling 8); measurements split from reads and definition writes, with `measure` keeping its own authorized operation as before (ruling 11).

Deferred to S3b: `lib/api/indicators.ts`, `features/projects/indicators/`, the workspace split, `indicators.reads.ts` and the web aliases `ProjectIndicator`, `CreateIndicatorInput` and `UpdateIndicatorInput`. Left to later sub-projects: the dashboard and SADDD contracts in `metric-contract.ts` (S7).
```

- [ ] **Step 3: Update the audit, QAD and index**

- Audit: in the MOD-11 disposition cell replace the final period with `; indicator contracts moved to contracts/indicators by S3a.` and in the MOD-04 disposition cell replace the final period with `; indicators service split by S3a.`
- `docs/qad-pathways.md`, on the line starting `| QAD-A35 |`, replace the final cell `` `apps/api/src/modules/indicators/indicators.service.test.ts` `` with `` `apps/api/src/modules/indicators/indicators.service.test.ts`; `apps/api/src/modules/indicators/indicators.validation.test.ts` ``:

```bash
sed -i '/^| QAD-A35 |/s#`apps/api/src/modules/indicators/indicators.service.test.ts` |$#`apps/api/src/modules/indicators/indicators.service.test.ts`; `apps/api/src/modules/indicators/indicators.validation.test.ts` |#' docs/qad-pathways.md
grep -n "^| QAD-A35 |" docs/qad-pathways.md
git grep -nE "indicators\.dto|parseIndicatorInput|createIndicatorSchema|manualMeasurementSchema|libraryEntrySchema|monitoringIndicatorSchema" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the QAD-A35 row ends with both test paths; the last grep prints nothing.

- `docs/index.md`: in the CR row status, add `S3a` to the applied list and name as next the first sub-project in roadmap order that is not applied (for example `Approved; F1 to F4b, S1, S2 and S3a applied, S3b next`).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S3a indicators api (refactor/s3a-indicators-api)
```

with one bullet per Task 1 to Task 6 stating what moved, was renamed or was split, with its commit hash and the shared and api test counts at the end of that task; a bullet saying the S3a decisions are recorded in the change record section 9 (the plan stays until S3b is planned, because it holds the S3b outline); and a bullet listing the S3b deferrals. Task 8 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S3a and route indicator contracts to the determinism checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/indicators/indicator-requests.js && test -f packages/shared/dist/contracts/indicators/indicator-responses.js && test -f packages/shared/dist/monitoring/metric-cell.js && test -f packages/shared/dist/monitoring/metric-fields.js && test -f apps/api/dist/apps/api/src/modules/indicators/indicator-measurements.service.js && test -f apps/api/dist/apps/api/src/modules/indicators/indicators.helpers.js && test -f apps/api/dist/apps/api/src/modules/indicators/indicators.mapper.js && test ! -e apps/api/dist/apps/api/src/modules/indicators/indicators.dto.js && echo "dist layout ok"
```

Expected: all pass and `dist layout ok`. Versus Task 0: api = `B_api + 16` (characterization 8, helpers 8), sad = `B_sad + 1`, config, shared, imports and web unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs the local runtime tests, including `reports-runtime.local.test.ts`, which constructs `IndicatorsService`).

- [ ] **Step 3: Seeds, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:defense:local
pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm db:defense:local` runs `defense-demo-stage-monitoring.ts` (library entries, from-library copies, measurements); `pnpm db:local:demo` runs `local-demo-stage-people.ts` (create and measure); `pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: both seeds finish without error (Review Focus 5); `"status":"ok"`; a module-resolution error or a Nest `can't resolve dependencies` error naming `IndicatorMeasurementsService` in the `pnpm dev:local` output fails the gate; auth-navigation all pass; the main suite shows the same pass, fail and not-run split and the same failing tests as the latest S2a or S2b gate run recorded in `docs/activity-log.md`. Browser smoke, each step as a demo user whose role allows it (Monitoring and Evaluation Officer or Project Manager for indicator writes, Program Manager for released values): open an assigned project's Target Indicators tab and confirm the list, codes, values and progress match dev; add a manual indicator; edit its label; record a measurement, then correct it with a reason; archive an indicator; open `/indicators/library`, add a library entry and archive it; open the monitoring dashboard and analytics KPI rows as Program Manager (`indicator-values` through `readReleasedInTransaction`); open the reports indicator summary and an evaluation that lists indicators (`readInTransaction`). Every step must behave as on dev; any 400 must show `Invalid indicator request.` exactly as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s3a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian` (scripts/sad changed), `organization-isolation-checker` (`*.service.ts`), `beneficiary-privacy-guardian` (controllers, contracts, `lib/services`, and `indicators.mapper.ts` through the S1 mapper glob) and `rule-engine-determinism-checker` (`monitoring`, `contracts/indicators`, `modules/indicators`)) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s3a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s3a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, replay exit code, both seed runs, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S3a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s3a-indicators-api -m "Merge refactor/s3a-indicators-api into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S3b**

The plan holds the S3b outline, so it stays on dev (as the F4 plan did for F4b). In `docs/index.md` section 1.6 change the S3 plan row status to `S3a executed; holds the S3b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S3a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S3b outline (indicator web client and screens, branch `refactor/s3b-indicators-web`)

To be written as its own plan from dev after S3a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `a101ad7c` and must be recounted in S3b Task 0, because F4b, S1, S2 and S3a change several of these files.

### Interfaces assumed from earlier slices

- F4b: `PathwaysClientError`, `requestFoundation(path, init?, isCurrent?)`, `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts` (`readContextCookie` is private there); `captureRequestOwner(signal?: AbortSignal | null)` from `apps/web/src/lib/api/core/request-owner.ts` (not needed by indicators); `useAuthorizedRead`, `authorizedReadPolicy`, `SUMMARY_READ_STALE_MS` from `apps/web/src/hooks/use-authorized-read.ts`; `formatCappedPercent` from `apps/web/src/lib/format/percent.ts`; `stickyTableHeadClass` from `apps/web/src/components/pathways/sticky-table-head.ts` (the indicators workspace and library manager are two of its four users).
- S1b Task 1 (the single owner of this move): `requestSourceMutation<T>(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, context: SourceMutationContext | undefined, parse: (value: unknown) => T): Promise<SourceMutationResult<T>>` exported from `apps/web/src/lib/api/core/source-mutation-request.ts`. At `a101ad7c` it is a private function in `pathways-client.ts` used by projects, activities and indicators. If S3b Task 0 finds it still private, S3b Task 1 moves it there first, verbatim, in its own commit.
- S1: `option-select` and `source-mutation-recovery` under `features/projects/components/`, `projectReadResources` and `useProjectRead` in `projects.reads.ts` (was `use-project-reads.ts`); the move script resolves specifiers by path, so any location works.
- S3a: the contract names of ruling 4.

### Tasks

- **Task 0, baseline:** recount every number below; record web Middleware; confirm `requestSourceMutation`'s location.
- **Task 1, `lib/api/indicators.ts`:** move the eight indicator methods (`getProjectIndicators`, `getProjectIndicatorValues`, `createProjectIndicator`, `createProjectIndicatorFromLibrary`, `updateProjectIndicator`, `recordIndicatorMeasurement`, `archiveProjectIndicator`, `getIndicators`) out of the `PathwaysClient` interface and class into an `indicatorClient` object, and merge `lib/services/indicator-library-client.ts` (26 lines) in as `indicatorLibraryClient`. Inputs use the contract types (`Omit<CreateIndicatorRequest, 'clientMutationId'>` and so on), removing the local `CreateIndicatorInput`, `UpdateIndicatorInput` and `UseLibraryEntryDraft` aliases. `recordIndicatorMeasurement` keeps its own ticket call through `sourceMutationTickets` from `lib/services/source-mutation.ts`; the `indicators` branch of `recoverSourceMutation` stays with that function (S1 or S2 owner). Repoint 18 production call sites in 8 files (`analytics-dashboard.tsx` 2, `rule-editor.tsx` 1, `collection-workspace.tsx` 1, `role-dashboard.tsx` 1, `project-indicators-workspace.tsx` 9, `projects.reads.ts` 1, `reporting-workspace.tsx` 1, `rule-condition-rows.tsx` 1). Mock risk: 9 test files stub indicator methods inside a `@/lib/services/pathways-client` factory (`analytics-dashboard`, `rule-editor`, `collection-workspace`, `collection-workspace.extend-projects`, `project-activities-rbac`, `project-activities-workspace` (both in `features/projects/activities/components/` after S2b), `project-indicators-workspace.reload`, `reporting-page`, `reporting-workspace`), and `indicator-library-manager.test.tsx` mocks `@/lib/services/indicator-library-client`; each stub moves to a `vi.mock('@/lib/api/indicators', ...)` in the same commit, counted before and after, because a stub left behind silently stops applying and the real client runs. The three indicator cases of `pathways-client.monitoring.test.ts` move to `lib/api/indicators.test.ts`. SAD: `apps/web/src/lib/api/**` already routes to the privacy guardian (F4b).
- **Task 2, feature folder:** `git mv` the seven indicator files (`project-indicators-workspace.tsx` with its two tests, `indicator-library-manager.tsx` with its test, `use-from-library.tsx`, `indicator-recipes.ts`) into `features/projects/indicators/` (CR 3.3 example), add no `indicators/index.ts`: `features/projects/index.ts` lists `ProjectIndicatorsWorkspace` and `IndicatorLibraryManager` by their `./indicators/components/*` leaf paths (a sub-index re-export grows `/dashboard` by 23 kB, measured in S2b), and point the two app pages at `@/features/projects` (a deep import of `features/projects/indicators` fails the S1b surface rule); Two test mocks of `./source-mutation-recovery` follow the move. `features/analytics/indicator-trend-chart.tsx` stays with analytics (S7); the workspace's import of `@/features/analytics/use-monitoring-read` stays until S7 gives analytics an index (MOD-15).
- **Task 3, workspace split (MOD-06):** `project-indicators-workspace.tsx` (951 lines) splits verbatim by declaration into `components/indicator-form.tsx` (`IndicatorForm`, `NewIndicator`, about 230 lines), `components/indicator-editor.tsx` (`IndicatorEditor`, about 175), `components/project-indicators-workspace.tsx` (about 370), `indicators.utils.ts` (`generateIndicatorCode`, `suggestIndicatorCode`, `indicatorInputFromForm`, `indicatorPeriod` and their private helpers) and `indicators.copy.ts` (`recipeNames` from `indicator-recipes.ts`, `typeOptions`, `enabledRecipeOptions`, `recipeContract`, `recipeTypes`, `recipeTargets`). `indicator-library-manager.tsx` (399) moves `EntryForm` and `NewEntry` to `components/library-entry-form.tsx`. The `type CreateIndicatorDraftRequest as CreateIndicatorInput` alias becomes the contract name. `project-indicators-workspace.test.tsx` imports the four utilities from `indicators.utils.ts`.
- **Task 4, reads and web types (MOD-16):** `indicators.reads.ts` holds the one `indicator-library` resource key (today in `indicator-library-manager.tsx:231` and `project-indicators-workspace.tsx:613`, with different enabled flags and freshness, which stay call-site arguments), `useProjectIndicatorsRead` with its `project-indicators` key moved from `projects.reads.ts`, and the `indicator-binding-choices` read. Delete the web alias `ProjectIndicator` from `types/pathways.ts` and import `IndicatorResponse` from `@pathways/shared` in its seven importers (`analytics-dashboard.tsx`, `analytics-reporting-periods.ts`, `activity-detail-content.tsx`, `activity-detail-panel.tsx`, `activity-detail-sections.tsx`, `project-indicators-workspace.tsx`, `reporting-workspace.tsx`) and in `lib/api/indicators.ts`. The `Indicator` view model (`id`, `projectId`, `code`, `label`) stays in `types/pathways.ts`: no contract covers it (CR 3.6).
- **Task 5, records:** CR section 9 S3b disposition, audit MOD-05 (indicator client part), MOD-06 and MOD-16 (indicator read key), index, activity log; check whether `features/projects/indicators/**` needs SAD routing beyond design-qa-agent.
- **Task 6, gates and merge:** as S3a Task 8, with web Middleware compared to Task 0 and a smoke of the Target Indicators tab, the library page, the analytics and dashboard KPI rows, the rules board indicator pickers, the collection indicator list and the reports indicator summary. After merge, remove this plan and its index row.
