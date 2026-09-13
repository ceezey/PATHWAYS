import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'

import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import type { CreateProgramDto } from './programs.dto'

@Injectable()
export class ProgramsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', (tx, actor) =>
      tx.program.findMany({
        where: {
          organizationId: actor.organizationId,
          archivedAt: null,
          ...(actor.roles[0] === 'SYSTEM_ADMINISTRATOR'
            ? {}
            : {
                OR: [
                  { managerUserId: actor.userId },
                  {
                    project_program: {
                      some: { id: { in: actor.assignedProjectIds }, archivedAt: null },
                    },
                  },
                ],
              }),
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          startDate: true,
          endDate: true,
          status: true,
        },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    )
  }

  create(identity: ApplicationIdentity, input: CreateProgramDto) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (actor.roles[0] !== 'SYSTEM_ADMINISTRATOR') {
        throw new ForbiddenException('Program creation requires System Administrator authority.')
      }
      if (input.startDate && input.endDate && input.endDate < input.startDate) {
        throw new BadRequestException('End date must not precede start date.')
      }
      const row = await tx.program.create({
        data: {
          organizationId: actor.organizationId,
          code: input.code,
          name: input.name,
          description: input.description?.trim() || null,
          startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
          endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
          status: input.status,
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'PROGRAM_CREATED',
          entityType: 'Program',
          entityId: row.id,
          changes: { code: input.code, status: input.status },
        },
      })
      return row
    })
  }
}
