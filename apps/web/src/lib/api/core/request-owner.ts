import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { contextCookieName } from '@/lib/auth/workspace-access'

// The whole workspace context cookie entry, or null outside the browser or when it is missing.
const ownerCookie = () =>
  typeof document === 'undefined'
    ? null
    : (document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${contextCookieName}=`)) ?? null)

// Captures the workspace cookie and draft generation; the check fails once either changes or the signal aborts.
export const captureRequestOwner = (signal?: AbortSignal | null) => {
  const owner = ownerCookie()
  const generation = sensitiveDraftGeneration()
  return () =>
    owner !== null &&
    owner === ownerCookie() &&
    generation === sensitiveDraftGeneration() &&
    !signal?.aborted
}
