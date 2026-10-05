'use client'

import { useEffect, useState } from 'react'

import { formatCappedPercent } from '@/lib/percent'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { PathwaysRole } from '@/types/pathways-role'
import type { ProjectMetrics } from './manager-overview'

type Project = { id: string; title: string }
type Evaluations = Array<{ projectId: string; title: string; score: string | null }>

const MAX_PROJECTS = 20
const metricRoles: PathwaysRole[] = ['Project Manager', 'Program Manager', 'Grant Manager']
const emptyMetrics: ProjectMetrics[string] = { kpi: null, budget: null }

const loadMetrics = async (id: string): Promise<ProjectMetrics[string]> => {
  const m = await pathwaysClient.getProjectOverviewMetrics(id)
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

/** Loads per-project overview metrics or evaluation scores; failures become null and never block render. */
export const useProjectExtras = (
  projects: Project[],
  role: PathwaysRole,
  canReadEvaluation: boolean,
) => {
  const [metrics, setMetrics] = useState<ProjectMetrics>({})
  const [evaluations, setEvaluations] = useState<Evaluations>([])
  const list = projects.slice(0, MAX_PROJECTS)
  const key = JSON.stringify(list.map((p) => [p.id, p.title]))
  const wantMetrics = metricRoles.includes(role)
  const wantEvaluations = role === 'Monitoring and Evaluation Officer' && canReadEvaluation

  useEffect(() => {
    const rows = JSON.parse(key) as Array<[string, string]>
    if (!rows.length || (!wantMetrics && !wantEvaluations)) return
    const controller = new AbortController()
    void (async () => {
      if (wantMetrics) {
        const results = await Promise.allSettled(rows.map(([id]) => loadMetrics(id)))
        if (controller.signal.aborted) return
        setMetrics(
          Object.fromEntries(
            rows.map(([id], i) => {
              const r = results[i]
              return [id, r?.status === 'fulfilled' ? r.value : emptyMetrics]
            }),
          ),
        )
        return
      }
      const results = await Promise.allSettled(
        rows.map(([id]) => coreDataClient.evaluation(id, controller.signal)),
      )
      if (controller.signal.aborted) return
      setEvaluations(
        rows.map(([id, title], i) => {
          const r = results[i]
          const score = r?.status === 'fulfilled' ? r.value.evaluation?.overallScore : null
          return { projectId: id, title, score: score ?? null }
        }),
      )
    })()
    return () => controller.abort()
  }, [key, wantMetrics, wantEvaluations])

  return { metrics, evaluations: wantEvaluations ? evaluations : [] }
}
