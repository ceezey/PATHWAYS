import type { PrototypeRole } from '@/types/prototype-role'

const STORAGE_KEY = 'pathways.beneficiaryAccess'
const verificationDurationMs = 15 * 60 * 1000
export const beneficiaryAccessChangedEvent = 'pathways:beneficiary-access-changed'

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

  const hadAccess = window.sessionStorage.getItem(STORAGE_KEY) !== null
  window.sessionStorage.removeItem(STORAGE_KEY)
  if (hadAccess) {
    window.dispatchEvent(new Event(beneficiaryAccessChangedEvent))
  }
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
  window.dispatchEvent(new Event(beneficiaryAccessChangedEvent))
}

const readBeneficiaryAccess = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return null
  }

  try {
    return JSON.parse(stored) as BeneficiaryAccessState
  } catch {
    clearBeneficiaryAccess()
    return null
  }
}

export const getBeneficiaryAccessExpiry = (role: PrototypeRole) => {
  const state = readBeneficiaryAccess()
  if (!state || state.role !== role) {
    return null
  }

  const expiresAt = new Date(state.expiresAt).getTime()
  return Number.isFinite(expiresAt) ? expiresAt : null
}

export const hasActiveBeneficiaryAccess = (role: PrototypeRole) => {
  const expiresAt = getBeneficiaryAccessExpiry(role)
  const active = expiresAt !== null && expiresAt > Date.now()

  if (!active && typeof window !== 'undefined' && window.sessionStorage.getItem(STORAGE_KEY)) {
    clearBeneficiaryAccess()
  }

  return active
}
