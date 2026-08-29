'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'

import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { SessionContextValue } from '@/types/auth'

const SessionContext = createContext<SessionContextValue | null>(null)

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const supabase = getBrowserSupabaseClient()

  const refreshSession = async () => {
    if (!supabase) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    const { data, error } = await supabase.auth.getSession()
    const nextSession = error ? null : data.session
    setSession(nextSession)
    setStatus(nextSession ? 'authenticated' : 'unauthenticated')
  }

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }

    setSession(null)
    setStatus('unauthenticated')
  }

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    let mounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return
      }

      const nextSession = error ? null : data.session
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <SessionContext.Provider
      value={{
        session,
        status,
        configured: webSetupState.supabaseConfigured,
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
