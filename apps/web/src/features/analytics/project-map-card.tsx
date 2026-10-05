'use client'

import type { MetricCell, ProjectMapProject } from '@pathways/shared'
import { X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { overviewMetricLabel } from '@/features/projects/project-utils'

const restricted = 'Not available for your role'

const Row = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
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

const percent = (cell: MetricCell | undefined) =>
  cell ? overviewMetricLabel(cell, 'percent') : restricted

/** Overview aggregates for one mapped location, shown in the map popup; SADDD values arrive suppressed. */
export const ProjectMapCard = ({
  project,
  place,
  onClose,
}: {
  project: ProjectMapProject
  place: string
  onClose: () => void
}) => {
  const { overview, sadddSex } = project
  const kpi = overview?.kpiAchievement
  const reached = overview?.beneficiariesReached
  const timeline = overview?.timeline
  const sex = sadddSex
    ?.map((bucket) => `${bucket.label} ${overviewMetricLabel(bucket.metric, 'count')}`)
    .join(' · ')

  return (
    <aside aria-label={`${project.title} overview`} className="w-64 max-w-full text-left sm:w-72">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{project.title}</p>
          <p className="text-xs text-muted-foreground">
            {project.code} · {place}
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
      <dl className="mt-2">
        <Row
          detail={
            kpi ? `${kpi.reportedCount} of ${kpi.indicatorCount} indicators reported` : undefined
          }
          label="KPI achievement"
          value={percent(kpi?.metric)}
        />
        <Row
          detail={
            timeline?.startDate && timeline.endDate
              ? `${timeline.startDate} to ${timeline.endDate}`
              : undefined
          }
          label="Timeline progress"
          value={percent(timeline?.metric)}
        />
        <Row
          detail={sex || (reached?.target ? `Target ${reached.target}` : undefined)}
          label="Reached (SADDD)"
          value={reached ? overviewMetricLabel(reached.metric, 'count') : restricted}
        />
        <Row label="Budget utilization" value={percent(overview?.budgetUtilization?.metric)} />
      </dl>
      <Link
        className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={`/projects/${project.id}`}
      >
        Open project
      </Link>
    </aside>
  )
}
