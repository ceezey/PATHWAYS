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
        Development feature directory
      </h2>
      <p className="text-sm text-muted-foreground">
        Prototype-only · Backend pending. Project-specific tools require an authorized project
        selection; no identifiers need to be entered.
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
  const { access, assignedProjectIds, role } = useCurrentRole()

  useEffect(() => {
    if (configured && status === 'unauthenticated') {
      router.replace('/staff/login')
    } else if (configured && status === 'authenticated' && access === 'mfa_required') {
      router.replace('/auth/mfa')
    }
  }, [access, configured, router, status])

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

  if (status === 'loading' || (status === 'authenticated' && access === 'loading')) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <output aria-live="polite">Verifying MFA and database-backed access...</output>
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

  if (access !== 'ready' || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>
              {access === 'no_workspace'
                ? 'No authorized workspace'
                : 'Protected access has not been granted'}
            </CardTitle>
            <CardDescription>
              A verified MFA session and an active database-backed PATHWAYS profile are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Protected content remains hidden. Complete MFA verification; application access also
              requires separately approved provisioning. Supabase metadata cannot grant a role.
            </p>
            <Button asChild variant="outline">
              <Link href="/auth/mfa">Review secure access</Link>
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
