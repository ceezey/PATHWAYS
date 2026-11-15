-- Owned disposable local CI only. Never use on hosted databases.
-- Forward equivalent of hosted-backup-preprovision.sql for 0091_backup_recovery: creates the backup owner and job roles
-- and grants prisma temporary SET-only memberships to pathways_backup_owner, rules_store_owner, rules_context_owner and
-- report_projection_owner in the post-cleanup role state. Pair with forward-backup-cleanup.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry','pathways_phase4_pdf_retry','pathways_phase4_pin_retry','pathways_phase4_import_retry','pathways_phase4_partner_retry','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry','pathways_phase4_psc_retry','pathways_phase4_oex_retry','pathways_phase4_prv_fault','pathways_phase4_prv_retry','pathways_phase4_f9a_retry','pathways_phase4_rar_fault','pathways_phase4_rar_retry','pathways_phase4_rmt_fault','pathways_phase4_rmt_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int
 OR current_user<>'postgres' OR session_user<>'postgres'
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolsuper)
 THEN RAISE EXCEPTION 'Only owned disposable replay port local superuser profile permitted'; END IF; END $$;
-- Roles are cluster-wide, so an earlier replay database may have left the permanent backup owner memberships.
DO $$ DECLARE g record; BEGIN
 FOR g IN SELECT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_owner')
  AND r.rolname IN('prisma','rules_store_owner','report_projection_owner') LOOP
  EXECUTE pg_catalog.format('REVOKE %I FROM pathways_backup_owner GRANTED BY postgres',g.rolname);
 END LOOP;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND rolinherit AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolreplication)
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0090_test_case_gap_closure'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: every earlier owner-role membership is already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner','pathways_backup_owner')))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('report_projection_owner','rules_store_owner','rules_context_owner') AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)<>3
 THEN RAISE EXCEPTION 'Verified 0090 ledger without 0091, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
-- An existing role must have exactly its profile, no membership of its own and no member but the hosted bootstrap ADMIN row.
DO $$ DECLARE role_name text;r record;job boolean; BEGIN
 FOREACH role_name IN ARRAY ARRAY['pathways_backup_owner','pathways_backup_job'] LOOP
  job:=role_name='pathways_backup_job';
  SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname=role_name;
  IF NOT FOUND THEN
   EXECUTE pg_catalog.format('CREATE ROLE %I %s NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION %s',
    role_name,CASE WHEN job THEN 'LOGIN' ELSE 'NOLOGIN' END,CASE WHEN job THEN 'CONNECTION LIMIT 0' ELSE '' END);
  ELSIF r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
   OR r.rolcanlogin IS DISTINCT FROM job OR (job AND r.rolconnlimit<>0)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid AND NOT coalesce(
    m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
     AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper)
     AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option,false)) THEN
   RAISE EXCEPTION 'Unsafe or unreviewed preexisting backup role %',role_name;
  END IF;
 END LOOP;
END $$;
GRANT pathways_backup_owner,rules_store_owner,rules_context_owner,report_projection_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM unnest(ARRAY['pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner']) o
  WHERE NOT pg_catalog.pg_has_role('prisma',o,'SET') OR pg_catalog.pg_has_role('prisma',o,'USAGE'))
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner','pathways_backup_owner')))<>4
 OR EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname IN('pathways_backup_owner','pathways_backup_job')
  AND (rolsuper OR rolbypassrls OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication
   OR rolcanlogin IS DISTINCT FROM (rolname='pathways_backup_job') OR (rolname='pathways_backup_job' AND rolconnlimit<>0)))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('pathways_backup_owner','pathways_backup_job'))<>2
 THEN RAISE EXCEPTION 'Backup roles or temporary 0091 SET membership postcondition failed'; END IF;
END $$;
COMMIT;
