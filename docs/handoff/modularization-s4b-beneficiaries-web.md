# S4b Beneficiaries Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the beneficiary, journey and media web code their own client modules and feature folder, add the response contracts the api mappers are checked against, and merge `features/journey-config` into `features/beneficiaries`, with no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S4b is the first web half of S4 (S4a, the request contracts and the api split, is applied below it). The 19 beneficiary, journey and media methods of `pathways-client.ts` become `beneficiariesClient`, `journeysClient` and `beneficiaryMediaClient` in `lib/api`, generated from the methods as they stand and proven line by line; callers and test mocks follow by script with exact counts, after characterization tests that run against the old and the new code. Response contracts for the routes are added to `packages/shared` as types only (CR 3.6) and the api mappers and services are annotated with them, so a drift fails `pnpm typecheck`. The 33 files of `features/beneficiaries` and `features/journey-config` move into `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` behind one public `index.ts`. The four oversized components and their tests are not split here: that is S4c (outline at the end), because together they would take the plan past twelve tasks. Mechanical edits use one-off Node scripts under `.tmp/s4b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run in order on an exported copy of the S6a records commit `02b272f4` (S3b, S4a, S5a and S6a below it), and the whole sequence was then replayed from that baseline by one driver that executes the code blocks of this plan: the replayed tree is identical to the dry-run tree, and the counts quoted below come from that replay. The real base is the tip `bde243e2` of `claude/modularization-s6-9ept8o`, which adds S6a's last tests-only commit `5bd2ae40` (8 api cases, so the api counts below are 2610 passed and 21 skipped). S5a and S6a changed no web file, so web counts, hashes and route tables equal the S4a head; only shared, api, sad and Biome counts moved.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.6 and 9 including the S3b and S4a dispositions and the "Deferred to S4b" paragraph of S4a) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05 for the beneficiary clients, MOD-15 for the `journey-config` pair, MOD-17 for the layout; MOD-06 and the `Scoped` name are left to S4c).

## Rulings

Controller rulings for S4b. Each was checked on an exported copy of the S6a records commit `02b272f4`; Task 0 recounts them. Rulings 1 and 11 of the S4 plan (the split, and response contracts waiting for S4b) are the origin of this plan.

1. **Split S4b and S4c.** The S4 outline had nine tasks for the web half, but the four component splits (`beneficiary-form.tsx` 1391 lines, `beneficiary-detail.tsx` 1173, `beneficiary-media-proof.tsx` 668, `beneficiary-directory.tsx` 565, plus two tests of 870 and 636 lines) each need a hook and section design and a line-by-line proof, which would take the plan past twelve tasks. S4b (this plan, Tasks 0 to 6) takes the contracts, the clients, the callers and mocks, the layout and the records; S4c (outline at the end) takes the splits and the `Scoped` rename. Both names replace `refactor/s4b-beneficiaries-web`; the branch is `claude/modularization-s4b-9ept8o`. Cost if wrong: executor fatigue in one long plan.
2. **Response contracts are types only and are never parsed.** `beneficiary-responses.ts`, `beneficiary-media-responses.ts` and `journey-responses.ts` hold zod schemas whose inferred types annotate the api mappers and services (`mapBeneficiary` and the list rows return `BeneficiaryResponse`, `mapStage` returns `JourneyStageResponse`, the history, event, correction, archive, enroll, duplicate, media list, limits and reservation results use `satisfies` or a declared return type), so a field added, removed or retyped on one side fails typecheck. Nothing parses a response with them: the web parsers stay hand-written (ruling 5) and no api behavior changes. The journey stage `type` carries the display label (`Entry`, `Core`, `Branch`, `Follow-Up`) because that is what `mapStage` sends; its label lookup gets `as const` so the annotation type-checks. Cost if wrong: a rename.
3. **The registration context is a plain type.** `RegistrationContextResponse` moves out of `registration-context.service.ts` into `beneficiary-responses.ts` as an interface, because its fields reuse `FormFieldValidationContract`, a TypeScript type of `validation/form-data` that has no schema, and the web parser (`parseRegistrationContext`) checks bounds, the business date and the definition rules that no schema here expresses. The outline's alternative, a zod schema, would copy those rules into shared. Cost if wrong: one schema to write.
4. **Two request constants are exported.** `beneficiarySexes` and `disabilityStatuses` become exported from `beneficiary-requests.ts` so the response schema reuses them instead of copying the lists; the `export *` in `packages/shared/src/index.ts` makes them public, and no other shared module uses either name (typecheck proves it). Cost if wrong: a duplicated list.
5. **Three clients, five modules, no behavior change.** `beneficiariesClient` (9 methods), `journeysClient` (5) and `beneficiaryMediaClient` (5) are object literals in `lib/api/beneficiaries.ts`, `journeys.ts` and `beneficiary-media.ts` with the same method names, parameters and results as the `PathwaysClient` methods they replace. The hand-written parsers go to `<domain>.schema.ts` as in S2b: `beneficiaries.schema.ts` holds `parseRegistrationContext` (moved from `lib/services/registration-context.ts`, which is deleted), `ageFromBirthDate` and `mapBeneficiary`, and `journeys.schema.ts` holds the stage and history parsers. The generator (`build-clients.mjs`) cuts the method blocks out of `pathways-client.ts` as they stand and swaps only type names (`ApiBeneficiary` to `BeneficiaryResponse`, `RegisterBeneficiaryInput` to `RegisterBeneficiaryRequest`, `ResolveDuplicateInput` to `ResolveDuplicateRequest`, `DuplicateCandidatePair` to its response name, two inline result types and the two media types to contract names); `same-lines.mjs` must print `lost 0, added 0` against the composed original. `getBeneficiaryAssessments` stays in `pathways-client.ts` for S6. Cost if wrong: review time.
6. **The media upload keeps `activitiesClient.uploadActivityProofFile`.** `beneficiary-media-proof.tsx` uploads the reserved file through the activities client (S2b's `PUT`), and no media-owned `PUT` is added, because that would be a second copy of the same request. `getBeneficiaryMediaLimits` imports `isFiniteNonNegative` from `@/lib/api/core/guards` as the old method did, and the beneficiary loaders keep calling `activitiesClient.getActivities` and `getActivityContext`. Cost if wrong: a duplicate upload helper.
7. **Characterization before removal: both clients run the same cases.** Task 2 writes `beneficiaries.test.ts` (7 cases), `journeys.test.ts` (4) and `beneficiary-media.test.ts` (4) as `describe.each` tables over `pathwaysClient` and the new client with `requestFoundation` replaced: 15 cases, 30 runs, passing against the code being replaced before it goes, and a mutation of the page size makes two of them fail. Task 3 drops the old rows (15 runs remain). The cases pin paths, encoded ids, abort signals, the 50 row page limit, the cursor loop and its repeated-cursor refusal, request bodies, the refusals before any request, and the strict registration context. The existing `registration-context.test.ts` moves with `git mv` to `beneficiaries.schema.test.ts`. Cost if wrong: none.
8. **The loaders stay as they are.** They call the clients in effects, none uses `useAuthorizedRead`, and moving them onto it would change caching, so there is no read key to deduplicate and no `beneficiaries.reads.ts`. Cost if wrong: none.
9. **Mocks are repointed by script, with exact counts.** 41 test files mock `@/lib/services/pathways-client`; 4 factories name a moved method inline and the others pass a shared object. `split-client-mocks.mjs` gives every such test a `vi.mock` of each new module it needs: 9 shared-object factories in 8 files get a second mock and 4 inline factories (`beneficiary-form-loader`, `survey-subject-picker`, `journey-config-workspace` and `project-activities-workspace.expenses` tests) are emptied, whose `pathwaysClient: {}` factory keeps the real client from loading. 13 new `vi.mock` lines in 12 files. Cost if wrong: a component under test sees `undefined` for a method; the scans (`factories 41, naming 0` after) and the suite catch it.
10. **Types.** `UpdateBeneficiaryInput`, `EnrollmentJourneyEventInput` and `CorrectJourneyEventInput` stay in `types/pathways.ts`: the request contracts accept `null` on the optional fields, which the web types never send, so they are not equal. `RegisterBeneficiaryInput` has no user after the move and is deleted, `JourneyStageConfig`, `BeneficiaryRecord` and `BeneficiaryFilters` stay as view models (CR 3.6), and `duplicate-resolution-workspace.tsx` takes `DuplicateCandidatePairResponse` and `DuplicateProfileResponse` from `@pathways/shared` in place of the two types the client file exported. Cost if wrong: a rename.
11. **Layout.** `features/beneficiaries/` holds six concern folders and `beneficiaries.utils.ts`: `directory/` (directory, its loader and the evaluation center lookup), `registration/` (form, its loader, `registration.utils.ts`), `profile/` (detail, its loader, `profile.utils.ts`), `media/` (media proof, `media.utils.ts`), `identity-review/` (duplicate resolution) and `journey/` (the eight `journey-config` files and the journey stages loader, `journey.utils.ts`). `beneficiary-utils.ts` is used from three folders, so it stays beside them as `beneficiaries.utils.ts`. `journey-config` is merged because only the detail view and the stages loader import it; no other feature imports either folder. There is no `hooks/` folder (no hook is extracted until S4c) and no sub-index: `index.ts` lists the six exports the seven route pages import by their leaf paths, as S2b measured (a sub-index grows routes). Cost if wrong: later slices repoint by path.
12. **Every production build starts from a clean `.next`** (S2b ruling 10) and route tables are compared with `compare-routes.mjs`: Task 4 Step 1 measures a baseline right before the layout move, because Tasks 2 and 3 already moved 28 routes (24 down by 5 to 12 kB because the beneficiary code left the shared client chunk, four up by 1 kB); the pass criterion is no route more than 1 kB bigger than that baseline and Middleware at `M0`, the value Task 0 measures (102 or 103 kB in the cloud container). Cost if wrong: a misleading `Module not found` after a move.
13. **No new SAD routing.** `apps/web/src/lib/api/**/*.ts`, `packages/shared/src/contracts/**/*.ts` and the api beneficiary, media and participants modules already route to `beneficiary-privacy-guardian`; `features/beneficiaries/**` needs `design-qa-agent` only. Cost if wrong: one glob in `scripts/sad/check.ts`.
14. **Not done in S4b (recorded in CR section 9):** the `ScopedBeneficiaryForm` split and rename, the `beneficiary-detail.tsx`, `beneficiary-media-proof.tsx` and `beneficiary-directory.tsx` splits and the two oversized tests (S4c); the `'5-9'` age band option of the directory stays as it is (MOD-B1, behavior); `getBeneficiaryAssessments` (S6).
15. **Cross-plan.** S5 (collection) mocks `getSurveySubjectPage` and `getJourneyStages` through `@/lib/api/beneficiaries` and `@/lib/api/journeys` after this plan, not through `pathways-client`; S6 mocks nothing of these; S8 reads no beneficiary client. Cost if wrong: a later Task 0 stops on a missing path or count.

## Interfaces assumed from earlier sub-projects

- S4a (from `@pathways/shared`): `RegisterBeneficiaryRequest`, `ResolveDuplicateRequest`, `registerBeneficiaryRequest`, `updateBeneficiaryRequest`, `recordJourneyEventRequest`, `correctJourneyEventRequest`, `saveJourneyStagesRequest`, `reserveBeneficiaryMediaRequest` (under `packages/shared/src/contracts/{beneficiaries,journeys}`); api `BeneficiaryRegistrationService`, `registration-context.service.ts` (`loadRegistrationContext`, which still declares the interface `RegistrationContext` Task 1 replaces), `beneficiaries.mapper.ts`, `journey-stages.mapper.ts`, `beneficiary-journey.service.ts`.
- S3b: `apps/web/src/lib/api/indicators.ts` as the model of a client file; `requestSourceMutation` is not used by these methods.
- S2b: `activitiesClient` in `lib/api/activities.ts` (`uploadActivityProofFile`, `getActivities`, `getActivityContext`); `isFiniteNonNegative` in `lib/api/core/guards.ts`; the `.schema.ts` convention; `features/projects/index.ts` and `experimental.optimizePackageImports: ['@/features/projects']`.
- S1b: `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`.
- F4b: `PathwaysClientError`, `requestFoundation`, `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts`; `captureRequestOwner`; `useAuthorizedRead`; `lib/format/*`.

## Produces (names later plans consume)

- From `@pathways/shared`: the schemas `beneficiaryProgressResponse`, `beneficiaryResponse`, `archiveBeneficiaryResponse`, `enrollBeneficiaryResponse`, `duplicateCandidatePairResponse`, `beneficiaryMediaItemResponse`, `beneficiaryMediaLimitsResponse`, `beneficiaryMediaReservationResponse`, `journeyStageResponse`, `beneficiaryJourneyResponse`, `recordJourneyEventResponse` and `correctJourneyEventResponse`, each with its inferred `...Response` type, plus the types `DuplicateProfileResponse`, `BeneficiaryMediaReservedFileResponse`, `BeneficiaryJourneyEventResponse` and `RegistrationContextResponse` (an interface) and the constants `beneficiarySexes` and `disabilityStatuses`.
- `beneficiariesClient` (`lib/api/beneficiaries.ts`): `getBeneficiaryRecordsForRole(role, projectId?, filters?)`, `getSurveySubjectPage(projectId, search?, cursor?, signal?)`, `getBeneficiaryRecordForRole(role, projectId, beneficiaryId)`, `registerBeneficiary(projectId, input)`, `updateBeneficiary(projectId, beneficiaryId, input)`, `getDuplicateCandidates(projectId)`, `resolveDuplicate(projectId, input)`, `getBeneficiaryRegistrationContext(projectId)`, `ensureDefaultRegistrationForm(projectId)`.
- `journeysClient` (`lib/api/journeys.ts`): `getJourneyStages(projectId, signal?)`, `saveJourneyStages(projectId, stages)`, `getBeneficiaryJourneyHistory(projectId, beneficiaryId)`, `transitionBeneficiaryJourney(projectId, beneficiaryId, input)`, `correctBeneficiaryJourneyEvent(projectId, beneficiaryId, eventId, input)`.
- `beneficiaryMediaClient` (`lib/api/beneficiary-media.ts`): `listBeneficiaryMedia`, `getBeneficiaryMediaLimits`, `reserveBeneficiaryMedia`, `finalizeBeneficiaryMedia`, `getBeneficiaryMediaBlob`, with the parameters the `PathwaysClient` methods had.
- `mapBeneficiary`, `parseRegistrationContext` (`beneficiaries.schema.ts`), `parseJourneyStages`, `parseJourneyHistory` (`journeys.schema.ts`).
- Feature: `features/beneficiaries/` as in ruling 11; `features/beneficiaries/index.ts` exports `BeneficiaryDirectoryLoader`, `EvaluationCenterLookup`, `BeneficiaryFormLoader`, `BeneficiaryDetailLoader`, `DuplicateResolutionWorkspace` and `JourneyStagesLoader`; `features/journey-config` no longer exists.
- No beneficiary, journey or media method on `pathwaysClient`; no `RegisterBeneficiaryInput` in `types/pathways.ts`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The only removals are the moved or aliased duplicates. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; every file outside `features/beneficiaries` imports it only through its index once Task 4 lands.
- File moves use `git mv` (the move script does it); the generated client modules are checked with `.tmp/s4b/same-lines.mjs` (`lost 0`) before Biome formats them.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s4b/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Run `.tmp/s4b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about three minutes, so give the command a ten minute timeout.
- Mock factories name modules by the specifier the code under test imports; after Task 3 a moved method is mocked on its `@/lib/api/*` module, never on `pathwaysClient`.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s4b/` (gitignored) and are never committed; build logs go there too. Use bash only.
- `packages/shared/dist` is built output: rebuild it with `pnpm --filter @pathways/shared build` after Task 1 so the web typecheck sees the new contracts.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>`, `<M0>` (the Middleware size) and `<n>` for values that differ per run; every other figure is the dry run on `02b272f4` (api counts with the 8 cases of `5bd2ae40`) and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared` and `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on `claude/modularization-s4b-9ept8o`, created by the controller from the tip `bde243e2` of `claude/modularization-s6-9ept8o` (S3b, S4a, S5a and S6a below it, including the S6a records commit `02b272f4`); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence; `apps/api` and `packages/shared` change only in Task 1.
- Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run when supabase or Docker is missing (Task 6).

## Review Focus

1. Every moved method must send the same request: path, encoded ids, abort signal, query string (the 50 row page limit, the cursor loop and the repeated-cursor refusal), body and method; and must refuse the same inputs before any request (no project scope, an invalid contributor search). Task 2 pins all of it on both the old and the new client.
2. A response of the wrong shape must still be refused with the same message (`Invalid beneficiary response.`, `Invalid journey-stage response.`, `Invalid registration context response.`), and a registration context with an unknown key must stay refused. The parsers moved verbatim (`lost 0`).
3. A test stub left on `pathwaysClient` would hand a component `undefined` at run time. Task 3 scans every factory (`factories 41, naming 0`) and runs the whole web suite.
4. A drift between an api mapper and its response contract must fail typecheck. Task 1 proves it on two mappers by renaming a field and restoring it.
5. A route bundle must not grow when files move, and `/beneficiaries` and its siblings must not load a barrel. Task 4 compares a freshly measured baseline and Task 6 compares against both baselines.
6. The loaders must not move onto `useAuthorizedRead` (ruling 8): no new read key, no changed caching.

## File map

| Path | Role after S4b |
|---|---|
| `packages/shared/src/contracts/beneficiaries/beneficiary-responses.ts`, `beneficiary-media-responses.ts`, `contracts/journeys/journey-responses.ts` and their tests | response contracts (new, Task 1) |
| `apps/api/src/modules/{beneficiaries,beneficiary-media,participants}/*` | return types and `satisfies` annotations only (Task 1) |
| `apps/web/src/lib/api/beneficiaries.ts`, `beneficiaries.schema.ts`, `journeys.ts`, `journeys.schema.ts`, `beneficiary-media.ts` | the clients and parsers (new, Task 2) |
| `apps/web/src/lib/api/{beneficiaries,journeys,beneficiary-media}.test.ts`, `beneficiaries.schema.test.ts` | request and parser tests (new, Tasks 2 and 3) |
| `apps/web/src/lib/services/pathways-client.ts` | loses 19 methods, 2 helpers, 3 parsers, 1 type block (1361 to 716 lines, Task 3) |
| `apps/web/src/lib/services/registration-context.ts` | deleted, its test moved (Task 3) |
| `apps/web/src/features/beneficiaries/` | six concern folders, `beneficiaries.utils.ts`, `index.ts` (Task 4) |
| `apps/web/src/features/journey-config/` | merged into `features/beneficiaries/journey` (Task 4) |
| `apps/web/src/app/(dashboard)/beneficiaries/**`, `projects/[projectId]/(workspace)/journey-stages/page.tsx` | import `@/features/beneficiaries` (Task 4) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts` | list `beneficiaries` as an indexed feature (Task 4) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s4b-beneficiaries-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s4b/base-sha`, `build-routes.sh`, `compare-routes.mjs`, `mock-scan.mjs`, `client-blocks.mjs`, `count-calls.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S3b, S4a, S5a and S6a**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
test -f apps/web/src/lib/api/indicators.ts && echo "S3b present"
test -f apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts && echo "S4a present"
test -f packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts && test -f packages/shared/src/contracts/journeys/journey-requests.ts && echo "S4a contracts present"
test -f apps/web/src/lib/api/activities.ts && test -f apps/web/src/lib/api/core/guards.ts && echo "S2b present"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/core/request-owner.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -d apps/web/src/lib/format && echo "F4b present"
test -f apps/web/src/features/projects/index.ts && echo "S1b present"
git branch --show-current
test -f apps/api/src/modules/metadata/form-definitions.service.ts && echo "S5a present"
test -f apps/api/src/modules/finance/expense-receipts.service.ts && echo "S6a present"
grep -c "S6a applied" docs/cr-pathways-codebase-modularization.md
grep -c "indexedFeatures" apps/web/src/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
mkdir -p .tmp/s4b/files
git rev-parse HEAD > .tmp/s4b/base-sha
```

Expected: `git status --short` prints nothing. Then the six marker lines, the branch name, two more marker lines, the `S6a applied` count and the two counts, and the plans listing:

```
S3b present
S4a present
S4a contracts present
S2b present
F4b present
S1b present
claude/modularization-s4b-9ept8o
S5a present
S6a present
1
3
1
2026-10-13-modularization-s3b-indicators-web.md
2026-10-13-modularization-s4-beneficiaries.md
2026-10-13-modularization-s5-collection.md
2026-10-13-modularization-s6-finance-reports.md
```

The listing also shows any other plan on the branch. A missing marker line means the branch lacks a stacked slice: stop and report NEEDS_CONTEXT. The branch must be cut after the S6a records commit: with an earlier base, the Task 5 index anchor and the SAD role counts of Task 6 Step 4 differ. Cut it after S6a's gate-results commit too, or the two appends to `docs/activity-log.md` collide (keep both sides).

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `.tmp/s4b/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s4b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s4b/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s4b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s4b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s4b/routes-$1.txt
grep Middleware .tmp/s4b/routes-$1.txt
```

`.tmp/s4b/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s4b/compare-routes.mjs`:

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

`.tmp/s4b/mock-scan.mjs` counts `vi.mock` factories for one web module and lists those whose factory text names a given export:

Create `.tmp/s4b/mock-scan.mjs`:

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

`.tmp/s4b/client-blocks.mjs` names the 19 methods, groups them by new client and finds their blocks in `pathways-client.ts` (Tasks 2 and 3 import it):

Create `.tmp/s4b/client-blocks.mjs`:

```js
// Shared names for the beneficiary client move: the methods, the client groups and the helpers that locate class methods and interface members in pathways-client.ts.
export const clientFile = 'apps/web/src/lib/services/pathways-client.ts'

export const groups = [
  {
    client: 'beneficiariesClient',
    module: '@/lib/api/beneficiaries',
    methods: [
      'getBeneficiaryRecordsForRole',
      'getSurveySubjectPage',
      'getBeneficiaryRecordForRole',
      'registerBeneficiary',
      'updateBeneficiary',
      'getDuplicateCandidates',
      'resolveDuplicate',
      'getBeneficiaryRegistrationContext',
      'ensureDefaultRegistrationForm',
    ],
  },
  {
    client: 'journeysClient',
    module: '@/lib/api/journeys',
    methods: [
      'getJourneyStages',
      'saveJourneyStages',
      'getBeneficiaryJourneyHistory',
      'transitionBeneficiaryJourney',
      'correctBeneficiaryJourneyEvent',
    ],
  },
  {
    client: 'beneficiaryMediaClient',
    module: '@/lib/api/beneficiary-media',
    methods: [
      'listBeneficiaryMedia',
      'getBeneficiaryMediaLimits',
      'reserveBeneficiaryMedia',
      'finalizeBeneficiaryMedia',
      'getBeneficiaryMediaBlob',
    ],
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

`.tmp/s4b/count-calls.mjs` counts the `pathwaysClient.<moved method>` calls in production and test files and lists other mentions of a moved name:

Create `.tmp/s4b/count-calls.mjs`:

```js
// Counts pathwaysClient.<moved method> calls (chained calls on the next line included) in production and test files, and lists other mentions of a moved name.
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
  if (rel.endsWith('lib/services/pathways-client.ts')) continue
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

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s4b/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s4b/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
```

Expected: the figures of the dry run on `02b272f4` (api with `5bd2ae40`). Write them down as the baselines; every later Expected is a delta from them. Typecheck prints `Done` for config, shared, imports, api and web; the test summaries are:

```
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  32 passed (32)
packages/shared test:       Tests  657 passed (657)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  224 passed (224)
apps/web test:       Tests  1998 passed (1998)
      Tests  57 passed (57)
```

The `sad:test` line is `Tests  57 passed (57)` (`B_sad` 57, with S6a Task 7). `docs:check` ends with `6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific` and `[ELIFECYCLE] Command failed with exit code 1.`: those 6 failures are the baseline and stay at 6 until the end. `build-routes.sh` prints `exit 0` and the `ƒ Middleware` line, whose size is `M0` (102 or 103 kB in the cloud container). pnpm may echo `$ tsc ...` lines between them. Config 19, shared 657 in 32 files, imports 94 in 11 files, api 2610 passed and 21 skipped, web 1998 in 224 files are `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`.

```bash
F=apps/web/src
git ls-files $F/features/beneficiaries | wc -l
git ls-files $F/features/journey-config | wc -l
wc -l $F/lib/services/pathways-client.ts $F/lib/services/registration-context.ts $F/lib/services/registration-context.test.ts $F/features/beneficiaries/beneficiary-form.tsx $F/features/beneficiaries/beneficiary-detail.tsx $F/features/beneficiaries/beneficiary-media-proof.tsx $F/features/beneficiaries/beneficiary-directory.tsx
node .tmp/s4b/count-calls.mjs
M=$(node -e "import('./.tmp/s4b/client-blocks.mjs').then((m) => console.log(m.allMethods.join(' ')))")
echo $M | wc -w
node .tmp/s4b/mock-scan.mjs lib/services/pathways-client $M
git grep -nw "RegisterBeneficiaryInput" -- $F | wc -l
git grep -n "features/journey-config" -- $F | grep -v "^$F/features/\(beneficiaries\|journey-config\)/" | wc -l
git grep -n "features/beneficiaries" -- $F | grep -v "^$F/features/beneficiaries/" | wc -l
git hash-object $F/lib/services/pathways-client.ts $F/lib/services/registration-context.ts $F/features/beneficiaries/beneficiary-form.tsx $F/features/beneficiaries/beneficiary-detail.tsx $F/features/beneficiaries/beneficiary-media-proof.tsx $F/features/beneficiaries/beneficiary-directory.tsx $F/features/journey-config/journey-config-workspace.tsx $F/types/pathways.ts apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts apps/api/src/modules/participants/journey-stages.mapper.ts | cut -c1-8
```

Expected: the counts and hashes the plan rests on (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT):

```
25
8
  1361 apps/web/src/lib/services/pathways-client.ts
    81 apps/web/src/lib/services/registration-context.ts
    73 apps/web/src/lib/services/registration-context.test.ts
  1388 apps/web/src/features/beneficiaries/beneficiary-form.tsx
  1172 apps/web/src/features/beneficiaries/beneficiary-detail.tsx
   664 apps/web/src/features/beneficiaries/beneficiary-media-proof.tsx
   565 apps/web/src/features/beneficiaries/beneficiary-directory.tsx
  5304 total
production calls 28 in 13 files
test calls 18 in 3 files
other mentions in 12 files
19
apps/web/src/features/beneficiaries/beneficiary-form-loader.test.tsx:21 getBeneficiaryRecordForRole
apps/web/src/features/collection/survey-subject-picker.test.tsx:19 getSurveySubjectPage
apps/web/src/features/journey-config/journey-config-workspace.test.tsx:21 saveJourneyStages
apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx:52 getJourneyStages
factories 41, naming 4
4
0
7
8976a9ef
9ee9581c
b0c1c47c
fb1fb30d
39bf61ff
6fe8b296
61ad748a
f7ba345d
fbb1cc0d
206ccbf0
```

In order: 25 files in `features/beneficiaries`, 8 in `features/journey-config`; the line counts; 28 production calls in 13 files and 18 test calls in 3 files; the 19 moved methods; the four test files that name a moved method in a `pathwaysClient` mock factory (`factories 41, naming 4`); 4 word hits of `RegisterBeneficiaryInput`; 0 imports of `journey-config` from other features; 7 imports of `beneficiaries` from other features (the route pages); the ten file hash prefixes.

Write down `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`; `.tmp/s4b/routes-baseline.txt` is the route baseline `R0`.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s4b-beneficiaries-web.md docs/superpowers/plans/$(date +%F)-modularization-s4b-beneficiaries-web.md`. The handoff copy and its index row stay. The `docs/superpowers/plans` copy of the S4 plan and its index row also stay for now: the controller removes them in Task 6 Step 7, after the final pull request merges.

In `docs/index.md` section 1.6, add one row after the S4 plan row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s4b-beneficiaries-web.md docs/superpowers/plans/$D-modularization-s4b-beneficiaries-web.md
sed -i "/(superpowers\/plans\/[^)]*modularization-s4-beneficiaries/a | [S4b beneficiaries web plan](superpowers/plans/$D-modularization-s4b-beneficiaries-web.md) | $D-modularization-s4b-beneficiaries-web.md | $D | S4b of the codebase modularization: beneficiary response contracts, beneficiary, journey and media clients, features/beneficiaries layout with journey-config merged in; S4c outline | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -m "docs: add the S4b beneficiaries web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one added row, the same 6 baseline docs failures and a commit of two files:

```
+| [S4b beneficiaries web plan](superpowers/plans/<date>-modularization-s4b-beneficiaries-web.md) | <date>-modularization-s4b-benefi

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S4b beneficiaries web plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/<date>-modularization-s4b-beneficiaries-web.md
```

The row line is cut at 140 characters by the command, and `<n>` is the plan length plus one. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).

---

### Task 1: Response contracts and api annotations

**Files:**
- Create (gitignored): `.tmp/s4b/replace-exact.mjs`, `task1-shared-edits.json`, `task1-edits.json`
- Create: `packages/shared/src/contracts/beneficiaries/beneficiary-responses.ts`, `beneficiary-responses.test.ts`, `beneficiary-media-responses.ts`, `beneficiary-media-responses.test.ts`, `packages/shared/src/contracts/journeys/journey-responses.ts`, `journey-responses.test.ts`
- Modify: `packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts`, `packages/shared/src/index.ts`; in `apps/api/src/modules`: `beneficiaries/{beneficiaries.mapper,beneficiaries.service,beneficiary-progress,identity-review.service,registration-context.service}.ts`, `beneficiary-media/beneficiary-media.service.ts`, `participants/{journey-stages.mapper,beneficiary-journey.service}.ts`

**Interfaces:**
- Consumes: S4a's request contracts and mappers.
- Produces: the response contracts of the Produces section, exported from `@pathways/shared`; the api mappers and services return them, so a drift fails typecheck.

- [ ] **Step 1: Create the replace script and export the two request constants**

Create `.tmp/s4b/replace-exact.mjs` with the Write tool (it applies exact text replacements and fails unless each one matches the expected number of times):

Create `.tmp/s4b/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s4b/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s4b/task1-shared-edits.json` exports `beneficiarySexes` and `disabilityStatuses` (ruling 4) and adds the three `export *` lines to the shared index:

Create `.tmp/s4b/task1-shared-edits.json`:

```json
[
  [
    "packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts",
    "const beneficiarySexes = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const\nconst disabilityStatuses = ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const",
    "export const beneficiarySexes = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const\nexport const disabilityStatuses = ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const",
    1
  ],
  [
    "packages/shared/src/index.ts",
    "export * from './contracts/beneficiaries/beneficiary-media-requests'\n",
    "export * from './contracts/beneficiaries/beneficiary-media-requests'\nexport * from './contracts/beneficiaries/beneficiary-responses'\nexport * from './contracts/journeys/journey-responses'\nexport * from './contracts/beneficiaries/beneficiary-media-responses'\n",
    1
  ]
]
```

```bash
node .tmp/s4b/replace-exact.mjs .tmp/s4b/task1-shared-edits.json
git diff packages/shared/src/index.ts | grep "^+export"
```

Expected: the two edits and the three added export lines:

```
2 replacements in 2 files
+export * from './contracts/beneficiaries/beneficiary-responses'
+export * from './contracts/journeys/journey-responses'
+export * from './contracts/beneficiaries/beneficiary-media-responses'
```

- [ ] **Step 2: Create the response contracts and their tests**

Create each file with the Write tool, exactly as printed. The beneficiary responses (types only, never parsed; the registration context is a plain interface, ruling 3):

Create `packages/shared/src/contracts/beneficiaries/beneficiary-responses.ts`:

```ts
import { z } from 'zod'

import type { FormFieldValidationContract } from '../../validation/form-data'
import { beneficiarySexes, disabilityStatuses } from './beneficiary-requests'

// Response shapes of the beneficiary routes, used as types and never parsed at runtime.

// Directory summary of one enrollment; restricted when the caller cannot read journeys.
export const beneficiaryProgressResponse = z.discriminatedUnion('restricted', [
  z.object({ restricted: z.literal(true) }),
  z.object({
    restricted: z.literal(false),
    lastParticipation: z
      .object({ activityId: z.string(), title: z.string(), date: z.string() })
      .nullable(),
    stage: z.object({ code: z.string(), name: z.string(), progressPercent: z.number() }).nullable(),
  }),
])
export type BeneficiaryProgressResponse = z.infer<typeof beneficiaryProgressResponse>

// One beneficiary as the list, detail, register and update routes return it; progress is on list and detail only.
export const beneficiaryResponse = z.object({
  id: z.string(),
  code: z.string(),
  subjectType: z.enum(['INDIVIDUAL', 'GROUP', 'COMMUNITY', 'UNSPECIFIED_LEGACY']),
  displayName: z.string(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  sex: z.enum(beneficiarySexes),
  birthDate: z.string().optional(),
  ageAtRegistration: z.number().int().nullable(),
  disabilityStatus: z.enum(disabilityStatuses),
  locationBarangay: z.string().nullable(),
  locationCityMunicipality: z.string().nullable(),
  locationProvince: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  consentRecorded: z.boolean(),
  dataProcessingConsentRecorded: z.boolean(),
  isMinor: z.boolean(),
  guardianConsentRecorded: z.boolean(),
  projectId: z.string(),
  enrollment: z
    .object({
      id: z.string(),
      projectId: z.string(),
      enrollmentDate: z.string(),
      status: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE']),
      endedDate: z.string().optional(),
      endReason: z.string().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
  consentProvenance: z.array(
    z.object({
      kind: z.enum(['PARTICIPATION', 'DATA_PROCESSING', 'GUARDIAN']),
      source: z.enum(['DIRECT_ENTRY', 'IMPORTED_DATASET']),
      recordedAt: z.string(),
    }),
  ),
  progress: beneficiaryProgressResponse.optional(),
  updatedAt: z.string(),
})
export type BeneficiaryResponse = z.infer<typeof beneficiaryResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/archive answer.
export const archiveBeneficiaryResponse = z.object({
  id: z.string(),
  status: z.literal('ARCHIVED'),
  archivedAt: z.string(),
})
export type ArchiveBeneficiaryResponse = z.infer<typeof archiveBeneficiaryResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/enrollments answer.
export const enrollBeneficiaryResponse = z.object({
  id: z.string(),
  enrollmentDate: z.string(),
  status: z.string(),
})
export type EnrollBeneficiaryResponse = z.infer<typeof enrollBeneficiaryResponse>

const duplicateProfileResponse = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  birthDate: z.string(),
  location: z.string(),
  updatedAt: z.string(),
})
export type DuplicateProfileResponse = z.infer<typeof duplicateProfileResponse>

// One pair of enrolled profiles that GET beneficiaries/projects/:projectId/duplicate-candidates lists.
export const duplicateCandidatePairResponse = z.object({
  left: duplicateProfileResponse,
  right: duplicateProfileResponse,
})
export type DuplicateCandidatePairResponse = z.infer<typeof duplicateCandidatePairResponse>

// A plain type, not a schema: the web parser checks bounds, the business date and the definition rules that no schema here expresses.
export interface RegistrationContextResponse {
  projectId: string
  businessDate: string
  definitions: {
    id: string
    code: string
    version: number
    name: string
    formType: 'BENEFICIARY_REGISTRATION'
    status: 'PUBLISHED'
    fields: (FormFieldValidationContract & {
      id: string
      metadataKey: boolean
      sadddField: boolean
      sequence: number
    })[]
  }[]
}
```

Create `packages/shared/src/contracts/beneficiaries/beneficiary-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  archiveBeneficiaryResponse,
  beneficiaryProgressResponse,
  beneficiaryResponse,
  duplicateCandidatePairResponse,
} from './beneficiary-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const beneficiary = {
  id: uuid,
  code: 'B-001',
  subjectType: 'INDIVIDUAL',
  displayName: 'Fictional Person',
  firstName: 'Fictional',
  middleName: null,
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  birthDate: '2010-04-02',
  ageAtRegistration: null,
  disabilityStatus: 'NOT_SPECIFIED',
  locationBarangay: null,
  locationCityMunicipality: null,
  locationProvince: null,
  status: 'ACTIVE',
  consentRecorded: true,
  dataProcessingConsentRecorded: true,
  isMinor: true,
  guardianConsentRecorded: true,
  projectId: uuid,
  enrollment: {
    id: uuid,
    projectId: uuid,
    enrollmentDate: '2026-09-01',
    status: 'ACTIVE',
    endReason: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  consentProvenance: [
    { kind: 'PARTICIPATION', source: 'DIRECT_ENTRY', recordedAt: '2026-09-01T00:00:00.000Z' },
  ],
  updatedAt: '2026-09-01T00:00:00.000Z',
}

describe('beneficiary response contracts', () => {
  it('accepts a register or update row without progress and a list row with either progress form', () => {
    expect(beneficiaryResponse.safeParse(beneficiary).success).toBe(true)
    const restricted = { ...beneficiary, progress: { restricted: true } }
    expect(beneficiaryResponse.safeParse(restricted).success).toBe(true)
    const open = {
      ...beneficiary,
      progress: {
        restricted: false,
        lastParticipation: { activityId: uuid, title: 'Workshop', date: '2026-09-02' },
        stage: { code: 'ENTRY', name: 'Entry', progressPercent: 50 },
      },
    }
    expect(beneficiaryResponse.safeParse(open).success).toBe(true)
  })

  it('rejects an unrestricted progress without its stage and an unknown sex', () => {
    expect(beneficiaryProgressResponse.safeParse({ restricted: false }).success).toBe(false)
    expect(beneficiaryResponse.safeParse({ ...beneficiary, sex: 'FEMALE ' }).success).toBe(false)
  })

  it('accepts the archive answer and a duplicate pair', () => {
    const archived = { id: uuid, status: 'ARCHIVED', archivedAt: '2026-09-03T00:00:00.000Z' }
    expect(archiveBeneficiaryResponse.safeParse(archived).success).toBe(true)
    const profile = {
      id: uuid,
      code: 'B-001',
      name: 'Fictional Person',
      birthDate: '2010-04-02',
      location: '',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    expect(
      duplicateCandidatePairResponse.safeParse({ left: profile, right: profile }).success,
    ).toBe(true)
  })
})
```

The media responses:

Create `packages/shared/src/contracts/beneficiaries/beneficiary-media-responses.ts`:

```ts
import { z } from 'zod'

// Response shapes of the beneficiary media routes, used as types and never parsed at runtime.

// One ready file of GET beneficiaries/projects/:projectId/:beneficiaryId/media.
export const beneficiaryMediaItemResponse = z.object({
  id: z.string(),
  type: z.enum(['DOCUMENT', 'PHOTO', 'VIDEO', 'PROGRESS_PROOF', 'COMPLETION_PROOF', 'OTHER']),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
  description: z.string().nullable(),
  submittedAt: z.string(),
  submittedBy: z.string(),
  storageReady: z.boolean(),
})
export type BeneficiaryMediaItemResponse = z.infer<typeof beneficiaryMediaItemResponse>

// Body of the GET beneficiaries/projects/:projectId/:beneficiaryId/media/limits answer.
export const beneficiaryMediaLimitsResponse = z.object({
  maxFiles: z.number(),
  maxFileBytes: z.number(),
  contentTypes: z.array(z.string()),
})
export type BeneficiaryMediaLimitsResponse = z.infer<typeof beneficiaryMediaLimitsResponse>

const beneficiaryMediaReservedFileResponse = z.object({
  mediaId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
  uploadUrl: z.string().nullable(),
})
export type BeneficiaryMediaReservedFileResponse = z.infer<
  typeof beneficiaryMediaReservedFileResponse
>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/media/reservations answer.
export const beneficiaryMediaReservationResponse = z.object({
  files: z.array(beneficiaryMediaReservedFileResponse),
})
export type BeneficiaryMediaReservationResponse = z.infer<
  typeof beneficiaryMediaReservationResponse
>
```

Create `packages/shared/src/contracts/beneficiaries/beneficiary-media-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  beneficiaryMediaItemResponse,
  beneficiaryMediaLimitsResponse,
  beneficiaryMediaReservationResponse,
} from './beneficiary-media-responses'

const uuid = '10000000-0000-4000-8000-000000000001'

describe('beneficiary media response contracts', () => {
  it('accepts a ready file, the limits and a reservation with a skipped upload url', () => {
    const item = {
      id: uuid,
      type: 'PHOTO',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      description: null,
      submittedAt: '2026-09-01T00:00:00.000Z',
      submittedBy: 'Fictional Officer',
      storageReady: true,
    }
    expect(beneficiaryMediaItemResponse.safeParse(item).success).toBe(true)
    const limits = { maxFiles: 10, maxFileBytes: 5_242_880, contentTypes: ['image/jpeg'] }
    expect(beneficiaryMediaLimitsResponse.safeParse(limits).success).toBe(true)
    const file = {
      mediaId: uuid,
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: 'a'.repeat(64),
      uploadUrl: null,
    }
    expect(beneficiaryMediaReservationResponse.safeParse({ files: [file] }).success).toBe(true)
  })

  it('rejects a file type outside the stored evidence types', () => {
    const item = { id: uuid, type: 'AUDIO' }
    expect(beneficiaryMediaItemResponse.safeParse(item).success).toBe(false)
  })
})
```

The journey responses:

Create `packages/shared/src/contracts/journeys/journey-responses.ts`:

```ts
import { z } from 'zod'

// Response shapes of the journey routes, used as types and never parsed at runtime.

// One stage of GET and PUT projects/:projectId/journey-stages; the type carries the display label.
export const journeyStageResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  name: z.string(),
  order: z.number().int(),
  type: z.enum(['Entry', 'Core', 'Branch', 'Follow-Up']),
  parentStageId: z.string().optional(),
  terminal: z.boolean(),
  mappedActivityIds: z.array(z.string()),
  description: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
})
export type JourneyStageResponse = z.infer<typeof journeyStageResponse>

const beneficiaryJourneyEventResponse = z.object({
  id: z.string(),
  eventType: z.enum([
    'ENROLLMENT',
    'PARTICIPATION',
    'PROGRESS_UPDATE',
    'COMPLETION',
    'FOLLOW_UP',
    'DROPOUT',
    'TRANSFER',
  ]),
  eventDate: z.string(),
  description: z.string().nullable(),
  note: z.string().nullable(),
  stageId: z.string().nullable(),
  stageCodeSnapshot: z.string().nullable(),
  stageNameSnapshot: z.string().nullable(),
  activityId: z.string().nullable(),
  activityCodeSnapshot: z.string().nullable(),
  activityTitleSnapshot: z.string().nullable(),
  participationId: z.string().nullable(),
  participation: z
    .object({
      attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED']),
      progressStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP']),
    })
    .nullable(),
  correctsEventId: z.string().nullable(),
  correctionReason: z.string().nullable(),
  recordedAt: z.string(),
  recordedBy: z.string(),
})
export type BeneficiaryJourneyEventResponse = z.infer<typeof beneficiaryJourneyEventResponse>

// Body of the GET beneficiaries/projects/:projectId/:beneficiaryId/journey answer.
export const beneficiaryJourneyResponse = z.object({
  projectId: z.string(),
  beneficiaryId: z.string(),
  enrollmentId: z.string(),
  enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE']),
  events: z.array(beneficiaryJourneyEventResponse),
})
export type BeneficiaryJourneyResponse = z.infer<typeof beneficiaryJourneyResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events answer.
export const recordJourneyEventResponse = z.object({
  enrollmentId: z.string(),
  eventType: z.enum(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER']),
  eventDate: z.string(),
})
export type RecordJourneyEventResponse = z.infer<typeof recordJourneyEventResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events/:eventId/corrections answer.
export const correctJourneyEventResponse = z.object({ id: z.string() })
export type CorrectJourneyEventResponse = z.infer<typeof correctJourneyEventResponse>
```

Create `packages/shared/src/contracts/journeys/journey-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { beneficiaryJourneyResponse, journeyStageResponse } from './journey-responses'

const uuid = '10000000-0000-4000-8000-000000000001'

describe('journey response contracts', () => {
  it('accepts a stage that carries the display label and rejects the stored label', () => {
    const stage = {
      id: uuid,
      projectId: uuid,
      code: 'ENTRY',
      name: 'Entry',
      order: 1,
      type: 'Follow-Up',
      terminal: false,
      mappedActivityIds: [],
      description: '',
      archived: false,
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    expect(journeyStageResponse.safeParse(stage).success).toBe(true)
    expect(journeyStageResponse.safeParse({ ...stage, type: 'FOLLOW_UP' }).success).toBe(false)
  })

  it('accepts a history with one enrollment event and one participation event', () => {
    const event = {
      id: uuid,
      eventType: 'ENROLLMENT',
      eventDate: '2026-09-01',
      description: null,
      note: null,
      stageId: null,
      stageCodeSnapshot: null,
      stageNameSnapshot: null,
      activityId: null,
      activityCodeSnapshot: null,
      activityTitleSnapshot: null,
      participationId: null,
      participation: null,
      correctsEventId: null,
      correctionReason: null,
      recordedAt: '2026-09-01T00:00:00.000Z',
      recordedBy: 'Fictional Officer',
    }
    const participation = {
      ...event,
      eventType: 'PARTICIPATION',
      participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
    }
    const history = {
      projectId: uuid,
      beneficiaryId: uuid,
      enrollmentId: uuid,
      enrollmentStatus: 'ACTIVE',
      events: [event, participation],
    }
    expect(beneficiaryJourneyResponse.safeParse(history).success).toBe(true)
    expect(
      beneficiaryJourneyResponse.safeParse({ ...history, events: [{ id: uuid }] }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 3: Check the shared package and rebuild it**

```bash
pnpm exec biome check --write packages/shared/src
pnpm --filter @pathways/shared exec tsc -p tsconfig.json --noEmit
pnpm --filter @pathways/shared test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
pnpm --filter @pathways/shared build
```

Expected: Biome fixes one shared file (formatting of the new files), the shared typecheck prints nothing, and the shared suite is `B_shared` plus 3 files and 7 tests:

```
Checked 83 files in <ms>. Fixed 1 file.
 Test Files  35 passed (35)
      Tests  664 passed (664)
$ tsc -p tsconfig.build.json
```

The `Checked` count is the shared file count on the branch.

- [ ] **Step 4: Annotate the api mappers and services, and prove a drift fails**

`.tmp/s4b/task1-edits.json` holds 28 exact replacements in 8 api files: the return type of `mapBeneficiary` and of the list rows, `mapStage`'s return type with an `as const` label lookup, the progress type replaced by the contract's, `satisfies` on the detail, archive, enroll, history, event, correction, media limits and reservation results, a typed duplicate pair list and media list, and the registration context interface replaced by `RegistrationContextResponse`:

Create `.tmp/s4b/task1-edits.json`:

```json
[
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts",
    "import type { FormFieldValidationContract } from '@pathways/shared'",
    "import type { BeneficiaryResponse, FormFieldValidationContract } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts",
    "export function mapBeneficiary(row: BeneficiaryRow, projectId: string) {",
    "export function mapBeneficiary(row: BeneficiaryRow, projectId: string): BeneficiaryResponse {",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiary-progress.ts",
    "import { aggregateOnlyRoles, hasAtomicPermission } from '@pathways/shared'",
    "import {\n  type BeneficiaryProgressResponse,\n  aggregateOnlyRoles,\n  hasAtomicPermission,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiary-progress.ts",
    "type BeneficiaryProgress =\n  | { restricted: true }\n  | {\n      restricted: false\n      lastParticipation: { activityId: string; title: string; date: string } | null\n      stage: { code: string; name: string; progressPercent: number } | null\n    }\n\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiary-progress.ts",
    "new Map<string, BeneficiaryProgress>()",
    "new Map<string, BeneficiaryProgressResponse>()",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/registration-context.service.ts",
    "import type { Tx } from '../../common/prisma/transaction'\nimport { contract, fieldSelection } from './beneficiaries.mapper'\n\n// Supporting output allowlist, independently authorized from collection/form access.\nexport interface RegistrationContext {\n  projectId: string\n  businessDate: string\n  definitions: {\n    id: string\n    code: string\n    version: number\n    name: string\n    formType: 'BENEFICIARY_REGISTRATION'\n    status: 'PUBLISHED'\n    fields: (import('@pathways/shared').FormFieldValidationContract & {\n      id: string\n      metadataKey: boolean\n      sadddField: boolean\n      sequence: number\n    })[]\n  }[]\n}\n\n",
    "import type { Tx } from '../../common/prisma/transaction'\nimport { contract, fieldSelection } from './beneficiaries.mapper'\n\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/registration-context.service.ts",
    "import {\n  beneficiaryRegistrationDefinitionErrors,",
    "import {\n  type RegistrationContextResponse,\n  beneficiaryRegistrationDefinitionErrors,",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/registration-context.service.ts",
    "): Promise<RegistrationContext> {",
    "): Promise<RegistrationContextResponse> {",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "import {\n  type ArchiveBeneficiaryRequest,\n  type BeneficiaryListQuery,\n  type EnrollBeneficiaryRequest,\n  type RegisterBeneficiaryRequest,\n  type UpdateBeneficiaryRequest,",
    "import {\n  type ArchiveBeneficiaryRequest,\n  type ArchiveBeneficiaryResponse,\n  type BeneficiaryListQuery,\n  type BeneficiaryResponse,\n  type EnrollBeneficiaryRequest,\n  type EnrollBeneficiaryResponse,\n  type RegisterBeneficiaryRequest,\n  type RegistrationContextResponse,\n  type UpdateBeneficiaryRequest,",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "import { type RegistrationContext, loadRegistrationContext } from './registration-context.service'",
    "import { loadRegistrationContext } from './registration-context.service'",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "  ): Promise<RegistrationContext> {",
    "  ): Promise<RegistrationContextResponse> {",
    2
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "          items: page.map((row) => ({",
    "          items: page.map((row): BeneficiaryResponse => ({",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "        return { ...mapBeneficiary(row, project.id), progress }",
    "        return { ...mapBeneficiary(row, project.id), progress } satisfies BeneficiaryResponse",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "        return { id: current.id, status: 'ARCHIVED', archivedAt: now.toISOString() }",
    "        return {\n          id: current.id,\n          status: 'ARCHIVED',\n          archivedAt: now.toISOString(),\n        } satisfies ArchiveBeneficiaryResponse",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "          enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),\n          status: enrollment.status,\n        }\n",
    "          enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),\n          status: enrollment.status,\n        } satisfies EnrollBeneficiaryResponse\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/identity-review.service.ts",
    "import type { ResolveDuplicateRequest } from '@pathways/shared'",
    "import type { DuplicateCandidatePairResponse, ResolveDuplicateRequest } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/identity-review.service.ts",
    "        const pairs = []\n",
    "        const pairs: DuplicateCandidatePairResponse[] = []\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-stages.mapper.ts",
    "import type { Prisma } from '@prisma/client'\n",
    "import type { Prisma } from '@prisma/client'\n\nimport type { JourneyStageResponse } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-stages.mapper.ts",
    "export function mapStage(stage: Prisma.JourneyStageGetPayload<{ select: typeof stageSelection }>) {",
    "export function mapStage(\n  stage: Prisma.JourneyStageGetPayload<{ select: typeof stageSelection }>,\n): JourneyStageResponse {",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-stages.mapper.ts",
    "    type: { ENTRY: 'Entry', CORE: 'Core', BRANCH: 'Branch', FOLLOW_UP: 'Follow-Up' }[\n      stage.stageType\n    ],\n",
    "    type: ({ ENTRY: 'Entry', CORE: 'Core', BRANCH: 'Branch', FOLLOW_UP: 'Follow-Up' } as const)[\n      stage.stageType\n    ],\n",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.ts",
    "import {\n  type CorrectJourneyEventRequest,\n  type RecordJourneyEventRequest,\n  aggregateOnlyRoles,\n} from '@pathways/shared'",
    "import {\n  type BeneficiaryJourneyResponse,\n  type CorrectJourneyEventRequest,\n  type CorrectJourneyEventResponse,\n  type RecordJourneyEventRequest,\n  type RecordJourneyEventResponse,\n  aggregateOnlyRoles,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.ts",
    "          recordedBy: event.recordedBy.fullName,\n        })),\n      }\n",
    "          recordedBy: event.recordedBy.fullName,\n        })),\n      } satisfies BeneficiaryJourneyResponse\n",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.ts",
    "          eventType: input.eventType,\n          eventDate: input.eventDate,\n        }\n",
    "          eventType: input.eventType,\n          eventDate: input.eventDate,\n        } satisfies RecordJourneyEventResponse\n",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.ts",
    "        return { id: correction.id }\n",
    "        return { id: correction.id } satisfies CorrectJourneyEventResponse\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "import {\n  MAX_BENEFICIARY_MEDIA_FILES,\n  type ReserveBeneficiaryMediaRequest,",
    "import {\n  type BeneficiaryMediaItemResponse,\n  type BeneficiaryMediaLimitsResponse,\n  type BeneficiaryMediaReservationResponse,\n  MAX_BENEFICIARY_MEDIA_FILES,\n  type ReserveBeneficiaryMediaRequest,",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "      contentTypes: [...beneficiaryMediaContentTypes],\n    }\n",
    "      contentTypes: [...beneficiaryMediaContentTypes],\n    } satisfies BeneficiaryMediaLimitsResponse\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "        return rows.map((row) => ({\n          id: row.id,\n          type: row.type,",
    "        return rows.map((row): BeneficiaryMediaItemResponse => ({\n          id: row.id,\n          type: row.type,",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "            uploadUrl: signed[index].uploadUrl,\n          }\n        }),\n      }\n",
    "            uploadUrl: signed[index].uploadUrl,\n          }\n        }),\n      } satisfies BeneficiaryMediaReservationResponse\n",
    1
  ]
]
```

```bash
node .tmp/s4b/replace-exact.mjs .tmp/s4b/task1-edits.json
pnpm --filter @pathways/api exec tsc --noEmit && echo "api typecheck clean"
```

Expected: the 28 replacements and a clean api typecheck:

```
28 replacements in 8 files
api typecheck clean
```

Prove the annotation catches a drift: rename one field in each mapper, expect a type error, then restore both files.

```bash
M=apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts
J=apps/api/src/modules/participants/journey-stages.mapper.ts
cp $M .tmp/s4b/files/mapper.bak && cp $J .tmp/s4b/files/stage.bak
sed -i 's/^    isMinor: row.isMinor,$/    minor: row.isMinor,/' $M
sed -i 's/^    terminal: stage.isTerminal,$/    terminalStage: stage.isTerminal,/' $J
pnpm --filter @pathways/api exec tsc --noEmit 2>&1 | grep "error TS" | cut -c1-150
cp .tmp/s4b/files/mapper.bak $M && cp .tmp/s4b/files/stage.bak $J
pnpm --filter @pathways/api exec tsc --noEmit && echo "api typecheck clean again"
```

Expected: both renames are refused, in this order, and the restored files typecheck:

```
src/modules/beneficiaries/beneficiaries.mapper.ts(94,5): error TS2561: Object literal may only specify known properties, but 'minor' does not exist in
src/modules/participants/journey-stages.mapper.ts(37,5): error TS2353: Object literal may only specify known properties, and 'terminalStage' does not 
api typecheck clean again
```

The messages continue past the cut; the codes `TS2561` and `TS2353` and the two line numbers are what to match.

- [ ] **Step 5: Format, run the suites and commit**

```bash
git add -N packages apps
FILES=$(git diff --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$")
pnpm exec biome check --write $FILES
pnpm exec biome check packages/shared apps/api
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/api test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A packages apps
git commit -m "refactor: add the beneficiary, journey and media response contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: Biome formats the 16 touched files and finds nothing in shared and api, the web typecheck is clean against the rebuilt shared package, the api suite equals `B_api`, and the commit holds 16 files:

```
Checked 16 files in <ms>. Fixed 2 files.
Checked 542 files in <ms>. No fixes applied.
web typecheck clean
 Test Files  152 passed | 10 skipped (162)
      Tests  2610 passed | 21 skipped (2631)
[<branch> <sha>] refactor: add the beneficiary, journey and media response contracts
 16 files changed, 508 insertions(+), 71 deletions(-)
 create mode 100644 packages/shared/src/contracts/beneficiaries/beneficiary-media-responses.test.ts
 create mode 100644 packages/shared/src/contracts/beneficiaries/beneficiary-media-responses.ts
 create mode 100644 packages/shared/src/contracts/beneficiaries/beneficiary-responses.test.ts
 create mode 100644 packages/shared/src/contracts/beneficiaries/beneficiary-responses.ts
 create mode 100644 packages/shared/src/contracts/journeys/journey-responses.test.ts
 create mode 100644 packages/shared/src/contracts/journeys/journey-responses.ts
```

The `Checked 542 files` figure is the shared plus api file count on the branch.

---

### Task 2: The three clients, with tests that run against the old and the new code

**Files:**
- Create (gitignored): `.tmp/s4b/build-clients.mjs`, `moved-original.mjs`, `same-lines.mjs`
- Create: `apps/web/src/lib/api/beneficiaries.ts`, `beneficiaries.schema.ts`, `beneficiaries.test.ts`, `journeys.ts`, `journeys.schema.ts`, `journeys.test.ts`, `beneficiary-media.ts`, `beneficiary-media.test.ts`

**Interfaces:**
- Consumes: Task 1's contracts and `lib/api/core/{request,guards}`.
- Produces: `beneficiariesClient`, `journeysClient`, `beneficiaryMediaClient`, `mapBeneficiary`, `parseRegistrationContext`, `parseJourneyStages`, `parseJourneyHistory`; `pathways-client.ts` is unchanged, so both old and new code exist side by side until Task 3.

- [ ] **Step 1: Create the generator and the line comparison**

Create each file with the Write tool, exactly as printed. `.tmp/s4b/build-clients.mjs` writes the five `lib/api` modules from the methods and parsers still in `pathways-client.ts` and `registration-context.ts`, with the contract type names swapped in and nothing else changed:

Create `.tmp/s4b/build-clients.mjs`:

```js
// Writes the five lib/api beneficiary modules from the methods and parsers still in pathways-client.ts, with the contract type names swapped in.
import { readFileSync, writeFileSync } from 'node:fs'

import { clientFile, groups, methodBlock } from './client-blocks.mjs'

const client = readFileSync(clientFile, 'utf8')
const registration = readFileSync('apps/web/src/lib/services/registration-context.ts', 'utf8')

// The top-level function or const: leading comment lines, the declaration and its closing brace line.
function topBlock(text, name) {
  const at = text.search(new RegExp(`\\n(?:export )?(?:async )?(?:function|const) ${name}\\b`))
  if (at < 0) throw new Error(`missing declaration ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    if (!/^(?:\/\/|\/\*\*| \*)/.test(text.slice(previous + 1, start - 1))) break
    start = previous + 1
  }
  const close = text.indexOf('\n}\n', at)
  if (close < 0) throw new Error(`unterminated declaration ${name}`)
  return text.slice(start, close + 3)
}

// Replaces every occurrence of each pair, throwing when a pair never matches.
function swap(text, pairs) {
  let result = text
  for (const [from, to] of pairs) {
    if (!result.includes(from)) throw new Error(`missing text: ${from.slice(0, 50)}`)
    result = result.replaceAll(from, to)
  }
  return result
}

// An object-literal client: each class method block gets its closing comma.
function clientObject(name, methods, pairs) {
  const blocks = methods.map((method) => methodBlock(client, method).replace(/\n {2}\}\n$/, '\n  },\n'))
  return `export const ${name} = {\n${swap(blocks.join('\n'), pairs)}}\n`
}

const [beneficiaries, journeys, media] = groups
const types = [
  ['RegisterBeneficiaryInput', 'RegisterBeneficiaryRequest'],
  ['ResolveDuplicateInput', 'ResolveDuplicateRequest'],
  ['Promise<DuplicateCandidatePair[]>', 'Promise<DuplicateCandidatePairResponse[]>'],
  ['as DuplicateCandidatePair[]', 'as DuplicateCandidatePairResponse[]'],
  ['ApiBeneficiary', 'BeneficiaryResponse'],
]
writeFileSync(
  'apps/web/src/lib/api/beneficiaries.ts',
  `import type {
  BeneficiaryResponse,
  DuplicateCandidatePairResponse,
  RegisterBeneficiaryRequest,
  ResolveDuplicateRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type {
  BeneficiaryFilters,
  BeneficiaryRecord,
  BeneficiaryRegistrationContext,
  UpdateBeneficiaryInput,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

import { mapBeneficiary, parseRegistrationContext } from './beneficiaries.schema'

${clientObject(beneficiaries.client, beneficiaries.methods, types)}`,
)

const registrationBody = registration.slice(registration.indexOf('const field = z')).replace(/\n$/, '')
const age = topBlock(client, 'ageFromBirthDate')
const mapper = swap(topBlock(client, 'mapBeneficiary'), [
  ['function mapBeneficiary(', 'export function mapBeneficiary('],
  ['ApiBeneficiary', 'BeneficiaryResponse'],
])
writeFileSync(
  'apps/web/src/lib/api/beneficiaries.schema.ts',
  `import {
  type BeneficiaryResponse,
  beneficiaryRegistrationDefinitionErrors,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { z } from 'zod'

import { PathwaysClientError } from '@/lib/api/core/request'
import type { BeneficiaryRecord, BeneficiaryRegistrationContext } from '@/types/pathways'

${registrationBody}

${age}
${mapper.replace(/^\n/, '')}`,
)

const journeyTypes = [
  [
    'as Promise<{\n      enrollmentId: string\n      eventType: string\n      eventDate: string\n    }>',
    'as Promise<RecordJourneyEventResponse>',
  ],
  ['as Promise<{ id: string }>', 'as Promise<CorrectJourneyEventResponse>'],
]
writeFileSync(
  'apps/web/src/lib/api/journeys.ts',
  `import type { CorrectJourneyEventResponse, RecordJourneyEventResponse } from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'
import type {
  BeneficiaryJourneyHistory,
  CorrectJourneyEventInput,
  EnrollmentJourneyEventInput,
  JourneyStageConfig,
} from '@/types/pathways'

import { parseJourneyHistory, parseJourneyStages } from './journeys.schema'

${clientObject(journeys.client, journeys.methods, journeyTypes)}`,
)

const parsers = ['parseJourneyStage', 'parseJourneyStages', 'parseJourneyHistory'].map(
  (name) => `export ${topBlock(client, name)}`,
)
writeFileSync(
  'apps/web/src/lib/api/journeys.schema.ts',
  `import { PathwaysClientError } from '@/lib/api/core/request'
import type { BeneficiaryJourneyHistory, JourneyStageConfig } from '@/types/pathways'

${parsers.join('\n')}`,
)

const mediaPath = /const beneficiaryMediaPath = [^\n]*\n {2}`[^\n]*`\n/.exec(client)?.[0].trimEnd()
if (!mediaPath) throw new Error('missing beneficiaryMediaPath')
const mediaTypes = [
  ['Promise<BeneficiaryMediaLimits>', 'Promise<BeneficiaryMediaLimitsResponse>'],
  ['as BeneficiaryMediaLimits', 'as BeneficiaryMediaLimitsResponse'],
  ['Promise<BeneficiaryMediaReservedFile[]>', 'Promise<BeneficiaryMediaReservedFileResponse[]>'],
  ['as BeneficiaryMediaReservedFile[]', 'as BeneficiaryMediaReservedFileResponse[]'],
]
writeFileSync(
  'apps/web/src/lib/api/beneficiary-media.ts',
  `import type {
  BeneficiaryMediaLimitsResponse,
  BeneficiaryMediaReservedFileResponse,
} from '@pathways/shared'

import { isFiniteNonNegative } from '@/lib/api/core/guards'
import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import type { ActivityProofFileDeclaration, BeneficiaryMediaItem } from '@/types/pathways'

${mediaPath}

${clientObject(media.client, media.methods, mediaTypes)}`,
)
console.log('wrote 5 modules')
```

`.tmp/s4b/moved-original.mjs` writes the same methods and parsers, as they stand in `pathways-client.ts`, to one file for comparison:

Create `.tmp/s4b/moved-original.mjs`:

```js
// Writes the moved methods, parsers and mappers of pathways-client.ts and registration-context.ts to one file so same-lines.mjs can compare them with the new lib/api modules.
import { readFileSync, writeFileSync } from 'node:fs'

import { clientFile, groups, methodBlock } from './client-blocks.mjs'

const [out] = process.argv.slice(2)
const client = readFileSync(clientFile, 'utf8')
const registration = readFileSync('apps/web/src/lib/services/registration-context.ts', 'utf8')

// The top-level function or const: leading comment lines, the declaration and its closing brace line.
function topBlock(name) {
  const at = client.search(new RegExp(`\\n(?:export )?(?:async )?(?:function|const) ${name}\\b`))
  if (at < 0) throw new Error(`missing declaration ${name}`)
  let start = at + 1
  for (;;) {
    const previous = client.lastIndexOf('\n', start - 2)
    if (!/^(?:\/\/|\/\*\*| \*)/.test(client.slice(previous + 1, start - 1))) break
    start = previous + 1
  }
  return client.slice(start, client.indexOf('\n}\n', at) + 3)
}

// The two inline result types that the move replaces by contract names are compared in their replaced form.
const resultTypes = [
  [
    'as Promise<{\n      enrollmentId: string\n      eventType: string\n      eventDate: string\n    }>',
    'as Promise<RecordJourneyEventResponse>',
  ],
  ['as Promise<{ id: string }>', 'as Promise<CorrectJourneyEventResponse>'],
]
const clients = groups.map(
  (group) =>
    `const ${group.client} = {\n${group.methods
      .map((name) => methodBlock(client, name).replace(/\n {2}\}\n$/, '\n  },\n'))
      .join('\n')}}\n`,
)
const tops = ['ageFromBirthDate', 'mapBeneficiary', 'parseJourneyStage', 'parseJourneyStages', 'parseJourneyHistory'].map(topBlock)
const media = /const beneficiaryMediaPath = [^\n]*\n {2}`[^\n]*`\n/.exec(client)?.[0]
if (!media) throw new Error('missing beneficiaryMediaPath')
const parser = registration.slice(registration.indexOf('const field = z'))
const text = `${clients.join('')}${media}${tops.join('\n')}${parser}`
writeFileSync(out, resultTypes.reduce((result, [from, to]) => result.replace(from, to), text))
console.log(`blocks written: ${groups.flatMap((group) => group.methods).length + tops.length + 2}`)
```

`.tmp/s4b/same-lines.mjs` fails when a line of the original is lost and counts the lines the new files add:

Create `.tmp/s4b/same-lines.mjs`:

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

- [ ] **Step 2: Generate the modules and prove they are the moved code**

```bash
node .tmp/s4b/build-clients.mjs
A=apps/web/src/lib/api
node .tmp/s4b/moved-original.mjs .tmp/s4b/files/moved-original.ts
node .tmp/s4b/same-lines.mjs .tmp/s4b/files/moved-original.ts $A/beneficiaries.ts $A/beneficiaries.schema.ts $A/journeys.ts $A/journeys.schema.ts $A/beneficiary-media.ts BeneficiaryResponse=ApiBeneficiary RegisterBeneficiaryRequest=RegisterBeneficiaryInput ResolveDuplicateRequest=ResolveDuplicateInput DuplicateCandidatePairResponse=DuplicateCandidatePair BeneficiaryMediaLimitsResponse=BeneficiaryMediaLimits BeneficiaryMediaReservedFileResponse=BeneficiaryMediaReservedFile
pnpm exec biome check --write $A
wc -l $A/beneficiaries.ts $A/beneficiaries.schema.ts $A/journeys.ts $A/journeys.schema.ts $A/beneficiary-media.ts
```

Expected: the five modules are written, every original line is accounted for, and Biome has nothing to fix in the five files (the `Checked` count is the `lib/api` file count):

```
wrote 5 modules
blocks written: 26
original lines 563, lost 0, added 0
Checked 29 files in <ms>. No fixes applied.
  225 apps/web/src/lib/api/beneficiaries.ts
  198 apps/web/src/lib/api/beneficiaries.schema.ts
   86 apps/web/src/lib/api/journeys.ts
   62 apps/web/src/lib/api/journeys.schema.ts
   75 apps/web/src/lib/api/beneficiary-media.ts
  646 total
```

- [ ] **Step 3: Create the characterization tests**

Create each file with the Write tool, exactly as printed. Each test file runs its cases against `pathwaysClient` and the new client (`describe.each`) with `requestFoundation` replaced, so the old code proves the cases before it goes. `beneficiaries.test.ts` (7 cases):

Create `apps/web/src/lib/api/beneficiaries.test.ts`:

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

import { pathwaysClient } from '@/lib/services/pathways-client'
import { beneficiaryRegistrationFieldRules } from '@pathways/shared'
import { beneficiariesClient } from './beneficiaries'

const projectId = '79400000-0000-4000-8000-000000000001'
const beneficiaryId = '79400000-0000-4000-8000-000000000002'
const formId = '79400000-0000-4000-8000-000000000003'
const registrationId = '79400000-0000-4000-8000-000000000004'
const cursor = '79400000-0000-4000-8000-000000000005'
const otherId = '79400000-0000-4000-8000-000000000006'
const base = `/beneficiaries/projects/${projectId}`

const row = {
  id: beneficiaryId,
  code: 'BEN-S4B-001',
  subjectType: 'INDIVIDUAL',
  displayName: 'Fictional Person',
  firstName: 'Fictional',
  middleName: null,
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  birthDate: '2000-01-01',
  ageAtRegistration: 26,
  disabilityStatus: 'NOT_SPECIFIED',
  locationBarangay: null,
  locationCityMunicipality: null,
  locationProvince: null,
  status: 'ACTIVE',
  consentRecorded: true,
  dataProcessingConsentRecorded: true,
  isMinor: false,
  guardianConsentRecorded: false,
  projectId,
  enrollment: { id: formId, projectId, enrollmentDate: '2026-06-01', status: 'ACTIVE' },
  consentProvenance: [],
  updatedAt: '2026-06-01T00:00:00.000Z',
}
const contributor = {
  ...row,
  enrollment: { projectId, status: 'ACTIVE', endedDate: null },
}
const context = {
  projectId,
  businessDate: '2026-09-27',
  definitions: [
    {
      id: formId,
      code: 'registration',
      name: 'Registration',
      version: 1,
      formType: 'BENEFICIARY_REGISTRATION',
      status: 'PUBLISHED',
      fields: Object.entries(beneficiaryRegistrationFieldRules).map(([code, rule], index) => ({
        id: `79400000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        code,
        label: code,
        dataType: rule.dataType,
        required: 'required' in rule ? rule.required : false,
        metadataKey: false,
        sadddField: false,
        sequence: index + 1,
        allowedValues: 'allowedValues' in rule ? [...rule.allowedValues] : null,
      })),
    },
  ],
}

// The same cases run against the PathwaysClient methods until Task 3 removes them.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['beneficiariesClient', beneficiariesClient],
] as const

describe.each(clients)('%s beneficiary requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('returns no records without a project and sends the filters of the first page', async () => {
    await expect(client.getBeneficiaryRecordsForRole('Project Officer')).resolves.toEqual([])
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue({ items: [row], nextCursor: null })
    const records = await client.getBeneficiaryRecordsForRole('Project Officer', projectId, {
      search: ' BEN ',
      sex: 'FEMALE',
      ageBand: '25+',
      disabilityStatus: 'NOT_SPECIFIED',
      enrollmentStatus: 'ACTIVE',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}?search=BEN&sex=FEMALE&ageBand=25%2B&disabilityStatus=NOT_SPECIFIED&enrollmentStatus=ACTIVE&limit=50`,
    )
    expect(records).toEqual([
      expect.objectContaining({ id: beneficiaryId, ageGroup: '25+', projectIds: [projectId] }),
    ])
  })

  it('follows the cursor to the last page and refuses a repeated cursor', async () => {
    request.requestFoundation
      .mockResolvedValueOnce({ items: [row], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    await expect(
      client.getBeneficiaryRecordsForRole('Project Officer', projectId),
    ).resolves.toHaveLength(1)
    expect(request.requestFoundation.mock.calls.map(([path]) => path)).toEqual([
      `${base}?limit=50`,
      `${base}?limit=50&cursor=${cursor}`,
    ])
    request.requestFoundation.mockReset()
    request.requestFoundation.mockResolvedValue({ items: [], nextCursor: cursor })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary pagination.',
    )
  })

  it('refuses a page that is not a list of at most 50 rows', async () => {
    request.requestFoundation.mockResolvedValue({ items: 'rows', nextCursor: null })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary response.',
    )
    request.requestFoundation.mockResolvedValue({
      items: Array(51).fill(row),
      nextCursor: null,
    })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary response.',
    )
  })

  it('reads one record, registers and updates at encoded project scoped paths', async () => {
    await expect(
      client.getBeneficiaryRecordForRole('Project Officer', '', beneficiaryId),
    ).rejects.toThrow('Project scope is required.')
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue(row)
    await client.getBeneficiaryRecordForRole('Project Officer', projectId, 'a b')
    const registration = { formId, clientRegistrationId: registrationId, values: { code: 'x' } }
    await client.registerBeneficiary(projectId, registration)
    const update = {
      subjectType: 'INDIVIDUAL',
      sex: 'NOT_SPECIFIED',
      disabilityStatus: 'NOT_SPECIFIED',
      expectedUpdatedAt: row.updatedAt,
    } as const
    await client.updateBeneficiary(projectId, beneficiaryId, update)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/a%20b`],
      [`${base}/registrations`, { method: 'POST', body: JSON.stringify(registration) }],
      [`${base}/${beneficiaryId}`, { method: 'PATCH', body: JSON.stringify(update) }],
    ])
  })

  it('reads one bounded contributor page and refuses an invalid project before any request', async () => {
    request.requestFoundation.mockResolvedValue({ items: [contributor], nextCursor: otherId })
    const signal = new AbortController().signal
    await expect(
      client.getSurveySubjectPage(projectId, ' Fictional ', otherId, signal),
    ).resolves.toEqual({
      items: [{ id: beneficiaryId, code: 'BEN-S4B-001', displayName: 'Fictional Person' }],
      nextCursor: otherId,
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}?enrollmentStatus=ACTIVE&limit=25&search=Fictional&cursor=${otherId}`,
      { signal },
    )
    request.requestFoundation.mockClear()
    await expect(client.getSurveySubjectPage('bad')).rejects.toThrow('Invalid contributor search.')
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('lists duplicate candidates as sent and posts the decision', async () => {
    const pair = { left: { id: beneficiaryId }, right: { id: otherId } }
    request.requestFoundation.mockResolvedValue([pair])
    await expect(client.getDuplicateCandidates(projectId)).resolves.toEqual([pair])
    const decision = { leftId: beneficiaryId, rightId: otherId, decision: 'LINK' } as const
    await client.resolveDuplicate(projectId, decision)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/duplicate-candidates`],
      [`${base}/duplicate-candidates/resolve`, { method: 'POST', body: JSON.stringify(decision) }],
    ])
  })

  it('reads the registration context, provisions the default form and refuses a bad context', async () => {
    await expect(client.getBeneficiaryRegistrationContext('')).rejects.toThrow(
      'Project scope is required.',
    )
    await expect(client.ensureDefaultRegistrationForm('')).rejects.toThrow(
      'Project scope is required.',
    )
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue(context)
    await expect(client.getBeneficiaryRegistrationContext(projectId)).resolves.toMatchObject({
      projectId,
      businessDate: '2026-09-27',
    })
    await client.ensureDefaultRegistrationForm(projectId)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/registration-context`],
      [`${base}/registration-context/default-form`, { method: 'POST' }],
    ])
    request.requestFoundation.mockResolvedValue({ ...context, actorId: 'private' })
    await expect(client.getBeneficiaryRegistrationContext(projectId)).rejects.toMatchObject({
      message: 'Invalid registration context response.',
      code: 'network',
    })
  })
})
```

`journeys.test.ts` (4 cases):

Create `apps/web/src/lib/api/journeys.test.ts`:

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

import { pathwaysClient } from '@/lib/services/pathways-client'
import type { JourneyStageConfig } from '@/types/pathways'
import { journeysClient } from './journeys'

const projectId = '79500000-0000-4000-8000-000000000001'
const beneficiaryId = '79500000-0000-4000-8000-000000000002'
const stageId = '79500000-0000-4000-8000-000000000003'
const activityId = '79500000-0000-4000-8000-000000000004'
const eventId = '79500000-0000-4000-8000-000000000005'
const stagesPath = `/projects/${projectId}/journey-stages`
const journeyPath = `/beneficiaries/projects/${projectId}/${beneficiaryId}/journey`

const stage: JourneyStageConfig = {
  id: stageId,
  projectId,
  code: 'J2',
  name: 'Workshop participation',
  order: 2,
  type: 'Follow-Up',
  terminal: false,
  mappedActivityIds: [activityId],
  description: 'Core stage',
  archived: false,
  updatedAt: '2026-09-21T00:00:00.000Z',
}
const history = {
  projectId,
  beneficiaryId,
  enrollmentId: stageId,
  enrollmentStatus: 'ACTIVE',
  events: [
    {
      id: eventId,
      eventType: 'ENROLLMENT',
      eventDate: '2026-09-21',
      recordedAt: '2026-09-21T00:00:00.000Z',
      recordedBy: 'Fictional Officer',
    },
  ],
}

// The same cases run against the PathwaysClient methods until Task 3 removes them.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['journeysClient', journeysClient],
] as const

describe.each(clients)('%s journey requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('reads the stages with the abort signal and refuses a row of the wrong shape', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([stage])
    await expect(client.getJourneyStages(projectId, signal)).resolves.toEqual([stage])
    expect(request.requestFoundation).toHaveBeenCalledWith(stagesPath, { signal })
    request.requestFoundation.mockResolvedValue([{ ...stage, type: 'FOLLOW_UP' }])
    await expect(client.getJourneyStages(projectId)).rejects.toThrow(
      'Invalid journey-stage response.',
    )
    request.requestFoundation.mockResolvedValue({})
    await expect(client.getJourneyStages(projectId)).rejects.toThrow(
      'Invalid journey-stage response.',
    )
  })

  it('saves the stages with the stored type codes and the revision the editor read', async () => {
    request.requestFoundation.mockResolvedValue([stage])
    await client.saveJourneyStages(projectId, [stage])
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(stagesPath)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      stages: [
        {
          id: stageId,
          code: 'J2',
          name: 'Workshop participation',
          order: 2,
          type: 'FOLLOW_UP',
          terminal: false,
          description: 'Core stage',
          mappedActivityIds: [activityId],
          expectedUpdatedAt: '2026-09-21T00:00:00.000Z',
        },
      ],
    })
  })

  it('reads the history and refuses one without a list of events', async () => {
    request.requestFoundation.mockResolvedValue(history)
    await expect(client.getBeneficiaryJourneyHistory(projectId, beneficiaryId)).resolves.toEqual(
      history,
    )
    expect(request.requestFoundation).toHaveBeenCalledWith(journeyPath)
    request.requestFoundation.mockResolvedValue({ ...history, events: 'none' })
    await expect(client.getBeneficiaryJourneyHistory(projectId, beneficiaryId)).rejects.toThrow(
      'Invalid journey-history response.',
    )
  })

  it('posts an event and a correction at their append-only paths', async () => {
    request.requestFoundation.mockResolvedValue({ id: eventId })
    const event = {
      eventType: 'FOLLOW_UP',
      eventDate: '2026-09-22',
      description: 'Follow-up check',
      stageId,
    } as const
    const correction = {
      eventDate: '2026-09-21',
      description: 'Corrected wording',
      reason: 'Typo',
      stageId,
    }
    await client.transitionBeneficiaryJourney(projectId, beneficiaryId, event)
    await client.correctBeneficiaryJourneyEvent(projectId, beneficiaryId, 'a b', correction)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${journeyPath}/events`, { method: 'POST', body: JSON.stringify(event) }],
      [
        `${journeyPath}/events/a%20b/corrections`,
        { method: 'POST', body: JSON.stringify(correction) },
      ],
    ])
  })
})
```

`beneficiary-media.test.ts` (4 cases):

Create `apps/web/src/lib/api/beneficiary-media.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  requestFoundation: vi.fn(),
  requestFoundationResponse: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
  requestFoundationResponse: request.requestFoundationResponse,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { beneficiaryMediaClient } from './beneficiary-media'

const projectId = '79600000-0000-4000-8000-000000000001'
const beneficiaryId = '79600000-0000-4000-8000-000000000002'
const mediaId = '79600000-0000-4000-8000-000000000003'
const path = `/beneficiaries/projects/${projectId}/${beneficiaryId}/media`
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}

// The same cases run against the PathwaysClient methods until Task 3 removes them.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['beneficiaryMediaClient', beneficiaryMediaClient],
] as const

describe.each(clients)('%s beneficiary media requests', (_name, client) => {
  beforeEach(() => {
    request.requestFoundation.mockReset()
    request.requestFoundationResponse.mockReset()
  })

  it('lists the media and refuses an answer that is not a list', async () => {
    request.requestFoundation.mockResolvedValue([{ id: mediaId }])
    await expect(client.listBeneficiaryMedia(projectId, beneficiaryId)).resolves.toEqual([
      { id: mediaId },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith(path)
    request.requestFoundation.mockResolvedValue({})
    await expect(client.listBeneficiaryMedia(projectId, beneficiaryId)).rejects.toThrow(
      'Invalid beneficiary media response.',
    )
  })

  it('reads the limits and refuses a negative or missing number', async () => {
    const limits = { maxFiles: 10, maxFileBytes: 5_242_880, contentTypes: ['image/jpeg'] }
    request.requestFoundation.mockResolvedValue(limits)
    await expect(client.getBeneficiaryMediaLimits(projectId, beneficiaryId)).resolves.toEqual(
      limits,
    )
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/limits`)
    for (const bad of [{ ...limits, maxFiles: -1 }, { maxFileBytes: 1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.getBeneficiaryMediaLimits(projectId, beneficiaryId)).rejects.toThrow(
        'Invalid beneficiary media limits response.',
      )
    }
  })

  it('reserves the files and returns the reserved list or refuses an answer without one', async () => {
    const reserved = [{ mediaId, ...file, uploadUrl: null }]
    request.requestFoundation.mockResolvedValue({ files: reserved })
    const input = { files: [file], note: 'Workshop' }
    await expect(client.reserveBeneficiaryMedia(projectId, beneficiaryId, input)).resolves.toEqual(
      reserved,
    )
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/reservations`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    request.requestFoundation.mockResolvedValue({})
    await expect(client.reserveBeneficiaryMedia(projectId, beneficiaryId, input)).rejects.toThrow(
      'Invalid beneficiary media reservation response.',
    )
  })

  it('finalizes by an encoded id and downloads the content as a blob', async () => {
    request.requestFoundation.mockResolvedValue(undefined)
    await client.finalizeBeneficiaryMedia(projectId, beneficiaryId, 'a b')
    expect(request.requestFoundation).toHaveBeenCalledWith(`${path}/a%20b/finalize`, {
      method: 'POST',
    })
    const blob = new Blob(['bytes'])
    request.requestFoundationResponse.mockResolvedValue({ blob: async () => blob })
    await expect(client.getBeneficiaryMediaBlob(projectId, beneficiaryId, mediaId)).resolves.toBe(
      blob,
    )
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(`${path}/${mediaId}/content`)
  })
})
```

```bash
pnpm exec biome check --write apps/web/src/lib/api
pnpm --filter @pathways/web exec vitest run src/lib/api/beneficiaries.test.ts src/lib/api/journeys.test.ts src/lib/api/beneficiary-media.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "✓|×|^ FAIL |Test Files|Tests +[0-9]+"
```

Expected: three test files, 15 cases each run against the old and the new client (30 runs), all passing, in any order; the durations vary:

```
Checked 32 files in <ms>. No fixes applied.
 ✓ src/lib/api/beneficiary-media.test.ts (8 tests) <ms>
 ✓ src/lib/api/beneficiaries.test.ts (14 tests) <ms>
 ✓ src/lib/api/journeys.test.ts (8 tests) <ms>
 Test Files  3 passed (3)
      Tests  30 passed (30)
```

- [ ] **Step 4: Prove the tests can fail**

Change the page size the new client sends, expect failures, then restore the file.

```bash
cp apps/web/src/lib/api/beneficiaries.ts .tmp/s4b/files/beneficiaries.bak
sed -i "s/params.set('limit', '50')/params.set('limit', '25')/" apps/web/src/lib/api/beneficiaries.ts
pnpm --filter @pathways/web exec vitest run src/lib/api/beneficiaries.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
cp .tmp/s4b/files/beneficiaries.bak apps/web/src/lib/api/beneficiaries.ts
git status --short
```

Expected: two cases fail with the page size changed, the file is restored, and `git status` lists only the eight new files:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/api/beneficiaries.test.ts > beneficiariesClient beneficiary requests > returns no records without a project and sends the filters of the first page
 FAIL  src/lib/api/beneficiaries.test.ts > beneficiariesClient beneficiary requests > follows the cursor to the last page and refuses a repeated cursor
 Test Files  1 failed (1)
      Tests  2 failed | 12 passed (14)
?? apps/web/src/lib/api/beneficiaries.schema.ts
?? apps/web/src/lib/api/beneficiaries.test.ts
?? apps/web/src/lib/api/beneficiaries.ts
?? apps/web/src/lib/api/beneficiary-media.test.ts
?? apps/web/src/lib/api/beneficiary-media.ts
?? apps/web/src/lib/api/journeys.schema.ts
?? apps/web/src/lib/api/journeys.test.ts
?? apps/web/src/lib/api/journeys.ts
```

The two failing cases are the first-page request and the cursor loop; pnpm may add an `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` line after `Tests`.

- [ ] **Step 5: Typecheck, run the web suite and commit**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm exec biome check apps/web/src/lib/api
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): add the beneficiary, journey and media clients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the web typecheck is clean, `--noUnusedLocals` lists only the two baseline lines, the suite is `B_web` plus 3 files and 30 tests, and the commit holds 8 files:

```
web typecheck clean
src/features/collection/collection-workspace.tsx(405,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
Checked 32 files in <ms>. No fixes applied.
 Test Files  227 passed (227)
      Tests  2028 passed (2028)
[<branch> <sha>] refactor(web): add the beneficiary, journey and media clients
 8 files changed, 1100 insertions(+)
 create mode 100644 apps/web/src/lib/api/beneficiaries.schema.ts
 create mode 100644 apps/web/src/lib/api/beneficiaries.test.ts
 create mode 100644 apps/web/src/lib/api/beneficiaries.ts
 create mode 100644 apps/web/src/lib/api/beneficiary-media.test.ts
 create mode 100644 apps/web/src/lib/api/beneficiary-media.ts
 create mode 100644 apps/web/src/lib/api/journeys.schema.ts
 create mode 100644 apps/web/src/lib/api/journeys.test.ts
 create mode 100644 apps/web/src/lib/api/journeys.ts
```

The two `error TS` lines exist at the base and are not from this slice. A `Test Files` figure of 227 and `Tests` of 2028 are the web counts at this commit.

---

### Task 3: Move the callers and mocks, and remove the old methods

**Files:**
- Create (gitignored): `.tmp/s4b/trim-imports.mjs`, `move-client-calls.mjs`, `split-client-mocks.mjs`, `remove-client-code.mjs`, `finish-client-tests.mjs`, `task3-edits.json`
- Modify: `apps/web/src/lib/services/pathways-client.ts`, `apps/web/src/types/pathways.ts`; the 13 production files that call a moved method; 3 client tests (`pathways-client.test.ts`, `pathways-client.c2-c4.test.ts`, `pathways-client.survey-subject.test.ts`); 12 test files with a `pathways-client` mock factory; `duplicate-resolution-workspace.tsx`; the three Task 2 tests
- Move: `apps/web/src/lib/services/registration-context.test.ts` to `apps/web/src/lib/api/beneficiaries.schema.test.ts`
- Delete: `apps/web/src/lib/services/registration-context.ts`

**Interfaces:**
- Consumes: Task 2's clients.
- Produces: no beneficiary, journey or media method on `pathwaysClient`; every caller and mock uses the new clients; `pathways-client.ts` keeps `getBeneficiaryAssessments`, `recoverSourceMutation` and the other domains.

- [ ] **Step 1: Count the callers and the mock factories**

```bash
node .tmp/s4b/count-calls.mjs
M=$(node -e "import('./.tmp/s4b/client-blocks.mjs').then((m) => console.log(m.allMethods.join(' ')))")
node .tmp/s4b/mock-scan.mjs lib/services/pathways-client $M
```

Expected: the counts of Task 0 (the `other mentions` figure is 18 now because the three new `lib/api` modules and their tests name the moved methods):

```
production calls 28 in 13 files
test calls 18 in 3 files
other mentions in 18 files
apps/web/src/features/beneficiaries/beneficiary-form-loader.test.tsx:21 getBeneficiaryRecordForRole
apps/web/src/features/collection/survey-subject-picker.test.tsx:19 getSurveySubjectPage
apps/web/src/features/journey-config/journey-config-workspace.test.tsx:21 saveJourneyStages
apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx:52 getJourneyStages
factories 41, naming 4
```

- [ ] **Step 2: Move the calls and split the mocks**

Create each file with the Write tool, exactly as printed. `.tmp/s4b/move-client-calls.mjs` rewrites `pathwaysClient.<moved method>` calls to the new client and adds or trims the imports (it skips the new `lib/api` files and `pathways-client.ts` itself):

Create `.tmp/s4b/move-client-calls.mjs`:

```js
// Rewrites pathwaysClient.<moved method> calls to their new beneficiary client and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups } from './client-blocks.mjs'

const skip = new Set([
  'lib/services/pathways-client.ts',
  'lib/api/beneficiaries.ts',
  'lib/api/beneficiaries.test.ts',
  'lib/api/journeys.ts',
  'lib/api/journeys.test.ts',
  'lib/api/beneficiary-media.ts',
  'lib/api/beneficiary-media.test.ts',
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

`.tmp/s4b/split-client-mocks.mjs` gives every test that mocks `pathways-client` a matching `vi.mock` of each new client its factory serves:

Create `.tmp/s4b/split-client-mocks.mjs`:

```js
// Gives every test that mocks pathways-client a matching vi.mock of each new beneficiary client its factory serves.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups as clientGroups } from './client-blocks.mjs'

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

```bash
node .tmp/s4b/move-client-calls.mjs
node .tmp/s4b/split-client-mocks.mjs
node .tmp/s4b/count-calls.mjs
```

Expected: 46 calls in 16 files move, the mocks of 12 test files are split (9 gain a shared-object mock, 4 are emptied of the moved member, 13 new `vi.mock` lines in all), and no caller or test call is left:

```
features/beneficiaries/beneficiary-detail-loader.tsx: 3
features/beneficiaries/beneficiary-detail.tsx: 4
features/beneficiaries/beneficiary-directory-loader.tsx: 2
features/beneficiaries/beneficiary-form-loader.tsx: 1
features/beneficiaries/beneficiary-form.tsx: 5
features/beneficiaries/beneficiary-media-proof.tsx: 5
features/beneficiaries/duplicate-resolution-workspace.tsx: 2
features/beneficiaries/evaluation-center-lookup.tsx: 1
features/beneficiaries/journey-stages-loader.tsx: 1
features/collection/collection-workspace.tsx: 1
features/collection/survey-subject-picker.tsx: 1
features/journey-config/journey-config-workspace.tsx: 1
features/projects/projects.reads.ts: 1
lib/services/pathways-client.c2-c4.test.ts: 10
lib/services/pathways-client.survey-subject.test.ts: 6
lib/services/pathways-client.test.ts: 2
files 16, calls 46
apps/web/src/features/beneficiaries/beneficiary-detail-loader.test.tsx:25: added beneficiariesClient, journeysClient (object client)
apps/web/src/features/beneficiaries/beneficiary-detail.test.tsx:33: added journeysClient (object client)
apps/web/src/features/beneficiaries/beneficiary-form-loader.test.tsx:21: emptied (getBeneficiaryRecordForRole)
apps/web/src/features/beneficiaries/beneficiary-form.test.tsx:31: added beneficiariesClient (object client)
apps/web/src/features/beneficiaries/beneficiary-media-proof.test.tsx:25: added beneficiaryMediaClient (object api)
apps/web/src/features/beneficiaries/duplicate-resolution-workspace.test.tsx:28: added beneficiariesClient (object client)
apps/web/src/features/collection/direct-entry-ownership.test.tsx:28: added beneficiariesClient (object api)
apps/web/src/features/collection/survey-subject-picker.test.tsx:19: emptied (getSurveySubjectPage)
apps/web/src/features/journey-config/journey-config-workspace.test.tsx:21: emptied (saveJourneyStages)
apps/web/src/features/projects/activities/components/project-activities-rbac.test.tsx:46: added journeysClient (object api)
apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx:52: emptied (getJourneyStages)
apps/web/src/features/projects/activities/components/project-activities-workspace.test.tsx:47: added journeysClient (object api)
files 12
production calls 0 in 0 files
test calls 0 in 0 files
other mentions in 34 files
```

- [ ] **Step 3: Remove the old code**

`.tmp/s4b/remove-client-code.mjs` cuts the 19 interface members and class methods, `beneficiaryMediaPath`, `ApiBeneficiary`, the duplicate types, `ageFromBirthDate`, `mapBeneficiary`, the three journey parsers and the registration context import out of `pathways-client.ts`, and stops if a block is missing:

Create `.tmp/s4b/remove-client-code.mjs`:

```js
// Removes the moved members, methods, helpers and types from pathways-client.ts and prints what each step cut.
import { readFileSync, writeFileSync } from 'node:fs'

import { allMethods, clientFile, memberBlock, methodBlock } from './client-blocks.mjs'

let text = readFileSync(clientFile, 'utf8')
const cut = (label, block) => {
  if (!text.includes(block)) throw new Error(`block not found: ${label}`)
  text = text.replace(block, '')
  console.log(`${label}: ${block.split('\n').length - 1} lines`)
}

for (const name of allMethods) cut(`member ${name}`, memberBlock(text, name))
for (const name of allMethods) cut(`method ${name}`, `${methodBlock(text, name)}\n`)

const media = /const beneficiaryMediaPath = [^\n]*\n {2}`[^\n]*`\n\n/.exec(text)?.[0]
if (!media) throw new Error('missing beneficiaryMediaPath')
cut('beneficiaryMediaPath', media)

const apiStart = text.indexOf('interface ApiBeneficiary {')
cut('ApiBeneficiary', text.slice(apiStart, text.indexOf('\n}\n', apiStart) + 4))

const from = text.indexOf('export type DuplicateProfile = {')
const to = text.indexOf('function mapUser(')
if (from < 0 || to < from) throw new Error('missing mapper region')
cut('duplicate types, ageFromBirthDate, mapBeneficiary, journey parsers', text.slice(from, to))

cut('registration-context import', "import { parseRegistrationContext } from './registration-context'\n")
writeFileSync(clientFile, text)
```

`.tmp/s4b/trim-imports.mjs` drops named imports that no longer appear in the file body:

Create `.tmp/s4b/trim-imports.mjs`:

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

`.tmp/s4b/task3-edits.json` gives the duplicate resolution screen the contract types in place of the two types the client file exported (ruling 10) and deletes the unused `RegisterBeneficiaryInput`:

Create `.tmp/s4b/task3-edits.json`:

```json
[
  [
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.tsx",
    "(pair: DuplicateCandidatePair)",
    "(pair: DuplicateCandidatePairResponse)",
    1
  ],
  [
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.tsx",
    "useState<DuplicateCandidatePair[]>",
    "useState<DuplicateCandidatePairResponse[]>",
    1
  ],
  [
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.tsx",
    "person: DuplicateProfile\n",
    "person: DuplicateProfileResponse\n",
    1
  ],
  [
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.tsx",
    "import { type DuplicateCandidatePair, type DuplicateProfile } from '@/lib/services/pathways-client'\n",
    "",
    1
  ],
  [
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.tsx",
    "import { ArrowLeft,",
    "import type { DuplicateCandidatePairResponse, DuplicateProfileResponse } from '@pathways/shared'\nimport { ArrowLeft,",
    1
  ],
  [
    "apps/web/src/types/pathways.ts",
    "export interface RegisterBeneficiaryInput {\n  formId: string\n  clientRegistrationId: string\n  values: Record<string, unknown>\n}\n\n",
    "",
    1
  ]
]
```

`.tmp/s4b/finish-client-tests.mjs` turns the three Task 2 `describe.each` tests into plain tests of the new client:

Create `.tmp/s4b/finish-client-tests.mjs`:

```js
// Turns the three describe.each characterization tests into plain tests of the new client once the old methods are gone.
import { readFileSync, writeFileSync } from 'node:fs'

const files = [
  ['apps/web/src/lib/api/beneficiaries.test.ts', 'beneficiariesClient'],
  ['apps/web/src/lib/api/journeys.test.ts', 'journeysClient'],
  ['apps/web/src/lib/api/beneficiary-media.test.ts', 'beneficiaryMediaClient'],
]
for (const [file, client] of files) {
  let text = readFileSync(file, 'utf8')
  const edits = [
    [/import \{ pathwaysClient \} from '@\/lib\/services\/pathways-client'\n/, ''],
    [/\/\/ The same cases run against[^\n]*\nconst clients = \[[\s\S]*?\] as const\n\n/, ''],
    [/describe\.each\(clients\)\('%s ([^']*)', \(_name, client\) => \{/, `describe('${client} $1', () => {`],
    [/\bclient\.(?=[a-z])/g, `${client}.`],
  ]
  for (const [from, to] of edits) {
    if (!from.test(text)) throw new Error(`${file}: no match for ${from}`)
    text = text.replace(from, to)
  }
  writeFileSync(file, text)
  console.log(`${file}: done`)
}
```

```bash
node .tmp/s4b/remove-client-code.mjs
node .tmp/s4b/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts
node .tmp/s4b/replace-exact.mjs .tmp/s4b/task3-edits.json
git mv apps/web/src/lib/services/registration-context.test.ts apps/web/src/lib/api/beneficiaries.schema.test.ts
git rm -q apps/web/src/lib/services/registration-context.ts
sed -i "s#from './registration-context'#from './beneficiaries.schema'#" apps/web/src/lib/api/beneficiaries.schema.test.ts
node .tmp/s4b/finish-client-tests.mjs
wc -l apps/web/src/lib/services/pathways-client.ts
```

Expected: every block is found (19 interface members, 19 methods and the support code), the registration context test moves with `git mv`, and the file shrinks to 704 lines before Biome:

```
member getBeneficiaryRecordsForRole: 5 lines
member getSurveySubjectPage: 9 lines
member getBeneficiaryRecordForRole: 5 lines
member registerBeneficiary: 4 lines
member updateBeneficiary: 5 lines
member getDuplicateCandidates: 1 lines
member resolveDuplicate: 1 lines
member getBeneficiaryRegistrationContext: 1 lines
member ensureDefaultRegistrationForm: 2 lines
member getJourneyStages: 1 lines
member saveJourneyStages: 1 lines
member getBeneficiaryJourneyHistory: 4 lines
member transitionBeneficiaryJourney: 5 lines
member correctBeneficiaryJourneyEvent: 6 lines
member listBeneficiaryMedia: 1 lines
member getBeneficiaryMediaLimits: 4 lines
member reserveBeneficiaryMedia: 5 lines
member finalizeBeneficiaryMedia: 1 lines
member getBeneficiaryMediaBlob: 1 lines
method getBeneficiaryRecordsForRole: 49 lines
method getSurveySubjectPage: 77 lines
method getBeneficiaryRecordForRole: 13 lines
method registerBeneficiary: 12 lines
method updateBeneficiary: 13 lines
method getDuplicateCandidates: 6 lines
method resolveDuplicate: 7 lines
method getBeneficiaryRegistrationContext: 14 lines
method ensureDefaultRegistrationForm: 15 lines
method getJourneyStages: 8 lines
method saveJourneyStages: 31 lines
method getBeneficiaryJourneyHistory: 11 lines
method transitionBeneficiaryJourney: 15 lines
method correctBeneficiaryJourneyEvent: 12 lines
method listBeneficiaryMedia: 10 lines
method getBeneficiaryMediaLimits: 12 lines
method reserveBeneficiaryMedia: 14 lines
method finalizeBeneficiaryMedia: 11 lines
method getBeneficiaryMediaBlob: 11 lines
beneficiaryMediaPath: 3 lines
ApiBeneficiary: 32 lines
duplicate types, ageFromBirthDate, mapBeneficiary, journey parsers: 188 lines
registration-context import: 1 lines
apps/web/src/lib/services/pathways-client.ts: removed isFiniteNonNegative, requestFoundationResponse, ActivityProofFileDeclaration, BeneficiaryFilters, BeneficiaryJourneyHistory, BeneficiaryMediaItem, BeneficiaryMediaLimits, BeneficiaryMediaReservedFile, BeneficiaryRecord, BeneficiaryRegistrationContext, CorrectJourneyEventInput, EnrollmentJourneyEventInput, JourneyStageConfig, RegisterBeneficiaryInput, UpdateBeneficiaryInput
6 replacements in 2 files
apps/web/src/lib/api/beneficiaries.test.ts: done
apps/web/src/lib/api/journeys.test.ts: done
apps/web/src/lib/api/beneficiary-media.test.ts: done
704 apps/web/src/lib/services/pathways-client.ts
```

- [ ] **Step 4: Format, check and scan**

```bash
git add -N apps
FILES=$(git diff HEAD --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$")
echo "$FILES" | wc -l
pnpm exec biome check --write $FILES
pnpm exec biome check $FILES
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
node .tmp/s4b/count-calls.mjs
M=$(node -e "import('./.tmp/s4b/client-blocks.mjs').then((m) => console.log(m.allMethods.join(' ')))")
node .tmp/s4b/mock-scan.mjs lib/services/pathways-client $M
git grep -n "registration-context'" -- apps/web/src | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: 34 touched files, Biome fixes 22 of them in the first run and none in the second, the typecheck is clean, `--noUnusedLocals` lists the two baseline lines (the first now at line 406 because the file gained an import line), the scans are clean and no import of `registration-context` is left:

```
34
Checked 34 files in <ms>. Fixed 22 files.
Checked 34 files in <ms>. No fixes applied.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
production calls 0 in 0 files
test calls 0 in 0 files
other mentions in 34 files
factories 41, naming 0
0
```

- [ ] **Step 5: Run the web suite and commit**

```bash
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): move the beneficiary client callers and remove the old methods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the web suite is `B_web` plus 3 files and 15 tests (the three new client tests add 15 cases, the old client rows are gone), and the commit holds 35 files:

```
 Test Files  227 passed (227)
      Tests  2013 passed (2013)
[<branch> <sha>] refactor(web): move the beneficiary client callers and remove the old methods
 35 files changed, 196 insertions(+), 905 deletions(-)
 rename apps/web/src/lib/{services/registration-context.test.ts => api/beneficiaries.schema.test.ts} (97%)
 delete mode 100644 apps/web/src/lib/services/registration-context.ts
```

---

### Task 4: Move the beneficiary and journey files into the feature layout

**Files:**
- Create (gitignored): `.tmp/s4b/move-modules.mjs`, `layout-map.json`, `task4-edits.json`
- Create: `apps/web/src/features/beneficiaries/index.ts`
- Move: the 33 files of `apps/web/src/features/beneficiaries` and `apps/web/src/features/journey-config` (see the map)
- Modify: the specifiers inside the moved files (by script), the seven route pages, `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`

**Interfaces:**
- Consumes: Task 3's tree.
- Produces: `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` and `beneficiaries.utils.ts`; one `index.ts` that the seven route pages import; `features/journey-config` is gone.

- [ ] **Step 1: Re-measure the route baseline**

Tasks 2 and 3 already changed 28 routes, so the layout move is compared with a baseline taken now.

```bash
.tmp/s4b/build-routes.sh pre-layout
node .tmp/s4b/compare-routes.mjs .tmp/s4b/routes-baseline.txt .tmp/s4b/routes-pre-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: the build succeeds with Middleware at `M0`, the value Task 0 measures (102 or 103 kB in the cloud container), and 28 of the 72 routes differ from the Task 0 baseline: 24 are 5 to 12 kB smaller (the bundles lost the unused client code, ruling 12) and 4 are 1 kB bigger (`/alerts`, `/alerts/repository`, `/beneficiaries/[beneficiaryId]`, `/recommendations/[recommendationId]`); the build takes about three minutes:

```
exit 0
ƒ Middleware                                                      <M0> kB
/alerts: 292 kB -> 293 kB (+1.0)
/alerts/repository: 311 kB -> 312 kB (+1.0)
/analytics: 663 kB -> 658 kB (-5.0)
/beneficiaries: 291 kB -> 285 kB (-6.0)
/beneficiaries/[beneficiaryId]: 298 kB -> 299 kB (+1.0)
/beneficiaries/[beneficiaryId]/edit: 286 kB -> 279 kB (-7.0)
/beneficiaries/duplicates: 279 kB -> 272 kB (-7.0)
/beneficiaries/evaluation-center: 248 kB -> 241 kB (-7.0)
/beneficiaries/new: 286 kB -> 279 kB (-7.0)
/collection: 435 kB -> 429 kB (-6.0)
/collection/forms: 435 kB -> 429 kB (-6.0)
/collection/forms/new: 435 kB -> 429 kB (-6.0)
/collection/import: 443 kB -> 438 kB (-5.0)
/collection/projects/[projectId]/forms/[formId]: 435 kB -> 429 kB (-6.0)
/dashboard: 673 kB -> 668 kB (-5.0)
/projects: 264 kB -> 252 kB (-12.0)
/projects/[projectId]: 316 kB -> 311 kB (-5.0)
/projects/[projectId]/activities: 343 kB -> 338 kB (-5.0)
/projects/[projectId]/activities/[activityId]: 343 kB -> 338 kB (-5.0)
/projects/[projectId]/budget: 325 kB -> 313 kB (-12.0)
/projects/[projectId]/edit: 303 kB -> 297 kB (-6.0)
/projects/[projectId]/evidence: 325 kB -> 313 kB (-12.0)
/projects/[projectId]/indicators: 288 kB -> 283 kB (-5.0)
/projects/[projectId]/journey-stages: 275 kB -> 263 kB (-12.0)
/projects/[projectId]/monitor-evaluate: 325 kB -> 313 kB (-12.0)
/projects/new: 303 kB -> 297 kB (-6.0)
/recommendations/[recommendationId]: 292 kB -> 293 kB (+1.0)
/settings/users: 293 kB -> 287 kB (-6.0)
routes 72, different 28
```

The kB cells are the dry run's. The compare runs against `routes-baseline.txt` built in this same container, so a cell may differ from the listing by 1 kB (a `-4.0` where it shows `-5.0`) while the counts (`routes 72, different 28`, 24 smaller, 4 bigger) must match.

- [ ] **Step 2: Create the move script and map, and move**

Create each file with the Write tool, exactly as printed. `.tmp/s4b/move-modules.mjs` runs `git mv` for every entry of a web move map, then rewrites every import, re-export, dynamic import and `vi.mock` specifier that named a moved module or sits in a moved file, keeping the alias or relative form; it also rewrites quoted paths in the source-reading contract test:

Create `.tmp/s4b/move-modules.mjs`:

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

`.tmp/s4b/layout-map.json`:

Create `.tmp/s4b/layout-map.json`:

```json
{
  "features/beneficiaries/beneficiary-utils.ts": "features/beneficiaries/beneficiaries.utils.ts",
  "features/beneficiaries/beneficiary-utils.test.ts": "features/beneficiaries/beneficiaries.utils.test.ts",
  "features/beneficiaries/beneficiary-directory.tsx": "features/beneficiaries/directory/components/beneficiary-directory.tsx",
  "features/beneficiaries/beneficiary-directory.test.tsx": "features/beneficiaries/directory/components/beneficiary-directory.test.tsx",
  "features/beneficiaries/beneficiary-directory-loader.tsx": "features/beneficiaries/directory/components/beneficiary-directory-loader.tsx",
  "features/beneficiaries/evaluation-center-lookup.tsx": "features/beneficiaries/directory/components/evaluation-center-lookup.tsx",
  "features/beneficiaries/beneficiary-form.tsx": "features/beneficiaries/registration/components/beneficiary-form.tsx",
  "features/beneficiaries/beneficiary-form.test.tsx": "features/beneficiaries/registration/components/beneficiary-form.test.tsx",
  "features/beneficiaries/beneficiary-form-loader.tsx": "features/beneficiaries/registration/components/beneficiary-form-loader.tsx",
  "features/beneficiaries/beneficiary-form-loader.test.tsx": "features/beneficiaries/registration/components/beneficiary-form-loader.test.tsx",
  "features/beneficiaries/beneficiary-registration-ui.ts": "features/beneficiaries/registration/registration.utils.ts",
  "features/beneficiaries/beneficiary-registration-ui.test.ts": "features/beneficiaries/registration/registration.utils.test.ts",
  "features/beneficiaries/beneficiary-detail.tsx": "features/beneficiaries/profile/components/beneficiary-detail.tsx",
  "features/beneficiaries/beneficiary-detail.test.tsx": "features/beneficiaries/profile/components/beneficiary-detail.test.tsx",
  "features/beneficiaries/beneficiary-detail-loader.tsx": "features/beneficiaries/profile/components/beneficiary-detail-loader.tsx",
  "features/beneficiaries/beneficiary-detail-loader.test.tsx": "features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx",
  "features/beneficiaries/beneficiary-journey-adapter.ts": "features/beneficiaries/profile/profile.utils.ts",
  "features/beneficiaries/beneficiary-journey-adapter.test.ts": "features/beneficiaries/profile/profile.utils.test.ts",
  "features/beneficiaries/beneficiary-media-proof.tsx": "features/beneficiaries/media/components/beneficiary-media-proof.tsx",
  "features/beneficiaries/beneficiary-media-proof.test.tsx": "features/beneficiaries/media/components/beneficiary-media-proof.test.tsx",
  "features/beneficiaries/beneficiary-media-utils.ts": "features/beneficiaries/media/media.utils.ts",
  "features/beneficiaries/beneficiary-media-utils.test.ts": "features/beneficiaries/media/media.utils.test.ts",
  "features/beneficiaries/duplicate-resolution-workspace.tsx": "features/beneficiaries/identity-review/components/duplicate-resolution-workspace.tsx",
  "features/beneficiaries/duplicate-resolution-workspace.test.tsx": "features/beneficiaries/identity-review/components/duplicate-resolution-workspace.test.tsx",
  "features/beneficiaries/journey-stages-loader.tsx": "features/beneficiaries/journey/components/journey-stages-loader.tsx",
  "features/journey-config/journey-config-workspace.tsx": "features/beneficiaries/journey/components/journey-config-workspace.tsx",
  "features/journey-config/journey-config-workspace.test.tsx": "features/beneficiaries/journey/components/journey-config-workspace.test.tsx",
  "features/journey-config/journey-stage-details.tsx": "features/beneficiaries/journey/components/journey-stage-details.tsx",
  "features/journey-config/journey-stage-list.tsx": "features/beneficiaries/journey/components/journey-stage-list.tsx",
  "features/journey-config/journey-track.tsx": "features/beneficiaries/journey/components/journey-track.tsx",
  "features/journey-config/journey-track.test.tsx": "features/beneficiaries/journey/components/journey-track.test.tsx",
  "features/journey-config/journey-config-utils.ts": "features/beneficiaries/journey/journey.utils.ts",
  "features/journey-config/journey-config-utils.test.ts": "features/beneficiaries/journey/journey.utils.test.ts"
}
```

```bash
node .tmp/s4b/move-modules.mjs .tmp/s4b/layout-map.json
rmdir apps/web/src/features/journey-config
ls apps/web/src/features/beneficiaries
```

Expected: 33 files move; `move-modules.mjs` first prints one `<file>: <n>` line per rewritten file (23 lines, 29 specifiers in all), then:

```
moved 33 files, rewrote 29 specifiers and 0 contract paths
beneficiaries.utils.test.ts
beneficiaries.utils.ts
directory
identity-review
journey
media
profile
registration
```

`rmdir` removes the empty `journey-config` folder (it prints nothing, and fails if the folder still holds a file); the last eight lines are the new layout.

- [ ] **Step 3: Add the public index and point the pages, the direction test and the Next config at it**

Create `apps/web/src/features/beneficiaries/index.ts` with the Write tool (the feature index lists its exports by leaf path, with no sub-index):

Create `apps/web/src/features/beneficiaries/index.ts`:

```ts
// Public surface of the beneficiaries feature for files outside it.
export { BeneficiaryDirectoryLoader } from './directory/components/beneficiary-directory-loader'
export { EvaluationCenterLookup } from './directory/components/evaluation-center-lookup'
export { BeneficiaryFormLoader } from './registration/components/beneficiary-form-loader'
export { BeneficiaryDetailLoader } from './profile/components/beneficiary-detail-loader'
export { DuplicateResolutionWorkspace } from './identity-review/components/duplicate-resolution-workspace'
export { JourneyStagesLoader } from './journey/components/journey-stages-loader'
```

`.tmp/s4b/task4-edits.json` points the seven route pages at the index:

Create `.tmp/s4b/task4-edits.json`:

```json
[
  [
    "apps/web/src/app/(dashboard)/beneficiaries/page.tsx",
    "'@/features/beneficiaries/directory/components/beneficiary-directory-loader'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/beneficiaries/new/page.tsx",
    "'@/features/beneficiaries/registration/components/beneficiary-form-loader'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/beneficiaries/[beneficiaryId]/edit/page.tsx",
    "'@/features/beneficiaries/registration/components/beneficiary-form-loader'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/beneficiaries/[beneficiaryId]/page.tsx",
    "'@/features/beneficiaries/profile/components/beneficiary-detail-loader'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/beneficiaries/evaluation-center/page.tsx",
    "'@/features/beneficiaries/directory/components/evaluation-center-lookup'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/beneficiaries/duplicates/page.tsx",
    "'@/features/beneficiaries/identity-review/components/duplicate-resolution-workspace'",
    "'@/features/beneficiaries'",
    1
  ],
  [
    "apps/web/src/app/(dashboard)/projects/[projectId]/(workspace)/journey-stages/page.tsx",
    "'@/features/beneficiaries/journey/components/journey-stages-loader'",
    "'@/features/beneficiaries'",
    1
  ]
]
```

```bash
node .tmp/s4b/replace-exact.mjs .tmp/s4b/task4-edits.json
sed -i "s/^\(const indexedFeatures: readonly string\[\] = \[.*\)\]$/\1, 'beneficiaries']/" apps/web/src/import-direction.test.ts
sed -i "s#\(optimizePackageImports: \[[^]]*\)\]#\1, '@/features/beneficiaries']#" apps/web/next.config.ts
grep -n "indexedFeatures: readonly" apps/web/src/import-direction.test.ts
grep -n "optimizePackageImports" apps/web/next.config.ts
pnpm exec biome check --write apps/web/src apps/web/next.config.ts
git grep -n "features/beneficiaries" -- 'apps/web/src/app' | cut -d: -f1,3
```

Expected: seven page edits, the two config lines, Biome fixes 3 files, and the seven pages import from the index only:

```
7 replacements in 7 files
57:const indexedFeatures: readonly string[] = ['projects', 'beneficiaries']
48:    experimental: { optimizePackageImports: ['@/features/projects', '@/features/beneficiaries'] },
Checked 671 files in <ms>. Fixed 3 files.
apps/web/src/app/(dashboard)/beneficiaries/[beneficiaryId]/edit/page.tsx:import { BeneficiaryFormLoader } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/beneficiaries/[beneficiaryId]/page.tsx:import { BeneficiaryDetailLoader } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/beneficiaries/duplicates/page.tsx:import { DuplicateResolutionWorkspace } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/beneficiaries/evaluation-center/page.tsx:import { EvaluationCenterLookup } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/beneficiaries/new/page.tsx:import { BeneficiaryFormLoader } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/beneficiaries/page.tsx:import { BeneficiaryDirectoryLoader } from '@/features/beneficiaries'
apps/web/src/app/(dashboard)/projects/[projectId]/(workspace)/journey-stages/page.tsx:import { JourneyStagesLoader } from '@/features/beneficiaries'
```

- [ ] **Step 4: Verify and compare the route bundles**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
.tmp/s4b/build-routes.sh layout
node .tmp/s4b/compare-routes.mjs .tmp/s4b/routes-pre-layout.txt .tmp/s4b/routes-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean, the two baseline `--noUnusedLocals` lines, lint clean, the web suite unchanged from Task 3, the build succeeds with Middleware at `M0` and no route differs from the pre-layout build:

```
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
Checked 1335 files in <ms>. No fixes applied.
 Test Files  227 passed (227)
      Tests  2013 passed (2013)
exit 0
ƒ Middleware                                                      <M0> kB
routes 72, different 0
$ pnpm exec biome check .
```

A build that fails with a `Module not found` for an old beneficiary path ran on a stale cache (ruling 12).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "refactor(web): lay out features/beneficiaries and merge journey-config into it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the commit succeeds with `43 files changed, 38 insertions(+), 31 deletions(-)`: 33 renames (the moved files, listed as `rename`), one `create mode` line for `features/beneficiaries/index.ts`, and 9 modified files (the seven pages, `import-direction.test.ts` and `next.config.ts`).

---

### Task 5: Records

**Files:**
- Create (gitignored): `.tmp/s4b/task5-edits.json`, `activity-s4b.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-17 rows), `docs/qad-pathways.md` (QAD-IR-01), `docs/deferred-features.md` (line 36), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 13): `scripts/sad/check.ts` already routes `apps/web/src/lib/api/**/*.ts`, `packages/shared/src/contracts/**/*.ts` and the api beneficiary, media and participants modules to `beneficiary-privacy-guardian`.

- [ ] **Step 1: Amend the change record, the living docs and the index**

Create each file with the Write tool, exactly as printed. `.tmp/s4b/task5-edits.json` holds the exact replacements (the layout paragraph in section 3.3, the S4b applied paragraph of section 9, the S4b roadmap row of section 3.7, the CR row status in `docs/index.md`, and the two living-doc paths); `@DATE@` is replaced by the day Task 5 runs:

Create `.tmp/s4b/task5-edits.json`:

```json
[
  [
    "docs/cr-pathways-codebase-modularization.md",
    "(amended 2026-10-13 for S3b).",
    "(amended 2026-10-13 for S3b).\n\nA feature whose screens fall into several concerns keeps one subfolder per concern, each with `components/` and its own `<concern>.utils.ts`, and a `<domain>.utils.ts` beside the subfolders for helpers that more than one concern uses (`features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with `beneficiaries.utils.ts`); a feature that only one other feature used is merged into it (`journey-config` into `beneficiaries/journey`) (amended @DATE@ for S4b).",
    1
  ],
  [
    "docs/cr-pathways-codebase-modularization.md",
    "Left to S5: the unused `PrismaService` parameter of `ParticipantsService` and the `beneficiaries` field name in `ImportsService`.",
    "Left to S5: the unused `PrismaService` parameter of `ParticipantsService` and the `beneficiaries` field name in `ImportsService`.\n\nS4b applied @DATE@ on the S4b slice branch:\n- Contracts: `beneficiaryResponse` (with `beneficiaryProgressResponse`), `archiveBeneficiaryResponse`, `enrollBeneficiaryResponse` and `duplicateCandidatePairResponse` (`contracts/beneficiaries/beneficiary-responses.ts`), `beneficiaryMediaItemResponse`, `beneficiaryMediaLimitsResponse` and `beneficiaryMediaReservedFileResponse` (`beneficiary-media-responses.ts`) and `journeyStageResponse`, `beneficiaryJourneyResponse`, `recordJourneyEventResponse` and `correctJourneyEventResponse` (`contracts/journeys/journey-responses.ts`) are types only and never parsed; `mapBeneficiary`, `mapStage`, the journey history and the media and identity review services return them, so a drift fails `pnpm typecheck`; `RegistrationContextResponse` is a plain type because its fields reuse `FormFieldValidationContract`.\n- Client: `lib/api/beneficiaries.ts` holds `beneficiariesClient` (9 methods), `lib/api/journeys.ts` holds `journeysClient` (5) and `lib/api/beneficiary-media.ts` holds `beneficiaryMediaClient` (5), with `beneficiaries.schema.ts` (the registration context parser from `lib/services/registration-context.ts`, `mapBeneficiary` and the age helper) and `journeys.schema.ts` (the stage and history parsers); 13 production files (28 calls), 3 client tests (18 calls) and 12 test files with 13 mock factories follow, and `pathways-client.ts` went from 1361 to 716 lines. The characterization tests ran against the old and the new clients before the old methods went.\n- Layout: the 25 files of `features/beneficiaries` and the 8 of `features/journey-config` became `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with `beneficiaries.utils.ts` and an `index.ts` that lists `BeneficiaryDirectoryLoader`, `EvaluationCenterLookup`, `BeneficiaryFormLoader`, `BeneficiaryDetailLoader`, `DuplicateResolutionWorkspace` and `JourneyStagesLoader` by leaf path; the seven route pages import the index, `import-direction.test.ts` lists `beneficiaries` among the indexed features and `optimizePackageImports` names its barrel.\n- Tests: web 224 files and 1998 tests became 227 and 2013, shared 32 files and 657 tests became 35 and 664, api unchanged at 2610 (21 skipped).\n- Routes: Middleware stayed at its Task 0 size (`M0`); Tasks 2 and 3 moved 28 routes down by 5 to 12 kB because the beneficiary code left the shared client chunk, and the layout move changed none.\n- Decisions: S4b split into S4b and S4c (ruling 1); response contracts are types only and the registration context is a plain type (rulings 2 and 3); the media upload keeps `activitiesClient.uploadActivityProofFile` (ruling 6); the loaders keep calling the clients in effects and do not move onto `useAuthorizedRead` (ruling 8); the `'5-9'` age band stays (MOD-B1).\n\nDeferred to S4c: the `ScopedBeneficiaryForm` split and its rename, the `beneficiary-detail.tsx`, `beneficiary-media-proof.tsx` and `beneficiary-directory.tsx` splits, the two oversized tests, and the audit disposition of MOD-06 for the beneficiary components.",
    1
  ],
  [
    "docs/index.md",
    "S4a, S5a and S6a applied, S4b, S5b and S6b next |",
    "S4a, S4b, S5a and S6a applied, S4c, S5b and S6b next |",
    1
  ],
  [
    "docs/cr-pathways-codebase-modularization.md",
    "S4b: web client and feature components | Provides",
    "S4b: web client, response contracts and feature layout; S4c: beneficiary component splits | Provides",
    1
  ],
  [
    "docs/qad-pathways.md",
    "apps/web/src/features/beneficiaries/duplicate-resolution-workspace.test.tsx",
    "apps/web/src/features/beneficiaries/identity-review/components/duplicate-resolution-workspace.test.tsx",
    1
  ],
  [
    "docs/deferred-features.md",
    "`apps/web/src/features/beneficiaries/beneficiary-media-proof.tsx`. | Add a review workflow",
    "`apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx`. | Add a review workflow",
    1
  ]
]
```

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g" .tmp/s4b/task5-edits.json
node .tmp/s4b/replace-exact.mjs .tmp/s4b/task5-edits.json
sed -i -e '/^| MOD-05 /s/\. |$/; beneficiary, journey and media clients by S4b. |/' \
  -e '/^| MOD-06 /s/\. |$/; beneficiary components laid out by S4b and split in S4c. |/' \
  -e '/^| MOD-15 /s/\. |$/; journey-config merged into the beneficiaries folder with a public index by S4b. |/' \
  -e '/^| MOD-17 /s/\. |$/; beneficiaries feature laid out by S4b, the Scoped name left to S4c. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
git grep -nE "features/beneficiaries/[a-z-]+\.tsx|features/journey-config" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' | cut -c1-110
```

Expected: six replacements, five docs files changed, four audit rows extended, and one leftover path: the removed-feature row `Prototype info notices` in `docs/deferred-features.md` names the files it changed on 2026-09-29, which is history and stays as written:

```
6 replacements in 4 files
 docs/audit-pathways-codebase-modularity-20261009.md |  8 ++++----
 docs/cr-pathways-codebase-modularization.md         | 14 +++++++++++++-
 docs/deferred-features.md                           |  2 +-
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  2 +-
 5 files changed, 20 insertions(+), 8 deletions(-)
ients by S3b; beneficiary, journey and media clients by S4b. |
3b; beneficiary components laid out by S4b and split in S4c. |
ed into the beneficiaries folder with a public index by S4b. |
iaries feature laid out by S4b, the Scoped name left to S4c. |
docs/deferred-features.md:20:| Prototype info notices | Removed | 2026-09-29 | Production mode: the blue expla
```

The four audit lines are the last 60 characters of the MOD-05, MOD-06, MOD-15 and MOD-17 rows.

- [ ] **Step 2: Activity log**

`.tmp/s4b/activity-s4b.md` is the S4b section of the activity log, with the commit hashes of Tasks 1 to 4 as `@H1@` to `@H4@`:

Create `.tmp/s4b/activity-s4b.md`:

```md

## @DATE@ Modularization S4b beneficiaries web (claude/modularization-s4b-9ept8o)
- Task 1 (@H1@): response contracts for the beneficiary, journey and media routes added in `packages/shared` as types only, with tests over each shape, and `mapBeneficiary`, `mapStage`, the journey history and the media, identity review and registration context services annotated so a drift fails typecheck; shared 657 to 664, api unchanged at 2610 (21 skipped).
- Task 2 (@H2@): `lib/api/beneficiaries.ts`, `journeys.ts` and `beneficiary-media.ts` with their two schema files added, generated from the methods still in `pathways-client.ts`, and `beneficiaries.test.ts`, `journeys.test.ts` and `beneficiary-media.test.ts` pinned 15 cases against the old and the new client (30 runs); web 227 files and 2028 tests.
- Task 3 (@H3@): 13 production files (28 calls), 3 client tests (18 calls) and 12 test files with 13 mock factories switched to the new clients, the 19 methods, the registration context parser and the beneficiary mappers left `pathways-client.ts` (1361 to 716 lines), and the old rows of the characterization tests were dropped; web 227 files and 2013 tests.
- Task 4 (@H4@): the 33 files of `features/beneficiaries` and `features/journey-config` moved with `git mv` into `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` (29 specifiers updated), `index.ts` added with six leaf exports, the seven route pages switched to it and `beneficiaries` added to `indexedFeatures` and `optimizePackageImports`; web 227 and 2013, routes unchanged.
- Task 5: the change record, audit, QAD and deferred features rows follow the new paths and the S4b disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and the shared contracts already route to the beneficiary privacy guardian.
- Decisions: the S4b decisions are recorded in the change record section 9; the plan stays until S4c is planned because it holds the S4c outline.
- Deferred to S4c: the `ScopedBeneficiaryForm` split and rename, the `beneficiary-detail.tsx`, `beneficiary-media-proof.tsx` and `beneficiary-directory.tsx` splits and the two oversized tests.
```

```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^refactor: add the beneficiary, journey and media response contracts')
H2=$(git log -1 --format=%h --grep='^refactor(web): add the beneficiary, journey and media clients')
H3=$(git log -1 --format=%h --grep='^refactor(web): move the beneficiary client callers')
H4=$(git log -1 --format=%h --grep='^refactor(web): lay out features/beneficiaries')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4@/$H4/" .tmp/s4b/activity-s4b.md
grep -c "@H[1-4]@\|@DATE@" .tmp/s4b/activity-s4b.md
cat .tmp/s4b/activity-s4b.md >> docs/activity-log.md
tail -9 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters):

```
0

## <date> Modularization S4b beneficiaries web (claude/modularization-s4b-9ept8o)
- Task 1 (<sha>): response contracts for the beneficiary, journey and media routes added
- Task 2 (<sha>): `lib/api/beneficiaries.ts`, `journeys.ts` and `beneficiary-media.ts` w
- Task 3 (<sha>): 13 production files (28 calls), 3 client tests (18 calls) and 12 test 
- Task 4 (<sha>): the 33 files of `features/beneficiaries` and `features/journey-config`
- Task 5: the change record, audit, QAD and deferred features rows follow the new paths an
- Decisions: the S4b decisions are recorded in the change record section 9; the plan stays
- Deferred to S4c: the `ScopedBeneficiaryForm` split and rename, the `beneficiary-detail.t
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs
git commit -m "docs: record modularization S4b

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 6 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1335 files in <ms>. No fixes applied.
[<branch> <sha>] docs: record modularization S4b
 6 files changed, 29 insertions(+), 8 deletions(-)
$ pnpm exec biome check .
```

---

### Task 6: Full release gates and push

- [ ] **Step 1: Static gates**

```bash
pnpm lint && pnpm typecheck
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s4b/build-routes.sh gates
node .tmp/s4b/compare-routes.mjs .tmp/s4b/routes-baseline.txt .tmp/s4b/routes-gates.txt | tail -4
node .tmp/s4b/compare-routes.mjs .tmp/s4b/routes-pre-layout.txt .tmp/s4b/routes-gates.txt | tail -2
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```

Expected: Biome clean, then the typecheck and test summaries of the baselines with the deltas of the Expected lines above (the `$ pnpm ...` echo lines of pnpm come between them):

```
Checked 1335 files in <ms>. No fixes applied.
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  35 passed (35)
packages/shared test:       Tests  664 passed (664)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  227 passed (227)
apps/web test:       Tests  2013 passed (2013)
      Tests  57 passed (57)
exit 0
ƒ Middleware                                                      <M0> kB
/projects/new: 303 kB -> 297 kB (-6.0)
/recommendations/[recommendationId]: 292 kB -> 293 kB (+1.0)
/settings/users: 293 kB -> 287 kB (-6.0)
routes 72, different 28
routes 72, different 0

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```

The last `docs:check` lines are the baseline (6 failures, 1 warning). The first compare is against the Task 0 build (28 routes differ, none more than 1 kB bigger) and the second against the pre-layout build (none differs). Middleware must not exceed `M0`.

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S4b changes no migration, so the CI replay of the final pull request after W1 (expect 171 PASS, 0 FAIL) is the gate when the replay cannot run here; record which one ran.

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev: open `/beneficiaries`, search, filter and page the directory; open `/beneficiaries/new`, pick a project with a published registration form and register; open a record and see its summary, journey timeline and media; add a follow-up event and correct one; add a photo (reserve, direct upload, finalize) and open it in the viewer; edit the profile (`/beneficiaries/<id>/edit`); open `/beneficiaries/duplicates` and record Keep distinct on a pair; open `/beneficiaries/evaluation-center` and search; open a project's `journey-stages` page, edit a stage and save; open the collection direct entry and search a contributor; open a project's activities workspace and see the journey stage selector fill.

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s4b
pnpm sad:check --base "$(cat .tmp/s4b/base-sha)" --head HEAD --output .tmp/sad/s4b/manifest.json > .tmp/sad/s4b/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s4b/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0, writes the manifest, and the roles and their path counts are:

```
exit 0
organization-isolation-checker 5
beneficiary-privacy-guardian 30
design-qa-agent 115
```

`.tmp/sad/s4b/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. The counts were re-measured with the S6a records commit `02b272f4` in the base (`bde243e2` holds it); a `restraint-guardian` line or a `design-qa-agent` count above 115 means `base-sha` was taken before the S6a records commit.

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s4b/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s4b/assemble.mjs`, run `node .tmp/sad/s4b/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s4b/base-sha)" --head HEAD --reviews .tmp/sad/s4b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The dry run could not dispatch the roles (no subagents in the planning copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 5 activity-log section with the gate results (per-package counts, Middleware size, replay exit code or CI result, seed results, e2e pass counts and smoke result or pending local run, SAD sign-off). The dry-run bullet, to adapt with your own numbers (they must equal the Task 0 baselines plus the deltas of the Expected lines above):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (<date>, cloud container, head <sha>): lint, typecheck and tests pass with config 19, shared 664, imports 94, api 2610 passed and 21 skipped, web 227 files and 2013 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware at M0 (102 or 103 kB in the cloud container; write the printed value); against the Task 0 build 28 routes are 1 to 12 kB smaller or 1 kB bigger and none is more than 1 kB bigger than before, against the pre-layout build none differs; no separate pull request; the final pull request after W1 carries this slice and its CI is the replay gate; local DB replay, seeds, e2e and browser smoke pending local run; SAD sign-off pending.
LOG
git add docs/activity-log.md
git commit -m "docs: record modularization S4b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one file, one line added:

```
[<branch> <sha>] docs: record modularization S4b release gate results
 1 file changed, 1 insertion(+)
```

- [ ] **Step 6: Push the slice branch**

The controller pushes the slice branch; the implementer does not. There is no separate pull request for S4b: the developer asked for one pull request into `dev` only after every slice is implemented, so none is opened here. The gate bullet of Step 5 records this; the final pull request after W1 carries this slice, with its CI (replay, lint, typecheck, test, build, SAD checks) as the replay gate. Do not merge, and do not push `dev` or `master`. (Not run in the dry run.)

- [ ] **Step 7: Keep the plan for S4c, and retire the S4 plan copy (controller only, after the final pull request merges; not part of this slice)**

The implementer does not run this step: report that `docs/superpowers/plans/*-modularization-s4-beneficiaries.md` is still listed. This plan holds the S4c outline, so its `docs/superpowers/plans` copy stays (the `docs/handoff` copy stays too). After the final pull request merges, the controller retires the S4 plan copy, which is executed and whose S4b outline this plan replaces: remove the `docs/superpowers/plans` copy and its index row only (the `docs/handoff` copy and its rows stay):

```bash
git rm -q docs/superpowers/plans/*-modularization-s4-beneficiaries.md
sed -i '/(superpowers\/plans\/[^)]*modularization-s4-beneficiaries\.md)/d' docs/index.md
git diff --stat docs/index.md | cat
grep -c "modularization-s4-beneficiaries" docs/index.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed S4 plan copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the diff stat shows the single index row removed (`1 file changed, 1 deletion(-)`), `grep -c` prints `1` (the handoff row stays), the docs check keeps the 6 baseline failures, and the commit deletes the plan copy:

```
 docs/index.md | 1 -
 1 file changed, 1 deletion(-)
1

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: remove the executed S4 plan copy
 2 files changed, 4227 deletions(-)
 delete mode 100644 docs/superpowers/plans/2026-10-13-modularization-s4-beneficiaries.md
```

---

## S4c outline (beneficiaries components, its own slice branch)

To be written as its own plan after S4b is applied; that plan's Task 0 removes the `docs/superpowers/plans` copy of this plan and its index row with a sed that matches only that row (the `docs/handoff` copy and its rows stay). Counts below were taken at the S4b tip and must be recounted in S4c Task 0. The split tools are the S3b ones: `split-module.mjs` cuts a file by declared name and `same-lines.mjs` must print `lost 0`; every split is verbatim apart from exports and imports.

- **Task 0, baseline:** recount every number below; record web Middleware (`M0`, the value Task 0 measures, 102 or 103 kB in the cloud container) and the route table; confirm `features/beneficiaries/index.ts`, the three clients and the six concern folders exist.
- **Task 1, `beneficiary-form.tsx` (1391 lines, in `registration/components`):** `ScopedBeneficiaryForm` (lines 270 to 1290, about 1020 lines) gets a purpose name (MOD-17; `BeneficiaryRegistrationForm` is the working name) and splits into hooks in `registration/hooks` (registration context read, draft state) and components (`Field`, `ToggleField`, `PreviewRow`, the form sections); `registrationAgeAtDate`, `projectRegistrationValues` and `draftFromBeneficiary` move to `registration.utils.ts` beside `registrationFieldCodes`. `BeneficiaryForm` stays the one export the loader imports.
- **Task 2, `beneficiary-detail.tsx` (1173 lines, in `profile/components`):** `BeneficiaryDetail` (lines 89 to 1036, about 950 lines) splits into summary, enrollment actions, journey timeline, notes and media entry components with a detail hook in `profile/hooks`; `SummaryRow`, `RecordList`, `StageActivityList` and `JourneyNoteList` move to `components/`.
- **Task 3, the two oversized tests:** `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.tsx` (636 lines) split by concern, each new file keeping the shared fixtures through a `test/fixtures` helper or a local one.
- **Task 4, `beneficiary-media-proof.tsx` (668 lines) and `beneficiary-directory.tsx` (565 lines):** `AddMediaDialog`, `MediaViewer` and `MediaKpi` move to `media/components/`, and the directory's `FilterSelect` to `directory/components/`. The directory's `'5-9'` age band option stays as it is (MOD-B1, behavior).
- **Task 5, records:** CR section 9 S4c disposition, audit MOD-06 and MOD-17 (the S4b "left to S4c" clauses are closed), index, activity log; SAD routing needs nothing new.
- **Task 6, gates and push:** as S4b Task 6, with the same smoke over every beneficiary, journey, media and duplicate screen and the collection and evaluation lookups that read beneficiaries. After the final pull request merges, the controller removes the `docs/superpowers/plans` copy of this plan and its index row with a sed that matches only that row.
