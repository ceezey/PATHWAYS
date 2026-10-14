'use client'

import { AlertTriangle, CalendarClock, UsersRound } from 'lucide-react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'
import { type SadddDashboard, formatMetricCell } from '@pathways/shared'

import { SadddChart } from './analytics-charts'
import { ChartPanel, UnavailableChart } from './chart-panel'

export const SadddAnalysisPanel = ({
  retrySaddd,
  saddd,
  sadddEligible,
  sadddError,
  sadddLoading,
  sadddNotice,
  sadddOngoing,
}: {
  retrySaddd: () => void
  saddd: SadddDashboard | null
  sadddEligible: boolean
  sadddError: string
  sadddLoading: boolean
  sadddNotice: { title: string; description: string } | null
  sadddOngoing: boolean
}) => (
  <ChartPanel title="SADDD Analysis">
    {sadddLoading ? (
      <AsyncState
        status="loading"
        title="Loading SADDD analysis"
        description="Loading the scoped beneficiary aggregate data."
        icon={UsersRound}
      />
    ) : sadddNotice ? (
      <EmptyState
        description={sadddNotice.description}
        icon={CalendarClock}
        title={sadddNotice.title}
      />
    ) : sadddError ? (
      <AsyncState
        status="error"
        title="SADDD analysis unavailable"
        description={sadddError}
        icon={AlertTriangle}
        onRetry={sadddEligible ? retrySaddd : undefined}
      />
    ) : saddd ? (
      <>
        <StatusMessage>SADDD analysis loaded.</StatusMessage>
        {sadddOngoing ? (
          <p className="mb-2 text-sm text-muted-foreground">
            Counts to date; groups of fewer than 5 are hidden.
          </p>
        ) : null}
        <div data-testid="saddd-chart">
          <SadddChart dashboard={saddd} />
        </div>
        <details className="mt-3 rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Accessible SADDD data table</summary>
          <table className="mt-3 w-full text-left">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Category</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...saddd.sex.map((row) => ({ ...row, dimension: 'Sex' })),
                ...saddd.age.map((row) => ({ ...row, dimension: 'Age' })),
                ...saddd.disability.map((row) => ({ ...row, dimension: 'Disability' })),
              ].map((row) => (
                <tr key={`${row.dimension}-${row.key}`}>
                  <td>{row.dimension}</td>
                  <td>{row.label}</td>
                  <td>{formatMetricCell(row.metric)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </>
    ) : (
      <UnavailableChart description="SADDD analysis is unavailable for this project." />
    )}
  </ChartPanel>
)
