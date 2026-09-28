# Change Record: Server-Verified Beneficiary Step-Up

**ID:** `cr-pathways-beneficiary-step-up`

**Date:** 2026-09-28

**Status:** Approved (Option A, 15-minute window); implemented locally; hosted MFA refresh verification pending

**Approval:** Developer reply on 2026-09-28: "Approve A, 15 min"

## 1. Trigger

`apps/web/src/components/layout/beneficiary-access-gate.tsx` shows a client-only "beneficiary module access PIN" dialog on `/beneficiaries/**` after `RouteAccessGuard` passes its server route check. The PIN is a hardcoded constant compared in the browser, and the dialog displays it to every user. It originates from commit `3ba840a` ("Frontend and mockdata for presentation ONLY"). It adds no security, and the build guide prohibits user-facing prototype or presentation-only behavior.

## 2. Current Contract

- **Manuscript (`IDEA.md`, Control).** Specific Objective 2.2 lists "PIN-based step-up authentication for sensitive modules" as part of role-based access control. The definition of terms describes it as an additional authentication step before sensitive modules or restricted records, including beneficiary-related records, budget evidence and restricted workflow actions. Capability 1 says sensitive modules "may require" it.
- **Registered engineering contracts.** PRD-F1/F3/F4, SDD section 6, the auth RFC, QAD, DSD and SAD do not define step-up. No existing Change Record mentions it.
- **Repository.** The API requires `aal2` (verified MFA) and a password `amr` entry for every protected request (`token-auth.service.ts`, `supabase-auth.guard.ts`, `authorized-operation.ts`). Beneficiary detail authority is server-side (`beneficiaries.records.read` and related grants, project assignment, aggregate-only Program/Grant Manager). No API step-up endpoint exists. `apps/web/e2e/p5-c1.spec.ts` intercepts a non-existent `/api/beneficiary-step-up/verify`.

**Finding:** step-up is a manuscript-level commitment that was never carried into the engineering contract. The current gate satisfies neither: it cannot count as the manuscript's step-up, and it breaks the build guide rule. This contradiction needs a developer decision and is not resolved silently here.

## 3. Proposed Change (recommended: Option A)

Replace the client PIN with a server-enforced **fresh-MFA step-up** for Beneficiary identifying detail.

1. **Server enforcement (authoritative).** Add a step-up requirement to the existing auth boundary for the routes that return or mutate identifying Beneficiary detail:
   - `beneficiaries/projects/:projectId` GET list, `:beneficiaryId` GET/PATCH, `:beneficiaryId/archive`, `:beneficiaryId/enrollments`, `registrations`;
   - `beneficiaries/projects/:projectId/:beneficiaryId/journey` GET and `events` / `corrections` POST;
   - `GET projects/:projectId/beneficiaries` in `authorized-data.controller.ts`.

   The exact route list is fixed at pre-implementation review. Aggregate routes (for example `beneficiary-aggregate`) and aggregate-only roles are unchanged.
2. **Freshness rule.** From the already-verified signed claims, require an `amr` entry with `method` `totp` (or the configured MFA factor) whose `timestamp` falls within a fixed server window, proposed at 15 minutes and clamped against clock skew as the password check is. The server derives this value; the client supplies no step-up value, flag, header or storage.
3. **Denial shape.** A stale step-up returns 403 with the stable machine code `STEP_UP_REQUIRED` and no Beneficiary data or existence signal. The denial check runs after identity/account/org/role/permission/assignment checks and before any Beneficiary query. It does not replace any of those checks.
4. **Audit.** Record step-up denials and successful fresh-factor Beneficiary access with the existing human-attributed audit pattern. Omit tokens, factor IDs and codes.
5. **UI.** Replace the PIN dialog with a re-verification prompt that reuses the existing Supabase MFA challenge/verify flow (`features/auth/mfa-form` pattern). The prompt appears only when the API returns `STEP_UP_REQUIRED`, and the next request carries the refreshed session. Remove the hardcoded PIN, the displayed PIN copy and the "local PIN gate" description. Keep keyboard/focus/live-region behavior. `RouteAccessGuard`'s server route check stays unchanged.

No schema, migration, permission seed, role ceiling or new dependency is required.

## 4. Impact

### Product
Delivers manuscript Objective 2.2 for Beneficiary records with real verification. Budget evidence and restricted workflow actions (also named in the manuscript definition) remain out of scope and can be separate follow-ups.

### Data / Migration
None.

### Authorization / Privacy
Adds a requirement on top of the existing chain and removes none. Aggregate-only roles continue to receive no detail. Forbidden existence must not leak through `STEP_UP_REQUIRED` ordering, so the step-up check follows scope authorization.

### API
New 403 code on the listed routes. Direct API callers with a stale MFA factor are denied, and that behavior is intended.

### UI
The PIN dialog is replaced by an MFA re-verification prompt. No user-facing prototype copy remains.

### Tests
- **API:** fresh/stale/missing/future-dated `totp` `amr`, aggregate-only role unchanged, cross-project denial precedes step-up, direct API attempt, audit emission.
- **Web:** prompt appears only on `STEP_UP_REQUIRED`, retry after verify, no browser-storage authorization, accessibility.
- **Remove/replace:** `beneficiary-access-gate.test.tsx`, `lib/auth/beneficiary-step-up.test.ts`, the gate mock in `route-access-guard.test.tsx`, the gate string in `ui-copy-cleanup.contract.test.ts`, and the `2468` steps in these e2e specs: `demo-post-handoff-followup`, `demo-post-handoff-ui`, `demo-systemrevision-phase2/5/7`, `demo-workflows`, `p5-c1`, `phase4-final`, `smoke`.

### Documentation
Add step-up to PRD-F1, SDD section 6, the auth RFC (Security Rules, Required Tests) and new QAD abuse rows. Update the index Change Log.

## 5. Alternatives Considered

- **B: Server-verified per-user PIN (literal manuscript wording).** Store a salted slow hash per system user, add a verify endpoint with rate limiting and lockout, issue a short-lived server-side grant bound to the session, and provide a reset/admin flow. This requires a schema and migration, a new secret class to manage and recover, and brute-force controls. It adds a weaker knowledge factor on top of existing TOTP MFA. It is heavier and adds less security than A. Choose it only if the manuscript's "PIN" wording must be met literally.
- **C: Remove the gate and step-up entirely (restraint option).** Delete the gate and its tests and keep `RouteAccessGuard`. Every request already requires `aal2`. Record a documented deviation from manuscript Objective 2.2, justified because login-time MFA already exceeds a PIN. This is the simplest option, but it drops a stated capstone objective and needs explicit developer acceptance of that deviation.
- **D: Keep the client PIN but hide the value.** Rejected. It remains frontend-only security and still ships a hardcoded secret in the bundle.

## 6. Migration / Rollback

No database change. Deploy the API enforcement and web prompt together in one release. Rollback reverts both. Do not ship the API requirement without the prompt, because detail pages would dead-end. Do not ship the prompt alone as security.

## 7. Verification

- Pre-implementation SAD review of the proposed changed paths: design-qa-agent, beneficiary-privacy-guardian (controllers), organization-isolation-checker (any `*.service.ts` touched).
- Section 4 tests pass: `pnpm lint`, `pnpm typecheck`, affected API/web unit tests and updated e2e specs with synthetic users.
- Final digest-bound SAD sign-off (`pnpm sad:check`, `pnpm sad:signoff`).
- Confirm on a Supabase development project that MFA challenge/verify refreshes the `amr` `totp` timestamp in the new access token. This is an assumption until verified. If it fails, fall back to Option B or C by developer decision.

## 8. Approval

Developer reply on 2026-09-28: "Approve A, 15 min". Manuscript Objective 2.2 step-up is a required engineering contract for Beneficiary identifying detail, delivered as Option A with a 15-minute freshness window. Options B and C are not adopted.

**Amended 2026-09-28** by the approved [Beneficiary step-up PIN fallback](cr-pathways-beneficiary-step-up-pin.md): a bounded form of Option B (user-set PIN, session-bound 15-minute grant, lockout at 5 and TOTP-only unlock) is adopted alongside Option A. TOTP stays primary and Option A is otherwise unchanged. Option C remains not adopted.

## 9. Disposition

**Implemented locally (2026-09-28).**

- **API.** `token-auth.service.ts` derives `mfaVerifiedAt` from the latest valid signed TOTP `amr` entry. `beneficiary-step-up.ts` sets the 15-minute window. `RequireBeneficiaryStepUp` marks the section 3 routes. `SupabaseAuthGuard` calls `BeneficiaryStepUpService` after the permission check. The service first verifies the route `:projectId` against the server-resolved `projectScope` (uniform 404 `Project unavailable.`; 503 if scope cannot be verified), then evaluates freshness. `GET /auth/step-up/status` uses the `workspace-discovery` boundary (aal2, no business data).
- **Audit.** One audit row per verified factor or denial reason is written per instance (best-effort in-memory dedupe; duplicates across instances are harmless). A failed denial audit still denies. A failed acceptance audit withholds access with 503.
- **Web.** The hardcoded PIN and its copy are removed. `BeneficiaryAccessGate` preflights the server status on `/beneficiaries/**` and elsewhere prompts on the API's `STEP_UP_REQUIRED` (for example `survey-subject-picker.tsx`, which reads the step-up-protected Beneficiary list). Re-verification reuses `verifyTotpCode`, and the server status must then report fresh. No browser storage is used.
- **Tests.** Tests were added or replaced across API guard, token and route coverage and the web gate, client and route-guard tests. Nine prototype-era e2e specs now use a status-only stub (`e2e/fixtures/step-up.ts`). They are not part of CI and were not executed here.
- **Docs.** PRD-F1, SDD section 6, the auth RFC (section 2) and QAD-A11/A12 are updated.

**Still pending before Applied.** Final digest-bound SAD sign-off. Confirmation on the Supabase development project that MFA challenge/verify refreshes the TOTP `amr` timestamp in the new access token (section 7). An authenticated end-to-end run.
