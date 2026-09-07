import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  localPasswordRecoveryOrigin,
  passwordRecoveryRequestUrl,
} from '@/features/auth/password-recovery'
import { PasswordRecoveryRequestForm } from '@/features/auth/password-recovery-request-form'
import { StaffAuthShell } from '@/features/auth/staff-auth-shell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Password recovery',
  robots: { index: false, follow: false },
}

export default async function ForgotPasswordPage() {
  const requestHeaders = await headers()
  if (requestHeaders.get('host') !== new URL(localPasswordRecoveryOrigin).host) {
    redirect(passwordRecoveryRequestUrl)
  }

  return (
    <StaffAuthShell>
      <PasswordRecoveryRequestForm />
    </StaffAuthShell>
  )
}
