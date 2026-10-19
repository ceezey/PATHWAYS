// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { sourceMutationTickets } from '@/lib/api/core/source-mutation'
import { projectsClient } from './projects'

const projectId = '73500000-0000-4000-8000-000000000001'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const row = {
  id: projectId,
  code: 'CRL-NS-2026',
  title: 'Community Resilience',
  description: 'Purpose',
  objectives: null,
  implementationArea: 'Metro Manila',
  implementingPartners: null,
  implementingPartnerRecords: [{ id: 'partner-1', name: 'Partner One', extra: 'dropped' }],
  sector: 'Health',
  targetBeneficiaries: 250,
  projectBudget: '1000.00',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'ONGOING',
  programId: null,
  programManagerId: null,
  programManager: null,
  projectManagerId: 'pm-1',
  projectManager: 'Ana Cruz',
  monitoringOfficerId: null,
  monitoringOfficer: null,
  projectOfficerIds: ['po-1'],
  projectOfficers: ['Ben Reyes'],
  team: [{ userId: 'pm-1', fullName: 'Ana Cruz', role: 'PROJECT_MANAGER' }],
  updatedAt: '2026-10-01T00:00:00.000Z',
}

describe('projectsClient', () => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    requestFoundation.mockReset()
  })

  it.each([
    ['ONGOING', 'Active', 'On Track'],
    ['COMPLETED', 'Completed', 'On Track'],
    ['PLANNED', 'Planned', 'On Track'],
    ['ON_HOLD', 'Needs Attention', 'At Risk'],
    ['CANCELLED', 'Needs Attention', 'At Risk'],
  ])('maps the stored status %s to %s with health %s', async (stored, status, health) => {
    requestFoundation.mockResolvedValue({ ...row, status: stored })
    const project = await projectsClient.getProject(projectId)
    expect(project).toMatchObject({ status, health, storedStatus: stored })
  })

  it('maps a full project row to the detail view model', async () => {
    requestFoundation.mockResolvedValue(row)
    const project = await projectsClient.getProject(projectId)
    expect(project).toEqual({
      id: projectId,
      code: 'CRL-NS-2026',
      title: 'Community Resilience',
      description: 'Purpose',
      objectives: '',
      implementingPartners: null,
      implementingPartnerRecords: [{ id: 'partner-1', name: 'Partner One' }],
      projectBudget: '1000.00',
      area: 'Metro Manila',
      sector: 'Health',
      status: 'Active',
      storedStatus: 'ONGOING',
      health: 'On Track',
      period: '2026-01-01 to 2026-12-31',
      projectManager: 'Ana Cruz',
      programManager: 'Not assigned',
      programManagerId: null,
      projectManagerId: 'pm-1',
      team: [{ userId: 'pm-1', fullName: 'Ana Cruz', role: 'PROJECT_MANAGER' }],
      monitoringOfficer: 'Not assigned',
      monitoringOfficerId: null,
      projectOfficers: ['Ben Reyes'],
      projectOfficerIds: ['po-1'],
      targetBeneficiaries: 250,
      budgetCode: 'Not recorded',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      updatedAt: '2026-10-01T00:00:00.000Z',
      programId: null,
    })
  })

  it('fills the display defaults for a summary row and keeps an absent target undefined', async () => {
    requestFoundation.mockResolvedValue([
      { id: projectId, code: 'A-1', title: 'Summary only', status: 'PLANNED' },
    ])
    const [project] = await projectsClient.getProjects()
    expect(project).toMatchObject({
      description: '',
      area: 'Area not recorded',
      sector: 'Sector not recorded',
      period: 'Dates not recorded',
      projectManager: 'Not assigned',
      projectOfficers: [],
      targetBeneficiaries: undefined,
    })
  })

  it('reads the list with the abort signal and rejects a list over 100 rows or a non-list', async () => {
    const signal = new AbortController().signal
    requestFoundation.mockResolvedValue([])
    await projectsClient.getProjects(signal)
    expect(requestFoundation).toHaveBeenCalledWith('/projects', { signal })
    requestFoundation.mockResolvedValue(Array.from({ length: 101 }, () => row))
    await expect(projectsClient.getProjects()).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid project response.',
    })
    requestFoundation.mockResolvedValue({ projects: [] })
    await expect(projectsClient.getProjects()).rejects.toBeInstanceOf(PathwaysClientError)
  })

  it('reads the same list for every role', async () => {
    requestFoundation.mockResolvedValue([row])
    await projectsClient.getProjectsForRole('Grant Manager')
    expect(requestFoundation).toHaveBeenCalledTimes(1)
    expect(requestFoundation).toHaveBeenCalledWith('/projects', { signal: undefined })
  })

  it('encodes the project id in the detail path', async () => {
    requestFoundation.mockResolvedValue(row)
    const signal = new AbortController().signal
    await projectsClient.getProject('a/b c', signal)
    expect(requestFoundation).toHaveBeenCalledWith('/projects/a%2Fb%20c', { signal })
  })

  it('creates with the stored status and the other fields unchanged', async () => {
    requestFoundation.mockResolvedValue(row)
    await projectsClient.createProject({
      title: 'New',
      status: 'Needs Attention',
      sector: 'Health',
    })
    expect(requestFoundation).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'New', status: 'ON_HOLD', sector: 'Health' }),
    })
  })

  it.each([
    ['Active', 'ONGOING'],
    ['Planned', 'PLANNED'],
    ['Completed', 'COMPLETED'],
    ['CANCELLED', 'CANCELLED'],
  ] as const)(
    'updates with status %s sent as %s through the source mutation',
    async (status, sent) => {
      requestFoundation.mockImplementation(async (_path: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { clientMutationId: string }
        return {
          ...row,
          sourceAcknowledgement: {
            requestId: body.clientMutationId,
            committed: true,
            replayed: false,
          },
        }
      })
      const result = await projectsClient.updateProject(
        projectId,
        { title: 'Edited', status, expectedUpdatedAt: row.updatedAt },
        context,
      )
      expect(result).toMatchObject({ id: projectId, status: 'Active' })
      const [path, init, isCurrent] = requestFoundation.mock.calls[0]
      expect(path).toBe(`/projects/${projectId}`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body)).toMatchObject({ title: 'Edited', status: sent })
      expect(isCurrent).toBe(context.isCurrent)
    },
  )

  it('refuses an update without a mutation context', async () => {
    await expect(
      projectsClient.updateProject(projectId, {
        title: 'Edited',
        status: 'Active',
        expectedUpdatedAt: row.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(requestFoundation).not.toHaveBeenCalled()
  })

  it('archives with a bodyless POST and returns the answer', async () => {
    requestFoundation.mockResolvedValue({ id: projectId, archivedAt: '2026-10-01T00:00:00.000Z' })
    await expect(projectsClient.archiveProject(projectId)).resolves.toEqual({
      id: projectId,
      archivedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/archive`, {
      method: 'POST',
    })
  })

  it('rejects an overview metrics answer that does not match the contract', async () => {
    requestFoundation.mockResolvedValue({ unexpected: true })
    await expect(projectsClient.getProjectOverviewMetrics(projectId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid project overview response.',
    })
    expect(requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/overview-metrics`, {
      signal: undefined,
    })
  })

  it('parses the project map and rejects a payload that breaks the contract', async () => {
    const signal = new AbortController().signal
    const map = {
      contractVersion: 'analytics.project-map.v1',
      generatedAt: '2026-10-01T00:00:00.000Z',
      projects: [],
      unmappedCount: 0,
    }
    requestFoundation.mockResolvedValue(map)
    await expect(projectsClient.getProjectMap(signal)).resolves.toEqual(map)
    expect(requestFoundation).toHaveBeenCalledWith('/analytics/project-map', { signal })
    requestFoundation.mockResolvedValue({ ...map, extra: true })
    await expect(projectsClient.getProjectMap(signal)).rejects.toThrow()
  })
})
