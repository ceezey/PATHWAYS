'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  type ApplicationContext,
  type ApplicationProfile,
  AuthAccessError,
  applicationContextSchema,
  getProfileRole,
  hasCurrentProfile,
  parseApplicationProfile,
  parseMfaStatus,
  requestAuthJson,
} from '@/features/auth/auth-access'
import {
  contextCookieName,
  decodeWorkspaceContext,
  encodeWorkspaceContext,
} from '@/features/auth/workspace-access'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import type { PathwaysRole } from '@/types/pathways-role'

interface CurrentRoleContextValue {
  role: PathwaysRole | null
  assignedProjectIds: readonly string[]
  profile: ApplicationProfile | null
  access: 'loading' | 'mfa_required' | 'blocked' | 'ready'
  accessError: string | null
  setApplicationContext: (context: ApplicationContext) => void
  refreshAccess: () => void
}

const CurrentRoleContext = createContext<CurrentRoleContextValue | null>(null)

export const CurrentRoleProvider = ({ children }: { children: React.ReactNode }) => {
  const { session, status: sessionStatus } = useSession()
  const [selection, setSelection] = useState<{
    authUserId: string
    context: ApplicationContext
  } | null>(null)
  const [result, setResult] = useState<{
    token: string
    refresh: number
    access: CurrentRoleContextValue['access']
    profile: ApplicationProfile | null
    error: string | null
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const setApplicationContext = useCallback((context: ApplicationContext) => {
    const authUserId = sessionRef.current?.user.id
    if (!authUserId) return
    setResult(null)
    setRefresh((value) => value + 1)
    setSelection({ authUserId, context: applicationContextSchema.parse(context) })
  }, [])
  const refreshAccess = useCallback(() => {
    setResult(null)
    setRefresh((value) => value + 1)
  }, [])

  useEffect(() => {
    // Initial hydration is not sign-out. Keep non-secret selectors until the
    // session provider knows whether a returning user is authenticated.
    if (sessionStatus === 'loading') return
    if (!session) {
      setResult(null)
      setSelection(null)
      document.cookie = `${contextCookieName}=; Path=/; SameSite=Strict; Max-Age=0`
      return
    }
    const controller = new AbortController()
    const token = session.access_token
    const authUserId = session.user.id
    const stored = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${contextCookieName}=`))
      ?.slice(contextCookieName.length + 1)
    const context =
      selection?.authUserId === authUserId
        ? selection.context
        : decodeWorkspaceContext(stored, authUserId)
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
        if (controller.signal.aborted) return
        if (status.aal !== 'aal2' || !status.applicationAccessEnabled) {
          setResult({
            token,
            refresh,
            profile: null,
            error: null,
            access: status.aal === 'aal2' ? 'blocked' : 'mfa_required',
          })
          return
        }
        if (!context) {
          setResult({ token, refresh, profile: null, access: 'blocked', error: null })
          return
        }
        const profile = parseApplicationProfile(
          await requestAuthJson(
            webEnv.NEXT_PUBLIC_API_BASE_URL,
            '/auth/me',
            token,
            controller.signal,
            context,
          ),
        )
        if (
          profile.id !== authUserId ||
          profile.userId !== context.userId ||
          profile.organizationId !== context.organizationId
        ) {
          throw new Error('Application context mismatch.')
        }
        if (!controller.signal.aborted) {
          document.cookie = `${contextCookieName}=${encodeWorkspaceContext(profile)}; Path=/; SameSite=Strict`
          setResult({ token, refresh, access: 'ready', profile, error: null })
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            token,
            refresh,
            access: 'blocked',
            profile: null,
            error:
              error instanceof AuthAccessError
                ? error.message
                : 'The API returned an unexpected application profile. No protected access was granted.',
          })
      }
    }
    void load()
    return () => controller.abort()
  }, [session, sessionStatus, selection, refresh])

  useEffect(() => {
    if (!session) return
    const revalidate = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    const interval = window.setInterval(revalidate, 30_000)
    window.addEventListener('focus', revalidate)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', revalidate)
    }
  }, [session, refreshAccess])

  // No previous profile survives a token/account change, including the render
  // before the next effect cancels an old request. Metadata is never authority.
  const current =
    hasCurrentProfile(result?.token, session?.access_token) && result?.refresh === refresh
      ? result
      : null
  const profile = current?.access === 'ready' ? current.profile : null
  return (
    <CurrentRoleContext.Provider
      value={{
        role: profile ? getProfileRole(profile) : null,
        assignedProjectIds: profile?.assignedProjectIds ?? [],
        profile,
        access: current?.access ?? (session ? 'loading' : 'blocked'),
        accessError: current?.error ?? null,
        setApplicationContext,
        refreshAccess,
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
