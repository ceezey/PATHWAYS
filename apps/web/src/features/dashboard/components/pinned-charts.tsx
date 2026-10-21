'use client'

import { BarChart3 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  IndicatorProgressChart,
  InsightStatus,
  type InsightsSelection,
  ParticipationBreakdownPanel,
  ProjectCoverageMapPanel,
  RestrictedInsight,
  activeIndicators,
  canReadInsight,
  progressRows,
  useParticipationBreakdown,
} from '@/features/analytics'
import { overviewMetricLabel } from '@/features/projects'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { analyticsClient } from '@/lib/api/analytics'
import { dashboardsClient } from '@/lib/api/dashboards'
import { projectsClient } from '@/lib/api/projects'
import { type DashboardPin, type PinView, readPins, removePin } from '@/lib/dashboard-pins'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'

const viewLabels: Record<PinView, string> = {
  kpi: 'KPI / indicator performance',
  participation: 'Participation patterns',
  timeline: 'Timeline adherence',
  map: 'Project coverage map',
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
    () => dashboardsClient.getMonitoringDashboard({ projectId, periodStart, periodEnd }),
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
    () => analyticsClient.getTimelineAnalytics({ projectId: pin.projectId }),
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
    map: principalHasAtomicPermission(profile, 'projects.read'),
  }[pin.view]
  if (!allowed) return <RestrictedInsight label={label} />
  if (pin.view === 'map') return <ProjectCoverageMapPanel />
  if (pin.view === 'participation') return <Participation pin={pin} />
  if (pin.view === 'timeline') return <Timeline pin={pin} />
  return <Kpi pin={pin} />
}

/** Charts pinned in this browser; each is re-read live so current permissions always apply. */
export const PinnedCharts = () => {
  const { profile } = useCurrentRole()
  const projects = useAuthorizedRead('dashboard-pin-projects', null, 'projects.read', (signal) =>
    projectsClient.getProjects(signal),
  ).data
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
              pin.view === 'map'
                ? 'All projects in your scope'
                : (projects?.find((project) => project.id === pin.projectId)?.title ??
                  'Project unavailable')
            return (
              <article
                className={`rounded-2xl border border-border bg-card p-5 ${pin.view === 'map' ? 'xl:col-span-2' : ''}`}
                key={pin.id}
              >
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
