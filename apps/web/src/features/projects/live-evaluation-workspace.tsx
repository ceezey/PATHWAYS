'use client'
import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  ConfirmationDialog,
  EmptyState,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient } from '@/lib/services/core-feature-client'
import type { evaluationDetailSchema } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { InlineNotice } from './option-select'
import { useProjectRead } from './use-project-reads'

type EvaluationDetail = z.infer<typeof evaluationDetailSchema>
type SavedScore = EvaluationDetail['scores'][number]

const headClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const statusTone = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  REVIEWED: 'info',
  SIGNED_OFF: 'success',
  ARCHIVED: 'neutral',
} as const
const openStatuses = new Set(['DRAFT', 'SUBMITTED', 'REVIEWED'])
// Criteria appear in OECD-DAC order; anything else (older rounds) follows by name.
const criterionOrder = [
  'RELEVANCE',
  'COHERENCE',
  'EFFECTIVENESS',
  'EFFICIENCY',
  'IMPACT',
  'SUSTAINABILITY',
]
const orderOf = (score: SavedScore) => {
  const index = criterionOrder.indexOf(score.criterion.code)
  return index < 0 ? criterionOrder.length : index
}
const points = (value: string | number) => Number(Number(value).toFixed(1))
const today = () => new Date().toISOString().slice(0, 10)
const named = (value: { id: string; name: string } | null) => value?.name ?? 'Not yet'
export function LiveEvaluationWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const boundary = useSensitiveDraftOwner(
    profile,
    'evaluation-screen',
    'monitoring.read',
    projectId,
    projectId,
  )
  return (
    <EvaluationContent
      key={`${boundary?.key ?? 'unavailable'}:${boundary?.generation ?? 0}`}
      projectId={projectId}
    />
  )
}
function EvaluationContent({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const read = useAuthorizedRead('project-evaluation', projectId, 'monitoring.read', (signal) =>
    coreDataClient.evaluation(projectId, signal),
  )
  const current = !read.isError && !read.isPending ? read.data : undefined
  const openEvaluation = current?.evaluations.find((row) => openStatuses.has(row.status)) ?? null
  const projectRead = useProjectRead(projectId)
  const createEvalOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-create',
    'evaluations.submit',
    projectId,
    projectId,
    Boolean(current) && !openEvaluation,
  )
  const scoreOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-scores',
    'evaluations.submit',
    projectId,
    openEvaluation ? `${openEvaluation.id}:${openEvaluation.updatedAt}` : null,
    Boolean(openEvaluation && openEvaluation.status === 'DRAFT'),
  )
  const reviewOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-review',
    'evaluations.approve',
    projectId,
    openEvaluation ? `${openEvaluation.id}:${openEvaluation.updatedAt}` : null,
    Boolean(openEvaluation && openEvaluation.status === 'SUBMITTED'),
  )
  const canSignOff = principalHasAtomicPermission(profile, 'evaluations.signoff')

  // The round starts from the project dates and today, so the Officer only confirms or adjusts it.
  const projectStart = projectRead.data?.startDate ?? today()
  const projectEnd = projectRead.data?.endDate ?? today()
  const defaultEnd = [today(), projectEnd].sort()[0] as string
  const defaults = {
    periodStart: projectStart,
    periodEnd: defaultEnd < projectStart ? projectStart : defaultEnd,
  }
  const [edits, setEdits] = useState<
    Partial<Record<'title' | 'periodStart' | 'periodEnd', string>>
  >({})
  const evalForm = { ...defaults, ...edits }
  const title = edits.title ?? `Evaluation ${evalForm.periodStart} to ${evalForm.periodEnd}`
  const [narrative, setNarrative] = useState('')
  // Unsaved narrative edits block submitting, which would otherwise discard them.
  const [unsaved, setUnsaved] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [signoffFeedback, setSignoffFeedback] = useState('')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [signoffOpen, setSignoffOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const activeOperation = useRef<{ isCurrent: () => boolean } | null>(null)
  const requests = useOperationRequestId()
  // biome-ignore lint/correctness/useExhaustiveDependencies: The narrative belongs to the current open evaluation's revision.
  useEffect(() => {
    setNarrative(openEvaluation?.commentary ?? '')
    setUnsaved(false)
  }, [scoreOwner?.key, scoreOwner?.generation])
  useEffect(() => {
    if (activeOperation.current && !activeOperation.current.isCurrent()) {
      activeOperation.current = null
      setBusy(false)
    }
  })

  const run = async (owner: { isCurrent: () => boolean } | null, body: () => Promise<unknown>) => {
    if (!owner?.isCurrent() || busy || activeOperation.current) return
    const captured = owner
    activeOperation.current = captured
    setBusy(true)
    try {
      await body()
      return captured
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }

  const startEvaluation = () =>
    run(createEvalOwner, async () => {
      const body = {
        title: title.trim(),
        periodStart: evalForm.periodStart,
        periodEnd: evalForm.periodEnd,
      }
      const clientRequestId = requests.forBody(
        `${createEvalOwner?.key}:${createEvalOwner?.generation}`,
        body,
      )
      await coreDataClient.createEvaluation(projectId, { clientRequestId, ...body })
      if (createEvalOwner?.isCurrent()) {
        requests.acknowledge(clientRequestId)
        setEdits({})
        await read.refetch()
        if (createEvalOwner?.isCurrent()) toast.success('Evaluation started and scored.')
      }
    }).catch((error) => {
      if (createEvalOwner?.isCurrent())
        toast.error(
          error instanceof Error ? error.message : 'Starting an evaluation is unavailable.',
        )
    })

  const recompute = () =>
    run(scoreOwner, async () => {
      if (!openEvaluation) return
      await coreDataClient.saveEvaluationScores(projectId, openEvaluation.id, {
        expectedUpdatedAt: openEvaluation.updatedAt,
        commentary: narrative,
      })
      if (scoreOwner?.isCurrent()) {
        setUnsaved(false)
        await read.refetch()
        if (scoreOwner?.isCurrent()) toast.success('Scores recomputed.')
      }
    }).catch((error) => {
      if (scoreOwner?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Scores could not be recomputed.')
    })

  const submitEvaluation = () =>
    run(scoreOwner, async () => {
      if (!openEvaluation) return
      await coreDataClient.submitEvaluation(projectId, openEvaluation.id, {
        expectedUpdatedAt: openEvaluation.updatedAt,
      })
      if (scoreOwner?.isCurrent()) {
        setSubmitOpen(false)
        await read.refetch()
        if (scoreOwner?.isCurrent()) toast.success('Evaluation submitted for review.')
      }
    }).catch((error) => {
      if (scoreOwner?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Submission is unavailable.')
    })

  const returnEvaluation = () =>
    run(reviewOwner, async () => {
      if (!openEvaluation) return
      await coreDataClient.returnEvaluation(projectId, openEvaluation.id, {
        expectedUpdatedAt: openEvaluation.updatedAt,
        reason: returnReason.trim(),
      })
      if (reviewOwner?.isCurrent()) {
        setReturnOpen(false)
        setReturnReason('')
        await read.refetch()
        if (reviewOwner?.isCurrent()) toast.success('Evaluation returned for correction.')
      }
    }).catch((error) => {
      if (reviewOwner?.isCurrent())
        toast.error(
          error instanceof Error ? error.message : 'Returning this evaluation is unavailable.',
        )
    })

  const signoff = () =>
    run(reviewOwner, async () => {
      if (!openEvaluation) return
      await coreDataClient.signoffEvaluation(projectId, openEvaluation.id, {
        expectedUpdatedAt: openEvaluation.updatedAt,
        feedback: signoffFeedback.trim(),
      })
      if (reviewOwner?.isCurrent()) {
        setSignoffOpen(false)
        setSignoffFeedback('')
        await read.refetch()
        if (reviewOwner?.isCurrent()) toast.success('Evaluation signed off.')
      }
    }).catch((error) => {
      if (reviewOwner?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Sign-off is unavailable.')
    })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project review"
        title="Monitor & Evaluate"
        description="Start an evaluation round; every OECD-DAC criterion is scored automatically from this project's data, then reviewed and signed off."
      />
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
    </div>
  )
}
function ScoreTable({ evaluation }: { evaluation: EvaluationDetail }) {
  const scores = [...evaluation.scores].sort(
    (a, b) => orderOf(a) - orderOf(b) || a.criterion.name.localeCompare(b.criterion.name),
  )
  const missing = scores.filter((row) => row.source === 'no_data').length
  const overall =
    evaluation.overallScore ??
    (scores.length ? scores.reduce((sum, row) => sum + Number(row.weightedScore), 0) : null)
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th className={headClass}>Criterion</th>
            <th className={headClass}>Weight</th>
            <th className={headClass}>Score</th>
            <th className={headClass}>Source</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => (
            <tr key={row.criterionId} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">{row.criterion.name}</td>
              <td className="px-4 py-3">{points(row.criterion.weight_percentage)}%</td>
              <td className="px-4 py-3">
                {points(row.score)} / {points(row.maximumScore)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {row.source === 'no_data' ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <StatusBadge tone="warning">No data</StatusBadge>
                    {row.reason}
                  </span>
                ) : row.source === 'manual' ? (
                  `Manual score: ${row.note ?? 'no note'}`
                ) : (
                  row.evidence
                )}
              </td>
            </tr>
          ))}
          {overall !== null ? (
            <tr className="bg-surface-subtle font-semibold text-foreground">
              <td className="px-4 py-3">Overall</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3">{points(overall)} / 100</td>
              <td className="px-4 py-3 text-xs font-normal text-muted-foreground">
                {missing > 0
                  ? `${missing} ${missing === 1 ? 'criterion' : 'criteria'} had no data`
                  : null}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
function EvaluationCard({ evaluation }: { evaluation: EvaluationDetail }) {
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
