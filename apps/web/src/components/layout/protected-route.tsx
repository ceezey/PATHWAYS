'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { visibleFeatures } from '@/lib/rbac/route-access'
import { RouteAccessGuard } from './route-access-guard'

export function FeatureDirectory() {
  const { profile } = useCurrentRole()
  if (!profile) return null
  return (
    <section aria-labelledby="feature-directory" className="mb-8 space-y-4">
      <h2 id="feature-directory" className="text-xl font-semibold">
        Available workspace features
      </h2>
      <p className="text-sm text-muted-foreground">
        Features without persisted backend support remain unavailable. Project-specific tools
        require an authorized project selection; no identifiers need to be entered.
      </p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleFeatures(profile).map((feature) => (
          <li key={feature.title} className="rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{feature.group}</span>
            <Link
              prefetch={false}
              href={feature.href}
              className="block font-medium underline-offset-4 hover:underline"
            >
              {feature.title}
            </Link>
            {feature.route === 'monitoring' ? (
              <p className="text-sm text-muted-foreground">
                Select an authorized project to open monitoring tools. An empty project list is
                valid.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { configured, status } = useSession()
  const { access, accessError, accessRefreshing, refreshAccess, role } = useCurrentRole()

  useEffect(() => {
    if (configured && (status === 'unauthenticated' || access === 'session_expired')) {
      router.replace('/staff/login')
    } else if (configured && status === 'authenticated' && access === 'mfa_required') {
      router.replace('/auth/mfa')
    }
  }, [access, configured, router, status])

  if (!configured) {
    return (
      <div className="flex min-h-40 items-center justify-center p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Authentication configuration required</CardTitle>
            <CardDescription>
              Protected access is unavailable until the Supabase project URL, publishable key, and
              redirect URLs are configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Complete the authentication configuration in Supabase, then reload this route. The
            redirect target is
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

  if (status === 'loading' || (status === 'authenticated' && access === 'loading')) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <output aria-live="polite">Verifying MFA and database-backed access...</output>
      </div>
    )
  }

  if (status === 'unauthenticated' || access === 'session_expired') {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    )
  }

  if (access !== 'ready' || !role) {
    return (
      <div className="flex min-h-40 items-center justify-center p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>
              {access === 'unavailable'
                ? 'Access verification temporarily unavailable'
                : access === 'no_workspace'
                  ? 'No authorized workspace'
                  : 'Protected access has not been granted'}
            </CardTitle>
            <CardDescription>
              Protected content stays hidden until current access can be verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              {accessError ??
                (access === 'mfa_required'
                  ? 'Complete MFA to open your workspace.'
                  : 'An active database-backed profile and current permissions are required. No additional access has been granted.')}
            </p>
            {access === 'mfa_required' ? (
              <Button asChild variant="outline">
                <Link href="/auth/mfa">Complete MFA</Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={accessRefreshing}
                onClick={refreshAccess}
              >
                Retry secure access
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          Preparing dashboard access...
        </div>
      }
    >
      <RouteAccessGuard>{children}</RouteAccessGuard>
    </Suspense>
  )
}
