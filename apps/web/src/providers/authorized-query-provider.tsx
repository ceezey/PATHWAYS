'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'

import type { ApplicationProfile } from '@/features/auth/auth-access'
import { useCurrentRole } from '@/hooks/use-current-role'
import { sensitiveDraftGeneration, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError } from '@/lib/services/pathways-client'

type Permission = Parameters<typeof principalHasAtomicPermission>[1]
type Context = {
  identity: string | null
  profile: ApplicationProfile | null
  inProject: (projectId: string | null) => boolean
  isCurrent: () => boolean
}
const AuthorizedQueryContext = createContext<Context | null>(null)

/** Every request still authorizes at the API. Cache identity contains no credentials. */
export function AuthorizedQueryProvider({ children }: { children: React.ReactNode }) {
  const { profile, role, assignedProjectIds, access } = useCurrentRole()
  const client = useQueryClient()
  const owner = useSensitiveDraftOwner(
    profile,
    'query-scope',
    'projects.read',
    null,
    null,
    access === 'ready',
  )
  const identity =
    owner && profile
      ? JSON.stringify([
          profile.id,
          profile.organizationId,
          profile.userId,
          [...profile.roles].sort(),
          [...profile.permissions].sort(),
          [...profile.assignedProjectIds].sort(),
          owner.generation,
        ])
      : null
  const current = useRef(identity)
  const mounted = useRef(true)
  current.current = identity
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      client.removeQueries({ queryKey: ['pathways-private'] })
    }
  }, [client])
  useEffect(() => {
    const obsolete = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === 'pathways-private' && query.queryKey[1] !== identity,
    }
    void client.cancelQueries(obsolete)
    client.removeQueries(obsolete)
  }, [client, identity])
  const ownerIsCurrent = owner?.isCurrent
  const ownerGeneration = owner?.generation
  const value = useMemo<Context>(
    () => ({
      identity,
      profile: identity ? profile : null,
      inProject: (projectId) =>
        projectId === null ||
        Boolean(role && canAccessProjectForRole(role, projectId, assignedProjectIds)),
      isCurrent: () =>
        Boolean(
          identity &&
            mounted.current &&
            current.current === identity &&
            ownerIsCurrent?.() &&
            sensitiveDraftGeneration() === ownerGeneration,
        ),
    }),
    [identity, profile, role, assignedProjectIds, ownerIsCurrent, ownerGeneration],
  )
  return (
    <AuthorizedQueryContext.Provider key={identity ?? 'unauthorized'} value={value}>
      {children}
    </AuthorizedQueryContext.Provider>
  )
}

export function useAuthorizedRead<T>(
  resource: string,
  projectId: string | null,
  permission: Permission,
  read: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const context = useContext(AuthorizedQueryContext)
  const client = useQueryClient()
  if (!context) throw new Error('AuthorizedQueryProvider is required.')
  const eligible = Boolean(
    enabled &&
      context.identity &&
      principalHasAtomicPermission(context.profile, permission) &&
      context.inProject(projectId),
  )
  const result = useQuery({
    queryKey: ['pathways-private', context.identity, resource, projectId],
    enabled: eligible,
    queryFn: async ({ signal }) => {
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      const value = await read(signal)
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      return value
    },
    // Reauthorize on every mounted read; deduplicate simultaneous requests only.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  return {
    ...result,
    data: eligible && context.isCurrent() ? result.data : undefined,
    eligible,
    replaceData: (update: (previous: T | undefined) => T) => {
      if (eligible && context.isCurrent())
        client.setQueryData<T>(['pathways-private', context.identity, resource, projectId], update)
    },
  }
}
