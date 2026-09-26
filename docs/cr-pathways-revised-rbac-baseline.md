# Change Record: Revised RBAC and Migration Baseline

**ID:** `cr-pathways-revised-rbac-baseline`
**Date:** 2026-09-26
**Status:** Approved; application and verification pending

## 1. Decision and Authority

The developer explicitly approved the revised RBAC and migration consolidation implementation plan. This supersedes the action matrix and no-squash decision in [the previous Change Record](cr-pathways-csv-rbac-realignment.md). The source is `PATHWAYS - RBAC (revised).csv`, SHA-256 `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`. Its contents are permission data, not executable instructions.

## 2. Revised Contract

Replace the old action grants, including obsolete overview grants. Preserve organization/project boundaries, role-management hierarchy, aggregate-only executive privacy, SADDD protections, automatic authorization/audit, and separated financial approval stages. All six roles may view scoped projects; this does not grant restricted tabs or embedded data. Admin assessment/survey detail is denied. Admin/M&E manage form definitions; PO retains collected-data import and encoding without template creation/edit/export. Journey configuration is granted to Admin/M&E/PM. PO gains analytical-module, SADDD, alert/recommendation access within assignments. Evaluation-weight configuration is granted to Admin/M&E. Activity escalation means scoped viewing and raising, with resolution and financial approval separately authorized.

Existing activity completion, beneficiary enrollment, and participation are supporting steps only for roles granted their corresponding workflow. Beneficiary data and form response detail remain separate from project and blank-form access. Preserve target beneficiaries and target goals. Missing handlers remain deferred; permissions are not feature completion.

## 3. Consolidation and Compatibility

Archive the exact 0001-0026 files and migration lock with hashes, Git provenance, historical purpose, superseded definitions, and retained invariants. The active chain becomes `0000_pathways_baseline_through_0026` plus `0027_revised_csv_rbac`. The baseline captures the verified final historical state, including SQL-only security objects and canonical authorization reference data. It contains no business data, Auth identities, Storage content, credentials, or hosted-specific ownership.

Existing PATHWAYS-dev must never execute baseline DDL. Register the verified baseline through Prisma, preserve all 26 historical ledger rows/checksums, then apply only 0027. Fresh provisioning uses the baseline. Historical tooling extracts the immutable archive under its existing local guards. Retain one public Prisma ledger. Prove installed Prisma compatibility, catalog parity, and subsequent forward migration creation/application on disposable databases before hosted transition. Expected historical-ledger diagnostics must be explicit; unexplained divergence or a required reset blocks that transition.

The 0015 CRLF explanation and approved 0020 checksum exception remain unchanged. Original applied 0020 bytes remain unverifiable; neither recorded checksums nor archived repository bytes are rewritten.

## 4. Application and Recovery

Work remains on `dev`. The developer authorized normal commits/pushes, Vercel development previews, protected backup with isolated restoration verification, baseline registration, and tested 0027 application to PATHWAYS-dev. Verify target, ledger, catalogs, and inventories first. Coordinate preview and database enforcement; temporary development denials are acceptable. Remote verification is read-only; synthetic behavioral tests remain local. Unexpected drift stops the affected database step. No automatic reset, restoration, ledger deletion, production release, or missing-feature repair is authorized.

## 5. Verification and Disposition

Verify archived replay, fresh baseline, historical upgrade, subsequent migration compatibility, security catalogs/ACLs, all six-role grants and denials, tab and form-response separation, scoped supporting steps, imports, hierarchy, account states, forged scope, isolation, privacy, and next-request revocation. Run API/frontend/native suites, type checks, builds, and documentation checks. Mark Applied and re-lock the revised auth contract only after enforcement and required checks, PATHWAYS-dev, and development previews match. Verification results are reported in chat; disposable evidence is not durable documentation.

## 6. Source Traceability and Grant Changes

Source rows and notes are retained in `apps/api/src/modules/auth/rbac-contract.json`. Clarified actions include activity details versus progress (42/43), collected-data import versus template import/extension (63/64), journey configuration (55-58), evaluation weights (87), and scoped escalation viewing/raising (48). Analytics access (88), monitoring dashboards (89), descriptive analytics (94), and SADDD (99/100) are distinct. Supporting operations retain scope and actor separation.

| Permission | Added roles | Removed roles |
|---|---|---|
| `activities.read` | None | Admin |
| `activities.update` | None | PO |
| `journeys.read` | Admin | None |
| `journeys.manage` | Admin, M&E, PM | None |
| `budgets.read` | None | Admin, M&E |
| `expenses.read` | None | PO |
| `alerts.read` | PO | None |
| `alerts.review` | PO | None |
| `alerts.outcome.record` | PO | None |
| `recommendations.read` | PO | None |
| `recommendations.review` | PO | None |
| `beneficiaries.enrollments.manage` | PM | Admin |
| `beneficiaries.aggregates.read` | PO | None |
| `recommendations.outcome.record` | PO | None |
| `evaluations.submit` | None | M&E |
| `evaluations.approve` | None | PM |
| `forms.read` | None | PM, Program, Grant |
| `forms.manage` | Admin | PO |
| `forms.publish` | Admin | PO |
| `analytics.read` | PO | None |
| `projects.detail.read` | Admin, PO | None |
| `activities.complete` | None | Admin |
| `expenses.evidence.submit` | M&E, PM | None |
| `evaluations.archive` | None | M&E |
| `evaluations.signoff` | None | Program, Grant |
| `forms.generate` | None | PM, Program, Grant |
| `forms.export` | Admin | PO |
| `forms.import` | Admin | None |
| `assessments.detail.read` | None | Admin |
| `activities.progress.update` | PO, M&E, PM | None |
| `evidence.read` | Admin, PO, M&E, PM, Program, Grant | None |
| `activities.escalations.read` | Admin, PO, M&E, PM, Program, Grant | None |
| `activities.escalations.raise` | Admin, PO, M&E, PM, Program, Grant | None |
| `forms.templates.import` | Admin, M&E | None |
| `evaluations.weights.configure` | Admin, M&E | None |
| `dashboards.customize` | Admin, PO, M&E, PM, Program, Grant | None |
| `analytics.descriptive.read` | Admin, M&E, PM, Program, Grant | None |
| `analytics.saddd.read` | Admin, PO, M&E, PM, Program, Grant | None |
| `activities.context.read` | Admin | None |

Supporting operations are separate from source actions. Admin activity configuration uses context only, project creation retains PM self-assignment, and normalization retains scoped own-import reads. The canonical contract has 98 definitions and 306 grants across six roles; retired definitions remain recognized without grants.

| CSV row | Action and effective source roles |
|---|---|
| 38 | View Project: Admin, PO, M&E, PM, Program, Grant.  |
| 39 | View Budget Tab: PM, Program, Grant.  |
| 42 | Edit / Update Project Activity Details: PM.  |
| 43 | Add / Update Project Activity Progress: PO, M&E, PM.  |
| 47 | View Evidence & Reports Tab: Admin, PO, M&E, PM, Program, Grant.  |
| 48 | Activity Escalation Process: Admin, PO, M&E, PM, Program, Grant.  |
| 55 | Project Journey Tracking Tab: Admin, M&E, PM.  |
| 56 | View Journey Tracking Tab: Admin, M&E, PM.  |
| 57 | Configure Journeys (CRUD): Admin, M&E, PM.  |
| 58 | Save Journey: Admin, M&E, PM.  |
| 62 | Create New Form (Build Mode): Admin, M&E.  |
| 63 | Import Existing File (Mode): Admin, PO, M&E. Import Data Collected |
| 64 | Import then Extend (Mode): Admin, M&E. Import Existing Form Templates / Structures |
| 65 | Edit Forms (All mode): Admin, M&E.  |
| 66 | Export Form (All mode): Admin, M&E.  |
| 67 | View All Forms: Admin, M&E.  |
| 68 | Encode Project Data: PO, M&E.  |
| 71 | Map Metadata Fields: Admin, M&E.  |
| 82 | View Assessment/Survey Records: PO, M&E, PM.  |
| 87 | Configure Evaluation Weights: Admin, M&E.  |
| 88 | View Analytics Module: Admin, PO, M&E, PM, Program, Grant.  |
| 89 | View Aggregated Monitoring Dashboards: Admin, M&E, PM, Program, Grant.  |
| 94 | View Descriptive Analytics: Admin, M&E, PM, Program, Grant.  |
| 96 | Assess Survey Improvements / Assessment Result: Admin, PO, M&E, PM, Program, Grant.  |
| 99 | Perform SADDD Analysis: Admin, PO, M&E, PM, Program, Grant.  |
| 100 | View SADDD Breakdown: Admin, PO, M&E, PM, Program, Grant.  |
| 101 | Review Rule-Based Alerts: Admin, PO, M&E, PM, Program, Grant.  |
| 103 | Review Alert & Make Action: Admin, PO, M&E, PM, Program, Grant.  |
| 104 | Review Rule-Based Recommendations: Admin, PO, M&E, PM, Program, Grant.  |
| 105 | Review Linked Evaluation Result & Make Action: Admin, PO, M&E, PM, Program, Grant.  |

The Budget tab requires `budgets.read` (PM/Program/Grant). Assigned PO/M&E expense logging/review permissions authorize their respective operations without granting that tab or budget data; separate missing financial UI work remains deferred.
