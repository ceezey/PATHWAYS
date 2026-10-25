import type { StatusTone } from '@/lib/format/tone'
import type { PathwaysRole } from '@/types/pathways-role'
import type {
  ActivityCapabilitiesResponse,
  AssignableOfficerResponse,
  FieldIntakeRule,
  FormResponse,
  FormSubmissionResponse,
  ImportBatchDetailResponse,
  ImportBatchResponse,
  ImportDateOrder,
  ImportRowResponse,
  ImportRowsPageResponse,
  ImportSourceColumnResponse,
  OverdueExplanationCategory,
  SadddDashboard,
  DigitalFormType as SharedDigitalFormType,
  StoredProjectStatus,
} from '@pathways/shared'

export type ProjectStatus = 'Active' | 'Needs Attention' | 'Planned' | 'Completed'
export type HealthStatus = 'On Track' | 'At Risk' | 'Critical'
export type ActivityStatus =
  | 'Planned'
  | 'In Progress'
  | 'For Review'
  | 'Overdue'
  | 'Completed'
  | 'Cancelled'
type BeneficiaryEnrollmentStatus =
  | 'Active'
  | 'Pending Review'
  | 'Completed'
  | 'Exited'
  | 'Not recorded'
export type DashboardSeverity = StatusTone
export type DashboardActionKind = 'dialog' | 'navigate' | 'toast'

/** Project profile only. Overview metrics come from `GET /projects/:id/overview-metrics`. */
export interface ProjectTeamMember {
  userId: string
  fullName: string
  role: string
}

export interface ProjectSummary {
  description?: string
  targetBeneficiaries?: number

  startDate?: string | null
  endDate?: string | null
  id: string
  code?: string
  title: string
  area: string
  sector: string
  status: ProjectStatus
  storedStatus?: StoredProjectStatus
  health: HealthStatus
  period: string
  projectManager: string
  team?: ProjectTeamMember[]
  updatedAt?: string
  programId?: string | null
}

export interface ProjectDetail extends ProjectSummary {
  description: string
  objectives?: string
  /** Deprecated read-only legacy text (migration 0039); never displayed or sent. */
  implementingPartners?: string | null
  implementingPartnerRecords?: { id: string; name: string }[]
  projectBudget?: string | null
  programManager: string
  programManagerId?: string | null
  monitoringOfficer: string
  monitoringOfficerId?: string | null
  projectManagerId?: string | null
  projectOfficers: string[]
  projectOfficerIds?: string[]
  budgetCode: string
}

export interface CreateProjectInput {
  code?: string
  title: string
  implementationArea?: string
  objectives?: string
  startDate?: string
  endDate?: string
  status: ProjectStatus
  description?: string
  implementingPartnerNames?: string[]
  sector?: string
  targetBeneficiaries?: number | null
  projectBudget?: string
  programManagerId?: string | null
  projectManagerId?: string | null
  monitoringOfficerId?: string | null
  projectOfficerIds?: string[]
  programId?: string
}

export interface UpdateProjectInput extends Omit<CreateProjectInput, 'code' | 'status'> {
  code?: string
  status: ProjectStatus | StoredProjectStatus

  expectedUpdatedAt: string
}

export type StoredActivityStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'FOR_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED'

/**
 * Server-computed, advisory flags for the calling user. The API re-checks every mutation,
 * so these only decide which controls are shown. A missing flag set means none are shown.
 */
export type ActivityCapabilities = ActivityCapabilitiesResponse

/** One append-only entry from `activityOverdueExplanations` (cr-pathways-activity-overdue-explanation). */
export interface ActivityOverdueExplanation {
  id: string
  category: OverdueExplanationCategory
  explanation: string
  actorName: string
  recordedAt: string
}

export interface RecordOverdueExplanationInput {
  projectId: string
  activityId: string
  clientMutationId: string
  category: OverdueExplanationCategory
  explanation: string
}

/** Minimal projection from `GET /projects/:id/activities/assignable-officers`. */
export type AssignableProjectOfficer = AssignableOfficerResponse

export interface Activity {
  id: string
  projectId: string
  code?: string | null
  title: string
  description: string
  activityType?: string | null
  timelineOverrideJustification?: string | null
  storedStatus: StoredActivityStatus
  status: ActivityStatus
  overdue?: boolean
  startDate: string
  dueDate: string
  actualStartDate?: string | null
  actualEndDate?: string | null
  assignedUserIds: string[]
  assignedTo: string[]
  assignedEmails: string[]
  indicatorIds: string[]
  journeyStageIds: string[]
  journeyStageId: string
  targetBeneficiaries: number
  beneficiariesReached: number
  budgetAllocation: number | null
  budgetLogged: number | null
  /** Approved expense entries behind `budgetLogged`; null when expenses are not readable. */
  budgetLoggedEntries?: number | null
  progress: number

  reviewedById?: string | null
  reviewedAt?: string | null
  cancellationReason?: string | null
  submittedProof: ActivityProof[]
  updateNotes: ActivityUpdateNote[]
  updatedAt: string
  capabilities?: ActivityCapabilities
  overdueExplanations: ActivityOverdueExplanation[]
  overdueExplanationNeeded: boolean
}

/**
 * Lean list item from `GET /projects/:id/activities`. Update history, proof, assignee
 * emails and read metrics are detail-only: read them with `getActivity`.
 */
export type ActivitySummary = Pick<
  Activity,
  | 'id'
  | 'projectId'
  | 'code'
  | 'title'
  | 'description'
  | 'storedStatus'
  | 'status'
  | 'overdue'
  | 'startDate'
  | 'dueDate'
  | 'assignedUserIds'
  | 'assignedTo'
  | 'indicatorIds'
  | 'journeyStageIds'
  | 'journeyStageId'
  | 'targetBeneficiaries'
  | 'progress'
  | 'updatedAt'
  | 'capabilities'
  | 'overdueExplanationNeeded'
> & {
  /** List-only metrics; null or absent means not readable or no source, never zero. */
  indicatorCount?: number
  beneficiariesReached?: number | null
  beneficiariesTarget?: number | null
  budgetUtilization?: number | null
}

export interface ActivityProof {
  id: string
  updateId: string
  fileName: string
  /** Unsaved browser file previews; persisted proof is read from the API. */
  files?: ActivityProofFile[]
  fileNames?: string[]
  status: 'Submitted' | 'Flagged' | 'Accepted'
  /** Why this file alone was judged insufficient; set only on a flagged file. */
  rejectionReason?: string | null
  submittedAt: string
  submittedBy: string
  updateUpdatedAt: string
  note?: string
}

export interface ActivityProofFile {
  id: string
  name: string
  type: string
  size: number
}

export interface ActivityUpdateNote {
  id: string
  /** 'progress' marks a progress-only note without proof files. */
  kind?: 'proof' | 'progress'
  note: string
  progress: number
  /** Optional, recorded on this submission only (cr-pathways-proof-session-beneficiary-count). */
  beneficiariesReachedThisSession?: number | null
  status: 'Submitted' | 'Flagged' | 'Accepted'
  submittedBy: string
  submittedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewReason: string | null
  updatedAt: string
  /** True while a PENDING proof update still has files whose bytes are not verified in storage. */
  proofIncomplete?: boolean
  /** Only sent to the submitting user of an incomplete proof, so they can resume it. */
  resumeClientUpdateId?: string | null
}

export interface CreateActivityInput {
  projectId: string
  title: string
  description: string
  startDate: string
  dueDate: string
  timelineOverrideJustification?: string
  targetBeneficiaries?: number | null
  budgetAllocation?: string
  assignedUserIds: string[]
  indicatorIds?: string[]
  journeyStageId?: string | null
}

export interface UpdateActivityInput extends CreateActivityInput {
  id: string
  expectedUpdatedAt: string
}

export interface RecordActivityProgressInput {
  projectId: string
  activityId: string
  clientUpdateId: string
  progress: number
  note: string
}

// --- Direct-upload activity proof (cr-pathways-activity-progress-media) ---

export interface ActivityProofUploadLimits {
  maxFiles: number
  maxFileBytes: number
  maxTotalBytes: number
  contentTypes: string[]
}

export interface ActivityProofFileDeclaration {
  fileName: string
  contentType: string
  byteSize: number
  sha256: string
}

export interface ReserveActivityProofUploadInput {
  projectId: string
  activityId: string
  clientUpdateId: string
  progressPercent: number
  note: string
  files: ActivityProofFileDeclaration[]
  /** Optional, recorded on this submission only (cr-pathways-proof-session-beneficiary-count). */
  beneficiariesReachedThisSession?: number
}

export interface ActivityProofReservedFile {
  evidenceId: string
  fileName: string
  contentType: string
  byteSize: number
  sha256: string
  storageReady: boolean
  uploadUrl: string | null
}

export type ActivityProofReservation =
  | {
      clientUpdateId: string
      status: 'COMMITTED'
      acknowledgement: unknown
    }
  | {
      clientUpdateId: string
      updateId: string
      status: 'UPLOADING' | 'READY_TO_COMMIT'
      files: ActivityProofReservedFile[]
    }

export type ActivityProofFinalizeResult =
  | { status: 'COMMITTED'; acknowledgement: unknown }
  | { status: 'COMMITTED'; activity: Activity & { sourceAcknowledgement: unknown } }
  | { status: 'UPLOADING'; updateId: string; remaining: number }

interface Beneficiary {
  id: string
  code: string
  displayName: string
  projectIds: string[]
  location: string
  sex: 'Female' | 'Male' | 'Other' | 'Prefer not to say' | 'Not specified'
  ageGroup?: '5-9' | '10-14' | '15-17' | '18-24' | '25+' | 'Unknown'
  disabilityStatus: 'With disability' | 'Without disability' | 'Not specified'
  enrollmentStatus: BeneficiaryEnrollmentStatus
}

export type JourneyStageType = 'Entry' | 'Core' | 'Branch' | 'Follow-Up'

export interface JourneyStageConfig {
  id: string
  projectId: string
  code: string
  name: string
  order: number
  type: JourneyStageType
  parentStageId?: string
  terminal: boolean
  mappedActivityIds: string[]
  description: string
  archived?: boolean
  updatedAt?: string
}

type JourneyEventType =
  | 'ENROLLMENT'
  | 'PARTICIPATION'
  | 'PROGRESS_UPDATE'
  | 'COMPLETION'
  | 'FOLLOW_UP'
  | 'DROPOUT'
  | 'TRANSFER'

export interface BeneficiaryJourneyEvent {
  id: string
  eventType: JourneyEventType
  eventDate: string
  description: string | null
  note?: string | null
  stageId: string | null
  stageCodeSnapshot: string | null
  stageNameSnapshot: string | null
  activityId: string | null
  activityCodeSnapshot: string | null
  activityTitleSnapshot: string | null
  participationId: string | null
  participation: {
    attendanceStatus: string
    progressStatus: string
  } | null
  correctsEventId: string | null
  correctionReason: string | null
  recordedAt: string
  recordedBy: string
}

export interface BeneficiaryJourneyHistory {
  projectId: string
  beneficiaryId: string
  enrollmentId: string
  enrollmentStatus: string
  events: BeneficiaryJourneyEvent[]
}

export interface EnrollmentJourneyEventInput {
  eventType: 'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT' | 'TRANSFER'
  eventDate: string
  description: string
  stageId?: string
  destinationProjectId?: string
  note?: string
}

export interface CorrectJourneyEventInput {
  eventDate: string
  description: string
  reason: string
  note?: string
  stageId?: string
}

export interface BeneficiaryEnrollment {
  id: string
  projectId: string
  status: BeneficiaryEnrollmentStatus
  enrolledAt: string
  followUpStatus: 'Not recorded' | 'Not due' | 'Scheduled' | 'Needs follow-up' | 'Completed'
}

export interface BeneficiaryParticipationRecord {
  id: string
  beneficiaryId: string
  projectId: string
  activityId: string
  participatedAt: string
  attendanceStatus: 'Present' | 'Partial' | 'Absent' | 'Completed' | 'Not completed' | 'Excused'
  note: string
}

export interface BeneficiaryAssessmentRecord {
  id: string
  beneficiaryId: string
  projectId: string
  stageId: string
  type: 'PRE_TEST' | 'POST_TEST' | 'OUTCOME_SURVEY' | 'FEEDBACK_SURVEY' | 'OTHER'
  title: string
  assessedAt: string
  score: number
  maximumScore: number
  source: string
  note: string
}

export interface BeneficiaryNoteRecord {
  id: string
  beneficiaryId: string
  projectId: string
  stageId: string
  author: string
  createdAt: string
  visibility: 'Internal' | 'Project team'
  note: string
  journeyNote?: string
}

export interface BeneficiaryMediaItem {
  id: string
  type: 'PHOTO' | 'VIDEO'
  fileName: string
  contentType: string
  byteSize: number
  description: string | null
  submittedAt: string
  submittedBy: string
  storageReady: boolean
}

export interface BeneficiaryMediaLimits {
  maxFiles: number
  maxFileBytes: number
  contentTypes: string[]
}

export interface BeneficiaryMediaReservedFile {
  mediaId: string
  fileName: string
  contentType: string
  byteSize: number
  sha256: string
  uploadUrl: string | null
}

/** Server-computed directory summary; restricted when the caller cannot read journeys. */
export type BeneficiaryProgress =
  | { restricted: true }
  | {
      restricted: false
      lastParticipation: { activityId: string; title: string; date: string } | null
      stage: { code: string; name: string; progressPercent: number } | null
    }

export interface BeneficiaryRecord extends Beneficiary {
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY' | 'UNSPECIFIED_LEGACY'
  firstName: string
  middleName?: string
  lastName: string
  birthDate?: string
  age?: number
  province: string
  city: string
  barangay: string
  consentToParticipate: boolean
  consentToStoreData: boolean
  isMinor: boolean
  guardianConsent: boolean
  enrollments: BeneficiaryEnrollment[]
  participation: BeneficiaryParticipationRecord[]
  /** Present only on directory list rows. */
  progress?: BeneficiaryProgress
  assessments: BeneficiaryAssessmentRecord[]
  notes: BeneficiaryNoteRecord[]
  updatedAt: string
  consentProvenance: Array<{
    kind: 'PARTICIPATION' | 'DATA_PROCESSING' | 'GUARDIAN'
    source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET'
    recordedAt: string
  }>
}

export interface UpdateBeneficiaryInput {
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'
  displayName?: string
  firstName?: string
  middleName?: string
  lastName?: string
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'
  birthDate?: string
  ageAtRegistration?: number
  disabilityStatus: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'
  locationBarangay?: string
  locationCityMunicipality?: string
  locationProvince?: string
  expectedUpdatedAt: string
}

/** Activity links need definition identity only, not a second numeric authority. */
export interface Indicator {
  id: string
  projectId: string
  code: string
  label: string
}

export type EvidenceReviewStatus = 'Submitted' | 'Validated' | 'Flagged' | 'Approved' | 'Returned'

export interface EvidenceRecord {
  id: string
  projectId: string
  activityId: string
  updateId: string
  updateUpdatedAt: string
  fileName: string
  reportTitle: string
  status: EvidenceReviewStatus
  submitter: string
  submittedDate: string
  previewSummary: string
  contentType: string
  byteSize: number
  isIdentifying: boolean
  reviewedDate: string | null
  reviewer: string | null
}

/** Aggregate-only roles receive per-activity counts, never file or submitter detail. */
export interface EvidenceActivitySummary {
  activityId: string
  activityTitle: string
  total: number
  submitted: number
  approved: number
  returned: number
}

export type EvidenceList =
  | { scope: 'detail'; records: EvidenceRecord[] }
  | { scope: 'aggregate'; activities: EvidenceActivitySummary[] }

export interface BudgetRecord {
  id: string
  projectId: string
  plannedAmount: number
  actualSpending: number
}

export type LiquidationStatus = 'Pending' | 'Verified' | 'Approved' | 'Rejected'

export interface ExpenseRecord {
  id: string
  projectId: string
  description: string
  amount: number
  submitter: string
  submittedDate: string
  expenseDate: string
  hasReceipt: boolean
  receiptFileName?: string
  liquidationStatus: LiquidationStatus
  rejectionReason?: string
}

export interface AlertRecord {
  id: string
  projectId: string
  severity: 'Information' | 'Warning' | 'Critical'
  category: 'Activity' | 'Indicator' | 'Budget' | 'Beneficiary Progress' | 'Assessment'
  title: string
  description: string
  createdAt: string
  lifecycleStatus: AlertLifecycleStatus
  relatedType: 'Activity' | 'Indicator' | 'Budget' | 'Beneficiary Progress' | 'Assessment'
  relatedId: string
  currentValue: number
  threshold: number
  ruleId: string
  actionNote?: string
}

export type AlertLifecycleStatus =
  | 'New'
  | 'Reviewed'
  | 'Actioned'
  | 'Resolved'
  | 'Dismissed'
  | 'Auto-resolved'

export type FormFieldDataType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTIPLE_SELECT'

export type DigitalFormType = SharedDigitalFormType

export interface DigitalFormFieldDefinition {
  id?: string
  code: string
  label: string
  dataType: FormFieldDataType
  required: boolean
  metadataKey: boolean
  sadddField: boolean
  allowedValues?: string[] | null
  minimumValue?: string | null
  maximumValue?: string | null
  minimumDate?: string | null
  maximumDate?: string | null
  minimumLength?: number | null
  maximumLength?: number | null
  sourceNames?: string[] | null
  valueAliases?: Array<{ from: string; to: string }> | null
  importDefault?: string | null
  rule?: FieldIntakeRule | null
  sequence?: number
}

export type DigitalFormDefinition = FormResponse

export interface SaveDigitalFormInput {
  code: string
  name: string
  description?: string
  formType: DigitalFormType
  activityId?: string
  journeyStageId?: string
  fields: DigitalFormFieldDefinition[]
}

export interface FormValidationError {
  fieldCode: string
  code: string
  message: string
}

export interface FormValidationResult {
  valid: boolean
  values: Record<string, string | number | boolean | string[] | null>
  errors: FormValidationError[]
}

export type DirectFormSubmission = FormSubmissionResponse

export type ImportBatchStatus = ImportBatchResponse['status']

export type ImportSourceColumn = ImportSourceColumnResponse

// A batch from any import route; only the detail route fills the source columns and mappings.
export type ImportBatchDefinition = ImportBatchResponse &
  Partial<
    Pick<ImportBatchDetailResponse, 'sourceHeaders' | 'sourceColumns' | 'mappings' | 'coverage'>
  >

export type ImportRowDefinition = ImportRowResponse

export type ImportRowsPage = ImportRowsPageResponse

export interface ImportMappingInput {
  sourceFieldName: string
  targetFieldCode?: string
  ignored: boolean
  /** Declared type of the translated values; must fit the target field. */
  dataType?: FormFieldDataType
  /** Exact-match translations applied before coercion; at most 50 entries. */
  valueMap?: Array<{ from: string; to: string }>
  /** Where the year, month and day sit in a text date column. */
  dateOrder?: ImportDateOrder
}

export type ReportKind =
  | 'project-summary'
  | 'indicator-summary'
  | 'beneficiary-summary'
  | 'survey-results'

export interface UserRecord {
  id: string
  authUserId?: string | null
  name: string
  email: string
  role: PathwaysRole
  accountStatus: UserAccountStatus
  signInMethod: 'Supabase account'
  projectIds: string[]
  projectAccess: string[]
  createdAt: string
  lastActiveAt?: string
}

export type UserAccountStatus = 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'Archived'

export interface AuthorizeExistingUserInput {
  authUserId: string
  fullName: string
  role: PathwaysRole
  projectIds: string[]
}

export interface UpdateAuthorizedUserInput {
  fullName?: string
  role: PathwaysRole
  accountStatus: 'Active' | 'Deactivated'
  projectIds: string[]
}

export interface BeneficiaryFilters {
  search?: string
  projectId?: string
  location?: string
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'
  ageBand?: '0-9' | '10-14' | '15-17' | '18-24' | '25+' | 'Unknown'
  disabilityStatus?: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'
  enrollmentStatus?: 'ACTIVE' | 'COMPLETED' | 'EXITED'
}

export interface DashboardMetric {
  id: string
  label: string
  value: string | number
  helperText: string
  severity?: DashboardSeverity
  href?: string
}

export interface DashboardAction {
  id: string
  label: string
  kind: DashboardActionKind
  href?: string
  dialogTitle?: string
  dialogDescription?: string
  toastTitle?: string
  toastDescription?: string
}

export interface DashboardItem {
  id: string
  title: string
  description: string
  meta?: string
  status?: string
  severity?: DashboardSeverity
  progress?: number
  href?: string
  primaryAction?: DashboardAction
  secondaryAction?: DashboardAction
}

export interface DashboardSection {
  id: string
  title: string
  description?: string
  emptyText?: string
  viewAllHref?: string
  viewAllLabel?: string
  items: DashboardItem[]
}

export type ExecutiveDeliveryStatus = 'On Track' | 'At Risk' | 'Behind Schedule'
export type ExecutiveGoalOutlook =
  | 'Achievable'
  | 'Achievable with intervention'
  | 'Needs recovery plan'

export interface ExecutiveDashboardContext {
  id: string
  selectorLabel: string
  projectId?: string
  title: string
  scopeLabel: string
  deliveryStatus: ExecutiveDeliveryStatus
  deliverySummary: string
  goalAchievement: number
  goalOutlook: ExecutiveGoalOutlook
  milestonesCompleted: number
  milestonesTotal: number
  nextMilestone: string
  budgetUtilization: number
  scheduleProgress: number
  riskLabel: string
  riskSummary: string
  riskSeverity: DashboardSeverity
}

export interface ExecutiveDashboardViewModel {
  defaultContextId: string
  contexts: ExecutiveDashboardContext[]
}

export interface RoleDashboardViewModel {
  role: PathwaysRole
  greetingName: string
  heading: string
  summary: string
  primaryAction?: DashboardAction
  executive?: ExecutiveDashboardViewModel
  metrics: DashboardMetric[]
  sections: DashboardSection[]
}

export interface BeneficiaryRegistrationContext {
  projectId: string
  businessDate: string
  definitions: {
    id: string
    code: string
    version: number
    name: string
    formType: 'BENEFICIARY_REGISTRATION'
    status: 'PUBLISHED'
    fields: DigitalFormFieldDefinition[]
  }[]
}
