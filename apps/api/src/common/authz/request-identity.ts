import { ForbiddenException } from '@nestjs/common'

import type { ApplicationIdentity, AuthenticatedRequest } from './application-identity'

// The identity the auth guard attached, or 403 when a route is reached without one.
export function requestIdentity(request: AuthenticatedRequest): ApplicationIdentity {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
