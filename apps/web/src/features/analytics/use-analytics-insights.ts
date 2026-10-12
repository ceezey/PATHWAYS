'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { permissionChecker, type principalHasAtomicPermission } from '@/lib/rbac/policy'
import { analyticsInsightsClient } from '@/lib/services/analytics-insights-client'

export interface InsightsSelection {
  projectId: string | null
  periodStart?: string
  periodEnd?: string
}

type Principal = Parameters<typeof principalHasAtomicPermission>[0]
type Permission = Parameters<typeof principalHasAtomicPermission>[1]

/** Atomic permissions each insights endpoint requires, mirroring the API. */
const required: Record<string, readonly Permission[]> = {
  trends: ['analytics.descriptive.read', 'monitoring.read', 'indicators.read'],
  budget: ['analytics.descriptive.read', 'monitoring.read', 'budgets.read', 'expenses.read'],
  participation: [
    'analytics.descriptive.read',
    'monitoring.read',
    'journeys.read',
    'beneficiaries.records.read',
  ],
}

/** Participation also needs a submission or assessment-detail grant; aggregate-only roles lack it. */
export function canReadInsight(profile: Principal, kind: 'trends' | 'budget' | 'participation') {
  const has = permissionChecker(profile)
  return (
    required[kind].every(has) &&
    (kind !== 'participation' || has('submissions.write') || has('assessments.detail.read'))
  )
}

const resource = (name: string, { periodStart, periodEnd }: InsightsSelection) =>
  `analytics-insights:${name}:${periodStart ?? ''}:${periodEnd ?? ''}`

const query = ({ projectId, periodStart, periodEnd }: InsightsSelection) => ({
  projectId: projectId ?? '',
  ...(periodStart && periodEnd ? { periodStart, periodEnd } : {}),
})

export const useParticipationBreakdown = (selection: InsightsSelection, enabled = true) =>
  useAuthorizedRead(
    resource('participation', selection),
    selection.projectId,
    'analytics.descriptive.read',
    (signal) => analyticsInsightsClient.participation(query(selection), signal),
    enabled && Boolean(selection.projectId),
  )

export const useIndicatorTrends = (selection: InsightsSelection, enabled = true) =>
  useAuthorizedRead(
    resource('trends', selection),
    selection.projectId,
    'analytics.descriptive.read',
    (signal) => analyticsInsightsClient.indicatorTrends(query(selection), signal),
    enabled && Boolean(selection.projectId),
  )

export const useBudgetSummary = (selection: InsightsSelection, enabled = true) =>
  useAuthorizedRead(
    resource('budget', selection),
    selection.projectId,
    'analytics.descriptive.read',
    (signal) => analyticsInsightsClient.budget(query(selection), signal),
    enabled && Boolean(selection.projectId),
  )
