import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'

import { enrollmentTone, formatDate, projectTitle } from '../../beneficiaries.utils'

/** Stage and last activity come from the server-computed `progress` summary on each list row. */
export const useBeneficiaryColumns = ({ scopedProjects }: { scopedProjects: ProjectSummary[] }) => {
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
          const summary = row.original.progress
          if (summary?.restricted)
            return <span className="text-sm text-muted-foreground">Restricted</span>
          const stage = summary?.stage
          const progress = stage?.progressPercent ?? 0

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
          const latest = summary?.lastParticipation

          return latest ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{latest.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(latest.date)}</p>
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
    [scopedProjects],
  )
  return columns
}
