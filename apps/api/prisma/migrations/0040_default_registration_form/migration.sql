-- Predecessor assertion is 0037, not 0039: 0038-0041 are built in parallel on the 0037 state.
-- cr-pathways-default-registration-form: a lazily provisioned, fixed system default Beneficiary
-- registration form per project, and the one narrow maker-checker exemption that publishing it needs.
-- Adds one nullable column with a check, one partial unique index, one SECURITY DEFINER function
-- for pathways_runtime, and replaces p2_guard_form in place (same signature, owner, ACL and trigger
-- binding). No form, permission, grant or existing row is created or changed.
-- The definer runs as prisma after the 0031/0034 cleanups revoke its owner-role memberships, so it
-- reads only prisma-owned tables, calls only prisma-owned helpers (p05_has_project_permission and,
-- through it, p09_role_allows), and never calls postgres-owned runtime helpers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0037_step_up_pin' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM pg_catalog.pg_attribute WHERE attrelid='pathways.digital_forms'::regclass AND attname='system_template_key' AND NOT attisdropped)
 OR to_regprocedure('pathways.ensure_default_registration_form(uuid)') IS NOT NULL
 OR to_regprocedure('pathways.p2_guard_form()') IS NULL
 OR to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
 OR to_regprocedure('pathways.p09_role_allows(text,text)') IS NULL
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p2_guard_form()'::regprocedure
  AND p.prosrc LIKE '%Publication requires a different attributable reviewer%' AND p.prosrc NOT LIKE '%system_template_key%')
 OR pg_catalog.pg_has_role('pathways_runtime','prisma','MEMBER')
 THEN RAISE EXCEPTION '0040 requires the verified 0037 state and migration identity'; END IF;
 -- The definer and trigger run as prisma: every object they touch is prisma-owned, RLS is not
 -- forced on it, and the helpers are executable by prisma directly (never through a membership).
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('digital_forms','form_fields','audit_logs','system_users','organizations',
   'roles','role_permissions','permissions','projects','user_project_assignments','programs')
  AND (pg_catalog.pg_get_userbyid(c.relowner)<>'prisma' OR c.relforcerowsecurity))
 OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('digital_forms','form_fields','audit_logs','system_users','organizations',
   'roles','role_permissions','permissions','projects','user_project_assignments','programs'))<>11
 OR EXISTS(SELECT FROM unnest(ARRAY['pathways.p05_has_project_permission(text,uuid)','pathways.p09_role_allows(text,text)',
   'pathways.p2_valid_options(jsonb)']) f(sig)
  WHERE NOT EXISTS(SELECT FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=pg_catalog.to_regprocedure(f.sig) AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
   AND a.privilege_type='EXECUTE' AND a.grantee IN (0,p.proowner)))
 THEN RAISE EXCEPTION '0040 requires prisma ownership of the form, identity and scope tables and helpers'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- Tag for the one fixed system template. Its shape is pinned: any change needs a new key.
ALTER TABLE pathways.digital_forms ADD COLUMN system_template_key text;
ALTER TABLE pathways.digital_forms ADD CONSTRAINT digital_forms_system_template CHECK(
 system_template_key IS NULL OR (system_template_key='SYSTEM_DEFAULT_REGISTRATION_V1'
  AND form_type='BENEFICIARY_REGISTRATION' AND code='system_default_registration' AND version=1
  AND created_by_id IS NULL AND activity_id IS NULL AND journey_stage_id IS NULL));
-- One tagged form per organization and project, including an archived one.
CREATE UNIQUE INDEX digital_forms_system_template_key ON pathways.digital_forms(organization_id,project_id)
 WHERE system_template_key IS NOT NULL;

-- Unchanged baseline guard except the three marked 0040 lines: only the provisioning definer
-- (running as prisma) may insert a tagged row, the tag never changes, and only a tagged
-- SYSTEM_DEFAULT_REGISTRATION_V1 row published by prisma may have a null created_by_id.
CREATE OR REPLACE FUNCTION pathways.p2_guard_form() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'DRAFT'
       OR NEW.published_by_id IS NOT NULL OR NEW.published_at IS NOT NULL
       OR NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Form definitions must start as drafts';
    END IF;
    IF NEW.system_template_key IS NOT NULL AND current_user <> 'prisma' THEN -- 0040
      RAISE EXCEPTION 'System form templates are provisioned only by the database' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Published or archived form definitions are immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.system_template_key IS DISTINCT FROM OLD.system_template_key THEN -- 0040
    RAISE EXCEPTION 'System form template tags are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status='ARCHIVED' THEN
    RAISE EXCEPTION 'Archived form definitions are immutable';
  END IF;
  IF OLD.status='PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.form_type IS DISTINCT FROM OLD.form_type
       OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
       OR NEW.journey_stage_id IS DISTINCT FROM OLD.journey_stage_id
       OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
       OR NEW.published_by_id IS DISTINCT FROM OLD.published_by_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Published form definitions are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='PUBLISHED' AND (
    NEW.published_by_id IS NULL OR NEW.published_at IS NULL
    OR (NEW.created_by_id IS NULL AND NOT (NEW.system_template_key IS NOT DISTINCT FROM 'SYSTEM_DEFAULT_REGISTRATION_V1' AND current_user='prisma')) -- 0040
    OR NEW.published_by_id=NEW.created_by_id
  ) THEN
    RAISE EXCEPTION 'Publication requires a different attributable reviewer';
  END IF;
  IF NEW.status='PUBLISHED' AND NOT EXISTS (
    SELECT FROM pathways.form_fields f
    WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id AND f.form_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'Published form must contain fields';
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION pathways.p2_guard_form() OWNER TO prisma;

-- Idempotent provisioning. Organization and actor come only from the verified transaction
-- context; p05_has_project_permission checks the active user, organization, role, permission
-- ceiling and project assignment, and is rechecked after the per-project lock. The caller
-- chooses no content: the field set is exactly beneficiaryRegistrationFieldRules.
-- Outcomes: EXISTING (any tagged form, including an archived one, which is never recreated),
-- PROVISIONED, or CODE_IN_USE when an untagged form already holds the reserved code/version.
CREATE FUNCTION pathways.ensure_default_registration_form(wanted_project uuid)
RETURNS TABLE(provisioned_form uuid,outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE org uuid; actor uuid; existing uuid; created uuid:=gen_random_uuid();
 stamp timestamptz:=date_trunc('milliseconds',statement_timestamp());
BEGIN
 BEGIN
  org:=nullif(current_setting('app.organization_id',true),'')::uuid;
  actor:=nullif(current_setting('app.user_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN org:=NULL; actor:=NULL;
 END;
 IF org IS NULL OR actor IS NULL OR wanted_project IS NULL
 OR NOT pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project) THEN
  RAISE EXCEPTION 'Default registration form unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'pathways.default_registration_form:'||org::text||':'||wanted_project::text,0));
 -- Recheck live scope after any lock wait.
 IF NOT pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project) THEN
  RAISE EXCEPTION 'Default registration form unavailable' USING ERRCODE='42501'; END IF;
 SELECT f.id INTO existing FROM pathways.digital_forms f
 WHERE f.organization_id=org AND f.project_id=wanted_project AND f.system_template_key IS NOT NULL;
 IF existing IS NOT NULL THEN RETURN QUERY SELECT existing,'EXISTING'::text; RETURN; END IF;
 IF EXISTS(SELECT FROM pathways.digital_forms f WHERE f.organization_id=org AND f.project_id=wanted_project
  AND f.code='system_default_registration' AND f.version=1) THEN
  RETURN QUERY SELECT NULL::uuid,'CODE_IN_USE'::text; RETURN; END IF;
 INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,description,
  form_type,status,system_template_key,created_at,updated_at)
 VALUES(created,org,wanted_project,'system_default_registration',1,'Beneficiary registration',
  'Standard Beneficiary registration form provided for every project.','BENEFICIARY_REGISTRATION',
  'DRAFT','SYSTEM_DEFAULT_REGISTRATION_V1',stamp,stamp);
 INSERT INTO pathways.form_fields(organization_id,project_id,form_id,sequence_no,code,label,data_type,
  is_required,is_metadata_key,is_saddd_field,allowed_values,created_at,updated_at)
 SELECT org,wanted_project,created,v.sequence_no,v.code,v.label,v.data_type::pathways.field_data_type,
  v.is_required,v.is_metadata_key,v.is_saddd_field,v.allowed_values::jsonb,stamp,stamp
 FROM (VALUES
  (1,'registration_operation','Registration operation','SELECT',true,false,false,'["CREATE","LINK","UPDATE"]'),
  (2,'beneficiary_code','Beneficiary code','TEXT',true,true,false,NULL),
  (3,'subject_type','Subject type','SELECT',true,false,false,'["INDIVIDUAL","GROUP","COMMUNITY"]'),
  (4,'display_name','Display name','TEXT',false,false,false,NULL),
  (5,'first_name','First name','TEXT',false,false,false,NULL),
  (6,'middle_name','Middle name','TEXT',false,false,false,NULL),
  (7,'last_name','Last name','TEXT',false,false,false,NULL),
  (8,'sex','Sex','SELECT',false,false,true,'["MALE","FEMALE","OTHER","PREFER_NOT_TO_SAY","NOT_SPECIFIED"]'),
  (9,'birth_date','Birth date','DATE',false,false,true,NULL),
  (10,'age_at_registration','Age at registration','INTEGER',false,false,true,NULL),
  (11,'disability_status','Disability status','SELECT',false,false,true,'["WITH_DISABILITY","WITHOUT_DISABILITY","NOT_SPECIFIED"]'),
  (12,'location_barangay','Barangay','TEXT',false,false,false,NULL),
  (13,'location_city_municipality','City or municipality','TEXT',false,false,false,NULL),
  (14,'location_province','Province','TEXT',false,false,false,NULL),
  (15,'consent_recorded','Participation consent','BOOLEAN',true,false,false,NULL),
  (16,'data_processing_consent_recorded','Data processing consent','BOOLEAN',true,false,false,NULL),
  (17,'is_minor','Minor status','BOOLEAN',false,false,false,NULL),
  (18,'guardian_consent_recorded','Guardian consent','BOOLEAN',false,false,false,NULL),
  (19,'enrollment_date','Enrollment date','DATE',true,false,false,NULL),
  (20,'external_identifier_type','External identifier namespace','TEXT',false,false,false,NULL),
  (21,'external_identifier_value','External identifier value','TEXT',false,false,false,NULL),
  (22,'profile_update_fields','Profile fields to update','MULTIPLE_SELECT',false,false,false,'["display_name","first_name","middle_name","last_name","sex","birth_date","age_at_registration","disability_status","location_barangay","location_city_municipality","location_province"]')
 ) v(sequence_no,code,label,data_type,is_required,is_metadata_key,is_saddd_field,allowed_values);
 UPDATE pathways.digital_forms f SET status='PUBLISHED',published_by_id=actor,published_at=stamp,updated_at=stamp
 WHERE f.organization_id=org AND f.project_id=wanted_project AND f.id=created;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,wanted_project,'DEFAULT_REGISTRATION_FORM_PROVISIONED','DigitalForm',created::text,
  jsonb_build_object('templateKey','SYSTEM_DEFAULT_REGISTRATION_V1','code','system_default_registration',
   'version',1,'createdById',NULL,'publishedById',actor,'publishedAt',stamp));
 RETURN QUERY SELECT created,'PROVISIONED'::text;
END $$;
ALTER FUNCTION pathways.ensure_default_registration_form(uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.ensure_default_registration_form(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.ensure_default_registration_form(uuid) TO pathways_runtime;

-- Postconditions: column, check and index; exact definer and guard security; unchanged binding.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_attribute WHERE attrelid='pathways.digital_forms'::regclass
  AND attname='system_template_key' AND atttypid='text'::regtype AND NOT attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.digital_forms'::regclass
  AND conname='digital_forms_system_template' AND contype='c' AND convalidated)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
  WHERE i.indrelid='pathways.digital_forms'::regclass AND c.relname='digital_forms_system_template_key'
  AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL)
 OR EXISTS(SELECT FROM pathways.digital_forms WHERE system_template_key IS NOT NULL)
 THEN RAISE EXCEPTION '0040 template column postconditions failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.ensure_default_registration_form(uuid)'::regprocedure
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='v'
  AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
 OR EXISTS(SELECT FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE p.oid='pathways.ensure_default_registration_form(uuid)'::regprocedure
  AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))
 OR NOT has_function_privilege('pathways_runtime','pathways.ensure_default_registration_form(uuid)','EXECUTE')
 OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
  WHERE has_function_privilege(r.name,'pathways.ensure_default_registration_form(uuid)','EXECUTE'))
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p2_guard_form()'::regprocedure
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef
  AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
 OR EXISTS(SELECT FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE p.oid='pathways.p2_guard_form()'::regprocedure AND a.grantee<>p.proowner)
 OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgfoid='pathways.p2_guard_form()'::regprocedure)<>1
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid='pathways.digital_forms'::regclass
  AND t.tgname='p2_form' AND t.tgfoid='pathways.p2_guard_form()'::regprocedure AND t.tgenabled='O'
  AND NOT t.tgisinternal AND t.tgtype=31)
 THEN RAISE EXCEPTION '0040 function security postconditions failed'; END IF;
 -- Call graph: inside pathways the definer calls only p05_has_project_permission (the excluded
 -- names are INSERT column lists, not calls), and never a runtime context or auth helper.
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.ensure_default_registration_form(uuid)'::regprocedure
  AND (p.prosrc ~ 'pathways\.(?!p05_has_project_permission\(|digital_forms\(|form_fields\(|audit_logs\()[a-z0-9_]+\s*\('
   OR p.prosrc ~ 'runtime_context|auth\.'))
 OR NOT has_function_privilege('prisma','pathways.p05_has_project_permission(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p09_role_allows(text,text)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p2_valid_options(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION '0040 definer calls a helper outside its reviewed set'; END IF;
END $$;
-- Behavioral postcondition as prisma: an unknown actor is denied with the fixed message, not a
-- privilege error.
DO $$ DECLARE denial text; BEGIN
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true),
  set_config('app.organization_id',gen_random_uuid()::text,true),set_config('app.user_id',gen_random_uuid()::text,true);
 BEGIN
  PERFORM pathways.ensure_default_registration_form(gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN denial:=SQLERRM; END;
 PERFORM set_config('request.jwt.claim.sub','',true),set_config('app.organization_id','',true),set_config('app.user_id','',true);
 IF denial IS DISTINCT FROM 'Default registration form unavailable' THEN
  RAISE EXCEPTION '0040 identity predicate postcondition failed'; END IF;
END $$;
COMMIT;
