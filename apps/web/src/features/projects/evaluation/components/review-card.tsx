'use client'

import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InlineNotice } from '../../components/option-select'
import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'

export function ReviewCard({
  workspace,
}: {
  workspace: Pick<
    EvaluationWorkspace,
    | 'openEvaluation'
    | 'scoreOwner'
    | 'reviewOwner'
    | 'canSignOff'
    | 'narrative'
    | 'setNarrative'
    | 'unsaved'
    | 'setUnsaved'
    | 'busy'
    | 'recompute'
    | 'setSubmitOpen'
    | 'setReturnOpen'
    | 'setSignoffOpen'
  >
}) {
  const {
    openEvaluation,
    scoreOwner,
    reviewOwner,
    canSignOff,
    narrative,
    setNarrative,
    unsaved,
    setUnsaved,
    busy,
    recompute,
    setSubmitOpen,
    setReturnOpen,
    setSignoffOpen,
  } = workspace
  return (
    <>
      {openEvaluation && (scoreOwner || reviewOwner) ? (
        <SectionCard
          title={`Review: ${openEvaluation.title}`}
          description="Recompute re-reads the project data while the round is a draft; the narrative is the only text you write."
        >
          <div className="space-y-4">
            {openEvaluation.status === 'DRAFT' && openEvaluation.returnReason ? (
              <InlineNotice>Returned for correction: {openEvaluation.returnReason}</InlineNotice>
            ) : null}
            {scoreOwner ? (
              <>
                <Textarea
                  aria-label="Evaluation narrative"
                  placeholder="Evaluator narrative (optional)"
                  rows={3}
                  value={narrative}
                  onChange={(event) => {
                    setNarrative(event.target.value)
                    setUnsaved(true)
                  }}
                />
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={busy} onClick={() => void recompute()}>
                    Recompute
                  </Button>
                  <Button disabled={busy || unsaved} onClick={() => setSubmitOpen(true)}>
                    Submit evaluation
                  </Button>
                  {unsaved ? (
                    <p className="self-center text-xs text-muted-foreground">
                      Recompute to save the narrative before submitting.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {reviewOwner && openEvaluation.status === 'SUBMITTED' ? (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={busy} onClick={() => setReturnOpen(true)}>
                  Return for correction
                </Button>
                {canSignOff ? (
                  <Button disabled={busy} onClick={() => setSignoffOpen(true)}>
                    Sign off
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </>
  )
}
