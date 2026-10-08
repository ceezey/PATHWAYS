import { browserDraftStorage, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

export type PendingCreateMarker = { startedAt: number; fingerprint: string }
type PendingCreateScope = {
  organizationId: string
  userId: string
  projectId: string | null
}

/** Markers older than this are discarded as abandoned. */
const pendingCreateMaxAgeMs = 3 * 60_000
/** Confirmation polling stops after this long and releases the button. */
export const pendingCreateConfirmMs = 60_000
export const pendingCreatePollMs = 2_000
export const pendingCreateNotice =
  "We couldn't confirm the earlier submission. Check the list before submitting again."

/** Reuses the per-user draft key shape so logout cleanup also removes markers. */
export const pendingCreateKey = (kind: string, scope: PendingCreateScope) =>
  sensitiveDraftKey(`pending-create:${kind}`, { ...scope, resourceId: null })

export function readPendingCreate(key: string, now = Date.now()): PendingCreateMarker | null {
  try {
    const storage = browserDraftStorage()
    const raw = storage?.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingCreateMarker>
    if (
      typeof value.startedAt === 'number' &&
      typeof value.fingerprint === 'string' &&
      now - value.startedAt >= 0 &&
      now - value.startedAt < pendingCreateMaxAgeMs
    )
      return { startedAt: value.startedAt, fingerprint: value.fingerprint }
    storage?.removeItem(key)
  } catch {
    /* A broken marker is treated as absent. */
  }
  return null
}

export function writePendingCreate(key: string, marker: PendingCreateMarker) {
  try {
    browserDraftStorage()?.setItem(key, JSON.stringify(marker))
  } catch {
    /* The in-flight guard still applies without storage. */
  }
}

export function clearPendingCreate(key: string) {
  try {
    browserDraftStorage()?.removeItem(key)
  } catch {
    /* Best effort. */
  }
}

/** A 4xx or a non-network client error proves the server did not create the record. */
export function isDefinitiveClientError(error: unknown) {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown }
  if (typeof status === 'number') return status >= 400 && status < 500
  return typeof code === 'string' && code !== 'network'
}

/** Joins non-identifying parts into a fingerprint; trims and lowercases for stable matching. */
export const fingerprintOf = (...parts: Array<string | number | null | undefined>) =>
  parts
    .map((part) =>
      String(part ?? '')
        .trim()
        .toLowerCase(),
    )
    .join('|')

/** SHA-256 hex digest so personal fields never reach storage in clear text. */
export async function hashFingerprint(...parts: string[]) {
  const bytes = new TextEncoder().encode(fingerprintOf(...parts))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** True when a record timestamp is at or after the submit time, allowing 5s of clock skew. */
export const createdSince = (timestamp: string | null | undefined, startedAt: number) => {
  const time = timestamp ? Date.parse(timestamp) : Number.NaN
  return Number.isFinite(time) && time >= startedAt - 5_000
}
