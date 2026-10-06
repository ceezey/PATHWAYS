-- 0065 zone check memo: pg_timezone_names reads the whole zone directory on every call (0.43 s on devV2), and the indicator
-- list reaches the check several times per indicator, so the 3 s statement_timeout of the analytics reads failed with 57014.
-- New pathways.p06_zone_is_valid(text) remembers a zone that passed the list check in a transaction-local setting, and
-- p06_assert_scope and p06_home_dashboard now call it. CREATE OR REPLACE changes only that predicate; owner, SECURITY DEFINER,
-- search_path and ACL stay as before (asserted below). Residual: a session that forges pathways_zone.valid to a specific non-empty zone name skips the list check for exactly that name; the empty string is rejected explicitly.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0064_evaluation_write_path'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0065 requires the verified 0064 state and migration identity'; END IF;
 IF to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)') IS NULL OR to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)') IS NULL
 THEN RAISE EXCEPTION '0065 requires p06_assert_scope and p06_home_dashboard to exist'; END IF;
 IF to_regprocedure('pathways.p06_zone_is_valid(text)') IS NOT NULL THEN RAISE EXCEPTION '0065 helper already exists'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)'),to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'))
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""'])<>2
 THEN RAISE EXCEPTION '0065 requires prisma to own both functions as SECURITY DEFINER with an empty search_path'; END IF;
 -- Remember the ACLs so the postcondition proves they are unchanged.
 PERFORM pg_catalog.set_config('pathways.m0065_acl_scope',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)')),true);
 PERFORM pg_catalog.set_config('pathways.m0065_acl_home',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)')),true);
END $$;
SELECT pg_advisory_xact_lock(505005,2);

CREATE FUNCTION pathways.p06_zone_is_valid(zone text)
 RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
BEGIN
 IF zone IS NULL OR zone = '' OR pg_catalog.length(zone) > 100 THEN RETURN false; END IF;
 IF pg_catalog.current_setting('pathways_zone.valid', true) = zone THEN RETURN true; END IF;
 IF NOT EXISTS (SELECT FROM pg_catalog.pg_timezone_names WHERE name = zone) THEN RETURN false; END IF;
 PERFORM pg_catalog.set_config('pathways_zone.valid', zone, true);
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION pathways.p06_zone_is_valid(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION pathways.p06_assert_scope(wanted_org uuid, wanted_projects uuid[], permission text, start_on date, end_on date, zone text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p uuid;
BEGIN
  IF
    wanted_org IS NULL
    OR wanted_org IS DISTINCT FROM
      nullif(current_setting('app.organization_id', true), '')::uuid
    OR wanted_projects IS NULL
    OR cardinality(wanted_projects) > 100
    OR array_position(wanted_projects, NULL) IS NOT NULL
    OR cardinality(wanted_projects) <> (
      SELECT count(DISTINCT item)
      FROM unnest(wanted_projects) item
    )
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable'
      USING ERRCODE='42501';
  END IF;

  IF
    start_on IS NULL
    OR end_on IS NULL
    OR start_on < DATE '1900-01-01'
    OR end_on > DATE '2100-12-31'
    OR end_on < start_on
    OR end_on - start_on > 365
    OR zone IS NULL
    OR length(zone) > 100
    OR NOT pathways.p06_zone_is_valid(zone)
  THEN
    RAISE EXCEPTION 'Invalid bounded monitoring period'
      USING ERRCODE='22023';
  END IF;

  /*
   * Empty project scopes must still represent an authenticated,
   * active application profile with the requested permission.
   */
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users u
    JOIN pathways.roles r
      ON r.id = u.role_id
     AND r.is_active
    JOIN pathways.role_permissions rp
      ON rp.role_id = r.id
    JOIN pathways.permissions pm
      ON pm.id = rp.permission_id
     AND pm.code = permission
    WHERE
      u.id =
        nullif(current_setting('app.user_id', true), '')::uuid
      AND u.organization_id = wanted_org
      AND u.auth_user_id =
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND u.account_status = 'ACTIVE'
      AND u.archived_at IS NULL
      AND pm.is_active
      AND pathways.p09_role_allows(r.code, permission)
      AND pathways.p09_can(permission)
  ) THEN
    RAISE EXCEPTION 'Monitoring permission unavailable'
      USING ERRCODE='42501';
  END IF;

  FOREACH p IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p06_can(permission, p) THEN
      RAISE EXCEPTION 'Monitoring scope unavailable'
        USING ERRCODE='42501';
    END IF;
  END LOOP;
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
     OR wanted_org IS DISTINCT FROM
       nullif(current_setting('app.organization_id', true), '')::uuid
     OR wanted_projects IS NULL
     OR cardinality(wanted_projects) > 100
     OR array_position(wanted_projects, NULL) IS NOT NULL
     OR cardinality(wanted_projects) <> (
       SELECT count(DISTINCT item)
       FROM unnest(wanted_projects) item
     ) THEN
    RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
  END IF;

  IF start_on IS NULL
     OR end_on IS NULL
     OR start_on < DATE '1900-01-01'
     OR end_on > DATE '2100-12-31'
     OR end_on < start_on
     OR end_on - start_on > 365
     OR zone IS NULL
     OR length(zone) > 100
     OR NOT pathways.p06_zone_is_valid(zone) THEN
    RAISE EXCEPTION 'Invalid bounded dashboard period' USING ERRCODE = '22023';
  END IF;

  -- Empty project scopes still require a current, active identity whose active
  -- role has the existing projects.read permission.
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users app_user
    JOIN pathways.roles role
      ON role.id = app_user.role_id
     AND role.is_active
    JOIN pathways.role_permissions mapping
      ON mapping.role_id = role.id
    JOIN pathways.permissions permission
      ON permission.id = mapping.permission_id
     AND permission.code = 'projects.read'
     AND permission.is_active
    WHERE app_user.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND app_user.organization_id = wanted_org
      AND app_user.auth_user_id =
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND app_user.account_status = 'ACTIVE'
      AND app_user.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Dashboard home permission unavailable' USING ERRCODE = '42501';
  END IF;

  -- The established project predicate verifies organization, active project,
  -- active permission and assignment/program scope for every requested project.
  FOREACH wanted_project IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p05_has_project_permission('projects.read', wanted_project) THEN
      RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  missing := pathways.p06_cell(NULL, 'SENSITIVE_RELEASE_NOT_ENABLED_V1');

  WITH activity_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_activities
    WHERE organization_id = wanted_org
      AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL
      AND planned_end_date BETWEEN start_on AND end_on
    GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_milestones
    WHERE organization_id = wanted_org
      AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL
      AND target_date BETWEEN start_on AND end_on
    GROUP BY status
  )
  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', v.key,
          'label', v.label,
          'metric', pathways.p06_cell(coalesce(counts.n, 0))
        )
        ORDER BY v.ord
      )
      FROM (
        VALUES
          ('NOT_STARTED', 'Not started', 1),
          ('IN_PROGRESS', 'In progress', 2),
          ('FOR_REVIEW', 'For review', 3),
          ('COMPLETED', 'Completed', 4),
          ('CANCELLED', 'Cancelled', 5)
      ) v(key, label, ord)
      LEFT JOIN activity_counts counts USING (key)
    ),
    'milestones', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', v.key,
          'label', v.label,
          'metric', pathways.p06_cell(coalesce(counts.n, 0))
        )
        ORDER BY v.ord
      )
      FROM (
        VALUES
          ('PENDING', 'Pending', 1),
          ('IN_PROGRESS', 'In progress', 2),
          ('COMPLETED', 'Completed', 3),
          ('CANCELLED', 'Cancelled', 4)
      ) v(key, label, ord)
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

-- Postconditions.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)'),to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'))
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""'])<>2
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_zone_is_valid(text)'))<>'prisma'
  OR (SELECT prosecdef OR provolatile<>'s' OR proconfig IS DISTINCT FROM ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_zone_is_valid(text)'))
  OR (SELECT pg_catalog.pg_get_functiondef(oid) FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)')) LIKE '%pg_timezone_names%'
  OR (SELECT pg_catalog.pg_get_functiondef(oid) FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)')) LIKE '%pg_timezone_names%'
 THEN RAISE EXCEPTION '0065 function shape postcondition failed'; END IF;
 IF (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_assert_scope(uuid,uuid[],text,date,date,text)')) IS DISTINCT FROM pg_catalog.current_setting('pathways.m0065_acl_scope')
  OR (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)')) IS DISTINCT FROM pg_catalog.current_setting('pathways.m0065_acl_home')
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid=to_regprocedure('pathways.p06_zone_is_valid(text)') AND a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma'))
  OR pg_catalog.has_function_privilege('pathways_runtime',to_regprocedure('pathways.p06_zone_is_valid(text)'),'EXECUTE')
  OR pg_catalog.has_function_privilege('anon',to_regprocedure('pathways.p06_zone_is_valid(text)'),'EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated',to_regprocedure('pathways.p06_zone_is_valid(text)'),'EXECUTE')
  OR pg_catalog.has_function_privilege('service_role',to_regprocedure('pathways.p06_zone_is_valid(text)'),'EXECUTE')
 THEN RAISE EXCEPTION '0065 grant postcondition failed'; END IF;
 IF NOT pathways.p06_zone_is_valid('Asia/Manila') OR pathways.p06_zone_is_valid('Not/AZone') OR pathways.p06_zone_is_valid(NULL)
  OR (SELECT pg_catalog.set_config('pathways_zone.valid','',true)) IS NULL OR pathways.p06_zone_is_valid('')
 THEN RAISE EXCEPTION '0065 helper behavior postcondition failed'; END IF;
END $$;
COMMIT;
