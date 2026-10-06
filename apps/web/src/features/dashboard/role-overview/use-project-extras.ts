'use client'

import { useEffect, useState } from 'react'

import { coreDataClient } from '@/lib/services/core-feature-client'
import type { PathwaysRole } from '@/types/pathways-role'

type Project = { id: string; title: string }
type Evaluations = Array<{ projectId: string; title: string; score: string | null }>

const MAX_PROJECTS = 20

/** Loads per-project evaluation scores for M&E; failures become null and never block render. */
export const useProjectExtras = (
  projects: Project[],
  role: PathwaysRole,
  canReadEvaluation: boolean,
) => {
  const [evaluations, setEvaluations] = useState<Evaluations>([])
  const list = projects.slice(0, MAX_PROJECTS)
  const key = JSON.stringify(list.map((p) => [p.id, p.title]))
  const wantEvaluations = role === 'Monitoring and Evaluation Officer' && canReadEvaluation

  useEffect(() => {
    const rows = JSON.parse(key) as Array<[string, string]>
    if (!rows.length || !wantEvaluations) return
    const controller = new AbortController()
    void (async () => {
      const results = await Promise.allSettled(
        rows.map(([id]) => coreDataClient.evaluation(id, controller.signal)),
      )
      if (controller.signal.aborted) return
      setEvaluations(
        rows.map(([id, title], i) => {
          const r = results[i]
          const score =
            r?.status === 'fulfilled'
              ? r.value.evaluations.find((row) => row.status === 'SIGNED_OFF')?.overallScore
              : null
          return { projectId: id, title, score: score ?? null }
        }),
      )
    })()
    return () => controller.abort()
  }, [key, wantEvaluations])

  return wantEvaluations ? evaluations : []
}
