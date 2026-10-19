import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from './application-identity'

export interface WriteErrorMessages {
  forbidden: string
  conflict: string
  invalid: string
}

// Maps database refusals raised by RLS, CHECKs, triggers and unique keys to the documented HTTP codes.
export function mapWriteError(error: unknown, messages: WriteErrorMessages): never {
  if (error instanceof Error && 'getStatus' in error) throw error
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const meta = (record.meta ?? {}) as Record<string, unknown>
  const code = String(meta.code ?? record.code ?? '')
  if (code === '42501') throw new ForbiddenException(messages.forbidden)
  if (['P2002', '23505', '40001'].includes(code)) throw new ConflictException(messages.conflict)
  if (['22023', '23514'].includes(code)) throw new BadRequestException(messages.invalid)
  throw error
}

// Requires exactly one role that holds the permission.
export function requireSoleRole(
  actor: ApplicationIdentity,
  role: string,
  permission: string,
  message: string,
) {
  if (
    actor.roles.length !== 1 ||
    actor.roles[0] !== role ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  )
    throw new ForbiddenException(message)
}

// Returns the parsed version when it equals the stored one, otherwise conflicts.
export function requireSameInstant(expected: string, actual: Date, message: string) {
  const parsed = new Date(expected)
  if (Number.isNaN(parsed.valueOf()) || parsed.valueOf() !== actual.valueOf())
    throw new ConflictException(message)
  return parsed
}
