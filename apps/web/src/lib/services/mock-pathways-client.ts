import {
  defaultTransparencySections,
  fallbackDashboard,
  mockActivities,
  mockAlerts,
  mockBeneficiaries,
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
  mockRecommendationOutcomes,
  mockRecommendations,
  mockReports,
  mockRules,
  mockTransparencySections,
  mockUsers,
} from '@/mocks/pathways'
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
import type { PrototypeRole } from '@/types/prototype-role'

import { type PathwaysClient, PathwaysClientError } from './pathways-client'

const PROJECT_STORAGE_KEY = 'pathways.prototypeProjects'
const ACTIVITY_STORAGE_KEY = 'pathways.prototypeActivities'
let inMemoryPrototypeProjects: ProjectDetail[] = []
let inMemoryPrototypeActivities: Activity[] = []

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

const allProjects = () => [...mockProjects, ...readStoredProjects()]

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

const roleProjectIds: Record<PrototypeRole, string[] | 'all'> = {
  'Program Manager': 'all',
  'Project Manager': ['futuremakers-ncr', 'youth-rise-western-samar', 'safe-spaces-northern-samar'],
  'Monitoring and Evaluation Officer': [
    'futuremakers-ncr',
    'grassroots-centers-navotas',
    'safe-spaces-northern-samar',
  ],
  'Project Officer': [
    'futuremakers-ncr',
    'youth-rise-western-samar',
    'grassroots-centers-navotas',
    'girls-lead-metro-manila',
    'safe-spaces-northern-samar',
  ],
  'System Administrator': 'all',
}

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
    const projectIds = roleProjectIds[role as PrototypeRole]

    if (!projectIds || projectIds === 'all') {
      return projects
    }

    return projects.filter(
      (project) => projectIds.includes(project.id) || project.id.startsWith('prototype-'),
    )
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

  async getBeneficiaries(filters: BeneficiaryFilters = {}): Promise<Beneficiary[]> {
    await this.wait()

    return mockBeneficiaries.filter((beneficiary) => {
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
  }

  async getBeneficiaryRecords(filters: BeneficiaryFilters = {}): Promise<BeneficiaryRecord[]> {
    await this.wait()
    // TODO(RBAC): Restrict access to beneficiary-sensitive data.

    return mockBeneficiaryRecords.filter((beneficiary) => {
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
  }

  async getBeneficiaryRecord(id: string): Promise<BeneficiaryRecord> {
    await this.wait()
    // TODO(RBAC): Restrict access to beneficiary-sensitive data.
    const beneficiary = mockBeneficiaryRecords.find((record) => record.id === id)

    if (!beneficiary) {
      throw new PathwaysClientError(`Beneficiary ${id} was not found in mock data.`, 'not_found')
    }

    return beneficiary
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
    return projectId ? mockBudgets.filter((budget) => budget.projectId === projectId) : mockBudgets
  }

  async getAlerts(projectId?: string): Promise<AlertRecord[]> {
    await this.wait()
    // TODO(ALERTS): Evaluate rules through the backend rule engine.
    return projectId ? mockAlerts.filter((alert) => alert.projectId === projectId) : mockAlerts
  }

  async getRecommendations(): Promise<RecommendationRecord[]> {
    await this.wait()
    return mockRecommendations
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

  async getUsers(): Promise<UserRecord[]> {
    await this.wait()
    return mockUsers
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
