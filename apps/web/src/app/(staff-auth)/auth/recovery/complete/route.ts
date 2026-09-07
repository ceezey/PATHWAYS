import { type NextRequest, NextResponse } from 'next/server'

import { developerAuthUserId } from '@/features/auth/auth-access'
import { passwordUpdateRequestSchema } from '@/features/auth/password-recovery'
import {
  applyPendingAuthCookies,
  clearPasswordRecoveryIntent,
  consumePasswordRecoveryGrant,
  createPendingAuthResponse,
  createRecoveryRouteClient,
  getRecoveryIdentityFromVerifiedClaims,
  isApprovedRecoveryRequest,
  passwordRecoveryIntentCookie,
  secureRecoveryResponse,
} from '@/lib/supabase/recovery-server'

export const runtime = 'nodejs'

type PasswordCompletionBody =
  | { ok: true; sessionClosed: boolean }
  | { ok: false; outcome: 'invalid' | 'not_changed' | 'unauthorized' | 'unknown' }

const maximumPasswordRequestLength = 1024

const isDefinitiveProviderRejection = (error: unknown) => {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false
  const status = (error as Record<string, unknown>).status
  return typeof status === 'number' && status >= 400 && status < 500
}

const jsonResponse = (
  status: number,
  body: PasswordCompletionBody,
  pending = createPendingAuthResponse(),
  clearIntent = false,
) => {
  const response = NextResponse.json(body, { status })
  applyPendingAuthCookies(response, pending)
  if (clearIntent) clearPasswordRecoveryIntent(response)
  return secureRecoveryResponse(response)
}

export async function POST(request: NextRequest) {
  if (
    !isApprovedRecoveryRequest(request, true) ||
    request.nextUrl.search ||
    !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')
  ) {
    return jsonResponse(403, { ok: false, outcome: 'unauthorized' }, undefined, true)
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
  try {
    supabase = createRecoveryRouteClient(request, pending)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const session = sessionData.session
    const intent = request.cookies.get(passwordRecoveryIntentCookie)?.value
    const claimsResult = session
      ? await supabase.auth.getClaims(session.access_token)
      : { data: null, error: null }
    const recoveryIdentity = getRecoveryIdentityFromVerifiedClaims(
      claimsResult.data?.claims,
      developerAuthUserId,
    )

    if (
      userError ||
      sessionError ||
      claimsResult.error ||
      userData.user?.id !== developerAuthUserId ||
      !session ||
      !recoveryIdentity ||
      !consumePasswordRecoveryGrant(intent, userData.user.id, recoveryIdentity.sessionId)
    ) {
      return jsonResponse(401, { ok: false, outcome: 'unauthorized' }, pending, true)
    }
  } catch {
    return jsonResponse(503, { ok: false, outcome: 'not_changed' }, pending)
  }

  try {
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    })
    if (updateError) {
      return isDefinitiveProviderRejection(updateError)
        ? jsonResponse(400, { ok: false, outcome: 'not_changed' }, pending, true)
        : jsonResponse(503, { ok: false, outcome: 'unknown' }, pending, true)
    }
  } catch {
    // The provider may have received the password before the network failed. Consume the
    // one-time grant and require the person to verify the outcome rather than retry blindly.
    return jsonResponse(503, { ok: false, outcome: 'unknown' }, pending, true)
  }

  let sessionClosed = false
  try {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    sessionClosed = !signOutError
  } catch {
    // The password change is committed even when closing this browser session is unconfirmed.
  }

  return jsonResponse(200, { ok: true, sessionClosed }, pending, true)
}
