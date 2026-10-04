// Launches apps/api/prisma/defense-demo-seed.ts against hosted PATHWAYS-devV2 or, with
// --test-local, the loopback Supabase stack. It reuses existing staff accounts and never creates users.
//
// Usage:
//   node scripts/db/defense-demo.mjs --env-file <path under .tmp/ or outside the repo> [--verify] [--only a,b]
//   node scripts/db/defense-demo.mjs --test-local [--verify] [--only a,b]
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertSeedTarget, loadEnvFile, resolveEnvFilePath } from './hosted-seed-target.mjs'
import { localDatabase, localSupabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shell = process.platform === 'win32'

function parseArgs(argv) {
  const flag = (name) => argv.indexOf(name)
  const value = (name) => (flag(name) >= 0 ? argv[flag(name) + 1] : undefined)
  return {
    envFile: value('--env-file'),
    only: value('--only'),
    testLocal: flag('--test-local') >= 0,
    verify: flag('--verify') >= 0,
  }
}

function runSeed(env, args) {
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
      'prisma/defense-demo-seed.ts',
      ...args,
    ],
    { cwd: root, stdio: 'inherit', shell, env: { ...process.env, ...env } },
  )
  return result.status ?? 1
}

function psql(sql) {
  // Fixed local container only, same as local-demo.mjs.
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      localDatabase.container,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    },
  )
}

function runLocal(args, only) {
  const published = execFileSync('docker', ['port', localDatabase.container, '5432/tcp'], {
    encoding: 'utf8',
  })
  if (!published.split(/\r?\n/).some((line) => line.trim().endsWith(`:${localDatabase.port}`)))
    throw new Error(
      `${localDatabase.container} is not published on ${localDatabase.port}. Run pnpm db:local:start.`,
    )
  const supabase = localSupabase()
  const env = {
    NODE_ENV: 'development',
    DIRECT_URL: localDatabase.prismaUrl,
    DATABASE_URL: localDatabase.runtimeUrl,
    SUPABASE_URL: supabase.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
    SUPABASE_JWT_SECRET: '',
    RULES_WORKER_ENABLED: 'false',
    ...(only ? { PATHWAYS_DEMO_ONLY: only } : {}),
  }
  if (args.includes('--verify')) return runSeed(env, args)
  // The rules machine roles get a random password held only in this process, then return to no-login.
  const password = randomBytes(24).toString('hex')
  psql(
    `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 4 PASSWORD '${password}';
ALTER ROLE pathways_rules_sweeper WITH CONNECTION LIMIT 2 PASSWORD '${password}';`,
  )
  try {
    const base = `@${localDatabase.host}:${localDatabase.port}/postgres`
    return runSeed(
      {
        ...env,
        RULES_WORKER_DATABASE_URL: `postgresql://pathways_rules_worker:${password}${base}`,
        RULES_SWEEPER_DATABASE_URL: `postgresql://pathways_rules_sweeper:${password}${base}`,
      },
      args,
    )
  } finally {
    psql(
      `ALTER ROLE pathways_rules_worker WITH CONNECTION LIMIT 0 PASSWORD NULL;
ALTER ROLE pathways_rules_sweeper WITH CONNECTION LIMIT 0 PASSWORD NULL;`,
    )
  }
}

function main() {
  const { envFile, only, testLocal, verify } = parseArgs(process.argv.slice(2))
  const args = [...(testLocal ? ['--test-local'] : []), ...(verify ? ['--verify'] : [])]
  if (testLocal) {
    console.info('Running the defense demo against the loopback stack (--test-local).')
    process.exit(runLocal(args, only))
  }
  const env = loadEnvFile(resolveEnvFilePath(envFile))
  const target = assertSeedTarget(env, { testLocal: false })
  console.info(`Defense demo target: hosted project ${target.projectRef} (PATHWAYS-devV2).`)
  process.exit(runSeed({ ...env, ...(only ? { PATHWAYS_DEMO_ONLY: only } : {}) }, args))
}

main()
