# Memory digest for the cloud session

Date: 2026-10-13. The local Claude Code sessions kept these facts in a per-machine memory folder that a cloud session cannot read. This file carries the ones the modularization still needs. Each line is a standing rule or a known fact; the reason follows where it matters.

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
- Merged into `dev`: F1, F2, F3a, F3b, F4a, F4b, S1a, S2a, S1b, S2b, the assignment cutoff clock fix and S3a (see `docs/activity-log.md` for each merge hash and gate line).
- S3a pending local gates: the defense seed, a full demo seed and both e2e suites (stopped for the cloud move on 2026-10-13).
- Next: S3b (`docs/handoff/modularization-s3b-indicators-web.md`, full plan, dry run green, no pre-flight scan yet), then S4 to S8 (full plans in this folder, cross-plan edits in `cross-plan-review.md`).
- Rulings so far are in `modularization-rulings-log.md`; the final report lists every ruling with its cost if wrong.

## Baselines after S3a

- Tests: config 19, shared 281, imports 91, api 2445 (21 skipped), web 1983, sad 54; docs check 6 known failures; web Middleware 102 kB.
- E2E main suite has 9 known failures (MFA verify helper, password login harness, workflows seed end date before start); compare against them, not against zero. Auth navigation suite is 27 of 27.
- Route sizes: plan figures come from builds with `.env.example` and shift by about 1 kB; stop only if a route grows by more than 2 kB or Middleware changes. Always `rm -rf apps/web/.next` before a comparison build.

## Pitfalls

- Known flakes: the ZodPipe 5 s test and `beneficiary-detail-loader.test.tsx` under load; rerun alone before treating as real.
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
