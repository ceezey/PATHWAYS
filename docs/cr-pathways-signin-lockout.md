# Change Record: Sign-In Lockout

**ID:** `cr-pathways-signin-lockout`  
**Date:** 2026-10-01  
**Status:** Approved by developer 2026-10-01 (implemented on branch `feat/f1-signin-lockout`; migration 0046 not applied to any database)

## 1. Trigger

PRD gate G-F1-10 (the app locks sign-in after repeated failures) was Not met; audit finding MA-04 and a deferred-features entry tracked it. The developer approved building it on 2026-10-01.

## 2. Current Contract

Sign-in ran directly from the browser to the identity provider. The API had no failed-attempt counter; the only lockout in code is the step-up PIN (PRD-F3).

## 3. Proposed Change

- New public route `POST /auth/sign-in` (email and password). The API checks a lockout counter, performs the identity-provider password grant, and returns the session tokens.
- Policy: 5 failed attempts within 15 minutes lock the identifier for 15 minutes. The PRD gives no figures; the constants live in migration 0046.
- Uniform behavior: a locked identifier returns `429 SIGN_IN_LOCKED` with one message for known and unknown accounts, and the password is not checked while locked. A rejected credential returns the same `401` for both.
- A success deletes the counter. A provider outage or provider rate limit is not counted as a failure.
- Audit: the lockout transition writes `SIGN_IN_LOCKED` (entity `Authentication`) for real accounts only; unknown identifiers have no organization to attribute.
- Web: the sign-in form posts to the API route, installs the returned session with `setSession`, and shows the lockout message in its existing error paragraph.

## 4. Impact

### Product
Staff are locked out for 15 minutes after repeated failures.

### Data / Migration
`0046_signin_lockout`: table `pathways.signin_lockouts` (SHA-256 of the lowercased email, count, lock time), RLS on, no role grants, owner-only SECURITY DEFINER functions for `pathways_runtime`. Rows idle for a day are purged on write. Additive only.

### Authorization / Privacy
The counter stores only an email hash; the password is never logged, audited or echoed. The route is `@Public` and takes only email and password.

### API
New route and `SIGN_IN_LOCKED` code (429, `retryAfterSeconds`).

### UI
One new message on `/login`; no new components.

### Tests
`signin-lockout.test.ts` (API), `signin-request.test.ts` (web); QAD-T39.

### Documentation
PRD G-F1-10 Met, UC-F1-1, QAD-T39, deferred-features entry removed.

## 5. Alternatives Considered

- Restraint: descope the gate (not chosen by the developer).
- Identity-provider-only limits: not configurable to a per-account lockout with an audit event.
- Client-reported failures: rejected, since anyone could lock any account without a password attempt.

## 6. Migration / Rollback

Apply 0046 through the normal staged chain after 0045; it asserts the 0045 ledger state. Rollback drops the four functions and the table and reverts the web change so sign-in calls the provider directly.

## 7. Verification

API unit tests (happy, sad, abuse), web request tests, `tsc` and biome on both apps. The 0046 SQL has not been run against a database; a runtime SQL test on the staging role is required before release.

Migration 0052 runtime SQL (`signin-password-hook-runtime.sql`) passes 8 assertions on the local stack (`SIGNIN_PASSWORD_HOOK_RUNTIME=PASS`); the e2e spec also posts a direct password grant for a locked email and gets a non-2xx response (QAD-A25). The Replay-Local wiring is not yet verified.

Local stack run (2026-10-01, 0000-0052 chain, API 4000, web 3000): `apps/web/e2e/signin-lockout.spec.ts` (QAD-T86) passed 3 of 3: lock after 5 failures (429 SIGN_IN_LOCKED, correct password refused, staff login shows the locked message), identical unknown/known failure responses, and sign-in succeeding after `locked_until` is moved into the past. The run found one defect: `signin_lockout_reset` returns void, which Prisma cannot read as a result column, so every successful sign-in returned 503; the call now selects a literal (`signin-lockout.service.ts`, covered in `signin-lockout.test.ts`).

## 8. Approval

Developer decision, 2026-10-01: build G-F1-10.

## 9. Disposition

Residual risk: anyone can lock a known email for 15 minutes at a time. The direct-grant bypass is closed by migration 0052, which adds the password-verification-attempt hook `pathways.p52_password_verification_attempt` (read-only, executable only by `supabase_auth_admin`; failures are still counted only by the API). Mark Applied after 0046 and 0052 are applied, their runtime SQL tests pass, and the staging hook below is enabled.

### Staging hook handoff (developer step)

After 0052 is applied on `PATHWAYS-role-staging`, in the Supabase dashboard open Authentication, Hooks, Password Verification Attempt, choose Postgres function, select `pathways.p52_password_verification_attempt`, and enable it. Local stacks enable it through `supabase/config.toml` (`[auth.hook.password_verification_attempt]`). Rollback: disable the hook, then drop the function.
