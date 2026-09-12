// Opt-in, synthetic-only investigation. Never invokes a launcher or a migration.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const filename = fileURLToPath(import.meta.url)
const repository = path.resolve(path.dirname(filename), '../../..')
const port = 55458
const pgBin = 'C:/Program Files/PostgreSQL/18/bin'
const prefix = 'pathways-p2028-synthetic-'
const database = 'p2028_synthetic'
const subject = '00000000-0000-4000-8000-000000000001'
const organization = '00000000-0000-4000-8000-000000000002'
const user = '00000000-0000-4000-8000-000000000003'
const session = '00000000-0000-4000-8000-000000000004'
const context = { authSubject: subject, organizationId: organization, userId: user }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let workerStage = 'MODULE_LOAD'

function check(condition, category) {
  if (!condition) throw new Error(category)
}

function reviewedConnectionLimit() {
  const source = fs.readFileSync(
    path.join(repository, 'infra/supabase/security-adapter/Start-DevRuntime.ps1'),
    'utf8',
  )
  const queries = [...source.matchAll(/^\s*\$phase4Uri\.Query = '([^'\r\n]+)'\s*$/gm)]
  check(queries.length === 1, 'LAUNCHER_QUERY_DRIFT')
  const params = new URLSearchParams(queries[0][1])
  check(
    params.size === 3 &&
      params.get('sslmode') === 'require' &&
      params.get('connect_timeout') === '30' &&
      params.get('connection_limit') === '2',
    'LAUNCHER_QUERY_DRIFT',
  )
  return Number(params.get('connection_limit'))
}

function targetUrl(connectionLimit) {
  check(connectionLimit === 1 || connectionLimit === 2, 'TARGET_REJECTED')
  // Fake credentials; PG accepts only this isolated loopback cluster.
  const url = new URL(`postgresql://postgres:synthetic@127.0.0.1:${port}/${database}`)
  url.searchParams.set('sslmode', 'disable')
  url.searchParams.set('connect_timeout', '5')
  url.searchParams.set('connection_limit', String(connectionLimit))
  return url.href
}

function cleanEnvironment(directory) {
  return {
    SystemRoot: process.env.SystemRoot,
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    PATH: 'C:\\Windows\\System32',
    TEMP: directory,
    TMP: directory,
    PGPASSFILE: 'NUL',
    PGCONNECT_TIMEOUT: '5',
    PGSSLMODE: 'disable',
    NO_COLOR: '1',
  }
}

async function portFree() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

function privateCommand(tool, args, directory, input) {
  const result = spawnSync(path.join(pgBin, `${tool}.exe`), args, {
    cwd: directory,
    env: cleanEnvironment(directory),
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 25_000,
    maxBuffer: 1_000_000,
  })
  check(!result.error && result.status === 0, `LOCAL_${tool.toUpperCase()}_FAILED`)
  return result.stdout.trim()
}

function sql(directory, input) {
  return privateCommand(
    'psql',
    [
      '-X',
      '-w',
      '-q',
      '-A',
      '-t',
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    directory,
    input,
  )
}

// Deliberately incomplete synthetic schema, NOT a migration or an RLS rehearsal.
// Only columns touched by the real profile queries and fake helper prerequisites.
const fixture = `
CREATE SCHEMA pathways;
CREATE TYPE pathways.organization_status AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');
CREATE TYPE pathways.account_status AS ENUM ('INVITED','ACTIVE','SUSPENDED','DEACTIVATED','ARCHIVED');
CREATE TYPE pathways.assignment_status AS ENUM ('ACTIVE','ENDED');
CREATE TABLE pathways.organizations (id uuid PRIMARY KEY, name text, status pathways.organization_status, archived_at timestamptz);
CREATE TABLE pathways.roles (id uuid PRIMARY KEY, code text, is_active boolean);
CREATE TABLE pathways.permissions (id uuid PRIMARY KEY, code text, is_active boolean);
CREATE TABLE pathways.role_permissions (role_id uuid, permission_id uuid);
CREATE TABLE pathways.system_users (id uuid PRIMARY KEY, organization_id uuid, role_id uuid, auth_user_id uuid, full_name text, account_status pathways.account_status, archived_at timestamptz);
CREATE TABLE pathways.projects (id uuid, organization_id uuid, archived_at timestamptz);
CREATE TABLE pathways.user_project_assignments (id uuid, organization_id uuid, project_id uuid, user_id uuid, status pathways.assignment_status, assigned_at timestamptz, ended_at timestamptz);
CREATE TABLE pathways.synthetic_sessions (subject uuid, session uuid, live boolean);
INSERT INTO pathways.organizations VALUES ('${organization}', 'Synthetic workspace', 'ACTIVE', NULL);
INSERT INTO pathways.roles VALUES ('${user}', 'SYSTEM_ADMINISTRATOR', true);
INSERT INTO pathways.permissions VALUES ('${user}', 'projects.read', true);
INSERT INTO pathways.role_permissions VALUES ('${user}', '${user}');
INSERT INTO pathways.system_users VALUES ('${user}', '${organization}', '${user}', '${subject}', 'Synthetic user', 'ACTIVE', NULL);
INSERT INTO pathways.synthetic_sessions VALUES ('${subject}', '${session}', true);
CREATE FUNCTION pathways.runtime_auth_session_live(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT FROM pathways.synthetic_sessions WHERE subject=$1 AND session=$2 AND live)
$$;
CREATE FUNCTION pathways.runtime_context_organization() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM pathways.system_users
  WHERE auth_user_id = nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    AND id = nullif(current_setting('app.user_id',true),'')::uuid
    AND organization_id = nullif(current_setting('app.organization_id',true),'')::uuid
    AND account_status = 'ACTIVE' AND archived_at IS NULL
$$;
`

// Use the installed engine/model mappings without generated-client .env discovery.
// No AppModule, ConfigModule, Auth client, launcher, or credential helper is loaded.
function offlineServices() {
  const apiRequire = createRequire(path.join(repository, 'apps/api/package.json'))
  check(apiRequire('@prisma/client/package.json').version === '6.19.2', 'VERSION_DRIFT')
  const runtime = apiRequire('@prisma/client/runtime/library')
  const generatedRequire = createRequire(apiRequire.resolve('@prisma/client'))
  const generatedFile = path.join(
    path.dirname(generatedRequire.resolve('.prisma/client/default')),
    'index.js',
  )
  let envPathsDisabled = false
  const module = { exports: {} }
  const runtimeOverride = {
    ...runtime,
    warnEnvConflicts: () => {},
    getPrismaClient(config) {
      envPathsDisabled = true
      return runtime.getPrismaClient({
        ...config,
        relativeEnvPaths: { rootEnvPath: null, schemaEnvPath: null },
      })
    },
  }
  vm.runInNewContext(fs.readFileSync(generatedFile, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: path.dirname(generatedFile),
    __filename: generatedFile,
    process: { env: {}, cwd: () => repository },
    require(specifier) {
      return specifier.includes('@prisma/client/runtime/')
        ? runtimeOverride
        : createRequire(generatedFile)(specifier)
    },
  })
  check(envPathsDisabled, 'ENV_ISOLATION_FAILED')
  const prisma = module.exports
  const ts = apiRequire('typescript')
  const cache = new Map()
  const sources = new Set(
    [
      'prisma/prisma.service',
      'prisma/transaction-diagnostic',
      'modules/auth/session-liveness.service',
      'modules/auth/application-profile.service',
      'modules/auth/authorization-policy',
    ].map((name) => path.join(repository, `apps/api/src/${name}.ts`)),
  )
  function load(file) {
    check(sources.has(file), 'MODULE_REJECTED')
    if (cache.has(file)) return cache.get(file)
    const childModule = { exports: {} }
    cache.set(file, childModule.exports)
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }).outputText
    vm.runInNewContext(compiled, {
      module: childModule,
      exports: childModule.exports,
      process: { env: {} },
      Error,
      Set,
      Date,
      require(specifier) {
        if (specifier === '@prisma/client') return prisma
        if (specifier === '@nestjs/common') return apiRequire(specifier)
        if (specifier === './developer-access') {
          // Fake-value-only boundary: do not evaluate the real designated account constants.
          return { UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i }
        }
        check(specifier.startsWith('.'), 'MODULE_REJECTED')
        return load(path.resolve(path.dirname(file), `${specifier}.ts`))
      },
    })
    return childModule.exports
  }
  const from = (name) => load(path.join(repository, `apps/api/src/${name}.ts`))
  return {
    ...from('prisma/prisma.service'),
    ...from('prisma/transaction-diagnostic'),
    ...from('modules/auth/session-liveness.service'),
    ...from('modules/auth/application-profile.service'),
    Logger: apiRequire('@nestjs/common').Logger,
  }
}

function classify(error) {
  if (error?.code !== 'P2028') return 'OTHER'
  const description = typeof error.meta?.error === 'string' ? error.meta.error : ''
  if (description.includes('Unable to start a transaction in the given time')) return 'ACQUISITION'
  if (description.includes('expired transaction')) return 'EXECUTION_EXPIRED'
  return 'OTHER_P2028'
}

async function heldConnection(client, work) {
  let entered
  let release
  const ready = new Promise((resolve) => {
    entered = resolve
  })
  const hold = new Promise((resolve) => {
    release = resolve
  })
  const holder = client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1`
      entered()
      await hold
    },
    { maxWait: 5_000, timeout: 10_000 },
  )
  // A startup failure must release the caller rather than leave an unresolved latch.
  await Promise.race([
    ready,
    holder.then(() => {
      throw new Error('HOLDER_NOT_ENTERED')
    }),
  ])
  try {
    return await work()
  } finally {
    release()
    await holder
  }
}

async function worker(directory) {
  const observed = []
  const clients = []
  let protectedReads = 0
  const originalRead = fs.readFileSync
  fs.readFileSync = function guardedRead(file, ...args) {
    if (/(^|[/\\])\.env(?:[./\\]|$)|dpapi|credentials|protected/i.test(String(file))) {
      protectedReads++
      throw new Error('PROTECTED_READ_REJECTED')
    }
    return originalRead.call(this, file, ...args)
  }
  try {
    check(!process.env.DATABASE_URL && !process.env.DIRECT_URL, 'ENV_ISOLATION_FAILED')
    const {
      PrismaService,
      SessionLivenessService,
      ApplicationProfileService,
      Logger,
      transactionDiagnostic,
    } = offlineServices()
    Logger.overrideLogger({
      log() {},
      error() {},
      warn(event) {
        observed.push(event)
      },
    })
    function client(limit) {
      // Do not call the application's live runtime-role lifecycle initializer.
      const instance = new PrismaService({
        datasources: { db: { url: targetUrl(limit) } },
        log: [],
      })
      clients.push(instance)
      return instance
    }
    workerStage = 'CLIENT_START'
    const single = client(1)
    const [identity] =
      await single.$queryRaw`SELECT current_setting('data_directory') AS directory, host(inet_server_addr()) AS address, inet_server_port() AS port`
    check(
      path.resolve(identity.directory) === path.join(directory, 'data') &&
        identity.address === '127.0.0.1' &&
        identity.port === port,
      'TARGET_REJECTED',
    )
    const liveness = new SessionLivenessService(single)
    const profiles = new ApplicationProfileService(single)
    workerStage = 'HEALTHY_LIVENESS'
    await liveness.assertLive(subject, session)
    workerStage = 'HEALTHY_PROFILE'
    const profile = await profiles.resolve(subject, organization, user)
    check(profile.permissions.includes('projects.read'), 'HEALTHY_PROFILE_FAILED')
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        index % 2
          ? liveness.assertLive(subject, session)
          : profiles.resolve(subject, organization, user),
      ),
    )

    workerStage = 'ACQUISITION_TEST'
    // Reproduce both actual service diagnostics while the sole connection is held.
    const originalTransaction = single.$transaction.bind(single)
    const categories = []
    single.$transaction = async (...args) => {
      try {
        return await originalTransaction(...args)
      } catch (error) {
        categories.push(classify(error))
        throw error
      }
    }
    let statuses
    await heldConnection(single, async () => {
      statuses = await Promise.all(
        [liveness.assertLive(subject, session), profiles.resolve(subject, organization, user)].map(
          (promise) =>
            promise.then(
              () => 200,
              (error) => error.getStatus?.() ?? 0,
            ),
        ),
      )
    })
    check(
      statuses.every((status) => status === 503) &&
        categories.length === 2 &&
        categories.every((kind) => kind === 'ACQUISITION'),
      'CONTENTION_NOT_REPRODUCED',
    )
    check(
      observed.some(
        (event) =>
          event.event === 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE' &&
          event.stage === 'TRANSACTION_START' &&
          event.reason === 'P2028' &&
          event.transactionFailure === 'ACQUISITION_TIMEOUT',
      ),
      'LIVENESS_MARKER_MISMATCH',
    )
    check(
      observed.some(
        (event) =>
          event.event === 'PATHWAYS_PROFILE_LOOKUP_DENIED' &&
          event.reason === 'P2028' &&
          event.transactionFailure === 'ACQUISITION_TIMEOUT',
      ),
      'PROFILE_MARKER_MISMATCH',
    )
    await liveness.assertLive(subject, session)
    await profiles.resolve(subject, organization, user)

    // Uses the prepared launcher's cap, never executes its credential loader.
    workerStage = 'TWO_POOL_CONTROL'
    const two = client(reviewedConnectionLimit())
    await heldConnection(two, async () => {
      await Promise.all([
        new SessionLivenessService(two).assertLive(subject, session),
        new ApplicationProfileService(two).resolve(subject, organization, user),
      ])
    })

    // Two is a bound, not an unlimited queue or permission fallback. Both
    // occupied connections must still yield the same sanitized 503 response.
    workerStage = 'TWO_POOL_SATURATION'
    await heldConnection(two, () =>
      heldConnection(two, async () => {
        const status = await new SessionLivenessService(two).assertLive(subject, session).then(
          () => 200,
          (error) => error.getStatus?.(),
        )
        check(status === 503, 'SATURATED_POOL_NOT_DENIED')
      }),
    )
    await new SessionLivenessService(two).assertLive(subject, session)

    workerStage = 'EXECUTION_EXPIRY'
    let callbackEntered = false
    let expired = 'NOT_REPRODUCED'
    let boundedExpiry = 'NOT_REPRODUCED'
    try {
      await single.withVerifiedContext(context, async (tx) => {
        callbackEntered = true
        await delay(10_200)
        await tx.$queryRaw`SELECT 1`
      })
    } catch (error) {
      expired = classify(error)
      boundedExpiry = transactionDiagnostic(error).transactionFailure
    }
    check(
      callbackEntered && expired === 'EXECUTION_EXPIRED' && boundedExpiry === 'EXECUTION_EXPIRED',
      'EXPIRY_NOT_REPRODUCED',
    )
    const [cleared] = await single.$queryRaw`
      SELECT coalesce(current_setting('request.jwt.claim.sub',true),'') = ''
        AND coalesce(current_setting('app.organization_id',true),'') = ''
        AND coalesce(current_setting('app.user_id',true),'') = '' AS safe
    `
    check(cleared.safe === true, 'TRANSACTION_CONTEXT_NOT_CLEARED')

    workerStage = 'REVOCATION_CONTROLS'
    await single.$executeRaw`UPDATE pathways.synthetic_sessions SET live = false`
    const revoked = await liveness.assertLive(subject, session).then(
      () => 200,
      (error) => error.getStatus?.(),
    )
    check(revoked === 401, 'REVOCATION_NOT_DENIED')
    await single.$executeRaw`UPDATE pathways.synthetic_sessions SET live = true`
    await single.$executeRaw`UPDATE pathways.system_users SET account_status = 'SUSPENDED'`
    const suspended = await profiles.resolve(subject, organization, user).then(
      () => 200,
      (error) => error.getStatus?.(),
    )
    check(suspended === 403, 'MEMBERSHIP_NOT_DENIED')
    check(protectedReads === 0, 'PROTECTED_READ_ATTEMPTED')
    const safe = observed.every(
      (event) =>
        Object.keys(event).every((key) =>
          ['event', 'stage', 'reason', 'transactionFailure'].includes(key),
        ) &&
        [subject, organization, user, session, 'postgresql://', 'synthetic@'].every(
          (canary) => !JSON.stringify(event).includes(canary),
        ),
    )
    check(safe, 'DIAGNOSTIC_PAYLOAD_REJECTED')
    return {
      status: 'PASS',
      version: '6.19.2',
      healthy: true,
      fastOverlap: true,
      singlePoolAcquisition: true,
      livenessStartMarker: true,
      profileMarker: true,
      failClosed503: true,
      releasedPoolRecovered: true,
      twoPoolControl: true,
      twoPoolSaturationDenied: true,
      executionExpiry: true,
      transactionContextCleared: true,
      revoked401: true,
      suspended403: true,
      sanitizedMarkers: true,
      protectedReads: 0,
      hostedConnections: 0,
    }
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()))
    fs.readFileSync = originalRead
  }
}

async function runIsolatedWorker(directory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename, '--synthetic-worker', directory], {
      cwd: directory,
      env: cleanEnvironment(directory),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderrBytes = 0
    let excessive = false
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > 4_096) {
        excessive = true
        child.kill()
        return
      }
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length
      if (stderrBytes > 4_096) {
        excessive = true
        child.kill()
      }
    })
    const timer = setTimeout(() => child.kill(), 60_000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('WORKER_START_FAILED'))
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      try {
        check(!excessive && stderrBytes === 0, 'WORKER_OUTPUT_REJECTED')
        const result = JSON.parse(stdout)
        if (result.status === 'FAILED') {
          check(/^[A-Z_]{1,60}$/.test(result.reason), 'WORKER_OUTPUT_REJECTED')
          check(/^[A-Z_]{1,60}$/.test(result.stage), 'WORKER_OUTPUT_REJECTED')
          throw new Error(`${result.stage}_${result.reason}`)
        }
        check(code === 0 && result.status === 'PASS', 'WORKER_FAILED')
        resolve(result)
      } catch (error) {
        reject(new Error(/^[A-Z_]{1,60}$/.test(error.message) ? error.message : 'WORKER_FAILED'))
      }
    })
  })
}

if (process.argv[2] === '--synthetic-worker') {
  let result
  try {
    const directory = path.resolve(process.argv[3] ?? '')
    check(
      path.dirname(directory) === path.join(repository, '.tmp') &&
        path.basename(directory).startsWith(prefix),
      'TARGET_REJECTED',
    )
    result = await worker(directory)
  } catch (error) {
    result = {
      status: 'FAILED',
      stage: workerStage,
      reason: /^[A-Z_]{1,60}$/.test(error.message)
        ? error.message
        : error.name === 'ReferenceError'
          ? 'REFERENCE_ERROR'
          : error.name === 'TypeError'
            ? 'TYPE_ERROR'
            : 'SYNTHETIC_OPERATION_FAILED',
    }
    process.exitCode = 1
  }
  process.stdout.write(JSON.stringify(result))
} else {
  const { test } = await import('node:test')
  test('bounded error classification never returns provider text', () => {
    assert.equal(
      classify({
        code: 'P2028',
        meta: { error: 'Unable to start a transaction in the given time SYNTHETIC_SECRET' },
      }),
      'ACQUISITION',
    )
    assert.equal(
      classify({
        code: 'P2028',
        meta: { error: 'query on an expired transaction SYNTHETIC_SECRET' },
      }),
      'EXECUTION_EXPIRED',
    )
    assert.equal(classify({ code: 'P2028', meta: { error: 'SYNTHETIC_SECRET' } }), 'OTHER_P2028')
    assert.equal(classify({ code: 'P2010' }), 'OTHER')
    assert.equal(classify(null), 'OTHER')
  })
  test('synthetic target and environment reject configuration inheritance', () => {
    assert.equal(reviewedConnectionLimit(), 2)
    assert.throws(() => targetUrl(0), /TARGET_REJECTED/)
    assert.throws(() => targetUrl(99), /TARGET_REJECTED/)
    for (const count of [1, 2]) {
      const target = new URL(targetUrl(count))
      assert.equal(target.hostname, '127.0.0.1')
      assert.equal(target.port, String(port))
      assert.equal(target.pathname, `/${database}`)
    }
    const env = cleanEnvironment(repository)
    for (const key of [
      'DATABASE_URL',
      'DIRECT_URL',
      'SHADOW_DATABASE_URL',
      'PGPASSWORD',
      'NODE_OPTIONS',
    ])
      assert.equal(env[key], undefined)
    assert.equal(env.PGPASSFILE, 'NUL')
  })
  test(
    'installed Prisma and real services reproduce contention and distinguish expiry offline',
    { timeout: 100_000 },
    async (t) => {
      check(await portFree(), 'LOCAL_PORT_OCCUPIED')
      const parent = path.join(repository, '.tmp')
      check(fs.existsSync(parent) && fs.realpathSync(parent) === parent, 'SCRATCH_PARENT_REJECTED')
      const directory = fs.mkdtempSync(path.join(parent, prefix))
      const data = path.join(directory, 'data')
      let startAttempted = false
      let result
      try {
        privateCommand(
          'initdb',
          ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'],
          directory,
        )
        check(await portFree(), 'LOCAL_PORT_OCCUPIED')
        startAttempted = true
        const start = spawnSync(
          path.join(pgBin, 'pg_ctl.exe'),
          [
            '-D',
            data,
            '-l',
            path.join(directory, 'postgres.log'),
            '-o',
            `-h 127.0.0.1 -p ${port}`,
            '-w',
            '-t',
            '15',
            'start',
          ],
          {
            cwd: directory,
            env: cleanEnvironment(directory),
            windowsHide: true,
            timeout: 20_000,
            // A daemon may inherit pipe handles; use its private -l file instead.
            stdio: 'ignore',
          },
        )
        if (start.error || start.status !== 0) {
          const logFile = path.join(directory, 'postgres.log')
          const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
          const privateStart = `${start.error?.code ?? ''} ${start.stdout ?? ''} ${start.stderr ?? ''} ${log}`
          const category = /could not create restricted token/i.test(privateStart)
            ? 'LOCAL_START_RESTRICTED_TOKEN_FAILED'
            : /permission denied|access is denied/i.test(log)
              ? 'LOCAL_START_PERMISSION_DENIED'
              : /could not bind|address already in use/i.test(log)
                ? 'LOCAL_START_BIND_FAILED'
                : /shared memory|semaphore/i.test(log)
                  ? 'LOCAL_START_SHARED_MEMORY_FAILED'
                  : 'LOCAL_START_UNCLASSIFIED'
          throw new Error(category)
        }
        privateCommand(
          'createdb',
          ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database],
          directory,
        )
        check(
          path.resolve(sql(directory, "SELECT current_setting('data_directory');")) === data,
          'LOCAL_IDENTITY_REJECTED',
        )
        sql(directory, fixture)
        result = await runIsolatedWorker(directory)
      } finally {
        check(
          fs.realpathSync(directory) === directory &&
            path.dirname(directory) === parent &&
            path.basename(directory).startsWith(prefix),
          'CLEANUP_TARGET_REJECTED',
        )
        if (startAttempted) {
          const stop = spawnSync(
            path.join(pgBin, 'pg_ctl.exe'),
            ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'],
            {
              cwd: directory,
              env: cleanEnvironment(directory),
              windowsHide: true,
              timeout: 20_000,
              stdio: 'ignore',
            },
          )
          const status = spawnSync(path.join(pgBin, 'pg_ctl.exe'), ['-D', data, 'status'], {
            cwd: directory,
            env: cleanEnvironment(directory),
            windowsHide: true,
            timeout: 5_000,
            stdio: 'ignore',
          })
          check(
            !stop.error &&
              !status.error &&
              status.status === 3 &&
              !fs.existsSync(path.join(data, 'postmaster.pid')) &&
              (await portFree()),
            'LOCAL_STOP_UNCERTAIN_DIRECTORY_PRESERVED',
          )
        }
        fs.rmSync(directory, { recursive: true })
        check(!fs.existsSync(directory), 'LOCAL_REMOVAL_FAILED')
        t.diagnostic('localStop=PASS localRemoval=PASS hostedConnections=0 migrations=0')
      }
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'boolean') assert.equal(value, true, key)
      }
      t.diagnostic(JSON.stringify(result))
    },
  )
}
