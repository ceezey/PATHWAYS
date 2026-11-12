-- 0090 test case gap closure (cr-pathways-test-case-gap-closure sections 2.1 and 2.5); forward migration.
-- public_project_views counts views per published project per Manila day: no IP, no identifier and no cookie is stored,
-- and nothing displays it yet. p90_count_public_view adds one view for a live, unarchived project of an active organization.
-- p90_record_password_reset writes PASSWORD_RESET_COMPLETED for the staff account of the recovery session's auth subject.
-- p90_dashboard_view_due answers whether DASHBOARD_VIEWED may be written, at most once per user per dashboard per 30 minutes;
-- it reads audit_logs as the owner because p09_select hides earlier rows from roles without audit.read.
-- All three are prisma-owned definers executable by pathways_runtime only, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0089_project_map_pins'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0090 requires the verified 0089 state and migration identity'; END IF;
 IF pg_catalog.to_regclass('pathways.public_project_views') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_count_public_view(uuid)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_record_password_reset(uuid)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_dashboard_view_due(uuid,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION '0090 requires the table and functions to not already exist'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)='prisma'
   AND oid IN ('pathways.projects'::pg_catalog.regclass,'pathways.project_publications'::pg_catalog.regclass,
    'pathways.organizations'::pg_catalog.regclass,'pathways.system_users'::pg_catalog.regclass,'pathways.audit_logs'::pg_catalog.regclass))<>5
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p85_prisma_live_read' AND polcmd='r'
   AND polrelid='pathways.project_publications'::pg_catalog.regclass AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid])
 THEN RAISE EXCEPTION '0090 requires prisma ownership of its tables and the 0085 live read policy'; END IF;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,90);

-- 1. The counter: one row per project per day, readable by no API role.
CREATE TABLE pathways.public_project_views (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    view_date date NOT NULL,
    view_count integer NOT NULL,
    CONSTRAINT public_project_views_pkey PRIMARY KEY (organization_id, project_id, view_date),
    CONSTRAINT public_project_views_project_fk FOREIGN KEY (organization_id, project_id)
     REFERENCES pathways.projects(organization_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT public_project_views_count_positive CHECK (view_count > 0)
);
ALTER TABLE pathways.public_project_views OWNER TO prisma;
ALTER TABLE pathways.public_project_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.public_project_views FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- 2. One public view; a project that is not live, is archived or belongs to an inactive organization is not counted.
CREATE FUNCTION pathways.p90_count_public_view(wanted_project uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public projection unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.public_project_views AS v(organization_id,project_id,view_date,view_count)
 SELECT pub.organization_id,pub.project_id,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,1
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
 ON CONFLICT ON CONSTRAINT public_project_views_pkey DO UPDATE SET view_count=v.view_count+1;
END $$;

-- 3. A completed password reset, attributed to the unarchived staff account of the auth subject; an unknown subject writes nothing.
CREATE FUNCTION pathways.p90_record_password_reset(auth_subject uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Account event unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 SELECT u.organization_id,u.id,'PASSWORD_RESET_COMPLETED','Authentication',u.id::text,'{}'::jsonb
  FROM pathways.system_users u WHERE u.auth_user_id=auth_subject AND u.archived_at IS NULL;
END $$;

-- 4. Whether a dashboard view is due; the lock holds until commit so concurrent requests of one viewer write one row.
CREATE FUNCTION pathways.p90_dashboard_view_due(viewer uuid, viewer_organization uuid, wanted_dashboard text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Dashboard view unavailable' USING ERRCODE='42501'; END IF;
 IF wanted_dashboard IS NULL OR wanted_dashboard !~ '^[a-z][a-z0-9-]{0,39}$'
 THEN RAISE EXCEPTION 'Invalid dashboard' USING ERRCODE='22023'; END IF;
 IF viewer IS NULL OR viewer_organization IS NULL THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p90-dashboard-view:'||viewer::text||':'||wanted_dashboard,0));
 RETURN NOT EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id=viewer_organization AND a.actor_user_id=viewer
  AND a.action='DASHBOARD_VIEWED' AND a.entity_type='Dashboard' AND a.entity_id=wanted_dashboard
  AND a.occurred_at>pg_catalog.transaction_timestamp()-interval '30 minutes');
END $$;

REVOKE ALL ON FUNCTION pathways.p90_count_public_view(uuid),pathways.p90_record_password_reset(uuid),
 pathways.p90_dashboard_view_due(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p90_count_public_view(uuid),pathways.p90_record_password_reset(uuid),
 pathways.p90_dashboard_view_due(uuid,uuid,text) TO pathways_runtime;

-- Postconditions: the table's owner, constraints, row security and grants, and the three functions' owner, mode, search_path and ACL.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.public_project_views'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0090 ownership postcondition failed'; END IF;
 IF (SELECT pg_catalog.string_agg(c.contype::text,'' ORDER BY c.contype) FROM pg_catalog.pg_constraint c
   WHERE c.conrelid='pathways.public_project_views'::pg_catalog.regclass AND c.convalidated AND c.contype IN ('c','f','p'))<>'cfp'
 THEN RAISE EXCEPTION '0090 constraint postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_catalog.pg_class
   WHERE oid='pathways.public_project_views'::pg_catalog.regclass)
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.public_project_views'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0090 row level security postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['pathways_runtime','anon','authenticated','service_role']) r
   WHERE has_table_privilege(r,'pathways.public_project_views','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION '0090 grant postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p90_count_public_view(uuid)'::pg_catalog.regprocedure,
    'pathways.p90_record_password_reset(uuid)'::pg_catalog.regprocedure,'pathways.p90_dashboard_view_due(uuid,uuid,text)'::pg_catalog.regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=""']
   AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
    FROM pg_catalog.aclexplode(p.proacl) a)=ARRAY['pathways_runtime','prisma'])<>3
 THEN RAISE EXCEPTION '0090 function postconditions failed'; END IF;
END $$;
COMMIT;
