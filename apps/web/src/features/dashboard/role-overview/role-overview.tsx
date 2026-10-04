'use client'

import { useState } from 'react'

import { AsyncState } from '@/components/pathways'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { PathwaysRole } from '@/types/pathways-role'
import { DashboardActivityReviewPanel, dashboardActivityTarget } from '../role-dashboard'
import { ManagerOverview } from './manager-overview'
import { MeOverview } from './me-overview'
import { OfficerOverview } from './officer-overview'
import { PortfolioOverview } from './portfolio-overview'
import { useProjectExtras } from './use-project-extras'
import { useRoleOverview } from './use-role-overview'

/** Picks the Figma layout for the viewer role; System Administrator never reaches this. */
export const RoleOverviewDashboard = ({
  role,
  fullName,
}: {
  role: PathwaysRole
  fullName?: string | null
}) => {
  const { profile } = useCurrentRole()
  const read = useRoleOverview()
  const [target, setTarget] = useState<ReturnType<typeof dashboardActivityTarget>>(null)
  const extras = useProjectExtras(
    read.data?.projects ?? [],
    role,
    principalHasAtomicPermission(profile, 'monitoring.read'),
  )
  // Overdue and For review tiles reuse the existing action counts read.
  const counts = useAuthorizedRead('dashboard-action-counts', null, 'projects.read', () =>
    pathwaysClient.getDashboardActionCounts(),
  )
  if (read.isError)
    return (
      <AsyncState
        description="Your dashboard could not be loaded."
        onRetry={() => void read.refetch()}
        status="error"
        title="Dashboard unavailable"
      />
    )
  if (!read.data)
    return (
      <AsyncState
        description="Loading the records in your scope."
        status="loading"
        title="Loading your dashboard"
      />
    )
  const open = (href: string) => setTarget(dashboardActivityTarget(href))
  const data = read.data
  return (
    <>
      {role === 'Project Officer' ? (
        <OfficerOverview data={data} fullName={fullName} onOpenActivity={open} />
      ) : null}
      {role === 'Monitoring and Evaluation Officer' ? (
        <MeOverview
          data={data}
          evaluations={extras.evaluations}
          fullName={fullName}
          onOpenActivity={open}
        />
      ) : null}
      {role === 'Project Manager' ? (
        <ManagerOverview
          counts={counts.data ?? null}
          data={data}
          fullName={fullName}
          metrics={extras.metrics}
          onOpenActivity={open}
        />
      ) : null}
      {role === 'Program Manager' || role === 'Grant Manager' ? (
        <PortfolioOverview
          data={data}
          fullName={fullName}
          metrics={extras.metrics}
          readOnly={role === 'Grant Manager'}
        />
      ) : null}
      <DashboardActivityReviewPanel
        onActivityChanged={() => void read.refetch()}
        onClose={() => setTarget(null)}
        role={role}
        target={target}
      />
    </>
  )
}
