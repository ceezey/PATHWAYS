'use client'

import { ConfirmationDialog } from '@/components/pathways'
import { Textarea } from '@/components/ui/textarea'
import type { EvaluationWorkspace } from '../hooks/use-evaluation-workspace'

export function EvaluationDialogs({
  workspace,
}: {
  workspace: Pick<
    EvaluationWorkspace,
    | 'submitOpen'
    | 'setSubmitOpen'
    | 'returnOpen'
    | 'setReturnOpen'
    | 'returnReason'
    | 'setReturnReason'
    | 'signoffOpen'
    | 'setSignoffOpen'
    | 'signoffFeedback'
    | 'setSignoffFeedback'
    | 'submitEvaluation'
    | 'returnEvaluation'
    | 'signoff'
  >
}) {
  const {
    submitOpen,
    setSubmitOpen,
    returnOpen,
    setReturnOpen,
    returnReason,
    setReturnReason,
    signoffOpen,
    setSignoffOpen,
    signoffFeedback,
    setSignoffFeedback,
    submitEvaluation,
    returnEvaluation,
    signoff,
  } = workspace
  return (
    <>
      <ConfirmationDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit this evaluation"
        description="Scores are recomputed once more and then locked for review. The Project Manager reviews and signs off, or returns it for correction."
        confirmLabel="Submit evaluation"
        confirmVariant="default"
        onConfirm={() => void submitEvaluation()}
      />
      <ConfirmationDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Return for correction"
        description="The evaluation reopens as a draft for the Monitoring and Evaluation Officer. Explain what needs to change."
        confirmLabel="Return evaluation"
        confirmVariant="default"
        confirmDisabled={!returnReason.trim()}
        onConfirm={() => void returnEvaluation()}
      >
        <Textarea
          aria-label="Reason for returning"
          placeholder="Reason (required)"
          rows={3}
          value={returnReason}
          onChange={(event) => setReturnReason(event.target.value)}
        />
      </ConfirmationDialog>
      <ConfirmationDialog
        open={signoffOpen}
        onOpenChange={setSignoffOpen}
        title="Sign off this evaluation"
        description="Sign-off makes this evaluation final and reportable. Scores and the review feedback become permanent."
        confirmLabel="Sign off"
        confirmVariant="default"
        confirmDisabled={!signoffFeedback.trim()}
        onConfirm={() => void signoff()}
      >
        <Textarea
          aria-label="Sign-off feedback"
          placeholder="Feedback (required)"
          rows={3}
          value={signoffFeedback}
          onChange={(event) => setSignoffFeedback(event.target.value)}
        />
      </ConfirmationDialog>
    </>
  )
}
