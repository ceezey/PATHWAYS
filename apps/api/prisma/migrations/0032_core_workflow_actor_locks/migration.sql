-- Forward 0032 core workflow actor lock repair. No baseline/ledger rewrite.
BEGIN;
DO $$ DECLARE f record; expected record; actual record; BEGIN
 IF current_user<>'prisma' OR session_user<>'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0030_core_profile_partners' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION '0032 requires verified0030 and Prisma migration ownership'; END IF;
 SELECT p.* INTO f FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p3_guard_actors()');
 IF NOT FOUND OR f.prosecdef OR f.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype OR pg_catalog.pg_get_userbyid(f.proowner)<>'prisma' OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] OR pg_catalog.md5(pg_catalog.regexp_replace(f.prosrc,'[[:space:]]','','g'))<>'b29f819376c42df7f527c9669f5f94e7' OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>f.proowner) THEN RAISE EXCEPTION '0032 workflow actor function baseline differs'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgfoid=f.oid AND NOT tgisinternal)<>11 THEN RAISE EXCEPTION '0032 workflow actor trigger baseline differs'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('alert_rule_recommendations',ARRAY['created_by_id']::text[]),
 ('alert_rules',ARRAY['created_by_id','activated_by_id']::text[]),
 ('assessment_results',ARRAY['recorded_by_id']::text[]),
 ('budget_expense_entries',ARRAY['submitted_by_id','verified_by_id','approved_by_id','rejected_by_id']::text[]),
 ('decision_recommendations',ARRAY['proposed_by_id','reviewed_by_id','outcome_by_id']::text[]),
 ('evidence_media',ARRAY['submitted_by_id','verified_by_id','approved_by_id','rejected_by_id','public_submitted_by_id','public_approved_by_id','published_by_id']::text[]),
 ('project_budget_records',ARRAY['recorded_by_id']::text[]),
 ('project_evaluation_criteria',ARRAY['created_by_id','published_by_id']::text[]),
 ('project_evaluations',ARRAY['evaluated_by_id','reviewed_by_id','signed_off_by_id']::text[]),
 ('reports',ARRAY['created_by_id','generated_by_id']::text[]),
 ('rule_based_alerts',ARRAY['evaluated_by_id']::text[])
 ) x(relation_name,actor_fields) LOOP
 SELECT t.* INTO actual FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('pathways.'||expected.relation_name) AND t.tgname='p3_10_actors' AND t.tgfoid=f.oid;
 IF NOT FOUND OR actual.tgisinternal OR actual.tgenabled<>'O' OR actual.tgtype<>23 OR actual.tgnargs<>pg_catalog.cardinality(expected.actor_fields) OR actual.tgargs IS DISTINCT FROM (SELECT pg_catalog.decode(pg_catalog.string_agg(pg_catalog.encode(pg_catalog.convert_to(v,'UTF8'),'hex')||'00','' ORDER BY n),'hex') FROM pg_catalog.unnest(expected.actor_fields) WITH ORDINALITY e(v,n)) THEN RAISE EXCEPTION '0032 workflow actor trigger attachment differs'; END IF;
 END LOOP;
END $$;
-- Proposed forward repair only. Do not apply independently or rewrite baseline.
-- Preserves the original trigger attachments/actor fields and same-row lock.
CREATE OR REPLACE FUNCTION pathways.p3_guard_actors() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE field text; value uuid;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  IF TG_OP='INSERT' OR (pg_catalog.to_jsonb(NEW)->field) IS DISTINCT FROM (pg_catalog.to_jsonb(OLD)->field) THEN
   value := (pg_catalog.to_jsonb(NEW)->>field)::uuid;
   IF value IS NOT NULL THEN
    -- An invoker FOR SHARE also demands the users.authorize UPDATE policy.
    -- This fixed trigger performs only the original active-profile lock; it
    -- does not confer user UPDATE, workflow permission, assignment, or scope.
    IF session_user='pathways_runtime' AND (
      NEW.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
      OR NOT EXISTS(SELECT FROM pathways.system_users u
       JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
       JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
       WHERE u.id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
       AND u.organization_id=NEW.organization_id
       AND u.auth_user_id=nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
       AND u.account_status='ACTIVE' AND u.archived_at IS NULL)
    ) THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Workflow actor must be an active profile in the same organization';
    END IF;
    IF session_user NOT IN ('pathways_runtime','prisma','postgres') THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Workflow actor must be an active profile in the same organization';
    END IF;
    PERFORM 1 FROM pathways.system_users
     WHERE id=value AND organization_id=NEW.organization_id AND account_status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Workflow actor must be an active profile in the same organization'; END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways.p3_guard_actors() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_actors() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

COMMIT;
