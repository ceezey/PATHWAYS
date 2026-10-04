'use client'

import { BarChart3 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { IndicatorProgressChart } from '@/features/analytics/analytics-charts'
import { InsightStatus, RestrictedInsight } from '@/features/analytics/insight-status'
import { activeIndicators, progressRows } from '@/features/analytics/kpi-rows'
import { ParticipationBreakdownPanel } from '@/features/analytics/participation-breakdown-panel'
import {
  type InsightsSelection,
  canReadInsight,
  useParticipationBreakdown,
} from '@/features/analytics/use-analytics-insights'
import { overviewMetricLabel } from '@/features/projects/project-utils'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type DashboardPin, type PinView, readPins, removePin } from '@/lib/dashboard-pins'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

const viewLabels: Record<PinView, string> = {
  kpi: 'KPI / indicator performance',
  participation: 'Participation patterns',
  timeline: 'Timeline adherence',
}

const selectionOf = (pin: DashboardPin): InsightsSelection => ({
  projectId: pin.projectId,
  periodStart: pin.periodStart,
  periodEnd: pin.periodEnd,
})

const Kpi = ({ pin }: { pin: DashboardPin }) => {
  const { periodStart, periodEnd, projectId } = pin
  const read = useAuthorizedRead(
    `dashboard-pin-kpi:${periodStart ?? ''}:${periodEnd ?? ''}`,
    projectId,
    'monitoring.read',
    () => pathwaysClient.getMonitoringDashboard({ projectId, periodStart, periodEnd }),
    Boolean(periodStart && periodEnd),
  )
  return (
    <InsightStatus read={read} label={viewLabels.kpi}>
      {(data) => {
        const rows = progressRows(activeIndicators(data, projectId))
        return rows.length ? (
          <IndicatorProgressChart rows={rows} />
        ) : (
          <EmptyState
            description="No released indicator progress for this project and period."
            icon={BarChart3}
            title="None yet"
          />
        )
      }}
    </InsightStatus>
  )
}

const Participation = ({ pin }: { pin: DashboardPin }) => {
  const read = useParticipationBreakdown(selectionOf(pin))
  return (
    <InsightStatus read={read} label={viewLabels[pin.view]}>
      {(data) => <ParticipationBreakdownPanel data={data} />}
    </InsightStatus>
  )
}

const Timeline = ({ pin }: { pin: DashboardPin }) => {
  const read = useAuthorizedRead(
    'dashboard-pin-timeline',
    pin.projectId,
    'analytics.descriptive.read',
    () => pathwaysClient.getTimelineAnalytics({ projectId: pin.projectId }),
  )
  return (
    <InsightStatus read={read} label={viewLabels[pin.view]}>
      {(data) => (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            { label: 'Elapsed', value: overviewMetricLabel(data.elapsedPercent, 'percent') },
            {
              label: 'Activity completion',
              value: overviewMetricLabel(data.activityCompletionPercent, 'percent'),
            },
            {
              label: 'Overdue activities',
              value: overviewMetricLabel(data.activityOverdueCount, 'count'),
            },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 font-medium tabular-nums text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </InsightStatus>
  )
}

const PinBody = ({ pin }: { pin: DashboardPin }) => {
  const { profile } = useCurrentRole()
  const label = viewLabels[pin.view]
  const allowed = {
    kpi: principalHasAtomicPermission(profile, 'monitoring.read'),
    participation: canReadInsight(profile, 'participation'),
    timeline:
      principalHasAtomicPermission(profile, 'analytics.descriptive.read') &&
      principalHasAtomicPermission(profile, 'monitoring.read'),
  }[pin.view]
  if (!allowed) return <RestrictedInsight label={label} />
  if (pin.view === 'participation') return <Participation pin={pin} />
  if (pin.view === 'timeline') return <Timeline pin={pin} />
  return <Kpi pin={pin} />
}

/** Charts pinned in this browser; each is re-read live so current permissions always apply. */
export const PinnedCharts = ({ projects }: { projects: Array<{ id: string; title: string }> }) => {
  const { profile } = useCurrentRole()
  const userId = profile?.userId ?? ''
  const [pins, setPins] = useState<DashboardPin[]>([])
  useEffect(() => {
    setPins(userId ? readPins(userId) : [])
  }, [userId])
  const unpin = (id: string) => {
    removePin(userId, id)
    setPins(readPins(userId))
  }
  return (
    <section className="mt-6 border-t border-border pt-6" aria-labelledby="saved-charts-title">
      <h3 className="mb-4 text-lg font-semibold" id="saved-charts-title">
        Monitoring charts
      </h3>
      {pins.length === 0 ? (
        <EmptyState
          description="Use Add to Dashboard in Analytics to pin a chart here. Pins are saved in this browser only."
          icon={BarChart3}
          title="No pinned charts"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pins.map((pin) => {
            const title =
              projects.find((project) => project.id === pin.projectId)?.title ??
              'Project unavailable'
            return (
              <article className="rounded-2xl border border-border bg-card p-5" key={pin.id}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">
                      {viewLabels[pin.view]}
                    </h4>
                    <p className="truncate text-sm text-muted-foreground">
                      {title}
                      {pin.periodStart && pin.periodEnd
                        ? ` · ${pin.periodStart} to ${pin.periodEnd}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    aria-label={`Unpin ${viewLabels[pin.view]} for ${title}`}
                    onClick={() => unpin(pin.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Unpin
                  </Button>
                </div>
                <PinBody pin={pin} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
