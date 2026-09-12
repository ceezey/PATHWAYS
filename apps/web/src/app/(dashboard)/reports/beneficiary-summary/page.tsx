import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports/reporting-page'

function BeneficiarySummaryReportPage() {
  return <ReportingPage initialKind="beneficiary-summary" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaryReport', props)
  return BeneficiarySummaryReportPage()
}
