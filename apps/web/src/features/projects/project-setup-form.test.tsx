/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'
import type { ProjectDetail } from '@/types/pathways'

const testState = vi.hoisted(() => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  getUsers: vi.fn(),
  refreshAccess: vi.fn(),
  routerPush: vi.fn(),
  updateProject: vi.fn(),
  callOrder: [] as string[],
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: testState.routerPush }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class PathwaysClientError extends Error {},
  pathwaysClient: {
    createProject: testState.createProject,
    getProject: testState.getProject,
    getUsers: testState.getUsers,
    updateProject: testState.updateProject,
  },
}))

const profileState = {
  userId: 'actor-a',
  organizationId: 'org-a',
  roles: ['PROJECT_MANAGER'],
  permissions: [
    'projects.create',
    'projects.update',
    'budgets.create',
    'budgets.update',
    'budgets.read',
  ],
  assignedProjectIds: ['73500000-0000-4000-8000-000000000004'],
}
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: profileState, refreshAccess: testState.refreshAccess }),
}))
import { ProjectSetupForm } from './project-setup-form'

const project: ProjectDetail = {
  id: '73500000-0000-4000-8000-000000000004',
  code: 'PRJ-73500000-0000-4000-8000-000000000004',
  title: 'Persisted project',
  description: 'Persisted project description.',
  area: 'Navotas',
  sector: 'Sector not recorded',
  status: 'Planned',
  storedStatus: 'PLANNED',
  health: 'On Track',
  period: '2026-10-01 - 2026-12-31',
  projectManager: 'Synthetic manager',
  programManager: 'Not assigned',
  monitoringOfficer: 'Not assigned',
  projectOfficers: [],
  targetBeneficiaries: 0,

  budgetCode: 'Not recorded',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  updatedAt: '2026-09-23T00:00:00.000Z',
  programId: null,
}

beforeEach(() => {
  testState.callOrder = []
  testState.createProject.mockReset().mockResolvedValue(project)
  testState.getProject.mockReset().mockResolvedValue(project)
  testState.getUsers.mockReset().mockResolvedValue([])
  testState.updateProject.mockReset().mockResolvedValue({ ...project, title: 'Updated project' })
  testState.routerPush.mockReset().mockImplementation(() => {
    testState.callOrder.push('routerPush')
  })
  testState.refreshAccess.mockReset().mockImplementation(() => {
    testState.callOrder.push('refreshAccess')
    return Promise.resolve()
  })
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('ProjectSetupForm', () => {
  it('does not render an Objectives field', () => {
    render(<ProjectSetupForm />)

    expect(screen.queryByLabelText(/Objectives/)).toBeNull()
  })

  it('places the project title as the first field in the form', () => {
    render(<ProjectSetupForm />)

    const firstField = document.querySelector('form')?.querySelector('input, select')
    expect(firstField).toBe(screen.getByLabelText(/Project title/))
  })

  it('saves the activated server-backed project profile fields', async () => {
    render(<ProjectSetupForm />)
    expect(screen.queryByLabelText(/Project target goal/)).toBeNull()

    // One structured partner field; the legacy free-text input is gone.
    expect((screen.getByLabelText('Implementing partners') as HTMLTextAreaElement).disabled).toBe(
      false,
    )
    expect(screen.getAllByLabelText(/Implementing partner/)).toHaveLength(1)
    expect(screen.queryByLabelText('Implementing partner organizations')).toBeNull()
    expect((screen.getByLabelText('Project budget (PHP)') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Target beneficiaries') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Sector') as HTMLInputElement).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText(/Project title/), {
      target: { value: 'Core project profile' },
    })
    fireEvent.change(screen.getByLabelText('Project budget (PHP)'), {
      target: { value: '125000.50' },
    })
    fireEvent.change(screen.getByLabelText('Target beneficiaries'), {
      target: { value: '450' },
    })
    fireEvent.change(screen.getByLabelText('Sector'), {
      target: { value: 'Education' },
    })
    fireEvent.change(screen.getByLabelText(/Implementation area/), {
      target: { value: 'Navotas' },
    })
    fireEvent.change(screen.getByLabelText(/Start date/), {
      target: { value: '2026-10-01' },
    })
    fireEvent.change(screen.getByLabelText(/End date/), {
      target: { value: '2026-12-31' },
    })
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'A supported core project profile.' },
    })
    fireEvent.change(screen.getByLabelText('Implementing partners'), {
      target: { value: 'Synthetic Partner A\nSynthetic Partner B' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    await waitFor(() => expect(testState.createProject).toHaveBeenCalledTimes(1))
    expect(testState.createProject).toHaveBeenCalledWith({
      title: 'Core project profile',
      description: 'A supported core project profile.',
      implementingPartnerNames: ['Synthetic Partner A', 'Synthetic Partner B'],
      projectBudget: '125000.50',
      targetBeneficiaries: 450,

      sector: 'Education',
      implementationArea: 'Navotas',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'Planned',
    })
    await waitFor(() =>
      expect(testState.routerPush).toHaveBeenCalledWith(`/projects/${project.id}`),
    )
    expect(testState.refreshAccess).toHaveBeenCalledTimes(1)
    expect(testState.callOrder).toEqual(['refreshAccess', 'routerPush'])
  })

  it('loads and updates an existing project with its code and optimistic revision', async () => {
    render(<ProjectSetupForm projectId={project.id} />)

    const title = await screen.findByDisplayValue(project.title)
    expect(screen.queryByLabelText(/Project target goal/)).toBeNull()
    fireEvent.change(title, { target: { value: 'Updated project' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }))

    await waitFor(() => expect(testState.updateProject).toHaveBeenCalledTimes(1))
    expect(testState.updateProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        code: project.code,
        title: 'Updated project',
        expectedUpdatedAt: project.updatedAt,
        status: 'Planned',
      }),
      expect.objectContaining({
        principalKey: expect.any(String),
        isCurrent: expect.any(Function),
      }),
    )
    expect(testState.updateProject.mock.calls[0][2].isCurrent()).toBe(true)
    expect(testState.routerPush).toHaveBeenCalledWith(`/projects/${project.id}`)
  })
})

describe('locked project budget', () => {
  afterEach(() => {
    profileState.permissions = [
      'projects.create',
      'projects.update',
      'budgets.create',
      'budgets.update',
      'budgets.read',
    ]
  })

  it('locks the budget for an editor without budgets.update and never sends it', async () => {
    profileState.permissions = ['projects.create', 'projects.update', 'budgets.read']
    testState.getProject.mockResolvedValue({ ...project, projectBudget: '5000.00' })
    render(<ProjectSetupForm projectId={project.id} />)
    const title = await screen.findByDisplayValue(project.title)
    const budget = screen.getByRole('textbox', { name: 'Project budget (PHP)' }) as HTMLInputElement
    expect(budget.value).toBe('5000.00')
    expect(budget.getAttribute('aria-disabled')).toBe('true')
    expect(
      document.getElementById(budget.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('You are not authorized to change this field')
    fireEvent.change(title, { target: { value: 'Updated project' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }))
    await waitFor(() => expect(testState.updateProject).toHaveBeenCalledOnce())
    expect(testState.updateProject.mock.calls[0][1].projectBudget).toBeUndefined()
  })

  it('omits an unreadable budget instead of showing it locked', async () => {
    profileState.permissions = ['projects.create', 'projects.update']
    render(<ProjectSetupForm projectId={project.id} />)
    await screen.findByDisplayValue(project.title)
    expect(screen.queryByLabelText('Project budget (PHP)')).toBeNull()
  })
})

describe('retired project draft fields', () => {
  it('restores allowed owned fields and never sends a retired goal from an older draft', async () => {
    const key = sensitiveDraftKey('project', {
      organizationId: 'org-a',
      userId: 'actor-a',
      projectId: null,
      resourceId: null,
    })
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        projectId: null,
        title: 'Recovered project',
        objectives: 'Recovered objectives',
        description: 'Recovered valid description.',
        area: 'Navotas',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        status: 'Planned',
        targetBeneficiaries: '30',
        targetGoal: '75.1234',
      }),
    )
    render(<ProjectSetupForm />)
    await screen.findByDisplayValue('Recovered project')
    expect(screen.queryByLabelText(/Project target goal/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))
    await waitFor(() => expect(testState.createProject).toHaveBeenCalledOnce())
    expect(testState.createProject.mock.calls[0]?.[0]).not.toHaveProperty('targetGoal')
    expect(testState.createProject.mock.calls[0]?.[0].targetBeneficiaries).toBe(30)
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
})
