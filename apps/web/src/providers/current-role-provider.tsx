'use client'

import {
  type ApplicationContext,
  type ApplicationProfile,
  type MfaStatus,
  getProfileRole,
} from '@/features/auth/auth-access'
import { createVerificationFlight } from '@/features/auth/verification-flight'
import {
  clearWorkspaceContext,
  contextCookieName,
  decodeWorkspaceContext,
  encodeWorkspaceContext,
} from '@/features/auth/workspace-access'
import {
  type WorkspaceAccess,
  type WorkspaceVerification,
  verificationFailure,
  verifyWorkspace,
} from '@/features/auth/workspace-verification'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import { isInternalPath } from '@/lib/rbac/route-access'
import type { PathwaysRole } from '@/types/pathways-role'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface CurrentRoleContextValue {
  role: PathwaysRole | null
  assignedProjectIds: readonly string[]
  profile: ApplicationProfile | null
  mfaStatus: MfaStatus | null
  access: WorkspaceAccess
  accessError: string | null
  refreshAccess: () => void
  accessRefreshing: boolean
  verificationRevision: number
  claimWorkspaceHandoff: () => boolean
  resetWorkspaceHandoff: () => void
}

const CurrentRoleContext = createContext<CurrentRoleContextValue | null>(null)
type Result = WorkspaceVerification & {
  token: string
  subject: string
  refresh: number
  revision: number
}

export const CurrentRoleProvider = ({ children }: { children: React.ReactNode }) => {
  const { session, status: sessionStatus } = useSession()
  const token = session?.access_token ?? null
  const subject = session?.user.id ?? null
  const internal = isInternalPath(usePathname())
  const [result, setResult] = useState<Result | null>(null)
  const [refresh, setRefresh] = useState(0)
  const identityRef = useRef({ token, subject, internal, sessionStatus })
  identityRef.current = { token, subject, internal, sessionStatus }
  const operation = useRef(0)
  const inFlight = useRef(false)
  const flight = useRef(createVerificationFlight<WorkspaceVerification>())
  const selected = useRef<{ subject: string; context: ApplicationContext } | null>(null)
  const handoffSubject = useRef<string | null>(null)
  const resetWorkspaceHandoff = useCallback(() => {
    handoffSubject.current = null
  }, [])
  const refreshAccess = useCallback(() => {
    const identity = identityRef.current
    if (!identity.internal || identity.sessionStatus !== 'authenticated' || inFlight.current) return
    inFlight.current = true
    setRefresh((value) => value + 1)
  }, [])

  useEffect(() => {
    const revision = ++operation.current
    if (handoffSubject.current !== subject) handoffSubject.current = null
    if (selected.current?.subject !== subject) selected.current = null
    if (!internal || sessionStatus !== 'authenticated' || !token || !subject) {
      flight.current.cancel()
      inFlight.current = false
      setResult(null)
      // Public navigation and temporary token refresh are not sign-out.
      if (sessionStatus === 'unauthenticated') {
        selected.current = null
        clearWorkspaceContext()
      }
      return
    }
    inFlight.current = true
    const owner = flight.current
    const cookie = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${contextCookieName}=`))
    const hint =
      selected.current?.context ??
      decodeWorkspaceContext(cookie?.slice(contextCookieName.length + 1), subject)
    const active = () =>
      revision === operation.current &&
      identityRef.current.internal &&
      identityRef.current.sessionStatus === 'authenticated' &&
      identityRef.current.token === token &&
      identityRef.current.subject === subject
    const commit = (value: WorkspaceVerification) => {
      if (!active()) return
      try {
        if (value.clearContext) {
          selected.current = null
          clearWorkspaceContext()
        }
        if (value.profile) {
          selected.current = {
            subject,
            context: { userId: value.profile.userId, organizationId: value.profile.organizationId },
          }
          document.cookie = `${contextCookieName}=${encodeWorkspaceContext(value.profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
        }
      } catch {
        selected.current = null
        setResult({ ...verificationFailure(undefined), token, subject, refresh, revision })
        return
      }
      if (value.access === 'mfa_required' || value.access === 'session_expired')
        resetWorkspaceHandoff()
      setResult({ ...value, token, subject, refresh, revision })
    }
    void owner
      .run(JSON.stringify([token, subject, refresh]), (signal) =>
        verifyWorkspace(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          token,
          subject,
          signal,
          hint,
          undefined,
          webEnv.NEXT_PUBLIC_API_BASE_URL,
        ),
      )
      .then(commit, (error: unknown) => {
        if (active()) commit(verificationFailure(error))
      })
      .finally(() => {
        if (active()) inFlight.current = false
      })
    return () => {
      ++operation.current
      owner.cancel()
      inFlight.current = false
    }
  }, [token, subject, sessionStatus, internal, refresh, resetWorkspaceHandoff])

  useEffect(() => {
    if (!token || !subject || !internal || sessionStatus !== 'authenticated') return
    const revalidateAfterReconnect = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    const revalidateRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted && document.visibilityState === 'visible') refreshAccess()
    }
    // Revalidate only on trust-boundary recovery. Focus and visibility events
    // are interaction-adjacent and can fire repeatedly while using the app or
    // DevTools. Auth token changes are handled by SessionProvider, routes retain
    // their own checks, and no idle polling is introduced here.
    window.addEventListener('online', revalidateAfterReconnect)
    window.addEventListener('pageshow', revalidateRestoredPage)
    return () => {
      window.removeEventListener('online', revalidateAfterReconnect)
      window.removeEventListener('pageshow', revalidateRestoredPage)
    }
  }, [token, subject, internal, sessionStatus, refreshAccess])

  const current =
    internal && sessionStatus === 'authenticated' && result?.subject === subject ? result : null
  const profile = current?.access === 'ready' ? current.profile : null
  const accessRefreshing = Boolean(
    internal && token && (!current || current.token !== token || current.refresh !== refresh),
  )
  // Stable assurance metadata prevents same-subject background refreshes from
  // resetting an in-progress TOTP form. A changed subject still invalidates it.
  const mfaSubject = current?.mfa?.authUserId
  const mfaAal = current?.mfa?.aal
  const mfaEnabled = current?.mfa?.applicationAccessEnabled
  const mfaStatus = useMemo<MfaStatus | null>(
    () =>
      mfaSubject && mfaAal && mfaEnabled !== undefined
        ? {
            authUserId: mfaSubject,
            aal: mfaAal,
            applicationAccessEnabled: mfaEnabled,
            enrollmentAllowed: true,
          }
        : null,
    [mfaSubject, mfaAal, mfaEnabled],
  )
  const claimWorkspaceHandoff = useCallback(() => {
    const identity = identityRef.current
    if (
      !profile ||
      accessRefreshing ||
      current?.token !== identity.token ||
      current?.subject !== identity.subject ||
      !identity.subject ||
      handoffSubject.current === identity.subject
    )
      return false
    handoffSubject.current = identity.subject
    return true
  }, [profile, accessRefreshing, current?.token, current?.subject])
  return (
    <CurrentRoleContext.Provider
      value={{
        role: profile ? getProfileRole(profile) : null,
        assignedProjectIds: profile?.assignedProjectIds ?? [],
        profile,
        mfaStatus,
        access:
          current?.access ??
          (internal && sessionStatus !== 'unauthenticated' ? 'loading' : 'blocked'),
        accessError: current?.error ?? null,
        refreshAccess,
        accessRefreshing,
        verificationRevision: current?.revision ?? 0,
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
