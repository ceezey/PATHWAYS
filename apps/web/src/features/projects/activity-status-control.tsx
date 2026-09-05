'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { cn } from '@/lib/utils'
import type { Activity, ActivityStatus } from '@/types/pathways'

import { activityStatusTone, activityStatuses, buildActivityStatusUpdate } from './activity-utils'

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
  const [pendingStatus, setPendingStatus] = useState<ActivityStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = pendingStatus !== null

  const updateStatus = async (status: ActivityStatus) => {
    if (status === activity.status || pending) {
      return
    }

    setError(null)
    setPendingStatus(status)

    try {
      const updated = await pathwaysClient.updateActivity(
        buildActivityStatusUpdate(activity, status),
      )
      onUpdated(updated)
      window.requestAnimationFrame(() => {
        document.getElementById(controlId)?.focus()
      })
      toast.success('Activity status updated.', {
        description: `${activity.title} is now ${status}. The change was saved in this browser.`,
      })
    } catch {
      setError(`Could not update ${activity.title}. The status remains ${activity.status}.`)
    } finally {
      setPendingStatus(null)
    }
  }

  return (
    <div className="min-w-0">
      <Select
        disabled={pending}
        onValueChange={(value) => void updateStatus(value as ActivityStatus)}
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
      {error ? (
        <p className="mt-2 max-w-64 text-xs leading-5 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
