# Runbook: Build PATHWAYS-role-staging

**Status:** Working

**Target:** PATHWAYS-role-staging, project ref `klbtoqdalmcsfjqophty`, Singapore ap-southeast-1, PostgreSQL 17.

**Decision:** On 2026-09-29 the developer chose this project to replace PATHWAYS-dev. It starts empty: the schema is built from migrations 0000 through 0041, and then fictional dummy data is seeded. Nothing is copied from PATHWAYS-dev.

The operator runs every command in this runbook. Agents never connect to the hosted project and never handle its secrets.

## 1. Prerequisites in the Supabase dashboard

1. Authentication:
   - Enable email sign-in and TOTP multi-factor authentication.
   - Set the Site URL to the web deployment's URL, and add the Vercel development and production web URLs, plus `/auth/recovery/callback` on each, as redirect URLs.
   - Enable leaked-password protection if the plan offers it.
2. Authentication > Users: invite `cianjake.francisco@gmail.com`, accept the invite and set a password. The seed only links this existing account as System Administrator. It never creates or emails it.
3. Database settings: confirm that `log_statement` and `log_parameter_max_length_on_error` do not record bound parameter values.

## 2. Env files

Keep both files under the repository's ignored `.tmp/` directory or outside the repository. The tools refuse any other location. Record variable names only here, never values.

`.tmp/role-staging-build.env`:

| Variable | Meaning |
|---|---|
| `HOSTED_TARGET_REF` | `klbtoqdalmcsfjqophty` |
| `HOSTED_ADMIN_URL` | `postgres` user connection (Session Pooler, port 5432) |
| `HOSTED_DIRECT_URL` | `prisma.klbtoqdalmcsfjqophty` connection on the same pooler |
| `PRISMA_ROLE_PASSWORD` | new strong password, at least 24 characters |
| `RUNTIME_ROLE_PASSWORD` | new strong password, at least 24 characters |

`.tmp/role-staging-seed.env`:

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` | `https://klbtoqdalmcsfjqophty.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the project's service role key |
| `DATABASE_URL` | `pathways_runtime.klbtoqdalmcsfjqophty` connection (runtime identity) |
| `DIRECT_URL` | `prisma.klbtoqdalmcsfjqophty` connection (migration owner) |

## 3. Build the schema

```bash
node scripts/db/hosted-build.mjs --dry-run
```

Check the printed 19-step plan. It covers the prisma role, the 0000 baseline and its registration, then staged deploys with the preprovision and cleanup steps around 0031, 0034, 0037 and 0041, then the runtime login, then the postconditions.

```bash
node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env
```

Every step prints `start` and `done` lines and has a time limit. A successful build ends with these PASS lines:

- `PASS: ledger has exactly 16 migrations 0000-0041, all finished and none failed`
- `PASS: no residual temporary owner memberships for prisma`
- `PASS: role count matches the repo-derived expectation (21 roles ...)`
- `PASS: schema-level permission grants observed (...)`

The ledger holds 16 rows because 0000 is the consolidated baseline for the historical 0001 to 0026.

**If a step fails:** the tool still runs the matching cleanup script when the failed step was a preprovisioned migration. Fix the reported cause, then rerun with `--resume`. It continues only when the ledger is an exact finished prefix of the expected sequence, and refuses anything else. Never run `prisma migrate reset`, `db push` or `migrate resolve` by hand.

## 4. Seed realistic dummy data

```bash
node scripts/db/hosted-seed.mjs --env-file .tmp/role-staging-seed.env
```

The seed does the following:

- **Storage:** creates the private buckets. `pathways-private` has a 50 MB file limit and allows images, PDF, CSV, XLS, XLSX, MP4, MOV and WebM.
- **Your account:** links `cianjake.francisco@gmail.com` as System Administrator of `PLAN_PH`.
- **Dummy staff:** creates six `@example.test` accounts: Program Manager, Grant Manager, Project Manager, M&E Officer and two Project Officers.
- **Domain data:** writes through the application services, so validation, row security and permissions all apply. It creates 3 projects in Eastern Samar, Northern Samar and Masbate, 18 activities, 7 indicators, 14 measurements and 45 consented beneficiaries aged 5 to 70. One cohort is small on purpose so suppression shows.

Dummy passwords are written only to `.tmp/hosted-seed/credentials-<timestamp>.json`. Running the seed again creates no duplicates.

## 5. Switch the deployments

In Vercel, for both `pathways-api` and `pathways-web`, update the Preview environment first:

- **Values to replace:** the database URLs, `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, the publishable key and the service role key, all with role-staging values.
- **API only:** confirm Node 22 and the function `maxDuration`.
- **Redeploy** the `dev` branch.

Then sign in on the development preview and check:

- TOTP step-up, then setting and using a PIN
- a text-based PDF import and a form export
- Add Beneficiary on a project with no custom form
- a multi-file Submit proof that includes a video

After the preview passes, update the Production environment with the same values. The developer's conditional R6 authorization then allows `dev` to be merged into `master`.

## 6. Verification

Agents confirm each stage with read-only checks, covering the migration ledger, roles, buckets and row counts, and record the verified hosted facts in the rollout record. PATHWAYS-dev stays untouched until the developer retires it.
