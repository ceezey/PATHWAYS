# Phase 6 legacy-retirement operator runbook

Use only with `LEGACY_PUBLIC_RETIREMENT_0006_ONLY`. This is a runbook, not a
phase report. Migration 0006 is optional and destructive; a successful local
test never authorizes a hosted deployment.

## Fail-closed gates

- Phase 5 must be checked and passed. Reverify only `PATHWAYS-dev`
  (`pdqwsknbzkdtiwjjibqt`), database `postgres`, through the approved Session
  Pooler. Reject every production or AWS target.
- Runtime application sources and the generated Prisma client must contain no
  legacy model/delegate use. The post-0006 datamodel has exactly 39 models but
  keeps `public` in the datasource because the Prisma ledger remains there.
- Inventory all 15 named legacy tables immediately before deployment. Every
  count must be zero. Reject external foreign keys, views/materialized views,
  inheritance/partitions, explicit publication membership, stored-routine
  references, unexplained catalog drift, or an active application session.
- Create a new custom-format backup outside the repository containing the full
  `public` and `pathways` application schemas and data. Record its SHA-256 and
  protect it for the current Windows account and SYSTEM. Restore that exact
  archive into a brand-new loopback-only database. Reconcile all 55 table
  definitions/security metadata, row counts, deterministic row hashes, ledger,
  and `pgcrypto`. Supabase Storage file bytes are not PostgreSQL dump content;
  preserve and compare the provider Storage inventory separately.
  Before restoring, provision only the disposable provider-shaped roles and
  synthetic `auth.users`/`auth.uid()` prerequisites required by 0005 ownership,
  RLS helpers, and the cross-schema Auth foreign key. Insert only the two
  captured Auth UUIDs needed to satisfy that local foreign key. Never use this
  synthetic bootstrap on a hosted database, and verify restored owners, ACLs,
  policies, triggers, table data, and ledger—not row counts alone.
- Capture Auth, Storage, extension, role/grant/RLS/policy, managed-trigger, and
  target-table fingerprints before deployment. The no-real-user-onboarding gate
  and deferred leaked-password finding remain in force.

## Local rehearsal

Run `Replay-Local.ps1` from this directory. It creates a new loopback-only
PostgreSQL cluster, uses supported Prisma deployment in three role-aware stages
(0001-0004 as `prisma`, 0005 as local `postgres`, 0006 as `prisma`), checks four
atomic rejection cases, and verifies migration status. It proves an empty
physical database-to-datamodel diff using a clone from which only the reviewed,
unsupported cross-schema `system_users` to `auth.users` adapter FK is removed;
the primary replay database retains and separately verifies that FK. Synthetic
databases and logs are retained under the ignored `.tmp` evidence directory; no
env file or hosted credential is read.

Also run Prisma validate/generate, lint, typecheck, tests, build, both Git diff
checks, the generated-client legacy scan, and the Phase 5 secret safety scan.

## Maintenance and deployment

Stop only positively identified local PATHWAYS web/API processes. Confirm no
active `prisma` or `pathways_runtime` transaction/session remains and that the
approved maintenance window is active. Re-run all live gates after the backup
and immediately before deployment.

Run exactly one supported operation through the Phase 6 config, which rejects
anything except the exact PATHWAYS-dev `prisma` Session Pooler target, port,
database, TLS mode, timeout, and single-connection setting:

```powershell
pnpm --filter @pathways/api exec prisma migrate deploy --config ../../infra/supabase/phase6/prisma.live.config.ts
```

Never run resolve, reset, db push, raw hosted DROP statements, manual ledger SQL,
or a second deploy attempt after an uncertain/failing outcome. Migration 0006
uses one transaction, bounded locks/assertions, and exactly 15 explicit
schema-qualified `DROP TABLE ... RESTRICT` statements. It never uses `CASCADE`.

## Postflight

Require one completed 0006 ledger row with its reviewed checksum and no unresolved
attempt. `public` must contain only `_prisma_migrations`; `pathways` must contain
the unchanged 39 target tables. Compare target data/catalog, Auth, Storage,
extensions, roles/grants/RLS/policies, managed triggers, and disabled Data API to
the captured preflight. Run `Test-LiveRuntimeDml.ps1` for the positive DML probe
that always rolls back, then `../security-adapter/Check-DevRuntime.ps1` for the
negative DDL/security probes. Also run provider smoke checks, Prisma status, the
state-aware Phase 5 Verify/workspace launcher, and advisors.

On any failure, preserve the backup and evidence and stop. Do not automatically
restore over PATHWAYS-dev; that requires separate destructive recovery approval.
Only after every check passes may the Phase 6 and eligible final TODO boxes be the
last repository edit. Never start another phase.
