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

- [x] FB-P5-01 — Pinned UI theme/primitives unchanged; built desktop/mobile login and public states visually inspected. Protected route/MFA interactions checked in browser fixtures; intentional differences remain documented.
- [x] FB-P5-02 — System Administrator route and user-policy boundaries pass at local fixture/API scope; live provider transaction is outside this authorization.
- [x] FB-P5-03 — Program Manager route and aggregate/privacy policy boundaries pass at local fixture/API scope; no raw detail grant added.
- [x] FB-P5-04 — Grant Manager route and aggregate/privacy policy boundaries pass at local fixture/API scope; no user-management grant added.
- [x] FB-P5-05 — Project Manager route and assigned-project indicator read/manage pass in disposable 0021 RLS replay and web/API tests; managed 0021 rollout remains separately gated.
- [x] FB-P5-06 — M&E route, import review/process and indicator policy pass at local fixture/API/database scope.
- [x] FB-P5-07 — Project Officer route, proof/participation and import upload boundaries pass at local fixture/API scope.
- [x] FB-P5-08 — Login, retained MFA/TOTP, workspace, logout, revocation and redirect fixtures pass; live Auth transaction remains untested.
- [x] FB-P5-09 — PIN `2468` gate and no protected-content bypass pass in browser fixture and local API policy tests.
- [x] FB-P5-10 — Local disposable persistence/RLS, client reload, stale-result and error-state tests pass; unsupported actions remain no-save.
- [x] FB-P5-11 — Production import scan finds no `mocks`/`demo-state` path; built public page has no fabricated project.
- [x] FB-P5-12 — UC001–UC026 matrix records 17 PARTIAL, 9 DEFERRED and D01–D20 discrepancies with temporary behavior in task Source of Truth.
- [x] FB-P5-13 — Header-only XLSX parser and migration inventory regressions repaired; focused/full suites pass. Changed-file Biome passes; root lint retains three untouched Phase 7 formatter findings.

Phase 5 local/isolated acceptance (2026-09-23): PASS within the expressly
authorized repository scope. The manuscript PDF is pinned by path and SHA-256
in Source of Truth section 16 and was not added to Git. No UC is claimed as
complete end-to-end: 17 are PARTIAL and 9 DEFERRED. Full web/shared/API/imports
tests, 39 focused browser fixtures, two built-page desktop/mobile production
smokes, all-package typecheck/build, changed-file Biome and guarded disposable
0021 replay pass. Root lint still fails only in three untouched Phase 7
scripts. No managed Auth/Storage/database operation, W10 mutation, push or PR
occurred. Phase 6 remains authorization-gated; managed 0021 rollout needs
separate approval before PATHWAYS-dev PM indicator verification.

## P6 — Final regression and GitHub PR

- [x] FB-P6-01 — Final typecheck/test/build/Prisma/Playwright/disposable replay pass; root lint retains only three untouched Phase 7 format findings; all 271 changed code/config files pass Biome.
- [x] FB-P6-02 — Three-way UI, approved RBAC/migration, runtime mock, diff and security-sensitive path review passes; no unapproved redesign or policy delta found.
- [x] FB-P6-03 — Diff whitespace/conflict checks and filename/content secret-pattern scan pass; no applied migration edit or W10 deviation.
- [x] FB-P6-04 — Exact Backend-DB/Frontend-UI/UX heads and ancestry-preserving merge, Phase 4 implementation and Phase 5 validation commits recorded in Source of Truth section 17.
- [x] FB-P6-05 — Integration branch pushed normally with upstream tracking; remote branch was absent before push and no force was used.
- [x] FB-P6-06 — GitHub PR #5 created into `Backend-DB`: https://github.com/ceezey/PATHWAYS/pull/5.
- [x] FB-P6-07 — GitHub base/head and all PR files inspected. `validate` exposed a pre-existing replay database-name mismatch, malformed Bash SQL quoting, and a CRLF/LF 0001 checksum mismatch against 0006's pinned applied history. Isolated replay, exact Bash argument, and disposable-staging hash probes pass after narrow workflow corrections.
- [x] FB-P6-08 — PR #5 remains open and unmerged; GitHub replay, secret check and Prisma gate pass on the corrected head. GitHub stops at lint; the local equivalent reports three untouched Phase 7 formatter files. Phase 7 merge remains authorization-gated and requires an up-to-date check decision.

Phase 6 pre-push gates (2026-09-23): PASS at the authorized local/isolated
scope. The only worktree item before pushing is the untracked developer PDF,
which is excluded from the PR. The remote integration branch did not exist at
preflight. A normal push and PR creation are explicitly authorized; Phase 7
merge remains authorization-gated.

Phase 6 PR handoff (2026-09-23): PR #5 is open into `Backend-DB` and unmerged.
The developer's untracked manuscript PDF remains excluded from the PR. GitHub
reported 284 changed files. The first `validate` failed at the CI disposable
migration replay: migration 0006 rejects the workflow's original database
name, while the permitted name passes all six migrations and postflight in
isolated local reproduction. The ten-reference name correction was pushed
without changing the migration guard. Its GitHub rerun exposed malformed Bash
quoting in the same step's SQL postflight; a corrected-line argument probe
passes. Checkpoint annotations from the next GitHub run located a deeper
migration 0006 failure: 0001's committed LF bytes differ from the applied
CRLF checksum pinned in 0006. The CI workflow now restores the original bytes
only in the disposable staging copy and verifies the expected SHA-256. No
committed migration or managed database was changed. On the corrected PR head
`6ba72e95e7f07698b046e93c830256b3666d2197`, GitHub passed the full
disposable migration replay, Prisma and committed-secret steps, then failed
root lint. The three formatter findings are all in untouched Phase 7 scripts
outside this integration diff. CI typecheck/test/build were skipped after
lint; their local Phase 6 runs passed. Phase 6 source, normal push and PR
handoff are complete with this documented pre-existing CI gate failure.
Revalidate exact base/head and required checks, and resolve or explicitly
accept the unrelated lint findings before any separately authorized Phase 7
merge.

### Pre-Phase-7 CI lint closure (2026-09-23)

- [x] FB-P6-L01 — Reproduced exactly three formatter-only failures in the three recorded Phase 7 scripts; no additional or semantic lint finding.
- [x] FB-P6-L02 — Ran repository Biome only on `Run-C8FixturePreflight.mjs`, `Run-C8Postflight.mjs`, and `Run-C8Preflight.mjs`; diff is formatting-only.
- [x] FB-P6-L03 — Scoped Biome and root `pnpm lint` pass; local typecheck, tests, build, and Prisma validation pass with recorded counts.
- [x] FB-P6-L04 — Separate lint-only commit `c119c125f4962bf67f48113297402ca2161b1f19` pushed normally to PR #5; PR remains open and unmerged.
- [x] FB-P6-L05 — Added a package-local Vitest alias for the exact `@pathways/shared` source import; imports tests pass without `packages/shared/dist`, and GitHub lint/typecheck/Prisma/replay/secret/test/build checks all pass on fix commit `a29c5fe898d89b5154716506082a2c30e6cd5f7b`.

Pre-Phase-7 CI closure result: PASS. The separately authorized
fresh-checkout test-resolution fix changes only the imports Vitest resolution
configuration, with no runtime package-export or build-order change. GitHub's
complete validation workflow is green. No Phase 7 item is complete or
authorized; PR #5 remains open and unmerged.
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
