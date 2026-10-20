import type { Metadata } from 'next'
import { Suspense } from 'react'

import { SkipLink } from '@/components/layout/skip-link'
import { ResetPasswordWorkspace } from '@/features/auth'

export const metadata: Metadata = { title: 'Reset Staff Password' }

export default function StaffResetPasswordPage() {
  return (
    <>
      <SkipLink />
      <Suspense fallback={<div className="min-h-dvh bg-workspace" />}>
        <ResetPasswordWorkspace />
      </Suspense>
    </>
  )
}
