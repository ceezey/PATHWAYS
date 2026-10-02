-- Owned disposable local CI only. Never use on hosted databases.
-- Forward equivalent of hosted-activity-review-preprovision.sql for 0044_activity_progress_review:
-- a temporary SET-only chain from prisma to rules_store_owner, rules_enqueue_owner and
-- rules_source_proof_owner, granted in the post-cleanup role state. Pair with forward-activity-review-cleanup.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry','pathways_phase4_pdf_retry','pathways_phase4_pin_retry','pathways_phase4_import_retry','pathways_phase4_partner_retry','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry','pathways_phase4_psc_retry','pathways_phase4_oex_retry','pathways_phase4_prv_fault','pathways_phase4_prv_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int
 OR current_user<>'postgres' OR session_user<>'postgres'
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolsuper)
 THEN RAISE EXCEPTION 'Only owned disposable replay port local superuser profile permitted'; END IF; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND rolinherit AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolreplication)
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0043_activity_overdue_explanation'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: the 0031/0034 owner-role memberships are already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 THEN RAISE EXCEPTION 'Verified 0043 ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_enqueue_owner,rules_source_proof_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
 OR NOT pg_catalog.pg_has_role('prisma','rules_source_proof_owner','SET') OR pg_catalog.pg_has_role('prisma','rules_source_proof_owner','USAGE')
 OR pg_catalog.pg_has_role('prisma','rules_enqueue_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE')
 THEN RAISE EXCEPTION 'Temporary 0044 SET chain postcondition failed'; END IF;
END $$;
COMMIT;
