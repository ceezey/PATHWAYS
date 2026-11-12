-- cr-pathways-backup-recovery (0091): disposable checks for the backup owner and job roles, the widened provisioning
-- assertions and the recovery point functions. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0091 applied.
-- Success prints BACKUP_RECOVERY_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Backup recovery checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('p91.passed',(coalesce(nullif(current_setting('p91.passed',true),''),'0')::integer+1)::text,true);
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
-- Rows a statement changed, so a policy that hides rows shows as zero.
CREATE FUNCTION pg_temp.changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n; 0 clears every app and jwt setting.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(org_n)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;

-- provisioning: the backup owner holds exactly its three permanent memberships, the widened assertions accept them and
-- nothing else, and the job login holds no membership.
SELECT pg_temp.ok('backup owner profile', (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='pathways_backup_owner'));
SELECT pg_temp.same('backup owner memberships', (SELECT jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_auth_members m
 JOIN pg_roles r ON r.oid=m.roleid WHERE m.member='pathways_backup_owner'::regrole AND m.inherit_option AND NOT m.set_option
 AND NOT m.admin_option AND m.grantor='postgres'::regrole), '["prisma","report_projection_owner","rules_store_owner"]');
SELECT pg_temp.ok('nobody is a member of the backup owner', NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid='pathways_backup_owner'::regrole));
SELECT pg_temp.ok('prisma keeps no chain', NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 WHERE m.member='prisma'::regrole AND r.rolname IN ('pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner')));
SELECT pathways_rules_internal.assert_runtime_provisioned(), pathways.p34_assert_projection_provisioned();
SELECT pg_temp.ok('assertions accept the backup owner', true);
CREATE ROLE p91_probe NOLOGIN NOINHERIT;
GRANT rules_store_owner, report_projection_owner TO p91_probe;
SELECT pg_temp.refused('rules assertion refuses another member', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
SELECT pg_temp.refused('projection assertion refuses another member', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
REVOKE rules_store_owner, report_projection_owner FROM p91_probe; DROP ROLE p91_probe;
GRANT rules_store_owner TO pathways_backup_owner WITH SET TRUE GRANTED BY postgres;
SELECT pg_temp.refused('a SET-enabled backup membership is refused', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
GRANT rules_store_owner TO pathways_backup_owner WITH SET FALSE GRANTED BY postgres;
-- Neither assertion lists prisma, so only the after-loop check sees a SET-enabled prisma membership.
GRANT prisma TO pathways_backup_owner WITH SET TRUE GRANTED BY postgres;
SELECT pg_temp.refused('a SET-enabled prisma membership is refused', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
GRANT prisma TO pathways_backup_owner WITH SET FALSE GRANTED BY postgres;
GRANT finance_operation_owner TO pathways_backup_owner GRANTED BY postgres;
SELECT pg_temp.refused('an extra backup membership is refused', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
REVOKE finance_operation_owner FROM pathways_backup_owner GRANTED BY postgres;
-- The replay cluster's bootstrap superuser is postgres, so the other grantor is a probe role holding ADMIN on prisma,
-- which neither assertion inspects as a member, leaving the grantor check as the only reason to refuse.
CREATE ROLE p91_grantor NOLOGIN NOINHERIT;
GRANT prisma TO p91_grantor WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY postgres;
REVOKE prisma FROM pathways_backup_owner GRANTED BY postgres;
GRANT prisma TO pathways_backup_owner WITH INHERIT TRUE, SET FALSE GRANTED BY p91_grantor;
SELECT pg_temp.ok('grantor probe is not postgres', (SELECT grantor FROM pg_auth_members WHERE member='pathways_backup_owner'::regrole
 AND roleid='prisma'::regrole)='p91_grantor'::regrole);
SELECT pg_temp.refused('a backup membership granted by another role is refused', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
REVOKE prisma FROM pathways_backup_owner GRANTED BY p91_grantor;
GRANT prisma TO pathways_backup_owner WITH INHERIT TRUE, SET FALSE GRANTED BY postgres;
REVOKE prisma FROM p91_grantor GRANTED BY postgres; DROP ROLE p91_grantor;
SELECT pathways_rules_internal.assert_runtime_provisioned();
SELECT pg_temp.ok('migration ledger readable by the backup owner', has_table_privilege('pathways_backup_owner','public._prisma_migrations','SELECT'));
SELECT pg_temp.ok('backup job login profile', (SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconnlimit=0 FROM pg_roles WHERE rolname='pathways_backup_job'));
-- hosted, postgres_oid and bootstrap_oid are computed as the 0031 and 0034 assertions compute them.
SELECT pg_temp.ok('backup job has no membership either way except the hosted bootstrap ADMIN row', NOT EXISTS(SELECT FROM pg_auth_members m,
 (SELECT p.oid AS postgres_oid, b.oid AS bootstrap_oid, NOT p.rolsuper AND p.rolcreaterole AND p.rolcanlogin AND b.oid IS NOT NULL AS hosted
  FROM pg_roles p LEFT JOIN pg_roles b ON b.rolname='supabase_admin' AND b.rolsuper WHERE p.rolname='postgres') h
 WHERE (m.member='pathways_backup_job'::regrole OR m.roleid='pathways_backup_job'::regrole)
 AND NOT (h.hosted AND m.roleid='pathways_backup_job'::regrole AND m.member=h.postgres_oid AND m.grantor=h.bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)));

-- recovery_points: the table is organization-scoped and readable with backups.create or backups.restore, pathways_runtime has
-- no job branch, and the job login holds no table privilege.
-- Clears the user, organization and jwt settings, as the daily job connects with none.
CREATE FUNCTION pg_temp.act_as_job() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('app.user_id','',true), set_config('app.organization_id','',true), set_config('request.jwt.claim.sub','',true);
END $$;
-- Calls the job helper with superuser rights, so the session login is the only thing that changes between calls.
CREATE FUNCTION pg_temp.job_actor(org_n integer) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
 SELECT pathways.p91_backup_job_actor(pg_temp.u(org_n))
$$;
-- The privileges a relation, its columns or a function grant to roles other than prisma, as role:privilege.
CREATE FUNCTION pg_temp.grants(acl aclitem[]) RETURNS jsonb LANGUAGE sql AS $$
 SELECT coalesce(jsonb_agg(e ORDER BY e),'[]') FROM (SELECT coalesce(g.rolname,'PUBLIC')||':'||x.privilege_type AS e
  FROM aclexplode(acl) x LEFT JOIN pg_roles g ON g.oid=x.grantee WHERE g.rolname IS DISTINCT FROM 'prisma') s
$$;
SELECT pg_temp.ok('recovery points table', (SELECT pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND relforcerowsecurity
 FROM pg_class WHERE oid='pathways.recovery_points'::regclass));
SELECT pg_temp.same('recovery points runtime policies', (SELECT jsonb_agg(polname ORDER BY polname) FROM pg_policy
 WHERE polrelid='pathways.recovery_points'::regclass AND polroles=ARRAY['pathways_runtime'::regrole::oid]),
 '["p91_recovery_points_delete","p91_recovery_points_insert","p91_recovery_points_select","p91_recovery_points_update"]');
SELECT pg_temp.same('recovery points job policies', (SELECT jsonb_agg(polname ORDER BY polname) FROM pg_policy
 WHERE polrelid='pathways.recovery_points'::regclass AND polroles=ARRAY['prisma'::regrole::oid]),
 '["p91_recovery_points_job_select","p91_recovery_points_job_write"]');
SELECT pg_temp.ok('recovery points has six policies', (SELECT count(*)=6 FROM pg_policy WHERE polrelid='pathways.recovery_points'::regclass));
SELECT pg_temp.same('recovery points table grants', (SELECT pg_temp.grants(relacl) FROM pg_class WHERE oid='pathways.recovery_points'::regclass),
 '["pathways_runtime:DELETE","pathways_runtime:INSERT","pathways_runtime:SELECT"]');
SELECT pg_temp.same('recovery points column grants', (SELECT jsonb_agg(attname||'='||pg_temp.grants(attacl) ORDER BY attname) FROM pg_attribute
 WHERE attrelid='pathways.recovery_points'::regclass AND attacl IS NOT NULL),
 '["captured_at=[\"pathways_runtime:UPDATE\"]","completed_at=[\"pathways_runtime:UPDATE\"]","failure_reason=[\"pathways_runtime:UPDATE\"]","manifest_sha256=[\"pathways_runtime:UPDATE\"]","migration_name=[\"pathways_runtime:UPDATE\"]","size_bytes=[\"pathways_runtime:UPDATE\"]","status=[\"pathways_runtime:UPDATE\"]"]');
SELECT pg_temp.ok('runtime cannot change the point type', NOT has_column_privilege('pathways_runtime','pathways.recovery_points','point_type','UPDATE'));
SELECT pg_temp.ok('job login has no recovery points privilege',
 NOT has_table_privilege('pathways_backup_job','pathways.recovery_points','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_any_column_privilege('pathways_backup_job','pathways.recovery_points','SELECT,INSERT,UPDATE,REFERENCES'));
SELECT pg_temp.ok('backup actor definition', (SELECT pg_get_userbyid(proowner)='prisma' AND prosecdef AND provolatile='s'
 AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='pathways.p91_backup_actor(text[])'::regprocedure));
SELECT pg_temp.same('backup actor execute', (SELECT pg_temp.grants(proacl) FROM pg_proc WHERE oid='pathways.p91_backup_actor(text[])'::regprocedure),
 '["pathways_runtime:EXECUTE"]');
SELECT pg_temp.ok('backup job actor definition', (SELECT pg_get_userbyid(proowner)='prisma' AND prosecdef AND provolatile='s'
 AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='pathways.p91_backup_job_actor(uuid)'::regprocedure));
SELECT pg_temp.same('backup job actor execute', (SELECT pg_temp.grants(proacl) FROM pg_proc WHERE oid='pathways.p91_backup_job_actor(uuid)'::regprocedure),
 '[]');
SELECT pg_temp.ok('backup job actor ACL is explicit', (SELECT proacl IS NOT NULL FROM pg_proc WHERE oid='pathways.p91_backup_job_actor(uuid)'::regprocedure));

-- Fixtures: organization A with System Administrator 21 and Project Manager 22; organization B with System Administrator 31.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13)),(pg_temp.u(21));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'P91_A','Synthetic backup organization A'),
 (pg_temp.u(2),'P91_B','Synthetic backup organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,v.org,r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(1),'SYSTEM_ADMINISTRATOR',pg_temp.u(11),'Synthetic backup administrator','p91-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(1),'PROJECT_MANAGER',pg_temp.u(12),'Synthetic backup manager','p91-b@example.invalid'),
 (pg_temp.u(31),pg_temp.u(2),'SYSTEM_ADMINISTRATOR',pg_temp.u(21),'Synthetic backup outsider','p91-c@example.invalid')) v(id,org,role_code,auth_id,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

-- Table checks, run as the superuser so row security cannot answer first.
SELECT pg_temp.refused('automatic point has no creator', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'AUTOMATIC','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(21)),'23514','recovery_points_creator_check');
SELECT pg_temp.refused('manual point needs a creator', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode)
 VALUES(%L,'MANUAL','manifest')$s$,pg_temp.u(1)),'23514','recovery_points_creator_check');
SELECT pg_temp.refused('unknown point type', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'OTHER','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(21)),'23514','recovery_points_type_check');
SELECT pg_temp.refused('unknown file mode', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'MANUAL','zip',%L)$s$,pg_temp.u(1),pg_temp.u(21)),'23514','recovery_points_file_mode_check');
SELECT pg_temp.refused('a creator from another organization', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'MANUAL','manifest',%L)$s$,pg_temp.u(2),pg_temp.u(21)),'23503','recovery_points_created_by_fk');

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
-- An administrator creates a manual point, completes it, and cannot store a ready point without its manifest checksum.
SELECT pg_temp.act_as(21);
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,created_by_id)
VALUES (pg_temp.u(101),pg_temp.u(1),'MANUAL','manifest',pg_temp.u(21));
SELECT pg_temp.ok('manual point inserts as CREATING', (SELECT status='CREATING' AND completed_at IS NULL FROM pathways.recovery_points WHERE id=pg_temp.u(101)));
SELECT pg_temp.ok('manual point becomes READY', pg_temp.changed(format($u$UPDATE pathways.recovery_points SET status='READY',captured_at=now(),
 completed_at=now(),migration_name='0091_backup_recovery',size_bytes=1024,manifest_sha256=repeat('a',64) WHERE id=%L$u$,pg_temp.u(101)))=1);
SELECT pg_temp.refused('READY needs the manifest checksum', format($u$UPDATE pathways.recovery_points SET manifest_sha256=NULL WHERE id=%L$u$,
 pg_temp.u(101)),'23514','recovery_points_state_check');
SELECT pg_temp.refused('the manifest checksum is lowercase hex', format($u$UPDATE pathways.recovery_points SET manifest_sha256=repeat('A',64) WHERE id=%L$u$,
 pg_temp.u(101)),'23514','recovery_points_manifest_sha256_check');
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,created_by_id)
VALUES (pg_temp.u(102),pg_temp.u(1),'PRE_RESTORE','manifest',pg_temp.u(21));
SELECT pg_temp.ok('pre-restore point inserts', (SELECT count(*)=2 FROM pathways.recovery_points));
SELECT pg_temp.refused('runtime cannot insert an automatic point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode)
 VALUES(%L,'AUTOMATIC','manifest')$s$,pg_temp.u(1)),'42501','row-level security');
SELECT pg_temp.refused('the creator is the actor', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'MANUAL','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(22)),'42501','row-level security');
SELECT pg_temp.refused('a point starts as CREATING', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id,status,completed_at,failure_reason)
 VALUES(%L,'MANUAL','manifest',%L,'FAILED',now(),'x')$s$,pg_temp.u(1),pg_temp.u(21)),'42501','row-level security');
-- A Project Manager and another organization's administrator see nothing and cannot create a point.
SELECT pg_temp.act_as(22);
SELECT pg_temp.ok('project manager sees no point', (SELECT count(*)=0 FROM pathways.recovery_points));
SELECT pg_temp.refused('project manager cannot create a point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'MANUAL','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(22)),'42501','row-level security');
SELECT pg_temp.act_as(31,2);
SELECT pg_temp.ok('another organization sees no point', (SELECT count(*)=0 FROM pathways.recovery_points));
SELECT pg_temp.ok('another organization cannot update a point', pg_temp.changed($u$UPDATE pathways.recovery_points SET failure_reason='x'$u$)=0);
-- With no user, pathways_runtime has no job branch even when the organization is set.
SELECT pg_temp.act_as_job();
SELECT set_config('app.organization_id',pg_temp.u(1)::text,true);
SELECT pg_temp.refused('no-user runtime cannot insert an automatic point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode)
 VALUES(%L,'AUTOMATIC','manifest')$s$,pg_temp.u(1)),'42501','row-level security');
SELECT pg_temp.ok('no-user runtime sees no point', (SELECT count(*)=0 FROM pathways.recovery_points));
SELECT pg_temp.ok('no-user runtime is not the job', NOT pg_temp.job_actor(1));
RESET SESSION AUTHORIZATION;

-- The job login is refused every direct statement; it touches points only through the job functions.
SELECT pg_temp.act_as_job();
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.refused('job cannot read points', 'SELECT count(*) FROM pathways.recovery_points', '42501', 'permission denied');
SELECT pg_temp.refused('job cannot insert a point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode)
 VALUES(%L,'AUTOMATIC','manifest')$s$,pg_temp.u(1)),'42501','permission denied');
SELECT pg_temp.refused('job cannot update a manual point', $$UPDATE pathways.recovery_points SET failure_reason='x' WHERE point_type='MANUAL'$$, '42501', 'permission denied');
SELECT pg_temp.refused('job cannot delete a point', 'DELETE FROM pathways.recovery_points', '42501', 'permission denied');
SELECT pg_temp.ok('job login is the job for an active organization', pg_temp.job_actor(1));
SELECT pg_temp.ok('job login is not the job for an unknown organization', NOT pg_temp.job_actor(9));
SELECT set_config('request.jwt.claim.sub',pg_temp.u(11)::text,true);
SELECT pg_temp.ok('job login with a jwt subject is not the job', NOT pg_temp.job_actor(1));
SELECT pg_temp.act_as_job();
SELECT set_config('app.user_id',pg_temp.u(21)::text,true);
SELECT pg_temp.ok('job login with a user is not the job', NOT pg_temp.job_actor(1));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as_job();
UPDATE pathways.organizations SET status='INACTIVE' WHERE id=pg_temp.u(2);
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.ok('job login is not the job for an inactive organization', NOT pg_temp.job_actor(2));
RESET SESSION AUTHORIZATION;
UPDATE pathways.organizations SET status='ACTIVE' WHERE id=pg_temp.u(2);

-- A restore-only holder may delete pre-restore points (their retention runs under backups.restore) but not manual ones.
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='SYSTEM_ADMINISTRATOR' AND p.code='backups.create';
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
SELECT pg_temp.ok('restore-only holder reads points', (SELECT count(*)=2 FROM pathways.recovery_points));
SELECT pg_temp.refused('restore-only holder cannot create a manual point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'MANUAL','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(21)),'42501','row-level security');
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,created_by_id)
VALUES (pg_temp.u(103),pg_temp.u(1),'PRE_RESTORE','manifest',pg_temp.u(21));
SELECT pg_temp.ok('restore-only holder cannot delete a manual point', pg_temp.changed(format($d$DELETE FROM pathways.recovery_points WHERE id=%L$d$,pg_temp.u(101)))=0);
SELECT pg_temp.ok('restore-only holder deletes a pre-restore point', pg_temp.changed(format($d$DELETE FROM pathways.recovery_points WHERE id=%L$d$,pg_temp.u(103)))=1);
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r, pathways.permissions p WHERE r.code='SYSTEM_ADMINISTRATOR' AND p.code='backups.create';
-- A create-only holder may create and delete manual points but not create a pre-restore point.
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='SYSTEM_ADMINISTRATOR' AND p.code='backups.restore';
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('create-only holder cannot create a pre-restore point', format($s$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode,created_by_id)
 VALUES(%L,'PRE_RESTORE','manifest',%L)$s$,pg_temp.u(1),pg_temp.u(21)),'42501','row-level security');
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,created_by_id)
VALUES (pg_temp.u(104),pg_temp.u(1),'MANUAL','manifest',pg_temp.u(21));
SELECT pg_temp.ok('create-only holder deletes a manual point', pg_temp.changed(format($d$DELETE FROM pathways.recovery_points WHERE id=%L$d$,pg_temp.u(104)))=1);
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r, pathways.permissions p WHERE r.code='SYSTEM_ADMINISTRATOR' AND p.code='backups.restore';

-- The administrator fails the open pre-restore point, so later sections start with no busy point in organization A.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
SELECT pg_temp.ok('a creating point becomes FAILED', pg_temp.changed($u$UPDATE pathways.recovery_points SET status='FAILED',completed_at=now(),
 failure_reason='Synthetic fixture closed' WHERE status='CREATING'$u$)=1);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('no point is left CREATING', NOT EXISTS(SELECT FROM pathways.recovery_points WHERE status='CREATING'));

SELECT 'BACKUP_RECOVERY_RUNTIME=PASS ('||current_setting('p91.passed')||')' AS result \gset
ROLLBACK;
\echo :result
