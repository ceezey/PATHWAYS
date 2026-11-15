# Documentation Index: PATHWAYS (pointer)

**Project:** PATHWAYS
**Slug:** `pathways`
**Maintainer:** PATHWAYS capstone team
**Last updated:** 2026-10-20

This file stays in the repo only so that humans and agents know where to look. Since 2026-10-20 the documentation, its status manifest and the project memory live in the AI Memory Vault at `C:/AI Agentic Memory`. Create and edit docs there, never in this repo.

## Start here

1. Read the vault rules: [AGENTS.md](<C:/AI Agentic Memory/AGENTS.md>).
2. Read the project index, which is also the doc status manifest (suite table, Change Log, Health Check): [00_Project_Index.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/00_Project_Index.md>).
3. Read the session notes, starting at [pathways-memory-index.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Memory/pathways-memory-index.md>).

## What stays in the repo

| File | Role |
|---|---|
| `AGENTS.md` | Build guide, generated from the vault note `build-pathways` by `.vault/scripts/pathways_docs/materialize.py`; never hand-edit |
| `CLAUDE.md` | Claude Code notes; defers to `AGENTS.md` |
| `CODEX.md` | Codex platform usage and `.codex/agents/*.toml` bindings |
| `docs/index.md` | This pointer |
| `README.md` | Repository entry point, branch policy and local setup |
| `.claude/agents/`, `.codex/agents/` | Subagent definitions; they cite the vault SAD, BUILD, PRD and QAD |
| `apps/**/*.md`, `infra/**/*.md` | Code-adjacent READMEs and setup notes |

Removed on 2026-10-20: every other `docs/*.md` (now vault notes with the same basename), `IDEA.md` (Appendix of `idea-pathways`), `BRAND.md` and `DESIGN.md` (`dsd-pathways`), and the `docs:check` / `docs:materialize` scripts (now `.vault/scripts/pathways_docs/`). Git history keeps every removed file.

## Where each doc lives

The old repo path `docs/<name>.md` is the vault note `<name>`. The table lists every PATHWAYS vault note except `Memory/`, as of the date above; the vault itself is the live list.

| Note | Vault path |
|---|---|
| `00_Project_Index` | [Developer/01_Projects/PATHWAYS/00_Project_Index.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/00_Project_Index.md>) |
| `cr-pathways-activity-escalation` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-escalation.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-escalation.md>) |
| `cr-pathways-activity-extension-request` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-extension-request.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-extension-request.md>) |
| `cr-pathways-activity-overdue-explanation` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-overdue-explanation.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-overdue-explanation.md>) |
| `cr-pathways-activity-progress-media` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-progress-media.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-activity-progress-media.md>) |
| `cr-pathways-admin-read-access` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-admin-read-access.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-admin-read-access.md>) |
| `cr-pathways-assessment-score-entry` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-assessment-score-entry.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-assessment-score-entry.md>) |
| `cr-pathways-beneficiary-assessment-view` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-assessment-view.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-assessment-view.md>) |
| `cr-pathways-beneficiary-progress-read` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-progress-read.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-progress-read.md>) |
| `cr-pathways-beneficiary-reach-kpi-values` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-reach-kpi-values.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-reach-kpi-values.md>) |
| `cr-pathways-beneficiary-step-up-pin` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up-pin.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up-pin.md>) |
| `cr-pathways-beneficiary-step-up` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-beneficiary-step-up.md>) |
| `cr-pathways-codebase-modularization` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-codebase-modularization.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-codebase-modularization.md>) |
| `cr-pathways-core-p1-supporting-operations` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-p1-supporting-operations.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-p1-supporting-operations.md>) |
| `cr-pathways-core-rbac-identity-review` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-rbac-identity-review.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-core-rbac-identity-review.md>) |
| `cr-pathways-csv-rbac-realignment` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-csv-rbac-realignment.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-csv-rbac-realignment.md>) |
| `cr-pathways-default-registration-form` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-default-registration-form.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-default-registration-form.md>) |
| `cr-pathways-defense-seed-snapshot` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-defense-seed-snapshot.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-defense-seed-snapshot.md>) |
| `cr-pathways-escalated-alerts` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-escalated-alerts.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-escalated-alerts.md>) |
| `cr-pathways-evaluation-auto-scoring` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-auto-scoring.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-auto-scoring.md>) |
| `cr-pathways-evaluation-write-path` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-write-path.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-evaluation-write-path.md>) |
| `cr-pathways-f10-f11-runtime-authority` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f10-f11-runtime-authority.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f10-f11-runtime-authority.md>) |
| `cr-pathways-f8-f9-f12-gate-closure` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f8-f9-f12-gate-closure.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f8-f9-f12-gate-closure.md>) |
| `cr-pathways-f9-trusted-aggregates` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f9-trusted-aggregates.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-f9-trusted-aggregates.md>) |
| `cr-pathways-frontend-usability` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-frontend-usability.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-frontend-usability.md>) |
| `cr-pathways-guided-rule-setup` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-guided-rule-setup.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-guided-rule-setup.md>) |
| `cr-pathways-import-throughput-and-pdf` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-throughput-and-pdf.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-throughput-and-pdf.md>) |
| `cr-pathways-import-value-map` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-value-map.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-import-value-map.md>) |
| `cr-pathways-indicator-form-and-type` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-form-and-type.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-form-and-type.md>) |
| `cr-pathways-indicator-library` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-library.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-indicator-library.md>) |
| `cr-pathways-journey-note` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-journey-note.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-journey-note.md>) |
| `cr-pathways-overview-zero-display` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-overview-zero-display.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-overview-zero-display.md>) |
| `cr-pathways-page-load-performance` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-page-load-performance.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-page-load-performance.md>) |
| `cr-pathways-performance-scaling` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-performance-scaling.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-performance-scaling.md>) |
| `cr-pathways-private-activity-proof-inspection` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-private-activity-proof-inspection.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-private-activity-proof-inspection.md>) |
| `cr-pathways-program-manager-project-assignment` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-program-manager-project-assignment.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-program-manager-project-assignment.md>) |
| `cr-pathways-project-coverage-map` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-coverage-map.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-coverage-map.md>) |
| `cr-pathways-project-rbac-ui-and-partners` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-rbac-ui-and-partners.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-rbac-ui-and-partners.md>) |
| `cr-pathways-project-status-report` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-status-report.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-project-status-report.md>) |
| `cr-pathways-proof-session-beneficiary-count` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-proof-session-beneficiary-count.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-proof-session-beneficiary-count.md>) |
| `cr-pathways-rbac-audit-closure` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-audit-closure.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-audit-closure.md>) |
| `cr-pathways-rbac-v4-adoption` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-adoption.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-adoption.md>) |
| `cr-pathways-rbac-v4-grant-migration` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-grant-migration.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rbac-v4-grant-migration.md>) |
| `cr-pathways-replay-harness-modernization` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-replay-harness-modernization.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-replay-harness-modernization.md>) |
| `cr-pathways-report-pdf-renderer` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-report-pdf-renderer.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-report-pdf-renderer.md>) |
| `cr-pathways-retire-project-target-goal` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-retire-project-target-goal.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-retire-project-target-goal.md>) |
| `cr-pathways-revised-rbac-baseline` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-revised-rbac-baseline.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-revised-rbac-baseline.md>) |
| `cr-pathways-rule-severity-guidance` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-severity-guidance.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-severity-guidance.md>) |
| `cr-pathways-rule-terminology-and-guidance` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-terminology-and-guidance.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rule-terminology-and-guidance.md>) |
| `cr-pathways-rules-board-ui` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-board-ui.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-board-ui.md>) |
| `cr-pathways-rules-hosted-scheduler` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-hosted-scheduler.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-hosted-scheduler.md>) |
| `cr-pathways-rules-metric-catalog-and-auto-resolve` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-metric-catalog-and-auto-resolve.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-rules-metric-catalog-and-auto-resolve.md>) |
| `cr-pathways-self-managed-rollout-scenarios` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-self-managed-rollout-scenarios.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-self-managed-rollout-scenarios.md>) |
| `cr-pathways-severity-classification` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-severity-classification.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-severity-classification.md>) |
| `cr-pathways-signin-lockout` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-signin-lockout.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-signin-lockout.md>) |
| `cr-pathways-smart-import-mapping` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-smart-import-mapping.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-smart-import-mapping.md>) |
| `cr-pathways-zone-check-memo` | [Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-zone-check-memo.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Change_Records/cr-pathways-zone-check-memo.md>) |
| `activity-log` | [Developer/01_Projects/PATHWAYS/Logs/activity-log.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Logs/activity-log.md>) |
| `log-pathways` | [Developer/01_Projects/PATHWAYS/Logs/log-pathways.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Logs/log-pathways.md>) |
| `deferred-features` | [Developer/01_Projects/PATHWAYS/Planning/deferred-features.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Planning/deferred-features.md>) |
| `idea-pathways` | [Developer/01_Projects/PATHWAYS/Planning/idea-pathways.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Planning/idea-pathways.md>) |
| `pitch-pathways` | [Developer/01_Projects/PATHWAYS/Planning/pitch-pathways.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Planning/pitch-pathways.md>) |
| `scrutiny-pathways` | [Developer/01_Projects/PATHWAYS/Planning/scrutiny-pathways.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Planning/scrutiny-pathways.md>) |
| `wrap-pathways` | [Developer/01_Projects/PATHWAYS/Planning/wrap-pathways.md](<C:/AI Agentic Memory/Developer/01_Projects/PATHWAYS/Planning/wrap-pathways.md>) |
| `aia-pathways` | [Developer/02_Areas/Compliance_&_Security/PATHWAYS/aia-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Compliance_&_Security/PATHWAYS/aia-pathways.md>) |
| `clr-pathways` | [Developer/02_Areas/Compliance_&_Security/PATHWAYS/clr-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Compliance_&_Security/PATHWAYS/clr-pathways.md>) |
| `rfc-pathways-auth-rbac-isolation` | [Developer/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-auth-rbac-isolation.md](<C:/AI Agentic Memory/Developer/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-auth-rbac-isolation.md>) |
| `rfc-pathways-saddd-privacy` | [Developer/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-saddd-privacy.md](<C:/AI Agentic Memory/Developer/02_Areas/Compliance_&_Security/PATHWAYS/rfc-pathways-saddd-privacy.md>) |
| `build-pathways` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/build-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/build-pathways.md>) |
| `ops-pathways` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/ops-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/ops-pathways.md>) |
| `runbook-backup-restore` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-backup-restore.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-backup-restore.md>) |
| `runbook-defense-demo` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-defense-demo.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-defense-demo.md>) |
| `runbook-doc-reconciliation` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-doc-reconciliation.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-doc-reconciliation.md>) |
| `runbook-migration-baseline` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-migration-baseline.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-migration-baseline.md>) |
| `runbook-role-staging-build` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-role-staging-build.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-role-staging-build.md>) |
| `runbook-rule-creation-test` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-rule-creation-test.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-rule-creation-test.md>) |
| `runbook-severity-panel-demo` | [Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-severity-panel-demo.md](<C:/AI Agentic Memory/Developer/02_Areas/Dev_&_Ops/PATHWAYS/runbook-severity-panel-demo.md>) |
| `gtm-pathways` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/gtm-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/gtm-pathways.md>) |
| `qad-pathways` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/qad-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/qad-pathways.md>) |
| `severity-guide-v0-2` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/severity-guide-v0-2.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/severity-guide-v0-2.md>) |
| `ues-pathways` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/ues-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/ues-pathways.md>) |
| `val-pathways` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/val-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/val-pathways.md>) |
| `voice-pathways` | [Developer/02_Areas/Quality_&_Strategy/PATHWAYS/voice-pathways.md](<C:/AI Agentic Memory/Developer/02_Areas/Quality_&_Strategy/PATHWAYS/voice-pathways.md>) |
| `brd-pathways` | [Developer/03_Resources/Blueprints/PATHWAYS/brd-pathways.md](<C:/AI Agentic Memory/Developer/03_Resources/Blueprints/PATHWAYS/brd-pathways.md>) |
| `dsd-pathways` | [Developer/03_Resources/Blueprints/PATHWAYS/dsd-pathways.md](<C:/AI Agentic Memory/Developer/03_Resources/Blueprints/PATHWAYS/dsd-pathways.md>) |
| `prd-pathways` | [Developer/03_Resources/Blueprints/PATHWAYS/prd-pathways.md](<C:/AI Agentic Memory/Developer/03_Resources/Blueprints/PATHWAYS/prd-pathways.md>) |
| `sad-pathways` | [Developer/03_Resources/Blueprints/PATHWAYS/sad-pathways.md](<C:/AI Agentic Memory/Developer/03_Resources/Blueprints/PATHWAYS/sad-pathways.md>) |
| `sdd-pathways` | [Developer/03_Resources/Blueprints/PATHWAYS/sdd-pathways.md](<C:/AI Agentic Memory/Developer/03_Resources/Blueprints/PATHWAYS/sdd-pathways.md>) |
| `rfc-pathways-aws-hosting-migration` | [Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-aws-hosting-migration.md](<C:/AI Agentic Memory/Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-aws-hosting-migration.md>) |
| `rfc-pathways-metadata-ingestion` | [Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-metadata-ingestion.md](<C:/AI Agentic Memory/Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-metadata-ingestion.md>) |
| `rfc-pathways-rule-alerts-decision-support` | [Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-rule-alerts-decision-support.md](<C:/AI Agentic Memory/Developer/03_Resources/RFCs/PATHWAYS/rfc-pathways-rule-alerts-decision-support.md>) |
| `audit-pathways-frontend-controls-20260929` | [Developer/04_Archives/Audits/2026-09/audit-pathways-frontend-controls-20260929.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-09/audit-pathways-frontend-controls-20260929.md>) |
| `audit-pathways-rbac-csv-20260928` | [Developer/04_Archives/Audits/2026-09/audit-pathways-rbac-csv-20260928.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-09/audit-pathways-rbac-csv-20260928.md>) |
| `audit-pathways-codebase-modularity-20261009` | [Developer/04_Archives/Audits/2026-10/audit-pathways-codebase-modularity-20261009.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-10/audit-pathways-codebase-modularity-20261009.md>) |
| `audit-pathways-core-features-qa-20261001` | [Developer/04_Archives/Audits/2026-10/audit-pathways-core-features-qa-20261001.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-10/audit-pathways-core-features-qa-20261001.md>) |
| `audit-pathways-defense-readiness-20261005` | [Developer/04_Archives/Audits/2026-10/audit-pathways-defense-readiness-20261005.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-10/audit-pathways-defense-readiness-20261005.md>) |
| `audit-pathways-manuscript-alignment-20261001` | [Developer/04_Archives/Audits/2026-10/audit-pathways-manuscript-alignment-20261001.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-10/audit-pathways-manuscript-alignment-20261001.md>) |
| `index` | [Developer/04_Archives/Audits/2026-10/index.md](<C:/AI Agentic Memory/Developer/04_Archives/Audits/2026-10/index.md>) |
