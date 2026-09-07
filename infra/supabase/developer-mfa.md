# Developer MFA preparation and human handoff

This is a runbook, not a phase report or permission to onboard a user.
Binding decision: `docs/SOURCE_OF_TRUTH.md` section 6.1. Step 3 prepares code
locally; it does not lift that gate, provision an administrator, seed data, or
complete Phase 5. No billing upgrade is required for TOTP MFA itself.

## Selected account (not a grant)

- Development project: `PATHWAYS-dev`, ref `pdqwsknbzkdtiwjjibqt` only.
- Existing Auth UUID: `56ad4c1a-113f-401b-84e8-1d2135f174c1`.
- Proposed application display name: `Dev Cian`.
- Proposed organization: `Plan International Pilipinas`, code `PLAN_PH`.

These names and identifiers do not create or elevate anything. In particular,
the Auth UUID is not the future `pathways.system_users.id`. Never match an
administrator by email or assume an Auth/dashboard login grants an app role.

## What the code enforces

1. The server accepts only the configured, exact development Auth endpoint and
   verifies the supplied token using `getClaims(token)` and fresh `getUser(token)`.
   Issuer, audience, expiry, session identifier, subject and non-anonymous status
   are checked. Auth errors are sanitized; tokens are never echoed.
2. Only the selected account can use this developer preparation. Its UUID allows
   MFA setup, not business access. The only pre-MFA application API route is
   `GET /api/auth/mfa/status`; it returns setup state, no business/profile data.
   Public health remains public.
3. All protected routes require signed `aal2` and a currently verified TOTP
   factor. A password-only session, stale token with a removed factor, or browser
   assertion of MFA cannot bypass the server.
4. `PATHWAYS_DEVELOPER_ACCESS_ENABLED` defaults to **false** when unset. Do not set
   it to `true` until a separate documented developer-only onboarding exception
   and the applicable provisioning work are explicitly approved and completed.
   This switch is not an approval, password-security substitute, or admin grant.
5. After that later approval, `/api/auth/me` requires both context selector
   headers: `X-Pathways-Organization-Id` and `X-Pathways-User-Id`. They are UUIDs
   returned by the separately reviewed bootstrap, never passwords. Existing 0005
   RLS verifies their exact linkage to the verified Auth subject. A guessed,
   foreign, inactive, or unlinked context is denied before any profile is returned.
   No administrator connection or Data API is used for application reads.
6. Profile, organization, role, active permissions and active project assignments
   come from the database. Neither `app_metadata` nor `user_metadata` supplies
   authority. Client context selectors are kept in memory and must be re-entered
   after a full reload until a later reviewed context-discovery design exists.
7. Business handlers remain denied until their separate Phase 5 permission and
   project-scope contracts are implemented and reviewed. This preparation does
   not claim complete business authorization or aggregate-only access enforcement.
   Next.js middleware also redirects every protected business page to `/auth/mfa`
   before server rendering, even for `aal2`. Its entry point is
   `apps/web/src/middleware.ts`, alongside `src/app`; a root-level file would not
   be loaded by this project's build.
8. Enrollment happens only on an explicit click; existing verified factors are
   challenged rather than replaced. No factor is deleted automatically. QR/code
   state is private, transient and not sent to application logs or telemetry.

## Local validation (no hosted connection)

From a terminal at `C:\PATHWAYS`:

```powershell
pnpm --filter @pathways/api test
pnpm --filter @pathways/web test
pnpm lint
pnpm typecheck
pnpm build
```

Tests mock Auth and never enroll a live factor. The optional database integration
test has its own explicit opt-in and fixed disposable loopback target; it uses
synthetic fixtures inside an always-rolled-back transaction. Never point a test
or fixture script at Supabase. A successful local test is not proof of a live
account's MFA enrollment or a Phase 5 PASS.

## Existing-account password recovery

Password recovery is restricted to the existing selected development identity;
it is not signup, invitation, profile provisioning, or application elevation.
The request page is `http://127.0.0.1:3000/staff/forgot-password`, and the code
uses only the fixed callback
`http://127.0.0.1:3000/auth/recovery/callback`. The dashboard must already list
that exact allowed redirect before a human sends a recovery message. Do not add a
wildcard, `localhost`, LAN, production, or AWS redirect.

Keep the loopback server running and open the email link in the same browser
profile that requested it. The callback exchanges the short-lived credential
once and removes it from the visible URL immediately. The server verifies the
Supabase-signed `recovery` authentication-method claim, exact issuer, selected
UUID and session ID before issuing an opaque, process-local, one-use grant. That
grant expires after ten minutes. A forged cookie, ordinary login session,
different account, different session, duplicate submission, expired link or
server restart fails closed and requires a fresh message.

The flow never uses an admin key, creates a user, changes application data, or
removes MFA factors. After a successful change it tries to close the local
recovery session and returns the person to the normal password login and MFA
path. If the password changed but session closure cannot be confirmed, close the
browser window before signing in again. If the password-update result is
uncertain, do not submit the same password again: first try signing in with it,
then request one fresh message only if that fails. Never paste the email,
callback URL, code, session, or new password into chat or a terminal.

## Human Step 4: enroll only after explicit authorization

Do not begin this section merely because Step 3 builds successfully. MFA
enrollment changes the selected Auth account. Obtain narrowly scoped approval
for this account's human-completed enrollment and normal authentication first;
general onboarding and administrator provisioning remain blocked separately.

After that approval:

1. Close `.env` tabs and stop screen sharing/recording. Use a strong, unique Auth
   account password. Do not paste passwords, JWTs, MFA codes, QR images or recovery
   material into chat, command arguments, Git, screenshots or issue reports.
2. Confirm the protected runtime credential from Phase 4 is already present.
   Do not rerun credential provisioning or rotate any database password.
3. Build the app using `pnpm build`. In one PowerShell terminal at the repository
   root, start the already-built API using the existing protected launcher:

   ```powershell
   .\infra\supabase\security-adapter\Start-DevRuntime.ps1 -Action Start
   ```

   This launcher supplies the dedicated runtime database credential securely.
   Never start the API with a migration-owner `DATABASE_URL`. The API listener is
   fixed to `127.0.0.1`; ambient `NODE_ENV`, `HOST`, or `HOSTNAME` values must not
   widen it. If startup fails, stop and share only the sanitized error; do not
   weaken its role checks.
4. In a second terminal at the repository root, run `pnpm dev:web`. Its package
   command fixes the Next.js listener to `127.0.0.1:3000`; if that port is
   occupied, startup fails instead of silently opening another server. Never run
   a second `pnpm dev` or `pnpm dev:web` while this server is active. Development
   output is isolated in `.next-dev`, so a repository validation build cannot
   replace its live styles or scripts. Open
   `http://127.0.0.1:3000/staff/login`, but do not enter a credential yet. The
   browser and API must both use PATHWAYS-dev. Do not deploy this enrollment
   flow publicly.
5. Before entering any credential, inspect both listeners in a third PowerShell
   terminal:

   ```powershell
   Get-NetTCPConnection -State Listen |
     Where-Object LocalPort -In 3000, 4000 |
     Select-Object LocalAddress, LocalPort, OwningProcess
   ```

   There must be exactly one owned listener for each port, and both
   `LocalAddress` values must be `127.0.0.1`. Stop the owned processes and do not
   enroll if either port shows `0.0.0.0`, `::`, a LAN address, an unknown PID, or
   an additional listener. A successful browser request alone is not proof of a
   loopback-only bind.
6. Only after the listener check passes, sign in using the existing selected
   Auth account. Login leads to `/auth/mfa`, not a business dashboard. If a
   verified TOTP factor already exists, enter a fresh code from its authenticator.
   Otherwise click the enrollment button once and privately scan the displayed
   QR code.
7. Enter the current six-digit authenticator code and submit verification. An
   incorrect/expired code must not unlock application access. Never remove an
   existing factor to work around an error. If setup was interrupted and an
   unverified factor remains without its QR, stop for reviewed recovery.
8. A verified MFA result and an application-access-blocked message can both be
   correct: MFA is complete, but the separate onboarding/provisioning gate is
   still closed. Do not set metadata roles or enable the server access switch as
   a shortcut. There is no organization/profile to select until approved bootstrap.
9. Report only `DEVELOPER_MFA_VERIFIED: YES/NO` and sanitized blockers. Do not send
   the code, session, QR or authenticator secret. Phase 5 still requires its exact
   authorization and all acceptance checks, including database-authoritative
   business permissions, scope rules, seeding and explicit administrator linkage.

If the protected launcher cannot read the current Windows user's DPAPI file,
stop rather than exporting the credential to plaintext.

## Security limits and references

TOTP MFA is not leaked-password screening. That advisor finding remains deferred,
and the no-real-user-onboarding gate remains in effect. Browser checks improve
navigation only; the backend is the application security boundary. API reads
use no-store responses. There is no live enrollment/provisioning verification in
the local preparation tests.

- [Supabase MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase TOTP flow](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Verified token claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords)
- [Supabase redirect URL allow list](https://supabase.com/docs/guides/auth/redirect-urls)
