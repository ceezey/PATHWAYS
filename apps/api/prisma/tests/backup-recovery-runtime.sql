-- cr-pathways-backup-recovery (0091): disposable checks for the backup owner and job roles, the widened provisioning
-- assertions and the recovery point functions. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0091 applied.
-- Success prints BACKUP_RECOVERY_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Backup recovery checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to meet the forced job policies as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

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

-- job_helpers: the runtime reads the latest migration; only the job login runs the six job functions, only for an active
-- unarchived organization and only on AUTOMATIC rows, writing their audit rows inside the definers.
INSERT INTO pathways.organizations(id,code,name,status,archived_at)
VALUES (pg_temp.u(3),'P91_C','Synthetic backup organization C','ARCHIVED',now());
SELECT pg_temp.refused('an archived organization cannot be ACTIVE', format($u$UPDATE pathways.organizations SET status='ACTIVE' WHERE id=%L$u$,
 pg_temp.u(3)),'23514','organizations_archival_state_check');
-- Recovery point audit rows of organization A with no actor, matching action, entity and changes, for delta checks.
CREATE FUNCTION pg_temp.job_audits(wanted_action text, wanted_entity uuid, wanted_changes jsonb) RETURNS integer LANGUAGE sql AS $$
 SELECT count(*)::integer FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1) AND actor_user_id IS NULL
  AND entity_type='RECOVERY_POINT' AND action=wanted_action AND entity_id IS NOT DISTINCT FROM wanted_entity::text AND changes=wanted_changes
$$;
-- A valid finish outcome for the job.
CREATE FUNCTION pg_temp.outcome() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('capturedAt','2026-11-12T01:02:03.456Z','migration','0091_backup_recovery','sizeBytes',2048,
  'manifestSha256',repeat('b',64),'changes',jsonb_build_object('pointType','AUTOMATIC','fileMode','manifest'))
$$;
SELECT set_config('p91.migration',(SELECT max(migration_name) FROM public._prisma_migrations
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),true);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
SELECT pg_temp.ok('current migration is the latest applied one', pathways.p91_current_migration()=current_setting('p91.migration'));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('job helper definitions', (SELECT count(*)=7 AND bool_and(pg_get_userbyid(proowner)='prisma' AND prosecdef
 AND proconfig=ARRAY['search_path=""'] AND proacl IS NOT NULL) FROM pg_proc
 WHERE pronamespace='pathways'::regnamespace AND (proname LIKE 'p91\_job\_%' OR proname='p91_current_migration')));
SELECT pg_temp.same('job helper volatility and execute', (SELECT jsonb_object_agg(proname,jsonb_build_array(provolatile,pg_temp.grants(proacl)))
 FROM pg_proc WHERE pronamespace='pathways'::regnamespace AND (proname LIKE 'p91\_job\_%' OR proname='p91_current_migration')),
 '{"p91_current_migration":["s",["pathways_runtime:EXECUTE"]],"p91_job_organizations":["s",["pathways_backup_job:EXECUTE"]],
  "p91_job_begin_point":["v",["pathways_backup_job:EXECUTE"]],"p91_job_finish_point":["v",["pathways_backup_job:EXECUTE"]],
  "p91_job_fail_point":["v",["pathways_backup_job:EXECUTE"]],"p91_job_retention_points":["s",["pathways_backup_job:EXECUTE"]],
  "p91_job_delete_point":["v",["pathways_backup_job:EXECUTE"]]}');

-- The job lists every active unarchived organization, and every job function refuses an archived one.
SELECT pg_temp.act_as_job();
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT set_config('p91.job_orgs',(SELECT coalesce(jsonb_agg(id ORDER BY n),'[]')::text
 FROM pathways.p91_job_organizations() WITH ORDINALITY j(id,n)),true);
SELECT pg_temp.ok('job lists organizations A and B but not C', current_setting('p91.job_orgs')::jsonb @> jsonb_build_array(pg_temp.u(1),pg_temp.u(2))
 AND NOT current_setting('p91.job_orgs')::jsonb @> jsonb_build_array(pg_temp.u(3)));
SELECT pg_temp.ok('job login is not the job for an archived organization', NOT pg_temp.job_actor(3));
SELECT pg_temp.refused('job cannot begin a point of an archived organization', format('SELECT pathways.p91_job_begin_point(%L,%L)',
 pg_temp.u(3),'manifest'),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot finish a point of an archived organization', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(3),pg_temp.u(101),pg_temp.outcome()),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot fail a point of an archived organization', format('SELECT pathways.p91_job_fail_point(%L,%L,%L,%L)',
 pg_temp.u(3),pg_temp.u(101),'x','{}'),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot list retention of an archived organization', format('SELECT pathways.p91_job_retention_points(%L)',
 pg_temp.u(3)),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot delete a point of an archived organization', format('SELECT pathways.p91_job_delete_point(%L,%L)',
 pg_temp.u(3),pg_temp.u(101)),'42501','Backup access denied');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('job lists exactly the active unarchived organizations in id order', current_setting('p91.job_orgs')::jsonb,
 (SELECT jsonb_agg(id ORDER BY id) FROM pathways.organizations WHERE status='ACTIVE' AND archived_at IS NULL));

-- Fixtures: a stale AUTOMATIC point of organization A and an open AUTOMATIC point of organization B; the rows the job must
-- never change are saved first.
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,started_at)
VALUES (pg_temp.u(201),pg_temp.u(1),'AUTOMATIC','manifest',now()-interval '30 days'),
 (pg_temp.u(202),pg_temp.u(2),'AUTOMATIC','manifest',now());
SELECT set_config('p91.untouched',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM pathways.recovery_points r
 WHERE point_type<>'AUTOMATIC' OR organization_id<>pg_temp.u(1)),true);
SELECT set_config('p91.busy_before',pg_temp.job_audits('BACKUP_FAILED',NULL,'{"pointType":"AUTOMATIC","code":"BUSY"}')::text,true);
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT set_config('p91.job_point',coalesce(pathways.p91_job_begin_point(pg_temp.u(1),'manifest')::text,''),true);
SELECT pg_temp.ok('the job opens a point', current_setting('p91.job_point')<>'');
SELECT pg_temp.ok('a second begin is busy', pathways.p91_job_begin_point(pg_temp.u(1),'manifest') IS NULL);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('the stale automatic point is FAILED', (SELECT status='FAILED' AND completed_at IS NOT NULL
 AND failure_reason='The backup did not finish.' FROM pathways.recovery_points WHERE id=pg_temp.u(201)));
SELECT pg_temp.ok('the job point is AUTOMATIC and CREATING with no creator', (SELECT organization_id=pg_temp.u(1) AND point_type='AUTOMATIC'
 AND status='CREATING' AND file_mode='manifest' AND created_by_id IS NULL FROM pathways.recovery_points WHERE id=current_setting('p91.job_point')::uuid));
SELECT pg_temp.ok('a busy begin opens no second point', (SELECT count(*)=1 FROM pathways.recovery_points
 WHERE organization_id=pg_temp.u(1) AND status='CREATING'));
SELECT pg_temp.ok('a busy begin leaves one BACKUP_FAILED row', pg_temp.job_audits('BACKUP_FAILED',NULL,
 '{"pointType":"AUTOMATIC","code":"BUSY"}')=current_setting('p91.busy_before')::integer+1);

-- Finish takes exactly the five outcome keys and audits BACKUP_CREATED; MANUAL, PRE_RESTORE and other-organization ids are refused.
SELECT set_config('p91.created_before',pg_temp.job_audits('BACKUP_CREATED',current_setting('p91.job_point')::uuid,
 pg_temp.outcome()->'changes')::text,true);
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.refused('finish needs every outcome key', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(1),current_setting('p91.job_point'),pg_temp.outcome()-'changes'),'22023','Invalid backup outcome');
SELECT pg_temp.refused('finish takes no other outcome key', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(1),current_setting('p91.job_point'),pg_temp.outcome()||'{"status":"READY"}'),'22023','Invalid backup outcome');
SELECT pathways.p91_job_finish_point(pg_temp.u(1),current_setting('p91.job_point')::uuid,pg_temp.outcome());
SELECT pg_temp.refused('a READY point cannot be failed', format('SELECT pathways.p91_job_fail_point(%L,%L,%L,%L)',
 pg_temp.u(1),current_setting('p91.job_point'),'x','{}'),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot finish a manual point', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(101),pg_temp.outcome()),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot fail a manual point', format('SELECT pathways.p91_job_fail_point(%L,%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(101),'x','{}'),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot finish a pre-restore point', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(102),pg_temp.outcome()),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot fail a pre-restore point', format('SELECT pathways.p91_job_fail_point(%L,%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(102),'x','{}'),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot finish a point of another organization', format('SELECT pathways.p91_job_finish_point(%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(202),pg_temp.outcome()),'42501','Backup access denied');
SELECT pg_temp.refused('job cannot fail a point of another organization', format('SELECT pathways.p91_job_fail_point(%L,%L,%L,%L)',
 pg_temp.u(1),pg_temp.u(202),'x','{}'),'42501','Backup access denied');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('finish makes the job point READY', (SELECT status='READY' AND captured_at='2026-11-12T01:02:03.456Z'::timestamptz
 AND completed_at IS NOT NULL AND migration_name='0091_backup_recovery' AND size_bytes=2048 AND manifest_sha256=repeat('b',64)
 AND failure_reason IS NULL FROM pathways.recovery_points WHERE id=current_setting('p91.job_point')::uuid));
SELECT pg_temp.ok('finish leaves one BACKUP_CREATED row with no actor', pg_temp.job_audits('BACKUP_CREATED',
 current_setting('p91.job_point')::uuid,pg_temp.outcome()->'changes')=current_setting('p91.created_before')::integer+1);

-- Retention: 8 READY AUTOMATIC points (the job point plus 7 older ones) and the stale FAILED one, which is older than all;
-- an old point still CREATING is never retired.
INSERT INTO pathways.recovery_points(id,organization_id,point_type,status,file_mode,started_at,captured_at,completed_at,
 migration_name,size_bytes,manifest_sha256)
SELECT pg_temp.u(210+n),pg_temp.u(1),'AUTOMATIC','READY','manifest',now()-make_interval(days=>n),now()-make_interval(days=>n),
 now()-make_interval(days=>n),'0091_backup_recovery',1024,repeat('c',64) FROM generate_series(1,7) n;
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,started_at)
VALUES (pg_temp.u(218),pg_temp.u(1),'AUTOMATIC','manifest',now()-interval '20 days');
SELECT pg_temp.ok('retention fixture has 8 READY and 1 FAILED automatic points', (SELECT count(*) FILTER (WHERE status='READY')=8
 AND count(*) FILTER (WHERE status='FAILED')=1 FROM pathways.recovery_points WHERE organization_id=pg_temp.u(1) AND point_type='AUTOMATIC'));
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.same('retention returns the FAILED then the oldest READY point', (SELECT jsonb_agg(id ORDER BY n)
 FROM pathways.p91_job_retention_points(pg_temp.u(1)) WITH ORDINALITY r(id,n)), jsonb_build_array(pg_temp.u(201),pg_temp.u(217)));
SELECT pg_temp.ok('job cannot delete a kept point', NOT pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(211)));
SELECT pg_temp.ok('job cannot delete a creating point', NOT pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(218)));
SELECT pg_temp.ok('job cannot delete a manual point', NOT pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(101)));
SELECT pg_temp.ok('job cannot delete a pre-restore point', NOT pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(102)));
SELECT pg_temp.ok('job cannot delete a point of another organization', NOT pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(202)));
SELECT pg_temp.ok('job deletes the FAILED point', pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(201)));
SELECT pg_temp.ok('job deletes the oldest READY point', pathways.p91_job_delete_point(pg_temp.u(1),pg_temp.u(217)));
SELECT pg_temp.same('retention is then empty', (SELECT coalesce(jsonb_agg(id),'[]') FROM pathways.p91_job_retention_points(pg_temp.u(1)) id), '[]');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('retention removed only the two points', NOT EXISTS(SELECT FROM pathways.recovery_points WHERE id IN (pg_temp.u(201),pg_temp.u(217)))
 AND (SELECT count(*)=2 FROM pathways.recovery_points WHERE id IN (pg_temp.u(211),pg_temp.u(218))));
DELETE FROM pathways.recovery_points WHERE id=pg_temp.u(218);

-- Fail closes an open point with its reason and audits BACKUP_FAILED.
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT set_config('p91.job_point',coalesce(pathways.p91_job_begin_point(pg_temp.u(1),'copy')::text,''),true);
RESET SESSION AUTHORIZATION;
SELECT set_config('p91.failed_before',pg_temp.job_audits('BACKUP_FAILED',current_setting('p91.job_point')::uuid,
 '{"pointType":"AUTOMATIC","code":"STORAGE_UNAVAILABLE"}')::text,true);
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pathways.p91_job_fail_point(pg_temp.u(1),current_setting('p91.job_point')::uuid,'Backup storage was unavailable.',
 '{"pointType":"AUTOMATIC","code":"STORAGE_UNAVAILABLE"}');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('fail makes the job point FAILED', (SELECT status='FAILED' AND file_mode='copy' AND completed_at IS NOT NULL
 AND failure_reason='Backup storage was unavailable.' FROM pathways.recovery_points WHERE id=current_setting('p91.job_point')::uuid));
SELECT pg_temp.ok('fail leaves one BACKUP_FAILED row with no actor', pg_temp.job_audits('BACKUP_FAILED',current_setting('p91.job_point')::uuid,
 '{"pointType":"AUTOMATIC","code":"STORAGE_UNAVAILABLE"}')=current_setting('p91.failed_before')::integer+1);

-- A prisma definer with no type filter, so the job policies alone keep the job off MANUAL and PRE_RESTORE rows.
CREATE FUNCTION pg_temp.as_prisma(statement text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
ALTER FUNCTION pg_temp.as_prisma(text) OWNER TO prisma;
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.ok('job policies let the job read its organization rows', pg_temp.as_prisma(format(
 'SELECT FROM pathways.recovery_points WHERE organization_id=%L',pg_temp.u(1)))>2);
SELECT pg_temp.ok('job policies update no other point type', pg_temp.as_prisma($u$UPDATE pathways.recovery_points
 SET failure_reason='x' WHERE point_type<>'AUTOMATIC'$u$)=0);
SELECT pg_temp.ok('job policies delete no other point type', pg_temp.as_prisma($d$DELETE FROM pathways.recovery_points
 WHERE point_type<>'AUTOMATIC'$d$)=0);
SELECT pg_temp.refused('job policies insert no manual point', format($s$SELECT pg_temp.as_prisma(%L)$s$,format($i$INSERT INTO
 pathways.recovery_points(organization_id,point_type,file_mode,created_by_id) VALUES(%L,'MANUAL','manifest',%L)$i$,pg_temp.u(1),pg_temp.u(21))),
 '42501','row-level security');
SELECT pg_temp.refused('job policies turn no automatic point into another type', format($s$SELECT pg_temp.as_prisma(%L)$s$,format(
 $u$UPDATE pathways.recovery_points SET point_type='PRE_RESTORE',created_by_id=%L WHERE id=%L$u$,pg_temp.u(21),pg_temp.u(211))),
 '42501','row-level security');
SELECT pg_temp.refused('job policies insert no point of an archived organization', format($s$SELECT pg_temp.as_prisma(%L)$s$,format(
 $i$INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode) VALUES(%L,'AUTOMATIC','manifest')$i$,pg_temp.u(3))),
 '42501','row-level security');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('the job changed no MANUAL, PRE_RESTORE or other-organization row', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id)
 FROM pathways.recovery_points r WHERE point_type<>'AUTOMATIC' OR organization_id<>pg_temp.u(1)), current_setting('p91.untouched')::jsonb);

-- Neither the job login nor the no-user runtime can write an audit row directly, and the runtime cannot run the job functions.
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.refused('job cannot insert an audit row', $s$INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
 VALUES (pg_temp.u(1),NULL,'BACKUP_CREATED','RECOVERY_POINT',NULL)$s$,'42501','permission denied');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as_job();
SELECT set_config('app.organization_id',pg_temp.u(1)::text,true);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.refused('no-user runtime cannot list organizations', 'SELECT pathways.p91_job_organizations()','42501','permission denied');
SELECT pg_temp.refused('no-user runtime has no job audit path', $s$INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
 VALUES (pg_temp.u(1),NULL,'BACKUP_CREATED','RECOVERY_POINT',NULL)$s$,'42501','row-level security');
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('runtime cannot begin a job point', format('SELECT pathways.p91_job_begin_point(%L,%L)',pg_temp.u(1),'manifest'),
 '42501','permission denied');
RESET SESSION AUTHORIZATION;
DELETE FROM pathways.recovery_points WHERE id=pg_temp.u(202);
-- Any open point of the organization makes the job busy, not only an automatic one.
INSERT INTO pathways.recovery_points(id,organization_id,point_type,file_mode,created_by_id)
VALUES (pg_temp.u(106),pg_temp.u(1),'MANUAL','manifest',pg_temp.u(21));
SELECT pg_temp.act_as_job();
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.ok('an open manual point makes the job busy', pathways.p91_job_begin_point(pg_temp.u(1),'manifest') IS NULL);
RESET SESSION AUTHORIZATION;
DELETE FROM pathways.recovery_points WHERE id=pg_temp.u(106);
SELECT pg_temp.ok('no point is left CREATING after the job checks', NOT EXISTS(SELECT FROM pathways.recovery_points WHERE status='CREATING'));

-- table_list: the ordered list holds every organization table except the excluded ones, parents before children
-- apart from the two cycle edges the restore drops and re-adds.
CREATE FUNCTION pg_temp.qname(rel oid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=rel $$;
SELECT pg_temp.same('backup table list is complete',
 (SELECT jsonb_agg(x ORDER BY x) FROM (
   SELECT pg_temp.qname(c.oid) AS x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p') AND n.nspname IN ('pathways','pathways_rules_internal')
    AND EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND NOT a.attisdropped)
   EXCEPT SELECT unnest(ARRAY['pathways.system_users','pathways.user_step_up_pins','pathways.beneficiary_step_up_grants',
    'pathways.recovery_points',
    -- Rules context tables hold transaction-scoped operation context, valid only inside the writing transaction.
    'pathways_rules_internal.configuration_context','pathways_rules_internal.projection_context',
    'pathways_rules_internal.feature_operation_context','pathways_rules_internal.source_operation_context',
    'pathways_rules_internal.runtime_mutation_intents'])) s),
 (SELECT jsonb_agg(table_name ORDER BY table_name) FROM pathways.p91_backup_tables()));
SELECT pg_temp.ok('positions are 1..n and names unique', (SELECT count(*)=74 AND count(DISTINCT table_name)=74
 AND min(table_order)=1 AND max(table_order)=74 FROM pathways.p91_backup_tables()));
SELECT pg_temp.ok('backup list is in foreign key order', NOT EXISTS(SELECT FROM pg_constraint k
 JOIN pathways.p91_backup_tables() ch ON ch.table_name=pg_temp.qname(k.conrelid)
 JOIN pathways.p91_backup_tables() pa ON pa.table_name=pg_temp.qname(k.confrelid)
 WHERE k.contype='f' AND k.conrelid<>k.confrelid AND pa.table_order>=ch.table_order
  AND NOT ((k.conrelid='pathways.budget_expense_entries'::regclass AND k.conname='budget_expense_entries_receipt_evidence_fkey')
   OR (k.conrelid='pathways.decision_recommendations'::regclass AND k.conname='f10_private_review_scope'))));
SELECT pg_temp.same('only audit history skips restore', (SELECT jsonb_agg(table_name) FROM pathways.p91_backup_tables() WHERE NOT restore), '["pathways.audit_logs"]');
SELECT pg_temp.ok('the backup owner manages every listed table', NOT EXISTS(SELECT FROM pathways.p91_backup_tables() t
 JOIN pg_class c ON c.oid=to_regclass(t.table_name) WHERE NOT pg_has_role('pathways_backup_owner', c.relowner, 'USAGE'))
 AND NOT EXISTS(SELECT FROM pathways.p91_backup_tables() t WHERE to_regclass(t.table_name) IS NULL));
SELECT pg_temp.ok('cycle edges exist', (SELECT count(*)=2 FROM pg_constraint WHERE contype='f' AND convalidated AND
 ((conrelid='pathways.budget_expense_entries'::regclass AND conname='budget_expense_entries_receipt_evidence_fkey')
  OR (conrelid='pathways.decision_recommendations'::regclass AND conname='f10_private_review_scope'))));
SELECT pg_temp.ok('table list function ACL', (SELECT pg_get_userbyid(proowner)='pathways_backup_owner' AND prosecdef
 AND has_function_privilege('pathways_runtime',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE')
 AND NOT has_function_privilege('pathways_backup_job',oid,'EXECUTE')
 FROM pg_proc WHERE oid='pathways.p91_backup_tables()'::regprocedure));

-- fixtures: organization A holds every shape the round trip must keep (bytea, double precision, timestamp(3), enums, nested
-- jsonb, a self reference and the first foreign key cycle); organization B holds a project, a pin and an audit row. Triggers
-- are off while they load, so every row is written to satisfy its foreign keys by hand.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.programs(id,organization_id,code,name,status)
VALUES (pg_temp.u(51),pg_temp.u(1),'P91-PROGRAM','Synthetic backup program','ONGOING');
INSERT INTO pathways.projects(id,organization_id,program_id,code,title,status,created_by_id)
VALUES (pg_temp.u(41),pg_temp.u(1),pg_temp.u(51),'P91-41','Synthetic backup project 41','ONGOING',pg_temp.u(21)),
 (pg_temp.u(42),pg_temp.u(1),pg_temp.u(51),'P91-42','Synthetic backup project 42','PLANNED',pg_temp.u(21)),
 (pg_temp.u(43),pg_temp.u(2),NULL,'P91-43','Synthetic backup project 43','PLANNED',pg_temp.u(31));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES (pg_temp.u(91),pg_temp.u(1),pg_temp.u(41),pg_temp.u(22),pg_temp.u(21));
INSERT INTO pathways.beneficiaries(id,organization_id,code,display_name,created_by_id)
VALUES (pg_temp.u(61),pg_temp.u(1),'P91-B61','Synthetic backup beneficiary',pg_temp.u(21));
INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,parent_stage_id,created_by_id)
VALUES (pg_temp.u(71),pg_temp.u(1),pg_temp.u(41),'P91-S71','Synthetic stage 71',1,NULL,pg_temp.u(21)),
 (pg_temp.u(72),pg_temp.u(1),pg_temp.u(41),'P91-S72','Synthetic stage 72',2,pg_temp.u(71),pg_temp.u(21));
INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id,submitted_at)
VALUES (pg_temp.u(1),pg_temp.u(41),1,'FOR_REVIEW','SUBMIT','Synthetic public summary',jsonb_build_object('id',pg_temp.u(41),
 'title','Synthetic backup project 41','code','P91-41','approvedSummary','Synthetic public summary','area','Synthetic area',
 'sector',NULL,'startDate',NULL,'endDate',NULL,'media','[]'::jsonb,'views',jsonb_build_array(jsonb_build_object('label','Reach',
 'values',jsonb_build_array(1,2.5,jsonb_build_object('nested',jsonb_build_array(true,NULL)))))),pg_temp.u(21),now());
INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,longitude,latitude,updated_by_id)
VALUES (pg_temp.u(1),pg_temp.u(41),'Synthetic place','Synthetic province',121.04371234567891,14.676041234567893,pg_temp.u(21)),
 (pg_temp.u(2),pg_temp.u(43),'Synthetic place B','Synthetic province',123.5,10.25,pg_temp.u(31));
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id)
VALUES (pg_temp.u(81),pg_temp.u(1),pg_temp.u(41),'OPERATIONS','PHP',1000.50,pg_temp.u(21));
INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,
 receipt_evidence_id,submitted_by_id)
VALUES (pg_temp.u(82),pg_temp.u(1),pg_temp.u(41),pg_temp.u(81),'Synthetic expense',100.25,current_date,pg_temp.u(83),pg_temp.u(21));
INSERT INTO pathways.evidence_media(id,organization_id,project_id,expense_id,file_name,bucket,object_key,sha256,byte_size,
 content_type,submitted_by_id)
VALUES (pg_temp.u(83),pg_temp.u(1),pg_temp.u(41),pg_temp.u(82),'receipt.pdf','pathways-private',
 format('organizations/%s/projects/%s/evidence/%s/receipt.pdf',pg_temp.u(1),pg_temp.u(41),pg_temp.u(83)),repeat('d',64),2048,
 'application/pdf',pg_temp.u(21));
INSERT INTO pathways_rules_internal.project_state(organization_id,project_id) VALUES (pg_temp.u(1),pg_temp.u(41));
INSERT INTO pathways_rules_internal.jobs(id,organization_id,project_id,pending_since,next_attempt_at,state,lease_hash,
 lease_session,lease_expires_at,claim_generation,claim_watermark)
VALUES (pg_temp.u(92),pg_temp.u(1),pg_temp.u(41),now(),now(),'LEASED',sha256('p91'::bytea),'pathways_rules_worker',
 now()+interval '1 minute',0,0);
INSERT INTO pathways.audit_logs(id,organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
VALUES (pg_temp.u(93),pg_temp.u(1),pg_temp.u(21),pg_temp.u(41),'P91_FIXTURE','PROJECT',pg_temp.u(41)::text,
 '{"before":{"status":"PLANNED"},"after":{"status":"ONGOING","tags":["a","b"]}}'),
 (pg_temp.u(94),pg_temp.u(1),NULL,NULL,'P91_FIXTURE','ORGANIZATION',NULL,NULL),
 (pg_temp.u(95),pg_temp.u(2),pg_temp.u(31),pg_temp.u(43),'P91_FIXTURE','PROJECT',pg_temp.u(43)::text,'{}');
INSERT INTO pathways.recovery_points(id,organization_id,point_type,status,file_mode,created_by_id,captured_at,completed_at,
 migration_name,size_bytes,manifest_sha256)
VALUES (pg_temp.u(105),pg_temp.u(1),'MANUAL','READY','manifest',pg_temp.u(21),now(),now(),current_setting('p91.migration'),
 4096,repeat('e',64));
UPDATE pathways_rules_internal.sweep_cursor SET last_organization_id=pg_temp.u(1), last_project_id=pg_temp.u(41);
RESET session_replication_role;
-- Each listed table's FORCE ROW LEVEL SECURITY flag, keyed by table.
CREATE FUNCTION pg_temp.forced_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_object_agg(t.table_name, c.relforcerowsecurity) FROM pathways.p91_backup_tables() t
  JOIN pg_class c ON c.oid=to_regclass(t.table_name)
$$;
-- Every listed table with that organization's rows in a stable order, read as the superuser; empty tables give [].
CREATE FUNCTION pg_temp.org_rows(org_n integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE t text; found_rows jsonb; result jsonb := '{}';
BEGIN
 FOR t IN SELECT table_name FROM pathways.p91_backup_tables() LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]'') FROM %s r WHERE r.organization_id=$1',t)
   INTO found_rows USING pg_temp.u(org_n);
  result := result || jsonb_build_object(t, found_rows);
 END LOOP;
 RETURN result;
END $$;
SELECT pg_temp.ok('fixtures load in organization A', (SELECT count(*)=2 FROM pathways.projects WHERE organization_id=pg_temp.u(1))
 AND (SELECT count(*)=1 FROM pathways_rules_internal.jobs WHERE organization_id=pg_temp.u(1))
 AND (SELECT last_project_id=pg_temp.u(41) FROM pathways_rules_internal.sweep_cursor));

-- capture: an administrator captures organization A in full, forced tables included, without locking or unforcing a table;
-- every other caller is refused, and the job login captures the same rows.
SELECT set_config('p91.forced', pg_temp.forced_state()::text, true);
SELECT set_config('p91.audit_count', (SELECT count(*) FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1))::text, true);
SELECT pg_temp.ok('triggers are on before capture', current_setting('session_replication_role')='origin');
SELECT pg_temp.act_as(21); SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('p91.point', pathways.p91_capture_organization(pg_temp.u(1))::text, true);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('point header', (SELECT p->>'format'='pathways.recovery-point.v1' AND p->>'organizationId'=pg_temp.u(1)::text
 AND p->>'migration'=(SELECT max(migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
 AND (p->>'capturedAt')::timestamptz=transaction_timestamp()
 FROM (SELECT current_setting('p91.point')::jsonb p) x));
SELECT pg_temp.same('point holds every listed table', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(current_setting('p91.point')::jsonb->'tables') k),
 (SELECT jsonb_agg(table_name ORDER BY table_name) FROM pathways.p91_backup_tables()));
SELECT pg_temp.same('point counts every listed table', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(current_setting('p91.point')::jsonb->'rowCounts') k),
 (SELECT jsonb_agg(table_name ORDER BY table_name) FROM pathways.p91_backup_tables()));
SELECT pg_temp.ok('counts match arrays', NOT EXISTS(SELECT FROM pathways.p91_backup_tables() t,
 (SELECT current_setting('p91.point')::jsonb p) x WHERE (x.p->'rowCounts'->>t.table_name)::int <> jsonb_array_length(x.p->'tables'->t.table_name)));
SELECT pg_temp.same('rows equal the database', (SELECT jsonb_object_agg(e.key,(SELECT coalesce(jsonb_agg(r ORDER BY r::text),'[]') FROM jsonb_array_elements(e.value) r))
 FROM jsonb_each(current_setting('p91.point')::jsonb->'tables') e), pg_temp.org_rows(1));
SELECT pg_temp.ok('no other organization row', NOT EXISTS(SELECT FROM jsonb_each(current_setting('p91.point')::jsonb->'tables') e,
 jsonb_array_elements(e.value) r WHERE r->>'organization_id' <> pg_temp.u(1)::text));
SELECT pg_temp.ok('forced tables read in full', (current_setting('p91.point')::jsonb->'rowCounts'->>'pathways.project_publications')::int=1
 AND (current_setting('p91.point')::jsonb->'rowCounts'->>'pathways_rules_internal.jobs')::int=1
 AND (current_setting('p91.point')::jsonb->'rowCounts'->>'pathways.project_map_pins')::int=1);
SELECT pg_temp.ok('audit history captured', (current_setting('p91.point')::jsonb->'rowCounts'->>'pathways.audit_logs')::int
 =current_setting('p91.audit_count')::int AND current_setting('p91.audit_count')::int>=2);
SELECT pg_temp.ok('excluded tables absent', NOT (current_setting('p91.point')::jsonb->'tables' ?| ARRAY['pathways.system_users','pathways.recovery_points','pathways.user_step_up_pins']));
SELECT pg_temp.ok('bytea and double precision kept exactly', (SELECT j->>'lease_hash'='\x'||encode(sha256('p91'::bytea),'hex')
 FROM jsonb_array_elements(current_setting('p91.point')::jsonb->'tables'->'pathways_rules_internal.jobs') j)
 AND (SELECT (m->>'longitude')::float8=121.04371234567891 AND (m->>'latitude')::float8=14.676041234567893
 FROM jsonb_array_elements(current_setting('p91.point')::jsonb->'tables'->'pathways.project_map_pins') m));
SELECT pg_temp.same('forced flags unchanged', pg_temp.forced_state(), current_setting('p91.forced')::jsonb);
SELECT pg_temp.ok('capture takes no access exclusive lock', NOT EXISTS(SELECT FROM pg_locks l JOIN pathways.p91_backup_tables() t
 ON l.relation=to_regclass(t.table_name) WHERE l.pid=pg_backend_pid() AND l.mode='AccessExclusiveLock'));
SELECT pg_temp.ok('capture setting cleared', coalesce(current_setting('pathways.backup_capture_org', true),'')='');
SELECT pg_temp.ok('every forced listed table has the capture policy', NOT EXISTS(SELECT FROM pathways.p91_backup_tables() t
 JOIN pg_class c ON c.oid=to_regclass(t.table_name) WHERE c.relforcerowsecurity AND NOT EXISTS(SELECT FROM pg_policy p
  WHERE p.polrelid=c.oid AND p.polname='p91_backup_capture_select' AND p.polcmd='r' AND p.polpermissive
   AND p.polroles=ARRAY['pathways_backup_owner'::regrole::oid])));
SELECT pg_temp.ok('capture policies only on forced listed tables', (SELECT count(*) FROM pg_policy WHERE polname='p91_backup_capture_select')
 =(SELECT count(*) FROM pathways.p91_backup_tables() t JOIN pg_class c ON c.oid=to_regclass(t.table_name) WHERE c.relforcerowsecurity));
SELECT pg_temp.ok('capture function definition', (SELECT pg_get_userbyid(proowner)='pathways_backup_owner' AND prosecdef AND provolatile='v'
 AND proconfig=ARRAY['search_path=""','lock_timeout=5s'] FROM pg_proc WHERE oid='pathways.p91_capture_organization(uuid)'::regprocedure));
SELECT pg_temp.same('capture function execute', (SELECT pg_temp.grants(proacl) FROM pg_proc WHERE oid='pathways.p91_capture_organization(uuid)'::regprocedure),
 '["pathways_backup_job:EXECUTE","pathways_backup_owner:EXECUTE","pathways_runtime:EXECUTE"]');
SELECT pg_temp.same('job login executes only the job functions and capture', (SELECT jsonb_agg(p.proname ORDER BY p.proname) FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('pathways','pathways_rules_internal')
 AND has_function_privilege('pathways_backup_job',p.oid,'EXECUTE')),
 '["p91_capture_organization","p91_job_begin_point","p91_job_delete_point","p91_job_fail_point","p91_job_finish_point","p91_job_organizations","p91_job_retention_points"]');
-- The setting gives pathways_runtime nothing: only the backup owner is subject to the capture policies.
SELECT pg_temp.act_as(31,2); SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('pathways.backup_capture_org', pg_temp.u(1)::text, true);
SELECT pg_temp.ok('capture setting opens nothing to the runtime', (SELECT count(*)=0 FROM pathways.project_publications WHERE organization_id=pg_temp.u(1)));
SELECT set_config('pathways.backup_capture_org', '', true);
-- Refusals: a user without a backups permission, another organization's administrator, the wrong organization id, the
-- no-user runtime and the job login for an archived organization.
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('project manager cannot capture', format('SELECT pathways.p91_capture_organization(%L)',pg_temp.u(1)),'42501','Backup access denied');
SELECT pg_temp.act_as(31,2);
SELECT pg_temp.refused('another organization administrator cannot capture', format('SELECT pathways.p91_capture_organization(%L)',pg_temp.u(1)),'42501','Backup access denied');
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('administrator cannot capture another organization', format('SELECT pathways.p91_capture_organization(%L)',pg_temp.u(2)),'42501','Backup access denied');
SELECT pg_temp.act_as_job();
SELECT pg_temp.refused('no-user runtime cannot capture', format('SELECT pathways.p91_capture_organization(%L)',pg_temp.u(1)),'42501','Backup access denied');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as_job();
SET LOCAL SESSION AUTHORIZATION pathways_backup_job;
SELECT pg_temp.refused('job cannot capture an archived organization', format('SELECT pathways.p91_capture_organization(%L)',pg_temp.u(3)),'42501','Backup access denied');
SELECT set_config('p91.job_capture', pathways.p91_capture_organization(pg_temp.u(1))::text, true);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('job capture counts the same rows', current_setting('p91.job_capture')::jsonb->'rowCounts', current_setting('p91.point')::jsonb->'rowCounts');
-- A forced table that lost its capture policy would read as empty, so capture stops; the refusal rolls the drop back.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('a forced table without its capture policy stops capture', format($s$DROP POLICY p91_backup_capture_select
 ON pathways.project_publications; SELECT pathways.p91_capture_organization(%L)$s$,pg_temp.u(1)),'55000',
 'Backup owner cannot manage pathways.project_publications');
SELECT pg_temp.ok('the capture policy is back after the refusal', EXISTS(SELECT FROM pg_policy
 WHERE polrelid='pathways.project_publications'::regclass AND polname='p91_backup_capture_select'));

SELECT 'BACKUP_RECOVERY_RUNTIME=PASS ('||current_setting('p91.passed')||')' AS result \gset
ROLLBACK;
\echo :result
