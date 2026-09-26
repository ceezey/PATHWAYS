# PATHWAYS Operating Position

Updated: 2026-09-26. Registry and statuses live in `index.md`.

## Milestone

CSV RBAC realignment is applied on `dev`. The [Change Record](cr-pathways-csv-rbac-realignment.md) is Applied and the [auth RFC](rfc-pathways-auth-rbac-isolation.md) is Locked. Local enforcement, replay checks, PATHWAYS-dev, and both Vercel development previews match the matrix. Core feature usability is not implied by existing handlers or grants. Subsequent core-feature repairs require separate authorization.

## Open signals

- PATHWAYS-dev migration 0020 has an unexplained checksum mismatch; the original applied SQL is unavailable, and the developer approved this historical checksum exception. Forward migration 0026 is applied following preview and verified backup restoration checks. Historical files and ledger entries remain unchanged.
- Migration 0015 checksum matches the unchanged SQL with CRLF line endings.
- Finance final-sign-off, evaluation, reporting, alerts/recommendations, publishing, and some administrative/form handlers remain deferred.
- Beneficiary identity reconciliation and unlisted discretionary actions remain denied under the Locked CSV contract.
- Existing target beneficiaries and project target goal are preserved in project creation and the activity/indicator workflow.
- Production runtime and deployment completion require independently verified evidence.

## Boundaries

- `master` deploys; `dev` develops.
- No production release or subsequent core-feature repairs are authorized by this phase.
- SSO and AWS hosting stay deferred.
- No runtime AI/ML feature is approved.
