import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { AlertsWorkspace } from '@/features/analytics/alerts-workspace'

function AlertsPage() {
  return <AlertsWorkspace />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('alerts', props)
  return AlertsPage()
}
