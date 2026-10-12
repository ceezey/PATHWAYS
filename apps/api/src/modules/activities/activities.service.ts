import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  type ActivityContextItemResponse,
  type ActivityListItemResponse,
  type ActivityResponse,
  type AssignableOfficerResponse,
  businessCalendarDate,
  hasAtomicPermission,
} from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { activityCapabilities, assignableOfficerLimit } from './activities.helpers'
import {
  activityListSelection,
  activitySelection,
  mapActivityListItem,
  personalAssignmentCount,
} from './activities.mapper'
import { mapWithMetrics, readListMetrics } from './activity-metrics.service'

// Reads the activities of one project: list, detail, editor context and assignable officers.
@Injectable()
export class ActivitiesService {
  private readonly env = readApiEnv(process.env)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  context(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<ActivityContextItemResponse[]> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.context.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: {
              id: true,
              title: true,
              status: true,
              activityJourneyStageMapping_activity: {
                select: { stageId: true },
                orderBy: { sequenceOrder: 'asc' },
                take: 100,
              },
            },
            orderBy: [{ title: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
        return project.projectActivity_project.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          journeyStageId: row.activityJourneyStageMapping_activity[0]?.stageId ?? '',
        }))
      },
    )
  }

  /**
   * Supporting read for the activity editor (cr-pathways-project-rbac-ui-and-partners 3.3):
   * exactly the users `resolveAssignments` accepts, for a caller holding activities.create
   * or activities.update inside project scope. Only userId and displayName leave the
   * query, at most 50 rows; an inaccessible project is the uniform 404.
   */
  assignableOfficers(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<AssignableOfficerResponse[]> {
    const permission = hasAtomicPermission(
      identity.roles[0],
      identity.permissions,
      'activities.create',
    )
      ? 'activities.create'
      : 'activities.update'
    return withAuthorizedOperation(this.prisma, identity, permission, async (tx, actor) => {
      if (
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'activities.create') &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'activities.update')
      )
        throw new ForbiddenException('Required application permission is missing.')
      const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
      const rows = await tx.userProjectAssignment.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: project.id,
          status: 'ACTIVE',
          endedAt: null,
          user: {
            accountStatus: 'ACTIVE',
            archivedAt: null,
            role: { code: 'PROJECT_OFFICER', isActive: true },
          },
        },
        select: { user: { select: { id: true, fullName: true } } },
        orderBy: [{ user: { fullName: 'asc' } }, { userId: 'asc' }],
        take: assignableOfficerLimit,
      })
      return rows.map((row) => ({ userId: row.user.id, displayName: row.user.fullName }))
    })
  }

  /** Lean list projection; update history, proof, assignee emails and metrics are `get`-only. */
  list(identity: ApplicationIdentity, projectId: string): Promise<ActivityListItemResponse[]> {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: { ...activityListSelection, ...personalAssignmentCount(actor) },
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        },
      })
      if (!project) throw new NotFoundException('Project unavailable.')
      const today = businessCalendarDate(new Date(), this.env.BUSINESS_TIME_ZONE)
      const metrics = await readListMetrics(
        tx,
        actor,
        projectId.toLowerCase(),
        project.projectActivity_project.map((row) => row.id),
      )
      return project.projectActivity_project.map((row) => ({
        ...mapActivityListItem(row, today),
        indicatorCount: row.activityIndicatorLink_activity.length,
        beneficiariesTarget: row.targetBeneficiaries,
        beneficiariesReached: metrics.reached.get(row.id) ?? null,
        budgetUtilization: metrics.budgetUtilization.get(row.id) ?? null,
        capabilities: activityCapabilities(
          actor,
          row.status,
          row._count?.projectActivityAssignment_activity,
        ),
      }))
    })
  }

  get(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
  ): Promise<ActivityResponse> {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(activityId)) {
        throw new NotFoundException('Activity unavailable.')
      }
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: {
              id: activityId.toLowerCase(),
              organizationId: actor.organizationId,
              archivedAt: null,
            },
            select: { ...activitySelection, ...personalAssignmentCount(actor) },
            take: 1,
          },
        },
      })
      const activity = project?.projectActivity_project[0]
      if (!activity) throw new NotFoundException('Activity unavailable.')
      return mapWithMetrics(tx, actor, activity, this.env.BUSINESS_TIME_ZONE)
    })
  }
}
