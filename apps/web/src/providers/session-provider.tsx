'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { clearAllProofFilePreviews } from '@/lib/files/proof-file-previews'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateRestoredSession } from '@/lib/supabase/session-restoration'
import type { SessionContextValue } from '@/types/auth'

const invalidateSensitiveState = () => {
  clearSensitiveDraftStorage()
  clearAllProofFilePreviews()
}

const SessionContext = createContext<SessionContextValue | null>(null)

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const revision = useRef(0)
  const validatedAccessToken = useRef<string | null>(null)
  const validatedSubject = useRef<string | null>(null)
  const supabase = getBrowserSupabaseClient()

  const refreshSession = useCallback(async () => {
    const requestRevision = ++revision.current
    if (!supabase) {
      invalidateSensitiveState()
      validatedAccessToken.current = null
      validatedSubject.current = null
      setSession(null)
      setStatus('unauthenticated')
      return null
    }

    const nextSession = await validateRestoredSession(supabase.auth)
    if (requestRevision !== revision.current) return null
    if (
      !nextSession ||
      (validatedSubject.current && validatedSubject.current !== nextSession.user.id)
    )
      invalidateSensitiveState()
    validatedAccessToken.current = nextSession?.access_token ?? null
    validatedSubject.current = nextSession?.user.id ?? null
    setSession(nextSession)
    setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    return nextSession
  }, [supabase])

  const signOut = async () => {
    ++revision.current
    invalidateSensitiveState()
    validatedAccessToken.current = null
    validatedSubject.current = null
    setSession(null)
    setStatus('unauthenticated')
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error)
        throw new Error('Sign-out could not be confirmed. Close this private browser window.')
    }
  }

  useEffect(() => {
    clearSensitiveDraftStorage(true)
    if (!supabase) {
      invalidateSensitiveState()
      validatedAccessToken.current = null
      validatedSubject.current = null
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    void refreshSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      ++revision.current
      if (!nextSession) {
        invalidateSensitiveState()
        validatedAccessToken.current = null
        validatedSubject.current = null
        setSession(null)
        setStatus('unauthenticated')
        return
      }
      if (validatedAccessToken.current === nextSession.access_token) {
        setSession(nextSession)
        setStatus('authenticated')
        return
      }

      // Auth callbacks must stay synchronous. Validate new/restored cookie state
      // online in a separate task before exposing it as authenticated. A token
      // refresh for the already-verified subject is a background check: retain
      // the current UI until validation allows the new token or fails closed.
      if (
        validatedAccessToken.current === null ||
        validatedSubject.current !== nextSession.user.id
      ) {
        if (validatedSubject.current && validatedSubject.current !== nextSession.user.id)
          invalidateSensitiveState()
        setSession(null)
        setStatus('loading')
      }
      window.setTimeout(() => void refreshSession(), 0)
    })

    return () => {
      ++revision.current
      validatedAccessToken.current = null
      validatedSubject.current = null
      subscription.unsubscribe()
    }
  }, [refreshSession, supabase])

  return (
    <SessionContext.Provider
      value={{
        session,
        status,
        configured: Boolean(supabase),
        email: session?.user.email ?? null,
        refreshSession,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export const useSessionContext = () => {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider')
  }

  return context
}
