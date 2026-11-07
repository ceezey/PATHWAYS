import { type NextRequest, NextResponse } from 'next/server'

import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { passwordUpdateRequestSchema } from '@/lib/auth/password-recovery'
import { webEnv } from '@/lib/env'
import {
  applyPendingAuthCookies,
  createPendingAuthResponse,
  createRecoveryRouteClient,
  getRecoveryIdentityFromVerifiedClaims,
  isApprovedRecoveryRequest,
  secureRecoveryResponse,
} from '@/lib/supabase/recovery-server'

export const runtime = 'nodejs'

type PasswordCompletionBody =
  | { ok: true; sessionClosed: boolean }
  | { ok: false; outcome: 'invalid' | 'not_changed' | 'unauthorized' | 'unknown' }

const maximumPasswordRequestLength = 1024

// Asks the API to set the password through the admin API, so accounts with MFA enrolled can reset too.
const setPasswordThroughApi = (accessToken: string, password: string) => {
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  return fetch(`${base.toString().replace(/\/$/, '')}/auth/password-recovery/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
}

const jsonResponse = (
  status: number,
  body: PasswordCompletionBody,
  pending = createPendingAuthResponse(),
) => {
  const response = NextResponse.json(body, { status })
  applyPendingAuthCookies(response, pending)
  return secureRecoveryResponse(response)
}

export async function POST(request: NextRequest) {
  if (
    !isApprovedRecoveryRequest(request, true) ||
    request.nextUrl.search ||
    !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')
  ) {
    return jsonResponse(403, { ok: false, outcome: 'unauthorized' })
  }

  let bodyText: string
  try {
    bodyText = await request.text()
  } catch {
    return jsonResponse(400, { ok: false, outcome: 'invalid' })
  }
  if (bodyText.length > maximumPasswordRequestLength) {
    return jsonResponse(413, { ok: false, outcome: 'invalid' })
  }

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return jsonResponse(400, { ok: false, outcome: 'invalid' })
  }
  const parsed = passwordUpdateRequestSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { ok: false, outcome: 'invalid' })

  const pending = createPendingAuthResponse()
  let supabase: ReturnType<typeof createRecoveryRouteClient>
  let accessToken: string
  try {
    supabase = createRecoveryRouteClient(request, pending)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const session = sessionData.session
    const claimsResult = session
      ? await supabase.auth.getClaims(session.access_token)
      : { data: null, error: null }
    const recoveryIdentity = getRecoveryIdentityFromVerifiedClaims(
      claimsResult.data?.claims,
      userData.user?.id ?? '',
    )

    if (
      userError ||
      sessionError ||
      claimsResult.error ||
      !userData.user ||
      session?.user.id !== userData.user.id ||
      !session ||
      !recoveryIdentity
    ) {
      return jsonResponse(401, { ok: false, outcome: 'unauthorized' }, pending)
    }
    accessToken = session.access_token
  } catch {
    return jsonResponse(503, { ok: false, outcome: 'not_changed' }, pending)
  }

  let result: unknown = null
  try {
    const response = await setPasswordThroughApi(accessToken, parsed.data.password)
    if (response.status === 400)
      return jsonResponse(400, { ok: false, outcome: 'not_changed' }, pending)
    if (response.status === 401)
      return jsonResponse(401, { ok: false, outcome: 'unauthorized' }, pending)
    if (response.ok) result = await response.json()
  } catch {
    // The API may have set the password before the network failed, so do not retry.
  }
  const answer = result as Record<string, unknown> | null
  if (answer?.ok !== true) return jsonResponse(503, { ok: false, outcome: 'unknown' }, pending)

  // The API ended every session of the account; this drops the cookies of this browser too.
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // The password change is committed even when clearing this browser is unconfirmed.
  }

  return jsonResponse(200, { ok: true, sessionClosed: answer.sessionsClosed === true }, pending)
}
