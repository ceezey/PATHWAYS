import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { AUDIT_MODULES, auditQuerySchema } from '@pathways/shared'
import { z } from 'zod'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { PrismaService } from '../../prisma/prisma.service'

// Only these non-personal change keys leave the audit table; a new key needs a CR amendment.
const detailKeys = new Map<string, readonly string[]>([
  ['IMPORT_ENROLLMENT_DATE_CONFIRMED', ['source', 'rowNumber']],
])
const auditDetails = (action: string, changes: unknown) => {
  const stored =
    changes && typeof changes === 'object' && !Array.isArray(changes)
      ? (changes as Record<string, unknown>)
      : {}
  return Object.fromEntries(
    (detailKeys.get(action) ?? []).flatMap((key) => {
      const value = stored[key]
      return ['string', 'number', 'boolean'].includes(typeof value) ? [[key, value]] : []
    }),
  ) as Record<string, string | number | boolean>
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  list(identity: ApplicationIdentity, input: unknown) {
    const parsed = auditQuerySchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid audit filters.')
    const query = parsed.data
    return withAuthorizedOperation(this.prisma, identity, 'audit.read', async (tx, actor) => {
      const admin = actor.roles[0] === 'SYSTEM_ADMINISTRATOR'
      const projects =
        admin && !query.projectId
          ? undefined
          : await tx.project.findMany({
              where: {
                AND: [projectScope(actor), ...(query.projectId ? [{ id: query.projectId }] : [])],
              },
              select: { id: true },
              take: 1001,
            })
      if (projects && projects.length > 1000)
        throw new BadRequestException('Choose a project to narrow audit scope.')
      const [at, afterId] = query.cursor?.split('|') ?? []
      if (at && (Number.isNaN(new Date(at).valueOf()) || !z.guid().safeParse(afterId).success))
        throw new BadRequestException('Invalid audit cursor.')
      const listedTypes = AUDIT_MODULES.flatMap((m) => [...m.entityTypes])
      const moduleTypes = AUDIT_MODULES.find((m) => m.key === query.module)?.entityTypes
      // Asia/Manila is UTC+8 with no daylight saving time.
      const manilaStart = (day: string) => Date.parse(`${day}T00:00:00.000+08:00`)
      const range = {
        ...(query.from ? { gte: new Date(manilaStart(query.from)) } : {}),
        ...(query.to ? { lt: new Date(manilaStart(query.to) + 86_400_000) } : {}),
      }
      const text = (value: string) => ({ contains: value, mode: 'insensitive' as const })
      const rows = await tx.auditLog.findMany({
        where: {
          organizationId: actor.organizationId,
          ...(projects ? { projectId: { in: projects.map((project) => project.id) } } : {}),
          ...(query.module === 'other' ? { entityType: { notIn: listedTypes } } : {}),
          ...(moduleTypes?.length ? { entityType: { in: [...moduleTypes] } } : {}),
          ...(query.from || query.to ? { occurredAt: range } : {}),
          // The keyword sits under AND so the cursor's top-level OR is never replaced.
          ...(query.q
            ? {
                AND: [
                  {
                    OR: [
                      { action: text(query.q) },
                      { entityId: text(query.q) },
                      { actor: { is: { fullName: text(query.q) } } },
                      ...(z.guid().safeParse(query.q).success
                        ? [{ id: query.q.toLowerCase() }, { actorUserId: query.q.toLowerCase() }]
                        : []),
                    ],
                  },
                ],
              }
            : {}),
          ...(at
            ? {
                OR: [
                  { occurredAt: { lt: new Date(at) } },
                  { occurredAt: new Date(at), id: { lt: afterId } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          occurredAt: true,
          action: true,
          entityType: true,
          entityId: true,
          projectId: true,
          actorUserId: true,
          changes: true,
          actor: { select: { fullName: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      })
      // Opening the Audit Log is itself recorded; older pages are not.
      if (!query.cursor)
        await writeAuditLog(tx, actor, {
          // Only a project in the caller's scope is recorded; audit_logs.project_id has no foreign key.
          projectId: query.projectId && projects?.length ? query.projectId : null,
          action: 'AUDIT_LOG_VIEWED',
          entityType: 'AuditLog',
        })
      const page = rows.slice(0, query.limit)
      const last = page[page.length - 1]
      return {
        rows: page.map(({ actor, changes, ...row }) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
          actorName: actor?.fullName ?? null,
          details: auditDetails(row.action, changes),
        })),
        nextCursor:
          rows.length > query.limit && last ? `${last.occurredAt.toISOString()}|${last.id}` : null,
      }
    })
  }
}
