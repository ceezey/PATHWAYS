'use client'

import { useQueryClient } from '@tanstack/react-query'
import { createContext, useEffect, useMemo, useRef, useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import {
  AUTHORIZATION_DENIED_EVENT,
  WRITE_COMMITTED_EVENT,
  authorizationDenialToken,
} from '@/lib/api/core/authorized-read-events'
import { PathwaysClientError } from '@/lib/api/core/request'
import type { ApplicationProfile } from '@/lib/auth/auth-access'
import { sensitiveDraftGeneration, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'

type Context = {
  identity: string | null
  profile: ApplicationProfile | null
  inProject: (projectId: string | null) => boolean
  isCurrent: () => boolean
  /** Denial epoch as React state, so every reader re-renders when access is denied. */
  epoch: number
  /** Latest epoch, read when a fetch starts or cached data is replaced. */
  currentEpoch: () => number
  /** Changes when a recorded denial is cleared, so readers re-render. */
  denialVersion: number
  /** Raises the epoch once per denial; a token already seen (the same 401/403) is ignored. */
  deny: (token?: object | null) => void
  /** True once per query per epoch: the single automatic re-read after a denial. */
  claimReread: (key: string, epoch: number) => boolean
  /**
   * Keys whose last result was a 401/403. Outlives the observer, so a remounted reader
   * does not fetch again by itself. Cleared on identity change or an explicit retry.
   */
  deniedRead: (key: string) => PathwaysClientError | null
  recordDenial: (key: string, error: PathwaysClientError) => void
  clearDenial: (key: string) => void
}
export const AuthorizedQueryContext = createContext<Context | null>(null)
export const privateKey = ['pathways-private'] as const

export const isAuthorizationFailure = (error: unknown): error is PathwaysClientError =>
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
  const denials = useRef(new Map<string, PathwaysClientError>())
  const [denialVersion, setDenialVersion] = useState(0)
  const seenDenials = useRef(new WeakSet<object>())
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
    denials.current.clear()
    rereads.current.clear()
  }, [client, identity])
  const deny = useRef((token?: object | null) => {
    // The client announces a 401/403 and the reader's own catch reports the same error:
    // one denial raises the epoch once.
    if (token) {
      if (seenDenials.current.has(token)) return
      seenDenials.current.add(token)
    }
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
        void client.invalidateQueries({
          queryKey: privateKey,
          refetchType: 'active',
          // A denied reader waits for an explicit retry; a write does not re-request it.
          predicate: (query) => !isAuthorizationFailure(query.state.error),
        })
      })
    }
    const denied = (event: Event) => deny(authorizationDenialToken(event))
    window.addEventListener(AUTHORIZATION_DENIED_EVENT, denied)
    window.addEventListener(WRITE_COMMITTED_EVENT, written)
    return () => {
      window.removeEventListener(AUTHORIZATION_DENIED_EVENT, denied)
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
      denialVersion,
      currentEpoch: () => epochRef.current,
      deny,
      claimReread: (key, wanted) => {
        if (rereads.current.get(key) === wanted) return false
        rereads.current.set(key, wanted)
        return true
      },
      deniedRead: (key) => denials.current.get(key) ?? null,
      recordDenial: (key, error) => {
        denials.current.set(key, error)
      },
      clearDenial: (key) => {
        // A retry must re-render its reader so the re-enabled query fetches.
        if (denials.current.delete(key)) setDenialVersion((version) => version + 1)
      },
    }),
    [
      identity,
      profile,
      role,
      assignedProjectIds,
      ownerIsCurrent,
      ownerGeneration,
      deny,
      epoch,
      denialVersion,
    ],
  )
  return (
    <AuthorizedQueryContext.Provider key={identity ?? 'unauthorized'} value={value}>
      {children}
    </AuthorizedQueryContext.Provider>
  )
}
