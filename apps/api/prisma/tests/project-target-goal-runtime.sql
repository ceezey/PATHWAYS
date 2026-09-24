-- Disposable PostgreSQL checks for the Phase 2 project target-goal contract.
-- Synthetic rows only; every write is rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database()<>'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port()<>55448 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'Target-goal checks require the guarded disposable replay target';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pathways' AND table_name='projects' AND column_name='target_goal'
      AND data_type='numeric' AND numeric_precision=7 AND numeric_scale=4
      AND is_nullable='YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'target_goal column contract is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='pathways.projects'::regclass
      AND conname='projects_target_goal_check' AND contype='c'
  ) THEN
    RAISE EXCEPTION 'target_goal database check is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pathways' AND table_name IN ('project_activities','project_indicators')
      AND column_name='target_goal'
  ) THEN
    RAISE EXCEPTION 'a child target_goal duplicate was introduced';
  END IF;

  IF NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','SELECT')
     OR NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','INSERT')
     OR NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','UPDATE')
     OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime')
     OR NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid='pathways.projects'::regclass AND relrowsecurity
     ) THEN
    RAISE EXCEPTION 'target_goal runtime grants or Project RLS posture changed';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES ('92000000-0000-4000-8000-000000000011');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('92000000-0000-4000-8000-000000000001','TG_A','Synthetic target-goal organization'),
 ('92000000-0000-4000-8000-000000000002','TG_B','Synthetic foreign target-goal organization');
INSERT INTO pathways.roles(id,code,name) VALUES
 ('92000000-0000-4000-8000-000000000021','PROJECT_MANAGER','Project Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT
  '92000000-0000-4000-8000-000000000031',
  '92000000-0000-4000-8000-000000000001',
  id,
  '92000000-0000-4000-8000-000000000011',
  'Target-goal manager',
  'target-goal-manager@example.invalid',
  'ACTIVE',
  now()
FROM pathways.roles WHERE code='PROJECT_MANAGER';

INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('92000000-0000-4000-8000-000000000041','92000000-0000-4000-8000-000000000001','TG-A1','Legacy nullable target','92000000-0000-4000-8000-000000000031'),
 ('92000000-0000-4000-8000-000000000042','92000000-0000-4000-8000-000000000002','TG-B1','Foreign target',NULL);

DO $$
BEGIN
  IF (SELECT target_goal IS NOT NULL FROM pathways.projects
      WHERE id='92000000-0000-4000-8000-000000000041') THEN
    RAISE EXCEPTION 'existing Project received a fabricated target_goal';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','92000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','92000000-0000-4000-8000-000000000031',true);
SET LOCAL ROLE pathways_runtime;

UPDATE pathways.projects SET target_goal=62.5000
WHERE id='92000000-0000-4000-8000-000000000041';

DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT target_goal::text<>'62.5000' FROM pathways.projects
      WHERE id='92000000-0000-4000-8000-000000000041') THEN
    RAISE EXCEPTION 'runtime target_goal persistence failed';
  END IF;

  UPDATE pathways.projects SET target_goal=75
  WHERE id='92000000-0000-4000-8000-000000000042';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Project RLS allowed a foreign target update'; END IF;

  BEGIN
    UPDATE pathways.projects SET target_goal=0
    WHERE id='92000000-0000-4000-8000-000000000041';
    RAISE EXCEPTION 'zero target_goal unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE pathways.projects SET target_goal=100.0001
    WHERE id='92000000-0000-4000-8000-000000000041';
    RAISE EXCEPTION 'target_goal above 100 unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$$;

RESET ROLE;
ROLLBACK;
