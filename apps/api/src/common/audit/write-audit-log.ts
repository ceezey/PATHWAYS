import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../authz/application-identity'
import type { Tx } from '../prisma/transaction'

export type AuditEntry = Pick<
  Prisma.AuditLogUncheckedCreateInput,
  'projectId' | 'action' | 'entityType' | 'entityId' | 'changes'
>

// Writes one audit row for the actor inside the caller's transaction; omitted columns stay null.
export function writeAuditLog(
  tx: Tx,
  actor: Pick<ApplicationIdentity, 'organizationId' | 'userId'>,
  entry: AuditEntry,
) {
  return tx.auditLog.create({
    data: { organizationId: actor.organizationId, actorUserId: actor.userId, ...entry },
  })
}
