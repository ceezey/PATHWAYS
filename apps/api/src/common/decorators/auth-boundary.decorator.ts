import { SetMetadata } from '@nestjs/common'

export const AUTH_BOUNDARY_KEY = 'pathways:auth-boundary'
// Auth handlers only; this is not a business permission decorator.
export const AuthBoundary = (boundary: 'mfa-setup' | 'workspace-discovery' | 'profile') =>
  SetMetadata(AUTH_BOUNDARY_KEY, boundary)
