import type { Tx } from '../prisma/transaction'
import { UUID_PATTERN } from './application-identity'

// Session rows of migration 0094 (app_session_open holds the limits: 12 hours, 30 idle minutes, 3 sessions).

type Runner = Pick<Tx, '$queryRaw'>
export type OwnEndReason = 'SIGNED_OUT' | 'USER' | 'PASSWORD_CHANGED'
export type UserEndReason = 'ADMIN' | 'ACCOUNT_CHANGED'
export interface AppSessionView {
  id: string
  device: string | null
  startedAt: string
  lastActiveAt: string
  current: boolean
}

const count = (rows: Array<{ n: unknown }>) => Number(rows[0]?.n ?? 0)

/** Records activity for a verified session; a new session ends the oldest beyond the limit. Returns how many it ended. */
export async function recordSessionActivity(
  db: Runner,
  subject: string,
  sessionId: string,
  device: string | undefined,
): Promise<number> {
  return count(
    await db.$queryRaw<Array<{ n: unknown }>>`SELECT pathways.app_session_touch(
      ${subject}::uuid, ${sessionId}::uuid, ${device?.slice(0, 200) ?? null}::text) AS n`,
  )
}

/** Ends one of the subject's own sessions, or every one except keepId. */
export async function endOwnSessions(
  tx: Runner,
  subject: string,
  target: { sessionId: string } | { keepId: string },
  reason: OwnEndReason,
): Promise<number> {
  const sessionId = 'sessionId' in target ? target.sessionId : null
  const keepId = 'keepId' in target ? target.keepId : null
  return count(
    await tx.$queryRaw<Array<{ n: unknown }>>`SELECT pathways.app_session_end(
      ${subject}::uuid, ${sessionId}::uuid, ${keepId}::uuid, ${reason}::text) AS n`,
  )
}

/** Ends every session of a system user in the transaction's verified organization. */
export async function endUserSessions(tx: Runner, userId: string, reason: UserEndReason) {
  return count(
    await tx.$queryRaw<Array<{ n: unknown }>>`SELECT pathways.app_session_end_user(
      ${userId}::uuid, ${reason}::text) AS n`,
  )
}

/** The Supabase session id inside an access token the API just received from the identity provider. */
export function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString())
    return typeof payload.session_id === 'string' && UUID_PATTERN.test(payload.session_id)
      ? payload.session_id
      : null
  } catch {
    return null
  }
}
