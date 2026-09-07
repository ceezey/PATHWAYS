import { spawnSync } from 'node:child_process'
// Approved migration identity: actual TEMP proof and Prisma history status only.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const api = path.join(root, 'apps/api')
const require = createRequire(path.join(api, 'package.json'))
const { parse } = require('dotenv')
const values = { ...process.env }
try {
  for (const relative of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
    const filename = path.join(root, relative)
    if (!fs.existsSync(filename)) continue
    for (const [key, value] of Object.entries(parse(fs.readFileSync(filename)))) {
      if (values[key] === undefined) values[key] = value
    }
  }
  const url = new URL(values.DIRECT_URL)
  if (
    url.hostname !== 'aws-1-ap-southeast-2.pooler.supabase.com' ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    decodeURIComponent(url.username) !== 'prisma.pdqwsknbzkdtiwjjibqt' ||
    url.searchParams.has('schema') ||
    !url.password
  )
    throw new Error('Connection guard')
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'require',
    PGCONNECT_TIMEOUT: '15',
  }
  const check = spawnSync(
    'C:/Program Files/PostgreSQL/18/bin/psql.exe',
    [
      '-X',
      '-w',
      '-q',
      '-A',
      '-t',
      '-h',
      url.hostname,
      '-p',
      url.port,
      '-U',
      decodeURIComponent(url.username),
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 45000,
      input: `BEGIN;
DO $$ BEGIN
 IF current_user <> 'prisma' OR session_user <> 'prisma' OR current_database() <> 'postgres'
    OR has_database_privilege(current_user,current_database(),'CREATE') THEN
  RAISE EXCEPTION 'Migration identity differs'; END IF;
END $$;
CREATE TEMP TABLE phase4_migration_temp_probe(value integer) ON COMMIT DROP;
INSERT INTO phase4_migration_temp_probe VALUES(42);
SELECT CASE WHEN count(*)=1 AND min(value)=42 THEN 'MIGRATION_TEMP_PROBE=PASS' ELSE 'FAIL' END FROM phase4_migration_temp_probe;
ROLLBACK;`,
    },
  )
  env.PGPASSWORD = undefined
  if (check.status !== 0 || check.stdout.trim() !== 'MIGRATION_TEMP_PROBE=PASS')
    throw new Error('TEMP check')
  console.log('MIGRATION_TEMP_PROBE=PASS')
  if (process.argv[2] === 'Status') {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'status',
        '--schema',
        'prisma/schema.prisma',
      ],
      {
        cwd: api,
        env: { ...process.env, DIRECT_URL: values.DIRECT_URL },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60000,
      },
    )
    if (result.status !== 0 || !result.stdout.includes('Database schema is up to date!')) {
      console.log(`MIGRATION_STATUS=FAILED; EXIT=${result.status ?? 'unknown'}`)
      process.exitCode = 1
    } else console.log('MIGRATION_STATUS=UP_TO_DATE; EXIT=0')
  }
} catch {
  console.error('Migration connection check failed; credentials and raw output withheld.')
  process.exitCode = 1
}
