import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { FeatureDirectory } from '@/components/layout/protected-route'
import { RoleDashboard } from '@/features/dashboard/role-dashboard'

function DashboardHomePage() {
  return (
    <>
      <FeatureDirectory />
      <RoleDashboard />
    </>
  )
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('dashboard', props)
  return DashboardHomePage()
}
