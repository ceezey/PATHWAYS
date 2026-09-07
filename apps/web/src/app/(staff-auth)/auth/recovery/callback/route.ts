import { type NextRequest, NextResponse } from 'next/server'

import { developerAuthUserId } from '@/features/auth/auth-access'
import { localPasswordRecoveryOrigin, passwordUpdatePath } from '@/features/auth/password-recovery'
import {
  applyPendingAuthCookies,
  clearPasswordRecoveryIntent,
  createPendingAuthResponse,
  createRecoveryRouteClient,
  getRecoveryIdentityFromVerifiedClaims,
  isApprovedRecoveryRequest,
  issuePasswordRecoveryGrant,
  passwordRecoveryIntentCookie,
  passwordRecoveryIntentCookieOptions,
  secureRecoveryResponse,
} from '@/lib/supabase/recovery-server'

export const runtime = 'nodejs'

const recoveryErrorPath = '/auth/recovery/error'
const maximumCallbackValueLength = 2048

const redirect = (path: string, pending: ReturnType<typeof createPendingAuthResponse>) => {
  const response = NextResponse.redirect(new URL(path, localPasswordRecoveryOrigin), 303)
  applyPendingAuthCookies(response, pending)
  return secureRecoveryResponse(response)
}

export async function GET(request: NextRequest) {
  if (!isApprovedRecoveryRequest(request)) {
    return secureRecoveryResponse(new NextResponse('Not found.', { status: 404 }))
  }

  const pending = createPendingAuthResponse()
  const codeValues = request.nextUrl.searchParams.getAll('code')
  const tokenHashValues = request.nextUrl.searchParams.getAll('token_hash')
  const typeValues = request.nextUrl.searchParams.getAll('type')
  const keys = [...request.nextUrl.searchParams.keys()]
  const isCodeFlow =
    keys.length === 1 &&
    codeValues.length === 1 &&
    tokenHashValues.length === 0 &&
    typeValues.length === 0 &&
    codeValues[0].length > 0 &&
    codeValues[0].length <= maximumCallbackValueLength
  const isTokenHashFlow =
    keys.length === 2 &&
    codeValues.length === 0 &&
    tokenHashValues.length === 1 &&
    tokenHashValues[0].length > 0 &&
    tokenHashValues[0].length <= maximumCallbackValueLength &&
    typeValues.length === 1 &&
    typeValues[0] === 'recovery'

  if (request.nextUrl.search.length > 4096 || (!isCodeFlow && !isTokenHashFlow)) {
    const response = redirect(recoveryErrorPath, pending)
    clearPasswordRecoveryIntent(response)
    return response
  }

  try {
    const supabase = createRecoveryRouteClient(request, pending)
    const result = isCodeFlow
      ? await supabase.auth.exchangeCodeForSession(codeValues[0])
      : await supabase.auth.verifyOtp({ token_hash: tokenHashValues[0], type: 'recovery' })
    const session = result.data.session
    const user = result.data.user
    const redirectType =
      result.data && typeof result.data === 'object' && 'redirectType' in result.data
        ? result.data.redirectType
        : null
    const claimsResult = session
      ? await supabase.auth.getClaims(session.access_token)
      : { data: null, error: null }
    const recoveryIdentity = getRecoveryIdentityFromVerifiedClaims(
      claimsResult.data?.claims,
      developerAuthUserId,
    )

    if (
      result.error ||
      claimsResult.error ||
      !session ||
      user?.id !== developerAuthUserId ||
      (isCodeFlow && redirectType !== 'PASSWORD_RECOVERY') ||
      !recoveryIdentity
    ) {
      if (session) {
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch {
          // The failed callback still receives no local recovery grant.
        }
      }
      const response = redirect(recoveryErrorPath, pending)
      clearPasswordRecoveryIntent(response)
      return response
    }

    const response = redirect(passwordUpdatePath, pending)
    response.cookies.set(
      passwordRecoveryIntentCookie,
      issuePasswordRecoveryGrant(user.id, recoveryIdentity.sessionId),
      passwordRecoveryIntentCookieOptions,
    )
    return response
  } catch {
    const response = redirect(recoveryErrorPath, pending)
    clearPasswordRecoveryIntent(response)
    return response
  }
}
