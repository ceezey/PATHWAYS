import { CalendarClock, Eye, UsersRound } from 'lucide-react'

import { ProgressBar, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import type { ActivitySummary } from '@/types/pathways'

import {
  activityDueLabel,
  activityNextStep,
  activityProgressTone,
  activityStatusTone,
} from '../activities.utils'

export const ActivityCard = ({
  activity,
  onOpen,
}: {
  activity: ActivitySummary
  onOpen: (activity: ActivitySummary) => void
}) => (
  <article
    aria-label={`Activity: ${activity.title}`}
    className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-foreground">
        {activity.title}
      </h3>
      <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
    </div>
    {activity.overdueExplanationNeeded ? (
      <div className="mt-2">
        <StatusBadge tone="warning">Overdue: explanation needed</StatusBadge>
      </div>
    ) : null}
    <p
      className={`mt-3 flex items-center gap-2 text-sm font-medium ${
        activity.status === 'Overdue' ? 'text-danger' : 'text-muted-foreground'
      }`}
    >
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {activityDueLabel(activity.status, activity.dueDate)}
    </p>
    {activity.status !== 'Completed' ? (
      <div className="mt-4">
        <ProgressBar
          label="Activity progress"
          tone={activityProgressTone(activity.status, activity.progress)}
          value={activity.progress}
        />
      </div>
    ) : null}
    <dl className="mt-4 border-t border-border pt-3 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <dt className="text-muted-foreground">
            {activity.assignedTo.length === 1 ? 'Owner' : 'Owners'}
          </dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {activity.assignedTo.join(', ')}
          </dd>
        </div>
      </div>
    </dl>
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p>
      <p className="mt-1 text-sm font-medium leading-5 text-foreground">
        {activityNextStep(activity.status)}
      </p>
      <Button
        className="mt-3 w-full gap-2 sm:w-auto"
        onClick={() => onOpen(activity)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        View details
      </Button>
    </div>
  </article>
)
