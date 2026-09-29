// Fills the LOCAL Supabase stack with the realistic presentation workspace
// (apps/api/prisma/local-demo-seed.ts). Run after `pnpm db:local:reset`. Loopback only:
// the database URLs are fixed to the local container and the seed refuses any other target.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase, localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shell = process.platform === 'win32'

function run(script) {
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
      },
    },
  )
}

// The base accounts, organization and first project come from the reset; running the base seed
// again is idempotent and repairs a database that was reset without it.
for (const script of ['prisma/local-synthetic-seed.ts', 'prisma/local-demo-seed.ts']) {
  const result = run(script)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
