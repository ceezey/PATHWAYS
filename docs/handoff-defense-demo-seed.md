# Handoff: defense demo seed

Paused 2026-10-04 23:55 (UTC+8) to move work to a cloud session.

## Where things are
- Branch: `feature/defense-demo-seed`, all work committed (head `942163ce`).
- Runbook: `docs/runbook-defense-demo.md`.
- Last local result: clean wipe plus full seed run passed (exit 0, no failed stages); the `--verify` pass was being reviewed when paused.

## Debug issues from the last round
1. `decisions` stage 503 on accepting the WSH bottleneck recommendation: fixed in `385909d9` and `39a03802`.
2. CRL follow-up >= 25% and WSH survey improvement < 20 alerts not firing: both fire on a clean run; no fix needed.
3. Journey notes "added: 0" on rerun: fixed in `942163ce`.
4. `reports` stage 409 on rerun: fixed in `942163ce`.
5. `node scripts/db/defense-demo.mjs --test-local --verify`: fixed. Four checks read forced-RLS tables as the owner and now run as staff; escalation reads the decision audit trail; the Lavezares import now uses validation-level faults. Clean run: 23 of 23.

## Next steps
- Merged into `dev`. Hosted run per the runbook (user only).
- Open product note: registration rule failures during import promotion are retried as transient (see activity log).

## Constraints
- No migrations, no API service edits unless a genuine product bug (report it instead). Never disable triggers in the seed; the one exception is the snapshot restore step, which skips them with `SET LOCAL session_replication_role = replica` inside a single transaction (`cr-pathways-defense-seed-snapshot`).
- Local run needs the Supabase stack at 0060 (`supabase_db_pathways`, port 54322); a full run takes about 18 min.
- The hosted devV2 run and `.tmp/defense-seed.env` belong to the user; no credentials in the repo or chat.
