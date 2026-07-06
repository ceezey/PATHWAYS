import type {
  Activity,
  AlertRecord,
  Beneficiary,
  BeneficiaryFilters,
  BeneficiaryRecord,
  BudgetRecord,
  CreateActivityInput,
  CreateProjectInput,
  EvaluationRecord,
  EvidenceRecord,
  ExpenseRecord,
  Indicator,
  JourneyStageConfig,
  ProjectDetail,
  ProjectIndicator,
  ProjectSummary,
  RecommendationOutcomeRecord,
  RecommendationRecord,
  ReportRecord,
  RoleDashboardViewModel,
  RuleDefinition,
  SubmitActivityProofInput,
  TransparencySection,
  UpdateActivityInput,
  UserRecord,
} from '@/types/pathways'

export class PathwaysClientError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'mock_failure',
  ) {
    super(message)
    this.name = 'PathwaysClientError'
  }
}

export interface PathwaysClient {
  getProjects(): Promise<ProjectSummary[]>
  getProjectsForRole(role: string): Promise<ProjectSummary[]>
  getProject(id: string): Promise<ProjectDetail>
  createProject(input: CreateProjectInput): Promise<ProjectDetail>
  getActivities(projectId: string): Promise<Activity[]>
  getActivity(projectId: string, activityId: string): Promise<Activity>
  createActivity(input: CreateActivityInput): Promise<Activity>
  updateActivity(input: UpdateActivityInput): Promise<Activity>
  submitActivityProof(input: SubmitActivityProofInput): Promise<Activity>
  getEvidence(projectId: string): Promise<EvidenceRecord[]>
  getProjectIndicators(projectId: string): Promise<ProjectIndicator[]>
  getEvaluation(projectId: string): Promise<EvaluationRecord>
  getExpenses(projectId: string): Promise<ExpenseRecord[]>
  getRecommendationOutcomes(projectId: string): Promise<RecommendationOutcomeRecord[]>
  getTransparencySections(projectId: string): Promise<TransparencySection[]>
  getBeneficiaries(filters?: BeneficiaryFilters): Promise<Beneficiary[]>
  getBeneficiaryRecords(filters?: BeneficiaryFilters): Promise<BeneficiaryRecord[]>
  getBeneficiaryRecord(id: string): Promise<BeneficiaryRecord>
  getJourneyStages(projectId: string): Promise<JourneyStageConfig[]>
  getIndicators(projectId?: string): Promise<Indicator[]>
  getBudgets(projectId?: string): Promise<BudgetRecord[]>
  getAlerts(projectId?: string): Promise<AlertRecord[]>
  getRecommendations(): Promise<RecommendationRecord[]>
  getRules(): Promise<RuleDefinition[]>
  getReports(projectId?: string): Promise<ReportRecord[]>
  getUsers(): Promise<UserRecord[]>
  getDashboard(role: string): Promise<RoleDashboardViewModel>
}
