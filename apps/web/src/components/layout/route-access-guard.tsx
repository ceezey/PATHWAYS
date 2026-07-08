'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { BeneficiaryAccessGate } from '@/components/layout/beneficiary-access-gate'
import { UnauthorizedState } from '@/components/layout/unauthorized-state'
import { clearBeneficiaryAccess, hasActiveBeneficiaryAccess } from '@/lib/auth/beneficiary-step-up'
import { getRouteAccess } from '@/lib/rbac/route-access'
import type { PrototypeRole } from '@/types/prototype-role'

export const RouteAccessGuard = ({
  children,
  role,
}: {
  children: React.ReactNode
  role: PrototypeRole
}) => {
  const pathname = usePathname()
  const [beneficiaryVerified, setBeneficiaryVerified] = useState(() =>
    hasActiveBeneficiaryAccess(role),
  )
  const access = getRouteAccess(role, pathname)
  const requiresBeneficiaryStepUp = access.requiresBeneficiaryStepUp === true

  useEffect(() => {
    setBeneficiaryVerified(hasActiveBeneficiaryAccess(role))
  }, [role])

  if (!access.allowed) {
    return <UnauthorizedState moduleName={access.moduleName} />
  }

  if (requiresBeneficiaryStepUp && !beneficiaryVerified) {
    return <BeneficiaryAccessGate onVerified={() => setBeneficiaryVerified(true)} />
  }

  return <>{children}</>
}

export const clearRouteScopedVerification = () => {
  clearBeneficiaryAccess()
}
