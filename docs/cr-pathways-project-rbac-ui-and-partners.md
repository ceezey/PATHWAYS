# Change Record: Project RBAC UI Alignment and Structured Partners

**ID:** `cr-pathways-project-rbac-ui-and-partners`

**Date:** 2026-09-28

**Status:** Approved; implementation pending

## 1. Trigger

Audit findings F and G (2026-09-28, `dev` at `002d3ac`) for PRD-F1/F2.

**Finding F: the UI shows actions that the API rejects.**

- **Combined create/edit flag.** The legacy code `activities.create_edit` maps to `activities.create` or `activities.update` (`apps/web/src/lib/rbac/access-matrix.ts:59`, `route-access.ts:508`). A role profile receives a legacy code when it holds any of its atomic permissions (`access-matrix.ts:108-110`).
  - A Project Officer holds `activities.create` but not `activities.update` (`authorization-policy.ts:187-189`).
  - `project-activities-workspace.tsx:242` therefore shows Edit to a PO, and `activities.service.ts:903` returns 403.
- **Project Officer create is broken.**
  - The dialog builds its officer list from `GET /users` (`activity-form-dialog.tsx:132-141`), which requires `users.authorize` (`users.controller.ts:28-29`). The workspace loads users only for holders of that permission (`project-activities-workspace.tsx:245,298`).
  - A PO has no officer list, yet the API requires assignees who are active Project Officers assigned to the project (`activities.service.ts:365-397`).
  - Any budget value requires `budgets.create` (`activities.service.ts:499-512`), which a PO lacks.
- **Record progress and Submit proof.** These controls are shown by role permission and project scope (`project-activities-workspace.tsx:246-250`). The API also requires an active personal activity assignment (`activities.service.ts:1122-1133` progress, `:1217-1228` proof). A PM or M&E Officer who is not personally assigned sees controls that return 403.
- **Create Indicator.** `project-indicators-workspace.tsx:460-461` reads `profile.permissions` directly instead of `principalHasAtomicPermission`, bypassing the role ceiling.
- **Workspace tabs.** Tab permissions (`project-workspace-header.tsx:17-36`) differ from route permissions (`route-access.ts:43-60`):
  - Indicators: tab `indicators.manage`, route `indicators.read`;
  - Evidence: tab `evidence.review`, route `evidence.read`;
  - Journey stages: tab `activities.create_edit` or `monitor_evaluate.full`, route `journeys.manage`.

**Finding G: duplicate partner fields.** The project form has two inputs:

- a structured "Implementing partner organizations" list that feeds `implementingPartnerNames[]` (`project-setup-form.tsx:355-371`, `project_implementing_partners` from migration 0030);
- a legacy free-text "Implementing partners" input that feeds `projects.implementing_partners` (`project-setup-form.tsx:372-384`, `schema.prisma:672`).

The detail view hides the free text when any structured partner exists (`project-detail-view.tsx:221-223`).

The developer decided on 2026-09-28:

- no permission-matrix change;
- hide Add and Edit controls that the API would reject;
- lock fields the user cannot change, with the tooltip "You are not authorized to change this field";
- keep the structured partner field, relabel it "Implementing partners", remove the free-text input, migrate existing text into partner records, and keep the column marked deprecated.

## 2. Current Contract

- **[Auth RFC](rfc-pathways-auth-rbac-isolation.md) (Locked).**
  - Server authority is final.
  - Frontend profiles and routes consume the API role ceiling (section 1).
  - Every project permission requires the scope boundary (section 3).
  - Supporting reads must not expand profile data access (section 4).
  - The `users.authorize` grant is limited to Admin, PM and Program Manager (section 3).
- **PRD-F1.** Permission grants do not establish feature availability. Direct API bypass is denied.
- **DSD.** Approved UI/UX is preserved unless a redesign is authorized.
- **Migration 0030.**
  - Partner names are 1-120 characters with `normalized_name = lower(btrim(name))`, unique per organization.
  - `p10_replace_project_partners` accepts at most 20 names and requires `projects.update` or same-transaction creation, with runtime user context.
  - Legacy `projects.implementing_partners` bytes are retained.
- **Migration 0031.** `canonical_source_request` bounds `implementingPartnerNames` to 20 names of 1-120 characters (`0031_f10_f11_rules_runtime/migration.sql:1596-1604`).

## 3. Proposed Change

No change to `rbac-contract.json`, `authorization-policy.ts`, database grants or role ceilings.

### 3.1 Split create and update checks

- Retire `activities.create_edit`. New activity buttons check `activities.create`, and Edit checks `activities.update`, through `principalHasAtomicPermission` with the role ceiling and project scope. This covers `access-matrix.ts`, `route-access.ts`, `permissions.ts`, `project-workspace-header.tsx` and `project-activities-workspace.tsx`.
- Workspace tab permissions equal the route permissions they open:
  - Indicators: `indicators.read`;
  - Evidence: `evidence.read`;
  - Journey stages: `journeys.manage`.
- Create Indicator uses `principalHasAtomicPermission(profile, 'indicators.create')`.

### 3.2 Server-computed capability flags

- Activity list and detail responses add `capabilities: { canEdit, canRecordProgress, canSubmitProof }` for the calling user. The flags are computed in the same scoped query, without a query per activity:
  - `canEdit`: `activities.update` in project scope and an editable activity state;
  - `canRecordProgress`: `activities.progress.update` and an active personal activity assignment;
  - `canSubmitProof`: `activities.proof.submit` and an active personal activity assignment.
- The web client shows or hides row actions from these flags.
- The flags are advisory. Every mutation re-checks authority exactly as today, and a forged or stale flag changes nothing. The existing API 403 tests stay.

### 3.3 Assignable Project Officer read (authority addition)

This is a new supporting read under the Locked auth RFC and needs explicit approval.

- **Route:** `GET projects/:projectId/activities/assignable-officers`. The final path is fixed at pre-implementation review.
- **Who may call:** a user whose verified identity, account, organization and role pass the protected request path, and who holds `activities.create` or `activities.update` (atomic, under the role ceiling) with project scope for that permission. Today that is an assigned PO or an assigned PM. Admin, M&E, Program and Grant Manager are denied, because none holds either permission.
- **Who is returned:** exactly the users that `resolveAssignments` (`activities.service.ts:365-397`) would accept as assignees:
  - active `PROJECT_OFFICER` role;
  - active, unarchived account;
  - active, unended assignment to this project in the caller's organization.
- **Fields:** `userId` and `displayName` only. No email, contact number, auth identifiers, role list, account status, other projects or assignment dates.
- **Bounds:** at most 50 rows (the assignee bound), ordered by display name then ID. Scope is applied in the query before retrieval. An inaccessible project returns the uniform 404.
- The activity dialog uses this read instead of `GET /users`. `GET /users` keeps requiring `users.authorize`.

### 3.4 Locked fields

- A shared `LockedField` component renders a disabled control with its visible label and current value, and the tooltip "You are not authorized to change this field".
- The tooltip opens on hover and on keyboard focus of a focusable wrapper, and is linked through `aria-describedby`.
- Applied to:
  - the activity budget, when the caller lacks `budgets.create`, or lacks `budgets.update` on edit;
  - activity indicator links, when the caller lacks `indicators.update`;
  - project profile fields, when the caller lacks `projects.update`.
- A request never sends a locked field's value.
- `LockedField` shows only values the caller may read. A value the caller cannot read stays omitted, not shown locked.

### 3.5 Structured partners

- Remove the free-text input (`project-setup-form.tsx:372-384`) and the team editor's copy of it. Relabel the structured field "Implementing partners".
- The detail view shows structured partners only.
- The API stops writing `projects.implementing_partners`. A request carrying `implementingPartners` is rejected with 400 after the web change ships in the same release.
- **Migration `0039_project_partner_backfill`**, idempotent:
  1. For each non-archived project with non-blank legacy text, split on newline, `;` and `,`, then `btrim` each piece.
  2. Keep names of 1-120 characters. Longer or empty pieces are not truncated: they are skipped and reported.
  3. De-duplicate by `lower(btrim(name))` within the organization, matching the 0030 `normalized_name` rule.
  4. Insert partners with `ON CONFLICT (organization_id, normalized_name) DO NOTHING` and add missing project links. Existing structured links are never removed.
  5. A project that would exceed 20 linked partners is skipped entirely and reported.
  6. Write one `PROJECT_PARTNERS_BACKFILLED` audit row per changed project, with a null actor, the source marker `MIGRATION_0039`, and the previous and new partner IDs.
  7. `p10_replace_project_partners` needs runtime user context, so the migration reproduces its insert and link logic directly instead of calling it.
  8. The legacy column is kept, not cleared, and gets `COMMENT ... IS 'Deprecated by migration 0039; read-only legacy text.'`
  9. A second run changes nothing.
- **Dry run before hosted application.** A read-only query, run in a read-only transaction, lists per project: proposed names, skipped pieces with reasons, over-limit projects and existing links. The developer reviews it before 0039 is applied to any hosted database. Output stays outside the repository.

## 4. Impact

### Product
Each role sees only the actions the API allows. Project Officers can create activities. Projects have one partner field.

### Data / Migration
- 0039 adds partner and link rows and audit rows, and one column comment. No schema change.
- Splitting on commas can split a single organization name that contains a comma. The dry-run review exists to catch this.

### Authorization / Privacy
- The permission matrix is unchanged.
- The assignable-officer read is a narrow authority addition: PO and PM callers see names of fellow assigned Project Officers on the same project, which they could not list before.
- Capability flags reveal only the caller's own permission and assignment facts about activities the caller can already read.

### API
Adds the assignable-officer read and capability flags. Rejects `implementingPartners` on writes.

### UI
- Split buttons, aligned tabs and `LockedField`.
- The partner relabel is a copy change within the approved design.

### Tests
- **All six roles:** each role's visible actions equal its API outcomes.
- **Forged flags:** direct API calls for hidden actions still return 403.
- **Assignable officers:** admission for PO and PM, denial for the other four roles, unassigned-project denial, cross-organization denial, exact projection (no extra fields), the 50-row bound, and archived or ended users excluded.
- **Partners:** 0039 SQL cases (split, de-duplicate, over-120, over-20, existing links preserved, second run idempotent, audit row).
- **`LockedField`:** tooltip keyboard and screen-reader behaviour.

### Documentation
- Auth RFC section 4: add the assignable-officer supporting read.
- DSD: `LockedField` pattern and copy.
- SDD project section: legacy column deprecated.
- QAD rows and index.

## 5. Alternatives Considered

- **Restraint: client-only fixes.** Split the flags and hide buttons from role permissions alone. This is simpler, but the client cannot know personal activity assignments, so PM and M&E would still see controls that fail.
- **Grant `users.authorize` or a user-list permission to PO.** Rejected. It changes the permission matrix and exposes more profile data.
- **Accept any assignee and resolve on the server.** Rejected. It hides who can be assigned and moves errors to submit time.
- **Leave the legacy column and hide it.** Existing text would disappear from view without being migrated. Rejected by developer decision.
- **Drop the legacy column.** Destructive and removes the rollback source. It needs separate authorization.

## 6. Migration / Rollback

- 0039 is forward-only with the 0030-style migration identity and ledger precondition. Numbers follow merge order.
- Rollback reverts the web and API code. Backfilled partner links stay as valid structured data. Removing them would be a destructive change that needs separate authorization. The legacy text is still in its column.
- Hosted application requires the dry-run review, then separate developer authorization.

## 7. Verification

- Section 4 tests, SQL runtime suites against a reset local database, `pnpm -r typecheck`, `pnpm test`, `pnpm docs:check` and `pnpm sad:check`.
- Digest-bound `pnpm sad:signoff` with reviews from organization-isolation-checker, migration-integrity-guardian, beneficiary-privacy-guardian and design-qa-agent.
- In the local app, each role sees only allowed buttons, and locked fields show the tooltip.
- **Dependencies.**
  - The approved `cr-pathways-performance-scaling` (branch `feature/perf-optimizations`, merged in Wave A) and its lean activity list projection must carry the capability flags. This record's branch follows that work.
  - [Activity progress media](cr-pathways-activity-progress-media.md) consumes `canSubmitProof`.

## 8. Approval

Developer reply on 2026-09-28: "Approve all CRs, Evidence: change constraint, Signed links: no".

## 9. Disposition

Not applied.
