import { spawnSync } from 'node:child_process'

// Fixed local Supabase target (supabase/config.toml, project_id "pathways").
// These passwords exist only inside the disposable local container.
const host = '127.0.0.1'
const port = 54322
const prismaPassword = 'prisma-local'
const runtimePassword = 'pathways-runtime-local'

export const localDatabase = {
  container: 'supabase_db_pathways',
  host,
  port,
  prismaPassword,
  runtimePassword,
  prismaUrl: `postgresql://prisma:${prismaPassword}@${host}:${port}/postgres`,
  runtimeUrl: `postgresql://pathways_runtime:${runtimePassword}@${host}:${port}/postgres`,
}

// Reads the local stack's URLs and keys from the Supabase CLI. Loopback only.
export function localSupabase() {
  const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0)
    throw new Error('Local Supabase is not running. Run pnpm db:local:start.')
  const status = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
  const apiUrl = new URL(status.API_URL)
  if (apiUrl.hostname !== host) throw new Error('Supabase CLI reported a non-loopback API URL.')
  return {
    apiUrl: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  }
}
