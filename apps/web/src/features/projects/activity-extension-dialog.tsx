'use client'

import { CalendarClock, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

import { definitiveRejection } from './activity-progress-dialog'

const MIN_LENGTH = 10
const MAX_LENGTH = 2000

// The earliest allowed new end date is the day after the current planned end.
export const nextDay = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export const ActivityExtensionDialog = ({
  activity,
  open,
  onOpenChange,
  onRequested,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequested: () => void
}) => {
  const [requestedEndDate, setRequestedEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // One clientMutationId per dialog open, reused on retry so a retry never creates a second request.
  const [clientMutationId, setClientMutationId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setClientMutationId(crypto.randomUUID())
      setRequestedEndDate('')
      setReason('')
      setError('')
    }
  }, [open])

  const minDate = activity.dueDate ? nextDay(activity.dueDate) : ''
  const trimmedLength = reason.trim().length

  const submit = async () => {
    if (submitting) return
    if (!requestedEndDate || (minDate && requestedEndDate < minDate)) {
      setError('Choose a new end date after the current planned end date.')
      return
    }
    if (trimmedLength < MIN_LENGTH || trimmedLength > MAX_LENGTH) {
      setError(`Enter ${MIN_LENGTH} to ${MAX_LENGTH} characters.`)
      return
    }
    const mutationId = clientMutationId ?? crypto.randomUUID()
    setClientMutationId(mutationId)
    setSubmitting(true)
    setError('')
    try {
      await pathwaysClient.requestActivityExtension(activity.projectId, activity.id, {
        requestedEndDate,
        reason: reason.trim(),
        clientMutationId: mutationId,
      })
      toast.success('Extension requested.')
      onRequested()
      onOpenChange(false)
    } catch (caught) {
      if (definitiveRejection(caught)) setClientMutationId(crypto.randomUUID())
      setError(caught instanceof Error ? caught.message : 'The extension could not be requested.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={(next) => !submitting && onOpenChange(next)} open={open}>
      <DialogShell
        title="Request an extension"
        description="The M&E officer verifies the request and the Project Manager decides it."
      >
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="extension-end-date">New end date</Label>
            <Input
              aria-required="true"
              disabled={submitting}
              id="extension-end-date"
              min={minDate || undefined}
              onChange={(event) => setRequestedEndDate(event.target.value)}
              type="date"
              value={requestedEndDate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extension-reason">Reason</Label>
            <Textarea
              aria-required="true"
              className="min-h-28"
              disabled={submitting}
              id="extension-reason"
              maxLength={MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why more time is needed."
              value={reason}
            />
            <p className="text-xs text-muted-foreground">
              {trimmedLength} / {MAX_LENGTH} characters (minimum {MIN_LENGTH})
            </p>
          </div>
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="gap-2" disabled={submitting} type="submit">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
              )}
              Request
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
