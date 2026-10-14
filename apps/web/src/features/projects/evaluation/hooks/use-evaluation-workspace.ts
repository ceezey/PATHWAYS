import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { evaluationsClient } from '@/lib/api/evaluations'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useProjectRead } from '../../projects.reads'
import { openStatuses, today } from '../evaluation.utils'

export const useEvaluationWorkspace = (projectId: string) => {
  const { profile } = useCurrentRole()
  const read = useAuthorizedRead('project-evaluation', projectId, 'monitoring.read', (signal) =>
    evaluationsClient.evaluation(projectId, signal),
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
      await evaluationsClient.createEvaluation(projectId, { clientRequestId, ...body })
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
      await evaluationsClient.saveEvaluationScores(projectId, openEvaluation.id, {
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
      await evaluationsClient.submitEvaluation(projectId, openEvaluation.id, {
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
      await evaluationsClient.returnEvaluation(projectId, openEvaluation.id, {
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
      await evaluationsClient.signoffEvaluation(projectId, openEvaluation.id, {
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
  return {
    read,
    current,
    openEvaluation,
    projectRead,
    createEvalOwner,
    scoreOwner,
    reviewOwner,
    canSignOff,
    title,
    evalForm,
    setEdits,
    narrative,
    setNarrative,
    unsaved,
    setUnsaved,
    returnReason,
    setReturnReason,
    signoffFeedback,
    setSignoffFeedback,
    submitOpen,
    setSubmitOpen,
    returnOpen,
    setReturnOpen,
    signoffOpen,
    setSignoffOpen,
    busy,
    startEvaluation,
    recompute,
    submitEvaluation,
    returnEvaluation,
    signoff,
  }
}

export type EvaluationWorkspace = ReturnType<typeof useEvaluationWorkspace>
