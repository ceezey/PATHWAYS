-- cr-pathways-import-processing-speed (migration 0081): runtime checks for the deferred completeness trigger
-- pathways.p2_assert_submission(). Synthetic fixtures only; everything rolls back. Run as a local superuser against a
-- disposable pathways_phase2_* or pathways_phase4_* replay database with 0081.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0081 submission-check-once checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;
-- Function call counts are the measure of how many checks ran.
SET LOCAL track_functions = 'all';

CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '0081 assertion failed: %',label; END IF;
END $$;
-- The command must fail with the expected SQLSTATE and, when given, the expected message.
CREATE FUNCTION pg_temp.reject(command text,expected text,label text,message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected OR SQLERRM IS DISTINCT FROM coalesce(message,SQLERRM) THEN
   RAISE EXCEPTION '0081 % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION '0081 % expected rejection %',label,expected;
END $$;
-- The command must run without error.
CREATE FUNCTION pg_temp.accept(command text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE command;
EXCEPTION WHEN OTHERS THEN
 RAISE EXCEPTION '0081 % was refused with %: %',label,SQLSTATE,SQLERRM;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a8100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Calls of p2_valid_response so far in this transaction.
CREATE FUNCTION pg_temp.calls() RETURNS bigint LANGUAGE sql AS $$
  SELECT coalesce((SELECT calls FROM pg_stat_xact_user_functions
    WHERE funcid='pathways.p2_valid_response(pathways.form_fields,jsonb)'::regprocedure),0)
$$;
-- Org A writes as the API does: a DRAFT direct-entry submission, its values, then the promotion to VALIDATED.
CREATE FUNCTION pg_temp.draft(n integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status)
  VALUES (pg_temp.u(n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),1,pg_temp.u(n+5000),pg_temp.u(101),'DIRECT_ENCODING','DRAFT')
$$;
CREATE FUNCTION pg_temp.val(n integer,field integer,value jsonb) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value)
  VALUES (pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(n),pg_temp.u(field),value)
$$;
CREATE FUNCTION pg_temp.complete(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.val(n,411,'"Ana"'),pg_temp.val(n,412,'30'),pg_temp.val(n,413,'"Synthetic note"')
$$;
CREATE FUNCTION pg_temp.validate(n integer) RETURNS void LANGUAGE sql AS $$
  UPDATE pathways.form_submissions SET status='VALIDATED',submitted_at=now(),validated_by_id=pg_temp.u(101),validated_at=now()
  WHERE id=pg_temp.u(n)
$$;
-- EXPLAIN of the 0081 body's value check, statement text identical to the body's, for submission n.
CREATE FUNCTION pg_temp.check_plan(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE parent pathways.form_submissions%ROWTYPE; plan jsonb;
BEGIN
  SELECT * INTO parent FROM pathways.form_submissions s WHERE s.id=pg_temp.u(n);
  EXPLAIN (ANALYZE, FORMAT JSON)
    WITH f AS MATERIALIZED (
      SELECT * FROM pathways.form_fields f
      WHERE f.organization_id=parent.organization_id AND f.project_id=parent.project_id AND f.form_id=parent.form_id
    ), v AS MATERIALIZED (
      SELECT * FROM pathways.form_response_values v
      WHERE v.submission_id=parent.id AND v.organization_id=parent.organization_id
        AND v.project_id=parent.project_id AND v.form_id=parent.form_id
    )
    SELECT FROM f LEFT JOIN v ON v.field_id=f.id
    WHERE (f.is_required AND v.id IS NULL) OR (v.id IS NOT NULL AND NOT pathways.p2_valid_response(f,v.value))
  INTO plan;
  RETURN plan;
END $$;

-- Fixtures are written in a released savepoint so their rows carry another xid than the top level, as rows committed earlier do.
SAVEPOINT fixtures;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES (pg_temp.u(201)),(pg_temp.u(202));
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'SCO_ORG_A','Synthetic SCO org A'),(pg_temp.u(2),'SCO_ORG_B','Synthetic SCO org B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+n),pg_temp.u(n),r.id,pg_temp.u(200+n),'SCO M&E Officer '||n,'sco-me-'||n||'@example.invalid','ACTIVE',now()
FROM pathways.roles r CROSS JOIN generate_series(1,2) n WHERE r.code='MONITORING_AND_EVALUATION_OFFICER';
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(n),'SCO-P'||n,'SCO project '||n,'2026-01-01','2026-12-31',pg_temp.u(100+n)
FROM generate_series(1,2) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(n),pg_temp.u(300+n),pg_temp.u(100+n),pg_temp.u(100+n) FROM generate_series(1,2) n;
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id,published_by_id,published_at)
SELECT pg_temp.u(400+n),pg_temp.u(n),pg_temp.u(300+n),'sco_registration',1,'SCO registration '||n,'OTHER','PUBLISHED',
  pg_temp.u(100+n),pg_temp.u(100+n),now()
FROM generate_series(1,2) n;
-- Each org's form has name (TEXT, required), age (INTEGER, required) and note (TEXT, optional).
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,minimum_value,maximum_value,minimum_length,maximum_length,sequence_no)
SELECT pg_temp.u(400+10*n+f.seq),pg_temp.u(n),pg_temp.u(300+n),pg_temp.u(400+n),f.code,f.label,f.data_type::pathways.field_data_type,f.required,
  f.minimum_value,f.maximum_value,f.minimum_length,f.maximum_length,f.seq
FROM generate_series(1,2) n CROSS JOIN (VALUES
  (1,'name','Name','TEXT',true,NULL::numeric,NULL::numeric,1,200),
  (2,'age','Age','INTEGER',true,0,120,NULL,NULL),
  (3,'note','Note','TEXT',false,NULL,NULL,0,2000)) f(seq,code,label,data_type,required,minimum_value,maximum_value,minimum_length,maximum_length);
-- Org A's u501 is VALIDATED with name and age, org A's u502 is a DRAFT with all three values, and org B's u509 is VALIDATED.
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status,submitted_at,validated_by_id,validated_at)
VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),1,pg_temp.u(5501),pg_temp.u(101),'DIRECT_ENCODING','VALIDATED',now(),pg_temp.u(101),now()),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),1,pg_temp.u(5502),pg_temp.u(101),'DIRECT_ENCODING','DRAFT',NULL,NULL,NULL),
  (pg_temp.u(509),pg_temp.u(2),pg_temp.u(302),pg_temp.u(402),1,pg_temp.u(5509),pg_temp.u(102),'DIRECT_ENCODING','VALIDATED',now(),pg_temp.u(102),now());
INSERT INTO pathways.form_response_values(id,organization_id,project_id,form_id,submission_id,field_id,value)
VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(501),pg_temp.u(411),'"Ben"'),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(501),pg_temp.u(412),'41'),
  (pg_temp.u(603),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(502),pg_temp.u(411),'"Cy"'),
  (pg_temp.u(604),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(502),pg_temp.u(412),'52'),
  (pg_temp.u(605),pg_temp.u(1),pg_temp.u(301),pg_temp.u(401),pg_temp.u(502),pg_temp.u(413),'"Synthetic note"'),
  (pg_temp.u(606),pg_temp.u(2),pg_temp.u(302),pg_temp.u(402),pg_temp.u(509),pg_temp.u(421),'"Dee"'),
  (pg_temp.u(607),pg_temp.u(2),pg_temp.u(302),pg_temp.u(402),pg_temp.u(509),pg_temp.u(422),'63'),
  (pg_temp.u(608),pg_temp.u(2),pg_temp.u(302),pg_temp.u(402),pg_temp.u(509),pg_temp.u(423),'"Synthetic B note"');
SET LOCAL session_replication_role = origin;
RELEASE fixtures;

SELECT pg_temp.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='prisma'),
  '1 prisma has neither SUPERUSER nor BYPASSRLS, as on hosted');

-- Each case acts as the org A officer through the runtime role with the API's session settings and ends with RELEASE, because ROLLBACK TO keeps its savepoint open.
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('request.jwt.claims','',true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);

-- complete: a complete VALIDATED submission passes.
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(701); SELECT pg_temp.complete(701); SELECT pg_temp.validate(701);
SELECT pg_temp.accept('SET CONSTRAINTS ALL IMMEDIATE','2 a complete VALIDATED submission');
ROLLBACK TO c; RELEASE c;
-- SET CONSTRAINTS run inside accept survives the rollback, and every deferrable constraint is initially deferred, so this restores the default.
SET CONSTRAINTS ALL DEFERRED;

-- missing required
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(702); SELECT pg_temp.val(702,411,'"Ana"'),pg_temp.val(702,413,'"Synthetic note"'); SELECT pg_temp.validate(702);
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','3 a VALIDATED submission missing a required value');
ROLLBACK TO c; RELEASE c;

-- null required: p2_guard_response lets a stored JSON null through, the completeness check does not.
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(703); SELECT pg_temp.val(703,411,'"Ana"'),pg_temp.val(703,412,'null'); SELECT pg_temp.validate(703);
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','4 a VALIDATED submission with a JSON null required value');
ROLLBACK TO c; RELEASE c;

-- two submissions
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(704); SELECT pg_temp.complete(704); SELECT pg_temp.validate(704);
SELECT pg_temp.draft(705); SELECT pg_temp.val(705,412,'30'); SELECT pg_temp.validate(705);
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','5 a complete and an incomplete submission together');
ROLLBACK TO c; RELEASE c;
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(704); SELECT pg_temp.complete(704); SELECT pg_temp.validate(704);
SELECT pg_temp.accept('SET CONSTRAINTS ALL IMMEDIATE','6 the complete submission alone');
ROLLBACK TO c; RELEASE c;
SET CONSTRAINTS ALL DEFERRED;

-- guard
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject(format('SELECT pg_temp.val(501,413,%L)','"Late note"'),'P0001',
  '7 a value insert on a VALIDATED submission','Only draft submission values are editable');
ROLLBACK TO c; RELEASE c;

-- immediate then promote
SAVEPOINT c;
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(706); SELECT pg_temp.val(706,411,'"Ana"');
SELECT pg_temp.reject('SELECT pg_temp.validate(706)','23514','8 an immediate promotion missing a required value');
ROLLBACK TO c; RELEASE c;

-- released savepoint
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(707); SELECT pg_temp.val(707,411,'"Ana"');
SAVEPOINT n;
SELECT pg_temp.validate(707);
RELEASE n;
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','9 a promotion in a released savepoint missing a required value');
ROLLBACK TO c; RELEASE c;

-- savepoint rollback
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(708); SELECT pg_temp.val(708,411,'"Ana"');
SAVEPOINT n;
SELECT pg_temp.validate(708);
ROLLBACK TO n; RELEASE n;
SELECT pg_temp.validate(708);
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','10 a promotion after a rolled-back promotion, missing a required value');
ROLLBACK TO c; RELEASE c;

-- deferred value path (owner-only): the guard is disabled inside the savepoint, and rolling it back re-enables it.
SAVEPOINT c;
ALTER TABLE pathways.form_response_values DISABLE TRIGGER p2_response;
DELETE FROM pathways.form_response_values WHERE submission_id=pg_temp.u(501) AND field_id=pg_temp.u(412);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','11 a required value deleted from an untouched VALIDATED submission');
ROLLBACK TO c; RELEASE c;
SAVEPOINT c;
ALTER TABLE pathways.form_response_values DISABLE TRIGGER p2_response;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(709); SELECT pg_temp.complete(709); SELECT pg_temp.validate(709);
RESET ROLE;
DELETE FROM pathways.form_response_values WHERE submission_id=pg_temp.u(709) AND field_id=pg_temp.u(412);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','12 a required value deleted after the promotion in the same savepoint');
ROLLBACK TO c; RELEASE c;
SELECT pg_temp.ok((SELECT tgenabled='O' FROM pg_trigger WHERE tgname='p2_response' AND tgrelid='pathways.form_response_values'::regclass),
  '13 rolling the savepoint back re-enabled p2_response');

-- residual (owner-only, the accepted residual of CR section 5): in IMMEDIATE mode a value changed after its top-level parent
-- was checked is not checked again, and p2_guard_response is what refuses that change for every role that cannot disable triggers.
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(710); SELECT pg_temp.complete(710); SELECT pg_temp.validate(710);
RESET ROLE;
SELECT pg_temp.ok((SELECT xmin=xid(pg_current_xact_id()) FROM pathways.form_submissions WHERE id=pg_temp.u(710)),
  '14 the residual parent carries the top-level xid');
SAVEPOINT c;
ALTER TABLE pathways.form_response_values DISABLE TRIGGER p2_response;
SELECT pg_temp.accept(format('DELETE FROM pathways.form_response_values WHERE submission_id=%L AND field_id=%L',pg_temp.u(710),pg_temp.u(412)),
  '15 the accepted residual: a value deleted after an immediate check of the same top-level parent');
ROLLBACK TO c; RELEASE c;
-- Every deferrable constraint in the schema is initially deferred, so this restores the default.
SET CONSTRAINTS ALL DEFERRED;

-- uses submission index
SAVEPOINT c;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.ok((SELECT bool_or(n->>'Index Name'='form_response_values_submission_field_key')
  AND NOT bool_or(coalesce((n->>'Rows Removed by Filter')::numeric,0)>0)
  FROM jsonb_path_query(pg_temp.check_plan(501),'strict $.**?(@."Relation Name"=="form_response_values")') n),
  '16 the value read uses form_response_values_submission_field_key and filters out no rows');
ROLLBACK TO c; RELEASE c;

-- org B
SAVEPOINT c;
SELECT pg_temp.ok((SELECT count(*)=3 FROM pathways.form_response_values WHERE organization_id=pg_temp.u(2)),
  '17 org B values are present');
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.validate(502);
SELECT pg_temp.calls() AS calls_before \gset
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.ok(pg_temp.calls()-:calls_before=3,'18 the check of org A submission u502 tests its own 3 values only');
ROLLBACK TO c; RELEASE c;

-- top-level deferred (owner-only): a value deleted from a parent promoted at the top level is caught by the parent's own deferred event.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(712); SELECT pg_temp.complete(712); SELECT pg_temp.validate(712);
RESET ROLE;
SAVEPOINT c;
-- The queued value events forbid ALTER TABLE here, so replica mode skips the guard and queues no value event, leaving only the parent's event to catch the delete.
SET LOCAL session_replication_role = replica;
DELETE FROM pathways.form_response_values WHERE submission_id=pg_temp.u(712) AND field_id=pg_temp.u(412);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject('SET CONSTRAINTS ALL IMMEDIATE','23514','19 top-level deferred: a required value deleted after a top-level promotion');
ROLLBACK TO c; RELEASE c;
-- The case's events stay queued at the top level, so they are fired here to keep the checks-once baseline clean.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.accept('SET CONSTRAINTS ALL IMMEDIATE','20 top-level deferred: the restored submission passes');
RESET ROLE;
SET CONSTRAINTS ALL DEFERRED;

-- checks once (last, at the top level so the writes carry the top-level xid as in production)
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.draft(711); SELECT pg_temp.complete(711); SELECT pg_temp.validate(711);
SELECT pg_temp.ok((SELECT xmin=xid(pg_current_xact_id()) FROM pathways.form_submissions WHERE id=pg_temp.u(711)),
  '21 the checks-once submission carries the top-level xid');
SELECT pg_temp.calls() AS calls_before \gset
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.calls()-:calls_before AS checks_once_calls \gset
SELECT pg_temp.ok(:checks_once_calls=3,format('22 one complete 3-field submission is checked once (%s value tests)',:checks_once_calls));
RESET ROLE;

ROLLBACK;
SELECT 'SUBMISSION_CHECK_ONCE_RUNTIME=PASS';
