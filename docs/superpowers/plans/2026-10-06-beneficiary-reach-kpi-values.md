# Beneficiary Reach and KPI Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release beneficiary reach counts (1-4 shown as "Suppressed (fewer than 5)"), open participation insights to Program and Grant Manager, and give Program and Grant Manager KPI values only, with no new permission grants.

**Architecture:** Migration `0066_beneficiary_reach_kpi_values` replaces `p06_monitoring` and `p06_home_dashboard` so the four reach counts come from `p06_compute_monitoring` with nested-count complementary suppression, and adds two prisma-owned SECURITY DEFINER release functions, `p06_participation_breakdown` and `p06_indicator_values`, each granted to `pathways_runtime` only. The API reads those functions for every role on the KPI and participation surfaces (one code path per surface); the web shows withheld and suppressed cells by label, never as "0".

**Tech Stack:** PostgreSQL 17/18 (Supabase), Prisma 6 raw SQL migrations, NestJS 11, zod, Next.js 15, Vitest, PowerShell replay harness, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-06-beneficiary-reach-kpi-values-design.md` (approved 2026-10-06). The spec names migration `0064_beneficiary_reach_kpi_values`; migration renumbered to 0066 per controller (`0064_evaluation_write_path` lands first).

## Global Constraints

- Migration is `0066_beneficiary_reach_kpi_values`; its precondition requires `0064_evaluation_write_path` finished. Never edit 0000-0064 (`pnpm sad:check` blocks byte changes).
- No grant change: `role_permissions` stays 314 (after 0064). Do not touch `apps/api/src/modules/auth/rbac-contract.json` or `authorization-policy.ts` grants.
- Each release is a SECURITY DEFINER function with explicit scope checks, following the `p06_*` patterns; `SET search_path TO ''`; ACL revoked from PUBLIC, anon, authenticated, service_role; EXECUTE granted to `pathways_runtime` only.
- Suppression: counts 1-4 are SUPPRESSED; related counts get complementary suppression so a hidden count cannot be derived by subtraction (0060 rule metrics precedent, `apps/api/prisma/migrations/0060_rules_budget_beneficiary_survey_metrics/migration.sql:413-422`).
- One code path per surface: the API uses the definer release for every role rather than branching by role.
- `p06_participation_breakdown` requires `monitoring.read`, `analytics.descriptive.read` and `beneficiaries.aggregates.read` plus project scope. `p06_indicator_values` requires `monitoring.read` and `reports.indicator.read` plus project scope and returns no definitions, bindings, field IDs or measurement IDs.
- Indicators tab and route stay closed to Program and Grant Manager (`indicators.read` unchanged).
- "Suppressed (fewer than 5)" copy everywhere a count is suppressed (`apps/web/src/features/projects/project-utils.ts:43-44`).
- Work in a git worktree on branch `feature/beneficiary-reach-kpi-values`, cut from `dev` after the evaluation work merges.
- Comments are one sentence, no emojis or special characters; Biome formatting; kebab-case docs. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Hosted forced-RLS mechanism (read before Task 1)

The known pitfall (`docs/deferred-features.md:61`): `p08_activity_beneficiaries_reached` is owned by `prisma`, and hosted `prisma` has no BYPASSRLS, so it reads nothing from FORCE RLS `activity_updates`. Local replay hides this because `apps/api/prisma/tests/security-adapter-local-bootstrap.sql:26` grants `prisma` BYPASSRLS.

How the existing working functions read their sources, and what 0066 relies on:

- `p06_compute_monitoring` (0028:95-140) and the new `p06_participation_breakdown` read `beneficiaries`, `beneficiary_project_enrollments`, `beneficiary_activity_participations`, `project_activities`, `form_submissions`, `project_milestones`. All are owned by `prisma` (for example `M:4312`, `M:4331`, `M:4661`) and are RLS-enabled but not FORCE, so the owner `prisma` reads them without BYPASSRLS.
- `p06_compute_indicator_value` (`M:1384-1501`) reads FORCE RLS `project_indicator_bindings` (`M:4918`) and `project_indicator_measurements` (`M:4941`) through owner policies `p06_binding_owner_read` (`M:7069`) and `p06_measurement_owner_read` (`M:7081`), which are `TO prisma` and need `app.organization_id` plus `p06_can('monitoring.read', project_id)`. `project_indicators` (`M:4986`) is not FORCE.
- `p34_compute_indicator_value` (0034:399-519) uses a different mechanism: it is owned by `report_projection_owner` (0034:520-521, NOLOGIN, NOBYPASSRLS), runs with `row_security=on`, reads through `p34_report_projection` policies `TO report_projection_owner` (0034:294-394) and refuses unless `session_user='pathways_runtime'` (0034:406). After the hosted cleanup `prisma` has no membership in `report_projection_owner` (`infra/supabase/phase6/hosted-indicator-type-preprovision.sql:41-44`), so a new function cannot call it without a new DBA preprovision chain.

Decision: `p06_indicator_values` is owned by `prisma` and calls `p06_compute_indicator_value`, whose computation is byte-identical to `p34_compute_indicator_value` except for the gate (compare `M:1397-1500` with 0034:412-518; the only difference is `'monitoring.read'` versus `'reports.indicator.read'` in `p06_assert_scope`). It adds its own `reports.indicator.read` check. The runtime suite sets `ALTER ROLE prisma NOBYPASSRLS` inside its rolled-back transaction, so the replay proves the hosted behavior (KPI values must not degrade to `NO_MEASUREMENT` or `BINDING_UNAVAILABLE`).

`M` = `apps/api/prisma/migrations/0000_pathways_baseline_through_0026/migration.sql`.

## Review Focus

- Hosted `prisma` without BYPASSRLS: KPI values and reach counts must still read forced-RLS bindings and measurements; a silent `NO_MEASUREMENT` would look like "None yet" (Task 1 suite flips `prisma` to NOBYPASSRLS and asserts the measured value 12 and the bound derived cell).
- Home dashboard for a role without `monitoring.read` (Project Officer) must keep working with the withheld placeholder instead of raising 42501, since its gate is `projects.read` (Task 1 assertion 24; existing `dashboard-home-runtime.local.test.ts`).
- One person attending five sessions gives a record count of 5 from 1 person; the breakdown must still hide it and its complement (Task 1 assertion 16).
- Nested reach counts: records minus individuals, or individuals minus attending, of 1-4 must not be derivable by subtraction (Task 1 assertions 8, 9, 11).
- Program and Grant Manager on the Analytics page must not call the `indicators.read` endpoint (403 today) and must still get reporting periods and the KPI and reach cards (Task 4 analytics test).

## File Structure

- Create `apps/api/prisma/migrations/0066_beneficiary_reach_kpi_values/migration.sql`: two replaced and two new release functions, three private helpers, pre and postconditions.
- Create `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`: role-by-role runtime suite (32 assertions).
- Create `apps/api/src/modules/indicators/indicator-values.controller.ts`: `GET /projects/:projectId/indicator-values`.
- Create `apps/web/src/features/dashboard/monitoring-reach-metrics.ts` (+ test): the role dashboard reach cards, pulled out of the 721-line `role-dashboard.tsx`.
- Create `docs/cr-pathways-beneficiary-reach-kpi-values.md`.
- Modify the files listed per task.

---

### Task 1: Migration 0066 and runtime SQL suite (+ inventories)

**Files:**
- Create: `apps/api/prisma/migrations/0066_beneficiary_reach_kpi_values/migration.sql`
- Create: `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`
- Modify: `infra/supabase/phase6/Replay-Local.ps1:597-598` (run the new suite after the activity extension suite)
- Modify: `infra/supabase/phase6/Verify-Forward.ps1:17-52` (`$forwardInventory`) and the tail before `} finally {` (`:987-988`, 0066 inventory block)
- Modify: `scripts/db/hosted-plan.mjs:7,11-50,160-166,240-285`, `scripts/db/hosted-plan.test.mjs`, `scripts/db/hosted-build.mjs:382,386,620`, `scripts/db/hosted-build.local.test.mjs:267,381`, `apps/api/prisma/legacy-retirement.test.ts:76`
- Modify: `apps/api/src/modules/reports/reports-runtime.local.test.ts:300-313` (run by the replay; it asserted the old withheld rows)

**Interfaces:**
- Consumes: `pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)` (0028:95-140), `pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)` (`M:1384-1501`), `pathways.p06_cell(numeric,text)` (`M:1358-1367`), `pathways.p06_can(text,uuid)`, `pathways.p09_can(text)` (`M:2472-2486`).
- Produces (SQL, EXECUTE for `pathways_runtime` only):
  - `pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb` (signature unchanged).
  - `pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb` (signature unchanged).
  - `pathways.p06_participation_breakdown(wanted_project uuid, start_on date DEFAULT NULL, end_on date DEFAULT NULL) RETURNS jsonb` shaped exactly as `participationBreakdownSchema` (`packages/shared/src/monitoring/analytics-insights.ts`): `{ projectId, total: int|null, totalSuppressed, byActivity: [{activityId, activityName, count, suppressed}], byMonth: [{month 'YYYY-MM', count, suppressed}], byAttendanceStatus: [5 rows {status, count, suppressed}] }`.
  - `pathways.p06_indicator_values(wanted_project uuid, zone text) RETURNS jsonb`: array of `{ id, projectId, code, name, indicatorType, unitLabel, numericKind, direction, displayPrecision, periodStart, periodEnd, baseline, target, revision, status, current }`, ordered by code then id; never `description`, `dataSource`, `mode`, `binding`, `measurementId`, `measuredAt`, `measurementSource`.
  - Private (owner only): `pathways.p06_complement_cell(jsonb,jsonb)`, `pathways.p06_release_reach(jsonb)`, `pathways.p06_suppress_breakdown(jsonb,boolean)`.

- [ ] **Step 0: Confirm the 0064 base**

Run (bash, worktree root): `ls apps/api/prisma/migrations | tail -3 && git grep -n "0064_evaluation_write_path" -- scripts infra apps/api/prisma/legacy-retirement.test.ts`
Expected: `0064_evaluation_write_path` is the last migration directory and appears in `hosted-plan.mjs`, `Verify-Forward.ps1` and `legacy-retirement.test.ts`. If not, stop and report to the controller; this plan appends 0066 after the 0064 entries.

- [ ] **Step 1: Write the runtime SQL suite**

Create `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`:

```sql
-- cr-pathways-beneficiary-reach-kpi-values (migration 0066): runtime checks for the released reach counts,
-- pathways.p06_participation_breakdown and pathways.p06_indicator_values. Synthetic fixtures only; everything rolls
-- back. Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0066.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0066 beneficiary-reach-kpi-values checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE TEMP TABLE brk_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE brk_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON brk_results TO pathways_runtime;
GRANT INSERT, SELECT ON brk_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO brk_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO brk_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer,org integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(org)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT doc FROM brk_out WHERE name=wanted
$$;
-- Enrolls `people` individuals and `grp` groups as beneficiaries u(base+n) with enrollments u(base+500+n).
CREATE FUNCTION pg_temp.enroll(project integer,base integer,people integer,grp integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
  SELECT pg_temp.u(base+n),pg_temp.u(1),'BRK-'||(base+n),
   (CASE WHEN n<=people THEN 'INDIVIDUAL' ELSE 'GROUP' END)::pathways.beneficiary_subject_type,'Synthetic','Person '||(base+n),true,true,pg_temp.u(101)
  FROM generate_series(1,people+grp) n;
  INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
  SELECT pg_temp.u(base+500+n),pg_temp.u(1),pg_temp.u(project),pg_temp.u(base+n),'2026-01-01',pg_temp.u(101)
  FROM generate_series(1,people+grp) n;
$$;
-- Records one participation per beneficiary first_n..last_n, each with its own source submission.
CREATE FUNCTION pg_temp.attend(project integer,activity integer,base integer,first_n integer,last_n integer,on_day date,status text,submission text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer; sid uuid;
BEGIN
 FOR n IN first_n..last_n LOOP
  sid := gen_random_uuid();
  INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,status)
  VALUES(sid,pg_temp.u(1),pg_temp.u(project),pg_temp.u(700),1,gen_random_uuid(),pg_temp.u(101),submission::pathways.submission_status);
  INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,source_submission_id,recorded_by_id)
  VALUES(pg_temp.u(1),pg_temp.u(project),pg_temp.u(base+500+n),pg_temp.u(activity),status::pathways.attendance_status,on_day,sid,pg_temp.u(101));
 END LOOP;
END $$;

-- Org A: Program Manager u101, Grant Manager u102, Project Officer u103, M&E Officer u104. Org B: Grant Manager u105.
-- Projects: A1 u301 visible counts, A2 u302 unassigned, A3 u303 attending complement, A4 u304 records complement,
-- A5 u305 small cohort, B1 u306 org B.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,5) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'BRK_ORG_A','Synthetic BRK org A'),(pg_temp.u(2),'BRK_ORG_B','Synthetic BRK org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),('GRANT_MANAGER','Grant Manager'),('PROJECT_OFFICER','Project Officer'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(v.org),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,1,'PROGRAM_MANAGER','BRK Program Manager','brk-pgm@example.invalid'),
  (2,1,'GRANT_MANAGER','BRK Grant Manager A','brk-gm-a@example.invalid'),
  (3,1,'PROJECT_OFFICER','BRK Project Officer','brk-po@example.invalid'),
  (4,1,'MONITORING_AND_EVALUATION_OFFICER','BRK M&E Officer','brk-me@example.invalid'),
  (5,2,'GRANT_MANAGER','BRK Grant Manager B','brk-gm-b@example.invalid')
) v(n,org,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),('monitoring.read','monitoring.read'),
  ('analytics.descriptive.read','analytics.descriptive.read'),
  ('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),('reports.indicator.read','reports.indicator.read')
ON CONFLICT(code) DO NOTHING;
-- Grants follow the RBAC contract exactly, so no pair outside p09_role_allows is added.
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER')
  AND p.code IN ('projects.read','monitoring.read','analytics.descriptive.read','beneficiaries.aggregates.read','reports.indicator.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(CASE WHEN n=6 THEN 2 ELSE 1 END),'BRK-P'||n,'BRK project '||n,'2026-01-01','2026-12-31',pg_temp.u(101)
FROM generate_series(1,6) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(1),pg_temp.u(300+v.p),pg_temp.u(100+n),pg_temp.u(101)
FROM generate_series(1,4) n CROSS JOIN (VALUES (1),(3),(4),(5)) v(p)
UNION ALL SELECT gen_random_uuid(),pg_temp.u(2),pg_temp.u(306),pg_temp.u(105),pg_temp.u(105);
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id)
VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'BRK-A1','Workshop','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'BRK-A2','Visit','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(303),'BRK-A3','Session','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(1),pg_temp.u(303),'BRK-A4','Follow-up','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101));
-- A1: 20 individuals; 9 present at the Workshop in February, 3 absent from the Visit in March, one draft excluded.
SELECT pg_temp.enroll(301,1000,20,0);
SELECT pg_temp.attend(301,501,1000,1,9,'2026-02-10','PRESENT','VALIDATED');
SELECT pg_temp.attend(301,502,1000,10,12,'2026-03-10','ABSENT','VALIDATED');
SELECT pg_temp.attend(301,502,1000,1,1,'2026-03-10','PRESENT','DRAFT');
-- A3: 8 individuals, 6 present at the Session, and person 1 alone at five Follow-up sessions.
SELECT pg_temp.enroll(303,2000,8,0);
SELECT pg_temp.attend(303,503,2000,1,6,'2026-02-10','PRESENT','VALIDATED');
SELECT pg_temp.attend(303,504,2000,1,1,make_date(2026,2,d),'PRESENT','VALIDATED') FROM generate_series(11,15) d;
-- A4: 6 individuals and 1 group. A5: 3 individuals.
SELECT pg_temp.enroll(304,3000,6,1);
SELECT pg_temp.enroll(305,4000,3,0);
-- A1 indicators: a manual count measured at 12 and a derived count bound to the Visit (3 records from 3 people).
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),'BRK-MANUAL','People trained','Private definition note','COUNT','people','Synthetic manual source','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(104)),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),'BRK-DERIVED','Visit records',NULL,'COUNT','records','Synthetic derived source','DERIVED','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(104));
INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,activity_id,created_by_id)
VALUES (pg_temp.u(1),pg_temp.u(301),pg_temp.u(602),'PARTICIPATION_RECORD_COUNT',pg_temp.u(502),pg_temp.u(104));
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,recorded_by_id)
VALUES (pg_temp.u(701),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',12,'Synthetic field report',pg_temp.u(702),repeat('a',64),pg_temp.u(104));
SET LOCAL session_replication_role = origin;

-- Catalog checks.
SELECT pg_temp.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='prisma'),
  '1 prisma has neither SUPERUSER nor BYPASSRLS, as on hosted');
SELECT pg_temp.ok(has_function_privilege('pathways_runtime','pathways.p06_participation_breakdown(uuid,date,date)','EXECUTE')
  AND has_function_privilege('pathways_runtime','pathways.p06_indicator_values(uuid,text)','EXECUTE')
  AND NOT EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name), (VALUES
   ('pathways.p06_participation_breakdown(uuid,date,date)'),('pathways.p06_indicator_values(uuid,text)')) f(fn)
   WHERE has_function_privilege(r.name,f.fn,'EXECUTE')),
  '2 only the runtime executes the two release functions');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways.p06_complement_cell(jsonb,jsonb)','EXECUTE')
  AND NOT has_function_privilege('pathways_runtime','pathways.p06_release_reach(jsonb)','EXECUTE')
  AND NOT has_function_privilege('pathways_runtime','pathways.p06_suppress_breakdown(jsonb,boolean)','EXECUTE'),
  '3 suppression helpers are owner only');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='pathways' AND c.relname IN ('beneficiaries','beneficiary_project_enrollments','beneficiary_activity_participations',
    'project_activities','form_submissions','project_milestones','project_indicators')
   AND (pg_get_userbyid(c.relowner)<>'prisma' OR c.relforcerowsecurity))
  AND (SELECT count(*) FROM pg_policy WHERE polname IN ('p06_binding_owner_read','p06_measurement_owner_read')
   AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='prisma')])=2,
  '4 sources are prisma-owned and unforced, or forced with a prisma owner read policy');
SELECT pg_temp.ok(NOT pathways.p09_role_allows('PROJECT_OFFICER','monitoring.read'),
  '5 Project Officer holds no monitoring.read in the contract');

-- Program Manager.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1,1);
INSERT INTO brk_out SELECT 'pm_a'||p, pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(300+p)],'2026-01-01','2026-06-30','Asia/Manila')
 FROM (VALUES (1),(3),(4),(5)) v(p);
INSERT INTO brk_out SELECT 'pm_home_a1', pathways.p06_home_dashboard(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
INSERT INTO brk_out SELECT 'pm_parts', pathways.p06_participation_breakdown(pg_temp.u(301),NULL,NULL);
INSERT INTO brk_out SELECT 'pm_parts_feb', pathways.p06_participation_breakdown(pg_temp.u(301),'2026-02-01','2026-02-28');
INSERT INTO brk_out SELECT 'pm_parts_a3', pathways.p06_participation_breakdown(pg_temp.u(303),NULL,NULL);
INSERT INTO brk_out SELECT 'pm_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(302),'Asia/Manila'),'42501',
  '6a an unassigned project is refused for indicator values');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(302)),'42501',
  '6b an unassigned project is refused for the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,%L::date,NULL)',pg_temp.u(301),'2026-02-01'),'22023',
  '6c a half period is refused');
-- Grant Manager and M&E Officer read through the same functions.
SELECT pg_temp.act_as(2,1);
INSERT INTO brk_out SELECT 'gm_a1', pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
INSERT INTO brk_out SELECT 'gm_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
SELECT pg_temp.act_as(4,1);
INSERT INTO brk_out SELECT 'me_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
INSERT INTO brk_out SELECT 'me_parts', pathways.p06_participation_breakdown(pg_temp.u(301),NULL,NULL);
-- Project Officer keeps the home placeholder and is refused every release.
SELECT pg_temp.act_as(3,1);
INSERT INTO brk_out SELECT 'po_home', pathways.p06_home_dashboard(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p06_monitoring(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
  pg_temp.u(1),pg_temp.u(301),'2026-01-01','2026-06-30','Asia/Manila'),'42501','25 Project Officer is refused monitoring');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(301)),'42501',
  '26 Project Officer is refused the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(301),'Asia/Manila'),'42501',
  '27 Project Officer is refused indicator values');
-- Org B Grant Manager cannot reach org A.
SELECT pg_temp.act_as(5,2);
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(301),'Asia/Manila'),'42501',
  '28 another organization is refused indicator values');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(301)),'42501',
  '29 another organization is refused the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_monitoring(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
  pg_temp.u(2),pg_temp.u(301),'2026-01-01','2026-06-30','Asia/Manila'),'42501','30 another organization is refused monitoring');
RESET ROLE;

-- Reach counts.
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,value}'='20' AND d#>>'{enrolledIndividuals,value}'='20'
  AND d#>>'{attendingIndividuals,value}'='9' AND d#>>'{participationRecords,value}'='12' FROM pg_temp.doc('pm_a1') d),
  '7 A1 releases visible reach counts and excludes the draft submission');
SELECT pg_temp.ok((SELECT d#>>'{enrolledIndividuals,value}'='8' AND d#>>'{attendingIndividuals,state}'='SUPPRESSED'
  AND d#>>'{attendingIndividuals,reason}'='COMPLEMENTARY_SUPPRESSION' AND d#>>'{attendingIndividuals,value}' IS NULL
  FROM pg_temp.doc('pm_a3') d),
  '8 attending individuals are hidden when enrolled minus attending is 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,value}'='7' AND d#>>'{enrolledIndividuals,state}'='SUPPRESSED'
  AND d#>>'{enrolledIndividuals,reason}'='COMPLEMENTARY_SUPPRESSION' FROM pg_temp.doc('pm_a4') d),
  '9 enrolled individuals are hidden when records minus individuals is 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,reason}'='SMALL_COHORT' AND d#>>'{enrolledIndividuals,reason}'='SMALL_COHORT'
  AND d#>>'{enrolledIndividuals,state}'='SUPPRESSED' AND d#>>'{attendingIndividuals,state}'='ZERO' FROM pg_temp.doc('pm_a5') d),
  '10 counts of 1-4 are SUPPRESSED as SMALL_COHORT and zero stays visible');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM brk_out o,
  unnest(ARRAY['participationRecords','attendingIndividuals','enrolledBeneficiaryRecords','enrolledIndividuals']) k
  WHERE o.name LIKE 'pm\_a%' AND o.doc->k->>'value' IN ('1','2','3','4')),
  '11 no released reach cell carries a value of 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledIndividuals,value}'='20' AND d#>>'{participationRecords,value}'='12'
  FROM pg_temp.doc('pm_home_a1') d),
  '12 the home dashboard releases the same counts to a monitoring.read holder');
-- Participation breakdown.
SELECT pg_temp.ok((SELECT d->>'total'='12' AND d->>'totalSuppressed'='false' AND jsonb_array_length(d->'byActivity')=2
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(d->'byActivity') x WHERE x->>'suppressed'<>'true' OR x->'count'<>'null'::jsonb)
  FROM pg_temp.doc('pm_parts') d),
  '13 a lone small activity hides the smallest other activity too, and the total stays visible');
SELECT pg_temp.ok((SELECT jsonb_array_length(d->'byMonth')=2
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(d->'byMonth') x WHERE x->>'suppressed'<>'true')
  AND jsonb_array_length(d->'byAttendanceStatus')=5
  AND (SELECT x->>'suppressed' FROM jsonb_array_elements(d->'byAttendanceStatus') x WHERE x->>'status'='PRESENT')='true'
  AND (SELECT x->>'suppressed' FROM jsonb_array_elements(d->'byAttendanceStatus') x WHERE x->>'status'='ABSENT')='true'
  AND (SELECT x->>'count' FROM jsonb_array_elements(d->'byAttendanceStatus') x WHERE x->>'status'='COMPLETED')='0'
  FROM pg_temp.doc('pm_parts') d),
  '14 months and statuses use the same complement rule and zeros stay visible');
SELECT pg_temp.ok((SELECT d->>'total'='9'
  AND d->'byActivity'=jsonb_build_array(jsonb_build_object('activityId',pg_temp.u(501),'activityName','Workshop','count',9,'suppressed',false))
  AND d->'byMonth'='[{"month":"2026-02","count":9,"suppressed":false}]'::jsonb
  FROM pg_temp.doc('pm_parts_feb') d),
  '15 a period keeps only February and shows it');
SELECT pg_temp.ok((SELECT d->>'total'='11' AND jsonb_array_length(d->'byActivity')=2
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(d->'byActivity') x WHERE x->>'suppressed'<>'true')
  FROM pg_temp.doc('pm_parts_a3') d),
  '16 one person at five sessions is hidden by the people rule and covered by a complement');
-- KPI values.
SELECT pg_temp.ok((SELECT x#>>'{current,value}'='12' AND x#>>'{current,state}'='AVAILABLE'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-MANUAL'),
  '17 the manual value is read through the forced-RLS measurements table');
SELECT pg_temp.ok((SELECT x#>>'{current,state}'='SUPPRESSED' AND x#>>'{current,reason}'='SMALL_COHORT'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-DERIVED'),
  '18 a derived count of 1-4 is SUPPRESSED through the forced-RLS binding');
SELECT pg_temp.ok(jsonb_array_length(pg_temp.doc('pm_kpi'))=2 AND NOT EXISTS(SELECT FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x
  WHERE x ?| ARRAY['description','dataSource','mode','binding','measurementId','measuredAt','measurementSource']),
  '19 KPI values carry no definition, binding or measurement fields');
SELECT pg_temp.ok((SELECT x->>'direction'='HIGHER_IS_BETTER' AND x->>'baseline'='0' AND x->>'target'='20'
  AND x->>'periodStart'='2026-01-01' AND x->>'periodEnd'='2026-06-30' AND x->>'status'='ACTIVE'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-MANUAL'),
  '20 KPI values carry the display fields achievement needs');
SELECT pg_temp.ok(pg_temp.doc('gm_a1')=pg_temp.doc('pm_a1') AND pg_temp.doc('gm_kpi')=pg_temp.doc('pm_kpi'),
  '21 Grant Manager receives the same counts and values as Program Manager');
SELECT pg_temp.ok(pg_temp.doc('me_kpi')=pg_temp.doc('pm_kpi'),
  '22 M&E Officer receives the same KPI values (one code path)');
SELECT pg_temp.ok(pg_temp.doc('me_parts')=pg_temp.doc('pm_parts'),
  '23 M&E Officer receives the same participation breakdown');
SELECT pg_temp.ok((SELECT d#>>'{participationRecords,reason}'='SENSITIVE_RELEASE_NOT_ENABLED_V1'
  AND d#>>'{enrolledIndividuals,reason}'='SENSITIVE_RELEASE_NOT_ENABLED_V1' AND jsonb_array_length(d->'activities')=5
  FROM pg_temp.doc('po_home') d),
  '24 Project Officer home dashboard keeps the withheld placeholder without raising');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM brk_results;
 IF total<>32 THEN RAISE EXCEPTION '0066 beneficiary-reach-kpi-values checks expected 32 assertions, recorded %',total; END IF;
 RAISE NOTICE 'BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
```

Assertion count: labels 1-5 (5), 6a-6c (3), 7-24 (18), 25-30 (6) = 32. Keep the final check in step with any label you add or remove.

Also update the replay-run local test that asserted the old withheld report rows, `apps/api/src/modules/reports/reports-runtime.local.test.ts:304-313`; replace the comment and the last expectation with:

```ts
            // The monitoring aggregate releases participation counts with 1-4 suppressed.
            const participation = monitoring.rows.filter((row) => row[0] === 'Participation')
            expect(
              participation.length,
              'monitoring report lists participation rows',
            ).toBeGreaterThan(0)
            expect(
              participation.filter((row) => /^[1-4]$/.test(row[2] ?? '')),
              'monitoring report shows no participation count of 1 to 4',
            ).toEqual([])
```

- [ ] **Step 2: Run the suite against a fresh template to see it fail**

Run (PowerShell, worktree root): `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate` then `./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`
Expected: FAIL at assertion 2 with `function pathways.p06_participation_breakdown(uuid, date, date) does not exist` (runner usage: `docs/runbook-local-dev.md:63`).

- [ ] **Step 3: Write the migration**

Create `apps/api/prisma/migrations/0066_beneficiary_reach_kpi_values/migration.sql`:

```sql
-- 0066 beneficiary reach and KPI values (cr-pathways-beneficiary-reach-kpi-values); forward migration.
-- p06_monitoring and p06_home_dashboard release the four reach counts from p06_compute_monitoring with 1-4 and
-- nested-count complementary suppression instead of SENSITIVE_RELEASE_NOT_ENABLED_V1; the home dashboard keeps the
-- placeholder for callers without monitoring.read on every requested project, since its own gate is projects.read.
-- p06_participation_breakdown and p06_indicator_values release suppressed participation counts and indicator current
-- values without journeys.read, beneficiaries.records.read or indicators.read. Every function is owned by prisma, which
-- owns every source table; hosted prisma has no BYPASSRLS, so the only FORCE RLS sources (indicator bindings and
-- measurements) are read through their p06_*_owner_read policies, which need monitoring.read on the project.
-- No table, column, policy, role or permission grant changes (role_permissions stays 314); no DBA preprovision.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0064_evaluation_write_path'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0066 requires the verified 0064 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways'
   AND p.proname IN ('p06_participation_breakdown','p06_indicator_values','p06_complement_cell','p06_release_reach','p06_suppress_breakdown'))
 THEN RAISE EXCEPTION '0066 requires prisma to own pathways and no earlier release functions'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid IN (
   'pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)'::pg_catalog.regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)<>'prisma')
 THEN RAISE EXCEPTION '0066 requires prisma to own the p06 monitoring and indicator functions'; END IF;
 IF NOT (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.project_indicator_measurements'::pg_catalog.regclass)
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('p06_binding_owner_read','p06_measurement_owner_read'))<>2
 THEN RAISE EXCEPTION '0066 requires the prisma owner read policies on indicator bindings and measurements'; END IF;
 -- Remember both replaced ACLs and the grant count so the postcondition proves them unchanged.
 PERFORM pg_catalog.set_config('pathways.m0066_monitoring_acl',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure),true);
 PERFORM pg_catalog.set_config('pathways.m0066_home_acl',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure),true);
 PERFORM pg_catalog.set_config('pathways.m0066_grants',(SELECT count(*) FROM pathways.role_permissions)::text,true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- Hides the inner of two nested counts when both are visible and their difference is 1-4.
CREATE FUNCTION pathways.p06_complement_cell(outer_cell jsonb, inner_cell jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN outer_cell->>'value' IS NOT NULL AND inner_cell->>'value' IS NOT NULL
      AND (outer_cell->>'value')::numeric - (inner_cell->>'value')::numeric BETWEEN 1 AND 4
    THEN pathways.p06_cell(NULL, 'COMPLEMENTARY_SUPPRESSION') ELSE inner_cell END
$function$;

-- Applies nested-count suppression to records, individuals and attending individuals (records >= individuals >= attending).
CREATE FUNCTION pathways.p06_release_reach(data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  r jsonb := data->'enrolledBeneficiaryRecords';
  i jsonb := data->'enrolledIndividuals';
  a jsonb := data->'attendingIndividuals';
BEGIN
  i := pathways.p06_complement_cell(r, i);
  a := pathways.p06_complement_cell(i, a);
  a := pathways.p06_complement_cell(r, a);
  RETURN data || jsonb_build_object('enrolledIndividuals', i, 'attendingIndividuals', a);
END
$function$;

-- Hides cells from 1-4 records or people, and the smallest other non-zero cell when exactly one cell is hidden.
CREATE FUNCTION pathways.p06_suppress_breakdown(items jsonb, hide_all boolean)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  WITH cells AS (
    SELECT x.ord, x.item, (x.item->>'n')::bigint AS n,
      hide_all OR (x.item->>'n')::bigint BETWEEN 1 AND 4 OR (x.item->>'c')::bigint BETWEEN 1 AND 4 AS small
    FROM jsonb_array_elements(items) WITH ORDINALITY x(item, ord)
  ), cover AS (
    SELECT c.ord FROM cells c
    WHERE NOT c.small AND c.n > 0 AND (SELECT count(*) FROM cells WHERE small) = 1
    ORDER BY c.n, c.ord LIMIT 1
  )
  SELECT coalesce(jsonb_agg((c.item - 'n' - 'c') || CASE WHEN c.small OR c.ord IN (SELECT ord FROM cover)
      THEN jsonb_build_object('count', NULL, 'suppressed', true)
      ELSE jsonb_build_object('count', c.n, 'suppressed', false) END ORDER BY c.ord), '[]'::jsonb)
  FROM cells c
$function$;

CREATE OR REPLACE FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- p06_compute_monitoring asserts monitoring.read and project scope before any count is read.
  RETURN pathways.p06_release_reach(
    pathways.p06_compute_monitoring(wanted_org, wanted_projects, start_on, end_on, zone));
END
$function$;

CREATE OR REPLACE FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wanted_project uuid;
  missing jsonb;
  result jsonb;
BEGIN
  IF wanted_org IS NULL
     OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR wanted_projects IS NULL
     OR cardinality(wanted_projects) > 100
     OR array_position(wanted_projects, NULL) IS NOT NULL
     OR cardinality(wanted_projects) <> (SELECT count(DISTINCT item) FROM unnest(wanted_projects) item) THEN
    RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
  END IF;

  IF start_on IS NULL OR end_on IS NULL
     OR start_on < DATE '1900-01-01' OR end_on > DATE '2100-12-31'
     OR end_on < start_on OR end_on - start_on > 365
     OR zone IS NULL OR length(zone) > 100
     OR NOT EXISTS (SELECT FROM pg_catalog.pg_timezone_names WHERE name = zone) THEN
    RAISE EXCEPTION 'Invalid bounded dashboard period' USING ERRCODE = '22023';
  END IF;

  -- Empty project scopes still require an active identity whose active role has projects.read.
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users app_user
    JOIN pathways.roles role ON role.id = app_user.role_id AND role.is_active
    JOIN pathways.role_permissions mapping ON mapping.role_id = role.id
    JOIN pathways.permissions permission ON permission.id = mapping.permission_id
     AND permission.code = 'projects.read' AND permission.is_active
    WHERE app_user.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND app_user.organization_id = wanted_org
      AND app_user.auth_user_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND app_user.account_status = 'ACTIVE'
      AND app_user.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Dashboard home permission unavailable' USING ERRCODE = '42501';
  END IF;

  FOREACH wanted_project IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p05_has_project_permission('projects.read', wanted_project) THEN
      RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- A monitoring.read holder on every requested project gets the released counts.
  IF pathways.p09_can('monitoring.read') AND NOT EXISTS (
    SELECT FROM unnest(wanted_projects) item WHERE NOT pathways.p06_can('monitoring.read', item)
  ) THEN
    RETURN pathways.p06_release_reach(
      pathways.p06_compute_monitoring(wanted_org, wanted_projects, start_on, end_on, zone));
  END IF;

  missing := pathways.p06_cell(NULL, 'SENSITIVE_RELEASE_NOT_ENABLED_V1');

  WITH activity_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_activities
    WHERE organization_id = wanted_org AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL AND planned_end_date BETWEEN start_on AND end_on
    GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_milestones
    WHERE organization_id = wanted_org AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL AND target_date BETWEEN start_on AND end_on
    GROUP BY status
  )
  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label,
        'metric', pathways.p06_cell(coalesce(counts.n, 0))) ORDER BY v.ord)
      FROM (VALUES ('NOT_STARTED', 'Not started', 1), ('IN_PROGRESS', 'In progress', 2), ('FOR_REVIEW', 'For review', 3),
        ('COMPLETED', 'Completed', 4), ('CANCELLED', 'Cancelled', 5)) v(key, label, ord)
      LEFT JOIN activity_counts counts USING (key)
    ),
    'milestones', (
      SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label,
        'metric', pathways.p06_cell(coalesce(counts.n, 0))) ORDER BY v.ord)
      FROM (VALUES ('PENDING', 'Pending', 1), ('IN_PROGRESS', 'In progress', 2), ('COMPLETED', 'Completed', 3),
        ('CANCELLED', 'Cancelled', 4)) v(key, label, ord)
      LEFT JOIN milestone_counts counts USING (key)
    ),
    'participationRecords', missing,
    'attendingIndividuals', missing,
    'enrolledBeneficiaryRecords', missing,
    'enrolledIndividuals', missing
  ) INTO result;

  RETURN result;
END
$function$;

-- Suppressed participation counts by activity, month and attendance status for one project and an optional period.
CREATE FUNCTION pathways.p06_participation_breakdown(wanted_project uuid, start_on date DEFAULT NULL, end_on date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  total bigint;
  contributors bigint;
  hide_all boolean;
  activity_items jsonb;
  month_items jsonb;
  status_items jsonb;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project) THEN
    RAISE EXCEPTION 'Participation breakdown unavailable' USING ERRCODE = '42501';
  END IF;
  IF (start_on IS NULL) <> (end_on IS NULL) OR end_on < start_on
     OR start_on < DATE '1900-01-01' OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid participation period' USING ERRCODE = '22023';
  END IF;

  WITH accepted AS MATERIALIZED (
    SELECT p.activity_id, a.title, to_char(p.participation_date, 'YYYY-MM') AS month,
      p.attendance_status::text AS status, e.beneficiary_id
    FROM pathways.beneficiary_activity_participations p
    JOIN pathways.beneficiary_project_enrollments e
      ON e.organization_id = p.organization_id AND e.project_id = p.project_id AND e.id = p.enrollment_id
    JOIN pathways.beneficiaries ben ON ben.organization_id = e.organization_id AND ben.id = e.beneficiary_id
    JOIN pathways.project_activities a
      ON a.organization_id = p.organization_id AND a.project_id = p.project_id AND a.id = p.activity_id
    JOIN pathways.form_submissions s
      ON s.organization_id = p.organization_id AND s.project_id = p.project_id AND s.id = p.source_submission_id
    WHERE p.organization_id = org AND p.project_id = wanted_project
      AND (start_on IS NULL OR p.participation_date BETWEEN start_on AND end_on)
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
      AND a.archived_at IS NULL AND a.status <> 'CANCELLED'
      AND s.status = 'VALIDATED' AND NOT s.is_dummy_record
  )
  SELECT
    (SELECT count(*) FROM accepted),
    (SELECT count(DISTINCT beneficiary_id) FROM accepted),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('activityId', g.activity_id, 'activityName', g.title, 'n', g.n, 'c', g.c)
       ORDER BY g.title, g.activity_id), '[]'::jsonb)
     FROM (SELECT activity_id, min(title) AS title, count(*) AS n, count(DISTINCT beneficiary_id) AS c
       FROM accepted GROUP BY activity_id) g),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('month', g.month, 'n', g.n, 'c', g.c) ORDER BY g.month), '[]'::jsonb)
     FROM (SELECT month, count(*) AS n, count(DISTINCT beneficiary_id) AS c FROM accepted GROUP BY month) g),
    (SELECT jsonb_agg(jsonb_build_object('status', v.status, 'n', coalesce(g.n, 0), 'c', coalesce(g.c, 0)) ORDER BY v.ord)
     FROM (VALUES ('PRESENT', 1), ('ABSENT', 2), ('COMPLETED', 3), ('NOT_COMPLETED', 4), ('EXCUSED', 5)) v(status, ord)
     LEFT JOIN (SELECT status, count(*) AS n, count(DISTINCT beneficiary_id) AS c FROM accepted GROUP BY status) g USING (status))
  INTO total, contributors, activity_items, month_items, status_items;

  hide_all := total BETWEEN 1 AND 4 OR contributors BETWEEN 1 AND 4;
  RETURN jsonb_build_object(
    'projectId', wanted_project,
    'total', CASE WHEN hide_all THEN NULL ELSE total END,
    'totalSuppressed', hide_all,
    'byActivity', pathways.p06_suppress_breakdown(activity_items, hide_all),
    'byMonth', pathways.p06_suppress_breakdown(month_items, hide_all),
    'byAttendanceStatus', pathways.p06_suppress_breakdown(status_items, hide_all));
END
$function$;

-- Current values of a project's active indicators with display fields only; no definition text, binding or measurement ids.
CREATE FUNCTION pathways.p06_indicator_values(wanted_project uuid, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  result jsonb;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('reports.indicator.read', wanted_project) THEN
    RAISE EXCEPTION 'Indicator values unavailable' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM pathways.project_indicators
      WHERE organization_id = org AND project_id = wanted_project AND archived_at IS NULL) > 100 THEN
    RAISE EXCEPTION 'Narrow the indicator scope' USING ERRCODE = '22023';
  END IF;
  -- p06_compute_indicator_value is the same computation as the Indicator Summary report (p34_compute_indicator_value).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'projectId', i.project_id, 'code', i.code, 'name', i.name, 'indicatorType', i.indicator_type,
      'unitLabel', i.unit_label, 'numericKind', i.numeric_kind, 'direction', i.direction,
      'displayPrecision', i.display_precision,
      'periodStart', to_char(i.period_start, 'YYYY-MM-DD'), 'periodEnd', to_char(i.period_end, 'YYYY-MM-DD'),
      'baseline', trim_scale(i.baseline_value)::text, 'target', trim_scale(i.target_value)::text,
      'revision', i.revision,
      'status', CASE WHEN i.measurement_mode IS NULL THEN 'LEGACY_REVIEW_REQUIRED' ELSE 'ACTIVE' END,
      'current', pathways.p06_compute_indicator_value(org, wanted_project, i.id, zone)->'current'
    ) ORDER BY i.code, i.id), '[]'::jsonb)
  INTO result
  FROM pathways.project_indicators i
  WHERE i.organization_id = org AND i.project_id = wanted_project AND i.archived_at IS NULL;
  RETURN result;
END
$function$;

ALTER FUNCTION pathways.p06_complement_cell(jsonb, jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p06_release_reach(jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p06_suppress_breakdown(jsonb, boolean) OWNER TO prisma;
ALTER FUNCTION pathways.p06_participation_breakdown(uuid, date, date) OWNER TO prisma;
ALTER FUNCTION pathways.p06_indicator_values(uuid, text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p06_complement_cell(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_release_reach(jsonb) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_suppress_breakdown(jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_participation_breakdown(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_indicator_values(uuid, text) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_participation_breakdown(uuid, date, date) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_indicator_values(uuid, text) TO pathways_runtime;

-- Postconditions: owner, definer mode, volatility, empty search_path and ACL for every touched function.
DO $$ DECLARE fn text; runtime oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime'); BEGIN
 FOREACH fn IN ARRAY ARRAY['pathways.p06_monitoring(uuid,uuid[],date,date,text)','pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
   'pathways.p06_participation_breakdown(uuid,date,date)','pathways.p06_indicator_values(uuid,text)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
  THEN RAISE EXCEPTION '0066 % owner/security/search_path postcondition failed',fn; END IF;
  IF NOT has_function_privilege('pathways_runtime',fn,'EXECUTE')
   OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE has_function_privilege(r.name,fn,'EXECUTE'))
  THEN RAISE EXCEPTION '0066 % runtime ACL postcondition failed',fn; END IF;
 END LOOP;
 IF (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure)
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0066_monitoring_acl')
  OR (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure)
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0066_home_acl')
 THEN RAISE EXCEPTION '0066 replaced function ACL changed'; END IF;
 FOREACH fn IN ARRAY ARRAY['pathways.p06_participation_breakdown(uuid,date,date)','pathways.p06_indicator_values(uuid,text)'] LOOP
  IF EXISTS(SELECT FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=fn::pg_catalog.regprocedure AND a.grantee NOT IN (p.proowner, runtime))
  THEN RAISE EXCEPTION '0066 % ACL postcondition failed',fn; END IF;
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['pathways.p06_complement_cell(jsonb,jsonb)','pathways.p06_release_reach(jsonb)',
   'pathways.p06_suppress_breakdown(jsonb,boolean)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
    AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.provolatile='i'
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
   OR EXISTS(SELECT FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE p.oid=fn::pg_catalog.regprocedure AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION '0066 helper % postcondition failed',fn; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pathways.role_permissions)::text IS DISTINCT FROM pg_catalog.current_setting('pathways.m0066_grants')
 THEN RAISE EXCEPTION '0066 must not change role_permissions'; END IF;
END $$;
COMMIT;
```

- [ ] **Step 4: Wire 0066 into the inventories**

`infra/supabase/phase6/Verify-Forward.ps1`: append `'0066_beneficiary_reach_kpi_values'` as the last line of `$forwardInventory` (after `'0064_evaluation_write_path'`). Before the closing `} finally {` (currently `:988`), append:

```powershell
  # 0066 inventory: two release functions owned by prisma with runtime-only EXECUTE; helpers stay owner-only.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $reachShape = Read-ForwardSql $db @"
SELECT (SELECT bool_and(pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
 FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p06_participation_breakdown(uuid,date,date)'::pg_catalog.regprocedure,
  'pathways.p06_indicator_values(uuid,text)'::pg_catalog.regprocedure))
 AND NOT has_function_privilege('pathways_runtime','pathways.p06_release_reach(jsonb)','EXECUTE')
 AND (SELECT count(*) FROM pathways.role_permissions)=314)::text;
"@
    if ($reachShape.Trim() -cne 'true') { throw "0066 beneficiary reach inventory differs in $db." }
  }
  Write-Output 'FORWARD_0066_BENEFICIARY_REACH_INVENTORY=PASS'
```

`infra/supabase/phase6/Replay-Local.ps1`: after `Write-Output 'ACTIVITY_EXTENSION_REQUESTS_RUNTIME=PASS'` (`:598`, inside `if ($MigrationBaseline)`), add:

```powershell
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql'))) $phase6Database
      Write-Output 'BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS'
```

`scripts/db/hosted-plan.mjs`: add `'0066_beneficiary_reach_kpi_values',` after `'0064_evaluation_write_path'` in `MIGRATIONS_IN_ORDER`, in `PRIOR_BUILD_COMPLETION_POINTS` and in `RESIDUAL_CHAIN_MIGRATIONS`; bump the ledger row count in the comment at `:7` by one and change its range text to end at 0066; insert right before `{ type: 'alter-runtime-role' },`:

```js
    // 0066 needs no preprovision: prisma owns every function and source table it reads.
    { type: 'deploy', migrations: range(65, 65) },
```

`scripts/db/hosted-plan.test.mjs`: increase `assert.equal(MIGRATIONS_IN_ORDER.length, N)` and its comment by one; add `'deploy:0066_beneficiary_reach_kpi_values',` before `'alter-runtime-role',` in the step-order test; rename the "complete 0000-0064 ledger" test to 0066; add:

```js
test('planIndexForAppliedCount on a 0000-0064 ledger resumes at the 0066 deploy', () => {
  const plan = buildPlan()
  const index = planIndexForAppliedCount(MIGRATIONS_IN_ORDER.indexOf('0064_evaluation_write_path') + 1)
  assert.deepEqual(plan[index].migrations, ['0066_beneficiary_reach_kpi_values'])
})
```

`scripts/db/hosted-build.mjs` and `scripts/db/hosted-build.local.test.mjs`: change every `0000-0064` to `0000-0066`. `apps/api/prisma/legacy-retirement.test.ts`: add `'0066_beneficiary_reach_kpi_values',` after `'0064_evaluation_write_path',`. Then run `git grep -n "0000-0064" -- scripts infra apps` and update any remaining current-chain hit.

- [ ] **Step 5: Run the gates and the suite**

Run (PowerShell): `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate` (full gate: replays 0000-0066, Verify-Forward, every runtime suite, the local vitest suites), then `./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`.
Expected: replay exit 0 with `BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS` and `FORWARD_0066_BENEFICIARY_REACH_INVENTORY=PASS` (the replay also runs the updated `reports-runtime.local.test.ts`); the runner prints `NOTICE:  BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS (32 assertions)`.
Run (bash): `node --test scripts/db/hosted-plan.test.mjs && pnpm --filter @pathways/api exec vitest run prisma/legacy-retirement.test.ts && pnpm sad:check`
Expected: all pass.
Run (PowerShell): `./infra/supabase/phase6/Test-SchemaDrift.ps1`
Expected: `SCHEMA_DRIFT=CLEAN` (0066 changes no table or column).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations/0066_beneficiary_reach_kpi_values apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql infra/supabase/phase6 scripts/db apps/api/prisma/legacy-retirement.test.ts apps/api/src/modules/reports/reports-runtime.local.test.ts
git commit -m "feat(db): 0066 release reach counts, participation breakdown and KPI values with suppression

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API KPI values on every KPI surface

**Files:**
- Modify: `apps/api/src/modules/indicators/indicators.service.ts:84-163` (extract `withProgress`, add `readReleasedInTransaction` and `listReleased`)
- Create: `apps/api/src/modules/indicators/indicator-values.controller.ts`
- Modify: `apps/api/src/modules/indicators/indicators.module.ts`
- Modify: `apps/api/src/modules/dashboards/dashboards.service.ts:121-141`
- Modify: `apps/api/src/modules/projects/project-overview-metrics.service.ts:41-44,117-120`
- Test: `apps/api/src/modules/indicators/indicators.service.test.ts`, `apps/api/src/modules/projects/project-overview-metrics.service.test.ts:138-143,248-262,300-315`, `apps/api/src/modules/dashboards/analytics.service.test.ts:289-295`

**Interfaces:**
- Consumes: SQL `pathways.p06_indicator_values(uuid, text) RETURNS jsonb` (Task 1).
- Produces:
  - `IndicatorsService.readReleasedInTransaction(tx: Prisma.TransactionClient, actor: ApplicationIdentity, projectIds: string[], options?: { periodStart?: string; periodEnd?: string }): Promise<MonitoringIndicator[]>` with `description`, `dataSource`, `mode`, `binding`, `measurementId`, `measuredAt`, `measurementSource` always `null` and `progress` from `indicatorProgress`.
  - `IndicatorsService.listReleased(identity: ApplicationIdentity, projectId: string): Promise<MonitoringIndicator[]>` (authorized operation `reports.indicator.read`).
  - HTTP `GET /projects/:projectId/indicator-values` (`@RequirePermission('monitoring.read')`), body = `MonitoringIndicator[]` that parses with `projectIndicatorListSchema`.

- [ ] **Step 1: Write the failing service tests**

Append to `apps/api/src/modules/indicators/indicators.service.test.ts` (add `import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'` and `import { IndicatorValuesController } from './indicator-values.controller'` at the top):

```ts
const released = {
  id: indicatorId,
  projectId,
  code: 'PEOPLE_TRAINED',
  name: 'People trained',
  indicatorType: 'OUTPUT',
  unitLabel: 'people',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  baseline: '0',
  target: '20',
  revision: 1,
  status: 'ACTIVE',
  current: { state: 'AVAILABLE', value: '12', reason: null },
}
const manager: ApplicationIdentity = {
  ...actor,
  roles: ['PROGRAM_MANAGER'],
  permissions: ['monitoring.read', 'reports.indicator.read'],
}

describe('Released indicator values (0066)', () => {
  const service = new IndicatorsService({} as PrismaService)
  beforeEach(() => {
    vi.resetAllMocks()
    boundary.run.mockImplementation(
      async (
        _prisma: PrismaService,
        identity: ApplicationIdentity,
        permission: string,
        work: (client: Prisma.TransactionClient, current: ApplicationIdentity) => Promise<unknown>,
      ) => {
        if (!identity.permissions.includes(permission)) throw new ForbiddenException()
        return work(tx as unknown as Prisma.TransactionClient, identity)
      },
    )
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('p06_indicator_values') ? [{ item: { ...released } }] : [],
    )
  })

  it('returns values with progress and nulls every definition, binding and measurement field', async () => {
    const [row] = await service.readReleasedInTransaction(
      tx as unknown as Prisma.TransactionClient,
      manager,
      [projectId],
      { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
    )
    expect(row).toMatchObject({
      code: 'PEOPLE_TRAINED',
      description: null,
      dataSource: null,
      mode: null,
      binding: null,
      measurementId: null,
      measuredAt: null,
      measurementSource: null,
      progress: { state: 'AVAILABLE', value: '60' },
    })
    const call = tx.$queryRaw.mock.calls.find(([query]) =>
      sqlText(query).includes('p06_indicator_values'),
    )?.[0] as { values: unknown[] }
    expect(call.values).toContain('2026-01-01')
    expect(call.values).toContain(projectId)
  })

  it('maps a database scope refusal to 403', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('p06_indicator_values'))
        throw Object.assign(new Error('denied'), { code: 'P2010', meta: { code: '42501' } })
      return []
    })
    await expect(
      service.readReleasedInTransaction(tx as unknown as Prisma.TransactionClient, manager, [
        projectId,
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses more than 100 rows with 400', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('p06_indicator_values')
        ? Array.from({ length: 101 }, () => ({ item: { ...released } }))
        : [],
    )
    await expect(
      service.readReleasedInTransaction(tx as unknown as Prisma.TransactionClient, manager, [
        projectId,
      ]),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lists released values for a Program Manager under reports.indicator.read and a scoped project', async () => {
    await expect(service.listReleased(manager, projectId)).resolves.toHaveLength(1)
    expect(boundary.run).toHaveBeenCalledWith(
      expect.anything(),
      manager,
      'reports.indicator.read',
      expect.any(Function),
    )
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.listReleased(manager, projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('gates the route with monitoring.read', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, IndicatorValuesController.prototype.list),
    ).toBe('monitoring.read')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.service.test.ts`
Expected: FAIL, cannot resolve `./indicator-values.controller` and `readReleasedInTransaction` is not a function.

- [ ] **Step 3: Implement the service methods**

In `indicators.service.ts`, above `@Injectable()`, add:

```ts
// Released rows carry no definition text, binding or measurement provenance.
const releasedNulls = {
  description: null,
  dataSource: null,
  mode: null,
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
}

/** Parses one indicator row and adds its baseline-to-target progress. */
function withProgress(row: Record<string, unknown>, failure: string): MonitoringIndicator {
  const parsed = monitoringIndicatorSchema.safeParse({
    ...row,
    progress: missingMetric('NOT_YET_CALCULATED'),
    contractVersion: P06_CONTRACT_VERSION,
  })
  if (!parsed.success) throw new ServiceUnavailableException(failure)
  const indicator = parsed.data
  const progress = indicator.direction
    ? indicatorProgress(indicator.current, indicator.baseline, indicator.target, indicator.direction)
    : missingMetric('LEGACY_REVIEW_REQUIRED')
  return { ...indicator, progress }
}
```

Replace the `return rows.map((row) => { ... })` block at the end of `readProjectIndicatorsInTransaction` (`:138-162`) with:

```ts
    return rows.map((row) => withProgress(row, 'Stored indicator contract is unavailable.'))
```

Add after `readInTransaction`:

```ts
  /** KPI values from pathways.p06_indicator_values for every role holding monitoring.read and reports.indicator.read. */
  async readReleasedInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { periodStart?: string; periodEnd?: string } = {},
  ): Promise<MonitoringIndicator[]> {
    if (projectIds.length === 0) return []
    if (projectIds.length > 100 || projectIds.some((id) => !UUID_PATTERN.test(id)))
      throw new BadRequestException('Narrow the monitoring project scope.')
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    let rows: Array<{ item: Record<string, unknown> }>
    try {
      rows = await tx.$queryRaw<Array<{ item: Record<string, unknown> }>>(Prisma.sql`
        SELECT v.item
        FROM unnest(ARRAY[${Prisma.join(projectIds.map((id) => Prisma.sql`${id}::uuid`))}]::uuid[]) AS p(id)
        CROSS JOIN LATERAL jsonb_array_elements(pathways.p06_indicator_values(p.id, ${zone})) AS v(item)
        WHERE ${options.periodStart ?? null}::text IS NULL
          OR (v.item->>'periodStart' = ${options.periodStart ?? null}::text AND v.item->>'periodEnd' = ${options.periodEnd ?? null}::text)
        LIMIT 101
      `)
    } catch (error) {
      monitoringSqlError(error)
    }
    if (rows.length > 100)
      throw new BadRequestException(
        'More than 100 indicator definitions match; narrow the project scope.',
      )
    return rows.map(({ item }) =>
      withProgress({ ...item, ...releasedNulls }, 'Released indicator contract is unavailable.'),
    )
  }

  listReleased(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.indicator.read',
      async (tx, actor) =>
        this.readReleasedInTransaction(tx, actor, [
          await this.requireProject(tx, actor, projectId),
        ]),
    )
  }
```

Create `apps/api/src/modules/indicators/indicator-values.controller.ts`:

```ts
import { Controller, ForbiddenException, Get, Header, Inject, Param, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { IndicatorsService } from './indicators.service'

/** KPI values for monitoring.read holders; definitions stay behind indicators.read. */
@Controller('projects/:projectId/indicator-values')
export class IndicatorValuesController {
  constructor(@Inject(IndicatorsService) private readonly service: IndicatorsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.listReleased(request.user, projectId)
  }
}
```

In `indicators.module.ts` import it and set `controllers: [IndicatorsController, IndicatorValuesController, IndicatorLibraryController]`.

- [ ] **Step 4: Run to verify the service tests pass**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators/indicators.service.test.ts`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Write the failing surface tests**

In `apps/api/src/modules/projects/project-overview-metrics.service.test.ts`, rename the mock key `readInTransaction` to `readReleasedInTransaction` in the harness (`:139-143`) and in every `expect(indicators.readInTransaction)` (`:255`, `:313`). Replace the test "returns KPI achievement as null without indicator read permission" and the efficiency test that uses `PROGRAM_MANAGER` with:

```ts
  it('returns KPI achievement to a Program Manager through the released values', async () => {
    const { service, indicators } = harness()
    const manager = actor('PROGRAM_MANAGER')
    expect(manager.permissions).not.toContain('indicators.read')
    const result = await service.read(manager, projectA)
    expect(result.kpiAchievement?.metric.state).toBe('AVAILABLE')
    expect(indicators.readReleasedInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ roles: ['PROGRAM_MANAGER'] }),
      [projectA],
    )
  })

  it('returns KPI achievement as null without monitoring.read', async () => {
    const { service, indicators } = harness()
    const officer = actor('PROJECT_OFFICER')
    expect(officer.permissions).not.toContain('monitoring.read')
    const result = await service.read(officer, projectA)
    expect(result.kpiAchievement).toBeNull()
    expect(result.efficiencyRatio).toBeNull()
    expect(indicators.readReleasedInTransaction).not.toHaveBeenCalled()
  })
```

In `apps/api/src/modules/dashboards/analytics.service.test.ts:290`, rename the mock key `readInTransaction` to `readReleasedInTransaction`.

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/projects/project-overview-metrics.service.test.ts src/modules/dashboards/analytics.service.test.ts`
Expected: FAIL (`readReleasedInTransaction` never called; descriptive indicator summaries empty).

- [ ] **Step 7: Switch the surfaces**

`project-overview-metrics.service.ts`, `kpi` (`:41-44`):

```ts
  private async kpi(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    const rows = await this.indicators.readReleasedInTransaction(tx, actor, [projectId])
    return kpiAchievement(rows.map((row) => row.progress))
  }
```

and at `:117-120`:

```ts
      // p06_indicator_values requires monitoring.read and reports.indicator.read in the database as well.
      const kpi =
        can('monitoring.read') && can('reports.indicator.read')
          ? await this.kpi(tx, actor, row.id)
          : null
```

`dashboards.service.ts:121-141`: import `type AtomicPermission` from `'../auth/authorization-policy'` and replace the `allowed`/`indicators` lines and the note:

```ts
      const can = (permission: AtomicPermission) =>
        hasAtomicPermission(actor.roles[0], actor.permissions, permission)
      // Released values need monitoring.read and reports.indicator.read, as p06_indicator_values checks.
      const allowed = can('monitoring.read') && can('reports.indicator.read')
      const indicators = allowed
        ? await this.indicators.readReleasedInTransaction(
            tx,
            actor,
            projects.map((project) => project.id),
            period,
          )
        : []
```

and the `indicatorNote` fallback string to `'Indicator values require monitoring.read and reports.indicator.read; this role receives aggregate monitoring only.'`.

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/indicators src/modules/projects src/modules/dashboards src/modules/reports`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/indicators apps/api/src/modules/dashboards/dashboards.service.ts apps/api/src/modules/dashboards/analytics.service.test.ts apps/api/src/modules/projects
git commit -m "feat(api): serve KPI values from p06_indicator_values on every KPI surface

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API participation insights and activity reach suppression

**Files:**
- Modify: `apps/api/src/modules/analytics-insights/analytics-insights.service.ts:10-36,64-75,126-194`
- Modify: `apps/api/src/modules/analytics-insights/insights-math.ts:1-34` (remove `suppressBreakdown`, `SMALL_CELL_MAX`, `SuppressedCell`)
- Modify: `apps/api/src/modules/activities/activities.service.ts:273-283,331,797,844-873,886`
- Test: `apps/api/src/modules/analytics-insights/analytics-insights.test.ts`, `apps/api/src/modules/activities/activities.access.test.ts`, `apps/api/src/modules/activities/activity-capabilities.test.ts`

**Interfaces:**
- Consumes: SQL `pathways.p06_participation_breakdown(uuid, date, date) RETURNS jsonb` (Task 1); `SMALL_CELL_THRESHOLD` from `apps/api/src/modules/dashboards/descriptive-analytics.ts:22`; `monitoringSqlError` from `indicators.service.ts`.
- Produces: `GET /analytics/insights/participation` unchanged in shape (`ParticipationBreakdown`), now allowed for `monitoring.read` + `analytics.descriptive.read` + `beneficiaries.aggregates.read`. Activity `beneficiariesReached` becomes `number | null` in the detail payload (null = suppressed 1-4); the list stays `number | null`.

- [ ] **Step 1: Write the failing participation tests**

In `analytics-insights.test.ts`: remove the `describe('suppressBreakdown', ...)` block (its rules now live in SQL, Task 1 assertions 13-16) and `suppressBreakdown` from the import. Add to the harness tx `$queryRaw: vi.fn(async () => [{ data: breakdown }])` with, above `harness`:

```ts
const breakdown = {
  projectId: projectA,
  total: 17,
  totalSuppressed: false,
  byActivity: [
    { activityId: act1, activityName: 'Workshop', count: 8, suppressed: false },
    { activityId: act2, activityName: 'Visit', count: 9, suppressed: false },
  ],
  byMonth: [{ month: '2026-01', count: 17, suppressed: false }],
  byAttendanceStatus: [
    { status: 'PRESENT', count: 15, suppressed: false },
    { status: 'ABSENT', count: null, suppressed: true },
    { status: 'COMPLETED', count: 0, suppressed: false },
    { status: 'NOT_COMPLETED', count: 0, suppressed: false },
    { status: 'EXCUSED', count: null, suppressed: true },
  ],
}
```

Replace the two participation tests with:

```ts
  it('participation: a Program Manager reads the database release and one audit row is written', async () => {
    const { service, tx } = harness()
    const r = await service.participation(actor('PROGRAM_MANAGER'), {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    })
    expect(r).toEqual(breakdown)
    const query = (tx.$queryRaw.mock.calls as unknown as Array<[{ sql: string; values: unknown[] }]>)[0][0]
    expect(query.sql).toContain('pathways.p06_participation_breakdown')
    expect(query.values).toEqual([projectA, '2026-01-01', '2026-03-31'])
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('participation: a role without monitoring.read is refused before any query', async () => {
    const { service, tx } = harness()
    await expect(
      service.participation(actor('PROJECT_OFFICER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('participation: a database scope refusal is 403 and an invalid release is 503', async () => {
    const refused = harness({
      $queryRaw: vi.fn(async () => {
        throw Object.assign(new Error('denied'), { code: 'P2010', meta: { code: '42501' } })
      }),
    })
    await expect(
      refused.service.participation(actor('GRANT_MANAGER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const broken = harness({ $queryRaw: vi.fn(async () => [{ data: { projectId: projectA } }]) })
    await expect(
      broken.service.participation(actor('GRANT_MANAGER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(broken.tx.auditLog.create).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/analytics-insights`
Expected: FAIL (Program Manager refused; groupBy path still used).

- [ ] **Step 3: Implement the participation read**

In `analytics-insights.service.ts`: change `import type { Prisma } from '@prisma/client'` to `import { Prisma } from '@prisma/client'`; add `participationBreakdownSchema` to the `@pathways/shared` import and drop `ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES`; import `monitoringSqlError` from `'../indicators/indicators.service'`; change the insights-math import to `import { currentMeasurements, summarizeBudget } from './insights-math'`. Replace `participationPermissions` and `participationAnyOf` (`:31-36`) with:

```ts
// The participation release checks these same three permissions plus project scope in pathways.p06_participation_breakdown.
const participationPermissions: AtomicPermission[] = [
  'monitoring.read',
  'analytics.descriptive.read',
  'beneficiaries.aggregates.read',
]
```

Remove the `anyOf` parameter from `require` and `run` (no remaining caller). Replace `participation` (`:126-194`) with:

```ts
  participation(identity: ApplicationIdentity, input: unknown) {
    const compute: Compute<ParticipationBreakdown> = async (tx, _actor, query) => {
      let rows: Array<{ data: unknown }>
      try {
        rows = await tx.$queryRaw<Array<{ data: unknown }>>(
          Prisma.sql`SELECT pathways.p06_participation_breakdown(${query.projectId}::uuid,${query.periodStart ?? null}::date,${query.periodEnd ?? null}::date) AS data`,
        )
      } catch (error) {
        monitoringSqlError(error)
      }
      const parsed = participationBreakdownSchema.safeParse(rows[0]?.data)
      if (!parsed.success)
        throw new ServiceUnavailableException('Participation breakdown contract is unavailable.')
      return parsed.data
    }
    return this.run(identity, input, 'participation-breakdown', participationPermissions, compute)
  }
```

In `insights-math.ts` delete `SMALL_CELL_MAX`, `SuppressedCell`, `isSmall` and `suppressBreakdown` (lines 3-34).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/analytics-insights`
Expected: PASS.

- [ ] **Step 5: Write the failing activity reach tests**

`activities.access.test.ts`, after "returns 0 reached for a granted reader with no approved sessions":

```ts
  it('withholds a reached sum of 1-4 as null for display consistency', async () => {
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'beneficiaries.aggregates.read'],
    }
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    tx.activityUpdate.groupBy.mockResolvedValueOnce([
      { activityId: activity.id, _sum: { beneficiariesReachedThisSession: 3 } },
    ])
    const [item] = await service.list(state.actor, projectId)
    expect(item).toMatchObject({ beneficiariesReached: null })
  })
```

`activity-capabilities.test.ts`, after "sums APPROVED session counts for beneficiariesReached":

```ts
  it('returns null beneficiariesReached for a detail sum of 1-4', async () => {
    const actor = actorFor('PROJECT_MANAGER')
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [activityRow('IN_PROGRESS', 0)],
    })
    tx.activityUpdate.groupBy.mockResolvedValueOnce([
      { activityId, _sum: { beneficiariesReachedThisSession: 4 } },
    ])
    const detail = await service.get(actor, projectId, activityId)
    expect(detail.beneficiariesReached).toBeNull()
  })
```

- [ ] **Step 6: Run to verify failure, then implement**

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities`
Expected: FAIL (3 and 4 returned).

In `activities.service.ts`: import `{ SMALL_CELL_THRESHOLD } from '../dashboards/descriptive-analytics'`; change `reached: ReadonlyMap<string, number>` (`:275`) and the `new Map<string, number>()` at `:797`, `:851`, `:886` to `number | null`; replace the final loop of `readReached` (`:870-871`) with:

```ts
    // Sums of 1-4 are withheld as null to match the aggregate release rule; this is display consistency only.
    for (const row of rows) {
      const sum = row._sum.beneficiariesReachedThisSession ?? 0
      reached.set(row.activityId, sum > 0 && sum < SMALL_CELL_THRESHOLD ? null : sum)
    }
```

and the detail mapping at `:331`:

```ts
    beneficiariesReached: metrics.reached.has(row.id) ? (metrics.reached.get(row.id) ?? null) : 0,
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities src/modules/analytics-insights && pnpm --filter @pathways/api typecheck && pnpm --filter @pathways/api lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/analytics-insights apps/api/src/modules/activities
git commit -m "feat(api): read participation from p06_participation_breakdown and withhold activity reach of 1-4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web labels, gates and analytics periods

**Files:**
- Create: `apps/web/src/features/dashboard/monitoring-reach-metrics.ts`, `apps/web/src/features/dashboard/monitoring-reach-metrics.test.ts`
- Modify: `apps/web/src/features/dashboard/role-dashboard.tsx:49,254,304-328,478-480`
- Modify: `apps/web/src/features/analytics/analytics-dashboard.tsx:165-166,337-344,1072`
- Modify: `apps/web/src/features/analytics/use-analytics-insights.ts:16-33`
- Modify: `apps/web/src/features/analytics/participation-breakdown-panel.tsx:8`
- Modify: `apps/web/src/lib/services/pathways-client.ts:373,1099-1103,2863`
- Modify: `apps/web/src/types/pathways.ts:186`
- Modify: `apps/web/src/features/projects/activity-detail-panel.tsx:180-185`, `apps/web/src/features/projects/activity-form-dialog.tsx:209,639-641`
- Test: `apps/web/src/features/analytics/analytics-dashboard.test.tsx`, `apps/web/src/features/analytics/analytics-insights-components.test.tsx:36-37`, `apps/web/src/features/projects/activity-detail-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /projects/:projectId/indicator-values` (Task 2), participation gate (Task 3), `overviewMetricLabel(cell, 'count')` (`apps/web/src/features/projects/project-utils.ts:81-89`).
- Produces: `monitoringReachMetrics(result: MonitoringDashboard): DashboardMetric[]`; `pathwaysClient.getProjectIndicatorValues(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]>`; `canReadInsight('participation')` true for `analytics.descriptive.read` + `monitoring.read` + `beneficiaries.aggregates.read`.

- [ ] **Step 1: Write the failing reach card test**

Create `apps/web/src/features/dashboard/monitoring-reach-metrics.test.ts`:

```ts
import type { MonitoringDashboard } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { monitoringReachMetrics } from './monitoring-reach-metrics'

describe('monitoringReachMetrics', () => {
  it('shows withheld and suppressed counts by label, never as 0', () => {
    const result = {
      scopeProjectCount: 2,
      participationRecords: { state: 'AVAILABLE', value: '1234', reason: null },
      attendingIndividuals: { state: 'SUPPRESSED', value: null, reason: 'COMPLEMENTARY_SUPPRESSION' },
      enrolledIndividuals: { state: 'MISSING', value: null, reason: 'SENSITIVE_RELEASE_NOT_ENABLED_V1' },
      enrolledBeneficiaryRecords: { state: 'ZERO', value: '0', reason: null },
    } as unknown as MonitoringDashboard
    expect(monitoringReachMetrics(result).map((metric) => [metric.id, metric.value])).toEqual([
      ['projects', '2'],
      ['participation', '1,234'],
      ['attending', 'Suppressed (fewer than 5)'],
      ['enrolled', 'Unavailable'],
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pathways/web exec vitest run src/features/dashboard/monitoring-reach-metrics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement and wire the reach cards**

Create `apps/web/src/features/dashboard/monitoring-reach-metrics.ts`:

```ts
import { overviewMetricLabel } from '@/features/projects/project-utils'
import type { DashboardMetric } from '@/types/pathways'
import type { MonitoringDashboard } from '@pathways/shared'

const PERIOD_NOTE = 'Covers the last 12 months.'

/** Role dashboard reach cards; suppressed and withheld counts keep their label instead of reading 0. */
export const monitoringReachMetrics = (result: MonitoringDashboard): DashboardMetric[] => [
  {
    id: 'projects',
    label: 'Authorized projects',
    value: String(result.scopeProjectCount),
    helperText: 'Server-derived project scope.',
  },
  {
    id: 'participation',
    label: 'Participation records',
    value: overviewMetricLabel(result.participationRecords, 'count'),
    helperText: `Committed records, not a count of people. ${PERIOD_NOTE}`,
  },
  {
    id: 'attending',
    label: 'Distinct attending individuals',
    value: overviewMetricLabel(result.attendingIndividuals, 'count'),
    helperText: `Present/completed attendance; deduplicated across projects. ${PERIOD_NOTE}`,
  },
  {
    id: 'enrolled',
    label: 'Enrolled individuals',
    value: overviewMetricLabel(result.enrolledIndividuals, 'count'),
    helperText: 'Enrollment overlaps the last 12 months; privacy suppression applies.',
  },
]
```

In `role-dashboard.tsx`: import `{ monitoringReachMetrics } from './monitoring-reach-metrics'`; replace the `setMetrics([ ... ])` array in the `.then` (`:304-328`) with `setMetrics(monitoringReachMetrics(result))`; delete `countOrZero` and its comment (`:478-480`); remove `formatMetricCell` from the `@pathways/shared` import (`:49`); delete `PERIOD_NOTE` (`:254`) if it has no other use in the file.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @pathways/web exec vitest run src/features/dashboard`
Expected: PASS.

- [ ] **Step 5: Write the failing analytics tests**

In `analytics-dashboard.test.tsx`: add `getProjectIndicatorValues: vi.fn(),` to the `api` mock and `api.getProjectIndicatorValues.mockResolvedValue([])` in `beforeEach`. The M&E Officer fixture really holds `indicators.read`, and the dashboard now needs it to read definitions, so add `'indicators.read'` to the default `currentAccess.profile.permissions` in both the hoisted object (`:36`) and `beforeEach` (`:229-234`). In "renders the participation breakdown with suppressed cells for a role that may read it" replace the added permissions with `'analytics.descriptive.read', 'beneficiaries.aggregates.read'`. Replace "does not offer the participation view to an aggregate-only role" with:

```ts
  it('offers the participation view to a Program Manager holding the release gates', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'analytics.read',
      'analytics.descriptive.read',
      'beneficiaries.aggregates.read',
      'reports.indicator.read',
    ]
    insights.participation = {
      data: {
        projectId: 'project-a',
        total: 12,
        totalSuppressed: false,
        byActivity: [],
        byMonth: [],
        byAttendanceStatus: [],
      },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectIndicatorValues).toHaveBeenCalledWith('project-a'))
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Analysis view'), {
      target: { value: 'participation' },
    })
    expect((await screen.findByText(/Total participation/)).textContent).toContain('12')
  })

  it('keeps participation restricted without beneficiaries.aggregates.read', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Analysis view'), {
      target: { value: 'participation' },
    })
    expect(
      await screen.findByText('Participation patterns are restricted for your role.'),
    ).toBeTruthy()
  })

  it('shows a suppressed reach count with the fewer-than-5 label', async () => {
    api.getMonitoringDashboard.mockResolvedValue({
      ...monitoring,
      enrolledIndividuals: { state: 'SUPPRESSED', value: null, reason: 'SMALL_COHORT' },
    })

    render(<AnalyticsDashboard />)

    expect(await screen.findByText('Suppressed (fewer than 5)')).toBeTruthy()
  })
```

If the Analysis view select omits the option for a restricted role, assert `screen.queryByText('Participation patterns', { selector: 'option' })` is null in the second test instead of the restricted text (match the current option behavior in `analytics-dashboard.tsx:959-970`).

In `analytics-insights-components.test.tsx:36-37` change both `'Suppressed'` expectations to `'Suppressed (fewer than 5)'`.

In `activity-detail-panel.test.tsx` add:

```ts
  it('shows a withheld reached count as suppressed, not as a number', () => {
    render(
      <ActivityDetailContent
        activity={{ ...activity, beneficiariesReached: null }}
        canDecideProof={false}
        canEdit={false}
        canLogExpense={false}
        canRequestExtension={false}
        canSubmitProof={false}
        canValidateExpense={false}
        canValidateProof={false}
        indicators={[]}
        journeyStages={[]}
        onActivityChanged={vi.fn()}
        onEdit={vi.fn()}
        onSubmitProof={vi.fn()}
      />,
    )
    expect(screen.getByText('Suppressed (fewer than 5)')).toBeTruthy()
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @pathways/web exec vitest run src/features/analytics src/features/projects/activity-detail-panel.test.tsx`
Expected: FAIL (no `getProjectIndicatorValues` call, old gate, "Suppressed" label, `null` type error).

- [ ] **Step 7: Implement the web changes**

`use-analytics-insights.ts`: set `participation: ['analytics.descriptive.read', 'monitoring.read', 'beneficiaries.aggregates.read']` and replace `canReadInsight` with:

```ts
/** Each insight requires every permission its release function checks. */
export function canReadInsight(profile: Principal, kind: 'trends' | 'budget' | 'participation') {
  return required[kind].every((permission) => principalHasAtomicPermission(profile, permission))
}
```

`participation-breakdown-panel.tsx:8`: `export const SUPPRESSED_LABEL = 'Suppressed (fewer than 5)'`.

`pathways-client.ts`: add to the `PathwaysClient` interface after `getProjectIndicators` (`:373`):

```ts
  getProjectIndicatorValues(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]>
```

and to `BackendReadyPathwaysClient` after `getProjectIndicators` (`:1103`):

```ts
  // KPI values for monitoring.read holders without indicators.read; definitions stay closed.
  async getProjectIndicatorValues(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]> {
    return projectIndicatorListSchema.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicator-values`, {
        signal,
      }),
    )
  }
```

In `parseActivity` (`:2863`) replace `typeof row.beneficiariesReached !== 'number'` with `(row.beneficiariesReached !== null && typeof row.beneficiariesReached !== 'number')`.

`types/pathways.ts:186`: `beneficiariesReached: number | null`.

`analytics-dashboard.tsx`: after `canReadIndicators` (`:165`) add:

```ts
  // Definitions need indicators.read; other monitoring roles read released values for periods and KPIs.
  const canReadIndicatorDefinitions = principalHasAtomicPermission(profile, 'indicators.read')
  const canReadIndicatorValues =
    canReadIndicators && principalHasAtomicPermission(profile, 'reports.indicator.read')
```

replace the indicator branch of the `Promise.all` (`:341-343`) with:

```ts
      canReadIndicatorDefinitions
        ? pathwaysClient.getProjectIndicators(projectId)
        : canReadIndicatorValues
          ? pathwaysClient.getProjectIndicatorValues(projectId)
          : Promise.resolve<ProjectIndicator[]>([]),
```

(add both flags to that effect's dependency array) and the reach card value (`:1072`) with `overviewMetricLabel(monitoring.enrolledIndividuals, 'count')`.

`activity-detail-panel.tsx:182-184`:

```tsx
            {activity.beneficiariesReached === null
              ? 'Suppressed (fewer than 5)'
              : Number.isFinite(activity.beneficiariesReached)
                ? `${activity.beneficiariesReached} of ${activity.targetBeneficiaries}`
                : 'Unavailable'}
```

`activity-form-dialog.tsx:209`: `beneficiariesReached: activity.beneficiariesReached ?? 0,` and its FormDescription (`:639-641`):

```tsx
                          <FormDescription>
                            {activity?.beneficiariesReached === null
                              ? 'Suppressed (fewer than 5).'
                              : 'Server-computed distinct qualifying beneficiaries.'}
                          </FormDescription>
```

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @pathways/web exec vitest run src/features/analytics src/features/dashboard src/features/projects && pnpm --filter @pathways/web typecheck && pnpm --filter @pathways/web lint`
Expected: PASS. Fix any other typecheck hit from `beneficiariesReached: number | null` by treating `null` as "Suppressed (fewer than 5)" (`activity-proof-dialog.tsx:153-155` already returns no suggestion for a non-number).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): label suppressed reach, open participation to release gates, read KPI values without definitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation

**Files:**
- Create: `docs/cr-pathways-beneficiary-reach-kpi-values.md` (from `docs/change-record-template.md`)
- Modify: `docs/rfc-pathways-saddd-privacy.md`, `docs/qad-pathways.md`, `docs/deferred-features.md:31,62` (+ new row before `## Maintenance` at `:67`), `docs/activity-log.md`, `docs/index.md` (Change Log, `:142`)

- [ ] **Step 1: Write the CR**

Create `docs/cr-pathways-beneficiary-reach-kpi-values.md`:

```markdown
# Change Record: Beneficiary Reach and KPI Values Release

**ID:** `cr-pathways-beneficiary-reach-kpi-values`  
**Date:** 2026-10-06  
**Status:** Approved

## 1. Trigger

Developer decision 2026-10-06 (spec `docs/superpowers/specs/2026-10-06-beneficiary-reach-kpi-values-design.md`): release beneficiary reach with 1-4 shown as "fewer than 5", open participation insights to Program and Grant Manager, and give them KPI values only, with no new permission grants.

## 2. Current Contract

`p06_monitoring` and `p06_home_dashboard` overwrite the four reach counts with SENSITIVE_RELEASE_NOT_ENABLED_V1 for every role. Participation insights need `journeys.read` and `beneficiaries.records.read`. Indicator rows need `indicators.read`, which Program and Grant Manager lack, although they already see current values in the Indicator Summary report. Activity reach has no suppression, and the role dashboard shows withheld counts as "0".

## 3. Proposed Change

- Migration `0066_beneficiary_reach_kpi_values` (after `0064_evaluation_write_path`): `p06_monitoring` and `p06_home_dashboard` return the counts from `p06_compute_monitoring` with 1-4 SMALL_COHORT and nested-count COMPLEMENTARY_SUPPRESSION (records minus individuals, individuals minus attending, records minus attending of 1-4 hides the inner count). The home dashboard keeps the placeholder for callers without `monitoring.read` on every project.
- `p06_participation_breakdown(project, start, end)`: needs `monitoring.read`, `analytics.descriptive.read`, `beneficiaries.aggregates.read` and project scope; hides cells of 1-4 records or 1-4 people, plus the smallest other non-zero cell when exactly one is hidden; a total of 1-4 hides everything.
- `p06_indicator_values(project, zone)`: needs `monitoring.read`, `reports.indicator.read` and project scope; returns display fields and the current value cell from `p06_compute_indicator_value` (the same computation as `p34_compute_indicator_value`), never definitions, bindings, field IDs or measurement IDs.
- API: the overview KPI card, monitoring dashboard indicators, descriptive indicator summaries and the monitoring report read `p06_indicator_values` for every role; new `GET /projects/:projectId/indicator-values` (`monitoring.read` and `reports.indicator.read`) gives the Analytics page reporting periods; participation reads `p06_participation_breakdown`; activity reach sums of 1-4 become null.
- Web: reach cards and the participation panel use "Suppressed (fewer than 5)"; withheld counts show "Unavailable", not "0" (supersedes `cr-pathways-overview-zero-display` for role dashboard reach counts); the Indicators tab and route stay closed to Program and Grant Manager.

## 4. Impact

### Product
Program and Grant Manager see reach counts, KPI values and participation patterns. M&E Officer and Project Manager now also see derived indicator values on KPI surfaces.
### Data / Migration
Functions only; no table, column, policy or grant change; role_permissions stays 314.
### Authorization / Privacy
All functions are owned by `prisma`, SECURITY DEFINER, EXECUTE for `pathways_runtime` only. Hosted `prisma` has no BYPASSRLS; FORCE RLS bindings and measurements are read through the `p06_*_owner_read` policies, proven by the runtime suite with `prisma` set NOBYPASSRLS. System Administrator also holds the participation gates and gains the view.
### API
New `GET /projects/:projectId/indicator-values`; activity detail `beneficiariesReached` is `number | null`.
### UI
See section 3.
### Tests
`apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql` (32 assertions); API and web unit tests listed in QAD-T121 to QAD-T123, QAD-A45 and QAD-A46.
### Documentation
RFC SADDD privacy, QAD, deferred register rows, activity log, index.

## 5. Alternatives Considered

- Grant `indicators.read` or `journeys.read` to Program and Grant Manager: rejected, it changes the locked RBAC matrix.
- Reuse `p34_compute_indicator_value`: rejected, it is owned by `report_projection_owner` and needs `session_user='pathways_runtime'`, so a new hosted owner chain would be required.
- Branch by role in the API: rejected, one code path per surface.

## 6. Migration / Rollback

Apply 0066 after the local replay and SAD migration review. Rollback is a forward migration restoring the baseline `p06_monitoring` and `p06_home_dashboard` bodies (`0000` migration) and dropping the five new functions; the API then falls back to withheld states.

## 7. Verification

Local replay 0000-0066 with `BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS` and `FORWARD_0066_BENEFICIARY_REACH_INVENTORY=PASS`; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm sad:check`, `pnpm docs:check`; devV2 apply with read-only checks; manager in-app smoke.

## 8. Approval

Developer, 2026-10-06 (spec approved). Migration renumbered to 0066 by the controller.

## 9. Disposition

Pending implementation. Known limit: activity reach suppression is display consistency only (see `deferred-features.md`).
```

- [ ] **Step 2: Update the RFC, QAD, register, log and index**

`docs/rfc-pathways-saddd-privacy.md`: set `**Last reconciled:** 2026-10-06` and add before `## Tests`:

```markdown
## Release Surfaces (cr-pathways-beneficiary-reach-kpi-values, 0066)

- Monitoring reach counts (records, individuals, attending individuals, participation records): 1-4 is suppressed; when records minus individuals, individuals minus attending, or records minus attending is 1-4, the inner count is suppressed too.
- Participation breakdowns: a cell of 1-4 records or 1-4 people is suppressed; a lone suppressed cell also hides the smallest other non-zero cell in its breakdown; a total of 1-4 hides every cell.
- Indicator current values use the Indicator Summary report computation and its suppression.
- Activity reach of 1-4 is withheld in the activity views only; per-session counts stay readable to `activities.read` holders.
```

`docs/qad-pathways.md`: confirm the next free IDs with `git grep -o "QAD-T1[0-9][0-9]\|QAD-A[0-9][0-9]" -- docs/qad-pathways.md | sort -u | tail` (expected QAD-T121 and QAD-A45 if 0064 added none). Add to section 3.1:

```markdown
| QAD-T121 | Program and Grant Manager receive reach counts and KPI current values with 1-4 suppressed, through the same functions as M&E and Project Manager | Happy | Functional Suitability | PRD-F8 | G-F8-3, G-F8-5 | UC-F8-1 | `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql`; `apps/api/src/modules/projects/project-overview-metrics.service.test.ts`; `apps/api/src/modules/indicators/indicators.service.test.ts` |
| QAD-T122 | the participation view opens to holders of monitoring.read, analytics.descriptive.read and beneficiaries.aggregates.read and reads the suppressed database release | Happy | Functional Suitability | PRD-F9 | G-F9-9 | UC-F9-1 | `apps/api/src/modules/analytics-insights/analytics-insights.test.ts`; `apps/web/src/features/analytics/analytics-dashboard.test.tsx` |
```

to section 3.2:

```markdown
| QAD-T123 | withheld or suppressed reach counts show "Unavailable" or "Suppressed (fewer than 5)", never "0", and activity reach of 1-4 reads as suppressed | Sad | Usability | PRD-F8 | G-F8-3 | UC-F8-1 | `apps/web/src/features/dashboard/monitoring-reach-metrics.test.ts`; `apps/web/src/features/projects/activity-detail-panel.test.tsx`; `apps/api/src/modules/activities/activities.access.test.ts` |
```

to section 3.3:

```markdown
| QAD-A45 | reach, participation and KPI releases never return 1-4 or a complement that rebuilds it, never return definitions, bindings or measurement IDs, and refuse Project Officer, unassigned and cross-organization calls (42501) | Abuse | Security | PRD-F8 | G-F8-1, G-F8-3, G-F8-5 | UC-F8-1 | `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql` |
| QAD-A46 | with prisma set NOBYPASSRLS, as on hosted, KPI values still read the FORCE RLS indicator bindings and measurements | Abuse | Reliability | PRD-F7 | G-F7-4 | UC-F7-2 | `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql` |
```

Update QAD-A39 evidence to `apps/api/prisma/tests/beneficiary-reach-kpi-values-runtime.sql` and its last clause to "roles without the three release permissions are refused before any query"; append the new IDs to the PRD-F7 and PRD-F8 rows of section 3.4 (and PRD-F9 if present).

`docs/deferred-features.md`: replace line 31 with:

```markdown
| F9 participation breakdowns for aggregate-only roles | Resolved | 2026-10-06 | Migration 0066 adds `p06_participation_breakdown` (monitoring.read, analytics.descriptive.read and beneficiaries.aggregates.read) with 1-4 and complementary suppression, so Program and Grant Manager see the participation view. | `apps/api/src/modules/analytics-insights`; migration 0066. See [cr-pathways-beneficiary-reach-kpi-values](cr-pathways-beneficiary-reach-kpi-values.md). | Not applicable. |
```

line 62 with:

```markdown
| Derived indicator recipes other than Activity completion % | Partly resolved | 2026-10-06 | KPI surfaces (overview KPI card, monitoring dashboard indicators, descriptive summaries, monitoring report) now show derived values with suppression through `p06_indicator_values` (0066). The Indicators tab still reads `p06_indicator_value`, which keeps the SENSITIVE_RELEASE_NOT_ENABLED_V1 placeholder, and the Add project indicator form still offers only Activity completion %. | `apps/web/src/features/projects/project-indicators-workspace.tsx`; migration 0000 `p06_indicator_value`; migration 0066. | Release the remaining recipes in `p06_indicator_value` in a reviewed migration, then add them to `enabledRecipes`. |
```

and add before the blank line above `## Maintenance`:

```markdown
| Activity beneficiaries reached suppression is display-only | Accepted limit | 2026-10-06 | Activity list and detail withhold sums of 1-4, but the per-session `beneficiaries_reached_this_session` values on activity updates stay readable to `activities.read` holders, so a reader can still add them up. | `apps/api/src/modules/activities/activities.service.ts` `readReached`; `pathways.activity_updates`. See [cr-pathways-beneficiary-reach-kpi-values](cr-pathways-beneficiary-reach-kpi-values.md). | Move the sum into a definer release and narrow the update column grant in a reviewed migration. |
```

`docs/index.md` Change Log (`:142` table): add

```markdown
| [cr-pathways-beneficiary-reach-kpi-values](cr-pathways-beneficiary-reach-kpi-values.md) | 2026-10-06 | Releases reach counts, participation breakdowns and KPI values to Program and Grant Manager with 1-4 and complementary suppression, no grant change (migration 0066) | Approved |
```

`docs/activity-log.md`: append

```markdown
## 2026-10-06 Beneficiary reach and KPI values migration 0066
- `0066_beneficiary_reach_kpi_values` releases the four reach counts with 1-4 and nested complementary suppression, and adds `p06_participation_breakdown` and `p06_indicator_values` (prisma-owned definers, runtime EXECUTE only, no grant change, 314 role_permissions).
- KPI values reuse `p06_compute_indicator_value` (same computation as the report) because `p34_compute_indicator_value` needs the `report_projection_owner` chain; the runtime suite sets prisma NOBYPASSRLS to prove hosted forced-RLS reads.
- API and web: KPI surfaces read released values for every role, a new indicator-values route feeds Analytics periods, participation opens to the release gates, suppressed counts read "Suppressed (fewer than 5)", activity reach of 1-4 is withheld for display only.
```

- [ ] **Step 3: Check and commit**

Run: `pnpm docs:check`
Expected: exit 0.

```bash
git add docs/cr-pathways-beneficiary-reach-kpi-values.md docs/rfc-pathways-saddd-privacy.md docs/qad-pathways.md docs/deferred-features.md docs/activity-log.md docs/index.md
git commit -m "docs: record the beneficiary reach and KPI values release (0066)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verification

**Files:** none (verification only; fix in the owning task if anything fails).

- [ ] **Step 1: Full local replay 0000-0066**

Run (PowerShell, worktree root): `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline -SaveTemplate`
Expected: exit 0; output includes `BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS`, `FORWARD_0066_BENEFICIARY_REACH_INVENTORY=PASS`, every existing `*_RUNTIME=PASS` line (including `ACTIVITY_EXTENSION_REQUESTS_RUNTIME`, `FORWARD_0063_RULES_SCOPE_MEMO_RUNTIME`) and the local vitest suites (c8, dashboard home, reports).

- [ ] **Step 2: Existing runtime suites through the template runner**

Run (PowerShell): `foreach ($f in 'dashboard-home-project-scope-runtime','f9-descriptive-aggregates-runtime','rbac-v4-grants-runtime','beneficiary-reach-kpi-values-runtime') { ./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File "apps/api/prisma/tests/$f.sql" }`
Expected: each exits 0 (`dashboard-home-project-scope-runtime.sql` keeps its Project Officer placeholder assertion at `:226-231`).

- [ ] **Step 3: Repository gates**

Run (bash): `pnpm typecheck && pnpm lint && pnpm test && pnpm sad:check && pnpm docs:check && node --test scripts/db/hosted-plan.test.mjs && pnpm --filter @pathways/api exec vitest run prisma/legacy-retirement.test.ts`
Expected: all exit 0.
Run (PowerShell): `./infra/supabase/phase6/Test-SchemaDrift.ps1`
Expected: `SCHEMA_DRIFT=CLEAN`.

- [ ] **Step 4: Grant count**

Run (PowerShell): `./infra/supabase/phase6/Invoke-RuntimeSql.ps1 -File` on a one-line file in the scratchpad containing `SELECT count(*) FROM pathways.role_permissions;`
Expected: `314`.

---

## Controller-only checklist (not an implementer task)

- [ ] SAD migration review of 0066 through `sad-orchestrator` (migration-integrity-guardian, beneficiary-privacy-guardian, organization-isolation-checker, restraint-guardian); record the evidence in the CR.
- [ ] Confirm devV2 ledger ends at `0064_evaluation_write_path` (finished, none failed) and `SELECT count(*) FROM pathways.role_permissions` is 314.
- [ ] Clear `.tmp/hosted-build/migrations`, then apply under the staging auto-migrate rule: `node scripts/db/hosted-build.mjs --env-file .tmp/role-staging-build.env --resume` (`docs/runbook-role-staging-build.md:137`).
- [ ] Read-only devV2 checks: ledger finished through 0066; `p06_participation_breakdown` and `p06_indicator_values` owned by `prisma`, `prosecdef`, EXECUTE only for `pathways_runtime`; helpers owner-only; `prisma` `rolbypassrls` is false; role_permissions 314.
- [ ] In-app smoke on devV2 as Program Manager and Grant Manager (role dashboard reach cards, overview KPI card, Analytics participation and reach, no Indicators tab) and as Project Officer (unchanged, no "0" for withheld counts).
- [ ] Set the CR to Applied with the devV2 facts, update `docs/activity-log.md`, merge to local `dev`, push `origin dev` only when the user says (dev push rule).
