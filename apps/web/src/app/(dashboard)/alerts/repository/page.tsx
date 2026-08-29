import { RuleConfigurationWorkspace } from '@/features/analytics/rule-configuration-workspace'
import { pathwaysClient } from '@/lib/services/pathways-client'

export default async function AlertsRepositoryPage() {
  try {
    const rules = await pathwaysClient.getRules()

    return <RuleConfigurationWorkspace initialRules={rules} />
  } catch {
    return <RuleConfigurationWorkspace initialRules={[]} loadError />
  }
}
