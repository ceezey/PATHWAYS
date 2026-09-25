# Runbook — Documentation Reconciliation

## Goal

Keep docs from silently drifting behind the repository.

## Steps

1. Enumerate docs and root materialized artifacts.
2. Compare `docs/index.md` registry to filesystem.
3. Check Locked docs' Last Reconciled date against recent changes in their area.
4. Diff `docs/build-pathways.md` and root `AGENTS.md`.
5. Verify PRD IDs referenced by SDD/RFC/QAD exist.
6. Verify PRD/SDD/RFC/DSD/QAD implementation claims against code/tests.
7. Verify Locked documentation still matches current repository behavior.
8. Record findings in an audit.
9. Close material findings through Change Records or explicit deferral.
10. Update `docs/index.md` Health Check.

Do not rewrite old Change Records/audits to hide drift.
