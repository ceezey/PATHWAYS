'use client'
import { SourceMutationRecovery } from './source-mutation-recovery'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { isSourceReplay, sourceMutationTickets } from '@/lib/services/source-mutation'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import type { Activity, ActivityStatus } from '@/types/pathways'

import { activityStatusTone, activityStatuses } from './activity-utils'

const statusToneClasses: Record<ReturnType<typeof activityStatusTone>, string> = {
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/20 text-warning',
}

export const ActivityStatusControl = ({
  activity,
  controlId,
  onUpdated,
}: {
  activity: Activity
  controlId: string
  onUpdated: (activity: Activity) => void
}) => {
  const { profile } = useCurrentRole()
  const startContext = useSourceMutationContext(
    profile,
    'activities.complete',
    activity.projectId,
    JSON.stringify([activity.id, activity.updatedAt]),
  )
  const cancellationContext = useSourceMutationContext(
    profile,
    'activities.update',
    activity.projectId,
    JSON.stringify([activity.id, activity.updatedAt]),
  )
  const mutationContext = startContext ?? cancellationContext
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [pendingStatus, setPendingStatus] = useState<ActivityStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = pendingStatus !== null

  const updateStatus = async (status: ActivityStatus, reason?: string) => {
    const owner = status === 'Cancelled' ? cancellationContext : startContext
    if (!owner?.isCurrent() || status === activity.status || pending) {
      return
    }

    setError(null)
    setPendingStatus(status)

    try {
      if (status !== 'In Progress' && status !== 'Cancelled') {
        throw new Error('This status transition is not supported by the current API.')
      }
      if (status === 'Cancelled' && (!reason?.trim() || reason.trim().length > 1000))
        throw new Error('Enter a cancellation reason of 1 to 1,000 characters.')
      const updated = await pathwaysClient.transitionActivity(
        activity.projectId,
        activity.id,
        status === 'Cancelled' ? 'CANCELLED' : 'IN_PROGRESS',
        activity.updatedAt,
        reason?.trim(),
        owner,
      )
      if (!owner.isCurrent()) return
      const record = isSourceReplay(updated)
        ? await pathwaysClient.getActivity(activity.projectId, activity.id)
        : updated
      if (!owner.isCurrent()) return
      if (isSourceReplay(updated))
        sourceMutationTickets.finishAcknowledgement(owner, updated.requestId)
      onUpdated(record)
      setCancellationOpen(false)
      window.requestAnimationFrame(() => {
        if (!owner.isCurrent()) return
        document.getElementById(controlId)?.focus()
      })
      toast.success('Activity status updated.', {
        description: `${record.title} is now ${record.status}.`,
      })
    } catch (caught) {
      if (!owner.isCurrent()) return
      setError(
        caught instanceof Error
          ? caught.message
          : 'The status save could not be confirmed. Retry unchanged or check its outcome before editing.',
      )
    } finally {
      if (owner.isCurrent()) setPendingStatus(null)
    }
  }

  return (
    <div className="min-w-0">
      <SourceMutationRecovery
        context={mutationContext}
        prefix={`/projects/${activity.projectId}/activities/${activity.id}/transition`}
        onRecovered={async () => {
          const current = await pathwaysClient.getActivity(activity.projectId, activity.id)
          return () => {
            onUpdated(current)
            setError(null)
          }
        }}
      />
      <Select
        disabled={pending}
        onValueChange={(value) => {
          if (value === 'Cancelled') {
            if (cancellationContext?.isCurrent()) {
              setError(null)
              setCancellationOpen(true)
            }
          } else void updateStatus(value as ActivityStatus)
        }}
        value={activity.status}
      >
        <SelectTrigger
          aria-busy={pending}
          aria-label={`Change status for ${activity.title}. Current status: ${activity.status}`}
          className={cn(
            'h-10 w-auto min-w-36 max-w-full rounded-full px-3 py-1 text-xs font-medium',
            statusToneClasses[activityStatusTone(activity.status)],
          )}
          id={controlId}
        >
          <span className="truncate">
            {pendingStatus ? `Updating to ${pendingStatus}...` : activity.status}
          </span>
          {pending ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : null}
        </SelectTrigger>
        <SelectContent>
          {activityStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog
        open={cancellationOpen}
        onOpenChange={(next) => {
          if (!pending) setCancellationOpen(next)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel activity</DialogTitle>
            <DialogDescription>
              Record why this activity is being cancelled. The reason is saved with the status
              change.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void updateStatus('Cancelled', cancellationReason)
            }}
          >
            <Label htmlFor={`${controlId}-cancellation`}>Cancellation reason</Label>
            <Textarea
              id={`${controlId}-cancellation`}
              required
              maxLength={1000}
              value={cancellationReason}
              disabled={pending}
              onChange={(event) => setCancellationReason(event.target.value)}
              aria-describedby={error ? `${controlId}-cancel-error` : undefined}
            />
            {error ? (
              <p role="alert" id={`${controlId}-cancel-error`} className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setCancellationOpen(false)}
              >
                Keep activity
              </Button>
              <Button type="submit" disabled={pending || !cancellationContext?.isCurrent()}>
                Confirm cancellation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {error && !cancellationOpen ? (
        <p className="mt-2 max-w-64 text-xs leading-5 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
