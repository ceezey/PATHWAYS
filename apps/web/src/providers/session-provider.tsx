'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'

import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { SessionContextValue } from '@/types/auth'

const SessionContext = createContext<SessionContextValue | null>(null)

const DEV_BYPASS_EMAIL = 'dev-admin@pathways.local'

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const supabase = getBrowserSupabaseClient()

  const refreshSession = async () => {
    if (webSetupState.authBypassEnabled) {
      setStatus('authenticated')
      return
    }

    if (!supabase) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    setStatus(data.session ? 'authenticated' : 'unauthenticated')
  }

  const signOut = async () => {
    if (webSetupState.authBypassEnabled) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    if (!supabase) {
      setSession(null)
      setStatus('unauthenticated')
      return
    }

    await supabase.auth.signOut()
    setSession(null)
    setStatus('unauthenticated')
  }

  useEffect(() => {
    if (webSetupState.authBypassEnabled) {
      setStatus('authenticated')
      return
    }

    if (!supabase) {
      setStatus('unauthenticated')
      return
    }

    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return
      }

      setSession(data.session)
      setStatus(data.session ? 'authenticated' : 'unauthenticated')
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
        configured: webSetupState.supabaseConfigured || webSetupState.authBypassEnabled,
        isBypassed: webSetupState.authBypassEnabled,
        email: session?.user.email ?? (webSetupState.authBypassEnabled ? DEV_BYPASS_EMAIL : null),
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
