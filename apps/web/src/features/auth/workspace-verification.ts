import {
  type ApplicationContext,
  type ApplicationProfile,
  AuthAccessError,
  type MfaStatus,
  parseApplicationProfile,
  parseMfaStatus,
  requestAuthJson,
} from './auth-access'
import { resolveWorkspaceProfile, workspacePermissions } from './workspace-access'

export type WorkspaceAccess =
  | 'loading'
  | 'mfa_required'
  | 'session_expired'
  | 'blocked'
  | 'unavailable'
  | 'no_workspace'
  | 'ready'

export interface WorkspaceVerification {
  access: Exclude<WorkspaceAccess, 'loading'>
  profile: ApplicationProfile | null
  mfa: MfaStatus | null
  error: string | null
  clearContext: boolean
}

export function verificationFailure(error: unknown): WorkspaceVerification {
  const status = error instanceof AuthAccessError ? error.status : 503
  const rejected = status === 400 || status === 401 || status === 403 || status === 404
  return {
    access: status === 401 ? 'session_expired' : rejected ? 'blocked' : 'unavailable',
    profile: null,
    mfa: null,
    error: error instanceof AuthAccessError ? error.message : new AuthAccessError(503).message,
    clearContext: rejected,
  }
}

/** A selection is an untrusted hint, not a role or an authorization cache.
 * /auth/me enforces current Auth, AAL2, session liveness, profile and assignments.
 */
export async function verifyWorkspace(
  base: string,
  token: string,
  subject: string,
  signal: AbortSignal,
  selection?: ApplicationContext,
  fetcher: typeof fetch = fetch,
  trustedBaseUrl?: string,
): Promise<WorkspaceVerification> {
  const ensureActive = () => {
    if (signal.aborted) throw new AuthAccessError('network')
  }
  const status = async () => {
    const mfa = parseMfaStatus(
      await requestAuthJson(
        base,
        '/auth/mfa/status',
        token,
        signal,
        undefined,
        fetcher,
        trustedBaseUrl,
      ),
    )
    ensureActive()
    if (mfa.authUserId !== subject) throw new AuthAccessError(403)
    return mfa
  }
  const notReady = (mfa: MfaStatus): WorkspaceVerification => ({
    access: mfa.aal === 'aal1' ? 'mfa_required' : 'blocked',
    profile: null,
    mfa,
    error: null,
    clearContext: true,
  })
  try {
    ensureActive()
    if (selection) {
      let raw: unknown
      try {
        raw = await requestAuthJson(
          base,
          '/auth/me',
          token,
          signal,
          selection,
          fetcher,
          trustedBaseUrl,
        )
      } catch (error) {
        ensureActive()
        // A 403 alone does not prove MFA is missing. Ask the MFA endpoint only
        // for this exceptional case; never rediscover around a denied selection.
        if (error instanceof AuthAccessError && error.status === 403) {
          const mfa = await status()
          if (mfa.aal !== 'aal2' || !mfa.applicationAccessEnabled) return notReady(mfa)
          return { ...verificationFailure(error), mfa }
        }
        throw error
      }
      ensureActive()
      const profile = parseApplicationProfile(raw)
      if (
        profile.id !== subject ||
        profile.userId !== selection.userId ||
        profile.organizationId !== selection.organizationId ||
        !workspacePermissions(profile).readProjects
      )
        throw new AuthAccessError(403)
      return {
        access: 'ready',
        profile,
        // This is the assurance proven by /me, not a decoded browser JWT.
        mfa: {
          authUserId: profile.id,
          aal: profile.aal,
          enrollmentAllowed: true,
          applicationAccessEnabled: true,
        },
        error: null,
        clearContext: false,
      }
    }
    const mfa = await status()
    if (mfa.aal !== 'aal2' || !mfa.applicationAccessEnabled) return notReady(mfa)
    const profile = await resolveWorkspaceProfile(
      base,
      token,
      subject,
      signal,
      fetcher,
      trustedBaseUrl,
    )
    ensureActive()
    return {
      access: profile ? 'ready' : 'no_workspace',
      profile,
      mfa,
      error: null,
      clearContext: !profile,
    }
  } catch (error) {
    ensureActive()
    return verificationFailure(error)
  }
}
