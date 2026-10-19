import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'

export const STALE = 'This escalation changed; reload before deciding.'

// Maps database refusals raised by RLS, CHECKs, the transition trigger and unique keys to the documented HTTP codes.
export function writeError(error: unknown): never {
  if (error instanceof Error && 'getStatus' in error) throw error
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const meta = (record.meta ?? {}) as Record<string, unknown>
  const code = String(meta.code ?? record.code ?? '')
  if (code === '42501')
    throw new ForbiddenException('The escalation is unavailable under your access.')
  if (['P2002', '23505', '40001'].includes(code)) throw new ConflictException(STALE)
  if (['22023', '23514'].includes(code)) throw new BadRequestException('Invalid escalation.')
  throw error
}

export function soleRole(actor: ApplicationIdentity, role: string, permission: string) {
  if (
    actor.roles.length !== 1 ||
    actor.roles[0] !== role ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  )
    throw new ForbiddenException('This escalation step is unavailable for your role.')
}

export function sameInstant(expected: string, actual: Date) {
  const parsed = new Date(expected)
  if (Number.isNaN(parsed.valueOf()) || parsed.valueOf() !== actual.valueOf())
    throw new ConflictException(STALE)
  return parsed
}
