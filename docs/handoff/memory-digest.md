# Memory digest for the cloud session

Date: 2026-10-13, state updated 2026-10-19. The local Claude Code sessions kept these facts in a per-machine memory folder that a cloud session cannot read. This file carries the ones the modularization still needs. Each line is a standing rule or a known fact; the reason follows where it matters.

## Identity and pushing

- Push and merge as the GitHub account `ceezey` (the developer). This is an identity rule, not a push approval.
- Pushing `dev` needs the developer's word each time, because every `dev` push deploys on Vercel and the plan has limited builds. Batch work and ask.
- Master is pushed only by the release integrator after every release gate passes; migrations and conflicts still stop for the developer.
- Coworker GitHub logins: Mika is `kaeliber`.

## Working rules from the developer

- Questions the developer asks are read-only: answer without edits and offer the change instead.
- Run independent work in parallel (reviews, SAD roles, scans, planning); the developer opted in to the Workflow tool on 2026-10-12. Implementers stay one at a time on one branch.
- Implementers, reviewers, scans and planners use Sonnet; SAD specialists keep the models in `.claude/agents/`.
- Hand subagents file paths, not pasted content, and ask for replies under 15 lines.
- Append-only doc conflicts (`docs/activity-log.md`, `docs/index.md`): keep both sides. Code conflicts stop.
- Before any hosted database restore, ask the developer to confirm `RULES_DISPATCH_ENABLED=false`; never assume it.
- Every deferred or hidden feature is tracked in `docs/deferred-features.md`.
- Demo and presentation deliverables get no spec, no commit and no log entry.
- Seeds must be realistic: consistent per person, branching journeys, real-looking photos, prerequisite order.

## Modularization state

- Change record `docs/cr-pathways-codebase-modularization.md` (3.7 roadmap, section 9 per unit); audit `docs/audit-pathways-codebase-modularity-20261009.md`.
- Done: every unit F1 to W2 is merged into `dev` (part 1 PR #52, part 2 PR #53, part 3 PR #54 as `8324951c` on 2026-10-19); see `docs/activity-log.md` for each gate line.
- The executed plan copies under `docs/superpowers/plans/` are retired; the plans in this folder stay as the record and their index rows say Closed.
- Left to the developer: the per-domain seed data splits, and the pending local gates of part 3 (demo and defense seeds, dev servers, both e2e suites, browser smoke, compiled API boot, Pester and the Windows PowerShell forwarders).
- Every ruling is in `modularization-rulings-log.md` with its cost if wrong.

## Baselines after W2

- Tests: config 19, shared 885, imports 94, api 2642 (21 skipped), web 3478, sad 60, docs check tests 47; docs check 0 failures and 0 warnings; web Middleware 103 kB, 72 routes.
- CI runs the DB replay, secret scan, lint, typecheck, tests and build (`validate`), the node, Python and Pester tooling tests (`tooling`) and the SAD checks (`sad`) on every pull request.
- E2E main suite has 9 known failures (MFA verify helper, password login harness, workflows seed end date before start); compare against them, not against zero. Auth navigation suite is 27 of 27.
- Route sizes: plan figures come from builds with `.env.example` and shift by about 1 kB; stop only if a route grows by more than 2 kB or Middleware changes. Always `rm -rf apps/web/.next` before a comparison build.

## Pitfalls

- Known flakes: the ZodPipe 5 s test, `beneficiary-detail-loader.test.tsx`, the collection workspace timeouts, the imports service duplicate metadata keys and one `sad:test` case; rerun the file alone before treating as real.
- The CI secret scan matches any database URL or Supabase key variable followed by an equals sign and a value, placeholders included; write dummy URLs in docs as prose.
- The demo seed survey report (SQL `pathways.p34_survey_report`) times out intermittently; it predates the refactor. Rerun once; if it still fails and the slice touches no API or SQL code, proceed and record a ruling.
- The first demo seed right after a replay tends to hit P2028; wait about five minutes.
- Biome 1.9 does not flag unused imports and counts JSDoc mentions as uses; prune imports by hand.
- Vitest (esbuild) emits no decorator metadata, so class-validator DTO routes cannot be exercised over HTTP in api tests.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before each commit.
- After rebasing across `schema.prisma`, regenerate the Prisma client or replays fail with a misleading 403.
- SAD specialists cannot write files: the controller transcribes their PASS or BLOCKED lines into reply files.

## Open items for the developer

- The slow survey report in the seed.
- S1b removed review workspace code no route renders (the developer may veto).
- S1b and S2b route size notes in the change record.
- A manual click-through of the projects, activities and indicators screens; browser smoke was replaced by e2e plus a route compile check.
