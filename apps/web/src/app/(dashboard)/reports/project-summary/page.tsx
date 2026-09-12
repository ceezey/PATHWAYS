import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports/reporting-page'

function ProjectSummaryReportPage() {
  return <ReportingPage initialKind="project-summary" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projectReport', props)
  return ProjectSummaryReportPage()
}
