# Change Record: Core RBAC and Identity Review

**ID:** `cr-pathways-core-rbac-identity-review`
**Date:** 2026-10-01
**Status:** Approved

## 1. Trigger

Developer decisions of 2026-10-01 on audit findings: System Administrator is aggregate-only but holds `journeys.read`; G-F3-6 / MA-14 / UC-F3-3 leave duplicate review unreachable because `beneficiaries.identities.review` is granted to no role; G-F5-1 / UC-F5-1 do not state who publishes a form the author cannot publish.

## 2. Current Contract

- `journeys.read` is granted to System Administrator, Project Officer, M&E Officer and Project Manager (CSV rows 55 and 56 list System Administrator; [cr-pathways-revised-rbac-baseline](cr-pathways-revised-rbac-baseline.md) added it).
- `beneficiaries.identities.review` is granted to no role. The Duplicate Review page shows an unavailable notice and no controls; no queue or decision route exists.
- `metadata.service.ts` refuses publication by the form's author. The PRD does not name the second publisher.

## 3. Proposed Change

A. Remove `journeys.read` from System Administrator, which closes individual beneficiary journey history and events to it. System Administrator keeps `journeys.manage` and its project-level Journey Stages configuration: the stage list route authorizes `journeys.read` OR `journeys.manage`, and the stage and mapping select policies are amended to allow `journeys.manage`. Beneficiary journey history and events stay on `journeys.read`, step-up and beneficiary-record access. This departs from CSV rows 55 and 56 by developer decision; the locked CSV hash is unchanged and the departure is recorded as the `amendments` entry for migration 0047 in `rbac-contract.json`.

B. Grant `beneficiaries.identities.review` to M&E Officer only. Add two audited routes, both requiring the grant, a fresh step-up and project assignment: `GET /beneficiaries/projects/:projectId/duplicate-candidates` lists unreviewed pairs of enrolled profiles with the same name and birth date; `POST .../duplicate-candidates/resolve` records `KEEP_DISTINCT` or `LINK`. Both decisions write an audit event and move no profile data: "merge" is a linkage decision that removes the pair from the queue, not a physical merge. The Duplicate Review page shows the queue and both controls.

C. Documentation only: the author rule stays. Roles holding `forms.publish` are System Administrator and M&E Officer; Project Officer does not hold it. A second holder (another M&E Officer or a System Administrator) must publish.

## 4. Impact

### Product
Duplicate review becomes usable by M&E Officers. Physical merge of profiles stays out of scope.

### Data / Migration
Migrations `0047_revoke_sa_journeys_read` (also recreates the `p05_stage_select` and `p05_mapping_select` policies to admit `journeys.manage`) and `0048_identity_review_grant` wrap the 0035 `p09_role_allows` matrix (renamed `p09_role_allows_0035`) and adjust `role_permissions`. Not applied by this change; staging and hosted application follow the usual gated process. Amended before any hosted apply: 0047 copies the EXECUTE grants of the renamed function to the new one and 0047, 0048 and 0051 assert ACL parity (a missing grant denied rules recommendation outcomes).

### Authorization / Privacy
System Administrator can no longer read beneficiary journey history or events. Listing and saving project journey stages is unchanged for it. The review routes return only code, name, birth date, location and last-updated date; no contact data.

### API
Two routes in the beneficiaries module; no change to the registration endpoint. `RequirePermission` and the guard accept several permissions (any one suffices) and `withAuthorizedOperation` takes an `alsoAllow` option; only the stage list route uses them.

### UI
`duplicate-resolution-workspace.tsx` loads the queue and enables Keep distinct and Merge (link) with a confirmation dialog; the link to the page shows for roles holding the review grant.

### Tests
`csv-rbac.test.ts` (amendments with revokes), `journeys-access.test.ts` (System Administrator lists and saves stages; beneficiary history 403 even with a claimed permission), `identity-review.service.test.ts`, `duplicate-resolution-workspace.test.tsx`, `ui-action-availability.test.ts`, `metadata.service.test.ts` (author cannot publish in any role).

### Documentation
PRD F3, F4 and F5 gates and use cases, QAD rows, RBAC RFC matrix, deferred-features register and index.

## 5. Alternatives Considered

Leave duplicate review unreachable (restraint option, rejected by the developer). Persist held registrations in a review table (needs a schema change; the audit trail is enough for a link or keep-distinct decision). Physical merge (moves enrollments, submissions and consent; deferred).

## 6. Migration / Rollback

Apply 0047 then 0048 through the gated migration process. Roll back by a forward migration that restores the 0035 function name and the two grant rows.

## 7. Verification

API auth, beneficiaries, participants and metadata tests; web beneficiaries and RBAC tests; `tsc` and Biome. Hosted replay of 0047 and 0048 is pending.

## 8. Approval

Developer decisions A, B and C, 2026-10-01.

## 9. Disposition

Code, migrations and documents are in the branch `feat/f3-f4-rbac-identity-review`. Mark Applied after the migrations run on staging. The inventories in `infra/supabase/phase6/Verify-Forward.ps1` and `scripts/db/hosted-plan.mjs` carry 0047 and 0048 on `integrate/core-features`; 0051 now wraps the function as left by 0048.
