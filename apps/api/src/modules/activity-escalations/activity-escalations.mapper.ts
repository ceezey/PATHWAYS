import type { ActivityEscalation } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

const person = { select: { id: true, fullName: true } } as const

export const escalationSelection = {
  id: true,
  projectId: true,
  activityId: true,
  reason: true,
  status: true,
  raisedById: true,
  raisedAt: true,
  forwardedById: true,
  forwardedAt: true,
  forwardNote: true,
  resolvedAt: true,
  resolutionNote: true,
  resolutionLevel: true,
  updatedAt: true,
  raisedBy: person,
  forwardedBy: person,
  resolvedBy: person,
} as const

export type EscalationRow = Prisma.ActivityEscalationGetPayload<{
  select: typeof escalationSelection
}>

const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null

export function mapEscalation(row: EscalationRow): ActivityEscalation {
  return {
    id: row.id,
    projectId: row.projectId,
    activityId: row.activityId,
    reason: row.reason,
    status: row.status as ActivityEscalation['status'],
    raisedBy: named(row.raisedBy) as { id: string; name: string },
    raisedAt: row.raisedAt.toISOString(),
    forwardedBy: named(row.forwardedBy),
    forwardedAt: row.forwardedAt?.toISOString() ?? null,
    forwardNote: row.forwardNote,
    resolvedBy: named(row.resolvedBy),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    resolutionLevel: row.resolutionLevel as ActivityEscalation['resolutionLevel'],
    updatedAt: row.updatedAt.toISOString(),
  }
}
