# Phase 4 security adapter

Binding controls: `docs/SOURCE_OF_TRUTH.md`, `docs/PHASE_TODO.md`, and the chat-only report template. This runbook is not a phase report or authorization to deploy.

## Boundary

Only PATHWAYS-dev (`pdqwsknbzkdtiwjjibqt`), database `postgres`, approved Session Pooler port `5432`. Migration history remains in `public._prisma_migrations`. Never create a second ledger, reset, db-push, edit applied migrations, or use production.

0005 is a one-off administrator deployment because the migration owner lacks REFERENCES authority on managed Auth. It uses `SET LOCAL ROLE prisma` for domain-owner changes. All 39 tables and their schema retain owner `prisma`; only the two narrow, read-only security-context helpers are owned by `postgres`. The migration writes no Auth/Storage data.

## Least privilege and real authorization

Runtime has no BYPASSRLS, role memberships, schema CREATE, database CREATE/TEMP, ownership, grant option, TRUNCATE or DELETE. Four reference tables are SELECT-only. Profiles have SELECT and lock-only UPDATE(id). Audit/journey/assessment records are append-only; evaluated alerts add lock-only UPDATE(id). The remaining 30 tables allow scoped SELECT/INSERT/UPDATE. Existing immutable-data triggers remain effective.

RLS requires an active organization, active role, and active unarchived profile linked to the supplied verified Auth subject. Missing, malformed, unlinked or mismatched context fails closed. The backend supplies context in one transaction using `PrismaService.withVerifiedContext`; parameterized transaction-local settings prevent pooled-connection context leakage.

**These settings are not JWT verification.** A holder of the runtime credential can supply session claims. Keep the credential and arbitrary SQL away from end users. This adapter does not implement Phase 5's atomic permissions, project assignments, aggregate-only access, seeding or `/auth/me` contract. It does not newly authorize an endpoint.

## Protected Windows credentials

Approved administrator file: `%LOCALAPPDATA%\PATHWAYS\secrets\dev-db-admin.credential.xml`. First-provisioned runtime file: `dev-db-runtime.credential.xml` in the same protected directory. DPAPI files are Windows-user/machine-bound, not portable plaintext configuration. Never open, print, paste or commit their contents. Use an approved secret-manager backup procedure; copying the file to another computer does not make it decryptable there.

The provisioning helper refuses an existing runtime credential or password. It creates a new dedicated credential, not a password rotation. Put no password or full URL in terminal arguments/history. Do not rerun provisioning after partial failure: preserve evidence and inspect first.

After deployment and credential checks pass, run from the repository root:

```powershell
.\infra\supabase\security-adapter\Start-DevRuntime.ps1 -Action Check
# Start the already-built API only when wanted:
.\infra\supabase\security-adapter\Start-DevRuntime.ps1 -Action Start
```

The launcher supplies runtime `DATABASE_URL` only in the child process. It does not edit either ignored `.env` file or supply the administrator credential. Old migration-owner values in ignored env files are not runtime credentials: API startup rejects them. `DIRECT_URL` remains migration-only. Do not expose server credentials in frontend variables.

## TEMP exception and rollback

The TEMP apply/restore scripts are separate from 0005, allowing exact reversal without changing migration history. They assert every database ACL tuple and touch TEMP only. The nine-role allowlist is explicit in both SQL and SOT section 6.2. Existing postgres/dashboard privileges are preserved; runtime/API roles are excluded.

Before any live change, capture the read-only inventory, exact migration hashes, approved target, administrator capability, and Auth/Storage/service baseline. `Invoke-DevAdmin.ps1 -Action Inventory` enforces an explicit read-only transaction. Receiving JSON alone is not a PASS: compare each acceptance criterion.

After TEMP application, immediately run privilege and service smoke tests. Any regression requires the exact restore script through the approved administrator, verification of original ACL/service health, preservation of evidence, and a hard stop. If 0005 fails, reverse TEMP but do not alter its ledger row or try another recovery method. No broad rollback is authorized.

`service-smoke.mjs` uses protected configuration in memory and prints only status codes/counts. It checks Auth health, the two preserved users, Storage health, the one private bucket, and captured disabled Data API HTTP responses. HTTP errors alone do not prove the dashboard setting: independently verify the saved/refreshed toggle is off and pathways is not selected as exposed. Never enable the API to make a probe pass.

## State-aware continuation after completed 0005

Do not use `Invoke-SecurityAdapterDeployment.ps1` for a post-deployment continuation.
0005 and its ledger entry are already completed and must remain byte-for-byte
unchanged. The recovery runner has no deployment or resolution action.

Before running recovery, independently verify the project name/ref, the saved
and refreshed disabled Data API setting, unexposed `pathways`, and the latest
failed report. Read SOT section 6.2 and review the exact nine-role TEMP allowlist.
The current authorization must explicitly cover first-time provisioning and
failure containment; this runbook does not supply that authorization.

From the repository root, the read-only preflight is:

```powershell
.\infra\supabase\security-adapter\Invoke-SecurityAdapterRecovery.ps1 -Authorization SUPABASE_SECURITY_ADAPTER_0005_ONLY -PreflightOnly
```

The runner expects the exact captured post-0005 catalog, restored original TEMP
ACL, a NOLOGIN runtime with no password/settings/ownership/memberships/sessions,
no existing runtime credential file, and the preserved Phase 0C backup. Any
difference blocks live writes. After local tests and review pass, omitting
`-PreflightOnly` performs only the authorized TEMP restriction, first provision,
tagged runtime checks, and final preservation checks. It never checks the TODO.

The first-provision guard reads flags and `rolconfig` from `pg_roles`; it reads
only a password-presence boolean from `pg_authid`, which has no `rolconfig`
column. It also rejects database-specific entries in `pg_db_role_setting`.
`tests/Test-RuntimeProvisionGuard.ps1` tests the actual extracted guard against
disposable local PostgreSQL with transaction-rolled-back fixtures.

Every recovery runtime connection is recorded by its backend PID, precise
backend start time, database, role and unique recovery tag. After a confirmed
failure, the runner may set only `pathways_runtime` NOLOGIN, terminate only exact
recorded recovery-owned sessions, then restore and verify the exact TEMP
baseline. Passwords and encrypted files are preserved. Unattributed sessions,
timeouts, lost commit acknowledgements or other uncertain outcomes cause a
hard stop: never infer rollback, delete a credential, rotate a password, or
blindly retry. NOLOGIN alone does not disconnect an existing pooled session.

After a successful sequence, independently review final catalogs/advisors and
repository checks before marking Phase 4 PASS. Keep the no-real-user-onboarding
gate in effect. No Phase 5 action is authorized by this runner.

## Local replay evidence

Use a fresh loopback-only `pathways_phase4_*` database. `security-adapter-local-bootstrap.sql` creates synthetic provider prerequisites only locally. Replay 0001–0004 as migration owner, then 0005 as local administrator. Preserve all earlier migration hashes. Rehearse TEMP apply/restore and all nine positive role probes, then apply TEMP and run `security-adapter.sql`.

The suite tests actual scoped DML and invoker locks, invalid context, API-role access, DDL/ownership rejection including TEMP, local Auth FK deletion behavior, and context cleanup. Synthetic Auth/business fixtures are rolled back. Never adapt this fixture suite to delete hosted identities.

## Real-user onboarding remains prohibited

Leaked-password protection is deferred under SOT section 6.1, not fixed. No billing upgrade is authorized. Do not register, invite, provision, activate or elevate real users, including existing identities or a first administrator, until protection is available and verified enabled and onboarding is separately authorized. Phase 4 PASS does not lift this gate or start Phase 5.
