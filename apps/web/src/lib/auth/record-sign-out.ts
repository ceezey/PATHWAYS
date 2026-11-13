import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'
import { decodeWorkspaceContext, readWorkspaceContextCookie } from './workspace-access'

// Best effort: asks the API to record SIGNED_OUT and never rejects; it skips requestFoundation because that re-reads the session this sign-out is clearing.
export async function recordSignOut(accessToken: string, subject: string): Promise<void> {
  try {
    const workspace = decodeWorkspaceContext(readWorkspaceContextCookie(), subject)
    if (!workspace) return
    const base = approvedApiBaseUrl(
      webEnv.NEXT_PUBLIC_API_BASE_URL,
      webEnv.NEXT_PUBLIC_API_BASE_URL,
    )
    await fetch(`${base.toString().replace(/\/$/, '')}/auth/sign-out`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Pathways-Organization-Id': workspace.organizationId,
        'X-Pathways-User-Id': workspace.userId,
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Sign-out proceeds when the record cannot be written.
  }
}
