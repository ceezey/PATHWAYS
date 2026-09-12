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
