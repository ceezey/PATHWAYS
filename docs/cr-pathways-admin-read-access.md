# Change Record: System Administrator Read Access

**ID:** `cr-pathways-admin-read-access`
**Date:** 2026-09-28
**Status:** Approved; local implementation verified; hosted application and release pending

## 1. Trigger

After `0027_revised_csv_rbac`, the System Administrator lost `activities.read` and `budgets.read`. Manual testing showed repeated 403 responses: route checks denied the Activities, activity detail and Budget pages, the Evidence view read the activity list, and the project team dialog saved through an endpoint requiring `projects.update`.

## 2. Decision

On 2026-09-28 the developer chose to restore read access for the System Administrator instead of hiding the pages. Admin gains `activities.read` and `budgets.read` only. Activity create, update and proof submission, budget create and update, expense permissions and `beneficiaries.records.read` remain denied. Beneficiary privacy and aggregate-only roles are unchanged.

## 2.1 Local Supabase Service Origin

On 2026-09-28 the developer also approved (option A) accepting a plain-HTTP Supabase service origin only on a loopback host (127.0.0.1, localhost or [::1]) and only when `NODE_ENV` is not `production`. It enables sign-in against the local Supabase stack. HTTPS stays mandatory everywhere else. One shared predicate, `isApprovedServiceProtocol` in `packages/config/src/service-origin.ts`, applies to token verification, the Auth directory and private storage inspection. `pnpm dev:local` pins `NODE_ENV=development` for the local API only. This supersedes the HTTPS-only sentence in [private activity-proof inspection](cr-pathways-private-activity-proof-inspection.md) section 3 for that loopback case only.

## 3. Changes

- `0035_admin_read_access` adds the two grants and replaces `pathways.p09_role_allows` with the 0027 matrix plus the two rows. It is additive, verifies its own postconditions, and leaves applied migrations unchanged.
- `authorization-policy.ts` and `rbac-contract.json` (rows 39 and 40, with an `amendments` entry) carry the same two grants. The contract test checks 0027 grants plus amendments against the contract and the latest ceiling definition.
- Web: team editing requires `projects.update` as well as `assignments.manage`; the Evidence view reads only with `activities.read`; optional activity reads use `principalHasAtomicPermission` and fall back to an empty list.
- [Auth RFC](rfc-pathways-auth-rbac-isolation.md) matrix rows updated.
- `infra/supabase/phase6/Verify-Forward.ps1` reviews 0035 in the forward inventory, carries it through the recovery clones and asserts the two grants, the retained denials and 308 total grants after upgrade.
- Local seed guard tests cover loopback acceptance and refusal of hosted, remote, disguised and missing targets.

## 4. Verification

- API, web and config tests, typecheck and lint pass.
- On a fresh local Supabase replay, all migrations through 0035 apply and match the ledger.
- Signed in with MFA on the local stack: Admin receives 200 for the Activities and Budget route checks and the activity list, and 403 for Beneficiaries. Program Manager receives 403 for beneficiary records and Project Manager receives 200.

## 5. Disposition

Mark Applied after hosted application with a protected backup, development preview verification and release. The same release adds the local Supabase tooling described in the [local development runbook](runbook-local-dev.md).
