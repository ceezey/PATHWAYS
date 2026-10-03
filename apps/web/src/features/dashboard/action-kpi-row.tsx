'use client'

import { AlertTriangle, ClipboardList, Clock, FileCheck, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { AsyncState } from '@/components/pathways'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { DashboardActionCounts } from '@pathways/shared'

const tones = {
  danger: { tile: 'bg-danger-subtle text-danger', value: 'text-danger' },
  warning: { tile: 'bg-warning-subtle text-warning', value: 'text-warning' },
  info: { tile: 'bg-info-subtle text-info', value: 'text-info' },
  success: { tile: 'bg-success-subtle text-success', value: 'text-success' },
}

type Card = {
  id: string
  label: string
  value: string
  sub: string
  href: string
  tone: keyof typeof tones
  icon: LucideIcon
}

/** Builds only the cards whose count is present; a null count means the grant is missing. */
export const actionKpiCards = (counts: DashboardActionCounts): Card[] => {
  const cards: Card[] = []
  if (counts.pendingApprovals !== null)
    cards.push({
      id: 'pending-approvals',
      label: 'Pending approvals',
      value: String(counts.pendingApprovals),
      sub: 'Expenses awaiting review',
      href: '/projects',
      tone: 'danger',
      icon: ClipboardList,
    })
  if (counts.activeAlerts)
    cards.push({
      id: 'active-alerts',
      label: 'Active budget alerts',
      value: `${counts.activeAlerts.count}${counts.activeAlerts.capped ? '+' : ''}`,
      sub: 'Require your decision',
      href: '/alerts',
      tone: 'warning',
      icon: AlertTriangle,
    })
  if (counts.overdueActivities) {
    const { count, mostOverdue } = counts.overdueActivities
    cards.push({
      id: 'overdue-activities',
      label: 'Overdue activities',
      value: String(count),
      sub: mostOverdue
        ? `${mostOverdue.code} is ${mostOverdue.daysLate} ${mostOverdue.daysLate === 1 ? 'day' : 'days'} late`
        : 'Nothing is past due',
      href: '/projects',
      tone: 'info',
      icon: Clock,
    })
  }
  if (counts.forReview !== null)
    cards.push({
      id: 'for-review',
      label: 'For review',
      value: String(counts.forReview),
      sub: 'Evidence submitted',
      href: '/projects',
      tone: 'success',
      icon: FileCheck,
    })
  return cards
}

export const ActionKpiRow = () => {
  const read = useAuthorizedRead('dashboard-action-counts', null, 'projects.read', () =>
    pathwaysClient.getDashboardActionCounts(),
  )
  if (!read.eligible) return null
  if (read.isError)
    return (
      <AsyncState
        description="Your task counts could not be loaded."
        onRetry={() => void read.refetch()}
        status="error"
        title="Task counts unavailable"
      />
    )
  if (!read.data)
    return (
      <AsyncState
        description="Loading your task counts."
        status="loading"
        title="Loading task counts"
      />
    )
  const cards = actionKpiCards(read.data)
  if (!cards.length) return null
  return (
    <section aria-label="Tasks needing action" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ id, label, value, sub, href, tone, icon: Icon }) => (
        <Link
          className="rounded-md border border-border bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={href}
          key={id}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className={cn('mt-2 text-3xl font-semibold tabular-nums', tones[tone].value)}>
                {value}
              </p>
            </div>
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm',
                tones[tone].tile,
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p>
        </Link>
      ))}
    </section>
  )
}
