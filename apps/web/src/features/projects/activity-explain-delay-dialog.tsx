'use client'

import { BellRing, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, OverdueExplanationCategory } from '@/types/pathways'

import { definitiveRejection } from './activity-progress-dialog'

export const categoryLabels: Record<OverdueExplanationCategory, string> = {
  WEATHER: 'Weather',
  SECURITY: 'Security',
  FUNDING: 'Funding',
  COMMUNITY: 'Community',
  LOGISTICS: 'Logistics',
  OTHER: 'Other',
}

const categoryOptions = Object.keys(categoryLabels) as OverdueExplanationCategory[]

const MIN_LENGTH = 10
const MAX_LENGTH = 2000

export const ActivityExplainDelayDialog = ({
  activity,
  open,
  onOpenChange,
  onRecorded,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: (activity: Activity) => void
}) => {
  const [category, setCategory] = useState<OverdueExplanationCategory | ''>('')
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // One clientMutationId per dialog open, reused on retry after an indeterminate failure so a
  // retry never records a second entry. A fresh id is drawn only the next time it opens.
  const [clientMutationId, setClientMutationId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setClientMutationId(crypto.randomUUID())
      setCategory('')
      setExplanation('')
      setError('')
    }
  }, [open])

  const trimmedLength = explanation.trim().length
  const liveStatus = submitting
    ? 'Recording the overdue explanation.'
    : error
      ? error
      : `${trimmedLength} of ${MAX_LENGTH} characters.`

  const submit = async () => {
    if (submitting) return
    if (!category) {
      setError('Select a category.')
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
      const updated = await pathwaysClient.recordOverdueExplanation({
        projectId: activity.projectId,
        activityId: activity.id,
        clientMutationId: mutationId,
        category,
        explanation: explanation.trim(),
      })
      toast.success('Overdue explanation recorded.')
      onRecorded(updated)
      onOpenChange(false)
    } catch (caught) {
      // A definitive rejection (409/403/...) means the same input will not succeed, so the
      // next attempt draws a fresh id; an indeterminate failure keeps this one for a safe retry.
      if (definitiveRejection(caught)) setClientMutationId(crypto.randomUUID())
      setError(
        caught instanceof Error
          ? caught.message
          : 'The explanation could not be recorded. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={(next) => !submitting && onOpenChange(next)} open={open}>
      <DialogShell
        title="Explain delay"
        description="Record why this activity is overdue. This does not block work on the activity."
      >
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <output aria-atomic="true" aria-live="polite" className="sr-only block">
            {liveStatus}
          </output>
          <div className="space-y-2">
            <Label htmlFor="overdue-explanation-category">
              Category
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Select
              disabled={submitting}
              onValueChange={(value) => setCategory(value as OverdueExplanationCategory)}
              value={category}
            >
              <SelectTrigger aria-required="true" id="overdue-explanation-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {categoryLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="overdue-explanation-text">
              Explanation
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Textarea
              aria-required="true"
              className="min-h-28"
              disabled={submitting}
              id="overdue-explanation-text"
              maxLength={MAX_LENGTH}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Explain what caused the delay."
              value={explanation}
            />
            <p aria-hidden="true" className="text-xs text-muted-foreground">
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
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
