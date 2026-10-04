# Change Record: Activity Extension Request

**ID:** `cr-pathways-activity-extension-request`  
**Date:** 2026-10-04  
**Status:** Applied (2026-10-04; 0061 on PATHWAYS-devV2, 37-row ledger)

## 1. Trigger

User decision 2026-10-04: a Project Officer requests a later activity end date, the M&E Officer verifies or returns it, and the Project Manager approves or declines it; approval moves the planned end date. The role dashboards showed a disabled "Request an extension" control (deferred register, Plan 2).

## 2. Current Contract

Only a Project Manager with `activities.update` could change `planned_end_date`, through the activity edit form. There was no request, review or audit trail for a date change asked by the assigned officer.

## 3. Change

- Table `pathways.activity_extension_requests` (prisma-owned, composite FKs, RLS enabled and forced). Request content is immutable; only the review fields are column-granted for UPDATE; no DELETE.
- One open request (PENDING or VERIFIED) per activity (partial unique index). The requested date must be later than the current one. Reason and notes are 10-2000 trimmed characters.
- Separation of duties in the database and the API: the verifier is not the requester; the decider is neither.
- API module `activity-extensions` under `projects/:projectId/activities/:activityId/extension-requests`:
  - `GET` (`activities.read`): latest 20 requests.
  - `POST` (`activities.proof.submit` plus an ACTIVE activity assignment): request; a replayed `clientMutationId` returns the same row.
  - `POST /:requestId/verify` (`evidence.review`, role M&E Officer): VERIFY or RETURN with a note.
  - `POST /:requestId/decide` (`activities.update`, role Project Manager): APPROVE or DECLINE with a note.
- APPROVE runs the existing `ACTIVITY_UPDATE` rule source operation in the same transaction, so rules re-evaluate, and only `planned_end_date` changes. When the new date passes the project end date and the activity has no timeline justification, the request reason becomes the justification. A stale activity version returns 409 and leaves both rows unchanged.
- Web: the activity detail sheet has a working Request an extension dialog and an extension panel (Verify/Return for the M&E Officer, Approve/Decline for the Project Manager, status only for others). Role dashboards show returned and declined notes, an Extension pending badge, an M&E verify queue and Project Manager approval rows.
- No new permission codes; the role-permission matrix stays 312 rows.

## 4. Impact

### Product
Assigned officers can ask for more time without editing the activity; managers decide with a recorded note.

### Data / Migration
Migration `0061_activity_extension_requests`: one table, three policies, column grants. Only prisma-owned helpers are referenced, so no DBA preprovision is needed. Pathways table count 60; ledger 36 rows through 0061.

### Tests
- `apps/api/prisma/tests/activity-extension-requests-runtime.sql` (12 assertions)
- `apps/api/src/modules/activity-extensions/activity-extensions.service.test.ts`, `activity-extensions.controller.test.ts`, `activity-extensions.local.test.ts`
- `apps/web/src/features/projects/activity-extension-dialog.test.tsx`, `activity-extension-panel.test.tsx`
- `apps/web/src/features/dashboard/role-overview/*.test.tsx`

QAD-T115 to QAD-T117 and QAD-A43.

## 5. Documents Updated

- `docs/prd-pathways.md`: PRD-F2 and PRD-F8 bounds.
- `docs/qad-pathways.md`: QAD-T115 to QAD-T117, QAD-A43.
- `docs/deferred-features.md`: the Plan 2 row narrowed to evaluation approval.
