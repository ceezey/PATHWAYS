# Projects and collection database checks

These checks cover migration `0003_pathways_projects_collection`. They require a
fresh, unmistakably disposable **local** PostgreSQL database whose name starts
with `pathways_phase2_`. Never point them at Supabase or another shared database.

Replay the complete Prisma migration history into that database first. Keep the
migration connection on schema `public`; models use Prisma's multi-schema mappings.
Use a second disposable local database for Prisma's history-to-datamodel shadow
diff. Never use `migrate reset`, `db push`, or a shared database as a shadow target.

Run the SQL suite with the local migration owner, adjusting the local port and
disposable database name as needed:

```powershell
psql -X -w -h 127.0.0.1 -p 55439 -U prisma -d pathways_phase2_final -v ON_ERROR_STOP=1 -f apps/api/prisma/tests/projects-collection.sql
```

The SQL suite contains 84 assertions and rolls back all its synthetic fixtures.
It verifies organization/project foreign keys, active assignments, activity and
publication lifecycles, derived overdue, indicator bounds, versioned forms,
typed response validation, raw-import isolation, and enrollment/journey history.
It must print `PHASE2_ASSERTIONS_PASSED=84` and exit zero.

Use a separate **empty disposable clone** for the concurrency suite. Its fixtures
are committed because the tests use independent sessions; retain or discard that
local database according to your local test-environment procedure.

```powershell
$env:PHASE2_RACE_DATABASE='pathways_phase2_races'
$env:PHASE2_LOCAL_PORT='55439'
node apps/api/prisma/tests/projects-collection-concurrency.mjs
```

The concurrency script only constructs a localhost connection as `prisma` and
does not read Supabase env files. Configure local PostgreSQL authentication outside
the command line if your test instance requires it. The three tests observe a
real PostgreSQL lock wait before verifying rejection after the parent commits:
profile suspension versus assignment, form publication versus field insertion,
and invalid raw-row validation versus normalized submission creation.

PostgreSQL 18 reports some `RESTRICT` failures as SQLSTATE `23001`; PostgreSQL 17
may report `23503`. The SQL test accepts those equivalent rejection outcomes.
When comparing catalogs across these versions, compare column `attnotnull` and
exclude PostgreSQL 18's additional `pg_constraint.contype = 'n'` entries to avoid
counting the same NOT NULL property twice. Do not omit CHECK/FK constraints.

## Database behavior and integration boundaries

- All 20 new tables use UUID defaults, explicit organization ownership, scoped
  foreign keys, and RESTRICT history references. Their RLS is enabled with no
  permissive policies or direct API-role grants. The six Phase 1 tables retain
  their preexisting RLS state; completing their security setup belongs to Phase 4.
- `system_users` gains a trigger that rejects status/scope changes while active
  project assignments remain. End activity assignments, then project assignments,
  before suspending/deactivating the profile. Reassign by inserting new history.
- A form version starts DRAFT. Configure its fields, then publish it. After
  publication only archival is permitted; changes need a new `(project, code,
  version)` record. Import batches select a published form version explicitly.
- A raw row never creates a normalized record automatically. Trusted validation
  records its verdict and actor; only VALID rows may source submissions. Invalid
  rows remain isolated staging evidence. System-field mappings use an allowlist,
  never executable SQL. Server import parsing/authorization remains later work.
- Create response values while a submission is DRAFT, then validate it in the
  same transaction. Deferred checks enforce required fields at commit. A
  validated submission and its values are immutable apart from final processing.
- Finalize valid rows into processed submissions before marking their raw rows
  PROCESSED. A processed batch may retain INVALID rows but cannot contain PENDING
  or unprocessed VALID rows. Frozen raw evidence and mappings cannot be rewritten.
- A beneficiary may enroll in several projects. Participation and journey records
  refer to the project's enrollment, never a freestanding beneficiary/user link.
  Journey events are append-only and dates must remain inside enrollment dates.
- Activity states are NOT_STARTED, IN_PROGRESS, FOR_REVIEW, COMPLETED, CANCELLED.
  Compute overdue as `planned_end_date < CURRENT_DATE AND status NOT IN
  ('COMPLETED', 'CANCELLED')`; no overdue status or time-sensitive stored flag exists.
- Project public review, approval, and publication have distinct actors/times.
  A submitter cannot approve their own content. An approved/public summary change
  requires renewed review; database state does not itself expose a public endpoint.
- Trigger/helper functions are SECURITY INVOKER with fixed search paths and no
  PUBLIC execute grant. Phase 4 must review any explicit helper-function EXECUTE
  privileges required by the future runtime role. Phase 5 must still enforce
  verified identity, permissions, assignment scope, and aggregate-only access.

Do not run behavioral tests against PATHWAYS-dev. Live verification uses only
catalogs, zero counts, checksums, ledger evidence, and `prisma migrate status`.


## P06 candidate — project indicators and SADDD (migration 0013)

`project-indicator-dashboard-runtime.sql` is a new candidate suite, not a recorded PASS.
Run it only through the updated `infra/supabase/phase6/Replay-Local.ps1`; it refuses any
other database/port/user. The harness replays 0001–0013 into its guarded loopback
PostgreSQL 18 scratch cluster on port 55448 and removes that environment afterward.
This is not a live API database and never authorizes PATHWAYS-dev writes.

The suite supplies synthetic two-organization/six-role records, 30 individuals with
60 shared project enrollments, independent age-band and sum/average/ratio expectations,
source-submission/natural-key retry rejection, draft exclusion, journey-date versus
participation-date correction checks, ambiguous correction rejection, append-only
manual values, rollback, permission/foreign-project denial and next-request revocation.
Owner-only tests exercise the private G4 calculator. Runtime-equivalent checks prove
the sensitive-release wrappers stay MISSING/null and cannot execute private calculators.
G4 is confirmed; overlapping-query release policy remains G8, so this is not acceptance
of an available sensitive SADDD dashboard. It also is not a full concurrency or real
Auth/Storage test. Add the missing adversarial/end-to-end cases before closing P06/P07.

The script uses a transaction and rolls back its fixture rows. `EXPLAIN (ANALYZE,
BUFFERS, FORMAT JSON)` and `\timing` produce actual local helper-execution evidence
when run. A function-call plan is not an inspection of every nested SQL plan, and
neither its timing nor a 3-second timeout is an HTTP-latency or capacity claim. Inspect
nested source-query plans separately when investigating performance on larger approved
synthetic fixtures. Record environment, rows, duration, buffers and actual exit status;
do not copy expected markers into evidence. Only a successful command may emit the
harness's `PROJECT_INDICATOR_DASHBOARD_RUNTIME=PASS` marker.

The supplied package's Windows installer, SQL and Prisma schema have not been executed
in the preparation environment. Full repository checks and the isolated replay remain
required. Preserve earlier migration files/checksums; 0013 is a forward candidate, not
permission to reset/rebaseline or change the `public` migration ledger routing.

## P08 Project and Activity creation contract (migration 0025)

`project-activity-creation-contract-runtime.sql` runs only through the guarded
`Replay-Local.ps1 -ProjectActivityCreationRepair` path. It rejects any target other
than the fixed loopback scratch database, wraps all fixtures in a transaction, and
rolls them back.

The suite verifies the additive Project/Activity profile fields, normalized Project
Officer assignment rule, same-project Indicator/Journey links, immutable PHP budget
records, timeline override constraint, and the aggregate-only
`p08_activity_beneficiaries_reached` security boundary. Its participation fixtures
prove exclusion of absent, archived, dummy, draft, and cancelled data for the
Program Manager portfolio and permission-boundary assertions; since
`cr-pathways-proof-session-beneficiary-count` (migration 0042), participation no
longer feeds the aggregate itself, so its expected `beneficiaries_reached` values are
0 in this suite (no approved proof session exists in these fixtures). It also
verifies Program Manager portfolio access without `beneficiaries.records.read`,
guessed/cross-project/cross-organization rejection, function owner/search
path/grants, forced RLS on the new link table, and runtime `NOBYPASSRLS`. Success
prints `PROJECT_ACTIVITY_CREATION_CONTRACT_RUNTIME=PASS`.

## Proof-session beneficiary count (migration 0042)

`proof-session-beneficiary-count-runtime.sql` covers `cr-pathways-proof-session-beneficiary-count`.
Run it as a local superuser against a disposable `pathways_phase2_*` or `pathways_phase4_*`
database that already has 0042 applied. It rolls back all fixtures.

The suite verifies that `p08_activity_beneficiaries_reached` sums an activity's `APPROVED`
`activity_updates.beneficiaries_reached_this_session` values (treating NULL as 0), excludes
PENDING and REJECTED updates, and that a `VERIFIED` update is structurally impossible on
`activity_updates` (its CHECK constraint rejects it, so it can never contribute). It confirms an
approved proof later rejected lowers the total, that an activity with no updates reports zero
rather than null, cross-project isolation (an activity from another project in the same
organization is rejected and the other project's own total is unaffected), cross-organization
isolation in both directions, and that the function's owner, ACL, `SECURITY DEFINER` mode, empty
search path, and `(activity_id, beneficiaries_reached)` signature are unchanged from the 0000
baseline. Success prints `PROOF_SESSION_BENEFICIARY_COUNT_RUNTIME=PASS`.

## Activity progress review (migration 0044)

`activity-progress-review-runtime.sql` covers the progress-only review path. Run it as a local
superuser against a disposable `pathways_phase2_*` or `pathways_phase4_*` database that already
has 0044 applied and its cleanup run. It rolls back all fixtures.

The suite runs each review exactly as the API does: as a `pathways_runtime` session with the
`app.*` context, through `f10_begin_source_operation`, the two DML statements and
`f10_finish_source_operation`. It verifies that an assigned M&E officer approves and returns a
pending progress-only update (no evidence, below 100 percent) while the activity is
`IN_PROGRESS`, that approve applies only the progress percent and return leaves it unchanged, and
that an unassigned M&E officer, a cross-organization M&E officer, an assigned Project Manager
(no `evidence.review`) and the submitter are all rejected. It also confirms the unchanged rules:
a proof update with evidence is still not reviewable while `IN_PROGRESS`, a completing 100 percent
progress-only update and a stale `expectedUpdatedAt` are still refused, and `FOR_REVIEW` proof
approve and return still succeed. Last, it checks both replaced functions' owner, `SECURITY
DEFINER` mode, empty search path, ACL and body digest, and that the temporary owner chain and lent
schema CREATE rights are gone. Success prints `ACTIVITY_PROGRESS_REVIEW_RUNTIME=PASS`.

## Default registration form (migration 0040)

`default-registration-form-runtime.sql` covers `cr-pathways-default-registration-form`. Run it
as a local superuser against a disposable `pathways_phase2_*` database that already has 0040
applied. It first revokes every prisma role membership inside its own transaction, so all checks
run in the hosted post-0031/0034-cleanup role state, and it rolls everything back. It must print
`DEFAULT_REGISTRATION_FORM_ASSERTIONS_PASSED=12`.

`default-registration-form-concurrency.mjs` needs committed fixtures: load
`default-registration-form-concurrency-fixture.sql` into a fresh disposable database, then run
the script from `apps/api` with `PHASE2_RACE_DATABASE`, `PHASE2_OWNER_PASSWORD` and
`PHASE2_RUNTIME_PASSWORD` set to local-only values. It must print
`DEFAULT_REGISTRATION_FORM_CONCURRENCY=PASS`.
