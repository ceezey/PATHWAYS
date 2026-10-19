import { Inject, Injectable } from '@nestjs/common'
import {
  type AlertSeverity,
  type AtomicPermission,
  ROLE_OVERVIEW_CONTRACT_VERSION,
  type RoleOverview,
  alertSeverities,
  hasAtomicPermission,
  roleOverviewSchema,
} from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { currentBusinessDate } from '../../common/time/business-date'
import { PrismaService } from '../../prisma/prisma.service'
import { RulesHumanService } from '../rules/rules-human.service'
import {
  approvalQueue,
  escalationQueue,
  extensionQueue,
  myExtensions,
  proofQueue,
} from './role-overview-queues.service'
import { flaggedProof, myActivities, projects, submissions } from './role-overview-work.service'

/** Role dashboard sections; each runs only when the viewer holds its permission. */
@Injectable()
export class RoleOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RulesHumanService) private readonly rules: RulesHumanService,
  ) {}

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
    // One page of the read-only escalation queue, already ordered by latest escalation.
    const escalated = await this.rules.listEscalatedAlerts(actor, { limit: '100' })
    return {
      open: counted.length,
      capped: capped || escalated.nextCursor !== null,
      bySeverity,
      byProject: [...projects].map(([projectId, v]) => ({ projectId, ...v })).slice(0, 100),
      recent: sorted.slice(0, 5).map(row),
      budgetOpen: budget.length,
      budgetRecent: budget.slice(0, 5).map(row),
      escalatedOpen: escalated.items.length,
      escalated: escalated.items.slice(0, 5).map((a) => ({
        ...row(a as unknown as (typeof counted)[number]),
        escalatedAt: new Date(a.escalatedAt).toISOString(),
      })),
    }
  }

  async read(identity: ApplicationIdentity): Promise<RoleOverview> {
    const businessDate = currentBusinessDate()
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
          ? await submissions(tx, actor, monthStart, can('expenses.submit'))
          : null
        return {
          actor,
          projects: await projects(tx, actor, can('projects.detail.read')),
          myActivities: can('activities.read') ? await myActivities(tx, actor, today) : null,
          flaggedProof: submitter ? await flaggedProof(tx, actor) : null,
          recentSubmissions: own?.recent ?? null,
          submittedThisMonth: own?.month ?? null,
          proofQueue: can('evidence.review') ? await proofQueue(tx, actor) : null,
          approvalQueue: can('expenses.approve') ? await approvalQueue(tx, actor) : null,
          myExtensions: submitter ? await myExtensions(tx, actor) : null,
          extensionQueue:
            can('evidence.review') && actor.roles[0] === 'MONITORING_AND_EVALUATION_OFFICER'
              ? await extensionQueue(tx, actor, 'VERIFY')
              : can('activities.update') && actor.roles[0] === 'PROJECT_MANAGER'
                ? await extensionQueue(tx, actor, 'DECIDE')
                : null,
          escalationQueue:
            can('activities.update') && actor.roles[0] === 'PROJECT_MANAGER'
              ? await escalationQueue(tx, actor, 'PROJECT')
              : can('activities.escalations.read') && actor.roles[0] === 'PROGRAM_MANAGER'
                ? await escalationQueue(tx, actor, 'PROGRAM')
                : can('activities.escalations.read') && actor.roles[0] === 'GRANT_MANAGER'
                  ? await escalationQueue(tx, actor, 'WATCH')
                  : null,
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
