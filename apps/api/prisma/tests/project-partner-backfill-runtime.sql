-- Disposable PostgreSQL checks for 0039_project_partner_backfill. Synthetic rows only.
-- Run as prisma (the migration's own owner and required current_user) inside a
-- disposable database named pathways_phase2_* (never a shared or hosted database),
-- replayed through migration 0037 first. Fixtures are committed, the migration is
-- sourced twice to prove idempotency, and the disposable database is dropped
-- afterwards; nothing here is rolled back because the whole database is thrown away,
-- matching the 0036 suite's part-1 convention.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF (current_database() NOT LIKE 'pathways\_phase2\_%' AND current_database() NOT LIKE 'pathways\_phase4\_%')
     OR current_user <> 'prisma' THEN
    RAISE EXCEPTION '0039 checks require a disposable pathways_phase2_* or pathways_phase4_* database, run as prisma';
  END IF;
  IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0037_step_up_pin'
    AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION '0039 checks require 0037 already replayed';
  END IF;
END
$$;

SELECT set_config('pathways_test.p39_passed','0',false);

-- Post-0034-cleanup role state (brief-wave-bc): prisma must not depend on EXECUTE of
-- postgres-owned runtime helper functions. Migration 0039 calls only pg_catalog
-- built-ins, so it needs none of the owner-role memberships the hosted 0031/0034
-- cleanups revoke, and it must not be able to invoke the pathways_runtime helper.
DO $$
BEGIN
  IF has_function_privilege('prisma','pathways.runtime_context_organization()','EXECUTE') THEN
    RAISE EXCEPTION 'prisma must not hold EXECUTE on the postgres-owned runtime_context_organization helper';
  END IF;
  IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
    WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
    AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner'))) THEN
    RAISE EXCEPTION 'prisma must not retain the temporary rules/report/finance owner-role memberships after cleanup';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+2)::text,false);
END
$$;

-- Fixture organization and projects are created directly, so the F10 source-proof
-- trigger is disabled for the fixture inserts only and re-enabled before the migration
-- runs against them, exactly like the 0036 suite.
ALTER TABLE pathways.projects DISABLE TRIGGER f10_prove_project_source;

INSERT INTO pathways.organizations(id,code,name) VALUES
  ('39600000-0000-4000-8000-000000000001','P39_A','Synthetic 0039 organization');

-- Project 1: split on newline, ';' and ',' in one legacy value.
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners) VALUES
  ('39600000-0000-4000-8000-000000000041','39600000-0000-4000-8000-000000000001','P39_SPLIT',
   'Synthetic split project', E'Alpha Org\nBeta Org; Gamma Org, Delta Org');

-- Project 2: de-duplicate by lower(btrim(name)); reuses the organization's "Alpha Org"
-- partner record created for project 1 and adds only a project link.
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners) VALUES
  ('39600000-0000-4000-8000-000000000042','39600000-0000-4000-8000-000000000001','P39_DEDUPE',
   'Synthetic dedupe project', 'Alpha Org, alpha org , ALPHA ORG');

-- Project 3: one over-120-character piece is skipped (not truncated), one valid piece kept.
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners) VALUES
  ('39600000-0000-4000-8000-000000000043','39600000-0000-4000-8000-000000000001','P39_OVERLONG',
   'Synthetic overlong project', 'Valid Partner,' || repeat('x',121));

-- Project 4: already at 19 linked partners; the legacy value would add 2 more distinct
-- names, exceeding the 20-partner bound, so the whole project is skipped.
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners) VALUES
  ('39600000-0000-4000-8000-000000000044','39600000-0000-4000-8000-000000000001','P39_CAP',
   'Synthetic cap project', 'New Partner One, New Partner Two');
INSERT INTO pathways.implementing_partners(id,organization_id,name,normalized_name)
SELECT ('39600000-0000-4000-8000-0000000001' || lpad(n::text,2,'0'))::uuid,
  '39600000-0000-4000-8000-000000000001','Cap Partner ' || n,lower('Cap Partner ' || n)
FROM generate_series(1,19) AS n;
INSERT INTO pathways.project_implementing_partners(organization_id,project_id,partner_id)
SELECT '39600000-0000-4000-8000-000000000001','39600000-0000-4000-8000-000000000044',
  ('39600000-0000-4000-8000-0000000001' || lpad(n::text,2,'0'))::uuid
FROM generate_series(1,19) AS n;

-- Project 5: an existing structured link must never be replaced or removed; the legacy
-- value only adds the partner it names that is not already linked.
INSERT INTO pathways.implementing_partners(id,organization_id,name,normalized_name) VALUES
  ('39600000-0000-4000-8000-000000000051','39600000-0000-4000-8000-000000000001','Existing Partner','existing partner');
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners) VALUES
  ('39600000-0000-4000-8000-000000000045','39600000-0000-4000-8000-000000000001','P39_PRESERVE',
   'Synthetic preserve project', 'New Partner');
INSERT INTO pathways.project_implementing_partners(organization_id,project_id,partner_id) VALUES
  ('39600000-0000-4000-8000-000000000001','39600000-0000-4000-8000-000000000045','39600000-0000-4000-8000-000000000051');

-- Project 6: an archived project's legacy text is never touched.
INSERT INTO pathways.projects(id,organization_id,code,title,implementing_partners,archived_at) VALUES
  ('39600000-0000-4000-8000-000000000046','39600000-0000-4000-8000-000000000001','P39_ARCHIVED',
   'Synthetic archived project', 'Archived Partner', now());

ALTER TABLE pathways.projects ENABLE TRIGGER f10_prove_project_source;
COMMIT;

-- First run: perform the backfill.
\ir ../migrations/0039_project_partner_backfill/migration.sql

BEGIN;
DO $$
DECLARE
  split_links integer;
  alpha_partner_id uuid;
  dedupe_links integer;
  overlong_links integer;
  overlong_skipped integer;
  cap_links integer;
  preserve_links integer;
  archived_links integer;
  audit_count integer;
BEGIN
  -- 1/3: split + de-duplicate within one project's own text.
  SELECT count(*) INTO split_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000041';
  IF split_links <> 4 THEN RAISE EXCEPTION 'expected 4 split partners, got %',split_links; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 2: de-duplicate by lower(btrim(name)) across projects; project 2 reuses project 1's
  -- "Alpha Org" partner row rather than creating a second one.
  SELECT i.id INTO alpha_partner_id FROM pathways.implementing_partners i
   WHERE i.organization_id='39600000-0000-4000-8000-000000000001' AND i.normalized_name='alpha org';
  SELECT count(*) INTO dedupe_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000042';
  IF dedupe_links <> 1 OR NOT EXISTS(SELECT FROM pathways.project_implementing_partners
     WHERE organization_id='39600000-0000-4000-8000-000000000001'
       AND project_id='39600000-0000-4000-8000-000000000042' AND partner_id=alpha_partner_id) THEN
    RAISE EXCEPTION 'project 2 did not de-duplicate onto the shared Alpha Org partner';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 3: skip over-120-character pieces without truncating them; keep the valid piece.
  SELECT count(*) INTO overlong_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000043';
  SELECT (changes->>'skippedPieceCount')::integer INTO overlong_skipped FROM pathways.audit_logs
   WHERE organization_id='39600000-0000-4000-8000-000000000001' AND project_id='39600000-0000-4000-8000-000000000043'
     AND action='PROJECT_PARTNERS_BACKFILLED';
  IF overlong_links <> 1 OR overlong_skipped <> 1 THEN
    RAISE EXCEPTION 'expected 1 kept partner and 1 skipped piece for the overlong project, got % links / % skipped',overlong_links,overlong_skipped;
  END IF;
  IF EXISTS(SELECT FROM pathways.implementing_partners WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND length(name)>120) THEN
    RAISE EXCEPTION 'an over-120-character partner name was inserted';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 4/5: the 20-partner cap skips the whole project; its 19 pre-existing links stay.
  SELECT count(*) INTO cap_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000044';
  IF cap_links <> 19 THEN RAISE EXCEPTION 'expected the capped project to keep its 19 existing links, got %',cap_links; END IF;
  IF EXISTS(SELECT FROM pathways.audit_logs WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000044' AND action='PROJECT_PARTNERS_BACKFILLED') THEN
    RAISE EXCEPTION 'the capped, skipped project must not receive an audit row';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 6: an existing structured link is preserved, and the new legacy name is added.
  SELECT count(*) INTO preserve_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000045';
  IF preserve_links <> 2 OR NOT EXISTS(SELECT FROM pathways.project_implementing_partners
     WHERE organization_id='39600000-0000-4000-8000-000000000001'
       AND project_id='39600000-0000-4000-8000-000000000045'
       AND partner_id='39600000-0000-4000-8000-000000000051') THEN
    RAISE EXCEPTION 'project 5 lost or duplicated its existing partner link';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 7: an archived project's legacy text is left completely untouched.
  SELECT count(*) INTO archived_links FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001'
     AND project_id='39600000-0000-4000-8000-000000000046';
  IF archived_links <> 0 THEN RAISE EXCEPTION 'an archived project was backfilled'; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 8: one audit row per changed project (1, 2, 3 and 5; never 4 or 6).
  SELECT count(*) INTO audit_count FROM pathways.audit_logs
   WHERE organization_id='39600000-0000-4000-8000-000000000001' AND action='PROJECT_PARTNERS_BACKFILLED'
     AND actor_user_id IS NULL AND changes->>'source'='MIGRATION_0039';
  IF audit_count <> 4 THEN RAISE EXCEPTION 'expected 4 audit rows after the first run, got %',audit_count; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  -- 9: the legacy column is retained and marked deprecated, never cleared.
  IF pg_catalog.col_description('pathways.projects'::regclass,
     (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='pathways.projects'::regclass AND attname='implementing_partners'))
     IS DISTINCT FROM 'Deprecated by migration 0039; read-only legacy text.'
   OR EXISTS(SELECT FROM pathways.projects WHERE id='39600000-0000-4000-8000-000000000041' AND implementing_partners IS NULL) THEN
    RAISE EXCEPTION 'the legacy implementing_partners column was cleared or its comment is missing';
  END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);
END
$$;

SELECT 'PROJECT_PARTNER_BACKFILL_RUNTIME_FIRST_RUN_PASSED=' || current_setting('pathways_test.p39_passed') AS result;
DO $$ BEGIN
  IF current_setting('pathways_test.p39_passed')::integer <> 10 THEN
    RAISE EXCEPTION 'Expected 10 assertions after the first run';
  END IF;
END $$;
COMMIT;

-- Second run: idempotent. No new partners, links or audit rows.
\ir ../migrations/0039_project_partner_backfill/migration.sql

BEGIN;
DO $$
DECLARE
  partner_count integer;
  link_count integer;
  audit_count integer;
BEGIN
  SELECT count(*) INTO partner_count FROM pathways.implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001';
  -- Alpha, Beta, Gamma, Delta, Valid Partner, Cap Partner 1-19, Existing Partner, New Partner = 26.
  IF partner_count <> 26 THEN RAISE EXCEPTION 'partner count changed on rerun, got %',partner_count; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  SELECT count(*) INTO link_count FROM pathways.project_implementing_partners
   WHERE organization_id='39600000-0000-4000-8000-000000000001';
  IF link_count <> (4+1+1+19+2) THEN RAISE EXCEPTION 'link count changed on rerun, got %',link_count; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);

  SELECT count(*) INTO audit_count FROM pathways.audit_logs
   WHERE organization_id='39600000-0000-4000-8000-000000000001' AND action='PROJECT_PARTNERS_BACKFILLED';
  IF audit_count <> 4 THEN RAISE EXCEPTION 'a rerun produced a new audit row, count is now %',audit_count; END IF;
  PERFORM set_config('pathways_test.p39_passed',(current_setting('pathways_test.p39_passed')::integer+1)::text,false);
END
$$;

SELECT 'PROJECT_PARTNER_BACKFILL_RUNTIME_ASSERTIONS_PASSED=' || current_setting('pathways_test.p39_passed') AS result;
DO $$ BEGIN
  IF current_setting('pathways_test.p39_passed')::integer <> 13 THEN
    RAISE EXCEPTION 'Expected 13 total assertions';
  END IF;
END $$;
COMMIT;
