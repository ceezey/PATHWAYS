import { StatusBadge } from '@/components/pathways'
import type { ActivityStatus } from '@/types/pathways'

import { activityStatusTone, activityStatuses } from '../activities.utils'

export const ActivityStatusSummary = ({
  activeStatus,
  counts,
  onStatusChange,
}: {
  activeStatus: ActivityStatus | null
  counts: Record<ActivityStatus, number>
  onStatusChange: (status: ActivityStatus | null) => void
}) => (
  <section aria-label="Activity status filters">
    <div className="flex flex-wrap gap-2">
      {activityStatuses.map((status) => {
        const selected = activeStatus === status
        return (
          <button
            aria-label={`Filter activities by ${status} status, ${counts[status]} ${counts[status] === 1 ? 'activity' : 'activities'}`}
            aria-pressed={selected}
            className={`min-h-9 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/30'
            }`}
            key={status}
            onClick={() => onStatusChange(selected ? null : status)}
            type="button"
          >
            <StatusBadge tone={activityStatusTone(status)}>
              {status} {counts[status]}
            </StatusBadge>
          </button>
        )
      })}
    </div>
  </section>
)
