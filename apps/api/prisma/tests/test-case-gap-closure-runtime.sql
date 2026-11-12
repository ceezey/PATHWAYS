-- cr-pathways-test-case-gap-closure (0090): disposable checks for the public view counter, the password reset audit and the
-- dashboard view throttle. Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or phase4/phase6 replay database that already has 0090 applied.
-- Success prints TEST_CASE_GAP_CLOSURE_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Test case gap closure checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('tcg.passed',(coalesce(nullif(current_setting('tcg.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Two documents must be equal; the failure shows both.
CREATE FUNCTION pg_temp.same(label text, got jsonb, wanted jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF got IS NULL OR got IS DISTINCT FROM wanted THEN RAISE EXCEPTION 'Assertion % gave % not %',label,got,wanted; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must fail with the expected SQLSTATE and a message that mentions the needle.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n; 0 clears every app and jwt setting.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(org_n)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
-- Moves a publication by one UPDATE as the given user.
CREATE FUNCTION pg_temp.move(user_n integer, project_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',
  assignments,pg_temp.u(1),pg_temp.u(project_n));
END $$;
-- 21 submits revision 1, then 22 approves and publishes it.
CREATE FUNCTION pg_temp.publish_first(project_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
 VALUES(pg_temp.u(1),pg_temp.u(project_n),1,'FOR_REVIEW','SUBMIT','Gap summary','{"media":[],"views":["map"]}',pg_temp.u(21));
 PERFORM pg_temp.move(22,project_n,$s$state='APPROVED'$s$);
 PERFORM pg_temp.move(22,project_n,$s$state='PUBLISHED'$s$);
END $$;

-- Fixtures: organization A with Project Managers 21 and 22 and Project Officer 23 (no audit.read), all assigned to projects 41 to 43;
-- organization B with Project Manager 31. Project 41 is live, 42 is never published, 43 is published and then archived.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13)),(pg_temp.u(21));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'TCG_A','Synthetic gap closure organization A'),
 (pg_temp.u(2),'TCG_B','Synthetic gap closure organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,v.org,r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(1),'PROJECT_MANAGER',pg_temp.u(11),'Synthetic TCG editor','tcg-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(1),'PROJECT_MANAGER',pg_temp.u(12),'Synthetic TCG publisher','tcg-b@example.invalid'),
 (pg_temp.u(23),pg_temp.u(1),'PROJECT_OFFICER',pg_temp.u(13),'Synthetic TCG reader','tcg-c@example.invalid'),
 (pg_temp.u(31),pg_temp.u(2),'PROJECT_MANAGER',pg_temp.u(21),'Synthetic TCG outsider','tcg-d@example.invalid')) v(id,org,role_code,auth_id,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,implementation_area,created_by_id)
SELECT pg_temp.u(n),pg_temp.u(1),'TCG_'||n,'Synthetic TCG project '||n,'Borongan City, Guiuan',pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(900+p*3+s),pg_temp.u(1),pg_temp.u(p),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) p, unnest(ARRAY[1,2,3]) s;
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.publish_first(41);
SELECT pg_temp.publish_first(43);
RESET SESSION AUTHORIZATION;
SET LOCAL session_replication_role = replica;
UPDATE pathways.projects SET archived_at=now() WHERE id=pg_temp.u(43);
SET LOCAL session_replication_role = origin;

-- public_counter: as pathways_runtime with no app context, as the public API does; only a live, unarchived project counts.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(0);
SELECT pathways.p90_count_public_view(pg_temp.u(41));
SELECT pathways.p90_count_public_view(pg_temp.u(41));
SELECT pathways.p90_count_public_view(pg_temp.u(42));
SELECT pathways.p90_count_public_view(pg_temp.u(43));
SELECT pathways.p90_count_public_view(pg_temp.u(999));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('one row per published project per day', (SELECT jsonb_agg(jsonb_build_object('p',project_id,'d',view_date,'n',view_count))
  FROM pathways.public_project_views),
 jsonb_build_array(jsonb_build_object('p',pg_temp.u(41),'d',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,'n',2)));
SELECT pg_temp.same('no identifying column', (SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns
  WHERE table_schema='pathways' AND table_name='public_project_views'), '["organization_id","project_id","view_date","view_count"]');
SELECT pg_temp.refused('runtime cannot read the counter',
 'SET LOCAL SESSION AUTHORIZATION pathways_runtime; SELECT * FROM pathways.public_project_views', '42501', 'permission denied');
SELECT pg_temp.refused('counter needs the runtime login', format('SELECT pathways.p90_count_public_view(%L)',pg_temp.u(41)),
 '42501', 'Public projection unavailable');

-- password_reset: the recovery session's auth subject resolves the staff account; an unknown or archived one records nothing.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(0);
SELECT pathways.p90_record_password_reset(pg_temp.u(11));
SELECT pathways.p90_record_password_reset(pg_temp.u(99));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('reset row', (SELECT jsonb_build_object('org',organization_id,'actor',actor_user_id,'type',entity_type,'id',entity_id,
   'changes',changes,'project',project_id) FROM pathways.audit_logs WHERE action='PASSWORD_RESET_COMPLETED'),
 jsonb_build_object('org',pg_temp.u(1),'actor',pg_temp.u(21),'type','Authentication','id',pg_temp.u(21)::text,'changes','{}'::jsonb,'project',NULL));
SELECT pg_temp.ok('one reset row', (SELECT count(*) FROM pathways.audit_logs WHERE action='PASSWORD_RESET_COMPLETED')=1);
SET LOCAL session_replication_role = replica;
UPDATE pathways.system_users SET account_status='ARCHIVED',archived_at=now() WHERE id=pg_temp.u(22);
SET LOCAL session_replication_role = origin;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pathways.p90_record_password_reset(pg_temp.u(12));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('archived account records nothing', (SELECT count(*) FROM pathways.audit_logs WHERE action='PASSWORD_RESET_COMPLETED')=1);
SELECT pg_temp.refused('reset needs the runtime login', format('SELECT pathways.p90_record_password_reset(%L)',pg_temp.u(11)),
 '42501', 'Account event unavailable');

-- dashboard_throttle: user 23 cannot read audit rows, so only the definer sees an earlier view; one view per 30 minutes is due.
SELECT pg_temp.ok('throttle viewer lacks audit.read', NOT EXISTS(SELECT FROM pathways.system_users u JOIN pathways.role_permissions rp ON rp.role_id=u.role_id
  JOIN pathways.permissions p ON p.id=rp.permission_id WHERE u.id=pg_temp.u(23) AND p.code='audit.read'));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('first view is due', pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'home'));
SELECT pg_temp.ok('no viewer is not due', NOT pathways.p90_dashboard_view_due(NULL,pg_temp.u(1),'home'));
SELECT pg_temp.ok('no organization is not due', NOT pathways.p90_dashboard_view_due(pg_temp.u(23),NULL,'home'));
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,occurred_at)
VALUES (pg_temp.u(1),pg_temp.u(23),'DASHBOARD_VIEWED','Dashboard','home',now()-interval '29 minutes');
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('view 29 minutes ago is not due', NOT pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'home'));
RESET SESSION AUTHORIZATION;
UPDATE pathways.audit_logs SET occurred_at=now()-interval '31 minutes' WHERE actor_user_id=pg_temp.u(23) AND action='DASHBOARD_VIEWED';
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,occurred_at)
VALUES (pg_temp.u(1),pg_temp.u(21),'DASHBOARD_VIEWED','Dashboard','home',now()-interval '1 minute'),
 (pg_temp.u(1),pg_temp.u(23),'DASHBOARD_VIEWED','Dashboard','other',now()-interval '1 minute');
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('view 31 minutes ago is due', pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'home'));
SELECT pg_temp.ok('another user view does not count', pathways.p90_dashboard_view_due(pg_temp.u(21),pg_temp.u(1),'home') = false
 AND pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'home'));
SELECT pg_temp.ok('another dashboard view does not count', NOT pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'other')
 AND pathways.p90_dashboard_view_due(pg_temp.u(23),pg_temp.u(1),'home'));
-- With the viewer's own app context the runtime sees none of these rows, yet the definer still gives the same answers.
SELECT pg_temp.act_as(23);
SELECT pg_temp.ok('viewer cannot read its earlier views', NOT EXISTS(SELECT FROM pathways.audit_logs WHERE action='DASHBOARD_VIEWED'));
SELECT pg_temp.ok('context view is due', pathways.p90_dashboard_view_due(pathways.runtime_context_user(),pathways.runtime_context_organization(),'home'));
SELECT pg_temp.ok('context recent view is not due',
 NOT pathways.p90_dashboard_view_due(pathways.runtime_context_user(),pathways.runtime_context_organization(),'other'));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.refused('dashboard key format', 'SET LOCAL SESSION AUTHORIZATION pathways_runtime; SELECT pathways.p90_dashboard_view_due(''a9000000-0000-4000-8000-000000000023'',''a9000000-0000-4000-8000-000000000001'',''Home Page'')', '22023', 'Invalid dashboard');
SELECT pg_temp.refused('dashboard key required', 'SET LOCAL SESSION AUTHORIZATION pathways_runtime; SELECT pathways.p90_dashboard_view_due(''a9000000-0000-4000-8000-000000000023'',''a9000000-0000-4000-8000-000000000001'',NULL)', '22023', 'Invalid dashboard');
SELECT pg_temp.refused('throttle needs the runtime login', format('SELECT pathways.p90_dashboard_view_due(%L,%L,%L)',pg_temp.u(23),pg_temp.u(1),'home'),
 '42501', 'Dashboard view unavailable');

-- Catalog: the three functions are prisma-owned definers with an empty search_path, executable by pathways_runtime only.
SELECT pg_temp.ok('catalog functions', (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN
  ('pathways.p90_count_public_view(uuid)'::regprocedure,'pathways.p90_record_password_reset(uuid)'::regprocedure,
   'pathways.p90_dashboard_view_due(uuid,uuid,text)'::regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=3);

SELECT 'TEST_CASE_GAP_CLOSURE_RUNTIME=PASS ('||current_setting('tcg.passed')||')' AS result \gset
ROLLBACK;
\echo :result
