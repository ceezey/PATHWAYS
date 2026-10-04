# Extension Requests and Escalated Alerts (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the activity extension request workflow (Project Officer requests, M&E Officer verifies or returns, Project Manager approves or declines; approval moves the activity planned end date) and a read-only escalated-alerts queue for Program and Grant Managers, then surface both on the role dashboards.

**Architecture:** Migration 0061 adds one prisma-owned table `pathways.activity_extension_requests` with RLS and column-level grants (0043 pattern, no DBA preprovision). Migration 0062 adds one read-only SECURITY DEFINER function `pathways.f10_escalated_alert_list(jsonb)` owned by `rules_human_owner` (f10_alert_list pattern) behind a new temporary SET-chain preprovision/cleanup pair (0059/0060 pattern). A new isolated NestJS module `activity-extensions` owns the workflow; approval runs the existing `ACTIVITY_UPDATE` rule source operation in the same transaction so rules re-evaluate. The role overview contract and layouts gain extension and escalation sections.

**Tech Stack:** PostgreSQL 17/18 (Supabase), Prisma 6, NestJS 11, zod, Next.js 15, Vitest, PowerShell replay harness.

**Spec:** User decisions 2026-10-04 (session): extension = PO requests, M&E reviews, PM approves and the date updates; escalation = read-only queue of alerts whose latest outcome is ESCALATE, lifecycle unchanged (PRD prd-pathways.md:1228); evaluation approval out of scope. Plan 1: `docs/superpowers/plans/2026-10-04-role-dashboards.md`.

## Global Constraints

- Migrations are append-only: never edit 0000-0060 (`pnpm sad:check` blocks byte changes). Next numbers: `0061_activity_extension_requests`, `0062_rules_escalated_alert_list`.
- Never run `prisma migrate dev`. Hosted apply only through `scripts/db/hosted-build.mjs` after the local replay gate passes; clear `.tmp/hosted-build/migrations` before any `--resume`.
- No new permission codes and no grant-matrix change (role_permissions total stays 312). Gates: request `activities.proof.submit` plus an ACTIVE activity assignment; verify/return `evidence.review` and role MONITORING_AND_EVALUATION_OFFICER; approve/decline `activities.update` and role PROJECT_MANAGER; read `activities.read`; escalated list `alerts.read`.
- Separation of duties: verifier differs from requester; decider differs from requester and verifier (DB CHECK and service).
- One open request (PENDING or VERIFIED) per activity (partial unique index).
- Reason and notes: 10-2000 trimmed characters. Requested end date must be later than the current planned end date.
- ESCALATE never changes alert lifecycle; the escalated list reads only `decisions` columns granted to `rules_human_owner` (id, organization_id, project_id, alert_id, outcome, created_at) and never the note or actor.
- Every API query keeps `organizationId` + `projectScope(actor)`; raised SQL codes map 42501->403, 22023->400, 40001/23505->409.
- Comments one sentence, no emojis, Biome formatting, kebab-case docs. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A Project Officer not assigned to the activity must be refused (403) even with `activities.proof.submit` (Task 3).
- Approving when the activity changed since the request (stale `expectedUpdatedAt`) must 409 and leave both the request and the activity unchanged (Task 3).
- A requested date beyond the project end date must carry a timeline justification into the ACTIVITY_UPDATE source operation or the database refuses it; approval must pass the request reason as the justification only in that case (Task 3).
- A Program Manager must only see escalations for projects where `p06_can('alerts.read')` holds; a Grant Manager sees the same list with no action (Tasks 2, 6, 8).
- Replaying the same `clientMutationId` for a request must return the same request, not a second row (Task 3).

---

### Task 1: Migration 0061 activity_extension_requests (+ schema, inventories, runtime SQL test)

**Files:**
- Create: `apps/api/prisma/migrations/0061_activity_extension_requests/migration.sql`
- Create: `apps/api/prisma/tests/activity-extension-requests-runtime.sql`
- Modify: `apps/api/prisma/schema.prisma` (new model after `ActivityOverdueExplanation`; back-relations on `Organization`, `Project`, `ProjectActivity`, `SystemUser`)
- Modify inventories: `scripts/db/hosted-plan.mjs` (MIGRATIONS_IN_ORDER, comment "35-row" -> "36-row", deploy step with "0061 needs no preprovision" comment placed after the 0060 cleanup step, "0000-0060" -> "0000-0061"), `scripts/db/hosted-plan.test.mjs` (length 36, step order), `scripts/db/hosted-build.mjs` and `scripts/db/hosted-build.local.test.mjs` ("0000-0060" strings), `apps/api/prisma/legacy-retirement.test.ts` (list), `infra/supabase/phase6/Verify-Forward.ps1` (`$forwardInventory` adds the table), `infra/supabase/phase6/Replay-Local.ps1` (`PATHWAYS_EXPECTED_TABLE_COUNT` 59 -> 60; wire the new runtime SQL suite like the existing ones near line 595), schema drift expected file via `Test-SchemaDrift.ps1 -Accept` after review.

**Interfaces:**
- Produces: table `pathways.activity_extension_requests` with columns `id, organization_id, project_id, activity_id, current_end_date date, requested_end_date date, reason, status ('PENDING'|'VERIFIED'|'RETURNED'|'APPROVED'|'DECLINED'), requested_by_id, requested_at, verified_by_id, verified_at, verification_note, decided_by_id, decided_at, decision_note, client_mutation_id, updated_at`; Prisma model `ActivityExtensionRequest` (fields camelCase, `@@map("activity_extension_requests")`, `@@schema("pathways")`).

- [ ] **Step 1: Write the runtime SQL test** (`activity-extension-requests-runtime.sql`; mirror the structure of an existing `apps/api/prisma/tests/*-runtime.sql` file such as the overdue explanation or indicator-type runtime suite: set role pathways_runtime, set `app.organization_id`/`app.user_id`, seed synthetic org/project/activity/users through the existing fixture helpers those suites use). Assertions (each `DO $$ ... RAISE EXCEPTION 'FAIL ...'` on violation, `RAISE NOTICE 'PASS ...'` otherwise):
  1. PO with `activities.proof.submit` on the project can INSERT a PENDING row for their own `requested_by_id`; inserting with another user's id fails (RLS).
  2. A second PENDING row for the same activity fails on `activity_extension_requests_open_key`.
  3. `requested_end_date <= current_end_date` fails the date CHECK; a 9-char reason fails the reason CHECK.
  4. An UPDATE setting `verified_by_id = requested_by_id` fails the separation CHECK; setting `decided_by_id = verified_by_id` fails.
  5. `pathways_runtime` has no DELETE and no UPDATE on `reason`/`requested_end_date` (has_column_privilege checks).
  6. A user without `activities.read` on the project sees 0 rows.

- [ ] **Step 2: Run it against a template to see it fail**

Run (PowerShell, repo root): `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate` then `./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File apps/api/prisma/tests/activity-extension-requests-runtime.sql`
Expected: FAIL, relation `pathways.activity_extension_requests` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- cr-pathways-activity-extension-request: a Project Officer assigned to an activity requests a later planned end date
-- with a reason; the M&E officer verifies or returns it; the Project Manager approves or declines it. Approval moves the
-- activity planned end date through the API's ACTIVITY_UPDATE rule source operation, not through this table.
-- One prisma-owned table with composite FKs, RLS enabled and forced, append-only fields (no UPDATE on request content,
-- no DELETE), column-level UPDATE for the review fields only. Separation of duties and one open request per activity are
-- enforced here. Only prisma-owned helpers are used, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0060_rules_budget_beneficiary_survey_metrics'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0061 requires the verified 0060 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname='activity_extension_requests')
 THEN RAISE EXCEPTION '0061 requires the table to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.projects'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0061 requires prisma ownership of its referenced tables'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0061 requires prisma ownership of pathways.p05_has_project_permission'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE TABLE pathways.activity_extension_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    current_end_date date,
    requested_end_date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'PENDING' NOT NULL,
    requested_by_id uuid NOT NULL,
    requested_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_by_id uuid,
    verified_at timestamp(3) with time zone,
    verification_note text,
    decided_by_id uuid,
    decided_at timestamp(3) with time zone,
    decision_note text,
    client_mutation_id uuid NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT activity_extension_requests_status_check CHECK (
     status = ANY (ARRAY['PENDING','VERIFIED','RETURNED','APPROVED','DECLINED'])),
    CONSTRAINT activity_extension_requests_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_date_check CHECK (current_end_date IS NULL OR requested_end_date > current_end_date),
    CONSTRAINT activity_extension_requests_verification_note_check CHECK (
     verification_note IS NULL OR char_length(btrim(verification_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_decision_note_check CHECK (
     decision_note IS NULL OR char_length(btrim(decision_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_verifier_check CHECK (verified_by_id IS NULL OR verified_by_id <> requested_by_id),
    CONSTRAINT activity_extension_requests_decider_check CHECK (
     decided_by_id IS NULL OR (decided_by_id <> requested_by_id AND decided_by_id IS DISTINCT FROM verified_by_id)),
    CONSTRAINT activity_extension_requests_state_check CHECK (
     (status = 'PENDING' AND verified_by_id IS NULL AND decided_by_id IS NULL)
     OR (status IN ('VERIFIED','RETURNED') AND verified_by_id IS NOT NULL AND verified_at IS NOT NULL AND decided_by_id IS NULL)
     OR (status IN ('APPROVED','DECLINED') AND verified_by_id IS NOT NULL AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL))
);

ALTER TABLE pathways.activity_extension_requests OWNER TO prisma;
ALTER TABLE ONLY pathways.activity_extension_requests ADD CONSTRAINT activity_extension_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_scope_key UNIQUE (organization_id, project_id, activity_id, id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_client_key UNIQUE (organization_id, client_mutation_id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_project_fk FOREIGN KEY (organization_id, project_id)
 REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_activity_fk FOREIGN KEY (organization_id, project_id, activity_id)
 REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_requested_by_fk FOREIGN KEY (organization_id, requested_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_verified_by_fk FOREIGN KEY (organization_id, verified_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_decided_by_fk FOREIGN KEY (organization_id, decided_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX activity_extension_requests_open_key ON pathways.activity_extension_requests
 (organization_id, project_id, activity_id) WHERE status IN ('PENDING','VERIFIED');
CREATE INDEX activity_extension_requests_status_idx
 ON pathways.activity_extension_requests (organization_id, project_id, status, requested_at);
CREATE INDEX activity_extension_requests_requested_by_idx
 ON pathways.activity_extension_requests (organization_id, requested_by_id);

ALTER TABLE ONLY pathways.activity_extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.activity_extension_requests FORCE ROW LEVEL SECURITY;

-- Reads follow activity read scope; the context is read directly, never through postgres-owned wrappers.
CREATE POLICY p05_activity_extension_requests_select ON pathways.activity_extension_requests
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('activities.read', activity_extension_requests.project_id)
 );
CREATE POLICY p05_activity_extension_requests_insert ON pathways.activity_extension_requests
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND requested_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND status = 'PENDING'
  AND pathways.p05_has_project_permission('activities.proof.submit', activity_extension_requests.project_id)
 );
CREATE POLICY p05_activity_extension_requests_update ON pathways.activity_extension_requests
 FOR UPDATE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND (pathways.p05_has_project_permission('evidence.review', activity_extension_requests.project_id)
   OR pathways.p05_has_project_permission('activities.update', activity_extension_requests.project_id))
 ) WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND (verified_by_id IS NULL OR decided_by_id IS NOT NULL OR verified_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
  AND (decided_by_id IS NULL OR decided_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
 );

-- Request content is immutable; only the review fields can change, and nothing is deleted.
GRANT SELECT, INSERT ON TABLE pathways.activity_extension_requests TO pathways_runtime;
GRANT UPDATE (status, verified_by_id, verified_at, verification_note, decided_by_id, decided_at, decision_note, updated_at)
 ON TABLE pathways.activity_extension_requests TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_extension_requests'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0061 ownership postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_extension_requests'::pg_catalog.regclass
  AND c.contype='c' AND c.convalidated)<>8
 THEN RAISE EXCEPTION '0061 check constraint postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_extension_requests'::pg_catalog.regclass
  AND c.contype='f')<>6
 THEN RAISE EXCEPTION '0061 foreign key postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.activity_extension_requests'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0061 row level security postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.activity_extension_requests'::pg_catalog.regclass)<>3
 THEN RAISE EXCEPTION '0061 policy postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.activity_extension_requests','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.activity_extension_requests','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_extension_requests','DELETE')
  AND has_column_privilege('pathways_runtime','pathways.activity_extension_requests','status','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','reason','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','requested_end_date','UPDATE'))
 THEN RAISE EXCEPTION '0061 grant postcondition failed'; END IF;
END $$;
COMMIT;
```

Add the Prisma model (match column names exactly; `status String`, dates `@db.Date`, timestamps `@db.Timestamptz(3)`; relations named like the overdue-explanation model's). Run `pnpm --filter api build` to regenerate the client.

- [ ] **Step 4: Update the inventories listed in Files** (exact counts: ledger 36 rows, table count 60; hosted-plan deploy step `{ type: 'deploy', name: '0061_activity_extension_requests' }` in the same object shape as the 0057 deploy step, with the comment `// 0061 needs no preprovision: prisma owns every table and helper it references.`).

- [ ] **Step 5: Run the gates**

Run: `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` (full gate, runs Verify-Forward and the new suite), `./infra/supabase/phase6/Test-SchemaDrift.ps1` (expect `SCHEMA_DRIFT=CLEAN` after `-Accept` of the reviewed new table only), `node --test scripts/db/hosted-plan.test.mjs`, `pnpm --filter api exec vitest run prisma/legacy-retirement.test.ts`, `pnpm sad:check`.
Expected: replay exit 0 with every new PASS line; drift CLEAN; tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations/0061_activity_extension_requests apps/api/prisma/tests/activity-extension-requests-runtime.sql apps/api/prisma/schema.prisma scripts/db infra/supabase/phase6 apps/api/prisma/legacy-retirement.test.ts
git commit -m "feat(db): 0061 activity extension requests table with RLS and review grants"
```

---

### Task 2: Migration 0062 escalated alert list (+ preprovision/cleanup pair, inventories, runtime SQL test)

**Files:**
- Create: `apps/api/prisma/migrations/0062_rules_escalated_alert_list/migration.sql`
- Create: `infra/supabase/phase6/hosted-rules-escalation-preprovision.sql`, `infra/supabase/phase6/hosted-rules-escalation-cleanup.sql` (copy `hosted-rules-catalog-preprovision.sql` / `-cleanup.sql` and change: header text to 0062; predecessor check requires `0061_activity_extension_requests` finished and `0062_rules_escalated_alert_list` absent; the SET-only chain grants and revokes prisma membership in `rules_human_owner` only; cleanup refuses while a 0062 ledger row is unfinished)
- Create: `apps/api/prisma/tests/escalated-alert-list-runtime.sql`
- Modify: `scripts/db/hosted-plan.mjs` (+ test: preprovision `rules-escalation` step, deploy 0062, cleanup step; ledger 37 rows; "0000-0062"; add 0062 to the cleanup-resume map like 0060), `scripts/db/local-reset.mjs` (0062 preprovision and cleanup entries like 0059/0060), `scripts/db/hosted-build.mjs` and its local test strings, `apps/api/prisma/legacy-retirement.test.ts`, `infra/supabase/phase6/Verify-Forward.ps1` (inventory: the function, owner rules_human_owner, EXECUTE only for pathways_runtime)

**Interfaces:**
- Produces: `pathways.f10_escalated_alert_list(input jsonb) RETURNS jsonb` with input keys `projectId?`, `cursor?`, `limit?` (via `pathways_rules_internal.read_page_input(input, ARRAY[]::text[])`), returning `{ items: [alert_json + { escalatedAt }], nextCursor }`; pages are cut by alert id (stable cursor) and items within a page are sorted by latest escalation time desc, then alert id.

- [ ] **Step 1: Write the runtime SQL test** (mirror the rules runtime suites: seed a rule, an alert, and decisions through the existing rules fixtures). Assertions: (1) an alert whose latest decision is ESCALATE is listed with `escalatedAt`; (2) an alert escalated then later ACCEPTed is not listed; (3) the alert lifecycle is unchanged by listing; (4) a user without `alerts.read` on the project gets no items, and an explicit unauthorized `projectId` raises 42501; (5) items never contain `note` or actor ids; (6) `session_user` other than pathways_runtime is refused.

- [ ] **Step 2: Run to verify it fails** (template + `Invoke-RuntimeSql.ps1`): function does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- 0062 rules escalated alert list (cr-pathways-escalated-alerts): a read-only page of alerts whose latest recorded
-- outcome is ESCALATE, for Program and Grant Manager dashboards. ESCALATE still records only an outcome and never changes
-- the alert lifecycle (PRD-F10). The function is owned by rules_human_owner, reads only the decisions columns granted to
-- that owner (no note, no actor), and filters every row with p06_can('alerts.read') and rule_exposure_allowed, exactly
-- like f10_alert_list. No table, column, policy or grant outside this function changes.
-- DBA prerequisite: run hosted-rules-escalation-preprovision.sql first and hosted-rules-escalation-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0061_activity_extension_requests'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0062 requires the verified 0061 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET')
 THEN RAISE EXCEPTION '0062 requires the temporary rules_human_owner SET chain (run hosted-rules-escalation-preprovision.sql)'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways.f10_escalated_alert_list(jsonb)')
 THEN RAISE EXCEPTION '0062 requires the function to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways.f10_alert_list(jsonb)'::pg_catalog.regprocedure)<>'rules_human_owner'
 THEN RAISE EXCEPTION '0062 requires rules_human_owner to own f10_alert_list'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE FUNCTION pathways.f10_escalated_alert_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record; rows_found record; ids uuid[]; times timestamptz[]; items jsonb; next_id uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY[]::text[]);
 IF page.project IS NOT NULL AND pathways.p06_can('alerts.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.array_agg(q.alert_id ORDER BY q.alert_id), pg_catalog.array_agg(q.escalated_at ORDER BY q.alert_id)
  INTO ids, times FROM (
  SELECT latest.alert_id, latest.created_at AS escalated_at FROM (
   SELECT DISTINCT ON (d.alert_id) d.alert_id, d.outcome, d.created_at
   FROM pathways_rules_internal.decisions d
   WHERE d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND d.alert_id IS NOT NULL AND (page.project IS NULL OR d.project_id=page.project)
   ORDER BY d.alert_id, d.created_at DESC, d.id DESC) latest
  JOIN pathways.rule_based_alerts a ON a.id=latest.alert_id
  WHERE latest.outcome='ESCALATE' AND a.runtime_contract_version='f10.v1'
   AND (page.after_id IS NULL OR latest.alert_id>page.after_id)
   AND pathways.p06_can('alerts.read',a.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
  ORDER BY latest.alert_id LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.alert_json(x.id)||pg_catalog.jsonb_build_object('escalatedAt',x.at) ORDER BY x.at DESC, x.id),'[]'::jsonb)
  INTO items FROM pg_catalog.unnest(ids[1:page.page_limit], times[1:page.page_limit]) AS x(id, at);
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;

ALTER FUNCTION pathways.f10_escalated_alert_list(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_escalated_alert_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_escalated_alert_list(jsonb) TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure)<>'rules_human_owner'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure)
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure) IS DISTINCT FROM ARRAY['search_path=""']
 THEN RAISE EXCEPTION '0062 function shape postcondition failed'; END IF;
 IF NOT has_function_privilege('pathways_runtime','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('anon','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION '0062 grant postcondition failed'; END IF;
END $$;
COMMIT;
```

Engineer checks before running (fix names, not logic): confirm `read_page_input` accepts an empty allowed-keys array and returns `project`, `after_id`, `page_limit` (0031 near line 3380); confirm `rules_human_owner` holds SELECT on `decisions(id, organization_id, project_id, alert_id, outcome, created_at)` (0031:5419) and that `d.id` is in that column grant (if not, order by `created_at DESC` only); confirm `alert_json` is callable by `rules_human_owner`. If `rules_human_owner` lacks CREATE on schema `pathways`, the function is created as prisma and then `ALTER ... OWNER TO rules_human_owner` (as written) needs only the SET chain.

- [ ] **Step 4: Write the preprovision/cleanup pair and inventories** (as listed in Files).

- [ ] **Step 5: Run the gates**: `Replay-Local.ps1 -MigrationBaseline` (local-reset applies the pair), the new runtime suite PASS lines, `Test-SchemaDrift.ps1` CLEAN, `node --test scripts/db/hosted-plan.test.mjs`, `pnpm sad:check`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations/0062_rules_escalated_alert_list apps/api/prisma/tests/escalated-alert-list-runtime.sql infra/supabase/phase6 scripts/db apps/api/prisma/legacy-retirement.test.ts
git commit -m "feat(db): 0062 read-only escalated alert list owned by rules_human_owner"
```

---

### Task 3: API activity-extensions module

**Files:**
- Create: `apps/api/src/modules/activity-extensions/activity-extensions.module.ts`, `activity-extensions.controller.ts`, `activity-extensions.service.ts`, `activity-extensions.dto.ts`, `activity-extensions.service.test.ts`, `activity-extensions.controller.test.ts`
- Modify: `apps/api/src/app.module.ts` (import `ActivityExtensionsModule`)
- Create: `packages/shared/src/monitoring/activity-extension.ts` (+ export in `packages/shared/src/index.ts`)

**Interfaces:**
- Produces (shared): `activityExtensionSchema` = `{ id, projectId, activityId, currentEndDate: day|null, requestedEndDate: day, reason, status, requestedBy: { id, name }, requestedAt, verifiedBy: {id,name}|null, verifiedAt|null, verificationNote|null, decidedBy|null, decidedAt|null, decisionNote|null }` (`.strict()`), `type ActivityExtension`.
- Produces (routes, all `Cache-Control: private, no-store`, under `@Controller('projects/:projectId/activities/:activityId/extension-requests')`):
  - `GET /` `@RequirePermission('activities.read')` -> `ActivityExtension[]` (latest 20, newest first)
  - `POST /` `@RequirePermission('activities.proof.submit')` body `{ requestedEndDate, reason, clientMutationId }` -> `ActivityExtension`
  - `POST /:requestId/verify` `@RequirePermission('evidence.review')` body `{ decision: 'VERIFY'|'RETURN', note, expectedUpdatedAt }`
  - `POST /:requestId/decide` `@RequirePermission('activities.update')` body `{ decision: 'APPROVE'|'DECLINE', note, expectedUpdatedAt, activityExpectedUpdatedAt, clientMutationId }`
- Service methods: `list(identity, projectId, activityId)`, `request(identity, projectId, activityId, dto)`, `verify(identity, projectId, activityId, requestId, dto)`, `decide(identity, projectId, activityId, requestId, dto)`.

Rules the service enforces (tests for each):
- `request`: activity in `projectScope`, status not COMPLETED/CANCELLED; caller has an ACTIVE `projectActivityAssignment` whose `projectAssignment.userId` is the caller (else 403); `requestedEndDate` > current planned end (else 400); replay of the same `clientMutationId` with identical body returns the existing row, different body -> 409; an existing open request -> 409; audit `ACTIVITY_EXTENSION_REQUESTED`.
- `verify`: caller role must be MONITORING_AND_EVALUATION_OFFICER (mirror the evidence review role check at activities.service.ts:2195-2201); request status PENDING and `updatedAt` equals `expectedUpdatedAt` (else 409); requester cannot verify (403); sets VERIFIED or RETURNED with note; audit `ACTIVITY_EXTENSION_VERIFIED|RETURNED`.
- `decide`: caller role PROJECT_MANAGER; status VERIFIED and `expectedUpdatedAt` matches; caller is neither requester nor verifier; DECLINE sets DECLINED with note; APPROVE runs, in ONE `withAuthorizedOperation(this.prisma, identity, 'activities.update', ...)` transaction:
  1. `beginRuleSourceOperation(tx, 'ACTIVITY_UPDATE', projectId, activityId, { kind: 'CLIENT_MUTATION', id: dto.clientMutationId }, body)` where `body` is built with the same helper `sourceMutationBody` used by `ActivitiesService.update` from an object holding the CURRENT activity values (`code`, `title`, `description`, `activityType`, `plannedStartDate`, `targetBeneficiaries`, `assignedUserIds` = current ACTIVE assignee user ids, `indicatorIds` and `journeyStageId` = current links, `budgetAllocation` omitted unless `sourceMutationBody` requires it) plus `plannedEndDate` = requested date, `expectedUpdatedAt` = `dto.activityExpectedUpdatedAt`, and `timelineOverrideJustification` = existing justification, or the request reason when the requested date is after the project end date and no justification exists. Read `sourceMutationBody` and the ACTIVITY_UPDATE branch of `canonical_source_request`/patch in `apps/api/prisma/migrations/0056_indicator_type/migration.sql:63-67,299-310` and match its required/allowed keys exactly.
  2. `tx.projectActivity.updateMany({ where: { id, organizationId, updatedAt: expected }, data: { plannedEndDate, timelineOverrideJustification, updatedAt: new Date(source.generatedValues.timestamp) } })`; count !== 1 -> 409.
  3. Update the request to APPROVED (decider, time, note) guarded by its own `updatedAt`.
  4. Audit `ACTIVITY_EXTENSION_APPROVED` (changes: from, to dates) and `finishRuleSourceOperation(tx, source.operationHandle, dto.clientMutationId)`.
  If the rule source operation rejects the patch, the whole transaction rolls back (request stays VERIFIED). Map SQL errors with the `sqlError` pattern in `apps/api/src/modules/rules/rules-source-operation.ts:162-175`.

- [ ] **Step 1: Write failing unit tests** in the style of `apps/api/src/modules/dashboards/action-counts.service.test.ts` (mock `withAuthorizedOperation`, `beginRuleSourceOperation`, `finishRuleSourceOperation`; tx mocks for `projectActivity`, `projectActivityAssignment`, `activityExtensionRequest`, `auditLog`). Cover: unassigned officer 403; date not later 400; replay returns same row; open request 409; M&E verify happy path + requester-cannot-verify; PM approve builds an ACTIVITY_UPDATE body with only `plannedEndDate` changed and calls updateMany then marks APPROVED then finish; stale activity -> 409 and request not updated; decline path; beyond-project-end approval carries the reason as justification. Controller test: route permissions metadata for the four handlers.
- [ ] **Step 2: Run to verify failure**: `pnpm --filter api exec vitest run src/modules/activity-extensions` -> module not found.
- [ ] **Step 3: Implement** shared contract, DTOs (class-validator like `activities.dto.ts:215` overdue explanation DTO: `@IsDateString()` requestedEndDate, `@IsString() @Length(10, 2000)` reason/note, `@IsUUID()` ids, `@IsIn([...])` decisions, `@IsISO8601()` expected times), service and controller, module registration.
- [ ] **Step 4: Run** `pnpm --filter api exec vitest run src/modules/activity-extensions`, `pnpm --filter @pathways/shared exec vitest run`, `pnpm --filter api build`. Then the local runtime check: with the template DB from Task 1, run the API local tests pattern (`*.local.test.ts`) by adding `activity-extensions.local.test.ts` that exercises request -> verify -> approve against the replayed database and asserts the activity `planned_end_date` changed and a second approve is refused (skip when the local database env is absent, like `dashboard-home-runtime.local.test.ts`).
- [ ] **Step 5: Commit** `feat(api): activity extension request workflow with M&E verification and PM approval`.

---

### Task 4: API escalated alerts read

**Files:**
- Modify: `apps/api/src/modules/rules/rules-human.service.ts` (operation `'ESCALATED_ALERT_LIST'` -> `SELECT pathways.f10_escalated_alert_list(${body}::jsonb) AS result`, method `listEscalatedAlerts(identity, query)` gated `alerts.read`, query schema `{ projectId?, cursor?, limit? }`, output `pageSchema(escalatedAlertOutputSchema)` where `escalatedAlertOutputSchema = alertOutputSchema.extend({ escalatedAt: instant })`)
- Modify: `apps/api/src/modules/rules/rules-human.controller.ts` (`GET alerts/escalated` declared BEFORE `GET alerts/:id`, `@RequirePermission('alerts.read')`)
- Modify: `apps/api/src/modules/rules/rules-human-contract.ts` and the web copy `apps/web/src/features/analytics/rules-human-contract.ts` (add `escalatedAlertOutputSchema`)
- Test: extend `rules-human.service.test.ts` / controller tests

- [ ] **Step 1: Failing tests**: the operation maps to the new SQL; route order (escalated before :id); permission metadata; output parse rejects items without `escalatedAt`.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run src/modules/rules` -> FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests and `pnpm --filter api build` -> PASS.
- [ ] **Step 5: Commit** `feat(api): escalated alerts read for portfolio dashboards`.

---

### Task 5: Role overview contract and service additions

**Files:**
- Modify: `packages/shared/src/monitoring/role-overview.ts` (+ test), `apps/api/src/modules/dashboards/role-overview.service.ts` (+ test)

**Interfaces:**
- Produces new nullable sections in `roleOverviewSchema`:
  - `myExtensions`: `list({ id, activityId, projectId, activityCode, activityTitle: text(200), requestedEndDate: day, status, note: text(2000).nullable() })`: PO's own latest 5 requests (status PENDING|VERIFIED|RETURNED|APPROVED|DECLINED; `note` = verification note for RETURNED, decision note for DECLINED); gate `activities.proof.submit`.
  - `extensionQueue`: `list({ id, activityId, projectId, projectTitle, activityCode, activityTitle, requesterName, requestedEndDate, currentEndDate: day.nullable(), reason: text(2000), stage: 'VERIFY'|'DECIDE' })`: PENDING rows for M&E (`evidence.review`, excluding own requests), VERIFIED rows for PM (`activities.update` and role PROJECT_MANAGER, excluding rows they requested or verified); null otherwise.
  - `alerts.escalated`: `z.array(alertRow.extend({ escalatedAt: instant })).max(5)` plus `escalatedOpen: count`, filled from `RulesHumanService.listEscalatedAlerts` (one page of 100, `escalatedOpen` = items length, `capped` OR next cursor present).
- All strings sliced to their caps in the service (Plan 1 C1 lesson).

- [ ] **Step 1: Failing tests** (shared: populated payload parses; service: gates per section, self-exclusion, escalated mapping, caps).
- [ ] **Step 2-4: Implement and run** `pnpm --filter @pathways/shared exec vitest run src/monitoring/role-overview.test.ts`, `pnpm --filter api exec vitest run src/modules/dashboards`, `pnpm --filter api build`.
- [ ] **Step 5: Commit** `feat(dashboards): extension and escalation sections in the role overview`.

---

### Task 6: Web extension workflow UI

**Files:**
- Modify: `apps/web/src/features/projects/activity-detail-panel.tsx` (replace the disabled "Request an extension" placeholder at ~551-565 with a working button for `canRequestExtension`), `apps/web/src/lib/services/pathways-client.ts` (+ interface): `listActivityExtensions`, `requestActivityExtension`, `verifyActivityExtension`, `decideActivityExtension` using `requestFoundation` POST/GET like `recordOverdueExplanation` (pathways-client.ts:846-860)
- Create: `apps/web/src/features/projects/activity-extension-dialog.tsx` (request form: new end date `type="date"` with `min` = day after current planned end, reason textarea 10-2000 with counter), `apps/web/src/features/projects/activity-extension-panel.tsx` (shows the latest request with status badge; M&E sees Verify / Return with a required note when `canValidateProof`; PM sees Approve / Decline with a required note when `canDecideProof`; Approve passes the activity's current `updatedAt` as `activityExpectedUpdatedAt`), tests for both.
- Modify: `apps/web/src/constants/feature-flags.ts` only if the placeholder flag is shared with other unfinished controls; keep other placeholders unchanged.

- [ ] **Step 1: Failing component tests**: request dialog validates date and reason length and posts `{ requestedEndDate, reason, clientMutationId }`; panel shows Verify/Return only for M&E and Approve/Decline only for PM; a 409 shows "This request changed; reload before deciding."; Grant Manager and Program Manager see status only.
- [ ] **Step 2-4: Implement and run** `pnpm --filter web exec vitest run src/features/projects/activity-extension` and `pnpm --filter web exec tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(web): request, verify and decide activity extensions`.

---

### Task 7: Dashboards: extension and escalation sections

**Files:**
- Modify: `apps/web/src/features/dashboard/role-overview/officer-overview.tsx` (Needs your attention: RETURNED/DECLINED extension callouts with the note and an Open activity button; Your activities rows show "Extension pending" badge), `me-overview.tsx` (new card "Extension requests to verify" from `extensionQueue` stage VERIFY with Review button opening the activity), `manager-overview.tsx` ("Pending your approval" adds extension rows from `extensionQueue` stage DECIDE with an initials badge `EXT` and an Approve button opening the activity), `portfolio-overview.tsx` (replace "Open alerts" with "Escalated alerts" from `alerts.escalated` when present, fallback to open alerts when the escalated list is empty; header caption "Requiring program-level decision"; Decide only when not readOnly), plus their tests.

- [ ] **Step 1: Failing tests** per layout (null sections hide; Grant Manager has no buttons; escalated list renders escalatedAt date).
- [ ] **Step 2-4: Implement and run** `pnpm --filter web exec vitest run src/features/dashboard` and `pnpm --filter web exec tsc --noEmit` and `pnpm --filter web build`.
- [ ] **Step 5: Commit** `feat(dashboard): extension queues and escalated alerts on role dashboards`.

---

### Task 8: Docs, CRs and hosted apply

**Files:**
- Create: `docs/cr-pathways-activity-extension-request.md`, `docs/cr-pathways-escalated-alerts.md` (follow the structure of `docs/cr-pathways-indicator-form-and-type.md`: context, decision, migration, DBA prerequisite, gates, tests)
- Modify: `docs/prd-pathways.md` (F4/F10 and F8 dashboard rows: built; gate rows), `docs/deferred-features.md` (remove Plan 2 deferrals for extension and escalation; keep evaluation approval), `docs/qad-pathways.md` (QAD rows for the new runtime suites), `docs/runbook-role-staging-build.md` (steps and counts: 37-row ledger, new preprovision pair), `docs/sdd-pathways.md` (model and migration counts), `docs/activity-log.md`, `docs/index.md`.

- [ ] **Step 1: Write the docs** (exact counts from Tasks 1-2).
- [ ] **Step 2: Run** `pnpm docs:check` and `pnpm sad:check`.
- [ ] **Step 3: SAD migration review**: dispatch `migration-integrity-guardian` and `organization-isolation-checker` on the 0061/0062 diff; fix findings before any hosted apply.
- [ ] **Step 4: Hosted apply to PATHWAYS-devV2** (standing authorization: auto-apply when local replay + suites + SAD migration review pass): `node scripts/db/hosted-build.mjs --dry-run`, then clear `.tmp/hosted-build/migrations` and run `node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume`; confirm the ledger shows 37 finished rows and record the result in `docs/activity-log.md`.
- [ ] **Step 5: Commit** `docs: extension request and escalated alerts CRs, counts and staging apply record`.
