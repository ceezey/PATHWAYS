'use client'

import { AlertTriangle } from 'lucide-react'

import { AsyncState } from '@/components/pathways'

import type { OpenAlertCount } from '../analytics.reads'
import { ChartPanel, UnavailableChart } from './chart-panel'

export const OpenAlertsPanel = ({
  alertRead,
  alertsFailed,
  alertsLoading,
  canReadAlerts,
  openAlertText,
  openAlerts,
}: {
  alertRead: { refetch: () => unknown }
  alertsFailed: boolean
  alertsLoading: boolean
  canReadAlerts: boolean
  openAlertText: string
  openAlerts: OpenAlertCount | null
}) => (
  <ChartPanel title="Rule-Based Alerts">
    {!canReadAlerts ? (
      <UnavailableChart description="Rule-Based Alerts are unavailable for this role." />
    ) : alertsLoading ? (
      <AsyncState
        status="loading"
        title="Loading Rule-Based Alerts"
        description="Verifying current alert access."
        icon={AlertTriangle}
      />
    ) : alertsFailed ? (
      <AsyncState
        status="error"
        title="Rule-Based Alerts unavailable"
        description="Open alerts could not be loaded."
        icon={AlertTriangle}
        onRetry={() => void alertRead.refetch()}
      />
    ) : openAlerts ? (
      <p className="text-sm text-foreground">
        <span className="text-3xl font-semibold tabular-nums">{openAlertText}</span> open alert
        {openAlerts.count === 1 && !openAlerts.capped ? '' : 's'} in this project.
      </p>
    ) : (
      <UnavailableChart description="Select a project to see its Rule-Based Alerts." />
    )}
  </ChartPanel>
)
