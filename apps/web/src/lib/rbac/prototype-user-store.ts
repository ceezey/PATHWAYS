import type { UserRecord } from '@/types/pathways'
import { isPrototypeRole } from '@/types/prototype-role'

const PROTOTYPE_USERS_STORAGE_KEY = 'pathways.prototypeUsers'

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isStoredUserRecord = (value: unknown): value is UserRecord => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<UserRecord>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string' &&
    isPrototypeRole(candidate.role) &&
    ['Active', 'Invited', 'Deactivated'].includes(candidate.accountStatus ?? '') &&
    ['Prototype password', 'SSO placeholder'].includes(candidate.signInMethod ?? '') &&
    isStringArray(candidate.projectIds) &&
    isStringArray(candidate.projectAccess) &&
    typeof candidate.createdAt === 'string'
  )
}

export const readPrototypeUserRecords = (fallbackUsers: UserRecord[]) => {
  if (typeof window === 'undefined') {
    return fallbackUsers
  }

  const storedValue = window.localStorage.getItem(PROTOTYPE_USERS_STORAGE_KEY)

  if (!storedValue) {
    return fallbackUsers
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown
    return Array.isArray(parsed) && parsed.every(isStoredUserRecord) ? parsed : fallbackUsers
  } catch {
    return fallbackUsers
  }
}

export const writePrototypeUserRecords = (users: UserRecord[]) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PROTOTYPE_USERS_STORAGE_KEY, JSON.stringify(users))
}

// TODO(RBAC): Replace browser-local prototype users with authenticated, audited server mutations.
