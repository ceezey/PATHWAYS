import type { PrototypeRole } from './legacy-prototype-role'

export type ProjectStatus = 'Active' | 'Needs Attention' | 'Planned' | 'Completed'
type HealthStatus = 'On Track' | 'At Risk' | 'Critical'
export type ActivityStatus = 'Planned' | 'In Progress' | 'For Review' | 'Overdue' | 'Completed'
export type BeneficiaryEnrollmentStatus = 'Active' | 'Pending Review' | 'Completed' | 'Exited'

interface ProjectSummary {
  targetGoal: string | null
  id: string
  title: string
  area: string
  sector: string
  status: ProjectStatus
  health: HealthStatus
  period: string
  projectManager: string
  kpiAchievement: number
  beneficiariesReached: number
  targetBeneficiaries: number
  budgetUtilization: number
  timelineProgress: number
}

export interface ProjectDetail extends ProjectSummary {
  objectives?: string
  partners?: string
  archived?: boolean
  projectBudget?: number
  description: string
  programManager: string
  monitoringOfficer: string
  projectOfficers: string[]
  budgetCode: string
  startDate?: string
  endDate?: string
  createdInPrototype?: boolean
}

export interface CreateProjectInput {
  objectives?: string
  partners?: string
  projectBudget?: number
  targetBeneficiaries: number
  confirmDuplicate?: boolean
  title: string
  sector: string
  area: string
  startDate: string
  endDate: string
  status: ProjectStatus
  budgetCode?: string
  description: string
  programManager: string
  projectManager: string
  monitoringOfficer: string
  projectOfficers: string[]
}

export interface Activity {
  overrideJustification?: string
  progressApproval?: 'For Review' | 'Approved' | 'For Correction'
  correctionReason?: string
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
  extensionRequestedAt?: string
  extensionRequestedBy?: string
}

export interface ActivityProof {
  id: string
  fileName: string
  fileNames?: string[]
  files?: ActivityProofFile[]
  status:
    | 'Draft'
    | 'Submitted'
    | 'Validated'
    | 'Returned'
    | 'Approved'
    | 'Flagged'
    | 'Accepted'
    | 'Superseded'
  submittedAt: string
  submittedBy?: string
  progress?: number
  beneficiariesReachedThisSession?: number
  beneficiariesReachedTotal?: number
  version?: number
  priorActivityStatus?: ActivityStatus
  validatedAt?: string
  validatedBy?: string
  reviewedAt?: string
  reviewedBy?: string
  returnReason?: string
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
  note: string
  progress: number
  submittedAt: string
}

export interface SubmitActivityProofInput {
  activityId: string
  beneficiariesReachedThisSession?: number
  /** Retained for seeded legacy records; new UI submissions use beneficiariesReachedThisSession. */
  progress?: number
  note: string
  fileNames: string[]
  files?: ActivityProofFile[]
}

interface Beneficiary {
  id: string
  code: string
  displayName: string
  projectIds: string[]
  location: string
  sex: 'Female' | 'Male' | 'Prefer not to say'
  ageGroup: '10-14' | '15-17' | '18-24' | '25+'
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
}

export interface BeneficiaryRecord extends Beneficiary {
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
}

export interface Indicator {
  description?: string
  unit?: string
  disaggregation?: string
  dataSource?: string
  id: string
  projectId: string
  code: string
  label: string
  target: number
  actual: number
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

export interface BudgetRecord {
  id: string
  projectId: string
  plannedAmount: number
  actualSpending: number
}

export type RecommendationOutcome = 'Accept' | 'Partially Accept' | 'Decline' | 'Escalate'

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

type SurveyFormFieldType = 'Single select' | 'Numeric score'

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
  source: 'Metadata-driven Collection prototype'
}

export type ReportKind =
  | 'project-summary'
  | 'indicator-summary'
  | 'beneficiary-summary'
  | 'survey-results'

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

type PublicDashboardSectionId = 'overview' | 'media' | 'progress' | 'indicators' | 'milestones'

type PublicDashboardLayoutPreset = 'story-led' | 'balanced' | 'compact'

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
  source: 'Synthetic mock media'
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
  name: string
  email: string
  role: PrototypeRole
  accountStatus: UserAccountStatus
  signInMethod: 'Prototype password' | 'SSO placeholder'
  projectIds: string[]
  projectAccess: string[]
  createdAt: string
  lastActiveAt?: string
}

export type UserAccountStatus = 'Active' | 'Invited' | 'Deactivated'
