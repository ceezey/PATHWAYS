import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
type CanonicalRole = keyof typeof rolePermissions
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import { type MetricCell, descriptiveAnalyticsSchema } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { DashboardsService } from './dashboards.service'
import { descriptiveAnalyticsCsv } from './descriptive-analytics'

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

function harness(sadddRaw: unknown = releasedSaddd, projectEnd = '2026-06-30') {
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
          ? { ...found, startDate: new Date('2026-01-01'), endDate: new Date(projectEnd) }
          : null
      }),
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
    const result = await service.descriptive(actor('MONITORING_AND_EVALUATION_OFFICER'), {
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
    const result = await service.descriptive(identity, { projectId: projectA })
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
    const result = await service.descriptive(actor('GRANT_MANAGER'), { projectId: projectA })
    const sex = result.distributions.filter((row) => row.section === 'SADDD_SEX')
    expect(sex.map((row) => row.share)).toEqual([null, null])
  })

  it('sad: an open project period omits SADDD instead of calling the release', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2099-12-31')
    const result = await service.descriptive(actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(result.sadddReleaseState).toBe('UNAVAILABLE')
    expect(result.distributions.some((row) => row.section.startsWith('SADDD_'))).toBe(false)
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(false)
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
    expect(tx.auditLog.create).not.toHaveBeenCalled()
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
