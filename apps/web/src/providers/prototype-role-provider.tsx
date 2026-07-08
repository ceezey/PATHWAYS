'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { clearBeneficiaryAccess } from '@/lib/auth/beneficiary-step-up'
import { webSetupState } from '@/lib/env'
import { type PrototypeRole, defaultPrototypeRole, prototypeRoles } from '@/types/prototype-role'

const STORAGE_KEY = 'pathways.prototypeRole'

interface PrototypeRoleContextValue {
  enabled: boolean
  role: PrototypeRole
  setRole: (role: PrototypeRole) => void
}

const PrototypeRoleContext = createContext<PrototypeRoleContextValue | null>(null)

const isPrototypeRole = (value: string | null): value is PrototypeRole =>
  prototypeRoles.some((role) => role === value)

export const PrototypeRoleProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRoleState] = useState<PrototypeRole>(defaultPrototypeRole)
  const enabled = webSetupState.rolePreviewEnabled

  useEffect(() => {
    if (!enabled) {
      return
    }

    const storedRole = window.localStorage.getItem(STORAGE_KEY)

    if (isPrototypeRole(storedRole)) {
      setRoleState(storedRole)
    }
  }, [enabled])

  const setRole = useCallback(
    (nextRole: PrototypeRole) => {
      setRoleState(nextRole)
      clearBeneficiaryAccess()

      if (enabled) {
        window.localStorage.setItem(STORAGE_KEY, nextRole)
      }
    },
    [enabled],
  )

  const value = useMemo(
    () => ({
      enabled,
      role,
      setRole,
    }),
    [enabled, role, setRole],
  )

  return <PrototypeRoleContext.Provider value={value}>{children}</PrototypeRoleContext.Provider>
}

export const usePrototypeRole = () => {
  const context = useContext(PrototypeRoleContext)

  if (!context) {
    throw new Error('usePrototypeRole must be used within PrototypeRoleProvider')
  }

  return context
}
