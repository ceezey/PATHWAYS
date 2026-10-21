// Writes the local synthetic workspace (apps/api/prisma/seeds/local-synthetic-seed.ts).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase, localSupabase } from './target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const supabase = localSupabase()
const result = spawnSync(
  'pnpm',
  ['--filter', '@pathways/api', 'exec', 'tsx', 'prisma/seeds/local-synthetic-seed.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DIRECT_URL: localDatabase.prismaUrl,
      DATABASE_URL: localDatabase.runtimeUrl,
      SUPABASE_URL: supabase.apiUrl,
      SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
    },
  },
)
process.exit(result.status ?? 1)
