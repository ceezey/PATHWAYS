export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface VerifiedAuthIdentity {
  id: string
  aal: 'aal1' | 'aal2'
  /** Latest signed TOTP `amr` timestamp (epoch seconds); step-up freshness only. */
  mfaVerifiedAt?: number
}

export interface ApplicationIdentity extends VerifiedAuthIdentity {
  aal: 'aal2'
  userId: string
  organizationId: string
  organizationName?: string
  fullName: string
  roles: string[]
  permissions: string[]
  assignedProjectIds: string[]
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>
  auth?: VerifiedAuthIdentity
  user?: ApplicationIdentity
  /** Verified Supabase session claim; set by the guard with `user`, never from client input. */
  authSessionId?: string
}
