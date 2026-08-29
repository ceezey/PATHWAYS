'use client'

import { usePathname, useSearchParams } from 'next/navigation'

import { BeneficiaryAccessGate } from '@/components/layout/beneficiary-access-gate'
import { UnauthorizedState } from '@/components/layout/unauthorized-state'
import { getRouteAccess } from '@/lib/rbac/route-access'
import type { PathwaysRole } from '@/types/pathways-role'

export const RouteAccessGuard = ({
  assignedProjectIds,
  children,
  role,
}: {
  assignedProjectIds: readonly string[]
  children: React.ReactNode
  role: PathwaysRole
}) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const access = getRouteAccess(role, query ? `${pathname}?${query}` : pathname, assignedProjectIds)
  const requiresBeneficiaryStepUp = access.requiresBeneficiaryStepUp === true

  if (!access.allowed) {
    return <UnauthorizedState moduleName={access.moduleName} />
  }

  if (requiresBeneficiaryStepUp) {
    return <BeneficiaryAccessGate />
  }

  return <>{children}</>
}
