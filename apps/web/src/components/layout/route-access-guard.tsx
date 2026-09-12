'use client'

import { clearWorkspaceContext } from '@/features/auth/workspace-access'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import {
  RouteCheckError,
  type RouteDecision,
  getVerifiedRouteAccess,
  matchRoute,
  requestRouteCheck,
} from '@/lib/rbac/route-access'
import type { PathwaysRole } from '@/types/pathways-role'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { UnauthorizedState } from './unauthorized-state'

export function RouteAccessGuard({
  children,
}: { children: React.ReactNode; role: PathwaysRole; assignedProjectIds: readonly string[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { session } = useSession()
  const { profile, refreshAccess } = useCurrentRole()
  const query = new URLSearchParams(params.toString())
  query.delete('_rsc')
  const path = pathname + (query.size ? `?${query.toString()}` : '')
  const token = session?.access_token
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([
    path,
    token,
    session?.user.id,
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
    decision?: RouteDecision
    error?: number
  } | null>(null)
  useEffect(() => {
    let controller = new AbortController()
    let pending = false
    const selection = matchRoute(path)
    const check = async () => {
      if (pending || document.visibilityState === 'hidden') return
      if (
        !token ||
        !profile ||
        profile.id !== session?.user.id ||
        !selection ||
        !getVerifiedRouteAccess(profile, path).allowed
      ) {
        setState({ key, error: 403 })
        return
      }
      pending = true
      const requestController = controller
      try {
        const decision = await requestRouteCheck(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          token,
          profile,
          selection,
          requestController.signal,
        )
        if (!requestController.signal.aborted) setState({ key, decision })
      } catch (error) {
        if (!requestController.signal.aborted) {
          clearWorkspaceContext()
          setState({ key, error: error instanceof RouteCheckError ? error.status : 503 })
        }
      } finally {
        if (requestController === controller) pending = false
      }
    }
    void check()
    const recheck = () => {
      if (controller.signal.aborted) controller = new AbortController()
      void check()
    }
    const hide = () => {
      setState(null)
      controller.abort()
      pending = false
    }
    const timer = setInterval(recheck, 30000)
    window.addEventListener('focus', recheck)
    window.addEventListener('pageshow', recheck)
    window.addEventListener('pagehide', hide)
    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', recheck)
      window.removeEventListener('pageshow', recheck)
      window.removeEventListener('pagehide', hide)
    }
  }, [key, path, profile, token, session?.user.id])
  const current = state?.key === key ? state : null
  if (!current) return <output aria-live="polite">Verifying current route access…</output>
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
        <p>No protected content is shown.</p>
        <button
          type="button"
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
  return (
    <>
      <aside role="note" className="mb-6 rounded-lg border border-border bg-muted p-4">
        <strong>Prototype-only · Backend pending</strong>
        <p>
          These development screens do not enable business-data persistence. Available data and
          actions remain subject to server authorization.
        </p>
      </aside>
      {children}
    </>
  )
}
