-- cr-pathways-audit-tamper-evidence (0096): disposable checks for the append-only audit log and its hash chain.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or
-- phase4/phase6 replay database that already has 0096 applied. Success prints AUDIT_TAMPER_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Audit tamper checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM set_config('at.passed',(coalesce(nullif(current_setting('at.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- Expects the statement to fail with this SQLSTATE and, when given, a message containing this text.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; said text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; said := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR (message IS NOT NULL AND position(message IN coalesce(said,'')) = 0) THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not %',label,got,said,expected; END IF;
 PERFORM set_config('at.passed',(coalesce(nullif(current_setting('at.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(user_n-10)::text,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',pg_temp.u(org_n)::text,true),
  set_config('app.user_id',pg_temp.u(user_n)::text,true);
END $$;
CREATE FUNCTION pg_temp.verify(org_n integer, seq bigint DEFAULT NULL, hash bytea DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
 SELECT ok::text||':'||coalesce(broken_seq::text,'') FROM pathways.p96_verify_audit_chain(pg_temp.u(org_n), seq, hash)
$$;
CREATE FUNCTION pg_temp.hash_at(org_n integer, seq bigint) RETURNS bytea LANGUAGE sql AS $$
 SELECT row_hash FROM pathways.audit_logs WHERE organization_id=pg_temp.u(org_n) AND chain_seq=seq
$$;

-- Catalog: three block triggers on, the head table and the chain functions closed to every API role.
SELECT pg_temp.ok('catalog', (SELECT count(*)=3 FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.audit_logs'::regclass
  AND tgname IN ('p96_audit_chain','p96_audit_no_rewrite','p96_audit_no_truncate') AND tgenabled='O')
 AND (SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.audit_chain_heads'::regclass)
 AND NOT has_table_privilege('pathways_runtime','pathways.audit_chain_heads','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 AND NOT has_table_privilege('authenticated','pathways.audit_chain_heads','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('rules_outcome_owner','pathways.audit_chain_heads','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_function_privilege('pathways_runtime','pathways.p96_verify_audit_chain(uuid,bigint,bytea)','EXECUTE')
 AND NOT has_function_privilege('authenticated','pathways.p96_verify_audit_chain(uuid,bigint,bytea)','EXECUTE')
 AND NOT has_function_privilege('pathways_runtime','pathways.p96_reseal_audit_chain(uuid)','EXECUTE')
 AND NOT has_table_privilege('pathways_runtime','pathways.audit_logs','UPDATE,DELETE,TRUNCATE'));

-- Fixtures: organization A with users 21 (jwt 11) and 22 (jwt 12); organization B with user 31 (jwt 21).
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(21));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'AT_A','Synthetic audit organization A'),
 (pg_temp.u(2),'AT_B','Synthetic audit organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,v.org,r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(1),'SYSTEM_ADMINISTRATOR',pg_temp.u(11),'Synthetic AT admin','at-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(1),'PROJECT_OFFICER',pg_temp.u(12),'Synthetic AT officer','at-b@example.invalid'),
 (pg_temp.u(31),pg_temp.u(2),'SYSTEM_ADMINISTRATOR',pg_temp.u(21),'Synthetic AT outsider','at-c@example.invalid')) v(id,org,role_code,auth_id,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

-- The runtime inserts; chain values it supplies are replaced and the first link starts from 32 zero bytes.
SELECT pg_temp.act_as(21);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes,chain_seq,prev_hash,row_hash)
VALUES (pg_temp.u(1),pg_temp.u(21),'AT_FIRST','Probe','1','{"b":2,"a":1}',999,'\x01','\x02');
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
VALUES (pg_temp.u(1),pg_temp.u(21),'AT_SECOND','Probe','2');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as(31,2);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type) VALUES (pg_temp.u(2),pg_temp.u(31),'AT_OTHER','Probe');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('runtime inserts chain', (SELECT array_agg(chain_seq ORDER BY chain_seq)=ARRAY[1,2]::bigint[]
  FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1))
 AND (SELECT prev_hash=decode(repeat('00',32),'hex') AND octet_length(row_hash)=32 FROM pathways.audit_logs
  WHERE organization_id=pg_temp.u(1) AND chain_seq=1)
 AND (SELECT prev_hash FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1) AND chain_seq=2)=pg_temp.hash_at(1,1)
 AND (SELECT last_seq=2 AND last_hash=pg_temp.hash_at(1,2) FROM pathways.audit_chain_heads WHERE organization_id=pg_temp.u(1)));
SELECT pg_temp.ok('organizations chain apart', (SELECT chain_seq=1 AND prev_hash=decode(repeat('00',32),'hex')
  FROM pathways.audit_logs WHERE organization_id=pg_temp.u(2)) AND pg_temp.verify(2)='true:');

-- Rules owner roles insert through their column grants; a probe policy stands in for their scope checks, which are tested elsewhere.
CREATE POLICY t96_owner_probe ON pathways.audit_logs FOR INSERT
 TO rules_commit_owner, rules_outcome_owner, rules_config_owner, finance_operation_owner, report_projection_owner WITH CHECK (true);
SET LOCAL ROLE rules_commit_owner;
INSERT INTO pathways.audit_logs(organization_id,action,entity_type) VALUES (pg_temp.u(1),'AT_RULES_COMMIT','Probe');
RESET ROLE;
SET LOCAL ROLE rules_outcome_owner;
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type) VALUES (pg_temp.u(1),pg_temp.u(22),'AT_RULES_OUTCOME','Probe');
RESET ROLE;
SET LOCAL ROLE report_projection_owner;
INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type) VALUES (pg_temp.u(1),pg_temp.u(22),'AT_REPORT','Probe');
RESET ROLE;
DROP POLICY t96_owner_probe ON pathways.audit_logs;
SELECT pg_temp.ok('owner role inserts extend the chain', (SELECT max(chain_seq)=5 FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1))
 AND pg_temp.verify(1)='true:');

-- Rewrites are refused: by privilege for the runtime, by the block for the owner and for a superuser.
SELECT pg_temp.act_as(21);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.refused('runtime update', format('UPDATE pathways.audit_logs SET action=%L WHERE organization_id=%L','X',pg_temp.u(1)),'42501');
SELECT pg_temp.refused('runtime delete', format('DELETE FROM pathways.audit_logs WHERE organization_id=%L',pg_temp.u(1)),'42501');
RESET SESSION AUTHORIZATION;
SET LOCAL ROLE prisma;
SELECT pg_temp.refused('owner update', format('UPDATE pathways.audit_logs SET action=%L WHERE organization_id=%L','X',pg_temp.u(1)),'42501','audit_logs is append-only');
SELECT pg_temp.refused('owner delete', format('DELETE FROM pathways.audit_logs WHERE organization_id=%L',pg_temp.u(1)),'42501','audit_logs is append-only');
SELECT pg_temp.refused('owner truncate', 'TRUNCATE pathways.audit_logs','42501','audit_logs is append-only');
RESET ROLE;
SELECT pg_temp.refused('superuser truncate', 'TRUNCATE pathways.audit_logs','42501','audit_logs is append-only');
SELECT pg_temp.ok('nothing changed', pg_temp.verify(1)='true:' AND (SELECT count(*)=5 FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1)));

-- Tamper proof: with the block switched off, an edited row is found by its sequence.
CREATE TEMP TABLE anchor AS SELECT pg_temp.hash_at(1,2) AS hash;
ALTER TABLE pathways.audit_logs DISABLE TRIGGER p96_audit_no_rewrite;
UPDATE pathways.audit_logs SET action='AT_FORGED' WHERE organization_id=pg_temp.u(1) AND chain_seq=2;
SELECT pg_temp.ok('edited row found', pg_temp.verify(1)='false:2');
-- An owner who also recomputes the chain passes the plain check but not the hash kept from an older dump.
SELECT pathways.p96_reseal_audit_chain(pg_temp.u(1));
SELECT pg_temp.ok('resealed chain passes alone', pg_temp.verify(1)='true:');
SELECT pg_temp.ok('resealed chain fails the anchor', pg_temp.verify(1,2,(SELECT hash FROM anchor))='false:2');
-- A deleted row leaves a gap; a deleted tail leaves the head ahead of the rows.
DELETE FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1) AND chain_seq=3;
SELECT pg_temp.ok('deleted row found', pg_temp.verify(1)='false:4');
SELECT pathways.p96_reseal_audit_chain(pg_temp.u(1));
DELETE FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1) AND chain_seq=4;
SELECT pg_temp.ok('deleted tail found', pg_temp.verify(1)='false:4');
ALTER TABLE pathways.audit_logs ENABLE TRIGGER p96_audit_no_rewrite;
-- A row inserted with triggers off has no chain position.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.audit_logs(organization_id,action,entity_type) VALUES (pg_temp.u(2),'AT_UNCHAINED','Probe');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.ok('unchained row found', pg_temp.verify(2)='false:0');

SELECT 'AUDIT_TAMPER_RUNTIME=PASS ('||current_setting('at.passed')||')' AS result \gset
ROLLBACK;
\echo :result
