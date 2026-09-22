BEGIN;

DO $guard$
DECLARE
  current_saddd text;
BEGIN
  IF current_user <> 'prisma' OR session_user <> 'prisma' THEN
    RAISE EXCEPTION
      '0020 must run as the established prisma migration identity';
  END IF;

  IF NOT EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND NOT rolbypassrls
      AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION
      '0020 requires pathways_runtime to remain NOBYPASSRLS';
  END IF;

  IF to_regprocedure(
       'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)'
     ) IS NULL
     OR to_regprocedure(
       'pathways.p06_saddd(uuid,uuid[],date,date,text)'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      '0020 requires the completed P06 SADDD functions';
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO current_saddd
  FROM pg_proc p
  JOIN pg_namespace n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'pathways'
    AND p.proname = 'p06_saddd'
    AND pg_get_function_identity_arguments(p.oid) =
      'wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text';

  IF current_saddd IS NULL
     OR position(
       'RELEASE_POLICY_REVIEW_REQUIRED'
       IN current_saddd
     ) = 0
  THEN
    RAISE EXCEPTION
      '0020 refused an unexpected pre-change p06_saddd definition';
  END IF;

  IF to_regclass(
       'pathways.sensitive_aggregate_releases'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      '0020 sensitive release registry already exists';
  END IF;
END
$guard$;


/* =========================================================
 * Protected release registry.
 *
 * One release authority per project.
 * No raw Beneficiary identifiers or released numeric cells
 * are persisted here.
 * ======================================================= */

CREATE TABLE pathways.sensitive_aggregate_releases (
  id uuid
    PRIMARY KEY
    DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,

  period_start date NOT NULL,
  period_end date NOT NULL,

  policy_version text NOT NULL
    DEFAULT 'FIXED_CLOSED_PROJECT_PERIOD_V1',

  source_fingerprint text NOT NULL,

  status text NOT NULL
    DEFAULT 'RELEASED',

  stale_reason text,

  released_at timestamptz(3) NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  stale_at timestamptz(3),

  created_at timestamptz(3) NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at timestamptz(3) NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT p06_sensitive_release_org_fk
  FOREIGN KEY (
    organization_id
  )
  REFERENCES pathways.organizations (
    id
  )
  ON UPDATE RESTRICT
  ON DELETE RESTRICT,

  CONSTRAINT p06_sensitive_release_project_fk
    FOREIGN KEY (
      organization_id,
      project_id
    )
    REFERENCES pathways.projects (
      organization_id,
      id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,

  CONSTRAINT p06_sensitive_release_project_key
    UNIQUE (
      organization_id,
      project_id
    ),

  CONSTRAINT p06_sensitive_release_period_check
    CHECK (
      period_start <= period_end
    ),

  CONSTRAINT p06_sensitive_release_policy_check
    CHECK (
      policy_version =
        'FIXED_CLOSED_PROJECT_PERIOD_V1'
    ),

  CONSTRAINT p06_sensitive_release_fingerprint_check
    CHECK (
      source_fingerprint ~ '^[0-9a-f]{64}$'
    ),

  CONSTRAINT p06_sensitive_release_status_check
    CHECK (
      status IN (
        'RELEASED',
        'STALE'
      )
    ),

  CONSTRAINT p06_sensitive_release_stale_reason_check
    CHECK (
      stale_reason IS NULL
      OR stale_reason IN (
        'SOURCE_CHANGED',
        'PROJECT_PERIOD_CHANGED'
      )
    ),

  CONSTRAINT p06_sensitive_release_state_check
    CHECK (
      (
        status = 'RELEASED'
        AND stale_at IS NULL
        AND stale_reason IS NULL
      )
      OR
      (
        status = 'STALE'
        AND stale_at IS NOT NULL
        AND stale_reason IS NOT NULL
      )
    )
);

CREATE INDEX p06_sensitive_release_status_idx
ON pathways.sensitive_aggregate_releases (
  organization_id,
  status,
  project_id
);


ALTER TABLE pathways.sensitive_aggregate_releases
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.sensitive_aggregate_releases
  FORCE ROW LEVEL SECURITY;


/*
 * Runtime receives no direct table access.
 */

REVOKE ALL
ON TABLE pathways.sensitive_aggregate_releases
FROM
  PUBLIC,
  anon,
  authenticated,
  service_role,
  pathways_runtime;


/*
 * The SECURITY DEFINER release wrapper executes as the
 * established migration owner. These policies preserve
 * FORCE-RLS behavior when that owner is NOBYPASSRLS.
 */

CREATE POLICY p06_sensitive_release_owner_select
ON pathways.sensitive_aggregate_releases
FOR SELECT
TO prisma
USING (
  organization_id =
    nullif(
      current_setting(
        'app.organization_id',
        true
      ),
      ''
    )::uuid

  AND pathways.p06_can(
    'beneficiaries.aggregates.read',
    project_id
  )
);

CREATE POLICY p06_sensitive_release_owner_insert
ON pathways.sensitive_aggregate_releases
FOR INSERT
TO prisma
WITH CHECK (
  organization_id =
    nullif(
      current_setting(
        'app.organization_id',
        true
      ),
      ''
    )::uuid

  AND pathways.p06_can(
    'beneficiaries.aggregates.read',
    project_id
  )
);

CREATE POLICY p06_sensitive_release_owner_update
ON pathways.sensitive_aggregate_releases
FOR UPDATE
TO prisma
USING (
  organization_id =
    nullif(
      current_setting(
        'app.organization_id',
        true
      ),
      ''
    )::uuid

  AND pathways.p06_can(
    'beneficiaries.aggregates.read',
    project_id
  )
)
WITH CHECK (
  organization_id =
    nullif(
      current_setting(
        'app.organization_id',
        true
      ),
      ''
    )::uuid

  AND pathways.p06_can(
    'beneficiaries.aggregates.read',
    project_id
  )
);


/* =========================================================
 * Standard non-disclosing SADDD payload.
 * ======================================================= */

CREATE OR REPLACE FUNCTION pathways.p06_missing_saddd(
  reason text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path=''
AS $$
  SELECT jsonb_build_object(
    'releaseState',
      'STALE',
    'total',
      pathways.p06_cell(
        NULL,
        reason
      ),

    'sex',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('MALE', 'Male', 1),
            ('FEMALE', 'Female', 2),
            ('OTHER', 'Other', 3),
            ('PREFER_NOT_TO_SAY', 'Prefer not to say', 4),
            ('NOT_SPECIFIED', 'Unknown', 5)
        ) v(key, label, ord)
      ),

    'age',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.key,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('0-9', 1),
            ('10-14', 2),
            ('15-17', 3),
            ('18-24', 4),
            ('25+', 5),
            ('Unknown', 6)
        ) v(key, ord)
      ),

    'disability',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('WITH_DISABILITY', 'With disability', 1),
            ('WITHOUT_DISABILITY', 'Without disability', 2),
            ('NOT_SPECIFIED', 'Unknown', 3)
        ) v(key, label, ord)
      ),

    'completeness',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('MISSING_BIRTH_DATE', 'Missing birth date', 1),
            ('INVALID_BIRTH_DATE', 'Excluded invalid birth date', 2),
            ('MISSING_SEX', 'Unspecified sex', 3),
            ('MISSING_DISABILITY', 'Unspecified disability', 4)
        ) v(key, label, ord)
      )
  );
$$;


-- Preserve the applied G4 calculator while allowing the one authoritative project
-- period to span more than the general monitoring query's 366-day limit.
-- Scope is checked on its start date; the wrapper alone authorizes release.
CREATE OR REPLACE FUNCTION pathways.p06_compute_saddd(wanted_org uuid,wanted_projects uuid[],start_on date,end_on date,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb; result jsonb; suppress boolean; total bigint;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.read',start_on,start_on,zone);
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
END $$;


/* =========================================================
 * G8 decision for the other sensitive P06 outputs.
 *
 * These are intentionally not enabled by V1.
 * The policy is now explicit rather than "pending review".
 * ======================================================= */

CREATE OR REPLACE FUNCTION pathways.p06_indicator_value(
  wanted_org uuid,
  wanted_project uuid,
  wanted_indicator uuid,
  zone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  mode text;
  recipe text;
  start_on date;
  end_on date;
BEGIN
  IF wanted_org IS DISTINCT FROM
       nullif(
         current_setting(
           'app.organization_id',
           true
         ),
         ''
       )::uuid
     OR NOT pathways.p06_can(
       'monitoring.read',
       wanted_project
     )
  THEN
    RAISE EXCEPTION
      'Indicator unavailable'
      USING ERRCODE='42501';
  END IF;

  SELECT
    i.measurement_mode,
    b.recipe,
    i.period_start,
    i.period_end
  INTO
    mode,
    recipe,
    start_on,
    end_on
  FROM pathways.project_indicators i
  LEFT JOIN pathways.project_indicator_bindings b
    ON b.organization_id =
       i.organization_id
   AND b.project_id =
       i.project_id
   AND b.indicator_id =
       i.id
  WHERE i.organization_id =
        wanted_org
    AND i.project_id =
        wanted_project
    AND i.id =
        wanted_indicator;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Indicator unavailable'
      USING ERRCODE='42501';
  END IF;

  IF mode = 'DERIVED'
     AND recipe IS DISTINCT FROM
       'ACTIVITY_COMPLETION_PERCENTAGE'
  THEN
    PERFORM pathways.p06_assert_scope(
      wanted_org,
      ARRAY[wanted_project],
      'monitoring.read',
      start_on,
      end_on,
      zone
    );

    RETURN jsonb_build_object(
      'current',
        pathways.p06_cell(
          NULL,
          'SENSITIVE_RELEASE_NOT_ENABLED_V1'
        ),
      'measurementId',
        NULL,
      'measuredAt',
        NULL,
      'measurementSource',
        NULL
    );
  END IF;

  RETURN pathways.p06_compute_indicator_value(
    wanted_org,
    wanted_project,
    wanted_indicator,
    zone
  );
END
$$;


CREATE OR REPLACE FUNCTION pathways.p06_monitoring(
  wanted_org uuid,
  wanted_projects uuid[],
  start_on date,
  end_on date,
  zone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  data jsonb;
  missing jsonb;
BEGIN
  data :=
    pathways.p06_compute_monitoring(
      wanted_org,
      wanted_projects,
      start_on,
      end_on,
      zone
    );

  missing :=
    pathways.p06_cell(
      NULL,
      'SENSITIVE_RELEASE_NOT_ENABLED_V1'
    );

  RETURN data || jsonb_build_object(
    'participationRecords',
      missing,
    'attendingIndividuals',
      missing,
    'enrolledBeneficiaryRecords',
      missing,
    'enrolledIndividuals',
      missing
  );
END
$$;


/* =========================================================
 * Fixed, closed-project SADDD release authority.
 * ======================================================= */

CREATE OR REPLACE FUNCTION pathways.p06_saddd(
  wanted_org uuid,
  wanted_projects uuid[],
  start_on date,
  end_on date,
  zone text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $$
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
     OR NOT pathways.p06_can('analytics.read', wanted_project)
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
    wanted_org, wanted_projects, 'analytics.read', start_on, start_on, zone
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
$$;


/*
 * Keep the private calculator private.
 */

REVOKE ALL
ON FUNCTION pathways.p06_missing_saddd(text)
FROM
  PUBLIC,
  anon,
  authenticated,
  service_role,
  pathways_runtime;

REVOKE ALL
ON FUNCTION pathways.p06_saddd(
  uuid,
  uuid[],
  date,
  date,
  text
)
FROM
  PUBLIC,
  anon,
  authenticated,
  service_role;

GRANT EXECUTE
ON FUNCTION pathways.p06_saddd(
  uuid,
  uuid[],
  date,
  date,
  text
)
TO pathways_runtime;

COMMIT;
