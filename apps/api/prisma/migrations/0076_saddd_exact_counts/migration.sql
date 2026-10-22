-- 0076 Exact SADDD and reach counts (cr-pathways-saddd-exact-counts); forward migration.
-- Developer decision 2026-10-22: small-cell and complementary suppression is removed project-wide, so every count
-- is released exactly. Replaced bodies differ from their reviewed predecessors only in the suppression branches:
--  * prisma: p06_count_cell (no SMALL_COHORT), p06_compute_monitoring (participation records), p06_release_reach
--    (no complements), p06_compute_saddd (no whole-release suppression), p06_compute_indicator_value (0074 text without
--    the SMALL_COHORT branches) and p06_saddd (new releases use FIXED_CLOSED_PROJECT_PERIOD_V2; a V1 release is
--    re-released once at its current source, a STALE one stays STALE);
--  * report_projection_owner: p34_compute_indicator_value (0075 text without SMALL_COHORT) and p34_survey_report (no
--    suppression; a cached release frozen as SUPPRESSED is recomputed on read and never stored again, since the
--    release table is immutable);
--  * rules_projection_owner: project_metric_observation (0073 text without the three small-cell branches).
-- Owners, definer mode, volatility, search_path and ACLs stay unchanged (asserted below). The sensitive release policy
-- CHECK also admits V2. DBA prerequisite: hosted-saddd-exact-preprovision.sql first and hosted-saddd-exact-cleanup.sql
-- afterwards, also after a failure. No table, policy or grant changes beyond the CHECK.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; wanted record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0075_indicator_summary_measurement_lookup'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0076 requires the verified 0075 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','report_projection_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET')
 THEN RAISE EXCEPTION '0076 requires the temporary owner SET memberships (run hosted-saddd-exact-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_projection_owner','pathways_rules_internal','CREATE')
  OR (SELECT pg_catalog.pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint WHERE conname='p06_sensitive_release_policy_check'
   AND conrelid='pathways.sensitive_aggregate_releases'::pg_catalog.regclass)
   NOT IN ('CHECK ((policy_version = ''FIXED_CLOSED_PROJECT_PERIOD_V1''::text))',
    'CHECK ((policy_version = ANY (ARRAY[''FIXED_CLOSED_PROJECT_PERIOD_V1''::text, ''FIXED_CLOSED_PROJECT_PERIOD_V2''::text])))')
 THEN RAISE EXCEPTION '0076 requires the reviewed schema owners, release policy CHECK and no earlier schema CREATE'; END IF;
 -- Only the reviewed latest definitions, or this migration's own on a rerun, may be replaced; their ACLs are kept.
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways.p06_count_cell(bigint)','prisma',false,'i',ARRAY['search_path=""'],ARRAY['e9ca6c1d321d673972e0c8d981539754','4f7451a3c00b5f182909307c0ce85550']),
  (1,'pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)','prisma',true,'s',ARRAY['search_path=""'],ARRAY['a75642d7b4a548a049054fb0926f283e','5f14c468f0a161a99df99e845ec3b852']),
  (2,'pathways.p06_release_reach(jsonb)','prisma',false,'i',ARRAY['search_path=""'],ARRAY['664cd138705312a4c4141b5d258d3a53','7971e4508e7be557a456348f22c508cf']),
  (3,'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','prisma',true,'s',ARRAY['search_path=""'],ARRAY['266ce96a6e2589bcfb9591a8e2deeaac','ff0a9b9b78121d355941cee7dea104d4']),
  (4,'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','prisma',true,'s',ARRAY['search_path=""'],ARRAY['3030c91e0ce34e443ac5670716d690a4','2c9dba260db07a6fcc317c2f0cbad04a']),
  (5,'pathways.p06_saddd(uuid,uuid[],date,date,text)','prisma',true,'v',ARRAY['search_path=""'],ARRAY['02cda2a2a0b9c29b96de4f404f71efaa','6a355e3d9e24c71927d8a7136ac0450f']),
  (6,'pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)','report_projection_owner',true,'s',ARRAY['search_path=""'],ARRAY['a14c59889bae818ac6dfa7263c3d264b','65f2b6fe8bf48f7023dd435ca5888bdd']),
  (7,'pathways.p34_survey_report(uuid,uuid)','report_projection_owner',true,'v',ARRAY['search_path=""','row_security=on'],ARRAY['d82efdbfcd2332c6c2d4466efb55c941','99d2c60f0b724e55a78615c2c19fa724']),
  (8,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s',ARRAY['search_path=""'],ARRAY['6e17a7de0f8db3551710a39cb50f8288','f3638119221293b2a012ba8c06d77565'])
 ) w(n,signature,owner,definer,volatility,config,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM wanted.config
   OR NOT pg_catalog.md5(fn.prosrc)=ANY(wanted.source_md5)
  THEN RAISE EXCEPTION '0076 requires the reviewed definition of %',wanted.signature; END IF;
  PERFORM pg_catalog.set_config('pathways_0076.acl_'||wanted.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 1. The sensitive release registry admits the exact-count policy.
ALTER TABLE pathways.sensitive_aggregate_releases DROP CONSTRAINT p06_sensitive_release_policy_check;
ALTER TABLE pathways.sensitive_aggregate_releases ADD CONSTRAINT p06_sensitive_release_policy_check
  CHECK (policy_version IN ('FIXED_CLOSED_PROJECT_PERIOD_V1','FIXED_CLOSED_PROJECT_PERIOD_V2'));

-- 2. prisma-owned calculators.
CREATE OR REPLACE FUNCTION pathways.p06_count_cell(v bigint)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT pathways.p06_cell(v::numeric)
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
    'participationRecords',pathways.p06_cell((SELECT count(*) FROM participation)),
    'attendingIndividuals',pathways.p06_count_cell((SELECT count(DISTINCT beneficiary_id) FROM participation WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))),
    'enrolledBeneficiaryRecords',pathways.p06_count_cell((SELECT count(*) FROM enrolled)),
    'enrolledIndividuals',pathways.p06_count_cell((SELECT count(*) FROM enrolled WHERE subject_type='INDIVIDUAL'))
  ) INTO result;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION pathways.p06_release_reach(data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  -- Reach counts are released exactly since 0076; no complementary suppression.
  RETURN data;
END
$function$;

CREATE OR REPLACE FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE raw jsonb; result jsonb; total bigint;
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
  ) SELECT (SELECT count(*) FROM eligible),
    jsonb_agg(jsonb_build_object('dimension',dimension,'key',key,'label',label,'ord',ord,'n',n)) INTO total,raw FROM buckets;
  -- Every count is released exactly since 0076; no small-cell or complementary suppression.
  SELECT jsonb_build_object(
    'total',pathways.p06_cell(total),
    'sex',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',pathways.p06_cell((v->>'n')::numeric)) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='sex'),'[]'::jsonb),
    'age',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',pathways.p06_cell((v->>'n')::numeric)) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='age'),'[]'::jsonb),
    'disability',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',pathways.p06_cell((v->>'n')::numeric)) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='disability'),'[]'::jsonb),
    'completeness',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',pathways.p06_cell((v->>'n')::numeric)) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='completeness'),'[]'::jsonb)
  ) INTO result FROM jsonb_array_elements(raw) v;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  d pathways.project_indicators; b pathways.project_indicator_bindings; m pathways.project_indicator_measurements;
  value numeric; n bigint; denominator bigint; contributors bigint; bad bigint; result jsonb;
BEGIN
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=wanted_org AND project_id=wanted_project AND id=wanted_indicator;
  IF NOT FOUND OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid OR NOT pathways.p06_can('monitoring.read',wanted_project) THEN
    RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501';
  END IF;
  IF d.measurement_mode IS NULL THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'LEGACY_REVIEW_REQUIRED'),'measurementId',NULL,'measuredAt',NULL); END IF;
  PERFORM pathways.p06_assert_scope(wanted_org,ARRAY[wanted_project],'monitoring.read',d.period_start,d.period_end,zone);
  IF d.measurement_mode='MANUAL' THEN
    WITH ms AS MATERIALIZED (
      SELECT * FROM pathways.project_indicator_measurements z
      WHERE z.organization_id=wanted_org AND z.project_id=wanted_project AND z.indicator_id=wanted_indicator
    )
    SELECT * INTO m FROM ms x
      WHERE x.period_start=d.period_start AND x.period_end=d.period_end
        AND NOT EXISTS (SELECT FROM ms y WHERE y.corrects_measurement_id=x.id)
      ORDER BY x.recorded_at DESC,x.id DESC LIMIT 1;
    RETURN jsonb_build_object('current',pathways.p06_cell(m.value),'measurementId',m.id,'measuredAt',m.recorded_at,'measurementSource',m.source);
  END IF;
  SELECT * INTO b FROM pathways.project_indicator_bindings WHERE organization_id=wanted_org AND project_id=wanted_project AND indicator_id=wanted_indicator;
  IF NOT FOUND THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'BINDING_UNAVAILABLE'),'measurementId',NULL,'measuredAt',NULL); END IF;

  IF b.recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    WITH accepted AS (
      SELECT p.attendance_status,e.beneficiary_id,ben.subject_type
      FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
      JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
      WHERE p.organization_id=wanted_org AND p.project_id=wanted_project
        AND p.participation_date BETWEEN d.period_start AND d.period_end
        AND (b.activity_id IS NULL OR p.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND a.archived_at IS NULL AND a.status<>'CANCELLED'
        AND s.status = 'VALIDATED'
        AND NOT s.is_dummy_record
    ) SELECT count(*), count(DISTINCT beneficiary_id),
      count(DISTINCT beneficiary_id) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED')),
      count(*) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))
      INTO n,contributors,denominator,bad FROM accepted;
    IF b.recipe='PARTICIPATION_RECORD_COUNT' THEN result:=pathways.p06_cell(n);
    ELSIF b.recipe='DISTINCT_ATTENDING_INDIVIDUALS' THEN result:=pathways.p06_count_cell(denominator);
    ELSE result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(bad::numeric/denominator) END;
    END IF;
  ELSIF b.recipe='EFFECTIVE_JOURNEY_EVENT_COUNT' THEN
    -- P05 permits multiple single-level correcting events. Do not silently choose
    -- a winner or multiply a root event when those corrections are ambiguous.
    IF EXISTS (
      SELECT r.id FROM pathways.beneficiary_journey_events r
      JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id
        AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
      GROUP BY r.id HAVING count(*)>1
    ) THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'AMBIGUOUS_JOURNEY_CORRECTIONS'),'measurementId',NULL,'measuredAt',NULL); END IF;
    -- Corrections replace the root EVENT date. They do not change participation attendance/date.
    WITH effective AS (
      SELECT e.beneficiary_id,coalesce(c.event_date,r.event_date) AS event_date
      FROM pathways.beneficiary_journey_events r
      LEFT JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=r.organization_id AND e.project_id=r.project_id AND e.id=r.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND (r.participation_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_activity_participations p
          JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
          WHERE p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.id=r.participation_id
            AND s.status = 'VALIDATED'
            AND NOT s.is_dummy_record
        ))
    ) SELECT count(*),count(DISTINCT beneficiary_id) INTO n,contributors FROM effective WHERE event_date BETWEEN d.period_start AND d.period_end;
    result:=pathways.p06_cell(n);
  ELSIF b.recipe IN ('FORM_NUMERIC_SUM','FORM_NUMERIC_AVERAGE') THEN
    WITH raw AS (
      SELECT v.value #>> '{}' AS text_value, jsonb_typeof(v.value) AS json_type,
        (SELECT e.beneficiary_id FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id) AS contributor
      FROM pathways.form_submissions s
      JOIN pathways.form_response_values v ON v.organization_id=s.organization_id AND v.project_id=s.project_id AND v.form_id=s.form_id AND v.submission_id=s.id AND v.field_id=b.field_id
      WHERE s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=b.form_id AND s.form_version=b.form_version
        AND s.status='VALIDATED' AND NOT s.is_dummy_record
        AND s.submitted_at >= (d.period_start::timestamp AT TIME ZONE zone)
        AND s.submitted_at < ((d.period_end+1)::timestamp AT TIME ZONE zone)
        AND (s.enrollment_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_project_enrollments e JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
          WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        ))
    ), parsed AS (
      SELECT contributor,CASE WHEN json_type IN ('number','string') AND text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN text_value::numeric END AS number_value,
        json_type<>'null' AND NOT (json_type IN ('number','string') AND coalesce(text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$',false)) AS invalid
      FROM raw
    ) SELECT count(number_value),count(*) FILTER(WHERE invalid),
      count(DISTINCT contributor) FILTER(WHERE number_value IS NOT NULL),
      count(*) FILTER(WHERE number_value IS NOT NULL AND contributor IS NULL),
      CASE WHEN b.recipe='FORM_NUMERIC_SUM' THEN sum(number_value) ELSE avg(number_value) END
      INTO n,bad,contributors,denominator,value FROM parsed;
    result:=CASE WHEN bad>0 THEN pathways.p06_cell(NULL,'INVALID_COMMITTED_SOURCE')
      WHEN n=0 THEN pathways.p06_cell(NULL,'NO_NUMERIC_RESPONSES')
      WHEN denominator>0 THEN pathways.p06_cell(NULL,'COHORT_PROVENANCE_UNAVAILABLE')
      WHEN NOT pathways.p06_numeric_valid(round(value,4),d.numeric_kind) THEN pathways.p06_cell(NULL,'DERIVED_DOMAIN_MISMATCH')
      ELSE pathways.p06_cell(value) END;
  ELSIF b.recipe='ACTIVITY_COMPLETION_PERCENTAGE' THEN
    SELECT count(*),count(*) FILTER(WHERE status='COMPLETED') INTO denominator,n FROM pathways.project_activities
      WHERE organization_id=wanted_org AND project_id=wanted_project AND archived_at IS NULL AND status<>'CANCELLED'
        AND planned_end_date BETWEEN d.period_start AND d.period_end;
    result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(100::numeric*n/denominator) END;
  ELSE result:=pathways.p06_cell(NULL,'UNSUPPORTED_RECIPE');
  END IF;
  RETURN jsonb_build_object('current',result,'measurementId',NULL,'measuredAt',NULL);
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
  IF project_start > business_today THEN
    RAISE EXCEPTION 'SADDD requires a started project' USING ERRCODE='22023';
  END IF;

  -- An ongoing project is computed live to date and is never frozen in the release registry.
  IF project_end >= business_today THEN
    RETURN pathways.p06_compute_saddd(wanted_org, ARRAY[wanted_project], project_start, least(project_end, business_today), zone)
      || jsonb_build_object('releaseState', 'RELEASED');
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
      'FIXED_CLOSED_PROJECT_PERIOD_V2',
      fingerprint,
      'RELEASED'
    );

    RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
  END IF;

  -- A release frozen under the V1 suppression policy is re-released once with exact V2 counts (0076).
  IF prior.policy_version = 'FIXED_CLOSED_PROJECT_PERIOD_V1' THEN
    UPDATE pathways.sensitive_aggregate_releases
    SET
      policy_version =
        'FIXED_CLOSED_PROJECT_PERIOD_V2',
      source_fingerprint =
        fingerprint,
      released_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id =
          prior.id;

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

-- 3. report_projection_owner: the schema owner prisma lends CREATE for these statements only.
GRANT CREATE ON SCHEMA pathways TO report_projection_owner;
SET LOCAL ROLE report_projection_owner;
CREATE OR REPLACE FUNCTION pathways.p34_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  d pathways.project_indicators; b pathways.project_indicator_bindings; m pathways.project_indicator_measurements;
  value numeric; n bigint; denominator bigint; contributors bigint; bad bigint; result jsonb;
BEGIN
  IF session_user<>'pathways_runtime' OR wanted_org IS DISTINCT FROM pathways.runtime_context_organization()
   OR NOT pathways.p05_has_project_permission('reports.read',wanted_project)
  THEN RAISE EXCEPTION 'Report scope unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=wanted_org AND project_id=wanted_project AND id=wanted_indicator;
  IF NOT FOUND OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid OR NOT pathways.p06_can('reports.indicator.read',wanted_project) THEN
    RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501';
  END IF;
  IF d.measurement_mode IS NULL THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'LEGACY_REVIEW_REQUIRED'),'measurementId',NULL,'measuredAt',NULL); END IF;
  PERFORM pathways.p06_assert_scope(wanted_org,ARRAY[wanted_project],'reports.indicator.read',d.period_start,d.period_end,zone);
  IF d.measurement_mode='MANUAL' THEN
    WITH ms AS MATERIALIZED (
      SELECT * FROM pathways.project_indicator_measurements z
      WHERE z.organization_id=wanted_org AND z.project_id=wanted_project AND z.indicator_id=wanted_indicator
    )
    SELECT * INTO m FROM ms x
      WHERE x.period_start=d.period_start AND x.period_end=d.period_end
        AND NOT EXISTS (SELECT FROM ms y WHERE y.corrects_measurement_id=x.id)
      ORDER BY x.recorded_at DESC,x.id DESC LIMIT 1;
    RETURN jsonb_build_object('current',pathways.p06_cell(m.value),'measurementId',m.id,'measuredAt',m.recorded_at,'measurementSource',m.source);
  END IF;
  SELECT * INTO b FROM pathways.project_indicator_bindings WHERE organization_id=wanted_org AND project_id=wanted_project AND indicator_id=wanted_indicator;
  IF NOT FOUND THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'BINDING_UNAVAILABLE'),'measurementId',NULL,'measuredAt',NULL); END IF;

  IF b.recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    WITH accepted AS (
      SELECT p.attendance_status,e.beneficiary_id,ben.subject_type
      FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
      JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
      WHERE p.organization_id=wanted_org AND p.project_id=wanted_project
        AND p.participation_date BETWEEN d.period_start AND d.period_end
        AND (b.activity_id IS NULL OR p.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND a.archived_at IS NULL AND a.status<>'CANCELLED'
        AND s.status = 'VALIDATED'
        AND NOT s.is_dummy_record
    ) SELECT count(*), count(DISTINCT beneficiary_id),
      count(DISTINCT beneficiary_id) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED')),
      count(*) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))
      INTO n,contributors,denominator,bad FROM accepted;
    IF b.recipe='PARTICIPATION_RECORD_COUNT' THEN result:=pathways.p06_cell(n);
    ELSIF b.recipe='DISTINCT_ATTENDING_INDIVIDUALS' THEN result:=pathways.p06_count_cell(denominator);
    ELSE result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(bad::numeric/denominator) END;
    END IF;
  ELSIF b.recipe='EFFECTIVE_JOURNEY_EVENT_COUNT' THEN
    -- P05 permits multiple single-level correcting events. Do not silently choose
    -- a winner or multiply a root event when those corrections are ambiguous.
    IF EXISTS (
      SELECT r.id FROM pathways.beneficiary_journey_events r
      JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id
        AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
      GROUP BY r.id HAVING count(*)>1
    ) THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'AMBIGUOUS_JOURNEY_CORRECTIONS'),'measurementId',NULL,'measuredAt',NULL); END IF;
    -- Corrections replace the root EVENT date. They do not change participation attendance/date.
    WITH effective AS (
      SELECT e.beneficiary_id,coalesce(c.event_date,r.event_date) AS event_date
      FROM pathways.beneficiary_journey_events r
      LEFT JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=r.organization_id AND e.project_id=r.project_id AND e.id=r.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND (r.participation_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_activity_participations p
          JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
          WHERE p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.id=r.participation_id
            AND s.status = 'VALIDATED'
            AND NOT s.is_dummy_record
        ))
    ) SELECT count(*),count(DISTINCT beneficiary_id) INTO n,contributors FROM effective WHERE event_date BETWEEN d.period_start AND d.period_end;
    result:=pathways.p06_cell(n);
  ELSIF b.recipe IN ('FORM_NUMERIC_SUM','FORM_NUMERIC_AVERAGE') THEN
    WITH raw AS (
      SELECT v.value #>> '{}' AS text_value, jsonb_typeof(v.value) AS json_type,
        (SELECT e.beneficiary_id FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id) AS contributor
      FROM pathways.form_submissions s
      JOIN pathways.form_response_values v ON v.organization_id=s.organization_id AND v.project_id=s.project_id AND v.form_id=s.form_id AND v.submission_id=s.id AND v.field_id=b.field_id
      WHERE s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=b.form_id AND s.form_version=b.form_version
        AND s.status='VALIDATED' AND NOT s.is_dummy_record
        AND s.submitted_at >= (d.period_start::timestamp AT TIME ZONE zone)
        AND s.submitted_at < ((d.period_end+1)::timestamp AT TIME ZONE zone)
        AND (s.enrollment_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_project_enrollments e JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
          WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        ))
    ), parsed AS (
      SELECT contributor,CASE WHEN json_type IN ('number','string') AND text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN text_value::numeric END AS number_value,
        json_type<>'null' AND NOT (json_type IN ('number','string') AND coalesce(text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$',false)) AS invalid
      FROM raw
    ) SELECT count(number_value),count(*) FILTER(WHERE invalid),
      count(DISTINCT contributor) FILTER(WHERE number_value IS NOT NULL),
      count(*) FILTER(WHERE number_value IS NOT NULL AND contributor IS NULL),
      CASE WHEN b.recipe='FORM_NUMERIC_SUM' THEN sum(number_value) ELSE avg(number_value) END
      INTO n,bad,contributors,denominator,value FROM parsed;
    result:=CASE WHEN bad>0 THEN pathways.p06_cell(NULL,'INVALID_COMMITTED_SOURCE')
      WHEN n=0 THEN pathways.p06_cell(NULL,'NO_NUMERIC_RESPONSES')
      WHEN denominator>0 THEN pathways.p06_cell(NULL,'COHORT_PROVENANCE_UNAVAILABLE')
      WHEN NOT pathways.p06_numeric_valid(round(value,4),d.numeric_kind) THEN pathways.p06_cell(NULL,'DERIVED_DOMAIN_MISMATCH')
      ELSE pathways.p06_cell(value) END;
  ELSIF b.recipe='ACTIVITY_COMPLETION_PERCENTAGE' THEN
    SELECT count(*),count(*) FILTER(WHERE status='COMPLETED') INTO denominator,n FROM pathways.project_activities
      WHERE organization_id=wanted_org AND project_id=wanted_project AND archived_at IS NULL AND status<>'CANCELLED'
        AND planned_end_date BETWEEN d.period_start AND d.period_end;
    result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(100::numeric*n/denominator) END;
  ELSE result:=pathways.p06_cell(NULL,'UNSUPPORTED_RECIPE');
  END IF;
  RETURN jsonb_build_object('current',result,'measurementId',NULL,'measuredAt',NULL);
END $function$;

CREATE OR REPLACE FUNCTION pathways.p34_survey_report(wanted_project uuid, wanted_form uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'on'
AS $function$
DECLARE org uuid:=pathways.runtime_context_organization(); form record; period record; fields jsonb; cohort jsonb;
 source jsonb; fingerprint text; old_release record; aggregate_rows jsonb:='[]'; field jsonb; row jsonb; value jsonb; source_bytes bigint;
 respondents bigint; answered bigint; missing bigint; yes_count bigint; no_count bigint; total numeric; number numeric;
 result jsonb; unavailable jsonb:=jsonb_build_object('state','MISSING','respondents',NULL,'fields','[]'::jsonb);
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF current_setting('transaction_isolation') NOT IN('repeatable read','serializable')
 THEN RAISE EXCEPTION 'Survey reporting requires a consistent transaction snapshot' USING ERRCODE='25001'; END IF;
 IF NOT pathways.p34_can_survey(wanted_project) THEN RAISE EXCEPTION 'Survey aggregate scope unavailable' USING ERRCODE='42501'; END IF;
 SELECT p.start_date,p.end_date INTO period FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project AND p.archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Survey project unavailable' USING ERRCODE='42501'; END IF;
 SELECT f.id,f.version,f.code,f.name INTO form FROM pathways.digital_forms f WHERE f.organization_id=org AND f.project_id=wanted_project AND f.id=wanted_form AND f.status='PUBLISHED' AND f.form_type='TRAINING_SURVEY'
 AND NOT EXISTS(SELECT FROM pathways.digital_forms newer WHERE newer.organization_id=f.organization_id AND newer.project_id=f.project_id AND newer.code=f.code AND newer.version>f.version AND newer.status='PUBLISHED');
 IF NOT FOUND THEN RAISE EXCEPTION 'Published survey form unavailable' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.sequence_no,f.id),'[]') INTO fields FROM
 (SELECT f.id,f.code,f.label,f.data_type,f.sequence_no FROM pathways.form_fields f WHERE f.organization_id=org
 AND f.project_id=wanted_project AND f.form_id=wanted_form ORDER BY f.sequence_no,f.id LIMIT 101) f;
 IF jsonb_array_length(fields)>100 THEN RAISE EXCEPTION 'Survey aggregate field bound exceeded' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(fields)=0 THEN RETURN unavailable; END IF;
 -- Bound raw aggregate input bytes before constructing the internal cohort JSON.
 WITH eligible AS(SELECT DISTINCT ON(e.beneficiary_id) s.id,s.submitted_at,e.beneficiary_id
 FROM pathways.form_submissions s JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.beneficiary_id=s.beneficiary_id AND e.status='ACTIVE' AND e.ended_date IS NULL
 JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
 WHERE s.organization_id=org AND s.project_id=wanted_project AND s.form_id=wanted_form AND s.form_version=form.version
 AND s.status='VALIDATED' AND NOT s.is_dummy_record AND s.submitted_at IS NOT NULL
 AND b.subject_type='INDIVIDUAL' AND NOT b.is_dummy_record AND b.archived_at IS NULL AND b.consent_recorded AND b.data_processing_consent_recorded
 ORDER BY e.beneficiary_id,s.submitted_at DESC,s.id DESC LIMIT 10001)
 SELECT (SELECT count(*) FROM eligible),coalesce(sum(octet_length(v.value::text)),0) INTO respondents,source_bytes
 FROM eligible e LEFT JOIN pathways.form_response_values v ON v.organization_id=org AND v.project_id=wanted_project
 AND v.form_id=wanted_form AND v.submission_id=e.id AND v.field_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(fields) x);
 IF respondents>10000 OR source_bytes>2097152 THEN RAISE EXCEPTION 'Survey aggregate source bound exceeded' USING ERRCODE='22023'; END IF;
 -- Only the latest validated contribution per actual individual, at fixed server-side scope.
 WITH eligible AS(SELECT DISTINCT ON(e.beneficiary_id) s.id,s.submitted_at,e.beneficiary_id
 FROM pathways.form_submissions s JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.beneficiary_id=s.beneficiary_id AND e.status='ACTIVE' AND e.ended_date IS NULL
 JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
 WHERE s.organization_id=org AND s.project_id=wanted_project AND s.form_id=wanted_form AND s.form_version=form.version
 AND s.status='VALIDATED' AND NOT s.is_dummy_record AND b.subject_type='INDIVIDUAL' AND NOT b.is_dummy_record AND b.archived_at IS NULL AND b.consent_recorded AND b.data_processing_consent_recorded
 AND s.submitted_at IS NOT NULL
 ORDER BY e.beneficiary_id,s.submitted_at DESC,s.id DESC LIMIT 10001)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'beneficiary',e.beneficiary_id,'submittedAt',e.submitted_at,'values',
 (SELECT coalesce(jsonb_object_agg(v.field_id::text,v.value),'{}') FROM pathways.form_response_values v
 WHERE v.organization_id=org AND v.project_id=wanted_project AND v.form_id=wanted_form AND v.submission_id=e.id
 AND v.field_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(fields) x))) ORDER BY e.beneficiary_id),'[]') INTO cohort FROM eligible e;
 respondents:=jsonb_array_length(cohort);
 IF respondents>10000 OR octet_length(cohort::text)>2097152 OR octet_length(fields::text)>2097152
 THEN RAISE EXCEPTION 'Survey aggregate source bound exceeded' USING ERRCODE='22023'; END IF;
 source:=jsonb_build_object('form',to_jsonb(form),'fields',fields,'cohort',cohort);
 fingerprint:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pathways:survey-release:'||org||':'||wanted_project||':'||form.code,0));
 SELECT r.* INTO old_release FROM pathways.survey_aggregate_releases r WHERE r.organization_id=org AND r.project_id=wanted_project AND r.form_code=form.code;
 IF FOUND THEN
  IF old_release.source_hash<>fingerprint THEN RETURN jsonb_build_object('state','STALE','respondents',NULL,'fields','[]'::jsonb); END IF;
  -- A release frozen while suppression applied is recomputed exactly on each read and never stored again (0076).
  IF old_release.payload->>'state'<>'SUPPRESSED' THEN RETURN old_release.payload; END IF;
 END IF;
 FOR field IN SELECT x FROM jsonb_array_elements(fields) x LOOP
  answered:=0;yes_count:=0;no_count:=0;total:=0;
  FOR row IN SELECT x FROM jsonb_array_elements(cohort) x LOOP
   value:=row->'values'->(field->>'id'); number:=NULL;
   IF field->>'data_type'='BOOLEAN' THEN
    IF jsonb_typeof(value)='boolean' THEN answered:=answered+1;
     IF value='true'::jsonb THEN yes_count:=yes_count+1; ELSE no_count:=no_count+1; END IF;
    END IF;
   ELSIF jsonb_typeof(value) IN('number','string') AND (value#>>'{}') ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN
    number:=(value#>>'{}')::numeric;
    IF pathways.p06_numeric_valid(number,'SIGNED_CHANGE') AND (field->>'data_type'<>'INTEGER' OR trunc(number)=number)
    THEN answered:=answered+1;total:=total+number; END IF;
   END IF;
  END LOOP;
  missing:=respondents-answered;
  aggregate_rows:=aggregate_rows||jsonb_build_array(jsonb_build_object('code',field->>'code','label',field->>'label','type',field->>'data_type',
   'answered',answered,'missing',missing,'trueCount',CASE WHEN field->>'data_type'='BOOLEAN' THEN yes_count END,
   'falseCount',CASE WHEN field->>'data_type'='BOOLEAN' THEN no_count END,
   'mean',CASE WHEN field->>'data_type'<>'BOOLEAN' AND answered>0 THEN round(total/answered,4) END,
   'meanState',CASE WHEN field->>'data_type'='BOOLEAN' OR answered=0 THEN 'MISSING' ELSE 'AVAILABLE' END));
 END LOOP;
 result:=jsonb_build_object('state','AVAILABLE','formId',form.id,'formVersion',form.version,
 'respondents',respondents,'fields',aggregate_rows);
 IF old_release.source_hash IS NULL THEN
  INSERT INTO pathways.survey_aggregate_releases(organization_id,project_id,form_id,form_version,form_code,source_hash,payload)
  VALUES(org,wanted_project,wanted_form,form.version,form.code,fingerprint,result);
 END IF;
 RETURN result;
END $function$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM report_projection_owner;

-- 4. rules_projection_owner: the schema owner rules_store_owner lends CREATE for this statement only.
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_projection_owner;
RESET ROLE;
SET LOCAL ROLE rules_projection_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.project_metric_observation(org uuid, project uuid, metric text, indicator uuid, activity uuid, as_of timestamp with time zone, day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE cell jsonb;current_cell jsonb;unit text;start_on date;end_on date;project_status text;archived timestamptz;
 definition record;actual numeric;population bigint;completed bigint;missing bigint;overdue bigint;days integer;
 planned numeric;approved numeric;currencies bigint;follow bigint;mean numeric;
 facts jsonb:='{}';due bigint;no_end bigint;bound_start date;bound_end date;
 total numeric;scored bigint;members bigint;done bigint;
BEGIN
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true OR as_of IS NULL OR day IS NULL
  OR metric NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT',
   'PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
   'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
   'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT')
  OR ((metric LIKE 'INDICATOR_%') IS DISTINCT FROM (indicator IS NOT NULL))
  OR ((metric='ACTIVITY_OVERDUE_DAYS') IS DISTINCT FROM (activity IS NOT NULL)) THEN
  RAISE EXCEPTION 'Metric projection unavailable' USING ERRCODE='42501'; END IF;
 IF metric LIKE 'INDICATOR_%' THEN
  unit:=CASE WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN 'PERCENT' ELSE 'VALUE' END;
  IF pathways_rules_internal.lease_indicator_allowed(org,project,indicator) IS DISTINCT FROM true THEN
   cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
  ELSE
   SELECT i.measurement_mode,i.numeric_kind,i.direction,i.unit_label,i.baseline_value,i.target_value,i.period_start,i.period_end,
    i.target_date INTO definition FROM pathways.project_indicators i WHERE i.id=indicator AND i.organization_id=org AND i.project_id=project;
   IF NOT FOUND THEN RAISE EXCEPTION 'Indicator projection unavailable' USING ERRCODE='42501'; END IF;
   IF metric='INDICATOR_CURRENT_VALUE' THEN unit:=COALESCE(definition.unit_label,'VALUE'); END IF;
   IF definition.measurement_mode='MANUAL' THEN
    SELECT m.value INTO actual FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
     AND m.indicator_id=indicator AND m.period_start=definition.period_start AND m.period_end=definition.period_end AND m.recorded_at<=as_of
     AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements next_measurement WHERE next_measurement.organization_id=org
      AND next_measurement.project_id=project AND next_measurement.indicator_id=indicator AND next_measurement.corrects_measurement_id=m.id
      AND next_measurement.recorded_at<=as_of) ORDER BY m.recorded_at DESC,m.id DESC LIMIT 1;
    current_cell:=CASE WHEN actual IS NULL THEN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT')
     ELSE pathways_rules_internal.numeric_cell(actual) END;
   ELSE
    SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED') INTO population,completed FROM pathways.project_activities a
     WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
      AND a.planned_end_date BETWEEN definition.period_start AND definition.period_end;
    IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
    current_cell:=CASE WHEN population=0 THEN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR')
     ELSE pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER') END;
   END IF;
   IF current_cell->>'value' IS NOT NULL AND (
    definition.numeric_kind NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
    OR (definition.numeric_kind<>'SIGNED_CHANGE' AND (current_cell->>'value')::numeric<0)
    OR (definition.numeric_kind='COUNT' AND (current_cell->>'value')::numeric<>pg_catalog.trunc((current_cell->>'value')::numeric))
    OR (definition.numeric_kind='PERCENTAGE' AND (current_cell->>'value')::numeric>100)) THEN
    current_cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC'); END IF;
   cell:=CASE WHEN metric='INDICATOR_CURRENT_VALUE' OR current_cell->>'value' IS NULL THEN current_cell
    ELSE pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
     definition.target_value::text,definition.direction) END;
   -- Severity facts (0072): converted progress and the dates that set when full progress is expected.
   facts:=pg_catalog.jsonb_build_object('progress',CASE WHEN current_cell->>'value' IS NULL THEN NULL
     WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN cell->>'value'
     ELSE pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
      definition.target_value::text,definition.direction)->>'value' END,
    'targetDate',CASE WHEN definition.target_date BETWEEN date '1900-01-01' AND date '2100-12-31' THEN definition.target_date END,
    'periodEnd',CASE WHEN definition.period_end BETWEEN date '1900-01-01' AND date '2100-12-31' THEN definition.period_end END);
  END IF;
 ELSIF metric LIKE 'PROJECT_%' THEN
  unit:=CASE WHEN metric='PROJECT_TIMELINE_ELAPSED_PERCENT' THEN 'PERCENT' ELSE 'DAYS' END;
  SELECT p.start_date,p.end_date,p.status::text,p.archived_at INTO start_on,end_on,project_status,archived
   FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF start_on IS NULL OR end_on IS NULL THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSIF start_on>end_on OR start_on<date '1900-01-01' OR end_on>date '2100-12-31' THEN
   cell:=pathways_rules_internal.unavailable_cell('INVALID_DATES');
  ELSIF metric='PROJECT_REMAINING_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(end_on-day);
  ELSIF metric='PROJECT_OVERDUE_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(GREATEST(0,day-end_on));
  ELSIF end_on=start_on THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
  ELSE cell:=pathways_rules_internal.progress_cell(GREATEST(0,day-start_on)::text,'0',(end_on-start_on)::text,'HIGHER_IS_BETTER'); END IF;
  facts:=pg_catalog.jsonb_build_object('startDate',CASE WHEN start_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN start_on END,
   'endDate',CASE WHEN end_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN end_on END);
 ELSIF metric IN ('BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
  'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN
  -- Project-level aggregates (0060, 0073): no bindings, no per-row output, every read is lease and family scoped.
  unit:=CASE WHEN metric='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN 'POINTS' ELSE 'PERCENT' END;
  SELECT p.status::text,p.archived_at INTO project_status,archived FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF pathways_rules_internal.lease_family_allowed(org,project,CASE metric WHEN 'BUDGET_UTILIZATION_PERCENT' THEN 'BUDGET'
   WHEN 'BENEFICIARY_FOLLOW_UP_PERCENT' THEN 'BENEFICIARY' WHEN 'KPI_ACHIEVEMENT_PERCENT' THEN 'KPI' ELSE 'SURVEY' END) IS DISTINCT FROM true THEN
   cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
  ELSIF metric='BUDGET_UTILIZATION_PERCENT' THEN
   -- Approved expense total over the planned total of non-archived records; range is checked before any decimal parse.
   SELECT count(*),count(DISTINCT r.currency),COALESCE(sum(r.planned_budget),0) INTO population,currencies,planned
    FROM pathways.project_budget_records r WHERE r.organization_id=org AND r.project_id=project AND r.archived_at IS NULL;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF currencies>1 THEN cell:=pathways_rules_internal.unavailable_cell('UNSUPPORTED_SOURCE');
   ELSIF planned=0 THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
   ELSE
    SELECT COALESCE(sum(e.amount),0) INTO approved FROM pathways.budget_expense_entries e
     JOIN pathways.project_budget_records r ON r.organization_id=e.organization_id AND r.project_id=e.project_id AND r.id=e.budget_record_id
     WHERE e.organization_id=org AND e.project_id=project AND e.status='APPROVED' AND r.archived_at IS NULL;
    IF planned<0 OR approved<0 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
    ELSIF planned>=100000000000000 OR approved>=100000000000000 THEN cell:=pathways_rules_internal.unavailable_cell('PROGRESS_OUT_OF_RANGE');
    ELSE cell:=pathways_rules_internal.progress_cell(approved::text,'0',planned::text,'HIGHER_IS_BETTER'); END IF;
   END IF;
  ELSIF metric='BENEFICIARY_FOLLOW_UP_PERCENT' THEN
   -- Share of ACTIVE enrollments whose latest participation needs follow-up; released exactly since 0076.
   WITH latest AS (SELECT DISTINCT ON (en.id) pa.progress_status FROM pathways.beneficiary_project_enrollments en
     JOIN pathways.beneficiary_activity_participations pa ON pa.organization_id=en.organization_id AND pa.project_id=en.project_id
      AND pa.enrollment_id=en.id
     WHERE en.organization_id=org AND en.project_id=project AND en.status='ACTIVE'
     ORDER BY en.id,pa.participation_date DESC,pa.recorded_at DESC,pa.id DESC)
   SELECT count(*),count(*) FILTER(WHERE l.progress_status='NEEDS_FOLLOW_UP') INTO population,follow FROM latest l;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSE cell:=pathways_rules_internal.progress_cell(follow::text,'0',population::text,'HIGHER_IS_BETTER'); END IF;
  ELSIF metric='KPI_ACHIEVEMENT_PERCENT' THEN
   -- Mean baseline-to-target progress of non-archived indicators with a visible value, to tenths as on the overview (0073).
   SELECT count(*) INTO population FROM pathways.project_indicators i
    WHERE i.organization_id=org AND i.project_id=project AND i.archived_at IS NULL;
   IF population>100 THEN RAISE EXCEPTION 'Indicator projection exceeds approved bound' USING ERRCODE='54000'; END IF;
   scored:=0;total:=0;
   FOR definition IN SELECT i.id,i.measurement_mode,i.numeric_kind,i.direction,i.baseline_value,i.target_value,i.period_start,i.period_end
    FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project AND i.archived_at IS NULL ORDER BY i.id LOOP
    -- The current value follows the bound indicator branch above.
    IF definition.measurement_mode='MANUAL' THEN
     SELECT m.value INTO actual FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
      AND m.indicator_id=definition.id AND m.period_start=definition.period_start AND m.period_end=definition.period_end AND m.recorded_at<=as_of
      AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements next_measurement WHERE next_measurement.organization_id=org
       AND next_measurement.project_id=project AND next_measurement.indicator_id=definition.id AND next_measurement.corrects_measurement_id=m.id
       AND next_measurement.recorded_at<=as_of) ORDER BY m.recorded_at DESC,m.id DESC LIMIT 1;
     current_cell:=CASE WHEN actual IS NULL THEN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT')
      ELSE pathways_rules_internal.numeric_cell(actual) END;
    ELSE
     SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED') INTO members,done FROM pathways.project_activities a
      WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
       AND a.planned_end_date BETWEEN definition.period_start AND definition.period_end;
     IF members>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
     current_cell:=CASE WHEN members=0 THEN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR')
      ELSE pathways_rules_internal.progress_cell(done::text,'0',members::text,'HIGHER_IS_BETTER') END;
    END IF;
    IF current_cell->>'value' IS NOT NULL AND NOT (
     definition.numeric_kind NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
     OR (definition.numeric_kind<>'SIGNED_CHANGE' AND (current_cell->>'value')::numeric<0)
     OR (definition.numeric_kind='COUNT' AND (current_cell->>'value')::numeric<>pg_catalog.trunc((current_cell->>'value')::numeric))
     OR (definition.numeric_kind='PERCENTAGE' AND (current_cell->>'value')::numeric>100)) THEN
     current_cell:=pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
      definition.target_value::text,definition.direction);
     IF current_cell->>'value' IS NOT NULL THEN scored:=scored+1;total:=total+(current_cell->>'value')::numeric; END IF;
    END IF;
   END LOOP;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF scored=0 THEN cell:=pathways_rules_internal.unavailable_cell('NO_MEASUREMENT');
   ELSE
    mean:=pg_catalog.round(total/scored,1);
    cell:=CASE WHEN pg_catalog.abs(mean)>99999999999999 THEN pathways_rules_internal.unavailable_cell('PROGRESS_OUT_OF_RANGE')
     ELSE pathways_rules_internal.numeric_cell(mean) END;
   END IF;
  ELSIF metric IN ('SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN
   -- Mean of each ACTIVE enrollment's latest valid pre-test or post-test score on a 0 to 100 scale (0073).
   WITH latest AS (SELECT DISTINCT ON (ar.enrollment_id) ar.score*100/ar.maximum_score AS pct FROM pathways.assessment_results ar
     JOIN pathways.beneficiary_project_enrollments en ON en.organization_id=ar.organization_id AND en.project_id=ar.project_id
      AND en.id=ar.enrollment_id
     WHERE ar.organization_id=org AND ar.project_id=project AND en.status='ACTIVE'
      AND ar.type::text=CASE metric WHEN 'SURVEY_MEAN_PRE_TEST_PERCENT' THEN 'PRE_TEST' ELSE 'POST_TEST' END
      AND ar.score<>'NaN'::numeric AND ar.maximum_score<>'NaN'::numeric AND ar.maximum_score>0
     ORDER BY ar.enrollment_id,ar.assessment_date DESC,ar.id DESC)
   SELECT count(*),pg_catalog.round(avg(l.pct),4) INTO population,mean FROM latest l;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF mean IS NULL OR mean<0 OR mean>100 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
   ELSE cell:=pathways_rules_internal.numeric_cell(mean); END IF;
  ELSE
   -- Mean of post minus pre percentage points over each enrollment's latest valid PRE_TEST and POST_TEST (0045 validity).
   WITH valid AS (SELECT ar.id,ar.enrollment_id,ar.type,ar.assessment_date,ar.score,ar.maximum_score FROM pathways.assessment_results ar
     WHERE ar.organization_id=org AND ar.project_id=project AND ar.type IN ('PRE_TEST','POST_TEST') AND ar.enrollment_id IS NOT NULL
      AND ar.score<>'NaN'::numeric AND ar.maximum_score<>'NaN'::numeric AND ar.maximum_score>0),
    latest AS (SELECT DISTINCT ON (v.enrollment_id,v.type) v.enrollment_id,v.type,v.score*100/v.maximum_score AS pct FROM valid v
     ORDER BY v.enrollment_id,v.type,v.assessment_date DESC,v.id DESC)
   SELECT count(*),pg_catalog.round(avg(post.pct-pre.pct),4) INTO population,mean FROM latest pre
    JOIN latest post ON post.enrollment_id=pre.enrollment_id AND pre.type='PRE_TEST' AND post.type='POST_TEST';
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF mean IS NULL OR mean<-100 OR mean>100 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
   ELSE cell:=pathways_rules_internal.numeric_cell(mean); END IF;
  END IF;
 ELSE
  unit:=CASE WHEN metric='ACTIVITY_COMPLETION_PERCENT' THEN 'PERCENT' WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END;
  SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED'),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND (a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31')),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND a.planned_end_date<day),
   max(CASE WHEN a.status='COMPLETED' THEN 0 ELSE GREATEST(0,day-a.planned_end_date) END),
   count(*) FILTER(WHERE a.planned_end_date BETWEEN date '1900-01-01' AND date '2100-12-31' AND a.planned_end_date<=day),
   count(*) FILTER(WHERE a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31'),
   min(a.planned_start_date),min(a.planned_end_date)
   INTO population,completed,missing,overdue,days,due,no_end,bound_start,bound_end FROM pathways.project_activities a
   WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
    AND (activity IS NULL OR a.id=activity);
  IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
  IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
  ELSIF metric='ACTIVITY_COMPLETION_PERCENT' THEN cell:=pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER');
  ELSIF missing>0 THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSE cell:=pathways_rules_internal.numeric_cell(CASE WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN overdue ELSE days END); END IF;
  -- Every included activity counts toward the totals, completed ones too; a bound activity also gives its planned dates.
  facts:=pg_catalog.jsonb_build_object('included',population,'dueByDate',due,'missingEnd',no_end)
   ||CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN pg_catalog.jsonb_build_object(
    'activityStart',CASE WHEN bound_start BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_start END,
    'activityEnd',CASE WHEN bound_end BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_end END) ELSE '{}'::jsonb END;
 END IF;
 PERFORM pathways_rules_internal.validate_metric_cell(cell);
 RETURN pg_catalog.jsonb_build_object('metric',metric,'cell',cell,'unit',unit,
  'facts',pg_catalog.jsonb_build_object('metric',metric,'value',cell->'value','reportingDate',day)||facts);
END $function$;
RESET ROLE;
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_projection_owner;
RESET ROLE;

-- 5. Postconditions: the reviewed bodies, owners, definer mode, volatility, settings, saved ACLs and no lent CREATE.
DO $$ DECLARE fn record; wanted record; BEGIN
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways.p06_count_cell(bigint)','prisma',false,'i',ARRAY['search_path=""'],'4f7451a3c00b5f182909307c0ce85550'),
  (1,'pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)','prisma',true,'s',ARRAY['search_path=""'],'5f14c468f0a161a99df99e845ec3b852'),
  (2,'pathways.p06_release_reach(jsonb)','prisma',false,'i',ARRAY['search_path=""'],'7971e4508e7be557a456348f22c508cf'),
  (3,'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','prisma',true,'s',ARRAY['search_path=""'],'ff0a9b9b78121d355941cee7dea104d4'),
  (4,'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','prisma',true,'s',ARRAY['search_path=""'],'2c9dba260db07a6fcc317c2f0cbad04a'),
  (5,'pathways.p06_saddd(uuid,uuid[],date,date,text)','prisma',true,'v',ARRAY['search_path=""'],'6a355e3d9e24c71927d8a7136ac0450f'),
  (6,'pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)','report_projection_owner',true,'s',ARRAY['search_path=""'],'65f2b6fe8bf48f7023dd435ca5888bdd'),
  (7,'pathways.p34_survey_report(uuid,uuid)','report_projection_owner',true,'v',ARRAY['search_path=""','row_security=on'],'99d2c60f0b724e55a78615c2c19fa724'),
  (8,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s',ARRAY['search_path=""'],'f3638119221293b2a012ba8c06d77565')
 ) w(n,signature,owner,definer,volatility,config,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM wanted.config
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
   OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0076.acl_'||wanted.n)
  THEN RAISE EXCEPTION '0076 replaced function postcondition failed for %',wanted.signature; END IF;
 END LOOP;
 IF pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_projection_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0076 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
