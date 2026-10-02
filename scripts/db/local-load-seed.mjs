// Adds synthetic production-scale volume to the LOCAL stack (run after db:local:demo). Loopback only.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase, localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const supabase = localSupabase()
const result = spawnSync(
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
    'prisma/local-load-seed.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DIRECT_URL: localDatabase.prismaUrl,
      DATABASE_URL: localDatabase.runtimeUrl,
      SUPABASE_URL: supabase.apiUrl,
    },
  },
)
process.exit(result.status ?? 1)
