-- cr-pathways-indicator-library: organization-scoped library of indicator definition templates.
-- Adds one prisma-owned table with RLS (organization match plus the org-level p09_can check),
-- three permissions granted to System Administrator, Monitoring and Evaluation Officer and Project
-- Manager (the roles that hold indicators.create), and wraps the p09_role_allows
-- ceiling as left by 0048 (keeping the 0047 and 0048 changes)
-- with those nine pairs added. Entries hold definition fields only: no project,
-- activity, form, period, baseline, target or measurement data. Using an entry copies its
-- definition into a project indicator through the existing create path; there is no live link.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0050_import_value_map' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regclass('pathways.indicator_library_entries') IS NOT NULL
 OR EXISTS(SELECT FROM pathways.permissions WHERE code LIKE 'indicators.library.%')
 OR (SELECT count(*) FROM pathways.roles WHERE code IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER') AND is_active) <> 3
 OR to_regprocedure('pathways.p09_can(text)') IS NULL
 OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
 OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0051 requires the verified 0050 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

INSERT INTO pathways.permissions(code,name) VALUES
('indicators.library.read','indicators.library.read'),
('indicators.library.create','indicators.library.create'),
('indicators.library.archive','indicators.library.archive');

ALTER FUNCTION pathways.p09_role_allows(text,text) RENAME TO p09_role_allows_0048;
CREATE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1 IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
  AND $2 IN ('indicators.library.read','indicators.library.create','indicators.library.archive'))
  OR pathways.p09_role_allows_0048($1,$2)
$matrix$;

-- Carry the EXECUTE grants of the renamed function over so the rules owners keep access.
DO $$ DECLARE g oid; BEGIN
 REVOKE ALL ON FUNCTION pathways.p09_role_allows(text,text) FROM PUBLIC,anon,authenticated,service_role;
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p,aclexplode(p.proacl) a
  WHERE p.oid='pathways.p09_role_allows_0048(text,text)'::regprocedure AND a.grantee NOT IN (0,p.proowner) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION pathways.p09_role_allows(text,text) TO %I',(SELECT rolname FROM pg_roles WHERE oid=g));
 END LOOP;
END $$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code LIKE 'indicators.library.%'
WHERE r.code IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE pathways.indicator_library_entries (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 organization_id uuid NOT NULL,
 code text NOT NULL,
 name text NOT NULL,
 description text,
 unit_label text NOT NULL,
 data_source text NOT NULL,
 measurement_mode text NOT NULL,
 numeric_kind text NOT NULL,
 direction text NOT NULL,
 display_precision integer NOT NULL,
 recipe text,
 client_mutation_id uuid NOT NULL,
 created_by_id uuid NOT NULL,
 created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
 archived_at timestamp(3) with time zone,
 CONSTRAINT indicator_library_entries_pkey PRIMARY KEY (id),
 CONSTRAINT indicator_library_entries_client_key UNIQUE (organization_id, client_mutation_id),
 CONSTRAINT indicator_library_entries_code_check CHECK (code ~ '^[A-Z][A-Z0-9_\-]{1,39}$'),
 CONSTRAINT indicator_library_entries_text_check CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 160 AND char_length(btrim(unit_label)) BETWEEN 1 AND 80
  AND char_length(btrim(data_source)) BETWEEN 1 AND 300 AND (description IS NULL OR char_length(description) <= 2000)),
 CONSTRAINT indicator_library_entries_kind_check CHECK (
  measurement_mode IN ('MANUAL','DERIVED')
  AND numeric_kind IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
  AND direction IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','DESCRIPTIVE')
  AND display_precision BETWEEN 0 AND 4 AND (numeric_kind <> 'COUNT' OR display_precision = 0)),
 CONSTRAINT indicator_library_entries_recipe_check CHECK (
  (measurement_mode = 'DERIVED') = (recipe IS NOT NULL)
  AND (recipe IS NULL OR recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS',
   'ATTENDANCE_RECORDS_PER_INDIVIDUAL','EFFECTIVE_JOURNEY_EVENT_COUNT','ACTIVITY_COMPLETION_PERCENTAGE'))),
 CONSTRAINT indicator_library_entries_organization_fk FOREIGN KEY (organization_id)
  REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT indicator_library_entries_created_by_fk FOREIGN KEY (organization_id, created_by_id)
  REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE pathways.indicator_library_entries OWNER TO prisma;
CREATE UNIQUE INDEX indicator_library_entries_active_code_key
 ON pathways.indicator_library_entries (organization_id, code) WHERE archived_at IS NULL;
CREATE INDEX indicator_library_entries_created_by_idx
 ON pathways.indicator_library_entries (organization_id, created_by_id);

ALTER TABLE pathways.indicator_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.indicator_library_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_indicator_library_select ON pathways.indicator_library_entries FOR SELECT TO pathways_runtime
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.read'));
CREATE POLICY p11_indicator_library_insert ON pathways.indicator_library_entries FOR INSERT TO pathways_runtime
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND archived_at IS NULL AND pathways.p09_can('indicators.library.create'));
CREATE POLICY p11_indicator_library_archive ON pathways.indicator_library_entries FOR UPDATE TO pathways_runtime
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.archive'))
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.archive'));

-- No DELETE; archiving is the only update, enforced by a column-level grant.
REVOKE ALL ON pathways.indicator_library_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT ON pathways.indicator_library_entries TO pathways_runtime;
GRANT UPDATE (archived_at) ON pathways.indicator_library_entries TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.permissions p ON p.id=rp.permission_id
  WHERE p.code LIKE 'indicators.library.%')<>9
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','indicators.library.create')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 OR NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 OR pathways.p09_role_allows('PROJECT_OFFICER','indicators.library.read')
 OR pathways.p09_role_allows('PROGRAM_MANAGER','indicators.library.read')
 OR pathways.p09_role_allows('GRANT_MANAGER','indicators.library.read')
 THEN RAISE EXCEPTION '0051 grant postcondition failed'; END IF;
 IF EXISTS((SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0048(text,text)'::regprocedure) UNION ALL (SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0048(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure))
 THEN RAISE EXCEPTION 'p09_role_allows grants differ from the previous function'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.indicator_library_entries'::pg_catalog.regclass)
 OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.indicator_library_entries'::pg_catalog.regclass)<>3
 THEN RAISE EXCEPTION '0051 row level security postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.indicator_library_entries','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.indicator_library_entries','INSERT')
  AND has_column_privilege('pathways_runtime','pathways.indicator_library_entries','archived_at','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.indicator_library_entries','name','UPDATE')
  AND NOT has_table_privilege('pathways_runtime','pathways.indicator_library_entries','DELETE'))
 THEN RAISE EXCEPTION '0051 table privilege postcondition failed'; END IF;
END $$;
COMMIT;
