import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertIdentities,
  assertRestoreTarget,
  assertSameMigration,
  libpqUrl,
} from './defense-snapshot-target.mjs'

const ref = 'klbtoqdalmcsfjqophty'
const pooler = `postgresql://postgres.${ref}:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
const direct = `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`
const org = '11111111-1111-4111-8111-111111111111'
const identities = () => ({
  organization: { id: org, code: 'PIP' },
  users: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      auth_user_id: '33333333-3333-4333-8333-333333333333',
      organization_id: org,
      role_code: 'SYSTEM_ADMINISTRATOR',
      email: 'admin@pathways.example',
    },
  ],
})

test('assertRestoreTarget accepts postgres on the devV2 pooler or direct host', () => {
  assert.equal(assertRestoreTarget({ HOSTED_ADMIN_URL: pooler }), pooler)
  assert.equal(assertRestoreTarget({ HOSTED_ADMIN_URL: direct }), direct)
})

test('assertRestoreTarget refuses missing, invalid, other-role, other-project and loopback URLs', () => {
  assert.throws(() => assertRestoreTarget({}), /HOSTED_ADMIN_URL/)
  assert.throws(() => assertRestoreTarget({ HOSTED_ADMIN_URL: 'not a url' }), /not a valid URL/)
  assert.throws(
    () => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler.replace('postgres.', 'prisma.') }),
    /username/,
  )
  assert.throws(
    () => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler.replaceAll(ref, 'a'.repeat(20)) }),
    /username/,
  )
  assert.throws(
    () =>
      assertRestoreTarget({
        HOSTED_ADMIN_URL: 'postgresql://postgres:pw@127.0.0.1:54322/postgres',
      }),
    /host must be/,
  )
})

test('libpqUrl keeps only sslmode', () => {
  assert.equal(
    libpqUrl(`${pooler}?pgbouncer=true&connection_limit=1&schema=public&sslmode=require`),
    `${pooler}?sslmode=require`,
  )
  assert.equal(libpqUrl(pooler), pooler)
})

test('assertIdentities accepts a mirrored identities file, with or without an auth link', () => {
  assert.doesNotThrow(() => assertIdentities(identities()))
  const unlinked = identities()
  unlinked.users[0].auth_user_id = null
  assert.doesNotThrow(() => assertIdentities(unlinked))
})

test('assertIdentities rejects bad rows without echoing emails', () => {
  const bad = identities()
  bad.users[0].organization_id = '44444444-4444-4444-8444-444444444444'
  assert.throws(
    () => assertIdentities(bad),
    (error) => /user 0 is invalid/.test(error.message) && !error.message.includes('@'),
  )
  assert.throws(() => assertIdentities({ ...identities(), users: [] }), /no users/)
  assert.throws(() => assertIdentities({ users: [] }), /organization id/)
})

test('assertRestoreTarget requires session port 5432 on the pooler', () => {
  assert.throws(
    () => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler.replace(':5432', ':6543') }),
    /5432/,
  )
  assert.doesNotThrow(() => assertRestoreTarget({ HOSTED_ADMIN_URL: pooler }))
})

test('assertSameMigration compares the local and hosted latest migrations', () => {
  assert.doesNotThrow(() => assertSameMigration('0063_x\n', '0063_x'))
  assert.throws(() => assertSameMigration('0063_x', '0062_y'), /differ/)
  assert.throws(() => assertSameMigration('', ''), /differ/)
})
