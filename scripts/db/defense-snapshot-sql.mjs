// Pure SQL builders for the defense snapshot: identity mirror, dump queries and the one-transaction restore.
import { assertSameTables, parseWipeTables, splitWipe } from './defense-snapshot-parse.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/
const MIGRATION = /^\d{4}_[a-z0-9_]+$/
const COLUMN = /^("(?:[^"]|"")+"|[a-z_][a-z0-9_]*)$/
const ON_ERROR = String.raw`\set ON_ERROR_STOP on`
const TAG = '$snapshot_json$'

export const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`

/** Dollar-quotes text as a SQL literal, refusing text that contains the quote tag. */
export function dollarQuote(text) {
  if (text.includes(TAG)) throw new Error('Value contains the SQL quote tag.')
  return `${TAG}${text}${TAG}`
}

function tableArray(tables) {
  for (const name of tables)
    if (!TABLE_NAME.test(name)) throw new Error(`Unexpected table name: ${name}`)
  return `ARRAY[${tables.map((name) => `'${name}'`).join(', ')}]::text[]`
}

/** Reads the one organization and every staff row with its role code, minus contact and sign-in data. */
export const mirrorReadSql = () => `SELECT jsonb_build_object(
  'organization', (SELECT to_jsonb(o) FROM pathways.organizations o),
  'users', (SELECT jsonb_agg((to_jsonb(u) - 'contact_number' - 'last_login_at' - 'role_id')
      || jsonb_build_object('role_code', r.code) ORDER BY u.id)
    FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id));`

/** Replaces the local organization, staff rows and auth users with the mirrored identities. */
export function mirrorWriteSql({ organization, users }) {
  const org = dollarQuote(JSON.stringify(organization))
  const list = dollarQuote(JSON.stringify(users))
  return `${ON_ERROR}
DO $local$ BEGIN IF inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'Mirror write runs only on the local database'; END IF; END $local$;
BEGIN;
DELETE FROM pathways.user_step_up_pins;
DELETE FROM pathways.system_users;
DELETE FROM pathways.organizations;
DELETE FROM auth.users;
INSERT INTO pathways.organizations
SELECT (jsonb_populate_record(NULL::pathways.organizations, ${org}::jsonb)).*;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', (u->>'auth_user_id')::uuid, 'authenticated',
  'authenticated', u->>'email', '', now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
FROM jsonb_array_elements(${list}::jsonb) u WHERE u->>'auth_user_id' IS NOT NULL;
INSERT INTO pathways.system_users
SELECT (jsonb_populate_record(NULL::pathways.system_users, u || jsonb_build_object('role_id', r.id))).*
FROM jsonb_array_elements(${list}::jsonb) u JOIN pathways.roles r ON r.code = u->>'role_code';
DO $mirror$
BEGIN
  IF (SELECT count(*) FROM pathways.system_users) <> ${users.length} THEN
    RAISE EXCEPTION 'Mirror wrote a different number of users; check role codes';
  END IF;
END $mirror$;
COMMIT;
SELECT count(*) FROM pathways.system_users;`
}

/** Seed day from the first seeded audit row, plus the latest applied migration. */
export const seedInfoSql = () => `SELECT jsonb_build_object(
  'seedDay', (min(occurred_at) AT TIME ZONE 'Asia/Manila')::date,
  'migration', (SELECT max(migration_name) FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL))
FROM pathways.audit_logs;`

/** Date and timestamp columns of the given tables, skipping generated columns. */
export const dateColumnsSql = (
  tables,
) => `SELECT coalesce(jsonb_object_agg(t, cols), '{}'::jsonb) FROM (
  SELECT n.nspname || '.' || c.relname AS t,
    jsonb_agg(jsonb_build_object('name', a.attname, 'type',
      CASE WHEN a.atttypid = 'date'::regtype THEN 'date' ELSE 'timestamp' END) ORDER BY a.attnum) AS cols
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.atttypid IN ('date'::regtype, 'timestamp'::regtype, 'timestamptz'::regtype)
    AND n.nspname || '.' || c.relname = ANY (${tableArray(tables)})
  GROUP BY 1) s;`

/** Storage objects under the organization prefix, which every seeded object key uses. */
export function storageObjectsSql(organizationId) {
  if (!UUID.test(String(organizationId))) throw new Error('Organization id must be a UUID.')
  return `SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name,
  'contentType', metadata->>'mimetype') ORDER BY bucket_id, name), '[]'::jsonb)
FROM storage.objects WHERE name LIKE 'organizations/${organizationId}/%';`
}

/** Aborts unless the target's latest applied migration equals the snapshot's. */
export function migrationCheckSql(migration) {
  if (!MIGRATION.test(String(migration))) throw new Error('Manifest migration name is invalid.')
  return `DO $migration$
BEGIN
  IF (SELECT max(migration_name) FROM public._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) IS DISTINCT FROM '${migration}' THEN
    RAISE EXCEPTION 'Target migration differs from the snapshot (${migration})';
  END IF;
END $migration$;`
}

/** Aborts unless the target staff rows are exactly the mirrored ids, auth links and organization. */
export function identityCheckSql(users) {
  const expected = dollarQuote(
    JSON.stringify(
      users.map(({ id, auth_user_id, organization_id }) => ({ id, auth_user_id, organization_id })),
    ),
  )
  return `DO $identity$
DECLARE expected jsonb := ${expected}::jsonb;
BEGIN
  IF (SELECT count(*) FROM pathways.system_users) <> jsonb_array_length(expected) OR EXISTS (
    SELECT FROM jsonb_to_recordset(expected) AS e(id uuid, auth_user_id uuid, organization_id uuid)
    WHERE NOT EXISTS (SELECT FROM pathways.system_users u WHERE u.id = e.id
      AND u.auth_user_id IS NOT DISTINCT FROM e.auth_user_id AND u.organization_id = e.organization_id)) THEN
    RAISE EXCEPTION 'Target staff identities differ from the identities file; rerun mirror and the local seed';
  END IF;
END $identity$;`
}

/** Adds the day delta to every date and timestamp column of one staging table. */
export function shiftSql(table, columns, delta) {
  if (!Number.isInteger(delta) || delta < 0)
    throw new Error('Day delta must be a non-negative integer.')
  if (delta === 0 || columns.length === 0) return ''
  const sets = columns.map(({ name, type }) => {
    const column = quoteIdent(name)
    return type === 'date'
      ? `${column} = ${column} + ${delta}`
      : `${column} = ${column} + make_interval(days => ${delta})`
  })
  return `UPDATE ${table} SET ${sets.join(', ')};`
}

/** Loads each COPY block into a staging table, shifts it there, then inserts it into the real table. */
export function stagedLoadSql(blocks, dateColumns, delta) {
  return blocks
    .map((block, index) => {
      const target = `${block.schema}.${block.table}`
      for (const column of block.columns.split(',')) {
        if (!COLUMN.test(column.trim())) throw new Error(`Invalid column list for ${target}.`)
      }
      const stage = `pg_temp.snapshot_${index}`
      const shift = shiftSql(stage, dateColumns[target] ?? [], delta)
      return [
        `CREATE TEMP TABLE snapshot_${index} (LIKE ${target}) ON COMMIT DROP;`,
        `COPY ${stage} (${block.columns}) FROM stdin;`,
        ...block.rows,
        '\\.',
        ...(shift ? [shift] : []),
        `INSERT INTO ${target} (${block.columns}) SELECT ${block.columns} FROM ${stage};`,
      ].join('\n')
    })
    .join('\n')
}

/** Aborts unless every table holds exactly the manifest row count. */
export function rowCountCheckSql(tables) {
  if (tables.length === 0) throw new Error('Manifest lists no tables.')
  const values = tables.map(({ name, rows }) => {
    if (!TABLE_NAME.test(name) || !Number.isInteger(rows) || rows < 0)
      throw new Error(`Invalid manifest entry for ${name}.`)
    const [schema, table] = name.split('.')
    return `('${schema}', '${table}', ${rows})`
  })
  return `DO $counts$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES ${values.join(', ')}) AS v(s, t, expected) LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.s, r.t) INTO n;
    IF n <> r.expected THEN
      RAISE EXCEPTION 'Restored % rows into %.%, expected %', n, r.s, r.t, r.expected;
    END IF;
  END LOOP;
END $counts$;`
}

/** The whole restore: wipe head, checks, replica-role staged load, counts, wipe revoke and COMMIT (ROLLBACK when dryRun). */
export function buildRestoreSql({
  wipeSql,
  migration,
  users,
  blocks,
  dateColumns,
  tables,
  delta,
  dryRun = false,
}) {
  assertSameTables(parseWipeTables(wipeSql), blocks)
  const { head, tail: wipeTail } = splitWipe(wipeSql)
  const tail = dryRun ? wipeTail.replace(/COMMIT;(\s*)$/, 'ROLLBACK;$1') : wipeTail
  return [
    ON_ERROR,
    "SET client_encoding = 'UTF8';",
    head,
    'SET LOCAL statement_timeout = 0;',
    migrationCheckSql(migration),
    identityCheckSql(users),
    'SET LOCAL session_replication_role = replica;',
    stagedLoadSql(blocks, dateColumns, delta),
    rowCountCheckSql(tables),
    'SET LOCAL session_replication_role = origin;',
    tail,
  ].join('\n')
}
