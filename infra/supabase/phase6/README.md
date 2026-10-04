# Role-aware migration replay

This runbook validates the active Prisma history in a fresh loopback-only
PostgreSQL cluster. It is not a deployment command and never reads a hosted
credential or environment file.

The active history is:

1. `0001_init`
2. `0002_pathways_foundation`
3. `0003_pathways_projects_collection`
4. `0004_pathways_finance_evaluation_decisions`
5. `0005_supabase_security_adapter`
6. `0006_auth_session_liveness`

Migrations 0001-0004 run as the synthetic `prisma` owner. Migrations 0005 and
0006 run as synthetic local `postgres`, matching their reviewed administrator
preflights. The replay requires all 39 `pathways` tables, all 15 legacy
`public` application tables and their data to remain present, the exact six-row
completed ledger, the Auth foreign key, the restricted liveness helper and no
direct runtime access to `auth.sessions`.

Run from this directory:

```powershell
.\Replay-Local.ps1
```

Success prints `PHASE6_LOCAL_REPLAY=PASS`,
`LEGACY_TABLE_PRESERVATION=PASS`, and `DISPOSABLE_LOCAL_CLEANUP=PASS`.
The runner removes only its validated `.tmp/pathways-phase6-*` directory after
the disposable cluster is stopped. An uncertain stop preserves the directory
and fails.

The former public-table retirement SQL is not an active migration. It is held
only as a deferred review artifact under `../legacy-retirement/`; it must not be
staged or executed. A future retirement requires a new data decision, new
migration number and separate review.

PATHWAYS-dev session-liveness deployment and rollback use only the separate
guarded runner documented in `../session-liveness/README.md`.

## Replay through Project/Activity creation-contract migration 0025

Run the complete current history and the P08 source-only acceptance suite with:

```powershell
.\Replay-Local.ps1 -ProjectActivityCreationRepair
```

This mode replays migrations `0001` through
`0025_project_activity_creation_contract`, expects 46 `pathways` tables and 25
finished Prisma ledger rows, and runs the existing feature/dashboard regressions
plus `project-activity-creation-contract-runtime.sql`. A successful run adds
`PROJECT_ACTIVITY_CREATION_CONTRACT_RUNTIME=PASS` before the legacy-preservation
and cleanup markers. It remains disposable/local only and does not authorize a
managed migration.

## Defense demo wipe (hosted PATHWAYS-devV2)

Clears all domain data before a reseed and keeps users and reference data.

- `hosted-defense-demo-wipe-dry-run.sql` prints row counts per table (KEEP or WIPE), proves `postgres` can truncate every target table through temporary owner-role membership, then rolls back.
- `hosted-defense-demo-wipe.sql` runs one `TRUNCATE ... RESTART IDENTITY` (no CASCADE) over every `pathways` and `pathways_rules_internal` table except the keep list, resets `sweep_cursor`, revokes the temporary memberships, verifies the wiped tables are empty and commits.

Run order: dry run, then wipe, both in the Supabase SQL editor as `postgres`. Set `RULES_DISPATCH_ENABLED=false` and let the scheduler stop first. Preview and Production share devV2, so the wipe hits both. `audit_logs` is cleared and `storage.objects` is not touched. Kept tables: `pathways` organizations, roles, permissions, role_permissions, system_users, user_step_up_pins, signin_lockouts and `pathways_rules_internal` source_operation_catalog, calendar_configuration, sweep_cursor. `node --test scripts/db/defense-demo-wipe.test.mjs` checks the list against the migrations.
