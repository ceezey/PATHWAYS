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

## 3. Proposed Change (superseded; see 3.1)

Add a nullable `beneficiaries_reached_this_session` integer column (0-100000) to
`pathways.activity_updates`, set at reserve time from an optional DTO field, included in the
idempotent retry comparison, and surfaced on the activity's update history.

## 3.1 Developer decision (final, 2026-09-29): the activity's beneficiariesReached is now derived from this field

This decision replaces the earlier "stored only, never changes beneficiariesReached" wording above
(sections 3, 4 Product/Authorization/UI, 5, and 8 as originally approved). The stored column itself
is unchanged (section 3 stands as the data shape); only what reads it changes.

An activity's `beneficiariesReached` is the SUM of `beneficiaries_reached_this_session` over that
activity's `activity_updates` whose `status` is `APPROVED`. `NULL` counts as `0`. `PENDING`,
`VERIFIED` and `REJECTED` updates never count. If an approved proof is later rejected (a corrected
review), the total drops accordingly. Participation-record counts (distinct beneficiaries with a
`PRESENT`/`COMPLETED` participation, a validated source submission, and a real, non-dummy,
non-archived beneficiary) are no longer used for the activity's `beneficiariesReached`; that
computation is retired from `pathways.p08_activity_beneficiaries_reached`.

**SADDD caveat:** SADDD sex/age breakdowns are unaffected and stay sourced from participation
records (`pathways.p06_saddd`, released through the project-overview `beneficiariesReached` tile,
which is a distinct SADDD-derived metric from the activity-level total described here). A typed
per-session count has no sex/age breakdown, so it cannot replace or feed SADDD; the two
`beneficiariesReached` surfaces (activity-level sum of approved proof sessions, and the
project-level SADDD-released distinct-individual count) are intentionally different metrics with
different sources, and this CR does not unify them.

### Consumer inventory (searched across `apps/api`, `apps/web`, `packages`, and migrations for
`beneficiariesReached`, `BENEFICIARIES_REACHED`, `p08_activity_beneficiaries_reached`, and `reached`)

| Consumer | Source | Affected? |
|---|---|---|
| Activity detail/list `beneficiariesReached` (`apps/api/src/modules/activities/activities.service.ts` `readMetrics`/`mapWithMetrics`, surfaced in `activity-detail-panel.tsx`) | `pathways.p08_activity_beneficiaries_reached` | Yes. Now reflects the sum of approved proof-session counts instead of distinct participating beneficiaries. |
| Project overview "beneficiaries reached" tile (`apps/api/src/modules/projects/project-overview-metrics.service.ts`, rendered by `project-overview-metrics.tsx`) | `pathways.p06_saddd` (SADDD release, small-cell suppressed) | No. This tile was never sourced from `p08_activity_beneficiaries_reached`; it is a project-level, date-gated SADDD release of distinct individuals. Unrelated to this change. |
| Public project detail `beneficiariesReached` (`apps/web/src/features/public/public-project-detail.tsx`, `apps/web/src/lib/services/public-projects.ts`) | Currently hardcoded to `null` in the public-projects service | No. Not yet wired to any backend aggregate; unaffected by this change. |
| Rules engine typed metric catalog (`apps/api/src/modules/rules/rule-contract.ts` `ruleMetrics`) | `INDICATOR_CURRENT_VALUE`, `INDICATOR_PROGRESS_PERCENT`, `PROJECT_TIMELINE_ELAPSED_PERCENT`, `PROJECT_REMAINING_DAYS`, `PROJECT_OVERDUE_DAYS`, `ACTIVITY_COMPLETION_PERCENT`, `ACTIVITY_OVERDUE_COUNT`, `ACTIVITY_OVERDUE_DAYS` | No. Beneficiaries-reached is not a rule metric type; the catalog does not evaluate `p08_activity_beneficiaries_reached` at all, so there is no rules-engine divergence to resolve. |
| Activity update history / evidence review (`activities.service.ts` update history mapping) | `activity_updates.beneficiaries_reached_this_session` (raw stored value per update) | No behavioral change; this already reflects the per-submission stored value regardless of review status, as before. |
| Analytics / report exports | (none found referencing `p08_activity_beneficiaries_reached` or `beneficiariesReached` outside the modules above) | No dedicated analytics/report export consumer exists for this field today. |

### Function change

`pathways.p08_activity_beneficiaries_reached` (migration `0042_proof_session_beneficiary_count`) is
redefined with `CREATE OR REPLACE FUNCTION`, preserving its exact signature
(`wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]`), return columns
(`activity_id uuid, beneficiaries_reached integer`), owner (`prisma`), ACL (`pathways_runtime`
only), `SECURITY DEFINER` mode, and empty `search_path`. Only the final `SELECT` changes: it now
`LEFT JOIN`s `pathways.activity_updates` and sums `beneficiaries_reached_this_session` (`NULL` as
`0`) filtered to `status = 'APPROVED'` (and, preserving the prior invariant, excluding cancelled
activities), instead of counting distinct qualifying beneficiaries through the participation join.
Migration 0042 verifies prisma ownership of the function as a precondition and re-verifies owner,
ACL, `SECURITY DEFINER`/search-path, and grants as postconditions.

## 4. Impact

### Product
Officers record a per-submission beneficiary count alongside proof. Once M&E approves that proof,
the count is summed into the activity's `beneficiariesReached`; a later correction (approved proof
rejected) lowers the total accordingly. See section 3.1 for the final rule and its SADDD caveat.

### Data / Migration
Migration `0042_proof_session_beneficiary_count`: adds the nullable column with a
`CHECK (beneficiaries_reached_this_session IS NULL OR beneficiaries_reached_this_session BETWEEN 0 AND 100000)`
constraint on `pathways.activity_updates`, which is owned by `prisma` since the 0000 baseline and
never reassigned by a later migration (verified: no `OWNER TO` statement touches it after baseline).
The same migration also redefines `pathways.p08_activity_beneficiaries_reached` with
`CREATE OR REPLACE FUNCTION`, keeping its signature, return columns, owner, ACL, `SECURITY DEFINER`
mode and empty search path, and changing only the body's final `SELECT` to sum approved session
counts (see section 3.1). No preprovision script, role switch or grant change is needed. The
`pathways_rules_internal.canonical_source_request` function is unchanged: the new field is never
placed in a `finalizeBody` payload, so it never needs to pass that function's field enumeration.

### Authorization / Privacy
No new authority. The field is reserved under the existing `activities.proof.submit` check and an
active personal activity assignment, identical to every other reserve field. Its approved-status
aggregate (the activity's `beneficiariesReached`) is exposed only under the existing
`beneficiaries.aggregates.read` guard already enforced by
`pathways.p08_activity_beneficiaries_reached`; it carries no beneficiary identity and no sex/age
breakdown, and does not feed SADDD suppression.

Amendment 2026-10-04: `pathways.p08_activity_beneficiaries_reached` always returned 0 on hosted
devV2. It runs as its owner `prisma`, which lacks BYPASSRLS, and `activity_updates` forces RLS with
no owner SELECT policy. `ActivitiesService.readReached` now sums approved session counts with a
grouped Prisma query under the `pathways_runtime` role. RLS `p05_activity_updates_select` applies,
plus the app-level `beneficiaries.aggregates.read` gate. Authorized callers get 0 for activities with
no approved sessions. The unused function is recorded in deferred-features.md for repair or
retirement through a reviewed migration.

### API
`ReserveActivityProofDto` gains an optional `beneficiariesReachedThisSession` (int, 0-100000).
`reserveProof` persists it on create and folds it into the existing retry-conflict comparison, so a
retry with a different value raises the same `ConflictException` as a changed note or progress
percent. The activity detail's `updateNotes` history exposes the stored value.

### UI
The Submit-proof dialog field is enabled; its hint states "Counts toward the activity's
beneficiaries reached once M&E approves this proof." Client validation: empty is allowed;
otherwise a whole number from 0 to 100000.

### Tests
`activity-proof-media.test.ts`: happy path (value persisted and returned), invalid values (negative,
fractional, over 100000) rejected at the DTO boundary, a retry with a changed value conflicts, and a
cross-project reservation attempt is still denied before any read. `activity-proof-dialog.test.tsx`:
enabled-field rendering, client-side bounds validation, the updated hint text, and the value carried
into the reservation request and the locked set after a partial failure.
`activity-capabilities.test.ts`: the activity-detail read passes through the database aggregate's
already-summed total unchanged, and reports zero when no row is returned.
`apps/api/prisma/tests/proof-session-beneficiary-count-runtime.sql`: the database aggregation itself
(sums approved sessions, excludes PENDING/VERIFIED/REJECTED, a later rejection lowers the total, NULL
as 0, cross-project and cross-organization isolation, and unchanged owner/ACL/security/search-path).

### Documentation
This CR, its `docs/index.md` entry, an SDD note, QAD rows, and a pointer from
`cr-pathways-activity-progress-media.md` section 9.1.

## 5. Alternatives Considered

Storing the count on `evidence_media` per file was rejected: the count is a per-submission estimate,
not a per-file fact, and duplicating it across files would need its own consistency rule for no
benefit. An earlier draft of this CR kept the count fully separate from `beneficiariesReached`; the
developer's final 2026-09-29 decision (section 3.1) supersedes that, requiring the sum of approved
session counts to become the activity's `beneficiariesReached`, since M&E approval is the same trust
gate the rest of the platform uses before a submitted value affects a computed total. Changing the
SQL function in place (rather than adding a TypeScript-side recomputation) was preferred because the
function is the single point other consumers (activity detail/list) already call; a divergent
TypeScript sum would risk drifting from the database's authoritative value. Restraint: no new
endpoint, table, permission or rules operation was added; this is one column, one DTO field, and one
`CREATE OR REPLACE FUNCTION` body change on an existing path.

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

Developer decision, 2026-09-29 (final, supersedes the earlier same-day "stored only" decision): an
activity's `beneficiariesReached` is the SUM of `beneficiaries_reached_this_session` over that
activity's `activity_updates` whose status is APPROVED (NULL as 0); PENDING, VERIFIED and REJECTED
never count; an approved proof later rejected lowers the total; participation-record counts are no
longer used for the activity's `beneficiariesReached`; SADDD sex/age breakdowns stay on
participation records, since a typed count carries no breakdown. See section 3.1.

## 9. Disposition

Applied on `feature/proof-session-beneficiary-count`. Migration `0042` adds the column and redefines
`pathways.p08_activity_beneficiaries_reached` locally; hosted application follows the standard
release sequence and is not claimed here. No scope was deferred.
