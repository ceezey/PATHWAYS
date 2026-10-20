import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleOverviewService } from './role-overview.service'

vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const user = '30000000-0000-4000-8000-000000000001'
const activityA = '50000000-0000-4000-8000-000000000001'
const activityB = '50000000-0000-4000-8000-000000000002'

// 04:00 on 2026-05-15 in Manila, so the business date differs from the UTC date.
const now = new Date('2026-05-14T20:00:00.000Z')
const today = new Date('2026-05-15T00:00:00.000Z')
const monthStart = new Date('2026-05-01T00:00:00.000Z')

function actor(role: keyof typeof rolePermissions, without?: string) {
  return {
    id: user,
    aal: 'aal2',
    userId: user,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]].filter((p) => p !== without),
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
    activityEscalation: {
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
  return { tx, service }
}

const args = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.map(([arg]) => arg)

const scope = { organizationId: org, archivedAt: null, id: { in: [project] } }
const base = { organizationId: org, project: scope }
const own = { ...base, submittedById: user }
const byId = { id: 'asc' }
const open = { notIn: ['COMPLETED', 'CANCELLED'] }

const projectSelect = {
  id: true,
  code: true,
  title: true,
  status: true,
  program: { select: { name: true } },
  userProjectAssignment_project: {
    where: { status: 'ACTIVE', endedAt: null, user: { role: { code: 'PROJECT_MANAGER' } } },
    select: { user: { select: { fullName: true } } },
    orderBy: { id: 'asc' },
    take: 1,
  },
}
const activitySelect = {
  id: true,
  projectId: true,
  code: true,
  title: true,
  status: true,
  plannedEndDate: true,
  progressPercent: true,
  project: { select: { title: true } },
}
const myActivitiesWhere = {
  organizationId: org,
  archivedAt: null,
  project: scope,
  status: open,
  projectActivityAssignment_activity: {
    some: { status: 'ACTIVE', projectAssignment: { userId: user, status: 'ACTIVE' } },
  },
}
const flaggedWhere = { ...own, status: 'REJECTED', activity: { status: open } }
const flaggedSelect = {
  id: true,
  activityId: true,
  projectId: true,
  reviewReason: true,
  reviewedAt: true,
  submittedAt: true,
  activity: { select: { code: true, title: true } },
}
const updateSelect = {
  id: true,
  projectId: true,
  activityId: true,
  progressPercent: true,
  status: true,
  submittedAt: true,
  activity: { select: { title: true } },
}
const expenseSelect = {
  id: true,
  projectId: true,
  description: true,
  amount: true,
  status: true,
  submittedAt: true,
  budgetRecord: { select: { activityId: true } },
}
const proofWhere = {
  ...base,
  status: 'PENDING',
  submittedById: { not: user },
  evidenceMedia_update: { some: {}, none: { storageReady: false } },
}
const proofSelect = {
  id: true,
  activityId: true,
  projectId: true,
  progressPercent: true,
  submittedAt: true,
  project: { select: { title: true } },
  activity: { select: { code: true, title: true } },
  submittedBy: { select: { fullName: true } },
}
const approvalWhere = {
  ...base,
  status: 'VERIFIED',
  submittedById: { not: user },
  NOT: { verifiedById: user },
}
const approvalSelect = {
  id: true,
  projectId: true,
  description: true,
  amount: true,
  verifiedAt: true,
  project: { select: { title: true } },
  verifiedBy: { select: { fullName: true } },
  budgetRecord: { select: { activityId: true } },
}
const myExtensionsWhere = { ...base, requestedById: user }
const myExtensionsSelect = {
  id: true,
  activityId: true,
  projectId: true,
  requestedEndDate: true,
  status: true,
  verificationNote: true,
  decisionNote: true,
  activity: { select: { code: true, title: true } },
}
const queueSelect = {
  id: true,
  activityId: true,
  projectId: true,
  requestedEndDate: true,
  currentEndDate: true,
  reason: true,
  project: { select: { title: true } },
  activity: { select: { code: true, title: true } },
  requestedBy: { select: { fullName: true } },
}
const verifyWhere = { ...base, requestedById: { not: user }, status: 'PENDING' }
const decideWhere = {
  ...base,
  requestedById: { not: user },
  status: 'VERIFIED',
  NOT: { verifiedById: user },
}
const importWhere = {
  organizationId: org,
  project: scope,
  status: { in: ['PROCESSED', 'PARTIALLY_PROCESSED'] },
  processedAt: { gte: monthStart },
}

// The two rejected updates were submitted on different days, so the later query uses the earlier one.
const rejected = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    activityId: activityA,
    projectId: project,
    reviewReason: 'blurry',
    reviewedAt: new Date('2026-05-12T00:00:00.000Z'),
    submittedAt: new Date('2026-05-11T00:00:00.000Z'),
    activity: { code: 'A', title: 'T' },
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    activityId: activityB,
    projectId: project,
    reviewReason: 'dark',
    reviewedAt: new Date('2026-05-10T00:00:00.000Z'),
    submittedAt: new Date('2026-05-09T00:00:00.000Z'),
    activity: { code: 'B', title: 'U' },
  },
]

describe('RoleOverviewService filters, selects and month window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now })
  })
  afterEach(() => vi.useRealTimers())

  it('sends the exact project reader call for every role', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_OFFICER'))
    expect(args(tx.project.findMany)).toEqual([
      { where: scope, select: projectSelect, orderBy: [{ title: 'asc' }, byId], take: 20 },
    ])
  })

  it('sends the exact officer reads with the own-row filters and month window', async () => {
    const { tx, service } = setup()
    tx.activityUpdate.findMany.mockImplementation(async (arg) =>
      arg.where.status === 'REJECTED' ? rejected : [],
    )
    await service.read(actor('PROJECT_OFFICER'))
    expect(args(tx.projectActivity.count)).toEqual([{ where: myActivitiesWhere }])
    expect(args(tx.projectActivity.findMany)).toEqual([
      {
        where: myActivitiesWhere,
        select: activitySelect,
        orderBy: [{ plannedEndDate: 'asc' }, byId],
        take: 5,
      },
    ])
    expect(args(tx.activityUpdate.findMany)).toEqual([
      {
        where: own,
        select: updateSelect,
        orderBy: [{ submittedAt: 'desc' }, byId],
        take: 5,
      },
      {
        where: flaggedWhere,
        select: flaggedSelect,
        orderBy: [{ reviewedAt: 'desc' }, byId],
        take: 50,
      },
      {
        where: {
          organizationId: org,
          project: scope,
          submittedById: user,
          activityId: { in: [activityA, activityB] },
          submittedAt: { gt: new Date('2026-05-09T00:00:00.000Z') },
        },
        select: { activityId: true, submittedAt: true },
      },
    ])
    expect(args(tx.activityUpdate.count)).toEqual([
      { where: { ...own, submittedAt: { gte: monthStart } } },
    ])
    expect(args(tx.budgetExpenseEntry.findMany)).toEqual([
      {
        where: own,
        select: expenseSelect,
        orderBy: [{ submittedAt: 'desc' }, byId],
        take: 5,
      },
    ])
    expect(args(tx.budgetExpenseEntry.count)).toEqual([
      { where: { ...own, submittedAt: { gte: monthStart } } },
    ])
    expect(args(tx.activityExtensionRequest.count)).toEqual([{ where: myExtensionsWhere }])
    expect(args(tx.activityExtensionRequest.findMany)).toEqual([
      {
        where: myExtensionsWhere,
        select: myExtensionsSelect,
        orderBy: [{ requestedAt: 'desc' }, byId],
        take: 5,
      },
    ])
    expect(args(tx.dataImportBatch.count)).toEqual([{ where: importWhere }])
  })

  it('sends the exact M&E queue reads with the self-exclusion filters', async () => {
    const { tx, service } = setup()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    expect(args(tx.activityUpdate.count)).toEqual([{ where: proofWhere }])
    expect(args(tx.activityUpdate.findMany)).toEqual([
      {
        where: proofWhere,
        select: proofSelect,
        orderBy: [{ submittedAt: 'asc' }, byId],
        take: 5,
      },
    ])
    expect(args(tx.activityExtensionRequest.count)).toEqual([{ where: verifyWhere }])
    expect(args(tx.activityExtensionRequest.findMany)).toEqual([
      {
        where: verifyWhere,
        select: queueSelect,
        orderBy: [{ requestedAt: 'asc' }, byId],
        take: 5,
      },
    ])
    expect(args(tx.dataImportBatch.count)).toEqual([{ where: importWhere }])
  })

  it('sends the exact manager approval and decision reads with the four-eyes filters', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_MANAGER'))
    expect(args(tx.budgetExpenseEntry.count)).toEqual([
      { where: { ...own, submittedAt: { gte: monthStart } } },
      { where: approvalWhere },
    ])
    expect(args(tx.budgetExpenseEntry.findMany)[1]).toEqual({
      where: approvalWhere,
      select: approvalSelect,
      orderBy: [{ verifiedAt: 'asc' }, byId],
      take: 5,
    })
    expect(args(tx.activityExtensionRequest.count)).toEqual([
      { where: myExtensionsWhere },
      { where: decideWhere },
    ])
    expect(args(tx.activityExtensionRequest.findMany)[1]).toEqual({
      where: decideWhere,
      select: queueSelect,
      orderBy: [{ requestedAt: 'asc' }, byId],
      take: 5,
    })
  })

  it('shapes the project row by the detail permission', async () => {
    const { service } = setup()
    const full = await service.read(actor('PROJECT_OFFICER'))
    expect(full.projects[0]).toMatchObject({ programName: 'Prog', managerName: 'Pat Manager' })
    const lean = await service.read(actor('PROJECT_OFFICER', 'projects.detail.read'))
    expect(lean.projects[0]).toMatchObject({ programName: null, managerName: null })
  })

  it('marks overdue against the business date of the fixed clock', async () => {
    const { tx, service } = setup()
    const row = (id: string, plannedEndDate: Date) => ({
      id,
      projectId: project,
      code: 'A',
      title: 'T',
      status: 'IN_PROGRESS',
      plannedEndDate,
      progressPercent: 10,
      project: { title: 'P' },
    })
    tx.projectActivity.findMany.mockResolvedValue([
      row(activityA, new Date('2026-05-14T00:00:00.000Z')),
      row(activityB, today),
    ])
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.businessDate).toBe('2026-05-15')
    expect(result.myActivities?.rows.map((r) => r.overdue)).toEqual([true, false])
  })

  it('skips the import count when the viewer lacks imports.read', async () => {
    const { tx, service } = setup()
    const result = await service.read(actor('PROJECT_OFFICER', 'imports.read'))
    expect(tx.dataImportBatch.count).not.toHaveBeenCalled()
    expect(result.datasetsImportedThisMonth).toBeNull()
    expect(result.myActivities).not.toBeNull()
  })

  it('skips the activity readers when the viewer lacks activities.read', async () => {
    const { tx, service } = setup()
    const result = await service.read(actor('PROJECT_OFFICER', 'activities.read'))
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.count).not.toHaveBeenCalled()
    expect(result.myActivities).toBeNull()
    expect(result.datasetsImportedThisMonth).toBe(2)
  })

  it('returns null imports for a role without imports.read', async () => {
    const { tx, service } = setup()
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(tx.dataImportBatch.count).not.toHaveBeenCalled()
    expect(result.datasetsImportedThisMonth).toBeNull()
  })
})
