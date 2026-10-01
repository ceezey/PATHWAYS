# Build Session Log (LOG)

**Status:** Control; append-only
**Owner:** PATHWAYS capstone team

Do not rewrite old entries to make them match newer architecture. Correct prior assumptions through a new dated entry and, where material, a Change Record. The one exception is recorded in the 2026-10-01 entry.

## 1. Action log

### 2026-09-26: Curated AI Workflow Adoption

- Performed a read-only review of the supplied reference repository.
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
- Curated all domain content for PATHWAYS rather than copying the reference repository's domain assumptions.
- Kept phase/task TODOs, temporary source-of-truth notes, prompts, and report templates disposable and outside the repository.
- Kept deployment/SSO/AWS work deferred.
- Preserved the six-role model including Grant Manager.
- Preserved the deterministic/no-autonomous-AI boundary.

### 2026-09-26: Deployment Branch Policy

- Developer designated `origin/master` for deployment and `Backend-DB` for development.
- Authorized the connected Vercel `pathways-api` and `pathways-web` projects (recorded in the index Change Log and OPS).
- SSO and AWS hosting remain deferred.

### 2026-09-26: Documentation Reconciliation

- Added `scripts/docs/check.py` (`pnpm docs:check`) and `scripts/docs/materialize.py` (`pnpm docs:materialize`); this supersedes the manual-only note in the friction section.
- Restructured the DSD into sections 0-9 so `BRAND.md`/`DESIGN.md` are generated; unique brand/design content was folded into the DSD first.
- Reconciled SDD tables, QAD traceability, rules RFC, and OPS with the repository; recorded API listener, env schema, Swagger default, CI trigger, and engines gaps as OPS open items.
- Dropped the `AGENT.md` pointer; registered `README-setup.md`, historical `design-qa.md`, and `state.md`.

### 2026-10-01: Canonical Documentation Reconciliation

- Rebuilt the documentation suite into one canonical baseline under [cr-pathways-doc-reconciliation-2026-10-01](cr-pathways-doc-reconciliation-2026-10-01.md): repository first, then the rev-2026 manuscript, then the new brand, color and UI foundations as design target only.
- Stable IDs, CR and RFC filenames and migration numbers were preserved; contradicted records were superseded, not deleted.
- Added the manuscript alignment audit and the AWS hosting migration RFC (Draft); registered both in the index.
- Rewrote this log, the index and the README on the new structure. One-time exception to append-only: the earlier entries were regrouped under the Action log with neutral wording and every dated fact and its order preserved.
- No code, migration or agent behavior changed.

## 2. Friction

- Generated SDD/DSD/QAD were Working until reconciled with the current PATHWAYS repository; the 2026-10-01 reconciliation moved them to Locked.
- Historical manuscript/Master Context Pack implementation-status statements may be stale; verified code wins.
- Manual documentation reconciliation was necessary until repository tooling was added (see the 2026-09-26 Documentation Reconciliation entry).

## 3. Lessons

- Verified repository facts beat manuscript statements about current behavior.
- Keep disposable workflow artifacts out of the repository.
- Regenerate materialized files with `pnpm docs:materialize`; never hand-edit them.

## Self-Check

- [x] Every prior dated entry is preserved in its original order.
- [x] The 2026-10-01 entry cites the Change Record and the one-time append-only exception.
- [x] No credentials, personal data or environment values.
