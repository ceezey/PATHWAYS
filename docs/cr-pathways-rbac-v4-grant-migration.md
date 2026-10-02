# Change Record: RBAC v4 grant migration

**ID:** `cr-pathways-rbac-v4-grant-migration`  
**Date:** 2026-10-02  
**Status:** Approved

## 1. Trigger

[cr-pathways-rbac-v4-adoption](cr-pathways-rbac-v4-adoption.md) section 3.2 adopted manuscript access matrix v4 in the docs and left the code changes to a follow-up migration, registered in `deferred-features.md`. This record is that follow-up for V4-C01, V4-C02, V4-C06, V4-C07, V4-C09, V4-C10 and V4-C11.

## 2. Current Contract

The running grants follow the earlier matrix plus amendments 0035, 0047, 0048, 0051 and 0054: 317 `role_permissions` rows, `p09_role_allows` wrapping the 0051 matrix, and direct data entry open to every published form type through `submissions.write` and `/collection/entry`.

## 3. Proposed Change

Seven grant cells, applied by migration 0055:

| Cell | Role | Permission | Change |
|---|---|---|---|
| V4-C01 | Program Manager | `projects.archive` | Revoke |
| V4-C01 | Grant Manager | `projects.archive` | Revoke |
| V4-C02 | System Administrator | `budgets.read` | Revoke |
| V4-C06 | Program Manager, Grant Manager | `activities.read` | Grant (2 rows) |
| V4-C07 | Project Officer | `activities.create` | Revoke |
| V4-C09 | Project Officer | `dashboards.customize`, `assessments.read` | Revoke |
| V4-C10 | Project Officer | `analytics.saddd.read` | Revoke |

Net effect: 7 revokes and 2 grants, so `role_permissions` goes from 317 to 312.

Two decisions:

- V4-C10: Project Officer `beneficiaries.aggregates.read` is re-sourced to v4 reporting rows 112-117, so activity, report and dashboard aggregates keep working; only `analytics.saddd.read` is revoked.
- V4-C11: the generic Encode Project Data screen is retired (`/collection/entry` redirects to `/collection`), and `submissions.write` is kept for TRAINING_SURVEY, PRE_TEST, POST_TEST and ACTIVITY_MONITORING as a V4-R5-style kept deviation. The API limits direct entry to those four form types (`DIRECT_ENTRY_FORM_TYPES` in `metadata.service.ts`).

## 4. Impact

### Product
Project Officers no longer add activities, customize dashboards, assess surveys or run SADDD; Program and Grant Managers read project activities and lose archive; System Administrators lose budget reads; direct entry is limited to survey and monitoring forms.

### Data / Migration
Migration 0055 `0055_rbac_v4_grants` replaces `pathways.p09_role_allows` (ACL preserved from 0054), deletes seven rows and inserts two. No preprovision or cleanup: prisma owns the function.

### Authorization / Privacy
Strictly narrows access except the two Program and Grant Manager activity-read grants, which stay inside existing program and organization scope. No new data exposure.

### API
`DIRECT_ENTRY_FORM_TYPES` gate on direct save; per-request grant resolution is pinned by tests.

### UI
`/collection/entry` redirects to `/collection`; the unused manual entry workspace is removed.

### Tests
`metadata.service.test.ts`, `csv-rbac.test.ts`, `workspace-resolution.service.test.ts`, `route-access.frontend-aliases.test.ts`, `apps/web/src/features/collection/*.test.tsx`, and the replay marker `RBAC_V4_GRANTS_RUNTIME`.

### Documentation
Adoption CR, PRD, QAD 3.7, SDD, runbook, state, index, logs; the deferred row is removed.

## 5. Alternatives Considered

- Restraint option: leave v4 as docs only. Rejected; the running system would contradict the source of record.
- Revoke `beneficiaries.aggregates.read` from Project Officer with SADDD. Rejected; it breaks activity, report and dashboard aggregates.
- Revoke `submissions.write` everywhere. Rejected; survey and monitoring forms still need direct save.

## 6. Migration / Rollback

Applied with the existing `--resume` hosted build after local replay and SAD migration review. Rollback is fix-forward by a later migration; 0055 is never amended.

## 7. Verification

- Replay marker `RBAC_V4_GRANTS_RUNTIME=PASS` in the local MigrationBaseline replay, including the 317 to 312 row count.
- API and web suites listed in section 4 Tests.
- Hosted check in Task 7: ledger 0000-0055 finished, and read-only grant checks on role-staging.

## 8. Approval

Approved by the developer on 2026-10-02.

## 9. Disposition

Approved. Set to Applied after the role-staging apply is verified.
