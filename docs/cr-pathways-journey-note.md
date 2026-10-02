# Change Record: journey-note

**ID:** `cr-pathways-journey-note`  
**Date:** 2026-10-01  
**Status:** Applied (2026-10-02; 0049 applied on PATHWAYS-role-staging)

## 1. Trigger

Audit finding MA-06 (`docs/audit-pathways-manuscript-alignment-20261001.md`): the manuscript promises a free-text note on journey records, but gate G-F4-6 was Not met and the deferred-features register carried the gap. The developer approved building it on 2026-10-01.

## 2. Current Contract

UC-F4-2 states that attaching a free-text note is not provided. `BeneficiaryJourneyEvent` has a required-in-practice `description` (1 to 2000 characters, used as the enrollment end reason for closing events) and no separate note. History (UC-F4-4) returns events behind the beneficiary step-up and `journeys.read`.

## 3. Proposed Change

Add a nullable `note` column (1 to 1000 characters, trimmed) to `beneficiary_journey_events`. The record-event body (`EnrollmentJourneyEventDto`) and the correction body (`CorrectJourneyEventDto`) accept an optional `note`; it is trimmed, and a whitespace-only, empty, overlong or non-string value is rejected with 400. History returns `note`. The web record-event and correction forms gain a note field and the history list shows it.

## 4. Impact

### Product
G-F4-6 becomes Met. `description` is unchanged; `note` is separate optional commentary and never becomes the enrollment end reason.

### Data / Migration
Migration `0049_journey_event_note` adds the column and a length and trim CHECK. Existing rows stay NULL. Not applied by this change.

### Authorization / Privacy
No new permission: writes keep `beneficiaries.enrollments.manage` and `participation.record`; reads keep `journeys.read` with the fresh step-up and project assignment. The note is beneficiary-sensitive: it is never logged and never copied into audit `changes`; audit records only `noteAttached: true|false`.

### API
Optional `note` on `POST .../journey/events` and `POST .../journey/events/:eventId/corrections`; `note` in the `GET .../journey` event rows.

### UI
A "Journey note" textarea in the enrollment-status and correction dialogs (max 1000, minimum height 44px) and a rounded-xl note block in the journey history list.

### Tests
`apps/api/src/modules/participants/journey-note.test.ts`: persisted and trimmed (QAD-T52), overlong and whitespace-only rejected (QAD-T83), non-string and audit content abuse (QAD-A24).

### Documentation
PRD G-F4-6 Met and UC-F4-2; QAD-T52 (now Happy), QAD-T83 and QAD-A24; deferred-features entry removed.

## 5. Alternatives Considered

Reuse `description` as the note: rejected, it is required, drives the end reason and is bounded at 2000. A separate notes table: rejected as over-engineered for one optional text field (restraint option chosen: one nullable column).

## 6. Migration / Rollback

Forward-only SQL applied by the DBA through the normal chain. Recovery: `ALTER TABLE ... DROP CONSTRAINT ...; DROP COLUMN "note"` loses only note text; no other data depends on it.

## 7. Verification

`journey-note.test.ts`, `controller-dto-runtime-metadata.test.ts`, `participants.service.test.ts`, web beneficiary tests, `tsc --noEmit` in api and web, biome. Migration apply is pending on staging.

## 8. Approval

Developer decision, 2026-10-01: approved to build G-F4-6 (read gate, UC-F4-2, UC-F4-4, MA-06, deferred-features entry).

## 9. Disposition

Code, migration file and documentation are on branch `feat/f4-journey-note`. Do not mark Applied until migration 0049 is applied to staging and the hosted checks pass.

Verified 2026-10-02: 0049 applied on PATHWAYS-role-staging (ledger 0000-0054 finished, none rolled back).
