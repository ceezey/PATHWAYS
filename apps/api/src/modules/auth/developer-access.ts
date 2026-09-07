// Single-account developer exception: SOURCE_OF_TRUTH.md section 6.1.
export const DEVELOPER_AUTH_UUID = '56ad4c1a-113f-401b-84e8-1d2135f174c1'
export const DEVELOPER_SUPABASE_URL = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Keep off until reviewed bootstrap and all security preconditions pass.
// Never replaces MFA, active-profile, permission, or scope checks.
export const developerApplicationAccessEnabled = () =>
  process.env.PATHWAYS_DEVELOPER_ACCESS_ENABLED === 'true'

export interface VerifiedAuthIdentity {
  id: string
  aal: 'aal1' | 'aal2'
}

export interface ApplicationIdentity extends VerifiedAuthIdentity {
  aal: 'aal2'
  userId: string
  organizationId: string
  fullName: string
  roles: string[]
  permissions: string[]
  assignedProjectIds: string[]
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>
  auth?: VerifiedAuthIdentity
  user?: ApplicationIdentity
}
