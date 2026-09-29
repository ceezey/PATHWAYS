# Change Record: proof-session-beneficiary-count

**ID:** `cr-pathways-proof-session-beneficiary-count`
**Date:** 2026-09-29
**Status:** Approved

## 1. Trigger

The Submit proof dialog (`apps/web/src/features/projects/activity-proof-dialog.tsx`) already renders a
"Beneficiaries reached this session" field, but it is disabled with a "not available yet" hint because
no backend field exists to hold the value. The developer decided on 2026-09-29 that an officer may
record an optional whole-number session count on the proof submission itself.

## 2. Current Contract

`pathways.activity_updates` (migration `0041_activity_media_evidence` is its most recent column-shape
change) has no field for a session beneficiary count. `reserveProof` in
`apps/api/src/modules/activities/activities.service.ts` writes one row per Submit-proof reservation
to this table and compares `progressPercent`, `note` and the declared evidence set on a
`clientUpdateId` retry (`ConflictException` on a mismatch). The activity's `beneficiariesReached` is
computed separately from participation records through
`pathways.p08_activity_beneficiaries_reached` and never reads `activity_updates`. The
`pathways_rules_internal.canonical_source_request` function enumerates the `ACTIVITY_PROOF_FINALIZE`
body as exactly `updateId`, `progressPercent`, `note`, `files` (migration 0041); `finalizeBody` in the
service only ever constructs that same shape, so the session count, which never needs to reach the
rules pipeline, is never part of it.

## 3. Proposed Change

Add a nullable `beneficiaries_reached_this_session` integer column (0-100000) to
`pathways.activity_updates`, set at reserve time from an optional DTO field, included in the
idempotent retry comparison, and surfaced on the activity's update history. It does not change
`beneficiariesReached`, does not enter `finalizeBody`/`canonical_source_request`, and is not read by
SADDD.

## 4. Impact

### Product
Officers can record a per-submission attendance estimate alongside proof without it silently
influencing the activity's derived reach metric.

### Data / Migration
Migration `0042_proof_session_beneficiary_count`: adds the nullable column with a
`CHECK (beneficiaries_reached_this_session IS NULL OR beneficiaries_reached_this_session BETWEEN 0 AND 100000)`
constraint on `pathways.activity_updates`, which is owned by `prisma` since the 0000 baseline and
never reassigned by a later migration (verified: no `OWNER TO` statement touches it after baseline).
No preprovision script, role switch or grant change is needed. The
`pathways_rules_internal.canonical_source_request` function is unchanged: the new field is never
placed in a `finalizeBody` payload, so it never needs to pass that function's field enumeration.

### Authorization / Privacy
No new authority. The field is reserved under the existing `activities.proof.submit` check and an
active personal activity assignment, identical to every other reserve field. It is not aggregated,
not exposed to aggregate-only roles as a computed total, and does not feed SADDD suppression.

### API
`ReserveActivityProofDto` gains an optional `beneficiariesReachedThisSession` (int, 0-100000).
`reserveProof` persists it on create and folds it into the existing retry-conflict comparison, so a
retry with a different value raises the same `ConflictException` as a changed note or progress
percent. The activity detail's `updateNotes` history exposes the stored value.

### UI
The Submit-proof dialog field is enabled; its hint changes from "not available yet" to state that the
value is recorded with the proof only and does not change the activity's beneficiaries-reached total.
Client validation: empty is allowed; otherwise a whole number from 0 to 100000.

### Tests
`activity-proof-media.test.ts`: happy path (value persisted and returned), invalid values (negative,
fractional, over 100000) rejected at the DTO boundary, a retry with a changed value conflicts, and a
cross-project reservation attempt is still denied before any read. `activity-proof-dialog.test.tsx`:
enabled-field rendering, client-side bounds validation, and the value carried into the reservation
request and the locked set after a partial failure.

### Documentation
This CR, its `docs/index.md` entry, an SDD note, QAD rows, and a pointer from
`cr-pathways-activity-progress-media.md` section 9.1.

## 5. Alternatives Considered

Storing the count on `evidence_media` per file was rejected: the count is a per-submission estimate,
not a per-file fact, and duplicating it across files would need its own consistency rule for no
benefit. Feeding it into `beneficiariesReached` was rejected by the developer decision: that metric
stays derived only from participation records, so an officer's manual estimate cannot silently
override or blend with it. Restraint: no new endpoint, table, permission or rules operation was added;
this is one column and one DTO field on an existing path.

## 6. Migration / Rollback

Forward-only, additive: `ALTER TABLE ... ADD COLUMN ... CHECK (...)`, following the `0036`-`0041`
migration-identity and advisory-lock conventions. Rollback is a later forward migration dropping the
column; existing rows are unaffected since the column is nullable with no default read elsewhere.

## 7. Verification

- `pnpm -r typecheck`, `pnpm exec biome check apps packages docs` (or `pnpm lint`),
  `pnpm --filter @pathways/api test`, `pnpm --filter @pathways/web test`, `pnpm docs:check`,
  `pnpm sad:check --base origin/dev --head HEAD`.
- The listed new test cases pass locally against the updated schema (no hosted database is touched by
  this change).

## 8. Approval

Developer decision, 2026-09-29: officers may type an optional whole-number "Beneficiaries reached this
session" on Submit proof; stored on the proof submission only; must not change the activity's computed
`beneficiariesReached`; must not feed SADDD.

## 9. Disposition

Applied on `feature/proof-session-beneficiary-count`. Migration `0042` adds the column locally; hosted
application follows the standard release sequence and is not claimed here. No scope was deferred.
