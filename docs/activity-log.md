# Activity Log

## 2026-10-01

- Core features QA (F1 to F8): read-only run against PRD gates, QAD rows and the deferred register; record in [audit-pathways-core-features-qa-20261001](audit-pathways-core-features-qa-20261001.md).
- Result: one unmet or partial gate in each of F1, F2, F3, F4, F6, F7 and F8; F5 partial on G-F5-1; UI token drift and an oversized collection workspace noted.
- Doc drift fixed on chore/core-doc-drift: PRD F1 to F8 status honesty, automatic-mapping route, UC-F8-2 route; dead indicator-library-workspace removed.
- Integration on integrate/core-features (from dev a75406d): merged ui-foundation-tokens, core-ui-alignment, f2-project-archive, core-doc-drift, core-gate-coverage, f1-signin-lockout, f3-f4-rbac-identity-review, f4-journey-note, f6-import-value-map and f7-indicator-library.
- Migration chain re-linked 0045 to 0046 to 0047 to 0048 to 0049 to 0050 to 0051 (predecessor guards on each); 0051 now wraps p09_role_allows as left by 0048 so SA journeys.read stays revoked and M&E keeps identities.review.
- Inventories unified in hosted-plan, its test, legacy-retirement test, Verify-Forward (26 migrations, 317 grants), runbook and SDD counts; PRD and QAD rows merged with unique QAD IDs. Not pushed; no hosted migration applied.
- Replay fix on fix/indicator-policy-replay: historical modes (22 to 25 migrations) ran current-schema Prisma suites that read projects.implementing_partners, absent there.
- The feature-read, c8 and dashboard-home suites now run only in -MigrationBaseline (current schema, measured table count passed via PATHWAYS_EXPECTED_TABLE_COUNT); historical modes keep their SQL runtime checks.
- Replay modes run before the fix round: Phase4IndicatorPolicy, RuleBasedAccessAlignment, DashboardHomeProjectScope, ProjectActivityCreationRepair and MigrationBaseline exit 0; a wrong assertion failed the replay.
