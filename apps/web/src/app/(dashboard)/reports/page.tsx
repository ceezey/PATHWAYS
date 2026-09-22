import type { Metadata } from 'next'

import { ReportingPage } from '@/features/reports/reporting-page'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Reports Workspace' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('reports', props)
  return <ReportingPage initialKind="project-summary" />
}
