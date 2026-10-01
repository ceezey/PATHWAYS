# Runbook: Consolidated Prisma Migration History

**Status:** Working
**Last reconciled:** 2026-09-26
**Authority:** [Approved Change Record](cr-pathways-revised-rbac-baseline.md), PRD-F1 and the [auth RFC](rfc-pathways-auth-rbac-isolation.md).

The active chain is `0000_pathways_baseline_through_0026` followed by `0027_revised_csv_rbac` and the explicitly approved `0028_revised_aggregate_permission_guards`. The immutable archive and manifest preserve all 26 original SQL files and the migration lock, exact hashes, Git provenance, superseded definitions, and security invariants. There remains one public Prisma ledger.

Run `python scripts/migrations/history.py` to verify history. Run `infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` to verify archived replay, fresh provisioning, preserved-ledger upgrade, catalog and effective-privilege parity, and a subsequent disposable Prisma migration. The script's other switches are `-ProjectActivityCreationRepair`, `-CsvRbacRealignment`, `-Port` and `-PostgresBin`; the pre-baseline modes were retired under [the replay harness Change Record](cr-pathways-replay-harness-modernization.md). Historical deployment runners retain their original branch/commit/ledger guards and are obsolete deployment paths. Archive extraction does not authorize their use against current databases.

For fresh provisioning, establish provider schemas/roles and Auth prerequisites in the intended empty environment, then deploy the baseline with administrator ownership capabilities. The baseline establishes portable Prisma/Postgres owners and the restricted runtime role. Configure the migration identity separately for subsequent forward corrections. Never copy business records, Auth identities, Storage objects, or credentials into migration SQL. The local provider bootstrap is synthetic test setup and must not be run against hosted Supabase.

For an existing database, verify identity, all 26 finished historical ledger rows/checksums, current baseline catalog equivalence, runtime/security objects, and business/Auth/Storage/assignment inventories. Retain the documented 0015 CRLF explanation and approved 0020 exception only. Obtain a protected backup with isolated restoration and coordinate verified development enforcement first.

Using protected Prisma migration credentials, run `prisma migrate resolve --applied 0000_pathways_baseline_through_0026`, inspect the ledger, then `prisma migrate deploy`. Only unapplied approved forward corrections 0027/0028 may execute. PATHWAYS-dev already has both; future changes require their own Change Record. Never resolve an already finished entry again. Baseline registration records its verified checksum; it never executes its DDL. Preserve every original ledger row and checksum. Stop on additional drift, unexplained divergence, or any reset requirement. Do not restore, reverse, clean ledger rows, seed, or retry automatically.

Prisma 6.19.2 compatibility must include status, deployment, datamodel comparison, and subsequent migration generation/application. Introspection datasource schemas must include referenced provider schemas (`auth`, `storage`) as well as `public`, `pathways`; URL-only domain introspection reports P4002 for cross-schema foreign keys. Introspection differences for provider objects or SQL-only guards are review evidence and must never be executed as a corrective diff. Verify SQL security catalogs, ownership, ACLs, default privileges, triggers, and effective runtime/Data API privileges independently.

After application, confirm six roles, 98 permission definitions, 306 grants, one finished baseline registration, one finished 0027, and one finished 0028 (29 finished ledger rows total), unchanged 26 historical rows, and preserved data inventories. After later approved forward migrations the counts grow; for example, after `0035_admin_read_access` expect 308 grants. Verify development preview builds, API health, unauthorized denial, frontend/login, and CORS using read-only checks. Synthetic behavior remains local. Re-lock the auth contract and mark the Change Record Applied only after verification. Production release and missing-feature work remain excluded.

Installed Prisma 6.19.2 reports the retained-history database up to date after baseline registration. The guarded replay rejects nonzero status and proves subsequent migration creation with multi-schema `migrate diff` and application through `migrate deploy`; it does not authorize a reset or claim automatic provider shadow-database provisioning. Actual aggregate entrypoint tests reproduce the pre-0028 PO denial and verify the correction on fresh and upgrade databases.

Verify both dev previews even when only shared frontend route policy changes: the API imports that policy. A skipped API build requires an explicit development redeploy of the reviewed source. A SQL/docs-only commit may retain verified previews whose application source is unchanged. Keep production settings unchanged.

## 7. Schema drift

Local gate: `./infra/supabase/phase6/Test-SchemaDrift.ps1` copies the saved replay template to a disposable loopback cluster, introspects it as `postgres`, runs `prisma migrate diff` to `apps/api/prisma/schema.prisma` and compares the result with the committed `infra/supabase/phase6/schema-drift-expected.sql` (the known diff from SQL-only objects Prisma cannot model). It takes seconds and refuses a stale template.

| Output | Exit |
|---|---|
| `SCHEMA_DRIFT=CLEAN` | 0 |
| `SCHEMA_DRIFT=DRIFT` (prints the difference) | 2 |
| `SCHEMA_DRIFT=ERROR; <message>` | 1 |

Run `-Accept` only after an intended migration plus schema change, once the new diff has been reviewed; it rewrites the expected file. `-Schema <path>` checks another schema copy.

The replay `BASELINE_REVISED_PRISMA_DATAMODEL_PARITY` marker covers only SQL-only baseline revisions, because both sides use the same `schema.prisma`. `prisma migrate diff --from-migrations` cannot be used for this chain (0000 requires `postgres`, 0027 onward require `prisma`). Hosted drift is covered by the schema comparison in `runbook-role-staging-build.md`.
