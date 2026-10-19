import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useContext, useEffect, useState } from 'react'

import { PathwaysClientError } from '@/lib/api/core/request'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import {
  AuthorizedQueryContext,
  isAuthorizationFailure,
  privateKey,
} from '@/providers/authorized-query-provider'

type Permission = Parameters<typeof principalHasAtomicPermission>[1]
/** Cached value plus the denial epoch its read started in. */
type Envelope<T> = { epoch: number; value: T }

/**
 * `summary` reads (lists and summaries) may be reused for 30 seconds within the same
 * organization, user, role, permissions, assignments and project. `live` reads always
 * re-verify. `live` is the default.
 */
type AuthorizedReadFreshness = 'summary' | 'live'
export const SUMMARY_READ_STALE_MS = 30_000
/** Beneficiary, step-up, import batch and SADDD (analytics insight, report preview) reads are never cached. */
const LIVE_ONLY_RESOURCE = /^(beneficiar|step-up|import-batch|analytics-insights|report-preview)/

/** Resources allowed to use the summary window; any other resource asking for it reads live. */
export const SUMMARY_ELIGIBLE_RESOURCE =
  /^(projects|project|project-journey-stages|project-overview-metrics|project-activities|activity-assignable-officers|expense-budget-references|activity-expense-references|indicator-library|project-indicators|indicator-binding-choices|rules-recommendation-library|analytics-project-map|recommendation-linked-alert:.+|alert-linked-recommendations:.+)$/

const summaryEligible = (resource: string) =>
  SUMMARY_ELIGIBLE_RESOURCE.test(resource) && !LIVE_ONLY_RESOURCE.test(resource)

export function authorizedReadPolicy(resource: string, freshness: AuthorizedReadFreshness) {
  return freshness === 'summary' && summaryEligible(resource)
    ? { staleTime: SUMMARY_READ_STALE_MS, gcTime: SUMMARY_READ_STALE_MS, refetchOnMount: true }
    : { staleTime: 0, gcTime: 0, refetchOnMount: 'always' as const }
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
  // A key whose last result was a 401/403 never fetches by itself again, even after it
  // remounts; only an explicit retry (the returned `refetch`) or a new identity clears it.
  const recordedDenial = context.deniedRead(keyText)
  const sticky = recordedDenial !== null
  const policy = authorizedReadPolicy(resource, options.freshness ?? 'live')
  const result = useQuery<Envelope<T>>({
    queryKey,
    // A recorded denial disables automatic fetches, also for a re-created (gcTime 0) key.
    enabled: eligible && !sticky,
    queryFn: async ({ signal }) => {
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      // Data belongs to the epoch its request started in; a denial during flight masks it.
      const startedEpoch = context.currentEpoch()
      let value: T
      try {
        value = await read(signal)
      } catch (error) {
        if (isAuthorizationFailure(error)) {
          context.recordDenial(keyText, error)
          context.deny(error)
        }
        throw error
      }
      context.clearDenial(keyText)
      if (signal.aborted || !context.isCurrent())
        throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
      return { epoch: startedEpoch, value }
    },
    staleTime: policy.staleTime,
    gcTime: policy.gcTime,
    refetchOnMount: (query) =>
      isAuthorizationFailure(query.state.error) ? false : policy.refetchOnMount,
    retryOnMount: !sticky,
    // No read is retried; a 401 or 403 in particular is final until access changes.
    retry: false,
    refetchOnWindowFocus: false,
  })
  const ownDenial = sticky || (result.error !== null && isAuthorizationFailure(result.error))
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
  const visible = eligible && context.isCurrent() && !masked && !sticky
  // Explicit consumer retry: clears the recorded denial and requests exactly once. The
  // cleared denial re-enables the query, and that re-enable fetches a stale key by itself.
  const retry = useCallback(async (): Promise<unknown> => {
    if (!context.deniedRead(keyText)) return refetch()
    const query = client.getQueryCache().find({ queryKey: JSON.parse(keyText), exact: true })
    context.clearDenial(keyText)
    if (query && !query.isStaleByTime(policy.staleTime)) return refetch()
    return undefined
  }, [client, context, keyText, policy.staleTime, refetch])
  const deniedWithoutState = sticky && !result.isError
  const failed = result.isError || stalled || deniedWithoutState
  return {
    ...result,
    data: visible ? result.data?.value : undefined,
    error: deniedWithoutState
      ? recordedDenial
      : stalled
        ? new PathwaysClientError('Current access must be verified again.', 'unauthorized')
        : result.error,
    isError: failed,
    isPending: !failed && (result.isPending || reverifying),
    isLoading: !failed && (result.isLoading || reverifying),
    status: failed ? ('error' as const) : reverifying ? ('pending' as const) : result.status,
    refetch: retry,
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

/** What a prefetch needs to warm one authorized read under the same key as its hook. */
export type AuthorizedReadSpec<T = unknown> = {
  resource: string
  permission: Permission
  read: (signal: AbortSignal) => Promise<T>
}

/**
 * Warms a summary-eligible read on user intent (hover or focus). Live-only and unlisted
 * resources, ineligible principals and denied keys are skipped; failures leave no entry.
 */
export function useAuthorizedPrefetch() {
  const context = useContext(AuthorizedQueryContext)
  const client = useQueryClient()
  return useCallback(
    (projectId: string, { resource, permission, read }: AuthorizedReadSpec) => {
      if (
        !context?.identity ||
        !summaryEligible(resource) ||
        !principalHasAtomicPermission(context.profile, permission) ||
        !context.inProject(projectId)
      )
        return
      const queryKey = [privateKey[0], context.identity, resource, projectId]
      if (context.deniedRead(JSON.stringify(queryKey))) return
      void client
        .prefetchQuery<Envelope<unknown>>({
          queryKey,
          queryFn: async ({ signal }) => {
            if (!context.isCurrent())
              throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
            const epoch = context.currentEpoch()
            let value: unknown
            try {
              value = await read(signal)
            } catch (error) {
              // A denied key is recorded like a hook read, so repeat hovers do not refire.
              if (isAuthorizationFailure(error))
                context.recordDenial(JSON.stringify(queryKey), error)
              throw error
            }
            if (signal.aborted || !context.isCurrent())
              throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
            return { epoch, value }
          },
          staleTime: SUMMARY_READ_STALE_MS,
          gcTime: SUMMARY_READ_STALE_MS,
        })
        .then(() => {
          if (client.getQueryState(queryKey)?.status === 'error')
            client.removeQueries({ queryKey, exact: true, type: 'inactive' })
        })
    },
    [client, context],
  )
}
