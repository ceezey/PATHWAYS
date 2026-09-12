'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateRestoredSession } from '@/lib/supabase/session-restoration'
import type { SessionContextValue } from '@/types/auth'

const SessionContext = createContext<SessionContextValue | null>(null)

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const revision = useRef(0)
  const validatedAccessToken = useRef<string | null>(null)
  const supabase = getBrowserSupabaseClient()

  const refreshSession = useCallback(async () => {
    const requestRevision = ++revision.current
    if (!supabase) {
      validatedAccessToken.current = null
      setSession(null)
      setStatus('unauthenticated')
      return null
    }

    const nextSession = await validateRestoredSession(supabase.auth)
    if (requestRevision !== revision.current) return null
    validatedAccessToken.current = nextSession?.access_token ?? null
    setSession(nextSession)
    setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    return nextSession
  }, [supabase])

  const signOut = async () => {
    ++revision.current
    validatedAccessToken.current = null
    setSession(null)
    setStatus('unauthenticated')
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error)
        throw new Error('Sign-out could not be confirmed. Close this private browser window.')
    }
  }

  useEffect(() => {
    if (!supabase) {
      validatedAccessToken.current = null
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
        validatedAccessToken.current = null
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
      // online in a separate task before exposing it as authenticated.
      setSession(null)
      setStatus('loading')
      window.setTimeout(() => void refreshSession(), 0)
    })

    return () => {
      ++revision.current
      validatedAccessToken.current = null
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
