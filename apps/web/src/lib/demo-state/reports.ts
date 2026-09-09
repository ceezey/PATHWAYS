import type { ReportKind } from '@/types/pathways'
import { type DemoReport, nextId, transactDemo } from './store'

export function saveGeneratedReport(
  kind: ReportKind,
  projectIds: string[],
  columns: string[],
  rows: string[][],
  filters: Record<string, string>,
) {
  return transactDemo(
    'reports.generate',
    projectIds.length === 1 ? projectIds[0] : undefined,
    kind,
    (state) => {
      if (!rows.length)
        throw new Error(
          'Insufficient data for the selected report scope. Adjust the filters and try again.',
        )
      const report: DemoReport = {
        id: nextId(state, 'report'),
        title: kind,
        projectIds,
        createdAt: new Date(state.clock).toISOString(),
        columns,
        rows,
        filters,
      }
      state.reports.unshift(report)
      return report
    },
  )
}
