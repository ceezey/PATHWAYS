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
  descriptiveAnalyticsSchema,
} from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function harness(
  sadddRaw: unknown = releasedSaddd,
  projectEnd = '2026-06-30',
  options: {
    assessmentResults?: unknown[]
    activities?: unknown[]
    milestones?: unknown[]
    projectStatus?: string
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
    assessmentResult: {
      findMany: vi.fn(async (_args: unknown) => options.assessmentResults ?? []),
    },
    projectActivity: {
      findMany: vi.fn(async (_args: unknown) => options.activities ?? []),
    },
    projectMilestone: {
      findMany: vi.fn(async (_args: unknown) => options.milestones ?? []),
    },
    $queryRaw: vi.fn(async (query: { sql?: string } | TemplateStringsArray) => {
      const sql = 'sql' in query && typeof query.sql === 'string' ? query.sql : ''
      sqlCalls.push(sql)
      if (sql.includes('p06_saddd')) return [{ data: sadddRaw }]
      if (sql.includes('p06_monitoring')) return [{ data: monitoringRaw }]
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
      expect.objectContaining({ data: expect.objectContaining({ action: 'ANALYTICS_DESCRIPTIVE_VIEWED' }) }),
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

  it('happy: computes survey pairing from a select that carries no beneficiary identity', async () => {
    const rows = ['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pairedRows(id, 40, 60))
    const { service, tx } = harness(releasedSaddd, '2026-06-30', { assessmentResults: rows })
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
    const select = (
      tx.assessmentResult.findMany.mock.calls[0]?.[0] as { select: Record<string, boolean> }
    ).select
    expect(select).toEqual({
      id: true,
      type: true,
      score: true,
      maximumScore: true,
      assessmentDate: true,
      enrollmentId: true,
      activityId: true,
    })
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

  it('happy: computes timeline adherence from the complete unpaginated activity/milestone population', async () => {
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
      { status: 'COMPLETED', targetDate: new Date('2026-01-10'), completionDate: new Date('2026-01-10') },
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
    // Fetches cap+1 (max 1000) with a deterministic orderBy to detect truncation; never UI-paginated.
    expect((tx.projectActivity.findMany.mock.calls[0]?.[0] as { take: number }).take).toBe(1001)
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
    const identity = actor('SYSTEM_ADMINISTRATOR')
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
    const identity = actor('SYSTEM_ADMINISTRATOR', { organizationId: orgB })
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

  it('sad: survey fails closed (POPULATION_LIMIT_EXCEEDED) rather than silently truncating at the row cap', async () => {
    const atCap = Array.from({ length: 5000 / 2 }, (_, index) =>
      pairedRows(`e${index}`, 40, 60),
    ).flat()
    const overCap = [...atCap, ...pairedRows('e-extra', 40, 60)]
    const { service: atCapService } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: atCap,
    })
    const atCapResult = await atCapService.descriptive(
      actor('MONITORING_AND_EVALUATION_OFFICER'),
      { projectId: projectA, periodStart: '2026-01-01', periodEnd: '2026-12-31', view: 'survey' },
    )
    expect(atCapResult).toMatchObject({ overall: { pairs: { state: 'AVAILABLE' } } })

    const { service: overCapService, tx } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: overCap,
    })
    const overCapResult = await overCapService.descriptive(
      actor('MONITORING_AND_EVALUATION_OFFICER'),
      { projectId: projectA, periodStart: '2026-01-01', periodEnd: '2026-12-31', view: 'survey' },
    )
    expect(overCapResult).toMatchObject({
      overall: { pairs: { state: 'MISSING', reason: 'POPULATION_LIMIT_EXCEEDED' } },
      byActivity: [],
    })
    expect(
      (tx.assessmentResult.findMany.mock.calls[0]?.[0] as { take: number }).take,
    ).toBe(5001)
  })

  it('sad: timeline fails closed (POPULATION_LIMIT_EXCEEDED) rather than silently truncating at the row cap', async () => {
    const activityUuid = (index: number) =>
      `50000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
    const activity = (index: number) => ({
      id: activityUuid(index),
      organizationId: orgA,
      projectId: projectA,
      status: 'COMPLETED',
      archivedAt: null,
      plannedEndDate: new Date('2026-02-01'),
    })
    const atCap = Array.from({ length: 1000 }, (_, index) => activity(index))
    const overCap = [...atCap, activity(1000)]
    const { service: atCapService } = harness(releasedSaddd, '2026-06-30', {
      activities: atCap,
      milestones: [],
      projectStatus: 'ONGOING',
    })
    const atCapResult = await atCapService.descriptive(
      actor('MONITORING_AND_EVALUATION_OFFICER'),
      { projectId: projectA, view: 'timeline' },
    )
    expect(atCapResult).toMatchObject({ activityCompletionPercent: { state: 'AVAILABLE' } })

    const { service: overCapService } = harness(releasedSaddd, '2026-06-30', {
      activities: overCap,
      milestones: [],
      projectStatus: 'ONGOING',
    })
    const overCapResult = await overCapService.descriptive(
      actor('MONITORING_AND_EVALUATION_OFFICER'),
      { projectId: projectA, view: 'timeline' },
    )
    expect(overCapResult).toMatchObject({
      activityCompletionPercent: { state: 'MISSING', reason: 'POPULATION_LIMIT_EXCEEDED' },
      activityOverdueCount: { state: 'MISSING', reason: 'POPULATION_LIMIT_EXCEEDED' },
    })
  })

  it('sad: timeline fails closed on milestoneOnTimePercent alone when only milestones exceed the cap (activities stay within it)', async () => {
    const milestone = (index: number) => ({
      status: 'COMPLETED' as const,
      targetDate: new Date('2026-02-01'),
      completionDate: new Date('2026-02-01'),
    })
    const overCapMilestones = Array.from({ length: 1001 }, (_, index) => milestone(index))
    const { service } = harness(releasedSaddd, '2026-06-30', {
      activities: [],
      milestones: overCapMilestones,
      projectStatus: 'ONGOING',
    })
    const result = await service.descriptive(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
      view: 'timeline',
    })
    expect(result).toMatchObject({
      milestoneOnTimePercent: { state: 'MISSING', reason: 'POPULATION_LIMIT_EXCEEDED' },
    })
    // Activities were not truncated, so the activity metrics are unaffected.
    expect(result).not.toMatchObject({
      activityCompletionPercent: { reason: 'POPULATION_LIMIT_EXCEEDED' },
    })
  })

  it('sad: an unexpected export retrieval failure is a 503, never a 500 or a client error', async () => {
    const { service, tx } = harness(releasedSaddd, '2026-06-30', { assessmentResults: [] })
    tx.assessmentResult.findMany.mockRejectedValueOnce(new Error('connection reset'))
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
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ANALYTICS_DESCRIPTIVE_EXPORTED',
          changes: expect.objectContaining({ view: 'survey' }),
        }),
      }),
    )
    const timelineResult = await service.export(identity, { projectId: projectA, view: 'timeline' })
    const timelineCsv = timelineResult.bytes.toString('utf8')
    expect(timelineCsv).toContain('"TIMELINE"')
  })

  it('abuse: CSV export withholds a whole byActivity breakdown when a group would leak a sub-count by subtraction', async () => {
    // act-A: 5 improved / 5 declined (visible on its own); act-B: 2 improved / 3
    // declined (its own group suppressed) -- without cross-group suppression on
    // improved/declined, act-B's split is recoverable as overall (7/8) minus act-A
    // (5/5). The CSV must withhold every byActivity row, not just act-B's.
    const rows = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].flatMap((id) => pairedRows(id, 40, 70, { activityId: 'act-A' })),
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
