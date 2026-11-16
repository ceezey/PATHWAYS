-- Owned disposable local CI only; same grantor as forward-backup-preprovision.sql. Run
-- after a successful 0091 deploy and also after a failed or rolled-back attempt.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry','pathways_phase4_pdf_retry','pathways_phase4_pin_retry','pathways_phase4_import_retry','pathways_phase4_partner_retry','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry','pathways_phase4_psc_retry','pathways_phase4_oex_retry','pathways_phase4_prv_fault','pathways_phase4_prv_retry','pathways_phase4_f9a_retry','pathways_phase4_rar_fault','pathways_phase4_rar_retry','pathways_phase4_rmt_fault','pathways_phase4_rmt_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int
 OR current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Only root-owned disposable replay port target is permitted'; END IF; END $$;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
  RAISE EXCEPTION 'A migration is still in progress'; END IF;
END $$;
REVOKE pathways_backup_owner,rules_store_owner,rules_context_owner,report_projection_owner FROM prisma GRANTED BY postgres;
-- The backup owner joins prisma only after prisma has left it, since PostgreSQL forbids circular membership.
DO $$ BEGIN
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
  GRANT prisma,rules_store_owner,report_projection_owner TO pathways_backup_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres;
 END IF;
END $$;
DO $$ DECLARE backup_oid oid; BEGIN
 SELECT oid INTO backup_oid FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_owner';
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND r.rolname IN('pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner'))
 -- ACL entries, not effective privileges: the backup owner inherits the pathways schema owner prisma.
 OR EXISTS(SELECT FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
  WHERE a.privilege_type='CREATE' AND ((n.nspname='pathways' AND a.grantee IN
   ((SELECT oid FROM pg_catalog.pg_roles WHERE rolname='report_projection_owner'),backup_oid))
   OR (n.nspname='pathways_rules_internal' AND a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_context_owner'))))
 OR (EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
   AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  AND (SELECT pg_catalog.jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE m.member=backup_oid
   AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
   AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)
   IS DISTINCT FROM '["prisma","report_projection_owner","rules_store_owner"]'::jsonb
  OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=backup_oid)<>3)
 THEN RAISE EXCEPTION 'Temporary 0091 membership or schema CREATE remains, or backup owner memberships differ'; END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
  PERFORM pathways_rules_internal.assert_runtime_provisioned();
  PERFORM pathways.p34_assert_projection_provisioned();
 END IF;
END $$;
COMMIT;
