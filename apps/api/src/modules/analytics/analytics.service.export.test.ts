import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardsService } from '../dashboards/dashboards.service'
import { AnalyticsService } from './analytics.service'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))
vi.mock('@app/common/audit/write-audit-log', () => ({ writeAuditLog: vi.fn() }))

const projectId = '20000000-0000-4000-8000-00000000000a'
const cell = { state: 'MISSING', value: null, reason: 'NO_DATA' }
const identity = {
  id: 'u1',
  userId: 'u1',
  organizationId: 'o1',
  roles: ['PROJECT_MANAGER'],
  permissions: [...rolePermissions.PROJECT_MANAGER],
  assignedProjectIds: [projectId],
} as unknown as ApplicationIdentity
const timelineFields = [
  'elapsedPercent',
  'remainingDays',
  'overdueDays',
  'activityCompletionPercent',
  'activityOverdueCount',
  'milestoneOnTimePercent',
]

type Stubs = Record<'compute' | 'computeSurvey' | 'computeTimeline', unknown>

function harness() {
  const service = new AnalyticsService({} as never, {} as DashboardsService)
  const stubs: Stubs = {
    compute: {
      projectId,
      contractVersion: 'analytics.descriptive.v1',
      monitoringPeriod: { periodStart: '2026-01-01', periodEnd: '2026-03-31' },
      sadddReleaseState: 'RELEASED',
      counts: [],
      distributions: [],
      indicatorSummaries: [],
    },
    computeSurvey: {
      projectId,
      contractVersion: 'analytics.descriptive.survey.v1',
      period: { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
      overall: {
        key: 'OVERALL',
        label: 'All',
        ...Object.fromEntries(
          ['pairs', 'meanPre', 'meanPost', 'meanChange', 'improved', 'same', 'declined'].map(
            (k) => [k, cell],
          ),
        ),
      },
      byActivity: [],
    },
    computeTimeline: {
      projectId,
      contractVersion: 'analytics.descriptive.timeline.v1',
      reportingDate: '2026-07-15',
      ...Object.fromEntries(timelineFields.map((field) => [field, cell])),
    },
  }
  for (const [method, value] of Object.entries(stubs))
    vi.spyOn(
      service as unknown as Record<string, () => Promise<unknown>>,
      method,
    ).mockResolvedValue(value)
  return service
}

describe('analytics service export file names', () => {
  beforeEach(() => {
    vi.mocked(withAuthorizedOperation).mockImplementation((async (
      _prisma,
      who,
      _permission,
      work,
    ) => work({} as never, who)) as typeof withAuthorizedOperation)
  })

  it.each([
    ['descriptive', {}, 'descriptive-analytics', '2026-03-31'],
    ['survey', { view: 'survey' }, 'survey-analytics', '2026-06-30'],
    ['timeline', { view: 'timeline' }, 'timeline-analytics', '2026-07-15'],
  ])(
    'names the %s export by view, project and period end for every format',
    async (_name, view, base, date) => {
      const service = harness()
      const extensions = { CSV: 'csv', XLSX: 'xlsx', XLS: 'xls', PDF: 'pdf' }
      for (const [format, extension] of Object.entries(extensions)) {
        const result = await service.export(identity, { projectId, ...view, format })
        expect(result.fileName).toBe(`${base}-${projectId}-${date}.${extension}`)
      }
    },
  )
})
