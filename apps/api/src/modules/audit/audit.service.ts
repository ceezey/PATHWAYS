import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'

const auditQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    cursor: z
      .string()
      .max(80)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-f0-9-]{36}$/i)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

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
      if (
        at &&
        (Number.isNaN(new Date(at).valueOf()) || !z.string().uuid().safeParse(afterId).success)
      )
        throw new BadRequestException('Invalid audit cursor.')
      const rows = await tx.auditLog.findMany({
        where: {
          organizationId: actor.organizationId,
          ...(projects ? { projectId: { in: projects.map((project) => project.id) } } : {}),
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
          actor: { select: { fullName: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      })
      const page = rows.slice(0, query.limit)
      const last = page[page.length - 1]
      return {
        rows: page.map(({ actor, ...row }) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
          actorName: actor?.fullName ?? null,
        })),
        nextCursor:
          rows.length > query.limit && last ? `${last.occurredAt.toISOString()}|${last.id}` : null,
      }
    })
  }
}
