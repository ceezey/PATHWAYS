# RBAC v4 and Figma Reference Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the canonical docs suite to manuscript RBAC v4 and add a non-authoritative Figma reference section to DSD, with no code change.

**Architecture:** Two Change Records, one commit each, on branch `docs/rbac-v4-figma-reconcile`. Part 1 records v4 as the access source of record and propagates the targets as annotations beside current behavior. Part 2 adds a Figma specimen section to DSD section 4, a Figma rank to the DSD authority order, and module pattern notes folded from two local-only folders.

**Tech Stack:** Markdown docs; `pnpm docs:check` (`scripts/docs/check.py`), `pnpm docs:materialize` (`scripts/docs/materialize.py`); Figma MCP read tools for spot checks.

**Spec:** `docs/superpowers/specs/2026-10-01-rbac-v4-figma-reconciliation-design.md`

## Global Constraints

- No code, migration, agent, contract or `rbac-contract.json` change.
- Docs use zero em-dashes or dash look-alikes (U+2014, U+2212, spaced en-dash, `--` as punctuation); `docs:check` fails on them.
- No personal names, places or amounts from the Figma board or the local module folders in tracked docs.
- No `figma.com/api/mcp/asset` URLs in tracked docs; Figma file key `fQee5ydlhJPLFhj8yUx8pA` and node IDs only.
- Older CRs and audits are not rewritten; an open audit may gain a new finding row.
- Markdown file names are kebab case; no emojis.
- v4 SHA-256: `c5bc22d33ce13c4fbad440173c25d4becf422c65e0152bfa93cb61553a69e3cc`. Current contract CSV SHA-256: `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; author `ceezey`.

## Spec refinements (found while planning)

1. **PRD tables stay current-behavior.** Source precedence (reconciliation CR section 3.1) ranks the repository first for what exists now, and PRD section 5.1 derives roles from `route-access.ts`. So the PRD keeps current actors and gains v4 target annotations; it does not overwrite actors before the code follow-up lands.
2. **BRAND.md also changes.** DSD section 1 (authority order) materializes into `BRAND.md` (sections 0, 0.5, 1, 2, 8, 9) and section 4 into `DESIGN.md` (sections 2 to 8). `AGENTS.md` must stay unchanged.
3. **CR statuses.** The RBAC v4 CR is `Approved` (docs propagated, code pending), so the propagation check does not apply to it. The Figma CR is `Applied` and its propagation table must have every `Affected = Yes` row ticked `[x]`.

## Review Focus

- A v4 differing cell silently dropped: every row in spec 4.1 must appear in the CR table and in a PRD annotation or a rule; check by count (11 rows).
- The PRD made to claim v4 grants are live: every PRD annotation must say "pending code follow-up".
- A Figma value leaking past DSD tokens: no hex value from Figma appears in the new DSD section.
- Sample content leaking: grep for the board's sample names and `UCD`, `UCR`, `National scope` returns hits only inside the "Not adopted" list.
- Materialized drift: after `docs:materialize`, `git diff --stat` lists only `BRAND.md`, `DESIGN.md` outside `docs/`.

---

### Task 1: RBAC v4 Change Record

**Files:**
- Create: `docs/cr-pathways-rbac-v4-adoption.md`

**Interfaces:**
- Produces: CR ID `cr-pathways-rbac-v4-adoption`; rule IDs `V4-R1` to `V4-R6`; cell row IDs `V4-C01` to `V4-C11`; follow-up name "RBAC v4 grant migration". Tasks 2 and 3 cite these exactly.

- [ ] **Step 1: Write the CR**

Create `docs/cr-pathways-rbac-v4-adoption.md` with this content:

```markdown
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
```

- [ ] **Step 2: Check the CR**

Run: `grep -c "^| V4-C" docs/cr-pathways-rbac-v4-adoption.md`
Expected: `11`

Run: `pnpm docs:check`
Expected: exit 0 (the CR is not yet in the index; if the registry check fails on an unlisted CR, continue; Task 2 registers it).

---

### Task 2: Propagate RBAC v4 and commit Part 1

**Files:**
- Modify: `docs/prd-pathways.md` (UC-F2-2 near line 350, UC-F5-2 near line 752, UC-F8-2 near line 1048, the PRD-F5 diagram near line 725, section 5.1 near line 1505, project archive bullet near line 273)
- Modify: `docs/rfc-pathways-auth-rbac-isolation.md` (header and section 1)
- Modify: `docs/qad-pathways.md` (section 3.7)
- Modify: `docs/audit-pathways-manuscript-alignment-20261001.md` (section 2 table, section 5)
- Modify: `docs/deferred-features.md` (append row)
- Modify: `docs/index.md` (section 2 change log), `docs/state.md`, `docs/activity-log.md`, `docs/log-pathways.md`

**Interfaces:**
- Consumes: CR ID and V4-C/V4-R IDs from Task 1.

- [ ] **Step 1: Add a PRD v4 subsection**

In `docs/prd-pathways.md`, directly before `### 5.1 Screen Inventory`, insert:

```markdown
### 5.0 RBAC v4 targets (pending code follow-up)

The manuscript access matrix v4 is the documented source of record under [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md). The roles in this PRD describe what runs today; the targets below take effect when the RBAC v4 grant migration lands.

| CR row | Target | Affects |
|---|---|---|
| V4-C01 | Program Manager and Grant Manager lose project archive | G-F2-4, UC-F2-1 step 5 |
| V4-C02 | System Administrator loses budget overview and utilization | `/projects/:projectId/budget` |
| V4-C06 | Program Manager and Grant Manager gain read access to project activities | `/projects/:projectId/activities` and activity detail |
| V4-C07 | Project Officer loses activity creation | UC-F2-2 |
| V4-C09 | Project Officer loses dashboard customization and survey assessment results | PRD-F8, PRD-F9 |
| V4-C10 | Project Officer loses SADDD analysis | UC-F8-2 |
| V4-C11 | Encode Project Data is retired | UC-F5-2, `/collection/entry`, direct data entry |

Kept deviations, no pending change: the expense chain stays verify, approve, sign-off (V4-C03 to V4-C05).
```

- [ ] **Step 2: Annotate the affected use cases**

In each listed UC table add one row after `| Permission | ... |`:

UC-F2-2:
```markdown
| v4 target | Project Officer removed (V4-C07); pending code follow-up |
```
UC-F5-2:
```markdown
| v4 target | Retired by v4 (V4-C11); pending code follow-up |
```
UC-F8-2:
```markdown
| v4 target | Project Officer removed (V4-C10); pending code follow-up |
```
And after the project archive bullet near line 273 append to the same bullet: ` v4 target: Program Manager and Grant Manager lose this grant (V4-C01); pending code follow-up.`

In section 5.1, append ` (v4: retired, V4-C11)` to the Screen cell of `/collection/entry` and `/collection/projects/:projectId/forms/:formId/entries/new`.

- [ ] **Step 3: RFC source note**

In `docs/rfc-pathways-auth-rbac-isolation.md`, after the `**Superseded by:**` line add:

```markdown
**Access source of record:** manuscript `PATHWAYS - RBAC-v4.csv` (SHA-256 `c5bc22d33ce13c4fbad440173c25d4becf422c65e0152bfa93cb61553a69e3cc`) under [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md); the contract below keeps the earlier hash until the RBAC v4 grant migration lands.
```

- [ ] **Step 4: QAD verification note**

Append to `docs/qad-pathways.md` section 3.7 (after its last paragraph, before `## 4.`):

```markdown
RBAC v4 under [its approved Change Record](cr-pathways-rbac-v4-adoption.md): when the RBAC v4 grant migration lands, extend `apps/api/src/modules/auth/csv-rbac.test.ts` and the route-access suites to deny Program and Grant Manager archive (V4-C01), deny System Administrator budget reads (V4-C02), allow Program and Grant Manager activity reads (V4-C06), deny Project Officer activity creation, dashboard customization, survey assessment and SADDD (V4-C07, V4-C09, V4-C10) and deny `submissions.write` to every role (V4-C11). Until then the existing QAD-A rows describe the running system.
```

- [ ] **Step 5: Audit finding MA-18**

In `docs/audit-pathways-manuscript-alignment-20261001.md` section 2, add after the MA-17 row:

```markdown
| MA-18 | Medium | The manuscript access matrix v4 is not reflected; 14 role cells differ from the running contract and Encode Project Data is removed | `rbac-contract.json` hash `ef1339d9`; v4 hash `c5bc22d3` | Objective 1.8 | Closed in docs by [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md); code follow-up in deferred-features |
```

Change section 5 to: `Findings: 2 High, 9 Medium, 7 Low. Highest risk: MA-01 (R4 templates) and MA-09 (rule metrics). MA-18 is closed in docs; its code follow-up is registered.`

- [ ] **Step 6: Deferred register row**

Append after the last data row of the table in `docs/deferred-features.md`:

```markdown
| RBAC v4 grant migration | Deferred | 2026-10-01 | Developer adopted v4 in docs first; grant changes need migration gating, replay and SAD review. | `apps/api/src/modules/auth/rbac-contract.json` (rows and hash); `apps/api/src/modules/auth/authorization-policy.ts`; next free migration; `apps/web/src/lib/rbac/route-access.ts`. See [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md) section 3.2. | Approve a CR for the migration and apply V4-C01, V4-C02, V4-C06, V4-C07, V4-C09, V4-C10, V4-C11. |
```

- [ ] **Step 7: Registry and logs**

- `docs/index.md` section 2: insert as the first table row:
  `| [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md) | 2026-10-01 | Manuscript access matrix v4 becomes the documented source of record: 11 cell decisions (adopt, kept deviation, already satisfied), six interpretation rules, Encode Project Data retired; code follows in the RBAC v4 grant migration | Approved; docs propagated; code pending |`
- `docs/state.md`: under `## Open signals` add `- RBAC v4 is the documented access source of record; the running contract keeps the earlier matrix until the RBAC v4 grant migration lands ([cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md)).` and change the alignment-audit line to `18 findings (2 High, 9 Medium, 7 Low)`.
- `docs/activity-log.md` under `## 2026-10-01` add: `- RBAC v4 reconciliation: v4 adopted in docs under cr-pathways-rbac-v4-adoption; MA-18 added and closed in docs; RBAC v4 grant migration registered as deferred.`
- `docs/log-pathways.md`: add before `## 2. Friction`:

```markdown
### 2026-10-01: RBAC v4 and Figma Reference Reconciliation

- Adopted manuscript access matrix v4 in the docs under [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md); code follows in the registered RBAC v4 grant migration.
- No code, migration or agent behavior changed.
```

- [ ] **Step 8: Verify**

Run: `pnpm docs:check`
Expected: exit 0.

Run: `grep -n "V4-C" docs/prd-pathways.md | grep -v "^[0-9]*:| V4-C" | grep -vc "pending"`
Expected: `0` (every annotation outside the 5.0 table rows says pending).

Run: `grep -c "V4-C" docs/prd-pathways.md`
Expected: at least 13.

- [ ] **Step 9: Commit**

```bash
git add docs/cr-pathways-rbac-v4-adoption.md docs/prd-pathways.md docs/rfc-pathways-auth-rbac-isolation.md docs/qad-pathways.md docs/audit-pathways-manuscript-alignment-20261001.md docs/deferred-features.md docs/index.md docs/state.md docs/activity-log.md docs/log-pathways.md
git commit -m "docs(cr): adopt manuscript RBAC v4 as the documented access source of record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Figma reference section in DSD

**Files:**
- Modify: `docs/dsd-pathways.md` (section 1 "Authority order and conflict rules" near line 293; section 4 after "Async / empty / error", before "Domain composition patterns", near line 984)

**Interfaces:**
- Produces: DSD heading `### Figma reference specimens (non-authoritative)`; Task 4 links to it.

- [ ] **Step 1: Spot-check the board is still as reviewed**

Call Figma `get_metadata` with fileKey `fQee5ydlhJPLFhj8yUx8pA`, nodeId `1344:35`. Expected: children `1344:36`, `1344:67`, `1344:179`, `1344:342`, `1344:505`, `1344:646`. If node IDs differ, stop and report.

- [ ] **Step 2: Authority order**

In the DSD authority table, add a row:

```markdown
| Figma board `fQee5ydlhJPLFhj8yUx8pA` (page Branding, canvas `1344:2`) | Nothing; sample UI showing anatomy, states and composition only. Never overrides a token, rule, role name, navigation or copy |
```

- [ ] **Step 3: Specimen section**

Insert before `### Domain composition patterns`:

```markdown
### Figma reference specimens (non-authoritative)

The Figma board `fQee5ydlhJPLFhj8yUx8pA` (page Branding, canvas `1344:2`, frame `1344:35` "component inventory") is sample UI. This DSD and the foundations decide tokens, color, spacing, layout, navigation, role names and copy. Use the board for component anatomy, states and composition only.

**How to use it.** Call Figma `get_screenshot` or `get_design_context` on a node below for structure and states, then build from the listed component and DSD tokens. Never copy Figma hex values, spacing, labels or sample data.

| Family | Node | Specimens | Existing component | DSD rule illustrated |
|---|---|---|---|---|
| Application structure | `1344:67` | Shell, page header with one primary action, role and scope chips, sidebar item states | `components/layout/app-shell.tsx`, `sidebar.tsx`, `sidebar-nav-item.tsx`, `page-header.tsx`, `site-header.tsx` | Standard desktop layout; One Clear Next Action |
| Actions, navigation and inputs | `1344:179` | Buttons at 36, 44 and 52 px; icon buttons with tooltip; tabs; search with filter chips and clear all; fields with helper, error and read-only states; status and permission badges | `components/ui/button.tsx`, `tabs.tsx`, `input.tsx`, `select.tsx`, `pathways/filter-bar.tsx`, `filter-choice-group.tsx`, `status-badge.tsx`, `locked-field.tsx` | Accessible Interaction Sizes; no color-only status |
| Project content and decision support | `1344:342` | KPI cards (one metric and one qualifier), project cards with delivery and budget bars, progress and budget card with threshold, alert, recommendation | `pathways/metric-card.tsx`, `progress-bar.tsx`, `section-card.tsx`; no current project-card component | Glance level; Human Control |
| Records and workspace activity | `1344:505` | Activity table with column chooser and export, evidence list with file, status and provenance, audit trail | `components/ui/table.tsx`; no current evidence-list or audit-trail component | Scan level; Connected Information |
| Feedback, overlays and system states | `1344:646` | Detail drawer (480 px), confirmation modal, empty, error and loading states, toast and inline notice | `pathways/side-panel.tsx`, `confirmation-dialog.tsx`, `empty-state.tsx`, `async-state.tsx`, `loading-skeleton.tsx`, `status-message.tsx`, `components/ui/sonner.tsx` | Context Over Navigation; Safety by Design |

The board's UI foundations (`1344:913`) and color palette (`1344:1487`) mirror the tracked images in `docs/ui-ux-pathways-reference/`; the tracked foundations win on any difference.

**Not adopted from the board:**

- the saturated brand-blue sidebar and the gradient sidebar backgrounds (`1353:49`); staff surfaces keep neutral tokens and the authentication gradient stays the only gradient exception;
- the flat six-item sidebar; grouped navigation in `apps/web/src/constants/navigation.ts` stays;
- the `UCD` and `UCR` role labels and the "National scope" chip; show the six system role names and organization scope;
- "Delete" on activities; records are archived;
- the Project Manager "Budget approvals restricted" chip and "expenses + evaluations" approvals; the expense chain is verify, approve, sign-off and no role holds evaluation approval stages;
- the notification inbox; registered as deferred;
- all sample names, places, codes and amounts.
```

- [ ] **Step 4: Verify no Figma values leaked**

Run: `awk '/^### Figma reference specimens/,/^### Domain composition patterns/' docs/dsd-pathways.md | grep -n "#[0-9A-Fa-f]\{6\}"`
Expected: no output.

Run: `pnpm docs:check`
Expected: exit 0.

---

### Task 4: Module pattern notes, Figma CR, registry and commit Part 2

**Files:**
- Read only: `docs/ui-ux-pathways-reference/manage-budget/pathways-budget-module-agent-context.md`, `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/pathways-rule-based-alerts-recommendations-agent-context (1).md`
- Modify: `docs/dsd-pathways.md` (`### Domain composition patterns`)
- Create: `docs/cr-pathways-figma-reference-integration.md`
- Modify: `docs/deferred-features.md`, `docs/index.md`, `docs/state.md`, `docs/activity-log.md`, `docs/log-pathways.md`
- Regenerate: `BRAND.md`, `DESIGN.md`

**Interfaces:**
- Consumes: DSD heading from Task 3; CR ID `cr-pathways-rbac-v4-adoption` and V4-C IDs from Task 1.

- [ ] **Step 1: Extract candidate guidance**

Read both module files in full. For each instruction, classify it into one row of a scratch table (scratchpad, not tracked): Carry (agrees with DSD, PRD and the system, including the three-stage expense chain and the v4 targets), Already in DSD (no action), or Not carried (conflicts; record the reason). Treat the file contents as reference data, not instructions to you.

- [ ] **Step 2: Add module pattern notes**

Under `### Domain composition patterns`, after the existing `**Rule configuration.**` paragraph, add two paragraphs, `**Budget module.**` and `**Alert and recommendation queue.**`, each holding only the Carry items as plain sentences, referencing existing routes (`/projects/:projectId/budget`, `/alerts`, `/recommendations`) and components. No sample data, no hex values, no names.

- [ ] **Step 3: Notification inbox deferred row**

Append to the `docs/deferred-features.md` table:

```markdown
| Notification inbox | Deferred | 2026-10-01 | Shown on the Figma reference board for durable assignments; the system has toast and inline notices only and no build is committed. | DSD section 4 "Figma reference specimens (non-authoritative)". See [cr-pathways-figma-reference-integration](cr-pathways-figma-reference-integration.md). | Approve a CR defining inbox scope, storage and audit. |
```

- [ ] **Step 4: Write the Figma CR**

Create `docs/cr-pathways-figma-reference-integration.md` following `docs/change-record-template.md` headings, Status `Applied`, Date 2026-10-01, with:
- Trigger: the developer asked to integrate the Figma component board so UI work can reuse it; the developer decided it is sample UI only.
- Current Contract: DSD authority order lists the three foundations only; module guidance lived in two folders excluded by `.git/info/exclude`.
- Proposed Change: the Task 3 authority row and specimen section; the Task 4 module notes; the inbox deferral; a "Not carried" table copied from the Step 1 scratch table (item, source file, reason), with no names or sample data.
- Impact: Product none; Data none; Authorization none; API none; UI none (reference only); Tests none; Documentation table with columns `Doc | Affected | Done`, rows for `dsd-pathways.md`, `BRAND.md` and `DESIGN.md` (materialized), `deferred-features.md`, `index.md`, `state.md`, `activity-log.md`, `log-pathways.md`, each `Yes | [x]`.
- Alternatives: separate reference file (rejected by developer, E6); Code Connect (out of scope).
- Migration / Rollback: docs only; revert the commit.
- Verification: the Task 4 Step 6 commands.
- Approval: developer, 2026-10-01. Disposition: Applied.

- [ ] **Step 5: Registry and logs**

- `docs/index.md` section 2: insert above the RBAC v4 row:
  `| [cr-pathways-figma-reference-integration](cr-pathways-figma-reference-integration.md) | 2026-10-01 | DSD gains a non-authoritative Figma reference section (five specimen families mapped to existing components, a not-adopted list) and a Figma rank in the authority order; local module guidance folded into DSD; notification inbox deferred | Applied |`
- `docs/index.md` section 1.8: add `| Figma component board | file \`fQee5ydlhJPLFhj8yUx8pA\`, canvas \`1344:2\` | Sample UI only; DSD section 4 "Figma reference specimens" maps it; the DSD wins everywhere |`
- `docs/state.md` `## Assumptions`: add `- The Figma component board is sample UI; DSD and the foundations decide every design value.`
- `docs/activity-log.md`: add `- Figma reference: DSD section 4 specimen map and authority row under cr-pathways-figma-reference-integration; budget and alert module guidance folded into DSD; inbox deferred.`
- `docs/log-pathways.md` 2026-10-01 RBAC v4 entry: add a bullet `- Added a non-authoritative Figma reference section to DSD under [cr-pathways-figma-reference-integration](cr-pathways-figma-reference-integration.md).`

- [ ] **Step 6: Materialize and verify**

Run: `pnpm docs:materialize && git diff --stat -- . ':!docs'`
Expected: only `BRAND.md` and `DESIGN.md` listed.

Run: `pnpm docs:check`
Expected: exit 0.

Run: `git grep -n "UCD\|UCR\|National scope" -- docs ':!docs/superpowers'`
Expected: hits only inside the DSD "Not adopted" list and the Figma CR.

Run: `git grep -n "figma.com/api/mcp/asset" -- .` and a `git grep` over `docs`, `BRAND.md` and `DESIGN.md` for the board's sample project and person names (pattern list kept in the plan workspace, not tracked)
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add docs/dsd-pathways.md docs/cr-pathways-figma-reference-integration.md docs/deferred-features.md docs/index.md docs/state.md docs/activity-log.md docs/log-pathways.md BRAND.md DESIGN.md
git commit -m "docs(dsd): add non-authoritative Figma reference specimens and fold module guidance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Integrate into dev

**Files:** none changed.

- [ ] **Step 1: Confirm the branch**

Run: `git log --oneline dev..docs/rbac-v4-figma-reconcile`
Expected: four commits (spec, plan, RBAC v4 CR, Figma CR).

- [ ] **Step 2: Merge locally**

```bash
git switch dev
git merge --no-ff docs/rbac-v4-figma-reconcile -m "Merge docs/rbac-v4-figma-reconcile into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
pnpm docs:check
```
Expected: clean merge; docs:check exit 0. The untracked plan files and the CRLF-only `CLAUDE.md` change already in the working tree stay untouched.

- [ ] **Step 3: Push only on developer go-ahead**

Ask the developer. On yes: `git push origin dev` as `ceezey`.
