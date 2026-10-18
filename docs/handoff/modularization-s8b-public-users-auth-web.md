# S8b Public, Users, Profile and Auth Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the publication and audit web reads their own client modules, delete `lib/services/core-feature-client.ts`, split the two oversized components of the slice (`user-management-workspace.tsx` of 938 lines and `mfa-form.tsx` of 717) into hooks and sections with characterization tests written first, and lay out `features/auth`, `features/profile`, `features/public` and `features/settings` as `components/`, `hooks/` and a public `index.ts`, with no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S8b is the web half of S8 that S8a left (S8a: contracts, API switches, the users, profile and public clients, the dead microsite detail). The two remaining `core-feature-client.ts` members become `publicationClient` and `auditClient` in `lib/api`, written for the executor and run through the same test tables as the code they replace before that code goes (Task 1); the callers, the three test mocks and the artifact helpers that were the rest of the file follow by script with exact counts, and the old test file is cut by script into the places its cases belong with every title kept (Task 2). The four feature folders are laid out with one `git mv` map, one specifier rewrite and four indexes in a single commit, and the build is measured before and after (Task 3). The two oversized components are each split in two commits: first a characterization test that passes on the unsplit code (21 cases each), then a verbatim cut by a hash-pinned plan, proven line by line with `same-lines.mjs` and by mutation runs (Tasks 4 and 5). Records and the release gates close the slice (Tasks 6 and 7). Every mechanical step is a script whose full content is printed here; the plan was replayed end to end from the S8a tip (the stacked tree with S3b to S8a applied), and every Expected block is the output of that replay.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5 and 9, including the S8a disposition and its "Deferred to S8b" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05 for the publication and audit clients, MOD-06 for the two oversized components, MOD-15 and MOD-17 for the feature surfaces and names), and the S8b outline at the end of `docs/handoff/modularization-s8-public-users-auth.md`, which this plan replaces (rulings 1, 3, 6, 7 and 9 say where it differs).

## Rulings

Controller rulings for S8b. Each was checked in the replay from the S8a tip; Task 0 recounts them.

1. **One slice, eight tasks, a different order from the outline.** The outline had seven tasks and ordered the two splits before the layout. This plan lays the folders out first (Task 3) so that each split happens inside the final folder, in its own commit pair, and so that a reviewer compares renames and cuts separately. Tasks 0 to 7 are within the ten-task limit, so there is no S8c. Cost if wrong: none.
2. **The publication and audit clients are copies with two typing changes.** `publicationClient` (`get`, `transition`) in `lib/api/publication.ts` and `auditClient` (`list`) in `lib/api/audit.ts` keep the paths, the encoded cursor, the abort signal, the strict response schemas, the `captureRequestOwner` check inside `ownedJsonRead` (S6b moved the owned read to `lib/api/core/owned-json-read.ts`) and the row-to-project id refinement of the members they replace. The publication snapshot becomes `publicProjectResponse.omit({ publishedAt: true })` (identical fields and bounds today: title 300, code 100, approved summary 4000, area 500, sector 300, dates as strings) and the transition body is typed `PublicationTransitionRequest`. The snapshot object is the only declaration of the old members that the proof lists as not copied, and the table rows that probe every bound and an unknown key pass against both versions. Cost if wrong: a rename.
3. **`core-feature-client.ts` is deleted, not emptied.** After the two members leave, the file holds the artifact helpers (`CoreArtifact`, `fetchCoreArtifact`, `saveCoreArtifact`, `downloadCoreArtifact`; the outline missed them). They move verbatim to `lib/api/core/artifact-download.ts`; the 22 files that import or mock them (7 production modules, the analytics test fixture and 14 tests) and the save characterization file of Task 1 change one specifier, and the 15 mock factories among them follow because a factory names the module the code under test imports. Cost if wrong: one more file name.
4. **Characterization before removal: both clients run the same cases.** Task 1 writes `publication.test.ts` (72 runs) and `audit.test.ts` (26) as `describe.each` tables over the old and the new client with the real foundation fetch: 49 cases, 98 runs, passing against the code being replaced before it goes. A mutation of the transition path, the strict object, the snapshot timestamp and the page bound each fail a case. Task 2 drops the old rows and keeps the new ones. Cost if wrong: none.
5. **The old test file is cut, not rewritten.** `core-feature-client.test.ts` (294 lines, 15 `it` blocks) is built into the three files its cases belong to by `cut.mjs` from line ranges: the shared read cases (an aborted signal, ownership invalidation, an unexpected MIME, a body completed after logout, an oversized body) run through `auditClient.list` in `lib/api/core/owned-json-read.test.ts`; the artifact cases are `lib/api/core/artifact-download.test.ts`; the two publication rows join `publication.test.ts`. The single case that refused both reads and downloads without a workspace cookie becomes two, one per subject. `test-titles.mjs compare` prints `lost 0` over the 47 titles of the four test files that change, with that one title allowed. Cost if wrong: none.
6. **User management is tested first.** The existing `user-management-workspace.test.tsx` pins only the create dialog (9 cases). Before the cut, Task 4 adds 21 cases for the account list, filters, detail dialog, edit save, deactivation and reactivation requests and the load failure, and moves the select stand-in to `test/fixtures/user-management-fixtures.ts` for both files. The split then runs the workspace test unchanged. The outline's `user-management-utils.ts` becomes `settings.utils.ts` (CR 3.5) and takes `emptyEditor`, `formatAccountDate` and `UserEditorState`; `AUTH_USER_ID_PATTERN` stays, as a client hint the API decides. Cost if wrong: a rename.
7. **The MFA form splits by concern, not by step.** The outline said enrollment, challenge and recovery, but the form is one state machine: 11 `useState` calls, seven effects and three async actions that all read and write the same `check`, `enrollment`, `code`, `accepted` and `busy` state, so a split by step needs a two dozen value props. Task 5 splits the logic from the view instead: `hooks/use-mfa-flow.ts` (the session check, enroll, verify and sign-out), `hooks/use-mfa-handoff.ts` (the workspace handoff after a verified session), `components/mfa-factor-panel.tsx` (the QR, the key, the factor select and the code form), `components/mfa-verified-panel.tsx` (the access states after `aal2`) and the form shell. `lib/auth/mfa-flow.ts` keeps the transport. The existing `mfa-form.test.tsx` (12 cases) runs unchanged; 21 states cases are written first and pass on the unsplit code. One order change is accepted: the 30 second fallback timer effect, which touches only `accepted` and `error`, now runs after the three handoff effects instead of between the first and the second; a mutation run and the states tests pin the handoff and the timer. `auth-navigation.contract.test.ts` reads the four files that now hold the form's source and keeps all its assertions (the native retry link, exactly two action-specific `/auth/mfa/status` requests, no `window.location` replace or assign). Cost if wrong: a reorder of two effects.
8. **Layout.** 46 files move by `layout-map.json` (the map prints in Task 3). `components/` holds every screen and its test; the four validation files get the CR 3.5 suffix (`auth.schema.ts`, `login.schema.ts`, `own-profile.schema.ts`, `settings.utils.ts` with their tests). The folders are far below 30 files, so there are no subfolders. `signin-request.ts` and `own-password-operation.ts` stay at the folder root: they are request helpers that no suffix names (S7a kept `rule-templates.ts` the same way, and S8 ruling 8 kept `signin-request.ts` out of `lib/auth`). The four indexes list the exports the app routes use by leaf path, and `strongPasswordSchema`, which the profile schema imports. Cost if wrong: a file name.
9. **Cross-feature imports are fewer than the outline said.** The outline listed `project-review-workspace.tsx` importing the publication queue; on this tree only app route files and `profile/own-profile.schema.ts` (to `strongPasswordSchema`) import the four features. `index-imports.mjs` rewrites 21 leaf imports in 20 app files to the index and the schema import is edited by hand in `task3-edits.json`. Cost if wrong: a failed type check, which is its own alarm.
10. **`import-direction.test.ts` used `@/features/settings/audit-log-workspace` as its example of a leaf of an unindexed feature.** With `settings` indexed the example becomes `@/features/unlisted/example`, a feature with no folder: every feature that holds a leaf the example could name is indexed or may be indexed by a later slice (`dashboard` has been indexed since S7d), and the case only needs a name that `indexedFeatures` does not list. The test's other cases are unchanged. Cost if wrong: none.
11. **Every production build starts from a clean `.next`** (S2b ruling 10) and the tables are compared with `compare-routes.mjs`. Task 3 measures right before the move, because Tasks 1 and 2 already moved some routes by 1 kB (the old client left shared chunks). The pass criterion is no route more than 1 kB bigger than the Task 0 table, no difference across the layout move, and Middleware at `M0` (102 kB in the replay clone, 103 kB in the main checkout of the S8a and dev merge gates; Task 0 measures it and `build-routes.sh` compares every later build with it). Absolute route sizes differ by checkout in the same way, so the Expected tables write them `<n>` and keep the route names and deltas. Cost if wrong: a misleading `Module not found` after a move.
12. **No new SAD routing.** `apps/web/src/lib/api/**/*.ts` already routes to `beneficiary-privacy-guardian` and the feature folders to `design-qa-agent` (`scripts/sad/check.ts`), so the new clients and the moved and split files are covered. Cost if wrong: one glob.
13. **Not done in S8b (recorded in the change record section 9):** `use-mfa-flow.ts` (373 lines), `audit-log-workspace.tsx` (399) and `publication-queue-workspace.tsx` (351) stay in one piece because each has one responsibility under the 500-line flag; the `useAuthorizedRead` keys of the publication queue and the audit log stay in their components (no reads file, since each key has one reader); and the `lib/services/*` files that no slice owns stay for W1. Cost if wrong: a later split.
14. **Cross-plan.** Every slice below S8b is applied before it (Task 0 Step 1 checks the ancestry of S5b to S8a); Task 0 recounts, and every hash that a cut plan pins is printed first so a mismatch stops the task with the value to compare. S8b is the last slice, so no later plan is edited; `docs/superpowers/plans/*-modularization-s8-public-users-auth.md` and this plan's copy stay until the series is merged (Task 7 Step 6). The two e2e specs that import the moved forms by relative path are edited here and run in the pending local run. Cost if wrong: a later Task 0 stops on a count.

## Interfaces assumed from earlier sub-projects

- Dev merge (086929dd, with 3395b006 and the records commit cc811845): dev's rule authoring work ported into `features/rules`; it touches none of the files S8b moves or splits, ends the change record section 9 with the "Dev merge before S8b" paragraph (Task 6 appends the S8b paragraph after it), and fixed the `docs:check` baseline to 0 failures and 0 warnings.
- S8a: `publicProjectResponse` and `PublicationTransitionRequest` from `@pathways/shared` (`contracts/public/public-projects.ts`), `usersClient`, `ownProfileClient` and `readPublicSnapshots` in `lib/api`, `public-project-detail.tsx` and `profile-validation.ts` already deleted, and the CR section 9 paragraph "S8a applied" with its "Deferred to S8b" line.
- S6b: `ownedJsonRead`, `ownedJsonPost` and `projectPath` in `apps/web/src/lib/api/core/owned-json-read.ts`; `lib/services/core-feature-client.ts` holding `coreFeatureClient` (publication), `coreDataClient.audit` and the artifact helpers (173 lines); the `describe.each` client test pattern; `reports` in `indexedFeatures`.
- S5b, S7a: `collection` and `rules` in `indexedFeatures` and `optimizePackageImports` (this slice puts its four names first in both lists); the move and index scripts of those slices.
- S4b, S4c: `lib/api/beneficiaries.ts` as the model of a client file and of mocks that name `@/lib/api/*`; the cut-plan method (`cut.mjs` with a pinned hash, `same-lines.mjs`).
- S2b: `features/projects/index.ts`, `lib/api/core/guards.ts` and the `.schema.ts` convention; S1b: `indexedFeatures` and `surfaceViolation` in `apps/web/src/import-direction.test.ts`.
- F4b: `PathwaysClientError`, `requestFoundationResponse`, `captureRequestOwner`, `useAuthorizedRead` and `lib/format/*`.

## Produces (names later plans consume)

- `publicationClient` (`lib/api/publication.ts`): `get(id, signal)` and `transition(id, operation, body, signal)`; `auditClient` (`lib/api/audit.ts`): `list(cursor, signal)`; `fetchCoreArtifact`, `saveCoreArtifact`, `downloadCoreArtifact` and `CoreArtifact` (`lib/api/core/artifact-download.ts`); `delayedBody` (`test/fixtures/delayed-body.ts`) and `selectMock`, `baseUser`, `projectManagerProfile` (`test/fixtures/user-management-fixtures.ts`).
- Features: `features/auth/{components,hooks}` with `auth.schema.ts`, `login.schema.ts` and an `index.ts` exporting `AccessRecovery`, `AccountRecoveryWorkspace`, `LoginForm`, `MfaForm`, `PasswordRecoveryRequestForm`, `PasswordUpdateForm`, `ResetPasswordWorkspace`, `StaffAuthFrame` and `strongPasswordSchema`; `features/profile/components` with `own-profile.schema.ts` and an index exporting `OwnProfileWorkspace`; `features/public/components` with an index exporting the public pages, `PublicTrackerPreview`, the tracker views and `PublicationQueueWorkspace`; `features/settings/{components,hooks}` with `settings.utils.ts` and an index exporting `AuditLogWorkspace`, `BackupRecoveryWorkspace` and `UserManagementWorkspace`. The four names are in `indexedFeatures` and in `optimizePackageImports`.
- `lib/services/core-feature-client.ts` and its test no longer exist; no file names `coreFeatureClient` or `coreDataClient`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The only removals are the moved duplicates (the old client members and their old test rows). Production code stays free of new dependencies; `apps/api` and `packages/shared` are not changed by this slice.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; every file outside `auth`, `profile`, `public` and `settings` imports them only through their index once Task 3 lands.
- File moves use `git mv` (the move script does it) and are committed apart from the cuts; the cut files are checked with `.tmp/s8b/same-lines.mjs` (`lost 0`) before Biome formats them, and every cut plan pins the hash of its source (`cut.mjs` writes nothing when the hash differs: stop and report NEEDS_CONTEXT with the printed hash unless the file was changed by a slice below this one, in which case recount the cut ranges against the new file before continuing).
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the new tests use fictional ids (`79000000-...`, `79100000-...`), the token `synthetic-test-token` and the fictional names and addresses already in the existing tests.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s8b/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`forms/hooks/use-collection-state.ts` `indicators`, where S5b moved it, and `types/pathways.ts` `SadddDashboard`). S8b changes no api file, so the api check of the earlier slices is not repeated.
- A split keeps `'use client'` on the shell that an app page imports: `cut.mjs` drops the line from `@imports` and writes nothing in its place, so the cut plans of the shells write it by hand, and the production build is the check that catches a missing one.
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Run `.tmp/s8b/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to five minutes, so give the command a ten minute timeout. Never run `pnpm build` at the repository root (it builds the api through `prisma generate`) and never run `prisma generate`; S8b changes no api or shared file, so the web build is the only build of the slice.
- Mock factories name modules by the specifier the code under test imports; after Task 2 no mock names `core-feature-client`, and the publication, audit and artifact mocks name `@/lib/api/publication`, `@/lib/api/audit` and `@/lib/api/core/artifact-download`.
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s8b/` (gitignored) and are never committed; build logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` when run from there, and relative to the repository root when run through `pnpm --filter @pathways/web exec vitest run`.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- Known flakes: the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`, web `collection-workspace` timeouts under load, api `imports.service.test.ts` (duplicate metadata keys) and one `pnpm sad:test` case under load. Rerun such a file alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the figures Task 0 marks as depending on the slices below (recount those and carry on with the recounted values).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the replay and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared` and `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Every commit runs as `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "..."` and ends its message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s8b-9ept8o`, stacked on `claude/modularization-s8a-9ept8o`); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence.
- This slice opens no pull request, merges nothing into `dev` or `master` and removes no plan copy: the controller opens the stacked pull requests into `dev` after the last slice, and the CI replay of the final one is the replay gate, so Task 7 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 7).
- Each bash block runs alone in a fresh shell, so a variable set in one block does not exist in the next; every block that needs one sets it first.

## Review Focus

1. Every moved member must send the same request: path, encoded ids, abort signal, query string, body and method; and must refuse the same inputs before any request (a malformed project id). Task 1 pins all of it on both the old and the new client, and the strict response schemas (an unknown key is refused) are checked by rows that pass against both.
2. The shared owned read must keep its checks (owner, size, MIME, abort, cancellation after logout): the cases that probe it stay and now run through `auditClient.list`. Task 2 compares every test title before and after.
3. A test stub left on `coreFeatureClient` or `coreDataClient` would hand a component `undefined` at run time. Task 2 scans every factory and runs the whole web suite.
4. Both splits must be verbatim moves: `same-lines.mjs` says `lost 0` for the workspace (937 lines) and the MFA form (672 lines), the added lines are only signatures, props and calls, and behavior that the old tests did not pin is pinned by tests written against the unsplit code (Tasks 4 and 5) and by mutation runs.
5. The MFA form is a security screen: it must keep a native retry link and no automatic redirect, only action-specific `/auth/mfa/status` requests, the 30 second fallback, the session re-check before every factor call and the sign-out card that does not flash. The states tests, the mutation run and the contract test pin these on the split files.
6. A route bundle must not grow when files move, and a route page that imports a feature index must not load a barrel. Task 3 compares a freshly measured table and Task 7 compares against all three tables.
7. Outside the four features no file may import a leaf of them; `import-direction.test.ts` and `git grep` in Task 3 check it.

## File map

| Path | Role after S8b |
|---|---|
| `apps/web/src/lib/api/publication.ts`, `audit.ts` and their tests | the two clients (new, Task 1; tests keep only the new client after Task 2) |
| `apps/web/src/lib/api/core/artifact-download.ts`, `artifact-download.test.ts`, `owned-json-read.test.ts` | the artifact helpers and the cases cut from `core-feature-client.test.ts` (new, Task 2) |
| `apps/web/src/lib/services/core-feature-client.ts`, `core-feature-client.test.ts` | deleted (Task 2) |
| `apps/web/src/test/fixtures/delayed-body.ts`, `user-management-fixtures.ts` | shared test fixtures (new, Tasks 2 and 4) |
| `apps/web/src/features/{auth,profile,public,settings}/` | `components/`, `hooks/`, `*.schema.ts`, `settings.utils.ts`, `index.ts` (Tasks 3 to 5) |
| `apps/web/src/features/settings/{hooks,components}/` | user directory and editor hooks, four components, workspace of 344 lines (Task 4) |
| `apps/web/src/features/auth/{hooks,components}/` | MFA flow and handoff hooks, two panels, form shell of 215 lines (Task 5) |
| `apps/web/src/app/**/page.tsx` (20 files) | import the four feature indexes (Task 3) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`, `apps/web/e2e/{mfa-access,password-login}.spec.ts`, `lib/rbac/auth-navigation.contract.test.ts` | follow the layout (Tasks 3 and 5) |
| `docs/` change record, audit, QAD, deferred features, RFC path, index, activity log | records (Task 6) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s8b-public-users-auth-web.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s8b/base-sha` (Step 1), `m0`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `count-it.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `cut.mjs`, `mock-scan.mjs`, `test-titles.mjs`, `move-modules.mjs`, `index-imports.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S8a and the slices below it, and record the base**

The markers are files and text that S8a itself creates or that only a slice below it creates (a slice that runs later never creates them), so a missing one means that slice is not applied. `.tmp/s8b/base-sha` holds the S8b base (the SAD base of Task 7 Step 4):

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s8b/files .tmp/s8b/out .tmp/s8b/before
git rev-parse HEAD > .tmp/s8b/base-sha
for b in s8a s7d s7c s7b s7a s6c s5c s6b s5b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S8a record: $(grep -c '^S8a applied' $CR)"
echo "S7d record: $(grep -c '^S7d applied' $CR)"
echo "dev merge record: $(grep -c '^Dev merge before S8b' $CR)"
F=apps/web/src
test -f packages/shared/src/contracts/users/user-authorization.ts && test -f packages/shared/src/contracts/profile/own-profile.ts && test -f packages/shared/src/contracts/auth/auth-requests.ts && test -f packages/shared/src/contracts/public/public-projects.ts && echo "S8a contracts present"
test -f $F/lib/api/users.ts && test -f $F/lib/api/profile.ts && test -f $F/lib/api/public.ts && test ! -e $F/lib/services/own-profile-client.ts && test ! -e $F/lib/services/public-projects.ts && echo "S8a clients present"
test -f apps/api/src/modules/public/publication.controller.ts && test ! -e apps/api/src/modules/public/public.controller.ts && test -f apps/api/src/modules/auth/auth.helpers.ts && echo "S8a api present"
test -f $F/features/dashboard/index.ts && test -f $F/features/dashboard/dashboard.reads.ts && test -f $F/features/analytics/index.ts && echo "S7d and S7c present"
test -f $F/lib/api/core/owned-json-read.ts && test -f $F/lib/api/finance.ts && echo "S6b present"
test -f $F/lib/api/forms.ts && test -f $F/features/collection/index.ts && echo "S5b present"
test -d $F/features/beneficiaries/registration/hooks && echo "S4c present"
grep -c "indexedFeatures" $F/import-direction.test.ts
grep -c "optimizePackageImports" apps/web/next.config.ts
test -f $F/lib/services/core-feature-client.ts && test ! -e $F/lib/api/publication.ts && test ! -e $F/features/auth/index.ts && test ! -e $F/features/settings/index.ts && echo "S8b not started"
test -f docs/handoff/modularization-s8b-public-users-auth-web.md && echo "handoff copy present"
ls docs/superpowers/plans/
```


Expected:

```text
claude/modularization-s8b-9ept8o
s8a branch is an ancestor of HEAD
s7d branch is an ancestor of HEAD
s7c branch is an ancestor of HEAD
s7b branch is an ancestor of HEAD
s7a branch is an ancestor of HEAD
s6c branch is an ancestor of HEAD
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S8a record: 1
S7d record: 1
dev merge record: 1
S8a contracts present
S8a clients present
S8a api present
S7d and S7c present
S6b present
S5b present
S4c present
4
1
S8b not started
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
2026-10-14-modularization-s7b-analytics-dashboards.md
2026-10-14-modularization-s7c-analytics-dashboards-web.md
2026-10-14-modularization-s7d-dashboards-web.md
2026-10-14-modularization-s8-public-users-auth.md
```


The branch is `claude/modularization-s8b-9ept8o` (the environment assigns it) and `git status --short` prints nothing. Then one ancestor line for each stacked branch, the three record counts (S8a, S7d and the dev merge of 2026-10-18 that S8b is stacked on, whose paragraph ends section 9 of the change record), the marker lines, the two `grep -c` counts (`indexedFeatures` is named four times in the direction test, `optimizePackageImports` once in the Next config), `S8b not started`, `handoff copy present` (the controller staged this plan) and the plan listing (15 copies, `s3b` to `s8`, with the dates the tree has). A different branch, a line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a record count of `0`, a missing marker line, a missing `S8b not started` or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/`, because a checkout that fetched only the remote has the remote refs alone. This slice adds its own plan copy in Step 4 and removes none.

- [ ] **Step 2: Create the helper scripts**

Create each file with the Write tool exactly as printed. They live in `.tmp/s8b/`, which is gitignored, and are never committed. `build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s8b/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next, saves the route table as .tmp/s8b/routes-<name>.txt and, once Task 0 has written m0, says whether Middleware equals it.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s8b/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s8b/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s8b/routes-$1.txt
grep Middleware .tmp/s8b/routes-$1.txt
if [ -s .tmp/s8b/m0 ]; then grep -q "Middleware .* $(cat .tmp/s8b/m0) kB$" .tmp/s8b/routes-$1.txt && echo "Middleware equals M0" || echo "MIDDLEWARE DIFFERS FROM M0"; fi
```


`compare-routes.mjs` compares two route tables (route, size and First Load JS):

Create `.tmp/s8b/compare-routes.mjs`:

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

Create `.tmp/s8b/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s8b/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

Create `.tmp/s8b/count-it.mjs`:

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

Create `.tmp/s8b/trim-imports.mjs`:

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


`same-lines.mjs` proves a move: it fails when a declaration line of the original is missing from the new files, and `--list` prints the lines the new files add:

Create `.tmp/s8b/same-lines.mjs`:

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

Create `.tmp/s8b/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s8b/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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

Create `.tmp/s8b/mock-scan.mjs`:

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

Create `.tmp/s8b/test-titles.mjs`:

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

Create `.tmp/s8b/move-modules.mjs`:

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

Create `.tmp/s8b/index-imports.mjs`:

```js
// Points app route imports of an indexed feature's leaf modules at the feature index, merging the imports of one feature in a file into one statement.
// Usage: node .tmp/s8b/index-imports.mjs <feature>... ; every app file is checked, and a default import of a leaf stops the run.
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

The recursive test run uses the no-bail option so that one failing package does not hide the figures of the others. The build is the route table of a clean `.next`:

```bash
chmod +x .tmp/s8b/build-routes.sh
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm typecheck > .tmp/s8b/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s8b/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s8b/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s8b/m0
cat .tmp/s8b/m0
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
```


Expected:

```text
shared built
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  54 passed (54)
packages/shared test:       Tests  885 passed (885)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  164 passed | 10 skipped (174)
apps/api test:       Tests  2642 passed | 21 skipped (2663)
apps/web test:  Test Files  301 passed (301)
apps/web test:       Tests  3378 passed (3378)
      Tests  59 passed (59)
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
exit 0
ƒ Middleware                                                      <n> kB
<n>
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
```


The test lines are the baselines the later tasks state their deltas against: `B_config` 19, `B_shared` 885 (54 files), `B_imports` 94, `B_api` 2642 passed and 21 skipped (164 files, 10 skipped), `B_sad` 59 and `B_web` 301 files and 3378 tests (the S8a tip with the dev merge; the latest gate line in `docs/activity-log.md` wins if it differs). `docs:check` prints 0 failures and 0 warnings (dev fixed the old baseline of 6 and 1), so any failure in a later task is a stop. The build prints `exit 0` and the Middleware line, and `m0` holds its size in kB (`M0`): 102 kB in the replay clone and 103 kB in the main checkout of the S8a and dev merge gates, so the absolute sizes of the route tables are written `<n>` in this plan; the route names, the deltas and the `Middleware equals M0` line that every later build prints must match. `--noUnusedLocals` lists the two lines that exist before S8b (`forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`); later tasks must print the same two.

```bash
F=apps/web/src
for d in auth profile public settings; do git ls-files $F/features/$d | wc -l; done
wc -l $F/lib/services/core-feature-client.ts $F/lib/services/core-feature-client.test.ts $F/features/settings/user-management-workspace.tsx $F/features/settings/user-management-workspace.test.tsx $F/features/settings/user-management-utils.ts $F/features/auth/mfa-form.tsx $F/features/auth/mfa-form.test.tsx $F/features/public/publication-queue-workspace.tsx $F/features/settings/audit-log-workspace.tsx
grep -c "useState" $F/features/settings/user-management-workspace.tsx $F/features/auth/mfa-form.tsx
git grep -nE "coreFeatureClient\.|coreDataClient\." -- $F ':!'$F'/lib/services/core-feature-client.test.ts' | cut -c1-120
git grep -l "lib/services/core-feature-client" -- $F | wc -l
git grep -lE "(download|fetch|save)CoreArtifact|CoreArtifact" -- $F ':!'$F'/lib/services/core-feature-client*' | wc -l
node .tmp/s8b/mock-scan.mjs lib/services/core-feature-client coreFeatureClient coreDataClient
node .tmp/s8b/mock-scan.mjs lib/services/core-feature-client downloadCoreArtifact fetchCoreArtifact saveCoreArtifact
git grep -n "mfa-form\|login-form\|features/auth/access-recovery" -- apps/web/e2e $F/lib | cut -c1-130
git grep -nE "features/(auth|profile|public|settings)(/|')" -- $F/app $F/features ':!'$F'/features/auth' ':!'$F'/features/profile' ':!'$F'/features/public' ':!'$F'/features/settings' | wc -l
git hash-object $F/lib/services/core-feature-client.ts $F/lib/services/core-feature-client.test.ts $F/features/settings/user-management-workspace.tsx $F/features/settings/user-management-workspace.test.tsx $F/features/settings/user-management-utils.ts $F/features/auth/mfa-form.tsx $F/features/auth/mfa-form.test.tsx $F/lib/rbac/auth-navigation.contract.test.ts $F/import-direction.test.ts | cut -c1-8
```


Expected:

```text
15
10
17
8
   173 apps/web/src/lib/services/core-feature-client.ts
   294 apps/web/src/lib/services/core-feature-client.test.ts
   938 apps/web/src/features/settings/user-management-workspace.tsx
   307 apps/web/src/features/settings/user-management-workspace.test.tsx
   144 apps/web/src/features/settings/user-management-utils.ts
   717 apps/web/src/features/auth/mfa-form.tsx
   280 apps/web/src/features/auth/mfa-form.test.tsx
   351 apps/web/src/features/public/publication-queue-workspace.tsx
   399 apps/web/src/features/settings/audit-log-workspace.tsx
  3603 total
apps/web/src/features/settings/user-management-workspace.tsx:11
apps/web/src/features/auth/mfa-form.tsx:12
apps/web/src/features/public/public-tracker-preview.tsx:25:    (signal) => coreFeatureClient.publication(projectId, sign
apps/web/src/features/public/publication-queue-workspace.tsx:48:    (signal) => coreFeatureClient.publication(id ?? '', 
apps/web/src/features/public/publication-queue-workspace.tsx:117:      await coreFeatureClient.transitionPublication(id,
apps/web/src/features/settings/audit-log-workspace.tsx:79:    (signal) => coreDataClient.audit(cursor, signal),
28
22
apps/web/src/features/public/public-tracker-preview.test.tsx:10 coreFeatureClient
apps/web/src/features/public/publication-queue-workspace.test.tsx:54 coreFeatureClient
apps/web/src/features/settings/audit-log-workspace.test.tsx:26 coreDataClient
factories 18, naming 3
apps/web/src/features/analytics/hooks/use-analytics-export.test.ts:15 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.access.test.tsx:63 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.form-drafts.test.tsx:76 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.forms.test.tsx:63 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.import-preview.test.tsx:63 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.import-proceed.test.tsx:74 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.import-upload.test.tsx:64 downloadCoreArtifact
apps/web/src/features/collection/forms/components/collection-workspace.ownership.test.tsx:63 downloadCoreArtifact
apps/web/src/features/projects/activities/components/activity-proof-files.test.tsx:9 saveCoreArtifact
apps/web/src/features/projects/activities/components/private-proof-inspection.test.tsx:23 saveCoreArtifact
apps/web/src/features/projects/budget/components/budget-ledger.test.tsx:6 fetchCoreArtifact, saveCoreArtifact
apps/web/src/features/projects/components/project-review-workspace.test.tsx:53 saveCoreArtifact
apps/web/src/features/reports/components/live-reporting-workspace.state.test.tsx:78 downloadCoreArtifact
apps/web/src/features/reports/components/live-reporting-workspace.test.tsx:56 downloadCoreArtifact
apps/web/src/test/fixtures/analytics-dashboard-fixtures.tsx:93 downloadCoreArtifact
factories 18, naming 15
apps/web/e2e/mfa-access.spec.ts:33:        import { MfaForm } from '../src/features/auth/mfa-form';
apps/web/e2e/password-login.spec.ts:14:        import { LoginForm } from '../src/features/auth/login-form';
apps/web/src/lib/rbac/auth-navigation.contract.test.ts:37:    const recovery = source('features/auth/access-recovery.tsx')
apps/web/src/lib/rbac/auth-navigation.contract.test.ts:42:    const form = source('features/auth/mfa-form.tsx')
22
61d107ed
74f8913c
cbb434a7
a2f56ec5
343f20ab
77bb0e8c
d2f782fa
8ff7eef0
320d64f5
```


Read it as: the four feature folders hold 15, 10, 17 and 8 tracked files; the line counts are the ones in the rulings and the `useState` lines of the two components are 11 and 12 (each includes the import line); the four call sites of the two publication and audit members are in three production files (the publication queue calls two); 28 files name `core-feature-client` in a specifier and 22 name an artifact helper; 18 mock factories name the module, three of them stub the publication and audit members and 15 an artifact helper (seven of those are the `collection-workspace.*.test.tsx` files of S5c and its review fixes, one is the analytics fixture `test/fixtures/analytics-dashboard-fixtures.tsx`); two e2e specs and the auth navigation contract test name `mfa-form`, `login-form` and `access-recovery` by path; 22 files outside the four folders (the app pages and one profile file) import them. The last nine lines are the hashes of the files the cut plans pin and of the direction test (`320d64f5`, the S7d version, which Task 3 edits): `61d107ed` and `74f8913c` (the client and its test, Task 2), `a2f56ec5` (the user management test, Task 4) and `77bb0e8c` (the MFA form, Task 5) are the values the cut plans pin; the workspace is `cbb434a7` here and becomes `e284c1de` once Task 3 rewrites its imports, which is the value Task 4 pins. If a count or a hash differs from this replay and the slice below this one changed the file, recount it and carry on with the recounted value; if a hash of a file that no slice below touched differs, stop.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s8b-public-users-auth-web.md docs/superpowers/plans/$(date +%F)-modularization-s8b-public-users-auth-web.md`. The handoff copy and its index row stay, and so do the `docs/superpowers/plans` copy of the S8 plan and its index row: they are removed only after the developer has merged the series (Task 7 Step 6).

In `docs/index.md` section 1.6, add one row after the S8 plan row; the block finds the last line that names the S8 plan copy, so a second matching line does not get the row twice:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s8b-public-users-auth-web.md docs/superpowers/plans/$D-modularization-s8b-public-users-auth-web.md
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s8-public-users-auth" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a | [S8b public, users, profile and auth web plan](superpowers/plans/$D-modularization-s8b-public-users-auth-web.md) | $D-modularization-s8b-public-users-auth-web.md | $D | S8b of the codebase modularization: publication and audit clients, user management and MFA splits, auth, profile, public and settings feature layout | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: add the S8b public, users, profile and auth web plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text
+| [S8b public, users, profile and auth web plan](superpowers/plans/<date>-modularization-s8b-public-users-auth-web.md) | <date>-mod
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
<sha> docs: add the S8b public, users, profile and auth web plan
<sha> docs: add the pre-flighted S8b plan and its rulings
```


`docs:check` prints 0 failures and 0 warnings, the Task 0 baseline.

---

### Task 1: The publication and audit clients, with tests that run against the old and the new client

**Files:**
- Create: `apps/web/src/lib/api/publication.ts`, `apps/web/src/lib/api/audit.ts`, `apps/web/src/lib/api/publication.test.ts`, `apps/web/src/lib/api/audit.test.ts`, `apps/web/src/lib/api/core/artifact-download.owner.test.ts`
- Create (gitignored): `.tmp/s8b/mutate.sh`, `.tmp/s8b/files/moved-original.ts`

Nothing is removed or switched yet: `core-feature-client.ts` still holds the old members, so the tests below can run the same cases against both clients (ruling 4). `publicationClient` and `auditClient` are written for the executor; their request, path, body and response handling are the ones of the members they replace (they read through `ownedJsonRead` and `projectPath` of `lib/api/core/owned-json-read.ts`, as `coreFeatureClient` does since S6b), with two typing changes of ruling 2: the publication snapshot is `publicProjectResponse.omit({ publishedAt: true })` and the transition body is `PublicationTransitionRequest`.

- [ ] **Step 1: Create the clients and their tests**

Create each file with the Write tool exactly as printed. The tests use the real foundation fetch and header path with a stubbed `fetch`, the fictional ids `79000000-...` and `79100000-...` and the token `synthetic-test-token`; each `describe.each` table runs the same cases against `coreFeatureClient` or `coreDataClient` (the code being replaced) and against the new client:

Create `apps/web/src/lib/api/publication.ts`:

```ts
import { type PublicationTransitionRequest, publicProjectResponse } from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const publicationSchema = z
  .object({
    revision: z.number().int().positive(),
    state: z.enum(['FOR_REVIEW', 'APPROVED', 'PUBLISHED']),
    summary: z.string().min(1).max(4000),
    snapshot: publicProjectResponse.omit({ publishedAt: true }),
    submittedById: uuid,
    approvedById: uuid.nullable(),
    publishedById: uuid.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
const publicationReceipt = publicationSchema.pick({ revision: true, state: true, updatedAt: true })

export const publicationClient = {
  get: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/publication`,
      publicationSchema.refine((row) => row.snapshot.id === id).nullable(),
      { signal },
    ),
  transition: (
    id: string,
    operation: 'submit' | 'approve' | 'publish' | 'withdraw',
    body: PublicationTransitionRequest,
    signal?: AbortSignal,
  ) =>
    ownedJsonRead(`${projectPath(id)}/publication/${operation}`, publicationReceipt, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
}
```


Create `apps/web/src/lib/api/audit.ts`:

```ts
import { z } from 'zod'

import { ownedJsonRead } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const auditSchema = z
  .object({
    id: uuid,
    occurredAt: timestamp,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    projectId: uuid.nullable(),
    actorUserId: uuid.nullable(),
    actorName: z.string().nullable(),
  })
  .strict()

export const auditClient = {
  list: (cursor?: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      z.object({ rows: z.array(auditSchema).max(100), nextCursor: z.string().nullable() }).strict(),
      { signal },
    ),
}
```


Create `apps/web/src/lib/api/publication.test.ts`:

```ts
import { coreFeatureClient } from '@/lib/services/core-feature-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { publicationClient } from './publication'

const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const otherId = '79000000-0000-4000-8000-000000000005'
const requestId = '79000000-0000-4000-8000-000000000006'
const updatedAt = '2026-09-27T00:00:00.000Z'
const snapshot = {
  id: projectId,
  title: 'Fictional project',
  code: 'SYNTHETIC-1',
  approvedSummary: 'A fictional approved project summary.',
  area: null,
  sector: null,
  startDate: null,
  endDate: null,
}
const publication = {
  revision: 1,
  state: 'FOR_REVIEW',
  summary: 'A fictional approved project summary.',
  snapshot,
  submittedById: userId,
  approvedById: null,
  publishedById: null,
  updatedAt,
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
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

type Operation = 'submit' | 'approve' | 'publish' | 'withdraw'
type Client = {
  get: (id: string, signal?: AbortSignal) => Promise<unknown>
  transition: (
    id: string,
    operation: Operation,
    body: { clientRequestId: string; expectedRevision: number; summary?: string },
    signal?: AbortSignal,
  ) => Promise<unknown>
}
const clients: readonly (readonly [string, Client])[] = [
  [
    'coreFeatureClient',
    {
      get: (id, signal) => coreFeatureClient.publication(id, signal),
      transition: (id, operation, body, signal) =>
        coreFeatureClient.transitionPublication(id, operation, body, signal),
    },
  ],
  ['publicationClient', publicationClient],
]
const receipt = { revision: 2, state: 'APPROVED', updatedAt }
const operations: readonly Operation[] = ['submit', 'approve', 'publish', 'withdraw']
const edit = (replacement: object) => ({ ...publication, ...replacement })
const editSnapshot = (replacement: object) => edit({ snapshot: { ...snapshot, ...replacement } })

describe.each(clients)('%s publication read', (_name, client) => {
  it('requests the project publication and returns the parsed row or null', async () => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json(publication))
    await expect(client.get(projectId, controller.signal)).resolves.toEqual(publication)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}/publication`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.signal).toBe(controller.signal)
    fetcher.mockResolvedValueOnce(json(null))
    await expect(client.get(projectId)).resolves.toBeNull()
  })
  it('refuses a malformed project id before any request', () => {
    expect(() => client.get('../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('accepts the largest allowed field lengths', async () => {
    const body = editSnapshot({
      title: 'a'.repeat(300),
      code: 'b'.repeat(100),
      approvedSummary: 'c'.repeat(4000),
      area: 'd'.repeat(500),
      sector: 'e'.repeat(300),
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    fetcher.mockResolvedValueOnce(json({ ...body, summary: 'f'.repeat(4000) }))
    await expect(client.get(projectId)).resolves.toMatchObject({ snapshot: body.snapshot })
  })
  it.each([
    ['another project snapshot', editSnapshot({ id: otherId })],
    ['an empty title', editSnapshot({ title: '' })],
    ['a title over 300 characters', editSnapshot({ title: 'a'.repeat(301) })],
    ['a code over 100 characters', editSnapshot({ code: 'b'.repeat(101) })],
    ['an empty approved summary', editSnapshot({ approvedSummary: '' })],
    [
      'an approved summary over 4000 characters',
      editSnapshot({ approvedSummary: 'c'.repeat(4001) }),
    ],
    ['an area over 500 characters', editSnapshot({ area: 'd'.repeat(501) })],
    ['a sector over 300 characters', editSnapshot({ sector: 'e'.repeat(301) })],
    ['a numeric area', editSnapshot({ area: 1 })],
    ['a non-uuid snapshot id', editSnapshot({ id: 'not-an-id' })],
    ['a snapshot publication timestamp', editSnapshot({ publishedAt: updatedAt })],
    ['a private snapshot field', editSnapshot({ privateNotes: 'synthetic private data' })],
    ['a beneficiary snapshot field', editSnapshot({ beneficiaries: 12 })],
    ['an expense snapshot field', editSnapshot({ expenseAmount: '10' })],
    ['a missing snapshot field', edit({ snapshot: { ...snapshot, sector: undefined } })],
    ['revision zero', edit({ revision: 0 })],
    ['a fractional revision', edit({ revision: 1.5 })],
    ['an unknown state', edit({ state: 'DRAFT' })],
    ['an empty summary', edit({ summary: '' })],
    ['a summary over 4000 characters', edit({ summary: 'f'.repeat(4001) })],
    ['a non-uuid submitter', edit({ submittedById: 'not-an-id' })],
    ['a missing approver', edit({ approvedById: undefined })],
    ['a timestamp without an offset', edit({ updatedAt: '2026-09-27T00:00:00' })],
    ['an unknown top-level key', edit({ extra: 'x' })],
  ])('rejects %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.get(projectId)).rejects.toThrow('could not be validated')
  })
})

describe.each(clients)('%s publication transition', (_name, client) => {
  it.each(operations)('%s posts the body unchanged and returns the receipt', async (operation) => {
    const controller = new AbortController()
    const body = {
      clientRequestId: requestId,
      expectedRevision: 1,
      summary: 'A fictional summary.',
    }
    fetcher.mockResolvedValueOnce(json(receipt))
    await expect(client.transition(projectId, operation, body, controller.signal)).resolves.toEqual(
      receipt,
    )
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/publication/${operation}`,
    )
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify(body))
    expect(init?.signal).toBe(controller.signal)
  })
  it('refuses a malformed project id before any request', () => {
    expect(() =>
      client.transition('../other', 'submit', { clientRequestId: requestId, expectedRevision: 1 }),
    ).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['an unknown key', { ...receipt, summary: 'x' }],
    ['an unknown state', { ...receipt, state: 'DRAFT' }],
    ['a zero revision', { ...receipt, revision: 0 }],
    ['a missing timestamp', { revision: 2, state: 'APPROVED' }],
  ])('rejects a receipt with %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(
      client.transition(projectId, 'approve', { clientRequestId: requestId, expectedRevision: 1 }),
    ).rejects.toThrow('could not be validated')
  })
})
```


Create `apps/web/src/lib/api/audit.test.ts`:

```ts
import { coreDataClient } from '@/lib/services/core-feature-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { auditClient } from './audit'

const authUserId = '79100000-0000-4000-8000-000000000001'
const organizationId = '79100000-0000-4000-8000-000000000002'
const userId = '79100000-0000-4000-8000-000000000003'
const projectId = '79100000-0000-4000-8000-000000000004'
const rowId = '79100000-0000-4000-8000-000000000005'
const row = {
  id: rowId,
  occurredAt: '2026-09-27T00:00:00.000Z',
  action: 'project.updated',
  entityType: 'Project',
  entityId: projectId,
  projectId,
  actorUserId: userId,
  actorName: 'Synthetic Staff',
}
const page = { rows: [row], nextCursor: null }
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
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

type Client = { list: (cursor?: string, signal?: AbortSignal) => Promise<unknown> }
const clients: readonly (readonly [string, Client])[] = [
  ['coreDataClient', { list: (cursor, signal) => coreDataClient.audit(cursor, signal) }],
  ['auditClient', auditClient],
]

describe.each(clients)('%s audit read', (_name, client) => {
  it.each([
    ['without a cursor', undefined, '/audit'],
    ['with an encoded cursor', 'a b&c=d/e', `/audit?cursor=${encodeURIComponent('a b&c=d/e')}`],
  ])('requests the page %s and returns the parsed rows', async (_label, cursor, suffix) => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json(page))
    await expect(client.list(cursor, controller.signal)).resolves.toEqual(page)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`http://127.0.0.1:4000/api${suffix}`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.signal).toBe(controller.signal)
  })
  it('accepts a full page of 100 rows with null optional fields and a next cursor', async () => {
    const empty = { ...row, entityId: null, projectId: null, actorUserId: null, actorName: null }
    const body = { rows: Array.from({ length: 100 }, () => empty), nextCursor: 'next' }
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.list()).resolves.toEqual(body)
  })
  it.each([
    ['101 rows', { rows: Array.from({ length: 101 }, () => row), nextCursor: null }],
    ['an unknown page key', { ...page, total: 1 }],
    ['a missing next cursor', { rows: [row] }],
    ['a numeric next cursor', { rows: [row], nextCursor: 1 }],
    ['an unknown row key', { rows: [{ ...row, ipAddress: 'synthetic' }], nextCursor: null }],
    ['a non-uuid row id', { rows: [{ ...row, id: 'not-an-id' }], nextCursor: null }],
    ['a non-uuid project id', { rows: [{ ...row, projectId: 'not-an-id' }], nextCursor: null }],
    [
      'a timestamp without an offset',
      { rows: [{ ...row, occurredAt: '2026-09-27' }], nextCursor: null },
    ],
    ['a missing action', { rows: [{ ...row, action: undefined }], nextCursor: null }],
    ['a numeric actor name', { rows: [{ ...row, actorName: 1 }], nextCursor: null }],
  ])('rejects %s', async (_label, body) => {
    fetcher.mockResolvedValueOnce(json(body))
    await expect(client.list()).rejects.toThrow('could not be validated')
  })
})
```


The artifact helpers that stay in `core-feature-client.ts` move to `lib/api/core/artifact-download.ts` in Task 2 (ruling 3). Their download, size, MIME and owner checks are pinned by the cases Task 2 cuts from the old test file, but nothing pins the owner check of `saveCoreArtifact` (the old tests reach it only with a current owner, and the components that call it mock it). One more characterization file pins it against the code that holds it today; it lives where the code goes, imports the old module, and Task 2 repoints its import with the other helper importers:

Create `apps/web/src/lib/api/core/artifact-download.owner.test.ts`:

```ts
import { saveCoreArtifact } from '@/lib/services/core-feature-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: vi.fn() } }),
}))

const click = vi.fn()
const remove = vi.fn()
const append = vi.fn()
const artifact = { blob: new Blob(['synthetic pdf bytes']), fileName: 'report-synthetic.pdf' }
let link: { href: string; download: string; click: typeof click; remove: typeof remove }
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  link = { href: '', download: '', click, remove }
  vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('saving a fetched artifact', () => {
  it('saves the artifact under its name while the owner is current', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    saveCoreArtifact(artifact, () => true)
    expect(link.href).toBe('blob:synthetic')
    expect(link.download).toBe('report-synthetic.pdf')
    expect(append).toHaveBeenCalledWith(link)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
  it('refuses to save once the owner changed, and still removes the link and releases the URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    expect(() => saveCoreArtifact(artifact, () => false)).toThrow('Artifact ownership changed.')
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
})
```


- [ ] **Step 2: Format and run the tests against both clients**

```bash
D=apps/web/src/lib/api
git add -N $D
pnpm exec biome check --write $D/publication.ts $D/audit.ts $D/publication.test.ts $D/audit.test.ts $D/core/artifact-download.owner.test.ts 2>&1 | tail -2
pnpm --filter @pathways/web exec vitest run src/lib/api/publication.test.ts src/lib/api/audit.test.ts src/lib/api/core/artifact-download.owner.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests|Test Files|FAIL|Error"
```


Expected:

```text
Checked 5 files in <ms>. No fixes applied.
 Test Files  3 passed (3)
      Tests  100 passed (100)
```


The 100 tests are the 98 runs of the two tables for both clients (the publication file holds 72 runs and the audit file 26) and the 2 save cases, all passing against the code being replaced. Biome fixes nothing because the files are printed as it formats them.

- [ ] **Step 3: Prove the tests catch a change of the new clients**

`.tmp/s8b/mutate.sh` changes one thing at a time in the new clients (the transition path, the strict object, the snapshot timestamp and the audit page bound) and in the old save helper (its owner check), runs the matching test file and restores the file:

Create `.tmp/s8b/mutate.sh`:

```bash
D=apps/web/src/lib/api
run() { (cd apps/web && timeout 300 pnpm exec vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/lib/api/##'); }
cp $D/publication.ts .tmp/s8b/files/publication.bak
cp $D/audit.ts .tmp/s8b/files/audit.bak
echo "unmutated"; run src/lib/api/publication.test.ts src/lib/api/audit.test.ts
sed -i 's#/publication/${operation}`#/publication/${operation}s`#' $D/publication.ts
echo "transition path changed"; run src/lib/api/publication.test.ts
cp .tmp/s8b/files/publication.bak $D/publication.ts
sed -i '0,/^  .strict()$/s///' $D/publication.ts
echo "strict removed from the publication"; run src/lib/api/publication.test.ts
cp .tmp/s8b/files/publication.bak $D/publication.ts
sed -i 's/publicProjectResponse.omit({ publishedAt: true })/publicProjectResponse/' $D/publication.ts
echo "snapshot keeps the publication timestamp"; run src/lib/api/publication.test.ts
cp .tmp/s8b/files/publication.bak $D/publication.ts
sed -i 's/.max(100)/.max(101)/' $D/audit.ts
echo "audit page bound changed"; run src/lib/api/audit.test.ts
cp .tmp/s8b/files/audit.bak $D/audit.ts
C=apps/web/src/lib/services/core-feature-client.ts
cp $C .tmp/s8b/files/core-feature-client.bak
sed -i '/^    if (!isOwnerCurrent())$/{N;d}' $C
echo "save skips the owner check"; run src/lib/api/core/artifact-download.owner.test.ts
cp .tmp/s8b/files/core-feature-client.bak $C
cmp .tmp/s8b/files/publication.bak $D/publication.ts && echo "publication restored"
cmp .tmp/s8b/files/audit.bak $D/audit.ts && echo "audit restored"
cmp .tmp/s8b/files/core-feature-client.bak $C && echo "core feature client restored"
```


```bash
bash .tmp/s8b/mutate.sh
```


Expected:

```text
unmutated
      Tests  98 passed (98)
 Test Files  2 passed (2)
transition path changed
      Tests  4 failed | 68 passed (72)
publication.test.ts > publicationClient publication transition > approve posts the body unchanged and returns the receipt
publication.test.ts > publicationClient publication transition > publish posts the body unchanged and returns the receipt
publication.test.ts > publicationClient publication transition > submit posts the body unchanged and returns the receipt
publication.test.ts > publicationClient publication transition > withdraw posts the body unchanged and returns the receipt
 Test Files  1 failed (1)
strict removed from the publication
      Tests  2 failed | 70 passed (72)
publication.test.ts > publicationClient publication read > rejects an unknown top-level key
publication.test.ts > publicationClient publication transition > rejects a receipt with an unknown key
 Test Files  1 failed (1)
snapshot keeps the publication timestamp
      Tests  3 failed | 69 passed (72)
publication.test.ts > publicationClient publication read > accepts the largest allowed field lengths
publication.test.ts > publicationClient publication read > rejects a snapshot publication timestamp
publication.test.ts > publicationClient publication read > requests the project publication and returns the parsed row or null
 Test Files  1 failed (1)
audit page bound changed
      Tests  1 failed | 25 passed (26)
audit.test.ts > auditClient audit read > rejects 101 rows
 Test Files  1 failed (1)
save skips the owner check
      Tests  1 failed | 1 passed (2)
core/artifact-download.owner.test.ts > saving a fetched artifact > refuses to save once the owner changed, and still removes the link and releases the URL
 Test Files  1 failed (1)
publication restored
audit restored
core feature client restored
```


Every mutation fails at least one case, and the last three lines say the three files were restored byte for byte. The old client is covered by the same rows: they pass against `coreFeatureClient` and `coreDataClient` in Step 2 before anything moves.

- [ ] **Step 4: Compare the new clients with the members they copy**

The old members and their schemas are cut out of `core-feature-client.ts` as they stand, and `same-lines.mjs` reports every line of them that the two new files do not contain (renaming the client objects and the three method names):

```bash
F=apps/web/src/lib/services/core-feature-client.ts
(sed -n '/^const uuid/,/^export type CoreArtifact/p' $F | sed '$d'; sed -n '/^export const coreFeatureClient/,$p' $F) > .tmp/s8b/files/moved-original.ts
wc -l < .tmp/s8b/files/moved-original.ts
node .tmp/s8b/same-lines.mjs .tmp/s8b/files/moved-original.ts apps/web/src/lib/api/publication.ts apps/web/src/lib/api/audit.ts publicationClient=coreFeatureClient auditClient=coreDataClient "get:=publication:" "transition:=transitionPublication:" "list:=audit:" --list | head -30
```


Expected:

```text
66
lost lines:
.object({ (3 -> 2)
snapshot: z (1 -> 0)
id: uuid, (2 -> 1)
title: z.string().min(1).max(300), (1 -> 0)
code: z.string().max(100), (1 -> 0)
approvedSummary: z.string().min(1).max(4000), (1 -> 0)
area: z.string().max(500).nullable(), (1 -> 0)
sector: z.string().max(300).nullable(), (1 -> 0)
startDate: z.string().nullable(), (1 -> 0)
endDate: z.string().nullable(), (1 -> 0)
}) (3 -> 2)
.strict(), (1 -> 0)
body: { clientRequestId: string; expectedRevision: number; summary?: string }, (1 -> 0)
1x const uuid = z.string().uuid()
1x snapshot: publicProjectResponse.omit({ publishedAt: true }),
1x body: PublicationTransitionRequest,
original lines 65, lost 13, added 3
```


The first line is the length of the old members. The 13 lost lines are the 12 lines of the old inline snapshot object and the old inline body type, which the new files replace with `publicProjectResponse.omit({ publishedAt: true })` and `PublicationTransitionRequest`; the three added lines are those two declarations and the local `uuid` schema. Every other line of the old members is in the new files.

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
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "feat(web): add the publication and audit clients with tests that run against the old and the new client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -5
```


Expected:

```text
Checked 5 files in <ms>. No fixes applied.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1607 files in <ms>. No fixes applied.
 Test Files  304 passed (304)
      Tests  3478 passed (3478)
 apps/web/src/lib/api/audit.ts                      |  27 +++
 .../lib/api/core/artifact-download.owner.test.ts   |  50 ++++++
 apps/web/src/lib/api/publication.test.ts           | 189 +++++++++++++++++++++
 apps/web/src/lib/api/publication.ts                |  39 +++++
 5 files changed, 400 insertions(+)
```


Biome is clean, the typecheck prints its line, and `--noUnusedLocals` lists only the two baseline lines (`forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`). Web is `B_web` plus 3 files and 100 tests: 304 files and 3478 tests.

---

### Task 2: Move the callers and mocks, move the artifact helpers, delete `core-feature-client.ts`, split its tests

**Files:**
- Modify: `apps/web/src/features/public/public-tracker-preview.tsx`, `publication-queue-workspace.tsx`, `apps/web/src/features/settings/audit-log-workspace.tsx` and the three tests that mock them; the 23 files that name the artifact helpers' module (specifier only, the save characterization file of Task 1 among them); `apps/web/src/lib/api/publication.test.ts`, `audit.test.ts`
- Create: `apps/web/src/lib/api/core/artifact-download.ts`, `artifact-download.test.ts`, `owned-json-read.test.ts`, `apps/web/src/test/fixtures/delayed-body.ts`
- Delete: `apps/web/src/lib/services/core-feature-client.ts`, `core-feature-client.test.ts`
- Create (gitignored): `.tmp/s8b/task2-client-cut.json`, `task2-cut.json`, `task2-edits.json`, `titles-before.json`, `titles-after.json`, `before/`, `mutate2.sh`

The old file ends up with the artifact helpers only, so it is deleted and the helpers move to `lib/api/core/artifact-download.ts` (ruling 3). The old test file is cut by script into the three places its cases belong (ruling 5); every case is kept.

- [ ] **Step 1: Keep the originals and the test titles**

```bash
F=apps/web/src
git hash-object $F/lib/services/core-feature-client.ts $F/lib/services/core-feature-client.test.ts | cut -c1-8
cp $F/lib/services/core-feature-client.ts $F/lib/services/core-feature-client.test.ts .tmp/s8b/before/
node .tmp/s8b/test-titles.mjs save .tmp/s8b/titles-before.json $F/lib/services/core-feature-client.test.ts $F/features/public/publication-queue-workspace.test.tsx $F/features/public/public-tracker-preview.test.tsx $F/features/settings/audit-log-workspace.test.tsx 2>&1 | tail -2
```


Expected:

```text
61d107ed
74f8913c
files 4, tests 47, failed 0
```


The hashes are the ones the two cut plans below pin. The titles file holds the 47 tests that Step 4 compares against.

- [ ] **Step 2: Create the cut and edit plans**

`task2-client-cut.json` builds `artifact-download.ts` from lines 2 to 3 and 53 to 154 of `core-feature-client.ts`. `task2-cut.json` builds the three test files and the shared fixture from `core-feature-client.test.ts` and the printed publication test (it keeps the two rows of the old file that read the publication, and the cookie refusal is split into one case per place). `task2-edits.json` holds the exact replacements: the three callers, the three mocks, the characterization tables that now keep only the new client, and the six `coreDataClient.audit(` calls of the owned read tests:

Create `.tmp/s8b/task2-client-cut.json`:

```json
{
 "source": "apps/web/src/lib/services/core-feature-client.ts",
 "hash": "61d107ed",
 "files": {
  "apps/web/src/lib/api/core/artifact-download.ts": [
   [
    2,
    3
   ],
   "",
   [
    53,
    154
   ]
  ]
 }
}
```


Create `.tmp/s8b/task2-cut.json`:

```json
{
 "source": "apps/web/src/lib/services/core-feature-client.test.ts",
 "hash": "74f8913c",
 "files": {
  "apps/web/src/test/fixtures/delayed-body.ts": [
   "import { vi } from 'vitest'",
   "",
   [
    69,
    89
   ]
  ],
  "apps/web/src/lib/api/core/owned-json-read.test.ts": [
   [
    1,
    2
   ],
   "import { delayedBody } from '@/test/fixtures/delayed-body'",
   "",
   [
    4,
    10
   ],
   "",
   "import { auditClient } from '@/lib/api/audit'",
   "",
   [
    14,
    17
   ],
   [
    39,
    41
   ],
   "",
   [
    42,
    67
   ],
   "",
   "describe('Owned JSON read boundaries', () => {",
   [
    114,
    121
   ],
   "  it('refuses reads without a workspace cookie before dispatch', async () => {",
   "    document.cookie = ''",
   "    await expect(coreDataClient.audit()).rejects.toThrow('Current workspace access')",
   "    expect(fetcher).not.toHaveBeenCalled()",
   "  })",
   [
    130,
    187
   ]
  ],
  "apps/web/src/lib/api/core/artifact-download.test.ts": [
   [
    2,
    2
   ],
   "import { delayedBody } from '@/test/fixtures/delayed-body'",
   "",
   [
    4,
    10
   ],
   "",
   "import { downloadCoreArtifact } from './artifact-download'",
   "",
   [
    14,
    18
   ],
   "",
   [
    42,
    67
   ],
   "",
   [
    189,
    189
   ],
   "  it('refuses downloads without a workspace cookie before dispatch', async () => {",
   "    document.cookie = ''",
   "    await expect(",
   "      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),",
   "    ).rejects.toThrow('Current artifact access')",
   "    expect(fetcher).not.toHaveBeenCalled()",
   "  })",
   [
    190,
    294
   ]
  ],
  "apps/web/src/lib/api/publication.test.ts": [
   {
    "file": "apps/web/src/lib/api/publication.test.ts",
    "from": 1
   },
   "",
   "describe('publicationClient request and strict response boundaries', () => {",
   [
    92,
    113
   ],
   "})"
  ]
 }
}
```


Create `.tmp/s8b/task2-edits.json`:

```json
[
 [
  "apps/web/src/features/public/public-tracker-preview.tsx",
  "import { coreFeatureClient } from '@/lib/services/core-feature-client'",
  "import { publicationClient } from '@/lib/api/publication'",
  1
 ],
 [
  "apps/web/src/features/public/public-tracker-preview.tsx",
  "coreFeatureClient.publication(projectId, signal)",
  "publicationClient.get(projectId, signal)",
  1
 ],
 [
  "apps/web/src/features/public/publication-queue-workspace.tsx",
  "import { coreFeatureClient } from '@/lib/services/core-feature-client'",
  "import { publicationClient } from '@/lib/api/publication'",
  1
 ],
 [
  "apps/web/src/features/public/publication-queue-workspace.tsx",
  "coreFeatureClient.publication(id ?? '', signal)",
  "publicationClient.get(id ?? '', signal)",
  1
 ],
 [
  "apps/web/src/features/public/publication-queue-workspace.tsx",
  "coreFeatureClient.transitionPublication(id, operation, {",
  "publicationClient.transition(id, operation, {",
  1
 ],
 [
  "apps/web/src/features/settings/audit-log-workspace.tsx",
  "import { coreDataClient } from '@/lib/services/core-feature-client'",
  "import { auditClient } from '@/lib/api/audit'",
  1
 ],
 [
  "apps/web/src/features/settings/audit-log-workspace.tsx",
  "coreDataClient.audit(cursor, signal)",
  "auditClient.list(cursor, signal)",
  1
 ],
 [
  "apps/web/src/features/public/public-tracker-preview.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({ coreFeatureClient: {} }))",
  "vi.mock('@/lib/api/publication', () => ({ publicationClient: {} }))",
  1
 ],
 [
  "apps/web/src/features/public/publication-queue-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({\n  coreFeatureClient: {\n    transitionPublication: (...args: unknown[]) => state.transition(...args),\n  },\n}))",
  "vi.mock('@/lib/api/publication', () => ({\n  publicationClient: {\n    transition: (...args: unknown[]) => state.transition(...args),\n  },\n}))",
  1
 ],
 [
  "apps/web/src/features/settings/audit-log-workspace.test.tsx",
  "vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: { audit: vi.fn() } }))",
  "vi.mock('@/lib/api/audit', () => ({ auditClient: { list: vi.fn() } }))",
  1
 ],
 [
  "apps/web/src/lib/api/publication.test.ts",
  "import { coreFeatureClient } from '@/lib/services/core-feature-client'\n",
  "",
  1
 ],
 [
  "apps/web/src/lib/api/publication.test.ts",
  "type Client = {\n  get: (id: string, signal?: AbortSignal) => Promise<unknown>\n  transition: (\n    id: string,\n    operation: Operation,\n    body: { clientRequestId: string; expectedRevision: number; summary?: string },\n    signal?: AbortSignal,\n  ) => Promise<unknown>\n}\nconst clients: readonly (readonly [string, Client])[] = [\n  [\n    'coreFeatureClient',\n    {\n      get: (id, signal) => coreFeatureClient.publication(id, signal),\n      transition: (id, operation, body, signal) =>\n        coreFeatureClient.transitionPublication(id, operation, body, signal),\n    },\n  ],\n  ['publicationClient', publicationClient],\n]\n",
  "",
  1
 ],
 [
  "apps/web/src/lib/api/publication.test.ts",
  "describe.each(clients)('%s publication read', (_name, client) => {",
  "describe('publicationClient publication read', () => {\n  const client = publicationClient",
  1
 ],
 [
  "apps/web/src/lib/api/publication.test.ts",
  "describe.each(clients)('%s publication transition', (_name, client) => {",
  "describe('publicationClient publication transition', () => {\n  const client = publicationClient",
  1
 ],
 [
  "apps/web/src/lib/api/publication.test.ts",
  "coreFeatureClient.publication(projectId)",
  "publicationClient.get(projectId)",
  3
 ],
 [
  "apps/web/src/lib/api/audit.test.ts",
  "import { coreDataClient } from '@/lib/services/core-feature-client'\n",
  "",
  1
 ],
 [
  "apps/web/src/lib/api/audit.test.ts",
  "type Client = { list: (cursor?: string, signal?: AbortSignal) => Promise<unknown> }\nconst clients: readonly (readonly [string, Client])[] = [\n  ['coreDataClient', { list: (cursor, signal) => coreDataClient.audit(cursor, signal) }],\n  ['auditClient', auditClient],\n]\n\n",
  "",
  1
 ],
 [
  "apps/web/src/lib/api/audit.test.ts",
  "describe.each(clients)('%s audit read', (_name, client) => {",
  "describe('auditClient audit read', () => {\n  const client = auditClient",
  1
 ],
 [
  "apps/web/src/lib/api/core/owned-json-read.test.ts",
  "coreDataClient.audit(",
  "auditClient.list(",
  6
 ]
]
```


- [ ] **Step 3: Apply the plans and repoint the helper importers**

```bash
node .tmp/s8b/cut.mjs .tmp/s8b/task2-client-cut.json
node .tmp/s8b/cut.mjs .tmp/s8b/task2-cut.json
sed -i 's/^function delayedBody/export function delayedBody/' apps/web/src/test/fixtures/delayed-body.ts
git rm -q apps/web/src/lib/services/core-feature-client.ts apps/web/src/lib/services/core-feature-client.test.ts
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task2-edits.json
git grep -n "core-feature-client" -- apps | grep -v "'@/lib/services/core-feature-client'" | wc -l
git grep -l "'@/lib/services/core-feature-client'" -- apps | wc -l
git grep -l "'@/lib/services/core-feature-client'" -- apps | xargs sed -i "s#'@/lib/services/core-feature-client'#'@/lib/api/core/artifact-download'#g"
git grep -n "core-feature-client" -- apps packages scripts | wc -l
git grep -l "lib/api/core/artifact-download" -- apps | wc -l
```


Expected:

```text
apps/web/src/lib/api/core/artifact-download.ts: 105 lines
apps/web/src/test/fixtures/delayed-body.ts: 23 lines
apps/web/src/lib/api/core/owned-json-read.test.ts: 121 lines
apps/web/src/lib/api/core/artifact-download.test.ts: 159 lines
apps/web/src/lib/api/publication.test.ts: 214 lines
19 replacements in 9 files
0
23
0
23
```


`cut.mjs` stops before writing anything when a source hash differs, and prints the lines of each file it wrote. The four counts are: mentions of `core-feature-client` that are not a plain import specifier (none), files with the plain specifier (23: 7 production importers, the analytics test fixture, 14 tests whose mocks of `downloadCoreArtifact`, `saveCoreArtifact` or `fetchCoreArtifact` name the module the code under test imports, and the save characterization file of Task 1), mentions of the old name left after the `sed` (none) and files that now name `lib/api/core/artifact-download` (23).

- [ ] **Step 4: Tidy imports, prove the moved lines and the kept cases**

```bash
A=apps/web/src/lib/api
node .tmp/s8b/trim-imports.mjs $A/core/artifact-download.ts $A/core/artifact-download.test.ts $A/core/owned-json-read.test.ts $A/publication.test.ts $A/audit.test.ts apps/web/src/test/fixtures/delayed-body.ts | cut -c1-120
node .tmp/s8b/same-lines.mjs .tmp/s8b/before/core-feature-client.ts $A/core/artifact-download.ts $A/publication.ts $A/audit.ts publicationClient=coreFeatureClient auditClient=coreDataClient "get:=publication:" "transition:=transitionPublication:" "list:=audit:" --list > .tmp/s8b/out/t2-same.txt
head -16 .tmp/s8b/out/t2-same.txt
tail -1 .tmp/s8b/out/t2-same.txt
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD apps/web/src) 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
node .tmp/s8b/test-titles.mjs save .tmp/s8b/titles-after.json $A/core/artifact-download.test.ts $A/core/owned-json-read.test.ts $A/publication.test.ts $A/audit.test.ts apps/web/src/features/public/publication-queue-workspace.test.tsx apps/web/src/features/public/public-tracker-preview.test.tsx apps/web/src/features/settings/audit-log-workspace.test.tsx 2>&1 | tail -2
node .tmp/s8b/test-titles.mjs compare .tmp/s8b/titles-before.json .tmp/s8b/titles-after.json --allow "refuses reads and downloads without a workspace cookie before dispatch"
node .tmp/s8b/count-it.mjs .tmp/s8b/before/core-feature-client.test.ts $A/core/artifact-download.test.ts $A/core/owned-json-read.test.ts | tail -4
sed -n 92,113p .tmp/s8b/before/core-feature-client.test.ts > .tmp/s8b/files/moved-rows.ts
node .tmp/s8b/count-it.mjs .tmp/s8b/files/moved-rows.ts | tail -1
node .tmp/s8b/mock-scan.mjs lib/services/core-feature-client coreFeatureClient coreDataClient downloadCoreArtifact
git grep -nE "coreFeatureClient|coreDataClient|core-feature-client" -- apps packages scripts | wc -l
```


Expected:

```text
apps/web/src/lib/api/core/artifact-download.ts: removed nothing
apps/web/src/lib/api/core/artifact-download.test.ts: removed nothing
apps/web/src/lib/api/core/owned-json-read.test.ts: removed nothing
apps/web/src/lib/api/publication.test.ts: removed nothing
apps/web/src/lib/api/audit.test.ts: removed nothing
apps/web/src/test/fixtures/delayed-body.ts: removed nothing
lost lines:
.object({ (3 -> 2)
snapshot: z (1 -> 0)
id: uuid, (2 -> 1)
title: z.string().min(1).max(300), (1 -> 0)
code: z.string().max(100), (1 -> 0)
approvedSummary: z.string().min(1).max(4000), (1 -> 0)
area: z.string().max(500).nullable(), (1 -> 0)
sector: z.string().max(300).nullable(), (1 -> 0)
startDate: z.string().nullable(), (1 -> 0)
endDate: z.string().nullable(), (1 -> 0)
}) (3 -> 2)
.strict(), (1 -> 0)
body: { clientRequestId: string; expectedRevision: number; summary?: string }, (1 -> 0)
1x const uuid = z.string().uuid()
1x snapshot: publicProjectResponse.omit({ publishedAt: true }),
original lines 164, lost 13, added 3
Checked 35 files in <ms>. Fixed 8 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
files 7, tests 97, failed 0
before 47, after 97, lost 0, added 49
.tmp/s8b/before/core-feature-client.test.ts: it 15, describe 2, expect 53
apps/web/src/lib/api/core/artifact-download.test.ts: it 8, describe 1, expect 32
apps/web/src/lib/api/core/owned-json-read.test.ts: it 6, describe 1, expect 19
total: it 29, describe 4, expect 104
total: it 2, describe 0, expect 3
factories 0, naming 0
0
```


`trim-imports` removes nothing because the cut files were written clean. The `same-lines` proof ends with `lost 13, added 3` for the 164 lines of the old file: the same 13 lines of the old inline snapshot and body type as in Task 1, now counted over the helpers too, so nothing else is missing from `artifact-download.ts`, `publication.ts` and `audit.ts` together. Biome rewraps 8 files and the typecheck is clean with the two baseline lines. The titles compare says `lost 0`: the 47 titles before are all in the 97 after (the one allowed title is the cookie case, now two), and `added 49` are the new client rows. The old test file had 15 `it` blocks; the two files cut from it hold 8 and 6, and the two publication rows (2 more) went to `publication.test.ts`, which makes 16 (the cookie case is two). The last two lines say that no mock factory and no file names `coreFeatureClient`, `coreDataClient` or `core-feature-client` any more.

- [ ] **Step 4b: Prove the moved tests pin the moved helpers and the owned read**

The cut test files now run against `lib/api/core/artifact-download.ts` and, through `auditClient.list`, against `ownedJsonRead`. `mutate2.sh` changes one check at a time in those two modules (the artifact size cap, MIME check, owner recheck after the response, the save owner check and the object URL release; the read size cap and MIME check), runs the three core test files and restores each file:

Create `.tmp/s8b/mutate2.sh`:

```bash
A=apps/web/src/lib/api/core
D=$A/artifact-download.ts
O=$A/owned-json-read.ts
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/lib/api/core/artifact-download.test.ts src/lib/api/core/artifact-download.owner.test.ts src/lib/api/core/owned-json-read.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/lib/api/core/##'); }
# Replaces one exact text in a file, failing when it is not found exactly once.
swap() { node -e "const fs=require('fs');const [f,a,b]=process.argv.slice(1);const t=fs.readFileSync(f,'utf8');if(t.split(a).length!==2)throw new Error('not unique: '+a);fs.writeFileSync(f,t.replace(a,b))" "$@"; }
mkdir -p .tmp/s8b/files
for f in $D $O; do cp $f .tmp/s8b/files/$(basename $f).bak; done
restore() { for f in $D $O; do cp .tmp/s8b/files/$(basename $f).bak $f; done; }
echo "unmutated"; run
swap $D "if (count > 10485760 || !current())" "if (count > 20971520 || !current())"
echo "artifact size cap raised"; run; restore
swap $D "    !mime ||
    ![" "    !mime ||
    false && !["
echo "artifact MIME not checked"; run; restore
swap $D "  if (!current() || !response.body) {" "  if (!response.body) {"
echo "artifact owner not rechecked after the response"; run; restore
swap $D "    if (!isOwnerCurrent())
      throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
" ""
echo "save skips the owner check"; run; restore
swap $D "setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)" "void objectUrl"
echo "object URL never released"; run; restore
swap $O "if (size > 2_000_000 || !current())" "if (size > 4_000_000 || !current())"
echo "read size cap raised"; run; restore
swap $O "!current() || !response.headers.get('Content-Type')?.startsWith('application/json')" "!current()"
echo "read MIME not checked"; run; restore
for f in $D $O; do cmp .tmp/s8b/files/$(basename $f).bak $f; done && echo "both restored"
```


```bash
bash .tmp/s8b/mutate2.sh
```


Expected:

```text
unmutated
      Tests  20 passed (20)
 Test Files  3 passed (3)
artifact size cap raised
      Tests  1 failed | 19 passed (20)
artifact-download.test.ts > owned private artifact delivery > cancels artifacts exceeding 10 MiB and never saves them
 Test Files  1 failed | 2 passed (3)
artifact MIME not checked
      Tests  1 failed | 19 passed (20)
artifact-download.test.ts > owned private artifact delivery > rejects an unapproved MIME before saving
 Test Files  1 failed | 2 passed (3)
artifact owner not rechecked after the response
      Tests  1 failed | 19 passed (20)
artifact-download.test.ts > owned private artifact delivery > rejects ownership loss before transport completion without creating a download
 Test Files  1 failed | 2 passed (3)
save skips the owner check
      Tests  1 failed | 19 passed (20)
artifact-download.owner.test.ts > saving a fetched artifact > refuses to save once the owner changed, and still removes the link and releases the URL
 Test Files  1 failed | 2 passed (3)
object URL never released
      Tests  3 failed | 17 passed (20)
artifact-download.owner.test.ts > saving a fetched artifact > refuses to save once the owner changed, and still removes the link and releases the URL
artifact-download.owner.test.ts > saving a fetched artifact > saves the artifact under its name while the owner is current
artifact-download.test.ts > owned private artifact delivery > saves valid current bytes with the server MIME extension and releases the object URL
 Test Files  2 failed | 1 passed (3)
read size cap raised
      Tests  1 failed | 19 passed (20)
owned-json-read.test.ts > Owned JSON read boundaries > cancels an oversized JSON body before parsing or accepting it
 Test Files  1 failed | 2 passed (3)
read MIME not checked
      Tests  1 failed | 19 passed (20)
owned-json-read.test.ts > Owned JSON read boundaries > cancels an unexpected JSON response MIME before body parsing
 Test Files  1 failed | 2 passed (3)
both restored
```


Each mutation fails the case that pins the check it removes, and the last line says both files were restored. The owned read also rechecks the owner once after the last chunk; no test reaches that line apart from the per-chunk check (a mutation that drops it survives), and S8b does not move `ownedJsonRead`, so it is left as it is and recorded in the change record.

- [ ] **Step 5: Run the whole web suite and commit**

```bash
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git status --short | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the publication and audit callers to their clients and the artifact helpers to lib/api/core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
 Test Files  305 passed (305)
      Tests  3430 passed (3430)
$ pnpm exec biome check .
Checked 1609 files in <ms>. No fixes applied.
2
 35 files changed, 218 insertions(+), 280 deletions(-)
```


Web is 305 files and 3430 tests: `B_web` plus 4 files (the two new client tests, the save test of Task 1, the two core tests cut from the old file, less the deleted old test) and 52 more tests than `B_web`, since the 98 new runs lose the rows that ran the old client and the old file's cases reappear in the cut files. The `grep -c` line counts the renames git detects (2).

---

### Task 3: Lay out `features/auth`, `profile`, `public` and `settings` and give each a public index

**Files:**
- Move (`git mv`, 46 files): the files listed in `layout-map.json` below
- Create: `apps/web/src/features/{auth,profile,public,settings}/index.ts`
- Modify: the imports of the moved files and of their importers (by `move-modules.mjs`), 20 app route files (by `index-imports.mjs`), `apps/web/src/features/profile/own-profile.schema.ts`, `apps/web/e2e/mfa-access.spec.ts`, `apps/web/e2e/password-login.spec.ts`, `apps/web/src/lib/rbac/auth-navigation.contract.test.ts`, `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`
- Create (gitignored): `.tmp/s8b/layout-map.json`, `task3-edits.json`, `routes-prelayout.txt`, `routes-layout.txt`

The move is one commit that renames files and rewrites specifiers, and nothing else: the splits come after it, in their own commits, so a reviewer can compare renames and edits separately.

- [ ] **Step 1: Measure the build before the layout move**

Tasks 1 and 2 already changed what the shared chunks hold, so the route sizes of the Task 0 build are not the reference for the move. Build now and compare with the Task 0 table:

```bash
.tmp/s8b/build-routes.sh prelayout
git checkout -- apps/web/next-env.d.ts
node .tmp/s8b/compare-routes.mjs .tmp/s8b/routes-baseline.txt .tmp/s8b/routes-prelayout.txt
```


Expected:

```text
exit 0
ƒ Middleware                                                      <n> kB
Middleware equals M0
/analytics: <n> kB -> <n> kB (-1.0)
/collection: <n> kB -> <n> kB (-1.0)
/collection/forms: <n> kB -> <n> kB (-1.0)
/collection/forms/new: <n> kB -> <n> kB (-1.0)
/collection/projects/[projectId]/forms/[formId]: <n> kB -> <n> kB (-1.0)
/dashboard: <n> kB -> <n> kB (+1.0)
/projects/[projectId]/activities: <n> kB -> <n> kB (-1.0)
/reports: <n> kB -> <n> kB (-1.0)
/reports/beneficiary-summary: <n> kB -> <n> kB (-1.0)
/reports/indicator-summary: <n> kB -> <n> kB (-1.0)
/reports/preview: <n> kB -> <n> kB (-1.0)
/reports/project-summary: <n> kB -> <n> kB (-1.0)
/reports/survey-results: <n> kB -> <n> kB (-1.0)
/settings/audit: <n> kB -> <n> kB (-1.0)
/transparency: <n> kB -> <n> kB (-1.0)
routes 72, different 15
```


Middleware equals `M0`. In the replay 14 of the 72 routes are 1 kB smaller than at Task 0 (the analytics, collection, reports, project activities, audit log and transparency routes, whose shared chunks lost code that only the publication, audit and artifact callers used) and `/dashboard` is 1 kB bigger, inside the bound. The routes that move by 1 kB and the `different` count depend on the slices below and on how the checkout rounds (the same replay without `apps/web/.env.local` listed 13, without `/transparency` and the activities route), so the pass criterion is: no route more than 1 kB bigger than the Task 0 table, and Middleware at `M0`.

- [ ] **Step 2: Create the move map, the edits and the four indexes**

`layout-map.json` lists every move (paths are relative to `apps/web/src`). Test files follow the file they test. Four files are renamed by CR 3.5: `account-access-validation` to `auth.schema`, `login-validation` to `login.schema`, `own-profile-contract` to `own-profile.schema` and `user-management-utils` to `settings.utils`. `signin-request.ts` and `own-password-operation.ts` stay beside their folders' schema files because they are request helpers that no suffix names (S7a kept `rule-templates.ts` the same way):

Create `.tmp/s8b/layout-map.json`:

```json
{
 "features/auth/access-recovery.tsx": "features/auth/components/access-recovery.tsx",
 "features/auth/account-recovery-workspace.tsx": "features/auth/components/account-recovery-workspace.tsx",
 "features/auth/login-form.tsx": "features/auth/components/login-form.tsx",
 "features/auth/mfa-form.tsx": "features/auth/components/mfa-form.tsx",
 "features/auth/password-recovery-request-form.tsx": "features/auth/components/password-recovery-request-form.tsx",
 "features/auth/password-update-form.tsx": "features/auth/components/password-update-form.tsx",
 "features/auth/reset-password-workspace.tsx": "features/auth/components/reset-password-workspace.tsx",
 "features/auth/staff-auth-frame.tsx": "features/auth/components/staff-auth-frame.tsx",
 "features/auth/mfa-form.test.tsx": "features/auth/components/mfa-form.test.tsx",
 "features/auth/account-access-validation.ts": "features/auth/auth.schema.ts",
 "features/auth/account-access-validation.test.ts": "features/auth/auth.schema.test.ts",
 "features/auth/login-validation.ts": "features/auth/login.schema.ts",
 "features/auth/login-validation.test.ts": "features/auth/login.schema.test.ts",
 "features/profile/own-password-dialog.tsx": "features/profile/components/own-password-dialog.tsx",
 "features/profile/own-password-form.tsx": "features/profile/components/own-password-form.tsx",
 "features/profile/own-password-form.test.tsx": "features/profile/components/own-password-form.test.tsx",
 "features/profile/own-profile-workspace.tsx": "features/profile/components/own-profile-workspace.tsx",
 "features/profile/own-profile-workspace.test.tsx": "features/profile/components/own-profile-workspace.test.tsx",
 "features/profile/own-step-up-pin-form.tsx": "features/profile/components/own-step-up-pin-form.tsx",
 "features/profile/own-step-up-pin-form.test.tsx": "features/profile/components/own-step-up-pin-form.test.tsx",
 "features/profile/own-profile-contract.ts": "features/profile/own-profile.schema.ts",
 "features/public/public-about.tsx": "features/public/components/public-about.tsx",
 "features/public/public-contact-form.test.tsx": "features/public/components/public-contact-form.test.tsx",
 "features/public/public-contact-form.tsx": "features/public/components/public-contact-form.tsx",
 "features/public/public-journey-content.tsx": "features/public/components/public-journey-content.tsx",
 "features/public/public-journey.test.tsx": "features/public/components/public-journey.test.tsx",
 "features/public/public-journey.tsx": "features/public/components/public-journey.tsx",
 "features/public/public-landing.tsx": "features/public/components/public-landing.tsx",
 "features/public/public-motion.tsx": "features/public/components/public-motion.tsx",
 "features/public/public-organizations.test.tsx": "features/public/components/public-organizations.test.tsx",
 "features/public/public-organizations.tsx": "features/public/components/public-organizations.tsx",
 "features/public/public-sections.tsx": "features/public/components/public-sections.tsx",
 "features/public/public-tracker-preview.test.tsx": "features/public/components/public-tracker-preview.test.tsx",
 "features/public/public-tracker-preview.tsx": "features/public/components/public-tracker-preview.tsx",
 "features/public/public-tracker-view.test.tsx": "features/public/components/public-tracker-view.test.tsx",
 "features/public/public-tracker-view.tsx": "features/public/components/public-tracker-view.tsx",
 "features/public/publication-queue-workspace.test.tsx": "features/public/components/publication-queue-workspace.test.tsx",
 "features/public/publication-queue-workspace.tsx": "features/public/components/publication-queue-workspace.tsx",
 "features/settings/audit-log-workspace.tsx": "features/settings/components/audit-log-workspace.tsx",
 "features/settings/audit-log-workspace.test.tsx": "features/settings/components/audit-log-workspace.test.tsx",
 "features/settings/backup-recovery-workspace.tsx": "features/settings/components/backup-recovery-workspace.tsx",
 "features/settings/backup-recovery-workspace.test.tsx": "features/settings/components/backup-recovery-workspace.test.tsx",
 "features/settings/user-management-workspace.tsx": "features/settings/components/user-management-workspace.tsx",
 "features/settings/user-management-workspace.test.tsx": "features/settings/components/user-management-workspace.test.tsx",
 "features/settings/user-management-utils.ts": "features/settings/settings.utils.ts",
 "features/settings/user-management-utils.test.ts": "features/settings/settings.utils.test.ts"
}
```


`task3-edits.json` holds the exact replacements that no move rewrites: the profile schema imports `strongPasswordSchema` from the auth index, the two e2e specs and the auth contract test name the moved forms by path, and the import direction test used a settings leaf as its example of an unindexed feature, which is now indexed, so it uses `@/features/unlisted/example`, a feature with no folder (ruling 10):

Create `.tmp/s8b/task3-edits.json`:

```json
[
 [
  "apps/web/src/features/profile/own-profile.schema.ts",
  "from '@/features/auth/auth.schema'",
  "from '@/features/auth'",
  1
 ],
 [
  "apps/web/e2e/mfa-access.spec.ts",
  "'../src/features/auth/mfa-form'",
  "'../src/features/auth/components/mfa-form'",
  1
 ],
 [
  "apps/web/e2e/password-login.spec.ts",
  "'../src/features/auth/login-form'",
  "'../src/features/auth/components/login-form'",
  1
 ],
 [
  "apps/web/src/lib/rbac/auth-navigation.contract.test.ts",
  "source('features/auth/access-recovery.tsx')",
  "source('features/auth/components/access-recovery.tsx')",
  1
 ],
 [
  "apps/web/src/lib/rbac/auth-navigation.contract.test.ts",
  "source('features/auth/mfa-form.tsx')",
  "source('features/auth/components/mfa-form.tsx')",
  1
 ],
 [
  "apps/web/src/import-direction.test.ts",
  "'@/features/settings/components/audit-log-workspace'",
  "'@/features/unlisted/example'",
  1
 ]
]
```


The four indexes list the exports the app routes and the profile schema use, by their leaf paths:

Create `apps/web/src/features/auth/index.ts`:

```ts
// Public surface of the auth feature for files outside it.
export { AccessRecovery } from './components/access-recovery'
export { AccountRecoveryWorkspace } from './components/account-recovery-workspace'
export { LoginForm } from './components/login-form'
export { MfaForm } from './components/mfa-form'
export { PasswordRecoveryRequestForm } from './components/password-recovery-request-form'
export { PasswordUpdateForm } from './components/password-update-form'
export { ResetPasswordWorkspace } from './components/reset-password-workspace'
export { StaffAuthFrame } from './components/staff-auth-frame'
// Shared with the own password form of the profile feature.
export { strongPasswordSchema } from './auth.schema'
```


Create `apps/web/src/features/profile/index.ts`:

```ts
// Public surface of the profile feature for files outside it.
export { OwnProfileWorkspace } from './components/own-profile-workspace'
```


Create `apps/web/src/features/public/index.ts`:

```ts
// Public surface of the public feature for files outside it.
export { PublicAboutPage } from './components/public-about'
export { PublicLandingPage } from './components/public-landing'
export { PublicOrganizationPage, PublicOrganizationsPage } from './components/public-organizations'
export { PublicTrackerPreview } from './components/public-tracker-preview'
export {
  PublicTrackerDetail,
  PublicTrackerList,
  PublicTrackerUnavailable,
} from './components/public-tracker-view'
export { PublicationQueueWorkspace } from './components/publication-queue-workspace'
```


Create `apps/web/src/features/settings/index.ts`:

```ts
// Public surface of the settings feature for files outside it.
export { AuditLogWorkspace } from './components/audit-log-workspace'
export { BackupRecoveryWorkspace } from './components/backup-recovery-workspace'
export { UserManagementWorkspace } from './components/user-management-workspace'
```


- [ ] **Step 3: Move, rewrite and register the indexed features**

```bash
node .tmp/s8b/move-modules.mjs .tmp/s8b/layout-map.json > .tmp/s8b/out/t3-move.txt
tail -1 .tmp/s8b/out/t3-move.txt
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task3-edits.json
node .tmp/s8b/index-imports.mjs auth profile public settings
sed -i "s#^const indexedFeatures: readonly string\[\] = \[#&'auth', 'profile', 'public', 'settings', #" apps/web/src/import-direction.test.ts
sed -i "s#optimizePackageImports: \[#&'@/features/auth', '@/features/profile', '@/features/public', '@/features/settings', #" apps/web/next.config.ts
git add -N apps
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -2
git diff HEAD -- apps/web/next.config.ts apps/web/src/import-direction.test.ts | grep "^[+-]" | grep -v "^+++\|^---"
```


Expected:

```text
moved 46 files, rewrote 38 specifiers and 1 contract paths
6 replacements in 5 files
21 leaf imports in 20 app files now name a feature index
Checked 76 files in <ms>. Fixed 4 files.
+        '@/features/auth',
+        '@/features/profile',
+        '@/features/public',
+        '@/features/settings',
+  'auth',
+  'profile',
+  'public',
+  'settings',
-      "import { f } from '@/features/settings/audit-log-workspace'",
+      "import { f } from '@/features/unlisted/example'",
```


The move prints how many files it moved and how many specifiers (including `vi.mock` paths and `typeof import` types) and contract-test paths it rewrote; the index step prints how many leaf imports in how many app files now name a feature index, and it stops if an app file imports a leaf of those features as a default import or with `import type`. Biome fixes four files (it wraps the two lists, and sorts or wraps imports in two more). `task3-edits.json` made 6 replacements in 5 files. The last lines show the two lists: `indexedFeatures` and `optimizePackageImports` gain the four features.

- [ ] **Step 4: Check the move**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git grep -nE "features/(auth|profile|public|settings)/" -- apps/web/src ':!apps/web/src/features' | cut -c1-150
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1613 files in <ms>. No fixes applied.
apps/web/src/import-direction.test.ts:96:      "import { a } from '@/features/auth/a'",
apps/web/src/import-direction.test.ts:97:      "import type { B } from '../../features/profile/b'",
apps/web/src/lib/rbac/auth-navigation.contract.test.ts:37:    const recovery = source('features/auth/components/access-recovery.tsx')
apps/web/src/lib/rbac/auth-navigation.contract.test.ts:42:    const form = source('features/auth/components/mfa-form.tsx')
 Test Files  305 passed (305)
      Tests  3430 passed (3430)
```


The `git grep` prints four lines and no import: two are string fixtures of `import-direction.test.ts` (the leaf-import cases that must be refused) and two are the `source('features/auth/components/...')` paths of the auth contract test, which `move-modules.mjs` rewrote to the new layout. No file outside the four folders imports a leaf path of them. Web keeps the Task 2 figures, 305 files and 3430 tests, because the move adds and removes no test.

- [ ] **Step 5: Compare the route sizes and commit**

```bash
.tmp/s8b/build-routes.sh layout
git checkout -- apps/web/next-env.d.ts
node .tmp/s8b/compare-routes.mjs .tmp/s8b/routes-prelayout.txt .tmp/s8b/routes-layout.txt
node .tmp/s8b/compare-routes.mjs .tmp/s8b/routes-baseline.txt .tmp/s8b/routes-layout.txt | tail -1
git add -A apps
git status --short | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): give auth, profile, public and settings a feature layout and a public index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
exit 0
ƒ Middleware                                                      <n> kB
Middleware equals M0
routes 72, different 0
routes 72, different 15
46
 76 files changed, 79 insertions(+), 47 deletions(-)
```


The first compare prints `different 0`: the move changed no route (a route page that now imports an index must not load a barrel; the `optimizePackageImports` entries keep it from doing so). The second line repeats the Task 0 comparison, which still counts the Step 1 differences. Middleware stays at `M0`. The `R` count is the 46 renames.

---

### Task 4: Split `user-management-workspace.tsx` into hooks and sections

**Files:**
- Create: `apps/web/src/features/settings/hooks/use-user-directory.ts`, `hooks/use-user-editor.ts`, `components/account-metric.tsx`, `components/user-account-row.tsx`, `components/user-editor-dialog.tsx`, `components/user-detail-dialog.tsx`, `apps/web/src/features/settings/components/user-management-workspace.actions.test.tsx`, `apps/web/src/test/fixtures/user-management-fixtures.ts`
- Modify: `apps/web/src/features/settings/components/user-management-workspace.tsx` (938 lines to 344), `components/user-management-workspace.test.tsx`, `apps/web/src/features/settings/settings.utils.ts`
- Create (gitignored): `.tmp/s8b/task4a-cut.json`, `task4-cut.json`, `task4-edits.json`, `mutate4.sh`, `before/user-management-workspace.tsx`, `before/settings.utils.ts`, `before/user-management-workspace.test.tsx`

Two commits: the first pins the behavior the split must keep (ruling 6), the second moves the code.

- [ ] **Step 1: Share the select stand-in and pin the user management behavior**

The existing test (9 cases) pins only the create dialog. `user-management-workspace.actions.test.tsx` adds 21 cases for the account list and its counts, the search and status filters and the empty state, the detail dialog, the edit dialog and its save, the deactivation and reactivation requests, and the load failure with its retry. It uses the fictional users and ids of the existing test (`Ada Lovelace`, `ada@example.test`). The select stand-in and the two fixtures of the existing test move into `test/fixtures/user-management-fixtures.ts` so that both test files use one copy:

Create `.tmp/s8b/task4a-cut.json`:

```json
{
 "source": "apps/web/src/features/settings/components/user-management-workspace.test.tsx",
 "hash": "a2f56ec5",
 "files": {
  "apps/web/src/test/fixtures/user-management-fixtures.ts": [
   "import type { ChangeEvent, ReactNode } from 'react'",
   "",
   "// A native select that stands in for the Radix select by reading its options from the SelectItem children.",
   "export async function selectMock() {",
   [
    10,
    55
   ],
   "}",
   "",
   [
    58,
    70
   ],
   "",
   [
    72,
    74
   ]
  ],
  "apps/web/src/features/settings/components/user-management-workspace.test.tsx": [
   [
    1,
    3
   ],
   [
    5,
    8
   ],
   "import { baseUser, projectManagerProfile } from '@/test/fixtures/user-management-fixtures'",
   "",
   "vi.mock('@/components/ui/select', async () =>",
   "  (await import('@/test/fixtures/user-management-fixtures')).selectMock(),",
   ")",
   "",
   [
    75,
    307
   ]
  ]
 }
}
```


Create `apps/web/src/features/settings/components/user-management-workspace.actions.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { baseUser, projectManagerProfile } from '@/test/fixtures/user-management-fixtures'
import { UserManagementWorkspace } from './user-management-workspace'

vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/user-management-fixtures')).selectMock(),
)
// Radix menus are replaced by always-open lists, since jsdom lacks the pointer APIs they need.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
}))

let currentRole: {
  role: string | null
  profile: { permissions: string[] } | null
  assignedProjectIds: readonly string[]
}
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => currentRole }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleUserManagement: 'User Management' } }),
}))

const getUsers = vi.fn()
const getProjects = vi.fn()
const authorizeExistingUser = vi.fn()
const updateAuthorizedUser = vi.fn()
vi.mock('@/lib/api/users', () => ({
  usersClient: {
    getUsers: (...args: unknown[]) => getUsers(...args),
    authorizeExistingUser: (...args: unknown[]) => authorizeExistingUser(...args),
    updateAuthorizedUser: (...args: unknown[]) => updateAuthorizedUser(...args),
  },
}))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjects: (...args: unknown[]) => getProjects(...args) },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ada = { ...baseUser, projectIds: ['project-1'], projectAccess: ['Project One'] }
const grace = {
  ...ada,
  id: 'user-2',
  authUserId: 'auth-user-2',
  name: 'Grace Hopper',
  email: 'grace@example.test',
  role: 'Monitoring and Evaluation Officer' as const,
  accountStatus: 'Invited' as const,
  lastActiveAt: undefined,
}
const alan = {
  ...ada,
  id: 'user-3',
  authUserId: 'auth-user-3',
  name: 'Alan Turing',
  email: 'alan@example.test',
  accountStatus: 'Deactivated' as const,
}
const root = {
  ...baseUser,
  id: 'user-4',
  authUserId: 'auth-user-4',
  name: 'Root Admin',
  email: 'root@example.test',
  role: 'System Administrator' as const,
}
const project = { id: 'project-1', title: 'Project One', area: 'Area A', targetGoal: null }

const actAs = (role: string, permissions: string[], assignedProjectIds: string[] = []) => {
  currentRole = { role, profile: { permissions }, assignedProjectIds }
}
const loaded = async () => {
  render(<UserManagementWorkspace />)
  await waitFor(() => expect(screen.getByRole('list', { name: 'User accounts' })).toBeTruthy())
}
const row = (name: string) => {
  const found = screen.getByText(name).closest('li')
  if (!found) throw new Error(`No row for ${name}`)
  return found
}
const openEdit = async (name: string) => {
  fireEvent.click(within(row(name)).getByRole('menuitem', { name: /edit user/i }))
  await screen.findByRole('button', { name: 'Save changes' })
}

beforeEach(() => {
  actAs('System Administrator', projectManagerProfile.permissions)
  getUsers.mockResolvedValue([ada, grace, alan])
  getProjects.mockResolvedValue([project])
  updateAuthorizedUser.mockReset()
  authorizeExistingUser.mockReset()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('user management: account list', () => {
  it('counts the accounts by status and lists every account', async () => {
    await loaded()
    const summary = screen.getByLabelText('User account summary')
    const count = (label: string) =>
      within(summary).getByText(label).nextElementSibling?.textContent
    expect([count('Total users'), count('Active'), count('Invited'), count('Deactivated')]).toEqual(
      ['3', '1', '1', '1'],
    )
    const list = screen.getByRole('list', { name: 'User accounts' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('filters by search text and account status and clears the filters from the empty state', async () => {
    await loaded()
    fireEvent.change(screen.getByPlaceholderText('Search users, roles, or projects'), {
      target: { value: 'grace' },
    })
    expect(screen.getByText('Grace Hopper')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    fireEvent.change(screen.getByLabelText('Filter users by account status'), {
      target: { value: 'Deactivated' },
    })
    expect(screen.getByText('No users match')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('Alan Turing')).toBeTruthy()
    expect(screen.getByText('Grace Hopper')).toBeTruthy()
  })

  it('counts the users of each role in the role profiles', async () => {
    await loaded()
    const aside = screen.getByLabelText('Role profiles and administration links')
    const officer = within(aside).getByText('Project Officer').closest('div')?.parentElement
    expect(officer?.textContent).toContain('2 users')
    const admin = within(aside).getByText('System Administrator').closest('div')?.parentElement
    expect(admin?.textContent).toContain('0 users')
  })

  it('opens the account details from View and shows an account that was never active', async () => {
    await loaded()
    fireEvent.click(within(row('Grace Hopper')).getByRole('button', { name: 'View' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Account details')).toBeTruthy()
    expect(within(dialog).getByText('grace@example.test')).toBeTruthy()
    expect(within(dialog).getByText('Monitoring and Evaluation Officer')).toBeTruthy()
    expect(within(dialog).getByText('Not yet active')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Close', { selector: 'button' }))
    await waitFor(() => expect(screen.queryByText('Account details')).toBeNull())
  })

  it('shows an error state with Retry when the records cannot be loaded', async () => {
    getUsers.mockRejectedValueOnce(new Error('offline'))
    render(<UserManagementWorkspace />)
    expect(await screen.findByText('User records unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(getUsers).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['an actor without the authorize permission', () => actAs('System Administrator', [])],
    [
      'an account outside the authority of the actor',
      () => actAs('Project Manager', ['users.authorize'], ['project-1']),
    ],
  ])('marks %s as view only', async (_label, setup) => {
    setup()
    getUsers.mockResolvedValue([root])
    await loaded()
    const view = within(row('Root Admin')).getByRole('button', {
      name: /unavailable for Root Admin/i,
    })
    expect(view.hasAttribute('disabled')).toBe(true)
    expect(view.getAttribute('title')).toBe(
      'Your current role cannot authorize this account or its project scope.',
    )
  })
})

describe('user management: account actions', () => {
  it('saves an edited name through updateAuthorizedUser and updates the row', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...ada, name: 'Ada King' })
    await loaded()
    await openEdit('Ada Lovelace')
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Ada King ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-1', {
        fullName: 'Ada King',
        role: 'Project Officer',
        accountStatus: 'Active',
        projectIds: ['project-1'],
      }),
    )
    expect(await screen.findByText('Ada King')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('Account updated. Permissions apply immediately.')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it.each([
    [
      'a missing name',
      () => fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' ' } }),
      'Full name is required.',
    ],
    [
      'no project for a project role',
      () => fireEvent.click(screen.getByLabelText('Assign Project One')),
      'Select at least one permitted project assignment.',
    ],
    [
      'an invalid email',
      () => fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } }),
      'Enter a valid email address.',
    ],
    [
      'a duplicate email',
      () =>
        fireEvent.change(screen.getByLabelText('Email'), {
          target: { value: 'Grace@Example.test' },
        }),
      'That email already belongs to another user.',
    ],
    [
      'an email change',
      () =>
        fireEvent.change(screen.getByLabelText('Email'), {
          target: { value: 'new.ada@example.test' },
        }),
      'Changing the Auth email is not supported by this user endpoint.',
    ],
  ])('blocks saving %s', async (_label, change, message) => {
    await loaded()
    await openEdit('Ada Lovelace')
    change()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(updateAuthorizedUser).not.toHaveBeenCalled()
  })

  it('clears the selected projects when the role changes', async () => {
    await loaded()
    await openEdit('Ada Lovelace')
    const box = screen.getByLabelText('Assign Project One') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'Monitoring and Evaluation Officer' },
    })
    expect((screen.getByLabelText('Assign Project One') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/Multiple projects may be selected/)).toBeTruthy()
  })

  it('deactivates an account only after confirmation', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...ada, accountStatus: 'Deactivated' })
    await loaded()
    fireEvent.click(
      within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
    )
    expect(await screen.findByText('Deactivate account?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Deactivate account?')).toBeNull())
    expect(updateAuthorizedUser).not.toHaveBeenCalled()
    fireEvent.click(
      within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
    )
    await screen.findByText('Deactivate account?')
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-1', {
        role: 'Project Officer',
        accountStatus: 'Deactivated',
        projectIds: ['project-1'],
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Account deactivated. Sign-in access revoked.')
    await waitFor(() => expect(screen.queryByText('Deactivate account?')).toBeNull())
    expect(within(row('Ada Lovelace')).getByText('Deactivated')).toBeTruthy()
  })

  it('authorizes a deactivated account again', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...alan, accountStatus: 'Active' })
    await loaded()
    fireEvent.click(
      within(row('Alan Turing')).getByRole('menuitem', { name: /authorize account/i }),
    )
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-3', {
        role: 'Project Officer',
        accountStatus: 'Active',
        projectIds: ['project-1'],
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Account authorized. Sign-in access is active.')
    await waitFor(() => expect(within(row('Alan Turing')).getByText('Active')).toBeTruthy())
  })

  it.each([
    ['deactivation', new Error('Service unavailable.'), 'Service unavailable.'],
    ['deactivation', 'refused', 'Deactivation failed.'],
    ['authorization', new Error('Service unavailable.'), 'Service unavailable.'],
    ['authorization', 'refused', 'Authorization failed.'],
  ])('reports a failed %s with %j', async (kind, failure, message) => {
    updateAuthorizedUser.mockRejectedValue(failure)
    await loaded()
    if (kind === 'deactivation') {
      fireEvent.click(
        within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
      )
      await screen.findByText('Deactivate account?')
      fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))
    } else {
      fireEvent.click(
        within(row('Alan Turing')).getByRole('menuitem', { name: /authorize account/i }),
      )
    }
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
  })

  it('closes the create dialog and confirms with a toast after authorizing', async () => {
    authorizeExistingUser.mockResolvedValue({ ...ada, id: 'user-9' })
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /create user/i }))
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText(/auth user id/i), {
      target: { value: '11111111-1111-1111-1111-111111111111' },
    })
    fireEvent.click(screen.getByLabelText('Assign Project One'))
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Account authorized. Sign-in access is active.'),
    )
    await waitFor(() => expect(screen.queryByLabelText(/auth user id/i)).toBeNull())
  })
})
```


```bash
S=apps/web/src/features/settings
T=$S/components/user-management-workspace.test.tsx
F=apps/web/src/test/fixtures/user-management-fixtures.ts
git hash-object $T | cut -c1-8
cp $T .tmp/s8b/before/user-management-workspace.test.tsx
node .tmp/s8b/cut.mjs .tmp/s8b/task4a-cut.json
sed -i -e 's/^const baseUser = /export const baseUser = /' -e 's/^const projectManagerProfile = /export const projectManagerProfile = /' $F
node .tmp/s8b/trim-imports.mjs $T $F
git add -N apps/web/src
pnpm exec biome check --write $T $F $S/components/user-management-workspace.actions.test.tsx 2>&1 | tail -2
node .tmp/s8b/count-it.mjs .tmp/s8b/before/user-management-workspace.test.tsx $T | tail -3
pnpm --filter @pathways/web exec vitest run src/features/settings 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests|Test Files|FAIL"
```


Expected:

```text
a2f56ec5
apps/web/src/test/fixtures/user-management-fixtures.ts: 69 lines
apps/web/src/features/settings/components/user-management-workspace.test.tsx: 246 lines
apps/web/src/features/settings/components/user-management-workspace.test.tsx: removed nothing
apps/web/src/test/fixtures/user-management-fixtures.ts: removed nothing
Checked 3 files in <ms>. Fixed 1 file.
.tmp/s8b/before/user-management-workspace.test.tsx: it 9, describe 3, expect 19
apps/web/src/features/settings/components/user-management-workspace.test.tsx: it 9, describe 3, expect 19
total: it 18, describe 6, expect 38
 Test Files  5 passed (5)
      Tests  49 passed (49)
```


The hash is the one `task4a-cut.json` pins. The test file keeps all its 9 cases, 3 `describe` blocks and 19 `expect` calls, the fixture lines moved verbatim, and the settings folder now runs 49 tests in 5 files (28 before, plus the 21 new cases).

- [ ] **Step 2: Check and commit the tests**

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the user management list, edit, deactivation and load behavior before the split

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -4
git hash-object apps/web/src/features/settings/components/user-management-workspace.tsx | cut -c1-8
```


Expected:

```text
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1615 files in <ms>. No fixes applied.
 .../user-management-workspace.actions.test.tsx     | 350 +++++++++++++++++++++
 .../components/user-management-workspace.test.tsx  |  70 +----
 .../src/test/fixtures/user-management-fixtures.ts  |  69 ++++
 3 files changed, 423 insertions(+), 66 deletions(-)
e284c1de
```


The last line is the hash `task4-cut.json` pins for the workspace.

- [ ] **Step 3: Split the workspace**

`task4-cut.json` builds the files from verbatim ranges of the workspace (hash `e284c1de`): `use-user-directory.ts` takes the load, refresh and project state and the load effect, `use-user-editor.ts` the editor state, the create and edit openers, the save and the pending-create fingerprint, the four components take their own blocks, and `settings.utils.ts` gains `emptyEditor`, `formatAccountDate` and the `UserEditorState` type from the workspace. `task4-edits.json` adds the three import names the new files need from `settings.utils.ts`. The script that follows runs the cut, exports the moved declarations, tidies imports, proves with `same-lines.mjs` that no line of the old workspace is lost, and formats and checks the result:

Create `.tmp/s8b/task4-cut.json`:

```json
{
 "source": "apps/web/src/features/settings/components/user-management-workspace.tsx",
 "hash": "e284c1de",
 "files": {
  "apps/web/src/features/settings/settings.utils.ts": [
   {
    "file": "apps/web/src/features/settings/settings.utils.ts",
    "from": 1
   },
   "",
   [
    73,
    94
   ],
   "",
   [
    98,
    106
   ]
  ],
  "apps/web/src/features/settings/hooks/use-user-directory.ts": [
   "@imports",
   "",
   "export const useUserDirectory = (initialUsers: UserRecord[], initialProjects: ProjectSummary[]) => {",
   [
    117,
    138
   ],
   "  return { users, setUsers, projects, loadState, setLoadAttempt }",
   "}"
  ],
  "apps/web/src/features/settings/hooks/use-user-editor.ts": [
   "@imports",
   "",
   "import type { Dispatch, SetStateAction } from 'react'",
   "",
   [
    96,
    96
   ],
   "",
   "type CurrentRole = ReturnType<typeof useCurrentRole>",
   "",
   "export const useUserEditor = ({",
   "  actorRole,",
   "  profile,",
   "  assignedProjectIds,",
   "  users,",
   "  setUsers,",
   "  projects,",
   "  setLoadAttempt,",
   "}: {",
   "  actorRole: CurrentRole['role']",
   "  profile: CurrentRole['profile']",
   "  assignedProjectIds: CurrentRole['assignedProjectIds']",
   "  users: UserRecord[]",
   "  setUsers: Dispatch<SetStateAction<UserRecord[]>>",
   "  projects: ProjectSummary[]",
   "  setLoadAttempt: Dispatch<SetStateAction<number>>",
   "}) => {",
   [
    141,
    141
   ],
   [
    144,
    158
   ],
   [
    159,
    164
   ],
   [
    168,
    174
   ],
   "",
   [
    186,
    322
   ],
   "  return {",
   "    editor,",
   "    setEditor,",
   "    editorError,",
   "    setEditorError,",
   "    pendingCreate,",
   "    manageableRoles,",
   "    canCreateUsers,",
   "    assignableProjects,",
   "    openCreate,",
   "    openEdit,",
   "    saveEditor,",
   "  }",
   "}"
  ],
  "apps/web/src/features/settings/components/account-metric.tsx": [
   "@imports",
   "",
   [
    572,
    590
   ]
  ],
  "apps/web/src/features/settings/components/user-account-row.tsx": [
   "@imports",
   "",
   [
    592,
    678
   ]
  ],
  "apps/web/src/features/settings/components/user-editor-dialog.tsx": [
   "@imports",
   "",
   [
    680,
    872
   ]
  ],
  "apps/web/src/features/settings/components/user-detail-dialog.tsx": [
   "@imports",
   "",
   [
    874,
    938
   ]
  ],
  "apps/web/src/features/settings/components/user-management-workspace.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   "import { useUserDirectory } from '../hooks/use-user-directory'",
   "import { useUserEditor } from '../hooks/use-user-editor'",
   "import { AccountMetric } from './account-metric'",
   "import { UserAccountRow } from './user-account-row'",
   "import { UserDetailDialog } from './user-detail-dialog'",
   "import { UserEditorDialog } from './user-editor-dialog'",
   "",
   [
    108,
    116
   ],
   "  const { users, setUsers, projects, loadState, setLoadAttempt } = useUserDirectory(",
   "    initialUsers,",
   "    initialProjects,",
   "  )",
   "  const {",
   "    editor,",
   "    setEditor,",
   "    editorError,",
   "    setEditorError,",
   "    pendingCreate,",
   "    manageableRoles,",
   "    canCreateUsers,",
   "    assignableProjects,",
   "    openCreate,",
   "    openEdit,",
   "    saveEditor,",
   "  } = useUserEditor({",
   "    actorRole,",
   "    profile,",
   "    assignedProjectIds,",
   "    users,",
   "    setUsers,",
   "    projects,",
   "    setLoadAttempt,",
   "  })",
   [
    139,
    140
   ],
   [
    142,
    143
   ],
   [
    165,
    167
   ],
   "",
   [
    176,
    184
   ],
   "",
   [
    324,
    570
   ]
  ]
 }
}
```


Create `.tmp/s8b/task4-edits.json`:

```json
[
 [
  "apps/web/src/features/settings/hooks/use-user-editor.ts",
  "  userAccountStatusTone,\n} from '../settings.utils'",
  "  userAccountStatusTone,\n  emptyEditor,\n  type UserEditorState,\n} from '../settings.utils'",
  1
 ],
 [
  "apps/web/src/features/settings/components/user-editor-dialog.tsx",
  "  userAccountStatusTone,\n} from '../settings.utils'",
  "  userAccountStatusTone,\n  type UserEditorState,\n} from '../settings.utils'",
  1
 ],
 [
  "apps/web/src/features/settings/components/user-detail-dialog.tsx",
  "  userAccountStatusTone,\n} from '../settings.utils'",
  "  userAccountStatusTone,\n  formatAccountDate,\n} from '../settings.utils'",
  1
 ]
]
```


```bash
S=apps/web/src/features/settings
C=$S/components
H=$S/hooks
cp $C/user-management-workspace.tsx .tmp/s8b/before/user-management-workspace.tsx
cp $S/settings.utils.ts .tmp/s8b/before/settings.utils.ts
node .tmp/s8b/cut.mjs .tmp/s8b/task4-cut.json
sed -i -e 's/^interface UserEditorState/export interface UserEditorState/' -e 's/^const emptyEditor = /export const emptyEditor = /' -e 's/^const formatAccountDate = /export const formatAccountDate = /' $S/settings.utils.ts
sed -i 's/^const AccountMetric = /export const AccountMetric = /' $C/account-metric.tsx
sed -i 's/^const UserAccountRow = /export const UserAccountRow = /' $C/user-account-row.tsx
sed -i 's/^const UserEditorDialog = /export const UserEditorDialog = /' $C/user-editor-dialog.tsx
sed -i 's/^const UserDetailDialog = /export const UserDetailDialog = /' $C/user-detail-dialog.tsx
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task4-edits.json
NEW="$H/use-user-directory.ts $H/use-user-editor.ts $C/account-metric.tsx $C/user-account-row.tsx $C/user-editor-dialog.tsx $C/user-detail-dialog.tsx $C/user-management-workspace.tsx"
node .tmp/s8b/trim-imports.mjs $NEW $S/settings.utils.ts | cut -c1-110
node .tmp/s8b/same-lines.mjs .tmp/s8b/before/user-management-workspace.tsx --also .tmp/s8b/before/settings.utils.ts $NEW $S/settings.utils.ts --list > .tmp/s8b/out/t4-added.txt
tail -1 .tmp/s8b/out/t4-added.txt
head -1 $C/user-management-workspace.tsx
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
wc -l $H/*.ts $C/user-*.tsx $C/account-metric.tsx $S/settings.utils.ts | grep -v test
```


Expected:

```text
apps/web/src/features/settings/settings.utils.ts: 177 lines
apps/web/src/features/settings/hooks/use-user-directory.ts: 95 lines
apps/web/src/features/settings/hooks/use-user-editor.ts: 274 lines
apps/web/src/features/settings/components/account-metric.tsx: 89 lines
apps/web/src/features/settings/components/user-account-row.tsx: 157 lines
apps/web/src/features/settings/components/user-editor-dialog.tsx: 263 lines
apps/web/src/features/settings/components/user-detail-dialog.tsx: 135 lines
apps/web/src/features/settings/components/user-management-workspace.tsx: 378 lines
3 replacements in 3 files
apps/web/src/features/settings/hooks/use-user-directory.ts: removed Building2, Clock3, Eye, KeyRound, Loader2,
apps/web/src/features/settings/hooks/use-user-editor.ts: removed Building2, Clock3, Eye, KeyRound, Loader2, Ma
apps/web/src/features/settings/components/account-metric.tsx: removed Building2, Clock3, Eye, KeyRound, Loader
apps/web/src/features/settings/components/user-account-row.tsx: removed Building2, Clock3, Loader2, Mail, Plus
apps/web/src/features/settings/components/user-editor-dialog.tsx: removed Building2, Clock3, Eye, KeyRound, Ma
apps/web/src/features/settings/components/user-detail-dialog.tsx: removed Eye, Loader2, Mail, MoreHorizontal, 
apps/web/src/features/settings/components/user-management-workspace.tsx: removed Building2, Clock3, Eye, KeyRo
apps/web/src/features/settings/settings.utils.ts: removed nothing
original lines 937, lost 0, added 60
'use client'
Checked 8 files in <ms>. Fixed 5 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1621 files in <ms>. No fixes applied.
   31 apps/web/src/features/settings/hooks/use-user-directory.ts
  221 apps/web/src/features/settings/hooks/use-user-editor.ts
  102 apps/web/src/features/settings/components/user-account-row.tsx
   80 apps/web/src/features/settings/components/user-detail-dialog.tsx
  217 apps/web/src/features/settings/components/user-editor-dialog.tsx
  344 apps/web/src/features/settings/components/user-management-workspace.tsx
   21 apps/web/src/features/settings/components/account-metric.tsx
  177 apps/web/src/features/settings/settings.utils.ts
 1788 total
```


`same-lines` ends with `lost 0`: every declaration line of the old workspace and of `settings.utils.ts` is in the new files. It adds 60 lines: the signatures, the destructuring and the returned objects of the two hooks and the prop lists of the components; `.tmp/s8b/out/t4-added.txt` lists them. The `head -1` line prints `'use client'`: `cut.mjs` drops that line from `@imports`, so the plan writes it into the workspace by hand, and neither `same-lines` (it starts after the imports) nor a unit test would notice if it were missing, while the production build fails on the page that imports the workspace. The new hooks and components need no directive because the client workspace imports them. Biome rewraps five of the new files, the typecheck is clean and `--noUnusedLocals` lists only the two baseline lines.

- [ ] **Step 4: Prove the new tests catch a change of the moved code**

`mutate4.sh` changes the moved code one place at a time (the reload after a create, the stored update, the edit start, the stored projects, the reactivation status and the filters; then one place in each of the four new components and in the moved date label of `settings.utils.ts`), runs the settings tests and restores each file:

Create `.tmp/s8b/mutate4.sh`:

```bash
S=apps/web/src/features/settings
E=$S/hooks/use-user-editor.ts
D=$S/hooks/use-user-directory.ts
W=$S/components/user-management-workspace.tsx
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/features/settings 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/features/settings/components/##'); }
# Replaces one exact text in a file, failing when it is not found exactly once.
swap() { node -e "const fs=require('fs');const [f,a,b]=process.argv.slice(1);const t=fs.readFileSync(f,'utf8');if(t.split(a).length!==2)throw new Error('not unique: '+a);fs.writeFileSync(f,t.replace(a,b))" "$@"; }
mkdir -p .tmp/s8b/files
cp $E .tmp/s8b/files/editor.bak; cp $D .tmp/s8b/files/directory.bak; cp $W .tmp/s8b/files/workspace.bak
echo "unmutated"; run
swap $E "        setLoadAttempt((attempt) => attempt + 1)
        toast.success('Account authorized." "        toast.success('Account authorized."
echo "reload after create removed"; run
cp .tmp/s8b/files/editor.bak $E
swap $E "      setUsers((records) => records.map((user) => (user.id === updated.id ? updated : user)))
      toast.success('Account updated." "      toast.success('Account updated."
echo "updated row not stored"; run
cp .tmp/s8b/files/editor.bak $E
swap $E "projectIds: [...user.projectIds]," "projectIds: [],"
echo "edit starts without the assigned projects"; run
cp .tmp/s8b/files/editor.bak $E
swap $D "        setProjects(nextProjects)
" ""
echo "projects not stored"; run
cp .tmp/s8b/files/directory.bak $D
swap $W "        accountStatus: 'Active',
        projectIds: user.projectIds," "        accountStatus: 'Deactivated',
        projectIds: user.projectIds,"
echo "reactivation sends Deactivated"; run
cp .tmp/s8b/files/workspace.bak $W
swap $W "filterUserRecords(users, query, statusFilter)" "users"
echo "filters ignored"; run
cp .tmp/s8b/files/workspace.bak $W
C=$S/components
U=$S/settings.utils.ts
for f in $C/account-metric.tsx $C/user-account-row.tsx $C/user-detail-dialog.tsx $C/user-editor-dialog.tsx $U; do cp $f .tmp/s8b/files/$(basename $f).bak; done
swap $C/account-metric.tsx "text-foreground\">{value}</p>" "text-foreground\">{value + 1}</p>"
echo "metric shows another count"; run
cp .tmp/s8b/files/account-metric.tsx.bak $C/account-metric.tsx
swap $C/user-account-row.tsx "title={unavailableReason}" "title={undefined}"
echo "view only reason dropped"; run
cp .tmp/s8b/files/user-account-row.tsx.bak $C/user-account-row.tsx
swap $C/user-detail-dialog.tsx "value={formatAccountDate(user.lastActiveAt)}" "value={String(user.lastActiveAt)}"
echo "detail shows the raw last active value"; run
cp .tmp/s8b/files/user-detail-dialog.tsx.bak $C/user-detail-dialog.tsx
swap $C/user-editor-dialog.tsx "text-destructive\" role=\"alert\">" "text-destructive\" role=\"status\">"
echo "editor error not announced as an alert"; run
cp .tmp/s8b/files/user-editor-dialog.tsx.bak $C/user-editor-dialog.tsx
swap $U "if (!value) return 'Not yet active'" "if (!value) return 'Never'"
echo "never active label changed"; run
cp .tmp/s8b/files/settings.utils.ts.bak $U
for f in $C/account-metric.tsx $C/user-account-row.tsx $C/user-detail-dialog.tsx $C/user-editor-dialog.tsx $U; do cmp .tmp/s8b/files/$(basename $f).bak $f; done && echo "components and utils restored"
cmp .tmp/s8b/files/editor.bak $E && echo "editor hook restored"
cmp .tmp/s8b/files/directory.bak $D && echo "directory hook restored"
cmp .tmp/s8b/files/workspace.bak $W && echo "workspace restored"
```


```bash
bash .tmp/s8b/mutate4.sh
```


Expected:

```text
unmutated
      Tests  49 passed (49)
 Test Files  5 passed (5)
reload after create removed
      Tests  1 failed | 48 passed (49)
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > submits authorizeExistingUser with the DTO fields and refreshes the list on success
 Test Files  1 failed | 4 passed (5)
updated row not stored
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account actions > saves an edited name through updateAuthorizedUser and updates the row
 Test Files  1 failed | 4 passed (5)
edit starts without the assigned projects
      Tests  6 failed | 43 passed (49)
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving a duplicate email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an email change
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an invalid email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving no project for a project role
user-management-workspace.actions.test.tsx > user management: account actions > clears the selected projects when the role changes
user-management-workspace.actions.test.tsx > user management: account actions > saves an edited name through updateAuthorizedUser and updates the row
 Test Files  1 failed | 4 passed (5)
projects not stored
      Tests  12 failed | 37 passed (49)
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving a duplicate email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an email change
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an invalid email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving no project for a project role
user-management-workspace.actions.test.tsx > user management: account actions > clears the selected projects when the role changes
user-management-workspace.actions.test.tsx > user management: account actions > closes the create dialog and confirms with a toast after authorizing
user-management-workspace.actions.test.tsx > user management: account actions > saves an edited name through updateAuthorizedUser and updates the row
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > rejects an invalid Auth user ID before calling the client
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > shows a 400 server error from authorizeExistingUser
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > shows a 403 server error from authorizeExistingUser
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > shows a 404 server error from authorizeExistingUser
user-management-workspace.test.tsx > user management: create user via existing Auth authorization > submits authorizeExistingUser with the DTO fields and refreshes the list on success
 Test Files  2 failed | 3 passed (5)
reactivation sends Deactivated
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account actions > authorizes a deactivated account again
 Test Files  1 failed | 4 passed (5)
filters ignored
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account list > filters by search text and account status and clears the filters from the empty state
 Test Files  1 failed | 4 passed (5)
metric shows another count
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account list > counts the accounts by status and lists every account
 Test Files  1 failed | 4 passed (5)
view only reason dropped
      Tests  2 failed | 47 passed (49)
user-management-workspace.actions.test.tsx > user management: account list > marks an account outside the authority of the actor as view only
user-management-workspace.actions.test.tsx > user management: account list > marks an actor without the authorize permission as view only
 Test Files  1 failed | 4 passed (5)
detail shows the raw last active value
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account list > opens the account details from View and shows an account that was never active
 Test Files  1 failed | 4 passed (5)
editor error not announced as an alert
      Tests  5 failed | 44 passed (49)
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving a duplicate email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving a missing name
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an email change
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving an invalid email
user-management-workspace.actions.test.tsx > user management: account actions > blocks saving no project for a project role
 Test Files  1 failed | 4 passed (5)
never active label changed
      Tests  1 failed | 48 passed (49)
user-management-workspace.actions.test.tsx > user management: account list > opens the account details from View and shows an account that was never active
 Test Files  1 failed | 4 passed (5)
components and utils restored
editor hook restored
directory hook restored
workspace restored
```


Each of the 11 mutations fails the case or cases that pin the behavior it changes, and the four restore lines print.

- [ ] **Step 5: Run the web suite and commit**

```bash
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): split the user management workspace into hooks and sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
 Test Files  306 passed (306)
      Tests  3451 passed (3451)
 8 files changed, 739 insertions(+), 628 deletions(-)
```


Web is `B_web` plus 5 files and 73 tests: 306 files and 3451 tests.

---

### Task 5: Split `mfa-form.tsx` into a flow hook, a handoff hook and two panels

**Files:**
- Create: `apps/web/src/features/auth/hooks/use-mfa-flow.ts`, `hooks/use-mfa-handoff.ts`, `apps/web/src/features/auth/components/mfa-factor-panel.tsx`, `components/mfa-verified-panel.tsx`, `components/mfa-form.states.test.tsx`
- Modify: `apps/web/src/features/auth/components/mfa-form.tsx` (717 lines to 215), `apps/web/src/lib/rbac/auth-navigation.contract.test.ts`
- Create (gitignored): `.tmp/s8b/task5-cut.json`, `task5-edits.json`, `task5-contract.json`, `mutate5.sh`, `before/mfa-form.tsx`

The form is one state machine (11 `useState` calls, 7 effects, three async actions) whose steps share the same state, so it does not split by step without passing two dozen values between the parts (ruling 7). It splits by concern: the flow hook holds the session check and the enroll, verify and sign-out actions, the handoff hook holds the workspace handoff that follows a verified session, and the two panels draw the two bodies of the card. Two commits again: the states test first.

- [ ] **Step 1: Pin the form states on the unsplit code**

The existing `mfa-form.test.tsx` covers the enrollment display and the code boxes. `mfa-form.states.test.tsx` adds 21 cases that run the real form against mocked session, role, Supabase MFA and API status modules: no usable session, the factor choices (an existing verified factor, several factors with the typed code cleared on a change, an unfinished setup, an unsupported factor), the verify call with the challenge it opened, a rejected code, a verification that stops when the fresh API status is no longer `aal1`, the 30 second fallback after an accepted code, the handoff after `aal2` (claimed once, the native retry link when it is refused, the link hidden while access refreshes, access unavailable, and the loading, no workspace and failed access states) and the sign-out with its failure. The tokens, ids and names are fictional:

Create `apps/web/src/features/auth/components/mfa-form.states.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authUserId = '33333333-3333-4333-8333-333333333333'
const factorId = '44444444-4444-4444-8444-444444444444'
const otherFactorId = '55555555-5555-4555-8555-555555555555'
const session = { access_token: 'synthetic-token', user: { id: authUserId } }
const status = (aal: string, applicationAccessEnabled = true) => ({
  authUserId,
  aal,
  enrollmentAllowed: true,
  applicationAccessEnabled,
})
const factor = (id: string, state = 'verified', type = 'totp') => ({
  id,
  status: state,
  factor_type: type,
})

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  getSession: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
}))
const client = vi.hoisted(() => ({
  auth: {
    getSession: (...args: unknown[]) => mfa.getSession(...args),
    mfa: {
      listFactors: (...args: unknown[]) => mfa.listFactors(...args),
      enroll: vi.fn(),
      challenge: (...args: unknown[]) => mfa.challenge(...args),
      verify: (...args: unknown[]) => mfa.verify(...args),
    },
  },
}))
const state = vi.hoisted(() => ({
  session: null as unknown,
  sessionStatus: 'authenticated',
  configured: true,
  mfaStatus: null as unknown,
  freshStatus: null as unknown,
  access: 'mfa_required',
  accessError: null as string | null,
  accessRefreshing: false,
  claim: true,
  replace: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  refreshAccess: vi.fn(),
}))
const claimWorkspaceHandoff = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    session: state.session,
    status: state.sessionStatus,
    configured: state.configured,
    refreshSession: state.refreshSession,
    signOut: state.signOut,
  }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: state.access,
    mfaStatus: state.mfaStatus,
    accessError: state.accessError,
    accessRefreshing: state.accessRefreshing,
    refreshAccess: state.refreshAccess,
    claimWorkspaceHandoff,
    profile: null,
  }),
}))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => client }))
vi.mock('@/lib/auth/auth-access', async (original) => ({
  ...(await original<object>()),
  requestAuthJson: vi.fn(async () => state.freshStatus ?? state.mfaStatus),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MfaForm } from './mfa-form'

beforeEach(() => {
  state.session = session
  state.sessionStatus = 'authenticated'
  state.configured = true
  state.mfaStatus = status('aal1')
  state.freshStatus = null
  state.access = 'mfa_required'
  state.accessError = null
  state.accessRefreshing = false
  claimWorkspaceHandoff.mockReturnValue(true)
  state.signOut.mockResolvedValue(undefined)
  state.refreshSession.mockResolvedValue(undefined)
  mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
  mfa.getSession.mockResolvedValue({ data: { session }, error: null })
  mfa.challenge.mockResolvedValue({ data: { id: 'synthetic-challenge' }, error: null })
  mfa.verify.mockResolvedValue({ data: {}, error: { message: 'invalid code' } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const codeBoxes = () => screen.getAllByLabelText(/Digit \d of 6/)
const fillCode = (digits: string) =>
  digits.split('').forEach((digit, index) => {
    fireEvent.change(codeBoxes()[index], { target: { value: digit } })
  })

describe('MfaForm without a usable session', () => {
  it('says the authentication connection is not configured', async () => {
    state.configured = false
    render(<MfaForm />)
    expect(await screen.findByText('The authentication connection is not configured.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull()
  })

  it('asks to sign in first and links back to the staff login without a session', async () => {
    state.session = null
    render(<MfaForm />)
    expect(await screen.findByText('Sign in before setting up MFA.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/staff/login')
  })

  it('shows a disabled code form and Login button while the factor check is running', async () => {
    mfa.listFactors.mockReturnValue(new Promise(() => {}))
    render(<MfaForm />)
    expect(await screen.findByText('Six-digit authenticator code')).toBeTruthy()
    for (const box of codeBoxes()) expect((box as HTMLInputElement).disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Sign out and return to login' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('reports an invalid factor check without granting access', async () => {
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'down' } })
    render(<MfaForm />)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The local API returned an invalid MFA status. Stop and ask for review. No access was granted.',
    )
  })
})

describe('MfaForm factor choices', () => {
  it('uses the existing verified authenticator without offering a new one', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    expect(
      await screen.findByText('Use your existing authenticator. No new factor will be created.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
    expect(screen.queryByLabelText('Authenticator factor')).toBeNull()
    expect(codeBoxes()).toHaveLength(6)
  })

  it('lets the person pick between several verified authenticators and clears the typed code', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId), factor(otherFactorId)] },
      error: null,
    })
    render(<MfaForm />)
    const select = (await screen.findByLabelText('Authenticator factor')) as HTMLSelectElement
    expect(select.value).toBe(factorId)
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      `Authenticator 1 (${factorId.slice(0, 8)})`,
      `Authenticator 2 (${otherFactorId.slice(0, 8)})`,
    ])
    fillCode('123')
    fireEvent.change(select, { target: { value: otherFactorId } })
    expect(select.value).toBe(otherFactorId)
    expect(codeBoxes().map((box) => (box as HTMLInputElement).value)).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  })

  it('verifies an unfinished setup without replacing the factor', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId, 'unverified')] },
      error: null,
    })
    render(<MfaForm />)
    expect(await screen.findByText(/An unfinished setup already exists/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
  })

  it('stops on an unsupported factor type and offers no code form', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId, 'verified', 'phone')] },
      error: null,
    })
    render(<MfaForm />)
    expect(await screen.findByText(/An unsupported factor exists/)).toBeTruthy()
    expect(screen.queryByLabelText(/Digit \d of 6/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
  })

  it('verifies the selected factor with the typed code and the challenge it opened', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    await waitFor(() =>
      expect(mfa.verify).toHaveBeenCalledWith({
        factorId,
        challengeId: 'synthetic-challenge',
        code: '123456',
      }),
    )
    expect(state.refreshSession).toHaveBeenCalledOnce()
    expect(state.refreshAccess).toHaveBeenCalledOnce()
  })

  it('does not verify when the fresh API status is no longer aal1', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    state.freshStatus = status('aal2')
    fillCode('123456')
    expect((await screen.findByRole('alert')).textContent).toMatch(/Verification was not accepted/)
    expect(mfa.verify).not.toHaveBeenCalled()
  })

  it('shows the retry guidance after a rejected code', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Verification was not accepted. Try the next six-digit code. If your session changed, sign in again.',
    )
  })

  it('falls back to the code form after thirty seconds without an aal2 confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    expect(await screen.findByText('Code accepted. Opening your workspace...')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Your code was accepted, but the session could not be confirmed. Reload this page or sign in again.',
    )
  })
})

describe('MfaForm after the API confirms aal2', () => {
  beforeEach(() => {
    state.mfaStatus = status('aal2')
  })

  it('claims the workspace handoff once and opens the landing path', async () => {
    state.access = 'ready'
    render(<MfaForm />)
    expect(await screen.findByText('Opening your dashboard...')).toBeTruthy()
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/workspace'))
    expect(claimWorkspaceHandoff).toHaveBeenCalledOnce()
  })

  it('offers a native retry link when the handoff was refused', async () => {
    state.access = 'ready'
    claimWorkspaceHandoff.mockReturnValue(false)
    render(<MfaForm />)
    expect(await screen.findByText(/the workspace could not open/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Retry opening workspace' }).getAttribute('href')).toBe(
      '/workspace',
    )
    expect(state.replace).not.toHaveBeenCalled()
  })

  it('hides the retry link while access is refreshing', async () => {
    state.access = 'ready'
    claimWorkspaceHandoff.mockReturnValue(false)
    const view = render(<MfaForm />)
    expect(await screen.findByRole('link', { name: 'Retry opening workspace' })).toBeTruthy()
    state.accessRefreshing = true
    view.rerender(<MfaForm />)
    expect(screen.getByText('MFA session verified by the API (aal2).')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Retry opening workspace' })).toBeNull()
  })

  it('says application access is unavailable when the profile is not enabled', async () => {
    state.mfaStatus = status('aal2', false)
    render(<MfaForm />)
    expect(await screen.findByText(/Application access is currently unavailable/)).toBeTruthy()
    expect(state.replace).not.toHaveBeenCalled()
  })

  it.each([
    ['loading', 'Finding your authorized workspace...'],
    [
      'no_workspace',
      'No authorized workspace is available. Ask an administrator to review your access, or sign out. Reload this page after access is updated.',
    ],
    [
      'failed',
      'Workspace access is not available. Reload this page or ask the development administrator for help.',
    ],
  ])('explains the %s workspace access state', async (access, message) => {
    state.access = access
    render(<MfaForm />)
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0)
    expect(state.replace).not.toHaveBeenCalled()
  })
})

describe('MfaForm sign out', () => {
  it('signs out and returns to the staff login', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and return to login' }))
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/staff/login'))
    expect(state.signOut).toHaveBeenCalledOnce()
  })

  it('stays on the page with a warning when the sign-out cannot be confirmed', async () => {
    state.signOut.mockRejectedValue(new Error('offline'))
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and return to login' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-out could not be confirmed. Close this private browser window before continuing.',
    )
    expect(state.replace).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/Digit \d of 6/)).toBeNull()
  })
})
```


```bash
A=apps/web/src/features/auth
git hash-object $A/components/mfa-form.tsx | cut -c1-8
cp $A/components/mfa-form.tsx .tmp/s8b/before/mfa-form.tsx
git add -N $A
pnpm exec biome check --write $A/components/mfa-form.states.test.tsx 2>&1 | tail -2
(cd apps/web && pnpm exec vitest run src/features/auth src/lib/rbac 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests|Test Files|FAIL|×")
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "test(web): pin the MFA form states and factor choices before the split

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -2
```


Expected:

```text
77bb0e8c
Checked 1 file in <ms>. No fixes applied.
 Test Files  16 passed (16)
      Tests  268 passed (268)
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1622 files in <ms>. No fixes applied.
 .../auth/components/mfa-form.states.test.tsx       | 348 +++++++++++++++++++++
 1 file changed, 348 insertions(+)
```


The first line is the hash `task5-cut.json` pins. The auth and rbac folders run 268 tests in 16 files, all passing against the unsplit form.

- [ ] **Step 2: Split the form**

`task5-cut.json` cuts `mfa-form.tsx` (hash `77bb0e8c`) into the files below. `use-mfa-handoff.ts` takes lines 72 to 74, 104 to 111, 125 to 169; `use-mfa-flow.ts` takes the interface, the state and derived values (lines 37 to 103 without the handoff lines), the 30 second fallback effect, and everything from the status inspection effect to the sign-out action (lines 171 to 397); the two panels take the verified and the factor-setup bodies of the card (lines 496 to 549 and 551 to 661); the form keeps the loading card, the card frame, the error, the pending, no-session, accepted and blocked branches and the footer. The new files add only signatures, prop lists and the hook call (157 added lines). `task5-edits.json` renames the user id inside the handoff hook (the original reads `session?.user.id`) and one prop in the verified panel, and `task5-contract.json` makes the auth navigation contract test read the four files that now hold what `mfa-form.tsx` held, with the same assertions:

Create `.tmp/s8b/task5-cut.json`:

```json
{
 "source": "apps/web/src/features/auth/components/mfa-form.tsx",
 "hash": "77bb0e8c",
 "files": {
  "apps/web/src/features/auth/hooks/use-mfa-handoff.ts": [
   "@imports",
   "import type { Dispatch, SetStateAction } from 'react'",
   "",
   "type CurrentRole = ReturnType<typeof useCurrentRole>",
   "",
   "export type MfaHandoff = 'idle' | 'opening' | 'stalled'",
   "",
   "export const useMfaHandoff = ({",
   "  userId,",
   "  status,",
   "  configured,",
   "  allowedAccount,",
   "  current,",
   "  access,",
   "  accessRefreshing,",
   "  claimWorkspaceHandoff,",
   "  profile,",
   "  router,",
   "  setAccepted,",
   "}: {",
   "  userId: string | undefined",
   "  status: ReturnType<typeof useSession>['status']",
   "  configured: boolean",
   "  allowedAccount: boolean",
   "  current: { status: MfaStatus } | null",
   "  access: CurrentRole['access']",
   "  accessRefreshing: boolean",
   "  claimWorkspaceHandoff: CurrentRole['claimWorkspaceHandoff']",
   "  profile: CurrentRole['profile']",
   "  router: ReturnType<typeof useRouter>",
   "  setAccepted: Dispatch<SetStateAction<boolean>>",
   "}) => {",
   [
    72,
    73
   ],
   "  const [handoff, setHandoff] = useState<MfaHandoff>('idle')",
   "",
   [
    104,
    111
   ],
   "",
   [
    125,
    169
   ],
   "",
   "  return handoff",
   "}"
  ],
  "apps/web/src/features/auth/hooks/use-mfa-flow.ts": [
   "@imports",
   "import { useMfaHandoff } from './use-mfa-handoff'",
   "",
   [
    30,
    34
   ],
   "",
   "export const useMfaFlow = () => {",
   [
    37,
    71
   ],
   [
    75,
    103
   ],
   "",
   "  const handoff = useMfaHandoff({",
   "    userId: currentUserId,",
   "    status,",
   "    configured,",
   "    allowedAccount,",
   "    current,",
   "    access,",
   "    accessRefreshing,",
   "    claimWorkspaceHandoff,",
   "    profile,",
   "    router,",
   "    setAccepted,",
   "  })",
   "",
   [
    113,
    123
   ],
   "",
   [
    171,
    397
   ],
   "",
   "  return {",
   "    session,",
   "    status,",
   "    configured,",
   "    access,",
   "    accessError,",
   "    accessRefreshing,",
   "    handoff,",
   "    accepted,",
   "    leaving,",
   "    busy,",
   "    error,",
   "    current,",
   "    privateEnrollment,",
   "    choices,",
   "    verifiedFactors,",
   "    factorId,",
   "    setFactorId,",
   "    code,",
   "    setCode,",
   "    codeFormVisible,",
   "    enrollmentAttempted,",
   "    enroll,",
   "    verify,",
   "    leave,",
   "  }",
   "}"
  ],
  "apps/web/src/features/auth/components/mfa-verified-panel.tsx": [
   "@imports",
   "import type { MfaHandoff } from '../hooks/use-mfa-handoff'",
   "",
   "type CurrentRole = ReturnType<typeof useCurrentRole>",
   "",
   "export const MfaVerifiedPanel = ({",
   "  applicationAccessEnabled,",
   "  access,",
   "  handoff,",
   "  accessRefreshing,",
   "  accessError,",
   "}: {",
   "  applicationAccessEnabled: boolean",
   "  access: CurrentRole['access']",
   "  handoff: MfaHandoff",
   "  accessRefreshing: boolean",
   "  accessError: CurrentRole['accessError']",
   "}) => (",
   [
    496,
    549
   ],
   ")"
  ],
  "apps/web/src/features/auth/components/mfa-factor-panel.tsx": [
   "@imports",
   "import type { FactorChoice } from '../hooks/use-mfa-flow'",
   "",
   "export const MfaFactorPanel = ({",
   "  current,",
   "  privateEnrollment,",
   "  choices,",
   "  verifiedFactors,",
   "  factorId,",
   "  setFactorId,",
   "  code,",
   "  setCode,",
   "  busy,",
   "  codeFormVisible,",
   "  verify,",
   "}: {",
   "  current: { factors: FactorChoice[] }",
   "  privateEnrollment: { qr: string; secret: string } | null",
   "  choices: FactorChoice[]",
   "  verifiedFactors: FactorChoice[]",
   "  factorId: string",
   "  setFactorId: (value: string) => void",
   "  code: string",
   "  setCode: (value: string) => void",
   "  busy: boolean",
   "  codeFormVisible: boolean",
   "  verify: () => Promise<void>",
   "}) => (",
   [
    551,
    661
   ],
   ")"
  ],
  "apps/web/src/features/auth/components/mfa-form.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useMfaFlow } from '../hooks/use-mfa-flow'",
   "import { MfaFactorPanel } from './mfa-factor-panel'",
   "import { MfaVerifiedPanel } from './mfa-verified-panel'",
   "",
   "export function MfaForm() {",
   "  const {",
   "    session,",
   "    status,",
   "    configured,",
   "    access,",
   "    accessError,",
   "    accessRefreshing,",
   "    handoff,",
   "    accepted,",
   "    leaving,",
   "    busy,",
   "    error,",
   "    current,",
   "    privateEnrollment,",
   "    choices,",
   "    verifiedFactors,",
   "    factorId,",
   "    setFactorId,",
   "    code,",
   "    setCode,",
   "    codeFormVisible,",
   "    enrollmentAttempted,",
   "    enroll,",
   "    verify,",
   "    leave,",
   "  } = useMfaFlow()",
   "",
   [
    399,
    494
   ],
   "        ) : current.status.aal === 'aal2' ? (",
   "          <MfaVerifiedPanel",
   "            applicationAccessEnabled={current.status.applicationAccessEnabled}",
   "            access={access}",
   "            handoff={handoff}",
   "            accessRefreshing={accessRefreshing}",
   "            accessError={accessError}",
   "          />",
   "        ) : (",
   "          <MfaFactorPanel",
   "            current={current}",
   "            privateEnrollment={privateEnrollment}",
   "            choices={choices}",
   "            verifiedFactors={verifiedFactors}",
   "            factorId={factorId}",
   "            setFactorId={setFactorId}",
   "            code={code}",
   "            setCode={setCode}",
   "            busy={busy}",
   "            codeFormVisible={codeFormVisible}",
   "            verify={verify}",
   "          />",
   "        )}",
   [
    663,
    717
   ]
  ]
 }
}
```


Create `.tmp/s8b/task5-edits.json`:

```json
[
 [
  "apps/web/src/features/auth/hooks/use-mfa-handoff.ts",
  "useRef(session?.user.id)",
  "useRef(userId)",
  1
 ],
 [
  "apps/web/src/features/auth/hooks/use-mfa-handoff.ts",
  "}, [session?.user.id])",
  "}, [userId, setAccepted])",
  1
 ],
 [
  "apps/web/src/features/auth/hooks/use-mfa-handoff.ts",
  "session?.user.id",
  "userId",
  2
 ],
 [
  "apps/web/src/features/auth/components/mfa-verified-panel.tsx",
  "!current.status.applicationAccessEnabled",
  "!applicationAccessEnabled",
  1
 ]
]
```


Create `.tmp/s8b/task5-contract.json`:

```json
[
 [
  "apps/web/src/lib/rbac/auth-navigation.contract.test.ts",
  "    const form = source('features/auth/components/mfa-form.tsx')\n",
  "    const form = [\n      'features/auth/components/mfa-form.tsx',\n      'features/auth/components/mfa-verified-panel.tsx',\n      'features/auth/hooks/use-mfa-flow.ts',\n      'features/auth/hooks/use-mfa-handoff.ts',\n    ]\n      .map(source)\n      .join('\\n')\n",
  1
 ]
]
```


```bash
A=apps/web/src/features/auth
node .tmp/s8b/cut.mjs .tmp/s8b/task5-cut.json
sed -i 's/^interface FactorChoice/export interface FactorChoice/' $A/hooks/use-mfa-flow.ts
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task5-edits.json
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task5-contract.json
NEW="$A/hooks/use-mfa-handoff.ts $A/hooks/use-mfa-flow.ts $A/components/mfa-verified-panel.tsx $A/components/mfa-factor-panel.tsx $A/components/mfa-form.tsx"
node .tmp/s8b/trim-imports.mjs $NEW | cut -c1-110
node .tmp/s8b/same-lines.mjs .tmp/s8b/before/mfa-form.tsx $NEW "userId=session?.user.id" ", setAccepted]=]" "useState<MfaHandoff>=useState<'idle' | 'opening' | 'stalled'>" "!applicationAccessEnabled=!current.status.applicationAccessEnabled" --list > .tmp/s8b/out/t5-added.txt
tail -1 .tmp/s8b/out/t5-added.txt
head -1 $A/components/mfa-form.tsx
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -2
git checkout -- apps/web/next-env.d.ts
wc -l $A/hooks/*.ts $A/components/mfa-*.tsx | grep -v test
```


Expected:

```text
apps/web/src/features/auth/hooks/use-mfa-handoff.ts: 118 lines
apps/web/src/features/auth/hooks/use-mfa-flow.ts: 381 lines
apps/web/src/features/auth/components/mfa-verified-panel.tsx: 98 lines
apps/web/src/features/auth/components/mfa-factor-panel.tsx: 165 lines
apps/web/src/features/auth/components/mfa-form.tsx: 234 lines
4 replacements in 2 files
1 replacements in 1 files
apps/web/src/features/auth/hooks/use-mfa-handoff.ts: removed ArrowLeft, LoaderCircle, ShieldCheck, toast, Butt
apps/web/src/features/auth/hooks/use-mfa-flow.ts: removed ArrowLeft, LoaderCircle, ShieldCheck, toast, Button,
apps/web/src/features/auth/components/mfa-verified-panel.tsx: removed ArrowLeft, ShieldCheck, useRouter, useEf
apps/web/src/features/auth/components/mfa-factor-panel.tsx: removed ArrowLeft, LoaderCircle, ShieldCheck, useR
apps/web/src/features/auth/components/mfa-form.tsx: removed useRouter, useEffect, useRef, useState, toast, use
original lines 672, lost 0, added 157
'use client'
Checked 6 files in <ms>. Fixed 4 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1626 files in <ms>. No fixes applied.
  373 apps/web/src/features/auth/hooks/use-mfa-flow.ts
   99 apps/web/src/features/auth/hooks/use-mfa-handoff.ts
  143 apps/web/src/features/auth/components/mfa-factor-panel.tsx
  215 apps/web/src/features/auth/components/mfa-form.tsx
   76 apps/web/src/features/auth/components/mfa-verified-panel.tsx
 1534 total
```


`same-lines` ends with `original lines 672, lost 0, added 157`. The `head -1` line prints `'use client'`, written in by hand for the reason given in Task 4. Biome rewraps 4 of the new files. Four renames are passed to it because four original lines changed on purpose: the handoff hook reads its `userId` argument where the form read `session?.user.id` (three places), its first effect lists `setAccepted` in its dependencies because the hook receives the setter as an argument, the handoff state is typed by the exported `MfaHandoff` type, and the verified panel receives `applicationAccessEnabled` as a prop. The effects run in the same order as in the form except that the 30 second fallback timer, which touches only `accepted` and `error`, now runs after the three handoff effects instead of between the first and the second (ruling 7).

- [ ] **Step 3: Run the form tests and prove the new files are pinned**

`mutate5.sh` changes the moved code one place at a time (the refused handoff, the remembered attempt, the fallback timer, the sign-out path, the factor select for one factor, the retry link while access refreshes and the stale `aal2` check), runs the auth tests and restores each file:

Create `.tmp/s8b/mutate5.sh`:

```bash
A=apps/web/src/features/auth
F=$A/hooks/use-mfa-flow.ts
H=$A/hooks/use-mfa-handoff.ts
P=$A/components/mfa-factor-panel.tsx
V=$A/components/mfa-verified-panel.tsx
run() { (cd apps/web && timeout 300 pnpm exec vitest run src/features/auth 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/features/auth/components/##'); }
# Replaces one exact text in a file, failing when it is not found exactly once.
swap() { node -e "const fs=require('fs');const [f,a,b]=process.argv.slice(1);const t=fs.readFileSync(f,'utf8');if(t.split(a).length!==2)throw new Error('not unique: '+a);fs.writeFileSync(f,t.replace(a,b))" "$@"; }
mkdir -p .tmp/s8b/files
for f in $F $H $P $V; do cp $f .tmp/s8b/files/$(basename $f).bak; done
restore() { for f in $F $H $P $V; do cp .tmp/s8b/files/$(basename $f).bak $f; done; }
echo "unmutated"; run
swap $H "    if (!claimWorkspaceHandoff()) {
      setHandoff('stalled')
      return
    }" "    if (!claimWorkspaceHandoff()) return"
echo "refused handoff never stalls"; run; restore
swap $H "    handoffAttempted.current = true
" ""
echo "handoff attempt not remembered"; run; restore
swap $F "    }, 30_000)" "    }, 300_000)"
echo "accepted fallback timer lengthened"; run; restore
swap $F "router.replace('/staff/login')" "router.replace('/login')"
echo "sign out opens another path"; run; restore
swap $P "{choices.length > 1 && (" "{choices.length > 0 && ("
echo "factor select offered for one factor"; run; restore
swap $V "{!accessRefreshing && (" "{true && ("
echo "retry link shown while refreshing"; run; restore
swap $F "        throw new Error('Recheck the current session.')" "        void 0"
echo "stale aal2 session still verifies"; run; restore
for f in $F $H $P $V; do cmp .tmp/s8b/files/$(basename $f).bak $f; done && echo "all four restored"
```


```bash
(cd apps/web && pnpm exec vitest run src/features/auth src/lib/rbac 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests|Test Files|FAIL|×")
bash .tmp/s8b/mutate5.sh
```


Expected:

```text
 Test Files  16 passed (16)
      Tests  268 passed (268)
unmutated
      Tests  46 passed (46)
 Test Files  5 passed (5)
refused handoff never stalls
      Tests  2 failed | 44 passed (46)
mfa-form.states.test.tsx > MfaForm after the API confirms aal2 > hides the retry link while access is refreshing
mfa-form.states.test.tsx > MfaForm after the API confirms aal2 > offers a native retry link when the handoff was refused
 Test Files  1 failed | 4 passed (5)
handoff attempt not remembered
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm after the API confirms aal2 > claims the workspace handoff once and opens the landing path
 Test Files  1 failed | 4 passed (5)
accepted fallback timer lengthened
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm factor choices > falls back to the code form after thirty seconds without an aal2 confirmation
 Test Files  1 failed | 4 passed (5)
sign out opens another path
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm sign out > signs out and returns to the staff login
 Test Files  1 failed | 4 passed (5)
factor select offered for one factor
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm factor choices > uses the existing verified authenticator without offering a new one
 Test Files  1 failed | 4 passed (5)
retry link shown while refreshing
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm after the API confirms aal2 > hides the retry link while access is refreshing
 Test Files  1 failed | 4 passed (5)
stale aal2 session still verifies
      Tests  1 failed | 45 passed (46)
mfa-form.states.test.tsx > MfaForm factor choices > does not verify when the fresh API status is no longer aal1
 Test Files  1 failed | 4 passed (5)
all four restored
```


The first line is the 268 tests of the auth and rbac folders (16 files) and the second the 46 tests of the five files in the auth folder, which is all the mutation runs execute. Each mutation fails the case or cases that pin the behavior it changes (the refused handoff fails the two retry link cases), and the last line says all four files were restored.

- [ ] **Step 4: Run the web suite and commit**

```bash
(cd apps/web && timeout 900 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): split the MFA form into a flow hook, a handoff hook and two panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```


Expected:

```text
 Test Files  307 passed (307)
      Tests  3472 passed (3472)
 6 files changed, 744 insertions(+), 548 deletions(-)
```


Web is the Task 4 figure plus the 21 cases of Step 1: 307 files and 3472 tests (`B_web` plus 6 files and 94 tests).

---

### Task 6: Records

**Files:**
- Create (gitignored): `.tmp/s8b/task6-edits.json`, `.tmp/s8b/activity-s8b.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-17 rows), `docs/qad-pathways.md` (QAD-T11, QAD-T36, QAD-T37, QAD-T74), `docs/deferred-features.md` (rows 10 and 83), `docs/rfc-pathways-aws-hosting-migration.md` (one path), `docs/index.md` (CR row and the S8b plan row), `docs/activity-log.md`

No SAD routing change is needed (ruling 12): `scripts/sad/check.ts` already routes `apps/web/src/lib/api/**/*.ts` to `beneficiary-privacy-guardian` and `apps/web/src/**` to `design-qa-agent`.

- [ ] **Step 1: Amend the change record, the living docs and the index**

Create each file with the Write tool, exactly as printed. `.tmp/s8b/task6-edits.json` holds the exact replacements: the layout paragraph of section 3.3, the S8b applied paragraph at the end of section 9, after the "Dev merge before S8b" paragraph that follows the S8a "Deferred to S8b" line (it ends `because dev's features grew one stateful body in each.`), the paths of the QAD, deferred feature and RFC rows that name moved files (the rows that name the deleted `public-project-detail.tsx` keep their text, since it is history), and the two index edits: the CR row status `S7d and S8a applied, S8b next` becomes `S7d, S8a and S8b applied` (the replay row ends `... S7c, S7d and S8a applied, S8b next` at the S8a tip, so a count other than 1 stops the run) and the status of this plan's row becomes `S8b executed`. The row of the S8 plan keeps `S8a executed; holds the S8b outline`. `@DATE@` is replaced by the day Task 6 runs and `@M0@` by the Middleware size of Task 0:

Create `.tmp/s8b/task6-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "### 3.4 Shared package layout (`packages/shared/src/`)\n",
  "`features/auth`, `features/profile`, `features/public` and `features/settings` follow the layout with `components/`, an `index.ts` each (auth also lists `strongPasswordSchema`, which the profile schema imports) and the `.schema.ts` and `.utils.ts` suffixes; `features/settings` and `features/auth` also hold `hooks/`, because their two oversized screens split into a flow hook and sections rather than by step (`features/auth/hooks/use-mfa-flow.ts`); request helpers that no suffix names (`signin-request.ts`, `own-password-operation.ts`) stay beside the schema files (amended @DATE@ for S8b).\n\n### 3.4 Shared package layout (`packages/shared/src/`)\n",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "because dev's features grew one stateful body in each.",
  "because dev's features grew one stateful body in each.\n\nS8b applied @DATE@ on the S8b slice branch:\n- Clients: `lib/api/publication.ts` holds `publicationClient` (`get`, `transition`) and `lib/api/audit.ts` holds `auditClient` (`list`); the snapshot schema is `publicProjectResponse.omit({ publishedAt: true })` and the transition body is typed `PublicationTransitionRequest`, the 13 declaration lines the proof lists as not copied (the inline snapshot object and the old body type). The artifact helpers moved to `lib/api/core/artifact-download.ts`, and `lib/services/core-feature-client.ts` (173 lines) and its test (294 lines) were deleted.\n- Callers: 3 production files and 3 mock factories follow the new clients and 23 files changed one specifier for the artifact helpers (15 mock factories among them); the characterization tests ran 98 runs against the old and the new clients and 2 save cases against the old helper before the old members went, and every one of the 47 test titles of the four changed test files is kept (`lost 0`; the cookie refusal case became two, one per subject). Seven mutations of the moved helpers and the owned read fail a cut case; the owner recheck that `ownedJsonRead` makes after the last chunk is reached by no test (a mutation that drops it survives), and S8b does not move that file.\n- Splits: `user-management-workspace.tsx` (938 lines, 11 `useState`) became a 344 line workspace, `hooks/use-user-directory.ts`, `hooks/use-user-editor.ts` and four components, with `emptyEditor`, `formatAccountDate` and `UserEditorState` in `settings.utils.ts`; `mfa-form.tsx` (717 lines, 12 `useState`) became a 215 line form, `hooks/use-mfa-flow.ts`, `hooks/use-mfa-handoff.ts` and two panels. Both are verbatim cuts (`same lines: 937, lost 0` and `672, lost 0`) after 21 characterization cases each that pass on the unsplit code; mutation runs fail the case that pins each moved behavior.\n- Layout: 46 files of `features/{auth,profile,public,settings}` moved into `components/` with `.schema.ts` and `.utils.ts` names, each feature has an `index.ts`, 21 leaf imports in 20 app route files name the index, and `indexedFeatures` and `optimizePackageImports` list the four names.\n- Tests: web 301 files and 3378 tests became 307 and 3472, shared and api unchanged.\n- Routes: Middleware stayed at @M0@ kB; the old client leaving the shared chunks made 14 routes 1 kB smaller and `/dashboard` 1 kB bigger before the layout move (inside the 1 kB bound), and the layout move and the two splits changed none.\n- Decisions: the layout comes before the splits (ruling 1); `core-feature-client.ts` is deleted because its artifact helpers moved (ruling 3); user management is tested before it is cut (ruling 6); the MFA form splits by concern, not by step, and one effect order changed (ruling 7); the layout keeps two request helpers at the folder root (ruling 8).\n\nAll slices S1 to S8 are applied; W1 (tooling and docs) is the remaining sub-project (the wrap-up table of section 3.7).",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/public/publication-queue-workspace.test.tsx",
  "apps/web/src/features/public/components/publication-queue-workspace.test.tsx",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/public/public-tracker-view.test.tsx",
  "apps/web/src/features/public/components/public-tracker-view.test.tsx",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/settings/audit-log-workspace.test.tsx",
  "apps/web/src/features/settings/components/audit-log-workspace.test.tsx",
  1
 ],
 [
  "docs/qad-pathways.md",
  "apps/web/src/features/profile/own-profile-workspace.test.tsx",
  "apps/web/src/features/profile/components/own-profile-workspace.test.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/profile/own-profile-workspace.tsx",
  "apps/web/src/features/profile/components/own-profile-workspace.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/profile/own-step-up-pin-form.tsx",
  "apps/web/src/features/profile/components/own-step-up-pin-form.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/profile/own-password-dialog.tsx",
  "apps/web/src/features/profile/components/own-password-dialog.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/profile/own-password-form.tsx",
  "apps/web/src/features/profile/components/own-password-form.tsx",
  1
 ],
 [
  "docs/deferred-features.md",
  "apps/web/src/features/profile/own-profile-contract.ts",
  "apps/web/src/features/profile/own-profile.schema.ts",
  1
 ],
 [
  "docs/rfc-pathways-aws-hosting-migration.md",
  "apps/web/src/features/auth/login-form.tsx",
  "apps/web/src/features/auth/components/login-form.tsx",
  1
 ],
 [
  "docs/index.md",
  "S7d and S8a applied, S8b next |",
  "S7d, S8a and S8b applied |",
  1
 ],
 [
  "docs/index.md",
  "public and settings feature layout | In progress |",
  "public and settings feature layout | S8b executed |",
  1
 ]
]
```


```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g; s/@M0@/$(cat .tmp/s8b/m0)/g" .tmp/s8b/task6-edits.json
node .tmp/s8b/replace-exact.mjs .tmp/s8b/task6-edits.json
sed -i -e '/^| MOD-05 /s/\. |$/; the publication and audit clients and the artifact helpers by S8b. |/' \
  -e '/^| MOD-06 /s/\. |$/; the user management workspace and the MFA form split by S8b. |/' \
  -e '/^| MOD-15 /s/\. |$/; auth, profile, public and settings indexes by S8b. |/' \
  -e '/^| MOD-17 /s/\. |$/; auth, profile, public and settings laid out by S8b. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{70} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
grep -c "modularization-s8b-public-users-auth-web.md) .* | S8b executed |$" docs/index.md
git grep -noE "features/(auth|profile|public|settings)/[a-z0-9.-]*\.tsx|core-feature-client|own-profile-contract|account-access-validation|login-validation|user-management-utils" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff'
```


Expected:

```text
14 replacements in 5 files
 docs/audit-pathways-codebase-modularity-20261009.md |  8 ++++----
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++++
 docs/deferred-features.md                           |  4 ++--
 docs/index.md                                       |  4 ++--
 docs/qad-pathways.md                                |  8 ++++----
 docs/rfc-pathways-aws-hosting-migration.md          |  2 +-
 6 files changed, 26 insertions(+), 13 deletions(-)
8a; the publication and audit clients and the artifact helpers by S8b. |
d by S8a; the user management workspace and the MFA form split by S8b. |
board index by S7d; auth, profile, public and settings indexes by S8b. |
e per file by S8a; auth, profile, public and settings laid out by S8b. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S7c, S7d, S8a and S8b applied |
1
docs/deferred-features.md:20:features/public/public-project-detail.tsx
docs/deferred-features.md:37:features/public/public-project-detail.tsx
docs/deferred-features.md:93:features/public/public-project-detail.tsx
```


The replacement script reports 14 replacements in 5 files (the change record, the QAD, the deferred feature and the RFC rows and the two index rows), the `sed` edits add the audit rows, and the diff stat lists six documents with 26 lines added and 13 removed. The four audit lines end with the S8b sentences. The index status of the CR row ends `S7d, S8a and S8b applied` with no slice left to do (W1 adds its own words), and the `grep -c` line finds the S8b plan row marked `S8b executed` once. The last command looks for the old names (a component file directly in a feature folder, the deleted client and the renamed modules) and lists only the three lines that name the deleted `public-project-detail.tsx` in `docs/deferred-features.md` (history): every other path the living docs name follows the move (the historical documents, the audit rows and the change records keep the names they were written with).

- [ ] **Step 2: Activity log**

`.tmp/s8b/activity-s8b.md` is the S8b section of the activity log, with the commit hashes of Tasks 1 to 5 as `@H1@` to `@H5@` (`@H4A@` and `@H5A@` are the two test commits):

Create `.tmp/s8b/activity-s8b.md`:

```md

## @DATE@ Modularization S8b public, users, profile and auth web (S8b slice branch)
- Task 1 (@H1@): `publicationClient` and `auditClient` added to `lib/api` with `publication.test.ts` and `audit.test.ts`, which ran 49 cases (98 runs) against the old and the new client; a mutation of the transition path, the strict object, the snapshot timestamp and the page bound each fail a case, and the proof lists 13 declaration lines as not copied (the inline snapshot object and the old body type); `artifact-download.owner.test.ts` pinned the owner check of the old save helper (2 cases); web 301 files and 3378 tests became 304 and 3478.
- Task 2 (@H2@): 3 production files and 3 mock factories switched to the new clients, the artifact helpers moved to `lib/api/core/artifact-download.ts` (23 files changed one specifier), `core-feature-client.ts` and its test were deleted, the old rows of the characterization tests were dropped, and the old test file was cut into `core/owned-json-read.test.ts` (6 cases), `core/artifact-download.test.ts` (8) and two rows of `publication.test.ts` with all 47 titles kept (the cookie refusal case became two, one per subject), and seven mutations of the moved helpers and the owned read each fail a cut case; web 305 files and 3430 tests.
- Task 3 (@H3@): 46 files of `features/{auth,profile,public,settings}` moved into `components/` with the `.schema.ts` and `.utils.ts` names (the import specifiers and the contract test paths rewritten, 2 e2e specs edited), four `index.ts` files added, 21 leaf imports in 20 app route files point at them, and `indexedFeatures` and `optimizePackageImports` list the four names; the move changed no route (`routes 72, different 0`) and Middleware stayed at @M0@ kB.
- Task 4 (@H4A@, @H4@): 21 cases of `user-management-workspace.actions.test.tsx` and a shared fixture file pinned the list, filters, detail, edit, deactivation and load behavior on the unsplit workspace; `user-management-workspace.tsx` (938 lines) then became a 344 line workspace, two hooks and four components with `emptyEditor`, `formatAccountDate` and `UserEditorState` in `settings.utils.ts` (`same lines: 937, lost 0, added 60`), and eleven mutations of the moved code each fail the pinning cases; web 306 files and 3451 tests.
- Task 5 (@H5A@, @H5@): 21 cases of `mfa-form.states.test.tsx` pinned the form states on the unsplit code; `mfa-form.tsx` (717 lines) then became a 215 line form, `hooks/use-mfa-flow.ts` (373), `hooks/use-mfa-handoff.ts` (99) and two panels (`same lines: 672, lost 0, added 157`), `auth-navigation.contract.test.ts` reads the four files and keeps its assertions, and seven mutations of the moved code each fail one case; web 307 files and 3472 tests.
- Task 6: the change record, audit, QAD, deferred feature and RFC rows follow the new paths and the S8b disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and `apps/web/src/**` already route to the beneficiary privacy guardian and the design QA agent.
- Decisions: the S8b decisions are in the change record section 9; the S8 plan copy and this plan stay until the series is merged, then both are retired in a separate change.
- Deferred: `use-mfa-flow.ts` (373 lines), `audit-log-workspace.tsx` (399) and `publication-queue-workspace.tsx` (351) stay whole; the `lib/services/*` files that no slice owns stay for W1.
```


```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^feat(web): add the publication and audit clients')
H2=$(git log -1 --format=%h --grep='^refactor(web): move the publication and audit callers')
H3=$(git log -1 --format=%h --grep='^refactor(web): give auth, profile, public and settings')
H4A=$(git log -1 --format=%h --grep='^test(web): pin the user management')
H4=$(git log -1 --format=%h --grep='^refactor(web): split the user management')
H5A=$(git log -1 --format=%h --grep='^test(web): pin the MFA form')
H5=$(git log -1 --format=%h --grep='^refactor(web): split the MFA form')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4A@/$H4A/" -e "s/@H4@/$H4/" -e "s/@H5A@/$H5A/" -e "s/@H5@/$H5/" -e "s/@M0@/$(cat .tmp/s8b/m0)/" .tmp/s8b/activity-s8b.md
grep -c "@H[0-9AB]*@\|@DATE@\|@M0@" .tmp/s8b/activity-s8b.md
cat .tmp/s8b/activity-s8b.md >> docs/activity-log.md
tail -9 docs/activity-log.md | cut -c1-90
```


Expected:

```text
0
## <date> Modularization S8b public, users, profile and auth web (S8b slice branch)
- Task 1 (<sha>): `publicationClient` and `auditClient` added to `lib/api` with `public
- Task 2 (<sha>): 3 production files and 3 mock factories switched to the new clients, 
- Task 3 (<sha>): 46 files of `features/{auth,profile,public,settings}` moved into `com
- Task 4 (<sha>, <sha>): 21 cases of `user-management-workspace.actions.test.tsx` an
- Task 5 (<sha>, <sha>): 21 cases of `mfa-form.states.test.tsx` pinned the form stat
- Task 6: the change record, audit, QAD, deferred feature and RFC rows follow the new path
- Decisions: the S8b decisions are in the change record section 9; the S8 plan copy and th
- Deferred: `use-mfa-flow.ts` (373 lines), `audit-log-workspace.tsx` (399) and `publicatio
```


The first line counts placeholders left in the file: 0.

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S8b

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
Checked 1626 files in <ms>. No fixes applied.
<sha> docs: record modularization S8b
<sha> refactor(web): split the MFA form into a flow hook, a handoff hook and two panels
```


`docs:check` prints 0 failures and 0 warnings, the Task 0 baseline.

---

### Task 7: Release gates

**Files:**
- Modify: `docs/activity-log.md` (the gate line)

This slice opens no pull request, merges nothing and removes no plan copy: it is stacked below the end of the series, and the one pull request into `dev` that follows the last slice carries the DB replay and the other CI gates (its replay is the replay gate of this slice). The gates below run on the slice branch and are recorded in the activity log.

- [ ] **Step 1: Static gates**

The recursive test run uses the no-bail option as in Task 0, so a flake in one package does not hide the figures of the others:

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8b/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
.tmp/s8b/build-routes.sh gates
for t in baseline prelayout layout; do node .tmp/s8b/compare-routes.mjs .tmp/s8b/routes-$t.txt .tmp/s8b/routes-gates.txt | grep -E "\(\+|^routes"; done
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```


Expected:

```text
$ pnpm exec biome check .
Checked 1626 files in <ms>. No fixes applied.
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  54 passed (54)
packages/shared test:       Tests  885 passed (885)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  164 passed | 10 skipped (174)
apps/api test:       Tests  2642 passed | 21 skipped (2663)
apps/web test:  Test Files  307 passed (307)
apps/web test:       Tests  3472 passed (3472)
      Tests  59 passed (59)
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
exit 0
ƒ Middleware                                                      <n> kB
Middleware equals M0
/dashboard: <n> kB -> <n> kB (+1.0)
routes 72, different 15
routes 72, different 0
routes 72, different 0
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
```


Biome is clean, then the test summaries are the baselines with the web delta of Tasks 1 to 5 (`B_web` plus 6 files and 94 tests: 307 files and 3472 tests), and config, shared, imports, api and sad equal `B_config`, `B_shared`, `B_imports`, `B_api` and `B_sad` (19, 885, 94, 2642 passed and 21 skipped, 59). `--noUnusedLocals` lists only the two baseline lines. The build exits 0 and prints `Middleware equals M0`. The three compares are, in order, against the Task 0 build, the build before the layout move and the build right after it; each prints the routes that are bigger and the summary. In the replay the only bigger route is `/dashboard`, by 1 kB against the Task 0 build (the Task 3 Step 1 result, inside the bound), and the 14 smaller routes of that step make the first summary 15; the two splits changed no route, so the other two summaries say 0. A checkout that rounds differently may list other routes that move by 1 kB, or a split route 1 kB bigger (the replay clone without `apps/web/.env.local` showed `/auth/mfa` 1 kB bigger after the MFA split); the pass criterion is that no route is more than 1 kB bigger than the Task 0 table and Middleware equals `M0`. `docs:check` prints 0 failures and 0 warnings. The pass criterion is that no route is more than 1 kB bigger than the Task 0 table and Middleware equals `M0`. `docs:check` ends with the 6 baseline failures and 1 warning.

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


The replay printed `0` for the user id (root), `pwsh` and `docker` present, PostgreSQL 18 present (`clusterdb` is the first file of the folder) and `supabase` missing. The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root: the first lines are `HISTORICAL_MIGRATION_INTEGRITY=PASS` and then `initdb: error: cannot be run as root` and `PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.` S8b changes no migration, so when the replay cannot run here the CI replay of the final pull request of the series is the gate; record in the gate line of Step 5 which one ran.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, the `pnpm dev:local` boot and the route curls, both Playwright configs and the browser smoke) as pending local run in the activity log gate line and list it for the developer; do not skip Steps 1, 2 or 4. The two e2e specs that import the moved forms by relative path (`apps/web/e2e/mfa-access.spec.ts`, `password-login.spec.ts`) are part of that run. Stop anything on ports 3000 and 4000 first, then:

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation passes in full (27 of 27 in the last recorded run); the main suite shows the pass, fail and not run counts of the latest gate line in `docs/activity-log.md` that records an e2e run (39 pass, 9 fail, 22 not run, with the 9 failures in the MFA Verify helper, the password-login harness and the workflows seed end date; a later gate line wins). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev: sign in at `/staff/login`, and on `/auth/mfa` set up an authenticator for an account with no factor (the QR code and the collapsed setup key appear, the key copies), verify a code, and see the workspace open; sign in with an account that has one verified factor and see that no new factor is offered, and with an account that has several and see the factor select clear the typed code when changed; use the `Login` button to sign out from `/auth/mfa`; open `/staff/forgot-password`, `/staff/recover`, `/staff/reset-password`, `/auth/update-password`, `/auth/recovery/error` and `/auth/access-unavailable` and see each screen render; open `/settings/profile` and change a password with the TOTP step-up; open `/settings/users` and create, edit, deactivate and reactivate an account, search and filter the list, and open the detail dialog; open `/settings/audit` and page through the log; open `/settings/backups`; open `/transparency`, review a publication (submit, approve, publish, withdraw as the roles that may) and open a preview at `/transparency/<projectId>/preview`; open the public site (`/`, `/about`, `/organizations`, an organization page, `/public/projects` and a project tracker) signed out.

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s8b
pnpm sad:check --base "$(cat .tmp/s8b/base-sha)" --head HEAD --output .tmp/sad/s8b/manifest.json > .tmp/sad/s8b/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s8b/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```


Expected:

```text
exit 0
organization-isolation-checker 1
beneficiary-privacy-guardian 10
design-qa-agent 165
```


`.tmp/sad/s8b/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. The base is `.tmp/s8b/base-sha`, the staging commit Task 0 Step 1 recorded, so the paths of the slices below are not counted. The slice changes only web files and docs: the new clients and tests under `lib/api` (with the save characterization file) and the deleted `core-feature-client` files route to `beneficiary-privacy-guardian` (10), the auth navigation contract test under `lib/rbac` to `organization-isolation-checker` (1) and the app pages, the two e2e specs and the moved and split feature files to `design-qa-agent` (165, above the 60 path split).

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s8b/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s8b/assemble.mjs`, run `node .tmp/sad/s8b/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s8b/base-sha)" --head HEAD --reviews .tmp/sad/s8b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The replay of this plan could not dispatch the roles (it ran as a script, without subagents), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 6 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The bullet of the replay, to adapt with your own numbers (the web figures must equal the Task 0 baseline plus 6 files and 94 tests, the others the Task 0 baselines):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 885, imports 94, api 2642 passed and 21 skipped, web 307 files and 3472 tests, sad 59; `--noUnusedLocals` lists the two baseline lines; docs check 0 failures and 0 warnings; production build exit 0 with Middleware at M0 (102 kB in the replay clone); against the Task 0 build 15 routes differ by 1 kB (14 smaller, `/dashboard` 1 kB bigger since Task 2), against the pre-layout and layout builds none differs; local DB replay could not run as root (initdb refuses), so the CI replay of the final pull request of the series is the gate; seeds, dev servers, the compiled API probes, e2e and the browser smoke pending local run; SAD manifest design-qa-agent 165 paths, beneficiary-privacy-guardian 10 and organization-isolation-checker 1, role dispatch pending the cloud run; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S8b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -3
```


Expected:

```text
<sha> docs: record modularization S8b release gate results
<sha> docs: record modularization S8b
<sha> refactor(web): split the MFA form into a flow hook, a handoff hook and two panels
```


- [ ] **Step 6: Stop**

S8b is the last S slice of the roadmap. This plan is not edited, committed to or removed inside the slice, and the slice opens no pull request and merges nothing: the controller opens the stacked pull requests into `dev` after the last slice and retires the executed plan copies (`docs/superpowers/plans` holds 16 after Task 0, `s3b` to `s8b`) in a separate change after the series is merged. W1 (tooling and docs) is the next sub-project, stacked on this branch, and is outlined in the change record section 6.

---
