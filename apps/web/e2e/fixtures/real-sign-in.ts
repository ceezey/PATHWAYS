import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import type { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { localDatabase } from '../../../../scripts/db/local-target.mjs'

const shell = process.platform === 'win32'

// Local seed accounts by role, as defined in apps/api/prisma/local-demo-seed.ts.
export const seedAccounts = {
  SA: 'cian.francisco@pathways.example',
  PO: 'liza.bautista@pathways.example',
  ME: 'carlo.mendoza@pathways.example',
  PM: 'ana.delacruz@pathways.example',
  PG: 'maria.santos@pathways.example',
  GM: 'jose.reyes@pathways.example',
}

// The suite needs the disposable local database container.
export const hasLocalDb = (() => {
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

// Owner-role query on the disposable local container; returns bare rows.
export const ownerQuery = (sql: string) =>
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

const lastStep = new Map<string, number>()

// Returns a code for a time step later than any used for this secret, waiting until it is acceptable.
export const nextTotpCode = async (secret: string) => {
  const now = Math.floor(Date.now() / 30_000)
  const step = Math.max((lastStep.get(secret) ?? now - 1) + 1, now)
  lastStep.set(secret, step)
  // A step more than one ahead is outside the accepted window, so wait for it to approach.
  if (step > now + 1)
    await new Promise((r) => setTimeout(r, (step - 1) * 30_000 - Date.now() + 100))
  return totpCode(secret, step - Math.floor(Date.now() / 30_000))
}

export interface Actor {
  password: string
  secret: string
  token: string
}

// Resets the account password and TOTP factor, then enrolls and verifies a fresh factor.
async function prepareActor(
  actors: Record<string, Actor>,
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
    code: await nextTotpCode(secret),
  })
  if (verified.error) throw new Error(`Could not verify the factor for ${email}`)
  const session = await client.auth.getSession()
  actors[email] = { password, secret, token: session.data.session?.access_token ?? '' }
}

// Prepares the given seed accounts against the local Supabase stack and returns their credentials.
export async function loadActors(emails: string[]) {
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
  const actors: Record<string, Actor> = {}
  for (const email of emails) {
    await prepareActor(actors, admin, status.API_URL, status.ANON_KEY, email)
  }
  return actors
}

// Password sign-in then the TOTP step, exactly as a person would.
export async function signIn(page: Page, email: string, actors: Record<string, Actor>) {
  const actor = actors[email] as Actor
  await page.goto('/staff/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(actor.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/auth/mfa')
  const code = await nextTotpCode(actor.secret)
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string)
  }
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/auth/mfa') && !url.pathname.startsWith('/staff/login'),
  )
}
