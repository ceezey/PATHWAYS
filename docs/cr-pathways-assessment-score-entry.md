# Change Record: Assessment Score Entry

**ID:** `cr-pathways-assessment-score-entry`  
**Date:** 2026-10-19  
**Status:** Approved (developer, 2026-10-19)

## 1. Trigger

Tool defense revision matrix, Panelist 2 (Mr. Violeta), item 7: create a post-test activity, enter sample results, and show how the rule applies. No service writes `assessment_results` (deferred register row "Application write path for assessment results"), so results cannot be entered in the app. Developer decision 2026-10-19: build manual score entry from the assessment icon in the journey stages. Companion to [cr-pathways-severity-classification](cr-pathways-severity-classification.md).

## 2. Current Contract

- Journey stage detail panel (`journey-tab.tsx:101-164`) has a **View assessment** icon that opens the read-only `assessment-dialog.tsx` ("Assessment results"); it is disabled when the enrollment has no results (`cr-pathways-beneficiary-assessment-view`).
- `pathways.assessment_results` is append-only: no UPDATE or DELETE grant, `p3_guard_source` rejects updates and checks that a non-null `source_submission_id` is a VALIDATED or PROCESSED, non-dummy submission of the same enrollment and of a form on the same activity. CHECK `0 <= score <= maximum_score`, `maximum_score > 0`.
- `pathways_runtime` may INSERT (organization-scoped `p4_runtime_insert`); no permission-restrictive INSERT policy exists. Selecting requires `assessments.detail.read`.
- Permissions: `assessments.read`, `assessments.detail.read` only; no write permission. Assessment detail is refused in code to System Administrator, Program Manager and Grant Manager.
- The rule metric "Average assessment score change" (0060:417-430) reads every valid PRE_TEST/POST_TEST row with an enrollment, latest per enrollment and type. New rows are picked up by the next evaluation without change.

## 3. Proposed Change

### 3.1 Behavior

- The assessment dialog gains a **Record score** action for users holding the new permission. The icon is enabled for them even when the enrollment has no results yet; for others it behaves as today.
- Fields: type (Pre-test or Post-test), score, maximum score (default 100), assessment date (default today, not in the future). The activity is the selected journey stage's activity.
- The server sources the row from the enrollment's validated attendance submission for that activity (earliest for a pre-test, latest for a post-test, matching the seed). With none, it refuses: "Record participation for this stage before recording a score." (builder's call: sourcing is server-side, never chosen by the client).
- Rows are permanent. A mistake is fixed by recording a newer result; the dialog states this before saving. The latest result per type is the one the dialog's "Change from pre-test to post-test" and the rule metric use.
- `recorded_by_id` is the signed-in user.

### 3.2 Authorization / Privacy

- New permission `assessments.record`, granted to Project Officer, M&E Officer and Project Manager (builder's call: the roles that already record participation and read assessment detail). System Administrator and aggregate-only roles are refused in code, as for detail reads.
- Beneficiary step-up is required, as for the read. Project scope via `requireScopedProject`.
- A restrictive INSERT policy on `assessment_results` requires `assessments.record` for the project, so the database enforces it, not only the API.
- Audit log records ids and type only; never scores.

### 3.3 Implementation pattern

Copy the journey-event correction path (`beneficiary-journey.controller.ts:47-64`, `beneficiary-journey.service.ts:199-258`, `journey-requests.ts`) and the permission migration pattern of `0064_evaluation_write_path`. New endpoint under the existing evaluation assessments route, e.g. `POST /projects/:projectId/evaluation/assessments`.

### 3.4 Non-goals

Editing or deleting results; scores for survey types other than pre/post; bulk entry; automatic recording from digital data collection forms (deferred, see register).

## 4. Impact

### Product
Teams record pre/post test scores where they already view them; the severity demo can enter real results.

### Data / Migration
One migration: permission row, `role_permissions` rows, restrictive INSERT policy. No table change. The migration adds a definer provenance guard (`p3_guard_assessment_source`) for `assessment_results` only, because the invoker `p3_guard_source` cannot see validated submissions under runtime RLS; `evidence_media` keeps `p3_guard_source`.

### Authorization / Privacy
As 3.2.

### API
One POST endpoint and shared Zod request/response contracts.

### UI
Record score form in the assessment dialog; icon enablement rule as 3.1.

### Tests
Service: permission, refused roles, step-up, scope, missing attendance source, score bounds, future date, audit without scores. Database: INSERT refused without `assessments.record`; trigger provenance still enforced. Web: form validation, enabled/disabled icon per role, refresh after save. Rule metric picks up an app-recorded row (runtime SQL test).

### Documentation
This record; RBAC matrix and PRD/DSD where assessment permissions are listed; deferred register: remove "Application write path for assessment results" on apply; `index.md`; `activity-log.md`.

## 5. Alternatives Considered

- Demo with seeded results and Test rule only (restraint option): the developer chose to build entry as well.
- Client-chosen source submission: rejected; the server derives provenance.
- Allow edits: rejected; the table is append-only by design.

## 6. Migration / Rollback

Additive migration. Rollback drops the policy and the permission grants; recorded rows remain valid data.

## 7. Verification

SAD pre-review (beneficiary privacy, organization isolation, migration integrity, design QA); tests in section 4; typecheck and build; docs checks; digest-bound SAD sign-off before Applied.

## 8. Approval

Developer decision 2026-10-19 to build score entry from the journey-stage assessment icon. Record approved by the developer on 2026-10-19.

## 9. Disposition

Pending.
