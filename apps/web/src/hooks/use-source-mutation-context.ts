'use client'
import type { ApplicationProfile } from '@/features/auth/auth-access'
import { sensitiveDraftGeneration, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import type { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { type SourceMutationContext, sourceMutationTickets } from '@/lib/services/source-mutation'
import { useEffect, useMemo, useRef } from 'react'
type Permission = Parameters<typeof principalHasAtomicPermission>[1]
export function useSourceMutationContext(
  profile: ApplicationProfile | null,
  permission: Permission,
  projectId: string | null,
  resourceId: string | null,
  enabled = true,
): SourceMutationContext | null {
  const owner = useSensitiveDraftOwner(
    profile,
    'source-mutation',
    permission,
    projectId,
    resourceId,
    enabled,
  )
  const profilePrincipalKey = profile
    ? JSON.stringify([
        profile.id,
        profile.organizationId,
        profile.userId,
        [...profile.roles].sort(),
        [...profile.permissions].sort(),
        [...profile.assignedProjectIds].sort(),
        sensitiveDraftGeneration(),
      ])
    : null
  const principalKey = owner ? profilePrincipalKey : null
  useEffect(() => {
    sourceMutationTickets.synchronizePrincipal(profilePrincipalKey)
  }, [profilePrincipalKey])
  const operationIdentity = owner && principalKey ? JSON.stringify([principalKey, owner.key]) : null
  const latest = useRef({ identity: operationIdentity, revision: 0 })
  const mounted = useRef(true)
  if (latest.current.identity !== operationIdentity)
    latest.current = { identity: operationIdentity, revision: latest.current.revision + 1 }
  const revision = latest.current.revision
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useMemo(
    () =>
      owner && principalKey && operationIdentity
        ? {
            principalKey,
            isCurrent: () =>
              mounted.current &&
              latest.current.identity === operationIdentity &&
              latest.current.revision === revision &&
              owner.isCurrent(),
          }
        : null,
    [owner, principalKey, operationIdentity, revision],
  )
}
