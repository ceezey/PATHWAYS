# Handoff: defense demo seed

Paused 2026-10-04 23:55 (UTC+8) to move work to a cloud session.

## Where things are
- Branch: `feature/defense-demo-seed`, all work committed (head `942163ce`).
- Runbook: `docs/runbook-defense-demo.md`.
- Last local result: clean wipe plus full seed run passed (exit 0, no failed stages); the `--verify` pass was being reviewed when paused.

## Debug issues from the last round
1. `decisions` stage 503 on accepting the WSH bottleneck recommendation: fixed in `385909d9` and `39a03802`.
2. CRL follow-up >= 25% and WSH survey improvement < 20 alerts not firing: rules confirmed ACTIVE; metric check was in progress, no fix committed. Confirm after the clean run.
3. Journey notes "added: 0" on rerun: fixed in `942163ce`.
4. `reports` stage 409 on rerun: fixed in `942163ce`.
5. `node scripts/db/defense-demo.mjs --test-local --verify`: in review. Checks under inspection in `apps/api/prisma/defense-demo-verify.ts`: pending proof, library entries, derived indicator, public publication, partially processed import, escalated alert.

## Next steps
- Rerun `--verify`, fix seed-side failures (or a wrong check in the verifier), and confirm issue 2.
- Verify: `pnpm typecheck` in apps/api; vitest `prisma/local-demo-data.test.ts prisma/defense-demo-stage.test.ts prisma/defense-demo-seed.test.ts`.
- Then merge into `dev` locally and wait for the user's go-ahead to push.

## Constraints
- No migrations, no API service edits unless a genuine product bug (report it instead), never disable triggers.
- Local run needs the Supabase stack at 0060 (`supabase_db_pathways`, port 54322); a full run takes about 18 min.
- The hosted devV2 run and `.tmp/defense-seed.env` belong to the user; no credentials in the repo or chat.
