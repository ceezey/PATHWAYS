// Rebuilds the LOCAL Supabase database (supabase/config.toml) from the Prisma
// migration ledger, then writes the synthetic seed. Loopback container only: it
// never reads hosted credentials or env files.
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localDatabase } from './local-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationsDir = path.join(root, 'apps', 'api', 'prisma', 'migrations')
const phase6Dir = path.join(root, 'infra', 'supabase', 'phase6')
const stageDir = path.join(root, '.tmp', 'local-db', 'migrations')

const baseline = '0000_pathways_baseline_through_0026'
// Migrations that require DBA role preprovisioning before they run, mapped to
// the reviewed phase 6 script that provisions those roles.
const preprovision = {
  '0031_f10_f11_rules_runtime': 'hosted-rules-preprovision.sql',
  '0034_core_feature_completion': 'hosted-core-preprovision.sql',
  '0037_step_up_pin': 'hosted-step-up-pin-preprovision.sql',
}

function run(command, args, { input, env, label } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
    env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) throw new Error(`${label ?? command} failed (exit ${result.status})`)
}

function psql(sql, label, vars = []) {
  run(
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
      ...vars,
    ],
    {
      input: sql,
      label,
    },
  )
}

function assertLocalContainer() {
  const published = execFileSync('docker', ['port', localDatabase.container, '5432/tcp'], {
    encoding: 'utf8',
  })
  if (!published.split(/\r?\n/).some((line) => line.trim().endsWith(`:${localDatabase.port}`))) {
    throw new Error(
      `${localDatabase.container} is not published on ${localDatabase.port}. Run pnpm db:local:start.`,
    )
  }
}

// The reviewed hosted preprovision scripts pin two hosted project refs. The local
// Supabase container has the same ordinary-postgres/supabase_admin role profile,
// so the body is reused unchanged except for that pin.
function runPreprovision(file) {
  const sql = readFileSync(path.join(phase6Dir, file), 'utf8')
  const pin = ":'target_project_ref' IN ('pdqwsknbzkdtiwjjibqt','klbtoqdalmcsfjqophty')"
  if (!sql.includes(pin))
    throw new Error(`${file} target pin changed; review before reusing it locally`)
  psql(sql.replace(pin, ":'target_project_ref'='local'"), file, [
    '-v',
    'target_project_ref=local',
    '-v',
    'expected_database=postgres',
  ])
}

// Prisma applies every pending migration it can see, so migrations are staged
// below .tmp (required by prisma.replay.config.ts) up to each preprovision point.
function deployStaged(names) {
  for (const name of names)
    cpSync(path.join(migrationsDir, name), path.join(stageDir, name), { recursive: true })
  run(
    'pnpm',
    [
      '--filter',
      '@pathways/api',
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      path.join(phase6Dir, 'prisma.replay.config.ts'),
    ],
    {
      env: {
        DIRECT_URL: localDatabase.prismaUrl,
        DATABASE_URL: localDatabase.prismaUrl,
        PATHWAYS_PHASE6_REPLAY_MIGRATIONS: stageDir,
      },
      label: 'prisma migrate deploy',
    },
  )
}

function main() {
  assertLocalContainer()
  run('npx', ['supabase', 'db', 'reset', '--local', '--no-seed'], { label: 'supabase db reset' })

  // Local stand-ins for the hosted DBA prerequisites the baseline expects.
  psql(
    `CREATE ROLE prisma LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${localDatabase.prismaPassword}';
GRANT prisma TO postgres WITH INHERIT TRUE, SET TRUE;
GRANT CREATE ON DATABASE postgres TO prisma;
GRANT USAGE, CREATE ON SCHEMA public TO prisma;
GRANT TEMPORARY ON DATABASE postgres TO prisma, authenticator, supabase_auth_admin, supabase_storage_admin,
  supabase_etl_admin, supabase_read_only_user, supabase_realtime_admin, supabase_replication_admin, supabase_privileged_role;
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;`,
    'local prerequisites',
  )

  // The baseline runs as the administrator on fresh databases only; Prisma then
  // registers it by checksum, exactly as on existing databases.
  psql(readFileSync(path.join(migrationsDir, baseline, 'migration.sql'), 'utf8'), baseline)
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })
  cpSync(
    path.join(migrationsDir, 'migration_lock.toml'),
    path.join(stageDir, 'migration_lock.toml'),
  )
  cpSync(path.join(migrationsDir, baseline), path.join(stageDir, baseline), { recursive: true })
  run(
    'pnpm',
    [
      '--filter',
      '@pathways/api',
      'exec',
      'prisma',
      'migrate',
      'resolve',
      '--applied',
      baseline,
      '--config',
      path.join(phase6Dir, 'prisma.replay.config.ts'),
    ],
    {
      env: {
        DIRECT_URL: localDatabase.prismaUrl,
        DATABASE_URL: localDatabase.prismaUrl,
        PATHWAYS_PHASE6_REPLAY_MIGRATIONS: stageDir,
      },
      label: 'register baseline',
    },
  )

  const remaining = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== baseline)
    .map((entry) => entry.name)
    .sort()
  let batch = []
  for (const name of remaining) {
    if (preprovision[name]) {
      if (batch.length) deployStaged(batch)
      batch = []
      runPreprovision(preprovision[name])
    }
    batch.push(name)
  }
  if (batch.length) deployStaged(batch)

  // The API refuses owner connections; give the non-owner runtime role a
  // local-only login.
  psql(
    `ALTER ROLE pathways_runtime WITH LOGIN PASSWORD '${localDatabase.runtimePassword}';`,
    'runtime login',
  )

  run('node', [path.join(root, 'scripts', 'db', 'local-seed.mjs')], {
    label: 'local synthetic seed',
  })
}

main()
