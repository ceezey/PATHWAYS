import type { PrototypeRole } from '@/types/prototype-role'

export type ProjectStatus = 'Active' | 'Needs Attention' | 'Planned' | 'Completed'
export type HealthStatus = 'On Track' | 'At Risk' | 'Critical'
export type ActivityStatus = 'Planned' | 'In Progress' | 'For Review' | 'Overdue' | 'Completed'
export type BeneficiaryEnrollmentStatus = 'Active' | 'Pending Review' | 'Completed' | 'Exited'
export type DashboardSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type DashboardActionKind = 'dialog' | 'navigate' | 'toast'

export interface ProjectSummary {
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
  budgetUtilization: number
  timelineProgress: number
}

export interface ProjectDetail extends ProjectSummary {
  description: string
  programManager: string
  monitoringOfficer: string
  projectOfficers: string[]
  targetBeneficiaries: number
  budgetCode: string
  startDate?: string
  endDate?: string
  createdInPrototype?: boolean
}

export interface CreateProjectInput {
  title: string
  sector: string
  area: string
  startDate: string
  endDate: string
  status: ProjectStatus
  budgetCode: string
  description: string
  programManager: string
  projectManager: string
  monitoringOfficer: string
  projectOfficers: string[]
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

export type ReportKind = 'project-summary' | 'indicator-summary' | 'beneficiary-summary'

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
}

export interface UserRecord {
  id: string
  name: string
  role: string
}

export interface BeneficiaryFilters {
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

export interface RoleDashboardViewModel {
  role: PrototypeRole
  greetingName: string
  heading: string
  summary: string
  primaryAction?: DashboardAction
  metrics: DashboardMetric[]
  sections: DashboardSection[]
}
