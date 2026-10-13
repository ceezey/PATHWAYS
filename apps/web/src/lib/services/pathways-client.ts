import {
  type SourceMutationContext,
  ensureSourceInvalidationSubscription,
  sourceMutationTickets,
} from './source-mutation'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type {
  AuthorizeExistingUserInput,
  RoleDashboardViewModel,
  UpdateAuthorizedUserInput,
  UserRecord,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import {
  type DashboardActionCounts,
  type DashboardQuery,
  type DescriptiveAnalytics,
  type DescriptiveAnalyticsQuery,
  type MonitoringDashboard,
  type RoleOverview,
  type SadddDashboard,
  type SadddQuery,
  type SurveyAnalytics,
  type TimelineAnalytics,
  dashboardActionCountsSchema,
  dashboardQuerySchema,
  descriptiveAnalyticsQuerySchema,
  descriptiveAnalyticsSchema,
  formatMetricCell,
  monitoringDashboardSchema,
  roleCodeByName,
  roleOverviewSchema,
  sadddDashboardSchema,
  sadddQuerySchema,
  surveyAnalyticsSchema,
  timelineAnalyticsSchema,
} from '@pathways/shared'
import { z } from 'zod'

export interface AssessmentDetail {
  id: string
  projectId: string
  activityId: string | null
  enrollmentId: string | null
  type: 'PRE_TEST' | 'POST_TEST' | 'OUTCOME_SURVEY' | 'FEEDBACK_SURVEY' | 'OTHER'
  score: string
  maximumScore: string
  assessmentDate: string
  recordedAt: string
  beneficiary: { id: string; code: string } | null
}

const assessmentTypes = new Set([
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_SURVEY',
  'FEEDBACK_SURVEY',
  'OTHER',
])
const isNullableString = (value: unknown) => value === null || typeof value === 'string'

export type AssessmentSummary = Omit<
  AssessmentDetail,
  'projectId' | 'enrollmentId' | 'beneficiary'
> & {
  stageId: string | null
}

function parseAssessmentSummaries(value: unknown): AssessmentSummary[] {
  const invalid = () => new PathwaysClientError('Invalid assessment response.', 'network')
  if (!Array.isArray(value) || value.length > 100) throw invalid()
  return value.map((item) => {
    const row = item as Record<string, unknown> | null
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isNullableString(row.activityId) ||
      !isNullableString(row.stageId) ||
      !assessmentTypes.has(row.type as string) ||
      typeof row.score !== 'string' ||
      typeof row.maximumScore !== 'string' ||
      typeof row.assessmentDate !== 'string' ||
      typeof row.recordedAt !== 'string'
    )
      throw invalid()
    return {
      id: row.id,
      type: row.type as AssessmentDetail['type'],
      activityId: row.activityId as string | null,
      stageId: row.stageId as string | null,
      score: row.score,
      maximumScore: row.maximumScore,
      assessmentDate: row.assessmentDate,
      recordedAt: row.recordedAt,
    }
  })
}

interface PathwaysClient {
  getBeneficiaryAssessments(
    projectId: string,
    enrollmentId: string,
    signal?: AbortSignal,
  ): Promise<AssessmentSummary[]>
  getMonitoringDashboard(query?: DashboardQuery): Promise<MonitoringDashboard>
  getDashboardActionCounts(): Promise<DashboardActionCounts>
  getRoleOverview(): Promise<RoleOverview>
  getSadddDashboard(query: SadddQuery): Promise<SadddDashboard>
  getDescriptiveAnalytics(query: DescriptiveAnalyticsQuery): Promise<DescriptiveAnalytics>
  getSurveyAnalytics(query: DescriptiveAnalyticsQuery): Promise<SurveyAnalytics>
  getTimelineAnalytics(query: DescriptiveAnalyticsQuery): Promise<TimelineAnalytics>
  getUsers(signal?: AbortSignal): Promise<UserRecord[]>
  authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>
  updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>
  getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel>
}

class BackendReadyPathwaysClient implements PathwaysClient {
  async getBeneficiaryAssessments(
    projectId: string,
    enrollmentId: string,
    signal?: AbortSignal,
  ): Promise<AssessmentSummary[]> {
    return parseAssessmentSummaries(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/evaluation/assessments?enrollmentId=${encodeURIComponent(enrollmentId)}`,
        { signal },
      ),
    )
  }

  async getDashboardActionCounts(): Promise<DashboardActionCounts> {
    return dashboardActionCountsSchema.parse(await requestFoundation('/dashboards/action-counts'))
  }

  async getRoleOverview(): Promise<RoleOverview> {
    return roleOverviewSchema.parse(await requestFoundation('/dashboards/role-overview'))
  }

  async getMonitoringDashboard(query: DashboardQuery = {}): Promise<MonitoringDashboard> {
    return monitoringDashboardSchema.parse(
      await requestFoundation(`/dashboards/monitoring${monitoringQuery(query)}`),
    )
  }

  async getSadddDashboard(query: SadddQuery): Promise<SadddDashboard> {
    const { projectId } = sadddQuerySchema.parse(query)
    return sadddDashboardSchema.parse(
      await requestFoundation(`/dashboards/saddd?projectId=${encodeURIComponent(projectId)}`),
    )
  }

  async getDescriptiveAnalytics(query: DescriptiveAnalyticsQuery): Promise<DescriptiveAnalytics> {
    return descriptiveAnalyticsSchema.parse(
      await requestFoundation(`/analytics/descriptive${descriptiveAnalyticsSearch(query)}`),
    )
  }

  async getSurveyAnalytics(query: DescriptiveAnalyticsQuery): Promise<SurveyAnalytics> {
    return surveyAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'survey' })}`,
      ),
    )
  }

  async getTimelineAnalytics(query: DescriptiveAnalyticsQuery): Promise<TimelineAnalytics> {
    return timelineAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'timeline' })}`,
      ),
    )
  }

  async getUsers(signal?: AbortSignal): Promise<UserRecord[]> {
    return requestFoundation('/users', { signal }).then(parseUsers)
  }

  async authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation('/users/authorize-existing', {
        method: 'POST',
        body: JSON.stringify({
          authUserId: input.authUserId,
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          projectIds: input.projectIds,
        }),
      })) as ApiUser,
    )
  }

  async updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          accountStatus: input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED',
          projectIds: input.projectIds,
        }),
      })) as ApiUser,
    )
  }

  async getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel> {
    // Role changes labels only. Authority and all values come from the current authenticated API request.
    const result: MonitoringDashboard = monitoringDashboardSchema.parse(
      await requestFoundation('/dashboards/home'),
    )

    return {
      role,
      greetingName: role,
      heading: 'Project monitoring overview',
      summary: `${result.periodStart} to ${result.periodEnd}; ${result.businessTimeZone}. Current operational states; no automated success rating.`,
      primaryAction: {
        id: 'monitoring',
        label: 'Open monitoring',
        kind: 'navigate',
        href: '/analytics',
      },
      metrics: [
        {
          id: 'projects',
          label: 'Authorized projects',
          value: String(result.scopeProjectCount),
          helperText: 'Server-derived current project scope.',
        },
        {
          id: 'participation',
          label: 'Participation records',
          value: formatMetricCell(result.participationRecords),
          helperText: 'Committed records, not a count of people.',
        },
        {
          id: 'attending',
          label: 'Distinct attending individuals',
          value: formatMetricCell(result.attendingIndividuals),
          helperText: 'Present/completed attendance; deduplicated across projects.',
        },
        {
          id: 'enrolled',
          label: 'Enrolled individuals',
          value: formatMetricCell(result.enrolledIndividuals),
          helperText: 'Enrollment overlaps this period; privacy suppression applies.',
        },
      ],
      sections: [
        {
          id: 'projects',
          title: 'Authorized project workspaces',
          emptyText: 'No projects are currently in your authorized scope.',
          items: result.projects.map((project) => ({
            id: project.id,
            title: project.title,
            description: project.code,
            href: `/projects/${project.id}`,
          })),
        },
      ],
    }
  }
}

/** Validated query string shared by the descriptive read and its CSV export. */
export function descriptiveAnalyticsSearch(query: DescriptiveAnalyticsQuery): string {
  const parsed = descriptiveAnalyticsQuerySchema.parse(query)
  const params = new URLSearchParams({ projectId: parsed.projectId })
  if (parsed.periodStart && parsed.periodEnd) {
    params.set('periodStart', parsed.periodStart)
    params.set('periodEnd', parsed.periodEnd)
  }
  if (parsed.view) params.set('view', parsed.view)
  return `?${params.toString()}`
}

const analyticsExportPreviewSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  totalRows: z.number().int().nonnegative(),
})

/** First rows of the aggregate table a descriptive export would contain, with suppression applied. */
export async function getAnalyticsExportPreview(query: DescriptiveAnalyticsQuery) {
  return analyticsExportPreviewSchema.parse(
    await requestFoundation(
      `/analytics/descriptive/export/preview${descriptiveAnalyticsSearch(query)}`,
    ),
  )
}

export const pathwaysClient: PathwaysClient = new BackendReadyPathwaysClient()

interface ApiUser {
  id: string
  authUserId: string | null
  name: string
  email: string
  role: PathwaysRole
  accountStatus: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED' | 'ARCHIVED'
  projectIds: string[]
  projectAccess: string[]
  createdAt: string
  lastActiveAt?: string
}

const sourceTickets = sourceMutationTickets
ensureSourceInvalidationSubscription()
/** Only existing owned source operations are eligible; proof and project creation are excluded. */
export async function recoverSourceMutation(context: SourceMutationContext, operationKey: string) {
  const match =
    /^(POST|PATCH):\/projects\/([0-9a-f-]{36})(?:\/(activities|indicators)(?:\/([0-9a-f-]{36})(?:\/(transition|archive|measurements|updates\/([0-9a-f-]{36})\/review))?)?)?$/.exec(
      operationKey,
    )
  if (!match) throw new PathwaysClientError('This request does not support recovery.', 'invalid')
  const [, method, projectId, resource, sourceId, action, updateId] = match
  return sourceTickets.recover(context, operationKey, async (captured) => {
    const operation =
      !resource && method === 'PATCH'
        ? 'PROJECT_UPDATE'
        : resource === 'activities'
          ? !sourceId && method === 'POST'
            ? 'ACTIVITY_CREATE'
            : action === 'transition'
              ? captured.body.status === 'IN_PROGRESS'
                ? 'ACTIVITY_START'
                : captured.body.status === 'CANCELLED'
                  ? 'ACTIVITY_CANCEL'
                  : null
              : updateId
                ? 'ACTIVITY_REVIEW'
                : !action && method === 'PATCH'
                  ? 'ACTIVITY_UPDATE'
                  : null
          : resource === 'indicators'
            ? !sourceId && method === 'POST'
              ? 'INDICATOR_CREATE'
              : action === 'archive'
                ? 'INDICATOR_ARCHIVE'
                : action === 'measurements'
                  ? 'INDICATOR_MEASUREMENT'
                  : !action && method === 'PATCH'
                    ? 'INDICATOR_UPDATE'
                    : null
            : null
    if (!operation)
      throw new PathwaysClientError('This request does not support recovery.', 'invalid')
    if (!context.isCurrent())
      throw new PathwaysClientError('Current recovery ownership is required.', 'unauthorized')
    return requestFoundation(
      `/projects/${projectId}/source-operations/abandon`,
      {
        method: 'POST',
        body: JSON.stringify({
          operation,
          sourceId: sourceId ?? (resource ? null : projectId),
          requestId: captured.requestId,
          body: updateId ? { ...captured.body, updateId } : captured.body,
        }),
      },
      context.isCurrent,
    )
  })
}

function mapUser(user: ApiUser): UserRecord {
  const accountStatus = {
    ACTIVE: 'Active',
    INVITED: 'Invited',
    SUSPENDED: 'Suspended',
    DEACTIVATED: 'Deactivated',
    ARCHIVED: 'Archived',
  } as const
  return {
    ...user,
    accountStatus: accountStatus[user.accountStatus],
    signInMethod: 'Supabase account',
  }
}

function parseUsers(value: unknown) {
  if (!Array.isArray(value) || value.length > 200)
    throw new PathwaysClientError('Invalid user response.', 'network')
  return value.map((row) => mapUser(row as ApiUser))
}

/** Fixed filter allowlist; no role, organization, demographic, formula or field selectors. */
function monitoringQuery(input: DashboardQuery): string {
  const query = dashboardQuerySchema.parse(input)
  const search = new URLSearchParams()

  const allowedKeys = ['projectId', 'programId', 'periodStart', 'periodEnd'] as const

  for (const key of allowedKeys) {
    const value = query[key]

    if (typeof value === 'string') {
      search.set(key, value)
    }
  }

  return search.size ? `?${search.toString()}` : ''
}
