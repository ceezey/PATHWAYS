'use client'
import {
  AsyncState,
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
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
import { InlineNotice, OptionSelect } from './option-select'

type EvaluationDetail = z.infer<typeof evaluationDetailSchema>
type SavedScore = EvaluationDetail['scores'][number]

const headClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const types = [
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
  'OTHER',
] as const
const computedTypes = new Set([
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
])
const statusTone = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  REVIEWED: 'info',
  SIGNED_OFF: 'success',
  ARCHIVED: 'neutral',
} as const
const openStatuses = new Set(['DRAFT', 'SUBMITTED', 'REVIEWED'])
type Draft = {
  localId: string
  code: string
  name: string
  type: (typeof types)[number]
  weightPercentage: string
  maximumScore: string
}
const blank = (): Draft => ({
  localId: crypto.randomUUID(),
  code: '',
  name: '',
  type: 'KPI',
  weightPercentage: '',
  maximumScore: '100',
})
// A manual saved score prefills its inputs; everything else starts empty.
const prefill = (saved?: SavedScore) =>
  saved?.source === 'manual'
    ? { score: saved.score, note: saved.note ?? '' }
    : { score: '', note: '' }
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
  const criteria = current?.criteria ?? []
  const draftCriteria = criteria.filter((row) => row.status === 'DRAFT')
  const publishedCriteria = criteria.filter((row) => row.status === 'PUBLISHED')
  const openEvaluation = current?.evaluations.find((row) => openStatuses.has(row.status)) ?? null
  const owner = useSensitiveDraftOwner(
    profile,
    'evaluation-weights',
    'evaluations.weights.configure',
    projectId,
    criteria.map((row) => `${row.id}:${row.updatedAt}`).join('|') || null,
    Boolean(current),
  )
  const createCriteriaOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-criteria-create',
    'evaluations.weights.configure',
    projectId,
    projectId,
    Boolean(current) && criteria.length === 0,
  )
  const initOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-initialization',
    'settings.configure',
    projectId,
    projectId,
    Boolean(current) && criteria.length === 0,
  )
  const createEvalOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-create',
    'evaluations.submit',
    projectId,
    projectId,
    Boolean(current) && publishedCriteria.length > 0 && !openEvaluation,
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

  const [weightDraft, setWeightDraft] = useState<{
    key: string
    generation: number
    values: Record<string, string>
  } | null>(null)
  const weights =
    weightDraft &&
    owner &&
    weightDraft.key === owner.key &&
    weightDraft.generation === owner.generation
      ? weightDraft.values
      : {}
  const [drafts, setDrafts] = useState<Draft[]>([blank()])
  const [evalForm, setEvalForm] = useState({
    title: '',
    periodLabel: '',
    periodStart: '',
    periodEnd: '',
  })
  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: string; note: string }>>({})
  // Computed criteria the server reported as not computable, by id with the reason; only these
  // fall back to a manual score and note, same as criterion type Other.
  const [manualReasons, setManualReasons] = useState<Record<string, string>>({})
  const [narrative, setNarrative] = useState('')
  // Unsaved score or narrative edits block submitting, which would otherwise discard them.
  const [unsaved, setUnsaved] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [signoffFeedback, setSignoffFeedback] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [signoffOpen, setSignoffOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const activeOperation = useRef<{ isCurrent: () => boolean } | null>(null)
  const requests = useOperationRequestId()
  // biome-ignore lint/correctness/useExhaustiveDependencies: A refreshed criterion revision invalidates the old editor and pending operation.
  useEffect(() => {
    setWeightDraft(null)
  }, [owner?.key, owner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Criterion setup drafts belong to the current initialization grant and identity.
  useEffect(() => {
    setDrafts([blank()])
  }, [
    initOwner?.key,
    initOwner?.generation,
    createCriteriaOwner?.key,
    createCriteriaOwner?.generation,
  ])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Score drafts belong to the current open evaluation's revision.
  useEffect(() => {
    setScoreDraft({})
    setNarrative(openEvaluation?.commentary ?? '')
    setManualReasons({})
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

  const configure = () =>
    run(owner, async () => {
      await coreDataClient.configureWeights(projectId, {
        criteria: draftCriteria.map((row) => ({
          id: row.id,
          weightPercentage: Number(weights[row.id] ?? row.weightPercentage),
          expectedUpdatedAt: row.updatedAt,
        })),
      })
      if (owner?.isCurrent()) {
        setWeightDraft(null)
        await read.refetch()
        if (owner?.isCurrent()) toast.success('Draft weights configured.')
      }
    }).catch((error) => {
      if (owner?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Weight update unavailable.')
    })

  const publish = () =>
    run(owner, async () => {
      await coreDataClient.publishCriteria(projectId, {
        criteria: draftCriteria.map((row) => ({ id: row.id, expectedUpdatedAt: row.updatedAt })),
      })
      if (owner?.isCurrent()) {
        setPublishOpen(false)
        await read.refetch()
        if (owner?.isCurrent()) toast.success('Evaluation criteria published.')
      }
    }).catch((error) => {
      if (owner?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Publishing is unavailable.')
    })

  const initialize = () => {
    const target = createCriteriaOwner ?? initOwner
    const useAppPath = Boolean(createCriteriaOwner)
    return run(target, async () => {
      const body = {
        criteria: drafts.map((row) => ({
          code: row.code.trim(),
          name: row.name.trim(),
          type: row.type,
          weightPercentage: Number(row.weightPercentage),
          maximumScore: Number(row.maximumScore),
        })),
      }
      const clientRequestId = requests.forBody(`${target?.key}:${target?.generation}`, body)
      await (useAppPath
        ? coreDataClient.createCriteria(projectId, { clientRequestId, ...body })
        : coreDataClient.initializeCriteria(projectId, { clientRequestId, ...body }))
      if (target?.isCurrent()) {
        requests.acknowledge(clientRequestId)
        setDrafts([blank()])
        await read.refetch()
        if (target?.isCurrent()) toast.success('Initial draft criteria configured.')
      }
    }).catch((error) => {
      if (target?.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Criterion setup unavailable.')
    })
  }

  const startEvaluation = () =>
    run(createEvalOwner, async () => {
      const clientRequestId = requests.forBody(
        `${createEvalOwner?.key}:${createEvalOwner?.generation}`,
        evalForm,
      )
      await coreDataClient.createEvaluation(projectId, {
        clientRequestId,
        title: evalForm.title.trim(),
        periodLabel: evalForm.periodLabel.trim() || undefined,
        periodStart: evalForm.periodStart,
        periodEnd: evalForm.periodEnd,
      })
      if (createEvalOwner?.isCurrent()) {
        requests.acknowledge(clientRequestId)
        setEvalForm({ title: '', periodLabel: '', periodStart: '', periodEnd: '' })
        await read.refetch()
        if (createEvalOwner?.isCurrent()) toast.success('Evaluation started.')
      }
    }).catch((error) => {
      if (createEvalOwner?.isCurrent())
        toast.error(
          error instanceof Error ? error.message : 'Starting an evaluation is unavailable.',
        )
    })

  const saveScores = () =>
    run(scoreOwner, async () => {
      if (!openEvaluation) return
      await coreDataClient.saveEvaluationScores(projectId, openEvaluation.id, {
        expectedUpdatedAt: openEvaluation.updatedAt,
        commentary: narrative,
        scores: publishedCriteria.map((row) => {
          const saved = openEvaluation.scores.find((s) => s.criterionId === row.id)
          const draft = scoreDraft[row.id] ?? prefill(saved)
          const parsed = draft.score.trim() ? Number(draft.score) : undefined
          return {
            criterionId: row.id,
            ...(parsed !== undefined ? { manualScore: parsed } : {}),
            ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
          }
        }),
      })
      if (scoreOwner?.isCurrent()) {
        setManualReasons({})
        setUnsaved(false)
        await read.refetch()
        if (scoreOwner?.isCurrent()) toast.success('Scores saved.')
      }
    }).catch((error) => {
      if (scoreOwner?.isCurrent()) {
        const flagged = (error as { fieldErrors?: { fieldCode: string; message: string }[] })
          .fieldErrors
        if (flagged?.length) {
          setManualReasons(
            Object.fromEntries(flagged.map((item) => [item.fieldCode, item.message])),
          )
          toast.error('Enter a score and a note for the highlighted criteria.')
        } else toast.error(error instanceof Error ? error.message : 'Scores could not be saved.')
      }
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

  const editScore = (id: string, value: { score: string; note: string }) => {
    setScoreDraft((v) => ({ ...v, [id]: value }))
    setUnsaved(true)
  }

  const edit = (index: number, key: keyof Draft, value: string) =>
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  return (
    <div className="space-y-6">
      {/* The workspace frame draws the project title; this tab keeps only its own note. */}
      <p className="text-sm text-muted-foreground">
        Set up OECD-DAC style evaluation criteria, run an evaluation round, and review and sign off
        its results.
      </p>
      <SectionCard
        title="Evaluation criteria"
        description="Draft weights can be adjusted before publishing; published criteria cannot be changed in-app."
        actions={
          owner && draftCriteria.length > 0 ? (
            <Button disabled={busy} onClick={() => setPublishOpen(true)}>
              Publish criteria
            </Button>
          ) : null
        }
      >
        {read.isPending && !read.isError ? (
          <LoadingSkeleton />
        ) : read.isError ? (
          <InlineNotice tone="danger">
            Current criteria access could not be verified. Reload the evaluation to continue.
          </InlineNotice>
        ) : criteria.length ? (
          <div className="space-y-4">
            <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border">
                    <th className={headClass}>Criterion</th>
                    <th className={headClass}>Status</th>
                    <th className={headClass}>Weight (%)</th>
                    <th className={headClass}>Maximum score</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.code} · {row.type} · Version {row.version}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                          {row.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          aria-label="Weight (%)"
                          className="w-32"
                          type="number"
                          min="0.0001"
                          max="100"
                          step="0.0001"
                          disabled={!owner || row.status !== 'DRAFT' || busy}
                          value={weights[row.id] ?? row.weightPercentage}
                          onChange={(event) =>
                            owner?.isCurrent() &&
                            setWeightDraft({
                              key: owner.key,
                              generation: owner.generation,
                              values: { ...weights, [row.id]: event.target.value },
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-3">{row.maximumScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {owner && draftCriteria.length > 0 ? (
              <Button disabled={busy} onClick={() => void configure()}>
                {busy ? 'Saving' : 'Save draft weights'}
              </Button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="No configured criteria"
            description="An authorized Monitoring and Evaluation Officer or administrator can set up this project's rubric."
          />
        )}
      </SectionCard>
      {(createCriteriaOwner || initOwner) && !read.isError && criteria.length === 0 ? (
        <SectionCard
          title="Initial draft rubric"
          description="Define this project's criteria. Positive weights must total 100 percent; no score or evaluation history is created until criteria are published."
        >
          <div className="space-y-4">
            <fieldset disabled={busy} className="min-w-0">
              <legend className="sr-only">Initial draft criteria</legend>
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[820px] text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={headClass}>Criterion</th>
                      <th className={headClass}>Code</th>
                      <th className={headClass}>Name</th>
                      <th className={headClass}>Type</th>
                      <th className={headClass}>Weight (%)</th>
                      <th className={headClass}>Maximum score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((row, index) => (
                      <tr key={row.localId} className="border-b border-border last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-semibold">
                          Criterion {index + 1}
                        </th>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Code"
                            maxLength={80}
                            value={row.code}
                            onChange={(event) => edit(index, 'code', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Name"
                            maxLength={200}
                            value={row.name}
                            onChange={(event) => edit(index, 'name', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <OptionSelect
                            id={`criterion-type-${row.localId}`}
                            label="Type"
                            value={row.type}
                            onValueChange={(value) => edit(index, 'type', value)}
                            options={types.map((type) => ({ value: type, label: type }))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Weight (%)"
                            type="number"
                            min="0.0001"
                            max="100"
                            step="0.0001"
                            value={row.weightPercentage}
                            onChange={(event) =>
                              edit(index, 'weightPercentage', event.target.value)
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Maximum score"
                            type="number"
                            min="0.0001"
                            max="1000000"
                            step="0.0001"
                            value={row.maximumScore}
                            onChange={(event) => edit(index, 'maximumScore', event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy || drafts.length >= 100}
                onClick={() => setDrafts((rows) => [...rows, blank()])}
              >
                Add criterion
              </Button>
              <Button
                variant="outline"
                disabled={busy || drafts.length <= 1}
                onClick={() => setDrafts((rows) => rows.slice(0, -1))}
              >
                Remove last criterion
              </Button>
              <Button
                disabled={
                  busy ||
                  drafts.some(
                    (row) =>
                      !row.code.trim() ||
                      !row.name.trim() ||
                      !row.weightPercentage.trim() ||
                      !row.maximumScore.trim(),
                  )
                }
                onClick={() => void initialize()}
              >
                Initialize draft rubric
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard
        title="Evaluations"
        description="Every evaluation round appears here, including a draft in progress; the donor report accepts signed-off rounds only."
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
            title="No evaluation yet"
            description="Publish the evaluation criteria, then start an evaluation round."
          />
        )}
      </SectionCard>
      {createEvalOwner ? (
        <SectionCard
          title="Start an evaluation"
          description="Mid-term or final: give the round a title and the period it covers."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Title"
              placeholder="Title, e.g. Mid-term 2026"
              value={evalForm.title}
              onChange={(event) => setEvalForm((v) => ({ ...v, title: event.target.value }))}
            />
            <Input
              aria-label="Period label"
              placeholder="Period label (optional)"
              value={evalForm.periodLabel}
              onChange={(event) => setEvalForm((v) => ({ ...v, periodLabel: event.target.value }))}
            />
            <Input
              aria-label="Period start"
              type="date"
              value={evalForm.periodStart}
              onChange={(event) => setEvalForm((v) => ({ ...v, periodStart: event.target.value }))}
            />
            <Input
              aria-label="Period end"
              type="date"
              value={evalForm.periodEnd}
              onChange={(event) => setEvalForm((v) => ({ ...v, periodEnd: event.target.value }))}
            />
          </div>
          <div className="mt-3">
            <Button
              disabled={
                busy ||
                !evalForm.title.trim() ||
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
      {openEvaluation && (scoreOwner || reviewOwner || openEvaluation.status !== 'DRAFT') ? (
        <SectionCard
          title={`Score: ${openEvaluation.title}`}
          description="Computed criteria are read-only and recalculate on save; the rest need a score and a note."
        >
          <div className="space-y-4">
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border">
                    <th className={headClass}>Criterion</th>
                    <th className={headClass}>Score</th>
                    <th className={headClass}>Weighted</th>
                    <th className={headClass}>Note / formula</th>
                  </tr>
                </thead>
                <tbody>
                  {publishedCriteria.map((row) => {
                    const score = openEvaluation.scores.find((s) => s.criterionId === row.id)
                    const computed = computedTypes.has(row.type)
                    const editable = Boolean(scoreOwner) && openEvaluation.status === 'DRAFT'
                    // Only a computed criterion the server could not compute, or one already
                    // scored manually, takes manual input, same as criterion type Other.
                    const reason = manualReasons[row.id]
                    const manualInput =
                      editable && (!computed || reason !== undefined || score?.source === 'manual')
                    const draft = scoreDraft[row.id] ?? prefill(score)
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.code} · {row.type} · weight {row.weightPercentage}%
                          </p>
                          {reason !== undefined ? (
                            <p className="text-xs text-warning">{reason}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          {manualInput ? (
                            <Input
                              aria-label={`Score for ${row.name}`}
                              className="w-28"
                              type="number"
                              min="0"
                              max={row.maximumScore}
                              step="0.0001"
                              value={draft.score}
                              onChange={(event) =>
                                editScore(row.id, { ...draft, score: event.target.value })
                              }
                            />
                          ) : (
                            <span>
                              {score ? `${score.score} / ${score.maximumScore}` : 'Not yet'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{score?.weightedScore ?? 'Not yet'}</td>
                        <td className="px-4 py-3">
                          {manualInput ? (
                            <Textarea
                              aria-label={`Note for ${row.name}`}
                              maxLength={2000}
                              rows={2}
                              value={draft.note}
                              onChange={(event) =>
                                editScore(row.id, { ...draft, note: event.target.value })
                              }
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {score?.commentary ?? 'Not yet scored.'}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
                  <Button variant="outline" disabled={busy} onClick={() => void saveScores()}>
                    Save scores
                  </Button>
                  <Button disabled={busy || unsaved} onClick={() => setSubmitOpen(true)}>
                    Submit evaluation
                  </Button>
                  {unsaved ? (
                    <p className="self-center text-xs text-muted-foreground">
                      Save before submitting.
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
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish evaluation criteria"
        description="Publishing locks every draft criterion's weight, type and maximum score. Published criteria cannot be changed in-app."
        confirmLabel="Publish criteria"
        onConfirm={() => void publish()}
      />
      <ConfirmationDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit this evaluation"
        description="Submitting locks the scores for review. The Project Manager reviews and signs off, or returns it for correction."
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
      <p className="mt-2 text-sm">Overall score: {evaluation.overallScore ?? 'Not available'}</p>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p>Evaluated by: {named(evaluation.evaluatedBy)}</p>
        <p>Reviewed by: {named(evaluation.reviewedBy)}</p>
        <p>Signed off by: {named(evaluation.signedOffBy)}</p>
      </div>
      {evaluation.reviewFeedback ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Review feedback: {evaluation.reviewFeedback}
        </p>
      ) : null}
    </div>
  )
}
