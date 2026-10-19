# W1 Tooling and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the tooling half of the codebase modularization with no change to any request, response, permission decision, migration, seed content or screen: group `scripts/db` into `local`, `hosted` and `defense`, rename `infra/supabase/phase6` to `replay`, move the seed scripts into `apps/api/prisma/seeds`, run the tooling tests that no gate runs in CI, split the one oversized analytics test, and close the deferrals that the cloud runs of S1 to S8 left to W1. The work that is not tooling (path aliases, the `check.py` split, the `lib/services` residue and the largest test splits) is outlined at the end as W2; the per-domain seed data split is left to the developer.

**Architecture:** W1 is a set of moves proven by script, not by reading. A move script does for any file type what the S6b mover did for web files: `git mv` by regex rule, then every relative specifier, repo path, bare file name and repository root lookup that the move changes is rewritten with exact counts, and a report proves that every move is a rename in the index and that every changed code line of a renamed file differs only inside a path, a quoted string or a comment. A repo-wide scan, untracked files included, proves that no file outside the history files still names an old path. The Windows PowerShell workflows keep working because the old entry points stay as forwarding stubs in a separate commit, so each move commit is a pure rename. Task 0 recounts what the slices below changed; Task 1 closes the small deferrals; Task 2 splits the analytics test; Tasks 3 to 5 do the three moves; Task 6 wires the tooling tests into CI; Task 7 records the slice; Task 8 runs the release gates.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS and Prisma 6.19.2 (api), Next 15.5.14 (web), Vitest 3.2, Node test runner (`node --test`, Node 22), Python 3 `unittest`, PowerShell 7 with Pester 5, Biome 1.9.4.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.5, 3.7 W1 row and 9, including the "Left to W1" and "Deferred to W1" lines of the earlier dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-19 for the replay folder, MOD-20 for the tests that no gate runs, MOD-21 for the seed folder; MOD-17 for the test file names). The deferrals of the cloud runs are in `docs/activity-log.md` (the S4a, S5a, S5b, S6b, S7b and S8 sections).

## Rulings

Controller rulings for W1. Each was checked in the replay from the S8b tip; Task 0 recounts them. Each ruling states its cost if wrong.

1. **Split W1 and W2.** The W1 roadmap row holds seven items (scripts, replay rename, tests in CI, path aliases, `check.py` split, seeds, docs paths) and the deferrals of the cloud runs, which makes the nine tasks below (Task 0 to Task 8) and twelve commits; adding the path aliases (a decision about the web and api import styles), the `check.py` split (a 1000 line Python tool with its own tests), the `lib/services` residue (a decision about where `authorized-read-events.ts` and `source-mutation.ts` live) and the per-domain seed data splits (they need a seed run on a local database) would pass ten tasks and mix mechanical moves with design. W1 (this plan, Tasks 0 to 8) takes everything that is a proven move, a CI wiring or a recorded deferral; W2 (outline at the end) takes the rest except the per-domain seed data splits, which are left to the developer because their proof is a seed run on a local database. The CR 3.7 table gets a W2 row (Task 7). Cost if wrong: one more slice branch.
2. **Facts of the slices below are recounted, not assumed.** S5c, S6c, S7a to S7d and S8a and S8b move web, api and shared files but none of the paths W1 renames; they may change a count (the file count of `scripts/db`, the seed files, the line count or the path of the analytics test) and they may leave a deferral of their own to W1. Task 0 Step 5 recounts every figure that they can move and prints it; a different value is recorded and carried on, except that a missing path that W1 renames, or a mismatch that the Expected text of a step names as a stop, is reported as NEEDS_CONTEXT. The analytics test is found by `git ls-files` (S7b moves it from `modules/dashboards` to `modules/analytics`). Cost if wrong: a stop on a count.
3. **`scripts/db` is grouped by prefix; the group prefix leaves the file name.** The 34 files already carry the group in the name (`local-reset.mjs`, `hosted-build.mjs`, `defense-snapshot-parse.test.mjs`), so the rule is one regex: `scripts/db/<group>-<name>` becomes `scripts/db/<group>/<name>` (`local/` 6 files, `hosted/` 9, `defense/` 19). The four entry points that Windows PowerShell workflows and the runbooks outside the repository name (`hosted-build.mjs`, `hosted-seed.mjs`, `defense-demo.mjs`, `defense-snapshot.mjs`) stay at the old path as stubs that start the moved script with the same arguments, the same standard input and the same exit code (a separate commit, so that the move is a pure rename). The six local scripts get no stub: they run through `pnpm db:*` and `pnpm dev:local`, which the move updates. Cost if wrong: a stub more or less.
4. **`infra/supabase/phase6` becomes `infra/supabase/replay`, and the internal names stay.** The folder keeps its 58 files (all R100). Inside the scripts the `$phase6*` variables, the database `pathways_phase4_phase6_replay` (the CI environment, the `current_database()` guards of the runtime SQL and the legacy retirement SQL regex depend on it), the variable `PATHWAYS_PHASE6_REPLAY_MIGRATIONS`, the `.tmp/pathways-phase6-*` directories and the `PHASE6_LOCAL_REPLAY=PASS` line keep their names: renaming them is a behavior change of the gate, not a path change. `Verify-Forward.ps1` records its own SHA256 at run time (`Get-FileHash` of `$PSScriptRoot` `Verify-Forward.ps1`), so the folder rename moves it and does not touch its content; Task 4 proves the blob hash equal and CR section 7 already says "W1 renames the folder only and does not split the file". The four PowerShell entry points that the hosted and defense workflows call (`Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1`, `Test-SchemaDrift.ps1`) stay at the old path as forwarders that pass `@args` and the exit code through; the SQL files get no stub, because only scripts and tests read them. Cost if wrong: a broken Windows workflow, which the forwarders prevent, or a CI replay failure on the path edit, which Task 4 checks by parsing the workflow and the renamed scripts.
5. **The seeds go flat into `apps/api/prisma/seeds`, and the authorization bootstrap stays.** MOD-21 proposes `seeds/{local,defense,hosted}`. The seed files import each other across those three groups (`local-demo-stages.ts` imports six `defense-demo-stage-*` files and the defense files import local ones; `local-demo-seed.ts` and `defense-demo-seed.ts` import `hosted-realistic-seed.ts`), so subfolders would make the folder names lie or force a fourth `shared` folder and a rename of every import; one flat folder with unchanged names is a pure move, keeps the names the runbooks use and still makes `prisma/` the schema, the migrations and a few operational scripts. `authorization-bootstrap-runner.ts` and its two tests, `check-connection.ts`, the three `legacy-retirement*` files, `schema.prisma`, `migrations/`, `history/` and `tests/` stay: they are not seeds (the bootstrap runner is the reviewed RBAC administrator tool that `seed.ts` points to). The 6 demo photos and 4 import fixtures move with the code that reads them. Cost if wrong: a later `git mv` into subfolders.
6. **Tests that no gate runs are wired into CI; none is retired.** Task 0 ran each group: the node tests of `scripts/db` (164 tests, 162 pass, 2 skipped by their own environment gate), the security adapter output check (24 tests, 12 pass, 12 skipped for the same reason), the Python migration checks (13 tests) and the Pester files `replay-port` (2) and `replay-timing` (3) pass and need no database, so a `tooling` job runs them (the node tests through the new `test:scripts` script). `test_catalogs.py` hard-codes the 27 migrations of the immutable archive: that is its subject and the test stays. The Pester files of `Invoke-RuntimeSql`, `Invoke-RuntimeVitest` and `Test-SchemaDrift` need a saved replay cluster and a non-root `initdb`: they stay local runs (QAD names the commands), because a CI job that replays the cluster twice would double the gate. The job installs nothing for the node and Python tests (Task 6 Step 2 runs them on an export without `node_modules`). Cost if wrong: one CI job that fails for a reason the local run did not show; the part 3 pull request shows it.
7. **Only the analytics service test is split; the other tests above 600 lines are listed for W2.** CR 3.5 says tests above about 600 lines split by concern, and the CR section 9 line of S7b leaves `analytics.service.test.ts` (1514 lines, three `describe` blocks, a 326 line shared harness) to W1; no slice was given the others. The split follows `<file>.<concern>.test.ts` with the shared fixtures in `analytics.service.harness.ts`; the suffix `.harness` is new, so CR 3.5 lists it (Task 7) and `tsconfig.build.json` excludes it, because the build only excludes `*.test.ts` and `*.spec.ts` and the harness imports `vitest`. Task 0 Step 5 prints the count and the largest of the test files still above 600 lines (16 at the S8b tip, the analytics service test among them, for example the activity proof dialog test, the `pathways-client` test and the auth guard test); each needs the line and title proof of Task 2, and a split plan per file is W2 work. Cost if wrong: one more split.
8. **The deferrals of the cloud runs are closed as small commits, each with a proof.** (a) `ParticipantsService` takes the caller's `tx` in every method (S5a), so its `PrismaService` constructor parameter is unused (TS6138); the parameter and the argument of its three constructions go. (b) The eight `Prisma.TransactionClient` annotations of the imports and metadata test harnesses become the `Tx` alias that production modules use. (c) The two seed literal unions of `local-demo-data.ts` and `local-demo-stage-reports.ts` become `OverdueExplanationCategory` and `ReportKindCode` of `@pathways/shared`; both are types only. (d) The web tests `pathways-client.c2-c4.test.ts` and `pathways-client.survey-subject.test.ts` no longer test `pathwaysClient` (S4b); they move to `lib/api/scoped-endpoints.test.ts` and `lib/api/beneficiaries.survey-subject.test.ts` with their titles unchanged. (e) The `pathways-client` mock factory of `beneficiary-detail-loader.test.tsx` mocks a module the loader no longer imports (S6b), so it goes. Each edit is an exact replacement list with a count, and each test file change is proven by `test-titles.mjs` (`lost 0`). Cost if wrong: a stop on a count.
9. **The movers are gitignored scripts that prove their own counts; history files keep their paths.** The mover rewrites living files only: the activity log, the audits, the change records (`docs/cr-*`), the handoff and superpowers documents, `apps/api/prisma/history` and the migrations keep the paths they were written with, because they describe what was true then. The scan that proves "no stale reference" skips the same list and nothing else, and it reads untracked files too. Each move commit holds the renames and the path edits and nothing else; forwarders are separate commits. Cost if wrong: a stale path in a living doc, which the scan prints.
10. **AGENTS.md, the SDD and the READMEs.** AGENTS.md is materialized from `docs/build-pathways.md` (`pnpm docs:materialize`) and names none of the moved paths, so it is not edited; `docs/sad-pathways.md` (the SDD routing table) and the runbooks, QAD, deferred features and the folder READMEs are living docs that the movers rewrite. The replay README text (it lists six migrations of 69) is not refreshed: its content is not a path. Cost if wrong: one stale README sentence.
11. **Left to W2 (recorded in CR section 9).** Path aliases in one place (the api `@app/*` and the web `@/*` are declared in tsconfig, vitest, Next and Biome configs separately; one source needs a design), the `scripts/docs/check.py` split (the roadmap says `docs/check.py`; the file is `scripts/docs/check.py`), `authorized-read-events.ts` and `source-mutation.ts` from `lib/services` to `lib/api/core` with the scan that retires the `pathways-client.ts` shell, and the splits of the largest tests. The per-domain splits of `local-demo-data.ts` and `hosted-realistic-seed.ts` (MOD-21's data part) are left to the developer, not to W2: their proof is a seed run on a local database, which the cloud container cannot do. Cost if wrong: the W2 branch.
12. **SAD routing.** `scripts/sad/check.ts` names `infra/supabase/phase6/*.ps1` in three routes; the mover rewrites the three globs to `replay` (Task 4), and the combined `sad:check` of Task 8 runs on the whole range. No new route is added: the new folders are covered by `scripts/db/**`, `infra/supabase/**` and `apps/api/prisma/**`. Cost if wrong: one glob.
13. **No pull request, and what runs where.** W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2 (the developer chose stacked pull requests; part 3 holds S7a to W2), and the CI replay of that pull request is the gate for the database replay. The slice pushes nothing (the controller pushes the slice branch). Seeds, dev servers, e2e, the browser smoke, the Windows PowerShell forwarders and the full replay are a pending local run (recorded in Task 8). Cost if wrong: none.

## Interfaces assumed from earlier sub-projects

- S8b and the dev merge: W1 runs on `claude/modularization-s8b-xjnlzt`, the branch S8b ended on at `61ef8c5d`, and every slice from S5b to S8b is an ancestor of HEAD (Task 0 Step 1 proves it by ancestry, checks two files only S8b creates and the "Dev merge before S8b" record). The dev merge touches none of the paths W1 renames.
- S7b: `analytics.service.test.ts` and its harness fixtures sit in `apps/api/src/modules/analytics` (found by `git ls-files`); the three `describe` titles and the nested `trusted aggregates` block are the anchors of the split script.
- S6b: `apps/web/src/lib/api/core/owned-json-read.ts`, `finance.ts` and the client modules in `lib/api`; `beneficiary-detail-loader.tsx` no longer imports `pathways-client`.
- S5a and S4a: `ParticipantsService` methods take the caller's `tx` (S5a), the `Tx` alias in `apps/api/src/common/prisma/transaction.ts`; `OverdueExplanationCategory` and `ReportKindCode` in `@pathways/shared`.
- S4b: `lib/api/beneficiaries.ts`, `lib/api/activities.ts` and `journeys.ts`, the clients that the two renamed web tests exercise; `source-mutation.ts` stays in `lib/services` (the renamed test imports `../services/source-mutation`).
- F1: the SAD checker routes by `path` and by `oldPath` of a rename, which the moves rely on.

## Produces (names later plans consume)

- Folders: `scripts/db/{local,hosted,defense}/` (names without the group prefix), `infra/supabase/replay/`, `apps/api/prisma/seeds/` (flat); the package scripts `db:local:*`, `db:defense:local` and `dev:local` point at the new paths.
- Forwarders: `scripts/db/{hosted-build,hosted-seed,defense-demo,defense-snapshot}.mjs` and `infra/supabase/phase6/{Replay-Local,Invoke-RuntimeSql,Invoke-RuntimeVitest,Test-SchemaDrift}.ps1`; W2 or a later cleanup may delete them when no workflow names them.
- `pnpm test:scripts` (node tests of `scripts/db` and the security adapter output check) and the `tooling` job of `.github/workflows/ci.yml`.
- The `.harness` suffix (CR 3.5): `analytics.service.harness.ts`, excluded from `tsconfig.build.json`.
- `lib/api/scoped-endpoints.test.ts` and `lib/api/beneficiaries.survey-subject.test.ts`; `ParticipantsService` without a constructor.
- The movers `.tmp/w1/{move-paths,deepen-root,moved-report,stale-paths,make-stubs}.mjs` (gitignored) are reusable by W2.

## Global Constraints

- Behavior-preserving: no request, response, permission, audit row, migration or seed content changes. A moved file's content changes only in a path, a specifier or a repository root lookup, and `moved-report.mjs` proves it. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts`, `apps/api/src/common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit.
- File moves use `git mv` (the move script does it); every rename is proven by script: `lost 0`, a rename in the index, and no stale reference by a scan of every tracked and untracked file that is not history.
- Windows PowerShell: the old entry points of the hosted and defense workflows keep working through forwarders (rulings 3 and 4); `Verify-Forward.ps1` content is unchanged.
- Kebab-case file names that describe purpose; markdown names are kebab-case; comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- No customer personal data and no credentials in any file; the scripts and tests use the fictional values already in the files. The dummy `DIRECT_URL` of the seed probe points at a closed local port and holds no password.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/w1/trim-imports.mjs <file>` after removing code and `bash .tmp/w1/unused.sh <name>` (api and web `tsc --noEmit --noUnusedLocals`, about three minutes each, give the command a ten minute timeout) after Tasks 1 and 8: the diagnostics must equal the baseline of Task 0 except the one line Task 1 fixes.
- Never run `pnpm build` at the repository root and never run `prisma generate`: the root build runs the api through `prisma generate`, and the Prisma client is already generated. The only builds of the slice are the package builds, `nest build` and the web build of Task 0 Step 3 and Task 8 Step 2.
- `pnpm typecheck` and the web build rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` after every typecheck or build and before every commit.
- Bash blocks share no shell state: each block starts with what it needs. Write the scripts and test files with the Write tool (or the `Create` blocks as printed), not a shell heredoc: a heredoc in this environment eats the backslashes of regular expressions. One-off scripts live in `.tmp/w1/` (gitignored) and are never committed.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container. PowerShell steps need `pwsh` and Pester 5 (`Import-Module Pester -MinimumVersion 5.0`); where they are missing the step is "pending local run" and the static checks of the step stand.
- Known flakes: the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`, web `collection-workspace` timeouts under load, api `imports.service.test.ts` (duplicate metadata keys) and one `pnpm sad:test` case under load. Rerun such a file alone before treating it as real. If any `Expected:` line below differs from what a command prints, stop and report NEEDS_CONTEXT, except for the counts that ruling 2 says are recounted.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>` and `<date>` for values that differ per run and `<n>` for the absolute Middleware size (102 kB or 103 kB by checkout); a commit line names the real branch; every other figure is the replay of this plan from the S8b tip (`61ef8c5d` plus the staging commit); a figure that ruling 2 names as recounted may differ, any other difference is a stop. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
- Expected test counts are stated as deltas from the baselines `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web` and `B_sad` of Task 0 Step 3; no task adds or removes a test (the analytics split and the renames keep every title), so every later test count equals its baseline; the api suite has two test files more after Task 2 (the one file became three, plus the harness is not a test file).
- Every commit runs as `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "..."` and ends its message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg`.
- Work in the repository root on `claude/modularization-s8b-xjnlzt`, the branch S8b ended on (W1 and W2 stack on it because the cloud session can push only that name; Task 0 Step 1 proves the stacking); no new worktree, no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch; nobody pushes `dev` or `master`. Do not touch migrations, `.env` files, review evidence or the content of `Verify-Forward.ps1`.
- W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2. The slice merges nothing into `dev` or `master`. Each bash block runs alone in a fresh shell. No plan copy is removed in this slice: the executed plan copies of the earlier slices stay listed in `docs/superpowers/plans` until the controller removes them after the final merge.

## Review Focus

1. Every move must be a pure rename in the index: Tasks 3 to 5 print the rename count and the report of changed code lines (a line that differs outside a path, a quoted string or a comment is listed as `unexplained`).
2. `Verify-Forward.ps1` must be byte for byte the same after the rename (Task 4 compares the blob hash), because it records its own SHA256.
3. The CI replay step must name the new path exactly (Task 4 parses the workflow), because the replay in the part 3 pull request (opened by the controller after W2) is the database gate.
4. The forwarders must pass arguments, standard input and the exit code through (Tasks 3 and 4 run a probe through each kind and compare it with the direct call).
5. A root lookup that moved one folder deeper must have gained one `'..'` (`deepen-root.mjs`), and the three scripts that join the replay folder from path parts must name `replay` (Task 4 token edits).
6. The seed command of `prisma.config.ts` must point at `prisma/seeds/seed.ts` (Task 5 runs `prisma db seed` against a dummy URL, which prints the disabled message of `seed.ts`).
7. The harness must not reach the production build (Task 2 Step 4 counts it in the build file list before and after; Task 8 counts it in `dist`).
8. No test is lost: Tasks 1 and 2 compare every full test name before and after (`lost 0`), and Task 6 wires tests without changing them.

## File map

| Path | Role after W1 |
|---|---|
| `apps/api/src/modules/participants/participants.service.ts` and `.test.ts` | no constructor parameter (Task 1) |
| `apps/api/src/modules/{imports,metadata}/*.test.ts` (four files) | `Tx` instead of `Prisma.TransactionClient` (Task 1) |
| `apps/web/src/lib/api/scoped-endpoints.test.ts`, `beneficiaries.survey-subject.test.ts` | renamed web client tests (Task 1) |
| `apps/api/src/modules/analytics/analytics.service.{harness,read-export.test,survey-timeline.test,aggregate-only-roles.test}.ts` | the split analytics test (Task 2) |
| `apps/api/tsconfig.build.json` | excludes `*.harness.ts` (Task 2) |
| `scripts/db/{local,hosted,defense}/` | the 34 database scripts (Task 3) |
| `scripts/db/{hosted-build,hosted-seed,defense-demo,defense-snapshot}.mjs` | forwarders (Task 3) |
| `infra/supabase/replay/` | the replay folder (Task 4) |
| `infra/supabase/phase6/*.ps1` (four files) | forwarders (Task 4) |
| `apps/api/prisma/seeds/` | the 56 seed files (Task 5) |
| `.github/workflows/ci.yml`, `package.json` | the `tooling` job and `test:scripts` (Tasks 4 and 6) |
| `scripts/sad/check.ts` | three globs renamed (Task 4) |
| `docs/` change record, audit, QAD, index, activity log, runbooks | records and paths (Tasks 3 to 8) |



---

### Task 0: Stacked branch check and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-w1-tooling-docs.md` (this plan; `<date>` is the day Task 0 runs, from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan rows)
- Create (gitignored): `.tmp/w1/base-sha`, `replace-exact.mjs`, `trim-imports.mjs`, `drop-unused.mjs`, `test-titles.mjs`, `same-lines.mjs`, `suite.sh`, `unused.sh`, `pester.ps1`

- [ ] **Step 1: Confirm the stacked branch holds S8b and nothing of W1**

W1 runs on `claude/modularization-s8b-xjnlzt`, the branch S8b ended on. The block makes `.tmp/w1` and records the head as `base-sha` first (the staging commit of this plan, which is the base of the SAD check in Task 8), proves by ancestry that every slice from S5b to S8b is below HEAD, and checks the files and the record that only S8b and the dev merge leave. The tip of S8b is `61ef8c5d`; the local branch refs of the stacked slices exist in the cloud container, and a missing local ref falls back to `origin/`.

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p .tmp/w1
git rev-parse HEAD > .tmp/w1/base-sha
git status --short
git branch --show-current
for s in s8b s8a s7d s7c s7b s7a s6c s5c s6b s5b; do
  B=claude/modularization-$s-9ept8o
  git rev-parse -q --verify "$B" > /dev/null || B="origin/$B"
  git merge-base --is-ancestor "$B" HEAD && echo "$s: branch is an ancestor of HEAD"
done
git merge-base --is-ancestor 61ef8c5d HEAD && echo "S8b tip 61ef8c5d is an ancestor of HEAD"
test -f apps/web/src/lib/api/publication.ts && test -f apps/web/src/features/settings/index.ts && echo "S8b present"
echo "dev merge records: $(grep -c '^Dev merge before S8b' docs/cr-pathways-codebase-modularization.md)"
test -f apps/web/src/lib/api/core/owned-json-read.ts && test -f apps/web/src/lib/api/finance.ts && echo "S6b present"
test -f scripts/db/hosted-build.mjs && test -d infra/supabase/phase6 && test -f scripts/docs/check.py && test -f apps/api/prisma/seed.ts && echo "W1 sources present"
test ! -d scripts/db/hosted && test ! -d infra/supabase/replay && test ! -d apps/api/prisma/seeds && echo "W1 not applied"
test -f docs/handoff/modularization-w1-tooling-docs.md && echo "handoff copy present"
ls docs/superpowers/plans | wc -l
```

Expected: `git status --short` prints nothing. Then the branch, the ten ancestor proofs (S5b to S8b), the S8b tip, the S8b marker files, the one dev merge record, the marker lines and the plan count:

```
claude/modularization-s8b-xjnlzt
s8b: branch is an ancestor of HEAD
s8a: branch is an ancestor of HEAD
s7d: branch is an ancestor of HEAD
s7c: branch is an ancestor of HEAD
s7b: branch is an ancestor of HEAD
s7a: branch is an ancestor of HEAD
s6c: branch is an ancestor of HEAD
s5c: branch is an ancestor of HEAD
s6b: branch is an ancestor of HEAD
s5b: branch is an ancestor of HEAD
S8b tip 61ef8c5d is an ancestor of HEAD
S8b present
dev merge records: 1
S6b present
W1 sources present
W1 not applied
handoff copy present
16
```

A missing line means the branch lacks a stacked slice, the dev merge or a W1 source: stop and report NEEDS_CONTEXT. `W1 not applied` must print, or W1 has run before. The last figure counts the plan copies in `docs/superpowers/plans`: the 15 copies of S3b to S8 and the S8b copy, 16 here and 17 after Step 6.

- [ ] **Step 2: Create the baseline scripts**

Create each file with the Write tool exactly as printed. `replace-exact.mjs` applies an exact replacement list and fails unless every `from` text occurs the stated number of times:

Create `.tmp/w1/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/w1/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

`trim-imports.mjs` drops named imports that no longer appear in a file body (comments and quoted strings do not count as use):

Create `.tmp/w1/trim-imports.mjs`:

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

`drop-unused.mjs` removes the imports and local type aliases that the package typecheck reports as unused in the named files, for the whole-import cases `trim-imports.mjs` cannot see:

Create `.tmp/w1/drop-unused.mjs`:

```js
// Removes the imports and local type aliases that tsc --noUnusedLocals reports unused in the given files, and prints what it removed.
// Usage: node .tmp/w1/drop-unused.mjs <package dir> <file relative to it>...
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [dir, ...files] = process.argv.slice(2)
const out = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '--noUnusedLocals'], { cwd: dir, encoding: 'utf8' }).stdout
const flagged = new Map()
for (const match of out.matchAll(/^(\S+)\((\d+),\d+\): error TS(?:6133|6196): '(\w+)' is declared/gm)) {
  if (!files.includes(match[1])) continue
  flagged.set(match[1], [...(flagged.get(match[1]) ?? []), { line: Number(match[2]), name: match[3] }])
}
for (const [file, items] of flagged) {
  const full = path.join(dir, file)
  let lines = readFileSync(full, 'utf8').split('\n')
  for (const { line, name } of items.sort((a, b) => b.line - a.line)) {
    let start = line - 1
    while (start > 0 && !/^(?:import|type) /.test(lines[start])) start--
    let end = start
    while (end < lines.length && !/(?:from '[^']+'|^type .*)$/.test(lines[end]) && !/^type /.test(lines[start])) end++
    const statement = lines.slice(start, end + 1).join('\n')
    let next = ''
    if (/^import \* as|^import \w+ from|^type /.test(statement)) next = ''
    else {
      const names = statement.match(/\{([\s\S]*)\}/)[1].split(',').map((n) => n.trim()).filter(Boolean)
      const kept = names.filter((n) => n.replace(/^type /, '').split(' as ').at(-1) !== name)
      next = kept.length ? statement.replace(/\{[\s\S]*\}/, `{ ${kept.join(', ')} }`) : ''
    }
    lines.splice(start, end - start + 1, ...(next ? next.split('\n') : []))
    console.log(`${file}: ${name}`)
  }
  writeFileSync(full, lines.join('\n'))
}
```

`test-titles.mjs` saves the full names of the tests of some files and compares two saved lists, so a split or a rename loses no test:

Create `.tmp/w1/test-titles.mjs`:

```js
// Runs the given test files of one package and saves the sorted full names of their tests (describe path included), or compares two saved lists.
// Usage: test-titles.mjs save <api|web> <out.json> <test file>...   |   test-titles.mjs compare <before.json> <after.json>
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, a, b, ...rest] = process.argv.slice(2)
const count = (titles) => titles.reduce((map, title) => map.set(title, (map.get(title) ?? 0) + 1), new Map())

if (mode === 'save') {
  const [out, ...files] = [b, ...rest]
  const prefix = `apps/${a}/`
  const relative = files.map((file) => file.replace(prefix, ''))
  const raw = `${out}.raw`
  try {
    execFileSync('pnpm', ['--filter', `@pathways/${a}`, 'exec', 'vitest', 'run', ...relative, '--reporter=json', `--outputFile=${process.cwd()}/${raw}`], { stdio: 'ignore' })
  } catch {
    // A failing run still writes its report; the caller reads the failure count.
  }
  const report = JSON.parse(readFileSync(raw, 'utf8'))
  const names = report.testResults.flatMap((file) => file.assertionResults.map((test) => test.fullName)).sort()
  writeFileSync(out, JSON.stringify(names, null, 1))
  console.log(`files ${report.testResults.length}, tests ${names.length}, failed ${report.numFailedTests}`)
} else {
  const before = count(JSON.parse(readFileSync(a, 'utf8')))
  const after = count(JSON.parse(readFileSync(b, 'utf8')))
  const lost = []
  const added = []
  for (const [name, n] of before) if ((after.get(name) ?? 0) < n) lost.push(`${name} (${n} -> ${after.get(name) ?? 0})`)
  for (const [name, n] of after) if (n > (before.get(name) ?? 0)) added.push(`${name} (${before.get(name) ?? 0} -> ${n})`)
  if (lost.length) console.log(`lost:\n${lost.join('\n')}`)
  if (added.length) console.log(`added:\n${added.join('\n')}`)
  const total = (map) => [...map.values()].reduce((x, y) => x + y, 0)
  console.log(`before ${total(before)}, after ${total(after)}, lost ${lost.length}, added ${added.length}`)
  process.exitCode = lost.length || added.length ? 1 : 0
}
```

`same-lines.mjs` proves that a split lost no line of the original:

Create `.tmp/w1/same-lines.mjs`:

```js
// Fails when a line of the original is lost across the new files; prints the lines the new files add.
// Usage: same-lines.mjs <original>@<start regex> <new file>@<start regex>... [--list]   (a file is read from its first line matching its regex)
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const list = args.includes('--list')
const [original, ...files] = args.filter((arg) => arg !== '--list')

// Trimmed non-blank lines from the start line on, without export keywords.
const body = (spec) => {
  const [file, start] = spec.split('@')
  const lines = readFileSync(file, 'utf8').split('\n')
  const at = lines.findIndex((line) => new RegExp(start).test(line))
  if (at < 0) throw new Error(`${file}: no line matches ${start}`)
  return lines
    .slice(at)
    .map((line) => line.trim().replace(/^export /, ''))
    .filter((line) => line !== '')
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(body(original))
const after = count(files.flatMap(body))
const lost = []
const added = []
for (const [line, n] of before) if ((after.get(line) ?? 0) < n) lost.push(`${line} (${n} -> ${after.get(line) ?? 0})`)
for (const [line, n] of after) if (n > (before.get(line) ?? 0)) added.push(`${n - (before.get(line) ?? 0)}x ${line}`)
const total = [...before.values()].reduce((a, b) => a + b, 0)
if (lost.length) console.log(`lost lines:\n${lost.join('\n')}`)
if (list) console.log(added.join('\n'))
console.log(`original lines ${total}, lost ${lost.length}, added ${added.length}`)
process.exitCode = lost.length ? 1 : 0
```

`suite.sh` runs every test suite and prints the counts; `unused.sh` saves the unused-local diagnostics of the api and web typechecks; `pester.ps1` runs the Pester files of a folder:

Create `.tmp/w1/suite.sh`:

```bash
#!/bin/bash
# Usage: suite.sh <name>; runs every package test suite without stopping at the first failing package, then the SAD checker tests, saves the log in .tmp/w1 and prints the file and test counts.
pnpm -r --no-bail --if-present run test > .tmp/w1/test-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/w1/test-$1.log | grep -aE "^(apps|packages)/[a-z]+ test: +(Test Files|Tests) | FAIL " | sort -s -t: -k1,1
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
```

Create `.tmp/w1/unused.sh`:

```bash
#!/bin/bash
# Usage: unused.sh <name>; saves the unused-local diagnostics of the api and web typechecks as .tmp/w1/unused-<name>.txt and prints the line counts.
(cd apps/api && pnpm exec tsc --noEmit --noUnusedLocals 2>&1 | sed 's/^/api: /') > .tmp/w1/unused-$1.txt
(cd apps/web && pnpm exec tsc --noEmit --noUnusedLocals 2>&1 | sed 's/^/web: /') >> .tmp/w1/unused-$1.txt
cat .tmp/w1/unused-$1.txt
echo "lines $(wc -l < .tmp/w1/unused-$1.txt)"
```

Create `.tmp/w1/pester.ps1`:

```powershell
# Runs the Pester files under a path and exits non-zero when one fails.
param([Parameter(Mandatory)][string]$Path)
Import-Module Pester -MinimumVersion 5.0
$config = New-PesterConfiguration
$config.Run.Path = $Path
$config.Run.Exit = $true
$config.Output.Verbosity = 'Minimal'
Invoke-Pester -Configuration $config
```

- [ ] **Step 3: Record the baselines**

Record the figures as `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web` and `B_sad`; every later Expected states a delta from them. Run each block with a ten minute timeout.

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
bash .tmp/w1/suite.sh base
pnpm docs:check 2>&1 | tail -3
git status --short
```

Expected: the figures of the replay from the S8b tip, to be written down as the baselines. Lint reports no fixes, typecheck prints `Done` for config, shared, imports, web and api, and the summaries are:

```
$ pnpm exec biome check .
Checked 1626 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
exit 0
apps/api test:  Test Files  164 passed | 10 skipped (174)
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

The `Tests` line without a package prefix is `sad:test` (`B_sad`). `docs:check` ends with `0 failure(s), 0 warning(s)` (dev's fix `34162c12` cleared the older 6 failures and 1 warning), so any failure from here on is a stop. The package lines are `B_config`, `B_shared`, `B_imports`, `B_api` and `B_web`: config 19, shared 885 in 54 files, imports 94, api 2642 passed and 21 skipped in 164 files (10 skipped), web 3478 in 307 files and `B_sad` 59; S8b is the last slice below W1, so a different figure is a stop. `git status --short` prints nothing.

```bash
bash .tmp/w1/unused.sh base
```

Expected: the unused-local diagnostics of the baseline (record them: Task 1 removes the `participants.service.ts` line and nothing else may change):

```
api: prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
api: src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 4
```

The `hosted-realistic-seed.ts` and web lines are not W1's and stay. If S5c to S8b left other lines, they join the baseline.

The production build is the baseline for the harness exclusion of Task 2 and for the Middleware size (a build takes about three minutes; give it a ten minute timeout):

```bash
rm -rf apps/web/.next apps/api/dist
(pnpm --filter "@pathways/api^..." run build && pnpm --filter @pathways/api exec nest build && pnpm --filter @pathways/web build) > .tmp/w1/build-base.log 2>&1; echo "build exit $?"
grep -aE "Middleware" .tmp/w1/build-base.log | head -1 | tee .tmp/w1/middleware-base.txt
git checkout -- apps/web/next-env.d.ts
find apps/api/dist -name '*.js' | grep -c "prisma/"
find apps/api/dist -name '*.js' | grep -c "analytics.service.test"
git status --short
```

Expected: the build succeeds and the baselines for Task 8 are:

```
build exit 0
ƒ Middleware                                                      <n> kB
44
0
```

The build is three commands (the package builds, `nest build` and the web build), never `pnpm build` at the root. The Middleware line is `M0` (103 kB here, 102 kB in a scratch clone, so the Expected writes `<n>`; the line is saved in `.tmp/w1/middleware-base.txt` and Task 8 compares it byte for byte); the first count is the number of compiled files under `prisma/` in `apps/api/dist` and the second is the test file of Task 2, which the production build already excludes. A Middleware size that changes by Task 8 is a stop.

- [ ] **Step 4: Run the tooling tests that are not in CI today**

These five groups are the "tests not run by any gate" of MOD-20. The replay folder is still `infra/supabase/phase6` here. `pester.ps1` needs Pester 5; where `pwsh` or Pester is missing, record "pending local run" and go on.

```bash
node --test "scripts/db/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
node --test infra/supabase/security-adapter/runtime-output.test.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -3
for f in replay-port replay-timing; do pwsh -NoProfile -File .tmp/w1/pester.ps1 -Path infra/supabase/phase6/$f.Tests.ps1 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests Passed"; done
git status --short
```

Expected: the five groups pass: 164 node tests (2 skipped by their environment gate), 24 adapter output tests (12 skipped), 13 Python tests, and, with Pester 5, the Pester files `replay-port` (2 tests) and `replay-timing` (3 tests):

```
# tests 164
# pass 162
# fail 0
# skipped 2
# tests 24
# pass 12
# fail 0
# skipped 12
Ran 13 tests in <ms>

OK
```

With Pester 5 two more lines print, `Tests Passed: 2, Failed: 0, Skipped: 0, Inconclusive: 0, NotRun: 0` and the same with `Passed: 3`; the Expected block above is from the replay container, which has `pwsh` but no Pester 5 (PowerShell Gallery and NuGet are not reachable), so those two lines are missing there. Where `pwsh` or Pester 5 is missing the last two lines do not print: record "pending local run" and go on. `git status --short` prints nothing.

- [ ] **Step 5: Recount what the slices below this one move**

S5c to S8b move web, api and shared files but none of the paths W1 renames, so these figures are recounted, not fixed: a different value is recorded and carried on unless the Expected text says to stop.

```bash
echo "scripts/db files: $(git ls-files scripts/db | wc -l)"
echo "replay folder files: $(git ls-files infra/supabase/phase6 | wc -l)"
echo "seed files: $(git ls-files apps/api/prisma | grep -v -E '^apps/api/prisma/(migrations/|history/|tests/|schema\.prisma$|check-connection\.ts$|legacy-retirement|authorization-bootstrap)' | wc -l)"
git ls-files apps/api/prisma | grep -v -E '^apps/api/prisma/(migrations/|history/|tests/|schema\.prisma$|check-connection\.ts$|legacy-retirement|authorization-bootstrap)' | grep -v '\.ts$'
git grep -n "new ParticipantsService" -- apps | cut -c1-110
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/metadata
ls apps/web/src/lib/services
git ls-files apps/api/src | grep "analytics.service"
wc -l $(git ls-files apps/api/src | grep "analytics.service.test.ts")
git grep -n "'WEATHER' | 'SECURITY'\|kind: 'PROJECT_SUMMARY' |" -- apps/api/prisma | cut -c1-100
git grep -c "W1" -- docs/cr-pathways-codebase-modularization.md docs/activity-log.md docs/audit-pathways-codebase-modularity-20261009.md
echo "test files above 600 lines: $(git ls-files | grep -E '\.test\.tsx?$' | xargs wc -l | awk '$1>600 && $2!="total"' | wc -l)"
git ls-files | grep -E '\.test\.tsx?$' | xargs wc -l | awk '$1>600 && $2!="total"' | sort -rn | head -4
git hash-object package.json .github/workflows/ci.yml scripts/sad/check.ts apps/api/prisma.config.ts apps/api/tsconfig.build.json infra/supabase/phase6/Replay-Local.ps1 infra/supabase/phase6/Verify-Forward.ps1 apps/api/src/modules/participants/participants.service.ts | cut -c1-8
```

Expected: the recount. The figures W1 rests on are the three file counts, the ten non-code seed files, the three `ParticipantsService` constructions, the four test files with two annotations each, the two literal unions, the `analytics.service.test.ts` size and the eight hashes:

```
scripts/db files: 34
replay folder files: 58
seed files: 56
apps/api/prisma/assets/demo-photos/committee-training.jpg
apps/api/prisma/assets/demo-photos/household-follow-up.jpg
apps/api/prisma/assets/demo-photos/hygiene-kit-distribution.jpg
apps/api/prisma/assets/demo-photos/learning-center-review.jpg
apps/api/prisma/assets/demo-photos/livelihood-coaching.jpg
apps/api/prisma/assets/demo-photos/wash-handwashing.jpg
apps/api/prisma/demo-fixtures/beneficiary-registration-borongan.csv
apps/api/prisma/demo-fixtures/beneficiary-registration-borongan.xlsx
apps/api/prisma/demo-fixtures/household-profile-followup.csv
apps/api/prisma/demo-fixtures/livelihood-followup-structure.csv
apps/api/prisma/defense-demo-seed.ts:127:    const participants = new ParticipantsService(runtime)
apps/api/prisma/local-demo-seed.ts:164:  const participants = new ParticipantsService(runtime)
apps/api/src/modules/participants/participants.service.test.ts:62:  const service = new ParticipantsService({}
apps/api/src/modules/imports/imports.service.test.ts:2
apps/api/src/modules/metadata/metadata.generate.test.ts:2
apps/api/src/modules/metadata/metadata.published-cache.test.ts:2
apps/api/src/modules/metadata/metadata.service.test.ts:2
authorized-read-events.ts
pathways-client.c2-c4.test.ts
pathways-client.project-data.test.ts
pathways-client.survey-subject.test.ts
pathways-client.test.ts
pathways-client.ts
source-mutation.test.ts
source-mutation.ts
apps/api/src/modules/analytics/analytics.service.export.test.ts
apps/api/src/modules/analytics/analytics.service.test.ts
apps/api/src/modules/analytics/analytics.service.ts
1514 apps/api/src/modules/analytics/analytics.service.test.ts
apps/api/prisma/local-demo-data.ts:219:  category?: 'WEATHER' | 'SECURITY' | 'FUNDING' | 'COMMUNITY'
apps/api/prisma/local-demo-stage-reports.ts:8:  kind: 'PROJECT_SUMMARY' | 'INDICATOR_SUMMARY' | 'BEN
docs/activity-log.md:7
docs/audit-pathways-codebase-modularity-20261009.md:3
docs/cr-pathways-codebase-modularization.md:10
test files above 600 lines: 16
   1514 apps/api/src/modules/analytics/analytics.service.test.ts
   1365 apps/web/src/features/projects/activities/components/activity-proof-dialog.test.tsx
   1343 apps/web/src/lib/services/pathways-client.test.ts
   1140 apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
4e794181
bf014154
02774e66
ee05c8e6
07af8692
dae2224b
288e89ef
5a56cdff
```

A different count is recorded and carried on (ruling 2), except that a missing path stops the plan. The `W1` counts are the lines of the three records that name W1 (activity log 7, audit 3, change record 10; the higher counts are the S7c, S7d and S8a lines "the `lib/services/*` files that no slice owns stay for W1", which ruling 11 gives to W2, and the S8b closing line "W1 is the remaining sub-project"): if one is higher, an earlier slice deferred something new to W1, so print its lines with `git grep -n W1 -- docs/activity-log.md docs/cr-pathways-codebase-modularization.md` and report NEEDS_CONTEXT unless they name a path or test that Tasks 1 to 6 already change. The hashes are those of the replay (`scripts/sad/check.ts` changed after the plan was first written, when S7 and S8a added routes); a different hash means a file changed since the replay.

- [ ] **Step 6: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-w1-tooling-docs.md docs/superpowers/plans/$(date +%F)-modularization-w1-tooling-docs.md`. The handoff copy and its index row stay. The executed plan copies of the earlier slices stay too: the controller removes all of them after the final merge, so W1 touches none.

In `docs/index.md` section 1.6, add one row after the last plan row:

```bash
D=$(date +%F)
cp docs/handoff/modularization-w1-tooling-docs.md docs/superpowers/plans/$D-modularization-w1-tooling-docs.md
N=$(grep -n '(superpowers/plans/' docs/index.md | tail -1 | cut -d: -f1)
sed -i "${N}a | [W1 tooling and docs plan](superpowers/plans/$D-modularization-w1-tooling-docs.md) | $D-modularization-w1-tooling-docs.md | $D | W1 of the codebase modularization: cloud-run deferrals, analytics test split, scripts/db, replay folder and seed moves, tooling tests in CI; W2 outline | In progress |" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-120
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: add the W1 tooling and docs plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
```

Expected: one added row, the docs check at 0 failures and 0 warnings, and the commit:

```
+| [W1 tooling and docs plan](superpowers/plans/<date>-modularization-w1-tooling-docs.md) | <date>-modularizatio
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[claude/modularization-s8b-xjnlzt <sha>] docs: add the W1 tooling and docs plan
 2 files changed, 2912 insertions(+)
 create mode 100644 docs/superpowers/plans/<date>-modularization-w1-tooling-docs.md
```



---

### Task 1: The cloud-run deferrals

**Files:**
- Create (gitignored): `.tmp/w1/task1-api-edits.json`, `task1-seed-edits.json`, `task1-web-edits.json`
- Modify: `apps/api/src/modules/participants/participants.service.ts` and `.test.ts`, `apps/api/prisma/defense-demo-seed.ts`, `local-demo-seed.ts`, `local-demo-data.ts`, `local-demo-stage-reports.ts`, the four test files `imports.service.test.ts`, `metadata.generate.test.ts`, `metadata.published-cache.test.ts` and `metadata.service.test.ts`, `apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx`
- Rename: `apps/web/src/lib/services/pathways-client.c2-c4.test.ts` to `apps/web/src/lib/api/scoped-endpoints.test.ts`, `pathways-client.survey-subject.test.ts` to `apps/web/src/lib/api/beneficiaries.survey-subject.test.ts`

Everything here is a deferral of an earlier slice (CR section 9 and the activity log, "Left to W1" and the rulings log); none changes a request, a response or a decision.

- [ ] **Step 1: Count what the edits touch**

```bash
git grep -n "new ParticipantsService" -- apps | cut -c1-100
grep -n "constructor\|PrismaService\|Inject" apps/api/src/modules/participants/participants.service.ts
git grep -n "ParticipantsService" -- apps/api/src ':!*.test.ts' | grep -v "participants.service.ts" | cut -c1-110
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/metadata
git grep -n "pathways-client" -- apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.tsx apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx
ls apps/web/src/lib/services/pathways-client.*.test.ts
```

Expected: the three constructions, the one constructor, the importers of the service, the eight annotations and the two web test files:

```
apps/api/prisma/defense-demo-seed.ts:127:    const participants = new ParticipantsService(runtime)
apps/api/prisma/local-demo-seed.ts:164:  const participants = new ParticipantsService(runtime)
apps/api/src/modules/participants/participants.service.test.ts:62:  const service = new Participants
1:import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
6:import { PrismaService } from '../../prisma/prisma.service'
28:@Injectable()
30:  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
apps/api/src/modules/imports/import-promotion-context.service.ts:8:import type { ParticipantsService } from '.
apps/api/src/modules/imports/import-promotion-context.service.ts:44:  participants: Pick<ParticipantsService, 
apps/api/src/modules/imports/imports.service.ts:29:import { ParticipantsService } from '../participants/partic
apps/api/src/modules/imports/imports.service.ts:82:    @Inject(ParticipantsService) private readonly participa
apps/api/src/modules/metadata/form-submissions.service.ts:12:import type { ParticipantsService } from '../part
apps/api/src/modules/metadata/form-submissions.service.ts:160:  participants: Pick<ParticipantsService, 'promo
apps/api/src/modules/metadata/metadata.service.ts:17:import { ParticipantsService } from '../participants/part
apps/api/src/modules/metadata/metadata.service.ts:53:    @Inject(ParticipantsService) private readonly partici
apps/api/src/modules/participants/participants.module.ts:7:import { ParticipantsService } from './participants
apps/api/src/modules/participants/participants.module.ts:11:  providers: [ParticipantsService, JourneyStagesSe
apps/api/src/modules/participants/participants.module.ts:12:  exports: [ParticipantsService],
apps/api/src/modules/imports/imports.service.test.ts:2
apps/api/src/modules/metadata/metadata.generate.test.ts:2
apps/api/src/modules/metadata/metadata.published-cache.test.ts:2
apps/api/src/modules/metadata/metadata.service.test.ts:2
apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx:25:vi.mock('@/lib/services/pathways-client', () => ({
apps/web/src/lib/services/pathways-client.c2-c4.test.ts
apps/web/src/lib/services/pathways-client.project-data.test.ts
apps/web/src/lib/services/pathways-client.survey-subject.test.ts
```

The importers are the Nest wiring and the `Pick<ParticipantsService, ...>` types, which a constructor change does not touch. The `pathways-client` line of `beneficiary-detail-loader.test.tsx` is the dead factory of Step 5.

- [ ] **Step 2: ParticipantsService without the unused parameter, and `Tx` in the four test harnesses**

`ParticipantsService` keeps no database handle: all its methods take the caller's `tx` (S5a), so the constructor parameter was never read (TS6138 in the baseline). Its three constructions (the unit test and the two demo seeds) lose the argument. The eight `Prisma.TransactionClient` annotations of the imports and metadata harnesses become the `Tx` alias of `common/prisma/transaction` that the production modules use; the two files that still need `Prisma` for `Prisma.Decimal` keep that import.

Create `.tmp/w1/task1-api-edits.json`:

```json
[
 [
  "apps/api/src/modules/participants/participants.service.ts",
  "import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'",
  "import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'",
  1
 ],
 [
  "apps/api/src/modules/participants/participants.service.ts",
  "import { PrismaService } from '../../prisma/prisma.service'\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/participants/participants.service.ts",
  "export class ParticipantsService {\n  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}\n\n",
  "export class ParticipantsService {\n",
  1
 ],
 [
  "apps/api/src/modules/participants/participants.service.test.ts",
  "import type { PrismaService } from '@app/prisma/prisma.service'\n",
  "",
  1
 ],
 [
  "apps/api/src/modules/participants/participants.service.test.ts",
  "new ParticipantsService({} as PrismaService)",
  "new ParticipantsService()",
  1
 ],
 [
  "apps/api/prisma/defense-demo-seed.ts",
  "new ParticipantsService(runtime)",
  "new ParticipantsService()",
  1
 ],
 [
  "apps/api/prisma/local-demo-seed.ts",
  "new ParticipantsService(runtime)",
  "new ParticipantsService()",
  1
 ],
 [
  "apps/api/src/modules/imports/imports.service.test.ts",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/imports/imports.service.test.ts",
  "tx: undefined as Prisma.TransactionClient | undefined",
  "tx: undefined as Tx | undefined",
  1
 ],
 [
  "apps/api/src/modules/imports/imports.service.test.ts",
  "state.tx = tx as unknown as Prisma.TransactionClient",
  "state.tx = tx as unknown as Tx",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.generate.test.ts",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.generate.test.ts",
  "tx: undefined as Prisma.TransactionClient | undefined",
  "tx: undefined as Tx | undefined",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.generate.test.ts",
  "state.tx = tx as unknown as Prisma.TransactionClient",
  "state.tx = tx as unknown as Tx",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.published-cache.test.ts",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.published-cache.test.ts",
  "tx: undefined as Prisma.TransactionClient | undefined",
  "tx: undefined as Tx | undefined",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.published-cache.test.ts",
  "state.tx = tx as unknown as Prisma.TransactionClient",
  "state.tx = tx as unknown as Tx",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.service.test.ts",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n",
  "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.service.test.ts",
  "tx: undefined as Prisma.TransactionClient | undefined",
  "tx: undefined as Tx | undefined",
  1
 ],
 [
  "apps/api/src/modules/metadata/metadata.service.test.ts",
  "state.tx = tx as unknown as Prisma.TransactionClient",
  "state.tx = tx as unknown as Tx",
  1
 ]
]
```

```bash
T="apps/api/src/modules/participants/participants.service.test.ts apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/metadata/metadata.generate.test.ts apps/api/src/modules/metadata/metadata.published-cache.test.ts apps/api/src/modules/metadata/metadata.service.test.ts"
node .tmp/w1/test-titles.mjs save api .tmp/w1/t1-api-before.json $T
node .tmp/w1/replace-exact.mjs .tmp/w1/task1-api-edits.json
node .tmp/w1/trim-imports.mjs apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/metadata/metadata.generate.test.ts apps/api/src/modules/metadata/metadata.published-cache.test.ts apps/api/src/modules/metadata/metadata.service.test.ts
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
git diff --stat | tail -1
pnpm --filter @pathways/api typecheck > .tmp/w1/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w1/tc.log
node .tmp/w1/test-titles.mjs save api .tmp/w1/t1-api-after.json $T
node .tmp/w1/test-titles.mjs compare .tmp/w1/t1-api-before.json .tmp/w1/t1-api-after.json
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/metadata
git grep -n "new ParticipantsService" -- apps | cut -c1-100
```

Expected: nineteen replacements in eight files, the two files that still use `Prisma` keep the import, the typecheck is clean, no test title is lost, no annotation is left and the three constructions have no argument:

```
files 5, tests 73, failed 0
19 replacements in 8 files
apps/api/src/modules/imports/imports.service.test.ts: removed nothing
apps/api/src/modules/metadata/metadata.generate.test.ts: removed Prisma
apps/api/src/modules/metadata/metadata.published-cache.test.ts: removed Prisma
apps/api/src/modules/metadata/metadata.service.test.ts: removed nothing
Checked 8 files in <ms>. Fixed 1 file.
 8 files changed, 16 insertions(+), 18 deletions(-)
typecheck exit 0
0
files 5, tests 73, failed 0
before 73, after 73, lost 0, added 0
apps/api/prisma/defense-demo-seed.ts:127:    const participants = new ParticipantsService()
apps/api/prisma/local-demo-seed.ts:164:  const participants = new ParticipantsService()
apps/api/src/modules/participants/participants.service.test.ts:61:  const service = new Participants
```

The `typecheck exit 0` line and the `0` after it come from the api typecheck (`0` is the count of `error TS` lines). `git grep -c` prints nothing when nothing matches. Biome may report the number of files it fixed differently; that is formatting only.

- [ ] **Step 3: The demo seed literal unions follow the shared lists**

The activity log defers two seed literal unions to W1: the overdue explanation category in `local-demo-data.ts` (the same six codes as `overdueExplanationCategories`) and the report kind in `local-demo-stage-reports.ts` (four of the six codes of `reportKinds`; the type widens to `ReportKindCode`, and the plans still use four kinds). Both are types only, so nothing a seed writes changes.

Create `.tmp/w1/task1-seed-edits.json`:

```json
[
 [
  "apps/api/prisma/local-demo-data.ts",
  " */\n\nexport type ProjectKey",
  " */\nimport type { OverdueExplanationCategory } from '@pathways/shared'\n\nexport type ProjectKey",
  1
 ],
 [
  "apps/api/prisma/local-demo-data.ts",
  "category?: 'WEATHER' | 'SECURITY' | 'FUNDING' | 'COMMUNITY' | 'LOGISTICS' | 'OTHER'",
  "category?: OverdueExplanationCategory",
  1
 ],
 [
  "apps/api/prisma/local-demo-stage-reports.ts",
  "import type { ProjectKey } from './local-demo-data'\n",
  "import type { ReportKindCode } from '@pathways/shared'\nimport type { ProjectKey } from './local-demo-data'\n",
  1
 ],
 [
  "apps/api/prisma/local-demo-stage-reports.ts",
  "kind: 'PROJECT_SUMMARY' | 'INDICATOR_SUMMARY' | 'BENEFICIARY_SUMMARY' | 'SURVEY_FORM_RESULTS'",
  "kind: ReportKindCode",
  1
 ]
]
```

```bash
node .tmp/w1/replace-exact.mjs .tmp/w1/task1-seed-edits.json
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR) 2>&1 | tail -2
pnpm --filter @pathways/api typecheck > .tmp/w1/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w1/tc.log
pnpm --filter @pathways/api exec vitest run src/modules/participants src/modules/imports src/modules/metadata prisma 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
bash .tmp/w1/unused.sh t1api
diff .tmp/w1/unused-base.txt .tmp/w1/unused-t1api.txt
git checkout -- apps/web/next-env.d.ts
git status --short
```

Expected: four replacements in two files, the focused api tests pass, and the unused-local diagnostics lose the `ParticipantsService` line and nothing else:

```
4 replacements in 2 files
Checked 10 files in <ms>. No fixes applied.
typecheck exit 0
0
 Test Files  37 passed | 1 skipped (38)
      Tests  449 passed | 1 skipped (450)
api: prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 3
2d1
< api: src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
 M apps/api/prisma/defense-demo-seed.ts
 M apps/api/prisma/local-demo-data.ts
 M apps/api/prisma/local-demo-seed.ts
 M apps/api/prisma/local-demo-stage-reports.ts
 M apps/api/src/modules/imports/imports.service.test.ts
 M apps/api/src/modules/metadata/metadata.generate.test.ts
 M apps/api/src/modules/metadata/metadata.published-cache.test.ts
 M apps/api/src/modules/metadata/metadata.service.test.ts
 M apps/api/src/modules/participants/participants.service.test.ts
 M apps/api/src/modules/participants/participants.service.ts
```

`git status --short` ends the output with the ten modified files of this commit (the typecheck prints `typecheck exit 0` and `0` first).

- [ ] **Step 4: Commit the api part**

```bash
git add apps/api
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): drop the unused PrismaService parameter of ParticipantsService and use Tx in the test harnesses

The service takes the caller's tx everywhere, so its constructor argument was never read. The eight Prisma.TransactionClient annotations of the imports and metadata harnesses become Tx, and the two demo seed literal unions follow overdueExplanationCategories and reportKinds.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -22
```

Expected: the commit holds ten files:

```
[claude/modularization-s8b-xjnlzt <sha>] refactor(api): drop the unused PrismaService parameter of ParticipantsService and use Tx in the test harnesses
 10 files changed, 20 insertions(+), 20 deletions(-)
<sha> refactor(api): drop the unused PrismaService parameter of ParticipantsService and use Tx in the test harnesses
 apps/api/prisma/defense-demo-seed.ts                           | 2 +-
 apps/api/prisma/local-demo-data.ts                             | 3 ++-
 apps/api/prisma/local-demo-seed.ts                             | 2 +-
 apps/api/prisma/local-demo-stage-reports.ts                    | 3 ++-
 apps/api/src/modules/imports/imports.service.test.ts           | 5 +++--
 apps/api/src/modules/metadata/metadata.generate.test.ts        | 6 +++---
 apps/api/src/modules/metadata/metadata.published-cache.test.ts | 6 +++---
 apps/api/src/modules/metadata/metadata.service.test.ts         | 5 +++--
 apps/api/src/modules/participants/participants.service.test.ts | 3 +--
 apps/api/src/modules/participants/participants.service.ts      | 5 +----
 10 files changed, 20 insertions(+), 20 deletions(-)
```

- [ ] **Step 5: Name the client contract tests by purpose and drop the dead mock**

`pathways-client.c2-c4.test.ts` runs the activities, beneficiaries and journeys clients against the scoped endpoints, and `pathways-client.survey-subject.test.ts` runs `beneficiariesClient.getSurveySubjectPage`; neither has touched `pathwaysClient` since S4b (rulings log, S4b Task 3). They move beside the clients they test with the CR 3.5 naming: `scoped-endpoints.test.ts` and `beneficiaries.survey-subject.test.ts`. The `describe` titles stay as they are, so the title comparison must print `lost 0`. `beneficiary-detail-loader.test.tsx` mocks `@/lib/services/pathways-client` for a loader that no longer imports it (S6b moved its last call), so that factory goes.

Create `.tmp/w1/task1-web-edits.json`:

```json
[
 [
  "apps/web/src/lib/api/scoped-endpoints.test.ts",
  "import { sourceMutationTickets } from './source-mutation'",
  "import { sourceMutationTickets } from '../services/source-mutation'",
  1
 ],
 [
  "apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx",
  "vi.mock('@/lib/services/pathways-client', () => ({\n  pathwaysClient: client,\n}))\n",
  "",
  1
 ]
]
```

```bash
S=apps/web/src/lib/services
D=apps/web/src/features/beneficiaries/profile/components
node .tmp/w1/test-titles.mjs save web .tmp/w1/t1-web-before.json $S/pathways-client.c2-c4.test.ts $S/pathways-client.survey-subject.test.ts $D/beneficiary-detail-loader.test.tsx
git mv $S/pathways-client.c2-c4.test.ts apps/web/src/lib/api/scoped-endpoints.test.ts
git mv $S/pathways-client.survey-subject.test.ts apps/web/src/lib/api/beneficiaries.survey-subject.test.ts
node .tmp/w1/replace-exact.mjs .tmp/w1/task1-web-edits.json
pnpm exec biome check --write apps/web/src/lib/api/scoped-endpoints.test.ts apps/web/src/lib/api/beneficiaries.survey-subject.test.ts $D/beneficiary-detail-loader.test.tsx 2>&1 | tail -2
pnpm --filter @pathways/web typecheck > .tmp/w1/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w1/tc.log
pnpm --filter @pathways/web exec vitest run src/lib/api/scoped-endpoints.test.ts src/lib/api/beneficiaries.survey-subject.test.ts src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
git checkout -- apps/web/next-env.d.ts
A=apps/web/src/lib/api
node .tmp/w1/test-titles.mjs save web .tmp/w1/t1-web-after.json $A/scoped-endpoints.test.ts $A/beneficiaries.survey-subject.test.ts $D/beneficiary-detail-loader.test.tsx
node .tmp/w1/test-titles.mjs compare .tmp/w1/t1-web-before.json .tmp/w1/t1-web-after.json
git grep -n "pathways-client" -- $D | wc -l
git grep -n "c2-c4\|pathways-client.survey-subject" -- . ':!docs' | wc -l
bash .tmp/w1/unused.sh t1web
diff .tmp/w1/unused-t1api.txt .tmp/w1/unused-t1web.txt && echo "unused diagnostics unchanged"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short
```

Expected: two replacements in two files, the web typecheck is clean, the focused web tests pass, the 36 test titles are the same, three lines still name `pathways-client` in the loader folder (other tests), nothing outside `docs` names the old file names, and the unused diagnostics are unchanged:

```
files 3, tests 36, failed 0
2 replacements in 2 files
Checked 3 files in <ms>. No fixes applied.
typecheck exit 0
0
 Test Files  3 passed (3)
      Tests  36 passed (36)
files 3, tests 36, failed 0
before 36, after 36, lost 0, added 0
3
0
api: prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 3
unused diagnostics unchanged
M  apps/web/src/features/beneficiaries/profile/components/beneficiary-detail-loader.test.tsx
R  apps/web/src/lib/services/pathways-client.survey-subject.test.ts -> apps/web/src/lib/api/beneficiaries.survey-subject.test.ts
R  apps/web/src/lib/services/pathways-client.c2-c4.test.ts -> apps/web/src/lib/api/scoped-endpoints.test.ts
```

The staged state is two renames and one modified file.

- [ ] **Step 6: Commit the web part**

```bash
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(web): name the client contract tests by purpose and drop the dead pathways-client mock

The C2/C4 and survey subject tests run the activities, beneficiaries and journeys clients, so they live beside those clients as scoped-endpoints.test.ts and beneficiaries.survey-subject.test.ts. The loader test no longer mocks a module its loader does not import.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -6
```

Expected: one commit with two renames (`99%` and `100%` similarity) and one edited file:

```
[claude/modularization-s8b-xjnlzt <sha>] test(web): name the client contract tests by purpose and drop the dead pathways-client mock
 3 files changed, 1 insertion(+), 4 deletions(-)
 rename apps/web/src/lib/{services/pathways-client.survey-subject.test.ts => api/beneficiaries.survey-subject.test.ts} (100%)
 rename apps/web/src/lib/{services/pathways-client.c2-c4.test.ts => api/scoped-endpoints.test.ts} (99%)
<sha> test(web): name the client contract tests by purpose and drop the dead pathways-client mock
 .../profile/components/beneficiary-detail-loader.test.tsx              | 3 ---
 .../beneficiaries.survey-subject.test.ts}                              | 0
 .../pathways-client.c2-c4.test.ts => api/scoped-endpoints.test.ts}     | 2 +-
 3 files changed, 1 insertion(+), 4 deletions(-)
```



---

### Task 2: Split the analytics service test

**Files:**
- Create (gitignored): `.tmp/w1/split-analytics-test.mjs`, `analytics-before.ts`, `t2-before.json`
- Create: `analytics.service.harness.ts`, `analytics.service.read-export.test.ts`, `analytics.service.survey-timeline.test.ts` and `analytics.service.aggregate-only-roles.test.ts`, beside the existing test
- Delete: `analytics.service.test.ts` (the path is found by `git ls-files`: S7b moves it from `modules/dashboards` to `modules/analytics`)
- Modify: `apps/api/tsconfig.build.json`

S7b left this file whole (CR section 9): 1514 lines, three `describe` blocks and one 326 line harness of fixtures that all three use. The split follows CR 3.5 (`<file>.<concern>.test.ts`), with the shared fixtures in `analytics.service.harness.ts`. The script cuts by the `describe` titles, so a file that S7b changed in its titles stops it with the title it did not find.

- [ ] **Step 1: Find the file and save the test titles**

```bash
T=$(git ls-files apps/api/src | grep "analytics.service.test.ts$")
echo "$T"
wc -l "$T"
grep -n "^describe(\|^  describe(\|^vi.mock(" "$T" | cut -c1-110
mkdir -p .tmp/w1
cp "$T" .tmp/w1/analytics-before.ts
node .tmp/w1/test-titles.mjs save api .tmp/w1/t2-before.json "$T"
```

Expected: the file (S7b moved it to `modules/analytics` on the S8b tip), its size, the two mocks and the three `describe` blocks with the nested one, and 59 saved titles:

```
apps/api/src/modules/analytics/analytics.service.test.ts
1514 apps/api/src/modules/analytics/analytics.service.test.ts
27:vi.mock('@pathways/config', () => ({
30:vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))
327:describe('analytics descriptive read and export', () => {
682:describe('descriptive analytics small-cell and complementary suppression', () => {
782:describe('analytics descriptive views: survey and timeline', () => {
1054:  describe('defined-period rule (adjacent-period differencing abuse)', () => {
1096:  describe('trusted aggregates for aggregate-only roles', () => {
files 1, tests 59, failed 0
```

A line count other than 1514 or a missing anchor line means a later slice changed the file (the sibling `analytics.service.export.test.ts` is another file and stays): the split script stops on the title it did not find, and the figures below change with it; report NEEDS_CONTEXT if the three `describe` titles or the nested `trusted aggregates` title differ.

- [ ] **Step 2: Create the split script and run it**

`split-analytics-test.mjs` finds the four anchors (the three `describe` titles and the nested trusted aggregates block) and fails unless each occurs exactly once. The harness holds the original imports, the fixtures and the three helpers that sat inside the third `describe` (`assessment`, `pairedRows` and the id counter, lifted one indent level out); it exports only the names a test file uses. Each test file keeps the two `vi.mock` blocks, the original imports and its `describe` block unchanged.

Create `.tmp/w1/split-analytics-test.mjs`:

```js
// Splits analytics.service.test.ts into a harness module and three test files, moving every line unchanged except imports, exports and the lifted helpers.
// Usage: node .tmp/w1/split-analytics-test.mjs <path to analytics.service.test.ts>
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const source = process.argv[2]
const dir = path.dirname(source)
const base = path.basename(source, '.test.ts')
const lines = readFileSync(source, 'utf8').split('\n')

// The one line starting with the given text; anything else stops the script.
const find = (start, from = 0) => {
  const hits = lines.flatMap((line, index) => (index >= from && line.startsWith(start) ? [index] : []))
  if (hits.length !== 1) throw new Error(`expected one line starting ${JSON.stringify(start)}, found ${hits.length}`)
  return hits[0]
}
const mocks = lines.flatMap((line, index) => (line.startsWith('vi.mock(') ? [index] : []))
const firstMock = mocks[0]
const read = find("describe('analytics descriptive read and export'")
const small = find("describe('descriptive analytics small-cell and complementary suppression'")
const views = find("describe('analytics descriptive views: survey and timeline'")
const nested = find("  describe('trusted aggregates for aggregate-only roles'")
const afterNested = lines.findIndex((line, index) => index > nested && line === '  })') + 1
const helpers = find('  let assessmentIdCounter = 0', views)
const firstViewTest = find("  it('happy: computes survey pairing from the trusted aggregate", views)
const exportLine = find('const exportText = async')

// Line ranges, end exclusive.
const imports = lines.slice(0, firstMock)
const mockBlock = lines.slice(firstMock, find('const orgA'))
const fixtures = lines.slice(find('const orgA'), read)
const lifted = lines.slice(helpers, firstViewTest).map((line) => (line.startsWith('  ') ? line.slice(2) : line))
const readBlock = lines.slice(read, views)
const viewsHead = lines.slice(views, helpers)
const viewsRest = lines.slice(firstViewTest, nested)
const nestedBlock = lines.slice(nested, afterNested)
const viewsTail = lines.slice(afterNested)

// Top-level names a fixture block declares.
const declared = [...fixtures.join('\n').matchAll(/^(?:export )?(?:const|let|function|async function|type) (\w+)/gm)].map((m) => m[1])
declared.push(...[...lifted.join('\n').matchAll(/^(?:let|function) (\w+)/gm)].map((m) => m[1]))

const bodies = {
  'read-export': [...readBlock].join('\n'),
  'survey-timeline': [...viewsHead, '', ...viewsRest, ...viewsTail].join('\n'),
  'aggregate-only-roles': [...viewsHead.slice(0, 2), '', ...nestedBlock, '})'].join('\n'),
}
const used = new Set(declared.filter((name) => Object.values(bodies).some((text) => new RegExp(`\\b${name}\\b`).test(text))))
const exported = (line) =>
  /^(?:const|let|function|async function|type) (\w+)/.test(line) && used.has(line.match(/^(?:const|let|function|async function|type) (\w+)/)[1]) ? `export ${line}` : line

const harness = [...imports, ...fixtures, ...lifted].map(exported)
writeFileSync(path.join(dir, `${base}.harness.ts`), `${harness.join('\n').replace(/\n+$/, '')}\n`)

const names = [...used].sort()
for (const [name, body] of Object.entries(bodies)) {
  const text = [...imports, ...mockBlock, `import { ${names.filter((n) => new RegExp(`\\b${n}\\b`).test(body)).join(', ')} } from './${base}.harness'`, '', body]
  writeFileSync(path.join(dir, `${base}.${name}.test.ts`), `${text.join('\n').replace(/\n+$/, '')}\n`)
}
console.log(`harness exports: ${names.join(', ')}`)
```

```bash
T=$(git ls-files apps/api/src | grep "analytics.service.test.ts$")
D=$(dirname "$T")
node .tmp/w1/split-analytics-test.mjs "$T"
git rm -q "$T"
F="$D/analytics.service.harness.ts $D/analytics.service.read-export.test.ts $D/analytics.service.survey-timeline.test.ts $D/analytics.service.aggregate-only-roles.test.ts"
node .tmp/w1/trim-imports.mjs $F
node .tmp/w1/drop-unused.mjs apps/api $(echo $F | sed 's#apps/api/##g')
pnpm exec biome check --write $F 2>&1 | tail -2
git add $F
pnpm --filter @pathways/api typecheck > .tmp/w1/tc.log 2>&1; echo "typecheck exit $?"; grep -c "error TS" .tmp/w1/tc.log
wc -l $F
```

Expected: the script lists the names the harness exports, Biome and the trimmers drop what each file does not use, the typecheck is clean (`typecheck exit 0`, `0` errors), and the sizes are:

```
harness exports: actor, assessment, bucket, cell, descriptive, exportText, harness, orgA, orgB, pairedRows, projectA, projectB, projects, releasedSaddd, suppressed, suppressedSaddd, userId
apps/api/src/modules/analytics/analytics.service.harness.ts: removed PERMISSION_KEY, activityObservation, businessCalendarDate, descriptiveAnalyticsSchema, beforeEach, describe, expect, it, suppressSmallCount, analyticsTableCsv, descriptiveAnalyticsTable, AnalyticsController, buildDescriptiveAnalytics
apps/api/src/modules/analytics/analytics.service.read-export.test.ts: removed ApplicationIdentity, DescriptiveAnalytics, activityObservation, businessCalendarDate, hasAtomicPermission, surveyAggregateFromRows, IndicatorsService, PrismaService, ForbiddenException, DashboardsService, AnalyticsService
apps/api/src/modules/analytics/analytics.service.survey-timeline.test.ts: removed ApplicationIdentity, PERMISSION_KEY, DescriptiveAnalytics, MetricCell, activityObservation, businessCalendarDate, descriptiveAnalyticsSchema, hasAtomicPermission, surveyAggregateFromRows, IndicatorsService, PrismaService, ForbiddenException, suppressSmallCount, DashboardsService, analyticsTableCsv, descriptiveAnalyticsTable, AnalyticsController, AnalyticsService, buildDescriptiveAnalytics, assessment, suppressed
apps/api/src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: removed ApplicationIdentity, PERMISSION_KEY, DescriptiveAnalytics, descriptiveAnalyticsSchema, hasAtomicPermission, surveyAggregateFromRows, IndicatorsService, PrismaService, ForbiddenException, suppressSmallCount, DashboardsService, analyticsTableCsv, descriptiveAnalyticsTable, AnalyticsController, AnalyticsService, buildDescriptiveAnalytics, suppressed
src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: cell
src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: descriptive
src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: reportArtifact
src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: CanonicalRole
src/modules/analytics/analytics.service.aggregate-only-roles.test.ts: withAuthorizedOperation
src/modules/analytics/analytics.service.harness.ts: reportArtifact
src/modules/analytics/analytics.service.read-export.test.ts: projects
src/modules/analytics/analytics.service.read-export.test.ts: CanonicalRole
src/modules/analytics/analytics.service.survey-timeline.test.ts: descriptive
src/modules/analytics/analytics.service.survey-timeline.test.ts: reportArtifact
src/modules/analytics/analytics.service.survey-timeline.test.ts: CanonicalRole
src/modules/analytics/analytics.service.survey-timeline.test.ts: withAuthorizedOperation
Checked 4 files in <ms>. Fixed 4 files.
typecheck exit 0
0
  350 apps/api/src/modules/analytics/analytics.service.harness.ts
  485 apps/api/src/modules/analytics/analytics.service.read-export.test.ts
  384 apps/api/src/modules/analytics/analytics.service.survey-timeline.test.ts
  354 apps/api/src/modules/analytics/analytics.service.aggregate-only-roles.test.ts
 1573 total
```

The lines `<file>: removed <names>` of the trimmer are the imports each new file does not need; the lists are exact for the S8b tip, and the typecheck must be clean.

- [ ] **Step 3: Prove the split lost nothing**

`same-lines.mjs` compares the trimmed lines of the original (from the first fixture line on) with those of the four new files; it must print `lost 0`, and the lines it lists as added are the wrapper the lifted helpers needed. The test titles must be the same list.

```bash
T=$(git ls-files apps/api/src | grep "analytics.service.harness.ts$")
D=$(dirname "$T")
node .tmp/w1/same-lines.mjs ".tmp/w1/analytics-before.ts@^const orgA" "$D/analytics.service.harness.ts@^(export )?const orgA" "$D/analytics.service.read-export.test.ts@^describe\(" "$D/analytics.service.survey-timeline.test.ts@^describe\(" "$D/analytics.service.aggregate-only-roles.test.ts@^describe\(" --list
node .tmp/w1/test-titles.mjs save api .tmp/w1/t2-after.json $D/analytics.service.read-export.test.ts $D/analytics.service.survey-timeline.test.ts $D/analytics.service.aggregate-only-roles.test.ts
node .tmp/w1/test-titles.mjs compare .tmp/w1/t2-before.json .tmp/w1/t2-after.json
pnpm --filter @pathways/api exec vitest run $(echo $D | sed 's#apps/api/##') src/common 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
```

Expected: `lost 0` against the 1415 original lines from the first fixture on, three added lines (listed: the wrapper that the split needs, a closing brace, a `beforeEach` and a `describe` line that appears once more in the new files), 59 titles before and after, and the focused tests pass:

```
1x })
1x beforeEach(() => vi.clearAllMocks())
1x describe('analytics descriptive views: survey and timeline', () => {
original lines 1415, lost 0, added 3
files 3, tests 59, failed 0
before 59, after 59, lost 0, added 0
 Test Files  19 passed (19)
      Tests  178 passed (178)
```

- [ ] **Step 4: Keep the harness out of the production build**

`tsconfig.build.json` excludes `*.test.ts` and `*.spec.ts` only, so `nest build` would compile `analytics.service.harness.ts` (it imports `vitest`) into `dist`. The harness suffix is new: CR 3.5 lists the api suffixes, and Task 7 adds `.harness` to that list.

Create `.tmp/w1/task2-build-edits.json`:

```json
[
 [
  "apps/api/tsconfig.build.json",
  "\"**/*.test.ts\"]",
  "\"**/*.test.ts\", \"**/*.harness.ts\"]",
  1
 ]
]
```

```bash
(cd apps/api && pnpm exec tsc -p tsconfig.build.json --noEmit --listFilesOnly | grep -c "analytics.service.harness")
node .tmp/w1/replace-exact.mjs .tmp/w1/task2-build-edits.json
pnpm exec biome check --write apps/api/tsconfig.build.json 2>&1 | tail -1
(cd apps/api && pnpm exec tsc -p tsconfig.build.json --noEmit --listFilesOnly | grep -c "analytics.service.harness")
cat apps/api/tsconfig.build.json
```

Expected: the harness is in the build file list before (`1`), the edit is one replacement, it is out of the list after (`0`), and the file is:

```
1
1 replacements in 1 files
Checked 1 file in <ms>. No fixes applied.
0
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.harness.ts"],
  "compilerOptions": {
    "noEmit": false
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A apps/api
git status --short
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "test(api): split the analytics service test by concern with a shared harness

The 1514 line test becomes a harness module and three test files (read and export, survey and timeline, aggregate-only roles); all 59 test titles and every line of the original are kept, and the build excludes the harness.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -8
```

Expected: the commit holds four new files, the deleted test and the build config:

```
A  apps/api/src/modules/analytics/analytics.service.aggregate-only-roles.test.ts
A  apps/api/src/modules/analytics/analytics.service.harness.ts
A  apps/api/src/modules/analytics/analytics.service.read-export.test.ts
A  apps/api/src/modules/analytics/analytics.service.survey-timeline.test.ts
D  apps/api/src/modules/analytics/analytics.service.test.ts
M  apps/api/tsconfig.build.json
[claude/modularization-s8b-xjnlzt <sha>] test(api): split the analytics service test by concern with a shared harness
 6 files changed, 1574 insertions(+), 1515 deletions(-)
 create mode 100644 apps/api/src/modules/analytics/analytics.service.aggregate-only-roles.test.ts
 create mode 100644 apps/api/src/modules/analytics/analytics.service.harness.ts
 create mode 100644 apps/api/src/modules/analytics/analytics.service.read-export.test.ts
 create mode 100644 apps/api/src/modules/analytics/analytics.service.survey-timeline.test.ts
 delete mode 100644 apps/api/src/modules/analytics/analytics.service.test.ts
<sha> test(api): split the analytics service test by concern with a shared harness
 .../analytics.service.aggregate-only-roles.test.ts |  354 +++++
 .../modules/analytics/analytics.service.harness.ts |  350 +++++
 .../analytics.service.read-export.test.ts          |  485 +++++++
 .../analytics.service.survey-timeline.test.ts      |  384 +++++
 .../modules/analytics/analytics.service.test.ts    | 1514 --------------------
 apps/api/tsconfig.build.json                       |    2 +-
 6 files changed, 1574 insertions(+), 1515 deletions(-)
```



---

### Task 3: `scripts/db` into `local`, `hosted` and `defense`

**Files:**
- Create (gitignored): `.tmp/w1/history-paths.mjs`, `path-pairs.mjs`, `move-paths.mjs`, `deepen-root.mjs`, `moved-report.mjs`, `stale-paths.mjs`, `make-stubs.mjs`, `db-rules.json`, `db-stubs.json`, `db-moves.json` (written by the mover)
- Move: the 34 files of `scripts/db` to `scripts/db/local/` (6), `scripts/db/hosted/` (9) and `scripts/db/defense/` (19), without the group prefix in the name (`hosted-build.mjs` becomes `hosted/build.mjs`)
- Modify: `package.json`, `scripts/perf/dashboard-load.mjs`, `apps/api/prisma/` (five files that name a moved script or import `hosted-seed-target.mjs`), `apps/web/e2e/` (three files that name or import `local-target.mjs`), `docs/index.md`, the two runbooks that name the scripts and `infra/supabase/phase6/README.md`
- Create (second commit): forwarding stubs at `scripts/db/hosted-build.mjs`, `hosted-seed.mjs`, `defense-demo.mjs` and `defense-snapshot.mjs`

The move script is used again by Tasks 4 and 5. It does what the S6b mover did for web files, for any file type: `git mv` by regex rule, then (1) every relative specifier of a moved file or of a file importing a moved file, recomputed, (2) every repo path that names a moved file, in plain and escaped regex form, in the files that are not history, and (3) every bare file name of a renamed file in those files. A specifier that does not resolve to a tracked file stops the count as `unresolved`. A specifier is recomputed only when its file or its target moves, so a non-canonical specifier elsewhere (for example `../hooks/use-form-fields` inside `forms/hooks`) is left as it is and the move commit holds renames and path edits only. History files keep the paths they were written with: the activity log, the audits, the change records, the handoff and superpowers documents and the migrations.

- [ ] **Step 1: Probe the scripts before the move**

Two entry points answer a flag they do not know without a database or a network, which makes them an end to end check of the move: `hosted-build.mjs` stops in its argument parser and `defense-snapshot.mjs` prints its usage line.

```bash
git ls-files scripts/db | sed 's#scripts/db/##' | sed 's/-.*//; s/\..*//' | sort | uniq -c
for p in hosted-build defense-snapshot; do node scripts/db/$p.mjs --unknown-flag 2>&1 | head -1; echo "exit ${PIPESTATUS[0]}"; done
git grep -n "scripts/db" -- . ':!scripts/db' ':!docs/cr-*' ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/handoff*' ':!docs/superpowers' | cut -d: -f1 | sort | uniq -c
git grep -n -E "'\.\.', '\.\.'\)" -- scripts/db | wc -l
```

Expected: the group counts (19, 9 and 6), the two probes (the argument error of `hosted-build.mjs` and the usage line of `defense-snapshot.mjs`, with their exit codes 1 and 2), the files outside `scripts/db` that name a script (counted per file; the `package.json` count is 6 lines), and 17 root lookups:

```
     19 defense
      9 hosted
      6 local
Error: Unknown argument: --unknown-flag
exit 1
Usage: node scripts/db/defense-snapshot.mjs mirror|dump|restore|storage [options]
exit 2
      1 apps/api/prisma/hosted-realistic-seed.test.ts
      2 apps/api/prisma/hosted-realistic-seed.ts
      1 apps/api/prisma/hosted-seed-target.test.ts
      1 apps/api/prisma/local-demo-stage-rules.ts
      1 apps/api/prisma/local-demo-target.ts
      1 apps/web/e2e/beneficiary-access.spec.ts
      1 apps/web/e2e/fixtures/real-sign-in.ts
      1 apps/web/e2e/signin-lockout.spec.ts
      1 docs/index.md
     11 docs/runbook-defense-demo.md
      4 docs/runbook-role-staging-build.md
      1 infra/supabase/phase6/README.md
      6 package.json
17
```

The probe lines are the reference for Step 4 and Step 6: after the move the usage line names the new path and the exit codes stay. A different file list outside `scripts/db` is recorded (S5c to S8b may touch a doc); a different group count is a stop.

- [ ] **Step 2: Create the move scripts**

Create each file with the Write tool exactly as printed. `history-paths.mjs` lists the files the move never edits and the scan never reports:

Create `.tmp/w1/history-paths.mjs`:

```js
// Files that record what happened and keep the paths they were written with, or that must never change.
const history = [
  /^docs\/activity-log\.md$/,
  /^docs\/audit-/,
  /^docs\/cr-/,
  /^docs\/handoff-/,
  /^docs\/handoff\//,
  /^docs\/superpowers\//,
  /^apps\/api\/prisma\/(history|migrations)\//,
]

export const isHistory = (file) => history.some((pattern) => pattern.test(file))
```

`path-pairs.mjs` builds the old-to-new path pairs of a move (each moved file, the literals of the rules file, and for a relative root such as `apps/api/` the paths written from that folder):

Create `.tmp/w1/path-pairs.mjs`:

```js
// The old-to-new repo path pairs of a move: each moved file, the rule literals, and each moved file under a relative root (for paths written from a package folder).
import path from 'node:path'

export const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

// Pairs longest first, each with a regex lead that keeps a relative path from matching inside a longer one.
export const buildPairs = (rules, moves) => {
  const relative = (rules.relativeRoots ?? []).flatMap((root) =>
    Object.entries(moves)
      .filter(([from]) => from.startsWith(root))
      .map(([from, to]) => ({ from: from.slice(root.length), to: to.slice(root.length), lead: '(?<![\\w./\\\\-])' })),
  )
  const full = [...Object.entries(moves), ...rules.literals].map(([from, to]) => ({ from, to, lead: '' }))
  return [...full, ...relative].sort((a, b) => b.from.length - a.from.length)
}

// Old paths whose last segment changed name, as bare tokens such as a renamed folder.
export const renamedBases = (rules) =>
  rules.literals.filter(([from, to]) => path.posix.basename(from) !== path.posix.basename(to)).map(([from]) => path.posix.basename(from))
```

`move-paths.mjs` runs `git mv` by rule and rewrites what named the moved files:

Create `.tmp/w1/move-paths.mjs`:

```js
// Moves tracked files with git mv by regex rules, then rewrites the relative specifiers, repo paths and bare file names that named them.
// Usage: node .tmp/w1/move-paths.mjs <rules.json> <moves-out.json>
// rules.json: { "move": [[regex, replacement]], "literals": [[old, new]] }; every moved file also becomes a literal pair.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { isHistory } from './history-paths.mjs'
import { buildPairs, escapeRe } from './path-pairs.mjs'

const [rulesFile, movesOut] = process.argv.slice(2)
const rules = JSON.parse(readFileSync(rulesFile, 'utf8'))
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
const trackedSet = new Set(tracked)

const moves = {}
for (const file of tracked) {
  const rule = rules.move.find(([pattern]) => new RegExp(pattern).test(file))
  if (rule) moves[file] = file.replace(new RegExp(rule[0]), rule[1])
}
const oldOf = Object.fromEntries(Object.entries(moves).map(([from, to]) => [to, from]))
for (const [from, to] of Object.entries(moves)) {
  mkdirSync(path.dirname(to), { recursive: true })
  execFileSync('git', ['mv', from, to])
}
writeFileSync(movesOut, `${JSON.stringify(moves, null, 1)}\n`)

// The old tracked file a specifier names, with the form the specifier used, or null for a package or a missing file.
const extensions = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '/index.ts']
const resolveOld = (oldFile, spec) => {
  const target = path.posix.join(path.posix.dirname(oldFile), spec)
  const suffix = extensions.find((ext) => trackedSet.has(target + ext))
  return suffix === undefined ? null : { target: target + suffix, suffix }
}
const specifier = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])(\.[^'"]*)\2/g
const codeFile = /\.(?:mjs|cjs|js|ts|tsx|mts)$/
let specifiers = 0
let unresolved = 0
for (const file of tracked.map((old) => moves[old] ?? old)) {
  if (!codeFile.test(file)) continue
  const oldFile = oldOf[file] ?? file
  let changed = 0
  const text = readFileSync(file, 'utf8').replace(specifier, (whole, lead, quote, spec) => {
    const hit = resolveOld(oldFile, spec)
    if (!hit) {
      if (file in oldOf) {
        unresolved++
        console.log(`unresolved in ${file}: ${spec}`)
      }
      return whole
    }
    if (!(file in oldOf) && !(hit.target in moves)) return whole
    const moved = moves[hit.target] ?? hit.target
    let next = path.posix.relative(path.posix.dirname(file), hit.suffix ? moved.slice(0, -hit.suffix.length) : moved)
    if (!next.startsWith('.')) next = `./${next}`
    if (next === spec) return whole
    changed++
    return `${lead}${quote}${next}${quote}`
  })
  if (!changed) continue
  writeFileSync(file, text)
  specifiers += changed
}

// Repo paths in plain and escaped regex form, with a boundary so a longer name is left alone.
const pairs = buildPairs(rules, moves)
const bare = Object.entries(moves)
  .filter(([from, to]) => path.posix.basename(from) !== path.posix.basename(to))
  .map(([from, to]) => [path.posix.basename(from), to.split('/').slice(-2).join('/')])
let literals = 0
let barenames = 0
const touched = new Set()
for (const file of tracked.map((old) => moves[old] ?? old)) {
  if (isHistory(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  let next = text
  for (const { from, to, lead } of pairs) {
    for (const [a, b] of [[from, to], [escapeRe(from), escapeRe(to)]]) {
      next = next.replace(new RegExp(`${lead}${escapeRe(a)}(?![\\w-])`, 'g'), () => {
        literals++
        return b
      })
    }
  }
  for (const [from, to] of bare) {
    next = next.replace(new RegExp(`(?<![\\w./\\\\-])${escapeRe(from)}(?![\\w-])`, 'g'), () => {
      barenames++
      return to
    })
  }
  if (next !== text) {
    writeFileSync(file, next)
    touched.add(file)
  }
}
console.log(`moved ${Object.keys(moves).length} files, rewrote ${specifiers} specifiers, ${literals} repo paths and ${barenames} file names in ${touched.size} files, ${unresolved} unresolved`)
```

`deepen-root.mjs` adds one `'..'` to the repo root lookups of code files that moved one folder deeper (the scripts find the repository root with `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')`):

Create `.tmp/w1/deepen-root.mjs`:

```js
// Adds one '..' to the repo root lookups of code files that moved one folder deeper, on lines that build the root from import.meta.url, a directory variable or __dirname.
// Usage: node .tmp/w1/deepen-root.mjs <moves.json>
import { readFileSync, writeFileSync } from 'node:fs'

const moves = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const lookup = /^(.*path\.resolve\((?:path\.dirname\(fileURLToPath\(import\.meta\.url\)\)|directory|__dirname)(?:, '\.\.')+)(?=[,)])/
let lines = 0
for (const [from, to] of Object.entries(moves)) {
  const deeper = to.split('/').length - from.split('/').length
  if (deeper <= 0 || !/\.(?:mjs|ts)$/.test(to)) continue
  const before = readFileSync(to, 'utf8')
  const after = before
    .split('\n')
    .map((line) => {
      if (!lookup.test(line)) return line
      lines++
      return line.replace(lookup, `$1${", '..'".repeat(deeper)}`)
    })
    .join('\n')
  if (after !== before) writeFileSync(to, after)
}
console.log(`deepened ${lines} root lookups`)
```

`moved-report.mjs` proves the staged move: every move is a rename in the index, and every changed code line of a renamed file differs only inside a repo path, a quoted string or a comment:

Create `.tmp/w1/moved-report.mjs`:

```js
// Proves a move: every move is a rename in the index, and every changed code line of a renamed file differs only inside quoted strings or comments.
// Usage: node .tmp/w1/moved-report.mjs <moves.json>   (run with the move staged, before the commit)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const moves = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
const renames = new Map(
  git('diff', '--cached', '-M', '--name-status')
    .split('\n')
    .filter((line) => line.startsWith('R'))
    .map((line) => {
      const [status, from, to] = line.split('\t')
      return [from, { to, status }]
    }),
)
const missing = Object.entries(moves).filter(([from, to]) => renames.get(from)?.to !== to)
const exact = [...renames.values()].filter((rename) => rename.status === 'R100').length

// A line without its repo paths, quoted strings, trailing comment and empty string arguments.
const shape = (line) =>
  line
    .replace(/(?:scripts|infra|apps)(?:\\?\/[\w.\-\\]+)+/g, 'P')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '$1$1')
    .replace(/\/\/.*$/, '//')
    .replace(/,\s*(''|"")/g, '')
const commentOnly = /^\s*(\/\/|\/\*|\*|#|--|<!--)/
const unexplained = []
for (const [from, { to, status }] of renames) {
  if (status === 'R100') continue
  const before = git('show', `HEAD:${from}`).split('\n')
  const after = git('show', `:${to}`).split('\n')
  if (before.length !== after.length) {
    unexplained.push(`${to}: ${before.length} lines became ${after.length}`)
    continue
  }
  before.forEach((line, index) => {
    if (line === after[index] || commentOnly.test(line) || /\.(md|sql)$/.test(to)) return
    if (shape(line) !== shape(after[index])) unexplained.push(`${to}:${index + 1}: ${after[index].trim().slice(0, 100)}`)
  })
}
console.log(`moves ${Object.keys(moves).length}, renames in the index ${renames.size}, exact ${exact}, rewritten ${renames.size - exact}, missing ${missing.length}, unexplained ${unexplained.length}`)
for (const line of unexplained) console.log(line)
process.exitCode = missing.length || unexplained.length ? 1 : 0
```

`stale-paths.mjs` scans every tracked or untracked file that is not history for an old path, an old bare file name or a quoted old folder name:

Create `.tmp/w1/stale-paths.mjs`:

```js
// Lists every file, untracked ones included, that still names an old repo path, an old bare file name or a quoted old folder name, except history files and allowed files.
// Usage: node .tmp/w1/stale-paths.mjs <rules.json> <moves.json> [--allow file,file]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { isHistory } from './history-paths.mjs'
import { buildPairs, escapeRe, renamedBases } from './path-pairs.mjs'

const [rulesFile, movesFile, flag, allowArg] = process.argv.slice(2)
const rules = JSON.parse(readFileSync(rulesFile, 'utf8'))
const moves = JSON.parse(readFileSync(movesFile, 'utf8'))
const allowed = new Set(flag === '--allow' ? allowArg.split(',') : [])

const variants = (old) => [old, old.replaceAll('/', '\\'), old.replaceAll('/', '\\\\'), old.replaceAll('/', '\\/').replaceAll('.', '\\.')]
const bare = Object.entries(moves)
  .filter(([from, to]) => path.posix.basename(from) !== path.posix.basename(to))
  .map(([from]) => path.posix.basename(from))
const patterns = [
  ...renamedBases(rules).map((name) => new RegExp(`['"]${escapeRe(name)}['"]`)),
  ...buildPairs(rules, moves).flatMap(({ from, lead }) => variants(from).map((text) => new RegExp(`${lead}${escapeRe(text)}(?![\\w-])`))),
  ...bare.map((name) => new RegExp(`(?<![\\w./\\\\-])${escapeRe(name)}(?![\\w-])`)),
]
const files = execFileSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0')
  .filter(Boolean)
let stale = 0
for (const file of files) {
  if (isHistory(file) || allowed.has(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  text.split('\n').forEach((line, index) => {
    if (!patterns.some((pattern) => pattern.test(line))) return
    stale++
    console.log(`${file}:${index + 1}: ${line.trim().slice(0, 110)}`)
  })
}
console.log(`stale ${stale}`)
process.exitCode = stale ? 1 : 0
```

`make-stubs.mjs` writes a forwarding stub at each old entry point:

Create `.tmp/w1/make-stubs.mjs`:

```js
// Writes a forwarding stub at each old entry point so callers outside the repo keep working after a move.
// Usage: node .tmp/w1/make-stubs.mjs <stubs.json>, a map of old path to new path (.mjs stubs spawn node, .ps1 stubs call the script and keep its exit code).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const stubs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const [oldPath, newPath] of Object.entries(stubs)) {
  let relative = path.posix.relative(path.posix.dirname(oldPath), newPath)
  if (!relative.startsWith('.')) relative = `./${relative}`
  const text = oldPath.endsWith('.ps1')
    ? ['# Forwards to the renamed folder for callers that still use the old path.', `& (Join-Path $PSScriptRoot '${relative}') @args`, 'exit $LASTEXITCODE', '']
    : [
        '// Forwards to the moved entry point for callers that still use this path.',
        "import { spawnSync } from 'node:child_process'",
        "import { fileURLToPath } from 'node:url'",
        '',
        `const target = fileURLToPath(new URL('${relative}', import.meta.url))`,
        'const { status } = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {',
        "  stdio: 'inherit',",
        '})',
        'process.exit(status ?? 1)',
        '',
      ]
  mkdirSync(path.dirname(oldPath), { recursive: true })
  writeFileSync(oldPath, text.join('\n'))
  console.log(`${oldPath} -> ${relative}`)
}
```

The rule file for this move (one regex rule: the group prefix of a `scripts/db` file name becomes a folder):

Create `.tmp/w1/db-rules.json`:

```json
{
  "move": [["^scripts/db/(local|hosted|defense)-(.+)$", "scripts/db/$1/$2"]],
  "literals": []
}
```

- [ ] **Step 3: Move the files and prove it**

```bash
node .tmp/w1/move-paths.mjs .tmp/w1/db-rules.json .tmp/w1/db-moves.json
node .tmp/w1/deepen-root.mjs .tmp/w1/db-moves.json
git add -A
node .tmp/w1/moved-report.mjs .tmp/w1/db-moves.json
node .tmp/w1/stale-paths.mjs .tmp/w1/db-rules.json .tmp/w1/db-moves.json
git grep -n -E "scripts/db/(local|hosted|defense)-" -- . ':!docs/cr-*' ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/handoff*' ':!docs/superpowers' | wc -l
git ls-files scripts/db | sed 's#/[^/]*$##' | sort | uniq -c
git diff --cached -M --stat | tail -1
```

Expected: the mover counts, the report, the scan, the group folders and the stat:

```
moved 34 files, rewrote 53 specifiers, 49 repo paths and 12 file names in 21 files, 0 unresolved
deepened 17 root lookups
moves 34, renames in the index 34, exact 5, rewritten 29, missing 0, unexplained 0
stale 0
0
     19 scripts/db/defense
      9 scripts/db/hosted
      6 scripts/db/local
 47 files changed, 131 insertions(+), 131 deletions(-)
```

The first line is the replay's counts (34 moves, 53 specifiers, 49 repo paths, 12 file names in 21 files, 0 unresolved); `exact 5, rewritten 29` is the report (every move is a rename, `missing 0`, `unexplained 0`); `stale 0` is the scan and the lone `0` is the count of old script paths left in living files. The staged diff touches the 34 moves and 13 other files.

The mover counts are the replay's: 34 moves, 53 specifiers, 49 repo paths (plain and escaped) and 12 file names, in 21 files besides the moved ones. A moved file with a root lookup that this plan does not know (a `join` of `process.cwd()`, say) would show as an `unexplained` line of the report or as a failing test in the next step.

- [ ] **Step 4: Format, run the tests and probe the moved entry points**

Biome sorts the import blocks the mover rewrote. The node tests run from the new folders (the suite is the same 164 tests as the baseline of Task 0: the glob now has a `**`), the api test that imports `hosted-seed-target.mjs` and the typechecks cover the rewritten imports of the e2e specs.

```bash
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR | grep -E "\.(ts|tsx|mjs|json)$") 2>&1 | tail -2
git add -A
node --test "scripts/db/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
pnpm --filter @pathways/api exec vitest run prisma/hosted-seed-target.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
for p in hosted/build defense/snapshot; do node scripts/db/$p.mjs --unknown-flag 2>&1 | head -1; echo "exit ${PIPESTATUS[0]}"; done
git status --short | grep -v "^[RM] " | head
```

Expected: Biome formats the rewritten files, the node tests are the baseline's 164 (162 pass, 2 skipped), the api test of the seed target passes, the typecheck is clean, and the two probes answer as before with the new path in the usage line:

```
Checked 44 files in <ms>. Fixed 4 files.
# tests 164
# pass 162
# fail 0
# skipped 2
 Test Files  1 passed (1)
      Tests  16 passed (16)
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
Error: Unknown argument: --unknown-flag
exit 1
Usage: node scripts/db/defense/snapshot.mjs mirror|dump|restore|storage [options]
exit 2
```

Biome's `Fixed` count may differ (import order and line width only). `git status --short` prints nothing else than renames and modifications.

- [ ] **Step 5: Commit the move**

```bash
git add -A
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(scripts): group the database scripts into local, hosted and defense folders

34 files move with git mv and lose their group prefix; every specifier, root lookup, package script, runbook line and e2e import that named them follows by script.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat -M --oneline HEAD | tail -1
git diff -M --diff-filter=R --name-status HEAD~1 HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c
```

Expected: the commit holds 34 renames (similarity 79% to 100%) and the files that follow them; all 34 are renames:

```
[claude/modularization-s8b-xjnlzt <sha>] refactor(scripts): group the database scripts into local, hosted and defense folders
 47 files changed, 131 insertions(+), 141 deletions(-)
 rename scripts/db/{defense-demo-wipe.test.mjs => defense/demo-wipe.test.mjs} (96%)
 rename scripts/db/{defense-demo.mjs => defense/demo.mjs} (92%)
 rename scripts/db/{defense-snapshot-cli.test.mjs => defense/snapshot-cli.test.mjs} (93%)
 rename scripts/db/{defense-snapshot-dates.mjs => defense/snapshot-dates.mjs} (100%)
 rename scripts/db/{defense-snapshot-dates.test.mjs => defense/snapshot-dates.test.mjs} (95%)
 rename scripts/db/{defense-snapshot-io.mjs => defense/snapshot-io.mjs} (96%)
 rename scripts/db/{defense-snapshot-local.mjs => defense/snapshot-local.mjs} (91%)
 rename scripts/db/{defense-snapshot-parse.mjs => defense/snapshot-parse.mjs} (100%)
 rename scripts/db/{defense-snapshot-parse.test.mjs => defense/snapshot-parse.test.mjs} (98%)
 rename scripts/db/{defense-snapshot-plan.mjs => defense/snapshot-plan.mjs} (100%)
 rename scripts/db/{defense-snapshot-plan.test.mjs => defense/snapshot-plan.test.mjs} (96%)
 rename scripts/db/{defense-snapshot-restore.mjs => defense/snapshot-restore.mjs} (84%)
 rename scripts/db/{defense-snapshot-sql.mjs => defense/snapshot-sql.mjs} (99%)
 rename scripts/db/{defense-snapshot-sql.test.mjs => defense/snapshot-sql.test.mjs} (99%)
 rename scripts/db/{defense-snapshot-storage.mjs => defense/snapshot-storage.mjs} (100%)
 rename scripts/db/{defense-snapshot-storage.test.mjs => defense/snapshot-storage.test.mjs} (97%)
 rename scripts/db/{defense-snapshot-target.mjs => defense/snapshot-target.mjs} (97%)
 rename scripts/db/{defense-snapshot-target.test.mjs => defense/snapshot-target.test.mjs} (98%)
 rename scripts/db/{defense-snapshot.mjs => defense/snapshot.mjs} (79%)
 rename scripts/db/{hosted-build.local.test.mjs => hosted/build.local.test.mjs} (97%)
 rename scripts/db/{hosted-build.mjs => hosted/build.mjs} (98%)
 rename scripts/db/{hosted-build.test.mjs => hosted/build.test.mjs} (99%)
 rename scripts/db/{hosted-plan.mjs => hosted/plan.mjs} (98%)
 rename scripts/db/{hosted-plan.test.mjs => hosted/plan.test.mjs} (99%)
 rename scripts/db/{hosted-seed-target.mjs => hosted/seed-target.mjs} (98%)
 rename scripts/db/{hosted-seed.mjs => hosted/seed.mjs} (90%)
 rename scripts/db/{hosted-target.mjs => hosted/target.mjs} (97%)
 rename scripts/db/{hosted-target.test.mjs => hosted/target.test.mjs} (99%)
 rename scripts/db/{local-demo.mjs => local/demo.mjs} (95%)
 rename scripts/db/{local-dev.mjs => local/dev.mjs} (96%)
 rename scripts/db/{local-load-seed.mjs => local/load-seed.mjs} (90%)
 rename scripts/db/{local-reset.mjs => local/reset.mjs} (98%)
 rename scripts/db/{local-seed.mjs => local/seed.mjs} (90%)
 rename scripts/db/{local-target.mjs => local/target.mjs} (100%)
 47 files changed, 131 insertions(+), 141 deletions(-)
     34 R
```

- [ ] **Step 6: Keep the hosted and defense entry points as forwarders**

The developer runs `node scripts/db/hosted-build.mjs`, `hosted-seed.mjs`, `defense-demo.mjs` and `defense-snapshot.mjs` from Windows PowerShell, from the runbooks and from notes outside the repository, so these four old names stay as stubs that start the moved script with the same arguments, the same standard input (the defense seed pauses for Enter) and the same exit code. The stubs spawn Node on the target because the entry scripts only run their `main` when they are the process entry file. The six local scripts keep no stub: they run through `pnpm db:*` and `pnpm dev:local`, which the move updated. The stubs are a separate commit so that the move above stays a pure rename.

Create `.tmp/w1/db-stubs.json`:

```json
{
  "scripts/db/hosted-build.mjs": "scripts/db/hosted/build.mjs",
  "scripts/db/hosted-seed.mjs": "scripts/db/hosted/seed.mjs",
  "scripts/db/defense-demo.mjs": "scripts/db/defense/demo.mjs",
  "scripts/db/defense-snapshot.mjs": "scripts/db/defense/snapshot.mjs"
}
```

```bash
node .tmp/w1/make-stubs.mjs .tmp/w1/db-stubs.json
pnpm exec biome check scripts/db 2>&1 | tail -2
for p in hosted-build defense-snapshot; do node scripts/db/$p.mjs --unknown-flag 2>&1 | head -1; echo "exit ${PIPESTATUS[0]}"; done
node --test "scripts/db/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail)"
node .tmp/w1/stale-paths.mjs .tmp/w1/db-rules.json .tmp/w1/db-moves.json
git add scripts/db
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(scripts): keep the old hosted and defense entry points as forwarders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -6
```

Expected: the four stubs, Biome has nothing to fix, the two probes answer through the stubs as through the moved scripts (the usage line already names the new path), the node tests keep their 164, the scan finds nothing, and the commit holds the four stubs:

```
scripts/db/hosted-build.mjs -> ./hosted/build.mjs
scripts/db/hosted-seed.mjs -> ./hosted/seed.mjs
scripts/db/defense-demo.mjs -> ./defense/demo.mjs
scripts/db/defense-snapshot.mjs -> ./defense/snapshot.mjs
Checked 38 files in <ms>. No fixes applied.
Error: Unknown argument: --unknown-flag
exit 1
Usage: node scripts/db/defense/snapshot.mjs mirror|dump|restore|storage [options]
exit 2
# tests 164
# pass 162
# fail 0
stale 0
[claude/modularization-s8b-xjnlzt <sha>] refactor(scripts): keep the old hosted and defense entry points as forwarders
 4 files changed, 36 insertions(+)
 create mode 100644 scripts/db/defense-demo.mjs
 create mode 100644 scripts/db/defense-snapshot.mjs
 create mode 100644 scripts/db/hosted-build.mjs
 create mode 100644 scripts/db/hosted-seed.mjs
<sha> refactor(scripts): keep the old hosted and defense entry points as forwarders
 scripts/db/defense-demo.mjs     | 9 +++++++++
 scripts/db/defense-snapshot.mjs | 9 +++++++++
 scripts/db/hosted-build.mjs     | 9 +++++++++
 scripts/db/hosted-seed.mjs      | 9 +++++++++
 4 files changed, 36 insertions(+)
```



---

### Task 4: `infra/supabase/phase6` becomes `infra/supabase/replay`

**Files:**
- Create (gitignored): `.tmp/w1/ps-parse.ps1`, `replay-rules.json`, `replay-moves.json` (written by the mover), `task4-token-edits.json`, `replay-stubs.json`, `verify-forward-before.txt`
- Move: the 58 files of `infra/supabase/phase6` to `infra/supabase/replay`, all as pure renames (R100)
- Modify: `.github/workflows/ci.yml` (the replay step), `scripts/sad/check.ts` (three globs), `scripts/db/hosted/build.mjs`, `scripts/db/local/reset.mjs`, `scripts/db/defense/snapshot.mjs` (one path token each), the db script tests that read the wipe SQL, the api test READMEs and local tests that name the runner, and the living docs that name the folder
- Create (second commit): forwarding scripts `infra/supabase/phase6/Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1` and `Test-SchemaDrift.ps1`, and one README sentence

The folder name came from the sixth phase of the first database work and says nothing today: the folder holds the replay runner, the baseline and forward verifiers, the hosted and forward SQL, and the schema drift gate (MOD-19). The mover of Task 3 does the rename. Names inside the scripts stay as they are (see the ruling on internal names): the `$phase6*` variables, the database `pathways_phase4_phase6_replay` (the CI environment, the runtime SQL guards and the legacy retirement SQL name it), the variable `PATHWAYS_PHASE6_REPLAY_MIGRATIONS`, the `.tmp/pathways-phase6-*` directories and the `PHASE6_LOCAL_REPLAY=PASS` line.

`Verify-Forward.ps1` records its own SHA256 at run time (`Get-FileHash` of `$PSScriptRoot` `Verify-Forward.ps1`), so its content must not change: the rename moves the file only, and Step 3 proves the blob hash equal.

- [ ] **Step 1: Probe the runner before the move**

`ps-parse.ps1` parses PowerShell files without running them, which is the check for the scripts that need `initdb` (they cannot run as root, and the full replay is the CI gate):

Create `.tmp/w1/ps-parse.ps1`:

```powershell
# Parses each PowerShell file (a comma separated list) and exits with the number of files that have a syntax error.
param([Parameter(Mandatory)][string]$Path)
$files = $Path -split ','
$bad = 0
foreach ($file in $files) {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file).Path, [ref]$null, [ref]$errors)
  if ($errors) { $bad++; $errors | ForEach-Object { "$file : $($_.Message)" } }
}
"parsed $($files.Count) files, $bad with errors"
exit $bad
```

As root the runner stops at `initdb` after the history check, which proves the script starts, finds its helpers and reads the migrations; as another user the same call replays the whole chain (about ten minutes), and a cloud run may leave that to CI.

```bash
git ls-files infra/supabase/phase6 | wc -l
git ls-files infra/supabase/phase6 | sed 's/.*\.//' | sort | uniq -c
git hash-object infra/supabase/phase6/Verify-Forward.ps1 | tee .tmp/w1/verify-forward-before.txt
git grep -l -E "infra/supabase/phase6|phase6/Replay-Local" -- . ':!docs/cr-*' ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/handoff*' ':!docs/superpowers' | wc -l
pwsh -NoProfile -File .tmp/w1/ps-parse.ps1 -Path "$(git ls-files 'infra/supabase/phase6/*.ps1' | paste -sd,)" | tail -1
if [ "$(id -u)" = 0 ]; then pwsh -NoProfile -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -3 | cut -c1-110; else echo "non-root: full replay left to CI"; fi
git status --short
```

Expected: the 58 files (41 SQL, 15 PowerShell, one README, one TypeScript config), the blob hash of `Verify-Forward.ps1`, 14 living files that name the folder, the 15 scripts parse, and the runner stops at `initdb` after the history check (as root; as another user the replay runs to its end, and a cloud run may leave that to CI):

```
58
      1 md
     15 ps1
     41 sql
      1 ts
288e89eff9690c388e39ef0c5a6d3fc64a6cd48f
14
parsed 15 files, 0 with errors
HISTORICAL_MIGRATION_INTEGRITY=PASS
initdb: error: cannot be run as root
initdb: hint: Please log in (using, e.g., "su") as the (unprivileged) user that will own the server process.
```

The hash is recorded in `.tmp/w1/verify-forward-before.txt`; Step 3 compares it. A file count other than 58 or a hash that differs from the replay means the folder changed since planning: stop.

- [ ] **Step 2: Create the rule file and the three token edits**

The rule file moves the folder and adds two literals for the folder and for the short `phase6/Replay-Local.ps1` form that a test comment uses. Three scripts of `scripts/db` build the folder from path parts (`'infra', 'supabase', 'phase6'`), which no path pair can see, so they get an explicit edit.

Create `.tmp/w1/replay-rules.json`:

```json
{
  "move": [["^infra/supabase/phase6/(.+)$", "infra/supabase/replay/$1"]],
  "literals": [
    ["infra/supabase/phase6", "infra/supabase/replay"],
    ["phase6/Replay-Local.ps1", "replay/Replay-Local.ps1"]
  ]
}
```

Create `.tmp/w1/task4-token-edits.json`:

```json
[
  ["scripts/db/hosted/build.mjs", "'infra', 'supabase', 'phase6'", "'infra', 'supabase', 'replay'", 1],
  ["scripts/db/local/reset.mjs", "'infra', 'supabase', 'phase6'", "'infra', 'supabase', 'replay'", 1],
  ["scripts/db/defense/snapshot.mjs", "'infra', 'supabase', 'phase6'", "'infra', 'supabase', 'replay'", 1]
]
```

- [ ] **Step 3: Move the folder and prove it**

```bash
node .tmp/w1/move-paths.mjs .tmp/w1/replay-rules.json .tmp/w1/replay-moves.json
node .tmp/w1/replace-exact.mjs .tmp/w1/task4-token-edits.json
pnpm exec biome check --write scripts/sad/check.ts scripts/db 2>&1 | tail -1
git add -A
node .tmp/w1/moved-report.mjs .tmp/w1/replay-moves.json
node .tmp/w1/stale-paths.mjs .tmp/w1/replay-rules.json .tmp/w1/replay-moves.json
test "$(git hash-object infra/supabase/replay/Verify-Forward.ps1)" = "$(cat .tmp/w1/verify-forward-before.txt)" && echo "Verify-Forward.ps1 blob unchanged"
git ls-files infra/supabase/phase6 | wc -l
git diff --cached -M --stat | tail -1
git diff --cached -M --name-status | cut -c1 | sort | uniq -c
```

Expected: the mover counts, the three token edits, the report, the scan, the unchanged hash, the empty old folder (`0` tracked files) and the stat:

```
moved 58 files, rewrote 0 specifiers, 35 repo paths and 0 file names in 14 files, 0 unresolved
3 replacements in 3 files
Checked 39 files in <ms>. No fixes applied.
moves 58, renames in the index 58, exact 58, rewritten 0, missing 0, unexplained 0
stale 0
Verify-Forward.ps1 blob unchanged
0
 75 files changed, 34 insertions(+), 34 deletions(-)
     17 M
     58 R
```

All 58 moves are exact renames (`rewritten 0`: no script of the folder names its own path); the 17 modified files are the 14 files with a repo path and the three scripts with a path token.

The 17 files that changed besides the renames are the replay's: `.github/workflows/ci.yml`, `scripts/sad/check.ts`, the three `scripts/db` scripts with a path token (`hosted/build.mjs`, `local/reset.mjs`, `defense/snapshot.mjs`), the two db tests that read the wipe SQL (`defense/demo-wipe.test.mjs`, `defense/snapshot-parse.test.mjs`), the api test README, one runtime SQL comment, one local test comment, and seven living docs (deferred features, ops, QAD, the three runbooks and the SAD).

- [ ] **Step 4: Run the checks that can run here**

The db script tests read `hosted-defense-demo-wipe.sql` and the hosted SQL from the new folder; the SAD checker tests cover the three globs; the Pester files and the parse check cover the PowerShell that is renamed but not edited; the YAML parse covers the CI edit.

```bash
node --test "scripts/db/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:typecheck 2>&1 | tail -1
for f in replay-port replay-timing; do pwsh -NoProfile -File .tmp/w1/pester.ps1 -Path infra/supabase/replay/$f.Tests.ps1 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests Passed"; done
pwsh -NoProfile -File .tmp/w1/ps-parse.ps1 -Path "$(git ls-files 'infra/supabase/replay/*.ps1' | paste -sd,)" | tail -1
python3 -c "import yaml; d = yaml.safe_load(open('.github/workflows/ci.yml')); print([s['run'] for s in d['jobs']['validate']['steps'] if 'Replay' in s.get('name', '')])"
for p in hosted/build defense/snapshot; do node scripts/db/$p.mjs --unknown-flag 2>&1 | head -1; echo "exit ${PIPESTATUS[0]}"; done
if [ "$(id -u)" = 0 ]; then pwsh -NoProfile -File infra/supabase/replay/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -3 | cut -c1-110; else echo "non-root: full replay left to CI"; fi
git status --short | grep -v "^[RM] " | head
```

Expected: the db script tests keep their 164 (162 pass), the SAD tests pass with their 59, the SAD typecheck is clean, all 15 scripts parse, the replay step of the workflow names the new path exactly, the two probes answer as before, and as root the runner stops at `initdb` after the history check:

```
# tests 164
# pass 162
# fail 0
# skipped 2
 Test Files  1 passed (1)
      Tests  59 passed (59)
$ tsc -p scripts/sad/tsconfig.json
parsed 15 files, 0 with errors
['./infra/supabase/replay/Replay-Local.ps1 -MigrationBaseline -PostgresBin /usr/lib/postgresql/18/bin']
Error: Unknown argument: --unknown-flag
exit 1
Usage: node scripts/db/defense/snapshot.mjs mirror|dump|restore|storage [options]
exit 2
HISTORICAL_MIGRATION_INTEGRITY=PASS
initdb: error: cannot be run as root
initdb: hint: Please log in (using, e.g., "su") as the (unprivileged) user that will own the server process.
```

As another user the last probe replays the whole chain and must print `PHASE6_LOCAL_REPLAY=PASS` instead of the `initdb` error (pending local run in the replay, which was root). With Pester 5 the two Pester files print `Tests Passed: 2, Failed: 0, Skipped: 0, Inconclusive: 0, NotRun: 0` and the same with `Passed: 3` after the SAD typecheck line. Where `pwsh` or Pester 5 is missing (as in the replay container, where Pester could not be installed) the Pester lines do not print and the step is "pending local run", and where `pwsh` is missing the parse lines are "pending local run" too.

The replay itself is the gate of the part 3 pull request. W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2; CI runs `./infra/supabase/replay/Replay-Local.ps1 -MigrationBaseline -PostgresBin /usr/lib/postgresql/18/bin` there and must print its PASS lines and no FAIL line. Record it as "pending CI" until that pull request runs.

- [ ] **Step 5: Commit the rename**

```bash
git add -A
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(infra): rename the replay folder from phase6 to replay

58 files move with git mv and keep their content (Verify-Forward.ps1 is byte for byte the same, as its recorded hash requires); the CI replay step, the SAD globs, the db scripts that join the folder, the runbooks and the test READMEs follow by script.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat -M --oneline HEAD | tail -1
git diff -M --diff-filter=R --name-status HEAD~1 HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c
```

Expected: the commit holds 58 renames and 17 modified files, all 58 are renames:

```
[claude/modularization-s8b-xjnlzt <sha>] refactor(infra): rename the replay folder from phase6 to replay
 75 files changed, 34 insertions(+), 34 deletions(-)
 rename infra/supabase/{phase6 => replay}/Invoke-RuntimeSql.Tests.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Invoke-RuntimeSql.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Invoke-RuntimeVitest.Tests.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Invoke-RuntimeVitest.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/README.md (100%)
 rename infra/supabase/{phase6 => replay}/Replay-Local.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Test-SchemaDrift.Tests.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Test-SchemaDrift.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Verify-Baseline.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/Verify-Forward.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/forward-activity-media-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-activity-media-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-activity-review-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-activity-review-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-core-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-core-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-expense-submit-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-expense-submit-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-function-validation.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-catalog-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-catalog-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-escalation-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-escalation-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-scope-memo-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-rules-scope-memo-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/forward-step-up-pin-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-activity-media-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-activity-media-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-activity-review-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-activity-review-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-core-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-core-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-defense-demo-wipe-dry-run.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-defense-demo-wipe.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-expense-submit-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-expense-submit-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-indicator-type-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-indicator-type-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-catalog-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-catalog-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-escalation-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-escalation-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-machine-login.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-scope-memo-cleanup.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-rules-scope-memo-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/hosted-step-up-pin-preprovision.sql (100%)
 rename infra/supabase/{phase6 => replay}/migrations-hash.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/prisma.replay.config.ts (100%)
 rename infra/supabase/{phase6 => replay}/replay-port.Tests.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/replay-port.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/replay-template.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/replay-timing.Tests.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/replay-timing.ps1 (100%)
 rename infra/supabase/{phase6 => replay}/schema-drift-expected.sql (100%)
 75 files changed, 34 insertions(+), 34 deletions(-)
     58 R
```

- [ ] **Step 6: Keep the four PowerShell entry points as forwarders**

The hosted and defense workflows on Windows PowerShell call `infra/supabase/phase6/Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1` and `Test-SchemaDrift.ps1` (the runbooks and notes outside the repository name them), so the old folder keeps these four as forwarders: each runs the script of the new folder with the same arguments (`@args` passes switches and valued parameters) and exits with its exit code. The other 54 files have no stub: the SQL files are only read by the scripts and tests, which the move updated, and the helper scripts are dot-sourced or called by the four entry points.

Create `.tmp/w1/replay-stubs.json`:

```json
{
  "infra/supabase/phase6/Replay-Local.ps1": "infra/supabase/replay/Replay-Local.ps1",
  "infra/supabase/phase6/Invoke-RuntimeSql.ps1": "infra/supabase/replay/Invoke-RuntimeSql.ps1",
  "infra/supabase/phase6/Invoke-RuntimeVitest.ps1": "infra/supabase/replay/Invoke-RuntimeVitest.ps1",
  "infra/supabase/phase6/Test-SchemaDrift.ps1": "infra/supabase/replay/Test-SchemaDrift.ps1"
}
```

```bash
node .tmp/w1/make-stubs.mjs .tmp/w1/replay-stubs.json
cat infra/supabase/phase6/Replay-Local.ps1
pwsh -NoProfile -File .tmp/w1/ps-parse.ps1 -Path infra/supabase/phase6/Replay-Local.ps1,infra/supabase/phase6/Invoke-RuntimeSql.ps1,infra/supabase/phase6/Invoke-RuntimeVitest.ps1,infra/supabase/phase6/Test-SchemaDrift.ps1 | tail -1
pwsh -NoProfile -Command '& ./infra/supabase/phase6/Test-SchemaDrift.ps1 -NoSuchSwitch; "exit $LASTEXITCODE"' > .tmp/w1/stub-old.txt 2>&1
pwsh -NoProfile -Command '& ./infra/supabase/replay/Test-SchemaDrift.ps1 -NoSuchSwitch; "exit $LASTEXITCODE"' > .tmp/w1/stub-new.txt 2>&1
diff .tmp/w1/stub-old.txt .tmp/w1/stub-new.txt && echo "forwarder output equals direct output"
sed "s/ '.*//" .tmp/w1/stub-new.txt | head -3
if [ "$(id -u)" = 0 ]; then pwsh -NoProfile -File infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -3 | cut -c1-110; else echo "non-root: full replay left to CI"; fi
printf '\nThe old folder `infra/supabase/phase6` keeps four forwarding scripts (`Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1` and `Test-SchemaDrift.ps1`) for callers that still use the old path; they pass every argument and the exit code through.\n' >> infra/supabase/replay/README.md
pnpm docs:check 2>&1 | tail -2
node .tmp/w1/stale-paths.mjs .tmp/w1/replay-rules.json .tmp/w1/replay-moves.json --allow infra/supabase/replay/README.md
git add infra/supabase
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(infra): keep the four replay entry points at the old path as forwarders

The developer runs Replay-Local, Invoke-RuntimeSql, Invoke-RuntimeVitest and Test-SchemaDrift from Windows PowerShell at infra/supabase/phase6; each stub starts the script of the renamed folder with the same arguments and exit code.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -7
```

Expected: the four stubs, one printed in full, the four parse, the stub and the direct call print the same output (empty diff, then the first lines of it), the stub reaches the same `initdb` stop, the docs check keeps its 0 failures and 0 warnings, the scan finds nothing, and the commit holds four stubs and one README sentence:

```
infra/supabase/phase6/Replay-Local.ps1 -> ../replay/Replay-Local.ps1
infra/supabase/phase6/Invoke-RuntimeSql.ps1 -> ../replay/Invoke-RuntimeSql.ps1
infra/supabase/phase6/Invoke-RuntimeVitest.ps1 -> ../replay/Invoke-RuntimeVitest.ps1
infra/supabase/phase6/Test-SchemaDrift.ps1 -> ../replay/Test-SchemaDrift.ps1
# Forwards to the renamed folder for callers that still use the old path.
& (Join-Path $PSScriptRoot '../replay/Replay-Local.ps1') @args
exit $LASTEXITCODE
parsed 4 files, 0 with errors
forwarder output equals direct output
SCHEMA_DRIFT=ERROR; Cannot find path
exit 1
HISTORICAL_MIGRATION_INTEGRITY=PASS
initdb: error: cannot be run as root
initdb: hint: Please log in (using, e.g., "su") as the (unprivileged) user that will own the server process.

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
stale 0
[claude/modularization-s8b-xjnlzt <sha>] refactor(infra): keep the four replay entry points at the old path as forwarders
 5 files changed, 14 insertions(+)
 create mode 100644 infra/supabase/phase6/Invoke-RuntimeSql.ps1
 create mode 100644 infra/supabase/phase6/Invoke-RuntimeVitest.ps1
 create mode 100644 infra/supabase/phase6/Replay-Local.ps1
 create mode 100644 infra/supabase/phase6/Test-SchemaDrift.ps1
<sha> refactor(infra): keep the four replay entry points at the old path as forwarders
 infra/supabase/phase6/Invoke-RuntimeSql.ps1    | 3 +++
 infra/supabase/phase6/Invoke-RuntimeVitest.ps1 | 3 +++
 infra/supabase/phase6/Replay-Local.ps1         | 3 +++
 infra/supabase/phase6/Test-SchemaDrift.ps1     | 3 +++
 infra/supabase/replay/README.md                | 2 ++
 5 files changed, 14 insertions(+)
```

The `SCHEMA_DRIFT=ERROR` text comes from the schema drift gate itself (no saved template exists here); the point is that both calls print it.

The two `-NoSuchSwitch` calls run the schema drift gate with a switch it does not know: it ends in `SCHEMA_DRIFT=ERROR` with exit 1 because no saved template exists, through the stub and directly alike (the diff of the two outputs is empty). The README sentence is the one allowed mention of the old folder. The stubs themselves and the full replay through them run on Windows PowerShell and in CI (pending local run).



---

### Task 5: The seed scripts move to `apps/api/prisma/seeds`

**Files:**
- Create (gitignored): `.tmp/w1/seeds-rules.json`, `seeds-moves.json` (written by the mover), `task5-edits.json`
- Move: the 56 seed files of `apps/api/prisma` (46 TypeScript files, the 6 demo photos and the 4 demo import fixtures) into `apps/api/prisma/seeds/`, with their names unchanged
- Modify: `apps/api/prisma.config.ts` (the seed command), the specifiers and root lookups of the moved files, the scripts, e2e specs and docs that name them, and `local-demo-data.test.ts` (one migration path)
- Stay in `apps/api/prisma`: `schema.prisma`, `migrations/`, `history/`, `tests/`, `check-connection.ts`, the three `legacy-retirement*` files and the three `authorization-bootstrap*` files

This is MOD-21, the folder part. The seed scripts are about 50 files beside the schema; one folder with the same file names makes `prisma/` the schema, the migrations and the few operational scripts. The per-domain data split of `local-demo-data.ts` and `hosted-realistic-seed.ts` is not done here (see the ruling on seeds): it is left to the developer, because its proof is a seed run on a local database.

The move needs no new code. The rule file below puts every seed file in the folder; the mover rewrites the specifiers (the seeds import `../src/...`, which becomes `../../src/...`, and each other with `./`), the `scripts/db` and e2e imports and the docs, and `deepen-root.mjs` adds one `'..'` to the three repository root lookups. The assets and fixtures keep their position next to the code that reads them (`__dirname` joins), so only the one migration path of `local-demo-data.test.ts` needs an edit.

- [ ] **Step 1: Probe the seed path before the move**

`prisma db seed` runs `prisma/seed.ts` through the `seed` key of `prisma.config.ts`; with a dummy `DIRECT_URL` and no database it prints the disabled message of `seed.ts`, so it checks the path end to end. The prisma tests are the second check; the build file list counts the prisma files the production build compiles.

```bash
git ls-files apps/api/prisma | grep -v -E '^apps/api/prisma/(migrations/|history/|tests/|schema\.prisma$|check-connection\.ts$|legacy-retirement|authorization-bootstrap)' | sed 's/.*\.//' | sort | uniq -c
(cd apps/api && <DIRECT_URL set to a dummy closed-port URL> pnpm exec prisma db seed 2>&1 | grep -E "Running seed|disabled" | cut -c1-110)
pnpm --filter @pathways/api exec vitest run prisma 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
(cd apps/api && pnpm exec tsc -p tsconfig.build.json --noEmit --listFilesOnly | grep -c "apps/api/prisma/")
git grep -n "prisma/seed\|prisma/local-\|prisma/hosted-\|prisma/defense-" -- . ':!docs' ':!apps/api/prisma' | cut -c1-120
```

Expected: the 56 seed files (46 TypeScript files, 6 photos, 3 CSV and one XLSX fixture), the seed command running `prisma/seed.ts`, the prisma tests (13 files pass, 1 skipped, 181 tests), 40 prisma files in the production build list, and the references from outside `docs` and `apps/api/prisma` (the seed command, the launchers of `scripts/db`, one e2e comment and the Supabase config comment):

```
      3 csv
      6 jpg
     46 ts
      1 xlsx
Running seed command `node -r ts-node/register -r tsconfig-paths/register prisma/seed.ts` ...
Implicit bootstrap seed is disabled. Current RBAC reference changes require reviewed forward Prisma migrations
 Test Files  13 passed | 1 skipped (14)
      Tests  181 passed | 1 skipped (182)
40
apps/api/prisma.config.ts:22:    seed: 'node -r ts-node/register -r tsconfig-paths/register prisma/seed.ts',
apps/web/e2e/fixtures/real-sign-in.ts:9:// Local seed accounts by role, as defined in apps/api/prisma/local-demo-seed.ts
scripts/db/defense/demo.mjs:1:// Launches apps/api/prisma/defense-demo-seed.ts against hosted PATHWAYS-devV2 or, with
scripts/db/defense/demo.mjs:41:      'prisma/defense-demo-seed.ts',
scripts/db/hosted/seed.mjs:1:// Launches apps/api/prisma/hosted-realistic-seed.ts against the hosted PATHWAYS-devV2
scripts/db/hosted/seed.mjs:49:      'prisma/hosted-realistic-seed.ts',
scripts/db/local/demo.mjs:2:// (apps/api/prisma/local-demo-seed.ts). Run after `pnpm db:local:reset`. Loopback only:
scripts/db/local/demo.mjs:88:let status = run('prisma/local-synthetic-seed.ts').status ?? 1
scripts/db/local/demo.mjs:101:      run('prisma/local-demo-seed.ts', {
scripts/db/local/load-seed.mjs:21:    'prisma/local-load-seed.ts',
scripts/db/local/seed.mjs:1:// Writes the local synthetic workspace (apps/api/prisma/local-synthetic-seed.ts).
scripts/db/local/seed.mjs:21:    'prisma/local-synthetic-seed.ts',
supabase/config.toml:66:# Synthetic data is written by apps/api/prisma/local-synthetic-seed.ts, not seed.sql.
```

These are the references the mover rewrites; the file count 56 and the prisma test counts must match, the build file count (40 here) is only compared with Step 3.

- [ ] **Step 2: Create the rule file and the one edit, move and prove**

The first rule moves everything except the files that stay (a negative lookahead on the folder and file names). The literal rewrites the runbook line that names the fixtures folder. `relativeRoots` makes the mover also rewrite paths written from `apps/api/`, such as the seed command `prisma/seed.ts`.

Create `.tmp/w1/seeds-rules.json`:

```json
{
  "move": [
    [
      "^apps/api/prisma/(?!migrations/|history/|tests/|schema\\.prisma$|check-connection\\.ts$|legacy-retirement|authorization-bootstrap)([^/].*)$",
      "apps/api/prisma/seeds/$1"
    ]
  ],
  "literals": [["apps/api/prisma/demo-fixtures", "apps/api/prisma/seeds/demo-fixtures"]],
  "relativeRoots": ["apps/api/"]
}
```

Create `.tmp/w1/task5-edits.json`:

```json
[
  [
    "apps/api/prisma/seeds/local-demo-data.test.ts",
    "path.resolve(__dirname, 'migrations/0040_default_registration_form/migration.sql')",
    "path.resolve(__dirname, '../migrations/0040_default_registration_form/migration.sql')",
    1
  ]
]
```

```bash
node .tmp/w1/move-paths.mjs .tmp/w1/seeds-rules.json .tmp/w1/seeds-moves.json
node .tmp/w1/deepen-root.mjs .tmp/w1/seeds-moves.json
node .tmp/w1/replace-exact.mjs .tmp/w1/task5-edits.json
git add -A
node .tmp/w1/moved-report.mjs .tmp/w1/seeds-moves.json
node .tmp/w1/stale-paths.mjs .tmp/w1/seeds-rules.json .tmp/w1/seeds-moves.json
grep -n "seed:" apps/api/prisma.config.ts
git ls-files apps/api/prisma | grep -v -E '^apps/api/prisma/(seeds/|migrations/|history/|tests/)'
git ls-files apps/api/prisma/seeds | wc -l
git diff --cached -M --stat | tail -1
```

Expected: the mover counts (56 moves, 83 specifiers, 26 repo paths, 15 files, 3 root lookups deepened, the one migration path edit), the report (45 exact renames and 11 rewritten, `unexplained 0`), `stale 0`, the new seed command, the seven files that stay in `prisma`, the 56 files of the new folder and the stat:

```
moved 56 files, rewrote 83 specifiers, 26 repo paths and 0 file names in 15 files, 0 unresolved
deepened 3 root lookups
1 replacements in 1 files
moves 56, renames in the index 56, exact 45, rewritten 11, missing 0, unexplained 0
stale 0
22:    seed: 'node -r ts-node/register -r tsconfig-paths/register prisma/seeds/seed.ts',
apps/api/prisma/authorization-bootstrap-runner.test.ts
apps/api/prisma/authorization-bootstrap-runner.ts
apps/api/prisma/authorization-bootstrap.local.test.ts
apps/api/prisma/check-connection.ts
apps/api/prisma/legacy-retirement-target.ts
apps/api/prisma/legacy-retirement.test.ts
apps/api/prisma/schema.prisma
56
 72 files changed, 111 insertions(+), 111 deletions(-)
```

The seven files that stay are the three `authorization-bootstrap*` files, `check-connection.ts`, the two `legacy-retirement*` files and `schema.prisma`.

The mover counts are the replay's. A moved file with a lookup the plan does not know (a `join` of `process.cwd()`, say) shows as `unexplained` in the report or as a failing test in the next step.

- [ ] **Step 3: Format, typecheck and run the tests**

```bash
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR | grep -E "\.(ts|tsx|mjs|json)$") 2>&1 | tail -2
git add -A
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/api exec vitest run prisma 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests +[0-9]+| FAIL "
node --test "scripts/db/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
(cd apps/api && <DIRECT_URL set to a dummy closed-port URL> pnpm exec prisma db seed 2>&1 | grep -E "Running seed|disabled" | cut -c1-110)
(cd apps/api && pnpm exec tsc -p tsconfig.build.json --noEmit --listFilesOnly | grep -c "apps/api/prisma/")
git status --short | grep -v "^[RM] " | head
```

Expected: Biome has nothing to fix, the five typechecks are clean, the prisma tests and the node tests equal their baselines, `prisma db seed` runs `prisma/seeds/seed.ts` and prints the disabled message, and the production build compiles the same number of prisma files as before (40):

```
Checked 55 files in <ms>. No fixes applied.
apps/api typecheck: Done
apps/web typecheck: Done
packages/config typecheck: Done
packages/imports typecheck: Done
packages/shared typecheck: Done
 Test Files  13 passed | 1 skipped (14)
      Tests  181 passed | 1 skipped (182)
# tests 164
# pass 162
# fail 0
# skipped 2
Running seed command `node -r ts-node/register -r tsconfig-paths/register prisma/seeds/seed.ts` ...
Implicit bootstrap seed is disabled. Current RBAC reference changes require reviewed forward Prisma migrations
40
```

The seed probe now runs `prisma/seeds/seed.ts`, the prisma test count is the baseline's, and the production build compiles the same number of prisma files as before (the folder is still inside `include`).

- [ ] **Step 4: Commit**

```bash
git add -A
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "refactor(api): move the seed scripts into apps/api/prisma/seeds

56 seed files, demo photos and import fixtures move with git mv and keep their names; the seed command, every specifier, root lookup, script, e2e import and runbook line that named them follows by script. The schema, migrations, history and the operational scripts stay in prisma.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat -M --oneline HEAD | tail -1
git diff -M --diff-filter=R --name-status HEAD~1 HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c
```

Expected: the commit holds 56 renames and 16 modified files, all 56 are renames:

```
[claude/modularization-s8b-xjnlzt <sha>] refactor(api): move the seed scripts into apps/api/prisma/seeds
 72 files changed, 111 insertions(+), 111 deletions(-)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/committee-training.jpg (100%)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/household-follow-up.jpg (100%)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/hygiene-kit-distribution.jpg (100%)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/learning-center-review.jpg (100%)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/livelihood-coaching.jpg (100%)
 rename apps/api/prisma/{ => seeds}/assets/demo-photos/wash-handwashing.jpg (100%)
 rename apps/api/prisma/{ => seeds}/canonical-seed.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-base.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-drain.ts (91%)
 rename apps/api/prisma/{ => seeds}/defense-demo-seed.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-seed.ts (76%)
 rename apps/api/prisma/{ => seeds}/defense-demo-staff.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-autoresolve.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-backdate.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-evaluation.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-monitoring.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-participation.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage-survey.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-stage.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-target.ts (100%)
 rename apps/api/prisma/{ => seeds}/defense-demo-verify.ts (100%)
 rename apps/api/prisma/{ => seeds}/demo-fixtures/beneficiary-registration-borongan.csv (100%)
 rename apps/api/prisma/{ => seeds}/demo-fixtures/beneficiary-registration-borongan.xlsx (100%)
 rename apps/api/prisma/{ => seeds}/demo-fixtures/household-profile-followup.csv (100%)
 rename apps/api/prisma/{ => seeds}/demo-fixtures/livelihood-followup-structure.csv (100%)
 rename apps/api/prisma/{ => seeds}/developer-bootstrap.ts (98%)
 rename apps/api/prisma/{ => seeds}/hosted-realistic-seed.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/hosted-realistic-seed.ts (97%)
 rename apps/api/prisma/{ => seeds}/hosted-seed-target.test.ts (98%)
 rename apps/api/prisma/{ => seeds}/local-demo-data.test.ts (99%)
 rename apps/api/prisma/{ => seeds}/local-demo-data.ts (99%)
 rename apps/api/prisma/{ => seeds}/local-demo-journeys.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-journeys.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-seed.ts (77%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-activities.ts (99%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-criteria.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-decisions.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-evidence.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-finance.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-forms.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-imports.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-journeys.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-outcomes.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-people.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-publishing.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-reports.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-stage-rules.ts (93%)
 rename apps/api/prisma/{ => seeds}/local-demo-stages.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-target.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-demo-util.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-load-seed.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-load-seed.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-synthetic-seed.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/local-synthetic-seed.ts (99%)
 rename apps/api/prisma/{ => seeds}/seed.test.ts (100%)
 rename apps/api/prisma/{ => seeds}/seed.ts (100%)
 72 files changed, 111 insertions(+), 111 deletions(-)
     56 R
```



---

### Task 6: Wire the tooling tests into CI

**Files:**
- Create (gitignored): `.tmp/w1/task6-edits.json`, `ci-pester-step.ps1` (extracted from the workflow by the check)
- Modify: `.github/workflows/ci.yml` (a new `tooling` job), `package.json` (the `test:scripts` script)

MOD-20 found tests that no gate runs. Task 0 ran them: the node tests of `scripts/db` (164 tests, two skipped by their own environment gate), the security adapter output check (24 tests, 12 skipped for the same reason), the Python migration checks (13 tests) and two of the five Pester files (`replay-port`, `replay-timing`; five tests) all pass, and none needs a database. A new `tooling` job runs them on every push and pull request. `test:scripts` is the one definition of the two node commands: the job calls it, and so does a developer. The job installs nothing: the node tests use Node built-ins only, which Step 2 proves on an export of the tracked files without `node_modules`.

- [ ] **Step 1: Add the job and the script**

Create `.tmp/w1/task6-edits.json`:

```json
[
 [
  ".github/workflows/ci.yml",
  "  sad:\n    name: Automated SAD checks",
  "  tooling:\n    name: Tooling tests (database scripts, adapter output, migration checks, replay helpers)\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22\n\n      - name: Test database scripts and the security adapter output check\n        run: npm run test:scripts\n\n      - name: Test migration comparison scripts\n        run: python3 -m unittest discover -s scripts/migrations -p \"test_*.py\"\n\n      - name: Test replay helper scripts\n        shell: pwsh\n        run: |\n          if (-not (Get-Module -ListAvailable Pester | Where-Object { $_.Version -ge [version]'5.0' })) { Install-Module Pester -MinimumVersion 5.0 -Scope CurrentUser -Force }\n          Import-Module Pester -MinimumVersion 5.0\n          $config = New-PesterConfiguration\n          $config.Run.Path = 'infra/supabase/replay/replay-port.Tests.ps1', 'infra/supabase/replay/replay-timing.Tests.ps1'\n          $config.Run.Exit = $true\n          Invoke-Pester -Configuration $config\n\n  sad:\n    name: Automated SAD checks",
  1
 ],
 [
  "package.json",
  "    \"test\": \"pnpm -r --if-present run test\",\n",
  "    \"test\": \"pnpm -r --if-present run test\",\n    \"test:scripts\": \"node --test \\\"scripts/db/**/*.test.mjs\\\" infra/supabase/security-adapter/runtime-output.test.mjs\",\n",
  1
 ]
]
```

```bash
node .tmp/w1/replace-exact.mjs .tmp/w1/task6-edits.json
git diff --stat | tail -3
python3 - <<'PY'
import yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
print('jobs', list(d['jobs']))
print('tooling steps', [s['name'] for s in d['jobs']['tooling']['steps']])
step = [s for s in d['jobs']['tooling']['steps'] if s.get('shell') == 'pwsh'][0]
open('.tmp/w1/ci-pester-step.ps1', 'w').write(step['run'])
PY
grep -n "test:scripts" package.json
grep -n "infra/supabase/" .github/workflows/ci.yml
```

Expected: two replacements, a workflow with the jobs `validate`, `tooling` and `sad`, the five steps of the new job, the script, and the three infra paths of the workflow (the replay step and the two Pester files, all with the new folder name):

```
2 replacements in 2 files
 .github/workflows/ci.yml | 30 ++++++++++++++++++++++++++++++
 package.json             |  1 +
 2 files changed, 31 insertions(+)
jobs ['validate', 'tooling', 'sad']
tooling steps ['Checkout', 'Setup Node.js', 'Test database scripts and the security adapter output check', 'Test migration comparison scripts', 'Test replay helper scripts']
16:    "test:scripts": "node --test \"scripts/db/**/*.test.mjs\" infra/supabase/security-adapter/runtime-output.test.mjs",
58:        run: ./infra/supabase/replay/Replay-Local.ps1 -MigrationBaseline -PostgresBin /usr/lib/postgresql/18/bin
106:          $config.Run.Path = 'infra/supabase/replay/replay-port.Tests.ps1', 'infra/supabase/replay/replay-timing.Tests.ps1'
```

The workflow parses as YAML (`python3` with `yaml`; where the module is missing, run `node -e` over a YAML library already in `node_modules`, or record "pending CI").

- [ ] **Step 2: Run the job's commands on a clean export**

The export holds the tracked files of the working tree and no `node_modules`, so a dependency that the tests need would fail here as it would in the job. The Pester step is the text extracted from the workflow, run as it is.

```bash
E=.tmp/w1/export
rm -rf $E && mkdir -p $E
git ls-files -z | tar --null -T - -cf - | tar -xf - -C $E
ls $E | head -3 | tr '\n' ' '; echo
test -d $E/node_modules && echo "node_modules present" || echo "no node_modules"
(cd $E && npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)")
(cd $E && python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -3)
(cd $E && pwsh -NoProfile -File ../ci-pester-step.ps1 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests Passed")
rm -rf $E
git status --short
```

Expected: the export holds no `node_modules`, the node suites run 188 tests (174 pass, 14 skipped by their environment gates), the Python suite runs 13 tests and the Pester step extracted from the workflow passes 5 tests:

```
AGENTS.md BRAND.md CLAUDE.md 
no node_modules
# tests 188
# pass 174
# fail 0
# skipped 14
Ran 13 tests in <ms>

OK
 M .github/workflows/ci.yml
 M package.json
```

With Pester 5 the Pester step prints `Tests Passed: 5, Failed: 0, Skipped: 0, Inconclusive: 0, NotRun: 0` after `OK`. Where `pwsh` or Pester 5 is missing (as in the replay container, where Pester could not be installed) the Pester lines do not print and the step is "pending local run". `git status --short` lists only the two edited files.

Where `pwsh` or Pester 5 is missing the last command is "pending local run"; the job installs Pester 5 itself when the runner image lacks it, which cannot be tried without access to the PowerShell Gallery.

- [ ] **Step 3: Commit**

```bash
pnpm exec biome check package.json 2>&1 | tail -1
git add .github/workflows/ci.yml package.json
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "ci: run the database script, adapter output, migration and replay helper tests

A new tooling job runs the node tests of scripts/db and the security adapter output check (through the test:scripts script), the Python migration checks and the two Pester files that need no database. Three Pester files that need a saved replay cluster stay local runs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -3
```

Expected: Biome has nothing to fix, and the commit holds two files:

```
Checked 1 file in <ms>. No fixes applied.
[claude/modularization-s8b-xjnlzt <sha>] ci: run the database script, adapter output, migration and replay helper tests
 2 files changed, 31 insertions(+)
 .github/workflows/ci.yml | 30 ++++++++++++++++++++++++++++++
 package.json             |  1 +
 2 files changed, 31 insertions(+)
```



---

### Task 7: Records

**Files:**
- Create (gitignored): `.tmp/w1/task7-edits.json`, `cr-w1.md`, `activity-w1.md`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.5, 3.7 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-19, MOD-20 and MOD-21 rows), `docs/qad-pathways.md` (commands table and the CI sentence), `docs/index.md` (CR row), `docs/activity-log.md`

No SAD routing change is needed beyond the three renamed globs of Task 4 (ruling 12). The living docs that name a moved path were rewritten by the movers in Tasks 3 to 5: the runbooks, the QAD command table, the SAD routing table, the deferred feature rows and the READMEs. AGENTS.md is materialized from `docs/build-pathways.md`, which names none of the moved paths, so it needs no edit (ruling 10); Step 1 proves it.

- [ ] **Step 1: Amend the change record, the audit rows, the QAD table and the index**

`@DATE@` is replaced by the day Task 7 runs. The five edits are exact replacements (the suffix list of section 3.5, the W1 row of section 3.7, the QAD table row and CI sentence, and the status of the change record row in the index); if an earlier slice changed one of those lines, the command stops with the line it could not find: report NEEDS_CONTEXT, do not edit around it.

Create `.tmp/w1/task7-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "- Allowed suffixes: `.module`, `.controller`, `.service`, `.mapper`, `.helpers` (api);",
  "- Allowed suffixes: `.module`, `.controller`, `.service`, `.mapper`, `.helpers`, `.harness` (api; a harness holds the fixtures and helpers that the test files of one source share, and `tsconfig.build.json` excludes it, amended @DATE@ for W1);",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "unrun tests wired into CI or retired, path aliases in one place, `docs/check.py` split, seed scripts into `prisma/seeds/`, SDD, runbook, AGENTS.md and README paths updated |",
  "unrun tests wired into CI or retired, seed scripts into `prisma/seeds/` (flat), SDD, runbook and README paths updated, and the deferrals of the cloud runs (W1 split into W1 and W2 on @DATE@, section 9) |\n| W2 | Tooling follow-up | the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split and the splits of the largest tests; the per-domain seed data splits are left to the developer |",
  1
 ],
 [
  "docs/qad-pathways.md",
  "| `pnpm sad:test`, `pnpm sad:typecheck`, `pnpm sad:check` | SAD checker |",
  "| `pnpm test:scripts` | node tests of `scripts/db` and the security adapter output check (the `tooling` CI job also runs the Python migration checks and two Pester files) |\n| `pnpm sad:test`, `pnpm sad:typecheck`, `pnpm sad:check` | SAD checker |",
  1
 ],
 [
  "docs/qad-pathways.md",
  "plus the automated SAD checks as a separate job.",
  "plus the tooling tests (database scripts, security adapter output, migration checks and the replay helper Pester files) and the automated SAD checks as separate jobs.",
  1
 ],
 [
  "docs/index.md",
  "S8a and S8b applied |",
  "S8a, S8b and W1 applied, W2 next |",
  1
 ]
]
```

The section 9 paragraph is appended at the end of the change record, after the paragraph of the last slice:

Create `.tmp/w1/cr-w1.md`:

```md

W1 applied @DATE@ on `claude/modularization-s8b-xjnlzt` (W1 stacks on the S8b slice branch):
- Deferrals of earlier slices: `ParticipantsService` lost its unused `PrismaService` parameter, the eight `Prisma.TransactionClient` annotations of the imports and metadata test harnesses became `Tx`, the two demo seed literal unions follow `OverdueExplanationCategory` and `ReportKindCode`, the C2/C4 and survey subject web tests became `lib/api/scoped-endpoints.test.ts` and `lib/api/beneficiaries.survey-subject.test.ts`, and the dead `pathways-client` mock factory left `beneficiary-detail-loader.test.tsx`.
- Analytics test: `analytics.service.test.ts` (1514 lines) became `analytics.service.harness.ts` and three test files by concern (read and export, survey and timeline, aggregate-only roles); every line and all 59 test titles are kept, `tsconfig.build.json` excludes `*.harness.ts` and section 3.5 lists `.harness`.
- Scripts: the 34 files of `scripts/db` moved into `local/` (6), `hosted/` (9) and `defense/` (19) without the group prefix; `hosted-build.mjs`, `hosted-seed.mjs`, `defense-demo.mjs` and `defense-snapshot.mjs` stay at the old path as forwarders for the Windows PowerShell workflows and the runbooks outside the repository.
- Replay: `infra/supabase/phase6` is `infra/supabase/replay` (58 files, all pure renames, so `Verify-Forward.ps1` keeps the hash it records); the CI replay step, the SAD globs and the path joins of `scripts/db` follow, and `Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1` and `Test-SchemaDrift.ps1` stay at the old path as forwarders. The internal names (`$phase6*` variables, the database `pathways_phase4_phase6_replay`, `PATHWAYS_PHASE6_REPLAY_MIGRATIONS`, `.tmp/pathways-phase6-*`) stay, because the CI environment, the runtime SQL guards and the legacy retirement SQL name them.
- Seeds: 56 files (46 scripts, 6 demo photos, 4 import fixtures) moved flat into `apps/api/prisma/seeds`; `schema.prisma`, `migrations/`, `history/`, `tests/`, `check-connection.ts`, the legacy retirement files and the authorization bootstrap runner stay in `prisma`. The seed files import each other in a cycle across local, defense and hosted, so the `seeds/{local,defense,hosted}` subfolders of MOD-21 are not made.
- Tests in CI: a `tooling` job runs `npm run test:scripts`, the Python migration checks and the `replay-port` and `replay-timing` Pester files. Nothing is retired: `test_catalogs.py` checks the immutable archive of 27 migrations, which is its subject. `Invoke-RuntimeSql`, `Invoke-RuntimeVitest` and `Test-SchemaDrift` Pester files need a saved replay cluster and a non-root `initdb`, so they stay local runs.
- Docs: the living docs (runbooks, QAD, SAD, deferred features, READMEs) follow every moved path by script; the history files (this record, the audits, the activity log, the handoff and superpowers documents, the migrations) keep the paths they were written with. AGENTS.md is generated from `docs/build-pathways.md`, which names none of the moved paths.
- Decisions: W1 split into W1 and W2 (ruling 1); the seeds are flat (ruling 5); no test is retired (ruling 6); only the analytics service test is split and the other tests above 600 lines stay (ruling 7).

Deferred to W2: `authorized-read-events.ts` and `source-mutation.ts` (with its test) from `lib/services` to `lib/api/core` and the scan for retiring the `pathways-client.ts` shell, path aliases in one place, the `scripts/docs/check.py` split, and the splits of the test files above 600 lines. Left to the developer: the per-domain splits of `local-demo-data.ts` and `hosted-realistic-seed.ts`, whose proof is a seed run on a local database that the cloud container cannot do.
```

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g" .tmp/w1/task7-edits.json .tmp/w1/cr-w1.md
node .tmp/w1/replace-exact.mjs .tmp/w1/task7-edits.json
cat .tmp/w1/cr-w1.md >> docs/cr-pathways-codebase-modularization.md
sed -i -e '/^| MOD-19 /s/\. |$/; replay folder renamed and its four PowerShell entry points kept as forwarders by W1. |/' \
  -e '/^| MOD-20 /s/ (W1) |$/ (W1); wired into the tooling CI job by W1, three Pester files that need a saved replay cluster stay local runs. |/' \
  -e '/^| MOD-21 /s/ (W1) |$/ (W1); seed scripts moved flat into `prisma\/seeds` by W1, the per-domain data splits left to the developer. |/' \
  docs/audit-pathways-codebase-modularity-20261009.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{50} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
tail -c 400 docs/cr-pathways-codebase-modularization.md
git grep -n -E "phase6/|scripts/db/(local|hosted|defense)-|apps/api/prisma/(seed\.|local-|hosted-|defense-)" -- docs README.md AGENTS.md ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers' ':!docs/handoff*' | cut -c1-120
```

Expected: five replacements in three files, the stat of the four docs, the tails of the three extended audit rows, the index status ending in `W1 applied, W2 next`, the end of the change record, and no living doc naming an old path (the last command prints nothing):

```
5 replacements in 3 files
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 17 +++++++++++++++--
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  3 ++-
 4 files changed, 21 insertions(+), 7 deletions(-)
 PowerShell entry points kept as forwarders by W1. |
 that need a saved replay cluster stay local runs. |
 the per-domain data splits left to the developer. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S7c, S7d, S8a, S8b and W1 applied, W2 next |
ts test) from `lib/services` to `lib/api/core` and the scan for retiring the `pathways-client.ts` shell, path aliases in one place, the `scripts/docs/check.py` split, and the splits of the test files above 600 lines. Left to the developer: the per-domain splits of `local-demo-data.ts` and `hosted-realistic-seed.ts`, whose proof is a seed run on a local database that the cloud container cannot do.
```

After S8b the index row ends `S8a and S8b applied |` with no "next" (S8b's own edit made it so), so the row is an exact replacement like the others and reads `S8a, S8b and W1 applied, W2 next` after the step. A replacement that does not match means an earlier slice changed the line: report NEEDS_CONTEXT.

- [ ] **Step 2: Activity log**

`.tmp/w1/activity-w1.md` is the W1 section of the activity log, with the commit hashes of Tasks 1 to 6 as `@H1@` to `@H6@` (`B` is the second commit of a task):

Create `.tmp/w1/activity-w1.md`:

```md

## @DATE@ Modularization W1 tooling and docs (claude/modularization-s8b-xjnlzt)
- Task 1 (@H1@, @H1B@): the api part (@H1@) removed the unused `PrismaService` parameter of `ParticipantsService` and its three constructions, changed the eight `Prisma.TransactionClient` annotations of the imports and metadata test harnesses to `Tx` and made the two demo seed literal unions follow `OverdueExplanationCategory` and `ReportKindCode`; the web part (@H1B@) renamed the C2/C4 and survey subject tests to `lib/api/scoped-endpoints.test.ts` and `lib/api/beneficiaries.survey-subject.test.ts` and removed the dead `pathways-client` mock factory of `beneficiary-detail-loader.test.tsx`; all test titles are kept (`lost 0`) and the unused-local diagnostics lost the one `ParticipantsService` line.
- Task 2 (@H2@): `analytics.service.test.ts` (1514 lines) became `analytics.service.harness.ts` (350) and three test files by concern (485, 384 and 354 lines); every line is kept (`same-lines` lost 0) and all 59 test titles are the same; `tsconfig.build.json` excludes `*.harness.ts` and CR 3.5 lists `.harness`.
- Task 3 (@H3@, @H3B@): the 34 files of `scripts/db` moved into `local/`, `hosted/` and `defense/` without the group prefix (29 rewritten, 5 exact renames, 53 specifiers, 49 repo paths, 12 file names and 17 root lookups changed by script); the four hosted and defense entry points stay at the old path as forwarders (second commit).
- Task 4 (@H4@, @H4B@): `infra/supabase/phase6` renamed to `infra/supabase/replay` (58 files, all pure renames; `Verify-Forward.ps1` blob unchanged), the CI replay step, three SAD globs, three path joins of `scripts/db` and 35 repo paths follow; `Replay-Local.ps1`, `Invoke-RuntimeSql.ps1`, `Invoke-RuntimeVitest.ps1` and `Test-SchemaDrift.ps1` stay at the old path as forwarders (second commit); internal `phase6` names stay.
- Task 5 (@H5@): 56 seed files (46 scripts, 6 demo photos, 4 import fixtures) moved flat into `apps/api/prisma/seeds`; the seed command of `prisma.config.ts`, the specifiers, three root lookups, the e2e imports and the docs follow, and `prisma db seed` with a dummy `DIRECT_URL` still runs `seed.ts`.
- Task 6 (@H6@): a `tooling` CI job runs `npm run test:scripts` (the node tests of `scripts/db` and the security adapter output check), the Python migration checks and the `replay-port` and `replay-timing` Pester files; no test was retired; the three Pester files that need a saved replay cluster stay local runs.
- Task 7: the change record (section 3.5 `.harness`, section 3.7 W1 and W2 rows, section 9 W1 disposition), the audit rows MOD-19, MOD-20 and MOD-21, the QAD commands table and the index row follow the slice; no SAD routing change beyond the three renamed globs.
- Decisions: the W1 decisions are recorded in the change record section 9; the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge.
- Deferred to W2: the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split and the largest test splits; left to the developer: the per-domain seed data splits.
```

```bash
D=$(date +%F)
H1=$(git log -1 --format=%h --grep='^refactor(api): drop the unused PrismaService')
H1B=$(git log -1 --format=%h --grep='^test(web): name the client contract tests')
H2=$(git log -1 --format=%h --grep='^test(api): split the analytics service test')
H3=$(git log -1 --format=%h --grep='^refactor(scripts): group the database scripts')
H3B=$(git log -1 --format=%h --grep='^refactor(scripts): keep the old hosted')
H4=$(git log -1 --format=%h --grep='^refactor(infra): rename the replay folder')
H4B=$(git log -1 --format=%h --grep='^refactor(infra): keep the four replay')
H5=$(git log -1 --format=%h --grep='^refactor(api): move the seed scripts')
H6=$(git log -1 --format=%h --grep='^ci: run the database script')
sed -i -e "s/@DATE@/$D/" -e "s/@H1@/$H1/g" -e "s/@H1B@/$H1B/g" -e "s/@H2@/$H2/" -e "s/@H3@/$H3/" -e "s/@H3B@/$H3B/" -e "s/@H4@/$H4/" -e "s/@H4B@/$H4B/" -e "s/@H5@/$H5/" -e "s/@H6@/$H6/" .tmp/w1/activity-w1.md
grep -c "@H[0-9B]*@\|@DATE@" .tmp/w1/activity-w1.md
cat .tmp/w1/activity-w1.md >> docs/activity-log.md
tail -12 docs/activity-log.md | cut -c1-90
```

Expected: no placeholder is left and the new section ends the log (lines cut at 90 characters; the hashes differ):

```
0
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 885, impo

## <date> Modularization W1 tooling and docs (claude/modularization-s8b-xjnlzt)
- Task 1 (<sha>, <sha>): the api part (<sha>) removed the unused `PrismaService` 
- Task 2 (<sha>): `analytics.service.test.ts` (1514 lines) became `analytics.service.ha
- Task 3 (<sha>, <sha>): the 34 files of `scripts/db` moved into `local/`, `hosted/`
- Task 4 (<sha>, <sha>): `infra/supabase/phase6` renamed to `infra/supabase/replay` 
- Task 5 (<sha>): 56 seed files (46 scripts, 6 demo photos, 4 import fixtures) moved fl
- Task 6 (<sha>): a `tooling` CI job runs `npm run test:scripts` (the node tests of `sc
- Task 7: the change record (section 3.5 `.harness`, section 3.7 W1 and W2 rows, section 9
- Decisions: the W1 decisions are recorded in the change record section 9; the plan copy i
- Deferred to W2: the `lib/services` residue, path aliases in one place, the `scripts/docs
```

- [ ] **Step 3: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record modularization W1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git show --stat --oneline HEAD | tail -7
```

Expected: the docs check at 0 failures and 0 warnings, lint clean, and a commit of five files:

```
$ python scripts/docs/check.py docs

0 failure(s), 0 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
Checked 1633 files in <ms>. No fixes applied.
[claude/modularization-s8b-xjnlzt <sha>] docs: record modularization W1
 5 files changed, 32 insertions(+), 7 deletions(-)
<sha> docs: record modularization W1
 docs/activity-log.md                                | 11 +++++++++++
 docs/audit-pathways-codebase-modularity-20261009.md |  6 +++---
 docs/cr-pathways-codebase-modularization.md         | 17 +++++++++++++++--
 docs/index.md                                       |  2 +-
 docs/qad-pathways.md                                |  3 ++-
 5 files changed, 32 insertions(+), 7 deletions(-)
```



---

### Task 8: Full release gates

**Files:** none (the activity log gets one line).

The gates run on the final head of the slice. The database replay is not run here: it needs a non-root `initdb`, and the CI replay of the part 3 pull request (`./infra/supabase/replay/Replay-Local.ps1 -MigrationBaseline`, its PASS lines and no FAIL line) is its gate. W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run.

- [ ] **Step 1: Lint, typecheck, tests, docs check and the unused-local diagnostics**

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "typecheck: (Done|Failed)" | sort
git checkout -- apps/web/next-env.d.ts
bash .tmp/w1/suite.sh final
pnpm docs:check 2>&1 | tail -3
bash .tmp/w1/unused.sh final
diff <(sed 's#prisma/seeds/#prisma/#' .tmp/w1/unused-final.txt) .tmp/w1/unused-base.txt
git status --short
```

Expected: lint has nothing to fix, the five typechecks are clean, every test count equals its baseline (the api suite has two test files more, the analytics split), the docs check keeps its 0 failures and 0 warnings, and the unused-local diagnostics equal the baseline minus the one `ParticipantsService` line (the `diff` shows that single removed line, `>` is the baseline):

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
api: prisma/seeds/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
web: src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but its value is never read.
web: src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
lines 3
1a2
> api: src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its value is never read.
```

- [ ] **Step 2: Build, SAD check and tooling tests**

```bash
rm -rf apps/web/.next apps/api/dist
(pnpm --filter "@pathways/api^..." run build && pnpm --filter @pathways/api exec nest build && pnpm --filter @pathways/web build) > .tmp/w1/build-final.log 2>&1; echo "build exit $?"
grep -aE "Middleware" .tmp/w1/build-final.log | head -1 > .tmp/w1/middleware-final.txt
cmp .tmp/w1/middleware-base.txt .tmp/w1/middleware-final.txt && echo "Middleware equals M0"
git checkout -- apps/web/next-env.d.ts
find apps/api/dist -name '*.js' | grep -c "prisma/"
find apps/api/dist -name '*.js' | grep -c "harness"
pnpm sad:check --base "$(cat .tmp/w1/base-sha)" --head HEAD --output .tmp/w1/sad.json > .tmp/w1/sad.log 2>&1; echo "sad exit $?"
grep -o '"status": "[A-Z_]*"' .tmp/w1/sad.log | sort | uniq -c
npm run test:scripts 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m unittest discover -s scripts/migrations -p "test_*.py" 2>&1 | tail -3
for f in replay-port replay-timing; do pwsh -NoProfile -File .tmp/w1/pester.ps1 -Path infra/supabase/replay/$f.Tests.ps1 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests Passed"; done
git status --short
```

Expected: the build succeeds with the Middleware size of Task 0, the production build has the same number of prisma files as the baseline and no harness file, the SAD check exits 0 with every evaluation `PASS` (the number of notes depends on the range: they are review notes for SQL files that moved), and the tooling tests pass, and with Pester 5 the two Pester files pass too (two more lines, `Tests Passed: 2...` and `Passed: 3`, which the replay container could not print):

```
build exit 0
Middleware equals M0
44
0
sad exit 0
     67 "status": "PASS"
# tests 188
# pass 174
# fail 0
# skipped 14
Ran 13 tests in <ms>

OK
```

- [ ] **Step 3: Prove every rename and every stale reference**

The three rule files run again against the final tree: no tracked or untracked file outside the history files names an old path, an old file name or a quoted old folder name (the replay README sentence about the forwarders is the one allowed mention). The rename count is taken over the whole slice: 150 files moved (34, 58, 56 and the two web tests), and git reports the 8 whose old path is a forwarder now as a modified and an added file, which leaves 142 renames; the one deleted file is the split analytics test, and the listing of old paths that still exist is exactly the 8 forwarders.

```bash
node .tmp/w1/stale-paths.mjs .tmp/w1/db-rules.json .tmp/w1/db-moves.json | tail -1
node .tmp/w1/stale-paths.mjs .tmp/w1/replay-rules.json .tmp/w1/replay-moves.json --allow infra/supabase/replay/README.md | tail -1
node .tmp/w1/stale-paths.mjs .tmp/w1/seeds-rules.json .tmp/w1/seeds-moves.json | tail -1
git diff -M --diff-filter=R --name-status "$(cat .tmp/w1/base-sha)" HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c
git diff -M --diff-filter=R --name-status "$(cat .tmp/w1/base-sha)" HEAD | awk '$1 != "R100"' | wc -l
git diff --diff-filter=D --name-only "$(cat .tmp/w1/base-sha)" HEAD
git ls-files scripts/db infra/supabase/phase6 | grep -E "^(scripts/db/[a-z]+-[a-z-]+\.mjs|infra/supabase/phase6/)" 
git log --oneline "$(cat .tmp/w1/base-sha)"..HEAD | wc -l
git status --short | wc -l
```

Expected: three scans with `stale 0`, 142 renames over the slice, the count of renames that changed a path (the figure may differ by files S5c to S8b touch), the one deleted file, the eight forwarders, 11 commits of the slice so far (the plan copy and Tasks 1 to 7; the gates line is the twelfth) and a clean tree:

```
stale 0
stale 0
stale 0
    142 R
41
apps/api/src/modules/analytics/analytics.service.test.ts
infra/supabase/phase6/Invoke-RuntimeSql.ps1
infra/supabase/phase6/Invoke-RuntimeVitest.ps1
infra/supabase/phase6/Replay-Local.ps1
infra/supabase/phase6/Test-SchemaDrift.ps1
scripts/db/defense-demo.mjs
scripts/db/defense-snapshot.mjs
scripts/db/hosted-build.mjs
scripts/db/hosted-seed.mjs
11
0
```

The files that are not `R100` are the moved files that follow a path (a specifier, a repo path or a root lookup); `moved-report.mjs` in Tasks 3 to 5 proved each one of them as a path-only change.

- [ ] **Step 4: Record the gates**

```bash
H=$(git rev-parse --short HEAD)
D=$(date +%F)
F=$(sed 's/\x1b\[[0-9;]*m//g' .tmp/w1/test-final.log | grep -E "^(apps|packages)/[a-z]+ test: +Tests " | sed -E 's#^[a-z]+/([a-z]+) test: +Tests +([0-9]+) passed.*#\1 \2#' | paste -sd, | sed 's/,/, /g')
printf -- '- Gates (%s, cloud container, head %s): lint, typecheck and tests pass with %s (api has two test files more than the baseline, the analytics split); docs check 0 failures and 0 warnings; production build exit 0 with Middleware unchanged and no harness in the api dist; SAD check exit 0 with no BLOCKED evaluation; the replay is the gate of the part 3 pull request in CI (W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2), and the seeds, dev servers, e2e, the browser smoke and the Windows PowerShell forwarders are a pending local run.\n' "$D" "$H" "$F" >> docs/activity-log.md
tail -2 docs/activity-log.md | cut -c1-120
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -m "docs: record the W1 gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPvEwEhu9YUbjKLd7DLzUg"
git status --short | wc -l
```

Expected: the gates line is appended and committed (the line is cut at 120 characters), and the tree is clean:

```
- Deferred to W2: the `lib/services` residue, path aliases in one place, the `scripts/docs/check.py` split and the large
- Gates (<date>, cloud container, head <sha>): lint, typecheck and tests pass with config 19, shared 885, imports
[claude/modularization-s8b-xjnlzt <sha>] docs: record the W1 gates
 1 file changed, 1 insertion(+)
0
```

No pull request is opened and no branch is pushed by the slice: the controller pushes the slice branch. W1 opens no pull request, and the controller opens the part 3 stacked pull request into `dev` after W2.



---

## W2 outline (tooling follow-up, its own slice branch)

W2 takes the items of the W1 roadmap row that need a design decision, in the order below; the item that needs a local database (5) is left to the developer. It is planned after W1 is implemented, from the tree as W1 leaves it (ruling 11). Each item below becomes a task of the W2 plan with the same shape as the tasks above: a recount, a proof by script, a commit.

1. **Task 0: baseline and recount.** The same baseline as W1 Task 0, plus the recount of the `lib/services` files, the alias declarations and the test files above 600 lines.
2. **`lib/services` residue.** `authorized-read-events.ts` and `source-mutation.ts` (with `source-mutation.test.ts`) move to `lib/api/core`, and the importers follow by the W1 mover (`move-paths.mjs` with a rule file). Then the scan that CR section 9 left open runs: if no member of `pathways-client.ts` has a production caller, the shell is retired; otherwise its remaining members are named. The renamed test of W1 Task 1 imports `../services/source-mutation`, which the mover rewrites.
3. **Path aliases in one place.** The api (`@app/*`, `@pathways/*`) and web (`@/*`, `@pathways/*`) aliases are declared in `tsconfig.base.json`, the two package tsconfigs, `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` and `scripts/sad/vitest.config.ts`. The design is one declaration (the tsconfig `paths`) and a ten line helper in `packages/config` that the vitest configs call to build their `resolve.alias`, with no new dependency (the repository rule is no external library unless necessary, so `vite-tsconfig-paths` is not used); a test per config proves the alias lists equal the tsconfig `paths`.
4. **`scripts/docs/check.py` split.** The 1060 line Python tool splits by check (`agents`, `voice`, `scrutiny`, `inception`, `trace`, `coverage`, `currency`, `filing`, project specific) into a package with the same command line, the same exit codes and the same six baseline failures and one warning; the proof is the output of `pnpm docs:check` before and after on the same tree, byte for byte, plus a new `unittest` file wired into the `tooling` job.
5. **Per-domain seed data (MOD-21, the data part), left to the developer and not planned as a W2 task.** `local-demo-data.ts` (2000 lines of fixtures) and the 526 line `main()` of `hosted-realistic-seed.ts` with its duplicated name lists split by domain inside `prisma/seeds`. This changes no seed content, but it needs a seed run on a local database to prove it (a row count and checksum per table before and after), so the developer runs it where `pnpm db:local:reset` and `pnpm db:local:seed` run.
6. **Large test files.** The test files above 600 lines that W1 Task 0 lists (the analytics service test is split by W1 Task 2) get the split of W1 Task 2 where they have shared fixtures, each with a line and title proof.
7. **Records and gates.** The change record, the audit rows (MOD-17, MOD-21), the index and the activity log; the same release gates as W1 Task 8.
