# W2 Tooling Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the codebase modularization with no change to any request, response, permission decision, migration, seed content or screen: move the last two modules out of `lib/services` and scan the `pathways-client.ts` shell, declare the path aliases in one place, split `scripts/docs/check.py` into a package of one module per check with unit tests, and split the four test files above 800 lines that no earlier slice divides. The per-domain seed data splits are not part of this plan: they need a seed run on a local database, which the cloud container cannot run, so the developer does that work and the change record says so (ruling 1).

**Architecture:** W2 continues the method of W1: every move is proven by script, not by reading. The two `lib/services` modules move with the W1 mover (`move-paths.mjs`) and a rule file that also rewrites the `@/lib/services/...` specifiers. The Vitest alias lists are replaced by a twenty line helper that reads the `paths` of the tsconfig files, with a node test per config and mutation proofs. `check.py` is split by a Python `ast` splitter that moves every statement unchanged, and the proof is a line multiset (`lost 0`) and the byte-identical output of the old and the new tool on 14 command lines and 39 injected faults, followed by unit tests that make the nine checks testable one at a time. The large tests are split by a TypeScript compiler API splitter that cuts on statements, keeps every statement unchanged, moves the shared fixtures and module mocks to a `.harness` module that every test file imports first, and is proven by `same-lines` (`lost 0`), by the full test titles (`lost 0`, `added 0`) and by a mutation of each harness. Task 0 recounts what the slices below changed; Task 1 moves the residue; Task 2 puts the aliases in one place; Tasks 3 and 4 split `check.py` and test it; Tasks 5 and 6 split the large tests; Task 7 records the slice; Task 8 runs the release gates.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9 (compiler API for the splitter), NestJS and Prisma 6.19.2 (api), Next 15.5.14 (web), Vitest 3.2, Node test runner (`node --test`, Node 22), Python 3 `unittest` and `ast`, Biome 1.9.4.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 W2 row and 9, including the "Deferred to W2" line of the W1 disposition) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-17 for the test file layout, MOD-21 for the seed data part that is left to the developer). The W1 plan (`docs/superpowers/plans/*-modularization-w1-tooling-docs.md`) holds the helper scripts that Task 0 extracts and the W2 outline this plan implements.

## Rulings

Controller rulings for W2. Each was checked in the replay from the W1 tip; Task 0 recounts them. Each ruling states its cost if wrong.

1. **Scope: the W1 roadmap row without the seed data.** W1 left five things to W2 (change record section 9): the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split, the per-domain seed data splits, and (W1 ruling 7) the splits of the test files above 600 lines. This plan takes all of them except the seed data. Splitting `local-demo-data.ts` and the `main()` of `hosted-realistic-seed.ts` changes no seed content, but its only real proof is a seed run on a local database with a row count and a checksum per table before and after, and the cloud container cannot run one. The developer does the seed data work on a machine with the local database; Task 7 records that and the proof recipe in section 9, and no seed file changes in W2. Of the test files above 600 lines, W2 splits the four above 800 lines that no earlier slice divides and lists the rest in section 9 (ruling 6). The plan has nine tasks (Task 0 to Task 8) and eleven commits. Cost if wrong: one more slice, which stops at the missing database.
2. **Facts of the slices below are recounted, not assumed.** The replay of this plan was made on the W1 tip `cc407f21` (the S8b tip `61ef8c5d` plus W1), the tree that W2 runs on. What can still differ on the real run, and so what Task 0 Step 5 recounts: the files of `lib/services`, the importers of the two moved modules, the result of the shell scan, the baseline test counts, the test files above 600 lines, the line numbers and titles that the split specs name (a spec stops with the title it did not find), the route table and the Middleware size, and the number of SAD notes. A different value is recorded and carried on, except that a missing path, or a mismatch that the Expected text of a step names as a stop, is reported as NEEDS_CONTEXT. Cost if wrong: a stop on a count.
3. **The two `lib/services` modules go to `lib/api/core`, and the shell is scanned, not retired.** `source-mutation.ts` (the cache of write receipts and the invalidation subscription) is already imported by `lib/api/core/request.ts`, and `authorized-read-events.ts` (the denial and write events the request layer announces) is imported by the request layer and by its other importers (24 files with the two modules at the W1 tip); both belong beside `request.ts`. The move is a rename with importers rewritten by the W1 mover, whose rule file also carries the two `@/lib/services/...` alias literals. CR section 9 asked for the scan that decides whether the `pathways-client.ts` shell can go: `shell-scan.mjs` lists, for the names that production code still takes from the shell, the files that use them, and prints `keep` or `retire-ready`. Retiring the shell would also delete the `vi.mock('@/lib/services/pathways-client', ...)` factory of every test file that names it (39 at the W1 tip), a per-test review; at the W1 tip the shell has 66 lines and one export, `recoverSourceMutation`, so the scan prints `keep` with that one name; W2 records the verdict and the remaining names, and the retirement is left to the slice that removes the last member. Cost if wrong: the shell stays one slice longer.
4. **Path aliases: the tsconfig `paths` are the one declaration, and the Vitest configs read them.** `tsc`, `nest build` (`tsconfig-paths`) and Next read the `paths` of `apps/api/tsconfig.json`, `apps/web/tsconfig.json` and `packages/imports/tsconfig.json`; the three Vitest configs repeated them by hand and had drifted (the api list lacked the wildcard package entries). `scripts/tsconfig-aliases.mjs` (about twenty lines, no dependency) turns the `paths` of one tsconfig into Vite `resolve.alias` entries, longest prefix first, and refuses a pattern with two targets. The W1 outline put the helper in `packages/config`; it is a script instead, because the `tooling` CI job installs nothing and the node test must run there, and because `packages/imports` has no dependency on `packages/config`. The app tsconfigs still repeat the package entries of `tsconfig.base.json` (TypeScript replaces `paths`, it does not merge them), and a test proves the repeats equal the base. `vite-tsconfig-paths` is not used (the repository rule is no external library unless necessary). Cost if wrong: a helper moved into a package.
5. **`check.py` keeps its command, options, output and exit codes; its modules are one per check.** `pnpm docs:check` is `python scripts/docs/check.py docs` in `package.json`, in `docs/build-pathways.md` and in the generated `AGENTS.md`, so `scripts/docs/check.py` stays the entry point (the roadmap says `docs/check.py`; the file is in `scripts/docs`). The ten modules are `common` (root, table parser, docs folder discovery) and `agents`, `voice`, `scrutiny`, `inception`, `trace`, `coverage`, `currency`, `filing` and `project_specific`. Three helpers lose their leading underscore because modules now import them. The proof is the splitter itself (it refuses a statement it cannot place), `lost 0` on the line multiset, and the byte-identical output of the old file and the new one on the real docs and on 39 faults (Task 3); the unit tests of Task 4 are new and carry their own mutation proof. Cost if wrong: a helper name or a module boundary.
6. **Large tests: the four above 800 lines that no earlier slice splits.** CR 3.5 splits tests above about 600 lines by concern. The W1 tip has 15 test files above 600 lines, five of them above 800 lines; W2 splits `supabase-auth.guard.test.ts`, `imports.service.test.ts`, `reports.service.test.ts` and `activity-proof-dialog.test.tsx` (each has one large shared fixture block, which is why it grew). It does not split `pathways-client.test.ts` (the fifth file above 800 lines; it tests the shell of ruling 3) or the files between 600 and 800 lines, which Task 7 lists in section 9; S7d already split the analytics dashboard test. The split keeps every statement of the original: the shared fixtures and the module mocks move to `<file>.harness.ts` (`.tsx` when it holds JSX), the hooks of the divided `describe` become a harness function, and each test file imports the harness first when the harness holds `vi.mock` calls, with Biome's import sorting switched off in that file by a comment (sorting puts relative imports last and the mocks would register after the modules they replace). A `vi.hoisted` variable is exported by name, because Vitest refuses an exported hoisted declaration. Cost if wrong: one more split, or a split file that a later slice has to rejoin.
7. **Every move and split is proven by script; every new test carries a mutation proof.** Lines: `same-lines.mjs` (`lost 0`, run before Biome re-wraps). Titles: `test-titles.mjs` (`lost 0`, `added 0`, duplicates counted). New tests (`tsconfig-aliases.test.mjs`, `test_checks.py`): `mutate.py` applies one text mutation at a time and requires the test run to fail (8 and 16 mutations). The harnesses: one mutation each of a line a test depends on. Cost if wrong: a vacuous test, which is the failure the proofs exist to catch.
8. **The living docs follow by script, the history files keep their paths.** The Task 1 mover rewrites living files (runbooks, QAD, SAD, READMEs, `docs/build-pathways.md`); the change record, the audits, the activity log, the handoff and superpowers documents keep the paths they were written with, and Task 7 edits the lines of the change record that describe the web layout (section 3.3) by hand. The scan that proves "no stale reference" skips the same history list and nothing else. Cost if wrong: a stale path in a living doc, which the scan prints.
9. **SAD routing and the CI job.** The new paths (`scripts/tsconfig-aliases.*`, `scripts/docs/checks/`, `scripts/docs/test_checks.py`, the harness and test files) fall under routes that already exist (`scripts/**`, `apps/api/**`, `apps/web/**`); Task 8 runs `sad:check` over the whole range and requires no `BLOCKED` evaluation. The `tooling` job keeps its name (a renamed job is a renamed required check) and gains one step for the documentation check tests; the alias test runs through the existing `test:scripts` step. Cost if wrong: one route or one step.
10. **No pull request, and what runs where.** W2 opens no pull request itself; the controller opens the part 3 stacked pull request into `dev` after the W2 gates (the three stacked pull requests are the S slices, W1 and W2); the slice pushes nothing, merges nothing into `dev` and removes no plan copy. The static gates run in the cloud container (lint, typecheck, tests, docs check, `nest build`, the web build, the SAD check, the tooling tests). The database replay is the gate of the part 3 pull request in CI. Seeds, dev servers, e2e and the browser smoke are a pending local run (Task 8). W2 runs no Pester file and changes none (Pester 5 cannot be installed in the cloud container); the two replay helper files stay a pending local run of W1 and run in the `tooling` job in CI. Builds never use the root `pnpm build`, which runs `prisma generate`. Cost if wrong: none.

## Interfaces assumed from earlier sub-projects

- W1: its last commit, `docs: record the W1 gates`, is an ancestor of HEAD (Task 0 Step 1 finds the W1 tip by that message, not by a branch name, and checks files only W1 creates); the `.harness` suffix and the `*.harness.ts` exclusion of `apps/api/tsconfig.build.json` (W1 Task 2); the `tooling` job and `test:scripts` (W1 Task 6); the helper scripts that Task 0 Step 2 extracts from the W1 plan.
- S8b: `core-feature-client.ts` is gone, which only S8b does (Task 0 Step 1); `lib/services` holds no client except the `pathways-client.ts` shell and the files that Task 1 moves (Task 0 Step 5 lists it).
- S7d: `analytics-dashboard.test.tsx` is split there; it is not a W2 split.
- S4b: `lib/api/core/request.ts` imports `ensureSourceInvalidationSubscription` from `lib/services/source-mutation`, which Task 1 rewrites.
- F1: the SAD checker routes by `path` and by `oldPath` of a rename, which the move relies on.

## Produces (names later plans consume)

- `apps/web/src/lib/api/core/source-mutation.ts`, `source-mutation.test.ts` and `authorized-read-events.ts`; `lib/services` without them.
- `scripts/tsconfig-aliases.mjs` and its test (in `test:scripts`); the three Vitest configs without hand-written aliases.
- `scripts/docs/check.py` (entry point), `scripts/docs/checks/` (ten modules) and `scripts/docs/test_checks.py` (a step of the `tooling` job).
- The harnesses `supabase-auth.guard.harness.ts`, `imports.service.harness.ts`, `reports.service.harness.ts` and `activity-proof-dialog.harness.tsx` with their test files; the `.harness` suffix for the web (CR 3.5).
- The gitignored tools `.tmp/w2/{split-test,shell-scan,mutate,split-check,fill-records}` (reusable): `split-test.mjs` splits any further large test file from a spec.
- The change record section 9 paragraph for W2, which lists the test files above 600 lines that remain and states that the seed data splits are the developer's.

## Global Constraints

- Behavior-preserving: no request, response, permission, audit row, migration or seed content changes. A moved file's content changes only in a path, a specifier or a quoted string (`moved-report.mjs` proves it). Production code stays free of new dependencies; the test and tooling files use Node, Python and Vitest built-ins only.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit.
- File moves use `git mv` (the mover does it); every move and split is proven by script: `lost 0` lines, `lost 0` and `added 0` test titles, a rename in the index, and no stale reference by a scan of every tracked and untracked file that is not history.
- Kebab-case file names that describe purpose; markdown names are kebab-case; comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any file; the tests and fixtures use fictional values only.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` (or `git add`) before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/w2/trim-imports.mjs <file>` after removing code and `bash .tmp/w2/unused.sh <name>` (api and web `tsc --noEmit --noUnusedLocals`) in Tasks 0 and 8: the diagnostics must equal the baseline of Task 0.
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Bash blocks share no shell state: each block starts with what it needs. Write the scripts and test files with the Write tool (or the `Create` blocks as printed), not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions. One-off scripts live in `.tmp/w2/` (gitignored) and are never committed; the committed new files are `scripts/tsconfig-aliases.mjs`, `scripts/tsconfig-aliases.test.mjs` and `scripts/docs/test_checks.py`, the `scripts/docs/checks` package and the harness and test files of the splits.
- Do not run `pnpm install`, do not run `git checkout dev`, and never run the root `pnpm build` or `prisma generate`; the dependencies are installed in the cloud container. The container sets `pnpm_config_verify_deps_before_run=false`; where a shell lacks it, `export` it before the first `pnpm` command of a block. Do not kill processes you did not start.
- Known flakes: the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`, web `activity-form-dialog.draft.test.tsx`, web `collection-workspace` timeouts under load (import-preview, import-upload), api `imports.service` tests (duplicate metadata keys; `imports.service.*.test.ts` after Task 5) and one `pnpm sad:test` case under load. Rerun such a file alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the counts that ruling 2 says are recounted.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>` and `<date>` for values that differ per run and `<n>` for the absolute Middleware size (102 kB or 103 kB by checkout); a commit line names the real branch; every other figure is the replay of this plan from the W1 tip `cc407f21`; a figure that ruling 2 names as recounted may differ, any other difference is a stop. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are stated as deltas from the baselines `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web` and `B_sad` of Task 0 Step 3: no task adds or removes a vitest test (the splits keep every title), so every later vitest count equals its baseline; the node test count rises by the 11 alias tests and the Python docs tests are new (39).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg`. Commits use `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit`.
- Work in the repository root on `claude/modularization-s8b-xjnlzt`, the branch W1 ended on (this cloud session can push only that name, so W1 and W2 both stack on it; Task 0 Step 1 finds the W1 tip by its commit message); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch; nobody pushes `dev` or `master`. Do not touch migrations, `.env` files or review evidence.
- W2 opens no pull request itself; the controller opens the part 3 stacked pull request into `dev` after the W2 gates. The slice merges nothing into `dev` or `master`. No plan copy is removed in this slice: the executed plan copies of the earlier slices stay listed in `docs/superpowers/plans` until the controller removes them after the final merge.

## Review Focus

1. The `lib/services` move must be a pure rename in the index (Task 1 prints the rename count and the report of changed code lines; a line that differs outside a path, a quoted string or a comment is listed as `unexplained`), and the shell scan must be recorded with its remaining names.
2. The alias helper must agree with the TypeScript resolution rule for every config and sample (Task 2 test), and the three Vitest configs must contain no hand-written alias (the config guards, and the mutation that puts one back).
3. The `check.py` split must lose no line (Task 3 `lost 0`) and change no output (14 command lines and 39 faults byte-identical, and every fault changes the output, so none is vacuous).
4. Every split must keep every line and every test title (Tasks 5 and 6: `lost 0`, `lost 0` and `added 0`), the mocks must still register (the harness is imported first; the harness mutations are caught), the harnesses must not reach the production builds (`nest build` file list, the web route table), and the full suites must keep their baseline counts.
5. Every new test must have caught its mutations (Task 2: 8, Task 4: 16, Tasks 5 and 6: one per harness).
6. The records must say that the seed data splits are not done and are the developer's, and must list the test files above 600 lines that remain (Task 7).

## File map

| Path | Role after W2 |
|---|---|
| `apps/web/src/lib/api/core/{source-mutation.ts,source-mutation.test.ts,authorized-read-events.ts}` | moved from `lib/services` (Task 1) |
| `scripts/tsconfig-aliases.mjs`, `scripts/tsconfig-aliases.test.mjs` | the alias helper and its test (Task 2) |
| `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/imports/vitest.config.ts` | aliases read from the tsconfig paths (Task 2) |
| `package.json` | `test:scripts` includes the alias test (Task 2) |
| `scripts/docs/check.py`, `scripts/docs/checks/*.py` | entry point and ten check modules (Task 3) |
| `scripts/docs/test_checks.py`, `.github/workflows/ci.yml` | unit tests and the `tooling` step (Task 4) |
| `apps/api/src/modules/auth/guards/supabase-auth.guard.{harness,http-boundary.test,step-up.test,step-up-pin.test}.ts` | the split auth guard test (Task 5) |
| `apps/api/src/modules/imports/imports.service.{harness,upload-mapping.test,validation.test,processing.test}.ts` | the split imports service test (Task 5) |
| `apps/api/src/modules/reports/reports.service.{harness,source-artifacts.test,evaluation-kinds.test,sections.test}.ts` | the split reports service test (Task 5) |
| `apps/web/src/features/projects/activities/components/activity-proof-dialog.{harness.tsx,upload-flow.test.tsx,failure-recovery.test.tsx,reach-and-finalize.test.tsx,progress-suggestion.test.tsx}` | the split dialog test (Task 6) |
| `docs/` change record, audit, QAD, index, activity log | records (Tasks 7 and 8) |



---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-w2-tooling-follow-up.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/w2/base-sha`, the twelve helper scripts of W1 (extracted from the W1 plan), `extract-tools.mjs`, `build-routes.sh`, `compare-routes.mjs`

- [ ] **Step 1: Confirm the stacked branch holds W1 and nothing of W2**

The S8b marker is the deletion of `apps/web/src/lib/services/core-feature-client.ts`, which S8b does after moving the publication and audit clients to `lib/api`. The base sha is written first, because every later proof compares with it (it is the staging commit of this plan, on top of the W1 tip). W1 ran on `claude/modularization-s8b-xjnlzt`, so the W1 tip is found by its commit message, `docs: record the W1 gates`, and not by a branch name; the block also prints the number of commits above it (the staging commit).

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p .tmp/w2
git rev-parse HEAD > .tmp/w2/base-sha
git status --short
git branch --show-current
W1=$(git log -n 1 --format=%H --grep='^docs: record the W1 gates')
test -n "$W1" && echo "W1 gates commit $(git log -n 1 --format=%h "$W1") is an ancestor of HEAD"
echo "commits above the W1 tip: $(git rev-list --count "$W1..HEAD")"
test ! -f apps/web/src/lib/services/core-feature-client.ts && echo "S8b present"
test -f scripts/db/hosted/build.mjs && test -d infra/supabase/replay && test -d apps/api/prisma/seeds && echo "W1 present"
test -f $(git ls-files apps/api/src | grep "analytics.service.harness.ts$") && echo "W1 harness present"
test -f scripts/docs/check.py && test -f apps/web/src/lib/services/source-mutation.ts && test -f apps/web/src/lib/services/authorized-read-events.ts && echo "W2 sources present"
test ! -d scripts/docs/checks && test ! -f scripts/tsconfig-aliases.mjs && echo "W2 not applied"
ls docs/superpowers/plans | wc -l
```

Expected: `git status --short` prints nothing, then the branch, the W1 tip, the one staging commit above it, the marker lines and the plan count:

```
claude/modularization-s8b-xjnlzt
W1 gates commit <sha> is an ancestor of HEAD
commits above the W1 tip: 1
S8b present
W1 present
W1 harness present
W2 sources present
W2 not applied
17
```

A missing line means the branch lacks W1 or a W2 source: stop and report NEEDS_CONTEXT. `W2 not applied` must print, or W2 has run before. A count other than 1 above the W1 tip means something else was committed after the staging commit: read `git log --oneline "$W1..HEAD"` before going on. The last figure counts the plan copies in `docs/superpowers/plans` (the executed copies of the earlier slices and of W1) and may differ.

- [ ] **Step 2: Create the helper scripts**

The twelve helper scripts of W1 (`replace-exact.mjs`, `trim-imports.mjs`, `drop-unused.mjs`, `test-titles.mjs`, `same-lines.mjs`, `history-paths.mjs`, `path-pairs.mjs`, `move-paths.mjs`, `moved-report.mjs`, `stale-paths.mjs`, `suite.sh`, `unused.sh`) are gitignored and live in `.tmp/w1` of the checkout that ran W1 (a fresh clone has none). `extract-tools.mjs` writes them to `.tmp/w2` from `.tmp/w1` when it exists and otherwise from the `Create` blocks of the W1 plan, which is in the repository; the path `.tmp/w1` inside them becomes `.tmp/w2`. Create each file below with the Write tool exactly as printed.

Create `.tmp/w2/extract-tools.mjs`:

```js
// Writes the W1 helper scripts into .tmp/w2, from .tmp/w1 when it exists and otherwise from the "Create" blocks of the W1 plan.
// Usage: node .tmp/w2/extract-tools.mjs <W1 plan file>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const names = [
  'replace-exact.mjs',
  'trim-imports.mjs',
  'drop-unused.mjs',
  'test-titles.mjs',
  'same-lines.mjs',
  'history-paths.mjs',
  'path-pairs.mjs',
  'move-paths.mjs',
  'moved-report.mjs',
  'stale-paths.mjs',
  'suite.sh',
  'unused.sh',
]
const lines = readFileSync(process.argv[2], 'utf8').split('\n')

// The fenced block that follows the last "Create `.tmp/w1/<name>`:" line of a run of such lines.
const fromPlan = (name) => {
  const mark = lines.map((line, index) => (line === `Create \`.tmp/w1/${name}\`:` ? index : -1)).filter((index) => index >= 0)
  if (!mark.length) throw new Error(`${name}: no Create block in the plan`)
  let at = mark.at(-1)
  while (!lines[at].startsWith('```')) at++
  const body = []
  for (at++; lines[at] !== '```'; at++) body.push(lines[at])
  return `${body.join('\n')}\n`
}
mkdirSync('.tmp/w2', { recursive: true })
for (const name of names) {
  const old = `.tmp/w1/${name}`
  const text = (existsSync(old) ? readFileSync(old, 'utf8') : fromPlan(name)).replaceAll('.tmp/w1', '.tmp/w2')
  writeFileSync(`.tmp/w2/${name}`, text)
}
console.log(`${names.length} helper scripts in .tmp/w2`)
```

Create `.tmp/w2/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/w2/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/w2/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/w2/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/w2/routes-$1.txt
grep Middleware .tmp/w2/routes-$1.txt
git checkout -- apps/web/next-env.d.ts
```

Create `.tmp/w2/compare-routes.mjs`:

```js
// Prints the routes whose First Load JS differs between two saved next build route tables, and counts those that differ by more than the tolerance in kB.
import { readFileSync } from 'node:fs'

const [before, after, tolerance = '0'] = process.argv.slice(2)
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
let over = 0
for (const [route, kb] of now) {
  const old = was.get(route)
  if (old === undefined) {
    over++
    console.log(`${route}: new at ${kb} kB`)
  }
  else if (old !== kb) {
    if (Math.abs(kb - old) > Number(tolerance)) over++
    console.log(`${route}: ${old} kB -> ${kb} kB (${kb > old ? '+' : ''}${(kb - old).toFixed(1)})`)
  }
}
for (const route of was.keys()) {
  if (!now.has(route)) {
    over++
    console.log(`${route}: removed`)
  }
}
console.log(`routes ${now.size}, over ${tolerance} kB ${over}`)
```

```bash
node .tmp/w2/extract-tools.mjs "$(ls docs/superpowers/plans/*-modularization-w1-tooling-docs.md | head -n 1)"
chmod +x .tmp/w2/*.sh
ls .tmp/w2/*.mjs .tmp/w2/*.sh | wc -l
grep -l "\.tmp/w1" .tmp/w2/*.mjs .tmp/w2/*.sh | grep -v extract-tools
for f in .tmp/w2/*.mjs; do node --check "$f" || echo "syntax error in $f"; done; echo "scripts checked"
```

Expected: the extractor writes the twelve helper scripts, fifteen scripts are in `.tmp/w2` (the twelve, the extractor, `build-routes.sh` and `compare-routes.mjs`), no script still names `.tmp/w1`, and every `.mjs` passes the syntax check:

```
12 helper scripts in .tmp/w2
15
scripts checked
```

The `grep` prints nothing when no script still names `.tmp/w1` (the extractor itself does, and is left out), and every `.mjs` file passes a syntax check.

- [ ] **Step 3: Record the baselines**

Record the figures as `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web` and `B_sad`; every later Expected states a delta from them. Run each block with a ten minute timeout. The builds are the package builds, `nest build` and the web build, never the root `pnpm build` (it runs `prisma generate`).

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
bash .tmp/w2/suite.sh base
pnpm docs:check 2>&1 | tail -3
git status --short
```

Expected: the figures of the replay from the W1 tip, to be written down as the baselines. Lint reports no fixes, typecheck prints `Done` for config, shared, imports, web and api, and the summaries are:

```
$ pnpm exec biome check .
Checked 1633 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
exit 0
apps/api test:  Test Files  166 passed | 10 skipped (176)
apps/api test:       Tests  2642 passed | 21 skipped (2663)
apps/web test:  Test Files  307 passed (307)
apps/web test:       Tests  3478 passed (3478)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
packages/shared test:  Test Files  54 passed (54)
packages/shared test:       Tests  885 passed (885)
      Tests  59 passed (59)
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
```

The `Tests` line without a package prefix is `sad:test` (`B_sad`). `docs:check` ends with `0 failure(s), 0 warning(s)` and exits 0 (dev's fix 34162c12 cleared the old failures), so any failure is a stop. The package lines are `B_config`, `B_shared`, `B_imports`, `B_api` and `B_web`; the five `typecheck: Done` lines and the package lines are sorted by `sort`, so they come in the same order on every run. `git status --short` prints nothing. The suite takes about six minutes (377 s in the replay).

```bash
bash .tmp/w2/unused.sh base
```

Expected: the unused-local diagnostics of the baseline (record them: Task 8 compares with them, and W2 changes none):

```
api: prisma/seeds/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 3
```

W2 changes none of these lines; Task 8 compares with whatever this run prints.

The production builds are the baseline for the harness exclusion of Task 5, for the Middleware size and for the route table (the web build takes about three minutes, `nest build` about one):

```bash
pnpm --filter "@pathways/api^..." run build > .tmp/w2/packages-build.log 2>&1; echo "packages build exit $?"
bash .tmp/w2/build-routes.sh base
grep -a Middleware .tmp/w2/routes-base.txt > .tmp/w2/middleware-base.txt
grep -c "^[┌├└] " .tmp/w2/routes-base.txt
pnpm --filter @pathways/api exec nest build > .tmp/w2/api-build-base.log 2>&1; echo "nest build exit $?"
find apps/api/dist -name '*.js' | grep -c "prisma/"
find apps/api/dist -name '*.js' | grep -c "harness"
git status --short
```

Expected: the build succeeds and the baselines for Tasks 5, 6 and 8 are the packages build, the Middleware size (saved as `middleware-base.txt`; the size depends on the checkout, and Tasks 6 and 8 compare it byte for byte), the number of route lines (72), `nest build exit 0`, the compiled files under `prisma/` in `apps/api/dist` (44) and the compiled harness files (0):

```
packages build exit 0
exit 0
ƒ Middleware                                                      <n> kB
72
nest build exit 0
44
0
```

The route count (72) and the `prisma/` count (44) are those of the W1 tip; the harness count must be 0, since no `.harness.ts` exists yet beyond the analytics one, which the build config excludes.

- [ ] **Step 4: Run the tooling tests that W2 extends**

The `tooling` job of W1 runs the node tests (`npm run test:scripts`) and the Python migration checks; W2 adds tests to the first and a new Python test file beside the second.

```bash
npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -3
git status --short
```

Expected: the node tests are 188 (174 pass, 14 skipped by their environment gate) and the Python migration tests are 13:

```
# tests 188
# pass 174
# fail 0
# skipped 14
Ran 13 tests in <ms>

OK
```

The counts are those of the W1 tip; Task 2 adds 11 node tests and Task 4 adds 39 Python tests in a new file.

- [ ] **Step 5: Recount what the slices below this one move**

S7a to S8b and W1 moved web, api and shared files, so these figures are recounted, not fixed: a different value is recorded and carried on unless the Expected text says to stop. The lists W2 works from are the files of `lib/services` (Task 1), the scan of `pathways-client.ts` (Task 1), the alias declarations (Task 2), the size of `scripts/docs/check.py` (Task 3) and the test files above 600 lines (Tasks 5 and 6).

```bash
ls apps/web/src/lib/services
wc -l scripts/docs/check.py apps/web/src/lib/services/pathways-client.ts
git grep -c -E "services/(source-mutation|authorized-read-events)" -- apps | awk -F: '{n+=$2; f++} END {print "importers of the two files: " f " files, " n " lines"}'
git grep -n -E "^\s+\"@[a-z/*]+\":" -- tsconfig.base.json apps/api/tsconfig.json apps/web/tsconfig.json packages/imports/tsconfig.json | sed 's/^\([^:]*\):[0-9]*:\s*/\1 /' | cut -c1-110
git grep -n -E "alias|resolve:" -- '*vitest.config.ts' | cut -c1-110
git ls-files | grep -E '\.test\.tsx?$' | xargs wc -l | awk '$1>600 && $2!="total"' | sort -rn
git ls-files | grep -E "\.test\.tsx?$" | xargs wc -l | awk '$1>800 && $2!="total"' | wc -l
git grep -n "W2" -- docs/cr-pathways-codebase-modularization.md docs/activity-log.md docs/audit-pathways-codebase-modularity-20261009.md | cut -c1-110
git hash-object package.json .github/workflows/ci.yml scripts/docs/check.py apps/api/vitest.config.ts apps/web/vitest.config.ts packages/imports/vitest.config.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/authorized-read-events.ts | cut -c1-8
```

Expected: the recount, in this order: the files of `lib/services`, the sizes of `check.py` and the shell, the importers of the two modules, the tsconfig path declarations (seven in the api, seven in the web, two in imports, six in the base), the Vitest alias blocks, the test files above 600 lines (15, of which 5 are above 800), the lines that name W2 (9) and eight hashes:

```
authorized-read-events.ts
pathways-client.project-data.test.ts
pathways-client.test.ts
pathways-client.ts
source-mutation.test.ts
source-mutation.ts
 1060 scripts/docs/check.py
   66 apps/web/src/lib/services/pathways-client.ts
 1126 total
importers of the two files: 24 files, 26 lines
apps/api/tsconfig.json "@app/*": ["src/*"],
apps/api/tsconfig.json "@pathways/shared": ["../../packages/shared/src/index.ts"],
apps/api/tsconfig.json "@pathways/shared/*": ["../../packages/shared/src/*"],
apps/api/tsconfig.json "@pathways/config": ["../../packages/config/src/index.ts"],
apps/api/tsconfig.json "@pathways/config/*": ["../../packages/config/src/*"],
apps/api/tsconfig.json "@pathways/imports": ["../../packages/imports/src/index.ts"],
apps/api/tsconfig.json "@pathways/imports/*": ["../../packages/imports/src/*"]
apps/web/tsconfig.json "@/*": ["src/*"],
apps/web/tsconfig.json "@pathways/shared": ["../../packages/shared/src/index.ts"],
apps/web/tsconfig.json "@pathways/shared/*": ["../../packages/shared/src/*"],
apps/web/tsconfig.json "@pathways/config": ["../../packages/config/src/index.ts"],
apps/web/tsconfig.json "@pathways/config/*": ["../../packages/config/src/*"],
apps/web/tsconfig.json "@pathways/imports": ["../../packages/imports/src/index.ts"],
apps/web/tsconfig.json "@pathways/imports/*": ["../../packages/imports/src/*"]
packages/imports/tsconfig.json "@pathways/shared": ["../shared/src/index.ts"],
packages/imports/tsconfig.json "@pathways/shared/*": ["../shared/src/*"]
tsconfig.base.json "@pathways/shared": ["packages/shared/src/index.ts"],
tsconfig.base.json "@pathways/shared/*": ["packages/shared/src/*"],
tsconfig.base.json "@pathways/config": ["packages/config/src/index.ts"],
tsconfig.base.json "@pathways/config/*": ["packages/config/src/*"],
tsconfig.base.json "@pathways/imports": ["packages/imports/src/index.ts"],
tsconfig.base.json "@pathways/imports/*": ["packages/imports/src/*"]
apps/api/vitest.config.ts:6:  resolve: {
apps/api/vitest.config.ts:7:    alias: {
apps/web/vitest.config.ts:7:  resolve: {
apps/web/vitest.config.ts:8:    alias: {
packages/imports/vitest.config.ts:8:  resolve: {
packages/imports/vitest.config.ts:9:    alias: [
   1365 apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
   1343 apps/web/src/lib/services/pathways-client.test.ts
   1140 apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
    861 apps/api/src/modules/imports/imports.service.test.ts
    836 apps/api/src/modules/reports/reports.service.test.ts
    775 apps/web/src/features/projects/activities/components/activity-detail-content.test.tsx
    768 apps/api/src/modules/activities/activities.access.test.ts
    740 apps/api/src/modules/core-foundation.test.ts
    690 apps/api/src/modules/activities/activity-proof-media.test.ts
    648 apps/api/src/modules/imports/imports.chunked-promotion.test.ts
    648 apps/api/prisma/seeds/local-demo-data.test.ts
    636 apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts
    621 apps/web/src/features/rules/components/rule-drawer.test.tsx
    620 apps/web/src/features/collection/forms/components/collection-workspace.import-upload.test.tsx
    608 apps/api/src/modules/indicators/indicators.service.test.ts
5
docs/activity-log.md:869:- Review fixes: the final review asked for the report route wording, the PRD G-F12-1 
docs/activity-log.md:984:- Task 7: the change record (section 3.5 `.harness`, section 3.7 W1 and W2 rows, sect
docs/activity-log.md:986:- Deferred to W2: the `lib/services` residue, path aliases in one place, the `scripts
docs/activity-log.md:987:- Gates (<date>, cloud container, head <sha>): lint, typecheck and tests pass 
docs/cr-pathways-codebase-modularization.md:146:| W1 | Tooling and docs | `scripts/db/{local,hosted,defense}`,
docs/cr-pathways-codebase-modularization.md:147:| W2 | Tooling follow-up | the `lib/services` residue, path al
docs/cr-pathways-codebase-modularization.md:460:- Left as test debt: the copy and display states of the two wo
docs/cr-pathways-codebase-modularization.md:548:- Decisions: W1 split into W1 and W2 (ruling 1); the seeds are
docs/cr-pathways-codebase-modularization.md:550:Deferred to W2: `authorized-read-events.ts` and `source-mutati
7676de1f
5a1f5961
0cd1e933
60e6c4f2
1ef4969d
2197b330
80323e75
0dcba35f
```

At the W1 tip `lib/services` holds six files (the two modules, the moved test, the shell and its two tests), 24 files import the two modules, `pathways-client.ts` has 66 lines and the list above 600 lines has 15 files; W2 splits the four above 800 lines that no earlier slice splits (the fifth, `pathways-client.test.ts`, tests the shell). The tsconfig and Vitest lines must match, or Task 2 stops at its first replacement.

A different count is recorded and carried on (ruling 2), except that a missing path stops the plan. The `W2` lines are the places that name W2 work (W1's roadmap row, its decisions, deferral and gates lines, and the review line that names the reports test as W2 debt): if one is not in the list above, an earlier slice deferred something new to W2, so print it with `git grep -n W2 -- docs` and report NEEDS_CONTEXT unless it names a path or test that Tasks 1 to 6 already change. The hashes are those of the replay; a different hash means a file changed since, so read the diff of that file before going on. The test files above 600 lines are the input of Tasks 5 and 6: the four files that W2 splits are the ones above 800 lines that no earlier slice splits (ruling 6); recount which those are, and add any new file above 800 lines that is not an S7d split to the section 9 list of Task 7.

- [ ] **Step 6: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-w2-tooling-follow-up.md docs/superpowers/plans/$(date +%F)-modularization-w2-tooling-follow-up.md`. The handoff copy and its index row stay. The executed plan copies of the earlier slices stay too: the controller removes all of them after the final merge, so W2 touches none.

In `docs/index.md` section 1.6, add one row after the last plan row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-w2-tooling-follow-up.md docs/superpowers/plans/$D-modularization-w2-tooling-follow-up.md
N=$(grep -n '(superpowers/plans/' docs/index.md | tail -1 | cut -d: -f1)
sed -i "${N}a | [W2 tooling follow-up plan](superpowers/plans/$D-modularization-w2-tooling-follow-up.md) | $D-modularization-w2-tooling-follow-up.md | $D | W2 of the codebase modularization: lib/services residue, path aliases in one place, check.py split, large test splits | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-120
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: add the W2 tooling follow-up plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --name-status --oneline HEAD | tail -3
```

Expected: one added row, the docs check at 0 failures and 0 warnings, and the commit:

```
+| [W2 tooling follow-up plan](superpowers/plans/<date>-modularization-w2-tooling-follow-up.md) | <date>-modular
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
<sha> docs: add the W2 tooling follow-up plan
M	docs/index.md
A	docs/superpowers/plans/<date>-modularization-w2-tooling-follow-up.md
```



---

### Task 1: The `lib/services` residue moves to `lib/api/core`

**Files:**
- Create (gitignored): `.tmp/w2/services-rules.json`, `services-moves.json` (written by the mover), `shell-scan.mjs`, `shell-scan.txt`
- Move: `apps/web/src/lib/services/authorized-read-events.ts`, `source-mutation.ts` and `source-mutation.test.ts` into `apps/web/src/lib/api/core/`
- Modify: every importer and mock of the three files (found by the mover), and the docs that name them

CR section 9 left these two modules in `lib/services` when S4b to S8b emptied the folder of clients: `source-mutation.ts` is the request layer's cache of write receipts (`lib/api/core/request.ts` already imports it and calls `ensureSourceInvalidationSubscription()`), and `authorized-read-events.ts` is the pair of window events that the request layer announces on a 401, a 403 and a committed write. Both belong beside `request.ts`. The move is a rename with import rewrites; the mover is the one of W1, with a rule file that also rewrites the `@/lib/services/...` specifiers, which the mover does not resolve by itself.

- [ ] **Step 1: Probe the importers before the move**

```bash
ls apps/web/src/lib/api/core
git grep -l -E "services/(source-mutation|authorized-read-events)" -- apps | wc -l
git grep -l -E "services/(source-mutation|authorized-read-events)" -- apps | grep -c -E "\.test\.tsx?$"
git grep -n -E "from '\./(source-mutation|authorized-read-events)'" -- apps/web/src/lib/services | cut -c1-120
git grep -n -E "(source-mutation|authorized-read-events)" -- apps/web/src ':!*.test.ts' ':!*.test.tsx' | grep -v "^apps/web/src/lib/services/\(source-mutation\|authorized-read-events\)" | grep -v -E "from '@/lib/services/(source-mutation|authorized-read-events)'" | cut -c1-140
```

Expected: the files of `lib/api/core`, the number of files that name the two modules (24) and how many of them are tests (10), the three lines of the shell, its test and the moved test that import them by a relative path, and the production lines that name them in another way:

```
artifact-download.owner.test.ts
artifact-download.test.ts
artifact-download.ts
guards.ts
owned-json-read.test.ts
owned-json-read.ts
request-owner.node.test.ts
request-owner.test.ts
request-owner.ts
request-ownership.test.ts
request.test.ts
request.ts
source-mutation-request.test.ts
source-mutation-request.ts
24
10
apps/web/src/lib/services/pathways-client.test.ts:3:import { sourceMutationTickets } from './source-mutation'
apps/web/src/lib/services/pathways-client.ts:5:} from './source-mutation'
apps/web/src/lib/services/source-mutation.test.ts:2:import { SourceMutationTickets, parseSourceMutationResult } from './
apps/web/src/features/projects/activities/components/activity-form-dialog.tsx:2:import { SourceMutationRecovery } from '../../components/sou
apps/web/src/features/projects/activities/components/activity-form-dialog.tsx:16:import { useSourceMutationContext } from '@/hooks/use-sourc
apps/web/src/features/projects/activities/components/activity-proof-review-dialog.tsx:2:import { SourceMutationRecovery } from '../../compon
apps/web/src/features/projects/activities/components/activity-proof-review-dialog.tsx:18:import { useSourceMutationContext } from '@/hooks/u
apps/web/src/features/projects/activities/components/activity-status-control.tsx:2:import { SourceMutationRecovery } from '../../components/
apps/web/src/features/projects/activities/components/activity-status-control.tsx:5:import { useSourceMutationContext } from '@/hooks/use-sou
apps/web/src/features/projects/components/project-setup-form.tsx:2:import { useSourceMutationContext } from '@/hooks/use-source-mutation-con
apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx:3:import { SourceMutationRecovery } from '../../compon
apps/web/src/features/projects/indicators/components/project-indicators-workspace.tsx:23:import { useSourceMutationContext } from '@/hooks/u
apps/web/src/features/projects/team/project-team-editor-dialog.tsx:2:import { SourceMutationRecovery } from '../components/source-mutation-r
apps/web/src/features/projects/team/project-team-editor-dialog.tsx:5:import { useSourceMutationContext } from '@/hooks/use-source-mutation-c
apps/web/src/hooks/use-source-mutation-context.ts:17:    'source-mutation',
apps/web/src/lib/api/activities.ts:6:import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
apps/web/src/lib/api/indicators.ts:15:import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
apps/web/src/lib/api/projects.ts:12:import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
apps/web/src/lib/services/pathways-client.ts:5:} from './source-mutation'
```

The importers are rewritten by the mover of Step 2; the lines naming `./source-mutation` are the shell and its test.

The names `source-mutation.ts`, `source-mutation.test.ts` and `authorized-read-events.ts` must be free in `lib/api/core` (the first listing). `source-mutation-request.ts` is a different module that stays. The last command lists the production lines that name either module without importing it by the alias (comments, relative imports): the mover rewrites relative specifiers and repo paths, and Step 2 proves that nothing stale is left.

- [ ] **Step 2: Create the rule file, move and prove**

The rule moves the three files; the two literals rewrite the alias specifiers of importers and of `vi.mock` calls (the boundary of the literal rewrite is a name character, so `source-mutation-request` is left alone). `relativeRoots` also rewrites paths written from `apps/web/`.

Create `.tmp/w2/services-rules.json`:

```json
{
  "move": [
    [
      "^apps/web/src/lib/services/(authorized-read-events|source-mutation)(\\.test)?\\.ts$",
      "apps/web/src/lib/api/core/$1$2.ts"
    ]
  ],
  "literals": [
    ["@/lib/services/authorized-read-events", "@/lib/api/core/authorized-read-events"],
    ["@/lib/services/source-mutation", "@/lib/api/core/source-mutation"]
  ],
  "relativeRoots": ["apps/web/"]
}
```

```bash
node .tmp/w2/move-paths.mjs .tmp/w2/services-rules.json .tmp/w2/services-moves.json | tee .tmp/w2/services-move.log
git add -A
node .tmp/w2/moved-report.mjs .tmp/w2/services-moves.json
node .tmp/w2/stale-paths.mjs .tmp/w2/services-rules.json .tmp/w2/services-moves.json
ls apps/web/src/lib/services
git diff --cached -M --stat | tail -1
git grep -c -E "lib/services/(source-mutation|authorized-read-events)" -- apps | wc -l
```

Expected: the mover counts (3 moves, 4 specifiers, 24 repo paths in 22 files, 0 unresolved), the report (`unexplained 0`), the scan (`stale 0`), the remaining files of `lib/services` and the stat; the last figure is the count of files that still name an old path (0):

```
moved 3 files, rewrote 4 specifiers, 24 repo paths and 0 file names in 22 files, 0 unresolved
moves 3, renames in the index 3, exact 3, rewritten 0, missing 0, unexplained 0
stale 0
pathways-client.project-data.test.ts
pathways-client.test.ts
pathways-client.ts
 29 files changed, 28 insertions(+), 28 deletions(-)
0
```

The mover counts are the replay's. `unexplained` lists a changed code line of a moved file that is not a path, a quoted string or a comment; the report must show `unexplained 0`.

- [ ] **Step 3: Format, typecheck and run the web tests**

```bash
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR | grep -E "\.(ts|tsx)$") 2>&1 | tail -2
git add -A
pnpm --filter @pathways/web typecheck > .tmp/w2/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w2/tc.log
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
git status --short | grep -v "^[RM] " | head
```

Expected: Biome fixes import order in the rewritten files, the typecheck is clean, and the web suite keeps its baseline tests:

```
Checked 29 files in <ms>. Fixed 11 files.
typecheck exit 0
0
 Test Files  307 passed (307)
      Tests  3478 passed (3478)
```

Biome's `Fixed` count may differ (import order and line width only); the test counts equal the baseline of Task 0.

- [ ] **Step 4: Scan the `pathways-client.ts` shell**

CR section 9 left a second question with this move: whether the `pathways-client.ts` shell can go. `shell-scan.mjs` parses every web file (test files and the shell excluded), and for each import of the shell lists the names it takes and the `pathwaysClient.<member>` it calls; it prints the exports and interface members of the shell, the members without a production caller, the number of test files that name the shell (mocks) and a verdict. Create it with the Write tool exactly as printed.

Create `.tmp/w2/shell-scan.mjs`:

```js
// Lists what the pathways-client shell still provides to production code and prints a verdict: keep (members named) or retire-ready.
// Usage: node .tmp/w2/shell-scan.mjs   (run from the repository root; test files and the shell's own file are not production callers)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

const shell = execFileSync('git', ['ls-files', 'apps/web/src/lib/services/pathways-client.ts'], { encoding: 'utf8' }).trim()
if (!shell) throw new Error('apps/web/src/lib/services/pathways-client.ts is not tracked')
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web/src', 'apps/web/e2e'], { encoding: 'utf8' }).split('\n').filter((file) => /\.tsx?$/.test(file) && existsSync(file))
const isTest = (file) => /\.(test|spec)\.tsx?$/.test(file) || file.startsWith('apps/web/e2e/')
const names = (specifier) => /(^|\/)pathways-client$/.test(specifier)

const production = new Map()
const note = (member, file) => production.set(member, [...(production.get(member) ?? []), file])
const mocks = new Set()
for (const file of files) {
  if (file === shell) continue
  const text = readFileSync(file, 'utf8')
  if (!/pathways-client/.test(text)) continue
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (isTest(file)) {
    mocks.add(file)
    continue
  }
  let local = null
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !names(statement.moduleSpecifier.text)) continue
    for (const element of statement.importClause?.namedBindings?.elements ?? []) {
      const imported = (element.propertyName ?? element.name).text
      if (imported === 'pathwaysClient') local = element.name.text
      else note(imported, file)
    }
  }
  if (!local) continue
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === local && !ts.isImportSpecifier(node.parent)) {
      const parent = node.parent
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) note(`pathwaysClient.${parent.name.text}`, file)
      else note('pathwaysClient (as a value)', file)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const shellSource = ts.createSourceFile(shell, readFileSync(shell, 'utf8'), ts.ScriptTarget.Latest, true)
const exported = shellSource.statements.filter((statement) => statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)).flatMap((statement) => (ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((d) => d.name.getText(shellSource)) : [statement.name?.getText(shellSource)])).filter(Boolean)
const members = shellSource.statements.filter(ts.isInterfaceDeclaration).filter((statement) => statement.name.text === 'PathwaysClient').flatMap((statement) => statement.members.map((member) => member.name.getText(shellSource)))
console.log(`shell exports: ${exported.join(', ') || 'none'}`)
console.log(`shell members: ${members.join(', ') || 'none'}`)
for (const [member, users] of [...production].sort()) console.log(`production: ${member} <- ${[...new Set(users)].join(', ')}`)
const unused = members.filter((member) => !production.has(`pathwaysClient.${member}`))
console.log(`members without a production caller: ${unused.join(', ') || 'none'}`)
console.log(`test files naming the shell: ${mocks.size}`)
console.log(production.size ? `verdict: keep, ${production.size} names still used by production code` : 'verdict: retire-ready')
```

```bash
node .tmp/w2/shell-scan.mjs | tee .tmp/w2/shell-scan.txt
```

Expected: the scan lists what the shell exports and which production file uses each name, and the verdict:

```
shell exports: recoverSourceMutation
shell members: none
production: recoverSourceMutation <- apps/web/src/features/projects/components/source-mutation-recovery.tsx
members without a production caller: none
test files naming the shell: 39
verdict: keep, 1 names still used by production code
```

At the W1 tip the shell exports one function, `recoverSourceMutation`, which `source-mutation-recovery.tsx` calls, and 39 test files name the shell; the verdict line is what Task 7 records, `keep` with the names, or `retire-ready` when no production code names the shell. Either way W2 does not remove it.

The scan only reads. If the verdict is `keep`, Task 7 records the names that remain, so that the slice that removes each one is known. If the verdict is `retire-ready` (no production code names the shell any more), do not delete it here: removing it also removes every `vi.mock('@/lib/services/pathways-client', ...)` factory of the test files that name it (the count in the last line), a per-test review that this slice does not do. Record the verdict in Task 7 as "retire-ready, left to the developer" and go on; this is not a stop.

- [ ] **Step 5: Commit**

```bash
git add -A apps
git status --short | grep -v "^[RM] " | head
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(web): move the source mutation and authorized read events modules to lib/api/core

The request layer already imports both; the move is a pure rename with the importers and mocks rewritten by script, and the pathways-client shell is scanned, not retired.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -3
```

Expected: the commit holds three renames at 100% and the files that follow them:

```
[claude/modularization-s8b-xjnlzt <sha>] refactor(web): move the source mutation and authorized read events modules to lib/api/core
 29 files changed, 41 insertions(+), 41 deletions(-)
 rename apps/web/src/lib/{services => api/core}/authorized-read-events.ts (100%)
 rename apps/web/src/lib/{services => api/core}/source-mutation.test.ts (100%)
 rename apps/web/src/lib/{services => api/core}/source-mutation.ts (100%)
 apps/web/src/providers/authorized-query-cache.test.tsx         |  2 +-
 apps/web/src/providers/authorized-query-provider.tsx           | 10 +++++-----
 29 files changed, 41 insertions(+), 41 deletions(-)
```



---

### Task 2: Path aliases in one place

**Files:**
- Create: `scripts/tsconfig-aliases.mjs`, `scripts/tsconfig-aliases.test.mjs`
- Create (gitignored): `.tmp/w2/task2-alias-edits.json`, `mutations-alias.json`, `mutate.py`
- Modify: `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/imports/vitest.config.ts`, `package.json` (the `test:scripts` script)

The aliases `@app/*` (api), `@/*` (web) and `@pathways/*` are declared twice today: in the `paths` of the tsconfig files, which `tsc`, `nest build` (through `tsconfig-paths`) and Next read, and again by hand in the `resolve.alias` of the three Vitest configs. Hand copies drift: the api config lists five of the six package entries (it has no `@pathways/shared/*`, `@pathways/config/*` or `@pathways/imports/*`), the web config four, the imports config one. The `paths` are the one declaration; the Vitest configs now build their alias list from them with a helper of about twenty lines. The helper is a script beside the node tests, not a module of `packages/config`: the `tooling` CI job installs no dependencies, and the `packages/imports` config would otherwise import a workspace package that it has no entry for. No new dependency is added (the repository rule is no external library unless necessary, so `vite-tsconfig-paths` is not used).

- [ ] **Step 1: Print the hand-written lists next to the paths**

```bash
for f in apps/api apps/web packages/imports; do echo "$f paths: $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$f/tsconfig.json','utf8')).compilerOptions.paths ?? {}).length)")"; done
node -e "console.log('base paths:', Object.keys(JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8')).compilerOptions.paths ?? {}).length)"
git grep -n -E "path.resolve\(|find:" -- apps/api/vitest.config.ts apps/web/vitest.config.ts packages/imports/vitest.config.ts | cut -c1-130
```

Expected: the path declarations (7, 7, 2 and 6), their lines and the three alias blocks of the Vitest configs:

```
apps/api paths: 7
apps/web paths: 7
packages/imports paths: 2
base paths: 6
apps/api/vitest.config.ts:8:      '@app': path.resolve(__dirname, 'src'),
apps/api/vitest.config.ts:9:      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
apps/api/vitest.config.ts:10:      '@pathways/imports/server': path.resolve(__dirname, '../../packages/imports/src/server.ts'),
apps/api/vitest.config.ts:11:      '@pathways/imports': path.resolve(__dirname, '../../packages/imports/src/index.ts'),
apps/api/vitest.config.ts:12:      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
apps/web/vitest.config.ts:9:      '@': path.resolve(__dirname, 'src'),
apps/web/vitest.config.ts:10:      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
apps/web/vitest.config.ts:11:      '@pathways/imports': path.resolve(__dirname, '../../packages/imports/src/index.ts'),
apps/web/vitest.config.ts:12:      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
packages/imports/vitest.config.ts:11:        find: /^@pathways\/shared$/,
packages/imports/vitest.config.ts:12:        replacement: path.resolve(currentDir, '../shared/src/index.ts'),
```

The api maps `@pathways/imports/server` to the server entry in its Vitest config but has no such tsconfig path: the helper must reproduce it, which Step 3 does with the tsconfig path of the same name; if the real tsconfig lines differ from this list, stop.

The `paths` of an app tsconfig replace those of the base (TypeScript does not merge them), so each app repeats the package entries; Step 2 has a test that the repeats equal the base.

- [ ] **Step 2: Create the helper and its test, and watch the config guards fail**

`tsconfigAliases(file)` reads `compilerOptions.paths` and `baseUrl`, requires exactly one target per pattern, and returns Vite `{ find, replacement }` entries with the longest prefix first (an exact pattern becomes `^name$`, a wildcard `^prefix(.*)$` with `target/$1`). The test checks that each of the three configs resolves sample specifiers the way the TypeScript rule of the longest matching prefix does, that every `paths` entry has an alias and nothing else is aliased (`@pathways/sharedx` is not), that the Vitest config text builds its aliases from the tsconfig, that the package entries repeated by the app tsconfigs equal the base, and the error and overlap cases. Create both files with the Write tool exactly as printed.

Create `scripts/tsconfig-aliases.mjs`:

```js
// Builds Vite resolve.alias entries from the paths of a tsconfig file, so tests resolve imports the way the typecheck does.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

export function tsconfigAliases(tsconfigFile) {
  const { compilerOptions = {} } = JSON.parse(readFileSync(tsconfigFile, 'utf8'))
  const base = path.resolve(path.dirname(tsconfigFile), compilerOptions.baseUrl ?? '.')
  const entries = Object.entries(compilerOptions.paths ?? {})
  if (!entries.length) throw new Error(`${tsconfigFile}: no compilerOptions.paths`)
  return entries
    .map(([pattern, targets]) => {
      if (targets.length !== 1)
        throw new Error(`${tsconfigFile}: ${pattern} needs exactly one target`)
      const [prefix, wildcard] = pattern.split('*')
      const target = path.resolve(base, targets[0].replace('*', ''))
      return wildcard === undefined
        ? {
            find: new RegExp(`^${escapeRegex(pattern)}$`),
            replacement: target,
            length: pattern.length,
          }
        : {
            find: new RegExp(`^${escapeRegex(prefix)}(.*)$`),
            replacement: `${target}/$1`,
            length: prefix.length,
          }
    })
    .sort((a, b) => b.length - a.length)
    .map(({ find, replacement }) => ({ find, replacement }))
}
```

Create `scripts/tsconfig-aliases.test.mjs`:

```js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tsconfigAliases } from './tsconfig-aliases.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = (...parts) => path.join(root, ...parts)
const json = (...parts) => JSON.parse(readFileSync(file(...parts), 'utf8'))

// The path a specifier becomes under an alias list: the first matching entry wins, as in Vite.
const apply = (aliases, specifier) => {
  const hit = aliases.find(({ find }) => find.test(specifier))
  return hit ? specifier.replace(hit.find, hit.replacement) : null
}

// What the tsconfig paths of one config name for a specifier, by the TypeScript rule of the longest matching prefix.
const typescriptTarget = (tsconfig, specifier) => {
  const { baseUrl = '.', paths } = json(tsconfig).compilerOptions
  const base = path.resolve(file(path.dirname(tsconfig)), baseUrl)
  const keys = Object.keys(paths).filter((key) =>
    key.endsWith('*') ? specifier.startsWith(key.slice(0, -1)) : key === specifier,
  )
  const key = keys.sort((a, b) => b.length - a.length)[0]
  if (!key) return null
  const rest = key.endsWith('*') ? specifier.slice(key.length - 1) : ''
  return path.resolve(base, paths[key][0].replace('*', rest))
}

const configs = {
  api: { tsconfig: 'apps/api/tsconfig.json', vitest: 'apps/api/vitest.config.ts' },
  web: { tsconfig: 'apps/web/tsconfig.json', vitest: 'apps/web/vitest.config.ts' },
  imports: {
    tsconfig: 'packages/imports/tsconfig.json',
    vitest: 'packages/imports/vitest.config.ts',
  },
}
const samples = {
  api: [
    '@app/common/prisma/transaction',
    '@pathways/shared',
    '@pathways/config',
    '@pathways/imports',
    '@pathways/imports/server',
    '@pathways/shared/rbac/role-catalog',
  ],
  web: [
    '@/lib/utils',
    '@pathways/shared',
    '@pathways/config',
    '@pathways/imports',
    '@pathways/shared/rbac/role-catalog',
  ],
  imports: ['@pathways/shared', '@pathways/shared/rbac/role-catalog'],
}

for (const [name, { tsconfig }] of Object.entries(configs)) {
  test(`${name}: the aliases resolve every sample as the tsconfig paths do`, () => {
    const aliases = tsconfigAliases(file(tsconfig))
    for (const specifier of samples[name]) {
      assert.equal(apply(aliases, specifier), typescriptTarget(tsconfig, specifier), specifier)
    }
  })

  test(`${name}: every path entry has an alias and nothing else is aliased`, () => {
    const { paths } = json(tsconfig).compilerOptions
    assert.equal(tsconfigAliases(file(tsconfig)).length, Object.keys(paths).length)
    const aliases = tsconfigAliases(file(tsconfig))
    for (const specifier of [
      '@pathways/sharedx',
      '@pathways/shared-x',
      '@appx/common',
      '@x/lib',
      'react',
    ]) {
      assert.equal(apply(aliases, specifier), null, specifier)
    }
  })

  test(`${name}: the vitest config builds its aliases from the tsconfig`, () => {
    const text = readFileSync(file(configs[name].vitest), 'utf8')
    assert.match(text, /tsconfigAliases\(/)
    assert.doesNotMatch(text, /packages\/(shared|config|imports)/)
  })
}

test('the package aliases of the base tsconfig are repeated unchanged by the api, web and imports tsconfigs', () => {
  const base = tsconfigAliases(file('tsconfig.base.json'))
  const baseTargets = new Map(base.map(({ find, replacement }) => [String(find), replacement]))
  assert.ok(baseTargets.size >= 6)
  for (const [name, { tsconfig }] of Object.entries(configs)) {
    const own = new Map(
      tsconfigAliases(file(tsconfig)).map(({ find, replacement }) => [String(find), replacement]),
    )
    const wanted =
      name === 'imports'
        ? [...baseTargets].filter(([key]) => key.includes('shared'))
        : [...baseTargets]
    assert.ok(wanted.length >= 2, name)
    for (const [key, target] of wanted) assert.equal(own.get(key), target, `${name}: ${key}`)
  }
})

test('the longest matching prefix wins and a path with two targets is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aliases-'))
  const write = (paths) => {
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths } }),
    )
    return path.join(dir, 'tsconfig.json')
  }
  const aliases = tsconfigAliases(
    write({ 'a/*': ['one/*'], 'a/b/*': ['two/*'], exact: ['three/index.ts'] }),
  )
  assert.equal(apply(aliases, 'a/b/c'), path.join(dir, 'two/c'))
  assert.equal(apply(aliases, 'a/x'), path.join(dir, 'one/x'))
  assert.equal(apply(aliases, 'exact'), path.join(dir, 'three/index.ts'))
  assert.throws(() => tsconfigAliases(write({ x: ['a', 'b'] })), /exactly one target/)
  assert.throws(() => tsconfigAliases(write({})), /no compilerOptions.paths/)
})
```

```bash
node --test scripts/tsconfig-aliases.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```

Expected: eleven tests, eight pass; the three that fail are the config guards, which the next step turns green:

```
not ok 3 - api: the vitest config builds its aliases from the tsconfig
not ok 6 - web: the vitest config builds its aliases from the tsconfig
not ok 9 - imports: the vitest config builds its aliases from the tsconfig
# tests 11
# pass 8
# fail 3
```

The three failing tests are the config guards: the Vitest configs still hold their hand-written lists. The other eight prove the helper against the tsconfig files as they are.

- [ ] **Step 3: Point the three Vitest configs at the tsconfig files**

Each config loses its `alias` block and gains one import and one line. `package.json` gains the test in `test:scripts`, which the `tooling` job already runs.

Create `.tmp/w2/task2-alias-edits.json`:

```json
[
 [
  "apps/api/vitest.config.ts",
  "  resolve: {\n    alias: {\n      '@app': path.resolve(__dirname, 'src'),\n      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),\n      '@pathways/imports/server': path.resolve(__dirname, '../../packages/imports/src/server.ts'),\n      '@pathways/imports': path.resolve(__dirname, '../../packages/imports/src/index.ts'),\n      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),\n    },\n  },\n",
  "  resolve: { alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json')) },\n",
  1
 ],
 [
  "apps/api/vitest.config.ts",
  "import { defineConfig } from 'vitest/config'\n",
  "import { defineConfig } from 'vitest/config'\n\nimport { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'\n",
  1
 ],
 [
  "apps/web/vitest.config.ts",
  "  resolve: {\n    alias: {\n      '@': path.resolve(__dirname, 'src'),\n      '@pathways/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),\n      '@pathways/imports': path.resolve(__dirname, '../../packages/imports/src/index.ts'),\n      '@pathways/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),\n    },\n  },\n",
  "  resolve: { alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json')) },\n",
  1
 ],
 [
  "apps/web/vitest.config.ts",
  "import { defineConfig } from 'vitest/config'\n",
  "import { defineConfig } from 'vitest/config'\n\nimport { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'\n",
  1
 ],
 [
  "packages/imports/vitest.config.ts",
  "  resolve: {\n    alias: [\n      {\n        find: /^@pathways\\/shared$/,\n        replacement: path.resolve(currentDir, '../shared/src/index.ts'),\n      },\n    ],\n  },\n",
  "  resolve: { alias: tsconfigAliases(path.resolve(currentDir, 'tsconfig.json')) },\n",
  1
 ],
 [
  "packages/imports/vitest.config.ts",
  "import { defineConfig } from 'vitest/config'\n",
  "import { defineConfig } from 'vitest/config'\n\nimport { tsconfigAliases } from '../../scripts/tsconfig-aliases.mjs'\n",
  1
 ],
 [
  "package.json",
  "\"test:scripts\": \"node --test \\\"scripts/db/**/*.test.mjs\\\" infra/supabase/security-adapter/runtime-output.test.mjs\"",
  "\"test:scripts\": \"node --test \\\"scripts/db/**/*.test.mjs\\\" scripts/tsconfig-aliases.test.mjs infra/supabase/security-adapter/runtime-output.test.mjs\"",
  1
 ]
]
```

```bash
node .tmp/w2/replace-exact.mjs .tmp/w2/task2-alias-edits.json
pnpm exec biome check --write apps/api/vitest.config.ts apps/web/vitest.config.ts packages/imports/vitest.config.ts package.json scripts/tsconfig-aliases.mjs scripts/tsconfig-aliases.test.mjs 2>&1 | tail -2
git diff --stat | cat
node --test scripts/tsconfig-aliases.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
```

Expected: seven replacements in four files, Biome has nothing to fix, the diff removes the hand-written lists, the eleven tests of the helper pass, and `test:scripts` holds the baseline plus the eleven:

```
7 replacements in 4 files
Checked 6 files in <ms>. No fixes applied.
 apps/api/vitest.config.ts         | 12 +++---------
 apps/web/vitest.config.ts         | 11 +++--------
 package.json                      |  2 +-
 packages/imports/vitest.config.ts | 11 +++--------
 4 files changed, 10 insertions(+), 26 deletions(-)
# tests 11
# pass 11
# fail 0
# tests 199
# pass 185
# fail 0
# skipped 14
```

- [ ] **Step 4: Run every suite that the aliases serve**

The three configs resolve every import of the api, web and imports suites, so the whole run is the proof: the test counts must equal the baselines (a test that imported `@pathways/shared/...` through a path the old list lacked would now resolve and still pass; one that fails to resolve fails here).

```bash
bash .tmp/w2/suite.sh aliases
git status --short
```

Expected: every suite keeps its baseline counts:

```
exit 0
apps/api test:  Test Files  166 passed | 10 skipped (176)
apps/api test:       Tests  2642 passed | 21 skipped (2663)
apps/web test:  Test Files  307 passed (307)
apps/web test:       Tests  3478 passed (3478)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
packages/shared test:  Test Files  54 passed (54)
packages/shared test:       Tests  885 passed (885)
      Tests  59 passed (59)
 M apps/api/vitest.config.ts
 M apps/web/vitest.config.ts
 M package.json
 M packages/imports/vitest.config.ts
?? scripts/tsconfig-aliases.mjs
?? scripts/tsconfig-aliases.test.mjs
```

The counts equal the baselines of Task 0, and `git status --short` lists the four configs and the two new scripts. The run takes about five minutes.

- [ ] **Step 5: Prove the new tests catch their mutations**

`mutate.py` applies one text mutation at a time, runs a command, restores the file, and reports whether the command failed. The eight mutations break the sort order, the exact-match anchor, the one-target rule, the empty-paths error and the wildcard replacement in the helper, put a hand-written alias back into the api config, change one base entry of the web tsconfig (drift) and delete another.

Create `.tmp/w2/mutate.py`:

```py
"""Applies one mutation at a time, runs a command and reports whether the mutation made it fail; every file is restored afterwards and no stale bytecode is left (a restored file keeps the size and may keep the second of its mutated twin).

Usage: python3 .tmp/w2/mutate.py <mutations.json> <command> [args...]   (run from the repository root)
mutations.json is a list of [file, old text, new text]; the old text must occur exactly once. Exit status 0 when every mutation was caught.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

mutations = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
command = sys.argv[2:]
env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
caught = 0
for name, old, new in mutations:
    path = Path(name)
    original = path.read_text(encoding="utf-8")
    if original.count(old) != 1:
        sys.exit(f"{name}: expected one match for {old!r}, found {original.count(old)}")
    try:
        path.write_text(original.replace(old, new), encoding="utf-8")
        result = subprocess.run(command, capture_output=True, text=True, env=env)
    finally:
        path.write_text(original, encoding="utf-8")
        shutil.rmtree(path.parent / "__pycache__", ignore_errors=True)
    killed = result.returncode != 0
    caught += killed
    print(f"{'caught  ' if killed else 'SURVIVED'} {name}: {old.splitlines()[0][:70]}")
print(f"caught {caught} of {len(mutations)}")
sys.exit(0 if caught == len(mutations) else 1)
```

Create `.tmp/w2/mutations-alias.json`:

```json
[
 [
  "scripts/tsconfig-aliases.mjs",
  ".sort((a, b) => b.length - a.length)",
  ".sort((a, b) => a.length - b.length)"
 ],
 [
  "scripts/tsconfig-aliases.mjs",
  "find: new RegExp(`^${escapeRegex(pattern)}$`),",
  "find: new RegExp(`^${escapeRegex(pattern)}`),"
 ],
 [
  "scripts/tsconfig-aliases.mjs",
  "if (targets.length !== 1)",
  "if (targets.length < 1)"
 ],
 [
  "scripts/tsconfig-aliases.mjs",
  "if (!entries.length) throw",
  "if (false) throw"
 ],
 [
  "scripts/tsconfig-aliases.mjs",
  "replacement: `${target}/$1`,",
  "replacement: `${target}/`,"
 ],
 [
  "apps/api/vitest.config.ts",
  "alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json'))",
  "alias: { '@app': path.resolve(__dirname, 'src') }"
 ],
 [
  "apps/web/tsconfig.json",
  "\"@pathways/shared\": [\"../../packages/shared/src/index.ts\"],",
  "\"@pathways/shared\": [\"../../packages/shared/src/other.ts\"],"
 ],
 [
  "apps/web/tsconfig.json",
  "      \"@pathways/shared/*\": [\"../../packages/shared/src/*\"],\n",
  ""
 ]
]
```

```bash
python3 .tmp/w2/mutate.py .tmp/w2/mutations-alias.json node --test scripts/tsconfig-aliases.test.mjs
git status --short
```

Expected: every one of the eight mutations is caught:

```
caught   scripts/tsconfig-aliases.mjs: .sort((a, b) => b.length - a.length)
caught   scripts/tsconfig-aliases.mjs: find: new RegExp(`^${escapeRegex(pattern)}$`),
caught   scripts/tsconfig-aliases.mjs: if (targets.length !== 1)
caught   scripts/tsconfig-aliases.mjs: if (!entries.length) throw
caught   scripts/tsconfig-aliases.mjs: replacement: `${target}/$1`,
caught   apps/api/vitest.config.ts: alias: tsconfigAliases(path.resolve(__dirname, 'tsconfig.json'))
caught   apps/web/tsconfig.json: "@pathways/shared": ["../../packages/shared/src/index.ts"],
caught   apps/web/tsconfig.json:       "@pathways/shared/*": ["../../packages/shared/src/*"],
caught 8 of 8
 M apps/api/vitest.config.ts
 M apps/web/vitest.config.ts
 M package.json
 M packages/imports/vitest.config.ts
?? scripts/tsconfig-aliases.mjs
?? scripts/tsconfig-aliases.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/tsconfig-aliases.mjs scripts/tsconfig-aliases.test.mjs apps/api/vitest.config.ts apps/web/vitest.config.ts packages/imports/vitest.config.ts package.json
git status --short
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test: build the Vitest aliases from the tsconfig paths

The api, web and imports configs read compilerOptions.paths through one helper instead of three hand-written lists, and a node test proves the helper against each config and against the base entries the app tsconfigs repeat.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -8
```

Expected: the commit holds six files:

```
M  apps/api/vitest.config.ts
M  apps/web/vitest.config.ts
M  package.json
M  packages/imports/vitest.config.ts
A  scripts/tsconfig-aliases.mjs
A  scripts/tsconfig-aliases.test.mjs
[claude/modularization-s8b-xjnlzt <sha>] test: build the Vitest aliases from the tsconfig paths
 6 files changed, 166 insertions(+), 26 deletions(-)
 create mode 100644 scripts/tsconfig-aliases.mjs
 create mode 100644 scripts/tsconfig-aliases.test.mjs
<sha> test: build the Vitest aliases from the tsconfig paths
 apps/api/vitest.config.ts         |  12 +---
 apps/web/vitest.config.ts         |  11 +---
 package.json                      |   2 +-
 packages/imports/vitest.config.ts |  11 +---
 scripts/tsconfig-aliases.mjs      |  32 ++++++++++
 scripts/tsconfig-aliases.test.mjs | 124 ++++++++++++++++++++++++++++++++++++++
 6 files changed, 166 insertions(+), 26 deletions(-)
```



---

### Task 3: Split `scripts/docs/check.py` into one module per check

**Files:**
- Create: `scripts/docs/checks/__init__.py` and the nine modules `common.py`, `voice.py`, `scrutiny.py`, `inception.py`, `trace.py`, `coverage.py`, `currency.py`, `filing.py` and `project_specific.py`, plus `agents.py` (ten modules)
- Modify: `scripts/docs/check.py` (becomes the entry point: the command line, the table of checks and `main`)
- Create (gitignored): `.tmp/w2/docs-split.json`, `split-check.py`, `docs-lines-proof.py`, `docs-compare.py`, `check-before.py`, `docs-before.txt`

The roadmap row says `docs/check.py`; the file is `scripts/docs/check.py` (1060 lines, nine checks and their helpers in one module). The split keeps the command, the options, the output and the exit codes: `pnpm docs:check` still runs `python scripts/docs/check.py docs`, so no document that names the command changes. The splitter is a script, not a hand edit: it reads the original with Python's `ast`, places every top-level statement in the module that `docs-split.json` names, moves the statement text unchanged (comments stay with the code below them), and adds only the imports each module needs. Three helpers become public names because modules now import them (`_docs_ancestor` to `docs_ancestor`, `_is_change_layer_path` to `is_change_layer_path`, `_FILING_RE` to `FILING_RE`), and `ROOT` counts one more parent because `common.py` sits one folder deeper. The one separator comment `# --- checks ---` is dropped.

- [ ] **Step 1: Keep the original and its output**

```bash
cp scripts/docs/check.py .tmp/w2/check-before.py
wc -l scripts/docs/check.py
grep -c -E "^def |^class " scripts/docs/check.py
python3 scripts/docs/check.py docs > .tmp/w2/docs-before.txt; echo "exit $?"
python3 scripts/docs/check.py docs --strict > .tmp/w2/docs-before-strict.txt; echo "strict exit $?"
tail -n 1 .tmp/w2/docs-before.txt
git ls-files scripts/docs
```

Expected: the size (1060 lines), the number of top-level definitions (34), the unchanged output of the default run and of `--strict` (0 failures and 0 warnings; both runs exit 0), and the two scripts that import `check.py`:

```
1060 scripts/docs/check.py
34
exit 0
strict exit 0
0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
scripts/docs/check.py
scripts/docs/materialize.py
```

The line count differs if an earlier slice edited the file; the split is by function, so a different size is recorded and carried on.

- [ ] **Step 2: Create the table and the splitter, and run it**

`docs-split.json` names the module of each top-level statement (functions, classes and assignments by name) and the three renames. The splitter stops with the statement it cannot place, with a name placed twice or with a name the source lacks, so a changed `check.py` fails loudly instead of losing code. Create both files with the Write tool exactly as printed.

Create `.tmp/w2/docs-split.json`:

```json
{
  "source": "scripts/docs/check.py",
  "package": "scripts/docs/checks",
  "drop": ["# --- checks ---------------------------------------------------------------"],
  "rename": {
    "_docs_ancestor": "docs_ancestor",
    "_is_change_layer_path": "is_change_layer_path",
    "_FILING_RE": "FILING_RE"
  },
  "modules": {
    "common": {
      "doc": "Shared helpers of the documentation checks: the repository root, path display, tables and docs folder discovery.",
      "names": ["ROOT", "rel", "parse_tables", "_docs_ancestor", "docs_roots", "doc_md_files", "_is_change_layer_path"]
    },
    "voice": {
      "doc": "Voice check: dashes, banned phrases, AI markup artifacts and public surface leaks.",
      "names": [
        "DASH_ALLOWED", "DASH_EXTRA_BANNED", "REPLACEMENT", "_has_banned_dash", "_has_spaced_endash_as_punct",
        "EXTERNAL_ROOT_OUTPUTS", "GUIDE_FILES", "GUIDE_GLOBS", "BANNED_PHRASES", "_INLINE_CODE", "_DASH_PUNCT",
        "_TABLE_SEP", "AI_MARKUP_ARTIFACTS", "_AI_TURN_ARTIFACT", "_markup_artifacts_in_prose", "_dashdash_as_punct",
        "_voice_targets", "_system_files", "_PUBLIC_LEAKS", "_PUBLIC_LEAKS_README", "_PUBLIC_DOC_PREFIXES",
        "_public_surface_files", "check_voice"
      ]
    },
    "scrutiny": {
      "doc": "Scrutiny check: the verified-claim trust rule and the blocking decision gate.",
      "names": [
        "_VERDICT_CELL", "_SOURCE_PROVENANCE", "_is_verified_finding", "_source_has_provenance", "check_scrutiny",
        "_GATE_STOP_ALLOW_PREFIXES", "_suite_docs_under_blocking_gate"
      ]
    },
    "inception": {
      "doc": "Inception check: a locked IDEA must carry its load-bearing fields.",
      "names": ["_IDEA_LOAD_BEARING", "_is_locked_status", "_is_hollow_idea_value", "_idea_paths", "check_inception"]
    },
    "trace": {
      "doc": "Trace check: PRD identifiers, index rows, locked dates, and the living-docs checks it runs.",
      "names": ["_index_lists_file", "_header_field", "check_cr_propagation", "check_index_accuracy", "check_sdd_contracts", "check_trace"]
    },
    "coverage": {
      "doc": "Coverage check: every Must-Have is realized in the SDD and tested in the QAD.",
      "names": ["check_coverage"]
    },
    "currency": {
      "doc": "Currency check: verified dates older than the allowed age.",
      "names": ["check_currency"]
    },
    "filing": {
      "doc": "Filing check: registered documents live inside a docs folder.",
      "names": ["DOC_TYPES", "_FILING_RE", "check_filing"]
    },
    "project_specific": {
      "doc": "Project-specific check: the minimum header metadata of project-specific artifacts.",
      "names": ["_PX_CLASS_RE", "_PX_REQUIRED", "check_project_specific"]
    },
    "agents": {
      "doc": "Agents check: the SAD roster against the agent definitions.",
      "names": ["_AGENT_COORDINATORS", "_AGENT_MODELS", "check_agents"]
    }
  },
  "entry": ["CHECKS", "main", "__main__"]
}
```

Create `.tmp/w2/split-check.py`:

```py
"""Splits scripts/docs/check.py into the checks package by the table in docs-split.json, moving every statement unchanged except imports and three renamed helpers.

Usage: python3 .tmp/w2/split-check.py .tmp/w2/docs-split.json   (run from the repository root; rewrites check.py as the entry point)
"""
import ast
import json
import re
import sys
from pathlib import Path

spec = json.loads(Path(sys.argv[1]).read_text())
source = Path(spec["source"])
lines = source.read_text(encoding="utf-8").split("\n")
tree = ast.parse("\n".join(lines))
rename = spec["rename"]
drop = set(spec["drop"])


def bound(node):
    if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
        return [node.name]
    if isinstance(node, ast.Assign):
        return [t.id for t in node.targets if isinstance(t, ast.Name)]
    if isinstance(node, ast.If) and ast.unparse(node.test) == "__name__ == '__main__'":
        return ["__main__"]
    return []


# Each statement owns the lines from the end of the previous statement to its own end, so comments stay with the code below them.
imports, chunks, previous_end = [], {}, 0
for index, node in enumerate(tree.body):
    if isinstance(node, ast.Expr) and index == 0:
        previous_end = node.end_lineno
        continue
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        imports.append(node)
        previous_end = node.end_lineno
        continue
    names = bound(node)
    if not names:
        raise SystemExit(f"line {node.lineno}: a statement the table cannot place")
    body = [line for line in lines[previous_end : node.end_lineno] if line not in drop]
    chunks[names[0]] = (node, body)
    previous_end = node.end_lineno

placed = {name: module for module, entry in spec["modules"].items() for name in entry["names"]}
entry_names = set(spec["entry"])
unplaced = sorted(set(chunks) - set(placed) - entry_names)
twice = sorted(name for name in placed if name in entry_names)
missing = sorted(set(placed) - set(chunks))
if unplaced or twice or missing:
    raise SystemExit(f"unplaced {unplaced}, placed twice {twice}, not in the source {missing}")

module_of = dict(placed)
imported_from = {}  # standard library names -> import statement text
for node in imports:
    text = "\n".join(lines[node.lineno - 1 : node.end_lineno])
    for alias in node.names:
        imported_from[(alias.asname or alias.name).split(".")[0]] = text


def public(name):
    return rename.get(name, name)


def uses(node):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def render(module, names, doc):
    code = []
    needs_std, needs_local = {}, {}
    for name in names:
        node, body = chunks[name]
        text = "\n".join(body)
        for old, new in rename.items():
            text = re.sub(rf"\b{re.escape(old)}\b", new, text)
        code.append(text if code else text.lstrip("\n"))
        for used in uses(node):
            if used in imported_from:
                needs_std[used] = imported_from[used]
            elif used in module_of and module_of[used] != module:
                needs_local.setdefault(module_of[used], set()).add(public(used))
    head = [f'"""{doc}"""'] if doc else []
    std = sorted(set(needs_std.values()), key=lambda s: (s.startswith("from"), s))
    local = [f"from .{mod} import {', '.join(sorted(items))}" for mod, items in sorted(needs_local.items())]
    return head, std, local, "\n".join(code)


package = Path(spec["package"])
package.mkdir(parents=True, exist_ok=True)
(package / "__init__.py").write_text('"""The documentation checks, one module per check."""\n', encoding="utf-8")
for module, entry in spec["modules"].items():
    head, std, local, code = render(module, entry["names"], entry["doc"])
    parts = ["\n".join(head)]
    if std:
        parts.append("\n".join(std))
    if local:
        parts.append("\n".join(local))
    text = "\n\n".join(parts) + "\n\n\n" + code + "\n"
    if module == "common":
        text = text.replace("Path(__file__).resolve().parents[2]", "Path(__file__).resolve().parents[3]")
    (package / f"{module}.py").write_text(text, encoding="utf-8")
    print(f"{package / (module + '.py')}: {len(text.splitlines())} lines")

# The entry point keeps the command line: the original docstring, the checks table and main.
docstring = "\n".join(lines[tree.body[0].lineno - 1 : tree.body[0].end_lineno])
entry_body = "\n".join("\n".join(chunks[n][1]) for n in spec["entry"]).lstrip("\n")
std = sorted({imported_from[u] for n in spec["entry"] for u in uses(chunks[n][0]) if u in imported_from}, key=lambda s: (s.startswith("from"), s))
local = {}
for n in spec["entry"]:
    for u in uses(chunks[n][0]):
        if u in module_of:
            local.setdefault(module_of[u], set()).add(public(u))
imp = "\n".join(f"from checks.{mod} import {', '.join(sorted(items))}" for mod, items in sorted(local.items()))
Path(spec["source"]).write_text(f"{docstring}\n" + "\n".join(std) + "\n\n" + imp + "\n\n\n" + entry_body + "\n", encoding="utf-8")
print(f"{spec['source']}: {len((docstring + entry_body).splitlines())} lines")
```

```bash
python3 .tmp/w2/split-check.py .tmp/w2/docs-split.json
wc -l scripts/docs/check.py scripts/docs/checks/*.py | tail -n 1
python3 scripts/docs/check.py docs | tail -n 1
```

Expected: ten modules and the entry point, and the output of the new command is the old one:

```
scripts/docs/checks/common.py: 85 lines
scripts/docs/checks/voice.py: 277 lines
scripts/docs/checks/scrutiny.py: 108 lines
scripts/docs/checks/inception.py: 94 lines
scripts/docs/checks/trace.py: 220 lines
scripts/docs/checks/coverage.py: 86 lines
scripts/docs/checks/currency.py: 32 lines
scripts/docs/checks/filing.py: 39 lines
scripts/docs/checks/project_specific.py: 38 lines
scripts/docs/checks/agents.py: 50 lines
scripts/docs/check.py: 77 lines
 1124 total
0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
```

The module sizes may differ by a few lines on a different base. `materialize.py` is not edited.

- [ ] **Step 3: Prove that no line was lost**

`docs-lines-proof.py` compares the trimmed non-blank lines of the original with those of the eleven new files (imports and one-line module docstrings left out, the three renames and `parents[3]` undone), as multisets.

Create `.tmp/w2/docs-lines-proof.py`:

```py
"""Proves the check.py split lost no line: compares the trimmed lines of the old file with those of the new files, undoing the declared renames.

Usage: python3 .tmp/w2/docs-lines-proof.py <old check.py> <docs-split.json>   (run from the repository root, after the split)
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

old_file, spec_file = sys.argv[1:3]
spec = json.loads(Path(spec_file).read_text())


# Trimmed non-blank lines without top-level imports and single-line module docstrings.
def body(text, undo=False):
    if undo:
        for old, new in spec["rename"].items():
            text = re.sub(rf"\b{re.escape(new)}\b", old, text)
        text = text.replace("parents[3]", "parents[2]")
    out = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or re.match(r"(import|from) ", line):
            continue
        if re.fullmatch(r'""".*"""', stripped) and not line.startswith(" "):
            continue
        out.append(stripped)
    return out


old = Counter(body(Path(old_file).read_text(encoding="utf-8")))
dropped = sum(old.pop(line, 0) for line in spec["drop"])
new_files = [Path(spec["source"]), *sorted(Path(spec["package"]).glob("*.py"))]
new = Counter(line for file in new_files for line in body(file.read_text(encoding="utf-8"), undo=True))
lost = old - new
added = new - old
for line, n in lost.items():
    print(f"lost {n}x {line}")
for line, n in added.items():
    print(f"added {n}x {line}")
print(f"original lines {sum(old.values())}, dropped {dropped}, new files {len(new_files)}, lost {sum(lost.values())}, added {sum(added.values())}")
sys.exit(1 if lost or added else 0)
```

```bash
python3 .tmp/w2/docs-lines-proof.py .tmp/w2/check-before.py .tmp/w2/docs-split.json
```

Expected: every line is kept:

```
original lines 938, dropped 1, new files 12, lost 0, added 0
```

The first figure counts trimmed non-blank lines after the imports and docstrings are left out, not the file size (the file has `wc -l` lines), so it differs from the figure of Step 1 and may differ on the real tree; `lost 0` and `added 0` are the proof.

- [ ] **Step 4: Prove that the output did not change**

`docs-compare.py` runs the original and the new `check.py` in process on a copy of the docs, the agent definitions and the root guide files: first on 14 command lines (the default, `--strict`, an unknown check, a missing target, a folder without markdown, and `--only` for each of the nine checks), then on 39 copies with one injected fault each (a dash, a double hyphen, a banned phrase, a bad byte, a public surface leak, a missing claim count, a verified claim without a source, a blocking decision, a hollow idea, a stray registered document, a wrong agent model, and so on, at least one for every check). For each case it compares the standard output and the exit code byte for byte, and it counts the faults that changed the output (a fault that changed nothing would prove nothing). It also traces which lines of the new modules ran. The run takes eight to twelve minutes (the traced runs are slow; 722 s in the replay under `nice`), so run it in the background and read its output when it ends: a foreground call stops at ten minutes.

Create `.tmp/w2/docs-compare.py`:

```py
"""Runs the old check.py and the new one over the real docs and over docs with one injected fault each, and compares output and exit code byte for byte.

Usage: python3 .tmp/w2/docs-compare.py <old check.py>   (run from the repository root; prints one line per group and the line coverage of the new modules)
"""
import contextlib
import io
import re
import runpy
import shutil
import sys
from pathlib import Path

old_script = str(Path(sys.argv[1]).resolve())
new_script = str(Path("scripts/docs/check.py").resolve())
tree = Path(".tmp/w2/fault-tree").resolve()
sys.path.insert(0, str(Path("scripts/docs").resolve()))

shutil.rmtree(tree, ignore_errors=True)
tree.mkdir(parents=True)
shutil.copytree("docs", tree / "docs")
shutil.copytree(".claude/agents", tree / ".claude" / "agents")
for name in ("README.md", "AGENTS.md", "CLAUDE.md", "IDEA.md", "BRAND.md", "DESIGN.md"):
    shutil.copy(name, tree / name)

journal = []


def snapshot(path):
    if not any(path == p for p, _ in journal):
        journal.append((path, path.read_bytes() if path.exists() else None))


def revert():
    while journal:
        path, data = journal.pop()
        if data is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(data)


def sub(name, pattern, repl, flags=re.M, count=1):
    path = tree / name
    snapshot(path)
    text, n = re.subn(pattern, repl, path.read_text(encoding="utf-8"), count=count, flags=flags)
    if not n:
        raise SystemExit(f"{name}: no match for {pattern}")
    path.write_text(text, encoding="utf-8")


def append(name, text):
    path = tree / name
    snapshot(path)
    with path.open("ab") as handle:
        handle.write(text.encode("utf-8") if isinstance(text, str) else text)


def write(name, text):
    path = tree / name
    snapshot(path)
    path.write_text(text, encoding="utf-8")


def delete(name):
    path = tree / name
    snapshot(path)
    path.unlink()


# One fault per case: a function that edits the copy of the repository files.
EM, EN = "\u2014", "\u2013"
faults = {
    "voice-em-dash": lambda: append("docs/state.md", f"\nA word {EM} another.\n"),
    "voice-spaced-en-dash": lambda: append("docs/state.md", f"\nA word {EN} another.\n"),
    "voice-double-hyphen": lambda: append("docs/state.md", "\nA word -- another.\n"),
    "voice-in-fence": lambda: append("docs/state.md", f"\n```\nA {EM} B\n```\n"),
    "voice-ai-artifact": lambda: append("docs/state.md", "\nSee oaicite and turn0search1 here.\n"),
    "voice-banned-phrase": lambda: append("docs/state.md", "\nIt is game-" "changing, and at the end\nof the day it works.\n"),
    "voice-bad-bytes": lambda: append("docs/state.md", b"\nbad \xff byte\n"),
    "voice-public-leak": lambda: (append("README.md", "\nOur subagent reads the template {{Name}}.\n"), append("docs/pitch-pathways.md", "\nSee the agent instructions and PRD-F1 here.\n")),
    "voice-guide-files": lambda: (append("CLAUDE.md", f"\nA {EM} B and C {EN} D\n"), append("AGENTS.md", b"\nbad \xff byte\n")),
    "scrutiny-no-claims": lambda: sub("docs/scrutiny-pathways.md", r"^Claims extracted:.*$", "No count here."),
    "scrutiny-no-source": lambda: sub("docs/scrutiny-pathways.md", r"^(\| 1 \|.*\| Verified \| ).*\|$", r"\1- |"),
    "scrutiny-free-source": lambda: sub("docs/scrutiny-pathways.md", r"^(\| 1 \|.*\| Verified \| ).*\|$", r"\1the manuscript |"),
    "scrutiny-no-source-column": lambda: sub("docs/scrutiny-pathways.md", r"\| Source \|$", "| Notes |"),
    "scrutiny-no-finding-column": lambda: sub("docs/scrutiny-pathways.md", r"\| Finding \|", "| Notes |"),
    "scrutiny-blocking": lambda: (
        sub("docs/scrutiny-pathways.md", r"^Decision: `PROCEED WITH FIXES`", "Decision: DO NOT BUILD YET"),
        sub("docs/scrutiny-pathways.md", r"^\*\*Status:\*\* Working", "**Status:** " "Locked"),
    ),
    "inception-hollow": lambda: (
        sub("docs/idea-pathways.md", r"^\*\*Problem:\*\*.*$", "**Problem:** TBD"),
        sub("docs/idea-pathways.md", r"^\*\*One-line pitch:\*\*.*$", ""),
    ),
    "inception-pitch": lambda: (sub("docs/pitch-pathways.md", r"^\*\*IDEA:\*\*.*$", ""), sub("docs/pitch-pathways.md", r"^\*\*Status:\*\* Working", "**Status:** " "Locked")),
    "trace-unknown-id": lambda: append("docs/sdd-pathways.md", "\nSee PRD-F999 here.\n"),
    "trace-no-ids": lambda: sub("docs/qad-pathways.md", r"PRD-F\d+|US-\d+", "ID", count=0),
    "trace-no-prd": lambda: delete("docs/prd-pathways.md"),
    "trace-index-row": lambda: sub("docs/index.md", r"^\| SDD \| \[sdd-pathways.md\].*$", ""),
    "trace-no-index": lambda: delete("docs/index.md"),
    "trace-locked-unset": lambda: sub("docs/sdd-pathways.md", r"^\*\*Last reconciled:\*\*.*$", "**Last reconciled:** N/A"),
    "trace-locked-invalid": lambda: sub("docs/sdd-pathways.md", r"^\*\*Last reconciled:\*\*.*$", "**Last reconciled:** 2026-13-45"),
    "trace-applied-cr": lambda: write("docs/cr-x.md", "**Status:** Applied\n\n| Area | Affected | Done |\n|---|---|---|\n| API | Yes | [ ] |\n| UI | No | [ ] |\n| DB | Yes | [x] |\n"),
    "trace-index-version": lambda: (sub("docs/sdd-pathways.md", r"^\*\*Version:\*\* .*$", "**Version:** 9.9"), sub("docs/sdd-pathways.md", r"^\*\*Status:\*\* Locked", "**Status:** Draft")),
    "trace-index-missing-file": lambda: delete("docs/qad-pathways.md"),
    "trace-sdd-contracts": lambda: write("docs/sdd-x.md", "**Status:** Draft\n\n**Table: `a`**\n\n**Table: `b`**\n\n| Method | Path | Purpose |\n|---|---|---|\n| GET | /a | a |\n| GET | /b | b |\n| GET | /c | c |\n"),
    "coverage-missing": lambda: write("docs/sdd-pathways.md", "# SDD\n\n**Status:** Draft\n\nNo ids.\n"),
    "coverage-no-table": lambda: sub("docs/prd-pathways.md", r"^\| ID \| Feature \| Priority \|", "| Key | Feature | Rank |"),
    "coverage-no-rows": lambda: write("docs/prd-pathways.md", "**Status:** Draft\n\nPRD-F1 is a feature.\n\n| ID | Feature | Priority |\n|---|---|---|\n"),
    "coverage-no-must": lambda: write("docs/prd-pathways.md", "**Status:** Draft\n\n| ID | Feature | Priority |\n|---|---|---|\n| PRD-F1 | A | Low |\n"),
    "currency-old": lambda: (append("docs/build-pathways.md", "\nVerified 2020-01-01 and 2020-13-45.\n"), append("AGENTS.md", "\nverified 2020-02-02\nplain 2020-03-03\n")),
    "filing-stray": lambda: (write("prd-stray.md", "# stray\n"), delete("docs/state.md")),
    "project-specific": lambda: write("docs/x-note.md", "**Class:** Project-specific\n\n**Purpose:** a\n"),
    "agents-model": lambda: sub(".claude/agents/restraint-guardian.md", r"^model: opus", "model: haiku"),
    "agents-invalid": lambda: sub(".claude/agents/restraint-guardian.md", r"^model: opus", "model: gpt"),
    "agents-extra": lambda: (write(".claude/agents/extra-agent.md", "---\nname: extra-agent\nmodel: opus\n---\n"), delete(".claude/agents/design-qa-agent.md")),
    "agents-no-roster": lambda: sub("docs/sad-pathways.md", r"^\| Specialist \|", "| Role |"),
}
# Command line cases that need no fault.
args_cases = {
    "default": ["docs"],
    "strict": ["docs", "--strict"],
    "unknown-check": ["docs", "--only", "nosuch"],
    "missing-target": ["no-such-dir"],
    "no-markdown": [".tmp/w2/empty-dir"],
    **{f"only-{c}": ["docs", "--only", c] for c in ("agents", "voice", "scrutiny", "inception", "trace", "coverage", "currency", "filing", "project-specific")},
}
Path(".tmp/w2/empty-dir").mkdir(parents=True, exist_ok=True)

hit = {}


def tracer(frame, event, arg):
    if "scripts/docs/" not in frame.f_code.co_filename:
        return None
    hit.setdefault(frame.f_code.co_filename, set())

    def local(frame, event, arg):
        if event == "line":
            hit[frame.f_code.co_filename].add(frame.f_lineno)
        return local

    hit[frame.f_code.co_filename].add(frame.f_lineno)
    return local


def run(script, argv, trace):
    out = io.StringIO()
    code = 0
    old_argv = sys.argv
    sys.argv = [script, *argv]
    try:
        with contextlib.redirect_stdout(out):
            if trace:
                sys.settrace(tracer)
            try:
                runpy.run_path(script, run_name="__main__")
            finally:
                sys.settrace(None)
    except SystemExit as stop:
        code = stop.code if isinstance(stop.code, int) else 1
    finally:
        sys.argv = old_argv
    return out.getvalue(), code


def compare(label, argv):
    old = run(old_script, argv, False)
    new = run(new_script, argv, True)
    if old != new:
        print(f"DIFFERENT {label}")
        print(old[0][-400:], "\n----\n", new[0][-400:])
    return old, old == new


base_out = compare("base", [str(tree / "docs")])[0]
same = diff = bit = 0
for name, argv in args_cases.items():
    argv = [str(tree / argv[0]) if argv[0] == "docs" else argv[0], *argv[1:]]
    _, ok = compare(name, argv)
    same, diff = same + ok, diff + (not ok)
print(f"command line cases: {len(args_cases)}, identical {same}, different {diff}")
same = diff = 0
for name, fault in faults.items():
    fault()
    out, ok = compare(name, [str(tree / "docs")])
    revert()
    same, diff, bit = same + ok, diff + (not ok), bit + (out != base_out)
print(f"fault cases: {len(faults)}, identical {same}, different {diff}, changed the output {bit}")

# Executable lines of the new modules, from their line tables.
total = covered = 0
for file in sorted([Path("scripts/docs/check.py"), *Path("scripts/docs/checks").glob("*.py")]):
    code = compile(file.read_text(encoding="utf-8"), str(file.resolve()), "exec")
    stack, lines = [code], set()
    while stack:
        current = stack.pop()
        lines |= {line for _, _, line in current.co_lines() if line}
        stack += [c for c in current.co_consts if hasattr(c, "co_code")]
    seen = hit.get(str(file.resolve()), set()) & lines
    total, covered = total + len(lines), covered + len(seen)
    missed = sorted(lines - seen)
    print(f"{file}: {len(seen)}/{len(lines)}" + (f" missed {missed}" if missed else ""))
print(f"line coverage {covered}/{total}")
shutil.rmtree(tree)
sys.exit(1 if diff else 0)
```

```bash
python3 .tmp/w2/docs-compare.py .tmp/w2/check-before.py
git status --short | grep -v "scripts/docs" || echo "nothing outside scripts/docs"
```

Expected: the 14 command lines are identical, the 39 faults are identical and every fault changed the output (a fault that changed nothing would prove nothing), and the traced lines are 715 of 762:

```
command line cases: 14, identical 14, different 0
fault cases: 39, identical 39, different 0, changed the output 39
scripts/docs/check.py: 61/62 missed [89]
scripts/docs/checks/__init__.py: 1/1
scripts/docs/checks/agents.py: 41/43 missed [19, 35]
scripts/docs/checks/common.py: 49/55 missed [13, 14, 55, 81, 82, 84]
scripts/docs/checks/coverage.py: 54/60 missed [37, 46, 47, 50, 68, 85]
scripts/docs/checks/currency.py: 24/26 missed [16, 22]
scripts/docs/checks/filing.py: 20/23 missed [34, 35, 36]
scripts/docs/checks/inception.py: 57/62 missed [28, 30, 35, 49, 67]
scripts/docs/checks/project_specific.py: 25/28 missed [26, 29, 30]
scripts/docs/checks/scrutiny.py: 71/74 missed [25, 47, 58]
scripts/docs/checks/trace.py: 166/172 missed [43, 48, 79, 82, 191, 198]
scripts/docs/checks/voice.py: 146/156 missed [144, 145, 157, 270, 271, 272, 273, 274, 275, 276]
line coverage 715/762
nothing outside scripts/docs
```

The uncovered lines are the branches that need an unusual tree.

The lines the cases do not reach are the branches that need an unusual tree (an unreadable file, a Locked document with a malformed table); Task 4 covers the branches that matter with unit tests. The copy lives in `.tmp/w2/fault-tree` and is removed by the script.

- [ ] **Step 5: The command, through `pnpm` and from another folder**

```bash
python3 scripts/docs/check.py docs > .tmp/w2/docs-after.txt; echo "exit $?"
cmp .tmp/w2/docs-before.txt .tmp/w2/docs-after.txt && echo "same output"
python3 scripts/docs/check.py docs --strict > .tmp/w2/docs-after-strict.txt; echo "strict exit $?"
cmp .tmp/w2/docs-before-strict.txt .tmp/w2/docs-after-strict.txt && echo "same strict output"
pnpm docs:check 2>&1 | tail -n 3
R="$PWD"; (cd /tmp && python3 "$R/scripts/docs/check.py" "$R/docs" --only voice | tail -n 1)
python3 scripts/docs/check.py docs --only nosuch; echo "exit $?"
find scripts/docs -name '__pycache__' -prune -o -type f -print | sort
git status --short
```

Expected: the command through `pnpm` and from another folder prints the same output, the unknown check exits 2, and the files:

```
exit 0
same output
strict exit 0
same strict output
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
0 failure(s), 0 warning(s) over checks: voice
unknown check: nosuch
exit 2
scripts/docs/check.py
scripts/docs/checks/__init__.py
scripts/docs/checks/agents.py
scripts/docs/checks/common.py
scripts/docs/checks/coverage.py
scripts/docs/checks/currency.py
scripts/docs/checks/filing.py
scripts/docs/checks/inception.py
scripts/docs/checks/project_specific.py
scripts/docs/checks/scrutiny.py
scripts/docs/checks/trace.py
scripts/docs/checks/voice.py
scripts/docs/materialize.py
 M scripts/docs/check.py
?? scripts/docs/checks/
```

- [ ] **Step 6: Commit**

```bash
git add scripts/docs
git status --short
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(docs): split check.py into one module per check

The $(wc -l < .tmp/w2/check-before.py) line tool becomes an entry point and a checks package of ten modules; every line is kept, the output and exit code are identical on the real docs and on 39 injected faults, and the command and options do not change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -n 14
```

Expected: one commit with the entry point rewritten and eleven new files:

```
M  scripts/docs/check.py
A  scripts/docs/checks/__init__.py
A  scripts/docs/checks/agents.py
A  scripts/docs/checks/common.py
A  scripts/docs/checks/coverage.py
A  scripts/docs/checks/currency.py
A  scripts/docs/checks/filing.py
A  scripts/docs/checks/inception.py
A  scripts/docs/checks/project_specific.py
A  scripts/docs/checks/scrutiny.py
A  scripts/docs/checks/trace.py
A  scripts/docs/checks/voice.py
[claude/modularization-s8b-xjnlzt <sha>] refactor(docs): split check.py into one module per check
 12 files changed, 1040 insertions(+), 976 deletions(-)
 create mode 100644 scripts/docs/checks/__init__.py
 create mode 100644 scripts/docs/checks/agents.py
 create mode 100644 scripts/docs/checks/common.py
 create mode 100644 scripts/docs/checks/coverage.py
 create mode 100644 scripts/docs/checks/currency.py
 create mode 100644 scripts/docs/checks/filing.py
 create mode 100644 scripts/docs/checks/inception.py
 create mode 100644 scripts/docs/checks/project_specific.py
 create mode 100644 scripts/docs/checks/scrutiny.py
 create mode 100644 scripts/docs/checks/trace.py
 create mode 100644 scripts/docs/checks/voice.py
<sha> refactor(docs): split check.py into one module per check
 scripts/docs/check.py                   | 986 +-------------------------------
 scripts/docs/checks/__init__.py         |   1 +
 scripts/docs/checks/agents.py           |  50 ++
 scripts/docs/checks/common.py           |  85 +++
 scripts/docs/checks/coverage.py         |  86 +++
 scripts/docs/checks/currency.py         |  32 ++
 scripts/docs/checks/filing.py           |  39 ++
 scripts/docs/checks/inception.py        |  94 +++
 scripts/docs/checks/project_specific.py |  38 ++
 scripts/docs/checks/scrutiny.py         | 108 ++++
 scripts/docs/checks/trace.py            | 220 +++++++
 scripts/docs/checks/voice.py            | 277 +++++++++
 12 files changed, 1040 insertions(+), 976 deletions(-)
```



---

### Task 4: Unit tests for the documentation checks, run in the `tooling` job

**Files:**
- Create: `scripts/docs/test_checks.py`
- Create (gitignored): `.tmp/w2/mutations-docs.json`, `task4-ci-edits.json`
- Modify: `.github/workflows/ci.yml` (one step of the `tooling` job)

The old `check.py` had no test of its own: the only proof that a check still fires was a run over the real docs, which pass or fail for reasons of content. The new modules can be called one at a time on a small synthetic tree, so `test_checks.py` holds one passing and at least one failing fixture for each of the nine checks, the shared helpers, the table of checks and the command line contract (exit codes 0, 1 and 2, `--strict`, `--only`). It follows `scripts/migrations/test_*.py`: `unittest`, no dependency, found by `discover -s scripts/docs -p "test_*.py"` (the start folder is on the path, so `import check` and `from checks.voice import ...` resolve as they do when the script runs).

- [ ] **Step 1: Create the test file and run it**

Create `scripts/docs/test_checks.py` with the Write tool exactly as printed.

Create `scripts/docs/test_checks.py`:

```py
"""Tests of the documentation checks: each check on a small synthetic tree, the shared helpers and the command line contract."""

import contextlib
import io
import tempfile
import unittest
from datetime import date
from pathlib import Path

import check
from checks.agents import check_agents
from checks.common import docs_ancestor, docs_roots, is_change_layer_path, parse_tables
from checks.coverage import check_coverage
from checks.currency import check_currency
from checks.filing import check_filing
from checks.inception import check_inception
from checks.project_specific import check_project_specific
from checks.scrutiny import check_scrutiny
from checks.trace import check_cr_propagation
from checks.voice import check_voice

EM = "\u2014"
SCRUTINY = "**Status:** Working\n\nClaims extracted: 1\n\n| # | Claim | Finding | Source |\n|---|---|---|---|\n| 1 | a | Verified | {source} |\n"
PRD = "**Status:** {status}\n\n| ID | Feature | Priority |\n|---|---|---|\n| PRD-F1 | A | Must-Have |\n"
SAD = "| Specialist | Model |\n|---|---|\n| qa-agent | opus |\n"
IDEA = "**Status:** " "Locked\n\n**One-line pitch:** a\n**Problem:** {problem}\n**Insight (why us, why now):** a\n**Primary user (named, specific):** a\n**Their moment of pain:** a\n**If we only ship one thing:** a\n"


class Tree(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def put(self, files):
        for name, text in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    def run_check(self, fn, files, **kwargs):
        self.put(files)
        return fn(self.root, **kwargs)

    def assertOneMessage(self, messages, *fragments):
        self.assertEqual(len(messages), 1, messages)
        for fragment in fragments:
            self.assertIn(fragment, messages[0])


class CommonHelpers(Tree):
    def test_parse_tables_reads_header_and_rows(self):
        self.assertEqual(parse_tables("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n"), [(["a", "b"], [["1", "2"], ["3", "4"]])])
        self.assertEqual(parse_tables("no table here"), [])

    def test_docs_ancestor_and_change_layer(self):
        self.assertEqual(docs_ancestor(Path("/x/docs/a/b.md")), Path("/x/docs"))
        self.assertIsNone(docs_ancestor(Path("/x/other/b.md")))
        self.assertTrue(is_change_layer_path(Path("/x/docs/specs/a.md")))
        self.assertTrue(is_change_layer_path(Path("/x/docs/archive/a.md")))
        self.assertFalse(is_change_layer_path(Path("/x/docs/a.md")))

    def test_docs_roots_skip_benchmarks(self):
        self.put({"docs/a.md": "x", "other/docs/benchmarks/b.md": "x"})
        self.assertEqual(docs_roots(self.root), {self.root / "docs"})


class Voice(Tree):
    def test_clean_docs_pass(self):
        self.assertEqual(self.run_check(check_voice, {"docs/a.md": "# A\n\nPlain words, one idea.\n"}), ([], []))

    def test_em_dash_fails_with_line_number(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": f"# A\n\nA word {EM} another.\n"})
        self.assertOneMessage(fails, "a.md:3", "em-dash")

    def test_double_hyphen_fails_outside_code_only(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "A word -- another.\n\n```\nls --all\n```\n"})
        self.assertOneMessage(fails, "a.md:1", "'--'")

    def test_spaced_en_dash_fails_but_a_range_passes(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "A word \u2013 another.\n\nPages 1\u20133.\n"})
        self.assertOneMessage(fails, "a.md:1", "en-dash")

    def test_banned_phrase_and_ai_artifact_fail(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "It is game-" "changing.\n\nSee oaicite here.\n"})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("banned phrase", fails[0])
        self.assertIn("markup artifact", fails[1])

    def test_public_surface_leak_fails(self):
        fails, _ = self.run_check(check_voice, {"docs/pitch-x.md": "See PRD-F1 here.\n"})
        self.assertOneMessage(fails, "pitch-x.md:1", "traceability ID")

    def test_guide_file_em_dash_fails(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "ok\n", "CLAUDE.md": f"A {EM} B\n"})
        self.assertOneMessage(fails, "CLAUDE.md:1")


class Scrutiny(Tree):
    def test_verified_claim_with_a_url_passes(self):
        self.assertEqual(self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="https://example.org/a")}), ([], []))

    def test_missing_coverage_line_fails(self):
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": "**Status:** Working\n"})
        self.assertOneMessage(fails, "claim-coverage")

    def test_verified_claim_without_a_source_fails(self):
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="-")})
        self.assertOneMessage(fails, "no source")

    def test_free_text_source_only_warns(self):
        fails, warns = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="the manuscript")})
        self.assertEqual(fails, [])
        self.assertOneMessage(warns, "free-text")

    def test_locked_do_not_build_fails_and_blocks_suite_docs(self):
        text = "**Status:** " "Locked\n\nDecision: DO NOT BUILD YET\n\nClaims extracted: 0\n"
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": text, "docs/prd-x.md": "x"})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("Locked with Decision", fails[0])
        self.assertIn("prd-x.md", fails[1])


class Inception(Tree):
    def test_locked_idea_with_every_field_passes(self):
        self.assertEqual(self.run_check(check_inception, {"docs/idea-x.md": IDEA.format(problem="Real problem")}), ([], []))

    def test_hollow_field_fails(self):
        fails, _ = self.run_check(check_inception, {"docs/idea-x.md": IDEA.format(problem="TBD")})
        self.assertOneMessage(fails, "hollow 'Problem'")

    def test_draft_idea_is_not_checked(self):
        self.assertEqual(self.run_check(check_inception, {"docs/idea-x.md": "**Status:** Draft\n"}), ([], []))

    def test_locked_pitch_without_idea_link_warns(self):
        _, warns = self.run_check(check_inception, {"docs/pitch-x.md": "**Status:** " "Locked\n"})
        self.assertOneMessage(warns, "no IDEA link")


class Trace(Tree):
    def test_applied_cr_with_an_unticked_affected_row_fails(self):
        text = "**Status:** Applied\n\n| Area | Affected | Done |\n|---|---|---|\n| API | Yes | [ ] |\n| UI | No | [ ] |\n| DB | Yes | [x] |\n"
        fails, _ = self.run_check(check_cr_propagation, {"docs/cr-x.md": text})
        self.assertOneMessage(fails, "row 1", "propagation incomplete")

    def test_draft_cr_is_not_checked(self):
        text = "**Status:** Draft\n\n| Area | Affected | Done |\n|---|---|---|\n| API | Yes | [ ] |\n"
        self.assertEqual(self.run_check(check_cr_propagation, {"docs/cr-x.md": text}), ([], []))


class Coverage(Tree):
    def test_must_have_cited_in_sdd_and_qad_passes(self):
        files = {"docs/prd-x.md": PRD.format(status="Locked"), "docs/sdd-x.md": "PRD-F1", "docs/qad-x.md": "PRD-F1"}
        self.assertEqual(self.run_check(check_coverage, files), ([], []))

    def test_uncited_must_have_warns_in_a_draft_and_fails_when_locked(self):
        files = {"docs/sdd-x.md": "none", "docs/qad-x.md": "PRD-F1"}
        fails, warns = self.run_check(check_coverage, {**files, "docs/prd-x.md": PRD.format(status="Draft")})
        self.assertEqual(fails, [])
        self.assertOneMessage(warns, "sdd-x.md", "PRD-F1")
        fails, warns = self.run_check(check_coverage, {**files, "docs/prd-x.md": PRD.format(status="Locked")})
        self.assertEqual(warns, [])
        self.assertOneMessage(fails, "sdd-x.md", "PRD-F1")

    def test_unparsable_feature_table_warns(self):
        _, warns = self.run_check(check_coverage, {"docs/prd-x.md": "PRD-F1 is a feature.\n"})
        self.assertOneMessage(warns, "could not parse a feature table")


class Currency(Tree):
    def test_old_build_date_warns_and_a_recent_one_does_not(self):
        _, warns = self.run_check(check_currency, {"docs/build-x.md": "Verified 2020-01-01.\n"})
        self.assertOneMessage(warns, "build-x.md:1", "2020-01-01")
        self.assertEqual(self.run_check(check_currency, {"docs/build-x.md": f"Verified {date.today()}.\n"}), ([], []))

    def test_guide_dates_need_a_verification_cue(self):
        _, warns = self.run_check(check_currency, {"AGENTS.md": "verified 2020-02-02\nplain 2020-03-03\n"})
        self.assertOneMessage(warns, "AGENTS.md:1")

    def test_max_age_days_is_honoured(self):
        _, warns = self.run_check(check_currency, {"docs/build-x.md": f"Verified {date.today()}.\n"}, max_age_days=-1)
        self.assertOneMessage(warns, "over -1 days")


class Filing(Tree):
    def test_registered_doc_outside_docs_fails(self):
        fails, _ = self.run_check(check_filing, {"prd-stray.md": "x", "docs/state.md": "x"})
        self.assertOneMessage(fails, "prd-stray.md", "PRD doc")

    def test_docs_without_state_warn(self):
        fails, warns = self.run_check(check_filing, {"docs/prd-x.md": "x"})
        self.assertEqual(fails, [])
        self.assertOneMessage(warns, "no state.md")


class ProjectSpecific(Tree):
    def test_missing_header_fields_warn(self):
        _, warns = self.run_check(check_project_specific, {"docs/x-note.md": "**Class:** Project-specific\n\n**Purpose:** a\n"})
        self.assertEqual([w.rsplit("missing ", 1)[1] for w in warns], ["Owner", "Why baseline insufficient", "Status", "Promotion"])

    def test_change_layer_and_other_classes_are_skipped(self):
        files = {"docs/specs/x.md": "**Class:** Project-specific\n", "docs/y.md": "**Class:** Baseline\n"}
        self.assertEqual(self.run_check(check_project_specific, files), ([], []))


class Agents(Tree):
    def agent(self, name, model):
        return {f".claude/agents/{name}.md": f"---\nname: {name}\nmodel: {model}\n---\n"}

    def test_matching_roster_passes(self):
        files = {"docs/sad-pathways.md": SAD, **self.agent("qa-agent", "opus")}
        self.assertEqual(self.run_check(check_agents, files), ([], []))

    def test_model_differing_from_the_roster_fails(self):
        fails, _ = self.run_check(check_agents, {"docs/sad-pathways.md": SAD, **self.agent("qa-agent", "haiku")})
        self.assertOneMessage(fails, "qa-agent.md", "differs from SAD")

    def test_role_without_a_definition_and_an_unlisted_agent_fail(self):
        fails, _ = self.run_check(check_agents, {"docs/sad-pathways.md": SAD, **self.agent("extra-agent", "opus")})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("has no .claude/agents definition", fails[0])
        self.assertIn("not in the SAD roster", fails[1])


class CommandLine(Tree):
    def main(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = check.main(list(argv))
        return code, out.getvalue()

    def test_every_check_is_registered(self):
        self.assertEqual(list(check.CHECKS), ["agents", "voice", "scrutiny", "inception", "trace", "coverage", "currency", "filing", "project-specific"])

    def test_clean_tree_exits_zero_with_a_summary(self):
        self.put({"docs/state.md": "# State\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "voice")
        self.assertEqual(code, 0)
        self.assertTrue(out.endswith("0 failure(s), 0 warning(s) over checks: voice\n"), out)

    def test_failure_exits_one_and_prints_it(self):
        self.put({"docs/state.md": f"A {EM} B\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "voice")
        self.assertEqual(code, 1)
        self.assertIn("FAIL  [voice]", out)

    def test_warning_fails_only_with_strict(self):
        self.put({"docs/x-note.md": "**Class:** Project-specific\n"})
        self.assertEqual(self.main(str(self.root / "docs"), "--only", "project-specific")[0], 0)
        code, out = self.main(str(self.root / "docs"), "--only", "project-specific", "--strict")
        self.assertEqual(code, 1)
        self.assertIn("WARN  [project-specific]", out)

    def test_bad_input_exits_two(self):
        self.assertEqual(self.main(str(self.root / "missing"))[0], 2)
        self.assertEqual(self.main(str(self.root))[0], 2)
        self.put({"docs/state.md": "# State\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "nosuch")
        self.assertEqual((code, out), (2, "unknown check: nosuch\n"))


if __name__ == "__main__":
    unittest.main()
```

```bash
python3 -m unittest discover -s scripts/docs -p "test_*.py" 2>&1 | tail -n 4
python3 -m unittest discover -s scripts/docs -p "test_*.py" -v 2>&1 | grep -c "ok$"
git status --short
```

Expected: the 39 tests pass:

```
----------------------------------------------------------------------
Ran 39 tests in <ms>

OK
39
?? scripts/docs/test_checks.py
```

- [ ] **Step 2: Prove that the tests catch their mutations**

`mutate.py` (Task 2) applies the sixteen mutations of `mutations-docs.json` one at a time: it breaks one rule of each check module (the benchmarks skip, the archive skip of the change layer, the code fence skip of the voice check, the banned phrase test, the verified-claim test, the locked blocking decision, the hollow idea value, the CR propagation test, the locked coverage failure, the currency age test, the filing folder test, the change layer skip of the project-specific check, the agent model comparison), the strict flag, the exit code of an unknown check and the registration of one check, and runs the unit tests against each. Every mutation must make the run fail.

Create `.tmp/w2/mutations-docs.json`:

```json
[
 [
  "scripts/docs/checks/common.py",
  "if \"benchmarks\" in p.parts:",
  "if False:"
 ],
 [
  "scripts/docs/checks/common.py",
  "parts[docs_i + 1] in {\"specs\", \"changes\", \"archive\"}",
  "parts[docs_i + 1] in {\"specs\", \"changes\"}"
 ],
 [
  "scripts/docs/checks/voice.py",
  "if not in_code and _dashdash_as_punct(line):",
  "if _dashdash_as_punct(line):"
 ],
 [
  "scripts/docs/checks/voice.py",
  "if phrase in joined:",
  "if phrase in joined and False:"
 ],
 [
  "scripts/docs/checks/scrutiny.py",
  "return cell.strip().lower() == \"verified\"",
  "return cell.strip().lower() != \"verified\""
 ],
 [
  "scripts/docs/checks/scrutiny.py",
  "if locked and decision and \"DO NOT BUILD YET\" in decision.group(1).upper():",
  "if False:"
 ],
 [
  "scripts/docs/checks/inception.py",
  "low in {\"tbd\", ",
  "low in {\"tbx\", "
 ],
 [
  "scripts/docs/checks/trace.py",
  "if affected not in (\"yes\", \"y\"):",
  "if affected not in (\"no\",):"
 ],
 [
  "scripts/docs/checks/coverage.py",
  "\\bLocked\\b\", ptext",
  "\\bLockedx\\b\", ptext"
 ],
 [
  "scripts/docs/checks/currency.py",
  "(today - when).days > max_age_days",
  "(today - when).days > max_age_days + 99999"
 ],
 [
  "scripts/docs/checks/filing.py",
  "if docs_ancestor(p) is not None:\n            continue",
  "if docs_ancestor(p) is None:\n            continue"
 ],
 [
  "scripts/docs/checks/project_specific.py",
  "if is_change_layer_path(p):",
  "if False:"
 ],
 [
  "scripts/docs/checks/agents.py",
  "elif name in roster and roster[name] != model:",
  "elif name in roster and roster[name] == model:"
 ],
 [
  "scripts/docs/check.py",
  "if args.strict and all_warn:",
  "if all_warn:"
 ],
 [
  "scripts/docs/check.py",
  "print(f\"unknown check: {name}\")\n            return 2",
  "print(f\"unknown check: {name}\")\n            return 1"
 ],
 [
  "scripts/docs/check.py",
  "    \"filing\": check_filing,\n",
  ""
 ]
]
```

```bash
python3 .tmp/w2/mutate.py .tmp/w2/mutations-docs.json python3 -m unittest discover -s scripts/docs -p "test_*.py"
git status --short
```

Expected: all sixteen mutations are caught:

```
caught   scripts/docs/checks/common.py: if "benchmarks" in p.parts:
caught   scripts/docs/checks/common.py: parts[docs_i + 1] in {"specs", "changes", "archive"}
caught   scripts/docs/checks/voice.py: if not in_code and _dashdash_as_punct(line):
caught   scripts/docs/checks/voice.py: if phrase in joined:
caught   scripts/docs/checks/scrutiny.py: return cell.strip().lower() == "verified"
caught   scripts/docs/checks/scrutiny.py: if locked and decision and "DO NOT BUILD YET" in decision.group(1).upp
caught   scripts/docs/checks/inception.py: low in {"tbd", 
caught   scripts/docs/checks/trace.py: if affected not in ("yes", "y"):
caught   scripts/docs/checks/coverage.py: \bLocked\b", ptext
caught   scripts/docs/checks/currency.py: (today - when).days > max_age_days
caught   scripts/docs/checks/filing.py: if docs_ancestor(p) is not None:
caught   scripts/docs/checks/project_specific.py: if is_change_layer_path(p):
caught   scripts/docs/checks/agents.py: elif name in roster and roster[name] != model:
caught   scripts/docs/check.py: if args.strict and all_warn:
caught   scripts/docs/check.py: print(f"unknown check: {name}")
caught   scripts/docs/check.py:     "filing": check_filing,
caught 16 of 16
?? scripts/docs/test_checks.py
```

- [ ] **Step 3: Add the step to the `tooling` job**

The step goes after the migration checks. The job name stays as it is: a renamed job is a renamed required check.

Create `.tmp/w2/task4-ci-edits.json`:

```json
[
 [
  ".github/workflows/ci.yml",
  "      - name: Test migration comparison scripts\n        run: python3 -m unittest discover -s scripts/migrations -p \"test_*.py\"\n",
  "      - name: Test migration comparison scripts\n        run: python3 -m unittest discover -s scripts/migrations -p \"test_*.py\"\n\n      - name: Test documentation check scripts\n        run: python3 -m unittest discover -s scripts/docs -p \"test_*.py\"\n",
  1
 ]
]
```

```bash
node .tmp/w2/replace-exact.mjs .tmp/w2/task4-ci-edits.json
git diff --stat | tail -n 2
python3 - <<'PY'
import yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
print('jobs', list(d['jobs']))
print('tooling steps', [s['name'] for s in d['jobs']['tooling']['steps']])
PY
```

Expected: one replacement, three added lines, and the `tooling` job has the new step after the migration step:

```
1 replacements in 1 files
 .github/workflows/ci.yml | 3 +++
 1 file changed, 3 insertions(+)
jobs ['validate', 'tooling', 'sad']
tooling steps ['Checkout', 'Setup Node.js', 'Test database scripts and the security adapter output check', 'Test migration comparison scripts', 'Test documentation check scripts', 'Test replay helper scripts']
```

The workflow parses as YAML (`python3` with `yaml`; where the module is missing, record "pending CI").

- [ ] **Step 4: Run the job's commands on a clean export**

The export holds the tracked files of the working tree and no `node_modules`, so a dependency the tests need would fail here as it would in the job. The new files are staged first, because `git ls-files` lists tracked files only.

```bash
git add scripts/docs .github/workflows/ci.yml
E=.tmp/w2/export
rm -rf $E && mkdir -p $E
git ls-files -z | tar --null -T - -cf - | tar -xf - -C $E
test -d $E/node_modules && echo "node_modules present" || echo "no node_modules"
(cd $E && npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)")
(cd $E && python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -n 3)
(cd $E && python3 -m unittest discover -s scripts/docs -p "test_*.py" 2>&1 | tail -n 3)
rm -rf $E
git status --short
```

Expected: in a tree without `node_modules` the node tests keep 199 (185 pass, 14 skipped) and both Python suites pass (13 and 39):

```
no node_modules
# tests 199
# pass 185
# fail 0
# skipped 14
Ran 13 tests in <ms>

OK
Ran 39 tests in <ms>

OK
M  .github/workflows/ci.yml
A  scripts/docs/test_checks.py
```

- [ ] **Step 5: Commit**

```bash
git add scripts/docs/test_checks.py .github/workflows/ci.yml
git status --short
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(docs): unit tests for the documentation checks, run in the tooling job

One passing and one failing fixture per check, the shared helpers, the table of checks and the command line contract; sixteen mutations of the check modules are all caught.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -n 4
```

Expected: one commit with the new test file and the workflow:

```
M  .github/workflows/ci.yml
A  scripts/docs/test_checks.py
[claude/modularization-s8b-xjnlzt <sha>] test(docs): unit tests for the documentation checks, run in the tooling job
 2 files changed, 266 insertions(+)
 create mode 100644 scripts/docs/test_checks.py
<sha> test(docs): unit tests for the documentation checks, run in the tooling job
 .github/workflows/ci.yml    |   3 +
 scripts/docs/test_checks.py | 263 ++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 266 insertions(+)
```



---

### Task 5: Split the three large api tests

**Files:**
- Create (gitignored): `.tmp/w2/split-test.mjs`, `split-guard.json`, `split-imports.json`, `split-reports.json`, `api-split-vars.sh`, `mutations-api-splits.json`, the `*-before.ts` and `*-before.json` copies
- Create: `supabase-auth.guard.{harness,http-boundary.test,step-up.test,step-up-pin.test}.ts` beside `supabase-auth.guard.ts`; `imports.service.{harness,upload-mapping.test,validation.test,processing.test}.ts` beside `imports.service.ts`; `reports.service.{harness,source-artifacts.test,evaluation-kinds.test,sections.test}.ts` beside `reports.service.ts`
- Delete: `supabase-auth.guard.test.ts` (1140 lines), `imports.service.test.ts` (861) and `reports.service.test.ts` (836), the line counts at the W1 tip, which Step 1 prints

CR 3.5 says tests above about 600 lines split by concern. W1 split the analytics service test; Task 0 listed the test files above 600 lines, and ruling 6 picks the ones above 800 lines that no earlier slice splits. These three api tests share a large fixture block (a Nest test app, an in-memory `tx`, mocked storage, the hoisted `state` of a mocked `withAuthorizedOperation`), which is why they grew, so each splits the way the analytics test did: the shared fixtures move to `<file>.harness.ts` and the tests to `<file>.<concern>.test.ts`, with no test line changed.

The splitter `split-test.mjs` uses the TypeScript compiler API, so it cuts on statements, not on text. The statements before the first test move to the harness and get an `export` where a test file uses them; the hooks of the divided `describe` become a harness function (`useBoundaryApp`, `useImportsHarness`, `useReportsHarness`) that each test file calls first inside its own `describe`; the tests are divided at the first test or `describe` whose first line matches the spec. A harness that holds `vi.mock` calls is imported first by every test file, and Biome's import sorting is switched off in that file with a comment, so the mocks register before the other imports load (sorting would put the relative import last). A variable made by `vi.hoisted` is exported by name, because Vitest refuses `export const x = vi.hoisted(...)`.

- [ ] **Step 1: Save the originals and their test titles**

```bash
for n in supabase-auth.guard imports.service reports.service; do
  T=$(git ls-files apps/api/src | grep "/$n.test.ts$")
  echo "$T"
  wc -l < "$T"
  grep -c -E "^(  )?(it|it\.each)\(" "$T"
  grep -n -E "^describe\(|^vi\.mock\(|^const state = vi\.hoisted" "$T" | cut -c1-110
  cp "$T" ".tmp/w2/$n-before.ts"
  node .tmp/w2/test-titles.mjs save api ".tmp/w2/$n-before.json" "$T"
done
```

Expected: for each of the three files: the path, its size, the number of lines that start a test (fewer than the saved titles, which count the `it.each` rows), the anchor lines the spec names, and the saved titles (63, 24 and 39):

```
apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
1140
36
326:describe('SupabaseAuthGuard local HTTP fail-closed boundary', () => {
659:describe('Beneficiary step-up (cr-pathways-beneficiary-step-up)', () => {
855:describe('Beneficiary step-up PIN fallback (cr-pathways-beneficiary-step-up-pin)', () => {
files 1, tests 63, failed 0
apps/api/src/modules/imports/imports.service.test.ts
861
23
20:const state = vi.hoisted(() => ({
26:vi.mock('../../common/authz/authorized-operation', () => ({
104:describe('P03 import service', () => {
files 1, tests 24, failed 0
apps/api/src/modules/reports/reports.service.test.ts
836
22
21:const state = vi.hoisted(() => ({
29:vi.mock('../../common/authz/authorized-operation', () => ({
45:vi.mock('@pathways/config', async (original) => ({
53:vi.mock('./report-artifact', () => ({
143:describe('report source authority, privacy and artifact recovery', () => {
files 1, tests 39, failed 0
```

The sizes (1140, 861 and 836) and the line numbers are the replay's; a spec stops with the title it cannot find, so a file edited since is detected here, and a file that is no longer above 800 lines is left out of the split and listed in section 9.

- [ ] **Step 2: Create the splitter and the three specs, and split**

A spec names the source file (a file name that is unique among the tracked files), the harness, the hook function, the divided `describe` (`scope`, absent when the file has several top-level `describe` blocks and those are divided), and the parts: each part starts at the first test or `describe` whose first line matches `first`. The splitter stops when a `first` matches nothing, when the parts are out of order, when text between the statements of the scope would be dropped, or when a hook has no name. Create each file with the Write tool exactly as printed.

Create `.tmp/w2/split-test.mjs`:

```js
// Splits one oversized test file into a harness module and test files by concern, keeping every statement of the original unchanged.
// Usage: node .tmp/w2/split-test.mjs <spec.json>
// spec: { source (a path, or a file name that is unique among the tracked files), harness, hooks?, scope?, perFile: [regex], parts: [{ name, first } | { name, rest: true }] }
//  - perFile statements (matched on their trimmed first line) are copied into every test file; every other preamble statement moves to the harness.
//  - scope is the title of the top-level describe whose direct tests are divided; without it the top-level describes are divided.
//  - hooks names a harness function that wraps the hooks of the scope (beforeEach and the like), called first inside the describe of each test file.
//  - topHooks names a harness function that wraps the file-level hooks when there is a scope, called before the describe of each test file.
//  - when the harness holds vi.mock calls, each test file imports it first and Biome import sorting is switched off there so the mocks register before the other imports load.
//  - a part starts at the first test or describe of its scope whose first line matches `first`; the part with `rest` takes the statements after the scope describe.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'))
// A source without a folder is found among the tracked files, so a file that an earlier slice moved is still found.
if (!spec.source.includes('/')) {
  const found = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((file) => file.endsWith(`/${spec.source}`))
  if (found.length !== 1) throw new Error(`${spec.source}: ${found.length} tracked files match`)
  spec.source = found[0]
}
const text = readFileSync(spec.source, 'utf8')
const dir = path.dirname(spec.source)
const ext = path.extname(spec.source)
const base = path.basename(spec.source).replace(/\.test\.tsx?$/, '')
const file = ts.createSourceFile(spec.source, text, ts.ScriptTarget.Latest, true, ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const perFile = (spec.perFile ?? []).map((pattern) => new RegExp(pattern))
const hookNames = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll'])
const fail = (message) => {
  throw new Error(`${spec.source}: ${message}`)
}

const firstLine = (node) => node.getText(file).split('\n')[0].trim()
const slice = (node) => text.slice(node.getFullStart(), node.getEnd())
// The leftmost identifier of a call chain such as it.each([...])('title', fn).
const rootName = (node) => {
  let current = node
  while (current) {
    if (ts.isIdentifier(current)) return current.text
    current = ts.isCallExpression(current) || ts.isPropertyAccessExpression(current) ? current.expression : null
  }
  return null
}
const callOf = (statement) => (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) ? statement.expression : null)
const isGroup = (statement) => ['describe', 'it', 'test'].includes(rootName(callOf(statement)?.expression))
const isHook = (statement) => hookNames.has(rootName(callOf(statement)?.expression))

const imports = file.statements.filter(ts.isImportDeclaration)
const body = file.statements.filter((statement) => !ts.isImportDeclaration(statement))
const pragmas = [...text.matchAll(/^\/\/ @vitest-environment .*$/gm)].map((match) => match[0])
const describes = body.filter((statement) => rootName(callOf(statement)?.expression) === 'describe')
const scopeNode = spec.scope ? describes.find((statement) => callOf(statement).arguments[0]?.text === spec.scope) : null
if (spec.scope && !scopeNode) fail(`no top-level describe titled ${spec.scope}`)

// Preamble: the statements before the scope describe (all groups when there is no scope), plus the scope body without its tests.
const index = scopeNode ? body.indexOf(scopeNode) : body.findIndex(isGroup)
const preamble = body.slice(0, index)
const after = scopeNode ? body.slice(index + 1) : []
let children
let scopeBody = []
let header = ''
let footer = ''
if (scopeNode) {
  const callback = callOf(scopeNode).arguments[1]
  const block = callback.body
  scopeBody = [...block.statements]
  children = scopeBody.filter(isGroup)
  header = text.slice(scopeNode.getFullStart(), block.getStart() + 1)
  footer = text.slice(block.getEnd() - 1, scopeNode.getEnd())
  const covered = [...scopeBody].map((statement) => [statement.getFullStart(), statement.getEnd()])
  const gaps = covered.reduce((acc, [from, to], i) => acc + text.slice(i ? covered[i - 1][1] : block.getStart() + 1, from), '') + text.slice(covered.at(-1)[1], block.getEnd() - 1)
  if (gaps.trim()) fail('text between the statements of the scope that the split would drop')
} else {
  children = body.slice(index)
  if (!children.every(isGroup)) fail('a statement after the first describe is not a describe, it or test')
}

// Statements per destination.
const keep = (statement) => perFile.some((pattern) => pattern.test(firstLine(statement)))
const fileLevel = preamble.filter(keep)
const harnessLevel = preamble.filter((statement) => !keep(statement))
const scopeKeep = scopeBody.filter((statement) => !isGroup(statement) && keep(statement))
const scopeHooks = scopeBody.filter((statement) => !isGroup(statement) && !keep(statement) && isHook(statement))
const scopeSetup = scopeBody.filter((statement) => !isGroup(statement) && !keep(statement) && !isHook(statement))
const topHooks = harnessLevel.filter(isHook)
const hooks = scopeNode ? scopeHooks : topHooks
if (hooks.length && !spec.hooks) fail(`${hooks.length} hooks need a hooks name`)
if (scopeNode && topHooks.length && !spec.topHooks) fail(`${topHooks.length} file-level hooks need a topHooks name`)
const harnessStatements = [...harnessLevel.filter((statement) => !isHook(statement)), ...scopeSetup]

// Parts: consecutive children from the one matching `first`.
const parts = spec.parts.map((part) => ({ ...part, units: [], tail: [] }))
const starts = parts.map((part) => (part.rest ? -1 : children.findIndex((child) => new RegExp(part.first).test(firstLine(child)))))
parts.forEach((part, i) => {
  if (!part.rest && starts[i] < 0) fail(`no test or describe starts with ${part.first}`)
})
const real = parts.filter((part) => !part.rest)
real.forEach((part, i) => {
  const from = starts[parts.indexOf(part)]
  const to = i + 1 < real.length ? starts[parts.indexOf(real[i + 1])] : children.length
  if (i === 0 && from !== 0) fail('the first part must start at the first test')
  if (to <= from) fail(`part ${part.name} is empty or out of order`)
  part.units = children.slice(from, to)
})
const restPart = parts.find((part) => part.rest)
if (restPart) restPart.tail = after
else if (after.length) fail('statements after the scope describe need a rest part')

// Names the harness declares.
const declared = []
for (const statement of harnessStatements) {
  if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) declared.push(d.name.text)
  } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name) declared.push(statement.name.text)
}
const exportStatement = (statement) => {
  const code = slice(statement)
  const start = statement.getStart(file) - statement.getFullStart()
  const classKeyword = ts.isClassDeclaration(statement) ? statement.getChildren(file).find((child) => child.kind === ts.SyntaxKind.ClassKeyword) : null
  const at = classKeyword ? classKeyword.getStart(file) - statement.getFullStart() : start
  return `${code.slice(0, at)}export ${code.slice(at)}`
}

const partBodies = parts.map((part) => {
  const inner = [spec.hooks && hooks.length ? `\n  ${spec.hooks}()` : '', ...scopeKeep.map(slice), ...part.units.map(slice)].join('')
  const wrapped = scopeNode && part.units.length ? `${header}${inner}\n${footer}` : ''
  const topName = scopeNode ? spec.topHooks : spec.hooks
  const top = topName && topHooks.length ? `\n${topName}()\n` : ''
  const units = scopeNode ? '' : part.units.map(slice).join('')
  return `${top}${units}${wrapped}${part.tail.map(slice).join('')}`
})
const used = new Set(declared.filter((name) => partBodies.some((code) => new RegExp(`\\b${name}\\b`).test(code))))
for (const name of [spec.hooks, spec.topHooks]) if (name) used.add(name)
const importText = imports.map(slice).join('').replace(/^\/\/ @vitest-environment .*\n/gm, '')
const harnessName = path.basename(spec.harness)
const harnessModule = harnessName.replace(/\.tsx?$/, '')

// Vitest refuses to export a vi.hoisted variable by declaration, so it is exported by name.
const isHoisted = (statement) => ts.isVariableStatement(statement) && /\bvi\.hoisted\(/.test(statement.getText(file))
const hoistedNames = harnessStatements.filter(isHoisted).flatMap((statement) => statement.declarationList.declarations.map((d) => d.name.getText(file))).filter((name) => used.has(name))
const harnessCode = [
  importText,
  ...harnessStatements.map((statement) => {
    const names = ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((d) => d.name.getText(file)) : [statement.name?.text]
    return names.some((name) => used.has(name)) && !isHoisted(statement) ? exportStatement(statement) : slice(statement)
  }),
  hoistedNames.length ? `\nexport { ${hoistedNames.join(', ')} }\n` : '',
  scopeNode && topHooks.length ? `\nexport function ${spec.topHooks}() {${topHooks.map(slice).join('')}\n}\n` : '',
  hooks.length ? `\nexport function ${spec.hooks}() {${hooks.map(slice).join('')}\n}\n` : '',
]
writeFileSync(path.join(dir, harnessName), `${harnessCode.join('').replace(/^\n+/, '')}\n`)
const mocks = harnessStatements.some((statement) => /^vi\.mock\(/.test(statement.getText(file)))
for (const [i, part] of parts.entries()) {
  const names = [...used].filter((name) => new RegExp(`\\b${name}\\b`).test(partBodies[i] + fileLevel.map(slice).join('') + scopeKeep.map(slice).join('')))
  const harnessImport = names.length ? `import { ${names.join(', ')} } from './${harnessModule}'\n` : ''
  const first = mocks && harnessImport ? `// biome-ignore organizeImports: the harness registers the module mocks and must load first\n${harnessImport}` : ''
  const last = mocks ? '' : harnessImport
  const head = [...pragmas, '', first, importText.replace(/^\n+/, ''), ...fileLevel.map(slice), last ? `\n${last}` : '']
  writeFileSync(path.join(dir, `${base}.${part.name}.test${ext}`), `${head.join('\n').replace(/\n{3,}/g, '\n\n')}${partBodies[i]}\n`)
}
console.log(`${spec.source} -> ${path.join(dir, harnessName)}`)
console.log(`harness exports: ${[...used].sort().join(', ')}`)
```

Create `.tmp/w2/split-guard.json`:

```json
{
  "source": "supabase-auth.guard.test.ts",
  "harness": "supabase-auth.guard.harness.ts",
  "hooks": "useBoundaryApp",
  "perFile": [],
  "parts": [
    {
      "name": "http-boundary",
      "first": "^describe\\('SupabaseAuthGuard local HTTP"
    },
    {
      "name": "step-up",
      "first": "^describe\\('Beneficiary step-up \\("
    },
    {
      "name": "step-up-pin",
      "first": "^describe\\('Beneficiary step-up PIN"
    }
  ]
}
```

Create `.tmp/w2/split-imports.json`:

```json
{
  "source": "imports.service.test.ts",
  "harness": "imports.service.harness.ts",
  "hooks": "useImportsHarness",
  "scope": "P03 import service",
  "perFile": [],
  "parts": [
    {
      "name": "upload-mapping",
      "first": "^it\\('rejects unsafe filenames"
    },
    {
      "name": "validation",
      "first": "^it\\.each\\(\\['PENDING'"
    },
    {
      "name": "processing",
      "first": "^it\\('finalizes a processing checkpoint"
    }
  ]
}
```

Create `.tmp/w2/split-reports.json`:

```json
{
  "source": "reports.service.test.ts",
  "harness": "reports.service.harness.ts",
  "hooks": "useReportsHarness",
  "scope": "report source authority, privacy and artifact recovery",
  "perFile": [],
  "parts": [
    {
      "name": "source-artifacts",
      "first": "^it\\('requires exact survey-only"
    },
    {
      "name": "evaluation-kinds",
      "first": "^describe\\('monitoring and evaluation report kinds"
    },
    {
      "name": "sections",
      "first": "^it\\('rejects an invalid project UUID"
    }
  ]
}
```

Create `.tmp/w2/api-split-vars.sh`:

```bash
# Sourced by the Task 5 blocks: the folders and file lists of the three api test splits.
D_G=$(dirname "$(git ls-files apps/api/src | grep '/supabase-auth\.guard\.ts$')")
D_I=$(dirname "$(git ls-files apps/api/src | grep '/imports\.service\.ts$')")
D_R=$(dirname "$(git ls-files apps/api/src | grep '/reports\.service\.ts$')")
GF="$D_G/supabase-auth.guard.harness.ts $D_G/supabase-auth.guard.http-boundary.test.ts $D_G/supabase-auth.guard.step-up.test.ts $D_G/supabase-auth.guard.step-up-pin.test.ts"
IF="$D_I/imports.service.harness.ts $D_I/imports.service.upload-mapping.test.ts $D_I/imports.service.validation.test.ts $D_I/imports.service.processing.test.ts"
RF="$D_R/reports.service.harness.ts $D_R/reports.service.source-artifacts.test.ts $D_R/reports.service.evaluation-kinds.test.ts $D_R/reports.service.sections.test.ts"
```

```bash
. .tmp/w2/api-split-vars.sh
for k in guard imports reports; do node .tmp/w2/split-test.mjs .tmp/w2/split-$k.json | head -n 1; done
git rm -q "$D_G/supabase-auth.guard.test.ts" "$D_I/imports.service.test.ts" "$D_R/reports.service.test.ts"
ALL="$GF $IF $RF"
node .tmp/w2/trim-imports.mjs $ALL | grep -v "removed nothing" | cut -c1-100
node .tmp/w2/drop-unused.mjs apps/api $(echo $ALL | sed 's#apps/api/##g') | cut -c1-120
wc -l $ALL | tail -n 14
```

Expected: the splitter writes the harness and three test files for each, Biome and the trimmers drop what each file no longer uses, and the sizes are:

```
apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts -> apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts
apps/api/src/modules/imports/imports.service.test.ts -> apps/api/src/modules/imports/imports.service.harness.ts
apps/api/src/modules/reports/reports.service.test.ts -> apps/api/src/modules/reports/reports.service.harness.ts
apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts: removed UnauthorizedException, desc
apps/api/src/modules/auth/guards/supabase-auth.guard.http-boundary.test.ts: removed httpRequest, Add
apps/api/src/modules/auth/guards/supabase-auth.guard.step-up.test.ts: removed httpRequest, AddressIn
apps/api/src/modules/auth/guards/supabase-auth.guard.step-up-pin.test.ts: removed httpRequest, Addre
apps/api/src/modules/imports/imports.service.harness.ts: removed createHash, BadRequestException, Co
apps/api/src/modules/imports/imports.service.upload-mapping.test.ts: removed ForbiddenException, Pri
apps/api/src/modules/imports/imports.service.validation.test.ts: removed createHash, BadRequestExcep
apps/api/src/modules/imports/imports.service.processing.test.ts: removed createHash, BadRequestExcep
apps/api/src/modules/reports/reports.service.harness.ts: removed ConflictException, ServiceUnavailab
apps/api/src/modules/reports/reports.service.source-artifacts.test.ts: removed createHash, ConflictE
apps/api/src/modules/reports/reports.service.evaluation-kinds.test.ts: removed createHash, Logger, S
apps/api/src/modules/reports/reports.service.sections.test.ts: removed project, field, createHash, C
src/modules/imports/imports.service.validation.test.ts: now
src/modules/reports/reports.service.evaluation-kinds.test.ts: sourceFingerprint
src/modules/reports/reports.service.evaluation-kinds.test.ts: formId
src/modules/reports/reports.service.evaluation-kinds.test.ts: sha
src/modules/reports/reports.service.sections.test.ts: formId
src/modules/reports/reports.service.source-artifacts.test.ts: sourceFingerprint
src/modules/reports/reports.service.source-artifacts.test.ts: project
   314 apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts
   345 apps/api/src/modules/auth/guards/supabase-auth.guard.http-boundary.test.ts
   208 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up.test.ts
   299 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up-pin.test.ts
   153 apps/api/src/modules/imports/imports.service.harness.ts
   312 apps/api/src/modules/imports/imports.service.upload-mapping.test.ts
   153 apps/api/src/modules/imports/imports.service.validation.test.ts
   275 apps/api/src/modules/imports/imports.service.processing.test.ts
   165 apps/api/src/modules/reports/reports.service.harness.ts
   292 apps/api/src/modules/reports/reports.service.source-artifacts.test.ts
   307 apps/api/src/modules/reports/reports.service.evaluation-kinds.test.ts
   101 apps/api/src/modules/reports/reports.service.sections.test.ts
  2924 total
```

The lists of dropped names may differ by a name; the typecheck of the next step must be clean.

`trim-imports.mjs` and `drop-unused.mjs` remove the imports that a file no longer uses (the originals imported everything for all tests); `drop-unused.mjs` runs the api typecheck once with `--noUnusedLocals`.

- [ ] **Step 3: Prove that every line was kept**

`same-lines.mjs` compares the trimmed lines of each original, from its first fixture statement on, with those of its four new files, as multisets, ignoring an `export ` prefix; it must print `lost 0`. The lines it lists as added are the wrapper the lifted hooks needed (the hook function header and its closing lines, the `describe` header repeated in each file, the hook call) and the export of a hoisted variable by name. The proof runs before Biome, which only re-wraps the few lines that the `export` keyword pushed over the line width.

```bash
. .tmp/w2/api-split-vars.sh
node .tmp/w2/same-lines.mjs ".tmp/w2/supabase-auth.guard-before.ts@^const beneficiaryHandler" "$D_G/supabase-auth.guard.harness.ts@^(export )?const beneficiaryHandler" "$D_G/supabase-auth.guard.http-boundary.test.ts@^describe\(" "$D_G/supabase-auth.guard.step-up.test.ts@^describe\(" "$D_G/supabase-auth.guard.step-up-pin.test.ts@^describe\(" --list
node .tmp/w2/same-lines.mjs ".tmp/w2/imports.service-before.ts@^const state" "$D_I/imports.service.harness.ts@^(export )?const state" "$D_I/imports.service.upload-mapping.test.ts@^describe\(" "$D_I/imports.service.validation.test.ts@^describe\(" "$D_I/imports.service.processing.test.ts@^describe\(" --list
node .tmp/w2/same-lines.mjs ".tmp/w2/reports.service-before.ts@^const state" "$D_R/reports.service.harness.ts@^(export )?const state" "$D_R/reports.service.source-artifacts.test.ts@^describe\(" "$D_R/reports.service.evaluation-kinds.test.ts@^describe\(" "$D_R/reports.service.sections.test.ts@^describe\(" --list
```

Expected: `lost 0` for each original, and the added lines are the wrapper (the hook function, the repeated `describe` header and its closing lines, the hook call and the export of the hoisted `state`):

```
1x }
1x function useBoundaryApp() {
original lines 1033, lost 0, added 2
1x }
2x })
1x { state }
1x function useImportsHarness() {
2x describe('P03 import service', () => {
3x useImportsHarness()
original lines 774, lost 0, added 6
1x }
2x })
1x { state }
1x function useReportsHarness() {
2x describe('report source authority, privacy and artifact recovery', () => {
3x useReportsHarness()
original lines 802, lost 0, added 6
```

- [ ] **Step 4: Format, typecheck, compare the test titles and run the new tests**

```bash
. .tmp/w2/api-split-vars.sh
ALL="$GF $IF $RF"
pnpm exec biome check --write $ALL 2>&1 | tail -n 2
pnpm exec biome check $ALL 2>&1 | tail -n 1
git add -A apps/api
pnpm --filter @pathways/api typecheck > .tmp/w2/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w2/tc.log
node .tmp/w2/test-titles.mjs save api .tmp/w2/supabase-auth.guard-after.json $(echo $GF | tr ' ' '\n' | grep "\.test\.ts$")
node .tmp/w2/test-titles.mjs compare .tmp/w2/supabase-auth.guard-before.json .tmp/w2/supabase-auth.guard-after.json
node .tmp/w2/test-titles.mjs save api .tmp/w2/imports.service-after.json $(echo $IF | tr ' ' '\n' | grep "\.test\.ts$")
node .tmp/w2/test-titles.mjs compare .tmp/w2/imports.service-before.json .tmp/w2/imports.service-after.json
node .tmp/w2/test-titles.mjs save api .tmp/w2/reports.service-after.json $(echo $RF | tr ' ' '\n' | grep "\.test\.ts$")
node .tmp/w2/test-titles.mjs compare .tmp/w2/reports.service-before.json .tmp/w2/reports.service-after.json
wc -l $ALL
```

Expected: Biome formats the files, the typecheck is clean, every title is kept (63, 24 and 39), and the sizes are:

```
Checked 12 files in <ms>. Fixed 12 files.
Checked 12 files in <ms>. No fixes applied.
typecheck exit 0
0
files 3, tests 63, failed 0
before 63, after 63, lost 0, added 0
files 3, tests 24, failed 0
before 24, after 24, lost 0, added 0
files 3, tests 39, failed 0
before 39, after 39, lost 0, added 0
   330 apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts
   354 apps/api/src/modules/auth/guards/supabase-auth.guard.http-boundary.test.ts
   223 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up.test.ts
   316 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up-pin.test.ts
   151 apps/api/src/modules/imports/imports.service.harness.ts
   330 apps/api/src/modules/imports/imports.service.upload-mapping.test.ts
   162 apps/api/src/modules/imports/imports.service.validation.test.ts
   286 apps/api/src/modules/imports/imports.service.processing.test.ts
   169 apps/api/src/modules/reports/reports.service.harness.ts
   311 apps/api/src/modules/reports/reports.service.source-artifacts.test.ts
   318 apps/api/src/modules/reports/reports.service.evaluation-kinds.test.ts
   111 apps/api/src/modules/reports/reports.service.sections.test.ts
  3061 total
```

`test-titles.mjs` runs the new files and saves the full name of every test (the `describe` path included); `compare` fails on a lost or an added name and counts duplicates, so a renamed or dropped test shows.

- [ ] **Step 5: The harnesses stay out of the production build, and the whole api suite is unchanged**

`tsconfig.build.json` already excludes `*.harness.ts` (W1 Task 2). The check lists the files the production build compiles before and after; the api suite then runs whole.

```bash
(cd apps/api && pnpm exec tsc -p tsconfig.build.json --noEmit --listFilesOnly | grep -c -E "\.harness\.ts|\.test\.ts")
pnpm --filter @pathways/api exec nest build > .tmp/w2/api-build-t5.log 2>&1; echo "nest build exit $?"
find apps/api/dist -name '*.js' | grep -c "harness"
find apps/api/dist -name '*.js' | grep -c "prisma/"
pnpm --filter @pathways/api exec vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
git status --short | grep -v "^[ADMR]  " | head
```

Expected: the build file list holds no harness or test file, `nest build` succeeds, the dist holds no harness, the 44 compiled `prisma/` files are unchanged, and the api suite has the baseline tests in more files (182 files, the baseline 176, minus three plus nine):

```
0
nest build exit 0
0
44
 Test Files  172 passed | 10 skipped (182)
      Tests  2642 passed | 21 skipped (2663)
```

The first figure is the number of harness and test files in the build file list (0: the build config excludes them).

- [ ] **Step 6: Prove that the harness mocks still bite**

A split can leave a test passing for a new reason: a mock that no longer registers because its import moved. `mutations-api-splits.json` changes one line of each harness that a test depends on (the recorded operation of the imports mock, the commit-loss branch of the reports mock, the project lookup of the auth guard harness), and each mutation must make the three new test sets fail.

Create `.tmp/w2/mutations-api-splits.json` (`@D_G@`, `@D_I@` and `@D_R@` stand for the three folders; the block below replaces them):

Create `.tmp/w2/mutations-api-splits.json`:

```json
[
 [
  "@D_I@/imports.service.harness.ts",
  "state.operationCalls.push({ permission, options })",
  "state.operationCalls.push({ permission: 'x', options })"
 ],
 [
  "@D_R@/reports.service.harness.ts",
  "state.operations === 2) throw",
  "state.operations === 99) throw"
 ],
 [
  "@D_G@/supabase-auth.guard.harness.ts",
  ".mockResolvedValue({ id: assignedProjectId })",
  ".mockResolvedValue(null)"
 ]
]
```

```bash
. .tmp/w2/api-split-vars.sh
sed -e "s#@D_G@#$D_G#" -e "s#@D_I@#$D_I#" -e "s#@D_R@#$D_R#" .tmp/w2/mutations-api-splits.json > .tmp/w2/mutations-api-splits.run.json
python3 .tmp/w2/mutate.py .tmp/w2/mutations-api-splits.run.json bash -c "pnpm --filter @pathways/api exec vitest run $D_G/supabase-auth.guard $D_I/imports.service $D_R/reports.service > /dev/null 2>&1"
git status --short | grep -v "^[ADMR]  " | head
```

Expected: each of the three harness mutations is caught by the tests that use it:

```
caught   apps/api/src/modules/imports/imports.service.harness.ts: state.operationCalls.push({ permission, options })
caught   apps/api/src/modules/reports/reports.service.harness.ts: state.operations === 2) throw
caught   apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts: .mockResolvedValue({ id: assignedProjectId })
caught 3 of 3
```

- [ ] **Step 7: Commit, one commit per split**

```bash
. .tmp/w2/api-split-vars.sh
git reset -q
git add -A $D_G
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(api): split the auth guard test by concern with a shared harness

The $(wc -l < .tmp/w2/supabase-auth.guard-before.ts) line test becomes a harness module and three test files (local HTTP boundary, beneficiary step-up, step-up PIN); every line and all test titles are kept.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git add -A $D_I
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(api): split the imports service test by concern with a shared harness

The $(wc -l < .tmp/w2/imports.service-before.ts) line test becomes a harness module and three test files (upload and mapping, validation, processing); every line and all test titles are kept.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git add -A $D_R
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(api): split the reports service test by concern with a shared harness

The $(wc -l < .tmp/w2/reports.service-before.ts) line test becomes a harness module and three test files (source and artifacts, evaluation kinds, section integrity); every line and all test titles are kept.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git log --oneline -n 3
git show --stat --oneline HEAD~2 | tail -n 6
git status --short | wc -l
```

Expected: three commits, each with a harness, three test files and the deleted original:

```
[claude/modularization-s8b-xjnlzt <sha>] test(api): split the auth guard test by concern with a shared harness
 5 files changed, 1223 insertions(+), 1140 deletions(-)
 create mode 100644 apps/api/src/modules/auth/guards/supabase-auth.guard.harness.ts
 create mode 100644 apps/api/src/modules/auth/guards/supabase-auth.guard.http-boundary.test.ts
 create mode 100644 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up-pin.test.ts
 create mode 100644 apps/api/src/modules/auth/guards/supabase-auth.guard.step-up.test.ts
 delete mode 100644 apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
[claude/modularization-s8b-xjnlzt <sha>] test(api): split the imports service test by concern with a shared harness
 5 files changed, 929 insertions(+), 861 deletions(-)
 create mode 100644 apps/api/src/modules/imports/imports.service.harness.ts
 create mode 100644 apps/api/src/modules/imports/imports.service.processing.test.ts
 delete mode 100644 apps/api/src/modules/imports/imports.service.test.ts
 create mode 100644 apps/api/src/modules/imports/imports.service.upload-mapping.test.ts
 create mode 100644 apps/api/src/modules/imports/imports.service.validation.test.ts
[claude/modularization-s8b-xjnlzt <sha>] test(api): split the reports service test by concern with a shared harness
 5 files changed, 909 insertions(+), 836 deletions(-)
 create mode 100644 apps/api/src/modules/reports/reports.service.evaluation-kinds.test.ts
 create mode 100644 apps/api/src/modules/reports/reports.service.harness.ts
 create mode 100644 apps/api/src/modules/reports/reports.service.sections.test.ts
 create mode 100644 apps/api/src/modules/reports/reports.service.source-artifacts.test.ts
 delete mode 100644 apps/api/src/modules/reports/reports.service.test.ts
<sha> test(api): split the reports service test by concern with a shared harness
<sha> test(api): split the imports service test by concern with a shared harness
<sha> test(api): split the auth guard test by concern with a shared harness
 .../auth/guards/supabase-auth.guard.harness.ts     |  330 ++++++
 .../supabase-auth.guard.http-boundary.test.ts      |  354 ++++++
 .../guards/supabase-auth.guard.step-up-pin.test.ts |  316 ++++++
 .../guards/supabase-auth.guard.step-up.test.ts     |  223 ++++
 .../auth/guards/supabase-auth.guard.test.ts        | 1140 --------------------
 5 files changed, 1223 insertions(+), 1140 deletions(-)
0
```



---

### Task 6: Split the activity proof dialog test

**Files:**
- Create (gitignored): `.tmp/w2/split-proof.json`, `mutations-web-split.json`, `proof-before.tsx`, `proof-before.json`
- Create: `activity-proof-dialog.{harness.tsx,upload-flow.test.tsx,failure-recovery.test.tsx,reach-and-finalize.test.tsx,progress-suggestion.test.tsx}` beside `activity-proof-dialog.tsx`
- Delete: `activity-proof-dialog.test.tsx` (1365 lines at the W1 tip)

The same split as Task 5 for the one web test file above 800 lines that no earlier slice divides (S7d already split the analytics dashboard test; `pathways-client.test.ts` tests the shell that Task 1 scanned and is listed in Task 7). The file has a `jsdom` pragma, hoisted `state` and `api` objects, five `vi.mock` calls (one reads `api` in its factory), three helpers that render the dialog, top-level `beforeEach` and `afterEach` hooks, and two top-level `describe` blocks, the first of 1095 lines. The spec divides the first `describe` into three parts at test titles and gives the second `describe` its own file (`rest`); the file-level hooks become the harness function `useProofDialogHarness`, called before the `describe` in each file (`topHooks`). The mocks live in the harness, which every test file imports first (Task 5 explains why); the harness is a `.tsx` file because the mock of `DialogShell` and the render helper hold JSX.

- [ ] **Step 1: Save the original and its test titles**

```bash
T=$(git ls-files apps/web/src | grep "/activity-proof-dialog.test.tsx$")
echo "$T"
wc -l < "$T"
grep -c -E "^  it(\.each)?\(" "$T"
grep -n -E "^describe\(|^vi\.mock\(|^const (state|api) = vi\.hoisted|^// @vitest-environment|^(beforeEach|afterEach)\(" "$T" | cut -c1-100
cp "$T" .tmp/w2/proof-before.tsx
node .tmp/w2/test-titles.mjs save web .tmp/w2/proof-before.json "$T"
```

Expected: the path, the size (1365), the number of lines that start a test (44), the anchors and the saved titles (49, the `it.each` rows counted):

```
apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
1365
44
2:// @vitest-environment jsdom
7:const state = vi.hoisted(() => ({
16:const api = vi.hoisted(() => ({
23:vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: state.profile }) }
24:vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
25:vi.mock('@/components/pathways', () => ({
33:vi.mock('@/components/ui/dialog', () => ({
37:vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
41:vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
80:beforeEach(() => {
84:afterEach(cleanup)
86:describe('ActivityProofDialog direct upload', () => {
1181:describe('ActivityProofDialog progress suggestion', () => {
files 1, tests 49, failed 0
```

- [ ] **Step 2: Create the spec and split**

Create `.tmp/w2/split-proof.json` with the Write tool exactly as printed (`split-test.mjs` is the file of Task 5):

Create `.tmp/w2/split-proof.json`:

```json
{
  "source": "activity-proof-dialog.test.tsx",
  "harness": "activity-proof-dialog.harness.tsx",
  "topHooks": "useProofDialogHarness",
  "scope": "ActivityProofDialog direct upload",
  "perFile": [],
  "parts": [
    {
      "name": "upload-flow",
      "first": "^it\\('adds files additively"
    },
    {
      "name": "failure-recovery",
      "first": "^it\\('marks one failing file Failed"
    },
    {
      "name": "reach-and-finalize",
      "first": "^it\\('enables the beneficiaries-reached"
    },
    {
      "name": "progress-suggestion",
      "rest": true
    }
  ]
}
```

```bash
D=$(dirname "$(git ls-files apps/web/src | grep '/activity-proof-dialog\.tsx$')")
node .tmp/w2/split-test.mjs .tmp/w2/split-proof.json | head -n 1
git rm -q "$D/activity-proof-dialog.test.tsx"
F="$D/activity-proof-dialog.harness.tsx $D/activity-proof-dialog.upload-flow.test.tsx $D/activity-proof-dialog.failure-recovery.test.tsx $D/activity-proof-dialog.reach-and-finalize.test.tsx $D/activity-proof-dialog.progress-suggestion.test.tsx"
node .tmp/w2/trim-imports.mjs $F | grep -v "removed nothing" | cut -c1-100
node .tmp/w2/drop-unused.mjs apps/web $(echo $F | sed 's#apps/web/##g') | cut -c1-120
wc -l $F
```

Expected: the splitter writes a harness and four test files, and the sizes are:

```
apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx -> apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx
apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx: removed wait
apps/web/src/features/projects/activities/components/activity-proof-dialog.upload-flow.test.tsx: rem
apps/web/src/features/projects/activities/components/activity-proof-dialog.failure-recovery.test.tsx
apps/web/src/features/projects/activities/components/activity-proof-dialog.reach-and-finalize.test.t
apps/web/src/features/projects/activities/components/activity-proof-dialog.progress-suggestion.test.
src/features/projects/activities/components/activity-proof-dialog.harness.tsx: toast
   86 apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx
  403 apps/web/src/features/projects/activities/components/activity-proof-dialog.upload-flow.test.tsx
  444 apps/web/src/features/projects/activities/components/activity-proof-dialog.failure-recovery.test.tsx
  293 apps/web/src/features/projects/activities/components/activity-proof-dialog.reach-and-finalize.test.tsx
  199 apps/web/src/features/projects/activities/components/activity-proof-dialog.progress-suggestion.test.tsx
 1425 total
```

The dialog test has the hoisted `state` and `api`: only `api` is exported by name, because Vitest refuses to export a hoisted variable by its declaration.

- [ ] **Step 3: Prove that every line was kept**

The original is read from its first hoisted statement on, so the `vi.mock` calls, the fixtures, the three imports that follow them and every test are in the proof; each test file is read from its first import of those three modules or its first `describe`, whichever comes first. The lines listed as added are the wrapper: the hook function header, the repeated `describe` header of the divided scope and the closing lines, the hook call, the export of the hoisted `api` by name and the imports that more than one test file needs.

```bash
D=$(dirname "$(git ls-files apps/web/src | grep '/activity-proof-dialog\.tsx$')")
P='^(import .*(PathwaysClientError|toast|ActivityProofDialog)|describe\()'
node .tmp/w2/same-lines.mjs ".tmp/w2/proof-before.tsx@^const state" "$D/activity-proof-dialog.harness.tsx@^(export )?const state" "$D/activity-proof-dialog.upload-flow.test.tsx@$P" "$D/activity-proof-dialog.failure-recovery.test.tsx@$P" "$D/activity-proof-dialog.reach-and-finalize.test.tsx@$P" "$D/activity-proof-dialog.progress-suggestion.test.tsx@$P" --list
```

Expected: `lost 0`; the added lines are the wrapper and the imports that several test files need:

```
1x }
1x { api }
1x function useProofDialogHarness() {
2x })
2x import { PathwaysClientError } from '@/lib/api/core/request'
4x useProofDialogHarness()
2x describe('ActivityProofDialog direct upload', () => {
1x import { ActivityProofDialog } from './activity-proof-dialog'
original lines 1306, lost 0, added 8
```

- [ ] **Step 4: Format, typecheck, compare the test titles and the route table**

The web build is the proof that the harness is not reachable from a route: the route table of the build must have the routes of the baseline of Task 0, each within 1 kB of its baseline First Load JS (`compare-routes.mjs` writes every route whose size differs to `routes-split.diff` and its last line counts those over the tolerance; the block shows that last line). The rename of Task 1 moves modules and so can move a shared chunk boundary by about 1 kB; in the replay one route moved by 1 kB after Task 1 alone, before any test was split.

```bash
D=$(dirname "$(git ls-files apps/web/src | grep '/activity-proof-dialog\.tsx$')")
F="$D/activity-proof-dialog.harness.tsx $D/activity-proof-dialog.upload-flow.test.tsx $D/activity-proof-dialog.failure-recovery.test.tsx $D/activity-proof-dialog.reach-and-finalize.test.tsx $D/activity-proof-dialog.progress-suggestion.test.tsx"
pnpm exec biome check --write $F 2>&1 | tail -n 2
pnpm exec biome check $F 2>&1 | tail -n 1
git add -A apps/web
pnpm --filter @pathways/web typecheck > .tmp/w2/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w2/tc.log
git checkout -- apps/web/next-env.d.ts
node .tmp/w2/test-titles.mjs save web .tmp/w2/proof-after.json $(echo $F | tr ' ' '\n' | grep "\.test\.tsx$")
node .tmp/w2/test-titles.mjs compare .tmp/w2/proof-before.json .tmp/w2/proof-after.json
wc -l $F
bash .tmp/w2/build-routes.sh split
node .tmp/w2/compare-routes.mjs .tmp/w2/routes-base.txt .tmp/w2/routes-split.txt 1 | tee .tmp/w2/routes-split.diff | tail -n 1
grep -a Middleware .tmp/w2/routes-split.txt | cmp - .tmp/w2/middleware-base.txt && echo "Middleware equals the baseline"
git status --short | grep -v "^[ADMR]  " | head
```

Expected: Biome formats the files, the typecheck is clean, the 49 titles are kept, the web build succeeds with the Middleware size of the baseline, and every route is within 1 kB of its baseline:

```
Checked 5 files in <ms>. Fixed 5 files.
Checked 5 files in <ms>. No fixes applied.
typecheck exit 0
0
files 4, tests 49, failed 0
before 49, after 49, lost 0, added 0
   84 apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx
  410 apps/web/src/features/projects/activities/components/activity-proof-dialog.upload-flow.test.tsx
  449 apps/web/src/features/projects/activities/components/activity-proof-dialog.failure-recovery.test.tsx
  298 apps/web/src/features/projects/activities/components/activity-proof-dialog.reach-and-finalize.test.tsx
  204 apps/web/src/features/projects/activities/components/activity-proof-dialog.progress-suggestion.test.tsx
 1445 total
exit 0
ƒ Middleware                                                      <n> kB
routes 72, over 1 kB 0
Middleware equals the baseline
```

A route that differs by 1 kB differed already after Task 1, before any test was split (`/projects/[projectId]/activities`, 333 kB to 334 kB in the replay; `cat .tmp/w2/routes-split.diff` shows the list); the last line must say `over 1 kB 0` and the Middleware line must equal the baseline.

- [ ] **Step 5: Prove that the harness mocks still bite**

Create `.tmp/w2/mutations-web-split.json` (`@D_W@` stands for the folder; the block below replaces it). The mutation renames the module that the `sonner` mock replaces, so the success toast is the real one and the test that expects the mock call must fail.

Create `.tmp/w2/mutations-web-split.json`:

```json
[
 [
  "@D_W@/activity-proof-dialog.harness.tsx",
  "vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))",
  "vi.mock('sonnerx', () => ({ toast: { success: vi.fn() } }))"
 ]
]
```

```bash
D=$(dirname "$(git ls-files apps/web/src | grep '/activity-proof-dialog\.tsx$')")
sed "s#@D_W@#$D#" .tmp/w2/mutations-web-split.json > .tmp/w2/mutations-web-split.run.json
python3 .tmp/w2/mutate.py .tmp/w2/mutations-web-split.run.json bash -c "pnpm --filter @pathways/web exec vitest run $D/activity-proof-dialog > /dev/null 2>&1"
git status --short | grep -v "^[ADMR]  " | head
```

Expected: the harness mutation (the `sonner` mock) is caught:

```
caught   apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx: vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
caught 1 of 1
```

- [ ] **Step 6: Commit**

```bash
D=$(dirname "$(git ls-files apps/web/src | grep '/activity-proof-dialog\.tsx$')")
git reset -q
git add -A $D
git status --short
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(web): split the activity proof dialog test by concern with a shared harness

The $(wc -l < .tmp/w2/proof-before.tsx) line test becomes a harness module and four test files (upload flow, failure recovery, reach and finalize, progress suggestion); every line and all test titles are kept, and the route table of the web build is unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -n 7
```

Expected: one commit with the harness, four test files and the deleted original:

```
A  apps/web/src/features/projects/activities/components/activity-proof-dialog.failure-recovery.test.tsx
A  apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx
A  apps/web/src/features/projects/activities/components/activity-proof-dialog.progress-suggestion.test.tsx
A  apps/web/src/features/projects/activities/components/activity-proof-dialog.reach-and-finalize.test.tsx
D  apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
A  apps/web/src/features/projects/activities/components/activity-proof-dialog.upload-flow.test.tsx
[claude/modularization-s8b-xjnlzt <sha>] test(web): split the activity proof dialog test by concern with a shared harness
 6 files changed, 1445 insertions(+), 1365 deletions(-)
 create mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.failure-recovery.test.tsx
 create mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.harness.tsx
 create mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.progress-suggestion.test.tsx
 create mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.reach-and-finalize.test.tsx
 delete mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
 create mode 100644 apps/web/src/features/projects/activities/components/activity-proof-dialog.upload-flow.test.tsx
 ...activity-proof-dialog.failure-recovery.test.tsx |  449 +++++++
 .../components/activity-proof-dialog.harness.tsx   |   84 ++
 ...ivity-proof-dialog.progress-suggestion.test.tsx |  204 +++
 ...tivity-proof-dialog.reach-and-finalize.test.tsx |  298 +++++
 .../components/activity-proof-dialog.test.tsx      | 1365 --------------------
 .../activity-proof-dialog.upload-flow.test.tsx     |  410 ++++++
 6 files changed, 1445 insertions(+), 1365 deletions(-)
```



---

### Task 7: Records

**Files:**
- Create (gitignored): `.tmp/w2/task7-edits.json`, `cr-w2.md`, `activity-w2.md`, `fill-records.py`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-17 and MOD-21 rows), `docs/qad-pathways.md` (commands table and the CI sentence), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed (ruling 9). The living docs that name a moved path were rewritten by the mover in Task 1: the web layout lines of the change record are history and are edited here by hand (section 3.3). `docs/build-pathways.md` and the generated `AGENTS.md` name `pnpm docs:check` and `scripts/docs/check.py`, which keep working, so they are not edited.

- [ ] **Step 1: Amend the change record, the audit rows, the QAD table and the index**

The values in the `@...@` placeholders come from the proofs of Tasks 1, 5 and 6 (the mover summary, the shell scan, the original line counts, the sizes of the new test files and the list of test files above 600 lines that remain), so the text is not typed by hand. `fill-records.py` replaces them from environment variables and fails when one is left. The first edit list is exact replacements of lines of the change record, the QAD table and the audit row; if an earlier slice changed one of those lines, the command stops with the line it could not find: report NEEDS_CONTEXT, do not edit around it.

Create `.tmp/w2/fill-records.py`:

```py
"""Replaces @NAME@ in the given files with the value of the environment variable W2_NAME and fails when a placeholder is left.

Usage: W2_DATE=2026-10-14 python3 .tmp/w2/fill-records.py <file>...
"""
import os
import re
import sys
from pathlib import Path

values = {key[3:]: value for key, value in os.environ.items() if key.startswith("W2_")}
left = 0
for name in sys.argv[1:]:
    path = Path(name)
    text = path.read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace(f"@{key}@", value)
    path.write_text(text, encoding="utf-8")
    missing = sorted(set(re.findall(r"@[A-Z_0-9]+@", text)))
    left += len(missing)
    print(f"{name}: {len(missing)} placeholders left {' '.join(missing)}".rstrip())
sys.exit(1 if left else 0)
```

Create `.tmp/w2/task7-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "`.harness` (api; a harness holds the fixtures and helpers that the test files of one source share, and `tsconfig.build.json` excludes it, amended ",
  "`.harness` (api and web; a harness holds the fixtures, the module mocks and the helpers that the test files of one source share, a test file imports it first when it holds `vi.mock` calls, a web harness is `.harness.tsx` when it holds JSX, and `tsconfig.build.json` excludes it in the api, amended ",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  " for W1); `.reads`, `.utils`, `.copy`, `.schema` (web).",
  " for W1 and @DATE@ for W2); `.reads`, `.utils`, `.copy`, `.schema` (web).",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "lives in `lib/services/source-mutation.ts` beside the tickets.",
  "lives in `lib/api/core/source-mutation.ts` beside the tickets, with the authorization-denied and write-committed events in `lib/api/core/authorized-read-events.ts` (both moved from `lib/services` @DATE@ for W2).",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "| W2 | Tooling follow-up | the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split and the splits of the largest tests; the per-domain seed data splits are left to the developer |",
  "| W2 | Tooling follow-up | the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split and the splits of the largest tests (applied @DATE@, section 9); the per-domain seed data splits are left to the developer, who runs them with a local seed proof (section 9) |",
  1
 ],
 [
  "docs/qad-pathways.md",
  "| `pnpm test:scripts` | node tests of `scripts/db` and the security adapter output check (the `tooling` CI job also runs the Python migration checks and two Pester files) |",
  "| `pnpm test:scripts` | node tests of `scripts/db`, the Vitest alias helper and the security adapter output check (the `tooling` CI job also runs the Python migration checks, the documentation check tests and two Pester files) |",
  1
 ],
 [
  "docs/qad-pathways.md",
  "| `pnpm docs:check` | documentation checks |",
  "| `pnpm docs:check` | documentation checks |\n| `python3 -m unittest discover -s scripts/docs -p \"test_*.py\"` | unit tests of the documentation checks (`scripts/docs/test_checks.py`; the `tooling` CI job runs them) |",
  1
 ],
 [
  "docs/qad-pathways.md",
  "plus the tooling tests (database scripts, security adapter output, migration checks and the replay helper Pester files)",
  "plus the tooling tests (database scripts, the Vitest alias helper, security adapter output, migration checks, the documentation check tests and the replay helper Pester files)",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "the per-domain data splits left to the developer. |",
  "the per-domain data splits not made by W2 and left to the developer, who runs them with a local seed proof (change record section 9). |",
  1
 ]
]
```

The section 9 paragraph is appended at the end of the change record, after the paragraph of the last slice:

Create `.tmp/w2/cr-w2.md`:

```md

W2 applied @DATE@ on `claude/modularization-s8b-xjnlzt` (W2 stacks on W1; W2 opens no pull request itself; the controller opens the part 3 stacked pull request into `dev` after the W2 gates):
- `lib/services` residue: `authorized-read-events.ts`, `source-mutation.ts` and `source-mutation.test.ts` moved to `lib/api/core`, pure renames with the importers, mocks and living docs rewritten by script (the mover reported: @MOVE@). The scan of the `pathways-client.ts` shell found @SCAN@
- Path aliases: the `paths` of the tsconfig files are the one declaration. `scripts/tsconfig-aliases.mjs` builds the `resolve.alias` of the api, web and imports Vitest configs from them (the hand-written lists held five, four and one entries and missed the wildcard package entries), `scripts/tsconfig-aliases.test.mjs` (11 tests, run by `test:scripts` and so by the `tooling` job) checks each config against the TypeScript resolution rule and the package entries that the app tsconfigs repeat from the base, and eight mutations are caught. The helper is a script, not a `packages/config` module (as the W1 outline proposed), because the `tooling` job installs nothing and `packages/imports` has no entry for `packages/config`; no dependency was added.
- `check.py`: the @L_CHECK@ line `scripts/docs/check.py` became an entry point and the `scripts/docs/checks` package of ten modules (one per check and `common`); every line is kept (lost 0), the output and exit code are byte-identical on the real docs, with `--strict`, with every `--only` and on 39 copies with one injected fault each, and the command `pnpm docs:check` does not change. `scripts/docs/test_checks.py` (39 tests) runs in the `tooling` job and sixteen mutations of the check modules are caught. Three helpers lost their underscore because modules import them: `docs_ancestor`, `is_change_layer_path` and `FILING_RE`.
- Large tests: the four test files above 800 lines that no earlier slice splits became a harness and test files by concern, with every line and all test titles kept: `supabase-auth.guard.test.ts` (@L_GUARD@ lines), `imports.service.test.ts` (@L_IMPORTS@), `reports.service.test.ts` (@L_REPORTS@) and `activity-proof-dialog.test.tsx` (@L_PROOF@); the new files are @SIZES@ lines. The harness holds the module mocks and is imported first by every test file; the suffix `.harness` now covers the web (section 3.5).
- Left in the 600 to 800 line range and above (not split by W2): @OVER@. The analytics dashboard test is split by S7d, and `pathways-client.test.ts` follows the fate of the shell. A later slice may split any of them with `split-test.mjs`.
- Seed data (MOD-21, the data part): not done and no code changed for it. Splitting `local-demo-data.ts` and the `main()` of `hosted-realistic-seed.ts` by domain changes no seed content, but its proof needs a seed run on a local database (`pnpm db:local:reset`, then the seeds), which the cloud container cannot run. The developer does this work on a machine with the local database. Proof for that work: before the split, run the seeds and save the row count and a checksum of every table (for example `select count(*), md5(string_agg(t::text, '' order by t::text)) from <table> t`); after it, run them again and compare the lists, and keep the demo photos and import fixtures next to the code that reads them.
- Decisions: W2 takes the proven moves and splits and leaves the seed data (ruling 1); the aliases come from the tsconfig paths through a script helper (ruling 4); `check.py` keeps its command and its output (ruling 5); the harness imports first (ruling 6); the shell is scanned, not retired (ruling 3).
```

```bash
export W2_DATE=$(date +%F)
export W2_MOVE=$(grep '^moved ' .tmp/w2/services-move.log)
V=$(grep '^verdict: ' .tmp/w2/shell-scan.txt | sed 's/^verdict: //')
NAMES=$(grep '^production: ' .tmp/w2/shell-scan.txt | sed 's/^production: //; s/ <-.*//' | paste -sd, | sed 's/,/, /g')
TESTS=$(grep '^test files naming the shell: ' .tmp/w2/shell-scan.txt | sed 's/.*: //')
export W2_SCAN="the verdict \`$V\`; the names that production code still uses are ${NAMES:-none}, and $TESTS test files name the shell. W2 does not retire it: removing the shell also removes the \`vi.mock\` factories of those test files, a per-test review for a later slice."
export W2_L_CHECK=$(wc -l < .tmp/w2/check-before.py)
export W2_L_GUARD=$(wc -l < .tmp/w2/supabase-auth.guard-before.ts)
export W2_L_IMPORTS=$(wc -l < .tmp/w2/imports.service-before.ts)
export W2_L_REPORTS=$(wc -l < .tmp/w2/reports.service-before.ts)
export W2_L_PROOF=$(wc -l < .tmp/w2/proof-before.tsx)
NEW=$(git ls-files apps | grep -E "/(supabase-auth\.guard|imports\.service|reports\.service|activity-proof-dialog)\.(harness|[a-z-]+\.test)\.tsx?$")
SIZES=$(wc -l $NEW | grep -v total | awk '{print $1}' | sort -n)
export W2_SIZES="$(echo "$NEW" | wc -l) files of $(echo "$SIZES" | head -n 1) to $(echo "$SIZES" | tail -n 1)"
export W2_OVER=$(git ls-files | grep -E '\.test\.tsx?$' | xargs wc -l | awk '$1>600 && $2!="total" {printf "%s`%s` (%s)", sep, $2, $1; sep=", "}')
echo "$W2_OVER" | tr ',' '\n' | wc -l
echo "$W2_SIZES"
python3 .tmp/w2/fill-records.py .tmp/w2/task7-edits.json .tmp/w2/cr-w2.md
node .tmp/w2/replace-exact.mjs .tmp/w2/task7-edits.json
cat .tmp/w2/cr-w2.md >> docs/cr-pathways-codebase-modularization.md
sed -i -e '/^| MOD-17 /s/\. |$/; the test files above 800 lines that no earlier slice splits were split by concern with a shared harness by W2, and the rest of the list above 600 lines is in the change record section 9. |/' docs/audit-pathways-codebase-modularity-20261009.md
sed -i -e '/^| \[cr-pathways-codebase-modularization\]/s/ and W1 applied, W2 next |$/, W1 and W2 applied, the seed data splits left to the developer |/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{60} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
tail -c 700 docs/cr-pathways-codebase-modularization.md
git grep -n -E "lib/services/(source-mutation|authorized-read-events)" -- docs README.md AGENTS.md ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers' ':!docs/handoff*' | cut -c1-120
```

Expected: the count of test files above 600 lines that remain, the sizes of the new files, no placeholder left, eight replacements, the stat of the four records, the audit row, the index row, the end of the change record and no living doc that names an old path:

```
11
17 files of 84 to 449
.tmp/w2/task7-edits.json: 0 placeholders left
.tmp/w2/cr-w2.md: 0 placeholders left
8 replacements in 3 files
 docs/audit-pathways-codebase-modularity-20261009.md |  4 ++--
 docs/cr-pathways-codebase-modularization.md         | 15 ++++++++++++---
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  5 +++--
 4 files changed, 18 insertions(+), 8 deletions(-)
 the list above 600 lines is in the change record section 9. |
runs them with a local seed proof (change record section 9). |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S7c, S7d, S8a, S8b, W1 and W2 applied, the seed data splits left to the developer |
 The developer does this work on a machine with the local database. Proof for that work: before the split, run the seeds and save the row count and a checksum of every table (for example `select count(*), md5(string_agg(t::text, '' order by t::text)) from <table> t`); after it, run them again and compare the lists, and keep the demo photos and import fixtures next to the code that reads them.
- Decisions: W2 takes the proven moves and splits and leaves the seed data (ruling 1); the aliases come from the tsconfig paths through a script helper (ruling 4); `check.py` keeps its command and its output (ruling 5); the harness imports first (ruling 6); the shell is scanned, not retired (ruling 3).
```

The counts and the list of files depend on the real tree.

The index status depends on what W1 wrote in the row: after W1 it ends `... and W1 applied, W2 next`. If the `sed` of the index row does not match (the `grep` prints the old status), edit the row by hand to the same words. A replacement that does not match means an earlier slice changed the line: report NEEDS_CONTEXT. The last command prints nothing when no living doc names an old path.

- [ ] **Step 2: Activity log**

`.tmp/w2/activity-w2.md` is the W2 section of the activity log, with the commit hashes of Tasks 1 to 6 as `@H1@` to `@H6@` (`@H5A@` to `@H5C@` are the three commits of Task 5):

Create `.tmp/w2/activity-w2.md`:

```md

## @DATE@ Modularization W2 tooling follow-up (claude/modularization-s8b-xjnlzt)
- Task 1 (@H1@): `authorized-read-events.ts`, `source-mutation.ts` and `source-mutation.test.ts` moved from `lib/services` to `lib/api/core` (the mover reported: @MOVE@); the shell scan: @SCAN@
- Task 2 (@H2@): the Vitest aliases of the api, web and imports configs are built from the tsconfig `paths` by `scripts/tsconfig-aliases.mjs`; 11 node tests in `test:scripts`, eight mutations caught.
- Task 3 (@H3@): `scripts/docs/check.py` (@L_CHECK@ lines) became an entry point and the `scripts/docs/checks` package of ten modules; lost 0, identical output on 14 command lines and 39 injected faults.
- Task 4 (@H4@): `scripts/docs/test_checks.py` (39 tests) runs in the `tooling` job; sixteen mutations caught.
- Task 5 (@H5A@, @H5B@, @H5C@): the auth guard, imports service and reports service tests became harnesses and test files by concern; lost 0 lines and 0 titles, three harness mutations caught.
- Task 6 (@H6@): the activity proof dialog test became a harness and four test files; lost 0 lines and 0 titles, the web build has the same routes, each within 1 kB of its baseline.
- Task 7: the change record (sections 3.3, 3.5, 3.7 and 9), the audit rows MOD-17 and MOD-21, the QAD table and CI sentence and the index row follow the slice.
- Decisions: the W2 decisions are recorded in the change record section 9; the seed data splits are left to the developer (a local seed proof is needed); the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge.
```

```bash
export W2_DATE=$(date +%F)
export W2_H1=$(git log -1 --format=%h --grep='^refactor(web): move the source mutation')
export W2_H2=$(git log -1 --format=%h --grep='^test: build the Vitest aliases')
export W2_H3=$(git log -1 --format=%h --grep='^refactor(docs): split check.py')
export W2_H4=$(git log -1 --format=%h --grep='^test(docs): unit tests for the documentation checks')
export W2_H5A=$(git log -1 --format=%h --grep='^test(api): split the auth guard test')
export W2_H5B=$(git log -1 --format=%h --grep='^test(api): split the imports service test')
export W2_H5C=$(git log -1 --format=%h --grep='^test(api): split the reports service test')
export W2_H6=$(git log -1 --format=%h --grep='^test(web): split the activity proof dialog test')
export W2_L_CHECK=$(wc -l < .tmp/w2/check-before.py)
export W2_MOVE=$(grep '^moved ' .tmp/w2/services-move.log)
V=$(grep '^verdict: ' .tmp/w2/shell-scan.txt | sed 's/^verdict: //')
export W2_SCAN="\`$V\` (the shell stays)."
python3 .tmp/w2/fill-records.py .tmp/w2/activity-w2.md
cat .tmp/w2/activity-w2.md >> docs/activity-log.md
tail -n 11 docs/activity-log.md | cut -c1-100
```

Expected: no placeholder left, and the W2 section is the end of the log:

```
.tmp/w2/activity-w2.md: 0 placeholders left
- Gates (<date>, cloud container, head <sha>): lint, typecheck and tests pass with config 19,

## <date> Modularization W2 tooling follow-up (claude/modularization-s8b-xjnlzt)
- Task 1 (<sha>): `authorized-read-events.ts`, `source-mutation.ts` and `source-mutation.test.ts`
- Task 2 (<sha>): the Vitest aliases of the api, web and imports configs are built from the tscon
- Task 3 (<sha>): `scripts/docs/check.py` (1060 lines) became an entry point and the `scripts/doc
- Task 4 (<sha>): `scripts/docs/test_checks.py` (39 tests) runs in the `tooling` job; sixteen mut
- Task 5 (<sha>, <sha>, <sha>): the auth guard, imports service and reports service tests b
- Task 6 (<sha>): the activity proof dialog test became a harness and four test files; lost 0 lin
- Task 7: the change record (sections 3.3, 3.5, 3.7 and 9), the audit rows MOD-17 and MOD-21, the QA
- Decisions: the W2 decisions are recorded in the change record section 9; the seed data splits are 
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -n 3
pnpm lint 2>&1 | tail -n 1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record modularization W2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -n 7
```

Expected: the docs check stays at 0 failures and 0 warnings, lint is clean, and the commit holds five files:

```
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
Checked 1648 files in <ms>. No fixes applied.
[claude/modularization-s8b-xjnlzt <sha>] docs: record modularization W2
 5 files changed, 28 insertions(+), 8 deletions(-)
<sha> docs: record modularization W2
 docs/activity-log.md                                | 10 ++++++++++
 docs/audit-pathways-codebase-modularity-20261009.md |  4 ++--
 docs/cr-pathways-codebase-modularization.md         | 15 ++++++++++++---
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  5 +++--
 5 files changed, 28 insertions(+), 8 deletions(-)
```



---

### Task 8: Full release gates

**Files:** none (the activity log gets one line).

The gates run on the final head of the slice, in the cloud container. The database replay is not run here: it needs a non-root `initdb`, and the CI replay of the part 3 pull request (opened by the controller after the W2 gates) is its gate (W2 changes no SQL, no migration and no seed). The seeds, the dev servers, the e2e specs and the browser smoke are a pending local run. The api is built with `nest build` and the web app with the web build, never the root `pnpm build` (it runs `prisma generate`).

- [ ] **Step 1: Lint, typecheck, tests, docs check and the unused-local diagnostics**

```bash
pnpm lint 2>&1 | tail -n 2
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
bash .tmp/w2/suite.sh final
pnpm docs:check 2>&1 | tail -n 3
bash .tmp/w2/unused.sh final
diff .tmp/w2/unused-final.txt .tmp/w2/unused-base.txt && echo "unused locals equal the baseline"
git status --short
```

Expected: lint and typecheck are clean, every test count equals its baseline (the api and web suites have more files: 182 and 310), the docs check stays at 0 failures and 0 warnings, and the unused locals equal the baseline:

```
$ pnpm exec biome check .
Checked 1648 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
exit 0
apps/api test:  Test Files  172 passed | 10 skipped (182)
apps/api test:       Tests  2642 passed | 21 skipped (2663)
apps/web test:  Test Files  310 passed (310)
apps/web test:       Tests  3478 passed (3478)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
packages/shared test:  Test Files  54 passed (54)
packages/shared test:       Tests  885 passed (885)
      Tests  59 passed (59)
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
api: prisma/seeds/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 3
unused locals equal the baseline
```

The summary shows the test counts, so the lines of a failure would show `FAIL`. The run takes about ten minutes.

A test that W2 did not touch can fail on a timing limit when the machine is busy (an earlier run saw one web test of the collection import workspace fail with `Unable to find an element` after 1.8 s while other suites ran in parallel): run its file alone with `pnpm --filter @pathways/web exec vitest run <file>`, and when it passes rerun `bash .tmp/w2/suite.sh final` once; a failure in a file that a W2 task changed is a stop, except the `imports.service` flake of the list in the general constraints.

- [ ] **Step 2: Builds, SAD check and tooling tests**

```bash
bash .tmp/w2/build-routes.sh final
node .tmp/w2/compare-routes.mjs .tmp/w2/routes-base.txt .tmp/w2/routes-final.txt 1 | tee .tmp/w2/routes-final.diff | tail -n 1
grep -a Middleware .tmp/w2/routes-final.txt | cmp - .tmp/w2/middleware-base.txt && echo "Middleware equals the baseline"
pnpm --filter @pathways/api exec nest build > .tmp/w2/api-build-final.log 2>&1; echo "nest build exit $?"
find apps/api/dist -name '*.js' | grep -c "prisma/"
find apps/api/dist -name '*.js' | grep -c "harness"
pnpm sad:check --base "$(cat .tmp/w2/base-sha)" --head HEAD --output .tmp/w2/sad.json > .tmp/w2/sad.log 2>&1; echo "sad exit $?"
node -e "const r=JSON.parse(require('fs').readFileSync('.tmp/w2/sad.json','utf8'));for(const [role,files] of Object.entries(r.required_subagents))console.log(role,files.length);console.log('evaluations',r.subagent_evaluations.length,'blocked',r.subagent_evaluations.filter((e)=>e.status==='BLOCKED').length)"
npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -n 3
python3 -m unittest discover -s scripts/docs -p "test_*.py" 2>&1 | tail -n 3
git status --short
```

Expected: the web build keeps the Middleware size and the routes (within 1 kB), `nest build` succeeds with no harness in the dist and the same 44 `prisma/` files, the SAD check exits 0, and the three tooling suites pass (199 node tests, 13 and 39 Python tests):

```
exit 0
ƒ Middleware                                                      <n> kB
routes 72, over 1 kB 0
Middleware equals the baseline
nest build exit 0
44
0
sad exit 0
organization-isolation-checker 5
migration-integrity-guardian 1
beneficiary-privacy-guardian 20
metadata-import-validator 5
restraint-guardian 1
design-qa-agent 55
evaluations 0 blocked 0
# tests 199
# pass 185
# fail 0
# skipped 14
Ran 13 tests in <ms>

OK
Ran 39 tests in <ms>

OK
```

The SAD check routes the changed paths to six roles (the number is the paths per role, renames counted at both paths: the auth guard files go to `organization-isolation-checker`, `ci.yml` to `migration-integrity-guardian`) and evaluates no added line, so nothing can be `BLOCKED`.

- [ ] **Step 3: Prove the moves and count the slice**

```bash
node .tmp/w2/stale-paths.mjs .tmp/w2/services-rules.json .tmp/w2/services-moves.json | tail -n 1
B=$(cat .tmp/w2/base-sha)
git diff -M --name-status "$B" HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c
git diff -M --diff-filter=R --name-status "$B" HEAD | awk '$1 != "R100"' | wc -l
git diff --diff-filter=D --name-only "$B" HEAD
git log --oneline "$B"..HEAD | wc -l
git status --short | wc -l
```

Expected: no stale path, the status counts of the slice against its base, no rename below 100%, the four deleted tests, ten commits and a clean tree:

```
stale 0
     32 A
      4 D
     37 M
      3 R
0
apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
apps/api/src/modules/imports/imports.service.test.ts
apps/api/src/modules/reports/reports.service.test.ts
apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
10
0
```

Ten commits are the plan copy, Tasks 1 to 6 (eight commits) and Task 7; the gates commit of Step 4 is the eleventh. The status counts are those of the replay (the files of the slice against the staging commit).

- [ ] **Step 4: Record the gates**

```bash
H=$(git rev-parse --short HEAD)
D=$(date +%F)
F=$(sed 's/\x1b\[[0-9;]*m//g' .tmp/w2/test-final.log | grep -E "^(apps|packages)/[a-z]+ test: +Tests " | sed -E 's#^[a-z]+/([a-z]+) test: +Tests +([0-9]+) passed.*#\1 \2#' | paste -sd, | sed 's/,/, /g')
printf -- '- Gates (%s, cloud container, head %s): lint, typecheck and tests pass with %s (the api and web suites have more test files than the baseline, the splits; every test count equals its baseline); docs check 0 failures and 0 warnings; the api builds with `nest build` with no harness in the dist and the web build has the same Middleware and the same routes, each within 1 kB of its baseline; SAD check exit 0 with no BLOCKED evaluation; the tooling tests pass; the replay is the gate of the part 3 pull request in CI (opened by the controller after the W2 gates; the PASS count is read from that run), and the seeds, dev servers, e2e and the browser smoke are a pending local run.\n' "$D" "$H" "$F" >> docs/activity-log.md
tail -n 2 docs/activity-log.md | cut -c1-120
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record the W2 gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git status --short | wc -l
```

Expected: the gates line is the end of the log, the commit holds one line and the tree is clean:

```
- Decisions: the W2 decisions are recorded in the change record section 9; the seed data splits are left to the develope
- Gates (<date>, cloud container, head <sha>): lint, typecheck and tests pass with config 19, shared 885, imports
[claude/modularization-s8b-xjnlzt <sha>] docs: record the W2 gates
 1 file changed, 1 insertion(+)
0
```

W2 opens no pull request itself; the controller opens the part 3 stacked pull request into `dev` after the W2 gates, and no branch is pushed by the slice: the controller pushes `claude/modularization-s8b-xjnlzt`. No plan copy is removed and nothing is merged into `dev`.
