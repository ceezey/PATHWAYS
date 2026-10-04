import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  ROLE_OVERVIEW_CONTRACT_VERSION,
  type RoleOverview,
  businessCalendarDate,
  roleOverviewSchema,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { RulesHumanService } from '../rules/rules-human.service'

type Tx = Prisma.TransactionClient
const rows = 5
const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

/** Role dashboard sections; each runs only when the viewer holds its permission. */
@Injectable()
export class RoleOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RulesHumanService) private readonly rules: RulesHumanService,
  ) {}

  private businessDate() {
    try {
      return businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
  }

  private async projects(tx: Tx, actor: ApplicationIdentity, detail: boolean) {
    const found = await tx.project.findMany({
      where: projectScope(actor),
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        program: { select: { name: true } },
        userProjectAssignment_project: {
          // Same active PROJECT_MANAGER assignment shape as the projects service.
          where: { status: 'ACTIVE', endedAt: null, user: { role: { code: 'PROJECT_MANAGER' } } },
          select: { user: { select: { fullName: true } } },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 20,
    })
    return found.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      status: p.status,
      programName: detail ? (p.program?.name ?? null) : null,
      managerName: detail ? (p.userProjectAssignment_project[0]?.user.fullName ?? null) : null,
    }))
  }

  private async myActivities(tx: Tx, actor: ApplicationIdentity, today: Date) {
    const where = {
      organizationId: actor.organizationId,
      archivedAt: null,
      project: projectScope(actor),
      status: { not: 'CANCELLED' as const },
      projectActivityAssignment_activity: {
        some: {
          status: 'ACTIVE' as const,
          projectAssignment: { userId: actor.userId, status: 'ACTIVE' as const },
        },
      },
    }
    const [count, found] = await Promise.all([
      tx.projectActivity.count({ where }),
      tx.projectActivity.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          code: true,
          title: true,
          status: true,
          plannedEndDate: true,
          progressPercent: true,
          project: { select: { title: true } },
        },
        orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        projectTitle: a.project.title,
        code: a.code,
        title: a.title,
        status: a.status,
        // Same overdue rule as action counts: planned end before today and not closed.
        overdue: Boolean(a.plannedEndDate && a.plannedEndDate < today && a.status !== 'COMPLETED'),
        plannedEndDate: day(a.plannedEndDate),
        progress: a.progressPercent,
      })),
    }
  }

  private async flaggedProof(tx: Tx, actor: ApplicationIdentity) {
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      submittedById: actor.userId,
      status: 'REJECTED' as const,
      activity: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> },
      },
    }
    const [count, found] = await Promise.all([
      tx.activityUpdate.count({ where }),
      tx.activityUpdate.findMany({
        where,
        select: {
          id: true,
          activityId: true,
          projectId: true,
          reviewReason: true,
          reviewedAt: true,
          activity: { select: { code: true, title: true } },
        },
        orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((u) => ({
        updateId: u.id,
        activityId: u.activityId,
        projectId: u.projectId,
        activityCode: u.activity.code,
        activityTitle: u.activity.title,
        reviewReason: u.reviewReason ?? '',
        reviewedAt: (u.reviewedAt ?? new Date(0)).toISOString(),
      })),
    }
  }

  private async submissions(tx: Tx, actor: ApplicationIdentity, monthStart: Date) {
    const own = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      submittedById: actor.userId,
    }
    const [updates, expenses, updateCount, expenseCount] = await Promise.all([
      tx.activityUpdate.findMany({
        where: own,
        select: {
          id: true,
          projectId: true,
          activityId: true,
          progressPercent: true,
          status: true,
          submittedAt: true,
          activity: { select: { title: true } },
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
      tx.budgetExpenseEntry.findMany({
        where: own,
        select: {
          id: true,
          projectId: true,
          description: true,
          amount: true,
          status: true,
          submittedAt: true,
          budgetRecord: { select: { activityId: true } },
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
      tx.activityUpdate.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
      tx.budgetExpenseEntry.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
    ])
    const merged = [
      ...updates.map((u) => ({
        kind: 'UPDATE' as const,
        id: u.id,
        projectId: u.projectId,
        activityId: u.activityId,
        label: u.activity.title,
        amount: null,
        progress: u.progressPercent,
        status: u.status,
        submittedAt: u.submittedAt.toISOString(),
      })),
      ...expenses.map((e) => ({
        kind: 'EXPENSE' as const,
        id: e.id,
        projectId: e.projectId,
        activityId: e.budgetRecord.activityId ?? null,
        label: e.description,
        amount: e.amount.toFixed(2),
        progress: null,
        status: e.status,
        submittedAt: e.submittedAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, rows)
    return {
      recent: { count: merged.length, rows: merged },
      month: { updates: updateCount, expenses: expenseCount },
    }
  }

  private async proofQueue(tx: Tx, actor: ApplicationIdentity) {
    // Matches the review queue and refuses self-review like the review endpoint.
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      status: 'PENDING' as const,
      submittedById: { not: actor.userId },
      evidenceMedia_update: { some: {}, none: { storageReady: false } },
    }
    const [count, found] = await Promise.all([
      tx.activityUpdate.count({ where }),
      tx.activityUpdate.findMany({
        where,
        select: {
          id: true,
          activityId: true,
          projectId: true,
          progressPercent: true,
          submittedAt: true,
          project: { select: { title: true } },
          activity: { select: { code: true, title: true } },
          submittedBy: { select: { fullName: true } },
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((u) => ({
        updateId: u.id,
        activityId: u.activityId,
        projectId: u.projectId,
        projectTitle: u.project.title,
        activityCode: u.activity.code,
        activityTitle: u.activity.title,
        submitterName: u.submittedBy.fullName,
        submittedAt: u.submittedAt.toISOString(),
        progress: u.progressPercent,
      })),
    }
  }

  private async approvalQueue(tx: Tx, actor: ApplicationIdentity) {
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      status: 'VERIFIED' as const,
      submittedById: { not: actor.userId },
      NOT: { verifiedById: actor.userId },
    }
    const [count, found] = await Promise.all([
      tx.budgetExpenseEntry.count({ where }),
      tx.budgetExpenseEntry.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          description: true,
          amount: true,
          verifiedAt: true,
          project: { select: { title: true } },
          verifiedBy: { select: { fullName: true } },
          budgetRecord: { select: { activityId: true } },
        },
        orderBy: [{ verifiedAt: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((e) => ({
        expenseId: e.id,
        activityId: e.budgetRecord.activityId ?? null,
        projectId: e.projectId,
        projectTitle: e.project.title,
        description: e.description,
        amount: e.amount.toFixed(2),
        verifiedByName: e.verifiedBy?.fullName ?? null,
        verifiedAt: e.verifiedAt?.toISOString() ?? null,
      })),
    }
  }

  async read(identity: ApplicationIdentity): Promise<RoleOverview> {
    const businessDate = this.businessDate()
    const today = new Date(`${businessDate}T00:00:00.000Z`)
    const monthStart = new Date(`${businessDate.slice(0, 8)}01T00:00:00.000Z`)
    const db = await withAuthorizedOperation(
      this.prisma,
      identity,
      'projects.read',
      async (tx, actor) => {
        const can = (p: AtomicPermission) =>
          hasAtomicPermission(actor.roles[0], actor.permissions, p)
        const submitter = can('activities.proof.submit')
        const own = submitter ? await this.submissions(tx, actor, monthStart) : null
        return {
          projects: await this.projects(tx, actor, can('projects.detail.read')),
          myActivities: can('activities.read') ? await this.myActivities(tx, actor, today) : null,
          flaggedProof: submitter ? await this.flaggedProof(tx, actor) : null,
          recentSubmissions: own?.recent ?? null,
          submittedThisMonth: own?.month ?? null,
          proofQueue: can('evidence.review') ? await this.proofQueue(tx, actor) : null,
          approvalQueue: can('expenses.approve') ? await this.approvalQueue(tx, actor) : null,
          datasetsImportedThisMonth: can('imports.read')
            ? await tx.dataImportBatch.count({
                where: {
                  organizationId: actor.organizationId,
                  project: projectScope(actor),
                  status: { in: ['PROCESSED', 'PARTIALLY_PROCESSED'] },
                  processedAt: { gte: monthStart },
                },
              })
            : null,
        }
      },
    )
    return roleOverviewSchema.parse({
      contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
      businessDate,
      ...db,
      alerts: null,
    })
  }
}
