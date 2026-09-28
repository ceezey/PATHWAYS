# Audit: Frontend Controls Against Current Backend

**Date:** 2026-09-29
**Scope:** `apps/web` controls, client methods, UiActions and routes compared with `apps/api` endpoints, `rbac-contract.json`, `authorization-policy.ts` and `route-access.ts` at `dev` commit `ef82505`
**Type:** Findings / evidence only

An audit records what was found. It does not become implementation authority by itself.

## 1. Baseline

- **Source:** the current `apps/web/src` tree compared against `apps/api/src/modules/*` controllers, `apps/api/src/modules/auth/rbac-contract.json`, `apps/api/src/modules/auth/authorization-policy.ts`, `apps/web/src/lib/rbac/route-access.ts` and `apps/web/src/lib/rbac/ui-action-availability.ts`.
- **Layers compared:**
  - web click handlers and form submits against `apps/web/src/lib/services/pathways-client.ts` methods and the API routes/DTOs they call;
  - `UiAction` entries in `ui-action-availability.ts` against `supportedActionPermission` and the role/permission grants that reach them;
  - `routePolicy` entries in `route-access.ts` against pages that actually render and link to them;
  - components under `apps/web/src/features/**` against the pages/parents that import and mount them;
  - `pathways-client.ts` methods whose implementation is a stub throw rather than a `fetch` call.
- **Method:** a disposable comparison script that is not committed, plus direct file review. Each control was traced from its JSX handler to the client method it calls, then to the API route, DTO and permission gate, or to the absence of one.

## 2. Findings

### 2.1 Web stub handlers where an API already exists

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-01 | Medium | The Activities panel's expense controls ("Log expense", "Validate", "Return") do not call `finance/expenses`. "Logged budget" and the "Budget utilization" analytics tile are not filled from the API. The backend already exposes `POST projects/:id/finance/expenses`, `GET finance/expenses` and `POST finance/expenses/:id/review`. | `apps/web/src/features/projects/activity-*` expense controls; `apps/api/src/modules/finance/*` |
| F-02 | Medium | Evidence Preview does not load the file through the existing private proof route. The backend already exposes `GET .../activities/:aid/proof/:eid` behind the private proof authorization, and the web already has `private-proof-client.ts` for other proof flows. | evidence preview control in the Activities feature; `apps/web/src/lib/services/private-proof-client.ts`; `apps/api/src/modules/activities/activities.controller.ts` proof route |
| F-03 | Medium | "Create account" in user management does not call `pathwaysClient.authorizeExistingUser` (`POST /users/authorize-existing`), which already exists for authorizing a pre-existing Supabase Auth account into the organization. | create-user control in the user management feature; `apps/web/src/lib/services/pathways-client.ts` `authorizeExistingUser` |
| F-04 | Medium | Beneficiary journey "Update enrollment status" and "Add note" do not call the existing `transitionBeneficiaryJourney` (`POST …/journey/events`) and `correctBeneficiaryJourneyEvent` endpoints. Both endpoints already carry the step-up and permission gating used elsewhere on the Beneficiary journey. | journey action controls in the Beneficiary feature; `apps/web/src/lib/services/pathways-client.ts` journey methods; `apps/api/src/modules/beneficiaries/*` journey routes |

### 2.2 Controls with no backend at all

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-05 | Low | "Request extension" has no matching API route or client method. | project/activity extension control |
| F-06 | Low | "Add to Dashboard" and "Add a chart" have no persistence endpoint; `dashboard.configure` is not in `supportedActionPermission` (see F-14), and the only server-side chart state is `lib/demo-state/dashboard-charts.ts`, which is local mock state, not an API call. | dashboard chart controls; `apps/web/src/lib/demo-state/dashboard-charts.ts`; `apps/web/src/lib/rbac/ui-action-availability.ts` |
| F-07 | Low | The page-heading pencil (inline heading editor) and the "Edit Labels" link have no backend. There is no `settings/labels` API route and no persisted label store; edits do not survive reload for any other viewer. | page-heading editor component; "Edit Labels" entry point |
| F-08 | Low | The duplicates page has no supporting API for listing or resolving duplicate records. | duplicates page |
| F-09 | Low | The staff preview editor has no save/publish endpoint. | staff preview editor component |
| F-10 | Low | The Backup & Recovery page has no `backups` API; `backups.create` and `backups.restore` are web-only gates with no route (consistent with audit `audit-pathways-rbac-csv-20260928.md` finding A-03). | backup/recovery page |
| F-11 | Low | The "Beneficiaries reached" field on project/activity forms has no corresponding writable field on the API DTOs; it is display-only or silently dropped on submit. | project/activity form field |
| F-12 | Low | Several analytics/analysis views render only an empty state; there is no `analytics.descriptive.read` or `analytics.export` call wired to them (tracked as deferred in `cr-pathways-rbac-audit-closure.md` A-02). | descriptive analytics views |
| F-13 | Low | "Add"/"review" controls for media proof beyond the wired evidence preview (F-02) have no endpoint; linked-indicator checkboxes on the indicator picker do not persist a link because there is no linked-indicator write endpoint; import duplicate "Skip" and "Keep" controls have no corresponding batch-resolution call; the Participant select on relevant forms has no data source wired to it. | media proof controls; linked-indicator checkboxes; import duplicate-resolution controls; participant select |

### 2.3 Unmapped UiActions

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-14 | Medium | `beneficiaries.merge`, `outcomes.log`, `dashboard.configure` and `progress.review` are declared `UiAction` values used by mounted controls (`beneficiary-directory.tsx:312`, `connected-delivery-workspace.tsx:122`, dashboard chart controls, a progress-review control) but have no entry in `supportedActionPermission` in `apps/web/src/lib/rbac/ui-action-availability.ts`. `isUiActionAvailable` returns `false` unconditionally for these actions regardless of role, so the controls are permanently disabled or hidden for every role, including System Administrator. | `apps/web/src/lib/rbac/ui-action-availability.ts:10-40` |
| F-15 | Low | `milestones.manage` *is* mapped (`supportedActionPermission['milestones.manage'] = 'milestones.manage'`), but the `milestones.manage` permission itself is granted to no role in `rbac-contract.json` (`"milestones.manage": []`). The mapping is therefore live but unreachable: no role can ever pass the check. | `apps/web/src/lib/rbac/ui-action-availability.ts:37`; `apps/api/src/modules/auth/rbac-contract.json:448` |

### 2.4 Components no page renders

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-16 | Low | One or more feature components under `apps/web/src/features/**` are exported but not imported by any route-mounted page, so they cannot be reached by a user. These are candidates for the dead-code follow-up in `docs/cr-pathways-frontend-usability.md` rather than immediate deletion. | component export with no importing page (see follow-up disposition in the Change Record) |

### 2.5 Client methods that only throw `not_configured`

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-17 | Low | `requestFoundationResponse` (the shared request helper in `pathways-client.ts`) throws `PathwaysClientError(..., 'not_configured')` when Supabase or the API base URL is not configured. Several web methods have no other implementation path beyond this helper, so in an unconfigured environment they surface as generically "unavailable" rather than naming the missing control. This is a configuration guard, not a per-feature stub, but it means an unwired control and an unconfigured environment currently look identical to the user. | `apps/web/src/lib/services/pathways-client.ts:1856`, `:1878` |

### 2.6 Orphan route

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-18 | Low | `routePolicy.transparency` (`/projects/:projectId/transparency`) is registered in `route-access.ts` alongside `transparencyPreview` and `transparencyQueue`, but no in-app navigation links to the non-preview `transparency` entry; only the `/preview` and public tracker queue routes are reachable from the UI. The route resolves and is access-gated, it is simply unlinked. | `apps/web/src/lib/rbac/route-access.ts:63-75` |

### 2.7 Usability bugs

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-19 | Medium | After `createProject` succeeds, the web calls `router.push` while still holding the pre-creation cached profile. `routeAllowed` denies the new project's route because the cached `assignedProjectIds` does not yet include it, and `refreshAccess()` is never called before the redirect, so the user who just created the project lands on an "unauthorized" page. | `apps/web/src/lib/rbac/route-access.ts:331` (`assignedProjectIds` check); project-create flow calling `router.push` without a preceding `refreshAccess()` |
| F-20 | Medium | The project team edit dialog sends `''` for empty dates, and literal placeholder strings ("Sector not recorded", "Not assigned") as if they were real field values, because the dialog has no zod resolver and does not clean its defaults the way the setup form does. The API rejects these values, and `pathways-client.ts` collapses the resulting 400/403 into a generic error message, hiding the server's actual validation reason from the user. | `apps/web/src/features/projects/project-team-editor-dialog.tsx:41-61`; `apps/web/src/lib/services/pathways-client.ts:1916-1963` |

## 3. Non-Findings / Verified Controls

- The four "Not assessed" hardcodes (`project-workspace-header.tsx:57`, `project-directory.tsx:192`, `project-detail-view.tsx:140`, `project-preview-dialog.tsx:33`) are UI copy, not a broken control; they are addressed as a usability fix rather than a dead-control finding.
- Objectives validation (`project-form-validation.ts:19`) requires a field the API and database allow to be empty. This is a web-only stricter constraint, not a dead control; the API accepts an empty value.
- "Donate Now" has no backend and is treated as intentionally informational per developer decision, not a dead control requiring remediation.
- TOTP entry (`features/auth/mfa-form.tsx:515-541`) and the sidebar toggle placement (`components/layout/app-shell.tsx:87-100`, `components/layout/sidebar.tsx:47-60`) are accessibility/usability issues, not dead controls; both are addressed as usability fixes.

## 4. Required Closure Path

Each material finding must be:

- closed through an approved Change Record;
- explicitly deferred with rationale;
- or demonstrated false through evidence.

F-01 through F-04, F-14 and F-19/F-20 are material. F-05 through F-13, F-15 through F-18 are closed by the "Not available yet" disabled-state decision or documented as a dead-code follow-up.

## 5. Disposition

On 2026-09-29 the developer dispositioned every finding in [`docs/cr-pathways-frontend-usability.md`](cr-pathways-frontend-usability.md). F-01 through F-04 are wired to their existing endpoints. F-07 (page-heading pencil and "Edit Labels") is deferred: no migration, no `settings.labels.manage` grant and no auth RFC change happen this round; `settings.labels.manage` stays reserved and granted to no role, and the pencil moves to the same disabled "Not available yet" state as the other no-backend controls, while "Edit Labels" and the dead `/settings/labels` page are removed. F-14 and F-15's underlying UiActions stay unmapped/ungranted pending a future Change Record, except `dashboard.configure`/"Add to Dashboard" and "Add a chart", which move to the disabled "Not available yet" state described in F-06. F-05, F-06, F-08 through F-13 (excluding the four wired items) receive the consistent disabled "Not available yet" state. F-16 (unrendered components) and F-17 (`not_configured` stub surfacing) are recorded as a dead-code and error-messaging follow-up, not implemented this round. F-18 (orphan transparency route) is left as-is; it is reachable and correctly gated, just unlinked. F-19 and F-20 are fixed directly. This round is frontend only; no migration is in scope.

## 6. Summary

- 4 Medium findings on wired-but-stubbed web controls that already have a backend (F-01 to F-04).
- 1 Medium finding on unmapped UiActions that permanently disable four controls regardless of role (F-14).
- 2 Medium usability bugs: the post-create unauthorized redirect (F-19) and the team-edit silent-failure pattern (F-20).
- 9 Low findings on controls with genuinely no backend (F-05 to F-13), an unreachable permission mapping (F-15), unrendered components (F-16), a generic `not_configured` stub surface (F-17) and an unlinked but correctly gated route (F-18).
- Highest-risk open items: F-19 and F-20, because they turn a successful action into a false "unauthorized" or unexplained failure for the user who performed it.
