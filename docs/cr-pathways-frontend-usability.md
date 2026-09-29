# Change Record: Frontend Usability and Dead-Control Closure

**ID:** `cr-pathways-frontend-usability`
**Date:** 2026-09-29
**Status:** Approved

## 1. Trigger

The developer requested a second audit for buttons and controls that do not work, alongside seven usability fixes. The [frontend controls audit](audit-pathways-frontend-controls-20260929.md) recorded four wired-but-stubbed web controls with an existing backend (F-01 to F-04), unmapped UiActions (F-14, F-15), controls with no backend at all (F-05 to F-13), unrendered components (F-16), a generic `not_configured` stub surface (F-17), an unlinked but correctly gated route (F-18), and two usability bugs (F-19, F-20). Its closure path requires each material finding to be closed through an approved Change Record, explicitly deferred with rationale, or shown false. This record carries the developer decisions made on 2026-09-29.

## 2. Decisions

### Wire-ups (F-01 to F-04)

Wire the four controls that already have a backend to their existing endpoints:

- Activities: "Log expense" calls `coreDataClient.submitExpense` (`POST projects/:id/finance/expenses`); "Validate" and "Return" call `POST finance/expenses/:id/review`, with pending expenses loaded from `GET finance/expenses`; "Logged budget" and the "Budget utilization" analytics tile are filled from the API.
- Evidence Preview loads the file through the existing private proof route and client (`GET .../activities/:aid/proof/:eid`, `private-proof-client.ts`), subject to the authorization already enforced there.
- "Create account" calls `pathwaysClient.authorizeExistingUser` (`POST /users/authorize-existing`); the copy states the Auth account must already exist, and server errors are shown.
- Beneficiary journey "Update enrollment status" calls `transitionBeneficiaryJourney` (`POST …/journey/events`) and "Add note" calls `correctBeneficiaryJourneyEvent`, with the same step-up and permission gating already applied elsewhere on the journey.

No new API surface is introduced by this decision; each wire-up targets a route that already exists and is already permission-gated.

### Page-heading pencil and "Edit Labels" (F-07)

**Deferred.** Organization display labels are out of scope for this round: there is no migration `0042`, no `settings.labels.manage` grant, and no auth RFC change. `settings.labels.manage` stays reserved and granted to no role, exactly as closed by audit `audit-pathways-rbac-csv-20260928.md` finding A-04 and [`cr-pathways-rbac-audit-closure.md`](cr-pathways-rbac-audit-closure.md). This round is frontend only, with no migrations.

The page-heading pencil is changed to a disabled control reading "Not available yet", the same consistent treatment given to every other no-backend control in this record. The dead "Edit Labels" link is still removed, since it points at a page with no backend and no working destination. The dead `/settings/labels` page is removed along with it. A working label editor, its API and its migration remain a candidate for a future, separate Change Record.

### Objectives (usability fix)

Remove the Objectives field from the project setup form, its web-only validation (`project-form-validation.ts:19`) and the detail view. The type and payload stop sending it. The database column is kept; the API and database already allow it to be empty, so this is a UI-only removal with no migration and no data loss for existing rows.

### No-backend controls (F-05, F-06, F-08 to F-13, F-15, F-18)

Every control confirmed to have no backend receives a consistent disabled state with the short tooltip text "Not available yet", instead of accepting input and then failing on save:

- the page-heading pencil (F-07, deferred; see above);
- Request extension;
- Add to Dashboard and Add a chart (`dashboard.configure`, unmapped per F-14/F-06);
- staff preview editor;
- Backup & Recovery;
- Beneficiaries reached field;
- the empty analysis views;
- media proof add and review;
- linked-indicator checkboxes;
- import duplicate Skip and Keep;
- the Participant select.

Any control that currently accepts input and then fails on save is changed to disabled-first, so a user's input is never silently lost. "Donate Now" stays informational, unchanged, per developer decision; it was never presented as a working control.

The orphan `routePolicy.transparency` (F-18) is left as-is: it is correctly permission-gated and simply unlinked from navigation. No change is required to close it as a finding.

`milestones.manage` (F-15) and the remaining unmapped UiActions `beneficiaries.merge`, `outcomes.log` and `progress.review` (F-14) stay unmapped and ungranted. They are not wired this round; a future Change Record is required before any of them is implemented, consistent with the audit's guidance that permissions alone are not feature completion.

### Dead code (F-16, F-17)

No dead-code deletion happens in this round. Components with no rendering page (F-16) and the generic `not_configured` stub surface that makes an unwired control indistinguishable from an unconfigured environment (F-17) are recorded here as a **follow-up**, to be scheduled as a separate, smaller Change Record once the disabled-state work above has shipped and any remaining unreferenced components are re-confirmed against the then-current tree.

### Usability bugs (F-19, F-20)

- **Post-create unauthorized redirect (F-19):** `await refreshAccess()` runs before `router.push` after `createProject` succeeds, so the profile's `assignedProjectIds` includes the new project before `routeAllowed` evaluates the redirect target.
- **Team edit silent failures (F-20):** the team edit dialog is given the same default-cleaning the setup form already uses. Missing dates send `undefined` instead of `''`. Placeholder strings ("Sector not recorded", "Not assigned") are stripped before submit rather than sent as values, and optional roles get a "None" option that clears them explicitly. The dialog gets a zod resolver. `pathways-client.ts` surfaces the server's actual 400/403 message (joining a class-validator array where present) instead of the generic error text.

## 3. Changes

- **Documentation (this record):** audit disposition and index registration. `settings.labels.manage` and the auth RFC are unchanged; no amendment is made.
- **Implementation (feature branches, reviewed independently through the SAD pipeline before integration):** the four wire-ups; removal of "Edit Labels" and the `/settings/labels` page, with the page-heading pencil changed to a disabled "Not available yet" control; Objectives removed from the UI; the consistent "Not available yet" disabled state on every confirmed no-backend control; the two usability-bug fixes. No dead-code deletion is in scope this round.
- No migration is in scope this round. This Change Record is frontend only.

## 4. Verification

- QAD happy, sad and abuse tests for each wire-up, matched to the existing endpoint's DTO, route, method and permission gate.
- `csv-rbac.test.ts` still passes with the grant set unchanged; `settings.labels.manage` stays reserved and granted to no role.
- The page-heading pencil and "Edit Labels" no longer link to a dead `/settings/labels` page; the pencil is disabled with "Not available yet" for every role.
- Project creation: a Project Manager creates a project and lands on its page without a manual reload or an unauthorized redirect.
- Team edit: saving a project with no dates and no M&E Officer succeeds; a 403 shows the server's actual reason instead of a generic message.
- No disabled "Not available yet" control accepts input before reporting unavailability.
- `pnpm -r typecheck`, test and build scripts, and `pnpm docs:check` pass on the integrated change.
- SAD review passes against the final digest before sign-off. No migration-integrity or organization-isolation review is required this round, since no migration or new grant is in scope.

## 5. Disposition

Approved 2026-09-29. Mark Applied after implementation across the feature branches, SAD sign-off, `requirements-qa-gate` PASS and integration into `dev`. No migration is in scope. A working organization display-label editor, its API and its migration remain a candidate for a future, separate Change Record. The dead-code follow-up (F-16, F-17) stays open until its own Change Record.
