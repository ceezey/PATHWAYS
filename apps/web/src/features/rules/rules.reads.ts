import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { activitiesClient } from '@/lib/api/activities'
import { indicatorsClient } from '@/lib/api/indicators'

// Indicators of the scope project that an indicator condition can bind to.
export const useRuleBindingIndicators = (scopeProjectId: string | null, enabled: boolean) =>
  useAuthorizedRead(
    'rule-binding-indicators',
    scopeProjectId,
    'indicators.read',
    (signal) => indicatorsClient.getProjectIndicators(scopeProjectId ?? '', signal),
    enabled,
  )

// Activities of the scope project for a role that reads full activity records.
export const useRuleBindingActivities = (scopeProjectId: string | null, enabled: boolean) =>
  useAuthorizedRead(
    'rule-binding-activities',
    scopeProjectId,
    'activities.read',
    (signal) => activitiesClient.getActivities(scopeProjectId ?? '', signal),
    enabled,
  )

// Activity names of the scope project for a role that reads only activity context.
export const useRuleBindingActivityContext = (scopeProjectId: string | null, enabled: boolean) =>
  useAuthorizedRead(
    'rule-binding-activities-context',
    scopeProjectId,
    'activities.context.read',
    (signal) => activitiesClient.getActivityContext(scopeProjectId ?? '', signal),
    enabled,
  )
