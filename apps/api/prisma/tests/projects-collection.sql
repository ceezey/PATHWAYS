-- Disposable LOCAL databases only. Every fixture is synthetic and rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'pathways_phase2_%' OR inet_server_addr() <> '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'This suite is restricted to disposable local Phase 2 databases';
  END IF;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE phase2_assertions (name text PRIMARY KEY);
CREATE FUNCTION pg_temp.reject(command text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    EXECUTE command;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN
    -- PostgreSQL 18 distinguishes RESTRICT (23001) from other FK failures (23503).
    IF SQLSTATE <> expected AND NOT (expected='23503' AND SQLSTATE='23001') THEN
      RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM;
    END IF;
    caught:=true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'Assertion % unexpectedly accepted invalid data',label; END IF;
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO phase2_assertions VALUES(label);
END $$;
CREATE FUNCTION pg_temp.ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
  INSERT INTO phase2_assertions VALUES(label);
END $$;

INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'TEST_A','Synthetic A'),(pg_temp.u(2),'TEST_B','Synthetic B');
INSERT INTO pathways.roles(id,code,name) VALUES(pg_temp.u(10),'TEST_ONLY','Local fixture role');
INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at)
VALUES(pg_temp.u(11),pg_temp.u(1),pg_temp.u(10),'Test creator','creator@example.invalid','ACTIVE',now()),
 (pg_temp.u(12),pg_temp.u(1),pg_temp.u(10),'Test reviewer','reviewer@example.invalid','ACTIVE',now()),
 (pg_temp.u(13),pg_temp.u(2),pg_temp.u(10),'Other organization','other@example.invalid','ACTIVE',now()),
 (pg_temp.u(14),pg_temp.u(1),pg_temp.u(10),'Invited profile','invited@example.invalid','INVITED',NULL);
INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id)
VALUES(pg_temp.u(90),pg_temp.u(1),'PROGRAM_A','Program A',pg_temp.u(11));
INSERT INTO pathways.projects(id,organization_id,program_id,code,title,created_by_id)
VALUES(pg_temp.u(101),pg_temp.u(1),pg_temp.u(90),'PROJECT_A','Project A',pg_temp.u(11)),
 (pg_temp.u(102),pg_temp.u(1),NULL,'PROJECT_A2','Project A2',pg_temp.u(11)),
 (pg_temp.u(103),pg_temp.u(2),NULL,'PROJECT_B','Project B',pg_temp.u(13));
SELECT pg_temp.reject($q$INSERT INTO pathways.projects(organization_id,program_id,code,title) VALUES(pg_temp.u(2),pg_temp.u(90),'CROSS','Cross')$q$,'23503','Project/program organization isolation');
SELECT pg_temp.reject($q$INSERT INTO pathways.programs(organization_id,code,name,manager_user_id) VALUES(pg_temp.u(1),'BAD_MANAGER','Bad manager',pg_temp.u(13))$q$,'23503','Program manager organization isolation');
SELECT pg_temp.reject($q$INSERT INTO pathways.projects(organization_id,code,title,start_date,end_date) VALUES(pg_temp.u(1),'DATES','Dates','2026-02-01','2026-01-01')$q$,'23514','Project reversed dates');

INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES(pg_temp.u(1001),pg_temp.u(1),pg_temp.u(101),pg_temp.u(11),pg_temp.u(12)),
 (pg_temp.u(1002),pg_temp.u(1),pg_temp.u(101),pg_temp.u(12),pg_temp.u(11));
SELECT pg_temp.reject($q$INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(11),pg_temp.u(12))$q$,'23505','Only one active assignment per project/user');
SELECT pg_temp.reject($q$INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(14),pg_temp.u(12))$q$,'23514','Invited profile cannot receive active assignment');
SELECT pg_temp.reject($q$INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(2),pg_temp.u(103),pg_temp.u(11),pg_temp.u(13))$q$,'23514','Assignment cannot cross profile organization');
SELECT pg_temp.reject($q$UPDATE pathways.system_users SET account_status='SUSPENDED',suspended_at=now() WHERE id=pg_temp.u(11)$q$,'23514','Active memberships guard profile suspension');

INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,created_by_id,planned_end_date)
VALUES(pg_temp.u(201),pg_temp.u(1),pg_temp.u(101),'ACTIVITY_A','Activity A',pg_temp.u(11),current_date-1),
 (pg_temp.u(202),pg_temp.u(1),pg_temp.u(102),'ACTIVITY_A2','Activity A2',pg_temp.u(11),NULL),
 (pg_temp.u(203),pg_temp.u(2),pg_temp.u(103),'ACTIVITY_B','Activity B',pg_temp.u(13),NULL),
 (pg_temp.u(204),pg_temp.u(1),pg_temp.u(101),'CANCEL','Cancellation',pg_temp.u(11),NULL);
INSERT INTO pathways.project_activity_assignments(id,organization_id,project_id,activity_id,project_assignment_id,assigned_by_id)
VALUES(pg_temp.u(1101),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(1001),pg_temp.u(12));
SELECT pg_temp.reject($q$INSERT INTO pathways.project_activity_assignments(organization_id,project_id,activity_id,project_assignment_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(202),pg_temp.u(1001),pg_temp.u(12))$q$,'23503','Activity assignment same-project FK');
SELECT pg_temp.reject($q$UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='End' WHERE id=pg_temp.u(1001)$q$,'23514','End child activity assignments first');
SELECT pg_temp.reject($q$UPDATE pathways.project_activity_assignments SET status='REMOVED' WHERE id=pg_temp.u(1101)$q$,'23514','Ended activity assignment needs time/reason');
UPDATE pathways.project_activity_assignments SET status='REMOVED',ended_at=now(),end_reason='Test end' WHERE id=pg_temp.u(1101);
UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Test end' WHERE id=pg_temp.u(1001);
SELECT pg_temp.reject($q$INSERT INTO pathways.project_activity_assignments(organization_id,project_id,activity_id,project_assignment_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(1001),pg_temp.u(12))$q$,'23514','Ended membership cannot receive active activity assignment');
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(11),pg_temp.u(12));
SELECT pg_temp.ok((SELECT count(*)=2 FROM pathways.user_project_assignments WHERE user_id=pg_temp.u(11)),'Reassignment preserves ended history');
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='OVERDUE' WHERE id=pg_temp.u(201)$q$,'22P02','Overdue cannot be stored as status');
SELECT pg_temp.ok((SELECT planned_end_date<current_date AND status NOT IN ('COMPLETED','CANCELLED') FROM pathways.project_activities WHERE id=pg_temp.u(201)),'Overdue derived from date and nonterminal state');
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='IN_PROGRESS' WHERE id=pg_temp.u(201)$q$,'23514','Activity start requires actual start date');
UPDATE pathways.project_activities SET status='IN_PROGRESS',actual_start_date=current_date-2 WHERE id=pg_temp.u(201);
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='COMPLETED',actual_end_date=current_date,reviewed_by_id=pg_temp.u(12),reviewed_at=now() WHERE id=pg_temp.u(201)$q$,'23514','Completion must pass review state');
UPDATE pathways.project_activities SET status='FOR_REVIEW' WHERE id=pg_temp.u(201);
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='COMPLETED',actual_end_date=current_date,reviewed_by_id=pg_temp.u(11),reviewed_at=now() WHERE id=pg_temp.u(201)$q$,'23514','Activity self-review rejected');
UPDATE pathways.project_activities SET status='COMPLETED',actual_end_date=current_date,reviewed_by_id=pg_temp.u(12),reviewed_at=now() WHERE id=pg_temp.u(201);
SELECT pg_temp.ok((SELECT NOT(planned_end_date<current_date AND status NOT IN ('COMPLETED','CANCELLED')) FROM pathways.project_activities WHERE id=pg_temp.u(201)),'Completed activity ceases to be overdue');
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='IN_PROGRESS',actual_end_date=NULL,reviewed_at=NULL,reviewed_by_id=NULL WHERE id=pg_temp.u(201)$q$,'23514','Completed lifecycle cannot reopen silently');
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET status='CANCELLED',cancelled_at=now() WHERE id=pg_temp.u(204)$q$,'23514','Cancellation requires reason');
UPDATE pathways.project_activities SET status='CANCELLED',cancelled_at=now(),cancellation_reason='Synthetic cancellation' WHERE id=pg_temp.u(204);
INSERT INTO pathways.project_milestones(organization_id,project_id,title) VALUES(pg_temp.u(1),pg_temp.u(101),'Milestone');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_milestones(organization_id,project_id,title,status) VALUES(pg_temp.u(1),pg_temp.u(101),'Missing date','COMPLETED')$q$,'23514','Milestone completion requires date');

INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,unit,target_value,actual_value) VALUES(pg_temp.u(1),pg_temp.u(101),'COUNT','Count','COUNT',10,12);
SELECT pg_temp.ok((SELECT actual_value>target_value FROM pathways.project_indicators WHERE code='COUNT'),'Count may exceed target');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,unit,actual_value) VALUES(pg_temp.u(1),pg_temp.u(101),'PERCENT','Percent','PERCENTAGE',101)$q$,'23514','Percentage upper bound');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,unit,actual_value) VALUES(pg_temp.u(1),pg_temp.u(101),'NEGATIVE','Negative','COUNT',-1)$q$,'23514','Nonnegative count');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,unit,actual_value) VALUES(pg_temp.u(1),pg_temp.u(101),'FRACTION','Fraction','COUNT',1.5)$q$,'23514','Integer count');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,unit,actual_value,maximum_value) VALUES(pg_temp.u(1),pg_temp.u(101),'SCORE','Score','SCORE',11,10)$q$,'23514','Score maximum');
SELECT pg_temp.reject($q$INSERT INTO pathways.project_indicators(organization_id,project_id,code,name,actual_value) VALUES(pg_temp.u(1),pg_temp.u(101),'NAN','NaN','NaN')$q$,'23514','NaN indicator rejected');

INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,parent_stage_id)
VALUES(pg_temp.u(301),pg_temp.u(1),pg_temp.u(101),'ENTRY','Entry',1,NULL),
 (pg_temp.u(302),pg_temp.u(1),pg_temp.u(101),'CORE','Core',2,pg_temp.u(301)),
 (pg_temp.u(303),pg_temp.u(1),pg_temp.u(102),'OTHER','Other project',1,NULL);
SELECT pg_temp.reject($q$UPDATE pathways.journey_stages SET parent_stage_id=pg_temp.u(302) WHERE id=pg_temp.u(301)$q$,'23514','Stage cycle rejected');
SELECT pg_temp.reject($q$UPDATE pathways.journey_stages SET is_terminal=true WHERE id=pg_temp.u(301)$q$,'23514','Terminal stage cannot retain children');
INSERT INTO pathways.activity_journey_stage_mappings(id,organization_id,project_id,activity_id,stage_id,sequence_order)
VALUES(pg_temp.u(304),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(301),1);
SELECT pg_temp.reject($q$INSERT INTO pathways.activity_journey_stage_mappings(organization_id,project_id,activity_id,stage_id,sequence_order) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(303),1)$q$,'23503','Activity/stage project isolation');

INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name,activity_id,journey_stage_id)
VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),'COLLECTION','Collection',pg_temp.u(201),pg_temp.u(301)),
 (pg_temp.u(402),pg_temp.u(1),pg_temp.u(102),'OTHER','Other',NULL,NULL);
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no,minimum_value,maximum_value,allowed_values)
VALUES(pg_temp.u(411),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'number','Number','INTEGER',true,1,0,10,NULL),
 (pg_temp.u(412),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'choice','Choice','SELECT',false,2,NULL,NULL,'["YES","NO"]'),
 (pg_temp.u(413),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'date','Date','DATE',false,3,NULL,NULL,NULL),
 (pg_temp.u(414),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'multi','Multi','MULTIPLE_SELECT',false,4,NULL,NULL,'["A","B"]'),
 (pg_temp.u(421),pg_temp.u(1),pg_temp.u(102),pg_temp.u(402),'other','Other','TEXT',false,1,NULL,NULL,NULL);
SELECT pg_temp.reject($q$INSERT INTO pathways.form_fields(organization_id,project_id,form_id,code,label,data_type,sequence_no,allowed_values) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'bad','Bad','SELECT',5,'["A","A"]')$q$,'23514','Duplicate select options rejected');
UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id=pg_temp.u(12) WHERE id IN (pg_temp.u(401),pg_temp.u(402));
SELECT pg_temp.reject($q$UPDATE pathways.digital_forms SET name='Rewritten' WHERE id=pg_temp.u(401)$q$,'23514','Published form definition immutable');
SELECT pg_temp.reject($q$UPDATE pathways.digital_forms SET status='DRAFT',published_at=NULL,published_by_id=NULL WHERE id=pg_temp.u(401)$q$,'23514','Published form cannot return to draft');
SELECT pg_temp.reject($q$DELETE FROM pathways.digital_forms WHERE id=pg_temp.u(401)$q$,'23514','Published version cannot be deleted');
SELECT pg_temp.reject($q$UPDATE pathways.form_fields SET is_required=false WHERE id=pg_temp.u(411)$q$,'23514','Published field cannot change');
SELECT pg_temp.reject($q$DELETE FROM pathways.form_fields WHERE id=pg_temp.u(411)$q$,'23514','Published field cannot be deleted');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_fields(organization_id,project_id,form_id,code,label,data_type,sequence_no) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'new','New','TEXT',5)$q$,'23514','Published form cannot gain fields');
SELECT pg_temp.reject($q$INSERT INTO pathways.digital_forms(organization_id,project_id,code,name) VALUES(pg_temp.u(1),pg_temp.u(101),'COLLECTION','Duplicate version')$q$,'23505','Form version unique');
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name,version) VALUES(pg_temp.u(403),pg_temp.u(1),pg_temp.u(101),'COLLECTION','New version',2);
SELECT pg_temp.ok((SELECT count(*)=2 FROM pathways.digital_forms WHERE code='COLLECTION'),'New version preserves old definition');

INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,original_file_name,uploaded_by_id)
VALUES(pg_temp.u(501),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'synthetic.csv',pg_temp.u(11));
INSERT INTO pathways.data_import_rows(id,organization_id,project_id,form_id,import_batch_id,row_number,raw_data,status,validation_errors,validated_by_id,validated_at)
VALUES(pg_temp.u(511),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),1,'{"source_number":"unchecked"}','PENDING','[]',NULL,NULL),
 (pg_temp.u(512),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),2,'{"source_number":"bad"}','INVALID','["invalid number"]',pg_temp.u(12),now()),
 (pg_temp.u(513),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),3,'{"source_number":5}','VALID','[]',pg_temp.u(12),now());
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.form_submissions),'Raw rows create no normalized submissions automatically');
SELECT pg_temp.reject($q$INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,raw_data) VALUES(pg_temp.u(1),pg_temp.u(102),pg_temp.u(402),pg_temp.u(501),4,'{}')$q$,'23503','Raw batch/form/project composite isolation');
INSERT INTO pathways.metadata_mappings(id,organization_id,project_id,form_id,import_batch_id,source_field_name,target_field_id,status)
VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),'source_number',pg_temp.u(411),'MAPPED');
SELECT pg_temp.reject($q$INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,source_field_name,target_field_id,status) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),'bad',pg_temp.u(421),'MAPPED')$q$,'23503','Mapping target must belong to batch form');
SELECT pg_temp.reject($q$INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,source_field_name,target_system_field,status) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),'unsafe','auth.users.password','MAPPED')$q$,'23514','System mapping allowlist');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_submissions(organization_id,project_id,form_id,import_batch_id,import_row_id,submitted_by_id,source) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),pg_temp.u(512),pg_temp.u(11),'IMPORTED_DATASET')$q$,'23514','INVALID import cannot create even draft submission');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_submissions(organization_id,project_id,form_id,import_batch_id,import_row_id,submitted_by_id,source) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),pg_temp.u(511),pg_temp.u(11),'IMPORTED_DATASET')$q$,'23514','PENDING import cannot create submission');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_submissions(organization_id,project_id,form_id,submitted_by_id,source) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(11),'IMPORTED_DATASET')$q$,'23514','Imported source must retain raw provenance');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_submissions(organization_id,project_id,form_id,submitted_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(403),pg_temp.u(11))$q$,'23514','Draft form cannot receive submissions');

INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,submitted_by_id)
VALUES(pg_temp.u(601),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(11));
SELECT pg_temp.reject($q$UPDATE pathways.form_submissions SET status='VALIDATED',validated_by_id=pg_temp.u(12),validated_at=now() WHERE id=pg_temp.u(601)$q$,'23514','Required response enforced at transaction boundary');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(411),'"not a number"')$q$,'23514','Typed numeric response rejects string');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(411),'11')$q$,'23514','Numeric response maximum');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(412),'"UNKNOWN"')$q$,'23514','Select option allowlist');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(413),'"2026-02-31"')$q$,'23514','Invalid calendar date');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(414),'["A","A"]')$q$,'23514','Multi-select duplicates rejected');
SELECT pg_temp.reject($q$INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(421),'"other"')$q$,'23514','Response field must belong to submission form');
INSERT INTO pathways.form_response_values(id,organization_id,project_id,form_id,submission_id,field_id,value)
VALUES(pg_temp.u(611),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(601),pg_temp.u(411),'5');
UPDATE pathways.form_submissions SET status='VALIDATED',validated_by_id=pg_temp.u(12),validated_at=now() WHERE id=pg_temp.u(601);
SELECT pg_temp.reject($q$UPDATE pathways.form_response_values SET value='6' WHERE id=pg_temp.u(611)$q$,'23514','Validated response immutable');
SELECT pg_temp.reject($q$DELETE FROM pathways.form_response_values WHERE id=pg_temp.u(611)$q$,'23514','Validated response cannot disappear');
SELECT pg_temp.reject($q$UPDATE pathways.form_submissions SET status='DRAFT',validated_at=NULL,validated_by_id=NULL WHERE id=pg_temp.u(601)$q$,'23514','Validated submission cannot revert to editable draft');
UPDATE pathways.form_submissions SET status='PROCESSED',processed_at=now() WHERE id=pg_temp.u(601);

INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,import_batch_id,import_row_id,submitted_by_id,source)
VALUES(pg_temp.u(602),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),pg_temp.u(513),pg_temp.u(11),'IMPORTED_DATASET');
SELECT pg_temp.reject($q$UPDATE pathways.data_import_rows SET raw_data='{"source_number":8}' WHERE id=pg_temp.u(513)$q$,'23514','Validated raw evidence immutable');
SELECT pg_temp.reject($q$UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at=now() WHERE id=pg_temp.u(513)$q$,'23514','Raw processed state requires normalized processing');
INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value)
VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(602),pg_temp.u(411),'5');
UPDATE pathways.form_submissions SET status='VALIDATED',validated_at=now(),validated_by_id=pg_temp.u(12) WHERE id=pg_temp.u(602);
UPDATE pathways.form_submissions SET status='PROCESSED',processed_at=now() WHERE id=pg_temp.u(602);
UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at=now() WHERE id=pg_temp.u(513);
SELECT pg_temp.reject($q$UPDATE pathways.data_import_batches SET status='VALIDATED',validated_at=now() WHERE id=pg_temp.u(501)$q$,'23514','Pending rows block batch validation');
UPDATE pathways.data_import_rows SET status='INVALID',validated_at=now(),validated_by_id=pg_temp.u(12),validation_errors='["unrecognized value"]' WHERE id=pg_temp.u(511);
UPDATE pathways.data_import_batches SET status='VALIDATED',validated_at=now() WHERE id=pg_temp.u(501);
SELECT pg_temp.reject($q$UPDATE pathways.metadata_mappings SET source_field_name='changed' WHERE id=pg_temp.u(521)$q$,'23514','Validated mapping immutable');
UPDATE pathways.data_import_batches SET status='PROCESSED',processed_at=now() WHERE id=pg_temp.u(501);
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.form_submissions WHERE source='IMPORTED_DATASET'),'Only valid raw row normalized; invalid rows remain staging');

INSERT INTO pathways.beneficiaries(id,organization_id,code,first_name)
VALUES(pg_temp.u(801),pg_temp.u(1),'BEN_A','Synthetic'),(pg_temp.u(802),pg_temp.u(2),'BEN_B','Other');
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
VALUES(pg_temp.u(701),pg_temp.u(1),pg_temp.u(101),pg_temp.u(801),'2026-01-01',pg_temp.u(11)),
 (pg_temp.u(702),pg_temp.u(1),pg_temp.u(102),pg_temp.u(801),'2026-01-01',pg_temp.u(11));
SELECT pg_temp.ok((SELECT count(*)=2 FROM pathways.beneficiary_project_enrollments WHERE beneficiary_id=pg_temp.u(801)),'Beneficiary can enroll in multiple projects');
SELECT pg_temp.reject($q$INSERT INTO pathways.beneficiary_project_enrollments(organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(802),'2026-01-01',pg_temp.u(11))$q$,'23503','Beneficiary organization isolation');
SELECT pg_temp.reject($q$INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,participation_date,recorded_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(702),pg_temp.u(201),'2026-02-01',pg_temp.u(11))$q$,'23514','Participation requires enrollment in same project');
SELECT pg_temp.reject($q$INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,participation_date,recorded_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),pg_temp.u(201),'2025-01-01',pg_temp.u(11))$q$,'23514','Participation cannot precede enrollment');
INSERT INTO pathways.beneficiary_activity_participations(id,organization_id,project_id,enrollment_id,activity_id,participation_date,recorded_by_id)
VALUES(pg_temp.u(901),pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),pg_temp.u(201),'2026-02-01',pg_temp.u(11));
INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,stage_id,participation_id,event_type,event_date,recorded_by_id)
VALUES(pg_temp.u(911),pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),pg_temp.u(201),pg_temp.u(301),pg_temp.u(901),'PARTICIPATION','2026-02-01',pg_temp.u(11));
SELECT pg_temp.reject($q$INSERT INTO pathways.beneficiary_journey_events(organization_id,project_id,enrollment_id,activity_id,stage_id,event_type,event_date,recorded_by_id) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),pg_temp.u(201),pg_temp.u(302),'PROGRESS_UPDATE','2026-02-01',pg_temp.u(11))$q$,'23503','Journey activity and stage require actual mapping');
SELECT pg_temp.reject($q$UPDATE pathways.beneficiary_project_enrollments SET enrollment_date='2026-03-01' WHERE id=pg_temp.u(701)$q$,'23514','Enrollment update cannot invalidate history');
SELECT pg_temp.reject($q$UPDATE pathways.beneficiary_journey_events SET description='rewrite' WHERE id=pg_temp.u(911)$q$,'23514','Journey history append-only');
SELECT pg_temp.reject($q$DELETE FROM pathways.beneficiary_project_enrollments WHERE id=pg_temp.u(701)$q$,'23503','Enrollment history restricts deletion');
SELECT pg_temp.reject($q$DELETE FROM pathways.beneficiaries WHERE id=pg_temp.u(801)$q$,'23503','Beneficiary history restricts deletion');

SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_visibility_status='PUBLISHED' WHERE id=pg_temp.u(101)$q$,'23514','Publication requires approval and actors');
UPDATE pathways.projects SET public_visibility_status='FOR_REVIEW',public_summary='Synthetic approved summary',public_submitted_by_id=pg_temp.u(11),public_submitted_at=now() WHERE id=pg_temp.u(101);
SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_visibility_status='APPROVED',public_approved_by_id=pg_temp.u(11),public_approved_at=now() WHERE id=pg_temp.u(101)$q$,'23514','Public self-approval rejected');
SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_visibility_status='APPROVED',public_approved_by_id=pg_temp.u(13),public_approved_at=now() WHERE id=pg_temp.u(101)$q$,'23503','Public reviewer organization isolation');
UPDATE pathways.projects SET public_visibility_status='APPROVED',public_approved_by_id=pg_temp.u(12),public_approved_at=now() WHERE id=pg_temp.u(101);
SELECT pg_temp.ok((SELECT published_at IS NULL FROM pathways.projects WHERE id=pg_temp.u(101)),'Approval is distinct from publication');
SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_visibility_status='PUBLISHED',published_by_id=pg_temp.u(12),published_at=public_approved_at-interval '1 day' WHERE id=pg_temp.u(101)$q$,'23514','Publication cannot precede approval');
UPDATE pathways.projects SET public_visibility_status='PUBLISHED',published_by_id=pg_temp.u(12),published_at=now() WHERE id=pg_temp.u(101);
SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_summary='Unreviewed edit' WHERE id=pg_temp.u(101)$q$,'23514','Published summary cannot retain stale approval');
SELECT pg_temp.reject($q$UPDATE pathways.projects SET organization_id=pg_temp.u(2) WHERE id=pg_temp.u(101)$q$,'23514','History cannot move between organizations');
SELECT pg_temp.reject($q$UPDATE pathways.project_activities SET actual_end_date=current_date-1 WHERE id=pg_temp.u(201)$q$,'23514','Completion facts cannot be rewritten');
SELECT pg_temp.reject($q$UPDATE pathways.data_import_rows SET processed_at=processed_at+interval '1 second' WHERE id=pg_temp.u(513)$q$,'23514','Processing instant preserved');
SELECT pg_temp.reject($q$INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,raw_data) VALUES(pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),pg_temp.u(501),50,'{}')$q$,'23514','Finalized batch cannot gain raw rows');
SELECT pg_temp.reject($q$UPDATE pathways.projects SET public_visibility_status='APPROVED',public_summary='Skip review',public_submitted_by_id=pg_temp.u(11),public_submitted_at=now(),public_approved_by_id=pg_temp.u(12),public_approved_at=now() WHERE id=pg_temp.u(102)$q$,'23514','Public approval cannot skip review state');

SELECT pg_temp.ok((SELECT count(*)=26 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relkind='r'),'Exactly 26 target tables');
SELECT pg_temp.ok((SELECT count(*)=20 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relkind='r' AND c.relrowsecurity),'All 20 new tables have RLS enabled');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'PHASE2_ASSERTIONS_PASSED=' || count(*) FROM phase2_assertions;
ROLLBACK;
