'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { ApplicationProfile } from '@/features/auth/auth-access'
import { useCurrentRole } from '@/hooks/use-current-role'
import { sensitiveDraftGeneration, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import {
  AUTHORIZATION_DENIED_EVENT,
  WRITE_COMMITTED_EVENT,
} from '@/lib/services/authorized-read-events'
import { PathwaysClientError } from '@/lib/services/pathways-client'

type Permission = Parameters<typeof principalHasAtomicPermission>[1]
type Context = {
  identity: string | null
  profile: ApplicationProfile | null
  inProject: (projectId: string | null) => boolean
  isCurrent: () => boolean
  /** Denial epoch as React state, so every reader re-renders when access is denied. */
  epoch: number
  /** Latest epoch, read when a fetch starts or cached data is replaced. */
  currentEpoch: () => number
  deny: () => void
  /** True once per query per epoch: the single automatic re-read after a denial. */
  claimReread: (key: string, epoch: number) => boolean
}
/** Cached value plus the denial epoch its read started in. */
type Envelope<T> = { epoch: number; value: T }
const AuthorizedQueryContext = createContext<Context | null>(null)
const privateKey = ['pathways-private'] as const

/**
 * `summary` reads (lists and summaries) may be reused for 30 seconds within the same
 * organization, user, role, permissions, assignments and project. `live` reads always
 * re-verify. `live` is the default.
 */
export type AuthorizedReadFreshness = 'summary' | 'live'
export const SUMMARY_READ_STALE_MS = 30_000
/** Beneficiary detail, step-up protected and import batch-status reads are never cached. */
export const LIVE_ONLY_RESOURCE = /^(beneficiar|step-up|import-batch)/

export function authorizedReadPolicy(resource: string, freshness: AuthorizedReadFreshness) {
  return freshness === 'summary' && !LIVE_ONLY_RESOURCE.test(resource)
    ? { staleTime: SUMMARY_READ_STALE_MS, gcTime: SUMMARY_READ_STALE_MS, refetchOnMount: true }
    : { staleTime: 0, gcTime: 0, refetchOnMount: 'always' as const }
}

const isAuthorizationFailure = (error: unknown) =>
  error instanceof PathwaysClientError &&
  (error.code === 'unauthorized' ||
    error.code === 'forbidden' ||
    error.status === 401 ||
    error.status === 403)

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
  const epochRef = useRef(0)
  const [epoch, setEpoch] = useState(0)
  const rereads = useRef(new Map<string, number>())
  current.current = identity
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      client.removeQueries({ queryKey: privateKey })
    }
  }, [client])
  // Sign-out and workspace changes produce a new identity: every other identity's entry goes.
  useEffect(() => {
    const obsolete = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === privateKey[0] && query.queryKey[1] !== identity,
    }
    void client.cancelQueries(obsolete)
    client.removeQueries(obsolete)
  }, [client, identity])
  const deny = useRef(() => {
    // Unobserved entries go. Observed entries are not removed (that would refetch them in
    // a loop): their pre-denial data is masked by epoch and each re-reads at most once.
    epochRef.current += 1
    setEpoch(epochRef.current)
    client.removeQueries({ queryKey: privateKey, type: 'inactive' })
    void client.invalidateQueries({ queryKey: privateKey, refetchType: 'none' })
  }).current
  useEffect(() => {
    // Reads are GET-only and never emit this event, so the active refetch cannot loop.
    let queued = false
    const written = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        client.removeQueries({ queryKey: privateKey, type: 'inactive' })
        void client.invalidateQueries({ queryKey: privateKey, refetchType: 'active' })
      })
    }
    window.addEventListener(AUTHORIZATION_DENIED_EVENT, deny)
    window.addEventListener(WRITE_COMMITTED_EVENT, written)
    return () => {
      window.removeEventListener(AUTHORIZATION_DENIED_EVENT, deny)
      window.removeEventListener(WRITE_COMMITTED_EVENT, written)
    }
  }, [client, deny])
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
      epoch,
      currentEpoch: () => epochRef.current,
      deny,
      claimReread: (key, wanted) => {
        if (rereads.current.get(key) === wanted) return false
        rereads.current.set(key, wanted)
        return true
      },
    }),
    [identity, profile, role, assignedProjectIds, ownerIsCurrent, ownerGeneration, deny, epoch],
  )
  return (
    <AuthorizedQueryContext.Provider key={identity ?? 'unauthorized'} value={value}>
      {children}
    </AuthorizedQueryContext.Provider>
  )
}

/**
 * The query key always carries the organization, user, role, permissions, assignments
 * and owner generation (`identity`), plus the resource and project id.
 */
export function useAuthorizedRead<T>(
  resource: string,
  projectId: string | null,
  permission: Permission,
  read: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  options: { freshness?: AuthorizedReadFreshness } = {},
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
  const queryKey = [privateKey[0], context.identity, resource, projectId]
  const keyText = JSON.stringify(queryKey)
  const result = useQuery<Envelope<T>>({
    queryKey,
    enabled: eligible,
    queryFn: async ({ signal }) => {
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      // Data belongs to the epoch its request started in; a denial during flight masks it.
      const startedEpoch = context.currentEpoch()
      let value: T
      try {
        value = await read(signal)
      } catch (error) {
        if (isAuthorizationFailure(error)) context.deny()
        throw error
      }
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      return { epoch: startedEpoch, value }
    },
    ...authorizedReadPolicy(resource, options.freshness ?? 'live'),
    // No read is retried; a 401 or 403 in particular is final until access changes.
    retry: false,
    refetchOnWindowFocus: false,
  })
  const ownDenial = result.error !== null && isAuthorizationFailure(result.error)
  const masked = Boolean(eligible && result.data && result.data.epoch < context.epoch)
  // A query whose own last result was a 401/403 never re-reads by itself, so it cannot loop.
  const canReread = masked && !ownDenial && !result.isError
  // Epoch whose single automatic re-read has settled without replacing the masked data.
  const [settledEpoch, setSettledEpoch] = useState(-1)
  const { refetch } = result
  useEffect(() => {
    if (!canReread || result.isFetching) return
    const wanted = context.epoch
    if (!context.claimReread(keyText, wanted)) return
    void refetch().finally(() => setSettledEpoch(wanted))
  }, [canReread, result.isFetching, context, keyText, refetch])
  // Masked data is always an explicit state: re-verifying (pending) or an error to retry.
  const stalled = canReread && settledEpoch === context.epoch && !result.isFetching
  const reverifying = canReread && !stalled
  const visible = eligible && context.isCurrent() && !masked
  return {
    ...result,
    data: visible ? result.data?.value : undefined,
    error: stalled
      ? new PathwaysClientError('Current access must be verified again.', 'unauthorized')
      : result.error,
    isError: result.isError || stalled,
    isPending: result.isPending || reverifying,
    isLoading: result.isLoading || reverifying,
    status: stalled ? ('error' as const) : reverifying ? ('pending' as const) : result.status,
    reverifying,
    eligible,
    replaceData: (update: (previous: T | undefined) => T) => {
      if (!eligible || !context.isCurrent()) return
      const epoch = context.currentEpoch()
      client.setQueryData<Envelope<T>>(queryKey, (previous) => ({
        epoch,
        // Masked pre-denial data is never handed back to the caller.
        value: update(previous && previous.epoch >= epoch ? previous.value : undefined),
      }))
    },
  }
}
