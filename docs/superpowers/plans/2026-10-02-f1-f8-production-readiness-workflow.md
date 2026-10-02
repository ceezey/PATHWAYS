# F1-F8 Production Readiness Workflow

> **For agentic workers:** this is the phase roadmap. Each phase runs from its own detailed plan, listed under the phase. Use superpowers:subagent-driven-development or superpowers:executing-plans on that plan. Never execute this file directly as tasks.

**Goal:** Make F1-F8 fully functional, with UI that follows DSD and the Pathways interface foundations. Do this first with RBAC v4 live, then clear the release blockers (open items 1-3) so `master` is production ready.

**Architecture:** There are six phases in strict order. Phase 1 changes the grants that every later phase tests against, so it lands first. Phase 2 is a read-only QA re-run. Its findings become the task list for Phases 3 and 4, so those plans are written only after Phase 2 completes. Phase 6 is the release.

**Tech Stack:** NestJS API with Prisma, Next.js web, Supabase Postgres (role-staging `klbtoqdalmcsfjqophty`), PowerShell replay harness, Vitest, Playwright, and the SAD reviewer agents.

**Spec:** the open-items audit in this session (2026-10-02, items 1-11). Developer decisions from 2026-10-02:
- PO `beneficiaries.aggregates.read` is re-sourced to v4 reporting rows 112-117, not revoked.
- V4-C11 retires only the generic Encode Project Data screen. `submissions.write` stays for survey and activity-monitoring forms.
- Phase 2 re-runs the QA rather than trusting the 2026-10-01 audit.
- The UI authority is DSD plus the foundations. Figma is reference only.
- The collection workspace is split as well as token-aligned.
- Hosted migrations and R6 run under the standing auto-migrate rule (below).

## Global Constraints

- Follow `CLAUDE.md`:
  - concise code
  - one-sentence, one-line comments
  - no emojis
  - kebab-case markdown
  - `docs/activity-log.md` updated each phase
- Implementation subagents run on Sonnet. Reviewers keep their defined models.
- Git identity is `ceezey`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every migration is fix-forward. Never amend a file whose name may already be in any hosted ledger (0000-0054 are all on role-staging).
- The API starts only with `pnpm dev:local`. `pnpm --filter @pathways/api dev` targets hosted staging.
- The full replay is required only on branches that touch SAD migration trigger paths, and once before any staging apply. Other branches use vitest, lint, typecheck and targeted Playwright; CI still replays every push.
- Iterate on SQL with the saved template and `Invoke-RuntimeSql.ps1`; run `-SaveTemplate` once per migration change.
- One session owns the shared local Supabase DB at a time (`db:local:reset` and `db:local:demo` wipe it for everyone). Other sessions do code-only work in their own worktrees, and use `PATHWAYS_LOCAL_WEB_PORT` / `PATHWAYS_LOCAL_API_PORT` when they need a separate app stack.
- Release to `master` in small batches: run R1-R6 at the end of each phase rather than once at the end.
- Never stage `docs/ui-ux-pathways-reference/manage-budget/` or `docs/ui-ux-pathways-reference/rule-based-alerts-recommendations/`.
- Deferred features in `docs/deferred-features.md` stay out of scope. The one exception is the RBAC v4 grant migration row, which Phase 1 lands.
- **Standing auto-migrate rule (2026-10-02).** A migration may be applied to role-staging, and R6 may merge and push to `master`, without asking, only when both of these hold on the exact bytes:
  1. The full local replay and the migration's SQL and runtime suites are green.
  2. The SAD migration review has no blocking finding.

  Also required:
  - Precheck the hosted ledger first. Checksum drift or an unexpected predecessor stops the run.
  - A merge conflict stops the run.
  - R6 also needs every gate in BUILD section 2.2.

## Review Focus

1. **Stale permissions in live sessions.** A PO who was signed in before the v4 revoke must lose activity creation on the next request, not at their next login. Phase 1 Task 4 pins this with a workspace-resolution test.
2. **Survey capture after V4-C11.** Training-survey and activity-monitoring entry must keep working for PO and ME. Phase 1 Task 3 pins this.
3. **QA findings that cross features** (one gap touching F3 and F5, for example) must land in exactly one Phase 3 branch. Phase 2's output template gives each finding an owning feature.
4. **UI refactor regressions.** Splitting the collection workspace must keep every existing collection test green, with no deleted assertions. The Phase 4 plan must carry this as its first constraint.
5. **Hosted drift between phases.** Each phase's staging apply must precheck the ledger, because another session may have applied something. The rule above makes this a hard stop.

---

## Phase 0: Preflight (open items 7, 8)

Detailed plan: none (three checks, run inline).

Phase 0 no longer blocks Phases 2 and 4. It must pass before the first Phase 3 branch that adds a migration.

- [ ] Run `pwsh infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` on `dev`. Expected: exit 0, and every `=PASS` marker printed, including `P09_ROLE_ALLOWS_GRANTS_RUNTIME=PASS`. If it fails, finish the replay-harness work first. The auto-migrate rule cannot fire without a green replay.
- [ ] Item 7: run `pnpm db:local:reset` then `pnpm db:local:demo`. Expected: the `decisions` stage passes, because 0054 restored the grants. If it still returns 403, use superpowers:systematic-debugging before Phase 1.
- [ ] Item 8 decision: if the replay passed, schedule the replay-harness plan as a parallel, non-blocking branch (it touches no migrations). Otherwise it is now blocking.
- [ ] Append the results to `docs/activity-log.md` under 2026-10-02.

## Phase 1: RBAC v4 grant migration (open item 11)

Detailed plan: `docs/superpowers/plans/2026-10-02-rbac-v4-grant-migration.md`

Status 2026-10-02: 0055 is applied on role-staging (30 ledger rows, 312 grants) and merged to `origin/dev` 45d0657. Still open: the Playwright failures (28 passed, 24 did not run), and `test/rbac-v4-coverage`, which the RBAC session owns.

- Lands migration `0055_rbac_v4_grants`, then contract, policy, route and UI changes, and docs.
- Applied to role-staging under the auto-migrate rule.
- Exit gate:
  - role-staging ledger is 30 rows (0000-0055)
  - the v4 cells verify on the hosted database
  - `deferred-features.md` no longer lists the RBAC v4 grant migration

## Phase 2: F1-F8 QA re-run (open items 9, 10 baseline)

Detailed plan: none. This is a read-only review that produces `docs/audit-pathways-core-features-qa-20261002.md` (copy `docs/audit-template.md`).

- [ ] Dispatch `requirements-qa-gate` once per feature (F1 to F8, in parallel). Each gets the PRD charter gates `G-F<n>-*`, the QAD rows and the deferred register, and checks against `dev` after Phase 1.
- [ ] Dispatch `design-qa-agent` once for UI drift against DSD section 4 and the foundations. Scope: token use, spacing, typography, state patterns, and oversized files over 400 lines in `apps/web/src/features`.
- [ ] Merge the results into one audit with this table per finding: `ID | Feature | Gate or DSD rule | Evidence (file:line) | Severity | Owning branch`. One owning feature per finding.
- [ ] Commit the audit on `docs/core-qa-20261002`, then merge to `dev`.
- [ ] Run superpowers:writing-plans twice from this audit: Phase 3 functional gaps and Phase 4 UI consistency.

## Phase 3: F1-F8 functional gap closure (open item 9)

Detailed plan: `docs/superpowers/plans/2026-10-0X-core-gap-closure-2.md` (written after Phase 2).

- One branch per feature with findings: `fix/f<n>-<slug>`. Integrate through `integrate/core-features-2` as BUILD section 2.2 describes.
- Any new migration takes the next free number after 0055. It reaches staging only under the auto-migrate rule.
- Exit gate: every G-F1..G-F8 gate is Met in a re-check by `requirements-qa-gate`.

## Phase 4: UI consistency (open item 10)

Detailed plan: `docs/superpowers/plans/2026-10-0X-ui-consistency.md` (written after Phase 2).

- The first task splits `apps/web/src/features/collection/collection-workspace.tsx` into focused files with no behavior change. All collection tests stay green with assertions unchanged.
- Later tasks fix each Phase 2 DSD drift finding, one task per screen family.
- Exit gate: `design-qa-agent` re-check shows no open drift finding for F1-F8 screens. Lint, typecheck, test and Playwright are green.

## Phase 5: Open CR closures (open items 4, 5, 6)

Detailed plan: none (doc and verification edits, one branch `docs/cr-closures-20261002`).

- [ ] Item 4: `docs/cr-pathways-self-managed-rollout-scenarios.md` section 3 names PATHWAYS-dev. Replace it with PATHWAYS-role-staging (`klbtoqdalmcsfjqophty`), and note that PATHWAYS-dev is retired later.
- [ ] Item 5a, import value map: once Phase 3 passes the release gates, set `docs/cr-pathways-import-value-map.md` to Applied, with evidence.
- [ ] Item 5b, performance scaling: re-measure G-F8-7 on role-staging using the QAD-T62 procedure. Record the numbers in QAD-T62 and set `docs/cr-pathways-performance-scaling.md` to Applied if the numbers pass. Otherwise open a Phase 3 finding.
- [ ] Item 6: change `docs/cr-pathways-signin-lockout.md` section 9 to the Free-plan wording. App sign-in is protected by the API lockout. Direct `/auth/v1/token` calls rely on Supabase rate limits. The hook is inert on the Free plan, and CAPTCHA is the documented alternative.
- [ ] Run `pnpm docs:check` on a clean export, then merge to `dev`.

## Phase 6: Release (open items 1, 2, 3)

Detailed plan: none. This is the release-integrator R1-R6 sequence in BUILD section 2.2.

- [ ] Item 2, MA-01..MA-17:
  - For each finding in `docs/audit-pathways-manuscript-alignment-20261001.md`, record Closed (with the commit), Scheduled (with the plan) or Descoped (with a CR).
  - Commit the update.
  - Production is blocked until no finding is unassigned.
- [ ] Item 3: redeploy the pathways-api dev preview at the `dev` head. Confirm READY for both pathways-api and pathways-web. If the Vercel 100-deployments-a-day limit is hit, wait for the reset. Never batch-redeploy.
- [ ] Item 1, R6 preconditions:
  - role-staging seeded
  - Vercel Preview and Production env vars point at `klbtoqdalmcsfjqophty`
  - dev preview smoke checks pass on role-staging
- [ ] Run R6 under the auto-migrate rule:
  - all gates in BUILD section 2.2
  - `sad:signoff` PASS
  - requirements QA PASS
  - both previews healthy

  Merge `dev` into `master` and push as `ceezey`. Never force-push.
- [ ] Record the release in `docs/activity-log.md` and `docs/state.md`.
