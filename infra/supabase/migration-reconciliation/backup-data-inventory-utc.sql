-- Diagnostic companion to backup-data-inventory.sql. It changes no rows and
-- pins TimeZone so timestamptz JSON text is comparable across environments.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '130s';
SET LOCAL search_path = pg_catalog;
SET LOCAL timezone = 'UTC';

SELECT format(
  $statement$
SELECT jsonb_build_object(
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
ORDER BY namespace.nspname COLLATE "C", relation.relname COLLATE "C"
\gexec

ROLLBACK;
