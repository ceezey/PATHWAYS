import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ReportingPage } from '@/features/reports/reporting-page'
import type { ReportKind } from '@/types/pathways'

const reportKinds: ReportKind[] = [
  'project-summary',
  'indicator-summary',
  'beneficiary-summary',
  'survey-results',
]

async function ReportPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>
}) {
  const { kind } = await searchParams
  const initialKind = reportKinds.includes(kind as ReportKind)
    ? (kind as ReportKind)
    : 'beneficiary-summary'

  return <ReportingPage initialKind={initialKind} previewOnly />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('reportPreview', props)
  return ReportPreviewPage(props as Parameters<typeof ReportPreviewPage>[0])
}
