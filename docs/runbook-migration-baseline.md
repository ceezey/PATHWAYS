# Runbook: Consolidated Prisma Migration History

**Status:** Working
**Last reconciled:** 2026-09-26
**Authority:** [Approved Change Record](cr-pathways-revised-rbac-baseline.md), PRD-F1 and the [auth RFC](rfc-pathways-auth-rbac-isolation.md).

The active chain is `0000_pathways_baseline_through_0026` followed by `0027_revised_csv_rbac`. The immutable archive and manifest preserve all 26 original SQL files and the migration lock, exact hashes, Git provenance, superseded definitions, and security invariants. There remains one public Prisma ledger.

Run `python scripts/migrations/history.py` to verify history. Run `infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` to verify archived replay, fresh provisioning, preserved-ledger upgrade, catalog and effective-privilege parity, and a subsequent disposable Prisma migration. Historical deployment runners retain their original branch/commit/ledger guards and are obsolete deployment paths. Archive extraction does not authorize their use against current databases.

For fresh provisioning, establish provider schemas/roles and Auth prerequisites in the intended empty environment, then deploy the baseline with administrator ownership capabilities. The baseline establishes portable Prisma/Postgres owners and the restricted runtime role. Configure the migration identity separately for subsequent forward corrections. Never copy business records, Auth identities, Storage objects, or credentials into migration SQL. The local provider bootstrap is synthetic test setup and must not be run against hosted Supabase.

For an existing database, verify identity, all 26 finished historical ledger rows/checksums, current baseline catalog equivalence, runtime/security objects, and business/Auth/Storage/assignment inventories. Retain the documented 0015 CRLF explanation and approved 0020 exception only. Obtain a protected backup with isolated restoration and coordinate verified development enforcement first.

Using protected Prisma migration credentials, run `prisma migrate resolve --applied 0000_pathways_baseline_through_0026`, inspect the ledger, then `prisma migrate deploy`. Only 0027 may execute. Baseline registration records its verified checksum; it never executes its DDL. Preserve every original ledger row and checksum. Stop on additional drift, unexplained divergence, or any reset requirement. Do not restore, reverse, clean ledger rows, seed, or retry automatically.

Prisma 6.19.2 compatibility must include status, deployment, datamodel comparison, and subsequent migration generation/application. Introspection datasource schemas must include referenced provider schemas (`auth`, `storage`) as well as `public`, `pathways`; URL-only domain introspection reports P4002 for cross-schema foreign keys. Introspection differences for provider objects or SQL-only guards are review evidence and must never be executed as a corrective diff. Verify SQL security catalogs, ownership, ACLs, default privileges, triggers, and effective runtime/Data API privileges independently.

After application, confirm six roles, 98 permission definitions, 306 grants, one finished baseline registration and one finished 0027, unchanged 26 historical rows, and preserved data inventories. Verify development preview builds, API health, unauthorized denial, frontend/login, and CORS using read-only checks. Synthetic behavior remains local. Re-lock the auth contract and mark the Change Record Applied only after verification. Production release and missing-feature work remain excluded.
