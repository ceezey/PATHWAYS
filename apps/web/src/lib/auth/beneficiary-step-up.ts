import type { PrototypeRole } from '@/types/prototype-role'

const STORAGE_KEY = 'pathways.beneficiaryAccess'
const verificationDurationMs = 15 * 60 * 1000

interface BeneficiaryAccessState {
  role: PrototypeRole
  verifiedAt: string
  expiresAt: string
  token: string
}

export const beneficiaryAccessStorageKey = STORAGE_KEY

export const clearBeneficiaryAccess = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(STORAGE_KEY)
}

export const writeBeneficiaryAccess = (role: PrototypeRole, expiresAt?: string) => {
  if (typeof window === 'undefined') {
    return
  }

  const now = new Date()
  const state: BeneficiaryAccessState = {
    role,
    verifiedAt: now.toISOString(),
    expiresAt: expiresAt ?? new Date(now.getTime() + verificationDurationMs).toISOString(),
    token: window.crypto.randomUUID(),
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const hasActiveBeneficiaryAccess = (role: PrototypeRole) => {
  if (typeof window === 'undefined') {
    return false
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return false
  }

  try {
    const state = JSON.parse(stored) as BeneficiaryAccessState
    const active = state.role === role && new Date(state.expiresAt).getTime() > Date.now()

    if (!active) {
      clearBeneficiaryAccess()
    }

    return active
  } catch {
    clearBeneficiaryAccess()
    return false
  }
}
