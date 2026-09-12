# Stage 4 session-liveness 0006 operator runbook

This is a reviewed execution contract, not authorization. The active migration
`0006_auth_session_liveness` adds one administrator-owned `SECURITY DEFINER`
boolean helper. It grants only `EXECUTE` to `pathways_runtime`; the runtime role
receives no `auth` schema usage or `auth.sessions` table access. The helper has
a fixed `pg_catalog` search path, checks the server-validated subject/session
pair against the live Supabase session, and returns no Auth data.

The migration preserves every existing schema, table, row, owner, ACL, RLS
setting, policy and trigger. The 15 legacy public application tables are
explicitly preserved. Their previous retirement SQL is a non-executable,
deferred review artifact under `../legacy-retirement/`.

## Preparation-only checks

### Full deployment-child proof (2026-09-10)

The loader-only probe below is necessary but **not sufficient**. The installed
Prisma 6.19.2 `migrate deploy` command validates `schema.prisma` environment
references before applying its configuration datasource override. The original
writer supplied only `PATHWAYS_SESSION_LIVENESS_URL`, producing `P1012` for
missing `DIRECT_URL`. Supplying only `DIRECT_URL` then fails for missing
`DATABASE_URL`. Neither failure changes the synthetic ledger/catalog/data.

The reviewed correction supplies **both** names from the existing validated
deployment URL in `ProcessStartInfo.EnvironmentVariables`, not `$env:` or an
environment file. Immediately after launch it removes all three URL copies
from both parent-side start-info dictionaries and clears the URL variable.
The child necessarily retains its inherited values until it exits; this is
reference cleanup, not a claim of cryptographic memory erasure. Hosted target,
credential retrieval, authorization, migration SQL, transaction, preflight,
postflight and uncertain-outcome behavior are unchanged.

Run the full local acceptance suite from the repository root:

```powershell
node --test infra/supabase/session-liveness/deployment-runner.test.mjs infra/supabase/session-liveness/writer-child.local.test.mjs
```

Expected: **22 tests passed, 0 failed/skipped** and a sanitized diagnostic with
`originalFailureReproduced`, `partialFixRejected`, `correctedDeployment`,
`catalogPreserved`, `dataPreserved`, `helperValid`, `localStopped`, and
`localRemoved` all true; hosted connections/writes both zero.

This test creates a new synthetic PostgreSQL 18 database on **127.0.0.1:55457**,
requiring the port to be free. It uses only the installed binaries. A pinned,
local-only adapter executes the actual writer's child setup/command/launch/
cleanup statements, with its script-directory context restored and a fixed
synthetic URL. It does **not** invoke the hosted wrapper, DPAPI reader, protected
archive, or hosted preflight. It verifies ownership of the local server by its
exact data directory and refuses changed staging. Canonical 0001–0004 run as
synthetic `prisma`, 0005/0006 as synthetic `postgres`; these are disposable
roles, not existing services. The provider-shaped bootstrap is unchanged;
the fixture adds a non-login catalog role and removes default PUBLIC TEMP
access only in this new database to model the reviewed runtime boundary.

Against the same prefix-5 database, the test reproduces the original failure,
rejects the incomplete one-variable fix, then requires successful real CLI
deployment of 0006, prefix 6, the exact helper and preservation of 1,193 prior
catalog entries, all 54 UTC-pinned data inventories, 15 legacy tables (including
a populated synthetic canary), schema/role/extension state and security ACLs.
It stops/removes only its own cluster after confirming shutdown. If shutdown
is uncertain, its exact directory is preserved and the test fails.

The Windows process sandbox blocked nested PostgreSQL startup during testing;
the authorized local suite passed outside that sandbox. A sandbox startup
failure is not deployment evidence: resolve that local execution permission,
do not bypass a hosted guard. Initial adapter setup issues were corrected and
all temporary clusters/directories were removed. No hosted test was run.

The reviewed dirty baseline is now **116 entries** (114 plus the two local
test files). Writer, adapter and full-CLI test fingerprints are pinned in
`deployment-config.mjs`. A new hosted attempt still requires separate review,
maintenance/backup confirmation, exact preflight and one-attempt authorization.

For the current startup/configuration correction, these checks are entirely
offline. They do not invoke Prisma CLI commands or load application env files:

```powershell
Set-Location -LiteralPath 'C:\PATHWAYS'
node infra/supabase/session-liveness/startup-check.mjs --check
node --test infra/supabase/session-liveness/deployment-runner.test.mjs
```

The startup check must report `status: PASS`, `failure: NONE`, exact installed
Prisma version/configuration booleans, zero network/child calls inside the probe,
and `localCleanup: true`. The focused suite must report 14 passed, 0 failed.
The checker uses the same Node executable as the writer, the installed 6.19.2
config loader and a synthetic child-only datasource. It blocks socket/network
and additional process creation inside that probe. No credentials or parent
environment values are changed. Its scratch directory is removed afterward.

The original config failed in two independently reproduced ways:

1. `prisma/config` cannot resolve from `infra` because Prisma is installed only
   in `apps/api`. The config now imports the existing API-owned
   `../../../apps/api/node_modules/prisma/config.js`, matching the existing
   baselining/replay convention, without adding a dependency.
2. Prisma 6.19.2's loader discards the datasource override when `engine` is
   omitted. `engine: 'classic'` now retains the exact supplied datasource.

The offline checker runs before the first hosted read in apply/check mode.
A failure returns `BLOCKED` at `startup`, with zero hosted connections/writes.
Recovery/rollback semantics and migration SQL are unchanged. The new checker
adds one file to the approved baseline (113 to 114 dirty entries); the config,
checker and writer fingerprints are updated together. Do not edit the hash
guards merely to make a changed checkout pass.

The previous version-2 attempt was independently recovered as `NOT_APPLIED`
with `dataInventoryEqual: true`: prefix 5, absent helper, 1,193 canonical
objects, 54 unchanged inventories, 15 preserved legacy tables and zero
maintenance sessions at that historical read. This is not a current hosted
observation; this preparation did not connect to PATHWAYS-dev. The raw error
from that attempt was not retained, so the reproduced configuration defects
explain a startup failure without asserting an unavailable historical error.

### Operator steps after reviewing the local correction

1. Run the offline probe and **full 22-test local suite** above. A loader-only
   PASS must never authorize another hosted attempt. Do not adjust credentials
   or `.env`.
2. Keep the web/API processes stopped for the maintenance window and retain
   the protected backup/V3 evidence and both prior deployment directories.
3. Only when a new hosted attempt is authorized, run the read-only preflight:

   ```powershell
   node infra/supabase/session-liveness/deployment-runner.mjs --check-dev
   ```

   Require `READY_TO_DEPLOY_0006`. Stop on a mismatch; never bypass its guards.
4. Under that same single-attempt authorization, run the exact apply command
   below once. It repeats its preflight immediately before the writer.
5. Require `PASS`, `stage: complete`, ledger prefix 6,
   `dataInventoryEqual: true` and `READY_FOR_API_RESTART`. Preserve the evidence
   directory. A nonzero/failed/uncertain outcome requires stopping without retry
   or automatic rollback; use the separately authorized read-only recovery.
6. Migration PASS completes this database prerequisite only. Continue the
   separately scoped trust UI/cookie implementation and full Stage 4 tests
   before checking the trusted-device gate or starting Stage 5.

The broader isolated database contract (not part of this local startup pass)
and read-only hosted preflight remain available under their appropriate scope:

```powershell
node infra/supabase/session-liveness/deployment-runner.mjs --local
node infra/supabase/session-liveness/deployment-runner.mjs --check-dev
```

The hosted check requires exact completed ledger prefix 0001-0005, the 1,193
canonical-object vector, all 54 application-table count/hash records, absence of
the helper, and zero `prisma`/`pathways_runtime` sessions or transactions. It
performs no hosted write.

## Separately authorized apply

Stop the PATHWAYS development web/API processes and establish a maintenance
window. Confirm the protected backup and successful V3 restore evidence remain
available. Then, only with the exact separate authorization, run once:

```powershell
node infra/supabase/session-liveness/deployment-runner.mjs --apply-dev --authorization=PATHWAYS_DEV_SESSION_LIVENESS_0006_ONLY --backup-restore-confirmed --maintenance-confirmed
```

The runner stages exactly migrations 0001-0006 beneath a task-owned `.tmp`
directory, invokes only `prisma migrate deploy`, and performs an independent
read-only postflight. A PASS requires ledger prefix 6, the helper's exact
definition/owner/configuration/ACL, unchanged canonical objects apart from the
two reviewed helper fingerprints, and identical 54-table count/hash evidence.
Preserve the result directory.

Any nonzero/timeout/result-persistence ambiguity after the writer launches is
`UNCERTAIN`. Do not retry and do not automatically roll back. With separate
read-only recovery authorization, classify the state using the exact evidence
directory printed by the attempt:

New attempts persist evidence version 2. The private result contains one
domain-separated SHA-256 fingerprint over the sorted 54-table preflight data
inventory, never the table names, row counts or table hashes themselves. The
fingerprint is omitted from console output. Recovery rejects missing, legacy,
malformed or drifted evidence and returns `dataInventoryEqual: true` only when
the current inventory matches the preserved preflight fingerprint exactly.

Writer output is also bounded to a fixed outcome classification:
`CHILD_EXIT_ZERO`, `CHILD_TIMEOUT`, `CHILD_NONZERO_EXIT`,
`WRITER_EXCEPTION_AFTER_LAUNCH` or `GUARD_REJECTED`. Only a bounded child exit
code or timeout process ID may accompany the applicable outcome; raw Prisma
stdout/stderr is never persisted or printed. Evidence created before version 2
cannot prove preflight data equality and must not be reused for a deployment.
The preserved pre-version-2 `UNCERTAIN` attempt was recovered as `NOT_APPLIED`,
but its exact child failure is intentionally irretrievable because the old
writer collapsed nonzero exit and post-launch exception into the same result.

```powershell
node infra/supabase/session-liveness/deployment-runner.mjs --recover-dev --evidence=.tmp/pathways-session-liveness-REPLACE --authorization=PATHWAYS_DEV_SESSION_LIVENESS_0006_RECOVERY_READ_ONLY
```

## Separately authorized containment rollback

Rollback is emergency containment, not ledger reversal. It preserves the
completed 0006 ledger row and removes only the exact reviewed helper with
`RESTRICT`; the API must remain stopped afterward until a new forward fix is
reviewed. Only with separate rollback authorization, run once:

```powershell
node infra/supabase/session-liveness/deployment-runner.mjs --rollback-dev --authorization=PATHWAYS_DEV_SESSION_LIVENESS_0006_ROLLBACK_ONLY --recovery-authorized --maintenance-confirmed
```

Never use `migrate dev`, `migrate reset`, `migrate resolve`, `db push`, manual
ledger edits, automatic retry or automatic backup restore. Never expose the
protected credential, connection URL, evidence hashes, Auth rows or identifiers.
