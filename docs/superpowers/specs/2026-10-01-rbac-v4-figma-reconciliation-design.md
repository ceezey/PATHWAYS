# RBAC v4 and Figma Reference Reconciliation: Design

**Date:** 2026-10-01
**Branch:** `docs/rbac-v4-figma-reconcile` (cut from `dev` at `deae91f`)
**Path:** Architectural (brainstorming; spec, then plan)
**Status:** Draft for developer review

## 1. Intent

Run a second reconciliation wave on the canonical document suite so it reflects the manuscript's revised RBAC matrix (v4) and gives Claude Code a usable reference to the PATHWAYS Figma component board, without changing code in this wave.

Success means:

- the suite names RBAC v4 as the access source of record, with every differing cell marked Adopt or Kept deviation and every v4 inconsistency resolved by a written rule;
- the code changes needed to match v4 are registered as one follow-up, not silently implied;
- DSD carries a Figma reference section that a UI task can follow, while DSD and the Pathways interface foundations stay authoritative;
- the still-valid guidance in the two local-only module reference folders is tracked in DSD;
- `pnpm docs:check` passes and `docs:materialize` output changes only where DSD changed.

## 2. Inputs

| Input | Location | Use |
|---|---|---|
| RBAC v4 matrix | `PATHWAYS - RBAC-v4.csv` (manuscript revisions folder, outside the repo), SHA-256 `c5bc22d33ce13c4fbad440173c25d4becf422c65e0152bfa93cb61553a69e3cc` | Access source of record for docs |
| Current RBAC contract | `apps/api/src/modules/auth/rbac-contract.json` (older "revised" CSV, hash `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd` plus amendments 0035, 0047, 0048, 0051) | What exists now |
| Figma board | File `fQee5ydlhJPLFhj8yUx8pA`, page `Branding`, canvas `1344:2` (`foundations-components`) | Sample UI reference only |
| Local module references | `docs/ui-ux-pathways-reference/manage-budget/`, `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/` (excluded by `.git/info/exclude`) | Guidance to fold into DSD |
| DSD, foundations | `docs/dsd-pathways.md`, `docs/ui-ux-pathways-reference/*.md` | Design authority |

## 3. Decisions

| # | Decision |
|---|---|
| E1 | RBAC v4 is adopted in docs now; code (contract, policy, migration) follows in a separate registered change. |
| E2 | The expense chain stays three-stage (M&E verify, Project Manager approve, Program or Grant Manager sign-off); v4 row 44 is read as the verify stage only. |
| E3 | Project Officer loses Add Project Activity, Customize Dashboard, Assess Survey results and SADDD; v4 rows 103 and 104 merge into one permission resolved to the stricter reading. |
| E4 | Encode Project Data (UC-F5-2, `submissions.write`) is retired in docs. |
| E5 | The Figma board is sample UI and reference only. DSD and the Pathways interface foundations win every conflict; Figma never sets color, navigation, role names or copy. |
| E6 | Figma reference lives as a section inside DSD, not a separate file. |
| E7 | The two local module folders stay local and untouched; their still-valid guidance is reconciled into DSD. |
| E8 | The notification inbox shown in Figma is registered as a deferred feature. |
| E9 | Two Change Records, one per part, committed atomically; integration by local merge into `dev`, pushed as `ceezey` only on developer go-ahead. |

## 4. Part 1: `cr-pathways-rbac-v4-adoption`

### 4.1 Cell decisions

Role abbreviations: SA System Administrator, PO Project Officer, ME Monitoring and Evaluation Officer, PM Project Manager, PG Program Manager, GM Grant Manager.

| v4 row | Capability | Role | v4 | Repo now | Decision | Follow-up code effect |
|---|---|---|---|---|---|---|
| 35 | Archive Project | PG, GM | Denied | `projects.archive` | Adopt | Revoke `projects.archive` |
| 40, 42 | View Budget Overview, Monitor Budget Utilization | SA | Denied | `budgets.read` (0035 amendment) | Adopt | Revoke SA `budgets.read` |
| 41 | View Expense Records | ME | Denied | `expenses.read` | Kept deviation: verification requires reading the expense under review | None |
| 44 | Verify Expense | ME, GM, PM, PG | ME and GM granted; PM and PG denied | Chain: ME verify, PM approve, PG/GM sign-off | Kept deviation (E2) | None |
| 46 | View Project Activities | PG, GM | Granted | No `activities.read` | Adopt | Grant `activities.read` |
| 47 | Add Project Activity | PO | Denied | `activities.create` | Adopt | Revoke `activities.create` |
| 60 to 63 | Journey Tracking tab and configuration | SA | Granted | `journeys.manage` kept, `journeys.read` revoked (0047) | Already satisfied: tab and configuration run on `journeys.manage`; individual journey history is denied to SA by v4 rows 81 to 85 too | None |
| 97 | Customize Dashboard | PO | Denied | `dashboards.customize` | Adopt | Revoke |
| 100 | Assess Survey Improvements | PO | Denied | `assessments.read` | Adopt | Revoke |
| 103, 104 | Perform SADDD Analysis, View SADDD Breakdown | PO | Denied, Granted | `analytics.saddd.read` | Adopt stricter reading (E3) | Revoke |
| (none) | Encode Project Data | PO, ME | Row removed | `submissions.write` | Retire (E4) | Revoke and remove UC-F5-2 surface |

Label renames adopted as written in v4: rows 37, 40, 88, 107, 110.

v4 rows with no working capability (53 Activity Escalation, 68 Import Existing File, 97 Customize Dashboard, 122 to 125 Backup and Recovery) are listed in the CR as existing gaps with their current deferred-register entries; this wave does not change their state. Under the v4 note, row 68 means importing collected data, which the existing `/collection/import` flow already covers; the CR records that reading.

### 4.2 Interpretation rules for v4

1. A parent row is an aggregate label: granted means the role holds at least one child capability; it adds no permission of its own (rows 37, 45, 54).
2. Rows with the same label and the same roles collapse into one (rows 88 and 93; 96 and 109); row 95 View Alerts and row 106 View Alert / Triggered Condition share one permission.
3. Record Audit Log (rows 30 and 123) is a system action recorded for every audited mutation, not a grant.
4. Where v4 grants a summary but denies the detail (SA on rows 99 and 101 versus budget rows 37 to 42), the summary is aggregate-only and carries no record-level budget access.
5. Where a child grant needs a read the role lacks (ME verify without expense read), the read is a kept deviation scoped to the verification step.
6. Row 76 spelling is corrected to Beneficiary Management in every doc.

### 4.3 Docs touched

| Doc | Change |
|---|---|
| `docs/cr-pathways-rbac-v4-adoption.md` | New CR holding 4.1 and 4.2, status Accepted (docs); code Pending |
| `docs/prd-pathways.md` | Role columns of affected UCs and FRs; UC-F5-2 marked Retired; any gate citing a revoked grant |
| `docs/rfc-pathways-auth-rbac-isolation.md` | Baseline section names v4 and its hash; current contract hash shown as pending follow-up |
| `docs/qad-pathways.md` | Access rows (QAD-A) updated to v4 expectations, marked pending until the code follow-up lands |
| `docs/sdd-pathways.md` | Only if it lists per-role grants |
| `docs/audit-pathways-manuscript-alignment-20261001.md` | New MA-18 (manuscript RBAC v4 not reflected), resolved by this CR |
| `docs/deferred-features.md` | Row: RBAC v4 grant migration (contract rows and hash, `authorization-policy.ts`, next free migration, web route access) |
| `docs/index.md`, `docs/state.md`, `docs/activity-log.md`, `docs/log-pathways.md` | Registry, change log, operating position |

## 5. Part 2: `cr-pathways-figma-reference-integration`

### 5.1 DSD section 4 addition: Figma reference specimens (non-authoritative)

Placed after "Current component specs (implemented)". Content:

- **Authority line.** The board is sample UI. DSD and the foundations decide tokens, color, layout, navigation, roles and copy; Figma shows anatomy, states and composition only.
- **Specimen table**, one row per family:

| Family | Node | Specimens | DSD rule illustrated |
|---|---|---|---|
| Application structure | `1344:67` | Shell, page header with one primary action, role and scope chips, sidebar item states | Standard desktop layout; One Clear Next Action |
| Actions, navigation and inputs | `1344:179` | Buttons (36, 44, 52), icon buttons, tabs, search and filter chips, form fields with helper, error and read-only states, status badges | Accessible Interaction Sizes; no color-only status |
| Project content and decision support | `1344:342` | KPI cards, project cards, progress and budget card, alert, recommendation | Glance level; Human Control |
| Records and workspace activity | `1344:505` | Activity table, evidence list, audit trail | Scan level; Connected Information |
| Feedback, overlays and system states | `1344:646` | Detail drawer (480 px), confirmation modal, empty, error and loading states, toast and inline notices | Context Over Navigation; Safety by Design |

- **Mapping column** per specimen to the existing `apps/web` component it corresponds to, or "no current component".
- **Usage rule for Claude Code.** Call `get_design_context` or `get_screenshot` on the node for structure and states, then build from existing components and DSD tokens. Never copy Figma hex values, spacing or text over tokens.
- **Not adopted** list: saturated brand-blue sidebar and the gradient sidebar backgrounds (node `1353:49`); the flat six-item navigation (grouped navigation stays); UCD, UCR and "National scope" chips (use the six system role names and organization scope); "Delete" on activities (records are archived); the PM "Budget approvals restricted" chip and "expenses + evaluations" approvals (contradict E2 and the ungranted `evaluations.*` stages); all sample names, places and amounts.
- The board's copies of UI foundations (`1344:913`) and color palette (`1344:1487`) are noted as mirrors of the tracked PNGs; the tracked foundations win on any difference.

### 5.2 Authority order

DSD section 1 "Authority order and conflict rules" gains one rank below the foundations: the Figma board, reference only, never overriding a token or rule.

### 5.3 Local module guidance

Read `pathways-budget-module-agent-context.md` and `pathways-rule-based-alerts-recommendations-agent-context (1).md`. Carry into DSD module pattern notes only what agrees with DSD, the PRD and the system (including E2 and the v4 grants); list conflicts in the CR as not carried. The local files and the exclude entries are not changed.

### 5.4 Docs touched

`docs/cr-pathways-figma-reference-integration.md` (new), `docs/dsd-pathways.md`, `docs/deferred-features.md` (notification inbox row), materialized `DESIGN.md`, `docs/index.md`, `docs/state.md`, `docs/activity-log.md`, `docs/log-pathways.md`.

## 6. Constraints

- No code, migration, agent or contract change in this wave.
- No personal names or sample data from the Figma board or the module folders enter tracked docs.
- No Figma asset URLs in tracked docs; node IDs and the file key only.
- Older CRs and audits are not rewritten; new records supersede them.
- Docs follow CLAUDE.md: kebab file names, no emojis, one-sentence comments, no em-dash per `docs:check`.

## 7. Verification

1. `pnpm docs:check` passes.
2. `pnpm docs:materialize` then `git diff` shows changes only in `DESIGN.md` (from DSD); `AGENTS.md` and `BRAND.md` unchanged.
3. Grep tracked docs for `UCD`, `UCR`, Figma sample names and `figma.com/api/mcp/asset`: no hits.
4. Every v4 row that differs from the repo appears in the 4.1 table or is covered by a 4.2 rule.
5. Two commits on the branch, one per CR, then local merge into `dev`.

## 8. Out of scope

- Implementing the v4 grant migration (registered follow-up).
- Figma Code Connect mappings.
- Restyling the app toward the Figma specimens.
- Deciding the fate of the local module folders beyond the DSD fold-in.
