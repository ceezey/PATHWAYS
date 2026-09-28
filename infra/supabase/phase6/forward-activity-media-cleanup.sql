-- Owned disposable local CI only; same grantor as forward-activity-media-preprovision.sql. Run
-- after a successful 0041 deploy and also after a failed or rolled-back attempt.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry','pathways_phase4_pdf_retry','pathways_phase4_pin_retry','pathways_phase4_import_retry','pathways_phase4_partner_retry','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55448
 OR current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Only root-owned disposable 55448 target is permitted'; END IF; END $$;
REVOKE rules_store_owner,rules_enqueue_owner FROM prisma GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')
 OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'rules\_%\_owner'
  AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
 THEN RAISE EXCEPTION 'Temporary 0041 membership or schema CREATE remains'; END IF;
END $$;
DO $$ BEGIN IF pg_catalog.to_regprocedure('pathways_rules_internal.assert_runtime_provisioned()') IS NOT NULL THEN PERFORM pathways_rules_internal.assert_runtime_provisioned(); END IF; END $$;
COMMIT;
