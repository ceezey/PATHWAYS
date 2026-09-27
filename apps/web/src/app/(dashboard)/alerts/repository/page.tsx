import { RuleConfigurationWorkspace } from '@/features/analytics/rule-configuration-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
export const dynamic = 'force-dynamic'
export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('rules', props)
  return <RuleConfigurationWorkspace />
}
