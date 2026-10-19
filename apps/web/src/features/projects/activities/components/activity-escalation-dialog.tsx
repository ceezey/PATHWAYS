'use client'

import { Flag, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { activityEscalationsClient } from '@/lib/api/activity-escalations'
import type { Activity } from '@/types/pathways'

import { definitiveRejection } from './activity-progress-dialog'

const MIN_LENGTH = 10
const MAX_LENGTH = 2000

export const ActivityEscalationDialog = ({
  activity,
  open,
  onOpenChange,
  onRaised,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
  onRaised: () => void
}) => {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // One clientMutationId per dialog open, reused on retry so a retry never creates a second escalation.
  const [clientMutationId, setClientMutationId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setClientMutationId(crypto.randomUUID())
      setReason('')
      setError('')
    }
  }, [open])

  const trimmedLength = reason.trim().length

  const submit = async () => {
    if (submitting) return
    if (trimmedLength < MIN_LENGTH || trimmedLength > MAX_LENGTH) {
      setError(`Enter ${MIN_LENGTH} to ${MAX_LENGTH} characters.`)
      return
    }
    const mutationId = clientMutationId ?? crypto.randomUUID()
    setClientMutationId(mutationId)
    setSubmitting(true)
    setError('')
    try {
      await activityEscalationsClient.raiseActivityEscalation(activity.projectId, activity.id, {
        reason: reason.trim(),
        clientMutationId: mutationId,
      })
      toast.success('Escalation raised.')
      onRaised()
      onOpenChange(false)
    } catch (caught) {
      if (definitiveRejection(caught)) setClientMutationId(crypto.randomUUID())
      setError(caught instanceof Error ? caught.message : 'The escalation could not be raised.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={(next) => !submitting && onOpenChange(next)} open={open}>
      <DialogShell
        title="Raise an escalation"
        description="The Project Manager handles it or forwards it to the Program Manager."
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
            <Label htmlFor="escalation-reason">Reason</Label>
            <Textarea
              aria-required="true"
              className="min-h-28"
              disabled={submitting}
              id="escalation-reason"
              maxLength={MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the blocker that needs a decision."
              value={reason}
            />
            <p className="text-xs text-muted-foreground">
              Do not include beneficiary names or contact details.
            </p>
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
                <Flag className="h-4 w-4" aria-hidden="true" />
              )}
              Raise
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
