import {
  defaultTransparencySections,
  fallbackDashboard,
  mockActivities,
  mockAlerts,
  mockAnalyticsLocations,
  mockBeneficiaryMediaProof,
  mockBeneficiaryRecords,
  mockBudgets,
  mockDashboards,
  mockEvaluations,
  mockEvidenceRecords,
  mockExpenses,
  mockIndicators,
  mockJourneyStages,
  mockProjectIndicators,
  mockProjects,
  mockPublicProjects,
  mockRecommendationOutcomes,
  mockRecommendations,
  mockReports,
  mockRules,
  mockSurveyAggregateResults,
  mockSurveyForms,
  mockTransparencySections,
  mockUsers,
} from '@/mocks/pathways'
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
  UpdateBudgetAllocationInput,
  UserRecord,
} from '@/types/pathways'
import { type PrototypeRole, isPrototypeRole } from '@/types/prototype-role'

import { can } from '@/lib/rbac/can'
import {
  buildBeneficiarySadddAggregatesForRole,
  registerPrototypeProjectTeamAssignments,
  scopeBeneficiariesForRole,
  scopeBeneficiaryMediaForRole,
  scopeBeneficiaryRecordForRole,
  scopeProjectRecordsForRole,
  scopeProjectsForRole,
} from '@/lib/rbac/data-scope'
import { readPrototypeUserRecords } from '@/lib/rbac/prototype-user-store'

import { type PathwaysClient, PathwaysClientError } from './pathways-client'

const PROJECT_STORAGE_KEY = 'pathways.prototypeProjects'
const ACTIVITY_STORAGE_KEY = 'pathways.prototypeActivities'
const BUDGET_STORAGE_KEY = 'pathways.prototypeBudgets'
let inMemoryPrototypeProjects: ProjectDetail[] = []
let inMemoryPrototypeActivities: Activity[] = []
let inMemoryBudgetOverrides: UpdateBudgetAllocationInput[] = []

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const formatPeriod = (startDate: string, endDate: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const start = formatter.format(new Date(`${startDate}T00:00:00.000Z`))
  const end = formatter.format(new Date(`${endDate}T00:00:00.000Z`))

  return `${start} - ${end}`
}

const readStoredProjects = () => {
  if (typeof window === 'undefined') {
    return inMemoryPrototypeProjects
  }

  const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY)

  if (!stored) {
    return inMemoryPrototypeProjects
  }

  try {
    const parsed = JSON.parse(stored) as ProjectDetail[]
    inMemoryPrototypeProjects = parsed
    return parsed
  } catch {
    return inMemoryPrototypeProjects
  }
}

const writeStoredProjects = (projects: ProjectDetail[]) => {
  inMemoryPrototypeProjects = projects

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects))
  }
}

const allProjects = () => {
  const storedProjects = readStoredProjects()
  storedProjects.forEach(registerPrototypeProjectTeamAssignments)
  return [...mockProjects, ...storedProjects]
}

const readStoredActivities = () => {
  if (typeof window === 'undefined') {
    return inMemoryPrototypeActivities
  }

  const stored = window.localStorage.getItem(ACTIVITY_STORAGE_KEY)

  if (!stored) {
    return inMemoryPrototypeActivities
  }

  try {
    const parsed = JSON.parse(stored) as Activity[]
    inMemoryPrototypeActivities = parsed
    return parsed
  } catch {
    return inMemoryPrototypeActivities
  }
}

const writeStoredActivities = (activities: Activity[]) => {
  inMemoryPrototypeActivities = activities

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activities))
  }
}

const allActivities = () => {
  const storedActivities = readStoredActivities()
  const storedIds = new Set(storedActivities.map((activity) => activity.id))

  return [...mockActivities.filter((activity) => !storedIds.has(activity.id)), ...storedActivities]
}

const saveActivity = (activity: Activity) => {
  const nextActivities = [
    ...readStoredActivities().filter((item) => item.id !== activity.id),
    activity,
  ]
  writeStoredActivities(nextActivities)
}

const validBudgetOverride = (value: unknown): value is UpdateBudgetAllocationInput => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<UpdateBudgetAllocationInput>
  return (
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    typeof candidate.plannedAmount === 'number' &&
    Number.isSafeInteger(candidate.plannedAmount) &&
    candidate.plannedAmount >= 1
  )
}

const readBudgetOverrides = () => {
  if (typeof window === 'undefined') {
    return inMemoryBudgetOverrides
  }

  const stored = window.localStorage.getItem(BUDGET_STORAGE_KEY)
  if (!stored) {
    inMemoryBudgetOverrides = []
    return inMemoryBudgetOverrides
  }

  try {
    const parsed = JSON.parse(stored) as unknown
    inMemoryBudgetOverrides = Array.isArray(parsed) ? parsed.filter(validBudgetOverride) : []
  } catch {
    inMemoryBudgetOverrides = []
  }

  return inMemoryBudgetOverrides
}

const writeBudgetOverrides = (overrides: UpdateBudgetAllocationInput[]) => {
  inMemoryBudgetOverrides = overrides

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(overrides))
  }
}

const allBudgets = () => {
  const overrides = new Map(
    readBudgetOverrides().map((override) => [override.projectId, override.plannedAmount]),
  )

  return mockBudgets.map((budget) => ({
    ...budget,
    plannedAmount: overrides.get(budget.projectId) ?? budget.plannedAmount,
  }))
}

const filterBeneficiaryRecords = (
  beneficiaries: BeneficiaryRecord[],
  filters: BeneficiaryFilters,
) =>
  beneficiaries.filter((beneficiary) => {
    const matchesProject = filters.projectId
      ? beneficiary.projectIds.includes(filters.projectId)
      : true
    const matchesLocation = filters.location ? beneficiary.location === filters.location : true
    const matchesSex = filters.sex ? beneficiary.sex === filters.sex : true
    const matchesAgeGroup = filters.ageGroup ? beneficiary.ageGroup === filters.ageGroup : true
    const matchesDisability = filters.disabilityStatus
      ? beneficiary.disabilityStatus === filters.disabilityStatus
      : true
    const matchesEnrollment = filters.enrollmentStatus
      ? beneficiary.enrollmentStatus === filters.enrollmentStatus
      : true

    return (
      matchesProject &&
      matchesLocation &&
      matchesSex &&
      matchesAgeGroup &&
      matchesDisability &&
      matchesEnrollment
    )
  })

export class MockPathwaysClient implements PathwaysClient {
  constructor(private readonly artificialDelayMs = 0) {}

  private async wait() {
    if (this.artificialDelayMs > 0 && typeof window !== 'undefined') {
      await delay(this.artificialDelayMs)
    }
  }

  async getProjects(): Promise<ProjectSummary[]> {
    await this.wait()
    return allProjects().map((project) => ({
      id: project.id,
      title: project.title,
      area: project.area,
      sector: project.sector,
      status: project.status,
      health: project.health,
      period: project.period,
      projectManager: project.projectManager,
      kpiAchievement: project.kpiAchievement,
      beneficiariesReached: project.beneficiariesReached,
      budgetUtilization: project.budgetUtilization,
      timelineProgress: project.timelineProgress,
    }))
  }

  async getProjectsForRole(role: string): Promise<ProjectSummary[]> {
    await this.wait()
    const projects = await this.getProjects()

    return isPrototypeRole(role) ? scopeProjectsForRole(projects, role) : []
  }

  async getProject(id: string): Promise<ProjectDetail> {
    await this.wait()
    const project = allProjects().find((item) => item.id === id)

    if (!project) {
      throw new PathwaysClientError(`Project ${id} was not found in mock data.`, 'not_found')
    }

    return project
  }

  async createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    await this.wait()
    const baseId = slugify(input.title) || 'project'
    const timestamp = Date.now().toString(36)
    const project: ProjectDetail = {
      id: `prototype-${baseId}-${timestamp}`,
      title: input.title,
      area: input.area,
      sector: input.sector,
      status: input.status,
      health: input.status === 'Needs Attention' ? 'At Risk' : 'On Track',
      period: formatPeriod(input.startDate, input.endDate),
      projectManager: input.projectManager,
      programManager: input.programManager,
      monitoringOfficer: input.monitoringOfficer,
      projectOfficers: input.projectOfficers,
      kpiAchievement: input.status === 'Planned' ? 0 : 12,
      beneficiariesReached: 0,
      budgetUtilization: 0,
      timelineProgress: input.status === 'Planned' ? 4 : 10,
      targetBeneficiaries: 0,
      budgetCode: input.budgetCode,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      createdInPrototype: true,
    }
    const nextProjects = [...readStoredProjects(), project]
    writeStoredProjects(nextProjects)
    registerPrototypeProjectTeamAssignments(project)

    return project
  }

  async getActivities(projectId: string): Promise<Activity[]> {
    await this.wait()
    return allActivities().filter((activity) => activity.projectId === projectId)
  }

  async getActivity(projectId: string, activityId: string): Promise<Activity> {
    await this.wait()
    const activity = allActivities().find(
      (item) => item.projectId === projectId && item.id === activityId,
    )

    if (!activity) {
      throw new PathwaysClientError(
        `Activity ${activityId} was not found in mock data.`,
        'not_found',
      )
    }

    return activity
  }

  async createActivity(input: CreateActivityInput): Promise<Activity> {
    await this.wait()
    // TODO(RBAC): Enforce create, edit, review, and approval permissions.
    const activity: Activity = {
      id: `prototype-activity-${slugify(input.title) || 'activity'}-${Date.now().toString(36)}`,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: 'Planned',
      startDate: input.startDate,
      dueDate: input.dueDate,
      assignedTo: input.assignedTo,
      indicatorIds: input.indicatorIds,
      journeyStageId: input.journeyStageId,
      targetBeneficiaries: input.targetBeneficiaries,
      beneficiariesReached: 0,
      budgetAllocation: input.budgetAllocation,
      budgetLogged: 0,
      progress: 0,
      submittedProof: [],
      updateNotes: [],
    }
    saveActivity(activity)

    return activity
  }

  async updateActivity(input: UpdateActivityInput): Promise<Activity> {
    await this.wait()
    // TODO(RBAC): Enforce create, edit, review, and approval permissions.
    // TODO(ALERTS): Recalculate overdue and progress alerts server-side.
    const current = allActivities().find(
      (activity) => activity.projectId === input.projectId && activity.id === input.id,
    )

    if (!current) {
      throw new PathwaysClientError(`Activity ${input.id} was not found in mock data.`, 'not_found')
    }

    const activity: Activity = {
      ...current,
      title: input.title,
      description: input.description,
      status: input.status,
      startDate: input.startDate,
      dueDate: input.dueDate,
      assignedTo: input.assignedTo,
      indicatorIds: input.indicatorIds,
      journeyStageId: input.journeyStageId,
      targetBeneficiaries: input.targetBeneficiaries,
      beneficiariesReached: input.beneficiariesReached,
      budgetAllocation: input.budgetAllocation,
      budgetLogged: input.budgetLogged,
      progress: input.progress,
    }
    saveActivity(activity)

    return activity
  }

  async submitActivityProof(input: SubmitActivityProofInput): Promise<Activity> {
    await this.wait()
    // TODO(STORAGE): Upload proof files to Supabase Storage.
    // TODO(BACKEND): Save activity progress and proof submission.
    // TODO(ALERTS): Recalculate overdue and progress alerts server-side.
    const current = allActivities().find((activity) => activity.id === input.activityId)

    if (!current) {
      throw new PathwaysClientError(
        `Activity ${input.activityId} was not found in mock data.`,
        'not_found',
      )
    }

    const submittedAt = new Date().toISOString()
    const activity: Activity = {
      ...current,
      status: input.progress >= 100 ? 'For Review' : 'In Progress',
      progress: input.progress,
      submittedProof: [
        ...current.submittedProof,
        ...input.fileNames.map((fileName, index) => ({
          id: `proof-${input.activityId}-${Date.now().toString(36)}-${index}`,
          fileName,
          status: 'Submitted' as const,
          submittedAt,
          note: input.note,
        })),
      ],
      updateNotes: [
        ...current.updateNotes,
        {
          id: `note-${input.activityId}-${Date.now().toString(36)}`,
          note: input.note,
          progress: input.progress,
          submittedAt,
        },
      ],
    }
    saveActivity(activity)

    return activity
  }

  async getEvidence(projectId: string): Promise<EvidenceRecord[]> {
    await this.wait()
    return mockEvidenceRecords.filter((record) => record.projectId === projectId)
  }

  async getProjectIndicators(projectId: string): Promise<ProjectIndicator[]> {
    await this.wait()
    const indicatorRecords = mockProjectIndicators.filter(
      (indicator) => indicator.projectId === projectId,
    )

    if (indicatorRecords.length > 0) {
      return indicatorRecords
    }

    return mockIndicators
      .filter((indicator) => indicator.projectId === projectId)
      .map((indicator) => ({
        ...indicator,
        baseline: 0,
        status:
          indicator.actual >= indicator.target
            ? ('Met' as const)
            : indicator.actual / indicator.target >= 0.6
              ? ('On Track' as const)
              : ('Needs Review' as const),
        connectedActivityIds: [],
      }))
  }

  async getEvaluation(projectId: string): Promise<EvaluationRecord> {
    await this.wait()
    return (
      mockEvaluations.find((evaluation) => evaluation.projectId === projectId) ?? {
        projectId,
        currentScore: 0,
        journeyProgression: 0,
        indicatorAchievement: 0,
        supportingEvidence: 0,
        components: [
          { id: 'journey', label: 'Journey progression', value: 35 },
          { id: 'indicators', label: 'Indicator achievement', value: 40 },
          { id: 'evidence', label: 'Supporting evidence', value: 25 },
        ],
        annotations: [],
        history: [],
      }
    )
  }

  async getExpenses(projectId: string): Promise<ExpenseRecord[]> {
    await this.wait()
    return mockExpenses.filter((expense) => expense.projectId === projectId)
  }

  async getRecommendationOutcomes(projectId: string): Promise<RecommendationOutcomeRecord[]> {
    await this.wait()
    const projectAlertIds = mockAlerts
      .filter((alert) => alert.projectId === projectId)
      .map((alert) => alert.id)
    const projectRecommendationIds = mockRecommendations
      .filter((recommendation) => projectAlertIds.includes(recommendation.alertId))
      .map((recommendation) => recommendation.id)

    return mockRecommendationOutcomes.filter((outcome) =>
      projectRecommendationIds.includes(outcome.recommendationId),
    )
  }

  async getTransparencySections(projectId: string): Promise<TransparencySection[]> {
    await this.wait()
    const sections = mockTransparencySections.filter((section) => section.projectId === projectId)
    return sections.length > 0 ? sections : defaultTransparencySections(projectId)
  }

  async getBeneficiaryRecordsForRole(
    role: PrototypeRole,
    filters: BeneficiaryFilters = {},
  ): Promise<BeneficiaryRecord[]> {
    await this.wait()
    const scopedBeneficiaries = scopeBeneficiariesForRole(mockBeneficiaryRecords, role)
    return filterBeneficiaryRecords(scopedBeneficiaries, filters)
  }

  async getBeneficiaryRecordForRole(role: PrototypeRole, id: string): Promise<BeneficiaryRecord> {
    await this.wait()
    const beneficiary = mockBeneficiaryRecords.find((record) => record.id === id)

    if (!beneficiary) {
      throw new PathwaysClientError(`Beneficiary ${id} was not found in mock data.`, 'not_found')
    }

    const scopedBeneficiary = scopeBeneficiaryRecordForRole(beneficiary, role)

    if (!scopedBeneficiary) {
      throw new PathwaysClientError(
        'This Beneficiary record is outside the current prototype role scope.',
        'forbidden',
      )
    }

    return scopedBeneficiary
  }

  async getBeneficiaryMediaProofForRole(
    role: PrototypeRole,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaProofRecord[]> {
    const beneficiary = await this.getBeneficiaryRecordForRole(role, beneficiaryId)
    await this.wait()
    // TODO(STORAGE): Load private Beneficiary media through approved access-controlled storage.
    return scopeBeneficiaryMediaForRole(mockBeneficiaryMediaProof, beneficiary, role)
  }

  async getBeneficiarySadddAggregatesForRole(
    role: PrototypeRole,
  ): Promise<BeneficiarySadddAggregate[]> {
    await this.wait()
    return buildBeneficiarySadddAggregatesForRole(mockBeneficiaryRecords, role)
  }

  async getJourneyStages(projectId: string): Promise<JourneyStageConfig[]> {
    await this.wait()
    // TODO(DATABASE): Load configurable stages and activity-stage mappings.
    return mockJourneyStages.filter((stage) => stage.projectId === projectId)
  }

  async getIndicators(projectId?: string): Promise<Indicator[]> {
    await this.wait()
    return projectId
      ? mockIndicators.filter((indicator) => indicator.projectId === projectId)
      : mockIndicators
  }

  async getBudgets(projectId?: string): Promise<BudgetRecord[]> {
    await this.wait()
    const budgets = allBudgets()
    return projectId ? budgets.filter((budget) => budget.projectId === projectId) : budgets
  }

  async updateBudgetAllocation(input: UpdateBudgetAllocationInput): Promise<BudgetRecord> {
    await this.wait()

    if (!validBudgetOverride(input)) {
      throw new PathwaysClientError('Enter a valid planned allocation.', 'mock_failure')
    }

    const budget = mockBudgets.find((record) => record.projectId === input.projectId)
    if (!budget) {
      throw new PathwaysClientError(
        `Budget for project ${input.projectId} was not found in mock data.`,
        'not_found',
      )
    }

    writeBudgetOverrides([
      ...readBudgetOverrides().filter((override) => override.projectId !== input.projectId),
      input,
    ])

    return { ...budget, plannedAmount: input.plannedAmount }
  }

  async getAlerts(projectId?: string): Promise<AlertRecord[]> {
    await this.wait()
    // TODO(ALERTS): Evaluate rules through the backend rule engine.
    return projectId ? mockAlerts.filter((alert) => alert.projectId === projectId) : mockAlerts
  }

  async getAlertsForRole(role: PrototypeRole, projectId?: string): Promise<AlertRecord[]> {
    await this.wait()

    if (!can(role, 'alerts.outcome.log')) {
      return []
    }

    const scopedAlerts = scopeProjectRecordsForRole(mockAlerts, role)
    return projectId ? scopedAlerts.filter((alert) => alert.projectId === projectId) : scopedAlerts
  }

  async getAnalyticsLocations(): Promise<AnalyticsLocationRecord[]> {
    await this.wait()
    // TODO(BACKEND): Replace aggregate mock coverage locations with approved GIS summaries.
    return mockAnalyticsLocations
  }

  async getRecommendations(): Promise<RecommendationRecord[]> {
    await this.wait()
    return mockRecommendations
  }

  async getRecommendationsForRole(role: PrototypeRole): Promise<RecommendationRecord[]> {
    await this.wait()
    const visibleAlertIds = new Set((await this.getAlertsForRole(role)).map((alert) => alert.id))

    return mockRecommendations.filter((recommendation) =>
      visibleAlertIds.has(recommendation.alertId),
    )
  }

  async getRules(): Promise<RuleDefinition[]> {
    await this.wait()
    // TODO(BACKEND): Persist rule definitions and lifecycle transitions.
    return mockRules
  }

  async getReports(projectId?: string): Promise<ReportRecord[]> {
    await this.wait()
    return projectId ? mockReports.filter((report) => report.projectId === projectId) : mockReports
  }

  async getSurveyForms(projectId?: string): Promise<SurveyFormDefinition[]> {
    await this.wait()
    return projectId
      ? mockSurveyForms.filter((form) => form.projectId === projectId)
      : mockSurveyForms
  }

  async getSurveyAggregateResults(
    filters: SurveyAggregateFilters = {},
  ): Promise<SurveyAggregateResultSet[]> {
    await this.wait()
    // TODO(BACKEND): Query approved aggregate survey result sets from form submissions.
    // No individual response or Beneficiary identity fields are returned by this prototype method.
    return mockSurveyAggregateResults.filter(
      (result) =>
        (!filters.formId || result.formId === filters.formId) &&
        (!filters.projectId || result.projectId === filters.projectId) &&
        (!filters.location || result.location === filters.location) &&
        (!filters.responseDate || result.responseDate === filters.responseDate) &&
        (!filters.reportingPeriod || result.reportingPeriod === filters.reportingPeriod),
    )
  }

  async getPublicProjects(): Promise<PublicProjectRecord[]> {
    await this.wait()
    // TODO(BACKEND): Load approved public project fields.
    // TODO(RBAC): Require internal approval before publication.
    // TODO(DATABASE): Apply public visibility configuration.
    return mockPublicProjects
  }

  async getPublicProject(id: string): Promise<PublicProjectRecord> {
    await this.wait()
    // TODO(BACKEND): Load approved public project fields.
    // TODO(RBAC): Require internal approval before publication.
    // TODO(DATABASE): Apply public visibility configuration.
    const project = mockPublicProjects.find((item) => item.id === id)

    if (!project) {
      throw new PathwaysClientError(`Public project ${id} was not found in mock data.`, 'not_found')
    }

    return project
  }

  async getUsers(): Promise<UserRecord[]> {
    await this.wait()
    return readPrototypeUserRecords(mockUsers)
  }

  async getDashboard(role: string): Promise<RoleDashboardViewModel> {
    await this.wait()

    if (role in mockDashboards) {
      return mockDashboards[role as PrototypeRole]
    }

    return fallbackDashboard
  }
}

// TODO(BACKEND): Replace mock implementation with NestJS API request.
// TODO(BACKEND): Replace role-dashboard mock data with aggregated API responses.
export const pathwaysClient: PathwaysClient = new MockPathwaysClient()
