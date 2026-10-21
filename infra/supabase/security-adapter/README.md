# Phase 4 security adapter

Binding controls: `docs/SOURCE_OF_TRUTH.md`, `docs/PHASE_TODO.md`, and the chat-only report template. This runbook is not a phase report or authorization to deploy.

## Boundary

Only PATHWAYS-dev (`pdqwsknbzkdtiwjjibqt`), database `postgres`, approved Session Pooler port `5432`. Migration history remains in `public._prisma_migrations`. Never create a second ledger, reset, db-push, edit applied migrations, or use production.

0005 is a one-off administrator deployment because the migration owner lacks REFERENCES authority on managed Auth. It uses `SET LOCAL ROLE prisma` for domain-owner changes. All 39 tables and their schema retain owner `prisma`; only the two narrow, read-only security-context helpers are owned by `postgres`. The migration writes no Auth/Storage data.

## Least privilege and real authorization

Runtime has no BYPASSRLS, role memberships, schema CREATE, database CREATE/TEMP, ownership, grant option, TRUNCATE or DELETE. Four reference tables are SELECT-only. Profiles have SELECT and lock-only UPDATE(id). Audit/journey/assessment records are append-only; evaluated alerts add lock-only UPDATE(id). The remaining 30 tables allow scoped SELECT/INSERT/UPDATE. Existing immutable-data triggers remain effective.

RLS requires an active organization, active role, and active unarchived profile linked to the supplied verified Auth subject. Missing, malformed, unlinked or mismatched context fails closed. The backend supplies context in one transaction using `PrismaService.withVerifiedContext`; parameterized transaction-local settings prevent pooled-connection context leakage.

**These settings are not JWT verification.** A holder of the runtime credential can supply session claims. Keep the credential and arbitrary SQL away from end users. This adapter does not implement Phase 5's atomic permissions, project assignments, aggregate-only access, seeding or `/auth/me` contract. It does not newly authorize an endpoint.

## Local runtime

`pnpm dev` starts the API through `dev-local.mjs`. It blanks `DIRECT_URL`, `SHADOW_DATABASE_URL` and `PGPASSWORD` for the API process, so only the runtime `DATABASE_URL` from the ignored env files reaches it, and forwards the API output through the redactor in `runtime-output.mjs`. Old migration-owner values in ignored env files are not runtime credentials: API startup rejects them. `DIRECT_URL` remains migration-only. Put no password or full URL in terminal arguments or history, and do not expose server credentials in frontend variables.

The Windows DPAPI launcher for the legacy PATHWAYS-dev database (`Start-DevRuntime.ps1`) was retired on 2026-10-21.

`runtime-output.mjs` filters configured secrets, encoded and decoded passwords, connection URLs and JWTs. It buffers a complete line before redaction, respects output backpressure, and withholds an entire oversized line through newline or EOF at the 1,000,000-character bound.

Local-only regression command:

```powershell
node --test infra/supabase/security-adapter/runtime-output.test.mjs
```

## P2028 diagnostics

Existing server-only failure events preserve event/stage/reason and add
`transactionFailure` only for P2028: `ACQUISITION_TIMEOUT`, `EXECUTION_EXPIRED`
or `UNCLASSIFIED`. No provider detail, metadata, connection value or identifier
is emitted. Unknown/oversized shapes remain unclassified; no retry or permission
fallback follows classification. Route diagnostics remain development-only.

## Real-user onboarding remains prohibited

Leaked-password protection is deferred under SOT section 6.1, not fixed. No billing upgrade is authorized. Do not register, invite, provision, activate or elevate real users, including existing identities or a first administrator, until protection is available and verified enabled and onboarding is separately authorized. Phase 4 PASS does not lift this gate or start Phase 5.
