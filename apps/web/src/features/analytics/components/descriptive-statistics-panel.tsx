'use client'

import { AlertTriangle, BarChart3 } from 'lucide-react'

import { AsyncState } from '@/components/pathways'
import type { DescriptiveAnalytics } from '@pathways/shared'

import { ChartPanel, UnavailableChart } from './chart-panel'
import { DescriptiveStatisticsTable } from './descriptive-statistics-table'

export const DescriptiveStatisticsPanel = ({
  descriptive,
  descriptiveError,
  descriptiveLoading,
  periodsReadable,
  retryDescriptive,
}: {
  descriptive: DescriptiveAnalytics | null
  descriptiveError: string
  descriptiveLoading: boolean
  periodsReadable: boolean
  retryDescriptive: () => void
}) => (
  <ChartPanel
    description="Counts and shares come from exact aggregates. A missing cell withholds every share in its group."
    title="Descriptive statistics"
  >
    {descriptiveLoading ? (
      <AsyncState
        status="loading"
        title="Loading descriptive statistics"
        description="Loading scoped aggregate data."
        icon={BarChart3}
      />
    ) : descriptiveError ? (
      <AsyncState
        status="error"
        title="Descriptive statistics unavailable"
        description={descriptiveError}
        icon={AlertTriangle}
        onRetry={retryDescriptive}
      />
    ) : descriptive ? (
      <DescriptiveStatisticsTable data={descriptive} />
    ) : (
      <UnavailableChart
        description={
          periodsReadable
            ? 'No active Indicator reporting period is available for this project.'
            : 'Indicator reporting periods are not available for this role.'
        }
        title={periodsReadable ? 'None yet' : undefined}
      />
    )}
  </ChartPanel>
)
