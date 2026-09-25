'use client'

import { LoadingSkeleton } from '@/components/pathways/loading-skeleton'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import {
  RouteCheckError,
  type RouteDecision,
  authorizationPathForUiPath,
  getVerifiedRouteAccess,
  matchRoute,
  requestRouteCheck,
} from '@/lib/rbac/route-access'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BeneficiaryAccessGate } from './beneficiary-access-gate'
import { UnauthorizedState } from './unauthorized-state'

/** Content boundary only. AppShell lives outside this guard and owns no domain data. */
export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { session } = useSession()
  const { profile, refreshAccess, accessRefreshing, verificationRevision, resetWorkspaceHandoff } =
    useCurrentRole()
  const query = new URLSearchParams(params.toString())
  query.delete('_rsc')
  const path = pathname + (query.size ? `?${query.toString()}` : '')
  const authorizationPath = authorizationPathForUiPath(path)
  const token = session?.access_token
  const subject = session?.user.id
  const [retry, setRetry] = useState(0)
  // Keep the rendered route identity stable across same-subject token refreshes.
  // `token` remains an effect dependency, so the backend check still reruns with
  // the new credential without unmounting page loaders and form/file state.
  const key = JSON.stringify([
    path,
    subject,
    retry,
    profile?.id,
    profile?.userId,
    profile?.organizationId,
    profile?.roles,
    profile?.permissions,
    profile?.assignedProjectIds,
  ])
  const [state, setState] = useState<{
    key: string
    revision: number
    decision?: RouteDecision
    error?: number
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    // The provider is the only timer/focus owner. Follow its completed check,
    // rather than running a second interval or competing discovery sequence.
    if (accessRefreshing) return () => controller.abort()
    const selection = authorizationPath ? matchRoute(authorizationPath) : null
    const check = async () => {
      if (document.visibilityState === 'hidden') return
      if (
        !token ||
        !profile ||
        profile.id !== subject ||
        !selection ||
        !getVerifiedRouteAccess(profile, authorizationPath ?? '').allowed
      ) {
        setState({ key, revision: verificationRevision, error: 403 })
        return
      }
      try {
        const decision = await requestRouteCheck(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          token,
          profile,
          selection,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setState({ key, revision: verificationRevision, decision })
          // Confirmed workspace entry releases the one-attempt MFA handoff latch.
          resetWorkspaceHandoff()
        }
      } catch (error) {
        if (controller.signal.aborted) return
        // Cancellation is not denial. Outages/route denials must not destroy a
        // valid workspace selector and send the user through MFA again.
        if (error instanceof RouteCheckError && error.failure === 'cancelled') return
        setState({
          key,
          revision: verificationRevision,
          error: error instanceof RouteCheckError ? error.status : 503,
        })
      }
    }
    void check()
    return () => controller.abort()
  }, [
    accessRefreshing,
    verificationRevision,
    key,
    authorizationPath,
    profile,
    token,
    subject,
    resetWorkspaceHandoff,
  ])
  const current = state?.key === key ? state : null
  // Initial entry and a genuinely different route/profile remain blocking. Once
  // this exact route has been allowed, provider and route rechecks run behind
  // the mounted page. Any returned denial/error replaces it immediately.
  if (!current) return <LoadingSkeleton className="py-2" />
  if (current.error === 401)
    return (
      <section role="alert">
        <h2>Session expired</h2>
        <a href="/staff/login">Sign in again</a>
      </section>
    )
  if (current.error && [403, 404].includes(current.error))
    return (
      <section role="alert">
        <h2 className="sr-only">Unauthorized access</h2>
        <UnauthorizedState moduleName="this workspace section" />
      </section>
    )
  if (current.error)
    return (
      <section role="alert">
        <h2>Access verification unavailable</h2>
        <p>No protected content is shown. Your session has not been reset.</p>
        <button
          type="button"
          disabled={accessRefreshing}
          onClick={() => {
            setState(null)
            setRetry((value) => value + 1)
            refreshAccess()
          }}
        >
          Retry secure access
        </button>
      </section>
    )
  if (pathname === '/beneficiaries' || pathname.startsWith('/beneficiaries/')) {
    return <BeneficiaryAccessGate>{children}</BeneficiaryAccessGate>
  }
  return children
}
