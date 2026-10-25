'use client'

import { CONSENT_FIELD_CODES, type ImportRowReviewResponse } from '@pathways/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PathwaysClientError } from '@/lib/api/core/request'
import { importsClient } from '@/lib/api/imports'
import { cn } from '@/lib/utils'

import { selectClass } from '../../forms/components/intake-controls'
import { headClass, holdReason } from '../import.utils'
import { ChoiceCell, OwnValue, cellText, ownPayload } from './import-review-cells'

type Choice = 'PATHWAYS' | 'FILE' | 'CALCULATED' | 'OWN'
type SaveAs = 'UPDATE' | 'NEW'

/** One window for one held row: the reviewer picks the value to keep for each changed field. */
export function ImportReviewDialog({
  projectId,
  batchId,
  rowId,
  validationRevision,
  canUpdate,
  onClose,
  onResolved,
}: {
  projectId: string
  batchId: string
  rowId: string
  validationRevision: number
  canUpdate: boolean
  onClose: () => void
  onResolved: () => void
}) {
  const id = useId()
  const [review, setReview] = useState<ImportRowReviewResponse | null>(null)
  const [saveAs, setSaveAs] = useState<SaveAs>('UPDATE')
  const [picks, setPicks] = useState<Record<string, Choice>>({})
  const [own, setOwn] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sending = useRef(false)

  useEffect(() => {
    let active = true
    importsClient
      .getRowReview(projectId, batchId, rowId)
      .then((loaded) => {
        if (!active) return
        setReview(loaded)
        setSaveAs(loaded.participant && canUpdate ? 'UPDATE' : 'NEW')
      })
      .catch((error) => {
        if (active)
          setNotice(error instanceof Error ? error.message : 'The row could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [projectId, batchId, rowId, canUpdate])

  const canSaveUpdate = Boolean(review?.participant) && canUpdate
  const canSave = canSaveUpdate || Boolean(review?.canAddNew)
  const touch = (code: string) =>
    setErrors((current) => {
      const { [code]: _cleared, ...rest } = current
      return rest
    })
  const pick = (code: string, choice: Choice) => {
    touch(code)
    setOwn(({ [code]: _text, ...rest }) => rest)
    setPicks((current) => {
      if (current[code] !== choice) return { ...current, [code]: choice }
      const { [code]: _off, ...rest } = current
      return rest
    })
  }
  const type = (code: string, text: string) => {
    touch(code)
    setOwn((current) => ({ ...current, [code]: text }))
    setPicks((current) => {
      if (text) return { ...current, [code]: 'OWN' }
      const { [code]: _off, ...rest } = current
      return rest
    })
  }
  const changeSaveAs = (next: SaveAs) => {
    setSaveAs(next)
    // A new participant has no PATHWAYS value to keep.
    if (next === 'NEW')
      setPicks((current) =>
        Object.fromEntries(Object.entries(current).filter(([, c]) => c !== 'PATHWAYS')),
      )
  }

  const confirm = async () => {
    if (!review || sending.current) return
    sending.current = true
    setSubmitting(true)
    setErrors({})
    setNotice('')
    const typed = review.fields.filter((field) => picks[field.code] === 'OWN')
    try {
      const result = await importsClient.resolveRow(projectId, batchId, rowId, {
        expectedValidationRevision: validationRevision,
        saveAs,
        choices: picks,
        own: Object.fromEntries(
          typed.map((field) => [field.code, ownPayload(field, own[field.code] ?? '')]),
        ),
      })
      toast.success(
        result.status === 'WAITING_FOR_PROJECT_OFFICER'
          ? `Row ${review.rowNumber} was saved. A Project Officer must approve guardian consent next.`
          : `Row ${review.rowNumber} was saved.`,
      )
      onResolved()
      onClose()
    } catch (error) {
      const found = error instanceof PathwaysClientError ? error.fieldErrors : []
      const shown = new Set(review.fields.map((field) => field.code))
      const inline: Record<string, string[]> = {}
      for (const item of found.filter((entry) => shown.has(entry.fieldCode))) {
        inline[item.fieldCode] = [...(inline[item.fieldCode] ?? []), item.message]
      }
      setErrors(inline)
      const other = found
        .filter((entry) => !shown.has(entry.fieldCode))
        .map((entry) => entry.message)
      setNotice(
        other.length
          ? other.join(' ')
          : found.length
            ? ''
            : error instanceof Error
              ? error.message
              : 'The row could not be saved.',
      )
      sending.current = false
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl" closeDisabled={submitting}>
        <DialogHeader>
          <DialogTitle>{review ? `Review row ${review.rowNumber}` : 'Review held row'}</DialogTitle>
          <DialogDescription>
            {review
              ? `${review.participant?.displayName ? `${review.participant.displayName}: ` : ''}${holdReason(review.reason)}. Click the value to keep, or type your own.`
              : 'Loading the row.'}
          </DialogDescription>
        </DialogHeader>
        {review ? (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-save`}>Save as</Label>
              <select
                className={selectClass}
                disabled={!canSave}
                id={`${id}-save`}
                onChange={(event) => changeSaveAs(event.target.value as SaveAs)}
                value={saveAs}
              >
                {canSaveUpdate ? (
                  <option value="UPDATE">Update the existing participant</option>
                ) : null}
                {review.canAddNew ? <option value="NEW">Add as a new participant</option> : null}
              </select>
            </div>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={headClass}>Field</TableHead>
                  <TableHead className={headClass}>In PATHWAYS</TableHead>
                  <TableHead className={headClass}>In this file</TableHead>
                  <TableHead className={headClass}>Your value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {review.fields.map((field) => {
                  const { code, label } = field
                  const open = field.changed
                  const showPathways = field.pathways !== null
                  const showCalculated = field.calculated !== null
                  const consent = (CONSENT_FIELD_CODES as readonly string[]).includes(code)
                  return (
                    <TableRow
                      className={cn(
                        'align-top',
                        !open && 'bg-surface-subtle text-muted-foreground',
                      )}
                      data-unchanged={!open}
                      key={code}
                    >
                      <TableCell className="font-medium">
                        {label}
                        {errors[code] ? (
                          <div
                            className="text-sm font-normal text-danger"
                            id={`${id}-${code}-error`}
                          >
                            {errors[code].map((message) => (
                              <p key={message}>{message}</p>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="space-y-1">
                        {open && showPathways ? (
                          <ChoiceCell
                            column="In PATHWAYS"
                            disabled={saveAs === 'NEW'}
                            label={label}
                            onPick={() => pick(code, 'PATHWAYS')}
                            picked={picks[code] === 'PATHWAYS'}
                            value={field.pathways}
                          />
                        ) : (
                          (showPathways || !showCalculated) && (
                            <span>{cellText(field.pathways) ?? 'Not in PATHWAYS'}</span>
                          )
                        )}
                        {showCalculated ? (
                          open ? (
                            <ChoiceCell
                              column="Calculated by PATHWAYS"
                              label={label}
                              onPick={() => pick(code, 'CALCULATED')}
                              picked={picks[code] === 'CALCULATED'}
                              value={field.calculated}
                            />
                          ) : (
                            <span className="block">Calculated: {cellText(field.calculated)}</span>
                          )
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {open && field.file !== null ? (
                          <ChoiceCell
                            column="In this file"
                            label={label}
                            onPick={() => pick(code, 'FILE')}
                            picked={picks[code] === 'FILE'}
                            value={field.file}
                          />
                        ) : (
                          <span>{cellText(field.file) ?? 'Not in file'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {consent ? (
                          <span>Not editable</span>
                        ) : (
                          <OwnValue
                            describedBy={errors[code] ? `${id}-${code}-error` : undefined}
                            field={field}
                            invalid={Boolean(errors[code])}
                            onChange={(text) => type(code, text)}
                            text={own[code] ?? ''}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        ) : null}
        {notice ? (
          <p className="text-sm text-danger" role="alert">
            {notice}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={submitting} onClick={onClose} type="button" variant="outline">
            Leave held
          </Button>
          <Button
            disabled={!review || !canSave || submitting}
            onClick={() => void confirm()}
            type="button"
          >
            {submitting ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
