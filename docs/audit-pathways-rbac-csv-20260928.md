# Audit: Revised RBAC CSV Against Current Enforcement

**Date:** 2026-09-28  
**Scope:** `PATHWAYS - RBAC (revised).csv` compared with `rbac-contract.json`, the API role ceiling, SQL grants and ceiling (0027, 0035), web route and action gates, hardcoded role checks, and permission usage at `dev` commit `f0b2968`  
**Type:** Findings / evidence only

An audit records what was found. It does not become implementation authority by itself.

## 1. Baseline

- **Source:** the developer-supplied `PATHWAYS - RBAC (revised).csv`, SHA-256 `ef1339d951a61d6d8f10c3463a91af696569c304b34614b077e8e485b0ebaafd`. This equals `sourceSha256` in `apps/api/src/modules/auth/rbac-contract.json`, so the file is byte-identical to the contract's recorded source.
- **Approved amendment:** [admin read access](cr-pathways-admin-read-access.md) adds System Administrator `budgets.read` (row 39) and `activities.read` (row 40). The developer confirmed on 2026-09-28 that this amendment stays.
- **Layers compared:**
  - contract rows, permissions, supporting operations and amendments;
  - `rolePermissions`, `canAuthorizeRole`, `canAssignRole` and `aggregateOnlyRoles` in `apps/api/src/modules/auth/authorization-policy.ts`;
  - `rbac_expected` in `0027_revised_csv_rbac` plus the `0035_admin_read_access` insert;
  - the latest `pathways.p09_role_allows` matrix (0035);
  - `routePolicy` in `apps/web/src/lib/rbac/route-access.ts` and `apps/web/src/lib/rbac/ui-action-availability.ts`;
  - `actor.roles[0]` checks in API services and web features;
  - quoted permission references across `apps/api/src` and `apps/web/src`, excluding tests.
- **Method:** a disposable comparison script that is not committed. The CSV was parsed per row and role, each row mapped to its contract permissions, and every layer compared as a set of role and permission pairs.

## 2. Findings

| ID | Severity | Finding | Evidence | Contract affected | Recommended disposition |
|---|---|---|---|---|---|
| A-01 | Medium | Program Manager and Grant Manager hold row 47 "View Evidence & Reports Tab" (`evidence.read`), but no endpoint lists evidence with that permission alone. The web builds the Evidence view from the activity list, which requires `activities.read`, so these roles see the evidence section as unavailable. Before 0035 the System Administrator had the same gap. | `pathwaysClient.getEvidence` reads `getActivities` (`apps/web/src/lib/services/pathways-client.ts`); the only `evidence.read` API route is the disabled proof download (`apps/api/src/modules/activities/activities.controller.ts:180-181`, `activities.service.ts:1445`) | PRD-F2; auth RFC; CSV row 47 | Change Record for an evidence list endpoint scoped by `evidence.read` and project scope, or a documented deferral of evidence for aggregate-only roles |
| A-02 | Medium | Nine CSV-granted permissions have no API endpoint and no web gate, so the matching CSV actions are not implemented. | No non-test reference outside the policy and contract: `activities.progress.update` (row 43), `activities.escalations.read` and `.raise` (row 48), `forms.generate` (row 60), `forms.import` (row 63), `assessments.detail.read` (row 82), `dashboards.customize` (row 93), `analytics.descriptive.read` (row 94), `analytics.export` (row 98) | PRD-F2, F5, F7, F8; CSV rows listed | Record each as deferred or schedule it through a Change Record; permissions alone are not feature completion (auth RFC section 1) |
| A-03 | Low | Nine permissions gate only a web route, tab or button, with no API endpoint enforcing them. Pages whose data comes from other permissions are safe. Actions with no backend cannot work. | Web-only references: `analytics.read`, `collection.read`, `monitoring.review`, `forms.templates.import`, `forms.export`, `projects.archive`, `assignments.manage`, `backups.create`, `backups.restore` (`route-access.ts`, `ui-action-availability.ts`, `collection-workspace.tsx`) | CSV rows 23, 27, 35, 61, 64, 66, 88, 97, 117-120 | Confirm per action whether a backend exists under another permission; defer or implement the rest (archive project, backup and restore) |
| A-04 | Low | Supporting permissions `evaluations.submit`, `.approve`, `.signoff`, `.archive`, `settings.read` and `settings.labels.manage` are defined but unused by any API endpoint. | No non-test API reference; web references only in `access-matrix.ts` or `route-access.ts` | Contract supporting operations | Keep as reserved and document, or retire through a Change Record |
| A-05 | Low | Unreachable branch: project creation allows `SYSTEM_ADMINISTRATOR`, but that role never holds `projects.create` (CSV row 33), so the permission check denies first. | `apps/api/src/modules/projects/projects.service.ts:422-424` | CSV row 33 | Remove the role from the allow list in a later code change; no behavior change |
| A-06 | Info | The CSV rows 23-27 ("Manage Users and Roles", Create User, Assign Role and related) mark Project Manager and Program Manager ✔ without naming target roles. The code narrows them: Program Manager may authorize only Project Manager and M&E Officer, Project Manager only Project Officer and M&E Officer, and only the System Administrator may assign Grant Manager. | `authorization-policy.ts:456-476`; `csv-rbac.test.ts` "permits only Admin to assign Grant Manager" | Auth RFC role hierarchy | Confirm the hierarchy is intended and cite it in the auth RFC next to rows 23-27 |

## 3. Non-Findings / Verified Controls

- **CSV to contract:** 106 of the 108 action rows match the contract's role lists exactly. Rows 39 and 40 differ only by the approved admin read amendment, and the contract's `amendments` block records it.
- **Layer agreement:** the contract, the API ceiling, the SQL grants (0027 plus 0035) and the SQL ceiling `p09_role_allows` (0035) hold the same 308 role and permission pairs. None is missing a pair the CSV grants.
- **Supporting grants:** the 30 grants beyond the CSV rows are exactly the contract's declared supporting operations and reads, such as `activities.complete`, `forms.read`, `forms.publish`, `activities.context.read` and `settings.read`, each with a recorded disposition.
- **Detail rows over overview rows:** where a permission reaches a role through another row, the screen for the ✗ row checks a more specific permission:
  - row 32 editing needs `projects.update`;
  - rows 55-56 need `journeys.manage`, not held by Project Officer;
  - rows 77-81 need `beneficiaries.records.read`, not held by System Administrator;
  - row 95 needs `monitoring.read`, not held by Project Officer.
- **Hardcoded role checks:** the `roles[0]` checks in `users.service.ts`, `programs.service.ts`, `audit.service.ts`, `beneficiaries.service.ts` and the collection, import and draft helpers in the web apply organization, program or assignment scope after a permission check. None grants a CSV action on its own.
- **Automated guard:** `csv-rbac.test.ts` checks the contract against the 0027 grants plus amendments and the 0035 ceiling, and the phase 6 replay asserts the 0035 grants on replayed databases.

## 4. Required Closure Path

Each material finding must be:

- closed through an approved Change Record;
- explicitly deferred with rationale;
- or demonstrated false through evidence.

A-01 and A-02 are material. A-03 to A-05 can be closed by deferral notes or small follow-up changes. A-06 needs developer confirmation only.

## 5. Disposition

On 2026-09-28 the developer dispositioned every finding in the [RBAC audit closure Change Record](cr-pathways-rbac-audit-closure.md). A-01, A-02 (except the deferred escalation and dashboard-customization actions), A-03 and A-05 are scheduled for implementation. A-04 and A-06 are closed by auth RFC documentation.

## 6. Summary

- Grants match the CSV in every layer, apart from the approved rows 39 and 40 amendment.
- 2 Medium findings: evidence listing for aggregate-only roles (A-01), and nine granted actions with no implementation (A-02).
- 3 Low findings: web-only gates (A-03), unused supporting permissions (A-04), an unreachable branch (A-05).
- 1 Info item: the user-management hierarchy (A-06).
- Highest-risk open item: A-01, because a CSV-granted tab does not work for two roles.
