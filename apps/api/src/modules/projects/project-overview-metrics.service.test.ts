import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity, AuthenticatedRequest } from '@app/modules/auth/developer-access'
import { DashboardsService } from '@app/modules/dashboards/dashboards.service'
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { type MetricCell, projectOverviewMetricsSchema } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectOverviewMetricsController } from './project-overview-metrics.controller'
import { ProjectOverviewMetricsService } from './project-overview-metrics.service'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

type CanonicalRole = keyof typeof rolePermissions
const orgA = '10000000-0000-4000-8000-00000000000a'
const orgB = '10000000-0000-4000-8000-00000000000b'
const projectA = '20000000-0000-4000-8000-00000000000a'
const projectB = '20000000-0000-4000-8000-00000000000b'
const projectC = '20000000-0000-4000-8000-00000000000c'
const userId = '30000000-0000-4000-8000-000000000001'

function actor(role: CanonicalRole, overrides: Partial<ApplicationIdentity> = {}) {
  return {
    id: userId,
    aal: 'aal2',
    userId,
    organizationId: orgA,
    fullName: 'Synthetic overview fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [projectA],
    ...overrides,
  } as ApplicationIdentity
}

const cell = (value: string): MetricCell =>
  value === '0'
    ? { state: 'ZERO', value: '0', reason: null }
    : { state: 'AVAILABLE', value, reason: null }
const progress = (value: MetricCell) => ({ progress: value })

function matchesScope(
  where: Record<string, unknown>,
  project: { id: string; organizationId: string },
) {
  const clauses = (where.AND as Array<Record<string, unknown>>) ?? [where]
  return clauses.every((clause) => {
    if (clause.organizationId && clause.organizationId !== project.organizationId) return false
    const id = clause.id as string | { in: string[] } | undefined
    if (typeof id === 'string' && id !== project.id) return false
    if (id && typeof id === 'object' && !id.in.includes(project.id)) return false
    return true
  })
}

function harness(
  options: {
    startDate?: string
    endDate?: string | null
    sadddTotal?: MetricCell
    plannedBudget?: string | null
    approvedSpending?: string | null
    indicators?: MetricCell[]
  } = {},
) {
  const projects = [
    {
      id: projectA,
      organizationId: orgA,
      startDate: new Date(`${options.startDate ?? '2026-01-01'}T00:00:00.000Z`),
      endDate:
        options.endDate === null
          ? null
          : new Date(`${options.endDate ?? '2026-06-30'}T00:00:00.000Z`),
      targetBeneficiaries: 120,
    },
    { id: projectB, organizationId: orgB, startDate: null, endDate: null, targetBeneficiaries: 9 },
    { id: projectC, organizationId: orgA, startDate: null, endDate: null, targetBeneficiaries: 9 },
  ]
  const sqlCalls: string[] = []
  const tx = {
    project: {
      findFirst: vi.fn(async ({ where }) => {
        const found = projects.find((project) => matchesScope(where, project))
        if (!found) return null
        const { organizationId: _organizationId, ...row } = found
        return row
      }),
    },
    projectBudgetRecord: {
      findFirst: vi.fn(async () =>
        options.plannedBudget === null
          ? null
          : { plannedBudget: new Prisma.Decimal(options.plannedBudget ?? '1000.00') },
      ),
    },
    budgetExpenseEntry: {
      aggregate: vi.fn(async () => ({
        _sum: {
          amount:
            options.approvedSpending === null
              ? null
              : new Prisma.Decimal(options.approvedSpending ?? '250.00'),
        },
      })),
    },
    $queryRaw: vi.fn(async (query: { sql?: string } | TemplateStringsArray) => {
      const sql = 'sql' in query && typeof query.sql === 'string' ? query.sql : ''
      sqlCalls.push(sql)
      if (sql.includes('p06_saddd'))
        return [
          {
            data: {
              releaseState: 'RELEASED',
              total: options.sadddTotal ?? cell('30'),
              sex: [],
              age: [],
              disability: [],
              completeness: [],
            },
          },
        ]
      return []
    }),
    beneficiary: {
      findMany: vi.fn(() => {
        throw new Error('Beneficiary rows must never be read by the overview.')
      }),
    },
  }
  const rows = async () => (options.indicators ?? [cell('40'), cell('80.5')]).map(progress)
  const indicators = { readInTransaction: vi.fn(rows), readReleasedInTransaction: vi.fn(rows) }
  const dashboards = new DashboardsService(
    {} as PrismaService,
    indicators as unknown as IndicatorsService,
  )
  const service = new ProjectOverviewMetricsService(
    {} as PrismaService,
    indicators as unknown as IndicatorsService,
    dashboards,
  )
  vi.mocked(withAuthorizedOperation).mockImplementation((async (
    _prisma,
    identity,
    permission,
    work,
  ) => {
    if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission))
      throw new ForbiddenException('Required application permission is missing.')
    return work(tx as never, identity)
  }) as typeof withAuthorizedOperation)
  return { service, tx, indicators, sqlCalls }
}

describe('GET /projects/:projectId/overview-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T04:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('is gated by projects.read and requires an application profile', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, ProjectOverviewMetricsController.prototype.read),
    ).toBe('projects.read')
    const controller = new ProjectOverviewMetricsController({} as ProjectOverviewMetricsService)
    expect(() => controller.read({} as AuthenticatedRequest, projectA)).toThrow(ForbiddenException)
  })

  it('happy: derives KPI, budget, suppressed-aware reach and timeline for a Project Manager', async () => {
    const { service, tx } = harness()
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(projectOverviewMetricsSchema.safeParse(result).success).toBe(true)
    expect(result.kpiAchievement).toEqual({
      metric: cell('60.3'),
      indicatorCount: 2,
      reportedCount: 2,
    })
    expect(result.budgetUtilization).toEqual({
      metric: cell('25'),
      approvedBudget: '1000.00',
      countableSpending: '250.00',
    })
    expect(result.beneficiariesReached).toEqual({ metric: cell('30'), target: 120 })
    expect(result.timeline).toEqual({
      metric: cell('100'),
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    })
    expect(tx.budgetExpenseEntry.aggregate).toHaveBeenCalledWith({
      where: { organizationId: orgA, projectId: projectA, status: 'APPROVED' },
      _sum: { amount: true },
    })
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['1', { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }],
    ['4', { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }],
    ['5', { state: 'AVAILABLE', value: '5', reason: null }],
    ['0', { state: 'ZERO', value: '0', reason: null }],
  ])('SADDD small-cell rule: a reach count of %s is released as %j', async (count, expected) => {
    const { service } = harness({ sadddTotal: cell(count) })
    const result = await service.read(actor('PROGRAM_MANAGER'), projectA)
    expect(result.beneficiariesReached?.metric).toEqual(expected)
  })

  it('keeps an already suppressed SADDD total suppressed', async () => {
    const suppressed: MetricCell = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    const { service } = harness({ sadddTotal: suppressed })
    const result = await service.read(actor('GRANT_MANAGER'), projectA)
    expect(result.beneficiariesReached?.metric).toEqual(suppressed)
  })

  it('releases reach live to date on an ongoing project', async () => {
    const { service, sqlCalls } = harness({ endDate: '2026-12-31' })
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(result.beneficiariesReached?.metric).toEqual(cell('30'))
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(true)
    expect(result.timeline.metric).toEqual(cell('74.2'))
  })

  it('reports reach on a not-started project as missing, without calling the release', async () => {
    const { service, sqlCalls } = harness({ startDate: '2026-10-01', endDate: '2026-12-31' })
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(result.beneficiariesReached?.metric).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'NOT_STARTED',
    })
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(false)
  })

  it('returns budget utilization as null without budget read permission', async () => {
    const { service, tx } = harness()
    const officer = actor('MONITORING_AND_EVALUATION_OFFICER')
    expect(officer.permissions).not.toContain('budgets.read')
    const result = await service.read(officer, projectA)
    expect(result.budgetUtilization).toBeNull()
    expect(tx.projectBudgetRecord.findFirst).not.toHaveBeenCalled()
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
  })

  it('returns KPI achievement to a Program Manager through the released values only', async () => {
    const { service, indicators } = harness()
    const manager = actor('PROGRAM_MANAGER')
    expect(manager.permissions).not.toContain('indicators.read')
    const result = await service.read(manager, projectA)
    expect(result.kpiAchievement?.metric.state).toBe('AVAILABLE')
    expect(indicators.readReleasedInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ roles: ['PROGRAM_MANAGER'] }),
      [projectA],
    )
    expect(indicators.readInTransaction).not.toHaveBeenCalled()
  })

  it('keeps the definitions read for a role holding indicators.read', async () => {
    const { service, indicators } = harness()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'), projectA)
    expect(indicators.readInTransaction).toHaveBeenCalled()
    expect(indicators.readReleasedInTransaction).not.toHaveBeenCalled()
  })

  it('returns KPI achievement as null without monitoring.read', async () => {
    const { service, indicators } = harness()
    const officer = actor('PROJECT_OFFICER')
    expect(officer.permissions).not.toContain('monitoring.read')
    const result = await service.read(officer, projectA)
    expect(result.kpiAchievement).toBeNull()
    expect(indicators.readInTransaction).not.toHaveBeenCalled()
    expect(indicators.readReleasedInTransaction).not.toHaveBeenCalled()
  })

  it('serves the efficiency ratio when both KPI and budget sections are readable', async () => {
    const { service } = harness({ indicators: [cell('57')], approvedSpending: '140.00' })
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(result.efficiencyRatio).toEqual(cell('4.07'))
  })

  it('returns the efficiency ratio as null without budget or expense read permission', async () => {
    const { service } = harness()
    const officer = actor('MONITORING_AND_EVALUATION_OFFICER')
    expect(officer.permissions).not.toContain('budgets.read')
    expect((await service.read(officer, projectA)).efficiencyRatio).toBeNull()
  })

  it('reports the server-side aggregate total regardless of how many approved expenses exist', async () => {
    const { service, tx } = harness({ plannedBudget: '500000.00', approvedSpending: '123456.78' })
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(result.budgetUtilization).toMatchObject({
      approvedBudget: '500000.00',
      countableSpending: '123456.78',
    })
    expect(tx.budgetExpenseEntry.aggregate).toHaveBeenCalledTimes(1)
  })

  it('never reports missing sources as zero', async () => {
    const { service } = harness({
      endDate: null,
      plannedBudget: null,
      approvedSpending: null,
      indicators: [{ state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' }],
    })
    const result = await service.read(actor('PROJECT_MANAGER'), projectA)
    expect(result.kpiAchievement?.metric.state).toBe('MISSING')
    expect(result.budgetUtilization?.metric).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'NO_PLANNED_BUDGET',
    })
    expect(result.beneficiariesReached?.metric.state).toBe('MISSING')
    expect(result.timeline.metric.state).toBe('MISSING')
  })

  it('abuse: a cross-organization project is not found and no metric source is read', async () => {
    const { service, tx, indicators } = harness()
    const admin = actor('SYSTEM_ADMINISTRATOR')
    await expect(service.read(admin, projectB)).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.project.findFirst.mock.calls[0]?.[0].where.AND[0]).toMatchObject({
      organizationId: orgA,
    })
    expect(indicators.readInTransaction).not.toHaveBeenCalled()
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('abuse: an unassigned project in the same organization is not found', async () => {
    const { service, tx } = harness()
    await expect(service.read(actor('PROJECT_MANAGER'), projectC)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
  })

  it('abuse: a malformed project id is not found before any query', async () => {
    const { service, tx } = harness()
    await expect(service.read(actor('PROJECT_MANAGER'), 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('abuse: a principal without projects.read is denied', async () => {
    const { service, tx } = harness()
    await expect(
      service.read(actor('PROJECT_MANAGER', { permissions: [] }), projectA),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })
})
