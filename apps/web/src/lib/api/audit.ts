import { z } from 'zod'

import { ownedJsonRead } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const auditSchema = z
  .object({
    id: uuid,
    occurredAt: timestamp,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    projectId: uuid.nullable(),
    actorUserId: uuid.nullable(),
    actorName: z.string().nullable(),
  })
  .strict()

export const auditClient = {
  list: (cursor?: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      z.object({ rows: z.array(auditSchema).max(100), nextCursor: z.string().nullable() }).strict(),
      { signal },
    ),
}
