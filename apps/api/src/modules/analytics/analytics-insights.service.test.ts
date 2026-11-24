import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import type { PrismaService } from '@app/prisma/prisma.service'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { hasAtomicPermission, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectEnvelopeWhere, readProjectBudget } from '../projects/project-budget.service'
import { AnalyticsInsightsController } from './analytics-insights.controller'
import { currentMeasurements, summarizeBudget } from './analytics-insights.helpers'
import { AnalyticsInsightsService } from './analytics-insights.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const orgA = '10000000-0000-4000-8000-00000000000a'
const projectA = '20000000-0000-4000-8000-00000000000a'
const projectB = '20000000-0000-4000-8000-00000000000b'
const userId = '30000000-0000-4000-8000-000000000001'
const act1 = '50000000-0000-4000-8000-000000000001'
const act2 = '50000000-0000-4000-8000-000000000002'

type Role = keyof typeof rolePermissions
const actor = (role: Role): ApplicationIdentity =>
  ({
    id: userId,
    aal: 'aal2',
    userId,
    organizationId: orgA,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [projectA],
  }) as ApplicationIdentity

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const cell = (count: number) => ({ count, suppressed: false })
// The jsonb p06_participation_breakdown returns, counts exact.
const participationFixture = {
  projectId: projectA,
  total: 17,
  totalSuppressed: false,
  byActivity: [
    { activityId: act2, activityName: 'Visit', ...cell(9) },
    { activityId: act1, activityName: 'Workshop', ...cell(8) },
  ],
  byMonth: [
    { month: '2026-01', ...cell(6) },
    { month: '2026-02', ...cell(11) },
  ],
  byAttendanceStatus: [
    { status: 'PRESENT', ...cell(15) },
    { status: 'ABSENT', ...cell(2) },
    { status: 'COMPLETED', ...cell(0) },
    { status: 'NOT_COMPLETED', ...cell(0) },
    { status: 'EXCUSED', ...cell(0) },
  ],
}

describe('currentMeasurements', () => {
  const row = (id: string, end: string, value: number, corrects: string | null = null, at = 1) => ({
    id,
    indicatorId: 'i1',
    periodStart: d('2026-01-01'),
    periodEnd: d(end),
    value,
    correctsMeasurementId: corrects,
    recordedAt: new Date(at),
  })

  it('drops superseded rows, keeps the chain tip and sorts by period end', () => {
    const points = currentMeasurements([
      row('c', '2026-06-30', 30, 'b', 3),
      row('a', '2026-03-31', 10, null, 1),
      row('b', '2026-06-30', 20, 'x', 2),
      row('x', '2026-06-30', 5, null, 0),
    ])
    expect(points.map((p) => [p.periodEnd, p.value])).toEqual([
      ['2026-03-31', 10],
      ['2026-06-30', 30],
    ])
  })
})

describe('summarizeBudget', () => {
  it('uses the envelope as planned, counts approved only and keeps awaiting approval apart', () => {
    expect(
      summarizeBudget({ currency: 'PHP', plannedBudget: 1000 }, [
        { currency: 'PHP', amount: 250.5, status: 'APPROVED' },
        { currency: 'PHP', amount: 100, status: 'PENDING' },
        { currency: 'PHP', amount: 40, status: 'VERIFIED' },
      ]),
    ).toEqual([
      { currency: 'PHP', planned: 1000, approved: 250.5, pending: 140, utilizationPercent: 25.1 },
    ])
  })

  it('reports planned null without an envelope', () => {
    expect(summarizeBudget(null, [{ currency: 'PHP', amount: 5, status: 'APPROVED' }])).toEqual([
      { currency: 'PHP', planned: null, approved: 5, pending: 0, utilizationPercent: null },
    ])
    expect(summarizeBudget(null, [])).toEqual([])
  })

  it('keeps an envelope row with no spending, nulls a zero envelope and splits currencies', () => {
    expect(summarizeBudget({ currency: 'PHP', plannedBudget: 1000 }, [])[0]).toMatchObject({
      approved: 0,
      utilizationPercent: 0,
    })
    expect(
      summarizeBudget({ currency: 'PHP', plannedBudget: 0 }, [])[0].utilizationPercent,
    ).toBeNull()
    const rows = summarizeBudget({ currency: 'PHP', plannedBudget: 100 }, [
      { currency: 'USD', amount: 10, status: 'APPROVED' },
    ])
    expect(rows.map((r) => [r.currency, r.planned])).toEqual([
      ['PHP', 100],
      ['USD', null],
    ])
  })
})

type ExpenseFixture = { amount: number; status: string; budgetRecord: { currency: string } }

// Both the analytics read and the Budget tab read draw from this one list, so they cannot drift apart in a test.
function expenseMocks(entries: ExpenseFixture[]) {
  return {
    findMany: vi.fn(async (_args: { where: Record<string, unknown> }) => entries),
    aggregate: vi.fn(async ({ where }: { where: { status?: string } }) => ({
      _sum: {
        amount: entries
          .filter((e) => e.status === where.status)
          .reduce((sum, e) => sum + e.amount, 0),
      },
    })),
  }
}

function harness(overrides: Record<string, unknown> = {}) {
  const tx = {
    project: {
      findFirst: vi.fn(async ({ where }) =>
        where.AND[1].id === projectA ? { id: projectA } : null,
      ),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async (..._args: unknown[]) => [{ data: participationFixture }]),
    projectIndicator: {
      findMany: vi.fn(async () => [
        {
          id: 'i1',
          name: 'Reach',
          unit: 'COUNT',
          unitLabel: null,
          targetValue: { toString: () => '100' },
        },
      ]),
    },
    projectIndicatorMeasurement: {
      findMany: vi.fn(async () => [
        {
          id: 'm1',
          indicatorId: 'i1',
          periodStart: d('2026-01-01'),
          periodEnd: d('2026-03-31'),
          value: 10,
          correctsMeasurementId: null,
          recordedAt: d('2026-04-01'),
        },
      ]),
    },
    projectBudgetRecord: {
      findFirst: vi.fn(async (_args: { where: Record<string, unknown> }) => ({
        currency: 'PHP',
        plannedBudget: 200,
      })),
    },
    budgetExpenseEntry: expenseMocks([
      { amount: 50, status: 'APPROVED', budgetRecord: { currency: 'PHP' } },
    ]),
    ...overrides,
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, permission, work) => {
    if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission))
      throw new ForbiddenException('Required application permission is missing.')
    return work(tx as never, identity)
  }) as typeof withAuthorizedOperation)
  return { tx, service: new AnalyticsInsightsService({} as PrismaService) }
}

describe('AnalyticsInsightsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gates every route with analytics.descriptive.read', () => {
    for (const m of ['participation', 'indicatorTrends', 'budget'] as const)
      expect(Reflect.getMetadata(PERMISSION_KEY, AnalyticsInsightsController.prototype[m])).toBe(
        'analytics.descriptive.read',
      )
  })

  it('participation: returns exact breakdowns and writes one audit row without data', async () => {
    const { service, tx } = harness()
    const r = await service.participation(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
    })
    expect(r.total).toBe(17)
    expect(r.byAttendanceStatus).toHaveLength(5)
    expect(r.byMonth).toEqual([
      { month: '2026-01', count: 6, suppressed: false },
      { month: '2026-02', count: 11, suppressed: false },
    ])
    expect(r.byActivity.find((a) => a.activityId === act1)?.count).toBe(8)
    const [sql, ...values] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    expect(sql.join('?')).toContain('pathways.p06_participation_breakdown(')
    expect(values).toEqual([projectA, null, null])
    expect(r.byAttendanceStatus.find((s) => s.status === 'ABSENT')).toEqual({
      status: 'ABSENT',
      count: 2,
      suppressed: false,
    })
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    const audit = (
      tx.auditLog.create.mock.calls as unknown as Array<
        [
          {
            data: { action: string; changes: unknown }
          },
        ]
      >
    )[0][0]
    expect(audit.data.action).toBe('ANALYTICS_DESCRIPTIVE_VIEWED')
    expect(audit.data.changes).toEqual({
      view: 'participation-breakdown',
      periodStart: null,
      periodEnd: null,
    })
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
    'participation: %s reads the aggregate for a period with no record-level grant',
    async (role) => {
      const { service, tx } = harness()
      expect(actor(role).permissions).not.toContain('beneficiaries.records.read')
      const r = await service.participation(actor(role), {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      })
      expect(r.byMonth.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
      expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([projectA, '2026-01-01', '2026-03-31'])
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    },
  )

  it('participation: forbids a caller without beneficiaries.aggregates.read before any query', async () => {
    const { service, tx } = harness()
    const pm = actor('PROGRAM_MANAGER')
    pm.permissions = pm.permissions.filter((p) => p !== 'beneficiaries.aggregates.read')
    await expect(service.participation(pm, { projectId: projectA })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('participation: maps a database refusal or an off-contract result to 503 with no audit row', async () => {
    for (const $queryRaw of [
      vi.fn(async () => {
        throw new Error('Participation breakdown unavailable')
      }),
      vi.fn(async () => [{ data: { ...participationFixture, total: -1 } }]),
    ]) {
      const { service, tx } = harness({ $queryRaw })
      await expect(
        service.participation(actor('PROGRAM_MANAGER'), { projectId: projectA }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    }
  })

  it('returns 404 for an out-of-scope project and writes no audit row', async () => {
    const { service, tx } = harness()
    const call = service.indicatorTrends(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectB,
    })
    await expect(call).rejects.toBeInstanceOf(NotFoundException)
    await expect(call).rejects.toThrow('Project unavailable.')
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each([
    ['indicatorTrends', 'GRANT_MANAGER'],
    ['budget', 'MONITORING_AND_EVALUATION_OFFICER'],
  ] as const)(
    '%s: answers 403, not 404, to %s asking for an out-of-scope project',
    async (view, role) => {
      const { service, tx } = harness()
      const call = service[view](actor(role), { projectId: projectB })
      await expect(call).rejects.toBeInstanceOf(ForbiddenException)
      await expect(call).rejects.toThrow('Required application permission is missing.')
      expect(tx.project.findFirst).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )

  it.each(['participation', 'indicatorTrends', 'budget'] as const)(
    '%s: answers 404 for an out-of-scope project before any data read or audit write',
    async (view) => {
      const { service, tx } = harness()
      const call = service[view](actor('PROJECT_MANAGER'), { projectId: projectB })
      await expect(call).rejects.toBeInstanceOf(NotFoundException)
      await expect(call).rejects.toThrow('Project unavailable.')
      expect(tx.project.findFirst).toHaveBeenCalled()
      expect(tx.$queryRaw).not.toHaveBeenCalled()
      for (const model of [
        tx.projectIndicator,
        tx.projectIndicatorMeasurement,
        tx.projectBudgetRecord,
        tx.budgetExpenseEntry,
      ])
        for (const read of Object.values(model)) expect(read).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )

  it('looks the project up once by its lowercase id, selecting only the id', async () => {
    const { service, tx } = harness()
    await service.participation(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA.toUpperCase(),
    })
    expect(tx.project.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [expect.anything(), { id: projectA }] },
      select: { id: true },
    })
  })

  it('indicator trends: converts decimals and applies the period filter', async () => {
    const { service, tx } = harness()
    const r = await service.indicatorTrends(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    })
    expect(r.indicators[0]).toMatchObject({
      indicatorId: 'i1',
      unit: 'COUNT',
      target: 100,
      points: [{ periodEnd: '2026-03-31', value: 10 }],
    })
    const where = (
      tx.projectIndicatorMeasurement.findMany.mock.calls as unknown as Array<
        [
          {
            where: { periodEnd: unknown }
          },
        ]
      >
    )[0][0].where
    expect(where.periodEnd).toEqual({ gte: d('2026-01-01'), lte: d('2026-06-30') })
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('budget: planned is the project envelope, never envelope plus allocations', async () => {
    const { service, tx } = harness()
    const r = await service.budget(actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(tx.projectBudgetRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: projectEnvelopeWhere(orgA, projectA) }),
    )
    expect(r.currencies).toEqual([
      { currency: 'PHP', planned: 200, approved: 50, pending: 0, utilizationPercent: 25 },
    ])
  })

  it('budget: counts spending over the whole project and ignores the period', async () => {
    const { service, tx } = harness()
    await service.budget(actor('PROJECT_MANAGER'), {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    })
    expect(tx.budgetExpenseEntry.findMany.mock.calls[0][0].where).toEqual({
      organizationId: orgA,
      projectId: projectA,
      status: { in: ['PENDING', 'VERIFIED', 'APPROVED'] },
    })
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    const [[audit]] = tx.auditLog.create.mock.calls as unknown as [[{ data: { changes: unknown } }]]
    expect(JSON.stringify(audit.data.changes)).toContain('2026-01-01')
  })

  it('budget: reports planned null when the project has no total budget', async () => {
    const { service } = harness({ projectBudgetRecord: { findFirst: vi.fn(async () => null) } })
    const r = await service.budget(actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(r.currencies).toEqual([
      { currency: 'PHP', planned: null, approved: 50, pending: 0, utilizationPercent: null },
    ])
  })

  it('budget: planned and approved match the Budget tab (readProjectBudget)', async () => {
    const { service, tx } = harness({
      budgetExpenseEntry: expenseMocks([
        { amount: 30, status: 'APPROVED', budgetRecord: { currency: 'PHP' } },
        { amount: 20.5, status: 'APPROVED', budgetRecord: { currency: 'PHP' } },
        { amount: 15, status: 'PENDING', budgetRecord: { currency: 'PHP' } },
      ]),
    })
    const [row] = (await service.budget(actor('PROJECT_MANAGER'), { projectId: projectA }))
      .currencies
    const tab = await readProjectBudget(tx as never, orgA, projectA)
    expect(row.planned).toBe(Number(tab.approvedBudget))
    expect(row.approved).toBe(Number(tab.countableSpending))
    expect(row.pending).toBe(15)
    const [a, b] = tx.projectBudgetRecord.findFirst.mock.calls.map((c) => c[0].where)
    expect(a).toEqual(b)
  })

  it('maps a database fault to 503 and writes no audit row', async () => {
    const { service, tx } = harness({
      projectBudgetRecord: {
        findFirst: vi.fn(async () => {
          throw new Error('db down')
        }),
      },
    })
    await expect(
      service.budget(actor('PROJECT_MANAGER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each([
    { periodStart: '2026-01-01' },
    { periodStart: '2026-02-01', periodEnd: '2026-01-01' },
    { periodEnd: '2026-01-31' },
    { unexpected: 'x' },
  ])('rejects %j with 400 before any query or audit write', async (extra) => {
    const { service, tx } = harness()
    await expect(
      service.budget(actor('PROJECT_MANAGER'), { projectId: projectA, ...extra }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
