import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports'

function SurveyResultsReportPage() {
  return <ReportingPage initialKind="survey-results" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('surveyReport', props)
  return SurveyResultsReportPage()
}
