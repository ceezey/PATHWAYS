'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { importsClient } from '@/lib/api/imports'
import type { ImportBatchDefinition } from '@/types/pathways'

import { fileParts as copy } from '../../collection.copy'
import { selectClass } from '../../forms/components/intake-controls'
import type { BatchReview } from '../hooks/use-batch-review'
import {
  type DraftOutcomes,
  type PartNotes,
  useFileParts,
  useStageActivities,
} from '../hooks/use-file-parts'
import type { ImportState } from '../hooks/use-import-state'
import { ImportHeldList } from './import-held-list'

const tones = { NONE: 'info', DRAFT: 'warning', PUBLISHED: 'success' } as const
const draftPath = (projectId: string, formId: string) =>
  `/collection/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`

/** The surveys of one client file: their forms, their rows and the steps that bring them in. */
export function ImportPartsCard({
  batch,
  state,
  review,
}: {
  batch: NonNullable<ImportState['batch']>
  state: ImportState
  review: BatchReview
}) {
  const { canManageForms, canProcess, canUpload, pending } = state
  const { activities, mappedActivity } = useStageActivities(batch.projectId)
  const { prepareForms, prepareUncovered, processAll } = useFileParts(state, review)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<DraftOutcomes>({})
  const [notes, setNotes] = useState<PartNotes>({})
  const [opened, setOpened] = useState<{ code: string; batch: ImportBatchDefinition } | null>(null)
  const hasRows = (code: string) => batch.fileParts?.some((p) => p.code === code && p.rows > 0)
  const allPublished = batch.parts.every((part) => part.formStatus === 'PUBLISHED')
  const needsForm = batch.parts.some((part) => part.formStatus === 'NONE')
  const done =
    batch.status === 'PROCESSED' &&
    batch.parts.every(
      (part) =>
        !hasRows(part.code) ||
        (part.batch?.status === 'PROCESSED' && part.batch.totals.waiting === 0),
    )
  const activityOf = (code: string, name: string) => chosen[code] ?? mappedActivity(name)
  // What each select shows is what is sent, so a stage's own activity needs no click.
  const shown = Object.fromEntries(
    batch.parts.map((part) => [part.code, activityOf(part.code, part.name)]),
  )

  const toggleHeld = async (code: string, childId: string) => {
    if (opened?.code === code) return setOpened(null)
    try {
      setOpened({ code, batch: await importsClient.getImportBatch(batch.projectId, childId) })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.heldFailed)
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageForms && needsForm ? (
              <Button disabled={pending} onClick={() => void prepareForms(shown).then(setDrafts)}>
                {copy.prepare}
              </Button>
            ) : null}
            {canUpload && canProcess && allPublished && !done ? (
              <Button disabled={pending} onClick={() => void processAll().then(setNotes)}>
                {copy.process}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {batch.parts.map((part) => {
          const counts = part.batch?.registrationCounts
          const stats = [
            counts?.created ?? 0,
            counts?.updated ?? 0,
            counts?.unchanged ?? 0,
            part.batch?.totals.unprocessed ?? 0,
            part.batch?.totals.waiting ?? 0,
          ]
          const draft = drafts[part.code]
          const draftId = draft?.formId ?? (part.formStatus === 'DRAFT' ? part.formId : null)
          const note = notes[part.code]
          const uncovered = note?.uncovered
          const waiting = part.batch?.totals.waiting ?? 0
          const activityId = `${batch.id}-${part.code}-activity`
          return (
            <fieldset
              aria-label={part.name}
              className="space-y-3 rounded-lg border border-border p-4"
              key={part.code}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{part.name}</p>
                <StatusBadge tone={tones[part.formStatus]}>
                  {copy.formState[part.formStatus]}
                </StatusBadge>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {copy.counts.map((label, index) => (
                  <div className="rounded-md bg-surface-subtle p-3" key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{stats[index]}</p>
                  </div>
                ))}
              </div>
              {part.formStatus === 'NONE' ? (
                canManageForms ? (
                  <div className="space-y-2">
                    <Label htmlFor={activityId}>{copy.activity}</Label>
                    <select
                      aria-label={copy.activityLabel(part.name)}
                      className={selectClass}
                      id={activityId}
                      onChange={(event) =>
                        setChosen((current) => ({ ...current, [part.code]: event.target.value }))
                      }
                      value={activityOf(part.code, part.name)}
                    >
                      <option value="">{copy.waitingOption}</option>
                      {activities.map((activity) => (
                        <option key={activity.id} value={activity.id}>
                          {activity.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{copy.noFormReason}</p>
                )
              ) : null}
              {draft?.waiting ? <p className="text-sm">{copy.needsActivity}</p> : null}
              {draft?.error ? (
                <p className="text-sm text-danger" role="alert">
                  {draft.error}
                </p>
              ) : null}
              {draftId && canManageForms ? (
                <Link
                  aria-label={copy.openDraftLabel(part.name)}
                  className="text-sm font-medium underline"
                  href={draftPath(batch.projectId, draftId)}
                >
                  {copy.openDraft}
                </Link>
              ) : null}
              {note ? (
                <p className="text-sm text-danger" role="alert">
                  {note.message}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                {uncovered && canManageForms ? (
                  <Button
                    disabled={pending}
                    onClick={() => void prepareUncovered(uncovered)}
                    size="sm"
                    variant="outline"
                  >
                    {copy.prepareForm}
                  </Button>
                ) : null}
                {waiting > 0 ? (
                  <>
                    <span className="text-sm">{copy.waiting(waiting)}</span>
                    {canUpload && canProcess ? (
                      <Button
                        disabled={pending}
                        onClick={() => void processAll().then(setNotes)}
                        size="sm"
                        variant="outline"
                      >
                        {copy.processWaiting}
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {part.batch && (part.batch.totals.unprocessed > 0 || opened?.code === part.code) ? (
                  <Button
                    disabled={pending}
                    aria-expanded={opened?.code === part.code}
                    aria-label={
                      opened?.code === part.code
                        ? copy.hideHeld(part.name)
                        : copy.showHeld(part.name)
                    }
                    onClick={() => void toggleHeld(part.code, (part.batch as { id: string }).id)}
                    size="sm"
                    variant="outline"
                  >
                    {copy.heldRows}
                  </Button>
                ) : null}
              </div>
              {opened?.code === part.code ? (
                <ImportHeldList
                  batch={opened.batch}
                  onChanged={async () => {
                    await review.loadBatch(batch.id)
                    setOpened({
                      code: part.code,
                      batch: await importsClient.getImportBatch(batch.projectId, opened.batch.id),
                    })
                  }}
                />
              ) : null}
            </fieldset>
          )
        })}
      </CardContent>
    </Card>
  )
}
