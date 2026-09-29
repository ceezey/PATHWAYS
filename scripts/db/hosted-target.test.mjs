import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  HostedEnvError,
  assertEnvFileLocation,
  isLoopbackHostname,
  parseEnvFile,
  redactUrl,
  validateHostedEnv,
} from './hosted-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ref = 'klbtoqdalmcsfjqophty'
const goodEnv = () => ({
  HOSTED_TARGET_REF: ref,
  HOSTED_ADMIN_URL: `postgresql://postgres.${ref}:secret-admin-pw@aws-0-region.pooler.supabase.com:5432/postgres`,
  HOSTED_DIRECT_URL: `postgresql://prisma.${ref}:secret-direct-pw@db.${ref}.supabase.co:5432/postgres`,
  PRISMA_ROLE_PASSWORD: 'a'.repeat(24),
  RUNTIME_ROLE_PASSWORD: 'b'.repeat(24),
})

test('validateHostedEnv accepts a well-formed hosted env', () => {
  const config = validateHostedEnv(goodEnv())
  assert.equal(config.ref, ref)
  assert.equal(config.prismaPassword.length, 24)
})

test('validateHostedEnv rejects a ref outside the one-item allowlist', () => {
  const env = { ...goodEnv(), HOSTED_TARGET_REF: 'someotherref00000000' }
  assert.throws(() => validateHostedEnv(env), HostedEnvError)
})

test('validateHostedEnv rejects an admin URL whose user/host do not contain the ref', () => {
  const env = {
    ...goodEnv(),
    HOSTED_ADMIN_URL: 'postgresql://postgres:pw@db.unrelated.supabase.co:5432/postgres',
  }
  assert.throws(() => validateHostedEnv(env), /HOSTED_ADMIN_URL/)
})

test('validateHostedEnv rejects a direct URL whose user is not prisma or prisma.<ref>', () => {
  const env = {
    ...goodEnv(),
    HOSTED_DIRECT_URL: `postgresql://someone:pw@db.${ref}.supabase.co:5432/postgres`,
  }
  assert.throws(() => validateHostedEnv(env), /HOSTED_DIRECT_URL user/)
})

test('validateHostedEnv accepts direct URL user exactly "prisma"', () => {
  const env = {
    ...goodEnv(),
    HOSTED_DIRECT_URL: `postgresql://prisma:pw@db.${ref}.supabase.co:5432/postgres`,
  }
  const config = validateHostedEnv(env)
  assert.equal(config.directUrl.username, 'prisma')
})

test('validateHostedEnv rejects a direct URL host that does not match the ref', () => {
  const env = {
    ...goodEnv(),
    HOSTED_DIRECT_URL: `postgresql://prisma.${ref}:pw@db.other.supabase.co:5432/postgres`,
  }
  assert.throws(() => validateHostedEnv(env), /HOSTED_DIRECT_URL host/)
})

test('validateHostedEnv rejects passwords shorter than 24 characters', () => {
  const env = { ...goodEnv(), PRISMA_ROLE_PASSWORD: 'short' }
  assert.throws(() => validateHostedEnv(env), /PRISMA_ROLE_PASSWORD/)
})

test('validateHostedEnv reports every problem at once, not just the first', () => {
  const env = { ...goodEnv(), HOSTED_TARGET_REF: 'bad', PRISMA_ROLE_PASSWORD: 'short' }
  try {
    validateHostedEnv(env)
    assert.fail('expected throw')
  } catch (error) {
    assert.ok(error instanceof HostedEnvError)
    assert.ok(error.problems.some((p) => p.includes('HOSTED_TARGET_REF')))
    assert.ok(error.problems.some((p) => p.includes('PRISMA_ROLE_PASSWORD')))
  }
})

test('validateHostedEnv with allowLoopback rejects a non-loopback URL regardless of intent', () => {
  const env = goodEnv() // real hosted-looking URLs, not loopback
  assert.throws(() => validateHostedEnv(env, { allowLoopback: true }), /loopback/)
})

test('validateHostedEnv with allowLoopback accepts loopback URLs and ignores ref/user matching', () => {
  const env = {
    HOSTED_TARGET_REF: ref,
    HOSTED_ADMIN_URL: 'postgresql://postgres:pw@127.0.0.1:55999/postgres',
    HOSTED_DIRECT_URL: 'postgresql://prisma:pw@127.0.0.1:55999/postgres',
    PRISMA_ROLE_PASSWORD: 'a'.repeat(24),
    RUNTIME_ROLE_PASSWORD: 'b'.repeat(24),
  }
  const config = validateHostedEnv(env, { allowLoopback: true })
  assert.equal(config.adminUrl.hostname, '127.0.0.1')
})

test('isLoopbackHostname recognizes loopback forms only', () => {
  assert.ok(isLoopbackHostname('127.0.0.1'))
  assert.ok(isLoopbackHostname('localhost'))
  assert.ok(isLoopbackHostname('::1'))
  assert.ok(!isLoopbackHostname('db.klbtoqdalmcsfjqophty.supabase.co'))
  assert.ok(!isLoopbackHostname('10.0.0.5'))
})

test('parseEnvFile reads KEY=VALUE pairs, ignoring comments and blank lines, stripping quotes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hosted-env-'))
  const file = path.join(dir, 'sample.env')
  writeFileSync(
    file,
    [
      '# a comment',
      '',
      'HOSTED_TARGET_REF=klbtoqdalmcsfjqophty',
      'PRISMA_ROLE_PASSWORD="has spaces here yes"',
    ].join('\n'),
  )
  try {
    const env = parseEnvFile(file)
    assert.equal(env.HOSTED_TARGET_REF, 'klbtoqdalmcsfjqophty')
    assert.equal(env.PRISMA_ROLE_PASSWORD, 'has spaces here yes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assertEnvFileLocation refuses an env file inside the tracked repo tree', () => {
  assert.throws(
    () => assertEnvFileLocation(path.join(root, 'docs', 'fake.env'), root),
    HostedEnvError,
  )
})

test('assertEnvFileLocation accepts an env file under the repo .tmp/ directory', () => {
  assert.doesNotThrow(() => assertEnvFileLocation(path.join(root, '.tmp', 'hosted.env'), root))
})

test('assertEnvFileLocation accepts an env file entirely outside the repo', () => {
  const outside = path.join(os.tmpdir(), 'somewhere-else', 'hosted.env')
  assert.doesNotThrow(() => assertEnvFileLocation(outside, root))
})

test('redactUrl removes the password but keeps the rest of the URL', () => {
  const redacted = redactUrl('postgresql://prisma:supersecret@db.example.com:5432/postgres')
  assert.ok(!redacted.includes('supersecret'))
  assert.ok(redacted.includes('REDACTED'))
  assert.ok(redacted.includes('db.example.com'))
})

test('redactUrl never throws on unparseable input', () => {
  assert.equal(redactUrl('not a url'), '[unparseable URL, redacted]')
})
