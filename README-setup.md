# PATHWAYS Setup

How to get PATHWAYS running on your machine. For what the product is, read [README.md](README.md); for day-to-day rules and the fast test runners, read [docs/runbook-local-dev.md](docs/runbook-local-dev.md).

## What Is In This Repo

PATHWAYS is a pnpm monorepo: one repository holding the web app, the API and the code they share.

- `apps/web`: the Next.js workspace staff open in the browser
- `apps/api`: the NestJS API that talks to PostgreSQL (through Prisma) and Supabase Storage
- `packages/shared`: shared types, enums, constants and Zod schemas
- `packages/config`: environment readers and config helpers
- `packages/imports`: CSV, XLSX and PDF import and export helpers
- `packages/ui`: shared UI package (the web app keeps its own primitives in `apps/web/src/components/ui`)
- `supabase`: the local Supabase stack configuration
- `scripts`: local database, docs and SAD review scripts
- `infra`: environment notes, Docker, and the Supabase migration and replay harnesses
- `docs`: the document suite; start at [docs/index.md](docs/index.md)

## 1. Install The Tools

- Git
- Node.js 22 or newer
- pnpm 11 (`corepack enable` installs the version pinned in `package.json`)
- Docker Desktop (needed for the local Supabase stack)
- VS Code, with the Biome, Prisma, Tailwind CSS IntelliSense and Playwright Test extensions

Quick checks:

```powershell
node -v
pnpm -v
git --version
docker --version
```

## 2. Clone And Install

```powershell
git clone https://github.com/ceezey/PATHWAYS.git
cd PATHWAYS
pnpm install
pnpm --filter @pathways/api prisma:generate
```

Run `prisma:generate` again whenever `apps/api/prisma/schema.prisma` changes, including after a pull or rebase; a stale client fails with misleading 403 errors.

## 3. Create Your Environment Files

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/api/.env.example apps/api/.env
```

These files are ignored by Git. Never commit real keys or full connection URLs. `infra/environment.md` lists which variable belongs to the root, web and API files.

The local stack in step 4 does not read these files. You only fill them in to run against the hosted development database (step 5).

## 4. Run Against The Local Stack (Recommended)

This uses synthetic data only and never touches the hosted databases. Docker must be running.

```powershell
pnpm db:local:start   # start the local Supabase containers
pnpm db:local:reset   # recreate the local database, replay migrations, seed one account per role
pnpm db:local:demo    # optional: add a fictional demonstration workspace
pnpm dev:local        # build and run the API and web against the local stack
```

Then:

- Open `http://127.0.0.1:3000/staff/login` in a private window.
- Passwords for the seeded accounts are written only to the ignored `.tmp/local-seed/` folder.
- Each account enrolls an authenticator app (TOTP) on first sign-in.
- Local email, such as password recovery, appears in Mailpit at `http://127.0.0.1:54324`.

Stop the containers with `pnpm db:local:stop`.

## 5. Run Against The Hosted Development Database

`pnpm dev` starts the web app and the API together. The API uses the runtime database role from `apps/api/.env` (the hosted development project) and deliberately ignores migration credentials.

1. Ask the developer for the development values: `NEXT_PUBLIC_SUPABASE_URL`, the Supabase publishable or anon key, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the runtime `DATABASE_URL`.
2. Paste them into your env files.
3. Run `pnpm dev`.

`DATABASE_URL` is the API runtime identity and `DIRECT_URL` is the migration owner; they must never share a PostgreSQL role. You do not need `DIRECT_URL` to run the app.

## 6. Check It Works

- Web: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:4000/api/health` returns `status: ok`
- API docs: `http://127.0.0.1:4000/api/docs`, only when `ENABLE_SWAGGER=true` in `apps/api/.env`

Both servers listen on 127.0.0.1 only. The web port is fixed at 3000, so stop any other server holding it first. The API port comes from `API_PORT` (default 4000).

## Everyday Commands

```powershell
pnpm lint          # Biome lint and format check
pnpm format        # Biome format, writes changes
pnpm typecheck     # TypeScript in every workspace
pnpm test          # Vitest in every workspace
pnpm build         # build every workspace
pnpm dev:web       # web only
pnpm dev:api       # API only
pnpm docs:check    # validate the document suite
pnpm --filter @pathways/web e2e   # Playwright end-to-end tests
```

## Database Safety

- Never run `prisma migrate reset` or `prisma db push`.
- Never point a destructive command at the hosted development or production databases.
- Migrations follow the guardrails in [AGENTS.md](AGENTS.md) and the runbooks in `docs/` (`runbook-migration-baseline.md`, `runbook-backup-restore.md`); run only database work you were explicitly authorized to run.

## Troubleshooting

- `pnpm install` fails: check `node -v` is 22 or newer and run `corepack enable`.
- Sign-in says the credentials are wrong: any 4xx from the auth endpoint shows that message. Check that the web and API point at the same Supabase project, and that `WEB_ORIGIN` matches the web URL when running against a deployed preview.
- The API fails with 403 on every request after a pull: regenerate the Prisma client (step 2).
- The API cannot reach the database: check the runtime `DATABASE_URL`, or for the local stack check that Docker is running and `pnpm db:local:start` succeeded.
- Storage fails: make sure the buckets exist and their names match the env values.
- A port is busy: stop the other dev server; `pnpm dev:local --api-only` with `PATHWAYS_LOCAL_API_PORT` runs only the API on another port.

## Useful Documents

- [docs/runbook-local-dev.md](docs/runbook-local-dev.md): local stack, fast test runners and session rules
- `infra/environment.md`: environment variable guide
- `infra/supabase/HUMAN_SETUP.md`: human-only Supabase project setup
- `infra/supabase/developer-mfa.md`: authenticator (TOTP) setup for developers
