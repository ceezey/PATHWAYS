'use client'

import { AsyncState, EmptyState, SectionCard } from '@/components/pathways'
import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'
import { EvaluationCard } from './evaluation-card'

export function EvaluationListCard({
  workspace,
}: { workspace: Pick<EvaluationWorkspace, 'read' | 'current'> }) {
  const { read, current } = workspace
  return (
    <SectionCard
      title="Evaluations"
      description="Every round appears here with its computed scores and where each came from; the donor report accepts signed-off rounds only."
    >
      {read.isPending ? (
        <AsyncState
          status="loading"
          title="Loading evaluations"
          description="Verifying current project scope."
        />
      ) : read.isError ? (
        <AsyncState
          status="error"
          title="Evaluations unavailable"
          description="Current monitoring access could not be verified."
          onRetry={() => void read.refetch()}
        />
      ) : current && current.evaluations.length > 0 ? (
        <div className="space-y-4">
          {current.evaluations.map((row) => (
            <EvaluationCard key={row.id} evaluation={row} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Evaluation not started"
          description="No evaluation round has been started for this project yet. A Monitoring and Evaluation Officer starts it and the scores are computed automatically."
        />
      )}
    </SectionCard>
  )
}
