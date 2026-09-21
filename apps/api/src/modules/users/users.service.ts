import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import {
  type CanonicalRole,
  canAssignRole,
  canAuthorizeRole,
  isCanonicalRole,
  roleNames,
} from '@app/modules/auth/authorization-policy'
import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import { AuthDirectoryService } from './auth-directory.service'
import type { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'

const assignableRoles: readonly CanonicalRole[] = [
  'PROJECT_MANAGER',
  'MONITORING_AND_EVALUATION_OFFICER',
  'PROJECT_OFFICER',
]
const USER_MANAGEMENT_TRANSACTION_TIMEOUT_MS = 20_000

function uniqueProjectIds(projectIds: readonly string[]) {
  return [...new Set(projectIds.map((id) => id.toLowerCase()))]
}

function mapUser(user: {
  id: string
  authUserId: string | null
  fullName: string
  email: string
  accountStatus: string
  createdAt: Date
  lastLoginAt: Date | null
  role: { code: string; name: string }
  userProjectAssignment_user: Array<{ projectId: string; project: { title: string } }>
}) {
  return {
    id: user.id,
    authUserId: user.authUserId,
    name: user.fullName,
    email: user.email,
    role: user.role.name,
    roleCode: user.role.code,
    accountStatus: user.accountStatus,
    projectIds: user.userProjectAssignment_user.map((assignment) => assignment.projectId),
    projectAccess: user.userProjectAssignment_user.map((assignment) => assignment.project.title),
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastLoginAt?.toISOString(),
  }
}

function activeAssignmentScope(actor: ApplicationIdentity) {
  return {
    status: 'ACTIVE' as const,
    endedAt: null,
    project: projectScope(actor),
  }
}

function userSelection(actor: ApplicationIdentity) {
  return {
    id: true,
    authUserId: true,
    fullName: true,
    email: true,
    accountStatus: true,
    createdAt: true,
    lastLoginAt: true,
    role: { select: { code: true, name: true } },
    userProjectAssignment_user: {
      where: activeAssignmentScope(actor),
      select: { projectId: true, project: { select: { title: true } } },
      orderBy: { projectId: 'asc' as const },
    },
  } satisfies Prisma.SystemUserSelect
}

function manageableRoleCodes(actorRole: CanonicalRole) {
  return (Object.keys(roleNames) as CanonicalRole[]).filter((role) =>
    canAuthorizeRole(actorRole, role),
  )
}

function targetScope(actor: ApplicationIdentity) {
  return actor.roles[0] === 'SYSTEM_ADMINISTRATOR'
    ? {}
    : { userProjectAssignment_user: { some: activeAssignmentScope(actor) } }
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthDirectoryService) private readonly authDirectory: AuthDirectoryService,
  ) {}

  list(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'users.authorize', async (tx, actor) => {
      const actorRole = actor.roles[0]
      if (!isCanonicalRole(actorRole)) throw new ForbiddenException('Account authority is missing.')
      const rows = await tx.systemUser.findMany({
        where: {
          organizationId: actor.organizationId,
          archivedAt: null,
          role: { code: { in: manageableRoleCodes(actorRole) }, isActive: true },
          ...targetScope(actor),
        },
        select: userSelection(actor),
        orderBy: { id: 'asc' },
        take: 200,
      })
      return rows.map(mapUser)
    })
  }

  async authorizeExisting(identity: ApplicationIdentity, input: AuthorizeExistingUserDto) {
    const authIdentity = await this.authDirectory.getExistingVerifiedIdentity(
      input.authUserId.toLowerCase(),
    )
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'users.authorize',
      async (tx, actor) => {
        const actorRole = actor.roles[0]
        if (
          !isCanonicalRole(actorRole) ||
          !isCanonicalRole(input.role) ||
          !canAuthorizeRole(actorRole, input.role)
        ) {
          throw new ForbiddenException('Target role is outside your authority.')
        }
        const projectIds = await this.requireProjects(tx, actor, input.role, input.projectIds)
        const duplicate = await tx.systemUser.findFirst({
          where: {
            OR: [
              { authUserId: authIdentity.id },
              { email: { equals: authIdentity.email, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        })
        if (duplicate) throw new ConflictException('That identity is already authorized.')
        const role = await tx.role.findFirst({
          where: { code: input.role, isActive: true },
          select: { id: true },
        })
        if (!role) throw new BadRequestException('Target role is unavailable.')
        const authorizedAt = new Date()
        const created = await tx.systemUser.create({
          data: {
            organizationId: actor.organizationId,
            authUserId: authIdentity.id,
            email: authIdentity.email,
            fullName: input.fullName,
            roleId: role.id,
            accountStatus: 'ACTIVE',
            invitedAt: authorizedAt,
            activatedAt: authorizedAt,
          },
          select: { id: true },
        })
        if (projectIds.length) {
          await tx.userProjectAssignment.createMany({
            data: projectIds.map((projectId) => ({
              organizationId: actor.organizationId,
              projectId,
              userId: created.id,
              assignedById: actor.userId,
            })),
          })
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            action: 'USER_AUTHORIZED',
            entityType: 'SystemUser',
            entityId: created.id,
            changes: { role: input.role, projectCount: projectIds.length },
          },
        })
        const result = await tx.systemUser.findUniqueOrThrow({
          where: { id: created.id },
          select: userSelection(actor),
        })
        return mapUser(result)
      },
      { transactionTimeoutMs: USER_MANAGEMENT_TRANSACTION_TIMEOUT_MS },
    )
  }

  update(identity: ApplicationIdentity, userId: string, input: UpdateAuthorizedUserDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'users.authorize',
      async (tx, actor) => {
        if (!UUID_PATTERN.test(userId)) throw new NotFoundException('User unavailable.')
        if (userId.toLowerCase() === actor.userId.toLowerCase()) {
          throw new ForbiddenException('Self-administration is not allowed.')
        }
        const target = await tx.systemUser.findFirst({
          where: {
            id: userId.toLowerCase(),
            organizationId: actor.organizationId,
            archivedAt: null,
            ...targetScope(actor),
          },
          select: {
            id: true,
            role: { select: { code: true } },
            userProjectAssignment_user: {
              where: activeAssignmentScope(actor),
              select: { id: true, projectId: true },
            },
          },
        })

        if (!target || !isCanonicalRole(target.role.code) || !isCanonicalRole(input.role)) {
          throw new NotFoundException('User unavailable.')
        }

        const actorRole = actor.roles[0]
        if (
          !isCanonicalRole(actorRole) ||
          !canAuthorizeRole(actorRole, target.role.code) ||
          !canAuthorizeRole(actorRole, input.role)
        ) {
          throw new ForbiddenException('Target role is outside your authority.')
        }

        if (actorRole !== 'SYSTEM_ADMINISTRATOR') {
          const [allActiveAssignments, scopedActiveAssignments] = await Promise.all([
            tx.userProjectAssignment.count({
              where: {
                organizationId: actor.organizationId,
                userId: target.id,
                status: 'ACTIVE',
                endedAt: null,
              },
            }),
            tx.userProjectAssignment.count({
              where: {
                organizationId: actor.organizationId,
                userId: target.id,
                ...activeAssignmentScope(actor),
              },
            }),
          ])
          if (allActiveAssignments !== scopedActiveAssignments) {
            throw new ForbiddenException('Target account extends beyond your project authority.')
          }
        }

        const projectIds =
          input.accountStatus === 'ACTIVE'
            ? await this.requireProjects(tx, actor, input.role, input.projectIds)
            : []
        const desired = new Set(projectIds)
        const now = new Date()
        const ending = target.userProjectAssignment_user.filter(
          (item) => !desired.has(item.projectId),
        )
        if (ending.length) {
          const endingAssignmentIds = ending.map((item) => item.id)

          await tx.projectActivityAssignment.updateMany({
            where: {
              organizationId: actor.organizationId,
              projectAssignmentId: { in: endingAssignmentIds },
              status: 'ACTIVE',
            },
            data: {
              status: 'REMOVED',
              endedAt: now,
              endReason: 'Project assignment ended.',
            },
          })

          await tx.userProjectAssignment.updateMany({
            where: {
              id: { in: endingAssignmentIds },
              organizationId: actor.organizationId,
              status: 'ACTIVE',
            },
            data: {
              status: 'ENDED',
              endedAt: now,
              endReason: 'Account authorization updated',
            },
          })
        }

        const existing = new Set(target.userProjectAssignment_user.map((item) => item.projectId))
        const additions = projectIds.filter((projectId) => !existing.has(projectId))

        const role = await tx.role.findFirst({
          where: { code: input.role, isActive: true },
          select: { id: true },
        })
        if (!role) throw new BadRequestException('Target role is unavailable.')

        const updateProfile = () =>
          tx.systemUser.update({
            where: { id: target.id },
            data: {
              ...(input.fullName ? { fullName: input.fullName } : {}),
              roleId: role.id,
              accountStatus: input.accountStatus,
              activatedAt: input.accountStatus === 'ACTIVE' ? now : undefined,
              deactivatedAt: input.accountStatus === 'DEACTIVATED' ? now : null,
            },
          })

        // An ACTIVE project assignment is allowed only for an ACTIVE profile.
        // Reactivation must therefore restore the profile before recreating membership.
        if (input.accountStatus === 'ACTIVE') {
          await updateProfile()
        }

        if (additions.length) {
          await tx.userProjectAssignment.createMany({
            data: additions.map((projectId) => ({
              organizationId: actor.organizationId,
              projectId,
              userId: target.id,
              assignedById: actor.userId,
            })),
          })
        }

        // Deactivation is the inverse operation: child/activity and project
        // assignments must already be ended before the profile becomes inactive.
        if (input.accountStatus === 'DEACTIVATED') {
          await updateProfile()
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            action: 'USER_AUTHORIZATION_UPDATED',
            entityType: 'SystemUser',
            entityId: target.id,
            changes: {
              role: input.role,
              accountStatus: input.accountStatus,
              projectCount: projectIds.length,
              nameChanged: Boolean(input.fullName),
            },
          },
        })
        const result = await tx.systemUser.findUniqueOrThrow({
          where: { id: target.id },
          select: userSelection(actor),
        })
        return mapUser(result)
      },
      { transactionTimeoutMs: USER_MANAGEMENT_TRANSACTION_TIMEOUT_MS },
    )
  }

  private async requireProjects(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    targetRole: CanonicalRole,
    requestedProjectIds: readonly string[],
  ) {
    const projectIds = uniqueProjectIds(requestedProjectIds)
    if (!assignableRoles.includes(targetRole)) {
      if (projectIds.length)
        throw new BadRequestException('That role cannot receive project assignments.')
      return []
    }
    if (!canAssignRole(actor.roles[0] as CanonicalRole, targetRole)) {
      throw new ForbiddenException('Assignment authority is missing.')
    }
    if (!projectIds.length)
      throw new BadRequestException('At least one project assignment is required.')
    const projects = await tx.project.findMany({
      where: { AND: [projectScope(actor), { id: { in: projectIds } }] },
      select: { id: true },
      take: 101,
    })
    if (projects.length !== projectIds.length)
      throw new NotFoundException('One or more projects are unavailable.')
    return projectIds
  }
}
