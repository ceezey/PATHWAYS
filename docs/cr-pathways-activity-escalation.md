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

1. Raise: a Project Officer, M&E Officer or Project Manager raises an escalation on an activity with a reason. Status OPEN.
2. Project tier: a Project Manager (not the raiser) either RESOLVES it with a note (resolution level PROJECT) or FORWARDS it to the program level with a note (status FORWARDED).
3. Program tier: a Program Manager who is neither the raiser nor the forwarder RESOLVES a FORWARDED escalation with a decision note (resolution level PROGRAM).
4. Grant Manager, System Administrator and every other holder of `activities.escalations.read` in scope see status only; the Grant Manager is read-only.

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

Constraints (8 CHECKs, 6 FKs):

- `activity_escalations_status_check`, `_reason_check`, `_forward_note_check`, `_resolution_note_check`, `_level_check`.
- `_forwarder_check`: `forwarded_by_id IS NULL OR forwarded_by_id <> raised_by_id`.
- `_resolver_check`: `resolved_by_id IS NULL OR (resolved_by_id <> raised_by_id AND resolved_by_id IS DISTINCT FROM forwarded_by_id)`.
- `_state_check`: OPEN has no forward or resolution fields; FORWARDED has `forwarded_by_id`, `forwarded_at`, `forward_note` and no resolution fields; RESOLVED has `resolved_by_id`, `resolved_at`, `resolution_note`, `resolution_level`, and level PROJECT requires no forward fields while level PROGRAM requires all three forward fields.
- `UNIQUE (organization_id, project_id, activity_id, id)` scope key; partial unique `activity_escalations_open_key` on (organization_id, project_id, activity_id) WHERE status IN ('OPEN','FORWARDED').
- Indexes: (organization_id, project_id, status, raised_at) and (organization_id, raised_by_id).

BEFORE UPDATE trigger `activity_escalations_transition` (SECURITY INVOKER, `search_path=''`, owner prisma, REVOKE from PUBLIC) allows only OPEN to FORWARDED, OPEN to RESOLVED (level PROJECT) and FORWARDED to RESOLVED (level PROGRAM, forward fields unchanged); anything else raises 23514 with constraint `activity_escalations_transition_check`.

### 3.4 RLS and grants

All policies `TO pathways_runtime`, organization from `app.organization_id`, scope through `pathways.p05_has_project_permission(code, project_id)` (project assignment, or Program Manager through the managed program, or System Administrator):

- SELECT `p05_activity_escalations_select`: `activities.escalations.read`.
- INSERT `p05_activity_escalations_insert`: `activities.escalations.raise`, `raised_by_id = app.user_id`, `status = 'OPEN'`.
- UPDATE `p05_activity_escalations_update`: USING `status IN ('OPEN','FORWARDED')` and (`activities.update` OR `activities.escalations.read`). WITH CHECK: a FORWARDED row needs `forwarded_by_id = app.user_id` and `activities.update`; a RESOLVED row needs `resolved_by_id = app.user_id` and (`resolution_level = 'PROGRAM'` OR `activities.update`).

Grants: REVOKE ALL from PUBLIC, anon, authenticated, service_role; `GRANT SELECT, INSERT` to `pathways_runtime`; column `GRANT UPDATE (status, forwarded_by_id, forwarded_at, forward_note, resolved_by_id, resolved_at, resolution_note, resolution_level, updated_at)`. No DELETE; `reason` and other content columns cannot be updated. Only prisma-owned helpers are referenced, so no DBA preprovision is needed. Postconditions mirror 0061 (owner, 8 CHECKs, 6 FKs, forced RLS, 3 policies, grants, trigger enabled).

Role discrimination between Program Manager and Grant Manager (both hold `activities.escalations.read` and neither holds `activities.update`) cannot be expressed in the `p05` permission helper, so the API enforces the role exactly as 0061 does for the M&E Officer. The runtime role is held only by the API, and the database still enforces scope, organization, separation of duties, state order and immutability.

### 3.5 Permissions (no new codes; matrix stays 312 rows)

| Action | Role (sole role) | Permission | Extra rule |
|---|---|---|---|
| List | any role | `activities.escalations.read` | project scope |
| Raise | PROJECT_OFFICER, MONITORING_AND_EVALUATION_OFFICER, PROJECT_MANAGER | `activities.escalations.raise` | Project Officer needs an ACTIVE activity assignment (`requireActiveAssignment`, as the extension request does); M&E Officer and Project Manager need project scope only; a COMPLETED or CANCELLED activity is refused with 409 `A finished activity cannot be escalated.` |
| Forward, Resolve (project) | PROJECT_MANAGER | `activities.update` | actor is not the raiser |
| Resolve (program) | PROGRAM_MANAGER | `activities.escalations.read` | actor is neither raiser nor forwarder; status FORWARDED |
| Grant Manager, Program Manager, System Administrator raising | refused 403 | | Grant Manager is read-only; the Program Manager and System Administrator act at their tier or observe |

A Project Manager who raised an escalation cannot forward or resolve it; another Project Manager on the project must, otherwise it stays OPEN (known limit, accepted).

### 3.6 Privacy for aggregate-only roles

`aggregateOnlyRoles` (PROGRAM_MANAGER, GRANT_MANAGER) never see beneficiary data. The escalation row, list, queue and audit changes carry only project, activity code and title, status, reason, notes, staff display names (id plus full name, as the extension mapper does) and timestamps. They carry no beneficiary field, no evidence and no submission.

Existing RLS already lets these roles read the activity row: both hold `activities.read`; the Program Manager is in scope through the managed program (`p05_has_project_permission` and `projectScope`), the Grant Manager through explicit active project assignment. Therefore no SECURITY DEFINER function is needed. This is the least-privilege option: a direct policy-guarded SELECT on one new table with an explicit column selection, no elevated owner and no new execute grant, versus a 0062-style definer list function that would add a privileged owner, a preprovision step and a second code path for no extra protection. The service must select only `id, projectId, title, code, status, updatedAt` of the activity for these roles and must never include beneficiary relations.

Because reason and notes are free text, the raise and decision forms must show the hint "Do not include beneficiary names or contact details", and the manual test below checks it. The server cannot detect identities in free text; this residual risk is accepted and recorded.

### 3.7 API (module `activity-escalations`, controller/service/mapper/helpers split like `activity-extensions`)

Base `projects/:projectId/activities/:activityId/escalations`; every response `Cache-Control: private, no-store`; bodies are strict Zod schemas in `packages/shared/src/contracts/activities/activity-escalations.ts`; transitions use `expectedUpdatedAt` and `updateMany` on (id, org, expected status, updatedAt); a stale or already moved row returns 409 `This escalation changed; reload before deciding.`

| Method and path | Permission | Body | Result |
|---|---|---|---|
| `GET /` | `activities.escalations.read` | none | latest 20 `ActivityEscalation`, newest first |
| `POST /` | `activities.escalations.raise` | `{ clientMutationId: uuid, reason: 10-2000 }` | 201 `ActivityEscalation`; a replayed `clientMutationId` with identical input returns the same row, different input 409 |
| `POST /:escalationId/forward` | `activities.update` | `{ note: 10-2000, expectedUpdatedAt }` | OPEN to FORWARDED |
| `POST /:escalationId/resolve` | `activities.update` | `{ note: 10-2000, expectedUpdatedAt }` | OPEN to RESOLVED, level PROJECT |
| `POST /:escalationId/program-resolve` | `activities.escalations.read` | `{ note: 10-2000, expectedUpdatedAt }` | FORWARDED to RESOLVED, level PROGRAM |

`ActivityEscalation` = `{ id, projectId, activityId, reason, status, raisedBy: {id,name}, raisedAt, forwardedBy: {id,name}|null, forwardedAt|null, forwardNote|null, resolvedBy: {id,name}|null, resolvedAt|null, resolutionNote|null, resolutionLevel: 'PROJECT'|'PROGRAM'|null, updatedAt }` (ISO strings).

Refusals: unknown or out-of-scope activity or escalation 404; wrong role, own raise, raiser or forwarder deciding, or unassigned Project Officer 403; wrong status, open duplicate, stale `expectedUpdatedAt` 409; reason or note outside 10-2000 trimmed 400. Audit rows (`writeAuditLog`, entity `ActivityEscalation`): `ACTIVITY_ESCALATION_RAISED`, `_FORWARDED`, `_RESOLVED`, with `changes: { activityId, level? }` and never the free text.

### 3.8 Dashboards and web

- Role overview (`GET /dashboards/role-overview`) gains additive `escalationQueue: { count, rows } | null`, built like `extensionQueue`, rows `{ id, activityId, projectId, projectTitle, activityCode, activityTitle, status, reason, raisedByName, raisedAt, stage }`, `take` same as other queues, oldest first:
  - Project Manager: `stage: 'RESOLVE'`, status OPEN, raiser is not the actor.
  - Program Manager: `stage: 'PROGRAM'`, status FORWARDED, actor is neither raiser nor forwarder.
  - Grant Manager: `stage: 'WATCH'`, status OPEN or FORWARDED, read-only rows with no action buttons.
  - Other roles: `null`; their escalations show on the activity panel.
- Activity detail sheet: a Raise escalation dialog (reason, privacy hint) for the three raise roles, and an escalation panel listing the latest escalations with status, notes and level; Forward and Resolve for the Project Manager, Resolve for the Program Manager, status only for the rest. Deep link `?action=escalation`.
- Manager and Program Manager overviews render the queue rows with an action link to the activity; the Grant Manager overview renders them without actions.

## 4. Impact

### Product
Anyone on an activity can flag a blocker with a reason; the Project Manager handles it or hands it up; the Program Manager closes forwarded ones; a decision trail exists.

### Data / Migration
Migration `0070_activity_escalations`: one table, three policies, one trigger, column grants. Requires verified 0069 and prisma identity (0061 guard style). The implementer records the resulting ledger and pathways table counts.

### Authorization / Privacy
See 3.4, 3.5 and 3.6. No new permission codes, no widened grants, no beneficiary data in any escalation surface.

### API
Section 3.7; shared contracts exported from `@pathways/shared`.

### UI
Section 3.8; style follows the extension dialog and panel.

### Tests
- `apps/api/prisma/tests/activity-escalations-runtime.sql` (separation of duties, state order, immutability, one open per activity, no DELETE, scope).
- `apps/api/src/modules/activity-escalations/*.test.ts` (service, controller, validation, local replay).
- `packages/shared/src/contracts/activities/activity-escalations.test.ts`.
- `apps/web/src/features/projects/activity-escalation-dialog.test.tsx`, `activity-escalation-panel.test.tsx`, role-overview tests.

QAD-T122 to QAD-T124 and QAD-A45.

### Documentation
`docs/prd-pathways.md` (F2 bullet, G-F2-21), `docs/qad-pathways.md`, `docs/deferred-features.md` (row updated), `docs/index.md`, `docs/activity-log.md`.

## 5. Alternatives Considered

- Restraint option: do nothing and keep using alerts and verbal escalation. Rejected: the permissions exist with no use and the developer asked for the flow.
- A 0062-style SECURITY DEFINER list function for aggregate roles: rejected, see 3.6.
- A new permission code per tier or a `notifications` inbox: rejected; the matrix stays 312 rows and no inbox exists.
- A single `/resolve` route dispatched by role: rejected; separate routes keep each `RequirePermission` and audit action explicit.
- Letting a Project Manager's own raise go straight to FORWARDED: deferred; recorded as the known limit in 3.5.

## 6. Migration / Rollback

Apply by the normal migration chain after local replay and suites pass. Rollback before use: `DROP TABLE pathways.activity_escalations` and its function in a corrective migration; after use, resolve forward with a new migration (never edit 0070). No data from other tables is touched.

## 7. Verification

Local replay of 0000-0070, the runtime SQL suite, API and shared unit tests, web tests, typecheck, lint, then the manual test script below on the hosted stage.

### Manual test script

Use one project with a Project Officer (PO1, assigned to activity A), a second unassigned Project Officer (PO2), an M&E Officer (ME1), two Project Managers (PM1, PM2), a Program Manager managing the program (PG1), a Grant Manager assigned to the project (GM1) and a Project Officer or Project Manager outside the project (OUT1). Activity A is IN_PROGRESS.

1. PO1 opens A, Raise escalation, enters a 5-character reason. Expect the form refuses it (10 character minimum) and the privacy hint is visible. Enter 20+ characters, submit. Expect status OPEN, panel shows PO1 and the time; A's status and dates are unchanged.
2. PO1 raises a second escalation on A. Expect 409 `already has an open escalation`.
3. PO2 (not assigned to A) tries to raise. Expect 403 `An active activity assignment is required.` and no row.
4. GM1 opens A. Expect the escalation panel and the dashboard WATCH row with no action buttons; a direct POST raise or resolve returns 403.
5. OUT1 requests the list by URL. Expect 404 and no rows.
6. PO1 attempts Forward or Resolve by API. Expect 403.
7. PM1 sees the dashboard Resolve queue row. PM1 opens A, Forward with a 3-character note. Expect refused; with 10+ characters expect FORWARDED, the row leaves PM1's queue and appears in PG1's queue.
8. PM1 tries Resolve on the FORWARDED row. Expect 409. PG1 resolves with a decision note: expect RESOLVED, level PROGRAM, PG1 and time shown.
9. PG1 tries program-resolve on the already RESOLVED row. Expect 409. Reload the panel; the stale button is gone.
10. Raise a new escalation as ME1 (allowed once the previous one is RESOLVED). PM2 resolves it directly with a note: expect RESOLVED, level PROJECT, PM2 recorded, no forward fields.
11. Raise as PM1, then PM1 tries Forward and Resolve. Expect 403 for both; PM2 can act. PG1 tries program-resolve while it is OPEN. Expect 409.
12. Stale check: open the same OPEN escalation as PM1 and PM2 in two tabs; PM2 forwards; PM1 submits Resolve with the old `expectedUpdatedAt`. Expect 409 and no change.
13. PG1 tries to raise on A. Expect 403. Confirm the Program Manager dashboard queue lists only FORWARDED rows, and that a PM-forwarded escalation originally raised by PG1's own account cannot exist (PG1 never raises).
14. Privacy: as PG1 and GM1 inspect the queue, the activity panel and the network responses. Expect only project, activity code and title, status, reason, notes, staff names and times; no beneficiary name, contact, evidence or submission.
15. Audit: the audit log has RAISED, FORWARDED and RESOLVED rows with the actor, the activity id and the level, and no reason or note text.
16. Replay: re-send the same raise request id with the same input. Expect the same row; with a different reason expect 409.

## 8. Approval

Developer decision 2026-10-19: approved. Tiered flow, no new permission codes, manual test script required, implementation first and hosted testing later.

## 9. Disposition

Closes the "Activity escalation" gap (RBAC v4 row 53). Follow-ups: migration 0070, module and web UI (Tasks 6-8 of the 2026-10-19 plan); the escalation inbox or notification of the next tier remains deferred with the notification inbox. Do not mark Applied until the migration, API, UI and the tests above exist.
