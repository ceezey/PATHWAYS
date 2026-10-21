-- 0075 Indicator Summary measurement lookup (cr-pathways-indicator-summary-measurement-lookup); forward migration.
-- p34_compute_indicator_value, behind the Indicator Summary report, had the same MANUAL lookup that 0074 fixed in
-- p06_compute_indicator_value: a NOT EXISTS self-join on project_indicator_measurements, where forced RLS runs the
-- p34_report_projection policy (two p05_has_project_permission calls) for every row on both sides of the join.
-- The indicator's measurements are now read once into a MATERIALIZED CTE and the correction check runs on that set: the same
-- rows under the same policies with the same result, one policy check per row. Every other byte of the body is the 0034
-- text. Owner report_projection_owner, SECURITY DEFINER, volatility, search_path and ACL stay unchanged (asserted below).
-- DBA prerequisite: run hosted-indicator-summary-preprovision.sql first (a temporary SET-only membership from prisma to
-- report_projection_owner) and hosted-indicator-summary-cleanup.sql afterwards, also after a failure; until the cleanup
-- runs, p34_assert_projection_provisioned fails the reports closed. The schema owner lends CREATE for the one statement.
-- No table, policy or grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0074_indicator_measurement_lookup'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0075 requires the verified 0074 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','report_projection_owner','SET')
 THEN RAISE EXCEPTION '0075 requires the temporary report_projection_owner SET membership (run hosted-indicator-summary-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0075 requires the reviewed pathways schema owner and no earlier schema CREATE'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)');
 -- Only the reviewed 0034 definition, or this migration's own on a rerun, may be replaced.
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'report_projection_owner' OR NOT fn.prosecdef OR fn.provolatile<>'s'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('7de65efb6bc48bc0f071528aecc47788','a14c59889bae818ac6dfa7263c3d264b')
 THEN RAISE EXCEPTION '0075 requires the reviewed 0034 p34_compute_indicator_value definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0075.acl',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

GRANT CREATE ON SCHEMA pathways TO report_projection_owner;
SET LOCAL ROLE report_projection_owner;
CREATE OR REPLACE FUNCTION pathways.p34_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
    IF b.recipe='PARTICIPATION_RECORD_COUNT' THEN result:=pathways.p06_cell(n,CASE WHEN contributors BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END);
    ELSIF b.recipe='DISTINCT_ATTENDING_INDIVIDUALS' THEN result:=pathways.p06_count_cell(denominator);
    ELSE result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') WHEN denominator<5 THEN pathways.p06_cell(NULL,'SMALL_COHORT') ELSE pathways.p06_cell(bad::numeric/denominator) END;
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
    result:=pathways.p06_cell(n,CASE WHEN contributors BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END);
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
      WHEN contributors<5 THEN pathways.p06_cell(NULL,'SMALL_COHORT')
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
END $_$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM report_projection_owner;

-- Postconditions: the reviewed body, owner, definer mode, volatility, empty search_path, the saved ACL and no lent CREATE.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)'::pg_catalog.regprocedure;
 IF pg_catalog.md5(fn.prosrc)<>'a14c59889bae818ac6dfa7263c3d264b' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'report_projection_owner'
  OR NOT fn.prosecdef OR fn.provolatile<>'s' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0075.acl')
 THEN RAISE EXCEPTION '0075 p34_compute_indicator_value postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0075 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
