import 'reflect-metadata'

import { rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { roleOverviewSchema } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleOverviewService } from './role-overview.service'

vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const user = '30000000-0000-4000-8000-000000000001'

function actor(role: keyof typeof rolePermissions) {
  return {
    id: user,
    aal: 'aal2',
    userId: user,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [project],
  } as ApplicationIdentity
}

function setup() {
  const tx = {
    project: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: project,
          code: 'P-1',
          title: 'Project',
          status: 'ONGOING',
          program: { name: 'Prog' },
          userProjectAssignment_project: [{ user: { fullName: 'Pat Manager' } }],
        },
      ]),
    },
    projectActivity: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    activityUpdate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    budgetExpenseEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    dataImportBatch: { count: vi.fn().mockResolvedValue(2) },
    activityExtensionRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const rules = {
    listAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listEscalatedAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  }
  const service = new RoleOverviewService(
    {} as PrismaService,
    rules as unknown as RulesHumanService,
  )
  return { tx, rules, service }
}

describe('RoleOverviewService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes every query to the organization and the actor project scope', async () => {
    const { tx, service } = setup()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    for (const fn of [
      tx.activityUpdate.findMany,
      tx.activityUpdate.count,
      tx.dataImportBatch.count,
    ]) {
      expect(fn.mock.calls.length).toBeGreaterThan(0)
      for (const [arg] of fn.mock.calls) {
        expect(arg.where.organizationId).toBe(org)
        expect(arg.where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
      }
    }
  })

  it('returns null sections for permissions the viewer lacks', async () => {
    const { service } = setup()
    const result = await service.read(actor('GRANT_MANAGER'))
    expect(result.proofQueue).toBeNull()
    expect(result.approvalQueue).toBeNull()
    expect(result.flaggedProof).toBeNull()
    expect(roleOverviewSchema.parse(result)).toEqual(result)
  })

  it('limits officer activities to active assignments of the viewer', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_OFFICER'))
    const where = tx.projectActivity.findMany.mock.calls[0][0].where
    expect(where.projectActivityAssignment_activity).toEqual({
      some: { status: 'ACTIVE', projectAssignment: { userId: user, status: 'ACTIVE' } },
    })
  })

  it('does not mark an activity without a planned end date as overdue', async () => {
    const { tx, service } = setup()
    tx.projectActivity.findMany.mockResolvedValue([
      {
        id: project,
        projectId: project,
        code: 'A',
        title: 'T',
        status: 'IN_PROGRESS',
        plannedEndDate: null,
        progressPercent: 10,
        project: { title: 'P' },
      },
    ])
    tx.projectActivity.count.mockResolvedValue(1)
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.myActivities?.rows[0].overdue).toBe(false)
  })

  it('excludes own submissions from the review queues', async () => {
    const { tx, service } = setup()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    const queue = tx.activityUpdate.findMany.mock.calls.find(
      ([arg]) => arg.where.status === 'PENDING',
    )
    expect(queue?.[0].where.submittedById).toEqual({ not: user })
  })

  it('summarizes open alerts by severity and project, budget flagged by metric', async () => {
    const { rules, service } = setup()
    const a1 = '40000000-0000-4000-8000-000000000001'
    const a2 = '40000000-0000-4000-8000-000000000002'
    rules.listAlerts.mockImplementation(async (_i, q) =>
      q.status === 'NEW'
        ? {
            items: [
              {
                id: a1,
                projectId: project,
                title: 'Budget depletion',
                severity: 'CRITICAL',
                lifecycle: 'NEW',
                explanation: 'x',
                evidence: [{ metric: 'BUDGET_UTILIZATION_PERCENT' }],
                predefinedRecommendations: [{ title: 'Reallocate' }],
              },
              {
                id: a2,
                projectId: project,
                title: 'Low KPI',
                severity: 'HIGH',
                lifecycle: 'NEW',
                explanation: 'y',
                evidence: [{ metric: 'INDICATOR_PROGRESS_PERCENT' }],
                predefinedRecommendations: [],
              },
            ],
            nextCursor: null,
          }
        : { items: [], nextCursor: null },
    )
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(result.alerts?.open).toBe(2)
    expect(result.alerts?.bySeverity).toEqual({ CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 0 })
    expect(result.alerts?.byProject).toEqual([
      { projectId: project, open: 2, maxSeverity: 'CRITICAL' },
    ])
    expect(result.alerts?.budgetOpen).toBe(1)
    expect(result.alerts?.budgetRecent).toHaveLength(1)
    expect(result.alerts?.recent[0]).toMatchObject({
      severity: 'CRITICAL',
      budget: true,
      recommendation: 'Reallocate',
    })
  })

  it('reports capped when alert paging hits the page limit', async () => {
    const { rules, service } = setup()
    rules.listAlerts.mockResolvedValue({ items: [], nextCursor: 'more' })
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(result.alerts?.capped).toBe(true)
  })

  it('returns null alerts without alerts.read', async () => {
    const { rules, service } = setup()
    const base = actor('PROJECT_MANAGER')
    const viewer = { ...base, permissions: base.permissions.filter((p) => p !== 'alerts.read') }
    expect((await service.read(viewer)).alerts).toBeNull()
    expect(rules.listAlerts).not.toHaveBeenCalled()
  })

  it('keeps budget alert counts independent of the top-5 recent list', async () => {
    const { rules, service } = setup()
    const alert = (n: number, severity: string, metric: string) => ({
      id: `40000000-0000-4000-8000-00000000010${n}`,
      projectId: project,
      title: 't',
      severity,
      explanation: 'x',
      evidence: [{ metric }],
      predefinedRecommendations: [],
    })
    rules.listAlerts.mockImplementation(async (_i, q) => ({
      items:
        q.status === 'NEW'
          ? [
              ...[1, 2, 3, 4, 5].map((n) => alert(n, 'HIGH', 'INDICATOR_PROGRESS_PERCENT')),
              alert(6, 'LOW', 'BUDGET_UTILIZATION_PERCENT'),
            ]
          : [],
      nextCursor: null,
    }))
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(result.alerts?.recent.every((a) => !a.budget)).toBe(true)
    expect(result.alerts?.budgetOpen).toBe(1)
    expect(result.alerts?.budgetRecent).toHaveLength(1)
  })

  it('parses when an expense description exceeds the row text caps', async () => {
    const { tx, service } = setup()
    const long = 'x'.repeat(2000)
    const submittedAt = new Date('2026-10-02T00:00:00.000Z')
    tx.budgetExpenseEntry.findMany.mockResolvedValue([
      {
        id: project,
        projectId: project,
        description: long,
        amount: { toFixed: () => '1.00' },
        status: 'VERIFIED',
        submittedAt,
        verifiedAt: submittedAt,
        project: { title: 'P' },
        verifiedBy: null,
        budgetRecord: { activityId: null },
      },
    ])
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(result.recentSubmissions?.rows[0].label).toHaveLength(300)
    expect(result.approvalQueue?.rows[0].description).toHaveLength(300)
  })

  it('counts open overdue work only: completed and cancelled activities are excluded', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_OFFICER'))
    expect(tx.projectActivity.findMany.mock.calls[0][0].where.status).toEqual({
      notIn: ['COMPLETED', 'CANCELLED'],
    })
  })

  it('drops flagged proof once the same activity has a later update', async () => {
    const { tx, service } = setup()
    const activityId = '50000000-0000-4000-8000-000000000001'
    const rejected = {
      id: '60000000-0000-4000-8000-000000000001',
      activityId,
      projectId: project,
      reviewReason: 'blurry',
      reviewedAt: new Date('2026-10-02T00:00:00.000Z'),
      submittedAt: new Date('2026-10-01T00:00:00.000Z'),
      activity: { code: 'A', title: 'T' },
    }
    tx.activityUpdate.findMany.mockImplementation(async (arg) => {
      if (arg.where.status === 'REJECTED') return [rejected]
      if (arg.where.activityId)
        return [{ activityId, submittedAt: new Date('2026-10-03T00:00:00.000Z') }]
      return []
    })
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.flaggedProof).toEqual({ count: 0, rows: [] })
    const later = tx.activityUpdate.findMany.mock.calls.find(([a]) => a.where.activityId)?.[0]
    expect(later.where).toMatchObject({ organizationId: org, submittedById: user })
    expect(later.where.project).toMatchObject({ organizationId: org })
  })

  it('keeps a flagged proof with no later update', async () => {
    const { tx, service } = setup()
    tx.activityUpdate.findMany.mockImplementation(async (arg) =>
      arg.where.status === 'REJECTED'
        ? [
            {
              id: '60000000-0000-4000-8000-000000000001',
              activityId: '50000000-0000-4000-8000-000000000001',
              projectId: project,
              reviewReason: null,
              reviewedAt: new Date('2026-10-02T00:00:00.000Z'),
              submittedAt: new Date('2026-10-01T00:00:00.000Z'),
              activity: { code: 'A', title: 'T' },
            },
          ]
        : [],
    )
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.flaggedProof?.count).toBe(1)
  })

  it('omits expenses without expenses.submit', async () => {
    const { tx, service } = setup()
    const base = actor('PROJECT_OFFICER')
    const viewer = { ...base, permissions: base.permissions.filter((p) => p !== 'expenses.submit') }
    const result = await service.read(viewer)
    expect(tx.budgetExpenseEntry.findMany).not.toHaveBeenCalled()
    expect(result.submittedThisMonth?.expenses).toBe(0)
  })

  it('scopes project, activity, expense and flagged queries', async () => {
    const { tx, service } = setup()
    const check = (arg: { where: Record<string, unknown> }) => {
      expect(arg.where.organizationId).toBe(org)
    }
    for (const role of ['PROJECT_OFFICER', 'PROJECT_MANAGER'] as const) {
      vi.clearAllMocks()
      await service.read(actor(role))
      const [p] = tx.project.findMany.mock.calls[0]
      expect(p.where).toMatchObject({ organizationId: org, id: { in: [project] } })
      for (const fn of [
        tx.projectActivity.findMany,
        tx.projectActivity.count,
        tx.budgetExpenseEntry.findMany,
        tx.budgetExpenseEntry.count,
        tx.activityUpdate.findMany,
      ]) {
        for (const [arg] of fn.mock.calls) {
          check(arg)
          expect(arg.where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
        }
      }
    }
    expect(tx.budgetExpenseEntry.findMany.mock.calls.length).toBeGreaterThan(0)
  })

  it('fills the verify queue for M&E excluding own requests', async () => {
    const { tx, service } = setup()
    const result = await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    const where = tx.activityExtensionRequest.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ status: 'PENDING', requestedById: { not: user } })
    expect(where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
    expect(result.extensionQueue).toEqual({ count: 0, rows: [] })
    expect(result.myExtensions).toBeNull()
  })

  it('fills the decide queue for the Project Manager excluding requested or verified rows', async () => {
    const { tx, service } = setup()
    const at = new Date('2026-10-01T00:00:00.000Z')
    tx.activityExtensionRequest.findMany.mockImplementation(async ({ where }) =>
      where.status === 'VERIFIED'
        ? [
            {
              id: project,
              activityId: project,
              projectId: project,
              requestedEndDate: at,
              currentEndDate: null,
              reason: 'r'.repeat(3000),
              project: { title: 'P' },
              activity: { code: 'A-1', title: 'T' },
              requestedBy: { fullName: 'Officer' },
            },
          ]
        : [],
    )
    const result = await service.read(actor('PROJECT_MANAGER'))
    const call = tx.activityExtensionRequest.findMany.mock.calls.find(
      ([arg]) => arg.where.status === 'VERIFIED',
    )
    expect(call?.[0].where).toMatchObject({
      requestedById: { not: user },
      NOT: { verifiedById: user },
    })
    expect(result.extensionQueue?.rows[0]).toMatchObject({
      stage: 'DECIDE',
      requestedEndDate: '2026-10-01',
    })
    expect(result.extensionQueue?.rows[0].reason).toHaveLength(2000)
  })

  it('returns own extension requests with the returned note for officers', async () => {
    const { tx, service } = setup()
    tx.activityExtensionRequest.findMany.mockResolvedValue([
      {
        id: project,
        activityId: project,
        projectId: project,
        requestedEndDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'RETURNED',
        verificationNote: 'Attach the revised plan.',
        decisionNote: null,
        activity: { code: 'A-1', title: 'T' },
      },
    ])
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(tx.activityExtensionRequest.findMany.mock.calls[0][0].where.requestedById).toBe(user)
    expect(result.myExtensions?.rows[0].note).toBe('Attach the revised plan.')
    expect(result.extensionQueue).toBeNull()
  })

  it('maps escalated alerts with their escalation time and counts the page', async () => {
    const { rules, service } = setup()
    rules.listEscalatedAlerts.mockResolvedValue({
      items: [
        {
          id: project,
          projectId: project,
          title: 'Escalated',
          severity: 'HIGH',
          explanation: 'x',
          evidence: [{ metric: 'INDICATOR_PROGRESS_PERCENT' }],
          predefinedRecommendations: [],
          escalatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'more',
    })
    const result = await service.read(actor('PROGRAM_MANAGER'))
    expect(rules.listEscalatedAlerts.mock.calls[0][1]).toEqual({ limit: '100' })
    expect(result.alerts?.escalatedOpen).toBe(1)
    expect(result.alerts?.capped).toBe(true)
    expect(result.alerts?.escalated[0]).toMatchObject({ escalatedAt: '2026-10-02T00:00:00.000Z' })
    expect(result.extensionQueue).toBeNull()
  })
})
