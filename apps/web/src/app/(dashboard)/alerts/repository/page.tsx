import { RuleConfigurationWorkspace } from '@/features/analytics/rule-configuration-workspace'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function AlertsRepositoryPage() {
  const rules = await pathwaysClient.getRules()

  return <RuleConfigurationWorkspace initialRules={rules} />
}
