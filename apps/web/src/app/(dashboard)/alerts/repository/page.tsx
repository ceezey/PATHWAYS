import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { RuleConfigurationWorkspace } from '@/features/analytics/rule-configuration-workspace'
import { pathwaysClient } from '@/lib/services/pathways-client'

async function AlertsRepositoryPage() {
  try {
    const rules = await pathwaysClient.getRules()

    return <RuleConfigurationWorkspace initialRules={rules} />
  } catch {
    return <RuleConfigurationWorkspace initialRules={[]} loadError />
  }
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('rules', props)
  return AlertsRepositoryPage()
}
