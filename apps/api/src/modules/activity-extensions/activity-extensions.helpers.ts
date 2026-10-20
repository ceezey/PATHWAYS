import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { mapWriteError, requireSameInstant, requireSoleRole } from '../../common/authz/write-guards'

const STALE = 'This request changed; reload before deciding.'

export const writeError = (error: unknown): never =>
  mapWriteError(error, {
    forbidden: 'The extension request is unavailable under your access.',
    conflict: STALE,
    invalid: 'Invalid extension request.',
  })

export const soleRole = (actor: ApplicationIdentity, role: string, permission: string) =>
  requireSoleRole(actor, role, permission, 'This extension step is unavailable for your role.')

export const sameInstant = (expected: string, actual: Date) =>
  requireSameInstant(expected, actual, STALE)
