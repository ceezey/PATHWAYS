/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectDetail } from '@/types/pathways'

const testState = vi.hoisted(() => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  routerPush: vi.fn(),
  updateProject: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: testState.routerPush }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class PathwaysClientError extends Error {},
  pathwaysClient: {
    createProject: testState.createProject,
    getProject: testState.getProject,
    updateProject: testState.updateProject,
  },
}))

import { ProjectSetupForm } from './project-setup-form'

const project: ProjectDetail = {
  id: '73500000-0000-4000-8000-000000000004',
  code: 'PRJ-73500000-0000-4000-8000-000000000004',
  title: 'Persisted project',
  description: 'Persisted project description.',
  objectives: 'Persisted project objectives.',
  area: 'Navotas',
  sector: 'Sector not recorded',
  status: 'Planned',
  storedStatus: 'PLANNED',
  health: 'On Track',
  period: '2026-10-01 - 2026-12-31',
  projectManager: 'Synthetic manager',
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
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
  testState.createProject.mockReset().mockResolvedValue(project)
  testState.getProject.mockReset().mockResolvedValue(project)
  testState.updateProject.mockReset().mockResolvedValue({ ...project, title: 'Updated project' })
  testState.routerPush.mockReset()
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('ProjectSetupForm', () => {
  it('saves supported core fields while deferred fields and team controls remain unavailable', async () => {
    render(<ProjectSetupForm />)

    expect((screen.getByLabelText('Implementing partners') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Project budget (PHP)') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Target beneficiaries') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Sector') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getAllByText(/Team assignment changes are unavailable/)).toHaveLength(4)

    fireEvent.change(screen.getByLabelText(/Objectives/), {
      target: { value: 'Deliver core project outcomes' },
    })
    fireEvent.change(screen.getByLabelText(/Project title/), {
      target: { value: 'Core project profile' },
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
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    await waitFor(() => expect(testState.createProject).toHaveBeenCalledTimes(1))
    expect(testState.createProject).toHaveBeenCalledWith({
      title: 'Core project profile',
      description: 'A supported core project profile.',
      objectives: 'Deliver core project outcomes',
      implementationArea: 'Navotas',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'Planned',
    })
    expect(testState.routerPush).toHaveBeenCalledWith(`/projects/${project.id}`)
  })

  it('loads and updates an existing project with its code and optimistic revision', async () => {
    render(<ProjectSetupForm projectId={project.id} />)

    const title = await screen.findByDisplayValue(project.title)
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
    )
    expect(testState.routerPush).toHaveBeenCalledWith(`/projects/${project.id}`)
  })
})
