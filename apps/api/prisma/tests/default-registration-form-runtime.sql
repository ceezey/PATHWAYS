-- cr-pathways-default-registration-form (0040): disposable behavioral checks for the system default
-- registration form, its provisioning definer and the narrow p2_guard_form exemption. Synthetic
-- fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or phase4 replay database that already has 0040 applied.
-- The prisma owner-role memberships are revoked inside this transaction first, so every check runs
-- in the hosted post-0031/0034-cleanup role state; the rollback restores the local cluster.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'Default registration form checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE drf_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON drf_results TO pathways_runtime, prisma;

-- Hosted post-cleanup role state: prisma holds no owner-role memberships at all.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT g.rolname AS granted, m.grantor::regrole::text AS grantor FROM pg_auth_members m
  JOIN pg_roles g ON g.oid=m.roleid WHERE m.member='prisma'::regrole LOOP
  EXECUTE format('REVOKE %I FROM prisma GRANTED BY %s CASCADE',r.granted,r.grantor);
 END LOOP;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member='prisma'::regrole) THEN
  RAISE EXCEPTION 'post-cleanup role state'; END IF;
 INSERT INTO drf_results VALUES('post-cleanup-role-state');
END $$;

INSERT INTO auth.users(id) VALUES
 ('79000000-0000-4000-8000-000000000011'),('79000000-0000-4000-8000-000000000012'),
 ('79000000-0000-4000-8000-000000000013'),('79000000-0000-4000-8000-000000000014'),
 ('79000000-0000-4000-8000-000000000015'),('79000000-0000-4000-8000-000000000016'),
 ('79000000-0000-4000-8000-000000000017'),('79000000-0000-4000-8000-000000000018');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('79000000-0000-4000-8000-000000000001','DRF_ORG_A','Synthetic default form organization A'),
 ('79000000-0000-4000-8000-000000000002','DRF_ORG_B','Synthetic default form organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,v.org::uuid,r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000001','PROJECT_OFFICER','79000000-0000-4000-8000-000000000011','Synthetic officer','drf-po@example.invalid'),
 ('79000000-0000-4000-8000-000000000032','79000000-0000-4000-8000-000000000001','MONITORING_AND_EVALUATION_OFFICER','79000000-0000-4000-8000-000000000012','Synthetic M&E','drf-me@example.invalid'),
 ('79000000-0000-4000-8000-000000000033','79000000-0000-4000-8000-000000000001','PROJECT_MANAGER','79000000-0000-4000-8000-000000000013','Synthetic project manager','drf-pm@example.invalid'),
 ('79000000-0000-4000-8000-000000000034','79000000-0000-4000-8000-000000000001','SYSTEM_ADMINISTRATOR','79000000-0000-4000-8000-000000000014','Synthetic administrator','drf-admin@example.invalid'),
 ('79000000-0000-4000-8000-000000000035','79000000-0000-4000-8000-000000000001','PROGRAM_MANAGER','79000000-0000-4000-8000-000000000015','Synthetic program manager','drf-pgm@example.invalid'),
 ('79000000-0000-4000-8000-000000000036','79000000-0000-4000-8000-000000000001','GRANT_MANAGER','79000000-0000-4000-8000-000000000016','Synthetic grant manager','drf-gm@example.invalid'),
 ('79000000-0000-4000-8000-000000000037','79000000-0000-4000-8000-000000000002','PROJECT_OFFICER','79000000-0000-4000-8000-000000000017','Synthetic foreign officer','drf-foreign@example.invalid'),
 ('79000000-0000-4000-8000-000000000038','79000000-0000-4000-8000-000000000001','PROJECT_OFFICER','79000000-0000-4000-8000-000000000018','Synthetic unassigned officer','drf-po2@example.invalid')
) v(id,org,role_code,sub,name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id) VALUES
 ('79000000-0000-4000-8000-000000000039','79000000-0000-4000-8000-000000000001','DRF_PROGRAM','Synthetic program','79000000-0000-4000-8000-000000000035');
-- Fixture projects are written directly; the rules source-proof hook only admits runtime sessions.
ALTER TABLE pathways.projects DISABLE TRIGGER f10_prove_project_source;
INSERT INTO pathways.projects(id,organization_id,program_id,code,title,created_by_id) VALUES
 ('79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000039','DRF_A_1','Synthetic project A1','79000000-0000-4000-8000-000000000033'),
 ('79000000-0000-4000-8000-000000000042','79000000-0000-4000-8000-000000000001',NULL,'DRF_A_2','Synthetic project A2','79000000-0000-4000-8000-000000000033'),
 ('79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000002',NULL,'DRF_B_1','Synthetic project B1','79000000-0000-4000-8000-000000000037'),
 ('79000000-0000-4000-8000-000000000044','79000000-0000-4000-8000-000000000001',NULL,'DRF_A_3','Synthetic project A3','79000000-0000-4000-8000-000000000033');
ALTER TABLE pathways.projects ENABLE TRIGGER f10_prove_project_source;
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
SELECT v.org::uuid,v.project::uuid,v.usr::uuid,v.usr::uuid FROM (VALUES
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000032'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000033'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000035'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000036'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000042','79000000-0000-4000-8000-000000000038'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','79000000-0000-4000-8000-000000000032'),
 ('79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000037')
) v(org,project,usr);

-- Catalog: exact definer and guard security, unchanged trigger binding, hosted privilege reality.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.ensure_default_registration_form(uuid)'::regprocedure
  AND pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""'])
 OR NOT has_function_privilege('pathways_runtime','pathways.ensure_default_registration_form(uuid)','EXECUTE')
 OR has_function_privilege('anon','pathways.ensure_default_registration_form(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.ensure_default_registration_form(uuid)','EXECUTE')
 OR has_function_privilege('service_role','pathways.ensure_default_registration_form(uuid)','EXECUTE')
 OR has_function_privilege('pathways_runtime','pathways.p2_guard_form()','EXECUTE')
 OR NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.p2_guard_form()'::regprocedure
  AND pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.proacl=ARRAY['prisma=X/prisma']::aclitem[])
 OR NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='pathways.digital_forms'::regclass AND tgname='p2_form'
  AND tgfoid='pathways.p2_guard_form()'::regprocedure AND tgtype=31 AND tgenabled='O')
 -- Everything the definer calls or touches is executable/owned by prisma without a membership.
 OR NOT has_function_privilege('prisma','pathways.p05_has_project_permission(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p09_role_allows(text,text)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p2_valid_options(jsonb)','EXECUTE')
 OR NOT has_function_privilege('prisma','pg_catalog.hashtextextended(text,bigint)','EXECUTE')
 OR NOT has_function_privilege('prisma','pg_catalog.pg_advisory_xact_lock(bigint)','EXECUTE')
 OR NOT has_table_privilege('prisma','pathways.digital_forms','SELECT,INSERT,UPDATE')
 OR NOT has_table_privilege('prisma','pathways.form_fields','INSERT')
 OR NOT has_table_privilege('prisma','pathways.audit_logs','INSERT')
 THEN RAISE EXCEPTION 'catalog security'; END IF;
 INSERT INTO drf_results VALUES('catalog');
END $$;

-- Idempotent provisioning by a Project Officer; the same form for a second call and other registrars.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);
DO $$ DECLARE r record; again record; BEGIN
 -- Runtime cannot read or change the template tables outside its scoped policies.
 SELECT * INTO r FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041');
 IF r.outcome<>'PROVISIONED' OR r.provisioned_form IS NULL THEN RAISE EXCEPTION 'provision %',r; END IF;
 SELECT * INTO again FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041');
 IF again.outcome<>'EXISTING' OR again.provisioned_form<>r.provisioned_form THEN RAISE EXCEPTION 'idempotent %',again; END IF;
 -- The registrar reads it through the existing registration-definition policy.
 IF NOT EXISTS(SELECT FROM pathways.digital_forms WHERE id=r.provisioned_form AND status='PUBLISHED')
 OR (SELECT count(*) FROM pathways.form_fields WHERE form_id=r.provisioned_form)<>22
 OR NOT pathways.p29_lock_registration_definition('79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000041',r.provisioned_form,1)
 THEN RAISE EXCEPTION 'registrar definition access'; END IF;
 INSERT INTO drf_results VALUES('provision-idempotent');
END $$;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000012',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000032',true);
DO $$ BEGIN
 IF (SELECT outcome FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041'))<>'EXISTING'
 THEN RAISE EXCEPTION 'M&E sees existing'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000013',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000033',true);
DO $$ BEGIN
 IF (SELECT outcome FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041'))<>'EXISTING'
 THEN RAISE EXCEPTION 'PM sees existing'; END IF;
 INSERT INTO drf_results VALUES('registrar-roles');
END $$;
RESET ROLE;

-- Shape and attribution: fixed field set, system authorship, registrar publication, audit.
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM pathways.digital_forms WHERE project_id='79000000-0000-4000-8000-000000000041'
  AND system_template_key='SYSTEM_DEFAULT_REGISTRATION_V1';
 IF f.code<>'system_default_registration' OR f.version<>1 OR f.form_type<>'BENEFICIARY_REGISTRATION'
 OR f.status<>'PUBLISHED' OR f.created_by_id IS NOT NULL
 OR f.published_by_id<>'79000000-0000-4000-8000-000000000031' OR f.published_at IS NULL
 OR (SELECT count(*) FROM pathways.digital_forms WHERE system_template_key IS NOT NULL
  AND organization_id='79000000-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'template shape %',f; END IF;
 IF (SELECT array_agg(code ORDER BY sequence_no) FROM pathways.form_fields WHERE form_id=f.id)<>ARRAY[
  'registration_operation','beneficiary_code','subject_type','display_name','first_name','middle_name','last_name',
  'sex','birth_date','age_at_registration','disability_status','location_barangay','location_city_municipality',
  'location_province','consent_recorded','data_processing_consent_recorded','is_minor','guardian_consent_recorded',
  'enrollment_date','external_identifier_type','external_identifier_value','profile_update_fields']
 OR (SELECT array_agg(code ORDER BY code) FROM pathways.form_fields WHERE form_id=f.id AND is_required)<>ARRAY[
  'beneficiary_code','consent_recorded','data_processing_consent_recorded','enrollment_date','registration_operation','subject_type']
 OR (SELECT array_agg(code ORDER BY code) FROM pathways.form_fields WHERE form_id=f.id AND is_saddd_field)<>ARRAY[
  'age_at_registration','birth_date','disability_status','sex']
 THEN RAISE EXCEPTION 'field set'; END IF;
 IF (SELECT count(*) FROM pathways.audit_logs WHERE action='DEFAULT_REGISTRATION_FORM_PROVISIONED' AND entity_id=f.id::text
  AND actor_user_id='79000000-0000-4000-8000-000000000031' AND project_id=f.project_id
  AND changes->'createdById'='null'::jsonb AND changes->>'publishedById'='79000000-0000-4000-8000-000000000031')<>1
 OR EXISTS(SELECT FROM pathways.audit_logs WHERE action='DEFAULT_REGISTRATION_FORM_PROVISIONED' AND entity_id=f.id::text
  AND changes ?| ARRAY['values','beneficiary','email','fullName'])
 THEN RAISE EXCEPTION 'audit'; END IF;
 INSERT INTO drf_results VALUES('shape-attribution-audit');
END $$;

-- Denials: aggregate-only and administrative roles, unassigned project, cross-organization, forged context.
SET LOCAL ROLE pathways_runtime;
DO $$ DECLARE denied integer:=0; who record; BEGIN
 FOR who IN SELECT * FROM (VALUES
  ('79000000-0000-4000-8000-000000000014','79000000-0000-4000-8000-000000000034','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041'),
  ('79000000-0000-4000-8000-000000000015','79000000-0000-4000-8000-000000000035','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041'),
  ('79000000-0000-4000-8000-000000000016','79000000-0000-4000-8000-000000000036','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041'),
  -- Project Officer on a project outside their assignment.
  ('79000000-0000-4000-8000-000000000011','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000042'),
  -- Foreign-organization officer targeting organization A's project in its own context.
  ('79000000-0000-4000-8000-000000000017','79000000-0000-4000-8000-000000000037','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000041'),
  -- Forged organization selector: foreign user id claiming organization A.
  ('79000000-0000-4000-8000-000000000017','79000000-0000-4000-8000-000000000037','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041'),
  -- Mismatched verified subject.
  ('79000000-0000-4000-8000-000000000017','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041'),
  -- Organization A officer targeting organization B's project.
  ('79000000-0000-4000-8000-000000000011','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000043')
 ) v(sub,usr,org,project) LOOP
  PERFORM set_config('request.jwt.claim.sub',who.sub,true),set_config('app.user_id',who.usr,true),
   set_config('app.organization_id',who.org,true);
  BEGIN
   PERFORM pathways.ensure_default_registration_form(who.project::uuid);
   RAISE EXCEPTION 'not denied: % on %',who.usr,who.project;
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'Default registration form unavailable' THEN RAISE EXCEPTION 'denial message %',SQLERRM; END IF;
   denied:=denied+1;
  END;
 END LOOP;
 PERFORM set_config('app.user_id','not-a-uuid',true);
 BEGIN PERFORM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041'); RAISE EXCEPTION 'malformed context';
 EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 IF denied<>9 THEN RAISE EXCEPTION 'denials %',denied; END IF;
 INSERT INTO drf_results VALUES('denials');
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.digital_forms WHERE system_template_key IS NOT NULL
  AND project_id IN('79000000-0000-4000-8000-000000000042','79000000-0000-4000-8000-000000000043'))<>0
 THEN RAISE EXCEPTION 'denied call provisioned'; END IF;
 INSERT INTO drf_results VALUES('denials-no-write');
END $$;

-- Guard: the exemption applies only to the tagged template published inside the prisma definer.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000032',true);
DO $$ BEGIN
 -- A form manager cannot insert, set, change or clear the tag.
 BEGIN
  INSERT INTO pathways.digital_forms(organization_id,project_id,code,version,name,form_type,status,system_template_key)
  VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','system_default_registration',1,
   'Forged template','BENEFICIARY_REGISTRATION','DRAFT','SYSTEM_DEFAULT_REGISTRATION_V1');
  RAISE EXCEPTION 'runtime tagged insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id)
 VALUES('79000000-0000-4000-8000-000000000061','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044',
  'self_published',1,'Synthetic self-published','BENEFICIARY_REGISTRATION','DRAFT','79000000-0000-4000-8000-000000000032');
 INSERT INTO pathways.form_fields(organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no)
 VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','79000000-0000-4000-8000-000000000061',
  'beneficiary_code','Beneficiary code','TEXT',true,1);
 BEGIN
  UPDATE pathways.digital_forms SET system_template_key='SYSTEM_DEFAULT_REGISTRATION_V1'
  WHERE id='79000000-0000-4000-8000-000000000061';
  RAISE EXCEPTION 'runtime tag set';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Same author and publisher on an ordinary form is still rejected.
 BEGIN
  UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id='79000000-0000-4000-8000-000000000032',published_at=now()
  WHERE id='79000000-0000-4000-8000-000000000061';
  RAISE EXCEPTION 'runtime self publication';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Publication requires a different attributable reviewer' THEN RAISE; END IF;
 END;
 INSERT INTO drf_results VALUES('guard-runtime');
END $$;
RESET ROLE;
-- Even the owner and a superuser cannot use the exemption for an untagged form, and a superuser
-- (not prisma) cannot tag a form.
DO $$ BEGIN
 BEGIN
  INSERT INTO pathways.digital_forms(organization_id,project_id,code,version,name,form_type,status,system_template_key)
  VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','system_default_registration',1,
   'Forged template','BENEFICIARY_REGISTRATION','DRAFT','SYSTEM_DEFAULT_REGISTRATION_V1');
  RAISE EXCEPTION 'superuser tagged insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE prisma;
DO $$ BEGIN
 BEGIN
  UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id='79000000-0000-4000-8000-000000000032',published_at=now()
  WHERE id='79000000-0000-4000-8000-000000000061';
  RAISE EXCEPTION 'owner self publication';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Publication requires a different attributable reviewer' THEN RAISE; END IF;
 END;
 INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status)
 VALUES('79000000-0000-4000-8000-000000000062','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044',
  'authorless',1,'Synthetic authorless','BENEFICIARY_REGISTRATION','DRAFT');
 INSERT INTO pathways.form_fields(organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no)
 VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','79000000-0000-4000-8000-000000000062',
  'beneficiary_code','Beneficiary code','TEXT',true,1);
 BEGIN
  UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id='79000000-0000-4000-8000-000000000032',published_at=now()
  WHERE id='79000000-0000-4000-8000-000000000062';
  RAISE EXCEPTION 'untagged authorless publication';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Publication requires a different attributable reviewer' THEN RAISE; END IF;
 END;
 -- The tag shape is pinned by the check constraint, even for the owner.
 BEGIN
  INSERT INTO pathways.digital_forms(organization_id,project_id,code,version,name,form_type,status,system_template_key)
  VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','other_code',1,
   'Wrong template','BENEFICIARY_REGISTRATION','DRAFT','SYSTEM_DEFAULT_REGISTRATION_V1');
  RAISE EXCEPTION 'template shape unchecked';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- The published template is immutable, its tag cannot change and its fields cannot change.
 BEGIN
  UPDATE pathways.digital_forms SET system_template_key=NULL WHERE system_template_key IS NOT NULL
   AND project_id='79000000-0000-4000-8000-000000000041';
  RAISE EXCEPTION 'tag cleared';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE pathways.digital_forms SET name='Renamed template' WHERE system_template_key IS NOT NULL
   AND project_id='79000000-0000-4000-8000-000000000041';
  RAISE EXCEPTION 'template renamed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Published form definitions are immutable' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE pathways.form_fields SET label='Changed' WHERE form_id=(SELECT id FROM pathways.digital_forms
   WHERE system_template_key IS NOT NULL AND project_id='79000000-0000-4000-8000-000000000041') AND code='sex';
  RAISE EXCEPTION 'template field changed';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  DELETE FROM pathways.digital_forms WHERE system_template_key IS NOT NULL
   AND project_id='79000000-0000-4000-8000-000000000041';
  RAISE EXCEPTION 'template deleted';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 INSERT INTO drf_results VALUES('guard-exemption-narrow');
END $$;
RESET ROLE;

-- An untagged form holding the reserved code is reported, not overwritten.
INSERT INTO pathways.digital_forms(organization_id,project_id,code,version,name,form_type,status,created_by_id)
VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000044','system_default_registration',1,
 'Synthetic squatter','BENEFICIARY_REGISTRATION','DRAFT','79000000-0000-4000-8000-000000000032');
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000044');
 IF r.outcome<>'CODE_IN_USE' OR r.provisioned_form IS NOT NULL THEN RAISE EXCEPTION 'code in use %',r; END IF;
 INSERT INTO drf_results VALUES('code-in-use');
END $$;

-- Registration through the template writes the same rows as a custom form: profile, enrollment,
-- validated submission with typed responses, and consent provenance, with deferred checks forced.
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000012',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000032',true);
DO $$ DECLARE form uuid; BEGIN
 SELECT provisioned_form INTO form FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041');
 IF NOT pathways.p29_lock_registration_definition('79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000041',form,1) THEN RAISE EXCEPTION 'lock'; END IF;
 INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,display_name,first_name,last_name,sex,birth_date,
  age_at_registration,disability_status,consent_recorded,data_processing_consent_recorded,is_minor,guardian_consent_recorded,
  created_by_id,created_at,updated_at)
 VALUES('79000000-0000-4000-8000-000000000071','79000000-0000-4000-8000-000000000001','DRF-001','INDIVIDUAL',
  'Synthetic Person','Synthetic','Person','NOT_SPECIFIED','2000-01-01',26,'NOT_SPECIFIED',true,true,false,false,
  '79000000-0000-4000-8000-000000000032',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 VALUES('79000000-0000-4000-8000-000000000072','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041',
  '79000000-0000-4000-8000-000000000071',CURRENT_DATE,'79000000-0000-4000-8000-000000000032');
 INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,enrollment_id,
  submitted_by_id,source,status)
 VALUES('79000000-0000-4000-8000-000000000075','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041',
  form,1,'79000000-0000-4000-8000-000000000085','79000000-0000-4000-8000-000000000072','79000000-0000-4000-8000-000000000032',
  'DIRECT_ENCODING','DRAFT');
 INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value)
 SELECT f.organization_id,f.project_id,f.form_id,'79000000-0000-4000-8000-000000000075',f.id,v.value
 FROM pathways.form_fields f JOIN (VALUES
  ('registration_operation','"CREATE"'::jsonb),('beneficiary_code','"DRF-001"'),('subject_type','"INDIVIDUAL"'),
  ('display_name','"Synthetic Person"'),('first_name','"Synthetic"'),('middle_name','null'),('last_name','"Person"'),
  ('sex','"NOT_SPECIFIED"'),('birth_date','"2000-01-01"'),('age_at_registration','26'),('disability_status','"NOT_SPECIFIED"'),
  ('location_barangay','"Test"'),('location_city_municipality','"Test City"'),('location_province','"Test Province"'),
  ('consent_recorded','true'),('data_processing_consent_recorded','true'),('is_minor','false'),
  ('guardian_consent_recorded','false'),('enrollment_date',to_jsonb(CURRENT_DATE::text)),
  ('external_identifier_type','null'),('external_identifier_value','null'),('profile_update_fields','null')
 ) v(code,value) ON v.code=f.code
 WHERE f.form_id=form;
 UPDATE pathways.form_submissions SET status='VALIDATED',submitted_at=date_trunc('milliseconds',CURRENT_TIMESTAMP),
  validated_by_id='79000000-0000-4000-8000-000000000032',validated_at=date_trunc('milliseconds',CURRENT_TIMESTAMP)
 WHERE id='79000000-0000-4000-8000-000000000075';
 INSERT INTO pathways.beneficiary_consent_records(organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,
  source,recorded_by_id,recorded_at)
 SELECT '79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000071',
  '79000000-0000-4000-8000-000000000072','79000000-0000-4000-8000-000000000075',k::pathways.beneficiary_consent_kind,'DIRECT_ENTRY',
  '79000000-0000-4000-8000-000000000032',date_trunc('milliseconds',CURRENT_TIMESTAMP)
 FROM unnest(ARRAY['PARTICIPATION','DATA_PROCESSING']) k;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF (SELECT count(*) FROM pathways.form_response_values WHERE submission_id='79000000-0000-4000-8000-000000000075')<>22
 THEN RAISE EXCEPTION 'responses'; END IF;
 INSERT INTO drf_results VALUES('registration-through-template');
END $$;
RESET ROLE;

-- An archived template is returned, never recreated, and no longer offered for registration.
ALTER TABLE pathways.digital_forms DISABLE TRIGGER p09_form_archive;
UPDATE pathways.digital_forms SET status='ARCHIVED',archived_at=clock_timestamp()
WHERE system_template_key IS NOT NULL AND project_id='79000000-0000-4000-8000-000000000041';
ALTER TABLE pathways.digital_forms ENABLE TRIGGER p09_form_archive;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000011',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM pathways.ensure_default_registration_form('79000000-0000-4000-8000-000000000041');
 IF r.outcome<>'EXISTING' OR pathways.p29_registration_definition('79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000041',r.provisioned_form,NULL) THEN RAISE EXCEPTION 'archived %',r; END IF;
 INSERT INTO drf_results VALUES('archived-not-recreated');
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.digital_forms WHERE system_template_key IS NOT NULL
  AND project_id='79000000-0000-4000-8000-000000000041')<>1 THEN RAISE EXCEPTION 'recreated'; END IF;
END $$;

SELECT 'DEFAULT_REGISTRATION_FORM_ASSERTIONS_PASSED=' || count(*) AS result FROM drf_results;
DO $$ BEGIN IF (SELECT count(*) FROM drf_results)<>12 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
ROLLBACK;
