import type { Metadata } from 'next'

import { SkipLink } from '@/components/layout/skip-link'
import { LoginForm } from '@/features/auth/login-form'

export const metadata: Metadata = { title: 'Staff Sign In' }

export default function StaffLoginPage() {
  return (
    <>
      <SkipLink />
      <main
        className="flex min-h-dvh w-full items-center justify-center bg-[linear-gradient(135deg,#C8EAF9_0%,#F5FBFE_28%,#FFFFFF_58%,#DCEFFC_100%)] px-4 py-8 sm:py-10"
        id="main-content"
        tabIndex={-1}
      >
        {/* TODO(DEPLOYMENT): Move the staff portal to the organization-approved secure staff domain or deployment instance. */}
        <LoginForm />
      </main>
    </>
  )
}
