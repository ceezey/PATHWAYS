import type { Metadata } from 'next'

import { SkipLink } from '@/components/layout/skip-link'
import { LoginForm } from '@/features/auth/login-form'

export const metadata: Metadata = { title: 'Staff Sign In' }

export default function StaffLoginPage() {
  return (
    <>
      <SkipLink />
      {/* TODO(DEPLOYMENT): Move the staff portal to the organization-approved secure staff domain or deployment instance. */}
      <LoginForm />
    </>
  )
}
