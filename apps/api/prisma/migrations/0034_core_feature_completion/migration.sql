-- 0034 core feature completion; canonical forward migration.
BEGIN;
DO $$ BEGIN
 IF current_user<>'prisma' OR session_user<>'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations
 WHERE migration_name='0033_core_canonical_activity_review_guard' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION 'Canonical0033 and actual migration identity required'; END IF;
END $$;
DO $$ DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
BEGIN
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 IF postgres_oid IS NULL OR prisma_oid IS NULL OR hosted IS NULL OR
  (NOT hosted AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE oid=postgres_oid AND rolsuper)) THEN
  RAISE EXCEPTION 'Exact DBA role provisioning required' USING ERRCODE='55000';
 END IF;
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['public_projection_owner','report_projection_owner','finance_operation_owner'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option) OR (role_name<>ALL(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) AND m.member=prisma_oid AND m.grantor=postgres_oid AND NOT m.admin_option AND m.inherit_option AND m.set_option)))
   OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND
    (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) <> (CASE WHEN hosted THEN 1 ELSE 0 END)
   OR (role_name<>ALL(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) AND (SELECT count(*) FROM pg_catalog.pg_auth_members m
    WHERE m.roleid=existing.oid AND m.member=prisma_oid AND m.grantor=postgres_oid AND NOT m.admin_option AND m.inherit_option AND m.set_option)<>1)
   OR EXISTS(SELECT FROM pg_catalog.pg_roles app WHERE app.rolname=ANY(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker','pathways_rules_sweeper'])
    AND app.oid<>existing.oid AND (pg_catalog.pg_has_role(app.oid,existing.oid,'MEMBER') OR pg_catalog.pg_has_role(app.oid,existing.oid,'USAGE') OR pg_catalog.pg_has_role(app.oid,existing.oid,'SET')))
 THEN
   RAISE EXCEPTION 'Exact DBA role provisioning required' USING ERRCODE='55000';
  END IF;
 END LOOP;
END $$;

DO $context_install$ BEGIN
<<p34_context_helper_acl>>
DECLARE
 ctx_name text;ctx_fn record;ctx_owner oid;ctx_expected oid[];
BEGIN
 SELECT oid INTO ctx_owner FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT pg_catalog.array_agg(oid ORDER BY oid) INTO ctx_expected FROM pg_catalog.pg_roles
 WHERE rolname=ANY(ARRAY['postgres','pathways_runtime','report_projection_owner','finance_operation_owner']);
 IF ctx_owner IS NULL OR pg_catalog.cardinality(ctx_expected)<>4 THEN RAISE EXCEPTION 'Core context helper principals unavailable' USING ERRCODE='42501'; END IF;
 FOREACH ctx_name IN ARRAY ARRAY['runtime_context_organization','runtime_context_user'] LOOP
  SELECT p.* INTO ctx_fn FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure(pg_catalog.format('pathways.%I()',ctx_name));
  IF NOT FOUND OR ctx_fn.proowner<>ctx_owner OR ctx_fn.prorettype<>'pg_catalog.uuid'::pg_catalog.regtype
   OR ctx_fn.proretset OR ctx_fn.prokind<>'f' OR NOT ctx_fn.prosecdef OR ctx_fn.provolatile<>'s'
   OR ctx_fn.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR ctx_fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR pg_catalog.md5(pg_catalog.regexp_replace(ctx_fn.prosrc,'[[:space:]]','','g'))<>
    (CASE ctx_name WHEN 'runtime_context_organization' THEN '2d76aa3b324899355b56837213df25a0' ELSE 'f27cc6e4905d203b147f022435e6cb61' END)
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a
    WHERE a.grantor<>ctx_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR NOT (a.grantee=ANY(ctx_expected)))
   OR (SELECT pg_catalog.array_agg(a.grantee ORDER BY a.grantee) FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a) IS DISTINCT FROM ctx_expected
  THEN RAISE EXCEPTION 'Core context helper definition or exact ACL differs' USING ERRCODE='42501'; END IF;
 END LOOP;
END p34_context_helper_acl;
END $context_install$;

CREATE TABLE pathways.project_publications (
 organization_id uuid NOT NULL,
 project_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN('FOR_REVIEW','APPROVED','PUBLISHED')),
 last_operation text NOT NULL CHECK(last_operation IN('SUBMIT','APPROVE','PUBLISH','WITHDRAW')),
 summary text NOT NULL CHECK(length(btrim(summary)) BETWEEN 1 AND 4000),
 snapshot jsonb NOT NULL,
 submitted_by_id uuid NOT NULL,
 submitted_at timestamptz(3) NOT NULL,
 approved_by_id uuid,
 approved_at timestamptz(3),
 published_by_id uuid,
 published_at timestamptz(3),
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,project_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(organization_id,submitted_by_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(organization_id,approved_by_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(organization_id,published_by_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT publication_snapshot_shape CHECK(jsonb_typeof(snapshot)='object'
  AND snapshot ?& ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate']
  AND snapshot - ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate'] = '{}'::jsonb
  AND (snapshot->>'id'=project_id::text) IS TRUE AND (snapshot->>'approvedSummary'=summary) IS TRUE
  AND jsonb_typeof(snapshot->'title')='string' AND jsonb_typeof(snapshot->'code')='string'),
 CONSTRAINT publication_actor_state CHECK(
  (state='FOR_REVIEW' AND approved_by_id IS NULL AND approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
  OR (state='APPROVED' AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_id<>submitted_by_id AND approved_at>=submitted_at
   AND published_by_id IS NULL AND published_at IS NULL)
  OR (state='PUBLISHED' AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_id<>submitted_by_id AND approved_at>=submitted_at
   AND published_by_id IS NOT NULL AND published_at IS NOT NULL AND published_at>=approved_at))
);
ALTER TABLE pathways.project_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_publications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.project_publications FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON pathways.project_publications TO pathways_runtime;
CREATE POLICY p34_publication_staff_read ON pathways.project_publications FOR SELECT TO pathways_runtime
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p05_has_project_permission('public.preview',project_id));
CREATE POLICY p34_publication_staff_insert ON pathways.project_publications FOR INSERT TO pathways_runtime
 WITH CHECK(organization_id=pathways.runtime_context_organization() AND pathways.p05_has_project_permission('public.preview',project_id));
CREATE POLICY p34_publication_staff_update ON pathways.project_publications FOR UPDATE TO pathways_runtime
 USING(organization_id=pathways.runtime_context_organization() AND (
  pathways.p05_has_project_permission('public.preview',project_id)
  OR pathways.p05_has_project_permission('public.approve',project_id)
  OR pathways.p05_has_project_permission('public.publish',project_id)))
 WITH CHECK(organization_id=pathways.runtime_context_organization());

CREATE FUNCTION pathways.p34_guard_publication() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p record; actor uuid:=pathways.runtime_context_user(); now_at timestamptz(3):=clock_timestamp(); op text;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR actor IS NULL OR TG_OP='DELETE'
  OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
 THEN RAISE EXCEPTION 'Publication identity unavailable' USING ERRCODE='42501'; END IF;
 SELECT id,organization_id,title,code,implementation_area,sector,start_date,end_date INTO p
  FROM pathways.projects WHERE organization_id=NEW.organization_id AND id=NEW.project_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Publication project unavailable' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN op:='SUBMIT';
 ELSE
  IF ROW(NEW.organization_id,NEW.project_id) IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id)
  THEN RAISE EXCEPTION 'Publication scope immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='PUBLISHED' THEN
   IF NEW.state<>'FOR_REVIEW' OR NEW.revision<>OLD.revision+1
    OR ROW(NEW.summary,NEW.snapshot) IS DISTINCT FROM ROW(OLD.summary,OLD.snapshot)
   THEN RAISE EXCEPTION 'Published content must be withdrawn before replacement' USING ERRCODE='23514'; END IF;
   op:='WITHDRAW';
  ELSIF NEW.state='FOR_REVIEW' AND NEW.revision=OLD.revision+1 THEN op:='SUBMIT';
  ELSIF OLD.state='FOR_REVIEW' AND NEW.state='APPROVED' AND NEW.revision=OLD.revision THEN op:='APPROVE';
  ELSIF OLD.state='APPROVED' AND NEW.state='PUBLISHED' AND NEW.revision=OLD.revision THEN op:='PUBLISH';
  ELSE RAISE EXCEPTION 'Invalid publication transition' USING ERRCODE='23514'; END IF;
 END IF;
 IF op IN('SUBMIT','WITHDRAW') THEN
  IF (op='SUBMIT' AND NOT pathways.p05_has_project_permission('public.preview',NEW.project_id))
   OR (op='WITHDRAW' AND NOT pathways.p05_has_project_permission('public.publish',NEW.project_id))
   OR (TG_OP='INSERT' AND (NEW.revision<>1 OR NEW.state<>'FOR_REVIEW'))
  THEN RAISE EXCEPTION 'Publication submission unavailable' USING ERRCODE='42501'; END IF;
  NEW.submitted_by_id:=actor; NEW.submitted_at:=now_at;
  NEW.approved_by_id:=NULL; NEW.approved_at:=NULL; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
  IF op='WITHDRAW' THEN NEW.snapshot:=OLD.snapshot;
  ELSE NEW.snapshot:=jsonb_build_object('id',p.id,'title',p.title,'code',p.code,'approvedSummary',NEW.summary,
    'area',p.implementation_area,'sector',p.sector,'startDate',p.start_date,'endDate',p.end_date); END IF;
 ELSE
  IF ROW(NEW.summary,NEW.snapshot,NEW.submitted_by_id,NEW.submitted_at)
   IS DISTINCT FROM ROW(OLD.summary,OLD.snapshot,OLD.submitted_by_id,OLD.submitted_at)
  THEN RAISE EXCEPTION 'Approved publication content immutable' USING ERRCODE='23514'; END IF;
  IF op='APPROVE' THEN
   IF NOT pathways.p05_has_project_permission('public.approve',NEW.project_id) OR actor=OLD.submitted_by_id
   THEN RAISE EXCEPTION 'Distinct publication approval required' USING ERRCODE='42501'; END IF;
   NEW.approved_by_id:=actor; NEW.approved_at:=now_at; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
  ELSE
   IF NOT pathways.p05_has_project_permission('public.publish',NEW.project_id)
    OR ROW(NEW.approved_by_id,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by_id,OLD.approved_at)
   THEN RAISE EXCEPTION 'Publication publishing unavailable' USING ERRCODE='42501'; END IF;
   NEW.published_by_id:=actor; NEW.published_at:=now_at;
  END IF;
 END IF;
 NEW.last_operation:=op; NEW.updated_at:=now_at;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(NEW.organization_id,NEW.project_id,actor,'PUBLICATION_'||op,'ProjectPublication',NEW.project_id::text,
  jsonb_build_object('revision',NEW.revision,'state',NEW.state));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p34_guard_publication() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p34_guard_publication BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_publications
 FOR EACH ROW EXECUTE FUNCTION pathways.p34_guard_publication();

CREATE TABLE pathways.publication_requests(
 organization_id uuid NOT NULL,project_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,
 operation_code text NOT NULL CHECK(operation_code IN('SUBMIT','APPROVE','PUBLISH','WITHDRAW')),
 request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),
 resulting_revision integer NOT NULL CHECK(resulting_revision>0),resulting_state text NOT NULL CHECK(resulting_state IN('FOR_REVIEW','APPROVED','PUBLISHED')),
 resulting_updated_at timestamptz(3) NOT NULL,recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,actor_id,request_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways.project_publications(organization_id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(organization_id,actor_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
ALTER TABLE pathways.publication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.publication_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.publication_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON pathways.publication_requests TO pathways_runtime;
CREATE POLICY p34_publication_request_scope ON pathways.publication_requests FOR SELECT TO pathways_runtime USING(
 organization_id=pathways.runtime_context_organization() AND actor_id=pathways.runtime_context_user()
 AND pathways.p05_has_project_permission(CASE operation_code WHEN 'SUBMIT' THEN 'public.preview' WHEN 'APPROVE' THEN 'public.approve' ELSE 'public.publish' END,project_id));
CREATE POLICY p34_publication_request_insert ON pathways.publication_requests FOR INSERT TO pathways_runtime WITH CHECK(
 organization_id=pathways.runtime_context_organization() AND actor_id=pathways.runtime_context_user()
 AND pathways.p05_has_project_permission(CASE operation_code WHEN 'SUBMIT' THEN 'public.preview' WHEN 'APPROVE' THEN 'public.approve' ELSE 'public.publish' END,project_id));
CREATE FUNCTION pathways.p34_guard_publication_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE publication record; current_xid xid;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF TG_OP<>'INSERT' OR session_user<>'pathways_runtime' OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
  OR NEW.actor_id IS DISTINCT FROM pathways.runtime_context_user()
 THEN RAISE EXCEPTION 'Publication receipt immutable and scoped' USING ERRCODE='42501'; END IF;
 current_xid:=pg_catalog.mod(pg_catalog.pg_current_xact_id()::text::numeric,4294967296)::text::xid;
 SELECT p.revision,p.state,p.updated_at,p.last_operation,p.xmin,p.submitted_by_id,p.approved_by_id,p.published_by_id INTO publication FROM pathways.project_publications p
  WHERE p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id;
 IF NOT FOUND OR publication.xmin<>current_xid OR publication.last_operation IS DISTINCT FROM NEW.operation_code
  OR (CASE NEW.operation_code WHEN 'SUBMIT' THEN publication.submitted_by_id WHEN 'WITHDRAW' THEN publication.submitted_by_id
      WHEN 'APPROVE' THEN publication.approved_by_id ELSE publication.published_by_id END) IS DISTINCT FROM NEW.actor_id
  OR ROW(publication.revision,publication.state,publication.updated_at)
   IS DISTINCT FROM ROW(NEW.resulting_revision,NEW.resulting_state,NEW.resulting_updated_at)
 THEN RAISE EXCEPTION 'Publication receipt requires actual same-transaction transition' USING ERRCODE='23514'; END IF;
 NEW.recorded_at:=clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p34_guard_publication_request() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p34_guard_publication_request BEFORE INSERT OR UPDATE OR DELETE ON pathways.publication_requests
 FOR EACH ROW EXECUTE FUNCTION pathways.p34_guard_publication_request();

GRANT USAGE ON SCHEMA pathways TO public_projection_owner,report_projection_owner;
GRANT SELECT(organization_id,project_id,state,snapshot,published_at) ON pathways.project_publications TO public_projection_owner;
GRANT SELECT(id,organization_id,archived_at) ON pathways.projects TO public_projection_owner;
GRANT SELECT(id,status,archived_at) ON pathways.organizations TO public_projection_owner;
CREATE POLICY p34_public_organizations ON pathways.organizations FOR SELECT TO public_projection_owner USING(status='ACTIVE' AND archived_at IS NULL);
CREATE POLICY p34_public_projects ON pathways.projects FOR SELECT TO public_projection_owner USING(archived_at IS NULL AND EXISTS(
 SELECT FROM pathways.organizations o WHERE o.id=organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL));
CREATE POLICY p34_public_publications ON pathways.project_publications FOR SELECT TO public_projection_owner USING(state='PUBLISHED' AND EXISTS(
 SELECT FROM pathways.projects p WHERE p.organization_id=project_publications.organization_id AND p.id=project_publications.project_id AND p.archived_at IS NULL));
CREATE FUNCTION pathways.p34_public_projects(wanted_project uuid DEFAULT NULL,skip_rows integer DEFAULT 0,take_rows integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR skip_rows IS NULL OR take_rows IS NULL OR skip_rows<0 OR skip_rows>10000 OR take_rows<1 OR take_rows>100
 THEN RAISE EXCEPTION 'Invalid public request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(q.payload ORDER BY q.project_id) FROM(
  SELECT pub.project_id,pub.snapshot||jsonb_build_object('publishedAt',pub.published_at) AS payload
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.state='PUBLISHED' AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
   AND (wanted_project IS NULL OR pub.project_id=wanted_project)
  ORDER BY pub.project_id LIMIT take_rows OFFSET skip_rows)q),'[]'::jsonb);
END $$;
ALTER FUNCTION pathways.p34_public_projects(uuid,integer,integer) OWNER TO public_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_public_projects(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_public_projects(uuid,integer,integer) TO pathways_runtime;

-- Independent append-only final signoff preserves existing immutable expense provenance.
CREATE TABLE pathways.expense_signoffs(
 organization_id uuid NOT NULL,project_id uuid NOT NULL,expense_id uuid NOT NULL,
 signed_off_by_id uuid NOT NULL,signed_off_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,project_id,expense_id),
 FOREIGN KEY(organization_id,project_id,expense_id) REFERENCES pathways.budget_expense_entries(organization_id,project_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,signed_off_by_id) REFERENCES pathways.system_users(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE pathways.expense_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.expense_signoffs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.expense_signoffs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON pathways.expense_signoffs TO pathways_runtime;
CREATE POLICY p34_signoff_read ON pathways.expense_signoffs FOR SELECT TO pathways_runtime USING(
 organization_id=pathways.runtime_context_organization() AND pathways.p05_has_project_permission('expenses.read',project_id));
CREATE POLICY p34_signoff_insert ON pathways.expense_signoffs FOR INSERT TO pathways_runtime WITH CHECK(
 organization_id=pathways.runtime_context_organization() AND pathways.p05_has_project_permission('expenses.signoff',project_id));
-- Only parent lock admission is added; signoff cannot satisfy actual UPDATE WITH CHECK.
DROP POLICY p09_expense_update ON pathways.budget_expense_entries;
CREATE POLICY p09_expense_update ON pathways.budget_expense_entries AS RESTRICTIVE FOR UPDATE TO pathways_runtime
 USING(pathways.p05_has_project_permission('expenses.verify',project_id)
  OR pathways.p05_has_project_permission('expenses.approve',project_id)
  OR pathways.p05_has_project_permission('expenses.signoff',project_id))
 WITH CHECK(pathways.p05_has_project_permission('expenses.verify',project_id)
  OR pathways.p05_has_project_permission('expenses.approve',project_id));
CREATE FUNCTION pathways.p34_guard_signoff() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent record; actor uuid:=pathways.runtime_context_user();
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF TG_OP<>'INSERT' OR session_user<>'pathways_runtime' OR actor IS NULL
  OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
  OR NOT pathways.p05_has_project_permission('expenses.signoff',NEW.project_id)
 THEN RAISE EXCEPTION 'Financial signoff unavailable' USING ERRCODE='42501'; END IF;
 SELECT status,submitted_by_id,verified_by_id,approved_by_id,approved_at INTO parent FROM pathways.budget_expense_entries
  WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.expense_id FOR UPDATE;
 IF NOT FOUND OR parent.status<>'APPROVED' OR actor IN(parent.submitted_by_id,parent.verified_by_id,parent.approved_by_id)
 THEN RAISE EXCEPTION 'Financial signoff requires approved parent and distinct actor' USING ERRCODE='23514'; END IF;
 NEW.signed_off_by_id:=actor; NEW.signed_off_at:=greatest(clock_timestamp(),parent.approved_at); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p34_guard_signoff() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p34_guard_signoff BEFORE INSERT OR UPDATE OR DELETE ON pathways.expense_signoffs FOR EACH ROW EXECUTE FUNCTION pathways.p34_guard_signoff();

-- Report identity key is nullable for exact preservation of historical rows.
ALTER TABLE pathways.reports ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX reports_client_request_key ON pathways.reports(organization_id,created_by_id,client_request_id) WHERE client_request_id IS NOT NULL;
ALTER TABLE pathways.budget_expense_entries ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX expenses_client_request_key ON pathways.budget_expense_entries(organization_id,submitted_by_id,client_request_id) WHERE client_request_id IS NOT NULL;

-- Report computation and exact narrow owner policies appended by deterministic external generator.


GRANT EXECUTE ON FUNCTION pathways.p05_has_project_permission(text,uuid),
 pathways.p06_can(text,uuid),pathways.p06_assert_scope(uuid,uuid[],text,date,date,text),pathways.p06_cell(numeric,text),
 pathways.p06_count_cell(bigint),pathways.p06_numeric_valid(numeric,text) TO report_projection_owner;
GRANT SELECT ON pathways.project_indicators TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.project_indicators FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT ON pathways.project_indicator_bindings TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.project_indicator_bindings FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT ON pathways.project_indicator_measurements TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.project_indicator_measurements FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT(id,organization_id,project_id,enrollment_id,activity_id,source_submission_id,participation_date,attendance_status) ON pathways.beneficiary_activity_participations TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.beneficiary_activity_participations FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT(id,organization_id,project_id,beneficiary_id,status,ended_date) ON pathways.beneficiary_project_enrollments TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.beneficiary_project_enrollments FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT(id,organization_id,project_id,archived_at,status,planned_end_date) ON pathways.project_activities TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.project_activities FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
-- Additive identified survey linkage; historical and anonymous submissions remain NULL.
ALTER TABLE pathways.form_submissions ADD COLUMN beneficiary_id uuid;
ALTER TABLE pathways.form_submissions ADD CONSTRAINT p34_survey_subject_shape
  CHECK (beneficiary_id IS NULL OR (enrollment_id IS NULL AND source='DIRECT_ENCODING'));
ALTER TABLE pathways.form_submissions ADD CONSTRAINT form_submissions_beneficiary_fk
  FOREIGN KEY (organization_id,project_id,beneficiary_id)
  REFERENCES pathways.beneficiary_project_enrollments(organization_id,project_id,beneficiary_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION pathways.p34_guard_survey_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $survey_subject$
BEGIN
  IF TG_OP='UPDATE' AND NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id THEN
    RAISE EXCEPTION 'Survey contributor cannot be retargeted' USING ERRCODE='23514';
  END IF;
  IF NEW.beneficiary_id IS NULL THEN RETURN NEW; END IF;
  IF session_user<>'pathways_runtime'
     OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
     OR NEW.submitted_by_id IS DISTINCT FROM pathways.runtime_context_user()
     OR NEW.enrollment_id IS NOT NULL OR NEW.source<>'DIRECT_ENCODING'
     OR NOT pathways.p05_has_project_permission('submissions.write',NEW.project_id)
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.read',NEW.project_id)
     OR NOT EXISTS(SELECT FROM pathways.digital_forms f
       WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id
         AND f.id=NEW.form_id AND f.version=NEW.form_version
         AND f.form_type='TRAINING_SURVEY' AND f.status='PUBLISHED')
     OR NOT EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e
       JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
       WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
         AND e.beneficiary_id=NEW.beneficiary_id AND e.status='ACTIVE' AND e.ended_date IS NULL
         AND b.subject_type='INDIVIDUAL' AND NOT b.is_dummy_record AND b.archived_at IS NULL
         AND b.consent_recorded AND b.data_processing_consent_recorded)
  THEN RAISE EXCEPTION 'Current identified survey contributor unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$survey_subject$;
ALTER FUNCTION pathways.p34_guard_survey_subject() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p34_guard_survey_subject() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pathways.p34_guard_survey_subject() TO pathways_runtime;
CREATE TRIGGER p34_guard_survey_subject BEFORE INSERT OR UPDATE ON pathways.form_submissions
  FOR EACH ROW EXECUTE FUNCTION pathways.p34_guard_survey_subject();

-- Existing runtime SELECT is table-wide; new person linkage must fail closed at retrieval too.
CREATE POLICY p34_survey_subject_read ON pathways.form_submissions AS RESTRICTIVE
  FOR SELECT TO pathways_runtime USING (beneficiary_id IS NULL OR
    pathways.p05_has_project_permission('beneficiaries.records.read',project_id));
CREATE POLICY p34_survey_subject_update ON pathways.form_submissions AS RESTRICTIVE
  FOR UPDATE TO pathways_runtime USING (beneficiary_id IS NULL OR
    pathways.p05_has_project_permission('beneficiaries.records.read',project_id))
  WITH CHECK (beneficiary_id IS NULL OR
    pathways.p05_has_project_permission('beneficiaries.records.read',project_id));
CREATE POLICY p34_survey_response_read ON pathways.form_response_values AS RESTRICTIVE
  FOR SELECT TO pathways_runtime USING (EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.project_id=form_response_values.project_id
      AND s.form_id=form_response_values.form_id AND s.id=form_response_values.submission_id));
-- Existing table-wide runtime privileges are unchanged; the trigger seals subject mutation.

GRANT SELECT(id,organization_id,project_id,form_id,form_version,enrollment_id,beneficiary_id,status,is_dummy_record,submitted_at) ON pathways.form_submissions TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.form_submissions FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT(id,organization_id,project_id,enrollment_id,activity_id,corrects_event_id,event_date,participation_id) ON pathways.beneficiary_journey_events TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.beneficiary_journey_events FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id));
GRANT SELECT(organization_id,project_id,form_id,submission_id,field_id,value) ON pathways.form_response_values TO report_projection_owner;
CREATE POLICY p34_report_projection ON pathways.form_response_values FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND pathways.p05_has_project_permission('reports.read',project_id) AND pathways.p05_has_project_permission('reports.indicator.read',project_id) AND EXISTS(SELECT FROM pathways.project_indicator_bindings b
 WHERE b.organization_id=form_response_values.organization_id AND b.project_id=form_response_values.project_id
 AND b.form_id=form_response_values.form_id AND b.field_id=form_response_values.field_id
 AND b.recipe IN('FORM_NUMERIC_SUM','FORM_NUMERIC_AVERAGE')));
GRANT SELECT(id,organization_id,subject_type,archived_at,is_dummy_record,consent_recorded,data_processing_consent_recorded) ON pathways.beneficiaries TO report_projection_owner;
CREATE POLICY p34_report_beneficiary_provenance ON pathways.beneficiaries FOR SELECT TO report_projection_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND EXISTS(
  SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=beneficiaries.organization_id AND e.beneficiary_id=beneficiaries.id
   AND pathways.p05_has_project_permission('reports.read',e.project_id) AND pathways.p05_has_project_permission('reports.indicator.read',e.project_id)));

CREATE FUNCTION pathways.p34_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) RETURNS jsonb
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
    SELECT * INTO m FROM pathways.project_indicator_measurements x
      WHERE x.organization_id=wanted_org AND x.project_id=wanted_project AND x.indicator_id=wanted_indicator
        AND x.period_start=d.period_start AND x.period_end=d.period_end
        AND NOT EXISTS (SELECT FROM pathways.project_indicator_measurements y WHERE y.organization_id=wanted_org AND y.project_id=wanted_project AND y.indicator_id=wanted_indicator AND y.corrects_measurement_id=x.id)
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


ALTER FUNCTION pathways.p34_compute_indicator_value(uuid,uuid,uuid,text) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_compute_indicator_value(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE FUNCTION pathways.p34_indicator_report(wanted_project uuid,zone text DEFAULT 'Asia/Manila') RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); result jsonb;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR wanted_project IS NULL
  OR NOT pathways.p05_has_project_permission('reports.read',wanted_project)
  OR NOT pathways.p05_has_project_permission('reports.indicator.read',wanted_project)
 THEN RAISE EXCEPTION 'Indicator report unavailable' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM pathways.project_indicators WHERE organization_id=org AND project_id=wanted_project AND archived_at IS NULL)>100
 THEN RAISE EXCEPTION 'Narrow report scope' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'code',i.code,'unitLabel',i.unit_label,
  'baseline',i.baseline_value::text,'target',i.target_value::text,'direction',i.direction,
  'periodStart',i.period_start,'periodEnd',i.period_end,
  'current',pathways.p34_compute_indicator_value(org,wanted_project,i.id,zone)->'current') ORDER BY i.code,i.id),'[]'::jsonb)
 INTO result FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=wanted_project AND i.archived_at IS NULL;
 RETURN result;
END $$;
ALTER FUNCTION pathways.p34_indicator_report(uuid,text) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_indicator_report(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_indicator_report(uuid,text) TO pathways_runtime;

-- Exact submission support returns only eligible references, never allocation amounts.
GRANT SELECT(id,organization_id,project_id,activity_id,category,archived_at) ON pathways.project_budget_records TO finance_operation_owner;
CREATE POLICY p34_expense_budget_reference ON pathways.project_budget_records FOR SELECT TO finance_operation_owner
 USING(session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
  AND pathways.p05_has_project_permission('expenses.submit',project_id) AND archived_at IS NULL);
CREATE FUNCTION pathways.p34_expense_budget_references(wanted_project uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization();
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR wanted_project IS NULL
  OR NOT pathways.p05_has_project_permission('expenses.submit',wanted_project)
 THEN RAISE EXCEPTION 'Expense references unavailable' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM pathways.project_budget_records WHERE organization_id=org AND project_id=wanted_project AND archived_at IS NULL)>100
 THEN RAISE EXCEPTION 'Narrow expense references' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'category',category,'activityId',activity_id) ORDER BY id)
  FROM pathways.project_budget_records WHERE organization_id=org AND project_id=wanted_project AND archived_at IS NULL),'[]'::jsonb);
END $$;
ALTER FUNCTION pathways.p34_expense_budget_references(uuid) OWNER TO finance_operation_owner;
REVOKE ALL ON FUNCTION pathways.p34_expense_budget_references(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_expense_budget_references(uuid) TO pathways_runtime;

-- Runtime readiness is invoked after committed cleanup, never during temporary install.
CREATE FUNCTION pathways.p34_assert_projection_provisioned()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
BEGIN
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 IF postgres_oid IS NULL OR prisma_oid IS NULL OR hosted IS NULL OR
  (NOT hosted AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE oid=postgres_oid AND rolsuper)) THEN
  RAISE EXCEPTION 'Core projection provisioning incomplete' USING ERRCODE='42501';
 END IF;
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['public_projection_owner','report_projection_owner','finance_operation_owner'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)))
   OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND
    (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) <> (CASE WHEN hosted THEN 1 ELSE 0 END)
   OR EXISTS(SELECT FROM pg_catalog.pg_roles app WHERE app.rolname=ANY(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker','pathways_rules_sweeper'])
    AND app.oid<>existing.oid AND (pg_catalog.pg_has_role(app.oid,existing.oid,'MEMBER') OR pg_catalog.pg_has_role(app.oid,existing.oid,'USAGE') OR pg_catalog.pg_has_role(app.oid,existing.oid,'SET')))
   OR pg_catalog.has_database_privilege(existing.oid,pg_catalog.current_database(),'CREATE')
   OR pg_catalog.has_database_privilege(existing.oid,pg_catalog.current_database(),'TEMPORARY')
   OR EXISTS(SELECT FROM pg_catalog.pg_namespace n WHERE pg_catalog.has_schema_privilege(existing.oid,n.oid,'CREATE')
    )
 THEN
   RAISE EXCEPTION 'Core projection provisioning incomplete' USING ERRCODE='42501';
  END IF;
 END LOOP;
<<p34_context_helper_acl>>
DECLARE
 ctx_name text;ctx_fn record;ctx_owner oid;ctx_expected oid[];
BEGIN
 SELECT oid INTO ctx_owner FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT pg_catalog.array_agg(oid ORDER BY oid) INTO ctx_expected FROM pg_catalog.pg_roles
 WHERE rolname=ANY(ARRAY['postgres','pathways_runtime','report_projection_owner','finance_operation_owner']);
 IF ctx_owner IS NULL OR pg_catalog.cardinality(ctx_expected)<>4 THEN RAISE EXCEPTION 'Core context helper principals unavailable' USING ERRCODE='42501'; END IF;
 FOREACH ctx_name IN ARRAY ARRAY['runtime_context_organization','runtime_context_user'] LOOP
  SELECT p.* INTO ctx_fn FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure(pg_catalog.format('pathways.%I()',ctx_name));
  IF NOT FOUND OR ctx_fn.proowner<>ctx_owner OR ctx_fn.prorettype<>'pg_catalog.uuid'::pg_catalog.regtype
   OR ctx_fn.proretset OR ctx_fn.prokind<>'f' OR NOT ctx_fn.prosecdef OR ctx_fn.provolatile<>'s'
   OR ctx_fn.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR ctx_fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR pg_catalog.md5(pg_catalog.regexp_replace(ctx_fn.prosrc,'[[:space:]]','','g'))<>
    (CASE ctx_name WHEN 'runtime_context_organization' THEN '2d76aa3b324899355b56837213df25a0' ELSE 'f27cc6e4905d203b147f022435e6cb61' END)
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a
    WHERE a.grantor<>ctx_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR NOT (a.grantee=ANY(ctx_expected)))
   OR (SELECT pg_catalog.array_agg(a.grantee ORDER BY a.grantee) FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a) IS DISTINCT FROM ctx_expected
  THEN RAISE EXCEPTION 'Core context helper definition or exact ACL differs' USING ERRCODE='42501'; END IF;
 END LOOP;
END p34_context_helper_acl;
END $$;
ALTER FUNCTION pathways.p34_assert_projection_provisioned() OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_assert_projection_provisioned() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_assert_projection_provisioned() TO pathways_runtime,public_projection_owner,finance_operation_owner;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pathways' AND c.relname IN('project_publications','publication_requests','expense_signoffs') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity))
 THEN RAISE EXCEPTION 'Core private tables require forced RLS'; END IF;
END $$;
-- Fixed finance-only entrypoints. No generic financial/source SQL or object lookup.
GRANT USAGE ON SCHEMA pathways TO finance_operation_owner;
GRANT USAGE ON TYPE pathways.review_status,pathways.evidence_type,pathways.public_visibility_status TO finance_operation_owner;
GRANT EXECUTE ON FUNCTION
 pathways.p05_has_project_permission(text,uuid),pathways.p3_private_key(text,text,uuid,uuid,text,uuid),pathways.p34_assert_projection_provisioned() TO finance_operation_owner;
-- Existing financial guards use composite SELECT * for exact parent provenance.
-- The NOLOGIN owner is restricted to scoped financial-purpose rows by the following policies;
-- no external function emits the budget amount or Storage keys to an unauthorized caller.
GRANT SELECT ON pathways.project_budget_records,pathways.budget_expense_entries,pathways.evidence_media TO finance_operation_owner;
GRANT UPDATE(id) ON pathways.project_budget_records TO finance_operation_owner;
GRANT INSERT(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id,client_request_id)
 ON pathways.budget_expense_entries TO finance_operation_owner;
GRANT UPDATE(status,receipt_evidence_id,verified_by_id,verified_at,approved_by_id,approved_at,rejected_by_id,rejected_at,rejection_reason,updated_at)
 ON pathways.budget_expense_entries TO finance_operation_owner;
GRANT INSERT(id,organization_id,project_id,activity_id,expense_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,storage_ready,submitted_by_id)
 ON pathways.evidence_media TO finance_operation_owner;
GRANT UPDATE(id,status,verified_by_id,verified_at,approved_by_id,approved_at,rejected_by_id,rejected_at,rejection_reason,updated_at)
 ON pathways.evidence_media TO finance_operation_owner;
GRANT INSERT(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes) ON pathways.audit_logs TO finance_operation_owner;
CREATE POLICY p34_finance_audit ON pathways.audit_logs FOR INSERT TO finance_operation_owner WITH CHECK(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND actor_user_id=pathways.runtime_context_user()
 AND action IN('EXPENSE_SUBMITTED','EXPENSE_RECEIPT_FINALIZED','EXPENSE_VERIFIED','EXPENSE_APPROVED','EXPENSE_REJECTED'));
CREATE POLICY p34_finance_budget_read ON pathways.project_budget_records FOR SELECT TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND (pathways.p05_has_project_permission('expenses.submit',project_id) OR pathways.p05_has_project_permission('expenses.read',project_id)));
CREATE POLICY p34_finance_budget_lock ON pathways.project_budget_records FOR UPDATE TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND (pathways.p05_has_project_permission('expenses.submit',project_id) OR pathways.p05_has_project_permission('expenses.read',project_id))) WITH CHECK(false);
CREATE POLICY p34_finance_expense_read ON pathways.budget_expense_entries FOR SELECT TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization()
 AND (pathways.p05_has_project_permission('expenses.read',project_id)
  OR (submitted_by_id=pathways.runtime_context_user() AND pathways.p05_has_project_permission('expenses.submit',project_id))));
CREATE POLICY p34_finance_expense_insert ON pathways.budget_expense_entries FOR INSERT TO finance_operation_owner WITH CHECK(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND submitted_by_id=pathways.runtime_context_user()
 AND pathways.p05_has_project_permission('expenses.submit',project_id) AND status='PENDING');
CREATE POLICY p34_finance_expense_update ON pathways.budget_expense_entries FOR UPDATE TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND (
  (submitted_by_id=pathways.runtime_context_user() AND status='PENDING' AND pathways.p05_has_project_permission('expenses.evidence.submit',project_id))
  OR pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id)))
 WITH CHECK(session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND (
  (submitted_by_id=pathways.runtime_context_user() AND status='PENDING' AND pathways.p05_has_project_permission('expenses.evidence.submit',project_id))
  OR pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id)));
CREATE POLICY p34_finance_receipt_read ON pathways.evidence_media FOR SELECT TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND expense_id IS NOT NULL
 AND activity_update_id IS NULL AND enrollment_id IS NULL AND source_submission_id IS NULL AND public_visibility_status='PRIVATE'
 AND (pathways.p05_has_project_permission('expenses.read',project_id)
  OR (submitted_by_id=pathways.runtime_context_user() AND pathways.p05_has_project_permission('expenses.evidence.submit',project_id))));
CREATE POLICY p34_finance_receipt_insert ON pathways.evidence_media FOR INSERT TO finance_operation_owner WITH CHECK(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND expense_id IS NOT NULL
 AND activity_update_id IS NULL AND enrollment_id IS NULL AND source_submission_id IS NULL AND public_visibility_status='PRIVATE'
 AND submitted_by_id=pathways.runtime_context_user() AND pathways.p05_has_project_permission('expenses.evidence.submit',project_id) AND status='PENDING');
CREATE POLICY p34_finance_receipt_update ON pathways.evidence_media FOR UPDATE TO finance_operation_owner USING(
 session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND expense_id IS NOT NULL
 AND activity_update_id IS NULL AND enrollment_id IS NULL AND source_submission_id IS NULL AND public_visibility_status='PRIVATE'
 AND ((submitted_by_id=pathways.runtime_context_user() AND status='PENDING' AND pathways.p05_has_project_permission('expenses.evidence.submit',project_id))
  OR pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id)))
 WITH CHECK(session_user='pathways_runtime' AND organization_id=pathways.runtime_context_organization() AND expense_id IS NOT NULL
 AND activity_update_id IS NULL AND enrollment_id IS NULL AND source_submission_id IS NULL AND public_visibility_status='PRIVATE'
 AND (pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id)));

CREATE FUNCTION pathways.p34_submit_expense(wanted_project uuid,request_id uuid,budget_id uuid,expense_description text,expense_amount numeric,on_date date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); e pathways.budget_expense_entries; b pathways.project_budget_records;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR request_id IS NULL OR wanted_project IS NULL
  OR NOT pathways.p05_has_project_permission('expenses.submit',wanted_project)
 THEN RAISE EXCEPTION 'Expense submission unavailable' USING ERRCODE='42501'; END IF;
 IF expense_description IS NULL OR length(btrim(expense_description)) NOT BETWEEN 1 AND 2000
  OR expense_amount IS NULL OR expense_amount::text IN('NaN','Infinity','-Infinity') OR expense_amount<=0 OR expense_amount<>round(expense_amount,2)
  OR on_date IS NULL OR on_date<DATE '1900-01-01' OR on_date>DATE '2100-12-31'
 THEN RAISE EXCEPTION 'Invalid expense data' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM pathways.budget_expense_entries WHERE organization_id=org AND submitted_by_id=actor AND client_request_id=request_id;
 IF FOUND THEN
  IF ROW(e.project_id,e.budget_record_id,e.description,e.amount,e.expense_date)
   IS DISTINCT FROM ROW(wanted_project,budget_id,btrim(expense_description),expense_amount,on_date)
  THEN RAISE EXCEPTION 'Expense request content conflict' USING ERRCODE='22023'; END IF;
 ELSE
  SELECT * INTO b FROM pathways.project_budget_records WHERE organization_id=org AND project_id=wanted_project AND id=budget_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND OR b.currency<>'PHP' THEN RAISE EXCEPTION 'Expense budget unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id,client_request_id)
   VALUES(pg_catalog.gen_random_uuid(),org,wanted_project,budget_id,btrim(expense_description),expense_amount,on_date,actor,request_id) RETURNING * INTO e;
  INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id)
   VALUES(org,wanted_project,actor,'EXPENSE_SUBMITTED','BudgetExpenseEntry',e.id::text);
 END IF;
 RETURN jsonb_build_object('id',e.id,'projectId',e.project_id,'status',e.status,'updatedAt',e.updated_at,'receiptEvidenceId',e.receipt_evidence_id);
END $$;
ALTER FUNCTION pathways.p34_submit_expense(uuid,uuid,uuid,text,numeric,date) OWNER TO finance_operation_owner;
REVOKE ALL ON FUNCTION pathways.p34_submit_expense(uuid,uuid,uuid,text,numeric,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_submit_expense(uuid,uuid,uuid,text,numeric,date) TO pathways_runtime;

CREATE FUNCTION pathways.p34_finalize_expense_receipt(wanted_project uuid,expense_id uuid,expected_updated_at timestamptz,
 evidence_id uuid,file_name text,object_key text,object_sha text,object_bytes bigint,mime_type text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); e pathways.budget_expense_entries; b pathways.project_budget_records;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR wanted_project IS NULL OR evidence_id IS NULL
  OR NOT pathways.p05_has_project_permission('expenses.evidence.submit',wanted_project)
 THEN RAISE EXCEPTION 'Receipt finalization unavailable' USING ERRCODE='42501'; END IF;
 IF object_sha IS NULL OR object_sha!~'^[0-9a-f]{64}$' OR object_bytes IS NULL OR object_bytes NOT BETWEEN 1 AND 10485760
  OR mime_type IS NULL OR mime_type NOT IN('application/pdf','image/png','image/jpeg') OR file_name IS NULL OR length(file_name) NOT BETWEEN 1 AND 200
  OR pathways.p3_private_key('pathways-private',object_key,org,wanted_project,'evidence',evidence_id) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Invalid private receipt object' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM pathways.budget_expense_entries x WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=expense_id FOR UPDATE;
 IF NOT FOUND OR e.submitted_by_id<>actor OR e.status<>'PENDING' OR e.updated_at IS DISTINCT FROM expected_updated_at OR e.receipt_evidence_id IS NOT NULL
 THEN RAISE EXCEPTION 'Pending receipt revision unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO b FROM pathways.project_budget_records WHERE organization_id=org AND project_id=wanted_project AND id=e.budget_record_id AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt budget unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,expense_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,storage_ready,submitted_by_id)
 VALUES(evidence_id,org,wanted_project,b.activity_id,e.id,CASE WHEN mime_type='application/pdf' THEN 'DOCUMENT'::pathways.evidence_type ELSE 'PHOTO'::pathways.evidence_type END,
  file_name,'pathways-private',object_key,object_sha,object_bytes,mime_type,true,actor);
 UPDATE pathways.budget_expense_entries SET receipt_evidence_id=evidence_id,updated_at=clock_timestamp() WHERE organization_id=org AND project_id=wanted_project AND id=e.id RETURNING * INTO e;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id)
 VALUES(org,wanted_project,actor,'EXPENSE_RECEIPT_FINALIZED','BudgetExpenseEntry',e.id::text);
 RETURN jsonb_build_object('id',e.id,'projectId',e.project_id,'status',e.status,'updatedAt',e.updated_at,'receiptEvidenceId',e.receipt_evidence_id);
END $$;
ALTER FUNCTION pathways.p34_finalize_expense_receipt(uuid,uuid,timestamptz,uuid,text,text,text,bigint,text) OWNER TO finance_operation_owner;
REVOKE ALL ON FUNCTION pathways.p34_finalize_expense_receipt(uuid,uuid,timestamptz,uuid,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_finalize_expense_receipt(uuid,uuid,timestamptz,uuid,text,text,text,bigint,text) TO pathways_runtime;

CREATE FUNCTION pathways.p34_review_expense(wanted_project uuid,expense_id uuid,expected_updated_at timestamptz,decision text,reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); e pathways.budget_expense_entries; proof pathways.evidence_media;
 at_time timestamptz(3):=clock_timestamp(); permission text;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR wanted_project IS NULL
  OR decision IS NULL OR decision NOT IN('VERIFY','APPROVE','REJECT')
 THEN RAISE EXCEPTION 'Expense review unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM pathways.budget_expense_entries x WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=expense_id FOR UPDATE;
 IF NOT FOUND OR e.updated_at IS DISTINCT FROM expected_updated_at OR e.status NOT IN('PENDING','VERIFIED')
 THEN RAISE EXCEPTION 'Expense revision unavailable' USING ERRCODE='40001'; END IF;
 permission:=CASE WHEN e.status='PENDING' THEN 'expenses.verify' ELSE 'expenses.approve' END;
 IF NOT pathways.p05_has_project_permission(permission,wanted_project) OR actor=e.submitted_by_id
  OR (e.status='VERIFIED' AND actor=e.verified_by_id)
  OR (decision='VERIFY' AND e.status<>'PENDING') OR (decision='APPROVE' AND e.status<>'VERIFIED')
 THEN RAISE EXCEPTION 'Distinct authorized financial reviewer required' USING ERRCODE='42501'; END IF;
 at_time:=greatest(at_time,e.submitted_at,e.verified_at);
 IF e.receipt_evidence_id IS NOT NULL THEN
  SELECT * INTO proof FROM pathways.evidence_media WHERE organization_id=org AND project_id=wanted_project AND id=e.receipt_evidence_id FOR UPDATE;
 END IF;
 IF decision<>'REJECT' AND (proof.id IS NULL OR NOT proof.storage_ready OR proof.expense_id IS DISTINCT FROM e.id
  OR proof.submitted_by_id IS DISTINCT FROM e.submitted_by_id OR proof.activity_update_id IS NOT NULL
  OR proof.enrollment_id IS NOT NULL OR proof.source_submission_id IS NOT NULL OR proof.public_visibility_status<>'PRIVATE')
 THEN RAISE EXCEPTION 'Pure stored private receipt required' USING ERRCODE='23514'; END IF;
 IF decision='VERIFY' THEN
  UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=actor,verified_at=at_time,updated_at=at_time WHERE id=proof.id AND organization_id=org AND project_id=wanted_project;
  UPDATE pathways.budget_expense_entries SET status='VERIFIED',verified_by_id=actor,verified_at=at_time,updated_at=at_time WHERE id=e.id AND organization_id=org AND project_id=wanted_project RETURNING * INTO e;
 ELSIF decision='APPROVE' THEN
  UPDATE pathways.evidence_media SET status='APPROVED',approved_by_id=actor,approved_at=at_time,updated_at=at_time WHERE id=proof.id AND organization_id=org AND project_id=wanted_project;
  UPDATE pathways.budget_expense_entries SET status='APPROVED',approved_by_id=actor,approved_at=at_time,updated_at=at_time WHERE id=e.id AND organization_id=org AND project_id=wanted_project RETURNING * INTO e;
 ELSE
  IF reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023'; END IF;
  UPDATE pathways.budget_expense_entries SET status='REJECTED',rejected_by_id=actor,rejected_at=at_time,rejection_reason=btrim(reason),updated_at=at_time WHERE id=e.id AND organization_id=org AND project_id=wanted_project RETURNING * INTO e;
  IF proof.id IS NOT NULL THEN UPDATE pathways.evidence_media SET status='REJECTED',rejected_by_id=actor,rejected_at=at_time,rejection_reason=btrim(reason),updated_at=at_time WHERE id=proof.id AND organization_id=org AND project_id=wanted_project; END IF;
 END IF;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id)
 VALUES(org,wanted_project,actor,CASE decision WHEN 'VERIFY' THEN 'EXPENSE_VERIFIED' WHEN 'APPROVE' THEN 'EXPENSE_APPROVED' ELSE 'EXPENSE_REJECTED' END,'BudgetExpenseEntry',e.id::text);
 RETURN jsonb_build_object('id',e.id,'projectId',e.project_id,'status',e.status,'updatedAt',e.updated_at,'receiptEvidenceId',e.receipt_evidence_id);
END $$;
ALTER FUNCTION pathways.p34_review_expense(uuid,uuid,timestamptz,text,text) OWNER TO finance_operation_owner;
REVOKE ALL ON FUNCTION pathways.p34_review_expense(uuid,uuid,timestamptz,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_review_expense(uuid,uuid,timestamptz,text,text) TO pathways_runtime;

-- Durable artifact metadata; historical reports remain untouched and nullable.
ALTER TYPE pathways.report_format ADD VALUE IF NOT EXISTS 'XLS';
ALTER TABLE pathways.reports ADD COLUMN request_hash char(64), ADD COLUMN artifact_byte_size bigint;
ALTER TABLE pathways.reports ADD CONSTRAINT p34_report_artifact_metadata CHECK(
 (client_request_id IS NULL AND request_hash IS NULL AND artifact_byte_size IS NULL)
 OR (request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$' AND (status='DRAFT' AND artifact_byte_size IS NULL
   OR status IN('GENERATED','ARCHIVED') AND artifact_byte_size IS NOT NULL AND artifact_byte_size BETWEEN 1 AND 10485760)));

-- Submitters may obtain only their own pending receipt acknowledgement, never the financial ledger.
CREATE FUNCTION pathways.p34_own_expense(wanted_project uuid,wanted_expense uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); e record;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL
  OR NOT pathways.p05_has_project_permission('expenses.evidence.submit',wanted_project)
 THEN RAISE EXCEPTION 'Own receipt submission unavailable' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.project_id,x.status,x.updated_at,x.receipt_evidence_id INTO e FROM pathways.budget_expense_entries x
  WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=wanted_expense AND x.submitted_by_id=actor AND x.status='PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Own pending expense unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',e.id,'projectId',e.project_id,'status',e.status,'updatedAt',e.updated_at,'receiptEvidenceId',e.receipt_evidence_id);
END $$;
ALTER FUNCTION pathways.p34_own_expense(uuid,uuid) OWNER TO finance_operation_owner;
REVOKE ALL ON FUNCTION pathways.p34_own_expense(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_own_expense(uuid,uuid) TO pathways_runtime;


-- Purpose-specific report source fingerprints; historical unkeyed rows remain unchanged.
ALTER TABLE pathways.reports ADD COLUMN source_fingerprint char(64);
ALTER TABLE pathways.reports ADD CONSTRAINT p34_report_source_fingerprint CHECK(
 (client_request_id IS NULL AND source_fingerprint IS NULL)
 OR (source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[a-f0-9]{64}$')
);
-- Existing p3_guard_report makes a GENERATED artifact/context immutable.
-- Keyed DRAFT reservations carry the server-computed source fingerprint; services reject mismatches before finalization/export.

-- Aggregate-only survey reporting under the scoped report projection owner.
CREATE FUNCTION pathways.p34_can_survey(project uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND pathways.runtime_context_organization() IS NOT NULL
 AND pathways.runtime_context_user() IS NOT NULL
 AND pathways.p05_has_project_permission('reports.read',project)
 AND pathways.p05_has_project_permission('reports.project.read',project)
 AND pathways.p05_has_project_permission('assessments.read',project)
$$;
ALTER FUNCTION pathways.p34_can_survey(uuid) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_can_survey(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

GRANT SELECT(id,organization_id,start_date,end_date,archived_at) ON pathways.projects TO report_projection_owner;
CREATE POLICY p34_survey_source ON pathways.projects FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND archived_at IS NULL AND pathways.p34_can_survey(id));
GRANT SELECT ON pathways.digital_forms TO report_projection_owner;
CREATE POLICY p34_survey_source ON pathways.digital_forms FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND status='PUBLISHED' AND pathways.p34_can_survey(project_id));
GRANT SELECT(id,organization_id,project_id,form_id,code,label,data_type,is_metadata_key,is_saddd_field,sequence_no)
 ON pathways.form_fields TO report_projection_owner;
CREATE POLICY p34_survey_source ON pathways.form_fields FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p34_can_survey(project_id)
 AND NOT is_metadata_key AND NOT is_saddd_field AND data_type IN('INTEGER','DECIMAL','BOOLEAN')
 AND EXISTS(SELECT FROM pathways.digital_forms f WHERE f.organization_id=form_fields.organization_id
 AND f.project_id=form_fields.project_id AND f.id=form_fields.form_id AND f.status='PUBLISHED'));
CREATE POLICY p34_survey_source ON pathways.form_submissions FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p34_can_survey(project_id)
 AND status='VALIDATED' AND NOT is_dummy_record AND beneficiary_id IS NOT NULL AND enrollment_id IS NULL
 AND EXISTS(SELECT FROM pathways.digital_forms f WHERE f.organization_id=form_submissions.organization_id
 AND f.project_id=form_submissions.project_id AND f.id=form_submissions.form_id AND f.version=form_submissions.form_version
 AND f.status='PUBLISHED' AND f.form_type='TRAINING_SURVEY'));
CREATE POLICY p34_survey_source ON pathways.beneficiary_project_enrollments FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND status='ACTIVE' AND ended_date IS NULL AND pathways.p34_can_survey(project_id));
CREATE POLICY p34_survey_source ON pathways.beneficiaries FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND subject_type='INDIVIDUAL' AND archived_at IS NULL AND NOT is_dummy_record
 AND consent_recorded AND data_processing_consent_recorded
 AND EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=beneficiaries.organization_id
 AND e.beneficiary_id=beneficiaries.id AND pathways.p34_can_survey(e.project_id)));
CREATE POLICY p34_survey_source ON pathways.form_response_values FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p34_can_survey(project_id)
 AND EXISTS(SELECT FROM pathways.form_fields f WHERE f.organization_id=form_response_values.organization_id
 AND f.project_id=form_response_values.project_id AND f.form_id=form_response_values.form_id AND f.id=form_response_values.field_id));

CREATE TABLE pathways.survey_aggregate_releases(
 organization_id uuid NOT NULL,project_id uuid NOT NULL,form_id uuid NOT NULL,form_version integer NOT NULL,
 form_code text NOT NULL,source_hash char(64) NOT NULL,
 payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,form_code),
 FOREIGN KEY(organization_id,project_id,form_id) REFERENCES pathways.digital_forms(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CHECK(form_version>0 AND length(btrim(form_code))>0 AND source_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(payload)='object')
);
ALTER TABLE pathways.survey_aggregate_releases OWNER TO report_projection_owner;
ALTER TABLE pathways.survey_aggregate_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.survey_aggregate_releases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.survey_aggregate_releases FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE POLICY p34_survey_release_read ON pathways.survey_aggregate_releases FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p34_can_survey(project_id));
CREATE POLICY p34_survey_release_insert ON pathways.survey_aggregate_releases FOR INSERT TO report_projection_owner
 WITH CHECK(organization_id=pathways.runtime_context_organization() AND pathways.p34_can_survey(project_id));
CREATE FUNCTION pathways.p34_guard_survey_release() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Survey aggregate releases are immutable' USING ERRCODE='23514'; END $$;
ALTER FUNCTION pathways.p34_guard_survey_release() OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_guard_survey_release() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p34_survey_release_immutable BEFORE UPDATE OR DELETE ON pathways.survey_aggregate_releases
 FOR EACH ROW EXECUTE FUNCTION pathways.p34_guard_survey_release();

CREATE FUNCTION pathways.p34_survey_report(wanted_project uuid,wanted_form uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); form record; period record; fields jsonb; cohort jsonb;
 source jsonb; fingerprint text; old_release record; aggregate_rows jsonb:='[]'; field jsonb; row jsonb; value jsonb; source_bytes bigint;
 respondents bigint; answered bigint; missing bigint; yes_count bigint; no_count bigint; total numeric; number numeric;
 suppress boolean:=false; result jsonb; unavailable jsonb:=jsonb_build_object('state','MISSING','respondents',NULL,'fields','[]'::jsonb);
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
  RETURN old_release.payload;
 END IF;
 suppress:=respondents BETWEEN 1 AND 4;
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
  suppress:=suppress OR answered BETWEEN 1 AND 4 OR missing BETWEEN 1 AND 4 OR yes_count BETWEEN 1 AND 4 OR no_count BETWEEN 1 AND 4;
  aggregate_rows:=aggregate_rows||jsonb_build_array(jsonb_build_object('code',field->>'code','label',field->>'label','type',field->>'data_type',
   'answered',answered,'missing',missing,'trueCount',CASE WHEN field->>'data_type'='BOOLEAN' THEN yes_count END,
   'falseCount',CASE WHEN field->>'data_type'='BOOLEAN' THEN no_count END,
   'mean',CASE WHEN field->>'data_type'<>'BOOLEAN' AND answered>0 THEN round(total/answered,4) END,
   'meanState',CASE WHEN field->>'data_type'='BOOLEAN' OR answered=0 THEN 'MISSING' ELSE 'AVAILABLE' END));
 END LOOP;
 IF suppress THEN
  SELECT coalesce(jsonb_agg((x-ARRAY['answered','missing','trueCount','falseCount','mean','meanState'])||jsonb_build_object('answered',NULL,'missing',NULL,'trueCount',NULL,'falseCount',NULL,'mean',NULL,'meanState','SUPPRESSED')),'[]') INTO aggregate_rows FROM jsonb_array_elements(aggregate_rows) x;
 END IF;
 result:=jsonb_build_object('state',CASE WHEN suppress THEN 'SUPPRESSED' ELSE 'AVAILABLE' END,'formId',form.id,'formVersion',form.version,
 'respondents',CASE WHEN suppress THEN NULL ELSE respondents END,'fields',aggregate_rows);
 INSERT INTO pathways.survey_aggregate_releases(organization_id,project_id,form_id,form_version,form_code,source_hash,payload)
 VALUES(org,wanted_project,wanted_form,form.version,form.code,fingerprint,result);
 RETURN result;
END $$;
ALTER FUNCTION pathways.p34_survey_report(uuid,uuid) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_survey_report(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_survey_report(uuid,uuid) TO pathways_runtime;

-- Fixed survey report reservation/finalization; no human form management grant.
GRANT UPDATE(id) ON pathways.digital_forms TO report_projection_owner;
CREATE POLICY p34_survey_lock ON pathways.digital_forms FOR UPDATE TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND status='PUBLISHED' AND pathways.p34_can_survey(project_id)
 AND pathways.p05_has_project_permission('reports.generate',project_id)) WITH CHECK(false);
GRANT SELECT(id,organization_id,project_id,form_id,activity_id,journey_stage_id,name,type,format,status,created_by_id,
 client_request_id,request_hash,source_fingerprint,updated_at,bucket,object_key,sha256,artifact_byte_size) ON pathways.reports TO report_projection_owner;
GRANT INSERT(id,organization_id,project_id,form_id,activity_id,journey_stage_id,name,type,format,created_by_id,
 client_request_id,request_hash,source_fingerprint,period_start,period_end,aggregate_only) ON pathways.reports TO report_projection_owner;
GRANT UPDATE(status,bucket,object_key,sha256,artifact_byte_size,generated_by_id,generated_at,updated_at) ON pathways.reports TO report_projection_owner;
CREATE POLICY p34_survey_artifact_read ON pathways.reports FOR SELECT TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user()
 AND type='SURVEY_FORM_RESULTS' AND pathways.p34_can_survey(project_id));
CREATE POLICY p34_survey_artifact_insert ON pathways.reports FOR INSERT TO report_projection_owner
 WITH CHECK(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user()
 AND type='SURVEY_FORM_RESULTS' AND aggregate_only AND status='DRAFT' AND client_request_id IS NOT NULL
 AND pathways.p34_can_survey(project_id) AND pathways.p05_has_project_permission('reports.generate',project_id));
CREATE POLICY p34_survey_artifact_update ON pathways.reports FOR UPDATE TO report_projection_owner
 USING(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user()
 AND type='SURVEY_FORM_RESULTS' AND status='DRAFT' AND pathways.p34_can_survey(project_id)
 AND pathways.p05_has_project_permission('reports.generate',project_id))
 WITH CHECK(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user()
 AND generated_by_id=pathways.runtime_context_user() AND type='SURVEY_FORM_RESULTS' AND status='GENERATED'
 AND pathways.p34_can_survey(project_id) AND pathways.p05_has_project_permission('reports.generate',project_id));
GRANT INSERT(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes) ON pathways.audit_logs TO report_projection_owner;
CREATE POLICY p34_survey_artifact_audit ON pathways.audit_logs FOR INSERT TO report_projection_owner
 WITH CHECK(organization_id=pathways.runtime_context_organization() AND actor_user_id=pathways.runtime_context_user()
 AND action='REPORT_GENERATED' AND entity_type='Report' AND pathways.p34_can_survey(project_id)
 AND pathways.p05_has_project_permission('reports.generate',project_id));

CREATE FUNCTION pathways.p34_reserve_survey_report(wanted_project uuid,wanted_form uuid,request uuid,request_hash text,
 title text,format pathways.report_format,wanted_source_fingerprint text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
#variable_conflict error
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); f record;p record;r record;report_id uuid;aggregate jsonb;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF NOT pathways.p34_can_survey(wanted_project) OR NOT pathways.p05_has_project_permission('reports.generate',wanted_project)
 OR request IS NULL OR request_hash IS NULL OR request_hash!~'^[a-f0-9]{64}$' OR title IS NULL
 OR length(btrim(title)) NOT BETWEEN 1 AND 200 OR format IS NULL OR wanted_source_fingerprint IS NULL OR wanted_source_fingerprint!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Survey artifact request unavailable' USING ERRCODE='42501'; END IF;
 aggregate:=pathways.p34_survey_report(wanted_project,wanted_form);
 IF aggregate->>'state' IN('MISSING','STALE') THEN RAISE EXCEPTION 'Survey aggregate unavailable for generation' USING ERRCODE='22023'; END IF;
 SELECT x.id,x.activity_id,x.journey_stage_id INTO f FROM pathways.digital_forms x
 WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=wanted_form AND x.status='PUBLISHED' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Published form changed' USING ERRCODE='40001'; END IF;
 SELECT x.start_date,x.end_date INTO p FROM pathways.projects x WHERE x.organization_id=org AND x.id=wanted_project AND x.archived_at IS NULL;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pathways:report-request:'||org||':'||actor||':'||request,0));
 SELECT x.id,x.project_id,x.form_id,x.name,x.format,x.status,x.request_hash,x.source_fingerprint,x.updated_at INTO r FROM pathways.reports x
 WHERE x.organization_id=org AND x.created_by_id=actor AND x.client_request_id=request;
 IF FOUND THEN
  IF r.project_id IS DISTINCT FROM wanted_project OR r.form_id IS DISTINCT FROM wanted_form
  OR r.name IS DISTINCT FROM title OR r.format IS DISTINCT FROM format OR r.request_hash IS DISTINCT FROM request_hash
  OR r.source_fingerprint IS DISTINCT FROM wanted_source_fingerprint
  THEN RAISE EXCEPTION 'Report request content collision' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('id',r.id,'status',r.status,'updatedAt',r.updated_at);
 END IF;
 report_id:=gen_random_uuid();
 INSERT INTO pathways.reports(id,organization_id,project_id,form_id,activity_id,journey_stage_id,name,type,format,
 created_by_id,client_request_id,request_hash,source_fingerprint,period_start,period_end,aggregate_only)
 VALUES(report_id,org,wanted_project,wanted_form,f.activity_id,f.journey_stage_id,title,'SURVEY_FORM_RESULTS',format,
 actor,request,request_hash,wanted_source_fingerprint,NULL,NULL,true);
 SELECT x.updated_at INTO r FROM pathways.reports x WHERE x.organization_id=org AND x.id=report_id;
 RETURN jsonb_build_object('id',report_id,'status','DRAFT','updatedAt',r.updated_at);
END $$;
ALTER FUNCTION pathways.p34_reserve_survey_report(uuid,uuid,uuid,text,text,pathways.report_format,text) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_reserve_survey_report(uuid,uuid,uuid,text,text,pathways.report_format,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_reserve_survey_report(uuid,uuid,uuid,text,text,pathways.report_format,text) TO pathways_runtime;

CREATE FUNCTION pathways.p34_finalize_survey_report(wanted_project uuid,wanted_report uuid,request uuid,expected_hash text,
 expected_updated_at timestamptz,object_key text,digest text,bytes bigint,expected_source_fingerprint text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
#variable_conflict error
DECLARE org uuid:=pathways.runtime_context_organization();actor uuid:=pathways.runtime_context_user();r record;aggregate jsonb;changed bigint;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF NOT pathways.p34_can_survey(wanted_project) OR NOT pathways.p05_has_project_permission('reports.generate',wanted_project)
 OR digest IS NULL OR digest!~'^[a-f0-9]{64}$' OR bytes IS NULL OR bytes NOT BETWEEN 1 AND 10485760
 THEN RAISE EXCEPTION 'Survey artifact finalization unavailable' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.form_id,x.status,x.format,x.request_hash,x.source_fingerprint,x.updated_at INTO r FROM pathways.reports x
 WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=wanted_report AND x.created_by_id=actor
 AND x.client_request_id=request AND x.type='SURVEY_FORM_RESULTS' AND x.status='DRAFT' FOR UPDATE;
 IF NOT FOUND OR r.request_hash IS DISTINCT FROM expected_hash OR r.updated_at IS DISTINCT FROM expected_updated_at
 OR r.source_fingerprint IS DISTINCT FROM expected_source_fingerprint
 THEN RAISE EXCEPTION 'Survey draft changed' USING ERRCODE='40001'; END IF;
 IF NOT pathways.p3_private_key('pathways-private',object_key,org,wanted_project,'reports',wanted_report)
 OR object_key !~ ('/[0-9a-f-]{36}\.'||lower(r.format::text)||'$')
 THEN RAISE EXCEPTION 'Survey artifact provenance unavailable' USING ERRCODE='23514'; END IF;
 aggregate:=pathways.p34_survey_report(wanted_project,r.form_id);
 IF aggregate->>'state' IN('MISSING','STALE') THEN RAISE EXCEPTION 'Survey source changed' USING ERRCODE='40001'; END IF;
 UPDATE pathways.reports x SET status='GENERATED',bucket='pathways-private',object_key=p34_finalize_survey_report.object_key,
 sha256=digest,artifact_byte_size=bytes,generated_by_id=actor,generated_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE x.organization_id=org AND x.project_id=wanted_project AND x.id=wanted_report AND x.created_by_id=actor AND x.status='DRAFT';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Survey draft changed' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(org,wanted_project,actor,'REPORT_GENERATED','Report',wanted_report::text,jsonb_build_object('kind','SURVEY_FORM_RESULTS','sha256',digest,'bytes',bytes));
 RETURN jsonb_build_object('id',wanted_report,'status','GENERATED');
END $$;
ALTER FUNCTION pathways.p34_finalize_survey_report(uuid,uuid,uuid,text,timestamptz,text,text,bigint,text) OWNER TO report_projection_owner;
REVOKE ALL ON FUNCTION pathways.p34_finalize_survey_report(uuid,uuid,uuid,text,timestamptz,text,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p34_finalize_survey_report(uuid,uuid,uuid,text,timestamptz,text,text,bigint,text) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p3_private_key(text,text,uuid,uuid,text,uuid) TO report_projection_owner;

COMMIT;
