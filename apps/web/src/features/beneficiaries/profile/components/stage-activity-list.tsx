'use client'

import type { ActivitySummary, BeneficiaryParticipationRecord } from '@/types/pathways'

import { formatDate } from '../../beneficiaries.utils'

export const StageActivityList = ({
  activities,
  participation,
}: {
  activities: ActivitySummary[]
  participation: BeneficiaryParticipationRecord[]
}) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <h5 className="font-semibold text-foreground">Stage activities</h5>
    <div className="mt-3 space-y-2">
      {activities.length > 0 ? (
        activities.map((activity) => {
          const participationRecord = participation.find(
            (record) => record.activityId === activity.id,
          )

          return (
            <div
              className="rounded-lg border border-border bg-surface-subtle p-3"
              key={activity.id}
            >
              <p className="text-sm font-medium text-foreground">{activity.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {participationRecord
                  ? `${formatDate(participationRecord.participatedAt)} · ${participationRecord.attendanceStatus}`
                  : 'Not started'}
              </p>
            </div>
          )
        })
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          No activities are mapped to this journey stage.
        </p>
      )}
    </div>
  </section>
)
