// Fills the LOCAL Supabase stack with the realistic presentation workspace
// (apps/api/prisma/local-demo-seed.ts). Run after `pnpm db:local:reset`. Loopback only:
// the database URLs are fixed to the local container and the seed refuses any other target.
import { randomBytes } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase, localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shell = process.platform === 'win32'

function psql(sql) {
  // Fixed local container only, same as local-reset.mjs.
  execFileSync(
    'docker',
    ['exec', '-i', localDatabase.container, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'postgres'],
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
  )
}

function assertLocalContainer() {
  const published = execFileSync('docker', ['port', localDatabase.container, '5432/tcp'], {
    encoding: 'utf8',
  })
  if (!published.split(/\r?\n/).some((line) => line.trim().endsWith(`:${localDatabase.port}`)))
    throw new Error(
      `${localDatabase.container} is not published on ${localDatabase.port}. Run pnpm db:local:start.`,
    )
}

function run(script, extraEnv = {}) {
  const supabase = localSupabase()
  return spawnSync(
    'pnpm',
    [
      '--filter',
      '@pathways/api',
      'exec',
      'node',
      '-r',
      'ts-node/register',
      '-r',
      'tsconfig-paths/register',
      script,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell,
      env: {
        ...process.env,
        // Loopback HTTP Supabase is accepted only outside production.
        NODE_ENV: 'development',
        DIRECT_URL: localDatabase.prismaUrl,
        DATABASE_URL: localDatabase.runtimeUrl,
        SUPABASE_URL: supabase.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
        SUPABASE_JWT_SECRET: '',
        RULES_WORKER_ENABLED: 'false',
        ...extraEnv,
      },
    },
  )
}

assertLocalContainer()

// The base accounts, organization and first project come from the reset; running the base seed
// again is idempotent and repairs a database that was reset without it.
let status = run('prisma/local-synthetic-seed.ts').status ?? 1
if (status === 0) {
  // Rule evaluation runs on two dedicated machine roles that are provisioned without a login.
  // For the length of this seed they get a random password held only in this process, then are
  // returned to their no-login state, exactly as the reset leaves them.
  const password = randomBytes(24).toString('hex')
  psql(
    `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 4 PASSWORD '${password}';
ALTER ROLE pathways_rules_sweeper WITH CONNECTION LIMIT 2 PASSWORD '${password}';`,
  )
  try {
    const base = `@${localDatabase.host}:${localDatabase.port}/postgres`
    status =
      run('prisma/local-demo-seed.ts', {
        RULES_WORKER_DATABASE_URL: `postgresql://pathways_rules_worker:${password}${base}`,
        RULES_SWEEPER_DATABASE_URL: `postgresql://pathways_rules_sweeper:${password}${base}`,
      }).status ?? 1
  } finally {
    psql(
      `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 0 PASSWORD NULL;
ALTER ROLE pathways_rules_sweeper WITH CONNECTION LIMIT 0 PASSWORD NULL;`,
    )
  }
}
process.exit(status)
