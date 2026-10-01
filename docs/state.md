# PATHWAYS Operating Position

Updated: 2026-10-01. Registry and statuses live in `index.md`.

## Milestone

The suite is reconciled to one canonical baseline under [the documentation reconciliation Change Record](cr-pathways-doc-reconciliation-2026-10-01.md) (Applied): repository, then rev-2026 manuscript, then the new design foundations as target only. The UI migration to those foundations, the AWS strategy and every Not met gate are registered in [deferred-features](deferred-features.md). Production release is gated by the [manuscript alignment audit](audit-pathways-manuscript-alignment-20261001.md).

The earlier [revised RBAC and migration baseline Change Record](cr-pathways-revised-rbac-baseline.md) is Applied and remains the authorization baseline.

## Open signals

- PATHWAYS-dev migration 0020 has an unexplained checksum mismatch; the original applied SQL is unavailable, and the developer approved this historical checksum exception. Forward corrections 0027/0028 and the baseline registration are verified following preview and isolated backup restoration checks. Historical bytes remain in the approved immutable archive; ledger entries remain unchanged.
- Migration 0015 checksum matches the unchanged SQL with CRLF line endings.
- Finance sign-off, evaluation, reporting, alerts/recommendations and publishing are implemented through migrations 0029-0034 and verified on a synthetic local replay; PATHWAYS-dev remains at 0028 and hosted installation is pending. Indicator-based rules need an eligibility approval path that does not exist yet.
- Beneficiary identity reconciliation and unlisted discretionary actions remain denied under the Locked CSV contract.
- Target beneficiaries remain active. [Approved project target-goal retirement](cr-pathways-retire-project-target-goal.md) removes live inputs, outputs and comparisons while preserving its database column/history and independent indicator targets; implementation/verification remain pending.
- Production runtime and deployment completion require independently verified evidence.

- RBAC v4 is the documented access source of record; the running contract keeps the earlier matrix until the RBAC v4 grant migration lands ([cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md)).
- The manuscript alignment audit records 18 findings (2 High, 9 Medium, 7 Low); each needs a Change Record, a deferral or evidence it is false before any production release.
- UAT under ISO/IEC 25010 has not been run, so Objectives 3.1 to 3.8 have no results.

## Assumptions

- The Figma component board is sample UI; DSD and the foundations decide every design value.
- The new brand, color and UI foundations are a design target; the shipped UI keeps the current tokens until an approved change migrates it.
- Missing source material (UES, GTM, PITCH, WRAP, OPS SLOs, funding and cost figures) is Not established until the developer answers the questionnaire.

## Next step

Task 19 questionnaire to the developer, then the questionnaire-driven docs, the index and log rewrite, and integration into `dev`.

## Boundaries

- `master` deploys; `dev` develops.
- No production release or subsequent core-feature repairs are authorized by this phase.
- SSO and AWS hosting stay deferred.
- No runtime AI/ML feature is approved.
