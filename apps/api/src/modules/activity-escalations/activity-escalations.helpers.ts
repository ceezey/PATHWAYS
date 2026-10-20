import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { mapWriteError, requireSameInstant, requireSoleRole } from '../../common/authz/write-guards'

export const STALE = 'This escalation changed; reload before deciding.'

export const writeError = (error: unknown): never =>
  mapWriteError(error, {
    forbidden: 'The escalation is unavailable under your access.',
    conflict: STALE,
    invalid: 'Invalid escalation.',
  })

export const soleRole = (actor: ApplicationIdentity, role: string, permission: string) =>
  requireSoleRole(actor, role, permission, 'This escalation step is unavailable for your role.')

export const sameInstant = (expected: string, actual: Date) =>
  requireSameInstant(expected, actual, STALE)
