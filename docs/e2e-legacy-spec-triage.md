# E2E legacy spec triage

Scope: Playwright specs in `apps/web/e2e` that relied on the retired demo switcher (`/review/demo-controls`, `pathways.demo.v1`), prototype session keys or `/login`. Live-feature checks used `apps/web/src/app` routes and `docs/cr-pathways-rbac-v4-adoption.md`. Deleted specs stay recoverable from git history (the parent of the triage commit).

demo-state check: `apps/web/src/lib/demo-state` is not imported by any app route or component. Only `src/mocks/pathways/*`, its own files and unit tests import it; `mocks/pathways` is itself imported only by unit tests and `demo-state/store.ts`. The switcher and prototype session keys are gone from app source, so all demo-seeded e2e data (`futuremakers-ncr`, `ben-001`, `act-fm-02`) must be replaced by rows from `apps/api/prisma/local-demo-seed.ts`.

Verdict key: Task 3 = role smoke (`smoke.spec.ts`), Task 4 = collection/activities workflows (`workflows.spec.ts`), Task 5 = `beneficiary-access.spec.ts`. "verify" = feature or v4 role grant not confirmed. A deleted spec has its live assertions listed below; "keep" means the spec stays until its replacement lands.

| File | Covered | Verdict |
|---|---|---|
| demo-foundation | local login, profile propagation, audit, role denial, reset | delete; port to Task 3 |
| demo-activity-status-form | five activity statuses persist | delete; port to Task 4 |
| demo-dashboard-customization | saved monitoring charts per project | delete; Task 3 verify |
| demo-post-handoff-followup | journey stages, evidence decision, extension queue | keep until replaced; Task 4 |
| demo-post-handoff-ui | relocated controls on alerts, projects, ben-001 | delete; split Task 4 and 5 |
| demo-project-refinements | team reassignment, create-project, status filter | delete; port to Task 4 |
| demo-systemrevision-phase2 | role KPI dashboards, labels, project entry | delete; port to Task 3 |
| demo-systemrevision-phase3 | activity panel, proof chain, expense log | delete; port to Task 4 |
| demo-systemrevision-phase4 | budget and indicator access, M&E score, journey stages | delete; Task 3 and 4 |
| demo-systemrevision-phase5 | beneficiary step-up, directory, record access | delete; port to Task 5 |
| demo-systemrevision-phase6 | analytics, alerts review, reports, rules | delete; Task 3 verify |
| demo-systemrevision-phase7 | tablet overflow sweep | delete; Task 3 verify (one sweep) |
| demo-ui-cleanup | formal dashboard copy, metric hover | delete; Task 3 verify |
| demo-workflows | expenses, draft resume, step-up, downloads, backups | keep until replaced; Task 4 and 5 |
| i01-frontend-shell | role and scope shell, sign out, narrow nav | delete; port to Task 3 |
| i02-frontend-account-profile | recovery, reset states, own profile | delete; Task 3 verify |
| i03-i14-frontend-coverage | admin preview surfaces, audit filter, duplicates, backups | delete; Task 3 verify |
| integration-phase5-public | login form widths, public outage state | delete; covered by password-login and phase5 |
| p5-c1 | login rejection retry, step-up outage, announcements | delete; Task 5 and 4 |
| p5-c2 | landmarks, required errors, dialog bounds | delete; Task 3 verify |
| p5-c3 | import file mapping and retry | delete; port to Task 4 |
| p5-c4 | project nav, beneficiary errors, clear filters, activity options | delete; Task 4 and 5 |
| p5-c5 | demo-account picker, draft recovery, dirty-exit | delete; Task 4 verify |
| p5-c6 | responsive header, tooltips, sidebar, titles, motion | delete; Task 3 verify |
| phase4 | team selectors, budget modify, activity status | delete; port to Task 4 |
| phase4-final | UC entry points, dashboard, downloads, backups | keep until replaced; Task 3, 4 |
| phase5 | public routes and staff auth presentation | keep until replaced; public, no sign-in |
| smoke | full role sweep | rewritten on real sign-in (Task 3); non-smoke assertions dropped or moved to Tasks 4 and 5 |

Dropped everywhere: the demo-account picker (p5-c5), "role preview switches" and "browser-local" profile/user storage assertions, the `Encode Project Data` entry (`/collection/entry` now redirects, V4-C11), and any assertion keyed to demo seed ids.

## Task 3 live assertions (role smoke)

- Each role (SA, PO, ME, PM, PG, GM) lands on `/dashboard` with its own KPIs and Review/Resolve destinations (phase2); expectations per v4 doc, not old demo.
- Sidebar destinations open without dead end per role; mobile sidebar closes after opening (smoke, i01).
- Shell shows truthful role and scope; sign out clears the session (i01).
- Role denial: SA reaches audit and users; other roles get `/unauthorized` where v4 denies (demo-foundation, smoke).
- Budget and Target Indicators only for approved roles (phase4); PO has no `activities.create`, no dashboard customize, no SADDD (V4-C07, C09, C10).
- GM is aggregate-only; PG and GM stay outside beneficiary records (smoke, phase5).
- SA edits page headings in place at `/settings/labels`; others cannot open label settings (phase2, smoke).
- User management scope: SA and PG manage allowed roles only; PM stays in managed projects; others have no controls (smoke).
- verify: dashboard chart customization per project; analytics location coverage; alert reviewed-not-resolved; alerts repository view-only; report type dropdown and preview; recovery and reset pages (`/staff/reset-password`); profile edit (`/settings/profile`); audit filter (`/settings/audit`); duplicates (`/beneficiaries/duplicates`) and backups (`/settings/backups`) non-destructive; landmarks, one h1, skip link; tablet overflow (one sweep, not per module); privacy-safe page titles.

## Task 4 live assertions (collection and activities workflows)

- Activity status form offers the five statuses, persists, and the summary filters the list for every status (activity-status-form, refinements, phase4).
- Activity create/edit offers only project-scoped relationship options; PO cannot create (V4-C07, verify) (p5-c4, phase4).
- Project team reassignment is scoped, persists, hidden from disallowed roles; create-project omits Budget code (refinements, phase4).
- Budget: modify allocation cancels safely and recomputes; expense logged from the activity panel and validated through the chain (phase3, phase4, phase4-final).
- Proof chain PO to M&E to PM keeps the exact proof version; evidence review uses one decision dropdown plus Save (phase3, followup).
- Journey stages are sequential, consolidated, with four safeguarded actions (followup, phase4).
- PO extension request reaches the PM dashboard queue; PO opens activity details from the dashboard (followup).
- `/collection/entry` redirects to `/collection` (followup).
- M&E score shows stored overall, four dimensions, dated history (phase4, followup).
- Collection import blocks invalid/unmapped files, proceeds on resolved mappings, supports retry (p5-c3).
- Form and report downloads are real files; draft resume (demo-workflows, phase4-final).
- Settled results announce without moving focus (p5-c1); clear-all resets filters (p5-c4).
- verify: Target Indicator atomic Add/Edit modal (phase4 LC-04B); dirty-exit and draft recovery on project/activity editors (p5-c5); publication/public projection and backup failure (demo-workflows I09).

## Task 5 live assertions (beneficiary access)

- Beneficiary directory is a compact list with whole-row keyboard navigation and safe return context (phase5 LC-05A).
- Step-up gates every beneficiary entry; cancel, retry, direct-link resume, role change (phase5 Ref17, demo-workflows I05, p5-c1); keep the `fixtures/step-up.ts` stub only if the real flow cannot be driven.
- Direct record access is project-scoped; aggregate-only roles (PG, GM) stay outside records (phase5, smoke).
- Record tabs: Media Proof and Participation History, unlinked notes preserved (phase5 LC-05C).
- Journey selection is inline with no journey modal (phase5 LC-05B).
- Beneficiary submission shows complete associated errors and keeps entered data (p5-c4).
- Step-up outage keeps safe input and focus and reveals no record (p5-c1).
- verify: relocated controls on a record (post-handoff-ui); media review and local previews (smoke); SA opens records across projects (smoke).

## Task 3 outcome

Landed in `smoke.spec.ts`: per-role landing and exact primary nav (six roles), SA reaches users and audit while PO is denied users, audit and labels, mobile sidebar closes after opening. Dropped as unconfirmed or out of smoke scope: dashboard chart customization (deferred, row 97), analytics location coverage, alert reviewed-not-resolved, report type dropdown, recovery and reset pages, profile edit, audit filter, duplicates and backups, landmarks and skip link, tablet overflow sweep, privacy-safe titles, in-place heading edit, user-management scope controls, label editing, shell sign out; each needs its own v4 grant check and belongs to a later pass. Public-page tests moved to the `phase5` spec; beneficiary and project-scope tests to Tasks 4 and 5.

## Task 4 outcome

Landed in `workflows.spec.ts`: PO submits an update and proof (activity created and started through the API per run, then `Proof v1 · Submitted`), PM creates an activity through the dialog (persistence checked in the database; the dialog also shows only the project's officers), PG and GM read activities with no New Activity, Edit, Archive or Submit Update & Proof. Already covered by `rbac-v4.spec.ts`: `/collection/entry` redirect, no Encode link, PO has no New Activity, PM sees New Activity. There is no activity archive control in `apps/web/src`, so the archive check only asserts absence. Dropped as unconfirmed or out of this pass, each needing its own v4 grant check or seed data: five-status form and summary filtering, team reassignment and create-project, budget modify and expense log, M&E-to-PM proof chain and decision dropdown, journey stages, extension request queue, M&E score history, collection import, downloads and draft resume, settled-result announcements, clear-all filters, Target Indicator modal, dirty-exit and draft recovery, publication and backup failure.

## Task 5 outcome

Landed in `beneficiary-access.spec.ts` (real sign-in, one local beneficiary and two journey stages seeded per database): SA, PG and GM are denied the directory and a direct record; PO is gated by step-up, a rejected code reveals nothing, and Back to dashboard leaves; PO opens a record by keyboard from the directory, sees the Journey tracking, Media proof and Participation history tabs, and returns with the search context; PM resumes a direct record link after step-up and selects a journey stage inline with no dialog; a step-up check outage shows no record and recovers on retry. Real sign-in is itself a fresh TOTP step-up for 15 minutes, so the gate is made to appear by reporting step-up status as stale until the browser verifies a real code; `fixtures/step-up.ts` was deleted as unused. `phase5.spec.ts` was deleted: its public-route and staff login presentation checks depended on demo seed ids (`futuremakers-ncr`), the prototype session, and the retired `Log In` form, and are not assigned to a later task. Dropped: unlinked notes preserved and participation history content (no seeded journey events), step-up cancel and role-change variants beyond Back to dashboard, beneficiary submission errors with kept data (registration needs a published form), relocated controls on a record, media review and local previews, SA opening records across projects (SA has no `beneficiaries.records.read`, so the v4 expectation is denial).
