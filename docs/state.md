# PATHWAYS Operating Position

Updated: 2026-09-26. Registry and statuses live in `index.md`.

## Milestone

Core Must features (PRD-F1 to PRD-F8) implemented on `Backend-DB`/`master`. Vercel API/web release authorized; runtime verification pending.

## Open signals

- API binds IPv4 loopback only; Vercel runtime listener policy not yet reviewed (OPS open items).
- PRD-F10 to PRD-F13 have schema but no backend API.
- Env schema/templates lag OPS (`SUPABASE_PUBLISHABLE_KEY`, `ENABLE_SWAGGER`, stale `SUPABASE_JWT_SECRET`).
- CI does not run on `Backend-DB` pushes.

## Assumptions

- `master` deploys; `Backend-DB` develops.
- SSO and AWS hosting stay deferred.
- No runtime AI/ML feature is approved.
