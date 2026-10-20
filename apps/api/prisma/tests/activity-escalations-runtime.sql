-- cr-pathways-activity-escalation (migration 0070): behavioral checks for pathways.activity_escalations.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that already has 0070 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0070 activity-escalations checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE aes_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON aes_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO aes_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected OR position(needle in SQLERRM)=0 THEN
   RAISE EXCEPTION 'Assertion % expected % mentioning %, got %: %',label,expected,needle,SQLSTATE,SQLERRM; END IF;
  INSERT INTO aes_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(1)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
-- Raise helper: every call uses a fresh client mutation id (900 + activity number).
CREATE FUNCTION pg_temp.raise_sql(by integer,act integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
   VALUES(%L,%L,%L,'Blocked by a supplier delay.',%L,%L)$i$,
   pg_temp.u(1),pg_temp.u(301),pg_temp.u(500+act),pg_temp.u(100+by),pg_temp.u(900+act))
$$;
CREATE FUNCTION pg_temp.run(command text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE command; END $$;
CREATE FUNCTION pg_temp.forward_sql(by integer,act integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($i$UPDATE pathways.activity_escalations SET status='FORWARDED',forwarded_by_id=%L,forwarded_at=now(),
   forward_note='Needs a program level decision.',updated_at=now() WHERE activity_id=%L AND status='OPEN'$i$,
   pg_temp.u(100+by),pg_temp.u(500+act))
$$;
CREATE FUNCTION pg_temp.project_resolve_sql(by integer,act integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROJECT',resolved_by_id=%L,
   resolved_at=now(),resolution_note='Handled at project level.',updated_at=now() WHERE activity_id=%L AND status='OPEN'$i$,
   pg_temp.u(100+by),pg_temp.u(500+act))
$$;
CREATE FUNCTION pg_temp.program_resolve_sql(by integer,act integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROGRAM',resolved_by_id=%L,
   resolved_at=now(),resolution_note='Decided at program level.',updated_at=now() WHERE activity_id=%L AND status='FORWARDED'$i$,
   pg_temp.u(100+by),pg_temp.u(500+act))
$$;

-- One org, a program managed by user 6 holding project 301, and project 302 in the same org.
-- Users: 1 Project Officer (assigned), 2 M&E officer (assigned), 3 and 4 Project Managers (assigned), 5 System Administrator,
-- 6 Program Manager (manages the program), 7 Program Manager (directly assigned), 8 Grant Manager (assigned),
-- 9 Project Officer with no assignment, 10 Program Manager of no program, 11 Project Manager of project 302 only.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,11) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'AES_ORG_A','Synthetic AES org A');
INSERT INTO pathways.roles(code,name) VALUES
  ('SYSTEM_ADMINISTRATOR','System Administrator'),('PROJECT_OFFICER','Project Officer'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),('PROJECT_MANAGER','Project Manager'),
  ('PROGRAM_MANAGER','Program Manager'),('GRANT_MANAGER','Grant Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),'AES user '||v.n,'aes-'||v.n||'@example.invalid','ACTIVE',now()
FROM (VALUES (1,'PROJECT_OFFICER'),(2,'MONITORING_AND_EVALUATION_OFFICER'),(3,'PROJECT_MANAGER'),(4,'PROJECT_MANAGER'),
  (5,'SYSTEM_ADMINISTRATOR'),(6,'PROGRAM_MANAGER'),(7,'PROGRAM_MANAGER'),(8,'GRANT_MANAGER'),(9,'PROJECT_OFFICER'),
  (10,'PROGRAM_MANAGER'),(11,'PROJECT_MANAGER')) v(n,role_code)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('activities.escalations.read','activities.escalations.read'),('activities.escalations.raise','activities.escalations.raise'),
  ('activities.update','activities.update')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON
  p.code IN ('activities.escalations.read','activities.escalations.raise')
  OR (p.code='activities.update' AND r.code IN ('PROJECT_MANAGER','SYSTEM_ADMINISTRATOR'))
ON CONFLICT DO NOTHING;
INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id)
  VALUES(pg_temp.u(90),pg_temp.u(1),'AES_PROGRAM','Synthetic AES program',pg_temp.u(106));
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id,program_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'AES-A1','AES Project A1','2026-01-01','2026-12-31',pg_temp.u(103),pg_temp.u(90)),
  (pg_temp.u(302),pg_temp.u(1),'AES-A2','AES Project A2','2026-01-01','2026-12-31',pg_temp.u(103),NULL);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(103)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(102),pg_temp.u(103)),
  (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(103)),
  (pg_temp.u(404),pg_temp.u(1),pg_temp.u(301),pg_temp.u(104),pg_temp.u(103)),
  (pg_temp.u(407),pg_temp.u(1),pg_temp.u(301),pg_temp.u(107),pg_temp.u(103)),
  (pg_temp.u(408),pg_temp.u(1),pg_temp.u(301),pg_temp.u(108),pg_temp.u(103)),
  (pg_temp.u(411),pg_temp.u(1),pg_temp.u(302),pg_temp.u(111),pg_temp.u(103));
INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id
) SELECT pg_temp.u(500+n),pg_temp.u(1),pg_temp.u(301),'AES-ACT-'||n,'Activity '||n,'2026-01-01','2026-02-01','2026-01-01',
  'IN_PROGRESS',pg_temp.u(103) FROM generate_series(1,12) n;
-- Seeded as owner: 601 FORWARDED by Program Manager 7 (a forwarder who is a Program Manager, for the forwarder check).
INSERT INTO pathways.activity_escalations(
  id,organization_id,project_id,activity_id,reason,status,raised_by_id,forwarded_by_id,forwarded_at,forward_note,client_mutation_id
) VALUES(pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),pg_temp.u(512),'Seeded escalation forwarded by a Program Manager.',
  'FORWARDED',pg_temp.u(101),pg_temp.u(107),now(),'Forwarded for a program decision.',pg_temp.u(951));
SET LOCAL session_replication_role = origin;

-- Assertion 1: any role holding the raise permission raises for itself; spoofing, unassigned and wrong-status inserts are denied.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1);
SELECT pg_temp.run(pg_temp.raise_sql(1,1));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations
  WHERE activity_id=pg_temp.u(501) AND status='OPEN' AND raised_by_id=pg_temp.u(101)),
  '1a a Project Officer inserts an OPEN escalation for themself');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'Spoofing another raiser id.',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(510),pg_temp.u(102),pg_temp.u(990)),
  '42501','row-level security','1b inserting with another user id is denied by RLS');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,status,raised_by_id,
  forwarded_by_id,forwarded_at,forward_note,client_mutation_id)
  VALUES(%L,%L,%L,'Inserting directly as forwarded.','FORWARDED',%L,%L,now(),'Skipping the project step.',%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(510),pg_temp.u(101),pg_temp.u(101),pg_temp.u(991)),
  '42501','row-level security','1c inserting a non-OPEN escalation is denied by RLS');
SELECT pg_temp.act_as(2); SELECT pg_temp.run(pg_temp.raise_sql(2,2));
SELECT pg_temp.act_as(3); SELECT pg_temp.run(pg_temp.raise_sql(3,3));
SELECT pg_temp.act_as(6); SELECT pg_temp.run(pg_temp.raise_sql(6,4));
SELECT pg_temp.act_as(8); SELECT pg_temp.run(pg_temp.raise_sql(8,5));
SELECT pg_temp.act_as(5); SELECT pg_temp.run(pg_temp.raise_sql(5,6));
SELECT pg_temp.ok((SELECT count(*)=5 FROM pathways.activity_escalations
  WHERE activity_id IN (pg_temp.u(502),pg_temp.u(503),pg_temp.u(504),pg_temp.u(505),pg_temp.u(506)) AND status='OPEN'),
  '1d the M&E officer, Project Manager, Program Manager, Grant Manager and System Administrator can each raise');
SELECT pg_temp.act_as(9);
SELECT pg_temp.reject(pg_temp.raise_sql(9,10),'42501','row-level security','1e a Project Officer outside the project cannot raise');
SELECT pg_temp.act_as(11);
SELECT pg_temp.reject(pg_temp.raise_sql(11,10),'42501','row-level security','1f a Project Manager of another project cannot raise');

-- Assertion 2: one open escalation per activity, and one client mutation id per organization.
SELECT pg_temp.act_as(1);
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'A second open escalation for one activity.',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(992)),
  '23505','activity_escalations_open_key','2a a second OPEN row for the same activity is rejected');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'Reusing a client mutation id.',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(510),pg_temp.u(101),pg_temp.u(901)),
  '23505','activity_escalations_client_key','2b a reused client mutation id is rejected');

-- Assertion 3: the reason CHECK counts trimmed characters.
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'   123456789   ',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(510),pg_temp.u(101),pg_temp.u(993)),
  '23514','activity_escalations_reason_check','3 a 9 character trimmed reason fails the reason CHECK');

-- Assertion 4: reads follow project scope.
SELECT pg_temp.act_as(9);
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.activity_escalations),'4a a Project Officer outside the project sees 0 rows');
SELECT pg_temp.act_as(11);
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.activity_escalations),'4b a Project Manager of another project sees 0 rows');
SELECT pg_temp.act_as(10);
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.activity_escalations),'4c a Program Manager of another program sees 0 rows');
SELECT pg_temp.act_as(6);
SELECT pg_temp.ok((SELECT count(*)>=6 FROM pathways.activity_escalations),'4d the managing Program Manager sees the project rows');
SELECT pg_temp.act_as(7);
SELECT pg_temp.ok((SELECT count(*)>=6 FROM pathways.activity_escalations),'4e a directly assigned Program Manager sees the project rows');
SELECT pg_temp.act_as(8);
SELECT pg_temp.ok((SELECT count(*)>=6 FROM pathways.activity_escalations),'4f an assigned Grant Manager sees the project rows');

-- Assertion 5: only a Project Manager holding activities.update in scope forwards or resolves at project level.
SELECT pg_temp.act_as(1);
SELECT pg_temp.reject(pg_temp.forward_sql(1,1),'42501','row-level security','5a a Project Officer cannot forward');
SELECT pg_temp.act_as(2);
SELECT pg_temp.reject(pg_temp.forward_sql(2,1),'42501','row-level security','5b an M&E officer cannot forward');
SELECT pg_temp.act_as(8);
SELECT pg_temp.reject(pg_temp.forward_sql(8,1),'42501','row-level security','5c a Grant Manager cannot forward');
SELECT pg_temp.act_as(5);
SELECT pg_temp.reject(pg_temp.forward_sql(5,1),'42501','row-level security','5d a System Administrator cannot forward at project level');
SELECT pg_temp.reject(pg_temp.project_resolve_sql(5,1),'42501','row-level security','5e a System Administrator cannot resolve at project level');
SELECT pg_temp.act_as(6);
SELECT pg_temp.reject(pg_temp.forward_sql(6,1),'42501','row-level security','5f a Program Manager cannot forward');
SELECT pg_temp.act_as(4);
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='FORWARDED',forwarded_by_id=%L,forwarded_at=now(),
  forward_note='Forwarding as another user.' WHERE activity_id=%L AND status='OPEN'$i$,pg_temp.u(103),pg_temp.u(501)),
  '42501','row-level security','5g forwarding as another user id is denied');
SELECT pg_temp.act_as(11);
WITH moved AS (UPDATE pathways.activity_escalations SET status='FORWARDED',forwarded_by_id=pg_temp.u(111),forwarded_at=now(),
  forward_note='Out of scope forward attempt.' WHERE activity_id=pg_temp.u(501) RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM moved),'5h a Project Manager of another project cannot reach the row');
RESET ROLE;
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_MANAGER' AND p.code='activities.update';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(4);
SELECT pg_temp.reject(pg_temp.forward_sql(4,1),'42501','row-level security','5i a Project Manager profile without activities.update cannot forward');
SELECT pg_temp.reject(pg_temp.project_resolve_sql(4,1),'42501','row-level security','5j a Project Manager profile without activities.update cannot resolve at project level');
RESET ROLE;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r, pathways.permissions p WHERE r.code='PROJECT_MANAGER' AND p.code='activities.update';
SET LOCAL ROLE pathways_runtime;

-- Assertion 6: project-level resolve and its separation of duties.
SELECT pg_temp.act_as(4);
SELECT pg_temp.run(pg_temp.project_resolve_sql(4,2));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(502) AND status='RESOLVED'
  AND resolution_level='PROJECT' AND resolved_by_id=pg_temp.u(104) AND forwarded_by_id IS NULL),
  '6a a Project Manager resolves an OPEN escalation at project level');
SELECT pg_temp.act_as(3);
SELECT pg_temp.reject(pg_temp.project_resolve_sql(3,3),'23514','activity_escalations_resolver_check',
  '6b the raiser cannot resolve at project level');
SELECT pg_temp.act_as(4);
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROJECT',resolved_by_id=%L,
  resolved_at=now(),resolution_note='123456789' WHERE activity_id=%L AND status='OPEN'$i$,pg_temp.u(104),pg_temp.u(504)),
  '23514','activity_escalations_resolution_note_check','6c a 9 character resolution note fails its CHECK');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='FORWARDED',forwarded_by_id=%L,forwarded_at=now(),
  forward_note='123456789' WHERE activity_id=%L AND status='OPEN'$i$,pg_temp.u(104),pg_temp.u(504)),
  '23514','activity_escalations_forward_note_check','6d a 9 character forward note fails its CHECK');

-- Assertion 7: forwarding, including by the raiser, and state order.
SELECT pg_temp.run(pg_temp.forward_sql(4,1));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(501) AND status='FORWARDED'
  AND forwarded_by_id=pg_temp.u(104)),'7a a Project Manager forwards an OPEN escalation');
SELECT pg_temp.act_as(3);
SELECT pg_temp.run(pg_temp.forward_sql(3,3));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(503) AND status='FORWARDED'
  AND forwarded_by_id=raised_by_id),'7b the raising Project Manager may forward');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='FORWARDED',forwarded_by_id=%L,forwarded_at=now(),
  forward_note='Forwarding twice.' WHERE activity_id=%L$i$,pg_temp.u(103),pg_temp.u(501)),
  '23514','cannot move from FORWARDED to FORWARDED','7c a FORWARDED escalation cannot be forwarded again');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROJECT',resolved_by_id=%L,
  resolved_at=now(),resolution_note='Resolving a forwarded one.' WHERE activity_id=%L$i$,pg_temp.u(103),pg_temp.u(501)),
  '23514','cannot move from FORWARDED to RESOLVED','7d a FORWARDED escalation cannot be resolved at project level');

-- Assertion 8: program-level resolve, role and separation of duties.
SELECT pg_temp.act_as(4);
SELECT pg_temp.reject(pg_temp.program_resolve_sql(4,1),'42501','row-level security','8a a Project Manager cannot resolve at program level');
SELECT pg_temp.act_as(3);
SELECT pg_temp.reject(pg_temp.program_resolve_sql(3,1),'42501','row-level security','8b a Project Manager cannot resolve at program level even with activities.update');
SELECT pg_temp.act_as(5);
SELECT pg_temp.reject(pg_temp.program_resolve_sql(5,1),'42501','row-level security','8c a System Administrator cannot resolve at program level');
SELECT pg_temp.act_as(8);
SELECT pg_temp.reject(pg_temp.program_resolve_sql(8,1),'42501','row-level security','8d a Grant Manager cannot resolve at program level');
SELECT pg_temp.act_as(10);
WITH moved AS (UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROGRAM',resolved_by_id=pg_temp.u(110),
  resolved_at=now(),resolution_note='Out of scope resolve attempt.' WHERE activity_id=pg_temp.u(501) RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM moved),'8e a Program Manager outside the program cannot reach the row');
SELECT pg_temp.act_as(6);
SELECT pg_temp.run(pg_temp.program_resolve_sql(6,1));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(501) AND status='RESOLVED'
  AND resolution_level='PROGRAM' AND resolved_by_id=pg_temp.u(106) AND forwarded_by_id=pg_temp.u(104)),
  '8f the managing Program Manager resolves a FORWARDED escalation at program level');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROGRAM',resolved_by_id=%L,
  resolved_at=now(),resolution_note='Skipping the forward step.' WHERE activity_id=%L$i$,pg_temp.u(106),pg_temp.u(505)),
  '23514','cannot move from OPEN to RESOLVED','8g an OPEN escalation cannot be resolved at program level');
-- 504 was raised by Program Manager 6: forwarded by PM 4, the raiser cannot resolve, a second Program Manager can.
SELECT pg_temp.act_as(4);
SELECT pg_temp.run(pg_temp.forward_sql(4,4));
SELECT pg_temp.act_as(6);
SELECT pg_temp.reject(pg_temp.program_resolve_sql(6,4),'23514','activity_escalations_resolver_check',
  '8h the raiser cannot resolve at program level');
SELECT pg_temp.act_as(7);
SELECT pg_temp.run(pg_temp.program_resolve_sql(7,4));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(504) AND status='RESOLVED'
  AND resolution_level='PROGRAM' AND resolved_by_id=pg_temp.u(107)),
  '8i a second directly assigned Program Manager resolves at program level');
-- 601 was forwarded by Program Manager 7, so the forwarder cannot resolve it.
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROGRAM',resolved_by_id=%L,
  resolved_at=now(),resolution_note='Resolving my own forward.' WHERE id=%L$i$,pg_temp.u(107),pg_temp.u(601)),
  '23514','activity_escalations_resolver_check','8j the forwarder cannot resolve at program level');

-- Assertion 9: a RESOLVED row is final, content is immutable and nothing is deleted.
SELECT pg_temp.act_as(6);
WITH moved AS (UPDATE pathways.activity_escalations SET updated_at=now() WHERE activity_id=pg_temp.u(501) AND status='RESOLVED' RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM moved),'9a a RESOLVED row cannot be updated through RLS');
SELECT pg_temp.act_as(4);
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET reason='Rewriting the original reason.' WHERE id=%L$i$,pg_temp.u(601)),
  '42501','permission denied','9b the reason column cannot be updated');
SELECT pg_temp.reject(format($i$DELETE FROM pathways.activity_escalations WHERE id=%L$i$,pg_temp.u(601)),
  '42501','permission denied','9c an escalation cannot be deleted');
RESET ROLE;
SELECT pg_temp.ok(NOT has_table_privilege('pathways_runtime','pathways.activity_escalations','DELETE')
  AND has_column_privilege('pathways_runtime','pathways.activity_escalations','status','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_escalations','reason','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_escalations','raised_by_id','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_escalations','activity_id','UPDATE')
  AND NOT has_table_privilege('anon','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE'),
  '9d grants allow decision columns only, no DELETE, and nothing to anon, authenticated or service_role');

-- Assertion 10: the transition trigger and the table CHECKs hold for the owner too.
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='OPEN',resolved_by_id=NULL,resolved_at=NULL,
  resolution_note=NULL,resolution_level=NULL,forwarded_by_id=NULL,forwarded_at=NULL,forward_note=NULL WHERE activity_id=%L AND status='RESOLVED'$i$,pg_temp.u(501)),
  '23514','cannot move from RESOLVED to OPEN','10a a RESOLVED escalation cannot reopen');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='OPEN',forwarded_by_id=NULL,forwarded_at=NULL,
  forward_note=NULL WHERE activity_id=%L$i$,pg_temp.u(503)),
  '23514','cannot move from FORWARDED to OPEN','10b a FORWARDED escalation cannot return to OPEN');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_escalations SET status='RESOLVED',resolution_level='PROGRAM',resolved_by_id=%L,
  resolved_at=now(),resolution_note='Changing the forward note.',forward_note='A rewritten forward note.' WHERE activity_id=%L$i$,
  pg_temp.u(106),pg_temp.u(503)),
  '23514','cannot move from FORWARDED to RESOLVED','10c program resolve cannot change the forward fields');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,status,raised_by_id,
  forwarded_by_id,forwarded_at,forward_note,resolved_by_id,resolved_at,resolution_note,resolution_level,client_mutation_id)
  VALUES(%L,%L,%L,'A project level row with forward fields.','RESOLVED',%L,%L,now(),'Forward fields present.',%L,now(),
   'Resolved at project level.','PROJECT',%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(511),pg_temp.u(101),pg_temp.u(103),pg_temp.u(104),pg_temp.u(994)),
  '23514','activity_escalations_state_check','10d a PROJECT level row with forward fields fails the state CHECK');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,status,raised_by_id,
  resolution_level,client_mutation_id) VALUES(%L,%L,%L,'An OPEN row with a level set.','OPEN',%L,'PROJECT',%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(511),pg_temp.u(101),pg_temp.u(995)),
  '23514','activity_escalations_state_check','10e an OPEN row with a resolution level fails the state CHECK');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,status,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'A row with an unknown status.','CLOSED',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(511),pg_temp.u(101),pg_temp.u(996)),
  '23514','violates check constraint','10f an unknown status is rejected by a CHECK');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,status,raised_by_id,
  forwarded_by_id,forwarded_at,forward_note,resolved_by_id,resolved_at,resolution_note,resolution_level,client_mutation_id)
  VALUES(%L,%L,%L,'A row with an unknown level.','RESOLVED',%L,NULL,NULL,NULL,%L,now(),'Resolved with a bad level.','OTHER',%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(511),pg_temp.u(101),pg_temp.u(104),pg_temp.u(997)),
  '23514','activity_escalations_level_check','10g an unknown resolution level fails the level CHECK');

-- Assertion 11: a RESOLVED escalation allows a new one on the same activity.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1);
SELECT pg_temp.run(format($i$INSERT INTO pathways.activity_escalations(organization_id,project_id,activity_id,reason,raised_by_id,client_mutation_id)
  VALUES(%L,%L,%L,'Blocked again after the earlier decision.',%L,%L)$i$,pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(998)));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_escalations WHERE activity_id=pg_temp.u(501) AND status='OPEN'),
  '11 a new OPEN escalation is allowed once the earlier one is RESOLVED');
RESET ROLE;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM aes_results;
 IF total<>55 THEN RAISE EXCEPTION '0070 activity-escalations checks expected 55 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_ESCALATIONS_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
