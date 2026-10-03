import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsInsightsController } from './analytics-insights.controller'
import { AnalyticsInsightsService } from './analytics-insights.service'
import { currentMeasurements, summarizeBudget, suppressBreakdown } from './insights-math'

vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

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
const counts = (items: Array<{ count: number | null }>) => items.map((i) => i.count)

describe('suppressBreakdown', () => {
  it('shows zero and counts of 5 or more, hides 1-4 with a second cell for complementary cover', () => {
    const r = suppressBreakdown(18, [{ count: 3 }, { count: 7 }, { count: 8 }, { count: 0 }])
    expect(r.total).toBe(18)
    expect(counts(r.items)).toEqual([null, null, 8, 0])
    expect(r.items.map((i) => i.suppressed)).toEqual([true, true, false, false])
  })

  it('leaves a breakdown alone when no cell is small', () => {
    const r = suppressBreakdown(15, [{ count: 5 }, { count: 10 }, { count: 0 }])
    expect(counts(r.items)).toEqual([5, 10, 0])
  })

  it('does not add a complementary cell when two cells are already suppressed', () => {
    const r = suppressBreakdown(14, [{ count: 2 }, { count: 3 }, { count: 9 }])
    expect(counts(r.items)).toEqual([null, null, 9])
  })

  it('hides the total and every cell when the total is 1-4', () => {
    const r = suppressBreakdown(3, [{ count: 3 }, { count: 0 }])
    expect(r.total).toBeNull()
    expect(r.totalSuppressed).toBe(true)
    expect(counts(r.items)).toEqual([null, null])
  })

  it('shows an empty breakdown as zero', () => {
    const r = suppressBreakdown(0, [{ count: 0 }])
    expect(r.total).toBe(0)
    expect(counts(r.items)).toEqual([0])
  })
})

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
  it('counts approved spend only and keeps pending separate', () => {
    const [php] = summarizeBudget(
      [{ currency: 'PHP', plannedBudget: 1000 }],
      [
        { currency: 'PHP', amount: 250.5, status: 'APPROVED' },
        { currency: 'PHP', amount: 100, status: 'PENDING' },
        { currency: 'PHP', amount: 40, status: 'VERIFIED' },
      ],
    )
    expect(php).toEqual({
      currency: 'PHP',
      planned: 1000,
      approved: 250.5,
      pending: 140,
      utilizationPercent: 25.1,
    })
  })

  it('returns null utilization for a zero budget and splits currencies', () => {
    const rows = summarizeBudget(
      [{ currency: 'USD', plannedBudget: 0 }],
      [
        { currency: 'USD', amount: 10, status: 'APPROVED' },
        { currency: 'PHP', amount: 5, status: 'APPROVED' },
      ],
    )
    expect(rows.map((r) => r.currency)).toEqual(['PHP', 'USD'])
    expect(rows.every((r) => r.utilizationPercent === null)).toBe(true)
  })
})

function harness(overrides: Record<string, unknown> = {}) {
  const tx = {
    project: {
      findFirst: vi.fn(async ({ where }) =>
        where.AND[1].id === projectA ? { id: projectA } : null,
      ),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    beneficiaryActivityParticipation: {
      groupBy: vi.fn(async () => [
        {
          activityId: act1,
          participationDate: d('2026-01-10'),
          attendanceStatus: 'PRESENT',
          _count: { _all: 6 },
        },
        {
          activityId: act1,
          participationDate: d('2026-02-10'),
          attendanceStatus: 'ABSENT',
          _count: { _all: 2 },
        },
        {
          activityId: act2,
          participationDate: d('2026-02-11'),
          attendanceStatus: 'PRESENT',
          _count: { _all: 9 },
        },
      ]),
    },
    projectActivity: {
      findMany: vi.fn(async () => [
        { id: act1, title: 'Workshop' },
        { id: act2, title: 'Visit' },
      ]),
    },
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
    projectBudgetRecord: { findMany: vi.fn(async () => [{ currency: 'PHP', plannedBudget: 200 }]) },
    budgetExpenseEntry: {
      findMany: vi.fn(async () => [
        { amount: 50, status: 'APPROVED', budgetRecord: { currency: 'PHP' } },
      ]),
    },
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

  it('participation: returns suppressed breakdowns and writes one audit row without data', async () => {
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
    expect(r.byAttendanceStatus.find((s) => s.status === 'ABSENT')).toEqual({
      status: 'ABSENT',
      count: null,
      suppressed: true,
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

  it('participation: forbids aggregate-only roles before any query', async () => {
    const { service, tx } = harness()
    await expect(
      service.participation(actor('GRANT_MANAGER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.beneficiaryActivityParticipation.groupBy).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns 404 for an out-of-scope project and writes no audit row', async () => {
    const { service, tx } = harness()
    await expect(
      service.indicatorTrends(actor('MONITORING_AND_EVALUATION_OFFICER'), { projectId: projectB }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
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

  it('budget: reports approved-only utilization', async () => {
    const { service } = harness()
    const r = await service.budget(actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(r.currencies).toEqual([
      { currency: 'PHP', planned: 200, approved: 50, pending: 0, utilizationPercent: 25 },
    ])
  })

  it('maps a database fault to 503 and writes no audit row', async () => {
    const { service, tx } = harness({
      projectBudgetRecord: {
        findMany: vi.fn(async () => {
          throw new Error('db down')
        }),
      },
    })
    await expect(
      service.budget(actor('PROJECT_MANAGER'), { projectId: projectA }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects an incomplete or reversed period with 400', async () => {
    const { service } = harness()
    const who = actor('PROJECT_MANAGER')
    await expect(
      service.budget(who, { projectId: projectA, periodStart: '2026-01-01' }),
    ).rejects.toThrow()
    await expect(
      service.budget(who, {
        projectId: projectA,
        periodStart: '2026-02-01',
        periodEnd: '2026-01-01',
      }),
    ).rejects.toThrow()
  })
})
