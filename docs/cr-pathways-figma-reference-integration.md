# Change Record: Figma reference integration

**ID:** `cr-pathways-figma-reference-integration`  
**Date:** 2026-10-01  
**Status:** Applied

## 1. Trigger

The developer asked to integrate the PATHWAYS Figma component board into the docs so UI work can reuse its patterns, and decided the board is sample UI and reference only. The same wave folds the still-valid guidance of two local-only module references into DSD (design spec `docs/superpowers/specs/2026-10-01-rbac-v4-figma-reconciliation-design.md`, decisions E5 to E8).

## 2. Current Contract

The DSD authority order listed the brand, color and UI foundations only. Budget and alert-queue guidance lived in `docs/ui-ux-pathways-reference/manage-budget/` and `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/`, which `.git/info/exclude` keeps out of the repository, so other checkouts and agents never saw it.

## 3. Proposed Change

### 3.1 DSD

- Authority order: a row for the Figma board `fQee5ydlhJPLFhj8yUx8pA` (page Branding, canvas `1344:2`) that is authoritative for nothing and never overrides a token, rule, role name, navigation or copy.
- Section 4 "Figma reference specimens (non-authoritative)": five specimen families with node IDs, mapped to existing `apps/web` components and to the DSD rule each illustrates, a usage rule for Claude Code and a not-adopted list.
- Section 4 "Domain composition patterns": "Budget module" and "Alert and recommendation queue" notes carrying the module guidance that agrees with DSD, the PRD and the system.

### 3.2 Deferred

The notification inbox shown on the board is registered in `deferred-features.md`.

### 3.3 Module guidance not carried

| Item | Source | Reason |
|---|---|---|
| Do not assume the M&E Officer verifies or a manager approves expenses | Budget module context | Superseded: the system's chain is established (M&E verify, PM approve, PG or GM sign-off) and kept by [cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md) V4-C03 to V4-C05 |
| Role vocabulary (MERL Officer, Superuser/Admin) | Budget module context | Not system role names; the six system roles apply |
| Budget revision and reallocation history model | Budget module context | Data-model guidance, not a design rule; the system already keeps prior budget records by archive and replace (`finance.service.ts`), and no reallocation workflow or revision approval exists |
| Agent question lists and mental-model diagrams | Both | Process guidance for agents, already covered by DSD "Agent implementation rules" |
| Recommendation rules configured independently of alerts | Alerts context | The system attaches 1 to 10 predefined recommendations to a rule and never generates them at runtime (G-F11-4) |
| Rule lifecycle Draft, Test, Active, Inactive | Alerts context | The system uses Draft, Active and Archived; testing is an action that creates no live output, which is carried |
| Coverage options (all, selected projects, specific records) | Alerts context | The system scopes a rule to a project or an organization template |
| Recommendation states For Review, Reviewed, Accepted, Rejected | Alerts context | The system records decision outcomes through its existing contract; only "accepting executes nothing" is carried |
| Category, eligibility or evaluation timing, and recommendation type as rule-form fields | Alerts context | No such field in the strict rule contract (`rules-human-contract.ts`); predefined recommendations carry only an id, title and text |
| Alert states limited to New, Reviewed, Resolved, Dismissed | Alerts context | The system also has Actioned and Auto-resolved (`alert-lifecycle.ts`); DSD lists all six |
| Sample projects, records, codes and amounts | Both | Sample data never enters tracked docs |

## 4. Impact

### Product
None. Reference material only.

### Data / Migration
None.

### Authorization / Privacy
None. The not-adopted list keeps the board's sample role labels and data out of the docs.

### API
None.

### UI
None. The board is a reference; no screen changes.

### Tests
None.

### Documentation

| Doc | Affected | Done |
|---|---|---|
| `dsd-pathways.md` | Yes | [x] |
| `BRAND.md` (materialized, section 1) | Yes | [x] |
| `DESIGN.md` (materialized, section 4) | Yes | [x] |
| `deferred-features.md` | Yes | [x] |
| `index.md` | Yes | [x] |
| `state.md` | Yes | [x] |
| `activity-log.md` | Yes | [x] |
| `log-pathways.md` | Yes | [x] |

## 5. Alternatives Considered

- A separate Figma reference file under `docs/ui-ux-pathways-reference/`: rejected by the developer in favor of a DSD section.
- Figma Code Connect mappings: out of scope for this wave.
- Tracking the two module folders as-is: rejected; they keep stale role assumptions and sample data.

## 6. Migration / Rollback

Docs only. Rollback is a revert of the commit that applied this record.

## 7. Verification

`pnpm docs:check` passes on a clean export; `pnpm docs:materialize` changes only `BRAND.md` and `DESIGN.md` outside `docs/`; the DSD Figma section has no hex values; `UCD`, `UCR` and "National scope" appear only in the not-adopted list and this record; no board sample names or Figma asset URLs appear in tracked docs.

## 8. Approval

Approved by the developer on 2026-10-01.

## 9. Disposition

Applied on branch `docs/rbac-v4-figma-reconcile`.
