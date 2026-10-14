import { usePermission } from '@/hooks/use-permission'
import type { RuleCondition } from '@pathways/shared'
import {
  useRuleBindingActivities,
  useRuleBindingActivityContext,
  useRuleBindingIndicators,
} from '../rules.reads'
import type { Choice } from '../rules.utils'

/** Loads the project records that indicator and activity metrics bind to. */
export function useBindingChoices(scopeProjectId: string | null, rows: RuleCondition[]) {
  const has = usePermission()
  const needs = (test: (metric: string) => boolean) =>
    rows.some((row) => test(row.metric)) && scopeProjectId !== null
  const canReadActivities = has('activities.read')
  const indicators = useRuleBindingIndicators(
    scopeProjectId,
    needs((metric) => metric.startsWith('INDICATOR_')),
  )
  const activitiesFull = useRuleBindingActivities(
    scopeProjectId,
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') && canReadActivities,
  )
  const activitiesContext = useRuleBindingActivityContext(
    scopeProjectId,
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
