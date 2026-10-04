'use client'

import { AlertTriangle, BarChart3, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { AsyncState } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'

interface InsightRead<T> {
  data?: T
  eligible?: boolean
  error: unknown
  isError: boolean
  isPending: boolean
  refetch: () => unknown
}

const statusOf = (error: unknown) =>
  error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined

export const RestrictedInsight = ({ label }: { label: string }) => (
  <EmptyState
    description={`${label} is restricted for your role.`}
    icon={ShieldAlert}
    title="Restricted"
  />
)

/** Loading, restricted (403), not found (404) and retryable error states shared by insight panels. */
export function InsightStatus<T>({
  read,
  label,
  children,
}: { read: InsightRead<T>; label: string; children: (data: T) => ReactNode }) {
  // An ineligible read never fetches, for example after the project assignment was removed.
  if (read.eligible === false) return <RestrictedInsight label={label} />
  if (read.isError) {
    const status = statusOf(read.error)
    if (status === 403) return <RestrictedInsight label={label} />
    if (status === 404)
      return (
        <EmptyState
          description={`${label} was not found for this project.`}
          icon={BarChart3}
          title="Not found"
        />
      )
    return (
      <AsyncState
        status="error"
        title={`${label} unavailable`}
        description="The data could not be loaded. Try again."
        icon={AlertTriangle}
        onRetry={() => void read.refetch()}
      />
    )
  }
  if (read.isPending || read.data === undefined)
    return (
      <AsyncState
        status="loading"
        title={`Loading ${label.toLowerCase()}`}
        description="Loading scoped server data."
        icon={BarChart3}
      />
    )
  return <>{children(read.data)}</>
}
