# Operations & Observability Runbook (OPS)

## 0. Current Posture

Feature-development/defense reliability first.

Vercel API and web release work was explicitly authorized on 2026-09-26. SSO and AWS hosting remain deferred.

### Branches and Vercel projects

| Purpose | Branch/project | Root | Production URL |
|---|---|---|---|
| Development | `dev` | repository | Vercel Preview |
| Deployment | `origin/master` | repository | Vercel Production |
| NestJS API | `pathways-api` | `apps/api` | `https://pathways-api.vercel.app` |
| Next.js web | `pathways-web` | `apps/web` | `https://pathways-web-lyart.vercel.app` |

Both Vercel projects connect to `ceezey/PATHWAYS` and use `master` as the production branch. Prepare releases on `dev`, verify them, then bring the release into `master` and push without rewriting history.

The API build generates the Prisma client with its schema-only generation configuration before compiling NestJS. Database commands retain their separate credential-requiring configuration. Deployment does not apply database migrations or bootstrap identities.

Prisma client generation includes the native development engine and `rhel-openssl-3.0.x` for the Vercel Node runtime. Initialization failures report only a fixed stage and bounded Prisma error code; provider messages and connection credentials remain withheld.

### Deployment configuration

- Web: `NEXT_PUBLIC_SUPABASE_URL`, a public Supabase publishable key, `NEXT_PUBLIC_API_BASE_URL`, and `NEXT_PUBLIC_STAFF_PORTAL_BASE_URL`.
- API: `DATABASE_URL` for the dedicated `pathways_runtime` login, `SUPABASE_URL`, the public `SUPABASE_PUBLISHABLE_KEY` for token verification, the server-only `SUPABASE_SERVICE_ROLE_KEY` for authorized Auth/Storage operations, and `WEB_ORIGIN`, an exact HTTPS browser origin. Configure database/service credentials as Sensitive in Vercel. Runtime does not require the migration-only `DIRECT_URL` or a JWT signing secret.
- Remote bearer requests require the explicitly configured HTTPS API destination; local development retains IPv4 loopback.
- Production uses the stable API/web domains above. `dev` preview configuration uses the corresponding Git branch aliases.
- Password recovery accepts the configured staff portal origin. Its callback must also be approved in Supabase Auth URL configuration.
- Before claiming a release complete, verify Vercel build status, API health, unauthorized protected-request denial, web/login responses, and CORS acceptance/rejection.

### Vercel build settings

No `vercel.json` is committed; these settings live in the Vercel dashboard.

- Node: `.nvmrc`, Dockerfiles, and CI use Node 22. Set the Vercel projects to Node 22.x (root `package.json` `engines` is still `>=20.11.0`).
- API build (`apps/api/package.json`): `pnpm --filter "@pathways/api^..." run build && prisma generate --config prisma.generate.config.ts && nest build`, so the install step must include the pnpm workspace.
- API start: `node dist/apps/api/src/main.js`.

### Open items (verified 2026-09-26)

These are repository facts that block or qualify a release claim. They are recorded here, not fixed by documentation.

| Item | Evidence | Needed |
|---|---|---|
| API listener policy | `apps/api/src/main.ts` calls `listenOnIpv4Loopback` (`apps/api/src/common/network/local-listener.ts`), which binds `127.0.0.1` and notes a non-local deployment needs a reviewed listener policy | Development preview health and unauthenticated denial verified 2026-09-26; production listener/release verification remains separate |
| Swagger in production | `packages/config/src/env.ts` defaults `ENABLE_SWAGGER` to `true`, serving `/api/docs` | set `ENABLE_SWAGGER=false` in Vercel or change the default |
| API env schema drift | `token-auth.service.ts` reads `SUPABASE_PUBLISHABLE_KEY`, absent from `apiEnvSchema` and `.env.example` files; the templates still list `SUPABASE_JWT_SECRET`, which runtime does not need | align schema and templates with the list above |
| CI branch trigger | `.github/workflows/ci.yml` runs on pushes to `main`/`master` and on PRs, not on `Backend-DB` pushes | add `Backend-DB` if development pushes must be validated |
| Engines range | root `package.json` `engines.node` is `>=20.11.0` | pin `22.x` to match `.nvmrc` |

## 1. Current Development Evidence to Track

- database connection failures;
- API errors;
- import failure/retry;
- storage failures;
- authorization-denial anomalies;
- scheduled rule-evaluation failures if introduced;
- backup/restore success.

Do not invent production SLOs.

## 2. Logging

Never log:
- passwords;
- bearer/refresh tokens;
- API secrets;
- full secret-bearing DB URLs;
- unnecessary Beneficiary content.

Prefer correlation/request IDs where supported.

## 3. Incident Runbooks

### Database / Migration
Stop writes when integrity is uncertain. Capture state. Never reset blindly. Verify migration lineage. Restore only from tested backup.

### Auth / Authorization
Disable affected privileged path if needed. Preserve evidence. Verify identity/profile/role/permission/assignment chain.

### Beneficiary Privacy
Stop exposure. Preserve evidence. Identify affected surfaces/users/records. Escalate before external claims.

### Import Processing
Preserve raw staging. Stop normalization. Fix safely. Reprocess only with idempotency controls.

### Storage / Publication
Revoke unintended exposure. Distinguish private evidence from approved public media.

### Rule Engine
Disable affected evaluation path/rule if necessary. Preserve snapshots. Do not rewrite history to erase incorrect alerts.

### Backup / Restore
Use `runbook-backup-restore.md`.

## 4. Routine Operations

- check migration state before schema work;
- maintain tested backups before destructive changes;
- review stale accounts/assignments;
- review failed imports/evaluations;
- keep docs Health Check current.

## 5. Postmortems

Use `postmortem-template.md`.

## Self-Check

- [x] no production SLO invented
- [x] security/privacy incidents covered
- [x] backup/recovery linked
