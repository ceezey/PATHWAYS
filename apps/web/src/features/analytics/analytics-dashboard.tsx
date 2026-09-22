'use client'

import { EmptyState } from '@/components/pathways/empty-state'
import { MetricCard } from '@/components/pathways/metric-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { type DashboardQuery, dashboardQuerySchema, formatMetricCell } from '@pathways/shared'
import { BarChart3, ClipboardCheck, Target, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useCallback, useState } from 'react'
import { AggregateChart, IndicatorComparisonChart, SadddChart } from './analytics-charts'
import { useMonitoringRead } from './use-monitoring-read'

const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function AnalyticsDashboard() {
  const { labels } = useDisplayLabels()
  const { profile } = useCurrentRole()
  const [query, setQuery] = useState<DashboardQuery>({})
  const [filterError, setFilterError] = useState<string | null>(null)
  const [indicatorId, setIndicatorId] = useState('')
  const loadProjects = useCallback(() => pathwaysClient.getProjects(), [])
  const directory = useMonitoringRead('monitoring-project-options', loadProjects)
  const load = useCallback(() => pathwaysClient.getMonitoringDashboard(query), [query])
  const monitoring = useMonitoringRead(JSON.stringify(query), load)
  const canReadSaddd = profile?.permissions.includes('beneficiaries.aggregates.read') === true
  const loadSaddd = useCallback(
    async () =>
      canReadSaddd && query.projectId
        ? pathwaysClient.getSadddDashboard({ projectId: query.projectId })
        : null,
    [query.projectId, canReadSaddd],
  )
  const saddd = useMonitoringRead(`saddd:${JSON.stringify(query)}:${canReadSaddd}`, loadSaddd)
  const data = monitoring.data
  const selectedIndicator =
    data?.indicators.find((indicator) => indicator.id === indicatorId) ?? data?.indicators[0]

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const periodStart = String(form.get('periodStart') ?? '')
    const periodEnd = String(form.get('periodEnd') ?? '')
    const projectId = String(form.get('projectId') ?? '')
    const parsed = dashboardQuerySchema.safeParse({
      ...(projectId ? { projectId } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    })
    if (!parsed.success) {
      setFilterError(
        'Select both valid period dates, in chronological order, within 366 inclusive days.',
      )
      return
    }
    setFilterError(null)
    setQuery(parsed.data)
    setIndicatorId('')
  }
  const refresh = () => {
    monitoring.reload()
    saddd.reload()
    directory.reload()
  }
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{labels.moduleAnalytics}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Database-scoped monitoring. Participation records, people and project indicators remain
            distinct measures.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={monitoring.loading || saddd.loading}
        >
          Refresh monitoring
        </Button>
      </header>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={apply} className="grid items-end gap-3 md:grid-cols-4">
            <label>
              Project
              <select className={selectClass} name="projectId" defaultValue="">
                <option value="">All authorized projects</option>
                {directory.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label htmlFor="analytics-period-start">Period start</label>
              <Input id="analytics-period-start" name="periodStart" type="date" />
            </div>

            <div>
              <label htmlFor="analytics-period-end">Period end (inclusive)</label>
              <Input id="analytics-period-end" name="periodEnd" type="date" />
            </div>
            <Button type="submit">Apply filters</Button>
          </form>
          {filterError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {filterError}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Leave both dates blank for the current month through today in the configured business
            time zone. These dates apply to monitoring only; SADDD uses the selected project's saved
            start and end dates after its period closes. Demographic intersections, location and
            activity drill-through are not enabled.
          </p>
        </CardContent>
      </Card>
      {monitoring.error ? (
        <EmptyState
          icon={BarChart3}
          title="Monitoring unavailable"
          description={monitoring.error}
        />
      ) : !data ? (
        <output aria-live="polite">Loading authorized monitoring…</output>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.periodStart} to {data.periodEnd} · {data.businessTimeZone} ·{' '}
            {data.scopeProjectCount} authorized projects · Read-time results
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={ClipboardCheck}
              label="Participation records"
              value={formatMetricCell(data.participationRecords)}
              description="Committed activity records; includes recorded attendance states, not just people present."
            />
            <MetricCard
              icon={UsersRound}
              label="Distinct attending individuals"
              value={formatMetricCell(data.attendingIndividuals)}
              description="Present/completed attendance; shared Beneficiaries count once across projects."
            />
            <MetricCard
              icon={UsersRound}
              label="Enrolled individuals"
              value={formatMetricCell(data.enrolledIndividuals)}
              description="Individuals with an enrollment overlapping the period; not an attendance count."
            />
            <MetricCard
              icon={Target}
              label="Enrolled Beneficiary records"
              value={formatMetricCell(data.enrolledBeneficiaryRecords)}
              description="Distinct records including individuals, groups and communities; not a people total."
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Activity monitoring</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Activities due within this period; current persisted status. Undated activities
                  are excluded.
                </p>
              </CardHeader>
              <CardContent>
                <AggregateChart buckets={data.activities} label="Activity states" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Milestone monitoring</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Milestones targeted within this period; current persisted status, not a historical
                  state snapshot.
                </p>
              </CardHeader>
              <CardContent>
                <AggregateChart buckets={data.milestones} label="Milestone states" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Target versus current measurement</CardTitle>
              <p className="text-sm text-muted-foreground">{data.indicatorNote}</p>
            </CardHeader>
            <CardContent>
              {selectedIndicator ? (
                <>
                  <label>
                    Indicator
                    <select
                      className={selectClass}
                      value={selectedIndicator.id}
                      onChange={(event) => setIndicatorId(event.target.value)}
                    >
                      {data.indicators.map((indicator) => (
                        <option key={indicator.id} value={indicator.id}>
                          {indicator.code} · {indicator.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <IndicatorComparisonChart indicator={selectedIndicator} />
                  <p className="mt-3 text-sm">
                    Progress toward configured change:{' '}
                    {formatMetricCell(selectedIndicator.progress)}
                    {selectedIndicator.progress.value !== null ? '%' : ''}. No universal performance
                    threshold is applied.
                  </p>
                  <Link
                    className="mt-3 inline-block text-sm font-medium text-primary underline"
                    href={`/projects/${selectedIndicator.projectId}/indicators`}
                  >
                    Open indicator definitions
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No readable indicator definitions match this exact reporting period. Select the
                  definition's period or open its project indicator page.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle>SADDD analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current demographic profiles of distinct enrolled individuals. Age is calculated at the
            selected project's saved end date; this is not a historical demographic snapshot.
          </p>
        </CardHeader>
        <CardContent>
          {!canReadSaddd ? (
            <p>SADDD aggregate permission is required.</p>
          ) : !query.projectId ? (
            <p>Select one authorized project to request its closed-period SADDD release.</p>
          ) : saddd.error ? (
            <p role="alert">{saddd.error}</p>
          ) : !saddd.data ? (
            <output aria-live="polite">Loading protected aggregates…</output>
          ) : (
            <>
              {saddd.data.releaseState === 'STALE' ? (
                <output className="mb-4 block text-sm">
                  RESTATEMENT_REVIEW_REQUIRED: this project release changed after first publication.
                  Counts remain withheld pending review.
                </output>
              ) : null}
              <p className="mb-4 text-sm">
                Eligible individuals: {formatMetricCell(saddd.data.total)} · Age reference:{' '}
                {saddd.data.periodEnd ?? 'unavailable'} ({saddd.data.businessTimeZone})
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                Counts 1–4 are suppressed. Complementary suppression may withhold the entire
                release, including totals and completeness values. Missing birth dates are Unknown;
                invalid birth dates are excluded until corrected.
              </p>
              <div className="grid gap-5 xl:grid-cols-3">
                <SadddChart buckets={saddd.data.sex} label="Sex" />
                <SadddChart buckets={saddd.data.age} label="Age at reporting period end" />
                <SadddChart buckets={saddd.data.disability} label="Disability status" />
              </div>
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer font-medium">Data completeness</summary>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {saddd.data.completeness.map((item) => (
                    <div key={item.key}>
                      <dt className="text-sm text-muted-foreground">{item.label}</dt>
                      <dd>{formatMetricCell(item.metric)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Outputs refresh when filters change, the page returns to view, or Refresh monitoring is
        selected. A correction after first SADDD release requires restatement review. Finance, rule
        alerts and geographic coverage are not synthesized from missing data.
      </p>
    </section>
  )
}
