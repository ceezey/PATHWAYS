import type { AuditQueryInput } from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonRead } from '@/lib/api/core/owned-json-read'

const uuid = z.guid()
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
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })
  .strict()

export type AuditFilters = Pick<AuditQueryInput, 'module' | 'from' | 'to' | 'q'>

// Builds the audit query string in a fixed order and skips empty values.
export const auditSearch = (filters: AuditFilters, cursor?: string) => {
  const { module, from, to, q } = filters
  return Object.entries({ module, from, to, q, cursor })
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
}

export const auditClient = {
  list: (filters: AuditFilters, cursor?: string, signal?: AbortSignal) => {
    const search = auditSearch(filters, cursor)
    return ownedJsonRead(
      `/audit${search ? `?${search}` : ''}`,
      z.object({ rows: z.array(auditSchema).max(100), nextCursor: z.string().nullable() }).strict(),
      { signal },
    )
  },
}
