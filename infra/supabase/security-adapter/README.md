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

Put no password or full URL in terminal arguments/history.

After the credential checks pass, run from the repository root:

```powershell
.\infra\supabase\security-adapter\Start-DevRuntime.ps1 -Action Check
# Start the already-built API only when wanted:
.\infra\supabase\security-adapter\Start-DevRuntime.ps1 -Action Start
```

The launcher supplies runtime `DATABASE_URL` only in the child process. It does not edit either ignored `.env` file or supply the administrator credential. Old migration-owner values in ignored env files are not runtime credentials: API startup rejects them. `DIRECT_URL` remains migration-only. Do not expose server credentials in frontend variables.

### Protected diagnostic capture

The Windows launcher explicitly redirects both output streams of the existing
Node redactor. `Runtime-Output.ps1` drains them concurrently in fixed-size chunks
before waiting for exit and forwards only that already-redacted output to the
parent's standard handles. It does not bypass the redactor, read credentials or
change authentication, process arguments, connection settings or exit codes.
Hidden native children without these redirects reproduced an empty captured
terminal even with a successful synthetic child exit. Console/native-pipe output
is the capture contract; this is not a PowerShell object-pipeline logging API.

The import-safe `runtime-output.mjs` preserves configured-secret, encoded/decoded
password, connection-URL and JWT filtering. It buffers a complete line before
redaction, respects output backpressure, and withholds the entire oversized line
through newline/EOF at the existing 1,000,000-character bound. It never emits the
tail of an oversized line after resetting the buffer. Start failures have one
fixed message. A broken outer capture while the child is still running reports
uncertainty: do not assume the runtime stopped or launch a second instance.

Local-only regression command (no running application or protected configuration):

```powershell
node --test infra/supabase/security-adapter/runtime-output.test.mjs
```

On Windows this exercises PowerShell -> the real redactor source -> finite fake
API/check entry points. Only synthetic env files and fake values are created in
fresh `.tmp/pathways-synthetic-capture-*` fixtures. The production credential
block is never executed; the fixture supplies the known installed Node path
instead of environment-dependent executable discovery. Tests remove only their
validated disposable directories after child exit, preserving a fixture if
cleanup is uncertain. Non-Windows full-chain skips are not Windows verification.
Never remove `.tmp` itself: unrelated protected recovery evidence lives there.

Capture regression PASS is not proof that live authorization succeeds. Activation
requires a separately authorized protected API restart, leaving web unchanged,
then one bounded existing-session recheck. Do not run another API instance, the
combined `pnpm dev`, a migration or password reset to obtain diagnostics. Return
only the allowlisted event/stage/reason and non-secret status/outcome, never logs,
headers, credentials, tokens or complete connection URLs.

## Opt-in local P2028 investigation

The development launcher caps its Prisma client at **two** connections.
The local-only preparation did not activate it; a separately authorized,
single protected API start on 2026-09-12 subsequently passed captured startup
and health readiness. Authenticated handoff remains unverified because web
was already stopped and was left untouched. See the bounded activation entry
in `docs/SOURCE_OF_TRUTH.md`; do not start a second API.
TLS, Session Pooler mode/port, connect timeout, transaction
wait/execution limits and all authentication/authorization checks are unchanged.
Do not run the real launcher until connection capacity is confirmed and a
protected build/restart is separately authorized.

Before activation, confirm capacity for two connections **per API process** at
both the pooler and database/runtime-role boundaries, accounting for other
clients and managed/administrator reserves. With N simultaneous API processes,
budget up to 2N API connections; do not run a duplicate API or overlap a separate
Check process as a shortcut. Session pooling can retain idle backend connections:
an idle count is not proof of spare capacity. Do not increase provider limits or
change pool mode to make this check pass. Unknown capacity means no activation
unless the owner explicitly amends that prerequisite for a bounded attempt.
The 2026-09-12 exception was consumed by the single start above: capacity remains
**UNKNOWN, not PASS**, and the exception does not authorize another activation.

Existing server-only failure events preserve event/stage/reason and add
`transactionFailure` only for P2028: `ACQUISITION_TIMEOUT`, `EXECUTION_EXPIRED`
or `UNCLASSIFIED`. No provider detail, metadata, connection value or identifier
is emitted. Unknown/oversized shapes remain unclassified; no retry or permission
fallback follows classification. Route diagnostics remain development-only.

## Real-user onboarding remains prohibited

Leaked-password protection is deferred under SOT section 6.1, not fixed. No billing upgrade is authorized. Do not register, invite, provision, activate or elevate real users, including existing identities or a first administrator, until protection is available and verified enabled and onboarding is separately authorized. Phase 4 PASS does not lift this gate or start Phase 5.
