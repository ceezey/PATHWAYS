'use client'

import { StatusBadge } from '@/components/pathways'
import { type EvaluationDetail, named, statusTone } from '../evaluation.utils'
import { ScoreTable } from './score-table'

export function EvaluationCard({ evaluation }: { evaluation: EvaluationDetail }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{evaluation.title}</p>
          <p className="text-xs text-muted-foreground">
            {evaluation.periodLabel ? `${evaluation.periodLabel} · ` : ''}
            {evaluation.periodStart} to {evaluation.periodEnd}
          </p>
        </div>
        <StatusBadge tone={statusTone[evaluation.status]}>{evaluation.status}</StatusBadge>
      </div>
      <ScoreTable evaluation={evaluation} />
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p>Evaluated by: {named(evaluation.evaluatedBy)}</p>
        <p>Reviewed by: {named(evaluation.reviewedBy)}</p>
        <p>Signed off by: {named(evaluation.signedOffBy)}</p>
      </div>
      {evaluation.commentary ? (
        <p className="mt-2 text-sm text-muted-foreground">Narrative: {evaluation.commentary}</p>
      ) : null}
      {evaluation.reviewFeedback ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Review feedback: {evaluation.reviewFeedback}
        </p>
      ) : null}
    </div>
  )
}
