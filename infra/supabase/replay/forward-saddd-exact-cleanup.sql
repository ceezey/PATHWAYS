-- Owned disposable local CI only; same grantor as forward-saddd-exact-preprovision.sql. Run
-- after a successful 0076 deploy and also after a failed or rolled-back attempt.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry','pathways_phase4_pdf_retry','pathways_phase4_pin_retry','pathways_phase4_import_retry','pathways_phase4_partner_retry','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry','pathways_phase4_psc_retry','pathways_phase4_oex_retry','pathways_phase4_prv_fault','pathways_phase4_prv_retry','pathways_phase4_f9a_retry','pathways_phase4_rar_fault','pathways_phase4_rar_retry','pathways_phase4_rmt_fault','pathways_phase4_rmt_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int
 OR current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Only root-owned disposable replay port target is permitted'; END IF; END $$;
REVOKE report_projection_owner,rules_store_owner,rules_projection_owner FROM prisma GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND r.rolname IN('report_projection_owner','rules_store_owner','rules_projection_owner'))
 OR pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
 OR pg_catalog.has_schema_privilege('rules_projection_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION 'Temporary 0076 membership or schema CREATE remains'; END IF;
END $$;
COMMIT;
