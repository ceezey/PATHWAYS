import {
  sensitiveDraftGeneration,
  subscribeSensitiveDraftInvalidation,
} from '@/lib/auth/sensitive-drafts'
import {
  type AutomaticMappingReceipt,
  parseAutomaticMappingReceipt,
} from './automatic-mapping-receipt'
import {
  type SourceMutationContext,
  SourceMutationRecoveryError,
  type SourceMutationResult,
  parseSourceMutationResult,
  sourceMutationTickets,
} from './source-mutation'

import { contextCookieName, decodeWorkspaceContext } from '@/features/auth/workspace-access'
import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type {
  Activity,
  ActivityCapabilities,
  ActivityOverdueExplanation,
  ActivityProofFinalizeResult,
  ActivityProofReservation,
  ActivityProofReservedFile,
  ActivityProofUploadLimits,
  ActivitySummary,
  AlertRecord,
  AnalyticsLocationRecord,
  AssignableProjectOfficer,
  AuthorizeExistingUserInput,
  BeneficiaryFilters,
  BeneficiaryJourneyHistory,
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  BeneficiaryRegistrationContext,
  BeneficiarySadddAggregate,
  BudgetRecord,
  CorrectJourneyEventInput,
  CreateActivityInput,
  CreateProjectInput,
  DigitalFormDefinition,
  DirectFormSubmission,
  DirectFormSubmissionPage,
  EnrollmentJourneyEventInput,
  EvaluationRecord,
  EvidenceList,
  EvidenceRecord,
  ExpenseRecord,
  FormValidationError,
  FormValidationResult,
  ImportBatchDefinition,
  ImportMappingInput,
  ImportRowsPage,
  Indicator,
  JourneyStageConfig,
  ProjectDetail,
  ProjectIndicator,
  ProjectMilestone,
  ProjectStatus,
  ProjectSummary,
  PublicProjectRecord,
  RecommendationOutcomeRecord,
  RecommendationRecord,
  RecordActivityProgressInput,
  RecordOverdueExplanationInput,
  RegisterBeneficiaryInput,
  ReportRecord,
  ReserveActivityProofUploadInput,
  RoleDashboardViewModel,
  RuleDefinition,
  SaveDigitalFormInput,
  SaveMilestoneInput,
  SubmitActivityProofInput,
  SurveyAggregateFilters,
  SurveyAggregateResultSet,
  SurveyFormDefinition,
  TransparencySection,
  UpdateActivityInput,
  UpdateAuthorizedUserInput,
  UpdateBeneficiaryInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UserRecord,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import {
  type CreateIndicatorInput as ApiCreateIndicatorInput,
  type UpdateIndicatorInput as ApiUpdateIndicatorInput,
  type DashboardQuery,
  type DescriptiveAnalytics,
  type DescriptiveAnalyticsQuery,
  type ManualMeasurementInput,
  type MonitoringDashboard,
  type SadddDashboard,
  type SadddQuery,
  type SurveyAnalytics,
  type TimelineAnalytics,
  dashboardQuerySchema,
  descriptiveAnalyticsQuerySchema,
  descriptiveAnalyticsSchema,
  formatMetricCell,
  monitoringDashboardSchema,
  projectIndicatorListSchema,
  projectIndicatorSchema,
  sadddDashboardSchema,
  sadddQuerySchema,
  surveyAnalyticsSchema,
  timelineAnalyticsSchema,
} from '@pathways/shared'
import { type ProjectOverviewMetrics, projectOverviewMetricsSchema } from '@pathways/shared'
import { readPublicProjects } from './public-projects'
type CreateIndicatorInput = Omit<ApiCreateIndicatorInput, 'clientMutationId'>
type UpdateIndicatorInput = Omit<ApiUpdateIndicatorInput, 'clientMutationId'>
import {
  STEP_UP_REQUIRED_CODE,
  announceStepUpRequired,
} from '@/lib/auth/beneficiary-step-up-events'
import { announceAuthorizationDenied, announceWriteCommitted } from './authorized-read-events'
import { parseRegistrationContext } from './registration-context'

const evidenceStatuses = new Set(['Submitted', 'Validated', 'Flagged', 'Approved', 'Returned'])

function evidenceText(value: unknown) {
  if (typeof value !== 'string') throw new Error('invalid_evidence_response')
  return value
}

function evidenceCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error('invalid_evidence_response')
  return value
}

/** Copies only the fields each scope permits, so unexpected detail is never rendered. */
export function parseEvidenceList(value: unknown): EvidenceList {
  const body = value as { scope?: unknown; records?: unknown; activities?: unknown } | null
  if (body?.scope === 'aggregate' && Array.isArray(body.activities)) {
    return {
      scope: 'aggregate',
      activities: body.activities.map((row: Record<string, unknown>) => ({
        activityId: evidenceText(row.activityId),
        activityTitle: evidenceText(row.activityTitle),
        total: evidenceCount(row.total),
        submitted: evidenceCount(row.submitted),
        approved: evidenceCount(row.approved),
        returned: evidenceCount(row.returned),
      })),
    }
  }
  if (body?.scope === 'detail' && Array.isArray(body.records)) {
    return {
      scope: 'detail',
      records: body.records.map((row: Record<string, unknown>) => {
        const status = evidenceText(row.status)
        if (!evidenceStatuses.has(status)) throw new Error('invalid_evidence_response')
        return {
          id: evidenceText(row.id),
          projectId: evidenceText(row.projectId),
          activityId: evidenceText(row.activityId),
          updateId: evidenceText(row.updateId),
          updateUpdatedAt: evidenceText(row.updateUpdatedAt),
          fileName: evidenceText(row.fileName),
          reportTitle: evidenceText(row.reportTitle),
          status: status as EvidenceRecord['status'],
          submitter: evidenceText(row.submitter),
          submittedDate: evidenceText(row.submittedDate),
          previewSummary: evidenceText(row.previewSummary),
        }
      }),
    }
  }
  throw new Error('invalid_evidence_response')
}

export class PathwaysClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'network'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'invalid',
    readonly fieldErrors: FormValidationError[] = [],
    readonly status?: number,
    /** Set when the API requires a recent Beneficiary MFA step-up. */
    readonly stepUpRequired = false,
  ) {
    super(message)
    this.name = 'PathwaysClientError'
  }
}

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

function parseAssessmentDetail(value: unknown): AssessmentDetail {
  const row = value as Record<string, unknown> | null
  const beneficiary = row?.beneficiary as Record<string, unknown> | null | undefined
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    !isNullableString(row.activityId) ||
    !isNullableString(row.enrollmentId) ||
    !assessmentTypes.has(row.type as string) ||
    typeof row.score !== 'string' ||
    typeof row.maximumScore !== 'string' ||
    typeof row.assessmentDate !== 'string' ||
    typeof row.recordedAt !== 'string' ||
    (beneficiary !== null &&
      (typeof beneficiary !== 'object' ||
        typeof beneficiary.id !== 'string' ||
        typeof beneficiary.code !== 'string'))
  )
    throw new PathwaysClientError('Invalid assessment response.', 'network')
  return {
    id: row.id,
    projectId: row.projectId,
    activityId: row.activityId as string | null,
    enrollmentId: row.enrollmentId as string | null,
    type: row.type as AssessmentDetail['type'],
    score: row.score,
    maximumScore: row.maximumScore,
    assessmentDate: row.assessmentDate,
    recordedAt: row.recordedAt,
    beneficiary: beneficiary
      ? { id: beneficiary.id as string, code: beneficiary.code as string }
      : null,
  }
}

export interface PathwaysClient {
  getAssessmentDetail(
    projectId: string,
    assessmentId: string,
    signal?: AbortSignal,
  ): Promise<AssessmentDetail>
  getProjects(signal?: AbortSignal): Promise<ProjectSummary[]>
  getProjectsForRole(role: PathwaysRole): Promise<ProjectSummary[]>
  getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail>
  createProject(input: CreateProjectInput): Promise<ProjectDetail>
  updateProject(
    id: string,
    input: UpdateProjectInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>>
  archiveProject(id: string): Promise<{ id: string; archivedAt: string }>
  updateProjectPeriod(
    id: string,
    endDate: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>>
  getActivityContext(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]>
  getActivities(projectId: string, signal?: AbortSignal): Promise<ActivitySummary[]>
  getActivity(projectId: string, activityId: string, signal?: AbortSignal): Promise<Activity>
  // Assignable Project Officers (feature/project-rbac-ui-and-partners).
  getAssignableProjectOfficers(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<AssignableProjectOfficer[]>
  getProjectOverviewMetrics(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectOverviewMetrics>
  createActivity(
    input: CreateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>>
  updateActivity(
    input: UpdateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>>
  transitionActivity(
    projectId: string,
    activityId: string,
    status: 'IN_PROGRESS' | 'CANCELLED',
    expectedUpdatedAt: string,
    reason?: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>>
  submitActivityProof(
    input: SubmitActivityProofInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>>
  recordActivityProgress(input: RecordActivityProgressInput): Promise<Activity>
  recordOverdueExplanation(input: RecordOverdueExplanationInput): Promise<Activity>
  reviewActivityUpdate(
    projectId: string,
    activityId: string,
    updateId: string,
    decision: 'APPROVE' | 'RETURN',
    reason: string,
    expectedUpdatedAt: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>>
  downloadActivityProof(projectId: string, activityId: string, evidenceId: string): Promise<Blob>
  getMilestones(projectId: string): Promise<ProjectMilestone[]>
  createMilestone(projectId: string, input: SaveMilestoneInput): Promise<ProjectMilestone>
  updateMilestone(
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<ProjectMilestone>
  getEvidence(projectId: string): Promise<EvidenceList>
  getProjectIndicators(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]>
  getProjectIndicator(projectId: string, indicatorId: string): Promise<ProjectIndicator>
  createProjectIndicator(
    projectId: string,
    input: CreateIndicatorInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>>
  updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: UpdateIndicatorInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>>
  recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: ManualMeasurementInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>>
  archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>>
  getMonitoringDashboard(query?: DashboardQuery): Promise<MonitoringDashboard>
  getSadddDashboard(query: SadddQuery): Promise<SadddDashboard>
  getDescriptiveAnalytics(query: DescriptiveAnalyticsQuery): Promise<DescriptiveAnalytics>
  getSurveyAnalytics(query: DescriptiveAnalyticsQuery): Promise<SurveyAnalytics>
  getTimelineAnalytics(query: DescriptiveAnalyticsQuery): Promise<TimelineAnalytics>
  getEvaluation(projectId: string): Promise<EvaluationRecord>
  getExpenses(projectId: string): Promise<ExpenseRecord[]>
  getRecommendationOutcomes(projectId: string): Promise<RecommendationOutcomeRecord[]>
  getTransparencySections(projectId: string): Promise<TransparencySection[]>
  getBeneficiaryRecordsForRole(
    role: PathwaysRole,
    projectId?: string,
    filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]>
  getSurveySubjectPage(
    projectId: string,
    search?: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<{
    items: Array<{ id: string; code: string; displayName: string }>
    nextCursor: string | null
  }>
  getBeneficiaryRecordForRole(
    role: PathwaysRole,
    projectId: string,
    id: string,
  ): Promise<BeneficiaryRecord>
  registerBeneficiary(
    projectId: string,
    input: RegisterBeneficiaryInput,
  ): Promise<BeneficiaryRecord>
  updateBeneficiary(
    projectId: string,
    beneficiaryId: string,
    input: UpdateBeneficiaryInput,
  ): Promise<BeneficiaryRecord>
  archiveBeneficiary(
    projectId: string,
    beneficiaryId: string,
    expectedUpdatedAt: string,
  ): Promise<{ id: string; status: 'ARCHIVED'; archivedAt: string }>
  getBeneficiaryMediaProofForRole(
    role: PathwaysRole,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]>
  getBeneficiarySadddAggregatesForRole(
    role: PathwaysRole,
    query: SadddQuery,
  ): Promise<BeneficiarySadddAggregate>
  getJourneyStages(projectId: string, signal?: AbortSignal): Promise<JourneyStageConfig[]>
  saveJourneyStages(projectId: string, stages: JourneyStageConfig[]): Promise<JourneyStageConfig[]>
  getBeneficiaryJourneyHistory(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryJourneyHistory>
  transitionBeneficiaryJourney(
    projectId: string,
    beneficiaryId: string,
    input: EnrollmentJourneyEventInput,
  ): Promise<{ enrollmentId: string; eventType: string; eventDate: string }>
  correctBeneficiaryJourneyEvent(
    projectId: string,
    beneficiaryId: string,
    eventId: string,
    input: CorrectJourneyEventInput,
  ): Promise<{ id: string }>
  getIndicators(projectId?: string, signal?: AbortSignal): Promise<Indicator[]>
  getBudgets(projectId?: string): Promise<BudgetRecord[]>
  getAlerts(projectId?: string): Promise<AlertRecord[]>
  getAlertsForRole(role: PathwaysRole, projectId?: string): Promise<AlertRecord[]>
  getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]>
  getRecommendations(): Promise<RecommendationRecord[]>
  getRecommendationsForRole(role: PathwaysRole): Promise<RecommendationRecord[]>
  getRules(): Promise<RuleDefinition[]>
  getReports(projectId?: string): Promise<ReportRecord[]>
  getSurveyForms(projectId?: string): Promise<SurveyFormDefinition[]>
  getBeneficiaryRegistrationContext(projectId: string): Promise<BeneficiaryRegistrationContext>
  // cr-pathways-default-registration-form: provision the system default registration form.
  ensureDefaultRegistrationForm(projectId: string): Promise<BeneficiaryRegistrationContext>
  getDigitalForms(projectId: string): Promise<DigitalFormDefinition[]>
  getDigitalForm(projectId: string, formId: string): Promise<DigitalFormDefinition>
  createDigitalForm(projectId: string, input: SaveDigitalFormInput): Promise<DigitalFormDefinition>
  updateDigitalForm(
    projectId: string,
    formId: string,
    input: SaveDigitalFormInput & { expectedUpdatedAt: string },
  ): Promise<DigitalFormDefinition>
  publishDigitalForm(
    projectId: string,
    formId: string,
    expectedUpdatedAt: string,
  ): Promise<DigitalFormDefinition>
  archiveDigitalForm(
    projectId: string,
    formId: string,
    expectedUpdatedAt: string,
  ): Promise<DigitalFormDefinition>
  createDigitalFormVersion(projectId: string, formId: string): Promise<DigitalFormDefinition>
  generateDigitalForm(
    projectId: string,
    input: { templateKey?: string; sourceFormId?: string; code: string; name: string },
  ): Promise<DigitalFormDefinition>
  validateDigitalFormValues(
    projectId: string,
    formId: string,
    values: Record<string, unknown>,
  ): Promise<FormValidationResult>
  saveDirectSubmission(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
    values: Record<string, unknown>,
    beneficiaryId?: string,
  ): Promise<DirectFormSubmission>
  listDirectSubmissions(
    projectId: string,
    formId: string,
    offset?: number,
    limit?: number,
  ): Promise<DirectFormSubmissionPage>
  getDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
  ): Promise<DirectFormSubmission>
  getDirectSubmissionByClientId(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ): Promise<DirectFormSubmission>
  updateDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
    values: Record<string, unknown>,
  ): Promise<DirectFormSubmission>
  validateDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormValidationResult>
  submitDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
  ): Promise<DirectFormSubmission>
  getImportBatches(projectId: string): Promise<ImportBatchDefinition[]>
  getImportBatch(projectId: string, batchId: string): Promise<ImportBatchDefinition>
  getImportRows(projectId: string, batchId: string): Promise<ImportRowsPage>
  uploadImport(
    projectId: string,
    formId: string,
    clientImportId: string,
    file: File,
  ): Promise<ImportBatchDefinition>
  resumeImportUpload(projectId: string, batchId: string): Promise<ImportBatchDefinition>
  automaticImportMapping(
    projectId: string,
    batchId: string,
    expectedMappingRevision: 0 | 1,
  ): Promise<AutomaticMappingReceipt>
  saveImportMapping(
    projectId: string,
    batchId: string,
    expectedMappingRevision: number,
    mappings: ImportMappingInput[],
  ): Promise<ImportBatchDefinition>
  validateImport(
    projectId: string,
    batchId: string,
    expectedMappingRevision: number,
  ): Promise<ImportBatchDefinition>
  processImport(
    projectId: string,
    batchId: string,
    expectedValidationRevision: number,
  ): Promise<ImportBatchDefinition>
  getSurveyAggregateResults(filters?: SurveyAggregateFilters): Promise<SurveyAggregateResultSet[]>
  getPublicProjects(): Promise<PublicProjectRecord[]>
  getPublicProject(id: string): Promise<PublicProjectRecord>
  getUsers(signal?: AbortSignal): Promise<UserRecord[]>
  authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>
  updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>
  getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel>

  // --- Direct-upload activity proof (cr-pathways-activity-progress-media). New section: do not
  // reorder or reformat the rest of this interface when editing these members. ---
  getActivityProofUploadLimits(projectId: string): Promise<ActivityProofUploadLimits>
  reserveActivityProofUpload(
    input: ReserveActivityProofUploadInput,
  ): Promise<ActivityProofReservation>
  uploadActivityProofFile(uploadUrl: string, file: File): Promise<void>
  finalizeActivityProofFile(
    projectId: string,
    activityId: string,
    updateId: string,
    evidenceId: string,
  ): Promise<ActivityProofFinalizeResult>
}

const backendNotConfigured = (operation: string) =>
  new PathwaysClientError(
    `${operation} is not available because its backend integration is not configured.`,
    'not_configured',
  )

/**
 * Frontend integration boundary used while domain API endpoints are still being implemented.
 *
 * List reads deliberately contain no records. Record reads and mutations reject explicitly so a
 * caller cannot mistake browser state for persisted data. Replace methods here only when the
 * corresponding real endpoint exists.
 */
class BackendReadyPathwaysClient implements PathwaysClient {
  async getAssessmentDetail(
    projectId: string,
    assessmentId: string,
    signal?: AbortSignal,
  ): Promise<AssessmentDetail> {
    return parseAssessmentDetail(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/evaluation/assessments/${encodeURIComponent(assessmentId)}`,
        { signal },
      ),
    )
  }
  async getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
    return requestFoundation('/projects', { signal }).then(parseProjects)
  }

  async getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]> {
    return this.getProjects()
  }

  async getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
    return mapProject(
      (await requestFoundation(`/projects/${encodeURIComponent(id)}`, { signal })) as ApiProject,
    )
  }

  async createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    const status = apiProjectStatus(input.status)
    return mapProject(
      (await requestFoundation('/projects', {
        method: 'POST',
        body: JSON.stringify({ ...input, status }),
      })) as ApiProject,
    )
  }

  async updateProject(
    id: string,
    input: UpdateProjectInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(id)}`,
      'PATCH',
      { ...input, status: apiProjectStatus(input.status) },
      context,
      (value) => mapProject(value as ApiProject),
    )
  }

  async archiveProject(id: string): Promise<{ id: string; archivedAt: string }> {
    return (await requestFoundation(`/projects/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    })) as { id: string; archivedAt: string }
  }

  async updateProjectPeriod(
    id: string,
    endDate: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>> {
    const path = `/projects/${encodeURIComponent(id)}`
    const current = (await requestFoundation(path)) as ApiProject
    return requestSourceMutation(
      path,
      'PATCH',
      {
        code: current.code,
        title: current.title,
        description: current.description ?? undefined,
        objectives: current.objectives ?? undefined,
        implementationArea: current.implementationArea ?? undefined,
        startDate: current.startDate,
        endDate,
        status: current.status,
        programId: current.programId ?? undefined,
        expectedUpdatedAt: current.updatedAt,
      },
      context,
      (value) => mapProject(value as ApiProject),
    )
  }

  async getActivityContext(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]> {
    const rows = await requestFoundation(
      `/projects/${encodeURIComponent(projectId)}/activities/context`,
      { signal },
    )
    if (
      !Array.isArray(rows) ||
      rows.length > 100 ||
      rows.some(
        (row) =>
          !row ||
          typeof row.id !== 'string' ||
          typeof row.title !== 'string' ||
          typeof row.journeyStageId !== 'string',
      )
    ) {
      throw new PathwaysClientError('Invalid activity context response.', 'network')
    }
    return rows.map((row) => ({ id: row.id, title: row.title, journeyStageId: row.journeyStageId }))
  }

  async getActivities(projectId: string, signal?: AbortSignal): Promise<ActivitySummary[]> {
    return requestFoundation(`/projects/${encodeURIComponent(projectId)}/activities`, {
      signal,
    }).then(parseActivitySummaries)
  }

  async getActivity(
    projectId: string,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}`,
        { signal },
      ),
    )
  }

  // Assignable Project Officers (feature/project-rbac-ui-and-partners). Replaces GET /users
  // in the activity editor; the response is exactly userId and displayName, at most 50 rows.
  async getAssignableProjectOfficers(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<AssignableProjectOfficer[]> {
    return parseAssignableProjectOfficers(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/assignable-officers`,
        { signal },
      ),
    )
  }

  // Project Overview metrics (feature/project-data-loading).
  async getProjectOverviewMetrics(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectOverviewMetrics> {
    const parsed = projectOverviewMetricsSchema.safeParse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/overview-metrics`, {
        signal,
      }),
    )
    if (!parsed.success)
      throw new PathwaysClientError('Invalid project overview response.', 'network')
    return parsed.data
  }

  async createActivity(
    input: CreateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(input.projectId)}/activities`,
      'POST',
      {
        title: input.title,
        description: input.description,
        plannedStartDate: input.startDate,
        plannedEndDate: input.dueDate,
        timelineOverrideJustification: input.timelineOverrideJustification,
        targetBeneficiaries: input.targetBeneficiaries,
        budgetAllocation: input.budgetAllocation,
        assignedUserIds: input.assignedUserIds,
        indicatorIds: input.indicatorIds,
        journeyStageId: input.journeyStageId,
      },
      context,
      parseActivity,
    )
  }

  async updateActivity(
    input: UpdateActivityInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.id)}`,
      'PATCH',
      {
        title: input.title,
        description: input.description,
        plannedStartDate: input.startDate,
        plannedEndDate: input.dueDate,
        timelineOverrideJustification: input.timelineOverrideJustification,
        targetBeneficiaries: input.targetBeneficiaries,
        budgetAllocation: input.budgetAllocation,
        assignedUserIds: input.assignedUserIds,
        indicatorIds: input.indicatorIds,
        journeyStageId: input.journeyStageId,
        expectedUpdatedAt: input.expectedUpdatedAt,
      },
      context,
      parseActivity,
    )
  }

  async transitionActivity(
    projectId: string,
    activityId: string,
    status: 'IN_PROGRESS' | 'CANCELLED',
    expectedUpdatedAt: string,
    reason?: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/transition`,
      'POST',
      { status, expectedUpdatedAt, reason },
      context,
      parseActivity,
    )
  }

  async recordActivityProgress(input: RecordActivityProgressInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/progress`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientUpdateId: input.clientUpdateId,
            progressPercent: input.progress,
            note: input.note,
          }),
        },
      ),
    )
  }

  async recordOverdueExplanation(input: RecordOverdueExplanationInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/overdue-explanations`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMutationId: input.clientMutationId,
            category: input.category,
            explanation: input.explanation,
          }),
        },
      ),
    )
  }

  async submitActivityProof(
    input: SubmitActivityProofInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    if (!context?.isCurrent())
      throw new PathwaysClientError('Current proof ownership is required.', 'unauthorized')
    const path = `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/updates`
    return sourceTickets.execute(
      context,
      `POST:${path}`,
      { progressPercent: input.progress, note: input.note },
      (captured) => {
        const body = new FormData()
        body.set('clientUpdateId', String(captured.clientUpdateId))
        body.set('progressPercent', String(captured.progressPercent))
        body.set('note', String(captured.note))
        for (const file of input.files) body.append('files', file, file.name)
        return requestFoundation(path, { method: 'POST', body }, context.isCurrent)
      },
      parseActivity,
      {
        requestId: input.clientUpdateId,
        keyField: 'clientUpdateId',
        allowLegacy: true,
        files: input.files,
      },
    )
  }

  // --- Direct-upload activity proof (cr-pathways-activity-progress-media). New section: kept
  // separate from the retired multipart path above; do not reformat surrounding code. ---

  async getActivityProofUploadLimits(projectId: string): Promise<ActivityProofUploadLimits> {
    return requestFoundation(
      `/projects/${encodeURIComponent(projectId)}/activities/proof-upload-limits`,
    ).then(parseActivityProofUploadLimits)
  }

  async reserveActivityProofUpload(
    input: ReserveActivityProofUploadInput,
  ): Promise<ActivityProofReservation> {
    const path = `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/updates/reservations`
    return requestFoundation(path, {
      method: 'POST',
      body: JSON.stringify({
        clientUpdateId: input.clientUpdateId,
        progressPercent: input.progressPercent,
        note: input.note,
        files: input.files,
        ...(input.beneficiariesReachedThisSession === undefined
          ? {}
          : { beneficiariesReachedThisSession: input.beneficiariesReachedThisSession }),
      }),
    }).then(parseActivityProofReservation)
  }

  // A raw PUT to the server-issued signed upload URL. This never carries the caller's own API
  // bearer token or workspace headers: the signed URL's embedded token is the only credential,
  // scoped to one server-derived object key, and it authorizes a write only, never a read.
  async uploadActivityProofFile(uploadUrl: string, file: File): Promise<void> {
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file)
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok)
      throw new PathwaysClientError(
        'The file could not be uploaded. Retry this file.',
        'network',
        [],
        response.status,
      )
  }

  async finalizeActivityProofFile(
    projectId: string,
    activityId: string,
    updateId: string,
    evidenceId: string,
  ): Promise<ActivityProofFinalizeResult> {
    const path = `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}/files/${encodeURIComponent(evidenceId)}/finalize`
    return requestFoundation(path, { method: 'POST' }).then(parseActivityProofFinalizeResult)
  }

  async reviewActivityUpdate(
    projectId: string,
    activityId: string,
    updateId: string,
    decision: 'APPROVE' | 'RETURN',
    reason: string,
    expectedUpdatedAt: string,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<Activity>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}/review`,
      'POST',
      { decision, reason, expectedUpdatedAt },
      context,
      parseActivity,
    )
  }

  async downloadActivityProof(projectId: string, activityId: string, evidenceId: string) {
    const response = await requestFoundationResponse(
      `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/proof/${encodeURIComponent(evidenceId)}`,
    )
    return response.blob()
  }

  async getMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return parseMilestones(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/milestones`),
    )
  }

  async createMilestone(projectId: string, input: SaveMilestoneInput): Promise<ProjectMilestone> {
    return parseMilestone(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/milestones`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  }

  async updateMilestone(
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<ProjectMilestone> {
    return parseMilestone(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    )
  }

  async getEvidence(projectId: string): Promise<EvidenceList> {
    return parseEvidenceList(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/evidence`),
    )
  }

  async getProjectIndicators(projectId: string, signal?: AbortSignal): Promise<ProjectIndicator[]> {
    return projectIndicatorListSchema.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicators`, { signal }),
    )
  }

  async getProjectIndicator(projectId: string, indicatorId: string): Promise<ProjectIndicator> {
    return projectIndicatorSchema.parse(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
      ),
    )
  }

  async createProjectIndicator(
    projectId: string,
    input: CreateIndicatorInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators`,
      'POST',
      input,
      context,
      (value) => projectIndicatorSchema.parse(value),
    )
  }

  async updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: UpdateIndicatorInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
      'PATCH',
      input,
      context,
      (value) => projectIndicatorSchema.parse(value),
    )
  }

  async recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: ManualMeasurementInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>> {
    if (!context?.isCurrent())
      throw new PathwaysClientError('Current measurement ownership is required.', 'unauthorized')
    const { clientMeasurementId, ...body } = input
    const path = `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/measurements`
    return sourceTickets.execute(
      context,
      `POST:${path}`,
      body,
      (captured) =>
        requestFoundation(
          path,
          { method: 'POST', body: JSON.stringify(captured) },
          context.isCurrent,
        ),
      (value) => projectIndicatorSchema.parse(value),
      { requestId: clientMeasurementId, keyField: 'clientMeasurementId', allowLegacy: true },
    )
  }

  async archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectIndicator>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/archive`,
      'POST',
      { expectedRevision },
      context,
      (value) => projectIndicatorSchema.parse(value),
    )
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

  async getEvaluation(_projectId: string): Promise<EvaluationRecord> {
    throw backendNotConfigured('Project evaluation')
  }

  async getExpenses(_projectId: string): Promise<ExpenseRecord[]> {
    throw backendNotConfigured('Expense records')
  }

  async getRecommendationOutcomes(_projectId: string): Promise<RecommendationOutcomeRecord[]> {
    throw backendNotConfigured('Recommendation outcomes')
  }

  async getTransparencySections(_projectId: string): Promise<TransparencySection[]> {
    throw backendNotConfigured('Transparency sections')
  }

  async getBeneficiaryRecordsForRole(
    _role: PathwaysRole,
    projectId?: string,
    filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]> {
    if (!projectId) return []
    const params = new URLSearchParams()

    const search = filters?.search?.trim()

    if (search) params.set('search', search)
    if (filters?.sex) params.set('sex', filters.sex)
    if (filters?.ageBand) params.set('ageBand', filters.ageBand)
    if (filters?.disabilityStatus) params.set('disabilityStatus', filters.disabilityStatus)

    if (filters?.enrollmentStatus) {
      params.set('enrollmentStatus', filters.enrollmentStatus)
    }

    params.set('limit', '50')
    const records: BeneficiaryRecord[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    do {
      if (cursor) params.set('cursor', cursor)
      const value = (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}?${params.toString()}`,
      )) as { items?: unknown; nextCursor?: unknown }
      if (
        !Array.isArray(value.items) ||
        value.items.length > 50 ||
        (value.nextCursor !== null && typeof value.nextCursor !== 'string')
      ) {
        throw new PathwaysClientError('Invalid beneficiary response.', 'network')
      }
      records.push(...value.items.map((row) => mapBeneficiary(row as ApiBeneficiary)))
      cursor = value.nextCursor
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new PathwaysClientError('Invalid beneficiary pagination.', 'network')
        }
        seenCursors.add(cursor)
      }
    } while (cursor)

    return records
  }

  async getSurveySubjectPage(
    projectId: string,
    search = '',
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (
      !uuid.test(projectId) ||
      search.trim().length > 80 ||
      (cursor !== undefined && !uuid.test(cursor))
    )
      throw new PathwaysClientError('Invalid contributor search.', 'invalid')
    const params = new URLSearchParams({ enrollmentStatus: 'ACTIVE', limit: '25' })
    if (search.trim()) params.set('search', search.trim())
    if (cursor) params.set('cursor', cursor)
    const page = (await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}?${params}`,
      { signal },
    )) as { items?: unknown; nextCursor?: unknown }
    if (
      !page ||
      typeof page !== 'object' ||
      Array.isArray(page) ||
      !Array.isArray(page.items) ||
      page.items.length > 25 ||
      (page.nextCursor !== null &&
        (typeof page.nextCursor !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(page.nextCursor)))
    )
      throw new PathwaysClientError('Invalid contributor page.', 'network')
    const items = page.items
      .map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new PathwaysClientError('Invalid contributor response.', 'network')
        const record = value as Record<string, unknown>
        if (
          typeof record.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) ||
          record.projectId !== projectId ||
          typeof record.code !== 'string' ||
          !record.code.length ||
          record.code.length > 64 ||
          typeof record.displayName !== 'string' ||
          !record.displayName.length ||
          record.displayName.length > 240 ||
          !['INDIVIDUAL', 'GROUP', 'COMMUNITY', 'UNSPECIFIED_LEGACY'].includes(
            String(record.subjectType),
          ) ||
          typeof record.consentRecorded !== 'boolean' ||
          typeof record.dataProcessingConsentRecorded !== 'boolean' ||
          !record.enrollment ||
          typeof record.enrollment !== 'object' ||
          Array.isArray(record.enrollment) ||
          (record.enrollment as Record<string, unknown>).projectId !== projectId
        )
          throw new PathwaysClientError('Contributor scope could not be verified.', 'network')
        return record
      })
      .filter(
        (record) =>
          record.subjectType === 'INDIVIDUAL' &&
          record.status === 'ACTIVE' &&
          record.consentRecorded &&
          record.dataProcessingConsentRecorded &&
          (record.enrollment as Record<string, unknown>).status === 'ACTIVE' &&
          ((record.enrollment as Record<string, unknown>).endedDate === null ||
            (record.enrollment as Record<string, unknown>).endedDate === undefined),
      )
      .map((record) => ({
        id: record.id as string,
        code: record.code as string,
        displayName: record.displayName as string,
      }))
    return { items, nextCursor: page.nextCursor as string | null }
  }

  async getBeneficiaryRecordForRole(
    _role: PathwaysRole,
    projectId: string,
    id: string,
  ): Promise<BeneficiaryRecord> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`,
      )) as ApiBeneficiary,
    )
  }

  async registerBeneficiary(
    projectId: string,
    input: RegisterBeneficiaryInput,
  ): Promise<BeneficiaryRecord> {
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/registrations`,
        { method: 'POST', body: JSON.stringify(input) },
      )) as ApiBeneficiary,
    )
  }

  async updateBeneficiary(
    projectId: string,
    beneficiaryId: string,
    input: UpdateBeneficiaryInput,
  ): Promise<BeneficiaryRecord> {
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      )) as ApiBeneficiary,
    )
  }

  async archiveBeneficiary(projectId: string, beneficiaryId: string, expectedUpdatedAt: string) {
    return requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/archive`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) },
    ) as Promise<{ id: string; status: 'ARCHIVED'; archivedAt: string }>
  }

  async getBeneficiaryMediaProofForRole(
    _role: PathwaysRole,
    _beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]> {
    throw backendNotConfigured('Beneficiary media proof')
  }

  async getBeneficiarySadddAggregatesForRole(
    _role: PathwaysRole,
    query: SadddQuery,
  ): Promise<BeneficiarySadddAggregate> {
    // Compatibility entry point only: the role is never transmitted or trusted.
    return this.getSadddDashboard(query)
  }

  async getJourneyStages(projectId: string, signal?: AbortSignal): Promise<JourneyStageConfig[]> {
    return parseJourneyStages(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/journey-stages`, {
        signal,
      }),
    )
  }

  async saveJourneyStages(
    projectId: string,
    stages: JourneyStageConfig[],
  ): Promise<JourneyStageConfig[]> {
    const stageType = {
      Entry: 'ENTRY',
      Core: 'CORE',
      Branch: 'BRANCH',
      'Follow-Up': 'FOLLOW_UP',
    } as const
    return parseJourneyStages(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/journey-stages`, {
        method: 'PUT',
        body: JSON.stringify({
          stages: stages.map((stage) => ({
            id: stage.id,
            code: stage.code,
            name: stage.name,
            order: stage.order,
            type: stageType[stage.type],
            parentStageId: stage.parentStageId,
            terminal: stage.terminal,
            description: stage.description,
            mappedActivityIds: stage.mappedActivityIds,
            expectedUpdatedAt: stage.updatedAt,
          })),
        }),
      }),
    )
  }

  async getBeneficiaryJourneyHistory(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryJourneyHistory> {
    return parseJourneyHistory(
      await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey`,
      ),
    )
  }

  async transitionBeneficiaryJourney(
    projectId: string,
    beneficiaryId: string,
    input: EnrollmentJourneyEventInput,
  ) {
    return requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey/events`,
      { method: 'POST', body: JSON.stringify(input) },
    ) as Promise<{
      enrollmentId: string
      eventType: string
      eventDate: string
    }>
  }

  async correctBeneficiaryJourneyEvent(
    projectId: string,
    beneficiaryId: string,
    eventId: string,
    input: CorrectJourneyEventInput,
  ) {
    return requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/journey/events/${encodeURIComponent(eventId)}/corrections`,
      { method: 'POST', body: JSON.stringify(input) },
    ) as Promise<{ id: string }>
  }

  async getIndicators(projectId?: string, signal?: AbortSignal): Promise<Indicator[]> {
    if (!projectId) {
      throw new PathwaysClientError('Project scope is required.', 'invalid')
    }

    return (await this.getProjectIndicators(projectId, signal)).map(
      ({ id, projectId: scope, code, name }) => ({
        id,
        projectId: scope,
        code,
        label: name,
      }),
    )
  }

  async getBudgets(_projectId?: string): Promise<BudgetRecord[]> {
    throw backendNotConfigured('Budget records')
  }

  async getAlerts(_projectId?: string): Promise<AlertRecord[]> {
    throw backendNotConfigured('Alert records')
  }

  async getAlertsForRole(_role: PathwaysRole, _projectId?: string): Promise<AlertRecord[]> {
    throw backendNotConfigured('Alert records')
  }

  async getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]> {
    throw backendNotConfigured('Analytics locations')
  }

  async getRecommendations(): Promise<RecommendationRecord[]> {
    throw backendNotConfigured('Recommendations')
  }

  async getRecommendationsForRole(_role: PathwaysRole): Promise<RecommendationRecord[]> {
    throw backendNotConfigured('Recommendations')
  }

  async getRules(): Promise<RuleDefinition[]> {
    throw backendNotConfigured('Monitoring rules')
  }

  async getReports(_projectId?: string): Promise<ReportRecord[]> {
    throw backendNotConfigured('Report records')
  }

  async getSurveyForms(_projectId?: string): Promise<SurveyFormDefinition[]> {
    throw backendNotConfigured('Survey forms')
  }

  async getBeneficiaryRegistrationContext(
    projectId: string,
  ): Promise<BeneficiaryRegistrationContext> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    const value = await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/registration-context`,
    )
    try {
      return parseRegistrationContext(value, projectId)
    } catch {
      throw new PathwaysClientError('Invalid registration context response.', 'network')
    }
  }

  // cr-pathways-default-registration-form: provisions only the fixed system template for a
  // project the registrar can already register into, and returns the same blank context shape.
  async ensureDefaultRegistrationForm(projectId: string): Promise<BeneficiaryRegistrationContext> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    const value = await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/registration-context/default-form`,
      { method: 'POST' },
    )
    try {
      return parseRegistrationContext(value, projectId)
    } catch {
      throw new PathwaysClientError('Invalid registration context response.', 'network')
    }
  }

  async getDigitalForms(projectId: string): Promise<DigitalFormDefinition[]> {
    const value = await requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms`,
    )
    if (!Array.isArray(value) || value.length > 100) {
      throw new PathwaysClientError('Invalid form response.', 'network')
    }
    return value as DigitalFormDefinition[]
  }

  async getDigitalForm(projectId: string, formId: string): Promise<DigitalFormDefinition> {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`,
    ) as Promise<DigitalFormDefinition>
  }

  async createDigitalForm(
    projectId: string,
    input: SaveDigitalFormInput,
  ): Promise<DigitalFormDefinition> {
    return requestFoundation(`/metadata/projects/${encodeURIComponent(projectId)}/forms`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<DigitalFormDefinition>
  }

  async updateDigitalForm(
    projectId: string,
    formId: string,
    input: SaveDigitalFormInput & { expectedUpdatedAt: string },
  ): Promise<DigitalFormDefinition> {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ) as Promise<DigitalFormDefinition>
  }

  async publishDigitalForm(projectId: string, formId: string, expectedUpdatedAt: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/publish`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) },
    ) as Promise<DigitalFormDefinition>
  }

  async archiveDigitalForm(projectId: string, formId: string, expectedUpdatedAt: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/archive`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) },
    ) as Promise<DigitalFormDefinition>
  }

  async createDigitalFormVersion(projectId: string, formId: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/versions`,
      { method: 'POST' },
    ) as Promise<DigitalFormDefinition>
  }

  async generateDigitalForm(
    projectId: string,
    input: { templateKey?: string; sourceFormId?: string; code: string; name: string },
  ) {
    return requestFoundation(`/metadata/projects/${encodeURIComponent(projectId)}/forms/generate`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<DigitalFormDefinition>
  }

  async validateDigitalFormValues(
    projectId: string,
    formId: string,
    values: Record<string, unknown>,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/validate`,
      { method: 'POST', body: JSON.stringify({ values }) },
    ) as Promise<FormValidationResult>
  }

  async saveDirectSubmission(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
    values: Record<string, unknown>,
    beneficiaryId?: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientSubmissionId,
          values,
          ...(beneficiaryId ? { beneficiaryId } : {}),
        }),
      },
    ) as Promise<DirectFormSubmission>
  }

  async listDirectSubmissions(projectId: string, formId: string, offset = 0, limit = 10) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions?offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}`,
    ) as Promise<DirectFormSubmissionPage>
  }

  async getDirectSubmission(projectId: string, formId: string, submissionId: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    ) as Promise<DirectFormSubmission>
  }

  async getDirectSubmissionByClientId(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/by-client/${encodeURIComponent(clientSubmissionId)}`,
    ) as Promise<DirectFormSubmission>
  }

  async updateDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
    values: Record<string, unknown>,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      { method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt, values }) },
    ) as Promise<DirectFormSubmission>
  }

  async validateDirectSubmission(projectId: string, formId: string, submissionId: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/validate`,
      { method: 'POST' },
    ) as Promise<FormValidationResult>
  }

  async submitDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/submit`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) },
    ) as Promise<DirectFormSubmission>
  }

  async getImportBatches(projectId: string) {
    const value = await requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches`,
    )
    if (!Array.isArray(value) || value.length > 100) {
      throw new PathwaysClientError('Invalid import batch response.', 'network')
    }
    return value as ImportBatchDefinition[]
  }

  async getImportBatch(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}`,
    ) as Promise<ImportBatchDefinition>
  }

  async getImportRows(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rows?offset=0&take=100`,
    ) as Promise<ImportRowsPage>
  }

  async uploadImport(projectId: string, formId: string, clientImportId: string, file: File) {
    const body = new FormData()
    body.set('formId', formId)
    body.set('clientImportId', clientImportId)
    body.set('file', file, file.name)
    return requestFoundation(`/imports/projects/${encodeURIComponent(projectId)}/batches/upload`, {
      method: 'POST',
      body,
    }) as Promise<ImportBatchDefinition>
  }

  async resumeImportUpload(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/resume`,
      { method: 'POST' },
    ) as Promise<ImportBatchDefinition>
  }

  async automaticImportMapping(projectId: string, batchId: string, expectedMappingRevision: 0 | 1) {
    const value = await requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/automatic-mapping`,
      { method: 'POST', body: JSON.stringify({ expectedMappingRevision }) },
    )
    try {
      return parseAutomaticMappingReceipt(value, batchId)
    } catch {
      throw new PathwaysClientError('Invalid automatic mapping receipt.', 'network')
    }
  }

  async saveImportMapping(
    projectId: string,
    batchId: string,
    expectedMappingRevision: number,
    mappings: ImportMappingInput[],
  ) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/mapping`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedMappingRevision, mappings }),
      },
    ) as Promise<ImportBatchDefinition>
  }

  async validateImport(projectId: string, batchId: string, expectedMappingRevision: number) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/validate`,
      { method: 'POST', body: JSON.stringify({ expectedMappingRevision }) },
    ) as Promise<ImportBatchDefinition>
  }

  async processImport(projectId: string, batchId: string, expectedValidationRevision: number) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/process`,
      { method: 'POST', body: JSON.stringify({ expectedValidationRevision }) },
    ) as Promise<ImportBatchDefinition>
  }

  async getSurveyAggregateResults(
    _filters?: SurveyAggregateFilters,
  ): Promise<SurveyAggregateResultSet[]> {
    throw backendNotConfigured('Survey aggregate results')
  }

  async getPublicProjects(): Promise<PublicProjectRecord[]> {
    try {
      return await readPublicProjects()
    } catch {
      throw new PathwaysClientError('Published projects are temporarily unavailable.', 'network')
    }
  }

  async getPublicProject(id: string): Promise<PublicProjectRecord> {
    try {
      const [project] = await readPublicProjects(id)
      if (!project) throw new Error('PUBLIC_NOT_FOUND')
      return project
    } catch (error) {
      throw new PathwaysClientError(
        'Published project unavailable.',
        error instanceof Error && error.message === 'PUBLIC_NOT_FOUND' ? 'not_found' : 'network',
      )
    }
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

export const pathwaysClient: PathwaysClient = new BackendReadyPathwaysClient()

const roleCodeByName: Record<PathwaysRole, string> = {
  'System Administrator': 'SYSTEM_ADMINISTRATOR',
  'Program Manager': 'PROGRAM_MANAGER',
  'Grant Manager': 'GRANT_MANAGER',
  'Project Manager': 'PROJECT_MANAGER',
  'Monitoring and Evaluation Officer': 'MONITORING_AND_EVALUATION_OFFICER',
  'Project Officer': 'PROJECT_OFFICER',
}

interface ApiProject {
  id: string
  code: string
  title: string
  description: string | null
  objectives: string | null
  implementationArea: string | null
  implementingPartners: string | null
  implementingPartnerRecords?: { id: string; name: string }[]
  sector: string | null
  targetBeneficiaries: number | null
  projectBudget: string | null

  startDate?: string | null
  endDate?: string | null
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
  programId: string | null
  projectManager: string | null
  programManagerId: string | null
  programManager: string | null
  projectManagerId: string | null
  monitoringOfficerId: string | null
  monitoringOfficer: string | null
  projectOfficerIds: string[]
  projectOfficers: string[]
  updatedAt: string
}

function apiProjectStatus(status: ProjectStatus | ApiProject['status']): ApiProject['status'] {
  switch (status) {
    case 'Active':
      return 'ONGOING'
    case 'Needs Attention':
      return 'ON_HOLD'
    case 'Planned':
      return 'PLANNED'
    case 'Completed':
      return 'COMPLETED'
    default:
      return status
  }
}

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

interface ApiBeneficiary {
  id: string
  code: string
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY' | 'UNSPECIFIED_LEGACY'
  displayName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'
  birthDate?: string
  ageAtRegistration: number | null
  disabilityStatus: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'
  locationBarangay: string | null
  locationCityMunicipality: string | null
  locationProvince: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  consentRecorded: boolean
  dataProcessingConsentRecorded: boolean
  isMinor: boolean
  guardianConsentRecorded: boolean
  projectId: string
  enrollment: {
    id: string
    projectId: string
    enrollmentDate: string
    status: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'TRANSFERRED' | 'INACTIVE'
  } | null
  consentProvenance: BeneficiaryRecord['consentProvenance']
  updatedAt: string
}

const sourceTickets = sourceMutationTickets
let sourceInvalidationSubscribed = false
function ensureSourceInvalidationSubscription() {
  if (typeof window === 'undefined' || sourceInvalidationSubscribed) return
  subscribeSensitiveDraftInvalidation(() => sourceTickets.clear())
  sourceInvalidationSubscribed = true
}
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
async function requestSourceMutation<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  context: SourceMutationContext | undefined,
  parse: (value: unknown) => T,
): Promise<SourceMutationResult<T>> {
  if (!context)
    throw new PathwaysClientError('Current mutation ownership is required.', 'unauthorized')
  try {
    return await sourceTickets.execute(
      context,
      `${method}:${path}`,
      body,
      (captured) =>
        requestFoundation(path, { method, body: JSON.stringify(captured) }, context.isCurrent),
      parse,
    )
  } catch (error) {
    if (error instanceof SourceMutationRecoveryError)
      throw new PathwaysClientError(error.message, 'invalid')
    throw error
  }
}

function readContextCookie() {
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)
  return value
}

export async function requestFoundationResponse(
  path: string,
  init: RequestInit = {},
  isCurrent?: () => boolean,
) {
  if (isCurrent && !isCurrent())
    throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  if (typeof window === 'undefined')
    throw new PathwaysClientError('Browser session required.', 'unauthorized')
  ensureSourceInvalidationSubscription()
  const supabase = getBrowserSupabaseClient()
  if (!supabase)
    throw new PathwaysClientError('Authentication is not configured.', 'not_configured')
  // Capture the operation's workspace before asynchronous token acquisition.
  // A singleton account switch must not redirect an already-entered payload.
  const ownerCookie = readContextCookie()
  const ownerGeneration = sensitiveDraftGeneration()
  const { data, error } = await supabase.auth.getSession()
  if (
    ownerCookie !== readContextCookie() ||
    ownerGeneration !== sensitiveDraftGeneration() ||
    (isCurrent && !isCurrent())
  ) {
    throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  }
  const session = data.session
  if (error || !session)
    throw new PathwaysClientError('Current session unavailable.', 'unauthorized')
  const context = decodeWorkspaceContext(ownerCookie, session.user.id)
  if (!context) throw new PathwaysClientError('Workspace context unavailable.', 'forbidden')
  let base: URL
  try {
    base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  } catch {
    throw new PathwaysClientError('API endpoint is not approved.', 'not_configured')
  }
  const isMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData
  const response = await fetch(`${base.toString().replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body != null && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
      'X-Pathways-Organization-Id': context.organizationId,
      'X-Pathways-User-Id': context.userId,
      ...init.headers,
    },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
  if (response.ok && !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()))
    announceWriteCommitted()
  if (!response.ok) {
    let fieldErrors: FormValidationError[] = []
    let serverMessage: string | undefined
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 409 ||
      response.status === 422
    ) {
      const body = (await response.json().catch(() => null)) as {
        message?: { errors?: unknown; message?: unknown } | string | unknown[]
        errors?: unknown
        code?: unknown
      } | null
      if (response.status === 403 && body?.code === STEP_UP_REQUIRED_CODE) {
        const stepUp = new PathwaysClientError(
          'Recent MFA verification is required for Beneficiary detail.',
          'forbidden',
          [],
          403,
          true,
        )
        // The error is the denial token, so a reader's own deny() for it is not counted twice.
        announceAuthorizationDenied(stepUp)
        announceStepUpRequired()
        throw stepUp
      }
      const candidate =
        body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
          ? body.message.errors
          : body?.errors
      const candidateMessage =
        typeof body?.message === 'string'
          ? body.message
          : body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
            ? body.message.message
            : Array.isArray(body?.message) &&
                body.message.length > 0 &&
                body.message.every((item) => typeof item === 'string')
              ? // Nest's default ValidationPipe response shape, e.g. from
                // class-validator: { message: string[], error, statusCode }.
                body.message.join(' ')
              : undefined
      if (typeof candidateMessage === 'string' && candidateMessage.length <= 300) {
        serverMessage = candidateMessage
      }
      if (Array.isArray(candidate) && candidate.length <= 100) {
        fieldErrors = candidate.filter(
          (item): item is FormValidationError =>
            typeof item === 'object' &&
            item !== null &&
            'fieldCode' in item &&
            typeof item.fieldCode === 'string' &&
            item.fieldCode.length <= 64 &&
            'code' in item &&
            typeof item.code === 'string' &&
            item.code.length <= 64 &&
            'message' in item &&
            typeof item.message === 'string' &&
            item.message.length <= 300,
        )
      }
    }
    const code =
      response.status === 401
        ? 'unauthorized'
        : response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not_found'
            : response.status === 400 || response.status === 409 || response.status === 422
              ? 'invalid'
              : 'network'
    const failure = new PathwaysClientError(
      fieldErrors.length
        ? 'Review the highlighted form fields.'
        : (serverMessage ?? 'The requested operation could not be completed.'),
      code,
      fieldErrors,
      response.status,
    )
    if (response.status === 401 || response.status === 403) announceAuthorizationDenied(failure)
    throw failure
  }
  return response
}

export async function requestFoundation(
  path: string,
  init: RequestInit = {},
  isCurrent?: () => boolean,
) {
  const response = await requestFoundationResponse(path, init, isCurrent)
  return response.json()
}

function mapProject(project: ApiProject): ProjectDetail {
  const status: ProjectStatus =
    project.status === 'ONGOING'
      ? 'Active'
      : project.status === 'COMPLETED'
        ? 'Completed'
        : project.status === 'PLANNED'
          ? 'Planned'
          : 'Needs Attention'
  const period =
    [project.startDate, project.endDate].filter(Boolean).join(' to ') || 'Dates not recorded'
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description ?? '',
    objectives: project.objectives ?? '',
    implementingPartners: project.implementingPartners,
    implementingPartnerRecords: (project.implementingPartnerRecords ?? []).map(({ id, name }) => ({
      id,
      name,
    })),
    projectBudget: project.projectBudget,

    area: project.implementationArea ?? 'Area not recorded',
    sector: project.sector ?? 'Sector not recorded',
    status,
    storedStatus: project.status,
    health: status === 'Needs Attention' ? 'At Risk' : 'On Track',
    period,
    projectManager: project.projectManager ?? 'Not assigned',
    programManager: project.programManager ?? 'Not assigned',
    programManagerId: project.programManagerId,
    projectManagerId: project.projectManagerId,
    monitoringOfficer: project.monitoringOfficer ?? 'Not assigned',
    monitoringOfficerId: project.monitoringOfficerId,
    projectOfficers: project.projectOfficers ?? [],
    projectOfficerIds: project.projectOfficerIds ?? [],
    targetBeneficiaries: project.targetBeneficiaries ?? undefined,
    budgetCode: 'Not recorded',
    startDate: project.startDate,
    endDate: project.endDate,
    updatedAt: project.updatedAt,
    programId: project.programId,
  }
}

function mapBeneficiary(row: ApiBeneficiary): BeneficiaryRecord {
  const sex = {
    FEMALE: 'Female',
    MALE: 'Male',
    OTHER: 'Other',
    PREFER_NOT_TO_SAY: 'Prefer not to say',
    NOT_SPECIFIED: 'Not specified',
  } as const
  const disability = {
    WITH_DISABILITY: 'With disability',
    WITHOUT_DISABILITY: 'Without disability',
    NOT_SPECIFIED: 'Not specified',
  } as const
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.code !== 'string' ||
    typeof row.displayName !== 'string' ||
    !(row.sex in sex) ||
    !(row.disabilityStatus in disability) ||
    !Object.hasOwn(row, 'enrollment') ||
    (row.enrollment !== null &&
      (!row.enrollment ||
        !['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE'].includes(
          row.enrollment.status,
        ))) ||
    !Array.isArray(row.consentProvenance)
  ) {
    throw new PathwaysClientError('Invalid beneficiary response.', 'network')
  }
  const enrollmentStatus =
    row.enrollment === null
      ? 'Not recorded'
      : row.enrollment.status === 'COMPLETED'
        ? 'Completed'
        : row.enrollment.status === 'DROPPED' ||
            row.enrollment.status === 'TRANSFERRED' ||
            row.enrollment.status === 'INACTIVE'
          ? 'Exited'
          : 'Active'
  const location =
    [row.locationBarangay, row.locationCityMunicipality, row.locationProvince]
      .filter(Boolean)
      .join(', ') || 'Not recorded'
  const ageGroup =
    row.ageAtRegistration === null
      ? 'Unknown'
      : row.ageAtRegistration <= 9
        ? '0-9'
        : row.ageAtRegistration <= 14
          ? '10-14'
          : row.ageAtRegistration <= 17
            ? '15-17'
            : row.ageAtRegistration <= 24
              ? '18-24'
              : '25+'
  return {
    id: row.id,
    code: row.code,
    subjectType: row.subjectType,
    displayName: row.displayName,
    projectIds: [row.projectId],
    location,
    sex: sex[row.sex],
    ageGroup,
    disabilityStatus: disability[row.disabilityStatus],
    enrollmentStatus,
    firstName: row.firstName ?? '',
    middleName: row.middleName ?? undefined,
    lastName: row.lastName ?? '',
    birthDate: row.birthDate,
    age: row.ageAtRegistration ?? undefined,
    province: row.locationProvince ?? '',
    city: row.locationCityMunicipality ?? '',
    barangay: row.locationBarangay ?? '',
    consentToParticipate: row.consentRecorded,
    consentToStoreData: row.dataProcessingConsentRecorded,
    isMinor: row.isMinor,
    guardianConsent: row.guardianConsentRecorded,
    enrollments: row.enrollment
      ? [
          {
            id: row.enrollment.id,
            projectId: row.projectId,
            status: enrollmentStatus,
            enrolledAt: row.enrollment.enrollmentDate,
            followUpStatus: 'Not recorded',
          },
        ]
      : [],
    participation: [],
    assessments: [],
    notes: [],
    updatedAt: row.updatedAt,
    consentProvenance: row.consentProvenance,
  }
}

function parseProjects(value: unknown) {
  if (!Array.isArray(value) || value.length > 100)
    throw new PathwaysClientError('Invalid project response.', 'network')
  return value.map((row) => mapProject(row as ApiProject))
}

const activityResponseKeys = [
  'id',
  'projectId',
  'code',
  'title',
  'description',
  'activityType',
  'timelineOverrideJustification',
  'storedStatus',
  'status',
  'overdue',
  'startDate',
  'dueDate',
  'actualStartDate',
  'actualEndDate',
  'assignedUserIds',
  'assignedTo',
  'assignedEmails',
  'indicatorIds',
  'journeyStageIds',
  'journeyStageId',
  'targetBeneficiaries',
  'beneficiariesReached',
  'budgetAllocation',
  'budgetLogged',
  'progress',
  'reviewedById',
  'reviewedAt',
  'cancellationReason',
  'submittedProof',
  'updateNotes',
  'updatedAt',
  'capabilities',
] as const satisfies readonly (keyof Activity)[]

// Activity capability flags (feature/project-rbac-ui-and-partners). Advisory only: a response
// without them shows no Edit, Record progress, Submit proof or Explain delay control.
const noActivityCapabilities: ActivityCapabilities = {
  canEdit: false,
  canRecordProgress: false,
  canSubmitProof: false,
  canExplainOverdue: false,
}

function parseActivityCapabilities(value: unknown): ActivityCapabilities {
  if (value === undefined) return noActivityCapabilities
  const row = value as Partial<Record<keyof ActivityCapabilities, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 4 ||
    typeof row.canEdit !== 'boolean' ||
    typeof row.canRecordProgress !== 'boolean' ||
    typeof row.canSubmitProof !== 'boolean' ||
    typeof row.canExplainOverdue !== 'boolean'
  )
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return {
    canEdit: row.canEdit,
    canRecordProgress: row.canRecordProgress,
    canSubmitProof: row.canSubmitProof,
    canExplainOverdue: row.canExplainOverdue,
  }
}

const overdueExplanationCategories = new Set<string>([
  'WEATHER',
  'SECURITY',
  'FUNDING',
  'COMMUNITY',
  'LOGISTICS',
  'OTHER',
] satisfies ActivityOverdueExplanation['category'][])

function parseOverdueExplanation(value: unknown): ActivityOverdueExplanation {
  const row = value as Partial<Record<keyof ActivityOverdueExplanation, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 5 ||
    typeof row.id !== 'string' ||
    typeof row.category !== 'string' ||
    !overdueExplanationCategories.has(row.category) ||
    typeof row.explanation !== 'string' ||
    row.explanation.length < 10 ||
    row.explanation.length > 2000 ||
    typeof row.actorName !== 'string' ||
    typeof row.recordedAt !== 'string'
  )
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return {
    id: row.id,
    category: row.category as ActivityOverdueExplanation['category'],
    explanation: row.explanation,
    actorName: row.actorName,
    recordedAt: row.recordedAt,
  }
}

function parseOverdueExplanations(value: unknown): ActivityOverdueExplanation[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return value.map(parseOverdueExplanation)
}

function parseAssignableProjectOfficers(value: unknown): AssignableProjectOfficer[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new PathwaysClientError('Invalid officer response.', 'network')
  return value.map((item) => {
    const row = item as Partial<Record<keyof AssignableProjectOfficer, unknown>> | null
    if (
      !row ||
      typeof row !== 'object' ||
      Object.keys(row).length !== 2 ||
      typeof row.userId !== 'string' ||
      typeof row.displayName !== 'string'
    )
      throw new PathwaysClientError('Invalid officer response.', 'network')
    return { userId: row.userId, displayName: row.displayName }
  })
}

const MAX_ACTIVITY_PROOF_FILES = 10

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

// The signed upload URL must point at the configured Supabase storage origin. Anything else
// (a mismatched host, a non-https scheme, an unexpected origin) is treated as a network error
// rather than followed.
const isAllowedActivityProofUploadUrl = (value: unknown): value is string | null => {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const configuredSupabaseUrl = (webEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  if (!configuredSupabaseUrl) return false
  let parsed: URL
  let allowed: URL
  try {
    parsed = new URL(value)
    allowed = new URL(configuredSupabaseUrl)
  } catch {
    return false
  }
  if (parsed.origin !== allowed.origin) return false
  if (parsed.protocol === 'https:') return true
  // The local Supabase stack (pnpm dev:local) serves storage over plain http on a loopback host;
  // that is accepted only when the configured Supabase URL is itself that loopback origin.
  return (
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  )
}

function parseActivityProofUploadLimits(value: unknown): ActivityProofUploadLimits {
  const row = value as Partial<Record<keyof ActivityProofUploadLimits, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 4 ||
    !isFiniteNonNegative(row.maxFiles) ||
    !isFiniteNonNegative(row.maxFileBytes) ||
    !isFiniteNonNegative(row.maxTotalBytes) ||
    !Array.isArray(row.contentTypes) ||
    row.contentTypes.length > MAX_ACTIVITY_PROOF_FILES ||
    row.contentTypes.some((entry) => typeof entry !== 'string')
  )
    throw new PathwaysClientError('Invalid activity proof upload limits response.', 'network')
  return {
    maxFiles: row.maxFiles,
    maxFileBytes: row.maxFileBytes,
    maxTotalBytes: row.maxTotalBytes,
    contentTypes: row.contentTypes as string[],
  }
}

function parseActivityProofReservedFile(value: unknown): ActivityProofReservedFile {
  const row = value as Partial<Record<keyof ActivityProofReservedFile, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 7 ||
    typeof row.evidenceId !== 'string' ||
    typeof row.fileName !== 'string' ||
    typeof row.contentType !== 'string' ||
    !isFiniteNonNegative(row.byteSize) ||
    typeof row.sha256 !== 'string' ||
    typeof row.storageReady !== 'boolean' ||
    !isAllowedActivityProofUploadUrl(row.uploadUrl)
  )
    throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
  return {
    evidenceId: row.evidenceId,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    storageReady: row.storageReady,
    uploadUrl: row.uploadUrl,
  }
}

function parseActivityProofReservation(value: unknown): ActivityProofReservation {
  const row = value as Partial<Record<string, unknown>> | null
  if (!row || typeof row !== 'object' || typeof row.clientUpdateId !== 'string')
    throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
  if (row.status === 'COMMITTED') {
    if (Object.keys(row).length !== 3 || !('acknowledgement' in row))
      throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
    return {
      clientUpdateId: row.clientUpdateId,
      status: 'COMMITTED',
      acknowledgement: row.acknowledgement,
    }
  }
  if (row.status === 'UPLOADING' || row.status === 'READY_TO_COMMIT') {
    if (
      Object.keys(row).length !== 4 ||
      typeof row.updateId !== 'string' ||
      !Array.isArray(row.files) ||
      row.files.length > MAX_ACTIVITY_PROOF_FILES
    )
      throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
    return {
      clientUpdateId: row.clientUpdateId,
      updateId: row.updateId,
      status: row.status,
      files: row.files.map(parseActivityProofReservedFile),
    }
  }
  throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
}

function parseActivityProofFinalizeResult(value: unknown): ActivityProofFinalizeResult {
  const row = value as Partial<Record<string, unknown>> | null
  if (!row || typeof row !== 'object')
    throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
  if (row.status === 'COMMITTED') {
    if (Object.keys(row).length !== 2)
      throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
    if ('acknowledgement' in row) {
      return { status: 'COMMITTED', acknowledgement: row.acknowledgement }
    }
    if ('activity' in row) {
      const activityRow = row.activity as Partial<Record<string, unknown>> | null
      if (
        !activityRow ||
        typeof activityRow !== 'object' ||
        !('sourceAcknowledgement' in activityRow)
      )
        throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
      const { sourceAcknowledgement, ...activityFields } = activityRow
      const activity = parseActivity(activityFields)
      return { status: 'COMMITTED', activity: { ...activity, sourceAcknowledgement } }
    }
    throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
  }
  if (row.status === 'UPLOADING') {
    if (
      Object.keys(row).length !== 3 ||
      typeof row.updateId !== 'string' ||
      !isFiniteNonNegative(row.remaining)
    )
      throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
    return { status: 'UPLOADING', updateId: row.updateId, remaining: row.remaining }
  }
  throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
}

function parseActivity(value: unknown): Activity {
  const row = value as Partial<Activity> & {
    budgetAllocation?: unknown
    budgetLogged?: unknown
  }
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    !Array.isArray(row.assignedUserIds) ||
    !Array.isArray(row.assignedTo) ||
    !Array.isArray(row.assignedEmails) ||
    !Array.isArray(row.indicatorIds) ||
    !Array.isArray(row.journeyStageIds) ||
    !Array.isArray(row.submittedProof) ||
    !Array.isArray(row.updateNotes) ||
    typeof row.overdueExplanationNeeded !== 'boolean'
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  const budgetAllocation =
    row.budgetAllocation === null || row.budgetAllocation === undefined
      ? null
      : Number(row.budgetAllocation)
  // A response without the entry count predates the real logged total (it sent a fixed 0),
  // so its value is treated as withheld rather than shown.
  const legacyLogged = row.budgetLoggedEntries === undefined
  const budgetLogged =
    legacyLogged || row.budgetLogged === null || row.budgetLogged === undefined
      ? null
      : Number(row.budgetLogged)
  const budgetLoggedEntries = legacyLogged ? null : (row.budgetLoggedEntries ?? null)
  if (
    (budgetAllocation !== null && !Number.isFinite(budgetAllocation)) ||
    (budgetLogged !== null && !Number.isFinite(budgetLogged)) ||
    // A logged total and its entry count are both present or both withheld.
    (budgetLoggedEntries === null) !== (budgetLogged === null) ||
    (budgetLoggedEntries !== null &&
      (!Number.isInteger(budgetLoggedEntries) || budgetLoggedEntries < 0)) ||
    typeof row.beneficiariesReached !== 'number'
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return {
    ...(Object.fromEntries(
      activityResponseKeys.map((key) => [key, row[key]]),
    ) as unknown as Activity),
    budgetAllocation,
    budgetLogged,
    budgetLoggedEntries,
    capabilities: parseActivityCapabilities(row.capabilities),
    overdueExplanations: parseOverdueExplanations(row.overdueExplanations),
    overdueExplanationNeeded: row.overdueExplanationNeeded,
  }
}

// Lean activity list projection (feature/project-data-loading). Detail-only fields are
// never defaulted here: a list item simply does not carry them.
const activitySummaryKeys = [
  'id',
  'projectId',
  'code',
  'title',
  'description',
  'storedStatus',
  'status',
  'overdue',
  'startDate',
  'dueDate',
  'assignedUserIds',
  'assignedTo',
  'indicatorIds',
  'journeyStageIds',
  'journeyStageId',
  'targetBeneficiaries',
  'progress',
  'updatedAt',
  'capabilities',
  'overdueExplanationNeeded',
] as const satisfies readonly (keyof ActivitySummary)[]

const presentedActivityStatuses = new Set<string>([
  'Planned',
  'In Progress',
  'For Review',
  'Overdue',
  'Completed',
  'Cancelled',
] satisfies Activity['status'][])
const storedActivityStatuses = new Set<string>([
  'NOT_STARTED',
  'IN_PROGRESS',
  'FOR_REVIEW',
  'COMPLETED',
  'CANCELLED',
] satisfies Activity['storedStatus'][])

function parseActivitySummary(value: unknown): ActivitySummary {
  const row = value as Partial<ActivitySummary>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    typeof row.progress !== 'number' ||
    (row.code !== null && row.code !== undefined && typeof row.code !== 'string') ||
    typeof row.description !== 'string' ||
    !presentedActivityStatuses.has(row.status as string) ||
    !storedActivityStatuses.has(row.storedStatus as string) ||
    (row.overdue !== undefined && typeof row.overdue !== 'boolean') ||
    typeof row.startDate !== 'string' ||
    typeof row.dueDate !== 'string' ||
    typeof row.journeyStageId !== 'string' ||
    typeof row.targetBeneficiaries !== 'number' ||
    !Array.isArray(row.assignedUserIds) ||
    !Array.isArray(row.assignedTo) ||
    !Array.isArray(row.indicatorIds) ||
    !Array.isArray(row.journeyStageIds) ||
    typeof row.overdueExplanationNeeded !== 'boolean'
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return {
    ...(Object.fromEntries(
      activitySummaryKeys.map((key) => [key, row[key]]),
    ) as unknown as ActivitySummary),
    capabilities: parseActivityCapabilities(row.capabilities),
  }
}

function parseActivitySummaries(value: unknown): ActivitySummary[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return value.map(parseActivitySummary)
}

function dateOnly(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'string') throw new PathwaysClientError('Invalid date response.', 'network')
  return value.slice(0, 10)
}

function parseMilestone(value: unknown): ProjectMilestone {
  const row = value as Partial<ProjectMilestone> & {
    targetDate?: unknown
    completionDate?: unknown
    description?: unknown
  }
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.title !== 'string' ||
    !['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(String(row.status)) ||
    typeof row.updatedAt !== 'string'
  ) {
    throw new PathwaysClientError('Invalid milestone response.', 'network')
  }
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: typeof row.description === 'string' ? row.description : '',
    targetDate: dateOnly(row.targetDate),
    completionDate: dateOnly(row.completionDate),
    status: row.status as ProjectMilestone['status'],
    updatedAt: row.updatedAt,
  }
}

function parseMilestones(value: unknown): ProjectMilestone[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid milestone response.', 'network')
  }
  return value.map(parseMilestone)
}

function parseJourneyStage(value: unknown): JourneyStageConfig {
  const row = value as Partial<JourneyStageConfig>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.code !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.order !== 'number' ||
    !['Entry', 'Core', 'Branch', 'Follow-Up'].includes(String(row.type)) ||
    typeof row.terminal !== 'boolean' ||
    !Array.isArray(row.mappedActivityIds) ||
    typeof row.description !== 'string'
  ) {
    throw new PathwaysClientError('Invalid journey-stage response.', 'network')
  }
  if (row.parentStageId !== undefined && typeof row.parentStageId !== 'string') {
    throw new PathwaysClientError('Invalid journey-stage parent response.', 'network')
  }
  return row as JourneyStageConfig
}

function parseJourneyStages(value: unknown): JourneyStageConfig[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid journey-stage response.', 'network')
  }
  return value.map(parseJourneyStage)
}

function parseJourneyHistory(value: unknown): BeneficiaryJourneyHistory {
  const row = value as Partial<BeneficiaryJourneyHistory>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.projectId !== 'string' ||
    typeof row.beneficiaryId !== 'string' ||
    typeof row.enrollmentId !== 'string' ||
    typeof row.enrollmentStatus !== 'string' ||
    !Array.isArray(row.events) ||
    row.events.length > 500
  ) {
    throw new PathwaysClientError('Invalid journey-history response.', 'network')
  }
  for (const event of row.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.id !== 'string' ||
      typeof event.eventType !== 'string' ||
      typeof event.eventDate !== 'string' ||
      typeof event.recordedAt !== 'string' ||
      typeof event.recordedBy !== 'string'
    ) {
      throw new PathwaysClientError('Invalid journey-history response.', 'network')
    }
  }
  return row as BeneficiaryJourneyHistory
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
