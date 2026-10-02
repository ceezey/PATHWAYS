import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { SkipLink } from '@/components/layout/skip-link'
import {
  localPasswordRecoveryOrigin,
  passwordRecoveryRequestUrl,
} from '@/features/auth/password-recovery'
import { PasswordRecoveryRequestForm } from '@/features/auth/password-recovery-request-form'

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
    <>
      <SkipLink />
      <PasswordRecoveryRequestForm />
    </>
  )
}
