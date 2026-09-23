import { contextCookieName, decodeWorkspaceContext } from '@/features/auth/workspace-access'
import { webEnv } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type {
  Activity,
  AlertRecord,
  AnalyticsLocationRecord,
  AuthorizeExistingUserInput,
  BeneficiaryFilters,
  BeneficiaryJourneyHistory,
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
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
  RegisterBeneficiaryInput,
  ReportRecord,
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
  type CreateIndicatorInput,
  type DashboardQuery,
  type ManualMeasurementInput,
  type MonitoringDashboard,
  type SadddDashboard,
  type SadddQuery,
  type UpdateIndicatorInput,
  dashboardQuerySchema,
  formatMetricCell,
  monitoringDashboardSchema,
  monitoringIndicatorListSchema,
  monitoringIndicatorSchema,
  sadddDashboardSchema,
  sadddQuerySchema,
} from '@pathways/shared'

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
  ) {
    super(message)
    this.name = 'PathwaysClientError'
  }
}

export interface PathwaysClient {
  getProjects(): Promise<ProjectSummary[]>
  getProjectsForRole(role: PathwaysRole): Promise<ProjectSummary[]>
  getProject(id: string): Promise<ProjectDetail>
  createProject(input: CreateProjectInput): Promise<ProjectDetail>
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDetail>
  updateProjectPeriod(id: string, endDate: string): Promise<ProjectDetail>
  getActivities(projectId: string): Promise<Activity[]>
  getActivity(projectId: string, activityId: string): Promise<Activity>
  createActivity(input: CreateActivityInput): Promise<Activity>
  updateActivity(input: UpdateActivityInput): Promise<Activity>
  transitionActivity(
    projectId: string,
    activityId: string,
    status: 'IN_PROGRESS' | 'CANCELLED',
    expectedUpdatedAt: string,
    reason?: string,
  ): Promise<Activity>
  submitActivityProof(input: SubmitActivityProofInput): Promise<Activity>
  reviewActivityUpdate(
    projectId: string,
    activityId: string,
    updateId: string,
    decision: 'APPROVE' | 'RETURN',
    reason: string,
    expectedUpdatedAt: string,
  ): Promise<Activity>
  downloadActivityProof(projectId: string, activityId: string, evidenceId: string): Promise<Blob>
  getMilestones(projectId: string): Promise<ProjectMilestone[]>
  createMilestone(projectId: string, input: SaveMilestoneInput): Promise<ProjectMilestone>
  updateMilestone(
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<ProjectMilestone>
  getEvidence(projectId: string): Promise<EvidenceRecord[]>
  getProjectIndicators(projectId: string): Promise<ProjectIndicator[]>
  getProjectIndicator(projectId: string, indicatorId: string): Promise<ProjectIndicator>
  createProjectIndicator(projectId: string, input: CreateIndicatorInput): Promise<ProjectIndicator>
  updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: UpdateIndicatorInput,
  ): Promise<ProjectIndicator>
  recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: ManualMeasurementInput,
  ): Promise<ProjectIndicator>
  archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
  ): Promise<ProjectIndicator>
  getMonitoringDashboard(query?: DashboardQuery): Promise<MonitoringDashboard>
  getSadddDashboard(query: SadddQuery): Promise<SadddDashboard>
  getEvaluation(projectId: string): Promise<EvaluationRecord>
  getExpenses(projectId: string): Promise<ExpenseRecord[]>
  getRecommendationOutcomes(projectId: string): Promise<RecommendationOutcomeRecord[]>
  getTransparencySections(projectId: string): Promise<TransparencySection[]>
  getBeneficiaryRecordsForRole(
    role: PathwaysRole,
    projectId?: string,
    filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]>
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
  getJourneyStages(projectId: string): Promise<JourneyStageConfig[]>
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
  getIndicators(projectId?: string): Promise<Indicator[]>
  getBudgets(projectId?: string): Promise<BudgetRecord[]>
  getAlerts(projectId?: string): Promise<AlertRecord[]>
  getAlertsForRole(role: PathwaysRole, projectId?: string): Promise<AlertRecord[]>
  getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]>
  getRecommendations(): Promise<RecommendationRecord[]>
  getRecommendationsForRole(role: PathwaysRole): Promise<RecommendationRecord[]>
  getRules(): Promise<RuleDefinition[]>
  getReports(projectId?: string): Promise<ReportRecord[]>
  getSurveyForms(projectId?: string): Promise<SurveyFormDefinition[]>
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
  getUsers(): Promise<UserRecord[]>
  authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>
  updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>
  getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel>
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
  async getProjects(): Promise<ProjectSummary[]> {
    return requestFoundation('/projects').then(parseProjects)
  }

  async getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]> {
    return this.getProjects()
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return mapProject(
      (await requestFoundation(`/projects/${encodeURIComponent(id)}`)) as ApiProject,
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

  async updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    return mapProject(
      (await requestFoundation(`/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...input, status: apiProjectStatus(input.status) }),
      })) as ApiProject,
    )
  }

  async updateProjectPeriod(id: string, endDate: string): Promise<ProjectDetail> {
    const path = `/projects/${encodeURIComponent(id)}`
    const current = (await requestFoundation(path)) as ApiProject
    return mapProject(
      (await requestFoundation(path, {
        method: 'PATCH',
        body: JSON.stringify({
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
        }),
      })) as ApiProject,
    )
  }

  async getActivities(projectId: string): Promise<Activity[]> {
    return requestFoundation(`/projects/${encodeURIComponent(projectId)}/activities`).then(
      parseActivities,
    )
  }

  async getActivity(projectId: string, activityId: string): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}`,
      ),
    )
  }

  async createActivity(input: CreateActivityInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(`/projects/${encodeURIComponent(input.projectId)}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          plannedStartDate: input.startDate,
          plannedEndDate: input.dueDate,
          assignedUserIds: input.assignedUserIds,
        }),
      }),
    )
  }

  async updateActivity(input: UpdateActivityInput): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: input.title,
            description: input.description,
            plannedStartDate: input.startDate,
            plannedEndDate: input.dueDate,
            assignedUserIds: input.assignedUserIds,
            expectedUpdatedAt: input.expectedUpdatedAt,
          }),
        },
      ),
    )
  }

  async transitionActivity(
    projectId: string,
    activityId: string,
    status: 'IN_PROGRESS' | 'CANCELLED',
    expectedUpdatedAt: string,
    reason?: string,
  ): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ status, expectedUpdatedAt, reason }),
        },
      ),
    )
  }

  async submitActivityProof(input: SubmitActivityProofInput): Promise<Activity> {
    const body = new FormData()
    body.set('clientUpdateId', input.clientUpdateId)
    body.set('progressPercent', String(input.progress))
    body.set('note', input.note)
    for (const file of input.files) body.append('files', file, file.name)
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(input.projectId)}/activities/${encodeURIComponent(input.activityId)}/updates`,
        { method: 'POST', body },
      ),
    )
  }

  async reviewActivityUpdate(
    projectId: string,
    activityId: string,
    updateId: string,
    decision: 'APPROVE' | 'RETURN',
    reason: string,
    expectedUpdatedAt: string,
  ): Promise<Activity> {
    return parseActivity(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, reason, expectedUpdatedAt }),
        },
      ),
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

  async getEvidence(projectId: string): Promise<EvidenceRecord[]> {
    const activities = await this.getActivities(projectId)
    return activities.flatMap((activity) =>
      activity.submittedProof.map((proof) => ({
        id: proof.id,
        projectId: activity.projectId,
        activityId: activity.id,
        updateId: proof.updateId,
        updateUpdatedAt: proof.updateUpdatedAt,
        fileName: proof.fileName,
        reportTitle: activity.title,
        status:
          proof.status === 'Accepted'
            ? 'Approved'
            : proof.status === 'Flagged'
              ? 'Returned'
              : 'Submitted',
        submitter: proof.submittedBy,
        submittedDate: proof.submittedAt,
        previewSummary: proof.note ?? 'Activity evidence submission',
      })),
    )
  }

  async getProjectIndicators(projectId: string): Promise<ProjectIndicator[]> {
    return monitoringIndicatorListSchema.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicators`),
    )
  }

  async getProjectIndicator(projectId: string, indicatorId: string): Promise<ProjectIndicator> {
    return monitoringIndicatorSchema.parse(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
      ),
    )
  }

  async createProjectIndicator(
    projectId: string,
    input: CreateIndicatorInput,
  ): Promise<ProjectIndicator> {
    return monitoringIndicatorSchema.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicators`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  }

  async updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: UpdateIndicatorInput,
  ): Promise<ProjectIndicator> {
    return monitoringIndicatorSchema.parse(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),
    )
  }

  async recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: ManualMeasurementInput,
  ): Promise<ProjectIndicator> {
    return monitoringIndicatorSchema.parse(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/measurements`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    )
  }

  async archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
  ): Promise<ProjectIndicator> {
    return monitoringIndicatorSchema.parse(
      await requestFoundation(
        `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/archive`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedRevision }),
        },
      ),
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

  async getJourneyStages(projectId: string): Promise<JourneyStageConfig[]> {
    return parseJourneyStages(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/journey-stages`),
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
    ) as Promise<{ enrollmentId: string; eventType: string; eventDate: string }>
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

  async getIndicators(projectId?: string): Promise<Indicator[]> {
    if (!projectId) {
      throw new PathwaysClientError('Project scope is required.', 'invalid')
    }

    return (await this.getProjectIndicators(projectId)).map(
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
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions`,
      { method: 'POST', body: JSON.stringify({ clientSubmissionId, values }) },
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

  async saveImportMapping(
    projectId: string,
    batchId: string,
    expectedMappingRevision: number,
    mappings: ImportMappingInput[],
  ) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/mapping`,
      { method: 'PATCH', body: JSON.stringify({ expectedMappingRevision, mappings }) },
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
    throw backendNotConfigured('Published project list')
  }

  async getPublicProject(_id: string): Promise<PublicProjectRecord> {
    throw backendNotConfigured('Published project details')
  }

  async getUsers(): Promise<UserRecord[]> {
    return requestFoundation('/users').then(parseUsers)
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
      summary: `${result.periodStart} to ${result.periodEnd} · ${result.businessTimeZone}. Current operational states; no automated success rating.`,
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
  startDate?: string
  endDate?: string
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
  programId: string | null
  projectManager: string | null
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

function readContextCookie() {
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)
  return value
}

async function requestFoundationResponse(path: string, init: RequestInit = {}) {
  if (typeof window === 'undefined')
    throw new PathwaysClientError('Browser session required.', 'unauthorized')
  const supabase = getBrowserSupabaseClient()
  if (!supabase)
    throw new PathwaysClientError('Authentication is not configured.', 'not_configured')
  const { data, error } = await supabase.auth.getSession()
  const session = data.session
  if (error || !session)
    throw new PathwaysClientError('Current session unavailable.', 'unauthorized')
  const context = decodeWorkspaceContext(readContextCookie(), session.user.id)
  if (!context) throw new PathwaysClientError('Workspace context unavailable.', 'forbidden')
  const base = new URL(webEnv.NEXT_PUBLIC_API_BASE_URL)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new PathwaysClientError('API endpoint is not approved.', 'not_configured')
  }
  base.hostname = '127.0.0.1'
  const isMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData
  const response = await fetch(`${base.toString().replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      'X-Pathways-Organization-Id': context.organizationId,
      'X-Pathways-User-Id': context.userId,
      ...init.headers,
    },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) {
    let fieldErrors: FormValidationError[] = []
    let serverMessage: string | undefined
    if (response.status === 400 || response.status === 409) {
      const body = (await response.json().catch(() => null)) as {
        message?: { errors?: unknown; message?: unknown } | string | unknown[]
        errors?: unknown
      } | null
      const candidate =
        body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
          ? body.message.errors
          : body?.errors
      const candidateMessage =
        typeof body?.message === 'string'
          ? body.message
          : body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
            ? body.message.message
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
            : response.status === 400 || response.status === 409
              ? 'invalid'
              : 'network'
    throw new PathwaysClientError(
      fieldErrors.length
        ? 'Review the highlighted form fields.'
        : (serverMessage ?? 'The requested operation could not be completed.'),
      code,
      fieldErrors,
    )
  }
  return response
}

async function requestFoundation(path: string, init: RequestInit = {}) {
  const response = await requestFoundationResponse(path, init)
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
    [project.startDate, project.endDate].filter(Boolean).join(' – ') || 'Dates not recorded'
  return {
    metricsAvailable: false,
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description ?? '',
    objectives: project.objectives ?? '',
    area: project.implementationArea ?? 'Area not recorded',
    sector: 'Sector not recorded',
    status,
    storedStatus: project.status,
    health: status === 'Needs Attention' ? 'At Risk' : 'On Track',
    period,
    projectManager: project.projectManager ?? 'Not assigned',
    kpiAchievement: 0,
    beneficiariesReached: 0,
    budgetUtilization: 0,
    timelineProgress: 0,
    programManager: 'Not assigned',
    monitoringOfficer: 'Not assigned',
    projectOfficers: [],
    targetBeneficiaries: 0,
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

function parseActivity(value: unknown): Activity {
  const row = value as Partial<Activity>
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
    !Array.isArray(row.updateNotes)
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return row as Activity
}

function parseActivities(value: unknown): Activity[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return value.map(parseActivity)
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
