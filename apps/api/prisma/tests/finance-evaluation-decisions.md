# Finance, evaluation, and decision database checks

Migration `0004_pathways_finance_evaluation_decisions` adds exactly 13 tables,
bringing `pathways` to 39. It does not seed records, perform business actions, or
change Auth, Storage, Data API configuration, or runtime privileges.

## Local verification

Use a freshly created disposable **localhost** database named `pathways_phase3_*`.
Replay the complete Prisma migration history first. Use another disposable local
database for the history-to-datamodel shadow diff. Never use a hosted database as
a rehearsal/shadow target, and never run `migrate reset` or `db push`.

```powershell
psql -X -w -h 127.0.0.1 -p 55439 -U prisma -d pathways_phase3_revision2 -v ON_ERROR_STOP=1 -f apps/api/prisma/tests/finance-evaluation-decisions.sql
```

The SQL suite rolls back its synthetic fixtures and must print
`PHASE3_ASSERTIONS_PASSED=127`. It covers scope, provenance, actor separation,
invalid-state rejection, immutable definitions/results, numeric rule comparison,
public-state separation, private object-key integrity, and catalog properties.

Use a separate empty disposable clone for the multi-session suite. Its synthetic
fixtures are committed so independent sessions can observe real row-lock waits:

```powershell
$env:PHASE3_RACE_DATABASE='pathways_phase3_races'
$env:PHASE3_LOCAL_PORT='55439'
node apps/api/prisma/tests/finance-evaluation-decisions-concurrency.mjs
```

Expected: `PHASE3_CONCURRENCY_ASSERTIONS_PASSED=6`. The races cover evaluation
submission/score editing, criterion publication/editing, rule activation/condition
editing, rule archival/evaluation, receipt rejection/expense verification, and
budget archival/expense creation. The script constructs only a localhost
connection and never loads Supabase environment files.

When rerunning the Phase 2 regression suite after 0004, retain its behavior tests
and adjust only its local database-name guard and final catalog expectations:
39 tables and 33 RLS-enabled Phase 2/3 tables. Do not rewrite migration 0003.
PostgreSQL 18 adds NOT NULL catalog constraints absent in PostgreSQL 17; compare
`attnotnull` separately and exclude only `pg_constraint.contype = 'n'` from
cross-version constraint fingerprints.

## Workflow contracts

- Budget records preserve category, currency, amount and recorder. Corrections
  use new records; archival requires pending reviews to be resolved. Actual
  spending and remaining budget are derived by `pathways.p3_budget_totals` from
  APPROVED expenses only, never from a second editable total.
- Create an expense PENDING, then its private receipt evidence. Evidence links
  back to the exact expense, submitter, project and budget activity. Attach that
  evidence as the expense's receipt. Verification requires VERIFIED or APPROVED
  evidence. Submitter, verifier and approver are different active profiles in
  the same organization. Rejection needs its own actor, time and reason.
- Submitted financial/evidence content is immutable. An evidence record already
  supporting a verified/approved expense cannot be rejected. Referenced history
  uses RESTRICT, never cascading deletion.
- Assessment sources must be validated, nondummy form submissions with matching
  organization, project, enrollment and form activity. Assessment results are
  immutable; beneficiaries are referenced through project enrollments, not Auth.
- Criterion versions start DRAFT and become immutable when PUBLISHED. A new
  version is a new record. Configure evaluation scores while the evaluation is
  DRAFT; score bounds, maximum, weight and criterion snapshots come from the
  published criterion. Submission requires weights totaling 100 and computes
  the overall score. Thereafter content/scores freeze; independent review and
  signoff preserve actors, times and feedback before archival.
- Rule versions start DRAFT with explicit ALL/ANY mode, allowlisted numeric
  metrics/operators, conditions and recommendation templates. Activation freezes
  their definitions. `p3_evaluate_rule` is read-only: missing metrics do not match,
  unknown/non-numeric inputs are rejected, and BETWEEN includes both endpoints.
  It returns a transparent snapshot and never changes a business record.
- A matching evaluation can be recorded as an immutable `rule_based_alerts`
  snapshot containing the rule version, observed inputs, each condition/result,
  and recommendation templates. Caller-supplied snapshots/severity are replaced
  by database-derived values. Archived rules cannot create new evaluations.
- Decision recommendations preserve evaluated provenance and copied template
  text. Manual recommendations are also supported. NEW -> REVIEWED ->
  RESOLVED/DISMISSED requires human identities, times and explanations; the
  proposer cannot review or decide their own recommendation. Acceptance records
  a decision only. There is no automatic execution, scheduling or business DML.
- Evidence verification/approval is separate from public review. Public state
  proceeds PRIVATE -> FOR_REVIEW -> APPROVED -> PUBLISHED in separate operations.
  Public consideration requires approved, consented, non-identifying media with
  no beneficiary-enrollment link. Public submitter/approver/publisher are distinct.
  Approval does not publish an object, and publication metadata does not change
  the private bucket or grant public access.
- Storage references use bucket `pathways-private` and keys shaped as
  `organizations/<organization UUID>/projects/<project UUID>/evidence/<evidence UUID>/<safe filename>`.
  Report keys use `reports/<report UUID>` in the corresponding position; an
  organization/program report uses `organization` in place of the project UUID.
  URLs, query strings, traversal, encoded segments and backslashes are rejected.
  Hashes and file identities are preserved. Actual upload, object existence,
  content scanning, signed-URL access and storage policy enforcement remain
  separate backend/security work; this migration does not claim to provide them.
- Reports preserve their scope, form/version/activity/stage context and generated
  private artifact. Program-level and project-level scopes are exclusive (a
  project's program is derived through its project). Survey outputs require a
  form and aggregate-only metadata; evaluation reports require signoff. Generated
  reports can be archived but not rewritten or deleted.

## Security boundaries

All 13 tables enable RLS without permissive policies. Helpers use SECURITY INVOKER,
fixed search paths, and no PUBLIC execute grant. The existing six foundation
tables retain their prior RLS state; completing that and the separate runtime role
belongs to Phase 4. Verified caller identity, permissions, project assignments,
aggregate-only access, content redaction and API endpoints remain Phase 5/backend
work. Active actor foreign keys are integrity checks, not proof of caller identity.

Live checks are read-only catalogs, row counts, checksums, migration history and
`prisma migrate status`. Never run either fixture suite against PATHWAYS-dev.
