-- DRY RUN for migration 0039_project_partner_backfill (cr-pathways-project-rbac-ui-and-partners 3.5).
-- Read-only: one READ ONLY transaction of SELECTs, then ROLLBACK. It writes nothing, holds no
-- table lock beyond ordinary reads, and can run before or after 0039 (after, it reports no work).
-- It uses exactly the 0039 split, bound, de-duplication and 20-link rules.
--
-- Run it as the migration identity (prisma, or a role that inherits it) so row security does not
-- hide rows, and keep the output OUTSIDE the repository, for example:
--   psql "<pinned hosted connection>" -X -v ON_ERROR_STOP=1 -f infra/supabase/phase6/partner-backfill-0039-dry-run.sql > <outside-repo>/0039-dry-run.txt
-- Review every row before authorizing 0039 on any hosted database. A comma inside one
-- organization name ("Acme, Inc.") splits into two pieces; such rows need a manual decision.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role(current_user,'prisma','USAGE') THEN
  RAISE EXCEPTION 'Run the 0039 dry run as prisma (or a role inheriting it) so no row is hidden';
 END IF;
END $$;

-- Per-project plan. status: WILL_LINK, NOTHING_TO_DO or SKIPPED_OVER_20.
WITH source AS (
 SELECT p.organization_id, p.id AS project_id, p.code AS project_code, p.implementing_partners AS legacy
 FROM pathways.projects p
 WHERE p.archived_at IS NULL AND p.implementing_partners IS NOT NULL
 AND pg_catalog.btrim(p.implementing_partners)<>''
), pieces AS (
 SELECT s.organization_id, s.project_id, part.position, part.value AS raw_value,
  pg_catalog.btrim(part.value) AS name, pg_catalog.length(pg_catalog.btrim(part.value)) AS name_length
 FROM source s
 CROSS JOIN LATERAL pg_catalog.regexp_split_to_table(s.legacy,E'\r\n|[\r\n;,]')
  WITH ORDINALITY AS part(value,position)
), valid AS (
 SELECT organization_id, project_id, min(position) AS first_position,
  (array_agg(name ORDER BY position))[1] AS name, pg_catalog.lower(name) AS normalized_name,
  count(*) AS occurrences
 FROM pieces WHERE name_length BETWEEN 1 AND 120
 GROUP BY organization_id, project_id, pg_catalog.lower(name)
), linked AS (
 SELECT l.organization_id, l.project_id, i.name, i.normalized_name
 FROM pathways.project_implementing_partners l
 JOIN pathways.implementing_partners i ON i.organization_id=l.organization_id AND i.id=l.partner_id
), plan AS (
 SELECT v.*,
  EXISTS(SELECT FROM linked k WHERE k.organization_id=v.organization_id AND k.project_id=v.project_id
   AND k.normalized_name=v.normalized_name) AS already_linked,
  EXISTS(SELECT FROM pathways.implementing_partners i WHERE i.organization_id=v.organization_id
   AND i.normalized_name=v.normalized_name) AS partner_exists
 FROM valid v
)
SELECT s.organization_id, s.project_id, s.project_code,
 CASE
  WHEN count(pl.*) FILTER (WHERE NOT pl.already_linked)=0 THEN 'NOTHING_TO_DO'
  WHEN (SELECT count(*) FROM linked k WHERE k.organization_id=s.organization_id AND k.project_id=s.project_id)
   + count(pl.*) FILTER (WHERE NOT pl.already_linked)>20 THEN 'SKIPPED_OVER_20'
  ELSE 'WILL_LINK'
 END AS status,
 (SELECT coalesce(array_agg(k.name ORDER BY k.normalized_name),'{}') FROM linked k
  WHERE k.organization_id=s.organization_id AND k.project_id=s.project_id) AS existing_links,
 coalesce(array_agg(pl.name ORDER BY pl.first_position) FILTER (WHERE NOT pl.already_linked AND NOT pl.partner_exists),'{}')
  AS new_partner_names,
 coalesce(array_agg(pl.name ORDER BY pl.first_position) FILTER (WHERE NOT pl.already_linked AND pl.partner_exists),'{}')
  AS link_existing_partner_names,
 coalesce(sum(pl.occurrences-1),0) AS duplicate_pieces_collapsed,
 (SELECT coalesce(array_agg(
   CASE WHEN pc.name_length=0 THEN 'empty piece at position '||pc.position
   ELSE 'over 120 characters ('||pc.name_length||') at position '||pc.position||': '||pg_catalog.left(pc.name,60)||'...' END
   ORDER BY pc.position),'{}')
  FROM pieces pc WHERE pc.organization_id=s.organization_id AND pc.project_id=s.project_id
  AND pc.name_length NOT BETWEEN 1 AND 120) AS skipped_pieces,
 s.legacy AS legacy_text
FROM source s
LEFT JOIN plan pl ON pl.organization_id=s.organization_id AND pl.project_id=s.project_id
GROUP BY s.organization_id, s.project_id, s.project_code, s.legacy
ORDER BY status DESC, s.organization_id, s.project_code, s.project_id;

-- Totals for the review summary.
SELECT count(*) FILTER (WHERE p.implementing_partners IS NOT NULL AND pg_catalog.btrim(p.implementing_partners)<>'') AS projects_with_legacy_text,
 count(*) FILTER (WHERE p.archived_at IS NOT NULL AND p.implementing_partners IS NOT NULL
  AND pg_catalog.btrim(p.implementing_partners)<>'') AS archived_projects_not_backfilled,
 (SELECT count(*) FROM public._prisma_migrations WHERE migration_name='0039_project_partner_backfill'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migration_0039_applied
FROM pathways.projects p;
ROLLBACK;
