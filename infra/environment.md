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
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DEV_ADMIN_EMAIL`
- `DEV_ADMIN_SUPABASE_ID`
- `UPLOADS_BUCKET`
- `REPORTS_BUCKET`
- `PARTICIPANT_CARDS_BUCKET`
- `ASSETS_BUCKET`
- `SENTRY_DSN_API`

## Notes
- The web app accepts Supabase client keys from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The frontend reserves `/auth/callback` for later redirect handling
- Prisma migration and seed commands require real Supabase Postgres credentials
- If you are unsure where a variable belongs, start with the root env file and move it into `apps/web` or `apps/api` only if it is app-specific