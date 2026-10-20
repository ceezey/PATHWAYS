# Documentation Index: PATHWAYS (pointer)

**Project:** PATHWAYS
**Slug:** `pathways`
**Maintainer:** PATHWAYS capstone team
**Last updated:** 2026-10-20

This file stays in the repo only so that humans and agents know where to look. Since 2026-10-20 the documentation, its status manifest and the project memory live in the AI Memory Vault at `C:/AI Agentic Memory`. Create and edit docs there, never in this repo.

## Start here

1. Read the vault rules: [AGENTS.md](<C:/AI Agentic Memory/AGENTS.md>).
2. Read the project index, which is also the doc status manifest (suite table, Change Log, Health Check): [00_Project_Index.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/00_Project_Index.md>).
3. Read the session notes, starting at [pathways-memory-index.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Memory/pathways-memory-index.md>).

## What stays in the repo

| File | Role |
|---|---|
| `AGENTS.md` | Build guide, generated from the vault note `build-pathways` by `.vault/scripts/pathways_docs/materialize.py`; never hand-edit |
| `CLAUDE.md` | Claude Code notes; defers to `AGENTS.md` |
| `CODEX.md` | Codex platform usage and `.codex/agents/*.toml` bindings |
| `docs/index.md` | This pointer |
| `README.md`, `README-setup.md` | Repository entry point and local setup |
| `.claude/agents/`, `.codex/agents/` | Subagent definitions; they cite the vault SAD, BUILD, PRD and QAD |
| `apps/**/*.md`, `infra/**/*.md` | Code-adjacent READMEs and setup notes |

Removed on 2026-10-20: every other `docs/*.md` (now vault notes with the same basename), `IDEA.md` (Appendix of `idea-pathways`), `BRAND.md` and `DESIGN.md` (`dsd-pathways`), and the `docs:check` / `docs:materialize` scripts (now `.vault/scripts/pathways_docs/`). Git history keeps every removed file.

## Where each doc lives

The old repo path `docs/<name>.md` is the vault note `<name>`. The table lists every PATHWAYS vault note except `Memory/`, as of the date above; the vault itself is the live list.

| Note | Vault path |
|---|---|
| `00_Project_Index` | [01_Projects/PATHWAYS/00_Project_Index.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/00_Project_Index.md>) |
| `cr-pathways-activity-escalation` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-escalation.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-escalation.md>) |
| `cr-pathways-activity-extension-request` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-extension-request.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-extension-request.md>) |
| `cr-pathways-activity-overdue-explanation` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-overdue-explanation.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-overdue-explanation.md>) |
| `cr-pathways-activity-progress-media` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-progress-media.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-progress-media.md>) |
| `cr-pathways-admin-read-access` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-admin-read-access.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-admin-read-access.md>) |
| `cr-pathways-assessment-score-entry` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-assessment-score-entry.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-assessment-score-entry.md>) |
| `cr-pathways-beneficiary-assessment-view` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-assessment-view.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-assessment-view.md>) |
| `cr-pathways-beneficiary-progress-read` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-progress-read.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-progress-read.md>) |
| `cr-pathways-beneficiary-reach-kpi-values` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-reach-kpi-values.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-reach-kpi-values.md>) |
| `cr-pathways-beneficiary-step-up-pin` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up-pin.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up-pin.md>) |
| `cr-pathways-beneficiary-step-up` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up.md>) |
| `cr-pathways-codebase-modularization` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-codebase-modularization.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-codebase-modularization.md>) |
| `cr-pathways-core-p1-supporting-operations` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-core-p1-supporting-operations.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-p1-supporting-operations.md>) |
| `cr-pathways-core-rbac-identity-review` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-core-rbac-identity-review.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-rbac-identity-review.md>) |
| `cr-pathways-csv-rbac-realignment` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-csv-rbac-realignment.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-csv-rbac-realignment.md>) |
| `cr-pathways-default-registration-form` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-default-registration-form.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-default-registration-form.md>) |
| `cr-pathways-defense-seed-snapshot` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-defense-seed-snapshot.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-defense-seed-snapshot.md>) |
| `cr-pathways-escalated-alerts` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-escalated-alerts.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-escalated-alerts.md>) |
| `cr-pathways-evaluation-auto-scoring` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-auto-scoring.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-auto-scoring.md>) |
| `cr-pathways-evaluation-write-path` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-write-path.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-write-path.md>) |
| `cr-pathways-f10-f11-runtime-authority` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-f10-f11-runtime-authority.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-f10-f11-runtime-authority.md>) |
| `cr-pathways-f8-f9-f12-gate-closure` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-f8-f9-f12-gate-closure.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-f8-f9-f12-gate-closure.md>) |
| `cr-pathways-f9-trusted-aggregates` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-f9-trusted-aggregates.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-f9-trusted-aggregates.md>) |
| `cr-pathways-frontend-usability` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-frontend-usability.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-frontend-usability.md>) |
| `cr-pathways-guided-rule-setup` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-guided-rule-setup.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-guided-rule-setup.md>) |
| `cr-pathways-import-throughput-and-pdf` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-import-throughput-and-pdf.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-throughput-and-pdf.md>) |
| `cr-pathways-import-value-map` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-import-value-map.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-value-map.md>) |
| `cr-pathways-indicator-form-and-type` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-form-and-type.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-form-and-type.md>) |
| `cr-pathways-indicator-library` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-library.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-library.md>) |
| `cr-pathways-journey-note` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-journey-note.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-journey-note.md>) |
| `cr-pathways-overview-zero-display` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-overview-zero-display.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-overview-zero-display.md>) |
| `cr-pathways-page-load-performance` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-page-load-performance.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-page-load-performance.md>) |
| `cr-pathways-performance-scaling` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-performance-scaling.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-performance-scaling.md>) |
| `cr-pathways-private-activity-proof-inspection` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-private-activity-proof-inspection.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-private-activity-proof-inspection.md>) |
| `cr-pathways-program-manager-project-assignment` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-program-manager-project-assignment.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-program-manager-project-assignment.md>) |
| `cr-pathways-project-coverage-map` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-project-coverage-map.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-coverage-map.md>) |
| `cr-pathways-project-rbac-ui-and-partners` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-project-rbac-ui-and-partners.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-rbac-ui-and-partners.md>) |
| `cr-pathways-project-status-report` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-project-status-report.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-status-report.md>) |
| `cr-pathways-proof-session-beneficiary-count` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-proof-session-beneficiary-count.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-proof-session-beneficiary-count.md>) |
| `cr-pathways-rbac-audit-closure` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-audit-closure.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-audit-closure.md>) |
| `cr-pathways-rbac-v4-adoption` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-adoption.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-adoption.md>) |
| `cr-pathways-rbac-v4-grant-migration` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-grant-migration.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-grant-migration.md>) |
| `cr-pathways-replay-harness-modernization` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-replay-harness-modernization.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-replay-harness-modernization.md>) |
| `cr-pathways-report-pdf-renderer` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-report-pdf-renderer.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-report-pdf-renderer.md>) |
| `cr-pathways-retire-project-target-goal` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-retire-project-target-goal.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-retire-project-target-goal.md>) |
| `cr-pathways-revised-rbac-baseline` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-revised-rbac-baseline.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-revised-rbac-baseline.md>) |
| `cr-pathways-rule-severity-guidance` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-severity-guidance.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-severity-guidance.md>) |
| `cr-pathways-rule-terminology-and-guidance` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-terminology-and-guidance.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-terminology-and-guidance.md>) |
| `cr-pathways-rules-board-ui` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-board-ui.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-board-ui.md>) |
| `cr-pathways-rules-hosted-scheduler` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-hosted-scheduler.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-hosted-scheduler.md>) |
| `cr-pathways-rules-metric-catalog-and-auto-resolve` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-metric-catalog-and-auto-resolve.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-metric-catalog-and-auto-resolve.md>) |
| `cr-pathways-self-managed-rollout-scenarios` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-self-managed-rollout-scenarios.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-self-managed-rollout-scenarios.md>) |
| `cr-pathways-severity-classification` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-severity-classification.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-severity-classification.md>) |
| `cr-pathways-signin-lockout` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-signin-lockout.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-signin-lockout.md>) |
| `cr-pathways-smart-import-mapping` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-smart-import-mapping.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-smart-import-mapping.md>) |
| `cr-pathways-zone-check-memo` | [01_Projects/PATHWAYS/Change_Records/cr-pathways-zone-check-memo.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Change_Records/cr-pathways-zone-check-memo.md>) |
| `activity-log` | [01_Projects/PATHWAYS/Logs/activity-log.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Logs/activity-log.md>) |
| `log-pathways` | [01_Projects/PATHWAYS/Logs/log-pathways.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Logs/log-pathways.md>) |
| `deferred-features` | [01_Projects/PATHWAYS/Planning/deferred-features.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Planning/deferred-features.md>) |
| `idea-pathways` | [01_Projects/PATHWAYS/Planning/idea-pathways.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Planning/idea-pathways.md>) |
| `pitch-pathways` | [01_Projects/PATHWAYS/Planning/pitch-pathways.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Planning/pitch-pathways.md>) |
| `scrutiny-pathways` | [01_Projects/PATHWAYS/Planning/scrutiny-pathways.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Planning/scrutiny-pathways.md>) |
| `wrap-pathways` | [01_Projects/PATHWAYS/Planning/wrap-pathways.md](<C:/AI Agentic Memory/01_Projects/PATHWAYS/Planning/wrap-pathways.md>) |
| `aia-pathways` | [02_Areas/Compliance_&_Security/PATHWAYS/aia-pathways.md](<C:/AI Agentic Memory/02_Areas/Compliance_&_Security/PATHWAYS/aia-pathways.md>) |
| `clr-pathways` | [02_Areas/Compliance_&_Security/PATHWAYS/clr-pathways.md](<C:/AI Agentic Memory/02_Areas/Compliance_&_Security/PATHWAYS/clr-pathways.md>) |
| `rfc-pathways-auth-rbac-isolation` | [02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-auth-rbac-isolation.md](<C:/AI Agentic Memory/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-auth-rbac-isolation.md>) |
| `rfc-pathways-saddd-privacy` | [02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-saddd-privacy.md](<C:/AI Agentic Memory/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-saddd-privacy.md>) |
| `build-pathways` | [02_Areas/Dev_&_Ops/PATHWAYS/build-pathways.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/build-pathways.md>) |
| `ops-pathways` | [02_Areas/Dev_&_Ops/PATHWAYS/ops-pathways.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/ops-pathways.md>) |
| `runbook-backup-restore` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-backup-restore.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-backup-restore.md>) |
| `runbook-defense-demo` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-defense-demo.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-defense-demo.md>) |
| `runbook-doc-reconciliation` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-doc-reconciliation.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-doc-reconciliation.md>) |
| `runbook-migration-baseline` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-migration-baseline.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-migration-baseline.md>) |
| `runbook-role-staging-build` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-role-staging-build.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-role-staging-build.md>) |
| `runbook-rule-creation-test` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-rule-creation-test.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-rule-creation-test.md>) |
| `runbook-severity-panel-demo` | [02_Areas/Dev_&_Ops/PATHWAYS/runbook-severity-panel-demo.md](<C:/AI Agentic Memory/02_Areas/Dev_&_Ops/PATHWAYS/runbook-severity-panel-demo.md>) |
| `gtm-pathways` | [02_Areas/Quality_&_Strategy/PATHWAYS/gtm-pathways.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/gtm-pathways.md>) |
| `qad-pathways` | [02_Areas/Quality_&_Strategy/PATHWAYS/qad-pathways.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/qad-pathways.md>) |
| `severity-guide-v0-2` | [02_Areas/Quality_&_Strategy/PATHWAYS/severity-guide-v0-2.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/severity-guide-v0-2.md>) |
| `ues-pathways` | [02_Areas/Quality_&_Strategy/PATHWAYS/ues-pathways.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/ues-pathways.md>) |
| `val-pathways` | [02_Areas/Quality_&_Strategy/PATHWAYS/val-pathways.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/val-pathways.md>) |
| `voice-pathways` | [02_Areas/Quality_&_Strategy/PATHWAYS/voice-pathways.md](<C:/AI Agentic Memory/02_Areas/Quality_&_Strategy/PATHWAYS/voice-pathways.md>) |
| `brd-pathways` | [03_Resources/Blueprints/PATHWAYS/brd-pathways.md](<C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/brd-pathways.md>) |
| `dsd-pathways` | [03_Resources/Blueprints/PATHWAYS/dsd-pathways.md](<C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/dsd-pathways.md>) |
| `prd-pathways` | [03_Resources/Blueprints/PATHWAYS/prd-pathways.md](<C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/prd-pathways.md>) |
| `sad-pathways` | [03_Resources/Blueprints/PATHWAYS/sad-pathways.md](<C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/sad-pathways.md>) |
| `sdd-pathways` | [03_Resources/Blueprints/PATHWAYS/sdd-pathways.md](<C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/sdd-pathways.md>) |
| `rfc-pathways-aws-hosting-migration` | [03_Resources/RFCs/PATHWAYS/rfc-pathways-aws-hosting-migration.md](<C:/AI Agentic Memory/03_Resources/RFCs/PATHWAYS/rfc-pathways-aws-hosting-migration.md>) |
| `rfc-pathways-metadata-ingestion` | [03_Resources/RFCs/PATHWAYS/rfc-pathways-metadata-ingestion.md](<C:/AI Agentic Memory/03_Resources/RFCs/PATHWAYS/rfc-pathways-metadata-ingestion.md>) |
| `rfc-pathways-rule-alerts-decision-support` | [03_Resources/RFCs/PATHWAYS/rfc-pathways-rule-alerts-decision-support.md](<C:/AI Agentic Memory/03_Resources/RFCs/PATHWAYS/rfc-pathways-rule-alerts-decision-support.md>) |
| `audit-pathways-frontend-controls-20260929` | [04_Archives/Audits/2026-09/audit-pathways-frontend-controls-20260929.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-09/audit-pathways-frontend-controls-20260929.md>) |
| `audit-pathways-rbac-csv-20260928` | [04_Archives/Audits/2026-09/audit-pathways-rbac-csv-20260928.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-09/audit-pathways-rbac-csv-20260928.md>) |
| `audit-pathways-codebase-modularity-20261009` | [04_Archives/Audits/2026-10/audit-pathways-codebase-modularity-20261009.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-10/audit-pathways-codebase-modularity-20261009.md>) |
| `audit-pathways-core-features-qa-20261001` | [04_Archives/Audits/2026-10/audit-pathways-core-features-qa-20261001.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-10/audit-pathways-core-features-qa-20261001.md>) |
| `audit-pathways-defense-readiness-20261005` | [04_Archives/Audits/2026-10/audit-pathways-defense-readiness-20261005.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-10/audit-pathways-defense-readiness-20261005.md>) |
| `audit-pathways-manuscript-alignment-20261001` | [04_Archives/Audits/2026-10/audit-pathways-manuscript-alignment-20261001.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-10/audit-pathways-manuscript-alignment-20261001.md>) |
| `index` | [04_Archives/Audits/2026-10/index.md](<C:/AI Agentic Memory/04_Archives/Audits/2026-10/index.md>) |
