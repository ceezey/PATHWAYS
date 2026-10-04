# Change Record: Program Manager Project Assignment

**ID:** `cr-pathways-program-manager-project-assignment`
**Date:** 2026-10-04
**Status:** Developer approved 2026-10-04, implemented locally.

## 1. Problem

A Program Manager could receive projects only through the seeded `programs.manager_user_id` link. Since commit 10030674 the API excluded PROGRAM_MANAGER from `assignableRoles` and `canAssignRole`, so User Management could not assign one to projects, although the [auth RFC](rfc-pathways-auth-rbac-isolation.md) already scopes Program Manager to "Managed active programs or explicit active assignments".

## 2. Decision

- Only System Administrator may assign a Program Manager to projects; `canAuthorizeRole` already limits PROGRAM_MANAGER targets to that role.
- A Program Manager may hold zero project assignments, because the portfolio can still come from managed programs. The "at least one project" rule stays for every other assignable role. Saving a Program Manager with an empty list ends their explicit assignments.
- Setting or changing `programs.manager_user_id` in the app is out of scope and stays in [deferred features](deferred-features.md).

## 3. No migration

The database already permits this: `p09_assignment_insert` with `p1_can_manage_role` lets System Administrator assign PROGRAM_MANAGER, and `p05_has_project_permission` honours explicit assignments for any role (baseline `0000_pathways_baseline_through_0026`). API `projectScope()` already combines assigned projects with managed programs for Program Manager. No schema or policy change.

## 4. Files changed

- `apps/api/src/modules/auth/authorization-policy.ts`: `canAssignRole` accepts PROGRAM_MANAGER.
- `apps/api/src/modules/users/users.service.ts`: PROGRAM_MANAGER is assignable; `requireProjects` returns an empty list for it.
- `apps/web/src/lib/rbac/access-matrix.ts`: `projectAssignableRoles` adds Program Manager.
- `apps/web/src/features/settings/user-management-workspace.tsx` and `user-management-utils.ts`: no required project, hint text, "Managed programs" label.
- `apps/web/src/features/projects/project-team-editor-dialog.tsx`: comment only; the project team dialog is unchanged.
- Tests for policy, users service, access matrix, utils and workspace.
