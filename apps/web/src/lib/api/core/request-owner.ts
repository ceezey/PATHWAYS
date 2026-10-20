import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { readWorkspaceContextCookie } from '@/lib/auth/workspace-access'

// The workspace context cookie value, or null outside the browser or when it is missing.
const ownerCookie = () =>
  typeof document === 'undefined' ? null : (readWorkspaceContextCookie() ?? null)

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
