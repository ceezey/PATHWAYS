import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto'

const projectSelection = {
  id: true,
  code: true,
  title: true,
  description: true,
  objectives: true,
  implementationArea: true,
  startDate: true,
  endDate: true,
  status: true,
  programId: true,
  updatedAt: true,
  userProjectAssignment_project: {
    where: { status: 'ACTIVE' as const, user: { role: { code: 'PROJECT_MANAGER' } } },
    select: { user: { select: { fullName: true } } },
    take: 1,
  },
} satisfies Prisma.ProjectSelect

function mapProject(project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>) {
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description,
    objectives: project.objectives,
    implementationArea: project.implementationArea,
    startDate: project.startDate?.toISOString().slice(0, 10),
    endDate: project.endDate?.toISOString().slice(0, 10),
    status: project.status,
    programId: project.programId,
    projectManager: project.userProjectAssignment_project[0]?.user.fullName ?? null,
    updatedAt: project.updatedAt.toISOString(),
  }
}

function projectData(input: CreateProjectDto) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new BadRequestException('End date must not precede start date.')
  }
  return {
    code: input.code,
    title: input.title,
    description: input.description?.trim() || null,
    objectives: input.objectives?.trim() || null,
    implementationArea: input.implementationArea?.trim() || null,
    startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    status: input.status,
    programId: input.programId?.toLowerCase() || null,
  }
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async requireProgram(
    tx: Prisma.TransactionClient,
    organizationId: string,
    programId: string | null,
  ) {
    if (!programId) return
    if (!UUID_PATTERN.test(programId)) throw new NotFoundException('Program unavailable.')
    const program = await tx.program.findFirst({
      where: { id: programId, organizationId, archivedAt: null },
      select: { id: true },
    })
    if (!program) throw new NotFoundException('Program unavailable.')
  }

  list(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', async (tx, actor) => {
      const rows = await tx.project.findMany({
        relationLoadStrategy: 'join',
        where: projectScope(actor),
        select: projectSelection,
        orderBy: { id: 'asc' },
        take: 100,
      })
      return rows.map(mapProject)
    })
  }

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const row = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: projectSelection,
      })
      if (!row) throw new NotFoundException('Project unavailable.')
      return mapProject(row)
    })
  }

  create(identity: ApplicationIdentity, input: CreateProjectDto) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (!['SYSTEM_ADMINISTRATOR', 'PROJECT_MANAGER'].includes(actor.roles[0])) {
        throw new ForbiddenException('Project creation is outside your authority.')
      }
      const data = projectData(input)
      await this.requireProgram(tx, actor.organizationId, data.programId)
      const created = await tx.project.create({
        data: { ...data, organizationId: actor.organizationId, createdById: actor.userId },
        select: { id: true },
      })
      if (actor.roles[0] === 'PROJECT_MANAGER') {
        await tx.userProjectAssignment.create({
          data: {
            organizationId: actor.organizationId,
            projectId: created.id,
            userId: actor.userId,
            assignedById: actor.userId,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: created.id,
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: created.id,
          changes: { code: input.code, status: input.status },
        },
      })
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: created.id },
        select: projectSelection,
      })
      return mapProject(result)
    })
  }

  update(identity: ApplicationIdentity, projectId: string, input: UpdateProjectDto) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const current = await tx.project.findFirst({
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: { id: true, updatedAt: true },
      })
      if (!current) throw new NotFoundException('Project unavailable.')
      const expected = new Date(input.expectedUpdatedAt)
      if (Number.isNaN(expected.valueOf()) || current.updatedAt.valueOf() !== expected.valueOf()) {
        throw new ConflictException('Project changed; reload before saving.')
      }
      const data = projectData(input)
      await this.requireProgram(tx, actor.organizationId, data.programId)
      const changed = await tx.project.updateMany({
        where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
        data,
      })
      if (changed.count !== 1) throw new ConflictException('Project changed; reload before saving.')
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.id,
          action: 'PROJECT_UPDATED',
          entityType: 'Project',
          entityId: current.id,
          changes: { code: input.code, status: input.status },
        },
      })
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: current.id },
        select: projectSelection,
      })
      return mapProject(result)
    })
  }
}
