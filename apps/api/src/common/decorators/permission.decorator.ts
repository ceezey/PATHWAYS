import { SetMetadata } from '@nestjs/common'
import type { AtomicPermission } from '../../modules/auth/authorization-policy'

export const PERMISSION_KEY = 'pathways:atomic-permission'
/** Required on every reviewed business handler, in addition to scoped queries. */
export const RequirePermission = (...permissions: [AtomicPermission, ...AtomicPermission[]]) =>
  SetMetadata(PERMISSION_KEY, permissions.length === 1 ? permissions[0] : permissions)
