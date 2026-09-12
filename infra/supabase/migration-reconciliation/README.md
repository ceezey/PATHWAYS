# Read-only migration reconciliation tooling

> Current status (2026-09-09): this directory records and guards the completed
> 0002-0005 history reconciliation. The active migration chain now ends with
> `0006_auth_session_liveness`. The former legacy-table retirement is deferred
> outside Prisma migrations and must not be executed. Historical 0006/0007
> references below describe evidence and commands from before that reviewed
> resequencing; they are not current deployment instructions. Use
> `../session-liveness/README.md` for the only current next-migration contract.

This is an operator runbook for the approved preparation step, not a stage
report or authorization to repair PATHWAYS-dev. The runner has no hosted write
mode. It cannot resolve migrations, deploy to Supabase, reset a database, or
change the hosted ledger.

Run from `C:\PATHWAYS` with the existing Node, Prisma 6.19.2 and PostgreSQL 18
installation. No install, environment-file edit or running application restart
is needed. The replay requires port **55450** to be free; an occupied port causes
failure without stopping its owner.

```powershell
node --test infra/supabase/migration-reconciliation/runner.test.mjs
node infra/supabase/migration-reconciliation/runner.mjs --local
```

`--local` creates a new cluster below the ignored `.tmp/pathways-reconcile-*`
directory, bound only to `127.0.0.1`. It copies and verifies the immutable
0001–0005 SQL and migration lock. An explicit guarded Prisma configuration
deploys 0001–0004 as synthetic `prisma`, then 0005 as local `postgres`.
The existing synthetic Auth/Storage bootstrap is local only. No hosted data is
copied; no Auth user, business fixture or protected backup is required.

The child process environment excludes inherited connection variables,
credentials, Node preload settings and Prisma binary overrides. The explicit
Prisma configuration skips automatic `.env` loading. Its two required datasource
variables must both equal the generated local URL. Staging rejects 0006/0007,
unknown files, changed SQL, and paths outside the task's temporary directory.
Local catalog drift tests roll back their changes. The runner stops only its
new cluster and retains ignored synthetic evidence, including `canonical.json`,
`manifest.json`, `result.json`, copied SQL and the local PostgreSQL log.

## Authorized hosted comparison

The user has authorized read-only PATHWAYS-dev reconciliation. Reconfirm the
connector project identity as PATHWAYS-dev before invoking:

```powershell
node infra/supabase/migration-reconciliation/runner.mjs --compare-dev
```

This repeats the fresh local replay/tests, then invokes `Read-Dev.ps1` internally.
Do not invoke the helper directly to display its machine output. It uses only
the existing protected administrator CLIXML credential and hardcoded approved
Session Pooler endpoint/role/database, with TLS required. Its only SQL is the
reviewed catalog inventory in an explicit **REPEATABLE READ READ ONLY** transaction
with 30-second statement, 3-second lock and 35-second idle-transaction timeouts,
ending in `ROLLBACK`. Raw errors and credentials are withheld. Timeout handling
terminates only that exact read-only client process. No environment file is read
or changed by this tooling, and no secret is persisted in its evidence.

The hosted gate requires the exact one-row completed 0001 prefix/checksum, no
failed/rolled-back/extra migration attempts, a single public ledger, 39 target
and 15 legacy tables, absent 0007 helper, pgcrypto, and the runtime privilege
boundary. Another migration prefix is a blocker, never silently adopted.

## What is compared

The inventory hashes full normalized catalog definitions inside PostgreSQL:
relation properties/owners, columns/defaults/nullability, constraints, indexes,
non-internal triggers, RLS flags/policies, table/column ACLs, non-extension
functions and their ACLs, enum labels/ACLs, pathways schema ACL, and prisma
default ACLs. It inspects public and pathways application objects. Role names,
not OIDs, determine ACL ordering. PostgreSQL 18's additional NOT NULL constraint
rows are excluded because column `attnotnull` already covers that property in
both PostgreSQL 17 and 18. No CHECK/FK/unique constraint is excluded.

Function/default/policy bodies stay inside PostgreSQL; results contain only
object keys and SHA-256 fingerprints. Unrecognized extra object names are hashed
again before reporting. The previously identified public
`pathways_prevent_audit_mutation()` name is safe-listed for diagnostics only;
it is **not** exempted from comparison. A single missing, altered or extra
fingerprint returns `BLOCKED` and process exit 1. PASS means only that this
comparison passed; it never authorizes a ledger write.

The local provider fixture is not a Supabase platform replica. Managed Auth,
Storage, provider-owned schemas/functions, role provisioning, runtime LOGIN,
and application rows are outside canonical schema equivalence. The probe does
not read Auth/Storage/business rows or verify their preservation for a future
write. PostgreSQL version-specific deparser differences, if encountered, remain
blockers for review. Do not normalize unexplained differences away.

## Review and recovery boundary

If differences exist, identify their non-secret definition fingerprints,
ownership, grants and dependencies read-only, then propose a reviewed correction
or explicit retained-object exception. Do not drop an extra function or alter an
old migration to obtain PASS. The current exact comparison has no exceptions.

Before a future hosted ledger repair, separately review its implementation,
confirm a current restorable backup, stop the identified runtime for the approved
maintenance window, and recheck all source/ledger/catalog/data/security/provider
preservation gates. The proposed next write would baseline only 0002–0005 one at
a time with official Prisma resolution. It is not implemented or authorized here.
0006 retirement and 0007 deployment keep their separate gates and scope.

Recovery from this preparation consists of reversing only its added tooling and
dated Source of Truth/TODO additions. No hosted rollback is needed. The stopped
synthetic cluster may be retained; any later cleanup must target its exact
recorded directory, never the repository or the whole `.tmp` directory.

## Guarded audit-function correction (prepared, not authorized for live use)

The reviewed direction is to retire only the zero-argument function
`public.pathways_prevent_audit_mutation()` and its object ACL. The correction is
not a Prisma migration and never changes `public._prisma_migrations`. It exists
only to remove the noncanonical object before any separately authorized history
baseline. This preparation does not authorize its PATHWAYS-dev write mode.

Files:

- `correction.sql`: one bounded administrator transaction, exact target/ledger/
  definition/owner/ACL/dependency guards, and one schema-qualified
  `DROP FUNCTION ... RESTRICT`;
- `correction-rollback.sql`: separately authorized recovery that refuses any
  same-name conflict and restores the exact reviewed definition, `prisma`
  ownership, SECURITY INVOKER behavior and owner-only EXECUTE state;
- `correction-verify.sql`: catalog-only state inspection for a read-only wrapper;
- `correction-runner.mjs`: isolated write rehearsal, read-only hosted check, and
  exact-argument live orchestration;
- `Write-DevCorrection.ps1`: protected hardcoded writer used only after the Node
  runner has passed the full canonical comparison.

Run the local guard and SQL tests from `C:\PATHWAYS`:

```powershell
node --test infra/supabase/migration-reconciliation/correction-runner.test.mjs
node infra/supabase/migration-reconciliation/correction-runner.mjs --local
```

The local mode accepts no URL or credential. It creates a fresh loopback-only
PostgreSQL cluster on port **55451**, uses only synthetic roles/ledger/data, and
tests successful correction/restoration, changed definition, changed owner,
changed grant, attached dependency, conflicting rollback, wrong database, and
unrelated-object preservation. It stops only the cluster it created and retains
ignored evidence below `.tmp/pathways-correction-*`.

The currently authorized PATHWAYS-dev operation is read-only:

```powershell
node infra/supabase/migration-reconciliation/correction-runner.mjs --check-dev
```

`READY_TO_CORRECT` is the only acceptable pre-correction state: all 1,193
canonical fingerprints and the canonical vector hash match, the ledger remains
only completed checksum-matching 0001, and the only two differences are the
named function and ACL fingerprints. `READY_TO_ROLLBACK` means the function is
absent and the catalog is canonical. Any other result is a hard stop.

### Backup and maintenance gate before a future correction

The guarded backup/restore rehearsal is a separate operation from the
correction runner. It accepts only the exact authorization below, creates a
fresh protected custom-format archive outside the repository, brackets the dump
with read-only catalog and deterministic table-data fingerprints, restores only
to a new loopback database on port 55452, and removes the restored database after
verification. Its final stdout is one sanitized JSON object; the archive hash
and detailed evidence remain only in the protected backup directory.

```powershell
node infra/supabase/migration-reconciliation/backup-restore-runner.mjs --run-dev --authorization=PATHWAYS_DEV_BACKUP_RESTORE_REHEARSAL_ONLY
```

The runner never calls the correction/rollback writer or a Prisma migration
command. A PASS requires stable hosted pre/post fingerprints, a valid 55-table
archive, exact restored schema/data/ledger/ownership/ACL/RLS/policy/trigger and
required-extension comparisons, zero hosted writes, and successful local stop
and removal. `FAILED`, missing JSON, a null restore time, or any comparison other
than `PASS` is not backup/restore confirmation and must not be converted into
the `--backup-restore-confirmed` correction flag. Preserve the protected archive
and evidence and obtain a separate review before any retry.

The historical local-only diagnostic retry was intentionally bound to
the preserved `PATHWAYS-dev-pre-correction-20260908-205627` archive and port
55453. The following old authorization is now rejected; it is retained only as
execution history, not as a runnable next step:

```powershell
node infra/supabase/migration-reconciliation/backup-restore-local-retry.mjs --restore-existing --backup-id=PATHWAYS-dev-pre-correction-20260908-205627 --authorization=PATHWAYS_DEV_LOCAL_RESTORE_RETRY_ONLY
```

The first authorized diagnostic invocation failed closed at `local-restore-post-data` with
the bounded code `MISSING_SYNTHETIC_ROLE`. It recorded the failure in the
protected evidence, reported zero hosted connections and writes, stopped the
local cluster, and removed its directory. Do not rerun this command without a
new review and explicit authorization. The restore comparisons remain unproven.

The subsequent authorized preparation-only inspection found that the archive
TOC references the built-in `pg_database_owner` role and the Supabase platform
role `supabase_admin` beyond the original custom bootstrap list.
`pg_database_owner` is already supplied by the local PostgreSQL cluster; the
missing synthetic prerequisite is exactly `supabase_admin`. The retry now runs
`backup-restore-local-retry-bootstrap.sql` after the original provider-role
bootstrap. That fingerprinted script refuses every non-loopback, wrong-database,
wrong-user, missing-base-role or pre-existing-role state and creates only a
non-login, non-superuser, non-inheriting `supabase_admin` placeholder with no
database/role creation, replication, RLS bypass or role memberships. Synthetic
local tests verify those properties and conflict rejection. No archive retry
was performed during that preparation pass.

The subsequent single authorized retry passed its repository, protected digest,
prior-evidence and free-port preflights, restored through post-data, and reached
`local-verification`. It then failed closed with `RESTORE_COMPARISON`. The
protected evidence records zero hosted connections/writes and successful local
stop/removal. Individual comparison outcomes were not persisted, so the exact
mismatch must not be guessed. The prior-evidence guard now rejects reusing the
same authorization. Do not run the command again until sanitized per-comparison
diagnostics have been separately prepared, reviewed and authorized.

### V1 comparison diagnostics and consumed result

The diagnostic revision eagerly evaluates every recorded comparison, including
after an earlier mismatch or a thrown/read error. It persists the results before
raising `RESTORE_COMPARISON` and before local cleanup. A catalog-read failure
does not skip the independent data read, or vice versa. Invalid/unavailable
inputs produce `evaluated: false, pass: false`, never a presumed match.

The sanitized result contract is `diagnostics.version = 1`, boolean `allPassed`,
and `checks` with these fixed keys:

- `schema`: equality of the complete unchanged reviewed catalog fingerprint inventory;
- `rowCount`, `rowHash`: separate equality checks across all 55 recorded application tables;
- `migrationLedger`: exact recorded ledger equality plus the existing one-entry guard;
- `ownership`, `acl`, `rls`, `policies`, `triggers`: equality of the existing inventory subsets;
- `requiredExtensions`: the recorded required `pgcrypto` presence check;
- `catalogSafety`: existing database, read-only, runtime-safety and catalog-shape guards.

Each check contains **only** boolean `evaluated` and `pass`, plus integer
`missing`, `extra`, `changed` counts bounded to 0–10,000. Counts describe
differences, not application row totals. A PASS requires every check evaluated
and passing. No object keys, SQL, row values, identifiers, hashes, exceptions,
URLs or credentials enter diagnostics. Ownership/ACL subsets include combined
property fingerprints: a failure narrows a category but is not proof that only
ownership or a grant changed. Catalog equality means the existing recorded
application inventory, not a full Supabase-platform replica. Extension-version
or other provider-schema claims beyond the preserved baseline are not made.
No mismatch is normalized away and no comparison is exempted.

The new runner leaves original `evidence.json` and `application.dump` untouched.
After source/digest/prior-state/port checks it exclusively creates
`local-retry-comparison-v1.claim.json` beside them, consuming this revision even
if the process crashes. It saves sanitized, atomic, flushed checkpoints in
`local-retry-comparison-v1.json`, retaining the last complete checkpoint if an
update fails. Diagnostics survive cleanup failure. Top-level evidence includes
fixed stage/status/failure categories, UTC times, loopback/hosted-zero flags and
local stop/removal booleans. Terminal PASS is refused unless comparisons pass
and cleanup succeeds; terminal evidence cannot be rewritten by that writer.
`evidenceRecorded` and `finalEvidenceRecorded` distinguish an earlier checkpoint
from a successfully persisted final outcome. Missing/failed final evidence is
not a restore PASS. Do not delete the claim or journal to reuse authorization.

Only this exact prior `localRetry` record may enter the future revision:
`FAILED`, `local-verification`, `RESTORE_COMPARISON`, start UTC
`2026-09-09T06:15:55.585Z`, null completion UTC, port 55453, loopback true,
hosted connections/writes both zero, and stop/removal both true. Any drift,
existing claim/journal, bad archive digest or occupied port stops before restore.
Rejected preflights must not overwrite prior evidence.

Run only focused synthetic tests during preparation:

```powershell
node --test infra/supabase/migration-reconciliation/backup-restore-local-retry.test.mjs infra/supabase/migration-reconciliation/backup-restore-local-diagnostics.test.mjs
```

The PostgreSQL test uses a newly created loopback cluster on port 55454 and
removes only its validated disposable directory after stopping it. Other tests
use synthetic in-memory inventories and disposable local evidence fixtures.
The reviewed retry-only `supabase_admin` bootstrap is unchanged and hash-pinned.

The following V1 command was separately authorized, executed exactly once and is
now rejected. It remains here only as execution history:

```powershell
node infra/supabase/migration-reconciliation/backup-restore-local-retry.mjs --restore-existing --backup-id=PATHWAYS-dev-pre-correction-20260908-205627 --authorization=PATHWAYS_DEV_LOCAL_COMPARISON_DIAGNOSTIC_RETRY_V1
```

The V1 attempt failed closed at `local-verification` / `RESTORE_COMPARISON`.
It evaluated every check and persisted final sanitized evidence. Complete
catalog equality had two missing entries; ACL had the same two missing entries;
six deterministic table hashes changed while every row count matched. Ledger,
ownership, RLS, policies, triggers, required extensions and catalog safety all
passed. The V1 claim/journal remain protected; hosted connections/writes were
zero, local stop/removal succeeded, and the original evidence/archive remained
unchanged. No V1 authorization may be reused.

### V2 opaque identifier diagnostics: pre-execution design record

V2 preserves V1's eager comparisons and adds bounded, domain-separated HMAC
identifier fingerprints. Plain hashes of predictable catalog/table names are
not used because they would be dictionary-reversible. The runner derives an
ephemeral key from the privately verified archive digest using a V2-specific
HMAC domain; neither the archive digest nor derived key is persisted or printed.
Catalog entries share one domain across full-schema and subset checks so the
same missing ACL entry can be correlated without revealing its name. Data,
ledger and extension identifiers use separate domains.

The sanitized `diagnostics.version = 2` contract retains `allPassed` and the
same eleven fixed checks. Every check contains boolean `evaluated`/`pass`,
bounded integer `missing`/`extra`/`changed`, and:

```text
fingerprints: { missing: [opaque-64-hex], extra: [...], changed: [...] }
truncated:    { missing: boolean,        extra: boolean, changed: boolean }
```

Each fingerprint list is unique, sorted and limited to 64 entries. Its length
must equal its associated count up to that limit, and `truncated` must be true
exactly when a count exceeds 64. Counts remain bounded at 10,000. An unevaluated
check has no counts or fingerprints and cannot pass. Sanitization reconstructs
the output from the allowlist and rejects malformed, duplicate, unsorted,
inconsistent or excessive evidence. Tokens identify comparison keys only; they
contain no catalog/data fingerprint and are not authorization or integrity keys.
Treat the protected archive digest as private because it keys correlation.

V2 is bound to the exact completed V1 evidence: start UTC
`2026-09-09T07:48:35.989Z`, completion UTC `2026-09-09T07:48:42.414Z`, terminal
FAILED `local-verification` / `RESTORE_COMPARISON`, twelve checkpoints, final
evidence present, loopback-only, hosted connections/writes zero, successful
stop/removal, the exact eleven V1 result tuples and immutable byte fingerprints
of both V1 files. Semantic drift still fails even if a test substitutes a new
byte fingerprint. Original `evidence.json` retains its older exact-state guard.

A future authorized run requires both immutable V1 files and creates different,
permanent `local-retry-comparison-v2.claim.json` and atomic
`local-retry-comparison-v2.json` files. Existing V2 claim or journal rejects the
attempt. V1 files are rechecked before and after exclusive V2 claim creation;
neither is modified. The V2 terminal/cleanup/atomic-write rules remain the same.
The diagnostic/evidence modules and unchanged least-privilege `supabase_admin`
bootstrap are source-fingerprint guarded by the runner.

The following paragraphs preserve the reviewed pre-execution design. Focused
preparation tests use only synthetic inventories/evidence and one new
loopback-only PostgreSQL cluster on port 55454. They never read the archive.
The following V2 command was later executed exactly once; it is retained only
as immutable command history and must not be run again:

```powershell
node infra/supabase/migration-reconciliation/backup-restore-local-retry.mjs --restore-existing --backup-id=PATHWAYS-dev-pre-correction-20260908-205627 --authorization=PATHWAYS_DEV_LOCAL_COMPARISON_DIAGNOSTIC_RETRY_V2
```

Before an authorized attempt, revalidate the repository baseline, immutable
sources, exact V1 evidence, protected archive digest and free port 55453. No
hosted connection or new backup is permitted. Preserve the archive, original
evidence, both V1 files and both V2 files afterward. Do not delete a claim to
retry. Stop after the one attempt regardless of outcome. Failed or uncertain
comparison, evidence persistence or cleanup requires another review; uncertain
stop preserves the exact local directory rather than deleting a possibly live
database. No diagnostic result authorizes correction, rollback or migration.

### V2 result and local-only root-cause preparation

The separately authorized V2 command was executed exactly once and is now
consumed. It failed closed at `local-verification` / `RESTORE_COMPARISON` after
twelve checkpoints. The two complete-catalog omissions are the same two ACL
omissions; all six data differences are hash-only because every row count
matched. All other comparison dimensions passed. The terminal V2 claim and
journal, original evidence and archive remain protected. Hosted connections and
writes were zero, and the disposable target stopped and was removed.

The read-only root-cause inspector privately correlated V2 identifiers without
emitting identifiers or hashes. Both missing entries are database-global
default privileges for the application owner. Although the archive TOC has six
provider-owned default-ACL entries, it has no application-owner entry. The
schema filter is therefore incomplete for this application security state. A
synthetic PostgreSQL 18 source with two global and one schema-scoped default
privilege proved that the same schema-filtered dump preserved the scoped entry
but omitted both global entries. The restored target reproduced that exact
omission. This rejects a missing synthetic provider role and validates the
catalog comparison; the omission must not be hidden in a generic role bootstrap.

The narrow archive repair is the reviewed, archive-bound application supplement
in `backup-restore-default-acl-supplement.sql`. It runs only in the exact
loopback disposable database, refuses any pre-existing application-owner
default privilege, creates only the two reviewed global restrictions, and
verifies their least-privilege shape. Its separately guarded inverse is
`backup-restore-default-acl-supplement-rollback.sql`. Synthetic tests proved
apply, exact restoration, inverse restoration, conflict rejection, and
preservation of the unrelated schema-scoped provider entry. For future backups,
this state must be captured as a protected companion artifact bound to the
archive and evidence; it must not be reconstructed by an unrecorded bootstrap.

The six hash differences are exactly all six non-empty tables: five in the
application schema and one migration-ledger table in the public schema. No
non-empty table retained its old hash. All five application definitions are
present in the reviewed migrations, all contain time-zone-aware timestamps, and
none has a generated column. The restore loads data before post-data triggers,
uses the dump's default COPY data path, and the V2 trigger comparison passed.
Those facts reject trigger execution, reordered table reads, and default-value
recomputation as supported explanations for the six-way pattern.

The old fingerprint query serializes complete rows through JSON text and sorts
that text with C collation, but it never pins `TimeZone`. Hosted evidence records
PostgreSQL major 17; the disposable restore uses major 18. A synthetic same-major
test proved that changing only `TimeZone` changes this hash for a row containing
a time-zone-aware timestamp while an otherwise equivalent timestamp-without-
time-zone row remains stable. This proves a deterministic-hash contract defect,
but the protected evidence did not record either session `TimeZone`; therefore
it does **not** yet prove that timezone alone caused the six protected hashes,
and the major-version serialization alternative is not normalized away.

`backup-data-inventory-utc.sql` is the read-only controlled probe. The prepared
V3 runner first requires and reproduces the exact V2 failure, including its
opaque fingerprint sets, then applies only
the reviewed application-default-ACL supplement in the disposable target and
reruns every comparison with UTC-pinned data serialization. PASS requires the
old two/two/six pattern, a non-UTC target default, complete catalog equality
after the supplement, all row counts and UTC hashes equal, and every other
comparison passing across the existing 17-to-18 boundary. Any remaining hash
difference stays unexplained and fails closed.

V3 uses a new permanent `local-retry-root-cause-v3.claim.json` and atomic
`local-retry-root-cause-v3.json`. It is byte- and semantic-bound to the exact V2
claim/journal and original evidence, source-fingerprint guards the unchanged
reviewed provider-role bootstrap plus the supplement/inverse/probe/inspectors,
and emits only booleans and bounded difference counts. No object/table names,
tokens, SQL, values or comparison hashes enter the V3 journal. Uncertain stop
preserves the validated local directory; every completed attempt consumes V3.
Neither V3 file exists during preparation.

The following command is prepared but **has not been executed** and requires
separate authorization:

```powershell
node infra/supabase/migration-reconciliation/backup-restore-root-cause-retry.mjs --restore-existing --backup-id=PATHWAYS-dev-pre-correction-20260908-205627 --authorization=PATHWAYS_DEV_LOCAL_ROOT_CAUSE_RETRY_V3
```

No V3 result authorizes the hosted audit-function correction, migration ledger
repair, migrations 0006/0007, Auth/Storage work, production or AWS changes.

Before requesting live correction authorization:

1. Confirm the exact project is PATHWAYS-dev and record a current restorable
   managed backup, or create a new custom-format administrator backup outside
   the repository using the protected Phase 6 backup procedure. Record only its
   UTC time, protected location and SHA-256; never paste the archive or URL.
2. Restore that exact archive into a brand-new loopback-only database and pass
   the Phase 6 schema/data/ledger/security reconciliation. Record only the
   restore UTC time and PASS result. Merely creating or downloading a backup is
   insufficient.
3. Schedule a maintenance window. Stop only positively identified PATHWAYS
   development web/API processes, then confirm there is no active
   `prisma`/`pathways_runtime` session or transaction. Do not terminate unknown
   sessions and do not change database roles or credentials.
4. Recheck the branch/HEAD, the immutable 0001-0005 hashes, the correction SQL
   fingerprints, project health and `--check-dev` result immediately before the
   write. Do not continue if any value differs.

Only a later explicit authorization may run this exact command and flags, in
this exact order:

```powershell
node infra/supabase/migration-reconciliation/correction-runner.mjs --apply-dev --authorization=PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY --backup-restore-confirmed --maintenance-confirmed
```

The runner repeats the full read-only canonical comparison, calls the fixed
protected writer, and repeats the comparison afterward. Success requires
`READY_TO_ROLLBACK`, 1,193 canonical fingerprints, the unchanged one-row 0001
ledger, and one acknowledged write attempt. It never baselines a migration,
applies 0006/0007, restarts a service, or automatically retries/rolls back.

### Uncertain outcome and rollback

If the writer reports `UNCERTAIN`, preserve its process ID and all evidence.
Do not retry, baseline, start application services, or invoke rollback. Wait for
that exact client process to exit, then run only `--check-dev`. Treat
`READY_TO_ROLLBACK` as committed, `READY_TO_CORRECT` as not observed, and every
other result as unresolved; obtain a new review before any action. A confirmed
SQL guard failure is also a stop, not permission to weaken a guard.

Rollback is never automatic and requires separate recovery authorization after
protected access is closed and a clean `READY_TO_ROLLBACK` preflight passes:

```powershell
node infra/supabase/migration-reconciliation/correction-runner.mjs --rollback-dev --authorization=PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY --recovery-authorized --maintenance-confirmed
```

Successful rollback must return `READY_TO_CORRECT` with only the same two
reviewed extra fingerprints. If rollback or its postflight is uncertain, stop
and reconcile read-only. Never use `CASCADE`, raw Dashboard SQL, a ledger edit,
an older migration replay, reset, push, resolve, or backup restore as an
automatic correction workaround.

References accessed 2026-09-09: [PostgreSQL transaction modes](https://www.postgresql.org/docs/17/sql-set-transaction.html),
[catalog definition functions](https://www.postgresql.org/docs/17/functions-info.html),
and [Supabase changelog](https://supabase.com/changelog). The installed Prisma
`migrate deploy --help` and actual local replay establish the 6.19.2 command
contract. No Supabase schema-management API or second migration ledger is used.

## Guarded sequential Prisma baselining: 0002-0005

The protected V3 restore rehearsal subsequently passed, and the separately
authorized correction retired only
`public.pathways_prevent_audit_mutation()` with one acknowledged hosted write.
Its postflight is `READY_TO_ROLLBACK`: all 1,193 canonical objects match and the
completed, checksum-matching Prisma ledger still contains only `0001_init`.

`baseline-runner.mjs` is the reviewed next boundary. Its preparation-time
`--check-dev` mode is read-only and requires exact catalog equality, all 54
application table count/hash records, the one-row ledger, the least-privilege
runtime boundary and zero `prisma`/`pathways_runtime` maintenance sessions. Its
local mode uses the installed Prisma 6.19.2 CLI against a disposable loopback
PostgreSQL database and proves that sequential `resolve --applied` calls change
only the ledger.

The write mode accepted only this outer command, in this exact order. It was
not executed during preparation, was subsequently executed exactly once, and
is now consumed. It is retained as immutable command history and must not be
run again:

```powershell
node infra/supabase/migration-reconciliation/baseline-runner.mjs --apply-dev --authorization=PATHWAYS_DEV_BASELINE_0002_0005_ONLY --backup-restore-confirmed --maintenance-confirmed
```

The outer runner creates a checksum-guarded staging directory containing only
`migration_lock.toml` and immutable migrations 0001-0005. The protected writer
then runs these installed-CLI operations sequentially; do not run them manually:

1. `node apps/api/node_modules/prisma/build/index.js migrate resolve --applied 0002_pathways_foundation --config infra/supabase/migration-reconciliation/prisma.baseline.config.ts`
2. `node apps/api/node_modules/prisma/build/index.js migrate resolve --applied 0003_pathways_projects_collection --config infra/supabase/migration-reconciliation/prisma.baseline.config.ts`
3. `node apps/api/node_modules/prisma/build/index.js migrate resolve --applied 0004_pathways_finance_evaluation_decisions --config infra/supabase/migration-reconciliation/prisma.baseline.config.ts`
4. `node apps/api/node_modules/prisma/build/index.js migrate resolve --applied 0005_supabase_security_adapter --config infra/supabase/migration-reconciliation/prisma.baseline.config.ts`

Immediately before each write, `Write-DevBaseline.ps1` independently rechecks
the exact preceding ledger prefix, immutable migration/config fingerprints,
the protected target, backup/restore and maintenance confirmations, and zero
matching sessions. Immediately after each successful CLI exit, the outer runner
uses `Read-DevBaseline.ps1` in a new repeatable-read, read-only transaction and
requires the next exact ledger prefix plus unchanged catalog, ownership, ACL,
RLS, policies, triggers, extensions, table counts and UTC-pinned table hashes.
Only prefixes 2, 3, 4 and 5 are accepted. Migration 0006, migration 0007,
`migrate deploy/dev/reset/resolve --rolled-back`, `db push`, application env
loading and arbitrary targets are absent or rejected.

The write is intentionally not transactionally grouped across all four Prisma
commands: each history row is an independent Prisma operation with a complete
verification barrier. This makes a partial prefix recoverable without guessing.
The runner stores the preflight count/hash inventory in its ignored evidence
directory before the first write. If a writer times out, exits unexpectedly, or
any postflight differs, the result is `UNCERTAIN`, all later writes stop, and no
retry or automatic ledger rollback occurs.

For an uncertain result:

1. Keep the maintenance window active, preserve the reported evidence directory
   and any reported process ID, and do not start services or run Prisma.
2. Wait for that exact process to exit. Do not terminate an unknown or
   Supabase-managed session.
3. Obtain separate read-only recovery authorization, replacing `<evidence>`
   below with the exact relative path from the uncertain result:

   ```powershell
   node infra/supabase/migration-reconciliation/baseline-runner.mjs --recover-dev --evidence=<evidence> --authorization=PATHWAYS_DEV_BASELINE_RECOVERY_READ_ONLY
   ```

4. Recovery passes only when the live prefix is exactly 1-5 and the catalog and
   application data equal the preserved preflight. Prefix 1 means no baseline
   was confirmed; 2-4 is a clean partial completion; 5 is fully baselined. Any
   other result remains blocked. A continuation or repair requires a new,
   prefix-specific reviewed runner and authorization; never delete ledger rows,
   mark a row rolled back, replay schema SQL, or reuse the original command.

There is no ordinary rollback for a successful Prisma baseline because these
rows record already-present physical changes. Recovery is evidence-led: stop,
read the exact ledger and physical state, and prepare a separately reviewed
continuation only if necessary. A final PASS authorizes review of migration
0006; it does not apply 0006/0007 or authorize trusted-device implementation.

Official references accessed 2026-09-09: [Prisma baselining](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining),
[`prisma migrate resolve`](https://docs.prisma.io/docs/cli/migrate/resolve),
and [Prisma patching/hotfixing](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing).

### Baselining execution result

The separately authorized outer command completed PASS. It made exactly four
hosted migration-ledger write attempts and five protected read-only verification
connections. Migrations 0002, 0003, 0004 and 0005 were recorded in order; the
verified prefixes were 2, 3, 4 and 5. Final postflight retained all 1,193
canonical catalog fingerprints and all 54 application-table count/hash records,
with exact ledger prefix 5. Sanitized evidence is preserved at
`.tmp/pathways-baseline-C6C8EO/result.json`; its private preflight inventory
remains in the same directory.

The terminal state is `READY_FOR_0006_REVIEW`. Do not reuse the baselining
command or alter its ledger rows. This result does not authorize migration 0006,
migration 0007, a service restart or trusted-device implementation.
