-- Runtime-equivalent dashboard-home authorization checks. Run only against the
-- guarded disposable replay database.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port() <> 55448
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION '0024 checks require the guarded disposable replay target';
  END IF;
END
$$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ('92400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '0024 assertion failed: %', label;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.expect_42501(statement text, label text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RETURN;
  END;
  RAISE EXCEPTION '0024 expected 42501: %', label;
END
$$;

SELECT pg_temp.assert_true(
  has_function_privilege(
    'pathways_runtime',
    'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
    'EXECUTE'
  ),
  'runtime has exact home function execute'
);
SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'anon',
    'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
    'EXECUTE'
  ),
  'Data API roles cannot execute home function'
);
SELECT pg_temp.assert_true(
  NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'pathways_runtime'),
  'runtime remains non-superuser NOBYPASSRLS'
);
SELECT pg_temp.assert_true(
  position(
    '''analytics.read'''
    IN pg_get_functiondef('pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)'::regprocedure)
  ) > 0
  AND position(
    '''analytics.read'''
    IN pg_get_functiondef('pathways.p06_saddd(uuid,uuid[],date,date,text)'::regprocedure)
  ) > 0,
  'monitoring and SADDD retain analytics.read database checks'
);

INSERT INTO auth.users(id) VALUES
  (pg_temp.u(101)),
  (pg_temp.u(102)),
  (pg_temp.u(103)),
  (pg_temp.u(104));

INSERT INTO pathways.organizations(id, code, name) VALUES
  (pg_temp.u(1), 'DASH_HOME_A', 'Dashboard home organization A'),
  (pg_temp.u(2), 'DASH_HOME_B', 'Dashboard home organization B');

INSERT INTO pathways.roles(id, code, name) VALUES
  (pg_temp.u(11), 'PROJECT_OFFICER', 'Project Officer'),
  (pg_temp.u(12), 'GRANT_MANAGER', 'Grant Manager'),
  (pg_temp.u(13), 'PROJECT_MANAGER', 'Project Manager');

INSERT INTO pathways.permissions(id, code, name) VALUES
  (pg_temp.u(21), 'projects.read', 'projects.read'),
  (pg_temp.u(22), 'analytics.read', 'analytics.read')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, is_active = true;

INSERT INTO pathways.role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM pathways.roles role
JOIN pathways.permissions permission ON permission.code = 'projects.read'
WHERE role.code IN ('PROJECT_OFFICER', 'PROJECT_MANAGER');

INSERT INTO pathways.role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM pathways.roles role
JOIN pathways.permissions permission ON permission.code = 'analytics.read'
WHERE role.code = 'PROJECT_MANAGER';

INSERT INTO pathways.system_users(
  id,
  organization_id,
  role_id,
  auth_user_id,
  full_name,
  email,
  account_status,
  activated_at,
  suspended_at
) VALUES
  (pg_temp.u(31), pg_temp.u(1), pg_temp.u(11), pg_temp.u(101),
   'Assigned Project Officer', 'assigned-po@example.invalid', 'ACTIVE', now(), NULL),
  (pg_temp.u(32), pg_temp.u(1), pg_temp.u(12), pg_temp.u(102),
   'No permission user', 'no-permission@example.invalid', 'ACTIVE', now(), NULL),
  (pg_temp.u(33), pg_temp.u(1), pg_temp.u(11), pg_temp.u(103),
   'Inactive Project Officer', 'inactive-po@example.invalid', 'SUSPENDED', now(), now()),
  (pg_temp.u(34), pg_temp.u(2), pg_temp.u(13), pg_temp.u(104),
   'Foreign Project Manager', 'foreign-pm@example.invalid', 'ACTIVE', now(), NULL);

INSERT INTO pathways.projects(
  id,
  organization_id,
  code,
  title,
  start_date,
  end_date,
  created_by_id
) VALUES
  (pg_temp.u(41), pg_temp.u(1), 'DASH_ASSIGNED', 'Assigned dashboard project',
   DATE '2026-01-01', DATE '2026-12-31', pg_temp.u(31)),
  (pg_temp.u(42), pg_temp.u(1), 'DASH_ENDED', 'Ended-assignment dashboard project',
   DATE '2026-01-01', DATE '2026-12-31', pg_temp.u(31)),
  (pg_temp.u(43), pg_temp.u(1), 'DASH_UNASSIGNED', 'Unassigned dashboard project',
   DATE '2026-01-01', DATE '2026-12-31', pg_temp.u(31)),
  (pg_temp.u(44), pg_temp.u(2), 'DASH_FOREIGN', 'Foreign dashboard project',
   DATE '2026-01-01', DATE '2026-12-31', pg_temp.u(34));

INSERT INTO pathways.user_project_assignments(
  id,
  organization_id,
  project_id,
  user_id,
  assigned_by_id,
  status,
  ended_at,
  end_reason
) VALUES
  (pg_temp.u(51), pg_temp.u(1), pg_temp.u(41), pg_temp.u(31), pg_temp.u(31), 'ACTIVE', NULL, NULL),
  (pg_temp.u(52), pg_temp.u(1), pg_temp.u(42), pg_temp.u(31), pg_temp.u(31), 'ENDED', now(), 'Synthetic ended assignment'),
  (pg_temp.u(53), pg_temp.u(1), pg_temp.u(41), pg_temp.u(32), pg_temp.u(31), 'ACTIVE', NULL, NULL);

INSERT INTO pathways.project_activities(
  id,
  organization_id,
  project_id,
  code,
  title,
  planned_start_date,
  planned_end_date,
  status,
  created_by_id
) VALUES (
  pg_temp.u(61), pg_temp.u(1), pg_temp.u(41), 'DASH-ACT', 'Dashboard activity',
  DATE '2026-06-01', DATE '2026-06-30', 'NOT_STARTED', pg_temp.u(31)
);
UPDATE pathways.project_activities
SET status = 'IN_PROGRESS', actual_start_date = DATE '2026-06-01'
WHERE id = pg_temp.u(61);

INSERT INTO pathways.project_milestones(
  id,
  organization_id,
  project_id,
  title,
  target_date
) VALUES (
  pg_temp.u(71), pg_temp.u(1), pg_temp.u(41), 'Dashboard milestone', DATE '2026-06-30'
);

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub', pg_temp.u(101)::text, true),
  set_config('app.organization_id', pg_temp.u(1)::text, true),
  set_config('app.user_id', pg_temp.u(31)::text, true);

DO $$
DECLARE
  dashboard jsonb;
BEGIN
  dashboard := pathways.p06_home_dashboard(
    pg_temp.u(1),
    ARRAY[pg_temp.u(41)],
    DATE '2026-06-01',
    DATE '2026-06-30',
    'Asia/Manila'
  );

  PERFORM pg_temp.assert_true(
    dashboard #>> '{activities,1,metric,value}' = '1',
    'assigned Project Officer receives current activity count'
  );
  PERFORM pg_temp.assert_true(
    dashboard #>> '{milestones,0,metric,value}' = '1',
    'assigned Project Officer receives current milestone count'
  );
  PERFORM pg_temp.assert_true(
    dashboard #>> '{participationRecords,state}' = 'MISSING'
      AND dashboard #>> '{participationRecords,value}' IS NULL
      AND dashboard #>> '{participationRecords,reason}' = 'SENSITIVE_RELEASE_NOT_ENABLED_V1',
    'home function remains non-disclosing for sensitive aggregates'
  );
END
$$;

SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_monitoring(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(41), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'Project Officer remains denied from monitoring analytics'
);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_saddd(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(41), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'Project Officer remains denied from SADDD analytics'
);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_home_dashboard(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(43), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'unassigned project is denied'
);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_home_dashboard(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(42), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'ended assignment is denied'
);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_home_dashboard(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(2), pg_temp.u(44), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'foreign organization is denied'
);

SELECT set_config('request.jwt.claim.sub', pg_temp.u(102)::text, true),
  set_config('app.user_id', pg_temp.u(32)::text, true);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_home_dashboard(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(41), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'missing projects.read is denied'
);

SELECT set_config('request.jwt.claim.sub', pg_temp.u(103)::text, true),
  set_config('app.user_id', pg_temp.u(33)::text, true);
SELECT pg_temp.expect_42501(
  format(
    'SELECT pathways.p06_home_dashboard(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
    pg_temp.u(1), pg_temp.u(41), '2026-06-01', '2026-06-30', 'Asia/Manila'
  ),
  'inactive identity is denied'
);

RESET ROLE;
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT
    FROM pathways.role_permissions mapping
    JOIN pathways.roles role ON role.id = mapping.role_id
    JOIN pathways.permissions permission ON permission.id = mapping.permission_id
    WHERE role.code = 'PROJECT_OFFICER'
      AND permission.code = 'analytics.read'
  ),
  'Project Officer did not acquire analytics.read'
);

ROLLBACK;
