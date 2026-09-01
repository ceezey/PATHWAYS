import type {
  Activity,
  AlertRecord,
  AnalyticsLocationRecord,
  BeneficiaryFilters,
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  BeneficiarySadddAggregate,
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
  PublicProjectRecord,
  RecommendationOutcomeRecord,
  RecommendationRecord,
  ReportRecord,
  RoleDashboardViewModel,
  RuleDefinition,
  SubmitActivityProofInput,
  SurveyAggregateFilters,
  SurveyAggregateResultSet,
  SurveyFormDefinition,
  TransparencySection,
  UpdateActivityInput,
  UserRecord,
} from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'

export class PathwaysClientError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'forbidden' | 'mock_failure',
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
  getBeneficiaryRecordsForRole(
    role: PrototypeRole,
    filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]>
  getBeneficiaryRecordForRole(role: PrototypeRole, id: string): Promise<BeneficiaryRecord>
  getBeneficiaryMediaProofForRole(
    role: PrototypeRole,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]>
  getBeneficiarySadddAggregatesForRole(role: PrototypeRole): Promise<BeneficiarySadddAggregate[]>
  getJourneyStages(projectId: string): Promise<JourneyStageConfig[]>
  getIndicators(projectId?: string): Promise<Indicator[]>
  getBudgets(projectId?: string): Promise<BudgetRecord[]>
  getAlerts(projectId?: string): Promise<AlertRecord[]>
  getAlertsForRole(role: PrototypeRole, projectId?: string): Promise<AlertRecord[]>
  getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]>
  getRecommendations(): Promise<RecommendationRecord[]>
  getRecommendationsForRole(role: PrototypeRole): Promise<RecommendationRecord[]>
  getRules(): Promise<RuleDefinition[]>
  getReports(projectId?: string): Promise<ReportRecord[]>
  getSurveyForms(projectId?: string): Promise<SurveyFormDefinition[]>
  getSurveyAggregateResults(filters?: SurveyAggregateFilters): Promise<SurveyAggregateResultSet[]>
  getPublicProjects(): Promise<PublicProjectRecord[]>
  getPublicProject(id: string): Promise<PublicProjectRecord>
  getUsers(): Promise<UserRecord[]>
  getDashboard(role: string): Promise<RoleDashboardViewModel>
}
