import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import type {
  ActivitySummary,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import {
  deriveCurrentStage,
  enrollmentTone,
  formatDate,
  progressionRate,
  projectTitle,
} from '../../beneficiaries.utils'

export const useBeneficiaryColumns = ({
  activities,
  scopedProjects,
  stages,
}: {
  activities: ActivitySummary[]
  scopedProjects: ProjectSummary[]
  stages: JourneyStageConfig[]
}) => {
  const columns = useMemo<ColumnDef<BeneficiaryRecord>[]>(
    () => [
      {
        header: 'Beneficiary',
        accessorKey: 'displayName',
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{row.original.displayName}</p>
            <p className="text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        header: 'Enrolled project',
        cell: ({ row }) => (
          <div className="max-w-[240px] text-sm">
            {row.original.projectIds.map((id) => projectTitle(id, scopedProjects)).join(', ')}
          </div>
        ),
      },
      {
        header: 'Current stage',
        cell: ({ row }) => {
          const projectStages = stages.filter((stage) =>
            row.original.projectIds.includes(stage.projectId),
          )
          const projectActivities = activities.filter((activity) =>
            row.original.projectIds.includes(activity.projectId),
          )
          const currentStage = deriveCurrentStage(
            row.original.participation,
            projectStages,
            projectActivities,
          )
          const summary = row.original.progress
          if (summary?.restricted)
            return <span className="text-sm text-muted-foreground">Restricted</span>
          const stage = summary ? summary.stage : currentStage
          const progress = summary
            ? (summary.stage?.progressPercent ?? 0)
            : progressionRate(row.original.participation, projectStages, projectActivities)

          return (
            <div className="min-w-[180px] space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{stage?.code ?? 'No stage'}</span>
                <span className="text-muted-foreground">{stage?.name ?? 'Unmapped'}</span>
              </div>
              <ProgressBar value={progress} tone={progress >= 60 ? 'success' : 'info'} />
            </div>
          )
        },
      },
      {
        header: 'Last activity',
        cell: ({ row }) => {
          const summary = row.original.progress
          if (summary?.restricted)
            return <span className="text-sm text-muted-foreground">Restricted</span>
          if (summary?.lastParticipation)
            return (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{summary.lastParticipation.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(summary.lastParticipation.date)}
                </p>
              </div>
            )
          const latest = [...row.original.participation].sort((first, second) =>
            second.participatedAt.localeCompare(first.participatedAt),
          )[0]
          const activity = activities.find((item) => item.id === latest?.activityId)

          return latest ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{activity?.title ?? latest.activityId}</p>
              <p className="text-xs text-muted-foreground">{formatDate(latest.participatedAt)}</p>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No participation yet</span>
          )
        },
      },
      {
        header: 'Status',
        accessorKey: 'enrollmentStatus',
        cell: ({ row }) => (
          <StatusBadge tone={enrollmentTone(row.original.enrollmentStatus)}>
            {row.original.enrollmentStatus}
          </StatusBadge>
        ),
      },
    ],
    [activities, scopedProjects, stages],
  )
  return columns
}
