# PATHWAYS — Frontend-UI/UX → Backend-DB Integration TODO

**Canonical task location:** `docs/frontend-backend-integration/TODO.md`
**Rules:** `docs/frontend-backend-integration/Source of Truth.md`
**Progress rule:** Check an item only after evidence exists. Update this file at the end of every phase.

---

## Phase tracker

| Phase | Status | Acceptance | Next |
|---|---|---|---|
| P0 Context / Orientation | COMPLETE | PASS | Phase 1 was authorized |
| P1 Git Preflight & Controls | COMPLETE | PASS | Phase 2 authorization |
| P2 Frontend Standard Audit & Merge Map | COMPLETE | PASS | Phase 3 authorization |
| P3 Integration Branch & UI Merge | COMPLETE | PASS | Phase 4 authorization |
| P4 Backend Wiring & Missing Features | COMPLETE (repository/local) | PASS with managed 0021 apply gated | Explicit Phase 5 authorization |
| P5 Use-Case / Role / UI Regression | NOT STARTED | NOT RUN | P4 PASS + authorization |
| P6 Final Regression & GitHub PR | NOT STARTED | NOT RUN | P5 PASS + authorization |
| P7 PR Merge & Post-Merge Validation | NOT STARTED | NOT RUN | P6 PASS + explicit merge authorization |

---

## P1 — Git preflight and task controls

- [x] FB-P1-01 — Repository root/current branch/remotes verified: `C:/PATHWAYS`, `Backend-DB`, `origin` at GitHub PATHWAYS.
- [x] FB-P1-02 — Worktree status inventoried without discard/stash/reset: only the three untracked task-control files in this directory.
- [x] FB-P1-03 — `origin/Backend-DB` and confirmed `origin/Frontend-UI/UX` fetched and exact SHAs recorded in Source of Truth.
- [x] FB-P1-04 — Merge base `769e524fbdfa318ef9190747c1907744b1ea7b95` recorded; local and remote Backend-DB match exactly.
- [x] FB-P1-05 — Package/test/entry point/Playwright/GitHub workflow/migration/environment example inventory inspected read-only.
- [x] FB-P1-06 — Existing task Source of Truth/TODO/phase template reconciled with Phase 1 evidence.
- [x] FB-P1-07 — Deferred P07-W10 boundary and source identifiers checked read-only; no W10 mutation.

Phase 1 acceptance (2026-09-22): developer confirmed `origin/Frontend-UI/UX`
as authoritative; `git fetch origin --prune` succeeded. Local and remote
`Backend-DB` both equal `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`,
with no divergence. `origin/Frontend-UI/UX` equals
`a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`; merge base equals
`769e524fbdfa318ef9190747c1907744b1ea7b95`. The only worktree changes
are the three untracked task-control files. The repository's core
`docs/Source of Truth.md`, `docs/TODO.md`, and root phase-report template are
absent; these task controls remain separate. The W10 checkpoint remains
deferred. No integration branch, merge, commit, push, migration, or provider
write was performed. Phase 2 has not begun.

## P2 — Frontend standard audit and merge map

- [x] FB-P2-01 — Pinned frontend routes, shell, feature groups, styles, responsive patterns and interactive controls inventoried in Source of Truth section 11.
- [x] FB-P2-02 — Three-way diffs and non-mutating merge preview classified; 107 same-path overlaps recorded.
- [x] FB-P2-03 — Shared type/API-client and role-route contract conflicts classified in merge map.
- [x] FB-P2-04 — Runtime mock client, demo store/actions, seeded data and browser persistence separated from test fixtures.
- [x] FB-P2-05 — Missing backend/action matrix recorded with implementation and truthful temporary-state plans.
- [x] FB-P2-06 — Working provider MFA source located at Backend-DB `3c4f0eb` (`auth/mfa/page.tsx`, `mfa-form.tsx`); frontend prototype OTP identified.
- [x] FB-P2-07 — Accepted login/MFA/workspace/logout/denial redirect contract mapped; no source behavior changed.
- [x] FB-P2-08 — PM reads indicators but lacks create/update in frontend matrix, backend allowlist and migration 0013; exact discrepancy recorded before policy change.
- [x] FB-P2-09 — Frontend PIN `2468` located in dialog and prototype route; backend independent authorization and current step-up gap recorded.
- [x] FB-P2-10 — Source of Truth section 11 holds frontend standard, merge map, runtime mock and missing-backend matrices.

Phase 2 acceptance (2026-09-22): refreshed `Backend-DB`,
`origin/Backend-DB`, `origin/Frontend-UI/UX` and merge-base SHAs still equal
the Phase 1 pins. Latest frontend presentation is the UI/UX standard. The
provider-backed MFA source is located, and the PM indicator and beneficiary
step-up discrepancies are explicit. Only task-control files changed; no
application source, integration branch, merge, commit, push, migration, or
provider state changed. Phase 3 remains authorization-gated.

## P3 — Integration branch and frontend merge

- [x] FB-P3-01 — Integration branch created from approved Backend-DB head `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`.
- [x] FB-P3-02 — Pinned Frontend-UI/UX head merged with no blanket ours/theirs; merge commit `4dd96289bc1ab78eb24b02fca563ccc2a8ed881a`.
- [x] FB-P3-03 — Frontend presentation conflicts resolved in favor of latest UI; global CSS, Tailwind, UI primitives and brand assets match the pinned frontend head.
- [x] FB-P3-04 — Backend/domain/security conflicts preserve Backend-DB contracts; existing API clients adapted without backend permission or migration changes.
- [x] FB-P3-05 — Backend-DB provider MFA page/form and real auth implementation retained in the open merge.
- [x] FB-P3-06 — Login flow/redirects unchanged; existing MFA/OTP UI retained.
- [x] FB-P3-07 — Beneficiary PIN remains `2468`; the staged dialog does not grant access without server verification.
- [x] FB-P3-08 — No unrelated permission changes introduced; frontend access matrix/permission types restored to Backend-DB, and backend policy/migrations untouched.
- [x] FB-P3-09 — Missing backend actions tracked for P4 without fake success in Source of Truth section 12.
- [x] FB-P3-10 — Scoped merge checks pass: web/API/shared/imports typechecks, 561 web unit tests, production build, scoped Biome, diff and conflict checks.
- [x] FB-P3-11 — Local merge commit `4dd96289bc1ab78eb24b02fca563ccc2a8ed881a` recorded; not pushed.

Phase 3 acceptance (2026-09-22): `git fetch origin --prune` left all four pins
unchanged. The integration branch was created from approved Backend-DB head
`3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`. Local merge commit
`4dd96289bc1ab78eb24b02fca563ccc2a8ed881a` has that Backend-DB head and
pinned Frontend-UI/UX `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde` as its
two parents. Production frontend paths use existing real APIs or a truthful
unavailable state; retained demo modules and mocks are isolated test fixtures.
No permission, migration, managed provider, deferred W10, push or PR change
occurred. Web/API/shared/imports typechecks, 561 web unit tests, production
build, scoped Biome, staged diff and conflict checks pass. Phase 4 has not begun.

## P4 — Backend wiring and missing feature support

- [x] FB-P4-01 — Material merged controls traced by shared state transition through client, controller, authorization, service, persistence and UI result in Source of Truth section 15.
- [x] FB-P4-02 — Existing project/activity/collection/beneficiary/indicator/aggregate/user APIs retained; dedicated indicator UI uses the existing controller and client.
- [x] FB-P4-03 — Clear PM indicator policy gap corrected using the existing scoped indicator service, without UI design change or new domain schema.
- [x] FB-P4-04 — Undefined/unsafe actions keep truthful unavailable, disabled or no-save behavior; five-part decisions recorded in Source of Truth section 15.
- [x] FB-P4-05 — Runtime fake/mock domain paths remain absent from integrated production imports; test-only fixtures retained.
- [x] FB-P4-06 — Production-facing mock/prototype/demo wording remains absent; Phase 4 introduced no presentation copy change.
- [x] FB-P4-07 — PM `monitoring.read` retained and only `indicators.create/update` added; disposable RLS replay proves assigned project read/insert/update and foreign/revoked/other-role denial; M&E retained.
- [x] FB-P4-08 — OTP/login/redirect source and accepted flow untouched by the Phase 4 diff.
- [x] FB-P4-09 — Beneficiary PIN remains `2468`; server step-up still unavailable, so client PIN cannot disclose personal detail.
- [x] FB-P4-10 — Only append-only `0021_project_manager_indicator_access` added after 0020; SHA-256 `b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`; guarded disposable replay PASS; no managed apply.
- [x] FB-P4-11 — Web/API/shared typechecks, scoped Biome, 18 focused API and 76 focused web tests, and 21-migration disposable runtime replay PASS.
- [x] FB-P4-12 — Missing-feature trace and five-part recommendation records added to Source of Truth section 15.

Phase 4 local acceptance (2026-09-22): repository implementation PASS. The
only permission delta is Project Manager `indicators.create/update` within the
existing assigned-project guard; local runtime replay passed with 0021 and
cleaned its disposable target. Implementation commit:
`8ec83415696f43d96ec3353cd3815bd5d389cc8a`. No table/column/Prisma
model change, applied migration edit, managed PATHWAYS-dev/Auth/Storage
operation, frontend redesign, W10 mutation, push or PR occurred. Managed
deployment of 0021 requires separate authorization before this change can
work on PATHWAYS-dev. Phase 5
cross-role/use-case validation has not started and needs explicit authorization.

## P5 — Use-case, role, and UI regression

- [ ] FB-P5-01 — Latest Frontend-UI/UX visual/interaction fidelity verified on representative routes.
- [ ] FB-P5-02 — System Administrator flow regression passes.
- [ ] FB-P5-03 — Program Manager aggregate/privacy boundaries pass.
- [ ] FB-P5-04 — Grant Manager aggregate/privacy boundaries pass.
- [ ] FB-P5-05 — Project Manager project + indicator read/manage flow passes.
- [ ] FB-P5-06 — M&E workflow passes.
- [ ] FB-P5-07 — Project Officer workflow passes.
- [ ] FB-P5-08 — Login/MFA/workspace/logout/redirect regression passes.
- [ ] FB-P5-09 — Beneficiary PIN `2468` regression passes without auth bypass.
- [ ] FB-P5-10 — Persisted/reload/error states are truthful.
- [ ] FB-P5-11 — No runtime fabricated domain values found in integrated paths.
- [ ] FB-P5-12 — Every temporary missing-feature behavior/recommendation documented.
- [ ] FB-P5-13 — Integration-caused automated-test regressions resolved.

## P6 — Final regression and GitHub PR

- [ ] FB-P6-01 — Final lint/typecheck/test/build results recorded.
- [ ] FB-P6-02 — Changed-file/diff/security review passes.
- [ ] FB-P6-03 — No conflict markers/secrets/unrelated applied-migration edits.
- [ ] FB-P6-04 — Frontend-UI/UX and Backend-DB exact SHAs and integration commits recorded.
- [ ] FB-P6-05 — Integration branch pushed without force.
- [ ] FB-P6-06 — GitHub PR created into Backend-DB or exact manual PR action provided.
- [ ] FB-P6-07 — PR changed files/checks inspected.
- [ ] FB-P6-08 — PR remains unmerged pending developer authorization.

## P7 — PR merge and post-merge validation

- [ ] FB-P7-01 — PR head/base/required checks revalidated immediately before merge.
- [ ] FB-P7-02 — Developer explicitly authorizes PR merge.
- [ ] FB-P7-03 — PR merged into Backend-DB using approved non-destructive strategy.
- [ ] FB-P7-04 — Local Backend-DB fast-forwarded to merged remote head.
- [ ] FB-P7-05 — Post-merge typecheck/build/critical smoke tests pass.
- [ ] FB-P7-06 — Final Backend-DB SHA and PR merge identity recorded.
- [ ] FB-P7-07 — Task Source of Truth/TODO reconciled.
- [ ] FB-P7-08 — P07-W10 remains deferred/untouched.
- [ ] FB-P7-09 — Workstream final status accurately reported.

---

## Mandatory per-phase reporting rule

After each phase:
1. Update this TODO immediately.
2. Update task Source of Truth with new facts/evidence.
3. Read `PHASE_REPORT_TEMPLATE.md`.
4. Report its headings in chat only.
5. State whether the next phase is ready.
6. Stop for explicit developer authorization.

Do not create a filled phase-report file.
