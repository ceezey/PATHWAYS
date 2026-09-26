-- Forward-only correction of aggregate guards after the applied revised CSV migration.
-- Does not change roles, permissions, business data, privacy release policy, or ledger history.
BEGIN;
DO $$ BEGIN
 IF current_user<>'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0027_revised_csv_rbac' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT pathways.p09_role_allows('PROJECT_OFFICER','analytics.saddd.read') OR pathways.p09_role_allows('PROJECT_OFFICER','monitoring.read')
 THEN RAISE EXCEPTION '0028 requires the verified applied revised contract and migration identity'; END IF;
END $$;

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
    OR NOT EXISTS (
      SELECT
      FROM pg_catalog.pg_timezone_names
      WHERE name = zone
    )
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

CREATE OR REPLACE FUNCTION pathways.p06_compute_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'monitoring.read',start_on,end_on,zone);
  WITH enrolled AS MATERIALIZED (
    SELECT DISTINCT e.beneficiary_id,ben.subject_type
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=ANY(wanted_projects)
      AND e.enrollment_date<=end_on AND (e.ended_date IS NULL OR e.ended_date>=start_on)
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), participation AS MATERIALIZED (
    SELECT p.id,e.beneficiary_id,ben.subject_type,p.attendance_status
    FROM pathways.beneficiary_activity_participations p
    JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
    JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
    WHERE p.organization_id=wanted_org AND p.project_id=ANY(wanted_projects) AND p.participation_date BETWEEN start_on AND end_on
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record AND a.archived_at IS NULL AND a.status<>'CANCELLED'
      AND s.status = 'VALIDATED'
      AND NOT s.is_dummy_record
  ), activity_counts AS (
    SELECT status::text AS key,count(*) AS n FROM pathways.project_activities
    WHERE organization_id=wanted_org AND project_id=ANY(wanted_projects) AND archived_at IS NULL AND planned_end_date BETWEEN start_on AND end_on GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key,count(*) AS n FROM pathways.project_milestones
    WHERE organization_id=wanted_org AND project_id=ANY(wanted_projects) AND archived_at IS NULL AND target_date BETWEEN start_on AND end_on GROUP BY status
  ) SELECT jsonb_build_object(
    'activities',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',pathways.p06_cell(coalesce(a.n,0))) ORDER BY v.ord)
      FROM (VALUES ('NOT_STARTED','Not started',1),('IN_PROGRESS','In progress',2),('FOR_REVIEW','For review',3),('COMPLETED','Completed',4),('CANCELLED','Cancelled',5)) v(key,label,ord) LEFT JOIN activity_counts a USING(key)),
    'milestones',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',pathways.p06_cell(coalesce(m.n,0))) ORDER BY v.ord)
      FROM (VALUES ('PENDING','Pending',1),('IN_PROGRESS','In progress',2),('COMPLETED','Completed',3),('CANCELLED','Cancelled',4)) v(key,label,ord) LEFT JOIN milestone_counts m USING(key)),
    'participationRecords',pathways.p06_cell((SELECT count(*) FROM participation),CASE WHEN (SELECT count(DISTINCT beneficiary_id) FROM participation) BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END),
    'attendingIndividuals',pathways.p06_count_cell((SELECT count(DISTINCT beneficiary_id) FROM participation WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))),
    'enrolledBeneficiaryRecords',pathways.p06_count_cell((SELECT count(*) FROM enrolled)),
    'enrolledIndividuals',pathways.p06_count_cell((SELECT count(*) FROM enrolled WHERE subject_type='INDIVIDUAL'))
  ) INTO result;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE raw jsonb; result jsonb; suppress boolean; total bigint;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.saddd.read',start_on,start_on,zone);
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'beneficiaries.aggregates.read',start_on,start_on,zone);
  IF end_on IS NULL OR end_on < start_on OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid fixed project period' USING ERRCODE='22023';
  END IF;
  -- DISTINCT at the population boundary, not a sum of project enrollments.
  WITH population AS MATERIALIZED (
    SELECT DISTINCT ben.id,ben.sex::text AS sex,ben.birth_date,ben.disability_status::text AS disability,
      CASE WHEN ben.birth_date>(CURRENT_TIMESTAMP AT TIME ZONE zone)::date THEN NULL ELSE pathways.p06_age_band(ben.birth_date,end_on) END AS age
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=ANY(wanted_projects)
      AND e.enrollment_date<=end_on AND (e.ended_date IS NULL OR e.ended_date>=start_on)
      AND ben.subject_type='INDIVIDUAL' AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), eligible AS MATERIALIZED (SELECT * FROM population WHERE age IS NOT NULL), buckets AS (
    SELECT 'sex' AS dimension, v.key,v.label,v.ord,count(p.id) AS n
      FROM (VALUES ('MALE','Male',1),('FEMALE','Female',2),('OTHER','Other',3),('PREFER_NOT_TO_SAY','Prefer not to say',4),('NOT_SPECIFIED','Unknown',5)) v(key,label,ord)
      LEFT JOIN eligible p ON p.sex=v.key GROUP BY v.key,v.label,v.ord
    UNION ALL
    SELECT 'age',v.key,v.key,v.ord,count(p.id)
      FROM (VALUES ('0-9',1),('10-14',2),('15-17',3),('18-24',4),('25+',5),('Unknown',6)) v(key,ord)
      LEFT JOIN eligible p ON p.age=v.key GROUP BY v.key,v.ord
    UNION ALL
    SELECT 'disability',v.key,v.label,v.ord,count(p.id)
      FROM (VALUES ('WITH_DISABILITY','With disability',1),('WITHOUT_DISABILITY','Without disability',2),('NOT_SPECIFIED','Unknown',3)) v(key,label,ord)
      LEFT JOIN eligible p ON p.disability=v.key GROUP BY v.key,v.label,v.ord
    UNION ALL
    SELECT 'completeness','MISSING_BIRTH_DATE','Missing birth date',1,count(*) FROM eligible WHERE birth_date IS NULL
    UNION ALL
    SELECT 'completeness','INVALID_BIRTH_DATE','Excluded invalid birth date',2,count(*) FROM population WHERE age IS NULL
    UNION ALL
    SELECT 'completeness','MISSING_SEX','Unspecified sex',3,count(*) FROM eligible WHERE sex='NOT_SPECIFIED'
    UNION ALL
    SELECT 'completeness','MISSING_DISABILITY','Unspecified disability',4,count(*) FROM eligible WHERE disability='NOT_SPECIFIED'
  ) SELECT (SELECT count(*) FROM eligible), coalesce(bool_or(n BETWEEN 1 AND 4),false),
    jsonb_agg(jsonb_build_object('dimension',dimension,'key',key,'label',label,'ord',ord,'n',n)) INTO total,suppress,raw FROM buckets;
  suppress:=suppress OR total BETWEEN 1 AND 4;
  -- Conservative complementary suppression: if any cell/completeness count is small,
  -- withhold this ENTIRE release including zeros and totals. Never return hidden raw counts.
  SELECT jsonb_build_object(
    'total',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell(total) END,
    'sex',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='sex'),'[]'::jsonb),
    'age',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='age'),'[]'::jsonb),
    'disability',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='disability'),'[]'::jsonb),
    'completeness',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='completeness'),'[]'::jsonb)
  ) INTO result FROM jsonb_array_elements(raw) v;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wanted_project uuid;

  project_start date;
  project_end date;
  business_today date;

  computed jsonb;
  fingerprint text;

  prior pathways.sensitive_aggregate_releases%ROWTYPE;
BEGIN
  IF wanted_projects IS NULL
     OR cardinality(wanted_projects) <> 1
     OR wanted_projects[1] IS NULL
  THEN
    RAISE EXCEPTION
      'SADDD V1 requires exactly one project'
      USING ERRCODE='22023';
  END IF;

  wanted_project :=
    wanted_projects[1];

  IF wanted_org IS DISTINCT FROM
       nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.saddd.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;

  -- Release decisions for the same project cannot race one another.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(wanted_org::text || ':' || wanted_project::text, 0)
  );

  SELECT
    p.start_date,
    p.end_date
  INTO
    project_start,
    project_end
  FROM pathways.projects p
  WHERE p.organization_id =
        wanted_org
    AND p.id =
        wanted_project
    AND p.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Monitoring scope unavailable'
      USING ERRCODE='42501';
  END IF;

  SELECT *
  INTO prior
  FROM pathways.sensitive_aggregate_releases
  WHERE organization_id =
        wanted_org
    AND project_id =
        wanted_project
  FOR UPDATE;

  /*
   * A project receives one fixed-period release identity.
   * Changing its period later never opens a new release.
   */

  IF prior.id IS NOT NULL
     AND (
       prior.period_start
         IS DISTINCT FROM project_start
       OR prior.period_end
         IS DISTINCT FROM project_end
     )
  THEN
    UPDATE pathways.sensitive_aggregate_releases
    SET
      status =
        'STALE',
      stale_reason =
        'PROJECT_PERIOD_CHANGED',
      stale_at =
        coalesce(
          stale_at,
          CURRENT_TIMESTAMP
        ),
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id =
          prior.id;

    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  IF project_start IS NULL OR project_end IS NULL THEN
    RAISE EXCEPTION 'SADDD V1 requires fixed project dates' USING ERRCODE='22023';
  END IF;

  IF project_end < project_start OR project_end > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'SADDD V1 requires a valid persisted project period' USING ERRCODE='22023';
  END IF;

  IF start_on IS DISTINCT FROM project_start
     OR end_on IS DISTINCT FROM project_end
  THEN
    RAISE EXCEPTION 'SADDD V1 requires the persisted project period' USING ERRCODE='22023';
  END IF;

  PERFORM pathways.p06_assert_scope(
    wanted_org, wanted_projects, 'analytics.saddd.read', start_on, start_on, zone
  );
  PERFORM pathways.p06_assert_scope(
    wanted_org, wanted_projects, 'beneficiaries.aggregates.read', start_on, start_on, zone
  );

  -- The V1 business calendar is fixed by the deployed PATHWAYS policy.
  -- A caller cannot advance release by choosing another valid time zone.
  IF zone IS DISTINCT FROM 'Asia/Manila' THEN
    RAISE EXCEPTION 'SADDD V1 business time zone unavailable' USING ERRCODE='22023';
  END IF;

  business_today := (CURRENT_TIMESTAMP AT TIME ZONE zone)::date;
  IF project_end >= business_today THEN
    RAISE EXCEPTION 'SADDD V1 requires a closed project period' USING ERRCODE='22023';
  END IF;

  IF prior.id IS NOT NULL
     AND prior.status =
       'STALE'
  THEN
    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  /*
   * Private calculator remains owner-only.
   *
   * Fingerprint the protected payload and contributing source rows.
   * No Beneficiary identifiers or raw demographic rows are persisted.
   */

  -- Hash the protected result AND the contributing project enrollment/profile
  -- source. A correction inside one age band or a wholly suppressed release
  -- still changes this fingerprint; no source row is persisted in the registry.
  -- Calculate both within one SQL statement so both read one MVCC snapshot.
  SELECT protected.data, encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        protected.data::text || ':' || coalesce((
          SELECT jsonb_agg(
            jsonb_build_array(
              e.id, e.beneficiary_id, e.enrollment_date, e.ended_date,
              e.status, b.subject_type, b.sex, b.birth_date,
              b.disability_status, b.archived_at, b.is_dummy_record
            ) ORDER BY e.id
          )::text
          FROM pathways.beneficiary_project_enrollments e
          JOIN pathways.beneficiaries b
            ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
          WHERE e.organization_id=wanted_org AND e.project_id=wanted_project
        ), '[]'),
        'UTF8'
      )
    ),
    'hex'
  ) INTO computed, fingerprint
  FROM (
    SELECT pathways.p06_compute_saddd(
      wanted_org,
      ARRAY[wanted_project],
      project_start,
      project_end,
      zone
    ) AS data
  ) protected;

  IF prior.id IS NULL THEN
    INSERT INTO pathways.sensitive_aggregate_releases (
      organization_id,
      project_id,
      period_start,
      period_end,
      policy_version,
      source_fingerprint,
      status
    )
    VALUES (
      wanted_org,
      wanted_project,
      project_start,
      project_end,
      'FIXED_CLOSED_PROJECT_PERIOD_V1',
      fingerprint,
      'RELEASED'
    );

    RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
  END IF;

  IF prior.source_fingerprint
       IS DISTINCT FROM fingerprint
  THEN
    UPDATE pathways.sensitive_aggregate_releases
    SET
      status =
        'STALE',
      stale_reason =
        'SOURCE_CHANGED',
      stale_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id =
          prior.id;

    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
END
$function$;

COMMIT;
