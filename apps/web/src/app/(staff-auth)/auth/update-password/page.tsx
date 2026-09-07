import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { developerAuthUserId, developerSupabaseUrl } from '@/features/auth/auth-access'
import { PasswordUpdateForm } from '@/features/auth/password-update-form'
import { StaffAuthShell } from '@/features/auth/staff-auth-shell'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'
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
  if (
    !intent ||
    webEnv.NEXT_PUBLIC_SUPABASE_URL !== developerSupabaseUrl ||
    !webSupabasePublishableKey
  ) {
    return false
  }

  try {
    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || userData.user?.id !== developerAuthUserId) return false

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) return false

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      sessionData.session.access_token,
    )
    const recoveryIdentity = getRecoveryIdentityFromVerifiedClaims(
      claimsData?.claims,
      developerAuthUserId,
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
    <StaffAuthShell>
      {recoveryReady ? (
        <PasswordUpdateForm />
      ) : (
        <Card className="w-full max-w-[460px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle>Recovery link unavailable</CardTitle>
            <CardDescription>
              This link is expired, already used, belongs to another browser, or was not issued for
              the approved developer account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Request one new message and open it in the same browser profile at the exact 127.0.0.1
              address. Do not copy its URL into chat.
            </p>
            <Button asChild className="w-full">
              <Link href="/staff/forgot-password">Request a new recovery message</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </StaffAuthShell>
  )
}
