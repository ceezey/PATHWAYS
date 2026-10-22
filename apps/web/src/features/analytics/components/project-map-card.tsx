'use client'

import type { MetricCell, ProjectMapPlace, ProjectMapProject } from '@pathways/shared'
import { X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { overviewMetricLabel } from '@/features/projects'

type RowData = { label: string; value: string; detail?: string }

const Row = ({ label, value, detail }: RowData) => (
  <div className="flex items-baseline justify-between gap-3 border-t border-border py-1.5 first:border-t-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-right text-sm font-medium tabular-nums text-foreground">
      {value}
      {detail ? (
        <span className="block text-xs font-normal text-muted-foreground">{detail}</span>
      ) : null}
    </dd>
  </div>
)

// SADDD groups other than exact zeros; a withheld group keeps its label so it never reads as empty.
const breakdown = (
  sex: ProjectMapProject['sadddSex'] | undefined,
  disability: MetricCell | null | undefined,
) =>
  [...(sex ?? []), ...(disability ? [{ label: 'With disability', metric: disability }] : [])]
    .filter((bucket) => bucket.metric.state !== 'ZERO')
    .map((bucket) => `${bucket.label} ${overviewMetricLabel(bucket.metric, 'count')}`)
    .join(' · ') || undefined

/** Overview aggregates for one mapped location, shown in the map popup; SADDD values arrive exact. */
export const ProjectMapCard = ({
  project,
  place,
  onClose,
}: {
  project: ProjectMapProject
  place: ProjectMapPlace
  onClose: () => void
}) => {
  const { overview } = project
  const kpi = overview?.kpiAchievement
  const reached = overview?.beneficiariesReached
  const timeline = overview?.timeline
  const budget = overview?.budgetUtilization
  // A one-pin project's place reach repeats the whole-project figure, so only multi-pin projects show it.
  const here = project.places.length > 1 ? place.reach : null
  // Rows a role cannot read are left out rather than shown as unavailable.
  const wholeProject = [
    kpi && {
      label: 'KPI achievement',
      value: overviewMetricLabel(kpi.metric, 'percent'),
      detail: `${kpi.reportedCount} of ${kpi.indicatorCount} indicators reported`,
    },
    timeline && {
      label: 'Timeline progress',
      value: overviewMetricLabel(timeline.metric, 'percent'),
      detail:
        timeline.startDate && timeline.endDate
          ? `${timeline.startDate} to ${timeline.endDate}`
          : undefined,
    },
    reached && {
      label: 'Reached (SADDD)',
      value: overviewMetricLabel(reached.metric, 'count'),
      detail:
        breakdown(project.sadddSex, project.sadddDisability) ??
        (reached.target ? `Target ${reached.target}` : undefined),
    },
    budget && { label: 'Budget utilization', value: overviewMetricLabel(budget.metric, 'percent') },
  ].filter((row): row is RowData => Boolean(row))

  return (
    <aside aria-label={`${project.title} overview`} className="w-64 max-w-full text-left sm:w-72">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{project.title}</p>
          <p className="text-xs text-muted-foreground">
            {project.code} · {place.name}
          </p>
        </div>
        <Button
          aria-label="Close project overview"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {here ? (
        <dl className="mt-2">
          <Row
            detail={here.total.value === null ? undefined : breakdown(here.sex, here.disability)}
            label={`Reached in ${place.name} (SADDD)`}
            value={overviewMetricLabel(here.total, 'count')}
          />
        </dl>
      ) : null}
      {wholeProject.length > 0 ? (
        <>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Whole project
          </p>
          <dl>
            {wholeProject.map((row) => (
              <Row key={row.label} {...row} />
            ))}
          </dl>
        </>
      ) : null}
      <Link
        className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={`/projects/${project.id}`}
      >
        Open project
      </Link>
    </aside>
  )
}
