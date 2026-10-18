import {
  type ArchiveProjectResponse,
  type ProjectMap,
  type ProjectOverviewMetrics,
  type ProjectResponse,
  type StoredProjectStatus,
  projectMapSchema,
  projectOverviewMetricsSchema,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { SourceMutationContext, SourceMutationResult } from '@/lib/api/core/source-mutation'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import type {
  CreateProjectInput,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  UpdateProjectInput,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

function apiProjectStatus(status: ProjectStatus | StoredProjectStatus): StoredProjectStatus {
  switch (status) {
    case 'Active':
      return 'ONGOING'
    case 'Needs Attention':
      return 'ON_HOLD'
    case 'Planned':
      return 'PLANNED'
    case 'Completed':
      return 'COMPLETED'
    default:
      return status
  }
}

function mapProject(project: ProjectResponse): ProjectDetail {
  const status: ProjectStatus =
    project.status === 'ONGOING'
      ? 'Active'
      : project.status === 'COMPLETED'
        ? 'Completed'
        : project.status === 'PLANNED'
          ? 'Planned'
          : 'Needs Attention'
  const period =
    [project.startDate, project.endDate].filter(Boolean).join(' to ') || 'Dates not recorded'
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description ?? '',
    objectives: project.objectives ?? '',
    implementingPartners: project.implementingPartners,
    implementingPartnerRecords: (project.implementingPartnerRecords ?? []).map(({ id, name }) => ({
      id,
      name,
    })),
    projectBudget: project.projectBudget,

    area: project.implementationArea ?? 'Area not recorded',
    sector: project.sector ?? 'Sector not recorded',
    status,
    storedStatus: project.status,
    health: status === 'Needs Attention' ? 'At Risk' : 'On Track',
    period,
    projectManager: project.projectManager ?? 'Not assigned',
    programManager: project.programManager ?? 'Not assigned',
    programManagerId: project.programManagerId,
    projectManagerId: project.projectManagerId,
    team: project.team,
    monitoringOfficer: project.monitoringOfficer ?? 'Not assigned',
    monitoringOfficerId: project.monitoringOfficerId,
    projectOfficers: project.projectOfficers ?? [],
    projectOfficerIds: project.projectOfficerIds ?? [],
    targetBeneficiaries: project.targetBeneficiaries ?? undefined,
    budgetCode: 'Not recorded',
    startDate: project.startDate,
    endDate: project.endDate,
    updatedAt: project.updatedAt,
    programId: project.programId,
  }
}

// Summary rows from a reader without projects.detail.read go through the same mapper.
function parseProjects(value: unknown) {
  if (!Array.isArray(value) || value.length > 100)
    throw new PathwaysClientError('Invalid project response.', 'network')
  return value.map((row) => mapProject(row as ProjectResponse))
}

export const projectsClient = {
  async getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
    return requestFoundation('/projects', { signal }).then(parseProjects)
  },

  async getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]> {
    return projectsClient.getProjects()
  },

  async getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
    return mapProject(
      (await requestFoundation(`/projects/${encodeURIComponent(id)}`, {
        signal,
      })) as ProjectResponse,
    )
  },

  async createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    const status = apiProjectStatus(input.status)
    return mapProject(
      (await requestFoundation('/projects', {
        method: 'POST',
        body: JSON.stringify({ ...input, status }),
      })) as ProjectResponse,
    )
  },

  async updateProject(
    id: string,
    input: UpdateProjectInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(id)}`,
      'PATCH',
      { ...input, status: apiProjectStatus(input.status) },
      context,
      (value) => mapProject(value as ProjectResponse),
    )
  },

  async archiveProject(id: string): Promise<ArchiveProjectResponse> {
    return (await requestFoundation(`/projects/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    })) as ArchiveProjectResponse
  },

  async getProjectOverviewMetrics(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectOverviewMetrics> {
    const parsed = projectOverviewMetricsSchema.safeParse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/overview-metrics`, {
        signal,
      }),
    )
    if (!parsed.success)
      throw new PathwaysClientError('Invalid project overview response.', 'network')
    return parsed.data
  },

  async getProjectMap(signal: AbortSignal): Promise<ProjectMap> {
    return projectMapSchema.parse(await requestFoundation('/analytics/project-map', { signal }))
  },
}
