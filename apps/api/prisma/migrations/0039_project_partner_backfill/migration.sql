-- Predecessor assertion is 0037, not 0038: migrations 0038-0041 are built in parallel in one wave.
-- cr-pathways-project-rbac-ui-and-partners 3.5: move legacy free-text implementing partners into
-- the structured 0030 partner records. Data only: no table, column, policy, grant or function
-- changes, apart from one column comment. Idempotent: a second run inserts nothing.
-- Runs as prisma, the owner of every table it touches, and calls only pg_catalog built-ins, so it
-- needs none of the owner-role memberships the hosted 0031/0034 cleanups revoke.
-- p10_replace_project_partners needs runtime user context and replaces links, so its insert and
-- link logic is reproduced here, additively: existing structured links are never removed.
-- Partner names never enter audit rows or notices; notices carry project ids and counts only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0037_step_up_pin' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relkind='r'
  AND c.relname IN('projects','implementing_partners','project_implementing_partners','audit_logs')
  AND pg_catalog.pg_get_userbyid(c.relowner)='prisma' AND NOT c.relforcerowsecurity)<>4
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.implementing_partners'::regclass
  AND contype='u' AND pg_catalog.pg_get_constraintdef(oid)='UNIQUE (organization_id, normalized_name)')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_implementing_partners'::regclass
  AND contype='p' AND pg_catalog.pg_get_constraintdef(oid)='PRIMARY KEY (organization_id, project_id, partner_id)')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_attribute WHERE attrelid='pathways.projects'::regclass
  AND attname='implementing_partners' AND NOT attisdropped)
 THEN RAISE EXCEPTION '0039 requires the verified 0037 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);
-- Blocks concurrent partner replacement for the short backfill; lock_timeout fails fast.
LOCK TABLE pathways.implementing_partners, pathways.project_implementing_partners IN SHARE ROW EXCLUSIVE MODE;

DO $backfill$
DECLARE
 source record;
 wanted text[];
 missing text[];
 previous uuid[];
 selected uuid[];
 skipped integer;
BEGIN
 FOR source IN
  SELECT p.organization_id, p.id, p.implementing_partners
  FROM pathways.projects p
  WHERE p.archived_at IS NULL AND p.implementing_partners IS NOT NULL
  AND pg_catalog.btrim(p.implementing_partners)<>''
  ORDER BY p.organization_id, p.id
  FOR UPDATE OF p
 LOOP
  -- 1-3. Split on newline (CRLF as one break), ';' and ','; btrim; keep 1-120 characters without
  -- truncation; de-duplicate by lower(btrim(name)) keeping the first spelling, as 0030 does.
  SELECT coalesce(array_agg(piece.name ORDER BY piece.first_position),'{}'),
   (SELECT count(*) FROM pg_catalog.regexp_split_to_table(source.implementing_partners,E'\r\n|[\r\n;,]') raw(value)
    WHERE pg_catalog.length(pg_catalog.btrim(raw.value)) NOT BETWEEN 1 AND 120)
  INTO wanted, skipped
  FROM (
   SELECT min(part.position) AS first_position,
    (array_agg(pg_catalog.btrim(part.value) ORDER BY part.position))[1] AS name
   FROM pg_catalog.regexp_split_to_table(source.implementing_partners,E'\r\n|[\r\n;,]')
    WITH ORDINALITY AS part(value,position)
   WHERE pg_catalog.length(pg_catalog.btrim(part.value)) BETWEEN 1 AND 120
   GROUP BY pg_catalog.lower(pg_catalog.btrim(part.value))
  ) piece;
  IF skipped>0 THEN
   RAISE NOTICE 'MIGRATION_0039 project % skipped % empty or over-120-character piece(s)',source.id,skipped;
  END IF;

  SELECT coalesce(array_agg(l.partner_id ORDER BY l.partner_id),'{}') INTO previous
  FROM pathways.project_implementing_partners l
  WHERE l.organization_id=source.organization_id AND l.project_id=source.id;
  -- Only names not already linked to this project; an existing link is never replaced.
  SELECT coalesce(array_agg(w.name ORDER BY w.position),'{}') INTO missing
  FROM unnest(wanted) WITH ORDINALITY AS w(name,position)
  WHERE NOT EXISTS(
   SELECT FROM pathways.project_implementing_partners l
   JOIN pathways.implementing_partners i ON i.organization_id=l.organization_id AND i.id=l.partner_id
   WHERE l.organization_id=source.organization_id AND l.project_id=source.id
   AND i.normalized_name=pg_catalog.lower(w.name));
  CONTINUE WHEN cardinality(missing)=0;
  -- 5. The 0030/0031 bound: a project that would exceed 20 linked partners is skipped entirely.
  IF cardinality(previous)+cardinality(missing)>20 THEN
   RAISE NOTICE 'MIGRATION_0039 project % skipped: % linked plus % new partner(s) exceeds 20',
    source.id,cardinality(previous),cardinality(missing);
   CONTINUE;
  END IF;

  -- 4. Organization-wide partner records, then the missing project links.
  INSERT INTO pathways.implementing_partners(organization_id,name,normalized_name)
  SELECT source.organization_id,m.name,pg_catalog.lower(m.name) FROM unnest(missing) AS m(name)
  ON CONFLICT(organization_id,normalized_name) DO NOTHING;
  INSERT INTO pathways.project_implementing_partners(organization_id,project_id,partner_id)
  SELECT source.organization_id,source.id,i.id FROM pathways.implementing_partners i
  WHERE i.organization_id=source.organization_id
  AND i.normalized_name=ANY(ARRAY(SELECT pg_catalog.lower(m.name) FROM unnest(missing) AS m(name)))
  ON CONFLICT DO NOTHING;

  -- 6. One audit row per changed project, with a null actor and the migration source marker.
  SELECT coalesce(array_agg(l.partner_id ORDER BY l.partner_id),'{}') INTO selected
  FROM pathways.project_implementing_partners l
  WHERE l.organization_id=source.organization_id AND l.project_id=source.id;
  INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
  VALUES(source.organization_id,NULL,source.id,'PROJECT_PARTNERS_BACKFILLED','Project',source.id::text,
   jsonb_build_object('source','MIGRATION_0039','previousPartnerIds',previous,'partnerIds',selected,
    'partnerCount',cardinality(selected),'skippedPieceCount',skipped));
 END LOOP;
END $backfill$;

-- 8. The legacy column is kept, unchanged, as the rollback source.
COMMENT ON COLUMN pathways.projects.implementing_partners IS 'Deprecated by migration 0039; read-only legacy text.';

-- Postconditions: every eligible project within the bound now links all of its valid names, and
-- no project exceeds 20 links.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pathways.projects p
  CROSS JOIN LATERAL (
   SELECT count(DISTINCT pg_catalog.lower(pg_catalog.btrim(raw.value))) AS wanted,
    count(DISTINCT pg_catalog.lower(pg_catalog.btrim(raw.value))) FILTER (WHERE NOT EXISTS(
     SELECT FROM pathways.project_implementing_partners l
     JOIN pathways.implementing_partners i ON i.organization_id=l.organization_id AND i.id=l.partner_id
     WHERE l.organization_id=p.organization_id AND l.project_id=p.id
     AND i.normalized_name=pg_catalog.lower(pg_catalog.btrim(raw.value)))) AS unlinked
   FROM pg_catalog.regexp_split_to_table(p.implementing_partners,E'\r\n|[\r\n;,]') raw(value)
   WHERE pg_catalog.length(pg_catalog.btrim(raw.value)) BETWEEN 1 AND 120) names
  WHERE p.archived_at IS NULL AND p.implementing_partners IS NOT NULL AND names.unlinked>0
  AND (SELECT count(*) FROM pathways.project_implementing_partners l
   WHERE l.organization_id=p.organization_id AND l.project_id=p.id)+names.unlinked<=20)
 OR EXISTS(SELECT FROM pathways.project_implementing_partners l
  GROUP BY l.organization_id,l.project_id HAVING count(*)>20)
 OR pg_catalog.col_description('pathways.projects'::regclass,
  (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='pathways.projects'::regclass AND attname='implementing_partners'))
  IS DISTINCT FROM 'Deprecated by migration 0039; read-only legacy text.'
 THEN RAISE EXCEPTION '0039 postcondition failed'; END IF;
END $$;
COMMIT;
