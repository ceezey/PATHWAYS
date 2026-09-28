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

- Node: `.nvmrc`, Dockerfiles, CI and the root `package.json` `engines` (`>=22`) require Node 22. Set the Vercel projects to Node 22.x. The API's PDF import parser (`unpdf`) requires Node 22 or later.
- API build (`apps/api/package.json`): `pnpm --filter "@pathways/api^..." run build && prisma generate --config prisma.generate.config.ts && nest build`, so the install step must include the pnpm workspace.
- API start: `node dist/apps/api/src/main.js`.

### Open items (verified 2026-09-26)

These are repository facts that block or qualify a release claim. They are recorded here, not fixed by documentation.

| Item | Evidence | Needed |
|---|---|---|
| API listener policy | `apps/api/src/main.ts` calls `listenOnIpv4Loopback` (`apps/api/src/common/network/local-listener.ts`), which binds `127.0.0.1` and notes a non-local deployment needs a reviewed listener policy | Development preview health and unauthenticated denial verified 2026-09-26; production listener/release verification remains separate |
| Swagger in production | `packages/config/src/env.ts` defaults `ENABLE_SWAGGER` to `true`, serving `/api/docs` | set `ENABLE_SWAGGER=false` in Vercel or change the default |
| API env schema drift | `token-auth.service.ts` reads `SUPABASE_PUBLISHABLE_KEY`, absent from `apiEnvSchema` and `.env.example` files; the templates still list `SUPABASE_JWT_SECRET`, which runtime does not need | align schema and templates with the list above |

## 1. Current Development Evidence to Track

- database connection failures;
- API errors;
- import failure/retry;
- storage failures;
- authorization-denial anomalies;
- scheduled rule-evaluation failures if introduced;
- backup/restore success.

Do not invent production SLOs.

### Review checks and local CI databases

The [SAD](sad-pathways.md) defines specialist triggers, deterministic diagnostics, and final agent sign-off evidence. `pnpm sad:check` and the independent CI job provide automated review routing/diagnostics; they do not authenticate reviewers or establish complete semantic approval. Use `pnpm sad:signoff -- --reviews <external-json-path>` for current digest-bound specialist evidence. Keep reports outside tracked files; any reviewed content change invalidates evidence.

CI validates PRs and pushes to `dev`/`master`. Migration replay is isolated to disposable loopback PostgreSQL 18, with verified extraction of archived bytes instead of removed historical migration directories. It exercises fresh provisioning, preserved-ledger baseline registration/upgrade, and forward corrections using existing SQL fixtures/catalog validators. Preserve pinned checksums and approved exceptions. Do not apply a baseline to populated databases or use hosted credentials for CI. CI checks do not authorize database application or deployment; inspect actual run results before reporting completion.

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

The [approved local pending-proof inspection](cr-pathways-private-activity-proof-inspection.md) requires counted private storage reads, shared deadlines, size/digest verification, final authorization/audit and no response cache or private identifiers in logs. Inspection does not establish classification/consent. Generic download withdrawal must accompany the reviewed inspection UI; local verification remains pending and hosted application/release is separately gated.

The [activity proof direct upload](cr-pathways-activity-progress-media.md), implemented on its feature branch with a reduced scope (its section 9), submits evidence straight to the private `pathways-private` bucket through a server-issued signed upload token, scoped to one server-derived object key. `EVIDENCE_MAX_FILE_BYTES` (`packages/config/src/env.ts`) defaults to 50 MB (52,428,800 bytes), matching the hosted Supabase Free plan's per-file cap; it may be raised to 100 MB only after a Supabase Pro upgrade confirms the higher bucket and global limits. Accepted MIME types are `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime` and `video/webm`. The bucket's own `file_size_limit` and `allowed_mime_types` are defense in depth on top of the server's own verification and must track this limit and list on both local and hosted projects. The Free plan's total storage quota is small relative to ten files per update, and should be watched as an operational risk once this ships.

Migration `0041_activity_media_evidence` replaces the owner-scoped `pathways_rules_internal.canonical_source_request` function body and widens `evidence_media_activity_update_check`. Because the 0031/0034 hosted cleanups already revoked `prisma`'s owner-role memberships, applying 0041 on the hosted database needs a human DBA to run `infra/supabase/phase6/hosted-activity-media-preprovision.sql` first (grants `prisma` a temporary SET-only chain to `rules_store_owner` and `rules_enqueue_owner`, no ADMIN, no INHERIT) and `infra/supabase/phase6/hosted-activity-media-cleanup.sql` right after the migration finishes, and also after a failed or rolled-back attempt. Both scripts require an explicit, independently pinned `target_project_ref` and `expected_database`, and refuse to run anywhere else. The `forward-activity-media-preprovision.sql` and `forward-activity-media-cleanup.sql` files are the equivalent pair for the disposable local replay database only, and are never used against a hosted project.

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
