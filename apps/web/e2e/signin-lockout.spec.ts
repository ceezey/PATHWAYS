import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { localDatabase } from '../../../scripts/db/local-target.mjs'

const api = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000/api'
const web = 'http://127.0.0.1:3000'
const shell = process.platform === 'win32'
const email = 'lockout-probe@example.test'
const email2 = 'lockout-probe-2@example.test'
const passwords: Record<string, string> = {}
let provider = { url: '', anonKey: '' }

// The suite needs the disposable local database container.
const hasLocalDb = (() => {
  try {
    return (
      execFileSync('docker', ['ps', '--filter', `name=${localDatabase.container}`, '-q'], {
        encoding: 'utf8',
      }).trim() !== ''
    )
  } catch {
    return false
  }
})()
test.skip(!hasLocalDb, 'Local Supabase database container is not running')

test.describe.configure({ mode: 'serial' })

// Owner-role SQL on the disposable local container, as the runtime SQL tests do.
const ownerSql = (sql: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-e',
      `PGPASSWORD=${localDatabase.prismaPassword}`,
      localDatabase.container,
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      'prisma',
      '-d',
      'postgres',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  )
const clearLockouts = () =>
  ownerSql(
    `DELETE FROM pathways.signin_lockouts WHERE identifier_hash IN (pathways.signin_lockout_hash('${email}'),pathways.signin_lockout_hash('${email2}'))`,
  )

test.beforeAll(async () => {
  test.setTimeout(120_000)
  const status = JSON.parse(
    (() => {
      const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
        encoding: 'utf8',
        shell,
      })
      return out.slice(out.indexOf('{'))
    })(),
  )
  provider = { url: status.API_URL, anonKey: status.ANON_KEY }
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const address of [email, email2]) {
    passwords[address] = randomBytes(18).toString('base64url')
    const existing = data?.users.find((u) => u.email === address)
    const attrs = { password: passwords[address], email_confirm: true }
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, attrs)
      : await admin.auth.admin.createUser({ email: address, ...attrs })
    if (result.error) throw new Error(`Could not prepare probe account ${address}`)
  }
  const dir = path.resolve(__dirname, '../../../.tmp/local-seed')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'signin-lockout-probe.json'), JSON.stringify(passwords))
  clearLockouts()
})

test.afterAll(() => clearLockouts())

const signIn = (request: import('@playwright/test').APIRequestContext, e: string, p: string) =>
  request.post(`${api}/auth/sign-in`, { data: { email: e, password: p } })

test('five failures lock and the correct password is still refused', async ({ request, page }) => {
  test.setTimeout(90_000)
  const directGrant = () =>
    request.post(`${provider.url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: provider.anonKey },
      data: { email, password: passwords[email] },
    })
  // Control: before locking, the same direct grant succeeds.
  expect((await directGrant()).status()).toBe(200)
  for (let i = 0; i < 5; i++) {
    const r = await signIn(request, email, 'wrong-password')
    // The fifth failure itself returns the lock response.
    expect(r.status()).toBe(i < 4 ? 401 : 429)
  }
  const locked = await signIn(request, email, passwords[email])
  expect(locked.status()).toBe(429)
  expect((await locked.json()).code).toBe('SIGN_IN_LOCKED')

  // The password hook refuses a direct grant that skips the API (migration 0052).
  const direct = await directGrant()
  expect(direct.status()).toBe(400)
  expect(await direct.text()).toContain('Sign-in is temporarily locked')

  await page.goto(`${web}/staff/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/locked|too many/i).first()).toBeVisible()
})

test('unknown and known emails get the same failure response', async ({ request }) => {
  const a = await signIn(request, 'nobody@example.test', 'x')
  const b = await signIn(request, email2, 'x')
  expect(a.status()).toBe(b.status())
  expect(await a.text()).toBe(await b.text())
})

test('an expired lock lets the correct password sign in', async ({ request }) => {
  clearLockouts()
  for (let i = 0; i < 5; i++) await signIn(request, email2, 'wrong-password')
  expect((await signIn(request, email2, passwords[email2])).status()).toBe(429)
  ownerSql(
    `UPDATE pathways.signin_lockouts SET locked_until = now() - interval '1 minute' WHERE identifier_hash = pathways.signin_lockout_hash('${email2}')`,
  )
  const ok = await signIn(request, email2, passwords[email2])
  expect(ok.status()).toBe(200)
  // A success resets the counter, so the next wrong attempt is failure number one.
  expect((await signIn(request, email2, 'wrong-password')).status()).toBe(401)
  const row = ownerSql(
    `SELECT failed_attempts, locked_until IS NULL AS unlocked FROM pathways.signin_lockouts WHERE identifier_hash = pathways.signin_lockout_hash('${email2}')`,
  )
  expect(row).toMatch(/1 +\| +t/)
})
