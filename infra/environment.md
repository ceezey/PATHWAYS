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

### Stage 3 D1 workspace candidates (Prototype-only, server-side)

The approved rollout supports only the designated development Auth identity and
zero or one database-verified workspace. It does not add membership rows, an
administrator role, a chooser, production access, or an RLS bypass.

`apps/api/src/modules/auth/workspace-resolution.service.ts` requires all of:

- `NODE_ENV=development`, the exact already-approved `SUPABASE_URL`, and the
  existing separately reviewed `PATHWAYS_DEVELOPER_ACCESS_ENABLED=true` gate;
- `PATHWAYS_DEVELOPER_WORKSPACE_RESOLUTION_ENABLED=true` (default: `false`);
- server-only `PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES`: a JSON array of strict
  `{ "authUserId": "<approved-existing-auth-subject>", "organizationId": "<existing-organization-id>", "userId": "<existing-system-user-id>" }`
  candidates from reviewed provisioning evidence. Replace placeholders privately;
  do not paste identifiers or credentials into chat. No `NEXT_PUBLIC_` equivalent.

Use the ignored `apps/api/.env.local` or the protected launcher's parent process
environment; restart the API through `infra/supabase/security-adapter/Start-DevRuntime.ps1`
using its existing documented invocation and dedicated non-owner runtime credential.
The launcher runs the compiled API: rebuild after code changes. Do not run a
migration or use a migration-owner/service-role credential for discovery.

The candidate array is bounded to eight entries/8192 characters. Duplicates,
unknown fields, malformed identifiers, a foreign subject, unapproved environment,
missing configuration, or multiple validated profiles return a sanitized unavailable
response. An explicit `[]` or candidates rejected by current RLS/profile/permission
checks return zero workspaces, which denies entry. Configuration never grants
membership; every selected protected request repeats database validation.

As of the Stage 3 implementation pass, no candidate configuration or opt-in flag
was found in the existing root/API environment files; parent/runtime process
configuration is unverified. No environment file was modified. Before live
verification, obtain approval for the separate `apps/api/src/app.module.ts` logging
redaction gap recorded in `docs/SOURCE_OF_TRUTH.md`. Do not enable access solely to
make a test pass, invent identifiers, or provision a user under this configuration step.

### Existing environment notes

- The web app accepts Supabase client keys from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The frontend reserves `/auth/callback` for later redirect handling
- Prisma migration commands require the exact authorization in `docs/PHASE_TODO.md`; do not run migration, reset, or db-push commands as generic setup steps.
- The legacy seed is intentionally disabled. Canonical role and permission seeding is deferred to DBAdmin Phase 5.
- If you are unsure where a variable belongs, start with the root env file and move it into `apps/web` or `apps/api` only if it is app-specific
