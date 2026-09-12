import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports/reporting-page'

function ReportsPage() {
  return <ReportingPage initialKind="project-summary" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('reports', props)
  return ReportsPage()
}
