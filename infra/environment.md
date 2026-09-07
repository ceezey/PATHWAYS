# Environment Variable Guide

## Recommended Naming
For personal local development, use `.env.local` files.

Recommended files:
- `.env.local`
- `apps/web/.env.local`
- `apps/api/.env.local`

Good to know:
- This repo also reads `.env` files, so `.env` still works if your team prefers that naming.
- Do not commit real secrets.

## Root Environment File
Use the root env file for shared local defaults that both apps can reuse.

Common shared values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `API_PORT`
- `API_PREFIX`
- `WEB_PORT`
- `ENABLE_SWAGGER`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN_API`

## Web Environment File
Frontend-specific values used by the Next.js app:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS`
- `NEXT_PUBLIC_SENTRY_DSN`
- `WEB_PORT`

## API Environment File
Backend-specific values used by the NestJS app:
- `API_PORT`
- `API_PREFIX`
- `ENABLE_SWAGGER`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `UPLOADS_BUCKET`
- `REPORTS_BUCKET`
- `PARTICIPANT_CARDS_BUCKET`
- `ASSETS_BUCKET`
- `SENTRY_DSN_API`

## Database URL Responsibilities

- `DATABASE_URL` is for NestJS and must use non-owner `pathways_runtime` after the security-adapter phase. The API startup guard rejects owner or elevated connections.
- `DIRECT_URL` is for Prisma migration commands and uses the approved migration/owner identity.
- Both approved PATHWAYS-dev connections use Supavisor Session Pooler port `5432`. The name `DIRECT_URL` describes migration responsibility; it does not imply a network-direct endpoint.
- `SHADOW_DATABASE_URL` must refer only to a disposable local PostgreSQL database. Never point it at Supabase, production, or a database containing data that must be preserved.
- Do not append `?schema=pathways` to the migration connection. The single Prisma ledger remains in `public`, while Prisma multi-schema mappings place domain tables in `pathways`.
- Enter passwords through a secure prompt or secret manager. Never commit complete database URLs.
- On Windows, the Phase 4 protected launcher reads the separate DPAPI runtime credential and supplies `DATABASE_URL` only to its child process, without editing either ignored env file. See `infra/supabase/security-adapter/README.md`. Old migration-owner env values are not safe runtime credentials.

## Notes
- The web app accepts Supabase client keys from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The frontend reserves `/auth/callback` for later redirect handling
- Prisma migration commands require the exact authorization in `docs/PHASE_TODO.md`; do not run migration, reset, or db-push commands as generic setup steps.
- The legacy seed is intentionally disabled. Canonical role and permission seeding is deferred to DBAdmin Phase 5.
- If you are unsure where a variable belongs, start with the root env file and move it into `apps/web` or `apps/api` only if it is app-specific
