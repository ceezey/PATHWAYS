'use client'

import { StatusBadge } from '@/components/pathways/status-badge'
import type {
  ActivitySummary,
  BeneficiaryParticipationRecord,
  JourneyStageConfig,
} from '@/types/pathways'

import { formatDate, stageForActivity, stageTypeTone } from '../../beneficiaries.utils'

export const RecordList = ({
  activities,
  participation,
  stages,
  title,
}: {
  activities: ActivitySummary[]
  participation: BeneficiaryParticipationRecord[]
  stages: JourneyStageConfig[]
  title: string
}) => (
  <section className="rounded-lg border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-4 space-y-3">
      {participation.length > 0 ? (
        participation
          .slice()
          .sort((first, second) => second.participatedAt.localeCompare(first.participatedAt))
          .map((record) => {
            const activity = activities.find((item) => item.id === record.activityId)
            const stage = stageForActivity(record.activityId, stages, activities)

            return (
              <div
                key={record.id}
                className="rounded-lg border border-border bg-surface-subtle p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {activity?.title ?? record.activityId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(record.participatedAt)} · {record.attendanceStatus}
                    </p>
                  </div>
                  {stage ? (
                    <StatusBadge tone={stageTypeTone(stage.type)}>{stage.code}</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{record.note}</p>
              </div>
            )
          })
      ) : (
        <p className="rounded-lg border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
          No participation history is available for this coded profile.
        </p>
      )}
    </div>
  </section>
)
