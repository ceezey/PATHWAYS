import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('analytics', props)
  return <AnalyticsDashboard />
}
