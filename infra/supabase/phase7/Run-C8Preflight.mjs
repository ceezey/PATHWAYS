import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(currentDir, '../../..')
const api = path.join(root, 'apps/api')

const require = createRequire(path.join(api, 'package.json'))
const { parse } = require('dotenv')

const values = { ...process.env }

for (const relative of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
  const filename = path.join(root, relative)

  if (!fs.existsSync(filename)) continue

  for (const [key, value] of Object.entries(parse(fs.readFileSync(filename)))) {
    if (values[key] === undefined) {
      values[key] = value
    }
  }
}

const url = new URL(values.DIRECT_URL)

if (
  url.hostname !== 'aws-1-ap-southeast-2.pooler.supabase.com' ||
  url.port !== '5432' ||
  url.pathname !== '/postgres' ||
  decodeURIComponent(url.username) !== 'prisma.pdqwsknbzkdtiwjjibqt' ||
  !url.password
) {
  throw new Error('Unexpected PATHWAYS-dev migration target.')
}

const sqlFile = path.join(root, 'infra/supabase/phase7/c8-0020-preflight.sql')

const env = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: 'require',
  PGCONNECT_TIMEOUT: '15',
  PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=45000',
}

const result = spawnSync(
  'C:/Program Files/PostgreSQL/18/bin/psql.exe',
  [
    '-X',
    '-w',
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
    '-f',
    sqlFile,
  ],
  {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
  },
)

env.PGPASSWORD = undefined

if (result.status !== 0) {
  console.error('PATHWAYS_C8_0020_PREFLIGHT=FAILED')
  process.exit(1)
}

process.stdout.write(result.stdout)
