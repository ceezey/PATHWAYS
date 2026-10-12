import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  type CreateProjectRequest,
  type UpdateProjectRequest,
  hasAtomicPermission,
  projectCodeBase,
  uniqueProjectCode,
} from '@pathways/shared'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { readProjectBudgets, saveProjectBudget } from './project-budget.service'
import { replaceTeamAssignments } from './project-team.service'
import { projectData } from './projects.helpers'
import { mapProject, projectSelection } from './projects.mapper'

@Injectable()
export class ProjectsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async requireProgram(tx: Tx, organizationId: string, programId: string | null) {
    if (!programId) return
    if (!UUID_PATTERN.test(programId)) throw new NotFoundException('Program unavailable.')
    const program = await tx.program.findFirst({
      where: { id: programId, organizationId, archivedAt: null },
      select: { id: true },
    })
    if (!program) throw new NotFoundException('Program unavailable.')
  }

  private async requireProgramManager(
    tx: Tx,
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

  list(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', async (tx, actor) => {
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'projects.detail.read')) {
        return tx.project.findMany({
          where: projectScope(actor),
          select: { id: true, code: true, title: true, status: true },
          orderBy: { id: 'asc' },
          take: 100,
        })
      }
      const rows = await tx.project.findMany({
        relationLoadStrategy: 'join',
        where: projectScope(actor),
        select: projectSelection,
        orderBy: { id: 'asc' },
        take: 100,
      })
      const budgets = await readProjectBudgets(
        tx,
        actor,
        rows.map((row) => row.id),
      )
      return rows.map((row) => mapProject(row, budgets.get(row.id) ?? null))
    })
  }

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'projects.detail.read',
      async (tx, actor) => {
        if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
        const row = await tx.project.findFirst({
          relationLoadStrategy: 'join',
          where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
          select: projectSelection,
        })
        if (!row) throw new NotFoundException('Project unavailable.')
        const budgets = await readProjectBudgets(tx, actor, [row.id])
        return mapProject(row, budgets.get(row.id) ?? null)
      },
    )
  }

  /** Readable code like CRL-NS-2026; org-wide codes are read only to avoid the unique index. */
  private async generateProjectCode(tx: Tx, organizationId: string, input: CreateProjectRequest) {
    const base = projectCodeBase({
      title: input.title,
      area: input.implementationArea,
      startDate: input.startDate,
    })
    const taken = await tx.project.findMany({
      where: { organizationId, code: { startsWith: base, mode: 'insensitive' } },
      select: { code: true },
      take: 1000,
    })
    return uniqueProjectCode(
      base,
      taken.map((row) => row.code),
    )
  }

  create(identity: ApplicationIdentity, input: CreateProjectRequest) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.create', async (tx, actor) => {
      if (actor.roles[0] !== 'PROJECT_MANAGER') {
        throw new ForbiddenException('Project creation is outside your authority.')
      }
      const id = randomUUID()
      const code = input.code ?? (await this.generateProjectCode(tx, actor.organizationId, input))
      const data = projectData(input, code)

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
      await replaceTeamAssignments(tx, actor, created.id, input, true)
      await saveProjectBudget(tx, actor, created.id, input.projectBudget, 'create')
      if (input.implementingPartnerNames !== undefined)
        await tx.$queryRaw`
        SELECT pathways.p10_replace_project_partners(${created.id}::uuid, ${input.implementingPartnerNames}::text[])::text`
      await writeAuditLog(tx, actor, {
        projectId: created.id,
        action: 'PROJECT_CREATED',
        entityType: 'Project',
        entityId: created.id,
        changes: {
          code,
          status: input.status,
        },
      })
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: created.id },
        select: projectSelection,
      })
      const budgets = await readProjectBudgets(tx, actor, [created.id])
      return mapProject(result, budgets.get(created.id) ?? null)
    })
  }

  update(identity: ApplicationIdentity, projectId: string, input: UpdateProjectRequest) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.update', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const source = await beginRuleSourceOperation(
        tx,
        'PROJECT_UPDATE',
        projectId,
        projectId,
        { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
        sourceMutationBody(input),
      )
      if (source.kind === 'REPLAY') return source.acknowledgement
      const current = await requireScopedProjectRow(tx, actor, projectId, {
        id: true,
        code: true,
        updatedAt: true,
      })
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
          updatedAt: new Date(source.generatedValues.timestamp),
          ...(programManagerId === undefined ? {} : { programManagerId }),
        },
      })
      if (changed.count !== 1) throw new ConflictException('Project changed; reload before saving.')
      await replaceTeamAssignments(tx, actor, current.id, input, false)
      await saveProjectBudget(tx, actor, current.id, input.projectBudget, 'update')
      if (input.implementingPartnerNames !== undefined)
        await tx.$queryRaw`
        SELECT pathways.p10_replace_project_partners(${current.id}::uuid, ${input.implementingPartnerNames}::text[])::text`
      await writeAuditLog(tx, actor, {
        projectId: current.id,
        action: 'PROJECT_UPDATED',
        entityType: 'Project',
        entityId: current.id,
        changes: {
          code: data.code,
          status: input.status,
        },
      })
      const sourceAcknowledgement = await finishRuleSourceOperation(
        tx,
        source.operationHandle,
        input.clientMutationId,
      )
      const result = await tx.project.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id: current.id },
        select: projectSelection,
      })
      const budgets = await readProjectBudgets(tx, actor, [current.id])
      return { ...mapProject(result, budgets.get(current.id) ?? null), sourceAcknowledgement }
    })
  }

  archive(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.archive', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      // Scope without the archived filter so a repeat call stays idempotent.
      const current = await tx.project.findFirst({
        where: {
          AND: [{ ...projectScope(actor), archivedAt: undefined }, { id: projectId.toLowerCase() }],
        },
        select: { id: true, archivedAt: true },
      })
      if (!current) throw new NotFoundException('Project unavailable.')
      if (current.archivedAt)
        return { id: current.id, archivedAt: current.archivedAt.toISOString() }
      const archivedAt = new Date()
      const changed = await tx.project.updateMany({
        where: { id: current.id, organizationId: actor.organizationId, archivedAt: null },
        data: { archivedAt },
      })
      if (changed.count !== 1)
        throw new ConflictException('Project changed; reload before archiving.')
      await writeAuditLog(tx, actor, {
        projectId: current.id,
        action: 'PROJECT_ARCHIVED',
        entityType: 'Project',
        entityId: current.id,
        changes: { archivedAt: archivedAt.toISOString() },
      })
      return { id: current.id, archivedAt: archivedAt.toISOString() }
    })
  }
}
