# Handoff: PATHWAYS codebase modularization in Claude Code on the web (complete)

The modularization finished on 2026-10-19 (part 3 PR #54 merged into `dev` as `8324951c`). The prompt below is kept as the record of how the cloud run worked; reuse it only for follow-up slices. Paste the section below into a new Claude Code session at claude.ai/code (Chrome), on repository `ceezey/PATHWAYS`, starting from branch `dev`.

## Prompt

Continue the PATHWAYS codebase modularization. It is a behavior-preserving refactor that runs autonomously under my standing instructions: subagent-driven development, one implementer at a time, parallel read-only work (reviews, SAD roles, scans, planning), Sonnet for implementers, reviewers, scans and planners, and SAD specialists on the models in `.claude/agents/`. Stop only for irreversible, destructive or security-sensitive actions, a merge or push to `dev` or `master`, or a gate you cannot run. Otherwise make the call, log it as a ruling, and keep going.

### Read first

1. `docs/handoff/memory-digest.md`: my standing rules, baselines and pitfalls. The local memory does not reach this environment, so treat that file as memory.
2. `CLAUDE.md` and `docs/cr-pathways-codebase-modularization.md` (3.7 roadmap, section 9 per unit).
3. The executed plans `docs/handoff/modularization-*.md` and `docs/handoff/cross-plan-review.md`, as the pattern for a follow-up slice.
4. The section 9 dispositions of the change record, which list what each unit deferred.
5. `docs/handoff/implementer-common.md` and `docs/handoff/reviewer-common.md` (common subagent briefs).
6. `docs/handoff/modularization-rulings-log.md` (every ruling so far).

### State at handoff (2026-10-19)

- `origin/dev` holds every unit F1 to W2 (part 1 PR #52, part 2 PR #53, part 3 PR #54 merged as `8324951c`); the executed plan copies under `docs/superpowers/plans/` are retired.
- Pending local runs for the developer: the demo and defense seeds, dev servers, both e2e suites, the browser smoke, the compiled API boot, Pester and the Windows PowerShell forwarders.
- Left to the developer: the per-domain seed data splits.
- Baselines: config 19, shared 885, imports 94, api 2642 (21 skipped), web 3478, sad 60, docs check 0, web Middleware 103 kB, 72 routes, e2e main 9 known failures, auth navigation 27 of 27.

### What changed with the move to the cloud

- This is a Linux container cloned from GitHub. The Windows paths in the plans (`C:\PATHWAYS`, `/c/PATHWAYS`, `C:/Users/...`) mean the repository root here. PowerShell steps run with `pwsh` if it is installed; otherwise use the bash equivalent and say so.
- The plans refer to working files under `.tmp/handoff/` and `.superpowers/`; their committed copies now live in `docs/handoff/`. Keep scratch scripts and logs in `.tmp/` (gitignored) as the plans say.
- The superpowers SDD helper scripts may be missing. If so: a task brief is the plan text from `### Task N:` up to the next `### Task` or `## ` heading, saved to `.superpowers/sdd/<plan-name>/task-N-brief.md`; a review package is `git log --oneline BASE..HEAD`, `git diff --stat BASE..HEAD` and `git diff -U10 BASE..HEAD` in one file in the same folder.
- `.superpowers/` is gitignored and a cloud container can be reset, so the ledger may be lost. At each task boundary append the ledger's new ruling lines to `docs/handoff/modularization-rulings-log.md` (one paragraph per line, no em dashes) and commit them with the task.
- Docker and the local Supabase stack are not available. Gate mapping:
  - Static gates run here: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test`, then `git checkout -- apps/web/next-env.d.ts`; web slices run `rm -rf apps/web/.next` first and compare routes against a build measured right before the change.
  - Replay: GitHub Actions CI (`.github/workflows/ci.yml`) runs `Replay-Local.ps1 -MigrationBaseline` on PostgreSQL 18, then lint, typecheck, test, build and the SAD checks, on every pull request. Open a pull request into `dev` and treat a green CI run as the replay gate (expect 171 PASS, 0 FAIL in the log). You may also try the same steps in this container (install `postgresql-18` and `pwsh` the way ci.yml does); say which you used.
  - Seed, dev servers and e2e need the local stack. Do not fake them. Record them as "pending local run" in the ledger and the activity log gate line, and list them for me at the end of each slice; I run `pnpm db:local:reset && pnpm db:local:demo`, `pnpm dev:local` and the two Playwright configs locally.
  - SAD: `pnpm sad:check --base dev --head HEAD --output .tmp/sad/<slice>/manifest.json`, one packet per role (split above 60 paths; layout in `docs/handoff/sad-packet-example.md`, the S3a packet), dispatch all roles in parallel, transcribe their lines into `reply-<role>.txt` files beside the manifest, copy `docs/handoff/sad-assemble.mjs` there as `assemble.mjs` and run `node .tmp/sad/<slice>/assemble.mjs` (it writes `reviews.json`), then `pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/<slice>/reviews.json`.

### Branches and pushing

- Work on `refactor/<slice>` branched from the latest `origin/dev`, or from the previous slice branch while that one waits for my merge (stacked). The container is temporary, so push the slice branch at each task-pair boundary and before you stop, as `ceezey`.
- Vercel may build a preview for every pushed branch and its build quota is limited: push only at those boundaries, never after each commit.
- When a slice passes its gates here, open one pull request into `dev`, wait for CI, record the result, and ask me before merging. Do not push `dev` or `master` yourself.

### How to run a slice

1. Pre-flight scan (Sonnet, read-only, in a `git archive` copy outside the working tree). It finds real errors even after a planner's dry run. Check for expected test counts that are cumulative from Task 0 or lose deleted tests; greps that ignore existing definitions; tests that assert nothing; imports kept alive only by comments; multi-sentence comments; stale or unprefixed doc paths. Rule on each finding and have one agent apply the plan fixes.
2. Setup: copy the plan to `docs/superpowers/plans/<date>-<name>.md` (Task 0 adds its index row), create the branch, make the SDD workspace, copy the two common briefs into it, write `global-constraints.md` (project rules plus the plan's Global Constraints verbatim) and the ledger header, then dispatch Task 0.
3. Tasks: one Sonnet implementer per task with the brief, the common files and a report path. Review in pairs with a Sonnet reviewer while the next task implements, when the two touch different files. Fix rounds resume the same implementer, then a scoped re-review.
4. Final review (Sonnet), static gates and SAD run in parallel.
5. Gates, pull request, CI, then ask me to merge. After the merge: the plan's records step, the activity log gate line, remove the executed plan or mark it in the index, and update `docs/handoff/memory-digest.md` and this prompt's state section.
6. While a slice implements, pre-flight the next slice's plan in parallel. Apply each plan's cross-plan edits to the later plans in `docs/handoff/` and record them in `cross-plan-review.md`.

### Repo rules

- Markdown names are kebab-case; comments are one sentence with no emojis; docs have no em dashes and no `--` outside code.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` unless this environment's attribution rule says otherwise; follow the environment and note it once.
- No customer personal data or credentials anywhere.

### At the very end of the modularization

Write a final report with an exhaustive "Rulings I made" list and the cost if each was wrong, from `docs/handoff/modularization-rulings-log.md` plus each later slice's ledger lines.
