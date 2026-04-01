'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/hooks/use-session'

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { configured, isBypassed, status } = useSession()

  useEffect(() => {
    if (configured && !isBypassed && status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [configured, isBypassed, router, status])

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
                href="/login"
              >
                Go to login placeholder
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

  if (!isBypassed && status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    )
  }

  return <>{children}</>
}
