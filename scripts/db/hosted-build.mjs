// Builds the full PATHWAYS schema on an EMPTY hosted Supabase project by
// replaying the exact sequence in scripts/db/local-reset.mjs (the reference
// implementation) against a real connection instead of the local Docker
// container. The developer runs this themselves; it never runs in CI and
// never touches a hosted database unless HOSTED_* env vars point at one.
//
// Usage:
//   node scripts/db/hosted-build.mjs --env-file .tmp/hosted-role-staging.env [--dry-run] [--resume]
//
// Required env vars (see scripts/db/hosted-target.mjs for exact validation):
//   HOSTED_TARGET_REF     must equal klbtoqdalmcsfjqophty
//   HOSTED_ADMIN_URL      postgres superuser/admin connection URL
//   HOSTED_DIRECT_URL     prisma migration connection URL
//   PRISMA_ROLE_PASSWORD  >= 24 characters
//   RUNTIME_ROLE_PASSWORD >= 24 characters
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASELINE,
  MIGRATIONS_IN_ORDER,
  assertResumablePrefix,
  buildPlan,
  planIndexForAppliedCount,
} from './hosted-plan.mjs'
import {
  assertEnvFileLocation,
  parseEnvFile,
  redactUrl,
  validateHostedEnv,
} from './hosted-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationsDir = path.join(root, 'apps', 'api', 'prisma', 'migrations')
const phase6Dir = path.join(root, 'infra', 'supabase', 'phase6')
const stageDir = path.join(root, '.tmp', 'hosted-build', 'migrations')

// ---------------------------------------------------------------------------
// Live IO: the only place this file spawns a real process or opens a real
// connection. Every other function takes an `io` object, so tests can inject
// a fake one and exercise the full orchestration logic without a database.
// ---------------------------------------------------------------------------
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000

function checkTimeout(result, label, timeoutMs) {
  if (result.error && result.error.code === 'ETIMEDOUT') {
    throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s and was killed`)
  }
  if (result.signal) {
    throw new Error(
      `${label} was killed by signal ${result.signal} (timeout ${Math.round(timeoutMs / 1000)}s)`,
    )
  }
}

export function createLiveIO({ ref }) {
  function run(command, args, { input, env, label, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    console.log(
      `[hosted-build] start: ${label ?? command} (timeout ${Math.round(timeoutMs / 1000)}s)`,
    )
    const started = Date.now()
    const result = spawnSync(command, args, {
      cwd: root,
      stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      input,
      env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
      shell: process.platform === 'win32',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    })
    checkTimeout(result, label ?? command, timeoutMs)
    if (result.status !== 0) throw new Error(`${label ?? command} failed (exit ${result.status})`)
    console.log(
      `[hosted-build] done: ${label ?? command} (${Math.round((Date.now() - started) / 1000)}s)`,
    )
  }

  function runCaptured(command, args, { input, env, label, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    console.log(
      `[hosted-build] start: ${label ?? command} (timeout ${Math.round(timeoutMs / 1000)}s)`,
    )
    const started = Date.now()
    const result = spawnSync(command, args, {
      cwd: root,
      input,
      encoding: 'utf8',
      env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
      shell: process.platform === 'win32',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    })
    checkTimeout(result, label ?? command, timeoutMs)
    if (result.status !== 0) {
      throw new Error(`${label ?? command} failed (exit ${result.status}): ${result.stderr}`)
    }
    console.log(
      `[hosted-build] done: ${label ?? command} (${Math.round((Date.now() - started) / 1000)}s)`,
    )
    return result.stdout
  }

  const pinVars = [
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    `target_project_ref=${ref}`,
    '-v',
    'expected_database=postgres',
  ]

  return {
    // Runs SQL text against the admin connection. Used for role creation and
    // the baseline apply, neither of which is a reviewed phase6 script.
    psqlSql(url, sql, { vars = [], label } = {}) {
      run('psql', [...pinVars, ...vars, url, '-q', '-f', '-'], { input: sql, label })
    },
    // Runs a reviewed phase6 .sql file against the admin connection and
    // returns its stdout, so callers can read \echo output (e.g. the
    // captured original_prisma_database_create value).
    psqlFile(url, filePath, { vars = [], label } = {}) {
      return runCaptured('psql', [...pinVars, ...vars, url, '-f', filePath], { label })
    },
    // Read-only query, returned as raw tuple-only text (one value per line).
    psqlQuery(url, sql) {
      const out = runCaptured('psql', [...pinVars, url, '-X', '-q', '-A', '-t', '-f', '-'], {
        input: sql,
        label: 'psql query',
      })
      return out.split(/\r?\n/).filter((line) => line.length > 0)
    },
    prismaMigrateDeploy(directUrl, stagedMigrationsDir) {
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
            DIRECT_URL: directUrl,
            DATABASE_URL: directUrl,
            PATHWAYS_PHASE6_REPLAY_MIGRATIONS: stagedMigrationsDir,
            PRISMA_HIDE_UPDATE_MESSAGE: '1',
            CHECKPOINT_DISABLE: '1',
          },
          label: 'prisma migrate deploy',
          timeoutMs: DEPLOY_TIMEOUT_MS,
        },
      )
    },
    prismaMigrateResolve(directUrl, stagedMigrationsDir, migration) {
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
          migration,
          '--config',
          path.join(phase6Dir, 'prisma.replay.config.ts'),
        ],
        {
          env: {
            DIRECT_URL: directUrl,
            DATABASE_URL: directUrl,
            PATHWAYS_PHASE6_REPLAY_MIGRATIONS: stagedMigrationsDir,
            PRISMA_HIDE_UPDATE_MESSAGE: '1',
            CHECKPOINT_DISABLE: '1',
          },
          label: 'register baseline',
        },
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Staging helpers (pure filesystem, no network) mirroring local-reset.mjs.
// ---------------------------------------------------------------------------
export function stageMigrations(names) {
  for (const name of names) {
    cpSync(path.join(migrationsDir, name), path.join(stageDir, name), { recursive: true })
  }
}

export function resetStage() {
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })
  cpSync(
    path.join(migrationsDir, 'migration_lock.toml'),
    path.join(stageDir, 'migration_lock.toml'),
  )
}

// ---------------------------------------------------------------------------
// Expected role census, derived from the repo (never a hardcoded guess). See
// the FOREACH ... ARRAY[...] role lists in the reviewed phase6 preprovision
// scripts, which are the canonical source of the roles those migrations own.
// ---------------------------------------------------------------------------
export function deriveExpectedRoles({ readFile = (p) => readFileSync(p, 'utf8') } = {}) {
  function rolesFromForeach(sql) {
    const match = sql.match(/FOREACH \w+ IN ARRAY ARRAY\[([^\]]+)\]/)
    if (!match) throw new Error('Could not find a FOREACH role array in preprovision source')
    return match[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, ''))
  }
  const rulesSql = readFile(path.join(phase6Dir, 'hosted-rules-preprovision.sql'))
  const coreSql = readFile(path.join(phase6Dir, 'hosted-core-preprovision.sql'))
  const rulesRoles = rolesFromForeach(rulesSql)
  const coreRoles = rolesFromForeach(coreSql)
  // Created directly by this script (prisma) or by the 0000 baseline
  // (pathways_runtime); neither comes from a FOREACH array.
  const buildRoles = ['prisma', 'pathways_runtime']
  const all = [...new Set([...buildRoles, ...rulesRoles, ...coreRoles])]
  return { all, rulesRoles, coreRoles, buildRoles }
}

// ---------------------------------------------------------------------------
// Preflight / postconditions
// ---------------------------------------------------------------------------
export async function preflight(io, config) {
  const problems = []
  const schemaRows = io.psqlQuery(
    config.adminUrl,
    "SELECT count(*) FROM pg_catalog.pg_namespace WHERE nspname='pathways';",
  )
  if (schemaRows[0] !== '0')
    problems.push('The pathways schema already exists; target is not empty')

  const authUsersRows = io.psqlQuery(
    config.adminUrl,
    "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users';",
  )
  if (authUsersRows[0] !== '1')
    problems.push('auth.users does not exist; expected the Supabase-managed auth schema')

  const prismaRoleRows = io.psqlQuery(
    config.adminUrl,
    "SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname='prisma';",
  )
  if (prismaRoleRows[0] !== '0') problems.push('The prisma role already exists on this target')

  if (problems.length) throw new Error(`Preflight failed:\n- ${problems.join('\n- ')}`)
  console.log('PASS: preflight (pathways schema absent, auth.users present, prisma role absent)')
}

export async function readLedger(io, adminUrl) {
  // A fresh project has no ledger until Prisma registers the baseline.
  const exists = io.psqlQuery(
    adminUrl,
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;",
  )
  if (exists[0] !== 't') return []
  const rows = io.psqlQuery(
    adminUrl,
    "SELECT migration_name || '|' || coalesce(finished_at::text,'') || '|' || coalesce(rolled_back_at::text,'') FROM public._prisma_migrations ORDER BY started_at;",
  )
  return rows.map((line) => {
    const [migration_name, finished_at, rolled_back_at] = line.split('|')
    return {
      migration_name,
      finished_at: finished_at || null,
      rolled_back_at: rolled_back_at || null,
    }
  })
}

export async function postconditions(io, config) {
  const ledger = await readLedger(io, config.adminUrl)
  const finished = ledger.filter((row) => row.finished_at && !row.rolled_back_at)
  const names = finished.map((row) => row.migration_name).sort()
  const expectedNames = [...MIGRATIONS_IN_ORDER].sort()
  if (
    ledger.length !== MIGRATIONS_IN_ORDER.length ||
    JSON.stringify(names) !== JSON.stringify(expectedNames)
  ) {
    throw new Error(
      `Ledger postcondition failed: expected exactly the ${MIGRATIONS_IN_ORDER.length} migrations 0000-0041, all finished and none failed`,
    )
  }
  console.log(
    `PASS: ledger has exactly ${MIGRATIONS_IN_ORDER.length} migrations 0000-0041, all finished and none failed`,
  )

  const residualRows = io.psqlQuery(
    config.adminUrl,
    `SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
     JOIN pg_catalog.pg_roles p ON p.oid=m.member WHERE p.rolname='prisma'
     AND (r.rolname LIKE 'rules\\_%\\_owner' OR r.rolname IN
       ('public_projection_owner','report_projection_owner','finance_operation_owner','rules_store_owner','rules_enqueue_owner'));`,
  )
  if (residualRows[0] !== '0') {
    throw new Error(
      `Postcondition failed: ${residualRows[0]} residual temporary prisma owner memberships remain`,
    )
  }
  console.log('PASS: no residual temporary owner memberships for prisma')

  const expected = deriveExpectedRoles()
  const nameList = expected.all.map((name) => `'${name}'`).join(',')
  const roleCountRows = io.psqlQuery(
    config.adminUrl,
    `SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN (${nameList});`,
  )
  const actualRoleCount = Number.parseInt(roleCountRows[0], 10)
  if (actualRoleCount !== expected.all.length) {
    throw new Error(
      `Postcondition failed: expected ${expected.all.length} of the repo-derived roles to exist, found ${actualRoleCount}`,
    )
  }
  console.log(
    `PASS: role count matches the repo-derived expectation (${expected.all.length} roles: ${expected.all.join(', ')})`,
  )

  const grantRows = io.psqlQuery(
    config.adminUrl,
    "SELECT count(*) FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE n.nspname IN ('pathways','pathways_rules_internal') AND a.privilege_type IN ('USAGE','CREATE');",
  )
  console.log(
    `PASS: schema-level permission grants observed (${grantRows[0]} USAGE/CREATE grants on pathways*)`,
  )
}

// ---------------------------------------------------------------------------
// Plan execution
// ---------------------------------------------------------------------------
async function runPreprovision(io, config, step) {
  const stdout = io.psqlFile(config.adminUrl, path.join(phase6Dir, step.file), { label: step.file })
  if (step.name === 'rules') {
    const match = stdout.match(/Original prisma database CREATE:\s*(t|f)/)
    if (!match)
      throw new Error(
        'Could not capture original_prisma_database_create from rules preprovision output',
      )
    return { originalPrismaDatabaseCreate: match[1] === 't' }
  }
  return {}
}

async function runCleanup(io, config, step, captured) {
  const vars = []
  if (step.needsOriginalPrismaDatabaseCreate) {
    if (!captured || captured.originalPrismaDatabaseCreate === undefined) {
      throw new Error(`${step.file} requires the captured original_prisma_database_create value`)
    }
    vars.push(
      '-v',
      `original_prisma_database_create=${captured.originalPrismaDatabaseCreate ? 'true' : 'false'}`,
    )
  }
  io.psqlFile(config.adminUrl, path.join(phase6Dir, step.file), { vars, label: step.file })
}

export async function runHostedBuild({ io, config, resume = false, log = console.log }) {
  await preflight(io, config)

  let startIndex = 0
  if (resume) {
    const ledger = await readLedger(io, config.adminUrl)
    const appliedCount = assertResumablePrefix(ledger)
    startIndex = planIndexForAppliedCount(appliedCount)
    log(`Resuming at plan step ${startIndex} (${appliedCount} migrations already applied)`)
  } else {
    resetStage()
  }

  const plan = buildPlan()
  let captured = {}

  for (let index = startIndex; index < plan.length; index += 1) {
    const step = plan[index]
    switch (step.type) {
      case 'create-role': {
        io.psqlSql(
          config.adminUrl,
          `CREATE ROLE prisma LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${config.prismaPassword}';
GRANT prisma TO postgres WITH INHERIT TRUE, SET TRUE;
GRANT CREATE ON DATABASE postgres TO prisma;
GRANT USAGE, CREATE ON SCHEMA public TO prisma;
GRANT TEMPORARY ON DATABASE postgres TO prisma, authenticator, supabase_auth_admin, supabase_storage_admin,
  supabase_etl_admin, supabase_read_only_user, supabase_realtime_admin, supabase_replication_admin, supabase_privileged_role;
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;`,
          { label: 'create prisma role' },
        )
        break
      }
      case 'apply-baseline': {
        io.psqlSql(
          config.adminUrl,
          readFileSync(path.join(migrationsDir, step.migration, 'migration.sql'), 'utf8'),
          {
            label: step.migration,
          },
        )
        break
      }
      case 'resolve-baseline': {
        stageMigrations([step.migration])
        io.prismaMigrateResolve(config.directUrl, stageDir, step.migration)
        break
      }
      case 'deploy': {
        stageMigrations(step.migrations)
        io.prismaMigrateDeploy(config.directUrl, stageDir)
        break
      }
      case 'preprovision': {
        try {
          const result = await runPreprovision(io, config, step)
          captured = { ...captured, ...result }
        } catch (error) {
          const matchingCleanup = plan
            .slice(index + 1)
            .find((s) => s.type === 'cleanup' && s.name === step.name)
          if (matchingCleanup) await runCleanup(io, config, matchingCleanup, captured)
          throw error
        }
        break
      }
      case 'cleanup': {
        await runCleanup(io, config, step, captured)
        break
      }
      case 'alter-runtime-role': {
        io.psqlSql(
          config.adminUrl,
          `ALTER ROLE pathways_runtime WITH LOGIN PASSWORD '${config.runtimePassword}';`,
          { label: 'runtime login' },
        )
        break
      }
      case 'postconditions': {
        await postconditions(io, config)
        break
      }
      default:
        throw new Error(`Unknown plan step type: ${step.type}`)
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function printDryRunPlan(log = console.log) {
  log('Hosted build dry run: no connection will be made. Ordered plan:')
  const plan = buildPlan()
  plan.forEach((step, index) => {
    const detail =
      step.type === 'deploy'
        ? step.migrations.join(', ')
        : step.type === 'preprovision' || step.type === 'cleanup'
          ? `${step.name} (${step.file})`
          : step.migration || ''
    log(`  ${index + 1}. ${step.type}${detail ? `: ${detail}` : ''}`)
  })
  log(
    'Checks that will run before any step: allowlisted HOSTED_TARGET_REF, URL/ref match, password length,',
  )
  log(
    'env file location, empty-target preflight (pathways schema absent, auth.users present, prisma absent).',
  )
  log(
    'Checks that will run after the last step: exact 0000-0041 finished ledger, no residual prisma owner',
  )
  log('memberships, repo-derived role/permission/grant counts.')
}

function parseArgs(argv) {
  const args = { envFile: null, dryRun: false, resume: false }
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--resume') args.resume = true
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length)
    else if (arg === '--env-file') args.envFile = '__NEXT__'
    else if (args.envFile === '__NEXT__') args.envFile = arg
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.envFile === '__NEXT__') throw new Error('--env-file requires a path')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.dryRun) {
    printDryRunPlan()
    return
  }

  if (!args.envFile)
    throw new Error('--env-file <path> is required (outside the repo or under .tmp/)')
  assertEnvFileLocation(args.envFile, root)
  const env = parseEnvFile(args.envFile)
  const config = validateHostedEnv(env)

  console.log(`Target ref: ${config.ref}`)
  console.log(`Admin URL: ${redactUrl(config.adminUrl.toString())}`)
  console.log(`Direct URL: ${redactUrl(config.directUrl.toString())}`)

  const io = createLiveIO({ ref: config.ref })
  await runHostedBuild({
    io,
    config: {
      ref: config.ref,
      adminUrl: config.adminUrl.toString(),
      directUrl: config.directUrl.toString(),
      prismaPassword: config.prismaPassword,
      runtimePassword: config.runtimePassword,
    },
    resume: args.resume,
  })
  console.log('Hosted build complete.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || String(error))
    process.exitCode = 1
  })
}
