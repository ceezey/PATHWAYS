// Runs the API and web apps against the LOCAL Supabase stack. Local values are
// passed only to the child processes and take precedence over any .env file,
// so hosted settings in ignored env files are never used or modified.
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase, localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const supabase = localSupabase()
const shell = process.platform === 'win32'
const apiPort = process.env.PATHWAYS_LOCAL_API_PORT ?? '4000'

const shared = {
  ...process.env,
  SUPABASE_URL: supabase.apiUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
  SUPABASE_JWT_SECRET: '',
  NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: supabase.anonKey,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
  NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api`,
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_DSN_API: '',
}
const apiEnv = {
  ...shared,
  // Loopback HTTP Supabase is accepted only outside production.
  NODE_ENV: 'development',
  API_PORT: apiPort,
  DATABASE_URL: localDatabase.runtimeUrl,
  DIRECT_URL: localDatabase.prismaUrl,
  WEB_ORIGIN: '',
  RULES_WORKER_ENABLED: 'false',
  RULES_WORKER_DATABASE_URL: '',
  RULES_SWEEPER_DATABASE_URL: '',
}

const build = spawnSync('pnpm', ['--filter', '@pathways/api', 'run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell,
})
if (build.status !== 0) process.exit(build.status ?? 1)

const children = [
  spawn('node', ['dist/apps/api/src/main.js'], {
    cwd: path.join(root, 'apps', 'api'),
    stdio: 'inherit',
    env: apiEnv,
  }),
  // --api-only leaves an already running web server untouched.
  ...(process.argv.includes('--api-only')
    ? []
    : [
        spawn('pnpm', ['--filter', '@pathways/web', 'dev'], {
          cwd: root,
          stdio: 'inherit',
          env: shared,
          shell,
        }),
      ]),
]
// pnpm runs under a shell on Windows, so stop each whole process tree.
const stop = () => {
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    else child.kill()
  }
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) {
  child.on('exit', (code) => {
    stop()
    process.exitCode = code ?? 1
  })
}
