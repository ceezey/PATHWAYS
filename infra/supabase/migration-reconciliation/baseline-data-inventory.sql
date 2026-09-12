-- Runner supplies one REPEATABLE READ, READ ONLY transaction, timeouts,
-- search_path=pg_catalog and TimeZone=UTC. Only counts and deterministic
-- digests are returned; application rows and identifiers never leave psql.
SELECT format(
  $statement$
SELECT jsonb_build_object(
  'kind', 'data',
  'key', %L,
  'rows', count(*)::bigint,
  'sha256', encode(sha256(convert_to(
    coalesce(string_agg(to_jsonb(source_row)::text, E'\n'
      ORDER BY (to_jsonb(source_row)::text) COLLATE "C"), ''),
    'UTF8'
  )), 'hex')
)::text
FROM %I.%I AS source_row;
$statement$,
  namespace.nspname || '.' || relation.relname,
  namespace.nspname,
  relation.relname
)
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname IN ('pathways', 'public')
  AND relation.relkind = 'r'
  AND NOT (namespace.nspname = 'public' AND relation.relname = '_prisma_migrations')
ORDER BY namespace.nspname COLLATE "C", relation.relname COLLATE "C"
\gexec

