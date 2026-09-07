import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StaffAuthShell } from '@/features/auth/staff-auth-shell'

export const metadata: Metadata = {
  title: 'Recovery link unavailable',
  robots: { index: false, follow: false },
}

export default function PasswordRecoveryErrorPage() {
  return (
    <StaffAuthShell>
      <Card className="w-full max-w-[460px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle>Recovery link unavailable</CardTitle>
          <CardDescription>
            The recovery link could not be verified. No password was changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Request one new message and open it in the same browser profile while the local server
            is still running.
          </p>
          <Button asChild className="w-full">
            <Link href="/staff/forgot-password">Request a new recovery message</Link>
          </Button>
        </CardContent>
      </Card>
    </StaffAuthShell>
  )
}
