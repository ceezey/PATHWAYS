-- 0096 audit tamper evidence (cr-pathways-audit-tamper-evidence); forward migration.
-- audit_logs becomes append-only (no UPDATE, DELETE or TRUNCATE while the triggers are on) and every row joins a per-organization
-- SHA-256 hash chain. Existing rows are chained first, ordered by occurred_at then id, before the block exists.
-- Only the owner can switch a trigger off; p96_verify_audit_chain, given a row hash kept outside the database, shows that too.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
  IF current_user <> 'prisma' OR NOT EXISTS (SELECT FROM public._prisma_migrations WHERE migration_name='0095_retire_legacy_public_tables'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION '0096 requires the verified 0095 state and migration identity';
  END IF;
  IF pg_catalog.to_regclass('pathways.audit_logs') IS NULL
     OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.audit_logs'::pg_catalog.regclass) <> 'prisma'
     OR pg_catalog.to_regclass('pathways.audit_chain_heads') IS NOT NULL
     OR EXISTS (SELECT FROM pg_catalog.pg_attribute WHERE attrelid='pathways.audit_logs'::pg_catalog.regclass
       AND attname IN ('chain_seq','prev_hash','row_hash') AND NOT attisdropped) THEN
    RAISE EXCEPTION '0096 requires prisma-owned pathways.audit_logs without chain columns';
  END IF;
END $preflight$;
SELECT pg_catalog.pg_advisory_xact_lock(505005, 96);
-- Writers wait here until commit, so no row is inserted between the backfill and the triggers.
LOCK TABLE pathways.audit_logs IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE pathways.audit_logs ADD COLUMN chain_seq bigint, ADD COLUMN prev_hash bytea, ADD COLUMN row_hash bytea;
CREATE TABLE pathways.audit_chain_heads (
  organization_id uuid PRIMARY KEY REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  last_seq bigint NOT NULL CHECK (last_seq > 0),
  last_hash bytea NOT NULL CHECK (octet_length(last_hash) = 32)
);
ALTER TABLE pathways.audit_chain_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.audit_chain_heads FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

-- The hashed text of one row; nulls are empty text, fields are split by the unit separator, and time is UTC to the millisecond.
CREATE FUNCTION pathways.p96_audit_row_hash(prev bytea, id uuid, organization_id uuid, actor_user_id uuid, project_id uuid,
  action text, entity_type text, entity_id text, changes jsonb, ip_address text, occurred_at timestamptz) RETURNS bytea
 LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO '' AS $$
 SELECT pg_catalog.sha256(prev || pg_catalog.convert_to(pg_catalog.concat_ws(pg_catalog.chr(31),
  id::text, organization_id::text, coalesce(actor_user_id::text,''), coalesce(project_id::text,''), action, entity_type,
  coalesce(entity_id,''), coalesce(changes::text,''), coalesce(ip_address,''),
  pg_catalog.to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS')), 'UTF8'))
$$;

-- Rewrites one organization's whole chain and head. It only works while the block triggers are off (or under the replica role),
-- so it adds nothing to what the owner can already do; the migration backfill and the defense snapshot restore use it.
CREATE FUNCTION pathways.p96_reseal_audit_chain(org uuid) RETURNS bigint
 LANGUAGE plpgsql VOLATILE SET search_path TO '' AS $$
DECLARE r record; seq bigint := 0; prev bytea := pg_catalog.decode(pg_catalog.repeat('00', 32), 'hex'); h bytea;
BEGIN
 -- Cleared first, since renumbering row by row would collide on the unique sequence index.
 UPDATE pathways.audit_logs SET chain_seq = NULL, prev_hash = NULL, row_hash = NULL WHERE organization_id = org;
 FOR r IN SELECT * FROM pathways.audit_logs a WHERE a.organization_id = org ORDER BY a.occurred_at, a.id LOOP
  seq := seq + 1;
  h := pathways.p96_audit_row_hash(prev, r.id, r.organization_id, r.actor_user_id, r.project_id, r.action, r.entity_type,
   r.entity_id, r.changes, r.ip_address, r.occurred_at);
  UPDATE pathways.audit_logs SET chain_seq = seq, prev_hash = prev, row_hash = h WHERE id = r.id;
  prev := h;
 END LOOP;
 DELETE FROM pathways.audit_chain_heads WHERE organization_id = org;
 IF seq > 0 THEN INSERT INTO pathways.audit_chain_heads VALUES (org, seq, prev); END IF;
 RETURN seq;
END $$;
REVOKE ALL ON FUNCTION pathways.p96_reseal_audit_chain(uuid), pathways.p96_audit_row_hash(bytea,uuid,uuid,uuid,uuid,text,text,text,jsonb,text,timestamptz)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

DO $backfill$
DECLARE o uuid;
BEGIN
 FOR o IN SELECT DISTINCT organization_id FROM pathways.audit_logs ORDER BY 1 LOOP
  PERFORM pathways.p96_reseal_audit_chain(o);
 END LOOP;
END $backfill$;
CREATE UNIQUE INDEX audit_logs_org_chain_seq_key ON pathways.audit_logs (organization_id, chain_seq);

-- Insert: one writer per organization at a time extends the chain; values supplied by the caller are replaced.
-- It runs after p09_supporting_insert (trigger names fire in order), so it hashes the final occurred_at.
CREATE FUNCTION pathways.p96_audit_chain() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE head record;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(960096, pg_catalog.hashtext(NEW.organization_id::text));
 SELECT last_seq, last_hash INTO head FROM pathways.audit_chain_heads WHERE organization_id = NEW.organization_id FOR UPDATE;
 NEW.chain_seq := coalesce(head.last_seq, 0) + 1;
 NEW.prev_hash := coalesce(head.last_hash, pg_catalog.decode(pg_catalog.repeat('00', 32), 'hex'));
 NEW.row_hash := pathways.p96_audit_row_hash(NEW.prev_hash, NEW.id, NEW.organization_id, NEW.actor_user_id, NEW.project_id,
  NEW.action, NEW.entity_type, NEW.entity_id, NEW.changes, NEW.ip_address, NEW.occurred_at);
 INSERT INTO pathways.audit_chain_heads VALUES (NEW.organization_id, NEW.chain_seq, NEW.row_hash)
  ON CONFLICT (organization_id) DO UPDATE SET last_seq = EXCLUDED.last_seq, last_hash = EXCLUDED.last_hash;
 RETURN NEW;
END $$;
CREATE FUNCTION pathways.p96_audit_append_only() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION pathways.p96_audit_chain(), pathways.p96_audit_append_only() FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
CREATE TRIGGER p96_audit_chain BEFORE INSERT ON pathways.audit_logs FOR EACH ROW EXECUTE FUNCTION pathways.p96_audit_chain();
CREATE TRIGGER p96_audit_no_rewrite BEFORE UPDATE OR DELETE ON pathways.audit_logs FOR EACH ROW EXECUTE FUNCTION pathways.p96_audit_append_only();
CREATE TRIGGER p96_audit_no_truncate BEFORE TRUNCATE ON pathways.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION pathways.p96_audit_append_only();

-- Recomputes one organization's chain. Rows without a chain position (inserted with triggers off) report broken_seq 0;
-- otherwise the first sequence whose link, hash or number is wrong, or whose head disagrees. When expected_seq and
-- expected_hash come from an older offsite dump, the row at that sequence must still carry that hash.
CREATE FUNCTION pathways.p96_verify_audit_chain(org uuid, expected_seq bigint DEFAULT NULL, expected_hash bytea DEFAULT NULL)
 RETURNS TABLE(ok boolean, broken_seq bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE bad bigint; last_row record; head record;
BEGIN
 IF EXISTS (SELECT FROM pathways.audit_logs a WHERE a.organization_id = org AND (a.chain_seq IS NULL OR a.row_hash IS NULL OR a.prev_hash IS NULL)) THEN
  RETURN QUERY SELECT false, 0::bigint; RETURN;
 END IF;
 SELECT min(c.chain_seq) INTO bad FROM (
  SELECT a.chain_seq, a.prev_hash, a.row_hash,
   pathways.p96_audit_row_hash(a.prev_hash, a.id, a.organization_id, a.actor_user_id, a.project_id, a.action, a.entity_type,
    a.entity_id, a.changes, a.ip_address, a.occurred_at) AS recomputed,
   lag(a.row_hash) OVER w AS before_hash, row_number() OVER w AS n
  FROM pathways.audit_logs a WHERE a.organization_id = org WINDOW w AS (ORDER BY a.chain_seq)) c
  WHERE c.chain_seq <> c.n OR c.row_hash <> c.recomputed
   OR c.prev_hash <> coalesce(c.before_hash, pg_catalog.decode(pg_catalog.repeat('00', 32), 'hex'));
 IF bad IS NULL AND expected_seq IS NOT NULL AND NOT EXISTS (SELECT FROM pathways.audit_logs a
   WHERE a.organization_id = org AND a.chain_seq = expected_seq AND a.row_hash = expected_hash) THEN
  bad := expected_seq;
 END IF;
 IF bad IS NULL THEN
  SELECT a.chain_seq, a.row_hash INTO last_row FROM pathways.audit_logs a WHERE a.organization_id = org ORDER BY a.chain_seq DESC LIMIT 1;
  SELECT h.last_seq, h.last_hash INTO head FROM pathways.audit_chain_heads h WHERE h.organization_id = org;
  IF last_row.chain_seq IS DISTINCT FROM head.last_seq OR last_row.row_hash IS DISTINCT FROM head.last_hash THEN
   bad := coalesce(head.last_seq, last_row.chain_seq);
  END IF;
 END IF;
 RETURN QUERY SELECT bad IS NULL, bad;
END $$;
REVOKE ALL ON FUNCTION pathways.p96_verify_audit_chain(uuid,bigint,bytea) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

DO $postflight$
DECLARE o uuid; v record;
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.audit_logs'::pg_catalog.regclass AND NOT tgisinternal
     AND tgname IN ('p96_audit_chain','p96_audit_no_rewrite','p96_audit_no_truncate') AND tgenabled='O') <> 3 THEN
  RAISE EXCEPTION '0096 postflight: block triggers missing';
 END IF;
 FOR o IN SELECT DISTINCT organization_id FROM pathways.audit_logs LOOP
  SELECT * INTO v FROM pathways.p96_verify_audit_chain(o);
  IF NOT v.ok THEN RAISE EXCEPTION '0096 postflight: chain of % breaks at %', o, v.broken_seq; END IF;
 END LOOP;
END $postflight$;
COMMIT;
