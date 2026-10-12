import type { ActivityExtension } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

const person = { select: { id: true, fullName: true } } as const

export const extensionSelection = {
  id: true,
  projectId: true,
  activityId: true,
  currentEndDate: true,
  requestedEndDate: true,
  reason: true,
  status: true,
  requestedById: true,
  requestedAt: true,
  verifiedById: true,
  verifiedAt: true,
  verificationNote: true,
  decidedAt: true,
  decisionNote: true,
  clientMutationId: true,
  updatedAt: true,
  requestedBy: person,
  verifiedBy: person,
  decidedBy: person,
} as const

export type ExtensionRow = Prisma.ActivityExtensionRequestGetPayload<{
  select: typeof extensionSelection
}>

export const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null

export function mapExtension(row: ExtensionRow): ActivityExtension {
  return {
    id: row.id,
    projectId: row.projectId,
    activityId: row.activityId,
    currentEndDate: day(row.currentEndDate),
    requestedEndDate: day(row.requestedEndDate) as string,
    reason: row.reason,
    status: row.status as ActivityExtension['status'],
    requestedBy: named(row.requestedBy) as { id: string; name: string },
    requestedAt: row.requestedAt.toISOString(),
    verifiedBy: named(row.verifiedBy),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationNote: row.verificationNote,
    decidedBy: named(row.decidedBy),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    updatedAt: row.updatedAt.toISOString(),
  }
}
