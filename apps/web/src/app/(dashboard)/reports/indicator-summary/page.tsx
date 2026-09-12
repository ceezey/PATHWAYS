import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports/reporting-page'

function IndicatorSummaryReportPage() {
  return <ReportingPage initialKind="indicator-summary" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('indicatorReport', props)
  return IndicatorSummaryReportPage()
}
