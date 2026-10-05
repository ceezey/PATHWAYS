'use client'

import { useCallback, useEffect, useState } from 'react'

import { useProjectOverviewMetricsRead } from '@/features/projects/use-project-reads'
import { formatCappedPercent } from '@/lib/percent'
import type { PathwaysRole } from '@/types/pathways-role'
import type { ProjectMetrics } from './manager-overview'

type Overview = NonNullable<ReturnType<typeof useProjectOverviewMetricsRead>['data']>
type OnRead = (id: string, metrics: ProjectMetrics[string]) => void

const MAX_PROJECTS = 20
const metricRoles: PathwaysRole[] = ['Project Manager', 'Program Manager', 'Grant Manager']

const toMetrics = (m: Overview): ProjectMetrics[string] => {
  const kpi = m.kpiAchievement?.metric.value ?? null
  const b = m.budgetUtilization
  const allocated = Number(b?.approvedBudget)
  return {
    kpi: kpi === null ? null : formatCappedPercent(kpi),
    budget:
      b?.approvedBudget && allocated > 0
        ? {
            percent: Math.round((100 * Number(b.countableSpending)) / allocated),
            allocated: b.approvedBudget,
            used: b.countableSpending,
          }
        : null,
  }
}

// Uses the shared 30 second summary read, so remounts reuse cached metrics instead of refetching.
const ProjectMetricsRead = ({ id, onRead }: { id: string; onRead: OnRead }) => {
  const { data } = useProjectOverviewMetricsRead(id)
  useEffect(() => {
    if (data) onRead(id, toMetrics(data))
  }, [data, id, onRead])
  return null
}

/** Per-project overview metrics for manager roles; a failed read leaves that project without metrics. */
export const useProjectMetrics = (projects: Array<{ id: string }>, role: PathwaysRole) => {
  const [metrics, setMetrics] = useState<ProjectMetrics>({})
  const onRead = useCallback<OnRead>((id, m) => setMetrics((prev) => ({ ...prev, [id]: m })), [])
  const reads = metricRoles.includes(role)
    ? projects
        .slice(0, MAX_PROJECTS)
        .map((p) => <ProjectMetricsRead id={p.id} key={p.id} onRead={onRead} />)
    : null
  return { metrics, reads }
}
