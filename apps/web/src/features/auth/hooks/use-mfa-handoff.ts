import type { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { useCurrentRole } from '@/hooks/use-current-role'
import type { useSession } from '@/hooks/use-session'
import type { MfaStatus } from '@/lib/auth/auth-access'
import { landingPath } from '@/lib/rbac/policy'
import type { Dispatch, SetStateAction } from 'react'

type CurrentRole = ReturnType<typeof useCurrentRole>

export type MfaHandoff = 'idle' | 'opening' | 'stalled'

export const useMfaHandoff = ({
  userId,
  status,
  configured,
  allowedAccount,
  current,
  access,
  accessRefreshing,
  claimWorkspaceHandoff,
  profile,
  router,
  setAccepted,
}: {
  userId: string | undefined
  status: ReturnType<typeof useSession>['status']
  configured: boolean
  allowedAccount: boolean
  current: { status: MfaStatus } | null
  access: CurrentRole['access']
  accessRefreshing: boolean
  claimWorkspaceHandoff: CurrentRole['claimWorkspaceHandoff']
  profile: CurrentRole['profile']
  router: ReturnType<typeof useRouter>
  setAccepted: Dispatch<SetStateAction<boolean>>
}) => {
  const handoffAttempted = useRef(false)
  const handoffUser = useRef(userId)
  const [handoff, setHandoff] = useState<MfaHandoff>('idle')

  useEffect(() => {
    if (handoffUser.current !== userId) {
      handoffUser.current = userId
      handoffAttempted.current = false
      setHandoff('idle')
      setAccepted(false)
    }
  }, [userId, setAccepted])

  useEffect(() => {
    if (current?.status.aal === 'aal1') {
      handoffAttempted.current = false
      setHandoff('idle')
    }
    if (
      !configured ||
      status !== 'authenticated' ||
      !allowedAccount ||
      current?.status.aal !== 'aal2' ||
      !current.status.applicationAccessEnabled ||
      access !== 'ready' ||
      accessRefreshing ||
      handoffAttempted.current
    )
      return
    handoffAttempted.current = true
    if (!claimWorkspaceHandoff()) {
      setHandoff('stalled')
      return
    }
    setHandoff('opening')
    try {
      // Fixed destinations only; each independently checks the live session, context and route.
      router.replace(landingPath(profile))
    } catch {
      setHandoff('stalled')
    }
  }, [
    configured,
    status,
    allowedAccount,
    current,
    access,
    accessRefreshing,
    claimWorkspaceHandoff,
    profile,
    router,
  ])

  useEffect(() => {
    if (handoff !== 'opening') return
    const timeout = window.setTimeout(() => setHandoff('stalled'), 30_000)
    return () => window.clearTimeout(timeout)
  }, [handoff])

  return handoff
}
