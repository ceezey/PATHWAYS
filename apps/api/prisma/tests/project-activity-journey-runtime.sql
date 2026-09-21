-- Disposable PostgreSQL behavioral checks for P05. Synthetic rows only; rollback at end.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database()<>'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port()<>55448 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'P05 checks require the guarded disposable replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
 ('76000000-0000-4000-8000-000000000011'),
 ('76000000-0000-4000-8000-000000000012'),
 ('76000000-0000-4000-8000-000000000013');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('76000000-0000-4000-8000-000000000001','P05_A','Synthetic P05 organization'),
 ('76000000-0000-4000-8000-000000000002','P05_B','Synthetic P05 foreign organization');
INSERT INTO pathways.roles(id,code,name) VALUES
 ('76000000-0000-4000-8000-000000000021','PROJECT_MANAGER','Project Manager'),
 ('76000000-0000-4000-8000-000000000022','PROJECT_OFFICER','Project Officer'),
 ('76000000-0000-4000-8000-000000000023','MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;

INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT '76000000-0000-4000-8000-000000000031', '76000000-0000-4000-8000-000000000001', id, '76000000-0000-4000-8000-000000000011', 'P05 Manager','p05-manager@example.invalid','ACTIVE',now() FROM pathways.roles WHERE code='PROJECT_MANAGER';
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT '76000000-0000-4000-8000-000000000032', '76000000-0000-4000-8000-000000000001', id, '76000000-0000-4000-8000-000000000012', 'P05 Officer','p05-officer@example.invalid','ACTIVE',now() FROM pathways.roles WHERE code='PROJECT_OFFICER';
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT '76000000-0000-4000-8000-000000000033', '76000000-0000-4000-8000-000000000001', id, '76000000-0000-4000-8000-000000000013', 'P05 M&E','p05-me@example.invalid','ACTIVE',now() FROM pathways.roles WHERE code='MONITORING_AND_EVALUATION_OFFICER';

SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000031',true);

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON
 (r.code='PROJECT_MANAGER' AND p.code IN ('projects.read','activities.read','activities.create','activities.update','journeys.read','journeys.manage','participation.record','beneficiaries.records.register','beneficiaries.enrollments.manage'))
 OR (r.code='PROJECT_OFFICER' AND p.code IN ('projects.read','activities.read','activities.proof.submit','journeys.read','participation.record','submissions.write','beneficiaries.records.read'))
 OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('projects.read','activities.read','evidence.review','journeys.read','journeys.manage','participation.record'))
ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000001','P05-A1','P05 project','2026-01-01','2026-12-31','76000000-0000-4000-8000-000000000031'),
 ('76000000-0000-4000-8000-000000000042','76000000-0000-4000-8000-000000000002','P05-B1','Foreign P05 project','2026-01-01','2026-12-31',NULL);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 ('76000000-0000-4000-8000-000000000051','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000031','76000000-0000-4000-8000-000000000031'),
 ('76000000-0000-4000-8000-000000000052','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000032','76000000-0000-4000-8000-000000000031'),
 ('76000000-0000-4000-8000-000000000053','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000033','76000000-0000-4000-8000-000000000031');
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,status,actual_start_date,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','ACT-1','Synthetic activity','2026-01-01','2026-06-30','NOT_STARTED',NULL,'76000000-0000-4000-8000-000000000031');
UPDATE pathways.project_activities SET status='IN_PROGRESS',actual_start_date='2026-01-01'
WHERE id='76000000-0000-4000-8000-000000000061';
INSERT INTO pathways.project_activity_assignments(id,organization_id,project_id,activity_id,project_assignment_id,assigned_by_id) VALUES
 ('76000000-0000-4000-8000-000000000062','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000052','76000000-0000-4000-8000-000000000031');
INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,stage_type,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000071','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','ENTRY','Entry',1,'ENTRY','76000000-0000-4000-8000-000000000031');
INSERT INTO pathways.activity_journey_stage_mappings(id,organization_id,project_id,activity_id,stage_id,sequence_order,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000072','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000071',1,'76000000-0000-4000-8000-000000000031');

-- Regression for P07 C4 saveStages(): deleteMany() executes even for a first
-- browser save. Project Officers must remain unable to delete mappings, while
-- an assigned Project Manager with journeys.manage may replace them before the
-- first journey event.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000032',true);
DO $$ DECLARE affected integer; BEGIN
  DELETE FROM pathways.activity_journey_stage_mappings
  WHERE id='76000000-0000-4000-8000-000000000072';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Project Officer unexpectedly deleted a journey mapping'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000031',true);
DELETE FROM pathways.activity_journey_stage_mappings
WHERE id='76000000-0000-4000-8000-000000000072';
INSERT INTO pathways.activity_journey_stage_mappings(id,organization_id,project_id,activity_id,stage_id,sequence_order,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000072','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000071',1,'76000000-0000-4000-8000-000000000031');
RESET ROLE;
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,display_name,status,consent_recorded,data_processing_consent_recorded,created_by_id) VALUES
 ('76000000-0000-4000-8000-000000000081','76000000-0000-4000-8000-000000000001','P05-BEN-1','GROUP','Synthetic P05 Group','ACTIVE',true,true,'76000000-0000-4000-8000-000000000031');
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES
 ('76000000-0000-4000-8000-000000000082','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000081','2026-01-01','76000000-0000-4000-8000-000000000031');

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000032',true);

INSERT INTO pathways.activity_updates(id,organization_id,project_id,activity_id,client_update_id,progress_percent,note,submitted_by_id) VALUES
 ('76000000-0000-4000-8000-000000000091','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000092',80,'Synthetic update','76000000-0000-4000-8000-000000000032');
INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,activity_update_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,storage_ready,submitted_by_id) VALUES
 ('76000000-0000-4000-8000-000000000093','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000091','PROGRESS_PROOF','proof.pdf','pathways-private','organizations/76000000-0000-4000-8000-000000000001/projects/76000000-0000-4000-8000-000000000041/evidence/76000000-0000-4000-8000-000000000093/proof.pdf',repeat('a',64),10,'application/pdf',true,'76000000-0000-4000-8000-000000000032');
UPDATE pathways.project_activities SET status='FOR_REVIEW',progress_percent=80 WHERE id='76000000-0000-4000-8000-000000000061';

DO $$ DECLARE affected integer; BEGIN
  UPDATE pathways.activity_updates SET status='APPROVED',reviewed_by_id='76000000-0000-4000-8000-000000000032',reviewed_at=now(),review_reason='self review'
  WHERE id='76000000-0000-4000-8000-000000000091';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'actor without review permission changed an update'; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  BEGIN
    UPDATE pathways.activity_updates SET status='APPROVED',reviewed_by_id=submitted_by_id,reviewed_at=now(),review_reason='self review'
    WHERE id='76000000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'database self review unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000033',true);
UPDATE pathways.activity_updates SET status='APPROVED',reviewed_by_id='76000000-0000-4000-8000-000000000033',reviewed_at=now(),review_reason='Evidence accepted'
WHERE id='76000000-0000-4000-8000-000000000091';
UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id='76000000-0000-4000-8000-000000000033',verified_at=now()
WHERE id='76000000-0000-4000-8000-000000000093';
-- Regression: the business calendar may already be the next day while the
-- auditable review timestamptz is still on the prior UTC date. A completion
-- date more than one day away is still rejected.
DO $$ BEGIN
  BEGIN
    UPDATE pathways.project_activities
    SET status='COMPLETED',progress_percent=100,actual_end_date='2026-07-03',
        reviewed_by_id='76000000-0000-4000-8000-000000000033',
        reviewed_at='2026-06-30 16:30:00+00'
    WHERE id='76000000-0000-4000-8000-000000000061';
    RAISE EXCEPTION 'timezone-safe lifecycle window unexpectedly allowed a multi-day mismatch';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

UPDATE pathways.project_activities
SET status='COMPLETED',progress_percent=100,actual_end_date='2026-07-01',
    reviewed_by_id='76000000-0000-4000-8000-000000000033',
    reviewed_at='2026-06-30 16:30:00+00'
WHERE id='76000000-0000-4000-8000-000000000061';

RESET ROLE;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000032',true);
INSERT INTO pathways.beneficiary_activity_participations(id,organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,progress_status,recorded_by_id) VALUES
 ('76000000-0000-4000-8000-000000000094','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000082','76000000-0000-4000-8000-000000000061','PRESENT','2026-05-01','IN_PROGRESS','76000000-0000-4000-8000-000000000032');
INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,stage_id,participation_id,event_type,event_date,description,recorded_by_id) VALUES
 ('76000000-0000-4000-8000-000000000095','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000082','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000071','76000000-0000-4000-8000-000000000094','PARTICIPATION','2026-05-01','Participated','76000000-0000-4000-8000-000000000032');

RESET ROLE;
DO $$ BEGIN
  IF (SELECT stage_code_snapshot FROM pathways.beneficiary_journey_events WHERE id='76000000-0000-4000-8000-000000000095')<>'ENTRY' THEN RAISE EXCEPTION 'journey snapshot missing'; END IF;
  BEGIN
    UPDATE pathways.journey_stages SET name='Relabeled' WHERE id='76000000-0000-4000-8000-000000000071';
    RAISE EXCEPTION 'used stage relabel unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM pathways.activity_journey_stage_mappings WHERE id='76000000-0000-4000-8000-000000000072';
    RAISE EXCEPTION 'used mapping deletion unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,stage_type,created_by_id) VALUES
     ('76000000-0000-4000-8000-000000000073','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','LATE','Late insertion',2,'CORE','76000000-0000-4000-8000-000000000031');
    RAISE EXCEPTION 'stage insertion after use unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Reproduce the application correction path under the non-owner runtime role.
-- The correction must succeed without granting UPDATE on append-only journey events.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','76000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','76000000-0000-4000-8000-000000000032',true);

DO $$ BEGIN
  BEGIN
    UPDATE pathways.beneficiary_journey_events
    SET description='Runtime mutation must remain denied'
    WHERE id='76000000-0000-4000-8000-000000000095';
    RAISE EXCEPTION 'runtime journey-event UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,stage_id,event_type,event_date,description,corrects_event_id,correction_reason,recorded_by_id) VALUES
 ('76000000-0000-4000-8000-000000000096','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000041','76000000-0000-4000-8000-000000000082','76000000-0000-4000-8000-000000000061','76000000-0000-4000-8000-000000000071','PARTICIPATION','2026-05-02','Corrected note','76000000-0000-4000-8000-000000000095','Corrected date and note','76000000-0000-4000-8000-000000000032');

RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM pathways.beneficiary_journey_events WHERE enrollment_id='76000000-0000-4000-8000-000000000082')<>2 THEN RAISE EXCEPTION 'append-only correction missing'; END IF;
  IF (SELECT corrects_event_id FROM pathways.beneficiary_journey_events WHERE id='76000000-0000-4000-8000-000000000096')<>'76000000-0000-4000-8000-000000000095'::uuid THEN RAISE EXCEPTION 'correction root link missing'; END IF;
  IF (SELECT count(*) FROM pathways.project_activities WHERE organization_id='76000000-0000-4000-8000-000000000002')<>0 THEN RAISE EXCEPTION 'cross-organization activity leaked'; END IF;
END $$;

ROLLBACK;
