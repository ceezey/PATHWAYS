import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPrototypeAccountById } from '@/lib/auth/prototype-credentials.server'

const challengeCookieName = 'pathways.prototypeMfaChallenge'
const maxAttempts = 5

interface ChallengeCookie {
  accountId: string
  expiresAt: string
  attempts: number
  nonce: string
}

const decodeChallenge = (value: string): ChallengeCookie | null => {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ChallengeCookie
  } catch {
    return null
  }
}

const encodeChallenge = (challenge: ChallengeCookie) =>
  Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64url')

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { otp?: string } | null
  const cookieStore = await cookies()
  const stored = cookieStore.get(challengeCookieName)?.value
  const challenge = stored ? decodeChallenge(stored) : null

  if (!challenge) {
    return NextResponse.json({ message: 'The OTP challenge is missing.' }, { status: 400 })
  }

  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    cookieStore.delete(challengeCookieName)
    return NextResponse.json({ message: 'The OTP code has expired.' }, { status: 410 })
  }

  if (challenge.attempts >= maxAttempts) {
    cookieStore.delete(challengeCookieName)
    return NextResponse.json({ message: 'Maximum OTP attempts reached.' }, { status: 429 })
  }

  const expectedOtp = process.env.DEMO_MFA_OTP ?? '123456'

  if (!body?.otp || body.otp !== expectedOtp) {
    const nextChallenge = { ...challenge, attempts: challenge.attempts + 1 }
    const remainingAttempts = Math.max(0, maxAttempts - nextChallenge.attempts)

    if (remainingAttempts === 0) {
      cookieStore.delete(challengeCookieName)
      return NextResponse.json({ message: 'Maximum OTP attempts reached.' }, { status: 429 })
    }

    cookieStore.set(challengeCookieName, encodeChallenge(nextChallenge), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(challenge.expiresAt),
    })

    return NextResponse.json({ message: 'Invalid OTP code.', remainingAttempts }, { status: 401 })
  }

  const account = getPrototypeAccountById(challenge.accountId)

  if (!account) {
    cookieStore.delete(challengeCookieName)
    return NextResponse.json({ message: 'The MFA account is unavailable.' }, { status: 400 })
  }

  cookieStore.delete(challengeCookieName)

  return NextResponse.json({ account })
}
