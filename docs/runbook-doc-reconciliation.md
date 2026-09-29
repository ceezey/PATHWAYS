# Runbook: Documentation Reconciliation

## Goal

Keep docs from silently drifting behind the repository.

## Steps

1. Run `pnpm docs:check`. It covers the mechanical checks: registry vs filesystem, em-dash/voice rules, PRD IDs referenced by SDD/RFC/QAD, and Locked docs' Last reconciled date.
2. Run `pnpm docs:materialize`; `git diff` on `AGENTS.md`, `BRAND.md`, `DESIGN.md` must be empty unless the build guide or DSD changed.
3. Check each Locked doc's Last reconciled date against recent changes in its area.
4. Update `docs/state.md` with the current operating position.
5. Confirm the index backend-status column still matches the API controllers.
6. Verify PRD/SDD/RFC/DSD/QAD implementation claims against code/tests.
7. Verify Locked documentation still matches current repository behavior.
8. Record findings in an audit.
9. Close material findings through Change Records or explicit deferral.
10. Update `docs/index.md` Health Check.

Do not rewrite old Change Records/audits to hide drift.
