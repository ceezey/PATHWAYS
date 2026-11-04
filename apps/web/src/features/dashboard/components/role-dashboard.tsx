'use client'

import { AsyncState } from '@/components/pathways'
import { useCurrentRole } from '@/hooks/use-current-role'

import { RoleOverviewDashboard } from '../role-overview/role-overview'

/** Dashboard home: waits for the viewer role, then shows that role's overview. */
export const RoleDashboard = () => {
  const { role, profile } = useCurrentRole()
  if (!role)
    return (
      <AsyncState
        description="Loading the records in your scope."
        status="loading"
        title="Loading your dashboard"
      />
    )
  return <RoleOverviewDashboard fullName={profile?.fullName} role={role} />
}
