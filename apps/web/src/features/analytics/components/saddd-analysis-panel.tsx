'use client'

import { AlertTriangle, CalendarClock, UsersRound } from 'lucide-react'
import { useState } from 'react'

import { AsyncState, FilterChoiceGroup, StatusMessage } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'
import { type SadddDashboard, formatMetricCell } from '@pathways/shared'

import { SadddChart } from './analytics-charts'
import { ChartPanel, UnavailableChart } from './chart-panel'

const sadddDimensions = { Sex: 'sex', 'Age group': 'age', Disability: 'disability' } as const
type SadddDimension = keyof typeof sadddDimensions

const undisclosed = {
  sex: ['NOT_SPECIFIED', 'PREFER_NOT_TO_SAY'],
  age: ['Unknown'],
  disability: ['NOT_SPECIFIED'],
} as const

// True when any undisclosed sex, age or disability bucket has a positive count.
export function hasIncompleteSaddd(saddd: Pick<SadddDashboard, 'sex' | 'age' | 'disability'>) {
  return (Object.keys(undisclosed) as (keyof typeof undisclosed)[]).some((dimension) =>
    saddd[dimension].some(
      (row) =>
        (undisclosed[dimension] as readonly string[]).includes(row.key) &&
        Number(row.metric.value ?? 0) > 0,
    ),
  )
}

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
}) => {
  const [dimension, setDimension] = useState<SadddDimension>('Sex')
  return (
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
            <p className="mb-2 text-sm text-muted-foreground">Counts to date.</p>
          ) : null}
          {hasIncompleteSaddd(saddd) ? (
            <p
              role="note"
              className="mb-3 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning"
            >
              Some beneficiaries did not disclose their sex, age or disability, so this breakdown
              may be incomplete.
            </p>
          ) : null}
          <FilterChoiceGroup
            label="SADDD dimension"
            options={Object.keys(sadddDimensions)}
            value={dimension}
            onValueChange={(value) => setDimension(value as SadddDimension)}
          />
          <div data-testid="saddd-chart">
            <SadddChart label={dimension} buckets={saddd[sadddDimensions[dimension]]} />
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
                {saddd[sadddDimensions[dimension]].map((row) => (
                  <tr key={row.key}>
                    <td>{dimension}</td>
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
}
