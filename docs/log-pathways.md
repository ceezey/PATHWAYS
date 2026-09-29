# Build Session Log (LOG)

**Append-only.**

Do not rewrite old entries to make them match newer architecture. Correct prior assumptions through a new dated entry and, where material, a Change Record.

## 2026-09-26: Curated AI Workflow Adoption

- Performed read-only review of the supplied ArkiLaunch repository.
- Adopted its useful workflow mechanisms:
  - manifest/control panel;
  - document statuses;
  - stable PRD IDs;
  - traceability;
  - Change Records;
  - audits as evidence;
  - canonical BUILD -> AGENTS materialization;
  - Health Check;
  - restraint rules.
- Curated all domain content for PATHWAYS rather than copying ArkiLaunch's construction-rental assumptions.
- Kept phase/task TODOs, temporary source-of-truth notes, prompts, and report templates disposable and outside the repository.
- Kept deployment/SSO/AWS work deferred.
- Preserved the six-role model including Grant Manager.
- Preserved the deterministic/no-autonomous-AI boundary.

## Friction / Open Work

- Generated SDD/DSD/QAD are Working until reconciled with the current PATHWAYS repository.
- Historical manuscript/Master Context Pack implementation-status statements may be stale; verified code wins.
- Manual documentation reconciliation remains necessary until repository tooling is added.

## 2026-09-26: Deployment Branch Policy

- Developer designated `origin/master` for deployment and `Backend-DB` for development.
- Authorized the connected Vercel `pathways-api` and `pathways-web` projects (recorded in the index Change Log and OPS).
- SSO and AWS hosting remain deferred.

## 2026-09-26: Documentation Reconciliation

- Added `scripts/docs/check.py` (`pnpm docs:check`) and `scripts/docs/materialize.py` (`pnpm docs:materialize`); this supersedes the manual-only note above.
- Restructured the DSD into sections 0-9 so `BRAND.md`/`DESIGN.md` are generated; unique brand/design content was folded into the DSD first.
- Reconciled SDD tables, QAD traceability, rules RFC, and OPS with the repository; recorded API listener, env schema, Swagger default, CI trigger, and engines gaps as OPS open items.
- Dropped the `AGENT.md` pointer; registered `README-setup.md`, historical `design-qa.md`, and `state.md`.
