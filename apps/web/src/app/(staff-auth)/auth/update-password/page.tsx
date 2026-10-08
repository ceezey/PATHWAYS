import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'

import { SkipLink } from '@/components/layout/skip-link'
import { Button } from '@/components/ui/button'
import { PasswordUpdateForm } from '@/features/auth/password-update-form'
import { StaffAuthFrame } from '@/features/auth/staff-auth-frame'
import { webSupabasePublishableKey } from '@/lib/env'
import { createClient } from '@/lib/server'
import {
  getRecoveryIdentityFromVerifiedClaims,
  inspectPasswordRecoveryGrant,
  passwordRecoveryIntentCookie,
} from '@/lib/supabase/recovery-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
}

async function hasApprovedRecoverySession() {
  const cookieStore = await cookies()
  const intent = cookieStore.get(passwordRecoveryIntentCookie)?.value
  if (!intent || !webSupabasePublishableKey) {
    return false
  }

  try {
    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return false

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) return false

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      sessionData.session.access_token,
    )
    const recoveryIdentity = getRecoveryIdentityFromVerifiedClaims(
      claimsData?.claims,
      userData.user.id,
    )
    return Boolean(
      !claimsError &&
        recoveryIdentity &&
        inspectPasswordRecoveryGrant(intent, userData.user.id, recoveryIdentity.sessionId),
    )
  } catch {
    return false
  }
}

export default async function UpdatePasswordPage() {
  const recoveryReady = await hasApprovedRecoverySession()

  return (
    <>
      <SkipLink />
      {recoveryReady ? (
        <PasswordUpdateForm />
      ) : (
        <StaffAuthFrame
          title="Recovery link unavailable"
          description="This link is expired, already used, belongs to another browser, or was not issued for the signed-in account."
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Request one new message and open it in the same browser profile at this staff portal. Do
            not copy its URL into chat.
          </p>
          <Button asChild className="w-full">
            <Link href="/staff/forgot-password">Request a new recovery message</Link>
          </Button>
        </StaffAuthFrame>
      )}
    </>
  )
}
