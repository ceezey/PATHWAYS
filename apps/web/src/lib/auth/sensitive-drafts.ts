'use client'

import type { ApplicationProfile } from '@/features/auth/auth-access'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
type AtomicPermission = Parameters<typeof principalHasAtomicPermission>[1]

const prefix = 'pathways:sensitive-draft:v1:'
const legacyPrefixes = [
  'pathways.beneficiaryDraft',
  'pathways.projectSetupDraft',
  'pathways.activityDraft.',
  'pathways.publicDashboardDraft.',
  'pathways.proofPreview.',
  'pathways:form-builder-draft:',
  'pathways:direct-entry:',
]
let generation = 0
const listeners = new Set<() => void>()
/** Existing invalidation lifecycle; callers may clear ephemeral private state immediately. */
export const subscribeSensitiveDraftInvalidation = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const sensitiveDraftGeneration = () => generation
export type DraftScope = {
  organizationId: string
  userId: string
  projectId: string | null
  resourceId: string | null
}
export const sensitiveDraftKey = (kind: string, scope: DraftScope) =>
  prefix +
  encodeURIComponent(
    JSON.stringify([
      kind,
      scope.organizationId,
      scope.userId,
      scope.projectId === null ? ['new-project'] : ['project', scope.projectId],
      scope.resourceId === null ? ['new-resource'] : ['resource', scope.resourceId],
    ]),
  )

export function browserDraftStorage() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
export function readSensitiveDraft(key: string) {
  try {
    const raw = browserDraftStorage()?.getItem(key)
    if (!raw || new TextEncoder().encode(raw).byteLength > 250_000) return null
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
export function removeSensitiveDraft(key: string) {
  try {
    browserDraftStorage()?.removeItem(key)
  } catch {
    /* Best effort. */
  }
}
export function writeSensitiveDraft(key: string, value: unknown, ownerGeneration: number) {
  if (ownerGeneration !== generation) return
  try {
    const raw = JSON.stringify(value)
    if (new TextEncoder().encode(raw).byteLength <= 250_000)
      browserDraftStorage()?.setItem(key, raw)
  } catch {
    /* Storage never establishes authority. */
  }
}
export function clearSensitiveDraftStorage(legacyOnly = false) {
  if (!legacyOnly) {
    generation++
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        /* Continue invalidation. */
      }
    }
  }
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    let storage: Storage
    let count: number
    try {
      storage = window[name]
      count = storage.length
    } catch {
      continue
    }
    const keys: string[] = []
    for (let index = 0; index < count; index++) {
      try {
        const key = storage.key(index)
        if (
          key &&
          ((!legacyOnly && key.startsWith(prefix)) ||
            legacyPrefixes.some((item) => key.startsWith(item)))
        )
          keys.push(key)
      } catch {
        /* Inspect remaining entries. */
      }
    }
    for (const key of keys) {
      try {
        storage.removeItem(key)
      } catch {
        /* Inspect remaining keys. */
      }
    }
  }
}
export type SensitiveDraftOwner = {
  key: string
  generation: number
  isCurrent: () => boolean
}
export function useSensitiveDraftOwner(
  profile: ApplicationProfile | null,
  kind: string,
  permission: AtomicPermission,
  projectId: string | null,
  resourceId: string | null,
  enabled = true,
) {
  const currentGeneration = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sensitiveDraftGeneration,
    sensitiveDraftGeneration,
  )
  const eligible =
    enabled &&
    principalHasAtomicPermission(profile, permission) &&
    (!projectId ||
      profile?.assignedProjectIds.includes(projectId) ||
      profile?.roles[0] === 'SYSTEM_ADMINISTRATOR' ||
      profile?.roles[0] === 'PROGRAM_MANAGER')
  const key =
    profile && eligible
      ? sensitiveDraftKey(kind, {
          organizationId: profile.organizationId,
          userId: profile.userId,
          projectId,
          resourceId,
        })
      : null
  const identity = key ? `${currentGeneration}:${key}` : null
  const latest = useRef({ identity, revision: 0 })
  const mounted = useRef(true)
  if (latest.current.identity !== identity)
    latest.current = { identity, revision: latest.current.revision + 1 }
  const ownerRevision = latest.current.revision
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      latest.current.identity === identity &&
      latest.current.revision === ownerRevision &&
      sensitiveDraftGeneration() === currentGeneration,
    [identity, ownerRevision, currentGeneration],
  )
  return useMemo(
    () =>
      key && identity
        ? ({ key, generation: currentGeneration, isCurrent } satisfies SensitiveDraftOwner)
        : null,
    [key, identity, currentGeneration, isCurrent],
  )
}
