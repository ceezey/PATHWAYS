-- Forward-only core profile and partner support. No historical migration edits.
BEGIN;
DO $$ BEGIN
 IF current_user<>'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations
 WHERE migration_name='0028_revised_aggregate_permission_guards' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0030 requires the migration identity and verified revised authorization baseline'; END IF;
END $$;
-- Included in forward-only 0030 after specialist review. No existing policy relaxed.
CREATE FUNCTION pathways.p10_update_own_profile(wanted_name text, wanted_contact text, expected_updated timestamptz)
RETURNS TABLE(full_name text, contact_number text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
 org uuid := nullif(current_setting('app.organization_id',true),'')::uuid; before_row pathways.system_users%ROWTYPE; affected integer;
BEGIN
 IF NOT pathways.p09_can('profile.manage') OR wanted_name IS NULL
 OR length(btrim(wanted_name)) NOT BETWEEN 2 AND 80 OR expected_updated IS NULL
 OR (wanted_contact IS NOT NULL AND (length(wanted_contact)>30 OR wanted_contact !~ '^[+()\-[:space:]0-9]{7,30}$'))
 THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 SELECT u.* INTO before_row FROM pathways.system_users u
 WHERE u.organization_id=org AND u.id=actor
 AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 AND u.account_status='ACTIVE' AND u.archived_at IS NULL FOR UPDATE;
 IF NOT pathways.p09_can('profile.manage') OR actor IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
 OR org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid OR before_row.auth_user_id IS DISTINCT FROM nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 IF before_row.id IS NULL THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 IF before_row.updated_at IS DISTINCT FROM expected_updated THEN RETURN; END IF;
 UPDATE pathways.system_users u SET full_name=btrim(wanted_name),contact_number=nullif(btrim(wanted_contact),''),
 updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),before_row.updated_at+interval '1 millisecond') WHERE u.organization_id=org AND u.id=actor;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,'OWN_PROFILE_UPDATED','SystemUser',actor::text,
 jsonb_build_object('nameChanged',before_row.full_name IS DISTINCT FROM btrim(wanted_name),
 'contactChanged',before_row.contact_number IS DISTINCT FROM nullif(btrim(wanted_contact),'')));
 RETURN QUERY SELECT u.full_name,u.contact_number,u.updated_at FROM pathways.system_users u
 WHERE u.organization_id=org AND u.id=actor;
END $$;
ALTER FUNCTION pathways.p10_update_own_profile(text,text,timestamptz) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_update_own_profile(text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p10_update_own_profile(text,text,timestamptz) TO pathways_runtime;

-- Forward-only additions. Legacy projects.implementing_partners bytes retained.
CREATE TABLE pathways.implementing_partners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 name text NOT NULL, normalized_name text NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT implementing_partner_name_bounds CHECK(length(btrim(name)) BETWEEN 1 AND 120 AND normalized_name=lower(btrim(name))),
 UNIQUE(organization_id,normalized_name), UNIQUE(organization_id,id)
);
CREATE TABLE pathways.project_implementing_partners (
 organization_id uuid NOT NULL, project_id uuid NOT NULL, partner_id uuid NOT NULL,
 PRIMARY KEY(organization_id,project_id,partner_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,partner_id) REFERENCES pathways.implementing_partners(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX project_implementing_partners_partner_idx ON pathways.project_implementing_partners(organization_id,partner_id);
ALTER TABLE pathways.implementing_partners OWNER TO prisma;
ALTER TABLE pathways.project_implementing_partners OWNER TO prisma;
ALTER TABLE pathways.implementing_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_implementing_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.implementing_partners,pathways.project_implementing_partners FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON pathways.implementing_partners,pathways.project_implementing_partners TO pathways_runtime;
CREATE POLICY p10_partner_links_read ON pathways.project_implementing_partners FOR SELECT TO pathways_runtime
 USING(organization_id=pathways.runtime_context_organization() AND pathways.p05_has_project_permission('projects.detail.read',project_id));
CREATE POLICY p10_partner_read ON pathways.implementing_partners FOR SELECT TO pathways_runtime
 USING(organization_id=pathways.runtime_context_organization() AND EXISTS(
 SELECT FROM pathways.project_implementing_partners l WHERE l.organization_id=implementing_partners.organization_id
 AND l.partner_id=implementing_partners.id AND pathways.p05_has_project_permission('projects.detail.read',l.project_id)));

CREATE FUNCTION pathways.p10_replace_project_partners(wanted_project uuid,wanted_names text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid; org uuid:=nullif(current_setting('app.organization_id',true),'')::uuid;
 label text; partner uuid; selected uuid[]:='{}'; previous uuid[];
BEGIN
 IF wanted_names IS NULL OR cardinality(wanted_names)>20 OR NOT pathways.p09_can('projects.detail.read')
 OR NOT EXISTS(SELECT FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project AND p.archived_at IS NULL
 AND (pathways.p05_has_project_permission('projects.update',p.id)
 OR (pathways.p09_can('projects.create') AND p.created_by_id=actor
 AND p.created_at>=date_trunc('milliseconds',transaction_timestamp()))))
 THEN RAISE EXCEPTION 'Project partners unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project FOR UPDATE;
 IF NOT FOUND OR NOT pathways.p09_can('projects.detail.read') OR NOT EXISTS(
 SELECT FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project AND p.archived_at IS NULL
 AND (pathways.p05_has_project_permission('projects.update',p.id) OR (pathways.p09_can('projects.create')
 AND p.created_by_id=actor AND p.created_at>=date_trunc('milliseconds',transaction_timestamp()))))
 THEN RAISE EXCEPTION 'Project partners unavailable' USING ERRCODE='42501'; END IF;
 FOREACH label IN ARRAY wanted_names LOOP
   IF label IS NULL OR length(btrim(label)) NOT BETWEEN 1 AND 120 THEN
     RAISE EXCEPTION 'Invalid partner name' USING ERRCODE='23514'; END IF;
   INSERT INTO pathways.implementing_partners(organization_id,name,normalized_name)
   VALUES(org,btrim(label),lower(btrim(label)))
   ON CONFLICT(organization_id,normalized_name) DO NOTHING;
   SELECT i.id INTO partner FROM pathways.implementing_partners i
   WHERE i.organization_id=org AND i.normalized_name=lower(btrim(label));
   selected:=array_append(selected,partner);
 END LOOP;
 SELECT coalesce(array_agg(l.partner_id ORDER BY l.partner_id),'{}') INTO previous FROM pathways.project_implementing_partners l WHERE l.organization_id=org AND l.project_id=wanted_project;
 DELETE FROM pathways.project_implementing_partners l WHERE l.organization_id=org AND l.project_id=wanted_project
 AND NOT(l.partner_id=ANY(selected));
 INSERT INTO pathways.project_implementing_partners(organization_id,project_id,partner_id)
 SELECT org,wanted_project,unnest(selected) ON CONFLICT DO NOTHING;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,wanted_project,'PROJECT_PARTNERS_UPDATED','Project',wanted_project::text,
 jsonb_build_object('previousPartnerIds',previous,'partnerIds',selected,'partnerCount',(SELECT count(*) FROM pathways.project_implementing_partners l WHERE l.organization_id=org AND l.project_id=wanted_project)));
END $$;
ALTER FUNCTION pathways.p10_replace_project_partners(uuid,text[]) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_replace_project_partners(uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p10_replace_project_partners(uuid,text[]) TO pathways_runtime;

COMMIT;
