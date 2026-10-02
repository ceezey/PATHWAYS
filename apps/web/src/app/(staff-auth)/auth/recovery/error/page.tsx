import type { Metadata } from 'next'
import Link from 'next/link'

import { SkipLink } from '@/components/layout/skip-link'
import { Button } from '@/components/ui/button'
import { StaffAuthFrame } from '@/features/auth/staff-auth-frame'

export const metadata: Metadata = {
  title: 'Recovery link unavailable',
  robots: { index: false, follow: false },
}

export default function PasswordRecoveryErrorPage() {
  return (
    <>
      <SkipLink />
      <StaffAuthFrame
        title="Recovery link unavailable"
        description="The recovery link could not be verified. No password was changed."
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Request one new message and open it in the same browser profile.
        </p>
        <Button asChild className="w-full">
          <Link href="/staff/forgot-password">Request a new recovery message</Link>
        </Button>
      </StaffAuthFrame>
    </>
  )
}
