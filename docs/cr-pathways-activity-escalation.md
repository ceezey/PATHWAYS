# Change Record: Activity Escalation

**ID:** `cr-pathways-activity-escalation`  
**Date:** 2026-10-19  
**Status:** Approved (2026-10-19; implementation pending)

## 1. Trigger

Developer request 2026-10-19: implement the tiered Activity Escalation Process now and document the desired flow for later hosted testing. RBAC v4 row 53 grants `activities.escalations.read` and `activities.escalations.raise` to all six roles, but no handler or UI uses them (deferred register, "Activity escalation", Gap). This change closes that gap.

## 2. Current Contract

The two permission codes exist in the role-permission matrix (312 rows) and nothing reads them. A blocked or at-risk activity can only be raised verbally or through an alert; there is no recorded reason, owner, hand-off or decision. The activity extension request (`cr-pathways-activity-extension-request`, migration 0061) is the model for a reviewed, audited, role-staged request on an activity.

## 3. Proposed Change

Binding contract for migration `0070_activity_escalations`, module `apps/api/src/modules/activity-escalations`, and the web UI. Implementers must not deviate.

### 3.1 Flow

1. Raise: any role holding `activities.escalations.raise` within project scope (all six roles, RBAC v4 row 53) raises an escalation on an activity with a reason. Status OPEN.
2. Project tier: a Project Manager either FORWARDS it to the program level with a note (status FORWARDED; the raiser may forward) or RESOLVES it with a note (resolution level PROJECT; the raiser may not).
3. Program tier: a Program Manager who is neither the raiser nor the forwarder RESOLVES a FORWARDED escalation with a decision note (resolution level PROGRAM).
4. The Grant Manager and System Administrator can raise but have no forward or resolve action. Every holder of `activities.escalations.read` in scope sees status.

Escalation never changes the activity's status, dates, assignments or lifecycle and never calls a rule source operation. It records a reason and decisions only.

### 3.2 States

| Status | Meaning | Allowed next |
|---|---|---|
| `OPEN` | Raised, waiting for the Project Manager | `FORWARDED`, `RESOLVED` (level PROJECT) |
| `FORWARDED` | Handed to the program level, waiting for the Program Manager | `RESOLVED` (level PROGRAM) |
| `RESOLVED` | Closed; `resolution_level` (`PROJECT` or `PROGRAM`) with `resolved_by_id` records who and at which tier | none |

One open escalation (OPEN or FORWARDED) per activity. A RESOLVED escalation allows a new one. Reason and every note are 10-2000 trimmed characters.

### 3.3 Table `pathways.activity_escalations`

Prisma-owned, composite FKs, RLS enabled and forced, no DELETE, content immutable. Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | uuid NOT NULL | FK organizations |
| `project_id` | uuid NOT NULL | FK (organization_id, project_id) projects |
| `activity_id` | uuid NOT NULL | FK (organization_id, project_id, activity_id) project_activities |
| `reason` | text NOT NULL | 10-2000 trimmed |
| `status` | text NOT NULL DEFAULT `'OPEN'` | `OPEN`, `FORWARDED`, `RESOLVED` |
| `raised_by_id` | uuid NOT NULL | FK (organization_id, id) system_users |
| `raised_at` | timestamptz(3) NOT NULL DEFAULT now | |
| `forwarded_by_id`, `forwarded_at`, `forward_note` | uuid, timestamptz(3), text, all NULL | forward_note 10-2000 trimmed; forwarded_by_id FK system_users |
| `resolved_by_id`, `resolved_at`, `resolution_note` | uuid, timestamptz(3), text, all NULL | resolution_note 10-2000 trimmed; resolved_by_id FK system_users |
| `resolution_level` | text NULL | `PROJECT` or `PROGRAM` |
| `client_mutation_id` | uuid NOT NULL | UNIQUE (organization_id, client_mutation_id) |
| `updated_at` | timestamptz(3) NOT NULL DEFAULT now | optimistic concurrency token |

Constraints (7 CHECKs, 6 FKs):

- `activity_escalations_status_check`, `_reason_check`, `_forward_note_check`, `_resolution_note_check`, `_level_check`. There is no forwarder check: the raiser may forward.
- `_resolver_check`: `resolved_by_id IS NULL OR (resolved_by_id <> raised_by_id AND resolved_by_id IS DISTINCT FROM forwarded_by_id)`.
- `_state_check`: OPEN has no forward or resolution fields; FORWARDED has `forwarded_by_id`, `forwarded_at`, `forward_note` and no resolution fields; RESOLVED has `resolved_by_id`, `resolved_at`, `resolution_note`, `resolution_level`, and level PROJECT requires no forward fields while level PROGRAM requires all three forward fields.
- `UNIQUE (organization_id, project_id, activity_id, id)` scope key; partial unique `activity_escalations_open_key` on (organization_id, project_id, activity_id) WHERE status IN ('OPEN','FORWARDED').
- Indexes: (organization_id, project_id, status, raised_at) and (organization_id, raised_by_id).

BEFORE UPDATE trigger `activity_escalations_transition` (SECURITY INVOKER, `search_path=''`, owner prisma, REVOKE from PUBLIC) allows only OPEN to FORWARDED, OPEN to RESOLVED (level PROJECT) and FORWARDED to RESOLVED (level PROGRAM, forward fields unchanged); anything else raises 23514 with constraint `activity_escalations_transition_check`.

### 3.4 RLS and grants

All policies `TO pathways_runtime`, organization from `app.organization_id`, scope through `pathways.p05_has_project_permission(code, project_id)` (project assignment, or Program Manager through the managed program, or System Administrator):

- SELECT `p05_activity_escalations_select`: `activities.escalations.read`.
- INSERT `p05_activity_escalations_insert`: `activities.escalations.raise`, `raised_by_id = app.user_id`, `status = 'OPEN'`.
- UPDATE `p05_activity_escalations_update`: USING `status IN ('OPEN','FORWARDED')` and `activities.escalations.read`. WITH CHECK: a FORWARDED row needs `forwarded_by_id = app.user_id` and `activities.update`; a RESOLVED row at level PROJECT needs `resolved_by_id = app.user_id` and `activities.update`; a RESOLVED row at level PROGRAM needs `resolved_by_id = app.user_id` and the acting profile to be a Program Manager, checked as `EXISTS (SELECT 1 FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id WHERE u.id = app.user_id AND u.organization_id = app.organization_id AND r.code = 'PROGRAM_MANAGER')`.

Grants: REVOKE ALL from PUBLIC, anon, authenticated, service_role; `GRANT SELECT, INSERT` to `pathways_runtime`; column `GRANT UPDATE (status, forwarded_by_id, forwarded_at, forward_note, resolved_by_id, resolved_at, resolution_note, resolution_level, updated_at)`. No DELETE; `reason` and other content columns cannot be updated. Only prisma-owned helpers are referenced, so no DBA preprovision is needed. Postconditions mirror 0061 (owner, 7 CHECKs, 6 FKs, forced RLS, 3 policies, grants, trigger enabled).

Role enforcement in the database. No existing helper returns the acting role, but `pathways_runtime` already has SELECT on `pathways.system_users` and `pathways.roles` (policies `p4_runtime_select`, organization-scoped), so the EXISTS above needs no new privileged object, owner or grant. With it the database enforces that program-level resolve is done only by a Program Manager, and that forward and project-level resolve need `activities.update`. A Program Manager is in scope through the managed program (`programs.manager_user_id`) or a direct active project assignment; both are valid.

Residual: `activities.update` is held by the Project Manager and the System Administrator, so the database alone cannot stop a System Administrator session from forwarding or resolving at project level. The API role check (`soleRole PROJECT_MANAGER`) is the enforcing layer for that case, as 0061 was for its M&E step; the runtime role is held only by the API. Scope, organization, separation of duties, state order and immutability are enforced by the database in every case.

### 3.5 Permissions (no new codes; matrix stays 312 rows)

| Action | Role (sole role) | Permission | Extra rule |
|---|---|---|---|
| List | any role | `activities.escalations.read` | project scope |
| Raise | any of the six roles (no role filter beyond the permission) | `activities.escalations.raise` | project scope; the Project Officer also needs an ACTIVE activity assignment (`requireActiveAssignment`, as the extension request does); a COMPLETED or CANCELLED activity is refused with 409 `A finished activity cannot be escalated.` |
| Forward | PROJECT_MANAGER | `activities.update` | the raiser may forward |
| Resolve (project) | PROJECT_MANAGER | `activities.update` | actor is not the raiser |
| Resolve (program) | PROGRAM_MANAGER | `activities.escalations.read` | actor is neither raiser nor forwarder; status FORWARDED |
| Grant Manager, System Administrator | no forward or resolve (403) | | Grant Manager is otherwise read-only; the System Administrator observes |

A Project Manager who raised an escalation may forward it but cannot resolve it at project level; the program-level resolver must be neither the raiser nor the forwarder.

### 3.6 Privacy for aggregate-only roles

`aggregateOnlyRoles` (PROGRAM_MANAGER, GRANT_MANAGER) never see beneficiary data. The escalation row, list, queue and audit changes carry only project, activity code and title, status, reason, notes, staff display names (id plus full name, as the extension mapper does) and timestamps. They carry no beneficiary field, no evidence and no submission.

Existing RLS already lets these roles read the activity row: both hold `activities.read`; the Program Manager is in scope through the managed program (`p05_has_project_permission` and `projectScope`), the Grant Manager through explicit active project assignment. Therefore no SECURITY DEFINER function is needed. This is the least-privilege option: a direct policy-guarded SELECT on one new table with an explicit column selection, no elevated owner and no new execute grant, versus a 0062-style definer list function that would add a privileged owner, a preprovision step and a second code path for no extra protection. The service must select only `id, projectId, title, code, status, updatedAt` of the activity for these roles and must never include beneficiary relations.

Because reason and notes are free text, the raise and decision forms must show the hint "Do not include beneficiary names or contact details", and the manual test below checks it. The server cannot detect identities in free text; this residual risk is accepted and recorded.

### 3.7 API (module `activity-escalations`, controller/service/mapper/helpers split like `activity-extensions`)

Base `projects/:projectId/activities/:activityId/escalations`; every response `Cache-Control: private, no-store`; bodies are strict Zod schemas in `packages/shared/src/contracts/activities/activity-escalations.ts`; transitions use `expectedUpdatedAt` and `updateMany` on (id, org, expected status, updatedAt); a stale or already moved row returns 409 `This escalation changed; reload before deciding.`

| Method and path | Permission | Body | Result |
|---|---|---|---|
| `GET /` | `activities.escalations.read` | none | latest 20 `ActivityEscalation`, newest first |
| `POST /` | `activities.escalations.raise` | `{ clientMutationId: uuid, reason: 10-2000 }` | 201 `ActivityEscalation`; a replayed `clientMutationId` returns the same row when activity, raiser and trimmed reason match, otherwise 409 |
| `POST /:escalationId/forward` | `activities.update` | `{ note: 10-2000, expectedUpdatedAt }` | OPEN to FORWARDED |
| `POST /:escalationId/resolve` | `activities.update` | `{ note: 10-2000, expectedUpdatedAt }` | OPEN to RESOLVED, level PROJECT |
| `POST /:escalationId/program-resolve` | `activities.escalations.read` | `{ note: 10-2000, expectedUpdatedAt }` | FORWARDED to RESOLVED, level PROGRAM |

`ActivityEscalation` = `{ id, projectId, activityId, reason, status, raisedBy: {id,name}, raisedAt, forwardedBy: {id,name}|null, forwardedAt|null, forwardNote|null, resolvedBy: {id,name}|null, resolvedAt|null, resolutionNote|null, resolutionLevel: 'PROJECT'|'PROGRAM'|null, updatedAt }` (ISO strings).

Refusals: unknown or out-of-scope activity or escalation 404; wrong role, raiser resolving at project level, raiser or forwarder resolving at program level, or unassigned Project Officer 403; wrong status, open duplicate, stale `expectedUpdatedAt` 409; reason or note outside 10-2000 trimmed 400. Database refusals map as in the extension `writeError` (42501 to 403, 23505/40001/P2002 to 409, 22023/23514 to 400); the service checks separation of duties and status first so users get the documented 403 or 409, and the database is the backstop. Audit rows (`writeAuditLog`, entity `ActivityEscalation`): `ACTIVITY_ESCALATION_RAISED`, `_FORWARDED`, `_RESOLVED`, with `changes: { activityId, level? }` and never the free text.

### 3.8 Dashboards and web

- Role overview (`GET /dashboards/role-overview`) gains additive `escalationQueue: { count, rows } | null`, built like `extensionQueue`, rows `{ id, activityId, projectId, projectTitle, activityCode, activityTitle, status, reason, raisedByName, raisedAt, stage }`, `take` same as other queues, oldest first:
  - Project Manager: all OPEN rows in scope; `stage: 'RESOLVE'` when the actor is not the raiser, `stage: 'FORWARD'` (forward only, no Resolve action) when the actor raised it.
  - Program Manager: `stage: 'PROGRAM'`, status FORWARDED, actor is neither raiser nor forwarder.
  - Grant Manager: `stage: 'WATCH'`, status OPEN or FORWARDED, read-only rows with no action buttons.
  - Other roles: `null`; their escalations show on the activity panel.
- Activity detail sheet: a Raise escalation dialog (reason, privacy hint) for every role holding `activities.escalations.raise` (a Project Officer only when assigned), and an escalation panel listing the latest escalations with status, notes and level; Forward and Resolve for the Project Manager, Resolve for the Program Manager, status only for the rest. Deep link `?action=escalation`.
- `manager-overview.tsx` renders the Project Manager rows with an action link to the activity. `portfolio-overview.tsx` (used by `role-overview.tsx` for the Program and Grant Manager) renders the Program Manager rows with an action link and the Grant Manager rows without actions.

## 4. Impact

### Product
Anyone on an activity can flag a blocker with a reason; the Project Manager handles it or hands it up; the Program Manager closes forwarded ones; a decision trail exists.

### Data / Migration
Migration `0070_activity_escalations`: one table, three policies, one trigger, column grants. Requires verified 0069 and prisma identity (0061 guard style). Only prisma-owned helpers are referenced, so no DBA preprovision is needed. Task 6 also adds the `schema.prisma` model (with the drift check), registers 0070 wherever 0069 is referenced (`scripts/db/hosted/plan.mjs` and `plan.test.mjs`, `infra/supabase/replay/Verify-Forward.ps1`, `apps/api/prisma/legacy-retirement.test.ts`) and updates the comment at `Replay-Local.ps1:616`. Pathways table count 61 (`Replay-Local.ps1` `PATHWAYS_EXPECTED_TABLE_COUNT` is 60 today and no migration 0062-0069 creates a table; Task 6 raises it to 61); ledger 45 rows through 0070 (44 migration directories 0000-0069 today).

### Authorization / Privacy
See 3.4, 3.5 and 3.6. No new permission codes, no widened grants, no beneficiary data in any escalation surface.

### API
Section 3.7; shared contracts exported from `@pathways/shared`.

### UI
Section 3.8; style follows the extension dialog and panel in `apps/web/src/features/projects/activities/components/`, with a web client `apps/web/src/lib/api/activity-escalations.ts` beside `activity-extensions.ts`.

### Tests
- `apps/api/prisma/tests/activity-escalations-runtime.sql` (separation of duties, state order, immutability, one open per activity, no DELETE, scope; role assertions: a session whose profile is not a Program Manager cannot write a RESOLVED level PROGRAM row, a Program Manager who is neither raiser nor forwarder can, a profile without `activities.update` cannot forward or resolve at project level, and a System Administrator passing `activities.update` is recorded as the API-enforced residual).
- `apps/api/src/modules/activity-escalations/*.test.ts` (service, controller, validation, local replay).
- `packages/shared/src/contracts/activities/activity-escalations.test.ts`.
- `apps/web/src/features/projects/activities/components/activity-escalation-dialog.test.tsx` and `activity-escalation-panel.test.tsx`, `apps/web/src/lib/api/activity-escalations.test.ts`, and the role-overview tests `manager-overview.test.tsx` and `portfolio-overview.test.tsx`.

QAD-T122 to QAD-T124 and QAD-A45.

### Documentation
`docs/prd-pathways.md` (F2 bullet, G-F2-21), `docs/qad-pathways.md`, `docs/deferred-features.md` (row updated), `docs/index.md`, `docs/activity-log.md`.

## 5. Alternatives Considered

- Restraint option: do nothing and keep using alerts and verbal escalation. Rejected: the permissions exist with no use and the developer asked for the flow.
- A 0062-style SECURITY DEFINER list function for aggregate roles: rejected, see 3.6.
- A new permission code per tier or a `notifications` inbox: rejected; the matrix stays 312 rows and no inbox exists.
- A single `/resolve` route dispatched by role: rejected; separate routes keep each `RequirePermission` and audit action explicit.

## 6. Migration / Rollback

Apply by the normal migration chain after local replay and suites pass. Rollback before use: `DROP TABLE pathways.activity_escalations` and its function in a corrective migration; after use, resolve forward with a new migration (never edit 0070). No data from other tables is touched.

## 7. Verification

Local replay of 0000-0070, the runtime SQL suite, API and shared unit tests, web tests, typecheck, lint, then the manual test script below on the hosted stage.

### Manual test script

Prerequisites (one project P in a program managed by PG1; hosted stage):

- PO1 and PO2: Project Officers on P. PO1 is assigned to activities A, B, C and D; PO2 is on P but assigned to none.
- ME1 (M&E Officer), PM1 and PM2 (Project Managers), SA1 (System Administrator), GM1 (Grant Manager assigned to P).
- PG1: Program Manager managing P's program. PG2: a second Program Manager assigned directly to P, needed for the program-level separation steps.
- OUT1: a Project Manager on a different project.
- Activities A, B, C, D are IN_PROGRESS on P; E is COMPLETED. None has an open escalation at the start. Each scenario uses its own activity (or resolves before re-raising) so the one-open-per-activity rule never interferes.

Scenario 1, full tiered flow on A:
1. PO1 opens A, Raise escalation, enters a 5-character reason. Expect the form refuses it (10 character minimum) and the privacy hint is visible. Enter 20+ characters and submit. Expect status OPEN, the panel shows PO1 and the time, and A's status and dates are unchanged.
2. PO1 raises a second escalation on A. Expect 409 (one open per activity).
3. PO1, ME1 and SA1 try Forward and Resolve by API. Expect 403 for each.
4. GM1 opens A. Expect the panel and a WATCH row on the dashboard with no action buttons; direct POST forward, resolve and program-resolve return 403.
5. PM1 sees the A row in the dashboard queue (stage RESOLVE). PM1 Forward with a 3-character note: refused. With 10+ characters expect FORWARDED; the row leaves PM1's queue and appears in PG1's queue (stage PROGRAM).
6. PM1 tries Resolve on A. Expect 409 (status FORWARDED). PM2 tries program-resolve. Expect 403 (not a Program Manager).
7. PG1 program-resolves A with a decision note. Expect RESOLVED, level PROGRAM, PG1 and the time shown. PG1 tries again. Expect 409; after reload no action buttons remain.

Scenario 2, project-level resolve and access denials on B:
8. PO2 (not assigned to B) tries to raise on B. Expect 403 `An active activity assignment is required.` and no row.
9. ME1 raises on B. PM2 resolves with a note. Expect RESOLVED, level PROJECT, PM2 recorded, no forward fields.
10. OUT1 requests the B escalation list by URL. Expect 404 and no rows.

Scenario 3, project-manager raiser on C:
11. PM1 raises on C. PM1 tries Resolve. Expect 403 (raiser). The C row shows in PM1's queue with stage FORWARD only. PM1 tries program-resolve. Expect 403. PM1 Forward with a note. Expect FORWARDED (the raiser may forward).
12. PG1 program-resolves C. Expect RESOLVED, level PROGRAM.

Scenario 4, program-level separation on D:
13. PG1 raises on D (every role may raise). PM2 forwards it. PG1 tries program-resolve. Expect 403 (raiser). PG2 program-resolves. Expect RESOLVED, level PROGRAM.

Scenario 5, concurrency, finished activity and replay on A and E:
14. PO1 raises on A again; PM1 and PM2 open it in two tabs. PM2 forwards; PM1 submits Resolve with the old `expectedUpdatedAt`. Expect 409 and no change. PG1 then resolves it.
15. PO1 raises on E (COMPLETED). Expect 409 `A finished activity cannot be escalated.`
16. Raise on B, then re-send the same request id and input. Expect the same row; with a different reason expect 409. PM2 resolves it afterwards.

Scenario 6, privacy and audit:
17. As PG1 and GM1, inspect the queue, the activity panel and the network responses. Expect only project, activity code and title, status, reason, notes, staff names and times; no beneficiary name, contact, evidence or submission.
18. SA1 (holds `audit.read`) opens the audit log. Expect RAISED, FORWARDED and RESOLVED rows with the actor, the activity id and the level, and no reason or note text.

## 8. Approval

Developer decision 2026-10-19: approved. Tiered flow, no new permission codes, manual test script required, implementation first and hosted testing later.

## 9. Disposition

Closes the "Activity escalation" gap (RBAC v4 row 53). Follow-ups: migration 0070, module and web UI (Tasks 6-8 of the 2026-10-19 plan); the escalation inbox or notification of the next tier remains deferred with the notification inbox. Do not mark Applied until the migration, API, UI and the tests above exist.
