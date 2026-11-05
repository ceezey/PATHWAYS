-- 0087 public tracker analytics (cr-pathways-public-tracker-media-analytics sections 3.5 and 3.7); forward migration.
-- Each gated analytics function keeps its actor and permission checks and then calls an actor-free core holding its old body,
-- so the public page and the internal views compute from one implementation. The cores are prisma-owned definers that only
-- other prisma functions execute. p85_publication_views accepts the five public views, and p87_public_view answers one view
-- of a live revision with no actor, as prisma, which reads the forced-RLS sources it needs through live-view policies.
-- Owner, security mode, volatility, search_path and ACL of every replaced function stay unchanged (asserted below).
-- No new table, role or owner-role change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0086_public_tracker_media'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0087 requires the verified 0086 state and migration identity'; END IF;
 -- The live-view policies go on prisma-owned tables under forced row security; no p87 function or policy exists yet.
 IF (SELECT count(*) FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND relforcerowsecurity
   AND oid IN ('pathways.project_publications'::pg_catalog.regclass,'pathways.sensitive_aggregate_releases'::pg_catalog.regclass,
    'pathways.project_indicator_bindings'::pg_catalog.regclass,'pathways.project_indicator_measurements'::pg_catalog.regclass))<>4
  OR EXISTS(SELECT FROM pg_catalog.pg_proc WHERE pronamespace='pathways'::pg_catalog.regnamespace AND proname LIKE 'p87\_%')
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname LIKE 'p87\_%')
 THEN RAISE EXCEPTION '0087 requires prisma-owned forced-RLS sources and no earlier p87 objects'; END IF;
 -- Only the reviewed definitions may be replaced; their ACLs are kept.
 FOR fn IN SELECT w.n, w.sig, w.md5, w.vol, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways.p85_publication_views(jsonb)','6564e1a84c28cf83cbbf23bc98eeab1b','i'),
   (1,'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','ff0a9b9b78121d355941cee7dea104d4','s'),
   (2,'pathways.p06_saddd(uuid,uuid[],date,date,text)','6a355e3d9e24c71927d8a7136ac0450f','v'),
   (3,'pathways.p06_saddd_by_place(uuid,uuid,text)','d27955ca2dfed634e337ceabf4850399','s'),
   (4,'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','2c9dba260db07a6fcc317c2f0cbad04a','s'),
   (5,'pathways.p06_indicator_values(uuid,text)','8d89974bf5632a2b5e2e99a6c5735141','s'),
   (6,'pathways.p10_f9_timeline_aggregate(uuid,uuid,date)','3cce9cf594fcc6123b1fff49b176ba0d','s'),
   (7,'pathways.p10_f9_timeline_last_completion(uuid,uuid)','0856ec76564f9786147488db63961898','s'),
   (8,'pathways.p06_participation_breakdown(uuid,date,date)','18e89eb9b6b9d4eaea9b2b3a4072be97','s')) w(n,sig,md5,vol)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR NOT fn.prosecdef OR fn.provolatile<>fn.vol
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>fn.md5
  THEN RAISE EXCEPTION '0087 requires the reviewed definition of %',fn.sig; END IF;
  PERFORM pg_catalog.set_config('pathways_0087.acl_'||fn.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,87);

-- 1. The view validator: unique values from the five public views, in display order.
CREATE OR REPLACE FUNCTION pathways.p85_publication_views(views jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF pg_catalog.jsonb_typeof(views) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Public view selection unavailable' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.jsonb_array_elements(views) v(item) WHERE pg_catalog.jsonb_typeof(v.item)<>'string'
   OR v.item#>>'{}' NOT IN ('kpi','saddd','participation','timeline','map'))
  OR (SELECT count(DISTINCT v.item) FROM pg_catalog.jsonb_array_elements(views) v(item))<>pg_catalog.jsonb_array_length(views)
 THEN RAISE EXCEPTION 'Public view selection unavailable' USING ERRCODE='23514'; END IF;
 RETURN views;
END $$;

-- 2. SADDD: the calculator body without its actor checks, and the release fingerprint p06_saddd and the public read share.
CREATE FUNCTION pathways.p87_saddd_core(org uuid, project uuid, start_on date, end_on date, zone text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb; result jsonb; total bigint;
BEGIN
  -- The period checks p06_assert_scope made for the calculator, without its actor checks.
  IF start_on IS NULL OR start_on < DATE '1900-01-01' OR start_on > DATE '2100-12-31'
     OR zone IS NULL OR length(zone) > 100 OR NOT pathways.p06_zone_is_valid(zone) THEN
    RAISE EXCEPTION 'Invalid bounded monitoring period' USING ERRCODE='22023';
  END IF;
  IF end_on IS NULL OR end_on < start_on OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid fixed project period' USING ERRCODE='22023';
  END IF;
  -- DISTINCT at the population boundary, not a sum of project enrollments.
  WITH population AS MATERIALIZED (
    SELECT DISTINCT ben.id,ben.sex::text AS sex,ben.birth_date,ben.disability_status::text AS disability,
      CASE WHEN ben.birth_date>(CURRENT_TIMESTAMP AT TIME ZONE zone)::date THEN NULL ELSE pathways.p06_age_band(ben.birth_date,end_on) END AS age
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=org AND e.project_id=project
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
END $$;

-- Hashes the protected result and the contributing enrollment and profile rows, exactly as p06_saddd did inline before 0087.
CREATE FUNCTION pathways.p87_saddd_fingerprint(org uuid, project uuid, data jsonb) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(data::text || ':' || coalesce((
  SELECT jsonb_agg(jsonb_build_array(e.id, e.beneficiary_id, e.enrollment_date, e.ended_date, e.status, b.subject_type, b.sex,
    b.birth_date, b.disability_status, b.archived_at, b.is_dummy_record) ORDER BY e.id)::text
  FROM pathways.beneficiary_project_enrollments e
  JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
  WHERE e.organization_id=org AND e.project_id=project), '[]'), 'UTF8')), 'hex')
$$;

-- The calculator keeps its checks, now for exactly one project, and calls the core.
CREATE OR REPLACE FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.saddd.read',start_on,start_on,zone);
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'beneficiaries.aggregates.read',start_on,start_on,zone);
  IF end_on IS NULL OR end_on < start_on OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid fixed project period' USING ERRCODE='22023';
  END IF;
  IF cardinality(wanted_projects) <> 1 THEN
    RAISE EXCEPTION 'SADDD V1 requires exactly one project' USING ERRCODE='22023';
  END IF;
  RETURN pathways.p87_saddd_core(wanted_org,wanted_projects[1],start_on,end_on,zone);
END $$;

-- The release keeps its checks and release write path (0076); it calls the core where it called the calculator (marked 0087).
CREATE OR REPLACE FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  wanted_project uuid; project_start date; project_end date; business_today date;
  computed jsonb; fingerprint text; prior pathways.sensitive_aggregate_releases%ROWTYPE;
BEGIN
  IF wanted_projects IS NULL OR cardinality(wanted_projects) <> 1 OR wanted_projects[1] IS NULL THEN
    RAISE EXCEPTION 'SADDD V1 requires exactly one project' USING ERRCODE='22023';
  END IF;
  wanted_project := wanted_projects[1];
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.saddd.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;
  -- Release decisions for the same project cannot race one another.
  PERFORM pg_advisory_xact_lock(hashtextextended(wanted_org::text || ':' || wanted_project::text, 0));
  SELECT p.start_date, p.end_date INTO project_start, project_end FROM pathways.projects p
  WHERE p.organization_id = wanted_org AND p.id = wanted_project AND p.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM pathways.sensitive_aggregate_releases
  WHERE organization_id = wanted_org AND project_id = wanted_project FOR UPDATE;
  -- A project receives one fixed-period release identity. Changing its period later never opens a new release.
  IF prior.id IS NOT NULL AND (prior.period_start IS DISTINCT FROM project_start OR prior.period_end IS DISTINCT FROM project_end) THEN
    UPDATE pathways.sensitive_aggregate_releases SET status = 'STALE', stale_reason = 'PROJECT_PERIOD_CHANGED',
      stale_at = coalesce(stale_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = prior.id;
    RETURN pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  END IF;
  IF project_start IS NULL OR project_end IS NULL THEN
    RAISE EXCEPTION 'SADDD V1 requires fixed project dates' USING ERRCODE='22023';
  END IF;
  IF project_end < project_start OR project_end > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'SADDD V1 requires a valid persisted project period' USING ERRCODE='22023';
  END IF;
  IF start_on IS DISTINCT FROM project_start OR end_on IS DISTINCT FROM project_end THEN
    RAISE EXCEPTION 'SADDD V1 requires the persisted project period' USING ERRCODE='22023';
  END IF;
  PERFORM pathways.p06_assert_scope(wanted_org, wanted_projects, 'analytics.saddd.read', start_on, start_on, zone);
  PERFORM pathways.p06_assert_scope(wanted_org, wanted_projects, 'beneficiaries.aggregates.read', start_on, start_on, zone);
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
    RETURN pathways.p87_saddd_core(wanted_org, wanted_project, project_start, least(project_end, business_today), zone)
      || jsonb_build_object('releaseState', 'RELEASED');
  END IF;
  IF prior.id IS NOT NULL AND prior.status = 'STALE' THEN
    RETURN pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  END IF;
  -- The result and its fingerprint come from one statement, so both read one MVCC snapshot.
  SELECT protected.data, pathways.p87_saddd_fingerprint(wanted_org, wanted_project, protected.data) INTO computed, fingerprint
  FROM (SELECT pathways.p87_saddd_core(wanted_org, wanted_project, project_start, project_end, zone) AS data) protected;
  IF prior.id IS NULL THEN
    INSERT INTO pathways.sensitive_aggregate_releases (organization_id, project_id, period_start, period_end, policy_version,
      source_fingerprint, status)
    VALUES (wanted_org, wanted_project, project_start, project_end, 'FIXED_CLOSED_PROJECT_PERIOD_V2', fingerprint, 'RELEASED');
    RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
  END IF;
  -- A release frozen under the V1 suppression policy is re-released once with exact V2 counts (0076).
  IF prior.policy_version = 'FIXED_CLOSED_PROJECT_PERIOD_V1' THEN
    UPDATE pathways.sensitive_aggregate_releases SET policy_version = 'FIXED_CLOSED_PROJECT_PERIOD_V2',
      source_fingerprint = fingerprint, released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = prior.id;
    RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
  END IF;
  IF prior.source_fingerprint IS DISTINCT FROM fingerprint THEN
    UPDATE pathways.sensitive_aggregate_releases SET status = 'STALE', stale_reason = 'SOURCE_CHANGED',
      stale_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = prior.id;
    RETURN pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  END IF;
  RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
END $$;

-- 3. SADDD by place: the 0077 body without its actor checks.
CREATE FUNCTION pathways.p87_saddd_by_place_core(org uuid, project uuid, zone text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE project_start date; project_end date; business_today date; period_end date; result jsonb;
BEGIN
  IF zone IS DISTINCT FROM 'Asia/Manila' THEN
    RAISE EXCEPTION 'SADDD V1 business time zone unavailable' USING ERRCODE='22023';
  END IF;
  SELECT p.start_date, p.end_date INTO project_start, project_end
  FROM pathways.projects p WHERE p.organization_id=org AND p.id=project AND p.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501'; END IF;
  business_today := (CURRENT_TIMESTAMP AT TIME ZONE zone)::date;
  IF project_start IS NULL OR project_end IS NULL OR project_end < project_start OR project_start > business_today THEN
    RETURN '[]'::jsonb;
  END IF;
  -- The start check p06_assert_scope made, without its actor checks.
  IF project_start < DATE '1900-01-01' THEN RAISE EXCEPTION 'Invalid bounded monitoring period' USING ERRCODE='22023'; END IF;
  period_end := least(project_end, business_today);
  -- The p87_saddd_core population and eligibility, keyed by the recorded city or municipality and province.
  WITH population AS MATERIALIZED (
    SELECT DISTINCT ben.id, ben.sex::text AS sex, ben.disability_status::text AS disability, nullif(btrim(ben.location_city_municipality), '') AS town,
      nullif(btrim(ben.location_province), '') AS province,
      CASE WHEN ben.birth_date>business_today THEN NULL ELSE pathways.p06_age_band(ben.birth_date, period_end) END AS age
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=org AND e.project_id=project
      AND e.enrollment_date<=period_end AND (e.ended_date IS NULL OR e.ended_date>=project_start)
      AND ben.subject_type='INDIVIDUAL' AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), eligible AS MATERIALIZED (SELECT * FROM population WHERE age IS NOT NULL)
  -- One pass per town with exact counts; every town is returned, never a truncated subset.
  SELECT coalesce(jsonb_agg(jsonb_build_object('town', t.town, 'province', t.province, 'total', t.total,
    'disability', t.disability, 'sex', jsonb_build_array(
      jsonb_build_object('key', 'MALE', 'label', 'Male', 'n', t.male),
      jsonb_build_object('key', 'FEMALE', 'label', 'Female', 'n', t.female),
      jsonb_build_object('key', 'OTHER', 'label', 'Other', 'n', t.other),
      jsonb_build_object('key', 'PREFER_NOT_TO_SAY', 'label', 'Prefer not to say', 'n', t.prefer_not),
      jsonb_build_object('key', 'NOT_SPECIFIED', 'label', 'Unknown', 'n', t.unknown)))
    ORDER BY t.town NULLS LAST, t.province NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT p.town, p.province, count(*) AS total,
      count(*) FILTER (WHERE p.disability='WITH_DISABILITY') AS disability,
      count(*) FILTER (WHERE p.sex='MALE') AS male,
      count(*) FILTER (WHERE p.sex='FEMALE') AS female,
      count(*) FILTER (WHERE p.sex='OTHER') AS other,
      count(*) FILTER (WHERE p.sex='PREFER_NOT_TO_SAY') AS prefer_not,
      count(*) FILTER (WHERE p.sex='NOT_SPECIFIED') AS unknown
    FROM eligible p
    GROUP BY p.town, p.province
  ) t;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pathways.p06_saddd_by_place(wanted_org uuid, wanted_project uuid, zone text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE project_start date; project_end date; business_today date;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.saddd.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;
  IF zone IS DISTINCT FROM 'Asia/Manila' THEN
    RAISE EXCEPTION 'SADDD V1 business time zone unavailable' USING ERRCODE='22023';
  END IF;
  SELECT p.start_date, p.end_date INTO project_start, project_end
  FROM pathways.projects p WHERE p.organization_id=wanted_org AND p.id=wanted_project AND p.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501'; END IF;
  business_today := (CURRENT_TIMESTAMP AT TIME ZONE zone)::date;
  IF project_start IS NULL OR project_end IS NULL OR project_end < project_start OR project_start > business_today THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM pathways.p06_assert_scope(wanted_org, ARRAY[wanted_project], 'analytics.saddd.read', project_start, project_start, zone);
  PERFORM pathways.p06_assert_scope(wanted_org, ARRAY[wanted_project], 'beneficiaries.aggregates.read', project_start, project_start, zone);
  RETURN pathways.p87_saddd_by_place_core(wanted_org, wanted_project, zone);
END $$;

-- 4. KPI: the 0076 indicator value and the 0066 indicator list without their actor checks.
CREATE FUNCTION pathways.p87_indicator_value_core(org uuid, project uuid, indicator uuid, zone text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$

DECLARE
  d pathways.project_indicators; b pathways.project_indicator_bindings; m pathways.project_indicator_measurements;
  value numeric; n bigint; denominator bigint; contributors bigint; bad bigint; result jsonb;
BEGIN
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=org AND project_id=project AND id=indicator;
  IF NOT FOUND THEN RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501'; END IF;
  IF d.measurement_mode IS NULL THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'LEGACY_REVIEW_REQUIRED'),'measurementId',NULL,'measuredAt',NULL); END IF;
  -- The period checks p06_assert_scope made, without its actor checks.
  IF d.period_start IS NULL OR d.period_end IS NULL OR d.period_start < DATE '1900-01-01' OR d.period_end > DATE '2100-12-31'
     OR d.period_end < d.period_start OR d.period_end - d.period_start > 365
     OR zone IS NULL OR length(zone) > 100 OR NOT pathways.p06_zone_is_valid(zone) THEN
    RAISE EXCEPTION 'Invalid bounded monitoring period' USING ERRCODE='22023';
  END IF;
  IF d.measurement_mode='MANUAL' THEN
    WITH ms AS MATERIALIZED (
      SELECT * FROM pathways.project_indicator_measurements z
      WHERE z.organization_id=org AND z.project_id=project AND z.indicator_id=indicator
    )
    SELECT * INTO m FROM ms x
      WHERE x.period_start=d.period_start AND x.period_end=d.period_end
        AND NOT EXISTS (SELECT FROM ms y WHERE y.corrects_measurement_id=x.id)
      ORDER BY x.recorded_at DESC,x.id DESC LIMIT 1;
    RETURN jsonb_build_object('current',pathways.p06_cell(m.value),'measurementId',m.id,'measuredAt',m.recorded_at,'measurementSource',m.source);
  END IF;
  SELECT * INTO b FROM pathways.project_indicator_bindings WHERE organization_id=org AND project_id=project AND indicator_id=indicator;
  IF NOT FOUND THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'BINDING_UNAVAILABLE'),'measurementId',NULL,'measuredAt',NULL); END IF;

  IF b.recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    WITH accepted AS (
      SELECT p.attendance_status,e.beneficiary_id,ben.subject_type
      FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
      JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
      WHERE p.organization_id=org AND p.project_id=project
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
      WHERE r.organization_id=org AND r.project_id=project AND r.corrects_event_id IS NULL
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
      WHERE r.organization_id=org AND r.project_id=project AND r.corrects_event_id IS NULL
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
      WHERE s.organization_id=org AND s.project_id=project AND s.form_id=b.form_id AND s.form_version=b.form_version
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
      WHERE organization_id=org AND project_id=project AND archived_at IS NULL AND status<>'CANCELLED'
        AND planned_end_date BETWEEN d.period_start AND d.period_end;
    result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(100::numeric*n/denominator) END;
  ELSE result:=pathways.p06_cell(NULL,'UNSUPPORTED_RECIPE');
  END IF;
  RETURN jsonb_build_object('current',result,'measurementId',NULL,'measuredAt',NULL);
END  $$;

CREATE FUNCTION pathways.p87_indicator_values_core(org uuid, project uuid, zone text) RETURNS jsonb[]
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb[];
BEGIN
  IF (SELECT count(*) FROM pathways.project_indicators
      WHERE organization_id = org AND project_id = project AND archived_at IS NULL) > 100 THEN
    RAISE EXCEPTION 'Narrow the indicator scope' USING ERRCODE = '22023';
  END IF;
  -- p87_indicator_value_core is the same computation as the Indicator Summary report (p34_compute_indicator_value).
  SELECT coalesce(array_agg(jsonb_build_object(
      'id', i.id, 'projectId', i.project_id, 'code', i.code, 'name', i.name, 'indicatorType', i.indicator_type,
      'unitLabel', i.unit_label, 'numericKind', i.numeric_kind, 'direction', i.direction,
      'displayPrecision', i.display_precision,
      'periodStart', to_char(i.period_start, 'YYYY-MM-DD'), 'periodEnd', to_char(i.period_end, 'YYYY-MM-DD'),
      'baseline', trim_scale(i.baseline_value)::text, 'target', trim_scale(i.target_value)::text,
      'revision', i.revision,
      'status', CASE WHEN i.measurement_mode IS NULL THEN 'LEGACY_REVIEW_REQUIRED' ELSE 'ACTIVE' END,
      'current', pathways.p87_indicator_value_core(org, project, i.id, zone)->'current'
    ) ORDER BY i.code, i.id), '{}')
  INTO result
  FROM pathways.project_indicators i
  WHERE i.organization_id = org AND i.project_id = project AND i.archived_at IS NULL;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d pathways.project_indicators;
BEGIN
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=wanted_org AND project_id=wanted_project AND id=wanted_indicator;
  IF NOT FOUND OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid OR NOT pathways.p06_can('monitoring.read',wanted_project) THEN
    RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501';
  END IF;
  IF d.measurement_mode IS NOT NULL THEN
    PERFORM pathways.p06_assert_scope(wanted_org,ARRAY[wanted_project],'monitoring.read',d.period_start,d.period_end,zone);
  END IF;
  RETURN pathways.p87_indicator_value_core(wanted_org,wanted_project,wanted_indicator,zone);
END $$;

-- The per-indicator scope check leaves this path; p06_can below already requires the same active profile and permission.
CREATE OR REPLACE FUNCTION pathways.p06_indicator_values(wanted_project uuid, zone text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('reports.indicator.read', wanted_project) THEN
    RAISE EXCEPTION 'Indicator values unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN to_jsonb(pathways.p87_indicator_values_core(org, wanted_project, zone));
END $$;

-- 5. Timeline: the 0045 aggregate and the 0068 last completion without their actor checks.
CREATE FUNCTION pathways.p87_timeline_core(org uuid, project uuid, reporting date) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result jsonb;
BEGIN
  IF reporting IS NULL THEN
    RAISE EXCEPTION 'A reporting date is required' USING ERRCODE='22023';
  END IF;

  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_build_object(
        'eligible', count(*),
        'completed', count(*) FILTER (WHERE a.status = 'COMPLETED'),
        'overdue', count(*) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND a.planned_end_date >= DATE '1900-01-01'
            AND a.planned_end_date <= DATE '2100-12-31'
            AND reporting > a.planned_end_date),
        'missingDates', count(*) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND (a.planned_end_date IS NULL
              OR a.planned_end_date < DATE '1900-01-01'
              OR a.planned_end_date > DATE '2100-12-31')),
        'maxOverdueDays', max(greatest(0, reporting - a.planned_end_date)) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND a.planned_end_date >= DATE '1900-01-01'
            AND a.planned_end_date <= DATE '2100-12-31')
      )
      FROM pathways.project_activities a
      WHERE a.organization_id = org
        AND a.project_id = project
        AND a.archived_at IS NULL
        AND a.status <> 'CANCELLED'
    ),
    'milestones', (
      SELECT jsonb_build_object(
        'completed', count(*) FILTER (WHERE m.status = 'COMPLETED'),
        'rated', count(*) FILTER (
          WHERE m.status = 'COMPLETED' AND m.target_date IS NOT NULL AND m.completion_date IS NOT NULL),
        'onTime', count(*) FILTER (
          WHERE m.status = 'COMPLETED' AND m.target_date IS NOT NULL AND m.completion_date IS NOT NULL
            AND m.completion_date <= m.target_date)
      )
      FROM pathways.project_milestones m
      WHERE m.organization_id = org
        AND m.project_id = project
        AND m.archived_at IS NULL
    )
  ) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION pathways.p87_timeline_last_completion_core(org uuid, project uuid) RETURNS date
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result date;
BEGIN
  SELECT max(a.actual_end_date) INTO result
  FROM pathways.project_activities a
  WHERE a.organization_id = org
    AND a.project_id = project
    AND a.archived_at IS NULL
    AND a.status <> 'CANCELLED'
    AND a.status = 'COMPLETED'
    AND a.actual_end_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31';
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pathways.p10_f9_timeline_aggregate(wanted_org uuid, wanted_project uuid, reporting_on date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;
  RETURN pathways.p87_timeline_core(wanted_org, wanted_project, reporting_on);
END $$;

CREATE OR REPLACE FUNCTION pathways.p10_f9_timeline_last_completion(wanted_org uuid, wanted_project uuid)
 RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;
  RETURN pathways.p87_timeline_last_completion_core(wanted_org, wanted_project);
END $$;

-- 6. Participation: the 0066 breakdown without its actor checks. Its filters and grouping already equal
-- AnalyticsInsightsService.participation, so the gated breakdown calls it too.
-- shortcut: the filters are duplicated in AnalyticsInsightsService.participation; upgrade by having the service call this core.
CREATE FUNCTION pathways.p87_participation_core(org uuid, project uuid, start_on date, end_on date) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result jsonb;
BEGIN
  IF (start_on IS NULL) <> (end_on IS NULL) OR end_on < start_on
     OR start_on < DATE '1900-01-01' OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid participation period' USING ERRCODE = '22023';
  END IF;

  WITH accepted AS MATERIALIZED (
    SELECT p.activity_id, a.title, to_char(p.participation_date, 'YYYY-MM') AS month,
      p.attendance_status::text AS status
    FROM pathways.beneficiary_activity_participations p
    JOIN pathways.beneficiary_project_enrollments e
      ON e.organization_id = p.organization_id AND e.project_id = p.project_id AND e.id = p.enrollment_id
    JOIN pathways.beneficiaries ben ON ben.organization_id = e.organization_id AND ben.id = e.beneficiary_id
    JOIN pathways.project_activities a
      ON a.organization_id = p.organization_id AND a.project_id = p.project_id AND a.id = p.activity_id
    JOIN pathways.form_submissions s
      ON s.organization_id = p.organization_id AND s.project_id = p.project_id AND s.id = p.source_submission_id
    WHERE p.organization_id = org AND p.project_id = project
      AND (start_on IS NULL OR p.participation_date BETWEEN start_on AND end_on)
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
      AND a.archived_at IS NULL AND a.status <> 'CANCELLED'
      AND s.status = 'VALIDATED' AND NOT s.is_dummy_record
  )
  SELECT jsonb_build_object(
    'projectId', project,
    'total', (SELECT count(*) FROM accepted),
    'totalSuppressed', false,
    'byActivity', (SELECT coalesce(jsonb_agg(jsonb_build_object('activityId', g.activity_id, 'activityName', g.title,
        'count', g.n, 'suppressed', false) ORDER BY g.title, g.activity_id), '[]'::jsonb)
      FROM (SELECT activity_id, min(title) AS title, count(*) AS n FROM accepted GROUP BY activity_id) g),
    'byMonth', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', g.month, 'count', g.n, 'suppressed', false)
        ORDER BY g.month), '[]'::jsonb)
      FROM (SELECT month, count(*) AS n FROM accepted GROUP BY month) g),
    'byAttendanceStatus', (SELECT jsonb_agg(jsonb_build_object('status', v.status, 'count', coalesce(g.n, 0),
        'suppressed', false) ORDER BY v.ord)
      FROM (VALUES ('PRESENT', 1), ('ABSENT', 2), ('COMPLETED', 3), ('NOT_COMPLETED', 4), ('EXCUSED', 5)) v(status, ord)
      LEFT JOIN (SELECT status, count(*) AS n FROM accepted GROUP BY status) g USING (status)))
  INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pathways.p06_participation_breakdown(wanted_project uuid, start_on date DEFAULT NULL, end_on date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project) THEN
    RAISE EXCEPTION 'Participation breakdown unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN pathways.p87_participation_core(org, wanted_project, start_on, end_on);
END $$;

-- 7. With no app context prisma reads the KPI sources or a release row only while the live revision shows kpi or saddd.
CREATE POLICY p87_prisma_live_kpi_read ON pathways.project_indicator_bindings FOR SELECT TO prisma
 USING(EXISTS(SELECT FROM pathways.project_publications pub WHERE pub.organization_id=project_indicator_bindings.organization_id
  AND pub.project_id=project_indicator_bindings.project_id AND pub.live_snapshot->'views' ? 'kpi'));
CREATE POLICY p87_prisma_live_kpi_read ON pathways.project_indicator_measurements FOR SELECT TO prisma
 USING(EXISTS(SELECT FROM pathways.project_publications pub WHERE pub.organization_id=project_indicator_measurements.organization_id
  AND pub.project_id=project_indicator_measurements.project_id AND pub.live_snapshot->'views' ? 'kpi'));
CREATE POLICY p87_prisma_live_saddd_read ON pathways.sensitive_aggregate_releases FOR SELECT TO prisma
 USING(EXISTS(SELECT FROM pathways.project_publications pub WHERE pub.organization_id=sensitive_aggregate_releases.organization_id
  AND pub.project_id=sensitive_aggregate_releases.project_id AND pub.live_snapshot->'views' ? 'saddd'));

-- 8. The public read: one view of a live revision of an active project, computed now with no actor, or NULL.
CREATE FUNCTION pathways.p87_public_view(wanted_project uuid, wanted_view text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE live record; today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
 prior pathways.sensitive_aggregate_releases%ROWTYPE; data jsonb;
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public analytics unavailable' USING ERRCODE='42501'; END IF;
 SELECT pub.organization_id AS org,pub.live_snapshot,p.status::text AS status,p.start_date,p.end_date INTO live
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE'
   AND o.archived_at IS NULL AND pub.live_snapshot->'views' ? wanted_view;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF wanted_view='saddd' THEN
  -- The p06_saddd release rules, read only: a changed period or source, or a stale release, shows the restatement state.
  SELECT * INTO prior FROM pathways.sensitive_aggregate_releases r WHERE r.organization_id=live.org AND r.project_id=wanted_project;
  IF prior.id IS NOT NULL AND ROW(prior.period_start,prior.period_end) IS DISTINCT FROM ROW(live.start_date,live.end_date) THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSIF live.start_date IS NULL OR live.end_date IS NULL OR live.end_date<live.start_date OR live.end_date>DATE '2100-12-31'
   OR live.start_date>today THEN
   RETURN NULL;
  ELSIF live.end_date>=today THEN
   data:=pathways.p87_saddd_core(live.org,wanted_project,live.start_date,today,'Asia/Manila');
  ELSIF prior.status='STALE' THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSE
   data:=pathways.p87_saddd_core(live.org,wanted_project,live.start_date,live.end_date,'Asia/Manila');
   IF prior.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V2'
    AND prior.source_fingerprint IS DISTINCT FROM pathways.p87_saddd_fingerprint(live.org,wanted_project,data)
   THEN data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED'); END IF;
  END IF;
  RETURN jsonb_build_object('total',data->'total','sex',data->'sex','age',data->'age','disability',data->'disability');
 ELSIF wanted_view='kpi' THEN
  -- Released values, as p06_indicator_values gives them: the ACTIVE row with the latest periodEnd per code.
  RETURN (SELECT coalesce(jsonb_agg(k.item ORDER BY k.item->>'code',k.item->>'id'),'[]'::jsonb) FROM (
   SELECT DISTINCT ON (v.item->>'code') v.item FROM pg_catalog.unnest(pathways.p87_indicator_values_core(live.org,wanted_project,'Asia/Manila')) v(item)
   WHERE v.item->>'status'='ACTIVE' ORDER BY v.item->>'code',v.item->>'periodEnd' DESC NULLS LAST) k);
 ELSIF wanted_view='participation' THEN
  -- From the project start to today; a project not started yet has no attendance to show.
  IF live.start_date IS NULL OR live.start_date>today THEN RETURN NULL; END IF;
  RETURN pathways.p87_participation_core(live.org,wanted_project,live.start_date,today);
 ELSIF wanted_view='timeline' THEN
  -- As the internal view: the final position is read only for a completed project.
  RETURN jsonb_build_object('project',jsonb_build_object('status',live.status,'startDate',to_char(live.start_date,'YYYY-MM-DD'),
    'endDate',to_char(live.end_date,'YYYY-MM-DD')),'aggregate',pathways.p87_timeline_core(live.org,wanted_project,today),
   'lastCompletion',CASE WHEN live.status='COMPLETED'
    THEN to_char(pathways.p87_timeline_last_completion_core(live.org,wanted_project),'YYYY-MM-DD') END);
 ELSIF wanted_view='map' THEN
  -- This project's places and reach only; never the overview or budget.
  RETURN jsonb_build_object('area',live.live_snapshot->>'area','towns',pathways.p87_saddd_by_place_core(live.org,wanted_project,'Asia/Manila'));
 END IF;
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION pathways.p87_saddd_core(uuid,uuid,date,date,text),pathways.p87_saddd_fingerprint(uuid,uuid,jsonb),
  pathways.p87_saddd_by_place_core(uuid,uuid,text),pathways.p87_indicator_value_core(uuid,uuid,uuid,text),
  pathways.p87_indicator_values_core(uuid,uuid,text),pathways.p87_timeline_core(uuid,uuid,date),
  pathways.p87_timeline_last_completion_core(uuid,uuid),pathways.p87_participation_core(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p87_public_view(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p87_public_view(uuid,text) TO pathways_runtime;

-- Postconditions: the replaced bodies with owners, modes, volatility, search_path and ACLs kept, the internal cores, the
-- runtime-only public read and the live-view policies.
DO $$ BEGIN
 IF (SELECT count(*) FROM (VALUES (0,'pathways.p85_publication_views(jsonb)','e780b7908f1941ab6369d808a98d2c6b','i'),
    (1,'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','7559c376a86d32a5a01198df573ed9fb','s'),
    (2,'pathways.p06_saddd(uuid,uuid[],date,date,text)','52c7180d5550de4d48dcfcdd82cbf5fa','v'),
    (3,'pathways.p06_saddd_by_place(uuid,uuid,text)','1a61e6dfdbf63db03d334e7ab7ef69d3','s'),
    (4,'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','3f969e2940ba31cf592e6feb75cc69b2','s'),
    (5,'pathways.p06_indicator_values(uuid,text)','aac67ef4de765a95bfbc24edd65f73a4','s'),
    (6,'pathways.p10_f9_timeline_aggregate(uuid,uuid,date)','2feb9edc66a5326f333a3f2b59400c76','s'),
    (7,'pathways.p10_f9_timeline_last_completion(uuid,uuid)','28d0913ee4f26777dd9b0ff027d7f535','s'),
    (8,'pathways.p06_participation_breakdown(uuid,date,date)','da745fcf47b3483a9e4dd5964f521dfc','s')) w(n,sig,md5,vol)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile=w.vol
    AND p.proconfig=ARRAY['search_path=""'] AND pg_catalog.md5(p.prosrc)=w.md5
    AND coalesce(p.proacl::text,'')=pg_catalog.current_setting('pathways_0087.acl_'||w.n))<>9
  OR (SELECT count(*) FROM (VALUES ('pathways.p87_saddd_core(uuid,uuid,date,date,text)','{prisma}'),
    ('pathways.p87_saddd_fingerprint(uuid,uuid,jsonb)','{prisma}'),('pathways.p87_saddd_by_place_core(uuid,uuid,text)','{prisma}'),
    ('pathways.p87_indicator_value_core(uuid,uuid,uuid,text)','{prisma}'),('pathways.p87_indicator_values_core(uuid,uuid,text)','{prisma}'),
    ('pathways.p87_timeline_core(uuid,uuid,date)','{prisma}'),('pathways.p87_timeline_last_completion_core(uuid,uuid)','{prisma}'),
    ('pathways.p87_participation_core(uuid,uuid,date,date)','{prisma}'),
    ('pathways.p87_public_view(uuid,text)','{pathways_runtime,prisma}')) w(sig,grantees)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""']
    AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
     FROM pg_catalog.aclexplode(p.proacl) a)=w.grantees::text[])<>9
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polcmd='r' AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid]
   AND ((polname='p87_prisma_live_saddd_read' AND polrelid='pathways.sensitive_aggregate_releases'::pg_catalog.regclass)
    OR (polname='p87_prisma_live_kpi_read' AND polrelid IN ('pathways.project_indicator_bindings'::pg_catalog.regclass,
     'pathways.project_indicator_measurements'::pg_catalog.regclass))))<>3
 THEN RAISE EXCEPTION '0087 postconditions failed'; END IF;
END $$;
COMMIT;
