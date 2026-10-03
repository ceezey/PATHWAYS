# Local development

Run the web and API on this machine against the hosted devV2 Supabase database and storage.

## Start

```
pnpm dev
```

- Web: http://localhost:3000 (`next dev`; changes hot-reload instantly).
- API: http://localhost:4000/api (`nest start --watch`; restarts a few seconds after a saved change).
- Health check: http://localhost:4000/api/health.

## How it connects

- The API reads `apps/api/.env`. Its `DATABASE_URL` uses the least-privilege `pathways_runtime` role on devV2.
- The web reads `apps/web/.env`, with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.
- `infra/supabase/security-adapter/dev-watch.mjs` blanks `DIRECT_URL`, `SHADOW_DATABASE_URL` and `PGPASSWORD`, so the running API never sees migration credentials. It also redacts secrets from the output.
- Data and uploads land in the hosted devV2 project, the same one the deployed site uses.

## Notes

- Only API changes restart the API; changes to `.env` need a manual restart (Ctrl+C, then `pnpm dev`).
- The old launcher that targets the legacy PATHWAYS-dev database is still available as `pnpm --filter @pathways/api dev:legacy-db`.
- Push to `dev` in batches. Each push starts two Vercel builds, and the free plan has a build rate limit.
- Docker (`infra/docker/docker-compose.yml`) builds production images with no live reload; use it only for a production-like check.
