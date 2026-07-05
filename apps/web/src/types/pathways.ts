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
  category: 'Activity' | 'Indicator' | 'Budget' | 'Beneficiary Progress'
  title: string
}

export interface RecommendationRecord {
  id: string
  alertId: string
  text: string
  reviewStatus: 'New' | 'Reviewed' | 'Actioned'
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

export interface UserRecord {
  id: string
  name: string
  role: string
}

export interface BeneficiaryFilters {
  projectId?: string
  location?: string
  sex?: Beneficiary['sex']
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
