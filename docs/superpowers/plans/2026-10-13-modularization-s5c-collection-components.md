# S5c Collection Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay out `apps/web/src/features/collection` by concern with a public index and the surface rule, split the three oversized collection screens (`collection-workspace.tsx` 1640 lines, `import-workspace.tsx` 1110, `direct-form-entry-workspace.tsx` 654) into hooks and sections, take the form type list from the shared contract, and close the S5b carry-overs (the unused `VALIDATING` status, the duplicate `Ticket` type, the empty `pathwaysClient` mocks), with no change to any screen, request, response, permission decision or cache entry, and with no route bundle more than 3 kB bigger than before (the layout commit changes none; the cuts add module boundaries to the five collection routes, 2 kB each and 3 kB on `/collection/import`, which loads both screens).

**Architecture:** S5c is the last slice of S5 (S5a, the contracts and api splits, and S5b, the clients, the shared import hook, the views and the split test, are applied below it) and runs after S6b on the stack. The 63 files of the feature move into `forms/`, `import/` and `entry/` with `git mv`, and a script rewrites every specifier that named a moved module (`move-modules.mjs`); the route pages and the beneficiary registration section import the screens through the new `index.ts`. The three screens are then cut by line range (`cut.mjs`, with `same-lines.mjs` printing `lost 0` and listing the lines the cut adds), never retyped: the collection screen into six hooks that pass a flat state object to each other and five sections, the import screen into four hooks and five cards, the direct entry screen into three hooks and two component files. Before the collection screen is cut, 15 new rows pin its save, publish, export, open, create version, generate copy and proceed handlers, which no test reached, and 28 one-line mutations of those handlers are killed by them; after every cut the mutations that the old rows killed are killed again on the new files. The seven form type codes of the draft store and the web type are pinned to `digitalFormTypes` by rows that pass against the old code, then taken from it. Mechanical edits use one-off Node scripts under `.tmp/s5c/` (gitignored, never committed) whose content is given in full. The planner dry-ran every step in order on an exported copy of the S5b tip (S6a applied, S6b not) and replayed the whole sequence by one driver that executes the code blocks of this plan (the replayed tree is identical to the dry-run tree); the pre-flight scan then replayed the plan again on the real base, the S6b slice tip, and the counts and listings quoted below are that replay's: its `features/collection` tree is byte identical to the dry run's, and only the figures that S6b moved differ (the web test totals, the `pathways.ts` line, the `pathways-client` factory counts, the two feature lists, the Biome file totals and the route sizes).

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), React 19, Vitest 3.2, Biome 1.9.4.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9, including the S5b disposition and its "Deferred to S5c" paragraph, which this plan closes) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06 for the three screens, MOD-15 for the public index, MOD-16 for the form type copies).

## Rulings

Controller rulings for S5c. Each was checked on the dry-run copy and again in the pre-flight replay on the S6b tip; Task 0 recounts the anchors. The S5b plan's S5c outline (Tasks A to G) is the origin of this plan.

1. **Nine tasks, no further split.** Tasks 0 to 8 (baseline, layout and index, carry-overs and form types, collection hooks, collection sections, import screen, entry screen, records, gates) stay under the ten-task line; the outline's Tasks A to C are Tasks 3 to 6, D is Task 1, E is Task 2, F is Task 7 and G is Task 8. The largest, Task 3, is four commits and the one cut of the collection screen. No S5d outline follows. Cost if wrong: executor fatigue in a long plan.
2. **S5c runs after S6b and anchors only on what S6b leaves alone.** S6b edits `core-feature-client.ts`, moves `features/projects/budget-module`, the evaluation workspace and `features/reports`, and touches nothing in `features/collection`. Five files are edited by both slices: `types/pathways.ts` (S6b deletes 11 report and survey types), the `indexedFeatures` list of `import-direction.test.ts` and the `optimizePackageImports` list of `next.config.ts` (S6b appends `reports` to both), the change record and the audit. This plan therefore edits them only by text anchors and by an append that reads whatever the list holds (`index-lists.mjs`), never by line number, file hash or whole-file replacement, and Task 0 counts every anchor. The pre-flight replay ran on the real S6b slice tip, so `reports` is already in both lists when Task 1 appends `collection`, and the S6b lines of Task 0 print their present form. Cost if wrong: a counted replacement stops on its count, which is the intended failure.
3. **The layout follows CR section 3.3, one subfolder per concern.** `forms/` holds the form builder and the collection screen, `import/` the import screen, its preview parser, processing panel and value map editor and the three import hooks, `entry/` the direct entry screen, its field and its subject picker. `collection.utils.ts` (shared by the three), `collection.copy.ts` and `index.ts` stay at the top. Every file moves with `git mv`, so history follows, and a script rewrites the specifiers (`vi.mock` and dynamic imports included, and the one quoted path of the copy contract test). Cost if wrong: a rename.
4. **The index lists the four exports that files outside the feature use, by leaf path.** `CollectionWorkspace`, `ImportWorkspace`, `DirectFormEntryWorkspace` and `FormDefinitionEntryField` (the beneficiary registration section uses the last). An index file inside a subfolder that the feature index re-exports from would grow the route bundles under `optimizePackageImports` (CR 3.3, S2b), so the index has none. `collection` joins `indexedFeatures` and `optimizePackageImports` (the existing surface rule and agreement test cover it, shown by two mutations in Task 1), and Task 1 builds once and compares the route table. Cost if wrong: a bigger route bundle, which the build compare catches.
5. **`enumLabel` and `formTypeLabels` live in `collection.copy.ts`.** `import-status-labels.ts` is renamed to it with `git mv` (its test follows), and `formTypeLabels` leaves `digital-form-contract.ts` for it, keyed by the shared form type. Cost if wrong: a rename.
6. **The big screens become a flat state object and hooks that take it.** `useCollectionState` returns every state value, setter and ref the other parts read, `type CollectionState = ReturnType<typeof useCollectionState>`, and the later hooks take `(state, guard)` and destructure what they use; a section takes `Pick<CollectionState, ...>` of what it renders, generated from the names it uses. The hook returns exactly the names another part reads, so a part that reads a name outside its parameter fails the typecheck. Two lines carry `// biome-ignore lint/correctness/useExhaustiveDependencies: the refs of the state hook are stable` (guard) and `...the setters of the state hook are stable` (edits), because Biome treats values destructured from a parameter as unstable. The import and entry screens follow the same design with their own state hooks. Cost if wrong: a prop type that is wider than it needs to be, which the typecheck cannot see; the added lines listing is the review surface.
7. **Characterize before cutting, and claim only what the old rows killed.** Fifteen new rows pin the collection handlers no test reached (save, publish, export, open, create version, generate copy, proceed), 28 one-line mutations of them are killed on the unsplit screen, and the same text is mutated again on the hook files after the cut (38 mutations, with ten the older rows killed). For the import screen 12 of 30 mutations were killed on the unsplit screen and the same 12 are killed after the cut; for the entry screen 6 of 19. For the sections 6 of 11. The mutations that survive before survive after and are not claimed: they are test debt of the screens (12 handler mutations of the collection screen are equivalent to the guarded code or unreachable from it). One entry mutation (the subject lock on save) failed once under load in the first run and survived a rerun on the old code, so it is not claimed either. Cost if wrong: a cut that drops a guard the tests never reached; the `lost 0` proof and the hook order check cover the lines themselves.
8. **Screens are cut, never retyped.** `cut.mjs` builds each file from line ranges of the old file (hash-pinned) plus literal wrapper lines; `same-lines.mjs` prints `lost 0` and lists every added line, and the lines the plan rewrites (a signature, a `}}`, a type alias) are named with `--allow` and counted. The destructuring name lines of the sections are `--ignore`d on both sides. `same-lines` runs before Biome reflows anything. Cost if wrong: review time.
9. **Hook and effect order is the old one.** `hook-order.mjs` lists the effect-bearing hook calls of each old screen (`useEffect`, `useFormFields`, `useImportBatch`, `useServerProcessing` and the others) and the same calls across the new files in call order and fails when the sequences differ: 8 for the collection screen, 4 for the import screen, 3 for the entry screen. The context reads (`useCurrentRole`, `useDisplayLabels`) move relative to them and hold no effect. Cost if wrong: an effect that fires in another order, which the render tests would catch.
10. **No logic is merged.** The two import screens keep their own process loops (S5b ruling 7), and the first-save quirk of the collection screen stays: the first create after the form code changes is dropped silently because its ticket is already invalid; the new row rejects the first create and retries. The only duplicated declaration removed is the `Ticket` type, and a mutation of the shared type (renaming `finish`) fails the typecheck in the consumers. Cost if wrong: none.
11. **The carry-overs.** `ImportBatchStatus` becomes `ImportBatchResponse['status']`, which drops the unused `'VALIDATING'` (a probe that assigns it fails the typecheck). The 15 `pathways-client` mock factories of 15 test files (13 of them `pathwaysClient: {}`, two `pathwaysClient: api`) are all unreachable: replacing each with a factory that throws leaves every test green, so they go. Cost if wrong: a test that loads the module, caught by the probe.
12. **The form type list is pinned, then shared.** Rows that pass against the old code pin `formTypes` of `form-builder-session-draft.ts`, `DigitalFormType` and `formTypeLabels` to `digitalFormTypes` (four mutations fail them), then the draft set and the web type take the shared list (two mutations fail the same rows). `form-builder-session-draft.ts` has no production importer (a scan found only its test); it stays, because deleting dead code is not part of this slice, and it is named in the records. The label record stays: it is copy. Cost if wrong: a new form type that one copy misses, which the rows now catch.
13. **Cross-plan.** (a) The applied S6b plan tests `features/collection/hooks` for its `S5b present` line and lists no `features/collection/index.ts` among its S5b interfaces; this plan creates that file and adds `collection` to both feature lists (Task 1), and `features/collection/hooks` no longer exists after Task 1, so a later plan that needs an S5b or S5c marker tests `features/collection/index.ts`. S5b is present when `lib/api/forms.ts` and `features/collection/hooks/use-import-batch.ts` exist, which is what this plan's Task 0 checks. (b) The web `--noUnusedLocals` baseline line for `indicators` moves to `features/collection/forms/hooks/use-collection-state.ts`; S6c Task 8 and later plans must expect that path. (c) S6b appends `reports` to the two feature lists and this plan appends `collection`, so either order gives the same two lists with both. (d) The web test and file counts of every later plan include this slice (Task 8 gives the deltas). (e) S8 and S7 read no file edited here. Cost if wrong: a later Task 0 stops on a count or a path.
14. **Not done here.** The 12 unreachable handler mutants and the 18 import and 12 entry survivors stay as test debt. `collection-workspace.tsx` has 359 lines, the import screen 134 and the entry screen 74, so none stays above the 500 line flag; `use-batch-review.ts` (296 lines) and `import-mapping-card.tsx` (228) are the largest new files. No test file is split (none passes 600 lines). Cost if wrong: none.
15. **Builds and gates.** Every production build starts from a clean `.next`; Task 1 and Task 8 compare the route table with the Task 0 baseline (Task 1: no route differs; Task 8: no route more than 3 kB bigger, Middleware at `M0`, the value Task 0 measures; it differs by one kB between containers, and so do the baseline route sizes). The dry run measured the five collection routes at +2 kB of about 426 kB at the printed precision; the pre-flight replay on the S6b tip measured four of them at +2 kB of about 424 kB and `/collection/import`, which loads both screens, at +3 kB (432 to 435 kB), from the module boundaries of 29 new modules, none more. The memory digest stops a slice at 2 kB; this ruling lets the import route print 3 kB because it carries the module boundaries of two cuts, and a route above that stops the slice. Seeds, dev servers, e2e and the browser smoke are recorded as pending local run, and the DB replay is the CI gate of the final pull request of the series. No pull request is opened for this slice. No plan copy is removed inside the slice (this overrides the S5b outline's Task G): the controller removes the executed copies after the final merge of the series. No new SAD routing: `apps/web/src/**` already routes to the design QA agent. Cost if wrong: one glob in `scripts/sad/check.ts`.

## Interfaces assumed from earlier sub-projects

- S5a (from `@pathways/shared`): `digitalFormTypes` and `DigitalFormType` (the seven codes), `ImportBatchResponse` and the other import and form responses (S5b).
- S5b: `formsClient` and `importsClient` in `lib/api`; `features/collection/hooks/{use-form-fields,use-import-batch,use-server-processing}.ts`; the 14 views in `features/collection/components`; `collection.utils.ts` with the shared screen types; the collection screen test split into five files; `S5b applied` in the change record.
- S6a: only that the repository builds on its tip; S6b: `features/reports/index.ts` and `lib/api/finance.ts` exist (Task 0 checks), and `reports` is already in the two feature lists (Task 1 appends `collection` after it).
- F4a and F4b: `useCurrentRole`, `useDisplayLabels`, the operation guard pattern (`beginOperation` returning a ticket with `valid` and `finish`), and the `import-direction.test.ts` surface rule with `indexedFeatures` and the `optimizePackageImports` agreement test (S1b).

## Produces (names later plans consume)

- `features/collection/index.ts`: `CollectionWorkspace`, `ImportWorkspace`, `DirectFormEntryWorkspace`, `FormDefinitionEntryField`; `collection` in `indexedFeatures` and `optimizePackageImports`.
- `features/collection/collection.copy.ts`: `enumLabel`, `formTypeLabels`; `collection.utils.ts`: `OperationTicket`.
- `features/collection/forms/`: `forms.utils.ts`; `hooks/use-collection-{state,guard,loading,edits}.ts`, `use-form-actions.ts`, `use-import-actions.ts` (each with its `ReturnType` alias: `CollectionState`, `CollectionGuard`, `CollectionEdits`, `FormActions`, `ImportActions`); `components/{duplicate-decision,correction-table,save-draft-dialog,proceed-dialog,delete-field-dialog}.tsx`.
- `features/collection/import/`: `import.utils.ts`; `hooks/use-import-state.ts`, `use-import-loading.ts`, `use-batch-review.ts`, `use-batch-processing.ts`; `components/import-{upload-card,batch-list,batch-summary,mapping-card,rows-card}.tsx`.
- `features/collection/entry/`: `entry.utils.ts` (`verifySurveySubject`, `EntryProps`); `hooks/use-entry-{state,load,actions}.ts`; `components/{state-shell,entry-state-views,direct-entry-form}.tsx`.
- Web types: `DigitalFormType` is the shared type; `ImportBatchStatus` is `ImportBatchResponse['status']`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. No production file other than the three screens, the files they are cut into, the move of the rest of the feature and the six import lines of the pages changes; `pathways.ts` changes two type declarations. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit, and no file outside `features/collection` imports a deep path of it.
- Every move is checked by script: `move-modules.mjs` (files, Task 1), `same-lines.mjs` (code, Tasks 3 to 6) prints `lost 0` before Biome reflows anything, and `hook-order.mjs` (effects); `cut.mjs` stops on a source hash it was not written for.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any fixture; the new tests use the fictional ids and names of the existing collection tests.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s5c/trim-imports.mjs <file>` after removing code and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`indicators`, in `forms/hooks/use-collection-state.ts` once Task 3 has run and in `collection-workspace.tsx` before, and `SadddDashboard` in `types/pathways.ts`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit. The api and the web resolve `@pathways/shared` from its `dist`: this slice changes nothing in `packages/shared`, so one `pnpm --filter @pathways/shared build` in Task 0 is enough.
- Run `.tmp/s5c/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about two to three minutes, so give the command a ten minute timeout.
- Vitest cannot reference imported bindings in `vi.mock` factories, so the new test keeps its own `vi.hoisted` state and `vi.mock` calls (it reuses the first 138 lines of an existing collection test for them).
- Write the scripts and test files with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s5c/` (gitignored) and are never committed; build logs go there too. Use bash only. Vitest file arguments are relative to `apps/web` when run through `pnpm --filter @pathways/web exec`. The mutation runner `bite.mjs` exits 1 when a mutation survives and 0 when all are killed.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real; a mutation reported as killed by a single timeout under load is rerun alone before it is claimed. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the figures Task 0 marks as depending on the base (recount those and carry on with the recounted values).
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the pre-flight replay on the S6b tip and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared`, `B_api` and `B_web` (and `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s5c-9ept8o`, stacked on `claude/modularization-s6b-9ept8o`); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`. Do not touch migrations, seeds, `.env` files or review evidence.
- This slice opens no pull request: one pull request into `dev` follows every slice of the series, and its CI (including the DB replay) is the gate for the whole stack, so Task 8 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run (Task 8).

## Review Focus

1. Every moved line must be the same line: `same-lines` prints `lost 0` for the three screens and lists the added lines (53, 37, 59 and 40 in Tasks 3 to 6, with 13, 2, 1 and 6 changed lines allowed by name), which are signatures, `Pick` types, destructurings, calls and tags (Tasks 3 to 6).
2. The surface must be exactly the four exports: no deep import of `features/collection` outside it, the two mutations of Task 1 show the rule and the list agreement bite, and the layout commit changes no route size (Task 1; the cuts of Tasks 3 to 6 add 2 kB to four collection routes and 3 kB to `/collection/import`, Task 8).
3. The characterization rows must pin the old code: they pass before any cut and 28 mutations of the handlers fail them (Task 3); after each cut the mutations that were killed before are killed again (38, 6, 12 and 6).
4. Effects must run in the old order: `hook-order.mjs` for the three screens (Tasks 3, 5 and 6).
5. The form type list must be one list: the pins pass against the old code, four mutations fail them, then two fail them after the swap (Task 2).
6. No test is lost: the full names of the collection tests before the slice are all present after it (Task 8), and the only removed lines in test files are the 15 unreachable mock factories.

## File map

| Path | Role after S5c |
|---|---|
| `apps/web/src/features/collection/{index.ts,collection.copy.ts,collection.utils.ts}` | public surface, labels, shared screen types (Tasks 1, 5) |
| `apps/web/src/features/collection/forms/` | form builder and collection screen: `forms.utils.ts`, 6 hooks, 5 sections, tests (Tasks 2 to 4) |
| `apps/web/src/features/collection/import/` | import screen: `import.utils.ts`, 4 new hooks beside the 3 of S5b, 5 cards, tests (Task 5) |
| `apps/web/src/features/collection/entry/` | direct entry screen: `entry.utils.ts`, 3 hooks, 3 component files (Task 6) |
| `apps/web/src/types/pathways.ts`, `forms/form-builder-session-draft.ts` and tests | the shared form type list and the response status alias (Task 2) |
| `apps/web/src/app/(dashboard)/collection/**`, `features/beneficiaries/registration/components/registration-definition-section.tsx` | import the screens through the feature index (Task 1) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts` | `collection` in the two feature lists (Task 1) |
| `docs/` change record, audit, QAD, index, activity log | records (Task 7) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s5c-collection-components.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s5c/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `cut.mjs`, `same-lines.mjs`, `trim-imports.mjs`, `split-module.mjs`, `move-modules.mjs`, `index-lists.mjs`, `client-mocks.mjs`, `mock-scan.mjs`, `bite.mjs`, `hook-order.mjs`, `test-names.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S5b and S6b, and record the base**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s5c/files
git rev-parse HEAD > .tmp/s5c/base-sha
for b in s5b s6b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S5b record: $(grep -c '^S5b applied' $CR)"
echo "S6b record: $(grep -c '^S6b applied' $CR)"
F=apps/web/src
ls $F/features/collection/hooks | grep -v test
test -f $F/lib/api/finance.ts && test -f $F/features/reports/index.ts && echo "S6b web layout present" || echo "S6b web layout absent"
test -f $F/lib/api/forms.ts && test -f $F/lib/api/imports.ts && echo "S5b clients present"
test -f packages/shared/src/contracts/finance/finance-requests.ts && echo "S6a contracts present"
test -f docs/handoff/modularization-s5c-collection-components.md && echo "handoff copy present"
```

Expected: `git status --short` prints nothing, then the branch name, one line per stacked branch, the two record counts, the three S5b hooks and the marker lines:

```
claude/modularization-s5c-9ept8o
s5b branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
S5b record: 1
S6b record: 1
use-form-fields.ts
use-import-batch.ts
use-server-processing.ts
S6b web layout present
S5b clients present
S6a contracts present
handoff copy present
```

A line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a branch other than `claude/modularization-s5c-9ept8o`, a record count of `0`, an `absent` for the S6b layout or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. `.tmp/s5c/base-sha` is the head the branch has when Task 0 starts (the S6b tip, the docs-only commits that follow it on that branch, and the controller commit that stages this plan), so it is the base of every later comparison and of the SAD check; never compare it with a fixed hash. The pre-flight replay printed exactly this block with the S6b and S5b branches present as local refs.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `.tmp/s5c/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s5c/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s5c/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s5c/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s5c/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s5c/routes-$1.txt
grep Middleware .tmp/s5c/routes-$1.txt
```

`.tmp/s5c/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s5c/compare-routes.mjs`:

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

`.tmp/s5c/replace-exact.mjs` applies exact text replacements and fails unless each one matches the expected number of times, so every edit below is a counted, reviewable change:

Create `.tmp/s5c/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s5c/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s5c/cut.mjs` builds files from hash-pinned line ranges of one source file (Tasks 3 to 6):

Create `.tmp/s5c/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s5c/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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

`.tmp/s5c/split-module.mjs` splits a module's top-level declarations by name, verbatim and in order (Tasks 3, 5 and 6):

Create `.tmp/s5c/split-module.mjs`:

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

`.tmp/s5c/same-lines.mjs` fails when a line of the original is missing from the new files and lists the lines the split added; `--allow` names a line the plan rewrites and `--ignore` drops the name lines of a destructuring from both sides:

Create `.tmp/s5c/same-lines.mjs`:

```js
// Fails when a line of the original is lost; counts the lines the new files add (signatures, props, calls) and lists them with --list.
// Usage: same-lines.mjs <original> [--also <file>]... [--strip <regex>] [--ignore <regex>] [--allow <line>]... <new file>... [From=To]... [--list]; an --also file is part of the original (a module that already existed and received lines), --strip removes a pattern such as a type check from every line, an --ignore pattern drops matching lines from both sides (the name lines of a destructuring), an --allow line may be missing because the plan rewrites it.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const list = args.includes('--list')
const originals = []
const rest = []
let strip = null
let ignore = null
const allowed = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') continue
  if (args[i] === '--strip') strip = new RegExp(args[++i], 'g')
  else if (args[i] === '--ignore') ignore = new RegExp(args[++i])
  else if (args[i] === '--allow') allowed.push(args[++i])
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
    .filter((line) => line !== '' && !(ignore && ignore.test(line)))
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
let allowedCount = 0
for (const [line, n] of before) {
  const missing = n - (after.get(line) ?? 0)
  if (missing <= 0) continue
  if (allowed.includes(line)) allowedCount += missing
  else lost.push(`${line} (${n} -> ${after.get(line) ?? 0})`)
}
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
console.log(`original lines ${total}, lost ${lost.length}, allowed ${allowedCount}, added ${added}`)
process.exitCode = lost.length ? 1 : 0
```

`.tmp/s5c/trim-imports.mjs` drops imports that no longer appear in a file body, because Biome 1.9 does not flag unused imports:

Create `.tmp/s5c/trim-imports.mjs`:

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

`.tmp/s5c/move-modules.mjs` runs `git mv` for every entry of a move map and rewrites the specifiers that named a moved module or sit in a moved file (Task 1):

Create `.tmp/s5c/move-modules.mjs`:

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

`.tmp/s5c/index-lists.mjs` adds a feature to the two lists that name the indexed features (Task 1):

Create `.tmp/s5c/index-lists.mjs`:

```js
// Appends a feature to indexedFeatures in the direction test and to optimizePackageImports in next.config.ts, whatever other features the lists hold and however they are laid out.
// Usage: node .tmp/s5c/index-lists.mjs <feature>
import { readFileSync, writeFileSync } from 'node:fs'

const name = process.argv[2]
const edits = [
  ['apps/web/src/import-direction.test.ts', /(const indexedFeatures: readonly string\[\] = \[)([^\]]*)\]/, `'${name}'`],
  ['apps/web/next.config.ts', /(optimizePackageImports: \[)([^\]]*)\]/, `'@/features/${name}'`],
]
for (const [file, pattern, item] of edits) {
  const text = readFileSync(file, 'utf8')
  const found = pattern.exec(text)
  if (!found) throw new Error(`${file}: list not found`)
  const items = found[2]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (items.includes(item)) throw new Error(`${file}: ${item} is already listed`)
  items.push(item)
  writeFileSync(file, text.replace(pattern, (_whole, head) => `${head}${items.join(', ')}]`))
  console.log(`${file}: ${items.length} features`)
}
```

`.tmp/s5c/client-mocks.mjs` finds the `pathways-client` mock factories of the collection tests, writes a plan that makes each throw, or removes them (Task 2):

Create `.tmp/s5c/client-mocks.mjs`:

```js
// Finds the pathways-client mock factories of the collection tests; "probe" writes a bite plan that makes each factory throw, "drop" removes them.
// Usage: node .tmp/s5c/client-mocks.mjs probe|drop
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const mock = /vi\.mock\('@\/lib\/services\/pathways-client', \(\) => \(\{\s*pathwaysClient: [A-Za-z{}]+,?\s*\}\)\)\n/
const files = execFileSync('git', ['ls-files', 'apps/web/src/features/collection'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /\.test\.tsx?$/.test(file) && mock.test(readFileSync(file, 'utf8')))
if (process.argv[2] === 'probe') {
  const throwing = "vi.mock('@/lib/services/pathways-client', () => {\n  throw new Error('pathways-client was loaded')\n})\n"
  const mutations = files.map((file) => ({
    id: file.split('/').at(-1),
    file,
    from: mock.exec(readFileSync(file, 'utf8'))[0],
    to: throwing,
    tests: [file.replace('apps/web/', '')],
  }))
  writeFileSync('.tmp/s5c/probe-mocks.json', JSON.stringify({ tests: [], mutations }, null, 1))
} else {
  for (const file of files) writeFileSync(file, readFileSync(file, 'utf8').replace(mock, ''))
}
console.log(`${process.argv[2]}: ${files.length} test files`)
```

`.tmp/s5c/mock-scan.mjs` counts the `vi.mock` factories of one web module:

Create `.tmp/s5c/mock-scan.mjs`:

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

`.tmp/s5c/bite.mjs` applies each one-line mutation of a plan to its file, runs the named web tests, restores the file and prints whether a test failed:

Create `.tmp/s5c/bite.mjs`:

```js
// Applies each one-line mutation to its file, runs the named web tests, restores the file and prints how many tests failed.
// Usage: node .tmp/s5c/bite.mjs <mutations.json>; the file is { tests: [web-relative test path, ...], mutations: [{ id, file, from, to, tests? }, ...] }, each from text must occur exactly once and a mutation may name its own tests.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const report = '.tmp/s5c/bite-report.json'
let survived = 0
for (const { id, file, from, to, tests } of plan.mutations) {
  const original = readFileSync(file, 'utf8')
  const found = original.split(from).length - 1
  if (found !== 1) throw new Error(`${id}: expected 1 match of ${JSON.stringify(from)} in ${file}, found ${found}`)
  writeFileSync(file, original.replace(from, () => to))
  try {
    execFileSync(
      'pnpm',
      ['--filter', '@pathways/web', 'exec', 'vitest', 'run', '--bail=1', ...(tests ?? plan.tests), '--reporter=json', `--outputFile=${process.cwd()}/${report}`],
      { stdio: 'ignore' },
    )
  } catch {
    // A failing run exits non-zero; the report says how many tests failed.
  } finally {
    writeFileSync(file, original)
  }
  const results = JSON.parse(readFileSync(report, 'utf8'))
  const failed = results.testResults.flatMap((suite) => suite.assertionResults.filter((test) => test.status === 'failed'))
  const broken = results.testResults.filter((suite) => suite.status === 'failed' && suite.assertionResults.length === 0).length
  if (failed.length + broken === 0) survived++
  console.log(`${id}: ${failed.length + broken === 0 ? 'SURVIVES' : `fails ${failed.length}${broken ? ` (+${broken} suites)` : ''}`}`)
  rmSync(report)
}
console.log(`mutations ${plan.mutations.length}, survived ${survived}`)
process.exitCode = survived ? 1 : 0
```

`.tmp/s5c/hook-order.mjs` compares the order of the effect-bearing hook calls of a screen before a split with their order across the new files (Tasks 3, 5 and 6):

Create `.tmp/s5c/hook-order.mjs`:

```js
// Compares the order of the effect-bearing hook calls of a screen before a split with their order across the new files, taken in the order given.
// Usage: node .tmp/s5c/hook-order.mjs <original> <new file>...; hooks the split defines and the context reads that hold no effect are not compared.
import { readFileSync } from 'node:fs'

const [original, ...files] = process.argv.slice(2)
const defined = new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/function (use[A-Z]\w*)\(/g)].map((match) => match[1])))
const plain = new Set(['useState', 'useRef', 'useCallback', 'useMemo', 'useCurrentRole', 'useDisplayLabels', 'useContext', ...defined])
const calls = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  const from = Math.max(0, lines.findIndex((line) => /^(?:export )?(?:const|function) Owned\w+/.test(line)))
  return lines.flatMap((line, index) => {
    const name = /\b(use[A-Z]\w*)\(/.exec(line)?.[1]
    if (index < from || !name || plain.has(name) || /^\s*(\/\/|import |export function)/.test(line)) return []
    return [`${name} ${lines[index + 1]?.trim() ?? ''}`.replace(/\s+/g, ' ')]
  })
}
const before = calls(original)
const after = files.flatMap((file) => calls(file))
const same = before.length === after.length && before.every((call, index) => call === after[index])
console.log(`effect-bearing hook calls ${before.length}, same order ${same}`)
if (!same) console.log(JSON.stringify({ before, after }, null, 1))
process.exitCode = same ? 0 : 1
```

`.tmp/s5c/test-names.mjs` prints the sorted full names of the tests of a Vitest JSON report:

Create `.tmp/s5c/test-names.mjs`:

```js
// Prints the sorted full names of the tests in a Vitest JSON report, one per line.
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const names = report.testResults.flatMap((file) => file.assertionResults.map((test) => test.fullName))
console.log(names.sort().join('\n'))
```

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s5c/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s5c/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s5c/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s5c/m0
cat .tmp/s5c/m0
```

Expected: the figures of the pre-flight replay on the S6b tip. Write them down as the baselines; every later Expected is a delta from them. The filtered lines are the typecheck `Done` lines, the test summaries, the docs check, the build exit code and the Middleware line:

```
packages/config typecheck: Done
packages/shared typecheck: Done
packages/imports typecheck: Done
apps/web typecheck: Done
apps/api typecheck: Done
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  675 passed (675)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  243 passed (243)
apps/web test:       Tests  2228 passed (2228)
      Tests  57 passed (57)
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
exit 0
ƒ Middleware                                                      103 kB
103
```

The `sad:test` line is the one without a package prefix (`B_sad`). `docs:check` ends with `6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific` and `[ELIFECYCLE] Command failed with exit code 1.`: those 6 failures are the baseline and stay at 6 until the end. `build-routes.sh` prints `exit 0` and the Middleware line (`M0`, written to `.tmp/s5c/m0`: 103 kB in the cloud container and 102 kB in the planning and pre-flight containers, so the Middleware row of every later build is compared with `M0` and never with a fixed number). The package figures are `B_config`, `B_shared`, `B_imports`, `B_api` and `B_web`; they include whatever S6a and S6b added on the real branch, so record your own.

```bash
F=apps/web/src
C=$F/features/collection
for f in $C/collection-workspace.tsx $C/import-workspace.tsx $C/direct-form-entry-workspace.tsx $C/hooks/use-server-processing.ts $C/form-builder-session-draft.ts $C/form-builder-session-draft.test.ts $C/digital-form-contract.ts $C/import-status-labels.ts $C/collection.utils.ts; do echo "$(wc -l < $f) $(git hash-object $f | cut -c1-8) $f"; done
git ls-files $C | wc -l
git grep -l "lib/services/pathways-client" -- $C | wc -l
git grep -n "'VALIDATING'" -- $F | wc -l
git grep -n "export type ImportBatchStatus" -- $F/types/pathways.ts | wc -l
git grep -n "export type DigitalFormType" -- $F/types/pathways.ts | wc -l
grep -A1 "^  AssignableOfficerResponse," $F/types/pathways.ts | grep -c "^  FormResponse,"
git grep -n "const indexedFeatures: readonly string\[\] = \[" -- $F/import-direction.test.ts | wc -l
git grep -n "optimizePackageImports: \[" -- apps/web/next.config.ts | wc -l
git grep -n "^Deferred to S5c: " -- docs/cr-pathways-codebase-modularization.md | wc -l
git grep -n "features/collection/" -- $F | grep -v "^$C" | grep -v "^apps/web/src/app/" | cut -c1-150
git grep -n "features/collection" -- $F/app | wc -l
```

Expected: the line counts and hash prefixes of the nine files the plan cuts or edits (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT), then the counts and anchors it rests on:

```
1640 72257946 apps/web/src/features/collection/collection-workspace.tsx
1110 605db9da apps/web/src/features/collection/import-workspace.tsx
654 bfc7cc1c apps/web/src/features/collection/direct-form-entry-workspace.tsx
127 df20b3f3 apps/web/src/features/collection/hooks/use-server-processing.ts
148 e1a947b6 apps/web/src/features/collection/form-builder-session-draft.ts
125 f69ea585 apps/web/src/features/collection/form-builder-session-draft.test.ts
153 a52a80b7 apps/web/src/features/collection/digital-form-contract.ts
5 657b6744 apps/web/src/features/collection/import-status-labels.ts
87 f3c53fbd apps/web/src/features/collection/collection.utils.ts
63
15
1
1
1
1
1
1
1
apps/web/src/features/beneficiaries/registration/components/registration-definition-section.tsx:3:import { FormDefinitionEntryField } from '@/features
apps/web/src/features/ui-copy-cleanup.contract.test.ts:13:    'features/collection/collection-workspace.tsx',
7
```

In order: the 9 files; the number of files tracked in `features/collection` (63); the test files that mock `pathways-client` (15, the factories Task 2 removes); then one line each for the `'VALIDATING'` member, the `ImportBatchStatus` and `DigitalFormType` declarations, the line of the `@pathways/shared` import list that Task 2 extends, the `indexedFeatures` list, the `optimizePackageImports` list and the `Deferred to S5c` paragraph of the change record (the anchors of Tasks 1, 2 and 7: they are text anchors because S6b edits `types/pathways.ts`, the two lists and the same section of the change record, so none of the other three is a file hash); the two web files outside the folder that name it by a deep path (the beneficiary registration section and the copy contract test, both rewritten in Task 1); and the 7 route page lines that import the screens (Task 1 sends them through the index).

```bash
pnpm --filter @pathways/web exec vitest run src/features/collection --reporter=json --outputFile=$PWD/.tmp/s5c/names-before.json > /dev/null 2>&1
node .tmp/s5c/test-names.mjs .tmp/s5c/names-before.json > .tmp/s5c/names-before.txt
wc -l < .tmp/s5c/names-before.txt
sort -u .tmp/s5c/names-before.txt | wc -l
```

Expected: the full names of the collection tests are saved (Task 8 compares them with the names after the slice, so that no test is lost by a move; the second figure is the count of distinct names):

```
199
199
```

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s5c-collection-components.md docs/superpowers/plans/$(date +%F)-modularization-s5c-collection-components.md`. The handoff copy and its index row stay, and no plan copy is removed in this slice (the controller removes the executed copies after the final merge of the series).

In `docs/index.md` section 1.6, add one row after the last S5b plan row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s5c-collection-components.md docs/superpowers/plans/$D-modularization-s5c-collection-components.md
ROW="| [S5c collection components plan](superpowers/plans/$D-modularization-s5c-collection-components.md) | $D-modularization-s5c-collection-components.md | $D | S5c of the codebase modularization: the collection folders, the form type list, the collection screen hooks and sections, the import screen and the direct entry screen splits | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s5b-collection-web" docs/index.md | tail -1 | cut -d: -f1)
test -n "$LAST" && sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -q -m "docs: add the S5c collection components plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --name-only --format= HEAD
```

Expected: one added row, the same 6 baseline docs failures and a commit of two files (the plan copy's line count is not shown because it grows with the plan):

```
+| [S5c collection components plan](superpowers/plans/2026-10-13-modularization-s5c-collection-components.md) | 2026-10-13-modularization-s5

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
docs/index.md
docs/superpowers/plans/2026-10-13-modularization-s5c-collection-components.md
```

The row line is cut at 140 characters by the command. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).

---

### Task 1: Lay out the collection feature by concern, with a public index

**Files:**
- Create: `apps/web/src/features/collection/index.ts`
- Move (62 files, `git mv`): everything in `features/collection` except `collection.utils.ts` goes into `forms/`, `import/` or `entry/` (CR section 3.3); `import-status-labels.ts` and its test become `collection.copy.ts` and `collection.copy.test.ts`
- Modify: the specifiers of the moved files and of their importers; `forms/digital-form-contract.ts` and `collection.copy.ts` (`formTypeLabels`); the six route pages and `features/beneficiaries/registration/components/registration-definition-section.tsx` (import through the index); `apps/web/src/import-direction.test.ts` and `apps/web/next.config.ts` (the two feature lists); `features/ui-copy-cleanup.contract.test.ts` (one quoted path)
- Create (gitignored): `.tmp/s5c/layout-map.json`, `layout-edits.json`

The folder holds 63 files at the base, and CR section 3.3 puts a feature above about 30 files into one subfolder per concern. Nothing here changes a line of logic: `move-modules.mjs` moves each file with `git mv` and rewrites the specifier of every import, `vi.mock` and dynamic import that named a moved module (keeping the alias or relative form the line used), and the edits below are counted text replacements.

- [ ] **Step 1: Move the files**

`.tmp/s5c/layout-map.json` maps every old path (relative to `apps/web/src`) to its new one: the form builder and the collection screen with their tests and hooks into `forms/`, the import screen, its processing panel, value map editor, preview parser and hooks into `import/`, and the direct entry screen, its field and subject picker into `entry/`:

Create `.tmp/s5c/layout-map.json`:

```json
{
  "features/collection/collection-workspace.tsx": "features/collection/forms/components/collection-workspace.tsx",
  "features/collection/collection-workspace.access.test.tsx": "features/collection/forms/components/collection-workspace.access.test.tsx",
  "features/collection/collection-workspace.extend-projects.test.tsx": "features/collection/forms/components/collection-workspace.extend-projects.test.tsx",
  "features/collection/collection-workspace.forms.test.tsx": "features/collection/forms/components/collection-workspace.forms.test.tsx",
  "features/collection/collection-workspace.import-preview.test.tsx": "features/collection/forms/components/collection-workspace.import-preview.test.tsx",
  "features/collection/collection-workspace.import-upload.test.tsx": "features/collection/forms/components/collection-workspace.import-upload.test.tsx",
  "features/collection/collection-workspace.ownership.test.tsx": "features/collection/forms/components/collection-workspace.ownership.test.tsx",
  "features/collection/components/builder-view.tsx": "features/collection/forms/components/builder-view.tsx",
  "features/collection/components/forms-generator-view.tsx": "features/collection/forms/components/forms-generator-view.tsx",
  "features/collection/components/form-info-panel.tsx": "features/collection/forms/components/form-info-panel.tsx",
  "features/collection/components/journey-stage-selector.tsx": "features/collection/forms/components/journey-stage-selector.tsx",
  "features/collection/components/field-editor.tsx": "features/collection/forms/components/field-editor.tsx",
  "features/collection/components/toggle-row.tsx": "features/collection/forms/components/toggle-row.tsx",
  "features/collection/components/metadata-map-panel.tsx": "features/collection/forms/components/metadata-map-panel.tsx",
  "features/collection/components/form-preview-panel.tsx": "features/collection/forms/components/form-preview-panel.tsx",
  "features/collection/hooks/use-form-fields.ts": "features/collection/forms/hooks/use-form-fields.ts",
  "features/collection/hooks/use-form-fields.test.tsx": "features/collection/forms/hooks/use-form-fields.test.tsx",
  "features/collection/digital-form-contract.ts": "features/collection/forms/digital-form-contract.ts",
  "features/collection/digital-form-contract.test.ts": "features/collection/forms/digital-form-contract.test.ts",
  "features/collection/field-code-typing.test.ts": "features/collection/forms/field-code-typing.test.ts",
  "features/collection/form-builder-session-draft.ts": "features/collection/forms/form-builder-session-draft.ts",
  "features/collection/form-builder-session-draft.test.ts": "features/collection/forms/form-builder-session-draft.test.ts",
  "features/collection/form-definition-export.ts": "features/collection/forms/form-definition-export.ts",
  "features/collection/form-definition-export.test.ts": "features/collection/forms/form-definition-export.test.ts",
  "features/collection/import-workspace.tsx": "features/collection/import/components/import-workspace.tsx",
  "features/collection/import-workspace.form-loading.test.tsx": "features/collection/import/components/import-workspace.form-loading.test.tsx",
  "features/collection/import-workspace.identity.test.tsx": "features/collection/import/components/import-workspace.identity.test.tsx",
  "features/collection/import-workspace.ownership.test.tsx": "features/collection/import/components/import-workspace.ownership.test.tsx",
  "features/collection/import-workspace.processing.test.tsx": "features/collection/import/components/import-workspace.processing.test.tsx",
  "features/collection/import-workspace.resume.test.tsx": "features/collection/import/components/import-workspace.resume.test.tsx",
  "features/collection/import-workspace.suggestions.test.tsx": "features/collection/import/components/import-workspace.suggestions.test.tsx",
  "features/collection/import-processing-panel.tsx": "features/collection/import/components/import-processing-panel.tsx",
  "features/collection/import-processing-panel.test.tsx": "features/collection/import/components/import-processing-panel.test.tsx",
  "features/collection/import-value-map-editor.tsx": "features/collection/import/components/import-value-map-editor.tsx",
  "features/collection/import-value-map-editor.test.tsx": "features/collection/import/components/import-value-map-editor.test.tsx",
  "features/collection/import-value-map-editor.suggest.test.tsx": "features/collection/import/components/import-value-map-editor.suggest.test.tsx",
  "features/collection/components/import-view.tsx": "features/collection/import/components/import-view.tsx",
  "features/collection/components/summary-metric.tsx": "features/collection/import/components/summary-metric.tsx",
  "features/collection/components/mapping-table.tsx": "features/collection/import/components/mapping-table.tsx",
  "features/collection/components/data-preview.tsx": "features/collection/import/components/data-preview.tsx",
  "features/collection/components/import-validation-panel.tsx": "features/collection/import/components/import-validation-panel.tsx",
  "features/collection/components/summary-pill.tsx": "features/collection/import/components/summary-pill.tsx",
  "features/collection/hooks/use-import-batch.ts": "features/collection/import/hooks/use-import-batch.ts",
  "features/collection/hooks/use-import-batch.test.tsx": "features/collection/import/hooks/use-import-batch.test.tsx",
  "features/collection/hooks/use-server-processing.ts": "features/collection/import/hooks/use-server-processing.ts",
  "features/collection/import-auto-continue.ts": "features/collection/import/import-auto-continue.ts",
  "features/collection/import-auto-continue.test.ts": "features/collection/import/import-auto-continue.test.ts",
  "features/collection/import-preview.ts": "features/collection/import/import-preview.ts",
  "features/collection/import-preview.test.ts": "features/collection/import/import-preview.test.ts",
  "features/collection/import-preview-parse.ts": "features/collection/import/import-preview-parse.ts",
  "features/collection/import-preview.worker.ts": "features/collection/import/import-preview.worker.ts",
  "features/collection/collection-import-state.ts": "features/collection/import/collection-import-state.ts",
  "features/collection/collection-import-state.test.ts": "features/collection/import/collection-import-state.test.ts",
  "features/collection/direct-form-entry-workspace.tsx": "features/collection/entry/components/direct-form-entry-workspace.tsx",
  "features/collection/direct-form-entry-workspace.test.tsx": "features/collection/entry/components/direct-form-entry-workspace.test.tsx",
  "features/collection/direct-entry-ownership.test.tsx": "features/collection/entry/components/direct-entry-ownership.test.tsx",
  "features/collection/form-definition-entry-field.tsx": "features/collection/entry/components/form-definition-entry-field.tsx",
  "features/collection/form-definition-entry-field.test.tsx": "features/collection/entry/components/form-definition-entry-field.test.tsx",
  "features/collection/survey-subject-picker.tsx": "features/collection/entry/components/survey-subject-picker.tsx",
  "features/collection/survey-subject-picker.test.tsx": "features/collection/entry/components/survey-subject-picker.test.tsx",
  "features/collection/import-status-labels.ts": "features/collection/collection.copy.ts",
  "features/collection/import-status-labels.test.ts": "features/collection/collection.copy.test.ts"
}
```

`.tmp/s5c/layout-edits.json` has the ten edits that are not path rewrites: `formTypeLabels` leaves `digital-form-contract.ts` for `collection.copy.ts` (the CR names `collection.copy.ts` for labels and constants), the form info panel imports it from there, and the six route pages and the beneficiary registration section import the collection screens through the feature index:

Create `.tmp/s5c/layout-edits.json`:

```json
[
  ["apps/web/src/features/collection/forms/digital-form-contract.ts", "export const formTypeLabels: Record<DigitalFormType, string> = {\n  BENEFICIARY_REGISTRATION: 'Beneficiary registration',\n  TRAINING_SURVEY: 'Training survey',\n  PRE_TEST: 'Pre-test',\n  POST_TEST: 'Post-test',\n  OUTCOME_MONITORING: 'Outcome monitoring',\n  ACTIVITY_MONITORING: 'Activity monitoring',\n  OTHER: 'Other',\n}\n\n", "", 1],
  ["apps/web/src/features/collection/collection.copy.ts", "/** Sentence-cases a server enum", "import type { DigitalFormType } from '@/types/pathways'\n\nexport const formTypeLabels: Record<DigitalFormType, string> = {\n  BENEFICIARY_REGISTRATION: 'Beneficiary registration',\n  TRAINING_SURVEY: 'Training survey',\n  PRE_TEST: 'Pre-test',\n  POST_TEST: 'Post-test',\n  OUTCOME_MONITORING: 'Outcome monitoring',\n  ACTIVITY_MONITORING: 'Activity monitoring',\n  OTHER: 'Other',\n}\n\n/** Sentence-cases a server enum", 1],
  ["apps/web/src/features/collection/forms/components/form-info-panel.tsx", "import { formTypeLabels } from '../digital-form-contract'", "import { formTypeLabels } from '../../collection.copy'", 1],
  ["apps/web/src/app/(dashboard)/collection/page.tsx", "from '@/features/collection/forms/components/collection-workspace'", "from '@/features/collection'", 1],
  ["apps/web/src/app/(dashboard)/collection/forms/page.tsx", "from '@/features/collection/forms/components/collection-workspace'", "from '@/features/collection'", 1],
  ["apps/web/src/app/(dashboard)/collection/forms/new/page.tsx", "from '@/features/collection/forms/components/collection-workspace'", "from '@/features/collection'", 1],
  ["apps/web/src/app/(dashboard)/collection/projects/[projectId]/forms/[formId]/page.tsx", "from '@/features/collection/forms/components/collection-workspace'", "from '@/features/collection'", 1],
  ["apps/web/src/app/(dashboard)/collection/projects/[projectId]/forms/[formId]/entries/new/page.tsx", "from '@/features/collection/entry/components/direct-form-entry-workspace'", "from '@/features/collection'", 1],
  ["apps/web/src/app/(dashboard)/collection/import/page.tsx", "import { CollectionWorkspace } from '@/features/collection/forms/components/collection-workspace'\nimport { ImportWorkspace } from '@/features/collection/import/components/import-workspace'\n", "import { CollectionWorkspace, ImportWorkspace } from '@/features/collection'\n", 1],
  ["apps/web/src/features/beneficiaries/registration/components/registration-definition-section.tsx", "from '@/features/collection/entry/components/form-definition-entry-field'", "from '@/features/collection'", 1]
]
```

The public surface lists the four exports that files outside the feature use, by their leaf paths (CR section 3.3: an index file inside a subfolder that the feature index re-exports from would grow the route bundles under `optimizePackageImports`):

Create `apps/web/src/features/collection/index.ts`:

```ts
// Public surface of the collection feature for files outside it.
export { CollectionWorkspace } from './forms/components/collection-workspace'
export { ImportWorkspace } from './import/components/import-workspace'
export { DirectFormEntryWorkspace } from './entry/components/direct-form-entry-workspace'
export { FormDefinitionEntryField } from './entry/components/form-definition-entry-field'
```

```bash
C=apps/web/src/features/collection
git ls-files $C | wc -l
node .tmp/s5c/move-modules.mjs .tmp/s5c/layout-map.json | tail -1
node .tmp/s5c/replace-exact.mjs .tmp/s5c/layout-edits.json
node .tmp/s5c/index-lists.mjs collection
pnpm exec biome check --write apps/web/src apps/web/next.config.ts 2>&1 | tail -2
git add -A apps
git ls-files $C | wc -l
git ls-files $C | cut -d/ -f6- | grep -c "/"
git ls-files $C | cut -d/ -f6- | grep -v "/"
git status --short | cut -c1-2 | sort | uniq -c
```

Expected: the 63 files are counted, 62 are moved with 43 specifiers and 1 quoted path of the copy contract test rewritten (the last line of the move script), ten edits land in 10 files, the two feature lists grow to four features (`reports` is already listed), Biome formats 9 files, and the folder then holds 64 files (the 63 and the index): 60 sit in subfolders, and `collection.copy.test.ts`, `collection.copy.ts`, `collection.utils.ts` and `index.ts` stay at the top. The status shows 61 renames, 11 modified files, 2 added (the index and `collection.copy.ts`) and 1 deleted (`import-status-labels.ts`, whose content changed too much to count as a rename):

```
63
moved 62 files, rewrote 43 specifiers and 1 contract paths
10 replacements in 10 files
apps/web/src/import-direction.test.ts: 4 features
apps/web/next.config.ts: 4 features
Checked 744 files in <ms>. Fixed 9 files.
64
60
collection.copy.test.ts
collection.copy.ts
collection.utils.ts
index.ts
      2 A 
      1 D 
     11 M 
     61 R 
```

`index-lists.mjs` appends to whatever the lists hold, in whatever layout they have: S6b left `optimizePackageImports` in `next.config.ts` as one entry per line with a trailing comma and `indexedFeatures` as `['projects', 'beneficiaries', 'reports']`, so the script reads the entries, appends `collection` and lets Biome lay the list out again; the printed feature count is 4 for both.

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
pnpm --filter @pathways/web exec vitest run src/features/collection src/import-direction.test.ts src/features/ui-copy-cleanup.contract.test.ts src/features/beneficiaries 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
```

Expected: the typecheck is clean, only the two baseline `--noUnusedLocals` lines remain (`indicators` in the moved screen and `SadddDashboard`), and the collection folder, the direction test, the copy contract test and the beneficiary folder pass (50 files and 333 tests):

```
web typecheck clean
src/features/collection/forms/components/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but it
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  50 passed (50)
      Tests  333 passed (333)
```

- [ ] **Step 2: Prove the surface rule and the list agreement bite**

The direction test already holds the surface rule and the rule that `optimizePackageImports` names every indexed feature's barrel; adding `collection` to its list is the whole change. Two mutations show it now guards the new feature: a route page that imports the screen by its deep path, and the barrel missing from `next.config.ts`. Each must fail exactly one test and is restored.

```bash
P='apps/web/src/app/(dashboard)/collection/page.tsx'
cp "$P" .tmp/s5c/files/page.bak
sed -i "s#from '@/features/collection'#from '@/features/collection/forms/components/collection-workspace'#" "$P"
pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Tests +[0-9]|only through its index"
cp .tmp/s5c/files/page.bak "$P"
cp apps/web/next.config.ts .tmp/s5c/files/next-config.bak
sed -i "/'@\/features\/collection',/d" apps/web/next.config.ts
pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Tests +[0-9]"
cp .tmp/s5c/files/next-config.bak apps/web/next.config.ts
git status --short | wc -l
```

Expected: each mutation fails one of the five tests (the surface rule names the page and the deep import, the agreement test names the barrel), and the tree is back to the staged state of the 75 changed files:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/import-direction.test.ts > feature public surfaces > keeps every other file on the index of each indexed feature
+   "app/(dashboard)/collection/page.tsx -> @/features/collection/forms/components/collection-workspace (import features/collection only through its index)",
      Tests  1 failed | 4 passed (5)
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/import-direction.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/import-direction.test.ts > feature public surfaces > has Next optimize the barrel of each indexed feature so route bundles keep their size
      Tests  1 failed | 4 passed (5)
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/import-direction.test.ts
75
```

- [ ] **Step 3: Build and compare the routes, then commit**

The barrel is what `optimizePackageImports` has to keep out of the route bundles, so the first production build of the new layout is compared with the Task 0 build here, not only at the end.

```bash
.tmp/s5c/build-routes.sh layout
git checkout -- apps/web/next-env.d.ts
node .tmp/s5c/compare-routes.mjs .tmp/s5c/routes-baseline.txt .tmp/s5c/routes-layout.txt | tail -6
git add -A apps
git commit -q -m "refactor(web): lay out the collection feature by concern with a public index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -1
git show -M --summary --format= HEAD | grep -c "^ rename"
```

Expected: the build exits 0 with Middleware at `M0` (103 kB in the cloud container), no route differs from the Task 0 build (72 routes), and the commit holds 75 files, 75 lines added and 68 removed; the last line counts its 61 renames:

```
exit 0
ƒ Middleware                                                      103 kB
routes 72, different 0
 75 files changed, 75 insertions(+), 68 deletions(-)
61
```

A route that grew means a barrel import reached a bundle: check that the index lists leaf paths only and that `.next` was removed before the build (`build-routes.sh` does). The build log is `.tmp/s5c/web-build-layout.log`.

- [ ] **Step 4: Prove that only the named edits changed**

Every changed line of the commit is either an import specifier, a mock path, or one of the named edits. This lists the other changed lines; the commit is found by its subject, so the step also runs after later commits:

```bash
H=$(git log -1 --format=%h --grep='^refactor(web): lay out the collection feature')
git show -M --format= $H -- apps | grep -E '^[+-][^+-]' | grep -vE "from '|^[+-]import |vi\.(mock|doMock)\(|import\('" | cut -c1-110
```

Expected: only the named edits remain: the web `optimizePackageImports` list grows by `collection` (one entry per line, as S6b left it), `formTypeLabels` and `enumLabel` appear in `collection.copy.ts` and leave their old files, a one line comment heads the index, the copy contract test names the moved screen, the direction test list grows by `collection`, and Biome reorders one four line import list (the same four names removed and added):

```
+        '@/features/collection',
+export const formTypeLabels: Record<DigitalFormType, string> = {
+  BENEFICIARY_REGISTRATION: 'Beneficiary registration',
+  TRAINING_SURVEY: 'Training survey',
+  PRE_TEST: 'Pre-test',
+  POST_TEST: 'Post-test',
+  OUTCOME_MONITORING: 'Outcome monitoring',
+  ACTIVITY_MONITORING: 'Activity monitoring',
+  OTHER: 'Other',
+}
+/** Sentence-cases a server enum such as PARTIALLY_PROCESSED into "Partially processed". */
+export function enumLabel(value: string) {
+  const text = value.replaceAll('_', ' ').trim().toLowerCase()
+  return text.charAt(0).toUpperCase() + text.slice(1)
+}
-  type MappingRow,
-  createQuestionnaireMappingRows,
-  createSmartMappingRows,
-  getMappingReadiness,
+  type MappingRow,
+  createQuestionnaireMappingRows,
+  createSmartMappingRows,
+  getMappingReadiness,
-export const formTypeLabels: Record<DigitalFormType, string> = {
-  BENEFICIARY_REGISTRATION: 'Beneficiary registration',
-  TRAINING_SURVEY: 'Training survey',
-  PRE_TEST: 'Pre-test',
-  POST_TEST: 'Post-test',
-  OUTCOME_MONITORING: 'Outcome monitoring',
-  ACTIVITY_MONITORING: 'Activity monitoring',
-  OTHER: 'Other',
-}
-/** Sentence-cases a server enum such as PARTIALLY_PROCESSED into "Partially processed". */
-export function enumLabel(value: string) {
-  const text = value.replaceAll('_', ' ').trim().toLowerCase()
-  return text.charAt(0).toUpperCase() + text.slice(1)
-}
+// Public surface of the collection feature for files outside it.
-    'features/collection/collection-workspace.tsx',
+    'features/collection/forms/components/collection-workspace.tsx',
-const indexedFeatures: readonly string[] = ['projects', 'beneficiaries', 'reports']
+const indexedFeatures: readonly string[] = ['projects', 'beneficiaries', 'reports', 'collection']
```

---

### Task 2: The carry-overs and the web form type list

**Files:**
- Modify: `apps/web/src/types/pathways.ts` (`ImportBatchStatus`, `DigitalFormType`); `features/collection/forms/form-builder-session-draft.ts` and its test; `features/collection/collection.copy.test.ts`; 15 collection test files (the unused `pathways-client` mocks)
- Create (gitignored): `.tmp/s5c/batch-status-edits.json`, `form-type-tests-edits.json`, `form-type-source-edits.json`, `form-type-bite.json`, `form-type-bite-after.json`, `probe-mocks.json`

Three small items that the S5b review left for S5c, in the order of risk. The third carry-over, the duplicate `Ticket` type of `use-server-processing.ts`, is Task 5 Step 1, because the import screen needs the shared ticket type.

- [ ] **Step 1: Alias `ImportBatchStatus` to the response type**

`ImportBatchStatus` in `types/pathways.ts` still lists `'VALIDATING'`, a status the API no longer returns (S5b made `ImportBatchResponse['status']` the contract). Nothing in the web names that member, so the alias drops it and the union can no longer drift:

Create `.tmp/s5c/batch-status-edits.json`:

```json
[
  ["apps/web/src/types/pathways.ts", "export type ImportBatchStatus =\n  | 'UPLOADING'\n  | 'UPLOADED'\n  | 'MAPPED'\n  | 'VALIDATING'\n  | 'VALIDATED'\n  | 'PROCESSING'\n  | 'PARTIALLY_PROCESSED'\n  | 'PROCESSED'\n  | 'RECOVERY_REQUIRED'\n  | 'FAILED'\n", "export type ImportBatchStatus = ImportBatchResponse['status']\n", 1]
]
```

```bash
F=apps/web/src
git grep -n "VALIDATING" -- $F | grep -v "\.test\." | cut -c1-110
node .tmp/s5c/replace-exact.mjs .tmp/s5c/batch-status-edits.json
git grep -n "VALIDATING" -- $F | grep -v "\.test\." | wc -l
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
printf '%s\n' "import type { ImportBatchStatus } from './pathways'" "export const probe: ImportBatchStatus = 'VALIDATING'" > $F/types/probe-status.ts
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | grep "error TS" | cut -c1-120
rm $F/types/probe-status.ts
git checkout -- apps/web/next-env.d.ts
pnpm exec biome check $F/types/pathways.ts 2>&1 | tail -1
git add -A apps
git commit -q -m "refactor(web): alias the import batch status to the response type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -2
```

Expected: the member was named once, in the union; the alias removes it; the typecheck is clean; a probe file that assigns `'VALIDATING'` to the alias fails the typecheck (the alias is the response type, not a copy), and the commit changes one file:

```
apps/web/src/types/pathways.ts:708:  | 'VALIDATING'
1 replacements in 1 files
0
web typecheck clean
src/types/probe-status.ts(2,14): error TS2322: Type '"VALIDATING"' is not assignable to type '"RECOVERY_REQUIRED" | "FAI
Checked 1 file in <ms>. No fixes applied.
 apps/web/src/types/pathways.ts | 12 +-----------
 1 file changed, 1 insertion(+), 11 deletions(-)
```

- [ ] **Step 2: Drop the unused `pathwaysClient` mocks**

Fifteen collection test files declare `vi.mock('@/lib/services/pathways-client', ...)` with an empty object or with the shared `api` mock, left over from before S5b moved every collection call to `formsClient` and `importsClient`. The probe below replaces each factory with one that throws, so a test that still loads the module fails; if every test survives, no test loads it and the factory does nothing.

```bash
node .tmp/s5c/mock-scan.mjs lib/services/pathways-client | tail -1
node .tmp/s5c/client-mocks.mjs probe
node .tmp/s5c/bite.mjs .tmp/s5c/probe-mocks.json > .tmp/s5c/probe-mocks.out; tail -1 .tmp/s5c/probe-mocks.out
grep -c "SURVIVES" .tmp/s5c/probe-mocks.out
git status --short | wc -l
node .tmp/s5c/client-mocks.mjs drop
git grep -c "pathwaysClient" -- apps/web/src/features/collection | wc -l
node .tmp/s5c/mock-scan.mjs lib/services/pathways-client | tail -1
pnpm exec biome check --write apps/web/src/features/collection 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
```

Expected: the scan finds 51 `vi.mock` factories of `pathways-client` in the web (none naming a given export), the probe finds 15 test files and writes a plan of 15 mutations, every one survives (so the exit code 1 of the mutation runner is the expected result here), the tree is untouched by the probe, the drop removes the factories from the same 15 files, no collection file names `pathwaysClient` any more, 36 factories remain in the web, and the collection tests run as before (29 files and 199 tests):

```
factories 51, naming 0
probe: 15 test files
mutations 15, survived 15
15
0
drop: 15 test files
0
factories 36, naming 0
Checked 64 files in <ms>. No fixes applied.
 Test Files  29 passed (29)
      Tests  199 passed (199)
```

The dry run counts: the 15 factories were all unreachable, which is why a plain removal is a no-op. A test file that fails after the drop would mean a code path still loads `pathways-client`: put its factory back and report NEEDS_CONTEXT.

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps
git commit -q -m "test(web): drop the unused pathways-client mocks of the collection tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -1
```

Expected: 15 files, 19 lines removed:

```
 15 files changed, 19 deletions(-)
```

- [ ] **Step 3: Pin the form type list before the copies go**

The collection builder keeps two copies of the seven form type codes, `formTypes` in `form-builder-session-draft.ts` (a `Set` that decides whether a stored draft is kept) and the `DigitalFormType` union in `types/pathways.ts`, while `@pathways/shared` has had `digitalFormTypes` since S5a. A third list, `formTypeLabels`, keys the labels. Before any copy is replaced, rows pin all three to the shared list: the label keys equal `digitalFormTypes` in order, the web type equals the shared type (a type-level check), and the draft keeps a draft of each of the seven types and drops one of an unknown type. They run against the code as it stands, and four mutations (drop `OTHER` from the draft set, add `SURVEY`, swap two labels, rename a label) must fail them.

`.tmp/s5c/form-type-tests-edits.json` holds the four counted edits of the two tests:

Create `.tmp/s5c/form-type-tests-edits.json`:

```json
[
  ["apps/web/src/features/collection/forms/form-builder-session-draft.test.ts", "import { describe, expect, it, vi } from 'vitest'\n", "import { digitalFormTypes } from '@pathways/shared'\nimport { describe, expect, it, vi } from 'vitest'\n", 1],
  ["apps/web/src/features/collection/forms/form-builder-session-draft.test.ts", "    expect(readFormBuilderSessionDraft(target, key, null, draft.projectId)).toBeNull()\n  })\n})\n", "    expect(readFormBuilderSessionDraft(target, key, null, draft.projectId)).toBeNull()\n  })\n\n  it.each(digitalFormTypes)('keeps a draft of the %s form type', (formType) => {\n    const target = storage()\n    const key = formBuilderSessionDraftKey(scope)\n    writeFormBuilderSessionDraft(target, key, { ...draft, formType })\n    expect(\n      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId)?.formType,\n    ).toBe(formType)\n  })\n\n  it('drops a draft whose form type is not one the API defines', () => {\n    const target = storage()\n    const key = formBuilderSessionDraftKey(scope)\n    writeFormBuilderSessionDraft(target, key, { ...draft, formType: 'SURVEY' as never })\n    expect(target.getItem(key)).not.toBeNull()\n    expect(\n      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),\n    ).toBeNull()\n  })\n})\n", 1],
  ["apps/web/src/features/collection/collection.copy.test.ts", "import { describe, expect, it } from 'vitest'\n\nimport { enumLabel } from './collection.copy'\n", "import {\n  type DigitalFormType as SharedDigitalFormType,\n  digitalFormTypes,\n  importBatchResponse,\n} from '@pathways/shared'\nimport { describe, expect, expectTypeOf, it } from 'vitest'\n\nimport type { DigitalFormType } from '@/types/pathways'\n\nimport { enumLabel, formTypeLabels } from './collection.copy'\n", 1],
  ["apps/web/src/features/collection/collection.copy.test.ts", "    expect(enumLabel('')).toBe('')\n  })\n})\n", "    expect(enumLabel('')).toBe('')\n  })\n})\n\ndescribe('formTypeLabels', () => {\n  it('labels exactly the shared form types, in their order', () => {\n    expect(Object.keys(formTypeLabels)).toEqual([...digitalFormTypes])\n    expect(formTypeLabels).toEqual({\n      BENEFICIARY_REGISTRATION: 'Beneficiary registration',\n      TRAINING_SURVEY: 'Training survey',\n      PRE_TEST: 'Pre-test',\n      POST_TEST: 'Post-test',\n      OUTCOME_MONITORING: 'Outcome monitoring',\n      ACTIVITY_MONITORING: 'Activity monitoring',\n      OTHER: 'Other',\n    })\n  })\n\n  it('names the same form types and import batch statuses as the shared contract', () => {\n    expectTypeOf<DigitalFormType>().toEqualTypeOf<SharedDigitalFormType>()\n    expect(importBatchResponse.shape.status.options).toEqual([\n      'UPLOADING',\n      'UPLOADED',\n      'MAPPED',\n      'VALIDATED',\n      'PROCESSING',\n      'PARTIALLY_PROCESSED',\n      'PROCESSED',\n      'RECOVERY_REQUIRED',\n      'FAILED',\n    ])\n  })\n})\n", 1]
]
```

`.tmp/s5c/form-type-bite.json` is the mutation plan (each mutation names its own test file):

Create `.tmp/s5c/form-type-bite.json`:

```json
{
  "tests": [],
  "mutations": [
    {"id": "draft-drops-other", "file": "apps/web/src/features/collection/forms/form-builder-session-draft.ts", "from": "  'ACTIVITY_MONITORING',\n  'OTHER',\n])", "to": "  'ACTIVITY_MONITORING',\n])", "tests": ["src/features/collection/forms/form-builder-session-draft.test.ts"]},
    {"id": "draft-adds-survey", "file": "apps/web/src/features/collection/forms/form-builder-session-draft.ts", "from": "  'OTHER',\n])", "to": "  'OTHER',\n  'SURVEY',\n])", "tests": ["src/features/collection/forms/form-builder-session-draft.test.ts"]},
    {"id": "labels-swap-order", "file": "apps/web/src/features/collection/collection.copy.ts", "from": "  PRE_TEST: 'Pre-test',\n  POST_TEST: 'Post-test',\n", "to": "  POST_TEST: 'Post-test',\n  PRE_TEST: 'Pre-test',\n", "tests": ["src/features/collection/collection.copy.test.ts"]},
    {"id": "labels-rename", "file": "apps/web/src/features/collection/collection.copy.ts", "from": "  TRAINING_SURVEY: 'Training survey',", "to": "  TRAINING_SURVEY: 'Survey',", "tests": ["src/features/collection/collection.copy.test.ts"]}
  ]
}
```

```bash
C=apps/web/src/features/collection
node .tmp/s5c/replace-exact.mjs .tmp/s5c/form-type-tests-edits.json
pnpm exec biome check --write $C/collection.copy.test.ts $C/forms/form-builder-session-draft.test.ts 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/collection/collection.copy.test.ts src/features/collection/forms/form-builder-session-draft.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
node .tmp/s5c/bite.mjs .tmp/s5c/form-type-bite.json
git status --short | wc -l
```

Expected: 4 replacements in 2 files, Biome has nothing to fix, the two files pass with their rows (2 files and 15 tests, after the draft test gained 8 rows and the copy test 2), and each of the four mutations fails one row:

```
4 replacements in 2 files
Checked 2 files in <ms>. No fixes applied.
 Test Files  2 passed (2)
      Tests  15 passed (15)
draft-drops-other: fails 1
draft-adds-survey: fails 1
labels-swap-order: fails 1
labels-rename: fails 1
mutations 4, survived 0
2
```

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps
git commit -q -m "test(web): pin the form type list and its labels to the shared contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
```

Expected: two files, the added rows only:

```
 .../features/collection/collection.copy.test.ts    | 41 ++++++++++++++++++++--
 .../forms/form-builder-session-draft.test.ts       | 20 +++++++++++
 2 files changed, 59 insertions(+), 2 deletions(-)
```

- [ ] **Step 4: Take the type and the draft set from the shared list**

`DigitalFormType` becomes the shared type (under the local name the file already used), and `formTypes` becomes `new Set<string>(digitalFormTypes)`. The label record stays: it is copy, keyed by the shared type. `.tmp/s5c/form-type-source-edits.json` holds the four edits:

Create `.tmp/s5c/form-type-source-edits.json`:

```json
[
  ["apps/web/src/types/pathways.ts", "  AssignableOfficerResponse,\n  FormResponse,\n", "  AssignableOfficerResponse,\n  DigitalFormType as SharedDigitalFormType,\n  FormResponse,\n", 1],
  ["apps/web/src/types/pathways.ts", "export type DigitalFormType =\n  | 'BENEFICIARY_REGISTRATION'\n  | 'TRAINING_SURVEY'\n  | 'PRE_TEST'\n  | 'POST_TEST'\n  | 'OUTCOME_MONITORING'\n  | 'ACTIVITY_MONITORING'\n  | 'OTHER'\n", "export type DigitalFormType = SharedDigitalFormType\n", 1],
  ["apps/web/src/features/collection/forms/form-builder-session-draft.ts", "import { type DraftScope, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'\n", "import { digitalFormTypes } from '@pathways/shared'\n\nimport { type DraftScope, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'\n", 1],
  ["apps/web/src/features/collection/forms/form-builder-session-draft.ts", "const formTypes = new Set([\n  'BENEFICIARY_REGISTRATION',\n  'TRAINING_SURVEY',\n  'PRE_TEST',\n  'POST_TEST',\n  'OUTCOME_MONITORING',\n  'ACTIVITY_MONITORING',\n  'OTHER',\n])\n", "const formTypes = new Set<string>(digitalFormTypes)\n", 1]
]
```

`.tmp/s5c/form-type-bite-after.json` bites the new line twice (skip the first code, accept any string), again against the same rows:

Create `.tmp/s5c/form-type-bite-after.json`:

```json
{
  "tests": ["src/features/collection/forms/form-builder-session-draft.test.ts"],
  "mutations": [
    {"id": "draft-skips-first-type", "file": "apps/web/src/features/collection/forms/form-builder-session-draft.ts", "from": "new Set<string>(digitalFormTypes)", "to": "new Set<string>(digitalFormTypes.slice(1))"},
    {"id": "draft-accepts-any-string", "file": "apps/web/src/features/collection/forms/form-builder-session-draft.ts", "from": "new Set<string>(digitalFormTypes)", "to": "new Set<string>([...digitalFormTypes, 'SURVEY'])"}
  ]
}
```

```bash
C=apps/web/src/features/collection
node .tmp/s5c/replace-exact.mjs .tmp/s5c/form-type-source-edits.json
pnpm exec biome check --write apps/web/src/types/pathways.ts $C/forms/form-builder-session-draft.ts 2>&1 | tail -1
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
node .tmp/s5c/bite.mjs .tmp/s5c/form-type-bite-after.json
git status --short | wc -l
```

Expected: 4 replacements in 2 files, Biome formats one, the typecheck is clean with only the two baseline lines, the collection tests pass (29 files and 209 tests: the 199 and the 10 rows of the last step) and both mutations of the new line fail the draft rows:

```
4 replacements in 2 files
Checked 2 files in <ms>. Fixed 1 file.
web typecheck clean
src/features/collection/forms/components/collection-workspace.tsx(287,10): error TS6133: 'indicators' is declared but it
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  29 passed (29)
      Tests  209 passed (209)
draft-skips-first-type: fails 1
draft-accepts-any-string: fails 1
mutations 2, survived 0
2
```

```bash
git add -A apps
git commit -q -m "refactor(web): take the form type list from the shared contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
```

Expected: two files:

```
 .../features/collection/forms/form-builder-session-draft.ts  | 12 +++---------
 apps/web/src/types/pathways.ts                               | 10 ++--------
 2 files changed, 5 insertions(+), 17 deletions(-)
```

`form-builder-session-draft.ts` is not imported by any production file (a scan in the dry run found only its test); it stays, because deleting dead code is not part of this slice, and Task 7 records it.

---

### Task 3: The collection screen, pure parts, characterization and hooks

**Files:**
- Create: `apps/web/src/features/collection/forms/forms.utils.ts`; `forms/components/collection-workspace.actions.test.tsx`; `forms/hooks/{use-collection-state,use-collection-guard,use-collection-loading,use-collection-edits,use-form-actions,use-import-actions}.ts`
- Modify: `forms/components/collection-workspace.tsx` (1640 lines to 615)
- Create (gitignored): `.tmp/s5c/forms-split.json`, `actions-bite.json`, `hooks-cut.json`, `hooks-bite.json`, `files/`

`collection-workspace.tsx` holds the pure helpers of the form builder, the operation guard, the loading effects, the field and form edits, and the form and import handlers of one screen: 33 `useState` calls, 5 effects, the three S5b hooks (`useFormFields`, `useImportBatch` and `useServerProcessing`), and about 1100 lines of handlers that no existing test reaches except through the whole screen (S5b ruling 9). The order here is the order of risk: the pure declarations first (no behavior), then rows that pin the handlers to the code as it stands, then the hooks, cut by line range.

- [ ] **Step 1: Move the pure declarations to `forms.utils.ts`**

Nine declarations (`ExportFormat`, `CORRECTION_PAGE_SIZE`, `CollectionWorkspaceProps`, `toApiFormType`, `initialFields`, `modeDetails`, `importedFieldLabels`, `fieldFromHeader`, `formTitleFromFileName`) do not touch React. `split-module.mjs` moves them verbatim and in order; the plan below names where each goes and what the two headers hold (`@original` stands for the screen's own import block):

Create `.tmp/s5c/forms-split.json`:

```json
{
  "apps/web/src/features/collection/forms/forms.utils.ts": {
    "names": [
      "ExportFormat",
      "CORRECTION_PAGE_SIZE",
      "CollectionWorkspaceProps",
      "toApiFormType",
      "initialFields",
      "modeDetails",
      "importedFieldLabels",
      "fieldFromHeader",
      "formTitleFromFileName"
    ],
    "header": [
      "import type { DigitalFormType } from '@/types/pathways'",
      "",
      "import type { CollectionMode, CollectionView, FormField } from '../collection.utils'",
      "import { fieldCodeFromText } from './digital-form-contract'",
      "import type { FormDefinitionExportFormat } from './form-definition-export'"
    ]
  },
  "apps/web/src/features/collection/forms/components/collection-workspace.tsx": {
    "names": ["CollectionWorkspace", "OwnedCollectionWorkspace"],
    "header": [
      "@original",
      "import {",
      "  CORRECTION_PAGE_SIZE,",
      "  type CollectionWorkspaceProps,",
      "  type ExportFormat,",
      "  fieldFromHeader,",
      "  formTitleFromFileName,",
      "  initialFields,",
      "  modeDetails,",
      "  toApiFormType,",
      "} from '../forms.utils'"
    ]
  }
}
```

```bash
C=apps/web/src/features/collection/forms
cp $C/components/collection-workspace.tsx .tmp/s5c/files/collection-workspace.before-utils.tsx
node .tmp/s5c/split-module.mjs $C/components/collection-workspace.tsx .tmp/s5c/forms-split.json
sed -E -i 's/^(type|interface|const|function) (ExportFormat|CORRECTION_PAGE_SIZE|CollectionWorkspaceProps|toApiFormType|initialFields|modeDetails|importedFieldLabels|fieldFromHeader|formTitleFromFileName)\b/export \1 \2/' $C/forms.utils.ts
node .tmp/s5c/trim-imports.mjs $C/components/collection-workspace.tsx $C/forms.utils.ts | grep -v "removed nothing" | cut -c1-200
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/collection-workspace.before-utils.tsx $C/components/collection-workspace.tsx $C/forms.utils.ts
pnpm exec biome check --write $C 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
wc -l $C/components/collection-workspace.tsx $C/forms.utils.ts | head -2
```

Expected: the two files are written (133 and 1416 lines before Biome), the unused imports of the screen go (the form type, the field type, the field code helper and the export format type), `same-lines` prints `lost 0` and nothing added, Biome formats the screen's import block, the typecheck is clean, the collection tests pass as before (29 files and 209 tests) and the screen is 1506 lines:

```
apps/web/src/features/collection/forms/forms.utils.ts: 133 lines
apps/web/src/features/collection/forms/components/collection-workspace.tsx: 1416 lines
apps/web/src/features/collection/forms/components/collection-workspace.tsx: removed DigitalFormType, FormField, fieldCodeFromText, FormDefinitionExportFormat
original lines 1512, lost 0, allowed 0, added 0
Checked 25 files in <ms>. Fixed 1 file.
web typecheck clean
 Test Files  29 passed (29)
      Tests  209 passed (209)
 1506 apps/web/src/features/collection/forms/components/collection-workspace.tsx
  139 apps/web/src/features/collection/forms/forms.utils.ts
```

```bash
git add -A apps
git commit -q -m "refactor(web): move the pure declarations of the collection screen to forms.utils

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
```

Expected: two files:

```
 .../forms/components/collection-workspace.tsx      | 156 ++-------------------
 .../src/features/collection/forms/forms.utils.ts   | 139 ++++++++++++++++++
 2 files changed, 150 insertions(+), 145 deletions(-)
```

- [ ] **Step 2: Pin the form and import handlers before they move**

The existing rows reach the handlers only through the whole screen, and none presses Save, Publish, Export, Create new version, Generate copy or Proceed. `collection-workspace.actions.test.tsx` adds 15 rows (it reuses the preamble of `collection-workspace.forms.test.tsx`, its first 138 lines): draft save with a retry that reuses the same code, an update of a saved draft, edits kept after a save, publish, opening a saved draft and a published form, the export toast and the refusal for another project, create version, generate copy with its 64 character code, and the proceed dialog (a published form is required, the newest mapping revision is used, invalid rows stop the run, a column mismatch in both directions, a failed run closes with its message, a header-only file creates a form code of the right length). The save test records a quirk that stays as it is: the first create after the form code changes is dropped silently because its ticket is already invalid, so the test rejects the first create and retries.

Create `apps/web/src/features/collection/forms/components/collection-workspace.actions.test.tsx`:

```tsx
/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  createDigitalForm: vi.fn(),
  createDigitalFormVersion: vi.fn(),
  generateDigitalForm: vi.fn(),
  publishDigitalForm: vi.fn(),
  updateDigitalForm: vi.fn(),
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  getImportBatch: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForm: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const core = vi.hoisted(() => ({ downloadCoreArtifact: vi.fn() }))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  assignedProjectIds: ['futuremakers-ncr'],
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'collection.read',
      'forms.read',
      'forms.export',
      'forms.manage',
      'forms.templates.import',
      'forms.publish',
      'submissions.write',
      'imports.read',
      'imports.upload',
      'imports.review',
      'imports.validate',
      'imports.process',
    ],
    assignedProjectIds: ['futuremakers-ncr'],
  },
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => currentAccess,
}))

vi.mock('@/lib/services/core-feature-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/core-feature-client')>()),
  downloadCoreArtifact: core.downloadCoreArtifact,
}))

vi.mock('@/lib/api/forms', () => ({
  formsClient: {
    getDigitalForms: api.getDigitalForms,
    createDigitalForm: api.createDigitalForm,
    createDigitalFormVersion: api.createDigitalFormVersion,
    generateDigitalForm: api.generateDigitalForm,
    publishDigitalForm: api.publishDigitalForm,
    updateDigitalForm: api.updateDigitalForm,
    getDigitalForm: api.getDigitalForm,
  },
}))
vi.mock('@/lib/api/imports', () => ({
  importsClient: {
    uploadImport: api.uploadImport,
    automaticImportMapping: api.automaticImportMapping,
    getImportBatch: api.getImportBatch,
    saveImportMapping: api.saveImportMapping,
    validateImport: api.validateImport,
    processImport: api.processImport,
  },
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

beforeEach(() => {
  toasts.success.mockClear()
  sessionStorage.clear()
  currentAccess.profile.userId = 'actor-a'
  currentAccess.profile.organizationId = 'org-a'
  currentAccess.profile.assignedProjectIds = ['futuremakers-ncr']
  currentAccess.role = 'Monitoring and Evaluation Officer'
  currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  currentAccess.profile.permissions = [
    'projects.read',
    'activities.read',
    'monitoring.read',
    'collection.read',
    'forms.read',
    'forms.export',
    'forms.manage',
    'forms.templates.import',
    'forms.publish',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'imports.review',
    'imports.validate',
    'imports.process',
  ]
  api.getProjectsForRole.mockResolvedValue([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
  api.getDigitalForms.mockResolvedValue([])
  api.getActivities.mockResolvedValue([])
  api.getIndicators.mockResolvedValue([])
  // Mirrors the real helper: bytes are saved only while the caller still owns the request.
  core.downloadCoreArtifact.mockImplementation(
    async (_url: string, _fileName: string, isOwnerCurrent: () => boolean) => {
      if (!isOwnerCurrent()) throw new Error('Artifact ownership changed.')
      URL.createObjectURL(new Blob(['artifact']))
      document.createElement('a').click()
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const stamp = '2026-09-22T00:00:00Z'
const draft = {
  id: 'form-draft',
  projectId: 'futuremakers-ncr',
  code: 'intake_draft',
  version: 1,
  name: 'Intake draft',
  description: 'Kept description',
  formType: 'PRE_TEST',
  status: 'DRAFT',
  activityId: 'activity-1',
  journeyStageId: 'stage-1',
  updatedAt: stamp,
  createdByCurrentUser: false,
  fields: [
    {
      id: 'f1',
      code: 'choice',
      label: 'Choice',
      dataType: 'TEXT',
      required: true,
      metadataKey: false,
      sadddField: false,
    },
    {
      id: 'f2',
      code: 'count',
      label: 'Count',
      dataType: 'INTEGER',
      required: false,
      metadataKey: false,
      sadddField: false,
    },
  ],
}
const published = {
  ...draft,
  id: 'form-live',
  code: 'intake_live',
  name: 'Intake live',
  status: 'PUBLISHED',
  version: 2,
}
const renderOpenForm = (formId: string) =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialProjectId="futuremakers-ncr"
        initialFormId={formId}
        initialView="builder"
      />
    </DisplayLabelsProvider>,
  )
const renderFormsList = () =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace initialView="forms" />
    </DisplayLabelsProvider>,
  )
const saveFromDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Save form draft?' })).getByRole('button', {
      name: 'Save draft',
    }),
  )
}

describe('collection draft save', () => {
  it('retries a failed create with the same code, then updates the draft against its saved revision and server code', async () => {
    api.createDigitalForm
      .mockRejectedValueOnce(Object.assign(new Error('Rejected'), { status: 422 }))
      .mockImplementation(async (projectId, input) => ({
        ...draft,
        ...input,
        id: 'created-form',
        projectId,
        code: 'server_code',
        createdByCurrentUser: true,
      }))
    api.updateDigitalForm.mockImplementation(async (_projectId, _id, input) => ({
      ...draft,
      ...input,
      id: 'created-form',
    }))
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalledWith('futuremakers-ncr'))
    saveFromDialog()
    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalledOnce())
    const dialog = await screen.findByRole('dialog', { name: 'Save form draft?' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save draft' }).matches(':disabled')).toBe(
        false,
      ),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Draft saved to the server.'))
    expect(api.createDigitalForm).toHaveBeenCalledTimes(2)
    const codes = api.createDigitalForm.mock.calls.map((call) => call[1].code)
    expect(codes[0]).toMatch(/^journey_1_/)
    expect(codes[1]).toBe(codes[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalledOnce())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'created-form',
      expect.objectContaining({ code: 'server_code', expectedUpdatedAt: stamp }),
    )
  })

  it('keeps the edits of an opened form when the saved copy comes back from the server', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue({
      ...draft,
      name: 'Server title',
      updatedAt: '2026-09-23T00:00:00Z',
    })
    renderOpenForm('form-draft')
    const title = (await screen.findByDisplayValue('Intake draft')) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Edited title' } })
    saveFromDialog()
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Draft saved to the server.'))
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Edited title')
  })
})

describe('collection publish', () => {
  it('publishes the opened draft at its revision, reports it and returns to the Forms list', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.publishDigitalForm.mockResolvedValue({
      ...draft,
      status: 'PUBLISHED',
      updatedAt: '2026-09-24T00:00:00Z',
    })
    renderOpenForm('form-draft')
    fireEvent.click(await screen.findByRole('button', { name: 'Publish saved draft' }))
    await waitFor(() =>
      expect(api.publishDigitalForm).toHaveBeenCalledWith('futuremakers-ncr', 'form-draft', stamp),
    )
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Form published to the server.'),
    )
    expect(await screen.findByRole('button', { name: 'Open form' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish saved draft' })).toBeNull()
  })
})

describe('collection saved forms list', () => {
  it('opens a saved draft in the builder with its links and selects its first field', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue(draft)
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Open form' }))
    expect(((await screen.findByLabelText('Form title')) as HTMLInputElement).value).toBe(
      'Intake draft',
    )
    const selected = Array.from(document.querySelectorAll('button[aria-pressed="true"]'))
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('Choice')
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'form-draft',
      expect.objectContaining({
        description: 'Kept description',
        activityId: 'activity-1',
        journeyStageId: 'stage-1',
      }),
    )
  })

  it('opens a published form read-only with a notice', async () => {
    api.getDigitalForms.mockResolvedValue([published])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Open form' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'This published form is read-only in this view. Create a new version before changing its fields.',
      ),
    )
    expect(((await screen.findByLabelText('Form title')) as HTMLInputElement).value).toBe(
      'Intake live',
    )
  })

  it('reports the export and refuses a form of another project', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    api.getDigitalForms.mockResolvedValue([published])
    const view = renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Exported intake_live version 2 as CSV.'),
    )
    view.unmount()
    core.downloadCoreArtifact.mockClear()
    api.getDigitalForms.mockResolvedValue([{ ...published, projectId: 'other-project' }])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await act(async () => undefined)
    expect(core.downloadCoreArtifact).not.toHaveBeenCalled()
  })
})

describe('collection form versions and copies', () => {
  it('opens the new draft version with its own code, revision and details', async () => {
    const next = {
      ...draft,
      id: 'form-next',
      code: 'intake_live_v3',
      name: 'Intake next',
      description: 'Next description',
      formType: 'POST_TEST',
      activityId: 'activity-2',
      journeyStageId: 'stage-2',
      version: 3,
      updatedAt: '2026-09-25T00:00:00Z',
      fields: [{ ...draft.fields[0], id: 'g1', code: 'next_field', label: 'Next field' }],
    }
    api.getDigitalForms.mockResolvedValue([published])
    api.createDigitalFormVersion.mockResolvedValue(next)
    api.updateDigitalForm.mockResolvedValue(next)
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Create new version' }))
    await waitFor(() =>
      expect(api.createDigitalFormVersion).toHaveBeenCalledWith('futuremakers-ncr', 'form-live'),
    )
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('A new draft version is ready for editing.'),
    )
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Intake next')
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'form-next',
      expect.objectContaining({
        code: 'intake_live_v3',
        description: 'Next description',
        formType: 'POST_TEST',
        activityId: 'activity-2',
        journeyStageId: 'stage-2',
        expectedUpdatedAt: next.updatedAt,
        fields: [expect.objectContaining({ code: 'next_field' })],
      }),
    )
  })

  it('keeps a generated copy code within the 64 character limit', async () => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'forms.generate']
    api.getDigitalForms.mockResolvedValue([{ ...published, code: 'a'.repeat(64) }])
    api.generateDigitalForm.mockResolvedValue({
      ...published,
      id: 'form-copy',
      name: 'Intake live (copy)',
    })
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Generate copy' }))
    await waitFor(() => expect(api.generateDigitalForm).toHaveBeenCalledOnce())
    const code = api.generateDigitalForm.mock.calls[0]?.[1].code as string
    expect(code).toHaveLength(64)
    expect(code).toMatch(/^a+_copy_[a-z0-9]+$/)
  })
})

const csvFile = (name: string, text: string) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: async () => text })
  return file
}
const attendance = {
  id: 'published-form',
  projectId: 'futuremakers-ncr',
  code: 'attendance',
  name: 'Attendance',
  version: 1,
  formType: 'OTHER',
  status: 'PUBLISHED',
  updatedAt: stamp,
  activityId: null,
  journeyStageId: null,
  fields: [
    {
      code: 'beneficiary_id',
      label: 'Beneficiary ID',
      dataType: 'TEXT',
      required: true,
      metadataKey: true,
      sadddField: false,
    },
  ],
}
const totals = { rows: 2, valid: 2, invalid: 0, processed: 0, unprocessed: 2, failed: 0 }
const openImport = async (fileName: string, text: string, formId?: string) => {
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialMode="import"
        initialView="import"
        initialProjectId="futuremakers-ncr"
        initialFormId={formId}
      />
    </DisplayLabelsProvider>,
  )
  if (formId)
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
  else await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [csvFile(fileName, text)] },
  })
  await screen.findByText(/ready for/)
}
const confirmDialog = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))
}
const stageDataset = (detail: object) => {
  api.getDigitalForms.mockResolvedValue([attendance])
  api.uploadImport.mockResolvedValue({ id: 'batch-1', mappingRevision: 0, storageStatus: 'STORED' })
  api.automaticImportMapping.mockResolvedValue({ mappingRevision: 2 })
  api.getImportBatch.mockResolvedValue(detail)
  api.saveImportMapping.mockResolvedValue({ id: 'batch-1', mappingRevision: 3 })
}
const column = { key: 'column_0001', columnIndex: 1, header: 'beneficiary_id' }

describe('collection import proceed', () => {
  it('asks for a published form before importing data rows', async () => {
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001')
    confirmDialog('Proceed')
    expect(
      await screen.findByText('Open a published form for this project before importing data.'),
    ).toBeTruthy()
    expect(api.uploadImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves the mapping at the newest revision the server reports', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 3 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 3,
      validationRevision: 1,
      totals,
    })
    api.processImport.mockResolvedValue({
      id: 'batch-1',
      status: 'PROCESSED',
      totals: { ...totals, processed: 2, unprocessed: 0 },
    })
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    await waitFor(() => expect(api.saveImportMapping).toHaveBeenCalled())
    expect(api.saveImportMapping.mock.calls[0]?.[2]).toBe(3)
  })

  it('stops before processing when the server finds invalid rows', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 0 })
    api.validateImport.mockResolvedValue({
      id: 'batch-9',
      mappingRevision: 3,
      validationRevision: 1,
      totals: { ...totals, invalid: 2 },
    })
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    expect(
      await screen.findByText(
        'Server validation found 2 invalid rows. Review batch batch-9 before processing.',
      ),
    ).toBeTruthy()
    expect(api.processImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    [
      'fewer columns than the file',
      [],
      'The server source columns could not be matched to the reviewed file.',
    ],
    [
      'a different header',
      [{ ...column, header: 'other_header' }],
      'The server source columns differ from the reviewed file. Review the batch before continuing.',
    ],
  ])(
    'refuses to save a mapping when the server stored %s',
    async (_name, sourceColumns, message) => {
      stageDataset({ sourceColumns, mappingRevision: 0 })
      await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
      confirmDialog('Proceed')
      expect(await screen.findByText(message)).toBeTruthy()
      expect(api.saveImportMapping).not.toHaveBeenCalled()
    },
  )

  it('keeps a failed processing run resumable and says how far it got when the dialog is closed', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 0 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 3,
      validationRevision: 1,
      totals,
    })
    api.processImport.mockRejectedValue(new Error('Server stopped'))
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(
      await screen.findByText(
        'Import batch-1 paused after 2 of 2 rows. Resume it from the Import workspace.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates a form from a header-only file with a code within 64 characters and opens the Forms list', async () => {
    api.createDigitalForm.mockImplementation(async (projectId, input) => {
      const created = { ...draft, ...input, id: 'created-form', projectId }
      api.getDigitalForms.mockResolvedValue([created])
      return created
    })
    const title = 'A very long questionnaire title that keeps going and going and going on and on'
    await openImport(`${title}.csv`, 'beneficiary_id,attendance_status')
    confirmDialog('Create draft')
    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalled())
    const code = api.createDigitalForm.mock.calls[0]?.[1].code as string
    expect(code).toHaveLength(64)
    expect(code).toMatch(/^a_very_long_questionnaire_title/)
    expect(await screen.findByRole('button', { name: 'Open form' })).toBeTruthy()
  })
})
```

The rows pass against the code as it stands. Twenty-eight one-line mutations of the handlers (the code a save sends, the revision a publish uses, the view after a publish, the notice, stage, description and selected field of an opened draft, the project guard and the toast of the export, the fields, base, description, type, activity and stage of a new version, the generated code, and the guard, view, form code, revision, invalid rows, column length and difference and the paused close of the proceed flow) must each fail at least one row:

Create `.tmp/s5c/actions-bite.json`:

```json
{
  "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"],
  "mutations": [
    {"id": "save-code", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "const code = formCode || neatFormCode(formTitle)", "to": "const code = neatFormCode(formTitle)"},
    {"id": "save-form-code", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "      setFormCode(saved.code)\n      setSaveDialogOpen(false)", "to": "      setSaveDialogOpen(false)"},
    {"id": "save-dialog-close", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "      setFormCode(saved.code)\n      setSaveDialogOpen(false)\n      setSavedNotice('Draft saved to the server.')", "to": "      setFormCode(saved.code)\n      setSavedNotice('Draft saved to the server.')"},
    {"id": "publish-revision", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "        existing.id,\n        existing.updatedAt,\n      )\n      if (!ticket.valid()) return\n      setForms((current) => [...current.filter((form) => form.id !== published.id), published])", "to": "        existing.id,\n        '',\n      )\n      if (!ticket.valid()) return\n      setForms((current) => [...current.filter((form) => form.id !== published.id), published])"},
    {"id": "publish-view", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "      setSavedNotice('Form published to the server.')\n      setView('forms')", "to": "      setSavedNotice('Form published to the server.')"},
    {"id": "download-project-guard", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "if (!ticket || listed.projectId !== projectId) {", "to": "if (!ticket) {"},
    {"id": "download-success-toast", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "        `Exported ${listed.code} version ${listed.version} as ${exportFormat.toUpperCase()}.`,", "to": "        `Exported ${listed.code}.`,"},
    {"id": "open-saved-notice", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "'This published form is read-only in this view. Create a new version before changing its fields.',", "to": "'Read-only.',"},
    {"id": "open-saved-stage", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])\n    setFields(fromDigitalForm(form))", "to": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setIndicatorIds([])\n    setFields(fromDigitalForm(form))"},
    {"id": "open-saved-description", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    setFormDescription(form.description ?? '')\n    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])", "to": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])"},
    {"id": "open-saved-selected-field", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    setSelectedFieldId(fromDigitalForm(form)[0]?.id ?? '')\n    setView('builder')", "to": "    setView('builder')"},
    {"id": "open-saved-view", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    setView('builder')\n    if (form.status === 'PUBLISHED')", "to": "    if (form.status === 'PUBLISHED')"},
    {"id": "init-form-hydrate", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    initializedForm.current = initialFormId\n    setEditingFormId(form.id)", "to": "    setEditingFormId(form.id)"},
    {"id": "create-version-fields", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setFields(fromDigitalForm(created))\n", "to": ""},
    {"id": "create-version-base", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setEditingBaseUpdatedAt(created.updatedAt)\n                setFormCode(created.code)\n                setFormTitle(created.name)", "to": "                setFormCode(created.code)\n                setFormTitle(created.name)"},
    {"id": "generate-code", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "code: `${source.code.slice(0, 64 - suffix.length)}${suffix}`,", "to": "code: `${source.code.slice(0, 64)}${suffix}`,"},
    {"id": "create-version-description", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setFormDescription(created.description ?? '')\n", "to": ""},
    {"id": "create-version-type", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setFormType(created.formType)\n", "to": ""},
    {"id": "create-version-activity", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setLinkedActivityId(created.activityId ?? '')\n", "to": ""},
    {"id": "create-version-stage", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "                setJourneyStage(created.journeyStageId ?? '')\n", "to": ""},
    {"id": "proceed-published-only", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "throw new Error('Open a published form for this project before importing data.')", "to": "throw new Error('Open.')"},
    {"id": "proceed-created-view", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "        setProceedDialogOpen(false)\n        setView('forms')\n        return", "to": "        setProceedDialogOpen(false)\n        return"},
    {"id": "proceed-form-code", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "            .replace(/^_+|_+$/g, '')\n            .slice(0, 64),", "to": "            .replace(/^_+|_+$/g, ''),"},
    {"id": "proceed-revision", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "detail.mappingRevision ?? automaticRevision ?? uploaded.mappingRevision,", "to": "uploaded.mappingRevision,"},
    {"id": "proceed-invalid", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "`Server validation found ${validated.totals.invalid} invalid rows. Review batch ${validated.id} before processing.`,", "to": "`Invalid rows.`,"},
    {"id": "proceed-columns-length", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "throw new Error('The server source columns could not be matched to the reviewed file.')", "to": "throw new Error('x')"},
    {"id": "proceed-columns-differ", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "'The server source columns differ from the reviewed file. Review the batch before continuing.',", "to": "'x',"},
    {"id": "close-dialog-paused", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "`Import ${processingRun.batchId} paused after ${processingRun.progress.handled} of ${processingRun.progress.total} rows. Resume it from the Import workspace.`,", "to": "'Paused.',"}
  ]
}
```

```bash
C=apps/web/src/features/collection/forms/components
pnpm exec biome check $C/collection-workspace.actions.test.tsx 2>&1 | tail -1
pnpm --filter @pathways/web exec vitest run src/features/collection/forms/components/collection-workspace.actions.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
node .tmp/s5c/bite.mjs .tmp/s5c/actions-bite.json > .tmp/s5c/actions-bite.out; tail -1 .tmp/s5c/actions-bite.out
grep -c "fails" .tmp/s5c/actions-bite.out
git status --short | wc -l
```

Expected: Biome accepts the file, the 15 rows pass, the 28 mutations are all killed and the tree is back to the new file only:

```
Checked 1 file in <ms>. No fixes applied.
 Test Files  1 passed (1)
      Tests  15 passed (15)
mutations 28, survived 0
28
1
```

Twelve more mutants of the handlers survive these rows or cannot be reached from the screen (the expected revision of a save, the base revision, the read-only guard of a published form, the permission and draft-only checks of a publish, the editing id, ignored columns, the needed grants, a denied extension, duplicates, a missing file and an allowed field); they were found in the dry run, are equivalent to the guarded code or sit behind the same checks in the components, and stay as they were, noted in Task 7 as test debt of the collection screen.

```bash
git add -A apps
git commit -q -m "test(web): pin the form and import handlers of the collection screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object apps/web/src/features/collection/forms/components/collection-workspace.tsx | cut -c1-8
git show --stat --format= HEAD | tail -2
```

Expected: the screen hash is the one the cut plan is pinned to (`cut.mjs` stops on any other) and the commit adds one file of 15 rows:

```
813de2ef
 .../collection-workspace.actions.test.tsx          | 580 +++++++++++++++++++++
 1 file changed, 580 insertions(+)
```

- [ ] **Step 3: Cut the screen into six hooks**

The component becomes a 615 line screen and six hooks. Every hook is a function of the hooks before it, in the order of the screen's own declarations:

| Hook | Holds | Takes |
|---|---|---|
| `useCollectionState` | the profile and role, the 33 `useState` calls, the refs, `useFormFields` and `useImportBatch`, and two effects (the saved-notice toast and the mounted flag) | the props and `isCurrentOwner` |
| `useCollectionGuard` | the mounted flag, the intent and mutation counters, `eligible` and `beginOperation` (S5b ruling 9) | `state` |
| `useCollectionLoading` | the two loading effects: the project list with its retries, and the forms, activities and indicators of the selected project | `state`, `guard` |
| `useCollectionEdits` | the field edits, the effect that opens the form named by `initialFormId`, the change-project handlers and `startNewForm` | `state`, `guard` |
| `useFormActions` | parse, save, publish, export, open, create version and generate copy | `state`, `guard` |
| `useImportActions` | the import preview, mapping, proceed and process handlers | `state`, `guard` |

A hook returns exactly the names the other parts read, the screen destructures what it renders, and `type X = ReturnType<typeof useX>` is the type the later hooks take, so a hook that reads a name its provider does not return fails the typecheck. The cut plan was generated by a dev tool from a spec (not part of this plan) that finds every name a part uses from the others; every item is a line range of the old file, so the lines themselves are never retyped:

Create `.tmp/s5c/hooks-cut.json`:

```json
{
  "source": "apps/web/src/features/collection/forms/components/collection-workspace.tsx",
  "hash": "813de2ef",
  "files": {
    "apps/web/src/features/collection/forms/hooks/use-collection-state.ts": [
      "@imports",
      "",
      "export function useCollectionState({ initialMode = 'scratch', initialView = 'home', initialProjectId, initialFormId, isCurrentOwner }: CollectionWorkspaceProps & { isCurrentOwner: () => boolean }) {",
      "const { role, profile } = useCurrentRole()",
      [148, 157],
      [160, 272],
      [390, 390],
      "return { activities, addField, confirmDeleteField, correctionPage, createPending, creatingVersion, current, duplicateDecision, editingBaseUpdatedAt, editingFormId, fields, formCode, formCreate, formDescription, formTitle, formType, forms, formsLoaded, hydratedFormId, importBatch, importMessage, importStatus, indicatorIds, initialFormId, intent, isCurrentOwner, journeyStage, lastSelectedFileRef, linkedActivityId, loadError, mappingRows, mode, mounted, moveField, mutation, operationPending, parsedImport, parsing, pendingDeleteField, proceedDialogOpen, profile, projectId, projects, projectsLoaded, reloadKey, requestDeleteField, role, saveDialogOpen, selectedFieldId, setActivities, setCorrectionPage, setCreatingVersion, setDuplicateDecision, setEditingBaseUpdatedAt, setEditingFormId, setFields, setFormCode, setFormDescription, setFormTitle, setFormType, setForms, setFormsLoaded, setHydratedFormId, setImportMessage, setImportStatus, setIndicatorIds, setIndicators, setJourneyStage, setLinkedActivityId, setLoadError, setMappingRows, setMode, setOperationPending, setParsedImport, setPendingDeleteField, setProceedDialogOpen, setProjectId, setProjects, setProjectsLoaded, setReloadKey, setSaveDialogOpen, setSavedNotice, setSelectedFieldId, setUploadProgress, setView, updateField, uploadProgress, view }",
      "}",
      "",
      "export type CollectionState = ReturnType<typeof useCollectionState>"
    ],
    "apps/web/src/features/collection/forms/hooks/use-collection-guard.ts": [
      "@imports",
      "import type { CollectionState } from './use-collection-state'",
      "",
      "export function useCollectionGuard(state: CollectionState) {",
      "const { current, editingFormId, forms, hydratedFormId, intent, isCurrentOwner, lastSelectedFileRef, mounted, mutation, profile, projectId, projects, setOperationPending } = state",
      [133, 147],
      "// biome-ignore lint/correctness/useExhaustiveDependencies: the refs of the state hook are stable",
      [273, 344],
      [392, 395],
      "return { beginOperation, canGenerateForms, canManageForms, canOpenForms, canOpenImport, canPublishForms, canReadActivities, canReadForms, canReadIndicators, canUseExtend, editingReady, eligible }",
      "}",
      "",
      "export type CollectionGuard = ReturnType<typeof useCollectionGuard>"
    ],
    "apps/web/src/features/collection/forms/hooks/use-collection-loading.ts": [
      "@imports",
      "import type { CollectionState } from './use-collection-state'",
      "import type { CollectionGuard } from './use-collection-guard'",
      "",
      "export function useCollectionLoading(state: CollectionState, guard: CollectionGuard) {",
      "const { current, isCurrentOwner, profile, projectId, reloadKey, role, setActivities, setForms, setFormsLoaded, setIndicators, setLoadError, setProjectId, setProjects, setProjectsLoaded, view } = state",
      "const { canReadActivities, canReadForms, canReadIndicators, eligible } = guard",
      [396, 514],
      "}"
    ],
    "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts": [
      "@imports",
      "import type { CollectionState } from './use-collection-state'",
      "",
      "export function useCollectionEdits(state: CollectionState) {",
      "const { forms, importBatch, initialFormId, intent, lastSelectedFileRef, mutation, parsing, projectId, projects, setCorrectionPage, setEditingBaseUpdatedAt, setEditingFormId, setFields, setFormCode, setFormDescription, setFormTitle, setFormType, setForms, setHydratedFormId, setImportMessage, setImportStatus, setIndicatorIds, setJourneyStage, setLinkedActivityId, setMappingRows, setMode, setParsedImport, setProceedDialogOpen, setProjectId, setSavedNotice, setSelectedFieldId, setUploadProgress, setView } = state",
      [345, 354],
      [356, 389],
      [516, 554],
      "// biome-ignore lint/correctness/useExhaustiveDependencies: the setters of the state hook are stable",
      [555, 572],
      [612, 617],
      "const startNewForm = () => {",
      [1065, 1078],
      "}",
      "return { changeInput, changeProject, openBuilder, openSavedForm, savedForms, startNewForm, updateCorrectionCell }",
      "}",
      "",
      "export type CollectionEdits = ReturnType<typeof useCollectionEdits>"
    ],
    "apps/web/src/features/collection/forms/hooks/use-form-actions.ts": [
      "@imports",
      "import type { CollectionState } from './use-collection-state'",
      "import type { CollectionGuard } from './use-collection-guard'",
      "",
      "export function useFormActions(state: CollectionState, guard: CollectionGuard) {",
      "const { creatingVersion, editingBaseUpdatedAt, editingFormId, fields, formCode, formCreate, formDescription, formTitle, formType, forms, indicatorIds, journeyStage, linkedActivityId, projectId, setCreatingVersion, setEditingBaseUpdatedAt, setEditingFormId, setFields, setFormCode, setFormDescription, setFormTitle, setFormType, setForms, setHydratedFormId, setJourneyStage, setLinkedActivityId, setSaveDialogOpen, setSavedNotice, setSelectedFieldId, setView } = state",
      "const { beginOperation, canManageForms, canPublishForms, editingReady } = guard",
      [158, 159],
      [706, 797],
      [981, 1006],
      "const createNewVersion = async () => {",
      [1095, 1126],
      "}",
      "const generateCopy = async () => {",
      [1140, 1163],
      "}",
      "return { createNewVersion, downloadSavedForm, generateCopy, publishFormToApi, saveDraftToApi }",
      "}",
      "",
      "export type FormActions = ReturnType<typeof useFormActions>"
    ],
    "apps/web/src/features/collection/forms/hooks/use-import-actions.ts": [
      "@imports",
      "import type { CollectionState } from './use-collection-state'",
      "import type { CollectionGuard } from './use-collection-guard'",
      "",
      "export function useImportActions(state: CollectionState, guard: CollectionGuard) {",
      "const { current, duplicateDecision, editingBaseUpdatedAt, editingFormId, fields, formCreate, formDescription, formType, forms, importBatch, importStatus, intent, lastSelectedFileRef, mappingRows, mode, mutation, parsedImport, parsing, projectId, projects, selectedFieldId, setCorrectionPage, setEditingBaseUpdatedAt, setEditingFormId, setFields, setFormCode, setFormTitle, setForms, setHydratedFormId, setImportMessage, setImportStatus, setMappingRows, setParsedImport, setProceedDialogOpen, setSavedNotice, setSelectedFieldId, setUploadProgress, setView } = state",
      "const { beginOperation, canUseExtend, editingReady, eligible } = guard",
      [582, 605],
      [619, 704],
      [798, 980],
      "return { closeProceedDialog, confirmImportProceed, importCanProceed, importSummary, mappingReadiness, parseSelectedFile, processingRun, resumeServerProcessing, retrySelectedFile, stopServerProcessing }",
      "}",
      "",
      "export type ImportActions = ReturnType<typeof useImportActions>"
    ],
    "apps/web/src/features/collection/forms/components/collection-workspace.tsx": [
      "'use client'",
      "",
      "@imports",
      "import { useCollectionEdits } from '../hooks/use-collection-edits'",
      "import { useCollectionGuard } from '../hooks/use-collection-guard'",
      "import { useCollectionLoading } from '../hooks/use-collection-loading'",
      "import { useCollectionState } from '../hooks/use-collection-state'",
      "import { useFormActions } from '../hooks/use-form-actions'",
      "import { useImportActions } from '../hooks/use-import-actions'",
      "",
      [91, 123],
      "const OwnedCollectionWorkspace = (props: CollectionWorkspaceProps & { isCurrentOwner: () => boolean }) => {",
      "  const { labels } = useDisplayLabels()",
      "const state = useCollectionState(props)",
      "const guard = useCollectionGuard(state)",
      "useCollectionLoading(state, guard)",
      "const edits = useCollectionEdits(state)",
      "const formActions = useFormActions(state, guard)",
      "const importActions = useImportActions(state, guard)",
      "const { activities, addField, confirmDeleteField, correctionPage, createPending, creatingVersion, duplicateDecision, editingFormId, fields, formCreate, formTitle, formType, forms, formsLoaded, importMessage, importStatus, intent, journeyStage, linkedActivityId, loadError, mappingRows, mode, moveField, mutation, operationPending, parsedImport, pendingDeleteField, proceedDialogOpen, profile, projectId, projects, projectsLoaded, requestDeleteField, saveDialogOpen, selectedFieldId, setCorrectionPage, setDuplicateDecision, setFormTitle, setFormType, setJourneyStage, setLinkedActivityId, setLoadError, setMappingRows, setMode, setPendingDeleteField, setProceedDialogOpen, setReloadKey, setSaveDialogOpen, setSelectedFieldId, setView, updateField, uploadProgress, view } = state",
      "const { canGenerateForms, canManageForms, canOpenForms, canOpenImport, canPublishForms, canUseExtend, editingReady, eligible } = guard",
      "const { changeInput, changeProject, openBuilder, openSavedForm, savedForms, startNewForm, updateCorrectionCell } = edits",
      "const { createNewVersion, downloadSavedForm, generateCopy, publishFormToApi, saveDraftToApi } = formActions",
      "const { closeProceedDialog, confirmImportProceed, importCanProceed, importSummary, mappingReadiness, parseSelectedFile, processingRun, resumeServerProcessing, retrySelectedFile, stopServerProcessing } = importActions",
      [573, 580],
      [606, 610],
      [1007, 1063],
      "onCreate={startNewForm}",
      [1080, 1093],
      "onClick={createNewVersion}",
      [1128, 1138],
      "onClick={generateCopy}",
      [1165, 1506]
    ]
  }
}
```

Two comments are added to the cut: the hook of the guard and the hook of the field edits destructure refs and setters that React guarantees stable, and Biome's `useExhaustiveDependencies` does not know that for values taken from a parameter, so the lines carry `// biome-ignore lint/correctness/useExhaustiveDependencies: the refs of the state hook are stable` (guard) and `...the setters of the state hook are stable` (edits). `same-lines` is told the ten lines the plan rewrites: the screen's signature (it takes `props` now and `useCollectionState` destructures them), the closing `}}` and the two handler lines that became calls.

The effect order is the old one: `hook-order.mjs` lists the eight effect-bearing hook calls of the old screen and the new files in call order (`useEffect`, `useFormFields`, `useImportBatch`, `useEffect` three times, `useServerProcessing`) and fails when the sequence differs.

```bash
C=apps/web/src/features/collection/forms
cp $C/components/collection-workspace.tsx .tmp/s5c/files/collection-workspace.before-hooks.tsx
node .tmp/s5c/cut.mjs .tmp/s5c/hooks-cut.json
FILES="$C/hooks/use-collection-state.ts $C/hooks/use-collection-guard.ts $C/hooks/use-collection-loading.ts $C/hooks/use-collection-edits.ts $C/hooks/use-form-actions.ts $C/hooks/use-import-actions.ts"
node .tmp/s5c/trim-imports.mjs $FILES $C/components/collection-workspace.tsx | grep -c "removed"
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/collection-workspace.before-hooks.tsx --allow 'const OwnedCollectionWorkspace = ({' --allow "initialMode = 'scratch'," --allow "initialView = 'home'," --allow 'initialProjectId,' --allow 'initialFormId,' --allow 'isCurrentOwner,' --allow '}: CollectionWorkspaceProps & { isCurrentOwner: () => boolean }) => {' --allow '}}' --allow 'onCreate={() => {' --allow 'onClick={async () => {' $C/components/collection-workspace.tsx $FILES --list > .tmp/s5c/added-hooks.txt
tail -1 .tmp/s5c/added-hooks.txt
grep -c "^[0-9]*x " .tmp/s5c/added-hooks.txt
pnpm exec biome check --write $C 2>&1 | tail -2
node .tmp/s5c/hook-order.mjs .tmp/s5c/files/collection-workspace.before-hooks.tsx $FILES $C/components/collection-workspace.tsx
wc -l $FILES $C/components/collection-workspace.tsx
```

Expected: the seven files are written, seven of them lose unused imports, `same-lines` prints `lost 0` with 13 allowed and 53 added lines (45 distinct lines are listed in `.tmp/s5c/added-hooks.txt`: the six signatures, the destructurings, the `return` lists and the calls), Biome formats seven files, the hook order is the same, and the files have these sizes:

```
apps/web/src/features/collection/forms/hooks/use-collection-state.ts: 218 lines
apps/web/src/features/collection/forms/hooks/use-collection-guard.ts: 187 lines
apps/web/src/features/collection/forms/hooks/use-collection-loading.ts: 213 lines
apps/web/src/features/collection/forms/hooks/use-collection-edits.ts: 219 lines
apps/web/src/features/collection/forms/hooks/use-form-actions.ts: 277 lines
apps/web/src/features/collection/forms/hooks/use-import-actions.ts: 390 lines
apps/web/src/features/collection/forms/components/collection-workspace.tsx: 582 lines
7
original lines 1387, lost 0, allowed 13, added 53
45
Checked 32 files in <ms>. Fixed 7 files.
effect-bearing hook calls 8, same order true
  250 apps/web/src/features/collection/forms/hooks/use-collection-state.ts
  132 apps/web/src/features/collection/forms/hooks/use-collection-guard.ts
  151 apps/web/src/features/collection/forms/hooks/use-collection-loading.ts
  179 apps/web/src/features/collection/forms/hooks/use-collection-edits.ts
  224 apps/web/src/features/collection/forms/hooks/use-form-actions.ts
  373 apps/web/src/features/collection/forms/hooks/use-import-actions.ts
  615 apps/web/src/features/collection/forms/components/collection-workspace.tsx
 1924 total
```

`.tmp/s5c/added-hooks.txt` lists the added lines. Read it once; it is the whole review surface of this step together with the two `biome-ignore` comments and the allowed signature lines.

```bash
C=apps/web/src/features/collection/forms
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
pnpm --filter @pathways/web exec vitest run src/features/collection src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
pnpm exec biome check apps/web/src 2>&1 | tail -1
```

Expected: the typecheck is clean, the `--noUnusedLocals` list holds two lines (the `indicators` constant is now in `use-collection-state.ts`, the second is the shared type of `types/pathways.ts`), and the collection tests and the direction test pass (31 files and 229 tests: 224 and 5):

```
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  31 passed (31)
      Tests  229 passed (229)
Checked 751 files in <ms>. No fixes applied.
```

Thirty-eight mutations of the moved handlers, 28 of them the plan of Step 2 retargeted onto the hook files (the same text, found in its new file) and ten that the older collection rows already killed, must fail the same rows now that the lines sit in hooks:

Create `.tmp/s5c/hooks-bite.json`:

```json
{
  "tests": ["src/features/collection/forms/components/collection-workspace.access.test.tsx", "src/features/collection/forms/components/collection-workspace.extend-projects.test.tsx", "src/features/collection/forms/components/collection-workspace.forms.test.tsx", "src/features/collection/forms/components/collection-workspace.import-preview.test.tsx", "src/features/collection/forms/components/collection-workspace.import-upload.test.tsx", "src/features/collection/forms/components/collection-workspace.ownership.test.tsx", "src/features/collection/forms/components/collection-workspace.actions.test.tsx"],
  "mutations": [
    {"id": "save-code", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "    const code = formCode || neatFormCode(formTitle)", "to": "    const code = neatFormCode(formTitle)", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "save-form-code", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setFormCode(saved.code)\n      setSaveDialogOpen(false)", "to": "      setSaveDialogOpen(false)", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "save-dialog-close", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setFormCode(saved.code)\n      setSaveDialogOpen(false)\n      setSavedNotice('Draft saved to the server.')", "to": "      setFormCode(saved.code)\n      setSavedNotice('Draft saved to the server.')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "publish-revision", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "        existing.id,\n        existing.updatedAt,\n      )\n      if (!ticket.valid()) return\n      setForms((current) => [...current.filter((form) => form.id !== published.id), published])", "to": "        existing.id,\n        '',\n      )\n      if (!ticket.valid()) return\n      setForms((current) => [...current.filter((form) => form.id !== published.id), published])", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "publish-view", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setSavedNotice('Form published to the server.')\n      setView('forms')", "to": "      setSavedNotice('Form published to the server.')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "download-project-guard", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "    if (!ticket || listed.projectId !== projectId) {", "to": "    if (!ticket) {", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "download-success-toast", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "        `Exported ${listed.code} version ${listed.version} as ${exportFormat.toUpperCase()}.`,", "to": "        `Exported ${listed.code}.`,", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "open-saved-notice", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "        'This published form is read-only in this view. Create a new version before changing its fields.',", "to": "        'Read-only.',", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "open-saved-stage", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])\n    setFields(fromDigitalForm(form))", "to": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setIndicatorIds([])\n    setFields(fromDigitalForm(form))", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "open-saved-description", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    setFormDescription(form.description ?? '')\n    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])", "to": "    setFormType(form.formType)\n    setLinkedActivityId(form.activityId ?? '')\n    setJourneyStage(form.journeyStageId ?? '')\n    setIndicatorIds([])", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "open-saved-selected-field", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    setSelectedFieldId(fromDigitalForm(form)[0]?.id ?? '')\n    setView('builder')", "to": "    setView('builder')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "open-saved-view", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    setView('builder')\n    if (form.status === 'PUBLISHED')", "to": "    if (form.status === 'PUBLISHED')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "init-form-hydrate", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    initializedForm.current = initialFormId\n    setEditingFormId(form.id)", "to": "    setEditingFormId(form.id)", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-fields", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setFields(fromDigitalForm(created))\n", "to": "", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-base", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setEditingBaseUpdatedAt(created.updatedAt)\n      setFormCode(created.code)\n      setFormTitle(created.name)", "to": "      setFormCode(created.code)\n      setFormTitle(created.name)", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "generate-code", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "        code: `${source.code.slice(0, 64 - suffix.length)}${suffix}`,", "to": "        code: `${source.code.slice(0, 64)}${suffix}`,", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-description", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setFormDescription(created.description ?? '')\n", "to": "", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-type", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setFormType(created.formType)\n", "to": "", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-activity", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setLinkedActivityId(created.activityId ?? '')\n", "to": "", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "create-version-stage", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      setJourneyStage(created.journeyStageId ?? '')\n", "to": "", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-published-only", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "        throw new Error('Open a published form for this project before importing data.')", "to": "        throw new Error('Open.')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-created-view", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "        setProceedDialogOpen(false)\n        setView('forms')\n        return", "to": "        setProceedDialogOpen(false)\n        return", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-form-code", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "            .replace(/^_+|_+$/g, '')\n            .slice(0, 64),", "to": "            .replace(/^_+|_+$/g, ''),", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-revision", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "        detail.mappingRevision ?? automaticRevision ?? uploaded.mappingRevision,", "to": "        uploaded.mappingRevision,", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-invalid", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "          `Server validation found ${validated.totals.invalid} invalid rows. Review batch ${validated.id} before processing.`,", "to": "          `Invalid rows.`,", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-columns-length", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "        throw new Error('The server source columns could not be matched to the reviewed file.')", "to": "        throw new Error('x')", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "proceed-columns-differ", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "            'The server source columns differ from the reviewed file. Review the batch before continuing.',", "to": "            'x',", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "close-dialog-paused", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "        `Import ${processingRun.batchId} paused after ${processingRun.progress.handled} of ${processingRun.progress.total} rows. Resume it from the Import workspace.`,", "to": "        'Paused.',", "tests": ["src/features/collection/forms/components/collection-workspace.actions.test.tsx"]},
    {"id": "save-form-type", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      formType: toApiFormType(formType),\n      activityId: linkedActivityId || undefined,", "to": "      formType: 'OTHER',\n      activityId: linkedActivityId || undefined,"},
    {"id": "save-activity-link", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      activityId: linkedActivityId || undefined,\n      journeyStageId: journeyStage || undefined,", "to": "      journeyStageId: journeyStage || undefined,"},
    {"id": "save-journey-link", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "      journeyStageId: journeyStage || undefined,\n      fields,\n    })\n    const ticket = beginOperation('forms.manage')", "to": "      fields,\n    })\n    const ticket = beginOperation('forms.manage')"},
    {"id": "open-builder-view", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "    setView(nextMode === 'import' || nextMode === 'extend' ? 'import' : 'builder')", "to": "    setView('builder')"},
    {"id": "correction-cell", "file": "apps/web/src/features/collection/forms/hooks/use-collection-edits.ts", "from": "      rows[rowIndex] = { ...rows[rowIndex], [column]: value }", "to": "      rows[rowIndex] = { ...rows[rowIndex] }"},
    {"id": "generate-name", "file": "apps/web/src/features/collection/forms/hooks/use-form-actions.ts", "from": "        name: `${source.name.slice(0, 150)} (copy)`,", "to": "        name: `${source.name.slice(0, 150)}`,"},
    {"id": "proceed-staged", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "          `Import ${uploaded.id} was staged. Unresolved mappings and processing require an authorized reviewer.`,", "to": "          `Import ${uploaded.id} was staged.`,"},
    {"id": "proceed-error", "file": "apps/web/src/features/collection/forms/hooks/use-import-actions.ts", "from": "      setImportMessage(error instanceof Error ? error.message : 'Import failed.')\n      setProceedDialogOpen(false)", "to": "      setImportMessage(error instanceof Error ? error.message : 'Import failed.')"},
    {"id": "delete-dialog-label", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "        confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}", "to": "        confirmLabel=\"Delete\""},
    {"id": "mode-cards-visible", "file": "apps/web/src/features/collection/forms/components/collection-workspace.tsx", "from": "    if (item.id === 'import') return canOpenImport", "to": "    if (item.id === 'import') return true"}
  ]
}
```

```bash
node .tmp/s5c/bite.mjs .tmp/s5c/hooks-bite.json > .tmp/s5c/hooks-bite.out; tail -1 .tmp/s5c/hooks-bite.out
grep -c "fails" .tmp/s5c/hooks-bite.out
git status --short | wc -l
```

Expected: all 38 mutations are killed, all 38 report a failing row, and the tree holds only the 7 changed files of the cut (the screen and the six hook files):

```
mutations 38, survived 0
38
7
```

```bash
git add -A apps
git commit -q -m "refactor(web): cut the collection screen into state, guard, loading, edit and action hooks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object apps/web/src/features/collection/forms/components/collection-workspace.tsx | cut -c1-8
git show --stat --format= HEAD | tail -8
```

Expected: the screen hash is the one the next cut plan is pinned to, and the commit holds 7 files, six of them new:

```
00754575
 .../forms/components/collection-workspace.tsx      | 1087 ++------------------
 .../collection/forms/hooks/use-collection-edits.ts |  179 ++++
 .../collection/forms/hooks/use-collection-guard.ts |  132 +++
 .../forms/hooks/use-collection-loading.ts          |  151 +++
 .../collection/forms/hooks/use-collection-state.ts |  250 +++++
 .../collection/forms/hooks/use-form-actions.ts     |  224 ++++
 .../collection/forms/hooks/use-import-actions.ts   |  373 +++++++
 7 files changed, 1407 insertions(+), 989 deletions(-)
```

---

### Task 4: Cut the sections out of the collection screen

**Files:**
- Create: `apps/web/src/features/collection/forms/components/{duplicate-decision,correction-table,save-draft-dialog,proceed-dialog,delete-field-dialog}.tsx`
- Modify: `forms/components/collection-workspace.tsx` (615 lines to 359)
- Create (gitignored): `.tmp/s5c/sections-cut.json`, `sections-bite-killed.json`

After Task 3 the screen is 615 lines, of which 280 are five blocks of markup: the duplicate decision select, the editable correction table, the save draft dialog, the proceed dialog and the delete field confirmation. Each becomes a component in its own file (CR section 3.3: one exported component per file) by line range, taking the hook results it reads as `Pick` props (so a component that reads a name outside its `Pick` fails the typecheck) and destructuring them first, which keeps every moved line the same line. Where a block read a value the screen had narrowed (`parsedImport` is not null inside the table) the component takes it as its own prop with the narrowed type.

Create `.tmp/s5c/sections-cut.json`:

```json
{
  "source": "apps/web/src/features/collection/forms/components/collection-workspace.tsx",
  "hash": "00754575",
  "files": {
    "apps/web/src/features/collection/forms/components/duplicate-decision.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { CollectionState } from '../hooks/use-collection-state'",
      "",
      "export function DuplicateDecision({ state }: { state: Pick<CollectionState, 'duplicateDecision' | 'intent' | 'mutation' | 'setDuplicateDecision'> }) {",
      "const { duplicateDecision, intent, mutation, setDuplicateDecision } = state",
      "return (",
      [338, 361],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/forms/components/correction-table.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { CollectionState } from '../hooks/use-collection-state'",
      "import type { CollectionEdits } from '../hooks/use-collection-edits'",
      "",
      "export function CorrectionTable({ state, edits, parsedImport }: { state: Pick<CollectionState, 'correctionPage' | 'setCorrectionPage'>; edits: Pick<CollectionEdits, 'updateCorrectionCell'>; parsedImport: NonNullable<CollectionState['parsedImport']> }) {",
      "const { correctionPage, setCorrectionPage } = state",
      "const { updateCorrectionCell } = edits",
      [365, 370],
      "return (",
      [372, 443],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/forms/components/save-draft-dialog.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { CollectionState } from '../hooks/use-collection-state'",
      "import type { FormActions } from '../hooks/use-form-actions'",
      "",
      "export function SaveDraftDialog({ state, formActions, mappedCount, sadddCount }: { state: Pick<CollectionState, 'createPending' | 'fields' | 'formCreate' | 'formTitle' | 'mutation' | 'operationPending' | 'saveDialogOpen' | 'setSaveDialogOpen'>; formActions: Pick<FormActions, 'saveDraftToApi'>; mappedCount: number; sadddCount: number }) {",
      "const { createPending, fields, formCreate, formTitle, mutation, operationPending, saveDialogOpen, setSaveDialogOpen } = state",
      "const { saveDraftToApi } = formActions",
      "return (",
      [492, 535],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/forms/components/proceed-dialog.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { CollectionState } from '../hooks/use-collection-state'",
      "import type { ImportActions } from '../hooks/use-import-actions'",
      "",
      "export function ProceedDialog({ state, importActions }: { state: Pick<CollectionState, 'createPending' | 'mutation' | 'operationPending' | 'parsedImport' | 'proceedDialogOpen' | 'setProceedDialogOpen'>; importActions: Pick<ImportActions, 'closeProceedDialog' | 'confirmImportProceed' | 'processingRun' | 'resumeServerProcessing' | 'stopServerProcessing'> }) {",
      "const { createPending, mutation, operationPending, parsedImport, proceedDialogOpen, setProceedDialogOpen } = state",
      "const { closeProceedDialog, confirmImportProceed, processingRun, resumeServerProcessing, stopServerProcessing } = importActions",
      "return (",
      [537, 589],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/forms/components/delete-field-dialog.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { CollectionState } from '../hooks/use-collection-state'",
      "",
      "export function DeleteFieldDialog({ state }: { state: Pick<CollectionState, 'confirmDeleteField' | 'pendingDeleteField' | 'setPendingDeleteField'> }) {",
      "const { confirmDeleteField, pendingDeleteField, setPendingDeleteField } = state",
      "return (",
      [591, 612],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/forms/components/collection-workspace.tsx": [
      "'use client'",
      "",
      "@imports",
      "import { CorrectionTable } from './correction-table'",
      "import { DeleteFieldDialog } from './delete-field-dialog'",
      "import { DuplicateDecision } from './duplicate-decision'",
      "import { ProceedDialog } from './proceed-dialog'",
      "import { SaveDraftDialog } from './save-draft-dialog'",
      "",
      [50, 92],
      "const { activities, addField, creatingVersion, editingFormId, fields, formTitle, formType, forms, formsLoaded, importMessage, importStatus, intent, journeyStage, linkedActivityId, loadError, mappingRows, mode, moveField, mutation, operationPending, parsedImport, profile, projectId, projects, projectsLoaded, requestDeleteField, selectedFieldId, setFormTitle, setFormType, setJourneyStage, setLinkedActivityId, setLoadError, setMappingRows, setMode, setProceedDialogOpen, setReloadKey, setSaveDialogOpen, setSelectedFieldId, setView, updateField, uploadProgress, view } = state",
      "const { canGenerateForms, canManageForms, canOpenForms, canOpenImport, canPublishForms, canUseExtend, editingReady, eligible } = guard",
      "const { changeInput, changeProject, openBuilder, openSavedForm, savedForms, startNewForm } = edits",
      "const { createNewVersion, downloadSavedForm, generateCopy, publishFormToApi } = formActions",
      "const { importCanProceed, importSummary, mappingReadiness, parseSelectedFile, retrySelectedFile } = importActions",
      [181, 207],
      [208, 337],
      "<DuplicateDecision state={state} />",
      [362, 363],
      "?",
      "<CorrectionTable state={state} edits={edits} parsedImport={parsedImport} />",
      ": null}",
      [447, 491],
      "<SaveDraftDialog state={state} formActions={formActions} mappedCount={mappedCount} sadddCount={sadddCount} />",
      [536, 536],
      "<ProceedDialog state={state} importActions={importActions} />",
      [590, 590],
      "<DeleteFieldDialog state={state} />",
      [613, 615]
    ]
  }
}
```

`same-lines` is told the two lines of the correction table that Biome keeps as an immediately invoked function (`? (() => {` and `})()`), and ignores the destructuring name lines on both sides (`--ignore`), because the destructurings add the same names that the old code read from local variables.

```bash
C=apps/web/src/features/collection/forms/components
cp $C/collection-workspace.tsx .tmp/s5c/files/collection-workspace.before-sections.tsx
node .tmp/s5c/cut.mjs .tmp/s5c/sections-cut.json
FILES="$C/correction-table.tsx $C/duplicate-decision.tsx $C/save-draft-dialog.tsx $C/proceed-dialog.tsx $C/delete-field-dialog.tsx"
node .tmp/s5c/trim-imports.mjs $FILES $C/collection-workspace.tsx | grep -c "removed"
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/collection-workspace.before-sections.tsx --allow '? (() => {' --allow '})()' --ignore '^(const \{( [^}]*\} =)?|\} = (state|guard|edits|formActions|importActions)|(formActions|importActions)|[A-Za-z]+,)$' $C/collection-workspace.tsx $FILES --list > .tmp/s5c/added-sections.txt
tail -1 .tmp/s5c/added-sections.txt
pnpm exec biome check --write $C 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
wc -l $C/collection-workspace.tsx $FILES
```

Expected: the six files are written, `same-lines` prints `lost 0`, 2 allowed and 37 added lines (the `Pick` props, the narrowed props, the five tags and the signatures; the list is `.tmp/s5c/added-sections.txt`), Biome formats what it must, the typecheck is clean with only the two baseline lines, and the sizes are (the first list is before Biome, the second after it, which wraps long tags and lines):

```
apps/web/src/features/collection/forms/components/duplicate-decision.tsx: 79 lines
apps/web/src/features/collection/forms/components/correction-table.tsx: 135 lines
apps/web/src/features/collection/forms/components/save-draft-dialog.tsx: 101 lines
apps/web/src/features/collection/forms/components/proceed-dialog.tsx: 110 lines
apps/web/src/features/collection/forms/components/delete-field-dialog.tsx: 77 lines
apps/web/src/features/collection/forms/components/collection-workspace.tsx: 318 lines
6
original lines 469, lost 0, allowed 2, added 37
Checked 21 files in <ms>. Fixed 6 files.
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
  359 apps/web/src/features/collection/forms/components/collection-workspace.tsx
  102 apps/web/src/features/collection/forms/components/correction-table.tsx
   46 apps/web/src/features/collection/forms/components/duplicate-decision.tsx
   96 apps/web/src/features/collection/forms/components/save-draft-dialog.tsx
  111 apps/web/src/features/collection/forms/components/proceed-dialog.tsx
   40 apps/web/src/features/collection/forms/components/delete-field-dialog.tsx
  754 total
```

```bash
pnpm --filter @pathways/web exec vitest run src/features/collection 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
```

Expected: the collection tests pass as before (30 files and 224 tests: the 29 files of Task 0 plus the new actions test, 199 tests plus 10 form type rows plus 15 handler rows):

```
 Test Files  30 passed (30)
      Tests  224 passed (224)
```

Six mutations of the moved markup (the title and label of the delete dialog, the title of the save dialog, the title and the busy guard of the proceed dialog, and the next page of the correction table) must fail the rows that pinned them before the split. Five more of the dry run's eleven mutations survive both before and after (the dialog summary, the save guard, the cancel button, the resume button and the working state of the proceed dialog), so they are not claimed:

Create `.tmp/s5c/sections-bite-killed.json`:

```json
{
  "tests": ["src/features/collection/forms/components/collection-workspace.access.test.tsx", "src/features/collection/forms/components/collection-workspace.extend-projects.test.tsx", "src/features/collection/forms/components/collection-workspace.forms.test.tsx", "src/features/collection/forms/components/collection-workspace.import-preview.test.tsx", "src/features/collection/forms/components/collection-workspace.import-upload.test.tsx", "src/features/collection/forms/components/collection-workspace.ownership.test.tsx", "src/features/collection/forms/components/collection-workspace.actions.test.tsx"],
  "mutations": [
    {"id": "delete-label", "file": "apps/web/src/features/collection/forms/components/delete-field-dialog.tsx", "from": "confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}", "to": "confirmLabel=\"Delete\""},
    {"id": "delete-title", "file": "apps/web/src/features/collection/forms/components/delete-field-dialog.tsx", "from": "title={`Delete ${pendingDeleteField?.label ?? 'this field'}?`}", "to": "title=\"Delete?\""},
    {"id": "save-title", "file": "apps/web/src/features/collection/forms/components/save-draft-dialog.tsx", "from": "<DialogTitle>Save form draft?</DialogTitle>", "to": "<DialogTitle>Save?</DialogTitle>"},
    {"id": "proceed-title", "file": "apps/web/src/features/collection/forms/components/proceed-dialog.tsx", "from": "'Create draft form?'", "to": "'x'"},
    {"id": "proceed-guard", "file": "apps/web/src/features/collection/forms/components/proceed-dialog.tsx", "from": "        if (open) setProceedDialogOpen(true)\n        else closeProceedDialog()", "to": "        setProceedDialogOpen(open)"},
    {"id": "correction-next", "file": "apps/web/src/features/collection/forms/components/correction-table.tsx", "from": "onClick={() => setCorrectionPage((current) => current + 1)}", "to": "onClick={() => undefined}"}
  ]
}
```

```bash
node .tmp/s5c/bite.mjs .tmp/s5c/sections-bite-killed.json > .tmp/s5c/sections-bite.out; tail -1 .tmp/s5c/sections-bite.out
git status --short | wc -l
git add -A apps
git commit -q -m "refactor(web): cut the dialogs, correction table and duplicate decision out of the collection screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -7
```

Expected: all six mutations are killed, the tree held the 6 changed files, and the commit holds 6 files, five of them new:

```
mutations 6, survived 0
6
 .../forms/components/collection-workspace.tsx      | 298 ++-------------------
 .../forms/components/correction-table.tsx          | 102 +++++++
 .../forms/components/delete-field-dialog.tsx       |  40 +++
 .../forms/components/duplicate-decision.tsx        |  46 ++++
 .../collection/forms/components/proceed-dialog.tsx | 111 ++++++++
 .../forms/components/save-draft-dialog.tsx         |  96 +++++++
 6 files changed, 416 insertions(+), 277 deletions(-)
```

---

### Task 5: Split the import screen

**Files:**
- Create: `features/collection/import/import.utils.ts`; `import/hooks/{use-import-state,use-import-loading,use-batch-review,use-batch-processing}.ts`; `import/components/{import-upload-card,import-batch-list,import-batch-summary,import-mapping-card,import-rows-card}.tsx`
- Modify: `import/components/import-workspace.tsx` (1110 lines to 134); `import/hooks/use-server-processing.ts` and `collection.utils.ts` (the shared ticket type)
- Create (gitignored): `.tmp/s5c/ticket-edits.json`, `import-split.json`, `import-cut.json`, `import-ticket-edits.json`, `import-bite-after.json`

`import-workspace.tsx` has two components (`ImportWorkspace` wraps `OwnedImportWorkspace`), eight pure declarations and one 960 line component with 16 `useState` calls, two effects, and the load, save, validate, confirm, process, stop and resume handlers. The S5b review also named the duplicate `Ticket` type of `use-server-processing.ts` (the same two-method shape that every screen's operation guard hands out), so that goes first.

- [ ] **Step 1: One ticket type for the operation guards**

`OperationTicket` in `collection.utils.ts` is the shape of the ticket (`valid` checks that the owner and the permission still hold, `finish` releases the lock), and `use-server-processing.ts` uses it in place of its own copy. No logic changes. `.tmp/s5c/ticket-edits.json` holds the six counted edits:

Create `.tmp/s5c/ticket-edits.json`:

```json
[
  ["apps/web/src/features/collection/collection.utils.ts", "import type { BuilderFieldType, BuilderFormField } from './forms/digital-form-contract'\n", "import type { principalHasAtomicPermission } from '@/lib/rbac/policy'\n\nimport type { BuilderFieldType, BuilderFormField } from './forms/digital-form-contract'\n", 1],
  ["apps/web/src/features/collection/collection.utils.ts", "export type CollectionMode = 'scratch' | 'import' | 'extend'\n", "/** What a screen's operation guard hands out: a check that the owner is still current, and the release of the lock. */\nexport type OperationTicket = {\n  valid: (permission?: Parameters<typeof principalHasAtomicPermission>[1]) => boolean\n  finish: () => void\n}\n\nexport type CollectionMode = 'scratch' | 'import' | 'extend'\n", 1],
  ["apps/web/src/features/collection/import/hooks/use-server-processing.ts", "type Ticket = {\n  valid: (permission?: Parameters<typeof principalHasAtomicPermission>[1]) => boolean\n  finish: () => void\n}\n\n", "", 1],
  ["apps/web/src/features/collection/import/hooks/use-server-processing.ts", "=> Ticket | null", "=> OperationTicket | null", 1],
  ["apps/web/src/features/collection/import/hooks/use-server-processing.ts", "    ticket: Ticket,", "    ticket: OperationTicket,", 1],
  ["apps/web/src/features/collection/import/hooks/use-server-processing.ts", "import type { ImportProcessingState } from '../components/import-processing-panel'\n", "import type { OperationTicket } from '../../collection.utils'\nimport type { ImportProcessingState } from '../components/import-processing-panel'\n", 1]
]
```

```bash
I=apps/web/src/features/collection
git grep -n "type Ticket\b" -- $I | cut -c1-140
node .tmp/s5c/replace-exact.mjs .tmp/s5c/ticket-edits.json
node .tmp/s5c/trim-imports.mjs $I/import/hooks/use-server-processing.ts $I/collection.utils.ts
pnpm exec biome check --write $I 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
sed -i 's/  finish: () => void/  done: () => void/' $I/collection.utils.ts
pnpm --filter @pathways/web exec tsc --noEmit 2>&1 | grep -c "error TS"
sed -i 's/  done: () => void/  finish: () => void/' $I/collection.utils.ts
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run src/features/collection/import 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
```

Expected: the local type is the only `type Ticket` in the feature, 6 replacements land in 2 files, Biome rewraps one signature, the typecheck is clean, renaming `finish` in the shared type fails the typecheck in the consumers (the count of errors is the proof that the type is used), and the import tests pass (13 files and 75 tests):

```
apps/web/src/features/collection/import/components/import-workspace.tsx:198:  type Ticket = NonNullable<ReturnType<typeof begin>>
apps/web/src/features/collection/import/hooks/use-server-processing.ts:15:type Ticket = {
6 replacements in 2 files
apps/web/src/features/collection/import/hooks/use-server-processing.ts: removed nothing
apps/web/src/features/collection/collection.utils.ts: removed nothing
Checked 77 files in <ms>. Fixed 1 file.
web typecheck clean
3
 Test Files  13 passed (13)
      Tests  75 passed (75)
```

```bash
git add -A apps
git commit -q -m "refactor(web): share one operation ticket type between the collection screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
```

Expected: two files:

```
 apps/web/src/features/collection/collection.utils.ts         |  8 ++++++++
 .../collection/import/hooks/use-server-processing.ts         | 12 +++++-------
 2 files changed, 13 insertions(+), 7 deletions(-)
```

- [ ] **Step 2: Move the pure declarations to `import.utils.ts`**

Eight declarations (`mappingLockedStatuses`, `batchTone`, `rowTone`, `headClass`, `StoredMapping`, `matchReasonLabels`, `automaticMatchReason`, `displayValue`) hold no state. `import-workspace.tsx` keeps `ImportWorkspace` and `OwnedImportWorkspace`; only the six names the screen uses are exported (`StoredMapping` and `matchReasonLabels` serve `automaticMatchReason` inside the file):

Create `.tmp/s5c/import-split.json`:

```json
{
  "apps/web/src/features/collection/import/import.utils.ts": {
    "names": [
      "mappingLockedStatuses",
      "batchTone",
      "rowTone",
      "headClass",
      "StoredMapping",
      "matchReasonLabels",
      "automaticMatchReason",
      "displayValue"
    ],
    "header": [
      "import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'"
    ]
  },
  "apps/web/src/features/collection/import/components/import-workspace.tsx": {
    "names": ["ImportWorkspace", "OwnedImportWorkspace"],
    "header": [
      "@original",
      "import {",
      "  automaticMatchReason,",
      "  batchTone,",
      "  displayValue,",
      "  headClass,",
      "  mappingLockedStatuses,",
      "  rowTone,",
      "} from '../import.utils'"
    ]
  }
}
```

```bash
I=apps/web/src/features/collection/import
cp $I/components/import-workspace.tsx .tmp/s5c/files/import-workspace.before-utils.tsx
node .tmp/s5c/split-module.mjs $I/components/import-workspace.tsx .tmp/s5c/import-split.json
sed -E -i 's/^(const|function) (mappingLockedStatuses|batchTone|rowTone|headClass|automaticMatchReason|displayValue)\b/export \1 \2/' $I/import.utils.ts
node .tmp/s5c/trim-imports.mjs $I/components/import-workspace.tsx $I/import.utils.ts | grep -v "removed nothing" | cut -c1-200
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/import-workspace.before-utils.tsx $I/components/import-workspace.tsx $I/import.utils.ts
pnpm exec biome check --write $I 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run src/features/collection/import 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
git add -A apps
git commit -q -m "refactor(web): move the pure declarations of the import screen to import.utils

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object $I/components/import-workspace.tsx | cut -c1-8
```

Expected: the two files are written, `same-lines` prints `lost 0` with nothing added, Biome formats the two files, the typecheck is clean, the import tests pass and the screen hash is the one the cut plan is pinned to:

```
apps/web/src/features/collection/import/import.utils.ts: 41 lines
apps/web/src/features/collection/import/components/import-workspace.tsx: 1006 lines
original lines 1017, lost 0, allowed 0, added 0
Checked 30 files in <ms>. Fixed 2 files.
web typecheck clean
 Test Files  13 passed (13)
      Tests  75 passed (75)
7f62d21a
```

- [ ] **Step 3: Cut the screen into four hooks and five cards**

The 960 line component becomes a 134 line screen, four hooks and five cards, cut by line range:

| Hook | Holds | Takes |
|---|---|---|
| `useImportState` | the profile, the 16 `useState` calls, the refs, the operation guard (`begin`) and `useImportBatch` | the sensitive draft scope |
| `useImportLoading` | the project and form loading effects | `state` |
| `useBatchReview` | load batch, upload, save mapping, validate and confirm | `state` |
| `useBatchProcessing` | the process loop, stop and resume | `state`, `review` |

| Card | Markup |
|---|---|
| `ImportUploadCard` | the form select, the file input and the upload button |
| `ImportBatchList` | the list of stored batches and its processing banner |
| `ImportBatchSummary` | the status metrics of the open batch |
| `ImportMappingCard` | the column mapping table, the value maps and the validate and process buttons |
| `ImportRowsCard` | the row preview table |

The cards take `Pick` props of the hook results (`batch` as a narrowed prop wherever the screen had checked it for null). The hooks import `ImportProcessingPanel` and `ImportValueMapEditor` types from `../components/`, and `useImportBatch` from the same folder; four `sed` substitutions fix those specifiers. The two `parentTicket?: Ticket` parameters of the review hook become `OperationTicket`, and `same-lines` is told the local `type Ticket = NonNullable<ReturnType<typeof begin>>` line that disappears and that `OperationTicket` stands for `Ticket`.

Create `.tmp/s5c/import-cut.json`:

```json
{
  "source": "apps/web/src/features/collection/import/components/import-workspace.tsx",
  "hash": "7f62d21a",
  "files": {
    "apps/web/src/features/collection/import/hooks/use-import-state.ts": [
      "@imports",
      "",
      "export function useImportState(scope: SensitiveDraftOwner) {",
      "const { profile } = useCurrentRole()",
      [88, 163],
      [219, 243],
      [562, 579],
      "return { batch, batches, begin, canOpenForms, canProcess, canReview, canUpload, canValidate, columnValues, file, formId, forms, formsState, importBatch, latest, loadAttempt, loadState, mapping, mappingEditable, mappingHeading, mappingNotice, mounted, mutation, openSuggestions, pending, processing, projectId, projects, rows, rules, scope, selectedForm, setBatch, setBatches, setFile, setFormId, setForms, setFormsState, setLoadAttempt, setLoadState, setMapping, setMappingNotice, setProcessing, setProjectId, setProjects, setRows, setRules, sourceColumnByKey, sourceColumns, storedMappingByKey, validationErrors }",
      "}",
      "",
      "export type ImportState = ReturnType<typeof useImportState>"
    ],
    "apps/web/src/features/collection/import/hooks/use-import-loading.ts": [
      "@imports",
      "import type { ImportState } from './use-import-state'",
      "",
      "export function useImportLoading(state: ImportState) {",
      "const { latest, loadAttempt, projectId, scope, setBatch, setBatches, setFormId, setForms, setFormsState, setLoadState, setMapping, setProjectId, setProjects, setRows, setRules } = state",
      [166, 184],
      "// biome-ignore lint/correctness/useExhaustiveDependencies: the setters of the state hook are stable",
      [185, 217],
      "}"
    ],
    "apps/web/src/features/collection/import/hooks/use-batch-review.ts": [
      "@imports",
      "import type { ImportState } from './use-import-state'",
      "",
      "export function useBatchReview(state: ImportState) {",
      "const { batch, begin, file, formId, forms, importBatch, latest, mapping, mappingEditable, mappingHeading, mounted, mutation, openSuggestions, projectId, rules, scope, selectedForm, setBatch, setBatches, setFile, setForms, setMapping, setMappingNotice, setRows, setRules, sourceColumns } = state",
      [245, 473],
      [539, 560],
      "return { confirmSuggestions, loadBatch, resume, saveMapping, upload, validate }",
      "}",
      "",
      "export type BatchReview = ReturnType<typeof useBatchReview>"
    ],
    "apps/web/src/features/collection/import/hooks/use-batch-processing.ts": [
      "@imports",
      "import type { ImportState } from './use-import-state'",
      "import type { BatchReview } from './use-batch-review'",
      "",
      "export function useBatchProcessing(state: ImportState, review: BatchReview) {",
      "const { batch, begin, importBatch, processing, projectId, setProcessing } = state",
      "const { loadBatch } = review",
      [475, 537],
      [581, 583],
      "return { process, processingInterrupted, stopProcessing, visibleProcessing }",
      "}",
      "",
      "export type BatchProcessing = ReturnType<typeof useBatchProcessing>"
    ],
    "apps/web/src/features/collection/import/components/import-upload-card.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { ImportState } from '../hooks/use-import-state'",
      "import type { BatchReview } from '../hooks/use-batch-review'",
      "",
      "export function ImportUploadCard({ state, review }: { state: Pick<ImportState, 'canUpload' | 'file' | 'formId' | 'forms' | 'formsState' | 'mutation' | 'pending' | 'projectId' | 'projects' | 'scope' | 'setBatch' | 'setBatches' | 'setFile' | 'setFormId' | 'setForms' | 'setProjectId' | 'setRows'>; review: Pick<BatchReview, 'upload'> }) {",
      "const { canUpload, file, formId, forms, formsState, mutation, pending, projectId, projects, scope, setBatch, setBatches, setFile, setFormId, setForms, setProjectId, setRows } = state",
      "const { upload } = review",
      "return (",
      [637, 747],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/import/components/import-batch-list.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { ImportState } from '../hooks/use-import-state'",
      "import type { BatchReview } from '../hooks/use-batch-review'",
      "",
      "export function ImportBatchList({ state, review }: { state: Pick<ImportState, 'batch' | 'batches'>; review: Pick<BatchReview, 'loadBatch'> }) {",
      "const { batch, batches } = state",
      "const { loadBatch } = review",
      "return (",
      [750, 784],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/import/components/import-batch-summary.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { ImportState } from '../hooks/use-import-state'",
      "import type { BatchReview } from '../hooks/use-batch-review'",
      "",
      "export function ImportBatchSummary({ review, batch }: { review: Pick<BatchReview, 'loadBatch' | 'resume'>; batch: NonNullable<ImportState['batch']> }) {",
      "const { loadBatch, resume } = review",
      "return (",
      [794, 832],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/import/components/import-mapping-card.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { ImportState } from '../hooks/use-import-state'",
      "import type { BatchReview } from '../hooks/use-batch-review'",
      "import type { BatchProcessing } from '../hooks/use-batch-processing'",
      "",
      "export function ImportMappingCard({ state, review, run, batch }: { state: Pick<ImportState, 'canProcess' | 'canReview' | 'canValidate' | 'columnValues' | 'mapping' | 'mappingEditable' | 'mappingHeading' | 'mappingNotice' | 'mutation' | 'openSuggestions' | 'pending' | 'rules' | 'scope' | 'selectedForm' | 'setMapping' | 'setRules' | 'sourceColumns' | 'storedMappingByKey'>; review: Pick<BatchReview, 'confirmSuggestions' | 'saveMapping' | 'validate'>; run: Pick<BatchProcessing, 'process' | 'processingInterrupted'>; batch: NonNullable<ImportState['batch']> }) {",
      "const { canProcess, canReview, canValidate, columnValues, mapping, mappingEditable, mappingHeading, mappingNotice, mutation, openSuggestions, pending, rules, scope, selectedForm, setMapping, setRules, sourceColumns, storedMappingByKey } = state",
      "const { confirmSuggestions, saveMapping, validate } = review",
      "const { process, processingInterrupted } = run",
      "return (",
      [835, 993],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/import/components/import-rows-card.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { ImportState } from '../hooks/use-import-state'",
      "",
      "export function ImportRowsCard({ state }: { state: Pick<ImportState, 'rows' | 'sourceColumnByKey' | 'validationErrors'> }) {",
      "const { rows, sourceColumnByKey, validationErrors } = state",
      "return (",
      [996, 1068],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/import/components/import-workspace.tsx": [
      "'use client'",
      "",
      "@imports",
      "import { useBatchProcessing } from '../hooks/use-batch-processing'",
      "import { useBatchReview } from '../hooks/use-batch-review'",
      "import { useImportLoading } from '../hooks/use-import-loading'",
      "import { useImportState } from '../hooks/use-import-state'",
      "import { ImportBatchList } from './import-batch-list'",
      "import { ImportBatchSummary } from './import-batch-summary'",
      "import { ImportMappingCard } from './import-mapping-card'",
      "import { ImportRowsCard } from './import-rows-card'",
      "import { ImportUploadCard } from './import-upload-card'",
      "",
      [71, 85],
      [87, 87],
      "const state = useImportState(scope)",
      "useImportLoading(state)",
      "const review = useBatchReview(state)",
      "const run = useBatchProcessing(state, review)",
      "const { batch, canOpenForms, canProcess, loadState, pending, setLoadAttempt, setLoadState, sourceColumns } = state",
      "const { process, stopProcessing, visibleProcessing } = run",
      [585, 636],
      "<ImportUploadCard state={state} review={review} />",
      [748, 749],
      "<ImportBatchList state={state} review={review} />",
      [785, 793],
      "<ImportBatchSummary review={review} batch={batch} />",
      [833, 834],
      "<ImportMappingCard state={state} review={review} run={run} batch={batch} />",
      [994, 995],
      "<ImportRowsCard state={state} />",
      [1069, 1076]
    ]
  }
}
```

Create `.tmp/s5c/import-ticket-edits.json`:

```json
[
  ["apps/web/src/features/collection/import/hooks/use-batch-review.ts", "parentTicket?: Ticket", "parentTicket?: OperationTicket", 2],
  ["apps/web/src/features/collection/import/hooks/use-batch-review.ts", "import { toast } from 'sonner'\n", "import { toast } from 'sonner'\n\nimport type { OperationTicket } from '../../collection.utils'\n", 1]
]
```

```bash
I=apps/web/src/features/collection/import
cp $I/components/import-workspace.tsx .tmp/s5c/files/import-workspace.before-hooks.tsx
node .tmp/s5c/cut.mjs .tmp/s5c/import-cut.json
node .tmp/s5c/replace-exact.mjs .tmp/s5c/import-ticket-edits.json
HOOKS="$I/hooks/use-import-state.ts $I/hooks/use-import-loading.ts $I/hooks/use-batch-review.ts $I/hooks/use-batch-processing.ts"
sed -E -i "s#from '\./(import-processing-panel|import-value-map-editor)'#from '../components/\1'#; s#from '\.\./hooks/(use-import-batch)'#from './\1'#" $HOOKS
CARDS="$I/components/import-upload-card.tsx $I/components/import-batch-list.tsx $I/components/import-batch-summary.tsx $I/components/import-mapping-card.tsx $I/components/import-rows-card.tsx"
node .tmp/s5c/trim-imports.mjs $HOOKS $CARDS $I/components/import-workspace.tsx | grep -c "removed"
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/import-workspace.before-hooks.tsx --allow 'type Ticket = NonNullable<ReturnType<typeof begin>>' $I/components/import-workspace.tsx $HOOKS $CARDS OperationTicket=Ticket --list > .tmp/s5c/added-import.txt
tail -1 .tmp/s5c/added-import.txt
pnpm exec biome check --write $I 2>&1 | tail -2
node .tmp/s5c/hook-order.mjs .tmp/s5c/files/import-workspace.before-hooks.tsx $HOOKS $I/components/import-workspace.tsx
wc -l $HOOKS $CARDS $I/components/import-workspace.tsx
```

Expected: 10 files are written, 2 replacements land, every file loses its unused imports, `same-lines` prints `lost 0`, 1 allowed and 59 added lines (the listing is `.tmp/s5c/added-import.txt`), Biome formats ten files, the hook order is the same, and the files have these sizes:

```
apps/web/src/features/collection/import/hooks/use-import-state.ts: 193 lines
apps/web/src/features/collection/import/hooks/use-import-loading.ts: 125 lines
apps/web/src/features/collection/import/hooks/use-batch-review.ts: 326 lines
apps/web/src/features/collection/import/hooks/use-batch-processing.ts: 143 lines
apps/web/src/features/collection/import/components/import-upload-card.tsx: 189 lines
apps/web/src/features/collection/import/components/import-batch-list.tsx: 113 lines
apps/web/src/features/collection/import/components/import-batch-summary.tsx: 116 lines
apps/web/src/features/collection/import/components/import-mapping-card.tsx: 239 lines
apps/web/src/features/collection/import/components/import-rows-card.tsx: 149 lines
apps/web/src/features/collection/import/components/import-workspace.tsx: 181 lines
2 replacements in 1 files
10
original lines 983, lost 0, allowed 1, added 59
Checked 39 files in <ms>. Fixed 10 files.
effect-bearing hook calls 4, same order true
  196 apps/web/src/features/collection/import/hooks/use-import-state.ts
   81 apps/web/src/features/collection/import/hooks/use-import-loading.ts
  296 apps/web/src/features/collection/import/hooks/use-batch-review.ts
   81 apps/web/src/features/collection/import/hooks/use-batch-processing.ts
  176 apps/web/src/features/collection/import/components/import-upload-card.tsx
   51 apps/web/src/features/collection/import/components/import-batch-list.tsx
   61 apps/web/src/features/collection/import/components/import-batch-summary.tsx
  228 apps/web/src/features/collection/import/components/import-mapping-card.tsx
   91 apps/web/src/features/collection/import/components/import-rows-card.tsx
  134 apps/web/src/features/collection/import/components/import-workspace.tsx
 1395 total
```

```bash
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
pnpm --filter @pathways/web exec vitest run src/features/collection src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
pnpm exec biome check apps/web/src 2>&1 | tail -1
```

Expected: the typecheck is clean with only the two baseline lines, and the collection tests and the direction test pass (31 files and 229 tests: 224 and the 5 of the direction test):

```
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  31 passed (31)
      Tests  229 passed (229)
Checked 766 files in <ms>. No fixes applied.
```

Twelve mutations of the moved import flows, written for the unsplit screen and retargeted onto the files that now hold the same text, must fail the rows that killed them before the split (the upload identity, the revision of a save and of a process call, the notices, the confirm flow, the suggestions, the label of the process button, the file select and the batch list load). Eighteen more of the dry run's thirty mutations survive both before and after (loading defaults, upload guards, the validate revision, the stop and resume permission checks, and others), which is test debt of the import screen that predates this slice, so they are not claimed:

Create `.tmp/s5c/import-bite-after.json`:

```json
{
  "tests": ["src/features/collection/import/components/import-workspace.form-loading.test.tsx", "src/features/collection/import/components/import-workspace.identity.test.tsx", "src/features/collection/import/components/import-workspace.ownership.test.tsx", "src/features/collection/import/components/import-workspace.processing.test.tsx", "src/features/collection/import/components/import-workspace.resume.test.tsx", "src/features/collection/import/components/import-workspace.suggestions.test.tsx"],
  "mutations": [
    {"id": "upload-id", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "importBatch.uploadId([file, projectId, formId]),", "to": "importBatch.uploadId([projectId, formId]),"},
    {"id": "save-revision", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "saveImportMapping(projectId, batch.id, batch.mappingRevision, mappings)", "to": "saveImportMapping(projectId, batch.id, 0, mappings)"},
    {"id": "save-notice", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "setMappingNotice('Mapping revision saved. Validation results were reset.')", "to": "setMappingNotice('')"},
    {"id": "confirm-skip", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "if (chosen.has(item.code)) {", "to": "if (false) {"},
    {"id": "confirm-autosave", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "if (applied > 0 && remaining === 0) {", "to": "if (false) {"},
    {"id": "confirm-focus", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "target?.focus()", "to": ""},
    {"id": "process-revision", "file": "apps/web/src/features/collection/import/hooks/use-batch-processing.ts", "from": "processImport(projectId, target.id, target.validationRevision)", "to": "processImport(projectId, target.id, 0)"},
    {"id": "resume-toast", "file": "apps/web/src/features/collection/import/hooks/use-batch-review.ts", "from": "'Stored source finalization resumed.'", "to": "'x'"},
    {"id": "open-suggestions", "file": "apps/web/src/features/collection/import/hooks/use-import-state.ts", "from": "(mapping[column.key] ?? '__pending__') === '__pending__' &&", "to": "true &&"},
    {"id": "file-select", "file": "apps/web/src/features/collection/import/components/import-upload-card.tsx", "from": "setFile(event.target.files?.[0] ?? null)", "to": "setFile(null)"},
    {"id": "batch-list-load", "file": "apps/web/src/features/collection/import/components/import-batch-list.tsx", "from": "onClick={() => void loadBatch(item.id)}", "to": "onClick={() => undefined}"},
    {"id": "process-label", "file": "apps/web/src/features/collection/import/components/import-mapping-card.tsx", "from": "? 'Resume processing'\n              : 'Process all valid rows'", "to": "? 'Process all valid rows'\n              : 'Resume processing'"}
  ]
}
```

```bash
node .tmp/s5c/bite.mjs .tmp/s5c/import-bite-after.json > .tmp/s5c/import-bite.out; tail -1 .tmp/s5c/import-bite.out
git status --short | wc -l
git add -A apps
git commit -q -m "refactor(web): cut the import screen into state, loading, review and processing hooks and five cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -12
```

Expected: all twelve mutations are killed, 10 changed or new files in the tree before the commit, and the commit holds them (nine of them new):

```
mutations 12, survived 0
10
 .../import/components/import-batch-list.tsx        |   51 +
 .../import/components/import-batch-summary.tsx     |   61 ++
 .../import/components/import-mapping-card.tsx      |  228 +++++
 .../import/components/import-rows-card.tsx         |   91 ++
 .../import/components/import-upload-card.tsx       |  176 ++++
 .../import/components/import-workspace.tsx         | 1006 +-------------------
 .../import/hooks/use-batch-processing.ts           |   81 ++
 .../collection/import/hooks/use-batch-review.ts    |  296 ++++++
 .../collection/import/hooks/use-import-loading.ts  |   81 ++
 .../collection/import/hooks/use-import-state.ts    |  196 ++++
 10 files changed, 1293 insertions(+), 974 deletions(-)
```

---

### Task 6: Split the direct entry screen

**Files:**
- Create: `features/collection/entry/entry.utils.ts`; `entry/components/{state-shell,entry-state-views,direct-entry-form}.tsx`; `entry/hooks/{use-entry-state,use-entry-load,use-entry-actions}.ts`
- Modify: `entry/components/direct-form-entry-workspace.tsx` (654 lines to 74)
- Create (gitignored): `.tmp/s5c/entry-split.json`, `entry-cut.json`, `entry-bite-after.json`

`direct-form-entry-workspace.tsx` has the public `DirectFormEntryWorkspace` wrapper, `OwnedDirectFormEntryWorkspace` (10 `useState` calls, the load effect, and the save, submit and start-another handlers with the survey subject lock), a `StateShell` and the helper `verifySurveySubject`. `direct-entry-ownership.test.tsx` and `direct-form-entry-workspace.test.tsx` already pin the guarded save and submit (S5b outline), so the characterization of this screen is the existing rows plus the mutations below.

- [ ] **Step 1: Move the helper, the props type and the shell**

`verifySurveySubject` (a pure check that a stored submission is for this form version and contributor) and `EntryProps` go to `entry.utils.ts`; the layout shell `StateShell` becomes its own component file:

Create `.tmp/s5c/entry-split.json`:

```json
{
  "apps/web/src/features/collection/entry/entry.utils.ts": {
    "names": [
      "verifySurveySubject",
      "EntryProps"
    ],
    "header": [
      "import type { DigitalFormDefinition, DirectFormSubmission } from '@/types/pathways'"
    ]
  },
  "apps/web/src/features/collection/entry/components/state-shell.tsx": {
    "names": [
      "StateShell"
    ],
    "header": [
      "'use client'",
      "",
      "import type { ReactNode } from 'react'",
      "",
      "import { PageHeader } from '@/components/layout/page-header'"
    ]
  },
  "apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx": {
    "names": [
      "DirectFormEntryWorkspace",
      "OwnedDirectFormEntryWorkspace"
    ],
    "header": [
      "@original",
      "",
      "import { type EntryProps, verifySurveySubject } from '../entry.utils'",
      "import { StateShell } from './state-shell'"
    ]
  }
}
```

```bash
E=apps/web/src/features/collection/entry
cp $E/components/direct-form-entry-workspace.tsx .tmp/s5c/files/direct-form-entry-workspace.before-utils.tsx
node .tmp/s5c/split-module.mjs $E/components/direct-form-entry-workspace.tsx .tmp/s5c/entry-split.json
sed -E -i 's/^(function|type) (verifySurveySubject|EntryProps)\b/export \1 \2/' $E/entry.utils.ts
sed -E -i 's/^const StateShell\b/export const StateShell/' $E/components/state-shell.tsx
node .tmp/s5c/trim-imports.mjs $E/components/direct-form-entry-workspace.tsx $E/entry.utils.ts $E/components/state-shell.tsx | grep -v "removed nothing" | cut -c1-200
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/direct-form-entry-workspace.before-utils.tsx $E/components/direct-form-entry-workspace.tsx $E/entry.utils.ts $E/components/state-shell.tsx
pnpm exec biome check --write $E 2>&1 | tail -2
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run src/features/collection/entry 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
git add -A apps
git commit -q -m "refactor(web): move the subject check and the shell of the direct entry screen out of it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git hash-object $E/components/direct-form-entry-workspace.tsx | cut -c1-8
```

Expected: the three files are written, `ReactNode` leaves the screen's imports, `same-lines` prints `lost 0` with nothing added, Biome finds nothing to fix, the typecheck is clean, the entry tests pass (4 files and 33 tests) and the screen hash is the one the cut plan is pinned to:

```
apps/web/src/features/collection/entry/entry.utils.ts: 25 lines
apps/web/src/features/collection/entry/components/state-shell.tsx: 14 lines
apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx: 584 lines
apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx: removed ReactNode
original lines 605, lost 0, allowed 0, added 0
Checked 9 files in <ms>. No fixes applied.
web typecheck clean
 Test Files  4 passed (4)
      Tests  33 passed (33)
29beff43
```

- [ ] **Step 2: Cut the screen into three hooks and two component files**

The 584 line component becomes a 74 line screen, three hooks and two component files:

| Part | Holds | Takes |
|---|---|---|
| `useEntryState` | the 10 `useState` calls, the refs (client submission id, load epoch, operation guard) and the form version helpers | the props and the sensitive draft scope |
| `useEntryLoad` | the load effect and the retry and restore flows | `state` |
| `useEntryActions` | save, submit, start another and the subject lock | `state` |
| `entry-state-views.tsx` | `IdentifiedAccessUnavailable`, `EntryLoadState`, `UnpublishedNotice`, `UnavailableType`, `RegistrationRedirect` | `Pick` of the state |
| `direct-entry-form.tsx` | `DirectEntryForm`, the field list, notices and buttons | `Pick` of the state and the actions |

The hooks fix three specifiers with a `sed` (`form-definition-entry-field` and `survey-subject-picker` live in `../components/`). `same-lines` is told the six lines of the screen's signature that now take `EntryProps` and the scope.

Create `.tmp/s5c/entry-cut.json`:

```json
{
  "source": "apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx",
  "hash": "29beff43",
  "files": {
    "apps/web/src/features/collection/entry/hooks/use-entry-state.ts": [
      "@imports",
      "",
      "export function useEntryState({ initialSubmissionId, projectId, formId, scope }: EntryProps & { scope: SensitiveDraftOwner }) {",
      "const { profile } = useCurrentRole()",
      [63, 129],
      [227, 234],
      "return { begin, beneficiaryId, clientSubmissionId, errorsByField, form, formId, initialSubmissionId, loadAttempt, loadEpoch, loadStatus, newResponseOwner, notice, operation, pending, prepareSeparateResponse, projectId, scope, setBeneficiaryId, setErrors, setForm, setLoadAttempt, setLoadStatus, setNotice, setSubjectLocked, setSubmission, setValues, storageKey, subjectLocked, subjectOwner, submission, values }",
      "}",
      "",
      "export type EntryState = ReturnType<typeof useEntryState>"
    ],
    "apps/web/src/features/collection/entry/hooks/use-entry-load.ts": [
      "@imports",
      "import type { EntryState } from './use-entry-state'",
      "",
      "export function useEntryLoad(state: EntryState) {",
      "const { clientSubmissionId, formId, initialSubmissionId, loadAttempt, loadEpoch, projectId, scope, setBeneficiaryId, setForm, setLoadStatus, setNotice, setSubjectLocked, setSubmission, setValues, storageKey, subjectOwner } = state",
      [131, 225],
      "}"
    ],
    "apps/web/src/features/collection/entry/hooks/use-entry-actions.ts": [
      "@imports",
      "import type { EntryState } from './use-entry-state'",
      "",
      "export function useEntryActions(state: EntryState) {",
      "const { begin, beneficiaryId, clientSubmissionId, form, formId, loadEpoch, newResponseOwner, operation, projectId, scope, setBeneficiaryId, setErrors, setLoadStatus, setNotice, setSubjectLocked, setSubmission, setValues, storageKey, submission, values } = state",
      [236, 370],
      "return { save, startSeparateResponse, submit, validate }",
      "}",
      "",
      "export type EntryActions = ReturnType<typeof useEntryActions>"
    ],
    "apps/web/src/features/collection/entry/components/entry-state-views.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { EntryState } from '../hooks/use-entry-state'",
      "import type { EntryActions } from '../hooks/use-entry-actions'",
      "",
      "export function IdentifiedAccessUnavailable({ state, actions, form }: { state: Pick<EntryState, 'formId' | 'initialSubmissionId' | 'prepareSeparateResponse' | 'projectId'>; actions: Pick<EntryActions, 'startSeparateResponse'>; form: NonNullable<EntryState['form']> }) {",
      "const { formId, initialSubmissionId, prepareSeparateResponse, projectId } = state",
      "const { startSeparateResponse } = actions",
      "return (",
      [374, 395],
      ")",
      "}",
      "",
      "export function EntryLoadState({ state }: { state: Pick<EntryState, 'loadStatus' | 'setLoadAttempt' | 'setLoadStatus'> }) {",
      "const { loadStatus, setLoadAttempt, setLoadStatus } = state",
      "return (",
      [399, 413],
      ")",
      "}",
      "",
      "export function UnpublishedNotice({ formShell }: { formShell: { eyebrow: string; title: string } }) {",
      "return (",
      [421, 426],
      ")",
      "}",
      "",
      "export function UnavailableType({ formShell }: { formShell: { eyebrow: string; title: string } }) {",
      "return (",
      [435, 440],
      ")",
      "}",
      "",
      "export function RegistrationRedirect({ formShell }: { formShell: { eyebrow: string; title: string } }) {",
      "return (",
      [446, 456],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/entry/components/direct-entry-form.tsx": [
      "'use client'",
      "",
      "@imports",
      "import type { EntryState } from '../hooks/use-entry-state'",
      "import type { EntryActions } from '../hooks/use-entry-actions'",
      "",
      "export function DirectEntryForm({ state, actions, form }: { state: Pick<EntryState, 'beneficiaryId' | 'errorsByField' | 'formId' | 'initialSubmissionId' | 'notice' | 'operation' | 'pending' | 'prepareSeparateResponse' | 'projectId' | 'scope' | 'setBeneficiaryId' | 'setValues' | 'storageKey' | 'subjectLocked' | 'subjectOwner' | 'submission' | 'values'>; actions: Pick<EntryActions, 'save' | 'startSeparateResponse' | 'submit' | 'validate'>; form: NonNullable<EntryState['form']> }) {",
      "const { beneficiaryId, errorsByField, formId, initialSubmissionId, notice, operation, pending, prepareSeparateResponse, projectId, scope, setBeneficiaryId, setValues, storageKey, subjectLocked, subjectOwner, submission, values } = state",
      "const { save, startSeparateResponse, submit, validate } = actions",
      [460, 460],
      "return (",
      [463, 615],
      ")",
      "}"
    ],
    "apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx": [
      "'use client'",
      "",
      "@imports",
      "import { useEntryActions } from '../hooks/use-entry-actions'",
      "import { useEntryLoad } from '../hooks/use-entry-load'",
      "import { useEntryState } from '../hooks/use-entry-state'",
      "import { DirectEntryForm } from './direct-entry-form'",
      "import { EntryLoadState, IdentifiedAccessUnavailable, RegistrationRedirect, UnavailableType, UnpublishedNotice } from './entry-state-views'",
      "",
      [34, 55],
      "function OwnedDirectFormEntryWorkspace(props: EntryProps & { scope: SensitiveDraftOwner }) {",
      "const state = useEntryState(props)",
      "useEntryLoad(state)",
      "const actions = useEntryActions(state)",
      "const { beneficiaryId, form, loadStatus, subjectOwner } = state",
      [372, 372],
      "return <IdentifiedAccessUnavailable state={state} actions={actions} form={form} />",
      [397, 397],
      "return <EntryLoadState state={state} />",
      [415, 419],
      "return <UnpublishedNotice formShell={formShell} />",
      [428, 433],
      "return <UnavailableType formShell={formShell} />",
      [442, 444],
      "return <RegistrationRedirect formShell={formShell} />",
      [458, 459],
      "return <DirectEntryForm state={state} actions={actions} form={form} />",
      [617, 617]
    ]
  }
}
```

```bash
E=apps/web/src/features/collection/entry
cp $E/components/direct-form-entry-workspace.tsx .tmp/s5c/files/direct-form-entry-workspace.before-hooks.tsx
node .tmp/s5c/cut.mjs .tmp/s5c/entry-cut.json
HOOKS="$E/hooks/use-entry-state.ts $E/hooks/use-entry-load.ts $E/hooks/use-entry-actions.ts"
sed -E -i "s#from '\./(form-definition-entry-field|survey-subject-picker)'#from '../components/\1'#" $HOOKS
VIEWS="$E/components/entry-state-views.tsx $E/components/direct-entry-form.tsx"
node .tmp/s5c/trim-imports.mjs $HOOKS $VIEWS $E/components/direct-form-entry-workspace.tsx | grep -c "removed"
node .tmp/s5c/same-lines.mjs .tmp/s5c/files/direct-form-entry-workspace.before-hooks.tsx --allow 'function OwnedDirectFormEntryWorkspace({' --allow 'initialSubmissionId,' --allow 'projectId,' --allow 'formId,' --allow 'scope,' --allow '}: EntryProps & { scope: SensitiveDraftOwner }) {' $E/components/direct-form-entry-workspace.tsx $HOOKS $VIEWS --list > .tmp/s5c/added-entry.txt
tail -1 .tmp/s5c/added-entry.txt
pnpm exec biome check --write $E 2>&1 | tail -2
node .tmp/s5c/hook-order.mjs .tmp/s5c/files/direct-form-entry-workspace.before-hooks.tsx $HOOKS $E/components/direct-form-entry-workspace.tsx
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
pnpm --filter @pathways/web exec vitest run src/features/collection src/import-direction.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests +[0-9]"
wc -l $HOOKS $VIEWS $E/components/direct-form-entry-workspace.tsx
```

Expected: five files are written, `same-lines` prints `lost 0`, 6 allowed and 40 added lines (listed in `.tmp/s5c/added-entry.txt`), Biome formats six files, the hook order is the same, the typecheck is clean with only the two baseline lines, the collection and direction tests pass (31 files and 229 tests) and the files have these sizes:

```
apps/web/src/features/collection/entry/hooks/use-entry-state.ts: 112 lines
apps/web/src/features/collection/entry/hooks/use-entry-load.ts: 130 lines
apps/web/src/features/collection/entry/hooks/use-entry-actions.ts: 173 lines
apps/web/src/features/collection/entry/components/entry-state-views.tsx: 122 lines
apps/web/src/features/collection/entry/components/direct-entry-form.tsx: 195 lines
apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx: 90 lines
6
original lines 567, lost 0, allowed 6, added 40
Checked 14 files in <ms>. Fixed 6 files.
effect-bearing hook calls 3, same order true
web typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  31 passed (31)
      Tests  229 passed (229)
  134 apps/web/src/features/collection/entry/hooks/use-entry-state.ts
  125 apps/web/src/features/collection/entry/hooks/use-entry-load.ts
  169 apps/web/src/features/collection/entry/hooks/use-entry-actions.ts
  116 apps/web/src/features/collection/entry/components/entry-state-views.tsx
  222 apps/web/src/features/collection/entry/components/direct-entry-form.tsx
   74 apps/web/src/features/collection/entry/components/direct-form-entry-workspace.tsx
  840 total
```

Six mutations of the moved flows, written for the unsplit screen and retargeted onto the files that hold the same text, must fail the rows that killed them before the split (the retry id and form version, the restore notice, the save notice, the separate response epoch, the separate response preparation and the verified contributor). Twelve more of the dry run's nineteen mutations survive before and after, and so are not claimed; one more mutation (the subject lock on save) failed once in the dry run under load and survived on a rerun on the old code, so it is not in the list either.

Create `.tmp/s5c/entry-bite-after.json`:

```json
{
  "tests": ["src/features/collection/entry/components/direct-entry-ownership.test.tsx", "src/features/collection/entry/components/direct-form-entry-workspace.test.tsx"],
  "mutations": [
    {"id": "retry-id-version", "file": "apps/web/src/features/collection/entry/hooks/use-entry-load.ts", "from": "stored?.formVersion === definition.version &&", "to": "true &&"},
    {"id": "restore-notice", "file": "apps/web/src/features/collection/entry/hooks/use-entry-load.ts", "from": "'Your persisted draft was restored.'", "to": "'x'"},
    {"id": "save-notice", "file": "apps/web/src/features/collection/entry/hooks/use-entry-actions.ts", "from": "'Draft saved to PATHWAYS. You can safely reload before submitting.'", "to": "'x'"},
    {"id": "separate-epoch", "file": "apps/web/src/features/collection/entry/hooks/use-entry-actions.ts", "from": "    loadEpoch.current++\n", "to": ""},
    {"id": "prepare-separate", "file": "apps/web/src/features/collection/entry/hooks/use-entry-state.ts", "from": "removeSensitiveDraft(newResponseOwner.key)\n", "to": ""},
    {"id": "verify-expected", "file": "apps/web/src/features/collection/entry/entry.utils.ts", "from": "throw new Error('The saved contributor does not match this submission.')", "to": "throw new Error('x')"}
  ]
}
```

```bash
node .tmp/s5c/bite.mjs .tmp/s5c/entry-bite-after.json > .tmp/s5c/entry-bite.out; tail -1 .tmp/s5c/entry-bite.out
git status --short | wc -l
git add -A apps
git commit -q -m "refactor(web): cut the direct entry screen into state, load and action hooks and two component files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -7
```

Expected: all six mutations are killed, 4 entries in the status (the screen, the two new component files and the new `hooks` folder as one), and the commit holds all six files:

```
mutations 6, survived 0
4
 .../entry/components/direct-entry-form.tsx         | 222 ++++++++
 .../components/direct-form-entry-workspace.tsx     | 593 +--------------------
 .../entry/components/entry-state-views.tsx         | 116 ++++
 .../collection/entry/hooks/use-entry-actions.ts    | 169 ++++++
 .../collection/entry/hooks/use-entry-load.ts       | 125 +++++
 .../collection/entry/hooks/use-entry-state.ts      | 134 +++++
 6 files changed, 791 insertions(+), 568 deletions(-)
```

---

### Task 7: Records

**Files:**
- Create (gitignored): `.tmp/s5c/records-edits.json`, `activity-s5c.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (section 3.3 and the S5c disposition of section 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06, MOD-15, MOD-16 rows), `docs/qad-pathways.md` (six test paths), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 15): `scripts/sad/check.ts` already routes `apps/web/src/**` to the design QA agent.

- [ ] **Step 1: Amend the change record, the audit, the QAD and the index**

Create the file with the Write tool, exactly as printed. `.tmp/s5c/records-edits.json` holds the two exact replacements of the change record: the layout and screen-cut rule appended to the S5b sentence of section 3.3, and the S5c disposition that replaces the "Deferred to S5c" paragraph of section 9 (the "Deferred to W1" sentence after it stays). `@DATE@` is replaced by the day Task 7 runs and `@M0@` by the Middleware size of Task 0:

Create `.tmp/s5c/records-edits.json`:

```json
[
  ["docs/cr-pathways-codebase-modularization.md", "a hook cut out of a screen receives the refs and callbacks it reads as parameters, not through a context (amended 2026-10-13 for S5b).", "a hook cut out of a screen receives the refs and callbacks it reads as parameters, not through a context (amended 2026-10-13 for S5b). A feature above about 30 files with several screens keeps one subfolder per concern (`features/collection/{forms,import,entry}`), each with `components/`, `hooks/` and its own `<concern>.utils.ts`, beside `<domain>.utils.ts`, `<domain>.copy.ts` and an `index.ts` that lists only what files outside the feature import, by leaf path. A screen with many pieces of state keeps them in one state hook that returns a flat object and exports `type State = ReturnType<typeof useState>`, the hooks after it take `(state, guard)` and destructure what they read, and a section of markup takes `Pick<State, ...>` of the hook results it renders, so a hook or a section that reads a name its parameter does not carry fails the typecheck; a screen is cut by line range with the lines it adds listed, never retyped (amended @DATE@ for S5c).", 1],
  ["docs/cr-pathways-codebase-modularization.md", "Deferred to S5c: the splits of `import-workspace.tsx` (1110 lines) and `direct-form-entry-workspace.tsx` (654), the guard hook and the remaining handlers of `collection-workspace.tsx`, the `features/collection` layout, `collection.copy.ts`, public `index.ts` and surface rule, the web form type copies (`form-builder-session-draft.ts`, `types/pathways.ts` `DigitalFormType`) and the S5 closing records. ", "S5c applied @DATE@ on the S5c slice branch:\n- Layout: the 63 files of `features/collection` became `forms/`, `import/` and `entry/` (each with `components/`, `hooks/` and its own `<concern>.utils.ts`) beside `collection.utils.ts`, `collection.copy.ts` and an `index.ts` of four exports by leaf path, by 62 `git mv`s with the specifiers rewritten by script; `enumLabel` (from `import-status-labels.ts`) and `formTypeLabels` (from `digital-form-contract.ts`) live in `collection.copy.ts`; the six route pages and the beneficiary registration section import through the index, `collection` joined `indexedFeatures` and `optimizePackageImports`, a deep import and a missing barrel each fail the direction test, and the route table did not change.\n- Collection screen: `collection-workspace.tsx` went from 1640 to 359 lines: nine pure declarations to `forms.utils.ts`, six hooks (`useCollectionState` returns a flat object, the other five take `(state, guard)`) and five sections that take `Pick` props, all cut by line range (`lost 0`, the 53 and 37 added lines listed); 15 new rows pin the save, publish, export, open, create version, generate copy and proceed handlers that no test reached, 28 mutations of them were killed on the unsplit screen and 38 are killed on the hook files.\n- Import and entry screens: `import-workspace.tsx` went from 1110 to 134 lines (`import.utils.ts`, four hooks, five cards) and `direct-form-entry-workspace.tsx` from 654 to 74 (`entry.utils.ts`, three hooks, `state-shell.tsx` and two component files), both by line range with `lost 0`; the effect-bearing hook calls of all three screens run in the old order (`hook-order.mjs`); 12 import and 6 entry mutations that the old rows killed are killed after the cut.\n- Types and carry-overs: `DigitalFormType` is the shared type and the draft store takes `digitalFormTypes`, pinned first by rows that pass on the old code (four mutations fail them, then two); `ImportBatchStatus` is `ImportBatchResponse['status']` and the unused `'VALIDATING'` is gone; `use-server-processing.ts` uses the shared `OperationTicket` instead of its own `Ticket`; the 15 unreachable `pathwaysClient` mock factories of 15 collection tests were unreachable (a factory that throws failed none) and are removed.\n- Tests: web went from 243 files and 2228 tests to 244 files and 2253 tests; config, shared, imports, api and sad counts did not change; the collection tests keep all their names and gain 25 rows.\n- Routes: Middleware stayed at @M0@ kB and against the Task 0 build five collection routes (`/collection`, `/collection/forms`, `/collection/forms/new`, `/collection/projects/[projectId]/forms/[formId]` and `/collection/import`) are bigger at the printed precision, four by 2 kB and `/collection/import`, which loads both screens, by 3 kB, from the module boundaries of the cuts, and none more (the layout commit alone changed none).\n- Decisions: S5c is nine tasks and S5 closes with it (ruling 1); the index lists four leaf exports and no sub-index (ruling 4); the screens are a flat state object plus hooks that take it, with two `biome-ignore` lines for refs and setters of the state hook (ruling 6); only mutations the old rows killed are claimed (ruling 7); the unused `Ticket` type was the only duplicate removed and no logic was merged (ruling 10); `form-builder-session-draft.ts` has no production importer and stays (ruling 12).\n\nS5 is closed: S5a, S5b and S5c are applied. Left as test debt: 12 mutations of the collection handlers that no row can reach, 18 of the import screen and 12 of the entry screen. ", 1]
]
```

The audit rows, the QAD paths and the index row are small sed edits on text anchors (the rows end differently on a branch that holds S6b and S6c, and the MOD-06 row already named S5c before this slice, so each edit names a phrase in the middle of its row without its full stop and the check below counts the new phrases, not the word S5c): the QAD test paths follow the move (five files and the glob `features/collection/*.test.tsx`, which would otherwise match only the three files left at the top of the folder), and the index row lists S5c among the applied slices:

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g; s/@M0@/$(cat .tmp/s5c/m0)/g" .tmp/s5c/records-edits.json
node .tmp/s5c/replace-exact.mjs .tmp/s5c/records-edits.json
sed -i \
  -e '/^| MOD-06 /s/the rest of the collection screens by S5c/the collection, import and direct entry screens split into hooks and sections by S5c/' \
  -e '/^| MOD-15 /s/with a public index by S4b/with a public index by S4b; collection folders by concern, `collection.copy.ts`, public index and surface rule by S5c/' \
  -e '/^| MOD-16 /s/indicator read hooks and labels by S3b/indicator read hooks and labels by S3b; the web form type list from the shared contract by S5c/' \
  docs/audit-pathways-codebase-modularity-20261009.md
Q=docs/qad-pathways.md
sed -i \
  -e 's#features/collection/direct-entry-ownership\.test\.tsx#features/collection/entry/components/direct-entry-ownership.test.tsx#g' \
  -e 's#features/collection/direct-form-entry-workspace\.test\.tsx#features/collection/entry/components/direct-form-entry-workspace.test.tsx#g' \
  -e 's#features/collection/import-auto-continue\.test\.ts#features/collection/import/import-auto-continue.test.ts#g' \
  -e 's#features/collection/import-value-map-editor\.test\.tsx#features/collection/import/components/import-value-map-editor.test.tsx#g' \
  -e 's#features/collection/import-workspace\.processing\.test\.tsx#features/collection/import/components/import-workspace.processing.test.tsx#g' \
  -e 's#features/collection/\*\.test\.tsx#features/collection/**/*.test.tsx#g' $Q
sed -i '/^| \[cr-pathways-codebase-modularization\]/s/\bS5b\b/S5b, S5c/' docs/index.md
git diff --stat docs | cat
grep -E '^\| MOD-(06|15|16) ' docs/audit-pathways-codebase-modularity-20261009.md | grep -c -e 'screens split into hooks and sections by S5c' -e 'collection folders by concern' -e 'form type list from the shared contract by S5c'
for p in $(grep -oh "apps/web/src/features/collection/[A-Za-z0-9./*-]*\.test\.tsx\?" $Q | grep -v '\*' | sort -u); do test -f $p || echo "missing $p"; done
grep -c "@DATE@\|@M0@" docs/cr-pathways-codebase-modularization.md || true
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
```

Expected: two replacements in the change record, four docs files changed (the activity log follows in the next step), `3` audit rows that carry the new S5c text, no QAD path missing, no placeholder left and the index status updated:

```
2 replacements in 1 files
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++--
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                | 10 +++++-----
 4 files changed, 20 insertions(+), 11 deletions(-)
3
0
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a and S6b applied, S6c next |
```

The index status line is the CR row; its middle part depends on what the other slices wrote there, so check only that it now lists `S5c` among the applied slices; if another slice changed the sentence so that the sed above does not match, edit the row by hand to say that S5c is applied.

- [ ] **Step 2: Activity log**

`.tmp/s5c/activity-s5c.md` is the S5c section of the activity log, with the commit hashes of Tasks 1 to 6 as `@H1@` to `@H6B@`:

Create `.tmp/s5c/activity-s5c.md`:

```md

## @DATE@ Modularization S5c collection components (claude/modularization-s5c-9ept8o)
- Task 1 (@H1@): `features/collection` laid out as `forms/`, `import/` and `entry/` by 62 `git mv`s with 54 files of specifiers rewritten, `collection.copy.ts` (`enumLabel`, `formTypeLabels`) and a four export `index.ts`; the route pages and the beneficiary registration section import through it, `collection` joined the two feature lists, two mutations showed the surface rule and the list agreement bite, and the route table did not change.
- Task 2 (@H2A@, @H2B@, @H2C@, @H2D@): `ImportBatchStatus` aliased to the response type (the unused `'VALIDATING'` is gone), the 15 unreachable `pathwaysClient` mock factories of 15 test files removed after a throwing factory failed none, ten rows pinned the form type list (four mutations failed them) and the draft store and the web type took `digitalFormTypes` (two mutations failed them).
- Task 3 (@H3A@, @H3B@, @H3C@): `forms.utils.ts` (nine declarations), 15 rows for the save, publish, export, open, create version, generate copy and proceed handlers (28 mutations killed on the old screen) and six hooks cut by line range (`collection-workspace.tsx` 1640 to 615 lines, `lost 0`, 13 lines allowed and 53 added, 38 mutations killed on the new files).
- Task 4 (@H4@): five sections cut out of the screen (615 to 359 lines, `lost 0`, 2 allowed and 37 added), six mutations killed.
- Task 5 (@H5A@, @H5B@, @H5C@): one shared `OperationTicket` type, `import.utils.ts` and the import screen cut into four hooks and five cards (1110 to 134 lines, `lost 0`, 59 added), twelve mutations killed.
- Task 6 (@H6A@, @H6B@): `entry.utils.ts`, `state-shell.tsx` and the direct entry screen cut into three hooks and two component files (654 to 74 lines, `lost 0`, 40 added), six mutations killed.
- Task 7: the change record (section 3.3 hook and layout rule, section 9 S5c disposition closing S5), the audit rows MOD-06, MOD-15 and MOD-16, five QAD test paths and the index row follow the slice; no SAD routing change, because `apps/web/src/**` already routes to the design QA agent.
- Decisions: the S5c decisions are recorded in the change record section 9; the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge. Not pinned by a test before or after: 12 mutations of the collection handlers (the expected revision of a save, the read-only guard of a published form, the permission checks of a publish, the needed grants and duplicates of the proceed flow and others), 18 of the import screen and 12 of the entry screen, which stay as test debt. `form-builder-session-draft.ts` has no production importer and stays.
- Deferred: nothing from S5; the unused `ParticipantsService` parameter stays with W1.
```

```bash
D=$(date +%F)
h() { git log -1 --format=%h --grep="$1"; }
sed -i -e "s/@DATE@/$D/" \
  -e "s/@H1@/$(h '^refactor(web): lay out the collection feature')/" \
  -e "s/@H2A@/$(h '^refactor(web): alias the import batch status')/" \
  -e "s/@H2B@/$(h '^test(web): drop the unused pathways-client mocks')/" \
  -e "s/@H2C@/$(h '^test(web): pin the form type list')/" \
  -e "s/@H2D@/$(h '^refactor(web): take the form type list')/" \
  -e "s/@H3A@/$(h '^refactor(web): move the pure declarations of the collection screen')/" \
  -e "s/@H3B@/$(h '^test(web): pin the form and import handlers')/" \
  -e "s/@H3C@/$(h '^refactor(web): cut the collection screen into')/" \
  -e "s/@H4@/$(h '^refactor(web): cut the dialogs, correction table')/" \
  -e "s/@H5A@/$(h '^refactor(web): share one operation ticket type')/" \
  -e "s/@H5B@/$(h '^refactor(web): move the pure declarations of the import screen')/" \
  -e "s/@H5C@/$(h '^refactor(web): cut the import screen into')/" \
  -e "s/@H6A@/$(h '^refactor(web): move the subject check and the shell')/" \
  -e "s/@H6B@/$(h '^refactor(web): cut the direct entry screen into')/" \
  .tmp/s5c/activity-s5c.md
grep -c "@H[0-9A-C]*@\|@DATE@" .tmp/s5c/activity-s5c.md || true
cat .tmp/s5c/activity-s5c.md >> docs/activity-log.md
tail -11 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters; the short hashes are those of the planner's run and differ on every run, so compare the rest of each line and the count of hashes per task):

```
0

## 2026-10-13 Modularization S5c collection components (claude/modularization-s5c-9ept8o)
- Task 1 (b629882): `features/collection` laid out as `forms/`, `import/` and `entry/` by 
- Task 2 (5cf57d4, 9e65269, 7f56c2b, 65bcda1): `ImportBatchStatus` aliased to the response
- Task 3 (199851b, 24a9b28, 34a0031): `forms.utils.ts` (nine declarations), 15 rows for th
- Task 4 (95b8a41): five sections cut out of the screen (615 to 359 lines, `lost 0`, 2 all
- Task 5 (ebac86b, 7f3a1a7, d838ce3): one shared `OperationTicket` type, `import.utils.ts`
- Task 6 (508f996, 8de18f6): `entry.utils.ts`, `state-shell.tsx` and the direct entry scre
- Task 7: the change record (section 3.3 hook and layout rule, section 9 S5c disposition c
- Decisions: the S5c decisions are recorded in the change record section 9; the plan copy 
- Deferred: nothing from S5; the unused `ParticipantsService` parameter stays with W1.
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git commit -q -m "docs: record modularization S5c

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -8
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 5 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1442 files in <ms>. No fixes applied.
 docs/activity-log.md                                | 11 +++++++++++
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++--
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                | 10 +++++-----
 5 files changed, 31 insertions(+), 11 deletions(-)
```

---

### Task 8: Full release gates

This slice opens no pull request: it is stacked below the next slice, and the final pull request of the series carries the DB replay and the other CI gates. The gates below run on the slice branch and are recorded in the activity log. No plan copy is removed here (ruling 15).

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 | tail -1
pnpm typecheck 2>&1 | grep -E "Done|error"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS" | cut -c1-120
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s5c/build-routes.sh gates
cat .tmp/s5c/m0
node .tmp/s5c/compare-routes.mjs .tmp/s5c/routes-baseline.txt .tmp/s5c/routes-gates.txt | tail -8
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
```

Expected: Biome clean, the five typecheck lines, the two baseline `--noUnusedLocals` lines, the test summaries, the build exit code with the Middleware line against `M0`, the route comparison and the docs check:

```
Checked 1442 files in <ms>. No fixes applied.
packages/config typecheck: Done
packages/shared typecheck: Done
packages/imports typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value
src/types/pathways.ts(13,3): error TS6196: 'SadddDashboard' is declared but never used.
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  37 passed (37)
packages/shared test:       Tests  675 passed (675)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  244 passed (244)
apps/web test:       Tests  2253 passed (2253)
      Tests  57 passed (57)
exit 0
ƒ Middleware                                                      103 kB
103
/collection: 424 kB -> 426 kB (+2.0)
/collection/forms: 424 kB -> 426 kB (+2.0)
/collection/forms/new: 424 kB -> 426 kB (+2.0)
/collection/import: 432 kB -> 435 kB (+3.0)
/collection/projects/[projectId]/forms/[formId]: 424 kB -> 426 kB (+2.0)
routes 72, different 5

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```

The typecheck and test lines are the Task 0 baselines with these deltas: web gains 1 file (`collection-workspace.actions.test.tsx`) and 25 tests (the 15 handler rows of Task 3 and the 10 form type rows of Task 2, 8 in the draft test and 2 in the copy test), and config, shared, imports, api and sad equal `B_config`, `B_shared`, `B_imports`, `B_api` and `B_sad`. The two `--noUnusedLocals` lines are the Task 0 pair with `indicators` moved from the screen to `use-collection-state.ts`. The route comparison is against the Task 0 build: the five collection routes are bigger at the printed precision, four by 2 kB and `/collection/import`, which loads both screens, by 3 kB (the module boundaries of 29 new modules; Task 1 alone changed none), none more, and Middleware equals `M0`; the absolute sizes depend on the container (the planner printed 426 and 435 kB), so judge the deltas. `docs:check` ends with the 6 baseline failures and 1 warning. The `ZodPipe` 5 s test and `beneficiary-detail-loader.test.tsx` are known timing flakes: rerun them alone if either fails.

```bash
pnpm --filter @pathways/web exec vitest run src/features/collection --reporter=json --outputFile=$PWD/.tmp/s5c/names-after.json > /dev/null 2>&1
node .tmp/s5c/test-names.mjs .tmp/s5c/names-after.json > .tmp/s5c/names-after.txt
wc -l < .tmp/s5c/names-after.txt
echo "lost $(comm -23 .tmp/s5c/names-before.txt .tmp/s5c/names-after.txt | wc -l)"
echo "added $(comm -13 .tmp/s5c/names-before.txt .tmp/s5c/names-after.txt | wc -l)"
comm -13 .tmp/s5c/names-before.txt .tmp/s5c/names-after.txt | sed -E 's/ [a-z]+ (form type|-) .*//' | cut -c1-110 | sort | uniq -c | sort -rn | head -30
```

Expected: the collection tests have 224 names, the 199 of Task 0 and 25 new ones, and lose none; the 25 are the 2 copy rows and 8 draft rows of Task 2 and the 15 handler rows of Task 3:

```
224
lost 0
added 25
      1 formTypeLabels names the same form types and import batch statuses as the shared contract
      1 formTypeLabels labels exactly the shared form types, in their order
      1 form builder session draft keeps a draft of the TRAINING_SURVEY form type
      1 form builder session draft keeps a draft of the PRE_TEST form type
      1 form builder session draft keeps a draft of the POST_TEST form type
      1 form builder session draft keeps a draft of the OUTCOME_MONITORING form type
      1 form builder session draft keeps a draft of the OTHER form type
      1 form builder session draft keeps a draft of the BENEFICIARY_REGISTRATION form type
      1 form builder session draft keeps a draft of the ACTIVITY_MONITORING form type
      1 form builder session draft drops a draft
      1 collection saved forms list reports the export and refuses a form of another project
      1 collection saved forms list opens a saved draft in the builder with its links and selects its first field
      1 collection saved forms list opens a published form read-only with a notice
      1 collection publish publishes the opened draft at its revision, reports it and returns to the Forms list
      1 collection import proceed stops before processing when the server finds invalid rows
      1 collection import proceed saves the mapping at the newest revision the server reports
      1 collection import proceed refuses to save a mapping when the server stored fewer columns than the file
      1 collection import proceed refuses to save a mapping when the server stored a different header
      1 collection import proceed keeps a failed processing run resumable and says how far it got when the dialog is c
      1 collection import proceed creates a form from a header-only file with a code within 64 characters and opens th
      1 collection import proceed asks for a published form before importing data rows
      1 collection form versions and copies opens the new draft version with its own code, revision and details
      1 collection form versions and copies keeps a generated copy code within the 64 character limit
      1 collection draft save retries a failed create with the same code, then updates the draft against its saved rev
      1 collection draft save keeps the edits of an opened form when the saved copy comes back from the server
```

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S5c changes no migration, so the CI replay of the final pull request of the series (expect 171 PASS, 0 FAIL) is the gate when the replay cannot run here; record which one ran.

Expected: in the planning container the user is root, `pwsh`, PostgreSQL 18 and Docker exist and the Supabase CLI does not; the migration integrity check passes and `initdb` refuses root, so the replay ends `FAILED` (as a non-root user with PostgreSQL 18 the script ends with `PHASE6_LOCAL_REPLAY=PASS`, which the dry run did not see):

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

Expected: `"status":"ok"`; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; the Playwright results equal the earlier slices' gate runs (auth-navigation 27/27; the main suite fails only the same 9 tests as before: MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, and each must behave as on dev:

- Form builder: open `/collection/forms/new`, add a field, move it up and down, edit its label and type, delete it (the confirmation names the field), save a draft (the save dialog shows the mapped and the metadata field counts), publish, open `/collection/forms` and see the saved form; open a saved draft, export the definition, create a new version of a published form and generate a copy.
- Collection import: open `/collection/import?mode=extend`, upload a CSV, see the preview and the correction table (page through it), let the automatic mapping run, choose a duplicate decision where the select is shown, save the mapping, open the proceed dialog, process, stop the run and resume it; upload the same file again after a failure and see the same client import id in the network panel.
- Import screen: open `/collection/import`, upload, map, validate and process a batch; reload a batch in `RECOVERY_REQUIRED` and press "Resume stored upload"; open the batch list, the summary, the mapping card with its value maps and the row table.
- Direct entry: open `/collection/projects/<project>/forms/<form>/entries/new`, fill the form, save a draft (the survey subject locks after the first save), reload and see the restored draft, submit, and start another response.
- Untouched neighbours: open a beneficiary registration form (it renders the dynamic fields of a published form through the collection index), `/beneficiaries/new`, and a project indicators page (it lists forms).

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s5c
pnpm sad:check --base "$(cat .tmp/s5c/base-sha)" --head HEAD --output .tmp/sad/s5c/manifest.json > .tmp/sad/s5c/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s5c/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0 and writes the manifest, which requires only the design QA agent, for 166 paths (all under `apps/web`, the docs route to no role; the base is the Task 0 head, so the count is this slice's own paths, and a role above 60 paths is split into packets, here three of 60, 60 and 46):

```
exit 0
design-qa-agent 166
```

`.tmp/sad/s5c/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`. Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, and `design-qa-agent` will need it), transcribe each reply into `.tmp/sad/s5c/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s5c/assemble.mjs`, run `node .tmp/sad/s5c/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s5c/base-sha)" --head HEAD --reviews .tmp/sad/s5c/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The planner and the pre-flight scan could not dispatch the roles (no subagents in their copies), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results: per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice. The bullet below takes its date, head and Middleware size from the commands and is to be adapted with your own numbers (the package counts must equal the Task 0 baselines, except the web files and tests, which are the Task 0 baseline plus 1 file and 25 tests); it holds no backtick or backslash, so the unquoted heredoc expands only `$D`, `$H` and `$M0`:

```bash
D=$(date +%F)
H=$(git rev-parse --short HEAD)
M0=$(grep Middleware .tmp/s5c/routes-baseline.txt | grep -oE '[0-9]+ kB' | head -1)
cat >> docs/activity-log.md <<LOG
- Gates ($D, cloud container, head $H): lint, typecheck and tests pass with config 19, shared 675, imports 94, api 2610 passed and 21 skipped, web 244 files and 2253 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware $M0 and, against the Task 0 build, 4 collection routes 2 kB bigger and /collection/import 3 kB bigger, none more; SAD manifest of 166 paths for the design QA agent (three packets) with sign-off pending; replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: the developer asked for one pull request after every slice is implemented.
LOG
git add docs/activity-log.md
git commit -q -m "docs: record modularization S5c release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format= HEAD | tail -3
git log --oneline "$(cat .tmp/s5c/base-sha)"..HEAD | wc -l
git status --short | wc -l
```

Expected: one file, one line added, 17 commits on the slice branch since the base (the Task 0 plan commit, 1 + 4 + 3 + 1 + 3 + 2 code commits of Tasks 1 to 6, the records commit and this one) and a clean tree:

```
 docs/activity-log.md | 1 +
 1 file changed, 1 insertion(+)
17
0
```

The series continues in the next slice: no plan copy is removed here, and after the developer merges the series the controller removes the executed plan copies in `docs/superpowers/plans` (and their index rows) with a sed that matches only those rows; the `docs/handoff` copies and rows stay.
