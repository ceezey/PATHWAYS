import {
  type AutomaticMappingReceipt,
  parseAutomaticMappingReceipt,
} from './automatic-mapping-receipt'
import {
  type SourceMutationContext,
  ensureSourceInvalidationSubscription,
  sourceMutationTickets,
} from './source-mutation'

import { isFiniteNonNegative } from '@/lib/api/core/guards'
import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import type {
  ActivityProofFileDeclaration,
  AuthorizeExistingUserInput,
  BeneficiaryFilters,
  BeneficiaryJourneyHistory,
  BeneficiaryMediaItem,
  BeneficiaryMediaLimits,
  BeneficiaryMediaReservedFile,
  BeneficiaryRecord,
  BeneficiaryRegistrationContext,
  CorrectJourneyEventInput,
  DigitalFormDefinition,
  DirectFormSubmission,
  EnrollmentJourneyEventInput,
  FormValidationResult,
  ImportBatchDefinition,
  ImportMappingInput,
  ImportRowsPage,
  JourneyStageConfig,
  RegisterBeneficiaryInput,
  RoleDashboardViewModel,
  SaveDigitalFormInput,
  UpdateAuthorizedUserInput,
  UpdateBeneficiaryInput,
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
import { parseRegistrationContext } from './registration-context'

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
  getDuplicateCandidates(projectId: string): Promise<DuplicateCandidatePair[]>
  resolveDuplicate(projectId: string, input: ResolveDuplicateInput): Promise<void>
  listBeneficiaryMedia(projectId: string, beneficiaryId: string): Promise<BeneficiaryMediaItem[]>
  getBeneficiaryMediaLimits(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaLimits>
  reserveBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
    input: { files: ActivityProofFileDeclaration[]; note?: string },
  ): Promise<BeneficiaryMediaReservedFile[]>
  finalizeBeneficiaryMedia(projectId: string, beneficiaryId: string, mediaId: string): Promise<void>
  getBeneficiaryMediaBlob(projectId: string, beneficiaryId: string, mediaId: string): Promise<Blob>
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
  getUsers(signal?: AbortSignal): Promise<UserRecord[]>
  authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>
  updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>
  getDashboard(role: PathwaysRole): Promise<RoleDashboardViewModel>
}

const beneficiaryMediaPath = (projectId: string, beneficiaryId: string) =>
  `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/media`

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

  async getDuplicateCandidates(projectId: string): Promise<DuplicateCandidatePair[]> {
    return (await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/duplicate-candidates`,
    )) as DuplicateCandidatePair[]
  }

  async resolveDuplicate(projectId: string, input: ResolveDuplicateInput): Promise<void> {
    await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/duplicate-candidates/resolve`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  }

  async listBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaItem[]> {
    const rows = await requestFoundation(beneficiaryMediaPath(projectId, beneficiaryId))
    if (!Array.isArray(rows))
      throw new PathwaysClientError('Invalid beneficiary media response.', 'network')
    return rows as BeneficiaryMediaItem[]
  }

  async getBeneficiaryMediaLimits(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaLimits> {
    const limits = await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/limits`,
    )
    if (!isFiniteNonNegative(limits?.maxFiles) || !isFiniteNonNegative(limits?.maxFileBytes))
      throw new PathwaysClientError('Invalid beneficiary media limits response.', 'network')
    return limits as BeneficiaryMediaLimits
  }

  async reserveBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
    input: { files: ActivityProofFileDeclaration[]; note?: string },
  ): Promise<BeneficiaryMediaReservedFile[]> {
    const reserved = await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/reservations`,
      { method: 'POST', body: JSON.stringify(input) },
    )
    if (!Array.isArray(reserved?.files))
      throw new PathwaysClientError('Invalid beneficiary media reservation response.', 'network')
    return reserved.files as BeneficiaryMediaReservedFile[]
  }

  async finalizeBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ): Promise<void> {
    await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/${encodeURIComponent(mediaId)}/finalize`,
      { method: 'POST' },
    )
  }

  async getBeneficiaryMediaBlob(
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ): Promise<Blob> {
    const response = await requestFoundationResponse(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/${encodeURIComponent(mediaId)}/content`,
    )
    return response.blob()
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
  progress?: BeneficiaryRecord['progress']
  updatedAt: string
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

export type DuplicateProfile = {
  id: string
  code: string
  name: string
  birthDate: string
  location: string
  updatedAt: string
}
export type DuplicateCandidatePair = { left: DuplicateProfile; right: DuplicateProfile }
type ResolveDuplicateInput = {
  leftId: string
  rightId: string
  decision: 'KEEP_DISTINCT' | 'LINK'
}

// Whole years from a YYYY-MM-DD birth date to the enrollment date, or today without one.
const ageFromBirthDate = (birthDate?: string, asOf?: string) => {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number)
  const [ay, am, ad] = (asOf ?? new Date().toISOString()).slice(0, 10).split('-').map(Number)
  if (!by || !ay) return null
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0)
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
  // Rows registered with a birth date store no age, so derive it at enrollment like the API does.
  const age =
    row.ageAtRegistration ?? ageFromBirthDate(row.birthDate, row.enrollment?.enrollmentDate)
  const ageGroup =
    age === null
      ? 'Unknown'
      : age <= 9
        ? '5-9'
        : age <= 14
          ? '10-14'
          : age <= 17
            ? '15-17'
            : age <= 24
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
    age: age ?? undefined,
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
    ...(row.progress ? { progress: row.progress } : {}),
    assessments: [],
    notes: [],
    updatedAt: row.updatedAt,
    consentProvenance: row.consentProvenance,
  }
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
