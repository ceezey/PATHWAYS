# Phase 5 operator runbook

Use only with `CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY` and
Source of Truth section 6.1's single developer exception. This is a runbook,
not a phase completion report. A successful build does not mark Phase 5 passed.

## Preconditions

- Phase 4 is checked and passed; re-inventory the exact PATHWAYS-dev project
  `pdqwsknbzkdtiwjjibqt` before and after writes.
- All migration files retain their approved hashes. Before Phase 6 there are 39
  target tables, 15 empty legacy tables and one public migration ledger with five
  completed migrations plus the preserved rolled-back 0002 attempt. After a
  completed 0006, the same verifier instead requires all 15 legacy tables to be
  absent, exactly one completed 0006 row, and no unresolved attempt. It rejects
  every partial or ledger/catalog-mismatched retirement state.
- Verify current owners, RLS, policies, grants, roles and managed triggers against
  the Phase 4 inventory. Runtime has no ownership, CREATE or TEMP; migration
  `prisma` has no database CREATE. Data API remains disabled.
- Verify the existing Phase 0C backup and recorded SHA-256 outside the repository.
- Preserve both Auth identities and the private Storage bucket/object. Confirm
  the designated UUID is eligible and has a verified TOTP factor. This does not
  substitute for an authenticated `aal2` session on each protected request.
- Before administrator provisioning or enabling protected access, obtain human
  confirmation that this account's password is strong, unique and private.
  Reference seeding alone grants no account access. Never request the password's
  value. Do not rotate or reset any credential here.
- Administrator and runtime DPAPI CLIXML files must remain outside the repository
  under the current Windows user's `LOCALAPPDATA/PATHWAYS/secrets` directory.

Stop on mismatched inventory, missing preconditions or an uncertain write result.
Do not repair drift, rerun migrations, change grants or overwrite existing data.

## Local verification before writes

From `C:\PATHWAYS`, run `Replay-Local.ps1` in this directory. It creates a new,
loopback-only disposable cluster, fully replays the immutable migrations and runs
real PostgreSQL tests. Synthetic identities, profiles and business fixtures are
rolled back. The cluster is stopped and retained as local test evidence.

Also run Prisma validate/generate, workspace lint, typecheck, tests, build,
`git diff --check`, `git diff --cached --check`, and
`node infra/supabase/phase5/validation-safety.mjs`.
Do not print raw generated artifacts or ignored env files. Biome excludes both
`.next` and `.next-dev`; builds do not overwrite the active development output.
The secret check prints counts only and compares against current private env
values without disclosing them; it is not a claim about all historical output.

## Separate reviewed live operations

`Invoke-AuthorizationBootstrap.ps1` uses the protected administrator connection. It guards the
exact target, role, migration hashes, ledger, catalog, zero business counts,
state-aware legacy retirement, preserved provider inventory and MFA before and
after its transaction. It never prints the connection or email. `Check` and
`Verify` use read-only transactions. Phase 5 write actions fail closed after 0006.

Run each separately, reviewing its sanitized result before continuing:

```powershell
.\infra\supabase\phase5\Invoke-AuthorizationBootstrap.ps1 -Action Check
.\infra\supabase\phase5\Invoke-AuthorizationBootstrap.ps1 -Action Seed -Authorization CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY
```

Seed writes only six roles, 38 atomic permissions and their exact compiled
mappings. Run it a second time and compare the full non-secret reference snapshot,
including IDs and timestamps, to prove no-op idempotency. It adds missing approved
rows but never overwrites or deletes drift. The implicit Prisma seed stays a no-op.

If there is no organization, the separately authorized minimal bootstrap is:

```powershell
.\infra\supabase\phase5\Invoke-AuthorizationBootstrap.ps1 -Action Organization -Authorization CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY
```

The exact approved name is `Plan International Pilipinas` and code is `PLAN_PH`,
as reconfirmed by the user on 2026-09-07. Do not use the earlier full-name code,
create an alias, or adopt another organization.

Only after every security check and the human password confirmation pass:

```powershell
.\infra\supabase\phase5\Invoke-AuthorizationBootstrap.ps1 -Action Administrator -Authorization CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY -StrongUniquePasswordConfirmed
.\infra\supabase\phase5\Invoke-AuthorizationBootstrap.ps1 -Action Verify
```

This links only Auth UUID `56ad4c1a-113f-401b-84e8-1d2135f174c1` to the active
`Dev Cian` SYSTEM_ADMINISTRATOR profile. Email is copied privately from that exact
verified Auth row as a required profile field, never used to discover/link identity.
No Auth user, credential, assignment or sample business data is created. The other
testing identity receives no profile or elevation. Record only the returned
non-secret application user and organization UUIDs. A timeout is an uncertain
outcome: inspect read-only before any retry; never delete rows to retry.

## Developer workspace after verification

1. Stop only your identified old local API process, then build current code.
2. Start the API with the guarded launcher:

   ```powershell
   .\infra\supabase\phase5\Start-DeveloperWorkspace.ps1 -StrongUniquePasswordConfirmed
   ```

   It re-verifies completed bootstrap read-only, enables the developer gate only
   in that child process and uses the existing protected runtime credential. It
   does not edit `.env` files or provision/rotate database credentials.
3. Start one `pnpm dev:web` process. Verify both ports 3000 and 4000 have exactly
   one known listener each, bound only to `127.0.0.1`.
4. Privately sign in at `http://127.0.0.1:3000/staff/login`, then complete TOTP at
   `/auth/mfa`. Use the non-secret organization/application user UUIDs from Verify
   in its application-context fields. Select **Verify provisioned access**.
   The application user field is **not** the Supabase Auth UUID. While checking,
   the button shows progress; a denied request shows a safe 401/403 or connection
   message instead of silently returning to the same form. Verify both UUIDs
   against the read-only Verify output. Do not change roles or rerun provisioning
   to troubleshoot a sign-in error, and never share request headers or tokens.
   The browser and Next middleware both use bounded access checks. Their shared
   cancellation helper must remain compatible with Next's Edge Runtime (which
   does not implement `AbortSignal.any` in the installed version); the dedicated
   Edge-runtime test covers this to prevent a workspace-to-login redirect.
   Remote scoped transactions use bounded 5-second queue / 10-second work limits.
   Prisma pool/transaction timing failures (`P2024`/`P2028`) are service errors
   (503), not proof of a missing profile (403). Wait briefly and retry once;
   never weaken RLS, change credentials or create another profile to fix them.
   Middleware preserves the valid Auth session and returns to the access check
   on an API outage instead of misrepresenting it as a lost login.
5. Follow **Open your workspace**. `/workspace` renders only after the backend verifies
   the profile; its project list comes from `/api/access/projects`, not fixtures.
   No projects yet is the expected empty bootstrap result. Do not create samples.
6. Confirm password-only/other-account access stays denied and report only
   non-secret success/failure. Never paste bearer tokens, passwords or TOTP codes.

## Authorization contract and limits

The exact six role mappings live in `apps/api/src/modules/auth/authorization-policy.ts`.
Effective authority is the intersection of current database grants and that reviewed
ceiling. There is no implicit administrator workflow-approval bypass. The API
requires a verified designated identity, `aal2`, active linked account/organization/
role, atomic permission and scoped query predicates. Unannotated business handlers
fail closed. Invalid authentication returns 401, unavailable permission/context 403,
and absent or inaccessible project resources the same generic 404.

Implemented Phase 5 read contracts are project lists, project-scoped beneficiary
records, and fixed project enrollment counts. Program Manager scope is managed
programs plus explicit active assignments. No grant-portfolio membership model
exists, so Grant Manager receives only explicitly assigned projects. Program and
Grant Managers receive aggregate-only beneficiary counts, never raw rows hidden
after fetching. Other non-administrator roles require active, started, unended
assignments. Even administrators remain restricted to their organization.

The new workspace consumes server permissions and revalidates on session change,
window focus and periodically. Its cookie stores only untrusted UUID selectors,
never authority. Old prototype dashboards/business modules remain blocked; this
phase does not claim to implement all their workflows or open write APIs. Immutable
database actor-separation constraints remain in force and are retested locally.

Next's documented `skipMiddlewareUrlNormalize` option preserves the approved
loopback redirect through its response adapter; otherwise Next 15 can rewrite
`127.0.0.1` to `localhost` after middleware returns. Browser tests check the final
origin, not just a unit-test response. See [Next 15 middleware flags](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware#advanced-middleware-flags).

General real-user onboarding remains prohibited. Leaked-password protection is
**deferred, not fixed**. No billing, Auth configuration or Storage change is made.
Check only Phase 5 TODO after all criteria pass and emit the report in chat only.
Phase 6 requires separate authorization and must not begin here.
