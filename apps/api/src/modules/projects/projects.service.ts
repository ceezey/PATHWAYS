import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { normalizeTargetGoal } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import {
  type CanonicalRole,
  canAssignRole,
  hasAtomicPermission,
  isCanonicalRole,
} from '@app/modules/auth/authorization-policy'
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
  implementingPartners: true,
  sector: true,
  targetBeneficiaries: true,
  targetGoal: true,
  programManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
  programId: true,
  updatedAt: true,
  programManager: { select: { id: true, fullName: true, email: true } },
  userProjectAssignment_project: {
    where: { status: 'ACTIVE' as const, endedAt: null },
    select: {
      user: { select: { id: true, fullName: true, email: true, role: { select: { code: true } } } },
    },
    orderBy: { id: 'asc' as const },
    take: 50,
  },
} satisfies Prisma.ProjectSelect

const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'
const projectTeamRoles = [
  'PROJECT_MANAGER',
  'MONITORING_AND_EVALUATION_OFFICER',
  'PROJECT_OFFICER',
] as const
type ProjectTeamRole = (typeof projectTeamRoles)[number]

function mapProject(
  project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>,
  projectBudget: string | null,
) {
  const team = project.userProjectAssignment_project
  const projectManagers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_MANAGER',
  )
  const monitoringOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'MONITORING_AND_EVALUATION_OFFICER',
  )
  const projectOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_OFFICER',
  )
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description,
    objectives: project.objectives,
    implementationArea: project.implementationArea,
    implementingPartners: project.implementingPartners,
    sector: project.sector,
    targetBeneficiaries: project.targetBeneficiaries,
    projectBudget,
    targetGoal:
      project.targetGoal === null ? null : normalizeTargetGoal(project.targetGoal.toString()),
    startDate: project.startDate?.toISOString().slice(0, 10),
    endDate: project.endDate?.toISOString().slice(0, 10),
    status: project.status,
    programId: project.programId,
    programManagerId: project.programManagerId,
    programManager: project.programManager?.fullName ?? null,
    projectManagerId: projectManagers[0]?.user.id ?? null,
    projectManager: projectManagers[0]?.user.fullName ?? null,
    monitoringOfficerId: monitoringOfficers[0]?.user.id ?? null,
    monitoringOfficer: monitoringOfficers[0]?.user.fullName ?? null,
    projectOfficerIds: projectOfficers.map((assignment) => assignment.user.id),
    projectOfficers: projectOfficers.map((assignment) => assignment.user.fullName),
    updatedAt: project.updatedAt.toISOString(),
  }
}

function projectBudgetValue(value: string) {
  try {
    return new Prisma.Decimal(value)
  } catch {
    throw new BadRequestException('Project budget must be a valid non-negative PHP amount.')
  }
}

function projectData(input: CreateProjectDto | UpdateProjectDto, code: string) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new BadRequestException('End date must not precede start date.')
  }
  let targetGoal: Prisma.Decimal | undefined
  if (input.targetGoal !== undefined) {
    try {
      targetGoal = new Prisma.Decimal(normalizeTargetGoal(input.targetGoal))
    } catch {
      throw new BadRequestException('Project target goal must be greater than 0 and at most 100.')
    }
  }
  return {
    code,
    title: input.title,
    description: input.description?.trim() || null,
    objectives: input.objectives?.trim() || null,
    implementationArea: input.implementationArea?.trim() || null,
    ...(input.implementingPartners === undefined
      ? {}
      : { implementingPartners: input.implementingPartners?.trim() || null }),
    ...(input.sector === undefined ? {} : { sector: input.sector?.trim() || null }),
    ...(input.targetBeneficiaries === undefined
      ? {}
      : { targetBeneficiaries: input.targetBeneficiaries }),
    ...(targetGoal === undefined ? {} : { targetGoal }),
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

  private async requireProgramManager(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string | null | undefined,
  ) {
    if (userId === undefined || userId === null) return userId
    const normalized = userId.toLowerCase()
    const user = await tx.systemUser.findFirst({
      where: {
        id: normalized,
        organizationId,
        accountStatus: 'ACTIVE',
        archivedAt: null,
        role: { code: 'PROGRAM_MANAGER', isActive: true },
      },
      select: { id: true },
    })
    if (!user) throw new BadRequestException('The selected Program Manager is unavailable.')
    return user.id
  }

  private async readProjectBudgets(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectIds: string[],
  ) {
    const values = new Map<string, string>()
    if (
      projectIds.length === 0 ||
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.read')
    ) {
      return values
    }
    const rows = await tx.projectBudgetRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: { in: projectIds },
        activityId: null,
        category: projectBudgetCategory,
        archivedAt: null,
      },
      select: { projectId: true, plannedBudget: true },
      take: 100,
    })
    for (const row of rows) values.set(row.projectId, row.plannedBudget.toFixed(2))
    return values
  }

  private async saveProjectBudget(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    value: string | undefined,
    operation: 'create' | 'update',
  ) {
    if (value === undefined) return
    const canCreate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.create')
    const canUpdate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.update')
    if (!canCreate || (operation === 'update' && !canUpdate)) {
      throw new ForbiddenException('Project budget authority is missing.')
    }
    const plannedBudget = projectBudgetValue(value)
    const current = await tx.projectBudgetRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId,
        activityId: null,
        category: projectBudgetCategory,
        archivedAt: null,
      },
      select: { id: true, plannedBudget: true },
    })
    if (current?.plannedBudget.equals(plannedBudget)) return
    if (current) {
      await tx.projectBudgetRecord.update({
        where: { id: current.id },
        data: { archivedAt: new Date() },
      })
    }
    await tx.projectBudgetRecord.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        category: projectBudgetCategory,
        currency: 'PHP',
        plannedBudget,
        remarks: 'Project profile planned budget.',
        recordedById: actor.userId,
      },
    })
  }

  private async replaceTeamAssignments(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    input: CreateProjectDto | UpdateProjectDto,
    creating: boolean,
  ) {
    const actorRole = actor.roles[0]
    if (!isCanonicalRole(actorRole))
      throw new ForbiddenException('Assignment authority is missing.')

    const requested = new Map<ProjectTeamRole, string[]>()
    if (input.projectManagerId !== undefined) {
      requested.set('PROJECT_MANAGER', input.projectManagerId ? [input.projectManagerId] : [])
    } else if (creating && actorRole === 'PROJECT_MANAGER') {
      requested.set('PROJECT_MANAGER', [actor.userId])
    }
    if (input.monitoringOfficerId !== undefined) {
      requested.set(
        'MONITORING_AND_EVALUATION_OFFICER',
        input.monitoringOfficerId ? [input.monitoringOfficerId] : [],
      )
    }
    if (input.projectOfficerIds !== undefined) {
      requested.set('PROJECT_OFFICER', input.projectOfficerIds)
    }
    if (requested.size === 0) return

    for (const [role, ids] of requested) {
      const normalized = [...new Set(ids.map((id) => id.toLowerCase()))]
      requested.set(role, normalized)
      const selfManagerSelection =
        actorRole === 'PROJECT_MANAGER' &&
        role === 'PROJECT_MANAGER' &&
        normalized.length === 1 &&
        normalized[0] === actor.userId.toLowerCase()
      if (!selfManagerSelection && !canAssignRole(actorRole, role as CanonicalRole)) {
        throw new ForbiddenException('Assignment authority is missing.')
      }
      if (actorRole === 'PROJECT_MANAGER' && role === 'PROJECT_MANAGER' && !selfManagerSelection) {
        throw new ForbiddenException(
          'A Project Manager cannot transfer their own project authority.',
        )
      }
    }

    const desiredIds = [...new Set([...requested.values()].flat())]
    const users = desiredIds.length
      ? await tx.systemUser.findMany({
          where: {
            id: { in: desiredIds },
            organizationId: actor.organizationId,
            accountStatus: 'ACTIVE',
            archivedAt: null,
            role: { code: { in: [...requested.keys()] }, isActive: true },
          },
          select: { id: true, role: { select: { code: true } } },
          take: 51,
        })
      : []
    const valid = new Set(
      users
        .filter((user) => requested.get(user.role.code as ProjectTeamRole)?.includes(user.id))
        .map((user) => user.id),
    )
    if (valid.size !== desiredIds.length) {
      throw new BadRequestException('One or more selected project team members are unavailable.')
    }

    const current = await tx.userProjectAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        status: 'ACTIVE',
        endedAt: null,
        user: { role: { code: { in: [...requested.keys()] } } },
      },
      select: { id: true, userId: true, user: { select: { role: { select: { code: true } } } } },
      take: 100,
    })
    const ending = current.filter(
      (assignment) =>
        !requested.get(assignment.user.role.code as ProjectTeamRole)?.includes(assignment.userId),
    )
    if (actorRole === 'PROJECT_MANAGER' && ending.some((row) => row.userId === actor.userId)) {
      throw new ForbiddenException('A Project Manager cannot remove their own project authority.')
    }
    if (ending.length) {
      const endingIds = ending.map((assignment) => assignment.id)
      const now = new Date()
      await tx.projectActivityAssignment.updateMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          projectAssignmentId: { in: endingIds },
          status: 'ACTIVE',
        },
        data: { status: 'REMOVED', endedAt: now, endReason: 'Project team updated.' },
      })
      await tx.userProjectAssignment.updateMany({
        where: { id: { in: endingIds }, organizationId: actor.organizationId, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: now, endReason: 'Project team updated.' },
      })
    }
    const existing = new Set(
      current.filter((assignment) => !ending.includes(assignment)).map((row) => row.userId),
    )
    const additions = desiredIds.filter((userId) => !existing.has(userId))
    if (additions.length) {
      await tx.userProjectAssignment.createMany({
        data: additions.map((userId) => ({
          organizationId: actor.organizationId,
          projectId,
          userId,
          assignedById: actor.userId,
        })),
      })
    }
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
      const budgets = await this.readProjectBudgets(
        tx,
        actor,
        rows.map((row) => row.id),
      )
      return rows.map((row) => mapProject(row, budgets.get(row.id) ?? null))
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
      const budgets = await this.readProjectBudgets(tx, actor, [row.id])
      return mapProject(row, budgets.get(row.id) ?? null)
    })
  }

  create(identity: ApplicationIdentity, input: CreateProjectDto) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (!['SYSTEM_ADMINISTRATOR', 'PROJECT_MANAGER'].includes(actor.roles[0])) {
        throw new ForbiddenException('Project creation is outside your authority.')
      }
      const id = randomUUID()
      const code = input.code ?? `PRJ-${id.toUpperCase()}`
      const data = projectData(input, code)
      if (data.targetGoal === undefined) {
        throw new BadRequestException('Project target goal is required.')
      }
      await this.requireProgram(tx, actor.organizationId, data.programId)
      const programManagerId = await this.requireProgramManager(
        tx,
        actor.organizationId,
        input.programManagerId,
      )
      const created = await tx.project.create({
        data: {
          id,
          ...data,
          ...(programManagerId === undefined ? {} : { programManagerId }),
          organizationId: actor.organizationId,
          createdById: actor.userId,
        },
        select: { id: true },
      })
      await this.replaceTeamAssignments(tx, actor, created.id, input, true)
      await this.saveProjectBudget(tx, actor, created.id, input.projectBudget, 'create')
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: created.id,
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: created.id,
          changes: {
            code,
            status: input.status,
            targetGoal: { old: null, new: normalizeTargetGoal(data.targetGoal.toString()) },
          },
        },
      })
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: created.id },
        select: projectSelection,
      })
      const budgets = await this.readProjectBudgets(tx, actor, [created.id])
      return mapProject(result, budgets.get(created.id) ?? null)
    })
  }

  update(identity: ApplicationIdentity, projectId: string, input: UpdateProjectDto) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const current = await tx.project.findFirst({
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: { id: true, code: true, targetGoal: true, updatedAt: true },
      })
      if (!current) throw new NotFoundException('Project unavailable.')
      const expected = new Date(input.expectedUpdatedAt)
      if (Number.isNaN(expected.valueOf()) || current.updatedAt.valueOf() !== expected.valueOf()) {
        throw new ConflictException('Project changed; reload before saving.')
      }
      const data = projectData(input, input.code ?? current.code)
      await this.requireProgram(tx, actor.organizationId, data.programId)
      const programManagerId = await this.requireProgramManager(
        tx,
        actor.organizationId,
        input.programManagerId,
      )
      const changed = await tx.project.updateMany({
        where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
        data: {
          ...data,
          ...(programManagerId === undefined ? {} : { programManagerId }),
        },
      })
      if (changed.count !== 1) throw new ConflictException('Project changed; reload before saving.')
      await this.replaceTeamAssignments(tx, actor, current.id, input, false)
      await this.saveProjectBudget(tx, actor, current.id, input.projectBudget, 'update')
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.id,
          action: 'PROJECT_UPDATED',
          entityType: 'Project',
          entityId: current.id,
          changes: {
            code: data.code,
            status: input.status,
            targetGoal: {
              old:
                current.targetGoal === null
                  ? null
                  : normalizeTargetGoal(current.targetGoal.toString()),
              new:
                data.targetGoal === undefined
                  ? current.targetGoal === null
                    ? null
                    : normalizeTargetGoal(current.targetGoal.toString())
                  : normalizeTargetGoal(data.targetGoal.toString()),
            },
          },
        },
      })
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: current.id },
        select: projectSelection,
      })
      const budgets = await this.readProjectBudgets(tx, actor, [current.id])
      return mapProject(result, budgets.get(current.id) ?? null)
    })
  }
}
