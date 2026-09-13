export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Historical, separately reviewed bootstrap verification only. Runtime guards
// never compare a request identity to this value.
export const DEVELOPER_AUTH_UUID = '56ad4c1a-113f-401b-84e8-1d2135f174c1'
export const DEVELOPER_SUPABASE_URL = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'

export interface VerifiedAuthIdentity {
  id: string
  aal: 'aal1' | 'aal2'
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
}
