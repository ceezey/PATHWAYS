import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { psqlUrlArgs } from './defense-snapshot-io.mjs'
import { assertDistinctStorage } from './defense-snapshot-storage.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const cli = (...args) =>
  spawnSync(process.execPath, [path.join(root, 'scripts/db/defense-snapshot.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  })

test('an unknown command prints usage and exits 2', () => {
  for (const command of ['bogus', 'toString']) {
    const run = cli(command)
    assert.equal(run.status, 2)
    assert.match(
      run.stderr,
      /Usage: node scripts\/db\/defense-snapshot\.mjs mirror\|dump\|restore\|storage/,
    )
  }
})

test('restore needs exactly one target', () => {
  assert.match(cli('restore').stderr, /exactly one of --env-file or --test-local/)
  const both = cli('restore', '--test-local', '--env-file', 'package.json')
  assert.equal(both.status, 1)
  assert.match(both.stderr, /exactly one of --env-file or --test-local/)
})

test('restore refuses --today on a hosted target', () => {
  const run = cli('restore', '--env-file', 'package.json', '--today', '2026-10-09')
  assert.equal(run.status, 1)
  assert.match(run.stderr, /--today is only allowed with --test-local/)
})

test('restore refuses an env file inside the repo outside .tmp', () => {
  assert.match(cli('restore', '--env-file', 'package.json').stderr, /must be under \.tmp/)
})

test('mirror needs exactly one identity source', () => {
  assert.match(cli('mirror').stderr, /exactly one of --env-file or --identities/)
  assert.match(
    cli('mirror', '--env-file', 'package.json', '--identities', 'x.json').stderr,
    /exactly one of --env-file or --identities/,
  )
})

test('storage copy refuses a target equal to the source', () => {
  const api = { url: 'http://127.0.0.1:54321', key: 'k' }
  assert.throws(
    () => assertDistinctStorage(api, { ...api, url: 'http://127.0.0.1:54321/' }),
    /same project/,
  )
  assert.doesNotThrow(() =>
    assertDistinctStorage(api, { url: 'https://example.supabase.co', key: 'k' }),
  )
})

test('storage --test-local is refused before any copy', () => {
  assert.match(cli('storage', '--test-local').stderr, /same project/)
})

test('psqlUrlArgs keeps the password out of the docker args', () => {
  const secret = 'p@ss/w0rd:x'
  const { args, password } = psqlUrlArgs(
    `postgresql://postgres.ref:${encodeURIComponent(secret)}@host.example:5432/postgres?sslmode=require`,
  )
  assert.equal(password, secret)
  assert.ok(!args.join(' ').includes(secret))
  assert.ok(!args.join(' ').includes(encodeURIComponent(secret)))
  assert.ok(args.includes('-i') && args.includes('PGPASSWORD') && !args.includes('sh'))
})

test('a flag without a value is an error', () => {
  assert.match(cli('restore', '--test-local', '--today').stderr, /--today needs a value/)
  assert.match(cli('restore', '--test-local', '--today', '--skip-storage').stderr, /needs a value/)
})

test('hosted restore without a service role key fails before any docker call', () => {
  const ref = 'klbtoqdalmcsfjqophty'
  const pg = (role) => `postgresql://${role}.${ref}:pw@aws-0-x.pooler.supabase.com:5432/postgres`
  const lines = [
    ['SUPABASE_URL', `https://${ref}.supabase.co`],
    ['DATABASE_URL', pg('pathways_runtime')],
    ['DIRECT_URL', pg('prisma')],
    ['HOSTED_ADMIN_URL', pg('postgres')],
  ].map((pair) => pair.join('='))
  const dir = mkdtempSync(path.join(tmpdir(), 'snapshot-'))
  const envFile = path.join(dir, 'x.env')
  writeFileSync(envFile, `${lines.join('\n')}\n`)
  try {
    const run = cli('restore', '--env-file', envFile)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /SUPABASE_SERVICE_ROLE_KEY is required/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
