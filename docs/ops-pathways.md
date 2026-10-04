# Operations & Observability Runbook (OPS)

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

## 0. Operating Posture

Development and defense reliability first. SSO is deferred. AWS hosting is a proposal only, see `docs/rfc-pathways-aws-hosting-migration.md`; no AWS readiness is claimed.

| Purpose | Branch or project | Root | URL |
|---|---|---|---|
| Development | `dev` | repository | Vercel Preview |
| Deployment | `origin/master` | repository | Vercel Production |
| NestJS API | `pathways-api` | `apps/api` | `https://pathways-api.vercel.app` |
| Next.js web | `pathways-web` | `apps/web` | `https://pathways-web-lyart.vercel.app` |

Both Vercel projects connect to `ceezey/PATHWAYS` with `master` as the production branch. Prepare releases on `dev`, verify, then bring the release into `master` and push without rewriting history.

### Build and runtime

- No `vercel.json` is committed; settings live in the Vercel dashboard.
- Node 22.x (`.nvmrc`, `engines` `>=22`); the PDF parser `unpdf` needs it.
- API build: `pnpm --filter "@pathways/api^..." run build && prisma generate --config prisma.generate.config.ts && nest build`. API start: `node dist/apps/api/src/main.js`.
- Prisma client targets include `rhel-openssl-3.0.x` for the Vercel runtime. Initialization failures report a fixed stage and bounded Prisma code only.
- Deployment does not apply migrations or bootstrap identities.

### Deployment configuration

- Web: `NEXT_PUBLIC_SUPABASE_URL`, a public Supabase publishable key, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_STAFF_PORTAL_BASE_URL`.
- API: `DATABASE_URL` (dedicated `pathways_runtime` login), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, and `WEB_ORIGIN` (exact HTTPS origin). Mark database and service credentials Sensitive in Vercel. Runtime does not need `DIRECT_URL` or a JWT signing secret.
- Remote bearer requests require the configured HTTPS API destination; local development keeps IPv4 loopback.
- Password recovery accepts the configured staff portal origin, which must also be approved in Supabase Auth URL configuration.

### Release verification

Before claiming a release complete, verify Vercel build status, API health, unauthorized protected-request denial, web and login responses, and CORS acceptance and rejection. A GET or wrong token on `internal/rules/*` must be denied.

### Open items (verified 2026-09-26)

| Item | Evidence | Needed |
|---|---|---|
| API listener policy | `apps/api/src/main.ts` calls `listenOnIpv4Loopback` (`apps/api/src/common/network/local-listener.ts`), binding `127.0.0.1` | Development preview health and denial verified 2026-09-26; production listener verification is separate |
| Swagger in production | `packages/config/src/env.ts` defaults `ENABLE_SWAGGER` to `true`, serving `/api/docs` | Set `ENABLE_SWAGGER=false` in Vercel or change the default |
| API env schema drift | `token-auth.service.ts` reads `SUPABASE_PUBLISHABLE_KEY`, absent from `apiEnvSchema` and `.env.example`; templates still list `SUPABASE_JWT_SECRET` | Align schema and templates |

## 1. SLOs & SLIs

Developer targets, 2026-10-01. Not yet measured or enforced.

| SLO | Target |
|---|---|
| Availability | 99.5% monthly (about 3.6 hours of downtime per month) |
| API latency | p95 under 800 ms for normal pages; imports excluded |
| RPO | 24 hours (daily backup) |
| RTO | 5 to 8 hours |

Signals to track: database connection failures, API errors, import failure and retry, storage failures, authorization-denial anomalies, rule-evaluation failures, backup and restore success.

## 2. Observability; Logs, Metrics, Traces

| Signal | Current state |
|---|---|
| Logs | `nestjs-pino` structured JSON to stdout; expected to be captured by the hosting platform's function logs (not verified) |
| Errors | `@sentry/nestjs` via `apps/api/src/common/sentry.ts` |
| Metrics | Not established |
| Traces | Not established |

Never log passwords, bearer or refresh tokens, API secrets, secret-bearing database URLs or unnecessary beneficiary content. Prefer correlation and request IDs where supported.

## 3. Alerting & On-Call

Support is best effort with no on-call for now (developer target 2026-10-01). No alert routing or pager exists; Sentry is the only error channel.

## 4. Incident Response

| Incident | First actions |
|---|---|
| Database or migration | Stop writes if integrity is uncertain, capture state, never reset blindly, verify migration lineage. See [backup and restore](runbook-backup-restore.md) and [migration baseline](runbook-migration-baseline.md). |
| Auth or authorization | Disable the affected privileged path, preserve evidence, verify the identity, role, permission and assignment chain. |
| Beneficiary privacy | Stop exposure, preserve evidence, identify affected surfaces and records, escalate before external claims. |
| Import processing | Preserve raw staging, stop normalization, fix safely, reprocess only with idempotency controls. |
| Storage or publication | Revoke unintended exposure; separate private evidence from approved public media. |
| Rule engine | Disable the affected rule or path, preserve snapshots, do not rewrite alert history. |

Evidence uploads go directly to the private `pathways-private` bucket through a server-issued signed token (see [activity media CR](cr-pathways-activity-progress-media.md)). `EVIDENCE_MAX_FILE_BYTES` defaults to 52,428,800 bytes, matching the Supabase Free plan file cap; the bucket `file_size_limit` and `allowed_mime_types` must track it. Private proof inspection rules are in the [inspection CR](cr-pathways-private-activity-proof-inspection.md).

Applying migration `0041_activity_media_evidence` on the hosted database needs a human DBA to run `infra/supabase/phase6/hosted-activity-media-preprovision.sql` first and `infra/supabase/phase6/hosted-activity-media-cleanup.sql` right after, also after a failed attempt. Both require independently pinned `target_project_ref` and `expected_database`. The `forward-activity-media-*.sql` pair is for the disposable local replay database only.

Other runbooks: [local development](runbook-local-dev.md), [role staging build](runbook-role-staging-build.md), [doc reconciliation](runbook-doc-reconciliation.md).

## 5. Routine Operations

- Check migration state before schema work; keep tested backups before destructive changes ([backup and restore](runbook-backup-restore.md), [migration baseline](runbook-migration-baseline.md)).
- Review stale accounts and assignments, and failed imports or evaluations.
- Rules scheduler: `.github/workflows/rules-dispatch.yml` drains every 5 minutes and sweeps hourly once a person completes the steps below ([cr-pathways-rules-hosted-scheduler](cr-pathways-rules-hosted-scheduler.md)). Until then it is inert and `RULES_WORKER_ENABLED` stays `false`.

### Rules scheduler activation (human only)

Agents never create or store these credentials.

1. Confirm every API deployment reading the target database runs the widened rules contract, then apply the pending rules migrations with their preprovision and cleanup scripts.
2. Run `infra/supabase/phase6/hosted-rules-machine-login.sql` with `psql -v target_project_ref=... -v expected_database=postgres`; `password` prompts for the worker and sweeper passwords with hidden input and stores nothing.
3. Generate two distinct tokens with `openssl rand -hex 32`. Store them as GitHub environment `rules-hosted` secrets `RULES_DRAIN_TOKEN` and `RULES_SWEEP_TOKEN`, and set variable `RULES_DISPATCH_API_BASE_URL` to the API base including `/api`.
4. In Vercel `pathways-api`, set Sensitive `RULES_DRAIN_TOKEN`, `RULES_SWEEP_TOKEN`, `RULES_WORKER_DATABASE_URL` and `RULES_SWEEPER_DATABASE_URL` (session pooler, port 5432, user `role.<projectref>`, `sslmode=require`), `BUSINESS_TIME_ZONE=Asia/Manila`, with `RULES_WORKER_ENABLED=false`.
5. Set `RULES_DISPATCH_ENABLED=true`, run the workflow by hand and expect a 403 "Rule processing is unavailable".
6. After measuring a full drain, set `RULES_RUNTIME_VERIFIED_MS` (30000 or more) and `RULES_PERIODIC_DRAIN_VERIFIED=true` together with `RULES_WORKER_ENABLED=true`; the API refuses to start if enabled without them.
7. Run the workflow by hand and expect `{"state":"ACKNOWLEDGED"}`, then confirm hourly progress read-only with `SELECT max(committed_at) FROM pathways_rules_internal.acknowledgements` and record it in QAD-T68.

Recovery: set `RULES_WORKER_ENABLED=false` or `RULES_DISPATCH_ENABLED=false`; never revert an applied migration.

- CI validates PRs and pushes to `dev` and `master`, replaying migrations on disposable loopback PostgreSQL 18. CI does not authorize database application or deployment.
- `pnpm sad:check` routes specialist review per the [SAD](sad-pathways.md); it does not authenticate reviewers.

## 6. Postmortems

Use `postmortem-template.md`. Not established: no postmortems recorded.

## Self-Check

- [x] SLOs are developer targets, not measured results
- [x] security and privacy incidents covered
- [x] backup and recovery linked
- [x] no AWS readiness claimed
