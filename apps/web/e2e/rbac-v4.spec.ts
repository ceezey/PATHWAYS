import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { localDatabase } from '../../../scripts/db/local-target.mjs'

const api = process.env.PATHWAYS_LOCAL_API_URL ?? 'http://127.0.0.1:4000/api'
const shell = process.platform === 'win32'
const activityCode = 'E2E-V4-RBAC'
const activityTitle = 'RBAC v4 probe activity'
const officerEmail = 'liza.bautista@pathways.example'
const managerEmail = 'ana.delacruz@pathways.example'

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

// Owner-role query on the disposable local container; returns bare rows.
const ownerQuery = (sql: string) =>
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
      '-At',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim()

// RFC 6238 SHA-1 code for a base32 secret; the secret never leaves this process.
const totpCode = (secret: string, offsetSteps = 0) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const at = (hmac[19] ?? 0) & 0xf
  const value = (hmac.readUInt32BE(at) & 0x7fffffff) % 1_000_000
  return String(value).padStart(6, '0')
}

interface Actor {
  password: string
  secret: string
  token: string
}
const actors: Record<string, Actor> = {}
let projectId = ''
let officerId = ''
let activityId = ''
let managerId = ''
let organizationId = ''

// Resets the account password and TOTP factor, then enrolls and verifies a fresh factor.
async function prepareActor(
  admin: ReturnType<typeof createClient>,
  url: string,
  anonKey: string,
  email: string,
) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const user = data?.users.find((u) => u.email === email)
  if (!user) throw new Error(`Local seed account is missing: ${email}`)
  const password = randomBytes(18).toString('base64url')
  const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
  if (updated.error) throw new Error(`Could not prepare ${email}`)
  const factors = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  for (const factor of factors.data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id })
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw new Error(`Could not sign in ${email}`)
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' })
  if (enrolled.error) throw new Error(`Could not enroll a factor for ${email}`)
  const secret = enrolled.data.totp.secret
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totpCode(secret),
  })
  if (verified.error) throw new Error(`Could not verify the factor for ${email}`)
  const session = await client.auth.getSession()
  actors[email] = { password, secret, token: session.data.session?.access_token ?? '' }
}

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
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  for (const email of [officerEmail, managerEmail]) {
    await prepareActor(admin, status.API_URL, status.ANON_KEY, email)
  }
  projectId = ownerQuery(
    `SELECT p.id FROM pathways.projects p JOIN pathways.user_project_assignments a ON a.project_id=p.id JOIN pathways.system_users u ON u.id=a.user_id WHERE u.email='${managerEmail}' LIMIT 1`,
  )
  officerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${officerEmail}'`)
  managerId = ownerQuery(`SELECT id FROM pathways.system_users WHERE email='${managerEmail}'`)
  organizationId = ownerQuery(
    `SELECT organization_id FROM pathways.projects WHERE id='${projectId}'`,
  )
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/)

  // Fixture: one open activity assigned to the Project Officer, created once through the API.
  const headers = {
    Authorization: `Bearer ${actors[managerEmail]?.token}`,
    'x-pathways-organization-id': organizationId,
    'x-pathways-user-id': managerId,
  }
  const base = `${api}/projects/${projectId}/activities`
  const existing = await fetch(base, { headers })
  if (!(await existing.text()).includes(activityTitle)) {
    const created = await fetch(base, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMutationId: randomUUID(),
        code: activityCode,
        title: activityTitle,
        plannedStartDate: '2026-10-01',
        plannedEndDate: '2026-12-31',
        assignedUserIds: [officerId],
      }),
    })
    expect(created.status, await created.clone().text()).toBeLessThan(300)
  }
  activityId = ownerQuery(
    `SELECT id FROM pathways.project_activities WHERE project_id='${projectId}' AND title='${activityTitle}'`,
  )
})

// Password sign-in then the TOTP step, exactly as a person would.
async function signIn(page: import('@playwright/test').Page, email: string) {
  const actor = actors[email] as Actor
  await page.goto('/staff/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(actor.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/auth/mfa')
  // The next time step avoids replaying the code used during enrollment.
  const code = totpCode(actor.secret, 1)
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string)
  }
  await page.getByRole('button', { name: 'Verify authenticator code' }).click()
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/auth/mfa') && !url.pathname.startsWith('/staff/login'),
  )
}

// Known gap: middleware has no route policy for the retired /collection/entry, so it redirects to
// /unauthorized before the page-level redirect to /collection can run. Remove test.fail once fixed.
test('Project Officer: the retired entry route lands on Collection', async ({ page }) => {
  test.fail()
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto('/collection/entry')
  await expect(page).toHaveURL(/\/collection$/)
})

test('Project Officer: Collection offers no Encode link', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto('/collection')
  await expect(page).toHaveURL(/\/collection$/)
  await expect(page.getByRole('link', { name: /Encode/i })).toHaveCount(0)
})

test('Project Officer: no New Activity, but can submit an update and proof', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, officerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  await expect(page.getByRole('article', { name: `Activity: ${activityTitle}` })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Activity' })).toHaveCount(0)
  // Open the detail route directly; the in-page click races the first workspace load.
  await page.goto(`/projects/${projectId}/activities/${activityId}`)
  await expect(page.getByRole('button', { name: 'Submit Update & Proof' })).toBeVisible()
})

test('Project Manager sees New Activity', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, managerEmail)
  await page.goto(`/projects/${projectId}/activities`)
  await expect(page.getByRole('button', { name: 'New Activity' })).toBeVisible()
})
