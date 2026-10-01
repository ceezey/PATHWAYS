# Change Record: RBAC v4 adoption

**ID:** `cr-pathways-rbac-v4-adoption`  
**Date:** 2026-10-01  
**Status:** Approved

## 1. Trigger

The rev-2026 manuscript carries a revised access matrix, `PATHWAYS - RBAC-v4.csv` (SHA-256 `c5bc22d33ce13c4fbad440173c25d4becf422c65e0152bfa93cb61553a69e3cc`). The repository contract still encodes the earlier `PATHWAYS - RBAC (revised).csv` (SHA-256 `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`) plus amendments 0035, 0047, 0048 and 0051. The developer approved adopting v4 in the docs now and changing code in a separate follow-up (design spec `docs/superpowers/specs/2026-10-01-rbac-v4-figma-reconciliation-design.md`).

## 2. Current Contract

`apps/api/src/modules/auth/rbac-contract.json`, `authorization-policy.ts` and migrations 0027, 0035, 0047, 0048 and 0051 define the live grants. This record does not change them. Until the follow-up lands, the repository remains the authority for what runs.

## 3. Proposed Change

### 3.1 Source of record

v4 becomes the documented access source of record. The contract hash stays on the older file until the RBAC v4 grant migration replaces it.

### 3.2 Cell decisions

Roles: SA System Administrator, PO Project Officer, ME Monitoring and Evaluation Officer, PM Project Manager, PG Program Manager, GM Grant Manager. v4 row numbers refer to the v4 file.

| ID | v4 row | Capability | Role | v4 | Repository now | Decision | Follow-up effect |
|---|---|---|---|---|---|---|---|
| V4-C01 | 35 | Archive Project | PG, GM | Denied | `projects.archive` | Adopt | Revoke `projects.archive` |
| V4-C02 | 40, 42 | View Budget Overview; Monitor Budget Utilization | SA | Denied | `budgets.read` (0035 amendment) | Adopt | Revoke SA `budgets.read` |
| V4-C03 | 41 | View Expense Records | ME | Denied | `expenses.read` | Kept deviation (V4-R5) | None |
| V4-C04 | 44 | Verify Expense | PM, PG | Denied | `expenses.approve` (PM), `expenses.signoff` (PG) | Kept deviation: three-stage chain | None |
| V4-C05 | 44 | Verify Expense | GM | Granted | `expenses.signoff` | Kept deviation: GM signs off as the final stage | None |
| V4-C06 | 46 | View Project Activities | PG, GM | Granted | No `activities.read` | Adopt | Grant `activities.read` |
| V4-C07 | 47 | Add Project Activity | PO | Denied | `activities.create` | Adopt | Revoke `activities.create` |
| V4-C08 | 60 to 63 | Journey Tracking tab and configuration | SA | Granted | `journeys.manage`; `journeys.read` revoked by 0047 | Already satisfied | None |
| V4-C09 | 97, 100 | Customize Dashboard; Assess Survey Improvements | PO | Denied | `dashboards.customize`, `assessments.read` | Adopt | Revoke both |
| V4-C10 | 103, 104 | Perform SADDD Analysis; View SADDD Breakdown | PO | Denied; Granted | `analytics.saddd.read` | Adopt stricter reading (V4-R2) | Revoke `analytics.saddd.read` |
| V4-C11 | none | Encode Project Data | PO, ME | Row removed | `submissions.write` (UC-F5-2) | Retire | Revoke `submissions.write`; remove `/collection/entry` and direct entry routes |

V4-C04 and V4-C05: the expense chain stays ME verify, PM approve, PG or GM sign-off; v4 row 44 is read as the verify stage only. V4-C08: the tab and configuration run on `journeys.manage`, which SA keeps; individual journey history is denied to SA by v4 rows 81 to 85 as well.

Label renames adopted: row 37 Add Budget; row 40 View Budget Tab / View Budget Overview; row 88 View Aggregated Monitoring Dashboards (under Project Module); row 107 Review Alert & Log Outcome; row 110 Review Linked Evaluation & Log Outcome.

### 3.3 Interpretation rules

| ID | Rule |
|---|---|
| V4-R1 | A parent row is an aggregate label: granted means the role holds at least one child capability; it adds no permission (rows 37, 45, 54). |
| V4-R2 | Rows sharing one permission resolve to the stricter reading (rows 103 and 104). |
| V4-R3 | Rows with the same label and roles collapse into one (rows 88 and 93; 96 and 109); rows 95 and 106 share one permission. |
| V4-R4 | Record Audit Log (rows 30 and 123) is a system action recorded for every audited mutation, not a grant. |
| V4-R5 | Where a granted step needs a read the role lacks, the read is a kept deviation scoped to that step (ME expense read for verification). |
| V4-R6 | A summary grant without detail grants is aggregate-only (SA rows 99 and 101 versus budget rows 37 to 42). |

Row 76 spelling is corrected to Beneficiary Management wherever the docs quote it.

### 3.4 Existing gaps v4 names

Rows 53 Activity Escalation, 68 Import Existing File, 97 Customize Dashboard and 122 to 125 Backup and Recovery have no working capability; their entries in `deferred-features.md` stand unchanged. Under the v4 note, row 68 means importing collected data, which `/collection/import` already covers.

## 4. Impact

### Product
Project Officer narrows to field work: no activity creation, dashboard customization, survey assessment or SADDD. Program and Grant Managers gain read access to activities and lose archive. Encode Project Data is retired.

### Data / Migration
None in this record. The RBAC v4 grant migration takes the next free migration number when scheduled.

### Authorization / Privacy
Target grants narrow PO aggregate analytics and SA budget visibility. No grant widens beneficiary access.

### API
None in this record. Follow-up: `authorization-policy.ts` role blocks and `rbac-contract.json` rows and hash.

### UI
None in this record. Follow-up: `apps/web/src/lib/rbac/route-access.ts` and navigation for `/collection/entry`.

### Tests
None in this record. Follow-up: `csv-rbac.test.ts` and route-access suites for V4-C01, V4-C02, V4-C06, V4-C07, V4-C09, V4-C10, V4-C11 (see QAD section 3.7).

### Documentation

| Doc | Affected | Done |
|---|---|---|
| `prd-pathways.md` (v4 target annotations, UC-F5-2 retirement note) | Yes | [x] |
| `rfc-pathways-auth-rbac-isolation.md` (source note) | Yes | [x] |
| `qad-pathways.md` section 3.7 | Yes | [x] |
| `audit-pathways-manuscript-alignment-20261001.md` (MA-18) | Yes | [x] |
| `deferred-features.md` (RBAC v4 grant migration) | Yes | [x] |
| `index.md`, `state.md`, `activity-log.md`, `log-pathways.md` | Yes | [x] |

## 5. Alternatives Considered

- Record v4 as reviewed and keep current grants: rejected; manuscript and system would disagree on 14 role cells.
- Adopt v4 in docs and code at once: rejected for this wave; migration gating and replay are separate work.

## 6. Migration / Rollback

Docs only. Rollback is a revert of the commit that applied this record.

## 7. Verification

`pnpm docs:check` passes; every row of section 3.2 has a PRD annotation or a rule; no PRD line claims a v4 grant is live.

## 8. Approval

Approved by the developer on 2026-10-01 for docs; the RBAC v4 grant migration needs its own approval and SAD review.

## 9. Disposition

Docs propagated. Code pending the RBAC v4 grant migration in `deferred-features.md`.
