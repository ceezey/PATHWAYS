-- cr-pathways-core-rbac-identity-review: grant beneficiaries.identities.review to M&E Officer.
-- Extends the 0047 matrix wrapper; no business data changes. Not applied by CI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(505005,1);

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1='MONITORING_AND_EVALUATION_OFFICER' AND $2='beneficiaries.identities.review')
  OR (NOT ($1='SYSTEM_ADMINISTRATOR' AND $2='journeys.read') AND pathways.p09_role_allows_0035($1,$2))
$matrix$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='beneficiaries.identities.review'
WHERE r.code='MONITORING_AND_EVALUATION_OFFICER'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ BEGIN
 IF NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 OR pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.identities.review')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 THEN RAISE EXCEPTION '0048 verification failed'; END IF;
END $$;
COMMIT;
