-- P08 Project/Activity creation-contract and aggregate security checks.
-- Run ONLY through infra/supabase/phase6/Replay-Local.ps1.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database()<>'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port()<>55448
     OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'P08 checks require the guarded disposable replay target';
  END IF;
END
$$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P08 assertion failed: %',label;
  END IF;
END
$$;

-- Synthetic identities and exact permissions required by this test. All rows
-- are rolled back, and no managed target is reachable from this script.
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,6) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'P08_A','Synthetic P08 A'),
  (pg_temp.u(2),'P08_B','Synthetic P08 B');
INSERT INTO pathways.roles(code,name) VALUES
  ('SYSTEM_ADMINISTRATOR','System Administrator'),
  ('PROGRAM_MANAGER','Program Manager'),
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,
       'ACTIVE',now()
FROM (VALUES
  (1,pg_temp.u(1),'SYSTEM_ADMINISTRATOR','P08 Administrator','p08-admin@example.invalid'),
  (2,pg_temp.u(1),'PROGRAM_MANAGER','P08 Program Manager','p08-program@example.invalid'),
  (3,pg_temp.u(1),'PROJECT_MANAGER','P08 Project Manager','p08-project@example.invalid'),
  (4,pg_temp.u(1),'PROJECT_OFFICER','P08 Project Officer','p08-officer@example.invalid'),
  (5,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','P08 M&E','p08-me@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(106),pg_temp.u(2),r.id,pg_temp.u(206),'P08 Foreign Administrator',
       'p08-foreign@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='SYSTEM_ADMINISTRATOR';

INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),
  ('projects.create','projects.create'),
  ('projects.update','projects.update'),
  ('activities.read','activities.read'),
  ('activities.create','activities.create'),
  ('activities.update','activities.update'),
  ('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),
  ('beneficiaries.records.register','beneficiaries.records.register'),
  ('beneficiaries.records.read','beneficiaries.records.read'),
  ('beneficiaries.records.archive','beneficiaries.records.archive'),
  ('beneficiaries.profiles.update','beneficiaries.profiles.update'),
  ('beneficiaries.enrollments.manage','beneficiaries.enrollments.manage'),
  ('beneficiaries.identities.review','beneficiaries.identities.review'),
  ('participation.record','participation.record'),
  ('monitoring.read','monitoring.read'),
  ('indicators.update','indicators.update'),
  ('journeys.manage','journeys.manage'),
  ('budgets.read','budgets.read'),
  ('budgets.create','budgets.create'),
  ('budgets.update','budgets.update')
ON CONFLICT(code) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM pathways.roles r
CROSS JOIN pathways.permissions p
WHERE (r.code='SYSTEM_ADMINISTRATOR' AND p.code IN (
         'projects.read','projects.create','projects.update','activities.read','activities.create',
         'activities.update','beneficiaries.aggregates.read','beneficiaries.records.register',
         'beneficiaries.records.read','beneficiaries.records.archive','beneficiaries.profiles.update',
         'beneficiaries.enrollments.manage','beneficiaries.identities.review','participation.record',
         'monitoring.read','budgets.read','budgets.create','budgets.update'
       ))
   OR (r.code='PROGRAM_MANAGER' AND p.code IN (
         'projects.read','activities.read','beneficiaries.aggregates.read','monitoring.read'
       ))
   OR (r.code='PROJECT_MANAGER' AND p.code IN (
         'projects.read','activities.read','activities.create','activities.update',
         'beneficiaries.aggregates.read','monitoring.read','indicators.update','journeys.manage',
         'budgets.read','budgets.create','budgets.update'
       ))
   OR (r.code='PROJECT_OFFICER' AND p.code IN (
         'projects.read','activities.read','beneficiaries.aggregates.read','participation.record'
       ))
   OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN (
         'projects.read','activities.read','beneficiaries.aggregates.read','monitoring.read'
       ))
ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);

INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id) VALUES
  (pg_temp.u(251),pg_temp.u(1),'P08-PROGRAM','P08 Program',pg_temp.u(102));
INSERT INTO pathways.projects(
  id,organization_id,program_id,code,title,implementing_partners,sector,
  target_beneficiaries,target_goal,program_manager_id,start_date,end_date,created_by_id
) VALUES
  (pg_temp.u(301),pg_temp.u(1),pg_temp.u(251),'P08-A1','P08 Project A',
   'Synthetic Partner','Livelihood',120,80,pg_temp.u(102),'2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),NULL,'P08-A2','P08 Project B',
   NULL,NULL,NULL,75,NULL,'2026-01-01','2026-12-31',pg_temp.u(101));
INSERT INTO pathways.projects(
  id,organization_id,code,title,target_goal,start_date,end_date,created_by_id
) VALUES
  (pg_temp.u(303),pg_temp.u(2),'P08-B1','P08 Foreign Project',70,
   '2026-01-01','2026-12-31',pg_temp.u(106));

SELECT pg_temp.assert_true(
  (SELECT implementing_partners='Synthetic Partner' AND sector='Livelihood'
          AND target_beneficiaries=120 AND target_goal=80
          AND program_manager_id=pg_temp.u(102)
   FROM pathways.projects WHERE id=pg_temp.u(301)),
  'Project creation profile fields persist');

DO $$
BEGIN
  BEGIN
    UPDATE pathways.projects SET program_manager_id=pg_temp.u(103) WHERE id=pg_temp.u(301);
    RAISE EXCEPTION 'Non-Program-Manager descriptive assignment was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE pathways.projects SET target_beneficiaries=-1 WHERE id=pg_temp.u(301);
    RAISE EXCEPTION 'Negative Project target beneficiaries were accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$$;

INSERT INTO pathways.user_project_assignments(
  id,organization_id,project_id,user_id,assigned_by_id
) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(101)),
  (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),pg_temp.u(104),pg_temp.u(101)),
  (pg_temp.u(404),pg_temp.u(1),pg_temp.u(301),pg_temp.u(105),pg_temp.u(101)),
  (pg_temp.u(405),pg_temp.u(1),pg_temp.u(302),pg_temp.u(103),pg_temp.u(101));

INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,
  timeline_override_justification,target_beneficiaries,status,created_by_id
) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'P08-ACT-1','P08 Activity',
   '2025-12-15','2026-06-30','Approved pre-project mobilization',35,'NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'P08-ACT-2','P08 Cancelled Activity',
   '2026-01-01','2026-06-30',NULL,10,'NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(302),'P08-ACT-3','P08 Other Project Activity',
   '2026-01-01','2026-06-30',NULL,10,'NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(2),pg_temp.u(303),'P08-ACT-4','P08 Foreign Activity',
   '2026-01-01','2026-06-30',NULL,10,'NOT_STARTED',pg_temp.u(106)),
  (pg_temp.u(505),pg_temp.u(1),pg_temp.u(301),'P08-ACT-5','P08 Empty Activity',
   '2026-01-01','2026-06-30',NULL,0,'NOT_STARTED',pg_temp.u(101));
UPDATE pathways.project_activities
SET status='IN_PROGRESS',actual_start_date='2026-01-01'
WHERE id=pg_temp.u(501);
UPDATE pathways.project_activities
SET status='CANCELLED',cancelled_at=now(),cancellation_reason='Synthetic cancellation'
WHERE id=pg_temp.u(502);

DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.project_activities(
      organization_id,project_id,code,title,planned_start_date,planned_end_date,created_by_id
    ) VALUES(
      pg_temp.u(1),pg_temp.u(301),'P08-BAD-DATE','Missing override',
      '2025-12-01','2026-02-01',pg_temp.u(101)
    );
    RAISE EXCEPTION 'Out-of-project Activity dates were accepted without justification';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO pathways.project_activities(
      organization_id,project_id,code,title,planned_start_date,planned_end_date,
      timeline_override_justification,target_beneficiaries,created_by_id
    ) VALUES(
      pg_temp.u(1),pg_temp.u(301),'P08-BAD-TARGET','Bad target',
      '2026-01-01','2026-02-01',NULL,-1,pg_temp.u(101)
    );
    RAISE EXCEPTION 'Negative Activity target beneficiaries were accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.project_activity_assignments(
      organization_id,project_id,activity_id,project_assignment_id,assigned_by_id
    ) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(404),pg_temp.u(101));
    RAISE EXCEPTION 'M&E Activity assignee was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$$;
INSERT INTO pathways.project_activity_assignments(
  organization_id,project_id,activity_id,project_assignment_id,assigned_by_id
) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(403),pg_temp.u(101));

INSERT INTO pathways.project_budget_records(
  organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id
) VALUES
  (pg_temp.u(1),pg_temp.u(301),NULL,'PROJECT_PROFILE_TOTAL','PHP',125000.50,pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),'ACTIVITY_PROFILE_TOTAL','PHP',25000.25,pg_temp.u(101));
SELECT pg_temp.assert_true(
  (SELECT planned_budget=125000.50 FROM pathways.project_budget_records
   WHERE project_id=pg_temp.u(301) AND category='PROJECT_PROFILE_TOTAL' AND archived_at IS NULL),
  'Project PHP budget uses the existing decimal ledger');
SELECT pg_temp.assert_true(
  (SELECT planned_budget=25000.25 FROM pathways.project_budget_records
   WHERE activity_id=pg_temp.u(501) AND category='ACTIVITY_PROFILE_TOTAL' AND archived_at IS NULL),
  'Activity PHP budget uses the existing decimal ledger');
DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.project_budget_records(
      organization_id,project_id,category,currency,planned_budget,recorded_by_id
    ) VALUES(pg_temp.u(1),pg_temp.u(301),'PROJECT_PROFILE_TOTAL','PHP',1,pg_temp.u(101));
    RAISE EXCEPTION 'Duplicate active Project profile budget was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END
$$;

INSERT INTO pathways.project_indicators(
  id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,
  numeric_kind,direction,display_precision,period_start,period_end,created_by_id
) VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),'P08-I1','P08 Indicator 1','COUNT','people',
   'Synthetic','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-12-31',pg_temp.u(103)),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(302),'P08-I2','P08 Indicator 2','COUNT','people',
   'Synthetic','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-12-31',pg_temp.u(103));
INSERT INTO pathways.activity_indicator_links(
  organization_id,project_id,activity_id,indicator_id,created_by_id
) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(601),pg_temp.u(103));
DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.activity_indicator_links(
      organization_id,project_id,activity_id,indicator_id,created_by_id
    ) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(602),pg_temp.u(103));
    RAISE EXCEPTION 'Cross-project Activity Indicator link was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END
$$;

INSERT INTO pathways.journey_stages(
  id,organization_id,project_id,code,name,stage_order,created_by_id
) VALUES
  (pg_temp.u(651),pg_temp.u(1),pg_temp.u(301),'P08-J1','P08 Stage 1',1,pg_temp.u(103)),
  (pg_temp.u(652),pg_temp.u(1),pg_temp.u(302),'P08-J2','P08 Stage 2',1,pg_temp.u(103));
INSERT INTO pathways.activity_journey_stage_mappings(
  organization_id,project_id,activity_id,stage_id,is_required,sequence_order,created_by_id
) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(651),true,1,pg_temp.u(103));
DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.activity_journey_stage_mappings(
      organization_id,project_id,activity_id,stage_id,is_required,sequence_order,created_by_id
    ) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(652),true,1,pg_temp.u(103));
    RAISE EXCEPTION 'Cross-project Activity journey-stage link was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END
$$;

-- Seven individuals exercise every authoritative Beneficiaries Reached filter.
INSERT INTO pathways.beneficiaries(
  id,organization_id,code,subject_type,first_name,last_name,consent_recorded,
  data_processing_consent_recorded,is_dummy_record,created_by_id
)
SELECT pg_temp.u(700+n),pg_temp.u(1),'P08-BEN-'||n,'INDIVIDUAL','Synthetic','Person '||n,
       true,true,n=5,pg_temp.u(101)
FROM generate_series(1,7) n;
INSERT INTO pathways.beneficiary_project_enrollments(
  id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id
)
SELECT pg_temp.u(750+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(700+n),
       '2026-01-01',pg_temp.u(101)
FROM generate_series(1,7) n;

INSERT INTO pathways.digital_forms(
  id,organization_id,project_id,code,version,name,form_type,activity_id,created_by_id
) VALUES(
  pg_temp.u(801),pg_temp.u(1),pg_temp.u(301),'p08_participation',1,
  'P08 participation','ACTIVITY_MONITORING',pg_temp.u(501),pg_temp.u(101)
);
INSERT INTO pathways.form_fields(
  id,organization_id,project_id,form_id,code,label,data_type,is_required,allowed_values,sequence_no
) VALUES
  (pg_temp.u(811),pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),'beneficiary_code','Code','TEXT',true,NULL,1),
  (pg_temp.u(812),pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),'participation_date','Date','DATE',true,NULL,2),
  (pg_temp.u(813),pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),'attendance_status','Attendance','SELECT',true,
   '["PRESENT","ABSENT","COMPLETED"]',3),
  (pg_temp.u(814),pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),'progress_status','Progress','SELECT',true,
   '["IN_PROGRESS"]',4);
UPDATE pathways.digital_forms
SET status='PUBLISHED',published_by_id=pg_temp.u(105),published_at=now()
WHERE id=pg_temp.u(801);

CREATE FUNCTION pg_temp.add_participation(
  event_no integer,person_no integer,event_date date,attendance pathways.attendance_status,
  dummy_submission boolean,validate_submission boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  submission_id uuid:=pg_temp.u(900+event_no);
  participation_id uuid:=pg_temp.u(1000+event_no);
BEGIN
  INSERT INTO pathways.form_submissions(
    id,organization_id,project_id,form_id,form_version,client_submission_id,
    submitted_by_id,source,status,is_dummy_record
  ) VALUES(
    submission_id,pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),1,pg_temp.u(1100+event_no),
    pg_temp.u(101),'DIRECT_ENCODING','DRAFT',dummy_submission
  );
  INSERT INTO pathways.form_response_values(
    organization_id,project_id,form_id,submission_id,field_id,value
  ) SELECT pg_temp.u(1),pg_temp.u(301),pg_temp.u(801),submission_id,v.field_id,v.answer
    FROM (VALUES
      (pg_temp.u(811),to_jsonb('P08-BEN-'||person_no)),
      (pg_temp.u(812),to_jsonb(event_date::text)),
      (pg_temp.u(813),to_jsonb(attendance::text)),
      (pg_temp.u(814),to_jsonb('IN_PROGRESS'::text))
    ) v(field_id,answer);
  INSERT INTO pathways.beneficiary_activity_participations(
    id,organization_id,project_id,enrollment_id,activity_id,attendance_status,
    participation_date,progress_status,source_submission_id,recorded_by_id
  ) VALUES(
    participation_id,pg_temp.u(1),pg_temp.u(301),pg_temp.u(750+person_no),pg_temp.u(501),
    attendance,event_date,'IN_PROGRESS',submission_id,pg_temp.u(101)
  );
  INSERT INTO pathways.beneficiary_journey_events(
    organization_id,project_id,enrollment_id,activity_id,participation_id,
    event_type,event_date,recorded_by_id
  ) VALUES(
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(750+person_no),pg_temp.u(501),participation_id,
    'PARTICIPATION',event_date,pg_temp.u(101)
  );
  IF validate_submission THEN
    UPDATE pathways.form_submissions
    SET enrollment_id=pg_temp.u(750+person_no),status='VALIDATED',submitted_at=event_date,
        validated_by_id=pg_temp.u(105),validated_at=now()
    WHERE id=submission_id;
  END IF;
END
$$;

SELECT pg_temp.add_participation(1,1,'2026-02-01','PRESENT',false,true);
SELECT pg_temp.add_participation(2,1,'2026-03-01','COMPLETED',false,true);
SELECT pg_temp.add_participation(3,2,'2026-02-01','PRESENT',false,true);
SELECT pg_temp.add_participation(4,3,'2026-02-01','ABSENT',false,true);
SELECT pg_temp.add_participation(5,4,'2026-02-01','PRESENT',false,true);
SELECT pg_temp.add_participation(6,5,'2026-02-01','PRESENT',false,true);
SELECT pg_temp.add_participation(7,6,'2026-02-01','PRESENT',true,true);
SELECT pg_temp.add_participation(8,7,'2026-02-01','PRESENT',false,false);
UPDATE pathways.beneficiaries
SET status='ARCHIVED',archived_at=now()
WHERE id=pg_temp.u(704);

-- Program Manager receives the aggregate through portfolio scope, while the
-- identity-bearing beneficiary policy remains unavailable.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.assert_true(
  (SELECT beneficiaries_reached=2
   FROM pathways.p08_activity_beneficiaries_reached(
     pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501)]
   )),
  'Program Manager receives two distinct qualifying beneficiaries');
SELECT pg_temp.assert_true(
  (SELECT beneficiaries_reached=0
   FROM pathways.p08_activity_beneficiaries_reached(
     pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(502)]
   )),
  'Cancelled Activity aggregate is zero');
SELECT pg_temp.assert_true(
  (SELECT beneficiaries_reached=0
   FROM pathways.p08_activity_beneficiaries_reached(
     pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(505)]
   )),
  'Empty Activity aggregate is zero');
SELECT pg_temp.assert_true(
  NOT pathways.p04_has_project_permission('beneficiaries.records.read',pg_temp.u(301)),
  'Program Manager beneficiary-record permission remains absent');
SELECT pg_temp.assert_true(
  NOT pathways.p04_can_read_beneficiary(pg_temp.u(701)),
  'Program Manager cannot resolve beneficiary identity detail');
SELECT pg_temp.assert_true(
  (SELECT count(*)=1 FROM pathways.activity_indicator_links
   WHERE project_id=pg_temp.u(301) AND activity_id=pg_temp.u(501)),
  'Program Manager can read the scoped Activity Indicator link without write authority');

DO $$
BEGIN
  BEGIN
    PERFORM * FROM pathways.p08_activity_beneficiaries_reached(
      pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501),pg_temp.u(503)]
    );
    RAISE EXCEPTION 'Cross-project aggregate probe was not rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM pathways.p08_activity_beneficiaries_reached(
      pg_temp.u(2),pg_temp.u(303),ARRAY[pg_temp.u(504)]
    );
    RAISE EXCEPTION 'Cross-organization aggregate probe was not rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM pathways.p08_activity_beneficiaries_reached(
      pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(599)]
    );
    RAISE EXCEPTION 'Guessed Activity aggregate probe was not rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM pathways.p08_activity_beneficiaries_reached(
      pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501),pg_temp.u(501)]
    );
    RAISE EXCEPTION 'Duplicate Activity request was not rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$$;

-- A beneficiary-level role receives the same identity-free aggregate.
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.assert_true(
  (SELECT beneficiaries_reached=2
   FROM pathways.p08_activity_beneficiaries_reached(
     pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501)]
   )),
  'Beneficiary-level authorized role receives compatible aggregate');
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid='pathways.activity_indicator_links'::regclass),
  'new Activity Indicator link table has enabled and forced RLS');
SELECT pg_temp.assert_true(
  (SELECT prosecdef AND proowner='prisma'::regrole AND proconfig=ARRAY['search_path=""']
   FROM pg_proc WHERE oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::regprocedure),
  'aggregate is controlled-owner SECURITY DEFINER with empty search path');
SELECT pg_temp.assert_true(
  has_function_privilege('pathways_runtime',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT EXISTS (
    SELECT
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
    WHERE p.oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::regprocedure
      AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
  )
  AND NOT has_function_privilege('anon',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('service_role',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE'),
  'aggregate execution is granted only to runtime');
SELECT pg_temp.assert_true(
  NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
  'runtime remains non-superuser and NOBYPASSRLS');
SELECT pg_temp.assert_true(
  (SELECT array_agg(parameter_name::text ORDER BY ordinal_position)
   FROM information_schema.parameters
   WHERE specific_schema='pathways'
     AND specific_name LIKE 'p08_activity_beneficiaries_reached_%'
     AND parameter_mode='OUT')=ARRAY['activity_id','beneficiaries_reached'],
  'aggregate exposes only Activity ID and integer count');

ROLLBACK;
