-- Disposable PostgreSQL behavioral checks for the P01 runtime boundary.
-- The fixed identifiers and records below are synthetic and roll back.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port() <> 55448
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'P01 behavioral checks require the guarded disposable replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('71000000-0000-4000-8000-000000000011'),
  ('71000000-0000-4000-8000-000000000012'),
  ('71000000-0000-4000-8000-000000000013'),
  ('71000000-0000-4000-8000-000000000014'),
  ('71000000-0000-4000-8000-000000000015'),
  ('71000000-0000-4000-8000-000000000016'),
  ('71000000-0000-4000-8000-000000000017'),
  ('71000000-0000-4000-8000-000000000018');

INSERT INTO pathways.organizations(id,code,name) VALUES
  ('71000000-0000-4000-8000-000000000001','P01_ORG_A','Synthetic P01 organization A'),
  ('71000000-0000-4000-8000-000000000002','P01_ORG_B','Synthetic P01 organization B');

INSERT INTO pathways.roles(id,code,name) VALUES
  ('71000000-0000-4000-8000-000000000021','SYSTEM_ADMINISTRATOR','System Administrator'),
  ('71000000-0000-4000-8000-000000000022','PROGRAM_MANAGER','Program Manager'),
  ('71000000-0000-4000-8000-000000000023','GRANT_MANAGER','Grant Manager'),
  ('71000000-0000-4000-8000-000000000024','PROJECT_MANAGER','Project Manager'),
  ('71000000-0000-4000-8000-000000000025','MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('71000000-0000-4000-8000-000000000026','PROJECT_OFFICER','Project Officer');

INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,
  invited_at,activated_at,suspended_at,deactivated_at,archived_at
) VALUES
  ('71000000-0000-4000-8000-000000000031','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000021','71000000-0000-4000-8000-000000000011','Synthetic administrator','admin@example.invalid','ACTIVE',now(),now(),NULL,NULL,NULL),
  ('71000000-0000-4000-8000-000000000032','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000024','71000000-0000-4000-8000-000000000012','Synthetic project manager','pm@example.invalid','ACTIVE',now(),now(),NULL,NULL,NULL),
  ('71000000-0000-4000-8000-000000000033','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000026','71000000-0000-4000-8000-000000000013','Synthetic project officer','po@example.invalid','ACTIVE',now(),now(),NULL,NULL,NULL),
  ('71000000-0000-4000-8000-000000000034','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000021','71000000-0000-4000-8000-000000000014','Synthetic foreign administrator','foreign@example.invalid','ACTIVE',now(),now(),NULL,NULL,NULL),
  ('71000000-0000-4000-8000-000000000035','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000026','71000000-0000-4000-8000-000000000015','Synthetic suspended user','suspended@example.invalid','SUSPENDED',now(),now(),now(),NULL,NULL),
  ('71000000-0000-4000-8000-000000000036','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000026','71000000-0000-4000-8000-000000000016','Synthetic deactivated user','deactivated@example.invalid','DEACTIVATED',now(),NULL,NULL,now(),NULL),
  ('71000000-0000-4000-8000-000000000037','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000026','71000000-0000-4000-8000-000000000017','Synthetic archived user','archived@example.invalid','ARCHIVED',now(),NULL,NULL,NULL,now());

INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
  ('71000000-0000-4000-8000-000000000041','71000000-0000-4000-8000-000000000001','P01_A_1','Synthetic project A1','71000000-0000-4000-8000-000000000031'),
  ('71000000-0000-4000-8000-000000000042','71000000-0000-4000-8000-000000000001','P01_A_2','Synthetic project A2','71000000-0000-4000-8000-000000000031'),
  ('71000000-0000-4000-8000-000000000043','71000000-0000-4000-8000-000000000002','P01_B_1','Synthetic project B1','71000000-0000-4000-8000-000000000034');

INSERT INTO pathways.user_project_assignments(
  id,organization_id,project_id,user_id,assigned_by_id
) VALUES
  ('71000000-0000-4000-8000-000000000051','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000041','71000000-0000-4000-8000-000000000032','71000000-0000-4000-8000-000000000031'),
  ('71000000-0000-4000-8000-000000000052','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000041','71000000-0000-4000-8000-000000000033','71000000-0000-4000-8000-000000000031');

SET LOCAL ROLE pathways_runtime;

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000011',true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true),
  set_config('app.user_id','71000000-0000-4000-8000-000000000031',true);

DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM pathways.projects) <> 2 THEN
    RAISE EXCEPTION 'Runtime organization isolation failed';
  END IF;
  IF (SELECT count(*) FROM pathways.p1_workspace_for_auth()) <> 1 THEN
    RAISE EXCEPTION 'Active workspace discovery failed';
  END IF;
  IF NOT pathways.p1_can_manage_role('71000000-0000-4000-8000-000000000023') THEN
    RAISE EXCEPTION 'System Administrator role ceiling failed';
  END IF;
  BEGIN
    UPDATE pathways.system_users SET full_name='Forbidden self update'
    WHERE id='71000000-0000-4000-8000-000000000031';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Runtime self-administration was not denied'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pathways.system_users(
      organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
    ) VALUES (
      '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000026',
      '71000000-0000-4000-8000-000000000018',
      'Forbidden cross-organization profile','denied@example.invalid','ACTIVE',now()
    );
    RAISE EXCEPTION 'Runtime cross-organization profile insert was not denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000012',true),
  set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true),
  set_config('app.user_id','71000000-0000-4000-8000-000000000032',true);

DO $$
BEGIN
  IF pathways.p1_can_manage_role('71000000-0000-4000-8000-000000000023') THEN
    RAISE EXCEPTION 'Project Manager escalation to Grant Manager was not denied';
  END IF;
  IF NOT pathways.p1_can_manage_role('71000000-0000-4000-8000-000000000026') THEN
    RAISE EXCEPTION 'Project Manager role ceiling rejected Project Officer';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000015',true),
  set_config('app.organization_id','',true),set_config('app.user_id','',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pathways.p1_workspace_for_auth()) THEN
    RAISE EXCEPTION 'Suspended account received workspace access';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000016',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pathways.p1_workspace_for_auth()) THEN
    RAISE EXCEPTION 'Deactivated account received workspace access';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000017',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pathways.p1_workspace_for_auth()) THEN
    RAISE EXCEPTION 'Archived account received workspace access';
  END IF;
END $$;

ROLLBACK;
