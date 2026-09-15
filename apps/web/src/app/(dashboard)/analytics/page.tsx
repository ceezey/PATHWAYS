import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('analytics', props)
  return <AnalyticsDashboard />
}
