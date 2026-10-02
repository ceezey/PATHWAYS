-- 0055 applies RBAC v4 cells V4-C01, C02, C06, C07, C09 and C10 and keeps the p09_role_allows ACL.
-- Run as a local superuser against a disposable replay database with 0055 applied; rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF (current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' AND current_database() <> 'postgres')
 OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'rbac v4 checks require a disposable local database'; END IF;
END $$;

DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('PROGRAM_MANAGER','projects.archive',false),('GRANT_MANAGER','projects.archive',false),
  ('SYSTEM_ADMINISTRATOR','budgets.read',false),('PROGRAM_MANAGER','activities.read',true),
  ('GRANT_MANAGER','activities.read',true),('PROJECT_OFFICER','activities.create',false),
  ('PROJECT_OFFICER','dashboards.customize',false),('PROJECT_OFFICER','assessments.read',false),
  ('PROJECT_OFFICER','analytics.saddd.read',false),('PROJECT_OFFICER','beneficiaries.aggregates.read',true),
  ('PROJECT_OFFICER','submissions.write',true),('MONITORING_AND_EVALUATION_OFFICER','submissions.write',true),
  ('PROGRAM_MANAGER','activities.create',false),('GRANT_MANAGER','activities.update',false),
  ('PROJECT_MANAGER','activities.create',true),('PROJECT_MANAGER','projects.archive',true),
  ('SYSTEM_ADMINISTRATOR','activities.read',true),('SYSTEM_ADMINISTRATOR','journeys.read',false),
  ('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review',true),
  ('PROJECT_MANAGER','indicators.library.create',true)) v(role,perm,want)
 LOOP
  IF pathways.p09_role_allows(c.role,c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'p09_role_allows(%,%) expected %',c.role,c.perm,c.want; END IF;
  IF EXISTS(SELECT FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
   JOIN pathways.permissions p ON p.id=rp.permission_id WHERE r.code=c.role AND p.code=c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'role_permissions(%,%) expected %',c.role,c.perm,c.want; END IF;
 END LOOP;
END $$;

DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['pathways_runtime','rules_human_owner','rules_outcome_owner','rules_eligibility_owner','rules_config_owner',
  'rules_capacity_owner','rules_runtime_guard_owner','rules_enqueue_owner','rules_source_proof_owner'] LOOP
  IF NOT has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % cannot execute p09_role_allows after 0055',r; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % can execute p09_role_allows after 0055',r; END IF;
 END LOOP;
END $$;
ROLLBACK;
