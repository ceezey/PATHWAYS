# PATHWAYS

PATHWAYS is a development-ready monorepo for a web app and API that work together with Supabase. Think of it like one big project box with a few smaller boxes inside: the website lives in one box, the API lives in another box, and the shared code sits in the middle so both can reuse it.

## System Overview
Team placeholder:
Write 3 to 6 sentences here that explain how the web app, API, database, authentication, storage, dashboards, and reports work together.

## Purpose
Team placeholder:
Explain the real-world problem PATHWAYS is solving, who will use it, and why the system matters.

## Features
Team placeholder:
List the main features your team wants other people to notice first.

## Tech Stack
- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn-style UI primitives
- Backend: NestJS, TypeScript, Prisma
- Platform: Supabase Postgres, Supabase Auth, Supabase Storage
- Shared workspace packages: `@pathways/shared`, `@pathways/config`, `@pathways/imports`, `@pathways/ui`
- Tooling: pnpm, Biome, Husky, lint-staged
- Testing: Vitest, MSW, Playwright
- Ops: Docker, GitHub Actions, Sentry placeholders

## What Is In This Repo?
A monorepo simply means one repository that holds more than one project.

Important folders:
- `apps/web`: the Next.js website devs will open in the browser
- `apps/api`: the NestJS backend that talks to the database and storage
- `packages/shared`: shared types, enums, constants, and schema helpers
- `packages/config`: shared environment readers and config helpers
- `packages/imports`: import and export helpers for CSV and XLSX work
- `packages/ui`: optional shared UI package
- `infra`: helper docs for environment setup, Docker, and Supabase notes

## Recommended VS Code Extensions
Install these before you start coding so the editor helps instead of getting in your way.

- `Biome`: formats and lint-checks files so the code stays neat
- `Prisma`: makes the Prisma schema easier to read and edit
- `Tailwind CSS IntelliSense`: helps you understand Tailwind classes while typing
- `ES7+ React/TypeScript snippets`: gives helpful shortcuts when writing React or TypeScript
- `GitLens`: makes Git history easier to understand
- `Playwright Test for VS Code`: helps when running end-to-end tests later
- `DotENV`: colors and explains environment variable files
- `Docker`: helps if your team uses Docker during development

## Step-By-Step Setup
These steps are written in a simple do-this-then-do-that way so nobody has to guess.

### 1. Install the tools you need first
Make sure these are installed on your computer:
- Git
- Node.js LTS
- pnpm
- VS Code
- Docker Desktop

Quick checks:
```powershell
node -v
git --version
pnpm -v
docker --version
docker compose version
```

### 2. Clone the project from GitHub
This copies the project from GitHub to your computer.

```powershell
git clone https://github.com/ceezey/PATHWAYS.git
cd PATHWAYS
```

### 3. Open the project in VS Code
```powershell
code .
```
If `code .` does not work, open VS Code manually and choose the `PATHWAYS` folder.

### 4. Create your local environment files
These files hold the secret keys and local settings for your own machine.

Recommended local file names:
- `.env.local`
- `apps/web/.env.local`
- `apps/api/.env.local`

PowerShell copy commands:
```powershell
Copy-Item .env.example .env.local
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env.local
```

Important note:
- If your team prefers `.env` instead of `.env.local`, that also works in this repo.
- Do not commit real secrets to Git.

### 5. Paste your real Supabase and database values
Open those env files and paste the values from your Supabase project.

Shared values you will usually need:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

Helpful docs:
- See `infra/environment.md` for which variables belong to root, web, and api
- See `infra/supabase/HUMAN_SETUP.md` for the human-only Supabase steps

### 6. Install the project dependencies
This downloads the packages the repo needs.

```powershell
pnpm install
```

### 7. Generate the Prisma client
This teaches Prisma how to talk to your database schema.

```powershell
pnpm --filter @pathways/api prisma:generate
```

### 8. Run the database migration
This creates the tables in your connected Supabase Postgres database.

```powershell
pnpm --filter @pathways/api prisma:migrate
```

### 9. Add starter data
This puts in helpful starting records like roles and a development admin record.

```powershell
pnpm --filter @pathways/api prisma:seed
```

### 10. Start both apps together
This starts the website and the API at the same time.

```powershell
pnpm dev
```

### 11. Open the important local URLs
Once the dev servers are running, open these:
- `http://localhost:3000`
- `http://localhost:4000/api/health`
- `http://localhost:4000/api/docs`

What you should see:
- the homepage loads
- the health endpoint returns a JSON response with `status: ok`
- the Swagger docs page loads

### 12. If a port is already busy
Sometimes another app is already using `3000` or `4000`. If that happens, you can use temporary ports for one session.

```powershell
$env:PORT='3100'
$env:API_PORT='4100'
pnpm dev
```

Then open:
- `http://localhost:3100`
- `http://localhost:4100/api/health`

### 13. Helpful commands you will use a lot
```powershell
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
pnpm dev:web
pnpm dev:api
```

### 14. Tiny success checklist
If all of these are true, your local setup is probably good:
- dependencies installed without errors
- Prisma client generated
- migration completed
- seed completed
- homepage opens
- login page opens
- API health route responds
- API docs route responds

## Environment Notes
- The web app accepts Supabase client keys from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The frontend reserves `/auth/callback` for Supabase redirect handling
- The API uses `SUPABASE_SERVICE_ROLE_KEY` for backend-only storage and admin actions
- Real secrets must stay in local env files only

## Troubleshooting
- If `pnpm install` fails, check your Node.js version and make sure pnpm is installed
- If Prisma fails, double-check `DATABASE_URL` and `DIRECT_URL`
- If auth fails, double-check your Supabase URL, anon key, redirect URL, and enabled auth provider
- If storage fails, make sure the buckets exist and the bucket names match the env values
- If `localhost:3000` or `localhost:4000` is busy, use the temporary port steps above

## Useful Documents
- `TODO.md`: the setup checklist and verification record
- `infra/environment.md`: environment variable guide
- `infra/supabase/HUMAN_SETUP.md`: Supabase setup notes
