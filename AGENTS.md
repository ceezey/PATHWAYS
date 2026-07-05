# AGENTS.md

Codex and other coding agents must follow these project rules:

- Before frontend GUI work, read `docs/GUI_IMPLEMENTATION_TODO.md`.
- Use `docs/design/GUI.pdf` as the visual reference for GUI implementation phases.
- Preserve the frontend-only boundary unless the user explicitly changes scope.
- Use "beneficiary" in new visible UI text.
- Do not recreate shared components or shell pieces that already exist.
- Update `docs/GUI_IMPLEMENTATION_TODO.md` at the end of every frontend phase.
- Run the repository's actual checks for the changed scope and report failures plainly.
- Do not commit, push, merge, migrate the database, modify Prisma schemas, change Supabase configuration, or modify production authentication unless explicitly requested.

Detailed GUI progress, baseline status, phase scope, and handoff notes belong in `docs/GUI_IMPLEMENTATION_TODO.md`.
