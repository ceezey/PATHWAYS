-- cr-pathways-beneficiary-step-up-pin (0037): disposable behavioral checks for the PIN
-- functions. Synthetic fixtures only; everything rolls back. Run as a local superuser against a
-- disposable pathways_phase2_* or phase6 replay database that already has 0037 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'Step-up PIN checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE pin_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON pin_results TO pathways_runtime;

INSERT INTO auth.users(id) VALUES
 ('77000000-0000-4000-8000-000000000011'),('77000000-0000-4000-8000-000000000012'),
 ('77000000-0000-4000-8000-000000000013'),('77000000-0000-4000-8000-000000000014'),
 ('77000000-0000-4000-8000-000000000015');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('77000000-0000-4000-8000-000000000001','PIN_ORG_A','Synthetic PIN organization A'),
 ('77000000-0000-4000-8000-000000000002','PIN_ORG_B','Synthetic PIN organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at,suspended_at)
SELECT v.id::uuid,v.org::uuid,r.id,v.sub::uuid,v.name,v.email,v.status::pathways.account_status,now(),
 CASE WHEN v.status='SUSPENDED' THEN now() END
FROM (VALUES
 ('77000000-0000-4000-8000-000000000031','77000000-0000-4000-8000-000000000001','PROJECT_OFFICER','77000000-0000-4000-8000-000000000011','Synthetic officer','pin-po@example.invalid','ACTIVE'),
 ('77000000-0000-4000-8000-000000000032','77000000-0000-4000-8000-000000000001','PROJECT_MANAGER','77000000-0000-4000-8000-000000000012','Synthetic manager','pin-pm@example.invalid','ACTIVE'),
 ('77000000-0000-4000-8000-000000000033','77000000-0000-4000-8000-000000000002','PROJECT_OFFICER','77000000-0000-4000-8000-000000000013','Synthetic foreign officer','pin-foreign@example.invalid','ACTIVE'),
 ('77000000-0000-4000-8000-000000000034','77000000-0000-4000-8000-000000000001','PROJECT_OFFICER','77000000-0000-4000-8000-000000000014','Synthetic suspended','pin-suspended@example.invalid','SUSPENDED'),
 ('77000000-0000-4000-8000-000000000035','77000000-0000-4000-8000-000000000001','PROGRAM_MANAGER','77000000-0000-4000-8000-000000000015','Synthetic program manager','pin-pgm@example.invalid','ACTIVE')
) v(id,org,role_code,sub,name,email,status)
JOIN pathways.roles r ON r.code=v.role_code;

-- Catalog: RLS on, no policies, no runtime table access, helpers not executable by runtime.
DO $$ BEGIN
 IF NOT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('pathways.user_step_up_pins'::regclass,'pathways.beneficiary_step_up_grants'::regclass))
 OR EXISTS(SELECT FROM pg_policy WHERE polrelid IN
  ('pathways.user_step_up_pins'::regclass,'pathways.beneficiary_step_up_grants'::regclass))
 OR has_table_privilege('pathways_runtime','pathways.user_step_up_pins','SELECT')
 OR has_table_privilege('pathways_runtime','pathways.beneficiary_step_up_grants','INSERT')
 OR has_table_privilege('anon','pathways.user_step_up_pins','SELECT')
 OR has_table_privilege('authenticated','pathways.beneficiary_step_up_grants','SELECT')
 OR has_function_privilege('pathways_runtime','pathways.step_up_pin_acceptable(text)','EXECUTE')
 OR has_function_privilege('pathways_runtime','pathways.step_up_pin_actor()','EXECUTE')
 OR has_function_privilege('pathways_runtime','pathways.step_up_pin_audit(uuid,uuid,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','pathways.step_up_pin_verify(text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.step_up_pin_set(text,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('pathways_runtime','pathways.step_up_pin_verify(text,uuid)','EXECUTE')
 OR EXISTS(SELECT FROM pg_proc p WHERE p.pronamespace='pathways'::regnamespace AND p.proname LIKE 'step\_up\_pin\_%'
  AND (pg_get_userbyid(p.proowner)<>'prisma' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']))
 THEN RAISE EXCEPTION 'catalog security'; END IF;
 -- Format rules.
 IF pathways.step_up_pin_acceptable('111111') OR pathways.step_up_pin_acceptable('123456')
 OR pathways.step_up_pin_acceptable('987654') OR pathways.step_up_pin_acceptable('12345')
 OR pathways.step_up_pin_acceptable('1234567890123') OR pathways.step_up_pin_acceptable('48291a')
 OR pathways.step_up_pin_acceptable(E'٤٨٢٩١٥') OR pathways.step_up_pin_acceptable(NULL)
 OR NOT pathways.step_up_pin_acceptable('482915') OR NOT pathways.step_up_pin_acceptable('112233445566')
 THEN RAISE EXCEPTION 'format rules'; END IF;
 -- Direct writes that break the window or bound fail.
 BEGIN
  INSERT INTO pathways.beneficiary_step_up_grants VALUES('77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000031',gen_random_uuid(),'PIN',now(),now()+interval '16 minutes');
  RAISE EXCEPTION 'window check missing';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO pathways.beneficiary_step_up_grants VALUES('77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000031',gen_random_uuid(),'TOTP',now(),now()+interval '15 minutes');
  RAISE EXCEPTION 'method check missing';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO pin_results VALUES('catalog');
END $$;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','77000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','77000000-0000-4000-8000-000000000031',true);

DO $$
DECLARE s1 uuid:='77000000-0000-4000-8000-0000000000a1'; s2 uuid:='77000000-0000-4000-8000-0000000000a2';
 r record; outcome text;
BEGIN
 -- Direct table access is denied to the runtime role.
 BEGIN PERFORM 1 FROM pathways.user_step_up_pins; RAISE EXCEPTION 'runtime read pins';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO pathways.beneficiary_step_up_grants VALUES('77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000031',s1,'PIN',now(),now()+interval '15 minutes'); RAISE EXCEPTION 'runtime forged grant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM pathways.step_up_pin_acceptable('482915'); RAISE EXCEPTION 'runtime helper';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 SELECT * INTO r FROM pathways.step_up_pin_status(s1);
 IF r.pin_state<>'NONE' OR r.grant_expires_at IS NOT NULL THEN RAISE EXCEPTION 'initial status'; END IF;
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('482915',s1) v)<>'NOT_SET' THEN RAISE EXCEPTION 'verify without PIN'; END IF;

 -- Setup only inside an asserted fresh TOTP window.
 IF pathways.step_up_pin_set('482915',NULL)<>'TOTP_REQUIRED'
 OR pathways.step_up_pin_set('482915',clock_timestamp()-interval '16 minutes')<>'TOTP_REQUIRED'
 OR pathways.step_up_pin_set('482915',clock_timestamp()+interval '5 minutes')<>'TOTP_REQUIRED'
 THEN RAISE EXCEPTION 'setup without fresh TOTP'; END IF;
 BEGIN PERFORM pathways.step_up_pin_set('123456',clock_timestamp()); RAISE EXCEPTION 'weak PIN accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM ~ '123456' THEN RAISE EXCEPTION 'PIN echoed in error'; END IF; END;
 IF pathways.step_up_pin_set('482915',clock_timestamp()-interval '1 minute')<>'SET' THEN RAISE EXCEPTION 'setup'; END IF;
 IF pathways.step_up_pin_set('736150',clock_timestamp())<>'EXISTS' THEN RAISE EXCEPTION 'second setup'; END IF;
 IF (SELECT pin_state FROM pathways.step_up_pin_status(s1))<>'SET' THEN RAISE EXCEPTION 'status SET'; END IF;

 -- Wrong then right: counter resets and a session-bound 15-minute grant is issued.
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('736150',s1) v)<>'INCORRECT' THEN RAISE EXCEPTION 'wrong PIN'; END IF;
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('12ab56',s1) v)<>'INCORRECT' THEN RAISE EXCEPTION 'malformed PIN'; END IF;
 SELECT * INTO r FROM pathways.step_up_pin_verify('482915',s1);
 IF r.outcome<>'ACCEPTED' OR r.expires_at NOT BETWEEN statement_timestamp()+interval '14 minutes 59 seconds'
  AND statement_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'accept'; END IF;
 IF (SELECT grant_expires_at FROM pathways.step_up_pin_status(s1)) IS DISTINCT FROM r.expires_at
 THEN RAISE EXCEPTION 'grant for session'; END IF;
 -- Another session of the same user has no grant.
 IF (SELECT grant_expires_at FROM pathways.step_up_pin_status(s2)) IS NOT NULL THEN RAISE EXCEPTION 'cross-session grant'; END IF;
 INSERT INTO pin_results VALUES('setup-verify-grant');
END $$;

-- Another user in the same organization, and a foreign-organization user, see no grant for s1.
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000012',true),
 set_config('app.user_id','77000000-0000-4000-8000-000000000032',true);
DO $$ BEGIN
 IF (SELECT row(pin_state,grant_expires_at)::text FROM pathways.step_up_pin_status('77000000-0000-4000-8000-0000000000a1'))
  <>'(NONE,)' THEN RAISE EXCEPTION 'cross-user grant'; END IF;
 INSERT INTO pin_results VALUES('cross-user');
END $$;
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','77000000-0000-4000-8000-000000000002',true),
 set_config('app.user_id','77000000-0000-4000-8000-000000000033',true);
DO $$ BEGIN
 IF (SELECT row(pin_state,grant_expires_at)::text FROM pathways.step_up_pin_status('77000000-0000-4000-8000-0000000000a1'))
  <>'(NONE,)' THEN RAISE EXCEPTION 'cross-organization grant'; END IF;
 INSERT INTO pin_results VALUES('cross-organization');
END $$;
-- Forged context (user id of org A with org B selector), mismatched subject and suspended user fail closed.
SELECT set_config('app.user_id','77000000-0000-4000-8000-000000000031',true);
DO $$ BEGIN
 BEGIN PERFORM pathways.step_up_pin_status('77000000-0000-4000-8000-0000000000a1'); RAISE EXCEPTION 'forged org';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('app.organization_id','77000000-0000-4000-8000-000000000001',true);
 BEGIN PERFORM pathways.step_up_pin_verify('482915','77000000-0000-4000-8000-0000000000a1'); RAISE EXCEPTION 'forged subject';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000014',true);
 PERFORM set_config('app.user_id','77000000-0000-4000-8000-000000000034',true);
 BEGIN PERFORM pathways.step_up_pin_set('482915',clock_timestamp()); RAISE EXCEPTION 'suspended user';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO pin_results VALUES('forged-context');
END $$;

-- Expired grant is rejected.
RESET ROLE;
UPDATE pathways.beneficiary_step_up_grants SET verified_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute'
WHERE user_id='77000000-0000-4000-8000-000000000031';
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','77000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','77000000-0000-4000-8000-000000000031',true);
DO $$ BEGIN
 IF (SELECT grant_expires_at FROM pathways.step_up_pin_status('77000000-0000-4000-8000-0000000000a1')) IS NOT NULL
 THEN RAISE EXCEPTION 'expired grant accepted'; END IF;
 INSERT INTO pin_results VALUES('expired-grant');
END $$;

-- Lockout at 5, locked PIN never compared, only a TOTP newer than the lock unlocks.
DO $$
DECLARE s1 uuid:='77000000-0000-4000-8000-0000000000a1'; outcomes text[]:='{}'; o text; i integer;
BEGIN
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('482915',s1) v)<>'ACCEPTED' THEN RAISE EXCEPTION 'relock setup'; END IF;
 FOR i IN 1..6 LOOP
  SELECT v.outcome INTO o FROM pathways.step_up_pin_verify('736150',s1) v; outcomes:=outcomes||o;
 END LOOP;
 IF outcomes<>ARRAY['INCORRECT','INCORRECT','INCORRECT','INCORRECT','LOCKED','LOCKED'] THEN
  RAISE EXCEPTION 'lockout sequence %',outcomes; END IF;
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('482915',s1) v)<>'LOCKED' THEN RAISE EXCEPTION 'locked PIN compared'; END IF;
 IF (SELECT row(pin_state,grant_expires_at)::text FROM pathways.step_up_pin_status(s1))<>'(LOCKED,)' THEN
  RAISE EXCEPTION 'lock ends grants'; END IF;
 IF pathways.step_up_pin_unlock(NULL)<>'TOTP_REQUIRED'
 OR pathways.step_up_pin_unlock(statement_timestamp()-interval '1 minute')<>'TOTP_REQUIRED'
 OR pathways.step_up_pin_change('529317','482915',NULL)<>'LOCKED'
 OR pathways.step_up_pin_change('529317',NULL,statement_timestamp()-interval '1 minute')<>'TOTP_REQUIRED'
 THEN RAISE EXCEPTION 'unlock without newer TOTP'; END IF;
 IF pathways.step_up_pin_unlock(clock_timestamp())<>'UNLOCKED' THEN RAISE EXCEPTION 'TOTP unlock'; END IF;
 IF pathways.step_up_pin_unlock(clock_timestamp())<>'SET' THEN RAISE EXCEPTION 'unlock idempotent'; END IF;
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('482915',s1) v)<>'ACCEPTED' THEN RAISE EXCEPTION 'after unlock'; END IF;
 INSERT INTO pin_results VALUES('lockout-unlock');
END $$;

-- Change needs the current PIN (counted) or a fresh TOTP; it ends existing grants.
DO $$
DECLARE s1 uuid:='77000000-0000-4000-8000-0000000000a1';
BEGIN
 IF pathways.step_up_pin_change('529317','736150',NULL)<>'INCORRECT' THEN RAISE EXCEPTION 'change wrong PIN'; END IF;
 IF pathways.step_up_pin_change('529317',NULL,NULL)<>'TOTP_REQUIRED' THEN RAISE EXCEPTION 'change without proof'; END IF;
 BEGIN PERFORM pathways.step_up_pin_change('000000','482915',NULL); RAISE EXCEPTION 'weak change';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF pathways.step_up_pin_change('529317','482915',NULL)<>'CHANGED' THEN RAISE EXCEPTION 'change with PIN'; END IF;
 IF (SELECT grant_expires_at FROM pathways.step_up_pin_status(s1)) IS NOT NULL THEN RAISE EXCEPTION 'change keeps grant'; END IF;
 IF (SELECT v.outcome FROM pathways.step_up_pin_verify('482915',s1) v)<>'INCORRECT'
 OR (SELECT v.outcome FROM pathways.step_up_pin_verify('529317',s1) v)<>'ACCEPTED' THEN RAISE EXCEPTION 'new PIN'; END IF;
 IF pathways.step_up_pin_change('640281',NULL,clock_timestamp())<>'CHANGED'
 OR (SELECT v.outcome FROM pathways.step_up_pin_verify('640281',s1) v)<>'ACCEPTED' THEN RAISE EXCEPTION 'change with TOTP'; END IF;
 INSERT INTO pin_results VALUES('change');
END $$;

-- Locked PIN changed with a newer TOTP clears the lock.
DO $$
DECLARE s1 uuid:='77000000-0000-4000-8000-0000000000a1'; i integer;
BEGIN
 FOR i IN 1..5 LOOP PERFORM pathways.step_up_pin_verify('736150',s1); END LOOP;
 IF (SELECT pin_state FROM pathways.step_up_pin_status(s1))<>'LOCKED' THEN RAISE EXCEPTION 'relock'; END IF;
 IF pathways.step_up_pin_change('815204',NULL,clock_timestamp())<>'CHANGED' THEN RAISE EXCEPTION 'TOTP change'; END IF;
 -- Separate statement: a STABLE status call shares its enclosing statement's snapshot.
 IF (SELECT pin_state FROM pathways.step_up_pin_status(s1))<>'SET' THEN RAISE EXCEPTION 'TOTP change unlock'; END IF;
 INSERT INTO pin_results VALUES('locked-change');
END $$;

-- Aggregate-only roles may hold a PIN, but a grant confers no permission.
SELECT set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000015',true),
 set_config('app.user_id','77000000-0000-4000-8000-000000000035',true);
DO $$ BEGIN
 IF pathways.step_up_pin_set('482915',clock_timestamp())<>'SET'
 OR (SELECT v.outcome FROM pathways.step_up_pin_verify('482915','77000000-0000-4000-8000-0000000000b1') v)<>'ACCEPTED'
 OR pathways.p09_can('beneficiaries.records.read')
 OR pathways.p05_has_project_permission('beneficiaries.records.read','77000000-0000-4000-8000-000000000099')
 THEN RAISE EXCEPTION 'aggregate-only role'; END IF;
 INSERT INTO pin_results VALUES('aggregate-only');
END $$;

RESET ROLE;
-- Audit: expected events, method recorded, never the PIN, a hash or an attempt input.
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.audit_logs WHERE organization_id='77000000-0000-4000-8000-000000000001'
  AND entity_type='BeneficiaryStepUp' AND (changes::text ~ '(482915|736150|529317|640281|815204|12ab56|123456|000000)'
  OR changes::text LIKE '%$2a$%' OR changes ?| ARRAY['pin','pinHash','candidate','failedAttempts']))<>0
 THEN RAISE EXCEPTION 'secret in audit'; END IF;
 IF NOT EXISTS(SELECT FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_SET' AND actor_user_id='77000000-0000-4000-8000-000000000031' AND changes->>'method'='TOTP')
 OR (SELECT count(*) FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_LOCKED' AND actor_user_id='77000000-0000-4000-8000-000000000031')<>2
 OR (SELECT count(*) FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_UNLOCKED' AND actor_user_id='77000000-0000-4000-8000-000000000031')<>2
 OR NOT EXISTS(SELECT FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_CHANGED' AND actor_user_id='77000000-0000-4000-8000-000000000031' AND changes->>'method'='PIN')
 OR NOT EXISTS(SELECT FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_CHANGED' AND actor_user_id='77000000-0000-4000-8000-000000000031' AND changes->>'method'='TOTP')
 OR NOT EXISTS(SELECT FROM pathways.audit_logs WHERE action='BENEFICIARY_STEP_UP_PIN_FAILED' AND actor_user_id='77000000-0000-4000-8000-000000000031' AND changes->>'outcome'='LOCKED')
 THEN RAISE EXCEPTION 'audit events'; END IF;
 IF EXISTS(SELECT FROM pathways.user_step_up_pins WHERE pin_hash !~ '^\$2a\$10\$') THEN RAISE EXCEPTION 'bcrypt cost'; END IF;
 INSERT INTO pin_results VALUES('audit-secrecy');
END $$;

SELECT 'STEP_UP_PIN_ASSERTIONS_PASSED=' || count(*) AS result FROM pin_results;
DO $$ BEGIN IF (SELECT count(*) FROM pin_results)<>11 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
ROLLBACK;
