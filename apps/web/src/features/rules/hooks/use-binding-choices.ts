import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { usePermission } from '@/hooks/use-permission'
import { activitiesClient } from '@/lib/api/activities'
import { indicatorsClient } from '@/lib/api/indicators'
import type { RuleCondition } from '@pathways/shared'
import type { Choice } from '../rules.utils'

/** Loads the project records that indicator and activity metrics bind to. */
export function useBindingChoices(scopeProjectId: string | null, rows: RuleCondition[]) {
  const has = usePermission()
  const needs = (test: (metric: string) => boolean) =>
    rows.some((row) => test(row.metric)) && scopeProjectId !== null
  const canReadActivities = has('activities.read')
  const indicators = useAuthorizedRead(
    'rule-binding-indicators',
    scopeProjectId,
    'indicators.read',
    (signal) => indicatorsClient.getProjectIndicators(scopeProjectId ?? '', signal),
    needs((metric) => metric.startsWith('INDICATOR_')),
  )
  const activitiesFull = useAuthorizedRead(
    'rule-binding-activities',
    scopeProjectId,
    'activities.read',
    (signal) => activitiesClient.getActivities(scopeProjectId ?? '', signal),
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') && canReadActivities,
  )
  const activitiesContext = useAuthorizedRead(
    'rule-binding-activities-context',
    scopeProjectId,
    'activities.context.read',
    (signal) => activitiesClient.getActivityContext(scopeProjectId ?? '', signal),
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') &&
      !canReadActivities &&
      has('activities.context.read'),
  )
  const activityChoices = canReadActivities
    ? (activitiesFull.data ?? [])
    : (activitiesContext.data ?? [])
  return {
    indicators: (indicators.data ?? []).map((item): Choice => ({ id: item.id, name: item.name })),
    activities: activityChoices.map((item): Choice => ({ id: item.id, name: item.title })),
  }
}
