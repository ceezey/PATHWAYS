-- P05 project activity delivery, independent update review, journey configuration
-- freeze-on-use, and participation/submission traceability.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION 'P05 migration requires prisma or a loopback-only replay administrator';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected NOBYPASSRLS pathways_runtime role is missing';
  END IF;
  IF to_regclass('pathways.project_activities') IS NULL
     OR to_regclass('pathways.beneficiary_project_enrollments') IS NULL
     OR to_regclass('pathways.form_submissions') IS NULL THEN
    RAISE EXCEPTION 'P05 prerequisites are missing';
  END IF;
END
$preflight$;

ALTER TABLE pathways.project_activities
  ADD COLUMN progress_percent integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT project_activities_progress_check CHECK (progress_percent BETWEEN 0 AND 100);

CREATE TABLE pathways.activity_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  client_update_id uuid NOT NULL,
  progress_percent integer NOT NULL,
  note text NOT NULL,
  status pathways.review_status NOT NULL DEFAULT 'PENDING',
  submitted_by_id uuid NOT NULL,
  submitted_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_id uuid,
  reviewed_at timestamptz(3),
  review_reason text,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activity_updates_pkey PRIMARY KEY(id),
  CONSTRAINT activity_updates_values_check CHECK (
    progress_percent BETWEEN 0 AND 100
    AND length(btrim(note)) BETWEEN 1 AND 4000
    AND ((status='PENDING' AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
      OR (status IN ('APPROVED','REJECTED') AND reviewed_by_id IS NOT NULL
        AND reviewed_by_id<>submitted_by_id AND reviewed_at>=submitted_at
        AND review_reason IS NOT NULL AND length(btrim(review_reason)) BETWEEN 1 AND 1000))
    AND status<>'VERIFIED'
  ),
  CONSTRAINT activity_updates_organization_fk FOREIGN KEY(organization_id)
    REFERENCES pathways.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_updates_project_fk FOREIGN KEY(organization_id,project_id)
    REFERENCES pathways.projects(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_updates_activity_fk FOREIGN KEY(organization_id,project_id,activity_id)
    REFERENCES pathways.project_activities(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_updates_submitted_by_fk FOREIGN KEY(organization_id,submitted_by_id)
    REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_updates_reviewed_by_fk FOREIGN KEY(organization_id,reviewed_by_id)
    REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX activity_updates_scope_key
  ON pathways.activity_updates(organization_id,project_id,activity_id,id);
CREATE UNIQUE INDEX activity_updates_client_key
  ON pathways.activity_updates(organization_id,submitted_by_id,client_update_id);
CREATE INDEX activity_updates_activity_time_idx
  ON pathways.activity_updates(organization_id,project_id,activity_id,submitted_at);
CREATE INDEX activity_updates_review_idx
  ON pathways.activity_updates(organization_id,project_id,status,submitted_at);
CREATE INDEX activity_updates_submitted_by_idx
  ON pathways.activity_updates(organization_id,submitted_by_id);
CREATE INDEX activity_updates_reviewed_by_idx
  ON pathways.activity_updates(organization_id,reviewed_by_id);

ALTER TABLE pathways.evidence_media
  ADD COLUMN activity_update_id uuid,
  ADD COLUMN storage_ready boolean NOT NULL DEFAULT true;
ALTER TABLE pathways.evidence_media ALTER COLUMN storage_ready SET DEFAULT false;
ALTER TABLE pathways.evidence_media ADD CONSTRAINT evidence_media_activity_update_fk
  FOREIGN KEY(organization_id,project_id,activity_id,activity_update_id)
  REFERENCES pathways.activity_updates(organization_id,project_id,activity_id,id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX evidence_media_activity_update_idx
  ON pathways.evidence_media(organization_id,project_id,activity_id,activity_update_id);
ALTER TABLE pathways.evidence_media ADD CONSTRAINT evidence_media_activity_update_check CHECK (
  activity_update_id IS NULL OR (activity_id IS NOT NULL AND type IN ('PROGRESS_PROOF','COMPLETION_PROOF'))
);

ALTER TABLE pathways.beneficiary_activity_participations ADD COLUMN source_submission_id uuid;
ALTER TABLE pathways.beneficiary_activity_participations ADD CONSTRAINT beneficiary_activity_participations_submission_fk
  FOREIGN KEY(organization_id,project_id,source_submission_id)
  REFERENCES pathways.form_submissions(organization_id,project_id,id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX beneficiary_activity_participations_submission_key
  ON pathways.beneficiary_activity_participations(source_submission_id)
  WHERE source_submission_id IS NOT NULL;
CREATE INDEX beneficiary_activity_participations_submission_idx
  ON pathways.beneficiary_activity_participations(organization_id,project_id,source_submission_id);

ALTER TABLE pathways.beneficiary_journey_events
  ADD COLUMN stage_code_snapshot text,
  ADD COLUMN stage_name_snapshot text,
  ADD COLUMN activity_code_snapshot text,
  ADD COLUMN activity_title_snapshot text,
  ADD COLUMN corrects_event_id uuid,
  ADD COLUMN correction_reason text;
ALTER TABLE pathways.beneficiary_journey_events ADD CONSTRAINT beneficiary_journey_events_correction_fk
  FOREIGN KEY(organization_id,project_id,corrects_event_id)
  REFERENCES pathways.beneficiary_journey_events(organization_id,project_id,id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE pathways.beneficiary_journey_events ADD CONSTRAINT beneficiary_journey_events_correction_check CHECK (
  (corrects_event_id IS NULL AND correction_reason IS NULL)
  OR (corrects_event_id IS NOT NULL AND correction_reason IS NOT NULL
    AND length(btrim(correction_reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX beneficiary_journey_events_correction_idx
  ON pathways.beneficiary_journey_events(organization_id,project_id,corrects_event_id);

INSERT INTO pathways.permissions(code,name,description) VALUES
  ('journeys.read','Read journey history','Read project-scoped journey configuration and Beneficiary chronology'),
  ('journeys.manage','Manage journey configuration','Create and edit unused project journey configuration'),
  ('participation.record','Record participation','Create scoped participation and journey events'),
  ('activities.read','Read activities','Read project-scoped activities and milestones'),
  ('activities.create','Create activities','Create activities in an authorized project'),
  ('activities.update','Update activities','Update authorized activities and milestones'),
  ('activities.proof.submit','Submit activity proof','Submit private proof for an assigned activity'),
  ('evidence.review','Review activity evidence','Review another actor''s submitted activity proof')
ON CONFLICT(code) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON (
  (r.code='SYSTEM_ADMINISTRATOR' AND p.code IN ('activities.read','activities.create','activities.update','journeys.read','journeys.manage','participation.record'))
  OR (r.code='PROGRAM_MANAGER' AND p.code IN ('activities.read','journeys.read'))
  OR (r.code='PROJECT_MANAGER' AND p.code IN ('activities.read','activities.create','activities.update','journeys.read','journeys.manage','participation.record'))
  OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('activities.read','journeys.read','journeys.manage','participation.record'))
  OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code='evidence.review')
  OR (r.code='PROJECT_OFFICER' AND p.code IN ('activities.read','journeys.read','participation.record','activities.proof.submit'))
)
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pathways.p05_has_project_permission(
  requested_permission text, requested_project uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $permission$
  SELECT COALESCE((
    SELECT true
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id AND p.code=requested_permission
    JOIN pathways.projects pr ON pr.organization_id=u.organization_id
      AND pr.id=requested_project AND pr.archived_at IS NULL
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
      AND (
        r.code='SYSTEM_ADMINISTRATOR'
        OR EXISTS (
          SELECT FROM pathways.user_project_assignments a
          WHERE a.organization_id=u.organization_id AND a.user_id=u.id
            AND a.project_id=requested_project AND a.status='ACTIVE' AND a.ended_at IS NULL
        )
        OR (r.code='PROGRAM_MANAGER' AND EXISTS (
          SELECT FROM pathways.programs pg
          WHERE pg.organization_id=u.organization_id AND pg.id=pr.program_id
            AND pg.manager_user_id=u.id AND pg.archived_at IS NULL
        ))
      )
    LIMIT 1
  ),false)
$permission$;

CREATE FUNCTION pathways.p05_guard_activity_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pathways AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Activity update history cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
    OR NEW.client_update_id IS DISTINCT FROM OLD.client_update_id
    OR NEW.progress_percent IS DISTINCT FROM OLD.progress_percent OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status<>'PENDING'
  ) THEN
    RAISE EXCEPTION 'Activity update submission/history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION pathways.p05_guard_stage_freeze() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pathways AS $$
DECLARE target_row pathways.journey_stages;
BEGIN
  target_row:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (
    SELECT FROM pathways.beneficiary_journey_events e
    WHERE e.organization_id=target_row.organization_id AND e.project_id=target_row.project_id
  ) AND (TG_OP<>'UPDATE' OR to_jsonb(NEW)-'updated_at'
      IS DISTINCT FROM to_jsonb(OLD)-'updated_at') THEN
    RAISE EXCEPTION 'Used journey stages are frozen history' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE FUNCTION pathways.p05_guard_mapping_freeze() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pathways AS $$
DECLARE target_row pathways.activity_journey_stage_mappings;
BEGIN
  target_row:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (
    SELECT FROM pathways.beneficiary_journey_events e
    WHERE e.organization_id=target_row.organization_id AND e.project_id=target_row.project_id
  ) THEN RAISE EXCEPTION 'Used activity-stage mappings are frozen history' USING ERRCODE='23514'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE FUNCTION pathways.p05_snapshot_journey_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pathways AS $$
DECLARE corrected pathways.beneficiary_journey_events;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT code,name INTO NEW.stage_code_snapshot,NEW.stage_name_snapshot
    FROM pathways.journey_stages
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.stage_id;
    IF NEW.stage_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Journey stage is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.activity_id IS NOT NULL THEN
    SELECT code,title INTO NEW.activity_code_snapshot,NEW.activity_title_snapshot
    FROM pathways.project_activities
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.activity_id AND archived_at IS NULL;
    IF NEW.activity_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Activity is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.corrects_event_id IS NOT NULL THEN
    SELECT * INTO corrected FROM pathways.beneficiary_journey_events
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.corrects_event_id FOR SHARE;
    IF corrected.id IS NULL OR corrected.enrollment_id<>NEW.enrollment_id
       OR corrected.corrects_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Correction must reference one original event in the same enrollment' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER p05_activity_update_guard BEFORE UPDATE OR DELETE ON pathways.activity_updates
  FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_activity_update();
CREATE TRIGGER p05_stage_freeze BEFORE INSERT OR UPDATE OR DELETE ON pathways.journey_stages
  FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_stage_freeze();
CREATE TRIGGER p05_mapping_freeze BEFORE UPDATE OR DELETE ON pathways.activity_journey_stage_mappings
  FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_mapping_freeze();
CREATE TRIGGER p05_journey_snapshot BEFORE INSERT ON pathways.beneficiary_journey_events
  FOR EACH ROW EXECUTE FUNCTION pathways.p05_snapshot_journey_event();

CREATE OR REPLACE FUNCTION pathways.p03_guard_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
DECLARE target_form_type pathways.form_type;
BEGIN
  SELECT f.form_type INTO target_form_type
  FROM pathways.digital_forms f WHERE f.organization_id=NEW.organization_id
    AND f.project_id=NEW.project_id AND f.id=NEW.form_id AND f.version=NEW.form_version
    AND f.status IN ('PUBLISHED','ARCHIVED');
  IF target_form_type IS NULL THEN RAISE EXCEPTION 'Submission requires a published pinned form version'; END IF;
  IF target_form_type NOT IN ('BENEFICIARY_REGISTRATION','ACTIVITY_MONITORING') AND NEW.enrollment_id IS NOT NULL THEN
    RAISE EXCEPTION 'This form type cannot reference an enrollment';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.source='DIRECT_ENCODING' THEN
      IF NEW.status<>'DRAFT' OR NEW.import_batch_id IS NOT NULL OR NEW.import_row_id IS NOT NULL
         OR NEW.submitted_at IS NOT NULL OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL
         OR (target_form_type='BENEFICIARY_REGISTRATION' AND NEW.enrollment_id IS NULL)
         OR (target_form_type<>'BENEFICIARY_REGISTRATION' AND NEW.enrollment_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Direct-entry drafts must start in the draft state';
      END IF;
    ELSIF NEW.source='IMPORTED_DATASET' THEN
      IF NEW.status<>'DRAFT' OR NEW.import_batch_id IS NULL OR NEW.import_row_id IS NULL
         OR NEW.submitted_at IS NOT NULL OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL
         OR (target_form_type='BENEFICIARY_REGISTRATION' AND NEW.enrollment_id IS NULL)
         OR (target_form_type<>'BENEFICIARY_REGISTRATION' AND NEW.enrollment_id IS NOT NULL)
         OR NOT EXISTS (
           SELECT FROM pathways.data_import_rows r
           JOIN pathways.data_import_batches b ON b.id=r.import_batch_id
           WHERE r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
             AND r.form_id=NEW.form_id AND r.id=NEW.import_row_id
             AND r.import_batch_id=NEW.import_batch_id AND r.status='PROCESSING'
             AND b.form_version=NEW.form_version AND b.status='PROCESSING'
             AND b.validated_mapping_revision=b.mapping_revision
         ) THEN RAISE EXCEPTION 'Imported submissions require a currently reviewed processing row'; END IF;
    ELSE RAISE EXCEPTION 'Submission source is unsupported'; END IF;
    IF target_form_type='BENEFICIARY_REGISTRATION' AND NOT EXISTS (
      SELECT FROM pathways.beneficiary_project_enrollments e
      WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
        AND e.id=NEW.enrollment_id
    ) THEN RAISE EXCEPTION 'Registration enrollment is outside submission scope'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'DRAFT'
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.form_version IS DISTINCT FROM OLD.form_version
     OR NEW.client_submission_id IS DISTINCT FROM OLD.client_submission_id
     OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
     OR NEW.import_row_id IS DISTINCT FROM OLD.import_row_id
     OR NEW.is_dummy_record IS DISTINCT FROM OLD.is_dummy_record
     OR NEW.status NOT IN ('DRAFT','VALIDATED')
     OR (NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id AND NOT (
       target_form_type='ACTIVITY_MONITORING'
       AND OLD.enrollment_id IS NULL AND NEW.enrollment_id IS NOT NULL AND NEW.status='VALIDATED'
     )) THEN RAISE EXCEPTION 'Submitted records and pinned form versions are immutable'; END IF;
  IF NEW.status='VALIDATED' AND (
    NEW.submitted_at IS NULL OR NEW.validated_by_id IS NULL OR NEW.validated_at IS NULL
    OR (target_form_type IN ('BENEFICIARY_REGISTRATION','ACTIVITY_MONITORING') AND NEW.enrollment_id IS NULL)
    OR (target_form_type='ACTIVITY_MONITORING' AND NEW.processed_at IS NULL)
  ) THEN RAISE EXCEPTION 'Final domain submission requires validation and processing provenance'; END IF;
  RETURN NEW;
END
$guard$;

CREATE OR REPLACE FUNCTION pathways.p03_assert_processed_row() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $assert$
DECLARE target_form_type pathways.form_type; target_submission uuid; target_enrollment uuid; target_beneficiary uuid;
BEGIN
  IF NEW.status<>'PROCESSED' THEN RETURN NULL; END IF;
  SELECT f.form_type,s.id,s.enrollment_id,e.beneficiary_id
  INTO target_form_type,target_submission,target_enrollment,target_beneficiary
  FROM pathways.form_submissions s
  JOIN pathways.digital_forms f ON f.organization_id=s.organization_id
    AND f.project_id=s.project_id AND f.id=s.form_id AND f.version=s.form_version
  LEFT JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=s.organization_id
    AND e.project_id=s.project_id AND e.id=s.enrollment_id
  WHERE s.import_row_id=NEW.id AND s.import_batch_id=NEW.import_batch_id
    AND s.organization_id=NEW.organization_id AND s.project_id=NEW.project_id
    AND s.form_id=NEW.form_id AND s.source='IMPORTED_DATASET'
    AND s.status IN ('VALIDATED','PROCESSED');
  IF target_submission IS NULL THEN RAISE EXCEPTION 'Processed row requires one normalized submission'; END IF;
  IF target_form_type='BENEFICIARY_REGISTRATION' AND (
    target_enrollment IS NULL OR target_beneficiary IS NULL
    OR NOT EXISTS (SELECT FROM pathways.beneficiary_consent_records c WHERE c.submission_id=target_submission AND c.kind='PARTICIPATION')
    OR NOT EXISTS (SELECT FROM pathways.beneficiary_consent_records c WHERE c.submission_id=target_submission AND c.kind='DATA_PROCESSING')
  ) THEN RAISE EXCEPTION 'Processed registration requires profile, enrollment and consent provenance'; END IF;
  IF target_form_type='ACTIVITY_MONITORING' AND (
    target_enrollment IS NULL OR NOT EXISTS (
      SELECT FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_journey_events e ON e.participation_id=p.id
        AND e.organization_id=p.organization_id AND e.project_id=p.project_id
        AND e.enrollment_id=p.enrollment_id AND e.activity_id=p.activity_id
      WHERE p.source_submission_id=target_submission AND p.enrollment_id=target_enrollment
    )
  ) THEN RAISE EXCEPTION 'Processed participation requires enrollment, participation and journey effects'; END IF;
  RETURN NULL;
END
$assert$;

-- P03 evidence provenance remains immutable; P05 permits only the one-way
-- provider-finalization flag without changing review state or file identity.
CREATE OR REPLACE FUNCTION pathways.p3_guard_review()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE allowed text[] := ARRAY['updated_at','status','verified_by_id','verified_at','approved_by_id','approved_at','rejected_by_id','rejected_at','rejection_reason']; proof pathways.evidence_media;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review records must begin PENDING'; END IF;
 ELSE
  IF TG_TABLE_NAME='evidence_media' THEN
   allowed:=allowed||ARRAY['storage_ready','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'];
   IF OLD.storage_ready AND NOT NEW.storage_ready THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Stored evidence cannot be unfinalized'; END IF;
  ELSIF OLD.status='PENDING' THEN allowed:=allowed||ARRAY['receipt_evidence_id']; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted financial/evidence provenance is immutable';
  END IF;
  IF NEW.status=OLD.status THEN
   IF (to_jsonb(NEW)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review actor history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','REJECTED'))) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid review transition';
   END IF;
   IF OLD.status='VERIFIED' AND (NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verification history is immutable';
   END IF;
   IF OLD.status='PENDING' AND NEW.status='REJECTED' AND NEW.verified_by_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cannot manufacture earlier verification';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='budget_expense_entries' THEN
  PERFORM 1 FROM pathways.project_budget_records WHERE id=NEW.budget_record_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense requires a nonarchived budget'; END IF;
  IF NEW.receipt_evidence_id IS NOT NULL THEN
   SELECT * INTO proof FROM pathways.evidence_media WHERE id=NEW.receipt_evidence_id FOR SHARE;
   IF NOT FOUND OR proof.organization_id<>NEW.organization_id OR proof.project_id<>NEW.project_id OR proof.expense_id IS DISTINCT FROM NEW.id
    OR proof.submitted_by_id<>NEW.submitted_by_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt must belong to this expense, scope and submitter';
   END IF;
  END IF;
  IF NEW.status IN ('VERIFIED','APPROVED') AND (NEW.receipt_evidence_id IS NULL OR proof.status NOT IN ('VERIFIED','APPROVED')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verified private receipt evidence is required';
  END IF;
 ELSIF NEW.status='REJECTED' AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE receipt_evidence_id=NEW.id AND status IN ('VERIFIED','APPROVED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt supporting verified financial history cannot be rejected';
 END IF;
 RETURN NEW;
END $$;

ALTER TABLE pathways.activity_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.activity_updates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pathways.activity_updates FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT SELECT,INSERT ON TABLE pathways.activity_updates TO pathways_runtime;
GRANT UPDATE(status,reviewed_by_id,reviewed_at,review_reason,updated_at)
  ON pathways.activity_updates TO pathways_runtime;
CREATE POLICY p05_activity_updates_select ON pathways.activity_updates FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND ((SELECT pathways.p05_has_project_permission('activities.read',project_id))
    OR (SELECT pathways.p05_has_project_permission('evidence.review',project_id))));
CREATE POLICY p05_activity_updates_insert ON pathways.activity_updates FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('activities.proof.submit',project_id)));
CREATE POLICY p05_activity_updates_update ON pathways.activity_updates FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND status='PENDING' AND (SELECT pathways.p05_has_project_permission('evidence.review',project_id)))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND reviewed_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('evidence.review',project_id)));

GRANT UPDATE(storage_ready,updated_at) ON pathways.evidence_media TO pathways_runtime;

-- The inherited actor-provenance trigger locks the submitting profile FOR
-- SHARE. P01 intentionally forbids self-profile UPDATE, so restore a lock-only
-- self policy; WITH CHECK(false) keeps every actual self update denied.
DROP POLICY IF EXISTS p05_actor_lock ON pathways.system_users;
CREATE POLICY p05_actor_lock ON pathways.system_users FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND id=(SELECT pathways.runtime_context_user()))
WITH CHECK (false);

-- Narrow P05 operational records by permission and active project scope. The
-- service repeats the same predicates; RLS is a second, NOBYPASSRLS boundary.
DROP POLICY IF EXISTS p4_runtime_select ON pathways.project_activities;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.project_activities;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.project_activities;
CREATE POLICY p05_activity_select ON pathways.project_activities FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND ((SELECT pathways.p05_has_project_permission('activities.read',project_id))
    OR (SELECT pathways.p05_has_project_permission('participation.record',project_id))));
CREATE POLICY p05_activity_insert ON pathways.project_activities FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND created_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('activities.create',project_id)));
CREATE POLICY p05_activity_update ON pathways.project_activities FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND ((SELECT pathways.p05_has_project_permission('activities.update',project_id))
    OR (SELECT pathways.p05_has_project_permission('activities.proof.submit',project_id))
    OR (SELECT pathways.p05_has_project_permission('evidence.review',project_id))))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()));

DROP POLICY IF EXISTS p4_runtime_select ON pathways.journey_stages;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.journey_stages;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.journey_stages;
CREATE POLICY p05_stage_select ON pathways.journey_stages FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND ((SELECT pathways.p05_has_project_permission('journeys.read',project_id))
    OR (SELECT pathways.p05_has_project_permission('participation.record',project_id))));
CREATE POLICY p05_stage_insert ON pathways.journey_stages FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND created_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('journeys.manage',project_id)));
CREATE POLICY p05_stage_update ON pathways.journey_stages FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.manage',project_id)))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()));

DROP POLICY IF EXISTS p4_runtime_select ON pathways.activity_journey_stage_mappings;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.activity_journey_stage_mappings;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.activity_journey_stage_mappings;
CREATE POLICY p05_mapping_select ON pathways.activity_journey_stage_mappings FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.read',project_id)));
CREATE POLICY p05_mapping_insert ON pathways.activity_journey_stage_mappings FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND created_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('journeys.manage',project_id)));
CREATE POLICY p05_mapping_update ON pathways.activity_journey_stage_mappings FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.manage',project_id)))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()));

DROP POLICY IF EXISTS p4_runtime_select ON pathways.beneficiary_activity_participations;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.beneficiary_activity_participations;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.beneficiary_activity_participations;
CREATE POLICY p05_participation_select ON pathways.beneficiary_activity_participations FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.read',project_id)));
CREATE POLICY p05_participation_insert ON pathways.beneficiary_activity_participations FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND recorded_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('participation.record',project_id)));

DROP POLICY IF EXISTS p4_runtime_select ON pathways.beneficiary_journey_events;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.beneficiary_journey_events;
CREATE POLICY p05_journey_event_select ON pathways.beneficiary_journey_events FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.read',project_id)));
CREATE POLICY p05_journey_event_insert ON pathways.beneficiary_journey_events FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND recorded_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p05_has_project_permission('participation.record',project_id)));

DROP POLICY IF EXISTS p04_runtime_update ON pathways.beneficiary_project_enrollments;
DROP POLICY IF EXISTS p04_runtime_lock ON pathways.beneficiary_project_enrollments;
GRANT UPDATE(status,ended_date,end_reason,remarks,updated_at)
  ON pathways.beneficiary_project_enrollments TO pathways_runtime;
CREATE POLICY p05_enrollment_update ON pathways.beneficiary_project_enrollments FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('beneficiaries.enrollments.manage',project_id)))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('beneficiaries.enrollments.manage',project_id)));
CREATE POLICY p05_participation_enrollment_lock ON pathways.beneficiary_project_enrollments
FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('participation.record',project_id)))
WITH CHECK (false);

REVOKE ALL ON FUNCTION pathways.p05_has_project_permission(text,uuid),
  pathways.p05_guard_activity_update(),pathways.p05_guard_stage_freeze(),
  pathways.p05_guard_mapping_freeze(),pathways.p05_snapshot_journey_event()
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p05_has_project_permission(text,uuid) TO pathways_runtime;

COMMIT;
