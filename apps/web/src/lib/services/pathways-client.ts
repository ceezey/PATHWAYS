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
import type { PathwaysRole } from '@/types/pathways-role'

export class PathwaysClientError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'network' | 'unauthorized' | 'forbidden' | 'not_found',
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
    role: PathwaysRole,
    filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]>
  getBeneficiaryRecordForRole(role: PathwaysRole, id: string): Promise<BeneficiaryRecord>
  getBeneficiaryMediaProofForRole(
    role: PathwaysRole,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]>
  getBeneficiarySadddAggregatesForRole(role: PathwaysRole): Promise<BeneficiarySadddAggregate[]>
  getJourneyStages(projectId: string): Promise<JourneyStageConfig[]>
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
  getSurveyAggregateResults(filters?: SurveyAggregateFilters): Promise<SurveyAggregateResultSet[]>
  getPublicProjects(): Promise<PublicProjectRecord[]>
  getPublicProject(id: string): Promise<PublicProjectRecord>
  getUsers(): Promise<UserRecord[]>
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
    return []
  }

  async getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]> {
    return []
  }

  async getProject(_id: string): Promise<ProjectDetail> {
    throw backendNotConfigured('Project details')
  }

  async createProject(_input: CreateProjectInput): Promise<ProjectDetail> {
    throw backendNotConfigured('Project creation')
  }

  async getActivities(_projectId: string): Promise<Activity[]> {
    return []
  }

  async getActivity(_projectId: string, _activityId: string): Promise<Activity> {
    throw backendNotConfigured('Activity details')
  }

  async createActivity(_input: CreateActivityInput): Promise<Activity> {
    throw backendNotConfigured('Activity creation')
  }

  async updateActivity(_input: UpdateActivityInput): Promise<Activity> {
    throw backendNotConfigured('Activity updates')
  }

  async submitActivityProof(_input: SubmitActivityProofInput): Promise<Activity> {
    throw backendNotConfigured('Activity proof submission')
  }

  async getEvidence(_projectId: string): Promise<EvidenceRecord[]> {
    return []
  }

  async getProjectIndicators(_projectId: string): Promise<ProjectIndicator[]> {
    return []
  }

  async getEvaluation(_projectId: string): Promise<EvaluationRecord> {
    throw backendNotConfigured('Project evaluation')
  }

  async getExpenses(_projectId: string): Promise<ExpenseRecord[]> {
    return []
  }

  async getRecommendationOutcomes(_projectId: string): Promise<RecommendationOutcomeRecord[]> {
    return []
  }

  async getTransparencySections(_projectId: string): Promise<TransparencySection[]> {
    return []
  }

  async getBeneficiaryRecordsForRole(
    _role: PathwaysRole,
    _filters?: BeneficiaryFilters,
  ): Promise<BeneficiaryRecord[]> {
    return []
  }

  async getBeneficiaryRecordForRole(_role: PathwaysRole, _id: string): Promise<BeneficiaryRecord> {
    throw backendNotConfigured('Beneficiary details')
  }

  async getBeneficiaryMediaProofForRole(
    _role: PathwaysRole,
    _beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]> {
    return []
  }

  async getBeneficiarySadddAggregatesForRole(
    _role: PathwaysRole,
  ): Promise<BeneficiarySadddAggregate[]> {
    return []
  }

  async getJourneyStages(_projectId: string): Promise<JourneyStageConfig[]> {
    return []
  }

  async getIndicators(_projectId?: string): Promise<Indicator[]> {
    return []
  }

  async getBudgets(_projectId?: string): Promise<BudgetRecord[]> {
    return []
  }

  async getAlerts(_projectId?: string): Promise<AlertRecord[]> {
    return []
  }

  async getAlertsForRole(_role: PathwaysRole, _projectId?: string): Promise<AlertRecord[]> {
    return []
  }

  async getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]> {
    return []
  }

  async getRecommendations(): Promise<RecommendationRecord[]> {
    return []
  }

  async getRecommendationsForRole(_role: PathwaysRole): Promise<RecommendationRecord[]> {
    return []
  }

  async getRules(): Promise<RuleDefinition[]> {
    return []
  }

  async getReports(_projectId?: string): Promise<ReportRecord[]> {
    return []
  }

  async getSurveyForms(_projectId?: string): Promise<SurveyFormDefinition[]> {
    return []
  }

  async getSurveyAggregateResults(
    _filters?: SurveyAggregateFilters,
  ): Promise<SurveyAggregateResultSet[]> {
    return []
  }

  async getPublicProjects(): Promise<PublicProjectRecord[]> {
    return []
  }

  async getPublicProject(_id: string): Promise<PublicProjectRecord> {
    throw backendNotConfigured('Published project details')
  }

  async getUsers(): Promise<UserRecord[]> {
    return []
  }

  async getDashboard(_role: PathwaysRole): Promise<RoleDashboardViewModel> {
    throw backendNotConfigured('Dashboard aggregates')
  }
}

export const pathwaysClient: PathwaysClient = new BackendReadyPathwaysClient()
