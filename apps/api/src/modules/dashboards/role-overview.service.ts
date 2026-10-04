import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type AlertSeverity,
  ROLE_OVERVIEW_CONTRACT_VERSION,
  type RoleOverview,
  alertSeverities,
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
      status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> },
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
    const candidates = await tx.activityUpdate.findMany({
      where,
      select: {
        id: true,
        activityId: true,
        projectId: true,
        reviewReason: true,
        reviewedAt: true,
        submittedAt: true,
        activity: { select: { code: true, title: true } },
      },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
      take: 50,
    })
    // A resubmission is a newer update on the same activity, which clears the flag.
    const later = candidates.length
      ? await tx.activityUpdate.findMany({
          where: {
            organizationId: actor.organizationId,
            project: projectScope(actor),
            submittedById: actor.userId,
            activityId: { in: candidates.map((u) => u.activityId) },
            submittedAt: {
              gt: new Date(Math.min(...candidates.map((u) => u.submittedAt.getTime()))),
            },
          },
          select: { activityId: true, submittedAt: true },
        })
      : []
    const open = candidates.filter(
      (u) => !later.some((l) => l.activityId === u.activityId && l.submittedAt > u.submittedAt),
    )
    return {
      count: open.length,
      rows: open.slice(0, rows).map((u) => ({
        updateId: u.id,
        activityId: u.activityId,
        projectId: u.projectId,
        activityCode: u.activity.code,
        activityTitle: u.activity.title.slice(0, 200),
        reviewReason: (u.reviewReason ?? '').slice(0, 1000),
        reviewedAt: (u.reviewedAt ?? new Date(0)).toISOString(),
      })),
    }
  }

  private async submissions(
    tx: Tx,
    actor: ApplicationIdentity,
    monthStart: Date,
    withExpenses: boolean,
  ) {
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
      withExpenses
        ? tx.budgetExpenseEntry.findMany({
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
          })
        : [],
      tx.activityUpdate.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
      withExpenses
        ? tx.budgetExpenseEntry.count({ where: { ...own, submittedAt: { gte: monthStart } } })
        : 0,
    ])
    const merged = [
      ...updates.map((u) => ({
        kind: 'UPDATE' as const,
        id: u.id,
        projectId: u.projectId,
        activityId: u.activityId,
        label: u.activity.title.slice(0, 300),
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
        label: e.description.slice(0, 300),
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
        description: e.description.slice(0, 300),
        amount: e.amount.toFixed(2),
        verifiedByName: e.verifiedBy?.fullName ?? null,
        verifiedAt: e.verifiedAt?.toISOString() ?? null,
      })),
    }
  }

  /** Alert lifecycle lives behind the rules read routines, which enforce project scope. */
  private async alerts(actor: ApplicationIdentity) {
    const counted: Array<{
      id: string
      projectId: string
      title: string
      severity: AlertSeverity
      explanation: string
      evidence: Array<{ metric: string }>
      predefinedRecommendations: Array<{ title: string }>
    }> = []
    let capped = false
    for (const status of ['NEW', 'REVIEWED'] as const) {
      let cursor: string | undefined
      for (let page = 0; ; page += 1) {
        if (page === 10) {
          capped = true
          break
        }
        const result = await this.rules.listAlerts(actor, {
          status,
          limit: '100',
          ...(cursor ? { cursor } : {}),
        })
        counted.push(...(result.items as unknown as typeof counted))
        if (!result.nextCursor) break
        cursor = result.nextCursor
      }
    }
    const rank = (s: AlertSeverity) => alertSeverities.indexOf(s)
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    const projects = new Map<string, { open: number; maxSeverity: AlertSeverity }>()
    for (const a of counted) {
      bySeverity[a.severity] += 1
      const p = projects.get(a.projectId)
      projects.set(a.projectId, {
        open: (p?.open ?? 0) + 1,
        maxSeverity: p && rank(p.maxSeverity) <= rank(a.severity) ? p.maxSeverity : a.severity,
      })
    }
    const isBudget = (a: (typeof counted)[number]) =>
      a.evidence.some((e) => e.metric === 'BUDGET_UTILIZATION_PERCENT')
    const sorted = [...counted].sort(
      (x, y) => rank(x.severity) - rank(y.severity) || x.id.localeCompare(y.id),
    )
    const row = (a: (typeof counted)[number]) => ({
      id: a.id,
      projectId: a.projectId,
      title: a.title.slice(0, 300),
      severity: a.severity,
      explanation: a.explanation.slice(0, 1000),
      recommendation: a.predefinedRecommendations[0]?.title.slice(0, 1000) ?? null,
      budget: isBudget(a),
    })
    const budget = sorted.filter(isBudget)
    return {
      open: counted.length,
      capped,
      bySeverity,
      byProject: [...projects].map(([projectId, v]) => ({ projectId, ...v })).slice(0, 100),
      recent: sorted.slice(0, 5).map(row),
      budgetOpen: budget.length,
      budgetRecent: budget.slice(0, 5).map(row),
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
        const own = submitter
          ? await this.submissions(tx, actor, monthStart, can('expenses.submit'))
          : null
        return {
          actor,
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
    const { actor, ...sections } = db
    const canAlerts = hasAtomicPermission(actor.roles[0], actor.permissions, 'alerts.read')
    return roleOverviewSchema.parse({
      contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
      businessDate,
      ...sections,
      alerts: canAlerts ? await this.alerts(actor) : null,
    })
  }
}
