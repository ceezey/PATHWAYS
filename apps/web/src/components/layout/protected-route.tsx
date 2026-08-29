'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { RouteAccessGuard } from './route-access-guard'

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { configured, status } = useSession()
  const { assignedProjectIds, role } = useCurrentRole()

  useEffect(() => {
    if (configured && status === 'unauthenticated') {
      router.replace('/staff/login')
    }
  }, [configured, router, status])

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Supabase auth setup is still required</CardTitle>
            <CardDescription>
              Dashboard routes are scaffolded, but the real session check stays in placeholder mode
              until the Supabase project URL, publishable key, and redirect URLs are configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Continue the human setup in Supabase, then reload this route. The reserved redirect
            target is
            <code className="mx-1 rounded bg-muted px-2 py-1 text-foreground">/auth/callback</code>.
            <div className="mt-4">
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href="/staff/login"
              >
                Go to secure staff login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Preparing dashboard shell...
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    )
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Authenticated role required</CardTitle>
            <CardDescription>
              This session does not contain a recognized PATHWAYS role in Supabase app metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Protected content remains hidden. Ask an administrator to assign a supported role,
              then sign in again.
            </p>
            <Button asChild variant="outline">
              <Link href="/staff/login">Return to staff login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Preparing dashboard access...
        </div>
      }
    >
      <RouteAccessGuard assignedProjectIds={assignedProjectIds} role={role}>
        {children}
      </RouteAccessGuard>
    </Suspense>
  )
}
