# PATHWAYS Operating Position

Updated: 2026-09-26. Registry and statuses live in `index.md`.

## Milestone

CSV RBAC realignment is the authorized phase on `dev`, before core-feature repairs. The [Change Record](cr-pathways-csv-rbac-realignment.md) is Approved and the [auth RFC](rfc-pathways-auth-rbac-isolation.md) remains Working until verification and PATHWAYS-dev application match the matrix. Local enforcement and replay checks are verified; development application remains pending. Core feature usability is not implied by existing handlers or grants.

## Open signals

- PATHWAYS-dev migration 0020 has an unexplained checksum mismatch; the original applied SQL is unavailable, and the developer approved this historical checksum exception. Development application proceeds after preview and backup checks. Preserve history and ledger entries.
- Migration 0015 checksum matches the unchanged SQL with CRLF line endings.
- Finance final-sign-off, evaluation, reporting, alerts/recommendations, publishing, and some administrative/form handlers remain deferred.
- Beneficiary identity reconciliation and unlisted discretionary actions remain denied under the approved CSV contract.
- Existing target beneficiaries and project target goal are preserved in project creation and the activity/indicator workflow.
- Production runtime and deployment completion require independently verified evidence.

## Boundaries

- `master` deploys; `dev` develops.
- No production release or subsequent core-feature repairs are authorized by this phase.
- SSO and AWS hosting stay deferred.
- No runtime AI/ML feature is approved.
