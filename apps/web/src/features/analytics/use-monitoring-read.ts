'use client'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'

/** In-memory only. A result from a previous user, token, scope or filter is never rendered. */
export function useMonitoringRead<T>(selection: string, load: () => Promise<T>) {
  const { profile, access } = useCurrentRole()
  const { session } = useSession()
  const authority = JSON.stringify([
    session?.access_token,
    session?.user.id,
    profile?.id,
    profile?.userId,
    profile?.organizationId,
    profile?.roles,
    profile?.permissions,
    profile?.assignedProjectIds,
  ])
  const [revision, setRevision] = useState(0)
  const key = `${authority}:${selection}`
  const ready = access === 'ready' && Boolean(profile && session)
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null } | null>(
    null,
  )
  const [pending, setPending] = useState(true)

  useEffect(() => {
    let active = true
    let inFlight = false
    let generation = 0
    const refresh = async () => {
      if (!ready || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      const request = ++generation
      setPending(true)
      try {
        const data = await load()
        if (active && request === generation) setState({ key, data, error: null })
      } catch {
        // A failed verification/read removes the prior result, not a zero-valued fallback.
        if (active && request === generation)
          setState({
            key,
            data: null,
            error: 'Monitoring could not be verified. Check access and the API, then retry.',
          })
      } finally {
        if (request === generation) {
          inFlight = false
          if (active) setPending(false)
        }
      }
    }
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const hide = () => {
      ++generation
      inFlight = false
      if (active) setState(null)
    }
    window.addEventListener('pagehide', hide)
    return () => {
      active = false
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('pagehide', hide)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [key, ready, load])

  const current = ready && state?.key === key ? state : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: pending || (ready && !current),
    reload: () => setRevision((value) => value + 1),
    authorityKey: authority,
  }
}
