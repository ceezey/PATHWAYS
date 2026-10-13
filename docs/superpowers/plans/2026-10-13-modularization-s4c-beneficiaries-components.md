# S4c Beneficiaries Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the four oversized beneficiary components and the two oversized beneficiary tests into hooks, section components and test files of about 300 lines or less, and give `ScopedBeneficiaryForm` a purpose name, with no change to any screen, request, response, permission decision, cache entry or route bundle size.

**Architecture:** S4c is the second web half of S4 (S4b, the clients and the `features/beneficiaries` layout, is applied below it). Nothing is rewritten by hand: `cut.mjs` builds each new file from line ranges of the old file, plus a few literal wrapper lines, after checking the old file's hash, and `same-lines.mjs` proves that every non-blank line of the old file now sits in a new file (`lost 0`) and lists the lines the split added (signatures, props and calls). `beneficiary-form.tsx` (1391 lines) becomes the 36 line `BeneficiaryForm`, the renamed `BeneficiaryRegistrationForm`, three hooks in `registration/hooks`, eight section components and 12 helper declarations in `registration.utils.ts`; `beneficiary-detail.tsx` (1173) becomes a 93 line screen, two hooks in `profile/hooks` and eleven section components; `beneficiary-media-proof.tsx` (668) and `beneficiary-directory.tsx` (565) give up their dialog, viewer, counter, columns and filter select; `beneficiary-form.test.tsx` (870) and `beneficiary-detail.test.tsx` (636) split by concern into seven files and two fixture modules. The 50 test rows (28, 5 and 17) and the 177 `expect(` calls of the two tests and the pure-helper test are counted before and after. The public surface does not change: `index.ts` is untouched, the loaders keep importing `BeneficiaryForm`, `BeneficiaryDetail`, `BeneficiaryMediaProof` and `BeneficiaryDirectory` from the same paths. Mechanical edits use one-off Node scripts under `.tmp/s4c/` (gitignored, never committed) whose content is given in full. Every step below was dry-run in order on an exported copy of an S4b dry-run tip (`f6855f8`), the whole sequence was replayed by one driver that executes the code blocks of this plan, and the pre-flight scan replayed it again on the real S4b tip `7442e2fe`: the replayed trees are identical under `apps/web/src/features` and `apps/web/src/test`, and the figures quoted below are those of the replay on `7442e2fe`.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, React 19 hooks, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5 and 9 including the S4b disposition and its "Deferred to S4c" paragraph) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06 for the four components, MOD-17 for the `Scoped` name).

## Rulings

Controller rulings for S4c. Each was checked on the S4b tip; Task 0 recounts them. Ruling 1 of the S4b plan (split S4b and S4c) is the origin of this plan.

1. **Cut, never retype.** `cut.mjs` takes a JSON plan `{ source, hash, files }`; each file is a list of items: a literal line, a `[from, to]` range of the source (1-based, inclusive), `@imports` (the source's import block without `'use client'`), or `{ file, from }` (the lines of an existing file from a line on). The run stops when the source hash differs from the one the plan was written for. `same-lines.mjs` then prints `lost 0` and the lines added; those lines are the review surface, and they are listed in each task (255 for the form, 145 for the detail, none for the media proof, 12 for the directory). A moved line that Biome reflows is the one thing the proof cannot see; it counts trimmed lines, so a reflow shows as a lost line and is looked at. Cost if wrong: review time.
2. **Effects keep their order.** The three registration hooks are called so that the effects run in the order they had in the component (context load, draft hydrate, draft persist) and the validation memos follow; the context state is now declared before the draft state, which no render observes. `useBeneficiaryDetail` is called first in the screen and the old component had no `useEffect`, so every `useMemo` and handler runs in the same order against the same state. The one changed line is the dependency list of the context effect, which gains `setConfirmOpen` because the hook now receives it as a parameter and Biome's `useExhaustiveDependencies` requires it; a `useState` setter is stable, so nothing re-runs. `same-lines` accounts for it with a rename argument. Cost if wrong: an effect that fires twice, which the form tests (draft recovery, project change, provisioning) catch.
3. **Narrow props, no context.** Section components take the values and callbacks they read, as plain props for the registration sections and as `{ detail }: { detail: Pick<BeneficiaryDetailState, ...> }` for the detail sections; each destructures what it reads and returns the JSX it had. The hook returns the full state object and the screen hands it to every section. No React context is introduced and no prop is renamed. Cost if wrong: a prop list that is long (the longest, `ProfileFields`, takes 16); the alternative, one context for the whole form, would hide which section reads what.
4. **`ScopedBeneficiaryForm` becomes `BeneficiaryRegistrationForm` (MOD-17).** It moves to `registration/components/beneficiary-registration-form.tsx` (420 lines); `beneficiary-form.tsx` keeps the 36 line `BeneficiaryForm` wrapper (the scope guard and the project state) because the loader, its test mock and the form tests import that name from that path. The name `ScopedBeneficiaryForm` appears nowhere in `apps` or `packages` afterwards (Task 0 counts it, Task 1 Step 3 recounts it; other `Scoped` names such as `requireScopedProject` are not touched). Cost if wrong: a rename.
5. **Pure helpers join `registration.utils.ts`.** The 12 declarations of lines 54 to 242 (`calendarDay`, `RegistrationAge`, `registrationAgeAtDate`, `projectRegistrationValues`, `BeneficiaryDraft`, `initialDraft`, `draftFromBeneficiary`, `fieldIds` and the rest, 10 of them exported) move to `registration.utils.ts` beside `registrationFieldCodes`, with `export` added to the 10; `beneficiary-form.tsx` no longer re-exports them, so the one test that imported two of them from the component imports them from the utils file (`task1-edits.json`), and the three pure rows of the form test (`projectRegistrationValues`, the birthday boundary and the minimum age) move into `registration.utils.test.ts`. Cost if wrong: an import path.
6. **Hooks live in `<concern>/hooks`, one exported component per file.** The registration, profile and directory folders gain `hooks/` (CR 3.3, as `features/projects/activities/hooks`), and the helpers a section needs but the screen also uses are exported from the file that owns them (`Field`, `ToggleField` and `PreviewRow` from their own files, `SummaryRow`, `RecordList`, `StageActivityList` and `JourneyNoteList` likewise). The detail hook file `use-beneficiary-detail.ts` (334 lines) and `profile-fields.tsx` (321) stay above the 300 line target and below the 500 line flag (CR 3.5): a further cut would split a hook's state from its handlers or a form grid across files with no gain. Cost if wrong: two files 10 percent over target.
7. **Tests split by concern, fixtures shared through `test/fixtures`.** `beneficiary-form.test.tsx` becomes `beneficiary-form.test.tsx` (6 rows), `.registration.test.tsx` (8), `.definitions.test.tsx` (6) and `.age-rules.test.tsx` (5), with 3 pure rows moved to `registration.utils.test.ts` (28 in all); `beneficiary-detail.test.tsx` becomes `.test.tsx` (5), `.journey-actions.test.tsx` (5) and `.assessments.test.tsx` (7) (17 in all). The Radix select stand-in, `profileState`, `draftKey`, `validDraft`, `context` and `completeSelects` go to `test/fixtures/beneficiary-form-fixtures.ts`, and the project, stage, form, activity and beneficiary records to `beneficiary-detail-fixtures.ts`. A `vi.mock` factory cannot name an imported binding, so each file keeps its own `vi.hoisted` block and `vi.mock` lines (copied by the cut), and the select mock is reached by `(await import(...)).selectMock()` inside the factory. Task 3 counts `it`, `describe` and `expect(` before and after (50 rows and 177 assertions both ways). Cost if wrong: a lost test row, which the count shows.
8. **Media proof and directory.** `AddMediaDialog` (with `FileStatus`, `UploadItem`, `maxNote`, `fallbackLimits`, `typeLabels` and `statusLabel`), `MediaViewer` and `MediaKpi` move to `media/components` by `split-module.mjs` (declaration level, S3b's tool), and the type `LoadState`, which the proof and the viewer share, to `media.utils.ts`. The directory's column definitions (lines 170 to 264, now `useBeneficiaryColumns` in `directory/hooks`) and `FilterSelect` move out by `cut.mjs`; the screen keeps its state, effects and table, and ends at 435 lines, which is why the columns leave (565 lines was over the 500 line flag). The `'5-9'` age band option stays (MOD-B1, behavior). Cost if wrong: none.
9. **Characterization.** The existing 105 beneficiary tests are the characterization: Tasks 1 and 2 mutate one moved line per hook (a draft write, the default form provisioning, the minor guardian rule, the history reload, the stage order) and require the tests to fail, then restore it. Two guards the old tests never pinned stay unpinned and are named here so nobody reads the moved code as newly covered: the draft restore ignoring a stored draft of another project, and the minor age boundary at 18. The cut proof is what covers them. Cost if wrong: none (behavior is unchanged either way).
10. **Route bundles.** More modules add a little loader code: three routes (`/beneficiaries/[beneficiaryId]`, `.../edit`, `/beneficiaries/new`) grow by 1 kB and no other route changes (Task 4 Step 5 compares with the Task 0 build). The criterion is no route more than 1 kB bigger and Middleware at `M0` (103 kB in this container, 102 kB on Windows). Every production build starts from a clean `.next` (S2b ruling 10). Cost if wrong: a bundle review.
11. **No new SAD routing.** `features/beneficiaries/**` and `apps/web/src/test/fixtures/**` route to `design-qa-agent` only (46 changed paths, Task 6 Step 4). The privacy paths (`lib/api`, shared contracts, api modules) are untouched. Cost if wrong: one glob in `scripts/sad/check.ts`.
12. **No pull request for this slice.** The developer asked for one pull request into `dev` after every slice is implemented, so S4c gets none of its own: the branch stays stacked on the S4b branch, and the final pull request CI replay is the gate for the database replay that cannot run here. Task 6 records the gate results in the activity log and says so. Cost if wrong: none.
13. **Not done in S4c (recorded in CR section 9):** the `'5-9'` age band (MOD-B1); `beneficiary-detail-loader.tsx` (259 lines) and the other loaders, which are under target; the two files left slightly above 300 lines (ruling 6).
14. **Cross-plan.** S5 (collection) and S6 mock `@/lib/api/beneficiaries` and `@/lib/api/journeys` and none of the files split here; S8 reads no beneficiary component. Cost if wrong: a later Task 0 stops on a missing path or count.

## Interfaces assumed from earlier sub-projects

- S4b: `lib/api/{beneficiaries,journeys,beneficiary-media}.ts` (the three clients the new hooks import), `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with `components/`, `<concern>.utils.ts` and `beneficiaries.utils.ts`, `features/beneficiaries/index.ts` with six leaf exports, `import-direction.test.ts` listing `beneficiaries` among the indexed features, the `docs/superpowers/plans` copy of the S4b plan (which holds the S4c outline and stays listed: the controller removes plan copies only after the final merge).
- S3b: `split-module.mjs` and `same-lines.mjs` (reproduced in Task 0 with the `also` option added to `same-lines`), and the `apps/web/src/test/fixtures` folder (F1).
- S2b: the `components/` plus `hooks/` subfolder convention of `features/projects/activities` and the `<domain>.utils.ts` suffix rule.
- F4b: `PathwaysClientError`, `useCurrentRole`, `useSensitiveDraftOwner` and `sensitive-drafts` (the draft owner the registration hooks take).

## Produces (names later plans consume)

- `registration/components/beneficiary-registration-form.tsx` (`BeneficiaryRegistrationForm`), `beneficiary-form.tsx` (`BeneficiaryForm`, unchanged contract) and the section components `RegistrationDefinitionSection`, `ProfileFields`, `ValidationSummary`, `ProfilePreview`, `ConfirmRegistrationDialog`, `Field`, `ToggleField`, `PreviewRow`.
- `registration/hooks/use-registration-context.ts` (`useRegistrationContext`), `use-registration-draft.ts` (`useRegistrationDraft`), `use-registration-validation.ts` (`useRegistrationValidation`).
- `registration/registration.utils.ts` now also exports `BeneficiaryDraft`, `initialDraft`, `registrationAgeAtDate`, `projectRegistrationValues`, `beneficiarySexValue`, `beneficiaryDisabilityValue`, `draftFromBeneficiary`, `BeneficiaryFieldKey`, `ValidationIssue`, `fieldIds`.
- `profile/hooks/use-beneficiary-detail.ts` (`useBeneficiaryDetail`, `BeneficiaryDetailProps`, `BeneficiaryDetailState`), `use-beneficiary-detail-view.ts` (`useBeneficiaryDetailView`); `profile/components/{detail-header,profile-summary-dialog,journey-tab,assessment-dialog,participation-dialog,enrollment-status-dialog,journey-note-dialog,summary-row,record-list,stage-activity-list,journey-note-list}.tsx`.
- `media/components/{add-media-dialog,media-viewer,media-kpi}.tsx` and `LoadState` in `media/media.utils.ts`; `directory/hooks/use-beneficiary-columns.tsx` (`useBeneficiaryColumns`) and `directory/components/filter-select.tsx` (`FilterSelect`).
- `apps/web/src/test/fixtures/beneficiary-form-fixtures.ts` (`selectMock`, `profileState`, `draftKey`, `validDraft`, `context`, `completeSelects`) and `beneficiary-detail-fixtures.ts` (`project`, `activity`, `stage`, `form`, `beneficiary`, `beneficiaryWithNote`).
- No file of `features/beneficiaries` above 500 lines; no test file above 300; `ScopedBeneficiaryForm` gone.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request, response, cache entry or audit row changes. The only line edits inside moved code are `export` keywords, the renamed component and the one dependency entry of ruling 2. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit; no file outside `features/beneficiaries` changes, so no import of the feature changes.
- Every moved line is checked with `.tmp/s4c/same-lines.mjs` (`lost 0`) before Biome formats the new files, and `cut.mjs` stops on a source hash it was not written for. If a hash differs, a file changed since planning: stop and report NEEDS_CONTEXT.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); test files split as `<file>.<concern>.test.tsx`; comments are one sentence, no emojis; docs prose has no em dashes and no double hyphens (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s4c/trim-imports.mjs <file>` after cutting and `pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals` after each web task: it must list only the two lines that exist at the baseline (`collection-workspace.tsx` `indicators` and `types/pathways.ts` `SadddDashboard`).
- No import may be kept alive only by a comment or JSDoc mention (the SAD import check blocks it); `trim-imports.mjs` ignores comments and quoted strings for that reason.
- `pnpm typecheck` and `pnpm build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Run `.tmp/s4c/build-routes.sh <name>` for every production build (it removes `apps/web/.next` first, runs the web build and saves the route table); a build takes about three minutes, so give the command a ten minute timeout. A full web test run takes about four minutes, so give it the same timeout.
- Mock factories name modules by the specifier the code under test imports; the split tests keep the exact `vi.mock` lines of the old test, and a mutation run restores its file with `git checkout` before the next step.
- Write the scripts and the JSON plans with the Write tool, not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions and template escapes. One-off scripts live in `.tmp/s4c/` (gitignored) and are never committed; logs go there too. Use bash only.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- If a known flake fails (the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`), rerun it alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the dry run on the S4b tip and must match, except the package test counts of Task 0 (see there) and the totals Biome prints in `Checked <n> files` for a whole-repository run, which grow with every file the branch holds. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are cumulative from Task 0 and are stated as deltas from the baselines `B_shared`, `B_web` (and `B_api`, `B_sad`, `B_config`, `B_imports`, which do not change).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s4c-9ept8o`, stacked on `claude/modularization-s4b-9ept8o`, whose head Task 0 records in `.tmp/s4c/base-sha`); no new worktree, no new branch. No plan copy is removed in this slice: the controller removes the copies in `docs/superpowers/plans` only after the final merge. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`, and nobody opens a pull request for this slice (ruling 12). Do not touch migrations, seeds, `.env` files or review evidence; only files under `apps/web/src/features/beneficiaries`, `apps/web/src/test/fixtures` and `docs` change.
- The two fixture modules hold the synthetic records the old tests held (`Synthetic Person`, codes such as `BEN-C3-NEW-001`, test projects); no customer personal data, contact, account number or credential is added to a fixture, a record or a log line.
- Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run when supabase or Docker is missing (Task 6).

## Review Focus

1. Every moved line must be the same line: `same-lines` prints `lost 0` for the form (1365 declaration lines), the detail (1069), the media proof (595) and the directory (486). The lines added are signatures, destructurings, prop lists and calls; read the lists in Tasks 1, 2 and 4.
2. Effect order and dependency lists (ruling 2): read the three registration hooks and `useBeneficiaryDetail` against the old component, and check that `setConfirmOpen` is the only dependency added.
3. Section props: a section that is handed a value it does not read, or reads a value it was not handed, fails typecheck (`Pick` lists) or lint; read the `Pick` lists of the detail sections and the 16 props of `ProfileFields` once.
4. Test splits lose nothing: 50 rows, 177 `expect(` calls and the same `vi.mock` lines in every new file (Task 3 Steps 2 and 3). A shared fixture value must not be mutated by one test and read by another: only `profileState` is mutated (reset in `afterEach`, as before).
5. A route bundle must not grow when files split (ruling 10): three routes by 1 kB, none by more, Middleware at `M0`.
6. The records say what was and was not proven (ruling 9): the two unpinned guards are named, and the e2e and browser results are pending a local run.

## File map

| Path | Role after S4c |
|---|---|
| `apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx` | 36 line `BeneficiaryForm` wrapper (1391 lines before, Task 1) |
| `registration/components/beneficiary-registration-form.tsx`, `registration-definition-section.tsx`, `profile-fields.tsx`, `validation-summary.tsx`, `profile-preview.tsx`, `confirm-registration-dialog.tsx`, `form-field.tsx`, `toggle-field.tsx`, `preview-row.tsx` | the renamed form and its sections (new, Task 1) |
| `registration/hooks/use-registration-{context,draft,validation}.ts` | registration hooks (new, Task 1) |
| `registration/registration.utils.ts` | 82 lines plus the 12 moved declarations, 283 in all (Task 1) |
| `profile/components/beneficiary-detail.tsx` | 93 line screen (1173 lines before, Task 2) |
| `profile/components/{detail-header,profile-summary-dialog,journey-tab,assessment-dialog,participation-dialog,enrollment-status-dialog,journey-note-dialog,summary-row,record-list,stage-activity-list,journey-note-list}.tsx`, `profile/hooks/use-beneficiary-detail{,-view}.ts` | detail sections and hooks (new, Task 2) |
| `registration/components/beneficiary-form.{registration,definitions,age-rules}.test.tsx`, `profile/components/beneficiary-detail.{journey-actions,assessments}.test.tsx`, `registration/registration.utils.test.ts` | split tests (Task 3) |
| `apps/web/src/test/fixtures/beneficiary-{form,detail}-fixtures.ts` | shared test fixtures (new, Task 3) |
| `media/components/{add-media-dialog,media-viewer,media-kpi}.tsx`, `media/media.utils.ts` | split media proof (Task 4) |
| `directory/hooks/use-beneficiary-columns.tsx`, `directory/components/filter-select.tsx` | split directory (Task 4) |
| `docs/cr-pathways-codebase-modularization.md`, `docs/audit-pathways-codebase-modularity-20261009.md`, `docs/index.md`, `docs/activity-log.md` | S4c disposition (Task 5) |

---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s4c-beneficiaries-components.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/s4c/base-sha`, `build-routes.sh`, `compare-routes.mjs`, `replace-exact.mjs`, `count-it.mjs`, `trim-imports.mjs`, `same-lines.mjs`, `cut.mjs`, `split-module.mjs`

- [ ] **Step 1: Confirm the stacked branch holds S4b**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
test -f apps/web/src/lib/api/beneficiaries.ts && test -f apps/web/src/lib/api/journeys.ts && test -f apps/web/src/lib/api/beneficiary-media.ts && echo "S4b clients present"
test -f packages/shared/src/contracts/beneficiaries/beneficiary-responses.ts && echo "S4b contracts present"
test -f apps/web/src/features/beneficiaries/index.ts && echo "S4b index present"
ls apps/web/src/features/beneficiaries
test ! -d apps/web/src/features/journey-config && echo "journey-config merged"
grep -c "'beneficiaries'" apps/web/src/import-direction.test.ts
grep -c "@/features/beneficiaries" apps/web/next.config.ts
grep -c "^S4b applied" docs/cr-pathways-codebase-modularization.md
ls docs/superpowers/plans/ | grep -E "modularization-s4(b)?-"
test -f docs/handoff/modularization-s4c-beneficiaries-components.md && echo "handoff copy present"
mkdir -p .tmp/s4c/before .tmp/s4c/files
git rev-parse HEAD > .tmp/s4c/base-sha
```

Expected: `git status --short` prints nothing, the branch is the slice branch, then the S4b marker lines, the six concern folders and `index.ts`, the three counts and the S4 plan listing:

```
claude/modularization-s4c-9ept8o
S4b clients present
S4b contracts present
S4b index present
beneficiaries.utils.test.ts
beneficiaries.utils.ts
directory
identity-review
index.ts
journey
media
profile
registration
journey-config merged
1
1
1
2026-10-13-modularization-s4-beneficiaries.md
2026-10-13-modularization-s4b-beneficiaries-web.md
handoff copy present
```

A missing marker line means the branch lacks the stacked S4b slice: stop and report NEEDS_CONTEXT. The plan listing shows the S4 and S4b plan copies, and both stay: the controller removes plan copies only after the final merge. `.tmp/s4c/base-sha` is the head the branch has when Task 0 starts (the S4b tip, or the S4b tip plus the controller commit that stages this plan in `docs/handoff`), the base of every later comparison.

- [ ] **Step 2: Create the tool scripts**

Create each file with the Write tool exactly as printed. `.tmp/s4c/build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s4c/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s4c/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s4c/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s4c/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s4c/routes-$1.txt
grep Middleware .tmp/s4c/routes-$1.txt
```

`.tmp/s4c/compare-routes.mjs` prints the routes whose First Load JS differs between two saved route tables:

Create `.tmp/s4c/compare-routes.mjs`:

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

`.tmp/s4c/replace-exact.mjs` applies exact text replacements and fails unless each matches the expected number of times:

Create `.tmp/s4c/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s4c/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`.tmp/s4c/count-it.mjs` counts `it`, `describe` and `expect(` per test file, so a test split can show that no row or assertion was lost:

Create `.tmp/s4c/count-it.mjs`:

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

`.tmp/s4c/trim-imports.mjs` drops the imports a cut file no longer uses (comments and quoted strings do not count as uses):

Create `.tmp/s4c/trim-imports.mjs`:

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

`.tmp/s4c/same-lines.mjs` fails when a line of the original is missing from the new files and lists the lines the split added; an `--also` file is part of the original (a module that already existed and received lines), and a `New=Old` argument undoes a rename:

Create `.tmp/s4c/same-lines.mjs`:

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

`.tmp/s4c/cut.mjs` builds files from hash-pinned line ranges of one source file:

Create `.tmp/s4c/cut.mjs`:

```js
// Builds files from verbatim line ranges of one source file, failing when the source hash differs from the one the plan was written for.
// Usage: node .tmp/s4c/cut.mjs <cut-plan.json>; the plan is { source, hash, files: { path: [item, ...] } } and the source may be one of the files.
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

`.tmp/s4c/split-module.mjs` is the S3b declaration-level splitter, used in Task 4 for the media proof:

Create `.tmp/s4c/split-module.mjs`:

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

- [ ] **Step 3: Record the baseline**

```bash
chmod +x .tmp/s4c/build-routes.sh
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s4c/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
```

Expected: the figures of the dry run on the S4b tip. Write them down as the baselines; every later Expected is a delta from them. Typecheck prints `Done` for config, shared, imports, api and web. The package test counts depend on which slices sit below S4b on the branch (S5a, S6a and the three S4b tests-only commits sit below S4c, so the shared, imports, api and sad figures are higher than the S4b plan's 323, 91, 2484 and 55): whatever Task 0 prints is `B_shared`, `B_imports`, `B_api`, `B_config`, `B_sad`, and S4c changes none of them. `B_web` is 227 files and 2015 tests on the S4b tip (the S4b plan's 2013 plus the two cases of the tests-only commit `25b58725`). The summaries of the replay on the S4b tip `7442e2fe` are:

```
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  35 passed (35)
packages/shared test:       Tests  665 passed (665)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  152 passed | 10 skipped (162)
apps/api test:       Tests  2610 passed | 21 skipped (2631)
apps/web test:  Test Files  227 passed (227)
apps/web test:       Tests  2015 passed (2015)
      Tests  57 passed (57)
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      103 kB
```

In order: config, shared, imports, api, web, then the `sad:test` line (`B_sad`), then the `docs:check` summary, whose 6 failures and 1 warning are the baseline and stay until the end (`[ELIFECYCLE]` is `pnpm` reporting the failing check), then the `build-routes.sh` result: `exit 0` and the Middleware row, whose size is `M0`. pnpm may echo `$ tsc ...` lines between them. `.tmp/s4c/routes-baseline.txt` is the route baseline `R0`.

```bash
R=apps/web/src/features/beneficiaries
wc -l $R/registration/components/beneficiary-form.tsx $R/profile/components/beneficiary-detail.tsx $R/media/components/beneficiary-media-proof.tsx $R/directory/components/beneficiary-directory.tsx $R/registration/components/beneficiary-form.test.tsx $R/profile/components/beneficiary-detail.test.tsx $R/registration/registration.utils.ts $R/registration/registration.utils.test.ts $R/media/media.utils.ts
node .tmp/s4c/count-it.mjs $R/registration/components/beneficiary-form.test.tsx $R/registration/registration.utils.test.ts $R/profile/components/beneficiary-detail.test.tsx
git ls-files $R | wc -l
git ls-files apps/web/src/test/fixtures | wc -l
git grep -n "ScopedBeneficiaryForm" -- apps packages | cut -c1-120
git grep -nE "from '\.[a-z/.-]*/(beneficiary-form|beneficiary-detail|beneficiary-media-proof|beneficiary-directory)'" -- apps/web/src | wc -l
git grep -nE "vi.mock\('[^']*(beneficiary-form|beneficiary-detail|beneficiary-media-proof|beneficiary-directory)'" -- apps/web/src | wc -l
git grep -n "'5-9'" -- $R | cut -c1-110
git hash-object $R/registration/components/beneficiary-form.tsx $R/profile/components/beneficiary-detail.tsx $R/media/components/beneficiary-media-proof.tsx $R/directory/components/beneficiary-directory.tsx $R/registration/components/beneficiary-form.test.tsx $R/profile/components/beneficiary-detail.test.tsx $R/registration/registration.utils.ts $R/registration/registration.utils.test.ts $R/media/media.utils.ts | cut -c1-8
```

Expected: the counts and hashes the plan rests on (a different number or hash means a file changed since planning: stop and report NEEDS_CONTEXT):

```
  1391 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx
  1173 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx
   668 apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx
   565 apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx
   870 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx
   636 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx
    82 apps/web/src/features/beneficiaries/registration/registration.utils.ts
    71 apps/web/src/features/beneficiaries/registration/registration.utils.test.ts
     7 apps/web/src/features/beneficiaries/media/media.utils.ts
  5463 total
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx: it 28, describe 1, expect 117
apps/web/src/features/beneficiaries/registration/registration.utils.test.ts: it 5, describe 1, expect 5
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx: it 17, describe 4, expect 55
total: it 50, describe 6, expect 177
34
6
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx:261:    <ScopedBeneficiaryForm
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx:270:const ScopedBeneficiaryForm = ({
8
3
apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx:103:    safeFilterValue(rea
f3c8afe2
f781fb33
0c1281fc
2fc7ff2c
5b800ce4
1e97bcd3
9be4c47e
ae48c87b
f4998255
```

In order: the nine line counts (the four components, the two tests, `registration.utils.ts` and its test, `media.utils.ts`; the form test is 870 lines until Task 1 repoints its import); the rows, `describe` blocks and assertions of the two tests and the pure-helper test (50 rows, 6 groups, 177 assertions); 34 files in `features/beneficiaries`; 6 fixture modules before; the single `ScopedBeneficiaryForm` mention is the component's own definition and use (two lines); 8 imports and 3 `vi.mock` lines name the four components, and none of them changes in S4c because the module paths and export names stay; the `'5-9'` line stays (MOD-B1); the nine hash prefixes.

Write down `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s4c-beneficiaries-components.md docs/superpowers/plans/$(date +%F)-modularization-s4c-beneficiaries-components.md`. The handoff copy and its index row stay. No plan copy is removed here or anywhere in this slice: the S4 and S4b copies in `docs/superpowers/plans` and their index rows stay, and the controller removes executed copies only after the final merge.

In `docs/index.md` section 1.6, the S4c row is added after the S4b row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s4c-beneficiaries-components.md docs/superpowers/plans/$D-modularization-s4c-beneficiaries-components.md
sed -i "/(superpowers\/plans\/[^)]*modularization-s4b-beneficiaries-web\.md)/a | [S4c beneficiaries components plan](superpowers/plans/$D-modularization-s4c-beneficiaries-components.md) | $D-modularization-s4c-beneficiaries-components.md | $D | S4c of the codebase modularization: beneficiary form, detail, media proof and directory split into hooks and sections, two oversized tests split, ScopedBeneficiaryForm renamed | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
grep -c "modularization-s4b-beneficiaries-web" docs/index.md
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git commit -m "docs: add the S4c beneficiaries components plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: one row added, the S4b rows of both lists still in the index (`2`), the same 6 baseline docs failures and a commit of two files (`<n>` is the plan length plus the index row):

```
+| [S4c beneficiaries components plan](superpowers/plans/<date>-modularization-s4c-beneficiaries-components.md) | <date>-modularizat
2

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
[<branch> <sha>] docs: add the S4c beneficiaries components plan
 2 files changed, <n> insertions(+)
 create mode 100644 docs/superpowers/plans/<date>-modularization-s4c-beneficiaries-components.md
```

The row line is cut at 140 characters by the command, and `<n>` is the plan length plus the index row. The docs check still reports 6 failures and 1 warning; a seventh failure means the copied plan broke a docs rule (voice: no em dash, no double hyphen in prose).

---

### Task 1: Split the beneficiary form and rename `ScopedBeneficiaryForm`

**Files:**
- Create (gitignored): `.tmp/s4c/task1-cut.json`, `.tmp/s4c/task1-edits.json`
- Modify: `apps/web/src/features/beneficiaries/registration/registration.utils.ts`, `registration/components/beneficiary-form.tsx`, `registration/components/beneficiary-form.test.tsx` (one import)
- Create: `registration/hooks/use-registration-{context,draft,validation}.ts`; `registration/components/{beneficiary-registration-form,registration-definition-section,profile-fields,validation-summary,profile-preview,confirm-registration-dialog,form-field,toggle-field,preview-row}.tsx`

`beneficiary-form.tsx` holds, in order: the imports (1 to 52), twelve pure declarations (54 to 242), `BeneficiaryForm` (244 to 269), `ScopedBeneficiaryForm` (270 to 1289, about 1020 lines) and the helpers `Field`, `ToggleField` and `PreviewRow` (1291 to 1391). Inside `ScopedBeneficiaryForm` the state and effects come first (276 to 571), then the handlers and derived values (573 to 805) and the JSX (806 to 1289). The cut plan below assigns every range to one file:

| New file | Source lines | Content |
|---|---|---|
| `registration.utils.ts` (appended) | 54 to 242 | the twelve pure declarations, with `export` added to ten |
| `hooks/use-registration-context.ts` | 327 to 374 | the context state and its load effect; takes `beneficiary`, `selectedProjectId`, `scope`, `setConfirmOpen` |
| `hooks/use-registration-draft.ts` | 312 to 323, 376 to 429 | the draft state, hydrate effect and persist effect |
| `hooks/use-registration-validation.ts` | 431 to 571 | the supported-field helpers, ages, the minor rule, issues and field errors |
| `components/registration-definition-section.tsx` | 807 to 892 | the published form picker and custom fields |
| `components/profile-fields.tsx` | 894 to 1150 | the profile grid (16 props) |
| `components/validation-summary.tsx` | 1153 to 1178 | the error summary |
| `components/profile-preview.tsx` | 1202 to 1237 | the preview card |
| `components/confirm-registration-dialog.tsx` | 1240 to 1286 | the confirmation dialog |
| `components/{form-field,toggle-field,preview-row}.tsx` | 1291 to 1391 | `Field`, `ToggleField`, `PreviewRow` |
| `components/beneficiary-registration-form.tsx` | 271 to 311 (270 is the renamed signature line), 324 to 326, 573 to 805, 1151 to 1152, 1179 to 1200, 1287 to 1289 | the renamed component: props, the hook calls, handlers and the JSX that stays |
| `components/beneficiary-form.tsx` | 244 to 269 | the `BeneficiaryForm` wrapper |

- [ ] **Step 1: Create the cut plan and the one test edit**

Create each file with the Write tool exactly as printed. `.tmp/s4c/task1-cut.json` is the cut plan above in `cut.mjs` format (the literal lines are the hook signatures, the returned objects, the component signatures with their prop types and the `<ProfileFields ... />` style calls):

Create `.tmp/s4c/task1-cut.json`:

```json
{
 "source": "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx",
 "hash": "f3c8afe2",
 "files": {
  "apps/web/src/features/beneficiaries/registration/registration.utils.ts": [
   "import {",
   "  beneficiaryAgeRuleMessages,",
   "  beneficiaryRegistrationFieldRules,",
   "  completedYearsAt,",
   "  minimumBeneficiaryAge,",
   "} from '@pathways/shared'",
   "",
   "import type {",
   "  BeneficiaryRecord,",
   "  DigitalFormFieldDefinition,",
   "  ProjectSummary,",
   "} from '@/types/pathways'",
   "",
   {
    "file": "apps/web/src/features/beneficiaries/registration/registration.utils.ts",
    "from": 3
   },
   "",
   [
    54,
    242
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/hooks/use-registration-context.ts": [
   "@imports",
   "",
   "export const useRegistrationContext = ({",
   "  beneficiary,",
   "  selectedProjectId,",
   "  scope,",
   "  setConfirmOpen,",
   "}: {",
   "  beneficiary?: BeneficiaryRecord",
   "  selectedProjectId: string",
   "  scope: SensitiveDraftOwner",
   "  setConfirmOpen: (open: boolean) => void",
   "}) => {",
   [
    327,
    366
   ],
   "  }, [beneficiary, selectedProjectId, contextAttempt, scope.isCurrent, setConfirmOpen])",
   [
    368,
    374
   ],
   "  return {",
   "    registrationContext,",
   "    contextState,",
   "    setContextAttempt,",
   "    selectedFormId,",
   "    setSelectedFormId,",
   "    customValues,",
   "    setCustomValues,",
   "    definitionErrors,",
   "    setDefinitionErrors,",
   "    registrationForm,",
   "    customFields,",
   "  }",
   "}"
  ],
  "apps/web/src/features/beneficiaries/registration/hooks/use-registration-draft.ts": [
   "@imports",
   "import { type BeneficiaryDraft, draftFromBeneficiary, initialDraft } from '../registration.utils'",
   "",
   "export const useRegistrationDraft = ({",
   "  beneficiary,",
   "  projects,",
   "  selectedProjectId,",
   "  scope,",
   "}: {",
   "  beneficiary?: BeneficiaryRecord",
   "  projects: ProjectSummary[]",
   "  selectedProjectId: string",
   "  scope: SensitiveDraftOwner",
   "}) => {",
   [
    312,
    323
   ],
   "",
   [
    376,
    429
   ],
   "",
   "  return { draft, setDraft, draftRecovered, submitted, setSubmitted, draftStorageKey }",
   "}"
  ],
  "apps/web/src/features/beneficiaries/registration/hooks/use-registration-validation.ts": [
   "@imports",
   "import {",
   "  type BeneficiaryDraft,",
   "  type BeneficiaryFieldKey,",
   "  type ValidationIssue,",
   "  registrationAgeAtDate,",
   "} from '../registration.utils'",
   "",
   "export const useRegistrationValidation = ({",
   "  beneficiary,",
   "  draft,",
   "  registrationForm,",
   "  registrationContext,",
   "}: {",
   "  beneficiary?: BeneficiaryRecord",
   "  draft: BeneficiaryDraft",
   "  registrationForm?: BeneficiaryRegistrationContext['definitions'][number]",
   "  registrationContext: BeneficiaryRegistrationContext | null",
   "}) => {",
   [
    431,
    571
   ],
   "",
   "  return {",
   "    supportsCode,",
   "    supportsProfileField,",
   "    maxBirthDate,",
   "    registrationAge,",
   "    ageFromBirthDate,",
   "    submittedAge,",
   "    ageRuleMessage,",
   "    ageRuleField,",
   "    registrationIsMinor,",
   "    showsGuardianConsent,",
   "    validationIssues,",
   "    fieldErrors,",
   "  }",
   "}"
  ],
  "apps/web/src/features/beneficiaries/registration/components/registration-definition-section.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { useRegistrationContext } from '../hooks/use-registration-context'",
   "",
   "type Context = ReturnType<typeof useRegistrationContext>",
   "",
   "export const RegistrationDefinitionSection = ({",
   "  contextState,",
   "  setContextAttempt,",
   "  registrationContext,",
   "  selectedFormId,",
   "  setSelectedFormId,",
   "  setCustomValues,",
   "  setDefinitionErrors,",
   "  registrationForm,",
   "  customFields,",
   "  customValues,",
   "  definitionErrors,",
   "  saving,",
   "  setConfirmOpen,",
   "  individualSupportIssue,",
   "}: Pick<",
   "  Context,",
   "  | 'contextState'",
   "  | 'setContextAttempt'",
   "  | 'registrationContext'",
   "  | 'selectedFormId'",
   "  | 'setSelectedFormId'",
   "  | 'setCustomValues'",
   "  | 'setDefinitionErrors'",
   "  | 'registrationForm'",
   "  | 'customFields'",
   "  | 'customValues'",
   "  | 'definitionErrors'",
   "> & {",
   "  saving: boolean",
   "  setConfirmOpen: (open: boolean) => void",
   "  individualSupportIssue: string | null",
   "}) => (",
   [
    807,
    892
   ],
   ")"
  ],
  "apps/web/src/features/beneficiaries/registration/components/profile-fields.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { useRegistrationValidation } from '../hooks/use-registration-validation'",
   "import { type BeneficiaryDraft, type BeneficiaryFieldKey, fieldIds } from '../registration.utils'",
   "import { Field } from './form-field'",
   "import { ToggleField } from './toggle-field'",
   "",
   "type Validation = ReturnType<typeof useRegistrationValidation>",
   "",
   "export const ProfileFields = ({",
   "  beneficiary,",
   "  projects,",
   "  draft,",
   "  submitted,",
   "  fieldErrors,",
   "  supportsProfileField,",
   "  supportsCode,",
   "  controlA11y,",
   "  updateDraft,",
   "  visibleError,",
   "  onProjectChange,",
   "  maxBirthDate,",
   "  ageFromBirthDate,",
   "  registrationAge,",
   "  ageRuleMessage,",
   "  showsGuardianConsent,",
   "}: Pick<",
   "  Validation,",
   "  | 'fieldErrors'",
   "  | 'supportsProfileField'",
   "  | 'supportsCode'",
   "  | 'maxBirthDate'",
   "  | 'ageFromBirthDate'",
   "  | 'registrationAge'",
   "  | 'ageRuleMessage'",
   "  | 'showsGuardianConsent'",
   "> & {",
   "  beneficiary?: BeneficiaryRecord",
   "  projects: ProjectSummary[]",
   "  draft: BeneficiaryDraft",
   "  submitted: boolean",
   "  controlA11y: (field: BeneficiaryFieldKey) => {",
   "    'aria-describedby': string | undefined",
   "    'aria-invalid': boolean",
   "    id: string",
   "  }",
   "  updateDraft: <Key extends keyof BeneficiaryDraft>(key: Key, value: BeneficiaryDraft[Key]) => void",
   "  visibleError: (field: BeneficiaryFieldKey) => string | undefined",
   "  onProjectChange: (projectId: string) => void",
   "}) => (",
   "  <>",
   [
    894,
    1150
   ],
   "  </>",
   ")"
  ],
  "apps/web/src/features/beneficiaries/registration/components/validation-summary.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { type ValidationIssue, fieldIds } from '../registration.utils'",
   "",
   "export const ValidationSummary = ({",
   "  displayedValidationIssues,",
   "}: {",
   "  displayedValidationIssues: ValidationIssue[]",
   "}) => (",
   [
    1153,
    1178
   ],
   ")"
  ],
  "apps/web/src/features/beneficiaries/registration/components/profile-preview.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDraft } from '../registration.utils'",
   "import { PreviewRow } from './preview-row'",
   "",
   "export const ProfilePreview = ({",
   "  draft,",
   "  projects,",
   "  supportsCode,",
   "}: {",
   "  draft: BeneficiaryDraft",
   "  projects: ProjectSummary[]",
   "  supportsCode: (code: string) => boolean",
   "}) => (",
   [
    1202,
    1237
   ],
   ")"
  ],
  "apps/web/src/features/beneficiaries/registration/components/confirm-registration-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDraft } from '../registration.utils'",
   "",
   "export const ConfirmRegistrationDialog = ({",
   "  confirmOpen,",
   "  setConfirmOpen,",
   "  beneficiary,",
   "  draft,",
   "  supportsCode,",
   "  saving,",
   "  pendingCreate,",
   "  confirmSave,",
   "}: {",
   "  confirmOpen: boolean",
   "  setConfirmOpen: (open: boolean) => void",
   "  beneficiary?: BeneficiaryRecord",
   "  draft: BeneficiaryDraft",
   "  supportsCode: (code: string) => boolean",
   "  saving: boolean",
   "  pendingCreate: { confirming: boolean }",
   "  confirmSave: () => Promise<void>",
   "}) => (",
   [
    1240,
    1286
   ],
   ")"
  ],
  "apps/web/src/features/beneficiaries/registration/components/form-field.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1291,
    1328
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/components/toggle-field.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1330,
    1384
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/components/preview-row.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1386,
    1391
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-registration-form.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useRegistrationContext } from '../hooks/use-registration-context'",
   "import { useRegistrationDraft } from '../hooks/use-registration-draft'",
   "import { useRegistrationValidation } from '../hooks/use-registration-validation'",
   "import {",
   "  beneficiaryDisabilityValue,",
   "  beneficiarySexValue,",
   "  fieldIds,",
   "  projectRegistrationValues,",
   "  type BeneficiaryDraft,",
   "  type BeneficiaryFieldKey,",
   "} from '../registration.utils'",
   "import { ConfirmRegistrationDialog } from './confirm-registration-dialog'",
   "import { ProfileFields } from './profile-fields'",
   "import { ProfilePreview } from './profile-preview'",
   "import { RegistrationDefinitionSection } from './registration-definition-section'",
   "import { ValidationSummary } from './validation-summary'",
   "",
   "export const BeneficiaryRegistrationForm = ({",
   [
    271,
    311
   ],
   [
    324,
    326
   ],
   "  const {",
   "    registrationContext,",
   "    contextState,",
   "    setContextAttempt,",
   "    selectedFormId,",
   "    setSelectedFormId,",
   "    customValues,",
   "    setCustomValues,",
   "    definitionErrors,",
   "    setDefinitionErrors,",
   "    registrationForm,",
   "    customFields,",
   "  } = useRegistrationContext({ beneficiary, selectedProjectId, scope, setConfirmOpen })",
   "  const { draft, setDraft, draftRecovered, submitted, setSubmitted, draftStorageKey } =",
   "    useRegistrationDraft({ beneficiary, projects, selectedProjectId, scope })",
   "  const {",
   "    supportsCode,",
   "    supportsProfileField,",
   "    maxBirthDate,",
   "    registrationAge,",
   "    ageFromBirthDate,",
   "    submittedAge,",
   "    ageRuleMessage,",
   "    ageRuleField,",
   "    registrationIsMinor,",
   "    showsGuardianConsent,",
   "    validationIssues,",
   "    fieldErrors,",
   "  } = useRegistrationValidation({ beneficiary, draft, registrationForm, registrationContext })",
   "",
   [
    573,
    760
   ],
   "",
   [
    761,
    805
   ],
   [
    806,
    806
   ],
   "            <RegistrationDefinitionSection",
   "              contextState={contextState}",
   "              setContextAttempt={setContextAttempt}",
   "              registrationContext={registrationContext}",
   "              selectedFormId={selectedFormId}",
   "              setSelectedFormId={setSelectedFormId}",
   "              setCustomValues={setCustomValues}",
   "              setDefinitionErrors={setDefinitionErrors}",
   "              registrationForm={registrationForm}",
   "              customFields={customFields}",
   "              customValues={customValues}",
   "              definitionErrors={definitionErrors}",
   "              saving={saving}",
   "              setConfirmOpen={setConfirmOpen}",
   "              individualSupportIssue={individualSupportIssue}",
   "            />",
   [
    893,
    893
   ],
   "          <ProfileFields",
   "            beneficiary={beneficiary}",
   "            projects={projects}",
   "            draft={draft}",
   "            submitted={submitted}",
   "            fieldErrors={fieldErrors}",
   "            supportsProfileField={supportsProfileField}",
   "            supportsCode={supportsCode}",
   "            controlA11y={controlA11y}",
   "            updateDraft={updateDraft}",
   "            visibleError={visibleError}",
   "            onProjectChange={onProjectChange}",
   "            maxBirthDate={maxBirthDate}",
   "            ageFromBirthDate={ageFromBirthDate}",
   "            registrationAge={registrationAge}",
   "            ageRuleMessage={ageRuleMessage}",
   "            showsGuardianConsent={showsGuardianConsent}",
   "          />",
   [
    1151,
    1152
   ],
   "            <ValidationSummary displayedValidationIssues={displayedValidationIssues} />",
   [
    1179,
    1200
   ],
   "",
   "        <ProfilePreview draft={draft} projects={projects} supportsCode={supportsCode} />",
   "      </div>",
   "",
   "      <ConfirmRegistrationDialog",
   "        confirmOpen={confirmOpen}",
   "        setConfirmOpen={setConfirmOpen}",
   "        beneficiary={beneficiary}",
   "        draft={draft}",
   "        supportsCode={supportsCode}",
   "        saving={saving}",
   "        pendingCreate={pendingCreate}",
   "        confirmSave={confirmSave}",
   "      />",
   [
    1287,
    1289
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { draftFromBeneficiary } from '../registration.utils'",
   "import { BeneficiaryRegistrationForm } from './beneficiary-registration-form'",
   "",
   [
    244,
    269
   ]
  ]
 }
}
```

`.tmp/s4c/task1-edits.json` repoints the form test's import of two pure helpers from the component to `registration.utils` (ruling 5):

Create `.tmp/s4c/task1-edits.json`:

```json
[
  [
    "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx",
    "import {\n  BeneficiaryForm,\n  projectRegistrationValues,\n  registrationAgeAtDate,\n} from './beneficiary-form'\n",
    "import { projectRegistrationValues, registrationAgeAtDate } from '../registration.utils'\nimport { BeneficiaryForm } from './beneficiary-form'\n",
    1
  ]
]
```

- [ ] **Step 2: Cut, export, rename and prove**

```bash
R=apps/web/src/features/beneficiaries/registration
C=$R/components
H=$R/hooks
cp $C/beneficiary-form.tsx .tmp/s4c/before/beneficiary-form.tsx
cp $R/registration.utils.ts .tmp/s4c/before/registration.utils.ts
node .tmp/s4c/cut.mjs .tmp/s4c/task1-cut.json
sed -i -e 's/^type BeneficiaryDraft = /export type BeneficiaryDraft = /' -e 's/^const initialDraft: /export const initialDraft: /' -e 's/^const beneficiarySexValue = /export const beneficiarySexValue = /' -e 's/^const beneficiaryDisabilityValue = /export const beneficiaryDisabilityValue = /' -e 's/^const draftFromBeneficiary = /export const draftFromBeneficiary = /' -e 's/^type BeneficiaryFieldKey =/export type BeneficiaryFieldKey =/' -e 's/^type ValidationIssue = /export type ValidationIssue = /' -e 's/^const fieldIds: /export const fieldIds: /' $R/registration.utils.ts
sed -i 's/^const Field = /export const Field = /' $C/form-field.tsx
sed -i 's/^const ToggleField = /export const ToggleField = /' $C/toggle-field.tsx
sed -i 's/^const PreviewRow = /export const PreviewRow = /' $C/preview-row.tsx
sed -i 's/<ScopedBeneficiaryForm/<BeneficiaryRegistrationForm/' $C/beneficiary-form.tsx
grep -c "^export " $R/registration.utils.ts
NEW="$R/registration.utils.ts $H/use-registration-context.ts $H/use-registration-draft.ts $H/use-registration-validation.ts $C/registration-definition-section.tsx $C/profile-fields.tsx $C/validation-summary.tsx $C/profile-preview.tsx $C/confirm-registration-dialog.tsx $C/form-field.tsx $C/toggle-field.tsx $C/preview-row.tsx $C/beneficiary-registration-form.tsx $C/beneficiary-form.tsx"
node .tmp/s4c/trim-imports.mjs $NEW > .tmp/s4c/trim1.out
wc -l < .tmp/s4c/trim1.out
node .tmp/s4c/same-lines.mjs .tmp/s4c/before/beneficiary-form.tsx --also .tmp/s4c/before/registration.utils.ts $NEW BeneficiaryRegistrationForm=ScopedBeneficiaryForm "scope.isCurrent, setConfirmOpen])=scope.isCurrent])" --list > .tmp/s4c/added1.txt
tail -1 .tmp/s4c/added1.txt
```

Expected: the cut prints one line count per file, counted before the import trim and Biome (so the wrapper is 81 lines and the registration form 456 here, and 36 and 420 in Step 3); the utils file has 14 exports (4 before, 10 moved); the import trim reported on all 14 files; and the proof finds no lost line:

```
apps/web/src/features/beneficiaries/registration/registration.utils.ts: 283 lines
apps/web/src/features/beneficiaries/registration/hooks/use-registration-context.ts: 124 lines
apps/web/src/features/beneficiaries/registration/hooks/use-registration-draft.ts: 133 lines
apps/web/src/features/beneficiaries/registration/hooks/use-registration-validation.ts: 225 lines
apps/web/src/features/beneficiaries/registration/components/registration-definition-section.tsx: 176 lines
apps/web/src/features/beneficiaries/registration/components/profile-fields.tsx: 360 lines
apps/web/src/features/beneficiaries/registration/components/validation-summary.tsx: 86 lines
apps/web/src/features/beneficiaries/registration/components/profile-preview.tsx: 101 lines
apps/web/src/features/beneficiaries/registration/components/confirm-registration-dialog.tsx: 121 lines
apps/web/src/features/beneficiaries/registration/components/form-field.tsx: 91 lines
apps/web/src/features/beneficiaries/registration/components/toggle-field.tsx: 108 lines
apps/web/src/features/beneficiaries/registration/components/preview-row.tsx: 59 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-registration-form.tsx: 456 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx: 81 lines
14
14
original lines 1365, lost 0, added 255
```

`same-lines` rebuilds the original from the old form plus the old `registration.utils.ts` (`--also`), undoes the rename and the one dependency entry (ruling 2), and prints `lost 0`: every line of the old component is in a new file. `.tmp/s4c/added1.txt` lists the 255 added lines (signatures, prop types, destructurings, hook calls and returns, `<Section ... />` calls with their props); read it once, it is the whole review surface of this task apart from the hooks' dependency entry.

- [ ] **Step 3: Repoint the test, format and check**

```bash
R=apps/web/src/features/beneficiaries/registration
node .tmp/s4c/replace-exact.mjs .tmp/s4c/task1-edits.json
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
wc -l $R/registration.utils.ts $R/hooks/*.ts $R/components/*.tsx | grep -v test
git grep -c "ScopedBeneficiaryForm" -- apps packages | wc -l
```

Expected: one replacement, Biome checks 15 files and fixes 11 of them (line wrapping and import order of the new files), the web typecheck is clean, the unused-locals check lists only the two baseline lines, lint is clean, and the new sizes are:

```
1 replacements in 1 files
Checked 15 files in <ms>. Fixed 11 files.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1347 files in <ms>. No fixes applied.
   283 apps/web/src/features/beneficiaries/registration/registration.utils.ts
    83 apps/web/src/features/beneficiaries/registration/hooks/use-registration-context.ts
    92 apps/web/src/features/beneficiaries/registration/hooks/use-registration-draft.ts
   179 apps/web/src/features/beneficiaries/registration/hooks/use-registration-validation.ts
   152 apps/web/src/features/beneficiaries/registration/components/beneficiary-form-loader.tsx
    36 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.tsx
   420 apps/web/src/features/beneficiaries/registration/components/beneficiary-registration-form.tsx
    81 apps/web/src/features/beneficiaries/registration/components/confirm-registration-dialog.tsx
    42 apps/web/src/features/beneficiaries/registration/components/form-field.tsx
     8 apps/web/src/features/beneficiaries/registration/components/preview-row.tsx
   321 apps/web/src/features/beneficiaries/registration/components/profile-fields.tsx
    50 apps/web/src/features/beneficiaries/registration/components/profile-preview.tsx
   134 apps/web/src/features/beneficiaries/registration/components/registration-definition-section.tsx
    59 apps/web/src/features/beneficiaries/registration/components/toggle-field.tsx
    36 apps/web/src/features/beneficiaries/registration/components/validation-summary.tsx
  2955 total
0
```

No file is over 500 lines; `profile-fields.tsx` (321) is the largest section (ruling 6). `ScopedBeneficiaryForm` appears in no file.

- [ ] **Step 4: Run the registration tests and mutate the hooks**

The registration tests are the characterization (ruling 9): 37 tests over the registration folder. Each mutation changes one moved line, runs the folder and puts the hook back from a copy:

```bash
R=apps/web/src/features/beneficiaries/registration
run() { (cd apps/web && timeout 300 pnpm exec vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/features/beneficiaries/[a-z-]+/(components/)?##'); }
echo "unmutated"; run src/features/beneficiaries/registration
cp $R/hooks/use-registration-draft.ts .tmp/s4c/files/draft.bak
cp $R/hooks/use-registration-context.ts .tmp/s4c/files/context.bak
cp $R/hooks/use-registration-validation.ts .tmp/s4c/files/validation.bak
sed -i 's/writeSensitiveDraft(draftStorageKey, draft, scope.generation)/void draft/' $R/hooks/use-registration-draft.ts
echo "draft write removed"; run src/features/beneficiaries/registration
cp .tmp/s4c/files/draft.bak $R/hooks/use-registration-draft.ts
sed -i 's/context.definitions.length === 0 \&\& active/false \&\& active/' $R/hooks/use-registration-context.ts
echo "default form provisioning disabled"; run src/features/beneficiaries/registration
cp .tmp/s4c/files/context.bak $R/hooks/use-registration-context.ts
sed -i 's/draft.isMinor : registrationIsMinor === true/draft.isMinor : false/' $R/hooks/use-registration-validation.ts
echo "guardian consent hidden for minors"; run src/features/beneficiaries/registration
cp .tmp/s4c/files/validation.bak $R/hooks/use-registration-validation.ts
sed -i '/if (parsed.projectId !== selectedProjectId) return/d' $R/hooks/use-registration-draft.ts
echo "project check of the stored draft removed (ruling 9)"; run src/features/beneficiaries/registration
cp .tmp/s4c/files/draft.bak $R/hooks/use-registration-draft.ts
sed -i 's/registrationAge < 18/registrationAge < 17/' $R/hooks/use-registration-validation.ts
echo "minor boundary moved to 17 (ruling 9)"; run src/features/beneficiaries/registration
cp .tmp/s4c/files/validation.bak $R/hooks/use-registration-validation.ts
for name in draft context validation; do cmp .tmp/s4c/files/$name.bak $R/hooks/use-registration-$name.ts && echo "$name hook restored"; done
```

Expected: the unmutated run passes 37 tests in 3 files (the form test, the loader test and the utils test; the form test is split only in Task 3); the first three mutations fail 1, 3 and 1 test rows, the last two pass all 37, and the three hooks are restored byte for byte:

```
unmutated
      Tests  37 passed (37)
 Test Files  3 passed (3)
draft write removed
      Tests  1 failed | 36 passed (37)
beneficiary-form.test.tsx > BeneficiaryForm > recovers unsaved entries after the editor is remounted
 Test Files  1 failed | 2 passed (3)
default form provisioning disabled
      Tests  3 failed | 34 passed (37)
beneficiary-form.test.tsx > BeneficiaryForm > keeps a project with no published form unavailable without retrying or submitting
beneficiary-form.test.tsx > BeneficiaryForm > keeps a provisioning failure distinct from empty data and retries exactly once per request
beneficiary-form.test.tsx > BeneficiaryForm > provisions the default form once when no published form exists and registers through it
 Test Files  1 failed | 2 passed (3)
guardian consent hidden for minors
      Tests  1 failed | 36 passed (37)
beneficiary-form.test.tsx > BeneficiaryForm > derives minor status from the birth date and shows guardian consent only for minors
 Test Files  1 failed | 2 passed (3)
project check of the stored draft removed (ruling 9)
      Tests  37 passed (37)
 Test Files  3 passed (3)
minor boundary moved to 17 (ruling 9)
      Tests  37 passed (37)
 Test Files  3 passed (3)
draft hook restored
context hook restored
validation hook restored
```

The last two mutations are the two guards of ruling 9 that no test pins (the stored draft of another project, the minor boundary at 18): the suite stays green on both, as it did before the split, so they stay unpinned and only the cut proof covers them.

- [ ] **Step 5: Web suite and commit**

```bash
(cd apps/web && timeout 600 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
git add apps/web/src
git commit -q -m "refactor(web): split the beneficiary registration form into hooks and sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```

Expected: web is `B_web` unchanged (227 files, 2015 tests), and the commit holds 12 new files and 3 changed ones (the wrapper, `registration.utils.ts` and the form test):

```
 Test Files  227 passed (227)
      Tests  2015 passed (2015)
 15 files changed, 1715 insertions(+), 1367 deletions(-)
```

A failure of `beneficiary-detail-loader.test.tsx` is the known flake: rerun it alone.

---

### Task 2: Split the beneficiary detail

**Files:**
- Create (gitignored): `.tmp/s4c/task2-cut.json`
- Modify: `apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx`
- Create: `profile/hooks/use-beneficiary-detail.ts`, `profile/hooks/use-beneficiary-detail-view.ts`; `profile/components/{detail-header,profile-summary-dialog,journey-tab,assessment-dialog,participation-dialog,enrollment-status-dialog,journey-note-dialog,summary-row,record-list,stage-activity-list,journey-note-list}.tsx`

`beneficiary-detail.tsx` holds the imports (1 to 68), the enrollment status constants (70 to 75), the props type (77 to 87), `BeneficiaryDetail` (89 to 1035, about 950 lines) and four helper components (1037 to 1173). Inside `BeneficiaryDetail` the props, role and state come first (90 to 157), then the derived values (158 to 254, all `useMemo` and plain expressions, no effect), the handlers (256 to 427) and the JSX (429 to 1033). The cut plan assigns every range to one file:

| New file | Source lines | Content |
|---|---|---|
| `hooks/use-beneficiary-detail-view.ts` | 99, 158 to 254 | derived values only: stage state, progress, assessments, notes, transfer options; takes nine values |
| `hooks/use-beneficiary-detail.ts` | 77, 80 to 87, 90 to 157, 256 to 427 | `BeneficiaryDetailProps`, role and permissions, state, the view hook call, the three handlers (`recordParticipation`, `transitionJourney`, `correctJourneyNote`); returns the state and `BeneficiaryDetailState` |
| `components/detail-header.tsx` | 431 to 497 | header card |
| `components/profile-summary-dialog.tsx` | 499 to 562 | profile summary dialog |
| `components/journey-tab.tsx` | 592 to 723 | stage tracker and stage panel (201 lines after formatting) |
| `components/assessment-dialog.tsx` | 747 to 775 | assessment scores |
| `components/participation-dialog.tsx` | 777 to 865 | record participation |
| `components/enrollment-status-dialog.tsx` | 70 to 75, 867 to 967 | enrollment status and its option constants |
| `components/journey-note-dialog.tsx` | 969 to 1032 | journey note |
| `components/{summary-row,record-list,stage-activity-list,journey-note-list}.tsx` | 1037 to 1173 | the four helper components |
| `components/beneficiary-detail.tsx` | 564 to 591, 724 to 745 | the 93 line screen: the hook call, the information tabs and the section tags |

Every section takes `{ detail }: { detail: Pick<BeneficiaryDetailState, ...> }` and destructures what it reads (ruling 3); a section that reads a value outside its `Pick` fails typecheck.

- [ ] **Step 1: Create the cut plan**

Create the file with the Write tool exactly as printed. `.tmp/s4c/task2-cut.json` is the cut plan above in `cut.mjs` format:

Create `.tmp/s4c/task2-cut.json`:

```json
{
 "source": "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx",
 "hash": "f781fb33",
 "files": {
  "apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail-view.ts": [
   "@imports",
   "",
   "export const useBeneficiaryDetailView = ({",
   "  beneficiary,",
   "  stages,",
   "  activities,",
   "  participation,",
   "  notes,",
   "  selectedStage,",
   "  participationForms,",
   "  projectId,",
   "  assessmentsUnavailable,",
   "}: {",
   "  beneficiary: BeneficiaryRecord",
   "  stages: JourneyStageConfig[]",
   "  activities: ActivitySummary[]",
   "  participation: BeneficiaryParticipationRecord[]",
   "  notes: BeneficiaryNoteRecord[]",
   "  selectedStage: JourneyStageConfig | null",
   "  participationForms: DigitalFormDefinition[]",
   "  projectId: string",
   "  assessmentsUnavailable: boolean",
   "}) => {",
   [
    99,
    99
   ],
   [
    158,
    254
   ],
   "",
   "  return {",
   "    currentStage,",
   "    progress,",
   "    stageState,",
   "    stageDisplayCode,",
   "    initials,",
   "    headerEnrollment,",
   "    latestEnrollment,",
   "    selectedStageActivities,",
   "    selectedStageParticipationActivities,",
   "    orderedAssessments,",
   "    assessmentChange,",
   "    assessmentStageLabel,",
   "    assessmentButtonTitle,",
   "    selectedStageNotes,",
   "    unlinkedNotes,",
   "    transferDestinationOptions,",
   "    correctableNote,",
   "    directoryHref,",
   "  }",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail.ts": [
   "@imports",
   "import { useBeneficiaryDetailView } from './use-beneficiary-detail-view'",
   "",
   [
    77,
    77
   ],
   "",
   "export type BeneficiaryDetailProps = {",
   [
    80,
    87
   ],
   "",
   "export const useBeneficiaryDetail = ({",
   [
    90,
    98
   ],
   [
    100,
    157
   ],
   "  const view = useBeneficiaryDetailView({",
   "    beneficiary,",
   "    stages,",
   "    activities,",
   "    participation,",
   "    notes,",
   "    selectedStage,",
   "    participationForms,",
   "    projectId,",
   "    assessmentsUnavailable,",
   "  })",
   "  const { selectedStageParticipationActivities, transferDestinationOptions, correctableNote } = view",
   "",
   [
    256,
    427
   ],
   "",
   "  return {",
   "    ...view,",
   "    beneficiary,",
   "    projects,",
   "    activities,",
   "    stages,",
   "    projectId,",
   "    participation,",
   "    enrollmentStatus,",
   "    canEditBeneficiary,",
   "    canViewMedia,",
   "    canUploadMedia,",
   "    canViewAssessmentDetail,",
   "    canTransitionJourney,",
   "    canCorrectJourney,",
   "    canRecordParticipation,",
   "    profileOpen,",
   "    setProfileOpen,",
   "    assessmentOpen,",
   "    setAssessmentOpen,",
   "    participationOpen,",
   "    setParticipationOpen,",
   "    participationDraft,",
   "    setParticipationDraft,",
   "    savingParticipation,",
   "    journeyOpen,",
   "    setJourneyOpen,",
   "    journeyDraft,",
   "    setJourneyDraft,",
   "    savingJourney,",
   "    noteOpen,",
   "    setNoteOpen,",
   "    noteDraft,",
   "    setNoteDraft,",
   "    savingNote,",
   "    selectedStage,",
   "    setSelectedStage,",
   "    openParticipationForSelectedStage,",
   "    openJourneyTransition,",
   "    openNoteForSelectedStage,",
   "    recordParticipation,",
   "    transitionJourney,",
   "    correctJourneyNote,",
   "  }",
   "}",
   "",
   "export type BeneficiaryDetailState = ReturnType<typeof useBeneficiaryDetail>"
  ],
  "apps/web/src/features/beneficiaries/profile/components/detail-header.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "",
   "export const DetailHeader = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'initials' | 'setProfileOpen' | 'beneficiary' | 'enrollmentStatus' | 'projectId' | 'projects' | 'headerEnrollment' | 'directoryHref' | 'canTransitionJourney' | 'openJourneyTransition'> }) => {",
   "  const { initials, setProfileOpen, beneficiary, enrollmentStatus, projectId, projects, headerEnrollment, directoryHref, canTransitionJourney, openJourneyTransition } = detail",
   "  return (",
   [
    431,
    497
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/profile-summary-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "import { SummaryRow } from './summary-row'",
   "",
   "export const ProfileSummaryDialog = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'profileOpen' | 'setProfileOpen' | 'canEditBeneficiary' | 'beneficiary' | 'projectId' | 'projects' | 'enrollmentStatus'> }) => {",
   "  const { profileOpen, setProfileOpen, canEditBeneficiary, beneficiary, projectId, projects, enrollmentStatus } = detail",
   "  return (",
   [
    499,
    562
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/journey-tab.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "import { JourneyNoteList } from './journey-note-list'",
   "import { StageActivityList } from './stage-activity-list'",
   "",
   "export const JourneyTab = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'progress' | 'currentStage' | 'stageDisplayCode' | 'setSelectedStage' | 'selectedStage' | 'stages' | 'stageState' | 'canRecordParticipation' | 'selectedStageParticipationActivities' | 'openParticipationForSelectedStage' | 'canViewAssessmentDetail' | 'beneficiary' | 'setAssessmentOpen' | 'assessmentButtonTitle' | 'canCorrectJourney' | 'correctableNote' | 'openNoteForSelectedStage' | 'selectedStageActivities' | 'participation' | 'selectedStageNotes' | 'latestEnrollment' | 'unlinkedNotes'> }) => {",
   "  const { progress, currentStage, stageDisplayCode, setSelectedStage, selectedStage, stages, stageState, canRecordParticipation, selectedStageParticipationActivities, openParticipationForSelectedStage, canViewAssessmentDetail, beneficiary, setAssessmentOpen, assessmentButtonTitle, canCorrectJourney, correctableNote, openNoteForSelectedStage, selectedStageActivities, participation, selectedStageNotes, latestEnrollment, unlinkedNotes } = detail",
   "  return (",
   [
    592,
    723
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/assessment-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "import { SummaryRow } from './summary-row'",
   "",
   "export const AssessmentDialog = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'assessmentOpen' | 'setAssessmentOpen' | 'orderedAssessments' | 'assessmentStageLabel' | 'assessmentChange'> }) => {",
   "  const { assessmentOpen, setAssessmentOpen, orderedAssessments, assessmentStageLabel, assessmentChange } = detail",
   "  return (",
   [
    747,
    775
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/participation-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "",
   "export const ParticipationDialog = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'participationOpen' | 'setParticipationOpen' | 'selectedStage' | 'stageDisplayCode' | 'participationDraft' | 'setParticipationDraft' | 'selectedStageParticipationActivities' | 'savingParticipation' | 'recordParticipation'> }) => {",
   "  const { participationOpen, setParticipationOpen, selectedStage, stageDisplayCode, participationDraft, setParticipationDraft, selectedStageParticipationActivities, savingParticipation, recordParticipation } = detail",
   "  return (",
   [
    777,
    865
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/enrollment-status-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "",
   [
    70,
    75
   ],
   "",
   "export const EnrollmentStatusDialog = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'journeyOpen' | 'setJourneyOpen' | 'beneficiary' | 'journeyDraft' | 'setJourneyDraft' | 'transferDestinationOptions' | 'projects' | 'savingJourney' | 'transitionJourney'> }) => {",
   "  const { journeyOpen, setJourneyOpen, beneficiary, journeyDraft, setJourneyDraft, transferDestinationOptions, projects, savingJourney, transitionJourney } = detail",
   "  return (",
   [
    867,
    967
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/journey-note-dialog.tsx": [
   "'use client'",
   "",
   "@imports",
   "import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'",
   "",
   "export const JourneyNoteDialog = ({ detail }: { detail: Pick<BeneficiaryDetailState, 'noteOpen' | 'setNoteOpen' | 'selectedStage' | 'stageDisplayCode' | 'noteDraft' | 'setNoteDraft' | 'savingNote' | 'correctJourneyNote'> }) => {",
   "  const { noteOpen, setNoteOpen, selectedStage, stageDisplayCode, noteDraft, setNoteDraft, savingNote, correctJourneyNote } = detail",
   "  return (",
   [
    969,
    1032
   ],
   "  )",
   "}"
  ],
  "apps/web/src/features/beneficiaries/profile/components/summary-row.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1037,
    1042
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/record-list.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1044,
    1095
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/stage-activity-list.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1097,
    1134
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/journey-note-list.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    1136,
    1173
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { type BeneficiaryDetailProps, useBeneficiaryDetail } from '../hooks/use-beneficiary-detail'",
   "import { AssessmentDialog } from './assessment-dialog'",
   "import { DetailHeader } from './detail-header'",
   "import { EnrollmentStatusDialog } from './enrollment-status-dialog'",
   "import { JourneyNoteDialog } from './journey-note-dialog'",
   "import { JourneyTab } from './journey-tab'",
   "import { ParticipationDialog } from './participation-dialog'",
   "import { ProfileSummaryDialog } from './profile-summary-dialog'",
   "import { RecordList } from './record-list'",
   "",
   "export const BeneficiaryDetail = (props: BeneficiaryDetailProps) => {",
   "  const detail = useBeneficiaryDetail(props)",
   "  const { beneficiary, projectId, activities, stages, participation, canViewMedia, canUploadMedia } = detail",
   "",
   "  return (",
   "    <div className=\"space-y-6\">",
   "      <DetailHeader detail={detail} />",
   "",
   "      <ProfileSummaryDialog detail={detail} />",
   "",
   [
    564,
    591
   ],
   "",
   "            <JourneyTab detail={detail} />",
   "",
   [
    724,
    745
   ],
   "",
   "      <AssessmentDialog detail={detail} />",
   "      <ParticipationDialog detail={detail} />",
   "      <EnrollmentStatusDialog detail={detail} />",
   "      <JourneyNoteDialog detail={detail} />",
   "    </div>",
   "  )",
   "}"
  ]
 }
}
```

- [ ] **Step 2: Cut, export and prove**

```bash
P=apps/web/src/features/beneficiaries/profile
C=$P/components
H=$P/hooks
cp $C/beneficiary-detail.tsx .tmp/s4c/before/beneficiary-detail.tsx
node .tmp/s4c/cut.mjs .tmp/s4c/task2-cut.json
sed -i 's/^const SummaryRow = /export const SummaryRow = /' $C/summary-row.tsx
sed -i 's/^const RecordList = /export const RecordList = /' $C/record-list.tsx
sed -i 's/^const StageActivityList = /export const StageActivityList = /' $C/stage-activity-list.tsx
sed -i 's/^const JourneyNoteList = /export const JourneyNoteList = /' $C/journey-note-list.tsx
NEW="$H/use-beneficiary-detail-view.ts $H/use-beneficiary-detail.ts $C/detail-header.tsx $C/profile-summary-dialog.tsx $C/journey-tab.tsx $C/assessment-dialog.tsx $C/participation-dialog.tsx $C/enrollment-status-dialog.tsx $C/journey-note-dialog.tsx $C/summary-row.tsx $C/record-list.tsx $C/stage-activity-list.tsx $C/journey-note-list.tsx $C/beneficiary-detail.tsx"
node .tmp/s4c/trim-imports.mjs $NEW > .tmp/s4c/trim2.out
sed -i "/^import { Select } from '@\/components\/ui\/select'$/d" $C/journey-tab.tsx
wc -l < .tmp/s4c/trim2.out
node .tmp/s4c/same-lines.mjs .tmp/s4c/before/beneficiary-detail.tsx $NEW useBeneficiaryDetail=BeneficiaryDetail --list > .tmp/s4c/added2.txt
tail -1 .tmp/s4c/added2.txt
```

The `sed` after the trim removes one import the trim cannot see: `Select` is unused in `journey-tab.tsx`, but the trim finds the word in the sentence "Select a journey stage" in the JSX text (`tsc` with `noUnusedLocals` in Step 3 would otherwise list it).

Expected: the cut prints one line count per file (before the trim and Biome), the import trim reported on all 14 files, and the proof finds no lost line (the `useBeneficiaryDetail=BeneficiaryDetail` argument undoes the hook's name, which the original gave the component):

```
apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail-view.ts: 208 lines
apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail.ts: 381 lines
apps/web/src/features/beneficiaries/profile/components/detail-header.tsx: 142 lines
apps/web/src/features/beneficiaries/profile/components/profile-summary-dialog.tsx: 140 lines
apps/web/src/features/beneficiaries/profile/components/journey-tab.tsx: 209 lines
apps/web/src/features/beneficiaries/profile/components/assessment-dialog.tsx: 105 lines
apps/web/src/features/beneficiaries/profile/components/participation-dialog.tsx: 164 lines
apps/web/src/features/beneficiaries/profile/components/enrollment-status-dialog.tsx: 183 lines
apps/web/src/features/beneficiaries/profile/components/journey-note-dialog.tsx: 139 lines
apps/web/src/features/beneficiaries/profile/components/summary-row.tsx: 75 lines
apps/web/src/features/beneficiaries/profile/components/record-list.tsx: 121 lines
apps/web/src/features/beneficiaries/profile/components/stage-activity-list.tsx: 107 lines
apps/web/src/features/beneficiaries/profile/components/journey-note-list.tsx: 107 lines
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx: 149 lines
14
original lines 1069, lost 0, added 145
```

`.tmp/s4c/added2.txt` lists the 145 added lines: the `Pick` lists, the destructurings, the `<Section detail={detail} />` calls, the view hook call and the two returned objects. A returned name missing from either object fails typecheck in the next step.

- [ ] **Step 3: Format and check**

```bash
P=apps/web/src/features/beneficiaries/profile
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
wc -l $P/hooks/*.ts $P/components/*.tsx | grep -v test
```

Expected: Biome checks 14 files and fixes all 14 (formatting and import order), the web typecheck is clean, the unused-locals check lists only the two baseline lines, lint is clean, and the sizes are:

```
Checked 14 files in <ms>. Fixed 14 files.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1360 files in <ms>. No fixes applied.
  160 apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail-view.ts
  334 apps/web/src/features/beneficiaries/profile/hooks/use-beneficiary-detail.ts
   63 apps/web/src/features/beneficiaries/profile/components/assessment-dialog.tsx
  259 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.tsx
   93 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.tsx
  110 apps/web/src/features/beneficiaries/profile/components/detail-header.tsx
  164 apps/web/src/features/beneficiaries/profile/components/enrollment-status-dialog.tsx
  109 apps/web/src/features/beneficiaries/profile/components/journey-note-dialog.tsx
   45 apps/web/src/features/beneficiaries/profile/components/journey-note-list.tsx
  201 apps/web/src/features/beneficiaries/profile/components/journey-tab.tsx
  143 apps/web/src/features/beneficiaries/profile/components/participation-dialog.tsx
  104 apps/web/src/features/beneficiaries/profile/components/profile-summary-dialog.tsx
   63 apps/web/src/features/beneficiaries/profile/components/record-list.tsx
   44 apps/web/src/features/beneficiaries/profile/components/stage-activity-list.tsx
    8 apps/web/src/features/beneficiaries/profile/components/summary-row.tsx
 2783 total
```

`use-beneficiary-detail.ts` (334) is the one file above 300 lines (ruling 6).

- [ ] **Step 4: Run the profile tests and mutate the hooks**

The 30 tests under `profile` (the detail test, the loader test and the utils test) are the characterization:

```bash
P=apps/web/src/features/beneficiaries/profile
run() { (cd apps/web && timeout 300 pnpm exec vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL " | sort -u | sed -E 's#^ FAIL  src/features/beneficiaries/[a-z-]+/(components/)?##'); }
echo "unmutated"; run src/features/beneficiaries/profile
cp $P/hooks/use-beneficiary-detail.ts .tmp/s4c/files/detail.bak
cp $P/hooks/use-beneficiary-detail-view.ts .tmp/s4c/files/view.bak
sed -i 's/const history = await journeysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id)/const history = []/' $P/hooks/use-beneficiary-detail.ts
echo "journey history reload removed"; run src/features/beneficiaries/profile
cp .tmp/s4c/files/detail.bak $P/hooks/use-beneficiary-detail.ts
sed -i 's/(first, second) => first.order - second.order/(first, second) => second.order - first.order/' $P/hooks/use-beneficiary-detail-view.ts
echo "stage order reversed"; run src/features/beneficiaries/profile
cp .tmp/s4c/files/view.bak $P/hooks/use-beneficiary-detail-view.ts
cmp .tmp/s4c/files/detail.bak $P/hooks/use-beneficiary-detail.ts && echo "detail hook restored"
cmp .tmp/s4c/files/view.bak $P/hooks/use-beneficiary-detail-view.ts && echo "view hook restored"
```

Expected: the unmutated run passes 30 tests in 3 files; dropping the history reload fails the three rows that assert the reloaded history, and reversing the stage order fails the pre and post score pairing; both hooks are restored byte for byte:

```
unmutated
      Tests  30 passed (30)
 Test Files  3 passed (3)
journey history reload removed
      Tests  3 failed | 27 passed (30)
beneficiary-detail.test.tsx > BeneficiaryDetail journey actions > lets an allowed role add a provenance-tracked note and reload journey history
beneficiary-detail.test.tsx > BeneficiaryDetail journey actions > lets an allowed role update enrollment status and reload journey history
beneficiary-detail.test.tsx > BeneficiaryDetail participation > submits through the accepted form contract and reloads persisted chronological history
 Test Files  1 failed | 2 passed (3)
stage order reversed
      Tests  1 failed | 29 passed (30)
beneficiary-detail.test.tsx > BeneficiaryDetail assessments > pairs a pre-test and a post-test that sit in different stages
 Test Files  1 failed | 2 passed (3)
detail hook restored
view hook restored
```

- [ ] **Step 5: Web suite and commit**

```bash
(cd apps/web && timeout 600 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
git add apps/web/src
git commit -q -m "refactor(web): split the beneficiary detail into a hook and screen sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```

Expected: web is `B_web` unchanged (227 files, 2015 tests), and the commit holds the 13 new files and the changed screen:

```
 Test Files  227 passed (227)
      Tests  2015 passed (2015)
 14 files changed, 1576 insertions(+), 1108 deletions(-)
```

---

### Task 3: Split the two oversized tests

**Files:**
- Create (gitignored): `.tmp/s4c/task3-form-cut.json`, `.tmp/s4c/task3-detail-cut.json`
- Modify: `registration/components/beneficiary-form.test.tsx` (870 to 169 lines), `registration/registration.utils.test.ts` (71 to about 120), `profile/components/beneficiary-detail.test.tsx` (636 to about 205)
- Create: `registration/components/beneficiary-form.{registration,definitions,age-rules}.test.tsx`, `profile/components/beneficiary-detail.{journey-actions,assessments}.test.tsx`, `apps/web/src/test/fixtures/beneficiary-form-fixtures.ts`, `beneficiary-detail-fixtures.ts`

`beneficiary-form.test.tsx` has 870 lines at the S4b tip and 867 once Task 1 has repointed its import (the line numbers below, and the hash in the cut plan, are those of the 867 line file). It has one `describe('BeneficiaryForm')` of 28 rows (174 to 867) after 173 lines of setup: the hoisted client mocks (15 to 30), the Radix select stand-in (31 to 78), `profileState` and the `use-current-role` mock (80 to 87), the fixtures `draftKey`, `validDraft`, `context` and `completeSelects` (88 to 148), and the lifecycle hooks (150 to 172). The rows fall into four groups by what they drive; three rows call pure functions and belong with `registration.utils.test.ts`:

| File | Rows (source lines) | Count |
|---|---|---|
| `beneficiary-form.test.tsx` | 184 to 289: scope, project switching, invalid input, draft recovery | 6 |
| `beneficiary-form.registration.test.tsx` | 291 to 508: register, update, required custom values, default form provisioning | 8 |
| `beneficiary-form.definitions.test.tsx` | 510 to 669: sparse and incompatible published definitions | 6 |
| `beneficiary-form.age-rules.test.tsx` | 705 to 866: minor status, birth date and age rules | 5 |
| `registration.utils.test.ts` (added) | 175 to 183 (`projectRegistrationValues`), 670 to 678 (birthday boundaries), 680 to 703 (minimum age) | 3 |

`beneficiary-detail.test.tsx` has four `describe` blocks (17 rows) after 166 lines of setup: imports, hoisted mocks (16 to 40), nine fixture records (42 to 160) and `afterEach` (162 to 166). Participation (168 to 238, 1 row) and layout (240 to 324, 4 rows) stay; journey actions (326 to 506, 5 rows) and assessments (508 to 636, 7 rows) move.

- [ ] **Step 1: Create the two cut plans**

Create each file with the Write tool exactly as printed. Every new test file repeats the source's `vi.hoisted` block and `vi.mock` lines through a range, because a `vi.mock` factory is hoisted above the imports and cannot name an import (ruling 7); the select mock is the one factory that moves, and it is reached by a dynamic import. `.tmp/s4c/task3-form-cut.json`:

Create `.tmp/s4c/task3-form-cut.json`:

```json
{
 "source": "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx",
 "hash": "47391b72",
 "files": {
  "apps/web/src/test/fixtures/beneficiary-form-fixtures.ts": [
   "import { beneficiaryRegistrationFieldRules } from '@pathways/shared'",
   "import { fireEvent, screen } from '@testing-library/react'",
   "import type { ChangeEvent, ReactNode } from 'react'",
   "",
   "import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'",
   "",
   "import { mockProjects } from './projects'",
   "",
   "// The stand-in for the Radix select that the form tests drive with change events.",
   "export const selectMock = async () => {",
   [
    32,
    77
   ],
   "}",
   "",
   [
    80,
    86
   ],
   [
    88,
    148
   ]
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx": [
   "@imports",
   "import {",
   "  completeSelects,",
   "  context,",
   "  draftKey,",
   "  profileState,",
   "  validDraft,",
   "} from '@/test/fixtures/beneficiary-form-fixtures'",
   "",
   [
    15,
    30
   ],
   "vi.mock('@/components/ui/select', async () =>",
   "  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),",
   ")",
   [
    87,
    87
   ],
   "",
   [
    150,
    172
   ],
   "",
   "describe('BeneficiaryForm', () => {",
   [
    184,
    289
   ],
   "})"
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.registration.test.tsx": [
   "@imports",
   "import {",
   "  completeSelects,",
   "  context,",
   "  draftKey,",
   "  profileState,",
   "  validDraft,",
   "} from '@/test/fixtures/beneficiary-form-fixtures'",
   "",
   [
    15,
    30
   ],
   "vi.mock('@/components/ui/select', async () =>",
   "  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),",
   ")",
   [
    87,
    87
   ],
   "",
   [
    150,
    172
   ],
   "",
   "describe('BeneficiaryForm registration', () => {",
   [
    291,
    508
   ],
   "})"
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.definitions.test.tsx": [
   "@imports",
   "import {",
   "  completeSelects,",
   "  context,",
   "  draftKey,",
   "  profileState,",
   "  validDraft,",
   "} from '@/test/fixtures/beneficiary-form-fixtures'",
   "",
   [
    15,
    30
   ],
   "vi.mock('@/components/ui/select', async () =>",
   "  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),",
   ")",
   [
    87,
    87
   ],
   "",
   [
    150,
    172
   ],
   "",
   "describe('BeneficiaryForm definitions', () => {",
   [
    510,
    669
   ],
   "})"
  ],
  "apps/web/src/features/beneficiaries/registration/components/beneficiary-form.age-rules.test.tsx": [
   "@imports",
   "import {",
   "  completeSelects,",
   "  context,",
   "  draftKey,",
   "  profileState,",
   "  validDraft,",
   "} from '@/test/fixtures/beneficiary-form-fixtures'",
   "",
   [
    15,
    30
   ],
   "vi.mock('@/components/ui/select', async () =>",
   "  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),",
   ")",
   [
    87,
    87
   ],
   "",
   [
    150,
    172
   ],
   "",
   "describe('BeneficiaryForm age rules', () => {",
   [
    705,
    866
   ],
   "})"
  ],
  "apps/web/src/features/beneficiaries/registration/registration.utils.test.ts": [
   "import { describe, expect, it } from 'vitest'",
   "",
   "import {",
   "  missingRegistrationProfileFields,",
   "  profileUpdateFieldsForForm,",
   "  projectRegistrationValues,",
   "  registrationAgeAtDate,",
   "  registrationFieldCodes,",
   "  registrationSubjectDefinitionErrors,",
   "} from './registration.utils'",
   "",
   {
    "file": "apps/web/src/features/beneficiaries/registration/registration.utils.test.ts",
    "from": 10
   },
   "",
   "describe('Beneficiary registration values and ages', () => {",
   [
    175,
    183
   ],
   "",
   [
    670,
    678
   ],
   "",
   [
    680,
    703
   ],
   "})"
  ]
 }
}
```

`.tmp/s4c/task3-detail-cut.json`:

Create `.tmp/s4c/task3-detail-cut.json`:

```json
{
 "source": "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx",
 "hash": "1e97bcd3",
 "files": {
  "apps/web/src/test/fixtures/beneficiary-detail-fixtures.ts": [
   "import type {",
   "  Activity,",
   "  BeneficiaryRecord,",
   "  DigitalFormDefinition,",
   "  JourneyStageConfig,",
   "  ProjectSummary,",
   "} from '@/types/pathways'",
   "",
   [
    42,
    160
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx": [
   "@imports",
   "import { activity, beneficiary, beneficiaryWithNote, form, project, stage } from '@/test/fixtures/beneficiary-detail-fixtures'",
   "",
   [
    16,
    40
   ],
   "",
   [
    162,
    166
   ],
   "",
   [
    168,
    324
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.journey-actions.test.tsx": [
   "@imports",
   "import { activity, beneficiary, beneficiaryWithNote, form, project, stage } from '@/test/fixtures/beneficiary-detail-fixtures'",
   "",
   [
    16,
    40
   ],
   "",
   [
    162,
    166
   ],
   "",
   [
    326,
    506
   ]
  ],
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.assessments.test.tsx": [
   "@imports",
   "import { activity, beneficiary, beneficiaryWithNote, form, project, stage } from '@/test/fixtures/beneficiary-detail-fixtures'",
   "",
   [
    16,
    40
   ],
   "",
   [
    162,
    166
   ],
   "",
   [
    508,
    636
   ]
  ]
 }
}
```

- [ ] **Step 2: Cut and count**

```bash
R=apps/web/src/features/beneficiaries
FC=$R/registration/components
PC=$R/profile/components
FX=apps/web/src/test/fixtures
B=.tmp/s4c/before
cp $FC/beneficiary-form.test.tsx $B/beneficiary-form.test.tsx
cp $PC/beneficiary-detail.test.tsx $B/beneficiary-detail.test.tsx
cp $R/registration/registration.utils.test.ts $B/registration.utils.test.ts
node .tmp/s4c/count-it.mjs $B/beneficiary-form.test.tsx $B/registration.utils.test.ts $B/beneficiary-detail.test.tsx
node .tmp/s4c/cut.mjs .tmp/s4c/task3-form-cut.json
node .tmp/s4c/cut.mjs .tmp/s4c/task3-detail-cut.json
sed -i -E 's/^const (profileState|draftKey|validDraft|context|completeSelects) = /export const \1 = /' $FX/beneficiary-form-fixtures.ts
sed -i -E 's/^const (project|activity|stage|form|beneficiary|beneficiaryWithNote)(:| =)/export const \1\2/' $FX/beneficiary-detail-fixtures.ts
FORM="$FX/beneficiary-form-fixtures.ts $FC/beneficiary-form.test.tsx $FC/beneficiary-form.registration.test.tsx $FC/beneficiary-form.definitions.test.tsx $FC/beneficiary-form.age-rules.test.tsx $R/registration/registration.utils.test.ts"
DETAIL="$FX/beneficiary-detail-fixtures.ts $PC/beneficiary-detail.test.tsx $PC/beneficiary-detail.journey-actions.test.tsx $PC/beneficiary-detail.assessments.test.tsx"
node .tmp/s4c/trim-imports.mjs $FORM $DETAIL > .tmp/s4c/trim3.out
wc -l < .tmp/s4c/trim3.out
node .tmp/s4c/count-it.mjs $FORM $DETAIL
```

Expected: the first block is the old counts (28 rows and 1 group in the form test, 5 rows and 1 group in the utils test, 17 rows and 4 groups in the detail test, 177 assertions in all); the cut prints one line count per file; the import trim touched all 10 files; the last block is the new counts, with 50 rows and the same 177 assertions (the groups grow from 6 to 10 because each new file has its own):

```
.tmp/s4c/before/beneficiary-form.test.tsx: it 28, describe 1, expect 117
.tmp/s4c/before/registration.utils.test.ts: it 5, describe 1, expect 5
.tmp/s4c/before/beneficiary-detail.test.tsx: it 17, describe 4, expect 55
total: it 50, describe 6, expect 177
apps/web/src/test/fixtures/beneficiary-form-fixtures.ts: 126 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx: 174 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.registration.test.tsx: 286 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.definitions.test.tsx: 228 lines
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.age-rules.test.tsx: 230 lines
apps/web/src/features/beneficiaries/registration/registration.utils.test.ts: 120 lines
apps/web/src/test/fixtures/beneficiary-detail-fixtures.ts: 127 lines
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx: 205 lines
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.journey-actions.test.tsx: 229 lines
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.assessments.test.tsx: 177 lines
10
apps/web/src/test/fixtures/beneficiary-form-fixtures.ts: it 0, describe 0, expect 0
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx: it 6, describe 1, expect 19
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.registration.test.tsx: it 8, describe 1, expect 31
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.definitions.test.tsx: it 6, describe 1, expect 21
apps/web/src/features/beneficiaries/registration/components/beneficiary-form.age-rules.test.tsx: it 5, describe 1, expect 34
apps/web/src/features/beneficiaries/registration/registration.utils.test.ts: it 8, describe 2, expect 17
apps/web/src/test/fixtures/beneficiary-detail-fixtures.ts: it 0, describe 0, expect 0
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx: it 5, describe 2, expect 17
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.journey-actions.test.tsx: it 5, describe 1, expect 20
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.assessments.test.tsx: it 7, describe 1, expect 18
total: it 50, describe 10, expect 177
```

- [ ] **Step 3: Prove that nothing was lost**

```bash
R=apps/web/src/features/beneficiaries
FC=$R/registration/components
PC=$R/profile/components
FX=apps/web/src/test/fixtures
B=.tmp/s4c/before
node .tmp/s4c/same-lines.mjs $B/beneficiary-form.test.tsx $FX/beneficiary-form-fixtures.ts $FC/beneficiary-form.test.tsx $FC/beneficiary-form.registration.test.tsx $FC/beneficiary-form.definitions.test.tsx $FC/beneficiary-form.age-rules.test.tsx $R/registration/registration.utils.test.ts | tail -3
node .tmp/s4c/same-lines.mjs $B/beneficiary-detail.test.tsx $FX/beneficiary-detail-fixtures.ts $PC/beneficiary-detail.test.tsx $PC/beneficiary-detail.journey-actions.test.tsx $PC/beneficiary-detail.assessments.test.tsx | tail -3
for f in $FC/beneficiary-form.test.tsx $FC/beneficiary-form.registration.test.tsx $FC/beneficiary-form.definitions.test.tsx $FC/beneficiary-form.age-rules.test.tsx $PC/beneficiary-detail.test.tsx $PC/beneficiary-detail.journey-actions.test.tsx $PC/beneficiary-detail.assessments.test.tsx; do echo "$(grep -c '^vi.mock(' $f) vi.mock, $(grep -c 'vi.hoisted' $f) hoisted: ${f##*/}"; done
```

Expected: the form proof loses exactly one line, the opener `vi.mock('@/components/ui/select', async () => {`, which the split replaces by the two line call of the select mock in the fixtures module (the body of the mock is in `beneficiary-form-fixtures.ts`, counted as added lines); the detail proof loses none. Each test file keeps the six `vi.mock` lines and the one `vi.hoisted` block of its source:

```
lost lines:
vi.mock('@/components/ui/select', async () => { (1 -> 0)
original lines 813, lost 1, added 189
original lines 576, lost 0, added 58
6 vi.mock, 1 hoisted: beneficiary-form.test.tsx
6 vi.mock, 1 hoisted: beneficiary-form.registration.test.tsx
6 vi.mock, 1 hoisted: beneficiary-form.definitions.test.tsx
6 vi.mock, 1 hoisted: beneficiary-form.age-rules.test.tsx
6 vi.mock, 1 hoisted: beneficiary-detail.test.tsx
6 vi.mock, 1 hoisted: beneficiary-detail.journey-actions.test.tsx
6 vi.mock, 1 hoisted: beneficiary-detail.assessments.test.tsx
```

- [ ] **Step 4: Format, check and run**

```bash
R=apps/web/src/features/beneficiaries
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
wc -l $R/registration/components/*.test.tsx $R/profile/components/*.test.tsx $R/registration/registration.utils.test.ts apps/web/src/test/fixtures/beneficiary-*-fixtures.ts
(cd apps/web && timeout 300 pnpm exec vitest run src/features/beneficiaries 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
```

Expected: Biome checks 10 files and fixes 7 of them (line wrapping and import order of the new files), typecheck and lint are clean, no test file is over 300 lines, and the beneficiary tests run 105 tests in 19 files (the same 105 tests as before, in 5 more files because the form test became 4 files and the detail test 3):

```
Checked 10 files in <ms>. Fixed 7 files.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1367 files in <ms>. No fixes applied.
  112 apps/web/src/features/beneficiaries/registration/components/beneficiary-form-loader.test.tsx
  226 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.age-rules.test.tsx
  222 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.definitions.test.tsx
  282 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.registration.test.tsx
  169 apps/web/src/features/beneficiaries/registration/components/beneficiary-form.test.tsx
  247 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx
  177 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.assessments.test.tsx
  228 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.journey-actions.test.tsx
  205 apps/web/src/features/beneficiaries/profile/components/beneficiary-detail.test.tsx
  120 apps/web/src/features/beneficiaries/registration/registration.utils.test.ts
  127 apps/web/src/test/fixtures/beneficiary-detail-fixtures.ts
  126 apps/web/src/test/fixtures/beneficiary-form-fixtures.ts
 2241 total
 Test Files  19 passed (19)
      Tests  105 passed (105)
```

- [ ] **Step 5: Web suite and commit**

```bash
(cd apps/web && timeout 600 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
git add apps/web/src
git commit -q -m "test(web): split the beneficiary form and detail tests by concern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```

Expected: web goes from 227 to 232 files and stays at 2015 tests (five new test files, no new row), and the commit holds 10 files:

```
 Test Files  232 passed (232)
      Tests  2015 passed (2015)
 10 files changed, 1457 insertions(+), 1149 deletions(-)
```

---

### Task 4: Split the media proof and the directory

**Files:**
- Create (gitignored): `.tmp/s4c/media-split.json`, `.tmp/s4c/directory-cut.json`
- Modify: `media/components/beneficiary-media-proof.tsx` (668 to 210 lines), `media/media.utils.ts` (`LoadState`), `directory/components/beneficiary-directory.tsx` (565 to 435)
- Create: `media/components/{add-media-dialog,media-viewer,media-kpi}.tsx`, `directory/hooks/use-beneficiary-columns.tsx`, `directory/components/filter-select.tsx`

`beneficiary-media-proof.tsx` declares, in order: the types `MediaFilter`, `FileStatus` and `LoadState`, the interface `UploadItem`, the constants `maxNote`, `filterLabels`, `fallbackLimits` and `typeLabels`, `BeneficiaryMediaProof` (81 to 269), `AddMediaDialog` (271 to 547), `statusLabel` (549), `MediaViewer` (557 to 648) and `MediaKpi` (650 to 668). The dialog and the upload types, constants and `statusLabel` it alone uses move together to `add-media-dialog.tsx`; the proof keeps `MediaFilter` and `filterLabels`; `LoadState` is used by the proof and the viewer, so it goes to `media.utils.ts` beside `formatMediaFileSize`. The S3b splitter takes the plan below by declared name, copies the import block into every new file (the trim then drops what each does not use) and keeps every declaration verbatim.

`beneficiary-directory.tsx` is one component whose first 169 lines are the imports, constants and state, whose lines 170 to 264 define the table columns (a `ColumnDef` array built from the activities, projects and stages), and whose remaining lines are the filters and the table; `FilterSelect` (545 to 565) is the filter select helper. The columns become a hook that the screen calls where the array used to be defined.

- [ ] **Step 1: Create the two plans**

Create each file with the Write tool exactly as printed. `.tmp/s4c/media-split.json` is the `split-module.mjs` plan (the header lines are literal; `@original` stands for the source's own import block):

Create `.tmp/s4c/media-split.json`:

```json
{
 "apps/web/src/features/beneficiaries/media/components/add-media-dialog.tsx": {
  "header": [
   "@original"
  ],
  "names": [
   "FileStatus",
   "UploadItem",
   "maxNote",
   "fallbackLimits",
   "typeLabels",
   "AddMediaDialog",
   "statusLabel"
  ]
 },
 "apps/web/src/features/beneficiaries/media/components/media-viewer.tsx": {
  "header": [
   "@original",
   "import type { LoadState } from '../media.utils'"
  ],
  "names": [
   "MediaViewer"
  ]
 },
 "apps/web/src/features/beneficiaries/media/components/media-kpi.tsx": {
  "header": [
   "@original"
  ],
  "names": [
   "MediaKpi"
  ]
 },
 ".tmp/s4c/files/media-utils-part.ts": {
  "header": [],
  "names": [
   "LoadState"
  ]
 },
 "apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx": {
  "header": [
   "@original",
   "import type { LoadState } from '../media.utils'",
   "import { AddMediaDialog } from './add-media-dialog'",
   "import { MediaKpi } from './media-kpi'",
   "import { MediaViewer } from './media-viewer'"
  ],
  "names": [
   "MediaFilter",
   "filterLabels",
   "BeneficiaryMediaProof"
  ]
 }
}
```

`.tmp/s4c/directory-cut.json` is the `cut.mjs` plan:

Create `.tmp/s4c/directory-cut.json`:

```json
{
 "source": "apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx",
 "hash": "2fc7ff2c",
 "files": {
  "apps/web/src/features/beneficiaries/directory/hooks/use-beneficiary-columns.tsx": [
   "@imports",
   "",
   "export const useBeneficiaryColumns = ({",
   "  activities,",
   "  scopedProjects,",
   "  stages,",
   "}: {",
   "  activities: ActivitySummary[]",
   "  scopedProjects: ProjectSummary[]",
   "  stages: JourneyStageConfig[]",
   "}) => {",
   [
    170,
    264
   ],
   "  return columns",
   "}"
  ],
  "apps/web/src/features/beneficiaries/directory/components/filter-select.tsx": [
   "'use client'",
   "",
   "@imports",
   "",
   [
    545,
    565
   ]
  ],
  "apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx": [
   "'use client'",
   "",
   "@imports",
   "import { useBeneficiaryColumns } from '../hooks/use-beneficiary-columns'",
   "import { FilterSelect } from './filter-select'",
   "",
   [
    58,
    169
   ],
   "  const columns = useBeneficiaryColumns({ activities, scopedProjects, stages })",
   [
    265,
    543
   ]
  ]
 }
}
```

- [ ] **Step 2: Split the media proof**

```bash
M=apps/web/src/features/beneficiaries/media
cp $M/components/beneficiary-media-proof.tsx .tmp/s4c/before/beneficiary-media-proof.tsx
cp $M/media.utils.ts .tmp/s4c/before/media.utils.ts
node .tmp/s4c/split-module.mjs $M/components/beneficiary-media-proof.tsx .tmp/s4c/media-split.json
sed -i 's/^const AddMediaDialog = /export const AddMediaDialog = /' $M/components/add-media-dialog.tsx
sed -i 's/^const MediaViewer = /export const MediaViewer = /' $M/components/media-viewer.tsx
sed -i 's/^const MediaKpi = /export const MediaKpi = /' $M/components/media-kpi.tsx
sed -i 's/^type LoadState = /export type LoadState = /' .tmp/s4c/files/media-utils-part.ts
{ echo; echo '// Load state of a media request.'; sed '/./,$!d' .tmp/s4c/files/media-utils-part.ts; } >> $M/media.utils.ts
NEW="$M/components/add-media-dialog.tsx $M/components/media-viewer.tsx $M/components/media-kpi.tsx $M/components/beneficiary-media-proof.tsx"
node .tmp/s4c/trim-imports.mjs $NEW | cut -c1-200
node .tmp/s4c/same-lines.mjs .tmp/s4c/before/beneficiary-media-proof.tsx $NEW .tmp/s4c/files/media-utils-part.ts --list | tail -3
cat $M/media.utils.ts | tail -4
```

Expected: the splitter prints the line count of each of the five outputs, the trim lists what each file dropped (the long lists are cut at 200 characters), and the proof finds no lost line and no added line (the comment above `LoadState` is written by the `echo`, the type is the cut text):

```
apps/web/src/features/beneficiaries/media/components/add-media-dialog.tsx: 318 lines
apps/web/src/features/beneficiaries/media/components/media-viewer.tsx: 93 lines
apps/web/src/features/beneficiaries/media/components/media-kpi.tsx: 19 lines
.tmp/s4c/files/media-utils-part.ts: 1 lines
apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx: 192 lines
apps/web/src/features/beneficiaries/media/components/add-media-dialog.tsx: removed Camera, Eye, FileImage, ShieldCheck, Video, useCallback, EmptyState, StatusBadge, BeneficiaryMediaItem, formatDate
apps/web/src/features/beneficiaries/media/components/media-viewer.tsx: removed Camera, Eye, FileImage, RotateCcw, ShieldCheck, UploadCloud, Video, X, useCallback, useRef, toast, StatusBadge, Input, La
apps/web/src/features/beneficiaries/media/components/media-kpi.tsx: removed Eye, FileImage, Loader2, RotateCcw, ShieldCheck, UploadCloud, Video, X, useCallback, useEffect, useRef, useState, toast, Emp
apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx: removed RotateCcw, X, useRef, toast, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle

original lines 595, lost 0, added 0
}

// Load state of a media request.
export type LoadState = 'loading' | 'error' | 'ready'
```

- [ ] **Step 3: Check, test and commit the media proof**

```bash
M=apps/web/src/features/beneficiaries/media
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
wc -l $M/components/*.tsx $M/media.utils.ts | grep -v test
(cd apps/web && timeout 300 pnpm exec vitest run src/features/beneficiaries/media src/features/beneficiaries/profile 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add apps/web/src
git commit -q -m "refactor(web): split the beneficiary media proof into dialog, viewer and counter files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```

Expected: Biome formats the new files, typecheck and lint are clean, the media tests (9 rows, which mount the proof and so the dialog, viewer and counter, and the utils test) and the profile tests (30, whose detail test mocks the proof) pass, 40 tests in 7 files, and the commit holds the three new files, the shortened proof and `media.utils.ts`:

```
Checked 5 files in <ms>. Fixed 1 file.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1370 files in <ms>. No fixes applied.
  344 apps/web/src/features/beneficiaries/media/components/add-media-dialog.tsx
  210 apps/web/src/features/beneficiaries/media/components/beneficiary-media-proof.tsx
   23 apps/web/src/features/beneficiaries/media/components/media-kpi.tsx
  113 apps/web/src/features/beneficiaries/media/components/media-viewer.tsx
   10 apps/web/src/features/beneficiaries/media/media.utils.ts
  908 total
 Test Files  7 passed (7)
      Tests  40 passed (40)
 5 files changed, 490 insertions(+), 465 deletions(-)
```

- [ ] **Step 4: Split the directory, check, test and commit**

```bash
D=apps/web/src/features/beneficiaries/directory
cp $D/components/beneficiary-directory.tsx .tmp/s4c/before/beneficiary-directory.tsx
node .tmp/s4c/cut.mjs .tmp/s4c/directory-cut.json
sed -i 's/^const FilterSelect = /export const FilterSelect = /' $D/components/filter-select.tsx
NEW="$D/hooks/use-beneficiary-columns.tsx $D/components/filter-select.tsx $D/components/beneficiary-directory.tsx"
node .tmp/s4c/trim-imports.mjs $NEW | cut -c1-200
node .tmp/s4c/same-lines.mjs .tmp/s4c/before/beneficiary-directory.tsx $NEW --list | tail -14
git add -N apps/web/src
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR apps/web/src) 2>&1 | tail -3
pnpm --filter @pathways/web exec tsc --noEmit && echo "web typecheck clean"
pnpm --filter @pathways/web exec tsc --noEmit --noUnusedLocals 2>&1 | grep "error TS"
pnpm lint 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
wc -l $D/components/*.tsx $D/hooks/*.tsx | grep -v test
(cd apps/web && timeout 300 pnpm exec vitest run src/features/beneficiaries/directory 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git add apps/web/src
git commit -q -m "refactor(web): move the beneficiary directory columns and filter select out of the screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git show --stat --format=%h HEAD | tail -1
```

Expected: the cut prints three line counts, the trim lists the dropped imports, and the proof finds no lost line; the 12 added lines are the hook's signature and `return columns`, and the one call the screen makes in place of the array. Then Biome, typecheck and lint are clean, the directory has no file above 435 lines, its 4 tests pass and the commit holds the hook, the select and the shortened screen:

```
apps/web/src/features/beneficiaries/directory/hooks/use-beneficiary-columns.tsx: 161 lines
apps/web/src/features/beneficiaries/directory/components/filter-select.tsx: 78 lines
apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx: 451 lines
apps/web/src/features/beneficiaries/directory/hooks/use-beneficiary-columns.tsx: removed flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, Plus, RotateCcw, Search, useSearchParams, us
apps/web/src/features/beneficiaries/directory/components/filter-select.tsx: removed ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, Plus, RotateCcw, Search, useSearchPara
apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx: removed ColumnDef, ProgressBar, StatusBadge, Select, SelectContent, SelectTrigger, SelectValue, deriveCurrentStage, 
1x const useBeneficiaryColumns = ({
1x activities,
1x scopedProjects,
1x stages,
1x }: {
1x activities: ActivitySummary[]
1x scopedProjects: ProjectSummary[]
1x stages: JourneyStageConfig[]
1x }) => {
1x return columns
1x }
1x const columns = useBeneficiaryColumns({ activities, scopedProjects, stages })
original lines 486, lost 0, added 12
Checked 3 files in <ms>. Fixed 3 files.
web typecheck clean
src/features/collection/collection-workspace.tsx(406,10): error TS6133: 'indicators' is declared but its value is never read.
src/types/pathways.ts(6,3): error TS6196: 'SadddDashboard' is declared but never used.
$ pnpm exec biome check .
Checked 1372 files in <ms>. No fixes applied.
  108 apps/web/src/features/beneficiaries/directory/components/beneficiary-directory-loader.tsx
  435 apps/web/src/features/beneficiaries/directory/components/beneficiary-directory.tsx
  110 apps/web/src/features/beneficiaries/directory/components/evaluation-center-lookup.tsx
   25 apps/web/src/features/beneficiaries/directory/components/filter-select.tsx
  126 apps/web/src/features/beneficiaries/directory/hooks/use-beneficiary-columns.tsx
  911 total
 Test Files  1 passed (1)
      Tests  4 passed (4)
 3 files changed, 156 insertions(+), 135 deletions(-)
```

- [ ] **Step 5: Full suite and bundle comparison**

```bash
(cd apps/web && timeout 600 pnpm exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(Tests|Test Files) +[0-9]| FAIL ")
git checkout -- apps/web/next-env.d.ts
.tmp/s4c/build-routes.sh layout
node .tmp/s4c/compare-routes.mjs .tmp/s4c/routes-baseline.txt .tmp/s4c/routes-layout.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: web is 232 files and 2015 tests, the build exits 0 with Middleware at `M0`, and three routes grow by 1 kB (ruling 10) while 69 others are unchanged:

```
 Test Files  232 passed (232)
      Tests  2015 passed (2015)
exit 0
ƒ Middleware                                                      103 kB
/beneficiaries/[beneficiaryId]: 299 kB -> 300 kB (+1.0)
/beneficiaries/[beneficiaryId]/edit: 279 kB -> 280 kB (+1.0)
/beneficiaries/new: 279 kB -> 280 kB (+1.0)
routes 72, different 3
```

A growth above 1 kB, or a route that is not one of the three, means a section was handed a heavier import than the old component had: stop and report NEEDS_CONTEXT with the compare output.

---

### Task 5: Records

**Files:**
- Create (gitignored): `.tmp/s4c/task5-edits.json`, `.tmp/s4c/index-row.mjs`, `.tmp/s4c/activity-s4c.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-06, MOD-17 and MOD-B1 rows), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 11), and no living document names a moved path: a search of `docs` (outside history, plans and the activity log) finds `features/beneficiaries/<name>.tsx` only in `docs/deferred-features.md` line 20, a removed-feature row that records the files it changed on 2026-09-29 and stays as written. The `docs/audit-pathways-codebase-modularity-20261009.md` MOD-B1 row cites `beneficiary-directory.tsx:103,403`; the split moves the two `'5-9'` lines to 89 and 295, so that row is updated here. `docs/cr-pathways-default-registration-form.md` lines 17 and 25 cite `beneficiary-form.tsx` line numbers that were already stale before S4c (a 2026-09-28 record) and stay as written.

- [ ] **Step 1: Amend the change record, the audit and the index**

Create each file with the Write tool, exactly as printed. `.tmp/s4c/task5-edits.json` holds the exact replacements: the hooks and tests rule appended to the layout paragraph of section 3.3, the S4c applied paragraph that replaces the "Deferred to S4c" paragraph of section 9, and the two audit row endings plus the line cites of the MOD-B1 row. `@DATE@` is replaced by the day Task 5 runs and `@M0@` by the Middleware size of the Task 0 build:

Create `.tmp/s4c/task5-edits.json`:

```json
[
  [
    "docs/cr-pathways-codebase-modularization.md",
    "(`journey-config` into `beneficiaries/journey`) (amended 2026-10-13 for S4b).",
    "(`journey-config` into `beneficiaries/journey`) (amended 2026-10-13 for S4b). A screen whose state, effects and sections outgrow one file keeps its state and effects in `<concern>/hooks/use-<name>.ts`, which take only the values they read, and its sections in `<concern>/components/`, one exported component per file, with the screen reduced to calling the hook and composing the sections; tests of such a screen split as `<file>.<concern>.test.tsx` and share their fixtures through `test/fixtures/<name>-fixtures.ts` (amended @DATE@ for S4c).",
    1
  ],
  [
    "docs/cr-pathways-codebase-modularization.md",
    "Deferred to S4c: the `ScopedBeneficiaryForm` split and its rename, the `beneficiary-detail.tsx`, `beneficiary-media-proof.tsx` and `beneficiary-directory.tsx` splits, the two oversized tests, and the audit disposition of MOD-06 for the beneficiary components.",
    "S4c applied @DATE@ on the S4c slice branch:\n- Registration: `beneficiary-form.tsx` (1391 lines) became the 36 line `BeneficiaryForm`, `BeneficiaryRegistrationForm` (the former `ScopedBeneficiaryForm`, 420 lines), three hooks in `registration/hooks` (context, draft, validation), eight section components and ten more exports in `registration.utils.ts`.\n- Detail: `beneficiary-detail.tsx` (1173 lines) became a 93 line screen, `useBeneficiaryDetail` and `useBeneficiaryDetailView` in `profile/hooks` and eleven section components that take a `Pick` of the hook state.\n- Media and directory: `AddMediaDialog`, `MediaViewer` and `MediaKpi` left `beneficiary-media-proof.tsx` (668 to 210 lines, `LoadState` to `media.utils.ts`); the column definitions (`useBeneficiaryColumns`) and `FilterSelect` left `beneficiary-directory.tsx` (565 to 435 lines).\n- Proof: each split was cut from hash-pinned line ranges of the old file and checked with a line multiset comparison (`lost 0`; 255, 145, 0 and 12 lines added for signatures, props and calls); one moved line of each registration hook and two lines of the detail hooks were mutated, and each mutation failed tests.\n- Tests: `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.tsx` (636) split into seven files and two fixture modules in `test/fixtures`; the 50 rows (28, 5 and 17) and the 177 assertions were counted before and after; web went from 227 files to 232 and stayed at 2015 tests.\n- Routes: Middleware stayed at @M0@ in the cloud container; `/beneficiaries/new`, `/beneficiaries/[beneficiaryId]` and its `edit` page grew by 1 kB and no other route changed.\n- Decisions: hooks take narrow parameters and sections take `Pick` views of the hook state, with no context (ruling 3); `setConfirmOpen` is the only dependency added to a moved effect (ruling 2); `use-beneficiary-detail.ts` (334 lines) and `profile-fields.tsx` (321) stay above the 300 line target and below 500 (ruling 6); two guards no test pins (a stored draft of another project, the minor boundary at 18) stay unpinned (ruling 9); there is no pull request for the slice (ruling 12).\n\nS4 is complete: the beneficiary, journey and media API, client, layout and components are modularized. Left to later slices: nothing from S4; the `'5-9'` age band stays as MOD-B1.",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "beneficiary components laid out by S4b and split in S4c. |",
    "beneficiary components laid out by S4b and split by S4c. |",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "beneficiaries feature laid out by S4b, the Scoped name left to S4c. |",
    "beneficiaries feature laid out by S4b, ScopedBeneficiaryForm renamed BeneficiaryRegistrationForm by S4c. |",
    1
  ],
  [
    "docs/audit-pathways-codebase-modularity-20261009.md",
    "beneficiary-directory.tsx:103,403` offers",
    "beneficiary-directory.tsx:89,295` offers",
    1
  ]
]
```

`.tmp/s4c/index-row.mjs` moves S4c from the next list to the applied list of the change record row in `docs/index.md`, whatever other slices sit on the branch:

Create `.tmp/s4c/index-row.mjs`:

```js
// Moves S4c from the next list to the applied list in the change record row of docs/index.md.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'docs/index.md'
const row = /^(\| \[cr-pathways-codebase-modularization\].*\| Approved; )(.*) applied(?:, (.*) next)? \|$/m
const text = readFileSync(file, 'utf8')
const found = row.exec(text)
if (!found) throw new Error('change record row not found')
const items = (list) => (list ? list.split(/, | and /).filter((item) => item) : [])
const join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list.join(''))
const applied = items(found[2])
if (applied.includes('S4c')) throw new Error('S4c is already applied')
applied.splice(applied.indexOf('S4b') + 1, 0, 'S4c')
const next = items(found[3]).filter((item) => item !== 'S4c')
const tail = next.length ? `, ${join(next)} next` : ''
writeFileSync(file, text.replace(row, `$1${join(applied)} applied${tail} |`))
console.log(found[0].slice(-90))
console.log(`${join(applied)} applied${tail}`.slice(-90))
```

```bash
D=$(date +%F)
M0=$(grep Middleware .tmp/s4c/routes-baseline.txt | grep -oE '[0-9]+ kB' | head -1)
sed -i -e "s/@DATE@/$D/g" -e "s/@M0@/$M0/g" .tmp/s4c/task5-edits.json
node .tmp/s4c/replace-exact.mjs .tmp/s4c/task5-edits.json
node .tmp/s4c/index-row.mjs
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
git diff docs/cr-pathways-codebase-modularization.md | grep -c "^+"
grep -c "Deferred to S4c" docs/cr-pathways-codebase-modularization.md
git grep -nE "features/beneficiaries/[a-z-]+\.tsx" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' | cut -c1-110
```

Expected: five replacements in two files, the index row before and after (its last 90 characters; the lists name whatever slices sit on the branch, so only the S4c move must match), three docs files changed, the three audit row endings (MOD-06, MOD-17 and the MOD-B1 line cites), the section 9 paragraph added, no "Deferred to S4c" left, and the one leftover path (the removed-feature row, history):

```
5 replacements in 2 files
 F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S5a and S6a applied, S4c, S5b and S6b next |
to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a and S6a applied, S5b and S6b next
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 13 +++++++++++--
 docs/index.md                                       |  2 +-
 3 files changed, 15 insertions(+), 6 deletions(-)
3b; beneficiary components laid out by S4b and split by S4c. |
dBeneficiaryForm renamed BeneficiaryRegistrationForm by S4c. |
ice.ts:353`, `metric-contract.ts:13`) | SADDD | Separate fix |
12
0
docs/deferred-features.md:20:| Prototype info notices | Removed | 2026-09-29 | Production mode: the blue expla
```

- [ ] **Step 2: Activity log**

`.tmp/s4c/activity-s4c.md` is the S4c section of the activity log, with the commit hashes of Tasks 1 to 4 as `@H1@` to `@H5@` (Task 4 has two commits):

Create `.tmp/s4c/activity-s4c.md`:

```md

## @DATE@ Modularization S4c beneficiaries components (claude/modularization-s4c-9ept8o)
- Task 1 (@H1@): `beneficiary-form.tsx` (1391 lines) cut into the 36 line `BeneficiaryForm`, `BeneficiaryRegistrationForm` (renamed from `ScopedBeneficiaryForm`, 420 lines), three registration hooks, eight section components and ten more exports of `registration.utils.ts`; every line of the old form and utils file is in a new file (`lost 0`, 255 lines added), one moved line mutated per hook failed the tests.
- Task 2 (@H2@): `beneficiary-detail.tsx` (1173 lines) cut into a 93 line screen, `useBeneficiaryDetail`, `useBeneficiaryDetailView` and eleven section components (`lost 0`, 145 lines added); two mutations of the detail hooks failed tests.
- Task 3 (@H3@): `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.tsx` (636) split into seven test files with two fixture modules in `test/fixtures`, three pure rows moved to `registration.utils.test.ts`; 50 rows and 177 assertions before and after.
- Task 4 (@H4@, @H5@): `AddMediaDialog`, `MediaViewer` and `MediaKpi` cut out of the media proof (668 to 210 lines, `LoadState` to `media.utils.ts`), then the column definitions and `FilterSelect` out of the directory (565 to 435 lines); three routes grew by 1 kB.
- Task 5: the change record (section 3.3 hooks and tests rule, section 9 S4c disposition), the audit rows MOD-06, MOD-17 and MOD-B1 and the index row follow the split; no SAD routing change, because `features/beneficiaries/**` and the test fixtures already route to the design QA agent.
- Decisions: the S4c decisions are recorded in the change record section 9; the plan stays in `docs/superpowers/plans` as the record of the slice. Not pinned by any test before or after the split: the restore of a stored draft of another project and the minor boundary at 18.
- Deferred: nothing from S4. The `'5-9'` age band of the directory stays as MOD-B1.
```

```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^refactor(web): split the beneficiary registration form')
H2=$(git log -1 --format=%h --grep='^refactor(web): split the beneficiary detail')
H3=$(git log -1 --format=%h --grep='^test(web): split the beneficiary form and detail tests')
H4=$(git log -1 --format=%h --grep='^refactor(web): split the beneficiary media proof')
H5=$(git log -1 --format=%h --grep='^refactor(web): move the beneficiary directory columns')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H4@/$H4/" -e "s/@H5@/$H5/" .tmp/s4c/activity-s4c.md
grep -c "@H[1-5]@\|@DATE@" .tmp/s4c/activity-s4c.md
cat .tmp/s4c/activity-s4c.md >> docs/activity-log.md
tail -9 docs/activity-log.md | cut -c1-90
```

Expected: `0` placeholders left, then the new section (the lines are cut at 90 characters):

```
0

## <date> Modularization S4c beneficiaries components (claude/modularization-s4c-9ept8o)
- Task 1 (<sha>): `beneficiary-form.tsx` (1391 lines) cut into the 36 line `BeneficiaryF
- Task 2 (<sha>): `beneficiary-detail.tsx` (1173 lines) cut into a 93 line screen, `useB
- Task 3 (<sha>): `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.t
- Task 4 (<sha>, <sha>): `AddMediaDialog`, `MediaViewer` and `MediaKpi` cut out of the
- Task 5: the change record (section 3.3 hooks and tests rule, section 9 S4c disposition),
- Decisions: the S4c decisions are recorded in the change record section 9; the plan stays
- Deferred: nothing from S4. The `'5-9'` age band of the directory stays as MOD-B1.
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1
git add docs
git commit -m "docs: record modularization S4c

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
```

Expected: the same 6 baseline docs failures and 1 warning, lint clean, and a commit of 4 files:

```

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
$ pnpm exec biome check .
Checked 1372 files in <ms>. No fixes applied.
[<branch> <sha>] docs: record modularization S4c
 4 files changed, 24 insertions(+), 6 deletions(-)
```

---

### Task 6: Full release gates

- [ ] **Step 1: Static gates**

```bash
pnpm lint 2>&1 && pnpm typecheck 2>&1
git checkout -- apps/web/next-env.d.ts
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests +[0-9]+"
.tmp/s4c/build-routes.sh gates
node .tmp/s4c/compare-routes.mjs .tmp/s4c/routes-baseline.txt .tmp/s4c/routes-gates.txt | tail -4
node .tmp/s4c/compare-routes.mjs .tmp/s4c/routes-layout.txt .tmp/s4c/routes-gates.txt | tail -2
git checkout -- apps/web/next-env.d.ts
pnpm docs:check 2>&1 | tail -3
git status --short | wc -l
```

Expected: Biome clean, then the typecheck and test summaries of the Task 0 baselines with web at 232 files (five new test files) and 2015 tests, the `sad:test` line, a build that exits 0 with Middleware at `M0`, three routes 1 kB bigger than the Task 0 build, none different from the Task 4 build, the baseline docs check and a clean tree (the `$ pnpm ...` echo lines of pnpm come between them):

```
Checked 1372 files in <ms>. No fixes applied.
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
exit 0
ƒ Middleware                                                      103 kB
/beneficiaries/[beneficiaryId]: 299 kB -> 300 kB (+1.0)
/beneficiaries/[beneficiaryId]/edit: 279 kB -> 280 kB (+1.0)
/beneficiaries/new: 279 kB -> 280 kB (+1.0)
routes 72, different 3
routes 72, different 0
6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
0
```

The first compare is against the Task 0 build (three routes differ, each by +1.0 kB: `/beneficiaries/[beneficiaryId]`, `/beneficiaries/[beneficiaryId]/edit`, `/beneficiaries/new`) and the second against the Task 4 build (none differs). The package counts are the Task 0 baselines (config, shared, imports, api); a package count that moved is a stop, because S4c touches no package. The last `docs:check` lines are the baseline (6 failures, 1 warning).

- [ ] **Step 2: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```

The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user, because `initdb` refuses to run as root. S4c changes no migration and no file outside `apps/web/src` and `docs`, so the CI replay of the final pull request, the one opened after every slice is implemented (expect 171 PASS, 0 FAIL), is the gate when the replay cannot run here; record which one ran.

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

- Directory: open `/beneficiaries`, search, filter by project, stage, sex, age band and enrollment status, page the table and sort the columns (the columns hook), clear the filters.
- Registration: open `/beneficiaries/new`, pick a project with a published form, fill the profile, pick a birth date under 18 and see the guardian consent field appear, reload the page and see the recovered draft banner, clear it, register a person and land on the record; pick a project without a published form and see the default form provisioned once.
- Detail: open a record and see the header, the profile summary dialog, the stage tracker with the current stage marked and later stages locked, select a stage, record participation, update the enrollment status (including a transfer), add and correct a journey note, open the assessment scores, and open the participation history; confirm each reloads the journey history.
- Media: on the Media proof tab add a photo (reserve, direct upload, finalize), see the counters, open it in the viewer and close it.
- Profile edit: open `/beneficiaries/<id>/edit`, change a field and save with the concurrency token.
- Untouched neighbours: open `/beneficiaries/duplicates` and record Keep distinct on a pair, open `/beneficiaries/evaluation-center` and search, open a project's `journey-stages` page and save a stage, open the collection direct entry and search a contributor.

- [ ] **Step 4: SAD review**

```bash
mkdir -p .tmp/sad/s4c
pnpm sad:check --base "$(cat .tmp/s4c/base-sha)" --head HEAD --output .tmp/sad/s4c/manifest.json > .tmp/sad/s4c/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s4c/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```

Expected: the check exits 0, writes the manifest, and the only role is the design QA agent, with the 46 changed paths of `apps/web/src/features/beneficiaries` and `apps/web/src/test/fixtures` (the count moves by a few paths if the branch holds other changes):

```
exit 0
design-qa-agent 46
```

`.tmp/sad/s4c/check.out` holds the `$ tsx scripts/sad/check.ts ...` line and `{ "subagent_evaluations": [] }`.

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, which 46 does not need), transcribe each reply into `.tmp/sad/s4c/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s4c/assemble.mjs`, run `node .tmp/sad/s4c/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s4c/base-sha)" --head HEAD --reviews .tmp/sad/s4c/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The dry run could not dispatch the roles (no subagents in the planning copy), so the sign-off is pending for the cloud run.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 5 activity-log section with the gate results (per-package counts, Middleware size, replay exit code or CI result, seed results, e2e pass counts and smoke result or pending local run, SAD sign-off). The dry-run bullet, to adapt with your own numbers (the package counts must equal the Task 0 baselines, web 232 files and 2015 tests; `$H` is the head before this commit and the SAD result replaces "pending" once the sign-off has run):

```bash
D=$(date +%F)
H=$(git rev-parse --short HEAD)
cat >> docs/activity-log.md <<LOG
- Gates ($D, cloud container, head $H): lint, typecheck and tests pass with config 19, shared 665, imports 94, api 2610 passed and 21 skipped, web 232 files and 2015 tests (five new test files, no new row), sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB, against the Task 0 build three beneficiary routes are 1 kB bigger and none is more, against the Task 4 build none differs; SAD sign-off pending; replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: the developer asked for one pull request after every slice is implemented.
LOG
git add docs/activity-log.md
git commit -m "docs: record modularization S4c release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline "$(cat .tmp/s4c/base-sha)"..HEAD | wc -l
```

Expected: one file, one line added, and eight commits on the slice branch since the base (the plan commit, the five code commits, the records and this one):

```
[<branch> <sha>] docs: record modularization S4c release gate results
 1 file changed, 1 insertion(+)
8
```

- [ ] **Step 6: Hand off, no pull request**

Do not push and do not open a pull request: the developer asked for one pull request into `dev` after every slice is implemented (ruling 12), so S4c stays on its branch stacked on S4b's and the controller pushes it at task-pair boundaries. Report the branch tip, the commit list (`git log --oneline "$(cat .tmp/s4c/base-sha)"..HEAD`), the Task 0 baselines and the Task 6 results, and name what stays pending: the database replay (CI), seeds, `pnpm dev:local`, e2e, the browser smoke and the SAD sign-off.

---
