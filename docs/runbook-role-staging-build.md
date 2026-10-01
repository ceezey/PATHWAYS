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

Check the printed 26-step plan. It covers the prisma role, the 0000 baseline and its registration, then staged deploys with the preprovision and cleanup steps around 0031, 0034, 0037, 0041 and 0044, with the 0042 and 0043 deploys between 0041 and 0044, the 0045 deploy after 0044 and the 0051 deploy after 0045, then the runtime login, then the postconditions.

```bash
node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env
```

Every step prints `start` and `done` lines and has a time limit. A successful build ends with these PASS lines:

- `PASS: ledger has exactly 21 migrations 0000-0051, all finished and none failed`
- `PASS: no residual temporary owner memberships for prisma`
- `PASS: role count matches the repo-derived expectation (21 roles ...)`
- `PASS: schema-level permission grants observed (...)`
- `PASS: pathways_runtime has LOGIN enabled`

The ledger holds 21 rows because 0000 is the consolidated baseline for the historical 0001 to 0026.

**If a step fails:** the tool runs the matching cleanup script whenever the failure happens anywhere between a preprovision step and its cleanup (the preprovision step itself, or the deploy that follows it), then rethrows the original error. Fix the reported cause, then rerun with `--resume`.

`--resume` runs its own preflight instead of the fresh-target one: it requires the pathways schema, `auth.users` and the prisma role to already be present (a partial build always has them), and the ledger to be an exact, cleanly finished prefix of the expected 0000-0044 sequence; it refuses anything else. It also recovers the rules cleanup's required `original_prisma_database_create` value from a small local receipt (`.tmp/hosted-build/receipt.json`, never containing secrets) written right after the rules preprovision step succeeds, so a resume works even from a fresh process after a crash. Never run `prisma migrate reset`, `db push` or `migrate resolve` by hand.

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

## 7. Applying 0042 through 0045 to the already-built role-staging

The role-staging project described above was built through migration 0041. Migration 0042 (cr-pathways-proof-session-beneficiary-count) adds one nullable column to `pathways.activity_updates` and redefines `pathways.p08_activity_beneficiaries_reached`. Migration 0043 (cr-pathways-activity-overdue-explanation) creates the append-only `pathways.activity_overdue_explanations` table. Neither needs preprovision or cleanup, so both slot into the existing `--resume` path as two extra deploy steps. Migration 0044 (progress-only activity review) does need one: it replaces `pathways.f10_begin_source_operation` (owner `rules_enqueue_owner`) and `pathways_rules_internal.prove_source_root_dml` (owner `rules_source_proof_owner`) so that an M&E officer can approve or return a pending progress-only update while its activity is `IN_PROGRESS`, and it lends schema CREATE through the schema owners for those two statements only. `hosted-activity-review-preprovision.sql` grants `prisma` a temporary SET-only chain (no ADMIN, no INHERIT) to exactly `rules_store_owner`, `rules_enqueue_owner` and `rules_source_proof_owner` before the 0044 deploy, and `hosted-activity-review-cleanup.sql` revokes it right after, also after a failed attempt. Everything is applied by a single command.

### Disambiguating a ledger that stops exactly at 0041

A ledger applied exactly through 0041 is not, by itself, proof that the earlier build finished cleanly: it looks identical whether (a) that build completed and the activity-media cleanup and runtime-role alteration already ran, or (b) the build was killed or lost its connection between the 0041 deploy and its own cleanup step, which then never ran. `--resume` no longer trusts the ledger count alone for this case. It runs a read-only check of whether `prisma` still holds the temporary `rules_store_owner` / `rules_enqueue_owner` memberships that `hosted-activity-media-preprovision.sql` grants:

- If those memberships are still present, `--resume` re-runs `hosted-activity-media-cleanup.sql` first, then continues at the 0042 deploy.
- If they are already gone, `--resume` continues directly at the 0042 deploy, as before.

**Operator pre-check.** Before running `--resume`, an operator can run this read-only query in the Supabase SQL editor to see which case applies (the script performs the same check automatically, but this lets a human confirm the state ahead of time):

```sql
-- Any row here means prisma still holds a temporary owner membership (activity-media for a
-- ledger ending at 0041, activity-review for one ending at 0043 or 0044); --resume acts on it:
-- re-runs the matching cleanup, or skips a preprovision that already ran.
SELECT p.rolname AS member, r.rolname AS temporary_owner_role
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
JOIN pg_catalog.pg_roles p ON p.oid = m.member
WHERE p.rolname = 'prisma'
  AND r.rolname IN ('rules_store_owner', 'rules_enqueue_owner', 'rules_source_proof_owner');

-- Must return true; if false, the runtime-role alteration has not (yet) run and
-- pathways_runtime cannot log in.
SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = 'pathways_runtime';
```

The operator runs:

```bash
node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume
```

Because the ledger is already the complete, cleanly finished 0000 to 0041 prefix, `--resume` first checks for residual activity-media owner memberships (see above), then continues with the 0042 deploy, then the 0043 deploy, then the activity-review preprovision, the 0044 deploy and its cleanup, then the 0045 deploy, then the postconditions. Unless a residual membership was found, it does not re-run the activity-media cleanup; the runtime-role alteration always runs again at the end regardless, since `ALTER ROLE ... WITH LOGIN` is idempotent. A successful run ends with these PASS lines:

- `PASS: resume preflight (pathways schema present, auth.users present, prisma role present, ledger is a clean finished prefix with 16 migrations applied, residual temporary owner memberships: false)`
- `PASS: ledger has exactly 21 migrations 0000-0051, all finished and none failed`
- `PASS: no residual temporary owner memberships for prisma`
- `PASS: role count matches the repo-derived expectation (21 roles ...)`
- `PASS: schema-level permission grants observed (...)`
- `PASS: pathways_runtime has LOGIN enabled`

If role-staging had already been resumed through 0042 alone before 0043 existed (ledger holding exactly 0000 to 0042), the same command continues directly at the 0043 deploy and then the postconditions, without repeating any earlier step. That state is unambiguous: 0042 has no preprovision/cleanup pair, so there is no residual-membership check to make there.

### Disambiguating a ledger that stops exactly at 0043 or 0044

The same ambiguity applies to the 0044 chain, so `--resume` reads the live owner memberships at those two ledger counts as well:

- Ledger ending at 0043, no temporary membership: `--resume` runs the activity-review preprovision, then the 0044 deploy and its cleanup.
- Ledger ending at 0043, memberships already present (a run died after the preprovision): the preprovision would refuse to grant twice, so `--resume` goes straight to the 0044 deploy and its cleanup.
- Ledger ending at 0044, memberships still present (a run died before the cleanup): `--resume` re-runs `hosted-activity-review-cleanup.sql`, then the 0045 deploy, the runtime-role alteration and the postconditions.
- Ledger ending at 0044, no memberships: `--resume` continues directly at the 0045 deploy, then the runtime-role alteration.

After 0044, a progress-only note that is still `PENDING` on a role-staging activity can be approved or returned by the assigned M&E officer, and the activity keeps `IN_PROGRESS` until an approved proof update reaches 100 percent.

Migration 0045 (cr-pathways-f9-trusted-aggregates) adds two prisma-owned SECURITY DEFINER functions, `pathways.p10_f9_survey_aggregate` and `pathways.p10_f9_timeline_aggregate`, and changes no table, column, policy or grant. It needs no preprovision or cleanup, so a ledger holding exactly 0000 to 0044 (cleanup already run) resumes directly at the 0045 deploy and then the postconditions. Applying 0045 to role-staging or any hosted database needs separate developer authorization.
