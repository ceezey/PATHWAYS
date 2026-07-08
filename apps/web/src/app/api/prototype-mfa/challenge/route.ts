import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { validatePrototypeCredentials } from '@/lib/auth/prototype-credentials.server'

const challengeCookieName = 'pathways.prototypeMfaChallenge'
const defaultExpirySeconds = 300

const encodeChallenge = (challenge: unknown) =>
  Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64url')

const maskDestination = (email: string) => {
  const [name, domain] = email.split('@')
  const first = name?.[0] ?? 's'
  return `${first}***@${domain ?? 'organization.org'}`
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    identifier?: string
    password?: string
  } | null

  const account =
    body?.identifier && body.password
      ? validatePrototypeCredentials(body.identifier, body.password)
      : null

  if (!account) {
    return NextResponse.json(
      { message: 'The username, email, or password does not match a demo account.' },
      { status: 401 },
    )
  }

  const expirySeconds = Number(process.env.DEMO_MFA_EXPIRY_SECONDS ?? defaultExpirySeconds)
  const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString()
  const cookieStore = await cookies()

  // TODO(AUTH): Replace the prototype OTP challenge with the finalized organization-approved MFA provider.
  // TODO(SECURITY): Enforce rate limits, lockout, audit logging, and secure challenge storage server-side.
  cookieStore.set(
    challengeCookieName,
    encodeChallenge({
      accountId: account.id,
      expiresAt,
      attempts: 0,
      nonce: crypto.randomUUID(),
    }),
    {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: expirySeconds,
    },
  )

  return NextResponse.json({
    maskedDestination: maskDestination(account.email),
    expiresAt,
    maxAttempts: 5,
  })
}
