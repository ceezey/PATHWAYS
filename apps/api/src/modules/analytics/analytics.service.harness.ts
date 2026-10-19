import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import {
  type DescriptiveAnalytics,
  type MetricCell,
  hasAtomicPermission,
  rolePermissions,
  surveyAggregateFromRows,
} from '@pathways/shared'
type CanonicalRole = keyof typeof rolePermissions
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import { vi } from 'vitest'
import { DashboardsService } from '../dashboards/dashboards.service'
import { AnalyticsService } from './analytics.service'

export const orgA = '10000000-0000-4000-8000-00000000000a'
export const orgB = '10000000-0000-4000-8000-00000000000b'
export const projectA = '20000000-0000-4000-8000-00000000000a'
export const projectB = '20000000-0000-4000-8000-00000000000b'
export const userId = '30000000-0000-4000-8000-000000000001'

export const projects = [
  { id: projectA, organizationId: orgA, code: 'A', title: 'Synthetic project A' },
  { id: projectB, organizationId: orgB, code: 'B', title: 'Synthetic project B' },
]

export function actor(role: CanonicalRole, overrides: Partial<ApplicationIdentity> = {}) {
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

export const cell = (value: number): MetricCell =>
  value === 0
    ? { state: 'ZERO', value: '0', reason: null }
    : { state: 'AVAILABLE', value: String(value), reason: null }
export const suppressed: MetricCell = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
export const bucket = (key: string, metric: MetricCell) => ({ key, label: key, metric })

const monitoringRaw = {
  activities: [bucket('PLANNED', cell(3)), bucket('COMPLETED', cell(1))],
  milestones: [bucket('ACHIEVED', cell(2)), bucket('PENDING', cell(0))],
  participationRecords: cell(40),
  attendingIndividuals: cell(12),
  enrolledBeneficiaryRecords: cell(15),
  enrolledIndividuals: cell(14),
}
export const releasedSaddd = {
  releaseState: 'RELEASED',
  total: cell(30),
  sex: [bucket('FEMALE', cell(18)), bucket('MALE', cell(12))],
  age: [bucket('10-14', cell(10)), bucket('18-24', cell(20))],
  disability: [bucket('NO', cell(24)), bucket('YES', cell(6))],
  completeness: [],
}
// A 1-4 cell suppresses the whole SADDD table, as p06_saddd returns it.
export const suppressedSaddd = {
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

export function harness(
  sadddRaw: unknown = releasedSaddd,
  projectEnd = '2026-06-30',
  options: {
    assessmentResults?: unknown[]
    activities?: unknown[]
    milestones?: unknown[]
    projectStatus?: string
    projectStart?: string
    /** Overrides what the trusted SQL function returns (instead of deriving it from fixtures). */
    surveyAggregate?: unknown
    timelineAggregate?: unknown
    /** What pathways.p10_f9_timeline_last_completion returns (a Date, as Prisma maps a date column). */
    lastCompletion?: Date | null
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
              startDate: new Date(options.projectStart ?? '2026-01-01'),
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
      if (sql.includes('p10_f9_timeline_last_completion'))
        return [{ data: options.lastCompletion ?? null }]
      if (
        sql.includes('p10_f9_survey_aggregate') ||
        sql.includes('p10_f9_survey_release') ||
        sql.includes('p10_f9_timeline_aggregate')
      ) {
        if (options.aggregateError)
          throw Object.assign(new Error('aggregate failed'), options.aggregateError)
        if (sql.includes('p10_f9_survey_aggregate') || sql.includes('p10_f9_survey_release'))
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
              ...(sql.includes('p10_f9_survey_release')
                ? { releaseState: 'FROZEN', releasedAt: '2026-01-01T00:00:00.000Z' }
                : {}),
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
  const rows = async () => [
    indicator('40000000-0000-4000-8000-000000000001', 'people', cell(10)),
    indicator('40000000-0000-4000-8000-000000000002', 'people', cell(20)),
    indicator('40000000-0000-4000-8000-000000000003', 'sessions', suppressed),
  ]
  const indicators = { readInTransaction: vi.fn(rows), readReleasedInTransaction: vi.fn(rows) }
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

export const exportText = async (service: AnalyticsService, identity: ApplicationIdentity) =>
  (await service.export(identity, { projectId: projectA })).bytes.toString('utf8')

/** The combined (view-less/kpi/participation) payload shape, for tests unrelated to the new views. */
export const descriptive = async (
  service: AnalyticsService,
  identity: ApplicationIdentity,
  input: unknown,
) => (await service.descriptive(identity, input)) as DescriptiveAnalytics

let assessmentIdCounter = 0
export function assessment(overrides: Record<string, unknown> = {}) {
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

export function pairedRows(
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
