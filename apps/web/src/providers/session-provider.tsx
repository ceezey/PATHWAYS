'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'

import { clearBeneficiaryAccess } from '@/lib/auth/beneficiary-step-up'
import {
  clearPrototypeSession,
  readPrototypeSession,
  writePrototypeSession,
} from '@/lib/auth/prototype-session'
import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { PrototypeSession, SessionContextValue } from '@/types/auth'

const SessionContext = createContext<SessionContextValue | null>(null)

const DEV_BYPASS_EMAIL = 'dev-admin@pathways.local'

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [prototypeSession, setPrototypeSession] = useState<PrototypeSession | null>(null)
  const [status, setStatus] = useState<SessionContextValue['status']>('loading')
  const supabase = getBrowserSupabaseClient()

  const refreshSession = async () => {
    if (webSetupState.guiPrototypeModeEnabled) {
      const storedPrototypeSession = readPrototypeSession()
      setPrototypeSession(storedPrototypeSession)
      setSession(null)
      setStatus(storedPrototypeSession ? 'authenticated' : 'unauthenticated')
      return
    }

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

  const signInWithPrototype = async (nextPrototypeSession: PrototypeSession) => {
    writePrototypeSession(nextPrototypeSession)
    setPrototypeSession(nextPrototypeSession)
    setSession(null)
    setStatus('authenticated')
  }

  const signOut = async () => {
    if (webSetupState.guiPrototypeModeEnabled) {
      clearPrototypeSession()
      clearBeneficiaryAccess()
      setPrototypeSession(null)
      setSession(null)
      setStatus('unauthenticated')
      return
    }

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
    if (webSetupState.guiPrototypeModeEnabled) {
      const storedPrototypeSession = readPrototypeSession()
      setPrototypeSession(storedPrototypeSession)
      setSession(null)
      setStatus(storedPrototypeSession ? 'authenticated' : 'unauthenticated')
      return
    }

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
        prototypeSession,
        status,
        configured:
          webSetupState.supabaseConfigured ||
          webSetupState.authBypassEnabled ||
          webSetupState.guiPrototypeModeEnabled,
        isBypassed: webSetupState.authBypassEnabled,
        isPrototypeSession: webSetupState.guiPrototypeModeEnabled && Boolean(prototypeSession),
        prototypeModeEnabled: webSetupState.guiPrototypeModeEnabled,
        email:
          prototypeSession?.email ??
          session?.user.email ??
          (webSetupState.authBypassEnabled ? DEV_BYPASS_EMAIL : null),
        refreshSession,
        signInWithPrototype,
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
