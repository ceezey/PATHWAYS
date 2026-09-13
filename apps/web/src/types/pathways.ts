import type { PathwaysRole } from '@/types/pathways-role'

export type ProjectStatus = 'Active' | 'Needs Attention' | 'Planned' | 'Completed'
export type HealthStatus = 'On Track' | 'At Risk' | 'Critical'
export type ActivityStatus = 'Planned' | 'In Progress' | 'For Review' | 'Overdue' | 'Completed'
export type BeneficiaryEnrollmentStatus = 'Active' | 'Pending Review' | 'Completed' | 'Exited'
export type DashboardSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type DashboardActionKind = 'dialog' | 'navigate' | 'toast'

export interface ProjectSummary {
  metricsAvailable?: boolean
  id: string
  code?: string
  title: string
  area: string
  sector: string
  status: ProjectStatus
  health: HealthStatus
  period: string
  projectManager: string
  kpiAchievement: number
  beneficiariesReached: number
  beneficiaryReachPercentage?: number
  budgetUtilization: number
  timelineProgress: number
  updatedAt?: string
  programId?: string | null
}

export interface ProjectDetail extends ProjectSummary {
  description: string
  objectives?: string
  programManager: string
  monitoringOfficer: string
  projectOfficers: string[]
  targetBeneficiaries: number
  budgetCode: string
  startDate?: string
  endDate?: string
}

export type AnalyticsCoverageStatus = 'Strong' | 'Growing' | 'Limited' | 'Planned'

export interface AnalyticsLocationProjectSummary {
  projectId: string
  beneficiariesReached: number
  deliverySites: number
  activitiesDelivered: number
  coverageStatus: AnalyticsCoverageStatus
}

export interface AnalyticsLocationRecord {
  id: string
  name: string
  region: string
  latitude: number
  longitude: number
  coordinatePrecision: 'Approximate city centroid'
  projectSummaries: AnalyticsLocationProjectSummary[]
}

export interface CreateProjectInput {
  code: string
  title: string
  implementationArea?: string
  objectives?: string
  startDate?: string
  endDate?: string
  status: ProjectStatus
  description?: string
  programId?: string
}

export interface Activity {
  id: string
  projectId: string
  title: string
  description: string
  status: ActivityStatus
  startDate: string
  dueDate: string
  assignedTo: string[]
  indicatorIds: string[]
  journeyStageId: string
  targetBeneficiaries: number
  beneficiariesReached: number
  budgetAllocation: number
  budgetLogged: number
  progress: number
  submittedProof: ActivityProof[]
  updateNotes: ActivityUpdateNote[]
}

export interface ActivityProof {
  id: string
  fileName: string
  status: 'Draft' | 'Submitted' | 'Flagged' | 'Accepted'
  submittedAt: string
  note?: string
}

export interface ActivityUpdateNote {
  id: string
  note: string
  progress: number
  submittedAt: string
}

export interface CreateActivityInput {
  projectId: string
  title: string
  description: string
  startDate: string
  dueDate: string
  targetBeneficiaries: number
  budgetAllocation: number
  assignedTo: string[]
  indicatorIds: string[]
  journeyStageId: string
}

export interface UpdateActivityInput extends CreateActivityInput {
  id: string
  status: ActivityStatus
  progress: number
  beneficiariesReached: number
  budgetLogged: number
}

export interface SubmitActivityProofInput {
  activityId: string
  progress: number
  note: string
  fileNames: string[]
}

export interface Beneficiary {
  id: string
  code: string
  displayName: string
  projectIds: string[]
  location: string
  sex: 'Female' | 'Male' | 'Prefer not to say'
  ageGroup: '10-14' | '15-17' | '18-24' | '25+' | 'Not classified'
  disabilityStatus: 'With disability' | 'Without disability' | 'Not disclosed'
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
}

export interface BeneficiaryEnrollment {
  id: string
  projectId: string
  status: BeneficiaryEnrollmentStatus
  enrolledAt: string
  followUpStatus: 'Not due' | 'Scheduled' | 'Needs follow-up' | 'Completed'
}

export interface BeneficiaryParticipationRecord {
  id: string
  beneficiaryId: string
  projectId: string
  activityId: string
  participatedAt: string
  attendanceStatus: 'Present' | 'Partial' | 'Absent'
  note: string
}

export interface BeneficiaryAssessmentRecord {
  id: string
  beneficiaryId: string
  projectId: string
  stageId: string
  title: string
  assessedAt: string
  score: number
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
}

export type BeneficiaryMediaType = 'Photo' | 'Video'
export type BeneficiaryMediaReviewStatus = 'For Review' | 'Accepted' | 'Needs Clarification'

export interface BeneficiaryMediaProofRecord {
  id: string
  beneficiaryId: string
  projectId: string
  activityId?: string
  mediaType: BeneficiaryMediaType
  fileName: string
  mimeType: string
  fileSizeBytes: number
  capturedAt: string
  addedAt: string
  addedBy: string
  note?: string
  tags: string[]
  reviewStatus: BeneficiaryMediaReviewStatus
  reviewNote?: string
  durationSeconds?: number
  source: 'Stored media' | 'Local preview'
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
  assessments: BeneficiaryAssessmentRecord[]
  notes: BeneficiaryNoteRecord[]
  updatedAt: string
  consentProvenance: Array<{
    kind: 'PARTICIPATION' | 'DATA_PROCESSING' | 'GUARDIAN'
    source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET'
    recordedAt: string
  }>
}

export interface RegisterBeneficiaryInput {
  formId: string
  clientRegistrationId: string
  values: Record<string, unknown>
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

export interface BeneficiarySadddAggregate {
  projectId: string
  sex: Beneficiary['sex']
  ageGroup: Beneficiary['ageGroup']
  disabilityStatus: Beneficiary['disabilityStatus']
  count: number
}

export interface Indicator {
  id: string
  projectId: string
  code: string
  label: string
  target: number
  actual: number
}

export type EvidenceReviewStatus = 'Submitted' | 'Validated' | 'Flagged' | 'Approved' | 'Returned'

export interface EvidenceRecord {
  id: string
  projectId: string
  activityId: string
  fileName: string
  reportTitle: string
  status: EvidenceReviewStatus
  submitter: string
  submittedDate: string
  previewSummary: string
}

export type IndicatorStatus = 'On Track' | 'Needs Review' | 'Met'

export interface ProjectIndicator {
  id: string
  projectId: string
  code: string
  label: string
  baseline: number
  target: number
  actual: number
  status: IndicatorStatus
  connectedActivityIds: string[]
}

export interface EvaluationWeight {
  id: string
  label: string
  value: number
}

export interface EvaluationAnnotation {
  id: string
  author: string
  note: string
  createdAt: string
}

export interface EvaluationHistoryEntry {
  id: string
  score: number
  reviewer: string
  reviewedAt: string
  note: string
}

export interface EvaluationRecord {
  projectId: string
  currentScore: number
  journeyProgression: number
  indicatorAchievement: number
  supportingEvidence: number
  components: EvaluationWeight[]
  annotations: EvaluationAnnotation[]
  history: EvaluationHistoryEntry[]
}

export interface BudgetRecord {
  id: string
  projectId: string
  plannedAmount: number
  actualSpending: number
}

export type RecommendationOutcome = 'Accept' | 'Partially Accept' | 'Decline' | 'Escalate'

export interface RecommendationOutcomeRecord {
  id: string
  recommendationId: string
  outcome: RecommendationOutcome
  note: string
  loggedAt: string
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

export interface RecommendationRecord {
  id: string
  alertId: string
  ruleId: string
  alertBasis: string
  ruleExplanation: string
  text: string
  reviewStatus: 'New' | 'Reviewed' | 'Actioned'
  outcome?: RecommendationOutcome
  outcomeNote?: string
}

export type RuleCategory =
  | 'KPI / Indicator'
  | 'Activity Timeline'
  | 'Budget'
  | 'Beneficiary Progress'
  | 'Assessment'
  | 'Project Health'

export type RuleOperator = 'below' | 'above' | 'between' | 'equals'
export type RuleSeverity = 'Low' | 'Medium' | 'High' | 'Critical'
export type RuleStatus = 'Active' | 'Inactive'

export interface RuleDefinition {
  id: string
  name: string
  category: RuleCategory
  parameter: string
  operator: RuleOperator
  threshold: number
  upperThreshold?: number
  severity: RuleSeverity
  status: RuleStatus
  suggestedAction: string
  description: string
  triggeredCount: number
  lastTriggeredAt?: string
}

export type TransparencyApprovalState = 'Draft' | 'Pending Review' | 'Approved'

export interface TransparencySection {
  id: string
  projectId: string
  title: string
  summary: string
  visible: boolean
  approvalState: TransparencyApprovalState
}

export interface ReportRecord {
  id: string
  title: string
  projectId: string
  reportingPeriod: string
}

export type SurveyFormFieldType = 'Single select' | 'Numeric score'

export interface SurveyFormFieldDefinition {
  id: string
  label: string
  responseType: SurveyFormFieldType
  metadataKey: string
  required: boolean
  options?: string[]
  minimum?: number
  maximum?: number
}

export interface SurveyFormDefinition {
  id: string
  title: string
  formType: 'Training Survey' | 'Pre/Post Assessment' | 'Feedback Form'
  programName: string
  projectId: string
  journeyStageId?: string
  activityId?: string
  fields: SurveyFormFieldDefinition[]
  source?: string
}

export type FormFieldDataType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTIPLE_SELECT'

export type DigitalFormType =
  | 'BENEFICIARY_REGISTRATION'
  | 'TRAINING_SURVEY'
  | 'PRE_TEST'
  | 'POST_TEST'
  | 'OUTCOME_MONITORING'
  | 'ACTIVITY_MONITORING'
  | 'OTHER'

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
  sequence?: number
}

export interface DigitalFormDefinition {
  id: string
  projectId: string
  code: string
  version: number
  name: string
  description: string | null
  formType: DigitalFormType
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  activityId: string | null
  journeyStageId: string | null
  publishedAt?: string
  archivedAt?: string
  updatedAt: string
  createdByCurrentUser: boolean
  fields: DigitalFormFieldDefinition[]
}

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

export interface DirectFormSubmission {
  id: string
  clientSubmissionId: string
  status: 'DRAFT' | 'VALIDATED'
  formId: string
  formVersion: number
  submittedAt?: string
  updatedAt: string
  values: Record<string, string | number | boolean | string[] | null>
}

export type ImportBatchStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'MAPPED'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'PROCESSING'
  | 'PARTIALLY_PROCESSED'
  | 'PROCESSED'
  | 'RECOVERY_REQUIRED'
  | 'FAILED'

export interface ImportBatchDefinition {
  id: string
  projectId: string
  formId: string
  formVersion: number
  formCode: string
  formName: string
  formType: DigitalFormType
  originalFileName: string
  fileType: 'CSV' | 'XLSX' | 'XLS'
  clientImportId: string
  storageStatus: 'RESERVED' | 'STORED' | 'RECOVERY_REQUIRED' | 'FAILED'
  status: ImportBatchStatus
  mappingRevision: number
  validationRevision: number
  validatedMappingRevision: number | null
  processingRevision: number
  totals: {
    rows: number
    valid: number
    invalid: number
    processed: number
    unprocessed: number
    failed: number
  }
  failureCode: string | null
  uploadedAt: string
  validatedAt?: string
  processedAt?: string
  updatedAt: string
  sourceHeaders?: string[]
  mappings?: Array<{
    sourceFieldName: string
    status: 'MAPPED' | 'IGNORED'
    revision: number
    targetField: { code: string; label: string } | null
    validationMessage: string | null
  }>
}

export interface ImportRowDefinition {
  id: string
  rowNumber: number
  rawData: Record<string, string | number | boolean | null>
  status: 'PENDING' | 'VALID' | 'INVALID' | 'PROCESSING' | 'UNPROCESSED' | 'PROCESSED' | 'FAILED'
  validationErrors: FormValidationError[]
  mappingRevision: number
  validationRevision: number
  processingAttempts: number
  processingErrorCode: string | null
  updatedAt: string
}

export interface ImportRowsPage {
  offset: number
  take: number
  total: number
  rows: ImportRowDefinition[]
}

export interface ImportMappingInput {
  sourceFieldName: string
  targetFieldCode?: string
  ignored: boolean
}

export interface SurveyAggregateCount {
  label: string
  count: number
}

export interface SurveyCategoricalAggregate {
  fieldId: string
  kind: 'Categorical distribution'
  responseCount: number
  values: SurveyAggregateCount[]
}

export interface SurveyNumericAggregate {
  fieldId: string
  kind: 'Numeric summary'
  responseCount: number
  average: number
  minimum: number
  maximum: number
  scaleLabel: string
}

export type SurveyQuestionAggregate = SurveyCategoricalAggregate | SurveyNumericAggregate

export interface SurveyDemographicAggregate {
  dimension: 'Sex' | 'Age group' | 'Disability status'
  values: SurveyAggregateCount[]
}

export interface SurveyAggregateResultSet {
  id: string
  formId: string
  projectId: string
  location: string
  responseDate: string
  reportingPeriod: string
  responseCount: number
  questionResults: SurveyQuestionAggregate[]
  demographicBreakdowns: SurveyDemographicAggregate[]
  source?: string
}

export interface SurveyAggregateFilters {
  formId?: string
  projectId?: string
  location?: string
  responseDate?: string
  reportingPeriod?: string
}

export type ReportKind =
  | 'project-summary'
  | 'indicator-summary'
  | 'beneficiary-summary'
  | 'survey-results'

export interface ReportColumnConfig {
  id: string
  label: string
  enabledByDefault: boolean
}

export interface PublicIndicator {
  id: string
  label: string
  targetLabel: string
  actualLabel: string
  progress: number
  status: 'On Track' | 'Monitoring' | 'Completed'
}

export interface PublicMilestone {
  id: string
  title: string
  dateLabel: string
  status: 'Completed' | 'In Progress' | 'Planned'
}

export type PublicDashboardSectionId =
  | 'overview'
  | 'media'
  | 'progress'
  | 'indicators'
  | 'milestones'

export type PublicDashboardLayoutPreset = 'story-led' | 'balanced' | 'compact'

export interface PublicDashboardPresentation {
  eyebrow: string
  headline: string
  summaryTitle: string
  summaryBody: string
  quote: string
  quoteAttribution: string
  closingTitle: string
  closingText: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  layoutPreset: PublicDashboardLayoutPreset
  sectionOrder: PublicDashboardSectionId[]
  visibleSections: PublicDashboardSectionId[]
}

export interface PublicBeneficiaryMediaRecord {
  id: string
  projectId: string
  mediaType: 'Photo'
  src: string
  alt: string
  caption: string
  contextLabel: string
  approvalState: 'Approved for public presentation'
  consentScope: 'Public project storytelling'
  source: string
}

export interface PublicProjectRecord {
  id: string
  title: string
  tagline: string
  area: string
  sector: string
  timeframe: string
  approvedSummary: string
  description: string
  aboutProject: string
  projectAreas: string[]
  selectedIndicators: PublicIndicator[]
  milestones: PublicMilestone[]
  accomplishments: string[]
  progressTrend: number[]
  beneficiariesReached: number
  budgetSummary: string
  assessmentSummary: string
  publicationState: 'Approved for public preview'
  publicPresentation: PublicDashboardPresentation
  approvedMedia: PublicBeneficiaryMediaRecord[]
}

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
  sex?: Beneficiary['sex']
  ageGroup?: Beneficiary['ageGroup']
  disabilityStatus?: Beneficiary['disabilityStatus']
  enrollmentStatus?: BeneficiaryEnrollmentStatus
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
