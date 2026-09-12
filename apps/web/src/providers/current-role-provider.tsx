'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  type ApplicationProfile,
  AuthAccessError,
  getProfileRole,
  hasCurrentProfile,
  parseMfaStatus,
  requestAuthJson,
} from '@/features/auth/auth-access'
import {
  clearWorkspaceContext,
  contextCookieName,
  encodeWorkspaceContext,
  resolveWorkspaceProfile,
} from '@/features/auth/workspace-access'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import { isInternalPath } from '@/lib/rbac/route-access'
import type { PathwaysRole } from '@/types/pathways-role'

interface CurrentRoleContextValue {
  role: PathwaysRole | null
  assignedProjectIds: readonly string[]
  profile: ApplicationProfile | null
  access: 'loading' | 'mfa_required' | 'blocked' | 'no_workspace' | 'ready'
  accessError: string | null
  refreshAccess: () => void
  accessRefreshing: boolean
  claimWorkspaceHandoff: () => boolean
  resetWorkspaceHandoff: () => void
}

const CurrentRoleContext = createContext<CurrentRoleContextValue | null>(null)

export const CurrentRoleProvider = ({ children }: { children: React.ReactNode }) => {
  const { session, status: sessionStatus } = useSession()
  const pathname = usePathname()
  // Public routes never start internal membership discovery.
  const internal = isInternalPath(pathname)
  const [result, setResult] = useState<{
    token: string
    subject: string
    refresh: number
    access: CurrentRoleContextValue['access']
    profile: ApplicationProfile | null
    error: string | null
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const operation = useRef(0)
  const revalidationInFlight = useRef(false)
  // UX-only, in-memory loop guard shared across MFA page remounts. This never
  // authorizes a route or persists trust; the server still checks every entry.
  const handoffSubject = useRef<string | null>(null)
  const resetWorkspaceHandoff = useCallback(() => {
    handoffSubject.current = null
  }, [])
  useEffect(() => {
    if (handoffSubject.current !== session?.user.id) handoffSubject.current = null
  }, [session?.user.id])
  const refreshAccess = useCallback(() => {
    // Focus, pageshow and the interval can fire together. One authoritative
    // revalidation is enough; keep the verified view stable while it runs.
    if (revalidationInFlight.current) return
    revalidationInFlight.current = true
    ++operation.current
    setRefresh((value) => value + 1)
  }, [])

  useEffect(() => {
    const revision = ++operation.current
    const controller = new AbortController()
    if (sessionStatus === 'loading') {
      revalidationInFlight.current = false
      setResult(null)
      return () => controller.abort()
    }
    if (!session || !internal) {
      revalidationInFlight.current = false
      setResult(null)
      clearWorkspaceContext()
      return () => controller.abort()
    }
    revalidationInFlight.current = true
    const token = session.access_token
    const subject = session.user.id
    const active = () =>
      !controller.signal.aborted &&
      operation.current === revision &&
      sessionRef.current?.access_token === token &&
      sessionRef.current?.user.id === subject
    const load = async () => {
      try {
        const status = parseMfaStatus(
          await requestAuthJson(
            webEnv.NEXT_PUBLIC_API_BASE_URL,
            '/auth/mfa/status',
            token,
            controller.signal,
          ),
        )
        if (!active()) return
        if (status.authUserId !== subject) throw new AuthAccessError(403)
        if (status.aal !== 'aal2' || !status.applicationAccessEnabled) {
          if (status.aal !== 'aal2') resetWorkspaceHandoff()
          clearWorkspaceContext()
          setResult({
            token,
            subject,
            refresh,
            profile: null,
            error: null,
            access: status.aal === 'aal2' ? 'blocked' : 'mfa_required',
          })
          return
        }
        const profile = await resolveWorkspaceProfile(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          token,
          subject,
          controller.signal,
        )
        if (!active()) return
        if (!profile) {
          clearWorkspaceContext()
          setResult({ token, subject, refresh, profile: null, access: 'no_workspace', error: null })
          return
        }
        // Non-secret SSR hint only; the API revalidates this selection each time.
        document.cookie = `${contextCookieName}=${encodeWorkspaceContext(profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
        setResult({ token, subject, refresh, access: 'ready', profile, error: null })
      } catch (error) {
        if (!active()) return
        clearWorkspaceContext()
        setResult({
          token,
          subject,
          refresh,
          access: 'blocked',
          profile: null,
          error:
            error instanceof AuthAccessError
              ? error.message
              : 'Workspace verification is unavailable. Retry or ask the development administrator for help. No protected access was granted.',
        })
      } finally {
        if (operation.current === revision) revalidationInFlight.current = false
      }
    }
    void load()
    return () => controller.abort()
  }, [session, sessionStatus, internal, refresh, resetWorkspaceHandoff])

  useEffect(() => {
    if (!session || !internal) return
    const revalidate = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    const clear = () => {
      ++operation.current
      revalidationInFlight.current = false
      clearWorkspaceContext()
      setResult(null)
    }
    const interval = window.setInterval(revalidate, 30_000)
    window.addEventListener('focus', revalidate)
    window.addEventListener('pageshow', revalidate)
    window.addEventListener('pagehide', clear)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('pageshow', revalidate)
      window.removeEventListener('pagehide', clear)
    }
  }, [session, internal, refreshAccess])

  // Reject stale authority even during the render before effect cancellation.
  const current =
    internal &&
    sessionStatus === 'authenticated' &&
    hasCurrentProfile(result?.token, session?.access_token) &&
    result?.subject === session?.user.id
      ? result
      : null
  const profile = current?.access === 'ready' ? current.profile : null
  const accessRefreshing = current?.refresh !== refresh
  const claimWorkspaceHandoff = useCallback(() => {
    const subject = sessionRef.current?.user.id
    if (
      !profile ||
      accessRefreshing ||
      current?.token !== sessionRef.current?.access_token ||
      current?.subject !== subject ||
      !subject ||
      handoffSubject.current === subject
    )
      return false
    handoffSubject.current = subject
    return true
  }, [profile, accessRefreshing, current?.token, current?.subject])
  return (
    <CurrentRoleContext.Provider
      value={{
        role: profile ? getProfileRole(profile) : null,
        assignedProjectIds: profile?.assignedProjectIds ?? [],
        profile,
        access: current?.access ?? (internal && session ? 'loading' : 'blocked'),
        accessError: current?.error ?? null,
        refreshAccess,
        accessRefreshing,
        claimWorkspaceHandoff,
        resetWorkspaceHandoff,
      }}
    >
      {children}
    </CurrentRoleContext.Provider>
  )
}

export const useCurrentRole = () => {
  const context = useContext(CurrentRoleContext)
  if (!context) throw new Error('useCurrentRole must be used within CurrentRoleProvider')
  return context
}
