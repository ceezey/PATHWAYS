'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { SessionContextValue } from '@/types/auth'

const SessionContext = createContext<SessionContextValue | null>(null)

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const revision = useRef(0)
  const supabase = getBrowserSupabaseClient()

  const refreshSession = useCallback(async () => {
    const requestRevision = ++revision.current
    if (!supabase) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (requestRevision !== revision.current) return
      const nextSession = error ? null : data.session
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    } catch {
      if (requestRevision !== revision.current) return
      setSession(null)
      setStatus('unauthenticated')
    }
  }, [supabase])

  const signOut = async () => {
    ++revision.current
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
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    void refreshSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      ++revision.current
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      ++revision.current
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
