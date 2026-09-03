import type { Metadata } from 'next'

import { ReportingPage } from '@/features/reports/reporting-page'

export const metadata: Metadata = { title: 'Reports Workspace' }

export default function ReportsPage() {
  return <ReportingPage initialKind="project-summary" />
}
