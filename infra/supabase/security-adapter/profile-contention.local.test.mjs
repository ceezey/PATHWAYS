// Synthetic-only regression. No launcher, .env loading, migrations or hosted access.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanEnvironment,
  fixture,
  offlineServices,
  portFree,
  privateCommand,
  sql,
} from './prisma-contention.local.test.mjs'
import { readBefore } from './profile-read.before.mjs'

const filename = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(filename), '../../..')
const port = 55458
const prefix = 'pathways-profile-contention-'
const pg = 'C:/Program Files/PostgreSQL/18/bin'
const subject = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const sessionId = '00000000-0000-4000-8000-000000000004'
const other = '00000000-0000-4000-8000-000000000005'
const context = { authSubject: subject, organizationId, userId }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let stage = 'SETUP'
function check(condition, reason) {
  if (!condition) throw new Error(reason)
}

async function worker(directory) {
  let protectedReads = 0
  const originalRead = fs.readFileSync
  fs.readFileSync = function (file, ...args) {
    if (/(^|[/\\])\.env(?:[./\\]|$)|dpapi|credential/i.test(String(file))) {
      protectedReads++
      throw new Error('PROTECTED_READ_REJECTED')
    }
    return originalRead.call(this, file, ...args)
  }
  let client
  try {
    check(!process.env.DATABASE_URL && !process.env.DIRECT_URL, 'ENV_REJECTED')
    const { PrismaService, SessionLivenessService, readApplicationProfile, policy, Logger } =
      offlineServices()
    const events = []
    Logger.overrideLogger({
      log() {},
      error() {},
      warn(event) {
        events.push(event)
      },
    })
    const url = new URL(`postgresql://profile_runtime:synthetic@127.0.0.1:${port}/p2028_synthetic`)
    url.search = 'sslmode=disable&connect_timeout=5&connection_limit=2'
    client = new PrismaService({
      datasources: { db: { url: url.href } },
      log: [{ emit: 'event', level: 'query' }],
    })
    const [identity] =
      await client.$queryRaw`SELECT current_user = 'profile_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=55458 AS safe FROM pg_roles r WHERE rolname=current_user`
    check(identity.safe, 'RUNTIME_TARGET_REJECTED')
    const before = (tx) => readBefore(tx, subject, organizationId, userId, policy)
    const after = (tx) => readApplicationProfile(tx, subject, organizationId, userId)
    const normalize = (profile) => ({
      ...profile,
      // The application reader executes in an isolated VM to block .env reads.
      // Compare role VALUES, not the VM's distinct Array prototype.
      roles: [...profile.roles],
      permissions: [...profile.permissions].sort(),
      assignedProjectIds: [...profile.assignedProjectIds].sort(),
    })
    let queries = 0
    client.$on('query', (event) => {
      // Count only; no SQL or parameter contents leave the callback.
      if (/^\s*SELECT\b/i.test(event.query)) queries++
    })
    async function measured(read) {
      return client.withVerifiedContext(context, async (tx) => {
        const start = queries
        const profile = await read(tx)
        return { count: queries - start, profile: normalize(profile) }
      })
    }
    stage = 'BASELINE_PROFILE'
    const baseline = await measured(before)
    stage = 'CORRECTED_PROFILE'
    const corrected = await measured(after)
    stage = 'EQUIVALENCE'
    assert.deepEqual(corrected.profile, baseline.profile)
    check(baseline.count > corrected.count && corrected.count === 2, 'QUERY_REDUCTION_NOT_PROVEN')
    const [unscoped] =
      await client.$queryRaw`SELECT count(*)::int AS count FROM pathways.system_users`
    check(unscoped.count === 0, 'RLS_BYPASSED')

    // Same latency model for both implementations: each measured data SELECT
    // costs 950 ms. Real Prisma transactions/pool/deadlines, simulated remote
    // round-trip latency. NOT a hosted latency measurement or a TCP simulation.
    async function overlap(read, count) {
      const ready = []
      const holders = Array.from({ length: 2 }, () => {
        let entered
        ready.push(
          new Promise((resolve) => {
            entered = resolve
          }),
        )
        return client.withVerifiedContext(context, async (tx) => {
          const result = await read(tx)
          entered()
          await delay(count * 950)
          return result
        })
      })
      try {
        await Promise.race([
          Promise.all(ready),
          Promise.all(holders).then(() => {
            throw new Error('HOLDER_SETUP_FAILED')
          }),
        ])
        return await new SessionLivenessService(client).assertLive(subject, sessionId).then(
          () => 200,
          (error) => error.getStatus?.() ?? 0,
        )
      } finally {
        await Promise.allSettled(holders)
      }
    }
    stage = 'BASELINE_CONTENTION'
    check((await overlap(before, baseline.count)) === 503, 'BASELINE_NOT_REPRODUCED')
    check(
      events.some(
        (e) =>
          e.event === 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE' &&
          e.stage === 'TRANSACTION_START' &&
          e.reason === 'P2028' &&
          e.transactionFailure === 'ACQUISITION_TIMEOUT',
      ),
      'BASELINE_MARKER_MISSING',
    )
    stage = 'CORRECTED_CONTENTION'
    check((await overlap(after, corrected.count)) === 200, 'CORRECTION_NOT_PROVEN')

    stage = 'SECURITY_EQUIVALENCE'
    let cases = 0
    const compare = async () => {
      const run = (read) =>
        measured(read).then(
          (r) => r.profile,
          () => 'DENIED',
        )
      assert.deepEqual(await run(after), await run(before))
      cases++
    }
    for (const role of Object.keys(policy.rolePermissions)) {
      check(/^[A-Z_]+$/.test(role), 'ROLE_FIXTURE_REJECTED')
      sql(directory, `UPDATE pathways.roles SET code='${role}';`)
      await compare()
    }
    sql(directory, "UPDATE pathways.roles SET code='SYSTEM_ADMINISTRATOR';")
    const changes = [
      [
        "UPDATE pathways.system_users SET account_status='SUSPENDED'",
        "UPDATE pathways.system_users SET account_status='ACTIVE'",
      ],
      [
        'UPDATE pathways.system_users SET archived_at=now()',
        'UPDATE pathways.system_users SET archived_at=NULL',
      ],
      [
        "UPDATE pathways.organizations SET status='INACTIVE'",
        "UPDATE pathways.organizations SET status='ACTIVE'",
      ],
      [
        'UPDATE pathways.organizations SET archived_at=now()',
        'UPDATE pathways.organizations SET archived_at=NULL',
      ],
      ['UPDATE pathways.roles SET is_active=false', 'UPDATE pathways.roles SET is_active=true'],
      [
        'UPDATE pathways.permissions SET is_active=false',
        'UPDATE pathways.permissions SET is_active=true',
      ],
      [
        "UPDATE pathways.roles SET code='UNKNOWN'",
        "UPDATE pathways.roles SET code='SYSTEM_ADMINISTRATOR'",
      ],
    ]
    for (const [change, undo] of changes) {
      sql(directory, `${change};`)
      await compare()
      sql(directory, `${undo};`)
    }
    // Assignments remain a separate, fresh read with every original predicate.
    sql(
      directory,
      `INSERT INTO pathways.projects VALUES ('${other}','${organizationId}',NULL);
      INSERT INTO pathways.user_project_assignments VALUES ('${other}','${organizationId}','${other}','${userId}','ACTIVE',now()-interval '1 day',NULL);`,
    )
    await compare()
    check((await measured(after)).profile.assignedProjectIds.length === 1, 'ASSIGNMENT_MISSING')
    for (const [change, undo] of [
      [
        "UPDATE pathways.user_project_assignments SET status='ENDED'",
        "UPDATE pathways.user_project_assignments SET status='ACTIVE'",
      ],
      [
        'UPDATE pathways.user_project_assignments SET ended_at=now()',
        'UPDATE pathways.user_project_assignments SET ended_at=NULL',
      ],
      [
        "UPDATE pathways.user_project_assignments SET assigned_at=now()+interval '1 day'",
        "UPDATE pathways.user_project_assignments SET assigned_at=now()-interval '1 day'",
      ],
      [
        'UPDATE pathways.projects SET archived_at=now()',
        'UPDATE pathways.projects SET archived_at=NULL',
      ],
      [
        `UPDATE pathways.projects SET organization_id='${other}'`,
        `UPDATE pathways.projects SET organization_id='${organizationId}'`,
      ],
    ]) {
      sql(directory, `${change};`)
      await compare()
      check(
        (await measured(after)).profile.assignedProjectIds.length === 0,
        'STALE_ASSIGNMENT_REUSED',
      )
      sql(directory, `${undo};`)
    }
    for (const [auth, org, user] of [
      [other, organizationId, userId],
      [subject, other, userId],
      [subject, organizationId, other],
    ]) {
      const run = (read) =>
        client
          .withVerifiedContext(context, (tx) => read(tx, auth, org, user, policy))
          .then(
            () => 'ALLOWED',
            () => 'DENIED',
          )
      check(
        (await run(readApplicationProfile)) === 'DENIED' && (await run(readBefore)) === 'DENIED',
        'CROSS_CONTEXT_ALLOWED',
      )
      cases++
    }
    sql(directory, 'UPDATE pathways.synthetic_sessions SET live=false;')
    const revoked = await new SessionLivenessService(client).assertLive(subject, sessionId).then(
      () => 200,
      (e) => e.getStatus?.(),
    )
    check(revoked === 401, 'SESSION_REVOCATION_BYPASSED')
    check(protectedReads === 0, 'PROTECTED_READ_ATTEMPTED')
    check(
      events.every(
        (e) =>
          Object.keys(e).every((key) =>
            ['event', 'stage', 'reason', 'transactionFailure'].includes(key),
          ) && !JSON.stringify(e).includes('00000000-'),
      ),
      'DIAGNOSTIC_LEAK',
    )
    return {
      status: 'PASS',
      beforeProfileSelects: baseline.count,
      afterProfileSelects: corrected.count,
      baselineAcquisition503: true,
      correctedLiveness200: true,
      securityEquivalenceCases: cases,
      revokedSession401: true,
      runtimeRlsPreserved: true,
      protectedReads: 0,
      hostedConnections: 0,
    }
  } finally {
    if (client) await client.$disconnect()
    fs.readFileSync = originalRead
  }
}

if (process.argv[2] === '--profile-worker') {
  let result
  try {
    const directory = fs.realpathSync(process.argv[3])
    check(
      path.dirname(directory) === path.join(root, '.tmp') &&
        path.basename(directory).startsWith(prefix),
      'WORKER_TARGET_REJECTED',
    )
    result = await worker(directory)
  } catch (error) {
    result = {
      status: 'FAILED',
      stage,
      reason: /^P\d{4}$/.test(error.code ?? '')
        ? `${error.code}_${/^[0-9A-Z]{5}$/.test(error.meta?.code ?? '') ? error.meta.code : 'NO_SQLSTATE'}`
        : /^[A-Z_]{1,60}$/.test(error.message)
          ? error.message
          : 'SYNTHETIC_ASSERTION_FAILED',
    }
    process.exitCode = 1
  }
  process.stdout.write(JSON.stringify(result))
} else {
  const { test } = await import('node:test')
  test(
    'profile join preserves runtime checks and reduces two-connection contention',
    { timeout: 180_000 },
    async (t) => {
      check(await portFree(), 'LOCAL_PORT_BUSY')
      const parent = fs.realpathSync(path.join(root, '.tmp'))
      check(parent === path.join(root, '.tmp'), 'SCRATCH_PARENT_REJECTED')
      const directory = fs.mkdtempSync(path.join(parent, prefix))
      const data = path.join(directory, 'data')
      let startAttempted = false
      try {
        privateCommand(
          'initdb',
          [
            '-D',
            data,
            '-U',
            'postgres',
            '-A',
            'trust',
            '--encoding=UTF8',
            '--locale=C',
            '--no-sync',
          ],
          directory,
        )
        check(await portFree(), 'LOCAL_PORT_BUSY')
        startAttempted = true
        privateCommand(
          'pg_ctl',
          [
            '-D',
            data,
            '-l',
            path.join(directory, 'postgres.log'),
            '-o',
            `-h 127.0.0.1 -p ${port}`,
            '-w',
            '-t',
            '20',
            'start',
          ],
          directory,
        )
        privateCommand(
          'createdb',
          ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'p2028_synthetic'],
          directory,
        )
        check(
          path.resolve(sql(directory, "SELECT current_setting('data_directory');")) === data,
          'LOCAL_TARGET_REJECTED',
        )
        sql(directory, fixture)
        sql(
          directory,
          `CREATE ROLE profile_runtime LOGIN NOBYPASSRLS;
        GRANT USAGE ON SCHEMA pathways TO profile_runtime;
        GRANT SELECT ON ALL TABLES IN SCHEMA pathways TO profile_runtime;
        ALTER TABLE pathways.system_users ENABLE ROW LEVEL SECURITY;
        CREATE POLICY synthetic_profile ON pathways.system_users TO profile_runtime USING (
          auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
          AND organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
        ALTER TABLE pathways.projects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY synthetic_projects ON pathways.projects TO profile_runtime USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
        ALTER TABLE pathways.user_project_assignments ENABLE ROW LEVEL SECURITY;
        CREATE POLICY synthetic_assignments ON pathways.user_project_assignments TO profile_runtime USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);`,
        )
        const result = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [filename, '--profile-worker', directory], {
            cwd: directory,
            env: cleanEnvironment(directory),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          let output = ''
          let stderrBytes = 0
          let timedOut = false
          const timeout = setTimeout(() => {
            timedOut = true
            child.kill()
          }, 100_000)
          child.stdout.on('data', (chunk) => {
            if (output.length + chunk.length > 4096) child.kill()
            else output += chunk.toString()
          })
          child.stderr.on('data', (chunk) => {
            stderrBytes += chunk.length
            if (stderrBytes > 4096) child.kill()
          })
          child.once('error', () => {
            clearTimeout(timeout)
            reject(new Error('WORKER_START_FAILED'))
          })
          child.once('close', (code) => {
            clearTimeout(timeout)
            try {
              check(!timedOut && stderrBytes === 0, 'WORKER_OUTPUT_REJECTED')
              const result = JSON.parse(output)
              if (result.status === 'FAILED') throw new Error(`${result.stage}_${result.reason}`)
              check(code === 0 && result.status === 'PASS', 'WORKER_FAILED')
              resolve(result)
            } catch (e) {
              reject(new Error(/^[A-Z0-9_]{1,110}$/.test(e.message) ? e.message : 'WORKER_FAILED'))
            }
          })
        })
        t.diagnostic(JSON.stringify(result))
      } finally {
        check(
          fs.realpathSync(directory) === directory &&
            path.dirname(directory) === parent &&
            path.basename(directory).startsWith(prefix),
          'CLEANUP_TARGET_REJECTED',
        )
        if (startAttempted) {
          privateCommand('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '20', 'stop'], directory)
          const stopped = spawnSync(path.join(pg, 'pg_ctl.exe'), ['-D', data, 'status'], {
            cwd: directory,
            env: cleanEnvironment(directory),
            windowsHide: true,
            stdio: 'ignore',
            timeout: 5000,
          })
          check(
            !stopped.error &&
              stopped.status === 3 &&
              !fs.existsSync(path.join(data, 'postmaster.pid')) &&
              (await portFree()),
            'STOP_UNCERTAIN_DIRECTORY_PRESERVED',
          )
        }
        fs.rmSync(directory, { recursive: true })
        t.diagnostic('localStop=PASS localRemoval=PASS hostedConnections=0 migrations=0')
      }
    },
  )
}
