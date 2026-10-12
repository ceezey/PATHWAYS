# S2b Activities Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the activities web code its own client modules, feature folder layout and parts, and cut the four oversized activity components, with no change to any screen, request, response, permission decision or route bundle size.

**Architecture:** S2b is the web half of S2 (S2a, the contracts and api, is merged). The 16 activity, evidence and proof methods and the 4 extension methods leave `pathways-client.ts` for `lib/api/activities.ts` and `lib/api/activity-extensions.ts`, with the hand-written response parsers beside them and the private proof client moved next to them; callers and test mocks follow by script with exact counts. The 35 activity files of `features/projects` move to `features/projects/activities/{components,hooks}`, four components (form dialog, proof dialog, detail panel, workspace) are split by component and hook after characterization tests, two web types become the S2a contract types, `activityExtensionSchema` moves to `contracts/activities` as `activityExtensionResponse`, and the dead multipart option of `source-mutation.ts` is removed. Mechanical edits use one-off Node scripts under `.tmp/s2b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run on an exported copy of local dev `919e6641` (F1 to F4b, S1a, S2a and S1b merged), and the whole sequence was then replayed from the baseline commit by one driver script: lint, typecheck, the config, shared, imports, api and web suites, the production build and the route comparison pass, and the counts quoted below come from that replay.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.6, 3.7 and 9 including the F4a, F4b, S1a, S2a and S1b dispositions, and the "Deferred to S2b" paragraph of S2a) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for the activities web modules).

## Rulings

Controller rulings for S2b (2026-10-12). Each was checked on an exported copy of local dev `919e6641`; Task 0 recounts them.

1. **One plan, eleven tasks (0 to 10), no S2b1/S2b2 split.** The client half (Tasks 1 and 2), the layout and split half (Tasks 3 to 5) and the contract and cleanup half (Tasks 6 to 8) each end green, so a reviewer can stop at the Task 2 or Task 5 boundary. Cost if wrong: executor fatigue; run Tasks 6 to 10 as S2b2.
2. **Two client objects, two schema files, one guard.** `activitiesClient` (16 methods) in `lib/api/activities.ts` and `activityExtensionsClient` (4 methods) in `lib/api/activity-extensions.ts` keep the `PathwaysClient` method names, parameters and results. The hand-written parsers move verbatim into `lib/api/activities.schema.ts` (evidence list, activity detail and list, officers) and `lib/api/activity-proofs.schema.ts` (upload limits, reservation, finalize result); `.schema` is the nearest allowed suffix for runtime shape checks of untrusted JSON (CR 3.5). `isFiniteNonNegative` is shared with the beneficiary media limits read that stays in `pathways-client.ts`, so it moves to `lib/api/core/guards.ts` and both import it. Cost if wrong: a rename of two files.
3. **Parsers stay and keep the web view-model types; two types become contract types.** The S2 outline asked for the S2a response types "wherever the shapes match exactly". A type-level probe on the dry-run copy found exactly two exact matches: `ActivityCapabilities` equals `ActivityCapabilitiesResponse` and `AssignableProjectOfficer` equals `AssignableOfficerResponse`; they become one-line aliases in `types/pathways.ts` (Task 6), so no importer changes. The other ten differ and are reported, not cast: the web `Activity` carries `budgetAllocation` and `budgetLogged` as numbers where the response has strings, `ActivityProofUploadLimits.contentTypes` and `ActivityProofFileDeclaration.contentType` are `string` where the contract has the content type enum, `ActivityProofReservation` and `ActivityProofFinalizeResult` type the receipt as `unknown` where the contract has `SourceMutationAcknowledgement`, `ActivityProofReservedFile.contentType` is `string` where the response allows null, `EvidenceList` has two more review states and a non-null content type, `ActivityOverdueExplanation.category` is narrower than the response string, and `ActivitySummary` and the context row differ in optional and missing fields. Task 9 records the list. Cost if wrong: a later cleanup replaces a view model; nothing runs differently.
4. **Wire bodies are checked with `satisfies`, inputs keep their view-model names.** The S2 outline typed inputs as `Omit<CreateActivityRequest, 'clientMutationId'>` plus view fields, but the forms send `startDate` and `dueDate` and the client maps them to `plannedStartDate` and `plannedEndDate`, so those input types cannot be the contract types. Instead each mapped body is annotated `satisfies Omit<XRequest, 'clientMutationId'>` (create, update, transition, review) or `satisfies XRequest` (progress, overdue explanation), which fails `pnpm typecheck` on drift without changing a value, and the three extension methods take `CreateActivityExtensionRequest`, `VerifyActivityExtensionRequest` and `DecideActivityExtensionRequest` directly (their inline literal types were identical). The reservation body stays untyped because the web declaration carries `contentType: string`. Cost if wrong: remove the annotations.
5. **Characterization before removal: both clients run the same cases.** Task 1 writes `lib/api/activities.test.ts` and `activity-extensions.test.ts` as `describe.each` tables over `pathwaysClient` and the new client (36 and 8 test runs), so the cases are proven against the code being replaced before it goes; Task 2 drops the `pathwaysClient` row. The cases pin paths, encoded ids, abort signals, request bodies (planned date names, `progressPercent`, the optional session count present for `0` and absent for `undefined`), the replay receipt coming back as the receipt, the refusal without a mutation context before any request, the bodyless finalize, and the credential-free signed PUT.
6. **Mocks are repointed by script, with exact counts, and the old mock stays when it serves other methods.** 42 test files mock `@/lib/services/pathways-client`; 5 factories name an activity method inline and the others pass a shared object. `split-client-mocks.mjs` gives every such factory the matching `vi.mock('@/lib/api/activities', ...)` and `vi.mock('@/lib/api/activity-extensions', ...)` (16 and 2 new mocks in 18 files), splits or renames the inline ones, and leaves a shared-object factory in place because the object also serves other methods. Cost if wrong: a component under test sees `undefined` for a method; the Task 2 scan (`factories 40, naming 0`) and the suite catch it.
7. **`privateProofClient` moves to `lib/api/proof-inspection.ts`, and four client tests move with their code.** The 99-line client keeps its export name (7 specifiers follow by the move script). `pathways-client.evidence`, `.capabilities`, `.activity-review` and `.local-upload` tests exercise only moved code, so they move to `lib/api/` as `activities.schema.test.ts`, `activities.capabilities.test.ts`, `activities.review.test.ts` and `activity-proofs.schema.test.ts`. `pathways-client.test.ts`, `.c2-c4.test.ts` and `.project-data.test.ts` mix domains and stay.
8. **Layout.** `features/projects/activities/` holds `components/` (31 files: the activity components and tests, `evidence-panels`, `private-proof-*`), `hooks/` (4 files from the splits), `activities.reads.ts` (Task 6), `activities.utils.ts` (was `activity-utils.ts`), `activity-form.utils.ts` (was `activity-form-validation.ts`), `activity-proof.utils.ts`, `activity-proof-upload.utils.ts` and `activities.copy.ts`. The four activity expense files stay at the feature root for S6b (the S6 note of the executed S2a plan). Existing multi-export files (`activity-detail-sections.tsx`, `evidence-panels.tsx`) move as they are; the one-component-per-file rule is applied to the files the splits create. Cost if wrong: later slices repoint by path.
9. **No sub-index for `activities/`; the feature index lists the leaf paths.** The S2 outline and the S1b cross-plan ruling had `activities/index.ts` as an internal sub-index that `features/projects/index.ts` re-exports from. Measured on production builds, that shape grows `/dashboard` from 673 to 696 kB (the dashboard imports `ActivityDetailPanel` and `ActivityProofDialog` through the index) while leaf-path export lines move four routes by 1 kB after Task 3 and keep every route within 2 kB of that baseline at the end of the plan, because Next's `optimizePackageImports` follows a barrel one level. So the four activity export lines stay in `features/projects/index.ts` and point at `./activities/components/*`; the surface rule and the optimizer entry are unchanged. S3b and S6b must do the same (cross-plan list in the summary). Cost if wrong: a 23 kB bigger dashboard route.
10. **Stale `.next` breaks the barrel optimizer after a file move.** After the Task 3 moves, a production build that reuses `apps/web/.next` fails with `Module not found: Can't resolve './activity-detail-panel'` from `features/projects/index.ts` (the optimizer cache holds the old leaf paths). Every production build in this plan runs after `rm -rf apps/web/.next`. Cost if wrong: a misleading build failure.
11. **Route baselines are re-measured right before the layout task.** Tasks 1 and 2 change 16 routes already (15 shrink by 1 to 3 kB because the activity parsers leave the shared client chunk, one grows by 1 kB), so Task 3 Step 1 builds a new baseline `routes-pre-layout.txt` and compares against it; Task 0 keeps `routes-baseline.txt` for the record. Pass criteria: Middleware equals `M0`, and no route grows more than 2 kB against `routes-pre-layout.txt`.
12. **Splits are verbatim except for props, calls and signatures, and are proven line by line.** `same-lines.mjs` (trimmed lines, so indentation changes do not count) must print `lost 0` before Biome formats; the added lines are the signatures, props and hook calls it lists. Sizes after the splits: form dialog 846 to 419 lines (+ fields 387, draft hook 126), proof dialog 773 to 336 (+ upload hook 482, utils 50), detail panel 800 to 155 (+ content 361, history 242, actions 97, proof utils 45), workspace 750 to 490 (+ card 83, status summary 38, expenses hook 123, filters hook 91). The setter props `setReviewTarget`, `setExpenseOpen`, `setExplainDelayOpen`, `setExtensionOpen` and `setProgressOpen` are passed down by name so the moved JSX is unchanged. `ScopedActivityFormDialog`, `ScopedActivityProofDialog`, `OwnedReview` and `OwnedInspection` become `ActivityFormDialogContent`, `ActivityProofDialogContent`, `ActivityProofReviewDialogContent` and `PrivateProofInspectionContent` (CR 3.3). `activity-detail-panel.test.tsx`, which tests the content only, becomes `activity-detail-content.test.tsx`. Cost if wrong: review time.
13. **Reads: three hooks move, finance reads stay.** `activities.reads.ts` takes `useProjectActivitiesRead` and `useActivityDetailRead` (with the `project-activities` and `activity-detail:<id>` keys) out of `projects.reads.ts` and adds `useAssignableOfficersRead` for the officer read of the workspace; `activities.reads.test.ts` pins every resource key, permission, enabled flag and freshness. The S2 outline's `activity-update-review` key is a sensitive-draft owner kind, not a read key, and stays. The `activity-expenses`, `activity-expense-references` and `finance-budgets` reads move verbatim into `use-activity-expenses.ts`; S6b decides whether `finance-budgets` shares a key with the budget module. `getActivities`, `getActivityContext` and `getEvidence` calls in analytics, rules, collection and beneficiaries keep their own keys (their slices own them). Cost if wrong: one cache entry more or less.
14. **`categoryLabels` moves to `activities.copy.ts`.** It was exported from a dialog and imported by the detail panel; the content test's mock of the dialog drops its copy of the labels and now asserts the real ones. `definitiveRejection` and `nextDay` stay where they are (no finding names them).
15. **`activityExtensionSchema` becomes `activityExtensionResponse` in `contracts/activities/activity-extension-response.ts`.** Statuses, the `ActivityExtension` type and `activityExtensionStatuses` keep their names; the file's one relative import now reaches `../../monitoring/metric-math`. Users: `lib/api/activity-extensions.ts` (5 mentions) and the api service test (2). A shared test pins the strict shape (the web parses it at runtime). SAD routing needs no edit: `packages/shared/src/contracts/**` already routes to the privacy guardian and the file leaves the `monitoring/**` determinism glob; Task 10 reads the manifest. S7 Task 5 expects this move (its cross-plan ruling 18).
16. **Dead multipart code is removed, the key options stay.** Production never passes `options.files` (the one `execute` call with options passes `requestId`, `keyField: 'clientMeasurementId'` and `allowLegacy`), so the `files` option, its three bound checks, the `Ticket.files` field and `proofSnapshot` go (`source-mutation.ts` 356 to 315 lines). The multipart test goes and a new test pins what it also covered: the caller request id under the configured key field and the legacy record accepted only when allowed. The first line, the last line and the single `uuid.test(` of the file are unchanged, which S8 Task 0 checks.
17. **Not done in S2b (recorded in CR section 9):** the activity read keys of analytics, rules board, collection, beneficiary loaders and the review workspace (their slices); the `finance-*` read keys (S6); `definitiveRejection` and `nextDay`; splitting `activity-detail-sections.tsx` and `evidence-panels.tsx` into one component per file; the dialog restyle (F4b found no raw `DialogContent` to replace); `recoverSourceMutation`, which keeps its activity branches in `pathways-client.ts`.
18. **Spec facts corrected by the baseline:** `pathways-client.ts` is 2395 lines after S1b (not 2596); 49 files mention the 20 methods (25 production), with 87 `pathwaysClient.<method>` calls in 29 files (23 production); there are 42 `pathways-client` mock factories (not 49) and 18 test files need the new mocks; the activity files in `features/projects` are 35 (94 tracked files in the whole folder tree).
19. Cross-plan: the names later slices consume are listed under Produces. Later plan lines that must change before those slices run: S3 (outline Task 2: the indicators `index.ts` that the feature index re-exports becomes leaf export lines in `features/projects/index.ts`, ruling 9; Task 0 expected counts: `activity-detail-panel.tsx:3` becomes `activities/components/activity-detail-content.tsx:2` plus `activity-detail-panel.tsx:2`, and `activity-detail-sections.tsx:3` moves to `activities/components/`; Task 4: the web `ProjectIndicator` importers are seven files, not six; Task 1 mock list: `project-activities-rbac` and `project-activities-workspace` tests live in `features/projects/activities/components/`); S4 (outline Task 2: `beneficiary-media-proof.tsx` calls `activitiesClient.uploadActivityProofFile`, a signed upload `PUT` with no activity data, and `getBeneficiaryMediaLimits` needs `isFiniteNonNegative` from `@/lib/api/core/guards`); S6 (Interfaces and outline Task 5: `activity-detail-content.tsx` imports the expense dialogs and `activities/hooks/use-activity-expenses.ts` holds the `finance-budgets` read that sat in the workspace, the budget module imports `../activities/activities.utils` and `../activities/activities.reads`, and `budget/` gets no sub-index); S7 (outline Task 5: the extension schema move is S2b Task 7, not Task 4); S8 (ruling 17: `source-mutation.ts` is edited by S2b Task 8, not Task 5, and the `project-activities-rbac` and `project-activities-workspace` tests are under `features/projects/activities/components/`); `.tmp/handoff/s-plans/cross-plan-review.md` (check 8 and Fix 11: Task 5 becomes Task 8). Cost if wrong: a later Task 0 stops on a missing path or count, or a route grows 23 kB.

## Interfaces assumed from earlier sub-projects

- S2a (from `@pathways/shared`): `ActivityCapabilitiesResponse`, `AssignableOfficerResponse`, `CreateActivityRequest`, `UpdateActivityRequest`, `TransitionActivityRequest`, `RecordActivityProgressRequest`, `RecordOverdueExplanationRequest`, `ReviewActivityUpdateRequest`, `CreateActivityExtensionRequest`, `VerifyActivityExtensionRequest`, `DecideActivityExtensionRequest` (all under `packages/shared/src/contracts/activities`).
- S1b: `requestSourceMutation<T>(path, method, body, context, parse)` in `apps/web/src/lib/api/core/source-mutation-request.ts`; `projectsClient`; `apps/web/src/features/projects/index.ts` with the layout `components/`, `team/`, `projects.reads.ts`, `projects.utils.ts`; `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`; `experimental.optimizePackageImports: ['@/features/projects']` in `apps/web/next.config.ts`.
- F4b: `PathwaysClientError`, `requestFoundation`, `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts`; `useAuthorizedRead` from `apps/web/src/hooks/use-authorized-read.ts`.

## Produces (names later plans consume)

- `activitiesClient` in `apps/web/src/lib/api/activities.ts`: `getActivityContext(projectId, signal?)`, `getActivities(projectId, signal?)`, `getActivity(projectId, activityId, signal?)`, `getAssignableProjectOfficers(projectId, signal?)`, `createActivity(input, context?)`, `updateActivity(input, context?)`, `transitionActivity(projectId, activityId, status, expectedUpdatedAt, reason?, context?)`, `recordActivityProgress(input)`, `recordOverdueExplanation(input)`, `getActivityProofUploadLimits(projectId)`, `reserveActivityProofUpload(input)`, `uploadActivityProofFile(uploadUrl, file)`, `finalizeActivityProofFile(projectId, activityId, updateId, evidenceId)`, `reviewActivityUpdate(projectId, activityId, updateId, decision, reason, expectedUpdatedAt, context?)`, `downloadActivityProof(projectId, activityId, evidenceId)`, `getEvidence(projectId)`; same parameters and results as the `PathwaysClient` methods they replace.
- `activityExtensionsClient` in `apps/web/src/lib/api/activity-extensions.ts`: `listActivityExtensions`, `requestActivityExtension`, `verifyActivityExtension`, `decideActivityExtension`.
- `parseEvidenceList`, `parseActivity`, `parseActivitySummaries`, `parseAssignableProjectOfficers` from `lib/api/activities.schema.ts`; `parseActivityProofUploadLimits`, `parseActivityProofReservation`, `parseActivityProofFinalizeResult` from `lib/api/activity-proofs.schema.ts`; `isFiniteNonNegative(value: unknown): value is number` from `lib/api/core/guards.ts`; `privateProofClient`, `PrivateProofContext`, `PrivateProofFile` from `lib/api/proof-inspection.ts`.
- `activityExtensionResponse`, `ActivityExtension`, `ActivityExtensionStatus`, `activityExtensionStatuses` from `@pathways/shared` (file `contracts/activities/activity-extension-response.ts`).
- Feature: `features/projects/activities/` as in ruling 8; `useProjectActivitiesRead(projectId, enabled?)`, `useActivityDetailRead(projectId, activityId)` and `useAssignableOfficersRead(projectId, permission, enabled)` from `activities/activities.reads.ts`; `ActivityDetailContent` from `components/activity-detail-content.tsx`; `categoryLabels` from `activities.copy.ts`; `features/projects/index.ts` exports `ActivityDetailPage`, `ActivityDetailPanel`, `ActivityProofDialog` and `ProjectActivitiesWorkspace` from their `./activities/components/*` leaf paths.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request or response shape changes. The only removals are the dead multipart option of ruling 16 and the moved or aliased duplicates. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; every file outside `features/projects` imports it only through its index.
- File moves use `git mv` (the move script does it); the verbatim splits are checked with `.tmp/s2b/same-lines.mjs` (`lost 0`) before Biome formats the new files.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s2b/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each task: it must list only the two lines that exist on dev (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- Run `rm -rf apps/web/.next` before every production build (ruling 10).
- Mock factories name modules by the specifier the code under test imports; after Task 2 an activity method is mocked on `@/lib/api/activities` or `@/lib/api/activity-extensions`, never on `pathwaysClient`.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s2b/` (gitignored) and are never committed; build logs go there too.
- Expected test counts are cumulative from Task 0 and are stated at the end of each task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s2b-activities-web`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push. Do not touch `apps/api` production code, migrations, seeds, `.env` files or review evidence; under `apps/api` only the one test import of Task 7 changes.

## Review Focus

1. A replayed create, update, transition or review must come back as the receipt and never run through the activity parser, and a call without a mutation context must refuse before any request. Task 1 pins both on every mutation, against the old and the new client.
2. A stored activity form draft must restore only values of the right type and size, drop officers and stages the project no longer offers, and never restore a draft saved for another project; typing must write the draft and returning to the starting values must remove it. Task 4 adds `activity-form-dialog.draft.test.tsx` before the effects move to a hook.
3. The expense rows given to the open activity must be exactly the unrejected expenses linked to it through the references or the budget lines the viewer may read, and a change must reread the expenses, the references and the activity. Task 5 adds `project-activities-workspace.expenses.test.tsx` before the reads move to a hook.
4. A test stub left on `pathwaysClient` would hand a component `undefined` at run time, and the signed upload `PUT` must still carry no credentials. Task 2 scans every factory (`factories 40, naming 0`) and the Task 1 tests pin the `PUT` options.
5. A route bundle must not grow when files move behind the index, and a stale `apps/web/.next` fails the barrel optimizer with a misleading error. Task 3 compares a freshly measured baseline, Task 10 compares again, and every build removes `.next` first.

## File map

| Path | Role after S2b |
|---|---|
| `apps/web/src/lib/api/activities.ts` | `activitiesClient` (new, Task 1) |
| `apps/web/src/lib/api/activity-extensions.ts` | `activityExtensionsClient` (new, Task 1) |
| `apps/web/src/lib/api/activities.schema.ts`, `activity-proofs.schema.ts` | hand-written response parsers (new, Task 1) |
| `apps/web/src/lib/api/core/guards.ts` | `isFiniteNonNegative` (new, Task 1) |
| `apps/web/src/lib/api/proof-inspection.ts` | `privateProofClient` (moved, Task 2) |
| `apps/web/src/lib/services/pathways-client.ts` | loses the 20 methods and the activity parsers (2395 to 1521 lines, Task 2) |
| `apps/web/src/features/projects/activities/` | components, hooks, reads, utils, copy (Tasks 3 to 6) |
| `packages/shared/src/contracts/activities/activity-extension-response.ts` | moved from `monitoring/activity-extension.ts` (Task 7) |
| `apps/web/src/lib/services/source-mutation.ts` | dead multipart option removed (Task 8) |

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s2b-activities-web.md` (this plan)
- Delete: `docs/superpowers/plans/2026-10-12-modularization-s2-activities.md` (S2a is executed and its outline is replaced by this plan)
- Modify: `docs/index.md` (section 1.6 plan rows)

- [ ] **Step 1: Confirm local dev contains F4b, S1a, S2a and S1b, and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers into dev"
git log --oneline dev | grep -m1 "Merge refactor/s1a-projects-core into dev"
git log --oneline dev | grep -m1 "Merge refactor/s2a-activities into dev"
git log --oneline dev | grep -m1 "Merge refactor/s1b-projects-web into dev"
test -f apps/web/src/lib/api/core/source-mutation-request.ts && test -f apps/web/src/lib/api/projects.ts && test -f apps/web/src/features/projects/index.ts && test -f packages/shared/src/contracts/activities/activity-responses.ts && test -f packages/shared/src/contracts/common/source-mutation-acknowledgement.ts && echo "S1b and S2a outputs present"
grep -c "indexedFeatures\|surfaceViolation" apps/web/src/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
ls docs/superpowers/plans/
git checkout -b refactor/s2b-activities-web
pnpm install --frozen-lockfile
mkdir -p .tmp/s2b/files
```

Expected: clean status, the four merge commits, `S1b and S2a outputs present`, a count of at least `3` for the first grep and `1` for the second, install succeeds. If a merge commit or an output is missing, stop and report: S2b builds on F4b, S1a, S2a and S1b. If `ls` lists another S-plan, leave it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s2b/web-build-baseline.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s2b/web-build-baseline.log | sed -n '/Route (app)/,$p' > .tmp/s2b/routes-baseline.txt
grep -E "Middleware" .tmp/s2b/routes-baseline.txt
git hash-object apps/web/src/lib/services/pathways-client.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/private-proof-client.ts apps/web/src/features/projects/index.ts apps/web/src/features/projects/projects.reads.ts apps/web/src/features/projects/project-activities-workspace.tsx apps/web/src/features/projects/activity-detail-panel.tsx apps/web/src/features/projects/activity-form-dialog.tsx apps/web/src/features/projects/activity-proof-dialog.tsx apps/web/src/types/pathways.ts packages/shared/src/monitoring/activity-extension.ts packages/shared/src/index.ts apps/web/src/features/ui-copy-cleanup.contract.test.ts
wc -l < apps/web/src/lib/services/pathways-client.ts
git grep -lE "\b(getActivityContext|getActivities|getActivity|getAssignableProjectOfficers|createActivity|updateActivity|transitionActivity|recordActivityProgress|recordOverdueExplanation|listActivityExtensions|requestActivityExtension|verifyActivityExtension|decideActivityExtension|reviewActivityUpdate|downloadActivityProof|getEvidence|getActivityProofUploadLimits|reserveActivityProofUpload|uploadActivityProofFile|finalizeActivityProofFile)\b" -- apps/web/src | wc -l
git grep -lE "vi\.mock\('@/lib/services/pathways-client'" -- apps/web/src | wc -l
ls apps/web/src/features/projects | grep -cE "^(activity-|evidence-panels|private-proof-|project-activities-)"
git ls-files apps/web/src/features/projects | wc -l
git grep -c "activityExtensionSchema" -- apps packages
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing counts and the web `Test Files` and `Tests`: config 19, shared 273 (23 files), imports 91, api 2429 with 21 skipped, web 216 files and 1943 tests (`B_web`), sad 53 (`B_sad`); the docs check failure count (6 failures and 1 warning on the dry-run copy); the web build exit code 0, `Middleware` 102 kB (`M0`) . `.tmp/s2b/routes-baseline.txt` is the table Task 10 compares against for the record. The hashes print, in order: `5e92413e33e2e3fa1f0c03bf5c74a0f8a7918227`, `0ae800ce6981ba3b33e92eace0cfc5a2237638bd`, `cd722d05d0b4cc057e5ab88a69657a04a3482c70`, `11fea8419168fd5455604593b320243bc4a283f5`, `e58fe9faa002698e78deeaf4384550249ed03f96`, `6760b711b97baa3f1f71230dd7c7f4628dd6c917`, `202419d09ee7e779e7058e8b8ca171e45b434540`, `bc1d202772b17c55fbc7d61986ccf5dec9cf809c`, `6e1cab4069753062e364f3ef1ab8c05f65874752`, `ce2ad8442794ed752b2543b7974bfb40ce33af3e`, `791d5cf42376ec207c0eb6a308bffe47185dd5e8`, `09299a3a460e333df36651993217c9ec14bace7c`, `2a23f48755ef4866ce8bd21e517ad8640d111f11`; the counts print `2395`, `49`, `42`, `39` (35 activity files and the 4 expense files), `94`, and three `activityExtensionSchema` lines (the api service test `:2`, `pathways-client.ts:5` and the shared file `:2`). If any hash or count differs, stop and report: the anchors, scripts and counts below were taken at `919e6641`.

- [ ] **Step 3: Replace the S2 plan with this one and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s2b-activities-web.md`.

In `docs/index.md` section 1.6, delete the S2 plan row and add as the last row of the table:

```markdown
| [S2b activities web plan](superpowers/plans/2026-10-12-modularization-s2b-activities-web.md) | 2026-10-12-modularization-s2b-activities-web.md | 2026-10-12 | S2b of the codebase modularization: activities and extensions clients, proof inspection client, activities feature folder, four oversized components split, shared extension contract, dead multipart code removed | In progress |
```

```bash
git rm docs/superpowers/plans/2026-10-12-modularization-s2-activities.md
git add docs/superpowers/plans/2026-10-12-modularization-s2b-activities-web.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S2b activities web plan and retire the S2 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: The activities clients, with tests that run against the old and the new code

**Files:**
- Create (gitignored): `.tmp/s2b/activity-blocks.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `moved-original.mjs`, `build-activity-clients.mjs`, `type-request-bodies.mjs`
- Create: `apps/web/src/lib/api/activities.ts`, `activity-extensions.ts`, `activities.schema.ts`, `activity-proofs.schema.ts`, `core/guards.ts`
- Test: `apps/web/src/lib/api/activities.test.ts`, `apps/web/src/lib/api/activity-extensions.test.ts`

**Interfaces:**
- Consumes: `requestFoundation`, `requestFoundationResponse`, `PathwaysClientError` from `@/lib/api/core/request`; `requestSourceMutation` from `@/lib/api/core/source-mutation-request`; `SourceMutationContext`, `SourceMutationResult` from `@/lib/services/source-mutation`; the S2a request contracts; `activityExtensionSchema` from `@pathways/shared` (renamed in Task 7).
- Produces: `activitiesClient` and `activityExtensionsClient` with the methods listed under Produces, `isFiniteNonNegative` from `@/lib/api/core/guards`, and the seven parsers of ruling 2. `pathwaysClient` keeps its own copies of every method and parser until Task 2, so this task changes no caller.

- [ ] **Step 1: Create the scripts**

Create each file with the Write tool.

`.tmp/s2b/activity-blocks.mjs` (the anchors that locate the activity parsers, class methods and interface members inside `pathways-client.ts`; the build, the verbatim check and Task 2's removal all use them):

```js
// Shared anchors that locate the activity parsers, class methods and interface members inside pathways-client.ts.
export const clientFile = 'apps/web/src/lib/services/pathways-client.ts'

export const activityMethods = [
  'getActivityContext',
  'getActivities',
  'getActivity',
  'getAssignableProjectOfficers',
  'createActivity',
  'updateActivity',
  'transitionActivity',
  'recordActivityProgress',
  'recordOverdueExplanation',
  'reviewActivityUpdate',
  'downloadActivityProof',
  'getEvidence',
  'getActivityProofUploadLimits',
  'reserveActivityProofUpload',
  'uploadActivityProofFile',
  'finalizeActivityProofFile',
]
export const extensionMethods = [
  'listActivityExtensions',
  'requestActivityExtension',
  'verifyActivityExtension',
  'decideActivityExtension',
]

// Text blocks that run from a start anchor up to, not including, an end anchor.
export const parserBlocks = {
  evidence: ['const evidenceStatuses = new Set(', 'export interface AssessmentDetail {'],
  activityA: ['const activityResponseKeys = [', 'const MAX_ACTIVITY_PROOF_FILES = 10'],
  proofs: ['const MAX_ACTIVITY_PROOF_FILES = 10', 'function parseActivity(value: unknown): Activity {'],
  activityB: ['function parseActivity(value: unknown): Activity {', 'function parseJourneyStage('],
}
export const extensionPathLine =
  'const extensionPath = (projectId: string, activityId: string) =>\n  `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/extension-requests`\n\n'
export const proofRoutesComment = '  // Proof uploads use the reserve, signed upload and finalize routes below.\n\n'
export const proofSectionComment =
  '\n  // --- Direct-upload activity proof (cr-pathways-activity-progress-media). New section: do not\n  // reorder or reformat the rest of this interface when editing these members. ---\n'

// Returns the text between two anchors, throwing when either is missing.
export function between(text, start, end) {
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`missing start: ${start}`)
  const to = text.indexOf(end, from + start.length)
  if (to < 0) throw new Error(`missing end: ${end}`)
  return text.slice(from, to)
}

// The class method block: leading comment lines, the declaration and its closing brace line.
export function methodBlock(text, name) {
  const marker = `\n  async ${name}(`
  const at = text.indexOf(marker)
  if (at < 0) throw new Error(`missing method ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    const line = text.slice(previous + 1, start - 1)
    if (!line.startsWith('  //')) break
    start = previous + 1
  }
  const close = text.indexOf('\n  }\n', at)
  if (close < 0) throw new Error(`unterminated method ${name}`)
  return { start, end: close + 5, text: text.slice(start, close + 5) }
}

// The interface member block: from `  name(` to the line before the next member, comment or closing brace.
export function memberBlock(text, name) {
  const marker = `\n  ${name}(`
  const at = text.indexOf(marker)
  if (at < 0) throw new Error(`missing member ${name}`)
  let start = at + 1
  for (;;) {
    const previous = text.lastIndexOf('\n', start - 2)
    const line = text.slice(previous + 1, start - 1)
    if (!line.startsWith('  //')) break
    start = previous + 1
  }
  const next = /\n(?:  [A-Za-z]+\(|  \/\/|\})/g
  next.lastIndex = at + marker.length
  const end = next.exec(text)
  if (!end) throw new Error(`unterminated member ${name}`)
  return { start, end: end.index + 1, text: text.slice(start, end.index + 1) }
}
```

`.tmp/s2b/trim-imports.mjs` (drops named imports that no longer appear in the file body, ignoring comments and quoted strings, and prints their names; used by every later task):

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

`.tmp/s2b/same-lines.mjs` (fails when a line of the original is lost, ignoring order, blanks, indentation and `export`; prints how many lines the new files add and lists them with `--list`):

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

`.tmp/s2b/moved-original.mjs` (writes the text of every moved block of `pathways-client.ts` to one file so `same-lines.mjs` can compare it with the new modules):

```js
// Writes the text of every activity block of pathways-client.ts to one file so same-lines.mjs can compare it with the new modules.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  activityMethods,
  between,
  clientFile,
  extensionMethods,
  extensionPathLine,
  methodBlock,
  parserBlocks,
} from './activity-blocks.mjs'

const [out, source = clientFile] = process.argv.slice(2)
const text = readFileSync(source, 'utf8')
const parts = Object.values(parserBlocks).map(([start, end]) => between(text, start, end))
parts.push(extensionPathLine)
for (const name of [...activityMethods, ...extensionMethods])
  parts.push(methodBlock(text, name).text.replace(/\n$/, ','))
writeFileSync(out, parts.join('\n'))
console.log(`blocks written: ${parts.length}`)
```

`.tmp/s2b/build-activity-clients.mjs` (copies the parsers and the methods out of `pathways-client.ts` into the new modules, verbatim; class methods become object methods):

```js
// Copies the activity parsers and methods out of pathways-client.ts into the new lib/api modules, verbatim.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  activityMethods,
  between,
  clientFile,
  extensionMethods,
  extensionPathLine,
  methodBlock,
  parserBlocks,
  proofRoutesComment,
} from './activity-blocks.mjs'

const api = 'apps/web/src/lib/api'
const text = readFileSync(clientFile, 'utf8')
const block = (name) => between(text, ...parserBlocks[name])

// Gives the parsers other modules call an export keyword.
const exported = (source, names) =>
  names.reduce(
    (result, name) =>
      result.replace(new RegExp(`^function ${name}\\(`, 'm'), `export function ${name}(`),
    source,
  )

const activitiesSchema = `import { overdueExplanationCategories } from '@pathways/shared'

import { PathwaysClientError } from '@/lib/api/core/request'
import type {
  Activity,
  ActivityCapabilities,
  ActivityOverdueExplanation,
  ActivitySummary,
  AssignableProjectOfficer,
  EvidenceList,
  EvidenceRecord,
} from '@/types/pathways'

${block('evidence')}${exported(block('activityA'), ['parseAssignableProjectOfficers'])}${exported(block('activityB'), ['parseActivity', 'parseActivitySummaries'])}`
writeFileSync(`${api}/activities.schema.ts`, `${activitiesSchema.trimEnd()}\n`)

const guardLines = `const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

`
const proofBody = exported(block('proofs'), ['parseActivityProofUploadLimits', 'parseActivityProofReservation', 'parseActivityProofFinalizeResult'])
if (!proofBody.includes(guardLines)) throw new Error('missing the isFiniteNonNegative guard')

const proofsSchema = `import { PathwaysClientError } from '@/lib/api/core/request'
import { isFiniteNonNegative } from '@/lib/api/core/guards'
import { webEnv } from '@/lib/env'
import type {
  ActivityProofFinalizeResult,
  ActivityProofReservation,
  ActivityProofReservedFile,
  ActivityProofUploadLimits,
} from '@/types/pathways'

import { parseActivity } from './activities.schema'

${proofBody.replace(guardLines, '')}`
writeFileSync(`${api}/activity-proofs.schema.ts`, `${proofsSchema.trimEnd()}\n`)
writeFileSync(`${api}/core/guards.ts`, `export ${guardLines.trimEnd()}\n`)

// Class methods become object methods separated by commas.
const methods = (names) =>
  names
    .map((name) => {
      const found = methodBlock(text, name).text.replace(/\n$/, '')
      return found.replace(/^\n+/, '')
    })
    .join(',\n\n')

const first = activityMethods.slice(0, activityMethods.indexOf('reviewActivityUpdate'))
const last = activityMethods.slice(
  activityMethods.indexOf('reviewActivityUpdate'),
  activityMethods.indexOf('getActivityProofUploadLimits'),
)
const proof = activityMethods.slice(activityMethods.indexOf('getActivityProofUploadLimits'))
const beforeProof = methods(first)
const rereads = methods(last)
const proofMethods = methods(proof)
const client = `import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import type { SourceMutationContext, SourceMutationResult } from '@/lib/services/source-mutation'
import type {
  Activity,
  ActivityProofFinalizeResult,
  ActivityProofReservation,
  ActivityProofUploadLimits,
  ActivitySummary,
  AssignableProjectOfficer,
  CreateActivityInput,
  EvidenceList,
  RecordActivityProgressInput,
  RecordOverdueExplanationInput,
  ReserveActivityProofUploadInput,
  UpdateActivityInput,
} from '@/types/pathways'

import {
  parseActivity,
  parseActivitySummaries,
  parseAssignableProjectOfficers,
  parseEvidenceList,
} from './activities.schema'
import {
  parseActivityProofFinalizeResult,
  parseActivityProofReservation,
  parseActivityProofUploadLimits,
} from './activity-proofs.schema'

export const activitiesClient = {
${beforeProof},

${proofRoutesComment}${proofMethods},

${rereads},
}
`
writeFileSync(`${api}/activities.ts`, client)

const extensions = `import { activityExtensionSchema } from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'

${extensionPathLine}export const activityExtensionsClient = {
${methods(extensionMethods)},
}
`
writeFileSync(`${api}/activity-extensions.ts`, extensions)
console.log('written: activities.schema.ts, activity-proofs.schema.ts, activities.ts, activity-extensions.ts')
```

`.tmp/s2b/type-request-bodies.mjs` (annotates the mapped wire bodies with `satisfies` and gives the extension inputs their contract types; it changes no value):

```js
// Checks each wire body of the new clients against its shared request contract with satisfies, changing no value.
import { readFileSync, writeFileSync } from 'node:fs'

const api = 'apps/web/src/lib/api'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 60)}`)
  return text.replace(from, to)
}

let activities = readFileSync(`${api}/activities.ts`, 'utf8')
activities = replaceOnce(
  activities,
  "import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'\n",
  "import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'\nimport type { CreateActivityRequest, RecordActivityProgressRequest, RecordOverdueExplanationRequest, ReviewActivityUpdateRequest, TransitionActivityRequest, UpdateActivityRequest } from '@pathways/shared'\n",
)
// The create body ends at journeyStageId; the update body continues with expectedUpdatedAt.
activities = replaceOnce(
  activities,
  "        journeyStageId: input.journeyStageId,\n      },\n      context,",
  "        journeyStageId: input.journeyStageId,\n      } satisfies Omit<CreateActivityRequest, 'clientMutationId'>,\n      context,",
)
activities = replaceOnce(
  activities,
  "        expectedUpdatedAt: input.expectedUpdatedAt,\n      },\n      context,",
  "        expectedUpdatedAt: input.expectedUpdatedAt,\n      } satisfies Omit<UpdateActivityRequest, 'clientMutationId'>,\n      context,",
)
activities = replaceOnce(
  activities,
  '      { status, expectedUpdatedAt, reason },\n',
  "      { status, expectedUpdatedAt, reason } satisfies Omit<TransitionActivityRequest, 'clientMutationId'>,\n",
)
activities = replaceOnce(
  activities,
  '      { decision, reason, expectedUpdatedAt },\n',
  "      { decision, reason, expectedUpdatedAt } satisfies Omit<ReviewActivityUpdateRequest, 'clientMutationId'>,\n",
)
activities = replaceOnce(
  activities,
  '            progressPercent: input.progress,\n            note: input.note,\n          }),',
  '            progressPercent: input.progress,\n            note: input.note,\n          } satisfies RecordActivityProgressRequest),',
)
activities = replaceOnce(
  activities,
  '            explanation: input.explanation,\n          }),',
  '            explanation: input.explanation,\n          } satisfies RecordOverdueExplanationRequest),',
)
writeFileSync(`${api}/activities.ts`, activities)

let extensions = readFileSync(`${api}/activity-extensions.ts`, 'utf8')
extensions = replaceOnce(
  extensions,
  "import { activityExtensionSchema } from '@pathways/shared'\n",
  "import {\n  type CreateActivityExtensionRequest,\n  type DecideActivityExtensionRequest,\n  type VerifyActivityExtensionRequest,\n  activityExtensionSchema,\n} from '@pathways/shared'\n",
)
extensions = replaceOnce(
  extensions,
  'input: { requestedEndDate: string; reason: string; clientMutationId: string },',
  'input: CreateActivityExtensionRequest,',
)
extensions = replaceOnce(
  extensions,
  "input: { decision: 'VERIFY' | 'RETURN'; note: string; expectedUpdatedAt: string },",
  'input: VerifyActivityExtensionRequest,',
)
extensions = replaceOnce(
  extensions,
  "input: {\n      decision: 'APPROVE' | 'DECLINE'\n      note: string\n      expectedUpdatedAt: string\n      activityExpectedUpdatedAt: string\n      clientMutationId: string\n    },",
  'input: DecideActivityExtensionRequest,',
)
writeFileSync(`${api}/activity-extensions.ts`, extensions)
console.log('typed 6 activity bodies and 3 extension inputs')
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/lib/api/activities.test.ts`. It mocks only `requestFoundation` and `requestFoundationResponse` (so the real tickets run), and runs every case against `pathwaysClient` and `activitiesClient`:

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

import { PathwaysClientError } from '@/lib/api/core/request'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { sourceMutationTickets } from '@/lib/services/source-mutation'
import { activitiesClient } from './activities'

const projectId = '75100000-0000-4000-8000-000000000001'
const activityId = '75100000-0000-4000-8000-000000000002'
const updateId = '75100000-0000-4000-8000-000000000003'
const evidenceId = '75100000-0000-4000-8000-000000000004'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const base = `/projects/${projectId}/activities`

const detail = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: 'Synthetic description',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  assignedUserIds: [],
  assignedTo: [],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  beneficiariesReached: 0,
  budgetAllocation: null,
  progress: 20,
  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
  overdueExplanationNeeded: false,
  updatedAt: '2026-09-28T00:00:00.000Z',
}

// Answers like the API: the receipt echoes the request id the client generated.
const acknowledge = (replayed: boolean) => async (_path: string, init: RequestInit) => {
  const sent = JSON.parse(String(init.body)) as { clientMutationId: string }
  const receipt = { requestId: sent.clientMutationId, committed: true, replayed }
  return replayed ? receipt : { ...detail, sourceAcknowledgement: receipt }
}

// The same cases run against the PathwaysClient methods until Task 2 removes them.
const clients: Array<[string, typeof activitiesClient]> = [
  ['pathwaysClient', pathwaysClient],
  ['activitiesClient', activitiesClient],
]

describe.each(clients)('%s activity requests', (_name, client) => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    request.requestFoundation.mockReset()
    request.requestFoundationResponse.mockReset()
  })

  it('reads the context rows with the abort signal and keeps only id, title and stage', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([
      { id: 'a-1', title: 'First', journeyStageId: 's-1', status: 'IN_PROGRESS' },
    ])
    await expect(client.getActivityContext(projectId, signal)).resolves.toEqual([
      { id: 'a-1', title: 'First', journeyStageId: 's-1' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/context`, { signal })
  })

  it.each([
    ['a non-list', { rows: [] }],
    ['a row without a stage', [{ id: 'a-1', title: 'First' }]],
    [
      'more than 100 rows',
      Array.from({ length: 101 }, () => ({ id: 'a', title: 't', journeyStageId: 's' })),
    ],
  ])('refuses %s as the context answer', async (_label, answer) => {
    request.requestFoundation.mockResolvedValue(answer)
    await expect(client.getActivityContext(projectId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid activity context response.',
    })
  })

  it('reads the list and one activity with encoded ids and the abort signal', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValueOnce([])
    await client.getActivities('a/b c', signal)
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/projects/a%2Fb%20c/activities', {
      signal,
    })
    request.requestFoundation.mockResolvedValueOnce(detail)
    await expect(client.getActivity(projectId, 'x/y', signal)).resolves.toMatchObject({
      id: activityId,
    })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${base}/x%2Fy`, { signal })
  })

  it('rejects an activity answer without an id', async () => {
    request.requestFoundation.mockResolvedValue({ ...detail, id: undefined })
    await expect(client.getActivity(projectId, activityId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid activity response.',
    })
  })

  it('reads the assignable officers and keeps only user id and display name', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([{ userId: 'u-1', displayName: 'Ana Cruz' }])
    await expect(client.getAssignableProjectOfficers(projectId, signal)).resolves.toEqual([
      { userId: 'u-1', displayName: 'Ana Cruz' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/assignable-officers`, {
      signal,
    })
    request.requestFoundation.mockResolvedValue([{ userId: 'u-1', displayName: 'Ana', email: 'x' }])
    await expect(client.getAssignableProjectOfficers(projectId)).rejects.toMatchObject({
      message: 'Invalid officer response.',
    })
  })

  it('creates with the planned date names, the request id and the ownership check', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    const result = await client.createActivity(
      {
        projectId,
        title: 'New',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        targetBeneficiaries: 5,
        budgetAllocation: '100.00',
        assignedUserIds: ['u-1'],
        indicatorIds: ['i-1'],
        journeyStageId: null,
      },
      context,
    )
    expect(result).toMatchObject({ id: activityId })
    const [path, init, isCurrent] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(base)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      title: 'New',
      description: 'Described',
      plannedStartDate: '2026-03-01',
      plannedEndDate: '2026-04-01',
      targetBeneficiaries: 5,
      budgetAllocation: '100.00',
      assignedUserIds: ['u-1'],
      indicatorIds: ['i-1'],
      journeyStageId: null,
      clientMutationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('refuses to create without a mutation context', async () => {
    await expect(
      client.createActivity({
        projectId,
        title: 'New',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        assignedUserIds: [],
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('patches an update with the expected revision and returns a replay receipt as it is', async () => {
    request.requestFoundation.mockImplementation(acknowledge(true))
    const result = await client.updateActivity(
      {
        projectId,
        id: activityId,
        title: 'Edited',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        assignedUserIds: [],
        expectedUpdatedAt: detail.updatedAt,
      },
      context,
    )
    expect(result).toMatchObject({ committed: true, replayed: true })
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toMatchObject({
      title: 'Edited',
      plannedStartDate: '2026-03-01',
      plannedEndDate: '2026-04-01',
      expectedUpdatedAt: detail.updatedAt,
    })
  })

  it('transitions with the status, reason and revision', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    await client.transitionActivity(
      projectId,
      activityId,
      'CANCELLED',
      detail.updatedAt,
      'No longer needed',
      context,
    )
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}/transition`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({
      status: 'CANCELLED',
      expectedUpdatedAt: detail.updatedAt,
      reason: 'No longer needed',
    })
  })

  it('reviews an update with the decision, reason and revision', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    await client.reviewActivityUpdate(
      projectId,
      activityId,
      updateId,
      'RETURN',
      'Needs a clearer photo',
      detail.updatedAt,
      context,
    )
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}/updates/${updateId}/review`)
    expect(JSON.parse(init.body)).toMatchObject({
      decision: 'RETURN',
      reason: 'Needs a clearer photo',
      expectedUpdatedAt: detail.updatedAt,
    })
  })

  it('records progress under the progressPercent name', async () => {
    request.requestFoundation.mockResolvedValue(detail)
    await client.recordActivityProgress({
      projectId,
      activityId,
      clientUpdateId: updateId,
      progress: 40,
      note: 'Half done',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/${activityId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ clientUpdateId: updateId, progressPercent: 40, note: 'Half done' }),
    })
  })

  it('records an overdue explanation', async () => {
    request.requestFoundation.mockResolvedValue(detail)
    await client.recordOverdueExplanation({
      projectId,
      activityId,
      clientMutationId: updateId,
      category: 'LOGISTICS',
      explanation: 'The venue was unavailable.',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}/${activityId}/overdue-explanations`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMutationId: updateId,
          category: 'LOGISTICS',
          explanation: 'The venue was unavailable.',
        }),
      },
    )
  })

  it('reads the evidence list and downloads a proof as a blob', async () => {
    request.requestFoundation.mockResolvedValue({ scope: 'aggregate', activities: [] })
    await expect(client.getEvidence(projectId)).resolves.toEqual({
      scope: 'aggregate',
      activities: [],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/evidence`)
    const blob = new Blob(['proof'])
    request.requestFoundationResponse.mockResolvedValue({ blob: async () => blob })
    await expect(client.downloadActivityProof(projectId, activityId, evidenceId)).resolves.toBe(
      blob,
    )
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(
      `${base}/${activityId}/proof/${evidenceId}`,
    )
  })

  it('reads the upload limits and reserves with the session count only when it is given', async () => {
    request.requestFoundation.mockResolvedValueOnce({
      maxFiles: 10,
      maxFileBytes: 1024,
      maxTotalBytes: 4096,
      contentTypes: ['application/pdf'],
    })
    await expect(client.getActivityProofUploadLimits(projectId)).resolves.toMatchObject({
      maxFiles: 10,
    })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${base}/proof-upload-limits`)
    const reservation = { clientUpdateId: updateId, updateId, status: 'UPLOADING', files: [] }
    request.requestFoundation.mockResolvedValue(reservation)
    const input = {
      projectId,
      activityId,
      clientUpdateId: updateId,
      progressPercent: 50,
      note: 'Proof attached',
      files: [
        { fileName: 'a.pdf', contentType: 'application/pdf', byteSize: 10, sha256: 'a'.repeat(64) },
      ],
    }
    await client.reserveActivityProofUpload(input)
    await client.reserveActivityProofUpload({ ...input, beneficiariesReachedThisSession: 0 })
    const [first, second] = request.requestFoundation.mock.calls.slice(-2)
    expect(first[0]).toBe(`${base}/${activityId}/updates/reservations`)
    expect(first[1].method).toBe('POST')
    expect(JSON.parse(first[1].body)).toEqual({
      clientUpdateId: updateId,
      progressPercent: 50,
      note: 'Proof attached',
      files: input.files,
    })
    expect(JSON.parse(second[1].body)).toMatchObject({ beneficiariesReachedThisSession: 0 })
  })

  it('finalizes one evidence file with a bodyless POST', async () => {
    request.requestFoundation.mockResolvedValue({ status: 'UPLOADING', updateId, remaining: 1 })
    await expect(
      client.finalizeActivityProofFile(projectId, activityId, updateId, evidenceId),
    ).resolves.toEqual({ status: 'UPLOADING', updateId, remaining: 1 })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}/${activityId}/updates/${updateId}/files/${evidenceId}/finalize`,
      { method: 'POST' },
    )
  })

  it('puts the file to the signed URL without credentials and reports a refusal', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' })
    await expect(
      client.uploadActivityProofFile('http://localhost:54321/upload', file),
    ).rejects.toBeInstanceOf(PathwaysClientError)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('http://localhost:54321/upload')
    expect(init).toMatchObject({
      method: 'PUT',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    fetcher.mockResolvedValue({ ok: true, status: 200 })
    await expect(
      client.uploadActivityProofFile('http://localhost:54321/upload', file),
    ).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
```

Create `apps/web/src/lib/api/activity-extensions.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { activityExtensionsClient } from './activity-extensions'

const projectId = '75200000-0000-4000-8000-000000000001'
const activityId = '75200000-0000-4000-8000-000000000002'
const requestId = '75200000-0000-4000-8000-000000000003'
const path = `/projects/${projectId}/activities/${activityId}/extension-requests`

const extension = {
  id: requestId,
  projectId,
  activityId,
  currentEndDate: '2026-02-01',
  requestedEndDate: '2026-03-01',
  reason: 'The venue was unavailable.',
  status: 'PENDING',
  requestedBy: { id: '75200000-0000-4000-8000-000000000004', name: 'Ana Cruz' },
  requestedAt: '2026-09-28T00:00:00.000Z',
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: '2026-09-28T00:00:00.000Z',
}

// The same cases run against the PathwaysClient methods until Task 2 removes them.
const clients: Array<[string, typeof activityExtensionsClient]> = [
  ['pathwaysClient', pathwaysClient],
  ['activityExtensionsClient', activityExtensionsClient],
]

describe.each(clients)('%s extension requests', (_name, client) => {
  beforeEach(() => requestFoundation.mockReset())

  it('lists the extensions of an activity and parses each row', async () => {
    requestFoundation.mockResolvedValue([extension])
    await expect(client.listActivityExtensions(projectId, activityId)).resolves.toEqual([extension])
    expect(requestFoundation).toHaveBeenCalledWith(path)
  })

  it('refuses a row with an unknown key', async () => {
    requestFoundation.mockResolvedValue([{ ...extension, note: 'extra' }])
    await expect(client.listActivityExtensions(projectId, activityId)).rejects.toThrow()
  })

  it('requests an extension with the given body', async () => {
    requestFoundation.mockResolvedValue(extension)
    const input = {
      requestedEndDate: '2026-03-01',
      reason: 'The venue was unavailable.',
      clientMutationId: '75200000-0000-4000-8000-000000000005',
    }
    await expect(client.requestActivityExtension(projectId, activityId, input)).resolves.toEqual(
      extension,
    )
    expect(requestFoundation).toHaveBeenCalledWith(path, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  })

  it('verifies and decides under the request id', async () => {
    requestFoundation.mockResolvedValue({ ...extension, status: 'VERIFIED' })
    const verify = {
      decision: 'VERIFY' as const,
      note: 'Verified with the officer.',
      expectedUpdatedAt: extension.updatedAt,
    }
    await client.verifyActivityExtension(projectId, activityId, 'r/1', verify)
    expect(requestFoundation).toHaveBeenLastCalledWith(`${path}/r%2F1/verify`, {
      method: 'POST',
      body: JSON.stringify(verify),
    })
    const decide = {
      decision: 'APPROVE' as const,
      note: 'Approved after review.',
      expectedUpdatedAt: extension.updatedAt,
      activityExpectedUpdatedAt: extension.updatedAt,
      clientMutationId: '75200000-0000-4000-8000-000000000006',
    }
    await client.decideActivityExtension(projectId, activityId, requestId, decide)
    expect(requestFoundation).toHaveBeenLastCalledWith(`${path}/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify(decide),
    })
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/activities.test.ts src/lib/api/activity-extensions.test.ts`
Expected: both files FAIL to load with `Failed to resolve import "./activities"` and `"./activity-extensions"`.

- [ ] **Step 3: Build the modules**

```bash
node .tmp/s2b/build-activity-clients.mjs
node .tmp/s2b/trim-imports.mjs apps/web/src/lib/api/activities.schema.ts apps/web/src/lib/api/activity-proofs.schema.ts apps/web/src/lib/api/activities.ts apps/web/src/lib/api/activity-extensions.ts apps/web/src/lib/api/core/guards.ts
```

Expected: `written: activities.schema.ts, activity-proofs.schema.ts, activities.ts, activity-extensions.ts` and five lines ending `removed nothing`. The files are about 336 (`activities.schema.ts`), 295 (`activities.ts`), 153 (`activity-proofs.schema.ts`) and 66 (`activity-extensions.ts`) lines after formatting, plus a 2-line `core/guards.ts`.

- [ ] **Step 4: Prove the copy is verbatim**

```bash
node .tmp/s2b/moved-original.mjs .tmp/s2b/moved.ts
node .tmp/s2b/same-lines.mjs .tmp/s2b/moved.ts apps/web/src/lib/api/activities.schema.ts apps/web/src/lib/api/activity-proofs.schema.ts apps/web/src/lib/api/activities.ts apps/web/src/lib/api/activity-extensions.ts apps/web/src/lib/api/core/guards.ts --list
```

Expected: `blocks written: 25`, then the added lines `2x }` (the two object closers), `1x const activitiesClient = {`, `1x // Proof uploads use the reserve, signed upload and finalize routes below.` and `1x const activityExtensionsClient = {`, and `original lines 731, lost 0, added 5`. Any lost line: stop and report.

- [ ] **Step 5: Check the wire bodies against the contracts and run the tests**

```bash
node .tmp/s2b/type-request-bodies.mjs
pnpm exec biome check --write apps/web/src/lib/api
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: `typed 6 activity bodies and 3 extension inputs`; typecheck lists only the two lines that exist on dev (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`), which proves every web input satisfies its contract; web = `B_web` files + 2 and tests + 44 (218 files, 1987 tests at `919e6641`: 36 runs of the activity cases and 8 of the extension cases, each over both clients).

- [ ] **Step 6: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add apps/web/src
git commit -m "refactor(web): add the activities and extensions clients beside the pathways client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move the callers, mocks and proof client, and remove the old methods

**Files:**
- Create (gitignored): `.tmp/s2b/mock-scan.mjs`, `move-client-calls.mjs`, `split-client-mocks.mjs`, `remove-activity-methods.mjs`, `finish-client-tests.mjs`, `move-modules.mjs`, `client-map.json`
- Modify: `apps/web/src/lib/services/pathways-client.ts`; the 23 production files and 6 test files that call an activity method (`move-client-calls.mjs` prints them); 18 test files with a `pathways-client` mock factory; `apps/web/src/lib/api/activities.test.ts`, `activity-extensions.test.ts`
- Move: `lib/services/private-proof-client.ts` and its test to `lib/api/proof-inspection.ts` and `.test.ts`; four client tests to `lib/api/` (ruling 7)

**Interfaces:**
- Consumes: Task 1's clients and parsers.
- Produces: no activity method or parser on `pathwaysClient`; every caller and mock uses `activitiesClient` or `activityExtensionsClient`; `privateProofClient`, `PrivateProofContext` and `PrivateProofFile` exported from `@/lib/api/proof-inspection`; `pathwaysClient` keeps `recoverSourceMutation` (with its activity branches) and the `isFiniteNonNegative` import for the beneficiary media limits read.

- [ ] **Step 1: Create the scripts**

Create each file with the Write tool.

`.tmp/s2b/mock-scan.mjs` (counts `vi.mock` factories for one web module and lists those whose factory text names a given export):

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

`.tmp/s2b/move-client-calls.mjs` (rewrites `pathwaysClient.<method>` to the right new client, adds the import before the `pathways-client` import and drops `pathwaysClient` from that import when nothing else uses it):

```js
// Rewrites pathwaysClient.<activity method> calls to the new clients and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { activityMethods, extensionMethods } from './activity-blocks.mjs'

const groups = [
  { client: 'activitiesClient', module: '@/lib/api/activities', methods: activityMethods },
  {
    client: 'activityExtensionsClient',
    module: '@/lib/api/activity-extensions',
    methods: extensionMethods,
  },
]
const skip = new Set(['lib/services/pathways-client.ts', 'lib/api/activities.ts', 'lib/api/activity-extensions.ts'])
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
  const imports = used.map((group) => `import { ${group.client} } from '${group.module}'\n`).join('')
  text = text.replace(match[0], imports + replacement)
  writeFileSync(file, text)
  files++
  calls += count
  console.log(`${rel}: ${count}`)
}
console.log(`files ${files}, calls ${calls}`)
```

`.tmp/s2b/split-client-mocks.mjs` (gives every test that mocks `pathways-client` the matching `vi.mock` of each new client its factory serves: an inline object is split or renamed, a shared object gets a second mock with the same object):

```js
// Gives every test that mocks pathways-client a matching vi.mock of each new activity client its factory serves.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { activityMethods, extensionMethods } from './activity-blocks.mjs'

const groups = [
  { client: 'activitiesClient', module: '@/lib/api/activities', names: activityMethods },
  { client: 'activityExtensionsClient', module: '@/lib/api/activity-extensions', names: extensionMethods },
]
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
      const original = kept.length
        ? `vi.mock(${match[1]}@/lib/services/pathways-client${match[1]}, () => ({ ${kept.map((p) => p.trim()).join(', ')} }))\n`
        : ''
      const added = taken
        .map((entry) => mock(entry.group, `{ ${entry.take.map((p) => p.trim()).join(', ')} }`))
        .join('\n')
      edits.push({ start: match.index, end, replacement: `${original}${added}` })
      console.log(
        `${rel}:${line}: ${keep.length ? 'split' : 'renamed'} (${taken.map((entry) => entry.take.map(key).join(', ')).join('; ')})`,
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

`.tmp/s2b/remove-activity-methods.mjs` (deletes the interface members, class methods and parser blocks that moved, then adds the guard import the media limits read still needs):

```js
// Deletes the activity parsers, interface members and class methods that now live in lib/api.
import { readFileSync, writeFileSync } from 'node:fs'

import {
  activityMethods,
  between,
  clientFile,
  extensionMethods,
  extensionPathLine,
  memberBlock,
  methodBlock,
  parserBlocks,
  proofRoutesComment,
} from './activity-blocks.mjs'

let text = readFileSync(clientFile, 'utf8')
const before = text.split('\n').length

// Removes one exact text, throwing when it is missing.
const remove = (piece) => {
  if (!text.includes(piece)) throw new Error(`missing: ${piece.slice(0, 60)}`)
  text = text.replace(piece, '')
}

for (const name of [...activityMethods, ...extensionMethods]) remove(memberBlock(text, name).text)
for (const name of [...activityMethods, ...extensionMethods]) remove(methodBlock(text, name).text)
remove(proofRoutesComment)
remove(extensionPathLine)
for (const [start, end] of Object.values(parserBlocks)) remove(between(text, start, end))
// The beneficiary media limits read still uses the guard the proof parsers shared.
const requestImport = "} from '@/lib/api/core/request'\n"
if (text.split(requestImport).length !== 2) throw new Error('expected one request import')
text = text.replace(requestImport, `${requestImport}import { isFiniteNonNegative } from '@/lib/api/core/guards'\n`)
writeFileSync(clientFile, text)
console.log(`pathways-client.ts: ${before} -> ${text.split('\n').length} lines`)
```

`.tmp/s2b/finish-client-tests.mjs` (turns the two Task 1 tests from a both-clients table into plain tests of the new clients):

```js
// Turns the two request tests from a both-clients table into plain tests of the new clients.
import { readFileSync, writeFileSync } from 'node:fs'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 60)}`)
  return text.replace(from, to)
}

const importLine = "import { pathwaysClient } from '@/lib/services/pathways-client'\n"
const comment = '// The same cases run against the PathwaysClient methods until Task 2 removes them.\n'

const edit = (file, client, title) => {
  let text = readFileSync(file, 'utf8')
  text = replaceOnce(text, importLine, '')
  const start = text.indexOf(comment)
  if (start < 0) throw new Error(`missing the table comment in ${file}`)
  const end = text.indexOf(`describe.each(clients)('%s ${title}', (_name, client) => {\n`)
  if (end < 0) throw new Error(`missing the describe.each line in ${file}`)
  const header = `describe.each(clients)('%s ${title}', (_name, client) => {\n`
  text = `${text.slice(0, start)}const client = ${client}\n\ndescribe('${client} ${title}', () => {\n${text.slice(end + header.length)}`
  writeFileSync(file, text)
}

edit('apps/web/src/lib/api/activities.test.ts', 'activitiesClient', 'activity requests')
edit('apps/web/src/lib/api/activity-extensions.test.ts', 'activityExtensionsClient', 'extension requests')
console.log('2 test files now call the new clients only')
```

`.tmp/s2b/move-modules.mjs` (runs `git mv` for every entry of a web move map, then rewrites every import, re-export, dynamic import and `vi.mock` specifier that named a moved module or sits in a moved file, keeping the alias or relative form; it also rewrites the quoted paths the source-reading contract test holds):

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

`.tmp/s2b/client-map.json`:

```json
{
  "lib/services/private-proof-client.ts": "lib/api/proof-inspection.ts",
  "lib/services/private-proof-client.test.ts": "lib/api/proof-inspection.test.ts",
  "lib/services/pathways-client.evidence.test.ts": "lib/api/activities.schema.test.ts",
  "lib/services/pathways-client.capabilities.test.ts": "lib/api/activities.capabilities.test.ts",
  "lib/services/pathways-client.activity-review.test.ts": "lib/api/activities.review.test.ts",
  "lib/services/pathways-client.local-upload.test.ts": "lib/api/activity-proofs.schema.test.ts"
}
```

- [ ] **Step 2: Scan the mocks before the change**

```bash
node .tmp/s2b/mock-scan.mjs lib/services/pathways-client getActivityContext getActivities getActivity getAssignableProjectOfficers createActivity updateActivity transitionActivity recordActivityProgress recordOverdueExplanation reviewActivityUpdate downloadActivityProof getEvidence getActivityProofUploadLimits reserveActivityProofUpload uploadActivityProofFile finalizeActivityProofFile listActivityExtensions requestActivityExtension verifyActivityExtension decideActivityExtension | tail -1
```

Expected: `factories 42, naming 5` (five inline factories name an activity method; the others pass a shared object).

- [ ] **Step 3: Repoint the call sites**

```bash
node .tmp/s2b/move-client-calls.mjs
```

Expected: 29 lines, one per file (23 production files and 6 tests), no `manual` line, and `files 29, calls 87`. `activity-form-dialog.tsx` shows 8, `pathways-client.test.ts` 21 and `pathways-client.capabilities.test.ts` 8.

- [ ] **Step 4: Repoint the mocks**

```bash
node .tmp/s2b/split-client-mocks.mjs
```

Expected: 18 lines and `files 18`: 13 `added` (11 with `activitiesClient` and 2 with `activityExtensionsClient`, the shared-object factories), 2 `split` (`rule-editor.test.tsx`, `collection-workspace.test.tsx`) and 3 `renamed` (`activity-form-dialog.test.tsx`, `activity-proof-files.test.tsx`, `activity-status-control.test.tsx`), and no `manual` line.

- [ ] **Step 5: Remove the old code from the client and finish the tests**

```bash
node .tmp/s2b/remove-activity-methods.mjs
node .tmp/s2b/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts
node .tmp/s2b/finish-client-tests.mjs
sed -i "s#from './pathways-client'#from '@/lib/api/activities.schema'#" apps/web/src/lib/services/pathways-client.evidence.test.ts
node .tmp/s2b/move-modules.mjs .tmp/s2b/client-map.json
```

Expected: `pathways-client.ts: 2395 -> 1562 lines`; the trim prints `removed webEnv, Activity, ActivityCapabilities, ActivityOverdueExplanation, ActivityProofFinalizeResult, ActivityProofReservation, ActivityProofReservedFile, ActivityProofUploadLimits, ActivitySummary, AssignableProjectOfficer, CreateActivityInput, EvidenceList, EvidenceRecord, RecordActivityProgressInput, RecordOverdueExplanationInput, ReserveActivityProofUploadInput, UpdateActivityInput, ActivityExtension, activityExtensionSchema, overdueExplanationCategories`; `2 test files now call the new clients only`; and `moved 6 files, rewrote 7 specifiers and 0 contract paths` (`evidence-view.tsx`, `private-proof-inspection.tsx`, `private-proof-preview.tsx`, `project-review-workspace.test.tsx`, `private-proof-inspection.test.tsx`, `activities.review.test.ts` and `proof-inspection.test.ts`).

- [ ] **Step 6: Format and verify**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
node .tmp/s2b/mock-scan.mjs lib/services/pathways-client getActivityContext getActivities getActivity getAssignableProjectOfficers createActivity updateActivity transitionActivity recordActivityProgress recordOverdueExplanation reviewActivityUpdate downloadActivityProof getEvidence getActivityProofUploadLimits reserveActivityProofUpload uploadActivityProofFile finalizeActivityProofFile listActivityExtensions requestActivityExtension verifyActivityExtension decideActivityExtension | tail -1
node .tmp/s2b/mock-scan.mjs lib/api/activities | tail -1
node .tmp/s2b/mock-scan.mjs lib/api/activity-extensions | tail -1
git grep -nE "pathwaysClient\s*\.(getActivityContext|getActivities|getActivity|createActivity|updateActivity|getEvidence|listActivityExtensions|finalizeActivityProofFile)\b" -- apps/web/src
wc -l apps/web/src/lib/services/pathways-client.ts
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: Biome fixes about 31 files (import order after the rewrite); typecheck lists only the two dev lines; the three scans print `factories 40, naming 0`, `factories 16, naming 0` and `factories 2, naming 0`; the grep prints nothing; `pathways-client.ts` is 1521 lines; web = Task 1 minus the 22 duplicated runs (218 files, 1965 tests).

- [ ] **Step 7: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): call the activities clients and drop the activity methods from pathways-client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move the activity files into the feature layout

**Files:**
- Create (gitignored): `.tmp/s2b/activity-map.json`, `index-and-renames.mjs`, `compare-routes.mjs`
- Move: the 35 activity files of `apps/web/src/features/projects/` (the map below) into `apps/web/src/features/projects/activities/`
- Modify: every importer and `vi.mock` of a moved file (41 specifiers), `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (3 quoted paths), `apps/web/src/features/projects/index.ts`, the four components that hold a file-private `Scoped*` or `Owned*` name

**Interfaces:**
- Consumes: Task 2's layout of `lib/api`.
- Produces: the layout of ruling 8 with these exact paths: `features/projects/activities/components/{activity-detail-page,activity-detail-panel,activity-detail-sections,activity-editor-loading-dialog,activity-explain-delay-dialog,activity-extension-dialog,activity-extension-panel,activity-form-dialog,activity-list-table,activity-progress-dialog,activity-proof-dialog,activity-proof-files,activity-proof-review-dialog,activity-status-control,evidence-panels,private-proof-inspection,private-proof-preview,project-activities-workspace}.tsx` (each with its test where it has one, plus `project-activities-rbac.test.tsx`), `activities/activities.utils.ts` (+ test), `activities/activity-form.utils.ts` (+ test). `features/projects/index.ts` exports `ActivityDetailPage`, `ActivityDetailPanel`, `ActivityProofDialog` and `ProjectActivitiesWorkspace` from their `./activities/components/*` leaf paths (ruling 9); exports and behavior are unchanged. The expense dialogs, the budget module, indicators, the library and the evaluation workspace stay at the root.

- [ ] **Step 1: Measure the route baseline again**

Tasks 1 and 2 already changed route bundles, so the comparison base for this task is measured now, not taken from Task 0.

`.tmp/s2b/compare-routes.mjs` (prints the routes whose First Load JS differs between two saved `next build` route tables):

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

```bash
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s2b/web-build-pre-layout.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s2b/web-build-pre-layout.log | sed -n '/Route (app)/,$p' > .tmp/s2b/routes-pre-layout.txt
node .tmp/s2b/compare-routes.mjs .tmp/s2b/routes-baseline.txt .tmp/s2b/routes-pre-layout.txt | tail -1
grep -E "Middleware" .tmp/s2b/routes-pre-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: exit 0; `routes 72, different 16` (15 routes shrink by 1 to 3 kB and `/projects/[projectId]/journey-stages` grows by 1 kB, because the activity parsers left the shared client chunk); `Middleware` 102 kB.

- [ ] **Step 2: Create the map and the index script**

`.tmp/s2b/activity-map.json`:

```json
{
  "features/projects/activity-detail-page.tsx": "features/projects/activities/components/activity-detail-page.tsx",
  "features/projects/activity-detail-panel.test.tsx": "features/projects/activities/components/activity-detail-panel.test.tsx",
  "features/projects/activity-detail-panel.tsx": "features/projects/activities/components/activity-detail-panel.tsx",
  "features/projects/activity-detail-sections.tsx": "features/projects/activities/components/activity-detail-sections.tsx",
  "features/projects/activity-editor-loading-dialog.tsx": "features/projects/activities/components/activity-editor-loading-dialog.tsx",
  "features/projects/activity-explain-delay-dialog.test.tsx": "features/projects/activities/components/activity-explain-delay-dialog.test.tsx",
  "features/projects/activity-explain-delay-dialog.tsx": "features/projects/activities/components/activity-explain-delay-dialog.tsx",
  "features/projects/activity-extension-dialog.test.tsx": "features/projects/activities/components/activity-extension-dialog.test.tsx",
  "features/projects/activity-extension-dialog.tsx": "features/projects/activities/components/activity-extension-dialog.tsx",
  "features/projects/activity-extension-panel.test.tsx": "features/projects/activities/components/activity-extension-panel.test.tsx",
  "features/projects/activity-extension-panel.tsx": "features/projects/activities/components/activity-extension-panel.tsx",
  "features/projects/activity-form-dialog.test.tsx": "features/projects/activities/components/activity-form-dialog.test.tsx",
  "features/projects/activity-form-dialog.tsx": "features/projects/activities/components/activity-form-dialog.tsx",
  "features/projects/activity-form-validation.test.ts": "features/projects/activities/activity-form.utils.test.ts",
  "features/projects/activity-form-validation.ts": "features/projects/activities/activity-form.utils.ts",
  "features/projects/activity-list-table.tsx": "features/projects/activities/components/activity-list-table.tsx",
  "features/projects/activity-progress-dialog.test.tsx": "features/projects/activities/components/activity-progress-dialog.test.tsx",
  "features/projects/activity-progress-dialog.tsx": "features/projects/activities/components/activity-progress-dialog.tsx",
  "features/projects/activity-proof-dialog.test.tsx": "features/projects/activities/components/activity-proof-dialog.test.tsx",
  "features/projects/activity-proof-dialog.tsx": "features/projects/activities/components/activity-proof-dialog.tsx",
  "features/projects/activity-proof-files.test.tsx": "features/projects/activities/components/activity-proof-files.test.tsx",
  "features/projects/activity-proof-files.tsx": "features/projects/activities/components/activity-proof-files.tsx",
  "features/projects/activity-proof-review-dialog.test.tsx": "features/projects/activities/components/activity-proof-review-dialog.test.tsx",
  "features/projects/activity-proof-review-dialog.tsx": "features/projects/activities/components/activity-proof-review-dialog.tsx",
  "features/projects/activity-status-control.test.tsx": "features/projects/activities/components/activity-status-control.test.tsx",
  "features/projects/activity-status-control.tsx": "features/projects/activities/components/activity-status-control.tsx",
  "features/projects/activity-utils.test.ts": "features/projects/activities/activities.utils.test.ts",
  "features/projects/activity-utils.ts": "features/projects/activities/activities.utils.ts",
  "features/projects/evidence-panels.tsx": "features/projects/activities/components/evidence-panels.tsx",
  "features/projects/private-proof-inspection.test.tsx": "features/projects/activities/components/private-proof-inspection.test.tsx",
  "features/projects/private-proof-inspection.tsx": "features/projects/activities/components/private-proof-inspection.tsx",
  "features/projects/private-proof-preview.tsx": "features/projects/activities/components/private-proof-preview.tsx",
  "features/projects/project-activities-rbac.test.tsx": "features/projects/activities/components/project-activities-rbac.test.tsx",
  "features/projects/project-activities-workspace.test.tsx": "features/projects/activities/components/project-activities-workspace.test.tsx",
  "features/projects/project-activities-workspace.tsx": "features/projects/activities/components/project-activities-workspace.tsx"
}
```

`.tmp/s2b/index-and-renames.mjs` (moves the four activity export lines of the feature index out of the "until moved" group, and gives the four file-private components purpose names; each rename is counted):

```js
// Lists the activity exports in the projects feature index by their leaf paths and gives the four file-private activity components purpose names.
import { readFileSync, writeFileSync } from 'node:fs'

const feature = 'apps/web/src/features/projects'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 70)}`)
  return text.replace(from, to)
}

// The move script already pointed four export lines at the new paths; they leave the "until moved" group.
const indexFile = `${feature}/index.ts`
const lines = readFileSync(indexFile, 'utf8').split('\n')
const moved = lines.filter((line) => line.includes('./activities/components/'))
if (moved.length !== 4) throw new Error(`expected 4 activity export lines, found ${moved.length}`)
const rest = lines.filter((line) => !line.includes('./activities/components/')).join('\n')
writeFileSync(
  indexFile,
  replaceOnce(
    rest,
    "export { metricUnavailableLabel, overviewMetricLabel } from './projects.utils'\n",
    `export { metricUnavailableLabel, overviewMetricLabel } from './projects.utils'\n${moved.join('\n')}\n`,
  ),
)

const renames = [
  ['activity-form-dialog.tsx', 'ScopedActivityFormDialog', 'ActivityFormDialogContent'],
  ['activity-proof-dialog.tsx', 'ScopedActivityProofDialog', 'ActivityProofDialogContent'],
  ['activity-proof-review-dialog.tsx', 'OwnedReview', 'ActivityProofReviewDialogContent'],
  ['private-proof-inspection.tsx', 'OwnedInspection', 'PrivateProofInspectionContent'],
]
for (const [name, from, to] of renames) {
  const file = `${feature}/activities/components/${name}`
  const text = readFileSync(file, 'utf8')
  const count = text.split(from).length - 1
  if (count !== 2) throw new Error(`${name}: expected 2 uses of ${from}, found ${count}`)
  writeFileSync(file, text.replaceAll(from, to))
}
console.log('index lists the activity exports by leaf path; 4 components renamed')
```

- [ ] **Step 3: Run the move and the index script**

```bash
git status --short
node .tmp/s2b/move-modules.mjs .tmp/s2b/activity-map.json
node .tmp/s2b/index-and-renames.mjs
```

Expected: a clean status first; then one line per rewritten file and `moved 35 files, rewrote 41 specifiers and 3 contract paths`, then `index lists the activity exports by leaf path; 4 components renamed`. The importers outside the activities folder that change are `budget-module/budget-ledger.tsx`, `budget-overview.tsx`, `budget-transparency.tsx` and `expense-review-drawer.tsx` (their `activity-utils` import), `components/evidence-view.tsx` (2), `index.ts` (4) and the contract test (3 quoted paths: the workspace, the detail sections and the workspace again).

- [ ] **Step 4: Format and verify**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: Biome fixes about 7 files (import order after the rewrite); typecheck lists only the two dev lines; web unchanged from Task 2 (218 files, 1965 tests). The import-direction test passes: every file outside the feature still imports it through the index.

- [ ] **Step 5: Compare the production route bundles**

```bash
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s2b/web-build-layout.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s2b/web-build-layout.log | sed -n '/Route (app)/,$p' > .tmp/s2b/routes-layout.txt
node .tmp/s2b/compare-routes.mjs .tmp/s2b/routes-pre-layout.txt .tmp/s2b/routes-layout.txt
grep -E "Middleware" .tmp/s2b/routes-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: exit 0; `routes 72, different 4`: four routes grow by 1 kB (`/projects/[projectId]/activities`, `/budget`, `/evidence` and `/monitor-evaluate`) and none shrink or grow more. `Middleware` equals `M0`. If any route grows by more than 2 kB, stop without committing and report the figures (a sub-index file re-exported by the feature index grows `/dashboard` by 23 kB, which is why ruling 9 forbids one). A build that fails with `Module not found: Can't resolve './activity-detail-panel'` used a stale cache: remove `apps/web/.next` and run it again (ruling 10).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): lay out the activities feature in components and hooks folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Split the activity form dialog and the proof dialog

**Files:**
- Create (gitignored): `.tmp/s2b/split-form-dialog.mjs`, `split-proof-dialog.mjs`
- Create: `activities/components/activity-form-fields.tsx`, `activities/hooks/use-activity-form-draft.ts`, `activities/activity-proof-upload.utils.ts`, `activities/hooks/use-activity-proof-upload.ts`
- Test: `activities/components/activity-form-dialog.draft.test.tsx`
- Modify: `activities/components/activity-form-dialog.tsx` (846 to 419 lines), `activities/components/activity-proof-dialog.tsx` (773 to 336 lines)

(`activities/` below is `apps/web/src/features/projects/activities/`.)

**Interfaces:**
- Consumes: Task 3's layout.
- Produces: `ActivityFormFields({ activity, canEditBudget, canEditStatus, canLinkIndicators, canReadBudget, canReadIndicators, form, indicators, journeyStages, lockedIndicatorValue, officers })` from `components/activity-form-fields.tsx`; `useActivityFormDraft({ draftStorageKey, form, indicatorIds, initialValues, journeyStageIds, officerIds, open, projectId, scope }): { draftRecovered: boolean }` from `hooks/use-activity-form-draft.ts`; `fallbackLimits`, `FileStatus`, `conflictMessage`, `ProofFileItem`, `megabytes`, `statusLabel` from `activity-proof-upload.utils.ts`; `useActivityProofUpload({ activity, onOpenChange, onSubmitted, open, scope })` from `hooks/use-activity-proof-upload.ts`, returning the 30 names listed in Step 3. `ActivityFormDialog` and `ActivityProofDialog` keep their props and behavior; the existing tests of both dialogs render the moved parts, and the new draft test pins the effects that no test exercised.

- [ ] **Step 1: Write the draft characterization test (it passes on the unsplit dialog)**

The form's draft effects restore a stored draft, filter it against what the project offers and write it back while the officer types; the existing tests set one draft key and never check the filtering, the project check or the write and removal. Create `apps/web/src/features/projects/activities/components/activity-form-dialog.draft.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSensitiveDraft, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

const projectId = '72100000-0000-4000-8000-000000000004'
const state = vi.hoisted(() => ({
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['PROJECT_MANAGER'],
    permissions: [
      'activities.create',
      'activities.update',
      'budgets.create',
      'budgets.update',
      'budgets.read',
      'indicators.read',
      'indicators.update',
    ],
    assignedProjectIds: ['72100000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Project Manager', profile: state.profile }),
}))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: {} }))

import { ActivityFormDialog } from './activity-form-dialog'

const officer = { userId: '72100000-0000-4000-8000-000000000005', displayName: 'Project Officer A' }
const draftKey = sensitiveDraftKey('activity', {
  organizationId: 'org-a',
  userId: 'actor-a',
  projectId,
  resourceId: null,
})
const stored = (value: Record<string, unknown>) =>
  window.sessionStorage.setItem(draftKey, JSON.stringify(value))
const renderDialog = () =>
  render(
    <ActivityFormDialog
      activity={null}
      indicators={[]}
      journeyStages={[]}
      onCreatedOrUpdated={vi.fn()}
      onOpenChange={vi.fn()}
      open
      projectId={projectId}
      officers={[officer]}
    />,
  )

describe('activity form draft', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('restores a stored draft, says so, and drops officers the project no longer offers', async () => {
    stored({
      projectId,
      title: 'Stored title',
      assignedOfficers: [officer.userId, 'removed-officer'],
      journeyStageId: 'unknown-stage',
    })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('Stored title')
    expect(screen.getByText('Recovered your unsaved activity draft.')).toBeTruthy()
    expect(
      (screen.getByRole('checkbox', { name: /Project Officer A/ }) as HTMLInputElement).checked,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: 'Edited' } })
    await waitFor(() =>
      expect(readSensitiveDraft(draftKey)).toMatchObject({
        title: 'Edited',
        assignedOfficers: [officer.userId],
        journeyStageId: '',
      }),
    )
  })

  it('ignores a draft stored for another project', () => {
    stored({ projectId: '72100000-0000-4000-8000-0000000000ff', title: 'Other project' })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Recovered your unsaved activity draft.')).toBeNull()
  })

  it('keeps only stored values of the right type and size', () => {
    stored({ projectId, title: 42, description: 'x'.repeat(10_001), dueDate: '2026-11-01' })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText(/Due date/) as HTMLInputElement).value).toBe('2026-11-01')
  })

  it('writes the draft while the officer types and removes it once the form is back to its start', async () => {
    renderDialog()
    expect(readSensitiveDraft(draftKey)).toBeNull()
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: 'Typed title' } })
    await waitFor(() =>
      expect(readSensitiveDraft(draftKey)).toMatchObject({ projectId, title: 'Typed title' }),
    )
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: '' } })
    await waitFor(() => expect(readSensitiveDraft(draftKey)).toBeNull())
  })
})
```

```bash
pnpm exec biome check --write apps/web/src/features/projects/activities/components/activity-form-dialog.draft.test.tsx
pnpm --filter @pathways/web exec vitest run src/features/projects/activities/components/activity-form-dialog.draft.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 2: Create the form dialog script and split it**

`.tmp/s2b/split-form-dialog.mjs` (moves the field grid into `ActivityFormFields` and the two draft effects with their two state hooks into `useActivityFormDraft`):

```js
// Moves the field grid and the draft effects out of the activity form dialog, verbatim.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/activities'
const dialogFile = `${dir}/components/activity-form-dialog.tsx`
let dialog = readFileSync(dialogFile, 'utf8')

// Returns the index of an anchor, throwing when it is missing.
function indexOf(text, anchor) {
  const at = text.indexOf(anchor)
  if (at < 0) throw new Error(`missing: ${anchor}`)
  return at
}

// The field grid, from its opening tag to the closing tag before the pending-create notice.
const gridStart = indexOf(dialog, '              <div className="grid gap-4 lg:grid-cols-2">\n')
const gridEnd = indexOf(dialog, '              {pendingCreate.notice ? (\n')
const grid = dialog.slice(gridStart, gridEnd)
dialog = `${dialog.slice(0, gridStart)}              <ActivityFormFields
                activity={activity}
                canEditBudget={canEditBudget}
                canEditStatus={canEditStatus}
                canLinkIndicators={canLinkIndicators}
                canReadBudget={canReadBudget}
                canReadIndicators={canReadIndicators}
                form={form}
                indicators={indicators}
                journeyStages={journeyStages}
                lockedIndicatorValue={lockedIndicatorValue}
                officers={officers}
              />
${dialog.slice(gridEnd)}`

const fields = `import type { UseFormReturn } from 'react-hook-form'

import { LockedField } from '@/components/pathways'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  Activity,
  AssignableProjectOfficer,
  Indicator,
  JourneyStageConfig,
} from '@/types/pathways'

import { activityStatuses, formatCurrency } from '../activities.utils'
import type { ActivityFormSchema } from '../activity-form.utils'

export const ActivityFormFields = ({
  activity,
  canEditBudget,
  canEditStatus,
  canLinkIndicators,
  canReadBudget,
  canReadIndicators,
  form,
  indicators,
  journeyStages,
  lockedIndicatorValue,
  officers,
}: {
  activity: Activity | null
  canEditBudget: boolean
  canEditStatus: boolean
  canLinkIndicators: boolean
  canReadBudget: boolean
  canReadIndicators: boolean
  form: UseFormReturn<ActivityFormSchema>
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  lockedIndicatorValue: string
  officers: AssignableProjectOfficer[]
}) => (
${grid.trimEnd()}
)
`
writeFileSync(`${dir}/components/activity-form-fields.tsx`, fields)

// The draft hydration and persistence effects, from the first effect to the submit handler.
const stateLines =
  '  const [draftHydrated, setDraftHydrated] = useState(false)\n  const [draftRecovered, setDraftRecovered] = useState(false)\n'
if (!dialog.includes(stateLines)) throw new Error('missing the draft state lines')
dialog = dialog.replace(stateLines, '')
const effectsStart = indexOf(dialog, '  useEffect(() => {\n    if (!open) {\n      setDraftHydrated(false)\n')
const effectsEnd = indexOf(dialog, '  const onSubmit = async (values: ActivityFormSchema) => {\n')
const effects = dialog.slice(effectsStart, effectsEnd)
dialog = `${dialog.slice(0, effectsStart)}  const { draftRecovered } = useActivityFormDraft({
    draftStorageKey,
    form,
    indicatorIds,
    initialValues,
    journeyStageIds,
    officerIds,
    open,
    projectId,
    scope,
  })

${dialog.slice(effectsEnd)}`

const hook = `import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'

import type { ActivityFormSchema } from '../activity-form.utils'

export const useActivityFormDraft = ({
  draftStorageKey,
  form,
  indicatorIds,
  initialValues,
  journeyStageIds,
  officerIds,
  open,
  projectId,
  scope,
}: {
  draftStorageKey: string
  form: UseFormReturn<ActivityFormSchema>
  indicatorIds: string[]
  initialValues: ActivityFormSchema
  journeyStageIds: string[]
  officerIds: string[]
  open: boolean
  projectId: string
  scope: SensitiveDraftOwner
}) => {
${stateLines}
${effects.trimEnd()}

  return { draftRecovered }
}
`
mkdirSync(`${dir}/hooks`, { recursive: true })
writeFileSync(`${dir}/hooks/use-activity-form-draft.ts`, hook)

const utilsImport = "import { type ActivityFormSchema, createActivityFormSchema } from '../activity-form.utils'\n"
if (!dialog.includes(utilsImport)) throw new Error('missing the form utils import')
dialog = dialog.replace(
  utilsImport,
  `${utilsImport}import { useActivityFormDraft } from '../hooks/use-activity-form-draft'\nimport { ActivityFormFields } from './activity-form-fields'\n`,
)
writeFileSync(dialogFile, dialog)
console.log('written: activity-form-fields.tsx, hooks/use-activity-form-draft.ts')
```

```bash
D=apps/web/src/features/projects/activities
cp $D/components/activity-form-dialog.tsx .tmp/s2b/form-dialog.before.tsx
node .tmp/s2b/split-form-dialog.mjs
node .tmp/s2b/trim-imports.mjs $D/components/activity-form-dialog.tsx $D/components/activity-form-fields.tsx $D/hooks/use-activity-form-draft.ts
node .tmp/s2b/same-lines.mjs .tmp/s2b/form-dialog.before.tsx $D/components/activity-form-dialog.tsx $D/components/activity-form-fields.tsx $D/hooks/use-activity-form-draft.ts
```

Expected: `written: activity-form-fields.tsx, hooks/use-activity-form-draft.ts`; the trim removes `useEffect, LockedField, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, readSensitiveDraft, writeSensitiveDraft, activityStatuses, formatCurrency` from the dialog and nothing from the other two (`Select` is only named in an error string, which the trim ignores); the check prints `original lines 776, lost 0, added 73`.

- [ ] **Step 3: Create the proof dialog script and split it**

`.tmp/s2b/split-proof-dialog.mjs` (moves the pure helpers into `activity-proof-upload.utils.ts` and the state, effects and handlers into `useActivityProofUpload`; the returned names are listed in the script, and it fails when one is not declared in the body or not read by the markup):

```js
// Moves the upload state and handlers of the proof dialog into a hook and its pure helpers into a utils file, verbatim.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/activities'
const dialogFile = `${dir}/components/activity-proof-dialog.tsx`
let dialog = readFileSync(dialogFile, 'utf8')

// Returns the index of an anchor, throwing when it is missing.
function indexOf(text, anchor) {
  const at = text.indexOf(anchor)
  if (at < 0) throw new Error(`missing: ${anchor}`)
  return at
}

// The pure helpers and types, from the fallback limits to the component.
const helpersStart = indexOf(dialog, "// Advisory-only defaults shown before the server's own limits load\n")
const helpersEnd = indexOf(dialog, 'export const ActivityProofDialog = (props: {\n')
const helpers = dialog
  .slice(helpersStart, helpersEnd)
  .replace('const fallbackLimits:', 'export const fallbackLimits:')
  .replace('type FileStatus =', 'export type FileStatus =')
  .replace('function conflictMessage(', 'export function conflictMessage(')
  .replace('interface ProofFileItem {', 'export interface ProofFileItem {')
  .replace('const megabytes =', 'export const megabytes =')
  .replace('const statusLabel =', 'export const statusLabel =')
dialog = dialog.slice(0, helpersStart) + dialog.slice(helpersEnd)
writeFileSync(
  `${dir}/activity-proof-upload.utils.ts`,
  `import type { ActivityProofUploadLimits } from '@/types/pathways'\n\n${helpers.trimEnd()}\n`,
)

// The state and handlers, from the first state hook to the dialog markup.
const bodyStart = indexOf(dialog, "  const [note, setNote] = useState('')\n")
const jsxStart = indexOf(dialog, '  return (\n    <Dialog onOpenChange={requestOpenChange} open={open}>\n')
const body = dialog.slice(bodyStart, jsxStart)
const markup = dialog.slice(jsxStart)

// Top-level names declared in the body.
const declared = [...body.matchAll(/^  const (?:\[(\w+), (\w+)\]|(\w+)) =/gm)].flatMap((match) =>
  [match[1], match[2], match[3]].filter(Boolean),
)
// The names the markup reads from the body, listed so a word in the markup text cannot add one.
const used = [
  'note',
  'setNote',
  'files',
  'submitting',
  'error',
  'setError',
  'limits',
  'locked',
  'fileInputRef',
  'lockedNoticeRef',
  'resume',
  'beneficiariesReachedThisSession',
  'setBeneficiariesReachedThisSession',
  'progressError',
  'noteError',
  'fileError',
  'beneficiariesError',
  'setProgressText',
  'setProgressEdited',
  'completes',
  'setCompletes',
  'suggestion',
  'progressValue',
  'lowerNotice',
  'addFiles',
  'removeFile',
  'retryFile',
  'submitUpdate',
  'requestOpenChange',
  'liveStatus',
]
for (const name of used) {
  if (!declared.includes(name)) throw new Error(`not declared in the body: ${name}`)
  if (!new RegExp(`\\b${name}\\b`).test(markup)) throw new Error(`not read by the markup: ${name}`)
}
console.log(`returned names (${used.length}): ${used.join(', ')}`)

dialog = `${dialog.slice(0, bodyStart)}  const {
${used.map((name) => `    ${name},`).join('\n')}
  } = useActivityProofUpload({ activity, onOpenChange, onSubmitted, open, scope })

${markup}`
const importAnchor = "import { sha256Hex } from '@/lib/files/proof-file-hash'\n"
if (!dialog.includes(importAnchor)) throw new Error('missing the sha256 import')
dialog = dialog.replace(importAnchor, '')
const typesImport = dialog.match(/import type \{\n {2}Activity,\n {2}ActivityProofFileDeclaration,\n {2}ActivityProofUploadLimits,\n\} from '@\/types\/pathways'\n/)
if (!typesImport) throw new Error('missing the types import')
dialog = dialog.replace(
  typesImport[0],
  `${typesImport[0]}\nimport { useActivityProofUpload } from '../hooks/use-activity-proof-upload'\nimport { megabytes, statusLabel } from '../activity-proof-upload.utils'\n`,
)
writeFileSync(dialogFile, dialog)

const hook = `import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import type { SensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { sha256Hex } from '@/lib/files/proof-file-hash'
import type {
  Activity,
  ActivityProofFileDeclaration,
  ActivityProofUploadLimits,
} from '@/types/pathways'

import {
  type FileStatus,
  type ProofFileItem,
  conflictMessage,
  fallbackLimits,
  megabytes,
} from '../activity-proof-upload.utils'

export const useActivityProofUpload = ({
  activity,
  onOpenChange,
  onSubmitted,
  open,
  scope,
}: {
  activity: Activity | null
  onOpenChange: (open: boolean) => void
  onSubmitted: (activity: Activity) => void
  open: boolean
  scope: SensitiveDraftOwner
}) => {
${body.trimEnd()}

  return {
${used.map((name) => `    ${name},`).join('\n')}
  }
}
`
mkdirSync(`${dir}/hooks`, { recursive: true })
writeFileSync(`${dir}/hooks/use-activity-proof-upload.ts`, hook)
console.log('written: activity-proof-upload.utils.ts, hooks/use-activity-proof-upload.ts')
```

```bash
D=apps/web/src/features/projects/activities
cp $D/components/activity-proof-dialog.tsx .tmp/s2b/proof-dialog.before.tsx
node .tmp/s2b/split-proof-dialog.mjs
node .tmp/s2b/trim-imports.mjs $D/components/activity-proof-dialog.tsx $D/hooks/use-activity-proof-upload.ts $D/activity-proof-upload.utils.ts
node .tmp/s2b/same-lines.mjs .tmp/s2b/proof-dialog.before.tsx $D/components/activity-proof-dialog.tsx $D/hooks/use-activity-proof-upload.ts $D/activity-proof-upload.utils.ts
```

Expected: `returned names (30): note, setNote, files, submitting, error, setError, limits, locked, fileInputRef, lockedNoticeRef, resume, beneficiariesReachedThisSession, setBeneficiariesReachedThisSession, progressError, noteError, fileError, beneficiariesError, setProgressText, setProgressEdited, completes, setCompletes, suggestion, progressValue, lowerNotice, addFiles, removeFile, retryFile, submitUpdate, requestOpenChange, liveStatus`; the dialog trim removes `useEffect, useRef, useState, toast, activitiesClient, PathwaysClientError, ActivityProofFileDeclaration, ActivityProofUploadLimits`; the check prints `original lines 728, lost 0, added 78`.

- [ ] **Step 4: Format and verify**

```bash
D=apps/web/src/features/projects/activities
pnpm exec biome check --write $D
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
wc -l $D/components/activity-form-dialog.tsx $D/components/activity-form-fields.tsx $D/hooks/use-activity-form-draft.ts $D/components/activity-proof-dialog.tsx $D/hooks/use-activity-proof-upload.ts $D/activity-proof-upload.utils.ts
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: typecheck lists only the two dev lines; the sizes are 419, 387, 126, 336, 482 and 50 lines (none above 500); web = Task 3 plus the new test file (219 files, 1969 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): split the activity form and proof dialogs by component and hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Split the activity detail panel and the activities workspace

**Files:**
- Create (gitignored): `.tmp/s2b/split-detail-panel.mjs`, `split-workspace.mjs`
- Create: `activities/components/activity-detail-content.tsx`, `activity-history.tsx`, `activity-detail-actions.tsx`, `activity-card.tsx`, `activity-status-summary.tsx`; `activities/activity-proof.utils.ts`; `activities/hooks/use-activity-expenses.ts`, `use-activity-filters.ts`
- Test: `activities/components/project-activities-workspace.expenses.test.tsx`
- Modify: `activities/components/activity-detail-panel.tsx` (800 to 155 lines), `project-activities-workspace.tsx` (750 to 490 lines)
- Move: `activities/components/activity-detail-panel.test.tsx` to `activity-detail-content.test.tsx`

(`activities/` below is `apps/web/src/features/projects/activities/`.)

**Interfaces:**
- Consumes: Task 4's layout and the unchanged props of `ActivityDetailPanel`, `ActivityDetailContent` and `ProjectActivitiesWorkspace`.
- Produces: `ActivityDetailContent` (same props as before) from `components/activity-detail-content.tsx`; `ActivityHistory({ activity, canDecideProof, canOpenProof, canValidateProof, onSubmitProof, requestedProofId, setReviewTarget, showSubmitProof })`; `ActivityDetailActions({ activity, canLogExpense, canRequestExtension, onEdit, onSubmitProof, ownIncompleteProof, setExpenseOpen, setExplainDelayOpen, setExtensionOpen, setProgressOpen, showEdit, showExplainDelay, showRecordProgress, showSubmitProof })`; `ProofGroup`, `groupProofsByUpdate`, `proofTone`, `formatProofDate` from `activity-proof.utils.ts`; `ActivityCard({ activity, onOpen })`; `ActivityStatusSummary({ activeStatus, counts, onStatusChange })`; `useActivityExpenses({ canReadBudgetLines, canReadExpenseReferences, canReadExpenses, projectId, refetchDetail, selectedActivity }): { activityExpenses, budgetReferences, pendingExpenses, refreshExpenses }`; `useActivityFilters(activities, indicators)` returning `{ activityStatusCounts, filteredActivities, query, setQuery, setStatusFilter, setViewMode, statusFilter, viewMode, visibleActivityStatuses }`. `ActivityDetailPanel` stays in `activity-detail-panel.tsx` with its props, so the feature index, the dashboard and the workspace tests' `vi.mock('./activity-detail-panel', ...)` are unchanged.

- [ ] **Step 1: Write the expenses characterization test (it passes on the unsplit workspace)**

The workspace derives three things for the open activity from the expense, reference and budget line reads, and no test gives it rows: the panel tests pass the derived props in directly. Create `apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx`. It stubs the panel to print the props it receives and runs the real workspace, hooks and reads for a Monitoring and Evaluation Officer (references and pending expenses) and a Project Manager (budget lines):

```tsx
/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'

import type { ExpenseBudgetReference } from '../../activity-expense-dialog'
import type { PendingExpense } from '../../activity-expense-review-dialog'
import type { ActivityExpenseEntry } from './activity-detail-sections'
import { ProjectActivitiesWorkspace } from './project-activities-workspace'

const projectId = '75300000-0000-4000-8000-000000000001'
const activityId = '75300000-0000-4000-8000-000000000002'
const otherActivityId = '75300000-0000-4000-8000-000000000003'
const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
  getProjectIndicators: vi.fn(),
  getJourneyStages: vi.fn(),
  getProject: vi.fn(),
}))
const core = vi.hoisted(() => ({
  budgetReferences: vi.fn(),
  budgets: vi.fn(),
  expenses: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  access: 'ready',
  assignedProjectIds: ['75300000-0000-4000-8000-000000000001'],
  profile: {
    id: 'synthetic-subject',
    userId: 'synthetic-user',
    organizationId: 'synthetic-org',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'projects.detail.read',
      'activities.read',
      'journeys.read',
      'expenses.read',
      'expenses.submit',
      'budgets.read',
    ],
    assignedProjectIds: ['75300000-0000-4000-8000-000000000001'],
  },
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: core }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { projectActivities: 'Activities' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./activity-form-dialog', () => ({ ActivityFormDialog: () => null }))
vi.mock('./activity-proof-dialog', () => ({ ActivityProofDialog: () => null }))
vi.mock('./activity-detail-panel', () => ({
  ActivityDetailPanel: ({
    activity,
    activityExpenses,
    budgetReferences,
    onExpensesChanged,
    pendingExpenses,
  }: {
    activity: { title: string } | null
    activityExpenses: ActivityExpenseEntry[]
    budgetReferences: ExpenseBudgetReference[]
    onExpensesChanged: () => void
    pendingExpenses: PendingExpense[]
  }) =>
    activity ? (
      <section aria-label="Activity panel">
        <output data-testid="references">{budgetReferences.map((row) => row.id).join(',')}</output>
        <output data-testid="pending">
          {JSON.stringify(
            pendingExpenses.map(({ id, amount, category, status, projectId: scope }) => ({
              id,
              amount,
              category,
              status,
              scope,
            })),
          )}
        </output>
        <output data-testid="logged">
          {JSON.stringify(
            activityExpenses.map(({ id, amount, category, status }) => ({
              id,
              amount,
              category,
              status,
            })),
          )}
        </output>
        <button onClick={onExpensesChanged} type="button">
          Refresh expenses
        </button>
      </section>
    ) : null,
}))

const summary = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic outreach',
  description: 'Community sessions',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-12-01',
  assignedUserIds: [],
  assignedTo: ['Officer'],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  progress: 20,
  updatedAt: '2026-09-25T00:00:00.000Z',
  overdueExplanationNeeded: false,
}
const detail = {
  ...summary,
  assignedEmails: [],
  beneficiariesReached: 3,
  budgetAllocation: null,
  budgetLogged: null,
  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
}
const expense = (id: string, budgetRecordId: string, status: string, amount: string) => ({
  id,
  budgetRecordId,
  amount,
  status,
  expenseDate: '2026-09-01',
  description: `Expense ${id}`,
  updatedAt: '2026-09-02T00:00:00.000Z',
  receiptEvidenceId: null,
  submittedByName: 'Ana Cruz',
  verifiedByName: null,
  approvedByName: null,
})

let client: QueryClient
const renderWorkspace = () =>
  render(
    <QueryClientProvider client={client}>
      <AuthorizedQueryProvider>
        <ProjectActivitiesWorkspace initialActivityId={activityId} projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

const basePermissions = [
  'projects.read',
  'projects.detail.read',
  'activities.read',
  'journeys.read',
]

const asMonitoringOfficer = () => {
  access.role = 'Monitoring and Evaluation Officer'
  access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  access.profile.permissions = [...basePermissions, 'expenses.read', 'expenses.submit']
}
const asProjectManager = () => {
  access.role = 'Project Manager'
  access.profile.roles = ['PROJECT_MANAGER']
  access.profile.permissions = [...basePermissions, 'expenses.read', 'budgets.read']
}

describe('activity expenses derived for the open activity', () => {
  beforeEach(() => {
    client = new QueryClient()
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Assigned project',
      area: 'Area',
      sector: 'Sector',
      period: '2026',
      status: 'Active',
      projectOfficers: [],
      team: [],
    })
    api.getActivities.mockResolvedValue([summary])
    api.getActivity.mockResolvedValue(detail)
    api.getProjectIndicators.mockResolvedValue([])
    api.getJourneyStages.mockResolvedValue([])
    api.getAssignableProjectOfficers.mockResolvedValue([])
    core.budgetReferences.mockResolvedValue([
      { id: 'ref-1', category: 'TRAINING', activityId },
      { id: 'ref-other', category: 'VENUE', activityId: otherActivityId },
    ])
    core.budgets.mockResolvedValue([
      { id: 'ref-1', category: 'TRAINING', activityId },
      { id: 'line-2', category: 'SUPPLIES', activityId },
    ])
    core.expenses.mockResolvedValue([
      expense('e-pending', 'ref-1', 'PENDING', '250.50'),
      expense('e-verified', 'line-2', 'VERIFIED', '100'),
      expense('e-rejected', 'ref-1', 'REJECTED', '75'),
      expense('e-other', 'ref-other', 'PENDING', '40'),
    ])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('gives a validator the references and the pending expense, and logs only what the references link', async () => {
    asMonitoringOfficer()
    renderWorkspace()

    await waitFor(() =>
      expect(screen.getByTestId('references').textContent).toBe('ref-1,ref-other'),
    )
    await waitFor(() => expect(screen.getByTestId('pending').textContent).not.toBe('[]'))
    expect(JSON.parse(screen.getByTestId('pending').textContent ?? '')).toEqual([
      {
        id: 'e-pending',
        amount: 250.5,
        category: 'TRAINING',
        status: 'For Verification',
        scope: projectId,
      },
    ])
    expect(JSON.parse(screen.getByTestId('logged').textContent ?? '')).toEqual([
      { id: 'e-pending', amount: 250.5, category: 'TRAINING', status: 'PENDING' },
    ])
    expect(core.budgets).not.toHaveBeenCalled()
  })

  it('logs every unrejected expense of the activity for an approver who reads budget lines', async () => {
    asProjectManager()
    renderWorkspace()

    await waitFor(() => expect(screen.getByTestId('logged').textContent).toContain('e-verified'))
    expect(JSON.parse(screen.getByTestId('logged').textContent ?? '')).toEqual([
      { id: 'e-pending', amount: 250.5, category: 'TRAINING', status: 'PENDING' },
      { id: 'e-verified', amount: 100, category: 'SUPPLIES', status: 'VERIFIED' },
    ])
    expect(screen.getByTestId('references').textContent).toBe('')
    expect(screen.getByTestId('pending').textContent).toBe('[]')
    expect(core.budgetReferences).not.toHaveBeenCalled()
  })

  it('rereads the expenses, references and the activity after a change', async () => {
    asMonitoringOfficer()
    renderWorkspace()

    await waitFor(() => expect(screen.getByTestId('pending').textContent).not.toBe('[]'))
    const before = {
      expenses: core.expenses.mock.calls.length,
      references: core.budgetReferences.mock.calls.length,
      activity: api.getActivity.mock.calls.length,
    }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh expenses' }))

    await waitFor(() => {
      expect(core.expenses.mock.calls.length).toBe(before.expenses + 1)
      expect(core.budgetReferences.mock.calls.length).toBe(before.references + 1)
      expect(api.getActivity.mock.calls.length).toBe(before.activity + 1)
    })
  })
})
```

```bash
pnpm exec biome check --write apps/web/src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx
pnpm --filter @pathways/web exec vitest run src/features/projects/activities/components/project-activities-workspace.expenses.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 2: Create the detail panel script and split it**

`.tmp/s2b/split-detail-panel.mjs` (keeps `ActivityDetailPanel` in its file; moves `ActivityDetailContent` to `activity-detail-content.tsx`, the proof, notes and overdue sections to `ActivityHistory`, the sticky action bar to `ActivityDetailActions` and the proof grouping helpers to `activity-proof.utils.ts`):

```js
// Splits the activity detail panel into the panel, its content, the history sections, the action bar and the proof grouping helpers, verbatim.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/activities'
const panelFile = `${dir}/components/activity-detail-panel.tsx`
const text = readFileSync(panelFile, 'utf8')

// Returns the index of an anchor, throwing when it is missing.
function indexOf(source, anchor) {
  const at = source.indexOf(anchor)
  if (at < 0) throw new Error(`missing: ${anchor}`)
  return at
}

const utilsStart = indexOf(text, 'type ProofGroup = ')
const contentStart = indexOf(text, 'export const ActivityDetailContent = ({\n')
const panelStart = indexOf(text, 'export const ActivityDetailPanel = ({\n')
const importBlock = text.slice(0, utilsStart)
const utilsBlock = text
  .slice(utilsStart, contentStart)
  .replace('type ProofGroup =', 'export type ProofGroup =')
  .replace('const groupProofsByUpdate =', 'export const groupProofsByUpdate =')
  .replace('const proofTone =', 'export const proofTone =')
  .replace('const formatProofDate =', 'export const formatProofDate =')
let content = text.slice(contentStart, panelStart)
const panelPart = text.slice(panelStart)

writeFileSync(
  `${dir}/activity-proof.utils.ts`,
  `import type { ActivityProof } from '@/types/pathways'\n\n${utilsBlock.trimEnd()}\n`,
)

// The proof history, notes and overdue explanation sections, which are siblings in the content.
const historyStart = indexOf(content, '      <section aria-labelledby={`proof-history-${activity.id}`}>\n')
const historyEnd = indexOf(content, '      {incompleteProof && ownIncompleteProof && showSubmitProof ? (\n')
const history = content.slice(historyStart, historyEnd)
content = `${content.slice(0, historyStart)}      <ActivityHistory
        activity={activity}
        canDecideProof={canDecideProof}
        canOpenProof={canOpenProof}
        canValidateProof={canValidateProof}
        onSubmitProof={onSubmitProof}
        requestedProofId={requestedProofId}
        setReviewTarget={setReviewTarget}
        showSubmitProof={showSubmitProof}
      />
${content.slice(historyEnd)}`

writeFileSync(
  `${dir}/components/activity-history.tsx`,
  `import { ClipboardCheck, FileText, UploadCloud } from 'lucide-react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import type { Activity, ActivityProof } from '@/types/pathways'

import { formatDate } from '../activities.utils'
import { formatProofDate, groupProofsByUpdate, proofTone } from '../activity-proof.utils'
import { categoryLabels } from './activity-explain-delay-dialog'
import { ActivityProofFiles } from './activity-proof-files'

export const ActivityHistory = ({
  activity,
  canDecideProof,
  canOpenProof,
  canValidateProof,
  onSubmitProof,
  requestedProofId,
  setReviewTarget,
  showSubmitProof,
}: {
  activity: Activity
  canDecideProof: boolean
  canOpenProof: boolean
  canValidateProof: boolean
  onSubmitProof: (activity: Activity) => void
  requestedProofId?: string
  setReviewTarget: (target: { mode: 'validate' | 'decide'; proof: ActivityProof }) => void
  showSubmitProof: boolean
}) => (
  <>
${history.trimEnd()}
  </>
)
`,
)

// The sticky action bar, from its opening tag to the extension panel.
const actionsStart = indexOf(
  content,
  '      <div className="sticky bottom-0 -mx-1 grid grid-cols-1 gap-2 border-t border-border bg-card/95 px-1 pb-1 pt-4 backdrop-blur">\n',
)
const actionsEnd = indexOf(content, '      <ActivityExtensionPanel\n')
const actions = content.slice(actionsStart, actionsEnd)
content = `${content.slice(0, actionsStart)}      <ActivityDetailActions
        activity={activity}
        canLogExpense={canLogExpense}
        canRequestExtension={canRequestExtension}
        onEdit={onEdit}
        onSubmitProof={onSubmitProof}
        ownIncompleteProof={ownIncompleteProof}
        setExpenseOpen={setExpenseOpen}
        setExplainDelayOpen={setExplainDelayOpen}
        setExtensionOpen={setExtensionOpen}
        setProgressOpen={setProgressOpen}
        showEdit={showEdit}
        showExplainDelay={showExplainDelay}
        showRecordProgress={showRecordProgress}
        showSubmitProof={showSubmitProof}
      />

${content.slice(actionsEnd)}`

writeFileSync(
  `${dir}/components/activity-detail-actions.tsx`,
  `import {
  BellRing,
  CalendarClock,
  Pencil,
  ReceiptText,
  TrendingUp,
  UploadCloud,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Activity } from '@/types/pathways'

export const ActivityDetailActions = ({
  activity,
  canLogExpense,
  canRequestExtension,
  onEdit,
  onSubmitProof,
  ownIncompleteProof,
  setExpenseOpen,
  setExplainDelayOpen,
  setExtensionOpen,
  setProgressOpen,
  showEdit,
  showExplainDelay,
  showRecordProgress,
  showSubmitProof,
}: {
  activity: Activity
  canLogExpense: boolean
  canRequestExtension: boolean
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
  ownIncompleteProof: boolean
  setExpenseOpen: (open: boolean) => void
  setExplainDelayOpen: (open: boolean) => void
  setExtensionOpen: (open: boolean) => void
  setProgressOpen: (open: boolean) => void
  showEdit: boolean
  showExplainDelay: boolean
  showRecordProgress: boolean
  showSubmitProof: boolean
}) => (
${actions.trimEnd()}
)
`,
)

// The content keeps the original imports; the helper, history and action modules join them.
writeFileSync(
  `${dir}/components/activity-detail-content.tsx`,
  `${importBlock}import { groupProofsByUpdate, proofTone } from '../activity-proof.utils'
import { ActivityDetailActions } from './activity-detail-actions'
import { ActivityHistory } from './activity-history'

${content.trimEnd()}
`,
)

writeFileSync(
  panelFile,
  `'use client'

import { useEffect, useRef } from 'react'

import { AsyncState } from '@/components/pathways/async-state'
import { SidePanel } from '@/components/pathways'
import { Sheet } from '@/components/ui/sheet'
import type {
  Activity,
  Indicator,
  JourneyStageConfig,
  ProjectIndicator,
  ProjectTeamMember,
} from '@/types/pathways'

import type { ExpenseBudgetReference } from '../../activity-expense-dialog'
import type { PendingExpense } from '../../activity-expense-review-dialog'
import { ActivityDetailContent } from './activity-detail-content'
import type { ActivityExpenseEntry } from './activity-detail-sections'

${panelPart.trimEnd()}
`,
)
console.log('written: activity-proof.utils.ts, activity-history.tsx, activity-detail-actions.tsx, activity-detail-content.tsx, activity-detail-panel.tsx')
```

```bash
D=apps/web/src/features/projects/activities
cp $D/components/activity-detail-panel.tsx .tmp/s2b/detail-panel.before.tsx
node .tmp/s2b/split-detail-panel.mjs
node .tmp/s2b/trim-imports.mjs $D/components/activity-detail-content.tsx $D/components/activity-detail-panel.tsx $D/components/activity-history.tsx $D/components/activity-detail-actions.tsx $D/activity-proof.utils.ts
node .tmp/s2b/same-lines.mjs .tmp/s2b/detail-panel.before.tsx $D/components/activity-detail-content.tsx $D/components/activity-detail-panel.tsx $D/components/activity-history.tsx $D/components/activity-detail-actions.tsx $D/activity-proof.utils.ts
git mv $D/components/activity-detail-panel.test.tsx $D/components/activity-detail-content.test.tsx
sed -i "s#from './activity-detail-panel'#from './activity-detail-content'#" $D/components/activity-detail-content.test.tsx
```

Expected: `written: activity-proof.utils.ts, activity-history.tsx, activity-detail-actions.tsx, activity-detail-content.tsx, activity-detail-panel.tsx`; the trim removes `AsyncState, BellRing, CalendarClock, ClipboardCheck, FileText, Pencil, TrendingUp, UploadCloud, useEffect, useRef, SidePanel, Button, Sheet, categoryLabels, ActivityProofFiles` from `activity-detail-content.tsx` and nothing from the other four files; the check prints `original lines 732, lost 0, added 80`; the test file's only reference to the old module is its one import, which the `sed` repoints.

- [ ] **Step 3: Create the workspace script and split it**

`.tmp/s2b/split-workspace.mjs` (moves `ActivityCard` and `ActivityStatusSummary` to their own files, the expense reads and derived rows to `useActivityExpenses`, and the search, status and view state with the filtered lists to `useActivityFilters`):

```js
// Moves the card, status summary, expense reads and filter state out of the activities workspace, verbatim.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/activities'
const workspaceFile = `${dir}/components/project-activities-workspace.tsx`
let text = readFileSync(workspaceFile, 'utf8')

// Returns the index of an anchor, throwing when it is missing.
function indexOf(anchor) {
  const at = text.indexOf(anchor)
  if (at < 0) throw new Error(`missing: ${anchor}`)
  return at
}

// Removes the text from a start anchor up to, not including, an end anchor and returns it.
function cut(start, end) {
  const from = indexOf(start)
  const to = text.indexOf(end, from + start.length)
  if (to < 0) throw new Error(`missing end: ${end}`)
  const piece = text.slice(from, to)
  text = text.slice(0, from) + text.slice(to)
  return piece
}

const indicatorSummary = cut('const indicatorSummary = (', '// A saved activity keeps the list-only metrics')
const card = cut('const ActivityCard = ({\n', 'const ActivityStatusSummary = ({\n')
const summary = cut('const ActivityStatusSummary = ({\n', 'export const ProjectActivitiesWorkspace = ({\n')

writeFileSync(
  `${dir}/components/activity-card.tsx`,
  `import { CalendarClock, Eye, UsersRound } from 'lucide-react'

import { ProgressBar, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import type { ActivitySummary } from '@/types/pathways'

import {
  activityDueLabel,
  activityNextStep,
  activityProgressTone,
  activityStatusTone,
} from '../activities.utils'

export ${card.trimEnd()}
`,
)
writeFileSync(
  `${dir}/components/activity-status-summary.tsx`,
  `import { StatusBadge } from '@/components/pathways'
import type { ActivityStatus } from '@/types/pathways'

import { activityStatusTone, activityStatuses } from '../activities.utils'

export ${summary.trimEnd()}
`,
)
text = text.replace(
  "import { ActivityDetailPanel } from './activity-detail-panel'\n",
  "import { useActivityExpenses } from '../hooks/use-activity-expenses'\nimport { useActivityFilters } from '../hooks/use-activity-filters'\nimport { ActivityCard } from './activity-card'\nimport { ActivityDetailPanel } from './activity-detail-panel'\n",
)
text = text.replace(
  "import { ActivityProofDialog } from './activity-proof-dialog'\n",
  "import { ActivityProofDialog } from './activity-proof-dialog'\nimport { ActivityStatusSummary } from './activity-status-summary'\n",
)

// The expense reads and the rows derived from them, from the fetch comment to the detail error flag.
const expenses = cut(
  '  // Fetched once per workspace visit rather than per activity: the panel filters the\n',
  '  const detailNotFound =\n',
)
const expenseStart = text.indexOf('  const detailNotFound =\n')
text = `${text.slice(0, expenseStart)}  const { activityExpenses, budgetReferences, pendingExpenses, refreshExpenses } =
    useActivityExpenses({
      canReadBudgetLines,
      canReadExpenseReferences,
      canReadExpenses,
      projectId,
      refetchDetail: () => detail.refetch(),
      selectedActivity,
    })
${text.slice(expenseStart)}`

// The filter state is declared with the other state and the derived lists after the detail flag.
const stateLines =
  "  const [query, setQuery] = useState('')\n  const [statusFilter, setStatusFilter] = useState<ActivityStatus | null>(null)\n  const [viewMode, setViewMode] = useState<'board' | 'list'>('list')\n"
if (!text.includes(stateLines)) throw new Error('missing the filter state lines')
text = text.replace(stateLines, '')
const filters = cut('  const filteredActivities = useMemo(() => {\n', '  const upsertActivity = (')
const filterStart = text.indexOf('  const upsertActivity = (')
text = `${text.slice(0, filterStart)}  const {
    activityStatusCounts,
    filteredActivities,
    query,
    setQuery,
    setStatusFilter,
    setViewMode,
    statusFilter,
    viewMode,
    visibleActivityStatuses,
  } = useActivityFilters(activities, indicators)

${text.slice(filterStart)}`
writeFileSync(workspaceFile, text)

const expenseBody = expenses.replace('void detail.refetch()', 'void refetchDetail()')
if (expenseBody === expenses) throw new Error('missing the detail refetch')
mkdirSync(`${dir}/hooks`, { recursive: true })
writeFileSync(
  `${dir}/hooks/use-activity-expenses.ts`,
  `import { useMemo } from 'react'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { coreDataClient } from '@/lib/services/core-feature-client'
import type { Activity } from '@/types/pathways'

import type { ExpenseBudgetReference } from '../../activity-expense-dialog'
import type { PendingExpense } from '../../activity-expense-review-dialog'
import type { ActivityExpenseEntry } from '../components/activity-detail-sections'

export const useActivityExpenses = ({
  canReadBudgetLines,
  canReadExpenseReferences,
  canReadExpenses,
  projectId,
  refetchDetail,
  selectedActivity,
}: {
  canReadBudgetLines: boolean
  canReadExpenseReferences: boolean
  canReadExpenses: boolean
  projectId: string
  refetchDetail: () => Promise<unknown>
  selectedActivity: Activity | null
}) => {
${expenseBody.trimEnd()}

  return { activityExpenses, budgetReferences, pendingExpenses, refreshExpenses }
}
`,
)

writeFileSync(
  `${dir}/hooks/use-activity-filters.ts`,
  `import { useMemo, useState } from 'react'

import type { ActivityStatus, ActivitySummary, Indicator } from '@/types/pathways'

import { activityStatuses } from '../activities.utils'

${indicatorSummary.trimEnd()}

export const useActivityFilters = (activities: ActivitySummary[], indicators: Indicator[]) => {
${stateLines}
${filters.trimEnd()}

  return {
    activityStatusCounts,
    filteredActivities,
    query,
    setQuery,
    setStatusFilter,
    setViewMode,
    statusFilter,
    viewMode,
    visibleActivityStatuses,
  }
}
`,
)
console.log('written: activity-card.tsx, activity-status-summary.tsx, hooks/use-activity-expenses.ts, hooks/use-activity-filters.ts')
```

```bash
D=apps/web/src/features/projects/activities
cp $D/components/project-activities-workspace.tsx .tmp/s2b/workspace.before.tsx
node .tmp/s2b/split-workspace.mjs
node .tmp/s2b/trim-imports.mjs $D/components/project-activities-workspace.tsx $D/components/activity-card.tsx $D/components/activity-status-summary.tsx $D/hooks/use-activity-expenses.ts $D/hooks/use-activity-filters.ts
node .tmp/s2b/same-lines.mjs .tmp/s2b/workspace.before.tsx $D/components/project-activities-workspace.tsx $D/components/activity-card.tsx $D/components/activity-status-summary.tsx $D/hooks/use-activity-expenses.ts $D/hooks/use-activity-filters.ts refetchDetail=detail.refetch
```

Expected: `written: activity-card.tsx, activity-status-summary.tsx, hooks/use-activity-expenses.ts, hooks/use-activity-filters.ts`; the trim removes `CalendarClock, Eye, UsersRound, useMemo, ProgressBar, StatusBadge, coreDataClient, ActivityStatus, Indicator, ExpenseBudgetReference, PendingExpense, activityDueLabel, activityNextStep, activityProgressTone, activityStatusTone, activityStatuses, ActivityExpenseEntry` from the workspace and nothing from the other four files; the check prints `original lines 667, lost 0, added 50` (the `refetchDetail=detail.refetch` argument undoes the one renamed call, `void detail.refetch()`).

- [ ] **Step 4: Format and verify**

```bash
D=apps/web/src/features/projects/activities
pnpm exec biome check --write $D
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
wc -l $D/components/activity-detail-content.tsx $D/components/activity-detail-panel.tsx $D/components/activity-history.tsx $D/components/activity-detail-actions.tsx $D/activity-proof.utils.ts $D/components/project-activities-workspace.tsx $D/components/activity-card.tsx $D/components/activity-status-summary.tsx $D/hooks/use-activity-expenses.ts $D/hooks/use-activity-filters.ts
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: typecheck lists only the two dev lines; the sizes are 361, 155, 242, 97, 45, 490, 83, 38, 123 and 91 lines (none above 500); web = Task 4 plus the new test file (220 files, 1972 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): split the activity detail panel and the activities workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Activity reads, copy and the two contract-backed web types

**Files:**
- Create (gitignored): `.tmp/s2b/move-activity-reads.mjs`, `move-copy-and-aliases.mjs`
- Create: `activities/activities.reads.ts`, `activities/activities.copy.ts`
- Test: `activities/activities.reads.test.ts`
- Modify: `apps/web/src/features/projects/projects.reads.ts`, `budget-module/use-budget-module.ts`, `activities/components/project-activities-workspace.tsx`, `activity-explain-delay-dialog.tsx`, `activity-history.tsx`, `activity-detail-content.test.tsx`, `apps/web/src/types/pathways.ts`

(`activities/` below is `apps/web/src/features/projects/activities/`.)

**Interfaces:**
- Consumes: Task 5's layout; `ActivityCapabilitiesResponse` and `AssignableOfficerResponse` from `@pathways/shared`.
- Produces: `useProjectActivitiesRead(projectId: string, enabled = true)`, `useActivityDetailRead(projectId: string, activityId: string | null)` and `useAssignableOfficersRead(projectId: string, permission: 'activities.create' | 'activities.update', enabled: boolean)` from `activities/activities.reads.ts`; `categoryLabels: Record<OverdueExplanationCategory, string>` from `activities/activities.copy.ts`; `ActivityCapabilities` and `AssignableProjectOfficer` in `types/pathways.ts` become aliases of the contract types. The resource keys `project-activities`, `activity-detail:<id>` and `activity-assignable-officers`, their permissions, enabled flags and freshness do not change.

- [ ] **Step 1: Write the failing reads test**

It replaces `useAuthorizedRead` with a spy, so it pins every argument that decides which cache entry a read uses. Create `apps/web/src/features/projects/activities/activities.reads.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
}))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: client }))

import {
  useActivityDetailRead,
  useAssignableOfficersRead,
  useProjectActivitiesRead,
} from './activities.reads'

const signal = new AbortController().signal

describe('activity authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    client.getActivities.mockReset()
    client.getActivity.mockReset()
    client.getAssignableProjectOfficers.mockReset()
  })

  it('reads the project activity list under one shared key with summary freshness', () => {
    useProjectActivitiesRead('project-1')
    useProjectActivitiesRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['project-activities', 'project-1', 'activities.read'],
      ['project-activities', 'project-2', 'activities.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(client.getActivities).toHaveBeenCalledWith('project-1', signal)
  })

  it('reads one activity under its own key, always re-verified, and stays idle without an id', () => {
    useActivityDetailRead('project-1', 'activity-1')
    useActivityDetailRead('project-1', null)
    expect(read.mock.calls[0].slice(0, 3)).toEqual([
      'activity-detail:activity-1',
      'project-1',
      'activities.read',
    ])
    expect(read.mock.calls[0][4]).toBe(true)
    expect(read.mock.calls[0][5]).toBeUndefined()
    expect(read.mock.calls[1].slice(0, 3)).toEqual([
      'activity-detail:none',
      'project-1',
      'activities.read',
    ])
    expect(read.mock.calls[1][4]).toBe(false)
    read.mock.calls[0][3](signal)
    expect(client.getActivity).toHaveBeenCalledWith('project-1', 'activity-1', signal)
    read.mock.calls[1][3](signal)
    expect(client.getActivity).toHaveBeenLastCalledWith('project-1', '', signal)
  })

  it('reads the assignable officers under the create or update permission the caller holds', () => {
    useAssignableOfficersRead('project-1', 'activities.create', true)
    useAssignableOfficersRead('project-1', 'activities.update', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['activity-assignable-officers', 'project-1', 'activities.create'],
      ['activity-assignable-officers', 'project-1', 'activities.update'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    read.mock.calls[0][3](signal)
    expect(client.getAssignableProjectOfficers).toHaveBeenCalledWith('project-1', signal)
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/features/projects/activities/activities.reads.test.ts`
Expected: FAIL with `Failed to resolve import "./activities.reads"`.

- [ ] **Step 2: Create the scripts**

`.tmp/s2b/move-activity-reads.mjs` (moves the two activity hooks out of `projects.reads.ts` with their keys, adds the officers read, and repoints the workspace and the budget module):

```js
// Moves the activity read hooks out of projects.reads.ts into activities.reads.ts and adds the assignable officers read.
import { readFileSync, writeFileSync } from 'node:fs'

const feature = 'apps/web/src/features/projects'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 70)}`)
  return text.replace(from, to)
}

let reads = readFileSync(`${feature}/projects.reads.ts`, 'utf8')
reads = replaceOnce(reads, "  activities: 'project-activities',\n", '')
reads = replaceOnce(reads, '  activityDetail: (activityId: string) => `activity-detail:${activityId}`,\n', '')

const listStart = reads.indexOf('export const useProjectActivitiesRead = ')
const listEnd = reads.indexOf('/** Full indicator rows;')
const detailStart = reads.indexOf('/** Activity detail carries proof and update history')
if (listStart < 0 || listEnd < 0 || detailStart < 0) throw new Error('missing a hook anchor')
const listHook = reads.slice(listStart, listEnd)
const detailHook = reads.slice(detailStart)
reads = `${reads.slice(0, listStart)}${reads.slice(listEnd, detailStart)}`.trimEnd() + '\n'
writeFileSync(`${feature}/projects.reads.ts`, reads)

const renamed = (hook) =>
  hook
    .replace('projectReadResources.activities', 'activityReadResources.list')
    .replace('projectReadResources.activityDetail', 'activityReadResources.detail')
writeFileSync(
  `${feature}/activities/activities.reads.ts`,
  `'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { activitiesClient } from '@/lib/api/activities'

const summary = { freshness: 'summary' } as const

/** Stable resource keys, so the Activities tab and the budget module share one list read. */
const activityReadResources = {
  list: 'project-activities',
  detail: (activityId: string) => \`activity-detail:\${activityId}\`,
  assignableOfficers: 'activity-assignable-officers',
} as const

${renamed(listHook).trimEnd()}

${renamed(detailHook).trimEnd()}

/** Project-scoped officers the editor may assign (user id and display name only), never GET /users. */
export const useAssignableOfficersRead = (
  projectId: string,
  permission: 'activities.create' | 'activities.update',
  enabled: boolean,
) =>
  useAuthorizedRead(
    activityReadResources.assignableOfficers,
    projectId,
    permission,
    (signal) => activitiesClient.getAssignableProjectOfficers(projectId, signal),
    enabled,
  )
`,
)

const workspaceFile = `${feature}/activities/components/project-activities-workspace.tsx`
let workspace = readFileSync(workspaceFile, 'utf8')
workspace = replaceOnce(
  workspace,
  `  const officerRead = useAuthorizedRead(
    'activity-assignable-officers',
    projectId,
    canCreate ? 'activities.create' : 'activities.update',
    (signal) => activitiesClient.getAssignableProjectOfficers(projectId, signal),
    canReadOfficers && formOpen,
  )
`,
  `  const officerRead = useAssignableOfficersRead(
    projectId,
    canCreate ? 'activities.create' : 'activities.update',
    canReadOfficers && formOpen,
  )
`,
)
workspace = replaceOnce(
  workspace,
  `import {
  useActivityDetailRead,
  useProjectActivitiesRead,
  useProjectIndicatorsRead,`,
  `import { useActivityDetailRead, useAssignableOfficersRead, useProjectActivitiesRead } from '../activities.reads'
import {
  useProjectIndicatorsRead,`,
)
writeFileSync(workspaceFile, workspace)

const budgetFile = `${feature}/budget-module/use-budget-module.ts`
const budget = readFileSync(budgetFile, 'utf8')
writeFileSync(
  budgetFile,
  replaceOnce(
    budget,
    "import { useProjectActivitiesRead, useProjectOverviewMetricsRead } from '../projects.reads'\n",
    "import { useProjectActivitiesRead } from '../activities/activities.reads'\nimport { useProjectOverviewMetricsRead } from '../projects.reads'\n",
  ),
)
console.log('written: activities.reads.ts; edited projects.reads.ts, the workspace and use-budget-module.ts')
```

`.tmp/s2b/move-copy-and-aliases.mjs` (moves `categoryLabels` to `activities.copy.ts`, drops its mock copy from the content test, and makes the two web types aliases of the contract types):

```js
// Moves the overdue category labels to activities.copy.ts and makes two web activity types aliases of the shared contract types.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/activities'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 70)}`)
  return text.replace(from, to)
}

const dialogFile = `${dir}/components/activity-explain-delay-dialog.tsx`
let dialog = readFileSync(dialogFile, 'utf8')
const labelsStart = dialog.indexOf('export const categoryLabels: Record<OverdueExplanationCategory, string> = {\n')
const labelsEnd = dialog.indexOf('const categoryOptions = ')
if (labelsStart < 0 || labelsEnd < 0) throw new Error('missing the labels block')
const labels = dialog.slice(labelsStart, labelsEnd)
dialog = dialog.slice(0, labelsStart) + dialog.slice(labelsEnd)
dialog = replaceOnce(
  dialog,
  "import { definitiveRejection } from './activity-progress-dialog'\n",
  "import { categoryLabels } from '../activities.copy'\nimport { definitiveRejection } from './activity-progress-dialog'\n",
)
writeFileSync(dialogFile, dialog)
writeFileSync(
  `${dir}/activities.copy.ts`,
  `import type { OverdueExplanationCategory } from '@pathways/shared'\n\n${labels.trimEnd()}\n`,
)

const historyFile = `${dir}/components/activity-history.tsx`
writeFileSync(
  historyFile,
  replaceOnce(
    readFileSync(historyFile, 'utf8'),
    "import { categoryLabels } from './activity-explain-delay-dialog'\n",
    '',
  ).replace("import { formatDate } from '../activities.utils'\n", "import { categoryLabels } from '../activities.copy'\nimport { formatDate } from '../activities.utils'\n"),
)

const testFile = `${dir}/components/activity-detail-content.test.tsx`
writeFileSync(
  testFile,
  replaceOnce(
    readFileSync(testFile, 'utf8'),
    `  categoryLabels: {
    WEATHER: 'Weather',
    SECURITY: 'Security',
    FUNDING: 'Funding',
    COMMUNITY: 'Community',
    LOGISTICS: 'Logistics',
    OTHER: 'Other',
  },
`,
    '',
  ),
)

const typesFile = 'apps/web/src/types/pathways.ts'
let types = readFileSync(typesFile, 'utf8')
types = replaceOnce(
  types,
  `export interface ActivityCapabilities {
  canEdit: boolean
  canRecordProgress: boolean
  canSubmitProof: boolean
  canExplainOverdue: boolean
}
`,
  'export type ActivityCapabilities = ActivityCapabilitiesResponse\n',
)
types = replaceOnce(
  types,
  `export interface AssignableProjectOfficer {
  userId: string
  displayName: string
}
`,
  'export type AssignableProjectOfficer = AssignableOfficerResponse\n',
)
types = replaceOnce(types, '  StoredProjectStatus,\n', '  StoredProjectStatus,\n  ActivityCapabilitiesResponse,\n  AssignableOfficerResponse,\n')
writeFileSync(typesFile, types)
console.log('written: activities.copy.ts; edited the dialog, the history, the content test and types/pathways.ts')
```

- [ ] **Step 3: Run them**

```bash
D=apps/web/src/features/projects/activities
node .tmp/s2b/move-activity-reads.mjs
node .tmp/s2b/trim-imports.mjs apps/web/src/features/projects/projects.reads.ts $D/components/project-activities-workspace.tsx $D/activities.reads.ts
node .tmp/s2b/move-copy-and-aliases.mjs
node .tmp/s2b/trim-imports.mjs $D/components/activity-explain-delay-dialog.tsx $D/components/activity-history.tsx
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
git grep -n "project-activities'\|activity-detail:" -- apps/web/src
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: `written: activities.reads.ts; edited projects.reads.ts, the workspace and use-budget-module.ts`; the first trim removes `activitiesClient` from `projects.reads.ts` and `useAuthorizedRead, activitiesClient` from the workspace; `written: activities.copy.ts; edited the dialog, the history, the content test and types/pathways.ts`; the second trim removes nothing; typecheck lists only the two dev lines (line numbers may move); the grep prints `activities.reads.ts` (the two keys now live there once), its test, and one policy example in `providers/authorized-query-cache.test.tsx`; web = Task 5 plus the reads test file (221 files, 1975 tests). In `types/pathways.ts` the two interfaces are now one-line aliases, so the `ActivityCapabilities` and `AssignableProjectOfficer` importers (the parsers, the form, the fields and the tests) are untouched.

- [ ] **Step 4: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): add the activity reads and copy modules and alias two types to the contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Move the extension schema to the activity contracts

**Files:**
- Create (gitignored): `.tmp/s2b/move-extension-contract.mjs`
- Move: `packages/shared/src/monitoring/activity-extension.ts` to `packages/shared/src/contracts/activities/activity-extension-response.ts`
- Test: `packages/shared/src/contracts/activities/activity-extension-response.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/web/src/lib/api/activity-extensions.ts`, `apps/api/src/modules/activity-extensions/activity-extensions.service.test.ts`

**Interfaces:**
- Consumes: `isCalendarDate` from `packages/shared/src/monitoring/metric-math.ts`.
- Produces: `activityExtensionResponse` (the strict zod schema, renamed from `activityExtensionSchema`), `ActivityExtension`, `ActivityExtensionStatus` and `activityExtensionStatuses` from `@pathways/shared`, exported from `contracts/activities/activity-extension-response.ts` in the barrel after `activity-extension-requests`. Nothing else in the barrel changes. S7 Task 5 relies on this move.

- [ ] **Step 1: Write the failing contract test**

The web parses this schema at runtime, so the test pins what it accepts and refuses. Create `packages/shared/src/contracts/activities/activity-extension-response.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { activityExtensionResponse, activityExtensionStatuses } from './activity-extension-response'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const person = { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Cruz' }
const row = {
  id: uuid,
  projectId: '10000000-0000-4000-8000-000000000003',
  activityId: '10000000-0000-4000-8000-000000000004',
  currentEndDate: '2026-12-31',
  requestedEndDate: '2027-01-31',
  reason: 'The venue was unavailable.',
  status: 'PENDING',
  requestedBy: person,
  requestedAt: instant,
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: instant,
}
const accepts = (value: unknown) => activityExtensionResponse.safeParse(value).success

describe('activity extension response contract', () => {
  it('takes a pending request and a decided one with its reviewers', () => {
    expect(accepts(row)).toBe(true)
    expect(
      accepts({
        ...row,
        status: 'APPROVED',
        verifiedBy: person,
        verifiedAt: instant,
        verificationNote: 'Verified.',
        decidedBy: person,
        decidedAt: instant,
        decisionNote: 'Approved.',
      }),
    ).toBe(true)
    expect(activityExtensionStatuses).toEqual([
      'PENDING',
      'VERIFIED',
      'RETURNED',
      'APPROVED',
      'DECLINED',
    ])
  })

  it('has a null current end date for an activity without one', () => {
    expect(accepts({ ...row, currentEndDate: null })).toBe(true)
  })

  it.each([
    ['an unknown key', { ...row, extra: true }],
    ['an unknown status', { ...row, status: 'WITHDRAWN' }],
    ['a date that is not on the calendar', { ...row, requestedEndDate: '2027-02-30' }],
    ['an unknown key on a person', { ...row, requestedBy: { ...person, email: 'a@example.test' } }],
    ['a note over 2000 characters', { ...row, reason: 'x'.repeat(2001) }],
    ['an instant without a time', { ...row, updatedAt: '2026-09-24' }],
  ])('refuses %s', (_label, value) => {
    expect(accepts(value)).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/activities/activity-extension-response.test.ts`
Expected: FAIL with `Cannot find module './activity-extension-response'`.

- [ ] **Step 2: Create the script and run it**

`.tmp/s2b/move-extension-contract.mjs` (`git mv` of the file, the rename inside it, the barrel line, and the two users with their expected counts):

```js
// Moves the activity extension schema to contracts/activities as activityExtensionResponse and repoints its users.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(text, from, to) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 70)}`)
  return text.replace(from, to)
}

const from = 'packages/shared/src/monitoring/activity-extension.ts'
const to = 'packages/shared/src/contracts/activities/activity-extension-response.ts'
execFileSync('git', ['mv', from, to])

let schema = readFileSync(to, 'utf8')
schema = replaceOnce(schema, "import { isCalendarDate } from './metric-math'\n", "import { isCalendarDate } from '../../monitoring/metric-math'\n")
schema = replaceOnce(schema, 'export const activityExtensionSchema = z', 'export const activityExtensionResponse = z')
schema = replaceOnce(schema, 'z.infer<typeof activityExtensionSchema>', 'z.infer<typeof activityExtensionResponse>')
writeFileSync(to, schema)

const barrel = 'packages/shared/src/index.ts'
let index = readFileSync(barrel, 'utf8')
index = replaceOnce(index, "export * from './monitoring/activity-extension'\n", '')
index = replaceOnce(
  index,
  "export * from './contracts/activities/activity-extension-requests'\n",
  "export * from './contracts/activities/activity-extension-requests'\nexport * from './contracts/activities/activity-extension-response'\n",
)
writeFileSync(barrel, index)

const users = [
  ['apps/web/src/lib/api/activity-extensions.ts', 5],
  ['apps/api/src/modules/activity-extensions/activity-extensions.service.test.ts', 2],
]
for (const [file, expected] of users) {
  const text = readFileSync(file, 'utf8')
  const count = text.split('activityExtensionSchema').length - 1
  if (count !== expected) throw new Error(`${file}: expected ${expected} uses, found ${count}`)
  writeFileSync(file, text.replaceAll('activityExtensionSchema', 'activityExtensionResponse'))
}
console.log('moved the extension schema; repointed 2 files')
```

```bash
node .tmp/s2b/move-extension-contract.mjs
git grep -n "activityExtensionSchema" -- apps packages
pnpm exec biome check --write packages/shared apps/web/src/lib/api apps/api/src/modules/activity-extensions
```

Expected: `moved the extension schema; repointed 2 files`; the grep prints nothing.

- [ ] **Step 3: Verify the packages**

```bash
pnpm --filter @pathways/shared test 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @pathways/shared build
test -f packages/shared/dist/contracts/activities/activity-extension-response.js && echo "dist ok"
pnpm typecheck
pnpm --filter @pathways/api exec vitest run src/modules/activity-extensions 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: shared = `B_shared` + 1 file and 8 tests (24 files, 281 tests); `dist ok` (the shared build does not delete old output, so a stale `dist/monitoring/activity-extension.js` may remain locally; it is not tracked); typecheck clean for all packages; the four extension test files in the api run 3 files passed and 1 skipped (23 tests passed, 1 skipped; the skipped file is the local-database one); web unchanged (221 files, 1975 tests).

- [ ] **Step 4: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A packages apps/web/src apps/api/src
git commit -m "refactor(shared): move the activity extension schema to the activity contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Remove the dead multipart proof code from the source mutation tickets

**Files:**
- Create (gitignored): `.tmp/s2b/drop-dead-proof-code.mjs`
- Modify: `apps/web/src/lib/services/source-mutation.ts` (356 to 315 lines), `apps/web/src/lib/services/source-mutation.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SourceMutationTickets.execute(context, operation, body, send, parse, options?)` whose `options` are `requestId`, `keyField` and `allowLegacy` only; no `proofSnapshot`; no `files` field on a ticket. Every other export of the file is unchanged, and so are its first line, its last line and its single `uuid.test(` (S8 Task 0 checks all three).

- [ ] **Step 1: Recount the production callers**

```bash
git grep -nF ".execute(" -- apps/web/src ':!*.test.*'
git grep -n "proofSnapshot" -- apps/web/src
grep -n -B6 -A2 "keyField" apps/web/src/lib/services/pathways-client.ts
```

Expected: the first grep prints the two production calls, `lib/api/core/source-mutation-request.ts:20` (it passes no options) and `lib/services/pathways-client.ts` (the indicator measurement, which passes `{ requestId: clientMeasurementId, keyField: 'clientMeasurementId', allowLegacy: true }`); the second prints the definition and the two uses in the multipart test only; the last command shows the measurement call without a `files` option. If a production caller passes `files`, stop and report.

- [ ] **Step 2: Create the script and run it**

`.tmp/s2b/drop-dead-proof-code.mjs` (removes the `files` field, the `proofSnapshot` method, the `files` option, the two bound checks and the stored copy; deletes the multipart test and adds one for the request id, key field and legacy rules it also covered):

```js
// Removes the multipart-era files option, file bounds and proofSnapshot from the source mutation tickets and their test.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/lib/services/source-mutation.ts'
const testFile = 'apps/web/src/lib/services/source-mutation.test.ts'
let text = readFileSync(file, 'utf8')

// Removes the text from a start anchor up to, not including, an end anchor.
function cut(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`missing anchors: ${start.slice(0, 60)}`)
  return source.slice(0, from) + source.slice(to)
}

// Replaces one exact text, throwing when it is missing or occurs more than once.
function replaceOnce(source, from, to) {
  const count = source.split(from).length - 1
  if (count !== 1) throw new Error(`expected one occurrence, found ${count}: ${from.slice(0, 70)}`)
  return source.replace(from, to)
}

text = replaceOnce(text, '  pending: boolean\n  files?: readonly File[]\n', '  pending: boolean\n')
text = cut(text, '  proofSnapshot(context: SourceMutationContext, operation: string) {\n', '  async execute<T>(\n')
text = replaceOnce(text, '      allowLegacy?: boolean\n      files?: readonly File[]\n', '      allowLegacy?: boolean\n')
text = cut(
  text,
  '    if (\n      ticket &&\n      (ticket.files?.length !== options.files?.length ||',
  '    if (!ticket) {\n',
)
text = cut(text, '      if (\n        options.files &&\n', '      ticket = {\n')
text = replaceOnce(text, '        ...(options.files ? { files: [...options.files] } : {}),\n', '')
if (/files/.test(text)) throw new Error('files still mentioned in source-mutation.ts')
writeFileSync(file, text)

let test = readFileSync(testFile, 'utf8')
test = cut(
  test,
  "  it('preserves exact multipart handles and id across navigation",
  "  it('accepts legacy proof/measurement DTO only on their explicitly permitted path",
)
test = replaceOnce(
  test,
  "  it('accepts legacy proof/measurement DTO only on their explicitly permitted path",
  `  it('sends the caller request id under the configured key field and takes a legacy record only when allowed', async () => {
    const tickets = new SourceMutationTickets(() => 'unused')
    const send = vi.fn().mockResolvedValue({ id: 'record' })
    const options = { requestId: id, keyField: 'clientMeasurementId' } as const
    await expect(
      tickets.execute(context, 'POST:measurement', { value: 1 }, send, parse, {
        ...options,
        allowLegacy: true,
      }),
    ).resolves.toEqual({ id: 'record' })
    expect(send).toHaveBeenCalledWith({ value: 1, clientMeasurementId: id })
    await expect(
      tickets.execute(context, 'POST:measurement', { value: 2 }, send, parse, options),
    ).rejects.toThrow('could not be confirmed')
  })
  it('accepts legacy proof/measurement DTO only on their explicitly permitted path`,
)
writeFileSync(testFile, test)
console.log('removed the files option, file bounds and proofSnapshot; replaced the multipart test')
```

```bash
head -1 apps/web/src/lib/services/source-mutation.ts
tail -2 apps/web/src/lib/services/source-mutation.ts
node .tmp/s2b/drop-dead-proof-code.mjs
pnpm exec biome check --write apps/web/src/lib/services
wc -l apps/web/src/lib/services/source-mutation.ts
head -1 apps/web/src/lib/services/source-mutation.ts
tail -2 apps/web/src/lib/services/source-mutation.ts
grep -c "uuid.test(" apps/web/src/lib/services/source-mutation.ts
git grep -n "files" -- apps/web/src/lib/services/source-mutation.ts
pnpm --filter @pathways/web exec vitest run src/lib/services/source-mutation.test.ts 2>&1 | grep -E "Tests "
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: `removed the files option, file bounds and proofSnapshot; replaced the multipart test`; 315 lines; the first and last lines are identical before and after (`import { subscribeSensitiveDraftInvalidation } from '@/lib/auth/sensitive-drafts'` and `  sourceInvalidationSubscribed = true` then `}`); `uuid.test(` count `1`; the `files` grep prints nothing; the file's tests are 20 passed (one removed, one added); typecheck lists only the two dev lines; web unchanged (221 files, 1975 tests).

- [ ] **Step 3: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): remove the unused multipart proof option from the source mutation tickets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Records

**Files:**
- Create (gitignored): `.tmp/s2b/doc-paths.mjs`
- Modify: living docs that name moved files (`docs/qad-pathways.md`, `docs/dsd-pathways.md`, `docs/deferred-features.md`), `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16, MOD-17 rows), `docs/index.md` (CR row status), `docs/activity-log.md`

No SAD routing change is needed (rulings 2 and 15): the manifest of Task 10 shows the roles the changed paths already route to.

- [ ] **Step 1: Repoint the living docs that name moved files**

`.tmp/s2b/doc-paths.mjs` (rewrites each moved path, with or without the `apps/web/src/` prefix, unless the doc names a past location: after a commit hash and a colon, or in a clause that says the file was deleted; it takes the move maps and then the docs):

```js
// Rewrites the current-path mentions of moved web files in the living docs, with or without the apps/web/src prefix, leaving "<sha>:path" history references alone.
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const map = Object.assign({}, ...args.filter((arg) => arg.endsWith('.json')).map((file) => JSON.parse(readFileSync(file, 'utf8'))))
const docs = args.filter((arg) => !arg.endsWith('.json'))
let total = 0
for (const doc of docs) {
  let text = readFileSync(doc, 'utf8')
  let count = 0
  for (const [from, to] of Object.entries(map)) {
    // A path after "<sha>:" or "deleted `" names a past location and keeps its old path.
    const pattern = new RegExp(
      `(?<![0-9a-f]{7,40}:)(?<!deleted \`)(?<![A-Za-z0-9_-])${from.replaceAll('.', '\\.')}(?![A-Za-z0-9_-])`,
      'g',
    )
    text = text.replace(pattern, () => {
      count++
      return to
    })
  }
  if (!count) continue
  writeFileSync(doc, text)
  total += count
  console.log(`${doc}: ${count}`)
}
console.log(`total: ${total}`)
```

```bash
git grep -nE "(features/projects|lib/services)/[A-Za-z0-9._/-]*(activity-[a-z-]+|evidence-panels|private-proof-[a-z]+|project-activities-[a-z]+|pathways-client\.(evidence|capabilities|activity-review|local-upload))" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*'
node .tmp/s2b/doc-paths.mjs .tmp/s2b/activity-map.json .tmp/s2b/client-map.json docs/qad-pathways.md docs/dsd-pathways.md
```

Expected: the grep lists the lines of `docs/qad-pathways.md` (79, 80, 82, 187, 198 and 210), `docs/dsd-pathways.md` (1012) and `docs/deferred-features.md` (37); the script prints `docs/qad-pathways.md: 7`, `docs/dsd-pathways.md: 2` and `total: 9`. The change records (`docs/cr-pathways-*.md`) describe past states and keep their paths. If the grep lists another living doc that names a moved file, add it to the command.

In `docs/deferred-features.md` row "Unfinished-control UI hidden for demo", replace `Request an extension in \`apps/web/src/features/projects/activity-detail-panel.tsx\`` with `Request an extension in \`apps/web/src/features/projects/activities/components/activity-detail-actions.tsx\``: the button moved with the action bar (the script is not run on this file because it would name the panel).

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`, section 3.3, directly after the paragraph that ends `(amended 2026-10-12 for S1b)`, add:

```text
`lib/api/<domain>.ts` is accompanied by `<domain>.schema.ts` files that hold the hand-written parsers of untrusted responses (`activities.schema.ts`, `activity-proofs.schema.ts`), and `lib/api/core/guards.ts` holds the response guards that more than one client shares. A feature subfolder (`features/projects/activities/`) keeps `components/`, `hooks/` and the `<domain>.{reads,utils,copy}.ts` files, and the feature index lists its exports by their leaf paths: an index file inside the subfolder that the feature index re-exports from grows the dashboard route by 23 kB under `optimizePackageImports`. A production build after a file move needs `apps/web/.next` removed first, because the barrel optimizer caches the old leaf paths (amended 2026-10-12 for S2b).
```

Section 9, append (replace `<date>` with the merge date and the counts with the measured gate values):

```markdown
S2b applied <date> on refactor/s2b-activities-web:
- Client: `lib/api/activities.ts` holds `activitiesClient` (16 methods) and `lib/api/activity-extensions.ts` `activityExtensionsClient` (4), with the hand-written parsers in `activities.schema.ts` and `activity-proofs.schema.ts`, `isFiniteNonNegative` in `lib/api/core/guards.ts` and `privateProofClient` in `lib/api/proof-inspection.ts`; 23 production files, 6 client tests and 18 mock files follow, four client tests moved beside their code, and `pathways-client.ts` went from 2395 to 1521 lines. The wire bodies are checked against the S2a request contracts with `satisfies`, and the extension methods take the three extension request types.
- Types: of twelve probed pairs only `ActivityCapabilities` and `AssignableProjectOfficer` equal a S2a response type and became aliases; the web `Activity` (numeric budgets), the proof limits, declaration, reservation and finalize types (string content types, receipt typed `unknown`), `EvidenceList` (two more review states), `ActivityOverdueExplanation`, `ActivitySummary` and the context row differ from the response schemas and stay view models.
- Layout: the 35 activity files moved to `features/projects/activities/{components,hooks}` with `activities.{reads,utils,copy}.ts`; the feature index lists the four activity exports by leaf path (a sub-index grew `/dashboard` from 673 to 696 kB); `ScopedActivityFormDialog`, `ScopedActivityProofDialog`, `OwnedReview` and `OwnedInspection` became `*Content` names; the four activity expense files stay for S6.
- Components: the form dialog went from 846 to 419 lines (fields and draft hook), the proof dialog from 773 to 336 (upload hook and utils), the detail panel from 800 to 155 (content, history, actions, proof utils) and the workspace from 750 to 490 (card, status summary, expenses and filters hooks); every split was proven line by line, and new tests pin the form draft effects and the expense rows before they moved.
- Contracts: `activityExtensionSchema` became `activityExtensionResponse` in `contracts/activities/activity-extension-response.ts` with a strict-shape test; the web `categoryLabels` moved to `activities.copy.ts`; `activities.reads.ts` holds the activity list, detail and officers reads with a test that pins their keys, permissions and freshness.
- Cleanup: the multipart `files` option, its bound checks and `proofSnapshot` left `source-mutation.ts` (356 to 315 lines; F1 deferral).
- Routes: Middleware stayed at 102 kB; against the Task 3 baseline <routes result>.
- Decisions: one plan of eleven tasks (ruling 1); parsers kept and two types aliased (ruling 3); `satisfies` on wire bodies (ruling 4); both clients run the same characterization cases (ruling 5); no activities sub-index (ruling 9); every production build after a move starts from a clean `.next` (ruling 10).

Deferred: the activity read keys of analytics, rules board, collection, beneficiary loaders and the review workspace (their slices); the `finance-*` read keys in `use-activity-expenses.ts` and the budget module (S6); `definitiveRejection` and `nextDay`; one component per file in `activity-detail-sections.tsx` and `evidence-panels.tsx`. Later plans list their feature exports by leaf path in the feature index instead of adding a sub-index.
```

- [ ] **Step 3: Update the audit and the index**

- Audit rows, append to the disposition cell of each (replace the final period of the cell where there is one): MOD-05 `; activities client by S2b.`; MOD-06 `; activity components by S2b.`; MOD-15 `; activities folder and leaf exports through the projects index by S2b.`; MOD-16 `; activity read hooks and category labels by S2b.`; MOD-17 `; activities folder and Scoped and Owned names by S2b.`
- `docs/index.md`: in the CR row status change `F1 to F4b, S1a, S1b and S2a applied, S2b next` to `F1 to F4b, S1a, S1b, S2a and S2b applied, S3 next`.

```bash
git grep -nE "(features/projects|lib/services)/[A-Za-z0-9._/-]*(activity-[a-z-]+|evidence-panels|private-proof-[a-z]+|project-activities-[a-z]+|pathways-client\.(evidence|capabilities|activity-review|local-upload))|activityExtensionSchema" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*'
```

Expected: prints nothing (no living doc names a moved path or the old schema name).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S2b activities web (refactor/s2b-activities-web)
```

with one bullet per Task 1 to Task 8: what moved or changed, its commit hash, and the test counts at the end of that task (web files and tests: 218 and 1987, 218 and 1965, 218 and 1965, 219 and 1969, 220 and 1972, 221 and 1975, 221 and 1975, 221 and 1975 at `919e6641`; shared 24 files and 281 tests after Task 7); a bullet with the type probe result (two equal pairs, ten that differ, and why they stay); a bullet with the route measurements (Tasks 1 and 2 shrank 15 routes and grew one, the sub-index result of 696 kB and the leaf-path result, the stale `.next` failure); a bullet saying the S2b decisions are recorded in the change record section 9 because the plan file is removed after merge; and a bullet listing the deferrals above. Task 10 Step 6 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs
git commit -m "docs: record modularization S2b and repoint the moved activity paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 10: Full release gates and merge

- [ ] **Step 1: Static gates, route bundles and middleware**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm sad:test
rm -rf apps/web/.next
pnpm build > .tmp/s2b/build-gates.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s2b/build-gates.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s2b/routes-gates.txt
git checkout -- apps/web/next-env.d.ts
node .tmp/s2b/compare-routes.mjs .tmp/s2b/routes-pre-layout.txt .tmp/s2b/routes-gates.txt
node .tmp/s2b/compare-routes.mjs .tmp/s2b/routes-baseline.txt .tmp/s2b/routes-gates.txt | tail -1
grep -E "Middleware" .tmp/s2b/routes-gates.txt
test -f packages/shared/dist/contracts/activities/activity-extension-response.js && test -f packages/shared/dist/contracts/activities/activity-responses.js && echo "dist layout ok"
```

Expected: all pass; versus Task 0: config 19, shared = `B_shared` + 1 file and 8 tests (24 files, 281 tests), imports 91, api 2429 passed and 21 skipped (unchanged), web = `B_web` files + 5 and tests + 32 (221 files, 1975 tests at `919e6641`: 44 runs added in Task 1, 22 duplicated runs removed in Task 2, 4 draft, 3 expenses and 3 reads tests added), sad `B_sad`; the build exits 0; against the Task 3 baseline 17 routes differ from `routes-pre-layout.txt` (`routes 72, different 17`) and none grows by more than 2 kB: `/projects/[projectId]/activities`, `/budget`, `/evidence` and `/monitor-evaluate` are 2 kB bigger, `/projects/[projectId]/activities/[activityId]`, `/dashboard` and the five `/collection` routes 1 kB bigger, and six routes (`/analytics`, `/beneficiaries/evaluation-center`, `/projects`, `/projects/[projectId]`, `/transparency`, `/transparency/[projectId]/preview`) 1 to 4 kB smaller; against the Task 0 baseline `routes 72, different 23`; `Middleware` equals `M0`; `dist layout ok`. A route more than 2 kB bigger than in `routes-pre-layout.txt`: stop and report the figures. A build that fails with a `Module not found` for an old activity path ran on a stale cache (ruling 10).

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (171 PASS, 0 FAIL at the S2a gate). S2b changes no SQL; the replay is kept as the standing release gate.

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

Expected: `"status":"ok"`; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to S2a gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke against `pnpm dev:local`, each step as a demo user whose role allows it, and every step must behave as on dev:

1. As Project Manager open a project's Activities tab (list, board view, status chips, search by indicator code), open the editor (the assignable officers list loads only then), type a title and close the dialog, reopen it and confirm "Recovered your unsaved activity draft." with the title, then create an activity with a target count and a budget, start it, edit its dates and save, and cancel another with a reason.
2. As an assigned Project Officer record a progress note, submit a proof with two files (reserve, signed upload, finalize), start a proof and close the browser tab between the upload and the commit, reopen it and resume the incomplete upload, explain the delay on an overdue activity, and request an extension.
3. As the M&E Officer open the pending update, inspect a proof file in the private viewer and approve it, return another update, open a proof download, and verify the extension; as a Project Manager approve it and confirm the new end date.
4. Open the Evidence tab as a Project Manager (records and the proof preview) and as a Program Manager (counts only, no file names), the activity detail route `/projects/<id>/activities/<activityId>`, and the Budget tab (the activity expense dialog, the expense review drawer and the ledger).
5. Open the dashboard widgets that open an activity (a "Submit update" link opens the proof dialog, an activity row opens the detail panel), the analytics and rules pickers that list activities (rule editor and rules board condition rows), the beneficiary directory, detail and journey stage loaders, the collection workspace activity choices, the indicators tab, and a beneficiary media upload (it uses the signed upload `PUT` of the activities client).

The barrel optimization exists only in the production build, so repeat items 3 and 5 against it: stop the web dev server, run `pnpm dev:local -- --api-only`, export the `NEXT_PUBLIC_*` values that the `shared` block of `scripts/db/local-dev.mjs` builds (they are inlined at build time), then `rm -rf apps/web/.next`, `pnpm --filter @pathways/web build` and `pnpm --filter @pathways/web start`.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s2b/manifest.json
```

Expected roles at `919e6641`: `design-qa-agent` (145 files), `beneficiary-privacy-guardian` (27 files: the new `lib/api` modules and their tests, the edited `lib/services` files and the new shared contract with its test) and `rule-engine-determinism-checker` (3 files: `rule-editor.tsx` and its test, whose import and mock changed, and the removed `packages/shared/src/monitoring/activity-extension.ts`; the moved file falls under `contracts/**`, which routes to the privacy guardian). Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s2b/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s2b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. If SAD blocks an import that only a comment or JSDoc mentions, remove the import.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 9 activity-log section with the gate results (per-package counts, Middleware size, both route comparisons, replay result, e2e pass counts, smoke result, SAD sign-off), complete the `<date>`, `<routes result>` and gate figures of the change record section 9 block, then:

```bash
git add docs
git commit -m "docs: record modularization S2b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s2b-activities-web -m "Merge refactor/s2b-activities-web into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Remove the executed plan**

The decisions live in the change record section 9, so the plan goes with the merge. Delete `docs/superpowers/plans/2026-10-12-modularization-s2b-activities-web.md` and its row in `docs/index.md` section 1.6, then:

```bash
git rm docs/superpowers/plans/2026-10-12-modularization-s2b-activities-web.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed S2b plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.
