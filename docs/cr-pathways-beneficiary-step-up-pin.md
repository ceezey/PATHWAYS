# Change Record: Beneficiary Step-Up PIN Fallback

**ID:** `cr-pathways-beneficiary-step-up-pin`

**Date:** 2026-09-28

**Status:** Approved; implementation pending

## 1. Trigger

On 2026-09-28 the developer decided to keep MFA (TOTP) step-up as the primary check for Beneficiary identifying detail, and to add a user-set PIN as a fallback. The PIN is set on first Beneficiary access and can be changed in My Profile.

Audit finding I (2026-09-28, `dev` at `002d3ac`) recorded the current state:

- The hardcoded client PIN is gone.
- Since commit `97d7ed9`, `SupabaseAuthGuard` calls `BeneficiaryStepUpService.enforce` after the permission check (`apps/api/src/common/guards/supabase-auth.guard.ts:178-190`).
- Freshness comes only from the verified TOTP `amr` timestamp, with a 15-minute window and 30-second skew (`apps/api/src/modules/auth/beneficiary-step-up.ts:3-4,11-27`).
- The repository has no per-user settings storage.
- One e2e title still describes the removed deterministic PIN (`apps/web/e2e/demo-workflows.spec.ts:32`).

The manuscript names PIN-based step-up for sensitive modules (`IDEA.md:23`; Specific Objective 2.2 at `:955-957`; the definition of terms at `:1277-1280`). This is supporting context, not engineering authority.

## 2. Current Contract

- **[Beneficiary step-up](cr-pathways-beneficiary-step-up.md) (Approved, Option A).**
  - Server-enforced fresh TOTP for the listed Beneficiary routes.
  - 403 `STEP_UP_REQUIRED` after scope authorization and before any Beneficiary query.
  - Audited acceptance and denial, with tokens, factor IDs and codes omitted.
  - The client supplies no step-up value.
  - Section 5 describes a server-verified per-user PIN as Option B: "heavier and adds less security than A". Section 8 states "Options B and C are not adopted."
- **PRD-F1, the auth RFC (section 2 "Beneficiary step-up") and QAD-A11/A12** encode the TOTP-only rule.
- **Token verification** already carries a verified `session_id` (`apps/api/src/modules/auth/token-auth.service.ts:131,171`), and database contexts check session liveness through `pathways.runtime_auth_session_live` (`apps/api/src/prisma/prisma.service.ts:175-178`).
- **pgcrypto** is created by the baseline (`0000_pathways_baseline_through_0026/migration.sql:17`). On Supabase it is installed in the `extensions` schema.

## 3. Proposed Change

This amends the step-up record by adopting a bounded form of Option B **alongside** Option A. Option A is unchanged.

### 3.1 Enforcement

`BeneficiaryStepUpService.enforce` accepts either:

1. a fresh TOTP `amr`, exactly as today; or
2. a live PIN grant in `pathways.beneficiary_step_up_grants`. The grant must match:
   - the same system user and organization;
   - the verified `session_id` of the current token;
   - a live session;
   - `expires_at` later than the current time.

Other rules:

- Check order, denial shape, audit and the route list are unchanged.
- The grant is looked up only from server-derived identity and session values, never from client input.
- A grant stops working when its session ends, because liveness is rechecked on every request.
- Grants expire 15 minutes after PIN verification.

### 3.2 PIN lifecycle

- **Format:** 6-12 ASCII digits. As proposed hardening, all-identical digits and strictly ascending or descending runs are rejected.
- **Setup:**
  - allowed only when the user has no PIN, and only inside a fresh TOTP step-up confirmed from the verified signed claims;
  - after a successful TOTP step-up on first Beneficiary access, the gate offers "Set a PIN";
  - the user may skip, and is offered it again on a later TOTP step-up.
- **Change:**
  - in My Profile (`own-profile-workspace.tsx`), with either the current PIN or a fresh TOTP;
  - resets the failure counter.
- **Verify:** `POST /auth/step-up/pin` with the PIN in the JSON body only, never in a URL, query string or header. On success the server creates or refreshes one grant for the current user and session.
- **Lockout:**
  - each failure increments the counter under a row lock, so parallel attempts cannot exceed the bound;
  - after 5 consecutive failures the PIN is locked, and a locked PIN is not compared;
  - only a fresh TOTP step-up unlocks it, which also clears the counter.
- **No recovery by others.** No administrator can view, set or reset a user's PIN. A forgotten or locked PIN is always recoverable with TOTP, because every session already requires `aal2`.

### 3.3 Storage (migration `0037_step_up_pin`)

- **`pathways.user_step_up_pins`:**
  - `organization_id` and `user_id`, the primary key, with a composite foreign key to `system_users`;
  - `pin_hash`, a bcrypt hash from `extensions.crypt(pin, extensions.gen_salt('bf', cost))`, with the cost fixed at 10 or higher after measurement on the development project;
  - `failed_attempts` (0-5) and `locked_at` (nullable);
  - timestamps.
- **`pathways.beneficiary_step_up_grants`:**
  - `organization_id`, `user_id`, `session_id` and `method` (`PIN`);
  - `verified_at` and `expires_at`, with a check that `expires_at = verified_at + 15 minutes`;
  - unique per user and session.
- Both tables have row-level security enabled. There are no direct table grants to `pathways_runtime`, and access is revoked from PUBLIC, anon, authenticated and service_role.
- **Functions:** set, change, verify, unlock and grant lookup are SECURITY DEFINER functions with owner `prisma`, an empty `search_path` and qualified names. `EXECUTE` is granted only to `pathways_runtime`. User and organization come from the runtime context. The session ID is passed by the API from the verified token and rechecked with `pathways.runtime_auth_session_live`.
- **Trust boundary.** The database cannot verify a TOTP claim. The API asserts TOTP freshness from verified signed claims before it calls setup, TOTP-based change or unlock.
- The migration asserts that `extensions.crypt` and `extensions.gen_salt` exist, and fails closed otherwise.
- **DBA prerequisite.** In the Supabase role layout the migration owner `prisma` has no `USAGE` on schema `extensions`, so its SECURITY DEFINER functions cannot call pgcrypto. `infra/supabase/phase6/hosted-step-up-pin-preprovision.sql` grants only that `USAGE`, run by `postgres` before 0037. The 0037 guard fails closed without it.

### 3.4 Secrecy of the PIN

- The PIN is passed to the database as a bound parameter, never interpolated.
- These routes are excluded from request-body logging, and error paths return fixed sanitized messages.
- Audit rows record the event, user, method and outcome only. They never contain the PIN, the hash or the attempt input.
- Verify that hosted PostgreSQL settings (for example `log_parameter_max_length_on_error` and `log_statement`) do not record bound parameters for these calls.

### 3.5 Audit events

- `BENEFICIARY_STEP_UP_PIN_SET`
- `BENEFICIARY_STEP_UP_PIN_CHANGED`
- `BENEFICIARY_STEP_UP_PIN_FAILED`
- `BENEFICIARY_STEP_UP_PIN_LOCKED`
- `BENEFICIARY_STEP_UP_PIN_UNLOCKED`
- The existing `BENEFICIARY_STEP_UP_ACCEPTED` gains `method` (`TOTP` or `PIN`).

### 3.6 UI

- On `STEP_UP_REQUIRED`, `beneficiary-access-gate.tsx` offers "Use authenticator" and, when the server status reports an unlocked PIN, "Use PIN".
- `GET /auth/step-up/status` adds `pinState` (`NONE`, `SET`, `LOCKED`). It does not report attempt counts.
- Messages:
  - "Incorrect PIN";
  - "PIN locked. Use your authenticator to unlock it."
- Keyboard, focus and live-region behaviour follow the existing gate.
- Fix the stale e2e title at `apps/web/e2e/demo-workflows.spec.ts:32`.

### 3.7 Security trade-off

A PIN is weaker than TOTP.

- It is a knowledge factor, so it can be observed, reused or guessed.
- A 6-digit PIN has one million values. The bcrypt hash protects against casual disclosure, but not against an offline attacker who obtains the table, because one million bcrypt guesses is feasible.
- The main control is online: 5 attempts and then a lock that only TOTP clears. An attacker holding a live `aal2` session but not the authenticator therefore gets at most 5 guesses.
- With the PIN, the 15-minute re-verification no longer proves possession of the authenticator. It proves knowledge of the PIN inside a session that was opened with MFA.

The developer accepts this trade-off by approving this record.

## 4. Impact

### Product
Users can refresh Beneficiary access with a PIN instead of opening their authenticator every 15 minutes. This delivers the manuscript's PIN wording alongside TOTP.

### Data / Migration
0037 adds two tables, their policies, functions and postconditions. No existing table changes.

### Authorization / Privacy
- No permission or scope change.
- The step-up requirement gains a second, weaker way to be satisfied (section 3.7).
- Check order stays: step-up follows scope authorization, so `STEP_UP_REQUIRED` still leaks no existence.

### API
Adds PIN setup, change, verify and unlock endpoints, and extends the status response.

### UI
The gate offers two methods. My Profile gains "Change PIN".

### Tests
- **Grant validity:** accepted only for the same user and session, and while unexpired. Rejected for another session, after sign-out and after expiry.
- **Setup:** refused without fresh TOTP and when a PIN already exists.
- **Change:** needs the current PIN or TOTP.
- **Lockout:** holds at 5 failures, including parallel attempts; only TOTP unlocks.
- **Secrecy:** the PIN is absent from logs, audit rows and error bodies. PIN rules (length, weak patterns) are enforced.
- **Unchanged behaviour:**
  - aggregate-only roles are still denied;
  - cross-project denial still precedes step-up;
  - TOTP-only behaviour is unchanged;
  - client-supplied grant values are ignored (extends QAD-A12).
- **SQL (0037):** ACL, owner and `search_path` postconditions.

### Documentation
- Step-up record: note the adopted PIN fallback.
- PRD-F1.
- Auth RFC section 2.
- SDD section 6.
- QAD-A11/A12 plus new abuse rows (brute force, session binding).
- Index.

## 5. Alternatives Considered

- **Restraint: keep TOTP only.** This is the approved Option A, with stronger assurance and no new secret. It does not meet the developer's decision.
- **Hash in the API with native `node:crypto` scrypt.** The PIN never reaches the database connection, which removes the parameter-logging concern in section 3.4, and it uses a native capability. The compare and counter update must still be atomic, reading the hash under a row lock in one transaction. This is a valid substitute for `extensions.crypt` if the developer prefers it.
- **Time-based lockout without TOTP unlock.** Allows repeated guessing over time. Rejected.
- **Administrator PIN reset.** Adds a new secret-management authority. Rejected, because TOTP recovery already exists.

## 6. Migration / Rollback

- 0037 is forward-only with the 0030-style migration identity and ledger precondition. Numbers follow merge order: its guard asserts 0035 because 0036 lands in the same wave.
- Rollback disables the PIN endpoints and returns `enforce` to TOTP only, which needs no migration. The tables stay. Deleting stored hashes and grants is destructive and needs separate authorization.
- Hosted application needs separate developer authorization.

## 7. Verification

- Section 4 tests, SQL runtime suites against a reset local database, `pnpm -r typecheck`, `pnpm test`, `pnpm docs:check` and `pnpm sad:check`.
- Digest-bound `pnpm sad:signoff` with reviews from organization-isolation-checker, migration-integrity-guardian, beneficiary-privacy-guardian and design-qa-agent.
- In the local app, PIN setup, lockout, TOTP unlock and change work.
- On the development project, the hosted TOTP `amr` refresh verification still pending from the step-up record also covers PIN setup and unlock.
- **Dependency.** The approved `cr-pathways-performance-scaling` (branch `feature/perf-optimizations`, merged in Wave A) keeps Beneficiary and step-up reads uncached. That rule must hold for PIN state and grant checks.

## 8. Approval

Developer reply on 2026-09-28: "Approve all CRs, Evidence: change constraint, Signed links: no".

## 9. Disposition

Not applied.
