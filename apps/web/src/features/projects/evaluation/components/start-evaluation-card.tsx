'use client'

import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'

export function StartEvaluationCard({
  workspace,
}: {
  workspace: Pick<
    EvaluationWorkspace,
    | 'createEvalOwner'
    | 'title'
    | 'evalForm'
    | 'setEdits'
    | 'busy'
    | 'projectRead'
    | 'startEvaluation'
  >
}) {
  const { createEvalOwner, title, evalForm, setEdits, busy, projectRead, startEvaluation } =
    workspace
  return (
    <>
      {createEvalOwner ? (
        <SectionCard
          title="Start an evaluation"
          description="Scores are computed from the project data when the round starts. Adjust the title or period if needed."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Title"
              value={title}
              onChange={(event) => setEdits((v) => ({ ...v, title: event.target.value }))}
            />
            <Input
              aria-label="Period start"
              type="date"
              value={evalForm.periodStart}
              onChange={(event) => setEdits((v) => ({ ...v, periodStart: event.target.value }))}
            />
            <Input
              aria-label="Period end"
              type="date"
              value={evalForm.periodEnd}
              onChange={(event) => setEdits((v) => ({ ...v, periodEnd: event.target.value }))}
            />
          </div>
          <div className="mt-3">
            <Button
              disabled={
                busy ||
                projectRead.isPending ||
                !title.trim() ||
                !evalForm.periodStart ||
                !evalForm.periodEnd ||
                evalForm.periodEnd < evalForm.periodStart
              }
              onClick={() => void startEvaluation()}
            >
              Start evaluation
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </>
  )
}
