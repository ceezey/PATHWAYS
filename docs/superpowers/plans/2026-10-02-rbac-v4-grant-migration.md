# RBAC v4 Grant Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the runtime grants match RBAC v4 cells V4-C01, C02, C06, C07, C09, C10 and C11. Re-source PO aggregates, and retire only the generic Encode Project Data screen.

**Architecture:** Forward migration `0055_rbac_v4_grants` uses `CREATE OR REPLACE` on `pathways.p09_role_allows`. That keeps the ACL that 0054 restored, so there is no rename. It wraps the current 0051 body with one grant clause and one revoke clause, and syncs `pathways.role_permissions`. The API contract and policy arrays get the same deltas through a new `amendments` entry. V4-C11 needs no grant change: the server refuses direct entry for generic form types, and the web drops `/collection/entry`.

**Tech Stack:** PostgreSQL 17 (hosted) and 18 (local replay), Prisma migrations, NestJS, Next.js, Vitest, PowerShell replay harness.

**Spec:**
- `docs/cr-pathways-rbac-v4-adoption.md` section 3.2
- `docs/superpowers/plans/2026-10-02-f1-f8-production-readiness-workflow.md` (Phase 1 and the developer decisions)

## Global Constraints

- Everything in the workflow plan's Global Constraints applies.
- Branch `feat/rbac-v4-grants` from `dev` (at or after e6fb988).
- The migration name is exactly `0055_rbac_v4_grants`. It requires the finished `0054_p09_role_allows_grants` and `current_user = 'prisma'`, and uses advisory lock `pg_advisory_xact_lock(505005,5)`.
- Use `CREATE OR REPLACE FUNCTION pathways.p09_role_allows`. Never `ALTER ... RENAME`: the rename in 0047/0051 is what dropped the EXECUTE grants.
- V4-C11 direct-entry form types:
  - allowed: `TRAINING_SURVEY`, `PRE_TEST`, `POST_TEST`, `ACTIVITY_MONITORING`
  - refused with 409: `OUTCOME_MONITORING`, `OTHER`
  - `BENEFICIARY_REGISTRATION` keeps its existing 409
- No change to `beneficiaries.aggregates.read` holders. Only its documented v4 source changes (rows 112-117).

## Review Focus

1. **Stale signed-in sessions.** A PO who signed in before 0055 must be refused `POST /activities` on the next request. Task 4 adds a workspace-resolution test that resolves permissions from the database, not from a cached token claim.
2. **ACL preserved across the replace.** After 0055, `p09_role_allows` must still be executable by `pathways_runtime` and the 8 `rules_*_owner` roles, and not by `anon`, `authenticated` or `service_role`. Task 1's runtime SQL checks this.
3. **Survey capture still works for PO and ME after V4-C11.** Task 3 tests that a `TRAINING_SURVEY` save succeeds and an `OTHER` save is refused.
4. **Program and Grant Manager activity reads stay read-only.** The new `activities.read` must not let PG or GM create, update or submit proof. Task 1 checks `activities.create` and `activities.update` stay false for both.
5. **Deep links to retired routes.** A bookmarked `/collection/entry` must land on `/collection`, not a 404 or a blank page. Task 5 tests the redirect.

---

### Task 1: Migration 0055 and runtime SQL test

**Files:**
- Create: `apps/api/prisma/migrations/0055_rbac_v4_grants/migration.sql`
- Create: `apps/api/prisma/tests/rbac-v4-grants-runtime.sql`
- Modify: `infra/supabase/phase6/Replay-Local.ps1` (after the `P09_ROLE_ALLOWS_GRANTS_RUNTIME=PASS` block near line 596)

**Interfaces:**
- Produces: the migration name `0055_rbac_v4_grants` (Tasks 2 and 6 list it), and the replay marker `RBAC_V4_GRANTS_RUNTIME=PASS`.

- [ ] **Step 1: Write the failing runtime SQL test**

`apps/api/prisma/tests/rbac-v4-grants-runtime.sql`:

```sql
-- 0055 applies RBAC v4 cells V4-C01, C02, C06, C07, C09 and C10 and keeps the p09_role_allows ACL.
-- Run as a local superuser against a disposable replay database with 0055 applied; rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF (current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' AND current_database() <> 'postgres')
 OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'rbac v4 checks require a disposable local database'; END IF;
END $$;

DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('PROGRAM_MANAGER','projects.archive',false),('GRANT_MANAGER','projects.archive',false),
  ('SYSTEM_ADMINISTRATOR','budgets.read',false),('PROGRAM_MANAGER','activities.read',true),
  ('GRANT_MANAGER','activities.read',true),('PROJECT_OFFICER','activities.create',false),
  ('PROJECT_OFFICER','dashboards.customize',false),('PROJECT_OFFICER','assessments.read',false),
  ('PROJECT_OFFICER','analytics.saddd.read',false),('PROJECT_OFFICER','beneficiaries.aggregates.read',true),
  ('PROJECT_OFFICER','submissions.write',true),('MONITORING_AND_EVALUATION_OFFICER','submissions.write',true),
  ('PROGRAM_MANAGER','activities.create',false),('GRANT_MANAGER','activities.update',false),
  ('PROJECT_MANAGER','activities.create',true),('PROJECT_MANAGER','projects.archive',true),
  ('SYSTEM_ADMINISTRATOR','activities.read',true),('SYSTEM_ADMINISTRATOR','journeys.read',false),
  ('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review',true),
  ('PROJECT_MANAGER','indicators.library.create',true)) v(role,perm,want)
 LOOP
  IF pathways.p09_role_allows(c.role,c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'p09_role_allows(%,%) expected %',c.role,c.perm,c.want; END IF;
  IF EXISTS(SELECT FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
   JOIN pathways.permissions p ON p.id=rp.permission_id WHERE r.code=c.role AND p.code=c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'role_permissions(%,%) expected %',c.role,c.perm,c.want; END IF;
 END LOOP;
END $$;

DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['pathways_runtime','rules_human_owner','rules_outcome_owner','rules_eligibility_owner','rules_config_owner',
  'rules_capacity_owner','rules_runtime_guard_owner','rules_enqueue_owner','rules_source_proof_owner'] LOOP
  IF NOT has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % cannot execute p09_role_allows after 0055',r; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % can execute p09_role_allows after 0055',r; END IF;
 END LOOP;
END $$;
ROLLBACK;
```

- [ ] **Step 2: Wire the test into the replay**

In `Replay-Local.ps1`, directly after the line `Write-Output 'P09_ROLE_ALLOWS_GRANTS_RUNTIME=PASS'`, add these lines inside the same guarded block:

```powershell
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/rbac-v4-grants-runtime.sql'))) $phase6Database
      Write-Output 'RBAC_V4_GRANTS_RUNTIME=PASS'
```

- [ ] **Step 3: Run the replay to verify it fails**

Run: `pwsh infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline`
Expected: FAIL with `p09_role_allows(PROGRAM_MANAGER,projects.archive) expected f`.

- [ ] **Step 4: Write the migration**

`apps/api/prisma/migrations/0055_rbac_v4_grants/migration.sql`:

```sql
-- cr-pathways-rbac-v4-grant-migration: RBAC v4 cells V4-C01, C02, C06, C07, C09 and C10.
-- CREATE OR REPLACE keeps the p09_role_allows ACL restored by 0054; the body wraps the 0051 matrix.
-- PO keeps beneficiaries.aggregates.read (re-sourced to v4 rows 112-117) and submissions.write (V4-C11 scoped in the API).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0054_p09_role_allows_grants'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0055 requires the verified 0054 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,5);

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1 IN ('PROGRAM_MANAGER','GRANT_MANAGER') AND $2='activities.read')
  OR (NOT (($1='PROGRAM_MANAGER' AND $2='projects.archive')
   OR ($1='GRANT_MANAGER' AND $2='projects.archive')
   OR ($1='SYSTEM_ADMINISTRATOR' AND $2='budgets.read')
   OR ($1='PROJECT_OFFICER' AND $2='activities.create')
   OR ($1='PROJECT_OFFICER' AND $2='dashboards.customize')
   OR ($1='PROJECT_OFFICER' AND $2='assessments.read')
   OR ($1='PROJECT_OFFICER' AND $2='analytics.saddd.read'))
  AND (($1 IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
    AND $2 IN ('indicators.library.read','indicators.library.create','indicators.library.archive'))
   OR pathways.p09_role_allows_0048($1,$2)))
$matrix$;

DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND (r.code,p.code) IN (
 ('PROGRAM_MANAGER','projects.archive'),('GRANT_MANAGER','projects.archive'),('SYSTEM_ADMINISTRATOR','budgets.read'),
 ('PROJECT_OFFICER','activities.create'),('PROJECT_OFFICER','dashboards.customize'),
 ('PROJECT_OFFICER','assessments.read'),('PROJECT_OFFICER','analytics.saddd.read'));

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='activities.read'
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER')
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ BEGIN
 IF pathways.p09_role_allows('PROJECT_OFFICER','activities.create')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.read')
 OR pathways.p09_role_allows('GRANT_MANAGER','projects.archive')
 OR NOT pathways.p09_role_allows('PROGRAM_MANAGER','activities.read')
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','activities.create')
 OR NOT pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.aggregates.read')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 OR NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 OR (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM pg_catalog.pg_proc w, unnest(w.proacl) x
   WHERE w.oid='pathways.p09_role_allows(text,text)'::pg_catalog.regprocedure)
  IS DISTINCT FROM (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM pg_catalog.pg_proc s, unnest(s.proacl) x
   WHERE s.oid='pathways.p09_role_allows_0035(text,text)'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0055 verification failed'; END IF;
END $$;
COMMIT;
```

- [ ] **Step 5: Check the RLS policies that read `role_permissions` directly**

Run: `git grep -n "role_permissions" apps/api/prisma/migrations/0035_admin_read_access apps/api/prisma/migrations/0000_pathways_baseline_through_0026 | grep -i "policy\|p05_has"`

Expected: `p05_has_project_permission` resolves through `role_permissions` or `p09_role_allows`. Both are synced above, so no policy edit is needed. If a policy names a role code literally for one of the seven cells, stop and report it. Do not patch it silently.

- [ ] **Step 6: Run the replay to verify it passes**

Run: `pwsh infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline`
Expected: exit 0. Output includes `P09_ROLE_ALLOWS_GRANTS_RUNTIME=PASS` and `RBAC_V4_GRANTS_RUNTIME=PASS`. The inventory checks fail until Task 2, so run Task 2 before this step if the replay aborts on the ledger count.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/migrations/0055_rbac_v4_grants apps/api/prisma/tests/rbac-v4-grants-runtime.sql infra/supabase/phase6/Replay-Local.ps1
git commit -m "feat(db): add 0055 RBAC v4 grant migration with runtime checks"
```

### Task 2: Migration inventories (30 rows, 37 steps)

**Files:**
- Modify: `scripts/db/hosted-plan.mjs` (comment at line 7, the list ending at line 40, the comment near line 113, the message near line 155)
- Modify: `scripts/db/hosted-plan.test.mjs` (lines 27-28, the steps list near line 75, the tests near lines 238 and 264)
- Modify: `apps/api/prisma/legacy-retirement.test.ts` (list ending near line 67)
- Modify: `infra/supabase/phase6/Verify-Forward.ps1` (list ending at line 43, plus any grant-count constant)

**Interfaces:**
- Consumes: `0055_rbac_v4_grants` from Task 1.

- [ ] **Step 1: Update the test expectations first**

In `hosted-plan.test.mjs`:
- Change the length assertion: `assert.equal(MIGRATIONS_IN_ORDER.length, 30)`.
- Update the comment to `30 rows (baseline plus 0027-0055)`.
- Append `'deploy:0055_rbac_v4_grants',` to the expected step list directly after `'deploy:0054_p09_role_allows_grants',`.
- Add this test:

```js
test('planIndexForAppliedCount on a 0000-0054 ledger resumes at the 0055 deploy', () => {
  const index = planIndexForAppliedCount(MIGRATIONS_IN_ORDER.length - 1)
  assert.equal(buildPlan()[index].id, 'deploy:0055_rbac_v4_grants')
})
```

Before writing it, check how the existing tests call the plan builder (`grep -n "buildPlan\|function plan" scripts/db/hosted-plan.mjs`) and use the same exported name. Rename the existing complete-ledger test title to `0000-0055`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/db/hosted-plan.test.mjs`
Expected: FAIL, because the length is 29 and not 30.

- [ ] **Step 3: Update the inventories**

- Append `'0055_rbac_v4_grants',` after `'0054_p09_role_allows_grants',` in `hosted-plan.mjs`, `legacy-retirement.test.ts` and `Verify-Forward.ps1`. In the `.ps1` file, move the trailing comma as the array syntax there requires.
- Update the `hosted-plan.mjs` comments and messages from 29/0054 to 30/0055.
- Add the comment `// 0055 needs no preprovision: prisma owns pathways.p09_role_allows.` next to the 0054 one.
- If `Verify-Forward.ps1` asserts a `role_permissions` row count, lower it by 5 (7 revokes, 2 grants). Run `git grep -n "317" infra scripts apps/api/prisma` to find each copy.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/db/hosted-plan.test.mjs && pnpm --filter @pathways/api exec vitest run prisma/legacy-retirement.test.ts`
Expected: PASS.

Then run: `pwsh infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline`
Expected: exit 0 with `RBAC_V4_GRANTS_RUNTIME=PASS`.

- [ ] **Step 5: Commit**

```bash
git add scripts/db/hosted-plan.mjs scripts/db/hosted-plan.test.mjs apps/api/prisma/legacy-retirement.test.ts infra/supabase/phase6/Verify-Forward.ps1
git commit -m "chore(db): register 0055 in hosted plan, replay and retirement inventories"
```

### Task 3: API contract, policy and V4-C11 direct-entry scope

**Files:**
- Modify: `apps/api/src/modules/auth/rbac-contract.json` (`permissions` holder lists; append to `amendments`)
- Modify: `apps/api/src/modules/auth/authorization-policy.ts` (role arrays for SYSTEM_ADMINISTRATOR, PROJECT_OFFICER, PROGRAM_MANAGER, GRANT_MANAGER)
- Modify: `apps/api/src/modules/auth/csv-rbac.test.ts`
- Modify: `apps/api/src/modules/metadata/metadata.service.ts` (`validateSubmission`-style method near line 590 and `saveSubmission` near line 608)
- Test: `apps/api/src/modules/metadata/metadata.service.test.ts`

**Interfaces:**
- Consumes: the migration file text from Task 1. The contract test reads it.
- Produces: `DIRECT_ENTRY_FORM_TYPES: readonly FormType[]` exported from `metadata.service.ts`. Task 5 mirrors this list in the web.

- [ ] **Step 1: Write the failing contract tests**

In `csv-rbac.test.ts`:
- In `enforces detailed rows over conflicting overviews`, replace `expect(rolePermissions.PROJECT_OFFICER).toContain('activities.create')` with `expect(rolePermissions.PROJECT_OFFICER).not.toContain('activities.create')`.
- In `gives System Administrator read-only activity and budget views...`, replace `expect(rolePermissions.SYSTEM_ADMINISTRATOR).toContain('budgets.read')` with the `not` form, and rename the test to `gives System Administrator read-only activity views without budget detail or writes`.
- Add:

```ts
  it('applies RBAC v4 cells through 0055', () => {
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const) {
      expect(rolePermissions[role]).toContain('activities.read')
      expect(rolePermissions[role]).not.toContain('projects.archive')
      expect(rolePermissions[role]).not.toContain('activities.create')
    }
    for (const permission of [
      'dashboards.customize',
      'assessments.read',
      'analytics.saddd.read',
    ] as const) {
      expect(rolePermissions.PROJECT_OFFICER).not.toContain(permission)
    }
    // V4-C10 decision: PO aggregates stay, re-sourced to v4 reporting rows 112-117.
    expect(rolePermissions.PROJECT_OFFICER).toContain('beneficiaries.aggregates.read')
    // V4-C11 decision: submissions.write stays for survey and activity-monitoring entry.
    expect(rolePermissions.PROJECT_OFFICER).toContain('submissions.write')
  })
```

- [ ] **Step 2: Write the failing direct-entry test**

In `metadata.service.test.ts`, use the existing published-form fixture and actor helpers in that file (find them with `grep -n "PUBLISHED\|formType" apps/api/src/modules/metadata/metadata.service.test.ts`). Add:

```ts
  it.each(['OUTCOME_MONITORING', 'OTHER'] as const)(
    'refuses direct entry for retired generic %s forms',
    async (formType) => {
      // Arrange a PUBLISHED form of this type with the file's existing fixture helper.
      await expect(
        service.saveSubmission(identity, projectId, formId, validInput),
      ).rejects.toThrow('Encode Project Data is retired; import this form instead.')
    },
  )
  it('keeps direct entry for training surveys', async () => {
    // Arrange a PUBLISHED TRAINING_SURVEY form with the same helper.
    await expect(
      service.saveSubmission(identity, projectId, formId, validInput),
    ).resolves.toBeDefined()
  })
```

Replace the two arrange comments with the fixture calls already used by the nearest existing `saveSubmission` test in the file, setting `formType` on the form.

- [ ] **Step 3: Run to verify both fail**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/auth/csv-rbac.test.ts src/modules/metadata/metadata.service.test.ts`
Expected: FAIL. PO still holds `activities.create`, and the save for `OTHER` resolves.

- [ ] **Step 4: Update the contract and policy**

In `rbac-contract.json` `permissions`:
- remove `PROGRAM_MANAGER` and `GRANT_MANAGER` from `projects.archive`
- remove `SYSTEM_ADMINISTRATOR` from `budgets.read`
- add `PROGRAM_MANAGER` and `GRANT_MANAGER` to `activities.read`
- remove `PROJECT_OFFICER` from `activities.create`, `dashboards.customize`, `assessments.read` and `analytics.saddd.read`

Append to `amendments`:

```json
{
  "changeRecord": "cr-pathways-rbac-v4-grant-migration",
  "migration": "0055_rbac_v4_grants",
  "rows": [35, 40, 42, 46, 47, 97, 100, 103],
  "grants": [["PROGRAM_MANAGER", "activities.read"], ["GRANT_MANAGER", "activities.read"]],
  "revokes": [
    ["PROGRAM_MANAGER", "projects.archive"], ["GRANT_MANAGER", "projects.archive"],
    ["SYSTEM_ADMINISTRATOR", "budgets.read"], ["PROJECT_OFFICER", "activities.create"],
    ["PROJECT_OFFICER", "dashboards.customize"], ["PROJECT_OFFICER", "assessments.read"],
    ["PROJECT_OFFICER", "analytics.saddd.read"]
  ]
}
```

In `authorization-policy.ts`, make the same edits to the role arrays:
- SYSTEM_ADMINISTRATOR: drop `'budgets.read'`. Change the comment above it to `// Read-only activity view: cr-pathways-admin-read-access (0035); budget read revoked by 0055.`
- PROJECT_OFFICER: drop the four permissions.
- PROGRAM_MANAGER and GRANT_MANAGER: drop `'projects.archive'` and add `'activities.read'`.

- [ ] **Step 5: Scope direct entry**

In `metadata.service.ts`, add this near the top-level constants:

```ts
// V4-C11: direct entry stays only for survey, test and activity-monitoring forms.
export const DIRECT_ENTRY_FORM_TYPES = ['TRAINING_SURVEY', 'PRE_TEST', 'POST_TEST', 'ACTIVITY_MONITORING'] as const
```

In both the validate method and `saveSubmission`, directly after the existing `BENEFICIARY_REGISTRATION` check (add that check to validate if it is missing), add:

```ts
        if (!(DIRECT_ENTRY_FORM_TYPES as readonly string[]).includes(form.formType)) {
          throw new ConflictException('Encode Project Data is retired; import this form instead.')
        }
```

Keep `BENEFICIARY_REGISTRATION` first so its message is unchanged.

- [ ] **Step 6: Run to verify pass, then the full API suite**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/auth/csv-rbac.test.ts src/modules/metadata`
Expected: PASS.

Run: `pnpm --filter @pathways/api test`
Fix any other assertion that encodes one of the seven old cells: `authorization-policy.test.ts`, `route-access.service.test.ts`, `workspace-resolution.service.test.ts`, `supabase-auth.guard.test.ts` and `activities.access.test.ts` are the likely ones. Flip only assertions about those cells, and record each file you touch in the commit body. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/modules/metadata apps/api/src/modules/activities apps/api/src/common
git commit -m "feat(api): apply RBAC v4 cells and scope direct entry to survey and monitoring forms"
```

### Task 4: Stale-session enforcement test

**Files:**
- Test: `apps/api/src/modules/auth/workspace-resolution.service.test.ts`

**Interfaces:**
- Consumes: the post-Task-3 `rolePermissions`.

- [ ] **Step 1: Write the test**

Find how the file builds a resolved actor from database role rows (`grep -n "role_permissions\|permissions:" apps/api/src/modules/auth/workspace-resolution.service.test.ts`). Add a case where the token carries `PROJECT_OFFICER` and the mocked database role grants come from the post-0055 contract. Assert that the resolved `permissions` excludes `activities.create` and includes `activities.proof.submit`:

```ts
  it('resolves v4 Project Officer permissions from the database, not the token', async () => {
    // Arrange with the file's existing PROJECT_OFFICER fixture; database grants from rolePermissions.PROJECT_OFFICER.
    const actor = await service.resolve(identity)
    expect(actor.permissions).not.toContain('activities.create')
    expect(actor.permissions).toContain('activities.proof.submit')
  })
```

Use the file's actual service method name and fixture in place of `resolve` and the arrange comment.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/auth/workspace-resolution.service.test.ts`
Expected: PASS if permissions resolve per request. If it fails because permissions come from a cached claim, stop. Report it as a blocking finding; do not work around it.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/workspace-resolution.service.test.ts
git commit -m "test(api): pin per-request resolution of v4 Project Officer grants"
```

### Task 5: Web routes and permission-gated UI

**Files:**
- Modify: `apps/web/src/lib/rbac/route-access.ts:93` (remove `manualEntry`)
- Delete: `apps/web/src/app/(dashboard)/collection/entry/page.tsx`
- Create: `apps/web/src/app/(dashboard)/collection/entry/page.tsx` as a redirect (replaces the deleted file)
- Modify: `apps/web/src/features/collection/collection-workspace.tsx` (the `submissions.write` and entry references)
- Modify: `apps/web/src/features/collection/direct-form-entry-workspace.tsx` (gate on form type)
- Test: `apps/web/src/lib/rbac/route-access.frontend-aliases.test.ts`, `apps/web/src/features/collection/direct-entry-ownership.test.tsx`, `apps/web/src/features/collection/collection-workspace.test.tsx`

**Interfaces:**
- Consumes: the form-type list from Task 3. Mirror it in the web as `DIRECT_ENTRY_FORM_TYPES` in `direct-form-entry-workspace.tsx`, with the same four values and the comment `// Mirrors the API DIRECT_ENTRY_FORM_TYPES (V4-C11).`

- [ ] **Step 1: Write the failing tests**

- In `route-access.frontend-aliases.test.ts`, assert that no route entry has path `/collection/entry`.
- In `collection-workspace.test.tsx`, assert that no link named `Encode project data` renders for a PO actor.
- In `direct-entry-ownership.test.tsx`, add a case: a published `OTHER` form shows no "Direct data entry" action, and a `TRAINING_SURVEY` form still does.

Follow each file's existing render helpers.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @pathways/web exec vitest run src/lib/rbac src/features/collection`
Expected: FAIL on all three new assertions.

- [ ] **Step 3: Implement**

- Remove the `manualEntry` entry and every reference to it (`git grep -n "manualEntry" apps/web/src`).
- Replace `collection/entry/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

// Encode Project Data is retired (V4-C11); old links land on Collection.
export default function CollectionEntryPage() {
  redirect('/collection')
}
```

- In `direct-form-entry-workspace.tsx` and `collection-workspace.tsx`, show the direct-entry action only when `DIRECT_ENTRY_FORM_TYPES.includes(form.formType)` and the actor holds `submissions.write`.

- [ ] **Step 4: Check that permission-gated UI uses permissions, not role names**

Run: `git grep -n "PROJECT_OFFICER\|PROGRAM_MANAGER\|GRANT_MANAGER\|SYSTEM_ADMINISTRATOR" apps/web/src/features -- ':!*.test.*'`
Expected: no hit that gates Add activity, Archive project, Customize dashboard, survey assessments, SADDD or budget panels by role name. Replace any such hit with the matching permission check (`activities.create`, `projects.archive`, `dashboards.customize`, `assessments.read`, `analytics.saddd.read`, `budgets.read`). Add one test per replaced gate in that feature's existing test file.

- [ ] **Step 5: Run web tests, typecheck, lint and e2e**

Run: `pnpm --filter @pathways/web test && pnpm typecheck && pnpm lint`
Expected: PASS.

Run: `git grep -ln "collection/entry\|activities.create" apps/web/e2e`. Update each spec where a PO creates an activity or opens `/collection/entry`: switch the actor to Project Manager, or assert the redirect.

Run: `pnpm --filter @pathways/web exec playwright test` against `pnpm dev:local`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): retire Encode Project Data route and scope direct entry to survey and monitoring forms"
```

### Task 6: Documentation and CR

**Files:**
- Create: `docs/cr-pathways-rbac-v4-grant-migration.md` (from `docs/change-record-template.md`)
- Modify:
  - `docs/cr-pathways-rbac-v4-adoption.md` (section 3.2 rows V4-C10 and V4-C11, section 9)
  - `docs/deferred-features.md` (remove the "RBAC v4 grant migration" row)
  - `docs/prd-pathways.md` (v4 target annotations become live)
  - `docs/qad-pathways.md` section 3.7
  - `docs/sdd-pathways.md` (migration count)
  - `docs/runbook-role-staging-build.md` (30 rows, 37-step plan, a "Applying 0055" subsection)
  - `docs/index.md`, `docs/state.md`, `docs/activity-log.md`, `docs/log-pathways.md`

- [ ] **Step 1: Write the CR**

Sections:
- Trigger: the v4 adoption CR section 3.2.
- Current contract.
- Proposed change: the seven cells, plus the two decisions below.
- Data/Migration: 0055, no preprovision, fix-forward rollback by a later migration.
- Verification: replay markers and the hosted check in Task 7.
- Approval: the developer on 2026-10-02.
- Disposition: Approved, set to Applied in Task 7.

The two decisions:
- V4-C10: PO `beneficiaries.aggregates.read` is re-sourced to v4 reporting rows 112-117.
- V4-C11: the generic screen is retired, and `submissions.write` is kept for the four form types as a V4-R5-style kept deviation.

- [ ] **Step 2: Propagate**

- In the adoption CR, update the V4-C10 action to `Revoke analytics.saddd.read; beneficiaries.aggregates.read re-sourced to v4 rows 112-117`.
- Update the V4-C11 action to `Retire /collection/entry; submissions.write kept for TRAINING_SURVEY, PRE_TEST, POST_TEST and ACTIVITY_MONITORING`.
- Set section 9 to `Code applied by 0055 under cr-pathways-rbac-v4-grant-migration.`
- In PRD, replace each "v4 target" annotation for the seven cells with the live wording.
- Add QAD 3.7 rows citing `RBAC_V4_GRANTS_RUNTIME` and the Task 3 and Task 5 tests.

- [ ] **Step 3: Verify**

Run `pnpm docs:check` on a clean export: `git worktree add ../pathways-docs-check HEAD`, then run it there (untracked reference folders fail voice and trace by design). Remove the worktree after.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: record RBAC v4 grant migration and retire its deferred row"
```

### Task 7: Review, integrate and apply to role-staging

**Files:** none beyond review fixes.

- [ ] **Step 1: SAD review.** Dispatch these with a SAD section 4.2 handoff packet (diff `dev...feat/rbac-v4-grants`, migration bytes, replay output), in parallel:
  - `migration-integrity-guardian`
  - `organization-isolation-checker`
  - `beneficiary-privacy-guardian`
  - `restraint-guardian`

  Fix any blocking finding in a new commit and re-run that reviewer.
- [ ] **Step 2: Whole-branch code review.** Use superpowers:requesting-code-review.
- [ ] **Step 3: Gates on the branch head.** Run `pnpm typecheck && pnpm lint && pnpm test`, then `pwsh infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline`. Expected: all green, with `RBAC_V4_GRANTS_RUNTIME=PASS`.
- [ ] **Step 4: Merge to dev and push.** Merge with `--no-ff` into `dev` and push `origin dev` as `ceezey`. A merge conflict stops the run.
- [ ] **Step 5: Hosted precheck.** Using the Supabase MCP `execute_sql` (read-only) on `klbtoqdalmcsfjqophty`, run `SELECT migration_name, checksum FROM public._prisma_migrations ORDER BY started_at`. Expected: exactly 29 finished rows, ending in `0054_p09_role_allows_grants`, with checksums equal to the local files. Any difference stops the run.
- [ ] **Step 6: Apply under the auto-migrate rule.** Proceed only if Steps 1 and 3 are green. Run the `--resume` command in `docs/runbook-role-staging-build.md` section 7. Expected: it deploys 0055, alters the runtime role, and the postconditions pass.
- [ ] **Step 7: Hosted verify.** Read-only checks:
  - ledger has 30 rows
  - `pathways.p09_role_allows('PROJECT_OFFICER','activities.create')` is false
  - `('GRANT_MANAGER','activities.read')` is true
  - the `p09_role_allows` ACL equals `p09_role_allows_0035`

  Record these in runbook section 8. Set the CR to Applied. Commit `docs: record role-staging 0055 verified facts`, merge to `dev` and push.
