# Activity Log

## 2026-10-01

- Replay harness: documented the replay datamodel parity marker (gates baseline-revision drift only, not schema.prisma edits) and the developer-only hosted pg_dump schema comparison; migrate diff --from-migrations cannot apply this chain, so the template-based Test-SchemaDrift.ps1 is the local drift gate.
- Replay harness: removed -Phase4IndicatorPolicy, -RuleBasedAccessAlignment and -DashboardHomeProjectScope under cr-pathways-replay-harness-modernization; Phase 4 indicator assertions now run in every replay.
- RBAC v4 reconciliation: v4 adopted in docs under cr-pathways-rbac-v4-adoption; MA-18 added and closed in docs; RBAC v4 grant migration registered as deferred.
- Figma reference: DSD section 4 specimen map and authority row under cr-pathways-figma-reference-integration; budget and alert module guidance folded into DSD; inbox deferred.
- Index: registered activity-log, the core gap closure and replay harness plans, and the RBAC v4 and Figma spec and plan.
- Core features QA (F1 to F8): read-only run against PRD gates, QAD rows and the deferred register; record in [audit-pathways-core-features-qa-20261001](audit-pathways-core-features-qa-20261001.md).
- Result: one unmet or partial gate in each of F1, F2, F3, F4, F6, F7 and F8; F5 partial on G-F5-1; UI token drift and an oversized collection workspace noted.
- Doc drift fixed on chore/core-doc-drift: PRD F1 to F8 status honesty, automatic-mapping route, UC-F8-2 route; dead indicator-library-workspace removed.
- Integration on integrate/core-features (from dev a75406d): merged ui-foundation-tokens, core-ui-alignment, f2-project-archive, core-doc-drift, core-gate-coverage, f1-signin-lockout, f3-f4-rbac-identity-review, f4-journey-note, f6-import-value-map and f7-indicator-library.
- Migration chain re-linked 0045 to 0046 to 0047 to 0048 to 0049 to 0050 to 0051 (predecessor guards on each); 0051 now wraps p09_role_allows as left by 0048 so SA journeys.read stays revoked and M&E keeps identities.review.
- Inventories unified in hosted-plan, its test, legacy-retirement test, Verify-Forward (26 migrations, 317 grants), runbook and SDD counts; PRD and QAD rows merged with unique QAD IDs. Not pushed; no hosted migration applied.
- Replay fix on fix/indicator-policy-replay: historical modes (22 to 25 migrations) ran current-schema Prisma suites that read projects.implementing_partners, absent there.
- The feature-read, c8 and dashboard-home suites now run only in -MigrationBaseline (current schema, measured table count passed via PATHWAYS_EXPECTED_TABLE_COUNT); historical modes keep their SQL runtime checks.
- Replay modes run before the fix round: Phase4IndicatorPolicy, RuleBasedAccessAlignment, DashboardHomeProjectScope, ProjectActivityCreationRepair and MigrationBaseline exit 0; a wrong assertion failed the replay.
- Expense submit race: p34_submit_expense now replays a concurrent same-request submit (migration 0053, expense-submit preprovision and cleanup, two-session concurrency test); inventories updated to 27 migrations. Replay run pending. The pre-0053 failure of the concurrent same-request submit was shown by inspection, not by an executed run.
- Core-gap closure integrated (indicator replay, expense runtime 0053, contrast, dashboard perf, sign-in lockout 0052); 0053 now requires 0052, ledger 28 rows, 35-step hosted plan; hook suite wired into -MigrationBaseline; sign-in 503 resolved.

## 2026-10-02

- Demo decisions 403 root cause: 0047 and 0051 renamed and recreated p09_role_allows without its EXECUTE grants, so the rules owners were denied; 0047, 0048 and 0051 amended before any hosted apply to copy the ACL and assert parity, with a P09_ROLE_ALLOWS_GRANTS_RUNTIME replay test.
- Staging applied the original 0047, 0048 and 0051 before the in-place p09_role_allows grant amendment (59dd769), leaving p09_role_allows and p09_role_allows_0048 without EXECUTE (42501 on outcome recording). The amendment is reverted to the exact applied bytes to keep ledger checksums equal, and forward migration 0054_p09_role_allows_grants restores both ACLs from p09_role_allows_0035; ledger 29 rows, 36-step hosted plan, grants runtime test also covers p09_role_allows_0048.
- Role-staging verified 2026-10-02 at ledger 0000-0054: CRs sign-in lockout, core RBAC identity review, journey note and indicator library set Applied; import value map (release gates) and performance scaling (G-F8-7 staging re-measure) stay Approved; facts recorded in runbook-role-staging-build.md section 8.
- Added Test-SchemaDrift.ps1 and schema-drift-expected.sql: a template-based check that schema.prisma matches the migration chain (introspects as postgres); the replay template no longer keeps the disposable baseline_compatibility_probe table, and schema.prisma now models the client_import_id default, import claim indexes and partner index name.
