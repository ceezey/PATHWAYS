'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { BeneficiaryAccessGate } from '@/components/layout/beneficiary-access-gate'
import { UnauthorizedState } from '@/components/layout/unauthorized-state'
import {
  beneficiaryAccessChangedEvent,
  clearBeneficiaryAccess,
  getBeneficiaryAccessExpiry,
  hasActiveBeneficiaryAccess,
} from '@/lib/auth/beneficiary-step-up'
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
  const searchParams = useSearchParams()
  const [beneficiaryVerified, setBeneficiaryVerified] = useState(() =>
    hasActiveBeneficiaryAccess(role),
  )
  const query = searchParams.toString()
  const access = getRouteAccess(role, query ? `${pathname}?${query}` : pathname)
  const requiresBeneficiaryStepUp = access.requiresBeneficiaryStepUp === true

  useEffect(() => {
    let expiryTimer: number | undefined

    const syncVerification = () => {
      const active = hasActiveBeneficiaryAccess(role)
      setBeneficiaryVerified(active)
      window.clearTimeout(expiryTimer)

      const expiresAt = getBeneficiaryAccessExpiry(role)
      if (active && expiresAt) {
        expiryTimer = window.setTimeout(syncVerification, Math.max(0, expiresAt - Date.now()) + 25)
      }
    }

    syncVerification()
    window.addEventListener(beneficiaryAccessChangedEvent, syncVerification)

    return () => {
      window.clearTimeout(expiryTimer)
      window.removeEventListener(beneficiaryAccessChangedEvent, syncVerification)
    }
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
