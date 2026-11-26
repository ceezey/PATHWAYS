-- 0098 rate limiting (G-07); forward migration.
-- Fixed-window request counters kept in the database so limits hold across serverless instances. Only a SHA-256 of the bucket
-- text is stored, so raw client addresses and emails never reach the table. Callers get a wait in seconds, 0 when allowed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
  IF current_user <> 'prisma' OR NOT EXISTS (SELECT FROM public._prisma_migrations WHERE migration_name='0097_publication_checklist'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
     OR pg_catalog.to_regclass('pathways.rate_limit_counters') IS NOT NULL THEN
    RAISE EXCEPTION '0098 requires the verified 0097 state and migration identity';
  END IF;
END $preflight$;
SELECT pg_catalog.pg_advisory_xact_lock(505005, 98);

CREATE TABLE pathways.rate_limit_counters (
 key_hash text PRIMARY KEY,
 window_started_at timestamptz(3) NOT NULL,
 hits integer NOT NULL,
 CONSTRAINT rate_limit_counters_hash CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT rate_limit_counters_hits CHECK (hits >= 1)
);
CREATE INDEX rate_limit_counters_window_idx ON pathways.rate_limit_counters (window_started_at);
ALTER TABLE pathways.rate_limit_counters OWNER TO prisma;
ALTER TABLE pathways.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.rate_limit_counters FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- Counts one hit in the bucket's fixed window. Returns 0 while hits <= max_hits, else the whole seconds until the window ends.
CREATE FUNCTION pathways.rate_limit_hit(bucket text, max_hits integer, window_seconds integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE now_ts timestamptz(3):=pg_catalog.statement_timestamp(); h text; cur_hits integer; started timestamptz(3);
BEGIN
 IF bucket IS NULL OR pg_catalog.length(bucket) NOT BETWEEN 1 AND 512
  OR max_hits IS NULL OR max_hits NOT BETWEEN 1 AND 10000
  OR window_seconds IS NULL OR window_seconds NOT BETWEEN 1 AND 3600
 THEN RAISE EXCEPTION 'Invalid rate limit arguments' USING ERRCODE='22023'; END IF;
 DELETE FROM pathways.rate_limit_counters WHERE window_started_at < now_ts - interval '1 hour';
 h:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(bucket,'UTF8')),'hex');
 INSERT INTO pathways.rate_limit_counters AS c (key_hash,window_started_at,hits) VALUES (h,now_ts,1)
 ON CONFLICT (key_hash) DO UPDATE SET
  window_started_at = CASE WHEN c.window_started_at + pg_catalog.make_interval(secs => window_seconds) <= now_ts
                      THEN now_ts ELSE c.window_started_at END,
  hits = CASE WHEN c.window_started_at + pg_catalog.make_interval(secs => window_seconds) <= now_ts
         THEN 1 ELSE LEAST(c.hits + 1, max_hits + 1) END
 RETURNING c.hits, c.window_started_at INTO cur_hits, started;
 IF cur_hits <= max_hits THEN RETURN 0; END IF;
 RETURN GREATEST(1, pg_catalog.ceil(EXTRACT(epoch FROM started + pg_catalog.make_interval(secs => window_seconds) - now_ts))::integer);
END $$;

ALTER FUNCTION pathways.rate_limit_hit(text,integer,integer) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.rate_limit_hit(text,integer,integer) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.rate_limit_hit(text,integer,integer) TO pathways_runtime;
COMMIT;
