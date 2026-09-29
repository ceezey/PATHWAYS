// Runs the real hosted-build sequence (scripts/db/hosted-build.mjs, unmodified
// production code path) against a disposable, owned local PostgreSQL cluster
// instead of a hosted target. This is the closest thing to an end-to-end
// rehearsal that does not touch a network.
//
// Gated behind RUN_HOSTED_BUILD_LOCAL_INTEGRATION=1 because it is slow
// (initdb + a real staged prisma migrate deploy sequence) and depends on a
// local PostgreSQL install; `node --test` runs of the fast unit suites should
// not require it.
//
// Safety: this test uses `allowLoopback: true` when validating env, which
// hosted-target.mjs structurally refuses to combine with any non-loopback
// HOSTED_ADMIN_URL/HOSTED_DIRECT_URL (see validateHostedEnv). There is no
// code path here, or in hosted-build.mjs's CLI, that exposes allowLoopback
// to a real invocation; it is only reachable by importing the module
// functions directly, as this test does.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createLiveIO, runHostedBuild } from './hosted-build.mjs'
import { MIGRATIONS_IN_ORDER } from './hosted-plan.mjs'
import { validateHostedEnv } from './hosted-target.mjs'

const shouldRun = process.env.RUN_HOSTED_BUILD_LOCAL_INTEGRATION === '1'
const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '..', '..')
const ref = 'klbtoqdalmcsfjqophty' // the reviewed hosted SQL pins only this ref (and one other); never rewritten
const port = 55461 // distinct from the local Supabase container (54322) and its shadow port (55448)
const pgBin = 'C:/Program Files/PostgreSQL/18/bin'

function findPgBin() {
  if (fs.existsSync(path.join(pgBin, 'initdb.exe'))) return pgBin
  return null
}

async function assertPortFree() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...opts })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr}`)
  }
  return result.stdout
}

test(
  'hosted-build runs the real sequence end to end against a disposable local PostgreSQL cluster',
  { skip: !shouldRun },
  async (t) => {
    const bin = findPgBin()
    if (!bin) {
      t.skip('PostgreSQL binaries not found; cannot run the local integration rehearsal')
      return
    }
    await assertPortFree()
    const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-build-integration-'))
    const data = path.join(owned, 'data')
    const tool = (name) => path.join(bin, `${name}.exe`)
    let started = false
    try {
      run(tool('initdb'), [
        '-D',
        data,
        '-U',
        'supabase_admin',
        '--auth=trust',
        '--encoding=UTF8',
        '--no-locale',
      ])
      fs.appendFileSync(
        path.join(data, 'postgresql.conf'),
        `\nlisten_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\n`,
      )
      run(tool('pg_ctl'), [
        '-D',
        data,
        '-l',
        path.join(owned, 'postgres.log'),
        '-w',
        '-t',
        '30',
        'start',
      ])
      started = true

      const adminUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`
      const directUrl = `postgresql://prisma@127.0.0.1:${port}/postgres`

      // Minimal stand-ins for what a real hosted Supabase project already
      // provides: the ordinary (non-superuser) "postgres" role the reviewed
      // phase6 scripts expect, the machine roles GRANT TEMPORARY references,
      // and the slice of the auth/extensions schemas the migrations touch.
      run(
        tool('psql'),
        [
          '-v',
          'ON_ERROR_STOP=1',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
          '-f',
          '-',
        ],
        {
          input: `
CREATE ROLE postgres LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticator NOLOGIN; CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE supabase_storage_admin NOLOGIN; CREATE ROLE supabase_etl_admin NOLOGIN;
CREATE ROLE supabase_read_only_user NOLOGIN; CREATE ROLE supabase_realtime_admin NOLOGIN;
CREATE ROLE supabase_replication_admin NOLOGIN; CREATE ROLE supabase_privileged_role NOLOGIN;
ALTER DATABASE postgres OWNER TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
CREATE SCHEMA extensions AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid());
CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id), not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE TABLE public._prisma_migrations(id text primary key default extensions.gen_random_uuid()::text,
  checksum text not null default '', finished_at timestamptz, migration_name text not null,
  logs text, rolled_back_at timestamptz, started_at timestamptz not null default now(), applied_steps_count int not null default 1);
`,
        },
      )

      const env = {
        HOSTED_TARGET_REF: ref,
        HOSTED_ADMIN_URL: adminUrl,
        HOSTED_DIRECT_URL: directUrl,
        PRISMA_ROLE_PASSWORD: 'integration-test-prisma-password!!',
        RUNTIME_ROLE_PASSWORD: 'integration-test-runtime-password!!',
      }
      const config = validateHostedEnv(env, { allowLoopback: true })
      const io = createLiveIO({ ref: config.ref })

      await runHostedBuild({
        io,
        config: {
          ref: config.ref,
          adminUrl,
          directUrl,
          prismaPassword: config.prismaPassword,
          runtimePassword: config.runtimePassword,
        },
      })

      const ledgerOut = run(tool('psql'), [
        '-X',
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
        'postgres',
        '-c',
        'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at;',
      ])
      const finished = ledgerOut.trim().split(/\r?\n/).filter(Boolean)
      assert.deepEqual(finished, [...MIGRATIONS_IN_ORDER])
      t.diagnostic(
        `PASS: local integration run finished all ${finished.length} migrations 0000-0041`,
      )
    } finally {
      if (started) {
        run(tool('pg_ctl'), ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop'])
        await assertPortFree()
      }
      fs.rmSync(owned, { recursive: true, force: true })
    }
  },
)
