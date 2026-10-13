# S5b Collection Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 22 form, direct entry and import methods out of `pathways-client.ts` into typed `formsClient` and `importsClient`, give the web the response types the api already returns, share what the two web import screens duplicate, and split the oversized collection screen and its test, with no change to any screen, request, response, permission decision or route bundle size.

**Architecture:** S5b is the web half of S5 (S5a, the api and package half, is applied below it), and its own scope is cut down to ten tasks: the remaining splits of `import-workspace.tsx`, `direct-form-entry-workspace.tsx` and the rest of `collection-workspace.tsx`, the `features/collection` layout and the form type copies are outlined at the end as S5c (ruling 1). Nothing is rewritten by hand where a tool can prove it: `build-clients.mjs` writes the two clients from the methods still in `pathways-client.ts` and `same-lines.mjs` proves that every line of the 22 methods and of the receipt parser sits in the new files (`lost 0`, with `--strip` for the added request type checks); a characterization test runs the same cases against the old and the new client before the old methods go; callers and mocks move by two scripts that report each file they touch; the 14 inline views of `collection-workspace.tsx` move by `split-module.mjs` and two hooks by `cut.mjs` (hash-pinned line ranges); the 1672 line test splits by `cut.mjs` and the 50 test names are compared before and after. The api change is a return type on each mapper that builds a form, a submission, a batch or a row, so `pnpm typecheck` catches drift between the api and the new web types, and nothing parses a response at runtime (CR 3.6). One hook, `useImportBatch`, holds what the two import screens really share (ruling 7). Mechanical edits use one-off Node scripts under `.tmp/s5b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run in order on an exported copy of an S4c dry-run tip (`b85a0f8`), the whole sequence was then replayed from that base by one driver that executes the code blocks of this plan (the replayed tree is identical to the dry-run tree), and the pre-flight scan replayed it again on the real S4c tip `796ddcd5`: every Expected block matched except the test counts and the Middleware row that the S4b tests-only commits and the container move, which are the figures quoted below.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod, React 19 hooks, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.6 and 9 including the S5a disposition and its "Deferred to S5b" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-07, MOD-15 and MOD-16 for the collection screens). The S5 plan (`docs/handoff/modularization-s5-collection.md`, ruling 15 and the S5b outline) is the origin of this plan.

## Rulings

Controller rulings for S5b. Each was checked on the S4c tip; Task 0 recounts them.

1. **Split S5b and S5c.** The S5b outline has nine tasks, but its Task 3 (the 3186 line screen) and Task 4 (two more screens of 1130 and 658 lines) need a hook design for a component whose 39 states and 18 client calls all read one `current` snapshot and one operation ticket. This plan does the client, the shared hook, the 14 views, two hooks and the test split (ten tasks with the baseline, the records and the gates); the rest is outlined as S5c at the end, as S6b did for S6. `collection-workspace.tsx` ends at 1640 lines, still above the 500 line flag, and is named as such in the records. Cost if wrong: a third slice branch; the alternative, one plan of about twenty tasks, would not fit a single dry run.
2. **Response contracts are types only.** `contracts/imports/import-responses.ts` and `contracts/metadata/form-responses.ts` (S5a ruling 15) hold zod schemas that the web and the api import as inferred types; nothing calls `.parse` on them. The api mappers get return types (`mapBatch`, `readBatchDetail`, `readBatchRows`, `mapForm`, `findSubmission`, `listOwnSubmissions`); the two JSON columns that Prisma types as `JsonValue` (`rawData`, `validationErrors`, `valueMap`) get a type-only cast, the precedent of the S4b contracts. The contracts are narrower than the web copies where the api is: the batch status has no `VALIDATING` (the api never returns it), the submission status has four values and the file type six. Cost if wrong: a mapper that returns a shape the contract does not name fails `pnpm typecheck` at once.
3. **The web types become aliases.** `DigitalFormDefinition`, `DirectFormSubmission`, `ImportSourceColumn`, `ImportRowDefinition` and `ImportRowsPage` are aliases of the contract types, and `ImportBatchDefinition` is the batch contract plus the three optional detail members (`sourceHeaders`, `sourceColumns`, `mappings`); nothing else in the web changes except `fromDigitalForm`, which reads only `id` and `fields` and takes `Omit<DigitalFormDefinition, 'fields'> & { fields: DigitalFormFieldDefinition[] }` so a test fixture without `sequence` still compiles. The input and view types stay (`DigitalFormFieldDefinition`, `SaveDigitalFormInput`, `FormValidationResult`, `ImportMappingInput`, `ImportBatchStatus`, `DigitalFormType`, `FormFieldDataType`); the two copies of the form type list are S5c. Cost if wrong: a type error in a screen, caught by `tsc`.
4. **Clients are copied by a generator, not retyped.** `build-clients.mjs` takes each class method block from `pathways-client.ts`, closes it as an object-literal member, swaps the web return types for the response types and adds `satisfies <Request>` to every request body that has an S5a request contract (`validateImport` gets `ValidateImportRequest`, the F3b deferral; `saveImportMapping` gets `SaveImportMappingRequest`; `saveDirectSubmission` gets `SaveSubmissionRequest` on the object it builds). `satisfies` is a compile-time check: the JSON sent is unchanged. The receipt parser moves with its test to `imports.schema.ts` and `imports.schema.test.ts`. Cost if wrong: a body the contract refuses fails `tsc`, and the characterization test compares the exact request.
5. **Characterization before removal.** `forms.test.ts` (8 rows) and `imports.test.ts` (7 rows) run each case against `pathwaysClient` and the new client (30 results) while both exist, with the exact path, method and body of every request, the 100 item bounds and the multipart fields; Task 3 turns them into plain tests of the new clients (15 rows) once the old methods are gone. One mutation per file proves they bite. Cost if wrong: a client that sends a different request; before this, four tests in `pathways-client.test.ts` (two error paths, one read and the multipart upload) reached three of the 22 methods and no test called the other 19 on the real client.
6. **Callers and mocks move together.** 45 calls in 7 files change from `pathwaysClient.<method>` to `formsClient` or `importsClient` (41 in six production files, four in `pathways-client.test.ts`); 12 test files that mock `pathways-client` get a matching `vi.mock` of each new module in the same commit, as S4b did, and `collection-workspace.test.tsx` keeps its `activitiesClient`, `indicatorsClient` and `projectsClient` mocks. The scripts count what they touch. Cost if wrong: a test that reaches the real client; `mock-scan` counts the factories before and after.
7. **MOD-07 is smaller than the outline.** The outline says both import screens use F4b `captureRequestOwner`; they do not: each owns its tickets (`beginOperation` with the `current` snapshot in the collection screen, `begin` with `latest` in the import screen), and the two process loops keep different state (the collection dialog keeps `projectId` and `validationRevision` so a stopped run resumes from the dialog, the import screen keeps a `note` and reloads the batch). What is the same code in both is the upload identity (a retried file keeps its client import id), the automatic mapping call for a freshly stored batch (three copies) and the stop flag. `hooks/use-import-batch.ts` holds those three, each screen keeps its own process policy as the outline says, and no click, text or request sequence changes. Two flows had no test (the import screen's `resume`, the collection screen's stop and resume); Task 4 adds them first and mutates them. Cost if wrong: a later slice that wants one flow finds two process loops; recorded in section 9.
8. **The 14 views move verbatim, one per file.** `split-module.mjs` assigns each top-level declaration of `collection-workspace.tsx` to a file by name: `components/<kebab-name>.tsx` for the 14 views and `collection.utils.ts` for the 14 declarations the views and the screen share (the types `CollectionMode`, `CollectionView`, `FieldType`, `ImportStatus`, `FormField`, `ParsedImport` and `SavedForm`, and `MAX_PREVIEW_ROWS`, `tableHeadClass`, `savedFormStatus`, `dataTypeLabels`, `statusTone`, `formatValue` and `formatSavedAt`; types live in the utils file, as `LoadState` does in `media.utils.ts`); the screen keeps the rest. `export` is added to every moved declaration and `'use client'` stays on components only. The outline's `collection.copy.ts` and the folder layout are S5c. Cost if wrong: an import path.
9. **Two hooks, with their dependencies passed in.** `useFormFields` (field list, selection, pending delete and the five edits, 123 lines) and `useServerProcessing` (the run state and the continue, resume and stop functions, 127 lines) are cut from the screen by line ranges and take what they read: `useFormFields(initial, { mutation, intent, mounted, isCurrentOwner })`, `useServerProcessing({ projectId, beginOperation, importBatch, setSavedNotice, setProceedDialogOpen, setImportMessage })`. Effects keep their order because neither hook has an effect. The one changed dependency list is the initial-form effect, which gains the two `useState` setters that now come out of a hook (stable, so nothing re-runs). The hook that the outline calls `use-form-list` and the parse, save and publish handlers stay in the screen: they all read `current`, the ticket and the draft owner, and splitting them needs a guard hook first (S5c Task A). Cost if wrong: none.
10. **Hook tests follow the move.** The field edits had no test of their own, so `use-form-fields.test.tsx` (10 rows) is added after the verbatim move, and seven mutations (move direction, selection after add, delete toast, neighbour selection, the owner and mounted focus guards, the confirm guard) must each fail it; `same-lines` is the proof that the moved bodies are unchanged. The server processing hook is covered by the stop, resume and failure rows of Task 4. Cost if wrong: none.
11. **The big test splits by concern, names unchanged.** `collection-workspace.test.tsx` (1672 lines, 50 results) becomes five files by `cut.mjs`; the one `describe('collection import workspace')` is repeated in four of them so that the sorted list of full test names is identical before and after (compared from the Vitest JSON report). The header (imports, hoisted mocks, `beforeEach`, `afterEach`) is copied into each file because a `vi.mock` factory cannot be shared; only the helpers a file uses are copied with it. `it` stays at 35 and `describe` goes from 9 to 12 (the repeated name), `expect(` from 194 to 195 (the `ownedDataset` helper in two files). Cost if wrong: a lost row, which the name list shows.
12. **Route bundles.** More modules and a smaller shared client chunk change First Load JS in both directions; the criterion is no route more than 1 kB bigger than the Task 0 build and Middleware at `M0` (the dry run found ten routes smaller and none bigger) (103 kB in the cloud container, 102 kB in the planning container and on Windows). Every production build starts from a clean `.next` (S2b ruling 10). Cost if wrong: a bundle review.
13. **SAD.** `apps/web/src/lib/api/**/*.ts` already routes to beneficiary-privacy-guardian (F4b); the two response contract files route to metadata-import-validator (S5a ruling 14); the api mapper and service files that get return types route to metadata-import-validator (three of them also to organization-isolation-checker), and design-qa-agent reads every changed code path, `features/collection/**` among them. No routing change is needed; Task 9 Step 4 prints the manifest. Cost if wrong: one glob in `scripts/sad/check.ts`.
14. **No pull request for this slice.** The developer asked for one pull request into `dev` after every slice is implemented, so S5b gets none of its own: the branch stays stacked on the S4c branch, and the CI replay of the final pull request is the gate for the database replay that cannot run here. Task 9 records the gate results in the activity log and says so. Cost if wrong: none.
15. **Not done in S5b (recorded in CR section 9 as S5c):** `import-workspace.tsx` (1130 lines at the S4c tip, 1110 after Task 4) and `direct-form-entry-workspace.tsx` (658 lines, 654 after Task 4); the form list, load, parse, save and publish handlers of `collection-workspace.tsx` (1640 lines); the `features/collection` folder layout, `collection.copy.ts`, `index.ts` and the surface rule; the form type copies; the S5 closing records. Cost if wrong: none.
16. **Cross-plan.** S6, S7 and S8 name no collection file and no moved client method (searched in their plans); S5c starts from this tip. Cost if wrong: a later Task 0 stops on a missing path or count.

## Interfaces assumed from earlier sub-projects

- S5a: `importRequestLimits`, `validateImportRequest`, `saveImportMappingRequest`, `automaticImportMappingRequest`, `processImportRequest`, `uploadImportRequest` and the form request contracts (`createFormRequest`, `updateFormRequest`, `formVersionRequest`, `generateFormRequest`, `validateFormValuesRequest`, `saveSubmissionRequest`, `updateSubmissionRequest`, `submitSubmissionRequest`) exported from `@pathways/shared`, the facade services and mappers in `apps/api/src/modules/{imports,metadata}`, and the `docs/superpowers/plans` copy of the S5 plan, which holds the S5b outline and stays listed: the controller removes executed plan copies only after the final merge.
- S4c and S4b: `lib/api/{beneficiaries,journeys,beneficiary-media}.ts` and their `*.schema.ts`, `types/pathways.ts` as it stands, and the `features/beneficiaries` loaders, whose tests mock `pathways-client` and now also `@/lib/api/forms`.
- S3b and S2b: `lib/api/{indicators,activities,projects}.ts` (the collection screens call `indicatorsClient`, `activitiesClient` and `projectsClient`), the `components/` plus `hooks/` subfolder convention and the `test/fixtures` folder.
- F4b: `lib/api/core/request.ts` (`PathwaysClientError`, `requestFoundation`), the `useSensitiveDraftOwner` draft owner the screens use, and the SAD routing of `lib/api`.

## Produces (names later plans consume)

- `packages/shared`: `ImportBatchResponse`, `ImportBatchDetailResponse`, `ImportMappingResponse`, `ImportSourceColumnResponse`, `ImportRowResponse`, `ImportRowsPageResponse`, `FormFieldResponse`, `FormResponse`, `FormSubmissionResponse`, `FormSubmissionSummaryResponse`, `FormSubmissionPageResponse` and their zod schemas.
- `apps/web/src/lib/api/forms.ts` (`formsClient`, 13 methods), `imports.ts` (`importsClient`, 9 methods), `imports.schema.ts` (`parseAutomaticMappingReceipt`) and their tests.
- `features/collection/hooks/use-import-batch.ts` (`useImportBatch`), `use-form-fields.ts` (`useFormFields`, `OperationGuard`), `use-server-processing.ts` (`useServerProcessing`).
- `features/collection/components/{forms-generator-view,builder-view,form-info-panel,journey-stage-selector,field-editor,toggle-row,metadata-map-panel,form-preview-panel,import-view,summary-metric,mapping-table,data-preview,import-validation-panel,summary-pill}.tsx`, `collection.utils.ts`.
- `collection-workspace.{import-preview,import-upload,forms,access,ownership}.test.tsx`, `import-workspace.resume.test.tsx`.
- `pathways-client.ts` without the 22 methods (716 to 424 lines); no web file calls them through `pathwaysClient`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The only line edits inside moved code are `export` keywords, the return types and `satisfies` checks of ruling 4, the hook parameter wiring of rulings 7 and 9 and the two added dependencies of ruling 9. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit. `packages/shared` imports nothing from the api or the web.
- Every moved line is checked with `.tmp/s5b/same-lines.mjs` (`lost 0`) before Biome formats the new files, and `cut.mjs` stops on a source hash it was not written for. If a hash differs, a file changed since planning: stop and report NEEDS_CONTEXT.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); test files split as `<file>.<concern>.test.tsx`; comments are one sentence, no emojis; docs prose has no em dashes and no double hyphens (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s5b/trim-imports.mjs <file>` after cutting and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Run `.tmp/s5b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about three minutes, so give the command a ten minute timeout. A full web test run takes about four minutes, so give it the same timeout.
- Mock factories name modules by the specifier the code under test imports; the split tests keep the exact `vi.mock` lines of the old test, and a mutation run restores its file with `git checkout` before the next step.
- Write the scripts and the JSON plans with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s5b/` (gitignored) and are never committed; logs go there too. Use bash only.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- No plan copy is removed in this slice: the controller removes the executed `docs/superpowers/plans` copies only after the final merge.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the pre-flight replay on the S4c tip and must match, except the package test counts of Task 0 (see there), the route sizes and the Middleware row (another container can print baseline sizes 1 kB apart: judge them by ruling 12 and `M0`, and correct the `Routes:` sentences of Task 8 from the compare output before the replacements run) and the totals Biome prints in `Checked <n> files` for a whole-repository run, which grow with every file the branch holds. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared`, `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s5b-9ept8o`, stacked on `claude/modularization-s4c-9ept8o`); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`, and nobody opens a pull request for this slice (ruling 14). Do not touch migrations, seeds, `.env` files or review evidence; only files under `apps/api/src/modules/{imports,metadata}` (return types), `packages/shared/src`, `apps/web/src` and `docs` change.
- Fixtures and tests hold synthetic records only (`Import form`, `batch-owned`, `futuremakers-ncr`, codes such as `post_test`); no customer personal data, contact, account number or credential is added to a fixture, a record or a log line.
- Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run when supabase or Docker is missing (Task 9).

## Review Focus

1. Every moved line must be the same line: `same-lines` prints `lost 0` for the 22 methods and the receipt parser (Task 2), and for the 14 views (Task 5, one reflowed signature is named there). The lines added are signatures, return types, `satisfies` checks, props and calls; read the lists in Tasks 2, 5 and 6.
2. The two request shapes that carry a conditional member: `saveDirectSubmission` (`beneficiaryId` only when given) and `saveImportMapping` (every decision as sent); the characterization rows pin both.
3. The api change is return types only: read the 13 replacements of Task 1 and check that no mapper body changed except the two typed `.map` callbacks.
4. `useImportBatch` replaces three copies of the same condition and two identity refs; read the hook against the three call sites and the new rows in `import-workspace.resume.test.tsx` and `collection-workspace.ownership.test.tsx`.
5. The test split loses nothing: the sorted list of 50 full test names is identical, `it` is 35 before and after, and every new file keeps the exact `vi.mock` lines (Task 7).
6. The records say what was and was not proven (rulings 7, 9 and 10) and what is deferred to S5c; the e2e and browser results are pending a local run.

## File map

| Path | Role after S5b |
|---|---|
| `packages/shared/src/contracts/imports/import-responses.ts`, `contracts/metadata/form-responses.ts` and their tests | types-only response contracts (new, Task 1) |
| `apps/api/src/modules/imports/{imports.mapper,import-batches.service}.ts`, `apps/api/src/modules/metadata/{metadata.mapper,form-lookup.service,form-submission-reads.service}.ts` | return types (Task 1) |
| `apps/web/src/lib/api/{forms,imports,imports.schema}.ts` and `forms.test.ts`, `imports.test.ts`, `imports.schema.test.ts` | the two clients, the receipt parser and their tests (Tasks 2 and 3) |
| `apps/web/src/lib/services/pathways-client.ts` | 424 lines, 22 methods fewer (Task 3) |
| `apps/web/src/types/pathways.ts`, `features/collection/digital-form-contract.ts` | aliases of the response types (Task 3) |
| `features/collection/hooks/use-{import-batch,form-fields,server-processing}.ts` and their tests | shared and extracted hooks (Tasks 4 and 6) |
| `features/collection/components/*.tsx` (14), `collection.utils.ts` | the views and shared declarations (Task 5) |
| `features/collection/collection-workspace.tsx` | 3160 lines before Task 5, 1640 after Task 6 |
| `features/collection/collection-workspace.{import-preview,import-upload,forms,access,ownership}.test.tsx` | the split test (Task 7) |
| `docs/cr-pathways-codebase-modularization.md`, `docs/audit-pathways-codebase-modularity-20261009.md`, `docs/index.md`, `docs/activity-log.md` | S5b disposition (Task 8) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s5b-collection-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s5b/base-sha`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `count-it.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `cut.mjs`, `split-module.mjs`, `client-blocks.mjs`, `count-calls.mjs`, `mock-scan.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S4c and S5a**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
grep -c "^S4c applied" docs/cr-pathways-codebase-modularization.md
grep -c "^S5a applied" docs/cr-pathways-codebase-modularization.md
test -f packages/shared/src/contracts/imports/import-requests.ts && test -f packages/shared/src/contracts/metadata/form-requests.ts && echo "S5a contracts present"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/beneficiaries.ts && echo "F4b and S4b clients present"
ls apps/web/src/features/beneficiaries
grep -n "indexedFeatures: readonly" apps/web/src/import-direction.test.ts
ls docs/superpowers/plans/ | grep -E "modularization-s(5|4c)-"
test -f docs/handoff/modularization-s5b-collection-web.md && echo "handoff copy present"
git grep -c "captureRequestOwner" -- apps/web/src/features/collection | wc -l
mkdir -p .tmp/s5b/before .tmp/s5b/files
git rev-parse HEAD > .tmp/s5b/base-sha
git merge-base --is-ancestor claude/modularization-s4c-9ept8o HEAD && echo "stacked on claude/modularization-s4c-9ept8o"
```

Expected: `git status --short` prints nothing, the branch is the slice branch, then the S4c and S5a markers (`1` and `1`), the two present lines, the beneficiaries folders, the indexed features line, the plan listing (the S4c copy stays until the controller removes it after the merge; do not depend on it), the handoff copy and `0` files in `features/collection` that use `captureRequestOwner` (ruling 7), then the stacking line (the S4c branch is an ancestor of the branch being worked on):

```
claude/modularization-s5b-9ept8o
1
1
S5a contracts present
F4b and S4b clients present
beneficiaries.utils.test.ts
beneficiaries.utils.ts
directory
identity-review
index.ts
journey
media
profile
registration
57:const indexedFeatures: readonly string[] = ['projects', 'beneficiaries']
2026-10-13-modularization-s4c-beneficiaries-components.md
2026-10-13-modularization-s5-collection.md
handoff copy present
0
stacked on claude/modularization-s4c-9ept8o
```

A missing marker line or a missing stacking line means the branch lacks a stacked slice: stop and report NEEDS_CONTEXT. `.tmp/s5b/base-sha` is the head the branch has when Task 0 starts (the S4c tip `796ddcd5`, or the controller commit that stages this plan on it), the base of every later comparison and of the SAD check.

- [ ] **Step 2: Create the tool scripts**

Create each file with the Write tool exactly as printed. `.tmp/s5b/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s5b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s5b/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s5b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s5b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s5b/routes-$1.txt
grep Middleware .tmp/s5b/routes-$1.txt
```

`.tmp/s5b/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s5b/compare-routes.mjs`:

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

`.tmp/s5b/replace-exact.mjs` applies exact text replacements and fails unless each matches the expected number of times:

Create `.tmp/s5b/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s5b/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s5b/count-it.mjs` counts `it`, `describe` and `expect(` per test file, so a test split can show that no row or assertion was lost:

Create `.tmp/s5b/count-it.mjs`:

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

`.tmp/s5b/trim-imports.mjs` drops the imports a cut file no longer uses (comments and quoted strings do not count as uses):

Create `.tmp/s5b/trim-imports.mjs`:

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

`.tmp/s5b/same-lines.mjs` fails when a line of the original is missing from the new files and lists the lines the split added; an `--also` file is part of the original, `--strip` removes a pattern from every line (the request type checks of Task 2), and a `New=Old` argument undoes a rename:

Create `.tmp/s5b/same-lines.mjs`:

```js
// Fails when a line of the original is lost; counts the lines the new files add (signatures, props, calls) and lists them with --list.
// Usage: same-lines.mjs <original> [--also <file>]... [--strip <regex>] <new file>... [From=To]... [--list]; an --also file is part of the original (a module that already existed and received lines), --strip removes a pattern such as a type check from every line.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const list = args.includes('--list')
const originals = []
const rest = []
let strip = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') continue
  if (args[i] === '--strip') strip = new RegExp(args[++i], 'g')
  else if (args[i] === '--also') originals.push(args[++i])
  else if (originals.length === 0) originals.push(args[i])
  else rest.push(args[i])
}
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
    .map((line) => (strip ? line.replace(strip, '') : line))
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

`.tmp/s5b/cut.mjs` builds files from hash-pinned line ranges of one source file:

Create `.tmp/s5b/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s5b/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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

`.tmp/s5b/split-module.mjs` is the S3b declaration-level splitter, used in Task 5 for the collection screen:

Create `.tmp/s5b/split-module.mjs`:

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

`.tmp/s5b/client-blocks.mjs` names the 22 moved methods in their two client groups and finds a method in the class and in the interface of `pathways-client.ts`:

Create `.tmp/s5b/client-blocks.mjs`:

```js
// Shared names for the collection client move: the methods, the client groups and the helpers that locate class methods and interface members in pathways-client.ts.
export const clientFile = 'apps/web/src/lib/services/pathways-client.ts'

export const groups = [
  {
    client: 'formsClient',
    module: '@/lib/api/forms',
    methods: [
      'getDigitalForms',
      'getDigitalForm',
      'createDigitalForm',
      'updateDigitalForm',
      'publishDigitalForm',
      'createDigitalFormVersion',
      'generateDigitalForm',
      'validateDigitalFormValues',
      'saveDirectSubmission',
      'getDirectSubmission',
      'getDirectSubmissionByClientId',
      'updateDirectSubmission',
      'submitDirectSubmission',
    ],
  },
  {
    client: 'importsClient',
    module: '@/lib/api/imports',
    methods: [
      'getImportBatches',
      'getImportBatch',
      'getImportRows',
      'uploadImport',
      'resumeImportUpload',
      'automaticImportMapping',
      'saveImportMapping',
      'validateImport',
      'processImport',
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

`.tmp/s5b/count-calls.mjs` counts the calls of the moved methods and lists other mentions of their names:

Create `.tmp/s5b/count-calls.mjs`:

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

`.tmp/s5b/mock-scan.mjs` counts the `vi.mock` factories of one module and lists those whose factory names a given export:

Create `.tmp/s5b/mock-scan.mjs`:

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
chmod +x .tmp/s5b/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s5b/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
```

Expected: the figures of the pre-flight replay on the S4c tip `796ddcd5`. Write them down as the baselines; every later Expected is a delta from them. Typecheck prints `Done` for config, shared, imports, api and web. The package test counts depend on which slices sit below S5b on the branch (S5a, S6a and the three S4b tests-only commits sit below S4c, so the shared, api and web figures are higher than on the dry-run base): whatever Task 0 prints is `B_shared`, `B_imports`, `B_api`, `B_config`, `B_web` and `B_sad`, and S5b changes only the shared and web counts (Tasks 1 to 7). `B_web` is 232 files and 2015 tests on the S4c tip (the dry-run base had 2013, without the two cases of the S4b tests-only commit `25b58725`). Middleware prints 103 kB in the cloud container (102 kB in the planning container and on Windows): the Middleware row of every later build must equal `M0`, whatever the number. The summaries of the pre-flight replay are:

```
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  35 passed (35)
packages/shared test:       Tests  665 passed (665)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  232 passed (232)
apps/web test:       Tests  2015 passed (2015)
      Tests  57 passed (57)
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      103 kB
```

In order: config, shared, imports, api, web, then the `sad:test` line (`B_sad`), then the `docs:check` summary, whose 6 failures and 1 warning are the baseline and stay until the end (`[ELIFECYCLE]` is `pnpm` reporting the failing check), then the `build-routes.sh` result: `exit 0` and the Middleware row, whose size is `M0`. pnpm may echo `$ tsc ...` lines between them. `.tmp/s5b/routes-baseline.txt` is the route baseline `R0`.

```bash
W=apps/web/src
C=$W/features/collection
wc -l $W/lib/services/pathways-client.ts $C/collection-workspace.tsx $C/import-workspace.tsx $C/direct-form-entry-workspace.tsx $C/collection-workspace.test.tsx $W/types/pathways.ts $W/lib/services/automatic-mapping-receipt.ts
node .tmp/s5b/count-it.mjs $C/collection-workspace.test.tsx $W/lib/services/automatic-mapping-receipt.test.ts
node .tmp/s5b/count-calls.mjs
node .tmp/s5b/mock-scan.mjs lib/services/pathways-client getDigitalForms getDigitalForm createDigitalForm uploadImport getImportBatches saveDirectSubmission
git ls-files $C | wc -l
git grep -n "ScopedBeneficiaryForm\|automatic-mapping-receipt" -- apps packages | cut -c1-110
git hash-object $W/lib/services/pathways-client.ts $C/collection-workspace.tsx $C/import-workspace.tsx $C/direct-form-entry-workspace.tsx $C/collection-workspace.test.tsx $W/types/pathways.ts $W/features/collection/digital-form-contract.ts packages/shared/src/index.ts apps/api/src/modules/imports/import-batches.service.ts apps/api/src/modules/imports/imports.mapper.ts apps/api/src/modules/metadata/metadata.mapper.ts apps/api/src/modules/metadata/form-lookup.service.ts apps/api/src/modules/metadata/form-submission-reads.service.ts | cut -c1-8
```

Expected: the counts and hashes the plan rests on (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT):

```
   716 apps/web/src/lib/services/pathways-client.ts
  3186 apps/web/src/features/collection/collection-workspace.tsx
  1130 apps/web/src/features/collection/import-workspace.tsx
   658 apps/web/src/features/collection/direct-form-entry-workspace.tsx
  1634 apps/web/src/features/collection/collection-workspace.test.tsx
  1125 apps/web/src/types/pathways.ts
    27 apps/web/src/lib/services/automatic-mapping-receipt.ts
  8476 total
apps/web/src/features/collection/collection-workspace.test.tsx: it 34, describe 9, expect 190
apps/web/src/lib/services/automatic-mapping-receipt.test.ts: it 3, describe 1, expect 3
total: it 37, describe 10, expect 193
production calls 41 in 6 files
test calls 4 in 1 files
other mentions in 12 files
apps/web/src/features/collection/collection-workspace.test.tsx:68 getDigitalForms, getDigitalForm, createDigitalForm, uploadImport
factories 46, naming 1
37
apps/api/src/modules/imports/automatic-mapping-receipt.test.ts:2:import { parseAutomaticMappingReceipt } from 
apps/api/src/modules/imports/automatic-mapping.service.ts:19:import { parseAutomaticMappingReceipt } from './a
apps/web/src/lib/services/automatic-mapping-receipt.test.ts:2:import { parseAutomaticMappingReceipt } from './
apps/web/src/lib/services/pathways-client.ts:4:} from './automatic-mapping-receipt'
fdd1e864
79823071
2ec365ad
22c4aab8
4370a3a2
4e821051
bc9a73e6
085c15f0
8c5f746a
a664dc0b
b8c2a366
85671ac3
b56dde27
```

In order: the seven line counts (the client, the three screens, the big test, `types/pathways.ts` and the receipt parser); the rows, groups and assertions of the big test and the receipt test; the call counts (41 calls in 6 production files, 4 in 1 test file, other mentions in 12 files that are not calls, such as a mock object key); the one `vi.mock` factory of `pathways-client` that names a moved method through an object literal (the others pass an object by name); 37 files in `features/collection`; the receipt parser's references (four lines: the web client import and the web test, and the two files of the api, which have their own copy and stay); the 13 hash prefixes in the order of the command.

Write down `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s5b-collection-web.md docs/superpowers/plans/$(date +%F)-modularization-s5b-collection-web.md`. The handoff copy and its index row stay. No plan copy is removed here or anywhere in this slice: the S5 plan copy in `docs/superpowers/plans` (it holds the S5b outline) and its index row, and the S4, S4b and S4c copies, stay listed until the controller removes them after the final merge.

In `docs/index.md` section 1.6, the S5b row is added after the S5 row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s5b-collection-web.md docs/superpowers/plans/$D-modularization-s5b-collection-web.md
sed -i "/(superpowers\/plans\/[^)]*modularization-s5-collection\.md)/a | [S5b collection web plan](superpowers/plans/$D-modularization-s5b-collection-web.md) | $D-modularization-s5b-collection-web.md | $D | S5b of the codebase modularization: form and import clients, response types, the shared import hook, the collection screen views and hooks, the split collection test | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
grep -c "modularization-s5-collection" docs/index.md
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -m "docs: add the S5b collection web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one row added, the two S5 rows of the index still there (`2`: the handoff row and the plans row), the same 6 baseline docs failures and a commit of two files (`<n>` is the plan length):

```
+| [S5b collection web plan](superpowers/plans/<date>-modularization-s5b-collection-web.md) | <date>-modularization-s5b-collection-w
2

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S5b collection web plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/<date>-modularization-s5b-collection-web.md
```

The row lines are cut at 140 characters by the command, and `<n>` is the plan length. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).

---

### Task 1: Response contracts and api return types

**Files:**
- Create: `packages/shared/src/contracts/imports/import-responses.ts`, `import-responses.test.ts`, `packages/shared/src/contracts/metadata/form-responses.ts`, `form-responses.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/imports/imports.mapper.ts`, `apps/api/src/modules/imports/import-batches.service.ts`, `apps/api/src/modules/metadata/metadata.mapper.ts`, `apps/api/src/modules/metadata/form-lookup.service.ts`, `apps/api/src/modules/metadata/form-submission-reads.service.ts`
- Create (gitignored): `.tmp/s5b/task1-api-edits.json`

The schemas describe what the api returns today, read from the six functions that build the bodies: `mapBatch` (list, upload, mapping, validate and process routes), `readBatchDetail` (adds the source columns and the stored mappings), `readBatchRows`, `mapForm`, `findSubmission` and `listOwnSubmissions`. They are used as types only (ruling 2). `batch.fileType` can be `JSON` or `OTHER` in the database enum, so the contract lists six file types where the old web copy listed four; `VALIDATING` is not a stored status the api returns, so it is not in the contract.

- [ ] **Step 1: Write the contracts and their tests**

Create each file with the Write tool exactly as printed:

Create `packages/shared/src/contracts/imports/import-responses.ts`:

```ts
import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import { digitalFormTypes } from '../metadata/form-requests'

// Response shapes of the import routes, used as types and never parsed at runtime.

const fieldReference = z.object({ code: z.string(), label: z.string() })

// One source column of a stored import; the key is the stable name mappings refer to.
export const importSourceColumnResponse = z.object({
  key: z.string(),
  header: z.string(),
  columnIndex: z.number().int(),
})
export type ImportSourceColumnResponse = z.infer<typeof importSourceColumnResponse>

// One import batch as the list, upload, mapping, validate and process routes return it.
export const importBatchResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  formId: z.string(),
  formVersion: z.number().int(),
  formCode: z.string(),
  formName: z.string(),
  formType: z.enum(digitalFormTypes),
  originalFileName: z.string(),
  fileType: z.enum(['CSV', 'XLSX', 'XLS', 'JSON', 'OTHER', 'PDF']),
  clientImportId: z.string(),
  storageStatus: z.enum(['RESERVED', 'STORED', 'RECOVERY_REQUIRED', 'FAILED']),
  status: z.enum([
    'UPLOADING',
    'UPLOADED',
    'MAPPED',
    'VALIDATED',
    'PROCESSING',
    'PARTIALLY_PROCESSED',
    'PROCESSED',
    'RECOVERY_REQUIRED',
    'FAILED',
  ]),
  mappingRevision: z.number().int(),
  validationRevision: z.number().int(),
  validatedMappingRevision: z.number().int().nullable(),
  processingRevision: z.number().int(),
  totals: z.object({
    rows: z.number().int(),
    valid: z.number().int(),
    invalid: z.number().int(),
    processed: z.number().int(),
    unprocessed: z.number().int(),
    failed: z.number().int(),
  }),
  failureCode: z.string().nullable(),
  uploadedAt: z.string(),
  validatedAt: z.string().optional(),
  processedAt: z.string().optional(),
  updatedAt: z.string(),
})
export type ImportBatchResponse = z.infer<typeof importBatchResponse>

// One stored mapping decision of the current mapping revision.
export const importMappingResponse = z.object({
  sourceFieldName: z.string(),
  status: z.enum(['PENDING', 'MAPPED', 'INVALID', 'IGNORED']),
  revision: z.number().int(),
  targetField: fieldReference.nullable(),
  validationMessage: z.string().nullable(),
  suggestedField: fieldReference.nullable(),
  matchScore: z.number().int().nullable(),
  matchReason: z.string().nullable(),
  dataType: z.enum(supportedFormFieldTypes).nullable(),
  valueMap: z.array(z.object({ from: z.string(), to: z.string() })).nullable(),
})
export type ImportMappingResponse = z.infer<typeof importMappingResponse>

// GET imports/projects/:projectId/batches/:batchId adds the source columns and the stored mappings.
export const importBatchDetailResponse = importBatchResponse.extend({
  sourceHeaders: z.array(z.string()),
  sourceColumns: z.array(importSourceColumnResponse),
  mappings: z.array(importMappingResponse),
})
export type ImportBatchDetailResponse = z.infer<typeof importBatchDetailResponse>

// One staged row; the raw values and the validation errors are stored as JSON.
export const importRowResponse = z.object({
  id: z.string(),
  rowNumber: z.number().int(),
  rawData: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  status: z.enum([
    'PENDING',
    'VALID',
    'INVALID',
    'PROCESSING',
    'UNPROCESSED',
    'PROCESSED',
    'FAILED',
  ]),
  validationErrors: z.array(
    z.object({ fieldCode: z.string(), code: z.string(), message: z.string() }),
  ),
  mappingRevision: z.number().int(),
  validationRevision: z.number().int(),
  processingAttempts: z.number().int(),
  processingErrorCode: z.string().nullable(),
  updatedAt: z.string(),
})
export type ImportRowResponse = z.infer<typeof importRowResponse>

// Body of GET imports/projects/:projectId/batches/:batchId/rows.
export const importRowsPageResponse = z.object({
  offset: z.number().int(),
  take: z.number().int(),
  total: z.number().int(),
  rows: z.array(importRowResponse),
})
export type ImportRowsPageResponse = z.infer<typeof importRowsPageResponse>
```

Create `packages/shared/src/contracts/imports/import-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  importBatchDetailResponse,
  importBatchResponse,
  importRowsPageResponse,
} from './import-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const batch = {
  id: uuid,
  projectId: uuid,
  formId: uuid,
  formVersion: 2,
  formCode: 'intake',
  formName: 'Intake form',
  formType: 'OTHER',
  originalFileName: 'rows.csv',
  fileType: 'CSV',
  clientImportId: uuid,
  storageStatus: 'STORED',
  status: 'VALIDATED',
  mappingRevision: 1,
  validationRevision: 1,
  validatedMappingRevision: 1,
  processingRevision: 0,
  totals: { rows: 3, valid: 2, invalid: 1, processed: 0, unprocessed: 0, failed: 0 },
  failureCode: null,
  uploadedAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
}
const detail = {
  ...batch,
  sourceHeaders: ['column_0001'],
  sourceColumns: [{ key: 'column_0001', header: 'Name', columnIndex: 1 }],
  mappings: [
    {
      sourceFieldName: 'column_0001',
      status: 'MAPPED',
      revision: 1,
      targetField: { code: 'name', label: 'Name' },
      validationMessage: null,
      suggestedField: null,
      matchScore: null,
      matchReason: null,
      dataType: 'TEXT',
      valueMap: [{ from: 'M', to: 'Male' }],
    },
  ],
}
const row = {
  id: uuid,
  rowNumber: 1,
  rawData: { column_0001: 'Sample', column_0002: 4, column_0003: null },
  status: 'INVALID',
  validationErrors: [{ fieldCode: 'name', code: 'required', message: 'Name is required.' }],
  mappingRevision: 1,
  validationRevision: 1,
  processingAttempts: 0,
  processingErrorCode: null,
  updatedAt: '2026-10-13T00:00:00.000Z',
}

describe('import response contracts', () => {
  it('describe a batch, its detail and a row page', () => {
    expect(importBatchResponse.safeParse(batch).success).toBe(true)
    expect(importBatchResponse.safeParse({ ...batch, validatedAt: '2026-10-13' }).success).toBe(
      true,
    )
    expect(importBatchDetailResponse.safeParse(detail).success).toBe(true)
    expect(
      importRowsPageResponse.safeParse({ offset: 0, take: 100, total: 1, rows: [row] }).success,
    ).toBe(true)
  })

  it('reject a batch with an unknown status, a missing total or a detail without columns', () => {
    expect(importBatchResponse.safeParse({ ...batch, status: 'VALIDATING' }).success).toBe(false)
    expect(importBatchResponse.safeParse({ ...batch, totals: { rows: 3 } }).success).toBe(false)
    expect(importBatchDetailResponse.safeParse(batch).success).toBe(false)
  })

  it('reject a mapping with a value map entry that has no target text', () => {
    const broken = { ...detail, mappings: [{ ...detail.mappings[0], valueMap: [{ from: 'M' }] }] }
    expect(importBatchDetailResponse.safeParse(broken).success).toBe(false)
  })

  it('reject a row whose raw value is an object or whose error has no code', () => {
    const page = (next: unknown) =>
      importRowsPageResponse.safeParse({ offset: 0, take: 1, total: 1, rows: [next] }).success
    expect(page({ ...row, rawData: { column_0001: { nested: true } } })).toBe(false)
    expect(page({ ...row, validationErrors: [{ fieldCode: 'name', message: 'x' }] })).toBe(false)
  })
})
```

Create `packages/shared/src/contracts/metadata/form-responses.ts`:

```ts
import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import { digitalFormTypes } from './form-requests'

// Response shapes of the form and direct entry routes, used as types and never parsed at runtime.

// One field of a form as every form route returns it; bounds arrive as text, absent bounds are left out.
export const formFieldResponse = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  dataType: z.enum(supportedFormFieldTypes),
  required: z.boolean(),
  metadataKey: z.boolean(),
  sadddField: z.boolean(),
  allowedValues: z.array(z.string()).nullable(),
  minimumValue: z.string().optional(),
  maximumValue: z.string().optional(),
  minimumDate: z.string().optional(),
  maximumDate: z.string().optional(),
  minimumLength: z.number().int().nullable(),
  maximumLength: z.number().int().nullable(),
  sequence: z.number().int(),
})
export type FormFieldResponse = z.infer<typeof formFieldResponse>

// One form version as the list, read, create, update, publish, archive, version and generate routes return it.
export const formResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  version: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  formType: z.enum(digitalFormTypes),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  activityId: z.string().nullable(),
  journeyStageId: z.string().nullable(),
  publishedAt: z.string().optional(),
  archivedAt: z.string().optional(),
  updatedAt: z.string(),
  createdByCurrentUser: z.boolean(),
  fields: z.array(formFieldResponse),
})
export type FormResponse = z.infer<typeof formResponse>

// One own direct entry submission with its stored values keyed by field code.
export const formSubmissionResponse = z.object({
  id: z.string(),
  clientSubmissionId: z.string(),
  beneficiaryId: z.string().nullable(),
  status: z.enum(['DRAFT', 'VALIDATED', 'PROCESSED', 'REJECTED']),
  formId: z.string(),
  formVersion: z.number().int(),
  submittedAt: z.string().optional(),
  updatedAt: z.string(),
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])),
})
export type FormSubmissionResponse = z.infer<typeof formSubmissionResponse>

// One row of GET metadata/projects/:projectId/forms/:formId/submissions.
export const formSubmissionSummaryResponse = z.object({
  id: z.string(),
  status: z.enum(['DRAFT', 'VALIDATED', 'PROCESSED', 'REJECTED']),
  formVersion: z.number().int(),
  submittedAt: z.string().optional(),
  updatedAt: z.string(),
})
export type FormSubmissionSummaryResponse = z.infer<typeof formSubmissionSummaryResponse>

// Body of GET metadata/projects/:projectId/forms/:formId/submissions.
export const formSubmissionPageResponse = z.object({
  offset: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(formSubmissionSummaryResponse),
})
export type FormSubmissionPageResponse = z.infer<typeof formSubmissionPageResponse>
```

Create `packages/shared/src/contracts/metadata/form-responses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { formResponse, formSubmissionPageResponse, formSubmissionResponse } from './form-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const field = {
  id: uuid,
  code: 'score',
  label: 'Score',
  dataType: 'INTEGER',
  required: true,
  metadataKey: false,
  sadddField: false,
  allowedValues: null,
  minimumValue: '0',
  minimumLength: null,
  maximumLength: null,
  sequence: 1,
}
const form = {
  id: uuid,
  projectId: uuid,
  code: 'post_test',
  version: 1,
  name: 'Post test',
  description: null,
  formType: 'POST_TEST',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  publishedAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
  createdByCurrentUser: false,
  fields: [field],
}
const submission = {
  id: uuid,
  clientSubmissionId: uuid,
  beneficiaryId: null,
  status: 'DRAFT',
  formId: uuid,
  formVersion: 1,
  updatedAt: '2026-10-13T00:00:00.000Z',
  values: { score: 7, topics: ['a', 'b'], consent: true, note: null },
}

describe('form response contracts', () => {
  it('describe a form with its fields, a submission and a submission page', () => {
    expect(formResponse.safeParse(form).success).toBe(true)
    expect(formSubmissionResponse.safeParse(submission).success).toBe(true)
    expect(
      formSubmissionPageResponse.safeParse({
        offset: 0,
        limit: 10,
        total: 1,
        items: [{ id: uuid, status: 'VALIDATED', formVersion: 1, updatedAt: '2026-10-13' }],
      }).success,
    ).toBe(true)
  })

  it('reject a form with an unknown type or status, or a field without a data type', () => {
    expect(formResponse.safeParse({ ...form, formType: 'SURVEY' }).success).toBe(false)
    expect(formResponse.safeParse({ ...form, status: 'RETIRED' }).success).toBe(false)
    expect(
      formResponse.safeParse({ ...form, fields: [{ ...field, dataType: 'JSON' }] }).success,
    ).toBe(false)
  })

  it('reject a submission whose value is an object or whose contributor is not a string', () => {
    expect(
      formSubmissionResponse.safeParse({ ...submission, values: { score: { nested: 1 } } }).success,
    ).toBe(false)
    expect(formSubmissionResponse.safeParse({ ...submission, beneficiaryId: 7 }).success).toBe(
      false,
    )
  })
})
```

- [ ] **Step 2: Export them and annotate the api functions**

`.tmp/s5b/task1-api-edits.json` holds the 13 exact replacements in the five api files: the type imports, the return types of the six functions, and the two `.map` callbacks of `readBatchDetail` and `readBatchRows` that carry the type-only casts for the JSON columns:

Create `.tmp/s5b/task1-api-edits.json`:

```json
[
  [
    "apps/api/src/modules/imports/imports.mapper.ts",
    "import type { Prisma } from '@prisma/client'\n",
    "import type { ImportBatchResponse } from '@pathways/shared'\nimport type { Prisma } from '@prisma/client'\n",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.mapper.ts",
    "export function mapBatch(batch: BatchRow) {",
    "export function mapBatch(batch: BatchRow): ImportBatchResponse {",
    1
  ],
  [
    "apps/api/src/modules/imports/import-batches.service.ts",
    "import type { ImportRowsQuery } from '@pathways/shared'",
    "import type {\n  ImportBatchDetailResponse,\n  ImportMappingResponse,\n  ImportRowResponse,\n  ImportRowsPageResponse,\n  ImportRowsQuery,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/imports/import-batches.service.ts",
    "  projectId: string,\n  batchId: string,\n) {\n  const batch = await requireBatch(tx, actor, projectId, batchId)\n  const mappings = await tx.metadataMapping.findMany({",
    "  projectId: string,\n  batchId: string,\n): Promise<ImportBatchDetailResponse> {\n  const batch = await requireBatch(tx, actor, projectId, batchId)\n  const mappings = await tx.metadataMapping.findMany({",
    1
  ],
  [
    "apps/api/src/modules/imports/import-batches.service.ts",
    "    sourceColumns,\n    mappings,\n  }\n",
    "    sourceColumns,\n    mappings: mappings.map(\n      (mapping): ImportMappingResponse => ({\n        ...mapping,\n        valueMap: mapping.valueMap as ImportMappingResponse['valueMap'],\n      }),\n    ),\n  }\n",
    1
  ],
  [
    "apps/api/src/modules/imports/import-batches.service.ts",
    "  query: ImportRowsQuery,\n) {\n  const batch = await requireBatch(tx, actor, projectId, batchId)\n  const rows = await tx.dataImportRow.findMany({",
    "  query: ImportRowsQuery,\n): Promise<ImportRowsPageResponse> {\n  const batch = await requireBatch(tx, actor, projectId, batchId)\n  const rows = await tx.dataImportRow.findMany({",
    1
  ],
  [
    "apps/api/src/modules/imports/import-batches.service.ts",
    "    rows: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),\n",
    "    rows: rows.map(\n      (row): ImportRowResponse => ({\n        ...row,\n        rawData: row.rawData as ImportRowResponse['rawData'],\n        validationErrors: row.validationErrors as ImportRowResponse['validationErrors'],\n        updatedAt: row.updatedAt.toISOString(),\n      }),\n    ),\n",
    1
  ],
  [
    "apps/api/src/modules/metadata/metadata.mapper.ts",
    "import type { CreateFormRequest, FormFieldValidationContract } from '@pathways/shared'",
    "import type { CreateFormRequest, FormFieldValidationContract, FormResponse } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/metadata/metadata.mapper.ts",
    "export function mapForm(form: FormRow, actor: ApplicationIdentity) {",
    "export function mapForm(form: FormRow, actor: ApplicationIdentity): FormResponse {",
    1
  ],
  [
    "apps/api/src/modules/metadata/form-lookup.service.ts",
    "import { hasAtomicPermission } from '@pathways/shared'",
    "import { type FormSubmissionResponse, hasAtomicPermission } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/metadata/form-lookup.service.ts",
    "  form: FormRow,\n  submissionId: string,\n) {\n  if (!UUID_PATTERN.test(submissionId)) throw new NotFoundException('Submission unavailable.')\n  const row = await tx.formSubmission.findFirst({",
    "  form: FormRow,\n  submissionId: string,\n): Promise<FormSubmissionResponse> {\n  if (!UUID_PATTERN.test(submissionId)) throw new NotFoundException('Submission unavailable.')\n  const row = await tx.formSubmission.findFirst({",
    1
  ],
  [
    "apps/api/src/modules/metadata/form-submission-reads.service.ts",
    "import {\n  type FormValidationMode,\n  type ListSubmissionsQuery,",
    "import {\n  type FormSubmissionPageResponse,\n  type FormValidationMode,\n  type ListSubmissionsQuery,",
    1
  ],
  [
    "apps/api/src/modules/metadata/form-submission-reads.service.ts",
    "  query: ListSubmissionsQuery,\n) {\n  const form = await requireForm(tx, actor, projectId, formId)\n  const offset =",
    "  query: ListSubmissionsQuery,\n): Promise<FormSubmissionPageResponse> {\n  const form = await requireForm(tx, actor, projectId, formId)\n  const offset =",
    1
  ]
]
```

```bash
sed -i "s#^export \* from './contracts/imports/import-requests'#&\nexport * from './contracts/imports/import-responses'#; s#^export \* from './contracts/metadata/form-requests'#&\nexport * from './contracts/metadata/form-responses'#" packages/shared/src/index.ts
git diff packages/shared/src/index.ts | grep "^[+-]export"
node .tmp/s5b/replace-exact.mjs .tmp/s5b/task1-api-edits.json
git add -N packages/shared/src/contracts/imports packages/shared/src/contracts/metadata
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm exec biome check $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -1
git diff --stat | cat
```

Expected: the two export lines, 13 replacements in 5 files, Biome checking the 10 changed files twice (writing, then checking; it fixes none, because the files were written in the formatted shape), and the diffstat of 10 files (the api edits are return types and two casts, the rest is new):

```
+export * from './contracts/imports/import-responses'
+export * from './contracts/metadata/form-responses'
13 replacements in 5 files
Checked 10 files in <ms>. No fixes applied.
Checked 10 files in <ms>. No fixes applied.
 .../src/modules/imports/import-batches.service.ts  |  28 ++++-
 apps/api/src/modules/imports/imports.mapper.ts     |   3 +-
 .../src/modules/metadata/form-lookup.service.ts    |   4 +-
 .../metadata/form-submission-reads.service.ts      |   3 +-
 apps/api/src/modules/metadata/metadata.mapper.ts   |   4 +-
 .../src/contracts/imports/import-responses.test.ts |  93 ++++++++++++++++
 .../src/contracts/imports/import-responses.ts      | 117 +++++++++++++++++++++
 .../src/contracts/metadata/form-responses.test.ts  |  77 ++++++++++++++
 .../src/contracts/metadata/form-responses.ts       |  79 ++++++++++++++
 packages/shared/src/index.ts                       |   2 +
 10 files changed, 399 insertions(+), 11 deletions(-)
```

- [ ] **Step 3: Typecheck, test, and prove the contracts catch drift**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck 2>&1 | grep -E "error|Done" 
pnpm --filter @pathways/shared test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm --filter @pathways/api test -- imports metadata 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean (`Done` for config, shared, imports, api and web), shared at `B_shared` plus 2 files and 7 tests, and the api imports and metadata tests passing unchanged:

```
packages/config typecheck: Done
packages/shared typecheck: Done
packages/imports typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
 Test Files  37 passed (37)
      Tests  672 passed (672)
 Test Files  152 passed | 10 skipped (162)
      Tests  2610 passed | 21 skipped (2631)
```

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -2
git add packages/shared/src apps/api/src
git commit -q -m "refactor: add the import and form response contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -12
```

Expected: lint clean and a commit of 10 files:

```
$ pnpm exec biome check .
Checked 1376 files in <ms>. No fixes applied.

 .../src/modules/imports/import-batches.service.ts  |  28 ++++-
 apps/api/src/modules/imports/imports.mapper.ts     |   3 +-
 .../src/modules/metadata/form-lookup.service.ts    |   4 +-
 .../metadata/form-submission-reads.service.ts      |   3 +-
 apps/api/src/modules/metadata/metadata.mapper.ts   |   4 +-
 .../src/contracts/imports/import-responses.test.ts |  93 ++++++++++++++++
 .../src/contracts/imports/import-responses.ts      | 117 +++++++++++++++++++++
 .../src/contracts/metadata/form-responses.test.ts  |  77 ++++++++++++++
 .../src/contracts/metadata/form-responses.ts       |  79 ++++++++++++++
 packages/shared/src/index.ts                       |   2 +
 10 files changed, 399 insertions(+), 11 deletions(-)
```

- [ ] **Step 5: Prove the contracts catch drift**

Remove a stored status from the contract and see the api refuse to compile, then restore the file:

```bash
sed -i "s/z.enum(\['RESERVED', 'STORED', 'RECOVERY_REQUIRED', 'FAILED'\])/z.enum(['RESERVED', 'STORED', 'FAILED'])/" packages/shared/src/contracts/imports/import-responses.ts
git diff --stat | tail -1
pnpm --filter @pathways/shared build > /dev/null 2>&1
pnpm --filter @pathways/api exec tsc --noEmit 2>&1 | grep -E "error" | cut -c1-200
git checkout -q packages/shared/src/contracts/imports/import-responses.ts
pnpm --filter @pathways/shared build > /dev/null 2>&1
pnpm --filter @pathways/api exec tsc --noEmit 2>&1 | grep -c "error"
git status --short | wc -l
```

Expected: one changed line, api errors that name the stored status the contract no longer lists, then after the restore no api error (`0`) and a clean tree (`0`):

```
 1 file changed, 1 insertion(+), 1 deletion(-)
src/modules/imports/imports.mapper.ts(69,5): error TS2322: Type 'ImportStorageStatus' is not assignable to type '"RESERVED" | "STORED" | "FAILED"'.
0
0
```

---

### Task 2: The forms and imports clients, beside the old methods

**Files:**
- Create: `apps/web/src/lib/api/forms.ts`, `imports.ts`, `imports.schema.ts` (generated), `forms.test.ts`, `imports.test.ts`
- Create (gitignored): `.tmp/s5b/moved-original.mjs`, `.tmp/s5b/build-clients.mjs`

The old methods stay in `pathways-client.ts` for this task, so the tests can run every case against both clients and `same-lines` can compare them with the new files.

- [ ] **Step 1: Write the generator and the characterization tests**

`.tmp/s5b/build-clients.mjs` writes `forms.ts`, `imports.ts` and the receipt parser copy. For each of the 22 methods it takes the class method block of `pathways-client.ts`, closes it as an object member, and applies the swaps of ruling 4; it stops if a swap does not match or a web type name is left in the output:

Create `.tmp/s5b/build-clients.mjs`:

```js
// Writes the lib/api forms and imports modules from the methods still in pathways-client.ts, with the contract type names and request checks swapped in.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

import { clientFile, groups, methodBlock } from './client-blocks.mjs'

const client = readFileSync(clientFile, 'utf8')

// Applies the swaps of one method; every swap must match, so a changed method stops the run.
function swap(text, pairs, label) {
  let result = text
  for (const [from, to] of pairs) {
    if (!result.includes(from)) throw new Error(`${label}: missing text: ${from.slice(0, 60)}`)
    result = result.replaceAll(from, to)
  }
  return result
}

// An object-literal client: each class method block gets its closing comma and its own swaps.
function clientObject(name, methods, swaps) {
  const blocks = methods.map((method) =>
    swap(methodBlock(client, method).replace(/\n {2}\}\n$/, '\n  },\n'), swaps[method] ?? [], method),
  )
  const text = `export const ${name} = {\n${blocks.join('\n')}}\n`
  const left = /\b(DigitalFormDefinition|DirectFormSubmission|ImportBatchDefinition|ImportRowsPage)\b/.exec(text)
  if (left) throw new Error(`${name}: web type ${left[1]} left in the generated client`)
  return text
}

const form = ['Promise<DigitalFormDefinition>', 'Promise<FormResponse>']
const submission = ['Promise<DirectFormSubmission>', 'Promise<FormSubmissionResponse>']
const batch = ['Promise<ImportBatchDefinition>', 'Promise<ImportBatchResponse>']
const check = (body, request) => [`JSON.stringify(${body})`, `JSON.stringify(${body} satisfies ${request})`]

const [forms, imports] = groups
const formSwaps = {
  getDigitalForms: [
    ['Promise<DigitalFormDefinition[]>', 'Promise<FormResponse[]>'],
    ['as DigitalFormDefinition[]', 'as FormResponse[]'],
  ],
  getDigitalForm: [form],
  createDigitalForm: [form, check('input', 'CreateFormRequest')],
  updateDigitalForm: [form, check('input', 'UpdateFormRequest')],
  publishDigitalForm: [form, check('{ expectedUpdatedAt }', 'FormVersionRequest')],
  createDigitalFormVersion: [form],
  generateDigitalForm: [form, check('input', 'GenerateFormRequest')],
  validateDigitalFormValues: [check('{ values }', 'ValidateFormValuesRequest')],
  saveDirectSubmission: [
    submission,
    [
      '          ...(beneficiaryId ? { beneficiaryId } : {}),\n        }),',
      '          ...(beneficiaryId ? { beneficiaryId } : {}),\n        } satisfies SaveSubmissionRequest),',
    ],
  ],
  getDirectSubmission: [submission],
  getDirectSubmissionByClientId: [submission],
  updateDirectSubmission: [submission, check('{ expectedUpdatedAt, values }', 'UpdateSubmissionRequest')],
  submitDirectSubmission: [submission, check('{ expectedUpdatedAt }', 'SubmitSubmissionRequest')],
}
writeFileSync(
  'apps/web/src/lib/api/forms.ts',
  `import type {
  CreateFormRequest,
  FormResponse,
  FormSubmissionResponse,
  FormValidationResult,
  FormVersionRequest,
  GenerateFormRequest,
  SaveSubmissionRequest,
  SubmitSubmissionRequest,
  UpdateFormRequest,
  UpdateSubmissionRequest,
  ValidateFormValuesRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { SaveDigitalFormInput } from '@/types/pathways'

${clientObject(forms.client, forms.methods, formSwaps)}`,
)

const importSwaps = {
  getImportBatches: [
    ['value as ImportBatchDefinition[]', 'value as ImportBatchResponse[]'],
  ],
  getImportBatch: [['as Promise<ImportBatchDefinition>', 'as Promise<ImportBatchDetailResponse>']],
  getImportRows: [['as Promise<ImportRowsPage>', 'as Promise<ImportRowsPageResponse>']],
  uploadImport: [batch],
  resumeImportUpload: [batch],
  automaticImportMapping: [check('{ expectedMappingRevision }', 'AutomaticImportMappingRequest')],
  saveImportMapping: [
    batch,
    check('{ expectedMappingRevision, mappings }', 'SaveImportMappingRequest'),
  ],
  validateImport: [batch, check('{ expectedMappingRevision }', 'ValidateImportRequest')],
  processImport: [batch, check('{ expectedValidationRevision }', 'ProcessImportRequest')],
}
writeFileSync(
  'apps/web/src/lib/api/imports.ts',
  `import type {
  AutomaticImportMappingRequest,
  ImportBatchDetailResponse,
  ImportBatchResponse,
  ImportRowsPageResponse,
  ProcessImportRequest,
  SaveImportMappingRequest,
  ValidateImportRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { ImportMappingInput } from '@/types/pathways'

import { parseAutomaticMappingReceipt } from './imports.schema'

${clientObject(imports.client, imports.methods, importSwaps)}`,
)

copyFileSync('apps/web/src/lib/services/automatic-mapping-receipt.ts', 'apps/web/src/lib/api/imports.schema.ts')
console.log('wrote 3 modules')
```

`.tmp/s5b/moved-original.mjs` writes the 22 blocks and the receipt parser, as they stand in the old files, to one file for the line proof:

Create `.tmp/s5b/moved-original.mjs`:

```js
// Writes the moved methods of pathways-client.ts and the receipt parser to one file so same-lines.mjs can compare them with the new lib/api modules.
import { readFileSync, writeFileSync } from 'node:fs'

import { clientFile, groups, methodBlock } from './client-blocks.mjs'

const [out] = process.argv.slice(2)
const client = readFileSync(clientFile, 'utf8')
const receipt = readFileSync('apps/web/src/lib/services/automatic-mapping-receipt.ts', 'utf8')

const clients = groups.map(
  (group) =>
    `const ${group.client} = {\n${group.methods
      .map((name) => methodBlock(client, name).replace(/\n {2}\}\n$/, '\n  },\n'))
      .join('\n')}}\n`,
)
writeFileSync(out, `${clients.join('')}${receipt.slice(receipt.indexOf('const receiptSchema'))}`)
console.log(`blocks written: ${groups.flatMap((group) => group.methods).length + 1}`)
```

The two tests run each case against `pathwaysClient` and the new client (`describe.each`), assert the exact path, method and body of every request, and use the synthetic ids `80100000-...` and `80200000-...`:

Create `apps/web/src/lib/api/forms.test.ts`:

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
import type { SaveDigitalFormInput } from '@/types/pathways'
import { formsClient } from './forms'

const projectId = '80100000-0000-4000-8000-000000000001'
const formId = '80100000-0000-4000-8000-000000000002'
const submissionId = '80100000-0000-4000-8000-000000000003'
const beneficiaryId = '80100000-0000-4000-8000-000000000004'
const clientId = '80100000-0000-4000-8000-000000000005'
const formsPath = `/metadata/projects/${projectId}/forms`
const formPath = `${formsPath}/${formId}`
const submissionsPath = `${formPath}/submissions`
const stamp = '2026-10-13T00:00:00.000Z'
const input: SaveDigitalFormInput = {
  code: 'post_test',
  name: 'Post test',
  formType: 'POST_TEST',
  fields: [
    {
      code: 'score',
      label: 'Score',
      dataType: 'INTEGER',
      required: true,
      metadataKey: false,
      sadddField: false,
    },
  ],
}

// The same cases run against the method still on pathwaysClient and against its copy in formsClient.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['formsClient', formsClient],
] as const

describe.each(clients)('%s form and direct entry requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the forms and refuses an answer that is not a list or holds over 100 forms', async () => {
    request.requestFoundation.mockResolvedValue([{ id: formId }])
    await expect(client.getDigitalForms(projectId)).resolves.toEqual([{ id: formId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(formsPath)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({}))]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.getDigitalForms(projectId)).rejects.toThrow('Invalid form response.')
    }
  })

  it('reads one form by its encoded id', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await expect(client.getDigitalForm(projectId, 'a b')).resolves.toEqual({ id: formId })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formsPath}/a%20b`)
  })

  it('creates and updates a form with the exact definition and the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await client.createDigitalForm(projectId, input)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formsPath, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await client.updateDigitalForm(projectId, formId, { ...input, expectedUpdatedAt: stamp })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formPath, {
      method: 'PATCH',
      body: JSON.stringify({ ...input, expectedUpdatedAt: stamp }),
    })
  })

  it('publishes with the update stamp, opens a version with no body and generates a copy', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await client.publishDigitalForm(projectId, formId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: stamp }),
    })
    await client.createDigitalFormVersion(projectId, formId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/versions`, {
      method: 'POST',
    })
    const copy = { sourceFormId: formId, code: 'post_test_copy', name: 'Post test (copy)' }
    await client.generateDigitalForm(projectId, copy)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formsPath}/generate`, {
      method: 'POST',
      body: JSON.stringify(copy),
    })
  })

  it('validates answers without saving them', async () => {
    request.requestFoundation.mockResolvedValue({ valid: true, values: {}, errors: [] })
    await expect(
      client.validateDigitalFormValues(projectId, formId, { score: '7' }),
    ).resolves.toEqual({ valid: true, values: {}, errors: [] })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ values: { score: '7' } }),
    })
  })

  it('saves a submission with the contributor only when one is given', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.saveDirectSubmission(projectId, formId, clientId, { score: '7' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' } }),
    })
    await client.saveDirectSubmission(projectId, formId, clientId, { score: '7' }, beneficiaryId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' }, beneficiaryId }),
    })
  })

  it('reads a submission by its id and by its client id', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.getDirectSubmission(projectId, formId, submissionId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/${submissionId}`)
    await client.getDirectSubmissionByClientId(projectId, formId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/by-client/a%20b`)
  })

  it('updates and submits a submission with the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.updateDirectSubmission(projectId, formId, submissionId, stamp, { score: '8' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedUpdatedAt: stamp, values: { score: '8' } }),
      },
    )
    await client.submitDirectSubmission(projectId, formId, submissionId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}/submit`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: stamp }) },
    )
  })
})
```

Create `apps/web/src/lib/api/imports.test.ts`:

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
import { importsClient } from './imports'

const projectId = '80200000-0000-4000-8000-000000000001'
const batchId = '80200000-0000-4000-8000-000000000002'
const formId = '80200000-0000-4000-8000-000000000003'
const clientImportId = '80200000-0000-4000-8000-000000000004'
const batchesPath = `/imports/projects/${projectId}/batches`
const batchPath = `${batchesPath}/${batchId}`

// The same cases run against the method still on pathwaysClient and against its copy in importsClient.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['importsClient', importsClient],
] as const

describe.each(clients)('%s import requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the batches and refuses an answer that is not a list or holds over 100 batches', async () => {
    request.requestFoundation.mockResolvedValue([{ id: batchId }])
    await expect(client.getImportBatches(projectId)).resolves.toEqual([{ id: batchId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(batchesPath)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({}))]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.getImportBatches(projectId)).rejects.toThrow(
        'Invalid import batch response.',
      )
    }
  })

  it('reads one batch and the first 100 rows by their encoded ids', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.getImportBatch(projectId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchesPath}/a%20b`)
    await client.getImportRows(projectId, batchId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${batchPath}/rows?offset=0&take=100`,
    )
  })

  it('uploads the file with both ids as multipart fields', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    const file = new File(['name\nSample'], 'rows.csv', { type: 'text/csv' })
    await client.uploadImport(projectId, formId, clientImportId, file)
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${batchesPath}/upload`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect([...init.body.keys()]).toEqual(['formId', 'clientImportId', 'file'])
    expect(init.body.get('formId')).toBe(formId)
    expect(init.body.get('clientImportId')).toBe(clientImportId)
    expect((init.body.get('file') as File).name).toBe('rows.csv')
  })

  it('resumes a stored upload with no body', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.resumeImportUpload(projectId, batchId)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/resume`, {
      method: 'POST',
    })
  })

  it('runs automatic mapping and refuses a receipt for another batch or one that is malformed', async () => {
    const receipt = {
      batchId,
      mappingRevision: 1,
      mapped: 2,
      pending: 1,
      requiredUnmapped: 0,
      complete: false,
    }
    request.requestFoundation.mockResolvedValue(receipt)
    await expect(client.automaticImportMapping(projectId, batchId, 0)).resolves.toEqual(receipt)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/automatic-mapping`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 0 }),
    })
    for (const bad of [{ ...receipt, batchId: clientImportId }, { ...receipt, mapped: -1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.automaticImportMapping(projectId, batchId, 1)).rejects.toThrow(
        'Invalid automatic mapping receipt.',
      )
    }
  })

  it('saves a mapping revision with every decision as sent', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    const mappings = [
      { sourceFieldName: 'column_0001', targetFieldCode: 'name', ignored: false },
      {
        sourceFieldName: 'column_0002',
        ignored: false,
        targetFieldCode: 'sex',
        dataType: 'SELECT' as const,
        valueMap: [{ from: 'M', to: 'Male' }],
      },
      { sourceFieldName: 'column_0003', ignored: true },
    ]
    await client.saveImportMapping(projectId, batchId, 2, mappings)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/mapping`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedMappingRevision: 2, mappings }),
    })
  })

  it('validates against a mapping revision and processes against a validation revision', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.validateImport(projectId, batchId, 3)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 3 }),
    })
    await client.processImport(projectId, batchId, 4)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/process`, {
      method: 'POST',
      body: JSON.stringify({ expectedValidationRevision: 4 }),
    })
  })
})
```

- [ ] **Step 2: Generate the clients and prove every line moved**

```bash
node .tmp/s5b/build-clients.mjs
node .tmp/s5b/moved-original.mjs .tmp/s5b/files/moved-original.ts
node .tmp/s5b/same-lines.mjs .tmp/s5b/files/moved-original.ts --strip ' satisfies [A-Za-z]+' apps/web/src/lib/api/forms.ts apps/web/src/lib/api/imports.ts apps/web/src/lib/api/imports.schema.ts FormResponse=DigitalFormDefinition FormSubmissionResponse=DirectFormSubmission ImportBatchResponse=ImportBatchDefinition ImportBatchDetailResponse=ImportBatchDefinition ImportRowsPageResponse=ImportRowsPage
git add -N apps/web/src/lib/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
wc -l apps/web/src/lib/api/forms.ts apps/web/src/lib/api/imports.ts apps/web/src/lib/api/imports.schema.ts
grep -c "satisfies" apps/web/src/lib/api/forms.ts apps/web/src/lib/api/imports.ts
```

Expected: 22 method blocks and the parser written (23 blocks), `lost 0` and `added 0` over 222 lines (the swapped return types and the `satisfies` checks are undone by the rename arguments and `--strip`, so the proof compares every other character), Biome checking the five new files and reflowing the two clients, and the sizes and check counts of the clients (13 and 9 methods, 8 and 4 lines with a `satisfies` check):

```
wrote 3 modules
blocks written: 23
original lines 222, lost 0, added 0
Checked 5 files in <ms>. Fixed 2 files.
  154 apps/web/src/lib/api/forms.ts
  109 apps/web/src/lib/api/imports.ts
   27 apps/web/src/lib/api/imports.schema.ts
  290 total
apps/web/src/lib/api/forms.ts:8
apps/web/src/lib/api/imports.ts:4
```

The proof runs before Biome because Biome wraps the longer lines the checks create; a proof after formatting would list the wrapped lines as lost.

- [ ] **Step 3: Typecheck and run the tests on both clients**

```bash
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec vitest run src/lib/api/forms.test.ts src/lib/api/imports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
git checkout -- apps/web/next-env.d.ts
```

Expected: no type error, 2 files and 30 tests passing (the 8 and 7 cases, each against two clients):

```
 Test Files  2 passed (2)
      Tests  30 passed (30)
```

Now two mutations, each in the new client only, must fail its test (the old client keeps passing, so the failure count is the number of cases the mutation reaches):

```bash
cp apps/web/src/lib/api/forms.ts .tmp/s5b/files/forms.bak
cp apps/web/src/lib/api/imports.ts .tmp/s5b/files/imports.bak
sed -i 's/\.\.\.(beneficiaryId ? { beneficiaryId } : {}),/beneficiaryId: beneficiaryId ?? null,/' apps/web/src/lib/api/forms.ts
sed -i 's/rows?offset=0&take=100/rows?offset=0\&take=50/' apps/web/src/lib/api/imports.ts
for f in forms imports; do diff .tmp/s5b/files/$f.bak apps/web/src/lib/api/$f.ts | grep -c '^>'; done
pnpm --filter @pathways/web exec vitest run src/lib/api/forms.test.ts src/lib/api/imports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "×|Tests +[0-9]+"
cp .tmp/s5b/files/forms.bak apps/web/src/lib/api/forms.ts
cp .tmp/s5b/files/imports.bak apps/web/src/lib/api/imports.ts
pnpm --filter @pathways/web exec vitest run src/lib/api/forms.test.ts src/lib/api/imports.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
```

Expected: one line changed in each client (`1` and `1`), the contributor member sent as `null` fails the "saves a submission with the contributor only when one is given" case of `formsClient`, the changed row page size fails the "reads one batch and the first 100 rows" case of `importsClient`, two failures in all, and after the restore 30 pass:

```
1
1
   × formsClient form and direct entry requests > saves a submission with the contributor only when one is given <ms>
   × importsClient import requests > reads one batch and the first 100 rows by their encoded ids <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 28 passed (30)
      Tests  30 passed (30)
```

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -1
git add apps/web/src/lib/api
git commit -q -m "refactor(web): add the forms and imports clients beside the pathways client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -7
```

Expected: lint clean and a commit of the five new files:

```
Checked 1381 files in <ms>. No fixes applied.

 apps/web/src/lib/api/forms.test.ts     | 149 +++++++++++++++++++++++++++++++
 apps/web/src/lib/api/forms.ts          | 154 +++++++++++++++++++++++++++++++++
 apps/web/src/lib/api/imports.schema.ts |  27 ++++++
 apps/web/src/lib/api/imports.test.ts   | 132 ++++++++++++++++++++++++++++
 apps/web/src/lib/api/imports.ts        | 109 +++++++++++++++++++++++
 5 files changed, 571 insertions(+)
```

---

### Task 3: Move the callers and mocks, remove the old methods, alias the web types

**Files:**
- Modify: 7 files that call a moved method (`collection-workspace.tsx`, `import-workspace.tsx`, `direct-form-entry-workspace.tsx`, `features/projects/indicators/components/project-indicators-workspace.tsx`, `features/beneficiaries/profile/components/beneficiary-detail-loader.tsx`, `features/beneficiaries/profile/hooks/use-beneficiary-detail.ts`, `lib/services/pathways-client.test.ts`), 12 test files with a `pathways-client` mock factory, `lib/services/pathways-client.ts`, `types/pathways.ts`, `features/collection/digital-form-contract.ts`, `lib/api/forms.test.ts`, `lib/api/imports.test.ts`
- Move: `lib/services/automatic-mapping-receipt.test.ts` to `lib/api/imports.schema.test.ts`; delete `lib/services/automatic-mapping-receipt.ts` (its copy is `lib/api/imports.schema.ts`)
- Create (gitignored): `.tmp/s5b/move-client-calls.mjs`, `split-client-mocks.mjs`, `remove-client-methods.mjs`, `alias-web-types.mjs`, `plain-client-tests.mjs`, `task3-edits.json`

- [ ] **Step 1: Write the scripts**

`.tmp/s5b/move-client-calls.mjs` rewrites each `pathwaysClient.<moved method>` call to the client that owns it and adds the import (or trims `pathwaysClient` from the import when nothing else uses it); it skips the two new client modules and their tests, and prints each file with its call count:

Create `.tmp/s5b/move-client-calls.mjs`:

```js
// Rewrites pathwaysClient.<moved method> calls to the forms or imports client and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { groups } from './client-blocks.mjs'

const skip = new Set([
  'lib/services/pathways-client.ts',
  'lib/api/forms.ts',
  'lib/api/forms.test.ts',
  'lib/api/imports.ts',
  'lib/api/imports.test.ts',
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

`.tmp/s5b/split-client-mocks.mjs` gives every test that mocks `pathways-client` a matching `vi.mock` of each new module whose methods the test mentions: an object passed by name is served under both names, an object literal is split, and a factory left with nothing keeps an empty `pathwaysClient` so the real client is never loaded:

Create `.tmp/s5b/split-client-mocks.mjs`:

```js
// Gives every test that mocks pathways-client a matching vi.mock of each new forms or imports client its factory serves.
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

`.tmp/s5b/remove-client-methods.mjs` deletes the 22 methods from the `PathwaysClient` interface and the class:

Create `.tmp/s5b/remove-client-methods.mjs`:

```js
// Removes the moved methods from the PathwaysClient interface and the class in pathways-client.ts.
import { readFileSync, writeFileSync } from 'node:fs'

import { allMethods, clientFile, memberBlock, methodBlock } from './client-blocks.mjs'

let text = readFileSync(clientFile, 'utf8')
for (const name of allMethods) {
  for (const block of [memberBlock(text, name), methodBlock(text, name)]) text = text.replace(block, '')
}
writeFileSync(clientFile, text)
console.log(`removed ${allMethods.length} methods from the interface and the class`)
```

`.tmp/s5b/alias-web-types.mjs` replaces the five web interfaces with aliases of the response types (ruling 3):

Create `.tmp/s5b/alias-web-types.mjs`:

```js
// Replaces the web interfaces for forms, submissions, import batches and rows with aliases of the response contracts.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/types/pathways.ts'
let text = readFileSync(file, 'utf8')

// Replaces the text from one declaration to the start of the next with new text.
function replaceBetween(from, to, replacement) {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error(`missing ${from} or ${to}`)
  text = text.slice(0, start) + replacement + text.slice(end)
}

replaceBetween('export interface DigitalFormDefinition {', 'export interface SaveDigitalFormInput', 'export type DigitalFormDefinition = FormResponse\n\n')
replaceBetween('export interface DirectFormSubmission {', 'export type ImportBatchStatus', 'export type DirectFormSubmission = FormSubmissionResponse\n\n')
replaceBetween(
  'export interface ImportSourceColumn {',
  'export interface ImportMappingInput',
  `export type ImportSourceColumn = ImportSourceColumnResponse

// A batch from any import route; only the detail route fills the source columns and mappings.
export type ImportBatchDefinition = ImportBatchResponse &
  Partial<Pick<ImportBatchDetailResponse, 'sourceHeaders' | 'sourceColumns' | 'mappings'>>

export type ImportRowDefinition = ImportRowResponse

export type ImportRowsPage = ImportRowsPageResponse

`,
)
const anchor = '  AssignableOfficerResponse,\n  OverdueExplanationCategory,'
if (!text.includes(anchor)) throw new Error('missing shared import anchor')
text = text.replace(
  anchor,
  `  AssignableOfficerResponse,
  FormResponse,
  FormSubmissionResponse,
  ImportBatchDetailResponse,
  ImportBatchResponse,
  ImportRowResponse,
  ImportRowsPageResponse,
  ImportSourceColumnResponse,
  OverdueExplanationCategory,`,
)
writeFileSync(file, text)
console.log('aliased 5 web types')
```

`.tmp/s5b/plain-client-tests.mjs` turns the two characterization tests into plain tests of the new clients:

Create `.tmp/s5b/plain-client-tests.mjs`:

```js
// Turns the two characterization tests into plain tests of the new clients once the old methods are gone.
import { readFileSync, writeFileSync } from 'node:fs'

for (const [name, client] of [['forms', 'formsClient'], ['imports', 'importsClient']]) {
  const file = `apps/web/src/lib/api/${name}.test.ts`
  let text = readFileSync(file, 'utf8')
  text = text.replace("import { pathwaysClient } from '@/lib/services/pathways-client'\n", '')
  const start = text.indexOf('// The same cases run')
  const end = text.indexOf('describe.each')
  if (start < 0 || end < start) throw new Error(`${file}: characterization block not found`)
  text = text.slice(0, start) + text.slice(end)
  text = text.replace(/describe\.each\(clients\)\('%s ([^']*)', \(_name, client\) => \{/, `describe('${client} $1', () => {`)
  text = text.replace(/\bclient\./g, `${client}.`)
  writeFileSync(file, text)
}
console.log('converted 2 tests')
```

`.tmp/s5b/task3-edits.json` loosens the parameter of `fromDigitalForm` (ruling 3):

Create `.tmp/s5b/task3-edits.json`:

```json
[
 [
  "apps/web/src/features/collection/digital-form-contract.ts",
  "export function fromDigitalForm(form: DigitalFormDefinition): BuilderFormField[] {",
  "export function fromDigitalForm(\n  form: Omit<DigitalFormDefinition, 'fields'> & { fields: DigitalFormFieldDefinition[] },\n): BuilderFormField[] {",
  1
 ]
]
```

- [ ] **Step 2: Move the callers and the mocks**

```bash
node .tmp/s5b/move-client-calls.mjs
node .tmp/s5b/split-client-mocks.mjs
node .tmp/s5b/count-calls.mjs
node .tmp/s5b/mock-scan.mjs lib/services/pathways-client getDigitalForms getDigitalForm createDigitalForm uploadImport getImportBatches saveDirectSubmission
node .tmp/s5b/mock-scan.mjs lib/api/forms getDigitalForms saveDirectSubmission
node .tmp/s5b/mock-scan.mjs lib/api/imports uploadImport getImportBatches
```

Expected: 45 calls rewritten in 7 files (the per-file counts), 12 test files with a mock factory split or extended (the lines name how: `added` for an object passed by name, `emptied` for the factory of `collection-workspace.test.tsx`, whose moved members all leave), no call left on `pathwaysClient` (the other mentions are the mock object keys), and the mock counts: the 46 `pathways-client` factories of Task 0 are still 46 and none names a moved method, `lib/api/forms` has 12 factories (one names `getDigitalForms`, the object literal of the collection screen test; the others pass an object by name) and `lib/api/imports` has 5 (one names `uploadImport`):

```
features/beneficiaries/profile/components/beneficiary-detail-loader.tsx: 1
features/beneficiaries/profile/hooks/use-beneficiary-detail.ts: 2
features/collection/collection-workspace.tsx: 14
features/collection/direct-form-entry-workspace.tsx: 9
features/collection/import-workspace.tsx: 14
features/projects/indicators/components/project-indicators-workspace.tsx: 1
lib/services/pathways-client.test.ts: 4
files 7, calls 45
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx:25: added formsClient (object client)
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.assessments.test.tsx:34: added formsClient (object client)
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.journey-actions.test.tsx:33: added formsClient (object client)
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx:34: added formsClient (object client)
apps/web/src/features/collection/collection-workspace.extend-projects.test.tsx:50: added formsClient (object api)
apps/web/src/features/collection/collection-workspace.test.tsx:68: emptied (getDigitalForms, createDigitalForm, createDigitalFormVersion, generateDigitalForm, publishDigitalForm, updateDigitalForm, getDigitalForm; uploadImport, automaticImportMapping, getImportBatch, saveImportMapping, validateImport, processImport)
apps/web/src/features/collection/direct-entry-ownership.test.tsx:28: added formsClient (object api)
apps/web/src/features/collection/direct-form-entry-workspace.test.tsx:27: added formsClient (object api)
apps/web/src/features/collection/import-workspace.form-loading.test.tsx:24: added formsClient, importsClient (object api)
apps/web/src/features/collection/import-workspace.ownership.test.tsx:29: added formsClient, importsClient (object api)
apps/web/src/features/collection/import-workspace.processing.test.tsx:28: added formsClient, importsClient (object api)
apps/web/src/features/collection/import-workspace.suggestions.test.tsx:29: added formsClient, importsClient (object api)
files 12
production calls 0 in 0 files
test calls 0 in 0 files
other mentions in 23 files
factories 46, naming 0
apps/web/src/features/collection/collection-workspace.test.tsx:69 getDigitalForms
factories 12, naming 1
apps/web/src/features/collection/collection-workspace.test.tsx:70 uploadImport
factories 5, naming 1
```

A line saying `manual` would mean a file the scripts could not rewrite; there is none in this tree.

- [ ] **Step 3: Remove the old methods and the receipt copy, alias the types**

```bash
node .tmp/s5b/remove-client-methods.mjs
node .tmp/s5b/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts | sed 's/removed .*/removed .../'
W=apps/web/src/lib
git mv $W/services/automatic-mapping-receipt.test.ts $W/api/imports.schema.test.ts
sed -i "s#'./automatic-mapping-receipt'#'./imports.schema'#" $W/api/imports.schema.test.ts
diff <(git show HEAD:$W/services/automatic-mapping-receipt.ts) $W/api/imports.schema.ts && echo "receipt copy identical"
git rm -q $W/services/automatic-mapping-receipt.ts
node .tmp/s5b/alias-web-types.mjs
node .tmp/s5b/replace-exact.mjs .tmp/s5b/task3-edits.json
node .tmp/s5b/count-it.mjs $W/api/forms.test.ts $W/api/imports.test.ts | tail -1
node .tmp/s5b/plain-client-tests.mjs
node .tmp/s5b/count-it.mjs $W/api/forms.test.ts $W/api/imports.test.ts | tail -1
wc -l $W/services/pathways-client.ts
node .tmp/s5b/count-it.mjs $W/api/imports.schema.test.ts
git show HEAD:$W/services/automatic-mapping-receipt.test.ts > .tmp/s5b/files/receipt-old.test.ts
node .tmp/s5b/count-it.mjs .tmp/s5b/files/receipt-old.test.ts
```

Expected: the 22 methods removed, the imports trimmed (the dropped names, omitted here, are the web types the methods used and the receipt parser), the receipt copy identical to the old file, five types aliased, one replacement, two tests converted (`it 15, describe 2, expect 37` before and after, so no row or assertion changes), `pathways-client.ts` at 424 lines (716 before), and the receipt test counted at 3 rows, 1 group and 3 assertions before and after the move:

```
removed 22 methods from the interface and the class
apps/web/src/lib/services/pathways-client.ts: removed ...
receipt copy identical
aliased 5 web types
1 replacements in 1 files
total: it 15, describe 2, expect 37
converted 2 tests
total: it 15, describe 2, expect 37
424 apps/web/src/lib/services/pathways-client.ts
apps/web/src/lib/api/imports.schema.test.ts: it 3, describe 1, expect 3
total: it 3, describe 1, expect 3
.tmp/s5b/files/receipt-old.test.ts: it 3, describe 1, expect 3
total: it 3, describe 1, expect 3
```

- [ ] **Step 4: Format, type check and test**

```bash
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm exec biome check . 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
git checkout -- apps/web/next-env.d.ts
```

Expected: Biome formats the changed files, the whole repository is clean, typecheck prints nothing, and `--noUnusedLocals` lists only the two baseline lines (`indicators` and `SadddDashboard`, now on line 13 of `types/pathways.ts` because the type imports above it grew by seven names):

```
Checked 25 files in <ms>. Fixed 11 files.
Checked 1380 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(407,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
```

```bash
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
```

Expected: web at `B_web` plus 2 files and 15 rows: 234 files and 2030 tests (the two client tests now hold 8 and 7 plain rows, and the receipt test moved without a change):

```
 Test Files  234 passed (234)
      Tests  2030 passed (2030)
```

- [ ] **Step 5: Commit**

```bash
git add -A apps
git commit -q -m "refactor(web): move the form and import client callers and remove the old methods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
git status --short | wc -l
```

Expected: one commit of 26 files and a clean tree:

```
 26 files changed, <n> insertions(+), <m> deletions(-)
0
```

---

### Task 4: One shared import hook, characterized first

**Files:**
- Create: `apps/web/src/features/collection/import-workspace.resume.test.tsx`, `hooks/use-import-batch.ts`, `hooks/use-import-batch.test.tsx`
- Modify: `features/collection/collection-workspace.test.tsx`, `collection-workspace.tsx`, `import-workspace.tsx`
- Create (gitignored): `.tmp/s5b/task4-test-edits.json`, `.tmp/s5b/task4-edits.json`

Ruling 7 names what the two screens share. Before any of it moves, two flows that no test reached get a test: the import screen's `resume` (finalize a stored upload, map it automatically when it is freshly stored, reload) and the collection dialog's stop and resume of the processing run.

- [ ] **Step 1: Write the characterization tests and prove they bite**

`import-workspace.resume.test.tsx` renders `ImportWorkspace` with a batch in `RECOVERY_REQUIRED`, presses "Resume stored upload" and checks the request order, the skipped mapping for a batch that already has a revision, and the error path:

Create `apps/web/src/features/collection/import-workspace.resume.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { ImportWorkspace } from './import-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: 'auth-1',
    userId: 'actor-1',
    organizationId: 'org-1',
    roles: ['PROJECT_OFFICER'],
    permissions: ['imports.upload', 'imports.read', 'forms.read'],
    assignedProjectIds: ['project-1'],
  },
}))
const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getDigitalForms: vi.fn(),
  getDigitalForm: vi.fn(),
  getImportBatches: vi.fn(),
  getImportBatch: vi.fn(),
  getImportRows: vi.fn(),
  resumeImportUpload: vi.fn(),
  automaticImportMapping: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('sonner', () => ({ toast: toasts }))

const form = {
  id: 'form-1',
  projectId: 'project-1',
  name: 'Import form',
  version: 1,
  status: 'PUBLISHED',
  fields: [{ code: 'note', label: 'Note', dataType: 'TEXT' }],
}
const batchWith = (mappingRevision: number, status: string) => ({
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formName: 'Import form',
  originalFileName: 'notes.csv',
  uploadedAt: '2026-09-28T00:00:00Z',
  mappingRevision,
  validationRevision: 0,
  processingRevision: 0,
  storageStatus: 'STORED',
  status,
  totals: { rows: 1, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0 },
  sourceColumns: [{ key: 'column_0001', header: 'note', columnIndex: 1 }],
  mappings: [{ sourceFieldName: 'column_0001', status: 'PENDING', targetField: null }],
})
const resume = async () => {
  render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
  await screen.findByText('notes.csv')
  fireEvent.click(screen.getByText('notes.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Resume stored upload' }))
}

describe('import workspace stored upload recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    api.getImportBatches.mockResolvedValue([batchWith(0, 'RECOVERY_REQUIRED')])
    api.getImportRows.mockResolvedValue({ rows: [], total: 1 })
    api.getImportBatch.mockResolvedValue(batchWith(0, 'RECOVERY_REQUIRED'))
    api.resumeImportUpload.mockResolvedValue(batchWith(0, 'UPLOADED'))
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
  })
  afterEach(cleanup)

  it('finalizes the stored source, maps it automatically and reloads the batch', async () => {
    await resume()

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Stored source finalization resumed.'),
    )
    expect(api.resumeImportUpload).toHaveBeenCalledWith('project-1', 'batch-1')
    expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 0)
    expect(api.resumeImportUpload.mock.invocationCallOrder[0]).toBeLessThan(
      api.automaticImportMapping.mock.invocationCallOrder[0],
    )
  })

  it('skips automatic mapping when the stored batch already has a mapping revision', async () => {
    api.getImportBatch.mockResolvedValue(batchWith(1, 'RECOVERY_REQUIRED'))
    await resume()

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Stored source finalization resumed.'),
    )
    expect(api.automaticImportMapping).not.toHaveBeenCalled()
  })

  it('reports a failed recovery without mapping', async () => {
    api.resumeImportUpload.mockRejectedValue(new Error('Stored source is not readable.'))
    await resume()

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Stored source is not readable.'))
    expect(api.automaticImportMapping).not.toHaveBeenCalled()
    expect(toasts.success).not.toHaveBeenCalled()
  })
})
```

`.tmp/s5b/task4-test-edits.json` inserts the stop and resume case after the failed-call case of `collection-workspace.test.tsx` (it reuses `ownedDataset` and `deferred`):

Create `.tmp/s5b/task4-test-edits.json`:

```json
[
 [
  "apps/web/src/features/collection/collection-workspace.test.tsx",
  "    expect(within(dialog).queryByRole('button', { name: 'Proceed' })).toBeNull()\n  })\n",
  "    expect(within(dialog).queryByRole('button', { name: 'Proceed' })).toBeNull()\n  })\n  it('stops after the in-flight processing call and resumes from the same batch', async () => {\n    api.uploadImport.mockResolvedValue({ id: 'batch-owned', mappingRevision: 0 })\n    const partial = (processed: number) => ({\n      id: 'batch-owned',\n      status: processed >= 250 ? 'PROCESSED' : 'PARTIALLY_PROCESSED',\n      totals: { rows: 250, valid: 250, invalid: 0, processed, unprocessed: 0, failed: 0 },\n    })\n    const first = deferred<ReturnType<typeof partial>>()\n    api.processImport\n      .mockReturnValueOnce(first.promise)\n      .mockResolvedValueOnce(partial(200))\n      .mockResolvedValueOnce(partial(250))\n    const { submit } = await ownedDataset()\n    fireEvent.click(submit)\n\n    const dialog = screen.getByRole('dialog')\n    fireEvent.click(await within(dialog).findByRole('button', { name: 'Stop processing' }))\n    await act(async () => first.resolve(partial(100)))\n    await waitFor(() =>\n      expect(within(dialog).getByRole('status').textContent).toContain(\n        'Processing stopped: 100 of 250 rows handled',\n      ),\n    )\n    expect(api.processImport).toHaveBeenCalledOnce()\n\n    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume processing' }))\n    await waitFor(() =>\n      expect(toasts.success).toHaveBeenCalledWith(\n        'Server import batch-owned: 250 processed, 0 failed.',\n      ),\n    )\n    expect(api.processImport).toHaveBeenCalledTimes(3)\n  })\n",
  1
 ]
]
```

```bash
node .tmp/s5b/replace-exact.mjs .tmp/s5b/task4-test-edits.json
C=apps/web/src/features/collection
pnpm exec biome check --write $C/import-workspace.resume.test.tsx $C/collection-workspace.test.tsx 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/collection/import-workspace.resume.test.tsx src/features/collection/collection-workspace.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
```

Expected: one replacement, Biome leaving both files as written, and 2 files with 53 passing tests (the 49 results of the collection test before, plus its stop and resume row, plus 3 resume rows):

```
1 replacements in 1 files
Checked 2 files in <ms>. No fixes applied.
 Test Files  2 passed (2)
      Tests  53 passed (53)
```

Two mutations of the code the tests describe must fail them: the stored-upload condition of `resume` in the import screen and the stop flag of the collection screen's loop.

```bash
C=apps/web/src/features/collection
sed -i "s/if (stored.mappingRevision === 0 \&\& stored.storageStatus === 'STORED') {/if (stored.mappingRevision === 1 \&\& stored.storageStatus === 'STORED') {/" $C/import-workspace.tsx
sed -i "s/shouldStop: () => processingStopRequested.current || !ticket.valid('imports.process'),/shouldStop: () => !ticket.valid('imports.process'),/" $C/collection-workspace.tsx
git diff --stat -- $C/import-workspace.tsx $C/collection-workspace.tsx | tail -1
pnpm --filter @pathways/web exec vitest run src/features/collection/import-workspace.resume.test.tsx src/features/collection/collection-workspace.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "×|Tests +[0-9]+"
git checkout -- $C/import-workspace.tsx $C/collection-workspace.tsx
git status --short
```

Expected: two files changed by one line each; three failures, the first two resume rows (the condition) and the stop and resume row (the flag); after the restore the collection test is modified and the resume test is untracked:

```
 2 files changed, 2 insertions(+), 2 deletions(-)
   × import workspace stored upload recovery > finalizes the stored source, maps it automatically and reloads the batch <ms>
   × import workspace stored upload recovery > skips automatic mapping when the stored batch already has a mapping revision <ms>
   × collection operation ownership > stops after the in-flight processing call and resumes from the same batch <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 50 passed (53)
 M apps/web/src/features/collection/collection-workspace.test.tsx
?? apps/web/src/features/collection/import-workspace.resume.test.tsx
```

```bash
git add apps/web/src/features/collection
git commit -q -m "test(web): characterize stored upload recovery and stopped processing in the import screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -3
```

Expected: a commit of the two test files:

```
 .../collection/collection-workspace.test.tsx       |  33 ++++++
 .../collection/import-workspace.resume.test.tsx    | 113 +++++++++++++++++++++
 2 files changed, 146 insertions(+)
```

- [ ] **Step 2: Write the hook and its test**

`use-import-batch.ts` holds the three shared things (ruling 7): `uploadId(target)` returns the same client import id while every part of the target is unchanged (the retry rule), `forgetUpload()` clears it, `mapAutomatically(projectId, batch)` runs conservative automatic mapping only for a batch that is stored and has no mapping revision and returns the receipt (or `null` without a call), and `stopRequested` is the ref the process loop reads:

Create `apps/web/src/features/collection/hooks/use-import-batch.ts`:

```ts
import { useRef } from 'react'

import { importsClient } from '@/lib/api/imports'
import type { ImportBatchDefinition } from '@/types/pathways'

// Holds what the collection and import screens share about one upload: its retry identity, automatic mapping and the stop flag.
export function useImportBatch() {
  const upload = useRef<{ target: readonly unknown[]; id: string } | null>(null)
  const stopRequested = useRef(false)

  return {
    stopRequested,
    // A retried upload of the same target keeps its client import id so the server can replay it.
    uploadId(target: readonly unknown[]) {
      if (
        !upload.current ||
        target.length !== upload.current.target.length ||
        !target.every((part, index) => part === upload.current?.target[index])
      ) {
        upload.current = { target, id: crypto.randomUUID() }
      }
      return upload.current.id
    },
    forgetUpload() {
      upload.current = null
    },
    // Runs conservative automatic mapping once for a stored batch that has no mapping revision, else returns null.
    async mapAutomatically(projectId: string, batch: ImportBatchDefinition) {
      if (batch.mappingRevision !== 0 || batch.storageStatus !== 'STORED') return null
      return importsClient.automaticImportMapping(projectId, batch.id, 0)
    },
  }
}
```

Create `apps/web/src/features/collection/hooks/use-import-batch.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'
import { useImportBatch } from './use-import-batch'

const api = vi.hoisted(() => ({ automaticImportMapping: vi.fn() }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))

const batch = (mappingRevision: number, storageStatus: string) =>
  ({ id: 'batch-1', mappingRevision, storageStatus }) as ImportBatchDefinition
const file = new File(['a'], 'a.csv')

describe('useImportBatch', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps the upload id while every part of the target is unchanged and renews it otherwise', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file, 'project-1', 'form-1'])
    expect(result.current.uploadId([file, 'project-1', 'form-1'])).toBe(first)
    expect(result.current.uploadId([file, 'project-2', 'form-1'])).not.toBe(first)
    const second = result.current.uploadId([file, 'project-2', 'form-1'])
    expect(result.current.uploadId([new File(['a'], 'a.csv'), 'project-2', 'form-1'])).not.toBe(
      second,
    )
  })

  it('renews the upload id when the target gains a part', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file])
    expect(result.current.uploadId([file, 'project-1'])).not.toBe(first)
  })

  it('renews the upload id after it is forgotten', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file, 'project-1'])
    result.current.forgetUpload()
    expect(result.current.uploadId([file, 'project-1'])).not.toBe(first)
  })

  it('keeps the upload id across renders of the same screen', () => {
    const { result, rerender } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file])
    rerender()
    expect(result.current.uploadId([file])).toBe(first)
  })

  it('maps a stored batch with no mapping revision and returns the receipt', async () => {
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
    const { result } = renderHook(() => useImportBatch())
    await expect(result.current.mapAutomatically('project-1', batch(0, 'STORED'))).resolves.toEqual(
      {
        mappingRevision: 1,
      },
    )
    expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 0)
  })

  it.each([batch(1, 'STORED'), batch(0, 'RESERVED'), batch(0, 'RECOVERY_REQUIRED')])(
    'does not map a batch that is not freshly stored (%#)',
    async (value) => {
      const { result } = renderHook(() => useImportBatch())
      await expect(result.current.mapAutomatically('project-1', value)).resolves.toBeNull()
      expect(api.automaticImportMapping).not.toHaveBeenCalled()
    },
  )

  it('starts with no stop requested', () => {
    const { result } = renderHook(() => useImportBatch())
    expect(result.current.stopRequested.current).toBe(false)
  })
})
```

- [ ] **Step 3: Switch the two screens to the hook**

`.tmp/s5b/task4-edits.json` holds 16 exact replacements: in the collection screen the identity ref and its two resets, the identity comparison (replaced by one `uploadId` call), the automatic mapping block, the stop flag and the import; in the import screen the same, plus the `resume` block:

Create `.tmp/s5b/task4-edits.json`:

```json
[
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "  const processingStopRequested = useRef(false)\n",
  "  const importBatch = useImportBatch()\n",
  1
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "  const uploadIdentity = useRef<{\n    file: File\n    projectId: string\n    formId: string\n    version: number\n    generation: number\n    id: string\n  } | null>(null)\n",
  "",
  1
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "    uploadIdentity.current = null\n",
  "    importBatch.forgetUpload()\n",
  2
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "processingStopRequested.current",
  "importBatch.stopRequested.current",
  3
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "      const priorUpload = uploadIdentity.current\n      const uploadAttempt =\n        priorUpload &&\n        priorUpload.file === file &&\n        priorUpload.projectId === projectId &&\n        priorUpload.formId === selectedForm.id &&\n        priorUpload.version === selectedForm.version &&\n        priorUpload.generation === generation\n          ? priorUpload\n          : {\n              file,\n              projectId,\n              formId: selectedForm.id,\n              version: selectedForm.version,\n              generation,\n              id: crypto.randomUUID(),\n            }\n      uploadIdentity.current = uploadAttempt\n      const clientImportId = uploadAttempt.id\n",
  "      const clientImportId = importBatch.uploadId([\n        file,\n        projectId,\n        selectedForm.id,\n        selectedForm.version,\n        generation,\n      ])\n",
  1
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "      let automaticRevision: number | undefined\n      if (uploaded.mappingRevision === 0 && uploaded.storageStatus === 'STORED') {\n        const automatic = await importsClient.automaticImportMapping(projectId, uploaded.id, 0)\n        if (!ticket.valid('imports.read')) return\n        automaticRevision = automatic.mappingRevision\n      }\n",
  "      const automatic = await importBatch.mapAutomatically(projectId, uploaded)\n      if (automatic && !ticket.valid('imports.read')) return\n      const automaticRevision = automatic?.mappingRevision\n",
  1
 ],
 [
  "apps/web/src/features/collection/collection-workspace.tsx",
  "import { parseImportPreview } from './import-preview'\n",
  "import { useImportBatch } from './hooks/use-import-batch'\nimport { parseImportPreview } from './import-preview'\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "  const stopRequested = useRef(false)\n",
  "  const importBatch = useImportBatch()\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "  const uploadIdentity = useRef<{\n    file: File\n    projectId: string\n    formId: string\n    id: string\n  } | null>(null)\n",
  "",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "    if (\n      !uploadIdentity.current ||\n      uploadIdentity.current.file !== file ||\n      uploadIdentity.current.projectId !== projectId ||\n      uploadIdentity.current.formId !== formId\n    ) {\n      uploadIdentity.current = { file, projectId, formId, id: crypto.randomUUID() }\n    }\n",
  "",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "        uploadIdentity.current.id,\n",
  "        importBatch.uploadId([file, projectId, formId]),\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "      if (created.mappingRevision === 0 && created.storageStatus === 'STORED') {\n        await importsClient.automaticImportMapping(projectId, created.id, 0)\n        if (!ticket.valid('imports.read')) return\n      }\n",
  "      if ((await importBatch.mapAutomatically(projectId, created)) && !ticket.valid('imports.read'))\n        return\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "      uploadIdentity.current = null\n",
  "      importBatch.forgetUpload()\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "stopRequested.current",
  "importBatch.stopRequested.current",
  3
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "      if (stored.mappingRevision === 0 && stored.storageStatus === 'STORED') {\n        await importsClient.automaticImportMapping(projectId, batch.id, 0)\n        if (!ticket.valid('imports.read')) return\n      }\n",
  "      if ((await importBatch.mapAutomatically(projectId, stored)) && !ticket.valid('imports.read'))\n        return\n",
  1
 ],
 [
  "apps/web/src/features/collection/import-workspace.tsx",
  "import { ImportProcessingPanel, type ImportProcessingState } from './import-processing-panel'\n",
  "import { useImportBatch } from './hooks/use-import-batch'\nimport { ImportProcessingPanel, type ImportProcessingState } from './import-processing-panel'\n",
  1
 ]
]
```

```bash
node .tmp/s5b/replace-exact.mjs .tmp/s5b/task4-edits.json
C=apps/web/src/features/collection
git add -N $C/hooks
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm exec biome check . 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
```

Expected: 16 replacements in 2 files, Biome formatting the changed files (the long conditions wrap), the repository clean, no type error, the two baseline `--noUnusedLocals` lines, and the collection folder at 23 files and 179 tests (22 files and 170 before the hook test, 9 rows):

```
16 replacements in 2 files
Checked 4 files in <ms>. Fixed 2 files.
Checked 1383 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(408,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  23 passed (23)
      Tests  179 passed (179)
```

- [ ] **Step 4: Prove the hook is what the screens use**

The identity comparison is the one piece of logic that moved without a screen-level row of its own, so break its length check; the retry rows of both screens and the hook test must fail:

```bash
H=apps/web/src/features/collection/hooks/use-import-batch.ts
cp $H .tmp/s5b/files/use-import-batch.bak
sed -i 's/target.length !== upload.current.target.length ||/true ||/' $H
diff .tmp/s5b/files/use-import-batch.bak $H | grep -c '^>'
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL |Tests +[0-9]+" | cut -c1-170
cp .tmp/s5b/files/use-import-batch.bak $H
pnpm --filter @pathways/web exec vitest run src/features/collection/hooks 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
```

Expected: one line changed (`1`), four failures (the reuse of the import id in the collection screen and in the import screen, and two hook rows) and nine passing hook rows after the restore:

```
1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/features/collection/collection-workspace.test.tsx > collection import workspace > reuses the same import id after an uncertain upload and starts a new id for a
 FAIL  src/features/collection/import-workspace.ownership.test.tsx > import uploader automation and ownership > retains upload request identity when automatic mapping fai
 FAIL  src/features/collection/hooks/use-import-batch.test.tsx > useImportBatch > keeps the upload id while every part of the target is unchanged and renews it otherwise
 FAIL  src/features/collection/hooks/use-import-batch.test.tsx > useImportBatch > keeps the upload id across renders of the same screen
      Tests  4 failed | 175 passed (179)
      Tests  9 passed (9)
```

- [ ] **Step 5: Commit**

```bash
pnpm lint 2>&1 | tail -1
git add -A apps
git commit -q -m "refactor(web): share the upload identity, automatic mapping and stop flag of the import screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
git status --short | wc -l
```

Expected: lint clean, a commit of 4 files and a clean tree:

```
Checked 1383 files in <ms>. No fixes applied.
 4 files changed, <n> insertions(+), <m> deletions(-)
0
```

---

### Task 5: Move the views of the collection screen into their own files

**Files:**
- Modify: `apps/web/src/features/collection/collection-workspace.tsx` (3160 to 1788 lines)
- Create: `features/collection/components/{forms-generator-view,builder-view,form-info-panel,journey-stage-selector,field-editor,toggle-row,metadata-map-panel,form-preview-panel,import-view,summary-metric,mapping-table,data-preview,import-validation-panel,summary-pill}.tsx`, `collection.utils.ts`
- Create (gitignored): `.tmp/s5b/collection-split.json`

The 14 views are top-level declarations of the file (`FormsGeneratorView`, `BuilderView` and `ImportView` are used by the screen, the others by those three), so the declaration-level splitter of S3b moves them: each name goes to one file, in source order, with its leading comment. Seven types and seven constants or helpers that both the screen and the views use go to `collection.utils.ts` (ruling 8); the screen keeps `ExportFormat`, `CORRECTION_PAGE_SIZE`, `CollectionWorkspaceProps`, `toApiFormType`, `initialFields`, `modeDetails`, `importedFieldLabels`, `fieldFromHeader`, `formTitleFromFileName` and the two components.

- [ ] **Step 1: Write the split plan**

`.tmp/s5b/collection-split.json` maps each output path to the declarations it receives and to its literal header lines (`@original` stands for the source's own import block, which `trim-imports` cuts down afterwards; the added lines import the siblings, the types and the utils each file reads):

Create `.tmp/s5b/collection-split.json`:

```json
{
 "apps/web/src/features/collection/components/forms-generator-view.tsx": {
  "names": [
   "FormsGeneratorView"
  ],
  "header": [
   "@original",
   "import { type SavedForm, savedFormStatus, formatSavedAt } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/builder-view.tsx": {
  "names": [
   "BuilderView"
  ],
  "header": [
   "@original",
   "import { FormInfoPanel } from './form-info-panel'",
   "import { FieldEditor } from './field-editor'",
   "import { MetadataMapPanel } from './metadata-map-panel'",
   "import { FormPreviewPanel } from './form-preview-panel'",
   "import { type CollectionMode, type FormField, dataTypeLabels, statusTone } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/form-info-panel.tsx": {
  "names": [
   "FormInfoPanel"
  ],
  "header": [
   "@original",
   "import { JourneyStageSelector } from './journey-stage-selector'"
  ]
 },
 "apps/web/src/features/collection/components/journey-stage-selector.tsx": {
  "names": [
   "JourneyStageSelector"
  ],
  "header": [
   "@original"
  ]
 },
 "apps/web/src/features/collection/components/field-editor.tsx": {
  "names": [
   "FieldEditor"
  ],
  "header": [
   "@original",
   "import { ToggleRow } from './toggle-row'",
   "import { type FieldType, type FormField, dataTypeLabels } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/toggle-row.tsx": {
  "names": [
   "ToggleRow"
  ],
  "header": [
   "@original"
  ]
 },
 "apps/web/src/features/collection/components/metadata-map-panel.tsx": {
  "names": [
   "MetadataMapPanel"
  ],
  "header": [
   "@original",
   "import { type FormField } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/form-preview-panel.tsx": {
  "names": [
   "FormPreviewPanel"
  ],
  "header": [
   "@original",
   "import { type FormField, dataTypeLabels } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/import-view.tsx": {
  "names": [
   "ImportView"
  ],
  "header": [
   "@original",
   "import { FormInfoPanel } from './form-info-panel'",
   "import { SummaryMetric } from './summary-metric'",
   "import { MappingTable } from './mapping-table'",
   "import { DataPreview } from './data-preview'",
   "import { ImportValidationPanel } from './import-validation-panel'",
   "import { type CollectionMode, type CollectionView, type ImportStatus, type FormField, type ParsedImport } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/summary-metric.tsx": {
  "names": [
   "SummaryMetric"
  ],
  "header": [
   "@original"
  ]
 },
 "apps/web/src/features/collection/components/mapping-table.tsx": {
  "names": [
   "MappingTable"
  ],
  "header": [
   "@original",
   "import { type CollectionMode, type CollectionView, type FormField, tableHeadClass } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/data-preview.tsx": {
  "names": [
   "DataPreview"
  ],
  "header": [
   "@original",
   "import { type ParsedImport, MAX_PREVIEW_ROWS, tableHeadClass, formatValue } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/import-validation-panel.tsx": {
  "names": [
   "ImportValidationPanel"
  ],
  "header": [
   "@original",
   "import { SummaryPill } from './summary-pill'",
   "import { type ParsedImport } from '../collection.utils'"
  ]
 },
 "apps/web/src/features/collection/components/summary-pill.tsx": {
  "names": [
   "SummaryPill"
  ],
  "header": [
   "@original"
  ]
 },
 "apps/web/src/features/collection/collection-workspace.tsx": {
  "names": [
   "ExportFormat",
   "CORRECTION_PAGE_SIZE",
   "CollectionWorkspaceProps",
   "toApiFormType",
   "initialFields",
   "modeDetails",
   "importedFieldLabels",
   "fieldFromHeader",
   "formTitleFromFileName",
   "CollectionWorkspace",
   "OwnedCollectionWorkspace"
  ],
  "header": [
   "@original",
   "import { FormsGeneratorView } from './components/forms-generator-view'",
   "import { BuilderView } from './components/builder-view'",
   "import { ImportView } from './components/import-view'",
   "import { type CollectionMode, type CollectionView, type ImportStatus, type FormField, type ParsedImport, type SavedForm, dataTypeLabels } from './collection.utils'"
  ]
 },
 "apps/web/src/features/collection/collection.utils.ts": {
  "names": [
   "CollectionMode",
   "MAX_PREVIEW_ROWS",
   "CollectionView",
   "FieldType",
   "ImportStatus",
   "FormField",
   "ParsedImport",
   "SavedForm",
   "tableHeadClass",
   "savedFormStatus",
   "dataTypeLabels",
   "statusTone",
   "formatValue",
   "formatSavedAt"
  ],
  "header": [
   "@original"
  ]
 }
}
```

- [ ] **Step 2: Split, prove, format**

```bash
C=apps/web/src/features/collection
git hash-object $C/collection-workspace.tsx | cut -c1-8
mkdir -p $C/components
cp $C/collection-workspace.tsx .tmp/s5b/files/collection-workspace.before.tsx
node .tmp/s5b/split-module.mjs $C/collection-workspace.tsx .tmp/s5b/collection-split.json
sed -i -E 's/^(type|interface|const|function) /export \1 /' $C/components/*.tsx $C/collection.utils.ts
sed -i -E "s#from '\./(collection-import-state|digital-form-contract|form-definition-export|import-auto-continue|import-preview|import-processing-panel)'#from '../\1'#" $C/components/*.tsx
sed -i '1,2d' $C/collection.utils.ts
node .tmp/s5b/trim-imports.mjs $C/collection-workspace.tsx $C/collection.utils.ts $C/components/*.tsx | sed 's/removed .*/removed .../'
node .tmp/s5b/same-lines.mjs .tmp/s5b/files/collection-workspace.before.tsx $C/collection-workspace.tsx $C/collection.utils.ts $C/components/*.tsx --list
```

Expected: the hash prefix of the screen before the split, the 16 files written with their line counts (14 views, the screen and the utils), one `removed ...` line per file (the lists of dropped imports are long and omitted here), and the line proof over the declarations after the import blocks: `lost 0` and `added 0` of 2942 lines, because the only change to a moved line is the `export` keyword, which the comparison drops, and the import blocks are not compared. The new import lines are checked by `tsc` in the next step:

```
eb31fa4e
apps/web/src/features/collection/components/forms-generator-view.tsx: 105 lines
apps/web/src/features/collection/components/builder-view.tsx: 219 lines
apps/web/src/features/collection/components/form-info-panel.tsx: 103 lines
apps/web/src/features/collection/components/journey-stage-selector.tsx: 58 lines
apps/web/src/features/collection/components/field-editor.tsx: 177 lines
apps/web/src/features/collection/components/toggle-row.tsx: 19 lines
apps/web/src/features/collection/components/metadata-map-panel.tsx: 50 lines
apps/web/src/features/collection/components/form-preview-panel.tsx: 16 lines
apps/web/src/features/collection/components/import-view.tsx: 205 lines
apps/web/src/features/collection/components/summary-metric.tsx: 6 lines
apps/web/src/features/collection/components/mapping-table.tsx: 163 lines
apps/web/src/features/collection/components/data-preview.tsx: 48 lines
apps/web/src/features/collection/components/import-validation-panel.tsx: 47 lines
apps/web/src/features/collection/components/summary-pill.tsx: 24 lines
apps/web/src/features/collection/collection-workspace.tsx: 1695 lines
apps/web/src/features/collection/collection.utils.ts: 84 lines
apps/web/src/features/collection/collection-workspace.tsx: removed ...
apps/web/src/features/collection/collection.utils.ts: removed ...
apps/web/src/features/collection/components/builder-view.tsx: removed ...
apps/web/src/features/collection/components/data-preview.tsx: removed ...
apps/web/src/features/collection/components/field-editor.tsx: removed ...
apps/web/src/features/collection/components/form-info-panel.tsx: removed ...
apps/web/src/features/collection/components/form-preview-panel.tsx: removed ...
apps/web/src/features/collection/components/forms-generator-view.tsx: removed ...
apps/web/src/features/collection/components/import-validation-panel.tsx: removed ...
apps/web/src/features/collection/components/import-view.tsx: removed ...
apps/web/src/features/collection/components/journey-stage-selector.tsx: removed ...
apps/web/src/features/collection/components/mapping-table.tsx: removed ...
apps/web/src/features/collection/components/metadata-map-panel.tsx: removed ...
apps/web/src/features/collection/components/summary-metric.tsx: removed ...
apps/web/src/features/collection/components/summary-pill.tsx: removed ...
apps/web/src/features/collection/components/toggle-row.tsx: removed ...

original lines 2942, lost 0, added 0
```

- [ ] **Step 3: Format, fix the one import the trimmer cannot see, check**

`trim-imports.mjs` keeps `Save` in the screen's icon import because the word occurs in JSX text (`Save form draft?`); the import is deleted by hand with a replacement that must match once:

```bash
C=apps/web/src/features/collection
git add -N $C
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
sed -i "s/^import { Loader2, Save } from 'lucide-react'/import { Loader2 } from 'lucide-react'/" $C/collection-workspace.tsx
grep -c "from 'lucide-react'" $C/collection-workspace.tsx
pnpm exec biome check . 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
git checkout -- apps/web/next-env.d.ts
wc -l $C/collection-workspace.tsx $C/collection.utils.ts $C/components/*.tsx | tail -18
head -3 $C/components/summary-pill.tsx $C/collection.utils.ts
```

Expected: Biome reflowing all 16 files (`Checked 16 files`: the 14 views, the utils and the screen), one lucide import line left, the repository clean, no type error, the two baseline `--noUnusedLocals` lines (`indicators` now on line 290 of the screen), the line counts (the screen at 1788, the largest view `BuilderView` at 248, none above 248), and `'use client'` on the components but not on the utils:

```
Checked 16 files in <ms>. Fixed 16 files.
1
Checked 1398 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(290,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
  1788 apps/web/src/features/collection/collection-workspace.tsx
    87 apps/web/src/features/collection/collection.utils.ts
   248 apps/web/src/features/collection/components/builder-view.tsx
    61 apps/web/src/features/collection/components/data-preview.tsx
   195 apps/web/src/features/collection/components/field-editor.tsx
   121 apps/web/src/features/collection/components/form-info-panel.tsx
    26 apps/web/src/features/collection/components/form-preview-panel.tsx
   122 apps/web/src/features/collection/components/forms-generator-view.tsx
    55 apps/web/src/features/collection/components/import-validation-panel.tsx
   233 apps/web/src/features/collection/components/import-view.tsx
    75 apps/web/src/features/collection/components/journey-stage-selector.tsx
   185 apps/web/src/features/collection/components/mapping-table.tsx
    56 apps/web/src/features/collection/components/metadata-map-panel.tsx
     8 apps/web/src/features/collection/components/summary-metric.tsx
    28 apps/web/src/features/collection/components/summary-pill.tsx
    21 apps/web/src/features/collection/components/toggle-row.tsx
  3309 total
==> apps/web/src/features/collection/components/summary-pill.tsx <==
'use client'

import { cn } from '@/lib/utils'

==> apps/web/src/features/collection/collection.utils.ts <==
import type { MappingStatus } from './collection-import-state'
import type { BuilderFieldType, BuilderFormField } from './digital-form-contract'
```

```bash
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
```

Expected: the collection folder unchanged, 23 files and 179 tests:

```
 Test Files  23 passed (23)
      Tests  179 passed (179)
```

- [ ] **Step 4: Commit**

```bash
pnpm lint 2>&1 | tail -1
git add -A apps
git commit -q -m "refactor(web): move the collection screen views and shared types into their own files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
git status --short | wc -l
```

Expected: lint clean, a commit of 16 files and a clean tree:

```
Checked 1398 files in <ms>. No fixes applied.
 16 files changed, <n> insertions(+), <m> deletions(-)
0
```

---

### Task 6: Two hooks out of the collection screen

**Files:**
- Create: `apps/web/src/features/collection/hooks/use-form-fields.ts`, `use-server-processing.ts`, `use-form-fields.test.tsx`
- Modify: `features/collection/collection-workspace.tsx` (1788 to 1640 lines)
- Create (gitignored): `.tmp/s5b/hooks-cut.json`, `.tmp/s5b/edit-collection-hooks.mjs`

`OwnedCollectionWorkspace` keeps 33 `useState` calls (37 before) and its operation guard (`mounted`, `intent`, `mutation`, `current`, `eligible`, `beginOperation`) after this task, because almost every handler reads the guard and the `current` snapshot (ruling 9). Two groups have a clean edge: the field list with its selection, pending delete and five edits, and the server processing run with its continue, resume and stop functions. Both move verbatim by line range into hooks that receive what they read.

- [ ] **Step 1: Write the cut plan and the edit script**

`.tmp/s5b/hooks-cut.json` builds the two hook files from line ranges of the screen (747 to 830 for the five field edits, 351 to 358 and 1020 to 1093 for the processing state and functions) with literal wrapper lines: the imports, the `OperationGuard` interface, the hook signatures with their `useState` lines, and the returned members:

Create `.tmp/s5b/hooks-cut.json`:

```json
{
 "source": "apps/web/src/features/collection/collection-workspace.tsx",
 "hash": "72cbb2f3",
 "files": {
  "apps/web/src/features/collection/hooks/use-form-fields.ts": [
   "import { type MutableRefObject, useState } from 'react'",
   "import { toast } from 'sonner'",
   "",
   "import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'",
   "",
   "import type { FormField } from '../collection.utils'",
   "",
   "// The refs the collection screen shares with the hooks that edit its form.",
   "export interface OperationGuard {",
   "  mutation: MutableRefObject<object | null>",
   "  intent: MutableRefObject<number>",
   "  mounted: MutableRefObject<boolean>",
   "  isCurrentOwner: () => boolean",
   "}",
   "",
   "// Holds the form fields being built and the edits that add, move, change and delete them.",
   "export function useFormFields(",
   "  initial: FormField[],",
   "  { mutation, intent, mounted, isCurrentOwner }: OperationGuard,",
   ") {",
   "  const [fields, setFields] = useState<FormField[]>(initial)",
   "  const [selectedFieldId, setSelectedFieldId] = useState(initial[0]?.id ?? '')",
   "  const [pendingDeleteField, setPendingDeleteField] = useState<FormField | null>(null)",
   "",
   [
    747,
    830
   ],
   "",
   "  return {",
   "    fields,",
   "    setFields,",
   "    selectedFieldId,",
   "    setSelectedFieldId,",
   "    pendingDeleteField,",
   "    setPendingDeleteField,",
   "    updateField,",
   "    addField,",
   "    requestDeleteField,",
   "    confirmDeleteField,",
   "    moveField,",
   "  }",
   "}"
  ],
  "apps/web/src/features/collection/hooks/use-server-processing.ts": [
   "import { useState } from 'react'",
   "",
   "import { importsClient } from '@/lib/api/imports'",
   "import type { principalHasAtomicPermission } from '@/lib/rbac/policy'",
   "",
   "import {",
   "  type ImportProcessingOutcome,",
   "  type ImportProcessingProgress,",
   "  importProcessingProgress,",
   "  runImportProcessing,",
   "} from '../import-auto-continue'",
   "import type { ImportProcessingState } from '../import-processing-panel'",
   "import type { useImportBatch } from './use-import-batch'",
   "",
   "type Ticket = {",
   "  valid: (permission?: Parameters<typeof principalHasAtomicPermission>[1]) => boolean",
   "  finish: () => void",
   "}",
   "",
   "// Runs the repeated server process calls of one confirmed import and keeps its progress, stop and resume.",
   "export function useServerProcessing({",
   "  projectId,",
   "  beginOperation,",
   "  importBatch,",
   "  setSavedNotice,",
   "  setProceedDialogOpen,",
   "  setImportMessage,",
   "}: {",
   "  projectId: string",
   "  beginOperation: (permission: Parameters<typeof principalHasAtomicPermission>[1]) => Ticket | null",
   "  importBatch: ReturnType<typeof useImportBatch>",
   "  setSavedNotice: (notice: string) => void",
   "  setProceedDialogOpen: (open: boolean) => void",
   "  setImportMessage: (message: string) => void",
   "}) {",
   [
    351,
    358
   ],
   "",
   [
    1020,
    1093
   ],
   "",
   "  return {",
   "    processingRun,",
   "    setProcessingRun,",
   "    continueServerProcessing,",
   "    resumeServerProcessing,",
   "    stopServerProcessing,",
   "  }",
   "}"
  ]
 }
}
```

`.tmp/s5b/edit-collection-hooks.mjs` checks the lines it removes, replaces the field edits and the processing code with the two hook calls, deletes the four moved `useState` lines and adds the two setters to the dependency list of the initial-form effect:

Create `.tmp/s5b/edit-collection-hooks.mjs`:

```js
// Replaces the field edit and server processing code of collection-workspace.tsx with calls to the two new hooks, checking every line it removes.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/features/collection/collection-workspace.tsx'
const lines = readFileSync(file, 'utf8').split('\n')
const at = (n) => lines[n - 1]
const expect = (n, text) => {
  if (!at(n).includes(text)) throw new Error(`line ${n}: expected ${text}, found ${at(n)}`)
}
expect(307, 'const [fields, setFields]')
expect(308, 'const [selectedFieldId')
expect(312, 'const [pendingDeleteField')
expect(332, 'useRef<object | null>')
expect(351, 'const [processingRun')
expect(358, 'null)')
expect(747, 'const updateField')
expect(831, '')
expect(1018, 'type OperationTicket')
expect(1093, '  }')
expect(1094, '')

const processing = `  const {
    processingRun,
    setProcessingRun,
    continueServerProcessing,
    resumeServerProcessing,
    stopServerProcessing,
  } = useServerProcessing({
    projectId,
    beginOperation,
    importBatch,
    setSavedNotice,
    setProceedDialogOpen,
    setImportMessage,
  })
`.split('\n')
const fieldEdits = `  const {
    fields,
    setFields,
    selectedFieldId,
    setSelectedFieldId,
    pendingDeleteField,
    setPendingDeleteField,
    updateField,
    addField,
    requestDeleteField,
    confirmDeleteField,
    moveField,
  } = useFormFields(initialFields, { mutation, intent, mounted, isCurrentOwner })`.split('\n')

// Bottom to top, so the line numbers above stay valid.
lines.splice(1017, 77, ...processing)
lines.splice(746, 85)
lines.splice(350, 8)
lines.splice(332, 0, ...fieldEdits)
lines.splice(311, 1)
lines.splice(306, 2)
const joined = lines
  .join('\n')
  .replace('  }, [initialFormId, forms])', '  }, [initialFormId, forms, setFields, setSelectedFieldId])')
  .replace(
    "import { useImportBatch } from './hooks/use-import-batch'\n",
    "import { useFormFields } from './hooks/use-form-fields'\nimport { useImportBatch } from './hooks/use-import-batch'\nimport { useServerProcessing } from './hooks/use-server-processing'\n",
  )
writeFileSync(file, joined)
console.log('replaced fields, processing and their state with two hook calls')
```

- [ ] **Step 2: Cut, wire, prove, format**

```bash
C=apps/web/src/features/collection
git show HEAD:$C/collection-workspace.tsx > .tmp/s5b/files/collection-workspace.before-hooks.tsx
node .tmp/s5b/cut.mjs .tmp/s5b/hooks-cut.json
sed -i 's/ticket: OperationTicket,/ticket: Ticket,/' $C/hooks/use-server-processing.ts
node .tmp/s5b/edit-collection-hooks.mjs
node .tmp/s5b/trim-imports.mjs $C/collection-workspace.tsx $C/hooks/use-form-fields.ts $C/hooks/use-server-processing.ts | sed 's/removed .*/removed .../'
node .tmp/s5b/same-lines.mjs .tmp/s5b/files/collection-workspace.before-hooks.tsx $C/collection-workspace.tsx $C/hooks/use-form-fields.ts $C/hooks/use-server-processing.ts
git add -N $C/hooks
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm exec biome check . 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
git checkout -- apps/web/next-env.d.ts
wc -l $C/collection-workspace.tsx $C/hooks/use-form-fields.ts $C/hooks/use-server-processing.ts
```

Expected: the two hook files written (123 and 127 lines), the edit script's confirmation, the trimmed imports, and the line proof over 1644 lines with `lost 5` and `added 85` (the wrapper, parameter and return lines of the two hooks and the two hook calls). The five lost lines are the two `useState` initializers (now taking `initial`), the dependency list gaining two setters, the `OperationTicket` type and the `ticket: OperationTicket` parameter (replaced by `Ticket`); these are the only edited lines of moved code (ruling 9). Biome and `tsc` are clean, `--noUnusedLocals` lists the two baseline lines (`indicators` on line 287), and the screen is 1640 lines:

```
apps/web/src/features/collection/hooks/use-form-fields.ts: 123 lines
apps/web/src/features/collection/hooks/use-server-processing.ts: 127 lines
replaced fields, processing and their state with two hook calls
apps/web/src/features/collection/collection-workspace.tsx: removed ...
apps/web/src/features/collection/hooks/use-form-fields.ts: removed ...
apps/web/src/features/collection/hooks/use-server-processing.ts: removed ...
lost lines:
const [fields, setFields] = useState<FormField[]>(initialFields) (1 -> 0)
const [selectedFieldId, setSelectedFieldId] = useState(initialFields[0]?.id ?? '') (1 -> 0)
}, [initialFormId, forms]) (1 -> 0)
type OperationTicket = NonNullable<ReturnType<typeof beginOperation>> (1 -> 0)
ticket: OperationTicket, (1 -> 0)
original lines 1644, lost 5, added 85
Checked 3 files in <ms>. No fixes applied.
Checked 1400 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 1640 apps/web/src/features/collection/collection-workspace.tsx
  123 apps/web/src/features/collection/hooks/use-form-fields.ts
  127 apps/web/src/features/collection/hooks/use-server-processing.ts
 1890 total
```

If Biome reports `useExhaustiveDependencies` for a setter, the dependency edit of the script did not apply; stop and report NEEDS_CONTEXT.

- [ ] **Step 3: Run the collection tests and break the processing hook**

```bash
C=apps/web/src/features/collection
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+|^ FAIL "
cp $C/hooks/use-server-processing.ts .tmp/s5b/files/use-server-processing.bak
sed -i "s/state: outcome.kind === 'stopped' ? 'stopped' : 'failed',/state: 'failed',/" $C/hooks/use-server-processing.ts
diff .tmp/s5b/files/use-server-processing.bak $C/hooks/use-server-processing.ts | grep -c '^>'
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "×|Tests +[0-9]+" | cut -c1-170
cp .tmp/s5b/files/use-server-processing.bak $C/hooks/use-server-processing.ts
```

Expected: 23 files and 179 tests pass; with one line changed (`1`) so that a stopped run reported as failed, the stop and resume row of Task 4 fails (one failure), and the file is restored:

```
 Test Files  23 passed (23)
      Tests  179 passed (179)
1
   × collection operation ownership > stops after the in-flight processing call and resumes from the same batch <ms>
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 178 passed (179)
```

- [ ] **Step 4: Commit the move**

```bash
pnpm lint 2>&1 | tail -1
git add apps/web/src/features/collection/collection-workspace.tsx apps/web/src/features/collection/hooks/use-form-fields.ts apps/web/src/features/collection/hooks/use-server-processing.ts
git commit -q -m "refactor(web): move the form field edits and the server processing run out of the collection screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
```

Expected: lint clean and a commit of 3 files:

```
Checked 1400 files in <ms>. No fixes applied.
 3 files changed, <n> insertions(+), <m> deletions(-)
```

- [ ] **Step 5: Pin the field edits**

The field edits had no test (ruling 10), so the hook gets one now: initial selection, add, patch, move with its two ends, delete with its confirmation and neighbour selection, the focus guard for a stale or unmounted owner, and the ignored edits while an operation holds the form:

Create `apps/web/src/features/collection/hooks/use-form-fields.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FormField } from '../collection.utils'
import { type OperationGuard, useFormFields } from './use-form-fields'

const toasts = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

const field = (id: string): FormField => ({
  id,
  label: `Field ${id}`,
  code: id,
  type: 'text',
  required: false,
  metadataKey: false,
  sadddField: false,
  allowedValues: [],
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
})
const initial = [field('a'), field('b'), field('c')]
const guard = (): OperationGuard => ({
  mutation: { current: null },
  intent: { current: 0 },
  mounted: { current: true },
  isCurrentOwner: () => true,
})
const ids = (fields: FormField[]) => fields.map((item) => item.id)

describe('useFormFields', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts on the first field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    expect(result.current.selectedFieldId).toBe('a')
    expect(result.current.pendingDeleteField).toBeNull()
  })

  it('adds a numbered unmapped field, selects it and counts the edit', () => {
    const operation = guard()
    const { result } = renderHook(() => useFormFields(initial, operation))
    act(() => result.current.addField())
    const added = result.current.fields[3]
    expect(added).toMatchObject({
      label: 'New field 4',
      code: 'new_field_4',
      type: 'text',
      mappingStatus: 'unmapped',
    })
    expect(result.current.selectedFieldId).toBe(added.id)
    expect(operation.intent.current).toBe(1)
  })

  it('patches only the named field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.updateField('b', { label: 'Renamed', required: true }))
    expect(result.current.fields.map((item) => item.label)).toEqual([
      'Field a',
      'Renamed',
      'Field c',
    ])
    expect(result.current.fields[1].required).toBe(true)
    expect(result.current.fields[0].required).toBe(false)
  })

  it('moves a field up or down and ignores a move past either end', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.moveField('b', 'up'))
    expect(ids(result.current.fields)).toEqual(['b', 'a', 'c'])
    act(() => result.current.moveField('b', 'up'))
    expect(ids(result.current.fields)).toEqual(['b', 'a', 'c'])
    act(() => result.current.moveField('b', 'down'))
    act(() => result.current.moveField('b', 'down'))
    act(() => result.current.moveField('b', 'down'))
    expect(ids(result.current.fields)).toEqual(['a', 'c', 'b'])
    act(() => result.current.moveField('missing', 'down'))
    expect(ids(result.current.fields)).toEqual(['a', 'c', 'b'])
  })

  it('asks before deleting, then removes the field and selects its neighbour', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.setSelectedFieldId('b'))
    act(() => result.current.requestDeleteField('b'))
    expect(result.current.pendingDeleteField?.id).toBe('b')
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    act(() => result.current.confirmDeleteField())
    expect(ids(result.current.fields)).toEqual(['a', 'c'])
    expect(result.current.selectedFieldId).toBe('c')
    expect(result.current.pendingDeleteField).toBeNull()
    expect(toasts.success).toHaveBeenCalledWith('Field b deleted from this form.')
  })

  it('keeps the selection when another field is deleted and falls back to the last field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.requestDeleteField('c'))
    act(() => result.current.confirmDeleteField())
    expect(result.current.selectedFieldId).toBe('a')
    act(() => result.current.setSelectedFieldId('b'))
    act(() => result.current.requestDeleteField('b'))
    act(() => result.current.confirmDeleteField())
    expect(ids(result.current.fields)).toEqual(['a'])
    expect(result.current.selectedFieldId).toBe('a')
  })

  it.each(['current', 'unmounted', 'replaced'] as const)(
    'focuses the next field choice after a delete only while the owner is current (%s)',
    (owner) => {
      vi.useFakeTimers()
      const target = document.createElement('button')
      target.id = 'collection-field-choice-c'
      document.body.append(target)
      const owned = { current: true }
      const operation = { ...guard(), isCurrentOwner: () => owned.current }
      const { result } = renderHook(() => useFormFields(initial, operation))
      act(() => result.current.setSelectedFieldId('b'))
      act(() => result.current.requestDeleteField('b'))
      act(() => result.current.confirmDeleteField())
      if (owner === 'unmounted') operation.mounted.current = false
      if (owner === 'replaced') owned.current = false
      act(() => {
        vi.runAllTimers()
      })
      expect(document.activeElement === target).toBe(owner === 'current')
      vi.useRealTimers()
      target.remove()
    },
  )

  it('ignores every edit while an operation holds the form', () => {
    const operation = guard()
    operation.mutation.current = {}
    const { result } = renderHook(() => useFormFields(initial, operation))
    act(() => {
      result.current.addField()
      result.current.updateField('a', { label: 'x' })
      result.current.moveField('a', 'down')
      result.current.requestDeleteField('a')
      result.current.confirmDeleteField()
    })
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    expect(result.current.fields[0].label).toBe('Field a')
    expect(result.current.pendingDeleteField).toBeNull()
    expect(operation.intent.current).toBe(0)
  })
})
```

```bash
H=apps/web/src/features/collection/hooks/use-form-fields.ts
T=apps/web/src/features/collection/hooks/use-form-fields.test.tsx
V=src/features/collection/hooks/use-form-fields.test.tsx
pnpm exec biome check --write $T 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run $V 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
cp $H .tmp/s5b/files/use-form-fields.bak
for m in "s/direction === 'up' ? currentIndex - 1/direction === 'up' ? currentIndex + 1/" "s/setSelectedFieldId(field.id)/setSelectedFieldId('')/" "s/deleted from this form\./removed./" "s/Math.min(deletedIndex, nextFields.length - 1)/deletedIndex/" "s/!isCurrentOwner() || !mounted.current ||/!isCurrentOwner() ||/" "s/if (!isCurrentOwner() || /if (/"; do
  cp .tmp/s5b/files/use-form-fields.bak $H
  sed -i "$m" $H
  echo "mutation: $m"
  pnpm --filter @pathways/web exec vitest run $V 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
done
cp .tmp/s5b/files/use-form-fields.bak $H
perl -0pi -e 's/    if \(mutation\.current\) return\n    intent\.current\+\+\n    if \(!pendingDeleteField\) \{/    intent.current++\n    if (!pendingDeleteField) {/' $H
echo "mutation: confirm guard"
pnpm --filter @pathways/web exec vitest run $V 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
cp .tmp/s5b/files/use-form-fields.bak $H
git status --short
```

Expected: 10 rows pass, then each of the seven mutations (the move direction, the selection after add, the delete text, the neighbour selection, the mounted check, the owner check and the confirm guard) fails exactly one row, and after the restore only the test file is untracked:

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  10 passed (10)
mutation: s/direction === 'up' ? currentIndex - 1/direction === 'up' ? currentIndex + 1/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: s/setSelectedFieldId(field.id)/setSelectedFieldId('')/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: s/deleted from this form\./removed./
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: s/Math.min(deletedIndex, nextFields.length - 1)/deletedIndex/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: s/!isCurrentOwner() || !mounted.current ||/!isCurrentOwner() ||/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: s/if (!isCurrentOwner() || /if (/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
mutation: confirm guard
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
?? apps/web/src/features/collection/hooks/use-form-fields.test.tsx
```

```bash
pnpm lint 2>&1 | tail -1
git add apps/web/src/features/collection/hooks/use-form-fields.test.tsx
git commit -q -m "test(web): pin the form field edits behind the collection screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
```

Expected: lint clean and a commit of the test file:

```
Checked 1401 files in <ms>. No fixes applied.
 1 file changed, <n> insertions(+)
```

---

### Task 7: Split the collection screen test by concern

**Files:**
- Delete: `apps/web/src/features/collection/collection-workspace.test.tsx` (1672 lines, 50 results)
- Create: `collection-workspace.{import-preview,import-upload,forms,access,ownership}.test.tsx`
- Create (gitignored): `.tmp/s5b/test-names.mjs`, `.tmp/s5b/test-split-cut.json`

The old file holds nine `describe` blocks. One of them, `collection import workspace`, holds 14 rows of four concerns, so it is cut by row (ruling 11): the preview and file reading rows, the upload and identity rows, the form definition rows and the project selection rows each keep the describe name in their own file. The header (lines 1 to 140) is copied into each file, and `processedBatch`, `renderImportWorkspace`, `csvFile`, `deferred` and `ownedDataset` are copied only into the files that use them.

- [ ] **Step 1: Write the name lister and the cut plan**

`.tmp/s5b/test-names.mjs` prints the sorted full names of a Vitest JSON report, so the 50 names can be compared before and after:

Create `.tmp/s5b/test-names.mjs`:

```js
// Prints the sorted full names of the tests in a Vitest JSON report, one per line.
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const names = report.testResults.flatMap((file) => file.assertionResults.map((test) => test.fullName))
console.log(names.sort().join('\n'))
```

`.tmp/s5b/test-split-cut.json` lists, for each new file, the header range, the helper ranges it needs and the row ranges of the old file (the `describe` wrapper lines are literal):

Create `.tmp/s5b/test-split-cut.json`:

```json
{
 "source": "apps/web/src/features/collection/collection-workspace.test.tsx",
 "hash": "9d5a1819",
 "files": {
  "apps/web/src/features/collection/collection-workspace.import-preview.test.tsx": [
   [
    1,
    140
   ],
   "",
   [
    147,
    152
   ],
   "",
   [
    154,
    158
   ],
   "",
   "describe('collection import workspace', () => {",
   [
    161,
    168
   ],
   "",
   [
    288,
    332
   ],
   "",
   [
    334,
    396
   ],
   "",
   [
    687,
    738
   ],
   "",
   [
    740,
    799
   ],
   "})"
  ],
  "apps/web/src/features/collection/collection-workspace.import-upload.test.tsx": [
   [
    1,
    140
   ],
   "",
   [
    141,
    145
   ],
   "",
   [
    154,
    158
   ],
   "",
   [
    1091,
    1099
   ],
   "",
   [
    1100,
    1157
   ],
   "",
   "describe('collection import workspace', () => {",
   [
    206,
    286
   ],
   "",
   [
    398,
    479
   ],
   "",
   [
    481,
    544
   ],
   "})",
   "",
   [
    1551,
    1601
   ],
   "",
   [
    1603,
    1672
   ]
  ],
  "apps/web/src/features/collection/collection-workspace.forms.test.tsx": [
   [
    1,
    140
   ],
   "",
   [
    147,
    152
   ],
   "",
   [
    154,
    158
   ],
   "",
   "describe('collection import workspace', () => {",
   [
    170,
    204
   ],
   "",
   [
    546,
    639
   ],
   "",
   [
    641,
    685
   ],
   "})",
   "",
   [
    895,
    940
   ],
   "",
   [
    942,
    1031
   ],
   "",
   [
    1481,
    1549
   ]
  ],
  "apps/web/src/features/collection/collection-workspace.access.test.tsx": [
   [
    1,
    140
   ],
   "",
   "describe('collection import workspace', () => {",
   [
    801,
    827
   ],
   "",
   [
    829,
    862
   ],
   "",
   [
    864,
    892
   ],
   "})",
   "",
   [
    1033,
    1089
   ]
  ],
  "apps/web/src/features/collection/collection-workspace.ownership.test.tsx": [
   [
    1,
    140
   ],
   "",
   [
    141,
    145
   ],
   "",
   [
    147,
    152
   ],
   "",
   [
    154,
    158
   ],
   "",
   [
    1091,
    1099
   ],
   "",
   [
    1100,
    1157
   ],
   "",
   [
    1158,
    1383
   ],
   "",
   [
    1385,
    1479
   ]
  ]
 }
}
```

- [ ] **Step 2: Record the names, cut, format and compare**

```bash
C=apps/web/src/features/collection
git hash-object $C/collection-workspace.test.tsx | cut -c1-8
pnpm --filter @pathways/web exec vitest run src/features/collection/collection-workspace.test.tsx --reporter=json --outputFile="$PWD/.tmp/s5b/files/before.json" > /dev/null 2>&1
node .tmp/s5b/test-names.mjs .tmp/s5b/files/before.json > .tmp/s5b/files/before-names.txt
wc -l < .tmp/s5b/files/before-names.txt
cp $C/collection-workspace.test.tsx .tmp/s5b/files/collection-workspace.before.test.tsx
node .tmp/s5b/cut.mjs .tmp/s5b/test-split-cut.json
git rm -q $C/collection-workspace.test.tsx
node .tmp/s5b/trim-imports.mjs $C/collection-workspace.{import-preview,import-upload,forms,access,ownership}.test.tsx
git add -N $C
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm exec biome check . 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | head -5
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
git checkout -- apps/web/next-env.d.ts
node .tmp/s5b/count-it.mjs .tmp/s5b/files/collection-workspace.before.test.tsx | tail -1
node .tmp/s5b/count-it.mjs $C/collection-workspace.{import-preview,import-upload,forms,access,ownership}.test.tsx
```

Expected: the hash prefix of the old test, its 50 results, five files written (388, 576, 540, 293 and 551 lines before Biome reflows; the largest new file is about 580 lines because each carries the 140 line header), the one import `trim-imports` drops (`fireEvent` in the access file), Biome, `tsc` and `--noUnusedLocals` as at the baseline, and the counts, the old file first (`it 35, describe 9, expect 194`) and then each new file with a total (`it 35, describe 12, expect 195`): 35 rows before and 35 after (5, 6, 10, 5, 9), 9 groups before and 12 after (the repeated name), 194 assertions before and 195 after (the `ownedDataset` helper, which holds one, is copied into two files):

```
9d5a1819
50
apps/web/src/features/collection/collection-workspace.import-preview.test.tsx: 388 lines
apps/web/src/features/collection/collection-workspace.import-upload.test.tsx: 576 lines
apps/web/src/features/collection/collection-workspace.forms.test.tsx: 540 lines
apps/web/src/features/collection/collection-workspace.access.test.tsx: 293 lines
apps/web/src/features/collection/collection-workspace.ownership.test.tsx: 551 lines
apps/web/src/features/collection/collection-workspace.import-preview.test.tsx: removed nothing
apps/web/src/features/collection/collection-workspace.import-upload.test.tsx: removed nothing
apps/web/src/features/collection/collection-workspace.forms.test.tsx: removed nothing
apps/web/src/features/collection/collection-workspace.access.test.tsx: removed fireEvent
apps/web/src/features/collection/collection-workspace.ownership.test.tsx: removed nothing
Checked 5 files in <ms>. Fixed 5 files.
Checked 1405 files in <ms>. No fixes applied.
src/features/collection/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
total: it 35, describe 9, expect 194
apps/web/src/features/collection/collection-workspace.import-preview.test.tsx: it 5, describe 1, expect 53
apps/web/src/features/collection/collection-workspace.import-upload.test.tsx: it 6, describe 3, expect 36
apps/web/src/features/collection/collection-workspace.forms.test.tsx: it 10, describe 4, expect 48
apps/web/src/features/collection/collection-workspace.access.test.tsx: it 5, describe 2, expect 21
apps/web/src/features/collection/collection-workspace.ownership.test.tsx: it 9, describe 2, expect 37
total: it 35, describe 12, expect 195
```

```bash
C=apps/web/src/features/collection
V=src/features/collection/collection-workspace
pnpm --filter @pathways/web exec vitest run $V.import-preview.test.tsx $V.import-upload.test.tsx $V.forms.test.tsx $V.access.test.tsx $V.ownership.test.tsx --reporter=json --outputFile="$PWD/.tmp/s5b/files/after.json" > /dev/null 2>&1
node .tmp/s5b/test-names.mjs .tmp/s5b/files/after.json > .tmp/s5b/files/after-names.txt
wc -l < .tmp/s5b/files/after-names.txt
diff .tmp/s5b/files/before-names.txt .tmp/s5b/files/after-names.txt && echo "same 50 names"
pnpm --filter @pathways/web test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
```

Expected: 50 results in the new files, an empty diff of the two name lists, and the web suite at `B_web` plus 9 files and 38 rows: 241 files and 2053 tests (the split adds four files, Task 3 two, Task 4 two, Task 6 one; the rows are Task 3's 15, Task 4's 13 and Task 6's 10):

```
50
same 50 names
 Test Files  241 passed (241)
      Tests  2053 passed (2053)
```

- [ ] **Step 3: Commit**

```bash
pnpm lint 2>&1 | tail -1
git add -A apps
git commit -q -m "test(web): split the collection screen tests by concern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
git status --short | wc -l
```

Expected: lint clean, a commit of 6 files and a clean tree:

```
Checked 1405 files in <ms>. No fixes applied.
 6 files changed, <n> insertions(+), <m> deletions(-)
0
```

---

### Task 8: Records

**Files:**
- Create (gitignored): `.tmp/s5b/task8-edits.json`, `.tmp/s5b/index-row.mjs`, `.tmp/s5b/activity-s5b.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06 and MOD-07 rows), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 13). MOD-15 and MOD-16 name the collection screens too, but their collection work (the feature layout, the public `index.ts`, the shared helpers) is S5c, so their rows stay as they are.

- [ ] **Step 1: Build for the route record**

The records quote the route comparison, so the last code tree is built and compared with the Task 0 build first:

```bash
.tmp/s5b/build-routes.sh final
git checkout -- apps/web/next-env.d.ts
node .tmp/s5b/compare-routes.mjs .tmp/s5b/routes-baseline.txt .tmp/s5b/routes-final.txt | tail -6
```

Expected: a build that exits 0 with Middleware at `M0`, then the last routes that differ from the Task 0 build (none may be bigger; the script prints all 10, the command keeps the last six lines) and the totals:

```
exit 0
ƒ Middleware                                                      103 kB
/collection/projects/[projectId]/forms/[formId]: 430 kB -> 426 kB (-4.0)
/collection/projects/[projectId]/forms/[formId]/entries/new: 271 kB -> 263 kB (-8.0)
/projects/[projectId]: 311 kB -> 310 kB (-1.0)
/projects/[projectId]/activities/[activityId]: 339 kB -> 338 kB (-1.0)
/settings/users: 287 kB -> 286 kB (-1.0)
routes 72, different 10
```

- [ ] **Step 2: Amend the change record, the audit and the index**

Create each file with the Write tool, exactly as printed. `.tmp/s5b/task8-edits.json` holds the exact replacements: the hook rule appended to the layout paragraph of section 3.3, the S5b applied paragraph that replaces the "Deferred to S5b" sentence of section 9 (and keeps "Deferred to W1"), and the three audit row endings. `@DATE@` is replaced by the day Task 8 runs, and `@M0@` by the Middleware size of the Task 0 build:

Create `.tmp/s5b/task8-edits.json`:

```json
[
  [
    "docs/cr-pathways-codebase-modularization.md",
    "and share their fixtures through `test/fixtures/<name>-fixtures.ts` (amended 2026-10-13 for S4c).",
    "and share their fixtures through `test/fixtures/<name>-fixtures.ts` (amended 2026-10-13 for S4c). A hook that several screens share holds only what they do identically, as `useImportBatch` holds the upload identity, the automatic mapping call and the stop flag of the two import screens; a hook cut out of a screen receives the refs and callbacks it reads as parameters, not through a context (amended @DATE@ for S5b).",
    1
  ],
  [
    "docs/cr-pathways-codebase-modularization.md",
    "Deferred to S5b: `lib/api` collection clients for the 22 metadata and import methods of `pathways-client.ts` (with `validateImport` typed from `ValidateImportRequest`, the F3b deferral), one `use-import-batch` hook for the two web import flows, the split of `collection-workspace.tsx`, `import-workspace.tsx` and `direct-form-entry-workspace.tsx`, the `features/collection` layout and public `index.ts`, and the web form type copies (`form-builder-session-draft.ts`, `types/pathways.ts` `DigitalFormType`). ",
    "S5b applied @DATE@ on the S5b slice branch:\n- Contracts: `import-responses.ts` and `form-responses.ts` in `packages/shared` hold the batch, batch detail, mapping, source column, row and row page responses and the form field, form, submission, submission summary and submission page responses as zod schemas used only as types (nothing parses a response); six api mapper functions got return types, so `pnpm typecheck` catches drift between the api and the web, and the JSON columns Prisma types as `JsonValue` got type-only casts.\n- Clients: the 22 form, direct entry and import methods left `pathways-client.ts` (716 to 424 lines) for `formsClient` (13 methods) and `importsClient` (9) in `lib/api`, written by a generator from the old method bodies, with `validateImport` typed from `ValidateImportRequest` (the F3b deferral) and `satisfies` checks on the other request bodies; the automatic mapping receipt parser moved to `imports.schema.ts`; 45 calls in 7 files and 12 test mock factories moved with them, and five web types became aliases of the response types.\n- Proof: every line of the 22 methods and of the receipt parser sits in the new files (`lost 0`); two tests ran each case against the old and the new client (30 results, exact path, method and body) before the old methods were removed and became 15 plain rows; one mutation per file failed them.\n- Hook: `useImportBatch` holds the three things the two import screens do the same way, the upload identity, the automatic mapping call for a freshly stored batch and the stop flag; the two process loops stay per screen, because they keep different state. The import screen's `resume` and the collection dialog's stop and resume had no test, so four rows were added and mutated before the hook replaced three copies of the condition and two identity refs.\n- Collection screen: 14 views moved verbatim to `features/collection/components` and 14 shared declarations to `collection.utils.ts`, then `useFormFields` and `useServerProcessing`, and the screen went from 3186 lines to 1640; `use-form-fields.test.tsx` (10 rows) pins the field edits and seven mutations failed it; the 1672 line `collection-workspace.test.tsx` split into five files with the 50 full test names identical.\n- Counts: web went from 232 files and 2015 tests to 241 and 2053; shared gained 2 test files and 7 tests; config, imports, api and sad counts did not change.\n- Routes: Middleware stayed at @M0@ in the cloud container and 10 of 72 routes got smaller (the direct entry route by 8 kB, four collection routes by 4 kB, `/collection/import` by 3 kB and four other routes by 1 kB); none grew.\n- Decisions: S5 split again into S5b and S5c (ruling 1); the response contracts are types only (ruling 2); `useImportBatch` shares less than the outline expected because neither screen uses `captureRequestOwner` (ruling 7); the hooks take their guard as parameters and the form list, parse, save and publish handlers stay in the screen until a guard hook exists (ruling 9); `collection-workspace.tsx` (1640 lines) stays above the 500 line flag and is named in S5c; there is no pull request for the slice (ruling 14).\n\nDeferred to S5c: the splits of `import-workspace.tsx` (1110 lines) and `direct-form-entry-workspace.tsx` (654), the guard hook and the remaining handlers of `collection-workspace.tsx`, the `features/collection` layout, `collection.copy.ts`, public `index.ts` and surface rule, the web form type copies (`form-builder-session-draft.ts`, `types/pathways.ts` `DigitalFormType`) and the S5 closing records. ",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "beneficiary, journey and media clients by S4b. |",
    "beneficiary, journey and media clients by S4b; forms and imports clients by S5b. |",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "beneficiary components laid out by S4b and split by S4c. |",
    "beneficiary components laid out by S4b and split by S4c; collection views, two hooks and the split test by S5b, the rest of the collection screens by S5c. |",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "One `use-import-batch` hook (S5) |",
    "One `use-import-batch` hook for the upload identity, automatic mapping and stop flag by S5b; the two process loops stay per screen. |",
    1
  ]
]
```

`.tmp/s5b/index-row.mjs` moves S5b from the next list to the applied list of the change record row in `docs/index.md`, whatever other slices sit on the branch:

Create `.tmp/s5b/index-row.mjs`:

```js
// Moves S5b from the next list to the applied list in the change record row of docs/index.md.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'docs/index.md'
const row = /^(\| \[cr-pathways-codebase-modularization\].*\| Approved; )(.*) applied(?:, (.*) next)? \|$/m
const text = readFileSync(file, 'utf8')
const found = row.exec(text)
if (!found) throw new Error('change record row not found')
const items = (list) => (list ? list.split(/, | and /).filter((item) => item) : [])
const join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list.join(''))
const applied = items(found[2])
if (applied.includes('S5b')) throw new Error('S5b is already applied')
applied.splice(applied.indexOf('S5a') + 1, 0, 'S5b')
const next = items(found[3]).filter((item) => item !== 'S5b')
const tail = next.length ? `, ${join(next)} next` : ''
writeFileSync(file, text.replace(row, `$1${join(applied)} applied${tail} |`))
console.log(found[0].slice(-90))
console.log(`${join(applied)} applied${tail}`.slice(-90))
```

```bash
D=$(date +%F)
M0=$(grep Middleware .tmp/s5b/routes-baseline.txt | grep -oE '[0-9]+ kB' | head -1)
sed -i -e "s/@DATE@/$D/g" -e "s/@M0@/$M0/g" .tmp/s5b/task8-edits.json
node .tmp/s5b/replace-exact.mjs .tmp/s5b/task8-edits.json
node .tmp/s5b/index-row.mjs
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{50} \|$"
git diff docs/cr-pathways-codebase-modularization.md | grep -c "^+"
grep -c "Deferred to S5b" docs/cr-pathways-codebase-modularization.md
grep -o "Middleware stayed at.*" docs/cr-pathways-codebase-modularization.md | tail -1 | cut -c1-200
git grep -lE "FormsGeneratorView|BuilderView|FieldEditor|MetadataMapPanel|FormPreviewPanel|MappingTable|DataPreview|ImportValidationPanel|SummaryPill|ToggleRow|JourneyStageSelector|FormInfoPanel|SummaryMetric|pathwaysClient\.(getDigitalForms|getImportBatches|uploadImport|saveDirectSubmission|processImport)" -- docs ':!docs/activity-log.md' ':!docs/superpowers/*' ':!docs/handoff' | wc -l
```

Expected: five replacements in two files, the index row before and after (its last 90 characters; the lists name whatever slices sit on the branch, so only the S5b move must match), three docs files changed, the three audit row endings, the section 9 paragraph added, no "Deferred to S5b" left, the Middleware and route sentence, and `0` living documents (outside the activity log, the plans and the hand-off copies) that name a moved view or a moved client method:

```
5 replacements in 2 files
 F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a and S6a applied, S5b and S6b next |
F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b and S6a applied, S6b next
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 14 ++++++++++++--
 docs/index.md                                       |  2 +-
 3 files changed, <n> insertions(+), <m> deletions(-)
 clients by S4b; forms and imports clients by S5b. |
by S5b, the rest of the collection screens by S5c. |
lag by S5b; the two process loops stay per screen. |
13
0
Middleware stayed at 102 kB in the cloud container and 10 of 72 routes got smaller (the direct entry route by 8 kB, four collection routes by 4 kB, `/collection/import` by 3 kB and four other routes b
0
```

- [ ] **Step 3: Activity log**

`.tmp/s5b/activity-s5b.md` is the S5b section of the activity log, with the commit hashes of Tasks 1 to 7 as `@H1@` to `@H7@` (Tasks 4 and 6 have two commits each, `@H4a@`, `@H4b@`, `@H6a@`, `@H6b@`):

Create `.tmp/s5b/activity-s5b.md`:

```md

## @DATE@ Modularization S5b collection web (claude/modularization-s5b-9ept8o)
- Task 1 (@H1@): `import-responses.ts` and `form-responses.ts` added to `packages/shared` as type-only response contracts with their tests, and return types on six api mapper functions; `pnpm typecheck` passes across the api and the web.
- Task 2 (@H2@): `formsClient` (13 methods), `importsClient` (9) and `imports.schema.ts` generated from the 22 methods of `pathways-client.ts` and the receipt parser (`lost 0`, request type checks stripped); the characterization tests run 30 results against the old and the new client, and one mutation per file failed them.
- Task 3 (@H3@): 45 calls in 7 files and 12 mock factories moved to the new clients, the 22 methods removed (`pathways-client.ts` 716 to 424 lines), five web types aliased to the response types, and the two characterization tests turned into 15 plain rows.
- Task 4 (@H4a@, @H4b@): stored upload recovery and the stop and resume of the processing run got four tests and a mutation each, then `useImportBatch` replaced the upload identity, the automatic mapping call and the stop flag of the two import screens; four tests failed on a mutation of the identity check.
- Task 5 (@H5@): 14 views cut out of `collection-workspace.tsx` into `components/` and 14 shared declarations into `collection.utils.ts` (1788 lines left, `lost 0`).
- Task 6 (@H6a@, @H6b@): `useFormFields` and `useServerProcessing` cut out by line range (1788 to 1640 lines, five edited lines named), then `use-form-fields.test.tsx` (10 rows, seven mutations failed it).
- Task 7 (@H7@): `collection-workspace.test.tsx` (1672 lines) split into five files; the 50 full test names are identical, 35 rows before and after.
- Task 8: the change record (section 3.3 hook rule, section 9 S5b disposition), the audit rows MOD-05, MOD-06 and MOD-07 and the index row follow the slice; no SAD routing change, because `lib/api` already routes to the privacy guardian, the two response contracts to the import validator and `features/collection` to the design QA agent.
- Decisions: the S5b decisions are recorded in the change record section 9; the plan stays in `docs/superpowers/plans` as the record of the slice. Not pinned by a new test: the form list, parse, save and publish handlers of the collection screen, which keep the rows they had.
- Deferred: S5c takes `import-workspace.tsx`, `direct-form-entry-workspace.tsx`, the rest of `collection-workspace.tsx` (1640 lines), the `features/collection` layout and the form type copies.
```

```bash
D=$(date +%F)
h() { git log -1 --format=%h --grep="^$1"; }
H1=$(h 'refactor: add the import and form response contracts')
H2=$(h 'refactor(web): add the forms and imports clients')
H3=$(h 'refactor(web): move the form and import client callers')
H4a=$(h 'test(web): characterize stored upload recovery')
H4b=$(h 'refactor(web): share the upload identity')
H5=$(h 'refactor(web): move the collection screen views')
H6a=$(h 'refactor(web): move the form field edits')
H6b=$(h 'test(web): pin the form field edits')
H7=$(h 'test(web): split the collection screen tests')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4a@/$H4a/" -e "s/@H4b@/$H4b/" -e "s/@H5@/$H5/" -e "s/@H6a@/$H6a/" -e "s/@H6b@/$H6b/" -e "s/@H7@/$H7/" .tmp/s5b/activity-s5b.md
grep -c "@H[0-9a-b]*@\|@DATE@" .tmp/s5b/activity-s5b.md
cat .tmp/s5b/activity-s5b.md >> docs/activity-log.md
tail -12 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters):

```
0

## <date> Modularization S5b collection web (claude/modularization-s5b-9ept8o)
- Task 1 (<sha>): `import-responses.ts` and `form-responses.ts` added to `packages/share
- Task 2 (<sha>): `formsClient` (13 methods), `importsClient` (9) and `imports.schema.ts
- Task 3 (<sha>): 45 calls in 7 files and 12 mock factories moved to the new clients, th
- Task 4 (<sha>, <sha>): stored upload recovery and the stop and resume of the process
- Task 5 (<sha>): 14 views cut out of `collection-workspace.tsx` into `components/` and 
- Task 6 (<sha>, <sha>): `useFormFields` and `useServerProcessing` cut out by line ran
- Task 7 (<sha>): `collection-workspace.test.tsx` (1672 lines) split into five files; th
- Task 8: the change record (section 3.3 hook rule, section 9 S5b disposition), the audit 
- Decisions: the S5b decisions are recorded in the change record section 9; the plan stays
- Deferred: S5c takes `import-workspace.tsx`, `direct-form-entry-workspace.tsx`, the rest 
```

- [ ] **Step 4: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git commit -q -m "docs: record modularization S5b

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -1
```

Expected: the same 6 baseline docs failures and 1 warning (a seventh failure means a record broke a docs rule: voice allows no em dash and no double hyphen in prose), lint clean, and a commit of 4 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1405 files in <ms>. No fixes applied.
 4 files changed, <n> insertions(+), <m> deletions(-)
```

---

### Task 9: Full release gates

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 | tail -1
pnpm typecheck 2>&1 | grep -E "Done|error" | sort | uniq -c
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep -c "error TS"
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s5b/build-routes.sh gates
node .tmp/s5b/compare-routes.mjs .tmp/s5b/routes-baseline.txt .tmp/s5b/routes-gates.txt | tail -6
node .tmp/s5b/compare-routes.mjs .tmp/s5b/routes-final.txt .tmp/s5b/routes-gates.txt | tail -2
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
git status --short | wc -l
```

Expected: Biome clean, five `Done` lines (config, shared, imports, api and web), the `2` baseline lines of `--noUnusedLocals`, then the test summaries with the Task 0 baselines for config, imports, api and sad, shared at `B_shared` plus 2 files and 7 tests, and web at 241 files and 2053 tests, a build that exits 0 with Middleware at `M0`, the routes that differ from the Task 0 build (none bigger) and none that differs from the Task 8 build, the baseline docs check and a clean tree (the `$ pnpm ...` echo lines of pnpm come between them; the counts of the package lines depend on the stacked slices below, see Task 0):

```
Checked 1405 files in <ms>. No fixes applied.
      1 apps/api typecheck: Done
      1 apps/web typecheck: Done
      1 packages/config typecheck: Done
      1 packages/imports typecheck: Done
      1 packages/shared typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  672 passed (672)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  241 passed (241)
apps/web test:       Tests  2053 passed (2053)
      Tests  57 passed (57)
exit 0
ƒ Middleware                                                      103 kB
/collection/projects/[projectId]/forms/[formId]: 430 kB -> 426 kB (-4.0)
/collection/projects/[projectId]/forms/[formId]/entries/new: 271 kB -> 263 kB (-8.0)
/projects/[projectId]: 311 kB -> 310 kB (-1.0)
/projects/[projectId]/activities/[activityId]: 339 kB -> 338 kB (-1.0)
/settings/users: 287 kB -> 286 kB (-1.0)
routes 72, different 10
routes 72, different 0
```

The first compare is against the Task 0 build and the second against the Task 8 build, which is the same code. A package count that moved other than shared and web is a stop, because S5b touches only `packages/shared`, `apps/api` return types, `apps/web` and docs.

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S5b changes no migration and no file outside `packages/shared/src`, `apps/api/src/modules/{imports,metadata}` (return types), `apps/web/src` and `docs`, so the CI replay of the final pull request, the one opened after every slice is implemented (expect 171 PASS, 0 FAIL), is the gate when the replay cannot run here; record which one ran.

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev:

- Form builder: open `/collection/forms/new`, add a field, move it up and down, edit its label and type, delete it (confirm), save a draft, publish, open `/collection/forms` and see the saved form; export the definition.
- Collection import: open `/collection/import?mode=extend`, upload a CSV, see the preview, let the automatic mapping run, save the mapping, validate, continue to processing, stop the run and resume it; upload the same file again after a failure and see the same client import id in the network panel.
- Import screen: open `/collection/import`, upload, map, validate and process a batch; reload a batch in `RECOVERY_REQUIRED` and press "Resume stored upload".
- Direct entry: open `/collection/projects/<project>/forms/<form>/entries/new`, fill the form, save a draft, submit, and see the entry in the list.
- Untouched neighbours: open a beneficiary detail (it reads a form definition), `/beneficiaries/new` (it loads the published form of a project) and a project indicators page (it lists forms).

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s5b
pnpm sad:check --base "$(cat .tmp/s5b/base-sha)" --head HEAD --output .tmp/sad/s5b/manifest.json > .tmp/sad/s5b/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s5b/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0, writes the manifest and names four roles: the organization isolation checker (the three api services that got return types), the beneficiary privacy guardian (the `lib/api` clients and their tests, the two api mappers and the response contracts), the metadata import validator (the five api files and the response contracts) and the design QA agent (every changed code path, 66 in the dry run). The counts move by a few paths if the branch holds other changes:

```
exit 0
organization-isolation-checker 3
beneficiary-privacy-guardian 16
metadata-import-validator 9
design-qa-agent 66
```

`.tmp/sad/s5b/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`.

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, which the design QA agent needs at 66), transcribe each reply into `.tmp/sad/s5b/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s5b/assemble.mjs`, run `node .tmp/sad/s5b/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s5b/base-sha)" --head HEAD --reviews .tmp/sad/s5b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The dry run could not dispatch the roles (no subagents in the planning copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, replay exit code or CI result, seed results, e2e pass counts and smoke result or pending local run, SAD sign-off). The bullet below takes its date, head and Middleware size from the commands and is to be adapted with your own numbers (the package counts must equal the Task 0 baselines, except shared and web); it holds no backtick or backslash, so the unquoted heredoc is safe:

```bash
D=$(date +%F)
H=$(git rev-parse --short HEAD)
M0=$(grep Middleware .tmp/s5b/routes-baseline.txt | grep -oE '[0-9]+ kB' | head -1)
cat >> docs/activity-log.md <<LOG
- Gates ($D, cloud container, head $H): lint, typecheck and tests pass with config 19, shared 672, imports 94, api 2610 passed and 21 skipped, web 241 files and 2053 tests (nine new files and 38 new rows; the 50 rows of the split test moved unchanged), sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware $M0 and 10 of 72 routes smaller and none bigger than in the Task 0 build; SAD sign-off pending; replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: the developer asked for one pull request after every slice is implemented.
LOG
git add docs/activity-log.md
git commit -q -m "docs: record modularization S5b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%s HEAD | tail -2
git log --oneline "$(cat .tmp/s5b/base-sha)"..HEAD | wc -l
git status --short | wc -l
```

Expected: one file, one line added, twelve commits on the slice branch since the base (the plan commit, the nine code commits, the records and this one) and a clean tree:

```
 docs/activity-log.md | 1 +
 1 file changed, <n> insertions(+)
12
0
```

- [ ] **Step 6: Hand off, no pull request**

Do not push and do not open a pull request: the developer asked for one pull request into `dev` after every slice is implemented (ruling 14), so S5b stays on its branch stacked on the S4c branch and the controller pushes it at task-pair boundaries. Report the branch tip, the commit list (`git log --oneline "$(cat .tmp/s5b/base-sha)"..HEAD`), the Task 0 baselines and the Task 9 results, and name what stays pending: the database replay (CI), seeds, `pnpm dev:local`, e2e, the browser smoke and the SAD sign-off.

---

## S5c outline (collection web, the rest)

To be written as its own plan from the S5b tip (`claude/modularization-s5c-9ept8o`, stacked on `claude/modularization-s5b-9ept8o`) in the same format; its Task 0 recounts every number below and adds its own plan copy to `docs/superpowers/plans` as S5b Task 0 did. Counts were taken on the S5b tip of the dry run.

- **Task 0, baseline:** recount the numbers below, check the S5b markers (`S5b applied` in the change record and the three hooks in `features/collection/hooks`), record Middleware.
- **Task A, the guard hook (S5c ruling A):** `OwnedCollectionWorkspace` keeps 33 `useState` calls (37 before the two hooks of S5b Task 6) and one operation guard: `mounted`, `intent`, `mutation`, `current`, `eligible` and `beginOperation` (ruling 9 of S5b). Characterize the parse, save, publish and delete-form handlers first (the existing rows reach them only through the whole screen), then cut the guard into `hooks/use-operation-guard.ts` with the same `OperationGuard` interface that `use-form-fields.ts` already declares, and move the handlers into `hooks/use-form-list.ts`, `use-form-parse.ts` and `use-form-save.ts` by line range, as S5b Task 6 did. Target: the screen under 500 lines.
- **Task B, `import-workspace.tsx` (1110 lines after S5b, 16 `useState` calls):** split the two components, the four helper functions and the process, resume and mapping handlers into `components/` and `hooks/`, verbatim by `split-module.mjs` and `cut.mjs`; `useImportBatch` already holds what the screen shares with the collection dialog, and the `resume` and ownership rows pin the guarded flows. Split `import-workspace.*.test.tsx` only if a file passes 600 lines.
- **Task C, `direct-form-entry-workspace.tsx` (654 lines, 10 `useState` calls):** split the three components and the one helper function the same way; `direct-entry-ownership.test.tsx` and `direct-form-entry-workspace.test.tsx` already pin the guarded save and submit.
- **Task D, `features/collection` layout:** the folder holds 62 files after S5b; move components, hooks and the helper modules into the concern subfolders the CR 3.3 layout names (`forms`, `import`, `entry`), `import-status-labels.ts` and `formTypeLabels` into `collection.copy.ts`; add `features/collection/index.ts` and repoint the route pages and `features/beneficiaries` (`FormDefinitionEntryField`) through it; add `'collection'` to S1b's `indexedFeatures` in `apps/web/src/import-direction.test.ts` and `'@/features/collection'` to `experimental.optimizePackageImports` in `apps/web/next.config.ts`, instead of writing a new rule.
- **Task E, web form types:** `form-builder-session-draft.ts` `formTypes` and `types/pathways.ts` `DigitalFormType` become the shared form type list (identical seven codes, pinned by a test before the copies go); `DigitalFormFieldDefinition`, `SaveDigitalFormInput` and the other input types stay where the contracts do not cover them.
- **Task F, records:** CR section 3.3 and the S5c disposition (closing S5), audit MOD-06, MOD-15 and MOD-16 for the collection parts, index, activity log.
- **Task G, gates:** as S5b Task 9 (SAD evidence under `.tmp/sad/s5c/`), with Middleware measured and a smoke over every collection screen, both import flows, direct entry, the beneficiary form's dynamic fields and the project indicators screen. After the controller merges the S5 stack, remove the `docs/superpowers/plans` copies of the S5 plans and their index rows with a sed that matches only those rows (the `docs/handoff` copies and their rows stay).
