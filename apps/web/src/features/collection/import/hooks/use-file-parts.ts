import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { activitiesClient } from '@/lib/api/activities'
import { importsClient } from '@/lib/api/imports'
import { journeysClient } from '@/lib/api/journeys'
import type { ImportBatchDefinition } from '@/types/pathways'

import { fileParts as copy } from '../../collection.copy'
import type { ImportProcessingState } from '../components/import-processing-panel'
import {
  importProcessingProgress,
  processingFailureNote,
  runImportProcessing,
} from '../import-auto-continue'
import { draftFormFromImport } from '../prepare-draft'
import type { BatchReview } from './use-batch-review'
import type { ImportState } from './use-import-state'

/** What preparing one survey's form came to: the draft, a wait for an activity, or the server's refusal. */
export type DraftOutcomes = Record<
  string,
  { formId: string | null; waiting: boolean; error?: string }
>
/** What stopped one survey from being processed; an uncovered survey carries what its form is updated from. */
export type PartNotes = Record<
  string,
  { message: string; uncovered?: { batchId: string; formId: string; mappingRevision: number } }
>

type Ticket = NonNullable<ReturnType<ImportState['begin']>>
class Uncovered extends Error {
  constructor(readonly revision: number) {
    super(copy.uncovered)
  }
}

const sameName = (left: string, right: string) =>
  left.trim().replace(/\s+/g, ' ').toLowerCase() === right.trim().replace(/\s+/g, ' ').toLowerCase()
const message = (error: unknown) => (error instanceof Error ? error.message : copy.fallback)

/** The project's usable activities and the one each survey's journey stage already maps to. */
export function useStageActivities(projectId: string) {
  const [read, setRead] = useState<{
    activities: Array<{ id: string; title: string }>
    stages: Awaited<ReturnType<typeof journeysClient.getJourneyStages>>
  }>({ activities: [], stages: [] })
  useEffect(() => {
    let active = true
    // A person who cannot read activities or stages still prepares forms, with every survey waiting.
    Promise.all([
      activitiesClient.getActivities(projectId).catch(() => []),
      journeysClient.getJourneyStages(projectId).catch(() => []),
    ]).then(([activities, stages]) => {
      if (active)
        setRead({
          activities: activities.filter((item) => item.status !== 'Cancelled'),
          stages,
        })
    })
    return () => {
      active = false
    }
  }, [projectId])
  const mappedActivity = (surveyName: string) => {
    const stage = read.stages.find((item) => !item.archived && sameName(item.name, surveyName))
    const usable = (stage?.mappedActivityIds ?? []).filter((id) =>
      read.activities.some((item) => item.id === id),
    )
    return usable.length === 1 ? usable[0] : ''
  }
  return { activities: read.activities, mappedActivity }
}

/** Drafts the survey forms of a file, starts each survey as its own batch, and processes registration then surveys. */
export function useFileParts(state: ImportState, review: BatchReview) {
  const { batch, begin, canValidate, importBatch, projectId, setDraftTarget, setProcessing } = state
  const { loadBatch } = review

  const refresh = async (parentId: string, ticket: Ticket) => {
    try {
      await loadBatch(parentId, ticket)
    } catch (error) {
      toast.error(message(error))
    }
  }

  // One request per survey without a form, in file order, so one refusal never hides the others.
  const prepareForms = async (chosen: Record<string, string>) => {
    const outcomes: DraftOutcomes = {}
    const ticket = batch ? begin('forms.manage') : null
    if (!batch || !ticket) return outcomes
    try {
      for (const part of batch.parts.filter((item) => item.formStatus === 'NONE')) {
        try {
          const done = await importsClient.draftStageForm(
            projectId,
            batch.id,
            part.code,
            chosen[part.code] || undefined,
          )
          if (!ticket.valid()) return outcomes
          outcomes[part.code] = { formId: done.formId, waiting: done.waitingForActivity }
        } catch (error) {
          if (!ticket.valid()) return outcomes
          outcomes[part.code] = { formId: null, waiting: false, error: message(error) }
        }
      }
      await refresh(batch.id, ticket)
    } finally {
      ticket.finish()
    }
    return outcomes
  }

  // Opens the form editor on a draft updated from a survey's file, for a survey its form does not cover.
  const prepareUncovered = async (found: NonNullable<PartNotes[string]['uncovered']>) => {
    const ticket = begin('forms.manage')
    if (!ticket) return
    try {
      const target = await draftFormFromImport(
        projectId,
        found.formId,
        found.batchId,
        found.mappingRevision,
      )
      if (ticket.valid()) setDraftTarget(target)
    } catch (error) {
      if (ticket.valid()) toast.error(error instanceof Error ? error.message : copy.prepareFailed)
    } finally {
      ticket.finish()
    }
  }

  // A batch not yet validated is mapped automatically when it has no mapping, then validated once its form covers the file.
  const validated = async (target: ImportBatchDefinition) => {
    if (!['UPLOADED', 'MAPPED'].includes(target.status)) return target
    if (target.coverage?.coverage === 'NOT_COVERED') throw new Uncovered(target.mappingRevision)
    let revision = target.mappingRevision
    if (revision === 0) {
      const receipt = await importBatch.mapAutomatically(projectId, target)
      revision = receipt?.mappingRevision ?? revision
      if (receipt?.coverage !== 'COVERED') throw new Uncovered(revision)
    }
    if (!canValidate) throw new Error(copy.cannotValidate)
    return importsClient.validateImport(projectId, target.id, revision)
  }

  // Starts each survey that has rows and no batch, in file order, and validates it when its form covers the file.
  const startAll = async (outer?: Ticket) => {
    const ready: ImportBatchDefinition[] = []
    const notes: PartNotes = {}
    const ticket = outer ?? (batch ? begin('imports.upload') : null)
    if (!batch || !ticket) return { ready, notes }
    try {
      for (const part of batch.parts) {
        if (!batch.fileParts?.some((item) => item.code === part.code && item.rows > 0)) continue
        let started: ImportBatchDefinition | undefined
        try {
          const live = part.batch && part.batch.status !== 'FAILED' ? part.batch : null
          // The list carries no coverage, so a survey still to be validated is read in full first.
          started = !live
            ? await importsClient.startFilePart(projectId, batch.id, part.code)
            : ['UPLOADED', 'MAPPED'].includes(live.status)
              ? await importsClient.getImportBatch(projectId, live.id)
              : (live as ImportBatchDefinition)
          ready.push(await validated(started))
        } catch (error) {
          notes[part.code] =
            error instanceof Uncovered && started
              ? {
                  message: copy.uncovered,
                  uncovered: {
                    batchId: started.id,
                    formId: started.formId,
                    mappingRevision: error.revision,
                  },
                }
              : { message: message(error) }
        }
        if (!ticket.valid()) break
      }
      if (!outer) await refresh(batch.id, ticket)
    } finally {
      if (!outer) ticket.finish()
    }
    return { ready, notes }
  }

  // Brings the file as far as it can go: registration first, then each survey, each with the usual processing loop.
  const processAll = async () => {
    const ticket = batch ? begin('imports.process') : null
    if (!batch || !ticket) return {} as PartNotes
    importBatch.stopRequested.current = false
    const stop = () => importBatch.stopRequested.current || !ticket.valid()
    let progress = importProcessingProgress(batch)
    let finish: { state: ImportProcessingState; note?: string } = { state: 'complete' }
    const show = () => setProcessing({ batchId: batch.id, state: 'running', progress })
    show()
    const notes: PartNotes = {}
    try {
      const started = await startAll(ticket)
      Object.assign(notes, started.notes)
      let registration: ImportBatchDefinition | null = null
      try {
        registration = await validated(batch)
      } catch (error) {
        finish = {
          state: 'failed',
          note: error instanceof Uncovered ? copy.registrationFirst : message(error),
        }
      }
      const queue = registration ? [registration, ...started.ready] : []
      for (const target of queue) {
        if (
          target.totals.valid === 0 ||
          (target.status === 'PROCESSED' && target.totals.waiting === 0)
        )
          continue
        if (
          !['VALIDATED', 'PARTIALLY_PROCESSED', 'PROCESSING', 'PROCESSED'].includes(target.status)
        )
          continue
        const outcome = await runImportProcessing({
          process: () =>
            importsClient.processImport(projectId, target.id, target.validationRevision),
          onProgress: (next) => {
            progress = importProcessingProgress(next)
            show()
          },
          shouldStop: stop,
        })
        if (outcome.kind === 'complete') continue
        const note =
          outcome.kind === 'failed' ? processingFailureNote(outcome.error) : copy.notFinished
        if (target.partCode) notes[target.partCode] = { message: note }
        finish = { state: outcome.kind === 'stopped' ? 'stopped' : 'failed', note }
        // A registration that stops leaves the surveys nothing to wait for, and a stop ends the run.
        if (target === registration || outcome.kind === 'stopped') break
      }
      setProcessing({ batchId: batch.id, ...finish, progress })
      await refresh(batch.id, ticket)
      if (finish.state === 'complete' && Object.keys(notes).length === 0)
        toast.success(copy.processed)
      else if (finish.note) toast.error(finish.note)
    } finally {
      ticket.finish()
    }
    return notes
  }

  return { prepareForms, prepareUncovered, startAll, processAll }
}
