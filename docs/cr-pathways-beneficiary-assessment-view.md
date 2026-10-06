# Change Record: Beneficiary assessment view

**ID:** `cr-pathways-beneficiary-assessment-view`
**Date:** 2026-10-06
**Status:** Implemented (2026-10-06; on origin/dev 91f77177, PR #45; no migration)

## 1. Scope

- API: `GET projects/:projectId/evaluation/assessments?enrollmentId=<uuid>` lists one enrollment's
  assessment results (at most 100, ordered by assessment date then id) with id, type, activity id,
  the stage of that activity (first `activity_journey_stage_mappings` row by sequence, else null),
  score, maximum score, assessment date and recorded time. It returns no beneficiary fields and no
  form answers.
- Web: the beneficiary detail loader reads that list and fills `beneficiary.assessments`. "View
  assessment" is enabled when the enrollment has results and opens a dialog with the enrollment's
  results (selected stage first, each with stage and date) and the change from the latest pre-test
  to the latest post-test across stages. The button is disabled with a reason when there are no
  results or the read failed.
- No migration, no new permission, no write path.

## 2. Permissions

Same as the single assessment read: `assessments.detail.read`, Beneficiary step-up, refusal of
System Administrator, Program Manager and Grant Manager before any query, a second requirement of `beneficiaries.records.read`, a live (not archived) Beneficiary, organization, project
and `projectScope(actor)` scoping. The enrollment must belong to the project and organization, or
the API answers 404. The web asks only when `assessments.detail.view` is available; a denied or
failed read leaves the page usable with no assessments.

## 3. Rollback

Revert the three branch commits. No data or schema is affected.
