import type { PrototypeAccountPublic } from '@/lib/auth/prototype-accounts'
import type { PrototypeSession } from '@/types/auth'

const STORAGE_KEY = 'pathways.prototypeSession'

export const createPrototypeSession = (account: PrototypeAccountPublic): PrototypeSession => ({
  email: account.email,
  displayName: account.displayName,
  role: account.role,
  signedInAt: new Date().toISOString(),
})

export const readPrototypeSession = (): PrototypeSession | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return null
  }

  try {
    const parsed = JSON.parse(stored) as PrototypeSession

    if (!parsed.email || !parsed.displayName || !parsed.role || !parsed.signedInAt) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export const writePrototypeSession = (session: PrototypeSession) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export const clearPrototypeSession = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
