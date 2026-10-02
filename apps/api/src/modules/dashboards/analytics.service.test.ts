import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
type CanonicalRole = keyof typeof rolePermissions
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import {
  type DescriptiveAnalytics,
  type MetricCell,
  businessCalendarDate,
  descriptiveAnalyticsSchema,
  surveyAggregateFromRows,
} from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activityObservation } from '../rules/rule-metrics'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { DashboardsService } from './dashboards.service'
import {
  buildDescriptiveAnalytics,
  descriptiveAnalyticsCsv,
  suppressSmallCount,
} from './descriptive-analytics'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const orgA = '10000000-0000-4000-8000-00000000000a'
const orgB = '10000000-0000-4000-8000-00000000000b'
const projectA = '20000000-0000-4000-8000-00000000000a'
const projectB = '20000000-0000-4000-8000-00000000000b'
const userId = '30000000-0000-4000-8000-000000000001'

const projects = [
  { id: projectA, organizationId: orgA, code: 'A', title: 'Synthetic project A' },
  { id: projectB, organizationId: orgB, code: 'B', title: 'Synthetic project B' },
]

function actor(role: CanonicalRole, overrides: Partial<ApplicationIdentity> = {}) {
  return {
    id: userId,
    aal: 'aal2',
    userId,
    organizationId: orgA,
    fullName: 'Synthetic analytics fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [projectA],
    ...overrides,
  } as ApplicationIdentity
}

const cell = (value: number): MetricCell =>
  value === 0
    ? { state: 'ZERO', value: '0', reason: null }
    : { state: 'AVAILABLE', value: String(value), reason: null }
const suppressed: MetricCell = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
const bucket = (key: string, metric: MetricCell) => ({ key, label: key, metric })

const monitoringRaw = {
  activities: [bucket('PLANNED', cell(3)), bucket('COMPLETED', cell(1))],
  milestones: [bucket('ACHIEVED', cell(2)), bucket('PENDING', cell(0))],
  participationRecords: cell(40),
  attendingIndividuals: cell(12),
  enrolledBeneficiaryRecords: cell(15),
  enrolledIndividuals: cell(14),
}
const releasedSaddd = {
  releaseState: 'RELEASED',
  total: cell(30),
  sex: [bucket('FEMALE', cell(18)), bucket('MALE', cell(12))],
  age: [bucket('10-14', cell(10)), bucket('18-24', cell(20))],
  disability: [bucket('NO', cell(24)), bucket('YES', cell(6))],
  completeness: [],
}
// A 1-4 cell suppresses the whole SADDD table, as p06_saddd returns it.
const suppressedSaddd = {
  releaseState: 'RELEASED',
  total: suppressed,
  sex: [bucket('FEMALE', suppressed), bucket('MALE', suppressed)],
  age: [bucket('0-9', suppressed), bucket('25+', suppressed)],
  disability: [bucket('NO', suppressed), bucket('YES', suppressed)],
  completeness: [],
}

const indicator = (id: string, unitLabel: string, value: MetricCell) => ({
  id,
  projectId: projectA,
  code: id.slice(-4),
  name: 'Synthetic indicator',
  description: null,
  unitLabel,
  dataSource: null,
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: null,
  periodEnd: null,
  baseline: null,
  target: null,
  current: value,
  progress: { state: 'NOT_APPLICABLE', value: null, reason: 'NO_TARGET' },
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
  revision: 1,
  status: 'ACTIVE',
  contractVersion: 'p06.v1',
})

function matchesScope(where: Record<string, unknown>, project: (typeof projects)[number]) {
  const clauses = (where.AND as Array<Record<string, unknown>>) ?? [where]
  return clauses.every((clause) => {
    if (clause.organizationId && clause.organizationId !== project.organizationId) return false
    const id = clause.id as string | { in: string[] } | undefined
    if (typeof id === 'string' && id !== project.id) return false
    if (id && typeof id === 'object' && !id.in.includes(project.id)) return false
    return true
  })
}

type FixtureActivity = {
  status: string
  archivedAt: Date | null
  plannedEndDate: Date | null
}
type FixtureMilestone = {
  status: string
  targetDate: Date | null
  completionDate: Date | null
  archivedAt?: Date | null
}

/**
 * TypeScript mirror of pathways.p10_f9_timeline_aggregate (the SQL suite proves the SQL side).
 * Eligible = non-archived and non-cancelled; overdue = non-completed with a planned end before
 * the reporting date; missingDates = non-completed without a planned end date.
 */
function timelineAggregateFromFixture(
  activities: FixtureActivity[],
  milestones: FixtureMilestone[],
  reportingDate: string,
) {
  const eligible = activities.filter((a) => a.archivedAt === null && a.status !== 'CANCELLED')
  const open = eligible.filter((a) => a.status !== 'COMPLETED')
  const days = (a: FixtureActivity) =>
    Math.round(
      (Date.parse(`${reportingDate}T00:00:00Z`) - (a.plannedEndDate as Date).getTime()) / 86400000,
    )
  const dated = open.filter((a) => a.plannedEndDate !== null)
  const completedMilestones = milestones.filter((m) => !m.archivedAt && m.status === 'COMPLETED')
  const rated = completedMilestones.filter((m) => m.targetDate && m.completionDate)
  return {
    activities: {
      eligible: eligible.length,
      completed: eligible.filter((a) => a.status === 'COMPLETED').length,
      overdue: dated.filter((a) => days(a) > 0).length,
      missingDates: open.length - dated.length,
      maxOverdueDays: dated.length ? Math.max(0, ...dated.map(days)) : null,
    },
    milestones: {
      completed: completedMilestones.length,
      rated: rated.length,
      onTime: rated.filter((m) => (m.completionDate as Date) <= (m.targetDate as Date)).length,
    },
  }
}

function harness(
  sadddRaw: unknown = releasedSaddd,
  projectEnd = '2026-06-30',
  options: {
    assessmentResults?: unknown[]
    activities?: unknown[]
    milestones?: unknown[]
    projectStatus?: string
    /** Overrides what the trusted SQL function returns (instead of deriving it from fixtures). */
    surveyAggregate?: unknown
    timelineAggregate?: unknown
    /** Makes the trusted SQL function fail with this Prisma-style error. */
    aggregateError?: { code?: string; meta?: { code: string } }
  } = {},
) {
  const sqlCalls: string[] = []
  const tx = {
    project: {
      findMany: vi.fn(async ({ where }) =>
        projects
          .filter((p) => matchesScope(where, p))
          .map(({ id, code, title }) => ({ id, code, title })),
      ),
      findFirst: vi.fn(async ({ where }) => {
        const found = projects.find((p) => matchesScope(where, p))
        return found
          ? {
              ...found,
              status: options.projectStatus ?? 'ONGOING',
              archivedAt: null,
              startDate: new Date('2026-01-01'),
              endDate: new Date(projectEnd),
            }
          : null
      }),
    },
    // Detail rows must never be read by F9 survey/timeline: the trusted SQL aggregates replace them.
    assessmentResult: {
      findMany: vi.fn(async (_args: unknown) => {
        throw new Error('Assessment rows must never be read by F9 analytics.')
      }),
    },
    projectActivity: {
      findMany: vi.fn(async (_args: unknown) => {
        throw new Error('Activity rows must never be read by F9 analytics.')
      }),
    },
    projectMilestone: {
      findMany: vi.fn(async (_args: unknown) => {
        throw new Error('Milestone rows must never be read by F9 analytics.')
      }),
    },
    $queryRaw: vi.fn(async (query: { sql?: string; values?: unknown[] } | TemplateStringsArray) => {
      const sql = Array.isArray(query)
        ? query.join('?')
        : 'sql' in query && typeof query.sql === 'string'
          ? query.sql
          : ''
      const values = 'values' in query && Array.isArray(query.values) ? query.values : []
      sqlCalls.push(sql)
      if (sql.includes('p06_saddd')) return [{ data: sadddRaw }]
      if (sql.includes('p06_monitoring')) return [{ data: monitoringRaw }]
      if (sql.includes('p10_f9_survey_aggregate') || sql.includes('p10_f9_timeline_aggregate')) {
        if (options.aggregateError)
          throw Object.assign(new Error('aggregate failed'), options.aggregateError)
        if (sql.includes('p10_f9_survey_aggregate'))
          return [
            {
              data:
                options.surveyAggregate ??
                surveyAggregateFromRows(
                  ((options.assessmentResults ?? []) as Array<Record<string, unknown>>).map(
                    (row) => ({
                      id: row.id as string,
                      type: row.type as 'PRE_TEST' | 'POST_TEST',
                      score: String(row.score),
                      maximumScore: String(row.maximumScore),
                      assessmentDate: (row.assessmentDate as Date).toISOString().slice(0, 10),
                      enrollmentId: row.enrollmentId as string | null,
                      activityId: row.activityId as string | null,
                    }),
                  ),
                ),
            },
          ]
        return [
          {
            data:
              options.timelineAggregate ??
              timelineAggregateFromFixture(
                (options.activities ?? []) as FixtureActivity[],
                (options.milestones ?? []) as FixtureMilestone[],
                String(values[2]),
              ),
          },
        ]
      }
      return []
    }),
    auditLog: { create: vi.fn(async () => ({})) },
    beneficiary: {
      findMany: vi.fn(() => {
        throw new Error('Beneficiary rows must never be read by descriptive analytics.')
      }),
    },
  }
  const indicators = {
    readInTransaction: vi.fn(async () => [
      indicator('40000000-0000-4000-8000-000000000001', 'people', cell(10)),
      indicator('40000000-0000-4000-8000-000000000002', 'people', cell(20)),
      indicator('40000000-0000-4000-8000-000000000003', 'sessions', suppressed),
    ]),
  }
  const dashboards = new DashboardsService(
    {} as PrismaService,
    indicators as unknown as IndicatorsService,
  )
  const service = new AnalyticsService({} as PrismaService, dashboards)
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
  return { tx, service, sqlCalls }
}

const exportText = async (service: AnalyticsService, identity: ApplicationIdentity) =>
  (await service.export(identity, { projectId: projectA })).bytes.toString('utf8')

/** The combined (view-less/kpi/participation) payload shape, for tests unrelated to the new views. */
const descriptive = async (
  service: AnalyticsService,
  identity: ApplicationIdentity,
  input: unknown,
) => (await service.descriptive(identity, input)) as DescriptiveAnalytics

describe('analytics descriptive read and export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gates the routes with the dedicated permissions', () => {
    const meta = (method: keyof AnalyticsController) =>
      Reflect.getMetadata(PERMISSION_KEY, AnalyticsController.prototype[method])
    expect(meta('descriptive')).toBe('analytics.descriptive.read')
    expect(meta('export')).toBe('analytics.export')
  })

  it('happy: returns counts, distributions, shares and per-unit means from aggregates', async () => {
    const { service, tx } = harness()
    const result = await descriptive(service, actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
    })
    expect(descriptiveAnalyticsSchema.safeParse(result).success).toBe(true)
    expect(withAuthorizedOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'analytics.descriptive.read',
      expect.any(Function),
    )
    const sex = result.distributions.filter((row) => row.section === 'SADDD_SEX')
    expect(sex.map((row) => row.share)).toEqual(['0.6', '0.4'])
    expect(
      result.distributions.filter((row) => row.section === 'SADDD_AGE').map((r) => r.key),
    ).toEqual(['10-14', '18-24'])
    expect(result.indicatorSummaries).toEqual([
      expect.objectContaining({
        unitLabel: 'people',
        reportedCount: 2,
        mean: '15',
        minimum: '10',
        maximum: '20',
      }),
      expect.objectContaining({ unitLabel: 'sessions', reportedCount: 0, mean: null }),
    ])
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('happy: export writes an audit record and returns aggregate CSV only', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, { projectId: projectA })
    expect(result.contentType).toBe('text/csv; charset=utf-8')
    const csv = result.bytes.toString('utf8')
    expect(csv.split('\r\n')[0]).toBe('"section","key","label","state","value","share","reason"')
    expect(csv).toContain('"SADDD_SEX","FEMALE","FEMALE","AVAILABLE","18","0.6",""')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        projectId: projectA,
        actorUserId: userId,
        action: 'ANALYTICS_DESCRIPTIVE_EXPORTED',
        entityType: 'Project',
        entityId: projectA,
      }),
    })
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('sad: rejects missing, malformed or partial-period queries before any transaction', async () => {
    const { service } = harness()
    const identity = actor('PROJECT_MANAGER')
    await expect(service.descriptive(identity, {})).rejects.toMatchObject({ status: 400 })
    await expect(service.descriptive(identity, { projectId: 'x' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      service.export(identity, { projectId: projectA, periodStart: '2026-01-01' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      service.descriptive(identity, { projectId: projectA, sex: 'FEMALE' }),
    ).rejects.toMatchObject({ status: 400 })
    expect(withAuthorizedOperation).not.toHaveBeenCalled()
  })

  it('abuse: suppression holds in the read and in the exported CSV', async () => {
    const { service } = harness(suppressedSaddd)
    const identity = actor('PROGRAM_MANAGER')
    const result = await descriptive(service, identity, { projectId: projectA })
    const saddd = result.distributions.filter((row) => row.section.startsWith('SADDD_'))
    expect(saddd.length).toBeGreaterThan(0)
    for (const row of saddd) {
      expect(row.metric).toEqual(suppressed)
      expect(row.share).toBeNull()
    }
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric).toEqual(suppressed)
    const csv = await exportText(service, identity)
    const sadddLines = csv.split('\r\n').filter((line) => line.startsWith('"SADDD_'))
    expect(sadddLines).toHaveLength(6)
    for (const line of sadddLines) expect(line).toMatch(/,"SUPPRESSED","","","SMALL_CELL"$/)
    expect(csv).not.toMatch(/Synthetic project|beneficiar(y|ies)Id|dateOfBirth/i)
  })

  it('abuse: a partially suppressed section withholds every share', async () => {
    const { service } = harness({
      ...releasedSaddd,
      sex: [bucket('FEMALE', cell(27)), bucket('MALE', suppressed)],
    })
    const result = await descriptive(service, actor('GRANT_MANAGER'), { projectId: projectA })
    const sex = result.distributions.filter((row) => row.section === 'SADDD_SEX')
    expect(sex.map((row) => row.share)).toEqual([null, null])
  })

  it('sad: an open project period omits SADDD instead of calling the release', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2099-12-31')
    const result = await descriptive(service, actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(result.sadddReleaseState).toBe('UNAVAILABLE')
    expect(result.distributions.some((row) => row.section.startsWith('SADDD_'))).toBe(false)
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(false)
  })

  it('sad: an unexpected retrieval failure is a 503, never a 400 client error', async () => {
    const { service, tx } = harness()
    tx.project.findFirst.mockRejectedValueOnce(new Error('connection reset'))
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    await expect(
      service.descriptive(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('abuse: another organization project is out of scope before any aggregate is read', async () => {
    const { service, sqlCalls, tx } = harness()
    const identity = actor('SYSTEM_ADMINISTRATOR')
    await expect(service.descriptive(identity, { projectId: projectB })).rejects.toMatchObject({
      status: 404,
    })
    await expect(service.export(identity, { projectId: projectB })).rejects.toMatchObject({
      status: 404,
    })
    expect(sqlCalls.some((sql) => sql.includes('p06_'))).toBe(false)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    const where = tx.project.findMany.mock.calls[0]?.[0].where
    expect(where.AND[0]).toMatchObject({ organizationId: orgA })
  })

  it('abuse: an unassigned project in the same organization is out of scope', async () => {
    const { service } = harness()
    const identity = actor('PROJECT_MANAGER', { assignedProjectIds: [] })
    await expect(service.descriptive(identity, { projectId: projectA })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('abuse: roles without the permission are denied read and export', async () => {
    const { service, tx } = harness()
    const officer = actor('PROJECT_OFFICER')
    expect(officer.permissions).not.toContain('analytics.descriptive.read')
    expect(officer.permissions).not.toContain('analytics.export')
    await expect(service.descriptive(officer, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    await expect(service.export(officer, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    const readOnly = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter((p) => p !== 'analytics.export'),
    })
    await expect(service.descriptive(readOnly, { projectId: projectA })).resolves.toBeTruthy()
    await expect(service.export(readOnly, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    const exportOnly = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter(
        (p) => p !== 'analytics.descriptive.read',
      ),
    })
    await expect(service.export(exportOnly, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    // Every forbidden attempt above is blocked before any query or audit write; only the
    // one successful read (readOnly, above) is audited.
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ANALYTICS_DESCRIPTIVE_VIEWED' }),
      }),
    )
  })

  it('abuse: CSV neutralizes spreadsheet formulas in labels', () => {
    const csv = descriptiveAnalyticsCsv({
      contractVersion: 'analytics.descriptive.v1',
      projectId: projectA,
      generatedAt: '2026-09-28T00:00:00.000Z',
      monitoringPeriod: {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-28',
        businessTimeZone: 'UTC',
      },
      sadddPeriod: { periodStart: null, periodEnd: null },
      sadddReleaseState: 'UNAVAILABLE',
      privacy: {
        threshold: 5,
        complementarySuppression: true,
        source: 'P06_SADDD_RELEASE',
        beneficiaryRows: false,
      },
      counts: [],
      distributions: [
        {
          section: 'ACTIVITY_STATE',
          key: 'X',
          label: '=HYPERLINK("x")',
          metric: cell(6),
          share: '1',
        },
      ],
      indicatorSummaries: [],
    })
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('descriptive analytics small-cell and complementary suppression', () => {
  const monitoringWith = (value: number) =>
    ({
      contractVersion: 'p06.v1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-28',
      businessTimeZone: 'Asia/Manila',
      generatedAt: '2026-09-28T00:00:00.000Z',
      refresh: 'READ_TIME_NO_CACHE',
      projects: [],
      scopeProjectCount: 1,
      activities: [],
      milestones: [],
      participationRecords: cell(value),
      attendingIndividuals: cell(value),
      enrolledBeneficiaryRecords: cell(value),
      enrolledIndividuals: cell(value),
      indicators: [],
      indicatorNote: 'n',
    }) as never
  const sadddWith = (total: MetricCell) =>
    ({
      ...releasedSaddd,
      contractVersion: 'p06.v1',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      businessTimeZone: 'Asia/Manila',
      generatedAt: '2026-09-28T00:00:00.000Z',
      refresh: 'READ_TIME_NO_CACHE',
      total,
    }) as never
  const personKeys = [
    'participationRecords',
    'attendingIndividuals',
    'enrolledBeneficiaryRecords',
    'enrolledIndividuals',
  ]
  const build = (value: number, saddd: unknown = null) =>
    buildDescriptiveAnalytics({
      projectId: projectA,
      monitoring: monitoringWith(value),
      saddd: saddd as never,
      generatedAt: '2026-09-28T00:00:00.000Z',
    })

  it.each([
    [0, 'ZERO', '0'],
    [1, 'SUPPRESSED', null],
    [4, 'SUPPRESSED', null],
    [5, 'AVAILABLE', '5'],
  ])(
    'count %i is %s in the read and the CSV for every person-derived count',
    (value, state, shown) => {
      const result = build(value)
      const csv = descriptiveAnalyticsCsv(result)
      for (const key of personKeys) {
        const row = result.counts.find((candidate) => candidate.key === key)
        expect(row?.metric.state).toBe(state)
        expect(row?.metric.value).toBe(shown)
        expect(csv).toContain(`"COUNT","${key}",`)
        const line = csv.split('\r\n').find((l) => l.startsWith(`"COUNT","${key}",`))
        expect(line).toContain(`"${state}","${shown ?? ''}"`)
      }
      expect(suppressSmallCount(cell(value)).state).toBe(state)
    },
  )

  it('reconstruction: a suppressed SADDD total suppresses every paired monitoring count', () => {
    const result = build(37, sadddWith(suppressed))
    const csv = descriptiveAnalyticsCsv(result)
    expect(result.counts.find((row) => row.key === 'enrolledIndividuals')).toBeUndefined()
    for (const key of [
      'participationRecords',
      'attendingIndividuals',
      'enrolledBeneficiaryRecords',
    ]) {
      const row = result.counts.find((candidate) => candidate.key === key)
      expect(row?.metric).toEqual({
        state: 'SUPPRESSED',
        value: null,
        reason: 'COMPLEMENTARY_SUPPRESSION',
      })
    }
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric).toEqual(suppressed)
    const visibleCounts = result.counts.filter(
      (row) => row.key !== 'indicatorDefinitions' && row.metric.value !== null,
    )
    expect(visibleCounts).toEqual([])
    expect(csv).not.toContain('"37"')
    expect(csv).not.toContain('"enrolledIndividuals"')
  })

  it('omits the duplicate monitoring individual total when SADDD is released', () => {
    const result = build(37, sadddWith(cell(30)))
    expect(result.counts.map((row) => row.key)).not.toContain('enrolledIndividuals')
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric.value).toBe('30')
    expect(result.counts.find((row) => row.key === 'attendingIndividuals')?.metric.value).toBe('37')
  })
})

describe('analytics descriptive views: survey and timeline', () => {
  beforeEach(() => vi.clearAllMocks())

  let assessmentIdCounter = 0
  function assessment(overrides: Record<string, unknown> = {}) {
    assessmentIdCounter += 1
    return {
      id: `assessment-${assessmentIdCounter}`,
      type: 'PRE_TEST',
      score: { toString: () => '50' },
      maximumScore: { toString: () => '100' },
      assessmentDate: new Date('2026-02-01'),
      enrollmentId: 'enrollment-1',
      activityId: null,
      ...overrides,
    }
  }

  function pairedRows(
    id: string,
    pre: number,
    post: number,
    options: { activityId?: string | null } = {},
  ) {
    return [
      assessment({
        type: 'PRE_TEST',
        score: { toString: () => String(pre) },
        enrollmentId: id,
        activityId: options.activityId ?? null,
        assessmentDate: new Date('2026-02-01'),
      }),
      assessment({
        type: 'POST_TEST',
        score: { toString: () => String(post) },
        enrollmentId: id,
        activityId: options.activityId ?? null,
        assessmentDate: new Date('2026-03-01'),
      }),
    ]
  }

  it('happy: computes survey pairing from the trusted aggregate, never from assessment rows', async () => {
    const rows = ['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pairedRows(id, 40, 60))
    const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: rows,
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    expect(result).toMatchObject({
      contractVersion: 'analytics.descriptive.survey.v1',
      overall: { pairs: { state: 'AVAILABLE', value: '5' } },
    })
    // Only the trusted aggregate function is called; assessment rows are never read.
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
          changes: expect.objectContaining({
            view: 'survey',
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
          }),
        }),
      }),
    )
  })

  it('happy: computes timeline adherence from the trusted activity/milestone aggregate', async () => {
    const activities = [
      {
        id: '40000000-0000-4000-8000-000000000011',
        organizationId: orgA,
        projectId: projectA,
        status: 'COMPLETED',
        archivedAt: null,
        plannedEndDate: new Date('2026-02-01'),
      },
      {
        id: '40000000-0000-4000-8000-000000000012',
        organizationId: orgA,
        projectId: projectA,
        status: 'IN_PROGRESS',
        archivedAt: null,
        plannedEndDate: new Date('2026-01-01'),
      },
    ]
    const milestones = [
      {
        status: 'COMPLETED',
        targetDate: new Date('2026-01-10'),
        completionDate: new Date('2026-01-10'),
      },
      { status: 'CANCELLED', targetDate: new Date('2020-01-01'), completionDate: null },
    ]
    const { service, tx } = harness(releasedSaddd, '2026-12-31', {
      activities,
      milestones,
      projectStatus: 'ONGOING',
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, { projectId: projectA, view: 'timeline' })
    expect(result).toMatchObject({
      contractVersion: 'analytics.descriptive.timeline.v1',
      activityCompletionPercent: { state: 'AVAILABLE', value: '50' },
      milestoneOnTimePercent: { state: 'AVAILABLE', value: '100' },
    })
    // Counts come from the trusted aggregate; activity and milestone rows are never read.
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
          changes: expect.objectContaining({ view: 'timeline' }),
        }),
      }),
    )
  })

  it('sad: survey is MISSING (NO_PAIRED_ASSESSMENTS) rather than a fabricated zero when there is no data', async () => {
    const { service } = harness(releasedSaddd, '2026-06-30', { assessmentResults: [] })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    expect(result).toMatchObject({
      overall: {
        pairs: { state: 'ZERO', value: '0' },
        meanPre: { state: 'MISSING', reason: 'NO_PAIRED_ASSESSMENTS' },
      },
    })
  })

  it('sad: timeline is MISSING (NO_ACTIVITIES / NO_COMPLETED_MILESTONES) rather than a fabricated zero', async () => {
    const { service } = harness(releasedSaddd, '2026-06-30', {
      activities: [],
      milestones: [],
      projectStatus: 'ONGOING',
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, { projectId: projectA, view: 'timeline' })
    expect(result).toMatchObject({
      activityCompletionPercent: { state: 'MISSING', reason: 'NO_ACTIVITIES' },
      milestoneOnTimePercent: { state: 'MISSING', reason: 'NO_COMPLETED_MILESTONES' },
    })
  })

  it('abuse: an out-of-scope project is denied for survey and timeline before any query', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER')
    await expect(
      service.descriptive(identity, {
        projectId: projectB,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.descriptive(identity, { projectId: projectB, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('abuse: a cross-org project is denied for survey and timeline before any query', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER', { organizationId: orgB })
    await expect(
      service.descriptive(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
  })

  it('abuse: a Project Officer is denied survey and timeline (no analytics.descriptive.read)', async () => {
    const { service } = harness()
    const officer = actor('PROJECT_OFFICER')
    await expect(
      service.descriptive(officer, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.descriptive(officer, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('abuse: survey and timeline (read and export) require monitoring.read even with analytics.descriptive.read/export', async () => {
    const { service, tx } = harness()
    const noMonitoring = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter((p) => p !== 'monitoring.read'),
    })
    expect(noMonitoring.permissions).toContain('analytics.descriptive.read')
    expect(noMonitoring.permissions).toContain('analytics.export')
    await expect(
      service.descriptive(noMonitoring, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.descriptive(noMonitoring, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.export(noMonitoring, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.export(noMonitoring, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  describe('defined-period rule (adjacent-period differencing abuse)', () => {
    it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)(
      'abuse: %s custom or adjacent survey ranges refused by the aggregate function are a 400 on read and export, with no audit row',
      async (role) => {
        const { service, tx } = harness(releasedSaddd, '2026-06-30', {
          aggregateError: { code: 'P2010', meta: { code: '22023' } },
        })
        const identity = actor(role)
        for (const range of [
          { periodStart: '2026-03-01', periodEnd: '2026-03-31' },
          { periodStart: '2026-03-02', periodEnd: '2026-03-31' },
        ]) {
          await expect(
            service.descriptive(identity, { projectId: projectA, ...range, view: 'survey' }),
          ).rejects.toMatchObject({ status: 400 })
          await expect(
            service.export(identity, { projectId: projectA, ...range, view: 'survey' }),
          ).rejects.toMatchObject({ status: 400 })
        }
        expect(tx.auditLog.create).not.toHaveBeenCalled()
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
      },
    )

    it('sad: a survey request without a complete period is a 400 before the aggregate is called', async () => {
      const { service, sqlCalls } = harness()
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), { projectId: projectA, view: 'survey' }),
      ).rejects.toMatchObject({ status: 400 })
      expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(0)
    })

    it('sad: a 22023 from the timeline aggregate is not a client error (timeline takes no period)', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { code: 'P2010', meta: { code: '22023' } },
      })
      await expect(
        service.descriptive(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
    })
  })

  describe('trusted aggregates for aggregate-only roles', () => {
    const fivePairs = () => ['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pairedRows(id, 40, 60))
    const period = { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
    const activityFixture = (status: string, plannedEnd: string | null, archived = false) => ({
      status,
      archivedAt: archived ? new Date('2026-01-01') : null,
      plannedEndDate: plannedEnd ? new Date(plannedEnd) : null,
    })

    it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const)(
      'abuse: %s (no assessments.detail.read) is refused survey read and export with a 403 before any query',
      async (role) => {
        expect(rolePermissions[role]).not.toContain('assessments.detail.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
          assessmentResults: fivePairs(),
        })
        const identity = actor(role)
        await expect(
          service.descriptive(identity, { projectId: projectA, ...period, view: 'survey' }),
        ).rejects.toMatchObject({
          status: 403,
          message: 'Survey improvement is restricted for your role.',
        })
        await expect(
          service.export(identity, { projectId: projectA, ...period, view: 'survey' }),
        ).rejects.toMatchObject({ status: 403 })
        expect(sqlCalls).toHaveLength(0)
        expect(tx.$queryRaw).not.toHaveBeenCalled()
        expect(tx.project.findFirst).not.toHaveBeenCalled()
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
        expect(tx.auditLog.create).not.toHaveBeenCalled()
      },
    )

    it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)(
      'happy: %s (holds assessments.detail.read) still receives real survey aggregates on read and export',
      async (role) => {
        expect(rolePermissions[role]).toContain('assessments.detail.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
          assessmentResults: fivePairs(),
        })
        const identity = actor(role)
        const read = (await service.descriptive(identity, {
          projectId: projectA,
          ...period,
          view: 'survey',
        })) as { overall: { pairs: MetricCell; meanPre: MetricCell; meanPost: MetricCell } }
        expect(read.overall.pairs).toMatchObject({ state: 'AVAILABLE', value: '5' })
        expect(read.overall.meanPre.value).toBe('40')
        expect(read.overall.meanPost.value).toBe('60')
        const csv = (
          await service.export(identity, { projectId: projectA, ...period, view: 'survey' })
        ).bytes.toString('utf8')
        expect(csv).toMatch(
          /"SURVEY","OVERALL","All activities \(cohort change\) - Paired assessments","AVAILABLE","5"/,
        )
        expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(2)
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
        expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
      },
    )

    it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
      'happy: %s receives real timeline aggregates on read and export, not "No activities recorded yet"',
      async (role) => {
        expect(rolePermissions[role]).toContain('activities.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-12-31', {
          activities: [
            activityFixture('COMPLETED', '2026-02-01'),
            activityFixture('IN_PROGRESS', '2026-01-01'),
            activityFixture('NOT_STARTED', '2099-01-01'),
            activityFixture('CANCELLED', '2020-01-01'),
            activityFixture('IN_PROGRESS', '2020-01-01', true),
          ],
          milestones: [
            {
              status: 'COMPLETED',
              targetDate: new Date('2026-01-10'),
              completionDate: new Date('2026-01-09'),
              archivedAt: null,
            },
          ],
          projectStatus: 'ONGOING',
        })
        const identity = actor(role)
        const read = (await service.descriptive(identity, {
          projectId: projectA,
          view: 'timeline',
        })) as {
          activityCompletionPercent: MetricCell
          activityOverdueCount: MetricCell
          milestoneOnTimePercent: MetricCell
        }
        // 3 eligible (cancelled and archived excluded), 1 completed, 1 overdue.
        expect(read.activityCompletionPercent).toMatchObject({
          state: 'AVAILABLE',
          value: '33.3333',
        })
        expect(read.activityOverdueCount).toMatchObject({ state: 'AVAILABLE', value: '1' })
        expect(read.milestoneOnTimePercent).toMatchObject({ state: 'AVAILABLE', value: '100' })
        const csv = (
          await service.export(identity, { projectId: projectA, view: 'timeline' })
        ).bytes.toString('utf8')
        expect(csv).toContain('"Overdue activities","AVAILABLE","1"')
        expect(sqlCalls.filter((sql) => sql.includes('p10_f9_timeline_aggregate'))).toHaveLength(2)
        expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
        expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
      },
    )

    it('abuse: a Project Officer is denied survey and timeline read and export before any aggregate call', async () => {
      const { service, sqlCalls } = harness()
      const officer = actor('PROJECT_OFFICER')
      for (const view of ['survey', 'timeline'] as const) {
        await expect(
          service.descriptive(officer, { projectId: projectA, ...period, view }),
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          service.export(officer, { projectId: projectA, ...period, view }),
        ).rejects.toMatchObject({ status: 403 })
      }
      expect(sqlCalls.some((sql) => sql.includes('p10_f9'))).toBe(false)
    })

    it('guard order: monitoring permission, then project scope, then the aggregate call, then audit', async () => {
      const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
        assessmentResults: fivePairs(),
      })
      await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      const scopeOrder = tx.project.findFirst.mock.invocationCallOrder[0] ?? 0
      const aggregateOrder =
        tx.$queryRaw.mock.invocationCallOrder[
          sqlCalls.findIndex((sql) => sql.includes('p10_f9_survey_aggregate'))
        ] ?? 0
      const auditOrder = tx.auditLog.create.mock.invocationCallOrder[0] ?? 0
      expect(scopeOrder).toBeGreaterThan(0)
      expect(aggregateOrder).toBeGreaterThan(scopeOrder)
      expect(auditOrder).toBeGreaterThan(aggregateOrder)
    })

    it('abuse: the function guard denial (42501) is a 403 and writes no audit row', async () => {
      const { service, tx } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { meta: { code: '42501' } },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        service.export(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 403 })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    it('sad: a statement timeout on the aggregate is a 503, never an empty or partial view', async () => {
      const { service, tx } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { meta: { code: '57014' } },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.descriptive(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.export(actor('PROGRAM_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    it('sad: a statement_timeout is set before the aggregate function runs', async () => {
      const { service, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
        assessmentResults: fivePairs(),
      })
      await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      const timeout = sqlCalls.findIndex((sql) => sql.includes("set_config('statement_timeout'"))
      const aggregate = sqlCalls.findIndex((sql) => sql.includes('p10_f9_survey_aggregate'))
      expect(timeout).toBeGreaterThanOrEqual(0)
      expect(aggregate).toBeGreaterThan(timeout)
    })

    it('sad: a malformed aggregate from the database is a 503, never a fabricated view', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        surveyAggregate: { excludedRecords: 0, groups: [{ activityId: null, pairs: 'x' }] },
        timelineAggregate: { activities: {}, milestones: {} },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.descriptive(actor('PROGRAM_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
    })

    it('abuse: suppression still runs in the API on the unsuppressed aggregate (3 pairs are suppressed)', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        surveyAggregate: {
          excludedRecords: 1,
          groups: [
            {
              activityId: null,
              pairs: 3,
              sumPre: 120,
              sumPost: 180,
              improved: 3,
              same: 0,
              declined: 0,
            },
          ],
        },
      })
      const result = await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      expect(result).toMatchObject({
        excludedRecords: 1,
        overall: {
          pairs: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
          meanPre: { state: 'SUPPRESSED', value: null },
        },
      })
    })

    it('parity: the SQL aggregate mirror reproduces the rule-engine activity observation', async () => {
      const cases = [
        [activityFixture('COMPLETED', '2026-02-01'), activityFixture('IN_PROGRESS', '2026-01-01')],
        [activityFixture('IN_PROGRESS', null), activityFixture('COMPLETED', null)],
        [activityFixture('CANCELLED', '2020-01-01'), activityFixture('NOT_STARTED', '2026-12-31')],
        [activityFixture('IN_PROGRESS', '2026-12-30', true)],
        [],
      ]
      for (const activities of cases) {
        const { service } = harness(releasedSaddd, '2026-12-31', {
          activities,
          milestones: [],
          projectStatus: 'ONGOING',
        })
        const result = (await service.descriptive(actor('PROGRAM_MANAGER'), {
          projectId: projectA,
          view: 'timeline',
        })) as { activityCompletionPercent: MetricCell; activityOverdueCount: MetricCell }
        const reportingDate = businessCalendarDate(new Date(), 'Asia/Manila')
        const members = activities.map((a, index) => ({
          id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          organizationId: orgA,
          projectId: projectA,
          revision: '1',
          status: a.status,
          archived: a.archivedAt !== null,
          plannedEndDate: a.plannedEndDate ? a.plannedEndDate.toISOString().slice(0, 10) : null,
        }))
        const base = {
          scope: { organizationId: orgA, projectId: projectA },
          conditionId: 'analytics-timeline-view',
          asOf: new Date().toISOString(),
          reportingDate,
          populationRevision: '1',
          activities: members,
        }
        const completion = activityObservation({
          ...base,
          metric: 'ACTIVITY_COMPLETION_PERCENT',
        }).cell
        const overdue = activityObservation({ ...base, metric: 'ACTIVITY_OVERDUE_COUNT' }).cell
        const remap = (cell: MetricCell) =>
          cell.reason === 'EMPTY_POPULATION' ? { ...cell, reason: 'NO_ACTIVITIES' } : cell
        expect(result.activityCompletionPercent).toEqual(remap(completion))
        expect(result.activityOverdueCount).toEqual(remap(overdue))
      }
    })
  })

  it('sad: an unexpected export retrieval failure is a 503, never a 500 or a client error', async () => {
    const { service, tx } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: [],
      aggregateError: {},
    })
    const identity = actor('PROJECT_MANAGER')
    await expect(
      service.export(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('happy: survey and timeline export as audited CSV with the suppression marker preserved', async () => {
    const rows = [...pairedRows('e1', 40, 60)]
    const { service, tx } = harness(releasedSaddd, '2026-06-30', { assessmentResults: rows })
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const csv = result.bytes.toString('utf8')
    expect(csv).toContain('"SURVEY"')
    expect(csv).toMatch(/"SUPPRESSED","","",?"SMALL_CELL"/)
    // One export audit row per export, carrying contract version, view and row count
    // (overall plus one per byActivity group for survey; six metrics for timeline).
    const survey = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const exported = () =>
      tx.auditLog.create.mock.calls
        .map((call: unknown[]) => (call[0] as { data: { action: string; changes: unknown } }).data)
        .filter((data: { action: string }) => data.action === 'ANALYTICS_DESCRIPTIVE_EXPORTED')
    expect(exported()).toHaveLength(1)
    expect(exported()[0].changes).toMatchObject({
      contractVersion: 'analytics.descriptive.survey.v1',
      format: 'CSV',
      view: 'survey',
      rowCount: (survey as { byActivity: unknown[] }).byActivity.length + 1,
    })
    const timelineResult = await service.export(identity, { projectId: projectA, view: 'timeline' })
    const timelineCsv = timelineResult.bytes.toString('utf8')
    expect(timelineCsv).toContain('"TIMELINE"')
    expect(exported()).toHaveLength(2)
    expect(exported()[1].changes).toMatchObject({
      contractVersion: 'analytics.descriptive.timeline.v1',
      format: 'CSV',
      view: 'timeline',
      rowCount: 6,
    })
  })

  it('abuse: CSV export withholds a whole byActivity breakdown when a group would leak a sub-count by subtraction', async () => {
    // act-A: 5 improved / 2 declined (7 pairs, visible on its own); act-B: 2 improved / 3
    // declined (5 pairs, its own group suppressed) -- without cross-group suppression on
    // improved/declined, act-B's split is recoverable as overall (7 improved / 5 declined)
    // minus act-A (5 / 2). The CSV must withhold every byActivity row, not just act-B's.
    const rows = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].flatMap((id) =>
        pairedRows(id, 40, 70, { activityId: 'act-A' }),
      ),
      ...['a6', 'a7'].flatMap((id) => pairedRows(id, 70, 40, { activityId: 'act-A' })),
      ...['b1', 'b2'].flatMap((id) => pairedRows(id, 40, 70, { activityId: 'act-B' })),
      ...['b3', 'b4', 'b5'].flatMap((id) => pairedRows(id, 70, 40, { activityId: 'act-B' })),
    ]
    const { service } = harness(releasedSaddd, '2026-06-30', { assessmentResults: rows })
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const csv = result.bytes.toString('utf8')
    const activityLines = csv.split('\r\n').filter((line) => line.startsWith('"SURVEY","act-'))
    expect(activityLines.length).toBeGreaterThan(0)
    for (const line of activityLines) {
      expect(line).toMatch(/"SUPPRESSED","","",?"SMALL_CELL"/)
    }
  })
})
