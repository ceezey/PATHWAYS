import type { ReportKind } from '@/types/pathways'
import { LiveReportingWorkspace } from './live-reporting-workspace'

export const ReportingPage = ({
  initialKind,
  previewOnly = false,
}: { initialKind: ReportKind; previewOnly?: boolean }) => (
  <LiveReportingWorkspace initialKind={initialKind} previewOnly={previewOnly} />
)
